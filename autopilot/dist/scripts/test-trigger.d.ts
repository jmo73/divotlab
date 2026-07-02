/**
 * Manually fire a trigger with flags:
 *   --trigger=<trigger_type>   Force a specific trigger (bypasses eligibility check)
 *   --dry-run                  Full pipeline: scheduler + enrichment + image + captions, no queue, no Telegram
 *   --queue                    Creates queue entry + Blob upload, no Telegram send
 *   --post-x-only              Full pipeline including X post (real tweet — delete after)
 *   --post-ig-only             Full pipeline including IG post (real post — delete after)
 *   --post-both                Full pipeline including both platforms
 *
 * Usage:
 *   npx tsx autopilot/scripts/test-trigger.ts --trigger=pre_tournament_model_picks --dry-run
 *   npx tsx autopilot/scripts/test-trigger.ts --trigger=evergreen_stat_of_week --queue
 */
export {};
//# sourceMappingURL=test-trigger.d.ts.map