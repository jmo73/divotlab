/**
 * Trigger scheduler — selects and fetches data for one trigger per cron run.
 * Priority order from TRIGGERS.md is enforced: one trigger per run, highest
 * priority wins when multiple are eligible.
 *
 * Returns null if no trigger is eligible (cron exits cleanly, no post).
 */

import {
  getTournamentStatus,
  getLiveTournamentStats,
  getInPlayProbabilities,
  getPreTournamentPredictions,
  getRankings,
  getFieldUpdate,
  estimateCutLine,
  detectMidRoundMover,
  selectComparisonPair,
  lookupCourseCoords,
  type AutopilotTournamentStatus,
  type LiveTournamentPlayer,
  type DGRankingPlayer,
} from './datagolf'
import { checkDeduplication, getNextEvergreenItem } from './db'
import type { TriggerType, SchedulerResult, EvergreenItem } from './types'

// ─── Mid-round mover state ────────────────────────────────────────────────────
// Persisted in memory (process lifetime). Used to detect position changes
// between 30-min cron runs. Cleared when round changes.

let _previousLeaderboard: LiveTournamentPlayer[] = []
let _previousRound = 0
// Track which (player, round) combinations we've already fired for
const _moversAlreadyFired = new Set<string>()

function hasMoverAlreadyFired(dgId: number, round: number): boolean {
  return _moversAlreadyFired.has(`${dgId}:${round}`)
}

function markMoverFired(dgId: number, round: number): void {
  _moversAlreadyFired.add(`${dgId}:${round}`)
}

// ─── Trigger eligibility checks ───────────────────────────────────────────────

async function isEligible(triggerType: TriggerType): Promise<boolean> {
  const isDup = await checkDeduplication(triggerType)
  return !isDup
}

// ─── Data fetchers per trigger ────────────────────────────────────────────────

async function fetchLeaderboardData(status: AutopilotTournamentStatus, round: 1 | 2 | 3 | 4) {
  const [live, prePreds, rankings] = await Promise.all([
    getLiveTournamentStats(),
    getPreTournamentPredictions(),
    getRankings(),
  ])

  const players = live.players
  const allRatings = rankings.map(r => r.dg_rating).filter(Boolean) as number[]

  // Compute field average score today
  const fieldAvgScore = players.length > 0
    ? +(players.reduce((s, p) => s + (p.today ?? 0), 0) / players.length).toFixed(2)
    : 0

  // Top 5 by total score
  const sorted = [...players].sort((a, b) => a.total - b.total)
  const top5 = sorted.slice(0, 5).map(p => {
    const ranking = rankings.find(r => r.dg_id === p.dg_id)
    const ratingPct = ranking
      ? Math.round(([...allRatings].sort((a, b) => a - b).findIndex(r => r >= ranking.dg_rating) / allRatings.length) * 100)
      : 50
    return {
      playerName: p.player_name,
      score: p.total,
      sg_total: p.sg_total ?? null,
      dg_rating: ranking?.dg_rating ?? null,
      dgRatingPercentile: ratingPct,
    }
  })

  // Pre-tournament top pick
  const sortedPreds = [...prePreds].sort((a, b) => b.win - a.win)
  const topPredPlayer = sortedPreds[0]
  const topPredLive = topPredPlayer
    ? sorted.findIndex(p => p.player_name.toLowerCase() === topPredPlayer.player_name.toLowerCase()) + 1
    : null

  const coords = lookupCourseCoords(status.courseName || status.eventName)

  return {
    eventName: status.eventName,
    courseName: status.courseName,
    eventTier: status.eventTier,
    round,
    top5,
    fieldAvgScore,
    modelTopPick: topPredPlayer
      ? { playerName: topPredPlayer.player_name, currentPosition: topPredLive }
      : null,
    lat: coords?.lat ?? status.lat,
    lng: coords?.lng ?? status.lng,
  }
}

async function fetchFinalData(status: AutopilotTournamentStatus) {
  const [live, prePreds] = await Promise.all([
    getLiveTournamentStats(),
    getPreTournamentPredictions(),
  ])

  const sorted = [...live.players].sort((a, b) => a.total - b.total)
  const winner = sorted[0]
  const sortedPreds = [...prePreds].sort((a, b) => b.win - a.win)
  const topPick = sortedPreds[0]

  const winnerFinalPos = sorted.findIndex(
    p => p.player_name.toLowerCase() === topPick?.player_name.toLowerCase()
  ) + 1

  return {
    eventName: status.eventName,
    eventTier: status.eventTier,
    winner: winner
      ? {
          playerName: winner.player_name,
          finalScore: winner.total,
          sg_total_tournament: winner.sg_total ?? null,
          dg_rating: null,
        }
      : null,
    modelTopPick: topPick
      ? { playerName: topPick.player_name, finalPosition: winnerFinalPos }
      : null,
    modelCorrect: winner && topPick
      ? winner.player_name.toLowerCase() === topPick.player_name.toLowerCase()
      : false,
  }
}

async function fetchMidRoundMoverData(status: AutopilotTournamentStatus): Promise<Record<string, unknown> | null> {
  const live = await getLiveTournamentStats()
  const players = live.players
  const round = status.round

  if (round !== _previousRound) {
    _previousLeaderboard = []
    _previousRound = round
  }

  const mover = detectMidRoundMover(players, _previousLeaderboard, 5)
  _previousLeaderboard = players

  if (!mover) return null
  if (hasMoverAlreadyFired(mover.player.dg_id, round)) return null

  markMoverFired(mover.player.dg_id, round)

  const coords = lookupCourseCoords(status.courseName || status.eventName)

  return {
    playerName: mover.player.player_name,
    positionStart: mover.positionStart,
    positionNow: mover.positionNow,
    roundScore: mover.player.today ?? 0,
    sg_approach_round: mover.player.sg_app ?? null,
    sg_putting_round: mover.player.sg_putt ?? null,
    dg_rating: null,
    dgRatingPercentile: null,
    courseHistoryAvgFinish: null,
    lat: coords?.lat ?? status.lat,
    lng: coords?.lng ?? status.lng,
  }
}

async function fetchCutBubbleData(status: AutopilotTournamentStatus): Promise<Record<string, unknown> | null> {
  const live = await getLiveTournamentStats()
  const { cutLine, bubblePlayers } = estimateCutLine(live.players)

  // Only fire if 5+ notable players on bubble
  if (bubblePlayers.length < 5) return null

  const coords = lookupCourseCoords(status.courseName || status.eventName)

  return {
    eventName: status.eventName,
    cutLine,
    players: bubblePlayers.slice(0, 8).map(p => ({
      playerName: p.player_name,
      score: p.total,
      holesPlayed: p.thru ?? 0,
    })),
    lat: coords?.lat ?? status.lat,
    lng: coords?.lng ?? status.lng,
  }
}

async function fetchWeatherAngleData(status: AutopilotTournamentStatus): Promise<Record<string, unknown> | null> {
  // Weather angle trigger is checked differently — the enrichment layer
  // fetches weather and the scheduler here just returns the shape.
  // The actual conditions check happens after enrichment in the cron handler.
  // For now, return a minimal payload; enrichment fills weather context.
  const coords = lookupCourseCoords(status.courseName || status.eventName)
  return {
    eventName: status.eventName,
    courseName: status.courseName,
    roundNumber: status.round + 1,
    roundDate: new Date().toISOString().slice(0, 10),
    lat: coords?.lat ?? status.lat,
    lng: coords?.lng ?? status.lng,
  }
}

async function fetchPreTournamentData(status: AutopilotTournamentStatus): Promise<Record<string, unknown>> {
  const [prePreds, rankings, field] = await Promise.all([
    getPreTournamentPredictions(),
    getRankings(),
    getFieldUpdate(),
  ])

  const ratingMap = new Map(rankings.map(r => [r.dg_id, r]))
  const fieldIds = new Set(field.field.map(p => p.dg_id))

  // Sort field by win probability
  const fieldPreds = prePreds
    .filter(p => fieldIds.has(p.dg_id))
    .sort((a, b) => b.win - a.win)

  // Top 3 with course fit placeholders (actual fit computed in enrichment)
  const top3 = fieldPreds.slice(0, 3).map(p => {
    const r = ratingMap.get(p.dg_id)
    return {
      playerName: p.player_name,
      winProbability: +(p.win * 100).toFixed(1),
      courseFitScore: 75,  // placeholder — enrichment fills this via /api/course-fit
      keyStrength: r ? inferKeyStrength(r) : 'complete game',
    }
  })

  // Dark horse: top-15 DG rating, outside top-10 win probability
  const darkHorse = fieldPreds
    .slice(10, 30)
    .sort((a, b) => (ratingMap.get(b.dg_id)?.dg_rating ?? 0) - (ratingMap.get(a.dg_id)?.dg_rating ?? 0))
    [0]

  const coords = lookupCourseCoords(status.courseName || status.eventName)

  return {
    eventName: status.eventName,
    courseName: status.courseName,
    eventTier: status.eventTier,
    picks: top3,
    darkHorse: darkHorse
      ? {
          playerName: darkHorse.player_name,
          reason: `${(darkHorse.win * 100).toFixed(1)}% model win probability, high DG rating`,
        }
      : { playerName: 'TBD', reason: 'Watch the course-fit rankings at divotlab.com' },
    fieldStrengthRank: 20,  // enrichment fills
    lat: coords?.lat ?? status.lat,
    lng: coords?.lng ?? status.lng,
  }
}

function inferKeyStrength(r: DGRankingPlayer): string {
  const categories: { label: string; value: number }[] = [
    { label: 'elite ball-striking (OTT)', value: r.sg_ott ?? 0 },
    { label: 'elite iron play (App)', value: r.sg_app ?? 0 },
    { label: 'elite short game (ARG)', value: r.sg_arg ?? 0 },
    { label: 'elite putting', value: r.sg_putt ?? 0 },
  ]
  const best = categories.sort((a, b) => b.value - a.value)[0]
  return best.value > 0.3 ? best.label : 'consistent all-around game'
}

async function fetchSleeperData(status: AutopilotTournamentStatus): Promise<Record<string, unknown> | null> {
  const [live, prePreds, rankings] = await Promise.all([
    getLiveTournamentStats(),
    getPreTournamentPredictions(),
    getRankings(),
  ])

  const sorted = [...live.players].sort((a, b) => a.total - b.total)
  const ratingMap = new Map(rankings.map(r => [r.dg_id, r]))
  const fieldRatings = live.players.map(p => ratingMap.get(p.dg_id)?.dg_rating ?? 0).filter(Boolean)
  const medianRating = fieldRatings.sort((a, b) => a - b)[Math.floor(fieldRatings.length / 2)] ?? 130

  // Sleeper criteria: position 16-40, high DG rating relative to field
  const candidates = sorted.slice(15, 40).filter(p => {
    const r = ratingMap.get(p.dg_id)
    return r && r.dg_rating > medianRating + 5
  })

  if (!candidates[0]) return null

  const sleeper = candidates[0]
  const r = ratingMap.get(sleeper.dg_id)
  const pred = prePreds.find(p => p.dg_id === sleeper.dg_id)
  const pos = sorted.findIndex(p => p.dg_id === sleeper.dg_id) + 1
  const allRatings = rankings.map(r => r.dg_rating).filter(Boolean) as number[]
  const sortedRatings = [...allRatings].sort((a, b) => a - b)
  const ratingPct = r ? Math.round((sortedRatings.findIndex(x => x >= r.dg_rating) / sortedRatings.length) * 100) : 50

  const coords = lookupCourseCoords(status.courseName || status.eventName)

  return {
    playerName: sleeper.player_name,
    position: pos,
    score: sleeper.total,
    dg_rating: r?.dg_rating ?? null,
    dgRatingPercentile: ratingPct,
    courseFitScore: 70,  // placeholder
    sg_total_round: sleeper.sg_total ?? null,
    courseHistoryAvgFinish: null,
    recentFormTrend: 'stable',
    lat: coords?.lat ?? status.lat,
    lng: coords?.lng ?? status.lng,
  }
}

async function fetchComparisonData(status: AutopilotTournamentStatus): Promise<Record<string, unknown> | null> {
  const [live, rankings] = await Promise.all([
    getLiveTournamentStats(),
    getRankings(),
  ])

  const pair = selectComparisonPair(live.players, rankings)
  if (!pair) return null

  const [pA, pB] = pair
  const sorted = [...live.players].sort((a, b) => a.total - b.total)

  const posA = sorted.findIndex(p => p.dg_id === pA.dg_id) + 1
  const posB = sorted.findIndex(p => p.dg_id === pB.dg_id) + 1
  const rA = rankings.find(r => r.dg_id === pA.dg_id)
  const rB = rankings.find(r => r.dg_id === pB.dg_id)

  const gap = Math.abs(pA.total - pB.total)
  const comparisonAngle = rA && rB && Math.abs(rA.dg_rating - rB.dg_rating) < 10
    ? `similar DG ratings (${rA.dg_rating} vs ${rB.dg_rating}), ${gap}-shot gap`
    : `${gap}-shot gap after R${status.round}`

  const coords = lookupCourseCoords(status.courseName || status.eventName)

  return {
    eventName: status.eventName,
    comparisonAngle,
    playerA: {
      name: pA.player_name,
      score: pA.total,
      position: `T${posA}`,
      sg_total_round: pA.sg_total ?? null,
      sg_approach_round: pA.sg_app ?? null,
      sg_putting_round: pA.sg_putt ?? null,
      dg_rating: rA?.dg_rating ?? null,
    },
    playerB: {
      name: pB.player_name,
      score: pB.total,
      position: `T${posB}`,
      sg_total_round: pB.sg_total ?? null,
      sg_approach_round: pB.sg_app ?? null,
      sg_putting_round: pB.sg_putt ?? null,
      dg_rating: rB?.dg_rating ?? null,
    },
    lat: coords?.lat ?? status.lat,
    lng: coords?.lng ?? status.lng,
  }
}

// ─── Main scheduler ───────────────────────────────────────────────────────────

export async function runScheduler(
  jobType: 'tournament' | 'evergreen'
): Promise<SchedulerResult | null> {
  // Evergreen job: Mon–Wed, always tries evergreen triggers
  if (jobType === 'evergreen') {
    return runEvergreenScheduler()
  }

  // Tournament job: Thu–Sun
  const status = await getTournamentStatus()

  if (status.state === 'OFF') {
    return null
  }

  // Try triggers in priority order
  const candidates: Array<{
    triggerType: TriggerType
    eligible: boolean
    fetchData: () => Promise<Record<string, unknown> | null>
  }> = [
    {
      triggerType: 'live_leaderboard_final',
      eligible: status.state === 'COMPLETED',
      fetchData: () => fetchFinalData(status),
    },
    {
      triggerType: 'live_leaderboard_r3_end',
      eligible: status.state === 'POST_R3',
      fetchData: () => fetchLeaderboardData(status, 3),
    },
    {
      triggerType: 'live_leaderboard_r2_end',
      eligible: status.state === 'POST_R2',
      fetchData: () => fetchLeaderboardData(status, 2),
    },
    {
      triggerType: 'live_leaderboard_r1_end',
      eligible: status.state === 'POST_R1',
      fetchData: () => fetchLeaderboardData(status, 1),
    },
    {
      triggerType: 'weather_angle',
      // Only eligible pre-round; enrichment will check actual severity
      eligible: status.state === 'PRE_TOURNAMENT' || status.state === 'POST_R1' || status.state === 'POST_R2' || status.state === 'POST_R3',
      fetchData: () => fetchWeatherAngleData(status),
    },
    {
      triggerType: 'pre_tournament_model_picks',
      eligible: status.state === 'PRE_TOURNAMENT',
      fetchData: () => fetchPreTournamentData(status),
    },
    {
      triggerType: 'post_round_sleeper',
      eligible: status.state === 'POST_R1' || status.state === 'POST_R2',
      fetchData: () => fetchSleeperData(status),
    },
    {
      triggerType: 'comparison_spotlight',
      eligible: status.state === 'POST_R1' || status.state === 'POST_R2',
      fetchData: () => fetchComparisonData(status),
    },
    {
      triggerType: 'cut_bubble_alert',
      eligible: status.state === 'LIVE' && status.round === 2,
      fetchData: () => fetchCutBubbleData(status),
    },
    {
      triggerType: 'mid_round_mover',
      eligible: status.state === 'LIVE',
      fetchData: () => fetchMidRoundMoverData(status),
    },
  ]

  for (const candidate of candidates) {
    if (!candidate.eligible) continue

    const dedupPassed = await isEligible(candidate.triggerType)
    if (!dedupPassed) continue

    const data = await candidate.fetchData()
    if (!data) continue  // fetch returned null (e.g. no mover found, no bubble players)

    return {
      triggerType: candidate.triggerType,
      eventName: status.eventName,
      tournamentStatus: status.state,
      rawData: data,
      // Lat/lng for enrichment's weather fetch
      lat: status.lat,
      lng: status.lng,
    }
  }

  return null
}

// ─── Evergreen scheduler ──────────────────────────────────────────────────────

// Rotate through trigger types to prevent always hitting the same series
const EVERGREEN_PRIORITY: TriggerType[] = [
  'evergreen_sg_explainer',
  'evergreen_course_profile',
  'evergreen_player_spotlight',
  'evergreen_stat_of_week',
  'evergreen_myth_bust',
]

async function runEvergreenScheduler(): Promise<SchedulerResult | null> {
  for (const triggerType of EVERGREEN_PRIORITY) {
    const dedupPassed = await isEligible(triggerType)
    if (!dedupPassed) continue

    const item = await getNextEvergreenItem(triggerType)
    if (!item) continue

    return {
      triggerType,
      eventName: null,
      tournamentStatus: 'OFF',
      rawData: {
        evergreenItemId: item.id,
        contentId: item.contentId,
        templateId: item.templateId,
        templateFields: item.templateFields,
        captionX: item.captionX,
        captionIG: item.captionIG,
      },
      lat: undefined,
      lng: undefined,
    }
  }

  return null
}
