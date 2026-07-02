"use strict";
/**
 * DataGolf API client for the autopilot pipeline.
 * All fetch logic mirrors server.js patterns but is typed and self-contained.
 * Never call this file's functions from server.js — extend there if needed.
 * Rate limit: 45 req/min across ALL endpoints. Exceeding triggers 5-min suspension.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.COURSE_COORDS = void 0;
exports.formatPlayerName = formatPlayerName;
exports.getRankings = getRankings;
exports.getNonLivPlayerIds = getNonLivPlayerIds;
exports.dgRatingPercentile = dgRatingPercentile;
exports.getFieldUpdate = getFieldUpdate;
exports.classifyEventTier = classifyEventTier;
exports.getTournamentStatus = getTournamentStatus;
exports.getLiveTournamentStats = getLiveTournamentStats;
exports.getInPlayProbabilities = getInPlayProbabilities;
exports.getPreTournamentPredictions = getPreTournamentPredictions;
exports.getCourseFit = getCourseFit;
exports.getModelPickCandidates = getModelPickCandidates;
exports.getOutrightOdds = getOutrightOdds;
exports.getSchedule = getSchedule;
exports.getUpcomingEvent = getUpcomingEvent;
exports.getApproachSkill = getApproachSkill;
exports.estimateCutLine = estimateCutLine;
exports.detectMidRoundMover = detectMidRoundMover;
exports.selectComparisonPair = selectComparisonPair;
exports.lookupCourseCoords = lookupCourseCoords;
const config_1 = require("./config");
const BASE_URL = 'https://feeds.datagolf.com';
/**
 * Convert DataGolf "Last, First" name format to display "First Last".
 * Handles multi-word first/last names correctly (e.g. "Van Rooyen, Erik" → "Erik Van Rooyen").
 * If name doesn't contain ", " it's returned as-is.
 */
function formatPlayerName(name) {
    if (!name)
        return name;
    const idx = name.indexOf(', ');
    if (idx === -1)
        return name; // already "First Last" format or no comma
    const last = name.slice(0, idx).trim();
    const first = name.slice(idx + 2).trim();
    return first ? `${first} ${last}` : last;
}
const _cache = new Map();
function getCached(key) {
    const entry = _cache.get(key);
    if (!entry || Date.now() > entry.expiresAt)
        return null;
    return entry.data;
}
function setCached(key, data, ttlMs) {
    _cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}
// ─── Proxy fetch (routes through divotlab-api.vercel.app to share rate limits + cache) ──
const PROXY_BASE = process.env.DIVOTLAB_API_URL ?? 'https://divotlab-api.vercel.app';
async function proxyFetch(path, cacheTtlMs = 5 * 60 * 1000) {
    const url = `${PROXY_BASE}${path}`;
    const cached = getCached(url);
    if (cached)
        return cached;
    const res = await fetch(url);
    if (!res.ok)
        throw new Error(`Proxy API error ${res.status} for ${path}`);
    const data = (await res.json());
    setCached(url, data, cacheTtlMs);
    return data;
}
// ─── Core fetch ───────────────────────────────────────────────────────────────
async function dg(path, params = {}, cacheTtlMs = 5 * 60 * 1000, retryCount = 0) {
    const qs = new URLSearchParams({ ...params, key: config_1.config.datagolf.apiKey, file_format: 'json' });
    const url = `${BASE_URL}${path}?${qs}`;
    const cacheKey = url;
    const cached = getCached(cacheKey);
    if (cached)
        return cached;
    const res = await fetch(url);
    // Rate limit (429) or suspension (403 from DG).
    // DataGolf suspends for exactly 5 minutes — wait 320s then retry once.
    if ((res.status === 429 || res.status === 403) && retryCount < 1) {
        const wait = 320 * 1000;
        console.warn(`[datagolf] Rate limit/suspension on ${path} — waiting ${wait / 1000}s (5-min DG window)...`);
        await new Promise(r => setTimeout(r, wait));
        return dg(path, params, cacheTtlMs, retryCount + 1);
    }
    if (!res.ok) {
        throw new Error(`DataGolf API error ${res.status} for ${path}`);
    }
    const data = (await res.json());
    setCached(cacheKey, data, cacheTtlMs);
    return data;
}
// ─── Rankings ─────────────────────────────────────────────────────────────────
/**
 * Full DG rankings. Routes through the Vercel proxy (24h cache).
 * Proxy endpoint: /api/rankings — returns { data: { rankings: [...] } }
 */
async function getRankings() {
    const resp = await proxyFetch('/api/rankings', 6 * 60 * 60 * 1000);
    return (resp.data?.rankings ?? []).map(p => ({
        ...p,
        dg_rating: p.dg_skill_estimate,
    }));
}
/**
 * Non-LIV player ID set — mirrors server.js updatePGATourPlayerIds().
 * Used for field filtering. Cached for 24h.
 */
let _nonLivIds = null;
let _nonLivLoadedAt = 0;
async function getNonLivPlayerIds() {
    if (_nonLivIds && Date.now() - _nonLivLoadedAt < 24 * 60 * 60 * 1000) {
        return _nonLivIds;
    }
    const rankings = await getRankings();
    _nonLivIds = new Set(rankings
        .filter(p => (p.primary_tour ?? '').toLowerCase() !== 'liv')
        .map(p => p.dg_id));
    _nonLivLoadedAt = Date.now();
    return _nonLivIds;
}
/** Lookup a player's DG rating percentile within the given ranking set. */
function dgRatingPercentile(dg_rating, allRatings) {
    const sorted = [...allRatings].sort((a, b) => a - b);
    const idx = sorted.findIndex(r => r >= dg_rating);
    return idx < 0 ? 99 : Math.round((idx / sorted.length) * 100);
}
// ─── Field ────────────────────────────────────────────────────────────────────
/**
 * Current tournament field. TTL: 1 hour.
 */
async function getFieldUpdate(tour = 'pga') {
    return dg('/field-updates', { tour }, 60 * 60 * 1000);
}
const MAJOR_NAMES = ['masters tournament', 'us open', 'u.s. open', 'the open championship', 'pga championship'];
const SIGNATURE_NAMES = [
    'the players championship', 'genesis invitational', 'arnold palmer invitational',
    'the memorial tournament', 'memorial tournament',
];
function classifyEventTier(eventName) {
    const lower = eventName.toLowerCase();
    if (MAJOR_NAMES.some(m => lower.includes(m)))
        return 'major';
    if (SIGNATURE_NAMES.some(s => lower.includes(s)))
        return 'signature';
    return 'standard';
}
async function getTournamentStatus() {
    try {
        const resp = await proxyFetch('/api/live-stats?round=event', 2 * 60 * 1000);
        const live = resp.data ?? {};
        const { event_name, event_id, course_name, current_round, round_status, tournament_over, lat, lng } = live;
        if (!event_name) {
            return { state: 'OFF', eventName: '', eventId: 0, round: 0, courseName: '', eventTier: 'standard' };
        }
        const tier = classifyEventTier(event_name);
        const base = { eventName: event_name, eventId: event_id ?? 0, round: current_round, courseName: course_name ?? '', eventTier: tier, lat, lng };
        if (tournament_over || round_status === 'complete' && current_round >= 4) {
            return { state: 'COMPLETED', ...base };
        }
        if (round_status === 'complete' && current_round === 3)
            return { state: 'POST_R3', ...base };
        if (round_status === 'complete' && current_round === 2)
            return { state: 'POST_R2', ...base };
        if (round_status === 'complete' && current_round === 1)
            return { state: 'POST_R1', ...base };
        if (round_status === 'in_progress')
            return { state: 'LIVE', ...base };
        return { state: 'PRE_TOURNAMENT', ...base };
    }
    catch {
        return { state: 'OFF', eventName: '', eventId: 0, round: 0, courseName: '', eventTier: 'standard' };
    }
}
// ─── Live leaderboard ─────────────────────────────────────────────────────────
/**
 * Live player stats. Routes through the Vercel proxy to share the cached response.
 * Proxy endpoint: /api/live-stats?round=event (wraps /preds/live-tournament-stats)
 */
async function getLiveTournamentStats(round = 'event') {
    const resp = await proxyFetch(`/api/live-stats?round=${round}&stats=sg_putt,sg_arg,sg_app,sg_ott,sg_total`, 90 * 1000);
    const data = resp.data ?? {};
    const nonLivIds = await getNonLivPlayerIds();
    const players = (data.players ?? [])
        .filter(p => nonLivIds.has(p.dg_id))
        .map(p => ({ ...p, player_name: formatPlayerName(p.player_name) }));
    return { eventName: data.event_name ?? '', players };
}
// ─── In-play win probabilities ────────────────────────────────────────────────
/**
 * Live win / top-5/10/20 / make-cut probabilities. Routes through the Vercel proxy.
 * Proxy endpoint: /api/live-tournament (wraps /preds/in-play)
 * Response structure: { data: { data: [...players], info: {...} } }
 */
async function getInPlayProbabilities() {
    const resp = await proxyFetch('/api/live-tournament', 90 * 1000);
    const inner = resp.data;
    if (!inner?.data?.length)
        return null;
    const players = inner.data.map(p => ({
        ...p,
        player_name: formatPlayerName(p.player_name),
    }));
    return { players, info: inner.info };
}
// ─── Pre-tournament predictions ───────────────────────────────────────────────
/**
 * Pre-tournament win/top-X probabilities. Routes through the Vercel proxy.
 * Proxy endpoint: /api/pre-tournament (wraps /preds/pre-tournament, 6h cache)
 * Response: { success, fromCache, data: { baseline: [...], baseline_history_fit: [...] } }
 */
async function getPreTournamentPredictions(model = 'baseline_history_fit') {
    const resp = await proxyFetch('/api/pre-tournament?dead_heat=no', 6 * 60 * 60 * 1000);
    const d = resp.data;
    const players = d?.[model] ?? d?.baseline ?? [];
    return players.sort((a, b) => b.win - a.win);
}
/**
 * Fetch course-fit scores via the divotlab-api proxy.
 * This already normalizes to 0–100 and sorts by fit rank.
 * Uses the proxy rather than DataGolf directly to avoid burning API quota.
 */
async function getCourseFit() {
    const apiBase = process.env.DIVOTLAB_API_URL ?? 'https://divotlab-api.vercel.app';
    const res = await fetch(`${apiBase}/api/course-fit`);
    if (!res.ok)
        throw new Error(`course-fit API error ${res.status}`);
    return res.json();
}
/**
 * Joined model-picks data: pre-tournament predictions enriched with course-fit scores.
 * Sorted by combined score (60% win probability rank + 40% course-fit rank).
 * Returns the best candidates for the weekly model-picks card.
 */
async function getModelPickCandidates() {
    const [preTour, cfData] = await Promise.all([
        getPreTournamentPredictions('baseline_history_fit'),
        getCourseFit(),
    ]);
    const fitMap = new Map(cfData.field.map(p => [p.dg_id, p]));
    // Only include players in the current field
    const fieldIds = new Set(cfData.field.map(p => p.dg_id));
    const inField = preTour.filter(p => fieldIds.has(p.dg_id));
    // Assign win rank (already sorted by win probability descending)
    const withRanks = inField.map((p, winIdx) => {
        const fit = fitMap.get(p.dg_id);
        return {
            dg_id: p.dg_id,
            playerName: formatPlayerName(p.player_name),
            winPct: p.win,
            top10Pct: p.top_10,
            fitScore: fit?.fitScore ?? 0,
            fitRank: fit?.rank ?? 999,
            winRank: winIdx + 1,
            combinedRank: 0, // filled below
            sgApp: fit?.sg_app,
            sgPutt: fit?.sg_putt,
            sgOtt: fit?.sg_ott,
            sgArg: fit?.sg_arg,
        };
    });
    // Combined rank: 60% win probability + 40% course fit
    withRanks.forEach(p => {
        p.combinedRank = Math.round(0.6 * p.winRank + 0.4 * p.fitRank);
    });
    return withRanks.sort((a, b) => a.combinedRank - b.combinedRank);
}
/**
 * Current outright odds from all books + DataGolf model fair values.
 * TTL: 10 min — books update during play, less so pre-tournament.
 */
async function getOutrightOdds(market = 'win') {
    const data = await dg('/betting-tools/outrights', { tour: 'pga', market, odds_format: 'american' }, 10 * 60 * 1000);
    return data.odds ?? [];
}
// ─── Schedule ─────────────────────────────────────────────────────────────────
/**
 * Full PGA Tour schedule for the current season. TTL: 12h.
 */
async function getSchedule(season = new Date().getFullYear()) {
    const data = await dg('/get-schedule', { tour: 'pga', season: String(season) }, 12 * 60 * 60 * 1000);
    return data.schedule ?? [];
}
/**
 * Find the upcoming event (nearest future start date).
 */
async function getUpcomingEvent() {
    const schedule = await getSchedule();
    const now = new Date();
    const upcoming = schedule
        .filter(e => new Date(e.start_date) >= now || e.status === 'in_progress')
        .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
    return upcoming[0] ?? null;
}
/**
 * SG: Approach broken into distance buckets. TTL: 6h.
 */
async function getApproachSkill() {
    const data = await dg('/preds/approach-skill', { tour: 'pga' }, 6 * 60 * 60 * 1000);
    return data.players ?? [];
}
// ─── Cut line helpers ─────────────────────────────────────────────────────────
/**
 * From a live leaderboard, estimate the projected cut line.
 * DataGolf doesn't expose a cut-line endpoint directly — we derive it
 * from the score distribution of the field.
 *
 * Standard PGA Tour cuts: top 65 + ties after R2.
 */
function estimateCutLine(players, cutSize = 65) {
    const active = players.filter(p => typeof p.total === 'number' && !isNaN(p.total));
    const sorted = [...active].sort((a, b) => a.total - b.total);
    const cutIdx = Math.min(cutSize - 1, sorted.length - 1);
    const cutLine = sorted[cutIdx]?.total ?? 0;
    const bubblePlayers = active.filter(p => p.total >= cutLine - 1 && p.total <= cutLine + 1);
    return { cutLine, bubblePlayers };
}
// ─── Mid-round mover detection ────────────────────────────────────────────────
/**
 * Detect the most notable position mover since the previous snapshot.
 * Returns the player who moved the most positions (downward = rising).
 * Position string is parsed via parsePosition().
 *
 * `threshold`: minimum positions moved to qualify.
 */
function detectMidRoundMover(current, previous, threshold = 5) {
    const prevMap = new Map(previous.map(p => [p.dg_id, parsePosition(p.position)]));
    let best = null;
    let bestMove = 0;
    for (const player of current) {
        const now = parsePosition(player.position);
        const was = prevMap.get(player.dg_id);
        if (was == null || now >= 900)
            continue; // skip cuts/WDs
        const move = was - now; // positive = moved up
        if (move >= threshold && move > bestMove) {
            bestMove = move;
            best = { player, positionStart: was, positionNow: now };
        }
    }
    return best;
}
function parsePosition(pos) {
    if (!pos)
        return 999;
    const s = String(pos).replace(/^[Tt]/, '').trim();
    const n = parseInt(s);
    return isNaN(n) ? 999 : n;
}
// ─── Comparison spotlight selection ──────────────────────────────────────────
/**
 * Find two players worth comparing — high DG rating, contrasting performances.
 * Criteria (from TRIGGERS.md):
 *   - Both in top 30 by DG rating
 *   - Score gap >= 4 shots, OR same tier but opposite ends
 */
function selectComparisonPair(players, rankings) {
    const ratingMap = new Map(rankings.map(r => [r.dg_id, r.dg_rating]));
    const sorted = [...rankings].sort((a, b) => b.dg_rating - a.dg_rating);
    const top30Ids = new Set(sorted.slice(0, 30).map(r => r.dg_id));
    const eligible = players
        .filter(p => top30Ids.has(p.dg_id) && typeof p.total === 'number' && !isNaN(p.total))
        .sort((a, b) => a.total - b.total);
    if (eligible.length < 2)
        return null;
    // Try to find the pair with the largest score gap
    let bestPair = null;
    let bestGap = 0;
    for (let i = 0; i < eligible.length - 1; i++) {
        for (let j = i + 1; j < eligible.length; j++) {
            const gap = Math.abs(eligible[i].total - eligible[j].total);
            if (gap >= 4 && gap > bestGap) {
                bestGap = gap;
                bestPair = [eligible[i], eligible[j]];
            }
        }
    }
    // Same tier, opposite ends fallback
    if (!bestPair && eligible.length >= 2) {
        const rA = ratingMap.get(eligible[0].dg_id) ?? 0;
        const rB = ratingMap.get(eligible[eligible.length - 1].dg_id) ?? 0;
        const tier = (r) => (r > 150 ? 'elite' : r > 120 ? 'top' : 'field');
        if (tier(rA) === tier(rB)) {
            bestPair = [eligible[0], eligible[eligible.length - 1]];
        }
    }
    return bestPair;
}
// ─── Course coordinate lookup ─────────────────────────────────────────────────
// Used by weather.ts to fetch Tomorrow.io forecasts.
exports.COURSE_COORDS = {
    'augusta national': { lat: 33.5032, lng: -82.0199, key: 'augusta-national' },
    'pebble beach': { lat: 36.5680, lng: -121.9498, key: 'pebble-beach' },
    'torrey pines': { lat: 32.8993, lng: -117.2522, key: 'torrey-pines' },
    'tpc sawgrass': { lat: 30.1972, lng: -81.3948, key: 'tpc-sawgrass' },
    'tpc scottsdale': { lat: 33.6597, lng: -111.8998, key: 'tpc-scottsdale' },
    'riviera': { lat: 34.0437, lng: -118.5103, key: 'riviera' },
    'bay hill': { lat: 28.5242, lng: -81.4931, key: 'bay-hill' },
    'muirfield village': { lat: 40.1617, lng: -83.0637, key: 'muirfield-village' },
    'quail hollow': { lat: 35.1595, lng: -80.8592, key: 'quail-hollow' },
    'colonial': { lat: 32.7271, lng: -97.3615, key: 'colonial' },
    'harbour town': { lat: 32.1358, lng: -80.8074, key: 'harbour-town' },
    'tpc river highlands': { lat: 41.5823, lng: -72.6932, key: 'tpc-river-highlands' },
    'tpc summerlin': { lat: 36.2045, lng: -115.3099, key: 'tpc-summerlin' },
    'detroit golf club': { lat: 42.4053, lng: -83.1121, key: 'detroit-golf-club' },
    'sedgefield': { lat: 36.0576, lng: -79.9280, key: 'sedgefield' },
    'east lake': { lat: 33.7226, lng: -84.3105, key: 'east-lake' },
    'tpc twin cities': { lat: 44.9847, lng: -93.4780, key: 'tpc-twin-cities' },
    'tpc craig ranch': { lat: 33.1979, lng: -96.6959, key: 'tpc-craig-ranch' },
    'kapalua': { lat: 20.9993, lng: -156.6750, key: 'kapalua' },
    'waialae': { lat: 21.2831, lng: -157.7914, key: 'waialae' },
    'memorial park': { lat: 29.7660, lng: -95.4324, key: 'memorial-park' },
    'sea island': { lat: 31.1841, lng: -81.3979, key: 'sea-island' },
    'tpc deere run': { lat: 41.5490, lng: -90.5488, key: 'tpc-deere-run' },
    'pga national': { lat: 26.8393, lng: -80.1136, key: 'pga-national' },
    'la quinta': { lat: 33.6631, lng: -116.3100, key: 'la-quinta' },
    'vidanta': { lat: 20.6534, lng: -105.2297, key: 'vidanta' },
    'tpc southwind': { lat: 35.0451, lng: -89.9165, key: 'tpc-southwind' },
    'tpc toronto': { lat: 43.8561, lng: -79.6354, key: 'tpc-toronto' },
    'shinnecock hills': { lat: 40.8846, lng: -72.4607, key: 'shinnecock-hills' },
    'aronimink': { lat: 39.9596, lng: -75.3866, key: 'aronimink' },
};
/** Best-effort course coordinate lookup from a course name string. */
function lookupCourseCoords(courseName) {
    const lower = courseName.toLowerCase();
    for (const [key, coords] of Object.entries(exports.COURSE_COORDS)) {
        if (lower.includes(key) || key.includes(lower))
            return coords;
    }
    return null;
}
//# sourceMappingURL=datagolf.js.map