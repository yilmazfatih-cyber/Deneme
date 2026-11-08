/**
 * S1 Kayan Şantiye — sliding site (docs/OBSTACLES.md S1; docs/GDD.md K-22, K-25, K-26; first level 5).
 *
 * Rule: `build.mode = "segments"` with 2–5 segments; only the active segment is on the site. When it is complete
 * (K-15) in K-35 step 8 the site shifts to the next segment, which comes empty, and the batch with
 * `forSegment` = completed segments joins the end of the truck queue; step 9 delivers the queue FIFO. After the last
 * segment there is no shift: step 11 checks the win.
 *
 * The behaviour is the `segments` site strategy (core/site.ts) and the delivery (core/delivery.ts), which the
 * pipeline runs for every segments level (a one-segment level is the trivial case), so this plugin has no hook. It
 * applies when the level's data signature has S1 (segments mode and ≥ 2 segments, K-45/9).
 */
import type { ObstacleRule } from './types.ts';
import { defineRule, obstacleInfoKey, usesMechanic } from './types.ts';

export const S1_slidingSite: ObstacleRule = defineRule({
  id: 'S1',
  zone: 'site',
  order: 301,
  infoKeys: [obstacleInfoKey('S1')],
  appliesTo: (lvl) => usesMechanic(lvl, 'S1'),
});
