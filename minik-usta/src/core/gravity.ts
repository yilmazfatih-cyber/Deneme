/**
 * Falls and yard gravity (docs/GDD.md K-11, K-18, K-19, K-20; OBSTACLES W8, S3, S8, Y2, Y6; TECH_DESIGN §5.1, §5.3).
 *
 * `computeFall` is the ONE fall function of the shadow (K-18) and of the move pipeline (K-35 step 2): the shadow shows
 * exactly what a release would do. Order (GDD K-11): rule `modifyFall` hooks (W8 wind sets `drift`, S8 balloon sets
 * `dir = +1`) → wind shift at the release row → fall (or balloon rise) → G-L steering (K-19, only where the level's
 * gravity profile is steerable) → landing; then the verdict (`isCorrectPlacement`, K-16 + K-34), the `?` neutrality
 * flag (K-18, E-20) and the `onLanded` preview (S3 glass break). Core has no obstacle-specific code: hooks come from
 * the caller (obstacle registry), like movement's `DragRules`.
 *
 * Landing (K-11): with open sky the block falls onto `max_c (top(c) − colBottom_c)`; the implementation scans the
 * blocked rows below the block in each covered column, which is the same under open sky and also right after a G-L
 * shift under an overhang. Balloon on the site (S8, S-9): it hangs from the plan top of the visible segment
 * (`ceilAnchor = h + e − hBlock`) unless the silhouette already reaches it: `max(ceilAnchor, support)` — a balloon
 * released above the ceiling comes down to it (E-35).
 *
 * `settleYard` is K-35 step 6 (TECH §5.3): synchronous half steps (falling half with balloons solid, rising half with
 * everything else solid) until nothing moves, then the neighbour effects of the falls (rule hook); when a hook tears a
 * bag or removes a crate, gravity runs again (E-12). Bags (Y2) always fall; blocks fall and balloons rise only with
 * yard gravity (Y6, K-20). Crates never move and support.
 */
import { Zone } from './types.ts';
import type { Anchor, At, DragNode, PieceId, Steer, Verdict, VerdictReason } from './types.ts';
import { BOARD_ROWS, GRID_COLS, GRID_ROWS, SITE_COLS, SITE_X } from './coords.ts';
import { shapeByIndex } from './shapes.ts';
import type { ShapeDef } from './shapes.ts';
import type { CompiledLevel } from './level/compile.ts';
import {
  FLAG_BIT,
  H,
  OF,
  hdr,
  obstacleField,
  pieceFlags,
  pieceShape,
  pieceX,
  pieceY,
  pieceZone,
  revealedMask,
  setPieceY,
  setYardOcc,
  siteOcc,
  yardOcc,
} from './state.ts';
import type { GameState } from './state.ts';
import { occupyPiece, vacatePiece, visibleSegment } from './grid.ts';
import type { BoardCell } from './grid.ts';
import { FREE, blockCells } from './movement.ts';
import { isCorrectPlacement } from './placement.ts';

// --- types -----------------------------------------------------------------------------------------------------------

/** The fall a release starts (TECH §5.1). `ix`/`iy` = release anchor (read-only context for hooks). */
export interface FallPlan {
  readonly ix: number;
  readonly iy: number;
  /** −1 falls; +1 rises (S8 balloon). */
  readonly dir: -1 | 1;
  /** W8 wind shift at the release row, before the fall. */
  readonly drift: -1 | 0 | 1;
  /** G-L steering input (GDD K-19, `{ dir, atRow }`); only present on steerable levels. */
  readonly steer?: Steer;
}

/** `onLanded` result (TECH §7.1): S3 glass breaks with a move-cost penalty. */
export type LandingEffect = { readonly kind: 'none' } | { readonly kind: 'break'; readonly penalty: number };

export const NO_EFFECT: LandingEffect = Object.freeze({ kind: 'none' });

export interface FallResult {
  /** FREE: dropped and fell (or rose); RAIL: stays where it is released (K-12). */
  readonly mode: 'free' | 'rail';
  /** Board anchor where the block comes to rest (may be in the crane rows on a full column: outside the plan). */
  readonly landing: Anchor;
  /** Motion direction of the plan: −1 fall, +1 balloon. */
  readonly dir: -1 | 1;
  /**
   * Rows travelled in `dir` from the release row to the landing row (K-11 `d`, GDD K-19 rule 5: total, steering
   * included). Falls: ≥ 0 (`pieceFell.rows`); balloon: rise, negative when it came down to the ceiling
   * (`balloonRose.rows`, E-35).
   */
  readonly distance: number;
  /** Turning points for the animation: release, wind shift, steer row and shift, landing (no repeats). */
  readonly path: readonly Anchor[];
  readonly drift: -1 | 0 | 1;
  /** The steering that took effect; null when none was given or it was void (K-19 rule 4: the right is kept). */
  readonly steered: Steer | null;
  /** Board cells at the landing. */
  readonly cells: readonly BoardCell[];
  /** `isCorrectPlacement` of the landing (K-16 + K-34; shadow K-18). */
  readonly verdict: Verdict;
  /** A landing cell covers an unrevealed `?` plan cell: the shadow is neutral at every difficulty (K-18, E-20). */
  readonly touchesHidden: boolean;
  /** `onLanded` preview (S3 glass break); always `none` on the rail. */
  readonly effect: LandingEffect;
}

/** Rule hooks of a fall (TECH §7.1 `modifyFall`, `onLanded`), composed in rule order by the caller. Pure previews. */
export interface FallRules {
  readonly modifyFall?: (s: GameState, pieceId: PieceId, plan: FallPlan) => FallPlan;
  readonly onLanded?: (s: GameState, pieceId: PieceId, fall: Omit<FallResult, 'effect'>) => LandingEffect;
}

export const DEFAULT_FALL_RULES: FallRules = Object.freeze({});

export interface FallOptions {
  /** G-L steering (move record `steer`); ignored unless the level's gravity profile is steerable (K-19). */
  readonly steer?: Steer;
  readonly rules?: FallRules;
}

// --- computeFall --------------------------------------------------------------------------------------------------------

/**
 * `computeFall(state, pieceId, node, opts)` (TECH §5.1). `node` = a release node with every cell on the site
 * (`classify` rows 6 and 7); the board is the frozen drag board (the piece may still sit at its start: it is ignored).
 * Pure: never changes the state. Throws when the node is not fully on the site.
 */
export function computeFall(
  s: GameState,
  pieceId: PieceId,
  node: DragNode,
  opts: FallOptions = {},
): FallResult {
  const shape = shapeByIndex(pieceShape(s, pieceId));
  if (
    !Number.isInteger(node.ix) ||
    !Number.isInteger(node.iy) ||
    node.ix < SITE_X ||
    node.ix + shape.w > GRID_COLS ||
    node.iy < 0 ||
    node.iy + shape.h > GRID_ROWS
  )
    throw new RangeError(`computeFall: ${shape.id} at (${node.ix},${node.iy}) is not fully on the site`);

  if (node.mode !== FREE) {
    // K-12 / K-18: the rail holds the block where it is released; no wind, no balloon, no glass break
    const landing = { ix: node.ix, iy: node.iy };
    const cells = blockCells(shape, node.ix, node.iy);
    return {
      mode: 'rail',
      landing,
      dir: -1,
      distance: 0,
      path: [landing],
      drift: 0,
      steered: null,
      cells,
      verdict: isCorrectPlacement(s, pieceId, cells),
      touchesHidden: touchesHiddenCell(s, cells),
      effect: NO_EFFECT,
    };
  }

  const rules = opts.rules ?? DEFAULT_FALL_RULES;
  const steer = opts.steer && s.lvl.gravity.steerable ? opts.steer : undefined;
  let plan: FallPlan = { ix: node.ix, iy: node.iy, dir: -1, drift: 0, ...(steer ? { steer } : {}) };
  if (rules.modifyFall) plan = rules.modifyFall(s, pieceId, plan);

  const cols = siteColumnMasks(s, pieceId);
  const y0 = node.iy;
  let x = node.ix;
  const path: Anchor[] = [{ ix: x, iy: y0 }];

  // W8: shift one column at the release row when the shifted block is on the site, free and under open sky
  let drift: -1 | 0 | 1 = 0;
  if (
    plan.drift !== 0 &&
    fitsOnSite(cols, shape, x + plan.drift, y0) &&
    openSky(cols, shape, x + plan.drift, y0)
  ) {
    x += plan.drift;
    drift = plan.drift;
    pushPoint(path, x, y0);
  }

  const dir = plan.dir;
  const ceil = ceilingAnchor(s, shape);
  let land = dir < 0 ? fallFrom(cols, shape, x, y0) : Math.max(ceil, fallFrom(cols, shape, x, y0));

  // G-L (K-19 rules 3–4): shift one column at `atRow`, between the release row and the unsteered landing row (both
  // included), when every shifted cell is on x 6–7 and empty; then go on in the same direction in the new column
  let steered: Steer | null = null;
  const st = s.lvl.gravity.steerable ? plan.steer : undefined;
  if (st) {
    const nx = x + st.dir;
    const lo = Math.min(y0, land);
    const hi = Math.max(y0, land);
    if (
      Number.isInteger(st.atRow) &&
      st.atRow >= lo &&
      st.atRow <= hi &&
      fitsOnSite(cols, shape, nx, st.atRow)
    ) {
      pushPoint(path, x, st.atRow);
      x = nx;
      pushPoint(path, x, st.atRow);
      steered = { dir: st.dir, atRow: st.atRow };
      if (dir < 0) land = fallFrom(cols, shape, x, st.atRow);
      else
        land =
          st.atRow <= ceil
            ? riseFrom(cols, shape, x, st.atRow, ceil)
            : Math.max(ceil, fallFrom(cols, shape, x, st.atRow));
    }
  }
  pushPoint(path, x, land);

  const landing = { ix: x, iy: land };
  const cells = blockCells(shape, x, land);
  const partial: Omit<FallResult, 'effect'> = {
    mode: 'free',
    landing,
    dir,
    distance: dir < 0 ? y0 - land : land - y0,
    path,
    drift,
    steered,
    cells,
    verdict: isCorrectPlacement(s, pieceId, cells),
    touchesHidden: touchesHiddenCell(s, cells),
  };
  return { ...partial, effect: rules.onLanded ? rules.onLanded(s, pieceId, partial) : NO_EFFECT };
}

/**
 * Blocked board rows (bits 0–9) of site columns x 6 and x 7: platform rows below the elevator offset and the visible
 * segment's occupied cells (board rows < 8, as in the drag collision masks), the `exclude` piece left out.
 */
export function siteColumnMasks(s: GameState, exclude: PieceId = -1): [number, number] {
  const seg = visibleSegment(s);
  const elev = hdr(s, H.elev);
  const skip = exclude + 1;
  const out: [number, number] = [0, 0];
  for (let sx = 0; sx < SITE_COLS; sx++) {
    let m = elev > 0 ? (1 << Math.min(elev, GRID_ROWS)) - 1 : 0;
    for (let sy = 0; sy < BOARD_ROWS && sy + elev < BOARD_ROWS; sy++) {
      const v = siteOcc(s, seg, sx, sy);
      if (v !== 0 && v !== skip) m |= 1 << (sy + elev);
    }
    out[sx] = m;
  }
  return out;
}

/**
 * Unsteered, unshifted landing row of `pieceId` released FREE at `(ix, iy)` on the site, moving in `dir` (−1 fall,
 * +1 balloon): what a W8 hook needs for its `d ≥ 1` condition (E-17; balloon `d = |release − ceiling|`, E-35).
 */
export function siteLandingRow(s: GameState, pieceId: PieceId, ix: number, iy: number, dir: -1 | 1): number {
  const shape = shapeByIndex(pieceShape(s, pieceId));
  const cols = siteColumnMasks(s, pieceId);
  const support = fallFrom(cols, shape, ix, iy);
  return dir < 0 ? support : Math.max(ceilingAnchor(s, shape), support);
}

/**
 * S8 in the yard (K-10, E-14): a balloon released at yard anchor `(ix, iy)` rises until its top cell is under the first
 * occupied cell of its columns, or at y = 7. Returns the anchor row (the piece itself is ignored).
 */
export function yardBalloonLanding(s: GameState, pieceId: PieceId, ix: number, iy: number): number {
  const shape = shapeByIndex(pieceShape(s, pieceId));
  const skip = pieceId + 1;
  let land = BOARD_ROWS - shape.h;
  for (let c = 0; c < shape.w; c++) {
    const top = shape.colTop[c] ?? 0;
    for (let y = iy + top + 1; y < BOARD_ROWS; y++) {
      const v = yardOcc(s, ix + c, y);
      if (v !== 0 && v !== skip) {
        land = Math.min(land, y - 1 - top);
        break;
      }
    }
  }
  return Math.max(land, iy);
}

// --- shadow ---------------------------------------------------------------------------------------------------------------

/** What the fall shadow may show (GDD K-18, K-34 hook 2; style is design-lead's). */
export interface ShadowInfo {
  /** Easy/normal: correct or wrong; hard/superhard or a covered unrevealed `?` cell: neutral (position only). */
  readonly tone: 'correct' | 'wrong' | 'neutral';
  /** Reasons the shadow may show: all on easy/normal; only `support` when neutral (never `color`). */
  readonly reasons: readonly VerdictReason[];
  readonly missingSupport: readonly At[];
  /** Physics information, shown at every difficulty (S3 crack). */
  readonly breaks: boolean;
}

/** GDD K-18: correctness on easy/normal levels only, neutral whenever the landing touches an unrevealed `?` cell. */
export function shadowInfo(fall: FallResult, difficulty: CompiledLevel['difficulty']): ShadowInfo {
  const breaks = fall.effect.kind === 'break';
  const neutral = difficulty === 'hard' || difficulty === 'superhard' || fall.touchesHidden;
  if (!neutral) {
    return {
      tone: fall.verdict.ok ? 'correct' : 'wrong',
      reasons: fall.verdict.reasons,
      missingSupport: fall.verdict.missingSupport,
      breaks,
    };
  }
  const support = fall.verdict.reasons.includes('support');
  return {
    tone: 'neutral',
    reasons: support ? ['support'] : [],
    missingSupport: support ? fall.verdict.missingSupport : [],
    breaks,
  };
}

// --- yard gravity (K-35 step 6) ----------------------------------------------------------------------------------------

/** One entity's total motion in a `settleYard` call. */
export interface YardMotion {
  readonly kind: 'piece' | 'bag';
  /** Piece id, or obstacle index of a bag. */
  readonly id: number;
  readonly from: Anchor;
  readonly to: Anchor;
  /** `to.iy − from.iy`: < 0 fell (`pieceFell{cause:'yardGravity'}.rows = −dy`), > 0 a balloon rose. */
  readonly dy: number;
}

/** A block that fell in one settle pass, with its cells before that pass (K-35 step 6 neighbour effects). */
export interface FallenBlock {
  readonly pieceId: PieceId;
  readonly cells: readonly BoardCell[];
}

export interface SettleHooks {
  /**
   * Neighbour effects of the blocks that fell in a pass (bags and rising balloons produce none, N26), in (y, x) order
   * of their pre-fall anchors. Return true when the yard changed (a bag tore, a crate vanished): gravity runs again
   * (E-12). Default: none.
   */
  readonly onFallen?: (s: GameState, fallen: readonly FallenBlock[]) => boolean;
}

/** Safety bound of the outer loop; each extra pass needs an obstacle to disappear. */
const MAX_SETTLE_PASSES = 64;

interface Ent {
  readonly kind: 'piece' | 'bag';
  readonly id: number;
  readonly shape: ShapeDef | null;
  x: number;
  y: number;
  readonly falls: boolean;
  readonly rises: boolean;
  flag: boolean;
}

/**
 * `settleYard(state, hooks)` — K-35 step 6 (TECH §5.3, GDD K-20, E-33). Mutates the state; returns one motion per
 * entity that moved, in (y, x) order of the start anchors.
 */
export function settleYard(s: GameState, hooks: SettleHooks = {}): YardMotion[] {
  const first = new Map<string, { kind: Ent['kind']; id: number; from: Anchor; to: Anchor }>();
  for (let pass = 0; pass < MAX_SETTLE_PASSES; pass++) {
    const ents = yardEntities(s);
    if (ents.length === 0) break;
    const byValue = new Map<number, Ent>();
    for (const e of ents) byValue.set(e.kind === 'piece' ? e.id + 1 : -(e.id + 1), e);
    const passStart = new Map<Ent, BoardCell[]>();
    for (const e of ents) if (e.kind === 'piece' && e.falls) passStart.set(e, entCells(e));
    const startAnchor = new Map<Ent, Anchor>(ents.map((e) => [e, { ix: e.x, iy: e.y }]));

    for (let guard = 0; guard < 4 * GRID_ROWS * (ents.length + 1); guard++) {
      const fell = halfStep(s, ents, byValue, -1);
      const rose = halfStep(s, ents, byValue, 1);
      if (!fell && !rose) break;
    }

    const fell: { readonly start: Anchor; readonly block: FallenBlock }[] = [];
    for (const e of ents) {
      const start = startAnchor.get(e);
      if (!start || (start.ix === e.x && start.iy === e.y)) continue;
      const key = `${e.kind}:${e.id}`;
      const rec = first.get(key);
      if (rec) rec.to = { ix: e.x, iy: e.y };
      else first.set(key, { kind: e.kind, id: e.id, from: start, to: { ix: e.x, iy: e.y } });
      const cells = passStart.get(e);
      if (cells) fell.push({ start, block: { pieceId: e.id, cells } });
    }
    if (fell.length === 0 || !hooks.onFallen) break;
    fell.sort(
      (a, b) => a.start.iy - b.start.iy || a.start.ix - b.start.ix || a.block.pieceId - b.block.pieceId,
    );
    const blocks = fell.map((f) => f.block);
    if (!hooks.onFallen(s, blocks)) break;
  }
  const out: YardMotion[] = [];
  for (const m of first.values()) {
    if (m.from.ix === m.to.ix && m.from.iy === m.to.iy) continue;
    out.push({ kind: m.kind, id: m.id, from: m.from, to: m.to, dy: m.to.iy - m.from.iy });
  }
  return out.sort(
    (a, b) =>
      a.from.iy - b.from.iy ||
      a.from.ix - b.from.ix ||
      (a.kind === b.kind ? 0 : a.kind === 'piece' ? -1 : 1) ||
      a.id - b.id,
  );
}

/** Movable yard entities: bags always fall; with Y6 blocks fall and balloons rise; anything else is solid. */
function yardEntities(s: GameState): Ent[] {
  const yardOn = s.lvl.gravity.yard;
  const ents: Ent[] = [];
  if (yardOn) {
    const P = s.lvl.layout.counts.pieces;
    for (let id = 0; id < P; id++) {
      if (pieceZone(s, id) !== Zone.yard) continue;
      const balloon = (pieceFlags(s, id) & FLAG_BIT.balloon) !== 0;
      ents.push({
        kind: 'piece',
        id,
        shape: shapeByIndex(pieceShape(s, id)),
        x: pieceX(s, id),
        y: pieceY(s, id),
        falls: !balloon,
        rises: balloon,
        flag: false,
      });
    }
  }
  for (const o of s.lvl.obstacles) {
    if (o.type !== 'cement_bag' || obstacleField(s, o.index, OF.hp) <= 0) continue;
    for (let y = 0; y < BOARD_ROWS; y++) {
      if (yardOcc(s, o.x, y) === -(o.index + 1)) {
        ents.push({
          kind: 'bag',
          id: o.index,
          shape: null,
          x: o.x,
          y,
          falls: true,
          rises: false,
          flag: false,
        });
        break;
      }
    }
  }
  return ents;
}

function entCells(e: Ent): BoardCell[] {
  return e.shape ? blockCells(e.shape, e.x, e.y) : [{ x: e.x, y: e.y }];
}

/**
 * One half step. dir −1 (falling half): every unsupported faller moves down 1; support = the floor, a solid cell
 * (crate, a block that does not fall, a balloon) or a supported faller (fixed point). dir +1 (rising half): every
 * unblocked balloon moves up 1; blocked = the y = 7 ceiling, a solid cell or a blocked balloon. Returns whether
 * anything moved.
 */
function halfStep(
  s: GameState,
  ents: readonly Ent[],
  byValue: ReadonlyMap<number, Ent>,
  dir: -1 | 1,
): boolean {
  const movers = ents.filter((e) => (dir < 0 ? e.falls : e.rises));
  if (movers.length === 0) return false;
  for (const e of movers) e.flag = false; // supported (fall) / blocked (rise)
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of movers) {
      if (e.flag) continue;
      if (stopped(s, e, byValue, dir)) {
        e.flag = true;
        changed = true;
      }
    }
  }
  const moving = movers.filter((e) => !e.flag);
  if (moving.length === 0) return false;
  for (const e of moving) clearEnt(s, e);
  for (const e of moving) {
    e.y += dir;
    if (e.kind === 'piece') setPieceY(s, e.id, e.y);
    writeEnt(s, e);
  }
  return true;
}

/** The entity cannot move in `dir` this half step (see `halfStep`). */
function stopped(s: GameState, e: Ent, byValue: ReadonlyMap<number, Ent>, dir: -1 | 1): boolean {
  const self = e.kind === 'piece' ? e.id + 1 : -(e.id + 1);
  for (const c of entCells(e)) {
    const ny = c.y + dir;
    if (ny < 0 || ny >= BOARD_ROWS) return true;
    const v = yardOcc(s, c.x, ny);
    if (v === 0 || v === self) continue;
    const o = byValue.get(v);
    if (!o) return true; // crate or a block that does not move
    if (dir < 0 ? !o.falls : !o.rises) return true; // solid in this half
    if (o.flag) return true; // a supported faller / blocked balloon
  }
  return false;
}

function clearEnt(s: GameState, e: Ent): void {
  if (e.kind === 'piece') vacatePiece(s, e.id);
  else setYardOcc(s, e.x, e.y, 0);
}

function writeEnt(s: GameState, e: Ent): void {
  if (e.kind === 'piece') occupyPiece(s, e.id);
  else setYardOcc(s, e.x, e.y, -(e.id + 1));
}

// --- internals ----------------------------------------------------------------------------------------------------------

function pushPoint(path: Anchor[], ix: number, iy: number): void {
  const last = path[path.length - 1];
  if (!last || last.ix !== ix || last.iy !== iy) path.push({ ix, iy });
}

/** Balloon ceiling on the site (S8, S-9): the block's top cell hangs at board row `h + e − 1` of the visible plan. */
function ceilingAnchor(s: GameState, shape: ShapeDef): number {
  const plan = s.lvl.segments[visibleSegment(s)];
  return (plan?.height ?? 0) + hdr(s, H.elev) - shape.h;
}

/** Every cell on x 6–7 inside the grid and not blocked. */
function fitsOnSite(cols: readonly [number, number], shape: ShapeDef, ix: number, iy: number): boolean {
  if (ix < SITE_X || ix + shape.w > GRID_COLS || iy < 0 || iy + shape.h > GRID_ROWS) return false;
  for (let c = 0; c < shape.w; c++) {
    if ((((shape.colRows[c] ?? 0) << iy) & (cols[ix + c - SITE_X] ?? 0)) !== 0) return false;
  }
  return true;
}

/** K-11 open sky: nothing blocked at or above the block's lowest cell in each covered column. */
function openSky(cols: readonly [number, number], shape: ShapeDef, ix: number, iy: number): boolean {
  for (let c = 0; c < shape.w; c++) {
    if ((cols[ix + c - SITE_X] ?? 0) >> (iy + (shape.colBottom[c] ?? 0)) !== 0) return false;
  }
  return true;
}

/** Anchor row after falling from `(ix, iy)`: onto the highest blocked row below the block in each covered column. */
function fallFrom(cols: readonly [number, number], shape: ShapeDef, ix: number, iy: number): number {
  let land = 0;
  for (let c = 0; c < shape.w; c++) {
    const bottom = shape.colBottom[c] ?? 0;
    const below = (cols[ix + c - SITE_X] ?? 0) & ((1 << (iy + bottom)) - 1);
    const support = below === 0 ? -1 : 31 - Math.clz32(below);
    land = Math.max(land, support + 1 - bottom);
  }
  return land;
}

/** Anchor row after rising from `(ix, iy)` up to `cap`: under the lowest blocked row above the block. */
function riseFrom(
  cols: readonly [number, number],
  shape: ShapeDef,
  ix: number,
  iy: number,
  cap: number,
): number {
  let land = cap;
  for (let c = 0; c < shape.w; c++) {
    const top = shape.colTop[c] ?? 0;
    const above = (cols[ix + c - SITE_X] ?? 0) >> (iy + top + 1);
    if (above === 0) continue;
    const first = 31 - Math.clz32(above & -above) + iy + top + 1;
    land = Math.min(land, first - 1 - top);
  }
  return Math.max(land, iy);
}

/** A cell is an unrevealed `?` plan cell of the visible segment (K-18, K-32). */
function touchesHiddenCell(s: GameState, cells: readonly BoardCell[]): boolean {
  const seg = visibleSegment(s);
  const plan = s.lvl.segments[seg];
  if (!plan || plan.hiddenMask === 0) return false;
  const hidden = plan.hiddenMask & ~revealedMask(s, seg);
  const elev = hdr(s, H.elev);
  for (const c of cells) {
    const sx = c.x - SITE_X;
    const sy = c.y - elev;
    if (sx < 0 || sx >= SITE_COLS || sy < 0 || sy >= BOARD_ROWS) continue;
    if ((hidden >> (sy * SITE_COLS + sx)) & 1) return true;
  }
  return false;
}
