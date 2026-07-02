/**
 * Post queue manager and posting orchestrator.
 * Ties together: image gen → caption gen → blob upload → DB → Telegram approval.
 * On approval: PNG → JPEG → X post + IG post → DB update → Telegram confirmation.
 */

import { put, del } from '@vercel/blob'
import { config } from './config'
import { generateImage, extendForInstagram } from './imageGen'
import { generateCaptions, regenerateCaption } from './claude'
import { selectTemplate } from './enrichment'
import {
  createQueuedPost,
  getQueuedPost,
  updateQueueStatus,
  atomicApprove,
  saveEditResult,
  logPostResult,
  markEvergreenUsed,
} from './db'
import { sendApprovalMessage, sendUpdatedPreview, sendPostConfirmation, sendExpiryNotice } from './telegram'
import { postToTwitter, postTextTweet } from './twitter'
import { postToInstagram } from './instagram'
import { logger } from './logger'
import type { QueuedPost, SchedulerResult, EditPlatform, TemplateId } from './types'
import type { PostContext } from './enrichment'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreatePostOptions {
  schedulerResult: SchedulerResult
  context: PostContext
}

// ─── Blob helpers ─────────────────────────────────────────────────────────────

async function uploadToBlob(buffer: Buffer, filename: string, mimeType: string): Promise<{ url: string; key: string }> {
  const { url } = await put(filename, buffer, {
    access: 'public',
    contentType: mimeType,
    token: config.blob.token,
  })
  // Key is the last segment of the URL (Vercel Blob URL is deterministic)
  const key = filename
  return { url, key }
}

async function fetchBlobAsBuffer(blobUrl: string): Promise<Buffer> {
  const res = await fetch(blobUrl)
  if (!res.ok) throw new Error(`Failed to fetch blob: ${res.status} ${blobUrl}`)
  return Buffer.from(await res.arrayBuffer())
}

// ─── Template field resolution ────────────────────────────────────────────────

/**
 * Build the template fields object from the raw trigger data.
 * Evergreen items carry pre-built templateFields; live triggers need
 * fields computed from their data payload.
 */
function resolveTemplateFields(
  schedulerResult: SchedulerResult,
  context: PostContext
): { templateId: TemplateId; fields: Record<string, string> } {
  const { triggerType, rawData } = schedulerResult

  // Evergreen items pre-build their fields at seed time
  if (rawData.templateFields && rawData.templateId) {
    return {
      templateId: rawData.templateId as TemplateId,
      fields: rawData.templateFields as Record<string, string>,
    }
  }

  const templateId = selectTemplate(triggerType, context.insightFlags) as TemplateId
  const eventName = context.tournament.name
  const conditions = context.weather.conditionsSummary

  // Import field builders from imageGen for each template type
  const { leaderboardFields, playerStatFields, modelPickFields, cutLineFields,
    evergreenFactFields, quoteInsightFields, comparisonFields,
    courseBreakdownFields, weatherCardFields, formatScore, formatSG } = require('./imageGen')

  switch (templateId) {
    case 'leaderboard': {
      const d = rawData as {
        top5?: Array<{ playerName: string; score: number; dg_rating?: number | null }>
        eventName?: string
        round?: number
      }
      return {
        templateId,
        fields: leaderboardFields({
          eventName,
          courseConditions: conditions,
          roundBadge: `ROUND ${d.round ?? ''} COMPLETE`,
          players: (d.top5 ?? []).map(p => ({
            name: p.playerName,
            score: p.score,
            dgRating: p.dg_rating ?? undefined,
          })),
          insight: context.insightFlags.modelAligned
            ? 'Model pick leading the field'
            : context.insightFlags.fieldBeatingCourse
            ? 'Field scoring below historical avg'
            : `Field avg DG rating: ${context.field.avgDgRating}`,
          fieldContext: context.field.fieldStrengthLabel,
        }),
      }
    }

    case 'player-stat': {
      const d = rawData as {
        playerName?: string
        roundScore?: number
        sg_approach_round?: number | null
        sg_putting_round?: number | null
        sg_total_round?: number | null
        dg_rating?: number | null
        dgRatingPercentile?: number | null
        positionNow?: number
        score?: number
      }
      const name = d.playerName ?? ''
      const pos = d.positionNow ?? 1
      return {
        templateId,
        fields: playerStatFields({
          playerName: name,
          contextLine: `T${pos} · ${eventName}`,
          badge: context.insightFlags.playerOverperforming ? 'OVERPERFORMING' : 'IN FOCUS',
          badgeColor: context.insightFlags.playerOverperforming ? '#5BBF85' : '#5A8FA8',
          stats: [
            { label: 'DG RATING', value: String(d.dg_rating ?? '—') },
            { label: 'SG TOTAL', value: d.sg_total_round != null ? formatSG(d.sg_total_round) : '—' },
            { label: 'SG APPROACH', value: d.sg_approach_round != null ? formatSG(d.sg_approach_round) : '—' },
            { label: 'SG PUTTING', value: d.sg_putting_round != null ? formatSG(d.sg_putting_round) : '—' },
          ],
          insightLine1: `${d.dgRatingPercentile ?? '—'}th pct in field`,
          insightLine2: conditions,
        }),
      }
    }

    case 'model-pick': {
      const d = rawData as {
        picks?: Array<{ playerName: string; winProbability: number; courseFitScore: number; keyStrength: string }>
        darkHorse?: { playerName: string; reason: string }
      }
      return {
        templateId,
        fields: modelPickFields({
          eventName,
          conditionsSummary: conditions,
          picks: (d.picks ?? []).slice(0, 3).map(p => ({
            name: p.playerName,
            winPct: `${p.winProbability}%`,
            fitScore: p.courseFitScore,
            keyStrength: p.keyStrength,
          })),
          darkHorse: d.darkHorse ?? { name: '—', reason: '' },
        }),
      }
    }

    case 'cut-line': {
      const d = rawData as { cutLine?: number; players?: Array<{ playerName: string; score: number; holesPlayed: number }> }
      return {
        templateId,
        fields: cutLineFields({
          eventName,
          cutLine: d.cutLine != null ? formatScore(d.cutLine) : 'E',
          players: (d.players ?? []).map(p => ({
            name: p.playerName,
            score: p.score,
            holesPlayed: p.holesPlayed,
          })),
        }),
      }
    }

    case 'weather-card': {
      const d = rawData as { roundNumber?: number; roundDate?: string }
      const flag = context.weather.conditionsFlag
      return {
        templateId,
        fields: weatherCardFields({
          eventName,
          roundDate: d.roundDate ?? new Date().toISOString().slice(0, 10),
          windSpeed: String(context.weather.windSpeedMph),
          windDirection: context.weather.windDirection,
          tempPrecip: `${context.weather.tempF}°F · ${context.weather.precipChance}% precip`,
          conditionsFlag: flag.toUpperCase(),
          conditionsFlagColor: flag === 'difficult' || flag === 'severe' ? '#C9A84C' : '#FAFAFA',
          scoringImpact: context.weather.windSpeedMph >= 22
            ? 'Scoring avg typically rises 2–3 shots'
            : 'Minimal scoring impact expected',
          historicalContext: `Course avg: ${context.tournament.historicalScoringAvg > 0 ? '+' : ''}${context.tournament.historicalScoringAvg}`,
        }),
      }
    }

    case 'comparison': {
      const d = rawData as {
        playerA: { name: string; score: number; position: string; sg_total_round?: number | null; sg_approach_round?: number | null; sg_putting_round?: number | null; dg_rating?: number | null }
        playerB: { name: string; score: number; position: string; sg_total_round?: number | null; sg_approach_round?: number | null; sg_putting_round?: number | null; dg_rating?: number | null }
        comparisonAngle?: string
      }
      return {
        templateId,
        fields: comparisonFields({
          eventRound: `${eventName} · R${schedulerResult.rawData.round ?? ''}`,
          playerA: {
            name: d.playerA.name,
            score: d.playerA.score,
            position: d.playerA.position,
            sgTotal: d.playerA.sg_total_round != null ? formatSG(d.playerA.sg_total_round) : '—',
            sgApproach: d.playerA.sg_approach_round != null ? formatSG(d.playerA.sg_approach_round) : '—',
            dgRating: String(d.playerA.dg_rating ?? '—'),
          },
          playerB: {
            name: d.playerB.name,
            score: d.playerB.score,
            position: d.playerB.position,
            sgTotal: d.playerB.sg_total_round != null ? formatSG(d.playerB.sg_total_round) : '—',
            sgApproach: d.playerB.sg_approach_round != null ? formatSG(d.playerB.sg_approach_round) : '—',
            dgRating: String(d.playerB.dg_rating ?? '—'),
          },
          comparisonAngle: d.comparisonAngle ?? '',
        }),
      }
    }

    default:
      // Generic evergreen-fact fallback
      return {
        templateId: 'evergreen-fact',
        fields: evergreenFactFields({
          topicBadge: triggerType.replace(/_/g, ' ').toUpperCase(),
          headline: eventName,
          subhead: '',
          mainStat: '—',
          unitLabel: '',
          supportLines: [conditions, '', ''],
        }),
      }
  }
}

// ─── Create post ──────────────────────────────────────────────────────────────

export async function createPost(options: CreatePostOptions): Promise<QueuedPost & { imageBuffer: Buffer }> {
  const { schedulerResult, context } = options
  const { triggerType, rawData, eventName } = schedulerResult

  logger.info('Creating post', { triggerType, eventName: eventName ?? undefined })

  // Evergreen: use pre-built captions from the bank
  const isEvergreen = triggerType.startsWith('evergreen_')
  let captionX: string
  let captionIG: string
  let usedFallback = false

  if (isEvergreen && rawData.captionX && rawData.captionIG) {
    captionX = rawData.captionX as string
    captionIG = rawData.captionIG as string
  } else {
    const result = await generateCaptions(triggerType, context, rawData)
    captionX = result.captionX
    captionIG = result.captionIG
    usedFallback = result.usedFallback
  }

  // Resolve template and fields
  const { templateId, fields } = resolveTemplateFields(schedulerResult, context)

  // Generate image
  const imageBuffer = await generateImage(templateId, fields)

  // Upload PNG to Vercel Blob
  const postIdTemp = `${triggerType}-${Date.now()}`
  const { url: imageBlobUrl, key: imageBlobKey } = await uploadToBlob(
    imageBuffer,
    `posts/${postIdTemp}.png`,
    'image/png'
  )

  // Build trigger label
  const triggerLabel = `${triggerType.replace(/_/g, ' ')} · ${eventName ?? 'Evergreen'}`

  // Save to queue
  const post = await createQueuedPost({
    triggerType,
    triggerLabel,
    eventName: eventName ?? null,
    eventTier: context.tournament.tier,
    graphicType: templateId,
    captionX,
    captionIG,
    imageBlobUrl,
    imageBlobKey,
    rawData,
    context: context,
    weatherContext: context.weather ?? null,
  })

  if (usedFallback) {
    logger.warn('Used fallback captions — Claude API was unavailable', { triggerType })
  }

  // If evergreen, mark item used
  if (isEvergreen && rawData.contentId) {
    await markEvergreenUsed(rawData.contentId as string).catch(() => {
      logger.warn('Failed to mark evergreen item used', { postId: post.id })
    })
  }

  return { ...post, imageBuffer }
}

// ─── Fire posting ─────────────────────────────────────────────────────────────

export async function firePosting(postId: string): Promise<void> {
  logger.info('firePosting started', { postId })

  // Atomic approve — returns null if already approved/expired (race condition protection)
  const post = await atomicApprove(postId)
  if (!post) {
    logger.warn('firePosting: post not in pending state (already handled or expired)', { postId })
    return
  }

  // Fetch PNG from blob
  const pngBuffer = await fetchBlobAsBuffer(post.imageBlobUrl)

  // Extend to 1080×1350 (Instagram 4:5) unless already tall (player-hero is 1350)
  const igPngBuffer = post.graphicType === 'player-hero'
    ? pngBuffer
    : await extendForInstagram(pngBuffer)

  // Convert to JPEG for Instagram
  const sharpLib = (await import('sharp')).default
  const jpegBuffer = await sharpLib(igPngBuffer)
    .jpeg({ quality: 92 })
    .toBuffer()

  // Upload JPEG to blob (separate key for Instagram)
  const { url: jpegBlobUrl } = await uploadToBlob(
    jpegBuffer,
    `posts/${postId}-instagram.jpg`,
    'image/jpeg'
  )

  // Post to both platforms simultaneously
  const isTextOnly = post.graphicType === null || post.triggerType === 'evergreen_stat_of_week'

  const [twitterResult, instagramResult] = await Promise.allSettled([
    isTextOnly ? postTextTweet(post.captionX) : postToTwitter(post.captionX, pngBuffer),
    isTextOnly ? Promise.reject(new Error('Text-only post — no Instagram')) : postToInstagram(post.captionIG, jpegBlobUrl),
  ])

  // Determine final status
  const xOk = twitterResult.status === 'fulfilled'
  const igOk = instagramResult.status === 'fulfilled'
  const finalStatus = xOk && igOk ? 'posted' : !xOk && !igOk ? 'failed' : 'partial'

  logger.info(`firePosting result: ${finalStatus}`, { postId })

  // Log to post_log
  await logPostResult(postId, {
    queueId: postId,
    triggerType: post.triggerType,
    eventName: post.eventName,
    eventTier: post.eventTier,
    graphicType: post.graphicType,
    status: finalStatus,
    twitterSuccess: xOk,
    twitterPostId: xOk ? (twitterResult as PromiseFulfilledResult<{ postId: string; postUrl: string }>).value.postId : null,
    twitterUrl: xOk ? (twitterResult as PromiseFulfilledResult<{ postId: string; postUrl: string }>).value.postUrl : null,
    twitterError: !xOk ? String((twitterResult as PromiseRejectedResult).reason) : null,
    instagramSuccess: igOk,
    instagramPostId: igOk ? (instagramResult as PromiseFulfilledResult<{ postId: string; postUrl: string }>).value.postId : null,
    instagramUrl: igOk ? (instagramResult as PromiseFulfilledResult<{ postId: string; postUrl: string }>).value.postUrl : null,
    instagramError: !igOk ? String((instagramResult as PromiseRejectedResult).reason) : null,
    wasEdited: post.editCount > 0,
    editCount: post.editCount,
  })

  // Update queue status
  await updateQueueStatus(postId, finalStatus, {
    twitterPostId: xOk ? (twitterResult as PromiseFulfilledResult<{ postId: string; postUrl: string }>).value.postId : null,
    twitterUrl: xOk ? (twitterResult as PromiseFulfilledResult<{ postId: string; postUrl: string }>).value.postUrl : null,
    instagramPostId: igOk ? (instagramResult as PromiseFulfilledResult<{ postId: string; postUrl: string }>).value.postId : null,
    instagramUrl: igOk ? (instagramResult as PromiseFulfilledResult<{ postId: string; postUrl: string }>).value.postUrl : null,
    postedAt: new Date(),
  })

  // Send Telegram confirmation
  await sendPostConfirmation(post, twitterResult, instagramResult)

  // Clean up JPEG blob (PNG stays for 48h in case needed)
  del(jpegBlobUrl, { token: config.blob.token }).catch(() => {})
}

// ─── Edit flow ────────────────────────────────────────────────────────────────

export async function processEditInstruction(
  postId: string,
  instruction: string,
  platform: EditPlatform
): Promise<void> {
  await updateQueueStatus(postId, 'pending_edit_regenerating')

  const post = await getQueuedPost(postId)
  const context = post.context as unknown as PostContext

  // Regenerate only the requested platform(s) — never re-fetch data
  let newCaptionX = post.captionX
  let newCaptionIG = post.captionIG

  if (platform === 'twitter' || platform === 'both') {
    const result = await regenerateCaption({
      currentCaption: post.captionX,
      rawData: post.rawData,
      context,
      editInstruction: instruction,
      platform,
    })
    if (!result.usedFallback) newCaptionX = result.caption
  }

  if (platform === 'instagram' || platform === 'both') {
    const result = await regenerateCaption({
      currentCaption: post.captionIG,
      rawData: post.rawData,
      context,
      editInstruction: instruction,
      platform,
    })
    if (!result.usedFallback) newCaptionIG = result.caption
  }

  await saveEditResult(postId, instruction, platform, newCaptionX, newCaptionIG)

  // Re-read updated post for preview
  const updatedPost = await getQueuedPost(postId)

  // Send new preview with updated captions and approval keyboard
  const msgId = await sendUpdatedPreview(updatedPost, platform)
  await updateQueueStatus(postId, 'pending', { telegramMessageId: msgId })
}

// ─── Expiry handler ───────────────────────────────────────────────────────────

export async function handleExpiredPost(postId: string, telegramMessageId: number | null, triggerLabel: string): Promise<void> {
  if (telegramMessageId) {
    await sendExpiryNotice(triggerLabel)
  }
  logger.info('Post expired', { postId })
}
