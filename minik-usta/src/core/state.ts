/**
 * Mutable game state: ONE Int32Array buffer + the shared, frozen CompiledLevel (TECH_DESIGN §2.4, D-052).
 * Copying a state is `buf.slice()` (≈ 2–4 KB); the RNG state lives in the buffer, so a snapshot replays the same
 * future. Hot code uses the small accessors below; UI/debug code uses `readPiece`.
 *
 * Coordinates: yard pieces store the GLOBAL anchor (x 0–5, y 0–7). Site pieces store x as the global column (6–7) and
 * y as the segment-local plan row `sy` (board row = sy + elev, K-24), so they move with the elevator frame.
 */
import { COLOR_CODES, PIECE_FLAGS, Zone } from './types.ts';
import type { ColorCode, PieceFlag, PieceId, ShapeId, ZoneName } from './types.ts';
import { GRID_ROWS, SEGMENT_CELLS, SITE_COLS, SITE_X, YARD_COLS } from './coords.ts';
import { shapeByIndex } from './shapes.ts';
import type { CompiledLevel } from './level/compile.ts';

/** Header fields (18). */
export const H = {
  /** Completed moves (GDD `m`). */
  turn: 0,
  movesLeft: 1,
  /** Usta Serisi (K-33). */
  combo: 2,
  /** Golden Trowels available (K-33). */
  trowels: 3,
  /** Active segment (segments mode, K-22). */
  activeSeg: 4,
  /** Front segment (carousel, K-23). */
  frontSeg: 5,
  /** Carousel counter `t` (K-23). */
  carouselT: 6,
  /** Elevator offset `e` (K-24); 0 without elevator. */
  elev: 7,
  /** Elevator direction ±1; 0 without elevator. */
  elevDir: 8,
  /** Completed segments; truck batches with forSegment ≤ deliveryCursor have been queued (K-22, K-23, K-25). */
  deliveryCursor: 9,
  queueLen: 10,
  /** mulberry32 state (core/rng.ts `bufferRng`). */
  rng: 11,
  /** K-40: W4/W7 are open while `turn < openShutterUntil`. */
  openShutterUntil: 12,
  wrongCount: 13,
  overWallCount: 14,
  railCount: 15,
  /** STATE_FLAG bits. */
  flags: 16,
  reserved: 17,
} as const;
export const HEADER_SIZE = 18;

export const STATE_FLAG = { won: 1, lost: 2, deadlocked: 4 } as const;

/** Piece record fields (stride 9). */
export const PF = {
  shape: 0,
  color: 1,
  zone: 2,
  x: 3,
  y: 4,
  seg: 5,
  flags: 6,
  counter: 7,
  arrivedTurn: 8,
} as const;
export const PIECE_STRIDE = 9;

/** Gap record fields (stride 3). `phase` holds the shutter phase, or the slider direction (±1). */
export const GF = { open: 0, y: 1, phase: 2 } as const;
export const GAP_STRIDE = 3;

/** Obstacle record fields (stride 2): crate hp / bag alive (1, 0) / hidden item present (1, 0). */
export const OF = { hp: 0, aux: 1 } as const;
export const OBSTACLE_STRIDE = 2;

/** Piece flag bits (state `flags` field), in PIECE_FLAGS order. */
export const FLAG_BIT: Readonly<Record<PieceFlag, number>> = Object.freeze(
  Object.fromEntries(PIECE_FLAGS.map((f, i) => [f, 1 << i])) as Record<PieceFlag, number>,
);

/** Site cell value of a Golden Trowel fill (K-33). */
export const SITE_TROWEL = -1;

export interface StateCounts {
  /** Segments S. */
  readonly segments: number;
  /** Piece slots P (static pieces + D2 help slots). */
  readonly pieces: number;
  readonly gaps: number;
  readonly obstacles: number;
  /** Screws and keys (subset of obstacles). */
  readonly hidden: number;
  readonly goals: number;
}

/** Offsets of every section in the buffer (TECH §2.4 table). */
export interface StateLayout {
  readonly size: number;
  readonly counts: StateCounts;
  /** 6 × 10: 0 empty · pieceId + 1 · −(obstacleIndex + 1) (crate, bag). Index `y * 6 + x`. */
  readonly yardOcc: number;
  /** S × 16 local 2 × 8: 0 · pieceId + 1 (debris included) · −1 trowel cell. Index `seg * 16 + sy * 2 + sx`. */
  readonly siteOcc: number;
  /** S × 2: per segment and column, bit mask of correctly filled plan rows (K-34). */
  readonly filled: number;
  /** S × 2: per segment and column, plan rows holding debris or a stuck mortar block (K-34 `dotFree`, E-43). */
  readonly wrongOcc: number;
  readonly pieces: number;
  readonly gaps: number;
  readonly obstacles: number;
  readonly hidden: number;
  readonly goals: number;
  /** Q = P slots: queued piece ids in FIFO order (K-26). */
  readonly queue: number;
  /** S: revealed `?` cells, 16-bit local mask per segment (K-32). */
  readonly revealed: number;
}

export const YARD_OCC_ROWS = GRID_ROWS;

export function computeLayout(counts: StateCounts): StateLayout {
  let at = HEADER_SIZE;
  const take = (n: number): number => {
    const start = at;
    at += n;
    return start;
  };
  const yardOcc = take(YARD_COLS * YARD_OCC_ROWS);
  const siteOcc = take(counts.segments * SEGMENT_CELLS);
  const filled = take(counts.segments * SITE_COLS);
  const wrongOcc = take(counts.segments * SITE_COLS);
  const pieces = take(counts.pieces * PIECE_STRIDE);
  const gaps = take(counts.gaps * GAP_STRIDE);
  const obstacles = take(counts.obstacles * OBSTACLE_STRIDE);
  const hidden = take(counts.hidden);
  const goals = take(Math.max(3, counts.goals));
  const queue = take(counts.pieces);
  const revealed = take(counts.segments);
  return Object.freeze({
    size: at,
    counts: Object.freeze({ ...counts }),
    yardOcc,
    siteOcc,
    filled,
    wrongOcc,
    pieces,
    gaps,
    obstacles,
    hidden,
    goals,
    queue,
    revealed,
  });
}

export interface GameState {
  /** Shared, never copied. */
  readonly lvl: CompiledLevel;
  /** Every mutable field; layout in `lvl.layout`. */
  buf: Int32Array;
}

// --- header ------------------------------------------------------------------------------------------------------

export function hdr(s: GameState, field: number): number {
  return s.buf[field] ?? 0;
}
export function setHdr(s: GameState, field: number, value: number): void {
  s.buf[field] = value;
}

// --- pieces ------------------------------------------------------------------------------------------------------

export function pieceBase(s: GameState, id: PieceId): number {
  return s.lvl.layout.pieces + id * PIECE_STRIDE;
}
export function pieceField(s: GameState, id: PieceId, field: number): number {
  return s.buf[s.lvl.layout.pieces + id * PIECE_STRIDE + field] ?? 0;
}
export function setPieceField(s: GameState, id: PieceId, field: number, value: number): void {
  s.buf[s.lvl.layout.pieces + id * PIECE_STRIDE + field] = value;
}
export const pieceShape = (s: GameState, id: PieceId): number => pieceField(s, id, PF.shape);
export const pieceColor = (s: GameState, id: PieceId): number => pieceField(s, id, PF.color);
export const pieceZone = (s: GameState, id: PieceId): number => pieceField(s, id, PF.zone);
export const pieceX = (s: GameState, id: PieceId): number => pieceField(s, id, PF.x);
export const pieceY = (s: GameState, id: PieceId): number => pieceField(s, id, PF.y);
export const pieceSeg = (s: GameState, id: PieceId): number => pieceField(s, id, PF.seg);
export const pieceFlags = (s: GameState, id: PieceId): number => pieceField(s, id, PF.flags);
export const setPieceX = (s: GameState, id: PieceId, v: number): void => setPieceField(s, id, PF.x, v);
export const setPieceY = (s: GameState, id: PieceId, v: number): void => setPieceField(s, id, PF.y, v);
export const setPieceZone = (s: GameState, id: PieceId, v: number): void => setPieceField(s, id, PF.zone, v);

export function hasFlag(s: GameState, id: PieceId, flag: PieceFlag): boolean {
  return (pieceFlags(s, id) & FLAG_BIT[flag]) !== 0;
}
export function setFlag(s: GameState, id: PieceId, flag: PieceFlag, on: boolean): void {
  const f = pieceFlags(s, id);
  setPieceField(s, id, PF.flags, on ? f | FLAG_BIT[flag] : f & ~FLAG_BIT[flag]);
}
export function flagsToBits(flags: readonly PieceFlag[]): number {
  return flags.reduce((m, f) => m | FLAG_BIT[f], 0);
}
export function bitsToFlags(bits: number): PieceFlag[] {
  return PIECE_FLAGS.filter((f) => (bits & FLAG_BIT[f]) !== 0);
}

/** Read-only piece view for UI/debug (allocates; not for hot paths, TECH §2.5). */
export interface PieceView {
  readonly id: PieceId;
  readonly shape: ShapeId;
  readonly color: ColorCode;
  readonly zone: ZoneName;
  /** Yard: global anchor. Site: global column (6–7) and segment-local plan row. */
  readonly x: number;
  readonly y: number;
  readonly seg: number;
  readonly flags: readonly PieceFlag[];
  readonly wetLeft: number;
  readonly locked: boolean;
  readonly debris: boolean;
  readonly stuck: boolean;
  readonly arrivedTurn: number;
}

const ZONE_NAMES = Object.keys(Zone) as ZoneName[];

export function readPiece(s: GameState, id: PieceId): PieceView {
  const flags = pieceFlags(s, id);
  return {
    id,
    shape: shapeByIndex(pieceShape(s, id)).id,
    color: COLOR_CODES[pieceColor(s, id)] ?? 'W',
    zone: ZONE_NAMES[pieceZone(s, id)] ?? 'gone',
    x: pieceX(s, id),
    y: pieceY(s, id),
    seg: pieceSeg(s, id),
    flags: bitsToFlags(flags),
    wetLeft: pieceField(s, id, PF.counter),
    locked: (flags & FLAG_BIT.locked) !== 0,
    debris: (flags & FLAG_BIT.debris) !== 0,
    stuck: (flags & FLAG_BIT.stuck) !== 0,
    arrivedTurn: pieceField(s, id, PF.arrivedTurn),
  };
}

// --- occupancy ---------------------------------------------------------------------------------------------------

/** Yard cell (x 0–5, y 0–9): 0 empty · pieceId + 1 · −(obstacleIndex + 1). */
export function yardOcc(s: GameState, x: number, y: number): number {
  return s.buf[s.lvl.layout.yardOcc + y * YARD_COLS + x] ?? 0;
}
export function setYardOcc(s: GameState, x: number, y: number, v: number): void {
  s.buf[s.lvl.layout.yardOcc + y * YARD_COLS + x] = v;
}
/** Site cell of a segment (local sx 0–1, sy 0–7): 0 · pieceId + 1 · SITE_TROWEL. */
export function siteOcc(s: GameState, seg: number, sx: number, sy: number): number {
  return s.buf[s.lvl.layout.siteOcc + seg * SEGMENT_CELLS + sy * SITE_COLS + sx] ?? 0;
}
export function setSiteOcc(s: GameState, seg: number, sx: number, sy: number, v: number): void {
  s.buf[s.lvl.layout.siteOcc + seg * SEGMENT_CELLS + sy * SITE_COLS + sx] = v;
}
export function filledMask(s: GameState, seg: number, sx: number): number {
  return s.buf[s.lvl.layout.filled + seg * SITE_COLS + sx] ?? 0;
}
export function setFilledMask(s: GameState, seg: number, sx: number, v: number): void {
  s.buf[s.lvl.layout.filled + seg * SITE_COLS + sx] = v;
}
export function wrongOccMask(s: GameState, seg: number, sx: number): number {
  return s.buf[s.lvl.layout.wrongOcc + seg * SITE_COLS + sx] ?? 0;
}
export function setWrongOccMask(s: GameState, seg: number, sx: number, v: number): void {
  s.buf[s.lvl.layout.wrongOcc + seg * SITE_COLS + sx] = v;
}

// --- gaps, obstacles, hidden items, goals, queue -------------------------------------------------------------------

export function gapField(s: GameState, gap: number, field: number): number {
  return s.buf[s.lvl.layout.gaps + gap * GAP_STRIDE + field] ?? 0;
}
export function setGapField(s: GameState, gap: number, field: number, v: number): void {
  s.buf[s.lvl.layout.gaps + gap * GAP_STRIDE + field] = v;
}
export function obstacleField(s: GameState, obstacle: number, field: number): number {
  return s.buf[s.lvl.layout.obstacles + obstacle * OBSTACLE_STRIDE + field] ?? 0;
}
export function setObstacleField(s: GameState, obstacle: number, field: number, v: number): void {
  s.buf[s.lvl.layout.obstacles + obstacle * OBSTACLE_STRIDE + field] = v;
}
export function hiddenCollected(s: GameState, hiddenIndex: number): boolean {
  return (s.buf[s.lvl.layout.hidden + hiddenIndex] ?? 0) !== 0;
}
export function setHiddenCollected(s: GameState, hiddenIndex: number, collected: boolean): void {
  s.buf[s.lvl.layout.hidden + hiddenIndex] = collected ? 1 : 0;
}
export function goalValue(s: GameState, goal: number): number {
  return s.buf[s.lvl.layout.goals + goal] ?? 0;
}
export function setGoalValue(s: GameState, goal: number, v: number): void {
  s.buf[s.lvl.layout.goals + goal] = v;
}
export function revealedMask(s: GameState, seg: number): number {
  return s.buf[s.lvl.layout.revealed + seg] ?? 0;
}
export function setRevealedMask(s: GameState, seg: number, v: number): void {
  s.buf[s.lvl.layout.revealed + seg] = v;
}
/** Queued piece ids, oldest first (K-26). Allocates. */
export function queueIds(s: GameState): PieceId[] {
  const n = hdr(s, H.queueLen);
  const out: PieceId[] = [];
  for (let i = 0; i < n; i++) out.push(s.buf[s.lvl.layout.queue + i] ?? 0);
  return out;
}
/** Appends to the end of the truck queue (K-17 step 3, K-25, K-26) and sets the piece zone to `queue`. */
export function enqueuePiece(s: GameState, id: PieceId): void {
  const n = hdr(s, H.queueLen);
  s.buf[s.lvl.layout.queue + n] = id;
  setHdr(s, H.queueLen, n + 1);
  setPieceZone(s, id, Zone.queue);
}
/** Removes the queue entry at `index`, keeping the order of the others (FIFO, K-26). */
export function removeQueueAt(s: GameState, index: number): PieceId {
  const n = hdr(s, H.queueLen);
  const base = s.lvl.layout.queue;
  const id = s.buf[base + index] ?? -1;
  for (let i = index; i < n - 1; i++) s.buf[base + i] = s.buf[base + i + 1] ?? 0;
  s.buf[base + n - 1] = 0;
  setHdr(s, H.queueLen, n - 1);
  return id;
}

// --- creation, copy, encoding ---------------------------------------------------------------------------------------

/** Plan rows of segment `seg`, column `sx`, that belong to the plan area (colour, `?` or `.`). */
export function planAreaMask(lvl: CompiledLevel, seg: number, sx: number): number {
  const sg = lvl.segments[seg];
  return sg ? (sg.planMask[sx] ?? 0) | (sg.dotMask[sx] ?? 0) : 0;
}

/** The level's start state (K-25 batch 0 in the yard, debris on its segment, timers at their start values). */
export function createInitialState(lvl: CompiledLevel): GameState {
  const s: GameState = { lvl, buf: new Int32Array(lvl.layout.size) };
  setHdr(s, H.movesLeft, lvl.moves);
  setHdr(s, H.rng, lvl.seed | 0);
  if (lvl.elevator) {
    setHdr(s, H.elev, lvl.elevator.start);
    setHdr(s, H.elevDir, lvl.elevator.dir);
  }
  for (const p of lvl.pieces) {
    setPieceField(s, p.id, PF.shape, p.shapeIndex);
    setPieceField(s, p.id, PF.color, p.colorIndex);
    setPieceField(s, p.id, PF.zone, p.startZone);
    setPieceField(s, p.id, PF.x, p.x);
    setPieceField(s, p.id, PF.y, p.y);
    setPieceField(s, p.id, PF.seg, p.segment);
    setPieceField(s, p.id, PF.flags, p.flags);
    setPieceField(s, p.id, PF.counter, p.wetMoves);
    setPieceField(s, p.id, PF.arrivedTurn, -1);
    const shape = shapeByIndex(p.shapeIndex);
    if (p.startZone === Zone.yard) {
      for (const c of shape.cells) setYardOcc(s, p.x + c.x, p.y + c.y, p.id + 1);
    } else if (p.startZone === Zone.site) {
      for (const c of shape.cells) {
        const sx = p.x - SITE_X + c.x;
        const sy = p.y + c.y;
        setSiteOcc(s, p.segment, sx, sy, p.id + 1);
        if ((planAreaMask(lvl, p.segment, sx) >> sy) & 1)
          setWrongOccMask(s, p.segment, sx, wrongOccMask(s, p.segment, sx) | (1 << sy));
      }
    }
  }
  lvl.obstacles.forEach((o, i) => {
    if (o.type === 'crate') {
      setObstacleField(s, i, OF.hp, o.hp);
      setYardOcc(s, o.x, o.y, -(i + 1));
    } else if (o.type === 'cement_bag') {
      setObstacleField(s, i, OF.hp, 1);
      setYardOcc(s, o.x, o.y, -(i + 1));
    } else {
      setObstacleField(s, i, OF.hp, 1);
    }
  });
  lvl.gaps.forEach((g, i) => {
    setGapField(s, i, GF.y, g.y);
    if (g.type === 'shutter') {
      setGapField(s, i, GF.phase, g.phase);
      setGapField(s, i, GF.open, Math.floor(g.phase / g.period) % 2 === 0 ? 1 : 0);
    } else if (g.type === 'slider') {
      setGapField(s, i, GF.phase, g.dir);
      setGapField(s, i, GF.open, 1);
    } else {
      setGapField(s, i, GF.open, g.type === 'locked' ? 0 : 1);
    }
  });
  return s;
}

/** Independent copy; changes never leak back (TECH §2.4). */
export function cloneState(s: GameState): GameState {
  return { lvl: s.lvl, buf: s.buf.slice() };
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Compact, URL-safe text form of the buffer (int32 words in platform byte order — little-endian on every supported
 * device — as base64url without padding). */
export function encodeState(s: GameState): string {
  const bytes = new Uint8Array(s.buf.buffer, s.buf.byteOffset, s.buf.byteLength);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    const left = bytes.length - i;
    out += B64[(n >> 18) & 63];
    out += B64[(n >> 12) & 63];
    if (left > 1) out += B64[(n >> 6) & 63];
    if (left > 2) out += B64[n & 63];
  }
  return out;
}

/** Inverse of `encodeState`; throws when the text does not fit the level's layout. */
export function decodeState(lvl: CompiledLevel, text: string): GameState {
  const byteLength = lvl.layout.size * 4;
  const bytes = new Uint8Array(byteLength);
  let bi = 0;
  for (let i = 0; i < text.length; i += 4) {
    const chunk = text.slice(i, i + 4);
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const ch = chunk[k];
      const v = ch === undefined ? 0 : B64.indexOf(ch);
      if (v < 0) throw new RangeError(`decodeState: bad character "${ch}"`);
      n = (n << 6) | v;
    }
    const produced = Math.max(0, chunk.length - 1);
    for (let k = 0; k < produced; k++) {
      if (bi >= byteLength) throw new RangeError('decodeState: text longer than the layout');
      bytes[bi++] = (n >> (16 - 8 * k)) & 255;
    }
  }
  if (bi !== byteLength) throw new RangeError(`decodeState: ${bi} bytes, layout needs ${byteLength}`);
  return { lvl, buf: new Int32Array(bytes.buffer) };
}
