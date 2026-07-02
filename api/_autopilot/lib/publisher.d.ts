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
export interface PublishOptions {
    pngBuf?: Buffer;
    tweet: string;
    igCaption?: string;
    tgPreview: string;
    label: string;
    link?: string;
}
export interface PendingPost {
    tweet: string;
    igCaption?: string;
    jpegBlobUrl?: string;
    label: string;
}
export interface PublishResult {
    postId: string;
}
export declare function tgNotify(text: string): Promise<void>;
export declare function publish(opts: PublishOptions): Promise<PublishResult>;
//# sourceMappingURL=publisher.d.ts.map