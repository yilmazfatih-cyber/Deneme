/**
 * Which block a touch picks (docs/TECH_DESIGN.md §10.3; UX_FLOWS §0.1, §0.3). Pure: reads the state, changes nothing.
 *
 * One invisible board zone takes every touch; the block under the finger is found from the occupancy grids (`yardOcc`,
 * `siteOcc` of the visible segment), never with per-block Phaser hit tests. Every block cell is grown by
 * `touch.hitSlopPx` on each side (120 → 180 px); when several blocks cover the point, the touch goes to the block with
 * the nearest cell centre. Whether that block may be picked is the core's decision (`tryBeginDrag`, K-09, K-14).
 */
import { BOARD_ROWS, GRID_ROWS, SITE_COLS, SITE_X, YARD_COLS } from '../../core/coords.ts';
import { visibleSegment } from '../../core/grid.ts';
import { H, hdr, siteOcc, yardOcc } from '../../core/state.ts';
import type { GameState } from '../../core/state.ts';
import type { PieceId } from '../../core/types.ts';
import type { Rect } from '../../theme/layout.ts';

/** The part of `theme/layout.ts` BoardGeometry the hit test needs. */
export interface HitGeometry {
  cellRect(x: number, y: number): Rect;
}

/** The piece whose (slop-grown) cell holds `(px, py)` with the nearest cell centre; null when none. */
export function pieceAtPoint(
  s: GameState,
  geom: HitGeometry,
  px: number,
  py: number,
  slopPx: number,
): PieceId | null {
  let best: PieceId | null = null;
  let bestD = Infinity;
  const consider = (occ: number, x: number, y: number): void => {
    if (occ <= 0) return; // empty, obstacle (< 0) or Golden Trowel cell
    const r = geom.cellRect(x, y);
    if (px < r.x - slopPx || px >= r.x + r.w + slopPx || py < r.y - slopPx || py >= r.y + r.h + slopPx)
      return;
    const dx = px - (r.x + r.w / 2);
    const dy = py - (r.y + r.h / 2);
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = occ - 1;
    }
  };
  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < YARD_COLS; x++) consider(yardOcc(s, x, y), x, y);
  }
  const seg = visibleSegment(s);
  if (seg < s.lvl.segments.length) {
    const elev = hdr(s, H.elev);
    for (let sy = 0; sy < BOARD_ROWS; sy++) {
      const y = sy + elev;
      if (y >= GRID_ROWS) break;
      for (let sx = 0; sx < SITE_COLS; sx++) consider(siteOcc(s, seg, sx, sy), SITE_X + sx, y);
    }
  }
  return best;
}
