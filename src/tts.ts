// Edge TTS 核心逻辑：从旧 worker.js 逐行移植（行为不变）。
// 微软 Translator 端点换取 token → 拼 SSML → cognitiveservices/v1 合成 → 按 2000 字分块拼接 MP3。
// 改这里会影响 /v1/audio/speech 的兼容性，改之前先看 README 的 API 文档。
import { OPENAI_VOICE_MAP } from "./shared/presets.ts";

const TOKEN_REFRESH_BEFORE_EXPIRY = 5 * 60;
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const CHUNK_SIZE = 2000;

interface Endpoint { r: string; t: string; [k: string]: unknown }
let tokenInfo: { endpoint: Endpoint | null; token: string | null; expiredAt: number | null } = { endpoint: null, token: null, expiredAt: null };

/** 上游合成失败；message 与旧版一致（"Edge TTS API error: <status>"），status 供界面加中文简注。 */
export class UpstreamError extends Error {
  status: number;
  constructor(status: number) {
    super("Edge TTS API error: " + status);
    this.status = status;
  }
}

export const CORS = { "Access-Control-Allow-Origin": "*" };

/** OpenAI 风格的错误响应（/v1/* 用，保持旧格式）。 */
export function errorResponse(message: string, status: number, code: string): Response {
  return new Response(JSON.stringify({ error: { message, type: "api_error", code } }), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function generateUserIdFromDomain(requestUrl: string): string {
  try {
    const domain = new URL(requestUrl).hostname;
    let hash = 0;
    for (let i = 0; i < domain.length; i++) {
      hash = (hash << 5) - hash + domain.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, "0") + Math.abs(hash * 31).toString(16).padStart(8, "0");
  } catch {
    return "0f04d16a175c411e";
  }
}

export function timingSafeEqual(a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export interface CleanOpts {
  remove_markdown: boolean;
  remove_emoji: boolean;
  remove_urls: boolean;
  remove_line_breaks: boolean;
  remove_citation_numbers: boolean;
  custom_keywords: string;
}

/**
 * 旧 handleSpeechRequest 去掉 method 检查和 JSON 解析后的部分。body 是已解析的 JSON。
 * 返回 audio/mpeg（或 400）；上游失败抛 UpstreamError，其他异常原样抛出（调用方转 500）。
 */
export async function synthesize(body: any, requestUrl: string): Promise<Response> {
  if (!body.input) return errorResponse("'input' is a required parameter.", 400, "invalid_request_error");

  const model: string = body.model || "tts-1";
  const input: string = body.input;
  const voice: string | undefined = body.voice;
  const speed: number = body.speed !== undefined ? body.speed : 1.0;
  const pitch: number = body.pitch !== undefined ? body.pitch : 1.0;
  const style: string = body.style || "general";
  const role: string = body.role || "";
  const styleDegree: number = body.styleDegree !== undefined ? body.styleDegree : 1.0;
  const stream: boolean = body.stream || false;
  const cleaning_options = body.cleaning_options || {};

  let finalVoice: string;
  if (model === "tts-1" || model === "tts-1-hd") {
    finalVoice = OPENAI_VOICE_MAP[voice as string] || voice || "zh-CN-XiaoxiaoNeural";
  } else if (model.startsWith("tts-1-")) {
    finalVoice = OPENAI_VOICE_MAP[model.replace("tts-1-", "")] || "zh-CN-XiaoxiaoNeural";
  } else {
    finalVoice = voice || model || "zh-CN-XiaoxiaoNeural";
  }

  const opts: CleanOpts = {
    remove_markdown: cleaning_options.remove_markdown !== undefined ? cleaning_options.remove_markdown : true,
    remove_emoji: cleaning_options.remove_emoji !== undefined ? cleaning_options.remove_emoji : true,
    remove_urls: cleaning_options.remove_urls !== undefined ? cleaning_options.remove_urls : true,
    remove_line_breaks: cleaning_options.remove_line_breaks || false,
    remove_citation_numbers: cleaning_options.remove_citation_numbers !== undefined ? cleaning_options.remove_citation_numbers : true,
    custom_keywords: cleaning_options.custom_keywords || "",
  };
  const cleanedInput = cleanText(input, opts);
  const rate = ((speed - 1) * 100).toFixed(0);
  const numPitch = ((pitch - 1) * 100).toFixed(0);
  const v: VoiceArgs = { voiceName: finalVoice, rate, pitch: numPitch, style, role, styleDegree, requestUrl };

  if (stream) return getVoiceStream(cleanedInput, v);
  return getVoice(cleanedInput, v);
}

/** GET /v1/models（与旧版一致）。 */
export function modelsResponse(): Response {
  const models = [
    { id: "tts-1", object: "model", created: Date.now(), owned_by: "openai" },
    { id: "tts-1-hd", object: "model", created: Date.now(), owned_by: "openai" },
  ];
  for (const k of Object.keys(OPENAI_VOICE_MAP)) models.push({ id: "tts-1-" + k, object: "model", created: Date.now(), owned_by: "openai" });
  return new Response(JSON.stringify({ object: "list", data: models }), { headers: { "Content-Type": "application/json", ...CORS } });
}

// 智能分块：按句子边界切分，避免硬切
export function splitTextIntoChunks(text: string, maxChunkSize: number): string[] {
  const chunks: string[] = [];
  const sentenceBreaks = ["。", "！", "？", "；", "…", ".", "!", "?", "\n"];

  while (text.length > 0) {
    if (text.length <= maxChunkSize) {
      chunks.push(text);
      break;
    }
    const chunk = text.slice(0, maxChunkSize);
    let lastBreakIndex = -1;
    // 从后往前找句子边界
    for (let i = chunk.length - 1; i >= Math.floor(maxChunkSize * 0.5); i--) {
      if (sentenceBreaks.includes(chunk[i]!)) {
        lastBreakIndex = i;
        break;
      }
    }
    if (lastBreakIndex > 0) {
      chunks.push(text.slice(0, lastBreakIndex + 1));
      text = text.slice(lastBreakIndex + 1);
    } else {
      // 找不到句子边界，硬切
      chunks.push(chunk);
      text = text.slice(maxChunkSize);
    }
  }
  return chunks;
}

interface VoiceArgs { voiceName: string; rate: string; pitch: string; style: string; role: string; styleDegree: number; requestUrl: string }

async function getVoice(text: string, v: VoiceArgs): Promise<Response> {
  const chunks = splitTextIntoChunks(text, CHUNK_SIZE);
  const audioChunks: Blob[] = [];
  for (const c of chunks) audioChunks.push(await getAudioChunk(c, v));
  return new Response(new Blob(audioChunks, { type: "audio/mpeg" }), { headers: { "Content-Type": "audio/mpeg", ...CORS } });
}

async function getVoiceStream(text: string, v: VoiceArgs): Promise<Response> {
  const chunks = splitTextIntoChunks(text, CHUNK_SIZE);
  const transform = new TransformStream<Uint8Array, Uint8Array>();
  const writer = transform.writable.getWriter();

  (async () => {
    try {
      for (const c of chunks) {
        const blob = await getAudioChunk(c, v);
        await writer.write(new Uint8Array(await blob.arrayBuffer()));
      }
    } catch (e) {
      await writer.abort(e).catch(() => {});
    } finally {
      // 旧版 abort 后也会 close（会 reject）；这里吞掉这个 reject，避免未处理的 Promise 拒绝，对客户端无差别
      await writer.close().catch(() => {});
    }
  })();

  return new Response(transform.readable, { headers: { "Content-Type": "audio/mpeg", ...CORS } });
}

async function getAudioChunk(text: string, v: VoiceArgs): Promise<Blob> {
  const endpoint = await getEndpoint(v.requestUrl);
  const url = "https://" + endpoint.r + ".tts.speech.microsoft.com/cognitiveservices/v1";
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

  let content = '<prosody rate="' + v.rate + '%" pitch="' + v.pitch + '%">' + escaped + "</prosody>";
  if (v.style && v.style !== "general") {
    const attr = v.styleDegree !== 1.0 ? ' styledegree="' + v.styleDegree + '"' : "";
    content = '<mstts:express-as style="' + v.style + '"' + attr + ">" + content + "</mstts:express-as>";
  }
  if (v.role) content = '<mstts:express-as role="' + v.role + '">' + content + "</mstts:express-as>";

  const ssml =
    '<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" version="1.0" xml:lang="zh-CN"><voice name="' +
    v.voiceName + '">' + content + "</voice></speak>";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: endpoint.t,
      "Content-Type": "application/ssml+xml",
      "User-Agent": "okhttp/4.5.0",
      "X-Microsoft-OutputFormat": OUTPUT_FORMAT,
    },
    body: ssml,
  });
  if (!res.ok) throw new UpstreamError(res.status);
  return res.blob();
}

async function getEndpoint(requestUrl: string): Promise<Endpoint> {
  const now = Date.now() / 1000;
  // 检查缓存的 token 是否有效
  if (tokenInfo.token && tokenInfo.expiredAt && now < tokenInfo.expiredAt - TOKEN_REFRESH_BEFORE_EXPIRY) return tokenInfo.endpoint!;

  const endpointUrl = "https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0";
  const clientId = crypto.randomUUID().replace(/-/g, "");
  const userId = generateUserIdFromDomain(requestUrl);
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(endpointUrl, {
        method: "POST",
        headers: {
          "Accept-Language": "zh-Hans",
          "X-ClientVersion": "4.0.530a 5fe1dc6c",
          "X-UserId": userId,
          "X-HomeGeographicRegion": "zh-Hans-CN",
          "X-ClientTraceId": clientId,
          "X-MT-Signature": await sign(endpointUrl),
          "User-Agent": "okhttp/4.5.0",
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": "0",
          "Accept-Encoding": "gzip",
        },
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = (await res.json()) as Endpoint;
      const jwt = JSON.parse(atob(data.t.split(".")[1]!)) as { exp: number };
      tokenInfo = { endpoint: data, token: data.t, expiredAt: jwt.exp };
      return data;
    } catch (e) {
      lastError = e;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  // 所有重试都失败后的兜底逻辑
  if (tokenInfo.token) {
    // 强制标记为过期，下次请求会重新刷新
    tokenInfo.expiredAt = 0;
    return tokenInfo.endpoint!;
  }
  throw new Error("Failed to get endpoint: " + (lastError instanceof Error ? lastError.message : "unknown"));
}

async function sign(urlStr: string): Promise<string> {
  const url = urlStr.split("://")[1]!;
  const encodedUrl = encodeURIComponent(url);
  const uuid = crypto.randomUUID().replace(/-/g, "");
  const date = new Date().toUTCString().replace(/GMT/, "").trim() + " GMT";
  const toSign = ("MSTranslatorAndroidApp" + encodedUrl + date + uuid).toLowerCase();
  const keyStr = "oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw==";
  const keyBytes = Uint8Array.from(atob(keyStr), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBytes = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(toSign)));
  const sig = btoa(String.fromCharCode(...sigBytes));
  return "MSTranslatorAndroidApp::" + sig + "::" + date + "::" + uuid;
}

export function cleanText(text: string, opts: CleanOpts): string {
  let t = text;
  if (opts.remove_urls) t = t.replace(/(https?:\/\/[^\s]+)/g, "");
  if (opts.remove_markdown) {
    t = t
      .replace(/!\[.*?\]\(.*?\)/g, "")
      .replace(/\[(.*?)\]\(.*?\)/g, "$1")
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/(\*|_)(.*?)\1/g, "$2")
      .replace(/`{1,3}(.*?)`{1,3}/g, "$1")
      .replace(/#{1,6}\s/g, "");
  }
  if (opts.custom_keywords) {
    const kw = opts.custom_keywords.split(",").map((k) => k.trim()).filter((k) => k);
    if (kw.length) {
      const pattern = kw.map((k) => k.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|");
      t = t.replace(new RegExp(pattern, "g"), "");
    }
  }
  if (opts.remove_emoji) {
    t = t.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "");
  }
  if (opts.remove_citation_numbers) t = t.replace(/\[\d+\]/g, "").replace(/【\d+】/g, "");
  if (opts.remove_line_breaks) {
    t = t.replace(/(\r\n|\n|\r)/gm, "");
    return t.trim().replace(/\s+/g, " ");
  }
  return t.trim().replace(/[ \t]+/g, " ");
}
