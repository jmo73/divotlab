/**
 * Monday field preview — announces the week's top model picks.
 * Two tweets: #1 pick spotlight, then top-3 summary.
 * Pure API, fully auto-schedulable.
 *
 * Run from /autopilot:
 *   npx tsx scripts/post-monday-field.ts
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') })

import Anthropic from '@anthropic-ai/sdk'
import { getModelPickCandidates, getCourseFit } from '../lib/datagolf'
import { publish, tgNotify } from '../lib/publisher'

const SYSTEM_PROMPT = `You are the caption writer for Divot Lab, a data-driven golf analytics brand.

Rules:
1. Lead with the most specific number — win probability, fit score, the gap
2. Tone: confident, specific, understated. "The Athletic" not "ESPN Bottom Line"
3. Never use hype, question hooks, emojis, exclamation points, or vague claims
4. Twitter: under 220 chars, no hashtags
5. These are pre-tournament model previews — reference probabilities and fit scores

Return JSON only: { "tweet_pick": "...", "tweet_summary": "..." }
tweet_pick = spotlight on #1 model pick (win prob + fit + 1 key stat)
tweet_summary = condensed top-3 list with win% and fit scores`

async function generateTweets(
  eventName: string,
  top3: Array<{ name: string; winPct: string; fitScore: string; dominantStat: string; dominantVal: string }>
): Promise<{ tweetPick: string; tweetSummary: string }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const data = [
    `Event: ${eventName}`,
    `#1 model pick: ${top3[0].name} — ${top3[0].winPct} win probability, ${top3[0].fitScore}/100 course fit, ${top3[0].dominantStat} ${top3[0].dominantVal}/rd`,
    `#2: ${top3[1].name} — ${top3[1].winPct} win, ${top3[1].fitScore}/100 fit`,
    `#3: ${top3[2].name} — ${top3[2].winPct} win, ${top3[2].fitScore}/100 fit`,
  ].join('\n')

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: data }],
  })

  const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON from Claude')
  const parsed = JSON.parse(match[0]) as { tweet_pick?: string; tweet_summary?: string }
  return {
    tweetPick:    parsed.tweet_pick ?? '',
    tweetSummary: parsed.tweet_summary ?? '',
  }
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Missing ANTHROPIC_API_KEY')

  console.log('Fetching data...')
  const [candidates, cfData] = await Promise.all([getModelPickCandidates(), getCourseFit()])

  const eventName = cfData.tournament?.event_name ?? 'This Week'
  const weights   = cfData.course_weights

  type StatKey = 'sgApp' | 'sgPutt' | 'sgOtt' | 'sgArg'
  const statKeys: StatKey[] = ['sgApp', 'sgPutt', 'sgOtt', 'sgArg']
  const weightMap: Record<StatKey, number> = { sgApp: weights.app, sgPutt: weights.putt, sgOtt: weights.ott, sgArg: weights.arg }
  const labelMap:  Record<StatKey, string>  = { sgApp: 'SG: App', sgPutt: 'SG: Putt', sgOtt: 'SG: OTT', sgArg: 'SG: ARG' }
  const dominantKey = [...statKeys].sort((a, b) => weightMap[b] - weightMap[a])[0]

  const top3 = candidates.slice(0, 3).map(p => ({
    name:         p.playerName,
    winPct:       (p.winPct * 100).toFixed(1) + '%',
    fitScore:     String(Math.round(p.fitScore)),
    dominantStat: labelMap[dominantKey],
    dominantVal:  p[dominantKey] != null ? (p[dominantKey]! >= 0 ? '+' : '') + p[dominantKey]!.toFixed(2) : 'N/A',
  }))

  console.log(`✓ Event: ${eventName}`)
  top3.forEach((p, i) => console.log(`  ${i+1}. ${p.name} — win ${p.winPct} | fit ${p.fitScore} | ${p.dominantStat} ${p.dominantVal}`))

  console.log('\nGenerating tweets...')
  const { tweetPick, tweetSummary } = await generateTweets(eventName, top3)
  console.log(`Tweet 1 (${tweetPick.length}): ${tweetPick}`)
  console.log(`Tweet 2 (${tweetSummary.length}): ${tweetSummary}`)

  const tgPreview = [
    `<b>${eventName}</b> — Monday Field Preview`,
    top3.map((p, i) => `${i+1}. ${p.name} · win ${p.winPct} · fit ${p.fitScore}/100`).join('\n'),
  ].join('\n')

  await publish({
    tweet:     tweetPick,
    tgPreview: tgPreview + '\n\n<i>Tweet 1 of 2 — #1 pick spotlight</i>',
    label:     `Monday Field Preview 1/2 · ${eventName}`,
  })

  await publish({
    tweet:     tweetSummary,
    tgPreview: tgPreview + '\n\n<i>Tweet 2 of 2 — top 3 summary</i>',
    label:     `Monday Field Preview 2/2 · ${eventName}`,
  })
}

export { main as run }

if (require.main === module) {
  main().catch(async err => {
    console.error('✗', (err as Error).message)
    await tgNotify(`❌ post-monday-field failed:\n<code>${(err as Error).message}</code>`).catch(() => {})
    process.exit(1)
  })
}
