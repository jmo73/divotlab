/**
 * Evergreen: DG vs OWGR divergence — finds the player the DataGolf model
 * rates most differently (higher) than the Official World Golf Ranking.
 * Always fresh because rankings change week to week.
 * Fires any time — no active tournament needed.
 *
 * Run from /autopilot:
 *   npx tsx scripts/post-evergreen-rankings.ts
 */

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') })
}

import Anthropic from '@anthropic-ai/sdk'
import { getRankings, formatPlayerName } from '../lib/datagolf'
import { publish, tgNotify } from '../lib/publisher'

const SYSTEM_PROMPT = `You are the caption writer for Divot Lab, a data-driven golf analytics brand.

Rules:
1. Lead with the ranking gap — the specific numbers (DG rank vs OWGR rank)
2. Tone: confident, specific, understated. "The Athletic" not ESPN
3. No hype, no question hooks, no emojis, no exclamation points
4. Twitter: under 230 chars, no hashtags
5. Briefly explain why the two systems diverge — DG uses SG data, OWGR uses results
6. Present as an observation, not a prediction

Return JSON only: { "tweet": "..." }`

async function generateTweet(
  underrated: { name: string; dgRank: number; owgrRank: number; gap: number; sgTotal: string },
  overrated:  { name: string; dgRank: number; owgrRank: number; gap: number } | null
): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const data = [
    `Most underrated by OWGR vs DataGolf model:`,
    `${underrated.name}: DG rank #${underrated.dgRank}, OWGR #${underrated.owgrRank} — model rates them ${underrated.gap} spots higher`,
    `Their SG: Total over last 24 rounds: ${underrated.sgTotal}/rd`,
    overrated
      ? `Most overrated (OWGR ranks much higher than DG): ${overrated.name}: OWGR #${overrated.owgrRank}, DG #${overrated.dgRank} — world ranks them ${overrated.gap} spots higher than the model does`
      : '',
    `Context: DataGolf rankings are based on recent strokes-gained data. OWGR is based on finishing positions and field strength. The gap often reflects a player excelling in the stats but not converting them into top-finishes yet — or vice versa.`,
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

  console.log('Fetching rankings...')
  const rankings = await getRankings()

  // Focus on PGA Tour players with both rankings available
  const pgaWithBoth = rankings.filter(
    p =>
      (p.primary_tour ?? '').toLowerCase() === 'pga' &&
      p.datagolf_rank != null &&
      p.owgr_rank != null &&
      p.owgr_rank <= 300  // ignore very obscure players
  )

  if (pgaWithBoth.length < 20) {
    console.log('[skip] Insufficient ranking data — skipping')
    return
  }

  // Underrated: DG ranks much higher (lower number) than OWGR — DG gap = owgr - dg (positive = underrated by world)
  const underratedList = pgaWithBoth
    .map(p => ({
      name:    formatPlayerName(p.player_name),
      dgRank:  p.datagolf_rank,
      owgrRank: p.owgr_rank!,
      gap:     p.owgr_rank! - p.datagolf_rank,
      sgTotal: p.sg_total != null ? ((p.sg_total >= 0 ? '+' : '') + p.sg_total.toFixed(2)) : 'N/A',
    }))
    .filter(p => p.gap > 10 && p.dgRank <= 80)  // only players the model rates in the real top 80
    .sort((a, b) => b.gap - a.gap)

  // Overrated: OWGR much higher than DG
  const overratedList = pgaWithBoth
    .map(p => ({
      name:    formatPlayerName(p.player_name),
      dgRank:  p.datagolf_rank,
      owgrRank: p.owgr_rank!,
      gap:     p.datagolf_rank - p.owgr_rank!,
    }))
    .filter(p => p.gap > 15 && p.owgrRank <= 50)  // only players OWGR rates in top 50
    .sort((a, b) => b.gap - a.gap)

  if (!underratedList.length) {
    console.log('[skip] No significant divergence found — skipping')
    return
  }

  const underrated = underratedList[0]
  const overrated  = overratedList[0] ?? null

  console.log(`✓ Most underrated: ${underrated.name} — DG #${underrated.dgRank} vs OWGR #${underrated.owgrRank} (gap: +${underrated.gap})`)
  if (overrated) console.log(`  Most overrated: ${overrated.name} — OWGR #${overrated.owgrRank} vs DG #${overrated.dgRank} (gap: +${overrated.gap})`)

  console.log('\nGenerating tweet...')
  const tweet = await generateTweet(underrated, overrated)
  console.log(`Tweet (${tweet.length}): ${tweet}`)

  const tgPreview = [
    `<b>DG vs OWGR Rankings Divergence</b>`,
    `Underrated by OWGR: <b>${underrated.name}</b>`,
    `DG rank #${underrated.dgRank} · OWGR #${underrated.owgrRank} · gap: +${underrated.gap} spots`,
    `SG: Total: ${underrated.sgTotal}/rd`,
    overrated ? `\nOverrated by OWGR: <b>${overrated.name}</b>\nOWGR #${overrated.owgrRank} · DG #${overrated.dgRank} · gap: +${overrated.gap} spots` : '',
  ].filter(Boolean).join('\n')

  await publish({
    tweet,
    tgPreview,
    label: `Evergreen Rankings · ${underrated.name}`,
  })
}

export { main as run }

if (require.main === module) {
  main().catch(async err => {
    console.error('���', (err as Error).message)
    await tgNotify(`❌ post-evergreen-rankings failed:\n<code>${(err as Error).message}</code>`).catch(() => {})
    process.exit(1)
  })
}
