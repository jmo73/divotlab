/**
 * Evergreen: SG category leaders — #1 player on tour in each of the four
 * strokes-gained categories right now (L24 baseline). Rotates weekly angle:
 *   week 0 mod 4 → overall leaders
 *   week 1 mod 4 → biggest gap between #1 and #2 in each category
 *   week 2 mod 4 → players who lead in 2+ categories simultaneously
 *   week 3 mod 4 → leader in the "rarest" category (smallest margin over avg)
 *
 * Fires any time — no active tournament needed.
 *
 * Run from /autopilot:
 *   npx tsx scripts/post-evergreen-stat-leaders.ts
 */
declare function main(): Promise<void>;
export { main as run };
//# sourceMappingURL=post-evergreen-stat-leaders.d.ts.map