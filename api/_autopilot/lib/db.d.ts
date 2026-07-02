import type { QueuedPost, QueueStatus, EditPlatform, PostLogEntry, EvergreenItem, WeatherContext, CronLogEntry, TriggerType, TemplateId, PostContext } from './types';
export declare function createQueuedPost(data: {
    triggerType: TriggerType;
    triggerLabel: string;
    eventName: string | null;
    eventTier: QueuedPost['eventTier'];
    graphicType: TemplateId | null;
    captionX: string;
    captionIG: string;
    imageBlobUrl: string;
    imageBlobKey: string;
    rawData: Record<string, unknown>;
    context: PostContext;
    weatherContext: WeatherContext | null;
}): Promise<QueuedPost>;
export declare function getQueuedPost(id: string): Promise<QueuedPost>;
export declare function updateQueueStatus(id: string, status: QueueStatus, extra?: {
    twitterPostId?: string | null;
    twitterUrl?: string | null;
    instagramPostId?: string | null;
    instagramUrl?: string | null;
    postedAt?: Date;
    telegramMessageId?: number;
    telegramSentAt?: Date;
    errorMessage?: string;
    editPlatform?: string | null;
    skippedAt?: Date;
}): Promise<void>;
export declare function atomicApprove(id: string): Promise<QueuedPost | null>;
export declare function getPendingEditPost(): Promise<QueuedPost | null>;
export declare function saveEditResult(id: string, instruction: string, platform: EditPlatform, newCaptionX: string, newCaptionIG: string): Promise<void>;
export declare function expireOldPendingPosts(): Promise<{
    id: string;
    telegramMessageId: number | null;
}[]>;
export declare function checkDeduplication(triggerType: TriggerType): Promise<boolean>;
export declare function logPostResult(queueId: string, result: PostLogEntry): Promise<void>;
export declare function getNextEvergreenItem(triggerType: TriggerType): Promise<EvergreenItem | null>;
export declare function markEvergreenUsed(contentId: string): Promise<void>;
export declare function getWeatherCache(courseKey: string, date: Date): Promise<WeatherContext | null>;
export declare function setWeatherCache(courseKey: string, date: Date, lat: number, lng: number, rawResponse: unknown, interpreted: WeatherContext): Promise<void>;
export declare function logCronRun(entry: CronLogEntry): Promise<void>;
export declare function getDashboardData(): Promise<{
    recentQueue: QueuedPost[];
    cronLog: unknown[];
    statusCounts: Record<string, number>;
}>;
//# sourceMappingURL=db.d.ts.map