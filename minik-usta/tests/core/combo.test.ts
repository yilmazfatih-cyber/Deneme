import { describe, expect, it } from 'vitest';
import {
  COMBO_FOR_TROWEL,
  applyTrowel,
  comboOf,
  comboOnCorrect,
  comboReset,
  grantTrowels,
  trowelRejection,
  trowelsOf,
} from '../../src/core/combo.ts';
import { buildFront } from '../../src/core/placement.ts';
import { H, SITE_TROWEL, filledMask, hdr, revealedMask, siteOcc } from '../../src/core/state.ts';
import type { Move } from '../../src/core/types.ts';
import { initialState } from '../fixtures/builders.ts';
import type { LevelSpec } from '../fixtures/builders.ts';
import { dragTo, expectConsistent, find, run, types } from './moves.fixtures.ts';

/** Plan of four W rows; four vertical W dominoes, a Y block and a W single. */
const TOWER: LevelSpec = {
  wall: { height: 2 },
  plan: ['WW', 'WW', 'WW', 'WW'],
  pieces: [
    ['D2_0', 'W', 0, 0],
    ['D2_0', 'W', 1, 0],
    ['D2_0', 'W', 2, 0],
    ['D2_0', 'W', 3, 0],
    ['B1_0', 'Y', 4, 0],
    ['B1_0', 'W', 5, 0],
  ],
};

const trowel = (seg: number, x: 0 | 1, y: number): Move => ({ kind: 'trowel', seg, x, y });

describe('K-33 Usta Serisi', () => {
  it('K-33 GDD example: correct, correct, yard move, correct, correct → 1 Golden Trowel and c = 0', () => {
    const s = initialState(TOWER);
    run(s, dragTo(0, 6, 8));
    run(s, dragTo(1, 7, 8));
    expect(comboOf(s)).toBe(2);
    run(s, dragTo(4, 4, 1)); // yard move: c unchanged
    expect(comboOf(s)).toBe(2);
    run(s, dragTo(2, 6, 8));
    expect(comboOf(s)).toBe(3);
    const fourth = run(s, dragTo(3, 7, 8));
    expect(
      fourth.ev.filter((e) => e.t === 'comboChanged' || e.t === 'trowelEarned').map((e) => [e.t, e.step]),
    ).toEqual([
      ['comboChanged', 3],
      ['trowelEarned', 3],
      ['comboChanged', 3],
    ]);
    expect(
      fourth.ev.filter((e) => e.t === 'comboChanged').map((e) => (e.t === 'comboChanged' ? e.combo : -1)),
    ).toEqual([4, 0]);
    expect(find(fourth.ev, 'trowelEarned').trowels).toBe(1);
    expect([comboOf(s), trowelsOf(s)]).toEqual([0, 1]);
  });

  it('K-33 a wrong placement sets c = 0 (correct, correct, wrong)', () => {
    const s = initialState(TOWER);
    run(s, dragTo(0, 6, 8));
    run(s, dragTo(1, 7, 8));
    const wrong = run(s, dragTo(4, 6, 8)); // Y on W
    expect(types(wrong.ev)).toContain('pieceBounced');
    expect(comboOf(s)).toBe(0);
  });

  it('K-33 counter helpers: the 4th step earns a trowel; reset reports a change only when c > 0', () => {
    const s = initialState(TOWER);
    expect(COMBO_FOR_TROWEL).toBe(4);
    expect([1, 2, 3].map(() => comboOnCorrect(s).combo)).toEqual([1, 2, 3]);
    expect(comboOnCorrect(s)).toEqual({ reached: 4, combo: 0, earned: true, trowels: 1 });
    expect(comboReset(s)).toBe(false);
    comboOnCorrect(s);
    expect(comboReset(s)).toBe(true);
    expect(() => grantTrowels(s, -1)).toThrow(RangeError);
  });
});

describe('K-33 Golden Trowel', () => {
  /** GDD K-33 example column 7: y0 W filled, y1 `.`, y2 W empty (plan bottom → top: WW, W., WW, WW). */
  const DOT: LevelSpec = {
    wall: { height: 2 },
    plan: ['WW', 'WW', 'W.', 'WW'],
    pieces: [
      ['B1_0', 'W', 0, 0],
      ['B1_0', 'W', 1, 0],
    ],
  };

  it('K-33 GDD example: the trowel may fill (7,2) above an empty dot cell, not (7,3) while (7,2) is empty', () => {
    const s = initialState(DOT);
    run(s, dragTo(1, 7, 8)); // (7,0) W
    grantTrowels(s, 1);
    expect(trowelRejection(s, { seg: 0, x: 1, y: 3 })).toBe('notBuildFront');
    expect(trowelRejection(s, { seg: 0, x: 1, y: 2 })).toBeNull();
    expect(buildFront(s).map((c) => [c.x, c.y])).toEqual([
      [6, 0],
      [7, 2],
    ]);
    const before = { m: hdr(s, H.turn), moves: hdr(s, H.movesLeft), c: comboOf(s) };
    const r = run(s, trowel(0, 1, 2));
    expect(r.res.status).toBe('applied');
    expect(find(r.ev, 'boosterApplied')).toMatchObject({
      step: 1,
      booster: 'trowel',
      detail: { cell: { zone: 'site', x: 7, y: 2, seg: 0 }, color: 'W', trowels: 0 },
    });
    expect(siteOcc(s, 0, 1, 2)).toBe(SITE_TROWEL);
    expect(filledMask(s, 0, 1) & 0b101).toBe(0b101);
    // boosters never spend a move, advance m or touch the streak (GDD §10)
    expect({ m: hdr(s, H.turn), moves: hdr(s, H.movesLeft), c: comboOf(s) }).toEqual(before);
    expect(types(r.ev)).not.toContain('movesChanged');
    expectConsistent(s);
  });

  it('K-33 a refused trowel target is not consumed and changes nothing', () => {
    const s = initialState(DOT);
    const none = run(s, trowel(0, 0, 0));
    expect(none.res).toEqual({ status: 'rejected', reason: 'noTrowel', won: false, outOfMoves: false });
    expect(none.ev).toEqual([
      { seq: 0, step: 0, t: 'boosterRejected', booster: 'trowel', reason: 'noTrowel' },
    ]);
    grantTrowels(s, 1);
    const before = s.buf.slice();
    expect(run(s, trowel(0, 0, 1)).res.reason).toBe('notBuildFront');
    expect(run(s, trowel(1, 0, 0)).res.reason).toBe('notVisibleSegment');
    expect(s.buf).toEqual(before);
    expect(() => applyTrowel(s, { seg: 0, x: 0, y: 3 })).toThrow(/notBuildFront/);
  });

  it('K-33 a trowel that completes the segment runs the mini pipeline: shift and delivery, no m, no timers', () => {
    const s = initialState({
      wall: { height: 2 },
      plan: [['WW'], ['WW']],
      pieces: [['B1_0', 'W', 0, 0]],
      batches: [{ forSegment: 1, pieces: [['D2_90', 'W', 0, 8]] }],
    });
    run(s, dragTo(0, 6, 8));
    grantTrowels(s, 1);
    const r = run(s, trowel(0, 1, 0));
    expect(r.ev.map((e) => [e.t, e.step])).toEqual([
      ['boosterApplied', 1],
      ['segmentCompleted', 8],
      ['goalProgress', 8],
      ['siteShifted', 8],
      ['deliveryArrived', 9],
      ['pieceFell', 9],
    ]);
    expect([hdr(s, H.turn), hdr(s, H.activeSeg)]).toEqual([1, 1]);
    expectConsistent(s);
  });

  it('K-33 a trowel on a hidden `?` cell opens it (K-32)', () => {
    const s = initialState({
      wall: { height: 2 },
      plan: ['??', 'WY'],
      hidden: [{ kind: 'repeat', period: 1 }],
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'Y', 1, 0],
      ],
    });
    run(s, dragTo(0, 6, 8));
    run(s, dragTo(1, 7, 8));
    grantTrowels(s, 1);
    const r = run(s, trowel(0, 1, 1));
    expect(find(r.ev, 'cellsRevealed')).toMatchObject({
      step: 1,
      seg: 0,
      cells: [{ x: 7, y: 1, color: 'Y' }],
    });
    expect(revealedMask(s, 0)).toBe(1 << 3);
  });
});
