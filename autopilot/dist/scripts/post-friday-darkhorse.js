"use strict";
/**
 * Friday dark horse alert — finds a player with high course fit but overlooked
 * by the win probability model (good value spot).
 * Pure API, fully auto-schedulable.
 *
 * Run from /autopilot:
 *   npx tsx scripts/post-friday-darkhorse.ts
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = main;
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const datagolf_1 = require("../lib/datagolf");
const publisher_1 = require("../lib/publisher");
const SYSTEM_PROMPT = `You are the caption writer for Divot Lab, a data-driven golf analytics brand.

Rules:
1. Lead with the mismatch — high fit score vs low win rank. That is the news.
2. Tone: confident, specific, understated. "The Athletic" not ESPN
3. No hype, no question hooks, no emojis, no exclamation points
4. Twitter: under 230 chars, no hashtags
5. Never say "lock", "fire", "sleeper" — describe the data mismatch directly

Return JSON only: { "tweet": "..." }`;
async function generateTweet(eventName, pick) {
    const client = new sdk_1.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const data = [
        `Event: ${eventName}`,
        `Player: ${pick.name}`,
        `Course fit: ${pick.fitScore}/100 (ranked #${pick.fitRank} in field by course fit)`,
        `Win probability rank: #${pick.winRank} in field (${pick.winPct} win prob)`,
        `Key strength: ${pick.dominantStat} at ${pick.dominantVal}/rd`,
        `Angle: High course fit but low win probability — the model sees this player as a fit specialist the market undervalues.`,
    ].join('\n');
    const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: data }],
    });
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match)
        throw new Error('No JSON from Claude');
    const parsed = JSON.parse(match[0]);
    return parsed.tweet ?? '';
}
async function main() {
    if (!process.env.ANTHROPIC_API_KEY)
        throw new Error('Missing ANTHROPIC_API_KEY');
    console.log('Fetching data...');
    const [candidates, cfData] = await Promise.all([(0, datagolf_1.getModelPickCandidates)(), (0, datagolf_1.getCourseFit)()]);
    const eventName = cfData.tournament?.event_name ?? 'This Week';
    const weights = cfData.course_weights;
    const statKeys = ['sgApp', 'sgPutt', 'sgOtt', 'sgArg'];
    const weightMap = { sgApp: weights.app, sgPutt: weights.putt, sgOtt: weights.ott, sgArg: weights.arg };
    const labelMap = { sgApp: 'SG: Approach', sgPutt: 'SG: Putting', sgOtt: 'SG: Off-Tee', sgArg: 'SG: Around-Green' };
    const dominantKey = [...statKeys].sort((a, b) => weightMap[b] - weightMap[a])[0];
    // Dark horse: high fit rank (top 10 by fit) but lower win rank (outside top 8)
    // Sorted by fit-vs-win divergence (how much better fit rank is vs win rank)
    const darkHorses = candidates
        .filter(p => p.fitRank <= 10 && p.winRank > 8)
        .sort((a, b) => (b.winRank - b.fitRank) - (a.winRank - a.fitRank));
    // Fallback: biggest gap between fit rank and win rank in top 20
    const fallback = [...candidates]
        .filter(p => p.fitRank <= 20 && p.winRank > 5)
        .sort((a, b) => (b.winRank - b.fitRank) - (a.winRank - a.fitRank));
    const target = darkHorses[0] ?? fallback[0] ?? candidates[5];
    const fmt = (v) => v == null ? 'N/A' : (v >= 0 ? '+' : '') + v.toFixed(2);
    const pick = {
        name: target.playerName,
        fitScore: String(Math.round(target.fitScore)),
        fitRank: String(target.fitRank),
        winRank: String(target.winRank),
        winPct: (target.winPct * 100).toFixed(1) + '%',
        dominantStat: labelMap[dominantKey],
        dominantVal: fmt(target[dominantKey]),
    };
    console.log(`✓ Event: ${eventName}`);
    console.log(`  Dark horse: ${pick.name} — fit #${pick.fitRank} (${pick.fitScore}/100) | win rank #${pick.winRank} (${pick.winPct})`);
    console.log('\nGenerating tweet...');
    const tweet = await generateTweet(eventName, pick);
    console.log(`Tweet (${tweet.length}): ${tweet}`);
    const tgPreview = [
        `<b>${eventName}</b> — Dark Horse Alert`,
        `Player: <b>${pick.name}</b>`,
        `Course fit: ${pick.fitScore}/100 (#${pick.fitRank} in field)`,
        `Win prob rank: #${pick.winRank} (${pick.winPct} win)`,
        `${pick.dominantStat}: ${pick.dominantVal}/rd`,
    ].join('\n');
    await (0, publisher_1.publish)({
        tweet,
        tgPreview,
        label: `Friday Dark Horse · ${eventName}`,
    });
}
if (require.main === module) {
    main().catch(async (err) => {
        console.error('✗', err.message);
        await (0, publisher_1.tgNotify)(`❌ post-friday-darkhorse failed:\n<code>${err.message}</code>`).catch(() => { });
        process.exit(1);
    });
}
//# sourceMappingURL=post-friday-darkhorse.js.map