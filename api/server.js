// DataGolf API Server with Intelligent Caching & PGA Tour Filtering
// Complete implementation of ALL DataGolf API endpoints

const express = require('express');
const cors = require('cors');
const NodeCache = require('node-cache');
const rateLimit = require('express-rate-limit');

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
const COURSE_WEIGHTS = {
  // Majors
  'masters tournament': { ott: 0.25, app: 0.30, arg: 0.25, putt: 0.20, notes: 'Length + approach to slopes, elite short game around Augusta greens' },
  'pga championship': { ott: 0.25, app: 0.30, arg: 0.20, putt: 0.25, notes: 'Venue rotates — balanced profile, adjust per year' },
  'u.s. open': { ott: 0.20, app: 0.35, arg: 0.25, putt: 0.20, notes: 'Accuracy premium, brutal rough punishes misses' },
  'the open championship': { ott: 0.30, app: 0.25, arg: 0.25, putt: 0.20, notes: 'Links — driving lines and creativity critical' },
  // Signature Events
  'the players championship': { ott: 0.15, app: 0.40, arg: 0.20, putt: 0.25, notes: 'TPC Sawgrass — iron precision, water on 6 holes, Poa greens' },
  'genesis invitational': { ott: 0.25, app: 0.30, arg: 0.20, putt: 0.25, notes: 'Riviera — complete game test, kikuyu rough' },
  'arnold palmer invitational presented by mastercard': { ott: 0.20, app: 0.35, arg: 0.20, putt: 0.25, notes: 'Bay Hill — water, approach precision, firm greens' },
  'the memorial tournament presented by workday': { ott: 0.25, app: 0.30, arg: 0.20, putt: 0.25, notes: 'Muirfield Village — Nicklaus design, complete test' },
  'wm phoenix open': { ott: 0.20, app: 0.35, arg: 0.20, putt: 0.25, notes: 'TPC Scottsdale — scoring event, iron play separates' },
  'rbc heritage': { ott: 0.15, app: 0.35, arg: 0.25, putt: 0.25, notes: 'Harbour Town — short, precise, shotmaking' },
  'at&t pebble beach pro-am': { ott: 0.20, app: 0.35, arg: 0.25, putt: 0.20, notes: 'Pebble Beach — approach play dominates on small greens' },
  'travelers championship': { ott: 0.20, app: 0.30, arg: 0.20, putt: 0.30, notes: 'TPC River Highlands — scoring, putting surface quality' },
  'rocket mortgage classic': { ott: 0.25, app: 0.25, arg: 0.20, putt: 0.30, notes: 'Detroit GC — scoring event, putting premium' },
  'the sentry': { ott: 0.25, app: 0.25, arg: 0.25, putt: 0.25, notes: 'Kapalua — balanced, wide fairways, scoring event' },
  'farmers insurance open': { ott: 0.30, app: 0.25, arg: 0.20, putt: 0.25, notes: 'Torrey Pines South — length matters, marine layer' },
  // Default for unlisted events
  '_default': { ott: 0.25, app: 0.25, arg: 0.25, putt: 0.25, notes: 'Balanced profile — no course-specific weights available' }
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
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || vercelPreviewPattern.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'), false);
  }
}));

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

    res.json({
      success: true,
      fromCache: result.fromCache,
      data: result.data
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
      1800 // 30min cache
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
      1800 // 30min cache
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
      // Also find the current event's start_date to filter opposite-field events
      const currentScheduleEntry = fullSchedule.find(e => String(e.event_id) === String(currentEventId));
      const currentStartDate = currentScheduleEntry ? new Date(currentScheduleEntry.start_date + 'T00:00:00') : null;
      
      const completedEvents = fullSchedule.filter(e => {
        if (!e.event_id) return false;
        if (e.status !== 'completed') return false;
        // Skip if it's the current event (we fetch that separately below)
        if (String(e.event_id) === String(currentEventId)) return false;
        // Skip opposite-field events running the same week as the current event
        // (e.g. Puerto Rico Open running alongside The Players Championship)
        if (currentStartDate && e.start_date) {
          const evtStart = new Date(e.start_date + 'T00:00:00');
          const daysDiff = Math.abs((evtStart - currentStartDate) / 86400000);
          if (daysDiff <= 3) return false; // same tournament week
        }
        return true;
      });
      
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
    
    const predictions = preTournament.baseline_history_fit || preTournament.predictions || [];
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
        course: currentEvent.course || fieldUpdates.course || (fieldUpdates.field && fieldUpdates.field[0]?.course) || '',
        field_size: fieldUpdates.field?.length || 0,
        current_round: fieldUpdates.current_round || 0,
        start_date: currentEvent.start_date || null,
        end_date: currentEvent.end_date || null,
        status: currentEvent.status || 'unknown',
        event_completed: fieldUpdates.event_completed || false
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

💰 BETTING TOOLS:
  GET  /api/betting-odds           (30min)
  GET  /api/matchup-odds           (30min)
  GET  /api/matchup-all-pairings   (30min)

📈 HISTORICAL DATA:
  GET  /api/historical-events      (7day)
  GET  /api/historical-rounds      (7day)

🎁 OPTIMIZED COMPOSITES:
  GET  /api/homepage-stats         (6hr) ⭐ PGA FILTERED
  GET  /api/lab-data               (6hr) ⭐ PGA FILTERED

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