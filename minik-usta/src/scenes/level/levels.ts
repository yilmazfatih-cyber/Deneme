/**
 * Level files for the game (docs/TECH_DESIGN.md §8.3: lazy `import.meta.glob('/levels/level_*.json')`, one small chunk
 * per level; the load-time check is core `loadLevel` = zod + the runtime logic subset; a rejected level never starts).
 *
 * Phase 2 vertical slice (TECH §14.1, UX §6 "Faz 2 dikey dilimi"): levels 1–5, and after level 5 the loop goes back to
 * level 1.
 */
import { loadLevel } from '../../core/level/compile.ts';
import type { CompiledLevel } from '../../core/level/compile.ts';
import type { Issue } from '../../core/level/logic.ts';

/** Levels of the Phase 2 vertical slice. */
export const SLICE_LEVELS = 5;

const FILES = import.meta.glob<unknown>('/levels/level_*.json', { import: 'default' });

/** `/levels/level_007.json` → 7; null for any other name. */
export function levelIdOfPath(path: string): number | null {
  const m = /level_(\d{3})\.json$/.exec(path);
  return m ? Number(m[1]) : null;
}

const LOADERS: ReadonlyMap<number, () => Promise<unknown>> = new Map(
  Object.entries(FILES).flatMap(([path, load]) => {
    const id = levelIdOfPath(path);
    return id === null ? [] : [[id, load] as const];
  }),
);

/** Ids of the level files bundled with the game, ascending. */
export function availableLevels(): number[] {
  return [...LOADERS.keys()].sort((a, b) => a - b);
}

/** The level after `id` in the vertical slice (1 → 2 … 5 → 1). */
export function nextSliceLevel(id: number): number {
  return id >= SLICE_LEVELS || id < 1 ? 1 : id + 1;
}

export type LevelLoad =
  | { readonly ok: true; readonly level: CompiledLevel; readonly warnings: readonly Issue[] }
  | {
      readonly ok: false;
      readonly stage: 'missing' | 'schema' | 'logic';
      readonly issues: readonly Issue[];
    };

/** Fetches, validates and compiles level `id` (TECH §8.3). */
export async function loadLevelById(id: number): Promise<LevelLoad> {
  const load = LOADERS.get(id);
  if (!load) return { ok: false, stage: 'missing', issues: [] };
  return loadLevel(await load());
}
