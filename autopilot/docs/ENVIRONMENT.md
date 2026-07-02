# Environment Variables — Divot Lab Autopilot

## Overview

All vars go in Vercel dashboard under Settings → Environment Variables. Set for Production and Preview. Never commit values to git.

**[EXISTING]** = already in your Vercel project
**[NEW]** = must be added before the pipeline will run

---

## Existing Variables

```
DATAGOLF_API_KEY            [EXISTING]
# DataGolf API key. Used in server.js and extended in autopilot/lib/datagolf.ts

ANTHROPIC_API_KEY           [EXISTING]
# Anthropic Claude API key. Used for caption generation and edit regeneration.

DATABASE_URL                [EXISTING]
# Postgres connection string. All autopilot_ tables use this connection.

NEXT_PUBLIC_BASE_URL        [EXISTING — verify]
# Full site URL: https://divotlab.com
# Verify this exists. If not, add it.
```

---

## New Variables

### Telegram Bot

```
TELEGRAM_BOT_TOKEN          [NEW]
# Token from @BotFather when you created your bot.
# Format: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz
# Never log this value.

TELEGRAM_CHAT_ID            [NEW]
# Your personal Telegram chat ID — the only ID that can approve posts.
# Find it: send any message to your bot, then call:
# https://api.telegram.org/bot{YOUR_TOKEN}/getUpdates
# Look for: message.chat.id in the response.
# Format: a plain integer, e.g. 987654321
```

**Telegram setup steps:**
1. Open Telegram → search `@BotFather` → `/newbot`
2. Follow prompts: display name = "Divot Lab Autopilot", username = "divotlab_autopilot_bot" (add numbers if taken)
3. Copy the token BotFather gives you → `TELEGRAM_BOT_TOKEN`
4. Send any message to your new bot
5. Visit `https://api.telegram.org/bot{TOKEN}/getUpdates` in browser
6. Copy `message.chat.id` → `TELEGRAM_CHAT_ID`
7. Register webhook (run once after deployment):
   ```
   https://api.telegram.org/bot{TOKEN}/setWebhook?url=https://divotlab.com/api/autopilot/telegram/webhook
   ```
8. No SDK needed — the Telegram Bot API is called directly via fetch

---

### Tomorrow.io (Weather)

```
TOMORROWIO_API_KEY          [NEW]
# Free tier: 500 calls/day, 25 calls/hour.
# With caching, well within limits during tournament weeks.
# Sign up at tomorrow.io → Dashboard → Development → API Keys
# Format: a long alphanumeric string
```

**Tomorrow.io setup steps:**
1. Create free account at tomorrow.io
2. Dashboard → Development → API Keys → Create Key
3. Name it "divotlab-autopilot"
4. Copy key → `TOMORROWIO_API_KEY`
5. No SDK needed — called directly via fetch to:
   `https://api.tomorrow.io/v4/weather/forecast?location={lat},{lng}&apikey={key}`

**Free tier limits:**
- 500 calls/day
- 25 calls/hour
- With 2-hour caching per course per day, a full tournament week uses ~20–30 calls total — well within limits

---

### X (Twitter)

```
X_API_KEY                   [NEW]
# X Developer App API Key (Consumer Key)
# developer.twitter.com → Your App → Keys and Tokens

X_API_KEY_SECRET            [NEW]
# X Developer App API Key Secret (Consumer Secret)

X_ACCESS_TOKEN              [NEW]
# Access Token for @divotlabgolf — must have Read and Write permissions
# Generate while logged in as @divotlabgolf in developer.twitter.com

X_ACCESS_TOKEN_SECRET       [NEW]
# Access Token Secret for @divotlabgolf
```

**X API setup steps:**
1. Apply at developer.twitter.com (use @divotlabgolf account — approval is usually instant)
2. Create a Project → create an App within it
3. App Settings → User authentication settings → enable OAuth 1.0a → set permissions to Read and Write
4. Keys and Tokens → generate Consumer Keys → generate Access Token & Secret
5. The Access Token is tied to whichever account you're logged into when generating — confirm it's @divotlabgolf
6. `npm install twitter-api-v2`

**Cost:** Free tier is sufficient. 1,500 tweets/month write access covers ~10/week target with room to spare.

---

### Instagram

```
INSTAGRAM_ACCESS_TOKEN      [NEW]
# Long-lived User Access Token (60-day expiry, refreshable)
# See setup steps below — this takes ~30 minutes to generate correctly

INSTAGRAM_USER_ID           [NEW]
# Numeric Instagram User ID for @divotlab
# Find it after generating your access token:
# GET https://graph.instagram.com/me?fields=id,username&access_token={token}
# Use the "id" field value (a long integer)
```

**Instagram setup steps:**
1. Ensure @divotlab is a Professional account:
   Instagram app → Settings → Account type → Switch to Professional → Creator or Business
2. Connect @divotlab to a Facebook Page:
   Instagram app → Settings → Account → Linked accounts → Facebook
   (If you don't have a Facebook Page, create a placeholder one — it just needs to exist)
3. Go to developers.facebook.com → My Apps → Create App → Business type
4. Add product: Instagram Graph API
5. Instagram → Permissions → Add: `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`
6. Use the Graph API Explorer (developers.facebook.com/tools/explorer) to generate a User Token with those permissions
7. Exchange for long-lived token (run in browser or curl):
   ```
   GET https://graph.instagram.com/access_token
     ?grant_type=ig_exchange_token
     &client_id={app_id}
     &client_secret={app_secret}
     &access_token={short_lived_token}
   ```
8. Copy the long-lived token → `INSTAGRAM_ACCESS_TOKEN`
9. Get your User ID:
   ```
   GET https://graph.instagram.com/me?fields=id,username&access_token={long_lived_token}
   ```
   Copy the `id` value → `INSTAGRAM_USER_ID`

**Token refresh:** Long-lived tokens expire in 60 days. Add a calendar reminder every 50 days to refresh:
```
GET https://graph.instagram.com/refresh_access_token
  ?grant_type=ig_refresh_token
  &access_token={current_long_lived_token}
```
Update `INSTAGRAM_ACCESS_TOKEN` in Vercel with the new token value.

---

### Vercel Blob

```
BLOB_READ_WRITE_TOKEN       [NEW — may already exist]
# Vercel Blob storage for temporary image hosting
# Enable in Vercel dashboard: Storage → Create → Blob Store
# Name it: divotlab-autopilot-images
# Token is auto-generated — copy from the dashboard
# npm install @vercel/blob
```

---

### Autopilot Config

```
AUTOPILOT_DASHBOARD_SECRET  [NEW]
# Random secret string to protect the /autopilot status dashboard
# Generate: openssl rand -hex 32
# Used as query param: /autopilot?secret={value}

AUTOPILOT_ENABLED           [NEW]
# Set to "true" to enable the full pipeline
# Set to "false" to pause all cron activity (useful for off-weeks or debugging)
# Safe default if unset: treated as "false" — pipeline will not post

CRON_SECRET                 [AUTO — set by Vercel]
# Vercel automatically creates this for cron job authentication
# Do not set manually — Vercel manages it
# Your cron handler checks: Authorization: Bearer {CRON_SECRET}
```

---

## Environment Validation

In `autopilot/lib/config.ts` — called as the first step of every cron run:

```typescript
const REQUIRED_VARS = [
  'DATAGOLF_API_KEY',
  'ANTHROPIC_API_KEY',
  'DATABASE_URL',
  'NEXT_PUBLIC_BASE_URL',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'TOMORROWIO_API_KEY',
  'X_API_KEY',
  'X_API_KEY_SECRET',
  'X_ACCESS_TOKEN',
  'X_ACCESS_TOKEN_SECRET',
  'INSTAGRAM_ACCESS_TOKEN',
  'INSTAGRAM_USER_ID',
  'BLOB_READ_WRITE_TOKEN',
  'AUTOPILOT_DASHBOARD_SECRET',
] as const

export function validateEnv(): void {
  const missing = REQUIRED_VARS.filter(v => !process.env[v])
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`)
  }
}
```

If validation fails, the cron logs the error and returns 200 (so Vercel doesn't disable the cron job). No posts are attempted.

---

## Local Development

Create `autopilot/.env.local` (gitignored):
```bash
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
TOMORROWIO_API_KEY=...
X_API_KEY=...
# etc.
```

For local Telegram testing: your bot webhook will point to production. For local testing of the bot flow, use ngrok to expose your local server and temporarily update the webhook URL. Reset to the production URL when done.

For Tomorrow.io local testing: the free tier has enough calls to test directly — no mock needed.
