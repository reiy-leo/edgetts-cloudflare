// 首页：左边合成（文本 / 音色 / 语速 / 音调 / 风格 / 高级清洗选项 / 生成 / 播放下载），右边本地历史与 API 使用说明。
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Badge, Banner, Button, ClipboardText, Collapsible, Input, InputArea, LayerCard, Select, Switch, Text, useKumoToastManager } from "@cloudflare/kumo";
import {
  ArrowCounterClockwiseIcon,
  CaretDownIcon,
  ClockCounterClockwiseIcon,
  CodeIcon,
  CopyIcon,
  DownloadSimpleIcon,
  MicrophoneIcon,
  SlidersHorizontalIcon,
  SparkleIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { ROLE_LABEL, STYLE_LABEL } from "../../../src/shared/voices.ts";
import type { CleaningOptions, LoginError, PageData, SpeechRequest } from "../../../src/shared/types.ts";
import { errMsg, speech } from "../api.ts";
import { useAuth } from "../components/Auth.tsx";
import { AppFooter, AppHeader } from "../components/AppHeader.tsx";
import { VoicePicker, voiceLabel, voiceRoles, voiceStyles } from "../components/VoicePicker.tsx";
import { fmtTime, loadHistory, pushHistory, saveHistory, type HistoryItem } from "../history.ts";

const LOGIN_ERRORS: Record<LoginError, string> = {
  unconfigured: "站点还没有配置 Google 登录（GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / SESSION_SECRET）。",
  denied: "你在 Google 页面取消了授权。",
  state: "登录状态校验失败（可能超过 10 分钟或 Cookie 被拦截），请重试。",
  token: "向 Google 换取令牌失败，请重试。",
  id_token: "Google 返回的身份信息校验失败。",
  unverified: "这个 Google 账号的邮箱还没有验证。",
  forbidden: "这个 Google 账号不在允许名单里，请联系管理员。",
};

const DEFAULT_TEXT = "你好，这是一个语音合成测试。";
const DEFAULT_CLEAN: Required<CleaningOptions> = {
  remove_markdown: true,
  remove_emoji: true,
  remove_urls: true,
  remove_line_breaks: false,
  remove_citation_numbers: true,
  custom_keywords: "",
};
const CLEAN_LABEL: { key: Exclude<keyof CleaningOptions, "custom_keywords">; label: string }[] = [
  { key: "remove_markdown", label: "去掉 Markdown 标记" },
  { key: "remove_emoji", label: "去掉表情符号" },
  { key: "remove_urls", label: "去掉网址" },
  { key: "remove_citation_numbers", label: "去掉引用编号（[1]、【1】）" },
  { key: "remove_line_breaks", label: "去掉换行（合成一整段）" },
];

const DRAFT_KEY = "et-draft";

interface Draft {
  input: string;
  voice: string;
  speed: number;
  pitch: number;
  style: string;
  styleDegree: number;
  role: string;
  clean: Required<CleaningOptions>;
}

function loadDraft(): Draft {
  const d: Draft = { input: DEFAULT_TEXT, voice: "alloy", speed: 1, pitch: 1, style: "general", styleDegree: 1, role: "", clean: DEFAULT_CLEAN };
  try {
    const s = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as Partial<Draft> | null;
    if (s) return { ...d, ...s, clean: { ...DEFAULT_CLEAN, ...(s.clean ?? {}) } };
  } catch {
    /* ignore */
  }
  return d;
}

/** 草稿 → 请求体：只带和默认值不同的参数，curl 示例也更短。 */
function toRequest(d: Draft): SpeechRequest {
  const r: SpeechRequest = { model: "tts-1", input: d.input, voice: d.voice };
  if (d.speed !== 1) r.speed = d.speed;
  if (d.pitch !== 1) r.pitch = d.pitch;
  if (d.style !== "general") {
    r.style = d.style;
    if (d.styleDegree !== 1) r.styleDegree = d.styleDegree;
  }
  if (d.role) r.role = d.role;
  const c: CleaningOptions = {};
  for (const k of Object.keys(DEFAULT_CLEAN) as (keyof CleaningOptions)[]) {
    if (d.clean[k] !== DEFAULT_CLEAN[k]) (c as Record<string, unknown>)[k] = d.clean[k];
  }
  if (Object.keys(c).length) r.cleaning_options = c;
  return r;
}

function fromRequest(r: SpeechRequest): Draft {
  return {
    input: r.input,
    voice: r.voice ?? "alloy",
    speed: r.speed ?? 1,
    pitch: r.pitch ?? 1,
    style: r.style ?? "general",
    styleDegree: r.styleDegree ?? 1,
    role: r.role ?? "",
    clean: { ...DEFAULT_CLEAN, ...(r.cleaning_options ?? {}) },
  };
}

function Range({ label, value, min, max, step, onChange, format, hint }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string; hint?: string }) {
  return (
    <label className="grid gap-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <Text bold as="span">{label}</Text>
        <span className="flex items-center gap-2">
          <span className="font-mono text-[0.9em] text-kumo-subtle">{format(value)}</span>
          {value !== 1 && (
            <button type="button" className="text-xs text-kumo-link hover:underline" onClick={() => onChange(1)}>重置</button>
          )}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-kumo-brand" aria-label={label} />
      {hint && <Text variant="secondary" size="sm">{hint}</Text>}
    </label>
  );
}

function Section({ icon, title, extra, children }: { icon: ReactNode; title: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-kumo-subtle">
          {icon}
          <Text variant="heading" as="h2">{title}</Text>
        </div>
        {extra}
      </div>
      {children}
    </section>
  );
}

function curlFor(origin: string, req: SpeechRequest): string {
  const body = JSON.stringify({ ...req, input: req.input.length > 60 ? req.input.slice(0, 60) + "…" : req.input }, null, 2);
  return [
    `curl ${origin}/v1/audio/speech \\`,
    `  -H "Authorization: Bearer $API_KEY" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '${body.replace(/'/g, "'\\''")}' \\`,
    "  -o speech.mp3",
  ].join("\n");
}

export function HomePage({ page }: { page: PageData }) {
  const { user, requireLogin } = useAuth();
  const toast = useKumoToastManager();
  const [d, setD] = useState<Draft>(loadDraft);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; size: number; voice: string; ms: number } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory);
  const audioRef = useRef<HTMLAudioElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch {
      /* ignore */
    }
  }, [d]);

  // 换音色后，不支持的风格 / 角色回到默认
  const styles = voiceStyles(d.voice);
  const roles = voiceRoles(d.voice);
  useEffect(() => {
    if (d.style !== "general" && !styles.includes(d.style)) set("style", "general");
    if (d.role && !roles.includes(d.role)) set("role", "");
    // 只在换音色时检查
  }, [d.voice]);

  const req = toRequest(d);
  const chars = d.input.length;
  const label = voiceLabel(d.voice);

  async function generate(r: SpeechRequest = req) {
    if (!r.input.trim()) return setError("请输入要合成的文本");
    if (!requireLogin("登录后就能直接在网页上生成语音，不需要填写 API key。")) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setError(null);
    const t0 = performance.now();
    try {
      const blob = await speech(r, ac.signal);
      if (result) URL.revokeObjectURL(result.url);
      const url = URL.createObjectURL(blob);
      setResult({ url, size: blob.size, voice: r.voice ?? "", ms: Math.round(performance.now() - t0) });
      setHistory((h) => pushHistory(h, r));
      requestAnimationFrame(() => void audioRef.current?.play().catch(() => {}));
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(errMsg(e));
    } finally {
      if (abortRef.current === ac) setBusy(false);
    }
  }

  const styleItems: Record<string, string> = { general: "默认（general）", ...Object.fromEntries(styles.map((s) => [s, `${STYLE_LABEL[s] ?? s}（${s}）`])) };
  const roleItems: Record<string, string> = { "": "不指定", ...Object.fromEntries(roles.map((r) => [r, `${ROLE_LABEL[r] ?? r}（${r}）`])) };
  const fileName = `tts-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "")}.mp3`;

  return (
    <>
      <AppHeader />
      <main className="mx-auto grid max-w-6xl gap-6 px-5 py-8">
        {page.loginError && <Banner variant="error" icon={<WarningCircleIcon weight="fill" />} title="登录失败" description={LOGIN_ERRORS[page.loginError]} />}
        <div className="grid gap-1.5">
          <Text variant="heading" size="lg" as="h1">语音合成</Text>
          <Text variant="secondary">基于微软 Edge 朗读，300 多种音色、75 种语言。网页登录后直接用；程序调用走 OpenAI 兼容接口。</Text>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <LayerCard className="grid gap-6 px-5 py-5">
            <Section icon={<MicrophoneIcon size={18} />} title="合成">
              <div className="grid gap-1.5">
                <InputArea label="文本" rows={7} value={d.input} placeholder="输入要转换成语音的文字…" onChange={(e) => set("input", e.target.value)} />
                <div className="flex justify-between gap-2">
                  <Text variant="secondary" size="sm">超过 2000 字会按句子自动分段合成再拼接</Text>
                  <Text variant="secondary" size="sm">{chars.toLocaleString()} 字</Text>
                </div>
              </div>

              <div className="grid gap-1.5">
                <Text bold>音色</Text>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg bg-kumo-control px-3 py-2 text-left ring ring-kumo-line hover:bg-kumo-tint"
                >
                  <span className="grid min-w-0 gap-0.5">
                    <span className="truncate font-medium">{label.title}</span>
                    <span className="truncate text-xs text-kumo-subtle">{label.sub}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-sm text-kumo-subtle">
                    更换 <CaretDownIcon size={14} />
                  </span>
                </button>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <Range label="语速" value={d.speed} min={0.5} max={2} step={0.05} onChange={(v) => set("speed", v)} format={(v) => `${v.toFixed(2)}×`} />
                <Range label="音调" value={d.pitch} min={0.5} max={1.5} step={0.05} onChange={(v) => set("pitch", v)} format={(v) => `${v >= 1 ? "+" : ""}${Math.round((v - 1) * 100)}%`} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Select label="风格" value={d.style} items={styleItems} onValueChange={(v) => set("style", (v as string) ?? "general")}>
                    {Object.entries(styleItems).map(([k, l]) => (
                      <Select.Option key={k} value={k}>{l}</Select.Option>
                    ))}
                  </Select>
                  <Text variant="secondary" size="sm">{styles.length ? `这个音色支持 ${styles.length} 种风格` : "这个音色只有默认风格"}</Text>
                </div>
                {roles.length > 0 ? (
                  <Select label="角色" value={d.role} items={roleItems} onValueChange={(v) => set("role", (v as string) ?? "")}>
                    {Object.entries(roleItems).map(([k, l]) => (
                      <Select.Option key={k} value={k}>{l}</Select.Option>
                    ))}
                  </Select>
                ) : (
                  d.style !== "general" && (
                    <Range label="风格强度" value={d.styleDegree} min={0.01} max={2} step={0.01} onChange={(v) => set("styleDegree", v)} format={(v) => v.toFixed(2)} />
                  )
                )}
              </div>
              {roles.length > 0 && d.style !== "general" && (
                <Range label="风格强度" value={d.styleDegree} min={0.01} max={2} step={0.01} onChange={(v) => set("styleDegree", v)} format={(v) => v.toFixed(2)} />
              )}

              <Collapsible.Root open={advOpen} onOpenChange={setAdvOpen}>
                <Collapsible.Trigger className="flex items-center gap-1.5 text-base text-kumo-subtle hover:text-kumo-default">
                  <SlidersHorizontalIcon size={16} />
                  <span className="font-medium">高级：文本清洗</span>
                  <CaretDownIcon size={14} className={advOpen ? "rotate-180" : ""} />
                </Collapsible.Trigger>
                <Collapsible.Panel className="grid gap-3 pt-3">
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {CLEAN_LABEL.map((c) => (
                      <Switch key={c.key} label={c.label} checked={d.clean[c.key]} onCheckedChange={(v) => set("clean", { ...d.clean, [c.key]: v })} />
                    ))}
                  </div>
                  <div className="grid gap-1.5">
                    <Input label="要删掉的关键词" placeholder="用英文逗号分隔，如 广告,转载自" value={d.clean.custom_keywords} onChange={(e) => set("clean", { ...d.clean, custom_keywords: e.target.value })} />
                  </div>
                  <div>
                    <Button size="sm" variant="ghost" icon={ArrowCounterClockwiseIcon} onClick={() => set("clean", DEFAULT_CLEAN)}>恢复默认</Button>
                  </div>
                </Collapsible.Panel>
              </Collapsible.Root>

              {error && <Banner variant="error" icon={<WarningCircleIcon weight="fill" />} title="生成失败" description={error} />}

              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" icon={SparkleIcon} loading={busy} disabled={!d.input.trim()} onClick={() => void generate()}>
                  {busy ? "生成中…" : "生成语音"}
                </Button>
                {!user && <Text variant="secondary" size="sm">需要先用 Google 登录</Text>}
              </div>

              {result && (
                <div className="grid gap-2 rounded-lg bg-kumo-recessed px-4 py-3">
                  <audio ref={audioRef} src={result.url} controls className="w-full" />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Text variant="secondary" size="sm">
                      {voiceLabel(result.voice).title} · {(result.size / 1024).toFixed(1)} KB · 用时 {(result.ms / 1000).toFixed(1)} 秒
                    </Text>
                    <a href={result.url} download={fileName}>
                      <Button size="sm" variant="secondary" icon={DownloadSimpleIcon} tabIndex={-1}>下载 MP3</Button>
                    </a>
                  </div>
                </div>
              )}
            </Section>
          </LayerCard>

          <div className="grid gap-6">
            <LayerCard className="grid gap-3 px-5 py-4">
              <Section
                icon={<ClockCounterClockwiseIcon size={18} />}
                title="最近生成"
                extra={
                  history.length > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => (saveHistory([]), setHistory([]))}>清空</Button>
                  )
                }
              >
                {history.length === 0 ? (
                  <Text variant="secondary" size="sm">还没有记录。生成过的文本和参数只保存在这个浏览器里。</Text>
                ) : (
                  <ul className="-mx-2 grid max-h-[420px] gap-1 overflow-y-auto">
                    {history.map((h) => (
                      <li key={h.id} className="grid gap-1 rounded-lg px-2 py-2 hover:bg-kumo-tint">
                        <Text size="sm" as="span"><span className="line-clamp-2">{h.req.input}</span></Text>
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant="neutral">{voiceLabel(h.req.voice ?? "alloy").title}</Badge>
                          {h.req.speed !== undefined && <Badge variant="neutral">语速 {h.req.speed}×</Badge>}
                          {h.req.pitch !== undefined && <Badge variant="neutral">音调 {Math.round((h.req.pitch - 1) * 100)}%</Badge>}
                          {h.req.style && <Badge variant="neutral">{STYLE_LABEL[h.req.style] ?? h.req.style}</Badge>}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <Text variant="secondary" size="sm">{fmtTime(h.at)}</Text>
                          <div className="flex items-center">
                            <Button size="sm" variant="ghost" icon={ArrowCounterClockwiseIcon} onClick={() => (setD(fromRequest(h.req)), void generate(h.req))}>重新生成</Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              shape="square"
                              icon={CopyIcon}
                              aria-label="复制文本"
                              onClick={() => void navigator.clipboard.writeText(h.req.input).then(() => toast.add({ title: "已复制文本", variant: "success" }))}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              shape="square"
                              icon={TrashIcon}
                              aria-label="删除"
                              onClick={() => setHistory((x) => { const n = x.filter((y) => y.id !== h.id); saveHistory(n); return n; })}
                            />
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </LayerCard>

            <LayerCard className="grid gap-3 px-5 py-4">
              <Section icon={<CodeIcon size={18} />} title="API 使用">
                <Text variant="secondary" size="sm">
                  OpenAI 兼容（<span className="font-mono text-[0.9em]">/v1/audio/speech</span>），请求头带 <span className="font-mono text-[0.9em]">Authorization: Bearer API_KEY</span>。下面的示例跟随当前参数。
                </Text>
                <div className="grid gap-1.5">
                  <Text size="sm" bold>端点</Text>
                  <ClipboardText text={`${page.origin}/v1/audio/speech`} className="w-full" tooltip={{ text: "复制", copiedText: "已复制" }} />
                </div>
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between">
                    <Text size="sm" bold>curl 示例</Text>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={CopyIcon}
                      onClick={() => void navigator.clipboard.writeText(curlFor(page.origin, req)).then(() => toast.add({ title: "已复制 curl 命令", variant: "success" }))}
                    >
                      复制
                    </Button>
                  </div>
                  <pre className="max-h-64 overflow-auto rounded-lg bg-kumo-recessed px-3 py-2.5 font-mono text-xs leading-relaxed whitespace-pre text-kumo-default">{curlFor(page.origin, req)}</pre>
                </div>
                <Text variant="secondary" size="sm">
                  其他接口：<span className="font-mono text-[0.9em]">GET /v1/models</span>、<span className="font-mono text-[0.9em]">GET /v1/voices</span>（完整音色目录）。
                </Text>
              </Section>
            </LayerCard>
          </div>
        </div>
      </main>
      <AppFooter />
      <VoicePicker open={pickerOpen} onOpenChange={setPickerOpen} value={d.voice} onChange={(id) => set("voice", id)} />
    </>
  );
}
