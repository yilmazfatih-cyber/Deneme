/**
 * Gravity override of the level data (docs/TECH_DESIGN.md §12.3 "Yerçekimi aç/kapa (saha / şantiye profili
 * low-normal-high)"; GDD K-19, K-20; R-20: development only).
 *
 * The K-19 gravity profile is level data: core `loadLevel` compiles `gravity.build` / `gravity.yard` into the
 * `CompiledLevel` every rule reads. The level screen loads its levels through the lazy glob of
 * scenes/level/levels.ts; this module imports the SAME level modules (same URLs, so the same module instances on the
 * development server) and writes the override into their data. The next load of any level — new attempt, retry,
 * resume, the launch check — then validates and compiles the overridden data, so the board, the session, the shadow
 * and `levelHash` all agree. The original values are kept and written back when the override is lifted.
 */
import type { DebugRules, GravityData } from './rules.ts';
import { BUILD_GRAVITIES, overriddenGravity } from './rules.ts';

const FILES = import.meta.glob<unknown>('/levels/level_*.json', { import: 'default' });

interface LevelJson {
  gravity: GravityData;
}

function isLevelJson(data: unknown): data is LevelJson {
  if (data === null || typeof data !== 'object') return false;
  const g = (data as { gravity?: unknown }).gravity;
  if (g === null || typeof g !== 'object') return false;
  const { build, yard } = g as { build?: unknown; yard?: unknown };
  return (BUILD_GRAVITIES as readonly unknown[]).includes(build) && typeof yard === 'boolean';
}

/** The level data's own gravity, recorded before the first override (per data object). */
const ORIGINAL = new WeakMap<LevelJson, GravityData>();

/** Writes `rules`' gravity override into one level's data (in place); returns whether the data changed. */
export function overrideLevelData(data: unknown, rules: DebugRules): boolean {
  if (!isLevelJson(data)) return false;
  let original = ORIGINAL.get(data);
  if (!original) {
    original = { build: data.gravity.build, yard: data.gravity.yard };
    ORIGINAL.set(data, original);
  }
  const next = overriddenGravity(original, rules);
  const changed = next.build !== data.gravity.build || next.yard !== data.gravity.yard;
  data.gravity.build = next.build;
  data.gravity.yard = next.yard;
  return changed;
}

/** Applies the gravity override (or lifts it: `rules` without one) to every level file; returns the changed count. */
export async function applyGravityOverride(rules: DebugRules): Promise<number> {
  const all = await Promise.all(Object.values(FILES).map((load) => load()));
  return all.filter((data) => overrideLevelData(data, rules)).length;
}
