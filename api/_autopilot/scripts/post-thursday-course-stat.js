"use strict";
/**
 * Thursday course-stat post — two text-only tweets.
 * Tweet 1: The dominant course-fit category and what it means historically.
 * Tweet 2: The model's top course-fit pick with their stat vs the field.
 *
 * Run from /autopilot:
 *   npx tsx scripts/post-thursday-course-stat.ts
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = main;
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });
}
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const datagolf_1 = require("../lib/datagolf");
const publisher_1 = require("../lib/publisher");
const SYSTEM_PROMPT = `You are the caption writer for Divot Lab, a data-driven golf analytics brand.

Rules:
1. Lead with the specific number — the weight percentage, the SG value, the rank
2. Tone: "The Athletic" — smart, confident, no hype, no fluff
3. Never use: "lock", "fire", "huge", question hooks, filler phrases
4. Twitter: under 220 chars, no hashtags, no emojis
5. tweet_course: About WHY this stat dominates at this course (weight + what it means for picking winners)
6. tweet_leader: About who leads the field in that stat and what their model profile looks like

Return JSON only: { "tweet_course": "...", "tweet_leader": "..." }`;
async function generateTweets(eventName, course, dominantLabel, dominantPct, courseNotes, leader, secondPct, secondLabel) {
    const client = new sdk_1.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const data = [
        `Event: ${eventName} at ${course}`,
        `Dominant course-fit stat: ${dominantLabel} at ${dominantPct}% weight (next: ${secondLabel} at ${secondPct}%)`,
        `Course notes from model: ${courseNotes}`,
        `Field leader in ${dominantLabel}: ${leader.name} at ${leader.statVal}/rd`,
        `${leader.name} model profile: ${leader.winPct} win probability, ${leader.fitScore}/100 course fit`,
    ].join('\n');
    const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: data }],
    });
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match)
        throw new Error('No JSON from Claude');
    const parsed = JSON.parse(match[0]);
    return {
        tweetCourse: parsed.tweet_course ?? '',
        tweetLeader: parsed.tweet_leader ?? '',
    };
}
async function main() {
    if (!process.env.ANTHROPIC_API_KEY)
        throw new Error('Missing ANTHROPIC_API_KEY');
    console.log('Fetching data...');
    const [cfData, candidates] = await Promise.all([(0, datagolf_1.getCourseFit)(), (0, datagolf_1.getModelPickCandidates)()]);
    if (cfData.field.length < 50) {
        console.log('[skip] No active tournament field — skipping this run');
        return;
    }
    const eventName = cfData.tournament?.event_name ?? 'This Week';
    const course = cfData.tournament?.course ?? '';
    const weights = cfData.course_weights;
    const notes = weights.notes ?? '';
    console.log(`✓ ${eventName} at ${course}`);
    console.log(`✓ Notes: ${notes}`);
    const statKeys = ['sgApp', 'sgPutt', 'sgOtt', 'sgArg'];
    const weightMap = { sgApp: weights.app, sgPutt: weights.putt, sgOtt: weights.ott, sgArg: weights.arg };
    const labelMap = { sgApp: 'SG: Approach', sgPutt: 'SG: Putting', sgOtt: 'SG: Off-Tee', sgArg: 'SG: Around-Green' };
    const sorted = [...statKeys].sort((a, b) => weightMap[b] - weightMap[a]);
    const dominantKey = sorted[0];
    const secondKey = sorted[1];
    const dominantLabel = labelMap[dominantKey];
    const dominantPct = Math.round(weightMap[dominantKey] * 100);
    const secondPct = Math.round(weightMap[secondKey] * 100);
    const secondLabel = labelMap[secondKey];
    console.log(`✓ Dominant: ${dominantLabel} (${dominantPct}%)`);
    // Field leader in dominant stat
    const sorted2 = [...candidates]
        .filter(p => p[dominantKey] != null)
        .sort((a, b) => (b[dominantKey] ?? -99) - (a[dominantKey] ?? -99));
    const fieldLeader = sorted2[0];
    const fmt = (v) => v == null ? 'N/A' : (v >= 0 ? '+' : '') + v.toFixed(2);
    const leader = {
        name: fieldLeader.playerName,
        statVal: fmt(fieldLeader[dominantKey]),
        winPct: (fieldLeader.winPct * 100).toFixed(1) + '%',
        fitScore: String(Math.round(fieldLeader.fitScore)),
    };
    console.log(`✓ Field leader: ${leader.name} at ${leader.statVal} | win ${leader.winPct} | fit ${leader.fitScore}`);
    console.log('\nGenerating tweets...');
    const { tweetCourse, tweetLeader } = await generateTweets(eventName, course, dominantLabel, dominantPct, notes, leader, secondPct, secondLabel);
    console.log(`Tweet 1 course (${tweetCourse.length}): ${tweetCourse}`);
    console.log(`Tweet 2 leader (${tweetLeader.length}): ${tweetLeader}`);
    const tgPreview = [
        `<b>${eventName}</b> · ${course}`,
        `Dominant: <b>${dominantLabel} ${dominantPct}%</b> | ${secondLabel} ${secondPct}%`,
        `Field leader: <b>${leader.name}</b> ${leader.statVal} | fit ${leader.fitScore}/100`,
        notes ? `<i>${notes}</i>` : '',
    ].filter(Boolean).join('\n');
    // Tweet 1: course-stat insight
    console.log('\n── Tweet 1: Course stat');
    await (0, publisher_1.publish)({
        tweet: tweetCourse,
        tgPreview: tgPreview + '\n\n<i>Tweet 1 of 2 — course stat</i>',
        label: `Thursday Course Stat 1/2 · ${eventName}`,
    });
    // Tweet 2: field leader
    console.log('\n── Tweet 2: Field leader');
    await (0, publisher_1.publish)({
        tweet: tweetLeader,
        tgPreview: tgPreview + '\n\n<i>Tweet 2 of 2 — field leader</i>',
        label: `Thursday Course Stat 2/2 · ${eventName}`,
    });
}
if (require.main === module) {
    main().catch(async (err) => {
        console.error('✗', err.message);
        await (0, publisher_1.tgNotify)(`❌ post-thursday-course-stat failed:\n<code>${err.message}</code>`).catch(() => { });
        process.exit(1);
    });
}
//# sourceMappingURL=post-thursday-course-stat.js.map