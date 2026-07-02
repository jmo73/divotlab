/**
 * Instagram posting test.
 * Renders the stat-leaders card and sends it to Telegram for approval,
 * then posts to Instagram if approved.
 *
 * Run from /autopilot:
 *   npx tsx scripts/test-instagram.ts
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') })

import { put } from '@vercel/blob'
import { postToInstagram } from '../lib/instagram'

const TG_API  = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`
const CHAT_ID = process.env.TELEGRAM_CHAT_ID!

async function tgMsg(text: string) {
  await fetch(`${TG_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
  })
}

async function tgSendPhoto(
  imageBuffer: Buffer,
  caption: string,
  buttons: Array<Array<{ text: string; callback_data: string }>>
) {
  const form = new FormData()
  form.append('chat_id', CHAT_ID)
  form.append('caption', caption)
  form.append('parse_mode', 'HTML')
  form.append('photo', new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' }), 'card.png')
  if (buttons.length) {
    form.append('reply_markup', JSON.stringify({ inline_keyboard: buttons }))
  }
  const res = await fetch(`${TG_API}/sendPhoto`, { method: 'POST', body: form })
  const json = await res.json() as { ok: boolean; description?: string }
  if (!json.ok) throw new Error(`sendPhoto failed: ${json.description}`)
}

async function tgWaitForCallback(timeoutMs: number): Promise<string | null> {
  const deadline = Date.now() + timeoutMs
  let offset = 0
  while (Date.now() < deadline) {
    const res = await fetch(`${TG_API}/getUpdates?offset=${offset}&timeout=10&allowed_updates=["callback_query"]`)
    const json = await res.json() as {
      ok: boolean
      result: Array<{ update_id: number; callback_query?: { id: string; data: string } }>
    }
    if (json.ok) {
      for (const u of json.result) {
        offset = u.update_id + 1
        if (u.callback_query) {
          await fetch(`${TG_API}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callback_query_id: u.callback_query.id }),
          })
          return u.callback_query.data
        }
      }
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  return null
}

async function pngToJpeg(png: Buffer): Promise<Buffer> {
  // Dynamic import sharp — only used here so we don't force it on every script
  const sharp = (await import('sharp')).default
  return sharp(png).jpeg({ quality: 92 }).toBuffer()
}

async function main() {
  const missing = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_USER_ID', 'BLOB_READ_WRITE_TOKEN']
    .filter(k => !process.env[k])
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`)

  // ── Render a test card (reuse stat-leaders data) ──────────────────────────
  console.log('Fetching data and rendering card...')
  const { getCourseFit, getModelPickCandidates } = await import('../lib/datagolf')
  const { renderHtmlTemplate } = await import('../lib/renderHtml')

  const [cfData, candidates] = await Promise.all([getCourseFit(), getModelPickCandidates()])
  const eventName = cfData.tournament?.event_name ?? 'This Week'
  const weights   = cfData.course_weights

  type StatKey = 'sgApp' | 'sgPutt' | 'sgOtt' | 'sgArg'
  const STAT_META: Record<StatKey, { label: string; short: string; courseWeightKey: string }> = {
    sgApp:  { label: 'SG: Approach', short: 'SG: App',  courseWeightKey: 'app'  },
    sgPutt: { label: 'SG: Putting',  short: 'SG: Putt', courseWeightKey: 'putt' },
    sgOtt:  { label: 'SG: Off-Tee',  short: 'SG: OTT',  courseWeightKey: 'ott'  },
    sgArg:  { label: 'SG: Around-Green', short: 'SG: ARG', courseWeightKey: 'arg' },
  }
  const entries: [StatKey, number][] = [
    ['sgApp', weights.app], ['sgPutt', weights.putt], ['sgOtt', weights.ott], ['sgArg', weights.arg],
  ]
  const statKey  = entries.sort((a, b) => b[1] - a[1])[0][0]
  const statMeta = STAT_META[statKey]
  const statPct  = Math.round(((weights as unknown) as Record<string, number>)[statMeta.courseWeightKey] * 100)

  const fmt = (v: number | undefined) => v == null ? 'N/A' : (v >= 0 ? '+' : '') + v.toFixed(2)
  const cls = (v: number | undefined) => v == null ? '' : v >= 0 ? 'pos' : 'neg'

  const ranked = candidates
    .filter(p => p[statKey] != null)
    .sort((a, b) => (b[statKey] ?? -99) - (a[statKey] ?? -99))
    .slice(0, 3)

  const fields: Record<string, string> = {
    BADGE: 'Model Analysis', STAT_LABEL: statMeta.label, STAT_PCT: String(statPct),
    STAT_SHORT: statMeta.short, EVENT_NAME: eventName,
    CONTEXT_LINE: `${statMeta.label} is the #1 weighted factor at ${eventName} at ${statPct}% of the course-fit model. These three players lead the full field on this metric.`,
    P1_NAME: ranked[0].playerName, P1_WIN_PCT: (ranked[0].winPct * 100).toFixed(1) + '%',
    P1_FIT: String(Math.round(ranked[0].fitScore)), P1_STAT: fmt(ranked[0][statKey]), P1_STAT_CLASS: cls(ranked[0][statKey]),
    P2_NAME: ranked[1].playerName, P2_WIN_PCT: (ranked[1].winPct * 100).toFixed(1) + '%',
    P2_FIT: String(Math.round(ranked[1].fitScore)), P2_STAT: fmt(ranked[1][statKey]), P2_STAT_CLASS: cls(ranked[1][statKey]),
    P3_NAME: ranked[2].playerName, P3_WIN_PCT: (ranked[2].winPct * 100).toFixed(1) + '%',
    P3_FIT: String(Math.round(ranked[2].fitScore)), P3_STAT: fmt(ranked[2][statKey]), P3_STAT_CLASS: cls(ranked[2][statKey]),
  }

  const pngBuf = await renderHtmlTemplate('stat-leaders', fields, { height: 1350 })
  console.log(`✓ Card rendered (${(pngBuf.length / 1024).toFixed(0)} KB PNG)`)

  // ── Convert PNG → JPEG (Instagram requires JPEG) ─────────────────────────
  console.log('Converting PNG → JPEG...')
  const jpegBuf = await pngToJpeg(pngBuf)
  console.log(`✓ JPEG: ${(jpegBuf.length / 1024).toFixed(0)} KB`)

  // ── Upload to Vercel Blob (Instagram needs a public URL) ─────────────────
  console.log('Uploading to Vercel Blob...')
  const blobResult = await put(`autopilot/test-${Date.now()}.jpg`, jpegBuf, {
    access: 'public',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  })
  console.log(`✓ Blob URL: ${blobResult.url}`)

  // ── Caption ──────────────────────────────────────────────────────────────
  const igCaption = [
    `${ranked[0].playerName} leads the field in ${statMeta.short} at the ${eventName} at ${fmt(ranked[0][statKey])} per round.`,
    `${statMeta.label} carries ${statPct}% of the course-fit weight here — more than any other category.`,
    `${ranked[1].playerName} (${fmt(ranked[1][statKey])}) and ${ranked[2].playerName} (${fmt(ranked[2][statKey])}) round out the top 3.`,
    `Full model breakdown at divotlab.com/pro — link in bio.`,
  ].join('\n\n')

  // ── Telegram preview ─────────────────────────────────────────────────────
  console.log('\nSending to Telegram for approval...')
  await tgSendPhoto(pngBuf, [
    `<b>Instagram test — ${eventName}</b>`,
    `Key stat: <b>${statMeta.label} (${statPct}%)</b>`,
    `─────────────────────────────`,
    `<b>IG CAPTION:</b>`,
    igCaption,
  ].join('\n'), [
    [{ text: '📷 Post to Instagram', callback_data: 'post_ig' }],
    [{ text: '✗ Skip',              callback_data: 'skip'    }],
  ])

  console.log('Waiting for Telegram approval (5 min)...')
  const action = await tgWaitForCallback(5 * 60 * 1000)

  if (!action || action === 'skip') {
    console.log('✗ Skipped.')
    await tgMsg('Skipped.')
    return
  }

  // ── Post to Instagram ────────────────────────────────────────────────────
  console.log('\nPosting to Instagram...')
  try {
    const result = await postToInstagram(igCaption, blobResult.url)
    console.log('✓ Posted:', result.postUrl)
    await tgMsg(`✅ Instagram posted!\n${result.postUrl}`)
  } catch (err) {
    const msg = (err as Error).message
    console.error('✗ Instagram post failed:', msg)
    await tgMsg(`❌ Instagram failed:\n<code>${msg}</code>`)
  }
}

main().catch(async err => {
  console.error('\n✗', (err as Error).message)
  await tgMsg(`❌ test-instagram failed:\n<code>${(err as Error).message}</code>`).catch(() => {})
  process.exit(1)
})
