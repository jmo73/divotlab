"use strict";
/**
 * Wednesday top-10 targets — model's highest-probability top-10 finishers
 * adjusted for course fit. One tweet with top 3 names + probabilities.
 * Pure API, fully auto-schedulable.
 *
 * Run from /autopilot:
 *   npx tsx scripts/post-wednesday-top10.ts
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
1. Lead with the probabilities — they are the news
2. Tone: confident, specific, understated. "The Athletic" not ESPN
3. No hype, no question hooks, no emojis, no exclamation points
4. Twitter: under 230 chars, no hashtags
5. These are top-10 finish probability leaders for the week — reference the percentages

Return JSON only: { "tweet": "..." }`;
async function generateTweet(eventName, targets) {
    const client = new sdk_1.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const data = [
        `Event: ${eventName}`,
        `Model's top 10 targets this week (by top-10 probability × course fit):`,
        targets.map((p, i) => `${i + 1}. ${p.name}: ${p.top10Pct} top-10 prob, ${p.fitScore}/100 course fit`).join('\n'),
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
    const [preds, cfData] = await Promise.all([
        (0, datagolf_1.getPreTournamentPredictions)('baseline_history_fit'),
        (0, datagolf_1.getCourseFit)(),
    ]);
    const eventName = cfData.tournament?.event_name ?? 'This Week';
    const fitMap = new Map(cfData.field.map(p => [p.dg_id, p.fitScore]));
    // Combined score: top-10 probability × fit score (both weighted equally)
    const targets = preds
        .filter(p => fitMap.has(p.dg_id))
        .map(p => ({
        name: (0, datagolf_1.formatPlayerName)(p.player_name),
        top10: p.top_10,
        fit: fitMap.get(p.dg_id) ?? 0,
        combined: p.top_10 * (fitMap.get(p.dg_id) ?? 0) / 100,
    }))
        .sort((a, b) => b.combined - a.combined)
        .slice(0, 3)
        .map(p => ({
        name: p.name,
        top10Pct: (p.top10 * 100).toFixed(1) + '%',
        fitScore: String(Math.round(p.fit)),
    }));
    console.log(`✓ Event: ${eventName}`);
    targets.forEach((p, i) => console.log(`  ${i + 1}. ${p.name} — top10 ${p.top10Pct} | fit ${p.fitScore}`));
    console.log('\nGenerating tweet...');
    const tweet = await generateTweet(eventName, targets);
    console.log(`Tweet (${tweet.length}): ${tweet}`);
    const tgPreview = [
        `<b>${eventName}</b> — Top 10 Targets`,
        targets.map((p, i) => `${i + 1}. ${p.name} · ${p.top10Pct} top-10 · fit ${p.fitScore}/100`).join('\n'),
    ].join('\n');
    await (0, publisher_1.publish)({
        tweet,
        tgPreview,
        label: `Wednesday Top 10 Targets · ${eventName}`,
    });
}
if (require.main === module) {
    main().catch(async (err) => {
        console.error('✗', err.message);
        await (0, publisher_1.tgNotify)(`❌ post-wednesday-top10 failed:\n<code>${err.message}</code>`).catch(() => { });
        process.exit(1);
    });
}
//# sourceMappingURL=post-wednesday-top10.js.map