# 更新音色目录

1. 下载 Edge 朗读音色列表覆盖 `data/edge-voices.raw.json`：
   `curl "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491D6F4" -H "User-Agent: Mozilla/5.0 … Edg/130.0.0.0" -o data/edge-voices.raw.json`
2. （可选）用 Worker 同款 Translator token 拉 `https://<region>.tts.speech.microsoft.com/cognitiveservices/voices/list`，只保留 raw.json 里有的音色的 LocalName / VoicePersonalities / TailoredScenarios / StyleList / RolePlayList / SecondaryLocaleList，写进 `data/azure-voices.subset.json`
3. 新增的中文音色补进 `scripts/gen-voices.mjs` 的 `ZH` 表（人工标注音高 / 质感 / 年龄 / 口音）
4. `pnpm voices`，检查输出的统计；更新 docs/PRODUCT.md 的快照数字
