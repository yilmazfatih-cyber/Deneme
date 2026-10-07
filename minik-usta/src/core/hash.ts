/**
 * State hash: Zobrist, 64 bit as two 32-bit lanes, computed on demand (TECH_DESIGN §2.6, D-052).
 *
 * h = ⨁ over pieces in yard/site/queue of K(class(p), position(p)) ⊕ ⨁ over hashed scalar fields of F(field, value)
 *
 * - class(p) = (canonical shape, colour, flags, counter) — NOT the piece id, so swapping two identical blocks gives
 *   the same hash (the solver never opens a symmetric state twice).
 * - position = yard anchor (y·8 + x), site (80 + seg·16 + sy·2 + sx) or queue slot (160 + index, FIFO order).
 * - K and F mix a fixed random table entry (splitmix32, constant seed → deterministic for golden tests) with the
 *   value through the bijective `fmix32`, so distinct values on one position never cancel. The class space
 *   (52 × 8 × 2⁸ × counter) is too large to tabulate, hence the mixing instead of a pure lookup.
 * - Hashed scalars: `turn mod L`, active/front segment, carousel t, elevator offset and direction, delivery cursor,
 *   "K-40 open shutter active", gap open/y/phase, obstacle hp/aux, hidden items, goal counters and the `filled`
 *   masks (Golden Trowel cells are not pieces). Pending (undelivered) and gone pieces are skipped; `wrongOcc`,
 *   counters such as movesLeft/combo and arrivedTurn are not hashed (§2.4, D-052).
 */
import { fmix32, splitmix32 } from './rng.ts';
import { Zone } from './types.ts';
import { SEGMENT_CELLS, SITE_COLS, SITE_X } from './coords.ts';
import { GAP_STRIDE, H, OBSTACLE_STRIDE, PF, PIECE_STRIDE } from './state.ts';
import type { GameState, StateLayout } from './state.ts';

/** Fixed seed of the table generator (changing it changes every golden hash). */
export const ZOBRIST_SEED = 0x5eed2b1d;

/** Yard positions occupy 0..79, site 80..159, queue from 160. */
export const POS_SITE = 80;
export const POS_QUEUE = 160;

export interface ZobristTables {
  /** Lane 0 / lane 1 position keys. */
  readonly pos0: Uint32Array;
  readonly pos1: Uint32Array;
  /** Lane 0 / lane 1 scalar field keys (index = HashField order, see `hashedFields`). */
  readonly field0: Uint32Array;
  readonly field1: Uint32Array;
  /** `L`: cycle length of the timed mechanics (§2.6); 1 without them. */
  readonly cycle: number;
}

/** Scalar buffer offsets that enter the hash (header fields are handled separately). */
export function hashedFieldOffsets(layout: StateLayout): number[] {
  const c = layout.counts;
  const out: number[] = [];
  for (let i = 0; i < c.gaps * GAP_STRIDE; i++) out.push(layout.gaps + i);
  for (let i = 0; i < c.obstacles * OBSTACLE_STRIDE; i++) out.push(layout.obstacles + i);
  for (let i = 0; i < c.hidden; i++) out.push(layout.hidden + i);
  for (let i = 0; i < 3; i++) out.push(layout.goals + i);
  for (let i = 0; i < c.segments * SITE_COLS; i++) out.push(layout.filled + i);
  return out;
}

/** Header terms: turn mod L, activeSeg, frontSeg, carouselT, elev, elevDir, deliveryCursor, shutterActive. */
const HEADER_TERMS = 8;

export function buildZobrist(layout: StateLayout, cycle: number): ZobristTables {
  const next = splitmix32(ZOBRIST_SEED);
  const positions = POS_QUEUE + layout.counts.pieces;
  const fields = HEADER_TERMS + hashedFieldOffsets(layout).length;
  const fill = (n: number): Uint32Array => {
    const a = new Uint32Array(n);
    for (let i = 0; i < n; i++) a[i] = next();
    return a;
  };
  const pos0 = fill(positions);
  const pos1 = fill(positions);
  const field0 = fill(fields);
  const field1 = fill(fields);
  return Object.freeze({ pos0, pos1, field0, field1, cycle: Math.max(1, cycle) });
}

const MUL0 = 0x9e3779b1;
const MUL1 = 0x85ebca77;

/** Packs the piece class into one int: canonical shape (6 bits) | colour (3) | flags (8) | counter (8). */
function pieceClass(buf: Int32Array, base: number): number {
  return (
    ((buf[base + PF.shape] ?? 0) & 63) |
    (((buf[base + PF.color] ?? 0) & 7) << 6) |
    (((buf[base + PF.flags] ?? 0) & 255) << 9) |
    (((buf[base + PF.counter] ?? 0) & 255) << 17)
  );
}

/**
 * Writes the 64-bit hash into `out` ([lane0, lane1]) and returns it. Pass `out` to avoid a typed-array allocation.
 */
export function hashState(s: GameState, out: Uint32Array = new Uint32Array(2)): Uint32Array {
  const { buf, lvl } = s;
  const z = lvl.zobrist;
  const layout = lvl.layout;
  let h0 = 0;
  let h1 = 0;
  const mixField = (index: number, value: number): void => {
    h0 ^= fmix32(Math.imul(value, MUL0) ^ (z.field0[index] ?? 0));
    h1 ^= fmix32(Math.imul(value, MUL1) ^ (z.field1[index] ?? 0));
  };
  const turn = buf[H.turn] ?? 0;
  mixField(0, turn % z.cycle);
  mixField(1, buf[H.activeSeg] ?? 0);
  mixField(2, buf[H.frontSeg] ?? 0);
  mixField(3, buf[H.carouselT] ?? 0);
  mixField(4, buf[H.elev] ?? 0);
  mixField(5, buf[H.elevDir] ?? 0);
  mixField(6, buf[H.deliveryCursor] ?? 0);
  mixField(7, turn < (buf[H.openShutterUntil] ?? 0) ? 1 : 0);
  const offsets = lvl.hashFields;
  for (let i = 0; i < offsets.length; i++) mixField(HEADER_TERMS + i, buf[offsets[i] ?? 0] ?? 0);

  const queueLen = buf[H.queueLen] ?? 0;
  for (let q = 0; q < queueLen; q++) {
    const id = buf[layout.queue + q] ?? 0;
    const cls = pieceClass(buf, layout.pieces + id * PIECE_STRIDE);
    h0 ^= fmix32(Math.imul(cls, MUL0) ^ (z.pos0[POS_QUEUE + q] ?? 0));
    h1 ^= fmix32(Math.imul(cls, MUL1) ^ (z.pos1[POS_QUEUE + q] ?? 0));
  }
  const P = layout.counts.pieces;
  for (let id = 0; id < P; id++) {
    const base = layout.pieces + id * PIECE_STRIDE;
    const zone = buf[base + PF.zone] ?? 0;
    let pos: number;
    if (zone === Zone.yard) pos = (buf[base + PF.y] ?? 0) * 8 + (buf[base + PF.x] ?? 0);
    else if (zone === Zone.site)
      pos =
        POS_SITE +
        (buf[base + PF.seg] ?? 0) * SEGMENT_CELLS +
        (buf[base + PF.y] ?? 0) * SITE_COLS +
        ((buf[base + PF.x] ?? 0) - SITE_X);
    else continue; // queue handled above (order matters); pending and gone pieces are not hashed
    const cls = pieceClass(buf, base);
    h0 ^= fmix32(Math.imul(cls, MUL0) ^ (z.pos0[pos] ?? 0));
    h1 ^= fmix32(Math.imul(cls, MUL1) ^ (z.pos1[pos] ?? 0));
  }
  out[0] = h0 >>> 0;
  out[1] = h1 >>> 0;
  return out;
}

/** 16 hex digits, lane 1 first (debug panel, golden files). */
export function hashHex(s: GameState): string {
  const h = hashState(s);
  return (h[1] ?? 0).toString(16).padStart(8, '0') + (h[0] ?? 0).toString(16).padStart(8, '0');
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
/** Least common multiple of positive integers (1 for an empty list). */
export function lcm(values: readonly number[]): number {
  return values.filter((v) => v > 0).reduce((acc, v) => (acc / gcd(acc, v)) * v, 1);
}
