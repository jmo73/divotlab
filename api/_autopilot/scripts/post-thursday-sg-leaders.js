"use strict";
/**
 * Thursday SG category leaders — who leads the field in each of the
 * four SG categories heading into R1. Shows how the field's stat leaders
 * map against what this course actually rewards.
 *
 * Run from /autopilot:
 *   npx tsx scripts/post-thursday-sg-leaders.ts
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
1. Lead with the most interesting alignment or misalignment — e.g. the approach leader is also the top course-fit pick, OR the dominant stat leader ranks poorly on course fit
2. Tone: confident, specific, understated. "The Athletic" not ESPN
3. No hype, no question hooks, no emojis, no exclamation points
4. Twitter: under 230 chars, no hashtags
5. Focus on 1–2 players max — not a list dump

Return JSON only: { "tweet": "..." }`;
function fmt(v) {
    if (v == null)
        return 'N/A';
    return (v >= 0 ? '+' : '') + v.toFixed(2);
}
async function generateTweet(eventName, weights, leaders) {
    const client = new sdk_1.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const pct = (v) => Math.round(v * 100) + '%';
    const data = [
        `Event: ${eventName}`,
        `Course-fit weights: App ${pct(weights.app)} | Putt ${pct(weights.putt)} | OTT ${pct(weights.ott)} | ARG ${pct(weights.arg)}`,
        `Field SG leaders heading into R1:`,
        `SG: Approach (${pct(weights.app)} weight): ${leaders.app.name} ${leaders.app.val}/rd · course fit rank #${leaders.app.fitRank}`,
        `SG: Putting  (${pct(weights.putt)} weight): ${leaders.putt.name} ${leaders.putt.val}/rd · course fit rank #${leaders.putt.fitRank}`,
        `SG: Off-Tee  (${pct(weights.ott)} weight): ${leaders.ott.name} ${leaders.ott.val}/rd · course fit rank #${leaders.ott.fitRank}`,
        `SG: Arg      (${pct(weights.arg)} weight): ${leaders.arg.name} ${leaders.arg.val}/rd · course fit rank #${leaders.arg.fitRank}`,
        `Find the most interesting story: alignment (dominant-stat leader also top fit pick) or divergence (dominant-stat leader ranks poorly on fit). One tweet, one insight.`,
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
    const cfData = await (0, datagolf_1.getCourseFit)();
    if (cfData.field.length < 50) {
        console.log('[skip] No active tournament field — skipping this run');
        return;
    }
    const eventName = cfData.tournament?.event_name ?? 'This Week';
    const weights = cfData.course_weights;
    const keys = ['sg_app', 'sg_putt', 'sg_ott', 'sg_arg'];
    function fieldLeader(key) {
        const sorted = [...cfData.field]
            .filter(p => p[key] != null)
            .sort((a, b) => (b[key] ?? -99) - (a[key] ?? -99));
        const top = sorted[0];
        if (!top)
            return null;
        return { name: top.player_name, val: fmt(top[key]), fitRank: top.rank };
    }
    const leaders = {
        app: fieldLeader('sg_app'),
        putt: fieldLeader('sg_putt'),
        ott: fieldLeader('sg_ott'),
        arg: fieldLeader('sg_arg'),
    };
    if (!leaders.app || !leaders.putt || !leaders.ott || !leaders.arg) {
        console.log('[skip] Missing SG data in field — skipping');
        return;
    }
    console.log(`✓ ${eventName}`);
    console.log(`  App leader:  ${leaders.app.name}  ${leaders.app.val} (fit #${leaders.app.fitRank})`);
    console.log(`  Putt leader: ${leaders.putt.name} ${leaders.putt.val} (fit #${leaders.putt.fitRank})`);
    console.log(`  OTT leader:  ${leaders.ott.name}  ${leaders.ott.val} (fit #${leaders.ott.fitRank})`);
    console.log(`  ARG leader:  ${leaders.arg.name}  ${leaders.arg.val} (fit #${leaders.arg.fitRank})`);
    console.log('\nGenerating tweet...');
    const tweet = await generateTweet(eventName, weights, {
        app: leaders.app,
        putt: leaders.putt,
        ott: leaders.ott,
        arg: leaders.arg,
    });
    console.log(`Tweet (${tweet.length}): ${tweet}`);
    const pct = (v) => Math.round(v * 100) + '%';
    const tgPreview = [
        `<b>${eventName}</b> — SG Category Leaders`,
        `App (${pct(weights.app)}): <b>${leaders.app.name}</b> ${leaders.app.val}/rd · fit #${leaders.app.fitRank}`,
        `Putt (${pct(weights.putt)}): <b>${leaders.putt.name}</b> ${leaders.putt.val}/rd · fit #${leaders.putt.fitRank}`,
        `OTT (${pct(weights.ott)}): <b>${leaders.ott.name}</b> ${leaders.ott.val}/rd · fit #${leaders.ott.fitRank}`,
        `ARG (${pct(weights.arg)}): <b>${leaders.arg.name}</b> ${leaders.arg.val}/rd · fit #${leaders.arg.fitRank}`,
    ].join('\n');
    await (0, publisher_1.publish)({
        tweet,
        tgPreview,
        label: `Thursday SG Leaders · ${eventName}`,
    });
}
if (require.main === module) {
    main().catch(async (err) => {
        console.error('✗', err.message);
        await (0, publisher_1.tgNotify)(`❌ post-thursday-sg-leaders failed:\n<code>${err.message}</code>`).catch(() => { });
        process.exit(1);
    });
}
//# sourceMappingURL=post-thursday-sg-leaders.js.map