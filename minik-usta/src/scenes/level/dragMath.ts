/**
 * Drag geometry (docs/TECH_DESIGN.md §4.4, §10.5; UX_FLOWS §5.3; GDD K-07, K-08). Pure: no Phaser, no state.
 *
 * Units: "anchor units" are the core's continuous cell coordinates (x 0–8 over yard + site, the 60 px wall strip
 * compressed to the zero-width boundary between 5 and 6, R-03; y 0–10 from the board bottom). Screen ↔ anchor goes
 * through the layout (`BoardGeometry.anchorXAt` / `anchorYAt`), so the dragged block slides over the wall strip.
 *
 * - Grab (UX §5.3 "Parmak ofseti"): the grabbed cell's centre ends `fingerOffsetCells` (1.2) cells above the finger.
 *   The block does not jump at pick time: the offset between where the finger really holds the cell and that target
 *   glides away over `duration.fingerOffset` (TECH §4.4 "blok tutulduğunda zıplamaz").
 * - Target point p (TECH §4.4) = finger − grab + (0, offset·t); the core's sticky follow takes it (`DragSession.follow`).
 * - Drawing: the block sits at `node + clamp(p − node)`; an axis may move off the node only toward a neighbour node the
 *   graph has an edge to (the block "slides along" obstacles and never shows inside a wall or a block).
 */
import type { DragNode } from '../../core/types.ts';

/** The part of `theme/layout.ts` BoardGeometry the drag needs. */
export interface DragGeometry {
  readonly cellPx: number;
  readonly boardBottomY: number;
  anchorXAt(screenX: number, w: number): number;
  anchorYAt(screenY: number, h: number): number;
}

export interface CellOffset {
  readonly x: number;
  readonly y: number;
}

/** Continuous column coordinate of a screen x: the centre of column c is c + 0.5; the wall strip maps to x = 6. */
export function pointColumn(geom: DragGeometry, screenX: number): number {
  return geom.anchorXAt(screenX - geom.cellPx / 2, 1) + 0.5;
}

/** Continuous row coordinate of a screen y: the centre of row r is r + 0.5. */
export function pointRow(geom: DragGeometry, screenY: number): number {
  return (geom.boardBottomY - screenY) / geom.cellPx;
}

/** UX §5.3 / TECH §10.5: a press becomes a drag once the finger moved `thresholdPx` (design px) from the down point. */
export function exceedsThreshold(dx: number, dy: number, thresholdPx: number): boolean {
  return dx * dx + dy * dy >= thresholdPx * thresholdPx;
}

/** How a piece is held: the grabbed cell (relative to the anchor) and the pick-time displacement to glide away. */
export interface Grab {
  readonly cell: CellOffset;
  /** Anchor − (finger − cell centre) at pick time, in anchor units. */
  readonly dx0: number;
  readonly dy0: number;
}

/**
 * The cell of the piece nearest to the finger (cells relative to the anchor `(ix, iy)`), and the displacement that keeps
 * the block where it is at t = 0.
 */
export function grabAt(
  geom: DragGeometry,
  fingerX: number,
  fingerY: number,
  anchor: { readonly ix: number; readonly iy: number },
  cells: readonly CellOffset[],
): Grab {
  const u = pointColumn(geom, fingerX);
  const v = pointRow(geom, fingerY);
  let best: CellOffset = cells[0] ?? { x: 0, y: 0 };
  let bestD = Infinity;
  for (const c of cells) {
    const dx = anchor.ix + c.x + 0.5 - u;
    const dy = anchor.iy + c.y + 0.5 - v;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return {
    cell: best,
    dx0: anchor.ix - (u - best.x - 0.5),
    dy0: anchor.iy - (v - best.y - 0.5),
  };
}

/**
 * Target anchor point p for the core's sticky follow. `t` ∈ [0, 1] is the finger-offset glide progress
 * (elapsed / `duration.fingerOffset`); at t = 1 the grabbed cell's centre is `offsetCells` above the finger.
 */
export function targetAnchor(
  geom: DragGeometry,
  grab: Grab,
  fingerX: number,
  fingerY: number,
  t: number,
  offsetCells: number,
): { px: number; py: number } {
  const k = Math.min(1, Math.max(0, t));
  const u = pointColumn(geom, fingerX);
  const v = pointRow(geom, fingerY);
  return {
    px: u - grab.cell.x - 0.5 + grab.dx0 * (1 - k),
    py: v - grab.cell.y - 0.5 + grab.dy0 * (1 - k) + offsetCells * k,
  };
}

/** Directions in which the drag graph has an edge from a node (left, right, down, up). */
export interface Edges {
  readonly left: boolean;
  readonly right: boolean;
  readonly down: boolean;
  readonly up: boolean;
}

export const NO_EDGES: Edges = Object.freeze({ left: false, right: false, down: false, up: false });

/** Edges of `node` from its graph neighbours (`DragSession.neighbours`); a mode switch in place is not a direction. */
export function edgesOf(node: DragNode, neighbours: readonly DragNode[]): Edges {
  let left = false;
  let right = false;
  let down = false;
  let up = false;
  for (const n of neighbours) {
    if (n.iy === node.iy && n.ix < node.ix) left = true;
    else if (n.iy === node.iy && n.ix > node.ix) right = true;
    else if (n.ix === node.ix && n.iy < node.iy) down = true;
    else if (n.ix === node.ix && n.iy > node.iy) up = true;
  }
  return { left, right, down, up };
}

/** TECH §4.4 "Yumuşak çizim": `node + clamp(p − node)`, per axis only toward an edge, at most one cell. */
export function drawAnchor(
  node: DragNode,
  p: { readonly px: number; readonly py: number },
  edges: Edges,
): { ax: number; ay: number } {
  const dx = p.px - node.ix;
  const dy = p.py - node.iy;
  const ox = dx > 0 ? (edges.right ? Math.min(dx, 1) : 0) : edges.left ? Math.max(dx, -1) : 0;
  const oy = dy > 0 ? (edges.up ? Math.min(dy, 1) : 0) : edges.down ? Math.max(dy, -1) : 0;
  return { ax: node.ix + ox, ay: node.iy + oy };
}

/** TECH §4.4: duration of following a BFS path of `steps` unit steps (12 ms per cell, at most 120 ms). */
export function pathDurationMs(steps: number, msPerCell: number, maxMs: number): number {
  return Math.min(maxMs, Math.max(0, steps) * msPerCell);
}

/**
 * Point on a polyline `points` (the visual position at the jump, then the path nodes) at progress u ∈ [0, 1], each
 * segment taking the same time: the view travels the path cell by cell and never cuts through a wall or a block.
 */
export function pathPoint(
  points: readonly { readonly ax: number; readonly ay: number }[],
  u: number,
): { ax: number; ay: number } {
  const first = points[0];
  if (!first) return { ax: 0, ay: 0 };
  const n = points.length - 1;
  if (n <= 0 || u <= 0) return { ax: first.ax, ay: first.ay };
  if (u >= 1) {
    const last = points[n] ?? first;
    return { ax: last.ax, ay: last.ay };
  }
  const f = u * n;
  const i = Math.floor(f);
  const a = points[i] ?? first;
  const b = points[i + 1] ?? a;
  const k = f - i;
  return { ax: a.ax + (b.ax - a.ax) * k, ay: a.ay + (b.ay - a.ay) * k };
}
