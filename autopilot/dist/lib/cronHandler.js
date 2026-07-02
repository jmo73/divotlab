"use strict";
/**
 * Autopilot cron handler — called from api/server.js autopilot cron route.
 * Coordinates: scheduler → enrichment → createPost → sendApprovalMessage.
 * Also handles expiry of stale pending posts.
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
exports.runAutopilotCron = runAutopilotCron;
const config_1 = require("./config");
const scheduler_1 = require("./scheduler");
const enrichment_1 = require("./enrichment");
const queue_1 = require("./queue");
const telegram_1 = require("./telegram");
const db_1 = require("./db");
const logger_1 = require("./logger");
async function runAutopilotCron(jobType) {
    const cronLog = new logger_1.CronLogger(jobType);
    try {
        (0, config_1.validateEnv)();
        // Expire stale posts and remove their Telegram keyboard buttons
        const expired = await (0, db_1.expireOldPendingPosts)();
        for (const { id, telegramMessageId } of expired) {
            if (telegramMessageId) {
                const post = await (0, db_1.getQueuedPost)(id).catch(() => null);
                const label = post?.triggerLabel ?? id;
                await (0, telegram_1.sendExpiryNotice)(label).catch(() => { });
                await (0, telegram_1.editTelegramMessage)(telegramMessageId, `⏱ Post expired — no action taken.\n\n${label}`, []).catch(() => { });
            }
        }
        // Run scheduler
        const result = await (0, scheduler_1.runScheduler)(jobType);
        if (!result) {
            cronLog.setSkipReason('No eligible trigger');
            await cronLog.flush();
            return;
        }
        cronLog.setTriggerSelected(result.triggerType);
        if (result.tournamentStatus)
            cronLog.setTournamentStatus(result.tournamentStatus, result.eventName ?? undefined);
        // Build enrichment context
        const context = await (0, enrichment_1.buildPostContext)(result.triggerType, {
            eventName: result.eventName ?? '',
            roundDate: new Date(),
            lat: result.lat,
            lng: result.lng,
            ...(result.rawData.playerName ? { playerName: result.rawData.playerName } : {}),
        });
        // For weather_angle trigger: only fire if conditions are actually difficult/severe
        if (result.triggerType === 'weather_angle') {
            const flag = context.weather.conditionsFlag;
            if (flag === 'calm' || flag === 'moderate') {
                cronLog.setSkipReason('Weather angle: conditions not severe enough (calm/moderate)');
                await cronLog.flush();
                return;
            }
        }
        // Create post: image + captions + blob + queue row
        const post = await (0, queue_1.createPost)({ schedulerResult: result, context });
        // Send Telegram approval message
        const telegramMessageId = await (0, telegram_1.sendApprovalMessage)(post, post.imageBuffer);
        // Store the Telegram message ID on the queue row so we can edit it later
        const { updateQueueStatus } = await Promise.resolve().then(() => __importStar(require('./db')));
        await updateQueueStatus(post.id, 'pending', { telegramMessageId });
    }
    catch (err) {
        cronLog.setError(err);
    }
    await cronLog.flush();
}
//# sourceMappingURL=cronHandler.js.map