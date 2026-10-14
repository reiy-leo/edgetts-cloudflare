// 生成 src/shared/voices.ts：Edge TTS 全部音色的静态目录。
//
// 数据来源：
//   data/edge-voices.raw.json      Edge 朗读音色列表（readaloud/voices/list，trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491D6F4）
//   data/azure-voices.subset.json  同一批音色在 Translator 端点 voices/list 里的补充字段（本地名、更细的性格、场景、StyleList）
// 更新：重新下载 raw.json 后 `pnpm voices`。
//
// 音高 / 质感 / 年龄 / 口音不在接口数据里：
//   - zh-* 音色在 ZH 表里手工标注（timbreEstimated / accentEstimated = false）
//   - 其他音色按性别、性格词、地区启发式推断，并标记 timbreEstimated / accentEstimated = true
import { readFileSync, writeFileSync } from "node:fs";

const raw = JSON.parse(readFileSync(new URL("../data/edge-voices.raw.json", import.meta.url), "utf8"));
const extra = JSON.parse(readFileSync(new URL("../data/azure-voices.subset.json", import.meta.url), "utf8"));

const LANG = new Intl.DisplayNames(["zh-CN"], { type: "language" });
const REGION = new Intl.DisplayNames(["zh-CN"], { type: "region" });
const REGION_FIX = { CN: "中国大陆", HK: "中国香港", TW: "中国台湾" };

// 中文音色：手工标注（依据各音色的公开试听与官方描述）
const ZH = {
  "zh-CN-XiaoxiaoNeural": { name: "晓晓", age: "青年", pitch: "中等", texture: "温润", accent: "标准", variant: "普通话" },
  "zh-CN-XiaoyiNeural": { name: "晓伊", age: "青年", pitch: "尖细", texture: "清亮", accent: "标准", variant: "普通话" },
  "zh-CN-YunjianNeural": { name: "云健", age: "成年", pitch: "低沉", texture: "浑厚", accent: "标准", variant: "普通话" },
  "zh-CN-YunxiNeural": { name: "云希", age: "青年", pitch: "中等", texture: "清亮", accent: "标准", variant: "普通话" },
  "zh-CN-YunxiaNeural": { name: "云夏", age: "儿童", pitch: "尖细", texture: "清亮", accent: "标准", variant: "普通话" },
  "zh-CN-YunyangNeural": { name: "云扬", age: "成年", pitch: "低沉", texture: "浑厚", accent: "标准", variant: "普通话" },
  "zh-CN-liaoning-XiaobeiNeural": { name: "晓北", age: "青年", pitch: "中等", texture: "清亮", accent: "明显口音/方言", variant: "东北话（辽宁）" },
  "zh-CN-shaanxi-XiaoniNeural": { name: "晓妮", age: "青年", pitch: "中等", texture: "清亮", accent: "明显口音/方言", variant: "陕西话" },
  "zh-HK-HiuGaaiNeural": { name: "曉佳", age: "成年", pitch: "中等", texture: "清亮", accent: "明显口音/方言", variant: "粤语（香港）" },
  "zh-HK-HiuMaanNeural": { name: "曉曼", age: "成年", pitch: "中等", texture: "清亮", accent: "明显口音/方言", variant: "粤语（香港）" },
  "zh-HK-WanLungNeural": { name: "雲龍", age: "成年", pitch: "低沉", texture: "浑厚", accent: "明显口音/方言", variant: "粤语（香港）" },
  "zh-TW-HsiaoChenNeural": { name: "曉臻", age: "成年", pitch: "中等", texture: "温润", accent: "轻微口音", variant: "台湾腔国语" },
  "zh-TW-YunJheNeural": { name: "雲哲", age: "成年", pitch: "中等", texture: "温润", accent: "轻微口音", variant: "台湾腔国语" },
  "zh-TW-HsiaoYuNeural": { name: "曉雨", age: "青年", pitch: "尖细", texture: "清亮", accent: "轻微口音", variant: "台湾腔国语" },
};

// 已知的儿童音色（Azure 官方标注为 child）
const CHILDREN = new Set(["en-US-AnaNeural", "en-GB-MaisieNeural", "fr-FR-EloiseNeural"]);

// 每种语言视为「标准」的地区；不在表里的语言：地区码 = 语言码大写，或该语言只有一个地区，视为标准
const STANDARD = {
  en: ["US", "GB"], es: ["ES", "MX"], fr: ["FR"], de: ["DE"], pt: ["BR", "PT"], ar: ["SA", "EG"], nl: ["NL"],
  ta: ["IN"], bn: ["BD"], sw: ["KE", "TZ"], ur: ["PK"], iu: ["CA"],
};
// 口音明显的英语变体
const STRONG = { en: ["IN", "NG", "KE", "PH", "SG", "ZA", "TZ", "HK"] };

const DEEP = ["Deep", "Formal", "Mature", "Strong", "Serious", "Authority", "Calm", "Reliable"];
const BRIGHT = ["Bright", "Crisp", "Clear", "Cheerful", "Upbeat", "Animated", "Lively", "Whimsical", "Youthful", "Light-Hearted", "Cute", "Sunshine", "Passion"];
const WARM = ["Warm", "Soft", "Gentle", "Caring", "Well-Rounded", "Sincere", "Comfort", "Considerate"];
const SHARP = ["Crisp", "Whimsical", "Youthful", "Cute"];

const SCENE = {
  General: "通用", Novel: "小说", News: "新闻", Conversation: "对话", Copilot: "助手", Cartoon: "卡通", Dialect: "方言", Sports: "体育",
  Narration: "旁白", Chat: "聊天", "E-learning": "教学", Assistant: "助手", Gaming: "游戏", Audiobooks: "有声书", Audiobook: "有声书",
  Podcast: "播客", Advertisement: "广告", Documentary: "纪录片", Meditation: "冥想", "Social Media": "社交媒体",
};

const byLang = {};
for (const v of raw) {
  const l = v.Locale.split("-")[0];
  (byLang[l] ??= new Set()).add(v.Locale);
}

function localeInfo(locale) {
  const [lang, ...rest] = locale.split("-");
  const region = rest.find((p) => /^[A-Z]{2}$/.test(p)) ?? "";
  const sub = rest.find((p) => /^[a-z]{3,}$/.test(p));
  let regionZh = region ? (REGION_FIX[region] ?? REGION.of(region)) : "";
  if (sub === "liaoning") regionZh += "·辽宁";
  if (sub === "shaanxi") regionZh += "·陕西";
  let langZh = LANG.of(lang);
  if (lang === "zh") langZh = "中文";
  if (lang === "nb") langZh = "挪威语";
  const script = rest.find((p) => /^[A-Z][a-z]{3}$/.test(p));
  if (script === "Latn") regionZh += "（拉丁字母）";
  if (script === "Cans") regionZh += "（音节文字）";
  return { lang, region, langZh, regionZh };
}

function accentOf(lang, region) {
  if ((STRONG[lang] ?? []).includes(region)) return "明显口音/方言";
  const std = STANDARD[lang];
  if (std) return std.includes(region) ? "标准" : "轻微口音";
  if (byLang[lang].size === 1 || region === lang.toUpperCase()) return "标准";
  return "轻微口音";
}

const has = (list, words) => list.some((p) => words.includes(p));

const voices = raw.map((v) => {
  const id = v.ShortName;
  const x = extra[id] ?? {};
  const { lang, region, langZh, regionZh } = localeInfo(v.Locale);
  const gender = v.Gender === "Male" ? "男" : "女";
  const personalities = (v.VoiceTag?.VoicePersonalities ?? []).map((s) => s.trim());
  const categories = (v.VoiceTag?.ContentCategories ?? []).map((s) => s.trim());
  const traits = (x.VoicePersonalities ?? []).filter((t) => !personalities.includes(t));
  const all = [...personalities, ...traits];
  const scenes = [...new Set([...categories, ...(x.TailoredScenarios ?? [])].map((s) => SCENE[s] ?? s))];
  const multilingual = /Multilingual/.test(id);
  const display = id.replace(/^[a-z]{2,3}-(?:[A-Za-z]+-)*?([A-Z][A-Za-z]*?)(?:Multilingual|Expressive)?Neural$/, "$1");

  const hand = ZH[id];
  let pitch, texture, age = null, accent, variant = null, timbreEstimated = true, accentEstimated = true;
  if (hand) {
    ({ pitch, texture, age, accent, variant } = hand);
    timbreEstimated = false;
    accentEstimated = false;
  } else {
    const child = CHILDREN.has(id);
    if (child) {
      age = "儿童"; pitch = "尖细"; texture = "清亮";
    } else if (gender === "女") {
      pitch = has(all, SHARP) && !has(all, DEEP) ? "尖细" : "中等";
      texture = has(all, WARM) && !has(all, ["Crisp", "Bright"]) ? "温润" : "清亮";
    } else {
      pitch = has(all, BRIGHT) && !has(all, DEEP) ? "中等" : "低沉";
      texture = has(all, ["Deep", "Strong", "Authority", "Mature"]) ? "浑厚" : has(all, BRIGHT) && !has(all, WARM) ? "清亮" : "温润";
    }
    if (!age && has(all, ["Youthful", "Cute"])) age = "青年";
    if (!age && has(all, ["Mature"])) age = "成年";
    accent = accentOf(lang, region);
    if (accent !== "标准") variant = `${langZh}（${regionZh}）`;
  }

  return {
    id,
    name: hand?.name ?? (x.LocalName && !x.LocalName.includes(display) ? `${display}（${x.LocalName}）` : display),
    locale: v.Locale,
    lang,
    langZh,
    regionZh,
    gender,
    age,
    pitch,
    texture,
    accent,
    variant,
    timbreEstimated,
    accentEstimated,
    multilingual,
    categories,
    personalities,
    traits,
    scenes,
    styles: x.StyleList ?? [],
    roles: x.RolePlayList ?? [],
  };
});

voices.sort((a, b) => (a.lang === "zh" ? 0 : 1) - (b.lang === "zh" ? 0 : 1) || a.langZh.localeCompare(b.langZh, "zh-CN") || a.locale.localeCompare(b.locale) || a.gender.localeCompare(b.gender) || a.id.localeCompare(b.id));

const header = `// 由 scripts/gen-voices.mjs 生成，不要手改。数据：data/edge-voices.raw.json（Edge 朗读音色列表）+ data/azure-voices.subset.json。
// 音高 / 质感 / 年龄 / 口音：zh-* 手工标注；其余为启发式推断（timbreEstimated / accentEstimated = true）。
`;

const types = `
export type Gender = "男" | "女";
export type Pitch = "尖细" | "中等" | "低沉";
export type Texture = "清亮" | "温润" | "浑厚";
export type AgeGroup = "儿童" | "青年" | "成年" | "年长";
export type Accent = "标准" | "轻微口音" | "明显口音/方言";

export interface VoiceInfo {
  /** ShortName，直接作为 voice 参数传给 /v1/audio/speech。 */
  id: string;
  /** 显示名：中文音色用中文名，其余用英文名（括号里是本地名）。 */
  name: string;
  locale: string;
  lang: string;
  /** 语言中文名，如「英语」。 */
  langZh: string;
  /** 地区中文名，如「美国」「中国大陆·辽宁」。 */
  regionZh: string;
  gender: Gender;
  age: AgeGroup | null;
  pitch: Pitch;
  texture: Texture;
  accent: Accent;
  /** 方言 / 地区变体，如「东北话（辽宁）」「英语（印度）」；标准口音为 null（中文普通话除外）。 */
  variant: string | null;
  /** 音高 / 质感 / 年龄是启发式推断（非人工标注）。 */
  timbreEstimated: boolean;
  /** 口音是按地区推断的（非人工标注）。 */
  accentEstimated: boolean;
  /** 多语种音色：能说其他语言，但说非母语时会带口音。 */
  multilingual: boolean;
  /** Edge 接口的 ContentCategories（英文原值，中文见 CATEGORY_LABEL）。 */
  categories: string[];
  /** Edge 接口的 VoicePersonalities（英文原值，中文见 PERSONALITY_LABEL）。 */
  personalities: string[];
  /** Azure 音色列表里额外的性格词（同样用 PERSONALITY_LABEL）。 */
  traits: string[];
  /** 风格 / 场景（中文，合并 ContentCategories 与 TailoredScenarios）。 */
  scenes: string[];
  /** 支持的 mstts:express-as 风格（style 参数）；空数组 = 只有 general。 */
  styles: string[];
  /** 支持的角色（role 参数）。 */
  roles: string[];
}
`;

const labels = `
export const CATEGORY_LABEL: Record<string, string> = ${JSON.stringify({ General: "通用", Novel: "小说", News: "新闻", Conversation: "对话", Copilot: "助手", Cartoon: "卡通", Dialect: "方言", Sports: "体育" }, null, 2)};

export const PERSONALITY_LABEL: Record<string, string> = ${JSON.stringify({
  Friendly: "友好", Positive: "积极", Warm: "温暖", Lively: "活泼", Pleasant: "悦耳", Confident: "自信", Passion: "激情", Cute: "可爱",
  Reliable: "可靠", Expressive: "富有表现力", Caring: "体贴", Authentic: "真实", Honest: "诚恳", Cheerful: "开朗", Clear: "清晰",
  Conversational: "口语化", Approachable: "亲切", Casual: "随意", Sincere: "真诚", Rational: "理性", Sunshine: "阳光", Professional: "专业",
  Humorous: "幽默", Bright: "明亮", Authority: "权威", Considerate: "周到", Comfort: "抚慰", Crisp: "干脆", Engaging: "有感染力",
  Whimsical: "俏皮", Upbeat: "欢快", Calm: "沉稳", Formal: "正式", Animated: "生动", "Light-Hearted": "轻松", Deep: "深沉",
  "Well-Rounded": "圆润", Gentle: "温柔", Curious: "好奇", Emotional: "情感丰富", Soft: "柔和", Serious: "严肃", Mature: "成熟",
  Strong: "有力", Youthful: "年轻",
}, null, 2)};

export const STYLE_LABEL: Record<string, string> = ${JSON.stringify({
  general: "默认", affectionate: "亲切", angry: "生气", assistant: "助手", calm: "平静", chat: "聊天", "chat-casual": "随意聊天",
  cheerful: "愉快", customerservice: "客服", depressed: "沮丧", disgruntled: "不满", "documentary-narration": "纪录片旁白",
  embarrassed: "尴尬", empathetic: "共情", excited: "兴奋", fearful: "害怕", friendly: "友好", gentle: "温柔", hopeful: "期待",
  lyrical: "抒情", "narration-professional": "专业旁白", "narration-relaxed": "轻松旁白", newscast: "新闻播报",
  "newscast-casual": "轻松播报", "newscast-formal": "正式播报", "poetry-reading": "诗歌朗诵", relieved: "释然", sad: "悲伤",
  serious: "严肃", shouting: "喊叫", sorry: "抱歉", "sports-commentary": "体育解说", "sports-commentary-excited": "激情解说",
  terrified: "惊恐", unfriendly: "冷淡", whispering: "耳语",
}, null, 2)};

export const ROLE_LABEL: Record<string, string> = ${JSON.stringify({ Narrator: "旁白", YoungAdultMale: "青年男性", Boy: "男孩", Girl: "女孩", YoungAdultFemale: "青年女性", OlderAdultFemale: "年长女性", OlderAdultMale: "年长男性", SeniorFemale: "老年女性", SeniorMale: "老年男性" }, null, 2)};
`;

const body = `
export const VOICES: VoiceInfo[] = ${JSON.stringify(voices)};

export const VOICE_BY_ID: Record<string, VoiceInfo> = Object.fromEntries(VOICES.map((v) => [v.id, v]));
`;

writeFileSync(new URL("../src/shared/voices.ts", import.meta.url), header + types + labels + body);

const count = (k) => voices.reduce((m, v) => ((m[v[k]] = (m[v[k]] ?? 0) + 1), m), {});
console.log(`✓ ${voices.length} 个音色，${Object.keys(count("locale")).length} 个地区，${Object.keys(count("lang")).length} 种语言`);
for (const k of ["gender", "pitch", "texture", "age", "accent"]) console.log(k, JSON.stringify(count(k)));
console.log("scenes", JSON.stringify(voices.flatMap((v) => v.scenes).reduce((m, s) => ((m[s] = (m[s] ?? 0) + 1), m), {})));
console.log("multilingual", voices.filter((v) => v.multilingual).length, "with styles", voices.filter((v) => v.styles.length).length);
