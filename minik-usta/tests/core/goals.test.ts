import { describe, expect, it } from 'vitest';
import {
  addGoalCount,
  allSegmentsComplete,
  changedCountGoals,
  countDebrisLeftSite,
  extraGoalsMet,
  goalKind,
  goalSnapshot,
  goalTarget,
  goalViews,
  levelGoalsMet,
  setBuildProgress,
} from '../../src/core/goals.ts';
import { movePiece } from '../../src/core/placement.ts';
import { H, createInitialState, goalValue, setHdr } from '../../src/core/state.ts';
import { Zone } from '../../src/core/types.ts';
import { initialState } from '../fixtures/builders.ts';
import type { LevelSpec } from '../fixtures/builders.ts';
import { HAND, levelFile, run } from './moves.fixtures.ts';

const GOALS: LevelSpec = {
  plan: [['WW'], ['WW']],
  goals: [
    { type: 'build' },
    { type: 'clear', target: 'crate', count: 2 },
    { type: 'clear', target: 'debris', count: 1 },
  ],
  pieces: [['B1_0', 'W', 0, 0]],
  debris: [['B1_0', 'R', 7, 0]],
  obstacles: [
    { type: 'crate', x: 4, y: 0, hp: 1 },
    { type: 'crate', x: 5, y: 0, hp: 1 },
  ],
};

describe('K-41 goals', () => {
  it('K-41 goal kinds and targets: build counts segments, clear / collect their count', () => {
    const s = initialState(GOALS);
    expect(s.lvl.goals.map(goalKind)).toEqual(['build', 'crate', 'debris']);
    expect([0, 1, 2].map((i) => goalTarget(s.lvl, i))).toEqual([2, 2, 1]);
  });

  it('K-41 the build goal shows completed segments (level 5 after its first segment: 1/2)', () => {
    const s = createInitialState(levelFile(5));
    for (const m of HAND[5].slice(0, 3)) run(s, m);
    expect(goalViews(s)).toEqual([{ index: 0, kind: 'build', value: 1, target: 2, done: false }]);
  });

  it('K-41 a counter stops at its target; the surplus is not counted', () => {
    const s = initialState(GOALS);
    const before = goalSnapshot(s);
    expect(addGoalCount(s, 'crate', 1)).toEqual([1]);
    expect(addGoalCount(s, 'crate', 5)).toEqual([1]);
    expect(addGoalCount(s, 'crate', 1)).toEqual([]);
    expect(goalValue(s, 1)).toBe(2);
    expect(addGoalCount(s, 'screw', 1)).toEqual([]);
    expect(changedCountGoals(s, before)).toEqual([1]);
    expect(() => addGoalCount(s, 'crate', -1)).toThrow(RangeError);
  });

  it('K-41 debris counts once, when it leaves the site', () => {
    const s = initialState(GOALS);
    const debris = 1;
    expect(countDebrisLeftSite(s, debris, Zone.site)).toBe(false); // still on the site
    movePiece(s, debris, { zone: 'yard', x: 3, y: 0, seg: -1 });
    expect(countDebrisLeftSite(s, debris, Zone.site)).toBe(true);
    expect(goalValue(s, 2)).toBe(1);
    // moved again inside the yard (or broken later): its move started in the yard → no count
    expect(countDebrisLeftSite(s, debris, Zone.yard)).toBe(false);
    expect(countDebrisLeftSite(s, 0, Zone.site)).toBe(false); // not debris
  });

  it('K-28 the level is won only with every segment complete and every extra goal met', () => {
    const s = initialState(GOALS);
    expect([allSegmentsComplete(s), extraGoalsMet(s), levelGoalsMet(s)]).toEqual([false, false, false]);
    setHdr(s, H.deliveryCursor, 2);
    expect(setBuildProgress(s, 2)).toEqual([0]);
    expect(setBuildProgress(s, 2)).toEqual([]);
    expect(levelGoalsMet(s)).toBe(false);
    addGoalCount(s, 'crate', 2);
    addGoalCount(s, 'debris', 1);
    expect([extraGoalsMet(s), levelGoalsMet(s)]).toEqual([true, true]);
    expect(goalViews(s).every((g) => g.done)).toBe(true);
  });
});
