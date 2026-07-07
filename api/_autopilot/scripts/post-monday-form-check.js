"use strict";
/**
 * Monday form check — finds players entering this week's tournament
 * with the biggest positive trend in the dominant course stat
 * (L12 rounds significantly above L24). "Rising in the right category."
 *
 * Run from /autopilot:
 *   npx tsx scripts/post-monday-form-check.ts
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
1. Lead with the trending stat — the specific improvement in the category that matters at this course
2. Tone: confident, specific, understated. "The Athletic" not ESPN
3. No hype, no question hooks, no emojis, no exclamation points
4. Twitter: under 230 chars, no hashtags
5. Frame as form context, not a pick — present the trend and let it speak

Return JSON only: { "tweet": "..." }`;
function fmt(v) {
    if (v == null)
        return 'N/A';
    return (v >= 0 ? '+' : '') + v.toFixed(2);
}
async function generateTweet(eventName, dominantLabel, dominantPct, riser) {
    const client = new sdk_1.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const data = [
        `Event: ${eventName}`,
        `Dominant course stat: ${dominantLabel} (${dominantPct}% of course-fit weight)`,
        `Rising form: ${riser.name}`,
        `${dominantLabel} last 12 rounds: ${riser.l12}/rd`,
        `${dominantLabel} last 24 rounds: ${riser.l24}/rd`,
        `Improvement (L12 vs L24): ${riser.delta}/rd`,
        `Course fit rank: #${riser.fitRank}`,
        `Angle: This player is improving in the exact stat this course rewards. Present as a data observation.`,
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
    const [cfData, rankings] = await Promise.all([(0, datagolf_1.getCourseFit)(), (0, datagolf_1.getRankings)()]);
    if (cfData.field.length < 50) {
        console.log('[skip] No active tournament field — skipping this run');
        return;
    }
    const eventName = cfData.tournament?.event_name ?? 'This Week';
    const weights = cfData.course_weights;
    const weightMap = {
        sg_app: weights.app, sg_putt: weights.putt, sg_ott: weights.ott, sg_arg: weights.arg,
    };
    const labelMap = {
        sg_app: 'SG: Approach', sg_putt: 'SG: Putting', sg_ott: 'SG: Off-Tee', sg_arg: 'SG: Around-Green',
    };
    const l12Map = {
        sg_app: 'sg_app_l12', sg_putt: 'sg_putt_l12', sg_ott: 'sg_ott_l12', sg_arg: 'sg_arg_l12',
    };
    const l24Map = {
        sg_app: 'sg_app_l24', sg_putt: 'sg_putt_l24', sg_ott: 'sg_ott_l24', sg_arg: 'sg_arg_l24',
    };
    const dominantKey = Object.keys(weightMap).sort((a, b) => weightMap[b] - weightMap[a])[0];
    const dominantLabel = labelMap[dominantKey];
    const dominantPct = Math.round(weightMap[dominantKey] * 100);
    // Build rankings lookup map by dg_id
    const rankMap = new Map(rankings.map(r => [r.dg_id, r]));
    // For each field player, compute L12 vs L24 delta in the dominant stat
    const candidates = cfData.field
        .map(fp => {
        const r = rankMap.get(fp.dg_id);
        if (!r)
            return null;
        const l12 = r[l12Map[dominantKey]];
        const l24 = r[l24Map[dominantKey]];
        if (l12 == null || l24 == null)
            return null;
        const delta = l12 - l24;
        return {
            name: (0, datagolf_1.formatPlayerName)(r.player_name),
            l12,
            l24,
            delta,
            fitRank: fp.rank,
        };
    })
        .filter((x) => x !== null && x.delta > 0.15)
        .sort((a, b) => b.delta - a.delta);
    if (!candidates.length) {
        console.log('[skip] No meaningful positive-form-trend players found — skipping');
        return;
    }
    const riser = candidates[0];
    console.log(`✓ Event: ${eventName} — Dominant: ${dominantLabel} (${dominantPct}%)`);
    console.log(`  Rising: ${riser.name} — L12 ${fmt(riser.l12)} | L24 ${fmt(riser.l24)} | delta +${riser.delta.toFixed(2)} | fit #${riser.fitRank}`);
    const fmtRiser = {
        name: riser.name,
        l12: fmt(riser.l12),
        l24: fmt(riser.l24),
        delta: '+' + riser.delta.toFixed(2),
        fitRank: riser.fitRank,
    };
    console.log('\nGenerating tweet...');
    const tweet = await generateTweet(eventName, dominantLabel, dominantPct, fmtRiser);
    console.log(`Tweet (${tweet.length}): ${tweet}`);
    const tgPreview = [
        `<b>${eventName}</b> — Rising Form Check`,
        `Dominant stat: <b>${dominantLabel} ${dominantPct}%</b>`,
        `Rising: <b>${riser.name}</b>`,
        `L12: ${fmt(riser.l12)}/rd  L24: ${fmt(riser.l24)}/rd  Δ ${fmtRiser.delta}/rd`,
        `Course fit rank: #${riser.fitRank}`,
        candidates.length > 1 ? `Runner-up: ${candidates[1].name} (Δ +${candidates[1].delta.toFixed(2)})` : '',
    ].filter(Boolean).join('\n');
    await (0, publisher_1.publish)({
        tweet,
        tgPreview,
        label: `Monday Form Check · ${riser.name} · ${eventName}`,
    });
}
if (require.main === module) {
    main().catch(async (err) => {
        console.error('✗', err.message);
        await (0, publisher_1.tgNotify)(`❌ post-monday-form-check failed:\n<code>${err.message}</code>`).catch(() => { });
        process.exit(1);
    });
}
//# sourceMappingURL=post-monday-form-check.js.map