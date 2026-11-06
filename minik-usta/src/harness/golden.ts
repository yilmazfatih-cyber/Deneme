/**
 * Hand-solution goldens of the Phase 2 slice (tests/golden/level_NNN.hand.json, docs/TECH_DESIGN.md §9.5; D-059) for
 * the harness: the drag moves of each level's log, in order. The same file the Vitest golden replay checks against
 * `GameSession`; here the moves are played through the real input path instead. Bundled only into the harness build.
 */
import { asSessionActions } from '../services/save.ts';
import type { StoredAction } from '../services/save.ts';
import type { DragMove } from './api.ts';

const FILES = import.meta.glob<{ readonly level: number; readonly log: readonly StoredAction[] }>(
  '../../tests/golden/level_*.hand.json',
  { eager: true, import: 'default' },
);

const BY_LEVEL: ReadonlyMap<number, readonly DragMove[]> = new Map(
  Object.values(FILES).map((g) => [
    g.level,
    asSessionActions(g.log).flatMap((a) => (a.kind === 'drag' ? [{ pieceId: a.pieceId, to: a.to }] : [])),
  ]),
);

/** Drag moves of the golden of level `id`; throws when the level has no golden. */
export function goldenMoves(id: number): DragMove[] {
  const moves = BY_LEVEL.get(id);
  if (!moves) throw new Error(`harness: no hand golden for level ${id}`);
  return [...moves];
}
