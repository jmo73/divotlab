"use strict";
/**
 * Wednesday pick reveal — renders the pick-reveal card from current-pick.json
 * and posts to X (with image + link) and optionally Instagram.
 *
 * Run from /autopilot:
 *   npx tsx scripts/post-wednesday-picks.ts
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });
}
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const publisher_1 = require("../lib/publisher");
const ROOT = path_1.default.join(__dirname, '../../');
const PICK_PATH = path_1.default.join(ROOT, 'current-pick.json');
const SYSTEM_PROMPT = `You are the caption writer for Divot Lab, a data-driven golf analytics brand.

Rules:
1. Lead with the bet itself — player, bet type, odds. That is the news.
2. One sentence max of reasoning, pulled directly from the data provided
3. Tone: confident, direct, understated. No hype, no exclamation points
4. Twitter: under 200 chars (link will be appended separately)
5. Instagram: 2–3 sentences + "Full breakdown at divotlab.com/picks — link in bio." + 3 hashtags
6. Never say "lock", "fire", "can't miss", "huge value"

Return JSON only: { "twitter_tweet": "...", "instagram_caption": "...", "hashtags": ["#Golf", ...] }`;
async function generateCaptions(player, betType, odds, book, reasoning, confidence, eventName) {
    const client = new sdk_1.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const data = `Event: ${eventName}\nPick: ${player} ${betType} ${odds} @ ${book}\nConfidence: ${confidence}\nReasoning: ${reasoning}`;
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
    const hashtags = (parsed.hashtags ?? []).slice(0, 3).join(' ');
    return {
        tweet: parsed.twitter_tweet ?? '',
        ig: parsed.instagram_caption ? `${parsed.instagram_caption}\n\n${hashtags}` : '',
    };
}
async function main() {
    if (!process.env.ANTHROPIC_API_KEY)
        throw new Error('Missing ANTHROPIC_API_KEY');
    if (!fs_1.default.existsSync(PICK_PATH))
        throw new Error('current-pick.json not found');
    const data = JSON.parse(fs_1.default.readFileSync(PICK_PATH, 'utf8'));
    const pick = data.pick;
    // Freshness guard — warn if pick is older than 3 days
    const pickAge = (Date.now() - new Date(data.published).getTime()) / (1000 * 60 * 60 * 24);
    if (pickAge > 3) {
        throw new Error(`current-pick.json was published ${data.published} (${Math.round(pickAge)} days ago). Update it in admin.html first, then re-run.`);
    }
    if (pick.result !== null) {
        throw new Error(`This pick already has a result (${pick.result}). It looks like last week's pick. Update current-pick.json in admin.html first.`);
    }
    console.log(`Tournament: ${data.tournament}`);
    console.log(`Pick:       ${pick.player} ${pick.bet_type} ${pick.odds} @ ${pick.book}`);
    console.log(`Confidence: ${pick.confidence}`);
    // Confidence CSS class
    const confClass = pick.confidence.toLowerCase() === 'high' ? 'high'
        : pick.confidence.toLowerCase() === 'medium' ? 'medium'
            : 'low';
    // Bet type display (uppercase)
    const betTypeDisplay = pick.bet_detail
        ? `${pick.bet_type} · ${pick.bet_detail}`
        : pick.bet_type;
    // Render card
    console.log('\nRendering pick-reveal card...');
    const { renderHtmlTemplate } = await Promise.resolve().then(() => __importStar(require('../lib/renderHtml')));
    const fields = {
        BADGE: 'Free Pick',
        EVENT_NAME: data.tournament,
        PLAYER_NAME: pick.player,
        BET_TYPE: betTypeDisplay.toUpperCase(),
        ODDS: pick.odds,
        BOOK: pick.book,
        CONFIDENCE: pick.confidence.toUpperCase(),
        CONFIDENCE_CLASS: confClass,
        REASONING: pick.reasoning,
    };
    const pngBuf = await renderHtmlTemplate('pick-reveal', fields, { height: 1350 });
    console.log(`✓ Card: ${(pngBuf.length / 1024).toFixed(0)} KB`);
    // Generate captions
    console.log('\nGenerating captions...');
    const captions = await generateCaptions(pick.player, betTypeDisplay, pick.odds, pick.book, pick.reasoning, pick.confidence, data.tournament);
    console.log(`Tweet (${captions.tweet.length}): ${captions.tweet}`);
    const tgPreview = [
        `<b>${data.tournament}</b>  ·  ${data.week_of}`,
        `Pick: <b>${pick.player} ${betTypeDisplay} ${pick.odds}</b> @ ${pick.book}`,
        `Confidence: ${pick.confidence}`,
        pick.reasoning,
    ].join('\n');
    await (0, publisher_1.publish)({
        pngBuf,
        tweet: captions.tweet,
        igCaption: captions.ig,
        tgPreview,
        label: `Wednesday Pick · ${pick.player} ${pick.odds}`,
        link: 'divotlab.com/picks',
    });
}
main().catch(async (err) => {
    console.error('✗', err.message);
    await (0, publisher_1.tgNotify)(`❌ post-wednesday-picks failed:\n<code>${err.message}</code>`).catch(() => { });
    process.exit(1);
});
//# sourceMappingURL=post-wednesday-picks.js.map