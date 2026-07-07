"use strict";
/**
 * Sunday contenders — final-round win probability leaders.
 * Uses live in-play data if available, falls back to pre-tournament model.
 * Pure API, fully auto-schedulable.
 *
 * Run from /autopilot:
 *   npx tsx scripts/post-sunday-contenders.ts
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
1. Lead with win probabilities — they are the only number that matters on Sunday
2. Tone: confident, specific, understated. "The Athletic" not ESPN
3. No hype, no question hooks, no emojis, no exclamation points
4. Twitter: under 230 chars, no hashtags
5. If live final-round data exists, frame as "entering the final round" or "live R4". If pre-tournament, frame as model projection.

Return JSON only: { "tweet": "..." }`;
async function generateTweet(eventName, isLive, roundContext, top3) {
    const client = new sdk_1.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const data = [
        `Event: ${eventName}`,
        `Data: ${isLive ? `Live — ${roundContext}` : 'Pre-tournament model projection (no active round)'}`,
        `Win probability leaders:`,
        top3.map((p, i) => `${i + 1}. ${p.name}: ${p.winPct}${p.score ? `, ${p.score} to par` : ''}`).join('\n'),
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
    const inPlay = await (0, datagolf_1.getInPlayProbabilities)();
    let eventName = 'This Week';
    let isLive = false;
    let roundContext = '';
    let top3 = [];
    if (inPlay && inPlay.players.length >= 3) {
        isLive = true;
        eventName = inPlay.info.event_name ?? 'This Week';
        roundContext = `R${inPlay.info.current_round}`;
        top3 = inPlay.players
            .filter(p => p.win > 0.001)
            .sort((a, b) => b.win - a.win)
            .slice(0, 3)
            .map(p => ({
            name: (0, datagolf_1.formatPlayerName)(p.player_name),
            winPct: (p.win * 100).toFixed(1) + '%',
            score: p.current_score != null
                ? (p.current_score === 0 ? 'E' : p.current_score > 0 ? `+${p.current_score}` : String(p.current_score))
                : undefined,
        }));
        console.log(`✓ Live data: ${eventName} ${roundContext}`);
    }
    else {
        const [preds, cfData] = await Promise.all([
            (0, datagolf_1.getPreTournamentPredictions)('baseline_history_fit'),
            (0, datagolf_1.getCourseFit)(),
        ]);
        if (cfData.field.length < 50) {
            console.log('[skip] No active tournament field — skipping this run');
            return;
        }
        eventName = cfData.tournament?.event_name ?? 'This Week';
        top3 = preds.slice(0, 3).map(p => ({
            name: (0, datagolf_1.formatPlayerName)(p.player_name),
            winPct: (p.win * 100).toFixed(1) + '%',
        }));
        console.log(`✓ Pre-tournament data: ${eventName}`);
    }
    top3.forEach((p, i) => console.log(`  ${i + 1}. ${p.name} — ${p.winPct}${p.score ? ` (${p.score})` : ''}`));
    console.log('\nGenerating tweet...');
    const tweet = await generateTweet(eventName, isLive, roundContext, top3);
    console.log(`Tweet (${tweet.length}): ${tweet}`);
    const tgPreview = [
        `<b>${eventName}</b> — ${isLive ? `${roundContext} Contenders` : 'Pre-Tournament Model'}`,
        top3.map((p, i) => `${i + 1}. ${p.name} · ${p.winPct}${p.score ? ` · ${p.score}` : ''}`).join('\n'),
    ].join('\n');
    await (0, publisher_1.publish)({
        tweet,
        tgPreview,
        label: `Sunday Contenders · ${eventName}`,
    });
}
if (require.main === module) {
    main().catch(async (err) => {
        console.error('✗', err.message);
        await (0, publisher_1.tgNotify)(`❌ post-sunday-contenders failed:\n<code>${err.message}</code>`).catch(() => { });
        process.exit(1);
    });
}
//# sourceMappingURL=post-sunday-contenders.js.map