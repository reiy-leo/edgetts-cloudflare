# 工作约定

- **每轮对话有仓库改动时，完成后 commit 并 push**（main 分支，提交信息用中文，说清改了什么）。
- 提交前跑 `pnpm typecheck && pnpm build && pnpm test`，都过了再推。
- 改了接口 / 参数 → 同步 README 的 API 文档与 `docs/PRODUCT.md`。
- 改了音色标签规则 → 改 `scripts/gen-voices.mjs` 后 `pnpm voices`，并更新 PRODUCT.md 的音色目录一节。
- 不要提交 `public/`、`node_modules/`、`.dev.vars`、`.keys/`、`worker-inline/assets.generated.ts`。
