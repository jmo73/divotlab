/**
 * Context enrichment layer.
 * Assembles the PostContext object from DataGolf + weather data.
 * Stored as JSONB in autopilot_queue.context so caption regeneration
 * never needs to re-fetch.
 *
 * Read CONTENT_QUALITY.md before modifying any logic here.
 */
import { type WeatherContext } from './weather';
import type { TriggerType, EventTier, InsightFlags } from './types';
export interface PlayerContext {
    name: string;
    dgRating: number;
    dgRatingPercentile: number;
    courseHistory: {
        timesPlayed: number;
        avgFinish: number;
        bestFinish: number;
        sgAppAvg: number;
    };
    recentForm: {
        last5EventsAvgSg: number;
        trend: 'improving' | 'declining' | 'stable';
    };
    vsFieldAvg: {
        sgTotal: number;
        sgApp: number;
        sgPutt: number;
    };
}
export interface PostContext {
    tournament: {
        name: string;
        course: string;
        tier: EventTier;
        historicalScoringAvg: number;
        fieldStrengthRank: number;
        isFirstRound: boolean;
    };
    weather: WeatherContext;
    field: {
        avgDgRating: number;
        topRatedInField: string;
        fieldStrengthLabel: string;
    };
    player?: PlayerContext;
    insightFlags: InsightFlags;
}
export interface TriggerRawData {
    eventName: string;
    courseName?: string;
    eventId?: number;
    round?: number;
    roundDate?: Date;
    playerName?: string;
    playerDgId?: number;
    lat?: number;
    lng?: number;
}
export declare function selectTemplate(triggerType: TriggerType, insightFlags: InsightFlags): string;
export declare function buildPostContext(triggerType: TriggerType, rawData: TriggerRawData): Promise<PostContext>;
export declare function buildContextSummary(context: PostContext): string;
//# sourceMappingURL=enrichment.d.ts.map