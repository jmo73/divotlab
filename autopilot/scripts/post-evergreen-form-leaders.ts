/**
 * Evergreen: In-form leaderboard — who has the best SG: Total over the
 * last 12 rounds right now. Compares against L24 to show who's trending.
 * Fires any time — no active tournament needed.
 *
 * Run from /autopilot:
 *   npx tsx scripts/post-evergreen-form-leaders.ts
 */

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') })
}

import Anthropic from '@anthropic-ai/sdk'
import { getRankings, formatPlayerName } from '../lib/datagolf'
import { publish, tgNotify } from '../lib/publisher'

const SYSTEM_PROMPT = `You are the caption writer for Divot Lab, a data-driven golf analytics brand.

Rules:
1. Lead with the hottest player — their L12 SG: Total value is the headline number
2. Tone: confident, specific, understated. "The Athletic" not ESPN
3. No hype, no question hooks, no emojis, no exclamation points
4. Twitter: under 230 chars, no hashtags
5. L12 = last 12 rounds. Mention if their L12 is significantly above or below their L24 baseline
6. If the #1 form player is not the #1 overall ranked player, that's a compelling angle

Return JSON only: { "tweet": "..." }`

function fmt(v: number | undefined | null): string {
  if (v == null) return 'N/A'
  return (v >= 0 ? '+' : '') + v.toFixed(2)
}

async function generateTweet(
  top3: Array<{ name: string; l12: string; l24: string; dgRank: number; trend: string }>
): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const data = [
    `Most in-form PGA Tour players right now (SG: Total, last 12 rounds):`,
    top3.map((p, i) => `${i + 1}. ${p.name}: L12 ${p.l12}/rd · L24 ${p.l24}/rd · trend ${p.trend} · DG rank #${p.dgRank}`).join('\n'),
    `Note: L12 = last 12 PGA Tour rounds played. This is a shorter-window form indicator vs. the 24-round baseline.`,
    `If the #1 player's L12 >> L24, they are meaningfully hotter than their season average.`,
  ].join('\n')

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

  // PGA Tour only, with L12 and L24 total SG data
  const pgaWithL12 = rankings.filter(
    p =>
      (p.primary_tour ?? '').toLowerCase() === 'pga' &&
      p.sg_total != null &&
      p.sg_ott_l12 != null && p.sg_app_l12 != null &&
      p.sg_ott_l24 != null && p.sg_app_l24 != null
  )

  if (pgaWithL12.length < 20) {
    console.log('[skip] Insufficient L12/L24 ranking data — skipping')
    return
  }

  // Compute L12 and L24 SG: Total by summing category L12/L24 values
  // (DataGolf doesn't provide sg_total_l12 directly — derive from components)
  const withForm = pgaWithL12
    .map(p => {
      const l12Total = (p.sg_ott_l12 ?? 0) + (p.sg_app_l12 ?? 0) + (p.sg_arg_l12 ?? 0) + (p.sg_putt_l12 ?? 0)
      const l24Total = (p.sg_ott_l24 ?? 0) + (p.sg_app_l24 ?? 0) + (p.sg_arg_l24 ?? 0) + (p.sg_putt_l24 ?? 0)
      return { ...p, l12Total, l24Total }
    })
    .sort((a, b) => b.l12Total - a.l12Total)

  const top3 = withForm.slice(0, 3).map(p => ({
    name:   formatPlayerName(p.player_name),
    l12:    fmt(p.l12Total),
    l24:    fmt(p.l24Total),
    dgRank: p.datagolf_rank,
    trend:  p.l12Total > p.l24Total
      ? `▲ +${(p.l12Total - p.l24Total).toFixed(2)}`
      : `▼ ${(p.l12Total - p.l24Total).toFixed(2)}`,
  }))

  console.log('✓ In-form leaders:')
  top3.forEach((p, i) => console.log(`  ${i + 1}. ${p.name} — L12: ${p.l12} | L24: ${p.l24} | ${p.trend} | DG #${p.dgRank}`))

  console.log('\nGenerating tweet...')
  const tweet = await generateTweet(top3)
  console.log(`Tweet (${tweet.length}): ${tweet}`)

  const tgPreview = [
    `<b>In-Form Leaders (SG: Total, L12)</b>`,
    top3.map((p, i) => `${i + 1}. <b>${p.name}</b> — L12 ${p.l12} · L24 ${p.l24} · ${p.trend} · DG #${p.dgRank}`).join('\n'),
  ].join('\n')

  await publish({
    tweet,
    tgPreview,
    label: `Evergreen Form Leaders · ${top3[0].name}`,
  })
}

export { main as run }

if (require.main === module) {
  main().catch(async err => {
    console.error('✗', (err as Error).message)
    await tgNotify(`❌ post-evergreen-form-leaders failed:\n<code>${(err as Error).message}</code>`).catch(() => {})
    process.exit(1)
  })
}
