// The Lab v2 - Complete Redesign with Derived Analytics
// Divot Lab - Golf Analytics Platform
const API_BASE_URL = 'https://divotlab-api.vercel.app/api';

// ============================================
// COUNTRY FLAGS - Comprehensive Mapping
// ============================================
const countryFlags = {
  // 3-letter codes
  'USA': '🇺🇸', 'ESP': '🇪🇸', 'GBR': '🇬🇧', 'ENG': '🇬🇧', 'SCO': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 
  'WAL': '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'NIR': '🇬🇧', 'IRL': '🇮🇪', 'ZAF': '🇿🇦', 'RSA': '🇿🇦',
  'AUS': '🇦🇺', 'CAN': '🇨🇦', 'MEX': '🇲🇽', 'JPN': '🇯🇵', 'KOR': '🇰🇷',
  'SWE': '🇸🇪', 'NOR': '🇳🇴', 'DEN': '🇩🇰', 'DNK': '🇩🇰', 'GER': '🇩🇪', 'DEU': '🇩🇪',
  'FRA': '🇫🇷', 'ITA': '🇮🇹', 'ARG': '🇦🇷', 'COL': '🇨🇴', 'CHL': '🇨🇱',
  'NZL': '🇳🇿', 'IND': '🇮🇳', 'THA': '🇹🇭', 'CHN': '🇨🇳', 'TPE': '🇹🇼',
  'BEL': '🇧🇪', 'AUT': '🇦🇹', 'FIN': '🇫🇮', 'NED': '🇳🇱', 'NLD': '🇳🇱',
  'PUR': '🇵🇷', 'VEN': '🇻🇪', 'PHI': '🇵🇭', 'PHL': '🇵🇭', 'FIJ': '🇫🇯',
  'PAR': '🇵🇾', 'PER': '🇵🇪', 'POL': '🇵🇱', 'POR': '🇵🇹', 'PRT': '🇵🇹',
  'BRA': '🇧🇷', 'SUI': '🇨🇭', 'CHE': '🇨🇭', 'SIN': '🇸🇬', 'SGP': '🇸🇬',
  'MAS': '🇲🇾', 'MYS': '🇲🇾', 'HKG': '🇭🇰', 'ZIM': '🇿🇼',
  // Full names
  'United States': '🇺🇸', 'Spain': '🇪🇸', 'England': '🇬🇧', 'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'Wales': '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'Ireland': '🇮🇪', 'Northern Ireland': '🇬🇧',
  'South Africa': '🇿🇦', 'Australia': '🇦🇺', 'Canada': '🇨🇦', 'Mexico': '🇲🇽',
  'Japan': '🇯🇵', 'South Korea': '🇰🇷', 'Korea': '🇰🇷', 'Sweden': '🇸🇪',
  'Norway': '🇳🇴', 'Denmark': '🇩🇰', 'Germany': '🇩🇪', 'France': '🇫🇷',
  'Italy': '🇮🇹', 'Argentina': '🇦🇷', 'Colombia': '🇨🇴', 'Chile': '🇨🇱',
  'New Zealand': '🇳🇿', 'India': '🇮🇳', 'Thailand': '🇹🇭', 'China': '🇨🇳',
  'Taiwan': '🇹🇼', 'Belgium': '🇧🇪', 'Austria': '🇦🇹', 'Finland': '🇫🇮',
  'Netherlands': '🇳🇱', 'Puerto Rico': '🇵🇷', 'Venezuela': '🇻🇪',
  'Philippines': '🇵🇭', 'Brazil': '🇧🇷', 'Switzerland': '🇨🇭',
  'Singapore': '🇸🇬', 'Malaysia': '🇲🇾', 'Hong Kong': '🇭🇰', 'Zimbabwe': '🇿🇼'
};

function getFlag(country) {
  if (!country) return '🌍';
  // Try exact match first
  if (countryFlags[country]) return countryFlags[country];
  // Try uppercase
  if (countryFlags[country.toUpperCase()]) return countryFlags[country.toUpperCase()];
  // Try trimmed
  const trimmed = country.trim();
  if (countryFlags[trimmed]) return countryFlags[trimmed];
  return '🌍';
}

// ============================================
// FORMATTERS
// ============================================
function formatSG(value) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  const num = parseFloat(value);
  return num > 0 ? `+${num.toFixed(2)}` : num.toFixed(2);
}

function formatPercent(value) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return `${(parseFloat(value) * 100).toFixed(1)}%`;
}

function formatMoney(value) {
  if (!value) return '—';
  return '$' + value.toLocaleString();
}

// ============================================
// DERIVED ANALYTICS CALCULATIONS
// ============================================

// 1. Playing Style Classification
function getPlayingStyle(player) {
  const putting = player.sg_putt || 0;
  const approach = player.sg_app || 0;
  const offTee = player.sg_ott || 0;
  const aroundGreen = player.sg_arg || 0;
  
  const ballStriking = offTee + approach;
  const shortGame = putting + aroundGreen;
  
  // Determine primary strength
  const categories = [
    { name: 'Power', value: offTee, icon: '💪', color: '#E76F51' },
    { name: 'Precision', value: approach, icon: '🎯', color: '#5A8FA8' },
    { name: 'Touch', value: putting, icon: '🎱', color: '#9B59B6' },
    { name: 'Scrambler', value: aroundGreen, icon: '⛳', color: '#F4A259' }
  ];
  
  const sorted = [...categories].sort((a, b) => b.value - a.value);
  const primary = sorted[0];
  
  // Check if balanced (all categories within 0.3 of each other)
  const max = Math.max(offTee, approach, putting, aroundGreen);
  const min = Math.min(offTee, approach, putting, aroundGreen);
  const isBalanced = (max - min) < 0.4;
  
  if (isBalanced && player.sg_total > 1.0) {
    return { name: 'Complete', icon: '🏆', color: '#5BBF85', description: 'Elite in all areas' };
  }
  
  return { 
    name: primary.name, 
    icon: primary.icon, 
    color: primary.color,
    description: `Strong ${primary.name.toLowerCase()} game`
  };
}

// 2. Tee-to-Green Efficiency
function getT2GEfficiency(player) {
  const t2g = (player.sg_ott || 0) + (player.sg_app || 0) + (player.sg_arg || 0);
  const putting = player.sg_putt || 0;
  const total = Math.abs(t2g) + Math.abs(putting);
  
  if (total === 0) return { t2g: 50, putting: 50 };
  
  const t2gPct = Math.round((Math.abs(t2g) / total) * 100);
  const puttPct = 100 - t2gPct;
  
  return { t2g: t2gPct, putting: puttPct, t2gValue: t2g, puttValue: putting };
}

// 3. Skill Balance Score (0-100, 100 = perfectly balanced)
function getSkillBalance(player) {
  const skills = [
    player.sg_putt || 0,
    player.sg_app || 0,
    player.sg_ott || 0,
    player.sg_arg || 0
  ];
  
  const avg = skills.reduce((a, b) => a + b, 0) / skills.length;
  const variance = skills.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / skills.length;
  const stdDev = Math.sqrt(variance);
  
  // Lower std dev = more balanced. Max expected ~1.5
  const balance = Math.max(0, Math.min(100, 100 - (stdDev * 50)));
  
  return Math.round(balance);
}

// 4. Course Fit (placeholder - uses baseline_history_fit from predictions if available)
function getCourseFit(prediction) {
  if (prediction && prediction.baseline_history_fit !== undefined) {
    return prediction.baseline_history_fit;
  }
  return null;
}

// 5. Field Strength Rating (1-10 scale)
function calculateFieldStrength(players) {
  if (!players || players.length === 0) return 5;
  
  // Count elite players (SG Total > 1.5)
  const eliteCount = players.filter(p => (p.sg_total || 0) > 1.5).length;
  // Count top-tier (SG Total > 1.0)
  const topTier = players.filter(p => (p.sg_total || 0) > 1.0).length;
  // Average SG of top 20
  const top20Avg = players.slice(0, 20).reduce((sum, p) => sum + (p.sg_total || 0), 0) / 20;
  
  // Calculate rating (weighted formula)
  let rating = 5; // Base
  rating += eliteCount * 0.3;  // Each elite player adds 0.3
  rating += topTier * 0.1;     // Each top-tier adds 0.1
  rating += top20Avg * 0.5;    // Top 20 average contribution
  
  return Math.min(10, Math.max(1, rating)).toFixed(1);
}

// 6. Cut Line Predictor (based on field strength and historical data)
function predictCutLine(fieldStrength) {
  // Stronger field = lower cut line
  // Base cut around -1 (even par to -2)
  const baseCut = -1;
  const adjustment = (parseFloat(fieldStrength) - 5) * -0.3;
  const predictedCut = baseCut + adjustment;
  
  return {
    strokes: Math.round(predictedCut),
    confidence: fieldStrength > 7 ? 'High' : fieldStrength > 5 ? 'Medium' : 'Low'
  };
}

// ============================================
// GLOBAL STATE
// ============================================
let globalPlayers = [];
let globalPredictions = [];
let globalTournamentInfo = {};

// ============================================
// MAIN DATA LOADERS
// ============================================

async function loadAllData() {
  try {
    console.log('📊 Loading all data...');
    
    // Load skill ratings (for rankings)
    const skillsResponse = await fetch(`${API_BASE_URL}/skill-ratings`);
    const skillsData = await skillsResponse.json();
    
    if (skillsData.success && skillsData.data.players) {
      globalPlayers = skillsData.data.players;
      console.log(`✓ Loaded ${globalPlayers.length} players`);
    }
    
    // Load tournament predictions
    const predsResponse = await fetch(`${API_BASE_URL}/pre-tournament`);
    const predsData = await predsResponse.json();
    
    if (predsData.success) {
      globalPredictions = predsData.data.predictions || [];
      globalTournamentInfo = {
        event_name: predsData.data.event_name || 'Upcoming Tournament',
        course: predsData.data.course || '',
        purse: predsData.data.purse || null,
        start_date: predsData.data.start_date || null,
        field_size: globalPredictions.length
      };
      console.log(`✓ Loaded ${globalPredictions.length} predictions`);
    }
    
    // Render everything
    renderTournamentBanner();
    renderTournamentInsights();
    renderTop10();
    renderPredictions();
    renderCharts();
    
  } catch (error) {
    console.error('Error loading data:', error);
    document.getElementById('tournament-banner').innerHTML = `
      <div style="color: rgba(250,250,250,0.5); text-align: center; padding: 20px;">
        Unable to load tournament data. Please refresh.
      </div>
    `;
  }
}

// ============================================
// RENDER: Tournament Banner
// ============================================
function renderTournamentBanner() {
  const container = document.getElementById('tournament-banner');
  if (!container) return;
  
  const info = globalTournamentInfo;
  
  container.innerHTML = `
    <div class="tournament-banner-inner">
      <div class="tournament-main">
        <div class="tournament-label">This Week</div>
        <h2 class="tournament-event">${info.event_name}</h2>
        ${info.course ? `<div class="tournament-course">📍 ${info.course}</div>` : ''}
      </div>
      <div class="tournament-stats">
        ${info.purse ? `
          <div class="tournament-stat">
            <div class="tournament-stat-value">${formatMoney(info.purse)}</div>
            <div class="tournament-stat-label">Purse</div>
          </div>
        ` : ''}
        <div class="tournament-stat">
          <div class="tournament-stat-value">${info.field_size || '—'}</div>
          <div class="tournament-stat-label">Players</div>
        </div>
        <div class="tournament-stat">
          <div class="tournament-stat-value">72</div>
          <div class="tournament-stat-label">Par</div>
        </div>
      </div>
    </div>
  `;
}

// ============================================
// RENDER: Tournament Insights (Field Strength, Cut Line, etc.)
// ============================================
function renderTournamentInsights() {
  const container = document.getElementById('tournament-insights');
  if (!container) return;
  
  const fieldStrength = calculateFieldStrength(globalPlayers);
  const cutLine = predictCutLine(fieldStrength);
  
  // Calculate additional insights
  const top10Avg = globalPlayers.slice(0, 10).reduce((sum, p) => sum + (p.sg_total || 0), 0) / 10;
  const eliteCount = globalPlayers.filter(p => (p.sg_total || 0) > 1.5).length;
  
  container.innerHTML = `
    <div class="insights-grid">
      <div class="insight-card featured">
        <div class="insight-icon">📊</div>
        <div class="insight-value">${fieldStrength}</div>
        <div class="insight-label">Field Strength</div>
        <div class="insight-scale">
          <div class="scale-bar">
            <div class="scale-fill" style="width: ${fieldStrength * 10}%"></div>
          </div>
          <div class="scale-labels">
            <span>Weak</span>
            <span>Strong</span>
          </div>
        </div>
      </div>
      
      <div class="insight-card">
        <div class="insight-icon">✂️</div>
        <div class="insight-value">${cutLine.strokes > 0 ? '+' : ''}${cutLine.strokes}</div>
        <div class="insight-label">Projected Cut</div>
        <div class="insight-note">${cutLine.confidence} confidence</div>
      </div>
      
      <div class="insight-card">
        <div class="insight-icon">⭐</div>
        <div class="insight-value">${eliteCount}</div>
        <div class="insight-label">Elite Players</div>
        <div class="insight-note">SG Total > 1.5</div>
      </div>
      
      <div class="insight-card">
        <div class="insight-icon">📈</div>
        <div class="insight-value">${formatSG(top10Avg)}</div>
        <div class="insight-label">Top 10 Avg SG</div>
        <div class="insight-note">Season rating</div>
      </div>
    </div>
  `;
}

// ============================================
// RENDER: Top 10 Rankings with Derived Analytics
// ============================================
function renderTop10() {
  const container = document.getElementById('top10-grid');
  if (!container) return;
  
  const top10 = globalPlayers.slice(0, 10);
  
  container.innerHTML = top10.map((player, index) => {
    const flag = getFlag(player.country);
    const rank = index + 1;
    const style = getPlayingStyle(player);
    const efficiency = getT2GEfficiency(player);
    const balance = getSkillBalance(player);
    
    return `
      <div class="player-card" style="animation-delay: ${index * 0.05}s">
        <div class="player-card-header">
          <div class="player-rank">${rank}</div>
          <div class="player-flag">${flag}</div>
          <div class="player-style" style="background: ${style.color}20; color: ${style.color}">
            <span class="style-icon">${style.icon}</span>
            <span class="style-name">${style.name}</span>
          </div>
        </div>
        
        <div class="player-name">${player.player_name}</div>
        
        <div class="player-sg-main">
          <span class="sg-value">${formatSG(player.sg_total)}</span>
          <span class="sg-label">SG Total</span>
        </div>
        
        <div class="player-efficiency">
          <div class="efficiency-bar">
            <div class="efficiency-t2g" style="width: ${efficiency.t2g}%">
              <span>T2G ${efficiency.t2g}%</span>
            </div>
            <div class="efficiency-putt" style="width: ${efficiency.putting}%">
              <span>Putt ${efficiency.putting}%</span>
            </div>
          </div>
        </div>
        
        <div class="player-balance">
          <div class="balance-label">
            <span>Skill Balance</span>
            <span class="balance-value">${balance}</span>
          </div>
          <div class="balance-bar">
            <div class="balance-fill" style="width: ${balance}%"></div>
          </div>
        </div>
        
        <div class="player-skills-grid">
          <div class="skill-item">
            <span class="skill-name">OTT</span>
            <span class="skill-val ${(player.sg_ott || 0) > 0 ? 'positive' : 'negative'}">${formatSG(player.sg_ott)}</span>
          </div>
          <div class="skill-item">
            <span class="skill-name">APP</span>
            <span class="skill-val ${(player.sg_app || 0) > 0 ? 'positive' : 'negative'}">${formatSG(player.sg_app)}</span>
          </div>
          <div class="skill-item">
            <span class="skill-name">ARG</span>
            <span class="skill-val ${(player.sg_arg || 0) > 0 ? 'positive' : 'negative'}">${formatSG(player.sg_arg)}</span>
          </div>
          <div class="skill-item">
            <span class="skill-name">PUTT</span>
            <span class="skill-val ${(player.sg_putt || 0) > 0 ? 'positive' : 'negative'}">${formatSG(player.sg_putt)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================
// RENDER: Predictions Table
// ============================================
function renderPredictions() {
  const container = document.getElementById('predictions-table');
  if (!container) return;
  
  const predictions = globalPredictions.slice(0, 25);
  
  if (predictions.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 60px; color: rgba(250,250,250,0.4);">
        No predictions available for this tournament yet.
      </div>
    `;
    return;
  }
  
  container.innerHTML = `
    <div class="predictions-wrapper">
      <table class="predictions-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>Win</th>
            <th>Top 5</th>
            <th>Top 10</th>
            <th>Top 20</th>
            <th>Make Cut</th>
          </tr>
        </thead>
        <tbody>
          ${predictions.map((pred, idx) => {
            const player = globalPlayers.find(p => p.player_name === pred.player_name);
            const flag = player ? getFlag(player.country) : '🌍';
            
            return `
              <tr>
                <td class="rank-cell">${idx + 1}</td>
                <td class="player-cell">
                  <span class="table-flag">${flag}</span>
                  <span>${pred.player_name}</span>
                </td>
                <td class="prob-cell win">${formatPercent(pred.win_prob)}</td>
                <td class="prob-cell">${formatPercent(pred.top_5_prob)}</td>
                <td class="prob-cell">${formatPercent(pred.top_10_prob)}</td>
                <td class="prob-cell">${formatPercent(pred.top_20_prob)}</td>
                <td class="prob-cell cut">${formatPercent(pred.make_cut_prob)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ============================================
// RENDER: Charts (Redesigned)
// ============================================
function renderCharts() {
  renderSkillsRadar();
  renderScatterPlot();
  renderConsistencyChart();
}

// Skills Radar - Centered with proper legend
function renderSkillsRadar() {
  const canvas = document.getElementById('skills-radar');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  
  // Set canvas size
  canvas.width = 420 * dpr;
  canvas.height = 420 * dpr;
  canvas.style.width = '420px';
  canvas.style.height = '420px';
  ctx.scale(dpr, dpr);
  
  const width = 420;
  const height = 420;
  const centerX = width / 2;
  const centerY = height / 2 + 15; // Shift down slightly for legend
  const radius = 130;
  
  ctx.clearRect(0, 0, width, height);
  
  const categories = ['Putting', 'Approach', 'Off-Tee', 'Around Green'];
  const angles = categories.map((_, i) => (i * 2 * Math.PI) / categories.length - Math.PI / 2);
  
  // Draw grid circles
  ctx.strokeStyle = 'rgba(250,250,250,0.08)';
  ctx.lineWidth = 1;
  [0.25, 0.5, 0.75, 1].forEach(scale => {
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * scale, 0, Math.PI * 2);
    ctx.stroke();
  });
  
  // Draw axes
  ctx.strokeStyle = 'rgba(250,250,250,0.12)';
  angles.forEach(angle => {
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
    ctx.stroke();
  });
  
  // Draw labels
  ctx.fillStyle = 'rgba(250,250,250,0.7)';
  ctx.font = '12px "DM Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  const labelOffset = 22;
  angles.forEach((angle, i) => {
    const x = centerX + Math.cos(angle) * (radius + labelOffset);
    const y = centerY + Math.sin(angle) * (radius + labelOffset);
    ctx.fillText(categories[i], x, y);
  });
  
  // Plot players
  const colors = ['#5BBF85', '#5A8FA8', '#F4A259', '#E76F51', '#9B59B6'];
  const players = globalPlayers.slice(0, 5);
  
  players.forEach((player, playerIdx) => {
    const values = [
      player.sg_putt || 0,
      player.sg_app || 0,
      player.sg_ott || 0,
      player.sg_arg || 0
    ];
    
    // Normalize (max ~2.0 for elite)
    const normalized = values.map(v => Math.min(Math.max((v + 0.5) / 2.5, 0), 1));
    
    ctx.strokeStyle = colors[playerIdx];
    ctx.fillStyle = colors[playerIdx] + '25';
    ctx.lineWidth = 2;
    
    ctx.beginPath();
    angles.forEach((angle, i) => {
      const x = centerX + Math.cos(angle) * radius * normalized[i];
      const y = centerY + Math.sin(angle) * radius * normalized[i];
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Draw points
    ctx.fillStyle = colors[playerIdx];
    angles.forEach((angle, i) => {
      const x = centerX + Math.cos(angle) * radius * normalized[i];
      const y = centerY + Math.sin(angle) * radius * normalized[i];
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  });
  
  // Legend at top
  ctx.textAlign = 'left';
  ctx.font = '11px "DM Sans", sans-serif';
  const legendY = 18;
  const legendStartX = (width - (players.length * 85)) / 2;
  
  players.forEach((player, idx) => {
    const x = legendStartX + idx * 85;
    ctx.fillStyle = colors[idx];
    ctx.fillRect(x, legendY - 5, 12, 12);
    ctx.fillStyle = 'rgba(250,250,250,0.8)';
    const name = player.player_name.split(',')[0].split(' ').slice(-1)[0]; // Last name only
    ctx.fillText(name, x + 16, legendY + 3);
  });
}

// Scatter Plot - Complete redesign with labels, quadrants, legend
function renderScatterPlot() {
  const canvas = document.getElementById('scatter-plot');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  
  canvas.width = 520 * dpr;
  canvas.height = 400 * dpr;
  canvas.style.width = '520px';
  canvas.style.height = '400px';
  ctx.scale(dpr, dpr);
  
  const width = 520;
  const height = 400;
  const padding = { top: 50, right: 30, bottom: 60, left: 70 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  ctx.clearRect(0, 0, width, height);
  
  const players = globalPlayers.slice(0, 15);
  
  // Calculate ranges
  const puttValues = players.map(p => p.sg_putt || 0);
  const t2gValues = players.map(p => (p.sg_ott || 0) + (p.sg_app || 0) + (p.sg_arg || 0));
  
  const minPutt = Math.min(...puttValues, -0.5) - 0.2;
  const maxPutt = Math.max(...puttValues, 0.5) + 0.2;
  const minT2G = Math.min(...t2gValues, -0.5) - 0.3;
  const maxT2G = Math.max(...t2gValues, 0.5) + 0.3;
  
  // Helper functions
  const scaleX = (v) => padding.left + ((v - minPutt) / (maxPutt - minPutt)) * chartWidth;
  const scaleY = (v) => padding.top + chartHeight - ((v - minT2G) / (maxT2G - minT2G)) * chartHeight;
  
  // Draw quadrant background
  const zeroX = scaleX(0);
  const zeroY = scaleY(0);
  
  // Quadrant fills
  ctx.fillStyle = 'rgba(91, 191, 133, 0.05)';
  ctx.fillRect(zeroX, padding.top, padding.left + chartWidth - zeroX, zeroY - padding.top); // Top right - best
  ctx.fillStyle = 'rgba(231, 111, 81, 0.03)';
  ctx.fillRect(padding.left, zeroY, zeroX - padding.left, padding.top + chartHeight - zeroY); // Bottom left - worst
  
  // Grid lines
  ctx.strokeStyle = 'rgba(250,250,250,0.06)';
  ctx.lineWidth = 1;
  
  // Vertical grid
  for (let i = -1; i <= 1; i += 0.5) {
    if (i >= minPutt && i <= maxPutt) {
      const x = scaleX(i);
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, padding.top + chartHeight);
      ctx.stroke();
    }
  }
  
  // Horizontal grid
  for (let i = -1; i <= 2; i += 0.5) {
    if (i >= minT2G && i <= maxT2G) {
      const y = scaleY(i);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();
    }
  }
  
  // Zero lines (more prominent)
  ctx.strokeStyle = 'rgba(250,250,250,0.2)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(zeroX, padding.top);
  ctx.lineTo(zeroX, padding.top + chartHeight);
  ctx.moveTo(padding.left, zeroY);
  ctx.lineTo(padding.left + chartWidth, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Quadrant labels
  ctx.font = '10px "DM Sans", sans-serif';
  ctx.fillStyle = 'rgba(250,250,250,0.25)';
  ctx.textAlign = 'center';
  ctx.fillText('Strong Putter', (zeroX + padding.left + chartWidth) / 2, padding.top + 15);
  ctx.fillText('Weak Putter', (padding.left + zeroX) / 2, padding.top + 15);
  
  ctx.save();
  ctx.translate(padding.left + 15, (padding.top + zeroY) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Strong Ball-Striker', 0, 0);
  ctx.restore();
  
  // Plot points with rank-based colors
  const tierColors = {
    top3: '#5BBF85',
    top10: '#5A8FA8',
    rest: '#888888'
  };
  
  players.forEach((player, idx) => {
    const putt = player.sg_putt || 0;
    const t2g = (player.sg_ott || 0) + (player.sg_app || 0) + (player.sg_arg || 0);
    const x = scaleX(putt);
    const y = scaleY(t2g);
    
    // Determine color by rank
    let color;
    if (idx < 3) color = tierColors.top3;
    else if (idx < 10) color = tierColors.top10;
    else color = tierColors.rest;
    
    // Draw point
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw rank number inside
    ctx.fillStyle = '#0A0A0A';
    ctx.font = 'bold 9px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(idx + 1, x, y);
    
    // Player name label (for top 5 only to avoid clutter)
    if (idx < 5) {
      ctx.fillStyle = 'rgba(250,250,250,0.7)';
      ctx.font = '10px "DM Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const lastName = player.player_name.split(',')[0].split(' ').slice(-1)[0];
      ctx.fillText(lastName, x + 12, y);
    }
  });
  
  // Axis labels
  ctx.fillStyle = 'rgba(250,250,250,0.6)';
  ctx.font = '12px "DM Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SG: Putting →', width / 2, height - 15);
  
  ctx.save();
  ctx.translate(20, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('SG: Tee-to-Green →', 0, 0);
  ctx.restore();
  
  // Legend
  ctx.font = '10px "DM Sans", sans-serif';
  ctx.textAlign = 'left';
  const legendItems = [
    { color: tierColors.top3, label: 'Top 3' },
    { color: tierColors.top10, label: '4-10' },
    { color: tierColors.rest, label: '11-15' }
  ];
  
  let legendX = padding.left;
  legendItems.forEach(item => {
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(legendX + 5, padding.top - 25, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(250,250,250,0.7)';
    ctx.fillText(item.label, legendX + 14, padding.top - 22);
    legendX += 60;
  });
}

// Consistency Chart - Full player names, centered
function renderConsistencyChart() {
  const canvas = document.getElementById('consistency-chart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  
  canvas.width = 520 * dpr;
  canvas.height = 320 * dpr;
  canvas.style.width = '520px';
  canvas.style.height = '320px';
  ctx.scale(dpr, dpr);
  
  const width = 520;
  const height = 320;
  const padding = { top: 40, right: 20, bottom: 80, left: 50 };
  
  ctx.clearRect(0, 0, width, height);
  
  // Use top 10 players sorted by SG Total
  const players = globalPlayers.slice(0, 10);
  const maxSG = Math.max(...players.map(p => Math.abs(p.sg_total || 0)));
  
  const barWidth = (width - padding.left - padding.right) / players.length - 8;
  const chartHeight = height - padding.top - padding.bottom;
  
  // Draw bars
  players.forEach((player, idx) => {
    const value = player.sg_total || 0;
    const barHeight = (Math.abs(value) / maxSG) * chartHeight;
    const x = padding.left + idx * (barWidth + 8) + 4;
    const y = padding.top + chartHeight - barHeight;
    
    // Gradient fill
    const gradient = ctx.createLinearGradient(x, y, x, padding.top + chartHeight);
    gradient.addColorStop(0, '#5BBF85');
    gradient.addColorStop(1, '#5BBF8540');
    ctx.fillStyle = gradient;
    
    // Rounded top bar
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barHeight, [4, 4, 0, 0]);
    ctx.fill();
    
    // Value label on top
    ctx.fillStyle = 'rgba(250,250,250,0.9)';
    ctx.font = 'bold 11px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(formatSG(value), x + barWidth / 2, y - 8);
    
    // Player name below (rotated for readability)
    ctx.save();
    ctx.translate(x + barWidth / 2, height - padding.bottom + 10);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = 'rgba(250,250,250,0.6)';
    ctx.font = '10px "DM Sans", sans-serif';
    ctx.textAlign = 'right';
    const lastName = player.player_name.split(',')[0];
    ctx.fillText(lastName, 0, 0);
    ctx.restore();
  });
  
  // Y-axis
  ctx.strokeStyle = 'rgba(250,250,250,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + chartHeight);
  ctx.stroke();
  
  // Y-axis labels
  ctx.fillStyle = 'rgba(250,250,250,0.4)';
  ctx.font = '10px "DM Sans", sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const val = (maxSG * i / 4).toFixed(1);
    const y = padding.top + chartHeight - (chartHeight * i / 4);
    ctx.fillText(`+${val}`, padding.left - 8, y + 3);
  }
}

// ============================================
// EVENT HANDLERS
// ============================================

function initCollapsibles() {
  document.querySelectorAll('.section-header').forEach(header => {
    header.addEventListener('click', (e) => {
      const section = header.closest('.lab-section');
      section.classList.toggle('collapsed');
    });
  });
  
  // Also make the toggle button clickable independently
  document.querySelectorAll('.section-toggle').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent double-toggle from header click
      const section = toggle.closest('.lab-section');
      section.classList.toggle('collapsed');
    });
  });
}

function initScrollSpy() {
  const sections = document.querySelectorAll('.lab-section');
  const navLinks = document.querySelectorAll('.section-nav a');
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navLinks.forEach(link => {
          link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
        });
      }
    });
  }, { threshold: 0.3 });
  
  sections.forEach(section => observer.observe(section));
}

// ============================================
// INITIALIZE
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  loadAllData();
  initCollapsibles();
  initScrollSpy();
});
