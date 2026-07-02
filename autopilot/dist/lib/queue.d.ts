/**
 * Post queue manager and posting orchestrator.
 * Ties together: image gen → caption gen → blob upload → DB → Telegram approval.
 * On approval: PNG → JPEG → X post + IG post → DB update → Telegram confirmation.
 */
import type { QueuedPost, SchedulerResult, EditPlatform } from './types';
import type { PostContext } from './enrichment';
interface CreatePostOptions {
    schedulerResult: SchedulerResult;
    context: PostContext;
}
export declare function createPost(options: CreatePostOptions): Promise<QueuedPost & {
    imageBuffer: Buffer;
}>;
export declare function firePosting(postId: string): Promise<void>;
export declare function processEditInstruction(postId: string, instruction: string, platform: EditPlatform): Promise<void>;
export declare function handleExpiredPost(postId: string, telegramMessageId: number | null, triggerLabel: string): Promise<void>;
export {};
//# sourceMappingURL=queue.d.ts.map