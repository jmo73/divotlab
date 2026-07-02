import { Pool } from 'pg'
import { config } from './config'
import type {
  QueuedPost,
  QueueStatus,
  EditPlatform,
  PostLogEntry,
  EvergreenItem,
  WeatherContext,
  CronLogEntry,
  TriggerType,
  TemplateId,
  PostContext,
  EditHistoryEntry,
} from './types'

// Connection pool — shared across the process lifetime
const pool = new Pool({ connectionString: config.database.url, ssl: { rejectUnauthorized: false } })

function toQueuedPost(row: Record<string, unknown>): QueuedPost {
  return {
    id:                 row.id as string,
    triggerType:        row.trigger_type as TriggerType,
    triggerLabel:       row.trigger_label as string,
    eventName:          row.event_name as string | null,
    eventTier:          row.event_tier as QueuedPost['eventTier'],
    graphicType:        row.graphic_type as TemplateId | null,
    captionX:           row.caption_x as string,
    captionIG:          row.caption_ig as string,
    captionXOriginal:   row.caption_x_original as string,
    captionIGOriginal:  row.caption_ig_original as string,
    imageBlobUrl:       row.image_blob_url as string,
    imageBlobKey:       row.image_blob_key as string,
    rawData:            row.raw_data as Record<string, unknown>,
    context:            row.context as PostContext,
    weatherContext:     row.weather_context as WeatherContext | null,
    status:             row.status as QueueStatus,
    editPlatform:       row.edit_platform as EditPlatform | null,
    editCount:          row.edit_count as number,
    editHistory:        (row.edit_history ?? []) as EditHistoryEntry[],
    telegramMessageId:  row.telegram_message_id as number | null,
    createdAt:          row.created_at as Date,
    approvedAt:         row.approved_at as Date | null,
    postedAt:           row.posted_at as Date | null,
    twitterPostId:      row.twitter_post_id as string | null,
    twitterUrl:         row.twitter_url as string | null,
    instagramPostId:    row.instagram_post_id as string | null,
    instagramUrl:       row.instagram_url as string | null,
    errorMessage:       row.error_message as string | null,
  }
}

// ─── Queue functions ──────────────────────────────────────────────────────────

export async function createQueuedPost(data: {
  triggerType: TriggerType
  triggerLabel: string
  eventName: string | null
  eventTier: QueuedPost['eventTier']
  graphicType: TemplateId | null
  captionX: string
  captionIG: string
  imageBlobUrl: string
  imageBlobKey: string
  rawData: Record<string, unknown>
  context: PostContext
  weatherContext: WeatherContext | null
}): Promise<QueuedPost> {
  const { rows } = await pool.query(
    `INSERT INTO autopilot_queue (
       trigger_type, trigger_label, event_name, event_tier, graphic_type,
       caption_x, caption_ig, caption_x_original, caption_ig_original,
       image_blob_url, image_blob_key, raw_data, context, weather_context
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      data.triggerType, data.triggerLabel, data.eventName, data.eventTier,
      data.graphicType, data.captionX, data.captionIG,
      data.imageBlobUrl, data.imageBlobKey,
      JSON.stringify(data.rawData), JSON.stringify(data.context),
      data.weatherContext ? JSON.stringify(data.weatherContext) : null,
    ]
  )
  return toQueuedPost(rows[0])
}

export async function getQueuedPost(id: string): Promise<QueuedPost> {
  const { rows } = await pool.query('SELECT * FROM autopilot_queue WHERE id = $1', [id])
  if (!rows[0]) throw new Error(`Queue post not found: ${id}`)
  return toQueuedPost(rows[0])
}

export async function updateQueueStatus(
  id: string,
  status: QueueStatus,
  extra?: {
    twitterPostId?: string | null
    twitterUrl?: string | null
    instagramPostId?: string | null
    instagramUrl?: string | null
    postedAt?: Date
    telegramMessageId?: number
    telegramSentAt?: Date
    errorMessage?: string
    editPlatform?: string | null
    skippedAt?: Date
  }
): Promise<void> {
  const setEditPlatform = extra !== undefined && 'editPlatform' in extra
  await pool.query(
    `UPDATE autopilot_queue SET
       status = $2,
       twitter_post_id     = COALESCE($3, twitter_post_id),
       twitter_url         = COALESCE($4, twitter_url),
       instagram_post_id   = COALESCE($5, instagram_post_id),
       instagram_url       = COALESCE($6, instagram_url),
       posted_at           = COALESCE($7, posted_at),
       telegram_message_id = COALESCE($8, telegram_message_id),
       telegram_sent_at    = COALESCE($9, telegram_sent_at),
       error_message       = COALESCE($10, error_message),
       edit_platform       = CASE WHEN $11 THEN $12::text ELSE edit_platform END,
       skipped_at          = COALESCE($13, skipped_at)
     WHERE id = $1`,
    [
      id, status,
      extra?.twitterPostId ?? null,
      extra?.twitterUrl ?? null,
      extra?.instagramPostId ?? null,
      extra?.instagramUrl ?? null,
      extra?.postedAt ?? null,
      extra?.telegramMessageId ?? null,
      extra?.telegramSentAt ?? null,
      extra?.errorMessage ?? null,
      setEditPlatform,
      setEditPlatform ? (extra!.editPlatform ?? null) : null,
      extra?.skippedAt ?? null,
    ]
  )
}

// Atomic approve — returns null if already handled (race condition protection)
export async function atomicApprove(id: string): Promise<QueuedPost | null> {
  const { rows } = await pool.query(
    `UPDATE autopilot_queue
     SET status = 'approved', approved_at = NOW()
     WHERE id = $1
       AND status = 'pending'
       AND created_at > NOW() - INTERVAL '4 hours'
     RETURNING *`,
    [id]
  )
  return rows[0] ? toQueuedPost(rows[0]) : null
}

export async function getPendingEditPost(): Promise<QueuedPost | null> {
  const { rows } = await pool.query(
    `SELECT * FROM autopilot_queue
     WHERE status = 'pending_edit'
     ORDER BY created_at DESC
     LIMIT 1`
  )
  return rows[0] ? toQueuedPost(rows[0]) : null
}

export async function saveEditResult(
  id: string,
  instruction: string,
  platform: EditPlatform,
  newCaptionX: string,
  newCaptionIG: string
): Promise<void> {
  await pool.query(
    `UPDATE autopilot_queue SET
       edit_history = edit_history || $2::jsonb,
       edit_count   = edit_count + 1,
       caption_x    = CASE WHEN $3 IN ('twitter', 'both') THEN $4 ELSE caption_x END,
       caption_ig   = CASE WHEN $3 IN ('instagram', 'both') THEN $5 ELSE caption_ig END,
       status       = 'pending',
       edit_platform = NULL
     WHERE id = $1`,
    [
      id,
      JSON.stringify([{
        instruction,
        platform,
        timestamp: new Date().toISOString(),
        captionXBefore: newCaptionX,
        captionIGBefore: newCaptionIG,
      }]),
      platform, newCaptionX, newCaptionIG,
    ]
  )
}

// Expire posts older than 4 hours — returns ids + telegramMessageIds for cleanup
export async function expireOldPendingPosts(): Promise<{ id: string; telegramMessageId: number | null }[]> {
  const { rows } = await pool.query(
    `UPDATE autopilot_queue
     SET status = 'expired'
     WHERE status IN ('pending', 'pending_edit', 'pending_edit_regenerating')
       AND created_at < NOW() - INTERVAL '4 hours'
     RETURNING id, telegram_message_id`
  )
  return rows.map(r => ({ id: r.id as string, telegramMessageId: r.telegram_message_id as number | null }))
}

// ─── Deduplication ───────────────────────────────────────────────────────────

export async function checkDeduplication(triggerType: TriggerType): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM autopilot_post_log
     WHERE trigger_type = $1
       AND created_at > NOW() - INTERVAL '4 hours'`,
    [triggerType]
  )
  return parseInt(rows[0].cnt as string, 10) > 0
}

// ─── Post Log ─────────────────────────────────────────────────────────────────

export async function logPostResult(queueId: string, result: PostLogEntry): Promise<void> {
  await pool.query(
    `INSERT INTO autopilot_post_log (
       queue_id, trigger_type, event_name, event_tier, graphic_type, status,
       twitter_success, twitter_post_id, twitter_url, twitter_error,
       instagram_success, instagram_post_id, instagram_url, instagram_error,
       was_edited, edit_count
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      result.queueId, result.triggerType, result.eventName, result.eventTier,
      result.graphicType, result.status,
      result.twitterSuccess, result.twitterPostId, result.twitterUrl, result.twitterError,
      result.instagramSuccess, result.instagramPostId, result.instagramUrl, result.instagramError,
      result.wasEdited, result.editCount,
    ]
  )
}

// ─── Evergreen ────────────────────────────────────────────────────────────────

export async function getNextEvergreenItem(triggerType: TriggerType): Promise<EvergreenItem | null> {
  const { rows } = await pool.query(
    `SELECT * FROM autopilot_evergreen_bank
     WHERE active = true
       AND trigger_type = $1
       AND content_id NOT IN (
         SELECT COALESCE(event_name, trigger_type)
         FROM autopilot_post_log
         WHERE trigger_type LIKE 'evergreen_%'
         ORDER BY created_at DESC
         LIMIT 20
       )
     ORDER BY last_used_at ASC NULLS FIRST
     LIMIT 1`,
    [triggerType]
  )
  if (!rows[0]) return null
  const r = rows[0] as Record<string, unknown>
  return {
    id:           r.id as string,
    contentId:    r.content_id as string,
    triggerType:  r.trigger_type as TriggerType,
    topic:        r.topic as string,
    seriesName:   r.series_name as string | null,
    seriesOrder:  r.series_order as number | null,
    templateId:   r.template_id as TemplateId,
    templateFields: r.template_fields as Record<string, string>,
    captionX:     r.caption_x as string,
    captionIG:    r.caption_ig as string,
    lastUsedAt:   r.last_used_at as Date | null,
    useCount:     r.use_count as number,
  }
}

export async function markEvergreenUsed(contentId: string): Promise<void> {
  await pool.query(
    `UPDATE autopilot_evergreen_bank
     SET last_used_at = NOW(), use_count = use_count + 1
     WHERE content_id = $1`,
    [contentId]
  )
}

// ─── Weather Cache ────────────────────────────────────────────────────────────

export async function getWeatherCache(courseKey: string, date: Date): Promise<WeatherContext | null> {
  const { rows } = await pool.query(
    `SELECT interpreted FROM autopilot_weather_cache
     WHERE course_key = $1
       AND forecast_date = $2::date
       AND expires_at > NOW()`,
    [courseKey, date]
  )
  return rows[0] ? (rows[0].interpreted as WeatherContext) : null
}

export async function setWeatherCache(
  courseKey: string,
  date: Date,
  lat: number,
  lng: number,
  rawResponse: unknown,
  interpreted: WeatherContext
): Promise<void> {
  await pool.query(
    `INSERT INTO autopilot_weather_cache
       (course_key, forecast_date, lat, lng, raw_response, interpreted, expires_at)
     VALUES ($1, $2::date, $3, $4, $5, $6, NOW() + INTERVAL '2 hours')
     ON CONFLICT (course_key, forecast_date) DO UPDATE SET
       raw_response = $5,
       interpreted  = $6,
       expires_at   = NOW() + INTERVAL '2 hours',
       fetched_at   = NOW()`,
    [courseKey, date, lat, lng, JSON.stringify(rawResponse), JSON.stringify(interpreted)]
  )
}

// ─── Cron Log ─────────────────────────────────────────────────────────────────

export async function logCronRun(entry: CronLogEntry): Promise<void> {
  await pool.query(
    `INSERT INTO autopilot_cron_log
       (job_name, tournament_status, event_name, trigger_selected, skip_reason, duration_ms, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      entry.jobName, entry.tournamentStatus ?? null, entry.eventName ?? null,
      entry.triggerSelected ?? null, entry.skipReason ?? null,
      entry.durationMs, entry.error ?? null,
    ]
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export async function getDashboardData(): Promise<{
  recentQueue: QueuedPost[]
  cronLog: unknown[]
  statusCounts: Record<string, number>
}> {
  const [queueRes, cronRes, countsRes] = await Promise.all([
    pool.query('SELECT * FROM autopilot_queue ORDER BY created_at DESC LIMIT 20'),
    pool.query('SELECT * FROM autopilot_cron_log ORDER BY created_at DESC LIMIT 20'),
    pool.query(
      `SELECT status, COUNT(*) AS count
       FROM autopilot_queue
       WHERE created_at > NOW() - INTERVAL '30 days'
       GROUP BY status`
    ),
  ])

  const statusCounts: Record<string, number> = {}
  for (const row of countsRes.rows) {
    statusCounts[row.status as string] = parseInt(row.count as string, 10)
  }

  return {
    recentQueue: queueRes.rows.map(toQueuedPost),
    cronLog:     cronRes.rows,
    statusCounts,
  }
}
