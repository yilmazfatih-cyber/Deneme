/**
 * Placement on the site (docs/GDD.md K-14…K-17, K-34; OBSTACLES S2, S3, S4, Y8; docs/TECH_DESIGN.md §5.2, R-01).
 *
 * - `isCorrectPlacement` is the ONE correctness test (R-01): drop and rail placements (K-35 step 3), the fall shadow
 *   (K-18, via `computeFall`), the crane target (K-37), the trowel cells (K-33, via `buildFront`), the paint lock of a
 *   stuck mortar block (K-38) and the solver's correct-move generator all call it. Every condition is evaluated; the
 *   broken ones go to `reasons` in the fixed GDD K-34 hook 2 order (`debris`, `outside`, `window`, `color`,
 *   `support`), so `reasons[0]` is the primary reason.
 * - `buildFront` (= `eligibleTrowelCells`) is GDD K-34 visibility hook 1.
 * - `returnTarget` is the K-17 bounce-back search: (1) the start cells when they are empty, (2) a drop over the yard from
 *   y = 10 − h in the columns nearest the start x (ties: nearer the wall first), (3) the end of the truck queue. The
 *   wrong-placement bounce and the S3 broken-glass return (`skipStart`) share it.
 * - `movePiece` / `lockPiece` / `stickPiece` keep the piece table, the occupancy grids and the per-column `filled` /
 *   `wrongOcc` masks in step (O(cells)) and own the Y8 `stuck` lifecycle (TECH §5.2): `stuck` turns true only through
 *   `stickPiece`; it turns false when the piece leaves the site (yard, queue, gone — `movePiece`) or locks
 *   (`lockPiece`). A stuck block returned to its site start keeps `stuck`.
 *
 * Board coordinates: x 0–7, board row y (site: plan row + elevator offset, K-24). `At` values for the site carry the
 * visible segment. A `PiecePlace` mirrors the piece record instead (site y = plan row of the segment frame).
 */
import { COLOR_CODES, Zone } from './types.ts';
import type { Anchor, At, ColorCode, PieceId, Verdict, VerdictReason, ZoneName } from './types.ts';
import { BOARD_ROWS, GRID_ROWS, SITE_COLS, SITE_X, YARD_COLS } from './coords.ts';
import { shapeByIndex } from './shapes.ts';
import type { ShapeDef } from './shapes.ts';
import { PLAN_DOT, PLAN_OUTSIDE } from './level/compile.ts';
import {
  FLAG_BIT,
  H,
  PF,
  enqueuePiece,
  filledMask,
  hdr,
  pieceColor,
  pieceFlags,
  pieceSeg,
  pieceShape,
  pieceX,
  pieceY,
  pieceZone,
  planAreaMask,
  removeQueueAt,
  revealedMask,
  setFilledMask,
  setFlag,
  setPieceField,
  setRevealedMask,
  setWrongOccMask,
  siteOcc,
  wrongOccMask,
  yardOcc,
} from './state.ts';
import type { GameState } from './state.ts';
import { occupyPiece, vacatePiece, visibleSegment } from './grid.ts';
import type { BoardCell } from './grid.ts';
import { blockCells } from './movement.ts';

/** Where a piece is, as stored in its record (TECH §2.4). */
export interface PiecePlace {
  readonly zone: ZoneName;
  /** Yard: anchor x 0–5. Site: global column 6–7. Queue: the yard column the truck tries first (K-25 stage 1). */
  readonly x: number;
  /** Yard: board row. Site: plan row in the segment frame (board row = y + elevator offset, K-24). Queue: 8. */
  readonly y: number;
  /** Site segment; −1 elsewhere. */
  readonly seg: number;
}

/** A `?` plan cell opened by a correct placement (K-32): global column, board row, resolved colour. */
export interface RevealedCell {
  readonly x: number;
  readonly y: number;
  readonly color: ColorCode;
}

const ZONE_NAMES = Object.keys(Zone) as ZoneName[];
const NO_ROW = 99;

const OK_VERDICT: Verdict = Object.freeze({
  ok: true,
  reasons: Object.freeze([]) as readonly VerdictReason[],
  missingSupport: Object.freeze([]) as readonly At[],
});

/** The piece record as a place (snapshot it at move start: K-17 needs the start after the piece has moved). */
export function piecePlace(s: GameState, id: PieceId): PiecePlace {
  return {
    zone: ZONE_NAMES[pieceZone(s, id)] ?? 'gone',
    x: pieceX(s, id),
    y: pieceY(s, id),
    seg: pieceSeg(s, id),
  };
}

/** The site place of a block anchored at board `(ix, iy)` on the visible segment. */
export function sitePlace(s: GameState, anchor: Anchor): PiecePlace {
  return { zone: 'site', x: anchor.ix, y: anchor.iy - hdr(s, H.elev), seg: visibleSegment(s) };
}

/** The yard place of a block anchored at board `(ix, iy)`. */
export function yardPlace(anchor: Anchor): PiecePlace {
  return { zone: 'yard', x: anchor.ix, y: anchor.iy, seg: -1 };
}

/** Event position of a yard or site place (TECH §6.3 `At`, board coordinates); null for queue / gone / pending. */
export function placeAt(s: GameState, place: PiecePlace): At | null {
  if (place.zone === 'yard') return { zone: 'yard', x: place.x, y: place.y };
  if (place.zone === 'site') return { zone: 'site', x: place.x, y: place.y + hdr(s, H.elev), seg: place.seg };
  return null;
}

// --- K-16 + K-34: the single correctness test ------------------------------------------------------------------------

/**
 * `isCorrectPlacement(state, pieceId, cells)` (TECH §5.2, GDD K-16, K-34). `cells` are board cells on the visible
 * segment (the piece may still be at its start: its own `wrongOcc` bits are ignored, so a stuck block lifted from a
 * `.` cell does not block itself). Conditions, all evaluated, reasons in the fixed order:
 * 1. `debris` — the block is debris (S4: never correct anywhere, K-16 (2)).
 * 2. `outside` — a cell is outside the active plan area (K-16 (1)).
 * 3. `window` — a cell is on a `.` plan cell (K-16 (1), S2).
 * 4. `color` — a plan colour (resolved `?` colour, K-32) differs from the block colour (K-16 (1)).
 * 5. `support` — K-34: in every covered site column, every plan row below the block's lowest cell is correctly filled
 *    or an EMPTY `.` cell. `missingSupport` = the breaking plan cells: unfilled colour cells and `.` cells holding a
 *    wrong object (debris, stuck mortar; E-43), column then row order.
 */
export function isCorrectPlacement(s: GameState, pieceId: PieceId, cells: readonly BoardCell[]): Verdict {
  const seg = visibleSegment(s);
  const plan = s.lvl.segments[seg];
  const elev = hdr(s, H.elev);
  const color = pieceColor(s, pieceId);
  let outside = false;
  let window = false;
  let wrongColor = false;
  const low = [NO_ROW, NO_ROW];
  for (const c of cells) {
    const sx = c.x - SITE_X;
    const sy = c.y - elev;
    if (sx < 0 || sx >= SITE_COLS || sy < 0) {
      outside = true;
      continue;
    }
    low[sx] = Math.min(low[sx] ?? NO_ROW, sy);
    const v = plan && sy < BOARD_ROWS ? (plan.planColors[sy * SITE_COLS + sx] ?? PLAN_OUTSIDE) : PLAN_OUTSIDE;
    if (v === PLAN_OUTSIDE) outside = true;
    else if (v === PLAN_DOT) window = true;
    else if (v !== color) wrongColor = true;
  }

  // K-34: missing support per covered column (the piece's own cells never count as a wrong object below itself)
  const own = ownSiteRows(s, pieceId, seg);
  const miss = [0, 0];
  if (plan) {
    for (let sx = 0; sx < SITE_COLS; sx++) {
      const r = low[sx] ?? NO_ROW;
      if (r === NO_ROW || r <= 0) continue;
      const dot = plan.dotMask[sx] ?? 0;
      const area = (plan.planMask[sx] ?? 0) | dot;
      const wrong = wrongOccMask(s, seg, sx) & ~(own[sx] ?? 0);
      const counted = filledMask(s, seg, sx) | (dot & ~wrong);
      miss[sx] = rowsBelow(r) & area & ~counted;
    }
  }
  const support = (miss[0] ?? 0) !== 0 || (miss[1] ?? 0) !== 0;
  const debris = (pieceFlags(s, pieceId) & FLAG_BIT.debris) !== 0;
  if (!debris && !outside && !window && !wrongColor && !support) return OK_VERDICT;

  const reasons: VerdictReason[] = [];
  if (debris) reasons.push('debris');
  if (outside) reasons.push('outside');
  if (window) reasons.push('window');
  if (wrongColor) reasons.push('color');
  if (support) reasons.push('support');
  const missingSupport: At[] = [];
  for (let sx = 0; sx < SITE_COLS; sx++) {
    for (let m = miss[sx] ?? 0; m !== 0; m &= m - 1) {
      missingSupport.push({ zone: 'site', x: SITE_X + sx, y: lowestBit(m) + elev, seg });
    }
  }
  return { ok: false, reasons, missingSupport };
}

/**
 * The cells behind one verdict reason (UX §5.4 45° hatch; review Faz 2 tur 1 #1): the `cells` of `isCorrectPlacement`
 * that break `reason` — `debris`: every cell; `outside`: the cells outside the active plan area; `window`: the cells on
 * `.` plan cells; `color`: the cells whose plan colour (resolved `?` colour) differs from the block's. `support` has no
 * cell of the block (its cells are `Verdict.missingSupport`, under the block): empty. Board-cell order of `cells`.
 */
export function reasonCells(
  s: GameState,
  pieceId: PieceId,
  cells: readonly BoardCell[],
  reason: VerdictReason,
): BoardCell[] {
  if (reason === 'support') return [];
  if (reason === 'debris') return cells.map((c) => ({ x: c.x, y: c.y }));
  const plan = s.lvl.segments[visibleSegment(s)];
  const elev = hdr(s, H.elev);
  const color = pieceColor(s, pieceId);
  const out: BoardCell[] = [];
  for (const c of cells) {
    const sx = c.x - SITE_X;
    const sy = c.y - elev;
    const inside = sx >= 0 && sx < SITE_COLS && sy >= 0;
    const v =
      inside && plan && sy < BOARD_ROWS
        ? (plan.planColors[sy * SITE_COLS + sx] ?? PLAN_OUTSIDE)
        : PLAN_OUTSIDE;
    const hit =
      reason === 'outside'
        ? v === PLAN_OUTSIDE
        : reason === 'window'
          ? v === PLAN_DOT
          : v !== PLAN_OUTSIDE && v !== PLAN_DOT && v !== color;
    if (hit) out.push({ x: c.x, y: c.y });
  }
  return out;
}

/** Every cell is inside the visible segment's plan area (colour, `?` or `.`): the Y8 sticking condition (E-08). */
export function allCellsInPlanArea(s: GameState, cells: readonly BoardCell[]): boolean {
  const plan = s.lvl.segments[visibleSegment(s)];
  if (!plan) return false;
  const elev = hdr(s, H.elev);
  for (const c of cells) {
    const sx = c.x - SITE_X;
    const sy = c.y - elev;
    if (sx < 0 || sx >= SITE_COLS || sy < 0 || sy >= BOARD_ROWS) return false;
    if ((plan.planColors[sy * SITE_COLS + sx] ?? PLAN_OUTSIDE) === PLAN_OUTSIDE) return false;
  }
  return true;
}

// --- K-34 hook 1: build front ------------------------------------------------------------------------------------------

/**
 * `buildFront(state)` (GDD K-34 hook 1, TECH §5.2): per column of the visible segment, the lowest plan cell that is
 * not correctly filled and not an empty `.` cell — when that cell is empty. A wrong object there (debris, stuck
 * mortar; also on a `.` cell, E-43) or a complete column gives no front cell. Column 6 first.
 */
export function buildFront(s: GameState): At[] {
  const seg = visibleSegment(s);
  const plan = s.lvl.segments[seg];
  const out: At[] = [];
  if (!plan) return out;
  const elev = hdr(s, H.elev);
  for (let sx = 0; sx < SITE_COLS; sx++) {
    const dot = plan.dotMask[sx] ?? 0;
    const area = (plan.planMask[sx] ?? 0) | dot;
    const dotFree = dot & ~wrongOccMask(s, seg, sx);
    const free = area & ~(filledMask(s, seg, sx) | dotFree);
    if (free === 0) continue;
    const row = lowestBit(free);
    if (siteOcc(s, seg, sx, row) !== 0) continue;
    out.push({ zone: 'site', x: SITE_X + sx, y: row + elev, seg });
  }
  return out;
}

/** Golden Trowel targets (K-33): exactly the build front (one function, TECH §5.2). */
export const eligibleTrowelCells: (s: GameState) => At[] = buildFront;

// --- K-15 ----------------------------------------------------------------------------------------------------------

/**
 * GDD K-15: segment `seg` is complete when every non-`.` plan cell is correctly filled (locked block or trowel) and no
 * other block is in the segment's site area (debris or a stuck mortar block anywhere in the 2 × 8 part, E-24).
 */
export function isSegmentComplete(s: GameState, seg: number): boolean {
  const plan = s.lvl.segments[seg];
  if (!plan) return false;
  for (let sx = 0; sx < SITE_COLS; sx++) {
    const need = plan.planMask[sx] ?? 0;
    if ((filledMask(s, seg, sx) & need) !== need) return false;
  }
  for (let sy = 0; sy < BOARD_ROWS; sy++) {
    for (let sx = 0; sx < SITE_COLS; sx++) {
      const v = siteOcc(s, seg, sx, sy);
      if (v > 0 && (pieceFlags(s, v - 1) & FLAG_BIT.locked) === 0) return false;
    }
  }
  return true;
}

// --- K-17: bounce-back target ------------------------------------------------------------------------------------------

/**
 * Yard drop columns (K-17 step 2; same order as K-25 stage 3): every anchor column `0 … 6 − w`, nearest to `x` first,
 * ties to the larger x (nearer the wall).
 */
export function nearestColumnsFirst(x: number, w: number): number[] {
  const out: number[] = [];
  for (let c = 0; c <= YARD_COLS - w; c++) out.push(c);
  return out.sort((a, b) => Math.abs(a - x) - Math.abs(b - x) || b - a);
}

/**
 * Drop over the yard (K-17 step 2, K-25): the block falls from `y = 10 − h` in anchor column `ix`, whatever the yard
 * gravity setting, onto its first support (open sky from the top: the highest occupied cell of each covered column;
 * crates and bags support, hidden items do not). Returns the landing row, or −1 when a landed cell would be above
 * y = 7 (or the column range is invalid). `exclude` = a piece to ignore (the moving one).
 */
export function dropIntoYard(s: GameState, shape: ShapeDef, ix: number, exclude: PieceId = -1): number {
  if (!Number.isInteger(ix) || ix < 0 || ix + shape.w > YARD_COLS) return -1;
  const skip = exclude + 1;
  let land = 0;
  for (let c = 0; c < shape.w; c++) {
    let top = -1;
    for (let y = GRID_ROWS - 1; y >= 0; y--) {
      const v = yardOcc(s, ix + c, y);
      if (v !== 0 && v !== skip) {
        top = y;
        break;
      }
    }
    land = Math.max(land, top + 1 - (shape.colBottom[c] ?? 0));
  }
  return land + shape.h <= BOARD_ROWS ? land : -1;
}

/** Result of the K-17 search. */
export interface ReturnTarget {
  /** GDD K-17 step that found the target: 1 start cells, 2 drop over the yard, 3 end of the truck queue. */
  readonly step: 1 | 2 | 3;
  readonly to: PiecePlace;
  /** Step 2: the anchor the block falls from (`x`, 10 − h); the bounce animation falls from here to `to`. */
  readonly dropFrom: Anchor | null;
}

export interface ReturnOptions {
  /** S3 broken glass whose start is on the site (only stuck glass mortar): skip step 1 (GDD K-17 exceptions). */
  readonly skipStart?: boolean;
  /** Start place; default = the piece record (call before the piece is moved). */
  readonly start?: PiecePlace;
}

/**
 * `returnTarget(state, pieceId, opts)` (GDD K-17, TECH §5.2). Pure: finds the target, does not move the piece.
 * Step 1: every start cell is empty (the piece itself does not count; the board is frozen during a drag, K-08, so this
 * always holds for yard and debris starts). Step 2: `nearestColumnsFirst(start x, w)` with `dropIntoYard` — for a site
 * start (x 6 or 7) the first candidate is the column nearest the wall. Step 3: end of the truck queue (K-26); the
 * queued block keeps the start column clamped into the yard as its first truck column.
 */
export function returnTarget(s: GameState, pieceId: PieceId, opts: ReturnOptions = {}): ReturnTarget {
  const start = opts.start ?? piecePlace(s, pieceId);
  const shape = shapeByIndex(pieceShape(s, pieceId));
  if (opts.skipStart !== true && startCellsEmpty(s, pieceId, shape, start))
    return { step: 1, to: start, dropFrom: null };
  for (const x of nearestColumnsFirst(start.x, shape.w)) {
    const y = dropIntoYard(s, shape, x, pieceId);
    if (y >= 0)
      return { step: 2, to: yardPlace({ ix: x, iy: y }), dropFrom: { ix: x, iy: GRID_ROWS - shape.h } };
  }
  const qx = Math.min(Math.max(start.x, 0), YARD_COLS - shape.w);
  return { step: 3, to: { zone: 'queue', x: qx, y: BOARD_ROWS, seg: -1 }, dropFrom: null };
}

function startCellsEmpty(s: GameState, id: PieceId, shape: ShapeDef, start: PiecePlace): boolean {
  const self = id + 1;
  for (const c of shape.cells) {
    const x = start.x + c.x;
    const y = start.y + c.y;
    if (start.zone === 'yard') {
      if (x < 0 || x >= YARD_COLS || y < 0 || y >= BOARD_ROWS) return false;
      const v = yardOcc(s, x, y);
      if (v !== 0 && v !== self) return false;
    } else if (start.zone === 'site') {
      const sx = x - SITE_X;
      if (sx < 0 || sx >= SITE_COLS || y < 0 || y >= BOARD_ROWS) return false;
      const v = siteOcc(s, start.seg, sx, y);
      if (v !== 0 && v !== self) return false;
    } else {
      return false;
    }
  }
  return true;
}

// --- state updates and the Y8 stuck lifecycle --------------------------------------------------------------------------

/**
 * Moves a piece to `to` (yard, site, queue end or gone), keeping occupancy, `filled`, `wrongOcc` and the FIFO queue
 * consistent (O(cells)). Leaving the site clears the piece's mask bits; entering it sets `wrongOcc` for debris and
 * stuck blocks (plan area rows) and `filled` for locked ones. Y8 lifecycle (a), (c): any destination other than the site
 * clears `stuck`. Throws when a yard / site destination has a cell outside the yard / the site frame.
 */
export function movePiece(s: GameState, id: PieceId, to: PiecePlace): void {
  const shape = shapeByIndex(pieceShape(s, id));
  assertPlaceFits(shape, to);
  leaveBoard(s, id, shape);
  setPieceField(s, id, PF.x, to.x);
  setPieceField(s, id, PF.y, to.y);
  setPieceField(s, id, PF.seg, to.zone === 'site' ? to.seg : -1);
  if (to.zone !== 'site') setFlag(s, id, 'stuck', false);
  if (to.zone === 'queue') {
    enqueuePiece(s, id);
    return;
  }
  setPieceField(s, id, PF.zone, Zone[to.zone]);
  enterBoard(s, id, shape);
}

/**
 * K-14 lock of a correctly placed site piece: `locked = true`, `stuck = false` (Y8 lifecycle (b)), its plan cells join
 * `filled` and leave `wrongOcc`; hidden `?` cells under it open (K-32). Returns the newly revealed cells.
 */
export function lockPiece(s: GameState, id: PieceId): RevealedCell[] {
  if (pieceZone(s, id) !== Zone.site) throw new RangeError(`lockPiece: piece ${id} is not on the site`);
  setFlag(s, id, 'locked', true);
  setFlag(s, id, 'stuck', false);
  const seg = pieceSeg(s, id);
  const plan = s.lvl.segments[seg];
  const elev = hdr(s, H.elev);
  const shape = shapeByIndex(pieceShape(s, id));
  let revealed = revealedMask(s, seg);
  const opened: RevealedCell[] = [];
  for (const c of shape.cells) {
    const sx = pieceX(s, id) + c.x - SITE_X;
    const sy = pieceY(s, id) + c.y;
    const bit = 1 << sy;
    setWrongOccMask(s, seg, sx, wrongOccMask(s, seg, sx) & ~bit);
    setFilledMask(s, seg, sx, filledMask(s, seg, sx) | (bit & (plan?.planMask[sx] ?? 0)));
    const local = sy * SITE_COLS + sx;
    if (plan && (plan.hiddenMask >> local) & 1 && !((revealed >> local) & 1)) {
      revealed |= 1 << local;
      opened.push({
        x: SITE_X + sx,
        y: sy + elev,
        color: COLOR_CODES[plan.planColors[local] ?? 0] ?? 'W',
      });
    }
  }
  setRevealedMask(s, seg, revealed);
  return opened;
}

/** Y8 sticking of a wrongly placed site piece: `stuck = true`, its plan-area cells join `wrongOcc` (K-34, E-43). */
export function stickPiece(s: GameState, id: PieceId): void {
  if (pieceZone(s, id) !== Zone.site) throw new RangeError(`stickPiece: piece ${id} is not on the site`);
  setFlag(s, id, 'stuck', true);
  markSiteMasks(s, id, shapeByIndex(pieceShape(s, id)));
}

/** Rule hook consulted on a wrong site placement (TECH §7.1 `onPlacement`; Y8 mortar returns `stick`). */
export type PlacementOverride = { readonly kind: 'default' } | { readonly kind: 'stick' };

export interface PlacementRules {
  /**
   * Called for WRONG placements only, before anything moves; `cells` = the landed board cells. `stick` is honoured only
   * when every cell is inside the plan area (Y8 / E-08 guard, `allCellsInPlanArea`). Default: always `default`.
   */
  readonly onPlacement?: (
    s: GameState,
    pieceId: PieceId,
    cells: readonly BoardCell[],
    verdict: Verdict,
  ) => PlacementOverride;
}

export const DEFAULT_PLACEMENT_RULES: PlacementRules = Object.freeze({});

/** What K-35 step 3 did with a site placement. */
export type PlacementOutcome =
  | {
      readonly kind: 'correct';
      readonly at: PiecePlace;
      readonly cells: readonly At[];
      readonly revealed: readonly RevealedCell[];
    }
  | {
      readonly kind: 'stuck';
      readonly at: PiecePlace;
      readonly reason: VerdictReason;
      readonly missingSupport: readonly At[];
    }
  | {
      readonly kind: 'bounced';
      /** Where the block landed before bouncing (board anchor; may be above the board, e.g. on a full column). */
      readonly landing: Anchor;
      readonly target: ReturnTarget;
      readonly reason: VerdictReason;
      readonly missingSupport: readonly At[];
    };

export interface SettleOptions {
  /** The piece's place at move start; default = its record (the piece has not moved yet). */
  readonly start?: PiecePlace;
  readonly rules?: PlacementRules;
}

/**
 * K-35 step 3 for a block that landed (fall or rail) at board anchor `landing` of the visible segment, with the
 * `verdict` of `isCorrectPlacement` (`computeFall` gives both). Moves the piece exactly once, to its final place:
 * correct → lock (K-14, K-32); wrong + `stick` (Y8, all cells in the plan area) → stuck at the landing; otherwise the
 * K-17 bounce to `returnTarget` (a stuck block bounced back to its site start stays stuck). Combo, move cost and events
 * belong to the move pipeline.
 */
export function settlePlacement(
  s: GameState,
  pieceId: PieceId,
  landing: Anchor,
  verdict: Verdict,
  opts: SettleOptions = {},
): PlacementOutcome {
  const start = opts.start ?? piecePlace(s, pieceId);
  const shape = shapeByIndex(pieceShape(s, pieceId));
  const cells = blockCells(shape, landing.ix, landing.iy);
  const at = sitePlace(s, landing);
  if (verdict.ok) {
    movePiece(s, pieceId, at);
    const revealed = lockPiece(s, pieceId);
    const seg = at.seg;
    return {
      kind: 'correct',
      at,
      cells: cells.map((c) => ({ zone: 'site', x: c.x, y: c.y, seg })),
      revealed,
    };
  }
  const reason = verdict.reasons[0] ?? 'outside';
  const override = opts.rules?.onPlacement?.(s, pieceId, cells, verdict);
  if (override?.kind === 'stick' && allCellsInPlanArea(s, cells)) {
    movePiece(s, pieceId, at);
    stickPiece(s, pieceId);
    return { kind: 'stuck', at, reason, missingSupport: verdict.missingSupport };
  }
  const target = returnTarget(s, pieceId, { start });
  movePiece(s, pieceId, target.to);
  return { kind: 'bounced', landing, target, reason, missingSupport: verdict.missingSupport };
}

/**
 * S3 broken glass (K-35 step 2, GDD K-17 exceptions): the block returns by the K-17 search without a placement check;
 * a site start (stuck glass mortar) skips step 1, so it goes to the yard (or the queue) and unsticks. Returns the target.
 */
export function returnBrokenPiece(s: GameState, pieceId: PieceId, start?: PiecePlace): ReturnTarget {
  const from = start ?? piecePlace(s, pieceId);
  const target = returnTarget(s, pieceId, { start: from, skipStart: from.zone === 'site' });
  movePiece(s, pieceId, target.to);
  return target;
}

// --- internals ---------------------------------------------------------------------------------------------------------

function rowsBelow(r: number): number {
  return r >= 31 ? 0x7fffffff : (1 << r) - 1;
}

function lowestBit(m: number): number {
  return 31 - Math.clz32(m & -m);
}

/** Plan-row bits of the piece's own cells per site column when it sits on segment `seg` (else 0, 0). */
function ownSiteRows(s: GameState, id: PieceId, seg: number): readonly [number, number] {
  if (id < 0 || pieceZone(s, id) !== Zone.site || pieceSeg(s, id) !== seg) return [0, 0];
  const shape = shapeByIndex(pieceShape(s, id));
  const rows: [number, number] = [0, 0];
  for (const c of shape.cells) {
    const sx = pieceX(s, id) + c.x - SITE_X;
    const sy = pieceY(s, id) + c.y;
    if (sx >= 0 && sx < SITE_COLS && sy >= 0 && sy < BOARD_ROWS) rows[sx] = (rows[sx] ?? 0) | (1 << sy);
  }
  return rows;
}

function assertPlaceFits(shape: ShapeDef, to: PiecePlace): void {
  if (to.zone !== 'yard' && to.zone !== 'site') return;
  for (const c of shape.cells) {
    const x = to.x + c.x;
    const y = to.y + c.y;
    const ok =
      to.zone === 'yard'
        ? x >= 0 && x < YARD_COLS && y >= 0 && y < BOARD_ROWS
        : x >= SITE_X && x < SITE_X + SITE_COLS && y >= 0 && y < BOARD_ROWS && to.seg >= 0;
    if (!ok)
      throw new RangeError(`movePiece: ${shape.id} at ${to.zone} (${to.x},${to.y}) leaves the ${to.zone}`);
  }
}

/** Takes the piece off the occupancy grids, the site masks and the queue. */
function leaveBoard(s: GameState, id: PieceId, shape: ShapeDef): void {
  const zone = pieceZone(s, id);
  if (zone === Zone.queue) {
    const n = hdr(s, H.queueLen);
    for (let i = 0; i < n; i++) {
      if (s.buf[s.lvl.layout.queue + i] === id) {
        removeQueueAt(s, i);
        break;
      }
    }
    return;
  }
  if (zone !== Zone.yard && zone !== Zone.site) return;
  if (zone === Zone.site) {
    const seg = pieceSeg(s, id);
    for (const c of shape.cells) {
      const sx = pieceX(s, id) + c.x - SITE_X;
      const bit = 1 << (pieceY(s, id) + c.y);
      setWrongOccMask(s, seg, sx, wrongOccMask(s, seg, sx) & ~bit);
      setFilledMask(s, seg, sx, filledMask(s, seg, sx) & ~bit);
    }
  }
  vacatePiece(s, id);
}

function enterBoard(s: GameState, id: PieceId, shape: ShapeDef): void {
  const zone = pieceZone(s, id);
  if (zone !== Zone.yard && zone !== Zone.site) return;
  occupyPiece(s, id);
  if (zone === Zone.site) markSiteMasks(s, id, shape);
}

/** Sets the piece's `filled` (locked) or `wrongOcc` (debris, stuck) bits on its plan-area cells. */
function markSiteMasks(s: GameState, id: PieceId, shape: ShapeDef): void {
  const flags = pieceFlags(s, id);
  const locked = (flags & FLAG_BIT.locked) !== 0;
  const wrong = !locked && (flags & (FLAG_BIT.debris | FLAG_BIT.stuck)) !== 0;
  if (!locked && !wrong) return;
  const seg = pieceSeg(s, id);
  const plan = s.lvl.segments[seg];
  for (const c of shape.cells) {
    const sx = pieceX(s, id) + c.x - SITE_X;
    const bit = 1 << (pieceY(s, id) + c.y);
    if (locked) setFilledMask(s, seg, sx, filledMask(s, seg, sx) | (bit & (plan?.planMask[sx] ?? 0)));
    else setWrongOccMask(s, seg, sx, wrongOccMask(s, seg, sx) | (bit & planAreaMask(s.lvl, seg, sx)));
  }
}
