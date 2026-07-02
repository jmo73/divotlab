# Build Order — Divot Lab Autopilot

## How to Use This File

Step-by-step build sequence for Claude Code. Each phase is self-contained and testable before moving to the next. Do not skip phases or build ahead.

At the start of every Claude Code session:
1. Read `CLAUDE.md`
2. Read `ARCHITECTURE.md`
3. Read `CONTENT_QUALITY.md`
4. Read this file
5. Then the specific doc for the phase being worked on

---

## Phase 0: Setup and Validation
*Est. 30 minutes*

**Goal:** Repo is ready, dependencies installed, directory structure exists, types compile.

**Steps:**

1. Install new npm packages:
   ```bash
   npm install twitter-api-v2 sharp @vercel/blob
   npm install --save-dev @types/sharp
   ```
   Note: No Twilio, no telegram SDK — Telegram Bot API is called directly via fetch.

2. Create the `autopilot/` directory structure exactly as specified in `CLAUDE.md`

3. Create `autopilot/lib/types.ts` — full type definitions from `DATABASE.md` TypeScript types section

4. Create `autopilot/lib/config.ts` — env validation and typed config object from `ENVIRONMENT.md`

5. Create `autopilot/scripts/validate-env.ts`:
   ```typescript
   import { validateEnv } from '../lib/config'
   try { validateEnv(); console.log('All env vars present.') }
   catch (e) { console.log(e.message) }
   ```

6. Run: `npx tsx autopilot/scripts/validate-env.ts`
   Expected output at this stage: lists missing vars (expected — not all are set yet)

**Done when:** Directory structure exists, packages installed, types compile with zero errors.

---

## Phase 1: Database
*Est. 45 minutes*

**Goal:** All five autopilot tables exist and are queryable.

**Steps:**

1. Read `DATABASE.md` fully before writing any SQL

2. Create `db/migrations/004_autopilot.sql` with all five CREATE TABLE statements:
   - `autopilot_queue` (including edit columns: `edit_platform`, `edit_count`, `edit_history`, `telegram_message_id`, `raw_data`, `context`, `weather_context`, `caption_x_original`, `caption_ig_original`)
   - `autopilot_post_log`
   - `autopilot_evergreen_bank` (including `series_name`, `series_order`)
   - `autopilot_weather_cache`
   - `autopilot_cron_log`
   - All indexes

3. Run migration against Postgres

4. Create `autopilot/lib/db.ts` with typed query functions:
   - `createQueuedPost(data)` → `QueuedPost`
   - `getQueuedPost(id)` → `QueuedPost`
   - `updateQueueStatus(id, status, extra?)` → void
   - `getPendingEditPost()` → `QueuedPost | null` (finds any `pending_edit` row)
   - `saveEditResult(id, instruction, platform, newCaptionX, newCaptionIG)` → void
   - `logPostResult(queueId, result)` → void
   - `checkDeduplication(triggerType)` → `boolean`
   - `getNextEvergreenItem(triggerType)` → `EvergreenItem | null`
   - `expireOldPendingPosts()` → `{ id: string, telegramMessageId: number | null }[]`
   - `getWeatherCache(courseKey, date)` → `WeatherContext | null`
   - `setWeatherCache(courseKey, date, data)` → void

5. Test: `npx tsx autopilot/scripts/test-db.ts`
   - Insert row into `autopilot_queue`
   - Read it back
   - Simulate edit: update `status = 'pending_edit'`, read `getPendingEditPost()`
   - Update status to `skipped`
   - Verify, clean up

**Done when:** Migration clean, all DB functions work, test passes.

---

## Phase 2: Image Generation
*Est. 2–3 hours*

**Goal:** Given a template ID and fields object, produce a 1080×1080px PNG buffer.

**Steps:**

1. Read `TEMPLATES.md` fully before writing any SVG. The layout specs, token names, and design tokens must be followed exactly.

2. Create `autopilot/lib/imageGen.ts`:
   - `generateImage(templateId, fields)` → `Promise<Buffer>`
   - `escapeXml(str)` — escape &, <, >, ", ' before injection
   - Validate no unreplaced `{{TOKEN}}` remain after injection
   - Sharp PNG conversion at 1080×1080

3. Create all 9 SVG template files in `autopilot/templates/`:
   - `leaderboard.svg`
   - `player-stat.svg`
   - `model-pick.svg`
   - `cut-line.svg`
   - `evergreen-fact.svg`
   - `quote-insight.svg` (new — text-forward, 3px green-light left accent bar)
   - `comparison.svg` (new — two-column, split at x:540)
   - `course-breakdown.svg` (new — course profile layout)
   - `weather-card.svg` (new — wind speed hero number)

   Each template must:
   - Use exact design tokens from `TEMPLATES.md`
   - Include the logo block inline (never `<image>` tag)
   - Include the footer block
   - Use `{{TOKEN}}` for all dynamic fields
   - Load Google Fonts via `<defs><style>@import url(...)</style></defs>`

4. Test: `npx tsx autopilot/scripts/test-image.ts`
   - Generates one sample PNG per template with realistic dummy data
   - Saves to `autopilot/test-output/` (add to .gitignore)
   - Open each PNG and visually check:
     - [ ] Logo visible and correct
     - [ ] Fonts rendered (not system fallback)
     - [ ] Colors match design tokens exactly
     - [ ] No `{{TOKEN}}` visible anywhere
     - [ ] Numbers in JetBrains Mono
     - [ ] Exactly 1080×1080px
     - [ ] File size under 1MB

**Done when:** All 9 templates render correctly and pass visual check.

---

## Phase 3: DataGolf Client
*Est. 1.5 hours*

**Goal:** Typed fetch functions for all data required by every trigger.

**Steps:**

1. Read `TRIGGERS.md` — note every data field in every trigger's data payload

2. Create `autopilot/lib/datagolf.ts`:
   - Do NOT modify `server.js`
   - Use `DATAGOLF_API_KEY` from config
   - Implement:
     - `getTournamentStatus()` → `TournamentStatusResult`
     - `getLiveLeaderboard(eventId)` → full top-N with SG data
     - `getPreTournamentPredictions(eventId)` → model picks, win probabilities
     - `getPlayerSkillRatings(playerNames[])` → DG ratings map
     - `getMidRoundMovers(eventId, minPositionsGained)` → movers array
     - `getCutBubble(eventId)` → bubble players
     - `getFieldStrength(eventId)` → avg DG rating, top-rated players
     - `getPlayerCourseHistory(playerName, eventId)` → historical performance
     - `getCourseHistoricalContext(eventId)` → course avg score, key stats
     - `getFullFieldMetric(eventId, metric)` → for superlative verification
   - All functions: typed returns, graceful error handling, never return undefined silently

3. Test: `npx tsx autopilot/scripts/test-datagolf.ts`
   - Calls each function, logs result shape
   - Run during a live tournament for best results; note which functions need mock data off-week

**Done when:** All DataGolf functions return correct typed data, errors handled.

---

## Phase 4: Weather Client
*Est. 45 minutes*

**Goal:** Fetch and interpret weather conditions for a given course and date.

**Steps:**

1. Create `autopilot/lib/courseRegistry.ts`:
   - Static map of PGA Tour venue names to GPS coordinates
   - Must cover all regular tour stops at minimum:
     ```typescript
     export const COURSE_REGISTRY: Record<string, { lat: number, lng: number, key: string }> = {
       'Augusta National Golf Club': { lat: 33.5021, lng: -82.0232, key: 'augusta-national' },
       'Pebble Beach Golf Links': { lat: 36.5682, lng: -121.9508, key: 'pebble-beach' },
       'TPC Sawgrass': { lat: 30.1975, lng: -81.3963, key: 'tpc-sawgrass' },
       // ... all regular tour stops
     }
     ```

2. Create `autopilot/lib/weather.ts`:
   - `getConditions(courseKey, forecastDate)` → `WeatherContext`
   - Checks `autopilot_weather_cache` first (2-hour TTL)
   - Fetches from Tomorrow.io if cache miss
   - Applies interpretation logic from `CONTENT_QUALITY.md`:
     - `interpretWind(speedMph)` → human-readable impact string
     - `getConditionsFlag(windMph, precipChance)` → `ConditionsFlag`
     - `buildConditionsSummary(data)` → one-line summary for captions
   - Saves result to cache

3. Test: `npx tsx autopilot/scripts/test-weather.ts`
   - Fetch conditions for Augusta National for today's date
   - Log full `WeatherContext` object
   - Run twice — second call should hit cache

**Done when:** Weather fetches correctly, interpretation logic works, caching confirmed.

---

## Phase 5: Enrichment Layer
*Est. 1.5 hours*

**Goal:** Given a trigger result, produce a complete `PostContext` object that makes captions analytical.

**Steps:**

1. Read `CONTENT_QUALITY.md` fully — the enrichment layer is the operational implementation of that doc

2. Create `autopilot/lib/enrichment.ts`:
   - `buildPostContext(trigger)` → `PostContext`
   - Runs DataGolf and weather fetches in parallel (`Promise.all`)
   - `computeInsightFlags(trigger, weather, courseHistory, playerHistory)` → `InsightFlags`
   - `buildContextSummary(context)` → string for Claude API prompts (from `CAPTIONS.md`)
   - `selectTemplate(triggerType, context)` → `TemplateId | null`

3. Test: `npx tsx autopilot/scripts/test-enrichment.ts`
   - Run enrichment for `pre_tournament_model_picks` with a real upcoming event
   - Log full `PostContext` and `InsightFlags`
   - Verify insight flags make sense given the data
   - Verify template selection returns correct template

**Done when:** Context object complete, insight flags accurate, template selection logic correct.

---

## Phase 6: Caption Generation
*Est. 1 hour*

**Goal:** Given trigger type, platform, data, and context, return a brand-compliant caption.

**Steps:**

1. Read `CAPTIONS.md` and `CONTENT_QUALITY.md` before writing any prompt code

2. Create `autopilot/lib/claude.ts`:
   - `generateCaption(triggerType, platform, data, context)` → `Promise<string>`
   - `regenerateCaption(originalCaption, instruction, platform, data, context)` → `Promise<string>`
   - System prompts: initial generation and edit regeneration (from `CAPTIONS.md`)
   - User prompt builders for each trigger type
   - `buildContextSummary(context)` — included in every user prompt
   - Fallback captions for each trigger type
   - Post-processing: strip exclamation points, validate character limits

3. Test: `npx tsx autopilot/scripts/test-captions.ts`
   - Generate X and IG captions for each trigger type with realistic data
   - Log output with character counts
   - Visually verify: no exclamation points, data-first tone, numbers have context
   - Test `regenerateCaption` with sample instructions:
     - "Change wind speed to 22mph"
     - "Remove the last sentence"
     - "Make it shorter"

**Done when:** All trigger types produce good captions, regeneration works, fallbacks present.

---

## Phase 7: Scheduler
*Est. 1.5 hours*

**Goal:** Select the correct trigger, fetch data, run enrichment.

**Steps:**

1. Read `TRIGGERS.md` — priority order is critical

2. Create `autopilot/lib/scheduler.ts`:
   - `runScheduler(jobType)` → `SchedulerResult | null`
   - Tournament detection
   - Trigger eligibility per trigger type
   - Deduplication check
   - Priority-ordered selection
   - Data fetch for selected trigger
   - Returns `null` if nothing eligible (cron exits cleanly)

3. Test: `npx tsx autopilot/scripts/test-trigger.ts --trigger=pre_tournament_model_picks --dry-run`
   - `--dry-run`: full scheduler + enrichment + content generation, no queue, no Telegram
   - `--trigger=X`: force a specific trigger regardless of eligibility
   - Log full output: trigger selected, raw data, context, template, captions

**Done when:** Correct trigger selected, dedup works, dry-run produces correct content shape.

---

## Phase 8: Queue and Blob Storage
*Est. 1 hour*

**Goal:** Generated content is uploaded to Vercel Blob and saved to the queue.

**Steps:**

1. Create `autopilot/lib/queue.ts`:
   - `createPost(schedulerResult, context)`:
     1. Generate image buffer via `imageGen.ts`
     2. Generate X caption via `claude.ts`
     3. Generate Instagram caption via `claude.ts`
     4. Upload PNG to Vercel Blob (public URL)
     5. Save all to `autopilot_queue` including `raw_data` and `context` JSONB
     6. Return `QueuedPost`
   - `firePosting(postId)`:
     1. Re-read post from DB (verify status = 'approved')
     2. Convert PNG → JPEG for Instagram via Sharp
     3. Post to X and Instagram in parallel (`Promise.allSettled`)
     4. Log results to `autopilot_post_log`
     5. Update queue status
     6. Send Telegram confirmation

2. Test: `npx tsx autopilot/scripts/test-trigger.ts --trigger=live_leaderboard_r1_end --queue`
   - `--queue` flag: creates queue entry and Blob upload, no Telegram
   - Verify: row in `autopilot_queue` with status `pending`
   - Verify: Blob URL is publicly accessible in browser
   - Verify: `raw_data` and `context` stored correctly as JSONB

**Done when:** Queue row created with all fields, Blob URL accessible, image correct.

---

## Phase 9: Telegram Integration
*Est. 2 hours — most complex phase*

**Goal:** Send approval messages, handle button taps, handle edit instructions, send confirmations.

**Steps:**

1. Read `APPROVAL.md` fully — multiple times if needed. The state machine is the critical part.

2. Create `autopilot/lib/telegram.ts`:
   - `sendApprovalMessage(post, imageBuffer)` — sends photo + caption preview + inline keyboard
   - `sendTelegramMessage(text, inlineKeyboard?)` — generic text message sender
   - `editTelegramMessage(messageId, text, inlineKeyboard?)` — update existing message (removes buttons on expiry)
   - `answerCallbackQuery(callbackQueryId)` — required after every button tap
   - `buildApprovalKeyboard(postId)` — the 5-button layout
   - Helper: `buildApprovalMessageText(post)` — formats caption preview with conditions context

3. Create `app/api/autopilot/telegram/webhook/route.ts`:
   - `POST` handler
   - Verify `chat_id` === `TELEGRAM_CHAT_ID`
   - Route by update type: `callback_query` vs `message.text`
   - `handleCallbackQuery(query)`:
     - Parse `action:postId` from `callback_query.data`
     - Route to: `handleApprove`, `handleEditStart`, `handleSkip`, `handleEditCancel`
   - `handleTextMessage(message)`:
     - Check `getPendingEditPost()` — is there an edit in progress?
     - YES → `processEditInstruction(postId, text, editPlatform)`
     - NO → send "No post is waiting for edits."
   - Always `answerCallbackQuery` after button taps
   - Always return `200 OK` — Telegram disables webhooks that error repeatedly

4. Implement each handler:
   - `handleApprove(postId, message)`:
     - Atomic update: `WHERE status = 'pending'` — if 0 rows, already handled
     - Fire `firePosting(postId)` async (do not await in response)
     - Send: "Posting now..."
   - `handleEditStart(postId, platform, message)`:
     - Update status → `pending_edit`, set `edit_platform`
     - Store `telegram_message_id`
     - Send edit prompt with Cancel button
   - `handleEditCancel(postId, message)`:
     - Update status → `pending`
     - Clear `edit_platform`
     - Resend approval keyboard
   - `handleSkip(postId, message)`:
     - Update status → `skipped`
     - Send: "Skipped. No post was made."
   - `processEditInstruction(postId, instruction, platform)`:
     - Update status → `pending_edit_regenerating`
     - Load `raw_data` and `context` from queue (never re-fetch)
     - Call `regenerateCaption()` for the relevant platform(s)
     - Save edit result via `saveEditResult()`
     - Send new preview message with updated captions and approval keyboard

5. Register webhook (run once after Phase 9 is deployed):
   ```
   https://api.telegram.org/bot{TOKEN}/setWebhook?url=https://divotlab.com/api/autopilot/telegram/webhook
   ```

6. Test: `npx tsx autopilot/scripts/test-telegram.ts`
   - Creates a test queue entry with sample data
   - Sends real approval message to Telegram
   - Verify: image renders inline, captions visible, buttons appear
   - Tap Edit — verify bot prompts for instruction
   - Send instruction — verify regeneration and new preview
   - Tap Approve — verify `firePosting` is called (will fail at posting stage — expected at this phase)
   - Tap Skip — verify status update and confirmation message

**Critical:** Test each button and the edit flow manually before moving to Phase 10.

**Done when:** Full Telegram flow works end-to-end including edit → regenerate → new preview.

---

## Phase 10: X and Instagram Posting
*Est. 2 hours*

**Goal:** Approval triggers posts to both platforms simultaneously.

**Steps:**

1. Create `autopilot/lib/twitter.ts` — X posting via `twitter-api-v2`:
   - Upload media buffer
   - Post tweet with media and caption
   - Return `{ postId, postUrl }`
   - Handle 429 rate limit: log and return error, do not retry

2. Create `autopilot/lib/instagram.ts` — Instagram Graph API:
   - Create media container (using Vercel Blob URL as `image_url`)
   - Poll `status_code` until `FINISHED` (max 10 polls, 3s apart)
   - Publish container
   - Fetch permalink
   - Return `{ postId, postUrl }`
   - Handle container errors: throw with descriptive message

3. Wire into `queue.ts` `firePosting()`:
   - Convert PNG → JPEG via Sharp (`quality: 92`)
   - `Promise.allSettled([postToTwitter(...), postToInstagram(...)])`
   - Log both results
   - Determine final status: `posted` | `partial` | `failed`
   - Send Telegram confirmation with post URLs

4. Test sequence (in order, do not skip):
   a. `--dry-run` — confirm no real posts
   b. Test X alone: `npx tsx autopilot/scripts/test-trigger.ts --trigger=evergreen_stat_of_week --post-x-only`
   c. Verify post appears on @divotlabgolf (can delete after)
   d. Test Instagram alone: `--post-ig-only`
   e. Verify post appears on @divotlab (can delete after)
   f. Test simultaneous: `--post-both`
   g. Test partial failure: mock X client to throw, verify Instagram still posts and `partial` status set
   h. Confirm Telegram confirmation message arrives after each test

**Done when:** Both platforms post, partial failures handled, Telegram confirms with URLs.

---

## Phase 11: Cron Jobs
*Est. 45 minutes*

**Goal:** Vercel Cron triggers the full pipeline automatically.

**Steps:**

1. Create `app/api/autopilot/cron/route.ts`:
   ```typescript
   export const runtime = 'nodejs'
   export const maxDuration = 60

   export async function GET(req: Request) {
     // 1. Verify Vercel Cron secret
     if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
       return new Response('Unauthorized', { status: 401 })
     }

     const jobType = new URL(req.url).searchParams.get('job') as 'tournament' | 'evergreen'
     const startTime = Date.now()
     let cronLog: Partial<CronLogEntry> = { jobName: jobType }

     try {
       validateEnv()

       // Expire stale posts and remove their Telegram keyboard buttons
       const expired = await expireOldPendingPosts()
       for (const post of expired) {
         if (post.telegramMessageId) {
           await editTelegramMessage(post.telegramMessageId, '⏱ Post expired — no action taken.', [])
         }
       }

       // Run scheduler
       if (process.env.AUTOPILOT_ENABLED !== 'true') {
         cronLog.skipReason = 'AUTOPILOT_ENABLED is not true'
         await logCronRun({ ...cronLog, durationMs: Date.now() - startTime })
         return new Response('OK', { status: 200 })
       }

       const result = await runScheduler(jobType)
       cronLog.tournamentStatus = result?.tournamentStatus
       cronLog.eventName = result?.eventName

       if (!result) {
         cronLog.skipReason = 'No eligible trigger'
         await logCronRun({ ...cronLog, durationMs: Date.now() - startTime })
         return new Response('OK', { status: 200 })
       }

       cronLog.triggerSelected = result.triggerType

       const context = await buildPostContext(result)
       const post = await createPost(result, context)
       await sendApprovalMessage(post, post.imageBuffer)

       await logCronRun({ ...cronLog, durationMs: Date.now() - startTime })

     } catch (err) {
       cronLog.error = err instanceof Error ? err.message : String(err)
       await logCronRun({ ...cronLog, durationMs: Date.now() - startTime })
     }

     return new Response('OK', { status: 200 })
   }
   ```

2. Update `vercel.json`:
   ```json
   {
     "crons": [
       {
         "path": "/api/autopilot/cron?job=tournament",
         "schedule": "*/30 * * * 4,5,6,0"
       },
       {
         "path": "/api/autopilot/cron?job=evergreen",
         "schedule": "0 14 * * 1,2,3"
       }
     ]
   }
   ```

3. Verify cron jobs appear in Vercel dashboard under Settings → Cron Jobs

4. Manually invoke to test: click "Run" in Vercel cron dashboard
   - Watch `autopilot_cron_log` table for entry
   - Verify Telegram message arrives if `AUTOPILOT_ENABLED=true`

**Done when:** Both cron jobs show in Vercel, manual invocation triggers full pipeline.

---

## Phase 12: Dashboard
*Est. 1 hour*

**Goal:** Simple protected read-only status page at `/autopilot`.

**Steps:**

1. Create `app/api/autopilot/status/route.ts`:
   - Protected by `?secret={AUTOPILOT_DASHBOARD_SECRET}` query param
   - Returns JSON: last 20 queue entries, cron log last 7 days, counts by status

2. Create `app/autopilot/page.tsx`:
   - Check `searchParams.secret` against `AUTOPILOT_DASHBOARD_SECRET`
   - Unauthorized → simple "Not authorized" message
   - Authorized → table of recent posts with status, trigger type, platforms, timestamps, post URLs
   - Second section: cron log — last 20 runs with status and any errors
   - Minimal styling — function over form, must be readable on phone

**Done when:** Dashboard loads at `/autopilot?secret=...`, shows accurate data, readable on mobile.

---

## Phase 13: Evergreen Bank Seed
*Est. 2–3 hours (writing content, not coding)*

**Goal:** 40+ active evergreen items in the bank before first full week of operation.

**Steps:**

1. Create `autopilot/scripts/evergreen-seed-data.ts`:
   Topic definitions for all 40 items across 5 series.
   Each topic definition includes: `content_id`, `trigger_type`, `topic`, `series_name`, `series_order`, `template_id`, key insight, primary stat, supporting context.

2. Create `autopilot/scripts/seed-evergreen.ts`:
   - Reads topic definitions
   - For each: builds template fields + calls Claude API for X and IG captions
   - Inserts with `active = false`
   - Outputs review list to console

3. Run seed script: `npx tsx autopilot/scripts/seed-evergreen.ts`

4. Review generated captions. For each approved item, run:
   ```sql
   UPDATE autopilot_evergreen_bank SET active = true WHERE content_id = 'your-content-id';
   ```

5. Verify minimum 40 active items:
   ```sql
   SELECT trigger_type, COUNT(*) FROM autopilot_evergreen_bank WHERE active = true GROUP BY trigger_type;
   ```

**Done when:** 40+ active items confirmed in bank across all 5 series.

---

## Full End-to-End Test

Run after all phases complete:

1. Set `AUTOPILOT_ENABLED=true`
2. Manually invoke tournament cron from Vercel dashboard
3. Watch `autopilot_cron_log` — verify run entry appears
4. Telegram message arrives within 30 seconds
5. Image renders inline — visually correct
6. Captions display in full — read them, check quality
7. Tap "✎ Edit Both" — bot prompts for instruction
8. Type "Remove the last sentence" — regenerated caption arrives
9. Tap "✓ Approve"
10. Bot responds: "Posting now..."
11. Both X and Instagram posts go live
12. Telegram confirmation arrives with post URLs
13. Dashboard at `/autopilot?secret=...` shows the post as `posted`
14. `autopilot_post_log` has a record with both platform post IDs

---

## What NOT to Build

- No caption editing UI beyond Telegram — the bot is the interface
- No automatic retries on failed posts — log, alert, done
- No multi-user support — single operator tool
- No public-facing post queue or scheduling UI
- No complex authentication — secret param on dashboard is sufficient
