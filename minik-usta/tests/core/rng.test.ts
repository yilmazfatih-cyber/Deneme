import { describe, expect, it } from 'vitest';
import {
  HASH32_VERSION,
  bufferRng,
  fmix32,
  hash32,
  mulberry32,
  mulberry32Next,
  mulberry32Output,
  splitmix32,
} from '../../src/core/rng.ts';

const hex = (n: number): string => '0x' + (n >>> 0).toString(16).padStart(8, '0');

/** The widely published mulberry32 (bryc/PRNGs), used as an independent oracle. */
function referenceMulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

describe('core rng (TECH_DESIGN §2.7)', () => {
  it('mulberry32 matches the reference algorithm for 10 000 outputs', () => {
    for (const seed of [0, 1, 4004, -1, 0x7fffffff]) {
      const ref = referenceMulberry32(seed);
      const rng = mulberry32(seed);
      for (let i = 0; i < 10_000; i++) expect(rng.nextU32()).toBe(ref());
    }
  });

  it('mulberry32 reference vectors are pinned', () => {
    const take = (seed: number): string[] => {
      const r = mulberry32(seed);
      return [0, 1, 2, 3, 4].map(() => hex(r.nextU32()));
    };
    expect(take(0)).toEqual(['0x4434b462', '0x00159c37', '0x39285b08', '0x256d8104', '0x77a2cbd4']);
    expect(take(4004)).toEqual(['0xdc5f7186', '0x913122ec', '0x27b0b0df', '0x1586ba6f', '0x6bc904c6']);
  });

  it('buffer rng keeps its whole state in one Int32Array slot (snapshot replays the same future)', () => {
    const buf = new Int32Array(4);
    buf[2] = 4004;
    const a = bufferRng(buf, 2);
    a.nextU32();
    const snapshot = buf.slice();
    const first = [a.nextU32(), a.nextU32(), a.nextU32()];
    const b = bufferRng(snapshot, 2);
    expect([b.nextU32(), b.nextU32(), b.nextU32()]).toEqual(first);
    expect(buf[0]).toBe(0);
    expect(buf[3]).toBe(0);
  });

  it('step/output decomposition equals the closure generator', () => {
    let s = 77;
    const r = mulberry32(77);
    for (let i = 0; i < 100; i++) {
      s = mulberry32Next(s);
      expect(mulberry32Output(s)).toBe(r.nextU32());
    }
    expect(r.state()).toBe(s);
  });

  it('next() is in [0, 1) and nextInt stays in range', () => {
    const r = mulberry32(9);
    for (let i = 0; i < 1000; i++) {
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = r.nextInt(7);
      expect(Number.isInteger(n) && n >= 0 && n < 7).toBe(true);
    }
    expect(() => r.nextInt(0)).toThrow();
    expect(() => r.nextInt(2.5)).toThrow();
  });

  it('splitmix32 reference vectors are pinned', () => {
    const take = (seed: number): string[] => {
      const g = splitmix32(seed);
      return [0, 1, 2, 3].map(() => hex(g()));
    };
    expect(take(0)).toEqual(['0x64625032', '0xd9c0799c', '0xaf362e10', '0x7fa88912']);
    expect(take(42)).toEqual(['0x20e44818', '0x0895a923', '0x1339a01f', '0xb4e3841a']);
  });

  it('fmix32 matches the MurmurHash3 finaliser', () => {
    expect(hex(fmix32(0))).toBe('0x00000000');
    expect(hex(fmix32(1))).toBe('0x514e28b7');
    expect(hex(fmix32(0x12345678))).toBe('0xe37cd1bc');
  });

  it('hash32 fmix32-chain-v1 reference vectors are pinned (device and server must agree, TECH §15 R-19)', () => {
    expect(HASH32_VERSION).toBe('fmix32-chain-v1');
    const vectors: [number[], string][] = [
      [[], '0xab3e7c0b'],
      [[0], '0xc3febd23'],
      [[0, 0], '0x64cdefdc'],
      [[0, 0, 0], '0x8743fdcd'],
      [[1, 2, 3], '0x42c6bcb5'],
      [[3, 2, 1], '0xcec9e51a'],
      [[4004, 0, 0], '0x21c3c899'],
      [[4004, 1, 0], '0xb59541db'],
      [[4004, 0, 1], '0x386c1552'],
      [[2026, 123456789], '0x0ae84c9a'],
      [[-1], '0xc569aed7'],
      [[4294967295], '0xc569aed7'],
    ];
    for (const [words, expected] of vectors)
      expect(hex(hash32(...words)), JSON.stringify(words)).toBe(expected);
  });

  it('hash32 is order and length sensitive and rejects non 32-bit words', () => {
    expect(hash32(1, 2)).not.toBe(hash32(2, 1));
    expect(hash32(0)).not.toBe(hash32(0, 0));
    expect(() => hash32(1.5)).toThrow();
    expect(() => hash32(2 ** 32)).toThrow();
    expect(() => hash32(-(2 ** 31) - 1)).toThrow();
  });
});
