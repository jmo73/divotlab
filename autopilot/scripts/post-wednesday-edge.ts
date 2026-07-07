/**
 * Wednesday betting edge alert — finds the top-10 market bet with the largest
 * positive expected value based on the DataGolf model vs sportsbook lines.
 * Posts one tweet highlighting the single clearest edge play this week.
 *
 * Run from /autopilot:
 *   npx tsx scripts/post-wednesday-edge.ts
 */

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') })
}

import Anthropic from '@anthropic-ai/sdk'
import {
  getCourseFit,
  getPreTournamentPredictions,
  getOutrightOdds,
  formatPlayerName,
} from '../lib/datagolf'
import { publish, tgNotify } from '../lib/publisher'

const SYSTEM_PROMPT = `You are the caption writer for Divot Lab, a data-driven golf analytics brand.

Rules:
1. Lead with the model vs market discrepancy — the EV gap is the news
2. Tone: confident, specific, understated. "The Athletic" not ESPN
3. No hype, no question hooks, no emojis, no exclamation points
4. Twitter: under 230 chars, no hashtags
5. Mention the specific odds, the model probability, and the edge percentage
6. Never say "lock", "guaranteed", or make absolute predictions

Return JSON only: { "tweet": "..." }`

function americanToProb(odds: string | null | undefined): number | null {
  if (!odds) return null
  const n = parseInt(odds)
  if (isNaN(n) || n === 0) return null
  if (n > 0) return 100 / (n + 100)
  return Math.abs(n) / (Math.abs(n) + 100)
}

async function generateTweet(
  eventName: string,
  play: {
    name:     string
    mktOdds:  string
    book:     string
    mktPct:   string
    modelPct: string
    edgePct:  string
    fitScore: number | null
  }
): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const data = [
    `Event: ${eventName}`,
    `Player: ${play.name} — Top 10 finish`,
    `${play.book} odds: ${play.mktOdds} (${play.mktPct}% market-implied probability)`,
    `DG model top-10 probability: ${play.modelPct}%`,
    `Model edge vs market: +${play.edgePct}%`,
    play.fitScore ? `Course fit: ${play.fitScore}/100` : '',
    `Angle: The model sees a meaningfully higher probability than the market prices in. Present the numbers clearly.`,
  ].filter(Boolean).join('\n')

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: data }],
  })

  const raw   = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON from Claude')
  return (JSON.parse(match[0]) as { tweet?: string }).tweet ?? ''
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Missing ANTHROPIC_API_KEY')

  console.log('Fetching data...')
  const [preTour, top10Odds, cfData] = await Promise.all([
    getPreTournamentPredictions('baseline_history_fit'),
    getOutrightOdds('top_10'),
    getCourseFit(),
  ])

  if (cfData.field.length < 50) {
    console.log('[skip] No active tournament field — skipping this run')
    return
  }
  if (top10Odds.length < 30) {
    console.log('[skip] No betting lines available yet — skipping')
    return
  }

  const eventName = cfData.tournament?.event_name ?? 'This Week'
  console.log(`✓ Event: ${eventName} (${cfData.field.length} players, ${top10Odds.length} with odds)`)

  const oddsMap = new Map(top10Odds.map(o => [o.dg_id, o]))
  const fitMap  = new Map(cfData.field.map(f => [f.dg_id, f]))

  // For each player, compute model edge vs market for top-10 market
  const candidates = preTour
    .map(p => {
      const o = oddsMap.get(p.dg_id)
      if (!o) return null

      // Pick best available book (DraftKings preferred)
      const bookPriority = ['draftkings', 'fanduel', 'bet365', 'caesars', 'betmgm'] as const
      let mktOdds: string | null = null
      let book = ''
      for (const b of bookPriority) {
        const v = o[b]
        if (v && typeof v === 'string') { mktOdds = v; book = b; break }
      }
      if (!mktOdds) return null

      const mktProb  = americanToProb(mktOdds)
      if (!mktProb) return null

      const modelProb = p.top_10
      // Edge = how much better the model thinks this play is vs the market price
      const edgePct = (modelProb - mktProb) / mktProb * 100

      if (edgePct <= 5) return null  // only surface meaningful edges (> 5%)

      const cf = fitMap.get(p.dg_id)

      return {
        name:     formatPlayerName(p.player_name),
        mktOdds:  mktOdds.startsWith('-') ? mktOdds : '+' + mktOdds,
        book:     book.charAt(0).toUpperCase() + book.slice(1),
        mktPct:   (mktProb * 100).toFixed(1),
        modelPct: (modelProb * 100).toFixed(1),
        edgePct:  edgePct.toFixed(1),
        fitScore: cf ? Math.round(cf.fitScore) : null,
        modelProb,
        edgeAbs:  edgePct,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    // Filter for accessible odds — not extreme longshots (market implies > 5%)
    .filter(c => parseFloat(c.mktPct) >= 5)
    .sort((a, b) => b.edgeAbs - a.edgeAbs)

  if (!candidates.length) {
    console.log('[skip] No significant positive-edge top-10 plays found — skipping')
    return
  }

  const play = candidates[0]
  console.log(`✓ Top edge play: ${play.name}`)
  console.log(`  ${play.book}: ${play.mktOdds} (${play.mktPct}% implied) | Model: ${play.modelPct}% top-10 | Edge: +${play.edgePct}%`)
  if (play.fitScore) console.log(`  Course fit: ${play.fitScore}/100`)
  if (candidates.length > 1) {
    console.log(`  Runner-up: ${candidates[1].name} — ${candidates[1].mktOdds} (${candidates[1].edgePct}% edge)`)
  }

  console.log('\nGenerating tweet...')
  const tweet = await generateTweet(eventName, play)
  console.log(`Tweet (${tweet.length}): ${tweet}`)

  const tgPreview = [
    `<b>${eventName}</b> — Top-10 Edge Play`,
    `Player: <b>${play.name}</b>`,
    `${play.book}: ${play.mktOdds} · Market-implied: ${play.mktPct}%`,
    `DG model top-10 prob: ${play.modelPct}%`,
    `Edge: <b>+${play.edgePct}%</b>`,
    play.fitScore ? `Course fit: ${play.fitScore}/100` : '',
    candidates.length > 1 ? `\nRunner-up: ${candidates[1].name} — ${candidates[1].mktOdds} (+${candidates[1].edgePct}% edge)` : '',
  ].filter(Boolean).join('\n')

  await publish({
    tweet,
    tgPreview,
    label: `Wednesday Edge · ${play.name} · ${eventName}`,
  })
}

export { main as run }

if (require.main === module) {
  main().catch(async err => {
    console.error('✗', (err as Error).message)
    await tgNotify(`❌ post-wednesday-edge failed:\n<code>${(err as Error).message}</code>`).catch(() => {})
    process.exit(1)
  })
}
