/**
 * Generate sample PNGs for all 9 templates with realistic dummy data.
 * Output saved to autopilot/test-output/*.png
 * Open each file and visually verify before deploying.
 *
 * Usage: npx tsx autopilot/scripts/test-image.ts
 */

import fs from 'fs/promises'
import path from 'path'
import {
  generateImage,
  leaderboardFields,
  playerStatFields,
  modelPickFields,
  cutLineFields,
  evergreenFactFields,
  quoteInsightFields,
  comparisonFields,
  courseBreakdownFields,
  weatherCardFields,
} from '../lib/imageGen'

const OUT_DIR = path.join(__dirname, '..', 'test-output')

async function run() {
  await fs.mkdir(OUT_DIR, { recursive: true })

  const samples: Array<{ name: string; templateId: string; fields: Record<string, string> }> = [
    {
      name: 'leaderboard',
      templateId: 'leaderboard',
      fields: leaderboardFields({
        eventName: 'The Masters',
        courseConditions: '18mph wind, 62°F',
        roundBadge: 'ROUND 1 COMPLETE',
        players: [
          { name: 'Scottie Scheffler', score: -8, dgRating: 172 },
          { name: 'Rory McIlroy',      score: -6, dgRating: 165 },
          { name: 'Collin Morikawa',   score: -5, dgRating: 158 },
          { name: 'Xander Schauffele', score: -4, dgRating: 155 },
          { name: 'Viktor Hovland',    score: -4, dgRating: 152 },
        ],
        insight: 'Model pick (Scheffler) leading the field',
        fieldContext: 'one of the strongest fields of the year',
      }),
    },
    {
      name: 'player-stat',
      templateId: 'player-stat',
      fields: playerStatFields({
        playerName: 'Rory McIlroy',
        contextLine: 'T5 · The Masters',
        badge: 'OVERPERFORMING',
        badgeColor: '#5BBF85',
        stats: [
          { label: 'DG RATING', value: '165' },
          { label: 'SG TOTAL', value: '+3.4' },
          { label: 'SG APPROACH', value: '+2.1' },
          { label: 'SG PUTTING', value: '+0.8' },
        ],
        insightLine1: '92nd pct in field',
        insightLine2: '18mph wind, approach premium',
      }),
    },
    {
      name: 'model-pick',
      templateId: 'model-pick',
      fields: modelPickFields({
        eventName: 'The Players Championship',
        conditionsSummary: 'calm, 74°F',
        picks: [
          { name: 'Scottie Scheffler', winPct: '18.4%', fitScore: 96, keyStrength: 'elite iron play for Sawgrass' },
          { name: 'Rory McIlroy',      winPct: '12.1%', fitScore: 89, keyStrength: 'elite approach, poa putter' },
          { name: 'Collin Morikawa',   winPct: '9.8%',  fitScore: 85, keyStrength: 'precision approach on small greens' },
        ],
        darkHorse: { name: 'Matt Fitzpatrick', reason: 'Fit score 78, course history top-10' },
      }),
    },
    {
      name: 'cut-line',
      templateId: 'cut-line',
      fields: cutLineFields({
        eventName: 'RBC Canadian Open',
        cutLine: '+1',
        players: [
          { name: 'Brooks Koepka',   score: 1, holesPlayed: 33 },
          { name: 'Tony Finau',      score: 1, holesPlayed: 34 },
          { name: 'Adam Scott',      score: 2, holesPlayed: 35 },
          { name: 'Tom Hoge',        score: 2, holesPlayed: 36 },
        ],
      }),
    },
    {
      name: 'evergreen-fact',
      templateId: 'evergreen-fact',
      fields: evergreenFactFields({
        topicBadge: 'SG: APPROACH',
        headline: 'Approach wins on tour',
        subhead: 'More than driving, more than putting',
        mainStat: '+1.8',
        unitLabel: 'SG: Approach — avg PGA Tour winner',
        supportLines: [
          'Missed cut avg: -0.4 SG: App',
          'Gap of 2.2 strokes is largest of any category',
          'via @DataGolf 2019–2025 data',
        ],
      }),
    },
    {
      name: 'quote-insight',
      templateId: 'quote-insight',
      fields: quoteInsightFields({
        badge: 'MODEL ACCOUNTABILITY',
        quoteLines: [
          'The model had Scheffler No. 1.',
          'He finished T2. Clark beat him on the greens.',
          'SG: Putting: Clark +1.53/rd vs Scheffler +0.31/rd.',
        ],
        sourceLine: 'US Open 2026 · via @DataGolf',
      }),
    },
    {
      name: 'comparison',
      templateId: 'comparison',
      fields: comparisonFields({
        eventRound: 'The Masters · R2',
        playerA: {
          name: 'Scottie Scheffler',
          score: -14,
          position: 'T1',
          sgTotal: '+4.2',
          sgApproach: '+2.8',
          dgRating: '172',
        },
        playerB: {
          name: 'Rory McIlroy',
          score: -8,
          position: 'T9',
          sgTotal: '+1.1',
          sgApproach: '+0.4',
          dgRating: '165',
        },
        comparisonAngle: 'Same DG rating tier — 6-shot gap after 36 holes',
      }),
    },
    {
      name: 'course-breakdown',
      templateId: 'course-breakdown',
      fields: courseBreakdownFields({
        courseName: 'Augusta National',
        courseMeta: 'Par 72 · 7,510 yds · Major',
        rewardsLabel: 'Approach (32%) + Short game (25%)',
        histScoring: '-10.2 avg vs par (2019–2025)',
        fieldAvg: '+0.4 today in 18mph wind',
        keyStat: 'SG: App explains 58% of scoring variance',
        insightLine1: 'Slope greens demand elite wedge distance control',
        insightLine2: 'Wind from NW makes 11–13 stretch more brutal',
        historicalHook: 'No player has won Augusta without gaining SG: App',
      }),
    },
    {
      name: 'weather-card',
      templateId: 'weather-card',
      fields: weatherCardFields({
        eventName: 'The Open Championship',
        roundDate: '2026-07-17',
        windSpeed: '28',
        windDirection: 'SW',
        tempPrecip: '58°F · 30% precip',
        conditionsFlag: 'DIFFICULT',
        conditionsFlagColor: '#C9A84C',
        scoringImpact: 'Field scoring avg typically rises 2–3 shots',
        historicalContext: 'Course avg +2.1 vs par (links scoring)',
      }),
    },
  ]

  for (const sample of samples) {
    console.log(`Generating ${sample.name}...`)
    const buf = await generateImage(sample.templateId as never, sample.fields)
    const outPath = path.join(OUT_DIR, `${sample.name}.png`)
    await fs.writeFile(outPath, buf)
    console.log(`  ✓ ${outPath} (${(buf.length / 1024).toFixed(0)} KB)`)
  }

  console.log('\nAll templates generated. Open autopilot/test-output/ to review.')
  console.log('Visual checklist:')
  console.log('  [ ] Logo visible and correct')
  console.log('  [ ] Fonts rendered (not system fallback)')
  console.log('  [ ] Colors match design tokens')
  console.log('  [ ] No {{TOKEN}} visible anywhere')
  console.log('  [ ] Numbers in JetBrains Mono')
  console.log('  [ ] Footer line visible')
  console.log('  [ ] Under 1MB each')
}

run().catch(err => { console.error(err); process.exit(1) })
