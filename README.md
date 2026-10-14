<h1 align="center">🎵 语音合成 · Edge TTS</h1>

> 把微软 Edge 朗读的神经网络语音合成，包装成 OpenAI TTS 兼容接口，部署在 Cloudflare Workers 上。自带网页（Google 登录后直接用，不用填 API key），收录 **322 个音色、75 种语言**。

线上：<https://edgetts-cloudflare.rei8t.dev>

## ✨ 特性

- 🆓 **免费** —— 基于 Edge 朗读服务，无需付费 API
- 🔌 **OpenAI 兼容** —— `/v1/audio/speech`、`/v1/models`，可直接替换 OpenAI TTS
- 🎭 **全量音色目录** —— 6 个预设 + 322 个 Edge 原生音色，带性别、年龄、音高、质感、口音 / 方言、场景等中文标签（`/v1/voices`）
- 🖥️ **网页** —— React + Kumo，浅色 / 深色 / 跟随系统；音色选择器支持搜索、多维筛选与试听；本地保存最近生成记录；一键复制 curl
- 🔐 **双重鉴权** —— 外部 API 用 `API_KEY`；网页用 Google 登录（可用 `ALLOWED_EMAILS` 限定名单）
- ✂️ **长文本** —— 按句子边界自动分块（每块 ≤ 2000 字）再拼接

## 🧱 项目结构

```
src/                 Cloudflare Worker（TypeScript）
  index.ts           路由：/、/v1/*、/api/*、/auth/*
  tts.ts             Edge TTS 核心（从旧版 worker.js 原样移植）
  auth.ts session.ts Google OAuth + HMAC 签名 cookie
  shared/            Worker 与前端共用：voices.ts（音色目录）、presets.ts、status.ts、types.ts
web/                 前端（Vite + React 19 + @cloudflare/kumo + Tailwind v4 + Phosphor 图标）
scripts/             gen-voices.mjs（生成音色目录）、kumo-lint.mjs、build-inline-assets.mjs
data/                音色原始数据（Edge 朗读列表 + Azure 补充字段）
worker-inline/       内联静态资源的部署入口
test/run-tests.ts    冒烟测试
```

开发说明见 [AGENTS.md](AGENTS.md)，产品说明见 [docs/PRODUCT.md](docs/PRODUCT.md)。

## 🚀 本地开发与部署

```bash
pnpm install
cp .dev.vars.example .dev.vars     # 填 API_KEY；本地可设 AUTH_DISABLED=true 跳过登录
pnpm dev                           # 构建前端 + wrangler dev → http://localhost:8787
pnpm typecheck && pnpm test        # 类型检查 + kumo-lint + 冒烟测试（TTS_LIVE=1 额外真实合成）
pnpm deploy                        # 普通部署（Static Assets）
pnpm deploy:inline                 # 用 API Token 部署（静态资源内联进脚本）
```

线上需要的 secrets（`wrangler secret put <名字>`）：

| 名字 | 说明 |
| --- | --- |
| `API_KEY` | 外部 API 的 Bearer key（不设置时 `/v1/*` 返回 500 服务器内部错误） |
| `SESSION_SECRET` | 签名登录 cookie，`openssl rand -base64 48` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth Web client；回调地址 `https://<域名>/auth/callback` |

可选变量（`wrangler.jsonc` 的 `vars`）：`ADMIN_EMAILS`、`ALLOWED_EMAILS`（空 = 任何 Google 账号）、`WEB_MAX_CHARS`（网页单次字数上限，默认 10000；外部 API 不限）。

## 📖 API 使用

所有 `/v1/*` 接口都要带 `Authorization: Bearer <API_KEY>`，CORS 全开。

| 情况 | 状态码 |
| --- | --- |
| 缺少 / 格式错误的 Authorization | 401 未授权 |
| key 错误 | 403 禁止访问 |
| 服务端没配置 API_KEY | 500 服务器内部错误 |
| 缺少 `input` | 400 请求有误 |
| 方法不对 | 405 不支持该方法 |

错误体（与 OpenAI 一致）：`{"error":{"message":"…","type":"api_error","code":"invalid_api_key"}}`

### 合成：`POST /v1/audio/speech`

完全兼容 [OpenAI TTS API](https://platform.openai.com/docs/api-reference/audio/createSpeech)，返回 `audio/mpeg`（24kHz 48kbps 单声道 MP3）。

```json
{
  "model": "tts-1",
  "input": "你好，世界！",
  "voice": "alloy",
  "speed": 1.0
}
```

**基础用法** 🎯

```bash
curl -X POST "https://edgetts-cloudflare.rei8t.dev/v1/audio/speech" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "tts-1",
    "input": "你好，这是一段测试语音。",
    "voice": "alloy"
  }' \
  --output speech.mp3
```

**调整语速** 🏃

```bash
curl -X POST "https://edgetts-cloudflare.rei8t.dev/v1/audio/speech" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{ "model": "tts-1", "input": "这段话会说得比较快！", "voice": "nova", "speed": 1.5 }' \
  --output fast.mp3
```

**使用原生 Edge 音色** 🎭（完整列表见 `GET /v1/voices` 或网页上的音色选择器）

```bash
curl -X POST "https://edgetts-cloudflare.rei8t.dev/v1/audio/speech" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{ "model": "tts-1", "input": "Hello, this is a test with English voice.", "voice": "en-US-JennyNeural" }' \
  --output english.mp3
```

**高级参数** 🔧

```bash
curl -X POST "https://edgetts-cloudflare.rei8t.dev/v1/audio/speech" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "tts-1",
    "input": "这是一段**带格式**的文本，包含链接 https://example.com 和表情 😊",
    "voice": "shimmer",
    "speed": 1.2,
    "pitch": 1.1,
    "style": "cheerful",
    "cleaning_options": {
      "remove_markdown": true,
      "remove_emoji": true,
      "remove_urls": true
    }
  }' \
  --output advanced.mp3
```

#### 完整参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `model` | string | `tts-1` | `tts-1` / `tts-1-hd` 时用 `voice`；`tts-1-<预设>`（如 `tts-1-nova`）直接指定预设；其他值视为音色名 |
| `input` | string | **必填** | 要转换的文本 |
| `voice` | string | `shimmer`（zh-CN-XiaoxiaoNeural） | 预设名或 Edge 音色 ShortName |
| `speed` | number | `1.0` | 语速 (0.5 - 2.0) |
| `pitch` | number | `1.0` | 音调 (0.5 - 1.5) |
| `style` | string | `general` | 语音风格（音色支持的风格见 `/v1/voices` 的 `styles`） |
| `role` | string | - | 角色扮演（见 `roles`，目前只有 zh-CN-YunxiNeural 支持） |
| `styleDegree` | number | `1.0` | 风格强度 (0.01 - 2.0) |
| `stream` | boolean | `false` | 流式输出（逐块返回） |
| `cleaning_options` | object | - | 文本清理选项 |

#### cleaning_options

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `remove_markdown` | boolean | `true` | 移除 Markdown 格式 |
| `remove_emoji` | boolean | `true` | 移除 Emoji |
| `remove_urls` | boolean | `true` | 移除 URL |
| `remove_line_breaks` | boolean | `false` | 移除换行符 |
| `remove_citation_numbers` | boolean | `true` | 移除引用标记 `[1]`、`【1】` |
| `custom_keywords` | string | - | 自定义移除关键词（逗号分隔） |

### 模型列表：`GET /v1/models`

```bash
curl "https://edgetts-cloudflare.rei8t.dev/v1/models" -H "Authorization: Bearer your-api-key"
```

返回 `tts-1`、`tts-1-hd` 和 6 个 `tts-1-<预设>`。

### 音色目录：`GET /v1/voices`

```bash
curl "https://edgetts-cloudflare.rei8t.dev/v1/voices" -H "Authorization: Bearer your-api-key"
```

```jsonc
{
  "object": "list",
  "total": 322,
  "presets": [{ "id": "shimmer", "voice": "zh-CN-XiaoxiaoNeural", "label": "温柔女声" }, …],
  "data": [
    {
      "id": "zh-CN-liaoning-XiaobeiNeural",   // 作为 voice 参数使用
      "name": "晓北",
      "locale": "zh-CN-liaoning", "lang": "zh", "langZh": "中文", "regionZh": "中国大陆·辽宁",
      "gender": "女",                           // 男 / 女
      "age": "青年",                            // 儿童 / 青年 / 成年 / 年长 / null（未标注）
      "pitch": "中等",                          // 尖细 / 中等 / 低沉
      "texture": "清亮",                        // 清亮 / 温润 / 浑厚
      "accent": "明显口音/方言",                 // 标准 / 轻微口音 / 明显口音/方言
      "variant": "东北话（辽宁）",               // 方言 / 地区变体
      "timbreEstimated": false,                 // true = 音高 / 质感 / 年龄为启发式推断
      "accentEstimated": false,                 // true = 口音按地区推断
      "multilingual": false,                    // 多语种音色（说非母语时会带口音）
      "categories": ["Dialect"], "personalities": ["Humorous"], "traits": ["Friendly", "Casual", "Gentle"],
      "scenes": ["方言", "聊天", "播客"],
      "styles": [], "roles": []
    }, …
  ]
}
```

中文音色（14 个）的音高、质感、年龄、口音为人工标注；其余为根据性别、性格词与地区推断（`timbreEstimated` / `accentEstimated` 为 `true`），仅供参考。英文性格 / 场景 / 风格的中文名在 `src/shared/voices.ts` 的 `PERSONALITY_LABEL`、`CATEGORY_LABEL`、`STYLE_LABEL`。

## 🎭 预设音色

| Voice | 描述 | Edge TTS 音色 |
|-------|------|---------------|
| `shimmer` | 温柔女声 | zh-CN-XiaoxiaoNeural |
| `alloy` | 专业男声 | zh-CN-YunyangNeural |
| `fable` | 激情男声 | zh-CN-YunjianNeural |
| `onyx` | 活泼女声 | zh-CN-XiaoyiNeural |
| `nova` | 阳光男声 | zh-CN-YunxiNeural |
| `echo` | 东北女声 | zh-CN-liaoning-XiaobeiNeural |

## 🔗 在其他应用中使用

### OpenAI SDK (Python)

```python
from openai import OpenAI

client = OpenAI(api_key="your-api-key", base_url="https://edgetts-cloudflare.rei8t.dev/v1")
response = client.audio.speech.create(model="tts-1", voice="alloy", input="你好，世界！")
response.stream_to_file("output.mp3")
```

### OpenAI SDK (Node.js)

```javascript
import OpenAI from 'openai';
import fs from 'node:fs';

const openai = new OpenAI({ apiKey: 'your-api-key', baseURL: 'https://edgetts-cloudflare.rei8t.dev/v1' });
const mp3 = await openai.audio.speech.create({ model: 'tts-1', voice: 'alloy', input: '你好，世界！' });
await fs.promises.writeFile('output.mp3', Buffer.from(await mp3.arrayBuffer()));
```

## ❓ FAQ

**Q：网页上怎么用？** 打开首页，用 Google 登录后直接生成，不需要 API key。合成记录只存在你的浏览器里。

**Q：免费额度够用吗？** Cloudflare Workers 免费版每天 10 万次请求，个人使用绰绰有余。

**Q：为什么返回 500 服务器内部错误？** 大概率是没设置 `API_KEY`。

**Q：长文本会被截断吗？** 不会，按句子边界自动分块后拼接成完整音频。

**Q：更新音色目录？** 重新下载 `data/edge-voices.raw.json`（见 `scripts/gen-voices.mjs` 顶部注释），然后 `pnpm voices`。

## 📄 License

MIT

## 🙏 致谢

- 最初的 Worker 实现来自 [snakeying/edge-tts-worker](https://github.com/snakeying/edge-tts-worker)
- [Microsoft Edge TTS](https://azure.microsoft.com/en-us/products/ai-services/text-to-speech)、[Cloudflare Workers](https://workers.cloudflare.com/)、[Kumo](https://github.com/cloudflare/kumo)
