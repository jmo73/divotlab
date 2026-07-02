/**
 * Autopilot cron handler — called from api/server.js autopilot cron route.
 * Coordinates: scheduler → enrichment → createPost → sendApprovalMessage.
 * Also handles expiry of stale pending posts.
 */
export declare function runAutopilotCron(jobType: 'tournament' | 'evergreen'): Promise<void>;
//# sourceMappingURL=cronHandler.d.ts.map