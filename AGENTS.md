# AGENTS.md — Edge TTS（语音合成）

> 给 AI 编程助手的项目说明。`CLAUDE.md` 指向本文件。更多资料在 `.agents/`（rules / prompts / memory / skills）。

## 目标

把微软 Edge 朗读的 TTS 包装成 OpenAI 兼容接口（给程序用，`API_KEY` 鉴权），再加一个网页：Google 登录后直接合成、挑音色、试听、下载，不用填 API key。部署在 **https://edge-tts.rei8t.dev**。

**显示名**：中文「语音合成」，英文「Edge TTS」，不加后缀（Rei 之后可能改名）。`<title>` 只用中文名（`src/html.ts` 的 `SITE_TITLE`）；页头中文名 + 英文名小号副标题；og:title / og:site_name 用英文名（`web/index.html`）。仓库名、Worker 名 `edgetts-cloudflare` 与域名不变。改名时同步这几处 + `AppHeader.tsx`、`Auth.tsx`、README。

产品说明、音色目录约定、边界见 [`docs/PRODUCT.md`](docs/PRODUCT.md)。

## 边界

- **外部 API 100% 向后兼容**旧 `worker.js`：`POST /v1/audio/speech`（全部参数、分块、stream、cleaning_options）、`GET /v1/models`、Bearer `API_KEY`、OpenAI 风格错误体、CORS `*`。只允许**新增**（如 `GET /v1/voices`），不改已有行为。
- 网页：任意 Google 账号可用；`ALLOWED_EMAILS` 非空时只允许名单内（+ `ADMIN_EMAILS`）。没有数据库，会话只在签名 cookie 里。
- 不做：服务端保存文本 / 音频、用户配额统计、付费 TTS 引擎、留言（giscus 未加）。

## 技术栈

- **Worker**：TypeScript + Wrangler，无框架、无存储绑定。`src/tts.ts` 是旧 `worker.js` 的逐行移植
- **前端**：React 19 + [Kumo](https://github.com/cloudflare/kumo) + Tailwind v4 + Phosphor 图标，Vite 构建到 `public/`（Workers Static Assets，`run_worker_first`）
- **语言 / 主题**：中文 UI；浅色 / 深色 / 跟随系统（`web/index.html` 的内联脚本先设 `data-mode` 防闪烁，`web/src/theme.ts` 切换，localStorage `et-theme`）
- **本地存储**：`et-history`（最近 30 条生成参数，不存音频）、`et-draft`（当前表单）

## 目录

```
src/
  worker.ts              Worker 入口（wrangler.jsonc 的 main）
  index.ts               路由：/、/v1/*（API_KEY）、/api/me、/api/speech（session）、/auth/*
  tts.ts                 Edge TTS：token、签名、SSML、分块、清洗（勿改行为）
  auth.ts / session.ts   Google OAuth 2.0（改编自 sub-morph，去掉了 D1），HMAC 签名 cookie
  env.ts / html.ts
  shared/voices.ts       音色目录（scripts/gen-voices.mjs 生成，勿手改）
  shared/presets.ts      6 个 OpenAI 预设 + 试听短句
  shared/status.ts       HTTP 状态码中文简注 statusLabel()
  shared/types.ts        Worker 与前端共用类型
web/src/
  pages/HomePage.tsx     合成表单 + 结果 + 历史 + API 使用
  components/            AppHeader（主题切换 / 账号）、Auth（登录弹窗）、VoicePicker（音色选择弹窗）
data/                    音色原始数据（edge-voices.raw.json、azure-voices.subset.json）
scripts/                 gen-voices.mjs、kumo-lint.mjs、build-inline-assets.mjs
worker-inline/           内联静态资源的部署入口（API Token 部署用）
test/run-tests.ts        冒烟测试（Node 直接调 Worker fetch）
docs/PRODUCT.md
.agents/                 skills / rules / prompts / memory
```

## 命令

```bash
pnpm install
cp .dev.vars.example .dev.vars        # API_KEY、SESSION_SECRET、Google client；或 AUTH_DISABLED=true
pnpm dev                              # 构建前端 + wrangler dev（http://localhost:8787）
pnpm typecheck                        # Worker + 前端类型检查
pnpm lint                             # kumo-lint
pnpm test                             # kumo-lint + 冒烟测试（先 pnpm build）；TTS_LIVE=1 额外真实合成
pnpm voices                           # 由 data/ 重新生成 src/shared/voices.ts
pnpm deploy:inline                    # 部署（API Token：静态资源内联进脚本）
```

## 设计

全站设计以 **kumo-design** skill 为准（`.agents/skills/kumo-design/SKILL.md`），尽量用 Kumo 组件。要点：正文 14px（`text-base` 在 Kumo 里就是 14px）、标题 sentence case、不用 `font-bold` / `tracking-*`、hover 不做颜色过渡、阴影配 `ring` 不配 `border`、LayerCard 不嵌套、Dialog 永远挂载用 `open` 控制、只用 `kumo-*` 语义色、不用 `dark:`。Input / InputArea 只给 `aria-label` 时不要传 `description`（会渲染空 label 行）；说明文字放控件下方的 `<Text variant="secondary" size="sm">`。`pnpm lint` 自动检查。

## 代码规范

- TypeScript strict；Worker 侧不引入框架
- Worker 与前端共用的放 `src/shared/`（纯类型 / 纯函数 / 静态数据）
- 网页端错误信息用中文；**任何地方出现 HTTP 状态码都带中文简注**（`statusLabel()`，如「401 未授权」「408 请求超时」），新状态码补进 `src/shared/status.ts`
- `/v1/*` 保持旧的英文错误体（兼容 OpenAI 客户端），不要改
- 音色标签：中文音色在 `scripts/gen-voices.mjs` 的 `ZH` 表手工维护；其他走启发式并标 `timbreEstimated` / `accentEstimated`

## 禁止事项

- 不要提交密钥（`.dev.vars`、`.keys/`、token）；不要写进文档或 memory
- 不要改 `src/tts.ts` 的合成行为（参数默认值、SSML、分块、清洗顺序、错误文案）——外部客户端依赖它
- 不要放宽 `AUTH_DISABLED` 只认 localhost 的判断；不要绕过 `getUser()` / 同源校验
- 不要手改 `src/shared/voices.ts`，改 `scripts/gen-voices.mjs` 后 `pnpm voices`

## 工作约定

- **每轮对话有仓库改动时，完成后 commit 并 push**（main 分支，中文提交信息）。提交前 `pnpm typecheck && pnpm build && pnpm test`。
- 改接口 / 参数 → 同步 README 的 API 文档与 `docs/PRODUCT.md`。
- 重要决定记到 `.agents/memory/decisions.md`。
- 部署由 Rei 决定（Hark 用 `pnpm deploy:inline`）。
