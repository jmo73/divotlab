"use strict";
/**
 * Shared publish helper — used by all content scripts.
 *
 * Flow (webhook-based, no long-polling):
 * 1. Renders JPEG, uploads to Vercel Blob.
 * 2. Stores pending post in KV (`autopilot:pub:{postId}`) with 6-hour TTL.
 * 3. Sends Telegram message with approve/skip buttons.
 * 4. Returns immediately — laptop can be closed.
 *
 * When the user taps a button on their phone, Telegram fires the webhook at
 * /api/autopilot/telegram/webhook → telegramWebhook.ts handlePublisherTap()
 * which retrieves the KV data, posts to X + IG, and sends confirmation.
 *
 * Callback data format: `pub:{action}:{postId}`
 *   action = post_x_ig | post_x_image | post_x_text | skip
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
exports.tgNotify = tgNotify;
exports.publish = publish;
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });
}
const blob_1 = require("@vercel/blob");
const kv_1 = require("./kv");
// ─── Telegram helpers ─────────────────────────────────────────────────────────
const TG_API = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const CHAT_ID = () => process.env.TELEGRAM_CHAT_ID;
async function tgSendPhoto(buf, caption, buttons) {
    const form = new FormData();
    form.append('chat_id', CHAT_ID());
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
    form.append('photo', new Blob([new Uint8Array(buf)], { type: 'image/png' }), 'card.png');
    if (buttons.length)
        form.append('reply_markup', JSON.stringify({ inline_keyboard: buttons }));
    const res = await fetch(`${TG_API()}/sendPhoto`, { method: 'POST', body: form });
    const json = await res.json();
    if (!json.ok)
        throw new Error(`Telegram sendPhoto failed: ${json.description}`);
}
async function tgSendText(text, buttons) {
    const res = await fetch(`${TG_API()}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: CHAT_ID(),
            text,
            parse_mode: 'HTML',
            ...(buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {}),
        }),
    });
    const json = await res.json();
    if (!json.ok)
        throw new Error(`Telegram sendMessage failed: ${json.description}`);
}
async function tgNotify(text) {
    await fetch(`${TG_API()}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID(), text, parse_mode: 'HTML' }),
    }).catch(() => { });
}
// ─── Image helpers ────────────────────────────────────────────────────────────
async function pngToJpeg(buf) {
    const sharp = (await Promise.resolve().then(() => __importStar(require('sharp')))).default;
    return sharp(buf).jpeg({ quality: 92 }).toBuffer();
}
async function uploadToBlob(jpeg, label) {
    const slug = label.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const result = await (0, blob_1.put)(`autopilot/${slug}-${Date.now()}.jpg`, jpeg, {
        access: 'public',
        token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return result.url;
}
// ─── Credential checks ────────────────────────────────────────────────────────
function hasXCreds() {
    return !!(process.env.X_API_KEY && process.env.X_API_KEY_SECRET &&
        process.env.X_ACCESS_TOKEN && process.env.X_ACCESS_TOKEN_SECRET);
}
function hasIGCreds() {
    return !!(process.env.INSTAGRAM_USER_ID && process.env.INSTAGRAM_ACCESS_TOKEN &&
        process.env.BLOB_READ_WRITE_TOKEN);
}
// ─── Main publish function ────────────────────────────────────────────────────
async function publish(opts) {
    const { pngBuf, tweet: baseTweet, igCaption, tgPreview, label, link } = opts;
    const postId = `pub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const raw = link ? `${baseTweet}\n\n${link}` : baseTweet;
    const tweet = raw.length > 275 ? raw.slice(0, 274).replace(/\s\S+$/, '') + '…' : raw;
    if (raw.length > 275)
        console.warn(`[publisher] Tweet truncated: ${raw.length} → ${tweet.length} chars`);
    // Enforce Instagram 5-hashtag max
    let safeIgCaption = igCaption;
    if (igCaption) {
        const tags = igCaption.match(/#\w+/g) ?? [];
        if (tags.length > 5) {
            console.warn(`[publisher] IG caption has ${tags.length} hashtags — trimming to 5`);
            let trimmed = igCaption;
            tags.slice(5).forEach(t => { trimmed = trimmed.replace(t, '').replace(/\s{2,}/g, ' ').trim(); });
            safeIgCaption = trimmed;
        }
    }
    const canX = hasXCreds();
    const canIG = hasIGCreds() && !!safeIgCaption && !!pngBuf;
    console.log(`[publisher] ${label}`);
    console.log(`  X: ${canX ? '✓' : '✗ missing creds'}  |  IG: ${canIG ? '✓' : '✗'}`);
    // Upload JPEG to Blob now (webhook needs a URL to fetch from, not a buffer)
    let jpegBlobUrl;
    if (pngBuf) {
        const jpeg = await pngToJpeg(pngBuf);
        jpegBlobUrl = await uploadToBlob(jpeg, label);
        console.log(`  ✓ JPEG uploaded: ${jpegBlobUrl}`);
    }
    // Store pending post in KV — 6-hour window to approve
    const pending = { tweet, igCaption: safeIgCaption, jpegBlobUrl, label };
    await (0, kv_1.kvSet)(`autopilot:pub:${postId}`, pending, 6 * 60 * 60);
    // Build Telegram buttons
    const buttons = [];
    if (pngBuf) {
        const row1 = [];
        if (canX && canIG)
            row1.push({ text: '📷 X + Instagram', callback_data: `pub:post_x_ig:${postId}` });
        if (canX)
            row1.push({ text: '📷 X only', callback_data: `pub:post_x_image:${postId}` });
        if (row1.length)
            buttons.push(row1);
    }
    const row2 = [];
    if (canX)
        row2.push({ text: '📝 Text only (X)', callback_data: `pub:post_x_text:${postId}` });
    row2.push({ text: '✗ Skip', callback_data: `pub:skip:${postId}` });
    buttons.push(row2);
    const divider = '─'.repeat(32);
    const fullCaption = [
        `<b>${label}</b>`,
        divider,
        tgPreview,
        divider,
        `<b>TWEET (${tweet.length}/280):</b>`,
        tweet,
        ...(safeIgCaption ? [`<b>INSTAGRAM:</b>`, safeIgCaption] : []),
    ].join('\n');
    if (pngBuf) {
        await tgSendPhoto(pngBuf, fullCaption, buttons);
    }
    else {
        await tgSendText(fullCaption, buttons);
    }
    console.log(`  ✓ Queued ${postId} — tap approve on Telegram (6h window)`);
    return { postId };
}
//# sourceMappingURL=publisher.js.map