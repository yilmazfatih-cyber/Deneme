/**
 * Golden solutions for the debug replay (docs/TECH_DESIGN.md §12.3 "Golden/solver çözümünü oynat: önbellekteki
 * `tests/golden/` … (geliştirme sunucusu üzerinden)", §9.5; R-20). Phase 2: the LEVELS §2 hand solutions
 * `tests/golden/level_NNN.hand.json` (their `log` is the TECH §6.1 move record, `start` first — the same format the
 * save stores, so it is checked with the save's action schema). The files are lazy chunks of the development server
 * only: this module is never part of a production bundle.
 */
import { canonicalJson } from '../core/moves.ts';
import type { SessionAction } from '../core/types.ts';
import { SessionActionSchema, asSessionActions } from '../services/save.ts';
import type { StoredAction } from '../services/save.ts';

const FILES = import.meta.glob<unknown>('/tests/golden/level_*.hand.json', { import: 'default' });

/** `/tests/golden/level_003.hand.json` → 3; null for any other name. */
export function goldenIdOfPath(path: string): number | null {
  const m = /level_(\d{3})\.hand\.json$/.exec(path);
  return m ? Number(m[1]) : null;
}

const LOADERS: ReadonlyMap<number, () => Promise<unknown>> = new Map(
  Object.entries(FILES).flatMap(([path, load]) => {
    const id = goldenIdOfPath(path);
    return id === null ? [] : [[id, load] as const];
  }),
);

/** Levels with a golden solution, ascending. */
export function goldenLevels(): number[] {
  return [...LOADERS.keys()].sort((a, b) => a - b);
}

export type GoldenLoad =
  | { readonly ok: true; readonly log: readonly SessionAction[] }
  | { readonly ok: false; readonly reason: string };

/** Parses a golden file's `log` (start action first, every entry a valid stored action). */
export function parseGolden(json: unknown, levelId: number): GoldenLoad {
  const raw = (json as { readonly level?: unknown; readonly log?: unknown } | null) ?? {};
  if (raw.level !== levelId) return { ok: false, reason: `golden level ${String(raw.level)} ≠ ${levelId}` };
  if (!Array.isArray(raw.log) || raw.log.length === 0) return { ok: false, reason: 'golden log missing' };
  const actions: StoredAction[] = [];
  for (const [i, entry] of raw.log.entries()) {
    const parsed = SessionActionSchema.safeParse(entry);
    if (!parsed.success) return { ok: false, reason: `golden log entry ${i} is not a move record` };
    actions.push(parsed.data);
  }
  if (actions[0]?.kind !== 'start') return { ok: false, reason: 'golden log must start with a start action' };
  return { ok: true, log: asSessionActions(actions) };
}

/** The golden solution of `levelId` (development server). */
export async function loadGolden(levelId: number): Promise<GoldenLoad> {
  const load = LOADERS.get(levelId);
  if (!load) return { ok: false, reason: `no golden solution for level ${levelId}` };
  return parseGolden(await load(), levelId);
}

/** Same action (core canonical JSON of both records). */
export function sameAction(a: SessionAction | undefined, b: SessionAction | undefined): boolean {
  return a !== undefined && b !== undefined && canonicalJson(a) === canonicalJson(b);
}

/**
 * How far `log` (an attempt's actions) follows `golden`: the number of golden actions already played, or null when
 * the attempt left the solution (another move, an undo …).
 */
export function goldenProgress(
  log: readonly SessionAction[],
  golden: readonly SessionAction[],
): number | null {
  if (log.length > golden.length) return null;
  for (let i = 0; i < log.length; i++) if (!sameAction(log[i], golden[i])) return null;
  return log.length;
}
