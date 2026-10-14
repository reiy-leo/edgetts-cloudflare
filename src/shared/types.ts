// Worker 与前端共用的类型（纯类型）。

export interface SessionInfo {
  email: string;
  name?: string;
  picture?: string;
  admin: boolean;
}

export type LoginError = "unconfigured" | "denied" | "state" | "token" | "id_token" | "unverified" | "forbidden";

export type PageKind = "home" | "notfound";

/** Worker 注入到 HTML 的页面数据（<script id="page-data">）。 */
export interface PageData {
  kind: PageKind;
  user: SessionInfo | null;
  loginError: LoginError | null;
  /** Google 登录是否已配置。 */
  loginReady: boolean;
  origin: string;
}

export interface CleaningOptions {
  remove_markdown?: boolean;
  remove_emoji?: boolean;
  remove_urls?: boolean;
  remove_line_breaks?: boolean;
  remove_citation_numbers?: boolean;
  custom_keywords?: string;
}

/** POST /v1/audio/speech 与 /api/speech 的请求体（OpenAI 兼容 + 扩展参数）。 */
export interface SpeechRequest {
  model?: string;
  input: string;
  voice?: string;
  speed?: number;
  pitch?: number;
  style?: string;
  role?: string;
  styleDegree?: number;
  stream?: boolean;
  cleaning_options?: CleaningOptions;
}
