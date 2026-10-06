/**
 * Grid geometry and the wall boundary (docs/GDD.md §0, K-01…K-05; TECH_DESIGN §2.2, R-03 edge model).
 *
 * The core grid is 8 columns × 10 rows; internal coordinates are the global ones (no conversion):
 * x 0–5 yard, x 6–7 site, y 0–7 board, y 8–9 crane area. The wall is the ZERO-WIDTH boundary between x = 5 and
 * x = 6: it has no cells. A row of the boundary is described by bit `y` of a 10-bit row mask.
 */
import type { Anchor, CellIndex, DragNode } from './types.ts';

export const GRID_COLS = 8;
/** Board rows y 0–7 plus crane area rows 8–9. */
export const GRID_ROWS = 10;
export const GRID_CELLS = GRID_COLS * GRID_ROWS;
/** Board height (K-01): playable cells have y ≤ 7. */
export const BOARD_ROWS = 8;
/** First crane-area row (K-05). */
export const CRANE_ROW = 8;
/** Yard x 0–5 (K-02). */
export const YARD_COLS = 6;
/** Site x 6–7 (K-03). */
export const SITE_X = 6;
export const SITE_COLS = 2;
/** Last yard column; the boundary lies between `BOUNDARY_X` and `BOUNDARY_X + 1`. */
export const BOUNDARY_X = 5;
export const YARD_CELLS = YARD_COLS * BOARD_ROWS;
/** Site cells of one segment (local 2 × 8). */
export const SEGMENT_CELLS = SITE_COLS * BOARD_ROWS;
/** All 10 boundary rows. */
export const ROW_MASK_ALL = (1 << GRID_ROWS) - 1;

export function cellIndex(x: number, y: number): CellIndex {
  return y * GRID_COLS + x;
}
export function cellX(cell: CellIndex): number {
  return cell % GRID_COLS;
}
export function cellY(cell: CellIndex): number {
  return Math.floor(cell / GRID_COLS);
}

/** Inside the 8 × 10 grid (board + crane area). K-01: no cell may have y > 9, x < 0 or x > 7. */
export function inGrid(x: number, y: number): boolean {
  return x >= 0 && x < GRID_COLS && y >= 0 && y < GRID_ROWS;
}
/** Inside the 8 × 8 board. */
export function onBoard(x: number, y: number): boolean {
  return x >= 0 && x < GRID_COLS && y >= 0 && y < BOARD_ROWS;
}
export function isYardCell(x: number, y: number): boolean {
  return x >= 0 && x < YARD_COLS && y >= 0 && y < BOARD_ROWS;
}
export function isSiteCell(x: number, y: number): boolean {
  return x >= SITE_X && x < GRID_COLS && y >= 0 && y < BOARD_ROWS;
}
export function isCraneCell(x: number, y: number): boolean {
  return x >= 0 && x < GRID_COLS && y >= CRANE_ROW && y < GRID_ROWS;
}
/** Which side of the boundary a column is on. */
export function sideOf(x: number): 'yard' | 'site' {
  return x <= BOUNDARY_X ? 'yard' : 'site';
}

/** A box `[ix, ix + w)` straddles the boundary when it has columns on both sides (K-07 row 4, E-06, E-28). */
export function straddlesBoundary(ix: number, w: number): boolean {
  return ix <= BOUNDARY_X && ix + w > BOUNDARY_X + 1;
}

/** Row mask of rows `[y, y + size)`, clipped to the 10 grid rows. */
export function rowRangeMask(y: number, size: number): number {
  if (size <= 0) return 0;
  const lo = Math.max(0, y);
  const hi = Math.min(GRID_ROWS, y + size);
  if (hi <= lo) return 0;
  return (((1 << (hi - lo)) - 1) << lo) & ROW_MASK_ALL;
}

/**
 * `openFree` (TECH §2.2): rows where a FREE-mode cell may cross the boundary = every row `y ≥ height`
 * (air above the wall + crane area, K-05: crane rows 8–9 are always open).
 */
export function openFreeMask(wallHeight: number): number {
  return rowRangeMask(wallHeight, GRID_ROWS - wallHeight);
}

/** `openRail[g]` (TECH §2.2): the rows of gap `g` when it is open, otherwise 0. */
export function openRailMask(gapY: number, gapSize: number, open: boolean): number {
  return open ? rowRangeMask(gapY, gapSize) : 0;
}

/**
 * Closed boundary rows (GDD K-04): `y < height` and not inside an OPEN gap. Crane rows are never closed.
 * `openGapRows` = OR of the open gaps' row masks.
 */
export function closedBoundaryMask(wallHeight: number, openGapRows: number): number {
  return rowRangeMask(0, Math.min(wallHeight, BOARD_ROWS)) & ~openGapRows & ROW_MASK_ALL;
}

/**
 * Crossing test for one horizontal step (TECH §2.2): every cell that changes side does so in its own row, and that
 * row must be in the `open` mask of the current mode. `crossRows` is the row mask (already shifted by the anchor row)
 * of the cells that change side. True when the step is allowed by the boundary.
 */
export function boundaryAllows(crossRows: number, open: number): boolean {
  return (crossRows & ~open) === 0;
}

/**
 * The 4-neighbours of a board cell inside the same region (GDD §0: neighbourhood never crosses the wall boundary;
 * x = 5 and x = 6 are never neighbours whatever the wall height or gaps, E-46). Order: left, right, down, up.
 */
export function neighbors4(x: number, y: number): readonly Anchor[] {
  if (!onBoard(x, y)) return [];
  const side = sideOf(x);
  const out: Anchor[] = [];
  const candidates: readonly (readonly [number, number])[] = [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ];
  for (const [nx, ny] of candidates) {
    if (onBoard(nx, ny) && sideOf(nx) === side) out.push({ ix: nx, iy: ny });
  }
  return out;
}

/** Integer code of a drag node: `(mode * 10 + iy) * 8 + ix` (TECH §2.1). */
export function dragNodeCode(node: DragNode): number {
  return (node.mode * GRID_ROWS + node.iy) * GRID_COLS + node.ix;
}
export function dragNodeFromCode(code: number): DragNode {
  const ix = code % GRID_COLS;
  const rest = Math.floor(code / GRID_COLS);
  return { ix, iy: rest % GRID_ROWS, mode: Math.floor(rest / GRID_ROWS) };
}
