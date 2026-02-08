// DataGolf API Server with Intelligent Caching & PGA Tour Filtering
// Complete implementation of ALL DataGolf API endpoints + AI Blog Generator

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
  
  return players.filter(player => {
    const playerId = player.dg_id || player.player_id;
    return pgaTourPlayerIds.has(playerId);
  });
}

// Initialize PGA player IDs on server start
updatePGATourPlayerIds();
setInterval(updatePGATourPlayerIds, 86400000); // Update daily

// ============================================
// CORE FETCH HELPER (with caching)
// ============================================

async function fetchDataGolf(endpoint, cacheKey, cacheTTL = 3600) {
  // Check cache
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log(`✓ Cache HIT: ${cacheKey}`);
    return { data: cached, fromCache: true };
  }
  
  console.log(`✗ Cache MISS: ${cacheKey} - Fetching from DataGolf...`);
  
  // Fetch from DataGolf
  const url = `${DATAGOLF_BASE_URL}${endpoint}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`DataGolf API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  // Store in cache
  cache.set(cacheKey, data, cacheTTL);
  console.log(`✓ Cached: ${cacheKey} (TTL: ${cacheTTL}s)`);
  
  return { data, fromCache: false };
}

// ============================================
// GENERAL USE ENDPOINTS
// ============================================

// ENDPOINT: Player List
app.get('/api/players', async (req, res) => {
  try {
    const tour = req.query.tour || 'pga';
    const cacheKey = `players-${tour}`;
    
    const result = await fetchDataGolf(
      `/get-player-list?tour=${tour}&file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
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

// ENDPOINT: Tournament Schedule
app.get('/api/schedule', async (req, res) => {
  try {
    const tour = req.query.tour || 'pga';
    const cacheKey = `schedule-${tour}`;
    
    const result = await fetchDataGolf(
      `/get-schedule?tour=${tour}&file_format=json&key=${DATAGOLF_API_KEY}`,
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

// ENDPOINT: Field Updates (live tournament data)
app.get('/api/field-updates', async (req, res) => {
  try {
    const tour = req.query.tour || 'pga';
    const cacheKey = `field-updates-${tour}`;
    
    const result = await fetchDataGolf(
      `/field-updates?tour=${tour}&file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
      3600 // 1 hour cache (more frequent during live tournaments)
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

// ENDPOINT: Rankings (with PGA Tour filter)
app.get('/api/rankings', async (req, res) => {
  try {
    const cacheKey = 'rankings-pga';
    const result = await fetchDataGolf(
      `/preds/get-dg-rankings?file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
      86400 // 24 hour cache
    );
    
    // Filter to PGA Tour only using primary_tour field
    const pgaRankings = result.data.rankings 
      ? result.data.rankings.filter(p => p.primary_tour === 'PGA')
      : [];
    
    res.json({
      success: true,
      fromCache: result.fromCache,
      count: pgaRankings.length,
      data: { rankings: pgaRankings }
    });
  } catch (error) {
    console.error('Rankings error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ENDPOINT: Skill Ratings (with PGA Tour filter)
app.get('/api/skill-ratings', async (req, res) => {
  try {
    const display = req.query.display || 'value';
    const cacheKey = `skill-ratings-${display}-pga`;
    
    const result = await fetchDataGolf(
      `/preds/skill-ratings?display=${display}&file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
      86400 // 24 hour cache
    );
    
    // Filter to PGA Tour only
    const players = result.data.skill_ratings || result.data.players || [];
    const pgaPlayers = filterPGATourOnly(players);
    
    res.json({
      success: true,
      fromCache: result.fromCache,
      count: pgaPlayers.length,
      data: { skill_ratings: pgaPlayers }
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
    const cacheKey = `pre-tournament-${tour}`;
    
    const result = await fetchDataGolf(
      `/preds/pre-tournament?tour=${tour}&file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
      21600 // 6 hour cache
    );
    
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
    const tour = req.query.tour || 'pga';
    const eventId = req.query.event_id;
    const year = req.query.year;
    
    if (!eventId || !year) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: event_id and year'
      });
    }
    
    const cacheKey = `pre-tournament-archive-${tour}-${eventId}-${year}`;
    
    const result = await fetchDataGolf(
      `/preds/pre-tournament-archive?tour=${tour}&event_id=${eventId}&year=${year}&file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
      604800 // 7 day cache
    );
    
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

// ENDPOINT: Player Decompositions
app.get('/api/player-decompositions', async (req, res) => {
  try {
    const tour = req.query.tour || 'pga';
    const cacheKey = `player-decompositions-${tour}`;
    
    const result = await fetchDataGolf(
      `/preds/player-decompositions?tour=${tour}&file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
      21600 // 6 hour cache
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

// ENDPOINT: Approach Skill
app.get('/api/approach-skill', async (req, res) => {
  try {
    const period = req.query.period || 'l24';
    const cacheKey = `approach-skill-${period}`;
    
    const result = await fetchDataGolf(
      `/preds/approach-skill?period=${period}&file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
      86400 // 24 hour cache
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

// ENDPOINT: Fantasy Projections
app.get('/api/fantasy-projections', async (req, res) => {
  try {
    const tour = req.query.tour || 'pga';
    const site = req.query.site || 'draftkings';
    const cacheKey = `fantasy-projections-${tour}-${site}`;
    
    const result = await fetchDataGolf(
      `/preds/fantasy-projection-defaults?tour=${tour}&site=${site}&file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
      21600 // 6 hour cache
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

// ENDPOINT: Live Tournament Model
app.get('/api/live-tournament', async (req, res) => {
  try {
    const tour = req.query.tour || 'pga';
    const odds_format = req.query.odds_format || 'percent';
    const cacheKey = `live-tournament-${tour}-${odds_format}`;
    
    const result = await fetchDataGolf(
      `/preds/in-play?tour=${tour}&odds_format=${odds_format}&file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
      300 // 5 min cache during live play
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
      300 // 5 min cache
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

// ENDPOINT: Live Hole Scoring
app.get('/api/live-hole-stats', async (req, res) => {
  try {
    const tour = req.query.tour || 'pga';
    const cacheKey = `live-hole-stats-${tour}`;
    
    const result = await fetchDataGolf(
      `/preds/live-hole-stats?tour=${tour}&file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
      300 // 5 min cache
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

// ENDPOINT: Betting Odds
app.get('/api/betting-odds', async (req, res) => {
  try {
    const tour = req.query.tour || 'pga';
    const market = req.query.market || 'win';
    const odds_format = req.query.odds_format || 'american';
    const cacheKey = `betting-odds-${tour}-${market}-${odds_format}`;
    
    const result = await fetchDataGolf(
      `/betting-tools/outrights?tour=${tour}&market=${market}&odds_format=${odds_format}&file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
      1800 // 30 min cache
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

// ENDPOINT: Matchup Odds (specific pairing)
app.get('/api/matchup-odds', async (req, res) => {
  try {
    const tour = req.query.tour || 'pga';
    const market = req.query.market || '2-ball';
    const player_id1 = req.query.player_id1;
    const player_id2 = req.query.player_id2;
    
    if (!player_id1 || !player_id2) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: player_id1 and player_id2'
      });
    }
    
    const cacheKey = `matchup-odds-${tour}-${market}-${player_id1}-${player_id2}`;
    
    const result = await fetchDataGolf(
      `/betting-tools/matchup?tour=${tour}&market=${market}&player_id1=${player_id1}&player_id2=${player_id2}&file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
      1800 // 30 min cache
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

// ENDPOINT: Matchup All Pairings
app.get('/api/matchup-all-pairings', async (req, res) => {
  try {
    const tour = req.query.tour || 'pga';
    const market = req.query.market || '2-ball';
    const cacheKey = `matchup-all-pairings-${tour}-${market}`;
    
    const result = await fetchDataGolf(
      `/betting-tools/matchup-all-pairings?tour=${tour}&market=${market}&file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
      1800 // 30 min cache
    );
    
    res.json({
      success: true,
      fromCache: result.fromCache,
      data: result.data
    });
  } catch (error) {
    console.error('Matchup all pairings error:', error);
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
// ENHANCED AI BLOG GENERATOR
// With SEO Optimization + Claude API + Historical Context
// ============================================

app.get('/api/generate-blog/:round', async (req, res) => {
  try {
    const round = req.params.round;
    const mode = req.query.mode || 'auto';
    
    console.log(`📝 Generating ${mode} blog for ${round}...`);
    
    // Fetch core data - use live-stats for leaderboard since it has scores + SG data
    const [preTournament, liveStatsData, skillRatings] = await Promise.all([
      fetchDataGolfDirect(`/preds/pre-tournament?tour=pga&file_format=json&key=${DATAGOLF_API_KEY}`),
      fetchDataGolfDirect(`/preds/live-tournament-stats?stats=sg_putt,sg_arg,sg_app,sg_ott,sg_total&round=event_avg&display=value&file_format=json&key=${DATAGOLF_API_KEY}`),
      fetchDataGolfDirect(`/preds/skill-ratings?display=value&file_format=json&key=${DATAGOLF_API_KEY}`)
    ]);
    
    const currentEvent = preTournament.schedule.find(e => e.event_completed === false) || preTournament.schedule[0];
    const pgaPlayers = filterPGATourOnly(skillRatings.skill_ratings || []);
    
    console.log('📊 Current event:', currentEvent?.event_name);
    console.log('📊 Live stats structure:', liveStatsData ? Object.keys(liveStatsData) : 'null');
    
    // Extract live stats array
    const liveStats = liveStatsData.live_stats || [];
    
    if (!Array.isArray(liveStats) || liveStats.length === 0) {
      console.error('❌ No live stats available');
      return res.status(400).send(generateNoDataHTML());
    }
    
    // Build leaderboard from live stats (they already have position + scores)
    const leaderboard = [...liveStats]
      .filter(p => p.total !== null && p.total !== undefined)
      .sort((a, b) => a.total - b.total)
      .slice(0, 15);
    
    console.log('📊 Leaderboard count:', leaderboard.length);
    console.log('📊 Leader:', leaderboard[0]?.player_name, leaderboard[0]?.total);
    
    if (leaderboard.length === 0) {
      return res.status(400).send(generateNoDataHTML());
    }
    
    const leader = leaderboard[0];
    
    // Determine mode
    let selectedMode = mode;
    if (mode === 'auto') {
      selectedMode = determineAutoMode(leaderboard, leader);
    }
    
    console.log('🎯 Selected mode:', selectedMode);
    
    // Base data structure
    const baseData = {
      tournament: currentEvent.event_name || liveStatsData.event_name,
      course: liveStatsData.course_name || 'TPC Scottsdale',
      currentRound: 4, // We know it's round 4
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
    console.error('Stack:', error.stack);
    res.status(500).send(generateErrorHTML(error));
  }
});

// Blog helper functions
function determineAutoMode(leaderboard, leader) {
  if (leaderboard.length >= 2) {
    const leadSize = Math.abs(leaderboard[1].total - leaderboard[0].total);
    if (leadSize >= 5) return 'deep';
  }
  
  const maxSG = Math.max(
    Math.abs(leader.sg_ott || 0),
    Math.abs(leader.sg_app || 0),
    Math.abs(leader.sg_arg || 0),
    Math.abs(leader.sg_putt || 0)
  );
  
  if (maxSG > 2.0) return 'deep';
  
  if (leaderboard.length >= 5) {
    const top5Spread = Math.abs(leaderboard[4].total - leaderboard[0].total);
    if (top5Spread <= 2) return 'news';
  }
  
  return 'ai';
}

async function generateNewsBlogEnhanced(data) {
  const roundText = getRoundText(data.round);
  const content = generateNewsContent(data, roundText, null);
  return wrapInHTMLTemplate(data, roundText, content, 'news');
}

async function generateDeepStatsBlogEnhanced(data) {
  const roundText = getRoundText(data.round);
  const content = generateDeepStatsContent(data, roundText, null);
  return wrapInHTMLTemplate(data, roundText, content, 'deep');
}

async function generateAIBlogEnhanced(data) {
  const roundText = getRoundText(data.round);
  const leaderProfile = data.allPlayers.find(p => p.player_name === data.leader.name) || {};
  const context = buildAIContext(data, leaderProfile);
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
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.warn('No Anthropic API key - using fallback');
      return generateFallbackAIContent(context);
    }
    
    const prompt = `You are a professional golf content writer specializing in SEO-optimized, click-worthy tournament analysis.

TOURNAMENT DATA:
${JSON.stringify(context, null, 2)}

TASK: Write a compelling, SEO-optimized blog post analyzing this tournament situation.

SEO REQUIREMENTS:
1. HEADLINE: Click-worthy with player name + tournament + compelling angle
2. STRUCTURE: Clear H2s with keywords, short paragraphs, front-loaded info
3. CLICK-WORTHY: Lead with dramatic stats, create tension, specifics over generics
4. KEYWORDS: Tournament name, player names, course, strokes gained categories
5. DEPTH: 400-600 words, 5-7 specific stats, compare to norms, project forward

TONE: Authoritative but accessible. Data-driven storytelling.

CONTENT REQUIREMENTS:
1. 3 paragraphs: intro, analysis, conclusion
2. INTRO: Most compelling finding
3. ANALYSIS: Why it matters (lead sustainability, stat predictions)
4. CONCLUSION: Sunday prediction based on data
5. Mention 3-4 players by full name
6. Compare current vs career performance

RETURN FORMAT - ONLY JSON:
{
  "intro": "paragraph text",
  "analysis": "paragraph text",
  "conclusion": "paragraph text"
}

Target searches: "${context.leader.name} ${context.tournament}", "${context.course} leaderboard", "PGA Tour strokes gained"`;

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
        messages: [{ role: 'user', content: prompt }]
      })
    });
    
    if (!response.ok) {
      throw new Error(`Claude API error: ${response.statusText}`);
    }
    
    const result = await response.json();
    const contentText = result.content[0].text;
    const parsed = JSON.parse(contentText);
    
    return {
      intro: parsed.intro,
      analysis: parsed.analysis,
      conclusion: parsed.conclusion
    };
    
  } catch (error) {
    console.error('Claude API failed:', error);
    return generateFallbackAIContent(context);
  }
}

function generateFallbackAIContent(context) {
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

function generateNewsContent(data, roundText, newsContext) {
  const { leader, leaderboard, tournament, course, currentRound } = data;
  
  const formatScore = (score) => {
    if (!score) return 'E';
    return score > 0 ? `+${score}` : `${score}`;
  };
  
  const leadSize = leaderboard.length >= 2 ? 
    Math.abs(leaderboard[1].total - leader.score) : 0;
  
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
  const { leader, leaderboard } = data;
  
  const formatSG = (val) => {
    if (!val) return '+0.00';
    return val >= 0 ? `+${val.toFixed(2)}` : val.toFixed(2);
  };
  
  const sgCategories = [
    { value: leader.sgApp, label: 'SG: Approach' },
    { value: leader.sgOTT, label: 'SG: Off-the-Tee' },
    { value: leader.sgArg, label: 'SG: Around-the-Green' },
    { value: leader.sgPutt, label: 'SG: Putting' }
  ];
  
  const strongest = sgCategories.sort((a, b) => b.value - a.value)[0];
  
  const intro = `The numbers reveal the full picture at the ${data.tournament}. ${leader.name} isn't just leading—the leader is dominating through ${strongest.label.toLowerCase()}, gaining ${formatSG(strongest.value)} strokes per round in that category alone.`;
  
  const analysis = `Breaking down the statistical profile: ${leader.name} ranks in the top tier across all Strokes Gained categories this week. The ${formatSG(leader.sgTotal)} total strokes gained represents elite ball-striking combined with solid short game execution. This isn't a one-dimensional performance—it's comprehensive excellence.`;
  
  const conclusion = `Field averages tell us most players are hovering around even strokes gained. ${leader.name} is outpacing that baseline by multiple strokes per round. That gap doesn't close without either a historic comeback or a historic collapse. The data overwhelmingly favors the leader holding on.`;
  
  return { intro, analysis, conclusion };
}

function getRoundText(round) {
  const map = {
    'r1': 'Round 1',
    'r2': 'Round 2',
    'r3': 'Round 3',
    'final': 'Final Round'
  };
  return map[round] || 'Tournament Update';
}

function generateNoDataHTML() {
  return `<!DOCTYPE html>
<html><body style="font-family: sans-serif; padding: 40px;">
<h1>No Tournament Data Available</h1>
<p>There is no active PGA Tour tournament at this time.</p>
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
    const scoreClass = p.total < 0 ? 'under' : p.total > 0 ? 'over' : 'even';
    return `<tr><td class="lb-pos">${pos}</td><td class="lb-player">${escapeHtml(p.player_name)}</td><td class="lb-score ${scoreClass}">${formatScore(p.total)}</td></tr>`;
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
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(tournament)} ${escapeHtml(roundText)}: ${titleSuffix} - Divot Lab</title>
<meta name="description" content="AI-generated analysis of ${escapeHtml(roundText)} at ${escapeHtml(course)}. Strokes Gained breakdown, leaderboard analysis, and data-driven predictions.">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,500;1,600&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--black:#0A0A0A;--white:#FAFAFA;--graphite:#4A4A4A;--green:#1B4D3E;--green-light:#5BBF85;--blue-mid:#5A8FA8;--warm-gray:#F3F2F0}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'DM Sans',sans-serif;color:var(--black);background:var(--white)}nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:0 56px;height:68px;display:flex;align-items:center;background:rgba(10,10,10,0.9);backdrop-filter:blur(18px);border-bottom:1px solid rgba(255,255,255,0.07)}.nav-logo{display:flex;align-items:center;gap:11px}.nav-logo svg{width:26px;height:26px;color:var(--white)}.nav-wordmark{font-size:14px;font-weight:600;letter-spacing:.1em;color:var(--white)}.nav-wordmark span{font-weight:300;opacity:.55}.nav-links{display:flex;align-items:center;gap:32px;margin-left:auto}.nav-links a{font-size:13px;font-weight:500;color:rgba(250,250,250,.65)}.post-hero{position:relative;min-height:60vh;background:linear-gradient(165deg,#0a0a0a 0%,#0d1612 100%);padding:120px 48px 56px}.post-hero-content{max-width:720px;margin:0 auto}.post-cat{display:inline-block;font-size:10px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;padding:4px 10px;border-radius:3px;margin-bottom:18px;background:rgba(44,95,124,.22);color:#7ab8d4}.post-hero h1{font-family:'Cormorant Garamond',serif;font-size:clamp(32px,5vw,48px);font-weight:600;color:var(--white);letter-spacing:-.02em;line-height:1.1;margin-bottom:16px}.post-body-wrap{background:var(--white);padding:72px 48px 96px}.post-body{max-width:680px;margin:0 auto}.post-body p{font-size:16px;font-weight:300;line-height:1.8;color:var(--graphite);margin-bottom:24px}.post-body h2{font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:600;margin-top:52px;margin-bottom:16px}.leaderboard-section{background:var(--warm-gray);border-radius:12px;padding:32px;margin:48px 0}.lb-table{width:100%;background:white;border-radius:8px;overflow:hidden;border-collapse:collapse}.lb-table thead{background:var(--black)}.lb-table th{color:var(--white);padding:12px 16px;font-size:10px;font-weight:600;text-transform:uppercase}.lb-table td{padding:14px 16px;font-size:15px;color:var(--graphite)}.lb-pos{font-family:'JetBrains Mono',monospace;font-weight:600;color:var(--green)}.lb-player{font-weight:600;color:var(--black)}.lb-score{font-family:'JetBrains Mono',monospace;font-weight:600;text-align:right}.lb-score.under{color:var(--green-light)}.stat-callout{background:var(--black);border-radius:9px;padding:32px 36px;margin:40px 0;display:flex;align-items:center;gap:32px}.stat-callout-val{font-family:'JetBrains Mono',monospace;font-size:42px;font-weight:500;color:var(--blue-mid)}.stat-callout-label{font-size:10px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:rgba(250,250,250,.35)}.post-cta{background:var(--black);border-radius:12px;padding:40px;margin:56px 0 0;text-align:center}.post-cta h3{font-family:'Cormorant Garamond',serif;font-size:28px;color:var(--white);margin:0 0 12px 0}.post-cta .cta-btn{display:inline-block;background:var(--green);color:white;padding:12px 28px;border-radius:6px;font-weight:600;font-size:14px}footer{background:var(--warm-gray);padding:48px;text-align:center}footer a{color:var(--green);font-weight:600}
</style>
</head>
<body>
<nav>
<a href="/" class="nav-logo">
<svg viewBox="0 0 72 72" fill="none"><line x1="4" y1="36.5" x2="68" y2="36.5" stroke="currentColor" stroke-width="3.2"/><path d="M10 36.5 C18 36.5,26 60.5,36 60.5 S54 36.5,62 36.5" fill="currentColor" fill-opacity=".15"/><path d="M10 36.5 C18 36.5,26 60.5,36 60.5 S54 36.5,62 36.5" stroke="currentColor" stroke-width="2.8" fill="none"/><circle cx="36" cy="20.5" r="9" fill="currentColor"/></svg>
<span class="nav-wordmark">DIVOT <span>LAB</span></span>
</a>
<div class="nav-links">
<a href="/articles">Articles</a>
<a href="/the-lab">The Lab</a>
</div>
</nav>
<section class="post-hero">
<div class="post-hero-content">
<span class="post-cat">PGA Tour</span>
<h1>${escapeHtml(tournament)} ${escapeHtml(roundText)}: ${titleSuffix}</h1>
<div style="font-size:13px;color:rgba(250,250,250,.5)">${publishDate} · 6 min read</div>
</div>
</section>
<div class="post-body-wrap">
<div class="post-body">
<p>${content.intro}</p>
<div class="leaderboard-section">
<h3 style="font-family:'Cormorant Garamond',serif;font-size:24px;margin:0 0 24px 0">Top 10 After ${escapeHtml(roundText)}</h3>
<table class="lb-table">
<thead><tr><th>Pos</th><th>Player</th><th>Score</th></tr></thead>
<tbody>${leaderboardHTML}</tbody>
</table>
</div>
<h2>The Numbers Tell the Story</h2>
<p>${content.analysis}</p>
<div class="stat-callout">
<div class="stat-callout-val">${formatSG(strongestSG.value)}</div>
<div style="display:flex;flex-direction:column;gap:4px">
<div class="stat-callout-label">${escapeHtml(strongestSG.label)} · Leader</div>
<div style="font-size:13px;color:rgba(250,250,250,.5)">Through ${currentRound} rounds at ${escapeHtml(course)}</div>
</div>
</div>
<h2>Looking Ahead to Sunday</h2>
<p>${content.conclusion}</p>
<div class="post-cta">
<h3>Follow Every Shot Live</h3>
<p style="color:rgba(250,250,250,0.6);margin-bottom:24px">Real-time Strokes Gained data and live probabilities.</p>
<a href="/the-lab" class="cta-btn">Go to The Lab</a>
</div>
</div>
</div>
<footer><p><a href="/articles">← Back to Articles</a></p></footer>
</body>
</html>`;
}

// ============================================
// OPTIMIZED COMPOSITE ENDPOINTS
// ============================================

// ENDPOINT: Homepage Stats
app.get('/api/homepage-stats', async (req, res) => {
  try {
    const cacheKey = 'homepage-stats-pga';
    const cached = cache.get(cacheKey);
    
    if (cached) {
      return res.json({ success: true, fromCache: true, data: cached });
    }

    const skillRatings = await fetchDataGolfDirect(
      `/preds/skill-ratings?display=value&file_format=json&key=${DATAGOLF_API_KEY}`
    );

    const pgaPlayers = filterPGATourOnly(skillRatings.skill_ratings || []);

    const ottLeader = [...pgaPlayers].sort((a,b) => (b.sg_ott || 0) - (a.sg_ott || 0))[0] || {};
    const appLeader = [...pgaPlayers].sort((a,b) => (b.sg_app || 0) - (a.sg_app || 0))[0] || {};
    const puttLeader = [...pgaPlayers].sort((a,b) => (b.sg_putt || 0) - (a.sg_putt || 0))[0] || {};

    const stats = {
      sg_ott: { value: (ottLeader.sg_ott || 0).toFixed(2), player: ottLeader.player_name || 'N/A' },
      sg_app: { value: (appLeader.sg_app || 0).toFixed(2), player: appLeader.player_name || 'N/A' },
      sg_putt: { value: (puttLeader.sg_putt || 0).toFixed(2), player: puttLeader.player_name || 'N/A' }
    };

    cache.set(cacheKey, stats, 21600);

    res.json({ success: true, fromCache: false, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ENDPOINT: Lab Page Data
app.get('/api/lab-data', async (req, res) => {
  try {
    const cacheKey = 'lab-data-pga';
    const cached = cache.get(cacheKey);
    
    if (cached) {
      return res.json({ success: true, fromCache: true, data: cached });
    }

    const [fieldUpdates, liveStats, rankings, preTournament] = await Promise.all([
      fetchDataGolfDirect(`/field-updates?tour=pga&file_format=json&key=${DATAGOLF_API_KEY}`),
      fetchDataGolfDirect(`/preds/live-tournament-stats?stats=sg_putt,sg_arg,sg_app,sg_ott,sg_total&round=event_avg&display=value&file_format=json&key=${DATAGOLF_API_KEY}`)
        .catch(() => []),
      fetchDataGolfDirect(`/preds/get-dg-rankings?file_format=json&key=${DATAGOLF_API_KEY}`),
      fetchDataGolfDirect(`/preds/pre-tournament?tour=pga&file_format=json&key=${DATAGOLF_API_KEY}`)
    ]);

    const pgaRankings = rankings.rankings ? rankings.rankings.filter(p => p.primary_tour === 'PGA') : [];

    const labData = {
      fieldUpdates,
      liveStats,
      rankings: pgaRankings,
      preTournament
    };

    cache.set(cacheKey, labData, 21600);

    res.json({ success: true, fromCache: false, data: labData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// UTILITY ENDPOINTS
// ============================================

app.get('/api/cache-status', (req, res) => {
  const keys = cache.keys();
  const stats = cache.getStats();
  res.json({ success: true, cacheKeys: keys.length, stats, keys });
});

app.post('/api/clear-cache', (req, res) => {
  cache.flushAll();
  res.json({ success: true, message: 'Cache cleared' });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    pgaPlayerCount: pgaTourPlayerIds.size,
    lastRankingsUpdate: new Date(lastRankingsUpdate).toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═════════════════════════════════════════════╗
║     DIVOT LAB API SERVER v2.2               ║
║     DataGolf + AI Blog Generator            ║
╚═════════════════════════════════════════════╝

✓ Server running on port ${PORT}
✓ PGA Tour filtering active
✓ AI Blog Generator ready
✓ Claude API: ${process.env.ANTHROPIC_API_KEY ? 'Configured ✓' : 'Not configured (using fallback)'}

📝 BLOG GENERATOR:
  GET  /api/generate-blog/:round?mode=MODE
       Modes: news, deep, ai, auto
       Rounds: r1, r2, r3, final
  `);
});

module.exports = app;