export interface Env {
  /** Workers Static Assets：web/ 构建出的前端（public/）。 */
  ASSETS?: Fetcher;

  // secrets
  /** 外部 API（/v1/*）的 Bearer key。 */
  API_KEY?: string;
  /** 签名 session cookie（本项目单独生成）。 */
  SESSION_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;

  // vars
  /** 管理员 Google 邮箱，逗号分隔（目前只用于显示，管理员总能登录）。 */
  ADMIN_EMAILS?: string;
  /** 允许用网页合成的 Google 邮箱，逗号分隔；空 = 任意 Google 账号。管理员总是允许。 */
  ALLOWED_EMAILS?: string;
  /** 网页端（/api/speech）单次最多字符数，默认 10000。外部 API 不受限（与旧版一致）。 */
  WEB_MAX_CHARS?: string;
  OAUTH_REDIRECT_URI?: string;
  /** "true" = 跳过登录（假用户）。只对 localhost 生效，仅供本地开发。 */
  AUTH_DISABLED?: string;
}

export const isAuthDisabled = (env: Env, req: Request) => {
  if ((env.AUTH_DISABLED ?? "").trim().toLowerCase() !== "true") return false;
  const host = new URL(req.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
};

export const googleConfigured = (env: Env) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.SESSION_SECRET);

const list = (v: string | undefined) => (v ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export const isAdminEmail = (env: Env, email: string) => list(env.ADMIN_EMAILS).includes(email.toLowerCase());

/** ALLOWED_EMAILS 为空 → 任何人；否则只允许名单内（以及管理员）。 */
export const isAllowedEmail = (env: Env, email: string) => {
  const allowed = list(env.ALLOWED_EMAILS);
  return allowed.length === 0 || allowed.includes(email.toLowerCase()) || isAdminEmail(env, email);
};

export const webMaxChars = (env: Env) => {
  const n = Number(env.WEB_MAX_CHARS);
  return Number.isFinite(n) && n > 0 ? n : 10000;
};
