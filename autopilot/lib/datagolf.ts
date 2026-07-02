/**
 * DataGolf API client for the autopilot pipeline.
 * All fetch logic mirrors server.js patterns but is typed and self-contained.
 * Never call this file's functions from server.js — extend there if needed.
 * Rate limit: 45 req/min across ALL endpoints. Exceeding triggers 5-min suspension.
 */

import { config } from './config'
import type { EventTier } from './types'

const BASE_URL = 'https://feeds.datagolf.com'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DGPlayer {
  dg_id: number
  player_name: string
  primary_tour?: string
}

export interface DGRankingPlayer extends DGPlayer {
  dg_id: number
  player_name: string       // "Last, First" format
  primary_tour: string
  datagolf_rank: number     // actual API field name
  dg_skill_estimate: number // actual API field name (was incorrectly typed as dg_rating)
  dg_rating: number         // alias kept for compatibility — same as dg_skill_estimate
  owgr_rank?: number
  am?: number
  country?: string
  sg_ott?: number
  sg_app?: number
  sg_arg?: number
  sg_putt?: number
  sg_t2g?: number
  sg_total?: number
  // last 12/24 rounds
  sg_ott_l12?: number
  sg_app_l12?: number
  sg_arg_l12?: number
  sg_putt_l12?: number
  sg_ott_l24?: number
  sg_app_l24?: number
  sg_arg_l24?: number
  sg_putt_l24?: number
}

export interface LiveTournamentPlayer {
  dg_id: number
  player_name: string     // "Last, First" format — use formatPlayerName() for display
  position: string        // "1", "T5", "CUT", "WD" etc.
  total: number           // score vs par for tournament
  today: number           // score vs par for current round
  thru: number            // holes completed (0 if not started)
  sg_total?: number
  sg_app?: number
  sg_ott?: number
  sg_arg?: number
  sg_putt?: number
  dg_rating?: number      // not reliably present in live stats — use getRankings() for ratings
}

/**
 * Convert DataGolf "Last, First" name format to display "First Last".
 * Handles multi-word first/last names correctly (e.g. "Van Rooyen, Erik" → "Erik Van Rooyen").
 * If name doesn't contain ", " it's returned as-is.
 */
export function formatPlayerName(name: string): string {
  if (!name) return name
  const idx = name.indexOf(', ')
  if (idx === -1) return name  // already "First Last" format or no comma
  const last  = name.slice(0, idx).trim()
  const first = name.slice(idx + 2).trim()
  return first ? `${first} ${last}` : last
}

export interface InPlayProbabilities {
  dg_id: number
  player_name: string   // "Last, First" format
  win: number           // probability 0–1 (or 0/1 integer when event complete)
  top_5: number
  top_10: number
  top_20: number
  make_cut: number
  current_pos?: string  // "1", "T5", "CUT" etc.
  current_score?: number
  today?: number
  thru?: number
  round?: number
  R1?: number; R2?: number; R3?: number; R4?: number
}

export interface InPlayInfo {
  event_name: string
  current_round: number
  dead_heat_rules: string
  last_update: string
}

export interface TournamentStatus {
  event_name: string
  event_id: number
  tour: string
  round: number           // 1–4, or 0 if not started
  round_status: 'not_started' | 'in_progress' | 'complete'
  tournament_status: 'not_started' | 'in_progress' | 'complete'
  course_name?: string
  current_season: number
}

export interface PreTournamentPrediction {
  dg_id: number
  player_name: string     // "Last, First" format
  am?: number
  country?: string
  sample_size?: number
  win: number             // probability 0–1
  top_5: number
  top_10: number
  top_20: number
  make_cut: number
}

export interface PreTournamentResponse {
  event_name: string
  last_updated: string
  dead_heats: string
  models_available: string[]
  baseline: PreTournamentPrediction[]
  baseline_history_fit: PreTournamentPrediction[]  // blended model (form + history)
}

export interface ScheduleEvent {
  event_id: number
  event_name: string
  tour: string
  course: string
  start_date: string      // "YYYY-MM-DD"
  end_date: string
  status: 'completed' | 'upcoming' | 'in_progress'
  lat?: number
  lng?: number
}

export interface FieldUpdatePlayer extends DGPlayer {
  dg_id: number
  player_name: string
  am: number              // 1 if amateur
  country: string
  dg_rating: number
}

export interface FieldUpdate {
  event_name: string
  event_id: number
  course: string
  field: FieldUpdatePlayer[]
}

// ─── Simple in-memory cache (process lifetime) ────────────────────────────────

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

const _cache = new Map<string, CacheEntry<unknown>>()

function getCached<T>(key: string): T | null {
  const entry = _cache.get(key) as CacheEntry<T> | undefined
  if (!entry || Date.now() > entry.expiresAt) return null
  return entry.data
}

function setCached<T>(key: string, data: T, ttlMs: number): void {
  _cache.set(key, { data, expiresAt: Date.now() + ttlMs })
}

// ─── Core fetch ───────────────────────────────────────────────────────────────

async function dg<T>(
  path: string,
  params: Record<string, string> = {},
  cacheTtlMs = 5 * 60 * 1000,
): Promise<T> {
  const qs = new URLSearchParams({ ...params, key: config.datagolf.apiKey, file_format: 'json' })
  const url = `${BASE_URL}${path}?${qs}`
  const cacheKey = url

  const cached = getCached<T>(cacheKey)
  if (cached) return cached

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  let res: Response
  try {
    res = await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    throw new Error(`DataGolf API error ${res.status} for ${path}`)
  }
  const data = (await res.json()) as T
  setCached(cacheKey, data, cacheTtlMs)
  return data
}

// ─── Rankings ─────────────────────────────────────────────────────────────────

export async function getRankings(): Promise<DGRankingPlayer[]> {
  const resp = await dg<{
    rankings: Array<Omit<DGRankingPlayer, 'dg_rating'> & { dg_skill_estimate: number }>
  }>('/preds/get-dg-rankings', {}, 6 * 60 * 60 * 1000)
  return (resp.rankings ?? []).map(p => ({
    ...p,
    dg_rating: p.dg_skill_estimate,
  }))
}

/**
 * Non-LIV player ID set — mirrors server.js updatePGATourPlayerIds().
 * Used for field filtering. Cached for 24h.
 */
let _nonLivIds: Set<number> | null = null
let _nonLivLoadedAt = 0

export async function getNonLivPlayerIds(): Promise<Set<number>> {
  if (_nonLivIds && Date.now() - _nonLivLoadedAt < 24 * 60 * 60 * 1000) {
    return _nonLivIds
  }
  const rankings = await getRankings()
  _nonLivIds = new Set(
    rankings
      .filter(p => (p.primary_tour ?? '').toLowerCase() !== 'liv')
      .map(p => p.dg_id)
  )
  _nonLivLoadedAt = Date.now()
  return _nonLivIds
}

/** Lookup a player's DG rating percentile within the given ranking set. */
export function dgRatingPercentile(dg_rating: number, allRatings: number[]): number {
  const sorted = [...allRatings].sort((a, b) => a - b)
  const idx = sorted.findIndex(r => r >= dg_rating)
  return idx < 0 ? 99 : Math.round((idx / sorted.length) * 100)
}

// ─── Field ────────────────────────────────────────────────────────────────────

/**
 * Current tournament field. TTL: 1 hour.
 */
export async function getFieldUpdate(tour = 'pga'): Promise<FieldUpdate> {
  return dg<FieldUpdate>('/field-updates', { tour }, 60 * 60 * 1000)
}

// ─── Tournament Status ────────────────────────────────────────────────────────

/**
 * Determine the current tournament state. Polls live-tournament-stats for
 * round status. Returns a simplified status object that schedulers use to
 * decide which triggers are eligible.
 *
 * Status values returned:
 *   OFF          — no active tournament (Mon–Wed, or between seasons)
 *   PRE_TOURNAMENT — tournament week but rounds haven't started
 *   LIVE         — a round is actively in progress
 *   POST_R{n}    — round n just completed (trigger window for leaderboard posts)
 *   COMPLETED    — final round completed; tournament over
 *
 * TTL: 2 min during live rounds, 10 min otherwise.
 */
export interface AutopilotTournamentStatus {
  state: 'OFF' | 'PRE_TOURNAMENT' | 'LIVE' | 'POST_R1' | 'POST_R2' | 'POST_R3' | 'COMPLETED'
  eventName: string
  eventId: number
  round: number
  courseName: string
  eventTier: EventTier
  lat?: number
  lng?: number
}

const MAJOR_NAMES = ['masters tournament', 'us open', 'u.s. open', 'the open championship', 'pga championship']
const SIGNATURE_NAMES = [
  'the players championship', 'genesis invitational', 'arnold palmer invitational',
  'the memorial tournament', 'memorial tournament',
]

export function classifyEventTier(eventName: string): EventTier {
  const lower = eventName.toLowerCase()
  if (MAJOR_NAMES.some(m => lower.includes(m))) return 'major'
  if (SIGNATURE_NAMES.some(s => lower.includes(s))) return 'signature'
  return 'standard'
}

export async function getTournamentStatus(): Promise<AutopilotTournamentStatus> {
  try {
    const live = await dg<{
      event_name: string
      event_id?: number
      course_name?: string
      current_round: number
      round_status: string
      tournament_over?: boolean
      lat?: number
      lng?: number
    }>('/preds/live-tournament-stats', { round: 'event' }, 2 * 60 * 1000)

    const { event_name, event_id, course_name, current_round, round_status, tournament_over, lat, lng } = live

    if (!event_name) {
      return { state: 'OFF', eventName: '', eventId: 0, round: 0, courseName: '', eventTier: 'standard' }
    }

    const tier = classifyEventTier(event_name)
    const base = { eventName: event_name, eventId: event_id ?? 0, round: current_round, courseName: course_name ?? '', eventTier: tier, lat, lng }

    if (tournament_over || round_status === 'complete' && current_round >= 4) {
      return { state: 'COMPLETED', ...base }
    }
    if (round_status === 'complete' && current_round === 3) return { state: 'POST_R3', ...base }
    if (round_status === 'complete' && current_round === 2) return { state: 'POST_R2', ...base }
    if (round_status === 'complete' && current_round === 1) return { state: 'POST_R1', ...base }
    if (round_status === 'in_progress') return { state: 'LIVE', ...base }
    return { state: 'PRE_TOURNAMENT', ...base }
  } catch {
    return { state: 'OFF', eventName: '', eventId: 0, round: 0, courseName: '', eventTier: 'standard' }
  }
}

// ─── Live leaderboard ─────────────────────────────────────────────────────────

export async function getLiveTournamentStats(round: 'event' | '1' | '2' | '3' | '4' = 'event'): Promise<{
  eventName: string
  players: LiveTournamentPlayer[]
}> {
  const data = await dg<{
    event_name: string
    last_updated: string
    current_round?: number
    round_status?: string
    players: Array<{
      dg_id: number
      player_name: string
      position: string
      total: number
      today: number
      thru: number
      sg_total?: number
      sg_app?: number
      sg_ott?: number
      sg_arg?: number
      sg_putt?: number
      dg_rating?: number
    }>
  }>('/preds/live-tournament-stats', { stats: 'sg_putt,sg_arg,sg_app,sg_ott,sg_total', round, display: 'value' }, 90 * 1000)

  const nonLivIds = await getNonLivPlayerIds()
  const players = (data.players ?? [])
    .filter(p => nonLivIds.has(p.dg_id))
    .map(p => ({ ...p, player_name: formatPlayerName(p.player_name) }))

  return { eventName: data.event_name ?? '', players }
}

// ─── In-play win probabilities ────────────────────────────────────────────────

export async function getInPlayProbabilities(): Promise<{
  players: InPlayProbabilities[]
  info: InPlayInfo
} | null> {
  const inner = await dg<{ data: InPlayProbabilities[]; info: InPlayInfo }>(
    '/preds/in-play',
    { tour: 'pga', dead_heat: 'no', odds_format: 'percent' },
    90 * 1000
  )

  if (!inner?.data?.length) return null

  const players = inner.data.map(p => ({
    ...p,
    player_name: formatPlayerName(p.player_name),
  }))

  return { players, info: inner.info }
}

// ─── Pre-tournament predictions ───────────────────────────────────────────────

export async function getPreTournamentPredictions(
  model: 'baseline' | 'baseline_history_fit' = 'baseline_history_fit'
): Promise<PreTournamentPrediction[]> {
  const d = await dg<PreTournamentResponse>(
    '/preds/pre-tournament',
    { tour: 'pga', dead_heat: 'no' },
    6 * 60 * 60 * 1000
  )
  const players = d?.[model] ?? d?.baseline ?? []
  return players.sort((a, b) => b.win - a.win)
}

// ─── Course-fit enriched data (computed directly from DataGolf) ──────────────
// Keep COURSE_WEIGHTS in sync with api/server.js COURSE_WEIGHTS

type CourseWeights = { ott: number; app: number; arg: number; putt: number; notes?: string }

const _COURSE_WEIGHTS: Record<string, CourseWeights> = {
  'masters tournament':         { ott: 0.25, app: 0.32, arg: 0.25, putt: 0.18 },
  'pga championship':           { ott: 0.20, app: 0.36, arg: 0.24, putt: 0.20 },
  'u.s. open':                  { ott: 0.18, app: 0.38, arg: 0.26, putt: 0.18 },
  'the open championship':      { ott: 0.30, app: 0.25, arg: 0.25, putt: 0.20 },
  'the players championship':   { ott: 0.15, app: 0.42, arg: 0.18, putt: 0.25 },
  'genesis invitational':       { ott: 0.22, app: 0.32, arg: 0.22, putt: 0.24 },
  'arnold palmer invitational': { ott: 0.20, app: 0.36, arg: 0.20, putt: 0.24 },
  'arnold palmer invitational presented by mastercard': { ott: 0.20, app: 0.36, arg: 0.20, putt: 0.24 },
  'the memorial tournament':    { ott: 0.25, app: 0.30, arg: 0.22, putt: 0.23 },
  'the memorial tournament presented by workday': { ott: 0.25, app: 0.30, arg: 0.22, putt: 0.23 },
  'american express':           { ott: 0.20, app: 0.28, arg: 0.22, putt: 0.30 },
  'at&t pebble beach pro-am':   { ott: 0.20, app: 0.36, arg: 0.22, putt: 0.22 },
  'barbasol championship':      { ott: 0.28, app: 0.28, arg: 0.20, putt: 0.24 },
  'barracuda championship':     { ott: 0.28, app: 0.28, arg: 0.20, putt: 0.24 },
  'bmw championship':           { ott: 0.25, app: 0.30, arg: 0.20, putt: 0.25 },
  'byron nelson':               { ott: 0.22, app: 0.30, arg: 0.22, putt: 0.26 },
  'canadian open':              { ott: 0.28, app: 0.28, arg: 0.20, putt: 0.24 },
  'charles schwab challenge':   { ott: 0.18, app: 0.35, arg: 0.23, putt: 0.24 },
  'cognizant classic':          { ott: 0.22, app: 0.28, arg: 0.20, putt: 0.30 },
  'farmers insurance open':     { ott: 0.30, app: 0.27, arg: 0.20, putt: 0.23 },
  'fedex st. jude championship':{ ott: 0.25, app: 0.30, arg: 0.20, putt: 0.25 },
  'genesis scottish open':      { ott: 0.28, app: 0.26, arg: 0.24, putt: 0.22 },
  'houston open':               { ott: 0.27, app: 0.28, arg: 0.20, putt: 0.25 },
  'john deere classic':         { ott: 0.25, app: 0.27, arg: 0.20, putt: 0.28 },
  'korn ferry challenge':       { ott: 0.25, app: 0.27, arg: 0.22, putt: 0.26 },
  'mexico open at vidanta':     { ott: 0.27, app: 0.30, arg: 0.20, putt: 0.23 },
  'puerto rico open':           { ott: 0.25, app: 0.28, arg: 0.20, putt: 0.27 },
  'rbc canadian open':          { ott: 0.28, app: 0.28, arg: 0.20, putt: 0.24 },
  'rbc heritage':               { ott: 0.14, app: 0.38, arg: 0.26, putt: 0.22 },
  'rocket mortgage classic':    { ott: 0.24, app: 0.24, arg: 0.20, putt: 0.32 },
  'rsm classic':                { ott: 0.22, app: 0.30, arg: 0.22, putt: 0.26 },
  'sanderson farms championship':{ ott: 0.26, app: 0.28, arg: 0.20, putt: 0.26 },
  'the sentry':                 { ott: 0.26, app: 0.26, arg: 0.24, putt: 0.24 },
  "shriners children's open":   { ott: 0.22, app: 0.27, arg: 0.20, putt: 0.31 },
  'sony open in hawaii':        { ott: 0.22, app: 0.30, arg: 0.22, putt: 0.26 },
  'the tour championship':      { ott: 0.25, app: 0.30, arg: 0.20, putt: 0.25 },
  'travelers championship':     { ott: 0.20, app: 0.28, arg: 0.20, putt: 0.32 },
  'truist championship':        { ott: 0.25, app: 0.35, arg: 0.20, putt: 0.20 },
  'wells fargo championship':   { ott: 0.25, app: 0.35, arg: 0.20, putt: 0.20 },
  'wm phoenix open':            { ott: 0.20, app: 0.36, arg: 0.20, putt: 0.24 },
  'wyndham championship':       { ott: 0.20, app: 0.28, arg: 0.22, putt: 0.30 },
  'zozo championship':          { ott: 0.22, app: 0.30, arg: 0.22, putt: 0.26 },
  '3m open':                    { ott: 0.27, app: 0.27, arg: 0.20, putt: 0.26 },
  '_default':                   { ott: 0.25, app: 0.25, arg: 0.25, putt: 0.25 },
}

function _getCourseWeights(eventName: string): CourseWeights & { matched: boolean; match_name: string } {
  const normalized = eventName.toLowerCase().trim()
  if (_COURSE_WEIGHTS[normalized]) return { ..._COURSE_WEIGHTS[normalized], matched: true, match_name: eventName }
  for (const [key, w] of Object.entries(_COURSE_WEIGHTS)) {
    if (key === '_default') continue
    if (normalized.includes(key) || key.includes(normalized)) return { ...w, matched: true, match_name: key }
  }
  return { ..._COURSE_WEIGHTS['_default'], matched: false, match_name: 'Default' }
}

function _computeRawFit(sg_ott: number | null, sg_app: number | null, sg_arg: number | null, sg_putt: number | null, w: CourseWeights): number | null {
  if (sg_app == null) return null
  return w.ott * (sg_ott ?? 0) + w.app * sg_app + w.arg * (sg_arg ?? 0) + w.putt * (sg_putt ?? 0)
}

function _blendForm(l24: number, l12: number | null): number {
  return l12 != null ? l24 * 0.65 + l12 * 0.35 : l24
}

function _normalizeToField<T extends { rawScore: number | null }>(players: T[]): Array<T & { fitScore: number | null }> {
  const valid = players.filter(p => p.rawScore != null)
  if (valid.length === 0) return players.map(p => ({ ...p, fitScore: null }))
  const min = Math.min(...valid.map(p => p.rawScore as number))
  const max = Math.max(...valid.map(p => p.rawScore as number))
  const range = max - min
  return players.map(p => ({
    ...p,
    fitScore: p.rawScore == null ? null : range > 0 ? Math.round((p.rawScore - min) / range * 100) : 50,
  }))
}

export interface CourseFitPlayer {
  rank: number
  dg_id: number
  player_name: string   // "Last, First" format
  fitScore: number      // 0–100 normalized
  percentile: number
  sg_ott?: number
  sg_app?: number
  sg_arg?: number
  sg_putt?: number
  sg_total?: number
}

export interface CourseFitResponse {
  success: boolean
  tournament: {
    event_id: number
    event_name: string
    course: string
    field_size: number
    current_round: number
  }
  course_weights: {
    ott: number; app: number; arg: number; putt: number
    matched: boolean; match_name?: string; notes?: string
  }
  field: CourseFitPlayer[]
}

export async function getCourseFit(): Promise<CourseFitResponse> {
  type SkillPlayer = { dg_id: number; sg_ott?: number; sg_app?: number; sg_arg?: number; sg_putt?: number; sg_total?: number }
  type FieldPlayer = { dg_id: number; player_name: string; country?: string; am?: number }

  const [fieldRaw, l24Raw, l12Raw] = await Promise.all([
    dg<{ event_name: string; event_id?: number; course?: string; course_name?: string; current_round?: number; field: FieldPlayer[] }>(
      '/field-updates', { tour: 'pga' }, 60 * 60 * 1000
    ),
    dg<{ skill_ratings?: SkillPlayer[]; players?: SkillPlayer[] }>(
      '/preds/skill-ratings', { display: 'value' }, 6 * 60 * 60 * 1000
    ),
    dg<{ skill_ratings?: SkillPlayer[]; players?: SkillPlayer[] }>(
      '/preds/skill-ratings', { display: 'value', last_n_rounds: '12' }, 6 * 60 * 60 * 1000
    ).catch(() => null),
  ])

  const eventName = fieldRaw.event_name ?? ''
  const weights   = _getCourseWeights(eventName)
  const field     = fieldRaw.field ?? []

  const l24Map = new Map<number, SkillPlayer>()
  const l12Map = new Map<number, SkillPlayer>()
  ;(l24Raw.skill_ratings ?? l24Raw.players ?? []).forEach(p => l24Map.set(p.dg_id, p))
  if (l12Raw) {
    const l12Players = l12Raw.skill_ratings ?? l12Raw.players ?? []
    // Skip if DataGolf returned identical L24 data (ignored the period param)
    const sample = l12Players.slice(0, 5)
    const isDuplicate = sample.length > 0 && sample.every(p12 => {
      const p24 = l24Map.get(p12.dg_id)
      return p24 && p24.sg_total != null && p12.sg_total != null && Math.abs((p24.sg_total ?? 0) - (p12.sg_total ?? 0)) < 0.001
    })
    if (!isDuplicate) l12Players.forEach(p => l12Map.set(p.dg_id, p))
  }

  const withRaw = field.map(fp => {
    const l24 = l24Map.get(fp.dg_id)
    const l12 = l12Map.get(fp.dg_id)
    const l24Score = l24 ? _computeRawFit(l24.sg_ott ?? null, l24.sg_app ?? null, l24.sg_arg ?? null, l24.sg_putt ?? null, weights) : null
    const l12Score = l12 ? _computeRawFit(l12.sg_ott ?? null, l12.sg_app ?? null, l12.sg_arg ?? null, l12.sg_putt ?? null, weights) : null
    const rawScore = l24Score != null ? _blendForm(l24Score, l12Score) : null
    return {
      dg_id:    fp.dg_id,
      player_name: fp.player_name,
      rawScore,
      sg_ott:   l24?.sg_ott  != null ? +l24.sg_ott.toFixed(3)  : undefined,
      sg_app:   l24?.sg_app  != null ? +l24.sg_app.toFixed(3)  : undefined,
      sg_arg:   l24?.sg_arg  != null ? +l24.sg_arg.toFixed(3)  : undefined,
      sg_putt:  l24?.sg_putt != null ? +l24.sg_putt.toFixed(3) : undefined,
      sg_total: l24?.sg_total != null ? +l24.sg_total.toFixed(3): undefined,
    }
  })

  const nonLivIds = await getNonLivPlayerIds()
  const normalized = _normalizeToField(withRaw)
    .filter(p => nonLivIds.has(p.dg_id))
    .sort((a, b) => {
      if (b.fitScore != null && a.fitScore != null) return b.fitScore - a.fitScore
      if (b.fitScore != null) return 1
      if (a.fitScore != null) return -1
      return 0
    })
    .map((p, i) => ({
      rank:        i + 1,
      dg_id:       p.dg_id,
      player_name: p.player_name,
      fitScore:    p.fitScore ?? 0,
      percentile:  p.fitScore != null ? Math.round(100 - (i / withRaw.length) * 100) : 0,
      sg_ott:      p.sg_ott,
      sg_app:      p.sg_app,
      sg_arg:      p.sg_arg,
      sg_putt:     p.sg_putt,
      sg_total:    p.sg_total,
    }))

  return {
    success: true,
    tournament: {
      event_id:      fieldRaw.event_id ?? 0,
      event_name:    eventName,
      course:        fieldRaw.course ?? fieldRaw.course_name ?? '',
      field_size:    field.length,
      current_round: fieldRaw.current_round ?? 0,
    },
    course_weights: { ott: weights.ott, app: weights.app, arg: weights.arg, putt: weights.putt, matched: weights.matched, match_name: weights.match_name },
    field: normalized,
  }
}

/**
 * Joined model-picks data: pre-tournament predictions enriched with course-fit scores.
 * Sorted by combined score (60% win probability rank + 40% course-fit rank).
 * Returns the best candidates for the weekly model-picks card.
 */
export async function getModelPickCandidates(): Promise<Array<{
  dg_id: number
  playerName: string        // display name "First Last"
  winPct: number            // 0–1
  top10Pct: number          // 0–1
  fitScore: number          // 0–100
  fitRank: number           // 1 = best fit
  winRank: number           // 1 = highest win probability
  combinedRank: number      // lower = better overall candidate
  sgApp?: number
  sgPutt?: number
  sgOtt?: number
  sgArg?: number
}>> {
  const [preTour, cfData] = await Promise.all([
    getPreTournamentPredictions('baseline_history_fit'),
    getCourseFit(),
  ])

  const fitMap = new Map(cfData.field.map(p => [p.dg_id, p]))

  // Only include players in the current field
  const fieldIds = new Set(cfData.field.map(p => p.dg_id))
  const inField = preTour.filter(p => fieldIds.has(p.dg_id))

  // Assign win rank (already sorted by win probability descending)
  const withRanks = inField.map((p, winIdx) => {
    const fit = fitMap.get(p.dg_id)
    return {
      dg_id:        p.dg_id,
      playerName:   formatPlayerName(p.player_name),
      winPct:       p.win,
      top10Pct:     p.top_10,
      fitScore:     fit?.fitScore ?? 0,
      fitRank:      fit?.rank ?? 999,
      winRank:      winIdx + 1,
      combinedRank: 0,  // filled below
      sgApp:        fit?.sg_app,
      sgPutt:       fit?.sg_putt,
      sgOtt:        fit?.sg_ott,
      sgArg:        fit?.sg_arg,
    }
  })

  // Combined rank: 60% win probability + 40% course fit
  withRanks.forEach(p => {
    p.combinedRank = Math.round(0.6 * p.winRank + 0.4 * p.fitRank)
  })

  return withRanks.sort((a, b) => a.combinedRank - b.combinedRank)
}

// ─── Outrights (betting odds) ─────────────────────────────────────────────────

export interface OutrightOdds {
  dg_id: number
  player_name: string     // "Last, First" format
  datagolf?: { baseline?: string; baseline_history_fit?: string }
  draftkings?: string
  fanduel?: string
  bet365?: string
  caesars?: string
  betmgm?: string
  pinnacle?: string
  [book: string]: unknown
}

/**
 * Current outright odds from all books + DataGolf model fair values.
 * TTL: 10 min — books update during play, less so pre-tournament.
 */
export async function getOutrightOdds(
  market: 'win' | 'top_5' | 'top_10' | 'top_20' = 'win'
): Promise<OutrightOdds[]> {
  const data = await dg<{ odds: OutrightOdds[] }>(
    '/betting-tools/outrights',
    { tour: 'pga', market, odds_format: 'american' },
    10 * 60 * 1000
  )
  return data.odds ?? []
}

// ─── Schedule ─────────────────────────────────────────────────────────────────

/**
 * Full PGA Tour schedule for the current season. TTL: 12h.
 */
export async function getSchedule(season = new Date().getFullYear()): Promise<ScheduleEvent[]> {
  const data = await dg<{ schedule: ScheduleEvent[] }>(
    '/get-schedule',
    { tour: 'pga', season: String(season) },
    12 * 60 * 60 * 1000
  )
  return data.schedule ?? []
}

/**
 * Find the upcoming event (nearest future start date).
 */
export async function getUpcomingEvent(): Promise<ScheduleEvent | null> {
  const schedule = await getSchedule()
  const now = new Date()
  const upcoming = schedule
    .filter(e => new Date(e.start_date) >= now || e.status === 'in_progress')
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
  return upcoming[0] ?? null
}

// ─── Approach skill breakdown ─────────────────────────────────────────────────

export interface ApproachSkillPlayer {
  dg_id: number
  player_name: string
  sg_app_100_125?: number
  sg_app_125_150?: number
  sg_app_150_175?: number
  sg_app_175_200?: number
  sg_app_200_plus?: number
}

/**
 * SG: Approach broken into distance buckets. TTL: 6h.
 */
export async function getApproachSkill(): Promise<ApproachSkillPlayer[]> {
  const data = await dg<{ players: ApproachSkillPlayer[] }>(
    '/preds/approach-skill',
    { tour: 'pga' },
    6 * 60 * 60 * 1000
  )
  return data.players ?? []
}

// ─── Cut line helpers ─────────────────────────────────────────────────────────

/**
 * From a live leaderboard, estimate the projected cut line.
 * DataGolf doesn't expose a cut-line endpoint directly — we derive it
 * from the score distribution of the field.
 *
 * Standard PGA Tour cuts: top 65 + ties after R2.
 */
export function estimateCutLine(
  players: LiveTournamentPlayer[],
  cutSize = 65
): { cutLine: number; bubblePlayers: LiveTournamentPlayer[] } {
  const active = players.filter(p => typeof p.total === 'number' && !isNaN(p.total))
  const sorted = [...active].sort((a, b) => a.total - b.total)
  const cutIdx = Math.min(cutSize - 1, sorted.length - 1)
  const cutLine = sorted[cutIdx]?.total ?? 0

  const bubblePlayers = active.filter(
    p => p.total >= cutLine - 1 && p.total <= cutLine + 1
  )

  return { cutLine, bubblePlayers }
}

// ─── Mid-round mover detection ────────────────────────────────────────────────

/**
 * Detect the most notable position mover since the previous snapshot.
 * Returns the player who moved the most positions (downward = rising).
 * Position string is parsed via parsePosition().
 *
 * `threshold`: minimum positions moved to qualify.
 */
export function detectMidRoundMover(
  current: LiveTournamentPlayer[],
  previous: LiveTournamentPlayer[],
  threshold = 5
): { player: LiveTournamentPlayer; positionStart: number; positionNow: number } | null {
  const prevMap = new Map(previous.map(p => [p.dg_id, parsePosition(p.position)]))
  let best: { player: LiveTournamentPlayer; positionStart: number; positionNow: number } | null = null
  let bestMove = 0

  for (const player of current) {
    const now = parsePosition(player.position)
    const was = prevMap.get(player.dg_id)
    if (was == null || now >= 900) continue  // skip cuts/WDs

    const move = was - now  // positive = moved up
    if (move >= threshold && move > bestMove) {
      bestMove = move
      best = { player, positionStart: was, positionNow: now }
    }
  }

  return best
}

function parsePosition(pos: string): number {
  if (!pos) return 999
  const s = String(pos).replace(/^[Tt]/, '').trim()
  const n = parseInt(s)
  return isNaN(n) ? 999 : n
}

// ─── Comparison spotlight selection ──────────────────────────────────────────

/**
 * Find two players worth comparing — high DG rating, contrasting performances.
 * Criteria (from TRIGGERS.md):
 *   - Both in top 30 by DG rating
 *   - Score gap >= 4 shots, OR same tier but opposite ends
 */
export function selectComparisonPair(
  players: LiveTournamentPlayer[],
  rankings: DGRankingPlayer[]
): [LiveTournamentPlayer, LiveTournamentPlayer] | null {
  const ratingMap = new Map(rankings.map(r => [r.dg_id, r.dg_rating]))
  const sorted = [...rankings].sort((a, b) => b.dg_rating - a.dg_rating)
  const top30Ids = new Set(sorted.slice(0, 30).map(r => r.dg_id))

  const eligible = players
    .filter(p => top30Ids.has(p.dg_id) && typeof p.total === 'number' && !isNaN(p.total))
    .sort((a, b) => a.total - b.total)

  if (eligible.length < 2) return null

  // Try to find the pair with the largest score gap
  let bestPair: [LiveTournamentPlayer, LiveTournamentPlayer] | null = null
  let bestGap = 0

  for (let i = 0; i < eligible.length - 1; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const gap = Math.abs(eligible[i].total - eligible[j].total)
      if (gap >= 4 && gap > bestGap) {
        bestGap = gap
        bestPair = [eligible[i], eligible[j]]
      }
    }
  }

  // Same tier, opposite ends fallback
  if (!bestPair && eligible.length >= 2) {
    const rA = ratingMap.get(eligible[0].dg_id) ?? 0
    const rB = ratingMap.get(eligible[eligible.length - 1].dg_id) ?? 0
    const tier = (r: number) => (r > 150 ? 'elite' : r > 120 ? 'top' : 'field')
    if (tier(rA) === tier(rB)) {
      bestPair = [eligible[0], eligible[eligible.length - 1]]
    }
  }

  return bestPair
}

// ─── Course coordinate lookup ─────────────────────────────────────────────────
// Used by weather.ts to fetch Tomorrow.io forecasts.

export const COURSE_COORDS: Record<string, { lat: number; lng: number; key: string }> = {
  'augusta national':         { lat: 33.5032, lng: -82.0199, key: 'augusta-national' },
  'pebble beach':             { lat: 36.5680, lng: -121.9498, key: 'pebble-beach' },
  'torrey pines':             { lat: 32.8993, lng: -117.2522, key: 'torrey-pines' },
  'tpc sawgrass':             { lat: 30.1972, lng: -81.3948, key: 'tpc-sawgrass' },
  'tpc scottsdale':           { lat: 33.6597, lng: -111.8998, key: 'tpc-scottsdale' },
  'riviera':                  { lat: 34.0437, lng: -118.5103, key: 'riviera' },
  'bay hill':                 { lat: 28.5242, lng: -81.4931, key: 'bay-hill' },
  'muirfield village':        { lat: 40.1617, lng: -83.0637, key: 'muirfield-village' },
  'quail hollow':             { lat: 35.1595, lng: -80.8592, key: 'quail-hollow' },
  'colonial':                 { lat: 32.7271, lng: -97.3615, key: 'colonial' },
  'harbour town':             { lat: 32.1358, lng: -80.8074, key: 'harbour-town' },
  'tpc river highlands':      { lat: 41.5823, lng: -72.6932, key: 'tpc-river-highlands' },
  'tpc summerlin':            { lat: 36.2045, lng: -115.3099, key: 'tpc-summerlin' },
  'detroit golf club':        { lat: 42.4053, lng: -83.1121, key: 'detroit-golf-club' },
  'sedgefield':               { lat: 36.0576, lng: -79.9280, key: 'sedgefield' },
  'east lake':                { lat: 33.7226, lng: -84.3105, key: 'east-lake' },
  'tpc twin cities':          { lat: 44.9847, lng: -93.4780, key: 'tpc-twin-cities' },
  'tpc craig ranch':          { lat: 33.1979, lng: -96.6959, key: 'tpc-craig-ranch' },
  'kapalua':                  { lat: 20.9993, lng: -156.6750, key: 'kapalua' },
  'waialae':                  { lat: 21.2831, lng: -157.7914, key: 'waialae' },
  'memorial park':            { lat: 29.7660, lng: -95.4324, key: 'memorial-park' },
  'sea island':               { lat: 31.1841, lng: -81.3979, key: 'sea-island' },
  'tpc deere run':            { lat: 41.5490, lng: -90.5488, key: 'tpc-deere-run' },
  'pga national':             { lat: 26.8393, lng: -80.1136, key: 'pga-national' },
  'la quinta':                { lat: 33.6631, lng: -116.3100, key: 'la-quinta' },
  'vidanta':                  { lat: 20.6534, lng: -105.2297, key: 'vidanta' },
  'tpc southwind':            { lat: 35.0451, lng: -89.9165, key: 'tpc-southwind' },
  'tpc toronto':              { lat: 43.8561, lng: -79.6354, key: 'tpc-toronto' },
  'shinnecock hills':         { lat: 40.8846, lng: -72.4607, key: 'shinnecock-hills' },
  'aronimink':                { lat: 39.9596, lng: -75.3866, key: 'aronimink' },
}

/** Best-effort course coordinate lookup from a course name string. */
export function lookupCourseCoords(courseName: string): { lat: number; lng: number; key: string } | null {
  const lower = courseName.toLowerCase()
  for (const [key, coords] of Object.entries(COURSE_COORDS)) {
    if (lower.includes(key) || key.includes(lower)) return coords
  }
  return null
}
