# 决策日志（新的在上）

## 2026-10-14 重构为 TS Worker + React 前端
- 以 sub-morph 为模板：Kumo + Tailwind v4 + Phosphor、kumo-lint、内联部署（Static Assets 上传在 Hark 凭据网关下 401）。
- 旧 `worker.js` 逐行移植到 `src/tts.ts`，外部 API 不变；新增 `GET /v1/voices`。旧版把 `env.API_KEY` 放进 `globalThis`，现在直接读 env（行为相同）。stream 模式下 abort 后的 close 拒绝被吞掉（旧版会产生未处理的 Promise 拒绝，对客户端无差别）。
- 网页用 Google 登录 + `/api/speech`（session），不需要 API key；无数据库，会话只在签名 cookie；`ALLOWED_EMAILS` 为空 = 任何 Google 账号。
- `/api/speech` 强制非流式、单次 ≤ `WEB_MAX_CHARS`（默认 10000）字；外部 API 不限（保持旧行为）。
- 音色目录静态化（322 个）：Edge 朗读列表 + Azure 补充字段；中文 14 个手工标注音高 / 质感 / 年龄 / 口音，其余启发式并标 `*Estimated`。
- 显示名暂定「语音合成 / Edge TTS」，Rei 可能改名。
- 不加 giscus。
