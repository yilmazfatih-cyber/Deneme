/**
 * Finger path of a drag move (debug golden replay, docs/TECH_DESIGN.md §12.3 "her adım sürükleme animasyonuyla";
 * R-20). Pure: core + layout geometry, no DOM.
 *
 * The replay plays a logged drag (`{ kind: 'drag', pieceId, to }`) through the level screen's real input path, like a
 * finger: press on the block, hold until it lifts, move, release. The plan inverts the scene's drag geometry
 * (scenes/level/dragMath.ts `pointColumn` / `pointRow` / `targetAnchor`, UX §5.3 finger offset):
 * - press = the centre of the block's first cell (`grabAt` then picks that cell with no pick-time displacement);
 * - once the finger-offset glide has ended (t = 1), the follow target of a finger point is
 *   `(column − cell.x − 0.5, row − cell.y − 0.5 + offsetCells)`, so the finger point of drag node n is the centre of
 *   column `n.ix + cell.x` and of row `n.iy + cell.y + 0.5 − offsetCells`;
 * - the finger travels from the press point through the finger points of the core's BFS path (`DragSession.pathTo`)
 *   to the release node, `substeps` points per path edge. The last point is exactly on the release node, where the
 *   K-08 sticky follow (`DragSession.follow`) must land: d² = 0 there and ≥ 1 for every other node of another anchor.
 * The core decides everything (reachability, the follow, the release class); a node outside R is reported, not forced.
 */
import { tryBeginDrag } from '../core/movement.ts';
import type { DragRules } from '../core/movement.ts';
import type { GameState } from '../core/state.ts';
import type { DragNode, Move, PieceId } from '../core/types.ts';
import type { BoardGeometry } from '../theme/layout.ts';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type DragMove = Extract<Move, { kind: 'drag' }>;

export interface DragPlan {
  readonly pieceId: PieceId;
  /** The grabbed cell, relative to the anchor. */
  readonly cell: Point;
  /** Press point (design px). */
  readonly press: Point;
  /** Finger points after the lift (design px); the last one is the release point. */
  readonly path: readonly Point[];
  /** Drag nodes the finger points of the path were taken from (start excluded, release node last). */
  readonly nodes: readonly DragNode[];
  readonly target: DragNode;
}

export type PlanResult =
  { readonly ok: true; readonly plan: DragPlan } | { readonly ok: false; readonly reason: string };

/** The part of the board geometry the plan needs (theme/layout.ts `BoardGeometry`). */
export type PlanGeometry = Pick<BoardGeometry, 'cellPx' | 'boardBottomY' | 'pieceX'>;

/** Centre (design px) of global cell column `x` and of the continuous row coordinate `row` (cell centre = y + 0.5). */
function fingerAt(geom: PlanGeometry, x: number, row: number): Point {
  return { x: geom.pieceX(x, 1) + geom.cellPx / 2, y: geom.boardBottomY - row * geom.cellPx };
}

/** Finger point that puts the follow target exactly on node `n` after the glide (t = 1). */
export function fingerForNode(geom: PlanGeometry, n: DragNode, cell: Point, offsetCells: number): Point {
  return fingerAt(geom, n.ix + cell.x, n.iy + cell.y + 0.5 - offsetCells);
}

/** `count` points from `a` (excluded) to `b` (included), evenly spaced. */
function segment(a: Point, b: Point, count: number): Point[] {
  const out: Point[] = [];
  for (let i = 1; i <= count; i++) {
    const k = i / count;
    out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
  }
  return out;
}

/**
 * Plans the finger path of `move` on `s` (the board as the scene shows it; `rules` = the scene's drag rules).
 * `offsetCells` = tokens `drag.fingerOffsetCells`; `substeps` ≥ 1 finger points per path edge.
 */
export function planDrag(
  s: GameState,
  geom: PlanGeometry,
  rules: DragRules,
  move: DragMove,
  offsetCells: number,
  substeps = 1,
): PlanResult {
  const attempt = tryBeginDrag(s, move.pieceId, rules);
  if (!attempt.ok) return { ok: false, reason: `piece ${move.pieceId} cannot be picked (${attempt.reason})` };
  const drag = attempt.session;
  const to = move.to;
  if (!drag.isReachable(to))
    return { ok: false, reason: `node (${to.ix},${to.iy},${to.mode}) is not reachable` };
  const nodes = drag.pathTo(to) ?? [];
  if (nodes.length === 0) return { ok: false, reason: 'the release node is the start node (K-07 row 1)' };
  const first = drag.shape.cells[0] ?? { x: 0, y: 0 };
  const cell = { x: first.x, y: first.y };
  const start = drag.start;
  const press = fingerAt(geom, start.ix + cell.x, start.iy + cell.y + 0.5);
  const steps = Math.max(1, Math.floor(substeps));
  const path: Point[] = [];
  let from = press;
  for (const n of nodes) {
    const p = fingerForNode(geom, n, cell, offsetCells);
    path.push(...segment(from, p, steps));
    from = p;
  }
  return { ok: true, plan: { pieceId: move.pieceId, cell, press, path, nodes, target: to } };
}

/** How the game canvas maps to the page: Phaser `scale.canvasBounds` origin and `scale.displayScale` (game / CSS). */
export interface CanvasMapping {
  readonly left: number;
  readonly top: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

/** Page point of a design point: the inverse of Phaser `ScaleManager.transformX/Y` (`(page − bounds) · scale`). */
export function toPage(p: Point, m: CanvasMapping): Point {
  return { x: m.left + p.x / m.scaleX, y: m.top + p.y / m.scaleY };
}
