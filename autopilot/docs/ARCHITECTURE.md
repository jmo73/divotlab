# Architecture — Divot Lab Autopilot

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        VERCEL CRON                              │
│   Job 1: Every 30 min Thu–Sun (tournament days)                 │
│   Job 2: Once daily at 14:00 UTC Mon–Wed (evergreen only)       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SCHEDULER                                   │
│  1. Expire stale pending posts                                  │
│  2. Check tournament status via DataGolf                        │
│  3. Determine eligible triggers                                 │
│  4. Check autopilot_post_log — deduplication                    │
│  5. Select highest-priority eligible trigger                    │
│  6. Return: { triggerType, rawData, eventMeta }                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  ENRICHMENT LAYER                               │
│  Runs in parallel:                                              │
│  ├── DataGolf: full field data, player history, course stats    │
│  ├── Tomorrow.io: wind, temp, precip for course location        │
│  └── Derived: field averages, percentiles, insight flags        │
│  Output: PostContext object (stored in queue for edit use)      │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  CONTENT GENERATOR                              │
│  1. Select template based on trigger + insight flags            │
│  2. Generate image: inject data into SVG → PNG via Sharp        │
│  3. Generate X caption via Claude API                           │
│  4. Generate Instagram caption via Claude API                   │
│  5. Bundle: { imageBuffer, captionX, captionIG, context }       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    APPROVAL GATE                                │
│  1. Upload image to Vercel Blob (public URL)                    │
│  2. Save to autopilot_queue (status: pending)                   │
│  3. Send Telegram message:                                      │
│     - Image renders inline                                      │
│     - Full X and IG captions displayed                          │
│     - Weather/conditions context shown                          │
│     - Inline keyboard: [✓ Approve] [✎ Edit] [✗ Skip]           │
│  4. Wait for webhook callback                                   │
└────────────────────────┬────────────────────────────────────────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
           Approve      Edit       Skip
              │          │          │
              │          ▼          ▼
              │  ┌──────────────┐  Mark skipped
              │  │  EDIT FLOW   │  Send Telegram
              │  │              │  confirmation
              │  │ Bot prompts  │
              │  │ for instruct │
              │  │ Claude regen │
              │  │ New preview  │
              │  │ sent         │
              │  └──────┬───────┘
              │         │ (approve after edit)
              └────┬────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                      POSTER                                     │
│  1. Convert PNG → JPEG for Instagram                            │
│  2. Post to X and Instagram simultaneously (Promise.allSettled) │
│  3. Log results to autopilot_post_log                           │
│  4. Update queue status                                         │
│  5. Send Telegram confirmation with post URLs                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Cron Schedule

### Job 1: Tournament Pipeline
```
Cron: */30 * * * 4,5,6,0
Path: /api/autopilot/cron?job=tournament
```
Fires every 30 minutes Thursday–Sunday UTC. Scheduler checks whether tournament is actually live before acting — the cron is just the heartbeat.

### Job 2: Evergreen Pipeline
```
Cron: 0 14 * * 1,2,3
Path: /api/autopilot/cron?job=evergreen
```
Fires once at 14:00 UTC (10am ET) Monday–Wednesday. Pulls from the evergreen bank regardless of tournament status.

**Separation rationale:** Prevents evergreen posts during active tournament weekends. Prevents tournament cron from wasting cycles on off-days.

---

## Tournament Detection

```typescript
type TournamentStatus = 'LIVE' | 'PRE_TOURNAMENT' | 'POST_ROUND' | 'OFF'

async function getTournamentStatus(): Promise<TournamentStatusResult> {
  const liveData = await datagolf.getLivePredictions()
  
  if (liveData.hasActiveRound) return { status: 'LIVE', ... }
  if (liveData.nextEventStartsWithin24hrs) return { status: 'PRE_TOURNAMENT', ... }
  if (liveData.lastRoundCompletedWithin12hrs) return { status: 'POST_ROUND', ... }
  return { status: 'OFF' }
}
```

---

## Enrichment Layer Detail

The enrichment layer is what separates Divot Lab content from a generic golf bot. It runs before caption generation and assembles context that the Claude API uses to write genuinely analytical captions.

```typescript
// autopilot/lib/enrichment.ts

async function buildPostContext(trigger: SchedulerResult): Promise<PostContext> {
  const [weather, courseHistory, fieldStrength, playerHistory] = await Promise.all([
    // Tomorrow.io — course GPS coordinates stored in course registry
    weather.getConditions(trigger.courseLat, trigger.courseLng, trigger.roundDate),
    
    // DataGolf historical — avg score, key course stats
    datagolf.getCourseHistoricalContext(trigger.eventId),
    
    // DataGolf field — avg DG rating, top-rated players in field
    datagolf.getFieldStrength(trigger.eventId),
    
    // DataGolf player history — only for player-specific triggers
    trigger.playerName
      ? datagolf.getPlayerCourseHistory(trigger.playerName, trigger.eventId)
      : Promise.resolve(null)
  ])
  
  return {
    tournament: buildTournamentContext(trigger, courseHistory),
    weather: interpretWeather(weather),
    field: fieldStrength,
    player: playerHistory,
    insightFlags: computeInsightFlags(trigger, weather, courseHistory, playerHistory)
  }
}
```

The `PostContext` object is stored as JSONB in `autopilot_queue.context` so caption regeneration during edits never re-fetches data. The context is the ground truth for all edits.

---

## Tomorrow.io Integration

**Endpoint used:** `https://api.tomorrow.io/v4/weather/forecast`

**What we fetch:** Hourly forecast for the course GPS coordinates on the day of the round.

**Fields used:**
- `windSpeed` (mph)
- `windDirection` (degrees → converted to compass direction)
- `temperature` (°F)
- `precipitationProbability` (%)
- `weatherCode` (mapped to human-readable condition)

**Course coordinates:** Stored in `autopilot/lib/courseRegistry.ts` — a static map of PGA Tour venue names to GPS coordinates. Populated for all regular tour stops.

**Caching:** Weather responses cached in `autopilot_weather_cache` table for 2 hours per course per date. Prevents redundant API calls when cron fires every 30 minutes.

**Free tier limits:** 500 calls/day. With caching, well within limits even during a tournament week.

---

## Edit Flow Architecture

The edit flow requires the webhook handler to maintain conversational state — knowing that an incoming text message is an edit instruction, not a random message.

State is stored in `autopilot_queue`:
- `status: 'pending_edit'` — waiting for an edit instruction
- `edit_platform: 'twitter' | 'instagram' | 'both'` — which caption is being edited
- `telegram_message_id` — the original approval message ID (for editing it later)

The webhook handler checks for a `pending_edit` row before processing any incoming text message. This is the routing logic that distinguishes edit instructions from other messages.

```
Incoming Telegram text message
  → Check: is there a pending_edit row?
    YES → treat as edit instruction → regenerate → send new preview
    NO  → ignore or send "nothing pending" message
```

---

## Post Queue State Machine

```
pending
  ↓ tap Edit
pending_edit
  ↓ instruction received
pending_edit_regenerating
  ↓ regeneration complete
pending              ← returns to pending with updated captions
  ↓ tap Approve
approved
  ↓ posting complete
posted

pending → skipped                  (tap Skip)
pending → expired                  (4 hrs, no action)
pending_edit → pending             (edit timeout after 30 min)
approved → failed                  (both platforms errored)
approved → partial                 (one platform succeeded)
```

---

## Platform Differences

| Concern | X (Twitter) | Instagram |
|---|---|---|
| Image format | PNG, max 5MB | JPEG only, max 8MB |
| Image dimensions | 1080×1080px (our standard) | 1080×1080px required |
| Caption limit | 280 chars | 2,200 chars |
| Posting flow | Single API call | Two-step: container → publish |
| Image source | Buffer upload | Public URL (Vercel Blob) |
| Rate limit | 1,500 tweets/month | 25 posts/hour |
| Hashtags | 2–3 max | 8–12 at end |
| Link in caption | Yes — divotlab.com | "link in bio" only |

---

## Image Storage

- Generated PNGs uploaded to **Vercel Blob** immediately after creation
- Blob URL is public — used for Instagram posting (requires public URL) and Telegram preview
- Blobs deleted after 48 hours regardless of post status via a cleanup job in the cron
- Post IDs from X and Instagram are the permanent record — not the images

---

## Error Handling Principles

1. **Cron always returns 200.** Log errors internally, never let cron fail silently.
2. **Enrichment failure** → log error, abort pipeline for this run. Try again next cron cycle.
3. **Image generation failure** → log error, abort. Do not send Telegram message with broken image.
4. **Claude API failure** → retry once after 2 seconds. Then use fallback caption template.
5. **Telegram send failure** → log error, mark queue item `telegram_failed`. Do not post.
6. **X API failure** → log with full response body, mark `failed` or `partial`. Send Telegram error message.
7. **Instagram API failure** → same as X.
8. **Edit regeneration failure** → send Telegram message: "Regeneration failed. Original caption kept." Return to `pending` with original captions.
9. **Token expiry during edit** → expire normally. Edit state is abandoned.

---

## Security

- Telegram webhook verifies `chat_id` matches `TELEGRAM_CHAT_ID` on every request
- Callback data uses `action:uuid` format — UUIDs are not guessable
- Dashboard endpoint requires `AUTOPILOT_DASHBOARD_SECRET` header
- Cron endpoint requires Vercel's built-in `CRON_SECRET` authorization header
- No public endpoint exposes post content, queue data, or captions
- Bot token never logged
