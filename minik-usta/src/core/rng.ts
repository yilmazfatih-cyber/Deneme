/**
 * Seeded, deterministic random numbers (TECH_DESIGN §2.7). Core code never uses Math.random.
 *
 * - `mulberry32`: the game RNG. Its whole state is one int32, so it lives in the state buffer and snapshots replay
 *   the same future (§2.4).
 * - `splitmix32`: key generation (Zobrist tables, §2.6).
 * - `hash32`: counter-based hashing for bot simulations (§11.2; config/events.json `rng.hash = "fmix32-chain-v1"`).
 *
 * All arithmetic is 32-bit integer (`Math.imul`, shifts), so results are bit-identical on every JS engine.
 */

/** Increment of the mulberry32 Weyl sequence. */
export const MULBERRY32_INCREMENT = 0x6d2b79f5;

/** Advances a mulberry32 state by one step (returns the new int32 state). */
export function mulberry32Next(state: number): number {
  return (state + MULBERRY32_INCREMENT) | 0;
}

/** The uint32 output belonging to an already advanced mulberry32 state. */
export function mulberry32Output(state: number): number {
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return (t ^ (t >>> 14)) >>> 0;
}

/** Random source used by core code and obstacle rules. */
export interface Rng {
  /** Next uint32 in [0, 2³²). */
  nextU32(): number;
  /** Next float in [0, 1). */
  next(): number;
  /** Next integer in [0, n); `n` must be a positive integer ≤ 2³². */
  nextInt(n: number): number;
}

function makeRng(read: () => number, write: (s: number) => void): Rng {
  const nextU32 = (): number => {
    const s = mulberry32Next(read());
    write(s);
    return mulberry32Output(s);
  };
  return {
    nextU32,
    next: () => nextU32() / 4294967296,
    nextInt: (n: number) => {
      if (!Number.isInteger(n) || n <= 0 || n > 4294967296) throw new RangeError(`nextInt: bad bound ${n}`);
      return Math.floor((nextU32() / 4294967296) * n);
    },
  };
}

/** A standalone mulberry32 generator (state kept in a closure). */
export function mulberry32(seed: number): Rng & { state(): number } {
  let state = seed | 0;
  const rng = makeRng(
    () => state,
    (s) => {
      state = s;
    },
  );
  return { ...rng, state: () => state };
}

/** A mulberry32 generator whose state is `buf[index]` (the `rng` header field of the game state, §2.4). */
export function bufferRng(buf: Int32Array, index: number): Rng {
  return makeRng(
    () => buf[index] ?? 0,
    (s) => {
      buf[index] = s;
    },
  );
}

/** splitmix32 generator (key generation). Returns uint32 values. */
export function splitmix32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x9e3779b9) | 0;
    let t = state ^ (state >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

/** MurmurHash3 32-bit finaliser (bijective avalanche on uint32). */
export function fmix32(x: number): number {
  let h = x | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Name recorded in config/events.json `rng.hash`; changing the algorithm below needs a new version name. */
export const HASH32_VERSION = 'fmix32-chain-v1';

/**
 * `fmix32-chain-v1`: hashes a list of 32-bit integers (order and length sensitive).
 *
 * ```
 * h = fmix32(0x811c9dc5 ^ n)                     n = number of words
 * for each word w (as uint32): h = fmix32((h ^ w) + 0x9e3779b9)
 * ```
 *
 * Every word must be an integer in [−2³¹, 2³²); larger values or fractions throw (a silent truncation would make
 * device and server results drift apart, TECH §15 R-19). Reference vectors are pinned in tests/core/rng.test.ts.
 */
export function hash32(...words: readonly number[]): number {
  let h = fmix32(0x811c9dc5 ^ words.length);
  for (const w of words) {
    if (!Number.isInteger(w) || w < -2147483648 || w > 4294967295)
      throw new RangeError(`hash32: bad word ${w}`);
    h = fmix32(((h ^ (w >>> 0)) + 0x9e3779b9) | 0);
  }
  return h;
}
