-- Migration: 004_autopilot
-- Divot Lab Autopilot pipeline tables
-- Run once against your Postgres database.
-- Recommended: Neon (neon.tech) via Vercel Postgres integration.

BEGIN;

-- ─── autopilot_queue ─────────────────────────────────────────────────────────
-- Central state table. One row per post that reaches the approval stage.

CREATE TABLE autopilot_queue (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Content
  trigger_type          TEXT NOT NULL,
  trigger_label         TEXT NOT NULL,
  event_name            TEXT,
  event_tier            TEXT,
  graphic_type          TEXT,
  caption_x             TEXT NOT NULL,
  caption_ig            TEXT NOT NULL,
  caption_x_original    TEXT NOT NULL,
  caption_ig_original   TEXT NOT NULL,
  image_blob_url        TEXT NOT NULL,
  image_blob_key        TEXT NOT NULL,

  -- Enrichment context (stored for edit regeneration — never re-fetched)
  raw_data              JSONB NOT NULL,
  context               JSONB NOT NULL,
  weather_context       JSONB,

  -- State machine
  -- pending | pending_edit | pending_edit_regenerating | approved
  -- posted | partial | failed | skipped | expired | telegram_failed
  status                TEXT NOT NULL DEFAULT 'pending',
  edit_platform         TEXT,
  edit_count            INTEGER NOT NULL DEFAULT 0,
  edit_history          JSONB NOT NULL DEFAULT '[]',

  -- Telegram
  telegram_message_id   BIGINT,

  -- Timestamps
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  telegram_sent_at      TIMESTAMPTZ,
  edit_started_at       TIMESTAMPTZ,
  approved_at           TIMESTAMPTZ,
  skipped_at            TIMESTAMPTZ,
  posted_at             TIMESTAMPTZ,

  -- Post results
  twitter_post_id       TEXT,
  twitter_url           TEXT,
  instagram_post_id     TEXT,
  instagram_url         TEXT,

  -- Error tracking
  error_message         TEXT,
  error_detail          JSONB
);

CREATE INDEX idx_autopilot_queue_status      ON autopilot_queue(status);
CREATE INDEX idx_autopilot_queue_created_at  ON autopilot_queue(created_at);
CREATE INDEX idx_autopilot_queue_trigger     ON autopilot_queue(trigger_type);

-- ─── autopilot_post_log ───────────────────────────────────────────────────────
-- Immutable log written after posting completes. Used for deduplication.

CREATE TABLE autopilot_post_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id              UUID REFERENCES autopilot_queue(id),

  trigger_type          TEXT NOT NULL,
  event_name            TEXT,
  event_tier            TEXT,
  graphic_type          TEXT,
  status                TEXT NOT NULL,

  twitter_success       BOOLEAN,
  twitter_post_id       TEXT,
  twitter_url           TEXT,
  twitter_error         TEXT,

  instagram_success     BOOLEAN,
  instagram_post_id     TEXT,
  instagram_url         TEXT,
  instagram_error       TEXT,

  was_edited            BOOLEAN NOT NULL DEFAULT false,
  edit_count            INTEGER NOT NULL DEFAULT 0,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_post_log_trigger_created  ON autopilot_post_log(trigger_type, created_at);
CREATE INDEX idx_post_log_created_at       ON autopilot_post_log(created_at);

-- ─── autopilot_evergreen_bank ─────────────────────────────────────────────────
-- Pre-written evergreen content. Seeded by scripts/seed-evergreen.ts.

CREATE TABLE autopilot_evergreen_bank (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id            TEXT NOT NULL UNIQUE,

  trigger_type          TEXT NOT NULL,
  topic                 TEXT NOT NULL,
  series_name           TEXT,
  series_order          INTEGER,

  template_id           TEXT NOT NULL,
  template_fields       JSONB NOT NULL,

  caption_x             TEXT NOT NULL,
  caption_ig            TEXT NOT NULL,

  active                BOOLEAN NOT NULL DEFAULT false,
  last_used_at          TIMESTAMPTZ,
  use_count             INTEGER NOT NULL DEFAULT 0,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_evergreen_trigger   ON autopilot_evergreen_bank(trigger_type);
CREATE INDEX idx_evergreen_active    ON autopilot_evergreen_bank(active);
CREATE INDEX idx_evergreen_last_used ON autopilot_evergreen_bank(last_used_at);
CREATE INDEX idx_evergreen_series    ON autopilot_evergreen_bank(series_name, series_order);

-- ─── autopilot_weather_cache ──────────────────────────────────────────────────
-- Caches Tomorrow.io responses (2hr TTL) to stay within free tier limits.

CREATE TABLE autopilot_weather_cache (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_key            TEXT NOT NULL,
  forecast_date         DATE NOT NULL,
  lat                   DECIMAL(10,6) NOT NULL,
  lng                   DECIMAL(10,6) NOT NULL,
  raw_response          JSONB NOT NULL,
  interpreted           JSONB NOT NULL,
  fetched_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at            TIMESTAMPTZ NOT NULL,

  UNIQUE (course_key, forecast_date)
);

CREATE INDEX idx_weather_cache_key_date ON autopilot_weather_cache(course_key, forecast_date);
CREATE INDEX idx_weather_cache_expires  ON autopilot_weather_cache(expires_at);

-- ─── autopilot_cron_log ───────────────────────────────────────────────────────
-- Lightweight record of every cron run for debugging and monitoring.

CREATE TABLE autopilot_cron_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name              TEXT NOT NULL,
  tournament_status     TEXT,
  event_name            TEXT,
  trigger_selected      TEXT,
  skip_reason           TEXT,
  duration_ms           INTEGER,
  error                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cron_log_created ON autopilot_cron_log(created_at);

COMMIT;
