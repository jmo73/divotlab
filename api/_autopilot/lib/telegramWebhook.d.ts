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
interface TelegramCallbackQuery {
    id: string;
    data: string;
    message: {
        message_id: number;
        chat: {
            id: number;
        };
    };
}
interface TelegramMessage {
    message_id: number;
    chat: {
        id: number;
    };
    text?: string;
}
interface TelegramUpdate {
    callback_query?: TelegramCallbackQuery;
    message?: TelegramMessage;
}
export declare function handleTelegramUpdate(update: TelegramUpdate): Promise<void>;
export {};
//# sourceMappingURL=telegramWebhook.d.ts.map