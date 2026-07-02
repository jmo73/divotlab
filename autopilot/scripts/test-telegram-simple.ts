/**
 * Minimal Telegram dry-run test.
 * Renders a leaderboard card, generates captions via Claude,
 * sends to Telegram with Approve/Skip buttons.
 *
 * No database, blob, or X/Instagram credentials needed.
 *
 * Run from /autopilot:
 *   npx tsx scripts/test-telegram-simple.ts
 */

// Load .env.local FIRST before any module reads process.env
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') })

import Anthropic from '@anthropic-ai/sdk'
import { renderHtmlTemplate } from '../lib/renderHtml'
import { leaderboardFields } from '../lib/imageGen'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID!
const TG_API    = `https://api.telegram.org/bot${BOT_TOKEN}`

// ── Telegram helpers ──────────────────────────────────────────────────────────

async function sendPhoto(buf: Buffer, caption: string) {
  const fd = new FormData()
  fd.append('chat_id', CHAT_ID)
  fd.append('photo', new Blob([new Uint8Array(buf)], { type: 'image/png' }), 'card.png')
  fd.append('caption', caption)
  const res = await fetch(`${TG_API}/sendPhoto`, { method: 'POST', body: fd })
  const json = await res.json() as { ok: boolean; description?: string }
  if (!json.ok) throw new Error(`Telegram sendPhoto failed: ${json.description}`)
}

async function sendMessage(
  text: string,
  keyboard?: Array<Array<{ text: string; callback_data: string }>>
) {
  const body: Record<string, unknown> = { chat_id: CHAT_ID, text, parse_mode: 'HTML' }
  if (keyboard) body['reply_markup'] = { inline_keyboard: keyboard }
  const res = await fetch(`${TG_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json() as { ok: boolean; description?: string }
  if (!json.ok) throw new Error(`Telegram sendMessage failed: ${json.description}`)
}

// ── Caption generator ─────────────────────────────────────────────────────────

async function generateCaptions(cardData: object): Promise<{ tweet: string; ig: string }> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `You write social media captions for Divot Lab, a golf analytics brand.

PLATFORM CONSTRAINTS (hard rules):
X/TWITTER:
- Hard limit: 240 characters maximum (leave room for a link added later)
- URLs posted separately count as 23 chars — do not include URLs in the tweet text
- 0 hashtags in the tweet body — hashtags kill engagement on X, never use them
- 1–2 sentences only

INSTAGRAM:
- Max 2,200 characters but keep it under 300 words
- Exactly 3–5 hashtags — no more, no fewer (Instagram penalizes 10+ hashtags)
- Hashtags go on a new line at the very end, after the CTA
- End with: "Full card in Lab Notes Pro — link in bio."
- Choose hashtags from: #Golf #PGATour #GolfTwitter #GolfBetting #GolfAnalytics #DataDrivenGolf #GolfPicks and the specific tournament name

CONTENT RULES (both platforms):
- Lead with the most interesting number, never the tournament name
- Every stat must come from the card data — never invent numbers
- Tone: confident, specific, understated (The Athletic, not ESPN)
- Never use: "fire", "huge", "lock", "can't miss", "on fire", hype language

Card data: ${JSON.stringify(cardData)}

Return JSON only: {"tweet": "...", "ig": "..."}`,
    }],
  })
  const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Claude returned no valid JSON')
  return JSON.parse(match[0]) as { tweet: string; ig: string }
}

function validateCaptions(captions: { tweet: string; ig: string }): void {
  // X: 240 char hard limit
  if (captions.tweet.length > 240) {
    console.warn(`⚠ Tweet is ${captions.tweet.length} chars — over 240 limit, will truncate`)
    captions.tweet = captions.tweet.slice(0, 237) + '...'
  }

  // Instagram: hashtag count
  const hashtagCount = (captions.ig.match(/#\w+/g) ?? []).length
  if (hashtagCount > 5) {
    console.warn(`⚠ Instagram has ${hashtagCount} hashtags — over 5 limit`)
  }
  if (hashtagCount < 3) {
    console.warn(`⚠ Instagram has only ${hashtagCount} hashtags — should have 3–5`)
  }

  // Instagram: character count
  if (captions.ig.length > 2200) {
    console.warn(`⚠ Instagram caption is ${captions.ig.length} chars — over 2,200 limit`)
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const missing = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'ANTHROPIC_API_KEY']
    .filter(k => !process.env[k])
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`)
  console.log('✓ Env vars OK')

  // Static test data
  const cardData = {
    eventName: 'Travelers Championship',
    round: 'After Round 2',
    players: [
      { name: 'Viktor Hovland',    score: -12, dgRating: 178, sgTotal:  4.1 },
      { name: 'Scottie Scheffler', score: -11, dgRating: 196, sgTotal:  3.7 },
      { name: 'Collin Morikawa',   score: -10, dgRating: 182, sgTotal:  2.9 },
      { name: 'Rory McIlroy',      score:  -9, dgRating: 185, sgTotal:  2.4 },
      { name: 'Patrick Cantlay',   score:  -8, dgRating: 170, sgTotal:  1.8 },
    ],
    insight: 'Hovland leads with +4.1 SG: Approach — largest ball-striking advantage at River Highlands since 2019.',
  }

  // Render card
  console.log('Rendering card...')
  const fields = leaderboardFields({
    eventName: 'Travelers Championship · R2',
    courseConditions: 'TPC River Highlands',
    roundBadge: 'After R2',
    players: cardData.players,
    insight: cardData.insight,
    fieldContext: '',
  })
  const imageBuffer = await renderHtmlTemplate('leaderboard', fields, { width: 1080, height: 1350 })
  console.log(`✓ Card rendered (${(imageBuffer.length / 1024).toFixed(0)} KB)`)

  // Generate captions
  console.log('Generating captions via Claude...')
  const captions = await generateCaptions(cardData)
  validateCaptions(captions)
  const igHashtags = (captions.ig.match(/#\w+/g) ?? []).length
  console.log(`✓ Tweet (${captions.tweet.length}/240 chars): ${captions.tweet}`)
  console.log(`✓ IG (${captions.ig.length} chars, ${igHashtags} hashtags): ${captions.ig.slice(0, 80)}...`)

  // Send to Telegram
  console.log('\nSending to Telegram...')
  await sendPhoto(imageBuffer, 'DIVOT LAB · Autopilot Dry Run')

  const divider = '─'.repeat(20)
  await sendMessage(
    [
      '<b>🧪 DRY RUN — nothing will post</b>',
      '',
      `<b>X (${captions.tweet.length}/240 chars):</b>`,
      captions.tweet,
      '',
      divider,
      '',
      `<b>INSTAGRAM (${captions.ig.length} chars · ${igHashtags} hashtags):</b>`,
      captions.ig,
    ].join('\n'),
    [[
      { text: '✓ Pipeline works!', callback_data: 'dry_approve' },
      { text: '✗ Skip',            callback_data: 'dry_skip' },
    ]]
  )

  console.log('\n✓ Check your Telegram bot — card + captions should be there.')
  console.log('(Buttons are display-only in this dry run.)')
}

main().catch(err => {
  console.error('✗', err.message ?? err)
  process.exit(1)
})
