// The Lab - Live Data Integration
const API_BASE_URL = 'https://divotlab-api.vercel.app/api';

// Country code to emoji flag mapping
const countryFlags = {
  'USA': '🇺🇸', 'United States': '🇺🇸',
  'ESP': '🇪🇸', 'Spain': '🇪🇸',
  'GBR': '🇬🇧', 'England': '🇬🇧', 'United Kingdom': '🇬🇧', 'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'Wales': '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
  'IRL': '🇮🇪', 'Ireland': '🇮🇪',
  'ZAF': '🇿🇦', 'South Africa': '🇿🇦',
  'AUS': '🇦🇺', 'Australia': '🇦🇺',
  'CAN': '🇨🇦', 'Canada': '🇨🇦',
  'MEX': '🇲🇽', 'Mexico': '🇲🇽',
  'JPN': '🇯🇵', 'Japan': '🇯🇵',
  'KOR': '🇰🇷', 'South Korea': '🇰🇷',
  'SWE': '🇸🇪', 'Sweden': '🇸🇪',
  'NOR': '🇳🇴', 'Norway': '🇳🇴',
  'DEN': '🇩🇰', 'Denmark': '🇩🇰',
  'GER': '🇩🇪', 'Germany': '🇩🇪',
  'FRA': '🇫🇷', 'France': '🇫🇷',
  'ITA': '🇮🇹', 'Italy': '🇮🇹',
  'ARG': '🇦🇷', 'Argentina': '🇦🇷',
  'COL': '🇨🇴', 'Colombia': '🇨🇴',
  'CHL': '🇨🇱', 'Chile': '🇨🇱',
  'NZL': '🇳🇿', 'New Zealand': '🇳🇿',
  'IND': '🇮🇳', 'India': '🇮🇳',
  'THA': '🇹🇭', 'Thailand': '🇹🇭',
  'CHN': '🇨🇳', 'China': '🇨🇳',
  'TPE': '🇹🇼', 'Taiwan': '🇹🇼',
  'BEL': '🇧🇪', 'Belgium': '🇧🇪',
  'AUT': '🇦🇹', 'Austria': '🇦🇹',
  'FIN': '🇫🇮', 'Finland': '🇫🇮',
  'NED': '🇳🇱', 'Netherlands': '🇳🇱',
};

function getFlag(country) {
  if (!country) return '🌍';
  return countryFlags[country] || countryFlags[country.toUpperCase()] || '🌍';
}

function formatSG(value) {
  if (!value && value !== 0) return '--';
  return value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}

function formatPercent(value) {
  if (!value && value !== 0) return '--';
  return `${(value * 100).toFixed(1)}%`;
}

// Load Top 10 Rankings
async function loadTop10() {
  try {
    console.log('📊 Loading Top 10 rankings...');
    
    const response = await fetch(`${API_BASE_URL}/skill-ratings`);
    const data = await response.json();
    
    if (!data.success || !data.data.players) {
      throw new Error('Failed to load rankings');
    }
    
    const top10 = data.data.players.slice(0, 10);
    
    // Render player cards
    const container = document.getElementById('top10-grid');
    if (!container) return;
    
    container.innerHTML = top10.map((player, index) => {
      const flag = getFlag(player.country);
      const rank = index + 1;
      
      return `
        <div class="player-card-new">
          <div class="player-rank-badge">#${rank}</div>
          <div class="player-flag">${flag}</div>
          <div class="player-name">${player.player_name}</div>
          <div class="player-sg-total">${formatSG(player.sg_total)}</div>
          <div class="player-sg-label">SG Total</div>
          <div class="player-skills">
            <div class="skill-bar">
              <div class="skill-label">Putting</div>
              <div class="skill-value">${formatSG(player.sg_putt)}</div>
            </div>
            <div class="skill-bar">
              <div class="skill-label">Approach</div>
              <div class="skill-value">${formatSG(player.sg_app)}</div>
            </div>
            <div class="skill-bar">
              <div class="skill-label">Off-Tee</div>
              <div class="skill-value">${formatSG(player.sg_ott)}</div>
            </div>
            <div class="skill-bar">
              <div class="skill-label">Around Green</div>
              <div class="skill-value">${formatSG(player.sg_arg)}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    console.log('✓ Top 10 loaded');
    
    // Load predictions for these players
    loadPredictions(top10);
    
    // Generate charts
    generateSkillsRadar(top10.slice(0, 5));
    generateScatterPlot(top10);
    generateConsistencyChart(top10);
    
  } catch (error) {
    console.error('Error loading Top 10:', error);
  }
}

// Load Tournament Predictions
async function loadPredictions(players) {
  try {
    console.log('📊 Loading tournament predictions...');
    
    const response = await fetch(`${API_BASE_URL}/pre-tournament`);
    const data = await response.json();
    
    if (!data.success) {
      console.log('No tournament predictions available');
      return;
    }
    
    const predictions = data.data.predictions || [];
    
    // Display tournament info
    const tournamentName = data.data.event_name || 'Upcoming Tournament';
    const tournamentEl = document.getElementById('tournament-name');
    if (tournamentEl) {
      tournamentEl.textContent = tournamentName;
    }
    
    // Render predictions table
    const container = document.getElementById('predictions-table');
    if (!container) return;
    
    const top20Predictions = predictions.slice(0, 20);
    
    container.innerHTML = `
      <table class="predictions-grid">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Player</th>
            <th>Win %</th>
            <th>Top 5 %</th>
            <th>Top 10 %</th>
            <th>Make Cut %</th>
          </tr>
        </thead>
        <tbody>
          ${top20Predictions.map((pred, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td>${pred.player_name}</td>
              <td>${formatPercent(pred.win_prob)}</td>
              <td>${formatPercent(pred.top_5_prob)}</td>
              <td>${formatPercent(pred.top_10_prob)}</td>
              <td>${formatPercent(pred.make_cut_prob)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    
    console.log('✓ Predictions loaded');
    
  } catch (error) {
    console.error('Error loading predictions:', error);
  }
}

// Generate Skills Comparison Radar Chart
function generateSkillsRadar(players) {
  const canvas = document.getElementById('skills-radar');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const width = canvas.width = 400;
  const height = canvas.height = 400;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = 150;
  
  // Clear canvas
  ctx.clearRect(0, 0, width, height);
  
  // Categories
  const categories = ['Putting', 'Approach', 'Off-Tee', 'Around Green', 'Total'];
  const angles = categories.map((_, i) => (i * 2 * Math.PI) / categories.length - Math.PI / 2);
  
  // Draw grid
  ctx.strokeStyle = 'rgba(250,250,250,0.1)';
  ctx.lineWidth = 1;
  
  [0.25, 0.5, 0.75, 1].forEach(scale => {
    ctx.beginPath();
    angles.forEach((angle, i) => {
      const x = centerX + Math.cos(angle) * radius * scale;
      const y = centerY + Math.sin(angle) * radius * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  });
  
  // Draw axes
  angles.forEach(angle => {
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
    ctx.stroke();
  });
  
  // Draw labels
  ctx.fillStyle = '#FAFAFA';
  ctx.font = '11px DM Sans';
  ctx.textAlign = 'center';
  angles.forEach((angle, i) => {
    const x = centerX + Math.cos(angle) * (radius + 20);
    const y = centerY + Math.sin(angle) * (radius + 20);
    ctx.fillText(categories[i], x, y);
  });
  
  // Draw player data
  const colors = ['#5BBF85', '#5A8FA8', '#F4A259', '#E76F51', '#2A9D8F'];
  
  players.forEach((player, playerIdx) => {
    const values = [
      player.sg_putt,
      player.sg_app,
      player.sg_ott,
      player.sg_arg,
      player.sg_total
    ];
    
    // Normalize values (max 3.0 SG)
    const normalized = values.map(v => Math.min(Math.max(v, 0), 3) / 3);
    
    ctx.strokeStyle = colors[playerIdx];
    ctx.fillStyle = colors[playerIdx] + '20';
    ctx.lineWidth = 2;
    
    ctx.beginPath();
    angles.forEach((angle, i) => {
      const value = normalized[i];
      const x = centerX + Math.cos(angle) * radius * value;
      const y = centerY + Math.sin(angle) * radius * value;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
  
  // Legend
  ctx.textAlign = 'left';
  ctx.font = '10px DM Sans';
  players.forEach((player, idx) => {
    const y = 20 + idx * 15;
    ctx.fillStyle = colors[idx];
    ctx.fillRect(10, y - 8, 10, 10);
    ctx.fillStyle = '#FAFAFA';
    ctx.fillText(player.player_name.split(',')[0], 25, y);
  });
}

// Generate Putting vs Tee-to-Green Scatter Plot
function generateScatterPlot(players) {
  const canvas = document.getElementById('scatter-plot');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const width = canvas.width = 500;
  const height = canvas.height = 400;
  const padding = 50;
  
  ctx.clearRect(0, 0, width, height);
  
  // Calculate ranges
  const puttValues = players.map(p => p.sg_putt);
  const t2gValues = players.map(p => (p.sg_ott + p.sg_app + p.sg_arg));
  
  const minPutt = Math.min(...puttValues) - 0.2;
  const maxPutt = Math.max(...puttValues) + 0.2;
  const minT2G = Math.min(...t2gValues) - 0.2;
  const maxT2G = Math.max(...t2gValues) + 0.2;
  
  // Draw axes
  ctx.strokeStyle = 'rgba(250,250,250,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.moveTo(padding, height - padding);
  ctx.lineTo(padding, padding);
  ctx.stroke();
  
  // Draw zero lines
  ctx.strokeStyle = 'rgba(250,250,250,0.1)';
  ctx.setLineDash([5, 5]);
  const zeroX = padding + ((0 - minPutt) / (maxPutt - minPutt)) * (width - 2 * padding);
  const zeroY = height - padding - ((0 - minT2G) / (maxT2G - minT2G)) * (height - 2 * padding);
  ctx.beginPath();
  ctx.moveTo(zeroX, padding);
  ctx.lineTo(zeroX, height - padding);
  ctx.moveTo(padding, zeroY);
  ctx.lineTo(width - padding, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Plot points
  players.forEach((player, idx) => {
    const x = padding + ((player.sg_putt - minPutt) / (maxPutt - minPutt)) * (width - 2 * padding);
    const t2g = player.sg_ott + player.sg_app + player.sg_arg;
    const y = height - padding - ((t2g - minT2G) / (maxT2G - minT2G)) * (height - 2 * padding);
    
    ctx.fillStyle = idx < 3 ? '#5BBF85' : '#5A8FA8';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  });
  
  // Labels
  ctx.fillStyle = '#FAFAFA';
  ctx.font = '12px DM Sans';
  ctx.textAlign = 'center';
  ctx.fillText('SG: Putting', width / 2, height - 10);
  ctx.save();
  ctx.translate(15, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('SG: Tee-to-Green', 0, 0);
  ctx.restore();
}

// Generate Consistency Chart
function generateConsistencyChart(players) {
  const canvas = document.getElementById('consistency-chart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const width = canvas.width = 500;
  const height = canvas.height = 300;
  
  ctx.clearRect(0, 0, width, height);
  
  // For now, use sg_total as proxy for consistency (in real version, calculate std dev)
  const barWidth = (width - 100) / players.length;
  const maxSG = Math.max(...players.map(p => Math.abs(p.sg_total)));
  
  players.forEach((player, idx) => {
    const barHeight = (Math.abs(player.sg_total) / maxSG) * (height - 80);
    const x = 50 + idx * barWidth;
    const y = height - 50 - barHeight;
    
    ctx.fillStyle = '#5BBF85';
    ctx.fillRect(x, y, barWidth - 10, barHeight);
    
    // Player initials
    ctx.fillStyle = '#FAFAFA';
    ctx.font = '9px DM Sans';
    ctx.textAlign = 'center';
    const initials = player.player_name.split(',')[0].split(' ').map(n => n[0]).join('');
    ctx.fillText(initials, x + barWidth / 2 - 5, height - 30);
  });
  
  // Title
  ctx.font = '12px DM Sans';
  ctx.fillText('Player Consistency (SG Total)', width / 2, 20);
}

// Scroll spy navigation
function initScrollSpy() {
  const sections = document.querySelectorAll('.lab-section');
  const navLinks = document.querySelectorAll('.section-nav a');
  
  window.addEventListener('scroll', () => {
    let current = '';
    
    sections.forEach(section => {
      const sectionTop = section.offsetTop;
      const sectionHeight = section.clientHeight;
      if (window.pageYOffset >= sectionTop - 100) {
        current = section.getAttribute('id');
      }
    });
    
    navLinks.forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('href') === `#${current}`) {
        link.classList.add('active');
      }
    });
  });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadTop10();
  initScrollSpy();
  
  // Collapsible sections
  document.querySelectorAll('.section-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const section = toggle.closest('.lab-section');
      section.classList.toggle('collapsed');
    });
  });
});
