import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toasty } from "@cloudflare/kumo";
import type { PageData } from "../../src/shared/types.ts";
import { App } from "./App.tsx";
import "./styles.css";

function readPageData(): PageData {
  const el = document.getElementById("page-data");
  if (el?.textContent) {
    try {
      return JSON.parse(el.textContent) as PageData;
    } catch {
      /* fall through */
    }
  }
  // vite dev 直接打开时没有注入数据：?page=guest 预览未登录（合成仍需 wrangler dev）
  const guest = new URLSearchParams(location.search).get("page") === "guest";
  return {
    kind: "home",
    user: guest ? null : { email: "dev@localhost", name: "本地开发", admin: true },
    loginError: null,
    loginReady: true,
    origin: location.origin,
  };
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Toasty>
      <App page={readPageData()} />
    </Toasty>
  </StrictMode>,
);
