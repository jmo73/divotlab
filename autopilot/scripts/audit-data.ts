/**
 * Data audit — dumps actual field names + sample values from every API endpoint
 * and local JSON files we'll use for content scripts.
 *
 * Run from /autopilot:
 *   npx tsx scripts/audit-data.ts
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') })

import fs from 'fs'
import path from 'path'

const PROXY = process.env.DIVOTLAB_API_URL ?? 'https://divotlab-api.vercel.app'

function section(title: string) {
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  ${title}`)
  console.log('═'.repeat(60))
}

function show(label: string, obj: unknown, depth = 2) {
  console.log(`\n── ${label}`)
  if (Array.isArray(obj)) {
    console.log(`  [Array length: ${obj.length}]`)
    if (obj[0]) {
      console.log('  [0] fields:', Object.keys(obj[0] as object))
      console.log('  [0] sample:', JSON.stringify(obj[0]).slice(0, 300))
    }
  } else if (obj && typeof obj === 'object') {
    console.log('  keys:', Object.keys(obj as object))
    console.log('  sample:', JSON.stringify(obj).slice(0, 400))
  }
}

async function fetchProxy(path: string) {
  const res = await fetch(`${PROXY}${path}`)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`)
  return res.json()
}

async function main() {

  // ── 1. Pre-tournament predictions ──────────────────────────────────────────
  section('1. Pre-tournament predictions  →  /api/pre-tournament')
  const preTourney = await fetchProxy('/api/pre-tournament?dead_heat=no') as { data: { baseline: unknown[]; baseline_history_fit: unknown[] } }
  show('response keys', preTourney)
  show('data.baseline (first player)', preTourney.data?.baseline?.slice(0, 1))
  show('data.baseline_history_fit (first player)', preTourney.data?.baseline_history_fit?.slice(0, 1))

  // ── 2. Course fit ───────────────────────────────────────────────────────────
  section('2. Course fit  →  /api/course-fit')
  const courseFit = await fetchProxy('/api/course-fit') as { data: { tournament: unknown; course_weights: unknown; field: unknown[] } }
  show('response keys', courseFit)
  show('data.tournament', courseFit.data?.tournament)
  show('data.course_weights', courseFit.data?.course_weights)
  show('data.field (first player)', courseFit.data?.field?.slice(0, 1))

  // ── 3. Rankings ─────────────────────────────────────────────────────────────
  section('3. Rankings  →  /api/rankings')
  const rankings = await fetchProxy('/api/rankings') as { data: { rankings: unknown[] } }
  show('data.rankings (first player)', rankings.data?.rankings?.slice(0, 1))

  // ── 4. Live tournament stats ─────────────────────────────────────────────────
  section('4. Live tournament stats  →  /api/live-stats')
  try {
    const liveStats = await fetchProxy('/api/live-stats?round=event&stats=sg_total,sg_ott,sg_app,sg_arg,sg_putt,driving_dist,driving_acc') as {
      data: { event_name: unknown; round: unknown; players: unknown[] }
    }
    show('response keys', liveStats)
    show('data keys', liveStats.data)
    show('data.players (first player)', liveStats.data?.players?.slice(0, 1))
  } catch (e) {
    console.log('  ⚠ Live stats unavailable (no active tournament):', (e as Error).message)
  }

  // ── 5. In-play probabilities ─────────────────────────────────────────────────
  section('5. In-play probabilities  →  /api/live-tournament')
  try {
    const inPlay = await fetchProxy('/api/live-tournament') as {
      data: { data: unknown[]; info: unknown }
    }
    show('response keys', inPlay)
    show('data.data (first player)', inPlay.data?.data?.slice(0, 1))
    show('data.info', inPlay.data?.info)
  } catch (e) {
    console.log('  ⚠ In-play unavailable:', (e as Error).message)
  }

  // ── 6. Betting odds (outrights) ─────────────────────────────────────────────
  section('6. Betting odds  →  /api/betting-odds')
  try {
    const odds = await fetchProxy('/api/betting-odds') as { data: unknown[] }
    show('data (first player)', odds.data?.slice(0, 1))
  } catch (e) {
    console.log('  ⚠ Odds unavailable:', (e as Error).message)
  }

  // ── 7. Local JSON files ──────────────────────────────────────────────────────
  section('7. Local JSON files (source of truth for picks + record)')
  const root = path.join(__dirname, '../../')

  try {
    const pick = JSON.parse(fs.readFileSync(path.join(root, 'current-pick.json'), 'utf8'))
    show('current-pick.json', pick)
  } catch (e) { console.log('  ⚠ current-pick.json not found') }

  try {
    const proPicks = JSON.parse(fs.readFileSync(path.join(root, 'pro-picks.json'), 'utf8'))
    show('pro-picks.json', proPicks)
    show('pro-picks.json picks[0]', proPicks.picks?.[0])
  } catch (e) { console.log('  ⚠ pro-picks.json not found') }

  try {
    const tracker = JSON.parse(fs.readFileSync(path.join(root, 'lab-notes/lab-picks/season-tracker.json'), 'utf8'))
    show('season-tracker.json totals', tracker.totals)
    show('season-tracker.json weekly_picks (last entry)', tracker.weekly_picks?.slice(-1))
  } catch (e) { console.log('  ⚠ season-tracker.json:', (e as Error).message) }

  console.log('\n' + '═'.repeat(60))
  console.log('  Audit complete')
  console.log('═'.repeat(60) + '\n')
}

main().catch(err => {
  console.error('✗', (err as Error).message)
  process.exit(1)
})
