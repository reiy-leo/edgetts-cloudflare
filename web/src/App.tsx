import { Button, Empty } from "@cloudflare/kumo";
import type { PageData } from "../../src/shared/types.ts";
import { AuthProvider } from "./components/Auth.tsx";
import { AppFooter, AppHeader } from "./components/AppHeader.tsx";
import { HomePage } from "./pages/HomePage.tsx";

function NotFound() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-3xl px-5 py-20">
        <Empty title="页面不存在（404 不存在）" description="链接可能写错了。" contents={<Button variant="secondary" onClick={() => (location.href = "/")}>回到首页</Button>} />
      </main>
      <AppFooter />
    </>
  );
}

export function App({ page }: { page: PageData }) {
  return (
    <AuthProvider user={page.user}>
      {page.kind === "home" ? <HomePage page={page} /> : <NotFound />}
    </AuthProvider>
  );
}
