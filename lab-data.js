// The Lab v3 - Divot Lab Golf Analytics
// Updated to work with new server endpoints
const API_BASE_URL = 'https://divotlab-api.vercel.app/api';

// ============================================
// COUNTRY FLAGS
// ============================================
const countryFlags = {
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

function getFlag(countryData) {
  if (!countryData) return '';
  let flag = countryFlags[countryData] || countryFlags[countryData.toUpperCase()] || countryFlags[countryData.trim()];
  return flag || '';
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
  const num = parseFloat(value);
  // Handle both decimal (0.145) and percentage (14.5) formats
  const pct = num > 1 ? num : num * 100;
  return `${pct.toFixed(1)}%`;
}

// ============================================
// DERIVED ANALYTICS
// ============================================
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

// ============================================
// GLOBAL STATE
// ============================================
let globalPlayers = [];
let globalPredictions = [];
let globalTournamentInfo = {};

// ============================================
// MAIN LOADER - OPTIMIZED
// ============================================
async function loadAllData() {
  try {
    console.log('🏌️ Loading lab data...');
    
    // NEW: Use optimized composite endpoint for faster loading
    const labDataResponse = await fetch(`${API_BASE_URL}/lab-data`);
    const labData = await labDataResponse.json();
    
    if (labData.success && labData.data) {
      const { players, predictions, tournament } = labData.data;
      
      // Store data globally
      globalPlayers = players || [];
      globalPredictions = predictions || [];
      globalTournamentInfo = {
        event_name: tournament?.event_name || 'Upcoming Tournament',
        course: tournament?.course || '',
        field_size: tournament?.field_size || 0
      };
      
      console.log('✓ Loaded', globalPlayers.length, 'players');
      console.log('✓ Loaded', globalPredictions.length, 'predictions');
      console.log('✓ Tournament:', globalTournamentInfo.event_name);
      console.log('✓ From cache:', labData.fromCache);
      
      // Debug first player structure
      if (globalPlayers[0]) {
        console.log('📊 Sample player data:', globalPlayers[0]);
      }
    } else {
      throw new Error('Failed to load lab data');
    }
    
    // Render all sections
    renderTournamentBanner();
    renderFieldStrength();
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
  
  const hasData = globalTournamentInfo.event_name && globalTournamentInfo.event_name !== 'Upcoming Tournament';
  
  if (!hasData) {
    container.innerHTML = `
      <div class="banner-inner">
        <div class="banner-label">Off Week</div>
        <h2 class="banner-title">No Tournament This Week</h2>
        <div class="banner-course">Check back soon for next week's data</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = `
    <div class="banner-inner">
      <div class="banner-label">This Week</div>
      <h2 class="banner-title">${globalTournamentInfo.event_name}</h2>
      ${globalTournamentInfo.course ? `<div class="banner-course">${globalTournamentInfo.course}</div>` : ''}
    </div>
  `;
}

function renderFieldStrength() {
  const container = document.getElementById('field-strength');
  if (!container) return;
  
  const field = calculateFieldStrength(globalPlayers);
  const pct = (parseFloat(field.rating) / 10) * 100;
  
  container.innerHTML = `
    <div class="strength-card">
      <div class="strength-header">
        <span class="strength-label">Field Strength</span>
        <span class="strength-value">${field.rating}<span class="strength-max">/10</span></span>
      </div>
      <div class="strength-bar"><div class="strength-fill" style="width: ${pct}%"></div></div>
      <div class="strength-rating">${field.label}</div>
      <div class="strength-details">
        <div class="strength-stat"><span class="stat-num">${field.eliteCount}</span><span class="stat-text">Elite (SG 1.5+)</span></div>
        <div class="strength-stat"><span class="stat-num">${field.topTier}</span><span class="stat-text">Top Tier (SG 1.0+)</span></div>
      </div>
    </div>
  `;
}

function renderTop10() {
  const container = document.getElementById('top10-grid');
  if (!container) return;
  
  const top10 = globalPlayers.slice(0, 10);
  if (!top10.length) {
    container.innerHTML = '<div class="loading-msg">No data available</div>';
    return;
  }
  
  container.innerHTML = top10.map((player, i) => {
    const flag = getFlag(player.country || '');
    const style = getPlayingStyle(player);
    
    return `
      <div class="player-card" style="animation-delay: ${i * 0.05}s">
        <div class="card-top">
          <div class="rank-badge">${i + 1}</div>
          ${flag ? `<span class="player-flag">${flag}</span>` : ''}
          <span class="style-tag" style="border-color: ${style.color}; color: ${style.color}">${style.name}</span>
        </div>
        <div class="player-name">${player.player_name || 'Unknown'}</div>
        <div class="sg-total">
          <span class="sg-number">${formatSG(player.sg_total)}</span>
          <span class="sg-label">SG Total</span>
        </div>
        <div class="skills-list">
          <div class="skill-row">
            <span class="skill-name">Off-the-Tee</span>
            <span class="skill-value ${(player.sg_ott || 0) >= 0 ? 'pos' : 'neg'}">${formatSG(player.sg_ott)}</span>
          </div>
          <div class="skill-row">
            <span class="skill-name">Approach</span>
            <span class="skill-value ${(player.sg_app || 0) >= 0 ? 'pos' : 'neg'}">${formatSG(player.sg_app)}</span>
          </div>
          <div class="skill-row">
            <span class="skill-name">Around Green</span>
            <span class="skill-value ${(player.sg_arg || 0) >= 0 ? 'pos' : 'neg'}">${formatSG(player.sg_arg)}</span>
          </div>
          <div class="skill-row">
            <span class="skill-name">Putting</span>
            <span class="skill-value ${(player.sg_putt || 0) >= 0 ? 'pos' : 'neg'}">${formatSG(player.sg_putt)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderPredictions() {
  const container = document.getElementById('predictions-table');
  if (!container) return;
  
  const preds = globalPredictions.slice(0, 20);
  if (!preds.length) {
    container.innerHTML = '<div class="loading-msg">No predictions available</div>';
    return;
  }
  
  container.innerHTML = `
    <div class="table-wrapper">
      <table class="pred-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Player</th>
            <th>Win</th>
            <th>Top 5</th>
            <th>Top 10</th>
            <th>Top 20</th>
            <th>Make Cut</th>
          </tr>
        </thead>
        <tbody>
          ${preds.map((p, i) => {
            const player = globalPlayers.find(x => x.player_name === p.player_name);
            const flag = player ? getFlag(player.country || '') : '';
            return `<tr>
              <td class="rank-col">${i + 1}</td>
              <td class="player-col">${flag ? `<span class="tbl-flag">${flag}</span>` : ''}${p.player_name}</td>
              <td class="prob-col win">${formatPercent(p.win)}</td>
              <td class="prob-col">${formatPercent(p.top_5)}</td>
              <td class="prob-col">${formatPercent(p.top_10)}</td>
              <td class="prob-col">${formatPercent(p.top_20)}</td>
              <td class="prob-col">${formatPercent(p.make_cut)}</td>
            </tr>`;
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

function renderSkillsRadar() {
  const canvas = document.getElementById('skills-radar');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = 380 * dpr; canvas.height = 360 * dpr;
  canvas.style.width = '380px'; canvas.style.height = '360px';
  ctx.scale(dpr, dpr);
  
  const w = 380, h = 360, cx = w / 2, cy = h / 2 + 15, r = 110;
  ctx.clearRect(0, 0, w, h);
  
  const cats = ['Putting', 'Approach', 'Off-Tee', 'Around Green'];
  const angles = cats.map((_, i) => (i * 2 * Math.PI) / cats.length - Math.PI / 2);
  
  // Grid
  ctx.strokeStyle = 'rgba(250,250,250,0.08)';
  [0.25, 0.5, 0.75, 1].forEach(s => { ctx.beginPath(); ctx.arc(cx, cy, r * s, 0, Math.PI * 2); ctx.stroke(); });
  ctx.strokeStyle = 'rgba(250,250,250,0.1)';
  angles.forEach(a => { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.stroke(); });
  
  // Labels
  ctx.fillStyle = 'rgba(250,250,250,0.55)'; ctx.font = '11px "DM Sans"'; ctx.textAlign = 'center';
  angles.forEach((a, i) => ctx.fillText(cats[i], cx + Math.cos(a) * (r + 16), cy + Math.sin(a) * (r + 16)));
  
  // Players
  const colors = ['#5BBF85', '#5A8FA8', '#F4A259', '#E76F51', '#9B59B6'];
  const players = globalPlayers.slice(0, 5);
  
  players.forEach((p, pi) => {
    const vals = [p.sg_putt || 0, p.sg_app || 0, p.sg_ott || 0, p.sg_arg || 0]
      .map(v => Math.min(Math.max((v + 0.5) / 2.5, 0.05), 1));
    ctx.strokeStyle = colors[pi]; ctx.fillStyle = colors[pi] + '20'; ctx.lineWidth = 2;
    ctx.beginPath();
    angles.forEach((a, i) => {
      const x = cx + Math.cos(a) * r * vals[i];
      const y = cy + Math.sin(a) * r * vals[i];
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath(); ctx.fill(); ctx.stroke();
  });
  
  // Legend
  ctx.textAlign = 'left'; ctx.font = '10px "DM Sans"';
  players.forEach((p, i) => {
    const x = 25 + i * 72;
    ctx.fillStyle = colors[i]; ctx.fillRect(x, 12, 9, 9);
    ctx.fillStyle = 'rgba(250,250,250,0.65)';
    ctx.fillText(p.player_name.split(',')[0].split(' ').slice(-1)[0], x + 13, 20);
  });
}

function renderScatterPlot() {
  const canvas = document.getElementById('scatter-plot');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = 460 * dpr; canvas.height = 340 * dpr;
  canvas.style.width = '460px'; canvas.style.height = '340px';
  ctx.scale(dpr, dpr);
  
  const w = 460, h = 340, pad = { t: 45, r: 25, b: 45, l: 55 };
  const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
  ctx.clearRect(0, 0, w, h);
  
  const players = globalPlayers.slice(0, 15);
  if (!players.length) return;
  
  const putts = players.map(p => p.sg_putt || 0);
  const t2gs = players.map(p => (p.sg_ott || 0) + (p.sg_app || 0) + (p.sg_arg || 0));
  const minP = Math.min(...putts, -0.4) - 0.1, maxP = Math.max(...putts, 0.4) + 0.1;
  const minT = Math.min(...t2gs, -0.4) - 0.15, maxT = Math.max(...t2gs, 0.4) + 0.15;
  const sx = v => pad.l + ((v - minP) / (maxP - minP)) * cw;
  const sy = v => pad.t + ch - ((v - minT) / (maxT - minT)) * ch;
  
  // Grid
  ctx.strokeStyle = 'rgba(250,250,250,0.06)';
  for (let i = -1; i <= 1; i += 0.5) {
    if (i >= minP && i <= maxP) { const x = sx(i); ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + ch); ctx.stroke(); }
  }
  for (let i = -1; i <= 3; i += 0.5) {
    if (i >= minT && i <= maxT) { const y = sy(i); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke(); }
  }
  
  // Zero lines
  ctx.strokeStyle = 'rgba(250,250,250,0.12)'; ctx.setLineDash([3, 3]);
  if (0 >= minP && 0 <= maxP) { const x = sx(0); ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + ch); ctx.stroke(); }
  if (0 >= minT && 0 <= maxT) { const y = sy(0); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke(); }
  ctx.setLineDash([]);
  
  // Points
  players.forEach((p, i) => {
    const x = sx(p.sg_putt || 0);
    const y = sy((p.sg_ott || 0) + (p.sg_app || 0) + (p.sg_arg || 0));
    ctx.fillStyle = i < 3 ? '#5BBF85' : i < 10 ? '#5A8FA8' : '#666';
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0A0A0A'; ctx.font = 'bold 8px "DM Sans"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(i + 1, x, y);
  });
  
  // Labels
  ctx.fillStyle = 'rgba(250,250,250,0.45)'; ctx.font = '11px "DM Sans"'; ctx.textAlign = 'center';
  ctx.fillText('SG: Putting', w / 2, h - 10);
  ctx.save(); ctx.translate(14, h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('SG: Tee-to-Green', 0, 0); ctx.restore();
  
  // Legend
  ctx.font = '9px "DM Sans"'; ctx.textAlign = 'left';
  [{ c: '#5BBF85', l: 'Top 3' }, { c: '#5A8FA8', l: '4-10' }, { c: '#666', l: '11-15' }].forEach((it, i) => {
    ctx.fillStyle = it.c; ctx.beginPath(); ctx.arc(pad.l + i * 50 + 5, pad.t - 18, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(250,250,250,0.55)'; ctx.fillText(it.l, pad.l + i * 50 + 12, pad.t - 15);
  });
}

function renderConsistencyChart() {
  const canvas = document.getElementById('consistency-chart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = 460 * dpr; canvas.height = 280 * dpr;
  canvas.style.width = '460px'; canvas.style.height = '280px';
  ctx.scale(dpr, dpr);
  
  const w = 460, h = 280, pad = { t: 25, r: 15, b: 65, l: 40 };
  ctx.clearRect(0, 0, w, h);
  
  const players = globalPlayers.slice(0, 10);
  if (!players.length) return;
  
  const maxSG = Math.max(...players.map(p => p.sg_total || 0));
  const bw = (w - pad.l - pad.r) / players.length - 5;
  const ch = h - pad.t - pad.b;
  
  players.forEach((p, i) => {
    const v = p.sg_total || 0, bh = (v / maxSG) * ch;
    const x = pad.l + i * (bw + 5) + 2, y = pad.t + ch - bh;
    
    const g = ctx.createLinearGradient(x, y, x, pad.t + ch);
    g.addColorStop(0, '#5BBF85'); g.addColorStop(1, '#5BBF8545');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(x, y, bw, bh, [3, 3, 0, 0]); ctx.fill();
    
    ctx.fillStyle = 'rgba(250,250,250,0.8)'; ctx.font = 'bold 9px "DM Sans"'; ctx.textAlign = 'center';
    ctx.fillText(formatSG(v), x + bw / 2, y - 5);
    
    ctx.save(); ctx.translate(x + bw / 2, h - pad.b + 6); ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = 'rgba(250,250,250,0.45)'; ctx.font = '9px "DM Sans"'; ctx.textAlign = 'right';
    ctx.fillText(p.player_name.split(',')[0], 0, 0); ctx.restore();
  });
}

function renderSGBreakdown() {
  const canvas = document.getElementById('sg-breakdown');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = 460 * dpr; canvas.height = 280 * dpr;
  canvas.style.width = '460px'; canvas.style.height = '280px';
  ctx.scale(dpr, dpr);
  
  const w = 460, h = 280, pad = { t: 30, r: 100, b: 40, l: 40 };
  ctx.clearRect(0, 0, w, h);
  
  const players = globalPlayers.slice(0, 10);
  if (!players.length) return;
  
  // Calculate averages for each SG category
  const avgOTT = players.reduce((sum, p) => sum + (p.sg_ott || 0), 0) / players.length;
  const avgAPP = players.reduce((sum, p) => sum + (p.sg_app || 0), 0) / players.length;
  const avgARG = players.reduce((sum, p) => sum + (p.sg_arg || 0), 0) / players.length;
  const avgPUTT = players.reduce((sum, p) => sum + (p.sg_putt || 0), 0) / players.length;
  
  const categories = [
    { label: 'Off-the-Tee', value: avgOTT, color: '#E76F51' },
    { label: 'Approach', value: avgAPP, color: '#5A8FA8' },
    { label: 'Around Green', value: avgARG, color: '#F4A259' },
    { label: 'Putting', value: avgPUTT, color: '#9B59B6' }
  ];
  
  const maxVal = Math.max(...categories.map(c => Math.abs(c.value)));
  const bw = (w - pad.l - pad.r) / categories.length - 10;
  const ch = h - pad.t - pad.b;
  const zeroY = pad.t + ch / 2;
  
  categories.forEach((cat, i) => {
    const bh = Math.abs(cat.value / maxVal) * (ch / 2);
    const x = pad.l + i * (bw + 10) + 5;
    const y = cat.value >= 0 ? zeroY - bh : zeroY;
    
    ctx.fillStyle = cat.color;
    ctx.beginPath();
    ctx.roundRect(x, y, bw, bh, [3, 3, 3, 3]);
    ctx.fill();
    
    // Value label
    ctx.fillStyle = 'rgba(250,250,250,0.9)';
    ctx.font = 'bold 10px "DM Sans"';
    ctx.textAlign = 'center';
    ctx.fillText(formatSG(cat.value), x + bw / 2, cat.value >= 0 ? y - 6 : y + bh + 14);
    
    // Category label
    ctx.fillStyle = 'rgba(250,250,250,0.55)';
    ctx.font = '10px "DM Sans"';
    ctx.fillText(cat.label, x + bw / 2, h - pad.b + 20);
  });
  
  // Zero line
  ctx.strokeStyle = 'rgba(250,250,250,0.2)';
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(pad.l, zeroY);
  ctx.lineTo(w - pad.r, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);
}

// ============================================
// ERROR HANDLING
// ============================================
function showError(message) {
  const sections = ['top10-grid', 'predictions-table', 'field-strength'];
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<div class="loading-msg">${message}</div>`;
  });
}

// ============================================
// INIT
// ============================================
function initCollapsibles() {
  document.querySelectorAll('.section-header').forEach(h => {
    h.addEventListener('click', () => h.closest('.lab-section').classList.toggle('collapsed'));
  });
  document.querySelectorAll('.section-toggle').forEach(t => {
    t.addEventListener('click', e => {
      e.stopPropagation();
      t.closest('.lab-section').classList.toggle('collapsed');
    });
  });
}

function initScrollSpy() {
  const secs = document.querySelectorAll('.lab-section');
  const links = document.querySelectorAll('.section-nav a');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const id = e.target.id;
        links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === `#${id}`));
      }
    });
  }, { threshold: 0.3 });
  
  secs.forEach(sec => observer.observe(sec));
}

document.addEventListener('DOMContentLoaded', () => {
  loadAllData();
  initCollapsibles();
  initScrollSpy();
});