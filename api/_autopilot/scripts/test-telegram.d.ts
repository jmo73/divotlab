/**
 * Send a test approval message to Telegram.
 * Uses a real queue entry with sample data.
 *
 * Usage: npx tsx autopilot/scripts/test-telegram.ts
 *
 * Steps to test:
 *   1. Run this script — approval message appears in Telegram
 *   2. Tap "✓ Approve" — expect "Posting now..." (posting will fail at this stage, expected)
 *   3. Tap "✎ Edit Both" — expect edit prompt
 *   4. Type "Make it shorter" — expect regenerated preview
 *   5. Tap "✗ Skip" — expect "Skipped." message
 */
export {};
//# sourceMappingURL=test-telegram.d.ts.map