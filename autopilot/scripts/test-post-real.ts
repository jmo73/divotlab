/**
 * Real post test — Telegram gate → X post.
 *
 * Fetches live DataGolf data, picks the most post-worthy card type,
 * renders it, generates captions via Claude, sends to Telegram for approval,
 * and on approval actually posts to X.
 *
 * Instagram is skipped until BLOB_READ_WRITE_TOKEN is set (image needs a public URL).
 *
 * Run from /autopilot:
 *   npx tsx scripts/test-post-real.ts
 *
 * Required env vars:
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, DATAGOLF_API_KEY,
 *   ANTHROPIC_API_KEY, X_API_KEY, X_API_KEY_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET
 */

// Load .env.local FIRST
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') })

import Anthropic from '@anthropic-ai/sdk'
import { TwitterApi } from 'twitter-api-v2'
import {
  getModelPickCandidates,
  getLiveTournamentStats,
  getInPlayProbabilities,
  getCourseFit,
  estimateCutLine,
  type LiveTournamentPlayer,
} from '../lib/datagolf'
import {
  leaderboardFields,
  spotlightFields,
  modelPicksFields,
  cutAlertFields,
  pickResultFields,
  formatScore,
  scoreColor,
  formatSG,
} from '../lib/imageGen'
import { renderHtmlTemplate } from '../lib/renderHtml'

// ── Telegram helpers ──────────────────────────────────────────────────────────

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID!
const TG_API    = `https://api.telegram.org/bot${BOT_TOKEN}`

async function tgPhoto(buf: Buffer, caption: string): Promise<string> {
  const fd = new FormData()
  fd.append('chat_id', CHAT_ID)
  fd.append('photo', new Blob([new Uint8Array(buf)], { type: 'image/png' }), 'card.png')
  fd.append('caption', caption)
  const res = await fetch(`${TG_API}/sendPhoto`, { method: 'POST', body: fd })
  const j = await res.json() as { ok: boolean; result?: { message_id: number }; description?: string }
  if (!j.ok) throw new Error(`tgPhoto: ${j.description}`)
  return String(j.result!.message_id)
}

async function tgMsg(
  text: string,
  keyboard?: Array<Array<{ text: string; callback_data: string }>>
): Promise<string> {
  const body: Record<string, unknown> = { chat_id: CHAT_ID, text, parse_mode: 'HTML' }
  if (keyboard) body['reply_markup'] = { inline_keyboard: keyboard }
  const res = await fetch(`${TG_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await res.json() as { ok: boolean; result?: { message_id: number }; description?: string }
  if (!j.ok) throw new Error(`tgMsg: ${j.description}`)
  return String(j.result!.message_id)
}

async function tgWaitForCallback(timeoutMs = 5 * 60 * 1000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs
  let offset = 0
  while (Date.now() < deadline) {
    const res = await fetch(`${TG_API}/getUpdates?offset=${offset}&timeout=30&allowed_updates=["callback_query"]`)
    const j = await res.json() as { ok: boolean; result: Array<{ update_id: number; callback_query?: { data: string; id: string } }> }
    if (!j.ok) { await sleep(2000); continue }
    for (const update of j.result) {
      offset = update.update_id + 1
      if (update.callback_query) {
        // Dismiss spinner
        await fetch(`${TG_API}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: update.callback_query.id }),
        })
        return update.callback_query.data
      }
    }
  }
  return null
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ── Caption generator ─────────────────────────────────────────────────────────

async function generateCaptions(
  cardType: string,
  cardData: object
): Promise<{ tweet: string; ig: string }> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `You write social media captions for Divot Lab, a golf analytics brand.
Card type: ${cardType}

PLATFORM CONSTRAINTS (hard rules):
X/TWITTER:
- Max 240 characters (leave room for a link added at post time)
- 0 hashtags — hashtags suppress organic reach on X
- 1–2 sentences only, no URLs

INSTAGRAM:
- Under 300 words
- Exactly 3–5 hashtags at the very end on a new line
- End with: "Full card in Lab Notes Pro — link in bio."
- Pick from: #Golf #PGATour #GolfTwitter #GolfBetting #GolfAnalytics #DataDrivenGolf #GolfPicks #JohnDeereClassic #TravelersChampionship

CONTENT RULES:
- Lead with the most interesting number, not the tournament name
- Every stat must come from the card data
- Tone: confident, specific, understated (The Athletic, not ESPN)
- Never use: "fire", "huge", "lock", "can't miss", "on fire"

Card data: ${JSON.stringify(cardData)}

Return JSON only: {"tweet": "...", "ig": "..."}`,
    }],
  })
  const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Claude returned no valid JSON')
  const captions = JSON.parse(match[0]) as { tweet: string; ig: string }

  // Hard truncate tweet if over limit
  if (captions.tweet.length > 240) {
    console.warn(`⚠ Tweet ${captions.tweet.length} chars — truncating`)
    captions.tweet = captions.tweet.slice(0, 237) + '...'
  }
  return captions
}

// ── X posting ─────────────────────────────────────────────────────────────────

function buildXClient() {
  const { X_API_KEY, X_API_KEY_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET } = process.env
  if (!X_API_KEY || !X_API_KEY_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_TOKEN_SECRET) {
    return null
  }
  return new TwitterApi({
    appKey:      X_API_KEY,
    appSecret:   X_API_KEY_SECRET,
    accessToken: X_ACCESS_TOKEN,
    accessSecret: X_ACCESS_TOKEN_SECRET,
  })
}

async function postToX(
  xClient: InstanceType<typeof TwitterApi>,
  tweet: string,
  imageBuffer: Buffer
): Promise<string> {
  // Try image tweet first, fall back to text-only if media upload fails
  try {
    const mediaId = await xClient.v1.uploadMedia(imageBuffer, {
      mimeType: 'image/png',
      target: 'tweet',
    })
    const result = await xClient.v2.tweet({
      text: tweet,
      media: { media_ids: [mediaId] },
    })
    return `https://x.com/divotlab/status/${result.data.id}`
  } catch (mediaErr) {
    const errObj = mediaErr as { code?: number; errors?: unknown; data?: unknown; message?: string }
    console.warn('⚠ Media upload failed:')
    console.warn('  status:', errObj.code)
    console.warn('  errors:', JSON.stringify(errObj.errors ?? errObj.data ?? errObj.message))
    try {
      const result = await xClient.v2.tweet({ text: tweet })
      return `https://x.com/divotlab/status/${result.data.id}`
    } catch (tweetErr) {
      const e = tweetErr as { code?: number; errors?: unknown; data?: unknown; message?: string }
      console.error('⚠ Text-only tweet failed:')
      console.error('  status:', e.code)
      console.error('  errors:', JSON.stringify(e.errors ?? e.data ?? e.message))
      throw tweetErr
    }
  }
}

// ── Card builders ─────────────────────────────────────────────────────────────

async function buildLeaderboardCard(
  players: LiveTournamentPlayer[],
  eventName: string,
  inPlayMap: Map<number, { win: number; top_10: number }>
): Promise<{ buf: Buffer; cardData: object; label: string }> {
  const top5 = players.slice(0, 5)
  const leader = top5[0]
  const leaderIP = leader ? inPlayMap.get(leader.dg_id) : null

  const fields = leaderboardFields({
    eventName,
    courseConditions: '',
    roundBadge: 'Live',
    players: top5.map(p => ({
      name:     p.player_name,
      score:    p.total,
      dgRating: undefined,
      sgTotal:  p.sg_total,
    })),
    insight: leader
      ? `${leader.player_name} leads at ${formatScore(leader.total)} — model win probability: ${
          leaderIP ? `${(leaderIP.win * 100).toFixed(0)}%` : 'N/A'
        }.`
      : 'Model data unavailable.',
    fieldContext: '',
  })

  const buf = await renderHtmlTemplate('leaderboard', fields, { width: 1080, height: 1350 })
  return {
    buf,
    label: 'Leaderboard',
    cardData: {
      eventName,
      leader: leader?.player_name,
      leaderScore: leader ? formatScore(leader.total) : 'N/A',
      winProbability: leaderIP ? `${(leaderIP.win * 100).toFixed(0)}%` : 'N/A',
      top5: top5.map(p => ({
        name:  p.player_name,
        score: formatScore(p.total),
        sg:    p.sg_total != null ? formatSG(p.sg_total) : 'N/A',
      })),
    },
  }
}

async function buildModelPicksCard(
  eventName: string,
  courseName: string,
  weights: { ott: number; app: number; arg: number; putt: number }
): Promise<{ buf: Buffer; cardData: object; label: string }> {
  const candidates = await getModelPickCandidates()
  const top3 = candidates.slice(0, 3)
  const darkHorse = candidates[candidates.length > 10 ? 9 : candidates.length - 1]

  const weightStr = [
    weights.app  > 0 ? `App ${Math.round(weights.app * 100)}%`  : '',
    weights.putt > 0 ? `Putt ${Math.round(weights.putt * 100)}%` : '',
    weights.ott  > 0 ? `OTT ${Math.round(weights.ott * 100)}%`  : '',
    weights.arg  > 0 ? `ARG ${Math.round(weights.arg * 100)}%`  : '',
  ].filter(Boolean).join(', ')

  const fields = modelPicksFields({
    eventName: `${eventName} · ${courseName}`,
    badge: 'Model Picks',
    picks: top3.map(p => ({
      name:        p.playerName,
      winPct:      `${(p.winPct * 100).toFixed(1)}% win`,
      fitScore:    p.fitScore,
      keyStrength: buildStrengthLine(p),
    })),
    darkHorse: {
      name:   darkHorse?.playerName ?? '—',
      reason: darkHorse
        ? `${(darkHorse.winPct * 100).toFixed(1)}% win · Fit rank #${darkHorse.fitRank} · Combined rank #${darkHorse.combinedRank}`
        : '',
    },
  })

  const buf = await renderHtmlTemplate('model-picks', fields, { width: 1080, height: 1350 })
  return {
    buf,
    label: 'Model Picks',
    cardData: {
      eventName,
      courseName,
      courseWeights: weightStr,
      top3: top3.map(p => ({
        name:     p.playerName,
        winPct:   `${(p.winPct * 100).toFixed(1)}%`,
        fitScore: p.fitScore,
        fitRank:  p.fitRank,
      })),
      darkHorse: darkHorse ? {
        name:    darkHorse.playerName,
        winPct:  `${(darkHorse.winPct * 100).toFixed(1)}%`,
        fitRank: darkHorse.fitRank,
      } : null,
    },
  }
}

function buildStrengthLine(p: { sgApp?: number; sgPutt?: number; sgOtt?: number; sgArg?: number; fitRank: number }): string {
  const parts: string[] = []
  if (p.sgApp  != null) parts.push(`App ${formatSG(p.sgApp)}`)
  if (p.sgPutt != null) parts.push(`Putt ${formatSG(p.sgPutt)}`)
  if (p.sgOtt  != null) parts.push(`OTT ${formatSG(p.sgOtt)}`)
  if (parts.length === 0) parts.push(`Fit rank #${p.fitRank}`)
  return parts.slice(0, 2).join(' · ')
}

async function buildCutAlertCard(
  players: LiveTournamentPlayer[],
  eventName: string,
  knownPickNames: string[]
): Promise<{ buf: Buffer; cardData: object; label: string }> {
  const { cutLine, bubblePlayers } = estimateCutLine(players)
  const cutLabel = formatScore(cutLine)

  // Show 2 just-made + 2 just-missed for dramatic tension
  const sorted = [...players].sort((a, b) => a.total - b.total)
  const justMade   = sorted.filter(p => p.total <= cutLine).slice(-2)
  const justMissed = sorted.filter(p => p.total > cutLine).slice(0, 2)
  const cutPlayers = [...justMade, ...justMissed]

  const fields = cutAlertFields({
    eventName,
    cutLine: cutLabel,
    players: cutPlayers.map(p => ({
      name:   p.player_name,
      score:  p.total,
      status: p.total <= cutLine ? 'MADE' : 'MISSED',
      isPick: knownPickNames.some(n => n.toLowerCase() === p.player_name.toLowerCase()),
    })),
  })

  const buf = await renderHtmlTemplate('cut-alert', fields, { width: 1080, height: 1350 })
  return {
    buf,
    label: 'Cut Alert',
    cardData: { eventName, cutLine: cutLabel, bubblePlayers: bubblePlayers.length, cutPlayers },
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Validate required env vars
  const required = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'DATAGOLF_API_KEY', 'ANTHROPIC_API_KEY']
  const missing = required.filter(k => !process.env[k])
  if (missing.length) throw new Error(`Missing: ${missing.join(', ')}`)

  const xClient = buildXClient()
  const xReady = xClient != null
  console.log(xReady ? '✓ X credentials found — will post for real' : '⚠ X credentials missing — Telegram preview only')

  // ── Fetch data sequentially to avoid rate limit (45 req/min) ─────────────

  console.log('\nFetching data...')

  const cfData = await getCourseFit()
  console.log(`  ✓ Course-fit: ${cfData.tournament?.event_name} (${cfData.field.length} players)`)
  await sleep(1200)

  const liveResult = await getLiveTournamentStats('event').catch(err => {
    console.warn('  ⚠ Live stats unavailable:', err.message)
    return { eventName: '', players: [] as LiveTournamentPlayer[] }
  })
  console.log(`  ✓ Live stats: ${liveResult.eventName || 'none'} (${liveResult.players.length} players)`)
  await sleep(1200)

  const inPlayResult = await getInPlayProbabilities().catch(err => {
    console.warn('  ⚠ In-play unavailable:', err.message)
    return null
  })
  console.log(`  ✓ In-play: ${inPlayResult?.info.event_name ?? 'none'} (${inPlayResult?.players.length ?? 0} players)`)

  const { players: livePlayers } = liveResult
  const activePlayers = livePlayers
    .filter(p => p.total != null && !isNaN(p.total))
    .sort((a, b) => a.total - b.total)

  const inPlayMap = new Map((inPlayResult?.players ?? []).map(p => [p.dg_id, p]))

  const isLive    = activePlayers.length > 0
  const cfEvent   = cfData.tournament?.event_name ?? 'Unknown Event'
  const cfCourse  = cfData.tournament?.course ?? ''
  const cfWeights = cfData.course_weights

  const liveEventName = liveResult.eventName || cfEvent
  console.log(`✓ Live tournament: ${isLive ? liveEventName + ' (' + activePlayers.length + ' players)' : 'none'}`)
  console.log(`✓ Course-fit event: ${cfEvent} (${cfData.field.length} players in field)`)

  // ── Pick card type ──────────────────────────────────────────────────────────

  let card: { buf: Buffer; cardData: object; label: string }

  if (!isLive) {
    // Pre-tournament week — show model picks for upcoming event
    console.log('\nNo live round → building Model Picks card for ' + cfEvent)
    card = await buildModelPicksCard(cfEvent, cfCourse, cfWeights)
  } else {
    // Live round — determine which type is most post-worthy
    const currentRound = cfData.tournament?.current_round ?? 0
    if (currentRound === 2) {
      // After/during R2 — cut alert is most timely
      console.log('\nR2 detected → building Cut Alert card')
      card = await buildCutAlertCard(activePlayers, liveEventName, [])
    } else {
      // Default: leaderboard
      console.log('\nBuilding Leaderboard card')
      card = await buildLeaderboardCard(activePlayers, liveEventName, inPlayMap)
    }
  }

  console.log(`✓ Card rendered: ${card.label} (${(card.buf.length / 1024).toFixed(0)} KB)`)

  // ── Generate captions ───────────────────────────────────────────────────────

  console.log('\nGenerating captions via Claude...')
  const captions = await generateCaptions(card.label, card.cardData)
  const igHashtags = (captions.ig.match(/#\w+/g) ?? []).length
  console.log(`✓ Tweet (${captions.tweet.length}/240): ${captions.tweet}`)
  console.log(`✓ IG (${captions.ig.length} chars, ${igHashtags} tags)`)

  // ── Send to Telegram for approval ───────────────────────────────────────────

  console.log('\nSending to Telegram...')
  await tgPhoto(card.buf, `DIVOT LAB · ${card.label}`)

  const divider = '─'.repeat(24)
  await tgMsg(
    [
      `<b>${xReady ? '🚀 LIVE POST' : '🧪 PREVIEW ONLY'} — ${card.label}</b>`,
      '',
      `<b>X (${captions.tweet.length}/240):</b>`,
      captions.tweet,
      '',
      divider,
      '',
      `<b>INSTAGRAM (${captions.ig.length} chars · ${igHashtags} hashtags):</b>`,
      captions.ig,
    ].join('\n'),
    [[
      { text: xReady ? '✓ Post to X now' : '✓ Looks good',  callback_data: 'post_approve' },
      { text: '✗ Skip',                                       callback_data: 'post_skip' },
    ]]
  )

  console.log('\nWaiting for Telegram approval (5 min timeout)...')
  const action = await tgWaitForCallback(5 * 60 * 1000)

  if (!action || action === 'post_skip') {
    console.log('✗ Skipped.')
    await tgMsg('Skipped — no post made.')
    return
  }

  // ── Post to X ──────────────────────────────────────────────────────────────

  if (xReady) {
    console.log('\nPosting to X...')
    try {
      const url = await postToX(xClient!, captions.tweet, card.buf)
      console.log('✓ Posted:', url)
      await tgMsg(`✅ Posted to X!\n${url}`)
    } catch (err) {
      const msg = (err as Error).message
      console.error('✗ X post failed:', msg)
      await tgMsg(`❌ X post failed:\n<code>${msg}</code>\n\nTweet text (copy/paste manually):\n${captions.tweet}`)
    }
  } else {
    console.log('\nX credentials not set — sending tweet text to copy/paste.')
    await tgMsg(`✅ Caption approved!\n\n<b>Post this to X manually:</b>\n${captions.tweet}\n\n<b>Instagram:</b>\n${captions.ig}`)
  }

  console.log('\n✓ Done.')
}

main().catch(async err => {
  const msg = (err as Error).message ?? String(err)
  console.error('\n✗', msg)
  // Try to send error to Telegram so we know what failed
  await tgMsg(`❌ test-post-real failed:\n<code>${msg}</code>`).catch(() => {})
  process.exit(1)
})
