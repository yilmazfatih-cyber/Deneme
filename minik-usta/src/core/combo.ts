/**
 * Usta Serisi (master streak) and the Golden Trowel (docs/GDD.md K-33; TECH_DESIGN §6.2 step 3, §6.4; JUICE #15–17,
 * MVP-lite).
 *
 * - The streak counter `c` (state header `combo`) starts at 0. Every correct placement made by a DRAG move adds 1; at
 *   `c = 4` the player earns one Golden Trowel and `c = 0`. A wrong placement (bounce, mortar sticking) and a glass
 *   break set `c = 0`. Yard moves, boosters and trowel use leave `c` alone; Undo restores the pre-move value (the whole
 *   state snapshot, K-39).
 * - Trowel use: the player taps a cell of the visible segment's build front (`eligibleTrowelCells` = `buildFront`, so the
 *   K-34 support rule holds by construction). The cell is filled with its plan colour, counts as correctly filled
 *   (`filled`, K-14) and a hidden `?` cell opens (K-32). An invalid target is rejected and consumes nothing.
 *
 * Pure state helpers: events and the K-35 mini pipeline belong to core/moves.ts.
 */
import { COLOR_CODES } from './types.ts';
import type { At, ColorCode } from './types.ts';
import { SITE_COLS, SITE_X } from './coords.ts';
import {
  H,
  SITE_TROWEL,
  STATE_FLAG,
  filledMask,
  hdr,
  revealedMask,
  setFilledMask,
  setHdr,
  setRevealedMask,
  setSiteOcc,
} from './state.ts';
import type { GameState } from './state.ts';
import { visibleSegment } from './grid.ts';
import { buildFront } from './placement.ts';

/** K-33: the streak length that earns one Golden Trowel. */
export const COMBO_FOR_TROWEL = 4;

/** Current streak counter `c` (K-33). */
export function comboOf(s: GameState): number {
  return hdr(s, H.combo);
}

/** Golden Trowels the player holds (K-33, K-40 Mala Başlangıcı, streak bonus). */
export function trowelsOf(s: GameState): number {
  return hdr(s, H.trowels);
}

/** Result of `comboOnCorrect`. */
export interface ComboStep {
  /** The counter value this placement reached (1…4): the pip the scene fills (JUICE #15). */
  readonly reached: number;
  /** Counter after the placement: `reached`, or 0 when a trowel was earned. */
  readonly combo: number;
  /** A Golden Trowel was earned (JUICE #16). */
  readonly earned: boolean;
  /** Trowels held after the placement. */
  readonly trowels: number;
}

/** K-33: a correct placement made by a drag move. `c += 1`; at `c = 4` one trowel is earned and `c = 0`. */
export function comboOnCorrect(s: GameState): ComboStep {
  const reached = hdr(s, H.combo) + 1;
  if (reached >= COMBO_FOR_TROWEL) {
    setHdr(s, H.combo, 0);
    setHdr(s, H.trowels, hdr(s, H.trowels) + 1);
    return { reached, combo: 0, earned: true, trowels: hdr(s, H.trowels) };
  }
  setHdr(s, H.combo, reached);
  return { reached, combo: reached, earned: false, trowels: hdr(s, H.trowels) };
}

/** K-33: wrong placement (bounce, mortar sticking) or glass break: `c = 0`. Returns true when the value changed. */
export function comboReset(s: GameState): boolean {
  if (hdr(s, H.combo) === 0) return false;
  setHdr(s, H.combo, 0);
  return true;
}

/** Adds trowels (K-40 Mala Başlangıcı and the win-streak bonus at level start). */
export function grantTrowels(s: GameState, n: number): void {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`grantTrowels: bad amount ${n}`);
  setHdr(s, H.trowels, hdr(s, H.trowels) + n);
}

// --- Golden Trowel use ----------------------------------------------------------------------------------------------

/** Move record target (TECH §6.1 `trowel`): segment, local column (0 = x 6, 1 = x 7) and plan row of that segment. */
export interface TrowelTarget {
  readonly seg: number;
  readonly x: 0 | 1;
  readonly y: number;
}

/** Why a trowel target is refused (the trowel is not consumed, GDD §10 "Geçersiz hedefe dokunulursa…"). */
export type TrowelRejectReason = 'levelOver' | 'noTrowel' | 'notVisibleSegment' | 'notBuildFront';

/**
 * Precondition of a trowel use (TECH §6.4 `canUse*`; the UI greys the slot with the same function): the level is not
 * won, the player holds a trowel, the target is on the visible segment and is one of its build front cells (K-34).
 * Returns null when the use is allowed.
 */
export function trowelRejection(s: GameState, target: TrowelTarget): TrowelRejectReason | null {
  if ((hdr(s, H.flags) & STATE_FLAG.won) !== 0) return 'levelOver';
  if (hdr(s, H.trowels) <= 0) return 'noTrowel';
  if (target.seg !== visibleSegment(s)) return 'notVisibleSegment';
  const x = SITE_X + target.x;
  const y = target.y + hdr(s, H.elev);
  if (!buildFront(s).some((c) => c.x === x && c.y === y)) return 'notBuildFront';
  return null;
}

/** What a trowel use did. */
export interface TrowelFill {
  /** The filled cell (board coordinates, TECH §6.3 `At`). */
  readonly cell: At;
  readonly color: ColorCode;
  /** The cell was an unrevealed `?` cell and opened (K-32). */
  readonly revealed: boolean;
  /** Trowels left. */
  readonly trowels: number;
}

/**
 * K-33 trowel effect: the target cell is filled with its plan colour (`siteOcc` = SITE_TROWEL), joins `filled` and opens
 * when hidden; one trowel is spent. Throws when `trowelRejection` refuses the target (check it first).
 */
export function applyTrowel(s: GameState, target: TrowelTarget): TrowelFill {
  const refused = trowelRejection(s, target);
  if (refused !== null) throw new RangeError(`applyTrowel: target refused (${refused})`);
  const { seg, x: sx, y: sy } = target;
  const plan = s.lvl.segments[seg];
  const local = sy * SITE_COLS + sx;
  setSiteOcc(s, seg, sx, sy, SITE_TROWEL);
  setFilledMask(s, seg, sx, filledMask(s, seg, sx) | (1 << sy));
  const hidden = plan !== undefined && ((plan.hiddenMask >> local) & 1) === 1;
  const revealed = hidden && ((revealedMask(s, seg) >> local) & 1) === 0;
  if (revealed) setRevealedMask(s, seg, revealedMask(s, seg) | (1 << local));
  setHdr(s, H.trowels, hdr(s, H.trowels) - 1);
  return {
    cell: { zone: 'site', x: SITE_X + sx, y: sy + hdr(s, H.elev), seg },
    color: COLOR_CODES[plan?.planColors[local] ?? 0] ?? 'W',
    revealed,
    trowels: hdr(s, H.trowels),
  };
}
