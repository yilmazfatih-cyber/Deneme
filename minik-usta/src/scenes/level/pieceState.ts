/**
 * Pure reads of a piece for its view (no Phaser): where it rests on the board and which baked frame shows it.
 */
import { visibleSegment } from '../../core/grid.ts';
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
