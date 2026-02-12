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

    // Include event_name from the response so client can verify it matches
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

    // Build field list for upcoming state (names + dg_ids from field-updates)
    const fieldList = (fieldUpdates.field || []).map(p => ({
      dg_id: p.dg_id,
      player_name: p.player_name,
      country: p.country || '',
      am: p.am || 0
    }));

    const compositeData = {
      players: pgaPlayers, // NOW PGA ONLY
      predictions: preTournament.baseline_history_fit || preTournament.predictions || [],
      prediction_event_name: predictionEventName, // Which event the predictions are actually for
      field_list: fieldList, // Full field for upcoming state display
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
      timestamp: new Date().toISOString(),
      pga_filtered: true
    };

    // Shorter cache during tournament week (1hr vs 6hr)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = currentEvent.start_date ? new Date(currentEvent.start_date) : null;
    const endDate = currentEvent.end_date ? new Date(currentEvent.end_date) : null;
    const isDuringTournament = startDate && endDate && today >= startDate && today <= endDate;
    const cacheTTL = isDuringTournament ? 3600 : 21600; // 1hr during tournament, 6hr otherwise
    
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

// ============================================
// BLOG GENERATOR ENDPOINTS
// ============================================
const blogGenerator = require('./blog-generator');

// In-memory store for draft posts (persists during server lifecycle)
const blogDrafts = new Map();

// ENDPOINT: Generate a blog post
app.post('/api/generate-blog', async (req, res) => {
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
app.post('/api/blog-posts', (req, res) => {
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
app.put('/api/blog-posts/:slug', (req, res) => {
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

module.exports = app;