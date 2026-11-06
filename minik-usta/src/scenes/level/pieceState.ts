/**
 * Pure reads of a piece for its view (no Phaser): where it rests on the board and which baked frame shows it.
 */
import { GRID_ROWS } from '../../core/coords.ts';
import { pieceBoardCells, visibleSegment } from '../../core/grid.ts';
import { shapeByIndex } from '../../core/shapes.ts';
import {
  H,
  hdr,
  pieceColor,
  pieceFlags,
  pieceSeg,
  pieceShape,
  pieceX,
  pieceY,
  pieceZone,
  yardOcc,
} from '../../core/state.ts';
import type { GameState } from '../../core/state.ts';
import { COLOR_CODES, Zone } from '../../core/types.ts';
import type { PieceId } from '../../core/types.ts';
import { bakedFlagsOf, blockFrameName } from '../../theme/textures.ts';
import type { Pose } from './motion.ts';

/** Where piece `id` rests in the state (board anchor), or null when it is not visible on the board. */
export function statePose(s: GameState, id: PieceId): Pose | null {
  const zone = pieceZone(s, id);
  if (zone === Zone.yard) return { ax: pieceX(s, id), ay: pieceY(s, id), scale: 1, alpha: 1 };
  if (zone === Zone.site && pieceSeg(s, id) === visibleSegment(s))
    return { ax: pieceX(s, id), ay: pieceY(s, id) + hdr(s, H.elev), scale: 1, alpha: 1 };
  return null;
}

/** Block frame of piece `id` as it is now (shape, colour, baked flags). */
export function pieceFrameName(s: GameState, id: PieceId): string {
  const color = COLOR_CODES[pieceColor(s, id)];
  if (color === undefined) throw new RangeError(`piece ${id}: bad colour ${pieceColor(s, id)}`);
  return blockFrameName(shapeByIndex(pieceShape(s, id)).id, color, bakedFlagsOf(pieceFlags(s, id)));
}

/**
 * JUICE #2 "engel parlar": the yard blocks resting directly on top of piece `id` (the usual reason a pick is refused,
 * K-09 (a)). A pure read for the presentation; whether the piece can move is the core's decision.
 */
export function blockersAbove(s: GameState, id: PieceId): PieceId[] {
  if (pieceZone(s, id) !== Zone.yard) return [];
  const top = new Map<number, number>();
  for (const c of pieceBoardCells(s, id)) top.set(c.x, Math.max(top.get(c.x) ?? -1, c.y));
  const out = new Set<PieceId>();
  for (const [x, y] of top) {
    if (y + 1 >= GRID_ROWS) continue;
    const occ = yardOcc(s, x, y + 1);
    if (occ > 0 && occ - 1 !== id) out.add(occ - 1);
  }
  return [...out];
}
