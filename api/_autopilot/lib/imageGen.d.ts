import type { TemplateId } from './types';
export declare function escapeXml(str: string): string;
export declare function scoreColor(score: number): string;
export declare function formatScore(score: number): string;
export declare function formatSG(sg: number): string;
export declare function dgRatingToBarWidth(rating: number): number;
export declare function fitScoreToBarWidth(fitScore: number): number;
export declare function generateImage(templateId: TemplateId, fields: Record<string, string>): Promise<Buffer>;
export declare function extendForInstagram(pngBuffer: Buffer): Promise<Buffer>;
export declare function generatePhotoCard(fields: Record<string, string>, photoUrl: string): Promise<Buffer>;
export declare function leaderboardFields(data: {
    eventName: string;
    courseConditions: string;
    roundBadge: string;
    players: Array<{
        name: string;
        score: number;
        dgRating?: number;
        sgTotal?: number;
    }>;
    insight: string;
    fieldContext: string;
}): Record<string, string>;
export declare function playerStatFields(data: {
    playerName: string;
    contextLine: string;
    badge: string;
    badgeColor: string;
    stats: Array<{
        label: string;
        value: string;
    }>;
    insightLine1: string;
    insightLine2?: string;
}): Record<string, string>;
export declare function modelPickFields(data: {
    eventName: string;
    conditionsSummary: string;
    picks: Array<{
        name: string;
        winPct: string;
        fitScore: number;
        keyStrength: string;
    }>;
    darkHorse: {
        name: string;
        reason: string;
    };
}): Record<string, string>;
export declare function cutLineFields(data: {
    eventName: string;
    cutLine: string;
    players: Array<{
        name: string;
        score: number;
        holesPlayed: number;
    }>;
}): Record<string, string>;
export declare function evergreenFactFields(data: {
    topicBadge: string;
    headline: string;
    subhead: string;
    mainStat: string;
    unitLabel: string;
    supportLines: [string, string?, string?];
}): Record<string, string>;
export declare function quoteInsightFields(data: {
    badge: string;
    quoteLines: [string, string, string?];
    sourceLine: string;
}): Record<string, string>;
export declare function comparisonFields(data: {
    eventRound: string;
    playerA: {
        name: string;
        score: number;
        position: string;
        sgTotal: string;
        sgApproach: string;
        dgRating: string;
    };
    playerB: {
        name: string;
        score: number;
        position: string;
        sgTotal: string;
        sgApproach: string;
        dgRating: string;
    };
    comparisonAngle: string;
}): Record<string, string>;
export declare function courseBreakdownFields(data: {
    courseName: string;
    courseMeta: string;
    rewardsLabel: string;
    histScoring: string;
    fieldAvg: string;
    keyStat: string;
    insightLine1: string;
    insightLine2?: string;
    historicalHook: string;
}): Record<string, string>;
export declare function weatherCardFields(data: {
    eventName: string;
    roundDate: string;
    windSpeed: string;
    windDirection: string;
    tempPrecip: string;
    conditionsFlag: string;
    conditionsFlagColor: string;
    scoringImpact: string;
    historicalContext: string;
}): Record<string, string>;
export declare function playerHeroFields(data: {
    playerName: string;
    score: number;
    tournament: string;
    position: string;
    sgTotal: number;
    sgApproach: number;
    sgPutting: number;
}): Record<string, string>;
export declare function pickResultFields(data: {
    tournament: string;
    playerName: string;
    betLine: string;
    result: 'WIN' | 'LOSS' | 'PUSH';
    resultDetail: string;
    seasonRecord: string;
    seasonUnits: string;
    seasonRoi: string;
    insight: string;
}): Record<string, string>;
export declare function modelPicksFields(data: {
    eventName: string;
    badge?: string;
    picks: Array<{
        name: string;
        winPct: string;
        fitScore: number;
        keyStrength: string;
    }>;
    darkHorse: {
        name: string;
        reason: string;
    };
}): Record<string, string>;
export declare function cutAlertFields(data: {
    eventName: string;
    cutLine: string;
    players: Array<{
        name: string;
        score: number;
        status: 'MADE' | 'MISSED';
        isPick: boolean;
    }>;
}): Record<string, string>;
export declare function spotlightFields(data: {
    badge: string;
    playerName: string;
    context: string;
    heroLabel: string;
    heroValue: string;
    heroColor: string;
    heroSub: string;
    stats: Array<{
        label: string;
        value: string;
    }>;
    insight: string;
}): Record<string, string>;
export declare function courseProfileFields(data: {
    badge?: string;
    courseName: string;
    courseMeta: string;
    rewards: string;
    histScoring: string;
    fieldAvg: string;
    keyStat: string;
    insight: string;
}): Record<string, string>;
export declare function weatherFields(data: {
    badge?: string;
    eventName: string;
    roundDate: string;
    windSpeed: string;
    windArrowDeg: string;
    windDir: string;
    windDirTemp: string;
    conditionsFlag: string;
    conditionsColor: string;
    scoringImpact: string;
    histContext: string;
}): Record<string, string>;
//# sourceMappingURL=imageGen.d.ts.map