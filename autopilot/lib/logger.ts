/**
 * Structured logger for the autopilot pipeline.
 * All log entries go to console (picked up by Vercel logs) and key events
 * are persisted to autopilot_cron_log via db.ts.
 */

import { logCronRun } from './db'
import type { TriggerType, TournamentStatus, CronLogEntry } from './types'

export interface LogContext {
  [key: string]: unknown
  jobName?: string
  triggerType?: TriggerType
  postId?: string
  eventName?: string
  tournamentStatus?: TournamentStatus
}

function timestamp(): string {
  return new Date().toISOString()
}

export const logger = {
  info(message: string, ctx?: LogContext): void {
    console.log(JSON.stringify({ level: 'info', ts: timestamp(), message, ...ctx }))
  },

  warn(message: string, ctx?: LogContext): void {
    console.warn(JSON.stringify({ level: 'warn', ts: timestamp(), message, ...ctx }))
  },

  error(message: string, err?: unknown, ctx?: LogContext): void {
    const errMsg = err instanceof Error ? err.message : String(err ?? '')
    const stack = err instanceof Error ? err.stack : undefined
    console.error(JSON.stringify({ level: 'error', ts: timestamp(), message, error: errMsg, stack, ...ctx }))
  },
}

// ─── Cron run logging ─────────────────────────────────────────────────────────

export class CronLogger {
  private entry: Partial<CronLogEntry>
  private startedAt: number

  constructor(jobName: string) {
    this.entry = { jobName }
    this.startedAt = Date.now()
    logger.info(`Cron started: ${jobName}`)
  }

  setTournamentStatus(status: TournamentStatus, eventName?: string): void {
    this.entry.tournamentStatus = status
    if (eventName) this.entry.eventName = eventName
    logger.info(`Tournament status: ${status}`, { eventName })
  }

  setTriggerSelected(triggerType: TriggerType): void {
    this.entry.triggerSelected = triggerType
    logger.info(`Trigger selected: ${triggerType}`)
  }

  setSkipReason(reason: string): void {
    this.entry.skipReason = reason
    logger.info(`Skip: ${reason}`)
  }

  setError(err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err)
    this.entry.error = msg
    logger.error('Cron error', err)
  }

  async flush(): Promise<void> {
    const durationMs = Date.now() - this.startedAt
    logger.info(`Cron complete in ${durationMs}ms`, { jobName: this.entry.jobName })
    try {
      await logCronRun({ ...this.entry, durationMs } as CronLogEntry)
    } catch (err) {
      logger.error('Failed to write cron log', err)
    }
  }
}
