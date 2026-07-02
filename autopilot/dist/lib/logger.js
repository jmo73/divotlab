"use strict";
/**
 * Structured logger for the autopilot pipeline.
 * All log entries go to console (picked up by Vercel logs) and key events
 * are persisted to autopilot_cron_log via db.ts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CronLogger = exports.logger = void 0;
const db_1 = require("./db");
function timestamp() {
    return new Date().toISOString();
}
exports.logger = {
    info(message, ctx) {
        console.log(JSON.stringify({ level: 'info', ts: timestamp(), message, ...ctx }));
    },
    warn(message, ctx) {
        console.warn(JSON.stringify({ level: 'warn', ts: timestamp(), message, ...ctx }));
    },
    error(message, err, ctx) {
        const errMsg = err instanceof Error ? err.message : String(err ?? '');
        const stack = err instanceof Error ? err.stack : undefined;
        console.error(JSON.stringify({ level: 'error', ts: timestamp(), message, error: errMsg, stack, ...ctx }));
    },
};
// ─── Cron run logging ─────────────────────────────────────────────────────────
class CronLogger {
    entry;
    startedAt;
    constructor(jobName) {
        this.entry = { jobName };
        this.startedAt = Date.now();
        exports.logger.info(`Cron started: ${jobName}`);
    }
    setTournamentStatus(status, eventName) {
        this.entry.tournamentStatus = status;
        if (eventName)
            this.entry.eventName = eventName;
        exports.logger.info(`Tournament status: ${status}`, { eventName });
    }
    setTriggerSelected(triggerType) {
        this.entry.triggerSelected = triggerType;
        exports.logger.info(`Trigger selected: ${triggerType}`);
    }
    setSkipReason(reason) {
        this.entry.skipReason = reason;
        exports.logger.info(`Skip: ${reason}`);
    }
    setError(err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.entry.error = msg;
        exports.logger.error('Cron error', err);
    }
    async flush() {
        const durationMs = Date.now() - this.startedAt;
        exports.logger.info(`Cron complete in ${durationMs}ms`, { jobName: this.entry.jobName });
        try {
            await (0, db_1.logCronRun)({ ...this.entry, durationMs });
        }
        catch (err) {
            exports.logger.error('Failed to write cron log', err);
        }
    }
}
exports.CronLogger = CronLogger;
//# sourceMappingURL=logger.js.map