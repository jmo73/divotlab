"use strict";
/**
 * Post-round SG recap — highlights who had the best stats for the completed round.
 * Pass round number as env var RECAP_ROUND=1|2|3|4, or auto-detect from day of week.
 *
 * Run from /autopilot:
 *   RECAP_ROUND=1 npx tsx scripts/post-round-recap.ts
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
1. Lead with the most striking number — a dominant SG leader or a big gap from the field
2. Tone: confident, specific, understated. "The Athletic" not ESPN
3. No hype, no question hooks, no emojis, no exclamation points
4. Twitter: under 220 chars, no hashtags
5. Reference the round number and specific SG categories — this is a stat recap, not hype

Return JSON only: { "tweet": "..." }`;
function fmt(v) {
    if (v == null)
        return 'N/A';
    return (v >= 0 ? '+' : '') + v.toFixed(2);
}
function dayOfWeekRound() {
    // UTC day: 4=Thu(R1), 5=Fri(R2), 6=Sat(R3), 0=Sun(R4)
    const d = new Date().getUTCDay();
    if (d === 4)
        return '1';
    if (d === 5)
        return '2';
    if (d === 6)
        return '3';
    return '4';
}
async function generateTweet(eventName, round, leaders) {
    const client = new sdk_1.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const data = [
        `Event: ${eventName} — Round ${round} recap`,
        `SG: Total leader:  ${leaders.sgTotal.name} ${leaders.sgTotal.val}/rd`,
        `SG: Approach leader: ${leaders.sgApp.name} ${leaders.sgApp.val}/rd`,
        `SG: Putting leader:  ${leaders.sgPutt.name} ${leaders.sgPutt.val}/rd`,
        `SG: Off-Tee leader:  ${leaders.sgOtt.name} ${leaders.sgOtt.val}/rd`,
        `SG: Arg leader:      ${leaders.sgArg.name} ${leaders.sgArg.val}/rd`,
        `Focus on the most impressive stat or a player who dominated multiple categories.`,
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
    const round = process.env.RECAP_ROUND ?? dayOfWeekRound();
    console.log(`Fetching R${round} stats...`);
    const { eventName, players } = await (0, datagolf_1.getLiveTournamentStats)(round);
    if (!players.length) {
        console.log(`[skip] No R${round} player data — tournament not active or not started yet`);
        return;
    }
    const withStats = players.filter(p => p.sg_total != null);
    if (withStats.length < 5) {
        console.log(`[skip] Insufficient R${round} SG data (${withStats.length} players) — round likely not in progress`);
        return;
    }
    const top = (key) => [...withStats]
        .filter(p => p[key] != null)
        .sort((a, b) => b[key] - a[key])[0];
    const leaders = {
        sgTotal: { name: (0, datagolf_1.formatPlayerName)(top('sg_total').player_name), val: fmt(top('sg_total').sg_total) },
        sgApp: { name: (0, datagolf_1.formatPlayerName)(top('sg_app').player_name), val: fmt(top('sg_app').sg_app) },
        sgPutt: { name: (0, datagolf_1.formatPlayerName)(top('sg_putt').player_name), val: fmt(top('sg_putt').sg_putt) },
        sgOtt: { name: (0, datagolf_1.formatPlayerName)(top('sg_ott').player_name), val: fmt(top('sg_ott').sg_ott) },
        sgArg: { name: (0, datagolf_1.formatPlayerName)(top('sg_arg').player_name), val: fmt(top('sg_arg').sg_arg) },
    };
    console.log(`✓ ${eventName} — R${round} leaders:`);
    console.log(`  Total: ${leaders.sgTotal.name} ${leaders.sgTotal.val}`);
    console.log(`  App:   ${leaders.sgApp.name} ${leaders.sgApp.val}`);
    console.log(`  Putt:  ${leaders.sgPutt.name} ${leaders.sgPutt.val}`);
    console.log(`  OTT:   ${leaders.sgOtt.name} ${leaders.sgOtt.val}`);
    console.log(`  ARG:   ${leaders.sgArg.name} ${leaders.sgArg.val}`);
    console.log('\nGenerating tweet...');
    const tweet = await generateTweet(eventName, round, leaders);
    console.log(`Tweet (${tweet.length}): ${tweet}`);
    const tgPreview = [
        `<b>${eventName} — R${round} SG Recap</b>`,
        `Total: <b>${leaders.sgTotal.name}</b> ${leaders.sgTotal.val}`,
        `App:   ${leaders.sgApp.name} ${leaders.sgApp.val}`,
        `Putt:  ${leaders.sgPutt.name} ${leaders.sgPutt.val}`,
        `OTT:   ${leaders.sgOtt.name} ${leaders.sgOtt.val}`,
        `ARG:   ${leaders.sgArg.name} ${leaders.sgArg.val}`,
    ].join('\n');
    await (0, publisher_1.publish)({
        tweet,
        tgPreview,
        label: `R${round} SG Recap · ${eventName}`,
    });
}
if (require.main === module) {
    main().catch(async (err) => {
        console.error('✗', err.message);
        await (0, publisher_1.tgNotify)(`❌ post-round-recap R failed:\n<code>${err.message}</code>`).catch(() => { });
        process.exit(1);
    });
}
//# sourceMappingURL=post-round-recap.js.map