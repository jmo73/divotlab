/**
 * Trigger scheduler — selects and fetches data for one trigger per cron run.
 * Priority order from TRIGGERS.md is enforced: one trigger per run, highest
 * priority wins when multiple are eligible.
 *
 * Returns null if no trigger is eligible (cron exits cleanly, no post).
 */
import type { SchedulerResult } from './types';
export declare function runScheduler(jobType: 'tournament' | 'evergreen'): Promise<SchedulerResult | null>;
//# sourceMappingURL=scheduler.d.ts.map