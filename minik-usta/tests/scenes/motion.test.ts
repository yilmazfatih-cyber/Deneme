import { describe, expect, it } from 'vitest';
import { TOKENS } from '../../src/theme/tokens.ts';
import {
  Timeline,
  Track,
  fallDistanceAt,
  fallDurationMs,
  fallLeg,
  glideMs,
} from '../../src/scenes/level/motion.ts';

const ph = TOKENS.physics;

describe('fall timing from tokens.physics (JUICE 0.1, TECH 6.3)', () => {
  it('JUICE 0.1 normal gravity: 1 cell ≈ 150 ms, 6 cells ≈ 395 ms', () => {
    expect(fallDurationMs(1, ph.fallNormalAccel, ph.fallNormalMax)).toBeCloseTo(149, 0);
    expect(fallDurationMs(6, ph.fallNormalAccel, ph.fallNormalMax)).toBeCloseTo(395, 0);
  });

  it('JUICE 0.1 heavy gravity: 6 cells ≈ 216 ms; low gravity glides at fallLowSpeed (≈ 222 ms / row)', () => {
    expect(Math.abs(fallDurationMs(6, ph.fallHighAccel, ph.fallHighMax) - 216)).toBeLessThan(1);
    expect(glideMs(1, ph.fallLowSpeed)).toBeCloseTo(222, 0);
  });

  it('a zero fall takes no time; the fall ease runs 0 → 1 and never goes back', () => {
    expect(fallDurationMs(0, ph.fallNormalAccel, ph.fallNormalMax)).toBe(0);
    const leg = fallLeg(7, ph.fallNormalAccel, ph.fallNormalMax);
    let prev = -1;
    for (let u = 0; u <= 1.0001; u += 0.05) {
      const k = leg.ease(Math.min(1, u));
      expect(k).toBeGreaterThanOrEqual(prev);
      prev = k;
    }
    expect(leg.ease(0)).toBe(0);
    expect(leg.ease(1)).toBeCloseTo(1, 9);
    expect(fallDistanceAt(leg.ms, ph.fallNormalAccel, ph.fallNormalMax)).toBeCloseTo(7, 6);
  });
});

describe('Track and Timeline (R-12 fast-forward)', () => {
  const start = { ax: 2, ay: 6, scale: 1.08, alpha: 1 };

  it('legs run one after another; before the start the start pose, after the end the final pose', () => {
    const t = new Track(start, 1000).to({ ax: 6, ay: 8, ms: 100 }).to({ ax: 6, ay: 1, ms: 200, scale: 1 });
    expect(t.end).toBe(1300);
    expect(t.at(900)).toEqual(start);
    expect(t.at(1050)).toMatchObject({ ax: 4, ay: 7, scale: 1.08 });
    expect(t.at(1200)).toMatchObject({ ax: 6, ay: 4.5 });
    expect(t.at(5000)).toEqual({ ax: 6, ay: 1, scale: 1, alpha: 1 });
    expect(t.final).toEqual(t.at(t.end));
  });

  it('an arced leg peaks at mid-time and lands exactly on its target (JUICE 8, 13)', () => {
    const t = new Track(start, 0)
      .to({ ax: 6, ay: 0, ms: 100, arc: 1.5 })
      .to({ ax: 0, ay: 0, ms: 100, arc: 1.5 });
    expect(t.at(150).ay).toBeCloseTo(1.5, 9);
    expect(t.at(200)).toMatchObject({ ax: 0, ay: 0 });
  });

  it('Timeline runs callbacks in time order and flush() runs every pending one, also those added meanwhile', () => {
    const tl = new Timeline();
    const seen: string[] = [];
    tl.at(200, () => seen.push('b'));
    tl.at(100, () => {
      seen.push('a');
      tl.at(150, () => seen.push('a2'));
    });
    tl.at(300, () => seen.push('c'));
    tl.run(160);
    expect(seen).toEqual(['a', 'a2']);
    tl.flush();
    expect(seen).toEqual(['a', 'a2', 'b', 'c']);
    expect(tl.pending).toBe(0);
  });
});
