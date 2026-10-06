/**
 * Drag movement (docs/GDD.md K-04, K-05, K-07…K-13; docs/TECH_DESIGN.md §4).
 *
 * Edge model (R-03, D-010): the wall is the zero-width boundary between x = 5 and x = 6. A drag node is
 * `(ix, iy, mode)`, mode FREE (0) or RAIL(g) (1 + gap index); integer code `mode * 80 + iy * 8 + ix`
 * (= coords.dragNodeCode). `beginDrag` runs the K-09 pick gate and ONE BFS over the nodes (the board is frozen while
 * dragging, K-08, so the reachable set R never changes); the session then answers the scene's read-only queries:
 * reachability, the K-07 release class (cancel preview), K-08 sticky follow with its tie-break rules and hysteresis,
 * the BFS path the view follows, and the scene signals `blockedByWallHeight` (K-05), `dragCrossedWall` /
 * `dragEnteredRail` (tutorial `overWall` / `gapPass`, TECH §8.2). The session keeps no reference to the state.
 *
 * Nodes (TECH §4.2):
 * - FREE(ix, iy) valid ⇔ inside the 8 × 10 grid (heavy: `ix + w ≤ 6`, Y5/N6), no collision, every row that has block
 *   cells on BOTH sides of the boundary is open in FREE mode (`y ≥ wall.height`), and open sky (K-11, K-13): in every
 *   site column the block covers, its lowest cell is above every blocked cell of that column.
 * - RAIL(g)(ix, iy) valid ⇔ inside the grid, no collision, gap passable (rules' `canPassGap`), K-12 alignment (every
 *   block row inside the gap rows) and the block straddles the boundary or is fully on the site.
 * Edges (unit steps; in a horizontal step every cell that changes side must be in a row open in the step's mode —
 * FREE: `openFree`, any step touching RAIL(g): the rows of g):
 * - FREE → FREE: left, right, down, up. FREE → RAIL(g): right, only from a node fully in the yard (K-12).
 * - RAIL(g) → RAIL(g): left / right only (vertical position locked). RAIL(g) → FREE: left, onto a node fully in the yard.
 * Neighbour order (left, right, down, up) is fixed: it decides the BFS parents and so the path the view follows
 * (GDD K-08 example: (2,6) → (3,9) goes (2,7), (2,8), (3,8), (3,9)).
 */
import {
  H,
  FLAG_BIT,
  GF,
  gapField,
  hdr,
  pieceFlags,
  pieceShape,
  pieceSeg,
  pieceX,
  pieceY,
  pieceZone,
} from './state.ts';
import type { GameState } from './state.ts';
import { Zone } from './types.ts';
import type { DragMode, DragNode, PieceId } from './types.ts';
import {
  BOARD_ROWS,
  BOUNDARY_X,
  CRANE_ROW,
  GRID_COLS,
  GRID_ROWS,
  ROW_MASK_ALL,
  SITE_COLS,
  SITE_X,
  YARD_COLS,
  boundaryAllows,
  openFreeMask,
  rowRangeMask,
} from './coords.ts';
import { shapeByIndex } from './shapes.ts';
import type { ShapeDef } from './shapes.ts';
import { collisionMasks, siteColumnTops, visibleSegment } from './grid.ts';
import type { BoardCell } from './grid.ts';

/** DragMode of free movement (TECH §2.1). */
export const FREE: DragMode = 0;
/** DragMode of the rail through gap `gap` (TECH §2.1). */
export function railMode(gap: number): DragMode {
  return gap + 1;
}

/** Nodes per mode: 8 × 10 anchors. */
export const NODES_PER_MODE = GRID_COLS * GRID_ROWS;
/** K-08: a new node is taken only when its squared distance is at least this much smaller than the current one. */
export const HYSTERESIS_D2 = 0.2;
/** Float tolerance of the K-08 comparisons (TECH §4.4). */
export const D2_EPSILON = 1e-9;

const YARD_BITS = (1 << YARD_COLS) - 1;
const SITE_BITS = ((1 << SITE_COLS) - 1) << SITE_X;
const UNKNOWN = 0;
const VALID = 1;
const INVALID = 2;

/**
 * Transient BFS scratch shared by every session. A BFS always runs synchronously to its end and nothing else touches
 * these arrays meanwhile, so sharing them is safe and keeps `beginDrag` to one buffer allocation (TECH §4.5: arrays
 * of ≥ 64 elements cost one off-heap ArrayBuffer each, ≈ 2.5 µs in Node 22).
 */
let sharedQueue = new Int16Array(4 * NODES_PER_MODE);
const NEIGHBOURS = new Int16Array(8);

/**
 * Rule hooks the drag consults (TECH §4.1 step 1, §4.2 RAIL condition 4, §7.1). Core has no obstacle-specific `if`:
 * the caller passes the active rules' hooks (obstacle registry). Every field is optional.
 */
export interface DragRules {
  /** K-09 (c): false when an active rule forbids picking (Y3 chain, Y4 wet). Default: always true. */
  readonly canPick?: (s: GameState, pieceId: PieceId) => boolean;
  /**
   * RAIL condition 4: whether `pieceId` may pass gap `gap` now (W4 shutter open, W7 unlocked, both true while K-40
   * Open Shutter runs). It decides alone (K-40 may open a closed shutter). Default: the gap's `open` state field.
   */
  readonly canPassGap?: (s: GameState, gap: number, pieceId: PieceId) => boolean;
  /** K-07 row 5 / E-27: every segment is complete and the level goes on for an extra goal. Default: `isSiteClosed`. */
  readonly siteClosed?: (s: GameState) => boolean;
}

/** Rules of a level without obstacle hooks (Phase 2: W1 static gaps are always open). */
export const DEFAULT_DRAG_RULES: DragRules = Object.freeze({});

/** K-07 row 5 (E-27): `deliveryCursor` counts completed segments; the site is closed once all S are complete. */
export function isSiteClosed(s: GameState): boolean {
  return hdr(s, H.deliveryCursor) >= s.lvl.segments.length;
}

/** `moveCancelled.reason` values of a release (TECH §6.3); `invalid` = the node is not in R. */
export type DropCancelReason = 'sameSpot' | 'craneOverYard' | 'straddle' | 'siteClosed' | 'invalid';

/** Result of the K-07 release table (TECH §4.3). `row` is the GDD K-07 row number (0 = not a reachable node). */
export type DropClass =
  | { readonly kind: 'cancel'; readonly reason: DropCancelReason; readonly row: 0 | 1 | 3 | 4 | 5 }
  | { readonly kind: 'yard'; readonly row: 2 }
  | { readonly kind: 'siteFree'; readonly row: 6 }
  | { readonly kind: 'siteRail'; readonly row: 7; readonly gap: number };

const DROP_INVALID: DropClass = Object.freeze({ kind: 'cancel', reason: 'invalid', row: 0 });
const DROP_SAME_SPOT: DropClass = Object.freeze({ kind: 'cancel', reason: 'sameSpot', row: 1 });
const DROP_YARD: DropClass = Object.freeze({ kind: 'yard', row: 2 });
const DROP_CRANE_OVER_YARD: DropClass = Object.freeze({ kind: 'cancel', reason: 'craneOverYard', row: 3 });
const DROP_STRADDLE: DropClass = Object.freeze({ kind: 'cancel', reason: 'straddle', row: 4 });
const DROP_SITE_CLOSED: DropClass = Object.freeze({ kind: 'cancel', reason: 'siteClosed', row: 5 });
const DROP_SITE_FREE: DropClass = Object.freeze({ kind: 'siteFree', row: 6 });

/** True for the K-07 rows that cancel (no move spent, nothing changes). */
export function isCancelled(drop: DropClass): boolean {
  return drop.kind === 'cancel';
}

/** One `follow` / `moveTo` step of the view (TECH §4.4). */
export interface FollowResult {
  /** Current node after the call. */
  readonly node: DragNode;
  readonly changed: boolean;
  /**
   * Nodes the view passes, from the previous node (excluded) to `node` (included); empty when unchanged. Consecutive
   * nodes are one unit step apart, except a mode switch between two start nodes (same cells; debris, TECH §4.1/3).
   */
  readonly path: readonly DragNode[];
  /** `dragCrossedWall`: the first FREE → FREE step of this drag that moves block cells across the boundary. */
  readonly crossedWall: boolean;
  /** `dragEnteredRail`: the first FREE → RAIL(g) step of this drag (a debris RAIL start node does not count). */
  readonly enteredRail: boolean;
  /** K-05 presentation signal, at most once per drag. */
  readonly blockedByWallHeight: boolean;
}

/** A drag in progress: read-only queries over the frozen board (TECH §1.4, §4). */
export interface DragSession {
  readonly pieceId: PieceId;
  readonly shape: ShapeDef;
  /** FREE start node (the piece's anchor; site pieces: board row = plan row + elevator offset). */
  readonly start: DragNode;
  /** FREE start, plus RAIL(g) for debris whose rows are all inside an open gap (TECH §4.1/3). */
  readonly startNodes: readonly DragNode[];
  readonly current: DragNode;
  /** |R| (start nodes included). */
  readonly reachableCount: number;
  /** R contains a FREE → FREE step across the boundary (tutorial lock guarantee `overWall`, TECH §8.2). */
  readonly canCrossWall: boolean;
  /** R contains a FREE → RAIL(g) step (tutorial lock guarantee `gapPass`, TECH §8.2). */
  readonly canEnterRail: boolean;
  isReachable(node: DragNode): boolean;
  /** BFS steps from the start nodes; −1 outside R. */
  distanceFromStart(node: DragNode): number;
  /** BFS steps from the current node (K-08 tie-break 1); −1 outside R. */
  distanceFromCurrent(node: DragNode): number;
  /** R sorted by node code (FREE first, then by y, then by x). Allocates. */
  reachableNodes(): DragNode[];
  /** Nodes one edge away from `node` (left, right, down, up order). Allocates. */
  neighbours(node: DragNode): DragNode[];
  /** K-08 nearest node of R to the target anchor point `(px, py)`, tie-breaks applied, no hysteresis. */
  nearest(px: number, py: number): DragNode;
  /** K-08 sticky follow: moves the current node to `nearest(p)` when the hysteresis allows it. */
  follow(px: number, py: number): FollowResult;
  /** BFS path from the current node (excluded) to `node` (included); null outside R. Allocates. */
  pathTo(node: DragNode): DragNode[] | null;
  /** Moves the current node to `node` along the BFS path (bots, harness, forced release); throws outside R. */
  moveTo(node: DragNode): FollowResult;
  /** K-07 release table for `node` (default: the current node); cancel preview of the shadow (TECH §4.3). */
  classify(node?: DragNode): DropClass;
  /** Board cells of the block at `node`. Allocates. */
  cells(node: DragNode): BoardCell[];
}

/** Why a piece cannot be picked (scene feedback: K-14 no reaction, K-09 (a) "kımıldamıyor" shake, E-30). */
export type PickFailure = 'notOnBoard' | 'hiddenSegment' | 'locked' | 'noMoves' | 'rule' | 'immovable';

export type DragAttempt =
  { readonly ok: true; readonly session: DragSession } | { readonly ok: false; readonly reason: PickFailure };

/**
 * K-09 pick gate + BFS (TECH §4.1). Checks, in order: the piece is on the board (yard, or site in the visible segment;
 * K-22, K-23), not locked (K-14), `movesLeft > 0` (K-07, E-30), every `canPick` hook (K-09 (c)), and R holds a node
 * whose cells differ from the start cells (K-09 (a)). Crates and bags are obstacles, never pieces (K-09 (d)).
 */
export function tryBeginDrag(
  s: GameState,
  pieceId: PieceId,
  rules: DragRules = DEFAULT_DRAG_RULES,
): DragAttempt {
  if (!Number.isInteger(pieceId) || pieceId < 0 || pieceId >= s.lvl.layout.counts.pieces)
    return { ok: false, reason: 'notOnBoard' };
  const zone = pieceZone(s, pieceId);
  if (zone !== Zone.yard && zone !== Zone.site) return { ok: false, reason: 'notOnBoard' };
  if (zone === Zone.site && pieceSeg(s, pieceId) !== visibleSegment(s))
    return { ok: false, reason: 'hiddenSegment' };
  if ((pieceFlags(s, pieceId) & FLAG_BIT.locked) !== 0) return { ok: false, reason: 'locked' };
  if (hdr(s, H.movesLeft) <= 0) return { ok: false, reason: 'noMoves' };
  if (rules.canPick && !rules.canPick(s, pieceId)) return { ok: false, reason: 'rule' };
  const session = new Session(s, pieceId, rules);
  if (!session.movable) return { ok: false, reason: 'immovable' };
  return { ok: true, session };
}

/** `beginDrag(state, pieceId): DragSession | null` (TECH §4.1); null = not pickable (K-09). */
export function beginDrag(
  s: GameState,
  pieceId: PieceId,
  rules: DragRules = DEFAULT_DRAG_RULES,
): DragSession | null {
  const attempt = tryBeginDrag(s, pieceId, rules);
  return attempt.ok ? attempt.session : null;
}

/** K-09: the piece can be picked now. */
export function canPickPiece(s: GameState, pieceId: PieceId, rules: DragRules = DEFAULT_DRAG_RULES): boolean {
  return tryBeginDrag(s, pieceId, rules).ok;
}

/** Board cells of a block with `shape` anchored at `(ix, iy)`. */
export function blockCells(shape: ShapeDef, ix: number, iy: number): BoardCell[] {
  return shape.cells.map((c) => ({ x: ix + c.x, y: iy + c.y }));
}

class Session implements DragSession {
  readonly pieceId: PieceId;
  readonly shape: ShapeDef;
  readonly start: DragNode;
  readonly startNodes: readonly DragNode[];
  reachableCount = 0;
  canCrossWall = false;
  canEnterRail = false;
  /** K-09 (a). */
  movable = false;

  private readonly w: number;
  private readonly h: number;
  /** Exclusive bound of `ix + w` (heavy pieces stay over the yard, Y5). */
  private readonly maxX: number;
  private readonly rows: readonly number[];
  private readonly colRows: readonly number[];
  private readonly colBottom: readonly number[];
  private readonly masks: Uint8Array;
  private readonly colTop: Int8Array;
  private readonly openFree: number;
  /** Per gap: rows of the gap when passable, else 0 (`openRail[g]`, TECH §2.2). */
  private readonly railOpen: number[] = [];
  /** Per gap: K-12 alignment `gapLo ≤ iy` and `iy + h ≤ gapHi`. */
  private readonly gapLo: number[] = [];
  private readonly gapHi: number[] = [];
  private readonly tooTall: boolean;
  private readonly siteClosed: boolean;
  private readonly startCodes: number[];
  private readonly startAnchor: number;
  private readonly railDrops: DropClass[] = [];

  /** Per node code: UNKNOWN / VALID / INVALID (node validity cache). */
  private readonly validity: Int16Array;
  private readonly distStart: Int16Array;
  private readonly distCur: Int16Array;
  private readonly parentCur: Int16Array;
  /** R in BFS order (`reachableCount` entries). */
  private readonly reach: Int16Array;
  private readonly nodeCache: (DragNode | undefined)[] = [];
  private queue: Int16Array = sharedQueue;
  private head = 0;
  private tail = 0;

  private cur: number;
  private stay: FollowResult;
  private crossedEmitted = false;
  private railEmitted = false;
  private blockedEmitted = false;

  constructor(s: GameState, pieceId: PieceId, rules: DragRules) {
    const { lvl } = s;
    this.pieceId = pieceId;
    this.shape = shapeByIndex(pieceShape(s, pieceId));
    this.w = this.shape.w;
    this.h = this.shape.h;
    this.maxX = this.shape.heavy ? YARD_COLS : GRID_COLS;
    this.rows = this.shape.rows;
    this.colRows = this.shape.colRows;
    this.colBottom = this.shape.colBottom;
    this.masks = collisionMasks(s, pieceId);
    this.colTop = siteColumnTops(s, pieceId);
    this.openFree = openFreeMask(lvl.wallHeight);
    this.tooTall = this.h > GRID_ROWS - lvl.wallHeight;
    this.siteClosed = (rules.siteClosed ?? isSiteClosed)(s);
    for (let g = 0; g < lvl.gaps.length; g++) {
      const gap = lvl.gaps[g];
      const y = gapField(s, g, GF.y);
      const size = gap?.size ?? 0;
      const passable = rules.canPassGap ? rules.canPassGap(s, g, pieceId) : gapField(s, g, GF.open) !== 0;
      this.railOpen.push(passable ? rowRangeMask(y, size) : 0);
      this.gapLo.push(y);
      this.gapHi.push(y + size);
      this.railDrops.push(Object.freeze({ kind: 'siteRail', row: 7, gap: g }));
    }
    const space = (1 + lvl.gaps.length) * NODES_PER_MODE;
    // one allocation for every per-session array (pre-allocated at pick time, nothing allocated per BFS)
    const arena = new Int16Array(5 * space);
    this.validity = arena.subarray(0, space);
    this.distStart = arena.subarray(space, 2 * space);
    this.distCur = arena.subarray(2 * space, 3 * space);
    this.parentCur = arena.subarray(3 * space, 4 * space);
    this.reach = arena.subarray(4 * space, 5 * space);

    // start nodes (TECH §4.1/3): FREE(anchor); debris also RAIL(g) when its rows are inside an open gap
    const zone = pieceZone(s, pieceId);
    const ix = pieceX(s, pieceId);
    const iy = pieceY(s, pieceId) + (zone === Zone.site ? hdr(s, H.elev) : 0);
    this.startAnchor = iy * GRID_COLS + ix;
    this.startCodes = [this.startAnchor];
    if (zone === Zone.site && (pieceFlags(s, pieceId) & FLAG_BIT.debris) !== 0) {
      for (let g = 0; g < this.railOpen.length; g++) {
        if (this.validRail(g, ix, iy)) this.startCodes.push((1 + g) * NODES_PER_MODE + this.startAnchor);
      }
    }
    this.startNodes = Object.freeze(this.startCodes.map((c) => this.node(c)));
    this.start = this.node(this.startAnchor);
    // The block may always return to its start cells (K-07 row 1), even when its FREE start breaks open sky (a site
    // block under a stuck mortar block): every edge stays two-way, so all of R is reachable from any current node.
    this.validity[this.startAnchor] = VALID;

    // one BFS: from the FREE start node the start equivalence makes it the multi-source BFS of all start nodes, so
    // its distances and parents also serve the first current node (= the FREE start)
    this.bfs(this.startAnchor, this.distStart, this.parentCur, true);
    this.distCur.set(this.distStart);
    for (let i = 0; i < this.reachableCount; i++) {
      if ((this.reach[i] ?? 0) % NODES_PER_MODE !== this.startAnchor) {
        this.movable = true;
        break;
      }
    }
    this.cur = this.startAnchor;
    this.stay = this.stayResult();
  }

  get current(): DragNode {
    return this.node(this.cur);
  }

  isReachable(node: DragNode): boolean {
    const code = this.codeOf(node);
    return code >= 0 && (this.distStart[code] ?? -1) >= 0;
  }

  distanceFromStart(node: DragNode): number {
    const code = this.codeOf(node);
    return code < 0 ? -1 : (this.distStart[code] ?? -1);
  }

  distanceFromCurrent(node: DragNode): number {
    const code = this.codeOf(node);
    return code < 0 ? -1 : (this.distCur[code] ?? -1);
  }

  reachableNodes(): DragNode[] {
    const codes = Array.from(this.reach.subarray(0, this.reachableCount)).sort((a, b) => a - b);
    return codes.map((c) => this.node(c));
  }

  neighbours(node: DragNode): DragNode[] {
    const code = this.codeOf(node);
    if (code < 0) return [];
    const n = this.neighbourCodes(code, NEIGHBOURS);
    const out: DragNode[] = [];
    for (let i = 0; i < n; i++) out.push(this.node(NEIGHBOURS[i] ?? 0));
    return out;
  }

  nearest(px: number, py: number): DragNode {
    return this.node(this.nearestCode(px, py));
  }

  follow(px: number, py: number): FollowResult {
    const best = this.nearestCode(px, py);
    let result = this.stay;
    if (
      best !== this.cur &&
      this.d2(best, px, py) - (this.d2(this.cur, px, py) - HYSTERESIS_D2) <= D2_EPSILON
    )
      result = this.advance(best);
    if (!this.blockedEmitted && this.isBlockedByWallHeight(px, py)) {
      this.blockedEmitted = true;
      result = Object.freeze({ ...result, blockedByWallHeight: true });
    }
    return result;
  }

  pathTo(node: DragNode): DragNode[] | null {
    const code = this.codeOf(node);
    if (code < 0 || (this.distCur[code] ?? -1) < 0) return null;
    return this.pathCodes(code).map((c) => this.node(c));
  }

  moveTo(node: DragNode): FollowResult {
    const code = this.codeOf(node);
    if (code < 0 || (this.distStart[code] ?? -1) < 0)
      throw new RangeError(`moveTo: node (${node.ix},${node.iy},${node.mode}) is not reachable`);
    return code === this.cur ? this.stay : this.advance(code);
  }

  classify(node: DragNode = this.current): DropClass {
    const code = this.codeOf(node);
    if (code < 0 || (this.distStart[code] ?? -1) < 0) return DROP_INVALID;
    // row 1: start cells in one of the start modes (debris: either start node, TECH §4.1/3)
    if (this.startCodes.includes(code)) return DROP_SAME_SPOT;
    const right = node.ix + this.w - 1;
    if (node.mode === FREE && right <= BOUNDARY_X) {
      // rows 2 / 3: over the yard; any cell in the crane area cancels (K-05)
      return node.iy + this.h - 1 < BOARD_ROWS ? DROP_YARD : DROP_CRANE_OVER_YARD;
    }
    if (node.ix <= BOUNDARY_X) return DROP_STRADDLE; // row 4 (E-06, E-28)
    if (this.siteClosed) return DROP_SITE_CLOSED; // row 5 (E-27)
    if (node.mode === FREE) return DROP_SITE_FREE; // row 6: falls (K-11)
    return this.railDrops[node.mode - 1] ?? DROP_INVALID; // row 7: stays on the rail (K-12)
  }

  cells(node: DragNode): BoardCell[] {
    return blockCells(this.shape, node.ix, node.iy);
  }

  // --- internals -------------------------------------------------------------------------------------------------

  /** Code of a node, −1 when it is outside the node space of this level. */
  private codeOf(node: DragNode): number {
    const { ix, iy, mode } = node;
    if (!Number.isInteger(ix) || !Number.isInteger(iy) || !Number.isInteger(mode)) return -1;
    if (ix < 0 || ix >= GRID_COLS || iy < 0 || iy >= GRID_ROWS || mode < 0 || mode > this.railOpen.length)
      return -1;
    return mode * NODES_PER_MODE + iy * GRID_COLS + ix;
  }

  private node(code: number): DragNode {
    let n = this.nodeCache[code];
    if (!n) {
      const mode = Math.floor(code / NODES_PER_MODE);
      const rest = code - mode * NODES_PER_MODE;
      n = Object.freeze({ ix: rest % GRID_COLS, iy: Math.floor(rest / GRID_COLS), mode });
      this.nodeCache[code] = n;
    }
    return n;
  }

  private d2(code: number, px: number, py: number): number {
    const rest = code % NODES_PER_MODE;
    const dx = (rest % GRID_COLS) - px;
    const dy = Math.floor(rest / GRID_COLS) - py;
    return dx * dx + dy * dy;
  }

  /**
   * K-08: the node of R with the smallest squared distance to p; ties (within D2_EPSILON) go to (1) fewer BFS steps
   * from the current node, (2) FREE before RAIL, (3) smaller y, (4) smaller x — (2)–(4) are the node code order.
   */
  private nearestCode(px: number, py: number): number {
    let best = this.cur;
    let bestD = this.d2(best, px, py);
    let bestDist = 0;
    for (let i = 0; i < this.reachableCount; i++) {
      const code = this.reach[i] ?? 0;
      const d = this.d2(code, px, py);
      if (d > bestD + D2_EPSILON) continue;
      const dist = this.distCur[code] ?? 0;
      if (d < bestD - D2_EPSILON || dist < bestDist || (dist === bestDist && code < best)) {
        best = code;
        bestD = d;
        bestDist = dist;
      }
    }
    return best;
  }

  /**
   * K-05 `blockedByWallHeight` (TECH §4.4): the block is too tall for the wall (`h > 10 − height`, so no FREE node of
   * it is fully on the site), the target box centre is past the boundary and the box reaches the crane rows, but the
   * current FREE node has not crossed (fully in the yard, or straddling with its top over the wall: S4_0 / Z4_0).
   */
  private isBlockedByWallHeight(px: number, py: number): boolean {
    if (!this.tooTall || this.cur >= NODES_PER_MODE) return false;
    return this.cur % GRID_COLS < SITE_X && px + this.w / 2 > SITE_X && py + this.h > CRANE_ROW;
  }

  private advance(target: number): FollowResult {
    const codes = this.pathCodes(target);
    let crossed = false;
    let entered = false;
    let prev = this.cur;
    for (const next of codes) {
      if (prev < NODES_PER_MODE && next !== prev) {
        const horizontal = next % NODES_PER_MODE !== prev % NODES_PER_MODE && (next - prev) % GRID_COLS !== 0;
        if (
          horizontal &&
          next < NODES_PER_MODE &&
          this.stepCrossesBoundary(prev % GRID_COLS, next > prev ? 1 : -1)
        )
          crossed = true;
        if (horizontal && next >= NODES_PER_MODE) entered = true;
      }
      prev = next;
    }
    const crossedWall = crossed && !this.crossedEmitted;
    const enteredRail = entered && !this.railEmitted;
    if (crossedWall) this.crossedEmitted = true;
    if (enteredRail) this.railEmitted = true;
    this.cur = target;
    this.bfs(target, this.distCur, this.parentCur, false);
    this.stay = this.stayResult();
    return Object.freeze({
      node: this.node(target),
      changed: true,
      path: Object.freeze(codes.map((c) => this.node(c))),
      crossedWall,
      enteredRail,
      blockedByWallHeight: false,
    });
  }

  private stayResult(): FollowResult {
    return Object.freeze({
      node: this.node(this.cur),
      changed: false,
      path: Object.freeze([]),
      crossedWall: false,
      enteredRail: false,
      blockedByWallHeight: false,
    });
  }

  /** Codes from the current node (excluded) to `target` (included), following the BFS parents. */
  private pathCodes(target: number): number[] {
    const out: number[] = [];
    let c = target;
    while (c !== this.cur && c >= 0) {
      out.push(c);
      c = this.parentCur[c] ?? -1;
    }
    return out.reverse();
  }

  /**
   * BFS from `source`. Start nodes are one physical position (same cells, TECH §4.1/3): reaching one of them reaches
   * all of them at the same distance (no extra step), so R is the multi-source BFS of the start nodes.
   */
  private bfs(source: number, dist: Int16Array, parent: Int16Array | null, collect: boolean): void {
    dist.fill(-1);
    if (parent) parent.fill(-1);
    if (sharedQueue.length < dist.length) sharedQueue = new Int16Array(dist.length);
    this.queue = sharedQueue;
    this.head = 0;
    this.tail = 0;
    if (collect) this.reachableCount = 0;
    this.push(source, 0, -1, dist, parent);
    const nbr = NEIGHBOURS;
    while (this.head < this.tail) {
      const u = this.queue[this.head++] ?? 0;
      const du = dist[u] ?? 0;
      if (collect) this.reach[this.reachableCount++] = u;
      const n = this.neighbourCodes(u, nbr);
      for (let i = 0; i < n; i++) {
        const v = nbr[i] ?? 0;
        if (collect) this.noteEdge(u, v);
        if ((dist[v] ?? 0) < 0) this.push(v, du + 1, u, dist, parent);
      }
    }
  }

  private push(code: number, d: number, from: number, dist: Int16Array, parent: Int16Array | null): void {
    dist[code] = d;
    if (parent) parent[code] = from;
    this.queue[this.tail++] = code;
    if (this.startCodes.length > 1 && this.startCodes.includes(code)) {
      for (const other of this.startCodes) {
        if ((dist[other] ?? 0) >= 0) continue;
        dist[other] = d;
        if (parent) parent[other] = code;
        this.queue[this.tail++] = other;
      }
    }
  }

  /** Tutorial guarantees (TECH §8.2): `overWall` = a FREE → FREE boundary step, `gapPass` = a FREE → RAIL step. */
  private noteEdge(u: number, v: number): void {
    if (u >= NODES_PER_MODE) return;
    if (v >= NODES_PER_MODE) {
      this.canEnterRail = true;
      return;
    }
    if (v - u === 1 || u - v === 1) {
      if (this.stepCrossesBoundary(u % GRID_COLS, v > u ? 1 : -1)) this.canCrossWall = true;
    }
  }

  /** Writes the neighbour codes of `code` into `out` (left, right, down, up); returns their number. */
  private neighbourCodes(code: number, out: Int16Array): number {
    const mode = Math.floor(code / NODES_PER_MODE);
    const rest = code - mode * NODES_PER_MODE;
    const ix = rest % GRID_COLS;
    const iy = (rest - ix) / GRID_COLS;
    let n = 0;
    if (mode === FREE) {
      if (this.validFree(ix - 1, iy) && this.crossOk(ix, iy, -1, this.openFree)) out[n++] = code - 1;
      if (this.validFree(ix + 1, iy) && this.crossOk(ix, iy, 1, this.openFree)) out[n++] = code + 1;
      if (ix + this.w - 1 <= BOUNDARY_X) {
        // K-12: a rail is entered only from a node fully in the yard, by a step to the right
        for (let g = 0; g < this.railOpen.length; g++) {
          if (this.validRail(g, ix + 1, iy) && this.crossOk(ix, iy, 1, this.railOpen[g] ?? 0))
            out[n++] = (1 + g) * NODES_PER_MODE + rest + 1;
        }
      }
      if (this.validFree(ix, iy - 1)) out[n++] = code - GRID_COLS;
      if (this.validFree(ix, iy + 1)) out[n++] = code + GRID_COLS;
      return n;
    }
    const g = mode - 1;
    const open = this.railOpen[g] ?? 0;
    if (ix - 1 + this.w - 1 <= BOUNDARY_X) {
      // leaving the rail to the left, fully into the yard: back to FREE
      if (this.validFree(ix - 1, iy) && this.crossOk(ix, iy, -1, open)) out[n++] = rest - 1;
    } else if (this.validRail(g, ix - 1, iy) && this.crossOk(ix, iy, -1, open)) {
      out[n++] = code - 1;
    }
    if (this.validRail(g, ix + 1, iy) && this.crossOk(ix, iy, 1, open)) out[n++] = code + 1;
    return n;
  }

  /** In a horizontal step from `ix` by `dx`, the block column that changes side (−1 when none). */
  private crossingColumn(ix: number, dx: number): number {
    const c = dx > 0 ? BOUNDARY_X - ix : BOUNDARY_X + 1 - ix;
    return c >= 0 && c < this.w ? c : -1;
  }

  private stepCrossesBoundary(ix: number, dx: number): boolean {
    return this.crossingColumn(ix, dx) >= 0;
  }

  /** TECH §2.2: every cell that changes side in this horizontal step does so in a row of the open mask. */
  private crossOk(ix: number, iy: number, dx: number, open: number): boolean {
    const c = this.crossingColumn(ix, dx);
    if (c < 0) return true;
    return boundaryAllows(((this.colRows[c] ?? 0) << iy) & ROW_MASK_ALL, open);
  }

  private inBounds(ix: number, iy: number): boolean {
    return ix >= 0 && iy >= 0 && ix + this.w <= this.maxX && iy + this.h <= GRID_ROWS;
  }

  private collides(ix: number, iy: number): boolean {
    for (let r = 0; r < this.h; r++) {
      if (((this.masks[iy + r] ?? 0) & ((this.rows[r] ?? 0) << ix)) !== 0) return true;
    }
    return false;
  }

  private validFree(ix: number, iy: number): boolean {
    if (!this.inBounds(ix, iy)) return false;
    const code = iy * GRID_COLS + ix;
    const known = this.validity[code] ?? UNKNOWN;
    if (known !== UNKNOWN) return known === VALID;
    const ok = this.computeFree(ix, iy);
    this.validity[code] = ok ? VALID : INVALID;
    return ok;
  }

  private computeFree(ix: number, iy: number): boolean {
    for (let r = 0; r < this.h; r++) {
      const bits = (this.rows[r] ?? 0) << ix;
      if (((this.masks[iy + r] ?? 0) & bits) !== 0) return false;
      // a row with block cells on both sides of the boundary must be open in FREE mode (TECH §2.2)
      if ((bits & YARD_BITS) !== 0 && (bits & SITE_BITS) !== 0 && ((this.openFree >> (iy + r)) & 1) === 0)
        return false;
    }
    // open sky (K-11, K-13): in every covered site column the lowest block cell is above every blocked cell
    for (let x = Math.max(ix, SITE_X); x < ix + this.w; x++) {
      const c = x - ix;
      if ((this.colTop[x - SITE_X] ?? -1) >= iy + (this.colBottom[c] ?? 0)) return false;
    }
    return true;
  }

  private validRail(g: number, ix: number, iy: number): boolean {
    if ((this.railOpen[g] ?? 0) === 0 || !this.inBounds(ix, iy)) return false;
    if (ix + this.w - 1 < SITE_X) return false;
    if (iy < (this.gapLo[g] ?? 0) || iy + this.h > (this.gapHi[g] ?? 0)) return false;
    const code = (1 + g) * NODES_PER_MODE + iy * GRID_COLS + ix;
    const known = this.validity[code] ?? UNKNOWN;
    if (known !== UNKNOWN) return known === VALID;
    const ok = !this.collides(ix, iy);
    this.validity[code] = ok ? VALID : INVALID;
    return ok;
  }
}
