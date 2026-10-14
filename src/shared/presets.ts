// OpenAI 兼容的 6 个预设音色（与旧 worker.js 的 OPENAI_VOICE_MAP 完全一致，改动会破坏 API 兼容）。
export const OPENAI_VOICE_MAP: Record<string, string> = {
  shimmer: "zh-CN-XiaoxiaoNeural",
  alloy: "zh-CN-YunyangNeural",
  fable: "zh-CN-YunjianNeural",
  onyx: "zh-CN-XiaoyiNeural",
  nova: "zh-CN-YunxiNeural",
  echo: "zh-CN-liaoning-XiaobeiNeural",
};

/** 预设的中文说明（沿用旧测试页的文案）。 */
export const PRESET_LABEL: Record<string, string> = {
  shimmer: "温柔女声",
  alloy: "专业男声",
  fable: "激情男声",
  onyx: "活泼女声",
  nova: "阳光男声",
  echo: "东北女声",
};

export const PRESET_IDS = Object.keys(OPENAI_VOICE_MAP);

/** 预设名 → 实际的 Edge 音色 ShortName；不是预设就原样返回。 */
export const resolveVoice = (voice: string) => OPENAI_VOICE_MAP[voice] ?? voice;

/** 试听用的短句，按语言码；没有的语言用英文。 */
export const SAMPLE_TEXT: Record<string, string> = {
  zh: "你好，这是一段试听语音。",
  en: "Hello, this is a short voice preview.",
  ja: "こんにちは、これは音声のサンプルです。",
  ko: "안녕하세요, 음성 미리 듣기입니다.",
  fr: "Bonjour, ceci est un court aperçu de la voix.",
  de: "Hallo, das ist eine kurze Stimmprobe.",
  es: "Hola, esta es una breve muestra de voz.",
  pt: "Olá, esta é uma breve amostra de voz.",
  it: "Ciao, questo è un breve campione della voce.",
  ru: "Здравствуйте, это короткий образец голоса.",
  uk: "Вітаю, це короткий зразок голосу.",
  pl: "Dzień dobry, to krótka próbka głosu.",
  nl: "Hallo, dit is een korte stemproef.",
  sv: "Hej, det här är ett kort röstprov.",
  nb: "Hei, dette er en kort stemmeprøve.",
  da: "Hej, dette er en kort stemmeprøve.",
  fi: "Hei, tämä on lyhyt ääninäyte.",
  tr: "Merhaba, bu kısa bir ses örneğidir.",
  ar: "مرحبا، هذه عينة صوتية قصيرة.",
  he: "שלום, זוהי דוגמת קול קצרה.",
  hi: "नमस्ते, यह एक छोटा आवाज़ नमूना है।",
  th: "สวัสดีครับ นี่คือตัวอย่างเสียงสั้นๆ",
  vi: "Xin chào, đây là một đoạn giọng nói mẫu.",
  id: "Halo, ini adalah contoh suara singkat.",
  ms: "Helo, ini ialah contoh suara yang ringkas.",
  fil: "Kumusta, ito ay isang maikling halimbawa ng boses.",
  cs: "Dobrý den, toto je krátká ukázka hlasu.",
  sk: "Dobrý deň, toto je krátka ukážka hlasu.",
  hu: "Helló, ez egy rövid hangminta.",
  ro: "Bună ziua, aceasta este o scurtă mostră de voce.",
  el: "Γεια σας, αυτό είναι ένα σύντομο δείγμα φωνής.",
  bg: "Здравейте, това е кратък гласов пример.",
  hr: "Bok, ovo je kratki uzorak glasa.",
  sr: "Здраво, ово је кратак узорак гласа.",
  ca: "Hola, aquesta és una breu mostra de veu.",
  fa: "سلام، این یک نمونه کوتاه صدا است.",
  ur: "السلام علیکم، یہ آواز کا ایک مختصر نمونہ ہے۔",
  bn: "নমস্কার, এটি একটি ছোট কণ্ঠের নমুনা।",
  ta: "வணக்கம், இது ஒரு சிறிய குரல் மாதிரி.",
  sw: "Habari, hii ni sampuli fupi ya sauti.",
};

export const sampleFor = (lang: string) => SAMPLE_TEXT[lang] ?? SAMPLE_TEXT.en!;
