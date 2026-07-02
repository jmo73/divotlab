/**
 * Send a test approval message to Telegram.
 * Uses a real queue entry with sample data.
 *
 * Usage: npx tsx autopilot/scripts/test-telegram.ts
 *
 * Steps to test:
 *   1. Run this script — approval message appears in Telegram
 *   2. Tap "✓ Approve" — expect "Posting now..." (posting will fail at this stage, expected)
 *   3. Tap "✎ Edit Both" — expect edit prompt
 *   4. Type "Make it shorter" — expect regenerated preview
 *   5. Tap "✗ Skip" — expect "Skipped." message
 */

import { createQueuedPost, updateQueueStatus } from '../lib/db'
import { sendApprovalMessage } from '../lib/telegram'
import { generateImage, leaderboardFields } from '../lib/imageGen'
import { validateEnv } from '../lib/config'
import type { PostContext } from '../lib/enrichment'

async function run() {
  validateEnv()

  // Sample context
  const context: PostContext = {
    tournament: {
      name: 'The Masters',
      course: 'Augusta National',
      tier: 'major',
      historicalScoringAvg: -10.2,
      fieldStrengthRank: 1,
      isFirstRound: true,
    },
    weather: {
      windSpeedMph: 18,
      windDirection: 'NW',
      conditionsFlag: 'moderate',
      tempF: 62,
      precipChance: 5,
      conditionsSummary: '18mph NW wind, 62°F',
      lat: 33.5032,
      lng: -82.0199,
    },
    field: {
      avgDgRating: 148,
      topRatedInField: 'Scottie Scheffler',
      fieldStrengthLabel: 'one of the strongest fields of the year',
    },
    insightFlags: {
      playerOverperforming: false,
      playerUnderperforming: false,
      conditionsAdvantage: true,
      courseSpecialist: false,
      modelAligned: true,
      modelSurprise: false,
      fieldBeatingCourse: false,
    },
  }

  const captionX = 'Scheffler leads Augusta at -8 after R1. Highest DG rating in the field at 172. Field avg score today: +1.2 in 18mph wind — conditions making it harder than it looks. The model had him No. 1. via @DataGolf divotlab.com #PGATour #TheMasters'
  const captionIG = 'R1 recap — The Masters\n\nScheffler leads Augusta at -8 after Round 1. His DataGolf rating of 172 was the highest in the field coming in.\n\nWhat makes it notable: the field averaged +1.2 today in 18mph wind. Scheffler is 9.2 shots clear of the field average. The model had him at No. 1 — this is exactly where the numbers said he should be.\n\nFull breakdown at the link in bio.\n\nvia @DataGolf\n#PGATour #TheMasters #GolfAnalytics #DivotLab #SGTotal #DataDrivenGolf #Masters2026'

  // Generate image
  console.log('Generating image...')
  const fields = leaderboardFields({
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
  })
  const imageBuffer = await generateImage('leaderboard', fields)
  console.log(`  ✓ Image: ${(imageBuffer.length / 1024).toFixed(0)} KB`)

  // Create queue entry
  const { put } = await import('@vercel/blob')
  const { config } = await import('../lib/config')
  const { url: blobUrl } = await put('posts/test-telegram.png', imageBuffer, { access: 'public', token: config.blob.token })

  const post = await createQueuedPost({
    triggerType: 'live_leaderboard_r1_end',
    triggerLabel: 'R1 Leaderboard · The Masters',
    eventName: 'The Masters',
    eventTier: 'major',
    graphicType: 'leaderboard',
    captionX,
    captionIG,
    imageBlobUrl: blobUrl,
    imageBlobKey: 'posts/test-telegram.png',
    rawData: { test: true },
    context: context,
    weatherContext: context.weather ?? null,
  })

  console.log(`Queue ID: ${post.id}`)

  // Send to Telegram
  console.log('Sending approval message to Telegram...')
  const msgId = await sendApprovalMessage(post, imageBuffer)
  await updateQueueStatus(post.id, 'pending', { telegramMessageId: msgId })

  console.log('\n✓ Approval message sent to Telegram.')
  console.log('Now test the buttons:')
  console.log('  1. Tap ✓ Approve (posting will fail — credentials needed)')
  console.log('  2. Tap ✎ Edit Both → type an instruction')
  console.log('  3. Tap ✗ Skip')
  console.log(`\nQueue row: ${post.id}`)
}

run().catch(err => { console.error(err); process.exit(1) })
