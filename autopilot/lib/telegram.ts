/**
 * Telegram Bot API client for the autopilot approval gate.
 * No SDK — calls the Telegram Bot API directly via fetch.
 * Webhook endpoint is in api/server.js (added in Phase 11).
 *
 * Critical rule: the webhook handler MUST always return 200.
 * Telegram disables webhooks that return errors repeatedly.
 */

import { config } from './config'
import type { QueuedPost, EditPlatform } from './types'

const TELEGRAM_API = `https://api.telegram.org/bot${config.telegram.botToken}`
const CHAT_ID = config.telegram.chatId

// ─── Keyboard builders ────────────────────────────────────────────────────────

type InlineKeyboard = Array<Array<{ text: string; callback_data: string }>>

function buildApprovalKeyboard(postId: string): InlineKeyboard {
  return [
    [
      { text: '✓ Approve',    callback_data: `approve:${postId}` },
      { text: '✎ Edit Both',  callback_data: `edit_both:${postId}` },
      { text: '✗ Skip',       callback_data: `skip:${postId}` },
    ],
    [
      { text: '✎ Edit X only',  callback_data: `edit_x:${postId}` },
      { text: '✎ Edit IG only', callback_data: `edit_ig:${postId}` },
    ],
  ]
}

function buildCancelKeyboard(postId: string): InlineKeyboard {
  return [[{ text: 'Cancel', callback_data: `cancel:${postId}` }]]
}

// ─── Message text builders ────────────────────────────────────────────────────

function buildApprovalImageCaption(post: QueuedPost): string {
  // Telegram photo caption max is 1024 chars — keep this short
  const eventLabel = post.eventName ?? 'Evergreen'
  return `DIVOT LAB — Post Ready\n\n${post.triggerType.replace(/_/g, ' ').toUpperCase()} · ${eventLabel}`
}

function buildCaptionPreviewText(post: QueuedPost): string {
  const divider = '─'.repeat(21)
  const xLen = post.captionX.length
  const igLen = post.captionIG.length

  const lines = [
    `<b>X CAPTION (${xLen} chars):</b>`,
    post.captionX,
    '',
    divider,
    '',
    `<b>INSTAGRAM CAPTION (${igLen} chars):</b>`,
    post.captionIG,
  ]

  // Weather/conditions context if available
  const weather = post.context?.weather
  if (weather && weather.conditionsFlag !== 'calm') {
    lines.push('')
    lines.push(divider)
    lines.push(`\nConditions: ${weather.conditionsSummary}`)
  }

  if (post.editCount > 0) {
    lines.push(`\n[Edit #${post.editCount}]`)
  }

  return lines.join('\n')
}

function buildEditPromptText(post: QueuedPost, platform: EditPlatform): string {
  const platformLabel = platform === 'twitter' ? 'X' : platform === 'instagram' ? 'Instagram' : 'both platforms'
  const currentCaption = platform === 'instagram' ? post.captionIG : post.captionX

  return [
    `<b>Editing ${platformLabel} caption.</b>`,
    '',
    'Current:',
    `<i>${escapeHtml(currentCaption.slice(0, 300))}${currentCaption.length > 300 ? '...' : ''}</i>`,
    '',
    'Type your correction instruction below.',
    'Examples:',
    '· "Change SG number to +1.6"',
    '· "Remove the last sentence"',
    '· "Make it shorter"',
    '· "The wind was 22mph not 18mph"',
    '',
    'Or tap Cancel to go back.',
  ].join('\n')
}

function buildUpdatedPreviewText(post: QueuedPost, platform: EditPlatform): string {
  const platformLabel = platform === 'twitter' ? 'X' : platform === 'instagram' ? 'Instagram' : 'both platforms'
  const caption = platform === 'instagram' ? post.captionIG : platform === 'twitter' ? post.captionX
    : `X: ${post.captionX}\n\nIG: ${post.captionIG}`

  return [
    `<b>Updated ${platformLabel} caption:</b>`,
    '',
    escapeHtml(caption),
  ].join('\n')
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ─── Core send functions ──────────────────────────────────────────────────────

export interface TelegramMessage {
  message_id: number
  chat: { id: number }
  text?: string
}

async function tgPost(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; result: TelegramMessage }> {
  const res = await fetch(`${TELEGRAM_API}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json() as Promise<{ ok: boolean; result: TelegramMessage }>
}

export async function sendTelegramMessage(
  text: string,
  inlineKeyboard?: InlineKeyboard
): Promise<TelegramMessage> {
  const body: Record<string, unknown> = { chat_id: CHAT_ID, text, parse_mode: 'HTML' }
  if (inlineKeyboard) body['reply_markup'] = { inline_keyboard: inlineKeyboard }
  const result = await tgPost('sendMessage', body)
  return result.result
}

export async function editTelegramMessage(
  messageId: number,
  text: string,
  inlineKeyboard?: InlineKeyboard
): Promise<void> {
  const body: Record<string, unknown> = {
    chat_id: CHAT_ID,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: inlineKeyboard ?? [] },
  }
  await tgPost('editMessageText', body)
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  await tgPost('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  })
}

// ─── Approval message ─────────────────────────────────────────────────────────

/**
 * Send the full approval flow: image + caption preview + keyboard.
 * Returns the message_id of the text message (used to edit later).
 */
export async function sendApprovalMessage(
  post: QueuedPost,
  imageBuffer: Buffer
): Promise<number> {
  // Step 1: send the image with a short caption
  const formData = new FormData()
  formData.append('chat_id', CHAT_ID)
  formData.append('photo', new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' }), 'post.png')
  formData.append('caption', buildApprovalImageCaption(post))

  await fetch(`${TELEGRAM_API}/sendPhoto`, { method: 'POST', body: formData })

  // Step 2: send the full caption preview text with the keyboard
  const textMsg = await sendTelegramMessage(
    buildCaptionPreviewText(post),
    buildApprovalKeyboard(post.id)
  )

  return textMsg.message_id
}

// ─── Edit flow ────────────────────────────────────────────────────────────────

export async function sendEditPrompt(post: QueuedPost, platform: EditPlatform): Promise<number> {
  const msg = await sendTelegramMessage(
    buildEditPromptText(post, platform),
    buildCancelKeyboard(post.id)
  )
  return msg.message_id
}

export async function sendUpdatedPreview(
  post: QueuedPost,
  platform: EditPlatform
): Promise<number> {
  const msg = await sendTelegramMessage(
    buildUpdatedPreviewText(post, platform),
    buildApprovalKeyboard(post.id)
  )
  return msg.message_id
}

// ─── Post confirmation ────────────────────────────────────────────────────────

export async function sendPostConfirmation(
  post: QueuedPost,
  twitterResult: PromiseSettledResult<{ postId: string; postUrl: string }>,
  instagramResult: PromiseSettledResult<{ postId: string; postUrl: string }>
): Promise<void> {
  const lines: string[] = []

  const bothOk = twitterResult.status === 'fulfilled' && instagramResult.status === 'fulfilled'
  const bothFail = twitterResult.status === 'rejected' && instagramResult.status === 'rejected'

  if (bothOk) {
    lines.push('<b>✓ Posted.</b>', '')
    lines.push(`X: ${twitterResult.value.postUrl}`)
    lines.push(`IG: ${instagramResult.value.postUrl}`)
  } else if (bothFail) {
    lines.push('<b>✗ Post failed on both platforms.</b>', '')
    const xErr = twitterResult.reason instanceof Error ? twitterResult.reason.message : 'Unknown error'
    lines.push(`Error: ${xErr}`)
    lines.push('Check dashboard: divotlab.com/autopilot')
  } else {
    lines.push('<b>⚠ Partially posted.</b>', '')
    if (twitterResult.status === 'fulfilled') {
      lines.push(`✓ X: ${twitterResult.value.postUrl}`)
    } else {
      const e = twitterResult.reason instanceof Error ? twitterResult.reason.message : 'Unknown'
      lines.push(`✗ X failed: ${e}`)
    }
    if (instagramResult.status === 'fulfilled') {
      lines.push(`✓ IG: ${instagramResult.value.postUrl}`)
    } else {
      const e = instagramResult.reason instanceof Error ? instagramResult.reason.message : 'Unknown'
      lines.push(`✗ Instagram failed: ${e}`)
    }
    lines.push('Check dashboard: divotlab.com/autopilot')
  }

  const now = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', weekday: 'short' })
  lines.push('', now)

  await sendTelegramMessage(lines.join('\n'))
}

export async function sendExpiryNotice(triggerLabel: string): Promise<void> {
  await sendTelegramMessage(`⏱ Post expired — no action taken.\n\n${triggerLabel}`)
}
