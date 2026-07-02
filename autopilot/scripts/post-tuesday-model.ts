/**
 * Tuesday model preview — two text-only tweets before the tournament.
 * Tweet 1: Top 3 win probabilities with course fit comparison.
 * Tweet 2: The single most compelling course-fit insight for the week.
 *
 * Run from /autopilot:
 *   npx tsx scripts/post-tuesday-model.ts
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') })

import Anthropic from '@anthropic-ai/sdk'
import { getCourseFit, getModelPickCandidates } from '../lib/datagolf'
import { publish, tgNotify } from '../lib/publisher'

const SYSTEM_PROMPT = `You are the caption writer for Divot Lab, a data-driven golf analytics brand.

Rules:
1. Lead with the most surprising or data-rich observation — not the tournament name
2. Every claim must be backed by a number from the data
3. Tone: confident, specific, understated. "The Athletic" not "ESPN Bottom Line"
4. Never use hype, question hooks, emojis, exclamation points, or vague claims
5. Twitter: 1–2 sentences MAX, under 220 chars, no hashtags (leave room for a link)
6. These are pre-tournament model previews — reference probabilities and fit scores specifically

Return JSON only: { "tweet_model": "...", "tweet_fit": "..." }
tweet_model = about the win probability gap between top picks
tweet_fit = about the course-fit insight (which skill dominates and why it matters)`

async function generateTweets(
  eventName: string,
  course: string,
  weights: { ott: number; app: number; arg: number; putt: number },
  top3: Array<{ name: string; winPct: string; fitScore: string; dominantStatLabel: string; dominantStatVal: string }>,
  fieldSize: number
): Promise<{ tweetModel: string; tweetFit: string }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const wPct = (v: number) => Math.round(v * 100) + '%'
  const data = [
    `Event: ${eventName} at ${course}`,
    `Field size: ${fieldSize}`,
    `Course-fit weights: Approach ${wPct(weights.app)} | Putting ${wPct(weights.putt)} | Off-Tee ${wPct(weights.ott)} | Around-Green ${wPct(weights.arg)}`,
    `Top 3 model picks (win probability × course fit):`,
    top3.map((p, i) => `${i+1}. ${p.name}: ${p.winPct} win prob, fit ${p.fitScore}/100, leading ${p.dominantStatLabel} at ${p.dominantStatVal}/rd`).join('\n'),
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
  const parsed = JSON.parse(match[0]) as { tweet_model?: string; tweet_fit?: string }
  return {
    tweetModel: parsed.tweet_model ?? '',
    tweetFit:   parsed.tweet_fit ?? '',
  }
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Missing ANTHROPIC_API_KEY')

  console.log('Fetching data...')
  const [cfData, candidates] = await Promise.all([getCourseFit(), getModelPickCandidates()])

  const eventName  = cfData.tournament?.event_name ?? 'This Week'
  const course     = cfData.tournament?.course ?? ''
  const weights    = cfData.course_weights
  const fieldSize  = cfData.tournament?.field_size ?? 0

  console.log(`✓ Event: ${eventName} at ${course}`)
  console.log(`✓ Weights: App ${Math.round(weights.app*100)}% | Putt ${Math.round(weights.putt*100)}% | OTT ${Math.round(weights.ott*100)}% | ARG ${Math.round(weights.arg*100)}%`)

  // Dominant stat across the whole model
  type StatKey = 'sgApp' | 'sgPutt' | 'sgOtt' | 'sgArg'
  const statKeys: StatKey[] = ['sgApp', 'sgPutt', 'sgOtt', 'sgArg']
  const weightMap: Record<StatKey, number> = { sgApp: weights.app, sgPutt: weights.putt, sgOtt: weights.ott, sgArg: weights.arg }
  const labelMap: Record<StatKey, string>  = { sgApp: 'SG: Approach', sgPutt: 'SG: Putting', sgOtt: 'SG: Off-Tee', sgArg: 'SG: Around-Green' }
  const dominantStatKey = [...statKeys].sort((a, b) => weightMap[b] - weightMap[a])[0]
  const dominantLabel   = labelMap[dominantStatKey]

  // Top 3 candidates by combined model rank
  const top3 = candidates.slice(0, 3).map(p => {
    const val = p[dominantStatKey] ?? 0
    return {
      name:              p.playerName,
      winPct:            (p.winPct * 100).toFixed(1) + '%',
      fitScore:          String(Math.round(p.fitScore)),
      dominantStatLabel: dominantLabel,
      dominantStatVal:   val >= 0 ? '+' + val.toFixed(2) : val.toFixed(2),
    }
  })

  top3.forEach((p, i) => console.log(`  ${i+1}. ${p.name} — win: ${p.winPct} | fit: ${p.fitScore} | ${dominantLabel}: ${p.dominantStatVal}`))

  console.log('\nGenerating tweets...')
  const { tweetModel, tweetFit } = await generateTweets(eventName, course, weights, top3, fieldSize)
  console.log(`Tweet 1 model (${tweetModel.length}): ${tweetModel}`)
  console.log(`Tweet 2 fit   (${tweetFit.length}):   ${tweetFit}`)

  const tgPreview = [
    `<b>${eventName}</b>  ·  ${course}`,
    `Weights: App ${Math.round(weights.app*100)}% | Putt ${Math.round(weights.putt*100)}% | OTT ${Math.round(weights.ott*100)}% | ARG ${Math.round(weights.arg*100)}%`,
    top3.map((p, i) => `${i+1}. ${p.name} — ${p.winPct} win · fit ${p.fitScore} · ${dominantLabel} ${p.dominantStatVal}`).join('\n'),
  ].join('\n')

  // Post tweet 1: model probabilities
  console.log('\n── Tweet 1: Model probabilities')
  await publish({
    tweet:     tweetModel,
    tgPreview: tgPreview + '\n\n<i>Tweet 1 of 2 — model probs</i>',
    label:     `Tuesday Model Preview 1/2 · ${eventName}`,
  })

  // Post tweet 2: course-fit insight (separate Telegram approval)
  console.log('\n── Tweet 2: Course-fit insight')
  await publish({
    tweet:     tweetFit,
    tgPreview: tgPreview + '\n\n<i>Tweet 2 of 2 — course fit insight</i>',
    label:     `Tuesday Model Preview 2/2 · ${eventName}`,
  })
}

export { main as run }

if (require.main === module) {
  main().catch(async err => {
    console.error('✗', (err as Error).message)
    await tgNotify(`❌ post-tuesday-model failed:\n<code>${(err as Error).message}</code>`).catch(() => {})
    process.exit(1)
  })
}
