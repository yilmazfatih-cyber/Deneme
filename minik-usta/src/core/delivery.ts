/**
 * Truck batches and the FIFO truck queue (docs/GDD.md K-25, K-26, K-27, K-17 step 3, E-03, E-04, E-34; TECH_DESIGN
 * §6.2 steps 8–9).
 *
 * - Batch 0 starts in the yard (compile). Batch k ≥ 1 is queued — its pieces appended to the END of the truck queue in
 *   array order — when its segment comes (`forSegment = k` once k segments are complete, K-35 step 8). Nothing is
 *   delivered in step 8.
 * - Step 9 is the single delivery point (the K-30 D2 help of step 12 is the only written exception, Phase 3): every
 *   queued piece is tried once, oldest first; a piece that finds no room stays queued in its order and does not hold
 *   back the later ones (K-26).
 * - Columns of one piece (K-25): (1) its `x`; (2) its batch's `dropColumns` in list order (columns already tried are
 *   skipped); (3) every other valid anchor column `0 … 6 − w`, nearest to `x` first, ties to the larger x (nearer the
 *   wall). The last stage is never skipped (E-34). In each column the block drops from y = 10 − h onto its first
 *   support whatever the gravity settings; the first column where every landed cell has y ≤ 7 wins. The drop moves no
 *   other block and triggers no neighbour effect; balloons do not rise (E-36).
 * - Bounced blocks queued by K-17 step 3 keep their (clamped) start column as `x` and join the same FIFO.
 */
import type { Anchor, PieceId } from './types.ts';
import { BOARD_ROWS, GRID_ROWS, YARD_COLS } from './coords.ts';
import { shapeByIndex } from './shapes.ts';
import { H, PF, hdr, pieceShape, pieceX, queueIds, setPieceField } from './state.ts';
import type { GameState } from './state.ts';
import type { CompiledBatch } from './level/compile.ts';
import { dropIntoYard, movePiece, nearestColumnsFirst, yardPlace } from './placement.ts';

/** Truck batches (k ≥ 1) that come with segment `completed` (= number of completed segments, K-22, K-23, K-25). */
export function batchesFor(s: GameState, completed: number): CompiledBatch[] {
  return s.lvl.batches.filter((b) => b.index >= 1 && b.forSegment === completed);
}

/**
 * K-35 step 8: appends the pieces of the batches for `completed` to the end of the truck queue, in batch then array
 * order (zone `pending` → `queue`). Returns the queued piece ids.
 */
export function enqueueBatchesFor(s: GameState, completed: number): PieceId[] {
  const out: PieceId[] = [];
  for (const batch of batchesFor(s, completed)) {
    for (const id of batch.pieceIds) {
      movePiece(s, id, { zone: 'queue', x: pieceX(s, id), y: BOARD_ROWS, seg: -1 });
      out.push(id);
    }
  }
  return out;
}

/** `dropColumns` of the truck batch a piece came with (none for batch 0, debris and help pieces). */
function batchDropColumns(s: GameState, id: PieceId): readonly number[] {
  const piece = s.lvl.pieces[id];
  if (!piece || piece.origin !== 'truck') return [];
  return s.lvl.batches[piece.batch]?.dropColumns ?? [];
}

/** K-25 candidate anchor columns of a piece, in trial order, without repeats (invalid columns included in stage 1–2). */
export function deliveryColumns(s: GameState, id: PieceId): number[] {
  const w = shapeByIndex(pieceShape(s, id)).w;
  const x = pieceX(s, id);
  const out: number[] = [x];
  for (const c of batchDropColumns(s, id)) if (!out.includes(c)) out.push(c);
  for (const c of nearestColumnsFirst(x, w)) if (!out.includes(c)) out.push(c);
  return out;
}

/** Where a queued piece would land now (K-25), or null when no column has room (it stays queued, K-26). */
export function deliveryLanding(s: GameState, id: PieceId): Anchor | null {
  const shape = shapeByIndex(pieceShape(s, id));
  for (const x of deliveryColumns(s, id)) {
    if (x < 0 || x + shape.w > YARD_COLS) continue;
    const y = dropIntoYard(s, shape, x, id);
    if (y >= 0) return { ix: x, iy: y };
  }
  return null;
}

/** One block the truck dropped (`pieceFell{cause: 'delivery'}`). */
export interface Delivered {
  readonly pieceId: PieceId;
  /** Drop start: (column, 10 − h). */
  readonly from: Anchor;
  readonly to: Anchor;
  readonly rows: number;
}

export interface DeliveryResult {
  /** Delivered blocks in FIFO order. */
  readonly delivered: readonly Delivered[];
  /** Pieces still in the truck ("Kamyonda: N", K-26). */
  readonly queued: number;
}

/**
 * K-35 step 9 (K-25, K-26): tries every queued piece once, oldest first. A delivered piece lands in the yard and gets
 * `arrivedTurn = turn` (Y4 / E-31: it does not dry in this move's step 10).
 */
export function deliverQueue(s: GameState): DeliveryResult {
  const delivered: Delivered[] = [];
  const turn = hdr(s, H.turn);
  for (const id of queueIds(s)) {
    const to = deliveryLanding(s, id);
    if (!to) continue;
    const h = shapeByIndex(pieceShape(s, id)).h;
    movePiece(s, id, yardPlace(to));
    setPieceField(s, id, PF.arrivedTurn, turn);
    const from = { ix: to.ix, iy: GRID_ROWS - h };
    delivered.push({ pieceId: id, from, to, rows: from.iy - to.iy });
  }
  return { delivered, queued: hdr(s, H.queueLen) };
}
