/**
 * Fall shadow and placement cost (docs/TECH_DESIGN.md §4.5 "düşüş gölgesi", §10.7 item 9). Run:
 * `npx vitest bench --run tests/core/gravity.bench.ts`. The shadow calls `computeFall` on every drag-node change, so it
 * must stay far below the ≤ 0.05 ms pointermove budget (§1.4); `settleYard` runs once per move (K-35 step 6).
 */
import { test } from 'vitest';
import { computeFall, settleYard } from '../../src/core/gravity.ts';
import { buildFront, isCorrectPlacement } from '../../src/core/placement.ts';
import { blockCells } from '../../src/core/movement.ts';
import { PF, cloneState, setFlag, setPieceField } from '../../src/core/state.ts';
import type { GameState } from '../../src/core/state.ts';
import { occupyPiece, refreshSiteMasks, vacatePiece } from '../../src/core/grid.ts';
import { shapeById } from '../../src/core/shapes.ts';
import { Zone } from '../../src/core/types.ts';
import { initialState } from '../fixtures/builders.ts';
import type { PieceSpec } from '../fixtures/builders.ts';

/** Half-built 8-row plan: columns filled to rows 3 and 1, the dragged O4 in the yard. */
function siteBoard(): GameState {
  const s = initialState({
    plan: ['WW', 'WW', 'W.', 'WW', 'WW', 'WW', 'WW', 'WW'],
    pieces: [
      ['O4_0', 'W', 0, 0],
      ['I4_0', 'W', 1, 0],
      ['D2_0', 'W', 2, 0],
    ],
  });
  const put = (id: number, x: number) => {
    vacatePiece(s, id);
    setPieceField(s, id, PF.zone, Zone.site);
    setPieceField(s, id, PF.x, x);
    setPieceField(s, id, PF.y, 0);
    setPieceField(s, id, PF.seg, 0);
    setFlag(s, id, 'locked', true);
    occupyPiece(s, id);
  };
  put(1, 6);
  put(2, 7);
  refreshSiteMasks(s, 0);
  return s;
}

/** Yard gravity on, 40 B1 blocks stacked in 6 columns, the bottom row removed: everything falls one row. */
function yardBoard(): GameState {
  const pieces: PieceSpec[] = [];
  for (let y = 0; y < 7; y++)
    for (let x = 0; x < 6; x++) if (pieces.length < 40) pieces.push(['B1_0', 'W', x, y]);
  const s = initialState({ gravity: { yard: true }, pieces });
  for (let id = 0; id < 6; id++) {
    vacatePiece(s, id);
    setPieceField(s, id, PF.zone, Zone.gone);
  }
  return s;
}

test('TECH §4.5 shadow cost: computeFall per node change, isCorrectPlacement, buildFront; settleYard per move', async ({
  bench,
}) => {
  const s = siteBoard();
  const yard = yardBoard();
  const cells = blockCells(shapeById('O4_0'), 6, 4);
  let iy = 4;
  await bench.compare(
    bench('computeFall (FREE, O4 over a half-built plan)', () => {
      iy = iy === 9 ? 4 : iy + 1;
      computeFall(s, 0, { ix: 6, iy: Math.min(iy, 8), mode: 0 });
    }),
    bench('isCorrectPlacement (O4, support check)', () => {
      isCorrectPlacement(s, 0, cells);
    }),
    bench('buildFront', () => {
      buildFront(s);
    }),
    bench('settleYard (34 blocks fall one row)', () => {
      settleYard(cloneState(yard));
    }),
  );
});
