/**
 * Drag movement cost (docs/TECH_DESIGN.md §4.5, §10.7). Run: `npx vitest bench --run tests/core/movement.bench.ts`.
 * Vitest 5 runs `*.bench.ts` files only in benchmark mode (`bench` is a test-context fixture, not an export).
 *
 * Boards: (a) an 80 % full yard (39/48 cells, TECH §4.5 "%80 dolu saha"), the dragged block on top; (b) the empty
 * board worst case: B1 on an empty yard, wall height 8 with 3 open gaps → 80 FREE nodes + every rail node.
 */
import { test } from 'vitest';
import { FREE, beginDrag } from '../../src/core/movement.ts';
import type { DragSession } from '../../src/core/movement.ts';
import type { GameState } from '../../src/core/state.ts';
import { initialState } from '../fixtures/builders.ts';
import type { PieceSpec } from '../fixtures/builders.ts';

/** 80 % full yard: every cell blocked except 9 (top-row holes and a short shaft), dragged D2_90 at (2,7). */
function eightyPercentBoard(): GameState {
  const holes = new Set(['0,7', '1,7', '4,7', '5,7', '5,6', '5,5', '0,6', '4,6', '3,6']);
  const pieces: PieceSpec[] = [['D2_90', 'W', 2, 7]];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 6; x++) {
      if (holes.has(`${x},${y}`) || (y === 7 && (x === 2 || x === 3))) continue;
      pieces.push(['B1_0', 'W', x, y]);
    }
  }
  return initialState({ wall: { height: 4, gaps: [{ type: 'static', y: 1, size: 2 }] }, pieces });
}

function emptyBoard(): GameState {
  return initialState({
    wall: {
      height: 8,
      gaps: [
        { type: 'static', y: 0, size: 2 },
        { type: 'static', y: 3, size: 1 },
        { type: 'static', y: 5, size: 2 },
      ],
    },
    pieces: [['B1_0', 'W', 0, 0]],
  });
}

function session(s: GameState): DragSession {
  const d = beginDrag(s, 0);
  if (!d) throw new Error('bench board: piece 0 is not pickable');
  return d;
}

test('TECH §4.5 drag cost: BFS at pick time, nearest() per pointermove, follow() with a path', async ({
  bench,
}) => {
  const full = eightyPercentBoard();
  const empty = emptyBoard();
  const fullSession = session(full);
  const emptySession = session(empty);
  const following = session(empty);
  let flip = false;
  let x = 0;
  await bench.compare(
    bench(`beginDrag, 80 % full yard (|R| = ${fullSession.reachableCount})`, () => {
      beginDrag(full, 0);
    }),
    bench(`beginDrag, empty board + 3 gaps (|R| = ${emptySession.reachableCount})`, () => {
      beginDrag(empty, 0);
    }),
    bench('nearest(p), empty board (pointermove)', () => {
      x = (x + 0.37) % 8;
      emptySession.nearest(x, 4.6);
    }),
    bench('follow(p) to a far node: path + BFS from the new current', () => {
      flip = !flip;
      following.follow(flip ? 7 : 0, flip ? 0 : 9);
    }),
    bench('classify(current)', () => {
      emptySession.classify({ ix: 6, iy: 3, mode: FREE });
    }),
  );
});
