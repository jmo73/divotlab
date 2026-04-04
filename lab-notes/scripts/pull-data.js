/**
 * pull-data.js
 * Fetches all DataGolf data needed for the weekly Lab Notes newsletter.
 * Run every Monday morning before generating the newsletter.
 *
 * Usage: node scripts/pull-data.js
 *
 * Output: data/week-YYYY-MM-DD/ folder with JSON files for each endpoint
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.DATAGOLF_API_KEY;
const BASE_URL = 'https://feeds.datagolf.com';

if (!API_KEY) {
  console.error('ERROR: DATAGOLF_API_KEY not found in lab-notes/.env');
  process.exit(1);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fetchJSON(endpoint) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${endpoint}`;
    console.log(`  Fetching: ${endpoint.split('?')[0]}`);

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${endpoint}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse error for ${endpoint}: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

function saveJSON(folder, filename, data) {
  const filepath = path.join(folder, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(`  Saved: ${filename}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Determine output folder ───────────────────────────────────────────────────

function getWeekFolder() {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
  const folder = path.join(__dirname, '..', 'data', `week-${dateStr}`);
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
  return folder;
}

// ─── Find last week's event ID ─────────────────────────────────────────────────

async function findLastWeekEventId(schedule) {
  // Find the most recently completed PGA Tour event.
  const events = schedule.schedule || schedule;

  if (!Array.isArray(events)) {
    console.warn('  WARNING: schedule format unexpected, cannot determine last week event');
    return null;
  }

  // Prefer events with status === 'completed', sorted by start_date descending
  const completedEvents = events
    .filter(e => e.status === 'completed' && (e.start_date || e.date))
    .sort((a, b) => new Date(b.start_date || b.date) - new Date(a.start_date || a.date));

  if (completedEvents.length === 0) {
    console.warn('  WARNING: No completed events found in schedule');
    return null;
  }

  const lastEvent = completedEvents[0];
  const dateStr = lastEvent.start_date || lastEvent.date;
  console.log(`  Last week's event: ${lastEvent.event_name} (ID: ${lastEvent.event_id}, ${dateStr})`);
  return { event_id: lastEvent.event_id, year: new Date(dateStr).getFullYear(), event_name: lastEvent.event_name };
}

// ─── Find current/upcoming event ──────────────────────────────────────────────

function findUpcomingEvent(schedule) {
  const today = new Date();
  const events = schedule.schedule || schedule;

  if (!Array.isArray(events)) return null;

  // Find the next event that hasn't started yet (or is in progress this week)
  const upcoming = events
    .filter(e => {
      if (!e.start_date && !e.date) return false;
      const eventDate = new Date(e.start_date || e.date);
      const daysUntil = (eventDate - today) / (1000 * 60 * 60 * 24);
      // Include events starting within next 10 days, or that started within last 4 days (in progress)
      return (daysUntil > -4 && daysUntil < 10) || e.status === 'in_progress';
    })
    .sort((a, b) => new Date(a.start_date || a.date) - new Date(b.start_date || b.date));

  if (upcoming.length === 0) return null;

  const event = upcoming[0];
  console.log(`  Upcoming event: ${event.event_name} (${event.start_date || event.date})`);
  return event;
}

// ─── Main pull function ────────────────────────────────────────────────────────

async function pullData() {
  console.log('\n=== Divot Lab — Weekly Data Pull ===');
  console.log(`Date: ${new Date().toDateString()}\n`);

  const folder = getWeekFolder();
  console.log(`Output folder: ${folder}\n`);

  const errors = [];

  // 1. Schedule — needed to figure out what event is upcoming and what was last week
  console.log('[ 1/10 ] Schedule');
  let schedule;
  try {
    schedule = await fetchJSON(`/get-schedule?tour=pga&season=2026&file_format=json&key=${API_KEY}`);
    saveJSON(folder, 'schedule.json', schedule);
  } catch (e) {
    errors.push(`schedule: ${e.message}`);
    console.error(`  ERROR: ${e.message}`);
  }
  await sleep(300);

  // Save event metadata
  if (schedule) {
    const upcomingEvent = findUpcomingEvent(schedule);
    const meta = {
      pulled_at: new Date().toISOString(),
      upcoming_event: upcomingEvent,
    };
    saveJSON(folder, 'meta.json', meta);
  }

  // 2. Field updates — who's playing this week
  console.log('\n[ 2/10 ] Field Updates');
  try {
    const field = await fetchJSON(`/field-updates?tour=pga&file_format=json&key=${API_KEY}`);
    saveJSON(folder, 'field.json', field);
  } catch (e) {
    errors.push(`field: ${e.message}`);
    console.error(`  ERROR: ${e.message}`);
  }
  await sleep(300);

  // 3. Skill ratings — overall SG breakdown per player
  console.log('\n[ 3/10 ] Skill Ratings');
  try {
    const skillRatings = await fetchJSON(`/preds/skill-ratings?display=value&file_format=json&key=${API_KEY}`);
    saveJSON(folder, 'skill-ratings.json', skillRatings);
  } catch (e) {
    errors.push(`skill-ratings: ${e.message}`);
    console.error(`  ERROR: ${e.message}`);
  }
  await sleep(300);

  // 4. Approach skill — breakdown by distance range (key for course-fit)
  console.log('\n[ 4/10 ] Approach Skill (L24 rounds)');
  try {
    const approachSkill = await fetchJSON(`/preds/approach-skill?period=l24&file_format=json&key=${API_KEY}`);
    saveJSON(folder, 'approach-skill.json', approachSkill);
  } catch (e) {
    errors.push(`approach-skill: ${e.message}`);
    console.error(`  ERROR: ${e.message}`);
  }
  await sleep(300);

  // 5. Pre-tournament predictions
  console.log('\n[ 5/10 ] Pre-Tournament Predictions');
  try {
    const preTournament = await fetchJSON(`/preds/pre-tournament?tour=pga&odds_format=percent&file_format=json&key=${API_KEY}`);
    saveJSON(folder, 'pre-tournament.json', preTournament);
  } catch (e) {
    errors.push(`pre-tournament: ${e.message}`);
    console.error(`  ERROR: ${e.message}`);
  }
  await sleep(300);

  // 6. Betting odds — win, top 5, top 10, top 20
  console.log('\n[ 6/10 ] Betting Odds');
  const markets = ['win', 'top_5', 'top_10', 'top_20'];
  for (const market of markets) {
    try {
      const odds = await fetchJSON(`/betting-tools/outrights?tour=pga&market=${market}&odds_format=american&file_format=json&key=${API_KEY}`);
      saveJSON(folder, `betting-odds-${market.replace('_', '')}.json`, odds);
    } catch (e) {
      errors.push(`betting-odds-${market}: ${e.message}`);
      console.error(`  ERROR (${market}): ${e.message}`);
    }
    await sleep(300);
  }

  // 7. Matchup odds
  console.log('\n[ 7/10 ] Matchup Odds');
  try {
    const matchups = await fetchJSON(`/betting-tools/matchups?tour=pga&market=round_matchups&odds_format=american&file_format=json&key=${API_KEY}`);
    saveJSON(folder, 'matchups.json', matchups);
  } catch (e) {
    errors.push(`matchups: ${e.message}`);
    console.error(`  ERROR: ${e.message}`);
  }
  await sleep(300);

  // 8. Player decompositions — granular skill breakdown
  console.log('\n[ 8/10 ] Player Decompositions');
  try {
    const decomp = await fetchJSON(`/preds/player-decompositions?tour=pga&file_format=json&key=${API_KEY}`);
    saveJSON(folder, 'player-decompositions.json', decomp);
  } catch (e) {
    errors.push(`player-decompositions: ${e.message}`);
    console.error(`  ERROR: ${e.message}`);
  }
  await sleep(300);

  // 9. DG Rankings
  console.log('\n[ 9/10 ] DG Rankings');
  try {
    const rankings = await fetchJSON(`/preds/get-dg-rankings?file_format=json&key=${API_KEY}`);
    saveJSON(folder, 'rankings.json', rankings);
  } catch (e) {
    errors.push(`rankings: ${e.message}`);
    console.error(`  ERROR: ${e.message}`);
  }
  await sleep(300);

  // 10. Last week's results — use pre-tournament-archive (available on all plans)
  console.log('\n[ 10/10 ] Last Week Results');
  if (schedule) {
    try {
      const lastWeek = await findLastWeekEventId(schedule);
      if (lastWeek) {
        // pre-tournament-archive includes final model predictions + finishing positions
        const results = await fetchJSON(
          `/preds/pre-tournament-archive?event_id=${lastWeek.event_id}&year=${lastWeek.year}&odds_format=percent&file_format=json&key=${API_KEY}`
        );
        const resultsWithMeta = { event_name: lastWeek.event_name, event_id: lastWeek.event_id, ...results };
        saveJSON(folder, 'last-week-results.json', resultsWithMeta);
      } else {
        console.warn('  Skipping — could not determine last week event ID');
      }
    } catch (e) {
      errors.push(`last-week-results: ${e.message}`);
      console.error(`  ERROR: ${e.message}`);
    }
  } else {
    console.warn('  Skipping — schedule not available');
  }

  // ─── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n=== Pull Complete ===');
  if (errors.length === 0) {
    console.log('✓ All endpoints fetched successfully');
    console.log(`✓ Data saved to: ${folder}`);
    console.log('\nReady to generate newsletter. Open Claude Code and run your Monday prompt.');
  } else {
    console.log(`⚠  Completed with ${errors.length} error(s):`);
    errors.forEach(e => console.log(`   - ${e}`));
    console.log('\nReview errors above. You may still be able to generate with partial data,');
    console.log('but any missing endpoints will appear as [VERIFY] in the newsletter output.');
  }
}

pullData().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
