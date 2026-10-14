// 页面输出：界面是同一个 React + Kumo 前端（web/ → public/），Worker 只负责带上数据和状态码。
import type { Env } from "./env.ts";
import type { PageData } from "./shared/types.ts";

/** 站点显示名：<title> 只用中文名，不加后缀；og 用英文名（见 web/index.html）。 */
export const SITE_TITLE = "语音合成";

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

/** 读 public/index.html，把页面数据塞进 <script id="page-data">。 */
export async function renderPage(env: Env, req: Request, data: PageData, status = 200, title = SITE_TITLE): Promise<Response> {
  const headers = { "Content-Type": "text/html; charset=utf-8", ...SECURITY_HEADERS };
  const shell = env.ASSETS ? await env.ASSETS.fetch(new URL("/index.html", req.url)).catch(() => null) : null;
  if (!shell || !shell.ok) {
    const msg = data.kind === "notfound" ? "页面不存在。" : "前端尚未构建，请先运行 pnpm build。";
    return new Response(`<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><p>${msg}</p>`, { status, headers });
  }
  // JSON 放进 <script>：转义 < 防止 </script> 截断，同时挡住 U+2028/2029
  const json = JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  const html = (await shell.text())
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace("<!--PAGE_DATA-->", `<script id="page-data" type="application/json">${json}</script>`);
  return new Response(html, { status, headers });
}
