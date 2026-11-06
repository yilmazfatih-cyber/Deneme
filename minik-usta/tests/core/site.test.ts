import { describe, expect, it } from 'vitest';
import { siteStrategy } from '../../src/core/site.ts';
import { visibleSegment } from '../../src/core/grid.ts';
import { H, createInitialState, hdr, pieceX, pieceY, pieceZone } from '../../src/core/state.ts';
import { Zone } from '../../src/core/types.ts';
import { compiledLevel, initialState } from '../fixtures/builders.ts';
import type { LevelSpec } from '../fixtures/builders.ts';
import { dragTo, expectConsistent, find, run, types } from './moves.fixtures.ts';

/** Two one-row segments; the W domino builds segment 0, the truck brings the Y domino for segment 1. */
const TWO_SEGMENTS: LevelSpec = {
  wall: { height: 2 },
  plan: [['WW'], ['YY']],
  pieces: [['D2_90', 'W', 0, 0]],
  batches: [{ forSegment: 1, pieces: [['D2_90', 'Y', 0, 8]] }],
};

describe('K-22 segments (S1)', () => {
  it('K-22 a completed segment shifts the site, counts it and queues the next batch, delivered in step 9', () => {
    const s = initialState(TWO_SEGMENTS);
    const site = siteStrategy(s.lvl);
    expect(site.mode).toBe('segments');
    expect(site.completeIfDone(s)).toBeNull();
    const r = run(s, dragTo(0, 6, 8));
    expect(r.ev.filter((e) => e.step >= 8).map((e) => [e.t, e.step])).toEqual([
      ['segmentCompleted', 8],
      ['goalProgress', 8],
      ['siteShifted', 8],
      ['deliveryArrived', 9],
      ['pieceFell', 9],
    ]);
    expect(find(r.ev, 'deliveryArrived')).toMatchObject({ seg: 1, pieces: [1] });
    expect([hdr(s, H.activeSeg), hdr(s, H.deliveryCursor), visibleSegment(s)]).toEqual([1, 1, 1]);
    expect(site.activeSegment(s)).toBe(1);
    expect(site.frameOffset(s)).toBe(0);
    // the delivered domino drops into the column its batch names (K-25 stage 1)
    expect([pieceZone(s, 1), pieceX(s, 1), pieceY(s, 1)]).toEqual([Zone.yard, 0, 0]);
    // the completed segment keeps its locked block (panorama, K-06)
    expect([pieceZone(s, 0), hdr(s, H.turn)]).toEqual([Zone.site, 1]);
    expectConsistent(s);
  });

  it('K-22 the last segment does not shift: the win is checked instead (K-28)', () => {
    const s = initialState(TWO_SEGMENTS);
    run(s, dragTo(0, 6, 8));
    const r = run(s, dragTo(1, 6, 8));
    expect(types(r.ev).slice(-3)).toEqual(['segmentCompleted', 'goalProgress', 'levelWon']);
    expect([hdr(s, H.activeSeg), hdr(s, H.deliveryCursor)]).toEqual([1, 2]);
    expect(r.res.won).toBe(true);
  });

  it('K-15 a segment is complete only without any other block in its area: debris on a `.` cell holds it back', () => {
    const s = initialState({
      wall: { height: 2 },
      plan: ['W.'],
      pieces: [['B1_0', 'W', 0, 0]],
      debris: [['B1_0', 'R', 7, 0]],
    });
    const placed = run(s, dragTo(0, 6, 8));
    expect(find(placed.ev, 'placementCorrect').pieceId).toBe(0);
    expect(types(placed.ev)).not.toContain('segmentCompleted');
    const cleared = run(s, dragTo(1, 5, 2)); // the debris leaves the site → complete in the same move's step 8
    expect(types(cleared.ev)).toContain('segmentCompleted');
    expect(cleared.res.won).toBe(true);
  });
});

describe('site strategy stubs (Phase 3)', () => {
  it('carousel completion / counter and the elevator tick throw "Phase 3"; reading the shown segment works', () => {
    const carousel = createInitialState(
      compiledLevel({
        plan: [['WW'], ['WW']],
        mode: 'carousel',
        carouselEvery: 2,
        pieces: [['B1_0', 'W', 0, 0]],
      }),
    );
    const site = siteStrategy(carousel.lvl);
    expect(site.mode).toBe('carousel');
    expect(site.activeSegment(carousel)).toBe(0);
    expect(() => site.completeIfDone(carousel)).toThrow(/Phase 3/);
    expect(() => site.carouselTick(carousel)).toThrow(/Phase 3/);
    const lifted = createInitialState(
      compiledLevel({
        plan: ['WW'],
        elevator: { range: [0, 2], start: 1, dir: 1 },
        pieces: [['B1_0', 'W', 0, 0]],
      }),
    );
    expect(siteStrategy(lifted.lvl).frameOffset(lifted)).toBe(1);
    expect(() => siteStrategy(lifted.lvl).elevatorTick(lifted)).toThrow(/Phase 3/);
  });
});
