import type { SpeechRequest } from "../../src/shared/types.ts";
import { statusLabel } from "../../src/shared/status.ts";

export { statusLabel };

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** 会话失效（401）时广播，AuthProvider 收到后弹出登录框。 */
export const UNAUTHORIZED_EVENT = "et:unauthorized";

/** POST /api/speech → MP3 Blob。错误都转成中文（带状态码简注）。 */
export async function speech(req: SpeechRequest, signal?: AbortSignal): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch("/api/speech", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req), signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("网络错误，请检查网络后重试", 0);
  }
  if (res.ok) return res.blob();
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(`需要登录（${statusLabel(401)}）`, 401);
  }
  throw new ApiError(data.error ?? `合成失败（${statusLabel(res.status)}）`, res.status);
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
