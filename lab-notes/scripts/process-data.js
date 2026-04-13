/**
 * process-data.js
 * Pre-processes raw DataGolf JSON into a verified, human-readable summary.md
 * that Claude reads instead of raw JSON files — eliminating stat hallucination.
 *
 * Usage: node scripts/process-data.js
 * Run AFTER pull-data.js has completed successfully.
 *
 * Output: data/week-YYYY-MM-DD/summary.md
 */

const fs = require('fs');
const path = require('path');

// ─── Course weights (mirrored from api/server.js) ─────────────────────────────

const COURSE_WEIGHTS = {
  'masters tournament':                              { ott: 0.25, app: 0.30, arg: 0.25, putt: 0.20 },
  'pga championship':                                { ott: 0.25, app: 0.30, arg: 0.20, putt: 0.25 },
  'u.s. open':                                       { ott: 0.20, app: 0.35, arg: 0.25, putt: 0.20 },
  'the open championship':                           { ott: 0.30, app: 0.25, arg: 0.25, putt: 0.20 },
  'the players championship':                        { ott: 0.15, app: 0.40, arg: 0.20, putt: 0.25 },
  'genesis invitational':                            { ott: 0.25, app: 0.30, arg: 0.20, putt: 0.25 },
  'arnold palmer invitational presented by mastercard': { ott: 0.20, app: 0.35, arg: 0.20, putt: 0.25 },
  'the memorial tournament presented by workday':    { ott: 0.25, app: 0.30, arg: 0.20, putt: 0.25 },
  'wm phoenix open':                                 { ott: 0.20, app: 0.35, arg: 0.20, putt: 0.25 },
  'rbc heritage':                                    { ott: 0.15, app: 0.35, arg: 0.25, putt: 0.25 },
  'at&t pebble beach pro-am':                        { ott: 0.20, app: 0.35, arg: 0.25, putt: 0.20 },
  'travelers championship':                          { ott: 0.20, app: 0.30, arg: 0.20, putt: 0.30 },
  'rocket mortgage classic':                         { ott: 0.25, app: 0.25, arg: 0.20, putt: 0.30 },
  'the sentry':                                      { ott: 0.25, app: 0.25, arg: 0.25, putt: 0.25 },
  'farmers insurance open':                          { ott: 0.30, app: 0.25, arg: 0.20, putt: 0.25 },
  '_default':                                        { ott: 0.25, app: 0.25, arg: 0.25, putt: 0.25 },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadJSON(folder, filename) {
  const filepath = path.join(folder, filename);
  if (!fs.existsSync(filepath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (e) {
    console.error(`  ERROR reading ${filename}: ${e.message}`);
    return null;
  }
}

function fmt(n, decimals = 2) {
  if (n == null || isNaN(n)) return 'N/A';
  const val = parseFloat(n);
  const sign = val > 0 ? '+' : '';
  return sign + val.toFixed(decimals);
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return 'N/A';
  return (parseFloat(n) * 100).toFixed(1) + '%';
}

function americanOdds(decimal) {
  // DataGolf returns american odds as strings like "+450" or "-120"
  return decimal != null ? String(decimal) : 'N/A';
}

function getLatestFolder() {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    console.error('ERROR: data/ folder not found. Run pull-data.js first.');
    process.exit(1);
  }
  const weeks = fs.readdirSync(dataDir)
    .filter(d => d.startsWith('week-'))
    .sort()
    .reverse();
  if (weeks.length === 0) {
    console.error('ERROR: No week folders found. Run pull-data.js first.');
    process.exit(1);
  }
  return path.join(dataDir, weeks[0]);
}

// ─── Course fit calculation ───────────────────────────────────────────────────

function calcCourseFit(players, weights, fieldDgIds) {
  const fieldSet = new Set(fieldDgIds);
  const inField = players.filter(p => fieldSet.has(p.dg_id));

  const scored = inField.map(p => {
    const raw =
      (p.sg_ott  || 0) * weights.ott  +
      (p.sg_app  || 0) * weights.app  +
      (p.sg_arg  || 0) * weights.arg  +
      (p.sg_putt || 0) * weights.putt;
    return { ...p, raw_fit: raw };
  });

  // Normalize to 0–100
  const scores = scored.map(p => p.raw_fit);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;

  return scored
    .map(p => ({ ...p, fit_score: ((p.raw_fit - min) / range) * 100 }))
    .sort((a, b) => b.fit_score - a.fit_score);
}

// ─── Best odds across books ───────────────────────────────────────────────────

function bestOdds(oddsEntry, books) {
  // For favorites (negative odds), best = closest to 0 (least negative)
  // For longshots (positive odds), best = highest number
  let best = null;
  let bestBook = null;
  for (const book of books) {
    const val = oddsEntry[book];
    if (val == null || val === 'N/A') continue;
    const num = parseInt(val, 10);
    if (isNaN(num)) continue;
    if (best === null) { best = num; bestBook = book; continue; }
    // Higher is always better for bettors (less vig on favorites, more payout on dogs)
    if (num > best) { best = num; bestBook = book; }
  }
  return best !== null ? { odds: (best > 0 ? '+' : '') + best, book: bestBook } : { odds: 'N/A', book: null };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function processData() {
  console.log('\n=== Divot Lab — Data Processor ===');
  console.log(`Date: ${new Date().toDateString()}\n`);

  const folder = getLatestFolder();
  console.log(`Reading from: ${folder}\n`);

  // Load all files
  const meta         = loadJSON(folder, 'meta.json');
  const field        = loadJSON(folder, 'field.json');
  const skillRatings = loadJSON(folder, 'skill-ratings.json');
  const preTournament = loadJSON(folder, 'pre-tournament.json');
  const decomp       = loadJSON(folder, 'player-decompositions.json');
  const rankings     = loadJSON(folder, 'rankings.json');
  const approachSkill = loadJSON(folder, 'approach-skill.json');
  const oddsWin      = loadJSON(folder, 'betting-odds-win.json');
  const oddsTop5     = loadJSON(folder, 'betting-odds-top5.json');
  const oddsTop10    = loadJSON(folder, 'betting-odds-top10.json');
  const oddsTop20    = loadJSON(folder, 'betting-odds-top20.json');
  const lastWeek     = loadJSON(folder, 'last-week-results.json');
  const schedule     = loadJSON(folder, 'schedule.json');

  // ── Event info ──────────────────────────────────────────────────────────────
  const eventName = field ? field.event_name : (meta && meta.upcoming_event ? meta.upcoming_event.event_name : 'Unknown Event');
  const courseName = field ? field.course_name : 'Unknown Course';
  const dateStart  = field ? field.date_start  : '';
  const dateEnd    = field ? field.date_end    : '';

  // ── Course weights ───────────────────────────────────────────────────────────
  const weightKey = Object.keys(COURSE_WEIGHTS).find(k => eventName.toLowerCase().includes(k)) || '_default';
  const weights = COURSE_WEIGHTS[weightKey];
  const isDefaultWeights = weightKey === '_default';

  // ── Field IDs ────────────────────────────────────────────────────────────────
  const fieldPlayers = field ? (field.field || []) : [];
  const fieldDgIds   = new Set(fieldPlayers.map(p => p.dg_id));
  const fieldCount   = fieldPlayers.length;

  // ── Skill ratings indexed ────────────────────────────────────────────────────
  const skillMap = {};
  if (skillRatings && skillRatings.players) {
    skillRatings.players.forEach(p => { skillMap[p.dg_id] = p; });
  }

  // ── Pre-tournament win probabilities indexed ─────────────────────────────────
  const ptMap = {};
  if (preTournament && preTournament.baseline) {
    preTournament.baseline.forEach(p => { ptMap[p.dg_id] = p; });
  }

  // ── Rankings indexed ─────────────────────────────────────────────────────────
  const rankMap = {};
  if (rankings && rankings.rankings) {
    rankings.rankings.forEach(p => { rankMap[p.dg_id] = p; });
  }

  // ── Odds indexed by dg_id ────────────────────────────────────────────────────
  const oddsBooks = oddsWin ? (oddsWin.books_offering || []) : [];
  const oddsWinMap = {}, oddsTop5Map = {}, oddsTop10Map = {}, oddsTop20Map = {};
  if (oddsWin && oddsWin.odds)   oddsWin.odds.forEach(o   => { oddsWinMap[o.dg_id]   = o; });
  if (oddsTop5 && oddsTop5.odds) oddsTop5.odds.forEach(o  => { oddsTop5Map[o.dg_id]  = o; });
  if (oddsTop10 && oddsTop10.odds) oddsTop10.odds.forEach(o => { oddsTop10Map[o.dg_id] = o; });
  if (oddsTop20 && oddsTop20.odds) oddsTop20.odds.forEach(o => { oddsTop20Map[o.dg_id] = o; });

  // ── Course fit scores ────────────────────────────────────────────────────────
  const skillPlayers = skillRatings ? skillRatings.players : [];
  const fitRanked = calcCourseFit(skillPlayers, weights, [...fieldDgIds]);

  // ── DG model predictions (win%) for field, ranked ────────────────────────────
  const ptRanked = preTournament && preTournament.baseline
    ? preTournament.baseline
        .filter(p => fieldDgIds.has(p.dg_id))
        .sort((a, b) => b.win - a.win)
    : [];

  // ── Value plays: model win% vs implied odds ───────────────────────────────────
  // implied probability from American odds
  function impliedProb(americanStr) {
    if (!americanStr || americanStr === 'N/A') return null;
    const n = parseInt(americanStr, 10);
    if (isNaN(n)) return null;
    return n < 0 ? (-n) / (-n + 100) : 100 / (n + 100);
  }

  const valuePlays = [];
  ptRanked.forEach(p => {
    const winEntry = oddsWinMap[p.dg_id];
    if (!winEntry) return;
    const { odds: bestOddsStr } = bestOdds(winEntry, oddsBooks);
    const implied = impliedProb(bestOddsStr.replace('+',''));
    if (!implied) return;
    const modelProb = p.win;
    const edge = modelProb - implied;
    if (edge > 0.005) { // model thinks they're at least 0.5% more likely than the market
      valuePlays.push({ ...p, implied_pct: implied, model_pct: modelProb, edge, best_odds: bestOddsStr });
    }
  });
  valuePlays.sort((a, b) => b.edge - a.edge);

  // ── Overrated: market shorter than model ─────────────────────────────────────
  const overrated = [];
  ptRanked.forEach(p => {
    const winEntry = oddsWinMap[p.dg_id];
    if (!winEntry) return;
    const { odds: bestOddsStr } = bestOdds(winEntry, oddsBooks);
    const implied = impliedProb(bestOddsStr.replace('+',''));
    if (!implied) return;
    const edge = p.win - implied;
    if (edge < -0.01) {
      overrated.push({ ...p, implied_pct: implied, model_pct: p.win, edge, best_odds: bestOddsStr });
    }
  });
  overrated.sort((a, b) => a.edge - b.edge);

  // ── Field SG averages (for stat context) ─────────────────────────────────────
  const fieldSkills = [...fieldDgIds]
    .map(id => skillMap[id])
    .filter(Boolean);
  const avg = (arr, key) => arr.length ? arr.reduce((s, p) => s + (p[key] || 0), 0) / arr.length : 0;
  const fieldAvgSgOtt  = avg(fieldSkills, 'sg_ott');
  const fieldAvgSgApp  = avg(fieldSkills, 'sg_app');
  const fieldAvgSgArg  = avg(fieldSkills, 'sg_arg');
  const fieldAvgSgPutt = avg(fieldSkills, 'sg_putt');
  const fieldAvgTotal  = avg(fieldSkills, 'sg_total');

  // ── Elite tier counts ─────────────────────────────────────────────────────────
  const eliteCount   = fieldSkills.filter(p => p.sg_total >= 1.5).length;
  const strongCount  = fieldSkills.filter(p => p.sg_total >= 1.0 && p.sg_total < 1.5).length;
  const fieldStrengthRating = Math.min(10, Math.max(0,
    (fieldAvgTotal * 2) + (eliteCount * 0.3) + (strongCount * 0.1)
  )).toFixed(1);

  // ── Last week results ─────────────────────────────────────────────────────────
  let lastWeekLines = [];
  if (lastWeek && lastWeek.baseline) {
    const finished = lastWeek.baseline
      .filter(p => p.fin_text && p.fin_text !== 'CUT' && p.fin_text !== 'WD' && p.fin_text !== 'DQ')
      .sort((a, b) => (parseInt(a.fin_text) || 99) - (parseInt(b.fin_text) || 99))
      .slice(0, 10);
    lastWeekLines = finished.map(p =>
      `  ${(p.fin_text || '?').padEnd(4)} ${p.player_name.padEnd(25)} Model win%: ${fmtPct(p.win)}`
    );
  }

  // ─── Build summary.md ────────────────────────────────────────────────────────
  const lines = [];

  lines.push(`# Lab Notes Data Summary`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Source folder: ${path.basename(folder)}`);
  lines.push(``);

  // ── EVENT ──────────────────────────────────────────────────────────────────
  lines.push(`## EVENT`);
  lines.push(`Event: ${eventName}`);
  lines.push(`Course: ${courseName}`);
  lines.push(`Dates: ${dateStart} – ${dateEnd}`);
  lines.push(`Field size: ${fieldCount} players`);
  lines.push(``);

  // ── COURSE FIT WEIGHTS ─────────────────────────────────────────────────────
  lines.push(`## COURSE-FIT WEIGHTS`);
  if (isDefaultWeights) {
    lines.push(`⚠️  No specific weights found for "${eventName}" — using balanced defaults.`);
    lines.push(`   Add this event to COURSE_WEIGHTS in api/server.js and process-data.js for accuracy.`);
  } else {
    lines.push(`Matched to: "${weightKey}"`);
  }
  lines.push(`  Off-the-Tee (OTT): ${(weights.ott * 100).toFixed(0)}%`);
  lines.push(`  Approach (APP):     ${(weights.app * 100).toFixed(0)}%`);
  lines.push(`  Around-Green (ARG): ${(weights.arg * 100).toFixed(0)}%`);
  lines.push(`  Putting (PUTT):     ${(weights.putt * 100).toFixed(0)}%`);
  lines.push(``);

  // ── FIELD STRENGTH ─────────────────────────────────────────────────────────
  lines.push(`## FIELD STRENGTH`);
  lines.push(`Field Strength Rating: ${fieldStrengthRating}/10`);
  lines.push(`Elite tier (SG Total ≥ 1.5): ${eliteCount} players`);
  lines.push(`Strong tier (SG Total 1.0–1.5): ${strongCount} players`);
  lines.push(`Field averages (SG vs. field per round):`);
  lines.push(`  OTT:   ${fmt(fieldAvgSgOtt)}`);
  lines.push(`  APP:   ${fmt(fieldAvgSgApp)}`);
  lines.push(`  ARG:   ${fmt(fieldAvgSgArg)}`);
  lines.push(`  PUTT:  ${fmt(fieldAvgSgPutt)}`);
  lines.push(`  TOTAL: ${fmt(fieldAvgTotal)}`);
  lines.push(``);

  // ── TOP 20 COURSE-FIT SCORES ───────────────────────────────────────────────
  lines.push(`## COURSE-FIT SCORES (Top 20 in field)`);
  lines.push(`Formula: (sg_ott × ${weights.ott}) + (sg_app × ${weights.app}) + (sg_arg × ${weights.arg}) + (sg_putt × ${weights.putt}), normalized 0–100`);
  lines.push(``);
  lines.push(`Rank | Player                   | Fit   | OTT    | APP    | ARG    | PUTT   | Total  | DG Rank`);
  lines.push(`-----|--------------------------|-------|--------|--------|--------|--------|--------|--------`);
  fitRanked.slice(0, 20).forEach((p, i) => {
    const r = rankMap[p.dg_id];
    const dgRank = r ? r.datagolf_rank : '?';
    lines.push(
      `${String(i + 1).padStart(4)} | ${p.player_name.padEnd(24)} | ${p.fit_score.toFixed(1).padStart(5)} | ${fmt(p.sg_ott).padStart(6)} | ${fmt(p.sg_app).padStart(6)} | ${fmt(p.sg_arg).padStart(6)} | ${fmt(p.sg_putt).padStart(6)} | ${fmt(p.sg_total).padStart(6)} | ${String(dgRank).padStart(7)}`
    );
  });
  lines.push(``);

  // ── DG MODEL WIN PROBABILITIES (Top 20) ───────────────────────────────────
  lines.push(`## DG MODEL WIN PROBABILITIES (Top 20 in field)`);
  lines.push(`Source: pre-tournament.json baseline model`);
  lines.push(``);
  lines.push(`Rank | Player                   | Win%    | Top5%   | Top10%  | Top20%  | MakeCut%`);
  lines.push(`-----|--------------------------|---------|---------|---------|---------|----------`);
  ptRanked.slice(0, 20).forEach((p, i) => {
    lines.push(
      `${String(i + 1).padStart(4)} | ${p.player_name.padEnd(24)} | ${fmtPct(p.win).padStart(7)} | ${fmtPct(p.top_5).padStart(7)} | ${fmtPct(p.top_10).padStart(7)} | ${fmtPct(p.top_20).padStart(7)} | ${fmtPct(p.make_cut).padStart(8)}`
    );
  });
  lines.push(``);

  // ── BEST BETTING ODDS (Top 15 favorites by model) ────────────────────────
  lines.push(`## BEST AVAILABLE ODDS (Top 15 by DG model, best line across books)`);
  lines.push(`Books checked: ${oddsBooks.slice(0, 8).join(', ')}${oddsBooks.length > 8 ? '...' : ''}`);
  lines.push(``);
  lines.push(`Player                   | Win (best/book)     | Top5              | Top10             | Top20`);
  lines.push(`-------------------------|---------------------|-------------------|-------------------|-------------------`);
  ptRanked.slice(0, 15).forEach(p => {
    const w  = oddsWinMap[p.dg_id]   ? bestOdds(oddsWinMap[p.dg_id],   oddsBooks) : { odds: 'N/A', book: null };
    const t5 = oddsTop5Map[p.dg_id]  ? bestOdds(oddsTop5Map[p.dg_id],  oddsBooks) : { odds: 'N/A', book: null };
    const t10= oddsTop10Map[p.dg_id] ? bestOdds(oddsTop10Map[p.dg_id], oddsBooks) : { odds: 'N/A', book: null };
    const t20= oddsTop20Map[p.dg_id] ? bestOdds(oddsTop20Map[p.dg_id], oddsBooks) : { odds: 'N/A', book: null };
    const wStr  = w.book  ? `${w.odds} (${w.book})`   : w.odds;
    const t5Str = t5.book ? `${t5.odds} (${t5.book})` : t5.odds;
    const t10Str= t10.book? `${t10.odds} (${t10.book})`:'N/A';
    const t20Str= t20.book? `${t20.odds} (${t20.book})`:'N/A';
    lines.push(`${p.player_name.padEnd(25)}| ${wStr.padEnd(21)}| ${t5Str.padEnd(19)}| ${t10Str.padEnd(19)}| ${t20Str}`);
  });
  lines.push(``);

  // ── VALUE FLAGS ────────────────────────────────────────────────────────────
  lines.push(`## VALUE FLAGS (model win% > market implied probability)`);
  lines.push(`These players are priced longer than the DG model suggests they should be.`);
  lines.push(`Use as starting point for overrated/underrated section and picks analysis.`);
  lines.push(``);
  if (valuePlays.length === 0) {
    lines.push(`No significant value plays found this week (market aligned with model).`);
  } else {
    lines.push(`Player                   | Best Win Odds | Model Win% | Market Implied | Edge`);
    lines.push(`-------------------------|---------------|------------|----------------|------`);
    valuePlays.slice(0, 10).forEach(p => {
      lines.push(
        `${p.player_name.padEnd(25)}| ${p.best_odds.padEnd(15)}| ${fmtPct(p.model_pct).padEnd(12)}| ${fmtPct(p.implied_pct).padEnd(16)}| +${(p.edge * 100).toFixed(1)}%`
      );
    });
  }
  lines.push(``);

  // ── OVERRATED FLAGS ────────────────────────────────────────────────────────
  lines.push(`## OVERRATED FLAGS (market implied probability > model win%)`);
  lines.push(`These players are priced shorter than the model suggests.`);
  lines.push(``);
  if (overrated.length === 0) {
    lines.push(`No significant overrated plays flagged this week.`);
  } else {
    lines.push(`Player                   | Best Win Odds | Model Win% | Market Implied | Edge`);
    lines.push(`-------------------------|---------------|------------|----------------|------`);
    overrated.slice(0, 5).forEach(p => {
      lines.push(
        `${p.player_name.padEnd(25)}| ${p.best_odds.padEnd(15)}| ${fmtPct(p.model_pct).padEnd(12)}| ${fmtPct(p.implied_pct).padEnd(16)}| ${(p.edge * 100).toFixed(1)}%`
      );
    });
  }
  lines.push(``);

  // ── PLAYERS TO WATCH CANDIDATES ────────────────────────────────────────────
  lines.push(`## PLAYERS TO WATCH — CANDIDATES`);
  lines.push(`Top 5 by course fit with their full SG profile and model probability.`);
  lines.push(`Pick 3 for the newsletter — look for interesting angles (course history, form, value).`);
  lines.push(``);
  fitRanked.slice(0, 5).forEach((p, i) => {
    const pt = ptMap[p.dg_id];
    const r  = rankMap[p.dg_id];
    const w  = oddsWinMap[p.dg_id] ? bestOdds(oddsWinMap[p.dg_id], oddsBooks) : { odds: 'N/A', book: null };
    lines.push(`### ${i + 1}. ${p.player_name}`);
    lines.push(`Course-Fit Score: ${p.fit_score.toFixed(1)} / 100`);
    lines.push(`DG Rank: ${r ? r.datagolf_rank : 'N/A'}  |  SG Total: ${fmt(p.sg_total)}`);
    lines.push(`SG Off-the-Tee: ${fmt(p.sg_ott)}  |  SG Approach: ${fmt(p.sg_app)}  |  SG Around-Green: ${fmt(p.sg_arg)}  |  SG Putting: ${fmt(p.sg_putt)}`);
    if (pt) {
      lines.push(`Model: Win ${fmtPct(pt.win)}  |  Top5 ${fmtPct(pt.top_5)}  |  Top10 ${fmtPct(pt.top_10)}  |  MakeCut ${fmtPct(pt.make_cut)}`);
    }
    lines.push(`Best win odds: ${w.odds}${w.book ? ' (' + w.book + ')' : ''}`);
    lines.push(``);
  });

  // ── STAT OF THE WEEK CANDIDATES ────────────────────────────────────────────
  lines.push(`## STAT OF THE WEEK — CANDIDATES`);
  lines.push(`Three verified numbers worth highlighting. Pick the most interesting one.`);
  lines.push(``);

  // Candidate 1: top course-fit player's dominant SG category
  if (fitRanked.length > 0) {
    const top = fitRanked[0];
    const dominantCat = ['sg_ott','sg_app','sg_arg','sg_putt'].reduce((best, cat) =>
      (top[cat] || 0) > (top[best] || 0) ? cat : best, 'sg_ott');
    const catLabel = { sg_ott: 'SG: Off-the-Tee', sg_app: 'SG: Approach', sg_arg: 'SG: Around-Green', sg_putt: 'SG: Putting' }[dominantCat];
    lines.push(`**Candidate 1:** ${top.player_name} leads the field in ${catLabel} at ${fmt(top[dominantCat])} strokes gained per round.`);
    lines.push(`  Course weight for this category: ${(weights[dominantCat.replace('sg_','').replace('-','')]  * 100 || 0).toFixed(0)}%`);
    lines.push(``);
  }

  // Candidate 2: field average SG approach vs tour average context
  lines.push(`**Candidate 2:** Field average SG: Approach = ${fmt(fieldAvgSgApp)} strokes gained per round.`);
  lines.push(`  This week's course weight on approach: ${(weights.app * 100).toFixed(0)}%. ${weights.app >= 0.35 ? 'Iron play is the primary separator this week.' : 'Approach is one factor among several.'}`);
  lines.push(``);

  // Candidate 3: win probability spread (top vs 5th)
  if (ptRanked.length >= 5) {
    const spread = ((ptRanked[0].win - ptRanked[4].win) * 100).toFixed(1);
    lines.push(`**Candidate 3:** Model win probability spread between #1 (${ptRanked[0].player_name}, ${fmtPct(ptRanked[0].win)}) and #5 (${ptRanked[4].player_name}, ${fmtPct(ptRanked[4].win)}): ${spread} percentage points.`);
    lines.push(`  ${parseFloat(spread) > 5 ? 'Wide spread — dominated field, clearer favorite.' : 'Tight spread — wide-open week with multiple contenders.'}`);
    lines.push(``);
  }

  // ── LAST WEEK RESULTS ──────────────────────────────────────────────────────
  lines.push(`## LAST WEEK RESULTS`);
  if (lastWeek) {
    lines.push(`Event: ${lastWeek.event_name || 'Unknown'}`);
    lines.push(``);
    if (lastWeekLines.length > 0) {
      lines.push(`Top 10 finishers:`);
      lines.push(`  Pos  Player                    Model Win% (pre-tournament)`);
      lastWeekLines.forEach(l => lines.push(l));
    } else {
      lines.push(`⚠️  No finishing position data found in last-week-results.json.`);
      lines.push(`   The file exists but may be a predictions archive without fin_text fields.`);
      lines.push(`   [VERIFY manually if needed for the recap section]`);
    }
  } else {
    lines.push(`⚠️  last-week-results.json not found.`);
    lines.push(`   Either pull-data.js could not determine last week's event, or the file is missing.`);
    lines.push(`   [VERIFY last week's results manually before writing the recap section]`);
  }
  lines.push(``);

  // ── DATA GAPS ──────────────────────────────────────────────────────────────
  lines.push(`## DATA GAPS & WARNINGS`);
  const gaps = [];
  if (!field)         gaps.push('field.json missing — cannot confirm field composition');
  if (!skillRatings)  gaps.push('skill-ratings.json missing — course-fit scores unavailable');
  if (!preTournament) gaps.push('pre-tournament.json missing — model probabilities unavailable');
  if (!oddsWin)       gaps.push('betting-odds-win.json missing — outright odds unavailable');
  if (!oddsTop10)     gaps.push('betting-odds-top10.json missing');
  if (!lastWeek)      gaps.push('last-week-results.json missing — recap section needs manual data');
  if (isDefaultWeights) gaps.push(`No course weights for "${eventName}" — add to COURSE_WEIGHTS in both process-data.js and api/server.js`);

  if (gaps.length === 0) {
    lines.push(`No data gaps. All files loaded successfully.`);
  } else {
    gaps.forEach(g => lines.push(`⚠️  ${g}`));
  }
  lines.push(``);

  lines.push(`---`);
  lines.push(`END OF SUMMARY — All numbers above are verified from DataGolf API data.`);
  lines.push(`Do not use any statistic in the newsletter that does not appear in this file.`);

  // ── Write output ────────────────────────────────────────────────────────────
  const outputPath = path.join(folder, 'summary.md');
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');
  console.log(`\n✓ summary.md written to: ${outputPath}`);
  console.log(`  Lines: ${lines.length}`);
  console.log(`\nNext step: open Claude Code in lab-notes/ and run your Monday newsletter prompt.`);
  console.log(`Claude will read summary.md — every number it uses will be traceable to DataGolf data.\n`);
}

processData();
