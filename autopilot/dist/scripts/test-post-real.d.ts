/**
 * Real post test — Telegram gate → X post.
 *
 * Fetches live DataGolf data, picks the most post-worthy card type,
 * renders it, generates captions via Claude, sends to Telegram for approval,
 * and on approval actually posts to X.
 *
 * Instagram is skipped until BLOB_READ_WRITE_TOKEN is set (image needs a public URL).
 *
 * Run from /autopilot:
 *   npx tsx scripts/test-post-real.ts
 *
 * Required env vars:
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, DATAGOLF_API_KEY,
 *   ANTHROPIC_API_KEY, X_API_KEY, X_API_KEY_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET
 */
export {};
//# sourceMappingURL=test-post-real.d.ts.map