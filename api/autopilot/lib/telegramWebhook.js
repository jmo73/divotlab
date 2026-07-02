"use strict";
/**
 * Telegram webhook handler — called from api/server.js Telegram webhook route.
 * Routes button taps (callback_query) and text messages to the correct handler.
 *
 * Two post flows:
 * 1. cronHandler posts (Postgres-backed): action:postId  e.g. "approve:uuid"
 * 2. publisher.ts posts (KV-backed):      pub:action:postId  e.g. "pub:post_x_ig:pub_123_abc"
 *
 * State machine for cronHandler flow:
 *   pending → pending_edit → pending_edit_regenerating → pending → approved → posted
 *
 * Critical: always returns without throwing — exceptions are caught by the route handler.
 * The route always sends 200 before calling this function.
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
exports.handleTelegramUpdate = handleTelegramUpdate;
const telegram_1 = require("./telegram");
const db_1 = require("./db");
const queue_1 = require("./queue");
const logger_1 = require("./logger");
const kv_1 = require("./kv");
// ─── Main entry point ─────────────────────────────────────────────────────────
async function handleTelegramUpdate(update) {
    if (update.callback_query) {
        await handleCallbackQuery(update.callback_query);
        // Always answer callback to dismiss Telegram's loading spinner on the button
        await (0, telegram_1.answerCallbackQuery)(update.callback_query.id).catch(() => { });
        return;
    }
    if (update.message?.text) {
        await handleTextMessage(update.message);
        return;
    }
}
// ─── Callback query (button taps) ─────────────────────────────────────────────
async function handleCallbackQuery(query) {
    const parts = query.data.split(':');
    const action = parts[0];
    // publisher.ts posts: `pub:{action}:{postId}` (3 parts)
    if (action === 'pub') {
        const pubAction = parts[1];
        const pubPostId = parts[2];
        if (pubAction && pubPostId) {
            await handlePublisherTap(pubPostId, pubAction);
        }
        else {
            logger_1.logger.warn('Malformed pub callback', { data: query.data });
        }
        return;
    }
    // cronHandler posts: `{action}:{postId}` (2 parts)
    const postId = parts[1];
    if (!postId) {
        logger_1.logger.warn('Callback query missing postId', { data: query.data });
        return;
    }
    switch (action) {
        case 'approve':
            await handleApprove(postId);
            break;
        case 'edit_x':
            await handleEditStart(postId, 'twitter');
            break;
        case 'edit_ig':
            await handleEditStart(postId, 'instagram');
            break;
        case 'edit_both':
            await handleEditStart(postId, 'both');
            break;
        case 'skip':
            await handleSkip(postId);
            break;
        case 'cancel':
            await handleEditCancel(postId);
            break;
        default:
            logger_1.logger.warn('Unknown callback action', { action, postId });
    }
}
// ─── publisher.ts tap handler (KV-backed) ────────────────────────────────────
async function handlePublisherTap(postId, action) {
    if (action === 'skip') {
        await (0, kv_1.kvDel)(`autopilot:pub:${postId}`);
        await (0, telegram_1.sendTelegramMessage)('Skipped. No post was made.');
        logger_1.logger.info('Publisher post skipped', { postId });
        return;
    }
    const post = await (0, kv_1.kvGet)(`autopilot:pub:${postId}`);
    if (!post) {
        await (0, telegram_1.sendTelegramMessage)('Post not found — it may have expired (6-hour window).');
        return;
    }
    await (0, telegram_1.sendTelegramMessage)('Posting now...');
    const postWithImage = (action === 'post_x_ig' || action === 'post_x_image') && !!post.jpegBlobUrl;
    let xUrl;
    let igUrl;
    // ── Post to X ───────────────────────────────────────────────────────────────
    try {
        const { TwitterApi } = await Promise.resolve().then(() => __importStar(require('twitter-api-v2')));
        const xClient = new TwitterApi({
            appKey: process.env.X_API_KEY,
            appSecret: process.env.X_API_KEY_SECRET,
            accessToken: process.env.X_ACCESS_TOKEN,
            accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
        });
        if (postWithImage) {
            const imgBuf = Buffer.from(await (await fetch(post.jpegBlobUrl)).arrayBuffer());
            const mediaId = await xClient.v1.uploadMedia(imgBuf, { mimeType: 'image/jpeg', target: 'tweet' });
            const result = await xClient.v2.tweet({ text: post.tweet, media: { media_ids: [mediaId] } });
            xUrl = `https://x.com/divotlab/status/${result.data.id}`;
        }
        else {
            const result = await xClient.v2.tweet({ text: post.tweet });
            xUrl = `https://x.com/divotlab/status/${result.data.id}`;
        }
        logger_1.logger.info('Publisher tap: X posted', { postId, xUrl });
    }
    catch (err) {
        logger_1.logger.error('Publisher tap: X failed', err, { postId });
        await (0, telegram_1.sendTelegramMessage)(`❌ X post failed:\n<code>${err.message}</code>\n\n${post.tweet}`).catch(() => { });
    }
    // ── Post to Instagram ────────────────────────────────────────────────────────
    if (action === 'post_x_ig' && post.jpegBlobUrl && post.igCaption) {
        try {
            const { postToInstagram } = await Promise.resolve().then(() => __importStar(require('./instagram')));
            const result = await postToInstagram(post.igCaption, post.jpegBlobUrl);
            igUrl = result.postUrl;
            logger_1.logger.info('Publisher tap: IG posted', { postId, igUrl });
        }
        catch (err) {
            logger_1.logger.error('Publisher tap: IG failed', err, { postId });
            await (0, telegram_1.sendTelegramMessage)(`❌ Instagram failed:\n<code>${err.message}</code>`).catch(() => { });
        }
    }
    // Delete KV entry (done even if posting partially failed)
    await (0, kv_1.kvDel)(`autopilot:pub:${postId}`);
    // Send confirmation
    const lines = ['✅ Posted!'];
    if (xUrl)
        lines.push(`X: ${xUrl}`);
    if (igUrl)
        lines.push(`IG: ${igUrl}`);
    await (0, telegram_1.sendTelegramMessage)(lines.join('\n'));
}
// ─── cronHandler individual handlers ─────────────────────────────────────────
async function handleApprove(postId) {
    // Send "Posting now..." before firing (fire is async)
    await (0, telegram_1.sendTelegramMessage)('Posting now...');
    // Fire asynchronously — do not await so Telegram doesn't time out
    // firePosting handles its own error logging and sends confirmation
    setImmediate(async () => {
        try {
            await (0, queue_1.firePosting)(postId);
        }
        catch (err) {
            logger_1.logger.error('firePosting failed', err, { postId });
            await (0, telegram_1.sendTelegramMessage)(`✗ Posting error: ${err instanceof Error ? err.message : String(err)}`).catch(() => { });
        }
    });
}
async function handleEditStart(postId, platform) {
    // Check post is still pending
    const post = await (0, db_1.getQueuedPost)(postId).catch(() => null);
    if (!post || post.status !== 'pending') {
        await (0, telegram_1.sendTelegramMessage)('This post is no longer waiting — it may have been approved, skipped, or expired.');
        return;
    }
    // Update status and record which platform is being edited
    await (0, db_1.updateQueueStatus)(postId, 'pending_edit', { editPlatform: platform });
    // Send edit prompt with Cancel button
    await (0, telegram_1.sendEditPrompt)(post, platform);
    logger_1.logger.info('Edit started', { postId, platform });
}
async function handleEditCancel(postId) {
    const post = await (0, db_1.getQueuedPost)(postId).catch(() => null);
    if (!post) {
        await (0, telegram_1.sendTelegramMessage)('Post not found.');
        return;
    }
    // Reset to pending
    await (0, db_1.updateQueueStatus)(postId, 'pending', { editPlatform: null });
    await (0, telegram_1.sendTelegramMessage)('Edit cancelled. Post is still pending.');
    logger_1.logger.info('Edit cancelled', { postId });
}
async function handleSkip(postId) {
    const post = await (0, db_1.getQueuedPost)(postId).catch(() => null);
    if (!post || (post.status !== 'pending' && post.status !== 'pending_edit')) {
        await (0, telegram_1.sendTelegramMessage)('This post is no longer active.');
        return;
    }
    await (0, db_1.updateQueueStatus)(postId, 'skipped', { skippedAt: new Date() });
    await (0, telegram_1.sendTelegramMessage)('Skipped. No post was made.');
    logger_1.logger.info('Post skipped', { postId });
}
// ─── Text message handler ─────────────────────────────────────────────────────
async function handleTextMessage(message) {
    const text = message.text?.trim();
    if (!text)
        return;
    // Check if there's a pending_edit post waiting for an instruction
    const pendingEdit = await (0, db_1.getPendingEditPost)();
    if (!pendingEdit) {
        await (0, telegram_1.sendTelegramMessage)('No post is waiting for edits right now.');
        return;
    }
    // Treat the incoming text as the edit instruction
    await (0, telegram_1.sendTelegramMessage)('Got it. Regenerating...');
    const platform = pendingEdit.editPlatform ?? 'both';
    try {
        await (0, queue_1.processEditInstruction)(pendingEdit.id, text, platform);
        logger_1.logger.info('Edit processed', { postId: pendingEdit.id, platform, instruction: text });
    }
    catch (err) {
        logger_1.logger.error('processEditInstruction failed', err, { postId: pendingEdit.id });
        await (0, db_1.updateQueueStatus)(pendingEdit.id, 'pending').catch(() => { });
        await (0, telegram_1.sendTelegramMessage)(`Edit failed: ${err instanceof Error ? err.message : String(err)}\n\nPost is still pending — you can try again.`).catch(() => { });
    }
}
//# sourceMappingURL=telegramWebhook.js.map