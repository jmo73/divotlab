# Database — Divot Lab Autopilot

## Rules

1. All new tables prefixed `autopilot_`
2. Never modify existing tables
3. All timestamps `TIMESTAMPTZ` (UTC)
4. All IDs are UUID v4 unless noted

---

## Tables

### `autopilot_queue`

Central state table. One row per post that reaches the approval stage.

```sql
CREATE TABLE autopilot_queue (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Content
  trigger_type      TEXT NOT NULL,
  trigger_label     TEXT NOT NULL,           -- "R1 Leaderboard · The Masters"
  event_name        TEXT,                    -- null for evergreen
  event_tier        TEXT,                    -- 'major' | 'signature' | 'standard' | null
  graphic_type      TEXT NOT NULL,           -- which template was used
  caption_x         TEXT NOT NULL,           -- current X caption (updated on edits)
  caption_ig        TEXT NOT NULL,           -- current IG caption (updated on edits)
  caption_x_original TEXT NOT NULL,          -- original generated caption, never overwritten
  caption_ig_original TEXT NOT NULL,
  image_blob_url    TEXT NOT NULL,
  image_blob_key    TEXT NOT NULL,

  -- Enrichment context (stored for edit regeneration — never re-fetched)
  raw_data          JSONB NOT NULL,          -- original trigger data payload
  context           JSONB NOT NULL,          -- PostContext object from enrichment layer
  weather_context   JSONB,                   -- weather data snapshot (also in context, duplicated for quick access)

  -- State machine
  -- pending | pending_edit | pending_edit_regenerating | approved
  -- posted | partial | failed | skipped | expired | telegram_failed
  status            TEXT NOT NULL DEFAULT 'pending',
  edit_platform     TEXT,                    -- 'twitter' | 'instagram' | 'both' — set during edit flow
  edit_count        INTEGER NOT NULL DEFAULT 0,
  edit_history      JSONB NOT NULL DEFAULT '[]',
  -- edit_history structure:
  -- [{ instruction: string, platform: string, timestamp: string,
  --    caption_x_before: string, caption_ig_before: string }]

  -- Telegram
  telegram_message_id BIGINT,               -- message ID of the approval message (for editing it later)

  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  telegram_sent_at  TIMESTAMPTZ,
  edit_started_at   TIMESTAMPTZ,
  approved_at       TIMESTAMPTZ,
  skipped_at        TIMESTAMPTZ,
  posted_at         TIMESTAMPTZ,

  -- Post results
  twitter_post_id   TEXT,
  twitter_url       TEXT,
  instagram_post_id TEXT,
  instagram_url     TEXT,

  -- Error tracking
  error_message     TEXT,
  error_detail      JSONB
);

CREATE INDEX idx_autopilot_queue_status ON autopilot_queue(status);
CREATE INDEX idx_autopilot_queue_created_at ON autopilot_queue(created_at);
CREATE INDEX idx_autopilot_queue_trigger_type ON autopilot_queue(trigger_type);
```

---

### `autopilot_post_log`

Immutable log. Written after posting completes (or is skipped/expired). Used for deduplication and history.

```sql
CREATE TABLE autopilot_post_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id          UUID REFERENCES autopilot_queue(id),

  trigger_type      TEXT NOT NULL,
  event_name        TEXT,
  event_tier        TEXT,
  graphic_type      TEXT,
  status            TEXT NOT NULL,           -- posted | partial | failed | skipped | expired

  -- Platform results
  twitter_success   BOOLEAN,
  twitter_post_id   TEXT,
  twitter_url       TEXT,
  twitter_error     TEXT,

  instagram_success BOOLEAN,
  instagram_post_id TEXT,
  instagram_url     TEXT,
  instagram_error   TEXT,

  -- Edit tracking
  was_edited        BOOLEAN NOT NULL DEFAULT false,
  edit_count        INTEGER NOT NULL DEFAULT 0,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_post_log_trigger_created ON autopilot_post_log(trigger_type, created_at);
CREATE INDEX idx_post_log_created_at ON autopilot_post_log(created_at);
```

---

### `autopilot_evergreen_bank`

Pre-written evergreen content items. Seeded by `scripts/seed-evergreen.ts`. Manually activated before use.

```sql
CREATE TABLE autopilot_evergreen_bank (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id        TEXT NOT NULL UNIQUE,    -- "sg-explainer-1", "course-augusta-1"

  trigger_type      TEXT NOT NULL,
  topic             TEXT NOT NULL,
  series_name       TEXT,                    -- "SG Explainer Series", "Course Profiles"
  series_order      INTEGER,                 -- position within the series (1, 2, 3...)

  -- Template
  template_id       TEXT NOT NULL,
  template_fields   JSONB NOT NULL,          -- all {{TOKEN}} values

  -- Captions (pre-written, manually approved before active = true)
  caption_x         TEXT NOT NULL,
  caption_ig        TEXT NOT NULL,

  -- State
  active            BOOLEAN NOT NULL DEFAULT false,
  last_used_at      TIMESTAMPTZ,
  use_count         INTEGER NOT NULL DEFAULT 0,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_evergreen_trigger_type ON autopilot_evergreen_bank(trigger_type);
CREATE INDEX idx_evergreen_active ON autopilot_evergreen_bank(active);
CREATE INDEX idx_evergreen_last_used ON autopilot_evergreen_bank(last_used_at);
CREATE INDEX idx_evergreen_series ON autopilot_evergreen_bank(series_name, series_order);
```

---

### `autopilot_weather_cache`

Caches Tomorrow.io responses to avoid redundant API calls (free tier: 500/day).

```sql
CREATE TABLE autopilot_weather_cache (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_key        TEXT NOT NULL,           -- "augusta-national", "pebble-beach" etc
  forecast_date     DATE NOT NULL,           -- the date the forecast is for
  lat               DECIMAL(10,6) NOT NULL,
  lng               DECIMAL(10,6) NOT NULL,
  raw_response      JSONB NOT NULL,          -- full Tomorrow.io response
  interpreted       JSONB NOT NULL,          -- WeatherContext object after interpretation
  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL     -- fetched_at + 2 hours

  UNIQUE (course_key, forecast_date)         -- one cache entry per course per day
);

CREATE INDEX idx_weather_cache_key_date ON autopilot_weather_cache(course_key, forecast_date);
CREATE INDEX idx_weather_cache_expires ON autopilot_weather_cache(expires_at);
```

**Cache lookup logic:**
```typescript
async function getWeatherWithCache(courseKey: string, forecastDate: Date): Promise<WeatherContext> {
  const cached = await db.query(`
    SELECT interpreted FROM autopilot_weather_cache
    WHERE course_key = $1
    AND forecast_date = $2::date
    AND expires_at > NOW()
  `, [courseKey, forecastDate])

  if (cached.rows[0]) return cached.rows[0].interpreted as WeatherContext

  // Cache miss — fetch from Tomorrow.io
  const fresh = await tomorrowio.getForecast(courseKey, forecastDate)
  await db.query(`
    INSERT INTO autopilot_weather_cache (course_key, forecast_date, lat, lng, raw_response, interpreted, expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '2 hours')
    ON CONFLICT (course_key, forecast_date) DO UPDATE
    SET raw_response = $5, interpreted = $6, expires_at = NOW() + INTERVAL '2 hours', fetched_at = NOW()
  `, [courseKey, forecastDate, fresh.lat, fresh.lng, fresh.raw, fresh.interpreted])

  return fresh.interpreted
}
```

---

### `autopilot_cron_log`

Lightweight record of every cron run.

```sql
CREATE TABLE autopilot_cron_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name          TEXT NOT NULL,           -- 'tournament' | 'evergreen'
  tournament_status TEXT,                    -- LIVE | PRE_TOURNAMENT | POST_ROUND | OFF
  event_name        TEXT,
  trigger_selected  TEXT,                    -- trigger_type that fired, or null
  skip_reason       TEXT,                    -- why no trigger fired (dedup, off-week, etc.)
  duration_ms       INTEGER,
  error             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cron_log_created ON autopilot_cron_log(created_at);
```

---

## Key Queries

### Deduplication check
```sql
SELECT COUNT(*) FROM autopilot_post_log
WHERE trigger_type = $1
AND created_at > NOW() - INTERVAL '4 hours'
```

### Check for pending_edit awaiting instruction
```sql
SELECT id, edit_platform, raw_data, context, caption_x, caption_ig, telegram_message_id
FROM autopilot_queue
WHERE status = 'pending_edit'
LIMIT 1
```

### Evergreen selection (least recently used, not in last 20 posts)
```sql
SELECT * FROM autopilot_evergreen_bank
WHERE active = true
AND trigger_type = $1
AND content_id NOT IN (
  SELECT COALESCE(event_name, trigger_type) FROM autopilot_post_log
  WHERE trigger_type LIKE 'evergreen_%'
  ORDER BY created_at DESC
  LIMIT 20
)
ORDER BY last_used_at ASC NULLS FIRST
LIMIT 1
```

### Atomic approve (returns 0 rows if already handled — race condition protection)
```sql
UPDATE autopilot_queue
SET status = 'approved', approved_at = NOW()
WHERE id = $1
AND status = 'pending'
AND created_at > NOW() - INTERVAL '4 hours'
RETURNING *
```

### Expire stale posts (run at start of every cron)
```sql
UPDATE autopilot_queue
SET status = 'expired'
WHERE status IN ('pending', 'pending_edit', 'pending_edit_regenerating')
AND created_at < NOW() - INTERVAL '4 hours'
RETURNING id, trigger_type, telegram_message_id
```
Returns `telegram_message_id` so the cron can remove buttons from expired Telegram messages.

### Save edit instruction to history
```sql
UPDATE autopilot_queue
SET
  edit_history = edit_history || $1::jsonb,
  edit_count = edit_count + 1,
  caption_x = CASE WHEN $2 IN ('twitter', 'both') THEN $3 ELSE caption_x END,
  caption_ig = CASE WHEN $2 IN ('instagram', 'both') THEN $4 ELSE caption_ig END,
  status = 'pending',
  edit_platform = NULL
WHERE id = $5
```

### Dashboard summary
```sql
SELECT status, COUNT(*) as count, MAX(created_at) as last_occurrence
FROM autopilot_queue
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY status
ORDER BY count DESC
```

---

## Migration File

Create at `db/migrations/004_autopilot.sql`:

```sql
-- Migration: 004_autopilot
-- Divot Lab Autopilot pipeline tables

BEGIN;

-- [full CREATE TABLE statements above]
-- [all indexes above]

-- Cleanup job: delete weather cache entries older than 7 days
-- Run manually or add to a weekly cron
-- DELETE FROM autopilot_weather_cache WHERE expires_at < NOW() - INTERVAL '7 days';

COMMIT;
```

---

## TypeScript Types

In `autopilot/lib/types.ts`:

```typescript
export type QueueStatus =
  | 'pending' | 'pending_edit' | 'pending_edit_regenerating'
  | 'approved' | 'posted' | 'partial' | 'failed'
  | 'skipped' | 'expired' | 'telegram_failed'

export type TriggerType =
  | 'live_leaderboard_r1_end' | 'live_leaderboard_r2_end'
  | 'live_leaderboard_r3_end' | 'live_leaderboard_final'
  | 'mid_round_mover' | 'cut_bubble_alert' | 'weather_angle'
  | 'pre_tournament_model_picks' | 'post_round_sleeper' | 'comparison_spotlight'
  | 'evergreen_sg_explainer' | 'evergreen_course_profile'
  | 'evergreen_player_spotlight' | 'evergreen_stat_of_week' | 'evergreen_myth_bust'

export type TemplateId =
  | 'leaderboard' | 'player-stat' | 'model-pick' | 'cut-line'
  | 'evergreen-fact' | 'quote-insight' | 'comparison'
  | 'course-breakdown' | 'weather-card'

export type EventTier = 'major' | 'signature' | 'standard'
export type EditPlatform = 'twitter' | 'instagram' | 'both'
export type ConditionsFlag = 'calm' | 'moderate' | 'difficult' | 'severe'

export interface WeatherContext {
  windSpeedMph: number
  windDirection: string
  conditionsFlag: ConditionsFlag
  tempF: number
  precipChance: number
  conditionsSummary: string
}

export interface InsightFlags {
  playerOverperforming: boolean
  playerUnderperforming: boolean
  conditionsAdvantage: boolean
  courseSpecialist: boolean
  modelAligned: boolean
  modelSurprise: boolean
  fieldBeatingCourse: boolean
}

export interface QueuedPost {
  id: string
  triggerType: TriggerType
  triggerLabel: string
  eventName: string | null
  eventTier: EventTier | null
  graphicType: TemplateId | null
  captionX: string
  captionIG: string
  imageBlobUrl: string
  imageBlobKey: string
  rawData: Record<string, unknown>
  context: PostContext
  status: QueueStatus
  editCount: number
  telegramMessageId: number | null
  createdAt: Date
}

export interface EditHistoryEntry {
  instruction: string
  platform: EditPlatform
  timestamp: string
  captionXBefore: string
  captionIGBefore: string
}
```
