import { describe, expect, it } from 'vitest';
import { buildZobrist, hashHex, hashState, lcm } from '../../src/core/hash.ts';
import {
  GF,
  H,
  PF,
  cloneState,
  enqueuePiece,
  setFilledMask,
  setFlag,
  setGapField,
  setHdr,
  setPieceField,
} from '../../src/core/state.ts';
import type { GameState } from '../../src/core/state.ts';
import { occupyPiece, vacatePiece } from '../../src/core/grid.ts';
import { mulberry32 } from '../../src/core/rng.ts';
import { Zone } from '../../src/core/types.ts';
import { compiledLevel, initialState } from '../fixtures/builders.ts';

const move = (s: GameState, id: number, x: number, y: number): void => {
  vacatePiece(s, id);
  setPieceField(s, id, PF.x, x);
  setPieceField(s, id, PF.y, y);
  occupyPiece(s, id);
};

describe('Zobrist state hash (TECH §2.6, D-052)', () => {
  it('is deterministic: two compiles of the same level give the same hash', () => {
    const spec = {
      id: 3,
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['O4_0', 'Y', 2, 0],
      ],
    } as const;
    expect(hashHex(initialState(spec))).toBe(hashHex(initialState(spec)));
    expect(hashHex(initialState(spec))).toMatch(/^[0-9a-f]{16}$/);
  });

  it('uses the piece class, not the piece id: swapping identical blocks keeps the hash', () => {
    const s = initialState({
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'W', 1, 0],
        ['B1_0', 'Y', 2, 0],
      ],
    });
    const h = hashHex(s);
    const swapped = cloneState(s);
    move(swapped, 0, 4, 0);
    move(swapped, 1, 0, 0);
    move(swapped, 0, 1, 0);
    expect(hashHex(swapped)).toBe(h);
    const colourSwap = cloneState(s);
    move(colourSwap, 1, 4, 0);
    move(colourSwap, 2, 1, 0);
    move(colourSwap, 1, 2, 0);
    expect(hashHex(colourSwap)).not.toBe(h);
  });

  it('symmetric orientations hash the same (canonical shape)', () => {
    const a = initialState({ pieces: [['O4_0', 'W', 0, 0]] });
    const b = initialState({ pieces: [['O4_90', 'W', 0, 0]] });
    expect(hashHex(a)).toBe(hashHex(b));
  });

  it('position, zone, flags, gaps, filled, cursor and turn mod L change the hash; counters do not', () => {
    const s = initialState({
      id: 13,
      wall: { height: 4, gaps: [{ type: 'shutter', y: 0, size: 1, period: 2 }] },
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'Y', 1, 0],
      ],
    });
    expect(s.lvl.cycle).toBe(4);
    const h = hashHex(s);
    const variants: ((t: GameState) => void)[] = [
      (t) => move(t, 0, 3, 3),
      (t) => setFlag(t, 0, 'glass', true),
      (t) => setGapField(t, 0, GF.open, 0),
      (t) => setFilledMask(t, 0, 0, 1),
      (t) => setHdr(t, H.deliveryCursor, 1),
      (t) => setHdr(t, H.turn, 1),
      (t) => setHdr(t, H.openShutterUntil, 5),
    ];
    for (const change of variants) {
      const t = cloneState(s);
      change(t);
      expect(hashHex(t)).not.toBe(h);
    }
    const same: ((t: GameState) => void)[] = [
      (t) => setHdr(t, H.turn, 4), // turn mod L
      (t) => setHdr(t, H.movesLeft, 1),
      (t) => setHdr(t, H.combo, 3),
      (t) => setHdr(t, H.wrongCount, 2),
      (t) => setPieceField(t, 0, PF.arrivedTurn, 9),
    ];
    for (const change of same) {
      const t = cloneState(s);
      change(t);
      expect(hashHex(t)).toBe(h);
    }
  });

  it('K-26 queue order is part of the hash; pending and gone pieces are not', () => {
    const s = initialState({
      plan: [['WW'], ['WW']],
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'Y', 1, 0],
      ],
      batches: [{ forSegment: 1, pieces: [['B1_0', 'Y', 0, 8]] }],
    });
    const toQueue = (order: number[]): string => {
      const t = cloneState(s);
      for (const id of order) {
        vacatePiece(t, id);
        enqueuePiece(t, id);
      }
      return hashHex(t);
    };
    expect(toQueue([0, 1])).not.toBe(toQueue([1, 0]));
    const gone = cloneState(s);
    setPieceField(gone, 2, PF.zone, Zone.gone);
    expect(hashHex(gone)).toBe(hashHex(s));
  });

  it('no collisions over 5 000 random yard configurations', () => {
    const base = initialState({
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'Y', 1, 0],
        ['D2_0', 'W', 2, 0],
        ['O4_0', 'Y', 3, 0],
      ],
    });
    const rng = mulberry32(2026);
    const seen = new Map<string, string>();
    for (let n = 0; n < 5000; n++) {
      const t = cloneState(base);
      for (let id = 0; id < 4; id++) vacatePiece(t, id);
      const placed: string[] = [];
      for (let id = 0; id < 4; id++) {
        const x = rng.nextInt(5);
        const y = rng.nextInt(7);
        setPieceField(t, id, PF.x, x);
        setPieceField(t, id, PF.y, y);
        placed.push(`${id}@${x},${y}`);
      }
      const key = placed.join(' ');
      const h = hashHex(t);
      const prev = seen.get(h);
      if (prev !== undefined) expect(prev).toBe(key);
      seen.set(h, key);
    }
    expect(seen.size).toBeGreaterThan(4000);
  });

  it('hashState writes into a caller buffer and tables are fixed-seed', () => {
    const s = initialState({ pieces: [['B1_0', 'W', 0, 0]] });
    const out = new Uint32Array(2);
    expect(hashState(s, out)).toBe(out);
    const z1 = buildZobrist(s.lvl.layout, 1);
    const z2 = buildZobrist(compiledLevel({ pieces: [['B1_0', 'W', 0, 0]] }).layout, 1);
    expect(z1.pos0).toEqual(z2.pos0);
    expect(lcm([4, 6, 4])).toBe(12);
    expect(lcm([])).toBe(1);
  });
});
