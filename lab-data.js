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

/**
 * Get an <img> flag element using flagcdn.com for consistent cross-platform rendering.
 * Maps DataGolf 3-letter country codes to ISO 3166-1 alpha-2 codes.
 * Returns an HTML string like: <img src="..." class="flag-img" alt="USA">
 */
function getFlagImg(country) {
  const countryToISO = {
    'USA': 'us', 'CAN': 'ca', 'MEX': 'mx', 'ENG': 'gb-eng', 'SCO': 'gb-sct', 'IRL': 'ie',
    'NIR': 'gb-nir', 'WAL': 'gb-wls', 'ESP': 'es', 'FRA': 'fr', 'GER': 'de', 'ITA': 'it',
    'SWE': 'se', 'NOR': 'no', 'DEN': 'dk', 'NED': 'nl', 'BEL': 'be', 'AUT': 'at',
    'SUI': 'ch', 'JPN': 'jp', 'KOR': 'kr', 'CHN': 'cn', 'AUS': 'au', 'NZL': 'nz',
    'RSA': 'za', 'ARG': 'ar', 'BRA': 'br', 'CHI': 'cl', 'COL': 'co', 'VEN': 've',
    'IND': 'in', 'THA': 'th', 'PHI': 'ph', 'TWN': 'tw', 'ZIM': 'zw', 'FIJ': 'fj',
    'PER': 'pe', 'CRC': 'cr', 'PAN': 'pa', 'PUR': 'pr', 'DOM': 'do',
    'FIN': 'fi', 'CZE': 'cz', 'POL': 'pl', 'HUN': 'hu', 'GRE': 'gr', 'POR': 'pt',
    'TUR': 'tr', 'ISR': 'il', 'SGP': 'sg', 'MAS': 'my', 'HKG': 'hk', 'IDN': 'id',
    'PAR': 'py', 'URU': 'uy', 'ECU': 'ec', 'BOL': 'bo', 'GUA': 'gt', 'HON': 'hn',
    'JAM': 'jm', 'TRI': 'tt', 'BAH': 'bs', 'BER': 'bm', 'BAR': 'bb',
    'NAM': 'na', 'KEN': 'ke', 'NGA': 'ng', 'GHA': 'gh', 'BOT': 'bw',
    'PAK': 'pk', 'SRI': 'lk', 'BAN': 'bd', 'NEP': 'np', 'MYA': 'mm',
    'CAM': 'kh', 'VIE': 'vn', 'LAO': 'la'
  };
  
  const iso = countryToISO[country];
  if (!iso) return '';
  
  // flagcdn.com supports both ISO alpha-2 and subdivision codes (gb-eng, gb-sct, etc.)
  const url = `https://flagcdn.com/24x18/${iso}.png`;
  const url2x = `https://flagcdn.com/48x36/${iso}.png`;
  return `<img src="${url}" srcset="${url2x} 2x" width="24" height="18" alt="${country}" class="flag-img" style="border-radius: 2px; vertical-align: middle; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">`;
}

function formatSG(val) {
  const num = parseFloat(val);
  if (isNaN(num)) return '—';
  return num >= 0 ? `+${num.toFixed(2)}` : num.toFixed(2);
}

function getEventStatus(tournament) {
  const state = getTournamentState(tournament);
  
  if (state === 'completed') {
    return { label: 'Final', sublabel: '', color: '#5A8FA8' };
  }
  
  if (state === 'live') {
    const currentRound = tournament.current_round || 0;
    return { label: 'Live', sublabel: `R${currentRound}`, color: '#E76F51' };
  }
  
  return { label: 'Upcoming', sublabel: '', color: '#5BBF85' };
}

/**
 * Tournament State Engine
 * Single source of truth for tournament lifecycle state.
 * Uses BOTH current_round AND start_date to prevent false "Live" status.
 * DataGolf can report current_round > 0 before the tournament actually starts
 * (pre-loading data), so we MUST check the date before trusting current_round.
 * Returns: 'upcoming' | 'live' | 'completed'
 */
function getTournamentState(tournament) {
  if (!tournament) return 'upcoming';
  
  // Check completed first
  if (tournament.event_completed || tournament.status === 'completed') {
    return 'completed';
  }
  
  // Date-based guard: if we have a start_date, use it as the authority
  if (tournament.start_date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(tournament.start_date + 'T00:00:00');
    startDate.setHours(0, 0, 0, 0);
    
    // Before start date = always upcoming, regardless of current_round
    if (today < startDate) {
      return 'upcoming';
    }
    
    // On or after start date: check if we're past the end date
    if (tournament.end_date) {
      const endDate = new Date(tournament.end_date + 'T23:59:59');
      if (today > endDate) {
        return 'completed';
      }
    }
    
    // We're within the tournament date range — check for active play
    if ((tournament.current_round || 0) > 0) {
      return 'live';
    }
    
    // Start date has arrived but no round data yet — could be early morning
    // Default to upcoming to avoid false live state
    return 'upcoming';
  }
  
  // No start_date available — be conservative, default to upcoming
  // Only show live if current_round is explicitly > 0 AND event_completed is false
  if ((tournament.current_round || 0) > 0) {
    // Without a start_date we can't verify, but current_round > 0 is a signal
    // Log a warning so we know the date guard isn't working
    console.warn('⚠️ Tournament state: current_round > 0 but no start_date — defaulting to upcoming. Event:', tournament.event_name);
    return 'upcoming';
  }
  
  return 'upcoming';
}

/**
 * Check if predictions data is stale (from a different event than the one displayed)
 */
function predictionsAreStale() {
  if (!globalPredictionEventName || !globalTournamentInfo.event_name) return false;
  // Normalize both names for comparison (trim, lowercase)
  const predName = globalPredictionEventName.trim().toLowerCase();
  const tournName = globalTournamentInfo.event_name.trim().toLowerCase();
  return predName !== tournName;
}

/**
 * Format a date string for display
 * Input: "2026-02-12" or ISO string
 * Output: "Feb 12" or "Feb 12–15"
 */
function formatTournamentDate(startStr, endStr) {
  if (!startStr) return '';
  
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const start = new Date(startStr + 'T12:00:00'); // Noon to avoid timezone issues
  const startFormatted = `${months[start.getMonth()]} ${start.getDate()}`;
  
  if (endStr) {
    const end = new Date(endStr + 'T12:00:00');
    if (start.getMonth() === end.getMonth()) {
      return `${startFormatted}–${end.getDate()}`;
    }
    return `${startFormatted} – ${months[end.getMonth()]} ${end.getDate()}`;
  }
  
  return startFormatted;
}

/**
 * Get a human-readable countdown or date label for upcoming tournaments
 */
function getUpcomingDateLabel(tournament) {
  if (!tournament.start_date) return 'Date TBD';
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(tournament.start_date + 'T12:00:00');
  start.setHours(0, 0, 0, 0);
  
  const diffMs = start - today;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  
  const dateRange = formatTournamentDate(tournament.start_date, tournament.end_date);
  
  if (diffDays <= 0) return `Starts today · ${dateRange}`;
  if (diffDays === 1) return `Starts tomorrow · ${dateRange}`;
  if (diffDays <= 7) return `Starts in ${diffDays} days · ${dateRange}`;
  return dateRange;
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
  
  return { rating, label, eliteCount, topTier, players: players.length };
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
let globalFieldList = [];           // Full field from field-updates (for upcoming state)
let globalPredictionEventName = ''; // Which event the predictions are for (staleness check)
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
      const { players, predictions, tournament, field_list, prediction_event_name } = labData.data;
      
      globalPlayers = players || [];
      globalPredictions = predictions || [];
      globalTournamentInfo = tournament || {};
      globalFieldList = field_list || [];
      globalPredictionEventName = prediction_event_name || '';
      
      console.log('✓ Loaded', globalPlayers.length, 'players');
      console.log('✓ Loaded', globalPredictions.length, 'predictions');
      console.log('✓ Tournament:', globalTournamentInfo.event_name);
      console.log('✓ Predictions for:', globalPredictionEventName);
      console.log('✓ Field list:', globalFieldList.length, 'players');
      console.log('✓ Tournament state:', getTournamentState(globalTournamentInfo));
      
      if (predictionsAreStale()) {
        console.warn('⚠️ Predictions are STALE — predictions for', globalPredictionEventName, 'but displaying', globalTournamentInfo.event_name);
      }
    }
    
    // Load DG Rankings for Top 10 (PGA ONLY)
    try {
      const rankingsResponse = await fetch(`${API_BASE_URL}/api/rankings?pga_only=true`);
      const rankingsData = await rankingsResponse.json();
      
      if (rankingsData.success && rankingsData.data && rankingsData.data.rankings) {
        globalDGRankings = rankingsData.data.rankings.slice(0, 10);
        console.log('✓ Loaded DG Rankings top 10 (PGA Tour only)');
      }
    } catch (err) {
      console.warn('⚠️ Could not load DG rankings:', err);
    }
    
    // Load live data ONLY if tournament state is actually live
    const tournamentState = getTournamentState(globalTournamentInfo);
    if (tournamentState === 'live') {
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
  
  const state = getTournamentState(globalTournamentInfo);
  const eventStatus = getEventStatus(globalTournamentInfo);
  const courseName = globalTournamentInfo.course || '';
  const fieldSize = globalTournamentInfo.field_size || 0;
  const dateLabel = getUpcomingDateLabel(globalTournamentInfo);
  const dateRange = formatTournamentDate(globalTournamentInfo.start_date, globalTournamentInfo.end_date);
  
  let dateDisplay = '';
  if (state === 'upcoming') {
    dateDisplay = dateLabel;
  } else if (state === 'live') {
    dateDisplay = dateRange;
  } else if (state === 'completed') {
    dateDisplay = dateRange ? `${dateRange} · Complete` : 'Complete';
  }
  
  container.innerHTML = `
    <div class="banner-inner">
      <div class="banner-label" style="color: ${eventStatus.color}">
        ${eventStatus.label}${eventStatus.sublabel ? ` · ${eventStatus.sublabel}` : ''}
      </div>
      <h2 class="banner-title">${globalTournamentInfo.event_name || 'Upcoming Tournament'}</h2>
      <div class="banner-course">${courseName}${courseName && fieldSize ? ' · ' : ''}${fieldSize ? `${fieldSize} players` : ''}</div>
      ${dateDisplay ? `<div class="banner-course" style="opacity: 0.5; font-size: 12px; margin-top: 4px;">${dateDisplay}</div>` : ''}
    </div>
  `;
}

function renderFieldStrength() {
  const container = document.getElementById('field-strength');
  if (!container) return;
  
  const state = getTournamentState(globalTournamentInfo);
  const isLive = state === 'live';
  const isUpcoming = state === 'upcoming';
  const stale = predictionsAreStale();
  const dateLabel = getUpcomingDateLabel(globalTournamentInfo);
  
  // Build tournament field consistently:
  // Primary: field-updates list matched with skill ratings (most stable)
  // Fallback: predictions matched with skill ratings (only if same event)
  let fieldForStrength = [];
  
  if (globalFieldList.length > 0) {
    // Best source: field-updates gives us the definitive field list
    fieldForStrength = globalFieldList
      .map(fp => {
        const playerData = globalPlayers.find(p => p.dg_id === fp.dg_id);
        if (playerData) return playerData;
        return { dg_id: fp.dg_id, player_name: fp.player_name, sg_total: 0 };
      })
      .filter(p => p.sg_total != null && p.sg_total !== 0);
  } else if (!stale && globalPredictions.length > 0) {
    // Fallback: predictions list (only if not stale)
    fieldForStrength = globalPredictions
      .map(pred => {
        const playerData = globalPlayers.find(p => p.dg_id === pred.dg_id || p.player_name === pred.player_name);
        return playerData || null;
      })
      .filter(p => p && p.sg_total != null);
  }
  
  // If we still have nothing, use all PGA players as a last resort
  const field = calculateFieldStrength(fieldForStrength.length > 0 ? fieldForStrength : globalPlayers);
  const pct = (parseFloat(field.rating) / 10) * 100;
  const labelColor = getLabelColor(field.rating, field.label);
  
  // Get top 3 leaders from leaderboard (live data only)
  let top3Leaders = [];
  if (isLive && globalLeaderboard.length > 0) {
    const sortedByScore = [...globalLeaderboard].sort((a, b) => {
      let scoreA = a.current_score;
      if (scoreA === 'E' || scoreA === 0) scoreA = 0;
      else if (typeof scoreA === 'string') scoreA = parseFloat(scoreA) || 999;
      else scoreA = scoreA || 999;
      
      let scoreB = b.current_score;
      if (scoreB === 'E' || scoreB === 0) scoreB = 0;
      else if (typeof scoreB === 'string') scoreB = parseFloat(scoreB) || 999;
      else scoreB = scoreB || 999;
      
      return scoreA - scoreB;
    });
    top3Leaders = sortedByScore.slice(0, 3);
  }
  
  // Get top 3 win odds from predictions (only if not stale)
  let top3Odds = [];
  if (!stale && globalPredictions.length > 0) {
    const sortedByWin = [...globalPredictions]
      .filter(p => p.win != null)
      .sort((a, b) => (b.win || 0) - (a.win || 0));
    top3Odds = sortedByWin.slice(0, 3);
  }
  
  // Leaders card content
  let leadersContent = '';
  if (isLive && top3Leaders.length > 0) {
    leadersContent = top3Leaders.map((p, i) => {
      const score = p.current_score || 0;
      const scoreDisplay = score > 0 ? `+${score}` : score === 0 || score === 'E' ? 'E' : score;
      const lastName = p.player_name.split(', ')[0];
      return `
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <span style="font-size: 13px; color: rgba(250,250,250,0.75); font-weight: 500;">${i + 1}. ${lastName}</span>
          <span style="font-size: 15px; color: ${score <= 0 ? '#5BBF85' : '#E76F51'}; font-weight: 600;">${scoreDisplay}</span>
        </div>
      `;
    }).join('');
  } else {
    // Upcoming state
    leadersContent = `
      <div style="text-align: center; padding: 8px 0;">
        <div style="font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: #5BBF85; margin-bottom: 10px;">Upcoming</div>
        <div style="font-size: 13px; color: rgba(250,250,250,0.5); line-height: 1.5;">${dateLabel || 'Check back when the tournament begins'}</div>
      </div>
    `;
  }
  
  // Odds card content
  let oddsContent = '';
  if (top3Odds.length > 0) {
    oddsContent = top3Odds.map((p, i) => {
      const winPct = ((p.win || 0) * 100).toFixed(1);
      const lastName = p.player_name.split(', ')[0];
      return `
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <span style="font-size: 13px; color: rgba(250,250,250,0.75); font-weight: 500;">${i + 1}. ${lastName}</span>
          <span style="font-size: 15px; color: #5A8FA8; font-weight: 600;">${winPct}%</span>
        </div>
      `;
    }).join('');
  } else {
    // Upcoming / stale state
    oddsContent = `
      <div style="text-align: center; padding: 8px 0;">
        <div style="font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: #5BBF85; margin-bottom: 10px;">Upcoming</div>
        <div style="font-size: 13px; color: rgba(250,250,250,0.5); line-height: 1.5;">Predictions publish Tuesday/Wednesday of event week</div>
      </div>
    `;
  }
  
  container.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; max-width: 1200px; margin: 0 auto; justify-items: center;" class="field-grid">
      
      <!-- Field Strength Card -->
      <div class="strength-card" style="width: 100%; max-width: 350px;">
        <div class="strength-header">
          <span class="strength-label">Field Strength</span>
          <span class="strength-value">${field.rating.toFixed(1)}<span class="strength-max">/10</span></span>
        </div>
        <div class="strength-bar" style="position: relative;">
          <div class="strength-fill" style="width: ${pct}%; background: linear-gradient(90deg, #E76F51, #5A8FA8);"></div>
          <div style="position: absolute; left: ${pct}%; top: 50%; transform: translate(-50%, -50%); width: 14px; height: 14px; background: ${labelColor}; border: 2px solid rgba(250,250,250,0.9); border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>
        </div>
        <div class="strength-rating" style="color: ${labelColor};">${field.label}</div>
        <div class="strength-details">
          <div class="strength-stat"><span class="stat-num">${field.eliteCount}</span><span class="stat-text">Elite (SG 1.5+)</span></div>
          <div class="strength-stat"><span class="stat-num">${field.topTier}</span><span class="stat-text">Top Tier (SG 1.0+)</span></div>
        </div>
      </div>

      <!-- Leaders Card -->
      <div class="strength-card" style="width: 100%; max-width: 350px;">
        <div class="strength-header">
          <span class="strength-label">Leaders${isLive ? ' <span style="margin-left: 6px; font-size: 9px; color: #E76F51; font-weight: 600; letter-spacing: 0.5px;">● LIVE</span>' : ''}</span>
          <span class="strength-value" style="font-size: 18px;">${isLive ? '🏆' : ''}</span>
        </div>
        <div style="margin-top: 20px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.06);">
          <div style="display: flex; flex-direction: column; gap: 12px;">
            ${leadersContent}
          </div>
        </div>
      </div>

      <!-- Odds Card -->
      <div class="strength-card" style="width: 100%; max-width: 350px;">
        <div class="strength-header">
          <span class="strength-label">Win Odds${isLive && !stale ? ' <span style="margin-left: 6px; font-size: 9px; color: #E76F51; font-weight: 600; letter-spacing: 0.5px;">● LIVE</span>' : ''}</span>
          <span class="strength-value" style="font-size: 18px;">${top3Odds.length > 0 ? '%' : ''}</span>
        </div>
        <div style="margin-top: 20px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.06);">
          <div style="display: flex; flex-direction: column; gap: 12px;">
            ${oddsContent}
          </div>
        </div>
      </div>

    </div>
  `;
}

function renderLeaderboard() {
  const container = document.getElementById('leaderboard-table');
  const liveIndicator = document.getElementById('leaderboard-live-indicator');
  if (!container) return;
  
  const state = getTournamentState(globalTournamentInfo);
  const isLive = state === 'live';
  const tournamentName = globalTournamentInfo.event_name || 'Tournament';
  const dateLabel = getUpcomingDateLabel(globalTournamentInfo);
  
  // Update live indicator above table
  if (liveIndicator) {
    if (isLive) {
      liveIndicator.innerHTML = `🔴 Live Scores · ${tournamentName}`;
    } else if (state === 'upcoming') {
      liveIndicator.innerHTML = `Upcoming · ${tournamentName}`;
    } else {
      liveIndicator.textContent = '';
    }
  }
  
  // LIVE: show full leaderboard with scores
  if (isLive && globalLeaderboard.length > 0) {
    // Sort by current score (lowest to highest), then by position
    const sorted = [...globalLeaderboard].sort((a, b) => {
      let scoreA = a.current_score;
      if (scoreA === 'E' || scoreA === 0) scoreA = 0;
      else if (typeof scoreA === 'string') scoreA = parseFloat(scoreA) || 999;
      else scoreA = scoreA || 999;
      
      let scoreB = b.current_score;
      if (scoreB === 'E' || scoreB === 0) scoreB = 0;
      else if (typeof scoreB === 'string') scoreB = parseFloat(scoreB) || 999;
      else scoreB = scoreB || 999;
      
      if (scoreA !== scoreB) return scoreA - scoreB;
      
      const posA = String(a.current_pos || '999').replace(/[T-]/g, '');
      const posB = String(b.current_pos || '999').replace(/[T-]/g, '');
      return parseInt(posA) - parseInt(posB);
    });
    
    container.innerHTML = `
      <style>
        .leaderboard-scroll::-webkit-scrollbar { width: 8px; }
        .leaderboard-scroll::-webkit-scrollbar-track { background: rgba(255,255,255,0.03); border-radius: 4px; }
        .leaderboard-scroll::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #5BBF85, #5A8FA8); border-radius: 4px; }
        .leaderboard-scroll::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, #6DD89A, #6BA3BD); }
      </style>
      <div class="table-wrapper leaderboard-scroll" style="max-height: 600px; overflow-y: auto;">
        <table class="pred-table">
          <thead style="position: sticky; top: 0; background: rgba(255,255,255,0.02); backdrop-filter: blur(10px); z-index: 1; border-bottom: 1px solid rgba(255,255,255,0.08);">
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
              const scoreDisplay = score > 0 ? `+${score}` : score === 0 || score === 'E' ? 'E' : score;
              const today = p.today || 0;
              const todayDisplay = today > 0 ? `+${today}` : today === 0 || today === 'E' ? 'E' : today;
              
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
    return;
  }
  
  // UPCOMING: show the field list with skill ratings
  if (state === 'upcoming' || state === 'completed') {
    // Build a displayable field — use field list matched with skill data
    let fieldDisplay = [];
    
    // Try matching field list players with skill data
    if (globalFieldList.length > 0) {
      fieldDisplay = globalFieldList.map(fp => {
        const playerData = globalPlayers.find(p => p.dg_id === fp.dg_id);
        return {
          player_name: fp.player_name,
          country: fp.country || (playerData ? playerData.country : ''),
          sg_total: playerData ? playerData.sg_total : null,
          am: fp.am || 0
        };
      });
    } else if (!predictionsAreStale() && globalPredictions.length > 0) {
      // Fallback: use predictions list
      fieldDisplay = globalPredictions.map(pred => {
        const playerData = globalPlayers.find(p => p.dg_id === pred.dg_id);
        return {
          player_name: pred.player_name,
          country: playerData ? playerData.country : '',
          sg_total: playerData ? playerData.sg_total : (pred.dg_skill_estimate || null),
          am: 0
        };
      });
    }
    
    // Sort by SG (highest first), players without SG at the bottom
    fieldDisplay.sort((a, b) => {
      if (a.sg_total == null && b.sg_total == null) return 0;
      if (a.sg_total == null) return 1;
      if (b.sg_total == null) return -1;
      return (b.sg_total || 0) - (a.sg_total || 0);
    });
    
    if (fieldDisplay.length === 0) {
      container.innerHTML = '<div class="loading-msg">Field not yet available</div>';
      return;
    }
    
    container.innerHTML = `
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: #5BBF85; margin-bottom: 6px;">
          ${state === 'upcoming' ? 'Upcoming' : 'Final'}
        </div>
        <div style="font-size: 13px; color: rgba(250,250,250,0.45);">
          ${state === 'upcoming' ? dateLabel : formatTournamentDate(globalTournamentInfo.start_date, globalTournamentInfo.end_date)}
        </div>
      </div>
      <style>
        .leaderboard-scroll::-webkit-scrollbar { width: 8px; }
        .leaderboard-scroll::-webkit-scrollbar-track { background: rgba(255,255,255,0.03); border-radius: 4px; }
        .leaderboard-scroll::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #5BBF85, #5A8FA8); border-radius: 4px; }
      </style>
      <div class="table-wrapper leaderboard-scroll" style="max-height: 600px; overflow-y: auto;">
        <table class="pred-table">
          <thead style="position: sticky; top: 0; background: rgba(255,255,255,0.02); backdrop-filter: blur(10px); z-index: 1; border-bottom: 1px solid rgba(255,255,255,0.08);">
            <tr>
              <th class="rank-col">#</th>
              <th>Player</th>
              <th class="prob-col">DG Rating</th>
            </tr>
          </thead>
          <tbody>
            ${fieldDisplay.map((p, i) => {
              const flagHtml = getFlagImg(p.country);
              const sgDisplay = p.sg_total != null ? formatSG(p.sg_total) : '—';
              const sgClass = p.sg_total != null && p.sg_total >= 0 ? 'win' : '';
              return `
                <tr>
                  <td class="rank-col">${i + 1}</td>
                  <td class="player-col">${flagHtml ? `<span style="margin-right: 6px;">${flagHtml}</span>` : ''}${p.player_name}${p.am ? ' <span style="font-size:10px;color:rgba(250,250,250,0.3);">(a)</span>' : ''}</td>
                  <td class="prob-col ${sgClass}">${sgDisplay}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
    return;
  }
  
  // Fallback
  container.innerHTML = '<div class="loading-msg">Leaderboard data not available</div>';
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
        // Use full player data — mark as having real breakdown
        return { ...playerData, _hasBreakdown: true };
      } else {
        // Use ranking data — no real breakdown available
        return {
          dg_id: ranking.dg_id,
          player_name: ranking.player_name,
          country: ranking.country,
          sg_total: ranking.dg_skill_estimate,
          sg_ott: null,
          sg_app: null,
          sg_arg: null,
          sg_putt: null,
          _hasBreakdown: false
        };
      }
    });
  } else {
    top10 = globalPlayers
      .filter(p => p.sg_total != null)
      .sort((a, b) => (b.sg_total || 0) - (a.sg_total || 0))
      .slice(0, 10)
      .map(p => ({ ...p, _hasBreakdown: true }));
  }
  
  if (!top10.length) {
    container.innerHTML = '<div class="loading-msg" style="grid-column:1/-1;">No rankings data available</div>';
    return;
  }
  
  container.innerHTML = top10.map((p, i) => {
    const style = getPlayingStyle(p);
    const flagHtml = getFlagImg(p.country);
    
    // Show dash for SG breakdown if we don't have real data
    const formatSkill = (val) => {
      if (val == null) return '—';
      return formatSG(val);
    };
    const skillClass = (val) => {
      if (val == null) return '';
      return val >= 0 ? 'pos' : 'neg';
    };
    
    return `
      <div class="player-card" style="animation-delay: ${i * 0.05}s">
        <div class="card-top">
          <div class="rank-badge">${i + 1}</div>
          ${flagHtml}
          <span class="style-tag" style="color: ${style.color}; border-color: ${style.color};">
            ${style.name}
          </span>
        </div>
        <div class="player-name">${p.player_name}</div>
        <div class="sg-total">
          <span class="sg-number">${formatSG(p.sg_total)}</span>
          <span class="sg-label">DataGolf Skill Rating</span>
        </div>
        <div class="skills-list">
          <div class="skill-row">
            <span class="skill-name">Off-the-Tee</span>
            <span class="skill-value ${skillClass(p.sg_ott)}">${formatSkill(p.sg_ott)}</span>
          </div>
          <div class="skill-row">
            <span class="skill-name">Approach</span>
            <span class="skill-value ${skillClass(p.sg_app)}">${formatSkill(p.sg_app)}</span>
          </div>
          <div class="skill-row">
            <span class="skill-name">Around Green</span>
            <span class="skill-value ${skillClass(p.sg_arg)}">${formatSkill(p.sg_arg)}</span>
          </div>
          <div class="skill-row">
            <span class="skill-name">Putting</span>
            <span class="skill-value ${skillClass(p.sg_putt)}">${formatSkill(p.sg_putt)}</span>
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
  const state = getTournamentState(globalTournamentInfo);
  const isLive = state === 'live';
  const stale = predictionsAreStale();
  const dateLabel = getUpcomingDateLabel(globalTournamentInfo);
  
  // If predictions are stale or tournament is upcoming without fresh predictions, show upcoming state
  if (stale || (state === 'upcoming' && globalPredictions.length === 0)) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 20px;">
        <div style="font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: #5BBF85; margin-bottom: 12px;">Upcoming</div>
        <div style="font-family: var(--display); font-size: 22px; font-weight: 600; margin-bottom: 10px;">${eventName}</div>
        <div style="font-size: 13px; color: rgba(250,250,250,0.45); margin-bottom: 6px;">${dateLabel}</div>
        <div style="font-size: 13px; color: rgba(250,250,250,0.35);">Predictions will be available Tuesday/Wednesday of event week</div>
      </div>
    `;
    return;
  }
  
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
          ticks: { 
            color: 'rgba(250,250,250,0.4)',
            backdropColor: 'transparent',
            font: { size: 10 }
          },
          grid: { color: 'rgba(255,255,255,0.08)' },
          pointLabels: { 
            color: 'rgba(250,250,250,0.6)',
            font: { size: 11, weight: '500' },
            padding: 8
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
      scales: {
        x: {
          title: {
            display: true,
            text: 'SG: Putting',
            color: 'rgba(250,250,250,0.6)',
            font: { size: 12, weight: '500' }
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
  
  // Create gradient for bars (more subtle)
  const gradient = ctx.createLinearGradient(0, 0, 0, 400);
  gradient.addColorStop(0, '#5A8FA8');
  gradient.addColorStop(1, 'rgba(90,143,168,0.3)'); // More subtle - 30% opacity of same color
  
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
        backgroundColor: gradient,
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
  
  // Create gradients for each bar (more subtle)
  const gradientRed = ctx.createLinearGradient(0, 0, 0, 400);
  gradientRed.addColorStop(0, '#E76F51');
  gradientRed.addColorStop(1, 'rgba(231,111,81,0.3)');
  
  const gradientBlue = ctx.createLinearGradient(0, 0, 0, 400);
  gradientBlue.addColorStop(0, '#5A8FA8');
  gradientBlue.addColorStop(1, 'rgba(90,143,168,0.3)');
  
  const gradientGreen = ctx.createLinearGradient(0, 0, 0, 400);
  gradientGreen.addColorStop(0, '#5BBF85');
  gradientGreen.addColorStop(1, 'rgba(91,191,133,0.3)');
  
  const gradientOrange = ctx.createLinearGradient(0, 0, 0, 400);
  gradientOrange.addColorStop(0, '#DDA15E');
  gradientOrange.addColorStop(1, 'rgba(221,161,94,0.3)');
  
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Off-the-Tee', 'Approach', 'Around Green', 'Putting'],
      datasets: [{
        label: 'Average SG',
        data: [avgOTT, avgAPP, avgARG, avgPUTT],
        backgroundColor: [gradientRed, gradientBlue, gradientGreen, gradientOrange],
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
            stepSize: 0.2,
            color: 'rgba(250,250,250,0.5)',
            font: { size: 10 },
            callback: function(value) {
              return value.toFixed(1);
            }
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
  
  // Initialize Tournament Intelligence after data loads
  setTimeout(initTournamentIntelligence, 2000);
  
  // Auto-refresh live predictions every hour when tournament is live
  setInterval(() => {
    if (getTournamentState(globalTournamentInfo) === 'live') {
      console.log('🔄 Auto-refreshing live predictions...');
      loadLivePredictions();
    }
  }, 3600000); // 1 hour = 3,600,000ms
  
  // Section nav active states with Events section
  const navLinks = document.querySelectorAll('.section-nav a');
  const eventsSection = document.getElementById('events');
  const leaderboardSection = document.getElementById('leaderboard');
  const intelligenceSection = document.getElementById('intelligence');
  const strategySection = document.getElementById('strategy');
  const predictionsSection = document.getElementById('predictions');
  const rankingsSection = document.getElementById('rankings');
  const analyticsSection = document.getElementById('analytics');
  
  const allSections = [eventsSection, leaderboardSection, intelligenceSection, strategySection, predictionsSection, rankingsSection, analyticsSection].filter(Boolean);
  
  // Track which section is currently intersecting
  let currentSection = 'events';
  
  const observer = new IntersectionObserver((entries) => {
    // Find the section with the highest intersection ratio
    let maxRatio = 0;
    let activeSection = null;
    
    entries.forEach(entry => {
      if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
        maxRatio = entry.intersectionRatio;
        activeSection = entry.target;
      }
    });
    
    // Only switch if we have a clear winner (at least 30% visible)
    if (activeSection && maxRatio >= 0.3) {
      currentSection = activeSection.id;
      navLinks.forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === `#${currentSection}`);
      });
    }
  }, { 
    threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
    rootMargin: '-120px 0px -30% 0px'
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

// ============================================
// TOURNAMENT INTELLIGENCE FUNCTIONS
// ============================================

/**
 * Render Tournament Intelligence section
 * Shows value players, course profile, and winning profile
 */
async function renderTournamentIntelligence() {
  if (!globalPlayers || !globalPredictions) {
    console.log('Waiting for data to load tournament intelligence...');
    return;
  }
  
  renderTournamentContext();
  renderValuePlayers();
  renderCourseProfile();
  renderWinningProfile();
}

/**
 * Render Tournament Context
 * Shows which tournament is being analyzed
 */
function renderTournamentContext() {
  const nameEl = document.getElementById('tournament-name');
  const datesEl = document.getElementById('tournament-dates');
  
  if (!nameEl || !datesEl) return;
  
  if (globalTournamentInfo && globalTournamentInfo.event_name) {
    nameEl.textContent = globalTournamentInfo.event_name;
    
    const state = getTournamentState(globalTournamentInfo);
    const dateRange = formatTournamentDate(globalTournamentInfo.start_date, globalTournamentInfo.end_date);
    
    if (state === 'completed') {
      datesEl.textContent = dateRange ? `${dateRange} · Tournament Complete` : 'Tournament Complete';
    } else if (state === 'live') {
      const round = globalTournamentInfo.current_round || 0;
      datesEl.textContent = `Round ${round} In Progress${dateRange ? ` · ${dateRange}` : ''}`;
    } else {
      const dateLabel = getUpcomingDateLabel(globalTournamentInfo);
      datesEl.textContent = `Upcoming · ${dateLabel}`;
    }
  } else {
    nameEl.textContent = 'Current PGA Tour Event';
    datesEl.textContent = 'Loading details...';
  }
}

/**
 * Render Value Players list
 * Shows top 5 players by skill rating who are in the tournament
 */
function renderValuePlayers() {
  const container = document.getElementById('value-players-list');
  if (!container) return;
  
  const stale = predictionsAreStale();
  
  // Get players in current tournament — use field list if predictions are stale
  let tournamentPlayerIds;
  if (!stale && globalPredictions.length > 0) {
    tournamentPlayerIds = new Set(globalPredictions.map(p => p.dg_id));
  } else if (globalFieldList.length > 0) {
    tournamentPlayerIds = new Set(globalFieldList.map(p => p.dg_id));
  } else {
    tournamentPlayerIds = new Set();
  }
  
  // Filter to players in tournament and sort by skill
  const valuePlayers = globalPlayers
    .filter(p => tournamentPlayerIds.has(p.dg_id) && p.sg_total != null)
    .sort((a, b) => (b.sg_total || 0) - (a.sg_total || 0))
    .slice(0, 5);
  
  if (valuePlayers.length === 0) {
    container.innerHTML = '<div class="loading-msg" style="padding: 20px;">No data available</div>';
    return;
  }
  
  container.innerHTML = valuePlayers.map((player, i) => {
    // Determine value indicator based on skill level
    let valueText = 'Elite Value';
    let valueColor = '#5BBF85';
    if (player.sg_total < 2.5) { 
      valueText = 'Strong Value';
      valueColor = '#5BBF85';
    }
    if (player.sg_total < 2.0) { 
      valueText = 'Good Value';
      valueColor = '#5A8FA8';
    }
    if (player.sg_total < 1.5) { 
      valueText = 'Solid';
      valueColor = 'rgba(250,250,250,0.5)';
    }
    
    return `
      <div class="value-player">
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="width: 32px; height: 32px; background: rgba(91,191,133,0.15); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <span style="font-size: 14px; font-weight: 700; color: #5BBF85;">${i + 1}</span>
            </div>
            <div>
              <div class="name" style="margin-bottom: 2px; font-size: 15px;">${player.player_name}</div>
              <div style="font-size: 11px; color: ${valueColor}; font-weight: 600;">
                ${valueText}
              </div>
            </div>
          </div>
          <div style="text-align: right;">
            <div class="skill-badge" style="margin-bottom: 0;">${formatSG(player.sg_total)}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Render Course Profile
 * Shows what skills matter most based on field averages
 */
function renderCourseProfile() {
  const container = document.getElementById('course-profile-content');
  if (!container) return;
  
  const stale = predictionsAreStale();
  
  // Get tournament players — use field list if predictions are stale
  let tournamentPlayerIds;
  if (!stale && globalPredictions.length > 0) {
    tournamentPlayerIds = new Set(globalPredictions.map(p => p.dg_id));
  } else if (globalFieldList.length > 0) {
    tournamentPlayerIds = new Set(globalFieldList.map(p => p.dg_id));
  } else {
    tournamentPlayerIds = new Set();
  }
  const tournamentPlayers = globalPlayers.filter(p => tournamentPlayerIds.has(p.dg_id));
  
  if (tournamentPlayers.length === 0) {
    container.innerHTML = '<div class="loading-msg" style="padding: 20px;">No data available</div>';
    return;
  }
  
  // Calculate field strength
  const field = calculateFieldStrength(tournamentPlayers);
  
  // Determine most predictive skill
  const avgOTT = tournamentPlayers.reduce((sum, p) => sum + (p.sg_ott || 0), 0) / tournamentPlayers.length;
  const avgAPP = tournamentPlayers.reduce((sum, p) => sum + (p.sg_app || 0), 0) / tournamentPlayers.length;
  const avgARG = tournamentPlayers.reduce((sum, p) => sum + (p.sg_arg || 0), 0) / tournamentPlayers.length;
  const avgPUTT = tournamentPlayers.reduce((sum, p) => sum + (p.sg_putt || 0), 0) / tournamentPlayers.length;
  
  const skills = [
    { name: 'Driving', avg: Math.abs(avgOTT), raw: avgOTT },
    { name: 'Approach', avg: Math.abs(avgAPP), raw: avgAPP },
    { name: 'Around Green', avg: Math.abs(avgARG), raw: avgARG },
    { name: 'Putting', avg: Math.abs(avgPUTT), raw: avgPUTT }
  ];
  
  const mostPredictive = skills.sort((a, b) => b.avg - a.avg)[0];
  
  // Determine difficulty with proper ranges
  let difficulty = 'Average Field';
  let difficultyColor = 'rgba(250,250,250,0.6)';
  if (field.rating >= 7.5) { 
    difficulty = 'Elite Field'; 
    difficultyColor = '#5BBF85'; // Green for elite
  } else if (field.rating >= 6.5) { 
    difficulty = 'Very Strong'; 
    difficultyColor = '#5BBF85';
  } else if (field.rating >= 5.5) { 
    difficulty = 'Strong Field'; 
    difficultyColor = '#5A8FA8';
  } else if (field.rating < 4.5) { 
    difficulty = 'Below Average'; 
    difficultyColor = '#E76F51';
  }
  
  container.innerHTML = `
    <div class="fit-grid">
      <div class="fit-stat">
        <span class="stat-label">Field Rating</span>
        <span class="stat-value" style="color: ${difficultyColor};">${field.rating.toFixed(1)}</span>
      </div>
      <div class="fit-stat">
        <span class="stat-label">Strength</span>
        <span class="stat-value" style="color: ${difficultyColor};">${difficulty}</span>
      </div>
    </div>
    <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: 8px; padding: 16px; margin-bottom: 14px;">
      <div style="font-size: 12px; font-weight: 600; color: #5BBF85; margin-bottom: 8px; text-transform: uppercase; letter-spacing: .05em;">
        Key Winning Skill
      </div>
      <div style="font-size: 16px; font-weight: 600; margin-bottom: 4px;">
        ${mostPredictive.name}
      </div>
      <div style="font-size: 13px; color: rgba(250,250,250,0.5);">
        Field average: ${formatSG(mostPredictive.raw)}
      </div>
    </div>
    <div style="font-size: 13px; color: rgba(250,250,250,0.5); line-height: 1.6;">
      ${difficulty === 'Elite Field' ? 'An elite' : difficulty === 'Average Field' ? 'An average' : 'A ' + difficulty.toLowerCase()} field (${field.rating.toFixed(1)}/10) with ${field.eliteCount} elite players (SG 1.5+) and ${field.topTier} top-tier players (SG 1.0+). Winners will need elite ${mostPredictive.name.toLowerCase()} play to separate from the pack.
    </div>
  `;
}

/**
 * Render Winning Profile chart
 * Shows relative importance of each skill for winning
 */
function renderWinningProfile() {
  const container = document.getElementById('winning-profile-chart');
  const statsContainer = document.getElementById('winning-profile-stats');
  if (!container) return;
  
  const stale = predictionsAreStale();
  
  // Get tournament players — use field list if predictions are stale
  let tournamentPlayerIds;
  if (!stale && globalPredictions.length > 0) {
    tournamentPlayerIds = new Set(globalPredictions.map(p => p.dg_id));
  } else if (globalFieldList.length > 0) {
    tournamentPlayerIds = new Set(globalFieldList.map(p => p.dg_id));
  } else {
    tournamentPlayerIds = new Set();
  }
  const tournamentPlayers = globalPlayers.filter(p => tournamentPlayerIds.has(p.dg_id));
  
  if (tournamentPlayers.length === 0) {
    container.innerHTML = '<div class="loading-msg" style="padding: 20px;">No data available</div>';
    return;
  }
  
  // Calculate average skills of top 10 players
  const top10 = tournamentPlayers
    .filter(p => p.sg_total != null)
    .sort((a, b) => (b.sg_total || 0) - (a.sg_total || 0))
    .slice(0, 10);
  
  const avgOTT = top10.reduce((sum, p) => sum + Math.abs(p.sg_ott || 0), 0) / top10.length;
  const avgAPP = top10.reduce((sum, p) => sum + Math.abs(p.sg_app || 0), 0) / top10.length;
  const avgARG = top10.reduce((sum, p) => sum + Math.abs(p.sg_arg || 0), 0) / top10.length;
  const avgPUTT = top10.reduce((sum, p) => sum + Math.abs(p.sg_putt || 0), 0) / top10.length;
  
  // Calculate raw averages for stats
  const rawOTT = top10.reduce((sum, p) => sum + (p.sg_ott || 0), 0) / top10.length;
  const rawAPP = top10.reduce((sum, p) => sum + (p.sg_app || 0), 0) / top10.length;
  const rawARG = top10.reduce((sum, p) => sum + (p.sg_arg || 0), 0) / top10.length;
  const rawPUTT = top10.reduce((sum, p) => sum + (p.sg_putt || 0), 0) / top10.length;
  
  // Normalize to 100% scale for bars
  const total = avgOTT + avgAPP + avgARG + avgPUTT;
  const ottPct = (avgOTT / total) * 100;
  const appPct = (avgAPP / total) * 100;
  const argPct = (avgARG / total) * 100;
  const puttPct = (avgPUTT / total) * 100;
  
  // Render stats on right side — all values in the same blue
  const statBlue = '#5A8FA8';
  if (statsContainer) {
    statsContainer.innerHTML = `
      <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; padding: 18px 20px; text-align: center;">
        <div style="font-size: 10px; font-weight: 600; letter-spacing: .15em; text-transform: uppercase; color: rgba(250,250,250,0.4); margin-bottom: 12px;">
          Top 10 Average SG
        </div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
          <div>
            <div style="font-size: 11px; color: rgba(250,250,250,0.4); margin-bottom: 6px;">Off-the-Tee</div>
            <div style="font-size: 22px; font-weight: 700; color: ${statBlue};">${formatSG(rawOTT)}</div>
          </div>
          <div>
            <div style="font-size: 11px; color: rgba(250,250,250,0.4); margin-bottom: 6px;">Approach</div>
            <div style="font-size: 22px; font-weight: 700; color: ${statBlue};">${formatSG(rawAPP)}</div>
          </div>
          <div>
            <div style="font-size: 11px; color: rgba(250,250,250,0.4); margin-bottom: 6px;">Around Green</div>
            <div style="font-size: 22px; font-weight: 700; color: ${statBlue};">${formatSG(rawARG)}</div>
          </div>
          <div>
            <div style="font-size: 11px; color: rgba(250,250,250,0.4); margin-bottom: 6px;">Putting</div>
            <div style="font-size: 22px; font-weight: 700; color: ${statBlue};">${formatSG(rawPUTT)}</div>
          </div>
        </div>
        <div style="margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.05); font-size: 11px; color: rgba(250,250,250,0.35); line-height: 1.5;">
          DataGolf skill model · Top 10 contenders in field
        </div>
      </div>
    `;
  }
  
  // Build CSS conic-gradient donut chart
  // Colors from the analytics dashboard palette
  const ottColor = '#E76F51';  // Red/coral — Off-the-Tee (matches Power)
  const appColor = '#5A8FA8';  // Blue — Approach (matches Precision)
  const argColor = '#5BBF85';  // Green — Around Green (matches Scrambler)
  const puttColor = '#DDA15E'; // Orange/amber — Putting (matches Touch)
  
  // Build conic-gradient stops
  const stop1 = ottPct;
  const stop2 = stop1 + appPct;
  const stop3 = stop2 + argPct;
  // stop4 = 100 (remainder is putting)
  
  container.innerHTML = `
    <div style="display: flex; align-items: center; gap: 32px; flex-wrap: wrap; justify-content: center;">
      <!-- Donut Chart -->
      <div style="position: relative; width: 180px; height: 180px; flex-shrink: 0;">
        <div style="
          width: 180px; height: 180px; border-radius: 50%;
          background: conic-gradient(
            ${ottColor} 0% ${stop1.toFixed(1)}%,
            ${appColor} ${stop1.toFixed(1)}% ${stop2.toFixed(1)}%,
            ${argColor} ${stop2.toFixed(1)}% ${stop3.toFixed(1)}%,
            ${puttColor} ${stop3.toFixed(1)}% 100%
          );
        "></div>
        <div style="
          position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
          width: 100px; height: 100px; border-radius: 50%;
          background: var(--black);
          display: flex; align-items: center; justify-content: center; flex-direction: column;
        ">
          <div style="font-size: 10px; color: rgba(250,250,250,0.4); text-transform: uppercase; letter-spacing: .08em;">Skill</div>
          <div style="font-size: 12px; color: rgba(250,250,250,0.6); font-weight: 500;">Profile</div>
        </div>
      </div>
      <!-- Legend -->
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 12px; height: 12px; border-radius: 3px; background: ${ottColor}; flex-shrink: 0;"></div>
          <span style="font-size: 13px; color: rgba(250,250,250,0.7); min-width: 100px;">Off-the-Tee</span>
          <span style="font-size: 13px; font-weight: 600; color: rgba(250,250,250,0.9);">${ottPct.toFixed(1)}%</span>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 12px; height: 12px; border-radius: 3px; background: ${appColor}; flex-shrink: 0;"></div>
          <span style="font-size: 13px; color: rgba(250,250,250,0.7); min-width: 100px;">Approach</span>
          <span style="font-size: 13px; font-weight: 600; color: rgba(250,250,250,0.9);">${appPct.toFixed(1)}%</span>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 12px; height: 12px; border-radius: 3px; background: ${argColor}; flex-shrink: 0;"></div>
          <span style="font-size: 13px; color: rgba(250,250,250,0.7); min-width: 100px;">Around Green</span>
          <span style="font-size: 13px; font-weight: 600; color: rgba(250,250,250,0.9);">${argPct.toFixed(1)}%</span>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 12px; height: 12px; border-radius: 3px; background: ${puttColor}; flex-shrink: 0;"></div>
          <span style="font-size: 13px; color: rgba(250,250,250,0.7); min-width: 100px;">Putting</span>
          <span style="font-size: 13px; font-weight: 600; color: rgba(250,250,250,0.9);">${puttPct.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Initialize Tournament Intelligence when data is ready
 */
async function initTournamentIntelligence() {
  // Wait for global data to be available
  if (!globalPlayers || !globalPredictions) {
    setTimeout(initTournamentIntelligence, 500);
    return;
  }
  
  console.log('✓ Initializing Tournament Intelligence...');
  renderTournamentIntelligence();
}