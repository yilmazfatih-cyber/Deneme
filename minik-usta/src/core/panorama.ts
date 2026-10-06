/**
 * Build panorama view (docs/GDD.md K-06; UX_FLOWS §5.1; TECH_DESIGN §10.3): the small preview of every segment above
 * the board. Completed segments are drawn in full colour, the active segment framed, future segments with plan colours
 * at `alpha.panoramaFuture`. Hidden `?` cells stay `?` until they are revealed (K-32).
 *
 * A pure read of the state: building the view (and opening / closing the large preview that shows it) never changes
 * the game state (K-06). The UI (`Panorama`, TECH §1.2) draws exactly this data.
 */
import { COLOR_CODES } from './types.ts';
import type { ColorCode } from './types.ts';
import { SITE_COLS } from './coords.ts';
import { revealedMask } from './state.ts';
import type { GameState } from './state.ts';
import { PLAN_DOT, PLAN_OUTSIDE } from './level/compile.ts';
import { visibleSegment } from './grid.ts';
import { isSegmentComplete } from './placement.ts';

/** `done` (K-15, full colour) · `active` (the segment on the site, framed) · `future` (faded plan). */
export type PanoramaStatus = 'done' | 'active' | 'future';

/** A plan cell: its colour, `?` (hidden, not revealed yet), `.` (stays empty, S2) or null (outside the plan). */
export type PanoramaCell = ColorCode | '?' | '.' | null;

export interface PanoramaSegment {
  readonly index: number;
  readonly status: PanoramaStatus;
  /** Plan rows top → bottom (`height` rows), two cells each (site columns 6, 7). */
  readonly rows: readonly (readonly PanoramaCell[])[];
}

/** K-06: one entry per segment, in level order. Reads the state only. */
export function panoramaView(s: GameState): PanoramaSegment[] {
  const shown = visibleSegment(s);
  return s.lvl.segments.map((seg) => {
    const status: PanoramaStatus = isSegmentComplete(s, seg.index)
      ? 'done'
      : seg.index === shown
        ? 'active'
        : 'future';
    const revealed = revealedMask(s, seg.index);
    const rows: PanoramaCell[][] = [];
    for (let sy = seg.height - 1; sy >= 0; sy--) {
      const row: PanoramaCell[] = [];
      for (let sx = 0; sx < SITE_COLS; sx++) {
        const local = sy * SITE_COLS + sx;
        const color = seg.planColors[local] ?? PLAN_OUTSIDE;
        if (color === PLAN_OUTSIDE) row.push(null);
        else if (color === PLAN_DOT) row.push('.');
        else if ((seg.hiddenMask >> local) & 1 && !((revealed >> local) & 1)) row.push('?');
        else row.push(COLOR_CODES[color] ?? null);
      }
      rows.push(row);
    }
    return { index: seg.index, status, rows };
  });
}
