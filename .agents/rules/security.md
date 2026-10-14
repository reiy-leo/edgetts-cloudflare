# 安全规则

- `/v1/*` 只认 `Authorization: Bearer API_KEY`（`timingSafeEqual` 比较）；顺序与旧版一致：缺头 401 → 未配置 500 → key 错 403。
- `/api/speech` 必须 `getUser()` 通过 + 同源（`sameOrigin`）；未登录返回 401，跨站返回 403。
- `AUTH_DISABLED` 只对 localhost 生效，不要放宽。
- `ALLOWED_EMAILS` 每次请求重新判断（改名单立即生效，不用等 cookie 过期）。
- 页面数据注入 HTML 时必须转义 `<`（见 `src/html.ts`）。
- 密钥（API_KEY、SESSION_SECRET、Google client secret、deploy key、API token）不入库、不写进文档或 memory。本地放 `.dev.vars`，线上用 `wrangler secret put`。
- 服务端不保存用户文本或音频；日志里不要打印 input。
- HTTP 状态码出现在任何界面 / 网页错误信息里都要带中文简注（`statusLabel`）。
