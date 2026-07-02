# Autopilot Roadmap — Current State & Next Steps

Last updated: 2026-07-01

---

## Current State

### What Works (Confirmed)

- **Pipeline end-to-end:** DataGolf → Claude Haiku → Upstash KV → Telegram → X post
- **Phone approval flow:** Vercel route awaits `run()`, posts Telegram message, user taps on phone, webhook fires and posts to X
- **Sharp:** Lazy dynamic import pattern fixed. imageGen.ts and queue.ts both use `import('sharp')` at call time — no more native binary failure on Vercel
- **Telegram webhook:** Registered at `https://divotlab-api.vercel.app/api/autopilot/telegram/webhook` via `setWebhook`
- **`post-wednesday-top10`:** CONFIRMED working — 2 posts to X confirmed 2026-07-01

### Scripts (8 content scripts, all same pattern)

| Script | Trigger | Status | Notes |
|---|---|---|---|
| `post-monday-recap` | Manual after results | Untested | Reads season-tracker.json only, no DataGolf call |
| `post-monday-field` | Manual | Untested | Field preview, DataGolf pre-tournament |
| `post-tuesday-model` | Vercel cron Tue 19:00 UTC | Untested | 2 tweets per run |
| `post-wednesday-top10` | GitHub Actions / manual | ✅ Working | 2 posts confirmed |
| `post-wednesday-picks` | Manual after picks set | Untested | Reads pro-picks.json |
| `post-thursday-course-stat` | Vercel cron Thu 18:00 UTC | Untested | 2 tweets per run |
| `post-friday-darkhorse` | GitHub Actions / cron | Untested | Finds fit/odds divergence |
| `post-saturday-update` | GitHub Actions / cron | Untested | Live leaderboard snapshot |
| `post-sunday-contenders` | GitHub Actions / cron | Untested | Cut survivors + model picks |
| `post-round-recap` | Manual / cron post-round | Untested | Summarizes round SG data |

### What's NOT Working Yet

- **Instagram:** Never tested. Requires Instagram account set to Professional + Facebook Business page linked. Blob upload → Instagram Graph API two-step (container → publish) not validated.
- **Image/graphics:** All 10 SVG templates exist and `generateImage()` is implemented, but zero scripts currently call it. All posts are text-only.
- **Vercel cron timing:** Tue/Thu crons are configured in `api/vercel.json` but have never fired in production — need a real Tuesday/Thursday to verify.
- **Edit flow:** Telegram edit (type a correction → Claude regenerates → new preview) exists in `telegramWebhook.ts` but has never been tested.

---

## Phase 1: Verify All Text Scripts (Next 2 Tournament Weeks)

Test each script manually by running from the `autopilot/` directory:

```
npx tsx scripts/post-monday-recap.ts
npx tsx scripts/post-monday-field.ts
npx tsx scripts/post-tuesday-model.ts
npx tsx scripts/post-thursday-course-stat.ts
npx tsx scripts/post-friday-darkhorse.ts
npx tsx scripts/post-saturday-update.ts
npx tsx scripts/post-sunday-contenders.ts
npx tsx scripts/post-round-recap.ts
npx tsx scripts/post-wednesday-picks.ts
```

Each should: print data to console → generate tweet → send Telegram message → post to X on phone approval.

If a script fails:
- Check the Vercel function logs (`vercel logs --prod`) for the `/api/autopilot/telegram/webhook` route
- Common failure: Claude output not valid JSON → check `SYSTEM_PROMPT` instructions and `match` pattern
- Fallback: the Telegram notification will show the error via `tgNotify`

---

## Phase 2: Instagram End-to-End

### Setup (one-time)
1. Ensure @divotlab Instagram is set to Professional Account (Creator or Business)
2. Connect it to a Facebook Business Page (required for Graph API)
3. Confirm `INSTAGRAM_ACCESS_TOKEN` and `INSTAGRAM_USER_ID` are set in Vercel env
4. Confirm `BLOB_READ_WRITE_TOKEN` is set (used to upload images for Instagram — Graph API needs a public URL, not a buffer)

### Test
Run `post-wednesday-top10` on a week where you've already posted to X, and approve the Instagram send from the Telegram message. The buttons currently show `📝 Text only (X)` — to also add an Instagram option, the `publish()` call needs a second platform. Once images work, the full flow will use Telegram to approve both platforms simultaneously.

---

## Phase 3: Image/Graphics (The Big One)

### What Already Exists

All infrastructure is built. The gap is that no script calls `generateImage()`:

- **10 SVG templates** in `autopilot/templates/`: `leaderboard.svg`, `player-stat.svg`, `model-pick.svg`, `cut-line.svg`, `evergreen-fact.svg`, `quote-insight.svg`, `comparison.svg`, `course-breakdown.svg`, `weather-card.svg`, `player-hero.svg`
- **`generateImage(templateId, fields)`** in `imageGen.ts` — renders SVG with `{{TOKEN}}` replacement → PNG via Sharp
- **`extendForInstagram(pngBuffer)`** — adds a branded 270px footer strip → 1080×1350 (4:5 ratio)
- **`publish({ tweet, imageBuffer, tgPreview, label })`** in `publisher.ts` — accepts optional `imageBuffer`, uploads to Vercel Blob, includes image in Telegram preview

### Wire-Up Plan (per script)

**`post-wednesday-top10` → `model-pick.svg`** (highest value, do first)

The `model-pick.svg` template already has the right structure: NO. 1 / NO. 2 / NO. 3 picks + DARK HORSE section. Fields to inject:

```typescript
const imageBuffer = await generateImage('model-pick', {
  EVENT_NAME: eventName,
  CONDITIONS_SUMMARY: `${course} · Pre-Tournament`,
  P1_NAME: targets[0].name,
  P1_WIN_PCT: targets[0].top10Pct,          // e.g. "34.2%"
  P1_KEY_STRENGTH: `Course fit: ${targets[0].fitScore}/100`,
  P2_NAME: targets[1].name,
  P2_WIN_PCT: targets[1].top10Pct,
  P2_KEY_STRENGTH: `Course fit: ${targets[1].fitScore}/100`,
  P3_NAME: targets[2].name,
  P3_WIN_PCT: targets[2].top10Pct,
  P3_KEY_STRENGTH: `Course fit: ${targets[2].fitScore}/100`,
  DH_NAME: darkHorse.name,
  DH_REASON: `Fit #${darkHorse.fitRank} · Win rank #${darkHorse.winRank}`,
})
```

Then pass `imageBuffer` to `publish()`.

Note: `model-pick.svg` needs a dark horse player — add the same dark horse logic from `post-friday-darkhorse.ts` to compute a 4th player.

**`post-friday-darkhorse` → `player-stat.svg`**
- Show: name, course fit score, dominant stat vs field average, win rank vs fit rank divergence

**`post-thursday-course-stat` → `course-breakdown.svg`**
- Show: course name, the 4 weight bars (App/Putt/OTT/ARG), dominant stat highlighted, field leader name

**`post-saturday-update` / `post-sunday-contenders` → `leaderboard.svg`**
- Show: top 5 current leaderboard positions, score-to-par, course fit score alongside

**`post-round-recap` → `leaderboard.svg` or `player-stat.svg`**
- Show: winner SG breakdown by category

### Testing Images Locally

```
cd autopilot
npx tsx scripts/test-image.ts
```

This renders all templates to `autopilot/test-output/` with dummy data. Check those PNGs to verify font embedding, layout, colors. Sharp renders on Linux (Vercel) differently than Windows for some font metrics — the safe fallback is system fonts if Google Fonts fetch fails.

---

## Phase 4: Content Variety (Tweet Mix Strategy)

### Current Weekly Mix (Text Only)

```
Mon  → Recap: last week results + honest accountability
Tue  → Model preview: win probs × course fit (2 tweets)
Wed  → Top 10 targets + Picks reveal
Thu  → Course stat breakdown (2 tweets)
Fri  → Dark horse alert
Sat  → Live leaderboard snapshot
Sun  → Contenders still live
```

This is solid but uniform — every post is analytical preview/recap data. Add these types to vary the tone:

### New Post Types to Build

**1. Fade of the Week** (Tuesday or Wednesday, 1 tweet)
"The market likes X at +odds. Our model has them ranked #N in the field by fit. The data says this is a trap."
Logic: find highest implied market probability player whose course fit score is bottom quartile. Script: `post-wednesday-fade.ts`

**2. Historical Pattern** (Tuesday, rotating)
"The last 3 winners at [Course] averaged [X] SG: Approach per round. The leader in that category this week is [Player] at +Y."
Source: `COURSE_WEIGHTS` notes field already has some of this. Long term: use `/api/historical-event-results` to compute automatically.
Script: `post-tuesday-pattern.ts` (can be simple — Claude writes from the notes field + top stat leader)

**3. Mid-Round Live Stat** (Thursday–Sunday, during rounds)
"Midway through R2 at [Event]: [Player] leads the field in SG: Approach this round at +X. He's ranked #N on course fit."
Source: `getLiveTournamentStats()` already in `datagolf.ts`. Hook into the Saturday/Sunday scripts.

**4. Pick Result Callout** (Monday, after big result)
"[Player] at +[odds]. That one hit." or "Two CUTs in a row this week. Approach weight needs a look."
Currently: `post-monday-recap.ts` covers this but could be a separate, more casual tone post.
The Monday recap tweet is already honest but could be split into: (a) dry record update, (b) a separate "take" tweet with more personality.

**5. Model vs Market Disagreement** (Wednesday)
"DG win probability: [Player] 12.4%. Market implied: 8.1%. +53% edge. We're on [Player] this week."
Essentially what the Pro dashboard's Value Finder shows — the biggest edge plays in text tweet form.
Source: cross-reference `getPreTournamentPredictions()` against `getBettingOdds()` for the biggest positive EV.

**6. Season Milestone Callouts** (as they happen)
"50 picks tracked this season. 23 hits. +28.4u." — simple milestone posts when round numbers hit.
Monitor: `season-tracker.json` totals, post when `total_picks` hits 50, 75, 100, etc.

### Instagram vs X Strategy

| Format | X (Twitter) | Instagram |
|---|---|---|
| Text posts | ALL scripts, every week | Never — text-only posts die on IG |
| Stat cards (graphics) | Attach as image | Primary format — needs 4:5 extended version |
| Pick reveals | Text (mid-week) | `model-pick.svg` image |
| Result recaps | Text | `leaderboard.svg` showing top 5 + our picks |
| Photo posts | Occasional (tournament coverage) | ~70% of feed per content strategy |

**Key rule:** Only wire Instagram into scripts that generate `imageBuffer`. Text-only scripts (`post-monday-recap`, etc.) should only post to X — no Instagram for text.

---

## Phase 5: Vercel Cron Validation

The two auto-scheduled scripts (Tuesday/Thursday) fire via Vercel cron. The routes are:

```
GET /api/autopilot/content/tuesday-model     → post-tuesday-model.js
GET /api/autopilot/content/thursday-course-stat → post-thursday-course-stat.js
```

Both require `Authorization: Bearer {CRON_SECRET}` header (set by Vercel automatically for cron jobs).

**To verify crons work:**
1. Wait for next Tuesday at 19:00 UTC / Thursday at 18:00 UTC
2. Check Vercel function logs for that route
3. You should get a Telegram message within 60 seconds of the cron firing
4. If no message: check Vercel logs for errors, then check KV for a pending post key

**To manually simulate a cron fire:**
```
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://divotlab-api.vercel.app/api/autopilot/content/tuesday-model
```

---

## Environment Variables Checklist

All of these must be in the Vercel API project (`divotlab-api`):

| Var | Required for | Status |
|---|---|---|
| `DATAGOLF_API_KEY` | All data fetches | ✅ Set |
| `ANTHROPIC_API_KEY` | Claude tweet generation | ✅ Set (added 2026-07-01) |
| `TELEGRAM_BOT_TOKEN` | Sending messages | ✅ Set |
| `TELEGRAM_CHAT_ID` | Your chat ID for routing | ✅ Set |
| `X_API_KEY` | X posting | ✅ Set |
| `X_API_SECRET` | X posting | ✅ Set |
| `X_ACCESS_TOKEN` | X posting | ✅ Set |
| `X_ACCESS_SECRET` | X posting | ✅ Set |
| `KV_REST_API_URL` | Upstash Redis (KV store) | ✅ Set |
| `KV_REST_API_TOKEN` | Upstash Redis | ✅ Set |
| `BLOB_READ_WRITE_TOKEN` | Image upload (Vercel Blob) | Check — needed for images |
| `INSTAGRAM_ACCESS_TOKEN` | Instagram posting | Check — needed for IG |
| `INSTAGRAM_USER_ID` | Instagram posting | Check — needed for IG |
| `AUTOPILOT_ENABLED` | Master on/off switch | ✅ Set to "true" |
| `CRON_SECRET` | Secures cron routes | ✅ Set by Vercel automatically |

---

## Compile + Deploy Reminder

After any TypeScript changes in `autopilot/`:

```
cd autopilot
npx tsc
cd ..
vercel --prod
```

The compiled JS goes to `api/_autopilot/` (see `tsconfig.json` outDir). If you skip the compile step, the API routes run old code.

---

## Build Priority Order

1. **Test all text scripts** — verify the working pattern extends to all 8 scripts (1 week)
2. **Wire `model-pick.svg` into `post-wednesday-top10`** — first image post (highest impact for IG)
3. **Set up Instagram** — account → Graph API test → confirm Blob upload works
4. **Wire remaining images** — course-breakdown (Thu), leaderboard (Sat/Sun), player-stat (Fri)
5. **Add Fade + Model vs Market scripts** — content variety without extra APIs
6. **Historical Pattern posts** — needs `/api/historical-event-results` data, lower priority
