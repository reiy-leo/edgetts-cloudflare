// 音色选择弹窗：搜索 + 多维筛选（性别 / 语言 / 音高 / 质感 / 口音 / 场景 / 年龄），按语言再按性别分组；
// 「预设」组（OpenAI 的 6 个名字）固定在最前。每个音色可以试听（走 /api/speech，结果缓存在内存里）。
import { useMemo, useRef, useState } from "react";
import { Badge, Button, Dialog, Input, Select, Text, useKumoToastManager } from "@cloudflare/kumo";
import { CheckIcon, MagnifyingGlassIcon, PlayIcon, PushPinIcon, SpeakerHighIcon, StopIcon } from "@phosphor-icons/react";
import { OPENAI_VOICE_MAP, PRESET_IDS, PRESET_LABEL, sampleFor } from "../../../src/shared/presets.ts";
import { VOICE_BY_ID, VOICES, type VoiceInfo } from "../../../src/shared/voices.ts";
import { errMsg, speech } from "../api.ts";
import { useAuth } from "./Auth.tsx";

const ALL = "__all";

/** 当前音色的显示文字（按钮上用）。 */
export function voiceLabel(id: string): { title: string; sub: string } {
  const preset = OPENAI_VOICE_MAP[id];
  if (preset) {
    const v = VOICE_BY_ID[preset];
    return { title: `${id} · ${PRESET_LABEL[id]}`, sub: v ? `预设 → ${v.name}（${v.id}）` : preset };
  }
  const v = VOICE_BY_ID[id];
  if (!v) return { title: id, sub: "自定义音色名" };
  return { title: v.name, sub: `${v.langZh} · ${v.regionZh} · ${v.gender} · ${v.id}` };
}

/** 音色支持的风格（预设先换成实际音色）。 */
export const voiceStyles = (id: string) => VOICE_BY_ID[OPENAI_VOICE_MAP[id] ?? id]?.styles ?? [];
export const voiceRoles = (id: string) => VOICE_BY_ID[OPENAI_VOICE_MAP[id] ?? id]?.roles ?? [];

// ---------- 试听（模块级缓存：同一音色只合成一次） ----------
const sampleCache = new Map<string, string>();
let player: HTMLAudioElement | null = null;

function usePreview() {
  const { requireLogin } = useAuth();
  const toast = useKumoToastManager();
  const [loading, setLoading] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const seq = useRef(0);

  const stop = () => {
    player?.pause();
    setPlaying(null);
  };

  const play = async (key: string, voice: string, lang: string) => {
    if (playing === key) return stop();
    if (!requireLogin("登录后才能试听音色。")) return;
    const n = ++seq.current;
    player?.pause();
    let url = sampleCache.get(key);
    if (!url) {
      setLoading(key);
      try {
        const blob = await speech({ model: "tts-1", voice, input: sampleFor(lang) });
        url = URL.createObjectURL(blob);
        sampleCache.set(key, url);
      } catch (e) {
        if (n === seq.current) toast.add({ title: "试听失败", description: errMsg(e), variant: "error" });
        return;
      } finally {
        if (n === seq.current) setLoading(null);
      }
    }
    if (n !== seq.current) return;
    player ??= new Audio();
    player.src = url;
    player.onended = () => setPlaying(null);
    setPlaying(key);
    void player.play().catch(() => setPlaying(null));
  };

  return { loading, playing, play, stop };
}

// ---------- 筛选 ----------
interface Filters { gender: string; lang: string; pitch: string; texture: string; accent: string; scene: string; age: string }
const EMPTY: Filters = { gender: ALL, lang: ALL, pitch: ALL, texture: ALL, accent: ALL, scene: ALL, age: ALL };

const opts = (values: string[]) => Object.fromEntries([[ALL, "全部"], ...values.map((v) => [v, v])]) as Record<string, string>;

const LANGS = (() => {
  const m = new Map<string, number>();
  for (const v of VOICES) m.set(v.langZh, (m.get(v.langZh) ?? 0) + 1);
  return [...m.keys()];
})();
const SCENES = (() => {
  const m = new Map<string, number>();
  for (const v of VOICES) for (const s of v.scenes) m.set(s, (m.get(s) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
})();

const FILTERS: { key: keyof Filters; label: string; items: Record<string, string> }[] = [
  { key: "gender", label: "性别", items: opts(["女", "男"]) },
  { key: "lang", label: "语言", items: opts(LANGS) },
  { key: "pitch", label: "音高", items: opts(["尖细", "中等", "低沉"]) },
  { key: "texture", label: "质感", items: opts(["清亮", "温润", "浑厚"]) },
  { key: "accent", label: "口音", items: opts(["标准", "轻微口音", "明显口音/方言"]) },
  { key: "scene", label: "风格 / 场景", items: opts(SCENES) },
  { key: "age", label: "年龄", items: opts(["儿童", "青年", "成年", "年长", "未标注"]) },
];

function matches(v: VoiceInfo, f: Filters, q: string): boolean {
  if (f.gender !== ALL && v.gender !== f.gender) return false;
  if (f.lang !== ALL && v.langZh !== f.lang) return false;
  if (f.pitch !== ALL && v.pitch !== f.pitch) return false;
  if (f.texture !== ALL && v.texture !== f.texture) return false;
  if (f.accent !== ALL && v.accent !== f.accent) return false;
  if (f.scene !== ALL && !v.scenes.includes(f.scene)) return false;
  if (f.age !== ALL && (v.age ?? "未标注") !== f.age) return false;
  if (!q) return true;
  const hay = [v.id, v.name, v.langZh, v.regionZh, v.locale, v.variant ?? "", ...v.scenes].join(" ").toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

// ---------- 卡片 ----------
function Tags({ v }: { v: VoiceInfo }) {
  return (
    <div className="flex flex-wrap gap-1">
      <Badge variant={v.gender === "女" ? "purple" : "blue"}>{v.gender}</Badge>
      {v.age && <Badge variant="neutral">{v.age}</Badge>}
      <Badge variant="neutral">{v.pitch}</Badge>
      <Badge variant="neutral">{v.texture}</Badge>
      {v.accent !== "标准" && <Badge variant="orange">{v.variant ?? v.accent}</Badge>}
      {v.multilingual && <Badge variant="teal">多语种</Badge>}
      {v.styles.length > 0 && <Badge variant="green">{v.styles.length} 种风格</Badge>}
      {v.scenes.filter((s) => s !== "通用").slice(0, 2).map((s) => (
        <Badge key={s} variant="neutral">{s}</Badge>
      ))}
    </div>
  );
}

function VoiceCard({ title, sub, v, selected, onSelect, preview, previewKey, voice }: {
  title: string; sub: string; v: VoiceInfo | undefined; selected: boolean; onSelect: () => void;
  preview: ReturnType<typeof usePreview>; previewKey: string; voice: string;
}) {
  const busy = preview.loading === previewKey;
  const isPlaying = preview.playing === previewKey;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect())}
      className={`grid cursor-pointer content-start gap-2 rounded-lg bg-kumo-base px-3.5 py-3 ring hover:bg-kumo-tint ${selected ? "ring-2 ring-kumo-brand" : "ring-kumo-line"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="grid min-w-0 gap-0.5">
          <span className="flex items-center gap-1.5 truncate font-medium">
            {selected && <CheckIcon size={14} weight="bold" className="shrink-0 text-kumo-brand" />}
            <span className="truncate">{title}</span>
          </span>
          <span className="truncate font-mono text-xs text-kumo-subtle">{sub}</span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          icon={isPlaying ? StopIcon : PlayIcon}
          loading={busy}
          aria-label={`试听 ${title}`}
          onClick={(e) => {
            e.stopPropagation();
            void preview.play(previewKey, voice, v?.lang ?? "zh");
          }}
        >
          {isPlaying ? "停止" : "试听"}
        </Button>
      </div>
      {v && <Tags v={v} />}
    </div>
  );
}

export function VoicePicker({ open, onOpenChange, value, onChange }: { open: boolean; onOpenChange: (o: boolean) => void; value: string; onChange: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState<Filters>(EMPTY);
  const preview = usePreview();
  const query = q.trim().toLowerCase();
  const filtering = query !== "" || Object.values(f).some((x) => x !== ALL);

  const groups = useMemo(() => {
    const out: { lang: string; genders: { gender: string; list: VoiceInfo[] }[]; count: number }[] = [];
    for (const v of VOICES) {
      if (!matches(v, f, query)) continue;
      let g = out.find((x) => x.lang === v.langZh);
      if (!g) out.push((g = { lang: v.langZh, genders: [], count: 0 }));
      let gg = g.genders.find((x) => x.gender === v.gender);
      if (!gg) g.genders.push((gg = { gender: v.gender, list: [] }));
      gg.list.push(v);
      g.count++;
    }
    for (const g of out) g.genders.sort((a, b) => (a.gender === "女" ? -1 : 1) - (b.gender === "女" ? -1 : 1));
    return out;
  }, [f, query]);
  const total = groups.reduce((n, g) => n + g.count, 0);

  const presets = PRESET_IDS.filter((p) => {
    const v = VOICE_BY_ID[OPENAI_VOICE_MAP[p]!];
    return !filtering || (v && matches(v, f, query)) || p.includes(query);
  });

  const pick = (id: string) => {
    preview.stop();
    onChange(id);
    onOpenChange(false);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) preview.stop();
        onOpenChange(o);
      }}
    >
      <Dialog size="xl" className="flex max-h-[88vh] flex-col overflow-hidden p-0 sm:w-[60rem] sm:max-w-[94vw]">
        <div className="grid gap-3 border-b border-kumo-line px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-kumo-recessed text-kumo-subtle">
              <SpeakerHighIcon size={18} />
            </span>
            <div className="grid gap-0.5">
              <Dialog.Title className="text-base font-semibold">选择音色</Dialog.Title>
              <Dialog.Description className="text-base text-kumo-subtle">
                共 {VOICES.length} 个音色。中文音色的音高、质感、口音为人工标注，其余为按性格与地区推断，仅供参考。
              </Dialog.Description>
            </div>
          </div>
          <div className="relative">
            <MagnifyingGlassIcon size={16} className="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-kumo-subtle" />
            <Input aria-label="搜索音色" className="w-full pl-9" placeholder="搜索名字、语言、地区、方言或 ShortName（如 粤语、Xiaoxiao、en-GB）" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {FILTERS.map((d) => (
              <Select
                key={d.key}
                size="sm"
                label={d.label}
                value={f[d.key]}
                items={d.items}
                onValueChange={(v) => setF((x) => ({ ...x, [d.key]: (v as string) ?? ALL }))}
              >
                {Object.entries(d.items).map(([k, l]) => (
                  <Select.Option key={k} value={k}>{l}</Select.Option>
                ))}
              </Select>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <Text variant="secondary" size="sm">{filtering ? `找到 ${total} 个音色` : `${groups.length} 种语言`}</Text>
            {filtering && (
              <Button size="sm" variant="ghost" onClick={() => (setQ(""), setF(EMPTY))}>清除筛选</Button>
            )}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto px-5 py-4">
          {presets.length > 0 && (
            <section className="grid gap-2">
              <div className="flex items-center gap-1.5">
                <PushPinIcon size={14} className="text-kumo-subtle" />
                <Text variant="heading" as="h3">预设</Text>
                <Text variant="secondary" size="sm">OpenAI 兼容的音色名，指向下面的中文音色</Text>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {presets.map((p) => (
                  <VoiceCard
                    key={p}
                    title={`${p} · ${PRESET_LABEL[p]}`}
                    sub={OPENAI_VOICE_MAP[p]!}
                    v={VOICE_BY_ID[OPENAI_VOICE_MAP[p]!]}
                    selected={value === p}
                    onSelect={() => pick(p)}
                    preview={preview}
                    previewKey={OPENAI_VOICE_MAP[p]!}
                    voice={p}
                  />
                ))}
              </div>
            </section>
          )}

          {groups.map((g) => (
            <section key={g.lang} className="grid gap-3">
              <div className="sticky top-0 z-[1] -mx-5 flex items-baseline gap-2 border-b border-kumo-line bg-kumo-base px-5 py-1.5">
                <Text variant="heading" as="h3">{g.lang}</Text>
                <Text variant="secondary" size="sm">{g.count} 个</Text>
              </div>
              {g.genders.map((gg) => (
                <div key={gg.gender} className="grid gap-2">
                  <Text variant="secondary" size="sm">{gg.gender}声 · {gg.list.length}</Text>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {gg.list.map((v) => (
                      <VoiceCard
                        key={v.id}
                        title={v.name}
                        sub={`${v.regionZh} · ${v.id}`}
                        v={v}
                        selected={value === v.id}
                        onSelect={() => pick(v.id)}
                        preview={preview}
                        previewKey={v.id}
                        voice={v.id}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ))}

          {total === 0 && presets.length === 0 && (
            <div className="py-12 text-center">
              <Text variant="secondary">没有符合条件的音色，换个关键词或清除筛选试试。</Text>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-kumo-line px-5 py-3">
          <Text variant="secondary" size="sm">点卡片选择；「试听」需要登录。</Text>
          <Dialog.Close render={(p) => <Button {...p} variant="secondary">关闭</Button>} />
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
