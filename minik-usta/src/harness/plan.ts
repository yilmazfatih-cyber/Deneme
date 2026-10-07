/**
 * Touch gesture of a drag move (docs/TECH_DESIGN.md §10.7 item 4, §12.4 "Sahne duman testi"; UX_FLOWS §5.3). Pure:
 * core queries and layout geometry only, no Phaser, no DOM (tests/e2e/plan.test.ts runs it in Node).
 *
 * The harness never commits a move itself: it plans where a finger goes so that the scene's own input path
 * (DragController → core `tryBeginDrag` / `DragSession.follow` → `GameSession.commit`) produces the move. The plan is the
 * exact inverse of the drag geometry in scenes/level/dragMath.ts:
 *
 * - the press is at the centre of one of the piece's cells (the grabbed cell), so the pick-time displacement is 0;
 * - the finger then rests for `drag.holdMs` + `duration.fingerOffset` (+ a few frames): the press lifts by time and the
 *   finger offset (`drag.fingerOffsetCells`, 1.2) has fully glided in, so from then on the follow target is
 *   `finger − grabbed cell + (0, offset)` with no time dependence (robust under CPU throttling);
 * - the finger moves at a constant speed along the core's BFS path (`DragSession.pathTo`) to the target node, rests,
 *   moves onto the exact target point once more and is released: the sticky follow (K-08) ends on the target node.
 */
import { tryBeginDrag } from '../core/movement.ts';
import type { DragRules, DragSession } from '../core/movement.ts';
import type { GameState } from '../core/state.ts';
import type { DragNode, PieceId } from '../core/types.ts';
import { pieceAtPoint } from '../scenes/level/hitTest.ts';
import type { BoardGeometry } from '../theme/layout.ts';
import type { DragMove, DragPlanOptions } from './api.ts';

export interface DesignPoint {
  readonly x: number;
  readonly y: number;
}

export interface DesignPlan {
  readonly pieceId: PieceId;
  readonly to: DragNode;
  /** BFS path nodes, start node first. */
  readonly nodes: readonly DragNode[];
  /** Grabbed cell, relative to the piece anchor. */
  readonly cell: { readonly x: number; readonly y: number };
  readonly down: DesignPoint;
  readonly moves: readonly (DesignPoint & { readonly atMs: number })[];
  readonly upAtMs: number;
  /** Finger points back along the path to the start node (a held drag released there cancels, K-07 row 1). */
  readonly back: readonly DesignPoint[];
}

/** Drag constants the plan inverts (tokens `drag.*`, `duration.fingerOffset`). */
export interface DragFeelConstants {
  readonly holdMs: number;
  readonly fingerOffsetMs: number;
  readonly fingerOffsetCells: number;
  readonly hitSlopPx: number;
}

export const DEFAULT_SPEED_CELLS_PER_SEC = 8;
export const DEFAULT_END_HOLD_MS = 150;
export const DEFAULT_FRAME_MS = 1000 / 60;
/** Frames of margin after hold + glide before the finger starts moving. */
const LIFT_MARGIN_FRAMES = 4;
/** Design px the arrival point is nudged by before the final re-asserting move. */
const REASSERT_PX = 0.25;

/**
 * Finger position (design px) whose follow target is anchor `(ax, ay)` once the offset glide is complete (k = offset
 * share): the inverse of `dragMath.targetAnchor` with a zero grab displacement.
 */
export function fingerAt(
  geom: BoardGeometry,
  cell: { readonly x: number; readonly y: number },
  ax: number,
  ay: number,
  offsetCells: number,
): DesignPoint {
  return {
    x: geom.pieceX(ax + cell.x, 1) + geom.cellPx / 2,
    y: geom.boardBottomY - (ay + cell.y + 0.5 - offsetCells) * geom.cellPx,
  };
}

/** A cell of the piece whose centre picks the piece (hit test of the scene), nearest to the piece's middle. */
function grabCell(
  s: GameState,
  geom: BoardGeometry,
  session: DragSession,
  slopPx: number,
): { x: number; y: number } {
  const cells = session.shape.cells;
  const mx = cells.reduce((a, c) => a + c.x, 0) / Math.max(1, cells.length);
  const my = cells.reduce((a, c) => a + c.y, 0) / Math.max(1, cells.length);
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const c of cells) {
    const p = fingerAt(geom, c, session.start.ix, session.start.iy, 0);
    if (pieceAtPoint(s, geom, p.x, p.y, slopPx) !== session.pieceId) continue;
    const d = (c.x - mx) ** 2 + (c.y - my) ** 2;
    if (d < bestD) {
      bestD = d;
      best = { x: c.x, y: c.y };
    }
  }
  if (!best) throw new Error(`harness: no cell of piece ${session.pieceId} picks it`);
  return best;
}

/** Point at arc length `d` along a polyline with cumulative lengths `cum`. */
function along(
  pts: readonly { readonly ax: number; readonly ay: number }[],
  cum: readonly number[],
  d: number,
): { ax: number; ay: number } {
  const last = pts[pts.length - 1] ?? { ax: 0, ay: 0 };
  for (let i = 1; i < pts.length; i++) {
    const c1 = cum[i] ?? 0;
    if (d > c1 && i < pts.length - 1) continue;
    const a = pts[i - 1] ?? last;
    const b = pts[i] ?? last;
    const c0 = cum[i - 1] ?? 0;
    const len = c1 - c0;
    const k = len <= 0 ? 1 : Math.min(1, Math.max(0, (d - c0) / len));
    return { ax: a.ax + (b.ax - a.ax) * k, ay: a.ay + (b.ay - a.ay) * k };
  }
  return { ax: last.ax, ay: last.ay };
}

/**
 * The gesture (design px) that plays `move` on state `s`. Throws when the piece cannot be picked (K-09, K-14) or the
 * node is not reachable (the core decides both).
 */
export function planDragDesign(
  s: GameState,
  move: DragMove,
  rules: DragRules,
  geom: BoardGeometry,
  feel: DragFeelConstants,
  opts: DragPlanOptions = {},
): DesignPlan {
  const attempt = tryBeginDrag(s, move.pieceId, rules);
  if (!attempt.ok) throw new Error(`harness: piece ${move.pieceId} cannot be picked (${attempt.reason})`);
  const session = attempt.session;
  const tail = session.pathTo(move.to);
  if (!tail) {
    const n = move.to;
    throw new Error(`harness: node (${n.ix},${n.iy},${n.mode}) of piece ${move.pieceId} is not reachable`);
  }
  const frameMs = opts.frameMs ?? DEFAULT_FRAME_MS;
  const speed = opts.speedCellsPerSec ?? DEFAULT_SPEED_CELLS_PER_SEC;
  const liftHoldMs = opts.liftHoldMs ?? feel.holdMs + feel.fingerOffsetMs + LIFT_MARGIN_FRAMES * frameMs;
  const endHoldMs = opts.endHoldMs ?? DEFAULT_END_HOLD_MS;
  const start = session.start;
  const cell = grabCell(s, geom, session, feel.hitSlopPx);
  const down = fingerAt(geom, cell, start.ix, start.iy, 0);
  // After the hold the finger still rests at `down`: the follow target is the start anchor + the offset.
  const nodes = [start, ...tail];
  const pts = [
    { ax: start.ix, ay: start.iy + feel.fingerOffsetCells },
    ...(tail.length > 0 ? tail : [start]).map((n) => ({ ax: n.ix, ay: n.iy })),
  ];
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as { ax: number; ay: number };
    const b = pts[i] as { ax: number; ay: number };
    cum.push((cum[i - 1] ?? 0) + Math.hypot(b.ax - a.ax, b.ay - a.ay));
  }
  const total = cum[cum.length - 1] ?? 0;
  const frames = Math.max(1, Math.ceil(((total / speed) * 1000) / frameMs));
  const moves: (DesignPoint & { atMs: number })[] = [];
  for (let i = 1; i <= frames; i++) {
    const p = along(pts, cum, (total * i) / frames);
    const f = fingerAt(geom, cell, p.ax, p.ay, feel.fingerOffsetCells);
    moves.push({ x: f.x, y: f.y, atMs: liftHoldMs + (i - 1) * frameMs });
  }
  // Re-assert the target after the rest: the arrival point is nudged by a negligible REASSERT_PX (≈ 0.002 cell) so the
  // browser does not drop the final move as stationary; on a slow frame pace (headless SwiftShader, CPU throttling) the
  // lift may come late, and this last move follows with the offset glide complete.
  const last = moves[moves.length - 1] as DesignPoint & { atMs: number };
  const target = { x: last.x, y: last.y };
  moves[moves.length - 1] = { ...last, x: last.x + REASSERT_PX };
  const reassertAt = last.atMs + endHoldMs;
  moves.push({ ...target, atMs: reassertAt });
  const back = nodes
    .slice(0, -1)
    .reverse()
    .map((n) => fingerAt(geom, cell, n.ix, n.iy, feel.fingerOffsetCells));
  return { pieceId: move.pieceId, to: move.to, nodes, cell, down, moves, upAtMs: reassertAt + frameMs, back };
}
