"use strict";
/**
 * Tuesday fade of the week — finds the player the market most overvalues
 * relative to the DataGolf model. High market-implied win probability,
 * low model win rank, weak course fit = the data says don't follow the crowd.
 *
 * Run from /autopilot:
 *   npx tsx scripts/post-tuesday-fade.ts
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
1. Lead with the market-vs-model gap — that is the news
2. Tone: confident, specific, understated. "The Athletic" not ESPN
3. No hype, no question hooks, no emojis, no exclamation points
4. Twitter: under 230 chars, no hashtags
5. Never say "fade" or "avoid" explicitly — describe the data mismatch, let the reader draw the conclusion
6. Never mention "lock", "trap", or make predictions — present the numbers

Return JSON only: { "tweet": "..." }`;
function americanToProb(odds) {
    if (!odds)
        return null;
    const n = parseInt(odds);
    if (isNaN(n) || n === 0)
        return null;
    if (n > 0)
        return 100 / (n + 100);
    return Math.abs(n) / (Math.abs(n) + 100);
}
async function generateTweet(eventName, fade) {
    const client = new sdk_1.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const fitLine = fade.fitScore != null
        ? `Course fit: ${fade.fitScore}/100 (#${fade.fitRank} in field by fit)`
        : '';
    const data = [
        `Event: ${eventName}`,
        `Player: ${fade.name}`,
        `Market win odds: ${fade.mktOdds} (${fade.mktPct}% implied probability)`,
        `DG model win probability: ${fade.modelPct}% (model rank #${fade.modelRank} in field)`,
        fitLine,
        `Angle: Market is pricing this player significantly higher than the model does. Present the discrepancy without editorializing.`,
    ].filter(Boolean).join('\n');
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
    const [preTour, winOdds, cfData] = await Promise.all([
        (0, datagolf_1.getPreTournamentPredictions)('baseline_history_fit'),
        (0, datagolf_1.getOutrightOdds)('win'),
        (0, datagolf_1.getCourseFit)(),
    ]);
    if (cfData.field.length < 50) {
        console.log('[skip] No active tournament field — skipping this run');
        return;
    }
    if (winOdds.length < 30) {
        console.log('[skip] No betting lines available yet — skipping');
        return;
    }
    const eventName = cfData.tournament?.event_name ?? 'This Week';
    console.log(`✓ Event: ${eventName} (${cfData.field.length} players)`);
    const oddsMap = new Map(winOdds.map(o => [o.dg_id, o]));
    const fitMap = new Map(cfData.field.map(f => [f.dg_id, f]));
    // Score each player: market_implied_prob - model_win_prob (positive = market overvalues)
    const candidates = preTour
        .map((p, idx) => {
        const o = oddsMap.get(p.dg_id);
        if (!o)
            return null;
        const mktOdds = o.draftkings ?? o.fanduel ?? o.bet365 ?? o.caesars ?? null;
        const mktProb = americanToProb(mktOdds);
        if (!mktProb || !mktOdds)
            return null;
        const modelProb = p.win;
        const gap = mktProb - modelProb; // positive = market overvaluing vs model
        if (gap <= 0.02)
            return null; // filter out negligible gaps
        const cf = fitMap.get(p.dg_id);
        return {
            name: (0, datagolf_1.formatPlayerName)(p.player_name),
            mktOdds: mktOdds.startsWith('-') ? mktOdds : '+' + mktOdds,
            mktPct: (mktProb * 100).toFixed(1),
            modelPct: (modelProb * 100).toFixed(1),
            fitScore: cf ? Math.round(cf.fitScore) : null,
            fitRank: cf ? cf.rank : null,
            modelRank: idx + 1,
            gap,
        };
    })
        .filter((x) => x !== null)
        // Prefer players with a real market presence (> 5% implied) so we're not calling out longshots
        .filter(c => parseFloat(c.mktPct) >= 5)
        .sort((a, b) => b.gap - a.gap);
    if (!candidates.length) {
        console.log('[skip] No significant market-vs-model divergence found — skipping');
        return;
    }
    const fade = candidates[0];
    console.log(`✓ Fade candidate: ${fade.name}`);
    console.log(`  Market: ${fade.mktOdds} (${fade.mktPct}% implied) | Model: ${fade.modelPct}% | Gap: +${(fade.gap * 100).toFixed(1)} ppts`);
    if (fade.fitScore)
        console.log(`  Course fit: ${fade.fitScore}/100 (#${fade.fitRank})`);
    console.log('\nGenerating tweet...');
    const tweet = await generateTweet(eventName, fade);
    console.log(`Tweet (${tweet.length}): ${tweet}`);
    const tgPreview = [
        `<b>${eventName}</b> — Fade Candidate`,
        `Player: <b>${fade.name}</b>`,
        `Market: ${fade.mktOdds} (${fade.mktPct}% implied win prob)`,
        `Model win prob: ${fade.modelPct}% (#${fade.modelRank} in field)`,
        fade.fitScore ? `Course fit: ${fade.fitScore}/100 (#${fade.fitRank})` : '',
    ].filter(Boolean).join('\n');
    await (0, publisher_1.publish)({
        tweet,
        tgPreview,
        label: `Tuesday Fade · ${fade.name} · ${eventName}`,
    });
}
if (require.main === module) {
    main().catch(async (err) => {
        console.error('✗', err.message);
        await (0, publisher_1.tgNotify)(`❌ post-tuesday-fade failed:\n<code>${err.message}</code>`).catch(() => { });
        process.exit(1);
    });
}
//# sourceMappingURL=post-tuesday-fade.js.map