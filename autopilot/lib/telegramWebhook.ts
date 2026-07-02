/**
 * Telegram webhook handler — called from api/server.js Telegram webhook route.
 * Routes button taps (callback_query) and text messages to the correct handler.
 *
 * Two post flows:
 * 1. cronHandler posts (Postgres-backed): action:postId  e.g. "approve:uuid"
 * 2. publisher.ts posts (KV-backed):      pub:action:postId  e.g. "pub:post_x_ig:pub_123_abc"
 *
 * State machine for cronHandler flow:
 *   pending → pending_edit → pending_edit_regenerating → pending → approved → posted
 *
 * Critical: always returns without throwing — exceptions are caught by the route handler.
 * The route always sends 200 before calling this function.
 */

import {
  answerCallbackQuery,
  sendTelegramMessage,
  sendEditPrompt,
} from './telegram'
import {
  atomicApprove,
  getPendingEditPost,
  getQueuedPost,
  updateQueueStatus,
} from './db'
import { firePosting, processEditInstruction } from './queue'
import { logger } from './logger'
import { kvGet, kvDel } from './kv'
import type { PendingPost } from './publisher'
import type { EditPlatform } from './types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TelegramCallbackQuery {
  id: string
  data: string
  message: { message_id: number; chat: { id: number } }
}

interface TelegramMessage {
  message_id: number
  chat: { id: number }
  text?: string
}

interface TelegramUpdate {
  callback_query?: TelegramCallbackQuery
  message?: TelegramMessage
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query)
    // Always answer callback to dismiss Telegram's loading spinner on the button
    await answerCallbackQuery(update.callback_query.id).catch(() => {})
    return
  }

  if (update.message?.text) {
    await handleTextMessage(update.message)
    return
  }
}

// ─── Callback query (button taps) ─────────────────────────────────────────────

async function handleCallbackQuery(query: TelegramCallbackQuery): Promise<void> {
  const parts = query.data.split(':')
  const action = parts[0]

  // publisher.ts posts: `pub:{action}:{postId}` (3 parts)
  if (action === 'pub') {
    const pubAction = parts[1]
    const pubPostId = parts[2]
    if (pubAction && pubPostId) {
      await handlePublisherTap(pubPostId, pubAction)
    } else {
      logger.warn('Malformed pub callback', { data: query.data })
    }
    return
  }

  // cronHandler posts: `{action}:{postId}` (2 parts)
  const postId = parts[1]
  if (!postId) {
    logger.warn('Callback query missing postId', { data: query.data })
    return
  }

  switch (action) {
    case 'approve':
      await handleApprove(postId)
      break
    case 'edit_x':
      await handleEditStart(postId, 'twitter')
      break
    case 'edit_ig':
      await handleEditStart(postId, 'instagram')
      break
    case 'edit_both':
      await handleEditStart(postId, 'both')
      break
    case 'skip':
      await handleSkip(postId)
      break
    case 'cancel':
      await handleEditCancel(postId)
      break
    default:
      logger.warn('Unknown callback action', { action, postId })
  }
}

// ─── publisher.ts tap handler (KV-backed) ────────────────────────────────────

async function handlePublisherTap(postId: string, action: string): Promise<void> {
  if (action === 'skip') {
    await kvDel(`autopilot:pub:${postId}`)
    await sendTelegramMessage('Skipped. No post was made.')
    logger.info('Publisher post skipped', { postId })
    return
  }

  const post = await kvGet<PendingPost>(`autopilot:pub:${postId}`)
  if (!post) {
    await sendTelegramMessage('Post not found — it may have expired (6-hour window).')
    return
  }

  await sendTelegramMessage('Posting now...')

  const postWithImage = (action === 'post_x_ig' || action === 'post_x_image') && !!post.jpegBlobUrl

  let xUrl: string | undefined
  let igUrl: string | undefined

  // ── Post to X ───────────────────────────────────────────────────────────────
  try {
    const { TwitterApi } = await import('twitter-api-v2')
    const xClient = new TwitterApi({
      appKey:    process.env.X_API_KEY!,
      appSecret: process.env.X_API_KEY_SECRET!,
      accessToken:  process.env.X_ACCESS_TOKEN!,
      accessSecret: process.env.X_ACCESS_TOKEN_SECRET!,
    })

    if (postWithImage) {
      const imgBuf = Buffer.from(await (await fetch(post.jpegBlobUrl!)).arrayBuffer())
      const mediaId = await xClient.v1.uploadMedia(imgBuf, { mimeType: 'image/jpeg', target: 'tweet' })
      const result = await xClient.v2.tweet({ text: post.tweet, media: { media_ids: [mediaId] } })
      xUrl = `https://x.com/divotlab/status/${result.data.id}`
    } else {
      const result = await xClient.v2.tweet({ text: post.tweet })
      xUrl = `https://x.com/divotlab/status/${result.data.id}`
    }
    logger.info('Publisher tap: X posted', { postId, xUrl })
  } catch (err) {
    logger.error('Publisher tap: X failed', err, { postId })
    await sendTelegramMessage(
      `❌ X post failed:\n<code>${(err as Error).message}</code>\n\n${post.tweet}`
    ).catch(() => {})
  }

  // ── Post to Instagram ────────────────────────────────────────────────────────
  if (action === 'post_x_ig' && post.jpegBlobUrl && post.igCaption) {
    try {
      const { postToInstagram } = await import('./instagram')
      const result = await postToInstagram(post.igCaption, post.jpegBlobUrl)
      igUrl = result.postUrl
      logger.info('Publisher tap: IG posted', { postId, igUrl })
    } catch (err) {
      logger.error('Publisher tap: IG failed', err, { postId })
      await sendTelegramMessage(
        `❌ Instagram failed:\n<code>${(err as Error).message}</code>`
      ).catch(() => {})
    }
  }

  // Delete KV entry (done even if posting partially failed)
  await kvDel(`autopilot:pub:${postId}`)

  // Send confirmation
  const lines = ['✅ Posted!']
  if (xUrl)  lines.push(`X: ${xUrl}`)
  if (igUrl) lines.push(`IG: ${igUrl}`)
  await sendTelegramMessage(lines.join('\n'))
}

// ─── cronHandler individual handlers ─────────────────────────────────────────

async function handleApprove(postId: string): Promise<void> {
  // Send "Posting now..." before firing (fire is async)
  await sendTelegramMessage('Posting now...')

  // Fire asynchronously — do not await so Telegram doesn't time out
  // firePosting handles its own error logging and sends confirmation
  setImmediate(async () => {
    try {
      await firePosting(postId)
    } catch (err) {
      logger.error('firePosting failed', err, { postId })
      await sendTelegramMessage(`✗ Posting error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {})
    }
  })
}

async function handleEditStart(postId: string, platform: EditPlatform): Promise<void> {
  // Check post is still pending
  const post = await getQueuedPost(postId).catch(() => null)
  if (!post || post.status !== 'pending') {
    await sendTelegramMessage('This post is no longer waiting — it may have been approved, skipped, or expired.')
    return
  }

  // Update status and record which platform is being edited
  await updateQueueStatus(postId, 'pending_edit', { editPlatform: platform })

  // Send edit prompt with Cancel button
  await sendEditPrompt(post, platform)
  logger.info('Edit started', { postId, platform })
}

async function handleEditCancel(postId: string): Promise<void> {
  const post = await getQueuedPost(postId).catch(() => null)
  if (!post) {
    await sendTelegramMessage('Post not found.')
    return
  }

  // Reset to pending
  await updateQueueStatus(postId, 'pending', { editPlatform: null })
  await sendTelegramMessage('Edit cancelled. Post is still pending.')
  logger.info('Edit cancelled', { postId })
}

async function handleSkip(postId: string): Promise<void> {
  const post = await getQueuedPost(postId).catch(() => null)
  if (!post || (post.status !== 'pending' && post.status !== 'pending_edit')) {
    await sendTelegramMessage('This post is no longer active.')
    return
  }

  await updateQueueStatus(postId, 'skipped', { skippedAt: new Date() })
  await sendTelegramMessage('Skipped. No post was made.')
  logger.info('Post skipped', { postId })
}

// ─── Text message handler ─────────────────────────────────────────────────────

async function handleTextMessage(message: TelegramMessage): Promise<void> {
  const text = message.text?.trim()
  if (!text) return

  // Check if there's a pending_edit post waiting for an instruction
  const pendingEdit = await getPendingEditPost()

  if (!pendingEdit) {
    await sendTelegramMessage('No post is waiting for edits right now.')
    return
  }

  // Treat the incoming text as the edit instruction
  await sendTelegramMessage('Got it. Regenerating...')

  const platform = pendingEdit.editPlatform ?? 'both'

  try {
    await processEditInstruction(pendingEdit.id, text, platform)
    logger.info('Edit processed', { postId: pendingEdit.id, platform, instruction: text })
  } catch (err) {
    logger.error('processEditInstruction failed', err, { postId: pendingEdit.id })
    await updateQueueStatus(pendingEdit.id, 'pending').catch(() => {})
    await sendTelegramMessage(`Edit failed: ${err instanceof Error ? err.message : String(err)}\n\nPost is still pending — you can try again.`).catch(() => {})
  }
}
