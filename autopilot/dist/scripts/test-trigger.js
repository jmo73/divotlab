"use strict";
/**
 * Manually fire a trigger with flags:
 *   --trigger=<trigger_type>   Force a specific trigger (bypasses eligibility check)
 *   --dry-run                  Full pipeline: scheduler + enrichment + image + captions, no queue, no Telegram
 *   --queue                    Creates queue entry + Blob upload, no Telegram send
 *   --post-x-only              Full pipeline including X post (real tweet — delete after)
 *   --post-ig-only             Full pipeline including IG post (real post — delete after)
 *   --post-both                Full pipeline including both platforms
 *
 * Usage:
 *   npx tsx autopilot/scripts/test-trigger.ts --trigger=pre_tournament_model_picks --dry-run
 *   npx tsx autopilot/scripts/test-trigger.ts --trigger=evergreen_stat_of_week --queue
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
const scheduler_1 = require("../lib/scheduler");
const enrichment_1 = require("../lib/enrichment");
const claude_1 = require("../lib/claude");
const queue_1 = require("../lib/queue");
const twitter_1 = require("../lib/twitter");
const instagram_1 = require("../lib/instagram");
const config_1 = require("../lib/config");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => {
    const [k, v] = a.slice(2).split('=');
    return [k, v ?? true];
}));
const triggerArg = flags['trigger'];
const isDryRun = !!flags['dry-run'];
const isQueue = !!flags['queue'];
const postX = !!flags['post-x-only'] || !!flags['post-both'];
const postIG = !!flags['post-ig-only'] || !!flags['post-both'];
async function run() {
    (0, config_1.validateEnv)();
    const OUT_DIR = path_1.default.join(__dirname, '..', 'test-output');
    await promises_1.default.mkdir(OUT_DIR, { recursive: true });
    console.log('─'.repeat(60));
    console.log('Divot Lab Autopilot — Test Trigger');
    console.log('─'.repeat(60));
    // 1. Run scheduler (respects --trigger override)
    let schedulerResult;
    if (triggerArg) {
        console.log(`\nForcing trigger: ${triggerArg}`);
        schedulerResult = await (0, scheduler_1.runScheduler)('tournament');
        if (schedulerResult && triggerArg) {
            // Override trigger type for testing
            schedulerResult = { ...schedulerResult, triggerType: triggerArg };
        }
    }
    else {
        console.log('\nRunning scheduler...');
        schedulerResult = await (0, scheduler_1.runScheduler)('tournament');
    }
    if (!schedulerResult) {
        console.log('Scheduler: no eligible trigger. Use --trigger=<type> to force one.');
        return;
    }
    console.log(`\nTrigger selected: ${schedulerResult.triggerType}`);
    console.log(`Event: ${schedulerResult.eventName ?? 'Evergreen'}`);
    console.log(`Tournament status: ${schedulerResult.tournamentStatus}`);
    // 2. Enrichment
    console.log('\nBuilding context...');
    const context = await (0, enrichment_1.buildPostContext)(schedulerResult.triggerType, {
        eventName: schedulerResult.eventName ?? '',
        roundDate: new Date(),
        lat: schedulerResult.lat,
        lng: schedulerResult.lng,
    });
    console.log(`  Tier: ${context.tournament.tier}`);
    console.log(`  Conditions: ${context.weather.conditionsSummary} (${context.weather.conditionsFlag})`);
    console.log(`  Field strength: ${context.field.fieldStrengthLabel}`);
    if (context.insightFlags) {
        const flags = Object.entries(context.insightFlags).filter(([, v]) => v).map(([k]) => k);
        if (flags.length)
            console.log(`  Insight flags: ${flags.join(', ')}`);
    }
    // 3. Captions
    console.log('\nGenerating captions...');
    const captions = await (0, claude_1.generateCaptions)(schedulerResult.triggerType, context, schedulerResult.rawData);
    console.log(`\nX CAPTION (${captions.captionX.length} chars):`);
    console.log(captions.captionX);
    console.log(`\nIG CAPTION (${captions.captionIG.length} chars):`);
    console.log(captions.captionIG);
    if (captions.usedFallback)
        console.log('\n⚠ Used fallback captions (Claude API unavailable)');
    if (isDryRun) {
        console.log('\n─'.repeat(60));
        console.log('Dry run complete. No queue entry, no Blob, no posts.');
        return;
    }
    // 4. Image
    console.log('\nGenerating image...');
    const post = await (0, queue_1.createPost)({ schedulerResult, context });
    const imgPath = path_1.default.join(OUT_DIR, `${schedulerResult.triggerType}.png`);
    await promises_1.default.writeFile(imgPath, post.imageBuffer);
    console.log(`  ✓ Image: ${imgPath}`);
    console.log(`  ✓ Blob: ${post.imageBlobUrl}`);
    console.log(`  ✓ Queue ID: ${post.id}`);
    if (isQueue) {
        console.log('\n─'.repeat(60));
        console.log('Queue mode: row created, Blob uploaded. No Telegram, no posts.');
        console.log(`Queue ID: ${post.id} — verify in autopilot_queue table`);
        return;
    }
    // 5. Posting
    if (postX) {
        console.log('\nPosting to X...');
        const result = await (0, twitter_1.postToTwitter)(post.captionX, post.imageBuffer);
        console.log(`  ✓ X: ${result.postUrl}`);
        console.log('  ⚠ Delete this tweet manually: ' + result.postUrl);
    }
    if (postIG) {
        console.log('\nPosting to Instagram...');
        // Instagram needs JPEG and a public URL — use blob URL
        const { default: sharp } = await Promise.resolve().then(() => __importStar(require('sharp')));
        const jpegBuf = await sharp(post.imageBuffer).jpeg({ quality: 92 }).toBuffer();
        const { put } = await Promise.resolve().then(() => __importStar(require('@vercel/blob')));
        const { config } = await Promise.resolve().then(() => __importStar(require('../lib/config')));
        const { url } = await put(`posts/${post.id}-test.jpg`, jpegBuf, { access: 'public', token: config.blob.token });
        const result = await (0, instagram_1.postToInstagram)(post.captionIG, url);
        console.log(`  ✓ IG: ${result.postUrl}`);
        console.log('  ⚠ Delete this post manually: ' + result.postUrl);
    }
}
run().catch(err => { console.error(err); process.exit(1); });
//# sourceMappingURL=test-trigger.js.map