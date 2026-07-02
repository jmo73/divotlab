"use strict";
/**
 * Send a test approval message to Telegram.
 * Uses a real queue entry with sample data.
 *
 * Usage: npx tsx autopilot/scripts/test-telegram.ts
 *
 * Steps to test:
 *   1. Run this script — approval message appears in Telegram
 *   2. Tap "✓ Approve" — expect "Posting now..." (posting will fail at this stage, expected)
 *   3. Tap "✎ Edit Both" — expect edit prompt
 *   4. Type "Make it shorter" — expect regenerated preview
 *   5. Tap "✗ Skip" — expect "Skipped." message
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
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("../lib/db");
const telegram_1 = require("../lib/telegram");
const imageGen_1 = require("../lib/imageGen");
const config_1 = require("../lib/config");
async function run() {
    (0, config_1.validateEnv)();
    // Sample context
    const context = {
        tournament: {
            name: 'The Masters',
            course: 'Augusta National',
            tier: 'major',
            historicalScoringAvg: -10.2,
            fieldStrengthRank: 1,
            isFirstRound: true,
        },
        weather: {
            windSpeedMph: 18,
            windDirection: 'NW',
            conditionsFlag: 'moderate',
            tempF: 62,
            precipChance: 5,
            conditionsSummary: '18mph NW wind, 62°F',
            lat: 33.5032,
            lng: -82.0199,
        },
        field: {
            avgDgRating: 148,
            topRatedInField: 'Scottie Scheffler',
            fieldStrengthLabel: 'one of the strongest fields of the year',
        },
        insightFlags: {
            playerOverperforming: false,
            playerUnderperforming: false,
            conditionsAdvantage: true,
            courseSpecialist: false,
            modelAligned: true,
            modelSurprise: false,
            fieldBeatingCourse: false,
        },
    };
    const captionX = 'Scheffler leads Augusta at -8 after R1. Highest DG rating in the field at 172. Field avg score today: +1.2 in 18mph wind — conditions making it harder than it looks. The model had him No. 1. via @DataGolf divotlab.com #PGATour #TheMasters';
    const captionIG = 'R1 recap — The Masters\n\nScheffler leads Augusta at -8 after Round 1. His DataGolf rating of 172 was the highest in the field coming in.\n\nWhat makes it notable: the field averaged +1.2 today in 18mph wind. Scheffler is 9.2 shots clear of the field average. The model had him at No. 1 — this is exactly where the numbers said he should be.\n\nFull breakdown at the link in bio.\n\nvia @DataGolf\n#PGATour #TheMasters #GolfAnalytics #DivotLab #SGTotal #DataDrivenGolf #Masters2026';
    // Generate image
    console.log('Generating image...');
    const fields = (0, imageGen_1.leaderboardFields)({
        eventName: 'The Masters',
        courseConditions: '18mph wind, 62°F',
        roundBadge: 'ROUND 1 COMPLETE',
        players: [
            { name: 'Scottie Scheffler', score: -8, dgRating: 172 },
            { name: 'Rory McIlroy', score: -6, dgRating: 165 },
            { name: 'Collin Morikawa', score: -5, dgRating: 158 },
            { name: 'Xander Schauffele', score: -4, dgRating: 155 },
            { name: 'Viktor Hovland', score: -4, dgRating: 152 },
        ],
        insight: 'Model pick (Scheffler) leading the field',
        fieldContext: 'one of the strongest fields of the year',
    });
    const imageBuffer = await (0, imageGen_1.generateImage)('leaderboard', fields);
    console.log(`  ✓ Image: ${(imageBuffer.length / 1024).toFixed(0)} KB`);
    // Create queue entry
    const { put } = await Promise.resolve().then(() => __importStar(require('@vercel/blob')));
    const { config } = await Promise.resolve().then(() => __importStar(require('../lib/config')));
    const { url: blobUrl } = await put('posts/test-telegram.png', imageBuffer, { access: 'public', token: config.blob.token });
    const post = await (0, db_1.createQueuedPost)({
        triggerType: 'live_leaderboard_r1_end',
        triggerLabel: 'R1 Leaderboard · The Masters',
        eventName: 'The Masters',
        eventTier: 'major',
        graphicType: 'leaderboard',
        captionX,
        captionIG,
        imageBlobUrl: blobUrl,
        imageBlobKey: 'posts/test-telegram.png',
        rawData: { test: true },
        context: context,
        weatherContext: context.weather ?? null,
    });
    console.log(`Queue ID: ${post.id}`);
    // Send to Telegram
    console.log('Sending approval message to Telegram...');
    const msgId = await (0, telegram_1.sendApprovalMessage)(post, imageBuffer);
    await (0, db_1.updateQueueStatus)(post.id, 'pending', { telegramMessageId: msgId });
    console.log('\n✓ Approval message sent to Telegram.');
    console.log('Now test the buttons:');
    console.log('  1. Tap ✓ Approve (posting will fail — credentials needed)');
    console.log('  2. Tap ✎ Edit Both → type an instruction');
    console.log('  3. Tap ✗ Skip');
    console.log(`\nQueue row: ${post.id}`);
}
run().catch(err => { console.error(err); process.exit(1); });
//# sourceMappingURL=test-telegram.js.map