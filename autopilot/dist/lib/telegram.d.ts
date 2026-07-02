/**
 * Telegram Bot API client for the autopilot approval gate.
 * No SDK — calls the Telegram Bot API directly via fetch.
 * Webhook endpoint is in api/server.js (added in Phase 11).
 *
 * Critical rule: the webhook handler MUST always return 200.
 * Telegram disables webhooks that return errors repeatedly.
 */
import type { QueuedPost, EditPlatform } from './types';
type InlineKeyboard = Array<Array<{
    text: string;
    callback_data: string;
}>>;
export interface TelegramMessage {
    message_id: number;
    chat: {
        id: number;
    };
    text?: string;
}
export declare function sendTelegramMessage(text: string, inlineKeyboard?: InlineKeyboard): Promise<TelegramMessage>;
export declare function editTelegramMessage(messageId: number, text: string, inlineKeyboard?: InlineKeyboard): Promise<void>;
export declare function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void>;
/**
 * Send the full approval flow: image + caption preview + keyboard.
 * Returns the message_id of the text message (used to edit later).
 */
export declare function sendApprovalMessage(post: QueuedPost, imageBuffer: Buffer): Promise<number>;
export declare function sendEditPrompt(post: QueuedPost, platform: EditPlatform): Promise<number>;
export declare function sendUpdatedPreview(post: QueuedPost, platform: EditPlatform): Promise<number>;
export declare function sendPostConfirmation(post: QueuedPost, twitterResult: PromiseSettledResult<{
    postId: string;
    postUrl: string;
}>, instagramResult: PromiseSettledResult<{
    postId: string;
    postUrl: string;
}>): Promise<void>;
export declare function sendExpiryNotice(triggerLabel: string): Promise<void>;
export {};
//# sourceMappingURL=telegram.d.ts.map