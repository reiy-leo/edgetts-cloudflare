// 最近的生成记录（只存在浏览器 localStorage，不存音频，重新生成即可）。
import type { SpeechRequest } from "../../src/shared/types.ts";

export interface HistoryItem {
  id: string;
  at: number;
  /** 发送给 /api/speech 的完整参数。 */
  req: SpeechRequest;
}

const KEY = "et-history";
const MAX = 30;

export function loadHistory(): HistoryItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]") as HistoryItem[];
    return Array.isArray(v) ? v.filter((x) => x && typeof x.req?.input === "string") : [];
  } catch {
    return [];
  }
}

export function saveHistory(list: HistoryItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* 存满了就算了 */
  }
}

export function pushHistory(list: HistoryItem[], req: SpeechRequest): HistoryItem[] {
  const item: HistoryItem = { id: Math.random().toString(36).slice(2, 10), at: Date.now(), req };
  // 同样参数只保留最新一条
  const key = JSON.stringify(req);
  const next = [item, ...list.filter((x) => JSON.stringify(x.req) !== key)].slice(0, MAX);
  saveHistory(next);
  return next;
}

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  const diff = Date.now() - ts;
  if (diff < 60_000) return "刚刚";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  const same = new Date().toDateString() === d.toDateString();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return same ? `今天 ${hm}` : `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}
