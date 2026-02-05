// lab-data.js

const API_BASE_URL = 'https://divotlab-api.vercel.app/api';

let globalTournamentInfo = {
  event_name: null,
  course: null,
  label: null, // 'UPCOMING' | 'LIVE' | null
  start_date: null,
};

let globalSchedule = [];
let globalFieldData = null;
let globalPlayers = [];
let globalPredictionsPre = [];
let globalPredictionsLive = [];

// ---------- Utilities ----------

function parseISODate(d) {
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function getTournamentState(fieldData) {
  const r = fieldData?.current_round;
  if (r == null || r === 0) return 'pre';
  if (r >= 1 && r <= 4) return 'live';
  return 'post';
}

async function safeJson(res) {
  if (!res || !res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// ---------- Schedule + banner logic ----------

function selectScheduleEvent(schedule, fieldEventName) {
  const events = schedule || [];
  if (!events.length) return null;

  const now = new Date();

  // Try to match current field event first
  let current = null;
  if (fieldEventName) {
    current = events.find(e => e.event_name === fieldEventName) || null;
  }

  if (current) {
    const start = parseISODate(current.start_date);
    // Assume 4‑day event (Thu–Sun)
    const end = start ? addDays(start, 3) : null;
    const cutoff = end ? addDays(end, 1) : null; // 1 day after end

    if (start && now < start) {
      // Upcoming current event
      return current;
    }

    if (start && end && now >= start && now <= end) {
      // Live current event
      return current;
    }

    if (cutoff && now <= cutoff) {
      // Within 1 day after end → still show this event
      return current;
    }

    // Otherwise, fall through to "next event" logic
  }

  // Find the next event whose start_date is >= now
  const upcoming = events
    .map(e => ({ e, start: parseISODate(e.start_date) }))
    .filter(x => x.start)
    .sort((a, b) => a.start - b.start);

  const next = upcoming.find(x => x.start >= now);
  if (next) return next.e;

  // If no future events, fall back to the last one in the schedule
  return events[events.length - 1];
}

function computeBannerLabel(selectedEvent, fieldData) {
  if (!selectedEvent) return null;

  const start = parseISODate(selectedEvent.start_date);
  const now = new Date();
  const stateFromField = getTournamentState(fieldData);

  if (start && now < start) return 'UPCOMING';
  if (stateFromField === 'live') return 'LIVE';
  return null;
}

function updateGlobalTournamentInfo(selectedEvent, fieldData) {
  if (!selectedEvent) return;

  globalTournamentInfo.event_name = selectedEvent.event_name || null;
  globalTournamentInfo.course = selectedEvent.course || null;
  globalTournamentInfo.start_date = selectedEvent.start_date || null;
  globalTournamentInfo.label = computeBannerLabel(selectedEvent, fieldData);
}

function renderTournamentBanner() {
  const c = document.getElementById('tournament-banner');
  if (!c) return;

  const { event_name, course, label } = globalTournamentInfo;
  if (!event_name) {
    c.innerHTML = '';
    return;
  }

  const labelHtml = label
    ? `<div class="banner-label">${label}</div>`
    : `<div class="banner-label">This Week</div>`;

  c.innerHTML = `
    <div class="banner-inner" style="padding:40px 48px;">
      ${labelHtml}
      <h2 class="banner-title" style="font-size:clamp(28px,4vw,42px);">${event_name}</h2>
      ${course ? `<div class="banner-course">${course}</div>` : ''}
    </div>
  `;
}

// ---------- Field strength ----------

function calculateFieldStrength(players) {
  if (!players || !players.length) {
    return { rating: '0.0', label: 'Weak', eliteCount: 0, topTier: 0 };
  }

  // If SG data exists, use it; otherwise everything will gracefully fall back to 0
  const sgTotals = players.map(p => p.sg_total || 0);
  const avg = sgTotals.reduce((s, v) => s + v, 0) / sgTotals.length;

  const eliteCount = players.filter(p => (p.sg_total || 0) >= 1.5).length;
  const topTier = players.filter(p => (p.sg_total || 0) >= 1.0).length;

  // Map average SG to 0–10
  const ratingRaw = Math.max(0, Math.min(10, (avg + 1.5) * 3));
  const rating = ratingRaw.toFixed(1);

  let label = 'Moderate';
  if (ratingRaw >= 8) label = 'Elite';
  else if (ratingRaw >= 6) label = 'Strong';
  else if (ratingRaw <= 3) label = 'Weak';

  return { rating, label, eliteCount, topTier };
}

function renderFieldStrength() {
  const container = document.getElementById('field-strength');
  if (!container) return;

  if (!globalPlayers.length) {
    container.innerHTML = '<div class="loading-msg">No field data available</div>';
    return;
  }

  const field = calculateFieldStrength(globalPlayers);
  const pct = (parseFloat(field.rating) / 10) * 100;

  const avgSG = (
    globalPlayers.reduce((s, p) => s + (p.sg_total || 0), 0) / globalPlayers.length
  ).toFixed(2);

  const sortedBySG = [...globalPlayers].sort(
    (a, b) => (b.sg_total || 0) - (a.sg_total || 0)
  );
  const top20 = sortedBySG.slice(0, Math.min(20, sortedBySG.length));
  const top20Avg = top20.length
    ? (
        top20.reduce((s, p) => s + (p.sg_total || 0), 0) / top20.length
      ).toFixed(2)
    : '0.00';

  container.innerHTML = `
    <div class="strength-card">
      <div class="strength-header">
        <span class="strength-label">Field Strength</span>
        <span class="strength-value" style="font-size:26px;">
          ${field.rating}<span class="strength-max">/10</span>
        </span>
      </div>
      <div class="strength-bar">
        <div class="strength-fill" style="width:${pct}%;"></div>
      </div>
      <div class="strength-rating">${field.label}</div>
      <div class="strength-details" style="justify-content:center;text-align:center;">
        <div class="strength-stat">
          <span class="stat-num">${field.eliteCount}</span>
          <span class="stat-text">Elite (SG 1.5+)</span>
        </div>
        <div class="strength-stat">
          <span class="stat-num">${field.topTier}</span>
          <span class="stat-text">Top Tier (SG 1.0+)</span>
        </div>
      </div>
    </div>

    <div class="strength-grid">
      <div class="mini-strength-card">
        <div class="mini-label">Avg SG Total</div>
        <div class="mini-value">${avgSG}</div>
        <div class="mini-sub">Entire Field</div>
      </div>

      <div class="mini-strength-card">
        <div class="mini-label">Top 20 Avg</div>
        <div class="mini-value">${top20Avg}</div>
        <div class="mini-sub">Strongest Players</div>
      </div>

      <div class="mini-strength-card">
        <div class="mini-label">Field Size</div>
        <div class="mini-value">${globalPlayers.length}</div>
        <div class="mini-sub">Players</div>
      </div>
    </div>
  `;
}

// ---------- Predictions (with toggle) ----------

function normalizePrePredictions(json) {
  if (!json || !json.data) return [];
  const arr = json.data.baseline || [];
  return Array.isArray(arr) ? arr : [];
}

function normalizeLivePredictions(json) {
  if (!json || !json.data) return [];
  const arr = json.data.data || [];
  return Array.isArray(arr) ? arr : [];
}

function renderPredictionsTable(preds, label) {
  const container = document.getElementById('predictions-table');
  if (!container) return;

  if (!preds || !preds.length) {
    container.innerHTML = '<div class="loading-msg">No predictions available</div>';
    return;
  }

  const rows = preds
    .map((p, i) => {
      const name = p.player_name || p.name || 'Unknown';
      const win = (p.win || 0) * 100;
      const top10 = (p.top_10 || 0) * 100;
      return `
        <tr>
          <td>${i + 1}</td>
          <td>${name}</td>
          <td>${win.toFixed(1)}%</td>
          <td>${top10.toFixed(1)}%</td>
        </tr>
      `;
    })
    .join('');

  container.innerHTML = `
    <div class="predictions-header">
      <div class="predictions-title">${label}</div>
      <div id="predictions-toggle" class="predictions-toggle"></div>
    </div>
    <table class="predictions-table-inner">
      <thead>
        <tr>
          <th>#</th>
          <th>Player</th>
          <th>Win</th>
          <th>Top 10</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function attachPredictionsToggle(state) {
  const toggle = document.getElementById('predictions-toggle');
  if (!toggle) return;

  if (state !== 'live' || !globalPredictionsPre.length || !globalPredictionsLive.length) {
    toggle.textContent = '';
    return;
  }

  let showing = 'live'; // default

  function updateToggle() {
    if (showing === 'live') {
      toggle.textContent = 'View Pre‑Tournament Predictions';
    } else {
      toggle.textContent = 'View Live Predictions';
    }
  }

  updateToggle();

  toggle.onclick = () => {
    showing = showing === 'live' ? 'pre' : 'live';
    if (showing === 'live') {
      renderPredictionsTable(globalPredictionsLive.slice(0, 25), 'Live Predictions');
    } else {
      renderPredictionsTable(globalPredictionsPre.slice(0, 25), 'Pre‑Tournament Predictions');
    }
    updateToggle();
  };
}

function renderPredictions() {
  const container = document.getElementById('predictions-table');
  if (!container) return;

  const state = getTournamentState(globalFieldData);

  if (state === 'pre') {
    renderPredictionsTable(globalPredictionsPre.slice(0, 25), 'Pre‑Tournament Predictions');
    attachPredictionsToggle(state);
    return;
  }

  if (state === 'live') {
    renderPredictionsTable(globalPredictionsLive.slice(0, 25), 'Live Predictions');
    attachPredictionsToggle(state);
    return;
  }

  // Post‑tournament: show live predictions if available, else pre
  if (globalPredictionsLive.length) {
    renderPredictionsTable(globalPredictionsLive.slice(0, 25), 'Live Predictions');
  } else {
    renderPredictionsTable(globalPredictionsPre.slice(0, 25), 'Pre‑Tournament Predictions');
  }
  attachPredictionsToggle(state);
}

// ---------- Canvas helper ----------

function setupCanvas(canvas, width, height) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, dpr };
}

// ---------- Charts ----------

// Skills radar (top 5 players)
function renderSkillsRadar() {
  const canvas = document.getElementById('skills-radar');
  if (!canvas || !globalPlayers.length) return;

  const { ctx } = setupCanvas(canvas, 460, 280);

  const sorted = [...globalPlayers].sort(
    (a, b) => (b.sg_total || 0) - (a.sg_total || 0)
  );
  const top5 = sorted.slice(0, Math.min(5, sorted.length));

  const metrics = ['sg_ott', 'sg_app', 'sg_arg', 'sg_putt'];
  const labels = ['Off‑Tee', 'Approach', 'Around', 'Putting'];

  const w = 460;
  const h = 280;
  const cx = w / 2;
  const cy = h / 2 + 10;
  const radius = 90;

  const maxVal = Math.max(
    1,
    ...top5.flatMap(p => metrics.map(m => Math.abs(p[m] || 0)))
  );

  ctx.clearRect(0, 0, w, h);
  ctx.save();

  // Grid
  ctx.strokeStyle = 'rgba(250,250,250,0.12)';
  for (let r = 0.25; r <= 1.0; r += 0.25) {
    ctx.beginPath();
    for (let i = 0; i < metrics.length; i++) {
      const angle = (Math.PI * 2 * i) / metrics.length - Math.PI / 2;
      const x = cx + radius * r * Math.cos(angle);
      const y = cy + radius * r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // Axes + labels
  ctx.fillStyle = 'rgba(250,250,250,0.7)';
  ctx.font = '11px "DM Sans"';
  for (let i = 0; i < metrics.length; i++) {
    const angle = (Math.PI * 2 * i) / metrics.length - Math.PI / 2;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.strokeStyle = 'rgba(250,250,250,0.12)';
    ctx.stroke();

    const lx = cx + (radius + 18) * Math.cos(angle);
    const ly = cy + (radius + 18) * Math.sin(angle);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labels[i], lx, ly);
  }

  // Player polygons
  const colors = [
    'rgba(91,191,133,0.9)',
    'rgba(91,191,133,0.6)',
    'rgba(91,191,133,0.4)',
    'rgba(91,191,133,0.25)',
    'rgba(91,191,133,0.18)',
  ];

  top5.forEach((p, idx) => {
    const color = colors[idx] || 'rgba(91,191,133,0.2)';
    ctx.beginPath();
    metrics.forEach((m, i) => {
      const val = p[m] || 0;
      const r = (Math.max(-maxVal, Math.min(maxVal, val)) / maxVal) * radius;
      const angle = (Math.PI * 2 * i) / metrics.length - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(250,250,250,0.2)';
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
  });

  // Legend with slightly wider spacing
  ctx.font = '11px "DM Sans"';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  top5.forEach((p, i) => {
    const y = 22;
    const x = 20 + i * 80;
    ctx.fillStyle = colors[i] || 'rgba(91,191,133,0.4)';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(250,250,250,0.75)';
    ctx.fillText((p.player_name || '').split(',')[0], x + 13, y);
  });

  ctx.restore();
}

// Scatter plot: Putting vs Tee‑to‑Green
function renderScatterPlot() {
  const canvas = document.getElementById('scatter-plot');
  if (!canvas || !globalPlayers.length) return;

  const { ctx, dpr } = setupCanvas(canvas, 460, 280);

  const sorted = [...globalPlayers].sort(
    (a, b) => (b.sg_total || 0) - (a.sg_total || 0)
  );
  const players = sorted.slice(0, Math.min(15, sorted.length));

  const putts = players.map(p => p.sg_putt || 0);
  const t2g = players.map(
    p => (p.sg_ott || 0) + (p.sg_app || 0) + (p.sg_arg || 0)
  );

  const minX = Math.min(-1, ...putts);
  const maxX = Math.max(1, ...putts);
  const minY = Math.min(-1, ...t2g);
  const maxY = Math.max(1, ...t2g);

  const w = 460;
  const h = 280;
  const pad = { t: 20, r: 20, b: 40, l: 40 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;

  const sx = v => pad.l + ((v - minX) / (maxX - minX || 1)) * cw;
  const sy = v => pad.t + ch - ((v - minY) / (maxY - minY || 1)) * ch;

  ctx.clearRect(0, 0, w, h);

  // Grid
  ctx.strokeStyle = 'rgba(250,250,250,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t + ch / 2);
  ctx.lineTo(pad.l + cw, pad.t + ch / 2);
  ctx.moveTo(pad.l + cw / 2, pad.t);
  ctx.lineTo(pad.l + cw / 2, pad.t + ch);
  ctx.stroke();

  // Points
  ctx.fillStyle = '#5BBF85';
  players.forEach(p => {
    const x = sx(p.sg_putt || 0);
    const y = sy(
      (p.sg_ott || 0) + (p.sg_app || 0) + (p.sg_arg || 0)
    );
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  // Axes labels (minimal)
  ctx.fillStyle = 'rgba(250,250,250,0.6)';
  ctx.font = '11px "DM Sans"';
  ctx.textAlign = 'center';
  ctx.fillText('SG: Putting', pad.l + cw / 2, h - 12);
  ctx.save();
  ctx.translate(14, pad.t + ch / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('SG: Tee‑to‑Green', 0, 0);
  ctx.restore();

  // Hover tooltip via title
  canvas.onmousemove = e => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * dpr;
    const my = (e.clientY - rect.top) * dpr;

    const hit = players.find(p => {
      const x = sx(p.sg_putt || 0) * dpr;
      const y = sy(
        (p.sg_ott || 0) + (p.sg_app || 0) + (p.sg_arg || 0)
      ) * dpr;
      return Math.hypot(mx - x, my - y) < 8 * dpr;
    });

    canvas.title = hit ? hit.player_name || '' : '';
  };
}

// Player rankings chart (top 10 by SG Total)
function renderConsistencyChart() {
  const canvas = document.getElementById('consistency-chart');
  if (!canvas || !globalPlayers.length) return;

  const { ctx } = setupCanvas(canvas, 460, 280);

  const sorted = [...globalPlayers].sort(
    (a, b) => (b.sg_total || 0) - (a.sg_total || 0)
  );
  const top10 = sorted.slice(0, Math.min(10, sorted.length));

  const w = 460;
  const h = 280;
  const pad = { t: 20, r: 20, b: 40, l: 40 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;

  const maxVal = Math.max(
    1,
    ...top10.map(p => Math.abs(p.sg_total || 0))
  );

  ctx.clearRect(0, 0, w, h);

  // Bars
  const barW = cw / (top10.length * 1.4);
  top10.forEach((p, i) => {
    const val = p.sg_total || 0;
    const x = pad.l + i * (cw / top10.length) + (cw / top10.length - barW) / 2;
    const y = pad.t + ch / 2;
    const hVal = (Math.abs(val) / maxVal) * (ch / 2);

    ctx.fillStyle = val >= 0 ? '#5BBF85' : '#8B2E2E';
    ctx.fillRect(x, val >= 0 ? y - hVal : y, barW, hVal);

    // Labels
    ctx.fillStyle = 'rgba(250,250,250,0.75)';
    ctx.font = '11px "DM Sans"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText((p.player_name || '').split(',')[0], x + barW / 2, h - 30);
  });

  // Zero line
  ctx.strokeStyle = 'rgba(250,250,250,0.2)';
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t + ch / 2);
  ctx.lineTo(pad.l + cw, pad.t + ch / 2);
  ctx.stroke();
}

// SG Breakdown chart (top 10 by SG Total, raw values, 4‑color palette)
function renderSGBreakdown() {
  const canvas = document.getElementById('sg-breakdown');
  if (!canvas || !globalPlayers.length) return;

  const { ctx } = setupCanvas(canvas, 460, 280);

  const sorted = [...globalPlayers].sort(
    (a, b) => (b.sg_total || 0) - (a.sg_total || 0)
  );
  const top10 = sorted.slice(0, Math.min(10, sorted.length));
  if (!top10.length) return;

  const avg = cat =>
    top10.reduce((s, p) => s + (p[cat] || 0), 0) / top10.length;

  const data = [
    avg('sg_putt'),
    avg('sg_app'),
    avg('sg_ott'),
    avg('sg_arg'),
  ];

  const labels = ['Putting', 'Approach', 'Off‑Tee', 'Around Green'];

  const w = 460;
  const h = 280;
  const pad = { t: 20, r: 20, b: 40, l: 40 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;

  const maxAbs = Math.max(1, ...data.map(v => Math.abs(v)));
  const max = maxAbs;
  const min = -maxAbs;

  const sx = i => pad.l + (i / (labels.length - 1)) * cw;
  const sy = v =>
    pad.t + ch - ((v - min) / (max - min || 1)) * ch;

  ctx.clearRect(0, 0, w, h);

  // Grid (horizontal zero line)
  ctx.strokeStyle = 'rgba(250,250,250,0.12)';
  ctx.lineWidth = 1;
  const yZero = sy(0);
  ctx.beginPath();
  ctx.moveTo(pad.l, yZero);
  ctx.lineTo(pad.l + cw, yZero);
  ctx.stroke();

  // Neutral line
  ctx.strokeStyle = 'rgba(250,250,250,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = sx(i);
    const y = sy(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Category colors (your palette)
  const colors = ['#2C5F7C', '#5A8FA8', '#88B3C5', '#8B2E2E'];

  // Points
  data.forEach((v, i) => {
    const x = sx(i);
    const y = sy(v);
    ctx.fillStyle = colors[i];
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  // X labels only (minimalist)
  ctx.fillStyle = 'rgba(250,250,250,0.6)';
  ctx.font = '11px "DM Sans"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  labels.forEach((l, i) => {
    ctx.fillText(l, sx(i), h - 18);
  });
}

function renderCharts() {
  renderSkillsRadar();
  renderScatterPlot();
  renderConsistencyChart();
  renderSGBreakdown();
}

// ---------- Data loading ----------

async function loadAllData() {
  try {
    const [fieldRes, preRes, liveRes, scheduleRes] = await Promise.all([
      fetch(`${API_BASE_URL}/field-updates`),
      fetch(`${API_BASE_URL}/pre-tournament`),
      fetch(`${API_BASE_URL}/live-tournament`),
      fetch(`${API_BASE_URL}/schedule`),
    ]);

    const fieldJson = await safeJson(fieldRes);
    const preJson = await safeJson(preRes);
    const liveJson = await safeJson(liveRes);
    const scheduleJson = await safeJson(scheduleRes);

    globalFieldData = fieldJson?.data || {};
    globalPlayers =
      globalFieldData.field ||
      globalFieldData.players ||
      [];

    globalPredictionsPre = normalizePrePredictions(preJson);
    globalPredictionsLive = normalizeLivePredictions(liveJson);

    globalSchedule = (scheduleJson?.data && scheduleJson.data.schedule) || [];

    const selectedEvent = selectScheduleEvent(
      globalSchedule,
      globalFieldData.event_name
    );
    updateGlobalTournamentInfo(selectedEvent, globalFieldData);

    renderTournamentBanner();
    renderFieldStrength();
    renderPredictions();
    renderCharts();
  } catch (err) {
    console.error('Error loading lab data', err);
  }
}

// ---------- Init ----------

loadAllData();
