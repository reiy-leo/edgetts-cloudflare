# 外部 API 兼容

`src/tts.ts` 是旧 `worker.js`（commit 4d986e5 及之前）的逐行移植。外部客户端（OpenAI SDK、阅读类 App 等）依赖这些行为，不要改：

- 路由：`POST /v1/audio/speech`、`GET /v1/models`；`OPTIONS` 任意路径 204
- 鉴权顺序与错误体：`{ error: { message, type: "api_error", code } }`，英文 message
- 音色解析：`tts-1` / `tts-1-hd` 用 `OPENAI_VOICE_MAP[voice] || voice || "zh-CN-XiaoxiaoNeural"`；`tts-1-<预设>`；其他 model 当音色名
- 默认值：speed 1、pitch 1、style general、styleDegree 1、cleaning_options（markdown / emoji / urls / citation 默认开，line_breaks 关）
- 清洗顺序：URL → Markdown → 关键词 → emoji → 引用编号 → 换行（URL 先删会截断 Markdown 链接，这是旧行为）
- 分块：2000 字，按句子边界从后往前找（不早于一半处）
- 输出：`audio-24khz-48kbitrate-mono-mp3`，`stream: true` 时逐块写出

只允许新增接口（如 `/v1/voices`）或新增可选参数。`test/run-tests.ts` 里有对照旧版输出的断言。
