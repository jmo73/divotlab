"use strict";
/**
 * Stat Leaders post — top 3 field leaders in this course's most-weighted SG category.
 * Auto-detects the dominant stat from course weights (putting, approach, OTT, or ARG).
 *
 * Buttons: X + IG 📷 | X only 📷 | Text only 📝 | Skip ✗
 *
 * Run from /autopilot:
 *   npx tsx scripts/test-stat-post.ts
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const datagolf_1 = require("../lib/datagolf");
const publisher_1 = require("../lib/publisher");
const STAT_META = {
    sgApp: { label: 'SG: Approach', short: 'SG: App', weightKey: 'app' },
    sgPutt: { label: 'SG: Putting', short: 'SG: Putt', weightKey: 'putt' },
    sgOtt: { label: 'SG: Off-Tee', short: 'SG: OTT', weightKey: 'ott' },
    sgArg: { label: 'SG: Around-Green', short: 'SG: ARG', weightKey: 'arg' },
};
function pickDominantStat(w) {
    return ['sgApp', 'sgPutt', 'sgOtt', 'sgArg']
        .sort((a, b) => (w[STAT_META[b].weightKey]) - (w[STAT_META[a].weightKey]))[0];
}
function fmt(v) {
    if (v == null || isNaN(v))
        return 'N/A';
    return (v >= 0 ? '+' : '') + v.toFixed(2);
}
function cls(v) {
    return v == null ? '' : v >= 0 ? 'pos' : 'neg';
}
// ─── Caption generation ───────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the caption writer for Divot Lab, a data-driven golf analytics brand.

Your job is to write social media captions for data cards (leaderboard, player spotlight, course profile, stat leaders).

Rules:
1. Lead with the most surprising or data-rich observation — never with the tournament name
2. Every claim must be supported by a number in the card data
3. Do not invent statistics or comparisons not in the provided data
4. Tone: confident, specific, understated. Think "The Athletic" not "ESPN Bottom Line"
5. Never use: "lock", "can't miss", "fire", "huge", "massive", hype language, or question-mark hooks
6. Twitter: 1–2 sentences MAX, no hashtags, no emojis, under 220 chars (leave room for a link)
7. Instagram: 2–4 sentences + a CTA ending with "— link in bio." + 3–5 hashtags on their own line

Return JSON only: { "twitter_tweet": "...", "instagram_caption": "...", "hashtags": ["#Golf", ...] }`;
async function generateCaptions(eventName, statLabel, statPct, players) {
    const client = new sdk_1.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const playerList = players.map((p, i) => `${i + 1}. ${p.name}: ${p.stat} ${statLabel}, ${p.winPct} win prob, course fit ${p.fit}/100`).join('\n');
    const cardData = `Event: ${eventName}\nKey stat: ${statLabel} (${statPct}% of course-fit model weight)\n\nTop field leaders:\n${playerList}`;
    const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Card data: ${cardData}` }],
    });
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match)
        throw new Error('Claude returned no valid JSON');
    const parsed = JSON.parse(match[0]);
    const hashtags = (parsed.hashtags ?? []).slice(0, 5).join(' ');
    return {
        tweet: parsed.twitter_tweet ?? '',
        ig: parsed.instagram_caption ? `${parsed.instagram_caption}\n\n${hashtags}` : '',
    };
}
// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    if (!process.env.ANTHROPIC_API_KEY)
        throw new Error('Missing ANTHROPIC_API_KEY');
    // ── Fetch data ──────────────────────────────────────────────────────────────
    console.log('Fetching data...');
    const [cfData, candidates] = await Promise.all([(0, datagolf_1.getCourseFit)(), (0, datagolf_1.getModelPickCandidates)()]);
    const eventName = cfData.tournament?.event_name ?? 'This Week';
    const weights = cfData.course_weights;
    console.log(`✓ Event: ${eventName}`);
    console.log(`✓ Weights: App ${Math.round(weights.app * 100)}% | Putt ${Math.round(weights.putt * 100)}% | OTT ${Math.round(weights.ott * 100)}% | ARG ${Math.round(weights.arg * 100)}%`);
    const statKey = pickDominantStat(weights);
    const meta = STAT_META[statKey];
    const statPct = Math.round(weights[meta.weightKey] * 100);
    console.log(`✓ Key stat: ${meta.label} (${statPct}%)`);
    const ranked = candidates
        .filter(p => p[statKey] != null)
        .sort((a, b) => (b[statKey] ?? -99) - (a[statKey] ?? -99))
        .slice(0, 3);
    if (ranked.length < 3)
        throw new Error(`Only ${ranked.length} players with ${statKey} data`);
    ranked.forEach((p, i) => console.log(`  ${i + 1}. ${p.playerName} ${meta.short}: ${fmt(p[statKey])} | win: ${(p.winPct * 100).toFixed(1)}% | fit: ${p.fitScore}`));
    // ── Render card ─────────────────────────────────────────────────────────────
    console.log('\nRendering card...');
    const { renderHtmlTemplate } = await Promise.resolve().then(() => __importStar(require('../lib/renderHtml')));
    const fields = {
        BADGE: 'Model Analysis', STAT_LABEL: meta.label, STAT_PCT: String(statPct),
        STAT_SHORT: meta.short, EVENT_NAME: eventName,
        CONTEXT_LINE: `${meta.label} is the #1 weighted factor at ${eventName} at ${statPct}% of the course-fit model. These three players lead the full field on this metric.`,
        P1_NAME: ranked[0].playerName, P1_WIN_PCT: (ranked[0].winPct * 100).toFixed(1) + '%',
        P1_FIT: String(Math.round(ranked[0].fitScore)), P1_STAT: fmt(ranked[0][statKey]), P1_STAT_CLASS: cls(ranked[0][statKey]),
        P2_NAME: ranked[1].playerName, P2_WIN_PCT: (ranked[1].winPct * 100).toFixed(1) + '%',
        P2_FIT: String(Math.round(ranked[1].fitScore)), P2_STAT: fmt(ranked[1][statKey]), P2_STAT_CLASS: cls(ranked[1][statKey]),
        P3_NAME: ranked[2].playerName, P3_WIN_PCT: (ranked[2].winPct * 100).toFixed(1) + '%',
        P3_FIT: String(Math.round(ranked[2].fitScore)), P3_STAT: fmt(ranked[2][statKey]), P3_STAT_CLASS: cls(ranked[2][statKey]),
    };
    const pngBuf = await renderHtmlTemplate('stat-leaders', fields, { height: 1350 });
    console.log(`✓ Card: ${(pngBuf.length / 1024).toFixed(0)} KB`);
    // ── Generate captions ────────────────────────────────────────────────────────
    console.log('\nGenerating captions...');
    const playerData = ranked.map(p => ({
        name: p.playerName, stat: fmt(p[statKey]),
        winPct: (p.winPct * 100).toFixed(1) + '%', fit: String(Math.round(p.fitScore)),
    }));
    const captions = await generateCaptions(eventName, meta.label, statPct, playerData);
    console.log(`✓ Tweet (${captions.tweet.length} chars): ${captions.tweet}`);
    // ── Publish via shared publisher ─────────────────────────────────────────────
    const tgPreview = [
        `Event: <b>${eventName}</b>`,
        `Key stat: <b>${meta.label} (${statPct}%)</b>`,
        ranked.map((p, i) => `${i + 1}. ${p.playerName} — ${fmt(p[statKey])} | fit ${Math.round(p.fitScore)}`).join('\n'),
    ].join('\n');
    await (0, publisher_1.publish)({
        pngBuf,
        tweet: captions.tweet,
        igCaption: captions.ig,
        tgPreview,
        label: `Stat Leaders · ${eventName}`,
    });
}
main().catch(async (err) => {
    console.error('\n✗', err.message);
    const { tgNotify } = await Promise.resolve().then(() => __importStar(require('../lib/publisher')));
    await tgNotify(`❌ test-stat-post failed:\n<code>${err.message}</code>`).catch(() => { });
    process.exit(1);
});
//# sourceMappingURL=test-stat-post.js.map