// edgetts-cloudflare（语音合成 / Edge TTS）：把微软 Edge 朗读的 TTS 包装成 OpenAI 兼容接口。
//
// 外部 API（Bearer API_KEY，与旧 worker.js 完全兼容，CORS 全开）：
//   POST /v1/audio/speech        合成（model / input / voice / speed / pitch / style / role / styleDegree / stream / cleaning_options）
//   GET  /v1/models              模型列表（tts-1、tts-1-hd、tts-1-<预设>）
//   GET  /v1/voices              音色目录（src/shared/voices.ts）+ 6 个预设
// 网页（Google 登录）：
//   GET  /                       前端（React + Kumo）
//   GET  /auth/login | /auth/callback, POST /auth/logout
//   GET  /api/me
//   POST /api/speech             与 /v1/audio/speech 同参数，靠 session cookie 鉴权（不需要 API key）
import { callback, getUser, login, logout } from "./auth.ts";
import { googleConfigured, webMaxChars, type Env } from "./env.ts";
import { renderPage } from "./html.ts";
import { OPENAI_VOICE_MAP, PRESET_LABEL } from "./shared/presets.ts";
import { statusLabel } from "./shared/status.ts";
import type { LoginError, PageData } from "./shared/types.ts";
import { VOICES } from "./shared/voices.ts";
import { CORS, errorResponse, modelsResponse, synthesize, timingSafeEqual, UpstreamError } from "./tts.ts";

const LOGIN_ERRORS = new Set<LoginError>(["unconfigured", "denied", "state", "token", "id_token", "unverified", "forbidden"]);

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

const sameOrigin = (req: Request) => {
  const o = req.headers.get("Origin");
  return o === null ? req.method === "GET" || req.method === "HEAD" : o === new URL(req.url).origin;
};

/** /v1/*：与旧版相同的鉴权、路由与错误格式。 */
async function handleV1(req: Request, env: Env, path: string): Promise<Response> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return errorResponse("Missing or invalid authorization header.", 401, "invalid_api_key");
  const providedKey = authHeader.slice(7);
  if (!env.API_KEY) return errorResponse("API key not configured on server.", 500, "server_config_error");
  if (!timingSafeEqual(providedKey, env.API_KEY)) return errorResponse("Invalid API key.", 403, "invalid_api_key");

  try {
    if (path === "/v1/audio/speech") {
      if (req.method !== "POST") return errorResponse("Method Not Allowed", 405, "method_not_allowed");
      return await synthesize(await req.json(), req.url);
    }
    if (path === "/v1/models") return modelsResponse();
    if (path === "/v1/voices") {
      const presets = Object.keys(OPENAI_VOICE_MAP).map((id) => ({ id, voice: OPENAI_VOICE_MAP[id], label: PRESET_LABEL[id] }));
      return new Response(JSON.stringify({ object: "list", total: VOICES.length, presets, data: VOICES }), {
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600", ...CORS },
      });
    }
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : String(err), 500, "internal_server_error");
  }
  return errorResponse("Not Found", 404, "not_found");
}

/** POST /api/speech：网页端合成，session 鉴权，中文错误。 */
async function webSpeech(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return json({ error: `只支持 POST（${statusLabel(405)}）` }, 405);
  const user = await getUser(req, env);
  if (!user) return json({ error: `请先登录（${statusLabel(401)}）`, code: "unauthorized" }, 401);
  if (!sameOrigin(req)) return json({ error: `来源不合法（${statusLabel(403)}）` }, 403);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: `请求体需要是 JSON 对象（${statusLabel(400)}）` }, 400);
  if (typeof body.input !== "string" || !body.input.trim()) return json({ error: `请输入要合成的文本（${statusLabel(400)}）` }, 400);
  const max = webMaxChars(env);
  if (body.input.length > max) return json({ error: `文本太长：网页端单次最多 ${max} 字（${statusLabel(413)}）` }, 413);
  try {
    const res = await synthesize({ ...body, stream: false }, req.url);
    if (!res.ok) return json({ error: `参数有误（${statusLabel(res.status)}）` }, res.status);
    return new Response(res.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof UpstreamError) {
      const hint = e.status === 400 ? "，可能是音色名或风格参数不被支持" : "";
      return json({ error: `Edge TTS 上游返回 ${statusLabel(e.status)}${hint}` }, 502);
    }
    console.error("speech error", e);
    return json({ error: `合成失败：${e instanceof Error ? e.message : "未知错误"}（${statusLabel(500)}）` }, 500);
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/" || path === "/index.html") return page(req, env, url, "home");

    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
          "Access-Control-Allow-Headers": req.headers.get("Access-Control-Request-Headers") || "Authorization, Content-Type",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (path.startsWith("/v1/")) return handleV1(req, env, path);
    if (path === "/auth/login" && req.method === "GET") return login(req, env);
    if (path === "/auth/callback" && req.method === "GET") return callback(req, env);
    if (path === "/auth/logout" && req.method === "POST") return logout(req);
    if (path === "/api/me") return json({ user: await getUser(req, env), loginReady: googleConfigured(env) });
    if (path === "/api/speech") return webSpeech(req, env);
    if (path.startsWith("/api/")) return json({ error: `接口不存在（${statusLabel(404)}）` }, 404);
    if (path === "/health") return json({ ok: true });
    if ((path.startsWith("/assets/") || /^\/(favicon\.(ico|svg)|favicon-(32|64)\.png|icon-192\.png|apple-touch-icon\.png)$/.test(path)) && env.ASSETS) return env.ASSETS.fetch(req);
    if (req.method !== "GET" && req.method !== "HEAD") return new Response(statusLabel(405), { status: 405, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    return page(req, env, url, "notfound");
  },
} satisfies ExportedHandler<Env>;

async function page(req: Request, env: Env, url: URL, kind: PageData["kind"]): Promise<Response> {
  const user = await getUser(req, env).catch(() => null);
  const err = url.searchParams.get("login_error") as LoginError | null;
  const data: PageData = {
    kind,
    user,
    loginError: !user && err && LOGIN_ERRORS.has(err) ? err : null,
    loginReady: googleConfigured(env),
    origin: url.origin,
  };
  return renderPage(env, req, data, kind === "notfound" ? 404 : 200);
}
