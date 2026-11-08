import { describe, expect, it } from 'vitest';
import {
  SLICE_LEVELS,
  availableLevels,
  levelIdOfPath,
  loadLevelById,
  nextSliceLevel,
} from '../../src/scenes/level/levels.ts';

describe('level files in the game (TECH 8.3 lazy glob, TECH 14.1 slice)', () => {
  it('TECH 8.3 the lazy glob finds levels 1–5', () => {
    expect(availableLevels().slice(0, SLICE_LEVELS)).toEqual([1, 2, 3, 4, 5]);
    expect(levelIdOfPath('/levels/level_007.json')).toBe(7);
    expect(levelIdOfPath('/levels/notes.json')).toBeNull();
  });

  it('UX 6 Phase 2 slice: after level 5 the loop starts again at level 1', () => {
    expect([1, 2, 3, 4, 5].map(nextSliceLevel)).toEqual([2, 3, 4, 5, 1]);
  });

  it('TECH 8.3 levels 1–5 load through core loadLevel; a missing file is rejected, not started', async () => {
    for (const id of [1, 2, 3, 4, 5]) {
      const res = await loadLevelById(id);
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.level.id).toBe(id);
    }
    const missing = await loadLevelById(999);
    expect(missing).toMatchObject({ ok: false, stage: 'missing' });
  });
});
