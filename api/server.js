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
// MULTI-MODE BLOG GENERATOR ENDPOINT
// Add this code to server.js at line 665 (before "// OPTIMIZED COMPOSITE ENDPOINTS")
// ============================================

// ENDPOINT: Generate Blog Post with Multiple Modes
app.get('/api/generate-blog/:round', async (req, res) => {
  try {
    const round = req.params.round; // r1, r2, r3, final
    const mode = req.query.mode || 'auto'; // news, deep, ai, auto
    
    console.log(`📝 Generating ${mode} blog for ${round}...`);
    
    // Fetch core tournament data
    const cacheKey = 'lab-data-composite-pga';
    let compositeData = cache.get(cacheKey);
    
    if (!compositeData) {
      const [preTournament, fieldUpdates, skillRatings] = await Promise.all([
        fetchDataGolfDirect(`/preds/pre-tournament?tour=pga&file_format=json&key=${DATAGOLF_API_KEY}`),
        fetchDataGolfDirect(`/field-updates?tour=pga&file_format=json&key=${DATAGOLF_API_KEY}`),
        fetchDataGolfDirect(`/preds/skill-ratings?display=value&file_format=json&key=${DATAGOLF_API_KEY}`)
      ]);
      
      const currentEvent = preTournament.schedule.find(e => e.event_completed === false) || preTournament.schedule[0];
      const pgaPlayers = filterPGATourOnly(skillRatings.skill_ratings || []);
      
      compositeData = {
        tournament: {
          event_name: currentEvent.event_name,
          course: fieldUpdates.course || currentEvent.course || '',
          current_round: fieldUpdates.current_round || 0
        },
        players: pgaPlayers,
        field: fieldUpdates.field || []
      };
    }
    
    // Get leaderboard
    const playersWithScores = compositeData.field || [];
    const leaderboard = playersWithScores
      .filter(p => p.total_score !== null && p.total_score !== undefined)
      .sort((a, b) => a.total_score - b.total_score)
      .slice(0, 10);
    
    if (leaderboard.length === 0) {
      return res.status(400).send(`
        <html><body style="font-family: sans-serif; padding: 40px; max-width: 600px; margin: 0 auto;">
          <h1>No Tournament Data Available</h1>
          <p>Tournament hasn't started yet or scores aren't available.</p>
          <p><a href="/">← Back to Divot Lab</a></p>
        </body></html>
      `);
    }
    
    // Fetch live SG stats
    const liveStats = await fetchDataGolfDirect(
      `/preds/live-tournament-stats?stats=sg_putt,sg_arg,sg_app,sg_ott,sg_total&round=event_avg&display=value&file_format=json&key=${DATAGOLF_API_KEY}`
    );
    
    const leader = leaderboard[0];
    const leaderStats = liveStats.find(p => p.player_name === leader.player_name) || {};
    
    // Determine actual mode to use
    let selectedMode = mode;
    if (mode === 'auto') {
      selectedMode = determineAutoMode(leaderboard, leaderStats);
      console.log(`🤖 Auto-selected mode: ${selectedMode}`);
    }
    
    // Generate blog based on mode
    let html;
    const baseData = {
      tournament: compositeData.tournament.event_name,
      course: compositeData.tournament.course,
      currentRound: compositeData.tournament.current_round,
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
      publishDate: new Date().toISOString().split('T')[0]
    };
    
    switch(selectedMode) {
      case 'news':
        html = await generateNewsBlog(baseData);
        break;
      case 'deep':
        html = await generateDeepStatsBlog(baseData);
        break;
      case 'ai':
        html = await generateAIBlog(baseData);
        break;
      default:
        html = await generateNewsBlog(baseData);
    }
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
    
  } catch (error) {
    console.error('Blog generation error:', error);
    res.status(500).send(`
      <html><body style="font-family: sans-serif; padding: 40px;">
        <h1>Error Generating Blog</h1>
        <p>${error.message}</p>
        <pre>${error.stack}</pre>
      </body></html>
    `);
  }
});

// ============================================
// AUTO MODE SELECTION
// ============================================

function determineAutoMode(leaderboard, leaderStats) {
  // Check for big lead (5+ strokes) -> deep stats analysis
  if (leaderboard.length >= 2) {
    const leadSize = Math.abs(leaderboard[1].total_score - leaderboard[0].total_score);
    if (leadSize >= 5) {
      return 'deep';
    }
  }
  
  // Check for dominant SG category (>2.0) -> deep stats
  const maxSG = Math.max(
    Math.abs(leaderStats.sg_ott || 0),
    Math.abs(leaderStats.sg_app || 0),
    Math.abs(leaderStats.sg_arg || 0),
    Math.abs(leaderStats.sg_putt || 0)
  );
  
  if (maxSG > 2.0) {
    return 'deep';
  }
  
  // Check for tight leaderboard (top 5 within 2 strokes) -> news
  if (leaderboard.length >= 5) {
    const top5Spread = Math.abs(leaderboard[4].total_score - leaderboard[0].total_score);
    if (top5Spread <= 2) {
      return 'news';
    }
  }
  
  // Default to AI for variety
  return 'ai';
}

// ============================================
// MODE 1: NEWS-DRIVEN BLOG
// ============================================

async function generateNewsBlog(data) {
  // Use web search to find tournament news
  const searchQuery = `${data.tournament} ${data.leader.name} golf leaderboard`;
  
  // Note: This is a placeholder - you'll need to implement web_search tool call
  // For now, generate a news-style blog with data we have
  
  const roundText = {
    r1: 'Round 1',
    r2: 'Round 2',
    r3: 'Round 3',
    final: 'Final Round'
  }[data.round] || 'Round 3';
  
  const content = generateNewsContent(data, roundText);
  return wrapInTemplate(data, roundText, content, 'news');
}

function generateNewsContent(data, roundText) {
  const { leader, leaderboard, tournament, course, currentRound } = data;
  
  const formatScore = (score) => {
    if (!score) return 'E';
    return score > 0 ? `+${score}` : `${score}`;
  };
  
  const formatSG = (val) => {
    if (!val) return '+0.00';
    return val >= 0 ? `+${val.toFixed(2)}` : val.toFixed(2);
  };
  
  const leadSize = leaderboard.length >= 2 ? 
    Math.abs(leaderboard[1].total_score - leader.score) : 0;
  
  const isCloseRace = leadSize <= 2;
  const isBigLead = leadSize >= 5;
  
  let intro, analysis, conclusion;
  
  if (isBigLead) {
    intro = `${leader.name} has opened up commanding ${leadSize}-stroke lead after ${currentRound} rounds at ${course}, turning what looked like a competitive field into a one-player showcase. At ${formatScore(leader.score)}, the leader is putting on a ball-striking clinic that's left the rest of the field scrambling just to stay within striking distance.`;
    
    analysis = `The lead isn't built on luck or hot putting—it's pure execution. ${leader.name} is gaining ${formatSG(leader.sgTotal)} strokes per round on the field, with approach play (${formatSG(leader.sgApp)}) doing most of the heavy lifting. When you're hitting greens this consistently on a course like ${course}, birdies aren't lucky breaks—they're the expected outcome.`;
    
    conclusion = `Sunday's final round is less about who wins and more about whether anyone can make it interesting. ${leaderboard[1].player_name} sits ${leadSize} back and would need both a career round and a collapse from the leader. Possible? Sure. Likely? The data says no.`;
    
  } else if (isCloseRace) {
    const top3 = leaderboard.slice(0, 3).map(p => p.player_name).join(', ');
    
    intro = `${leader.name} holds a razor-thin lead at ${formatScore(leader.score)} after ${currentRound} rounds at ${course}, but this tournament is far from decided. With ${top3} all bunched within two strokes, Sunday's final round is shaping up to be a genuine dogfight.`;
    
    analysis = `What makes this leaderboard fascinating is that all three leaders are getting there differently. ${leader.name} is gaining the most ground with approach play (${formatSG(leader.sgApp)}), while the chase pack has been relying on different strengths. When the lead is this tight, one hot stretch on Sunday changes everything.`;
    
    conclusion = `The leaderboard is tight enough that any of the top five could realistically win. ${leader.name} has the lead, but not the cushion. One birdie run from ${leaderboard[1].player_name} or ${leaderboard[2].player_name} and we've got a new leader. Sunday afternoon at ${course} is going to deliver.`;
    
  } else {
    intro = `${leader.name} has seized control at ${course}, posting ${formatScore(leader.score)} through ${currentRound} rounds to build a ${leadSize}-stroke advantage. The lead isn't insurmountable, but it's substantial enough that the pressure shifts squarely to the chase pack.`;
    
    analysis = `The leader is gaining ${formatSG(leader.sgTotal)} strokes per round, with consistent ball-striking across all categories. Nothing spectacular, nothing disastrous—just quality golf shots executed repeatedly. That's the formula for holding leads, and ${leader.name} knows it.`;
    
    conclusion = `${leaderboard[1].player_name} and ${leaderboard[2].player_name} need ${leader.name} to stumble, but stumbles don't happen by accident. They happen when players lose their ball-striking edge. Check The Lab Sunday to see if the leader's Strokes Gained numbers hold up under pressure.`;
  }
  
  return { intro, analysis, conclusion };
}

// ============================================
// MODE 2: DEEP STATS BLOG  
// ============================================

async function generateDeepStatsBlog(data) {
  // Fetch additional detailed stats
  // For now, use the SG data we have but analyze it more deeply
  
  const roundText = {
    r1: 'Round 1',
    r2: 'Round 2',
    r3: 'Round 3',
    final: 'Final Round'
  }[data.round] || 'Round 3';
  
  const content = generateDeepStatsContent(data, roundText);
  return wrapInTemplate(data, roundText, content, 'deep');
}

function generateDeepStatsContent(data, roundText) {
  const { leader, leaderboard, liveStats, tournament, course } = data;
  
  const formatSG = (val) => {
    if (!val) return '+0.00';
    return val >= 0 ? `+${val.toFixed(2)}` : val.toFixed(2);
  };
  
  // Identify leader's dominant skill
  const sgCategories = [
    { name: 'approach', value: leader.sgApp, label: 'SG: Approach', desc: 'iron play' },
    { name: 'ott', value: leader.sgOTT, label: 'SG: Off-the-Tee', desc: 'driving' },
    { name: 'arg', value: leader.sgArg, label: 'SG: Around-the-Green', desc: 'short game' },
    { name: 'putt', value: leader.sgPutt, label: 'SG: Putting', desc: 'putting' }
  ];
  
  const sorted = sgCategories.sort((a, b) => b.value - a.value);
  const strongest = sorted[0];
  const secondBest = sorted[1];
  
  // Calculate field averages for context
  const fieldAvgSGTotal = liveStats.reduce((sum, p) => sum + (p.sg_total || 0), 0) / liveStats.length;
  const stdDeviation = Math.sqrt(
    liveStats.reduce((sum, p) => sum + Math.pow((p.sg_total || 0) - fieldAvgSGTotal, 2), 0) / liveStats.length
  );
  
  const leaderZScore = (leader.sgTotal - fieldAvgSGTotal) / stdDeviation;
  const isStatisticallyDominant = leaderZScore > 2.0;
  
  const intro = `The numbers from ${course} tell a story that goes deeper than the leaderboard. ${leader.name}'s lead isn't just about being ${leader.score} strokes better than par—it's about being ${formatSG(leader.sgTotal)} strokes better than the field per round. And the breakdown of where those strokes are coming from reveals exactly why this lead is (or isn't) sustainable.`;
  
  const analysis = `${leader.name} is dominating in ${strongest.desc}: ${formatSG(strongest.value)} strokes gained per round in that category alone. That's ${isStatisticallyDominant ? 'more than two standard deviations above the field average—statistical dominance' : 'well above tour average'}. ${strongest.value > 1.5 ? `When you're gaining that much ground in a single category, you're not getting lucky. You're executing at an elite level.` : `Combine that with ${formatSG(secondBest.value)} in ${secondBest.desc}, and you've got a complete game clicking at the right time.`}
  
  But here's the key question: is this ${strongest.desc} performance sustainable? ${strongest.name === 'putt' ? 'Putting gains are notoriously volatile—what works on Saturday can abandon you on Sunday.' : 'Ball-striking gains tend to be sticky. Players who hit quality iron shots on Saturday usually hit quality iron shots on Sunday.'} The data suggests ${strongest.name === 'putt' ? 'some regression to the mean is likely' : 'this lead has staying power'}.`;
  
  const conclusion = `Looking at the chase pack, ${leaderboard[1].player_name} is gaining ${formatSG(liveStats.find(p => p.player_name === leaderboard[1].player_name)?.sg_total || 0)} per round—respectable, but not enough to make up ground unless ${leader.name} falters. The mathematical reality is simple: to close a ${Math.abs(leaderboard[1].total_score - leader.score)}-stroke gap, you need to gain roughly ${(Math.abs(leaderboard[1].total_score - leader.score) * 1.2).toFixed(1)} strokes on the leader over 18 holes. That requires either a spectacular round or a collapse. Check The Lab for live updates to see which scenario unfolds.`;
  
  return { intro, analysis, conclusion };
}

// ============================================
// MODE 3: AI-GENERATED BLOG
// ============================================

async function generateAIBlog(data) {
  // This would call Claude API to generate unique content
  // For now, I'll create a template that emphasizes different angles
  
  const roundText = {
    r1: 'Round 1',
    r2: 'Round 2',
    r3: 'Round 3',
    final: 'Final Round'
  }[data.round] || 'Round 3';
  
  // Placeholder: In production, this would call the Anthropic API
  // with all the data and ask for a unique narrative
  const content = generateVarietyContent(data, roundText);
  return wrapInTemplate(data, roundText, content, 'ai');
}

function generateVarietyContent(data, roundText) {
  const { leader, leaderboard, tournament, course } = data;
  
  const formatScore = (score) => {
    if (!score) return 'E';
    return score > 0 ? `+${score}` : `${score}`;
  };
  
  const formatSG = (val) => {
    if (!val) return '+0.00';
    return val >= 0 ? `+${val.toFixed(2)}` : val.toFixed(2);
  };
  
  // Generate a unique angle based on the data
  const angles = [
    {
      condition: leader.sgPutt > leader.sgApp && leader.sgPutt > leader.sgOTT,
      intro: `Putting doesn't win golf tournaments. Except when it does. ${leader.name} is currently proving that maxim wrong at ${course}, where a hot putter has staked the leader to a ${formatScore(leader.score)} total through ${data.currentRound} rounds.`,
      analysis: `The flatstick is absurdly hot—${formatSG(leader.sgPutt)} strokes gained putting per round. That's tour-leading territory. But here's the uncomfortable truth for anyone holding a ticket on ${leader.name}: putting gains are the most volatile stat in golf. What's working beautifully today can disappear overnight.`,
      conclusion: `Can ${leader.name} ride the hot putter all the way home? History says it's risky. The leaders who close tournaments are usually the ones gaining strokes tee-to-green, not on the greens. But rules are made to be broken, and ${leader.name} is breaking this one emphatically right now.`
    },
    {
      condition: leader.sgApp > 1.5,
      intro: `Iron play wins golf tournaments. Always has, always will. ${leader.name} is delivering yet another proof of concept at ${course}, where precision ball-striking has built a ${formatScore(leader.score)} lead through ${data.currentRound} rounds.`,
      analysis: `The approach game is surgical: ${formatSG(leader.sgApp)} strokes gained per round. That's not hot putting or lucky bounces. That's hitting golf shots to the right spots, round after round. On a course where greens-in-regulation convert to birdies, ${leader.name} is printing them.`,
      conclusion: `${leaderboard[1].player_name} and ${leaderboard[2].player_name} need a miracle or a collapse. The leader's ball-striking is too consistent to bet against. Sometimes golf is this simple: hit quality iron shots, make the putts you should make, take your trophy on Sunday.`
    },
    {
      condition: true, // default
      intro: `There's a narrative forming at ${course}, and it goes like this: ${leader.name} is in control, the field is scrambling, and Sunday's final round is a formality. The data tells a more nuanced story.`,
      analysis: `Yes, ${leader.name} leads at ${formatScore(leader.score)}. Yes, the Strokes Gained numbers (${formatSG(leader.sgTotal)} per round) look solid. But ${Math.abs(leaderboard[1].total_score - leader.score)} strokes is not an insurmountable gap. It's a cushion, not a lock. And cushions can disappear quickly when iron shots start leaking and putts start missing.`,
      conclusion: `This is the kind of tournament that gets decided in a three-hole stretch. One player gets hot, another goes cold, and suddenly the leaderboard flips. ${leader.name} has the advantage, but Sunday golf is undefeated. The Lab will have live updates throughout—because this one's not over until the final putt drops.`
    }
  ];
  
  const selectedAngle = angles.find(a => a.condition) || angles[angles.length - 1];
  
  return {
    intro: selectedAngle.intro,
    analysis: selectedAngle.analysis,
    conclusion: selectedAngle.conclusion
  };
}

// ============================================
// HTML TEMPLATE WRAPPER
// ============================================

function wrapInTemplate(data, roundText, content, mode) {
  const { tournament, course, currentRound, leaderboard, leader, publishDate } = data;
  
  const formatScore = (score) => {
    if (score === null || score === undefined) return 'E';
    if (score === 0) return 'E';
    return score > 0 ? `+${score}` : `${score}`;
  };
  
  const formatSG = (val) => {
    if (!val) return '+0.00';
    return val >= 0 ? `+${val.toFixed(2)}` : val.toFixed(2);
  };
  
  const escapeHtml = (str) => String(str || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
  
  const leaderboardHTML = leaderboard.map((p, i) => {
    const pos = i === 0 ? 'T1' : `T${i + 1}`;
    const scoreClass = p.total_score < 0 ? 'under' : p.total_score > 0 ? 'over' : 'even';
    return `          <tr>
            <td class="lb-pos">${pos}</td>
            <td class="lb-player">${escapeHtml(p.player_name)}</td>
            <td class="lb-score ${scoreClass}">${formatScore(p.total_score)}</td>
          </tr>`;
  }).join('\n');
  
  const sgCategories = [
    { value: leader.sgApp, label: 'SG: Approach' },
    { value: leader.sgOTT, label: 'SG: Off-the-Tee' },
    { value: leader.sgArg, label: 'SG: Around-the-Green' },
    { value: leader.sgPutt, label: 'SG: Putting' }
  ];
  const strongestSG = sgCategories.sort((a, b) => b.value - a.value)[0];
  
  // Mode-specific title variations
  const titleMap = {
    'news': 'Breaking Down the Leaderboard',
    'deep': 'The Numbers Behind the Lead',
    'ai': 'What the Data Really Says'
  };
  
  const titleSuffix = titleMap[mode] || 'What the Numbers Say';
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/png" href="/favicon.png">
<title>${escapeHtml(tournament)} ${escapeHtml(roundText)}: ${titleSuffix} - Divot Lab</title>
<meta name="description" content="A data-driven breakdown of ${escapeHtml(roundText)} at ${escapeHtml(course)}. Strokes Gained analysis, leaderboard insights, and predictions.">
<meta name="keywords" content="${escapeHtml(tournament)}, ${escapeHtml(course)}, PGA Tour, golf analysis, Strokes Gained, ${escapeHtml(leader.name)}">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,500;1,600&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--black:#0A0A0A;--white:#FAFAFA;--graphite:#4A4A4A;--green:#1B4D3E;--green-light:#5BBF85;--blue-mid:#5A8FA8;--warm-gray:#F3F2F0;--display:'Cormorant Garamond',Georgia,serif;--body:'DM Sans','Helvetica Neue',sans-serif;--mono:'JetBrains Mono','Courier New',monospace}
*{margin:0;padding:0;box-sizing:border-box}html{scroll-behavior:smooth}
body{font-family:var(--body);color:var(--black);background:var(--white);-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit;text-decoration:none}
nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:0 56px;height:68px;display:flex;align-items:center;background:rgba(10,10,10,1);backdrop-filter:blur(18px);border-bottom:1px solid rgba(255,255,255,0.07);transition:background .35s}
nav.scrolled{background:rgba(10,10,10,0.55)}
nav.light{background:rgba(250,250,250,0.88);border-bottom-color:rgba(0,0,0,0.07)}
.nav-logo{display:flex;align-items:center;gap:11px}
.nav-logo svg{width:26px;height:26px;color:var(--white);transition:color .35s}
nav.light .nav-logo svg{color:var(--black)}
.nav-wordmark{font-size:14px;font-weight:600;letter-spacing:.1em;color:var(--white);transition:color .35s}
.nav-wordmark span{font-weight:300;opacity:.55}
nav.light .nav-wordmark{color:var(--black)}
.nav-links{display:flex;align-items:center;gap:32px;margin-left:auto}
.nav-links a{font-size:13px;font-weight:500;letter-spacing:.05em;color:rgba(250,250,250,.65);transition:color .2s}
.nav-links a:hover{color:var(--white)}
nav.light .nav-links a{color:var(--graphite)}
nav.light .nav-links a:hover{color:var(--black)}
.nav-cta{background:var(--green);color:var(--white)!important;padding:9px 22px;border-radius:5px;font-weight:500;transition:background .2s}
.nav-cta:hover{background:#236b4f;transform:translateY(-1px)}
.post-hero{position:relative;min-height:60vh;background:linear-gradient(165deg,#0a0a0a 0%,#0d1612 100%);overflow:hidden}
.post-hero::before{content:'';position:absolute;top:30%;left:50%;transform:translate(-50%,-50%);width:700px;height:700px;background:radial-gradient(ellipse at center,rgba(27,77,62,.12) 0%,transparent 65%);pointer-events:none}
.post-hero-content{position:relative;z-index:1;max-width:720px;margin:0 auto;padding:0 48px;display:flex;flex-direction:column;justify-content:flex-end;padding-bottom:56px;padding-top:120px}
.post-cat{display:inline-block;width:fit-content;font-size:10px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;padding:4px 10px;border-radius:3px;margin-bottom:18px;background:rgba(44,95,124,.22);color:#7ab8d4}
.post-hero h1{font-family:var(--display);font-size:clamp(32px,5vw,48px);font-weight:600;color:var(--white);letter-spacing:-.02em;line-height:1.1;margin-bottom:16px}
.post-hero-meta{font-size:13px;color:rgba(250,250,250,.5);display:flex;align-items:center;gap:6px}
.post-hero-meta .dot{opacity:.4}
.post-body-wrap{background:var(--white);padding:72px 48px 96px}
.post-body{max-width:680px;margin:0 auto}
.post-body p{font-size:16px;font-weight:300;line-height:1.8;color:var(--graphite);margin-bottom:24px}
.post-body p:first-of-type::first-letter{font-family:var(--display);font-size:56px;font-weight:700;float:left;line-height:.85;margin-right:12px;margin-top:4px;color:var(--black)}
.post-body h2{font-family:var(--display);font-size:28px;font-weight:600;color:var(--black);letter-spacing:-.01em;line-height:1.2;margin-top:52px;margin-bottom:16px}
.post-body h3{font-family:var(--body);font-size:15px;font-weight:600;color:var(--black);margin-top:36px;margin-bottom:10px}
.stat-callout{background:var(--black);border-radius:9px;padding:32px 36px;margin:40px 0;display:flex;align-items:center;gap:32px}
.stat-callout-val{font-family:var(--mono);font-size:42px;font-weight:500;color:var(--blue-mid);letter-spacing:-.02em;white-space:nowrap;flex-shrink:0}
.stat-callout-right{display:flex;flex-direction:column;gap:4px}
.stat-callout-label{font-size:10px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:rgba(250,250,250,.35)}
.stat-callout-note{font-size:13px;font-weight:300;color:rgba(250,250,250,.5);line-height:1.5}
.post-pullquote{border-left:3px solid var(--green);padding:8px 0 8px 28px;margin:40px 0}
.post-pullquote p{font-family:var(--display);font-size:22px!important;font-weight:500;font-style:italic;color:var(--graphite)!important;line-height:1.5!important;margin:0!important}
.leaderboard-section{background:var(--warm-gray);border-radius:12px;padding:32px;margin:48px 0}
.leaderboard-section h3{font-family:var(--display)!important;font-size:24px!important;color:var(--black)!important;margin:0 0 24px 0!important}
.lb-table{width:100%;background:white;border-radius:8px;overflow:hidden;border-collapse:collapse}
.lb-table thead{background:var(--black)}
.lb-table th{color:var(--white);padding:12px 16px;text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px}
.lb-table tbody tr{border-bottom:1px solid #ECECEC}
.lb-table tbody tr:last-child{border-bottom:none}
.lb-table td{padding:14px 16px;font-size:15px;color:var(--graphite)}
.lb-pos{font-family:var(--mono);font-weight:600;color:var(--green);width:70px}
.lb-player{font-weight:600;color:var(--black)}
.lb-score{font-family:var(--mono);font-weight:600;text-align:right;width:80px}
.lb-score.under{color:var(--green-light)}
.lb-score.even{color:var(--graphite)}
.lb-score.over{color:#D94848}
.post-cta{background:var(--black);border-radius:12px;padding:40px;margin:56px 0 0;text-align:center}
.post-cta h3{font-family:var(--display)!important;font-size:28px!important;color:var(--white)!important;margin:0 0 12px 0!important}
.post-cta p{color:rgba(250,250,250,0.6)!important;margin-bottom:24px!important}
.post-cta .cta-btn{display:inline-block;background:var(--green);color:white;padding:12px 28px;border-radius:6px;font-weight:600;font-size:14px;transition:background 0.2s}
.post-cta .cta-btn:hover{background:#236b4f}
footer{background:var(--warm-gray);padding:48px;text-align:center}
footer a{color:var(--green);font-weight:600}
@media (max-width:768px){
nav{padding:0 22px}
.nav-links a:not(.nav-cta){display:none}
.post-hero-content{padding:100px 22px 48px}
.post-body-wrap{padding:48px 22px 72px}
.stat-callout{flex-direction:column;gap:20px;text-align:center}
.leaderboard-section{padding:24px 16px}
.lb-table{font-size:13px}
.lb-table td{padding:10px 8px}
}
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
<tbody>
${leaderboardHTML}
</tbody>
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
<p>Real-time Strokes Gained data, live probabilities, and hole-by-hole stats. See the tournament through the numbers.</p>
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