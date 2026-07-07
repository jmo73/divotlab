"use strict";
/**
 * Live mid-round stat leader — fires during an active round (Thu/Sat/Sun afternoon)
 * and highlights who is dominating the key SG category in the current round.
 * Skips cleanly when no tournament is active or a round hasn't progressed far enough.
 *
 * Run from /autopilot:
 *   npx tsx scripts/post-live-mover.ts
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
1. Lead with the stat — player name, stat category, value, round context
2. Tone: confident, specific, understated. "The Athletic" not ESPN
3. No hype, no question hooks, no emojis, no exclamation points
4. Twitter: under 230 chars, no hashtags
5. This is a live mid-round post — use present tense. Include "through X holes in R{N}"
6. If the leader is also the overall SG: Total leader, mention both stats
7. Include the DG win probability if it's meaningful (> 10%)

Return JSON only: { "tweet": "..." }`;
function fmt(v) {
    if (v == null)
        return 'N/A';
    return (v >= 0 ? '+' : '') + v.toFixed(2);
}
async function generateTweet(eventName, round, leader) {
    const client = new sdk_1.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const data = [
        `Event: ${eventName} — R${round} in progress`,
        `SG: Approach leader through R${round}: ${leader.name} at ${leader.sgApp}/rd`,
        `Through ${leader.thru} holes`,
        leader.sgTotal ? `SG: Total this round: ${leader.sgTotal}/rd` : '',
        leader.isAlsoTotalLeader ? `${leader.name} leads BOTH SG: Approach and SG: Total this round.` : '',
        leader.winPct ? `DG win probability: ${leader.winPct}` : '',
        `Frame as a live mid-round stat observation. Present tense.`,
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
    console.log('Checking for active round...');
    const inPlay = await (0, datagolf_1.getInPlayProbabilities)();
    if (!inPlay || inPlay.players.length < 10) {
        console.log('[skip] No active tournament in progress — skipping live mover');
        return;
    }
    const round = inPlay.info.current_round;
    const eventName = inPlay.info.event_name ?? 'This Week';
    console.log(`✓ Active: ${eventName} R${round}`);
    // Fetch live SG stats for the current round
    const { players } = await (0, datagolf_1.getLiveTournamentStats)(String(round));
    // Need a meaningful number of players through at least 9 holes
    const midRound = players.filter(p => (p.thru ?? 0) >= 9);
    if (midRound.length < 20) {
        console.log(`[skip] Round ${round} not far enough — only ${midRound.length} players through 9+ holes`);
        return;
    }
    // SG: Approach leader this round (most predictive mid-round signal)
    const withApp = midRound.filter(p => p.sg_app != null);
    if (withApp.length < 10) {
        console.log('[skip] Insufficient approach data — skipping');
        return;
    }
    const appLeader = [...withApp].sort((a, b) => (b.sg_app ?? 0) - (a.sg_app ?? 0))[0];
    const totalLeader = [...midRound]
        .filter(p => p.sg_total != null)
        .sort((a, b) => (b.sg_total ?? 0) - (a.sg_total ?? 0))[0];
    const isAlsoTotalLeader = totalLeader?.player_name === appLeader.player_name;
    // Match with in-play win probability
    const inPlayPlayer = inPlay.players.find(p => p.dg_id === appLeader.dg_id);
    const winPct = inPlayPlayer && inPlayPlayer.win > 0.05
        ? (inPlayPlayer.win * 100).toFixed(1) + '%'
        : null;
    // Also pull course fit for context
    const cfData = await (0, datagolf_1.getCourseFit)();
    const cfPlayer = cfData.field.find(f => f.dg_id === appLeader.dg_id);
    const leader = {
        name: appLeader.player_name, // already formatted by getLiveTournamentStats
        thru: appLeader.thru ?? 0,
        sgApp: fmt(appLeader.sg_app),
        sgTotal: appLeader.sg_total != null ? fmt(appLeader.sg_total) : null,
        winPct,
        isAlsoTotalLeader,
    };
    console.log(`✓ Approach leader: ${leader.name} — SG: App ${leader.sgApp} | thru ${leader.thru}`);
    if (leader.winPct)
        console.log(`  Win prob: ${leader.winPct}`);
    if (cfPlayer)
        console.log(`  Course fit: ${Math.round(cfPlayer.fitScore)}/100`);
    if (isAlsoTotalLeader)
        console.log('  Also leads SG: Total this round');
    console.log('\nGenerating tweet...');
    const tweet = await generateTweet(eventName, round, leader);
    console.log(`Tweet (${tweet.length}): ${tweet}`);
    const tgPreview = [
        `<b>${eventName}</b> — R${round} Live Mover`,
        `SG: Approach leader: <b>${leader.name}</b> ${leader.sgApp}/rd`,
        `Through ${leader.thru} holes`,
        leader.sgTotal ? `SG: Total: ${leader.sgTotal}` : '',
        leader.winPct ? `Win prob: ${leader.winPct}` : '',
        isAlsoTotalLeader ? '<i>Also leads SG: Total this round</i>' : '',
    ].filter(Boolean).join('\n');
    await (0, publisher_1.publish)({
        tweet,
        tgPreview,
        label: `R${round} Live Mover · ${leader.name} · ${eventName}`,
    });
}
if (require.main === module) {
    main().catch(async (err) => {
        console.error('✗', err.message);
        await (0, publisher_1.tgNotify)(`❌ post-live-mover failed:\n<code>${err.message}</code>`).catch(() => { });
        process.exit(1);
    });
}
//# sourceMappingURL=post-live-mover.js.map