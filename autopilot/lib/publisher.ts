/**
 * Shared publish helper — used by all content scripts.
 *
 * Flow (webhook-based, no long-polling):
 * 1. Renders JPEG, uploads to Vercel Blob.
 * 2. Stores pending post in KV (`autopilot:pub:{postId}`) with 6-hour TTL.
 * 3. Sends Telegram message with approve/skip buttons.
 * 4. Returns immediately — laptop can be closed.
 *
 * When the user taps a button on their phone, Telegram fires the webhook at
 * /api/autopilot/telegram/webhook → telegramWebhook.ts handlePublisherTap()
 * which retrieves the KV data, posts to X + IG, and sends confirmation.
 *
 * Callback data format: `pub:{action}:{postId}`
 *   action = post_x_ig | post_x_image | post_x_text | skip
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') })

import { put } from '@vercel/blob'
import { kvSet } from './kv'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PublishOptions {
  pngBuf?: Buffer        // rendered card — omit for text-only posts
  tweet: string          // X tweet text (max ~220 chars before link)
  igCaption?: string     // Instagram caption — if omitted, IG button is hidden
  tgPreview: string      // Telegram message body (HTML supported)
  label: string          // short label e.g. "Tuesday Model · Memorial"
  link?: string          // appended to tweet on its own line
}

export interface PendingPost {
  tweet: string
  igCaption?: string
  jpegBlobUrl?: string   // public JPEG URL — used by webhook for X image + IG
  label: string
}

export interface PublishResult {
  postId: string
}

// ─── Telegram helpers ─────────────────────────────────────────────────────────

const TG_API = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`
const CHAT_ID = () => process.env.TELEGRAM_CHAT_ID!

async function tgSendPhoto(
  buf: Buffer,
  caption: string,
  buttons: Array<Array<{ text: string; callback_data: string }>>
) {
  const form = new FormData()
  form.append('chat_id', CHAT_ID())
  form.append('caption', caption)
  form.append('parse_mode', 'HTML')
  form.append('photo', new Blob([new Uint8Array(buf)], { type: 'image/png' }), 'card.png')
  if (buttons.length) form.append('reply_markup', JSON.stringify({ inline_keyboard: buttons }))
  const res = await fetch(`${TG_API()}/sendPhoto`, { method: 'POST', body: form })
  const json = await res.json() as { ok: boolean; description?: string }
  if (!json.ok) throw new Error(`Telegram sendPhoto failed: ${json.description}`)
}

async function tgSendText(
  text: string,
  buttons: Array<Array<{ text: string; callback_data: string }>>
) {
  const res = await fetch(`${TG_API()}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID(),
      text,
      parse_mode: 'HTML',
      ...(buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {}),
    }),
  })
  const json = await res.json() as { ok: boolean; description?: string }
  if (!json.ok) throw new Error(`Telegram sendMessage failed: ${json.description}`)
}

export async function tgNotify(text: string): Promise<void> {
  await fetch(`${TG_API()}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID(), text, parse_mode: 'HTML' }),
  }).catch(() => {})
}

// ─── Image helpers ────────────────────────────────────────────────────────────

async function pngToJpeg(buf: Buffer): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  return sharp(buf).jpeg({ quality: 92 }).toBuffer()
}

async function uploadToBlob(jpeg: Buffer, label: string): Promise<string> {
  const slug = label.replace(/[^a-z0-9]/gi, '-').toLowerCase()
  const result = await put(`autopilot/${slug}-${Date.now()}.jpg`, jpeg, {
    access: 'public',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  })
  return result.url
}

// ─── Credential checks ────────────────────────────────────────────────────────

function hasXCreds(): boolean {
  return !!(process.env.X_API_KEY && process.env.X_API_KEY_SECRET &&
            process.env.X_ACCESS_TOKEN && process.env.X_ACCESS_TOKEN_SECRET)
}

function hasIGCreds(): boolean {
  return !!(process.env.INSTAGRAM_USER_ID && process.env.INSTAGRAM_ACCESS_TOKEN &&
            process.env.BLOB_READ_WRITE_TOKEN)
}

// ─── Main publish function ────────────────────────────────────────────────────

export async function publish(opts: PublishOptions): Promise<PublishResult> {
  const { pngBuf, tweet: baseTweet, igCaption, tgPreview, label, link } = opts

  const postId = `pub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const raw = link ? `${baseTweet}\n\n${link}` : baseTweet
  const tweet = raw.length > 275 ? raw.slice(0, 274).replace(/\s\S+$/, '') + '…' : raw
  if (raw.length > 275) console.warn(`[publisher] Tweet truncated: ${raw.length} → ${tweet.length} chars`)

  // Enforce Instagram 5-hashtag max
  let safeIgCaption = igCaption
  if (igCaption) {
    const tags = igCaption.match(/#\w+/g) ?? []
    if (tags.length > 5) {
      console.warn(`[publisher] IG caption has ${tags.length} hashtags — trimming to 5`)
      let trimmed = igCaption
      tags.slice(5).forEach(t => { trimmed = trimmed.replace(t, '').replace(/\s{2,}/g, ' ').trim() })
      safeIgCaption = trimmed
    }
  }

  const canX  = hasXCreds()
  const canIG = hasIGCreds() && !!safeIgCaption && !!pngBuf

  console.log(`[publisher] ${label}`)
  console.log(`  X: ${canX ? '✓' : '✗ missing creds'}  |  IG: ${canIG ? '✓' : '✗'}`)

  // Upload JPEG to Blob now (webhook needs a URL to fetch from, not a buffer)
  let jpegBlobUrl: string | undefined
  if (pngBuf) {
    const jpeg = await pngToJpeg(pngBuf)
    jpegBlobUrl = await uploadToBlob(jpeg, label)
    console.log(`  ✓ JPEG uploaded: ${jpegBlobUrl}`)
  }

  // Store pending post in KV — 6-hour window to approve
  const pending: PendingPost = { tweet, igCaption: safeIgCaption, jpegBlobUrl, label }
  await kvSet(`autopilot:pub:${postId}`, pending, 6 * 60 * 60)

  // Build Telegram buttons
  const buttons: Array<Array<{ text: string; callback_data: string }>> = []

  if (pngBuf) {
    const row1: Array<{ text: string; callback_data: string }> = []
    if (canX && canIG) row1.push({ text: '📷 X + Instagram', callback_data: `pub:post_x_ig:${postId}` })
    if (canX)          row1.push({ text: '📷 X only',        callback_data: `pub:post_x_image:${postId}` })
    if (row1.length)   buttons.push(row1)
  }

  const row2: Array<{ text: string; callback_data: string }> = []
  if (canX) row2.push({ text: '📝 Text only (X)', callback_data: `pub:post_x_text:${postId}` })
  row2.push({ text: '✗ Skip', callback_data: `pub:skip:${postId}` })
  buttons.push(row2)

  const divider = '─'.repeat(32)
  const fullCaption = [
    `<b>${label}</b>`,
    divider,
    tgPreview,
    divider,
    `<b>TWEET (${tweet.length}/280):</b>`,
    tweet,
    ...(safeIgCaption ? [`<b>INSTAGRAM:</b>`, safeIgCaption] : []),
  ].join('\n')

  if (pngBuf) {
    await tgSendPhoto(pngBuf, fullCaption, buttons)
  } else {
    await tgSendText(fullCaption, buttons)
  }

  console.log(`  ✓ Queued ${postId} — tap approve on Telegram (6h window)`)
  return { postId }
}
