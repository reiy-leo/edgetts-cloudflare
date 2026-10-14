// 冒烟测试：直接在 Node 里调用 Worker 的 fetch（假的 ASSETS 读 public/）。
//   node --experimental-strip-types --no-warnings test/run-tests.ts            只测本地逻辑
//   TTS_LIVE=1 node --experimental-strip-types --no-warnings test/run-tests.ts  另外真实调用 Edge TTS 上游
// 跑之前先 pnpm build（否则首页会是「前端尚未构建」的兜底页，相关断言会失败）。
import { readFileSync } from "node:fs";
import app from "../src/index.ts";
import type { Env } from "../src/env.ts";
import { sign } from "../src/session.ts";
import { statusLabel } from "../src/shared/status.ts";
import { VOICES } from "../src/shared/voices.ts";
import { cleanText, splitTextIntoChunks } from "../src/tts.ts";

const assets = {
  async fetch(input: RequestInfo | URL): Promise<Response> {
    const url = new URL(input instanceof Request ? input.url : String(input));
    try {
      return new Response(readFileSync(new URL(`../public${url.pathname}`, import.meta.url)), { headers: { "Content-Type": "text/html" } });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  },
} as unknown as Fetcher;

const env: Env = { ASSETS: assets, API_KEY: "test-key", SESSION_SECRET: "s".repeat(48), GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "cs", ADMIN_EMAILS: "reiy.leoz@gmail.com" };
const BASE = "https://edge-tts.rei8t.dev";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? `  — ${detail}` : ""}`);
}
const call = (path: string, init: RequestInit = {}, e: Env = env) => app.fetch(new Request(BASE + path, init), e);
const bearer = (k: string) => ({ Authorization: `Bearer ${k}` });

// ---- 页面 ----
{
  const r = await call("/");
  const html = await r.text();
  check("GET / → 200 页面", r.status === 200 && html.includes('id="page-data"') && html.includes("<title>语音合成</title>"), statusLabel(r.status));
  const nf = await call("/nope");
  check("GET /nope → 404", nf.status === 404, statusLabel(nf.status));
}

// ---- /v1 鉴权（与旧版一致）----
{
  let r = await call("/v1/models");
  check("/v1/models 无 Authorization → 401", r.status === 401, statusLabel(r.status));
  r = await call("/v1/models", { headers: bearer("wrong") });
  check("/v1/models 错误 key → 403", r.status === 403, statusLabel(r.status));
  r = await call("/v1/models", { headers: bearer("x") }, { ...env, API_KEY: undefined });
  check("/v1/models 服务端未配置 API_KEY → 500", r.status === 500, statusLabel(r.status));
  r = await call("/v1/models", { headers: bearer("test-key") });
  const j = (await r.json()) as { object: string; data: { id: string }[] };
  check("/v1/models 正确 key → 200 + 8 个模型", r.status === 200 && j.object === "list" && j.data.length === 8 && j.data[2]!.id === "tts-1-shimmer", `${statusLabel(r.status)}，${j.data.length} 个`);
  check("/v1/models CORS", r.headers.get("Access-Control-Allow-Origin") === "*");
  r = await call("/v1/voices", { headers: bearer("test-key") });
  const v = (await r.json()) as { total: number; data: unknown[]; presets: unknown[] };
  check("/v1/voices → 200 + 完整目录", r.status === 200 && v.total === VOICES.length && v.data.length === VOICES.length && v.presets.length === 6, `${statusLabel(r.status)}，${v.total} 个音色`);
  r = await call("/v1/audio/speech", { headers: bearer("test-key") });
  check("GET /v1/audio/speech → 405", r.status === 405, statusLabel(r.status));
  r = await call("/v1/audio/speech", { method: "POST", headers: { ...bearer("test-key"), "Content-Type": "application/json" }, body: "{}" });
  const e = (await r.json()) as { error: { message: string; code: string } };
  check("POST /v1/audio/speech 缺 input → 400（旧错误格式）", r.status === 400 && e.error.code === "invalid_request_error" && e.error.message === "'input' is a required parameter.", statusLabel(r.status));
  r = await call("/v1/unknown", { headers: bearer("test-key") });
  check("/v1/unknown → 404", r.status === 404, statusLabel(r.status));
  r = await call("/v1/models", { method: "OPTIONS" });
  check("OPTIONS → 204", r.status === 204, statusLabel(r.status));
}

// ---- 网页端 /api/speech ----
{
  const body = JSON.stringify({ input: "你好", voice: "alloy" });
  let r = await call("/api/speech", { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE }, body });
  const j = (await r.json()) as { error: string };
  check("/api/speech 未登录 → 401", r.status === 401 && j.error.includes("401 未授权"), `${statusLabel(r.status)}：${j.error}`);

  const exp = Math.floor(Date.now() / 1000) + 3600;
  const cookie = `et_session=${encodeURIComponent(await sign({ email: "someone@gmail.com", exp }, env.SESSION_SECRET!))}`;
  r = await call("/api/speech", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie, Origin: "https://evil.example" }, body });
  check("/api/speech 跨站来源 → 403", r.status === 403, statusLabel(r.status));
  r = await call("/api/speech", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie, Origin: BASE }, body: JSON.stringify({ input: " " }) });
  check("/api/speech 空文本 → 400", r.status === 400, statusLabel(r.status));
  r = await call("/api/speech", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie, Origin: BASE }, body: JSON.stringify({ input: "字".repeat(10001) }) });
  check("/api/speech 超长 → 413", r.status === 413, statusLabel(r.status));
  r = await call("/api/speech", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie, Origin: BASE }, body }, { ...env, ALLOWED_EMAILS: "only@gmail.com" });
  check("/api/speech 不在 ALLOWED_EMAILS → 401", r.status === 401, statusLabel(r.status));
  const me = (await (await call("/api/me", { headers: { Cookie: cookie } })).json()) as { user: { email: string } | null };
  check("/api/me 已登录", me.user?.email === "someone@gmail.com");
  const login = await call("/auth/login");
  check("/auth/login → 302 Google", login.status === 302 && (login.headers.get("Location") ?? "").startsWith("https://accounts.google.com/"), statusLabel(login.status));
  const dev = await app.fetch(new Request("http://localhost:8787/api/me"), { ...env, AUTH_DISABLED: "true" });
  check("AUTH_DISABLED 只对 localhost 生效", ((await dev.json()) as { user: unknown }).user !== null);
  const prod = await call("/api/me", {}, { ...env, AUTH_DISABLED: "true" });
  check("AUTH_DISABLED 线上域名无效", ((await prod.json()) as { user: unknown }).user === null);

  if (process.env.TTS_LIVE) {
    r = await call("/api/speech", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie, Origin: BASE }, body });
    const buf = new Uint8Array(await r.arrayBuffer());
    check("真实合成 /api/speech → 200 audio/mpeg", r.status === 200 && r.headers.get("Content-Type") === "audio/mpeg" && buf.length > 1000, `${statusLabel(r.status)}，${buf.length} 字节`);
    r = await call("/v1/audio/speech", { method: "POST", headers: { ...bearer("test-key"), "Content-Type": "application/json" }, body: JSON.stringify({ model: "tts-1", input: "Hello world.", voice: "en-US-AvaMultilingualNeural", stream: true }) });
    const sb = new Uint8Array(await r.arrayBuffer());
    check("真实合成 /v1/audio/speech stream → 200", r.status === 200 && sb.length > 1000, `${statusLabel(r.status)}，${sb.length} 字节`);
    r = await call("/v1/audio/speech", { method: "POST", headers: { ...bearer("test-key"), "Content-Type": "application/json" }, body: JSON.stringify({ model: "tts-1", input: "今天天气真好！", voice: "zh-CN-XiaoxiaoNeural", style: "cheerful", styleDegree: 1.5, pitch: 1.1, speed: 1.2 }) });
    check("真实合成 风格 + 音调 + 语速 → 200", r.status === 200 && (await r.arrayBuffer()).byteLength > 1000, statusLabel(r.status));
  }
}

// ---- 纯函数（与旧版行为一致）----
{
  const opts = { remove_markdown: true, remove_emoji: true, remove_urls: true, remove_line_breaks: false, remove_citation_numbers: true, custom_keywords: "广告" };
  // 期望值来自旧 worker.js 的 cleanText 实际输出（先删 URL 再处理 Markdown，链接会被截断——这是旧行为，保持不变）
  const cases: [string, boolean, string][] = [
    ["**你好** [链接](http://x.y) 😀 广告 见[1]  https://a.b/c", false, "你好 [链接]( 见"],
    ["# 标题\n\n_斜体_ `code` 【2】\n第二行 ✨", false, "标题\n\n斜体 code \n第二行"],
    ["# 标题\n\n_斜体_ `code` 【2】\n第二行 ✨", true, "标题斜体 code 第二行"],
  ];
  for (const [input, lb, want] of cases) {
    const got = cleanText(input, { ...opts, remove_line_breaks: lb });
    check(`cleanText 与旧版一致${lb ? "（去换行）" : ""}`, got === want, JSON.stringify(got));
  }
  const chunks = splitTextIntoChunks("一二三。四五六。七八九", 5);
  check("splitTextIntoChunks 按句子切", JSON.stringify(chunks) === JSON.stringify(["一二三。", "四五六。", "七八九"]), JSON.stringify(chunks));
}

console.log(`\n${pass} 通过，${fail} 失败`);
if (fail) process.exit(1);
