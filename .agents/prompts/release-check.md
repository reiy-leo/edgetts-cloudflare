# 上线前检查

1. `pnpm typecheck && pnpm build && pnpm test` 通过（可加 `TTS_LIVE=1` 真实合成）
2. 线上 secrets 齐全：API_KEY、SESSION_SECRET、GOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET
3. Google Cloud 回调地址包含 `https://edgetts-cloudflare.rei8t.dev/auth/callback`
4. `pnpm deploy:inline`（API Token 部署必须用内联版）
5. 验证：`/health` 200 成功；`/` 200 成功；`/v1/models` 无 key 401 未授权、带 key 200 成功；`/api/speech` 未登录 401 未授权；登录后网页生成一次
