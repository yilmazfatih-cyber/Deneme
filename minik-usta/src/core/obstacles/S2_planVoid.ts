/**
 * S2 Plan Boşluğu — plan void (docs/OBSTACLES.md S2; docs/GDD.md K-15, K-16, K-17, K-34, E-43; first level 4).
 *
 * Rule: a `.` plan cell must stay empty. A block with any cell on a `.` is a wrong placement (verdict reason
 * `window`) and bounces back (K-17). In K-34 a `.` counts as filled only while it is empty: debris (S4) or a stuck
 * mortar block (Y8) in it gives `support` above it. A segment is complete when every non-`.` cell is correctly filled
 * and nothing else is in it, so its `.` cells end empty. The cell above a `.` is filled through a gap (W1 rail), by a
 * 2-wide block bridging both columns over the wall, by a balloon (S8), the Golden Trowel or the crane.
 *
 * The rule is core validation (core/placement.ts `isCorrectPlacement`, `buildFront`, `isSegmentComplete`), shared by
 * the move, the shadow verdict and the trowel, so this plugin has no hook.
 */
import type { ObstacleRule } from './types.ts';
import { defineRule, obstacleInfoKey, usesMechanic } from './types.ts';

export const S2_planVoid: ObstacleRule = defineRule({
  id: 'S2',
  zone: 'site',
  order: 302,
  infoKeys: [obstacleInfoKey('S2')],
  appliesTo: (lvl) => usesMechanic(lvl, 'S2'),
});
