/**
 * "Kalan: {n} hücre" (UX_FLOWS §7 window 1 neutral info, `lose.left`; GDD K-15): plan cells that still have to be
 * filled, over every segment. A pure read of the core state (plan masks of the compiled level, `filledMask`); it never
 * changes the game.
 */
import { SITE_COLS } from '../core/coords.ts';
import { filledMask } from '../core/state.ts';
import type { GameState } from '../core/state.ts';

function popcount(v: number): number {
  let n = 0;
  let x = v >>> 0;
  while (x !== 0) {
    x &= x - 1;
    n += 1;
  }
  return n;
}

export function remainingPlanCells(s: GameState): number {
  let left = 0;
  for (const seg of s.lvl.segments) {
    for (let sx = 0; sx < SITE_COLS; sx++) {
      const need = seg.planMask[sx] ?? 0;
      left += popcount(need & ~filledMask(s, seg.index, sx));
    }
  }
  return left;
}
