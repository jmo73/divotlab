/**
 * Evergreen: DG vs OWGR divergence — finds the player the DataGolf model
 * rates most differently (higher) than the Official World Golf Ranking.
 * Always fresh because rankings change week to week.
 * Fires any time — no active tournament needed.
 *
 * Run from /autopilot:
 *   npx tsx scripts/post-evergreen-rankings.ts
 */
declare function main(): Promise<void>;
export { main as run };
//# sourceMappingURL=post-evergreen-rankings.d.ts.map