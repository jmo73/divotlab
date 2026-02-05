// ============================================
// CONFIG
// ============================================
const API_BASE_URL = 'https://divotlab-api.vercel.app';

// ============================================
// UTILITY FUNCTIONS
// ============================================
function getFlag(country) {
  const flags = {
    'USA': '🇺🇸', 'CAN': '🇨🇦', 'MEX': '🇲🇽', 'ENG': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'SCO': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'IRL': '🇮🇪',
    'NIR': '🇬🇧', 'WAL': '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'ESP': '🇪🇸', 'FRA': '🇫🇷', 'GER': '🇩🇪', 'ITA': '🇮🇹',
    'SWE': '🇸🇪', 'NOR': '🇳🇴', 'DEN': '🇩🇰', 'NED': '🇳🇱', 'BEL': '🇧🇪', 'AUT': '🇦🇹',
    'SUI': '🇨🇭', 'JPN': '🇯🇵', 'KOR': '🇰🇷', 'CHN': '🇨🇳', 'AUS': '🇦🇺', 'NZL': '🇳🇿',
    'RSA': '🇿🇦', 'ARG': '🇦🇷', 'BRA': '🇧🇷', 'CHI': '🇨🇱', 'COL': '🇨🇴', 'VEN': '🇻🇪',
    'IND': '🇮🇳', 'THA': '🇹🇭', 'PHI': '🇵🇭', 'TWN': '🇹🇼', 'ZIM': '🇿🇼', 'FIJ': '🇫🇯',
    'PER': '🇵🇪', 'CRC': '🇨🇷', 'PAN': '🇵🇦', 'PUR': '🇵🇷', 'DOM': '🇩🇴'
  };
  return flags[country] || '🏳️';
}

function formatSG(val) {
  const num = parseFloat(val);
  if (isNaN(num)) return '—';
  return num >= 0 ? `+${num.toFixed(2)}` : num.toFixed(2);
}

function getEventStatus(tournament) {
  const currentRound = tournament.current_round || 0;
  const status = tournament.status || 'upcoming';
  
  if (status === 'completed') {
    return { label: 'Final', sublabel: '', color: '#5A8FA8' };
  }
  
  if (currentRound > 0) {
    return { label: 'Live', sublabel: `R${currentRound}`, color: '#E76F51' };
  }
  
  return { label: 'Upcoming', sublabel: '', color: '#5BBF85' };
}

function getPlayingStyle(player) {
  const putting = player.sg_putt || 0;
  const approach = player.sg_app || 0;
  const offTee = player.sg_ott || 0;
  const aroundGreen = player.sg_arg || 0;
  
  const categories = [
    { name: 'Power', value: offTee, color: '#E76F51' },
    { name: 'Precision', value: approach, color: '#5A8FA8' },
    { name: 'Touch', value: putting, color: '#9B59B6' },
    { name: 'Scrambler', value: aroundGreen, color: '#F4A259' }
  ];
  
  const sorted = [...categories].sort((a, b) => b.value - a.value);
  const max = Math.max(offTee, approach, putting, aroundGreen);
  const min = Math.min(offTee, approach, putting, aroundGreen);
  
  if ((max - min) < 0.4 && (player.sg_total || 0) > 1.0) {
    return { name: 'Complete', color: '#5BBF85' };
  }
  return { name: sorted[0].name, color: sorted[0].color };
}

function calculateFieldStrength(players) {
  if (!players || players.length === 0) return { rating: 5, label: 'Average', eliteCount: 0, topTier: 0 };
  
  const eliteCount = players.filter(p => (p.sg_total || 0) > 1.5).length;
  const topTier = players.filter(p => (p.sg_total || 0) > 1.0).length;
  const top20 = players.slice(0, Math.min(20, players.length));
  const top20Avg = top20.reduce((sum, p) => sum + (p.sg_total || 0), 0) / top20.length;
  
  let rating = 5 + eliteCount * 0.25 + topTier * 0.08 + top20Avg * 0.4;
  rating = Math.min(10, Math.max(1, rating));
  
  let label = 'Average';
  if (rating >= 8.5) label = 'Elite';
  else if (rating >= 7) label = 'Very Strong';
  else if (rating >= 5.5) label = 'Strong';
  else if (rating >= 4) label = 'Average';
  else label = 'Weak';
  
  return { rating: rating.toFixed(1), label, eliteCount, topTier };
}

function getLabelColor(rating, label) {
  const r = parseFloat(rating);
  // Calculate position (0-1) for gradient from red (#E76F51) to blue (#5A8FA8)
  const t = r / 10;
  
  // Red RGB: 231, 111, 81
  // Blue RGB: 90, 143, 168
  const red = Math.round(231 + (90 - 231) * t);
  const green = Math.round(111 + (143 - 111) * t);
  const blue = Math.round(81 + (168 - 81) * t);
  
  return `rgb(${red}, ${green}, ${blue})`;
}

function calculateFieldMetrics(players) {
  if (!players || players.length === 0) return null;
  
  const avgSG = players.reduce((sum, p) => sum + (p.sg_total || 0), 0) / players.length;
  const avgDrivingDist = players.reduce((sum, p) => sum + (p.driving_dist || 0), 0) / players.length;
  const avgGIR = players.reduce((sum, p) => sum + ((p.gir || 0) * 100), 0) / players.length;
  
  return {
    avgSG: avgSG.toFixed(2),
    avgDrivingDist: avgDrivingDist > 0 ? Math.round(avgDrivingDist + 280) : null,
    avgGIR: avgGIR > 0 ? avgGIR.toFixed(1) : null
  };
}

// ============================================
// GLOBAL STATE
// ============================================
let globalPlayers = [];
let globalPredictions = [];
let globalTournamentInfo = {};
let globalDGRankings = [];
let globalLeaderboard = [];
let hoveredPlayer = null;

// ============================================
// MAIN LOADER
// ============================================
async function loadAllData() {
  try {
    console.log('🏌️ Loading lab data...');
    
    // Load composite lab data
    const labDataResponse = await fetch(`${API_BASE_URL}/api/lab-data`);
    const labData = await labDataResponse.json();
    
    if (labData.success && labData.data) {
      const { players, predictions, tournament } = labData.data;
      
      globalPlayers = players || [];
      globalPredictions = predictions || [];
      globalTournamentInfo = tournament || {};
      
      console.log('✓ Loaded', globalPlayers.length, 'players');
      console.log('✓ Loaded', globalPredictions.length, 'predictions');
      console.log('✓ Tournament:', globalTournamentInfo.event_name);
    }
    
    // Load DG Rankings for Top 10
    try {
      const rankingsResponse = await fetch(`${API_BASE_URL}/api/rankings`);
      const rankingsData = await rankingsResponse.json();
      
      if (rankingsData.success && rankingsData.data && rankingsData.data.rankings) {
        globalDGRankings = rankingsData.data.rankings.slice(0, 10);
        console.log('✓ Loaded DG Rankings top 10');
      }
    } catch (err) {
      console.warn('⚠️ Could not load DG rankings:', err);
    }
    
    // Load live predictions if tournament is ongoing
    if (globalTournamentInfo.current_round > 0) {
      try {
        const liveResponse = await fetch(`${API_BASE_URL}/api/live-tournament`);
        const liveData = await liveResponse.json();
        
        if (liveData.success && liveData.data) {
          // The in-play endpoint returns { data: [...] } directly
          const liveArray = liveData.data.data || liveData.data || [];
          if (liveArray.length > 0) {
            globalLeaderboard = liveArray; // Full leaderboard data
            globalPredictions = liveArray; // Same data for predictions
            console.log('✓ Using live data:', liveArray.length, 'players');
          }
        }
      } catch (err) {
        console.warn('⚠️ Could not load live data:', err);
      }
    }
    
    renderTournamentBanner();
    renderFieldStrength();
    renderLeaderboard();
    renderTop10();
    renderPredictions();
    renderCharts();
    
  } catch (error) {
    console.error('❌ Error loading data:', error);
    showError('Unable to load data. Please refresh the page.');
  }
}

// ============================================
// RENDERERS
// ============================================
function renderTournamentBanner() {
  const container = document.getElementById('tournament-banner');
  if (!container) return;
  
  const eventStatus = getEventStatus(globalTournamentInfo);
  const courseName = globalTournamentInfo.course || '';
  const fieldSize = globalTournamentInfo.field_size || 0;
  
  container.innerHTML = `
    <div class="banner-inner">
      <div class="banner-label" style="color: ${eventStatus.color}">
        ${eventStatus.label}${eventStatus.sublabel ? ` · ${eventStatus.sublabel}` : ''}
      </div>
      <h2 class="banner-title">${globalTournamentInfo.event_name || 'Upcoming Tournament'}</h2>
      <div class="banner-course">${courseName}${courseName && fieldSize ? ' · ' : ''}${fieldSize ? `${fieldSize} players` : ''}</div>
      <div class="banner-course" style="opacity: 0.5; font-size: 12px; margin-top: 4px;">
        Par 72
      </div>
    </div>
  `;
}

function renderFieldStrength() {
  const container = document.getElementById('field-strength');
  if (!container) return;
  
  const field = calculateFieldStrength(globalPlayers);
  const pct = (parseFloat(field.rating) / 10) * 100;
  const labelColor = getLabelColor(field.rating, field.label);
  
  container.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; max-width: 1200px; margin: 0 auto;" class="field-grid">
      
      <!-- Field Strength Card 1 -->
      <div class="strength-card">
        <div class="strength-header">
          <span class="strength-label">Field Strength</span>
          <span class="strength-value">${field.rating}<span class="strength-max">/10</span></span>
        </div>
        <div class="strength-bar">
          <div class="strength-fill" style="width: ${pct}%; background: linear-gradient(90deg, #E76F51, #5A8FA8);"></div>
        </div>
        <div class="strength-rating" style="color: ${labelColor};">${field.label}</div>
        <div class="strength-details">
          <div class="strength-stat"><span class="stat-num">${field.eliteCount}</span><span class="stat-text">Elite (SG 1.5+)</span></div>
          <div class="strength-stat"><span class="stat-num">${field.topTier}</span><span class="stat-text">Top Tier (SG 1.0+)</span></div>
        </div>
      </div>

      <!-- Field Strength Card 2 -->
      <div class="strength-card">
        <div class="strength-header">
          <span class="strength-label">Field Strength</span>
          <span class="strength-value">${field.rating}<span class="strength-max">/10</span></span>
        </div>
        <div class="strength-bar">
          <div class="strength-fill" style="width: ${pct}%; background: linear-gradient(90deg, #E76F51, #5A8FA8);"></div>
        </div>
        <div class="strength-rating" style="color: ${labelColor};">${field.label}</div>
        <div class="strength-details">
          <div class="strength-stat"><span class="stat-num">${field.eliteCount}</span><span class="stat-text">Elite (SG 1.5+)</span></div>
          <div class="strength-stat"><span class="stat-num">${field.topTier}</span><span class="stat-text">Top Tier (SG 1.0+)</span></div>
        </div>
      </div>

      <!-- Field Strength Card 3 -->
      <div class="strength-card">
        <div class="strength-header">
          <span class="strength-label">Field Strength</span>
          <span class="strength-value">${field.rating}<span class="strength-max">/10</span></span>
        </div>
        <div class="strength-bar">
          <div class="strength-fill" style="width: ${pct}%; background: linear-gradient(90deg, #E76F51, #5A8FA8);"></div>
        </div>
        <div class="strength-rating" style="color: ${labelColor};">${field.label}</div>
        <div class="strength-details">
          <div class="strength-stat"><span class="stat-num">${field.eliteCount}</span><span class="stat-text">Elite (SG 1.5+)</span></div>
          <div class="strength-stat"><span class="stat-num">${field.topTier}</span><span class="stat-text">Top Tier (SG 1.0+)</span></div>
        </div>
      </div>

      <!-- Field Strength Card 4 -->
      <div class="strength-card">
        <div class="strength-header">
          <span class="strength-label">Field Strength</span>
          <span class="strength-value">${field.rating}<span class="strength-max">/10</span></span>
        </div>
        <div class="strength-bar">
          <div class="strength-fill" style="width: ${pct}%; background: linear-gradient(90deg, #E76F51, #5A8FA8);"></div>
        </div>
        <div class="strength-rating" style="color: ${labelColor};">${field.label}</div>
        <div class="strength-details">
          <div class="strength-stat"><span class="stat-num">${field.eliteCount}</span><span class="stat-text">Elite (SG 1.5+)</span></div>
          <div class="strength-stat"><span class="stat-num">${field.topTier}</span><span class="stat-text">Top Tier (SG 1.0+)</span></div>
        </div>
      </div>

    </div>
  `;
}

function renderLeaderboard() {
  const container = document.getElementById('leaderboard-table');
  if (!container) return;
  
  const isLive = (globalTournamentInfo.current_round || 0) > 0;
  
  if (!isLive || !globalLeaderboard.length) {
    container.innerHTML = '<div class="loading-msg">Leaderboard available when tournament is live</div>';
    return;
  }
  
  // Sort by current position
  const sorted = [...globalLeaderboard].sort((a, b) => {
    const posA = parseInt(a.current_pos) || 999;
    const posB = parseInt(b.current_pos) || 999;
    return posA - posB;
  });
  
  container.innerHTML = `
    <div class="table-wrapper">
      <table class="pred-table">
        <thead>
          <tr>
            <th class="rank-col">Pos</th>
            <th>Player</th>
            <th class="prob-col">Score</th>
            <th class="prob-col">Today</th>
            <th class="prob-col">Thru</th>
            <th class="prob-col">R1</th>
            <th class="prob-col">R2</th>
            <th class="prob-col">R3</th>
            <th class="prob-col">R4</th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map((p, i) => {
            const score = p.current_score || 0;
            const scoreDisplay = score > 0 ? `+${score}` : score === 0 ? 'E' : score;
            const today = p.today || 0;
            const todayDisplay = today > 0 ? `+${today}` : today === 0 ? 'E' : today;
            
            return `
              <tr>
                <td class="rank-col">${p.current_pos || '-'}</td>
                <td class="player-col">${p.player_name}</td>
                <td class="prob-col win">${scoreDisplay}</td>
                <td class="prob-col">${todayDisplay}</td>
                <td class="prob-col">${p.thru || '-'}</td>
                <td class="prob-col">${p.R1 || '-'}</td>
                <td class="prob-col">${p.R2 || '-'}</td>
                <td class="prob-col">${p.R3 || '-'}</td>
                <td class="prob-col">${p.R4 || '-'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderTop10() {
  const container = document.getElementById('top10-grid');
  if (!container) return;
  
  // Use DG Rankings if available, otherwise fallback to players sorted by SG
  let top10;
  if (globalDGRankings && globalDGRankings.length > 0) {
    top10 = globalDGRankings.map(ranking => {
      // Try to find matching player data for full stats
      const playerData = globalPlayers.find(p => p.dg_id === ranking.dg_id);
      
      if (playerData) {
        // Use full player data
        return playerData;
      } else {
        // Use ranking data with estimates
        return {
          dg_id: ranking.dg_id,
          player_name: ranking.player_name,
          country: ranking.country,
          sg_total: ranking.dg_skill_estimate,
          sg_ott: 0,
          sg_app: 0,
          sg_arg: 0,
          sg_putt: 0
        };
      }
    });
  } else {
    top10 = globalPlayers
      .filter(p => p.sg_total != null)
      .sort((a, b) => (b.sg_total || 0) - (a.sg_total || 0))
      .slice(0, 10);
  }
  
  if (!top10.length) {
    container.innerHTML = '<div class="loading-msg" style="grid-column:1/-1;">No rankings data available</div>';
    return;
  }
  
  container.innerHTML = top10.map((p, i) => {
    const style = getPlayingStyle(p);
    const flag = getFlag(p.country);
    return `
      <div class="player-card" style="animation-delay: ${i * 0.05}s">
        <div class="card-top">
          <div class="rank-badge">${i + 1}</div>
          ${flag !== '🏳️' ? `<span class="player-flag">${flag}</span>` : ''}
          <span class="style-tag" style="color: ${style.color}; border-color: ${style.color};">
            ${style.name}
          </span>
        </div>
        <div class="player-name">${p.player_name}</div>
        <div class="sg-total">
          <span class="sg-number">${formatSG(p.sg_total)}</span>
          <span class="sg-label">SG Total · 2025-26 Season</span>
        </div>
        <div class="skills-list">
          <div class="skill-row">
            <span class="skill-name">Off-the-Tee</span>
            <span class="skill-value ${(p.sg_ott || 0) >= 0 ? 'pos' : 'neg'}">${formatSG(p.sg_ott || 0)}</span>
          </div>
          <div class="skill-row">
            <span class="skill-name">Approach</span>
            <span class="skill-value ${(p.sg_app || 0) >= 0 ? 'pos' : 'neg'}">${formatSG(p.sg_app || 0)}</span>
          </div>
          <div class="skill-row">
            <span class="skill-name">Around Green</span>
            <span class="skill-value ${(p.sg_arg || 0) >= 0 ? 'pos' : 'neg'}">${formatSG(p.sg_arg || 0)}</span>
          </div>
          <div class="skill-row">
            <span class="skill-name">Putting</span>
            <span class="skill-value ${(p.sg_putt || 0) >= 0 ? 'pos' : 'neg'}">${formatSG(p.sg_putt || 0)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderPredictions() {
  const container = document.getElementById('predictions-table');
  if (!container) return;
  
  const eventName = globalTournamentInfo.event_name || 'Current Tournament';
  const isLive = (globalTournamentInfo.current_round || 0) > 0;
  
  const preds = globalPredictions.slice(0, 20);
  if (!preds.length) {
    container.innerHTML = '<div class="loading-msg">No predictions available</div>';
    return;
  }
  
  container.innerHTML = `
    <div style="margin-bottom: 20px; font-size: 13px; color: rgba(250,250,250,0.45); text-align: center;">
      ${isLive ? '🔴 Live Predictions' : 'Pre-Tournament Predictions'} · ${eventName}
    </div>
    
    <div class="table-wrapper">
      <table class="pred-table">
        <thead>
          <tr>
            <th class="rank-col">Rank</th>
            <th>Player</th>
            <th class="prob-col">Win %</th>
            <th class="prob-col">Top 5 %</th>
            <th class="prob-col">Top 10 %</th>
            <th class="prob-col">Top 20 %</th>
            <th class="prob-col">Make Cut %</th>
          </tr>
        </thead>
        <tbody>
          ${preds.map((p, i) => {
            const winPct = ((p.win || 0) * 100).toFixed(1);
            const top5Pct = ((p.top_5 || 0) * 100).toFixed(1);
            const top10Pct = ((p.top_10 || 0) * 100).toFixed(1);
            const top20Pct = ((p.top_20 || 0) * 100).toFixed(1);
            const cutPct = ((p.make_cut || 0) * 100).toFixed(1);
            
            return `
              <tr>
                <td class="rank-col">${i + 1}</td>
                <td class="player-col">${p.player_name}</td>
                <td class="prob-col win">${winPct}%</td>
                <td class="prob-col">${top5Pct}%</td>
                <td class="prob-col">${top10Pct}%</td>
                <td class="prob-col">${top20Pct}%</td>
                <td class="prob-col">${cutPct}%</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderCharts() {
  renderSkillsRadar();
  renderScatterPlot();
  renderConsistencyChart();
  renderSGBreakdown();
}

// ============================================
// CHART RENDERERS
// ============================================
function renderSkillsRadar() {
  const canvas = document.getElementById('skills-radar');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  
  const top5 = globalPlayers
    .filter(p => p.sg_total != null)
    .sort((a, b) => (b.sg_total || 0) - (a.sg_total || 0))
    .slice(0, 5);
  
  if (!top5.length) return;
  
  const datasets = top5.map((p, i) => {
    const colors = ['#5BBF85', '#5A8FA8', '#E76F51', '#DDA15E', '#B392AC'];
    
    // Truncate long names
    let displayName = p.player_name;
    if (displayName.length > 18) {
      displayName = displayName.substring(0, 17) + '.';
    }
    
    return {
      label: displayName,
      data: [
        p.sg_ott || 0,
        p.sg_app || 0,
        p.sg_arg || 0,
        p.sg_putt || 0
      ],
      borderColor: colors[i],
      backgroundColor: colors[i] + '20',
      borderWidth: 2,
      pointBackgroundColor: colors[i],
      pointBorderColor: '#fff',
      pointBorderWidth: 1
    };
  });
  
  new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['Off-the-Tee', 'Approach', 'Around Green', 'Putting'],
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        r: {
          beginAtZero: true,
          max: 2.5,
          ticks: { 
            color: 'rgba(250,250,250,0.4)',
            backdropColor: 'transparent',
            font: { size: 10 },
            stepSize: 0.5
          },
          grid: { color: 'rgba(255,255,255,0.08)' },
          pointLabels: { 
            color: 'rgba(250,250,250,0.6)',
            font: { size: 11, weight: '500' },
            padding: 6
          }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: 'rgba(250,250,250,0.7)',
            font: { size: 11 },
            padding: 12,
            usePointStyle: true
          }
        }
      }
    }
  });
}

function renderScatterPlot() {
  const canvas = document.getElementById('scatter-plot');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  
  const top20 = globalPlayers
    .filter(p => p.sg_total != null)
    .sort((a, b) => (b.sg_total || 0) - (a.sg_total || 0))
    .slice(0, 20);
  
  if (!top20.length) return;
  
  // Group by rank: 1-3, 4-10, 11-20
  const top3 = top20.slice(0, 3).map((p, i) => ({
    x: (p.sg_putt || 0),
    y: (p.sg_ott || 0) + (p.sg_app || 0) + (p.sg_arg || 0),
    player: p.player_name,
    rank: i + 1
  }));
  
  const ranks4to10 = top20.slice(3, 10).map((p, i) => ({
    x: (p.sg_putt || 0),
    y: (p.sg_ott || 0) + (p.sg_app || 0) + (p.sg_arg || 0),
    player: p.player_name,
    rank: i + 4
  }));
  
  const ranks11to20 = top20.slice(10, 20).map((p, i) => ({
    x: (p.sg_putt || 0),
    y: (p.sg_ott || 0) + (p.sg_app || 0) + (p.sg_arg || 0),
    player: p.player_name,
    rank: i + 11
  }));
  
  new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Rank 1-3',
          data: top3,
          backgroundColor: '#5BBF85',
          borderColor: '#5BBF85',
          pointRadius: 7,
          pointHoverRadius: 9
        },
        {
          label: 'Rank 4-10',
          data: ranks4to10,
          backgroundColor: '#5A8FA8',
          borderColor: '#5A8FA8',
          pointRadius: 6,
          pointHoverRadius: 8
        },
        {
          label: 'Rank 11-20',
          data: ranks11to20,
          backgroundColor: '#808080',
          borderColor: '#808080',
          pointRadius: 5,
          pointHoverRadius: 7
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 5,
          right: 10,
          bottom: 5,
          left: 5
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'SG: Putting',
            color: 'rgba(250,250,250,0.6)',
            font: { size: 12, weight: '500' },
            padding: { top: 8 }
          },
          ticks: { color: 'rgba(250,250,250,0.5)', font: { size: 10 } },
          grid: { color: 'rgba(255,255,255,0.06)' }
        },
        y: {
          title: {
            display: true,
            text: 'SG: Tee-to-Green',
            color: 'rgba(250,250,250,0.6)',
            font: { size: 12, weight: '500' }
          },
          ticks: { color: 'rgba(250,250,250,0.5)', font: { size: 10 } },
          grid: { color: 'rgba(255,255,255,0.06)' }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'center',
          labels: {
            color: 'rgba(250,250,250,0.7)',
            font: { size: 11 },
            padding: 10,
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          enabled: true,
          backgroundColor: '#1B4D3E',
          titleColor: '#FAFAFA',
          bodyColor: '#FAFAFA',
          borderColor: '#5BBF85',
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          titleFont: { size: 13, weight: '600' },
          bodyFont: { size: 12 },
          animation: {
            duration: 200
          },
          callbacks: {
            title: function(items) {
              const fullName = items[0].raw.player;
              const parts = fullName.split(', ');
              return parts[0];
            },
            label: function(context) {
              return [
                `Rank: ${context.raw.rank}`,
                `SG: Putting: ${context.parsed.x.toFixed(2)}`,
                `SG: Tee-to-Green: ${context.parsed.y.toFixed(2)}`
              ];
            }
          }
        }
      }
    }
  });
}

function renderConsistencyChart() {
  const canvas = document.getElementById('consistency-chart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  
  const top10 = globalPlayers
    .filter(p => p.sg_total != null)
    .sort((a, b) => (b.sg_total || 0) - (a.sg_total || 0))
    .slice(0, 10);
  
  if (!top10.length) return;
  
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top10.map(p => {
        const parts = p.player_name.split(', ');
        return parts[0];
      }),
      datasets: [{
        label: 'SG Total',
        data: top10.map(p => p.sg_total || 0),
        backgroundColor: '#5A8FA8',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        x: {
          ticks: { 
            color: 'rgba(250,250,250,0.6)',
            font: { size: 11, weight: '500' }
          },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          ticks: { 
            color: 'rgba(250,250,250,0.5)',
            font: { size: 10 }
          },
          grid: { color: 'rgba(255,255,255,0.06)' }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

function renderSGBreakdown() {
  const canvas = document.getElementById('sg-breakdown');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  
  const top10 = globalPlayers
    .filter(p => p.sg_total != null)
    .sort((a, b) => (b.sg_total || 0) - (a.sg_total || 0))
    .slice(0, 10);
  
  if (!top10.length) return;
  
  const avgOTT = top10.reduce((sum, p) => sum + (p.sg_ott || 0), 0) / top10.length;
  const avgAPP = top10.reduce((sum, p) => sum + (p.sg_app || 0), 0) / top10.length;
  const avgARG = top10.reduce((sum, p) => sum + (p.sg_arg || 0), 0) / top10.length;
  const avgPUTT = top10.reduce((sum, p) => sum + (p.sg_putt || 0), 0) / top10.length;
  
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Off-the-Tee', 'Approach', 'Around Green', 'Putting'],
      datasets: [{
        label: 'Average SG',
        data: [avgOTT, avgAPP, avgARG, avgPUTT],
        backgroundColor: ['#E76F51', '#5A8FA8', '#5BBF85', '#DDA15E'],
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        x: {
          ticks: { 
            color: 'rgba(250,250,250,0.6)',
            font: { size: 11, weight: '500' }
          },
          grid: { display: false }
        },
        y: {
          min: -0.2,
          max: Math.max(avgOTT, avgAPP, avgARG, avgPUTT) * 1.2,
          ticks: { 
            color: 'rgba(250,250,250,0.5)',
            font: { size: 10 }
          },
          grid: { color: 'rgba(255,255,255,0.06)' }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

// ============================================
// ERROR HANDLING
// ============================================
function showError(message) {
  console.error('Error:', message);
}

// ============================================
// SECTION TOGGLES
// ============================================
function initSectionToggles() {
  const sections = document.querySelectorAll('.lab-section');
  sections.forEach(section => {
    const header = section.querySelector('.section-header');
    if (header) {
      header.addEventListener('click', () => {
        section.classList.toggle('collapsed');
      });
    }
  });
}

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  loadAllData();
  initSectionToggles();
  
  // Auto-refresh live predictions every hour when tournament is ongoing
  setInterval(() => {
    if (globalTournamentInfo.current_round > 0) {
      console.log('🔄 Auto-refreshing live predictions...');
      loadLivePredictions();
    }
  }, 3600000); // 1 hour = 3,600,000ms
  
  // Section nav active states with Events section
  const navLinks = document.querySelectorAll('.section-nav a');
  const eventsSection = document.getElementById('events');
  const leaderboardSection = document.getElementById('leaderboard');
  const predictionsSection = document.getElementById('predictions');
  const rankingsSection = document.getElementById('rankings');
  const analyticsSection = document.getElementById('analytics');
  
  const allSections = [eventsSection, leaderboardSection, predictionsSection, rankingsSection, analyticsSection].filter(Boolean);
  
  // Track which section is currently intersecting
  let currentSection = 'events';
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.25) {
        currentSection = entry.target.id;
        navLinks.forEach(link => {
          link.classList.toggle('active', link.getAttribute('href') === `#${currentSection}`);
        });
      }
    });
  }, { 
    threshold: [0, 0.25, 0.5, 0.75, 1],
    rootMargin: '-80px 0px -40% 0px'
  });
  
  allSections.forEach(section => observer.observe(section));
  
  // Set Events as active on load
  navLinks.forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === '#events');
  });
});

// Separate function to reload live predictions
async function loadLivePredictions() {
  try {
    const liveResponse = await fetch(`${API_BASE_URL}/api/live-tournament`);
    const liveData = await liveResponse.json();
    
    if (liveData.success && liveData.data) {
      const liveArray = liveData.data.data || liveData.data || [];
      if (liveArray.length > 0) {
        globalLeaderboard = liveArray;
        globalPredictions = liveArray;
        console.log('✓ Updated live data:', liveArray.length, 'players');
        renderLeaderboard();
        renderPredictions();
      }
    }
  } catch (err) {
    console.warn('⚠️ Could not refresh live data:', err);
  }
}