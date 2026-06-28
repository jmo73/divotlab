// DataGolf API Server with Intelligent Caching & PGA Tour Filtering
// Complete implementation of ALL DataGolf API endpoints

const express = require('express');
const cors = require('cors');
const NodeCache = require('node-cache');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

// CRITICAL: API key from environment variable — never hardcode
const DATAGOLF_API_KEY = process.env.DATAGOLF_API_KEY;

if (!DATAGOLF_API_KEY) {
  console.error('⚠️  DATAGOLF_API_KEY environment variable is not set!');
}
const DATAGOLF_BASE_URL = 'https://feeds.datagolf.com';

// Admin secret for protected endpoints (set in Vercel env vars)
const ADMIN_SECRET = process.env.ADMIN_SECRET;
if (!ADMIN_SECRET) {
  console.error('⚠️  ADMIN_SECRET environment variable is not set! Admin endpoints will be locked.');
}

// Lab Picks password from env (fallback for backward compat, but move to env var)
const LAB_PICKS_PASSWORD = process.env.LAB_PICKS_PASSWORD || 'lab2026picks';

// ============================================
// COURSE FIT WEIGHTS — Divot Lab Original Analysis
// Each course gets a weight profile for the 4 SG categories.
// Weights sum to 1.0. These represent editorial judgment about
// what skills matter most at each venue.
// ============================================
// ============================================
// COURSE WEIGHTS — what each venue rewards
// Weights sum to 1.0. Derived from historical
// top-10 SG patterns + venue characteristics.
// ott = off-the-tee, app = approach,
// arg = around the green, putt = putting
// ============================================
const COURSE_WEIGHTS = {
  // ── MAJORS ──────────────────────────────
  'masters tournament':         { ott: 0.25, app: 0.32, arg: 0.25, putt: 0.18, notes: 'Augusta — approach to slopes, elite short game, premium around greens' },
  'pga championship':           { ott: 0.20, app: 0.36, arg: 0.24, putt: 0.20, notes: 'Aronimink 2026 — Donald Ross design, accuracy off tee, approach to defended greens, tough chipping areas' },
  'u.s. open':                  { ott: 0.18, app: 0.38, arg: 0.26, putt: 0.18, notes: 'Accuracy premium, brutal rough, approach precision critical' },
  'the open championship':      { ott: 0.30, app: 0.25, arg: 0.25, putt: 0.20, notes: 'Links — driving lines, creativity, wind management' },
  // ── SIGNATURE / ELEVATED ────────────────
  'the players championship':   { ott: 0.15, app: 0.42, arg: 0.18, putt: 0.25, notes: 'TPC Sawgrass — iron precision, water on 6 holes, Poa greens' },
  'genesis invitational':       { ott: 0.22, app: 0.32, arg: 0.22, putt: 0.24, notes: 'Riviera — kikuyu rough, complete game, precise iron play' },
  'arnold palmer invitational': { ott: 0.20, app: 0.36, arg: 0.20, putt: 0.24, notes: 'Bay Hill — water, approach precision, firm greens' },
  'arnold palmer invitational presented by mastercard': { ott: 0.20, app: 0.36, arg: 0.20, putt: 0.24, notes: 'Bay Hill' },
  'the memorial tournament':    { ott: 0.25, app: 0.30, arg: 0.22, putt: 0.23, notes: 'Muirfield Village — Nicklaus design, complete game test' },
  'the memorial tournament presented by workday': { ott: 0.25, app: 0.30, arg: 0.22, putt: 0.23, notes: 'Muirfield Village' },
  // ── REGULAR EVENTS (alphabetical) ───────
  'american express':           { ott: 0.20, app: 0.28, arg: 0.22, putt: 0.30, notes: 'La Quinta/PGA West — scoring event, putting premium on bermuda' },
  'at&t pebble beach pro-am':   { ott: 0.20, app: 0.36, arg: 0.22, putt: 0.22, notes: 'Pebble — approach dominates on small greens, coastal wind' },
  'barbasol championship':      { ott: 0.28, app: 0.28, arg: 0.20, putt: 0.24, notes: 'Opposite-field — scoring, driving advantage' },
  'barracuda championship':     { ott: 0.28, app: 0.28, arg: 0.20, putt: 0.24, notes: 'Modified Stableford — birdies and eagles, attacking play' },
  'bmw championship':           { ott: 0.25, app: 0.30, arg: 0.20, putt: 0.25, notes: 'Playoff venue varies — balanced complete game' },
  'byron nelson':               { ott: 0.22, app: 0.30, arg: 0.22, putt: 0.26, notes: 'TPC Craig Ranch — scoring event, wedge play important' },
  'canadian open':              { ott: 0.28, app: 0.28, arg: 0.20, putt: 0.24, notes: 'TPC Toronto — length rewarded, scoring opportunity' },
  'charles schwab challenge':   { ott: 0.18, app: 0.35, arg: 0.23, putt: 0.24, notes: 'Colonial — shotmakers course, placement premium' },
  'cognizant classic':          { ott: 0.22, app: 0.28, arg: 0.20, putt: 0.30, notes: 'PGA National — Champion course, putting on slow bermuda' },
  'farmers insurance open':     { ott: 0.30, app: 0.27, arg: 0.20, putt: 0.23, notes: 'Torrey Pines — length matters, coastal marine layer' },
  'fedex st. jude championship':{ ott: 0.25, app: 0.30, arg: 0.20, putt: 0.25, notes: 'TPC Southwind — FedEx playoff event, complete game' },
  'genesis scottish open':      { ott: 0.28, app: 0.26, arg: 0.24, putt: 0.22, notes: 'Links-adjacent — driving angles, wind management' },
  'houston open':               { ott: 0.27, app: 0.28, arg: 0.20, putt: 0.25, notes: 'Memorial Park — scoring event, length rewarded' },
  'john deere classic':         { ott: 0.25, app: 0.27, arg: 0.20, putt: 0.28, notes: 'TPC Deere Run — scoring, putting on poa/bermuda blend' },
  'korn ferry challenge':       { ott: 0.25, app: 0.27, arg: 0.22, putt: 0.26, notes: 'Balanced — KFT graduates event' },
  'mexico open at vidanta':     { ott: 0.27, app: 0.30, arg: 0.20, putt: 0.23, notes: 'Vidanta — altitude aids distance, approach important' },
  'puerto rico open':           { ott: 0.25, app: 0.28, arg: 0.20, putt: 0.27, notes: 'Opposite-field — tropical conditions, scoring' },
  'rbc canadian open':          { ott: 0.28, app: 0.28, arg: 0.20, putt: 0.24, notes: 'TPC Toronto — length rewarded' },
  'rbc heritage':               { ott: 0.14, app: 0.38, arg: 0.26, putt: 0.22, notes: 'Harbour Town — short, precise, shotmaking dominates' },
  'rocket mortgage classic':    { ott: 0.24, app: 0.24, arg: 0.20, putt: 0.32, notes: 'Detroit GC — scoring event, putting premium on bermuda' },
  'rsm classic':                { ott: 0.22, app: 0.30, arg: 0.22, putt: 0.26, notes: 'Sea Island — coastal scoring event, short game' },
  'sanderson farms championship':{ ott: 0.26, app: 0.28, arg: 0.20, putt: 0.26, notes: 'Country Club of Jackson — scoring, balanced' },
  'the sentry':                 { ott: 0.26, app: 0.26, arg: 0.24, putt: 0.24, notes: 'Kapalua — wide fairways, scoring event, wind factor' },
  'shriners children\'s open':  { ott: 0.22, app: 0.27, arg: 0.20, putt: 0.31, notes: 'TPC Summerlin — scoring, putting premium on poa' },
  'sony open in hawaii':        { ott: 0.22, app: 0.30, arg: 0.22, putt: 0.26, notes: 'Waialae — wind, scoring, short game around small greens' },
  'the tour championship':      { ott: 0.25, app: 0.30, arg: 0.20, putt: 0.25, notes: 'East Lake — FedEx finale, complete game' },
  'travelers championship':     { ott: 0.20, app: 0.28, arg: 0.20, putt: 0.32, notes: 'TPC River Highlands — scoring, strong putting premium' },
  'truist championship':        { ott: 0.25, app: 0.35, arg: 0.20, putt: 0.20, notes: 'Quail Hollow — Green Mile demands approach precision, length matters' },
  'wells fargo championship':   { ott: 0.25, app: 0.35, arg: 0.20, putt: 0.20, notes: 'Quail Hollow — same as Truist Championship' },
  'wm phoenix open':            { ott: 0.20, app: 0.36, arg: 0.20, putt: 0.24, notes: 'TPC Scottsdale — scoring event, iron play separates field' },
  'wyndham championship':       { ott: 0.20, app: 0.28, arg: 0.22, putt: 0.30, notes: 'Sedgefield — short course, putting premium, scoring' },
  'zozo championship':          { ott: 0.22, app: 0.30, arg: 0.22, putt: 0.26, notes: 'Narashino CC — Japan, balanced, shorter layout' },
  '3m open':                    { ott: 0.27, app: 0.27, arg: 0.20, putt: 0.26, notes: 'TPC Twin Cities — scoring event, balanced' },
  // ── DEFAULT ─────────────────────────────
  '_default': { ott: 0.25, app: 0.25, arg: 0.25, putt: 0.25, notes: 'Balanced — no course-specific profile available' }
};

/**
 * Look up course weights for an event. Tries exact match, then partial match, then default.
 */
function getCourseWeights(eventName) {
  if (!eventName) return { ...COURSE_WEIGHTS['_default'], matched: false, match_name: 'Default' };
  const normalized = eventName.toLowerCase().trim();
  
  // Exact match
  if (COURSE_WEIGHTS[normalized]) {
    return { ...COURSE_WEIGHTS[normalized], matched: true, match_name: eventName };
  }
  
  // Partial match — check if event name contains a key or vice versa
  for (const [key, weights] of Object.entries(COURSE_WEIGHTS)) {
    if (key === '_default') continue;
    if (normalized.includes(key) || key.includes(normalized)) {
      return { ...weights, matched: true, match_name: key };
    }
  }
  
  return { ...COURSE_WEIGHTS['_default'], matched: false, match_name: 'Default (no course profile)' };
}

// ============================================
// COURSE-FIT COMPUTATION HELPERS
// ============================================

/**
 * Compute raw weighted course-fit score for one player.
 * Returns null for any missing SG category so callers can
 * decide how to handle partial data rather than silently zeroing.
 */
function computeRawFit(sg_ott, sg_app, sg_arg, sg_putt, weights) {
  // At minimum we need approach — the highest-weight category
  if (sg_app == null) return null;
  const ott  = sg_ott  != null ? sg_ott  : 0;
  const arg  = sg_arg  != null ? sg_arg  : 0;
  const putt = sg_putt != null ? sg_putt : 0;
  return weights.ott * ott + weights.app * sg_app + weights.arg * arg + weights.putt * putt;
}

/**
 * Blend long-term skill (L24) with recent form (L12).
 * 65 % L24 anchors to true skill; 35 % L12 captures hot/cold streaks.
 * Falls back to L24-only when L12 is unavailable.
 */
function blendForm(l24Score, l12Score) {
  if (l12Score == null) return { score: l24Score, blended: false };
  return { score: l24Score * 0.65 + l12Score * 0.35, blended: true };
}

/**
 * Normalize an array of raw scores to a 0–100 scale within the field.
 * Top scorer → 100, bottom scorer → 0, linear interpolation for everyone else.
 */
function normalizeToField(players) {
  const valid = players.filter(p => p.rawScore != null);
  if (valid.length === 0) return players;
  const min = Math.min(...valid.map(p => p.rawScore));
  const max = Math.max(...valid.map(p => p.rawScore));
  const range = max - min;
  return players.map(p => ({
    ...p,
    fitScore: p.rawScore == null ? null
      : range > 0 ? Math.round((p.rawScore - min) / range * 100)
      : 50
  }));
}

/**
 * Parse a DataGolf finish string (e.g. "T5", "1", "CUT", "WD") into a numeric
 * position for sorting/threshold checks. Non-finishes (CUT/MC/MDF/WD/DQ) → 999.
 */
function parseFinish(finText) {
  if (!finText) return 999;
  const s = String(finText).replace(/[TtCcWwDd]/g, '').replace('MC', '').replace('MDF', '').trim();
  if (!s || finText.toString().toUpperCase().match(/^(MC|MDF|WD|DQ|CUT)$/)) return 999;
  const n = parseInt(s);
  return isNaN(n) ? 999 : n;
}

/**
 * Format a numeric finish position back to display text (1st/2nd/3rd/T-prefixed/MC).
 */
function fmtFinish(pos) {
  if (pos >= 999) return 'MC';
  if (pos === 1) return '1st';
  if (pos === 2) return '2nd';
  if (pos === 3) return '3rd';
  return 'T' + pos;
}

/**
 * Fetch the most recent N completed PGA Tour events for the 2026 season, deduping
 * co-sanctioned/split events the same way the schedule UI does. Shared by
 * /api/model-accuracy and /api/player-recent-results.
 */
async function getRecentCompletedEvents(limit) {
  const [schedule, fieldUpdates] = await Promise.all([
    fetchDataGolfDirect(`/get-schedule?tour=pga&season=2026&file_format=json&key=${DATAGOLF_API_KEY}`),
    fetchDataGolfDirect(`/field-updates?tour=pga&file_format=json&key=${DATAGOLF_API_KEY}`)
  ]);

  const fullSchedule = schedule.schedule || [];
  const currentEventId = String(fieldUpdates.event_id || '');

  const allCompleted = fullSchedule.filter(e =>
    e.event_id && e.status === 'completed' && String(e.event_id) !== currentEventId
  );
  allCompleted.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

  const completedEvents = [];
  const used = new Set();
  for (let i = 0; i < allCompleted.length; i++) {
    if (used.has(allCompleted[i].event_id)) continue;
    let mainEvent = allCompleted[i];
    for (let j = i + 1; j < allCompleted.length; j++) {
      if (used.has(allCompleted[j].event_id)) continue;
      const daysDiff = Math.abs((new Date(allCompleted[j].start_date) - new Date(allCompleted[i].start_date)) / 86400000);
      if (daysDiff <= 3) {
        const iHasWeights = getCourseWeights(allCompleted[i].event_name).matched;
        const jHasWeights = getCourseWeights(allCompleted[j].event_name).matched;
        if (jHasWeights && !iHasWeights) mainEvent = allCompleted[j];
        used.add(allCompleted[i].event_id);
        used.add(allCompleted[j].event_id);
        break;
      }
    }
    used.add(mainEvent.event_id);
    completedEvents.push(mainEvent);
  }
  completedEvents.sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
  return completedEvents.slice(0, limit);
}

// Caching with intelligent TTL
const cache = new NodeCache({
  stdTTL: 3600,
  checkperiod: 120,
  useClones: false
});

// Cache for PGA Tour player IDs from rankings
let pgaTourPlayerIds = new Set();
let lastRankingsUpdate = 0;

// ============================================
// SECURITY MIDDLEWARE
// ============================================

// CORS — only allow requests from your domain, Vercel previews, and localhost for dev
const allowedOrigins = [
  'https://divotlab.com',
  'https://www.divotlab.com',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];
// Match Vercel preview URLs for your frontend project (e.g. divotlab-xyz-123.vercel.app)
const vercelPreviewPattern = /^https:\/\/divotlab[a-z0-9-]*\.vercel\.app$/;

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (server-to-server, curl in dev)
    // Also allow 'null' origin from file:// pages (local admin panel)
    if (!origin || origin === 'null') return callback(null, true);
    if (allowedOrigins.includes(origin) || vercelPreviewPattern.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'), false);
  }
}));

// Stripe webhook MUST be registered before express.json() — needs raw body for signature verification
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

app.use(express.json());

// Rate limiters
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,                  // 100 requests per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' }
});

const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,                   // 10 AI generations per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Rate limit reached for AI generation. Please try again later.' }
});

const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,                    // 3 blog generations per hour (admin only anyway)
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Rate limit reached.' }
});

// Apply general rate limit to all API routes
app.use('/api/', generalLimiter);

// Admin auth middleware — checks for ADMIN_SECRET in x-admin-secret header
function requireAdmin(req, res, next) {
  const secret = req.headers['x-admin-secret'];
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  next();
}

// ============================================
// LAB PICKS AUTHENTICATION
// ============================================

app.post('/api/auth/lab-picks', (req, res) => {
  const { password } = req.body;
  
  if (password === LAB_PICKS_PASSWORD) {
    res.json({ 
      success: true, 
      message: 'Authentication successful' 
    });
  } else {
    res.status(401).json({ 
      success: false, 
      message: 'Invalid password' 
    });
  }
});

// ============================================
// PGA TOUR FILTERING SYSTEM (using primary_tour from rankings)
// ============================================

async function fetchDataGolfDirect(endpoint) {
  const url = `${DATAGOLF_BASE_URL}${endpoint}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`DataGolf API error: ${response.status}`);
  }
  return response.json();
}

// Build PGA player ID set from rankings (has primary_tour field)
async function updatePGATourPlayerIds() {
  const now = Date.now();
  // Only update if cache is older than 24 hours
  if (now - lastRankingsUpdate < 86400000 && pgaTourPlayerIds.size > 0) {
    return;
  }
  
  try {
    console.log('🏌️ Updating non-LIV player IDs from rankings...');
    const rankings = await fetchDataGolfDirect(
      `/preds/get-dg-rankings?file_format=json&key=${DATAGOLF_API_KEY}`
    );
    
    if (rankings.rankings) {
      // IMPORTANT: We exclude LIV players rather than requiring primary_tour='PGA'.
      // Players like Rory McIlroy (primary_tour='euro') compete on the PGA Tour
      // but get filtered out by a strict PGA-only check. Excluding LIV specifically
      // keeps all PGA/Euro/Korn Ferry players while removing Bryson, Brooks, etc.
      pgaTourPlayerIds = new Set(
        rankings.rankings
          .filter(p => (p.primary_tour || '').toLowerCase() !== 'liv')
          .map(p => p.dg_id)
      );
      lastRankingsUpdate = now;
      console.log(`✅ Updated non-LIV player IDs: ${pgaTourPlayerIds.size} players`);
    }
  } catch (error) {
    console.error('❌ Error updating player IDs:', error);
  }
}

// Filter function - uses player IDs from rankings
function filterPGATourOnly(players) {
  if (!players || players.length === 0) return [];
  if (pgaTourPlayerIds.size === 0) {
    // This should not happen since callers now await updatePGATourPlayerIds().
    // But as a safety net, filter by known LIV/non-PGA players rather than returning all.
    console.warn('⚠️ PGA player IDs not loaded — applying fallback filter');
    // Fallback: only include players who appear in any predictions/field data (likely PGA)
    // This is imperfect but better than returning Bryson as PGA Tour leader
    return players;
  }
  
  const filtered = players.filter(p => pgaTourPlayerIds.has(p.dg_id));
  
  console.log(`  Filtered: ${players.length} → ${filtered.length} (PGA only)`);
  return filtered;
}

// Initialize on startup
updatePGATourPlayerIds();

// ============================================
// HELPER: FETCH WITH CACHING
// ============================================
// DataGolf rate limit: 45 req/min total, 5min suspension if exceeded.
// /api/betting-odds (4 markets) + /api/matchup-odds (up to 3 markets) at a 600s cache
// is ~0.7 req/min combined — trivial against the budget. Check the total again before
// reducing any cache duration further.

async function fetchDataGolf(endpoint, cacheKey, cacheDuration) {
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log(`✓ Cache HIT: ${cacheKey}`);
    return { data: cached, fromCache: true };
  }

  console.log(`✗ Cache MISS: ${cacheKey} - Fetching from DataGolf...`);

  const url = `${DATAGOLF_BASE_URL}${endpoint}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`DataGolf API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  cache.set(cacheKey, data, cacheDuration);

  return { data, fromCache: false };
}

// ============================================
// GENERAL USE ENDPOINTS
// ============================================

// ENDPOINT: Player List & IDs
app.get('/api/players', async (req, res) => {
  try {
    const result = await fetchDataGolf(
      `/get-player-list?file_format=json&key=${DATAGOLF_API_KEY}`,
      'player-list',
      604800 // 7 day cache
    );

    res.json({
      success: true,
      fromCache: result.fromCache,
      data: result.data
    });
  } catch (error) {
    console.error('Player list error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ENDPOINT: Tour Schedule
app.get('/api/schedule', async (req, res) => {
  try {
    const tour = req.query.tour || 'pga';
    const season = req.query.season || '2026';
    const upcomingOnly = req.query.upcoming_only || 'no';
    const cacheKey = `schedule-${tour}-${season}-${upcomingOnly}`;

    const result = await fetchDataGolf(
      `/get-schedule?tour=${tour}&season=${season}&upcoming_only=${upcomingOnly}&file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
      604800 // 7 day cache
    );

    res.json({
      success: true,
      fromCache: result.fromCache,
      data: result.data
    });
  } catch (error) {
    console.error('Schedule error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ENDPOINT: Field Updates
app.get('/api/field-updates', async (req, res) => {
  try {
    const tour = req.query.tour || 'pga';
    const cacheKey = `field-updates-${tour}`;

    const result = await fetchDataGolf(
      `/field-updates?tour=${tour}&file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
      3600 // 1hr cache
    );

    res.json({
      success: true,
      fromCache: result.fromCache,
      data: result.data
    });
  } catch (error) {
    console.error('Field updates error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// MODEL PREDICTIONS ENDPOINTS
// ============================================

// ENDPOINT: Data Golf Rankings (WITH PGA FILTER)
app.get('/api/rankings', async (req, res) => {
  try {
    const result = await fetchDataGolf(
      `/preds/get-dg-rankings?file_format=json&key=${DATAGOLF_API_KEY}`,
      'rankings',
      86400 // 24hr cache
    );

    // Update PGA player IDs cache from this data
    await updatePGATourPlayerIds();

    // Apply tour filter — exclude LIV rather than requiring PGA
    let rankings = result.data.rankings || [];
    if (req.query.pga_only === 'true') {
      rankings = rankings.filter(p => (p.primary_tour || '').toLowerCase() !== 'liv');
    }

    res.json({
      success: true,
      fromCache: result.fromCache,
      pga_filtered: req.query.pga_only === 'true',
      data: { ...result.data, rankings }
    });
  } catch (error) {
    console.error('Rankings error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ENDPOINT: Skill Ratings (WITH PGA FILTER)
app.get('/api/skill-ratings', async (req, res) => {
  try {
    const display = req.query.display || 'value'; // 'value' or 'rank'
    const cacheKey = `skill-ratings-${display}`;

    const result = await fetchDataGolf(
      `/preds/skill-ratings?display=${display}&file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
      86400 // 24hr cache
    );

    // Apply PGA Tour filter
    let players = result.data.skill_ratings || result.data.players || [];
    if (req.query.pga_only === 'true') {
      players = filterPGATourOnly(players);
    }

    res.json({
      success: true,
      fromCache: result.fromCache,
      pga_filtered: req.query.pga_only === 'true',
      data: { ...result.data, skill_ratings: players, players }
    });
  } catch (error) {
    console.error('Skill ratings error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Normalize team event predictions (e.g. Zurich Classic) so all consumers
// get consistent dg_id / player_name fields regardless of event format.
// DataGolf team predictions use team_id + team_name ("M. Fitzpatrick / A. Fitzpatrick")
// instead of the standard dg_id + player_name fields.
function normalizeTeamPredictions(preds) {
  if (!Array.isArray(preds) || preds.length === 0) return preds;
  const first = preds[0];
  if (first.dg_id && first.player_name) return preds; // already standard format
  if (!first.team_id && !first.p1_dg_id) return preds; // unrecognized format, pass through
  return preds.map(p => ({
    ...p,
    dg_id: p.team_id || p.p1_dg_id,
    player_name: p.team_name || `Team ${p.team_id || p.p1_dg_id}`,
    _is_team: true
  }));
}

// ENDPOINT: Pre-Tournament Predictions
app.get('/api/pre-tournament', async (req, res) => {
  try {
    const tour = req.query.tour || 'pga';
    const addPosition = req.query.add_position || '';
    const deadHeat = req.query.dead_heat || 'yes';
    const oddsFormat = req.query.odds_format || 'percent';
    const cacheKey = `pre-tournament-${tour}-${deadHeat}-${oddsFormat}`;

    let endpoint = `/preds/pre-tournament?tour=${tour}&dead_heat=${deadHeat}&odds_format=${oddsFormat}&file_format=json&key=${DATAGOLF_API_KEY}`;
    if (addPosition) {
      endpoint += `&add_position=${addPosition}`;
    }

    const result = await fetchDataGolf(endpoint, cacheKey, 21600); // 6hr cache

    // Normalize team event predictions before returning
    const rawPreds = result.data.baseline_history_fit || result.data.predictions || [];
    const normalized = normalizeTeamPredictions(rawPreds);
    const isTeam = normalized.length > 0 && normalized[0]._is_team;
    const responseData = isTeam
      ? { ...result.data, baseline_history_fit: normalized, predictions: normalized, _is_team_event: true }
      : result.data;

    res.json({
      success: true,
      fromCache: result.fromCache,
      data: responseData
    });
  } catch (error) {
    console.error('Pre-tournament error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ENDPOINT: Pre-Tournament Archive
app.get('/api/pre-tournament-archive', async (req, res) => {
  try {
    const eventId = req.query.event_id || '';
    const year = req.query.year || '2025';
    const oddsFormat = req.query.odds_format || 'percent';
    const cacheKey = `pre-tournament-archive-${eventId}-${year}`;

    let endpoint = `/preds/pre-tournament-archive?year=${year}&odds_format=${oddsFormat}&file_format=json&key=${DATAGOLF_API_KEY}`;
    if (eventId) {
      endpoint += `&event_id=${eventId}`;
    }

    const result = await fetchDataGolf(endpoint, cacheKey, 604800); // 7 day cache

    res.json({
      success: true,
      fromCache: result.fromCache,
      data: result.data
    });
  } catch (error) {
    console.error('Pre-tournament archive error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ENDPOINT: Player Skill Decompositions
app.get('/api/player-decompositions', async (req, res) => {
  try {
    const tour = req.query.tour || 'pga';
    const cacheKey = `player-decompositions-${tour}`;

    const result = await fetchDataGolf(
      `/preds/player-decompositions?tour=${tour}&file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
      21600 // 6hr cache
    );

    res.json({
      success: true,
      fromCache: result.fromCache,
      data: result.data
    });
  } catch (error) {
    console.error('Player decompositions error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ENDPOINT: Detailed Approach Skill
app.get('/api/approach-skill', async (req, res) => {
  try {
    const period = req.query.period || 'l24'; // l24, l12, ytd
    const cacheKey = `approach-skill-${period}`;

    const result = await fetchDataGolf(
      `/preds/approach-skill?period=${period}&file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
      86400 // 24hr cache
    );

    res.json({
      success: true,
      fromCache: result.fromCache,
      data: result.data
    });
  } catch (error) {
    console.error('Approach skill error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ENDPOINT: Fantasy Projection Defaults
app.get('/api/fantasy-projections', async (req, res) => {
  try {
    const tour = req.query.tour || 'pga';
    const site = req.query.site || 'draftkings';
    const slate = req.query.slate || 'main';
    const cacheKey = `fantasy-${tour}-${site}-${slate}`;

    const result = await fetchDataGolf(
      `/preds/fantasy-projection-defaults?tour=${tour}&site=${site}&slate=${slate}&file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
      21600 // 6hr cache
    );

    res.json({
      success: true,
      fromCache: result.fromCache,
      data: result.data
    });
  } catch (error) {
    console.error('Fantasy projections error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// LIVE MODEL ENDPOINTS
// ============================================

// ENDPOINT: Live Tournament Predictions
app.get('/api/live-tournament', async (req, res) => {
  try {
    const tour = req.query.tour || 'pga';
    const deadHeat = req.query.dead_heat || 'no';
    const oddsFormat = req.query.odds_format || 'percent';
    const cacheKey = `live-tournament-${tour}`;

    const result = await fetchDataGolf(
      `/preds/in-play?tour=${tour}&dead_heat=${deadHeat}&odds_format=${oddsFormat}&file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
      60 // 1min cache during live play
    );

    const eventName = result.data?.event_name || result.data?.info?.event_name || null;

    res.json({
      success: true,
      fromCache: result.fromCache,
      event_name: eventName,
      data: result.data
    });
  } catch (error) {
    console.error('Live tournament error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ENDPOINT: Live Tournament Stats
app.get('/api/live-stats', async (req, res) => {
  try {
    const stats = req.query.stats || 'sg_putt,sg_arg,sg_app,sg_ott,sg_total';
    const round = req.query.round || 'event_avg';
    const display = req.query.display || 'value';
    const cacheKey = `live-stats-${round}-${display}`;

    const result = await fetchDataGolf(
      `/preds/live-tournament-stats?stats=${stats}&round=${round}&display=${display}&file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
      60 // 1min cache during live play
    );

    res.json({
      success: true,
      fromCache: result.fromCache,
      data: result.data
    });
  } catch (error) {
    console.error('Live stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ENDPOINT: Live Hole Stats
app.get('/api/live-hole-stats', async (req, res) => {
  try {
    const tour = req.query.tour || 'pga';
    const cacheKey = `live-hole-stats-${tour}`;

    const result = await fetchDataGolf(
      `/preds/live-hole-stats?tour=${tour}&file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
      60 // 1min cache during live play
    );

    res.json({
      success: true,
      fromCache: result.fromCache,
      data: result.data
    });
  } catch (error) {
    console.error('Live hole stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// BETTING TOOLS ENDPOINTS
// ============================================

// ENDPOINT: Outright (Finish Position) Odds
app.get('/api/betting-odds', async (req, res) => {
  try {
    const tour = req.query.tour || 'pga';
    const market = req.query.market || 'win'; // win, top_5, top_10, top_20, mc, make_cut, frl
    const oddsFormat = req.query.odds_format || 'american';
    const cacheKey = `betting-odds-${tour}-${market}`;

    const result = await fetchDataGolf(
      `/betting-tools/outrights?tour=${tour}&market=${market}&odds_format=${oddsFormat}&file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
      600 // 10min cache — books keep live odds during play, but DataGolf's own refresh cadence for this feed is unknown,
          // so we keep this modest rather than aggressive. datagolf.baseline_history_fit (model prob) is a pre-tournament
          // baseline; live in-round model probability comes from /preds/in-play instead (see pro.html loadValueData)
    );

    res.json({
      success: true,
      fromCache: result.fromCache,
      data: result.data
    });
  } catch (error) {
    console.error('Betting odds error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ENDPOINT: Match-Up & 3-Ball Odds
app.get('/api/matchup-odds', async (req, res) => {
  try {
    const tour = req.query.tour || 'pga';
    const market = req.query.market || 'tournament_matchups'; // tournament_matchups, round_matchups, 3_balls
    const oddsFormat = req.query.odds_format || 'american';
    const cacheKey = `matchup-odds-${tour}-${market}`;

    const result = await fetchDataGolf(
      `/betting-tools/matchups?tour=${tour}&market=${market}&odds_format=${oddsFormat}&file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
      600 // 10min cache — books keep live odds during play; modest reduction from 30min since DataGolf's
          // refresh cadence for this feed is unknown
    );

    res.json({
      success: true,
      fromCache: result.fromCache,
      data: result.data
    });
  } catch (error) {
    console.error('Matchup odds error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ENDPOINT: All Pairings DG Odds
app.get('/api/matchup-all-pairings', async (req, res) => {
  try {
    const tour = req.query.tour || 'pga';
    const oddsFormat = req.query.odds_format || 'percent';
    const cacheKey = `matchup-all-${tour}`;

    const result = await fetchDataGolf(
      `/betting-tools/matchups-all-pairings?tour=${tour}&odds_format=${oddsFormat}&file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
      1800 // 30min cache
    );

    res.json({
      success: true,
      fromCache: result.fromCache,
      data: result.data
    });
  } catch (error) {
    console.error('All pairings error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// COURSE-FIT LEADERBOARD ENDPOINT
// Computes normalized 0-100 course-fit scores
// for every player in the current field, blending
// long-term skill (L24) with recent form (L12).
// ============================================

app.get('/api/course-fit', async (req, res) => {
  try {
    const bustCache = req.query.bust === 'true';
    const cacheKey = 'course-fit-leaderboard';
    if (bustCache) cache.del(cacheKey);

    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, fromCache: true, ...cached });
    }

    await updatePGATourPlayerIds();

    // Fetch in parallel: field, L24 skill, L12 skill (form)
    const [fieldRaw, skillL24Raw, skillL12Raw] = await Promise.all([
      fetchDataGolfDirect(`/field-updates?tour=pga&file_format=json&key=${DATAGOLF_API_KEY}`),
      fetchDataGolfDirect(`/preds/skill-ratings?display=value&file_format=json&key=${DATAGOLF_API_KEY}`),
      fetchDataGolfDirect(`/preds/skill-ratings?display=value&period=l12&file_format=json&key=${DATAGOLF_API_KEY}`)
        .catch(() => null) // non-fatal if L12 unavailable
    ]);

    const eventName  = fieldRaw.event_name || '';
    const weights    = getCourseWeights(eventName);
    const fieldPlayers = fieldRaw.field || [];

    // Build skill lookups by dg_id
    const l24Map = new Map();
    const l12Map = new Map();
    (skillL24Raw.skill_ratings || skillL24Raw.players || []).forEach(p => {
      if (p.dg_id) l24Map.set(p.dg_id, p);
    });
    if (skillL12Raw) {
      (skillL12Raw.skill_ratings || skillL12Raw.players || []).forEach(p => {
        if (p.dg_id) l12Map.set(p.dg_id, p);
      });
    }

    // Compute raw course-fit score for each field player
    const withRaw = fieldPlayers.map(fp => {
      const l24 = l24Map.get(fp.dg_id);
      const l12 = l12Map.get(fp.dg_id);

      const l24Score = l24 ? computeRawFit(l24.sg_ott, l24.sg_app, l24.sg_arg, l24.sg_putt, weights) : null;
      const l12Score = l12 ? computeRawFit(l12.sg_ott, l12.sg_app, l12.sg_arg, l12.sg_putt, weights) : null;
      const { score: blended, blended: formApplied } = l24Score != null ? blendForm(l24Score, l12Score) : { score: null, blended: false };

      return {
        dg_id:       fp.dg_id,
        player_name: fp.player_name,
        country:     fp.country || (l24 && l24.country) || '',
        am:          fp.am || 0,
        rawScore:    blended,
        fitScore:    null, // filled after normalization
        // L24 skill breakdown (displayed in UI)
        sg_ott:      l24 ? (l24.sg_ott  != null ? +l24.sg_ott.toFixed(3)  : null) : null,
        sg_app:      l24 ? (l24.sg_app  != null ? +l24.sg_app.toFixed(3)  : null) : null,
        sg_arg:      l24 ? (l24.sg_arg  != null ? +l24.sg_arg.toFixed(3)  : null) : null,
        sg_putt:     l24 ? (l24.sg_putt != null ? +l24.sg_putt.toFixed(3) : null) : null,
        sg_total:    l24 ? (l24.sg_total != null ? +l24.sg_total.toFixed(3): null) : null,
        // Form info
        form_blended: formApplied,
        has_full_data: !!(l24 && l24.sg_ott != null && l24.sg_app != null && l24.sg_arg != null && l24.sg_putt != null)
      };
    });

    // Normalize to 0-100 within the field, then sort
    const normalized = normalizeToField(withRaw)
      .sort((a, b) => {
        if (b.fitScore != null && a.fitScore != null) return b.fitScore - a.fitScore;
        if (b.fitScore != null) return 1;
        if (a.fitScore != null) return -1;
        return 0;
      })
      .map((p, i) => ({
        rank: i + 1,
        ...p,
        percentile: p.fitScore != null ? Math.round(100 - (i / withRaw.length) * 100) : null
      }));

    // How many players have full SG data (data quality signal for UI)
    const withData    = normalized.filter(p => p.fitScore != null).length;
    const withFullSG  = normalized.filter(p => p.has_full_data).length;

    console.log(`  Course-fit: ${eventName} | ${normalized.length} players | ${withData} scored | ${withFullSG} full SG | form blended: ${skillL12Raw ? 'yes' : 'no'}`);
    console.log(`  Weights: ott=${weights.ott} app=${weights.app} arg=${weights.arg} putt=${weights.putt} (${weights.matched ? 'matched' : 'default'})`);

    // Determine cache duration
    const today = new Date(); today.setHours(0,0,0,0);
    const isDuringTournament = fieldRaw.current_round > 0;
    const cacheTTL = isDuringTournament ? 1800 : 21600; // 30min live, 6hr pre-tournament

    const payload = {
      tournament: {
        event_id:    fieldRaw.event_id,
        event_name:  eventName,
        course:      fieldRaw.course || fieldRaw.course_name || '',
        field_size:  fieldPlayers.length,
        current_round: fieldRaw.current_round || 0
      },
      course_weights: {
        ott:   weights.ott,
        app:   weights.app,
        arg:   weights.arg,
        putt:  weights.putt,
        matched:    weights.matched,
        match_name: weights.match_name,
        notes:      weights.notes || ''
      },
      field: normalized,
      meta: {
        players_scored:    withData,
        players_full_sg:   withFullSG,
        form_blended:      !!skillL12Raw,
        normalization:     '0-100 within field (top scorer = 100)',
        blend_ratio:       skillL12Raw ? '65% L24 skill + 35% L12 form' : 'L24 only (L12 unavailable)',
        timestamp:         new Date().toISOString()
      }
    };

    cache.set(cacheKey, payload, cacheTTL);
    res.json({ success: true, fromCache: false, ...payload });

  } catch (error) {
    console.error('Course-fit error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// HISTORICAL RAW DATA ENDPOINTS
// ============================================

// ENDPOINT: Historical Event List
app.get('/api/historical-events', async (req, res) => {
  try {
    const tour = req.query.tour || 'pga';
    const cacheKey = `historical-events-${tour}`;

    const result = await fetchDataGolf(
      `/historical-raw-data/event-list?tour=${tour}&file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
      604800 // 7 day cache
    );

    res.json({
      success: true,
      fromCache: result.fromCache,
      data: result.data
    });
  } catch (error) {
    console.error('Historical events error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ENDPOINT: Round Scoring & Stats
app.get('/api/historical-rounds', async (req, res) => {
  try {
    const tour = req.query.tour; // required
    const eventId = req.query.event_id; // required
    const year = req.query.year; // required
    
    if (!tour || !eventId || !year) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: tour, event_id, year'
      });
    }

    const cacheKey = `historical-rounds-${tour}-${eventId}-${year}`;

    const result = await fetchDataGolf(
      `/historical-raw-data/rounds?tour=${tour}&event_id=${eventId}&year=${year}&file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
      604800 // 7 day cache
    );

    res.json({
      success: true,
      fromCache: result.fromCache,
      data: result.data
    });
  } catch (error) {
    console.error('Historical rounds error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// HISTORICAL EVENT DATA (finishes, earnings)
// ============================================

app.get('/api/historical-event-list', async (req, res) => {
  try {
    const tour = req.query.tour || 'pga';
    const result = await fetchDataGolf(
      `/historical-event-data/event-list?tour=${tour}&file_format=json&key=${DATAGOLF_API_KEY}`,
      `hist-event-list-${tour}`, 604800
    );
    res.json({ success: true, fromCache: result.fromCache, data: result.data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/historical-event-results', async (req, res) => {
  try {
    const { tour, event_id, year } = req.query;
    if (!tour || !event_id || !year) return res.status(400).json({ success: false, error: 'tour, event_id, year required' });
    const result = await fetchDataGolf(
      `/historical-event-data/events?tour=${tour}&event_id=${event_id}&year=${year}&file_format=json&key=${DATAGOLF_API_KEY}`,
      `hist-event-results-${tour}-${event_id}-${year}`, 604800
    );
    res.json({ success: true, fromCache: result.fromCache, data: result.data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ============================================
// HISTORICAL BETTING ODDS
// ============================================

app.get('/api/historical-odds-list', async (req, res) => {
  try {
    const tour = req.query.tour || 'pga';
    const result = await fetchDataGolf(
      `/historical-odds/event-list?tour=${tour}&file_format=json&key=${DATAGOLF_API_KEY}`,
      `hist-odds-list-${tour}`, 604800
    );
    res.json({ success: true, fromCache: result.fromCache, data: result.data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/historical-odds-outrights', async (req, res) => {
  try {
    const { tour, event_id, year, market, book, odds_format } = req.query;
    if (!book) return res.status(400).json({ success: false, error: 'book is required' });
    const t = tour || 'pga'; const m = market || 'win'; const fmt = odds_format || 'decimal';
    const cacheKey = `hist-odds-outrights-${t}-${event_id}-${year}-${m}-${book}`;
    let endpoint = `/historical-odds/outrights?tour=${t}&market=${m}&book=${book}&odds_format=${fmt}&file_format=json&key=${DATAGOLF_API_KEY}`;
    if (event_id) endpoint += `&event_id=${event_id}`;
    if (year) endpoint += `&year=${year}`;
    const result = await fetchDataGolf(endpoint, cacheKey, 604800);
    res.json({ success: true, fromCache: result.fromCache, data: result.data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/historical-odds-matchups', async (req, res) => {
  try {
    const { tour, event_id, year, book, odds_format } = req.query;
    if (!book) return res.status(400).json({ success: false, error: 'book is required' });
    const t = tour || 'pga'; const fmt = odds_format || 'decimal';
    const cacheKey = `hist-odds-matchups-${t}-${event_id}-${year}-${book}`;
    let endpoint = `/historical-odds/matchups?tour=${t}&book=${book}&odds_format=${fmt}&file_format=json&key=${DATAGOLF_API_KEY}`;
    if (event_id) endpoint += `&event_id=${event_id}`;
    if (year) endpoint += `&year=${year}`;
    const result = await fetchDataGolf(endpoint, cacheKey, 604800);
    res.json({ success: true, fromCache: result.fromCache, data: result.data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ============================================
// HISTORICAL DFS DATA
// ============================================

app.get('/api/historical-dfs-list', async (req, res) => {
  try {
    const result = await fetchDataGolf(
      `/historical-dfs-data/event-list?file_format=json&key=${DATAGOLF_API_KEY}`,
      'hist-dfs-list', 604800
    );
    res.json({ success: true, fromCache: result.fromCache, data: result.data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/historical-dfs', async (req, res) => {
  try {
    const { tour, site, event_id, year } = req.query;
    if (!tour || !event_id || !year) return res.status(400).json({ success: false, error: 'tour, event_id, year required' });
    const s = site || 'draftkings';
    const result = await fetchDataGolf(
      `/historical-dfs-data/points?tour=${tour}&site=${s}&event_id=${event_id}&year=${year}&file_format=json&key=${DATAGOLF_API_KEY}`,
      `hist-dfs-${tour}-${s}-${event_id}-${year}`, 604800
    );
    res.json({ success: true, fromCache: result.fromCache, data: result.data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ============================================
// ============================================
// COURSE HISTORY
// Returns a player-indexed map of results at a
// given venue over the last 4 seasons.
// ============================================

function parseFinishNum(finText) {
  if (!finText) return 999;
  const s = String(finText).replace(/[Tt]/g, '').trim();
  if (['MC','MDF','WD','DQ','CUT','DNP'].includes(s.toUpperCase())) return 999;
  const n = parseInt(s);
  return isNaN(n) ? 999 : n;
}

app.get('/api/course-history', async (req, res) => {
  const { event_id } = req.query;
  if (!event_id) return res.status(400).json({ success: false, error: 'event_id required' });

  const cacheKey = `course-history-${event_id}`;
  if (req.query.bust === 'true') cache.del(cacheKey);
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ success: true, fromCache: true, ...cached });

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4];

  // Use the event's start_date to find the same-week tournament in historical years.
  // Sponsored names change (Wells Fargo → Cadillac) but the calendar slot stays fixed.
  const startDate = req.query.start_date || '';
  const startMMDD = startDate.slice(5); // "04-30" from "2026-04-30"

  async function fetchForYear(year) {
    // Try same event_id directly
    try {
      const data = await fetchDataGolfDirect(
        `/historical-event-data/events?tour=pga&event_id=${event_id}&year=${year}&file_format=json&key=${DATAGOLF_API_KEY}`
      );
      const stats = (!data.error && !data.message) ? (data.event_stats || []) : [];
      if (stats.length) return stats;
    } catch(e) {
      if (e.message.includes('400')) return null; // plan limit — stop trying earlier years
    }

    if (!startMMDD) return [];

    // Fallback: match by calendar week in historical schedule
    try {
      const sched = await fetchDataGolfDirect(
        `/get-schedule?tour=pga&season=${year}&file_format=json&key=${DATAGOLF_API_KEY}`
      );
      const events = (sched.schedule || []).filter(e => e.start_date);
      const refDate = new Date(`${year}-${startMMDD}`);
      let best = null, bestDiff = 999;
      events.forEach(e => {
        const diff = Math.abs(new Date(e.start_date) - refDate) / 86400000;
        if (diff < bestDiff) { bestDiff = diff; best = e; }
      });
      if (!best || bestDiff > 21) return [];
      await new Promise(r => setTimeout(r, 300));
      const data = await fetchDataGolfDirect(
        `/historical-event-data/events?tour=pga&event_id=${best.event_id}&year=${year}&file_format=json&key=${DATAGOLF_API_KEY}`
      );
      return (!data.error && !data.message) ? (data.event_stats || []) : [];
    } catch(e) {
      if (e.message.includes('400')) return null; // plan limit
      return [];
    }
  }

  const yearData = [];
  // Run sequentially; stop early if we hit consecutive plan-limit 400s
  let consecutive400s = 0;
  for (const year of years) {
    if (consecutive400s >= 2) break; // plan doesn't support this far back
    const stats = await fetchForYear(year);
    if (stats === null) { consecutive400s++; } else { consecutive400s = 0; yearData.push({ year, stats }); }
    await new Promise(r => setTimeout(r, 400));
  }

  const players = {};
  yearData.forEach(({ year, stats }) => {
    stats.forEach(p => {
      if (!p.player_name) return;
      if (!players[p.player_name]) players[p.player_name] = {};
      players[p.player_name][year] = {
        fin_text: p.fin_text || '—',
        finish: parseFinishNum(p.fin_text),
        made_cut: parseFinishNum(p.fin_text) < 999
      };
    });
  });

  // Only return years we actually have data for
  const availableYears = yearData.filter(yd => yd.stats.length > 0).map(yd => yd.year);
  const payload = { event_id, years: availableYears, players };
  cache.set(cacheKey, payload, 604800);
  res.json({ success: true, fromCache: false, ...payload });
});

// MODEL ACCURACY / BACKTESTING
// For each completed event this season:
//   - Pull pre-tournament predictions from archive
//   - Pull actual finishing positions
//   - Compute top-N hit rates + calibration bins
// ============================================

app.get('/api/model-accuracy', async (req, res) => {
  const cacheKey = 'model-accuracy-2026';
  const bust = req.query.bust === 'true';
  if (bust) cache.del(cacheKey);
  const cached = !bust && cache.get(cacheKey);
  if (cached) return res.json({ success: true, fromCache: true, ...cached });

  try {
    const recentEvents = await getRecentCompletedEvents(16);

    if (bust) {
      for (const evt of recentEvents) {
        cache.del(`archive-event-${evt.event_id}-2026`);
        cache.del(`results-event-${evt.event_id}-2026`);
        await kvDel(`archive-event-${evt.event_id}-2026`);
        await kvDel(`results-event-${evt.event_id}-2026`);
      }
    }

    console.log(`  Model accuracy: analyzing ${recentEvents.length} completed events`);

    // Fetch archive + results for each event, batched
    const eventResults = [];
    for (let i = 0; i < recentEvents.length; i += 3) {
      const batch = recentEvents.slice(i, i + 3);
      const batchData = await Promise.all(batch.map(async evt => {
        try {
          const archiveCacheKey = `archive-event-${evt.event_id}-2026`;
          const archiveEntry = await getCachedJSON(archiveCacheKey, 604800, async () => {
            const raw = await fetchDataGolfDirect(
              `/preds/pre-tournament-archive?event_id=${evt.event_id}&year=2026&odds_format=percent&file_format=json&key=${DATAGOLF_API_KEY}`
            );
            const preds = raw.baseline_history_fit || raw.baseline || [];
            return { event_id: evt.event_id, event_name: raw.event_name || evt.event_name, predictions: Array.isArray(preds) ? preds : [] };
          });

          const resultsCacheKey = `results-event-${evt.event_id}-2026`;
          const resultsRaw = await getCachedJSON(resultsCacheKey, 604800, () =>
            fetchDataGolfDirect(`/historical-event-data/events?tour=pga&event_id=${evt.event_id}&year=2026&file_format=json&key=${DATAGOLF_API_KEY}`)
          );

          const resultsArr = resultsRaw.event_stats || resultsRaw.results || resultsRaw.data || [];
          const resultMap = {};
          resultsArr.forEach(r => {
            const pos = parseFinish(r.fin_text || r.position || r.fin || r.place);
            resultMap[r.dg_id] = pos;
          });

          // Find actual winner
          const winner = resultsArr.find(r => parseFinish(r.fin_text || r.position || r.fin || r.place) === 1);
          const winnerName = winner ? (winner.player_name || '') : '';

          const preds = archiveEntry.predictions;
          if (!preds.length) return null;

          // Top 10 by model's top_10 probability
          const sorted10 = preds.slice().sort((a, b) => (b.top_10 || 0) - (a.top_10 || 0));
          const top10picks = sorted10.slice(0, 10);
          const top10hits = top10picks.filter(p => (resultMap[p.dg_id] || 999) <= 10).length;

          const top5picks = sorted10.slice(0, 5);
          const top5hits = top5picks.filter(p => (resultMap[p.dg_id] || 999) <= 5).length;

          // Did model's #1 win?
          const modelTop1 = sorted10[0];
          const modelTop1Finish = modelTop1 ? (resultMap[modelTop1.dg_id] || 999) : 999;
          const modelTop1Won = modelTop1Finish === 1;
          const modelTop1InTop5 = modelTop1Finish <= 5;

          // Per-pick detail for top 10
          const top10Detail = sorted10.slice(0, 10).map((p, i) => ({
            player: p.player_name,
            finish: resultMap[p.dg_id] || 999,
            finish_text: fmtFinish(resultMap[p.dg_id] || 999),
            hit5:  (resultMap[p.dg_id] || 999) <= 5,
            hit10: (resultMap[p.dg_id] || 999) <= 10
          }));

          // Calibration bins: for each player, group by model top_10 prob bucket
          const bins = { high: {n:0,h:0}, mid: {n:0,h:0}, low: {n:0,h:0} };
          preds.forEach(p => {
            const prob = p.top_10 || 0;
            const hit = (resultMap[p.dg_id] || 999) <= 10 ? 1 : 0;
            if (prob >= 0.25)      { bins.high.n++; bins.high.h += hit; }
            else if (prob >= 0.10) { bins.mid.n++;  bins.mid.h  += hit; }
            else if (prob >= 0.05) { bins.low.n++;  bins.low.h  += hit; }
          });

          return {
            event_name: archiveEntry.event_name || evt.event_name,
            event_id: evt.event_id,
            start_date: evt.start_date,
            winner: winnerName,
            model_top1: modelTop1 ? modelTop1.player_name : '',
            model_top1_finish: fmtFinish(modelTop1Finish),
            model_top1_won: modelTop1Won,
            model_top1_top5: modelTop1InTop5,
            top5_picks: 5,
            top5_hits: top5hits,
            top10_picks: 10,
            top10_hits: top10hits,
            top10_detail: top10Detail,
            bins
          };
        } catch (err) {
          console.warn(`  ⚠️ Model accuracy: skipped ${evt.event_name}:`, err.message);
          return null;
        }
      }));
      eventResults.push(...batchData.filter(Boolean));
      if (i + 3 < recentEvents.length) await new Promise(r => setTimeout(r, 500));
    }

    // Season totals
    const season = eventResults.reduce((acc, e) => {
      acc.events++;
      acc.top5_picks += e.top5_picks;
      acc.top5_hits  += e.top5_hits;
      acc.top10_picks += e.top10_picks;
      acc.top10_hits  += e.top10_hits;
      if (e.model_top1_won)   acc.top1_wins++;
      if (e.model_top1_top5) acc.top1_top5++;
      ['high','mid','low'].forEach(b => {
        acc.bins[b].n += e.bins[b].n;
        acc.bins[b].h += e.bins[b].h;
      });
      return acc;
    }, { events:0, top5_picks:0, top5_hits:0, top10_picks:0, top10_hits:0, top1_wins:0, top1_top5:0,
         bins:{high:{n:0,h:0},mid:{n:0,h:0},low:{n:0,h:0}} });

    const payload = {
      events: eventResults.sort((a,b) => new Date(b.start_date) - new Date(a.start_date)),
      season
    };
    cache.set(cacheKey, payload, 3600);
    res.json({ success: true, fromCache: false, ...payload });

  } catch (err) {
    console.error('Model accuracy error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// PLAYER RECENT RESULTS — last N event finishes for a player,
// used by the /pro player detail drawer. Reuses the same per-event
// results cache (results-event-{id}-2026) populated by /api/model-accuracy.
// ============================================
app.get('/api/player-recent-results', async (req, res) => {
  const dgId = req.query.dg_id;
  if (!dgId) return res.status(400).json({ success: false, error: 'dg_id is required' });
  const limit = Math.min(parseInt(req.query.limit) || 5, 8);

  try {
    const accCached = cache.get('model-accuracy-2026');
    let recentEvents = (accCached && accCached.events && accCached.events.length)
      ? accCached.events.map(e => ({ event_id: e.event_id, event_name: e.event_name, start_date: e.start_date }))
      : await getRecentCompletedEvents(16);

    recentEvents = recentEvents.slice(0, limit);

    const results = [];
    for (const evt of recentEvents) {
      const resultsCacheKey = `results-event-${evt.event_id}-2026`;
      const resultsRaw = await getCachedJSON(resultsCacheKey, 604800, () =>
        fetchDataGolfDirect(`/historical-event-data/events?tour=pga&event_id=${evt.event_id}&year=2026&file_format=json&key=${DATAGOLF_API_KEY}`)
      );
      const resultsArr = resultsRaw.event_stats || resultsRaw.results || resultsRaw.data || [];
      const row = resultsArr.find(r => String(r.dg_id) === String(dgId));
      if (!row) continue;

      const pos = parseFinish(row.fin_text || row.position || row.fin || row.place);
      results.push({
        event_id: evt.event_id,
        event_name: evt.event_name,
        start_date: evt.start_date,
        finish_text: fmtFinish(pos),
        finish: pos
      });
    }

    res.json({ success: true, results });
  } catch (err) {
    console.error('Player recent results error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// COURSE WEIGHT DERIVATION PIPELINE
// Pulls historical round SG data for N years,
// identifies which categories separated top-N
// finishers from the field, and converts those
// gaps into normalized course-fit weights.
// ============================================

app.get('/api/derive-course-weights', async (req, res) => {
  try {
    const event_id = req.query.event_id;
    if (!event_id) return res.status(400).json({ success: false, error: 'event_id required' });

    const top_n   = Math.min(parseInt(req.query.top_n) || 10, 20);
    const bustCache = req.query.bust === 'true';
    const cacheKey = `derived-weights-${event_id}-top${top_n}`;
    if (bustCache) cache.del(cacheKey);
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ success: true, fromCache: true, ...cached });

    // Default: last 4 completed seasons
    const currentYear = new Date().getFullYear();
    const defaultYears = [currentYear-1, currentYear-2, currentYear-3, currentYear-4].map(String);
    const years = req.query.years ? req.query.years.split(',').map(s => s.trim()) : defaultYears;

    console.log(`  Deriving weights: event_id=${event_id} years=${years.join(',')} top_n=${top_n}`);

    // Fetch each year sequentially to respect rate limits (45/min)
    const yearResults = [];
    for (const year of years) {
      try {
        const data = await fetchDataGolfDirect(
          `/historical-raw-data/rounds?tour=pga&event_id=${event_id}&year=${year}&file_format=json&key=${DATAGOLF_API_KEY}`
        );
        if (data) yearResults.push({ year, data });
        console.log(`    Year ${year}: fetched (${(data.data||data.round_data||data.rounds||[]).length} records)`);
      } catch (e) {
        console.warn(`    Year ${year}: no data (${e.message})`);
      }
      // 200ms gap between calls — comfortably within 45 req/min
      await new Promise(r => setTimeout(r, 220));
    }

    if (!yearResults.length) {
      return res.status(404).json({ success: false, error: `No historical data found for event_id=${event_id}. Check the event ID using /api/historical-events.` });
    }

    // ── Process each year ──────────────────────────────────────────
    const yearGaps = [];
    for (const { year, data } of yearResults) {
      // DataGolf may use different keys — try all known variants
      const rounds = data.data || data.round_data || data.rounds || data.results || [];
      if (!rounds.length) { console.warn(`    Year ${year}: empty rounds array`); continue; }

      // Aggregate per player across all rounds
      const playerMap = new Map();
      for (const r of rounds) {
        const id = r.dg_id || r.player_id;
        if (!id) continue;
        if (!playerMap.has(id)) {
          playerMap.set(id, {
            dg_id: id,
            player_name: r.player_name || r.name || '',
            sg_ott: 0, sg_app: 0, sg_arg: 0, sg_putt: 0, sg_total: 0,
            rounds_played: 0
          });
        }
        const p = playerMap.get(id);
        // Handle both sg_ott and sg_off_the_tee naming conventions
        p.sg_ott  += r.sg_ott  ?? r.sg_off_tee  ?? r.sg_off_the_tee  ?? 0;
        p.sg_app  += r.sg_app  ?? r.sg_approach  ?? 0;
        p.sg_arg  += r.sg_arg  ?? r.sg_around    ?? r.sg_short_game ?? 0;
        p.sg_putt += r.sg_putt ?? r.sg_putting    ?? 0;
        p.sg_total+= r.sg_total?? 0;
        p.rounds_played++;
      }

      // Only players who completed the event (min 4 rounds)
      const completers = [...playerMap.values()].filter(p => p.rounds_played >= 4);
      if (completers.length < top_n + 5) {
        console.warn(`    Year ${year}: only ${completers.length} completers — skipping`);
        continue;
      }

      // Sort by total SG to derive implied finish ranking
      completers.sort((a, b) => b.sg_total - a.sg_total);
      const topN  = completers.slice(0, top_n);
      const field = completers;
      const N     = field.length;

      const fieldMean = cat => field.reduce((s, p) => s + p[cat], 0) / N;
      const topMean   = cat => topN.reduce((s, p) => s + p[cat], 0) / top_n;

      const gaps = {
        ott:  topMean('sg_ott')  - fieldMean('sg_ott'),
        app:  topMean('sg_app')  - fieldMean('sg_app'),
        arg:  topMean('sg_arg')  - fieldMean('sg_arg'),
        putt: topMean('sg_putt') - fieldMean('sg_putt')
      };

      yearGaps.push({ year, field_size: N, top_n_sample: top_n, gaps });
      console.log(`    Year ${year}: gaps ott=${gaps.ott.toFixed(3)} app=${gaps.app.toFixed(3)} arg=${gaps.arg.toFixed(3)} putt=${gaps.putt.toFixed(3)}`);
    }

    if (!yearGaps.length) {
      return res.status(422).json({ success: false, error: 'Could not compute weights — insufficient round data' });
    }

    // ── Weight years (recency bias) and average gaps ───────────────
    const recencyWeights = [1.0, 0.80, 0.65, 0.50, 0.40];
    let wGaps = { ott: 0, app: 0, arg: 0, putt: 0 };
    let wTotal = 0;
    yearGaps.forEach(({ gaps }, i) => {
      const w = recencyWeights[i] ?? 0.40;
      wGaps.ott  += gaps.ott  * w;
      wGaps.app  += gaps.app  * w;
      wGaps.arg  += gaps.arg  * w;
      wGaps.putt += gaps.putt * w;
      wTotal += w;
    });
    const avgGaps = {
      ott:  wGaps.ott  / wTotal,
      app:  wGaps.app  / wTotal,
      arg:  wGaps.arg  / wTotal,
      putt: wGaps.putt / wTotal
    };

    // ── Convert gaps → weights with 10% floor ─────────────────────
    const MIN_W = 0.10;
    const clamped = {
      ott:  Math.max(MIN_W, avgGaps.ott),
      app:  Math.max(MIN_W, avgGaps.app),
      arg:  Math.max(MIN_W, avgGaps.arg),
      putt: Math.max(MIN_W, avgGaps.putt)
    };
    const clampSum = clamped.ott + clamped.app + clamped.arg + clamped.putt;
    let dw = {
      ott:  parseFloat((clamped.ott  / clampSum).toFixed(2)),
      app:  parseFloat((clamped.app  / clampSum).toFixed(2)),
      arg:  parseFloat((clamped.arg  / clampSum).toFixed(2)),
      putt: parseFloat((clamped.putt / clampSum).toFixed(2))
    };
    // Fix any floating-point rounding so they sum to exactly 1.00
    const dwSum = dw.ott + dw.app + dw.arg + dw.putt;
    if (Math.abs(dwSum - 1.0) > 0.001) dw.app = parseFloat((dw.app + (1.0 - dwSum)).toFixed(2));

    const eventName = yearResults[0]?.data?.event_name || '';
    const editorial = getCourseWeights(eventName);

    const result = {
      event_id,
      event_name: eventName,
      years_analyzed:  yearGaps.map(y => y.year),
      players_per_year: yearGaps.map(y => y.field_size),
      top_n_used: top_n,
      derived_weights: dw,
      average_gaps: {
        ott:  parseFloat(avgGaps.ott.toFixed(3)),
        app:  parseFloat(avgGaps.app.toFixed(3)),
        arg:  parseFloat(avgGaps.arg.toFixed(3)),
        putt: parseFloat(avgGaps.putt.toFixed(3))
      },
      year_by_year: yearGaps.map(y => ({
        year: y.year, field_size: y.field_size,
        gaps: { ott: parseFloat(y.gaps.ott.toFixed(3)), app: parseFloat(y.gaps.app.toFixed(3)), arg: parseFloat(y.gaps.arg.toFixed(3)), putt: parseFloat(y.gaps.putt.toFixed(3)) }
      })),
      current_editorial_weights: { ott: editorial.ott, app: editorial.app, arg: editorial.arg, putt: editorial.putt, matched: editorial.matched },
      confidence: yearGaps.length >= 3 ? 'high' : yearGaps.length >= 2 ? 'medium' : 'low',
      total_sample_size: yearGaps.reduce((s, y) => s + y.field_size, 0),
      methodology: 'Gap between top-N and field average SG per category, weighted by recency (most recent year = 1.0, each prior year -0.15). 10% floor applied before normalization.'
    };

    cache.set(cacheKey, result, 604800); // 7 days
    console.log(`  ✓ Derived weights for ${eventName}: ott=${dw.ott} app=${dw.app} arg=${dw.arg} putt=${dw.putt} (${yearGaps.length} years, confidence: ${result.confidence})`);
    res.json({ success: true, fromCache: false, ...result });

  } catch (error) {
    console.error('Derive course weights error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// OPTIMIZED COMPOSITE ENDPOINTS
// ============================================

// ENDPOINT: Homepage Stats (optimized composite with PGA filter)
app.get('/api/homepage-stats', async (req, res) => {
  try {
    const cacheKey = 'homepage-stats-pga';
    const cached = cache.get(cacheKey);
    
    if (cached) {
      console.log(`✓ Cache HIT: ${cacheKey}`);
      return res.json({
        success: true,
        fromCache: true,
        data: cached
      });
    }

    console.log(`✗ Cache MISS: ${cacheKey} - Building homepage stats...`);

    // Ensure PGA player IDs are loaded before filtering
    await updatePGATourPlayerIds();

    // Fetch skill ratings
    const skillRatings = await fetchDataGolfDirect(
      `/preds/skill-ratings?display=value&file_format=json&key=${DATAGOLF_API_KEY}`
    );

    // Filter to PGA Tour only
    const pgaPlayers = filterPGATourOnly(skillRatings.skill_ratings || skillRatings.players || []);

    // Find leaders in each category
    const ottLeader = [...pgaPlayers].sort((a,b) => (b.sg_ott || 0) - (a.sg_ott || 0))[0] || {};
    const appLeader = [...pgaPlayers].sort((a,b) => (b.sg_app || 0) - (a.sg_app || 0))[0] || {};
    const puttLeader = [...pgaPlayers].sort((a,b) => (b.sg_putt || 0) - (a.sg_putt || 0))[0] || {};

    const stats = {
      sgOTT: {
        value: ottLeader.sg_ott ? (ottLeader.sg_ott >= 0 ? `+${ottLeader.sg_ott.toFixed(2)}` : ottLeader.sg_ott.toFixed(2)) : '--',
        player: ottLeader.player_name || 'N/A',
        label: 'SG: Off-the-Tee · Leader · Last 24 Months'
      },
      sgApp: {
        value: appLeader.sg_app ? (appLeader.sg_app >= 0 ? `+${appLeader.sg_app.toFixed(2)}` : appLeader.sg_app.toFixed(2)) : '--',
        player: appLeader.player_name || 'N/A',
        label: 'SG: Approach · Leader · Last 24 Months'
      },
      sgPutt: {
        value: puttLeader.sg_putt ? (puttLeader.sg_putt >= 0 ? `+${puttLeader.sg_putt.toFixed(2)}` : puttLeader.sg_putt.toFixed(2)) : '--',
        player: puttLeader.player_name || 'N/A',
        label: 'SG: Putting · Leader · Last 24 Months'
      },
      timestamp: new Date().toISOString(),
      pga_filtered: true
    };

    cache.set(cacheKey, stats, 21600); // 6hr cache

    res.json({
      success: true,
      fromCache: false,
      data: stats
    });
  } catch (error) {
    console.error('Homepage stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ENDPOINT: Lab Page Data (optimized composite with PGA filter)
app.get('/api/lab-data', async (req, res) => {
  try {
    const cacheKey = 'lab-data-composite-pga';
    const bustCache = req.query.bust === 'true';
    
    if (bustCache) {
      cache.del(cacheKey);
      console.log(`🔄 Cache BUSTED: ${cacheKey}`);
    }
    
    const cached = cache.get(cacheKey);
    
    if (cached) {
      console.log(`✓ Cache HIT: ${cacheKey}`);
      return res.json({
        success: true,
        fromCache: true,
        data: cached
      });
    }

    console.log(`✗ Cache MISS: ${cacheKey} - Building lab data...`);

    // Ensure PGA player IDs are loaded before filtering
    await updatePGATourPlayerIds();

    // Fetch all needed data in parallel (including rankings for complete skill coverage)
    // Archive + approach-skill are new for advanced analytics — they fail gracefully
    const [skillRatings, preTournament, fieldUpdates, schedule, dgRankings, approachRaw] = await Promise.all([
      fetchDataGolfDirect(`/preds/skill-ratings?display=value&file_format=json&key=${DATAGOLF_API_KEY}`),
      fetchDataGolfDirect(`/preds/pre-tournament?tour=pga&odds_format=percent&file_format=json&key=${DATAGOLF_API_KEY}`),
      fetchDataGolfDirect(`/field-updates?tour=pga&file_format=json&key=${DATAGOLF_API_KEY}`),
      fetchDataGolfDirect(`/get-schedule?tour=pga&season=2026&file_format=json&key=${DATAGOLF_API_KEY}`),
      fetchDataGolfDirect(`/preds/get-dg-rankings?file_format=json&key=${DATAGOLF_API_KEY}`),
      // New: Detailed approach-skill breakdown
      fetchDataGolfDirect(`/preds/approach-skill?period=l24&file_format=json&key=${DATAGOLF_API_KEY}`)
        .catch(err => { console.warn('⚠️ Approach-skill fetch failed (non-fatal):', err.message); return null; })
    ]);

    // ── MULTI-EVENT ARCHIVE PIPELINE ──────────────────────────────
    // Fetch prediction archives for the last N completed PGA Tour events
    // plus the current event. Each event needs its own API call with event_id.
    // Results are cached individually (7 days) so repeated /api/lab-data calls
    // only fetch new events, not the whole season again.
    const currentEventId = fieldUpdates.event_id || preTournament.event_id;
    const currentEventName = fieldUpdates.event_name || preTournament.event_name || '';
    
    let multiEventArchive = [];
    try {
      const fullSchedule = schedule.schedule || [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Find completed PGA events this season using the status field from DataGolf schedule
      // (schedule has no end_date — only start_date and status)
      const allCompleted = fullSchedule.filter(e => {
        if (!e.event_id) return false;
        if (e.status !== 'completed') return false;
        // Skip if it's the current event (we fetch that separately below)
        if (String(e.event_id) === String(currentEventId)) return false;
        return true;
      });
      
      // Deduplicate opposite-field events: when two events share the same week
      // (start_dates within 3 days), keep the main event.
      // Main event = one that matches our COURSE_WEIGHTS config (signature/major events).
      // If neither or both match, keep the one that appears first in the schedule.
      const completedEvents = [];
      const used = new Set();
      
      // Sort chronologically first for consistent pairing
      allCompleted.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
      
      for (let i = 0; i < allCompleted.length; i++) {
        if (used.has(allCompleted[i].event_id)) continue;
        
        // Check if the next event is in the same week
        let mainEvent = allCompleted[i];
        for (let j = i + 1; j < allCompleted.length; j++) {
          if (used.has(allCompleted[j].event_id)) continue;
          const daysDiff = Math.abs(
            (new Date(allCompleted[j].start_date) - new Date(allCompleted[i].start_date)) / 86400000
          );
          if (daysDiff <= 3) {
            // Same week — pick the main event (one in COURSE_WEIGHTS)
            const iHasWeights = getCourseWeights(allCompleted[i].event_name).matched;
            const jHasWeights = getCourseWeights(allCompleted[j].event_name).matched;
            if (jHasWeights && !iHasWeights) {
              mainEvent = allCompleted[j];
            }
            // Mark the opposite-field event as used
            used.add(allCompleted[i].event_id);
            used.add(allCompleted[j].event_id);
            break;
          }
        }
        
        used.add(mainEvent.event_id);
        completedEvents.push(mainEvent);
      }
      
      // Sort by start_date descending (most recent first), take last 6
      completedEvents.sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
      const recentCompleted = completedEvents.slice(0, 6);
      
      console.log(`  Archive pipeline: ${completedEvents.length} completed events found, fetching ${recentCompleted.length} most recent`);
      
      // Fetch each event's archive (with per-event caching)
      const archiveFetches = recentCompleted.map(async (evt) => {
        const archiveCacheKey = `archive-event-${evt.event_id}-2026`;
        const cached = cache.get(archiveCacheKey);
        if (cached) {
          return cached;
        }
        
        try {
          const raw = await fetchDataGolfDirect(
            `/preds/pre-tournament-archive?event_id=${evt.event_id}&year=2026&odds_format=percent&file_format=json&key=${DATAGOLF_API_KEY}`
          );
          // Normalize: extract the prediction array and event metadata
          const preds = raw.baseline_history_fit || raw.baseline || [];
          const entry = {
            event_id: evt.event_id,
            event_name: raw.event_name || evt.event_name,
            start_date: evt.start_date,
            end_date: evt.end_date,
            predictions: Array.isArray(preds) ? preds : [],
            models_available: raw.models_available || [],
            event_completed: raw.event_completed != null ? raw.event_completed : true
          };
          // Cache completed event archives for 7 days (they won't change)
          cache.set(archiveCacheKey, entry, 604800);
          return entry;
        } catch (err) {
          console.warn(`  ⚠️ Archive fetch failed for ${evt.event_name} (${evt.event_id}):`, err.message);
          return null;
        }
      });
      
      // Execute fetches in batches of 3 to respect rate limits (45 req/min)
      const batchSize = 3;
      for (let i = 0; i < archiveFetches.length; i += batchSize) {
        const batch = archiveFetches.slice(i, i + batchSize);
        const results = await Promise.all(batch);
        multiEventArchive.push(...results.filter(Boolean));
        // Small delay between batches if more than one batch
        if (i + batchSize < archiveFetches.length) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
      
      // Also fetch the current event's archive
      if (currentEventId) {
        const currentArchiveCacheKey = `archive-event-${currentEventId}-2026`;
        let currentArchive = cache.get(currentArchiveCacheKey);
        if (!currentArchive) {
          try {
            const raw = await fetchDataGolfDirect(
              `/preds/pre-tournament-archive?event_id=${currentEventId}&year=2026&odds_format=percent&file_format=json&key=${DATAGOLF_API_KEY}`
            );
            const preds = raw.baseline_history_fit || raw.baseline || [];
            // Find the current event in the schedule to get its start_date
            const currentScheduleEvent = fullSchedule.find(e => String(e.event_id) === String(currentEventId));
            currentArchive = {
              event_id: currentEventId,
              event_name: raw.event_name || currentEventName,
              start_date: (currentScheduleEvent && currentScheduleEvent.start_date) || null,
              predictions: Array.isArray(preds) ? preds : [],
              models_available: raw.models_available || [],
              event_completed: raw.event_completed != null ? raw.event_completed : false,
              is_current: true
            };
            // Cache current event archive for only 6 hours (predictions may update)
            cache.set(currentArchiveCacheKey, currentArchive, 21600);
          } catch (err) {
            console.warn('  ⚠️ Current event archive fetch failed:', err.message);
          }
        }
        if (currentArchive) {
          currentArchive.is_current = true;
          multiEventArchive.push(currentArchive);
        }
      }
      
      // Sort chronologically (oldest first) for momentum calculation
      multiEventArchive.sort((a, b) => {
        if (a.start_date && b.start_date) return new Date(a.start_date) - new Date(b.start_date);
        if (a.is_current) return 1;
        if (b.is_current) return -1;
        return 0;
      });
      
      console.log(`  ✓ Multi-event archive: ${multiEventArchive.length} events loaded`);
      multiEventArchive.forEach(e => {
        console.log(`    - ${e.event_name}: ${e.predictions.length} predictions${e.is_current ? ' (current)' : ''}`);
      });
      
    } catch (err) {
      console.warn('⚠️ Multi-event archive pipeline failed (non-fatal):', err.message);
    }

    // Filter players to PGA Tour only
    const allPlayers = skillRatings.skill_ratings || skillRatings.players || [];
    const pgaPlayers = filterPGATourOnly(allPlayers);
    
    // Build top rankings by skill estimate.
    // IMPORTANT: We exclude LIV players specifically rather than requiring primary_tour='PGA'.
    // Players like Rory McIlroy (primary_tour='euro') and Tommy Fleetwood compete on
    // the PGA Tour but may not have primary_tour set to 'PGA'. The top 10 globally
    // minus LIV gives us exactly the PGA Tour's best.
    const allRankings = dgRankings.rankings || [];
    const nonLivRankings = allRankings.filter(p => {
      const tour = (p.primary_tour || '').toLowerCase();
      return tour !== 'liv';
    });
    const topRankings = [...nonLivRankings]
      .sort((a, b) => (b.dg_skill_estimate || 0) - (a.dg_skill_estimate || 0))
      .slice(0, 20); // Send top 20, client displays top 10

    // ── Build enriched field list ──────────────────────────────────────
    // For every player in the field, resolve their best skill data.
    // Priority: 1) skill-ratings (full breakdown), 2) rankings (dg_skill_estimate),
    //           3) predictions (dg_skill_estimate)
    const skillLookup = new Map();
    pgaPlayers.forEach(p => { if (p.dg_id) skillLookup.set(p.dg_id, p); });
    
    const rankingLookup = new Map();
    allRankings.forEach(p => { if (p.dg_id) rankingLookup.set(p.dg_id, p); });
    
    const predictions = normalizeTeamPredictions(
      preTournament.baseline_history_fit || preTournament.predictions || []
    );
    const predictionLookup = new Map();
    predictions.forEach(p => { if (p.dg_id) predictionLookup.set(p.dg_id, p); });

    const rawFieldList = fieldUpdates.field || [];
    const enrichedField = rawFieldList.map(fp => {
      const skill = skillLookup.get(fp.dg_id);
      const rank = rankingLookup.get(fp.dg_id);
      const pred = predictionLookup.get(fp.dg_id);
      
      // Best available skill data
      if (skill && skill.sg_total != null) {
        return {
          dg_id: fp.dg_id,
          player_name: fp.player_name,
          country: fp.country || skill.country || '',
          am: fp.am || 0,
          sg_total: skill.sg_total,
          sg_ott: skill.sg_ott || null,
          sg_app: skill.sg_app || null,
          sg_arg: skill.sg_arg || null,
          sg_putt: skill.sg_putt || null,
          _source: 'skill-ratings'
        };
      }
      
      // Fallback: rankings skill estimate
      if (rank && rank.dg_skill_estimate != null) {
        return {
          dg_id: fp.dg_id,
          player_name: fp.player_name,
          country: fp.country || rank.country || '',
          am: fp.am || 0,
          sg_total: rank.dg_skill_estimate,
          sg_ott: null, sg_app: null, sg_arg: null, sg_putt: null,
          _source: 'rankings'
        };
      }
      
      // Fallback: prediction skill estimate
      if (pred && pred.dg_skill_estimate != null) {
        return {
          dg_id: fp.dg_id,
          player_name: fp.player_name,
          country: fp.country || '',
          am: fp.am || 0,
          sg_total: pred.dg_skill_estimate,
          sg_ott: null, sg_app: null, sg_arg: null, sg_putt: null,
          _source: 'predictions'
        };
      }
      
      // No skill data found for this player
      return {
        dg_id: fp.dg_id,
        player_name: fp.player_name,
        country: fp.country || '',
        am: fp.am || 0,
        sg_total: null,
        sg_ott: null, sg_app: null, sg_arg: null, sg_putt: null,
        _source: 'none'
      };
    });
    
    // Log enrichment stats
    const sources = enrichedField.reduce((acc, p) => { acc[p._source] = (acc[p._source] || 0) + 1; return acc; }, {});
    console.log(`  Field enrichment: ${JSON.stringify(sources)} (${enrichedField.length} total)`);
    
    // Simple field list (for backward compat)
    const fieldList = rawFieldList.map(p => ({
      dg_id: p.dg_id,
      player_name: p.player_name,
      country: p.country || '',
      am: p.am || 0
    }));

    // Find current/upcoming event from schedule (fuzzy match for robustness)
    const eventName = fieldUpdates.event_name || preTournament.event_name;
    let currentEvent = schedule.schedule?.find(e => e.event_name === eventName) || null;
    
    // Fuzzy fallback: try partial match if exact match fails
    if (!currentEvent && eventName && schedule.schedule) {
      const normalizedName = eventName.toLowerCase().replace(/[^a-z0-9]/g, '');
      currentEvent = schedule.schedule.find(e => {
        const scheduleName = (e.event_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return scheduleName === normalizedName || scheduleName.includes(normalizedName) || normalizedName.includes(scheduleName);
      });
    }
    
    // Last resort: find the next upcoming event from schedule by date
    if (!currentEvent && schedule.schedule) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      currentEvent = schedule.schedule
        .filter(e => e.end_date && new Date(e.end_date) >= today)
        .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))[0] || null;
    }
    
    currentEvent = currentEvent || {};

    // Extract the event name that predictions are actually FOR (may differ from field-updates event)
    const predictionEventName = preTournament.event_name || null;

    // ── Advanced Analytics Data ──────────────────────────────────────
    // Course weights for the current event
    const courseWeights = getCourseWeights(eventName);
    console.log(`  Course weights: ${courseWeights.match_name} (matched: ${courseWeights.matched})`);

    // Pre-tournament archive — array of past event predictions this season
    // Each entry has: event_name, event_id, predictions: [...], is_current: bool
    const predictionArchive = multiEventArchive;
    console.log(`  Archive: ${predictionArchive.length} events in multi-event archive`);

    // Approach skill detail — detailed distance-bucket breakdown per player
    const approachDetail = approachRaw || null;
    if (approachRaw) {
      const approachPlayers = approachRaw.players || approachRaw || [];
      console.log(`  Approach detail: ${Array.isArray(approachPlayers) ? approachPlayers.length : 0} players`);
    } else {
      console.log('  Approach detail: not available');
    }

    const isTeamEvent = predictions.length > 0 && predictions[0]._is_team === true;

    const compositeData = {
      players: pgaPlayers, // PGA-filtered skill ratings (full breakdown)
      enriched_field: enrichedField, // Every field player with best-available skill data
      top_rankings: topRankings, // Top 20 PGA players by skill estimate
      predictions: predictions,
      prediction_event_name: predictionEventName,
      field_list: fieldList,
      tournament: {
        event_id: fieldUpdates.event_id || currentEvent.event_id,
        event_name: eventName || 'Upcoming Tournament',
        course: currentEvent.course || fieldUpdates.course || fieldUpdates.course_name || '',
        field_size: fieldUpdates.field?.length || 0,
        current_round: fieldUpdates.current_round || 0,
        start_date: currentEvent.start_date || fieldUpdates.date_start || null,
        end_date: currentEvent.end_date || fieldUpdates.date_end || null,
        status: currentEvent.status || 'unknown',
        event_completed: fieldUpdates.event_completed || false,
        is_team_event: isTeamEvent
      },
      // ── New: Advanced Analytics ──
      course_weights: courseWeights,
      prediction_archive: predictionArchive,
      approach_detail: approachDetail,
      timestamp: new Date().toISOString(),
      pga_filtered: true
    };

    // Shorter cache during tournament week (1hr vs 6hr)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = currentEvent.start_date ? new Date(currentEvent.start_date) : null;
    const endDate = currentEvent.end_date ? new Date(currentEvent.end_date) : null;
    const isDuringTournament = startDate && endDate && today >= startDate && today <= endDate;
    const cacheTTL = isDuringTournament ? 300 : 21600; // 5min during tournament, 6hr otherwise
    
    cache.set(cacheKey, compositeData, cacheTTL);

    res.json({
      success: true,
      fromCache: false,
      data: compositeData
    });
  } catch (error) {
    console.error('Lab data error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// UTILITY ENDPOINTS
// ============================================

// UTILITY: Cache status
app.get('/api/cache-status', (req, res) => {
  const keys = cache.keys();
  const stats = cache.getStats();
  
  res.json({
    success: true,
    totalKeys: keys.length,
    keys: keys,
    stats: stats,
    pgaTourFiltering: {
      method: 'primary_tour via rankings lookup',
      playerCount: pgaTourPlayerIds.size,
      lastUpdate: new Date(lastRankingsUpdate).toISOString()
    }
  });
});

// UTILITY: Clear cache
app.post('/api/clear-cache', requireAdmin, (req, res) => {
  const keysToClear = req.body.keys;
  
  if (keysToClear && Array.isArray(keysToClear)) {
    keysToClear.forEach(key => cache.del(key));
    res.json({ success: true, message: `Cleared ${keysToClear.length} keys` });
  } else {
    cache.flushAll();
    res.json({ success: true, message: 'Cleared entire cache' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    cache: {
      keys: cache.keys().length,
      stats: cache.getStats()
    },
    pgaFilter: {
      method: 'primary_tour via rankings lookup',
      active: pgaTourPlayerIds.size > 0,
      playerCount: pgaTourPlayerIds.size
    }
  });
});

// ============================================
// PRO SUBSCRIBER VERIFICATION
// Checks if an email is active in the separate
// Lab Notes Pro Beehiiv publication.
// Env var required: BEEHIIV_PRO_PUB_ID
// ============================================

// Legacy endpoint — kept for backwards compat with old localStorage tokens (no `token` field).
// New gate uses /api/auth/verify-session instead.
app.post('/api/verify-pro', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'Valid email required' });
    }
    const normalEmail = email.trim().toLowerCase();

    // 1. Check new account system first
    const account = await getAccount(normalEmail);
    if (account) {
      const access = getAccountAccess(account);
      if (access.type !== 'none') {
        const isSubscriber = access.type === 'subscriber';
        console.log(`  verify-pro (legacy): ${normalEmail} → account (${access.type})`);
        return res.json({ success: true, verified: isSubscriber, trial: !isSubscriber, days_left: access.daysLeft });
      }
      return res.json({ success: true, verified: false, expired: true });
    }

    // 2. Check Beehiiv Pro subscription
    const apiKey  = process.env.BEEHIIV_API_KEY;
    const proPubId = process.env.BEEHIIV_PRO_PUB_ID;
    if (apiKey && proPubId) {
      const response = await fetch(
        `https://api.beehiiv.com/v2/publications/${proPubId}/subscriptions?email=${encodeURIComponent(normalEmail)}`,
        { headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' } }
      );
      if (response.ok) {
        const data = await response.json();
        if ((data.data || []).some(s => s.status === 'active')) {
          console.log(`  verify-pro (legacy): ${normalEmail} → VERIFIED (Beehiiv)`);
          return res.json({ success: true, verified: true });
        }
      }
    }

    // 3. Check legacy KV trial
    const trial = await kvGet(`trial:${normalEmail}`);
    if (trial && trial.expires > Date.now()) {
      const daysLeft = Math.ceil((trial.expires - Date.now()) / 86400000);
      console.log(`  verify-pro (legacy): ${normalEmail} → legacy trial (${daysLeft}d)`);
      return res.json({ success: true, verified: false, trial: true, days_left: daysLeft, expires: trial.expires });
    }

    console.log(`  verify-pro (legacy): ${normalEmail} → not found`);
    res.json({ success: true, verified: false });
  } catch (error) {
    console.error('Pro verification error:', error);
    res.status(500).json({ success: false, error: 'Verification failed' });
  }
});

// ============================================
// ============================================
// UPSTASH KV HELPERS
// Uses KV_REST_API_URL + KV_REST_API_TOKEN
// set automatically by the Vercel integration
// ============================================

async function kvGet(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data.result) return null;
    return JSON.parse(data.result);
  } catch (e) { return null; }
}

async function kvSet(key, value, ttlSeconds) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return;
  try {
    const cmd = ttlSeconds > 0
      ? ['SET', key, JSON.stringify(value), 'EX', ttlSeconds]
      : ['SET', key, JSON.stringify(value)];
    await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([cmd])
    });
  } catch (e) { console.error('KV set error:', e.message); }
}

async function kvDel(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return;
  try {
    await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['DEL', key]])
    });
  } catch (e) { console.error('KV del error:', e.message); }
}

// Two-layer cache: in-memory (fast within a warm instance) backed by Upstash KV
// (persists across the cold starts that reset NodeCache) — used for per-event
// model-accuracy data so a redeploy/cold-start doesn't re-fetch the whole season.
async function getCachedJSON(key, ttlSeconds, fetchFn) {
  let val = cache.get(key);
  if (val) return val;
  val = await kvGet(key);
  if (val) { cache.set(key, val, ttlSeconds); return val; }
  val = await fetchFn();
  cache.set(key, val, ttlSeconds);
  await kvSet(key, val, ttlSeconds);
  return val;
}

// ============================================
// AUTH HELPERS — password hashing, OTP, sessions
// ============================================

function generateOTP() {
  return String(crypto.randomInt(100000, 999999));
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

function verifyPassword(password, salt, storedHash) {
  try {
    const computed = hashPassword(password, salt);
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(storedHash, 'hex'));
  } catch (e) { return false; }
}

async function getAccount(email) {
  return kvGet(`account:${email.trim().toLowerCase()}`);
}

async function setAccount(email, data) {
  await kvSet(`account:${email.trim().toLowerCase()}`, data, 0);
}

async function getOTPRecord(email) {
  return kvGet(`otp:${email.trim().toLowerCase()}`);
}

async function setOTPRecord(email, code, purpose) {
  await kvSet(`otp:${email.trim().toLowerCase()}`, { code, purpose, expires: Date.now() + 15 * 60 * 1000 }, 900);
}

async function delOTPRecord(email) {
  await kvDel(`otp:${email.trim().toLowerCase()}`);
}

async function getSession(token) {
  return kvGet(`session:${token}`);
}

async function setSession(token, email, ttlSeconds) {
  await kvSet(`session:${token}`, { email, created: Date.now(), expires: Date.now() + ttlSeconds * 1000 }, ttlSeconds);
}

async function delSession(token) {
  await kvDel(`session:${token}`);
}

// Returns { type, daysLeft } for a given account record
function getAccountAccess(account) {
  const now = Date.now();
  if (account.accessType === 'subscriber') return { type: 'subscriber', daysLeft: null };
  if (account.accessType === 'gifted' && account.giftExpires > now) {
    return { type: 'gifted', daysLeft: Math.ceil((account.giftExpires - now) / 86400000) };
  }
  if (account.trialExpires && account.trialExpires > now) {
    return { type: 'trial', daysLeft: Math.ceil((account.trialExpires - now) / 86400000) };
  }
  return { type: 'none', daysLeft: null };
}

async function sendOTPEmail(email, code, purpose) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) throw new Error('RESEND_API_KEY not configured');

  const isReset = purpose === 'reset';
  const subject = isReset
    ? `Reset your Divot Lab password — code: ${code}`
    : `Divot Lab verification code: ${code}`;

  const headingText = isReset ? 'Reset your password' : 'Verify your email';
  const bodyText = isReset
    ? 'Use this code to set a new password. It expires in 15 minutes.'
    : 'Use this code to finish creating your Divot Lab Pro account. It expires in 15 minutes.';

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0A0A0A;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:480px;margin:0 auto;padding:40px 24px;">
  <div style="margin-bottom:28px;">
    <span style="font-size:16px;font-weight:700;color:#C9A84C;letter-spacing:0.08em;">DIVOT LAB</span>
  </div>
  <h2 style="font-size:22px;font-weight:600;color:#FAFAFA;margin:0 0 10px 0;">${headingText}</h2>
  <p style="color:rgba(250,250,250,0.55);font-size:14px;line-height:1.6;margin:0 0 28px 0;">${bodyText}</p>
  <div style="background:#161614;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:28px;text-align:center;margin-bottom:28px;">
    <span style="font-family:monospace;font-size:40px;font-weight:700;letter-spacing:0.3em;color:#5BBF85;">${code}</span>
  </div>
  <p style="color:rgba(250,250,250,0.3);font-size:12px;margin:0;line-height:1.6;">
    If you didn't request this, you can safely ignore this email.
  </p>
</div>
</body></html>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Divot Lab <noreply@divotlab.com>', to: [email], subject, html })
  });

  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(`Resend error: ${r.status} ${err.message || ''}`);
  }
}

// Appends a JSON-serialized value to a Redis list — used for referral signup logs
async function kvListAppend(key, value) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return;
  try {
    await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['RPUSH', key, JSON.stringify(value)]])
    });
  } catch (e) { console.error('KV list append error:', e.message); }
}

// Returns the full contents of a Redis list, JSON-parsed
async function kvListRange(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return [];
  try {
    const res = await fetch(`${url}/lrange/${encodeURIComponent(key)}/0/-1`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!Array.isArray(data.result)) return [];
    return data.result.map(item => {
      try { return JSON.parse(item); } catch (e) { return item; }
    });
  } catch (e) { return []; }
}

// ============================================
// FREE TRIAL ENDPOINTS
// POST /api/start-trial  — creates a 14-day trial (1 per email, ever)
// verify-pro also checks trial status
// ============================================

app.post('/api/start-trial', async (req, res) => {
  try {
    const { email, source, referral_code } = req.body || {};
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'Valid email required' });
    }

    const normalEmail = email.trim().toLowerCase();
    const referredBy = referral_code ? String(referral_code).trim() : null;
    const key = `trial:${normalEmail}`;
    const existing = await kvGet(key);

    if (existing) {
      const daysLeft = Math.ceil((existing.expires - Date.now()) / 86400000);
      if (existing.expires > Date.now()) {
        // Trial still active — let them back in
        return res.json({ success: true, already_active: true, days_left: daysLeft, expires: existing.expires });
      }
      // Trial expired
      return res.json({ success: false, expired: true, error: 'Your free trial has ended. Subscribe to continue.' });
    }

    // Create new trial
    const expires = Date.now() + 14 * 24 * 60 * 60 * 1000;
    const utmSource = source || 'pro-trial';
    const trial = { email: normalEmail, started: Date.now(), expires, converted: false, source: utmSource, referredBy };

    // Store active trial (14-day TTL for auth checks)
    await kvSet(key, trial, 14 * 24 * 60 * 60);

    // Store permanent log entry so the email is never lost after trial expires
    await kvSet(`trial-log:${normalEmail}`, { ...trial, logged_at: Date.now() }, 0);

    // Track referral signup for manual monthly payout review (admin.html "Referrals" section)
    if (referredBy) {
      await kvListAppend(`referrals:${referredBy}`, { email: normalEmail, started: trial.started });
    }

    // Add to free Beehiiv newsletter so we can email them during the trial
    const apiKey = process.env.BEEHIIV_API_KEY;
    const pubId = process.env.BEEHIIV_PUB_ID;
    if (apiKey && pubId) {
      try {
        await fetch(`https://api.beehiiv.com/v2/publications/${pubId}/subscriptions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            email: normalEmail,
            utm_source: utmSource,
            utm_medium: 'trial',
            referring_site: 'divotlab.com/pro'
          })
        });
      } catch (e) {
        console.warn('Beehiiv subscribe on trial failed (non-fatal):', e.message);
      }
    }

    console.log(`✓ Trial started: ${normalEmail} (source: ${utmSource}${referredBy ? ', ref: ' + referredBy : ''})`);
    res.json({ success: true, trial: true, days_left: 14, expires });
  } catch (error) {
    console.error('Start trial error:', error);
    res.status(500).json({ success: false, error: 'Could not start trial' });
  }
});

// ============================================
// ACCOUNT AUTH ENDPOINTS
// ============================================

// Step 1 of gate: check if an account exists for this email
app.post('/api/auth/check-email', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email || !email.includes('@')) return res.status(400).json({ success: false, error: 'Valid email required' });
    const account = await getAccount(email);
    res.json({ success: true, exists: !!account, verified: account ? !!account.emailVerified : false });
  } catch (e) {
    console.error('check-email error:', e);
    res.status(500).json({ success: false, error: 'Could not check email' });
  }
});

// Send a 6-digit OTP to the user's email (purpose: 'signup' | 'reset')
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { email, purpose } = req.body || {};
    if (!email || !email.includes('@')) return res.status(400).json({ success: false, error: 'Valid email required' });
    if (!['signup', 'reset'].includes(purpose)) return res.status(400).json({ success: false, error: 'Invalid purpose' });

    const normalEmail = email.trim().toLowerCase();

    if (purpose === 'reset') {
      const account = await getAccount(normalEmail);
      if (!account) return res.status(404).json({ success: false, error: 'No account found with that email.' });
    }

    const code = generateOTP();
    await setOTPRecord(normalEmail, code, purpose);

    try {
      await sendOTPEmail(normalEmail, code, purpose);
      console.log(`  OTP sent: ${normalEmail} (${purpose})`);
      res.json({ success: true });
    } catch (emailErr) {
      console.error('OTP email failed:', emailErr.message);
      res.status(503).json({ success: false, error: 'Could not send verification email. Please try again.' });
    }
  } catch (e) {
    console.error('send-otp error:', e);
    res.status(500).json({ success: false, error: 'Could not send verification code' });
  }
});

// Create a new account after OTP verification
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, otp, password, gift_code } = req.body || {};
    if (!email || !email.includes('@')) return res.status(400).json({ success: false, error: 'Valid email required' });
    if (!otp || String(otp).trim().length !== 6) return res.status(400).json({ success: false, error: 'Invalid verification code' });
    if (!password || password.length < 8) return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });

    const normalEmail = email.trim().toLowerCase();

    const storedOTP = await getOTPRecord(normalEmail);
    if (!storedOTP || storedOTP.purpose !== 'signup' || storedOTP.code !== String(otp).trim() || storedOTP.expires < Date.now()) {
      return res.status(400).json({ success: false, error: 'Incorrect or expired verification code' });
    }

    const existing = await getAccount(normalEmail);
    if (existing && existing.emailVerified) {
      return res.status(409).json({ success: false, error: 'An account with this email already exists. Please sign in.' });
    }

    // Check gift code
    let giftData = null;
    const giftKey = gift_code ? String(gift_code).toUpperCase() : null;
    if (giftKey) giftData = await kvGet(`gift:${giftKey}`);

    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);
    const now = Date.now();

    const account = {
      email: normalEmail,
      passwordHash, passwordSalt: salt,
      emailVerified: true,
      createdAt: now,
      accessType: giftData ? 'gifted' : 'trial',
      trialExpires: giftData ? null : now + 14 * 24 * 60 * 60 * 1000,
      giftExpires: giftData ? now + giftData.days * 24 * 60 * 60 * 1000 : null,
      giftCode: giftData ? giftKey : null,
      referredBy: null
    };

    await delOTPRecord(normalEmail);

    // Record gift code use
    if (giftData) {
      giftData.uses = [...(giftData.uses || []), { email: normalEmail, activatedAt: now }];
      await kvSet(`gift:${giftKey}`, giftData, 0);
    }

    // Check if they're already a paid Beehiiv Pro subscriber (paid before creating account)
    const bApiKey = process.env.BEEHIIV_API_KEY;
    const bProPubId = process.env.BEEHIIV_PRO_PUB_ID;
    if (bApiKey && bProPubId) {
      try {
        const r = await fetch(`https://api.beehiiv.com/v2/publications/${bProPubId}/subscriptions?email=${encodeURIComponent(normalEmail)}`, {
          headers: { Authorization: `Bearer ${bApiKey}`, Accept: 'application/json' }
        });
        const d = await r.json();
        if ((d.data || []).some(s => s.status === 'active')) {
          account.accessType = 'subscriber';
          account.trialExpires = null;
        }
      } catch (e) { /* non-fatal */ }
    }

    await setAccount(normalEmail, account);

    // Create 30-day session
    const sessionToken = generateSessionToken();
    await setSession(sessionToken, normalEmail, 30 * 24 * 60 * 60);

    // Subscribe to free newsletter (non-fatal)
    if (bApiKey && process.env.BEEHIIV_PUB_ID) {
      fetch(`https://api.beehiiv.com/v2/publications/${process.env.BEEHIIV_PUB_ID}/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bApiKey}` },
        body: JSON.stringify({ email: normalEmail, utm_source: giftData ? 'gift' : 'trial', utm_medium: 'pro-signup' })
      }).catch(e => console.warn('Beehiiv subscribe (non-fatal):', e.message));
    }

    const access = getAccountAccess(account);
    console.log(`✓ Account created: ${normalEmail} (${access.type})`);
    res.json({ success: true, token: sessionToken, email: normalEmail, access_type: access.type, days_left: access.daysLeft });
  } catch (e) {
    console.error('signup error:', e);
    res.status(500).json({ success: false, error: 'Could not create account' });
  }
});

// Login with email + password
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !email.includes('@')) return res.status(400).json({ success: false, error: 'Valid email required' });
    if (!password) return res.status(400).json({ success: false, error: 'Password required' });

    const normalEmail = email.trim().toLowerCase();
    const account = await getAccount(normalEmail);

    if (!account || !account.passwordHash || !verifyPassword(password, account.passwordSalt, account.passwordHash)) {
      return res.status(401).json({ success: false, error: 'Incorrect email or password' });
    }

    // Check if they've become a paid subscriber since account creation
    if (account.accessType !== 'subscriber') {
      const apiKey = process.env.BEEHIIV_API_KEY;
      const proPubId = process.env.BEEHIIV_PRO_PUB_ID;
      if (apiKey && proPubId) {
        try {
          const r = await fetch(`https://api.beehiiv.com/v2/publications/${proPubId}/subscriptions?email=${encodeURIComponent(normalEmail)}`, {
            headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }
          });
          const d = await r.json();
          if ((d.data || []).some(s => s.status === 'active')) {
            account.accessType = 'subscriber';
            await setAccount(normalEmail, account);
          }
        } catch (e) { /* non-fatal */ }
      }
    }

    const access = getAccountAccess(account);
    if (access.type === 'none') {
      return res.status(403).json({ success: false, error: 'Your access has expired.', expired: true });
    }

    const sessionToken = generateSessionToken();
    await setSession(sessionToken, normalEmail, 30 * 24 * 60 * 60);
    console.log(`✓ Login: ${normalEmail} (${access.type})`);

    res.json({ success: true, token: sessionToken, email: normalEmail, access_type: access.type, days_left: access.daysLeft });
  } catch (e) {
    console.error('login error:', e);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// Validate a session token — called on every page load
app.post('/api/auth/verify-session', async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.json({ valid: false });

    const session = await getSession(token);
    if (!session || session.expires < Date.now()) return res.json({ valid: false });

    const account = await getAccount(session.email);
    if (!account) return res.json({ valid: false });

    const access = getAccountAccess(account);
    if (access.type === 'none') return res.json({ valid: false, expired: true });

    res.json({ valid: true, email: session.email, access_type: access.type, days_left: access.daysLeft });
  } catch (e) {
    console.error('verify-session error:', e);
    res.status(500).json({ valid: false });
  }
});

// OTP-based password reset
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, otp, new_password } = req.body || {};
    if (!email || !email.includes('@')) return res.status(400).json({ success: false, error: 'Valid email required' });
    if (!otp || String(otp).trim().length !== 6) return res.status(400).json({ success: false, error: 'Invalid verification code' });
    if (!new_password || new_password.length < 8) return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });

    const normalEmail = email.trim().toLowerCase();
    const storedOTP = await getOTPRecord(normalEmail);
    if (!storedOTP || storedOTP.purpose !== 'reset' || storedOTP.code !== String(otp).trim() || storedOTP.expires < Date.now()) {
      return res.status(400).json({ success: false, error: 'Incorrect or expired verification code' });
    }

    const account = await getAccount(normalEmail);
    if (!account) return res.status(404).json({ success: false, error: 'Account not found' });

    const salt = generateSalt();
    account.passwordHash = hashPassword(new_password, salt);
    account.passwordSalt = salt;
    await setAccount(normalEmail, account);
    await delOTPRecord(normalEmail);

    const sessionToken = generateSessionToken();
    await setSession(sessionToken, normalEmail, 30 * 24 * 60 * 60);

    const access = getAccountAccess(account);
    console.log(`✓ Password reset: ${normalEmail}`);
    res.json({ success: true, token: sessionToken, email: normalEmail, access_type: access.type, days_left: access.daysLeft });
  } catch (e) {
    console.error('reset-password error:', e);
    res.status(500).json({ success: false, error: 'Could not reset password' });
  }
});

// Invalidate a session on sign-out
app.post('/api/auth/signout', async (req, res) => {
  try {
    const { token } = req.body || {};
    if (token) await delSession(token);
    res.json({ success: true });
  } catch (e) { res.json({ success: true }); }
});

// ============================================
// GIFT CODE SYSTEM
// Admin creates codes; partners redeem at signup
// gift:{CODE} in KV — no TTL (admin manages lifecycle)
// gift-codes-index in KV — array of all code strings
// ============================================

app.get('/api/admin/gift-codes', requireAdmin, async (req, res) => {
  try {
    const index = await kvGet('gift-codes-index') || [];
    const codes = (await Promise.all(index.map(async c => {
      const d = await kvGet(`gift:${c}`);
      return d ? { code: c, ...d } : null;
    }))).filter(Boolean);
    res.json({ success: true, codes });
  } catch (e) {
    console.error('gift-codes list error:', e);
    res.status(500).json({ success: false, error: 'Could not load gift codes' });
  }
});

app.post('/api/admin/gift-codes', requireAdmin, async (req, res) => {
  try {
    const { description, days, maxUses, code: customCode } = req.body || {};
    if (!description) return res.status(400).json({ success: false, error: 'Description required' });

    const d = parseInt(days) || 90;
    const max = parseInt(maxUses) || -1;
    const code = customCode
      ? String(customCode).toUpperCase().replace(/[^A-Z0-9-]/g, '')
      : 'DL-' + crypto.randomBytes(3).toString('hex').toUpperCase();

    if (await kvGet(`gift:${code}`)) return res.status(409).json({ success: false, error: 'Code already exists' });

    const giftData = { description, days: d, maxUses: max, uses: [], active: true, created: Date.now() };
    await kvSet(`gift:${code}`, giftData, 0);

    const index = await kvGet('gift-codes-index') || [];
    if (!index.includes(code)) { index.push(code); await kvSet('gift-codes-index', index, 0); }

    console.log(`✓ Gift code created: ${code} (${d} days)`);
    res.json({ success: true, code, ...giftData });
  } catch (e) {
    console.error('gift-code create error:', e);
    res.status(500).json({ success: false, error: 'Could not create gift code' });
  }
});

app.delete('/api/admin/gift-codes/:code', requireAdmin, async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const giftData = await kvGet(`gift:${code}`);
    if (!giftData) return res.status(404).json({ success: false, error: 'Code not found' });
    giftData.active = false;
    await kvSet(`gift:${code}`, giftData, 0);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: 'Could not deactivate code' }); }
});

// Apply a gift code to an already-authenticated account
app.post('/api/auth/redeem-gift', async (req, res) => {
  try {
    const { token, gift_code } = req.body || {};
    if (!token || !gift_code) return res.status(400).json({ success: false, error: 'Token and gift_code required' });

    const session = await getSession(token);
    if (!session || session.expires < Date.now()) return res.status(401).json({ success: false, error: 'Invalid session' });

    const code = String(gift_code).toUpperCase();
    const giftData = await kvGet(`gift:${code}`);
    if (!giftData || !giftData.active) return res.status(404).json({ success: false, error: 'Invalid or expired gift code' });
    if (giftData.maxUses > 0 && (giftData.uses || []).length >= giftData.maxUses) {
      return res.status(410).json({ success: false, error: 'This gift code has reached its maximum uses' });
    }

    const account = await getAccount(session.email);
    if (!account) return res.status(404).json({ success: false, error: 'Account not found' });

    const now = Date.now();
    account.accessType = 'gifted';
    account.giftExpires = now + giftData.days * 24 * 60 * 60 * 1000;
    account.giftCode = code;
    await setAccount(session.email, account);

    giftData.uses = [...(giftData.uses || []), { email: session.email, activatedAt: now }];
    await kvSet(`gift:${code}`, giftData, 0);

    console.log(`✓ Gift redeemed: ${session.email} → ${code} (${giftData.days} days)`);
    res.json({ success: true, days: giftData.days, expires: account.giftExpires, description: giftData.description });
  } catch (e) {
    console.error('redeem-gift error:', e);
    res.status(500).json({ success: false, error: 'Could not redeem gift code' });
  }
});

// ============================================
// ENDPOINT: Referral signup lookup (admin-only, for manual monthly payout review)
// GET /api/referral-stats?code=X
app.get('/api/referral-stats', requireAdmin, async (req, res) => {
  try {
    const code = (req.query.code || '').trim();
    if (!code) {
      return res.status(400).json({ success: false, error: 'code is required' });
    }
    const signups = await kvListRange(`referrals:${code}`);
    res.json({ success: true, code, count: signups.length, signups });
  } catch (error) {
    console.error('Referral stats error:', error);
    res.status(500).json({ success: false, error: 'Could not load referral stats' });
  }
});

// STRIPE WEBHOOK + BEEHIIV PRO SYNC
// Automatically adds/removes Beehiiv Pro subscribers
// when a Stripe trial starts or subscription ends.
// Env vars: STRIPE_WEBHOOK_SECRET, STRIPE_SECRET_KEY,
//           BEEHIIV_API_KEY, BEEHIIV_PRO_PUB_ID
// ============================================

function verifyStripeSignature(rawBody, sigHeader, secret) {
  const tPart = sigHeader.split(',').find(p => p.startsWith('t='));
  const v1Part = sigHeader.split(',').find(p => p.startsWith('v1='));
  if (!tPart || !v1Part) return false;
  const timestamp = tPart.slice(2);
  const received = v1Part.slice(3);
  const payload = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
  } catch (e) {
    return false;
  }
}

async function beehiivAddProSubscriber(email) {
  const apiKey = process.env.BEEHIIV_API_KEY;
  const proPubId = process.env.BEEHIIV_PRO_PUB_ID;
  if (!apiKey || !proPubId) throw new Error('Beehiiv Pro not configured');
  const res = await fetch(`https://api.beehiiv.com/v2/publications/${proPubId}/subscriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ email: email.trim().toLowerCase(), reactivate_existing: true, send_welcome_email: false })
  });
  if (!res.ok && res.status !== 409) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Beehiiv add failed: ${res.status} ${err.message || ''}`);
  }
  console.log(`✓ Beehiiv Pro: added ${email}`);
}

async function beehiivRemoveProSubscriber(email) {
  const apiKey = process.env.BEEHIIV_API_KEY;
  const proPubId = process.env.BEEHIIV_PRO_PUB_ID;
  if (!apiKey || !proPubId) throw new Error('Beehiiv Pro not configured');
  // Look up subscriber ID by email
  const searchRes = await fetch(
    `https://api.beehiiv.com/v2/publications/${proPubId}/subscriptions?email=${encodeURIComponent(email.trim().toLowerCase())}`,
    { headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' } }
  );
  if (!searchRes.ok) throw new Error(`Beehiiv lookup failed: ${searchRes.status}`);
  const data = await searchRes.json();
  const sub = (data.data || []).find(s => s.status === 'active');
  if (!sub) { console.log(`  Beehiiv Pro: ${email} not found or already inactive`); return; }
  const delRes = await fetch(
    `https://api.beehiiv.com/v2/publications/${proPubId}/subscriptions/${sub.id}`,
    { method: 'DELETE', headers: { 'Authorization': `Bearer ${apiKey}` } }
  );
  if (!delRes.ok) throw new Error(`Beehiiv delete failed: ${delRes.status}`);
  console.log(`✓ Beehiiv Pro: removed ${email}`);
}

async function getStripeCustomerEmail(customerId) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY not configured');
  const res = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
    headers: { 'Authorization': `Bearer ${secretKey}` }
  });
  if (!res.ok) throw new Error(`Stripe customer fetch failed: ${res.status}`);
  const customer = await res.json();
  return customer.email || null;
}

async function handleStripeWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    console.error('⚠️  STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).send('Webhook not configured');
  }

  const rawBody = req.body.toString('utf8');

  if (!verifyStripeSignature(rawBody, sig || '', secret)) {
    console.warn('⚠️  Stripe webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (e) {
    return res.status(400).send('Invalid JSON');
  }

  console.log(`Stripe webhook: ${event.type}`);

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      // Only handle subscription checkouts (not one-time payments)
      if (session.mode !== 'subscription') return res.json({ received: true });
      const email = session.customer_email || session.customer_details?.email;
      if (email) {
        await beehiivAddProSubscriber(email);
        // Update KV account immediately so active sessions reflect subscriber status without re-login
        const account = await getAccount(email);
        if (account) {
          account.accessType = 'subscriber';
          account.stripeCustomerId = session.customer || account.stripeCustomerId;
          await setAccount(email, account);
          console.log(`  KV account upgraded to subscriber: ${email}`);
        }
      } else {
        console.warn('  checkout.session.completed: no email found in session');
      }

    } else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const email = await getStripeCustomerEmail(sub.customer);
      if (email) {
        await beehiivRemoveProSubscriber(email);
        // Revert KV account — if trial is still active they keep trial access, otherwise none
        const account = await getAccount(email);
        if (account && account.accessType === 'subscriber') {
          const now = Date.now();
          const trialStillActive = account.trialExpires && account.trialExpires > now;
          const giftStillActive = account.giftExpires && account.giftExpires > now;
          account.accessType = giftStillActive ? 'gifted' : trialStillActive ? 'trial' : 'none';
          await setAccount(email, account);
          console.log(`  KV account reverted to ${account.accessType}: ${email}`);
        }
      } else {
        console.warn('  customer.subscription.deleted: could not resolve customer email');
      }

    } else if (event.type === 'customer.subscription.updated') {
      // Catch cancellations that come through as status change before deletion
      const sub = event.data.object;
      const prevStatus = event.data.previous_attributes?.status;
      if (sub.status === 'canceled' && prevStatus && prevStatus !== 'canceled') {
        const email = await getStripeCustomerEmail(sub.customer);
        if (email) {
          await beehiivRemoveProSubscriber(email);
          const account = await getAccount(email);
          if (account && account.accessType === 'subscriber') {
            const now = Date.now();
            account.accessType = (account.trialExpires && account.trialExpires > now) ? 'trial' : 'none';
            await setAccount(email, account);
          }
        }
      }
    }
  } catch (err) {
    console.error('Stripe webhook handler error:', err.message);
    // Still return 200 so Stripe doesn't retry — log the error and investigate manually
  }

  res.json({ received: true });
}

// ============================================
// BEEHIIV SUBSCRIBE PROXY
// Accepts email from lab-notes page, subscribes via Beehiiv API
// Env vars: BEEHIIV_API_KEY, BEEHIIV_PUB_ID
// ============================================
app.post('/api/subscribe', async (req, res) => {
  try {
    const apiKey = process.env.BEEHIIV_API_KEY;
    const pubId = process.env.BEEHIIV_PUB_ID;

    if (!apiKey || !pubId) {
      return res.status(500).json({ success: false, error: 'Beehiiv not configured' });
    }

    const { email, utm_source } = req.body || {};

    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'Valid email required' });
    }

    const response = await fetch(`https://api.beehiiv.com/v2/publications/${pubId}/subscriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        utm_source: utm_source || 'lab-notes-page',
        referring_site: 'divotlab.com/lab-notes'
      })
    });

    const data = await response.json();

    if (response.ok) {
      res.json({ success: true, message: 'Subscribed successfully' });
    } else {
      // Beehiiv returns 409 if already subscribed — treat as success
      if (response.status === 409) {
        res.json({ success: true, message: 'Already subscribed' });
      } else {
        console.error('Beehiiv API error:', data);
        res.status(response.status).json({ success: false, error: data.message || 'Subscribe failed' });
      }
    }
  } catch (error) {
    console.error('Subscribe proxy error:', error);
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// ============================================
// PRACTICE PLAN — PERSONALIZED INSIGHT (Claude Haiku)
// ============================================
app.post('/api/personalize-insight', aiLimiter, async (req, res) => {
  try {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return res.status(500).json({ success: false, error: 'ANTHROPIC_API_KEY not configured' });
    }

    const { name, handicap, weakness, weaknessLabel, goals, practiceDays, areas } = req.body || {};

    if (!name || handicap === undefined || !weakness) {
      return res.status(400).json({ success: false, error: 'Missing required fields: name, handicap, weakness' });
    }

    // Format handicap display
    const hcDisplay = handicap < 0 ? `+${Math.abs(handicap)}` : `${handicap}`;
    const skillLevel = handicap < 0 ? 'plus handicap (elite)' :
                       handicap <= 5 ? 'low single-digit (advanced)' :
                       handicap <= 12 ? 'mid-handicap (intermediate)' :
                       handicap <= 20 ? 'developing (mid-high)' : 'beginner (high handicap)';

    // Build priority summary from areas
    const areaSummary = (areas || []).map((a, i) => `${i + 1}. ${a.label} (score: ${a.score})`).join(', ');
    const goalsList = (goals || []).join(', ') || 'general improvement';

    const systemPrompt = `You are a golf performance coach writing a personalized analysis for a practice plan PDF. Write in second person ("you"). Be direct, specific, and encouraging without being cheesy. Reference the golfer's name naturally (once or twice, not every sentence). Use strokes gained concepts where relevant. No fluff — every sentence should feel like it earns its place. Do NOT use bullet points or lists. Write 3 tight paragraphs, approximately 150-200 words total.`;

    const userPrompt = `Write a personalized practice plan analysis for:

Name: ${name}
Handicap Index: ${hcDisplay} (${skillLevel})
Primary weakness: ${weaknessLabel || weakness} 
Priority order: ${areaSummary}
Goals: ${goalsList}
Practice days per week: ${practiceDays}

Write 3 paragraphs:
1. Open with their specific situation — acknowledge their handicap level and what the data reveals about where they're losing strokes. Make it feel like you've studied their game.
2. Explain WHY their primary weakness matters more than they think, using strokes gained context. Reference how tour players or scratch golfers compare in this area.
3. Close with what this plan is designed to do over 90 days given their ${practiceDays} days/week schedule, and set realistic expectations for improvement. Be honest about what's achievable.`;

    console.log(`🏌️ Generating personalized insight for ${name} (${hcDisplay} hcp, weakness: ${weakness})`);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [
          { role: 'user', content: userPrompt }
        ],
        system: systemPrompt
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Claude API error:', errText);
      return res.status(500).json({ success: false, error: 'Claude API call failed' });
    }

    const data = await response.json();
    const insight = data.content?.[0]?.text || '';

    console.log(`✓ Insight generated: ${insight.length} chars`);

    res.json({ success: true, insight });

  } catch (error) {
    console.error('Personalize insight error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate insight' });
  }
});

// ============================================
// BLOG GENERATOR ENDPOINTS
// ============================================
const blogGenerator = require('./blog-generator');

// In-memory store for draft posts (persists during server lifecycle)
const blogDrafts = new Map();

// ENDPOINT: Generate a blog post
app.post('/api/generate-blog', strictLimiter, requireAdmin, async (req, res) => {
  try {
    const { type = 'tournament_preview', topic } = req.body || {};
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    
    if (!anthropicKey) {
      return res.status(500).json({ success: false, error: 'ANTHROPIC_API_KEY not configured' });
    }
    
    if (!blogGenerator.blogConfig.post_types[type]) {
      return res.status(400).json({ 
        success: false, 
        error: `Invalid post type: ${type}. Valid types: ${Object.keys(blogGenerator.blogConfig.post_types).join(', ')}` 
      });
    }

    console.log(`📝 Generating blog post: type=${type}, topic=${topic || 'auto'}`);

    // 1. Fetch data using the same pipeline as /api/lab-data
    //    This ensures PGA filtering, field matching, and data structure are identical
    const labDataFetcher = async () => {
      const [skillRatings, preTournament, fieldUpdates, schedule] = await Promise.all([
        fetchDataGolfDirect(`/preds/skill-ratings?display=value&file_format=json&key=${DATAGOLF_API_KEY}`),
        fetchDataGolfDirect(`/preds/pre-tournament?tour=pga&odds_format=percent&file_format=json&key=${DATAGOLF_API_KEY}`),
        fetchDataGolfDirect(`/field-updates?tour=pga&file_format=json&key=${DATAGOLF_API_KEY}`),
        fetchDataGolfDirect(`/get-schedule?tour=pga&season=2026&file_format=json&key=${DATAGOLF_API_KEY}`)
      ]);

      const allPlayers = skillRatings.skill_ratings || skillRatings.players || [];
      const pgaPlayers = filterPGATourOnly(allPlayers);
      const eventName = fieldUpdates.event_name || preTournament.event_name;
      const currentEvent = schedule.schedule?.find(e => e.event_name === eventName) || {};
      const predictionEventName = preTournament.event_name || null;
      const fieldList = (fieldUpdates.field || []).map(p => ({
        dg_id: p.dg_id,
        player_name: p.player_name,
        country: p.country || '',
        am: p.am || 0
      }));

      // Also include schedule for recap logic (finding last completed event)
      const fullSchedule = schedule.schedule || [];
      
      return {
        players: pgaPlayers,
        predictions: preTournament.baseline_history_fit || preTournament.predictions || [],
        prediction_event_name: predictionEventName,
        field_list: fieldList,
        tournament: {
          event_id: fieldUpdates.event_id || currentEvent.event_id,
          event_name: eventName || 'Upcoming Tournament',
          course: currentEvent.course || fieldUpdates.course || '',
          field_size: fieldUpdates.field?.length || 0,
          current_round: fieldUpdates.current_round || 0,
          start_date: currentEvent.start_date || null,
          end_date: currentEvent.end_date || null,
          status: currentEvent.status || 'unknown',
          event_completed: fieldUpdates.event_completed || false
        },
        schedule: fullSchedule
      };
    };

    const rawData = await blogGenerator.fetchTournamentData(labDataFetcher);
    
    // 2. Build structured data context
    const dataContext = blogGenerator.buildDataContext(rawData);
    console.log(`✓ Data context built: ${dataContext.tournament.name}, ${dataContext.field_strength.total_players} players`);

    // 3. Build prompts
    const systemPrompt = blogGenerator.buildSystemPrompt();
    const userPrompt = blogGenerator.buildUserPrompt(type, dataContext, topic);

    // 4. Call Claude API
    console.log('🤖 Calling Claude API...');
    const postData = await blogGenerator.callClaudeAPI(systemPrompt, userPrompt, anthropicKey);
    console.log(`✓ Generated: "${postData.title}" (${postData.slug})`);

    // 5. Assemble full HTML
    const fullHTML = blogGenerator.assembleHTML(postData);

    // 6. Store as draft
    const draftId = postData.slug || `draft-${Date.now()}`;
    const calculatedReadTime = blogGenerator.calculateReadTime(postData.body_html);
    blogDrafts.set(draftId, {
      ...postData,
      read_time: calculatedReadTime,
      html: fullHTML,
      type: type,
      generated_at: new Date().toISOString(),
      status: 'draft',
      data_context: {
        tournament: dataContext.tournament.name,
        field_size: dataContext.tournament.field_size
      }
    });

    res.json({
      success: true,
      draft: {
        id: draftId,
        title: postData.title,
        slug: postData.slug,
        category: postData.category,
        date: postData.date,
        read_time: calculatedReadTime,
        meta_description: postData.meta_description,
        preview_url: `/api/blog-drafts/${draftId}`,
        generated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Blog generation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ENDPOINT: List all drafts
app.get('/api/blog-drafts', (req, res) => {
  const drafts = [];
  for (const [id, draft] of blogDrafts) {
    drafts.push({
      id,
      title: draft.title,
      slug: draft.slug,
      category: draft.category,
      date: draft.date,
      type: draft.type,
      status: draft.status,
      generated_at: draft.generated_at,
      preview_url: `/api/blog-drafts/${id}`
    });
  }
  // Newest first
  drafts.sort((a, b) => new Date(b.generated_at) - new Date(a.generated_at));
  res.json({ success: true, drafts });
});

// ENDPOINT: Preview a specific draft (returns full HTML page)
app.get('/api/blog-drafts/:slug', (req, res) => {
  const draft = blogDrafts.get(req.params.slug);
  if (!draft) {
    return res.status(404).json({ success: false, error: 'Draft not found' });
  }
  
  // If ?json=true, return metadata; otherwise return the full HTML for preview
  if (req.query.json === 'true') {
    return res.json({
      success: true,
      draft: {
        id: req.params.slug,
        title: draft.title,
        slug: draft.slug,
        category: draft.category,
        date: draft.date,
        meta_description: draft.meta_description,
        body_html: draft.body_html,
        status: draft.status,
        generated_at: draft.generated_at
      }
    });
  }
  
  // Return full HTML for browser preview
  res.setHeader('Content-Type', 'text/html');
  res.send(draft.html);
});

// ENDPOINT: Download draft as HTML file
app.get('/api/blog-drafts/:slug/download', (req, res) => {
  const draft = blogDrafts.get(req.params.slug);
  if (!draft) {
    return res.status(404).json({ success: false, error: 'Draft not found' });
  }
  
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Content-Disposition', `attachment; filename="${draft.slug}.html"`);
  res.send(draft.html);
});

// ============================================
// BLOG REGISTRY ENDPOINTS
// ============================================
const blogRegistry = require('./blog-registry.json');

// GET all published posts (for articles page and homepage)
app.get('/api/blog-posts', (req, res) => {
  const { category, limit, offset } = req.query;
  let posts = [...blogRegistry.posts];
  
  // Sort by date descending (newest first)
  posts.sort((a, b) => new Date(b.date_iso) - new Date(a.date_iso));
  
  // Filter by category if specified
  if (category && category !== 'all') {
    posts = posts.filter(p => p.category_class === category);
  }
  
  const total = posts.length;
  
  // Pagination
  const off = parseInt(offset) || 0;
  const lim = parseInt(limit) || 50;
  posts = posts.slice(off, off + lim);
  
  res.json({ success: true, total, posts });
});

// GET the 3 most recent posts (for homepage "From the Lab" section)
app.get('/api/blog-posts/latest', (req, res) => {
  const limit = parseInt(req.query.limit) || 3;
  const posts = [...blogRegistry.posts]
    .sort((a, b) => new Date(b.date_iso) - new Date(a.date_iso))
    .slice(0, limit);
  res.json({ success: true, posts });
});

// GET "Read Next" recommendations for a given post
app.get('/api/blog-posts/:slug/read-next', (req, res) => {
  const currentSlug = req.params.slug;
  const current = blogRegistry.posts.find(p => p.slug === currentSlug);
  const limit = parseInt(req.query.limit) || 2;
  
  // Always exclude current slug, even if it's not in the registry yet
  let candidates = blogRegistry.posts
    .filter(p => p.slug !== currentSlug)
    .sort((a, b) => new Date(b.date_iso) - new Date(a.date_iso));
  
  // If we know the current post's category, diversify picks
  let picks = [];
  if (current) {
    const diffCategory = candidates.filter(p => p.category_class !== current.category_class);
    const sameCategory = candidates.filter(p => p.category_class === current.category_class);
    if (diffCategory.length > 0) picks.push(diffCategory[0]);
    if (sameCategory.length > 0) picks.push(sameCategory[0]);
  }
  
  // Fill remaining slots with most recent candidates not already picked
  if (picks.length < limit) {
    const remaining = candidates.filter(p => !picks.find(pk => pk.slug === p.slug));
    picks.push(...remaining.slice(0, limit - picks.length));
  }
  picks = picks.slice(0, limit);
  
  res.json({ success: true, posts: picks });
});

// POST a new blog post to the registry (called after reviewing a draft)
app.post('/api/blog-posts', requireAdmin, (req, res) => {
  const { slug, title, category, category_class, date, date_iso, read_time, meta_description, hero_image, hero_alt, hero_credit, featured } = req.body || {};
  
  if (!slug || !title) {
    return res.status(400).json({ success: false, error: 'slug and title are required' });
  }
  
  // Check for duplicate
  if (blogRegistry.posts.find(p => p.slug === slug)) {
    return res.status(409).json({ success: false, error: `Post with slug "${slug}" already exists` });
  }
  
  const newPost = {
    slug,
    title,
    category: category || 'PGA Tour',
    category_class: category_class || 'pga',
    date: date || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    date_iso: date_iso || new Date().toISOString().split('T')[0],
    read_time: read_time || '8 min read',
    meta_description: meta_description || '',
    hero_image: hero_image || null,
    hero_alt: hero_alt || '',
    hero_credit: hero_credit || '',
    featured: featured || false
  };
  
  blogRegistry.posts.unshift(newPost);
  
  res.json({ success: true, post: newPost, total: blogRegistry.posts.length });
});

// PUT — update a registry entry (e.g., add a hero image later)
app.put('/api/blog-posts/:slug', requireAdmin, (req, res) => {
  const idx = blogRegistry.posts.findIndex(p => p.slug === req.params.slug);
  if (idx === -1) {
    return res.status(404).json({ success: false, error: 'Post not found' });
  }
  
  const updates = req.body || {};
  // Only allow updating safe fields
  const allowed = ['title', 'category', 'category_class', 'date', 'date_iso', 'read_time', 'meta_description', 'hero_image', 'hero_alt', 'hero_credit', 'featured'];
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      blogRegistry.posts[idx][key] = updates[key];
    }
  }
  
  res.json({ success: true, post: blogRegistry.posts[idx] });
});

// Also enhance generate-blog: auto-register draft when published
// (The POST /api/blog-posts endpoint above handles manual registration)

// Start server
app.listen(PORT, () => {
  console.log(`
╔═════════════════════════════════════════════╗
║     DIVOT LAB API SERVER v2.1               ║
║     DataGolf Integration + PGA Tour Filter  ║
╚═════════════════════════════════════════════╝

✓ Server running on port ${PORT}
✓ Cache enabled with intelligent TTL
✓ PGA Tour filtering via primary_tour field
✓ Ready to serve requests

📊 GENERAL USE:
  GET  /api/players                (7day)
  GET  /api/schedule               (7day)
  GET  /api/field-updates          (1hr)

🎯 MODEL PREDICTIONS:
  GET  /api/rankings               (24hr) ⭐ PGA FILTERED
  GET  /api/skill-ratings          (24hr) ⭐ PGA FILTERED
  GET  /api/pre-tournament         (6hr)
  GET  /api/pre-tournament-archive (7day)
  GET  /api/player-decompositions  (6hr)
  GET  /api/approach-skill         (24hr)
  GET  /api/fantasy-projections    (6hr)

🔴 LIVE MODEL:
  GET  /api/live-tournament        (5min)
  GET  /api/live-stats             (5min)
  GET  /api/live-hole-stats        (5min)

⛳ COURSE FIT:
  GET  /api/course-fit             (6hr / 30min live) ⭐ NEW

💰 BETTING TOOLS:
  GET  /api/betting-odds           (30min)
  GET  /api/matchup-odds           (30min)
  GET  /api/matchup-all-pairings   (30min)

📈 HISTORICAL DATA:
  GET  /api/historical-events           (7day)
  GET  /api/historical-rounds           (7day)
  GET  /api/historical-event-list       (7day)
  GET  /api/historical-event-results    (7day)
  GET  /api/historical-odds-list        (7day)
  GET  /api/historical-odds-outrights   (7day) ⭐ ANNUAL PLAN
  GET  /api/historical-odds-matchups    (7day) ⭐ ANNUAL PLAN
  GET  /api/historical-dfs-list         (7day) ⭐ ANNUAL PLAN
  GET  /api/historical-dfs              (7day) ⭐ ANNUAL PLAN
  GET  /api/derive-course-weights       (7day) ⭐ ANNUAL PLAN

🎁 OPTIMIZED COMPOSITES:
  GET  /api/homepage-stats         (6hr) ⭐ PGA FILTERED
  GET  /api/lab-data               (6hr) ⭐ PGA FILTERED

💳 STRIPE / SUBSCRIPTIONS:
  POST /api/stripe-webhook      (Stripe → Beehiiv Pro sync)
  POST /api/verify-pro          (check active Pro sub)
  POST /api/subscribe           (free newsletter signup)

🔧 UTILITIES:
  GET  /api/cache-status
  POST /api/clear-cache
  GET  /health

📝 BLOG GENERATOR:
  POST /api/generate-blog           (Claude API)
  GET  /api/blog-drafts             (list drafts)
  GET  /api/blog-drafts/:slug       (preview draft)
  GET  /api/blog-drafts/:slug/download (download HTML)

🏌️ PRACTICE PLAN:
  POST /api/personalize-insight     (Claude Haiku — personalized paragraph)

📰 BLOG REGISTRY:
  GET  /api/blog-posts              (all posts, ?category=pga&limit=10)
  GET  /api/blog-posts/latest       (homepage cards, ?limit=3)
  GET  /api/blog-posts/:slug/read-next (read next recs)
  POST /api/blog-posts              (register new post)
  PUT  /api/blog-posts/:slug        (update post metadata)

⚠️  API Key secured server-side
🏌️  PGA Tour filter: Uses primary_tour === "PGA"
  `);
});
// test
module.exports = app;// trigger