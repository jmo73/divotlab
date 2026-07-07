"use strict";
/**
 * Evergreen: SG category leaders — #1 player on tour in each of the four
 * strokes-gained categories right now (L24 baseline). Rotates weekly angle:
 *   week 0 mod 4 → overall leaders
 *   week 1 mod 4 → biggest gap between #1 and #2 in each category
 *   week 2 mod 4 → players who lead in 2+ categories simultaneously
 *   week 3 mod 4 → leader in the "rarest" category (smallest margin over avg)
 *
 * Fires any time — no active tournament needed.
 *
 * Run from /autopilot:
 *   npx tsx scripts/post-evergreen-stat-leaders.ts
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
1. Lead with the most striking number — the best stat value on tour right now
2. Tone: confident, specific, understated. "The Athletic" not ESPN
3. No hype, no question hooks, no emojis, no exclamation points
4. Twitter: under 230 chars, no hashtags
5. These are current PGA Tour leaders in individual SG categories — not just world rankings
6. Make the data speak: pick the single most interesting number and build the tweet around it

Return JSON only: { "tweet": "..." }`;
function fmt(v) {
    if (v == null)
        return 'N/A';
    return (v >= 0 ? '+' : '') + v.toFixed(2);
}
async function generateTweet(angle, leaders, context) {
    const client = new sdk_1.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const data = [
        `Angle this week: ${angle}`,
        `PGA Tour SG category leaders (last 24 rounds):`,
        leaders.map(l => `${l.category}: ${l.name} ${l.val}/rd (DG rank #${l.dgRank})`).join('\n'),
        context ?? '',
        `Write one tweet that highlights the most surprising or impressive specific number.`,
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
    console.log('Fetching rankings...');
    const rankings = await (0, datagolf_1.getRankings)();
    const pga = rankings.filter(p => (p.primary_tour ?? '').toLowerCase() === 'pga');
    if (pga.length < 50) {
        console.log('[skip] Insufficient PGA Tour ranking data — skipping');
        return;
    }
    const statKeys = ['sg_app', 'sg_putt', 'sg_ott', 'sg_arg'];
    const labelMap = {
        sg_app: 'SG: Approach', sg_putt: 'SG: Putting', sg_ott: 'SG: Off-Tee', sg_arg: 'SG: Around-Green',
    };
    // Get #1 in each category
    const leaders = statKeys.map(key => {
        const sorted = [...pga]
            .filter(p => p[key] != null)
            .sort((a, b) => (b[key] ?? -99) - (a[key] ?? -99));
        const top = sorted[0];
        return {
            category: labelMap[key],
            name: (0, datagolf_1.formatPlayerName)(top.player_name),
            val: fmt(top[key]),
            dgRank: top.datagolf_rank,
            raw: top[key] ?? 0,
            second: sorted[1] ? (sorted[1][key] ?? 0) : 0,
        };
    });
    // Pick the weekly angle based on week number
    const weekOfYear = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
    const angleIdx = weekOfYear % 4;
    let angle;
    let context;
    if (angleIdx === 0) {
        // Overall leaders — straightforward
        angle = 'Current PGA Tour SG category leaders';
    }
    else if (angleIdx === 1) {
        // Biggest gap between #1 and #2
        const biggestGap = leaders
            .map(l => ({ ...l, gap: parseFloat(l.val) - l.second }))
            .sort((a, b) => b.gap - a.gap)[0];
        angle = `Category dominance — biggest #1 vs #2 gap`;
        context = `Biggest gap is ${biggestGap.category}: ${biggestGap.name} leads ${biggestGap.name} by +${biggestGap.gap.toFixed(2)}/rd over the second-ranked player`;
    }
    else if (angleIdx === 2) {
        // Player who leads in 2+ categories
        const nameCounts = new Map();
        leaders.forEach(l => nameCounts.set(l.name, (nameCounts.get(l.name) ?? 0) + 1));
        const multiLeader = [...nameCounts.entries()].sort((a, b) => b[1] - a[1])[0];
        if (multiLeader && multiLeader[1] >= 2) {
            const cats = leaders.filter(l => l.name === multiLeader[0]).map(l => l.category);
            angle = 'All-around dominance';
            context = `${multiLeader[0]} leads the PGA Tour in ${cats.join(' AND ')} simultaneously — rare multi-category dominance`;
        }
        else {
            angle = 'Current PGA Tour SG category leaders';
        }
    }
    else {
        // Highest absolute value — who has the most extreme positive stat
        const best = leaders.sort((a, b) => parseFloat(b.val) - parseFloat(a.val))[0];
        angle = 'Peak performer — highest single-category value on tour';
        context = `${best.name} at ${best.val}/rd in ${best.category} — an elite individual category value`;
    }
    console.log(`✓ Weekly angle (${angleIdx}): ${angle}`);
    leaders.forEach(l => console.log(`  ${l.category}: ${l.name} ${l.val}`));
    console.log('\nGenerating tweet...');
    const tweet = await generateTweet(angle, leaders, context);
    console.log(`Tweet (${tweet.length}): ${tweet}`);
    const tgPreview = [
        `<b>PGA Tour SG Leaders (L24)</b> — ${angle}`,
        leaders.map(l => `${l.category}: <b>${l.name}</b> ${l.val}/rd`).join('\n'),
        context ? `\n<i>${context}</i>` : '',
    ].filter(Boolean).join('\n');
    await (0, publisher_1.publish)({
        tweet,
        tgPreview,
        label: `Evergreen Stat Leaders · ${angle}`,
    });
}
if (require.main === module) {
    main().catch(async (err) => {
        console.error('✗', err.message);
        await (0, publisher_1.tgNotify)(`❌ post-evergreen-stat-leaders failed:\n<code>${err.message}</code>`).catch(() => { });
        process.exit(1);
    });
}
//# sourceMappingURL=post-evergreen-stat-leaders.js.map