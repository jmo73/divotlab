/**
 * Manually fire a trigger with flags:
 *   --trigger=<trigger_type>   Force a specific trigger (bypasses eligibility check)
 *   --dry-run                  Full pipeline: scheduler + enrichment + image + captions, no queue, no Telegram
 *   --queue                    Creates queue entry + Blob upload, no Telegram send
 *   --post-x-only              Full pipeline including X post (real tweet — delete after)
 *   --post-ig-only             Full pipeline including IG post (real post — delete after)
 *   --post-both                Full pipeline including both platforms
 *
 * Usage:
 *   npx tsx autopilot/scripts/test-trigger.ts --trigger=pre_tournament_model_picks --dry-run
 *   npx tsx autopilot/scripts/test-trigger.ts --trigger=evergreen_stat_of_week --queue
 */

import { runScheduler } from '../lib/scheduler'
import { buildPostContext } from '../lib/enrichment'
import { generateCaptions } from '../lib/claude'
import { generateImage } from '../lib/imageGen'
import { createPost, firePosting } from '../lib/queue'
import { postToTwitter } from '../lib/twitter'
import { postToInstagram } from '../lib/instagram'
import { validateEnv } from '../lib/config'
import type { TriggerType } from '../lib/types'
import fs from 'fs/promises'
import path from 'path'

const args = process.argv.slice(2)
const flags = Object.fromEntries(
  args.filter(a => a.startsWith('--')).map(a => {
    const [k, v] = a.slice(2).split('=')
    return [k, v ?? true]
  })
)

const triggerArg = flags['trigger'] as TriggerType | undefined
const isDryRun   = !!flags['dry-run']
const isQueue    = !!flags['queue']
const postX      = !!flags['post-x-only'] || !!flags['post-both']
const postIG     = !!flags['post-ig-only'] || !!flags['post-both']

async function run() {
  validateEnv()

  const OUT_DIR = path.join(__dirname, '..', 'test-output')
  await fs.mkdir(OUT_DIR, { recursive: true })

  console.log('─'.repeat(60))
  console.log('Divot Lab Autopilot — Test Trigger')
  console.log('─'.repeat(60))

  // 1. Run scheduler (respects --trigger override)
  let schedulerResult
  if (triggerArg) {
    console.log(`\nForcing trigger: ${triggerArg}`)
    schedulerResult = await runScheduler('tournament')
    if (schedulerResult && triggerArg) {
      // Override trigger type for testing
      schedulerResult = { ...schedulerResult, triggerType: triggerArg }
    }
  } else {
    console.log('\nRunning scheduler...')
    schedulerResult = await runScheduler('tournament')
  }

  if (!schedulerResult) {
    console.log('Scheduler: no eligible trigger. Use --trigger=<type> to force one.')
    return
  }

  console.log(`\nTrigger selected: ${schedulerResult.triggerType}`)
  console.log(`Event: ${schedulerResult.eventName ?? 'Evergreen'}`)
  console.log(`Tournament status: ${schedulerResult.tournamentStatus}`)

  // 2. Enrichment
  console.log('\nBuilding context...')
  const context = await buildPostContext(schedulerResult.triggerType, {
    eventName: schedulerResult.eventName ?? '',
    roundDate: new Date(),
    lat: schedulerResult.lat,
    lng: schedulerResult.lng,
  })

  console.log(`  Tier: ${context.tournament.tier}`)
  console.log(`  Conditions: ${context.weather.conditionsSummary} (${context.weather.conditionsFlag})`)
  console.log(`  Field strength: ${context.field.fieldStrengthLabel}`)
  if (context.insightFlags) {
    const flags = Object.entries(context.insightFlags).filter(([, v]) => v).map(([k]) => k)
    if (flags.length) console.log(`  Insight flags: ${flags.join(', ')}`)
  }

  // 3. Captions
  console.log('\nGenerating captions...')
  const captions = await generateCaptions(schedulerResult.triggerType, context, schedulerResult.rawData)

  console.log(`\nX CAPTION (${captions.captionX.length} chars):`)
  console.log(captions.captionX)
  console.log(`\nIG CAPTION (${captions.captionIG.length} chars):`)
  console.log(captions.captionIG)
  if (captions.usedFallback) console.log('\n⚠ Used fallback captions (Claude API unavailable)')

  if (isDryRun) {
    console.log('\n─'.repeat(60))
    console.log('Dry run complete. No queue entry, no Blob, no posts.')
    return
  }

  // 4. Image
  console.log('\nGenerating image...')
  const post = await createPost({ schedulerResult, context })
  const imgPath = path.join(OUT_DIR, `${schedulerResult.triggerType}.png`)
  await fs.writeFile(imgPath, post.imageBuffer)
  console.log(`  ✓ Image: ${imgPath}`)
  console.log(`  ✓ Blob: ${post.imageBlobUrl}`)
  console.log(`  ✓ Queue ID: ${post.id}`)

  if (isQueue) {
    console.log('\n─'.repeat(60))
    console.log('Queue mode: row created, Blob uploaded. No Telegram, no posts.')
    console.log(`Queue ID: ${post.id} — verify in autopilot_queue table`)
    return
  }

  // 5. Posting
  if (postX) {
    console.log('\nPosting to X...')
    const result = await postToTwitter(post.captionX, post.imageBuffer)
    console.log(`  ✓ X: ${result.postUrl}`)
    console.log('  ⚠ Delete this tweet manually: ' + result.postUrl)
  }

  if (postIG) {
    console.log('\nPosting to Instagram...')
    // Instagram needs JPEG and a public URL — use blob URL
    const { default: sharp } = await import('sharp')
    const jpegBuf = await sharp(post.imageBuffer).jpeg({ quality: 92 }).toBuffer()
    const { put } = await import('@vercel/blob')
    const { config } = await import('../lib/config')
    const { url } = await put(`posts/${post.id}-test.jpg`, jpegBuf, { access: 'public', token: config.blob.token })
    const result = await postToInstagram(post.captionIG, url)
    console.log(`  ✓ IG: ${result.postUrl}`)
    console.log('  ⚠ Delete this post manually: ' + result.postUrl)
  }
}

run().catch(err => { console.error(err); process.exit(1) })
