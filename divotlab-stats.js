// Divot Lab - Live Stats Integration (Production)
const API_BASE_URL = 'https://divotlab-api.vercel.app/api';

const STATS_CONFIG = {
  refreshInterval: 21600000, // 6 hours
  fallbackData: {
    sgLeader: { value: '+1.42', label: 'Strokes Gained · Leader' },
    stat2: { value: '68.1', label: 'Scoring Avg · This Week' },
    stat3: { value: '71%', label: 'Greens in Regulation' }
  }
};

function formatSGValue(value) {
  if (value > 0) return `+${value.toFixed(2)}`;
  return value.toFixed(2);
}

async function loadStats() {
  try {
    console.log('📊 Loading stats from API...');
    
    const skillResponse = await fetch(`${API_BASE_URL}/skill-ratings`);
    const skillData = await skillResponse.json();
    
    if (!skillData.success) {
      throw new Error('API returned error');
    }
    
    // DataGolf returns "players" array
    let players = null;
    if (skillData.data && skillData.data.players) {
      players = skillData.data.players;
    } else if (skillData.data && skillData.data.rankings) {
      players = skillData.data.rankings;
    } else if (skillData.players) {
      players = skillData.players;
    }
    
    if (!players || players.length === 0) {
      throw new Error('No player data in response');
    }
    
    const topPlayer = players[0];
    
    const fieldResponse = await fetch(`${API_BASE_URL}/field-updates`);
    const fieldData = await fieldResponse.json();
    
    // Stat 1: Top player's SG Total
    const sgTotal = topPlayer.sg_total || 0;
    const playerName = topPlayer.player_name || 'Unknown';
    
    document.getElementById('sgLeaderValue').textContent = formatSGValue(sgTotal);
    document.getElementById('sgLeaderLabel').textContent = `SG Total · ${playerName}`;
    
    // Stat 2: Tournament field size
    if (fieldData.success && fieldData.data && fieldData.data.event_name) {
      const fieldSize = fieldData.data.field?.length || 0;
      const eventName = fieldData.data.event_name;
      document.getElementById('stat2Value').textContent = fieldSize;
      document.getElementById('stat2Label').textContent = `Field Size · ${eventName}`;
    } else {
      const sgPutt = topPlayer.sg_putt || 0;
      document.getElementById('stat2Value').textContent = formatSGValue(sgPutt);
      document.getElementById('stat2Label').textContent = 'SG: Putting · Leader';
    }
    
    // Stat 3: Top player's SG Approach
    const sgApp = topPlayer.sg_app || 0;
    document.getElementById('stat3Value').textContent = formatSGValue(sgApp);
    document.getElementById('stat3Label').textContent = 'SG: Approach · Leader';
    
    console.log('✓ Stats loaded successfully');
    
    if (skillData.fromCache) {
      console.log('  ↳ Data served from cache');
    }
    
  } catch (error) {
    console.error('Error loading stats:', error);
    
    // Fallback to default values
    document.getElementById('sgLeaderValue').textContent = STATS_CONFIG.fallbackData.sgLeader.value;
    document.getElementById('sgLeaderLabel').textContent = STATS_CONFIG.fallbackData.sgLeader.label;
    document.getElementById('stat2Value').textContent = STATS_CONFIG.fallbackData.stat2.value;
    document.getElementById('stat2Label').textContent = STATS_CONFIG.fallbackData.stat2.label;
    document.getElementById('stat3Value').textContent = STATS_CONFIG.fallbackData.stat3.value;
    document.getElementById('stat3Label').textContent = STATS_CONFIG.fallbackData.stat3.label;
    
    console.log('  ↳ Using fallback data');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadStats);
} else {
  loadStats();
}

setInterval(loadStats, STATS_CONFIG.refreshInterval);
