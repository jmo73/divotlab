"use strict";
/**
 * Data audit — dumps actual field names + sample values from every API endpoint
 * and local JSON files we'll use for content scripts.
 *
 * Run from /autopilot:
 *   npx tsx scripts/audit-data.ts
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const PROXY = process.env.DIVOTLAB_API_URL ?? 'https://divotlab-api.vercel.app';
function section(title) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  ${title}`);
    console.log('═'.repeat(60));
}
function show(label, obj, depth = 2) {
    console.log(`\n── ${label}`);
    if (Array.isArray(obj)) {
        console.log(`  [Array length: ${obj.length}]`);
        if (obj[0]) {
            console.log('  [0] fields:', Object.keys(obj[0]));
            console.log('  [0] sample:', JSON.stringify(obj[0]).slice(0, 300));
        }
    }
    else if (obj && typeof obj === 'object') {
        console.log('  keys:', Object.keys(obj));
        console.log('  sample:', JSON.stringify(obj).slice(0, 400));
    }
}
async function fetchProxy(path) {
    const res = await fetch(`${PROXY}${path}`);
    if (!res.ok)
        throw new Error(`${res.status} ${res.statusText} for ${path}`);
    return res.json();
}
async function main() {
    // ── 1. Pre-tournament predictions ──────────────────────────────────────────
    section('1. Pre-tournament predictions  →  /api/pre-tournament');
    const preTourney = await fetchProxy('/api/pre-tournament?dead_heat=no');
    show('response keys', preTourney);
    show('data.baseline (first player)', preTourney.data?.baseline?.slice(0, 1));
    show('data.baseline_history_fit (first player)', preTourney.data?.baseline_history_fit?.slice(0, 1));
    // ── 2. Course fit ───────────────────────────────────────────────────────────
    section('2. Course fit  →  /api/course-fit');
    const courseFit = await fetchProxy('/api/course-fit');
    show('response keys', courseFit);
    show('data.tournament', courseFit.data?.tournament);
    show('data.course_weights', courseFit.data?.course_weights);
    show('data.field (first player)', courseFit.data?.field?.slice(0, 1));
    // ── 3. Rankings ─────────────────────────────────────────────────────────────
    section('3. Rankings  →  /api/rankings');
    const rankings = await fetchProxy('/api/rankings');
    show('data.rankings (first player)', rankings.data?.rankings?.slice(0, 1));
    // ── 4. Live tournament stats ─────────────────────────────────────────────────
    section('4. Live tournament stats  →  /api/live-stats');
    try {
        const liveStats = await fetchProxy('/api/live-stats?round=event&stats=sg_total,sg_ott,sg_app,sg_arg,sg_putt,driving_dist,driving_acc');
        show('response keys', liveStats);
        show('data keys', liveStats.data);
        show('data.players (first player)', liveStats.data?.players?.slice(0, 1));
    }
    catch (e) {
        console.log('  ⚠ Live stats unavailable (no active tournament):', e.message);
    }
    // ── 5. In-play probabilities ─────────────────────────────────────────────────
    section('5. In-play probabilities  →  /api/live-tournament');
    try {
        const inPlay = await fetchProxy('/api/live-tournament');
        show('response keys', inPlay);
        show('data.data (first player)', inPlay.data?.data?.slice(0, 1));
        show('data.info', inPlay.data?.info);
    }
    catch (e) {
        console.log('  ⚠ In-play unavailable:', e.message);
    }
    // ── 6. Betting odds (outrights) ─────────────────────────────────────────────
    section('6. Betting odds  →  /api/betting-odds');
    try {
        const odds = await fetchProxy('/api/betting-odds');
        show('data (first player)', odds.data?.slice(0, 1));
    }
    catch (e) {
        console.log('  ⚠ Odds unavailable:', e.message);
    }
    // ── 7. Local JSON files ──────────────────────────────────────────────────────
    section('7. Local JSON files (source of truth for picks + record)');
    const root = path_1.default.join(__dirname, '../../');
    try {
        const pick = JSON.parse(fs_1.default.readFileSync(path_1.default.join(root, 'current-pick.json'), 'utf8'));
        show('current-pick.json', pick);
    }
    catch (e) {
        console.log('  ⚠ current-pick.json not found');
    }
    try {
        const proPicks = JSON.parse(fs_1.default.readFileSync(path_1.default.join(root, 'pro-picks.json'), 'utf8'));
        show('pro-picks.json', proPicks);
        show('pro-picks.json picks[0]', proPicks.picks?.[0]);
    }
    catch (e) {
        console.log('  ⚠ pro-picks.json not found');
    }
    try {
        const tracker = JSON.parse(fs_1.default.readFileSync(path_1.default.join(root, 'lab-notes/lab-picks/season-tracker.json'), 'utf8'));
        show('season-tracker.json totals', tracker.totals);
        show('season-tracker.json weekly_picks (last entry)', tracker.weekly_picks?.slice(-1));
    }
    catch (e) {
        console.log('  ⚠ season-tracker.json:', e.message);
    }
    console.log('\n' + '═'.repeat(60));
    console.log('  Audit complete');
    console.log('═'.repeat(60) + '\n');
}
main().catch(err => {
    console.error('✗', err.message);
    process.exit(1);
});
//# sourceMappingURL=audit-data.js.map