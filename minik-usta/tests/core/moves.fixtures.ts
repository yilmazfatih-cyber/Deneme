/**
 * Shared helpers of the move pipeline tests (moves, site, delivery, goals, combo, session). Not a test file.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import { ArraySink, applyMove } from '../../src/core/moves.ts';
import type { ApplyOptions, MoveResult } from '../../src/core/moves.ts';
import { loadLevel } from '../../src/core/level/compile.ts';
import type { CompiledLevel } from '../../src/core/level/compile.ts';
import { FREE, railMode } from '../../src/core/movement.ts';
import { stateInvariantErrors } from '../../src/core/grid.ts';
import type { GameState } from '../../src/core/state.ts';
import type { DragNode, GameEvent, GameEventType, Move, PieceId } from '../../src/core/types.ts';

export const N = (ix: number, iy: number): DragNode => ({ ix, iy, mode: FREE });
export const RAIL = (gap: number, ix: number, iy: number): DragNode => ({ ix, iy, mode: railMode(gap) });

/** A drag move to a FREE node (or a rail node when `gap` is given). */
export function dragTo(pieceId: PieceId, ix: number, iy: number, gap?: number): Move {
  return { kind: 'drag', pieceId, to: gap === undefined ? N(ix, iy) : RAIL(gap, ix, iy) };
}

export interface Ran {
  readonly res: MoveResult;
  readonly ev: GameEvent[];
}

/** `applyMove` with an ArraySink; strict by default (an invalid record throws). */
export function run(s: GameState, move: Move, opts: ApplyOptions = {}): Ran {
  const sink = new ArraySink();
  const res = applyMove(s, move, sink, { strict: true, ...opts });
  return { res, ev: sink.events };
}

/** Event types in order. */
export function types(ev: readonly GameEvent[]): GameEventType[] {
  return ev.map((e) => e.t);
}

/** The first event of type `t` (narrowed); throws when there is none. */
export function find<T extends GameEventType>(ev: readonly GameEvent[], t: T): Extract<GameEvent, { t: T }> {
  const e = ev.find((x) => x.t === t);
  if (!e) throw new Error(`no ${t} event in [${types(ev).join(', ')}]`);
  return e as Extract<GameEvent, { t: T }>;
}

export function expectConsistent(s: GameState): void {
  expect(stateInvariantErrors(s)).toEqual([]);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** `levels/level_NNN.json`, loaded like the game does (schema + runtime checks). */
export function levelFile(id: number): CompiledLevel {
  const json: unknown = JSON.parse(
    readFileSync(join(ROOT, 'levels', `level_${String(id).padStart(3, '0')}.json`), 'utf8'),
  );
  const loaded = loadLevel(json);
  if (!loaded.ok) throw new Error(`level ${id} does not load: ${JSON.stringify(loaded.issues)}`);
  return loaded.level;
}

/**
 * LEVELS §2 hand solutions of levels 1, 3 and 5 as drag moves ("over the wall to x = c" = release at crane row 8 above
 * column c; "through the gap" = the rail node). Piece ids: batch 0 in table order, then truck batches (`k1_i`).
 */
export const HAND: Readonly<Record<1 | 3 | 5, readonly Move[]>> = {
  1: [dragTo(0, 6, 8), dragTo(1, 6, 8), dragTo(2, 7, 8)],
  3: [dragTo(0, 6, 8), dragTo(1, 6, 2, 0), dragTo(2, 6, 8)],
  // 13 = k1_0, 14 = k1_1, 15 = k1_2, 16 = k1_3
  5: [
    dragTo(2, 6, 8),
    dragTo(1, 6, 8),
    dragTo(0, 6, 8),
    dragTo(15, 6, 8),
    dragTo(16, 6, 8),
    dragTo(14, 6, 8),
  ],
};
