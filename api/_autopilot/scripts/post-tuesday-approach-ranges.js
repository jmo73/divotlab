"use strict";
/**
 * Tuesday approach-ranges breakdown — shows who leads the field in
 * SG: Approach at specific distance buckets. Genuinely unique content
 * that no other analytics account publishes.
 *
 * Run from /autopilot:
 *   npx tsx scripts/post-tuesday-approach-ranges.ts
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
1. Lead with the most interesting distance-bucket leader — the number itself is the news
2. Tone: confident, specific, understated. "The Athletic" not ESPN
3. No hype, no question hooks, no emojis, no exclamation points
4. Twitter: under 230 chars, no hashtags
5. Mention the specific yardage range and the SG value — this is granular data nobody else publishes
6. If course approach weight is high (> 28%), mention it briefly

Return JSON only: { "tweet": "..." }`;
async function generateTweet(eventName, courseApp, leaders, mostInteresting) {
    const client = new sdk_1.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const data = [
        `Event: ${eventName} — Approach weight: ${courseApp}%`,
        `SG: Approach field leaders by distance this week:`,
        leaders.map(l => `${l.label}: ${l.name} +${l.val} (course fit rank: ${l.fitRank != null ? '#' + l.fitRank : 'N/A'})`).join('\n'),
        `Most interesting: ${mostInteresting.label} leader ${mostInteresting.name} at +${mostInteresting.val} (course fit rank: #${mostInteresting.fitRank})`,
        `Angle: This is distance-specific approach data that reveals which players are elite in the exact yardage range this course demands.`,
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
    return JSON.parse(match[0]).tweet ?? '';
}
async function main() {
    if (!process.env.ANTHROPIC_API_KEY)
        throw new Error('Missing ANTHROPIC_API_KEY');
    console.log('Fetching data...');
    const [cfData, approachData] = await Promise.all([(0, datagolf_1.getCourseFit)(), (0, datagolf_1.getApproachSkill)()]);
    if (cfData.field.length < 50) {
        console.log('[skip] No active tournament field — skipping this run');
        return;
    }
    const eventName = cfData.tournament?.event_name ?? 'This Week';
    const appWeight = Math.round(cfData.course_weights.app * 100);
    // Build lookup: dg_id → approach skill
    const approachMap = new Map(approachData.map(a => [a.dg_id, a]));
    // Build lookup: dg_id → course fit rank
    const fitRankMap = new Map(cfData.field.map(f => [f.dg_id, f.rank]));
    const buckets = [
        { key: 'sg_app_100_125', label: '100–125 yds' },
        { key: 'sg_app_125_150', label: '125–150 yds' },
        { key: 'sg_app_150_175', label: '150–175 yds' },
        { key: 'sg_app_175_200', label: '175–200 yds' },
        { key: 'sg_app_200_plus', label: '200+ yds' },
    ];
    // For each bucket, find the field leader
    const leaders = [];
    for (const { key, label } of buckets) {
        const fieldWithData = cfData.field
            .map(fp => {
            const a = approachMap.get(fp.dg_id);
            if (!a)
                return null;
            const val = a[key];
            if (val == null)
                return null;
            return { dg_id: fp.dg_id, name: (0, datagolf_1.formatPlayerName)(a.player_name), val, fitRank: fp.rank };
        })
            .filter((x) => x !== null)
            .sort((a, b) => b.val - a.val);
        if (!fieldWithData.length)
            continue;
        const top = fieldWithData[0];
        leaders.push({
            label,
            name: top.name,
            val: top.val.toFixed(2),
            fitRank: top.fitRank,
        });
    }
    if (leaders.length < 3) {
        console.log(`[skip] Insufficient approach-range data in field (${leaders.length} buckets) — skipping`);
        return;
    }
    // Pick the most interesting leader: highest value in a bucket where the leader is also high fit rank
    // (alignment between distance skill and course fit is the interesting story)
    const mostInteresting = leaders
        .filter(l => l.fitRank != null && l.fitRank <= 20)
        .sort((a, b) => parseFloat(b.val) - parseFloat(a.val))[0]
        ?? leaders.sort((a, b) => parseFloat(b.val) - parseFloat(a.val))[0];
    console.log(`✓ ${eventName} — App weight: ${appWeight}%`);
    leaders.forEach(l => console.log(`  ${l.label}: ${l.name} +${l.val} (fit #${l.fitRank})`));
    // Show top 3 distance buckets in tweet data (the middle 3 are most common scoring distances)
    const tweetLeaders = leaders.slice(1, 4); // 125-150, 150-175, 175-200
    console.log('\nGenerating tweet...');
    const tweet = await generateTweet(eventName, appWeight, tweetLeaders, mostInteresting);
    console.log(`Tweet (${tweet.length}): ${tweet}`);
    const tgPreview = [
        `<b>${eventName}</b> — Approach Distance Breakdown (App ${appWeight}%)`,
        ...leaders.map(l => `${l.label}: <b>${l.name}</b> +${l.val} · fit #${l.fitRank}`),
    ].join('\n');
    await (0, publisher_1.publish)({
        tweet,
        tgPreview,
        label: `Tuesday Approach Ranges · ${eventName}`,
    });
}
if (require.main === module) {
    main().catch(async (err) => {
        console.error('✗', err.message);
        await (0, publisher_1.tgNotify)(`❌ post-tuesday-approach-ranges failed:\n<code>${err.message}</code>`).catch(() => { });
        process.exit(1);
    });
}
//# sourceMappingURL=post-tuesday-approach-ranges.js.map