// DataGolf API Server with Intelligent Caching & PGA Tour Filtering
// Complete implementation of ALL DataGolf API endpoints

const express = require('express');
const cors = require('cors');
const NodeCache = require('node-cache');

const app = express();
const PORT = process.env.PORT || 3001;

// CRITICAL: Never expose this key client-side
const DATAGOLF_API_KEY = 'dc8cd870e0460b9fb860cf59164e';
const DATAGOLF_BASE_URL = 'https://feeds.datagolf.com';

// Lab Picks password (server-side only)
const LAB_PICKS_PASSWORD = 'lab2026picks';

// Caching with intelligent TTL
const cache = new NodeCache({
  stdTTL: 3600,
  checkperiod: 120,
  useClones: false
});

// Cache for PGA Tour player IDs from rankings
let pgaTourPlayerIds = new Set();
let lastRankingsUpdate = 0;

// Middleware
app.use(cors());
app.use(express.json());

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
    console.log('🏌️ Updating PGA Tour player IDs from rankings...');
    const rankings = await fetchDataGolfDirect(
      `/preds/get-dg-rankings?file_format=json&key=${DATAGOLF_API_KEY}`
    );
    
    if (rankings.rankings) {
      pgaTourPlayerIds = new Set(
        rankings.rankings
          .filter(p => p.primary_tour === 'PGA')
          .map(p => p.dg_id)
      );
      lastRankingsUpdate = now;
      console.log(`✅ Updated PGA Tour player IDs: ${pgaTourPlayerIds.size} players`);
    }
  } catch (error) {
    console.error('❌ Error updating PGA player IDs:', error);
  }
}

// Filter function - uses player IDs from rankings
function filterPGATourOnly(players) {
  if (!players || players.length === 0) return [];
  if (pgaTourPlayerIds.size === 0) {
    console.warn('⚠️ PGA player IDs not loaded yet, returning all players');
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

    // Apply PGA Tour filter using primary_tour field directly
    let rankings = result.data.rankings || [];
    if (req.query.pga_only === 'true') {
      rankings = rankings.filter(p => p.primary_tour === 'PGA');
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
      300 // 5min cache
    );

    res.json({
      success: true,
      fromCache: result.fromCache,
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
      300 // 5min cache
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
      300 // 5min cache
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

    // Fetch all needed data in parallel
    const [skillRatings, preTournament, fieldUpdates, schedule] = await Promise.all([
      fetchDataGolfDirect(`/preds/skill-ratings?display=value&file_format=json&key=${DATAGOLF_API_KEY}`),
      fetchDataGolfDirect(`/preds/pre-tournament?tour=pga&odds_format=percent&file_format=json&key=${DATAGOLF_API_KEY}`),
      fetchDataGolfDirect(`/field-updates?tour=pga&file_format=json&key=${DATAGOLF_API_KEY}`),
      fetchDataGolfDirect(`/get-schedule?tour=pga&season=2026&file_format=json&key=${DATAGOLF_API_KEY}`)
    ]);

    // Filter players to PGA Tour only
    const allPlayers = skillRatings.skill_ratings || skillRatings.players || [];
    const pgaPlayers = filterPGATourOnly(allPlayers);

    // Find current/upcoming event from schedule
    const eventName = fieldUpdates.event_name || preTournament.event_name;
    const currentEvent = schedule.schedule?.find(e => e.event_name === eventName) || {};

    const compositeData = {
      players: pgaPlayers, // NOW PGA ONLY ✅
      predictions: preTournament.baseline_history_fit || preTournament.predictions || [],
      tournament: {
        event_id: fieldUpdates.event_id || currentEvent.event_id,
        event_name: eventName || 'Upcoming Tournament',
        course: currentEvent.course || fieldUpdates.course || (fieldUpdates.field && fieldUpdates.field[0]?.course) || '',
        field_size: fieldUpdates.field?.length || 0,
        current_round: fieldUpdates.current_round || 0,
        start_date: currentEvent.start_date || null,
        status: currentEvent.status || 'unknown'
      },
      timestamp: new Date().toISOString(),
      pga_filtered: true
    };

    cache.set(cacheKey, compositeData, 21600); // 6hr cache

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
app.post('/api/clear-cache', (req, res) => {
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

⚠️  API Key secured server-side
🏌️  PGA Tour filter: Uses primary_tour === "PGA"
  `);
});

module.exports = app;
// ============================================
// BLOG GENERATOR ENDPOINT
// ============================================

app.get('/api/generate-blog/:round', async (req, res) => {
  try {
    const round = req.params.round;
    const mode = req.query.mode || 'auto';
    
    console.log(`📝 Generating ${mode} blog for ${round}...`);
    
    // Fetch core data
    const [preTournament, liveStatsData, skillRatings] = await Promise.all([
      fetchDataGolfDirect(`/preds/pre-tournament?tour=pga&file_format=json&key=${DATAGOLF_API_KEY}`),
      fetchDataGolfDirect(`/preds/live-tournament-stats?stats=sg_putt,sg_arg,sg_app,sg_ott,sg_total&round=event_avg&display=value&file_format=json&key=${DATAGOLF_API_KEY}`),
      fetchDataGolfDirect(`/preds/skill-ratings?display=value&file_format=json&key=${DATAGOLF_API_KEY}`)
    ]);
    
    const currentEvent = preTournament.schedule.find(e => e.event_completed === false) || preTournament.schedule[0];
    const pgaPlayers = filterPGATourOnly(skillRatings.skill_ratings || []);
    const liveStats = liveStatsData.live_stats || [];
    
    if (!Array.isArray(liveStats) || liveStats.length === 0) {
      return res.status(400).send(generateNoDataHTML());
    }
    
    const leaderboard = [...liveStats]
      .filter(p => p.total !== null && p.total !== undefined)
      .sort((a, b) => a.total - b.total)
      .slice(0, 15);
    
    if (leaderboard.length === 0) {
      return res.status(400).send(generateNoDataHTML());
    }
    
    const leader = leaderboard[0];
    let selectedMode = mode === 'auto' ? determineAutoMode(leaderboard, leader) : mode;
    
    const baseData = {
      tournament: currentEvent.event_name || liveStatsData.event_name || 'PGA Tour',
      course: liveStatsData.course_name || 'TPC Scottsdale',
      currentRound: 4,
      round: round,
      leaderboard: leaderboard,
      leader: {
        name: leader.player_name,
        score: leader.total,
        sgTotal: leader.sg_total || 0,
        sgOTT: leader.sg_ott || 0,
        sgApp: leader.sg_app || 0,
        sgArg: leader.sg_arg || 0,
        sgPutt: leader.sg_putt || 0
      },
      liveStats: liveStats,
      allPlayers: pgaPlayers,
      publishDate: new Date().toISOString().split('T')[0]
    };
    
    const roundTextMap = { 'r1': 'Round 1', 'r2': 'Round 2', 'r3': 'Round 3', 'final': 'Final Round' };
    const roundText = roundTextMap[round] || 'Tournament Update';
    
    let content;
    switch(selectedMode) {
      case 'deep':
        content = generateDeepStatsContent(baseData, roundText, {});
        break;
      case 'ai':
        content = await generateAIBlogEnhanced(baseData);
        break;
      default:
        content = generateNewsContent(baseData, roundText, {});
    }
    
    const html = wrapInHTMLTemplate(baseData, roundText, content, selectedMode);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
    
  } catch (error) {
    console.error('Blog generation error:', error);
    res.status(500).send(generateErrorHTML(error));
  }
});

function determineAutoMode(leaderboard, leader) {
  if (leaderboard.length >= 2) {
    const leadSize = Math.abs(leaderboard[1].total - leaderboard[0].total);
    if (leadSize >= 5) return 'deep';
  }
  const maxSG = Math.max(Math.abs(leader.sg_ott || 0), Math.abs(leader.sg_app || 0), Math.abs(leader.sg_arg || 0), Math.abs(leader.sg_putt || 0));
  if (maxSG > 2.0) return 'deep';
  if (leaderboard.length >= 5) {
    const top5Spread = Math.abs(leaderboard[4].total - leaderboard[0].total);
    if (top5Spread <= 2) return 'news';
  }
  return 'news';
}

async function generateAIBlogEnhanced(data) {
  const context = buildAIContext(data);
  return await generateWithClaudeAPI(context);
}

function buildAIContext(data) {
  const { leader, leaderboard, tournament, course } = data;
  const chasePack = leaderboard.slice(1, 4).map(p => ({
    name: p.player_name,
    score: p.total,
    behind: Math.abs(p.total - leader.score)
  }));
  return { tournament, course, currentRound: data.currentRound, leader: { name: leader.name, score: leader.score, sgTotal: leader.sgTotal, sgOTT: leader.sgOTT, sgApp: leader.sgApp, sgArg: leader.sgArg, sgPutt: leader.sgPutt }, chasePack };
}

async function generateWithClaudeAPI(context) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.warn('No Anthropic API key - using fallback');
      return generateFallbackAIContent(context);
    }
    
    const prompt = `You are a professional golf writer. Write a compelling blog analyzing this tournament.

DATA: ${JSON.stringify(context, null, 2)}

REQUIREMENTS:
- 4 paragraphs: intro, analysis, conclusion, deeper
- SEO-optimized with player names, tournament, course
- 400-600 words total
- Data-driven insights, compare to norms
- Authoritative but accessible tone

RETURN ONLY THIS JSON:
{
  "intro": "paragraph text",
  "analysis": "paragraph text", 
  "conclusion": "paragraph text",
  "deeper": "paragraph text"
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] })
    });
    
    if (!response.ok) throw new Error(`Claude API error: ${response.statusText}`);
    const result = await response.json();
    const parsed = JSON.parse(result.content[0].text);
    return { intro: parsed.intro, analysis: parsed.analysis, conclusion: parsed.conclusion, deeper: parsed.deeper || '' };
  } catch (error) {
    console.error('Claude API failed:', error);
    return generateFallbackAIContent(context);
  }
}

function generateFallbackAIContent(context) {
  const leader = context.leader;
  const chasePack = context.chasePack || [];
  const chaser = chasePack[0] || { name: 'the field', behind: 'multiple strokes' };
  
  if (parseFloat(leader.sgPutt) > parseFloat(leader.sgApp)) {
    return {
      intro: `The putter is carrying ${leader.name} at ${context.course}. Currently at ${leader.score} through ${context.currentRound} rounds, the leader has gained ${leader.sgPutt} strokes putting per round—opening up distance on the field.`,
      analysis: `Putting gains of this magnitude rarely sustain over 72 holes. Tour data shows players who rely heavily on putting typically see regression to the mean in final rounds. Meanwhile, ${leader.name}'s approach play (${leader.sgApp}) is merely competent. The lead is real, but fragile.`,
      conclusion: `${chaser.name} sits ${chaser.behind} back with steadier ball-striking. If ${leader.name}'s putter cools even slightly on Sunday, this tournament reopens. The data suggests borrowed strokes, not owned ones.`,
      deeper: `Putting-based leads are volatile. A player can gain three strokes one day and lose two the next, all while hitting identical putts. ${leader.name} has been on the right side of variance all week. Sunday reveals whether it continues.`
    };
  } else {
    return {
      intro: `Ball-striking is dictating the ${context.tournament} leaderboard. ${leader.name} leads at ${leader.score}, but the real story is how: ${leader.sgApp} strokes gained on approach through ${context.currentRound} rounds puts the leader in a different class.`,
      analysis: `Iron play gains stick. Unlike putting, which swings wildly round-to-round, approach play tends to persist. ${leader.name} is hitting quality shots into greens, creating birdie opportunities through skill, not luck. When a player controls ball flight this precisely, leads compound.`,
      conclusion: `${chaser.name} needs to make up ${chaser.behind} strokes on someone gaining ground with the most predictable stat in golf. The math favors ${leader.name}. Barring a collapse, this one's decided by execution, not drama.`,
      deeper: `The statistical profile here is textbook dominance: elite approach play creating scoring chances, solid putting converting them. That's the formula that wins majors. ${leader.name} is executing it at the highest level, and nothing in the data suggests that changes Sunday.`
    };
  }
}

function generateNewsContent(data, roundText) {
  const { leader, leaderboard, tournament, course, currentRound } = data;
  const formatScore = (s) => !s ? 'E' : s > 0 ? `+${s}` : `${s}`;
  const leadSize = leaderboard.length >= 2 ? Math.abs(leaderboard[1].total - leader.score) : 0;
  
  if (leadSize >= 5) {
    return {
      intro: `${leader.name} has built a commanding ${leadSize}-stroke lead at ${course}, turning the ${tournament} into what looks increasingly like a coronation. Through ${currentRound} rounds at ${formatScore(leader.score)}, the leader has separated from a field now playing for second place. The margin isn't luck—it's systematic execution compounded over 54 holes.`,
      analysis: `This isn't a lucky hot streak—it's systematic domination. The Strokes Gained data shows ${leader.name} is outperforming the field by multiple strokes per round across the board. When you're hitting quality shots this consistently, leads don't evaporate. They compound. What started as a small advantage Thursday has become an insurmountable gap by Saturday evening.`,
      conclusion: `${leaderboard[1].player_name} would need both a career round and a leader collapse. That's not a strategy. It's hope. The numbers say this one's over—Sunday is about the margin, not the outcome. A five-stroke lead with 18 holes to play is large enough that even a mediocre Sunday holds. ${leader.name} doesn't need to be brilliant. Just competent.`,
      deeper: `The real question now is whether this becomes a wire-to-wire win or if we see any drama at all. History suggests leads this size hold 87% of the time. ${leader.name} is already playing the percentages, and the percentages are overwhelmingly in favor of the leader. What looked competitive Thursday morning is now a procession.`
    };
  } else if (leadSize <= 2) {
    return {
      intro: `After ${currentRound} rounds at ${course}, the ${tournament} has three live contenders separated by two strokes. ${leader.name} leads at ${formatScore(leader.score)}, but ${leaderboard[1].player_name} and ${leaderboard[2].player_name} are close enough that one good run Sunday changes everything. This is the kind of leaderboard that produces drama—multiple realistic winners, a course that rewards aggressive play, and enough strokes on the table to flip the board multiple times before it's over.`,
      analysis: `What makes tight leaderboards fascinating is seeing HOW each player got there. Different strengths, different paths, same destination. ${leader.name} has been the steadiest performer across all categories, never spectacular but never making critical mistakes. ${leaderboard[1].player_name} has relied more heavily on one area of the game, which creates both opportunity and risk. When the lead is this thin, whoever finds their best stuff early on Sunday likely takes it.`,
      conclusion: `This is the kind of Sunday setup golf fans live for: multiple realistic winners, a course that rewards aggressive play, and enough strokes on the table to flip the board multiple times. Buckle up. The final round here isn't going to be cautious. It can't be. Protect mode doesn't work when you're trailing by one and need birdies. Someone is going to step on the gas, and when they do, the whole thing opens up.`,
      deeper: `Sunday's winning score probably comes in somewhere around ${formatScore(leader.score - 3)} to ${formatScore(leader.score - 5)}. That means the leaders need to shoot in the mid-to-low 60s just to keep pace with each other. This isn't a grind-it-out Sunday. This is a shootout. And shootouts produce moments.`
    };
  } else {
    return {
      intro: `${leader.name} owns a ${leadSize}-stroke lead heading into Sunday at ${course}. It's not insurmountable—but it's substantial enough that ${leaderboard[1].player_name} and ${leaderboard[2].player_name} are now chasing rather than competing. The difference matters. Chasers have to be aggressive. Leaders get to be conservative. That psychological dynamic alone is worth a stroke or two before anyone even tees off Sunday morning.`,
      analysis: `The lead was built on consistent ball-striking, the kind that tends to hold up under pressure. While ${leaderboard[1].player_name} has shown flashes of brilliance, making up ${leadSize} strokes requires sustained excellence over 18 holes. It's possible—golf has seen comebacks from worse positions—but the probabilities lean heavily toward ${leader.name}. Statistically, leads of this size hold up about 73% of the time.`,
      conclusion: `Sunday will answer one question: does the leader protect par and cruise, or do we get fireworks? Either way, ${leader.name} controls the tournament now. The chasers need help. ${leader.name} just needs to avoid mistakes. One of those positions is far easier to play from than the other, and it's not the one trying to make up ground.`,
      deeper: `The path to victory for ${leaderboard[1].player_name} requires multiple things to break right simultaneously: a hot start, some wobbles from the leader, and enough momentum to actually close the gap before it's too late. Golf tournaments aren't won on what-ifs, though. They're won on execution. And right now, ${leader.name} is the one executing.`
    };
  }
}

function generateDeepStatsContent(data) {
  const { leader } = data;
  const formatSG = (v) => !v ? '+0.00' : v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
  const sorted = [
    { value: leader.sgApp, label: 'SG: Approach' },
    { value: leader.sgOTT, label: 'SG: Off-the-Tee' },
    { value: leader.sgArg, label: 'SG: Around-the-Green' },
    { value: leader.sgPutt, label: 'SG: Putting' }
  ].sort((a, b) => b.value - a.value);
  const strongest = sorted[0];
  const second = sorted[1];
  
  return {
    intro: `The numbers reveal the full picture at the ${data.tournament}. ${leader.name} isn't just leading—the leader is dominating through ${strongest.label.toLowerCase()}, gaining ${formatSG(strongest.value)} strokes per round in that category alone. But the statistical profile goes deeper than one standout category. This is comprehensive excellence across the entire game.`,
    analysis: `Breaking down the statistical profile: ${leader.name} ranks in the top tier across all Strokes Gained categories this week. The ${formatSG(leader.sgTotal)} total strokes gained represents elite ball-striking combined with solid short game execution. This isn't a one-dimensional performance—it's comprehensive excellence. While ${strongest.label.toLowerCase()} leads the way at ${formatSG(strongest.value)}, ${second.label.toLowerCase()} isn't far behind at ${formatSG(second.value)}. When a player is gaining strokes in multiple areas simultaneously, leads don't just hold—they expand.`,
    conclusion: `Field averages tell us most players are hovering around even strokes gained. ${leader.name} is outpacing that baseline by multiple strokes per round. That gap doesn't close without either a historic comeback or a historic collapse. The data overwhelmingly favors the leader holding on. Statistically, performances this dominant tend to sustain through the final round. Sunday won't be about whether ${leader.name} can maintain this level—it'll be about whether anyone else can even get close to it.`,
    deeper: `What's particularly notable is the consistency. ${leader.name} hasn't had a single weak category this week. No major leaks. No glaring vulnerabilities. That's what separates good weeks from great ones at this level. You can win with one elite skill and three average ones. But you dominate with four good ones. That's what we're seeing here. Complete, well-rounded golf at the highest level.`
  };
}

function wrapInHTMLTemplate(data, roundText, content, mode) {
  const { tournament, course, currentRound, leaderboard, leader, publishDate } = data;
  const formatScore = (s) => !s ? 'E' : s > 0 ? `+${s}` : `${s}`;
  const formatSG = (v) => !v ? '+0.00' : v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
  const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  const formatDate = (d) => { const dt = new Date(d + 'T00:00:00'); const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return `${m[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`; };
  
  const lbHTML = leaderboard.slice(0, 10).map((p, i) => {
    const pos = i === 0 ? 'T1' : `T${i + 1}`;
    const sc = p.total < 0 ? 'under' : p.total > 0 ? 'over' : 'even';
    return `<tr><td class="lb-pos">${pos}</td><td class="lb-player">${escapeHtml(p.player_name)}</td><td class="lb-score ${sc}">${formatScore(p.total)}</td></tr>`;
  }).join('');
  
  const sgCat = [
    { value: leader.sgApp, label: 'SG: Approach' },
    { value: leader.sgOTT, label: 'SG: Off-the-Tee' },
    { value: leader.sgArg, label: 'SG: Around-the-Green' },
    { value: leader.sgPutt, label: 'SG: Putting' }
  ];
  const strongest = sgCat.sort((a, b) => b.value - a.value)[0];
  const titleMap = { 'news': 'Breaking Down the Leaderboard', 'deep': 'The Numbers Behind the Lead', 'ai': 'What the Data Really Says' };
  const titleSuffix = titleMap[mode] || 'What the Numbers Say';
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/png" href="/favicon.png">
<title>${escapeHtml(tournament)} ${escapeHtml(roundText)}: ${titleSuffix} - Divot Lab</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,500;1,600&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--black:#0A0A0A;--white:#FAFAFA;--graphite:#4A4A4A;--green:#1B4D3E;--green-light:#5BBF85;--blue:#2C5F7C;--blue-mid:#5A8FA8;--warm-gray:#F3F2F0;--display:'Cormorant Garamond',Georgia,serif;--body:'DM Sans','Helvetica Neue',sans-serif;--mono:'JetBrains Mono','Courier New',monospace}*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}html{scroll-behavior:smooth}body{font-family:var(--body);color:var(--black);background:var(--white);-webkit-font-smoothing:antialiased;overflow-x:hidden}a{color:inherit;text-decoration:none}nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:0 56px;height:68px;display:flex;align-items:center;background:rgba(10,10,10,1);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-bottom:1px solid rgba(255,255,255,0.07);transition:background .35s,border-color .35s}nav.scrolled{background:rgba(10,10,10,0.55)}nav.light{background:rgba(250,250,250,0.88);border-bottom-color:rgba(0,0,0,0.07)}.nav-logo{display:flex;align-items:center;gap:11px}.nav-logo svg{width:26px;height:26px;flex-shrink:0;color:var(--white);transition:color .35s}nav.light .nav-logo svg{color:var(--black)}.nav-wordmark{font-family:var(--body);font-size:14px;font-weight:600;letter-spacing:.1em;color:var(--white);transition:color .35s}.nav-wordmark span{font-weight:300;opacity:.55}nav.light .nav-wordmark{color:var(--black)}.nav-links{display:flex;align-items:center;gap:32px;margin-left:auto}.nav-links a{font-size:13px;font-weight:500;letter-spacing:.05em;color:rgba(250,250,250,.65);transition:color .2s}.nav-links a:hover{color:var(--white)}nav.light .nav-links a{color:var(--graphite)}nav.light .nav-links a:hover{color:var(--black)}.nav-cta{background:var(--green);color:var(--white)!important;padding:9px 22px;border-radius:5px;font-weight:500;transition:background .2s,transform .15s,box-shadow .2s}.nav-cta:hover{background:#236b4f;transform:translateY(-1px);box-shadow:0 4px 14px rgba(27,77,62,.3)}.nav-hamburger{display:none;flex-direction:column;gap:4px;cursor:pointer;background:transparent;border:none}.nav-hamburger span{width:22px;height:2px;background:var(--white);transition:all .3s}.nav-drawer{position:fixed;top:68px;right:-100%;width:260px;height:calc(100vh - 68px);background:var(--black);padding:28px 24px;transition:right .3s;display:flex;flex-direction:column;gap:20px;z-index:99}.nav-drawer.open{right:0}.nav-drawer a{font-size:15px;color:rgba(250,250,250,.7)}.post-hero{position:relative;height:480px;background:linear-gradient(165deg,#0a0a0a 0%,#0d1612 100%);overflow:hidden;display:flex;align-items:flex-end}.post-hero::before{content:'';position:absolute;top:30%;left:50%;transform:translate(-50%,-50%);width:700px;height:700px;background:radial-gradient(ellipse at center,rgba(27,77,62,.12) 0%,transparent 65%);pointer-events:none}.post-hero-content{position:relative;z-index:1;max-width:800px;margin:0 auto;padding:0 56px 52px;width:100%}.post-cat{display:inline-block;font-size:10px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;padding:4px 10px;border-radius:3px;margin-bottom:16px;background:rgba(44,95,124,.22);color:#7ab8d4}.post-hero h1{font-family:var(--display);font-size:46px;font-weight:600;color:var(--white);letter-spacing:-.02em;line-height:1.1;margin-bottom:14px}.post-hero-meta{font-size:13px;color:rgba(250,250,250,.5)}.post-hero-meta .dot{margin:0 7px;opacity:.4}.post-body-wrap{background:var(--white);padding:72px 56px 96px}.post-body{max-width:720px;margin:0 auto}.post-body p{font-size:17px;font-weight:300;line-height:1.8;color:var(--graphite);margin-bottom:24px}.post-body p:first-of-type::first-letter{font-family:var(--display);font-size:62px;font-weight:700;float:left;line-height:.82;margin-right:12px;margin-top:6px;color:var(--black)}.post-body h2{font-family:var(--display);font-size:32px;font-weight:600;color:var(--black);letter-spacing:-.01em;line-height:1.2;margin-top:52px;margin-bottom:20px}.stat-callout{background:var(--black);border-radius:9px;padding:32px 36px;margin:48px 0;display:flex;align-items:center;gap:32px}.stat-callout-val{font-family:var(--mono);font-size:46px;font-weight:500;color:var(--blue-mid);letter-spacing:-.02em;white-space:nowrap;flex-shrink:0}.stat-callout-right{display:flex;flex-direction:column;gap:6px}.stat-callout-label{font-size:11px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:rgba(250,250,250,.35)}.stat-callout-note{font-size:14px;font-weight:300;color:rgba(250,250,250,.55);line-height:1.5}.leaderboard-section{background:var(--warm-gray);border-radius:12px;padding:36px;margin:52px 0}.leaderboard-section h3{font-family:var(--display);font-size:26px;font-weight:600;color:var(--black);margin:0 0 28px 0}.lb-table{width:100%;background:white;border-radius:8px;overflow:hidden;border-collapse:collapse}.lb-table thead{background:var(--black)}.lb-table th{color:var(--white);padding:13px 18px;text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em}.lb-table tbody tr{border-bottom:1px solid #ECECEC}.lb-table tbody tr:last-child{border-bottom:none}.lb-table td{padding:15px 18px;font-size:15px;color:var(--graphite)}.lb-pos{font-family:var(--mono);font-weight:600;color:var(--green);width:70px}.lb-player{font-weight:600;color:var(--black)}.lb-score{font-family:var(--mono);font-weight:600;text-align:right;width:90px}.lb-score.under{color:var(--green-light)}.lb-score.even{color:var(--graphite)}.lb-score.over{color:#D94848}.post-source{font-size:13px;color:var(--graphite);opacity:.6;margin-top:56px}.post-source a{color:var(--green);border-bottom:1px solid var(--green);padding-bottom:1px}.post-divider{width:60px;height:3px;background:linear-gradient(90deg,var(--green),var(--blue-mid));margin:48px 0;border-radius:2px}.read-next-wrap{background:var(--warm-gray);padding:72px 56px}.read-next-inner{max-width:1120px;margin:0 auto}.read-next-label{font-size:11px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:var(--green);margin-bottom:28px}.read-next-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}.rn-card{background:var(--white);border:1px solid #E6E6E4;border-radius:9px;overflow:hidden;cursor:pointer;transition:transform .28s cubic-bezier(.22,1,.36,1),box-shadow .28s cubic-bezier(.22,1,.36,1),border-color .28s;position:relative}.rn-card:hover{transform:translateY(-4px);box-shadow:0 14px 40px rgba(0,0,0,.08);border-color:transparent}.rn-card::after{content:'';position:absolute;bottom:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--green),var(--blue-mid));transform:scaleX(0);transform-origin:left;transition:transform .4s cubic-bezier(.22,1,.36,1)}.rn-card:hover::after{transform:scaleX(1)}.rn-img{height:150px;position:relative;overflow:hidden}.rn-body{padding:18px 20px 20px}.rn-cat{display:inline-block;font-size:9px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;padding:3px 8px;border-radius:3px;margin-bottom:8px}.rn-cat.sg{background:rgba(44,95,124,.1);color:var(--blue)}.rn-cat.improve{background:rgba(27,77,62,.1);color:var(--green)}.rn-cat.pga{background:rgba(44,95,124,.1);color:var(--blue)}.rn-title{font-family:var(--display);font-size:18px;font-weight:600;line-height:1.3;color:var(--black);margin-bottom:6px}.rn-meta{font-size:11px;color:var(--graphite);opacity:.6}.rn-meta .dot{margin:0 6px;opacity:.45}footer{background:var(--black);border-top:1px solid rgba(255,255,255,.06);padding:64px 56px 36px}.footer-grid{max-width:1120px;margin:0 auto;display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:44px}.f-brand .f-logo{display:flex;align-items:center;gap:10px;margin-bottom:14px}.f-brand .f-logo svg{width:20px;height:20px}.f-brand .f-logo-text{font-weight:600;font-size:13px;letter-spacing:.1em;color:var(--white)}.f-brand .f-logo-text span{font-weight:300;opacity:.5}.f-brand p{font-size:13px;color:rgba(250,250,250,.36);line-height:1.65;max-width:240px}.f-col h5{font-size:10px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:rgba(250,250,250,.28);margin-bottom:18px}.f-col a{display:block;font-size:13px;color:rgba(250,250,250,.5);margin-bottom:11px;transition:color .2s}.f-col a:hover{color:var(--white)}.footer-bottom{max-width:1120px;margin:44px auto 0;padding-top:24px;border-top:1px solid rgba(255,255,255,.06);display:flex;justify-content:space-between;font-size:12px;color:rgba(250,250,250,.22)}@media(max-width:768px){nav{padding:0 22px}.nav-links{display:none}.nav-hamburger{display:flex}.post-hero{height:400px}.post-hero-content{padding:0 24px 40px}.post-hero h1{font-size:36px}.post-body-wrap{padding:52px 24px 72px}.stat-callout{flex-direction:column;align-items:flex-start;gap:16px;padding:24px}.stat-callout-val{font-size:38px}.leaderboard-section{padding:24px 18px}.lb-table td{padding:12px 10px;font-size:14px}.read-next-wrap{padding:52px 24px}.read-next-grid{grid-template-columns:1fr}footer{padding:48px 24px 28px}.footer-grid{grid-template-columns:1fr 1fr;gap:32px}}@media(max-width:600px){.post-hero{height:340px}.footer-grid{grid-template-columns:1fr;gap:28px}}
</style>
</head>
<body>
<nav id="nav">
<a href="https://divotlab.com/" class="nav-logo">
<svg viewBox="0 0 72 72" fill="none"><line x1="4" y1="36.5" x2="68" y2="36.5" stroke="currentColor" stroke-width="3.2"/><path d="M10 36.5 C18 36.5,26 60.5,36 60.5 S54 36.5,62 36.5" fill="currentColor" fill-opacity=".15"/><path d="M10 36.5 C18 36.5,26 60.5,36 60.5 S54 36.5,62 36.5" stroke="currentColor" stroke-width="2.8" fill="none"/><circle cx="36" cy="20.5" r="9" fill="currentColor"/></svg>
<span class="nav-wordmark">DIVOT <span>LAB</span></span>
</a>
<div class="nav-links">
<a href="https://divotlab.com/articles">Articles</a>
<a href="https://divotlab.printful.me/">Shop</a>
<a href="https://divotlab.com/about">About</a>
<a href="https://divotlab.com/the-lab" class="nav-cta">The Lab</a>
</div>
<button class="nav-hamburger" id="navHamburger"><span></span><span></span><span></span></button>
</nav>
<div class="nav-drawer" id="navDrawer">
<a href="https://divotlab.com/articles">Articles</a>
<a href="https://divotlab.printful.me/">Shop</a>
<a href="https://divotlab.com/about">About</a>
<a href="https://divotlab.com/the-lab" class="nav-cta">The Lab</a>
</div>
<section class="post-hero">
<div class="post-hero-content">
<span class="post-cat">PGA Tour</span>
<h1>${escapeHtml(tournament)} ${escapeHtml(roundText)}: ${titleSuffix}</h1>
<div class="post-hero-meta">${formatDate(publishDate)} <span class="dot">·</span> 6 min read <span class="dot">·</span> Tournament Analysis</div>
</div>
</section>
<div class="post-body-wrap">
<article class="post-body">
<p>${content.intro}</p>
<div class="leaderboard-section">
<h3>Top 10 After ${escapeHtml(roundText)}</h3>
<table class="lb-table">
<thead><tr><th>Pos</th><th>Player</th><th>Score</th></tr></thead>
<tbody>${lbHTML}</tbody>
</table>
</div>
<h2>The Numbers Tell the Story</h2>
<p>${content.analysis}</p>
<div class="stat-callout">
<div class="stat-callout-val">${formatSG(strongest.value)}</div>
<div class="stat-callout-right">
<div class="stat-callout-label">${escapeHtml(strongest.label)} · Leader</div>
<div class="stat-callout-note">Through ${currentRound} rounds at ${escapeHtml(course)}</div>
</div>
</div>
<h2>Looking Ahead to Sunday</h2>
<p>${content.conclusion}</p>
<div class="post-divider"></div>
<p>${content.deeper || ''}</p>
<p class="post-source">Stats via <a href="https://datagolf.com" target="_blank">DataGolf</a> · ${escapeHtml(tournament)} · Live tournament data</p>
</article>
</div>
<div class="read-next-wrap">
<div class="read-next-inner">
<div class="read-next-label">Read Next</div>
<div class="read-next-grid">
<!-- RECENT_BLOGS_PLACEHOLDER -->
</div>
</div>
</div>
<footer>
<div class="footer-grid">
<div class="f-brand">
<div class="f-logo">
<svg viewBox="0 0 72 72" fill="none" style="color:var(--white)"><line x1="4" y1="36.5" x2="68" y2="36.5" stroke="currentColor" stroke-width="3.2"/><path d="M10 36.5 C18 36.5,26 60.5,36 60.5 S54 36.5,62 36.5" fill="currentColor" fill-opacity=".15"/><path d="M10 36.5 C18 36.5,26 60.5,36 60.5 S54 36.5,62 36.5" stroke="currentColor" stroke-width="2.8" fill="none"/><circle cx="36" cy="20.5" r="9" fill="currentColor"/></svg>
<span class="f-logo-text">DIVOT <span>LAB</span></span>
</div>
<p>Data-driven golf analysis and premium apparel. Smart takes. Real stats. Clothes worth wearing.</p>
</div>
<div class="f-col">
<h5>Read</h5>
<a href="https://divotlab.com/scheffler-putting-analysis">PGA Tour Analysis</a>
<a href="https://divotlab.com/strokes-gained-approach">Strokes Gained</a>
<a href="https://divotlab.com/driver-upgrade-myth">Improvement</a>
</div>
<div class="f-col">
<h5>Shop</h5>
<a href="https://divotlab.printful.me/">Tees</a>
<a href="https://divotlab.printful.me/">Hats</a>
<a href="https://divotlab.printful.me/">All Products</a>
</div>
<div class="f-col">
<h5>Company</h5>
<a href="https://divotlab.com/about">About</a>
<a href="https://divotlab.com/the-lab">The Lab</a>
<a href="https://instagram.com/divotlab" target="_blank">Instagram</a>
<a href="mailto:hello@divotlab.com">Contact</a>
</div>
</div>
<div class="footer-bottom">
<span>© 2026 Divot Lab</span>
<span>Built with data.</span>
</div>
</footer>
<script>(function(){var nav=document.getElementById('nav');var drawer=document.getElementById('navDrawer');var hamburger=document.getElementById('navHamburger');var ticking=false;window.addEventListener('scroll',function(){if(!ticking){requestAnimationFrame(function(){var scrolled=window.scrollY>200;nav.classList.toggle('scrolled',scrolled);nav.classList.toggle('light',scrolled);drawer.classList.toggle('light',scrolled);ticking=false});ticking=true}});hamburger.addEventListener('click',function(){nav.classList.toggle('menu-open');drawer.classList.toggle('open')});drawer.querySelectorAll('a').forEach(function(link){link.addEventListener('click',function(){nav.classList.remove('menu-open');drawer.classList.remove('open')})})})();</script>
</body>
</html>`;
}

function generateNoDataHTML() {
  return '<!DOCTYPE html><html><head><title>No Data</title></head><body style="font-family:sans-serif;padding:40px;text-align:center"><h1>No Tournament Data Available</h1><p>Live tournament data is not currently available.</p><p><a href="https://divotlab.com">← Back</a></p></body></html>';
}

function generateErrorHTML(error) {
  return `<!DOCTYPE html><html><head><title>Error</title></head><body style="font-family:sans-serif;padding:40px;text-align:center"><h1>Error Generating Blog</h1><p>${error.message || 'An error occurred.'}</p><p><a href="https://divotlab.com">← Back</a></p></body></html>`;
}

module.exports = app;