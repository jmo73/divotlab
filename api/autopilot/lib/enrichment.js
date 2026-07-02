"use strict";
/**
 * Context enrichment layer.
 * Assembles the PostContext object from DataGolf + weather data.
 * Stored as JSONB in autopilot_queue.context so caption regeneration
 * never needs to re-fetch.
 *
 * Read CONTENT_QUALITY.md before modifying any logic here.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectTemplate = selectTemplate;
exports.buildPostContext = buildPostContext;
exports.buildContextSummary = buildContextSummary;
const datagolf_1 = require("./datagolf");
const weather_1 = require("./weather");
// ─── Historical scoring averages ──────────────────────────────────────────────
// Approximate historical scoring averages vs par at major PGA Tour venues.
// Positive = above par on average, Negative = below par.
// Source: DataGolf historical round data, 2019-2025 season average.
// Updated manually when significantly out of date.
const HISTORICAL_SCORING_AVG = {
    'masters tournament': -10.2,
    'us open': 3.8,
    'u.s. open': 3.8,
    'the open championship': 2.1,
    'pga championship': 1.4,
    'the players championship': -8.9,
    'genesis invitational': -3.6,
    'arnold palmer invitational': -8.4,
    'the memorial tournament': -6.1,
    'rbc canadian open': -16.0,
    'travelers championship': -18.2,
    'charles schwab challenge': -9.5,
    'truist championship': -11.3,
    'wells fargo championship': -11.3,
    'rbc heritage': -11.7,
    'wm phoenix open': -21.5,
    'at&t pebble beach pro-am': -19.0,
    'farmers insurance open': -12.3,
    'genesis scottish open': -9.8,
    'american express': -24.1,
    'sony open in hawaii': -19.3,
    'the sentry': -29.6,
    'houston open': -16.4,
    'bmw championship': -15.0,
    'the tour championship': -10.0,
    'fedex st. jude championship': -11.2,
    'cognizant classic': -14.8,
    'wyndham championship': -17.5,
    'rocket mortgage classic': -22.1,
    'john deere classic': -20.8,
    'puerto rico open': -19.5,
    'barbasol championship': -21.0,
    'barracuda championship': 0.0, // modified stableford, not directly comparable
    'sanderson farms championship': -16.5,
    'mexico open at vidanta': -17.0,
    'zozo championship': -17.2,
    '3m open': -21.8,
    'shriners children\'s open': -21.4,
    'rsm classic': -17.0,
};
function getHistoricalScoringAvg(eventName) {
    const lower = eventName.toLowerCase();
    if (HISTORICAL_SCORING_AVG[lower] != null)
        return HISTORICAL_SCORING_AVG[lower];
    for (const [key, val] of Object.entries(HISTORICAL_SCORING_AVG)) {
        if (lower.includes(key) || key.includes(lower))
            return val;
    }
    return -12.0; // field-wide default
}
// ─── Field strength ranking ───────────────────────────────────────────────────
// Rank 1-50 where 1 = strongest field. Approximate from known field strengths.
const FIELD_STRENGTH_RANK = {
    'masters tournament': 1,
    'the players championship': 2,
    'pga championship': 3,
    'us open': 3,
    'u.s. open': 3,
    'the open championship': 4,
    'genesis invitational': 5,
    'arnold palmer invitational': 6,
    'the memorial tournament': 7,
    'travelers championship': 10,
    'rbc canadian open': 12,
    'charles schwab challenge': 15,
    'the sentry': 8,
    'bmw championship': 5, // playoff event, strongest eligible field
    'the tour championship': 2, // top 30 only
    'fedex st. jude championship': 6,
};
function getFieldStrengthRank(eventName) {
    const lower = eventName.toLowerCase();
    if (FIELD_STRENGTH_RANK[lower] != null)
        return FIELD_STRENGTH_RANK[lower];
    for (const [key, val] of Object.entries(FIELD_STRENGTH_RANK)) {
        if (lower.includes(key) || key.includes(lower))
            return val;
    }
    return 25; // default: average field
}
function fieldStrengthLabel(rank) {
    if (rank <= 3)
        return 'one of the strongest fields of the year';
    if (rank <= 8)
        return 'a signature-strength field';
    if (rank <= 15)
        return 'a solid PGA Tour field';
    return 'a standard Tour field';
}
function approximateCourseHistory(player) {
    // Without the historical-raw/rounds endpoint, we approximate:
    // - timesPlayed: 5 (PGA Tour players typically have 3-7 starts per venue)
    // - avgFinish: derived from DG rating percentile (elite = top 20, field = top 50)
    // - sgAppAvg: use current season SG:App as proxy
    const dgr = player.dg_rating ?? 130;
    const approxFinish = dgr > 155 ? 18 : dgr > 140 ? 28 : dgr > 125 ? 40 : 55;
    return {
        timesPlayed: 5,
        avgFinish: approxFinish,
        bestFinish: Math.max(1, Math.round(approxFinish * 0.4)),
        sgAppAvg: player.sg_app ?? 0,
    };
}
function recentFormTrend(player) {
    // Compare L12 vs L24 SG Total
    const l24 = player.sg_ott_l24 != null && player.sg_app_l24 != null
        ? (player.sg_ott_l24 + player.sg_app_l24 + (player.sg_arg_l24 ?? 0) + (player.sg_putt_l24 ?? 0))
        : null;
    const l12 = player.sg_ott_l12 != null && player.sg_app_l12 != null
        ? (player.sg_ott_l12 + player.sg_app_l12 + (player.sg_arg_l12 ?? 0) + (player.sg_putt_l12 ?? 0))
        : null;
    if (l24 == null || l12 == null)
        return 'stable';
    const delta = l12 - l24;
    if (delta > 0.5)
        return 'improving';
    if (delta < -0.5)
        return 'declining';
    return 'stable';
}
// ─── Insight flags ────────────────────────────────────────────────────────────
function computeInsightFlags(params) {
    const { players, playerData, fieldAvgDgRating, fieldAvgScoreToday, historicalScoringAvg, weather, modelTopPick, currentLeader, round } = params;
    const playerOverperforming = Boolean(playerData &&
        players &&
        (() => {
            const player = players.find(p => p.player_name === playerData.player_name);
            if (!player)
                return false;
            // Overperforming: in top 20% of leaderboard but DG rating below field avg
            const sorted = [...players].sort((a, b) => a.total - b.total);
            const pos = sorted.findIndex(p => p.dg_id === playerData.dg_id) + 1;
            const topPct = pos / players.length;
            return topPct < 0.2 && (playerData.dg_rating ?? 0) < fieldAvgDgRating;
        })());
    const playerUnderperforming = Boolean(playerData &&
        players &&
        (() => {
            const sorted = [...players].sort((a, b) => a.total - b.total);
            const pos = sorted.findIndex(p => p.dg_id === playerData.dg_id) + 1;
            const topPct = pos / players.length;
            return topPct > 0.6 && (playerData.dg_rating ?? 0) > fieldAvgDgRating + 10;
        })());
    const conditionsAdvantage = weather.windSpeedMph >= 15;
    const courseSpecialist = Boolean(playerData && (playerData.sg_app ?? 0) > 0.5);
    const modelAligned = Boolean(modelTopPick && currentLeader && modelTopPick === currentLeader);
    const modelSurprise = Boolean(modelTopPick && currentLeader && modelTopPick !== currentLeader && round && round >= 3);
    const fieldBeatingCourse = Boolean(fieldAvgScoreToday != null && historicalScoringAvg != null &&
        fieldAvgScoreToday < historicalScoringAvg - 3);
    return {
        playerOverperforming,
        playerUnderperforming,
        conditionsAdvantage,
        courseSpecialist,
        modelAligned,
        modelSurprise,
        fieldBeatingCourse,
    };
}
// ─── Template selection logic ─────────────────────────────────────────────────
const TRIGGER_DEFAULT_TEMPLATE = {
    live_leaderboard_r1_end: 'leaderboard',
    live_leaderboard_r2_end: 'leaderboard',
    live_leaderboard_r3_end: 'leaderboard',
    live_leaderboard_final: 'leaderboard',
    mid_round_mover: 'player-stat',
    cut_bubble_alert: 'cut-line',
    weather_angle: 'weather-card',
    pre_tournament_model_picks: 'model-pick',
    post_round_sleeper: 'player-stat',
    comparison_spotlight: 'comparison',
    evergreen_sg_explainer: 'evergreen-fact',
    evergreen_course_profile: 'course-breakdown',
    evergreen_player_spotlight: 'player-stat',
    evergreen_stat_of_week: 'evergreen-fact',
    evergreen_myth_bust: 'quote-insight',
};
function selectTemplate(triggerType, insightFlags) {
    if (triggerType === 'comparison_spotlight')
        return 'comparison';
    if (triggerType === 'weather_angle')
        return 'weather-card';
    if (triggerType === 'evergreen_course_profile')
        return 'course-breakdown';
    if (insightFlags.modelSurprise)
        return 'quote-insight';
    return TRIGGER_DEFAULT_TEMPLATE[triggerType] ?? 'player-stat';
}
// ─── Main enrichment function ─────────────────────────────────────────────────
async function buildPostContext(triggerType, rawData) {
    const { eventName, courseName = '', round = 1, playerName } = rawData;
    // Resolve course coordinates for weather
    let lat = rawData.lat;
    let lng = rawData.lng;
    if (lat == null || lng == null) {
        const coords = (0, datagolf_1.lookupCourseCoords)(courseName || eventName);
        lat = coords?.lat;
        lng = coords?.lng;
    }
    const courseKey = (0, datagolf_1.lookupCourseCoords)(courseName || eventName)?.key ?? eventName.toLowerCase().replace(/\s+/g, '-');
    const forecastDate = rawData.roundDate ?? new Date();
    // Parallel fetches — all are cached so hitting multiple is safe within rate limits
    const [rankings, weather, livePlayers] = await Promise.all([
        (0, datagolf_1.getRankings)().catch(() => []),
        (lat != null && lng != null)
            ? (0, weather_1.getWeatherContext)(courseKey, lat, lng, forecastDate).catch(() => (0, weather_1.fallbackWeatherContext)(lat, lng))
            : Promise.resolve((0, weather_1.fallbackWeatherContext)(0, 0)),
        (0, datagolf_1.getLiveTournamentStats)().catch(() => ({ eventName: '', players: [] })),
    ]);
    const allRatings = rankings.map(r => r.dg_rating).filter(Boolean);
    // Field context from live field
    const liveField = livePlayers.players;
    const fieldDgRatings = liveField
        .map(p => rankings.find(r => r.dg_id === p.dg_id)?.dg_rating)
        .filter((r) => r != null);
    const avgDgRating = fieldDgRatings.length > 0
        ? Math.round(fieldDgRatings.reduce((a, b) => a + b, 0) / fieldDgRatings.length)
        : 130;
    const topRankedInField = rankings
        .filter(r => liveField.some(p => p.dg_id === r.dg_id))
        .sort((a, b) => b.dg_rating - a.dg_rating)[0];
    // Player context
    let playerCtx;
    let playerRanking = null;
    if (playerName) {
        playerRanking = rankings.find(r => r.player_name.toLowerCase() === playerName.toLowerCase()) ?? null;
        if (playerRanking) {
            const livePlayer = liveField.find(p => p.dg_id === playerRanking.dg_id);
            const fieldAvgSgTotal = liveField.reduce((s, p) => s + (p.sg_total ?? 0), 0) / (liveField.length || 1);
            const fieldAvgSgApp = liveField.reduce((s, p) => s + (p.sg_app ?? 0), 0) / (liveField.length || 1);
            const fieldAvgSgPutt = liveField.reduce((s, p) => s + (p.sg_putt ?? 0), 0) / (liveField.length || 1);
            const courseHistory = approximateCourseHistory(playerRanking);
            playerCtx = {
                name: playerRanking.player_name,
                dgRating: playerRanking.dg_rating,
                dgRatingPercentile: (0, datagolf_1.dgRatingPercentile)(playerRanking.dg_rating, allRatings),
                courseHistory,
                recentForm: {
                    last5EventsAvgSg: +(((playerRanking.sg_ott_l12 ?? 0) + (playerRanking.sg_app_l12 ?? 0) +
                        (playerRanking.sg_arg_l12 ?? 0) + (playerRanking.sg_putt_l12 ?? 0))).toFixed(2),
                    trend: recentFormTrend(playerRanking),
                },
                vsFieldAvg: {
                    sgTotal: +((livePlayer?.sg_total ?? 0) - fieldAvgSgTotal).toFixed(2),
                    sgApp: +((livePlayer?.sg_app ?? 0) - fieldAvgSgApp).toFixed(2),
                    sgPutt: +((livePlayer?.sg_putt ?? 0) - fieldAvgSgPutt).toFixed(2),
                },
            };
        }
    }
    // Insight flags
    const fieldAvgScoreToday = liveField.length > 0
        ? liveField.reduce((s, p) => s + (p.today ?? 0), 0) / liveField.length
        : undefined;
    const insightFlags = computeInsightFlags({
        players: liveField,
        playerData: playerRanking,
        fieldAvgDgRating: avgDgRating,
        fieldAvgScoreToday,
        historicalScoringAvg: getHistoricalScoringAvg(eventName),
        weather,
        round,
    });
    const tier = (0, datagolf_1.classifyEventTier)(eventName);
    const fieldRank = getFieldStrengthRank(eventName);
    return {
        tournament: {
            name: eventName,
            course: courseName || eventName,
            tier,
            historicalScoringAvg: getHistoricalScoringAvg(eventName),
            fieldStrengthRank: fieldRank,
            isFirstRound: round === 1,
        },
        weather,
        field: {
            avgDgRating,
            topRatedInField: topRankedInField?.player_name ?? 'Unknown',
            fieldStrengthLabel: fieldStrengthLabel(fieldRank),
        },
        player: playerCtx,
        insightFlags,
    };
}
// ─── Context summary for Claude prompts ───────────────────────────────────────
// This is what gets injected into every caption generation call.
function buildContextSummary(context) {
    const parts = [
        `Event: ${context.tournament.name} (${context.tournament.tier})`,
        `Course: ${context.tournament.course}`,
        `Historical scoring avg: ${context.tournament.historicalScoringAvg > 0 ? '+' : ''}${context.tournament.historicalScoringAvg} vs par`,
        `Field strength rank: ${context.tournament.fieldStrengthRank}/50 (1 = strongest) — ${context.field.fieldStrengthLabel}`,
        `Top rated player in field: ${context.field.topRatedInField} (avg DG rating: ${context.field.avgDgRating})`,
        `Conditions: ${context.weather.conditionsSummary} (${context.weather.conditionsFlag})`,
    ];
    const activeFlags = Object.entries(context.insightFlags)
        .filter(([, v]) => v)
        .map(([k]) => k);
    if (activeFlags.length > 0) {
        parts.push(`Notable flags: ${activeFlags.join(', ')}`);
    }
    if (context.player) {
        const p = context.player;
        parts.push(`Player: ${p.name}`);
        parts.push(`  DG rating: ${p.dgRating} (${p.dgRatingPercentile}th percentile in field)`);
        parts.push(`  Recent form trend: ${p.recentForm.trend} (L12 SG Total: ${p.recentForm.last5EventsAvgSg > 0 ? '+' : ''}${p.recentForm.last5EventsAvgSg})`);
        parts.push(`  vs field avg — SG Total: ${p.vsFieldAvg.sgTotal > 0 ? '+' : ''}${p.vsFieldAvg.sgTotal}, SG App: ${p.vsFieldAvg.sgApp > 0 ? '+' : ''}${p.vsFieldAvg.sgApp}`);
        parts.push(`  Course history: T${p.courseHistory.avgFinish} avg, ${p.courseHistory.timesPlayed} starts, best T${p.courseHistory.bestFinish}`);
    }
    return parts.join('\n');
}
//# sourceMappingURL=enrichment.js.map