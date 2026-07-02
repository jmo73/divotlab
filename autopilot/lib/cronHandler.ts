/**
 * Autopilot cron handler — called from api/server.js autopilot cron route.
 * Coordinates: scheduler → enrichment → createPost → sendApprovalMessage.
 * Also handles expiry of stale pending posts.
 */

import { validateEnv } from './config'
import { runScheduler } from './scheduler'
import { buildPostContext } from './enrichment'
import { createPost } from './queue'
import { sendApprovalMessage, editTelegramMessage, sendExpiryNotice } from './telegram'
import { expireOldPendingPosts, getQueuedPost } from './db'
import { CronLogger } from './logger'

export async function runAutopilotCron(jobType: 'tournament' | 'evergreen'): Promise<void> {
  const cronLog = new CronLogger(jobType)

  try {
    validateEnv()

    // Expire stale posts and remove their Telegram keyboard buttons
    const expired = await expireOldPendingPosts()
    for (const { id, telegramMessageId } of expired) {
      if (telegramMessageId) {
        const post = await getQueuedPost(id).catch(() => null)
        const label = post?.triggerLabel ?? id
        await sendExpiryNotice(label).catch(() => {})
        await editTelegramMessage(
          telegramMessageId,
          `⏱ Post expired — no action taken.\n\n${label}`,
          []
        ).catch(() => {})
      }
    }

    // Run scheduler
    const result = await runScheduler(jobType)

    if (!result) {
      cronLog.setSkipReason('No eligible trigger')
      await cronLog.flush()
      return
    }

    cronLog.setTriggerSelected(result.triggerType)
    if (result.tournamentStatus) cronLog.setTournamentStatus(result.tournamentStatus, result.eventName ?? undefined)

    // Build enrichment context
    const context = await buildPostContext(result.triggerType, {
      eventName: result.eventName ?? '',
      roundDate: new Date(),
      lat: result.lat,
      lng: result.lng,
      ...(result.rawData.playerName ? { playerName: result.rawData.playerName as string } : {}),
    })

    // For weather_angle trigger: only fire if conditions are actually difficult/severe
    if (result.triggerType === 'weather_angle') {
      const flag = context.weather.conditionsFlag
      if (flag === 'calm' || flag === 'moderate') {
        cronLog.setSkipReason('Weather angle: conditions not severe enough (calm/moderate)')
        await cronLog.flush()
        return
      }
    }

    // Create post: image + captions + blob + queue row
    const post = await createPost({ schedulerResult: result, context })

    // Send Telegram approval message
    const telegramMessageId = await sendApprovalMessage(post, post.imageBuffer)

    // Store the Telegram message ID on the queue row so we can edit it later
    const { updateQueueStatus } = await import('./db')
    await updateQueueStatus(post.id, 'pending', { telegramMessageId })

  } catch (err) {
    cronLog.setError(err)
  }

  await cronLog.flush()
}
