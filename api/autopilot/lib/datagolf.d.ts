/**
 * DataGolf API client for the autopilot pipeline.
 * All fetch logic mirrors server.js patterns but is typed and self-contained.
 * Never call this file's functions from server.js — extend there if needed.
 * Rate limit: 45 req/min across ALL endpoints. Exceeding triggers 5-min suspension.
 */
import type { EventTier } from './types';
export interface DGPlayer {
    dg_id: number;
    player_name: string;
    primary_tour?: string;
}
export interface DGRankingPlayer extends DGPlayer {
    dg_id: number;
    player_name: string;
    primary_tour: string;
    datagolf_rank: number;
    dg_skill_estimate: number;
    dg_rating: number;
    owgr_rank?: number;
    am?: number;
    country?: string;
    sg_ott?: number;
    sg_app?: number;
    sg_arg?: number;
    sg_putt?: number;
    sg_t2g?: number;
    sg_total?: number;
    sg_ott_l12?: number;
    sg_app_l12?: number;
    sg_arg_l12?: number;
    sg_putt_l12?: number;
    sg_ott_l24?: number;
    sg_app_l24?: number;
    sg_arg_l24?: number;
    sg_putt_l24?: number;
}
export interface LiveTournamentPlayer {
    dg_id: number;
    player_name: string;
    position: string;
    total: number;
    today: number;
    thru: number;
    sg_total?: number;
    sg_app?: number;
    sg_ott?: number;
    sg_arg?: number;
    sg_putt?: number;
    dg_rating?: number;
}
/**
 * Convert DataGolf "Last, First" name format to display "First Last".
 * Handles multi-word first/last names correctly (e.g. "Van Rooyen, Erik" → "Erik Van Rooyen").
 * If name doesn't contain ", " it's returned as-is.
 */
export declare function formatPlayerName(name: string): string;
export interface InPlayProbabilities {
    dg_id: number;
    player_name: string;
    win: number;
    top_5: number;
    top_10: number;
    top_20: number;
    make_cut: number;
    current_pos?: string;
    current_score?: number;
    today?: number;
    thru?: number;
    round?: number;
    R1?: number;
    R2?: number;
    R3?: number;
    R4?: number;
}
export interface InPlayInfo {
    event_name: string;
    current_round: number;
    dead_heat_rules: string;
    last_update: string;
}
export interface TournamentStatus {
    event_name: string;
    event_id: number;
    tour: string;
    round: number;
    round_status: 'not_started' | 'in_progress' | 'complete';
    tournament_status: 'not_started' | 'in_progress' | 'complete';
    course_name?: string;
    current_season: number;
}
export interface PreTournamentPrediction {
    dg_id: number;
    player_name: string;
    am?: number;
    country?: string;
    sample_size?: number;
    win: number;
    top_5: number;
    top_10: number;
    top_20: number;
    make_cut: number;
}
export interface PreTournamentResponse {
    event_name: string;
    last_updated: string;
    dead_heats: string;
    models_available: string[];
    baseline: PreTournamentPrediction[];
    baseline_history_fit: PreTournamentPrediction[];
}
export interface ScheduleEvent {
    event_id: number;
    event_name: string;
    tour: string;
    course: string;
    start_date: string;
    end_date: string;
    status: 'completed' | 'upcoming' | 'in_progress';
    lat?: number;
    lng?: number;
}
export interface FieldUpdatePlayer extends DGPlayer {
    dg_id: number;
    player_name: string;
    am: number;
    country: string;
    dg_rating: number;
}
export interface FieldUpdate {
    event_name: string;
    event_id: number;
    course: string;
    field: FieldUpdatePlayer[];
}
/**
 * Full DG rankings. Routes through the Vercel proxy (24h cache).
 * Proxy endpoint: /api/rankings — returns { data: { rankings: [...] } }
 */
export declare function getRankings(): Promise<DGRankingPlayer[]>;
export declare function getNonLivPlayerIds(): Promise<Set<number>>;
/** Lookup a player's DG rating percentile within the given ranking set. */
export declare function dgRatingPercentile(dg_rating: number, allRatings: number[]): number;
/**
 * Current tournament field. TTL: 1 hour.
 */
export declare function getFieldUpdate(tour?: string): Promise<FieldUpdate>;
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
    state: 'OFF' | 'PRE_TOURNAMENT' | 'LIVE' | 'POST_R1' | 'POST_R2' | 'POST_R3' | 'COMPLETED';
    eventName: string;
    eventId: number;
    round: number;
    courseName: string;
    eventTier: EventTier;
    lat?: number;
    lng?: number;
}
export declare function classifyEventTier(eventName: string): EventTier;
export declare function getTournamentStatus(): Promise<AutopilotTournamentStatus>;
/**
 * Live player stats. Routes through the Vercel proxy to share the cached response.
 * Proxy endpoint: /api/live-stats?round=event (wraps /preds/live-tournament-stats)
 */
export declare function getLiveTournamentStats(round?: 'event' | '1' | '2' | '3' | '4'): Promise<{
    eventName: string;
    players: LiveTournamentPlayer[];
}>;
/**
 * Live win / top-5/10/20 / make-cut probabilities. Routes through the Vercel proxy.
 * Proxy endpoint: /api/live-tournament (wraps /preds/in-play)
 * Response structure: { data: { data: [...players], info: {...} } }
 */
export declare function getInPlayProbabilities(): Promise<{
    players: InPlayProbabilities[];
    info: InPlayInfo;
} | null>;
/**
 * Pre-tournament win/top-X probabilities. Routes through the Vercel proxy.
 * Proxy endpoint: /api/pre-tournament (wraps /preds/pre-tournament, 6h cache)
 * Response: { success, fromCache, data: { baseline: [...], baseline_history_fit: [...] } }
 */
export declare function getPreTournamentPredictions(model?: 'baseline' | 'baseline_history_fit'): Promise<PreTournamentPrediction[]>;
export interface CourseFitPlayer {
    rank: number;
    dg_id: number;
    player_name: string;
    fitScore: number;
    percentile: number;
    sg_ott?: number;
    sg_app?: number;
    sg_arg?: number;
    sg_putt?: number;
    sg_total?: number;
}
export interface CourseFitResponse {
    success: boolean;
    tournament: {
        event_id: number;
        event_name: string;
        course: string;
        field_size: number;
        current_round: number;
    };
    course_weights: {
        ott: number;
        app: number;
        arg: number;
        putt: number;
        matched: boolean;
        match_name?: string;
        notes?: string;
    };
    field: CourseFitPlayer[];
}
/**
 * Fetch course-fit scores via the divotlab-api proxy.
 * This already normalizes to 0–100 and sorts by fit rank.
 * Uses the proxy rather than DataGolf directly to avoid burning API quota.
 */
export declare function getCourseFit(): Promise<CourseFitResponse>;
/**
 * Joined model-picks data: pre-tournament predictions enriched with course-fit scores.
 * Sorted by combined score (60% win probability rank + 40% course-fit rank).
 * Returns the best candidates for the weekly model-picks card.
 */
export declare function getModelPickCandidates(): Promise<Array<{
    dg_id: number;
    playerName: string;
    winPct: number;
    top10Pct: number;
    fitScore: number;
    fitRank: number;
    winRank: number;
    combinedRank: number;
    sgApp?: number;
    sgPutt?: number;
    sgOtt?: number;
    sgArg?: number;
}>>;
export interface OutrightOdds {
    dg_id: number;
    player_name: string;
    datagolf?: {
        baseline?: string;
        baseline_history_fit?: string;
    };
    draftkings?: string;
    fanduel?: string;
    bet365?: string;
    caesars?: string;
    betmgm?: string;
    pinnacle?: string;
    [book: string]: unknown;
}
/**
 * Current outright odds from all books + DataGolf model fair values.
 * TTL: 10 min — books update during play, less so pre-tournament.
 */
export declare function getOutrightOdds(market?: 'win' | 'top_5' | 'top_10' | 'top_20'): Promise<OutrightOdds[]>;
/**
 * Full PGA Tour schedule for the current season. TTL: 12h.
 */
export declare function getSchedule(season?: number): Promise<ScheduleEvent[]>;
/**
 * Find the upcoming event (nearest future start date).
 */
export declare function getUpcomingEvent(): Promise<ScheduleEvent | null>;
export interface ApproachSkillPlayer {
    dg_id: number;
    player_name: string;
    sg_app_100_125?: number;
    sg_app_125_150?: number;
    sg_app_150_175?: number;
    sg_app_175_200?: number;
    sg_app_200_plus?: number;
}
/**
 * SG: Approach broken into distance buckets. TTL: 6h.
 */
export declare function getApproachSkill(): Promise<ApproachSkillPlayer[]>;
/**
 * From a live leaderboard, estimate the projected cut line.
 * DataGolf doesn't expose a cut-line endpoint directly — we derive it
 * from the score distribution of the field.
 *
 * Standard PGA Tour cuts: top 65 + ties after R2.
 */
export declare function estimateCutLine(players: LiveTournamentPlayer[], cutSize?: number): {
    cutLine: number;
    bubblePlayers: LiveTournamentPlayer[];
};
/**
 * Detect the most notable position mover since the previous snapshot.
 * Returns the player who moved the most positions (downward = rising).
 * Position string is parsed via parsePosition().
 *
 * `threshold`: minimum positions moved to qualify.
 */
export declare function detectMidRoundMover(current: LiveTournamentPlayer[], previous: LiveTournamentPlayer[], threshold?: number): {
    player: LiveTournamentPlayer;
    positionStart: number;
    positionNow: number;
} | null;
/**
 * Find two players worth comparing — high DG rating, contrasting performances.
 * Criteria (from TRIGGERS.md):
 *   - Both in top 30 by DG rating
 *   - Score gap >= 4 shots, OR same tier but opposite ends
 */
export declare function selectComparisonPair(players: LiveTournamentPlayer[], rankings: DGRankingPlayer[]): [LiveTournamentPlayer, LiveTournamentPlayer] | null;
export declare const COURSE_COORDS: Record<string, {
    lat: number;
    lng: number;
    key: string;
}>;
/** Best-effort course coordinate lookup from a course name string. */
export declare function lookupCourseCoords(courseName: string): {
    lat: number;
    lng: number;
    key: string;
} | null;
//# sourceMappingURL=datagolf.d.ts.map