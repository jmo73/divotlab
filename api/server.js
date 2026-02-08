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
// ENHANCED MULTI-MODE BLOG GENERATOR
// Full AI Integration + Web Search + Historical Context + Player Profiles
// ============================================

// Add this to server.js at line 665 (before "// OPTIMIZED COMPOSITE ENDPOINTS")

app.get('/api/generate-blog/:round', async (req, res) => {
  try {
    const round = req.params.round;
    const mode = req.query.mode || 'auto';
    
    console.log(`📝 Generating ${mode} blog for ${round}...`);
    
    // Fetch core data using existing helper functions
    const [preTournament, fieldUpdates, skillRatings] = await Promise.all([
      fetchDataGolfDirect(`/preds/pre-tournament?tour=pga&file_format=json&key=${DATAGOLF_API_KEY}`),
      fetchDataGolfDirect(`/field-updates?tour=pga&file_format=json&key=${DATAGOLF_API_KEY}`),
      fetchDataGolfDirect(`/preds/skill-ratings?display=value&file_format=json&key=${DATAGOLF_API_KEY}`)
    ]);
    
    const currentEvent = preTournament.schedule.find(e => e.event_completed === false) || preTournament.schedule[0];
    const pgaPlayers = filterPGATourOnly(skillRatings.skill_ratings || []);
    
    // Debug logging
    console.log('Field updates keys:', Object.keys(fieldUpdates));
    console.log('Field length:', fieldUpdates.field?.length || 0);
    
    // Get leaderboard from field updates
    const playersWithScores = fieldUpdates.field || [];
    const leaderboard = playersWithScores
      .filter(p => p.total_score !== null && p.total_score !== undefined)
      .sort((a, b) => a.total_score - b.total_score)
      .slice(0, 15); // Get top 15 for more context
    
    console.log('Leaderboard length:', leaderboard.length);
    if (leaderboard.length > 0) {
      console.log('Leader:', leaderboard[0].player_name, leaderboard[0].total_score);
    }
    
    if (leaderboard.length === 0) {
      console.error('No leaderboard data - fieldUpdates:', JSON.stringify(fieldUpdates).substring(0, 500));
      return res.status(400).send(generateNoDataHTML());
    }
    
    // Fetch live SG stats - handle errors gracefully
    let liveStats = [];
    try {
      liveStats = await fetchDataGolfDirect(
        `/preds/live-tournament-stats?stats=sg_putt,sg_arg,sg_app,sg_ott,sg_total&round=event_avg&display=value&file_format=json&key=${DATAGOLF_API_KEY}`
      );
    } catch (error) {
      console.warn('Live stats not available:', error.message);
      // Continue without live stats - use baseline data
    }
    
    const leader = leaderboard[0];
    const leaderStats = liveStats.find(p => p.player_name === leader.player_name) || {};
    
    // Determine mode
    let selectedMode = mode;
    if (mode === 'auto') {
      selectedMode = determineAutoMode(leaderboard, leaderStats);
      console.log(`🤖 Auto-selected mode: ${selectedMode}`);
    }
    
    // Base data structure
    const baseData = {
      tournament: currentEvent.event_name,
      course: fieldUpdates.course || currentEvent.course || 'TPC Scottsdale',
      currentRound: fieldUpdates.current_round || 3,
      round: round,
      leaderboard: leaderboard,
      leader: {
        name: leader.player_name,
        score: leader.total_score,
        sgTotal: leaderStats.sg_total || 0,
        sgOTT: leaderStats.sg_ott || 0,
        sgApp: leaderStats.sg_app || 0,
        sgArg: leaderStats.sg_arg || 0,
        sgPutt: leaderStats.sg_putt || 0
      },
      liveStats: liveStats,
      allPlayers: pgaPlayers,
      publishDate: new Date().toISOString().split('T')[0]
    };
    
    // Generate blog based on mode
    let html;
    switch(selectedMode) {
      case 'news':
        html = await generateNewsBlogEnhanced(baseData);
        break;
      case 'deep':
        html = await generateDeepStatsBlogEnhanced(baseData);
        break;
      case 'ai':
        html = await generateAIBlogEnhanced(baseData);
        break;
      default:
        html = await generateAIBlogEnhanced(baseData);
    }
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
    
  } catch (error) {
    console.error('Blog generation error:', error);
    res.status(500).send(generateErrorHTML(error));
  }
});

// ============================================
// HELPER: Auto Mode Selection
// ============================================

function determineAutoMode(leaderboard, leaderStats) {
  if (leaderboard.length >= 2) {
    const leadSize = Math.abs(leaderboard[1].total_score - leaderboard[0].total_score);
    if (leadSize >= 5) return 'deep';
  }
  
  const maxSG = Math.max(
    Math.abs(leaderStats.sg_ott || 0),
    Math.abs(leaderStats.sg_app || 0),
    Math.abs(leaderStats.sg_arg || 0),
    Math.abs(leaderStats.sg_putt || 0)
  );
  
  if (maxSG > 2.0) return 'deep';
  
  if (leaderboard.length >= 5) {
    const top5Spread = Math.abs(leaderboard[4].total_score - leaderboard[0].total_score);
    if (top5Spread <= 2) return 'news';
  }
  
  return 'ai';
}

// ============================================
// ENHANCEMENT 1: NEWS MODE + WEB SEARCH
// ============================================

async function generateNewsBlogEnhanced(data) {
  const roundText = getRoundText(data.round);
  
  // Web search for tournament news - placeholder for web_search tool
  // In production, this would use the web_search tool available in the environment
  const searchQuery = `${data.tournament} ${data.leader.name} golf round ${data.currentRound} leaderboard`;
  
  console.log(`🔍 Would search: ${searchQuery}`);
  // const newsContext = await webSearch(searchQuery); // Implement when available
  
  const content = generateNewsContent(data, roundText, null);
  return wrapInHTMLTemplate(data, roundText, content, 'news');
}

// ============================================
// ENHANCEMENT 2: DEEP MODE + HISTORICAL CONTEXT
// ============================================

async function generateDeepStatsBlogEnhanced(data) {
  const roundText = getRoundText(data.round);
  
  // Fetch historical tournament data for context
  const historicalContext = await fetchHistoricalContext(data);
  
  const content = generateDeepStatsContent(data, roundText, historicalContext);
  return wrapInHTMLTemplate(data, roundText, content, 'deep');
}

async function fetchHistoricalContext(data) {
  try {
    // Fetch past results for this tournament
    const pastResults = await fetchDataGolfDirect(
      `/historical-raw-data/event?event_id=${data.tournament.toLowerCase().replace(/\s/g, '-')}&year=2023,2024,2025&file_format=json&key=${DATAGOLF_API_KEY}`
    );
    
    // Find leader's past performance at this course
    const leaderHistory = pastResults.filter(r => 
      r.player_name === data.leader.name
    );
    
    return {
      leaderPastPerformance: leaderHistory,
      tournamentHistory: pastResults
    };
  } catch (error) {
    console.warn('Historical context not available:', error.message);
    return null;
  }
}

// ============================================
// ENHANCEMENT 3 & 4: AI MODE + PLAYER PROFILES
// ============================================

async function generateAIBlogEnhanced(data) {
  const roundText = getRoundText(data.round);
  
  // Fetch player career stats for profile context
  const leaderProfile = data.allPlayers.find(p => p.player_name === data.leader.name) || {};
  
  // Build comprehensive context for Claude API
  const context = buildAIContext(data, leaderProfile);
  
  // Call Claude API for unique content generation
  const aiContent = await generateWithClaudeAPI(context);
  
  return wrapInHTMLTemplate(data, roundText, aiContent, 'ai');
}

function buildAIContext(data, leaderProfile) {
  const formatScore = (score) => {
    if (!score) return 'E';
    return score > 0 ? `+${score}` : `${score}`;
  };
  
  const leaderboardSummary = data.leaderboard.slice(0, 5).map((p, i) => 
    `${i + 1}. ${p.player_name}: ${formatScore(p.total_score)}`
  ).join('\n');
  
  return {
    tournament: data.tournament,
    course: data.course,
    currentRound: data.currentRound,
    leaderboard: leaderboardSummary,
    leader: {
      name: data.leader.name,
      score: formatScore(data.leader.score),
      sgTotal: data.leader.sgTotal?.toFixed(2) || '0.00',
      sgOTT: data.leader.sgOTT?.toFixed(2) || '0.00',
      sgApp: data.leader.sgApp?.toFixed(2) || '0.00',
      sgArg: data.leader.sgArg?.toFixed(2) || '0.00',
      sgPutt: data.leader.sgPutt?.toFixed(2) || '0.00',
      // Career context
      careerSGTotal: leaderProfile.sg_total?.toFixed(2) || 'N/A',
      careerSGApp: leaderProfile.sg_app?.toFixed(2) || 'N/A'
    },
    chasePack: data.leaderboard.slice(1, 4).map(p => ({
      name: p.player_name,
      score: formatScore(p.total_score),
      behind: Math.abs(p.total_score - data.leader.score)
    }))
  };
}

async function generateWithClaudeAPI(context) {
  try {
    // ENHANCEMENT 1: Full Claude API Integration
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.warn('No Anthropic API key found - using fallback content');
      return generateFallbackAIContent(context);
    }
    
    const prompt = `You are a professional golf analyst writing for Divot Lab, a premium data-driven golf analytics site. Your goal is to write content that is EXTREMELY SEO-optimized, click-worthy, and shareable while maintaining analytical credibility.

TOURNAMENT DATA:
- Event: ${context.tournament}
- Course: ${context.course}
- Round: ${context.currentRound}

LEADERBOARD:
${context.leaderboard}

LEADER ANALYSIS:
- ${context.leader.name} at ${context.leader.score}
- SG Total: ${context.leader.sgTotal}
- SG: Off-the-Tee: ${context.leader.sgOTT}
- SG: Approach: ${context.leader.sgApp}
- SG: Around-the-Green: ${context.leader.sgArg}
- SG: Putting: ${context.leader.sgPutt}
- Career SG Total: ${context.leader.careerSGTotal}
- Career SG Approach: ${context.leader.careerSGApp}

CHASE PACK:
${context.chasePack.map(p => `- ${p.name}: ${p.score} (${p.behind} back)`).join('\n')}

SEO & ENGAGEMENT REQUIREMENTS:
1. Use player names FREQUENTLY (for Google search ranking)
2. Include course name multiple times (${context.course})
3. Use tournament name naturally throughout (${context.tournament})
4. Mention specific stats that people search for: "strokes gained", "approach play", "putting stats"
5. Create FOMO/urgency: "heading into Sunday", "final round", "must-watch"
6. Write compelling hooks that make readers want to share
7. Use contrast/controversy when data supports it: "conventional wisdom says X, but the data shows Y"
8. Include specific numbers that grab attention (not just "+2.4" but "gaining 2.4 strokes per round")
9. Create narrative tension: Will the lead hold? Can chasers catch up?
10. End with forward-looking hook that keeps readers engaged

WRITING STYLE:
- Sharp, analytical, but accessible (think ESPN meets FiveThirtyEight)
- Lead with the most interesting/controversial insight
- Use active voice, strong verbs
- Vary sentence length for rhythm
- NO generic golf clichés ("firing on all cylinders", "dialed in", etc.)
- YES to data-driven insights that challenge assumptions

CONTENT REQUIREMENTS:
1. Write 3 distinct paragraphs: intro, analysis, conclusion
2. INTRO: Lead with the most compelling/surprising finding from the data
3. ANALYSIS: Deep dive on WHY this matters (sustainability of lead, what stats predict)
4. CONCLUSION: Forward-looking with specific Sunday prediction based on data
5. Mention 3-4 players by full name
6. Reference specific holes/course features if relevant to stats
7. Compare current performance to career norms (outlier weeks are click-worthy!)

RETURN FORMAT:
Return ONLY a JSON object with this exact structure:
{
  "intro": "opening paragraph text",
  "analysis": "analysis paragraph text", 
  "conclusion": "conclusion paragraph text"
}

Do NOT include any preamble, explanation, or markdown formatting. ONLY the JSON object.

REMEMBER: This content needs to rank on Google for searches like "${context.leader.name} ${context.tournament}", "PGA Tour strokes gained", "${context.course} leaderboard analysis". Write accordingly.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });
    
    if (!response.ok) {
      throw new Error(`Claude API error: ${response.statusText}`);
    }
    
    const result = await response.json();
    const contentText = result.content[0].text;
    
    // Parse JSON response
    const parsed = JSON.parse(contentText);
    
    return {
      intro: parsed.intro,
      analysis: parsed.analysis,
      conclusion: parsed.conclusion
    };
    
  } catch (error) {
    console.error('Claude API call failed:', error);
    return generateFallbackAIContent(context);
  }
}

function generateFallbackAIContent(context) {
  // Smart fallback based on data patterns
  const leader = context.leader;
  const chasePack = context.chasePack;
  
  let intro, analysis, conclusion;
  
  if (parseFloat(leader.sgPutt) > parseFloat(leader.sgApp)) {
    intro = `The putter is carrying ${leader.name} at ${context.course}. Currently at ${leader.score} through ${context.currentRound} rounds, the leader has gained ${leader.sgPutt} strokes putting per round—a blistering pace that's opened up distance on the field.`;
    
    analysis = `Putting gains of this magnitude rarely sustain over 72 holes. Tour data shows that players who rely heavily on putting typically see regression to the mean in final rounds. Meanwhile, ${leader.name}'s approach play (${leader.sgApp}) is merely competent. The lead is real, but fragile.`;
    
    conclusion = `${chasePack[0].name} sits ${chasePack[0].behind} back with steadier ball-striking fundamentals. If ${leader.name}'s putter cools even slightly on Sunday, this tournament reopens. The data suggests we're watching borrowed strokes, not owned ones.`;
  } else {
    intro = `Ball-striking is dictating the ${context.tournament} leaderboard. ${leader.name} leads at ${leader.score}, but the real story is how: ${leader.sgApp} strokes gained on approach through ${context.currentRound} rounds puts the leader in a different class than the field.`;
    
    analysis = `Iron play gains stick. Unlike putting, which swings wildly round-to-round, approach play tends to persist. ${leader.name} is hitting quality shots into greens, creating birdie opportunities through skill, not luck. Career numbers (${leader.careerSGApp} SG:Approach) confirm this isn't a fluke week.`;
    
    conclusion = `${chasePack[0].name} needs to make up ${chasePack[0].behind} strokes on someone who's gaining ground with the most predictable stat in golf. The math favors ${leader.name}. Barring a collapse, this one's decided by execution, not drama.`;
  }
  
  return { intro, analysis, conclusion };
}

// ============================================
// CONTENT GENERATION HELPERS
// ============================================

function generateNewsContent(data, roundText, newsContext) {
  const { leader, leaderboard, tournament, course, currentRound } = data;
  
  const formatScore = (score) => {
    if (!score) return 'E';
    return score > 0 ? `+${score}` : `${score}`;
  };
  
  const leadSize = leaderboard.length >= 2 ? 
    Math.abs(leaderboard[1].total_score - leader.score) : 0;
  
  const isCloseRace = leadSize <= 2;
  const isBigLead = leadSize >= 5;
  
  let intro, analysis, conclusion;
  
  if (isBigLead) {
    intro = `${leader.name} has built a commanding ${leadSize}-stroke lead at ${course}, turning the ${tournament} into what looks increasingly like a coronation. Through ${currentRound} rounds at ${formatScore(leader.score)}, the leader has separated from a field that's now playing for second place.`;
    
    analysis = `This isn't a lucky hot streak—it's systematic domination. The Strokes Gained data shows ${leader.name} is outperforming the field by multiple strokes per round across the board. When you're hitting quality shots this consistently, leads don't evaporate. They compound.`;
    
    conclusion = `${leaderboard[1].player_name} would need both a career round and a leader collapse. That's not a strategy. It's hope. The numbers say this one's over—Sunday is about the margin, not the outcome.`;
  } else if (isCloseRace) {
    intro = `After ${currentRound} rounds at ${course}, the ${tournament} has three live contenders separated by two strokes. ${leader.name} leads at ${formatScore(leader.score)}, but ${leaderboard[1].player_name} and ${leaderboard[2].player_name} are close enough that one good run Sunday changes everything.`;
    
    analysis = `What makes tight leaderboards fascinating is seeing HOW each player got there. Different strengths, different paths, same destination. When the lead is this thin, whoever finds their best stuff early on Sunday likely takes it.`;
    
    conclusion = `This is the kind of Sunday setup golf fans live for: multiple realistic winners, a course that rewards aggressive play, and enough strokes on the table to flip the board multiple times. Buckle up.`;
  } else {
    intro = `${leader.name} owns a ${leadSize}-stroke lead heading into Sunday at ${course}. It's not insurmountable—but it's substantial enough that ${leaderboard[1].player_name} and ${leaderboard[2].player_name} are now chasing rather than competing.`;
    
    analysis = `The lead was built on consistent ball-striking, the kind that tends to hold up under pressure. While ${leaderboard[1].player_name} has shown flashes, making up ${leadSize} strokes requires sustained excellence over 18 holes. Possible? Yes. Probable? The data says no.`;
    
    conclusion = `Sunday will answer one question: does the leader protect par and cruise, or do we get fireworks? Either way, ${leader.name} controls the tournament now.`;
  }
  
  return { intro, analysis, conclusion };
}

function generateDeepStatsContent(data, roundText, historicalContext) {
  const { leader, leaderboard, liveStats } = data;
  
  const formatSG = (val) => {
    if (!val) return '+0.00';
    return val >= 0 ? `+${val.toFixed(2)}` : val.toFixed(2);
  };
  
  const sgCategories = [
    { value: leader.sgApp, label: 'SG: Approach', name: 'approach' },
    { value: leader.sgOTT, label: 'SG: Off-the-Tee', name: 'ott' },
    { value: leader.sgArg, label: 'SG: Around-the-Green', name: 'arg' },
    { value: leader.sgPutt, label: 'SG: Putting', name: 'putt' }
  ];
  
  const sorted = sgCategories.sort((a, b) => b.value - a.value);
  const strongest = sorted[0];
  
  // Historical context if available
  let historicalNote = '';
  if (historicalContext && historicalContext.leaderPastPerformance) {
    const pastFinishes = historicalContext.leaderPastPerformance;
    if (pastFinishes.length > 0) {
      const bestFinish = Math.min(...pastFinishes.map(f => f.finish_position));
      historicalNote = ` This represents ${leader.name}'s best performance at this course since ${pastFinishes[0].year || 'recent years'}, where they previously finished T${bestFinish}.`;
    }
  }
  
  const intro = `The ${data.tournament} leaderboard shows ${leader.name} in front. The Strokes Gained breakdown shows why that lead is sustainable—or isn't.${historicalNote} Through ${data.currentRound} rounds, the leader is gaining ${formatSG(leader.sgTotal)} strokes per round on the field. That doesn't happen by accident.`;
  
  const analysis = `The dominance is concentrated in ${strongest.label.toLowerCase()}: ${formatSG(strongest.value)} per round. ${strongest.name === 'putt' ? 'Putting gains are volatile—what works Saturday can abandon you Sunday. This lead is built on sand.' : 'Ball-striking gains are sticky. Players who hit quality iron shots on Saturday tend to repeat on Sunday. This lead has foundation.'}`;
  
  const conclusion = `${leaderboard[1].player_name} needs to gain ${Math.abs(leaderboard[1].total_score - leader.score)} strokes over 18 holes. Mathematically, that requires gaining roughly ${(Math.abs(leaderboard[1].total_score - leader.score) * 1.2).toFixed(1)} strokes on the leader. ${strongest.name === 'putt' ? 'If the putter cools, that gap can close fast.' : 'Against elite ball-striking? That\'s asking for a miracle.'}`;
  
  return { intro, analysis, conclusion };
}

// ============================================
// UTILITY HELPERS
// ============================================

function getRoundText(round) {
  const map = { r1: 'Round 1', r2: 'Round 2', r3: 'Round 3', final: 'Final Round' };
  return map[round] || 'Round 3';
}

function generateNoDataHTML() {
  return `<!DOCTYPE html>
<html><body style="font-family: sans-serif; padding: 40px; max-width: 600px; margin: 0 auto;">
<h1>No Tournament Data Available</h1>
<p>Tournament hasn't started yet or scores aren't available. Try again once Round 1 is underway.</p>
<p><a href="/">← Back to Divot Lab</a></p>
</body></html>`;
}

function generateErrorHTML(error) {
  return `<!DOCTYPE html>
<html><body style="font-family: sans-serif; padding: 40px;">
<h1>Error Generating Blog</h1>
<p>${error.message}</p>
<p><a href="/">← Back to Divot Lab</a></p>
</body></html>`;
}

// ============================================
// HTML TEMPLATE (Minified for space)
// ============================================

function wrapInHTMLTemplate(data, roundText, content, mode) {
  const { tournament, course, currentRound, leaderboard, leader, publishDate } = data;
  
  const formatScore = (score) => {
    if (!score) return 'E';
    return score > 0 ? `+${score}` : `${score}`;
  };
  
  const formatSG = (val) => {
    if (!val) return '+0.00';
    return val >= 0 ? `+${val.toFixed(2)}` : val.toFixed(2);
  };
  
  const escapeHtml = (str) => String(str || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
  
  const leaderboardHTML = leaderboard.slice(0, 10).map((p, i) => {
    const pos = i === 0 ? 'T1' : `T${i + 1}`;
    const scoreClass = p.total_score < 0 ? 'under' : p.total_score > 0 ? 'over' : 'even';
    return `<tr><td class="lb-pos">${pos}</td><td class="lb-player">${escapeHtml(p.player_name)}</td><td class="lb-score ${scoreClass}">${formatScore(p.total_score)}</td></tr>`;
  }).join('');
  
  const sgCategories = [
    { value: leader.sgApp, label: 'SG: Approach' },
    { value: leader.sgOTT, label: 'SG: Off-the-Tee' },
    { value: leader.sgArg, label: 'SG: Around-the-Green' },
    { value: leader.sgPutt, label: 'SG: Putting' }
  ];
  const strongestSG = sgCategories.sort((a, b) => b.value - a.value)[0];
  
  const titleMap = {
    'news': 'Breaking Down the Leaderboard',
    'deep': 'The Numbers Behind the Lead',
    'ai': 'What the Data Really Says'
  };
  const titleSuffix = titleMap[mode] || 'What the Numbers Say';
  
  // Return full HTML (using minified CSS for space - full version in previous files)
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/png" href="/favicon.png">
<title>${escapeHtml(tournament)} ${escapeHtml(roundText)}: ${titleSuffix} - Divot Lab</title>
<meta name="description" content="AI-generated analysis of ${escapeHtml(roundText)} at ${escapeHtml(course)}. Strokes Gained breakdown, leaderboard analysis, and data-driven predictions.">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,500;1,600&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--black:#0A0A0A;--white:#FAFAFA;--graphite:#4A4A4A;--green:#1B4D3E;--green-light:#5BBF85;--blue-mid:#5A8FA8;--warm-gray:#F3F2F0;--display:'Cormorant Garamond',Georgia,serif;--body:'DM Sans',sans-serif;--mono:'JetBrains Mono',monospace}*{margin:0;padding:0;box-sizing:border-box}html{scroll-behavior:smooth}body{font-family:var(--body);color:var(--black);background:var(--white);overflow-x:hidden}a{color:inherit;text-decoration:none}nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:0 56px;height:68px;display:flex;align-items:center;background:rgba(10,10,10,1);backdrop-filter:blur(18px);border-bottom:1px solid rgba(255,255,255,0.07);transition:background .35s}nav.scrolled{background:rgba(10,10,10,0.55)}nav.light{background:rgba(250,250,250,0.88);border-bottom-color:rgba(0,0,0,0.07)}.nav-logo{display:flex;align-items:center;gap:11px}.nav-logo svg{width:26px;height:26px;color:var(--white);transition:color .35s}nav.light .nav-logo svg{color:var(--black)}.nav-wordmark{font-size:14px;font-weight:600;letter-spacing:.1em;color:var(--white);transition:color .35s}.nav-wordmark span{font-weight:300;opacity:.55}nav.light .nav-wordmark{color:var(--black)}.nav-links{display:flex;align-items:center;gap:32px;margin-left:auto}.nav-links a{font-size:13px;font-weight:500;letter-spacing:.05em;color:rgba(250,250,250,.65);transition:color .2s}.nav-links a:hover{color:var(--white)}nav.light .nav-links a{color:var(--graphite)}nav.light .nav-links a:hover{color:var(--black)}.nav-cta{background:var(--green);color:var(--white)!important;padding:9px 22px;border-radius:5px;font-weight:500;transition:background .2s}.nav-cta:hover{background:#236b4f;transform:translateY(-1px)}.post-hero{position:relative;min-height:60vh;background:linear-gradient(165deg,#0a0a0a 0%,#0d1612 100%);overflow:hidden}.post-hero::before{content:'';position:absolute;top:30%;left:50%;transform:translate(-50%,-50%);width:700px;height:700px;background:radial-gradient(ellipse at center,rgba(27,77,62,.12) 0%,transparent 65%);pointer-events:none}.post-hero-content{position:relative;z-index:1;max-width:720px;margin:0 auto;padding:0 48px;display:flex;flex-direction:column;justify-content:flex-end;padding-bottom:56px;padding-top:120px}.post-cat{display:inline-block;width:fit-content;font-size:10px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;padding:4px 10px;border-radius:3px;margin-bottom:18px;background:rgba(44,95,124,.22);color:#7ab8d4}.post-hero h1{font-family:var(--display);font-size:clamp(32px,5vw,48px);font-weight:600;color:var(--white);letter-spacing:-.02em;line-height:1.1;margin-bottom:16px}.post-hero-meta{font-size:13px;color:rgba(250,250,250,.5);display:flex;align-items:center;gap:6px}.post-hero-meta .dot{opacity:.4}.post-body-wrap{background:var(--white);padding:72px 48px 96px}.post-body{max-width:680px;margin:0 auto}.post-body p{font-size:16px;font-weight:300;line-height:1.8;color:var(--graphite);margin-bottom:24px}.post-body p:first-of-type::first-letter{font-family:var(--display);font-size:56px;font-weight:700;float:left;line-height:.85;margin-right:12px;margin-top:4px;color:var(--black)}.post-body h2{font-family:var(--display);font-size:28px;font-weight:600;color:var(--black);letter-spacing:-.01em;line-height:1.2;margin-top:52px;margin-bottom:16px}.post-body h3{font-family:var(--body);font-size:15px;font-weight:600;color:var(--black);margin-top:36px;margin-bottom:10px}.stat-callout{background:var(--black);border-radius:9px;padding:32px 36px;margin:40px 0;display:flex;align-items:center;gap:32px}.stat-callout-val{font-family:var(--mono);font-size:42px;font-weight:500;color:var(--blue-mid);letter-spacing:-.02em;white-space:nowrap;flex-shrink:0}.stat-callout-right{display:flex;flex-direction:column;gap:4px}.stat-callout-label{font-size:10px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:rgba(250,250,250,.35)}.stat-callout-note{font-size:13px;font-weight:300;color:rgba(250,250,250,.5);line-height:1.5}.post-pullquote{border-left:3px solid var(--green);padding:8px 0 8px 28px;margin:40px 0}.post-pullquote p{font-family:var(--display);font-size:22px!important;font-weight:500;font-style:italic;color:var(--graphite)!important;line-height:1.5!important;margin:0!important}.leaderboard-section{background:var(--warm-gray);border-radius:12px;padding:32px;margin:48px 0}.leaderboard-section h3{font-family:var(--display)!important;font-size:24px!important;color:var(--black)!important;margin:0 0 24px 0!important}.lb-table{width:100%;background:white;border-radius:8px;overflow:hidden;border-collapse:collapse}.lb-table thead{background:var(--black)}.lb-table th{color:var(--white);padding:12px 16px;text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px}.lb-table tbody tr{border-bottom:1px solid #ECECEC}.lb-table tbody tr:last-child{border-bottom:none}.lb-table td{padding:14px 16px;font-size:15px;color:var(--graphite)}.lb-pos{font-family:var(--mono);font-weight:600;color:var(--green);width:70px}.lb-player{font-weight:600;color:var(--black)}.lb-score{font-family:var(--mono);font-weight:600;text-align:right;width:80px}.lb-score.under{color:var(--green-light)}.lb-score.even{color:var(--graphite)}.lb-score.over{color:#D94848}.post-cta{background:var(--black);border-radius:12px;padding:40px;margin:56px 0 0;text-align:center}.post-cta h3{font-family:var(--display)!important;font-size:28px!important;color:var(--white)!important;margin:0 0 12px 0!important}.post-cta p{color:rgba(250,250,250,0.6)!important;margin-bottom:24px!important}.post-cta .cta-btn{display:inline-block;background:var(--green);color:white;padding:12px 28px;border-radius:6px;font-weight:600;font-size:14px;transition:background 0.2s}.post-cta .cta-btn:hover{background:#236b4f}footer{background:var(--warm-gray);padding:48px;text-align:center}footer a{color:var(--green);font-weight:600}@media (max-width:768px){nav{padding:0 22px}.nav-links a:not(.nav-cta){display:none}.post-hero-content{padding:100px 22px 48px}.post-body-wrap{padding:48px 22px 72px}.stat-callout{flex-direction:column;gap:20px;text-align:center}.leaderboard-section{padding:24px 16px}.lb-table{font-size:13px}.lb-table td{padding:10px 8px}}
</style>
</head>
<body>
<nav id="nav">
<a href="/" class="nav-logo">
<svg viewBox="0 0 72 72" fill="none"><line x1="4" y1="36.5" x2="68" y2="36.5" stroke="currentColor" stroke-width="3.2"/><path d="M10 36.5 C18 36.5,26 60.5,36 60.5 S54 36.5,62 36.5" fill="currentColor" fill-opacity=".15"/><path d="M10 36.5 C18 36.5,26 60.5,36 60.5 S54 36.5,62 36.5" stroke="currentColor" stroke-width="2.8" fill="none"/><circle cx="36" cy="20.5" r="9" fill="currentColor"/></svg>
<span class="nav-wordmark">DIVOT <span>LAB</span></span>
</a>
<div class="nav-links">
<a href="/articles">Articles</a>
<a href="/shop">Shop</a>
<a href="/about">About</a>
<a href="/the-lab" class="nav-cta">The Lab</a>
</div>
</nav>
<section class="post-hero">
<div class="post-hero-content">
<span class="post-cat">PGA Tour</span>
<h1>${escapeHtml(tournament)} ${escapeHtml(roundText)}: ${titleSuffix}</h1>
<div class="post-hero-meta"><span>${publishDate}</span><span class="dot">·</span><span>6 min read</span></div>
</div>
</section>
<div class="post-body-wrap">
<div class="post-body">
<p>${content.intro}</p>
<div class="leaderboard-section">
<h3>Top 10 After ${escapeHtml(roundText)}</h3>
<table class="lb-table">
<thead><tr><th>Pos</th><th>Player</th><th>Score</th></tr></thead>
<tbody>${leaderboardHTML}</tbody>
</table>
</div>
<h2>The Numbers Tell the Story</h2>
<p>${content.analysis}</p>
<div class="stat-callout">
<div class="stat-callout-val">${formatSG(strongestSG.value)}</div>
<div class="stat-callout-right">
<div class="stat-callout-label">${escapeHtml(strongestSG.label)} · Leader</div>
<div class="stat-callout-note">Through ${currentRound} rounds at ${escapeHtml(course)}</div>
</div>
</div>
<h2>Looking Ahead to Sunday</h2>
<p>${content.conclusion}</p>
<div class="post-cta">
<h3>Follow Every Shot Live</h3>
<p>Real-time Strokes Gained data, live probabilities, and hole-by-hole stats.</p>
<a href="/the-lab" class="cta-btn">Go to The Lab</a>
</div>
</div>
</div>
<footer><p><a href="/articles">← Back to Articles</a></p></footer>
<script>
(function(){
var nav=document.getElementById('nav');
var heroHeight=document.querySelector('.post-hero').offsetHeight;
window.addEventListener('scroll',function(){
if(window.scrollY>100){nav.classList.add('scrolled')}else{nav.classList.remove('scrolled')}
if(window.scrollY>heroHeight-68){nav.classList.add('light')}else{nav.classList.remove('light')}
});
})();
</script>
</body>
</html>`;
}
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