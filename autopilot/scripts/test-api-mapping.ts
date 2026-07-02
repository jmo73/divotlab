/**
 * API Field Mapping Test
 *
 * Pulls real DataGolf data, prints the exact API field → template token mapping
 * for every template, renders all 7 cards with real data, and sends them to
 * Telegram so you can visually verify every field.
 *
 * Run from /autopilot:
 *   npx tsx scripts/test-api-mapping.ts
 *
 * No database or posting credentials needed — just TELEGRAM_BOT_TOKEN,
 * TELEGRAM_CHAT_ID, ANTHROPIC_API_KEY, and DATAGOLF_API_KEY.
 */

// Load .env.local FIRST before any module reads process.env
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') })

import {
  getLiveTournamentStats,
  getInPlayProbabilities,
  getPreTournamentPredictions,
  estimateCutLine,
  type LiveTournamentPlayer,
  type PreTournamentPrediction,
} from '../lib/datagolf'

import {
  leaderboardFields,
  spotlightFields,
  courseProfileFields,
  weatherFields,
  pickResultFields,
  modelPicksFields,
  cutAlertFields,
  formatScore,
  scoreColor,
  formatSG,
} from '../lib/imageGen'

import { renderHtmlTemplate } from '../lib/renderHtml'

// ── Telegram helpers ──────────────────────────────────────────────────────────

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID!
const TG_API    = `https://api.telegram.org/bot${BOT_TOKEN}`

async function sendPhoto(buf: Buffer, caption: string) {
  const fd = new FormData()
  fd.append('chat_id', CHAT_ID)
  fd.append('photo', new Blob([new Uint8Array(buf)], { type: 'image/png' }), 'card.png')
  fd.append('caption', caption)
  const res = await fetch(`${TG_API}/sendPhoto`, { method: 'POST', body: fd })
  const json = await res.json() as { ok: boolean; description?: string }
  if (!json.ok) throw new Error(`sendPhoto failed: ${json.description}`)
}

async function sendMessage(text: string) {
  const res = await fetch(`${TG_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
  })
  const json = await res.json() as { ok: boolean; description?: string }
  if (!json.ok) throw new Error(`sendMessage failed: ${json.description}`)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(prob: number): string {
  return `${(prob * 100).toFixed(1)}%`
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const missing = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'DATAGOLF_API_KEY']
    .filter(k => !process.env[k])
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`)
  console.log('✓ Env vars OK\n')

  // ── 1. Fetch all API data ──────────────────────────────────────────────────

  console.log('Fetching DataGolf data...')
  const [liveData, inPlayResult, preTournData] = await Promise.all([
    getLiveTournamentStats('event').catch(() => ({ eventName: 'No Tournament', players: [] as LiveTournamentPlayer[] })),
    getInPlayProbabilities().catch(() => null),
    getPreTournamentPredictions().catch(() => [] as PreTournamentPrediction[]),
  ])

  const { eventName, players: liveRaw } = liveData
  const inPlayPlayers = inPlayResult?.players ?? []
  const activePlayers = liveRaw
    .filter(p => p.total !== undefined && !isNaN(p.total))
    .sort((a, b) => a.total - b.total)

  // Build in-play map: dg_id → probabilities
  const inPlayMap = new Map(inPlayPlayers.map(p => [p.dg_id, p]))
  // Build pre-tournament map: dg_id → predictions
  const preTMap   = new Map(preTournData.map(p => [p.dg_id, p]))

  console.log(`✓ Event: ${eventName}`)
  console.log(`✓ Live players: ${activePlayers.length}`)
  console.log(`✓ In-play: ${inPlayPlayers.length} players`)
  console.log(`✓ Pre-tournament: ${preTournData.length} players\n`)

  // ── 2. Print field mapping reference ──────────────────────────────────────

  console.log('═'.repeat(60))
  console.log('  FIELD MAPPING REFERENCE')
  console.log('═'.repeat(60))
  console.log(`
┌──────────────────────────────────────────────────────────┐
│  LEADERBOARD TEMPLATE                                    │
│  Source: getLiveTournamentStats() → players[0..4]        │
├──────────────────────────────────────────────────────────┤
│  API field             → Template token                  │
│  event_name            → EVENT_NAME                      │
│  players[n].player_name→ P{n}_NAME                      │
│  players[n].total      → P{n}_SCORE (formatScore())      │
│  players[n].dg_rating  → P{n}_RATING                    │
│  players[n].sg_total   → P{n}_SG_TOTAL (+X.X SG)        │
│  [derived]             → P{n}_SCORE_COLOR / SG_COLOR     │
│  [manual/Claude]       → INSIGHT, BADGE                  │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  PLAYER SPOTLIGHT TEMPLATE                               │
│  Source: getLiveTournamentStats() + getInPlayProbabilities│
├──────────────────────────────────────────────────────────┤
│  player.player_name    → PLAYER_NAME                     │
│  player.position +     → CONTEXT ("T3 · After R2")       │
│    event_name                                             │
│  inPlay.win            → HERO_VALUE (win %)              │
│  [derived]             → HERO_LABEL, HERO_COLOR, HERO_SUB│
│  player.sg_app         → STAT1_VALUE (SG: App)           │
│  player.sg_putt        → STAT2_VALUE (SG: Putt)          │
│  player.sg_ott         → STAT3_VALUE (SG: OTT)           │
│  player.sg_arg         → STAT4_VALUE (SG: ARG)           │
│  [manual/Claude]       → INSIGHT, BADGE                  │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  COURSE PROFILE TEMPLATE                                 │
│  Source: COURSE_WEIGHTS in server.js (manual)            │
├──────────────────────────────────────────────────────────┤
│  [hardcoded in model]  → COURSE_NAME, COURSE_META        │
│  weights object        → REWARDS (App 35%, Putt 28%...)  │
│  historical data       → HIST_SCORING (e.g. "-15 to -18")│
│  [derived]             → FIELD_AVG (from historical SG)  │
│  [manual]              → KEY_STAT, INSIGHT, BADGE        │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  WEATHER CARD TEMPLATE                                   │
│  Source: Tomorrow.io /timelines (when key is set)        │
├──────────────────────────────────────────────────────────┤
│  windSpeed max         → WIND_SPEED (e.g. "28")          │
│  windDirection bearing → WIND_ARROW_DEG (e.g. "225")     │
│  windDirection name    → WIND_DIR (e.g. "SW")            │
│  temperature + precip  → WIND_DIR_TEMP ("SW · 68°F")    │
│  [derived from speed]  → CONDITIONS_FLAG, CONDITIONS_COLOR│
│  [historical avg]      → SCORING_IMPACT, HIST_CONTEXT    │
│  event_name            → EVENT_NAME                      │
│  round + date          → ROUND_DATE, BADGE               │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  PICK RESULT TEMPLATE                                    │
│  Source: pro-picks.json + season-tracker.json (manual)   │
├──────────────────────────────────────────────────────────┤
│  pro-picks.tournament  → TOURNAMENT                      │
│  pro-picks.player      → PLAYER_NAME                     │
│  bet_type + odds + book→ BET_LINE ("Top 10 · +350 · DK") │
│  pro-picks.result      → RESULT ("WIN"/"LOSS"/"PUSH")    │
│  result_detail         → RESULT_DETAIL                   │
│  totals.total_hits/picks→ SEASON_RECORD ("21-38")        │
│  totals.units.profit   → SEASON_UNITS ("+25.5u")         │
│  totals.roi_pct        → SEASON_ROI ("33.8%")            │
│  [manual/Claude]       → INSIGHT                         │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  MODEL PICKS TEMPLATE                                    │
│  Source: getPreTournamentPredictions() + /api/course-fit │
├──────────────────────────────────────────────────────────┤
│  event_name            → EVENT_NAME                      │
│  preTournament.win     → P{n}_WIN_PCT ("4.2%")           │
│  courseFit.score 0-100 → P{n}_FIT_WIDTH (px via helper)  │
│  preTournament.player  → P{n}_NAME                       │
│  [manual]              → P{n}_KEY_STRENGTH ("App #4, ..") │
│  [manual/Claude]       → DH_NAME, DH_REASON, BADGE       │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  CUT ALERT TEMPLATE                                      │
│  Source: getLiveTournamentStats() after R2               │
├──────────────────────────────────────────────────────────┤
│  estimateCutLine()     → CUT_LINE (e.g. "-4")            │
│  event_name            → EVENT_NAME                      │
│  bubble players[]      → B{n}_NAME, B{n}_SCORE           │
│  [derived]             → B{n}_SCORE_COLOR, STATUS/CLASS  │
│  [from pro-picks.json] → B{n}_IS_PICK (is-pick class)    │
└──────────────────────────────────────────────────────────┘
`)

  // Print actual sample values from the live API
  if (activePlayers.length > 0) {
    console.log('── Live API sample (top 3 players) ──────────────────')
    activePlayers.slice(0, 3).forEach((p, i) => {
      const ip = inPlayMap.get(p.dg_id)
      console.log(`\n  [${i + 1}] ${p.player_name}`)
      console.log(`       player_name: "${p.player_name}"`)
      console.log(`       total:       ${p.total}  → formatScore: "${formatScore(p.total)}"`)
      console.log(`       position:    "${p.position}"`)
      console.log(`       dg_rating:   ${p.dg_rating ?? 'N/A'}`)
      console.log(`       sg_total:    ${p.sg_total?.toFixed(2) ?? 'N/A'}  → formatSG: "${p.sg_total != null ? formatSG(p.sg_total) : 'N/A'}"`)
      console.log(`       sg_app:      ${p.sg_app?.toFixed(2) ?? 'N/A'}`)
      console.log(`       sg_putt:     ${p.sg_putt?.toFixed(2) ?? 'N/A'}`)
      console.log(`       sg_ott:      ${p.sg_ott?.toFixed(2) ?? 'N/A'}`)
      console.log(`       sg_arg:      ${p.sg_arg?.toFixed(2) ?? 'N/A'}`)
      if (ip) {
        console.log(`       inPlay.win:  ${ip.win.toFixed(4)}  → pct: "${pct(ip.win)}"`)
        console.log(`       inPlay.top10:${ip.top_10.toFixed(4)}  → pct: "${pct(ip.top_10)}"`)
      }
    })

    if (preTournData.length > 0) {
      console.log('\n── Pre-tournament sample (top 3 predictions) ────────')
      preTournData.slice(0, 3).forEach((p, i) => {
        console.log(`\n  [${i + 1}] ${p.player_name}`)
        console.log(`       win:       ${pct(p.win)}`)
        console.log(`       top_5:     ${pct(p.top_5)}`)
        console.log(`       top_10:    ${pct(p.top_10)}`)
        console.log(`       top_20:    ${pct(p.top_20)}`)
        console.log(`       → P{n}_WIN_PCT: "${pct(p.top_10)} top 10"`)
        console.log(`       → P{n}_FIT_WIDTH: needs /api/course-fit score for px width`)
      })
    }

    const { cutLine, bubblePlayers } = estimateCutLine(activePlayers)
    console.log(`\n── Cut line estimate ─────────────────────────────────`)
    console.log(`   Estimated cut at: ${formatScore(cutLine)} (top 65)`)
    console.log(`   Bubble players (within 1 shot): ${bubblePlayers.length}`)
    bubblePlayers.slice(0, 3).forEach(p => {
      console.log(`   · ${p.player_name} ${formatScore(p.total)} (thru ${p.thru})`)
    })
  } else {
    console.log('\n  (No live tournament in progress — using static sample data)\n')
  }

  console.log('\n' + '═'.repeat(60))

  // ── 3. Build fields for every template ────────────────────────────────────

  console.log('\nBuilding template fields...')

  // Leaderboard — real data if available, static fallback
  const top5 = activePlayers.length >= 5
    ? activePlayers.slice(0, 5)
    : [
        { player_name: 'Viktor Hovland',    total: -12, dg_rating: 178, sg_total:  4.1 },
        { player_name: 'Scottie Scheffler', total: -11, dg_rating: 196, sg_total:  3.7 },
        { player_name: 'Collin Morikawa',   total: -10, dg_rating: 182, sg_total:  2.9 },
        { player_name: 'Rory McIlroy',      total:  -9, dg_rating: 185, sg_total:  2.4 },
        { player_name: 'Patrick Cantlay',   total:  -8, dg_rating: 170, sg_total:  1.8 },
      ] as typeof activePlayers

  const leaderFields = leaderboardFields({
    eventName:        activePlayers.length > 0 ? `${eventName} · Live` : 'Travelers Championship · R2',
    courseConditions: 'TPC River Highlands',
    roundBadge:       activePlayers.length > 0 ? 'Live' : 'After R2',
    players:          top5.map(p => ({
      name:     p.player_name,
      score:    p.total ?? 0,
      dgRating: p.dg_rating,
      sgTotal:  p.sg_total,
    })),
    insight: top5[0]
      ? `${top5[0].player_name} leads with ${formatSG(top5[0].sg_total ?? 0)} SG: Total — model-implied win probability at ${
          inPlayMap.get((top5[0] as typeof activePlayers[0]).dg_id)
            ? pct(inPlayMap.get((top5[0] as typeof activePlayers[0]).dg_id)!.win)
            : '—'
        }.`
      : 'Hovland leads with +4.1 SG: Approach — model-implied win probability: 31%.',
    fieldContext: '',
  })

  // Player spotlight — leader if available
  const leader = activePlayers[0]
  const leaderInPlay = leader ? inPlayMap.get(leader.dg_id) : null
  const spotFields = spotlightFields({
    badge:      'Player Spotlight',
    playerName: leader?.player_name ?? 'Viktor Hovland',
    context:    leader
      ? `${leader.position} · ${eventName}`
      : 'T1 · Travelers Championship',
    heroLabel:  'Win Probability',
    heroValue:  leaderInPlay ? `${(leaderInPlay.win * 100).toFixed(0)}%` : '31%',
    heroColor:  '#5BBF85',
    heroSub:    'Model Implied',
    stats: [
      { label: 'SG: App',  value: leader?.sg_app  != null ? formatSG(leader.sg_app)  : '+2.3' },
      { label: 'SG: Putt', value: leader?.sg_putt != null ? formatSG(leader.sg_putt) : '+0.8' },
      { label: 'SG: OTT',  value: leader?.sg_ott  != null ? formatSG(leader.sg_ott)  : '+1.0' },
      { label: 'SG: ARG',  value: leader?.sg_arg  != null ? formatSG(leader.sg_arg)  : '+0.4' },
    ],
    insight: `Model has him at ${leaderInPlay ? pct(leaderInPlay.win) : '31%'} to win — highest probability in the field by a wide margin.`,
  })

  // Course profile — static (manual data, not from API)
  const cpFields = courseProfileFields({
    badge:       'Course Profile',
    courseName:  'TPC River Highlands',
    courseMeta:  'Par 70 · 6,852 yds · Cromwell, CT',
    rewards:     'Approach 28%, Putting 32%',
    histScoring: '−15 to −19',
    fieldAvg:    '+0.18 SG: Total',
    keyStat:     'Putting premium: 3 of last 5 winners ranked top-5 SG: Putt on tour.',
    insight:     "River Highlands plays easy on approach — it's the putter that separates. Top-5 SG: Putt in the last 24 rounds is the clearest signal here.",
  })

  // Weather card — static sample (Tomorrow.io not wired yet)
  const wxFields = weatherFields({
    badge:          'Round 2 Weather',
    eventName:      activePlayers.length > 0 ? eventName : 'Travelers Championship',
    roundDate:      'Friday, June 27',
    windSpeed:      '28',
    windArrowDeg:   '225',
    windDir:        'SW',
    windDirTemp:    'SW · 71°F',
    conditionsFlag: 'Gusty',
    conditionsColor:'#C9A84C',
    scoringImpact:  'Field scoring typically rises 1.5–2.5 shots in sustained 25+ mph winds. Expect leaderboard compression.',
    histContext:    'River Highlands average wind: 8 mph. Today is an outlier — top-10 in last 10 years by peak gust.',
  })

  // Pick result — static (manual, from season-tracker.json)
  const winFields = pickResultFields({
    tournament:    'RBC Canadian Open',
    playerName:    'Ben Cauley',
    betLine:       'Top 5 · +1000 · DraftKings',
    result:        'WIN',
    resultDetail:  'Won outright at −17 · +10.00 units',
    seasonRecord:  '24-54',
    seasonUnits:   '+31.2u',
    seasonRoi:     '57.7%',
    insight:       "Cauley's first PGA Tour win. Course-fit model had him #8 in the field at TPC Toronto North — biggest single payout of the season.",
  })

  // Model picks — pre-tournament data if available
  const preTop3 = preTournData.length >= 3
    ? preTournData.slice(0, 3)
    : [
        { player_name: 'Scottie Scheffler', win: 0.168, top_10: 0.52 },
        { player_name: 'Rory McIlroy',      win: 0.082, top_10: 0.38 },
        { player_name: 'Viktor Hovland',    win: 0.071, top_10: 0.34 },
      ] as typeof preTournData

  const mpFields = modelPicksFields({
    eventName: activePlayers.length > 0 ? eventName : 'Travelers Championship',
    badge:     'Model Picks',
    picks: preTop3.map(p => ({
      name:        p.player_name,
      winPct:      `${pct(p.win)} win`,
      fitScore:    72,   // placeholder — real fit comes from /api/course-fit
      keyStrength: 'SG: App top 10, form trending up L12',
    })),
    darkHorse: {
      name:   preTournData[9]?.player_name ?? 'Chris Kirk',
      reason: `${preTournData[9]?.win != null ? pct(preTournData[9].win) : '2.1%'} win · course fit top-20 · +600 value vs model`,
    },
  })

  // Cut alert — from live data if R2 complete, else static
  const { cutLine, bubblePlayers: bubble } = activePlayers.length > 10
    ? estimateCutLine(activePlayers)
    : { cutLine: -4, bubblePlayers: [] }

  const cutPlayers = bubble.length >= 4
    ? bubble.slice(0, 4)
    : [
        { player_name: 'Aaron Rai',          total: -5, isPick: true  },
        { player_name: 'Emilio Grillo',       total: -4, isPick: false },
        { player_name: 'Webb Simpson',        total: -3, isPick: false },
        { player_name: 'Tom Hoge',            total: -3, isPick: false },
      ] as unknown as typeof bubble

  const caFields = cutAlertFields({
    eventName: activePlayers.length > 0 ? eventName : 'Travelers Championship',
    cutLine:   formatScore(cutLine),
    players: cutPlayers.slice(0, 4).map(p => ({
      name:    p.player_name,
      score:   p.total ?? 0,
      status:  (p.total ?? 0) <= cutLine ? 'MADE' : 'MISSED',
      isPick:  false,  // would cross-ref against pro-picks.json in production
    })),
  })

  // ── 4. Render all 7 templates ──────────────────────────────────────────────

  const templates: Array<{ name: string; templateId: string; fields: Record<string, string>; label: string }> = [
    { name: 'leaderboard',     templateId: 'leaderboard',     fields: leaderFields, label: '1/7 Leaderboard' },
    { name: 'player-spotlight',templateId: 'player-spotlight',fields: spotFields,   label: '2/7 Player Spotlight' },
    { name: 'course-profile',  templateId: 'course-profile',  fields: cpFields,     label: '3/7 Course Profile' },
    { name: 'weather-card',    templateId: 'weather-card',    fields: wxFields,     label: '4/7 Weather Card' },
    { name: 'pick-result',     templateId: 'pick-result',     fields: winFields,    label: '5/7 Pick Result (WIN)' },
    { name: 'model-picks',     templateId: 'model-picks',     fields: mpFields,     label: '6/7 Model Picks' },
    { name: 'cut-alert',       templateId: 'cut-alert',       fields: caFields,     label: '7/7 Cut Alert' },
  ]

  console.log('\nRendering + sending to Telegram...\n')

  await sendMessage('<b>🧪 API Mapping Test — all 7 templates with real DataGolf data</b>\n\nEvent: ' + (activePlayers.length > 0 ? eventName : 'Static sample data (no live tournament)'))

  for (const t of templates) {
    process.stdout.write(`  ${t.label}... `)

    try {
      const buf = await renderHtmlTemplate(t.templateId, t.fields, { width: 1080, height: 1350 })
      await sendPhoto(buf, `${t.label}`)
      console.log(`✓ (${(buf.length / 1024).toFixed(0)} KB)`)
    } catch (err) {
      console.log(`✗ ${(err as Error).message}`)
      await sendMessage(`❌ <b>${t.label}</b> failed:\n<code>${(err as Error).message}</code>`)
    }

    // Breathing room — avoid hammering Telegram rate limit
    await sleep(1000)
  }

  console.log('\n✓ All templates sent to Telegram.')
  console.log('\nKey findings to verify in Telegram:')
  console.log('  · Leaderboard: scores, DG ratings, SG totals match API')
  console.log('  · Player Spotlight: win % is from in-play endpoint')
  console.log('  · Course Profile: weights/stats are hardcoded (manual)')
  console.log('  · Weather: static sample — Tomorrow.io key needed for live')
  console.log('  · Pick Result: manual data (pro-picks.json driven)')
  console.log('  · Model Picks: pre-tournament win % from DG — fit score needs /api/course-fit')
  console.log('  · Cut Alert: derived from live leaderboard distribution')
}

main().catch(err => {
  console.error('\n✗', err.message ?? err)
  process.exit(1)
})
