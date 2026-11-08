/**
 * Debug data sources (TECH_DESIGN §12.3; R-20): the golden solutions (tests/golden via the development server's lazy
 * glob) and the gravity override of the level data (K-19 profile, K-20 yard gravity), which must reach the game's own
 * level loader (scenes/level/levels.ts) through the shared level modules.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { levelHash } from '../../src/core/session.ts';
import {
  goldenIdOfPath,
  goldenLevels,
  goldenProgress,
  loadGolden,
  parseGolden,
} from '../../src/debug/golden.ts';
import { applyGravityOverride, overrideLevelData } from '../../src/debug/levelOverride.ts';
import { NO_DEBUG_RULES } from '../../src/debug/rules.ts';
import { loadLevelById } from '../../src/scenes/level/levels.ts';
import { HAND } from '../core/moves.fixtures.ts';

afterEach(async () => {
  await applyGravityOverride(NO_DEBUG_RULES);
});

describe('debug golden solutions (TECH 12.3, 9.5)', () => {
  it('TECH 12.3 the golden files of levels 1–5 load as move records equal to the hand solutions', async () => {
    expect(goldenLevels().slice(0, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(goldenIdOfPath('/tests/golden/level_004.hand.json')).toBe(4);
    expect(goldenIdOfPath('/tests/golden/level_004.json')).toBeNull();
    for (const id of [1, 2, 3, 4, 5] as const) {
      const g = await loadGolden(id);
      if (!g.ok) throw new Error(g.reason);
      expect(g.log[0]).toEqual({ kind: 'start', preBoosters: [], streakTier: 0 });
      expect(g.log.slice(1)).toEqual(HAND[id]);
    }
    expect(await loadGolden(999)).toMatchObject({ ok: false });
  });

  it('TECH 12.3 malformed golden data is rejected with a reason', () => {
    expect(parseGolden({ level: 2, log: [] }, 2)).toMatchObject({ ok: false });
    expect(
      parseGolden({ level: 3, log: [{ kind: 'start', preBoosters: [], streakTier: 0 }] }, 2),
    ).toMatchObject({
      ok: false,
    });
    expect(parseGolden({ level: 2, log: [{ kind: 'drag' }] }, 2)).toMatchObject({ ok: false });
    expect(
      parseGolden({ level: 2, log: [{ kind: 'drag', pieceId: 0, to: { ix: 6, iy: 8, mode: 0 } }] }, 2),
    ).toMatchObject({ ok: false });
  });

  it('TECH 12.3 golden progress: a prefix of the solution counts, any other action leaves it', async () => {
    const g = await loadGolden(3);
    if (!g.ok) throw new Error(g.reason);
    expect(goldenProgress(g.log.slice(0, 1), g.log)).toBe(1);
    expect(goldenProgress(g.log.slice(0, 3), g.log)).toBe(3);
    expect(goldenProgress([...g.log.slice(0, 2), { kind: 'undo' }], g.log)).toBeNull();
    expect(goldenProgress([...g.log, { kind: 'undo' }], g.log)).toBeNull();
  });
});

describe('debug gravity override (TECH 12.3, GDD K-19, K-20)', () => {
  it('TECH 12.3 yard gravity and the build profile reach the game loader; lifting it restores the level data', async () => {
    const before = await loadLevelById(2);
    if (!before.ok) throw new Error('level 2');
    expect(before.level.gravity).toMatchObject({ build: 'normal', yard: false });

    const changed = await applyGravityOverride({
      ...NO_DEBUG_RULES,
      yardGravity: true,
      buildGravity: 'high',
    });
    expect(changed).toBeGreaterThanOrEqual(5);
    const after = await loadLevelById(2);
    if (!after.ok) throw new Error('level 2 with the override');
    expect(after.level.gravity).toMatchObject({ build: 'high', yard: true, holdMs: 700, glassThreshold: 2 });
    expect(levelHash(after.level.data)).not.toBe(levelHash(before.level.data));

    await applyGravityOverride(NO_DEBUG_RULES);
    const restored = await loadLevelById(2);
    if (!restored.ok) throw new Error('level 2 restored');
    expect(restored.level.gravity).toMatchObject({ build: 'normal', yard: false });
    expect(levelHash(restored.level.data)).toBe(levelHash(before.level.data));
  });

  it('TECH 12.3 only one switch overridden keeps the other value of each level', () => {
    const data = { id: 9, gravity: { build: 'low' as const, yard: true } };
    expect(overrideLevelData(data, { ...NO_DEBUG_RULES, yardGravity: false })).toBe(true);
    expect(data.gravity).toEqual({ build: 'low', yard: false });
    expect(overrideLevelData(data, { ...NO_DEBUG_RULES, buildGravity: 'normal' })).toBe(true);
    expect(data.gravity).toEqual({ build: 'normal', yard: true });
    expect(overrideLevelData(data, NO_DEBUG_RULES)).toBe(true);
    expect(data.gravity).toEqual({ build: 'low', yard: true });
    expect(overrideLevelData({ gravity: { build: 'sideways', yard: true } }, NO_DEBUG_RULES)).toBe(false);
  });
});
