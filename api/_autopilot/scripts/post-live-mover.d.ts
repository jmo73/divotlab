/**
 * Live mid-round stat leader — fires during an active round (Thu/Sat/Sun afternoon)
 * and highlights who is dominating the key SG category in the current round.
 * Skips cleanly when no tournament is active or a round hasn't progressed far enough.
 *
 * Run from /autopilot:
 *   npx tsx scripts/post-live-mover.ts
 */
declare function main(): Promise<void>;
export { main as run };
//# sourceMappingURL=post-live-mover.d.ts.map