# 产品说明 —— 语音合成 / Edge TTS

## 一句话

给 Rei（和他愿意开放的人）一个免费的文字转语音服务：程序走 OpenAI 兼容接口，人在网页上登录后直接用。

## 用户与权限

| 谁 | 怎么用 | 鉴权 |
| --- | --- | --- |
| 程序 / 第三方客户端 | `/v1/audio/speech`、`/v1/models`、`/v1/voices` | `Authorization: Bearer API_KEY` |
| 网页用户 | 首页 → `/api/speech` | Google 登录（session cookie）；`ALLOWED_EMAILS` 为空 = 任何 Google 账号 |
| 管理员 | 同网页用户 | `ADMIN_EMAILS`（默认 reiy.leoz@gmail.com），总是被允许 |

未登录的访客能看页面、挑音色；点「生成」或「试听」时弹出登录框。

## MVP 功能

- 文本输入（字数统计；网页单次上限 `WEB_MAX_CHARS`，默认 10000 字；超过 2000 字自动分块）
- 音色：按钮显示当前音色，点开音色选择弹窗
  - 搜索（名字 / 语言 / 地区 / 方言 / ShortName）
  - 筛选：性别、语言、音高、质感、口音、风格 / 场景、年龄
  - 按语言 → 性别分组；6 个 OpenAI 预设固定在最前的「预设」组
  - 每个音色可试听（用该语言的短句合成，内存缓存）
- 语速、音调滑块；风格（按音色支持的 StyleList）、风格强度；角色（仅支持的音色）
- 高级：文本清洗开关 + 自定义删除关键词（默认值与 API 相同）
- 生成 → 播放器 + 下载 MP3
- 最近生成（localStorage，30 条，可重新生成 / 复制文本 / 删除）
- 「API 使用」卡片：端点 + 跟随当前参数的 curl 示例

## 音色目录

数据：`data/edge-voices.raw.json`（Edge 朗读音色列表，`speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list`）+ `data/azure-voices.subset.json`（同一批音色在 Translator 端点 voices/list 里的本地名、性格、场景、StyleList、RolePlayList）。由 `scripts/gen-voices.mjs` 生成 `src/shared/voices.ts`。

2026-10-14 快照：**322 个音色 / 142 个地区 / 75 种语言**；女 163、男 159。

| 维度 | 取值 | 来源 |
| --- | --- | --- |
| 性别 | 男 / 女 | 接口 |
| 语言 / 地区 | 中文名（Intl.DisplayNames，港澳台写作「中国香港 / 中国台湾」） | 接口 locale |
| 场景 | 通用、新闻、旁白、聊天、助手、教学、有声书、小说… | ContentCategories + TailoredScenarios |
| 性格 | 友好、积极、温暖、明亮… | VoicePersonalities（中文见 `PERSONALITY_LABEL`） |
| 音高 | 尖细 / 中等 / 低沉 | zh-* 手工；其他启发式（`timbreEstimated`） |
| 质感 | 清亮 / 温润 / 浑厚 | 同上 |
| 年龄 | 儿童 / 青年 / 成年 / 年长 / 未标注 | zh-* 手工 + 已知儿童音色（Ana、Maisie、Eloise） |
| 口音 | 标准 / 轻微口音 / 明显口音/方言 + 方言 / 地区变体名 | zh-* 手工；其他按地区推断（`accentEstimated`） |

启发式规则（非中文音色）：女声带 Crisp / Whimsical / Youthful / Cute 等词 → 尖细，否则中等；男声带 Bright / Cheerful 等明亮词且无 Deep / Formal 等 → 中等，否则低沉。质感按 Warm / Soft / Gentle → 温润，Deep / Strong / Mature → 浑厚，其余清亮。口音：每种语言的主地区（英语 US / GB，西语 ES / MX，葡语 BR / PT…）为标准，其他地区为轻微口音，印度 / 尼日利亚 / 肯尼亚 / 菲律宾 / 新加坡 / 南非 / 坦桑尼亚 / 香港英语为明显口音。多语种音色（Multilingual，12 个）标 `multilingual`，说非母语时带口音。

中文音色手工标注：

| 音色 | 年龄 | 音高 | 质感 | 口音 / 变体 |
| --- | --- | --- | --- | --- |
| 晓晓 Xiaoxiao | 青年 | 中等 | 温润 | 标准 · 普通话 |
| 晓伊 Xiaoyi | 青年 | 尖细 | 清亮 | 标准 · 普通话 |
| 云健 Yunjian | 成年 | 低沉 | 浑厚 | 标准 · 普通话 |
| 云希 Yunxi | 青年 | 中等 | 清亮 | 标准 · 普通话 |
| 云夏 Yunxia | 儿童 | 尖细 | 清亮 | 标准 · 普通话 |
| 云扬 Yunyang | 成年 | 低沉 | 浑厚 | 标准 · 普通话 |
| 晓北 liaoning-Xiaobei | 青年 | 中等 | 清亮 | 明显 · 东北话（辽宁） |
| 晓妮 shaanxi-Xiaoni | 青年 | 中等 | 清亮 | 明显 · 陕西话 |
| 曉佳 HiuGaai / 曉曼 HiuMaan | 成年 | 中等 | 清亮 | 明显 · 粤语（香港） |
| 雲龍 WanLung | 成年 | 低沉 | 浑厚 | 明显 · 粤语（香港） |
| 曉臻 HsiaoChen / 雲哲 YunJhe | 成年 | 中等 | 温润 | 轻微 · 台湾腔国语 |
| 曉雨 HsiaoYu | 青年 | 尖细 | 清亮 | 轻微 · 台湾腔国语 |

## 明确不做

- 服务端保存文本或音频；跨设备同步历史
- 用户配额 / 计费 / 统计（需要时再加 KV 或 D1）
- 付费 TTS 引擎、声音克隆
- 留言（giscus）—— 需要时在 reiy-leo/cfw-comments 建同名 Announcement 分类后再加

## 风险与上线前检查

- Edge 朗读接口是非官方用法，可能随时变更或限流；失败时网页显示「Edge TTS 上游返回 4xx/5xx（中文简注）」
- 生成内容仅供个人学习与测试（页脚已注明）
- 外部 API 没有限流，靠 `API_KEY` 保密；网页端靠登录 + 单次字数上限
