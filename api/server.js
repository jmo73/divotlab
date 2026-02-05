// DataGolf API Server with Intelligent Caching
// Handles all API calls to DataGolf and caches responses appropriately

const express = require('express');
const cors = require('cors');
const NodeCache = require('node-cache');

const app = express();
const PORT = process.env.PORT || 3001;

// CRITICAL: Never expose this key client-side
const DATAGOLF_API_KEY = 'dc8cd870e0460b9fb860cf59164e';
const DATAGOLF_BASE_URL = 'https://feeds.datagolf.com';

// Caching with intelligent TTL
const cache = new NodeCache({
  stdTTL: 3600,
  checkperiod: 120,
  useClones: false
});

// Middleware
app.use(cors());
app.use(express.json());

// Helper: Fetch with caching
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
// CORE ENDPOINTS
// ============================================

// ENDPOINT: Player Rankings
app.get('/api/rankings', async (req, res) => {
  try {
    const result = await fetchDataGolf(
      `/preds/get-dg-rankings?file_format=json&key=${DATAGOLF_API_KEY}`,
      'rankings',
      86400 // 24hr cache
    );

    res.json({
      success: true,
      fromCache: result.fromCache,
      data: result.data
    });
  } catch (error) {
    console.error('Rankings error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ENDPOINT: Skill Ratings (PRIMARY DATA SOURCE FOR THE LAB)
app.get('/api/skill-ratings', async (req, res) => {
  try {
    const display = req.query.display || 'value'; // 'value' or 'rank'
    const cacheKey = `skill-ratings-${display}`;

    const result = await fetchDataGolf(
      `/preds/skill-ratings?display=${display}&file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
      86400 // 24hr cache
    );

    res.json({
      success: true,
      fromCache: result.fromCache,
      data: result.data
    });
  } catch (error) {
    console.error('Skill ratings error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

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

// ENDPOINT: Pre-Tournament Predictions
app.get('/api/pre-tournament', async (req, res) => {
  try {
    const tour = req.query.tour || 'pga';
    const cacheKey = `pre-tournament-${tour}`;

    const result = await fetchDataGolf(
      `/preds/pre-tournament?tour=${tour}&odds_format=percent&file_format=json&key=${DATAGOLF_API_KEY}`,
      cacheKey,
      21600 // 6hr cache
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

// ============================================
// LIVE DATA ENDPOINTS
// ============================================

// ENDPOINT: Live Tournament Predictions
app.get('/api/live-tournament', async (req, res) => {
  try {
    const tour = req.query.tour || 'pga';
    const cacheKey = `live-tournament-${tour}`;

    const result = await fetchDataGolf(
      `/preds/in-play?tour=${tour}&odds_format=percent&file_format=json&key=${DATAGOLF_API_KEY}`,
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

// ============================================
// SCHEDULE & GENERAL DATA
// ============================================

// ENDPOINT: Tour Schedule
app.get('/api/schedule', async (req, res) => {
  try {
    const tour = req.query.tour || 'pga';
    const season = req.query.season || '2026';
    const cacheKey = `schedule-${tour}-${season}`;

    const result = await fetchDataGolf(
      `/get-schedule?tour=${tour}&season=${season}&file_format=json&key=${DATAGOLF_API_KEY}`,
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

// ============================================
// OPTIMIZED COMPOSITE ENDPOINTS
// ============================================

// ENDPOINT: Homepage Stats (optimized composite)
app.get('/api/homepage-stats', async (req, res) => {
  try {
    const cacheKey = 'homepage-stats';
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

    // Fetch both datasets in parallel
    const [skillRatings, fieldUpdates] = await Promise.all([
      fetch(`${DATAGOLF_BASE_URL}/preds/skill-ratings?display=value&file_format=json&key=${DATAGOLF_API_KEY}`).then(r => r.json()),
      fetch(`${DATAGOLF_BASE_URL}/field-updates?tour=pga&file_format=json&key=${DATAGOLF_API_KEY}`).then(r => r.json())
    ]);

    const stats = {
      strokesGainedLeader: {
        value: skillRatings.skill_ratings?.[0]?.sg_total || 0,
        player: skillRatings.skill_ratings?.[0]?.player_name || 'N/A',
        label: 'Strokes Gained · Leader'
      },
      currentTournament: {
        name: fieldUpdates.event_name || 'No Tournament This Week',
        fieldSize: fieldUpdates.field?.length || 0
      },
      timestamp: new Date().toISOString()
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

// ENDPOINT: Lab Page Data (optimized composite)
app.get('/api/lab-data', async (req, res) => {
  try {
    const cacheKey = 'lab-data-composite';
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
    const [skillRatings, preTournament, fieldUpdates] = await Promise.all([
      fetch(`${DATAGOLF_BASE_URL}/preds/skill-ratings?display=value&file_format=json&key=${DATAGOLF_API_KEY}`).then(r => r.json()),
      fetch(`${DATAGOLF_BASE_URL}/preds/pre-tournament?tour=pga&odds_format=percent&file_format=json&key=${DATAGOLF_API_KEY}`).then(r => r.json()),
      fetch(`${DATAGOLF_BASE_URL}/field-updates?tour=pga&file_format=json&key=${DATAGOLF_API_KEY}`).then(r => r.json())
    ]);

    const compositeData = {
      players: skillRatings.players || skillRatings.skill_ratings || [],
      predictions: preTournament.baseline_history_fit || preTournament.predictions || [],
      tournament: {
        event_name: preTournament.event_name || fieldUpdates.event_name || 'Upcoming Tournament',
        course: fieldUpdates.course || '',
        field_size: fieldUpdates.field?.length || 0
      },
      timestamp: new Date().toISOString()
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
    stats: stats
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
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═════════════════════════════════════════════╗
║     DIVOT LAB API SERVER                    ║
║     DataGolf Integration with Smart Caching ║
╚═════════════════════════════════════════════╝

✓ Server running on port ${PORT}
✓ Cache enabled with intelligent TTL
✓ Ready to serve requests

Core Endpoints:
  GET  /api/rankings              (24hr cache)
  GET  /api/skill-ratings         (24hr cache) ⭐ PRIMARY
  GET  /api/players               (7day cache)
  GET  /api/field-updates         (1hr cache)
  GET  /api/pre-tournament        (6hr cache)
  GET  /api/player-decompositions (6hr cache)
  GET  /api/approach-skill        (24hr cache)

Live Endpoints:
  GET  /api/live-tournament       (5min cache)
  GET  /api/live-stats            (5min cache)

Schedule:
  GET  /api/schedule              (7day cache)

Optimized Composites:
  GET  /api/homepage-stats        (6hr cache) ⭐
  GET  /api/lab-data              (6hr cache) ⭐ NEW

Utilities:
  GET  /api/cache-status
  POST /api/clear-cache
  GET  /health

⚠️  API Key is secured server-side
  `);
});

module.exports = app;