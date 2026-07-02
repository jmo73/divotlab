"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createQueuedPost = createQueuedPost;
exports.getQueuedPost = getQueuedPost;
exports.updateQueueStatus = updateQueueStatus;
exports.atomicApprove = atomicApprove;
exports.getPendingEditPost = getPendingEditPost;
exports.saveEditResult = saveEditResult;
exports.expireOldPendingPosts = expireOldPendingPosts;
exports.checkDeduplication = checkDeduplication;
exports.logPostResult = logPostResult;
exports.getNextEvergreenItem = getNextEvergreenItem;
exports.markEvergreenUsed = markEvergreenUsed;
exports.getWeatherCache = getWeatherCache;
exports.setWeatherCache = setWeatherCache;
exports.logCronRun = logCronRun;
exports.getDashboardData = getDashboardData;
const pg_1 = require("pg");
const config_1 = require("./config");
// Connection pool — shared across the process lifetime
const pool = new pg_1.Pool({ connectionString: config_1.config.database.url, ssl: { rejectUnauthorized: false } });
function toQueuedPost(row) {
    return {
        id: row.id,
        triggerType: row.trigger_type,
        triggerLabel: row.trigger_label,
        eventName: row.event_name,
        eventTier: row.event_tier,
        graphicType: row.graphic_type,
        captionX: row.caption_x,
        captionIG: row.caption_ig,
        captionXOriginal: row.caption_x_original,
        captionIGOriginal: row.caption_ig_original,
        imageBlobUrl: row.image_blob_url,
        imageBlobKey: row.image_blob_key,
        rawData: row.raw_data,
        context: row.context,
        weatherContext: row.weather_context,
        status: row.status,
        editPlatform: row.edit_platform,
        editCount: row.edit_count,
        editHistory: (row.edit_history ?? []),
        telegramMessageId: row.telegram_message_id,
        createdAt: row.created_at,
        approvedAt: row.approved_at,
        postedAt: row.posted_at,
        twitterPostId: row.twitter_post_id,
        twitterUrl: row.twitter_url,
        instagramPostId: row.instagram_post_id,
        instagramUrl: row.instagram_url,
        errorMessage: row.error_message,
    };
}
// ─── Queue functions ──────────────────────────────────────────────────────────
async function createQueuedPost(data) {
    const { rows } = await pool.query(`INSERT INTO autopilot_queue (
       trigger_type, trigger_label, event_name, event_tier, graphic_type,
       caption_x, caption_ig, caption_x_original, caption_ig_original,
       image_blob_url, image_blob_key, raw_data, context, weather_context
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`, [
        data.triggerType, data.triggerLabel, data.eventName, data.eventTier,
        data.graphicType, data.captionX, data.captionIG,
        data.imageBlobUrl, data.imageBlobKey,
        JSON.stringify(data.rawData), JSON.stringify(data.context),
        data.weatherContext ? JSON.stringify(data.weatherContext) : null,
    ]);
    return toQueuedPost(rows[0]);
}
async function getQueuedPost(id) {
    const { rows } = await pool.query('SELECT * FROM autopilot_queue WHERE id = $1', [id]);
    if (!rows[0])
        throw new Error(`Queue post not found: ${id}`);
    return toQueuedPost(rows[0]);
}
async function updateQueueStatus(id, status, extra) {
    const setEditPlatform = extra !== undefined && 'editPlatform' in extra;
    await pool.query(`UPDATE autopilot_queue SET
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
     WHERE id = $1`, [
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
        setEditPlatform ? (extra.editPlatform ?? null) : null,
        extra?.skippedAt ?? null,
    ]);
}
// Atomic approve — returns null if already handled (race condition protection)
async function atomicApprove(id) {
    const { rows } = await pool.query(`UPDATE autopilot_queue
     SET status = 'approved', approved_at = NOW()
     WHERE id = $1
       AND status = 'pending'
       AND created_at > NOW() - INTERVAL '4 hours'
     RETURNING *`, [id]);
    return rows[0] ? toQueuedPost(rows[0]) : null;
}
async function getPendingEditPost() {
    const { rows } = await pool.query(`SELECT * FROM autopilot_queue
     WHERE status = 'pending_edit'
     ORDER BY created_at DESC
     LIMIT 1`);
    return rows[0] ? toQueuedPost(rows[0]) : null;
}
async function saveEditResult(id, instruction, platform, newCaptionX, newCaptionIG) {
    await pool.query(`UPDATE autopilot_queue SET
       edit_history = edit_history || $2::jsonb,
       edit_count   = edit_count + 1,
       caption_x    = CASE WHEN $3 IN ('twitter', 'both') THEN $4 ELSE caption_x END,
       caption_ig   = CASE WHEN $3 IN ('instagram', 'both') THEN $5 ELSE caption_ig END,
       status       = 'pending',
       edit_platform = NULL
     WHERE id = $1`, [
        id,
        JSON.stringify([{
                instruction,
                platform,
                timestamp: new Date().toISOString(),
                captionXBefore: newCaptionX,
                captionIGBefore: newCaptionIG,
            }]),
        platform, newCaptionX, newCaptionIG,
    ]);
}
// Expire posts older than 4 hours — returns ids + telegramMessageIds for cleanup
async function expireOldPendingPosts() {
    const { rows } = await pool.query(`UPDATE autopilot_queue
     SET status = 'expired'
     WHERE status IN ('pending', 'pending_edit', 'pending_edit_regenerating')
       AND created_at < NOW() - INTERVAL '4 hours'
     RETURNING id, telegram_message_id`);
    return rows.map(r => ({ id: r.id, telegramMessageId: r.telegram_message_id }));
}
// ─── Deduplication ───────────────────────────────────────────────────────────
async function checkDeduplication(triggerType) {
    const { rows } = await pool.query(`SELECT COUNT(*) AS cnt FROM autopilot_post_log
     WHERE trigger_type = $1
       AND created_at > NOW() - INTERVAL '4 hours'`, [triggerType]);
    return parseInt(rows[0].cnt, 10) > 0;
}
// ─── Post Log ─────────────────────────────────────────────────────────────────
async function logPostResult(queueId, result) {
    await pool.query(`INSERT INTO autopilot_post_log (
       queue_id, trigger_type, event_name, event_tier, graphic_type, status,
       twitter_success, twitter_post_id, twitter_url, twitter_error,
       instagram_success, instagram_post_id, instagram_url, instagram_error,
       was_edited, edit_count
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`, [
        result.queueId, result.triggerType, result.eventName, result.eventTier,
        result.graphicType, result.status,
        result.twitterSuccess, result.twitterPostId, result.twitterUrl, result.twitterError,
        result.instagramSuccess, result.instagramPostId, result.instagramUrl, result.instagramError,
        result.wasEdited, result.editCount,
    ]);
}
// ─── Evergreen ────────────────────────────────────────────────────────────────
async function getNextEvergreenItem(triggerType) {
    const { rows } = await pool.query(`SELECT * FROM autopilot_evergreen_bank
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
     LIMIT 1`, [triggerType]);
    if (!rows[0])
        return null;
    const r = rows[0];
    return {
        id: r.id,
        contentId: r.content_id,
        triggerType: r.trigger_type,
        topic: r.topic,
        seriesName: r.series_name,
        seriesOrder: r.series_order,
        templateId: r.template_id,
        templateFields: r.template_fields,
        captionX: r.caption_x,
        captionIG: r.caption_ig,
        lastUsedAt: r.last_used_at,
        useCount: r.use_count,
    };
}
async function markEvergreenUsed(contentId) {
    await pool.query(`UPDATE autopilot_evergreen_bank
     SET last_used_at = NOW(), use_count = use_count + 1
     WHERE content_id = $1`, [contentId]);
}
// ─── Weather Cache ────────────────────────────────────────────────────────────
async function getWeatherCache(courseKey, date) {
    const { rows } = await pool.query(`SELECT interpreted FROM autopilot_weather_cache
     WHERE course_key = $1
       AND forecast_date = $2::date
       AND expires_at > NOW()`, [courseKey, date]);
    return rows[0] ? rows[0].interpreted : null;
}
async function setWeatherCache(courseKey, date, lat, lng, rawResponse, interpreted) {
    await pool.query(`INSERT INTO autopilot_weather_cache
       (course_key, forecast_date, lat, lng, raw_response, interpreted, expires_at)
     VALUES ($1, $2::date, $3, $4, $5, $6, NOW() + INTERVAL '2 hours')
     ON CONFLICT (course_key, forecast_date) DO UPDATE SET
       raw_response = $5,
       interpreted  = $6,
       expires_at   = NOW() + INTERVAL '2 hours',
       fetched_at   = NOW()`, [courseKey, date, lat, lng, JSON.stringify(rawResponse), JSON.stringify(interpreted)]);
}
// ─── Cron Log ─────────────────────────────────────────────────────────────────
async function logCronRun(entry) {
    await pool.query(`INSERT INTO autopilot_cron_log
       (job_name, tournament_status, event_name, trigger_selected, skip_reason, duration_ms, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`, [
        entry.jobName, entry.tournamentStatus ?? null, entry.eventName ?? null,
        entry.triggerSelected ?? null, entry.skipReason ?? null,
        entry.durationMs, entry.error ?? null,
    ]);
}
// ─── Dashboard ────────────────────────────────────────────────────────────────
async function getDashboardData() {
    const [queueRes, cronRes, countsRes] = await Promise.all([
        pool.query('SELECT * FROM autopilot_queue ORDER BY created_at DESC LIMIT 20'),
        pool.query('SELECT * FROM autopilot_cron_log ORDER BY created_at DESC LIMIT 20'),
        pool.query(`SELECT status, COUNT(*) AS count
       FROM autopilot_queue
       WHERE created_at > NOW() - INTERVAL '30 days'
       GROUP BY status`),
    ]);
    const statusCounts = {};
    for (const row of countsRes.rows) {
        statusCounts[row.status] = parseInt(row.count, 10);
    }
    return {
        recentQueue: queueRes.rows.map(toQueuedPost),
        cronLog: cronRes.rows,
        statusCounts,
    };
}
//# sourceMappingURL=db.js.map