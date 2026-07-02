/**
 * Wednesday top-10 targets — model's highest-probability top-10 finishers
 * adjusted for course fit. Posts a model-pick.svg graphic card to X + IG,
 * with a separate tweet for text-only fallback.
 *
 * Run from /autopilot:
 *   npx tsx scripts/post-wednesday-top10.ts
 */

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') })
}

import Anthropic from '@anthropic-ai/sdk'
import { getPreTournamentPredictions, getCourseFit, formatPlayerName } from '../lib/datagolf'
import { generateImage, modelPickFields } from '../lib/imageGen'
import { publish, tgNotify } from '../lib/publisher'

const SYSTEM_PROMPT = `You are the caption writer for Divot Lab, a data-driven golf analytics brand.

Rules:
1. Lead with the probabilities — they are the news
2. Tone: confident, specific, understated. Think "The Athletic", not ESPN
3. No hype, no question hooks, no emojis, no exclamation points
4. Twitter: under 230 chars, no hashtags, no link (leave room for one)
5. These are top-10 finish probability leaders — reference the percentages and course fit scores
6. Instagram: 3–4 sentences with more detail on 2–3 players + dark horse mention; end with exactly 3 hashtags: #GolfBetting #DataGolf #LabPicks
7. Instagram should feel like a brief analytical note, not a caption

Return JSON only: { "tweet": "...", "ig_caption": "..." }`

type StatKey = 'sg_ott' | 'sg_app' | 'sg_arg' | 'sg_putt'

async function generateContent(
  eventName: string,
  course: string,
  targets: Array<{ name: string; top10Pct: string; fitScore: string }>,
  darkHorseName: string,
): Promise<{ tweet: string; igCaption: string }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const data = [
    `Event: ${eventName} at ${course}`,
    `Model's top 10 targets this week (by top-10 probability × course fit):`,
    targets.map((p, i) => `${i + 1}. ${p.name}: ${p.top10Pct} top-10 prob, ${p.fitScore}/100 course fit`).join('\n'),
    `Dark horse: ${darkHorseName} — high course fit but lower win probability rank`,
  ].join('\n')

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: data }],
  })

  const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON from Claude')
  const parsed = JSON.parse(match[0]) as { tweet?: string; ig_caption?: string }
  if (!parsed.tweet) throw new Error('Claude returned empty tweet')
  if (!parsed.ig_caption) throw new Error('Claude returned empty ig_caption')
  return { tweet: parsed.tweet, igCaption: parsed.ig_caption }
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Missing ANTHROPIC_API_KEY')

  console.log('Fetching data...')
  const [preds, cfData] = await Promise.all([
    getPreTournamentPredictions('baseline_history_fit'),
    getCourseFit(),
  ])

  const eventName = cfData.tournament?.event_name ?? 'This Week'
  const course    = cfData.tournament?.course ?? ''
  const weights   = cfData.course_weights

  // Map dg_id → full CourseFitPlayer (has rank, fitScore, sg values)
  const fitPlayerMap = new Map(cfData.field.map(p => [p.dg_id, p]))

  // Determine the dominant course stat — used for keyStrength labels and conditionsSummary
  const statKeys: StatKey[] = ['sg_ott', 'sg_app', 'sg_arg', 'sg_putt']
  const weightMap: Record<StatKey, number> = {
    sg_ott: weights.ott, sg_app: weights.app, sg_arg: weights.arg, sg_putt: weights.putt,
  }
  const labelMap: Record<StatKey, string> = {
    sg_ott: 'OTT', sg_app: 'App', sg_arg: 'ARG', sg_putt: 'Putt',
  }
  const dominantKey   = [...statKeys].sort((a, b) => weightMap[b] - weightMap[a])[0]
  const dominantLabel = labelMap[dominantKey]
  const dominantPct   = Math.round(weightMap[dominantKey] * 100)

  // Build ranked candidates, preserving dg_id and fit rank for dark horse selection
  // preds is sorted by win probability descending — filter preserves that order
  const rankedCandidates = preds
    .filter(p => fitPlayerMap.has(p.dg_id))
    .map((p, winIdx) => {
      const fp = fitPlayerMap.get(p.dg_id)!

      // Dominant stat value for this player, using a lookup object to stay type-safe
      const sgValMap: Record<StatKey, number | undefined> = {
        sg_ott: fp.sg_ott, sg_app: fp.sg_app, sg_arg: fp.sg_arg, sg_putt: fp.sg_putt,
      }
      const sgVal = sgValMap[dominantKey]
      const sgStr = sgVal != null ? (sgVal >= 0 ? '+' : '') + sgVal.toFixed(2) : ''

      // Key strength line shown below the player name on the card
      const keyStrength = sgStr
        ? `Fit #${fp.rank} · SG: ${dominantLabel} ${sgStr}`
        : `Fit #${fp.rank} · Top-10: ${(p.top_10 * 100).toFixed(1)}%`

      return {
        dg_id:        p.dg_id,
        name:         formatPlayerName(p.player_name),
        top10:        p.top_10,
        fit:          fp.fitScore,
        fitRank:      fp.rank,
        winRank:      winIdx + 1,  // within the field (preds filtered to field, order preserved)
        combined:     p.top_10 * fp.fitScore / 100,
        keyStrength,
      }
    })
    .sort((a, b) => b.combined - a.combined)

  // Top 3 by combined score
  const topThree    = rankedCandidates.slice(0, 3)
  const topThreeIds = new Set(topThree.map(p => p.dg_id))

  // Dark horse: high fit rank (top 15 by fit) but lower win probability rank (outside top 8)
  // Sort by the biggest gap between win rank and fit rank — the most "overlooked" fit pick
  const darkHorse = (
    rankedCandidates
      .filter(p => !topThreeIds.has(p.dg_id) && p.fitRank <= 15 && p.winRank > 8)
      .sort((a, b) => (b.winRank - b.fitRank) - (a.winRank - a.fitRank))[0]
    ??
    rankedCandidates
      .filter(p => !topThreeIds.has(p.dg_id) && p.fitRank <= 20 && p.winRank > 5)
      .sort((a, b) => (b.winRank - b.fitRank) - (a.winRank - a.fitRank))[0]
    ??
    rankedCandidates.find(p => !topThreeIds.has(p.dg_id))!
  )

  console.log(`✓ Event: ${eventName} at ${course}`)
  console.log(`✓ Dominant stat: SG: ${dominantLabel} (${dominantPct}%)`)
  topThree.forEach((p, i) =>
    console.log(`  ${i + 1}. ${p.name} — top10 ${(p.top10 * 100).toFixed(1)}% | fit ${Math.round(p.fit)}/100 | ${p.keyStrength}`)
  )
  console.log(`  Dark horse: ${darkHorse.name} — fit #${darkHorse.fitRank} | win rank #${darkHorse.winRank}`)

  // Format for display and for Claude
  const targets = topThree.map(p => ({
    name:     p.name,
    top10Pct: (p.top10 * 100).toFixed(1) + '%',
    fitScore: String(Math.round(p.fit)),
  }))

  console.log('\nGenerating tweet + IG caption...')
  const { tweet, igCaption } = await generateContent(eventName, course, targets, darkHorse.name)
  console.log(`Tweet (${tweet.length} chars): ${tweet}`)
  console.log(`IG (${igCaption.length} chars): ${igCaption.slice(0, 100)}...`)

  // Generate model-pick.svg card
  console.log('\nGenerating image...')
  const conditionsSummary = `${course} · SG: ${dominantLabel} ${dominantPct}% dominant`

  const pngBuf = await generateImage('model-pick', modelPickFields({
    eventName,
    conditionsSummary,
    picks: topThree.map(p => ({
      name:        p.name,
      winPct:      (p.top10 * 100).toFixed(1) + '%',
      fitScore:    Math.round(p.fit),
      keyStrength: p.keyStrength,
    })),
    darkHorse: {
      name:   darkHorse.name,
      reason: `Fit #${darkHorse.fitRank} · Win rank #${darkHorse.winRank}`,
    },
  }))
  console.log(`✓ Image generated (${(pngBuf.length / 1024).toFixed(0)} KB)`)

  const tgPreview = [
    `<b>${eventName}</b> — Top 10 Targets`,
    targets.map((p, i) => `${i + 1}. ${p.name} · ${p.top10Pct} top-10 · fit ${p.fitScore}/100`).join('\n'),
    `Dark horse: <b>${darkHorse.name}</b> (fit #${darkHorse.fitRank} · win rank #${darkHorse.winRank})`,
  ].join('\n')

  await publish({
    pngBuf,
    tweet,
    igCaption,
    tgPreview,
    label: `Wednesday Top 10 Targets · ${eventName}`,
  })
}

export { main as run }

if (require.main === module) {
  main().catch(async err => {
    console.error('✗', (err as Error).message)
    await tgNotify(`❌ post-wednesday-top10 failed:\n<code>${(err as Error).message}</code>`).catch(() => {})
    process.exit(1)
  })
}
