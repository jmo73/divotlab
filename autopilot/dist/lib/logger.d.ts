/**
 * Structured logger for the autopilot pipeline.
 * All log entries go to console (picked up by Vercel logs) and key events
 * are persisted to autopilot_cron_log via db.ts.
 */
import type { TriggerType, TournamentStatus } from './types';
export interface LogContext {
    [key: string]: unknown;
    jobName?: string;
    triggerType?: TriggerType;
    postId?: string;
    eventName?: string;
    tournamentStatus?: TournamentStatus;
}
export declare const logger: {
    info(message: string, ctx?: LogContext): void;
    warn(message: string, ctx?: LogContext): void;
    error(message: string, err?: unknown, ctx?: LogContext): void;
};
export declare class CronLogger {
    private entry;
    private startedAt;
    constructor(jobName: string);
    setTournamentStatus(status: TournamentStatus, eventName?: string): void;
    setTriggerSelected(triggerType: TriggerType): void;
    setSkipReason(reason: string): void;
    setError(err: unknown): void;
    flush(): Promise<void>;
}
//# sourceMappingURL=logger.d.ts.map