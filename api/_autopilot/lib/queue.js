"use strict";
/**
 * Post queue manager and posting orchestrator.
 * Ties together: image gen → caption gen → blob upload → DB → Telegram approval.
 * On approval: PNG → JPEG → X post + IG post → DB update → Telegram confirmation.
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
exports.createPost = createPost;
exports.firePosting = firePosting;
exports.processEditInstruction = processEditInstruction;
exports.handleExpiredPost = handleExpiredPost;
const blob_1 = require("@vercel/blob");
const config_1 = require("./config");
const imageGen_1 = require("./imageGen");
const claude_1 = require("./claude");
const enrichment_1 = require("./enrichment");
const db_1 = require("./db");
const telegram_1 = require("./telegram");
const twitter_1 = require("./twitter");
const instagram_1 = require("./instagram");
const logger_1 = require("./logger");
// ─── Blob helpers ─────────────────────────────────────────────────────────────
async function uploadToBlob(buffer, filename, mimeType) {
    const { url } = await (0, blob_1.put)(filename, buffer, {
        access: 'public',
        contentType: mimeType,
        token: config_1.config.blob.token,
    });
    // Key is the last segment of the URL (Vercel Blob URL is deterministic)
    const key = filename;
    return { url, key };
}
async function fetchBlobAsBuffer(blobUrl) {
    const res = await fetch(blobUrl);
    if (!res.ok)
        throw new Error(`Failed to fetch blob: ${res.status} ${blobUrl}`);
    return Buffer.from(await res.arrayBuffer());
}
// ─── Template field resolution ────────────────────────────────────────────────
/**
 * Build the template fields object from the raw trigger data.
 * Evergreen items carry pre-built templateFields; live triggers need
 * fields computed from their data payload.
 */
function resolveTemplateFields(schedulerResult, context) {
    const { triggerType, rawData } = schedulerResult;
    // Evergreen items pre-build their fields at seed time
    if (rawData.templateFields && rawData.templateId) {
        return {
            templateId: rawData.templateId,
            fields: rawData.templateFields,
        };
    }
    const templateId = (0, enrichment_1.selectTemplate)(triggerType, context.insightFlags);
    const eventName = context.tournament.name;
    const conditions = context.weather.conditionsSummary;
    // Import field builders from imageGen for each template type
    const { leaderboardFields, playerStatFields, modelPickFields, cutLineFields, evergreenFactFields, quoteInsightFields, comparisonFields, courseBreakdownFields, weatherCardFields, formatScore, formatSG } = require('./imageGen');
    switch (templateId) {
        case 'leaderboard': {
            const d = rawData;
            return {
                templateId,
                fields: leaderboardFields({
                    eventName,
                    courseConditions: conditions,
                    roundBadge: `ROUND ${d.round ?? ''} COMPLETE`,
                    players: (d.top5 ?? []).map(p => ({
                        name: p.playerName,
                        score: p.score,
                        dgRating: p.dg_rating ?? undefined,
                    })),
                    insight: context.insightFlags.modelAligned
                        ? 'Model pick leading the field'
                        : context.insightFlags.fieldBeatingCourse
                            ? 'Field scoring below historical avg'
                            : `Field avg DG rating: ${context.field.avgDgRating}`,
                    fieldContext: context.field.fieldStrengthLabel,
                }),
            };
        }
        case 'player-stat': {
            const d = rawData;
            const name = d.playerName ?? '';
            const pos = d.positionNow ?? 1;
            return {
                templateId,
                fields: playerStatFields({
                    playerName: name,
                    contextLine: `T${pos} · ${eventName}`,
                    badge: context.insightFlags.playerOverperforming ? 'OVERPERFORMING' : 'IN FOCUS',
                    badgeColor: context.insightFlags.playerOverperforming ? '#5BBF85' : '#5A8FA8',
                    stats: [
                        { label: 'DG RATING', value: String(d.dg_rating ?? '—') },
                        { label: 'SG TOTAL', value: d.sg_total_round != null ? formatSG(d.sg_total_round) : '—' },
                        { label: 'SG APPROACH', value: d.sg_approach_round != null ? formatSG(d.sg_approach_round) : '—' },
                        { label: 'SG PUTTING', value: d.sg_putting_round != null ? formatSG(d.sg_putting_round) : '—' },
                    ],
                    insightLine1: `${d.dgRatingPercentile ?? '—'}th pct in field`,
                    insightLine2: conditions,
                }),
            };
        }
        case 'model-pick': {
            const d = rawData;
            return {
                templateId,
                fields: modelPickFields({
                    eventName,
                    conditionsSummary: conditions,
                    picks: (d.picks ?? []).slice(0, 3).map(p => ({
                        name: p.playerName,
                        winPct: `${p.winProbability}%`,
                        fitScore: p.courseFitScore,
                        keyStrength: p.keyStrength,
                    })),
                    darkHorse: d.darkHorse ?? { name: '—', reason: '' },
                }),
            };
        }
        case 'cut-line': {
            const d = rawData;
            return {
                templateId,
                fields: cutLineFields({
                    eventName,
                    cutLine: d.cutLine != null ? formatScore(d.cutLine) : 'E',
                    players: (d.players ?? []).map(p => ({
                        name: p.playerName,
                        score: p.score,
                        holesPlayed: p.holesPlayed,
                    })),
                }),
            };
        }
        case 'weather-card': {
            const d = rawData;
            const flag = context.weather.conditionsFlag;
            return {
                templateId,
                fields: weatherCardFields({
                    eventName,
                    roundDate: d.roundDate ?? new Date().toISOString().slice(0, 10),
                    windSpeed: String(context.weather.windSpeedMph),
                    windDirection: context.weather.windDirection,
                    tempPrecip: `${context.weather.tempF}°F · ${context.weather.precipChance}% precip`,
                    conditionsFlag: flag.toUpperCase(),
                    conditionsFlagColor: flag === 'difficult' || flag === 'severe' ? '#C9A84C' : '#FAFAFA',
                    scoringImpact: context.weather.windSpeedMph >= 22
                        ? 'Scoring avg typically rises 2–3 shots'
                        : 'Minimal scoring impact expected',
                    historicalContext: `Course avg: ${context.tournament.historicalScoringAvg > 0 ? '+' : ''}${context.tournament.historicalScoringAvg}`,
                }),
            };
        }
        case 'comparison': {
            const d = rawData;
            return {
                templateId,
                fields: comparisonFields({
                    eventRound: `${eventName} · R${schedulerResult.rawData.round ?? ''}`,
                    playerA: {
                        name: d.playerA.name,
                        score: d.playerA.score,
                        position: d.playerA.position,
                        sgTotal: d.playerA.sg_total_round != null ? formatSG(d.playerA.sg_total_round) : '—',
                        sgApproach: d.playerA.sg_approach_round != null ? formatSG(d.playerA.sg_approach_round) : '—',
                        dgRating: String(d.playerA.dg_rating ?? '—'),
                    },
                    playerB: {
                        name: d.playerB.name,
                        score: d.playerB.score,
                        position: d.playerB.position,
                        sgTotal: d.playerB.sg_total_round != null ? formatSG(d.playerB.sg_total_round) : '—',
                        sgApproach: d.playerB.sg_approach_round != null ? formatSG(d.playerB.sg_approach_round) : '—',
                        dgRating: String(d.playerB.dg_rating ?? '—'),
                    },
                    comparisonAngle: d.comparisonAngle ?? '',
                }),
            };
        }
        default:
            // Generic evergreen-fact fallback
            return {
                templateId: 'evergreen-fact',
                fields: evergreenFactFields({
                    topicBadge: triggerType.replace(/_/g, ' ').toUpperCase(),
                    headline: eventName,
                    subhead: '',
                    mainStat: '—',
                    unitLabel: '',
                    supportLines: [conditions, '', ''],
                }),
            };
    }
}
// ─── Create post ──────────────────────────────────────────────────────────────
async function createPost(options) {
    const { schedulerResult, context } = options;
    const { triggerType, rawData, eventName } = schedulerResult;
    logger_1.logger.info('Creating post', { triggerType, eventName: eventName ?? undefined });
    // Evergreen: use pre-built captions from the bank
    const isEvergreen = triggerType.startsWith('evergreen_');
    let captionX;
    let captionIG;
    let usedFallback = false;
    if (isEvergreen && rawData.captionX && rawData.captionIG) {
        captionX = rawData.captionX;
        captionIG = rawData.captionIG;
    }
    else {
        const result = await (0, claude_1.generateCaptions)(triggerType, context, rawData);
        captionX = result.captionX;
        captionIG = result.captionIG;
        usedFallback = result.usedFallback;
    }
    // Resolve template and fields
    const { templateId, fields } = resolveTemplateFields(schedulerResult, context);
    // Generate image
    const imageBuffer = await (0, imageGen_1.generateImage)(templateId, fields);
    // Upload PNG to Vercel Blob
    const postIdTemp = `${triggerType}-${Date.now()}`;
    const { url: imageBlobUrl, key: imageBlobKey } = await uploadToBlob(imageBuffer, `posts/${postIdTemp}.png`, 'image/png');
    // Build trigger label
    const triggerLabel = `${triggerType.replace(/_/g, ' ')} · ${eventName ?? 'Evergreen'}`;
    // Save to queue
    const post = await (0, db_1.createQueuedPost)({
        triggerType,
        triggerLabel,
        eventName: eventName ?? null,
        eventTier: context.tournament.tier,
        graphicType: templateId,
        captionX,
        captionIG,
        imageBlobUrl,
        imageBlobKey,
        rawData,
        context: context,
        weatherContext: context.weather ?? null,
    });
    if (usedFallback) {
        logger_1.logger.warn('Used fallback captions — Claude API was unavailable', { triggerType });
    }
    // If evergreen, mark item used
    if (isEvergreen && rawData.contentId) {
        await (0, db_1.markEvergreenUsed)(rawData.contentId).catch(() => {
            logger_1.logger.warn('Failed to mark evergreen item used', { postId: post.id });
        });
    }
    return { ...post, imageBuffer };
}
// ─── Fire posting ─────────────────────────────────────────────────────────────
async function firePosting(postId) {
    logger_1.logger.info('firePosting started', { postId });
    // Atomic approve — returns null if already approved/expired (race condition protection)
    const post = await (0, db_1.atomicApprove)(postId);
    if (!post) {
        logger_1.logger.warn('firePosting: post not in pending state (already handled or expired)', { postId });
        return;
    }
    // Fetch PNG from blob
    const pngBuffer = await fetchBlobAsBuffer(post.imageBlobUrl);
    // Extend to 1080×1350 (Instagram 4:5) unless already tall (player-hero is 1350)
    const igPngBuffer = post.graphicType === 'player-hero'
        ? pngBuffer
        : await (0, imageGen_1.extendForInstagram)(pngBuffer);
    // Convert to JPEG for Instagram
    const sharpLib = (await Promise.resolve().then(() => __importStar(require('sharp')))).default;
    const jpegBuffer = await sharpLib(igPngBuffer)
        .jpeg({ quality: 92 })
        .toBuffer();
    // Upload JPEG to blob (separate key for Instagram)
    const { url: jpegBlobUrl } = await uploadToBlob(jpegBuffer, `posts/${postId}-instagram.jpg`, 'image/jpeg');
    // Post to both platforms simultaneously
    const isTextOnly = post.graphicType === null || post.triggerType === 'evergreen_stat_of_week';
    const [twitterResult, instagramResult] = await Promise.allSettled([
        isTextOnly ? (0, twitter_1.postTextTweet)(post.captionX) : (0, twitter_1.postToTwitter)(post.captionX, pngBuffer),
        isTextOnly ? Promise.reject(new Error('Text-only post — no Instagram')) : (0, instagram_1.postToInstagram)(post.captionIG, jpegBlobUrl),
    ]);
    // Determine final status
    const xOk = twitterResult.status === 'fulfilled';
    const igOk = instagramResult.status === 'fulfilled';
    const finalStatus = xOk && igOk ? 'posted' : !xOk && !igOk ? 'failed' : 'partial';
    logger_1.logger.info(`firePosting result: ${finalStatus}`, { postId });
    // Log to post_log
    await (0, db_1.logPostResult)(postId, {
        queueId: postId,
        triggerType: post.triggerType,
        eventName: post.eventName,
        eventTier: post.eventTier,
        graphicType: post.graphicType,
        status: finalStatus,
        twitterSuccess: xOk,
        twitterPostId: xOk ? twitterResult.value.postId : null,
        twitterUrl: xOk ? twitterResult.value.postUrl : null,
        twitterError: !xOk ? String(twitterResult.reason) : null,
        instagramSuccess: igOk,
        instagramPostId: igOk ? instagramResult.value.postId : null,
        instagramUrl: igOk ? instagramResult.value.postUrl : null,
        instagramError: !igOk ? String(instagramResult.reason) : null,
        wasEdited: post.editCount > 0,
        editCount: post.editCount,
    });
    // Update queue status
    await (0, db_1.updateQueueStatus)(postId, finalStatus, {
        twitterPostId: xOk ? twitterResult.value.postId : null,
        twitterUrl: xOk ? twitterResult.value.postUrl : null,
        instagramPostId: igOk ? instagramResult.value.postId : null,
        instagramUrl: igOk ? instagramResult.value.postUrl : null,
        postedAt: new Date(),
    });
    // Send Telegram confirmation
    await (0, telegram_1.sendPostConfirmation)(post, twitterResult, instagramResult);
    // Clean up JPEG blob (PNG stays for 48h in case needed)
    (0, blob_1.del)(jpegBlobUrl, { token: config_1.config.blob.token }).catch(() => { });
}
// ─── Edit flow ────────────────────────────────────────────────────────────────
async function processEditInstruction(postId, instruction, platform) {
    await (0, db_1.updateQueueStatus)(postId, 'pending_edit_regenerating');
    const post = await (0, db_1.getQueuedPost)(postId);
    const context = post.context;
    // Regenerate only the requested platform(s) — never re-fetch data
    let newCaptionX = post.captionX;
    let newCaptionIG = post.captionIG;
    if (platform === 'twitter' || platform === 'both') {
        const result = await (0, claude_1.regenerateCaption)({
            currentCaption: post.captionX,
            rawData: post.rawData,
            context,
            editInstruction: instruction,
            platform,
        });
        if (!result.usedFallback)
            newCaptionX = result.caption;
    }
    if (platform === 'instagram' || platform === 'both') {
        const result = await (0, claude_1.regenerateCaption)({
            currentCaption: post.captionIG,
            rawData: post.rawData,
            context,
            editInstruction: instruction,
            platform,
        });
        if (!result.usedFallback)
            newCaptionIG = result.caption;
    }
    await (0, db_1.saveEditResult)(postId, instruction, platform, newCaptionX, newCaptionIG);
    // Re-read updated post for preview
    const updatedPost = await (0, db_1.getQueuedPost)(postId);
    // Send new preview with updated captions and approval keyboard
    const msgId = await (0, telegram_1.sendUpdatedPreview)(updatedPost, platform);
    await (0, db_1.updateQueueStatus)(postId, 'pending', { telegramMessageId: msgId });
}
// ─── Expiry handler ───────────────────────────────────────────────────────────
async function handleExpiredPost(postId, telegramMessageId, triggerLabel) {
    if (telegramMessageId) {
        await (0, telegram_1.sendExpiryNotice)(triggerLabel);
    }
    logger_1.logger.info('Post expired', { postId });
}
//# sourceMappingURL=queue.js.map