/**
 * Independent rule review, rounds 1–3 (reviewer, not the author): drag movement against docs/GDD.md K-04, K-05,
 * K-07…K-13, the R-03 edge model (§0) and the related E-xx edge cases. Every expectation is derived from the GDD /
 * OBSTACLES / TECH_DESIGN text and worked examples, not from the implementation. Only public APIs are used:
 * movement.ts (drag sessions), coords.ts (boundary masks, neighbourhood), grid.ts (collision masks, column tops),
 * moves.ts (`applyMove`, to build real states and to check K-07 costs), gravity.ts (`computeFall`, the K-11 shadow)
 * and the test fixture builders. Round 2 (bottom of the file) adds two-gap boards, gap hooks, row-0 gaps,
 * cancel-only picks, crane transit, later-segment debris, debris drag signals and straddles under an overhang.
 * Round 3 (areas the round-2 fixes touched) adds the K-05 `blockedByWallHeight` box-height rule (shape × height sweep,
 * rail-only tall blocks, S4/T4 hooks over the wall top), two-way edges back to a start without open sky, debris that
 * moves only along its rail, N14 rail blocking, K-08 tie-break 4 and off-grid targets, interleaved sessions on
 * different levels, gap hooks frozen at pick time, an independent K-09 (a) oracle on the Bölüm 1–5 start boards and
 * the Bölüm 1/3/4 tutorial hand paths (GDD §14.1).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FREE, railMode, tryBeginDrag } from '../../src/core/movement.ts';
import type { DragRules, DragSession } from '../../src/core/movement.ts';
import {
  closedBoundaryMask,
  inGrid,
  isCraneCell,
  isSiteCell,
  isYardCell,
  neighbors4,
  openFreeMask,
  openRailMask,
  rowRangeMask,
  sideOf,
  straddlesBoundary,
} from '../../src/core/coords.ts';
import { applyMove } from '../../src/core/moves.ts';
import { computeFall } from '../../src/core/gravity.ts';
import { collisionMasks, siteColumnTops } from '../../src/core/grid.ts';
import {
  H,
  createInitialState,
  hasFlag,
  hdr,
  pieceShape,
  pieceX,
  pieceY,
  pieceZone,
} from '../../src/core/state.ts';
import { loadLevel } from '../../src/core/level/compile.ts';
import type { GameState } from '../../src/core/state.ts';
import { FORBIDDEN_SHAPES, SHAPES, shapeById, shapeByIndex } from '../../src/core/shapes.ts';
import { Zone } from '../../src/core/types.ts';
import type { DragNode, PieceId, ShapeId } from '../../src/core/types.ts';
import { initialState } from '../fixtures/builders.ts';
import type { LevelSpec, PieceSpec } from '../fixtures/builders.ts';

// --- helpers -----------------------------------------------------------------------------------------------------------

const F = (ix: number, iy: number): DragNode => ({ ix, iy, mode: FREE });
const RL = (gap: number, ix: number, iy: number): DragNode => ({ ix, iy, mode: railMode(gap) });
const name = (n: DragNode): string => `${n.mode === FREE ? 'F' : `R${n.mode - 1}`}(${n.ix},${n.iy})`;
const names = (list: readonly DragNode[]): string[] => list.map(name);

function grab(s: GameState, id: PieceId): DragSession {
  const attempt = tryBeginDrag(s, id);
  if (!attempt.ok) throw new Error(`piece ${id} cannot be picked: ${attempt.reason}`);
  return attempt.session;
}

/** Every yard cell not covered by `pieces` and not listed in `empty` gets a B1 blocker (a ≥ 80 % full yard, K-02). */
function fullYard(
  pieces: readonly PieceSpec[],
  empty: readonly (readonly [number, number])[] = [],
): PieceSpec[] {
  const taken = new Set<string>(empty.map(([x, y]) => `${x},${y}`));
  for (const [shape, , x, y] of pieces)
    for (const c of shapeById(shape).cells) taken.add(`${x + c.x},${y + c.y}`);
  const out: PieceSpec[] = [...pieces];
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 6; x++) if (!taken.has(`${x},${y}`)) out.push(['B1_0', 'W', x, y]);
  return out;
}

/** Board cells of `shape` anchored at `node`. */
function cellsAt(shape: ShapeId, node: DragNode): { x: number; y: number }[] {
  return shapeById(shape).cells.map((c) => ({ x: node.ix + c.x, y: node.iy + c.y }));
}

/**
 * GDD K-07 release table, written from the text over the block's cells (rows tried top-down, first match wins).
 * `isStart` = same cells and one of the start modes (row 1).
 */
function gddReleaseRow(
  cells: readonly { x: number; y: number }[],
  mode: number,
  isStart: boolean,
  closed: boolean,
) {
  if (isStart) return 1;
  const yard = cells.every((c) => c.x <= 5);
  const site = cells.every((c) => c.x >= 6);
  if (mode === FREE && yard && cells.every((c) => c.y <= 7)) return 2;
  if (mode === FREE && yard) return 3;
  if (!yard && !site) return 4;
  if (site && closed) return 5;
  if (site && mode === FREE) return 6;
  if (site && mode !== FREE) return 7;
  return -1;
}

const NO_HELP = { noTruckHelp: true } as const;
const drop = (pieceId: PieceId, to: DragNode) => ({ kind: 'drag' as const, pieceId, to });

/** Bölüm 3 start yard (levels/level_003.json, copied so a later data edit does not change this review). */
const LEVEL3_YARD: PieceSpec[] = [
  ['O4_0', 'W', 0, 6],
  ['D2_90', 'Y', 4, 2],
  ['D2_90', 'G', 2, 7],
  ['D2_90', 'G', 2, 6],
  ['D2_0', 'Y', 4, 6],
  ['D2_0', 'G', 5, 6],
  ['O4_0', 'G', 0, 4],
  ['O4_0', 'W', 2, 4],
  ['O4_0', 'G', 4, 4],
  ['D2_90', 'G', 4, 3],
  ['O4_0', 'Y', 0, 2],
  ['O4_0', 'W', 2, 2],
  ['O4_0', 'W', 0, 0],
  ['O4_0', 'G', 2, 0],
  ['O4_0', 'Y', 4, 0],
];
const LEVEL3: LevelSpec = {
  id: 3,
  wall: { height: 6, gaps: [{ type: 'static', y: 2, size: 2 }] },
  plan: ['GG', 'YY', 'WW', 'WW'],
  moves: 11,
  pieces: LEVEL3_YARD,
};
/** Bölüm 4 start yard (levels/level_004.json). */
const LEVEL4: LevelSpec = {
  id: 4,
  wall: { height: 6, gaps: [{ type: 'static', y: 3, size: 2 }] },
  plan: ['RR', 'WW', 'W.', 'WW', 'YY'],
  moves: 12,
  pieces: [
    ['D2_90', 'Y', 0, 7],
    ['C3_0', 'W', 2, 6],
    ['D2_90', 'W', 4, 3],
    ['D2_90', 'R', 4, 7],
    ['D2_90', 'R', 0, 6],
    ['D2_90', 'Y', 4, 6],
    ['O4_0', 'W', 0, 4],
    ['O4_0', 'R', 2, 4],
    ['O4_0', 'Y', 4, 4],
    ['O4_0', 'Y', 0, 2],
    ['O4_0', 'W', 2, 2],
    ['D2_90', 'R', 4, 2],
    ['O4_0', 'R', 0, 0],
    ['O4_0', 'Y', 2, 0],
    ['O4_0', 'W', 4, 0],
  ],
};

const CANONICAL = SHAPES.filter((sh) => sh.index === sh.canonicalIndex && !FORBIDDEN_SHAPES.has(sh.id));

// --- R-03 / K-04 wall boundary -----------------------------------------------------------------------------------------

describe('R-03 K-04 zero-width wall boundary', () => {
  it('K-04 GDD example: height 6, gap y=2 size 2 → rows 0–1 closed, 2–3 gap (rail only), 4–5 closed, 6–9 open', () => {
    const gapRows = openRailMask(2, 2, true);
    expect(gapRows).toBe(0b1100);
    expect(closedBoundaryMask(6, gapRows)).toBe(0b110011);
    expect(openFreeMask(6)).toBe(0b1111000000);
    // a closed gap opens nothing: all six wall rows are closed, rail mask empty
    expect(openRailMask(2, 2, false)).toBe(0);
    expect(closedBoundaryMask(6, 0)).toBe(0b111111);
    expect(rowRangeMask(6, 4)).toBe(openFreeMask(6));

    // the same rows seen by a dragged B1: a FREE step across exactly at y ≥ 6, a RAIL step exactly at y 2–3
    const s = initialState({
      wall: { height: 6, gaps: [{ type: 'static', y: 2, size: 2 }] },
      pieces: [['B1_0', 'W', 0, 0]],
    });
    const d = grab(s, 0);
    for (let y = 0; y <= 9; y++) {
      const out = names(d.neighbours(F(5, y)));
      expect(out.includes(`F(6,${y})`), `FREE right at row ${y}`).toBe(y >= 6);
      expect(out.includes(`R0(6,${y})`), `RAIL right at row ${y}`).toBe(y === 2 || y === 3);
      expect(d.isReachable(F(6, y)), `site column reachable at row ${y}`).toBe(true);
      expect(names(d.neighbours(F(6, y))).includes(`F(5,${y})`), `FREE left at row ${y}`).toBe(y >= 6);
    }
  });

  it('K-04 height 0: no boundary row is closed and a B1 at (5,0) steps straight onto the site', () => {
    expect(closedBoundaryMask(0, 0)).toBe(0);
    const d = grab(initialState({ wall: { height: 0 }, pieces: [['B1_0', 'W', 5, 0]] }), 0);
    expect(names(d.neighbours(F(5, 0)))).toContain('F(6,0)');
    expect(d.distanceFromStart(F(6, 0))).toBe(1);
    expect(d.classify(F(6, 0))).toMatchObject({ kind: 'siteFree', row: 6 });
  });

  it('E-46 x = 5 and x = 6 are never 4-neighbours, in any row (§0: neighbourhood never crosses the boundary)', () => {
    for (let y = 0; y <= 7; y++) {
      const of5 = neighbors4(5, y).map((a) => `${a.ix},${a.iy}`);
      const of6 = neighbors4(6, y).map((a) => `${a.ix},${a.iy}`);
      expect(of5, `(5,${y})`).not.toContain(`6,${y}`);
      expect(of5, `(5,${y})`).toContain(`4,${y}`);
      expect(of6, `(6,${y})`).not.toContain(`5,${y}`);
      expect(of6, `(6,${y})`).toContain(`7,${y}`);
    }
  });
});

// --- K-05 crane area and the open height ---------------------------------------------------------------------------

describe('K-05 crane area', () => {
  it('K-05 open height: a block crosses the wall in FREE mode iff its height h ≤ 10 − wall.height; heavy blocks never (Y5, N6)', () => {
    for (const shape of CANONICAL) {
      for (let height = 0; height <= 8; height++) {
        const d = grab(initialState({ wall: { height }, pieces: [[shape.id, 'W', 0, 0]] }), 0);
        const onSite = d.reachableNodes().some((n) => n.mode === FREE && n.ix >= 6);
        expect(onSite, `${shape.id} at wall height ${height}`).toBe(!shape.heavy && shape.h <= 10 - height);
      }
    }
  });

  it('K-05 GDD example: at height 7 an I3_0 crosses only with anchor row 7 (cells 7, 8, 9); at height 8 it never crosses', () => {
    const at7 = grab(initialState({ wall: { height: 7 }, pieces: [['I3_0', 'W', 5, 0]] }), 0);
    for (let y = 0; y <= 7; y++)
      expect(names(at7.neighbours(F(5, y))).includes(`F(6,${y})`), `anchor row ${y}`).toBe(y === 7);
    expect(at7.isReachable(F(6, 0))).toBe(true);
    const at8 = grab(initialState({ wall: { height: 8 }, pieces: [['I3_0', 'W', 5, 0]] }), 0);
    expect(at8.isReachable(F(5, 7))).toBe(true); // highest anchor: cells 7–9
    expect(at8.isReachable(F(5, 8))).toBe(false); // K-01: a cell at y = 10 does not exist
    expect(at8.reachableNodes().filter((n) => n.ix + at8.shape.w - 1 >= 6)).toEqual([]);
  });

  it('K-05 K-07 row 3: every FREE node over the yard with a cell in rows 8–9 cancels, every one with all cells ≤ 7 is row 2 (K-01 D2_0 example)', () => {
    const shapes: ShapeId[] = ['B1_0', 'D2_0', 'I4_0', 'L4_180', 'C3_180', 'T4_0', 'D2_90'];
    for (const shape of shapes) {
      const d = grab(initialState({ wall: { height: 8 }, pieces: [[shape, 'W', 0, 0]] }), 0);
      const sh = shapeById(shape);
      let crane = 0;
      for (const n of d.reachableNodes()) {
        if (n.mode !== FREE || n.ix + sh.w - 1 > 5 || (n.ix === 0 && n.iy === 0)) continue;
        const top = n.iy + sh.h - 1;
        if (top >= 8) crane++;
        expect(d.classify(n), `${shape} ${name(n)}`).toMatchObject(
          top >= 8 ? { kind: 'cancel', reason: 'craneOverYard', row: 3 } : { kind: 'yard', row: 2 },
        );
      }
      expect(crane, shape).toBeGreaterThan(0);
    }
    // K-01 example: D2_0 anchored at (3,8) is a position, anchored at (3,9) is not
    const d2 = grab(initialState({ pieces: [['D2_0', 'W', 3, 0]] }), 0);
    expect(d2.isReachable(F(3, 8))).toBe(true);
    expect(d2.isReachable(F(3, 9))).toBe(false);
  });

  it('K-05 Y5 example: heavy I5_0 at (0,7) lifted to (1,8) cancels; slid to (1,7) with (5,7) empty is a yard move; it never reaches x = 6', () => {
    const s = initialState({ id: 8, pieces: fullYard([['I5_0', 'W', 0, 7]], [[5, 7]]) });
    const d = grab(s, 0);
    expect(d.classify(F(1, 8))).toMatchObject({ kind: 'cancel', reason: 'craneOverYard', row: 3 });
    expect(d.classify(F(1, 7))).toMatchObject({ kind: 'yard', row: 2 });
    expect(d.isReachable(F(2, 7))).toBe(false);
    expect(d.reachableNodes().every((n) => n.mode === FREE && n.ix + 5 <= 6)).toBe(true);
  });
});

// --- K-07 release table and costs ----------------------------------------------------------------------------------

describe('K-07 release table', () => {
  it('K-07 GDD example: B1 from (2,6) released in the crane area at (2,8) cancels (12 → 12, state unchanged); released at the empty (4,7) it is a yard move (12 → 11)', () => {
    const s = initialState({
      moves: 12,
      wall: { height: 6 },
      pieces: fullYard(
        [['B1_0', 'Y', 2, 6]],
        [
          [2, 7],
          [4, 7],
        ],
      ),
    });
    const d = grab(s, 0);
    expect(d.classify(F(2, 8))).toMatchObject({ kind: 'cancel', reason: 'craneOverYard', row: 3 });
    expect(d.classify(F(4, 7))).toMatchObject({ kind: 'yard', row: 2 });

    const before = s.buf.slice();
    const cancelled = applyMove(s, drop(0, F(2, 8)), undefined, NO_HELP);
    expect(cancelled).toMatchObject({ status: 'cancelled', reason: 'craneOverYard' });
    expect(hdr(s, H.movesLeft)).toBe(12);
    expect(Array.from(s.buf)).toEqual(Array.from(before)); // "İptal edilen bırakmada hiçbir durum değişmez"

    const placed = applyMove(s, drop(0, F(4, 7)), undefined, NO_HELP);
    expect(placed.status).toBe('applied');
    expect(hdr(s, H.movesLeft)).toBe(11);
    expect([pieceX(s, 0), pieceY(s, 0), pieceZone(s, 0)]).toEqual([4, 7, Zone.yard]);
  });

  it('K-07 the table, applied top-down over the cells, gives the class of every reachable node (Bölüm 3 and 4 layouts, an open two-gap board)', () => {
    const boards: LevelSpec[] = [
      LEVEL3,
      LEVEL4,
      {
        wall: {
          height: 7,
          gaps: [
            { type: 'static', y: 1, size: 2 },
            { type: 'static', y: 4, size: 2 },
          ],
        },
        pieces: [
          ['D2_90', 'W', 0, 0],
          ['C3_180', 'Y', 3, 0],
          ['L4_0', 'G', 0, 4],
          ['B1_0', 'R', 4, 5],
          ['C3_90', 'W', 2, 3],
        ],
      },
    ];
    const seen = new Set<number>();
    for (const spec of boards) {
      const s = initialState(spec);
      const pieces = spec.pieces ?? [];
      pieces.forEach(([shape, , x, y], id) => {
        const attempt = tryBeginDrag(s, id);
        if (!attempt.ok) return;
        const d = attempt.session;
        for (const n of d.reachableNodes()) {
          const want = gddReleaseRow(
            cellsAt(shape, n),
            n.mode,
            n.mode === FREE && n.ix === x && n.iy === y,
            false,
          );
          const got = d.classify(n);
          expect(got.row, `piece ${id} ${shape} ${name(n)}`).toBe(want);
          seen.add(want);
        }
      });
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 6, 7]);
  });

  it('K-07 row 5 / E-27: build complete but a clear goal open → every site release is cancelled at no cost; yard moves still cost 1', () => {
    const s = initialState({
      moves: 10,
      wall: { height: 2 },
      plan: ['WW'],
      goals: [{ type: 'build' }, { type: 'clear', target: 'crate', count: 1 }],
      obstacles: [{ type: 'crate', x: 0, y: 0 }],
      pieces: [
        ['D2_90', 'W', 2, 0],
        ['B1_0', 'Y', 4, 0],
        ['D2_90', 'Y', 2, 3],
      ],
    });
    const first = applyMove(s, drop(0, F(6, 2)), undefined, NO_HELP);
    expect(first).toMatchObject({ status: 'applied', won: false });
    expect(hasFlag(s, 0, 'locked')).toBe(true);
    expect(hdr(s, H.movesLeft)).toBe(9);

    const d = grab(s, 1);
    expect(d.classify(F(6, 8))).toMatchObject({ kind: 'cancel', reason: 'siteClosed', row: 5 });
    expect(d.classify(F(7, 1))).toMatchObject({ kind: 'cancel', reason: 'siteClosed', row: 5 });
    // rows 2–4 are tried before row 5
    expect(d.classify(F(4, 1))).toMatchObject({ kind: 'yard', row: 2 });
    expect(grab(s, 2).classify(F(5, 8))).toMatchObject({ reason: 'straddle', row: 4 });
    const before = s.buf.slice();
    expect(applyMove(s, drop(1, F(7, 8)), undefined, NO_HELP)).toMatchObject({
      status: 'cancelled',
      reason: 'siteClosed',
    });
    expect(Array.from(s.buf)).toEqual(Array.from(before));
    expect(applyMove(s, drop(1, F(4, 1)), undefined, NO_HELP).status).toBe('applied');
    expect(hdr(s, H.movesLeft)).toBe(8);
  });

  it('K-07 E-06 E-28 a release straddling the boundary (half-way through a gap, or over the wall in the crane rows) is cancelled and changes nothing', () => {
    const s = initialState({
      moves: 7,
      wall: { height: 6, gaps: [{ type: 'static', y: 2, size: 1 }] },
      pieces: [['D2_90', 'W', 3, 2]],
    });
    const d = grab(s, 0);
    expect(d.isReachable(RL(0, 5, 2))).toBe(true);
    expect(d.isReachable(F(5, 8))).toBe(true);
    expect(d.isReachable(F(5, 6))).toBe(true); // above the wall top: also a straddle
    const before = Array.from(s.buf);
    for (const node of [RL(0, 5, 2), F(5, 8), F(5, 6)]) {
      expect(applyMove(s, drop(0, node), undefined, NO_HELP), name(node)).toMatchObject({
        status: 'cancelled',
        reason: 'straddle',
      });
      expect(Array.from(s.buf), name(node)).toEqual(before);
    }
  });

  it('E-30 after the last move the counter is 0 and no block can be picked', () => {
    const s = initialState({
      moves: 1,
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'W', 3, 0],
      ],
    });
    const r = applyMove(s, drop(0, F(1, 0)), undefined, NO_HELP);
    expect(r).toMatchObject({ status: 'applied', outOfMoves: true });
    expect(hdr(s, H.movesLeft)).toBe(0);
    expect(tryBeginDrag(s, 0)).toEqual({ ok: false, reason: 'noMoves' });
    expect(tryBeginDrag(s, 1)).toEqual({ ok: false, reason: 'noMoves' });
  });
});

// --- K-08 path rule and sticky follow ------------------------------------------------------------------------------

describe('K-08 path rule and sticky follow', () => {
  it('K-08 GDD example on a full yard: finger over the filled (2,3) keeps B1 at (2,6); finger at (3,9) → (2,7), (2,8), (3,8), (3,9)', () => {
    const s = initialState({ wall: { height: 6 }, pieces: fullYard([['B1_0', 'Y', 2, 6]], [[2, 7]]) });
    const d = grab(s, 0);
    const stay = d.follow(2, 3);
    expect(stay.changed).toBe(false);
    expect(d.current).toEqual(F(2, 6));
    const go = d.follow(3, 9);
    expect(names(go.path)).toEqual(['F(2,7)', 'F(2,8)', 'F(3,8)', 'F(3,9)']);
    expect(d.current).toEqual(F(3, 9));
  });

  it('K-08 the block never passes through the wall: B1 at (5,2) aimed at (6,2) climbs to row 6 (= height), crosses there and comes down', () => {
    const d = grab(initialState({ wall: { height: 6 }, pieces: [['B1_0', 'W', 5, 2]] }), 0);
    const r = d.follow(6, 2);
    expect(names(r.path)).toEqual([
      'F(5,3)',
      'F(5,4)',
      'F(5,5)',
      'F(5,6)',
      'F(6,6)',
      'F(6,5)',
      'F(6,4)',
      'F(6,3)',
      'F(6,2)',
    ]);
    expect(r.crossedWall).toBe(true);
    expect(d.classify()).toMatchObject({ kind: 'siteFree', row: 6 });
  });

  it('K-08 hysteresis works in both directions: a 0.1 improvement never moves the block back, a 0.3 improvement does', () => {
    const d = grab(initialState({ pieces: [['B1_0', 'W', 2, 2]] }), 0);
    expect(d.follow(2.7, 2).node).toEqual(F(3, 2)); // 0.49 → 0.09
    expect(d.follow(2.5, 2).changed).toBe(false); // exact tie: stays
    expect(d.follow(2.45, 2).changed).toBe(false); // 0.3025 vs 0.2025: only 0.1 better
    expect(d.current).toEqual(F(3, 2));
    expect(d.follow(2.35, 2).node).toEqual(F(2, 2)); // 0.4225 vs 0.1225
  });

  it('K-08 tie-break 1 beats tie-breaks 3 and 4: at equal distance the node fewer BFS steps away wins even with larger x or larger y', () => {
    const d = grab(initialState({ pieces: [['B1_0', 'W', 0, 0]] }), 0);
    d.moveTo(F(5, 8));
    // (3,8) and (4,8) are both 0.25 away from p; (4,8) is 1 step from (5,8), (3,8) is 2
    expect(d.distanceFromCurrent(F(4, 8))).toBe(1);
    expect(d.distanceFromCurrent(F(3, 8))).toBe(2);
    expect(d.follow(3.5, 8).node).toEqual(F(4, 8));
    const e = grab(initialState({ pieces: [['B1_0', 'W', 0, 0]] }), 0);
    e.moveTo(F(2, 9));
    // (2,7) and (2,8) are both 0.25 away; (2,8) is 1 step, (2,7) is 2
    expect(e.follow(2, 7.5).node).toEqual(F(2, 8));
  });

  it('K-08 tie-break 3 before 4: equal distance, equal BFS steps, same mode → the smaller y wins over the smaller x', () => {
    const s = initialState({
      pieces: [
        ['B1_0', 'W', 3, 4],
        ['B1_0', 'W', 1, 2],
        ['B1_0', 'W', 2, 3],
      ],
    });
    const d = grab(s, 0);
    // p = (1.5, 2.5): (1,2) and (2,3) are blocked; (1,3) and (2,2) are both 0.5 away and 3 steps from (3,4)
    expect(d.distanceFromCurrent(F(1, 3))).toBe(3);
    expect(d.distanceFromCurrent(F(2, 2))).toBe(3);
    expect(d.nearest(1.5, 2.5)).toEqual(F(2, 2));
    expect(d.follow(1.5, 2.5).node).toEqual(F(2, 2));
  });

  it('K-08 a rail block does not snap to the FREE position with the same cells (tie-break 1 keeps it on the rail)', () => {
    const d = grab(
      initialState({
        wall: { height: 5, gaps: [{ type: 'static', y: 3, size: 1 }] },
        pieces: [['B1_0', 'W', 5, 3]],
      }),
      0,
    );
    expect(d.follow(6, 3).node).toEqual(RL(0, 6, 3)); // 1 step through the gap, FREE (6,3) is 5 steps over the wall
    expect(d.isReachable(F(6, 3))).toBe(true);
    expect(d.follow(6, 3.05).changed).toBe(false);
    expect(d.classify()).toMatchObject({ kind: 'siteRail', row: 7 });
  });
});

// --- K-09 pick gate --------------------------------------------------------------------------------------------------

describe('K-09 pickability', () => {
  it('K-09 (a) full yard (Bölüm 3 layout): exactly the blocks with an open top, a side above the wall or a face on the gap can be picked', () => {
    const s = initialState(LEVEL3);
    const pickable = LEVEL3_YARD.map((_, id) => id).filter((id) => tryBeginDrag(s, id).ok);
    // 0 O4 W (0,6) top, 2 D2_90 G (2,7) top, 4 D2_0 Y (4,6) top, 5 D2_0 G (5,6) top + side at rows 6–7,
    // 1 D2_90 Y (4,2) and 9 D2_90 G (4,3) face the gap rows 2–3
    expect(pickable).toEqual([0, 1, 2, 4, 5, 9]);
    expect(names(grab(s, 1).reachableNodes())).toEqual(['F(4,2)', 'R0(5,2)', 'R0(6,2)']);
    expect(names(grab(s, 9).reachableNodes())).toEqual(['F(4,3)', 'R0(5,3)', 'R0(6,3)']);
    expect(grab(s, 5).isReachable(F(6, 6))).toBe(true);
    for (const id of [3, 6, 7, 8, 10, 11, 12, 13, 14])
      expect(tryBeginDrag(s, id), `piece ${id}`).toEqual({ ok: false, reason: 'immovable' });
  });

  it('K-09 (a) a block whose only free face is a closed wall row is stuck; facing an open gap it fits it moves; facing a gap it does not fit it is stuck', () => {
    const wall = { height: 6, gaps: [{ type: 'static' as const, y: 2, size: 1 }] };
    const closedRow = initialState({ wall, pieces: fullYard([['B1_0', 'Y', 5, 4]]) });
    expect(tryBeginDrag(closedRow, 0)).toEqual({ ok: false, reason: 'immovable' });
    const fits = initialState({ wall, pieces: fullYard([['B1_0', 'Y', 5, 2]]) });
    expect(names(grab(fits, 0).reachableNodes())).toEqual(['F(5,2)', 'R0(6,2)', 'R0(7,2)']);
    const tooTall = initialState({ wall, pieces: fullYard([['D2_0', 'Y', 5, 2]]) });
    expect(tryBeginDrag(tooTall, 0)).toEqual({ ok: false, reason: 'immovable' });
  });

  it('K-09 (a) a site block boxed in by the wall, a block above and a block beside cannot be picked; freeing the side lets it move', () => {
    const boxed = initialState({
      wall: { height: 4 },
      plan: ['WW', 'WW'],
      pieces: [['B1_0', 'W', 0, 0]],
      debris: [
        ['B1_0', 'R', 6, 0],
        ['B1_0', 'R', 6, 1],
        ['B1_0', 'R', 7, 0],
      ],
    });
    expect(tryBeginDrag(boxed, 1)).toEqual({ ok: false, reason: 'immovable' });
    const open = initialState({
      wall: { height: 4 },
      plan: ['WW', 'WW'],
      pieces: [['B1_0', 'W', 0, 0]],
      debris: [
        ['B1_0', 'R', 6, 0],
        ['B1_0', 'R', 6, 1],
      ],
    });
    const d = grab(open, 1);
    expect(d.isReachable(F(7, 0))).toBe(true);
    expect(names(d.neighbours(F(6, 0)))).toEqual(['F(7,0)']); // row 0 of the wall is closed, (6,1) is taken
  });
});

// --- K-10 yard ---------------------------------------------------------------------------------------------------------

describe('K-10 yard repositioning', () => {
  it('K-10 GDD example: O4 (2,6) → (4,6) is one move and, with yard gravity off, stays hanging over the empty (4,4)–(5,5)', () => {
    const s = initialState({
      moves: 20,
      gravity: { yard: false },
      pieces: fullYard(
        [['O4_0', 'Y', 2, 6]],
        [
          [4, 6],
          [5, 6],
          [4, 7],
          [5, 7],
          [4, 5],
          [5, 5],
          [4, 4],
          [5, 4],
        ],
      ),
    });
    const d = grab(s, 0);
    expect(d.classify(F(4, 6))).toMatchObject({ kind: 'yard', row: 2 });
    expect(d.classify(F(4, 4))).toMatchObject({ kind: 'yard', row: 2 });
    expect(d.isReachable(F(4, 3))).toBe(false);
    expect(applyMove(s, drop(0, F(4, 6)), undefined, NO_HELP).status).toBe('applied');
    expect([pieceX(s, 0), pieceY(s, 0)]).toEqual([4, 6]);
    expect(hdr(s, H.movesLeft)).toBe(19);
  });
});

// --- K-11 over the wall ----------------------------------------------------------------------------------------------

describe('K-11 entry over the wall (open sky)', () => {
  it('K-11 open sky is checked per covered column at its lowest cell: C3_180 hooks over a filled (6,0) down to anchor (6,0), D2_90 stops at (6,1)', () => {
    const s = initialState({
      wall: { height: 2 },
      plan: ['WW', 'WW'],
      pieces: [
        ['C3_180', 'W', 0, 0],
        ['D2_90', 'W', 2, 0],
        ['C3_0', 'W', 0, 3],
      ],
      debris: [['B1_0', 'R', 6, 0]],
    });
    expect(grab(s, 0).isReachable(F(6, 0))).toBe(true);
    const d2 = grab(s, 1);
    expect(d2.isReachable(F(6, 0))).toBe(false);
    expect(d2.isReachable(F(6, 1))).toBe(true);
    const c3 = grab(s, 2);
    expect(c3.isReachable(F(6, 0))).toBe(false);
    expect(c3.isReachable(F(6, 1))).toBe(true);
  });

  it('K-11 the column with the higher silhouette decides: with (7,1) filled, C3_0 (its x=7 cell at the bottom) stops at (6,2), C3_90 (x=7 cell one up) at (6,1)', () => {
    const s = initialState({
      wall: { height: 2 },
      plan: ['WW', 'WW', 'WW'],
      pieces: [
        ['C3_0', 'W', 0, 0],
        ['C3_90', 'W', 2, 0],
        ['B1_0', 'W', 4, 0],
      ],
      debris: [['B1_0', 'R', 7, 1]],
    });
    const lowest = (id: PieceId, ix: number): number => {
      const d = grab(s, id);
      for (let iy = 0; iy <= 9; iy++) if (d.isReachable(F(ix, iy))) return iy;
      return -1;
    };
    expect(lowest(0, 6)).toBe(2);
    expect(lowest(1, 6)).toBe(1);
    expect(lowest(2, 6)).toBe(0);
    expect(lowest(2, 7)).toBe(2);
  });

  it('K-11 in every site column the block can be lowered exactly down to its shadow (computeFall landing), never below', () => {
    const shapes: ShapeId[] = [
      'B1_0',
      'D2_90',
      'D2_0',
      'O4_0',
      'C3_0',
      'C3_90',
      'C3_180',
      'C3_270',
      'L4_0',
      'J4_180',
    ];
    let checked = 0;
    for (const shape of shapes) {
      const s = initialState({
        wall: { height: 4 },
        plan: ['WW', 'WW', 'WW', 'WW', 'WW', 'WW'],
        pieces: [[shape, 'W', 0, 0]],
        debris: [
          ['B1_0', 'R', 7, 3], // an overhang: (7,0)–(7,2) stay empty
          ['B1_0', 'R', 6, 1],
        ],
      });
      const d = grab(s, 0);
      const { w, h } = d.shape;
      for (let ix = 6; ix + w <= 8; ix++) {
        const landing = computeFall(s, 0, F(ix, 10 - h)).landing;
        expect(landing.ix, `${shape} column ${ix}`).toBe(ix);
        const reachable = [];
        for (let iy = 0; iy + h <= 10; iy++) if (d.isReachable(F(ix, iy))) reachable.push(iy);
        const expected = [];
        for (let iy = landing.iy; iy + h <= 10; iy++) expected.push(iy);
        expect(reachable, `${shape} column ${ix}`).toEqual(expected);
        checked++;
      }
    }
    expect(checked).toBe(12); // B1 and D2_0 have two anchor columns, the 2-wide shapes one
  });

  it('K-11 GDD example: empty site, plan h=3: D2_90 released at (6,8) lands at (6,0) with d = 8; lowered first to (6,1) it has d = 1', () => {
    const s = initialState({ wall: { height: 6 }, plan: ['WW', 'WW', 'YY'], pieces: [['D2_90', 'Y', 0, 0]] });
    const d = grab(s, 0);
    expect(d.isReachable(F(6, 8))).toBe(true);
    expect(d.isReachable(F(6, 1))).toBe(true);
    expect(d.classify(F(6, 1))).toMatchObject({ kind: 'siteFree', row: 6 });
    const high = computeFall(s, 0, F(6, 8));
    expect([high.mode, high.landing.ix, high.landing.iy, high.distance]).toEqual(['free', 6, 0, 8]);
    const low = computeFall(s, 0, F(6, 1));
    expect([low.landing.iy, low.distance]).toEqual([0, 1]);
  });

  it('K-11 K-22 after the S1 shift the drag sees the new, empty segment: the next block goes down to (6,0) again', () => {
    const s = initialState({
      wall: { height: 2 },
      plan: [['WW'], ['YY']],
      pieces: [
        ['D2_90', 'W', 0, 0],
        ['D2_90', 'Y', 2, 0],
      ],
    });
    expect(applyMove(s, drop(0, F(6, 2)), undefined, NO_HELP).status).toBe('applied');
    expect(hasFlag(s, 0, 'locked')).toBe(true);
    expect(hdr(s, H.activeSeg)).toBe(1);
    const d = grab(s, 1);
    expect(d.isReachable(F(6, 0))).toBe(true);
    expect(d.classify(F(6, 0))).toMatchObject({ kind: 'siteFree', row: 6 });
    expect(tryBeginDrag(s, 0).ok).toBe(false); // the completed segment is in the panorama now (K-06, K-14)
  });

  it('K-11 a FREE block may cross back over the wall into the yard only in rows y ≥ height (debris at (6,4) over a 4-high wall: 1 step)', () => {
    const s = initialState({
      wall: { height: 4 },
      plan: ['WW', 'WW', 'WW', 'WW', 'WW'],
      pieces: [['B1_0', 'W', 0, 0]],
      debris: [
        ['B1_0', 'R', 6, 4],
        ['B1_0', 'R', 6, 3],
      ],
    });
    const yardPiece = grab(s, 0);
    expect(names(yardPiece.neighbours(F(6, 5)))).toContain('F(5,5)');
    const debris = grab(s, 1);
    expect(names(debris.neighbours(F(6, 4)))).toContain('F(5,4)');
    expect(debris.distanceFromStart(F(5, 4))).toBe(1);
    expect(debris.classify(F(5, 4))).toMatchObject({ kind: 'yard', row: 2 });
    // the debris below it sits in a closed wall row: no direct step left
    const low = grab(s, 2);
    expect(names(low.neighbours(F(6, 3)))).not.toContain('F(5,3)');
  });

  it('K-11 GDD §14.1 overWall: the signal fires on the first FREE step that moves a cell across the boundary (already at the straddling node), once per drag, in either direction', () => {
    const s = initialState({
      wall: { height: 4 },
      plan: ['WW', 'WW', 'WW', 'WW', 'WW'],
      pieces: [['D2_90', 'W', 4, 7]],
      debris: [['B1_0', 'R', 6, 4]],
    });
    const d = grab(s, 0);
    expect(d.follow(4, 8).crossedWall).toBe(false);
    const half = d.follow(5, 8);
    expect(names(half.path)).toEqual(['F(5,8)']);
    expect(half.crossedWall).toBe(true);
    expect(d.follow(6, 8).crossedWall).toBe(false);
    expect(d.follow(4, 8).crossedWall).toBe(false);
    const back = grab(s, 1).follow(5, 4); // site → yard over the 4-high wall
    expect(back.node).toEqual(F(5, 4));
    expect(back.crossedWall).toBe(true);
    expect(back.enteredRail).toBe(false);
  });
});

// --- K-12 gaps and rails -------------------------------------------------------------------------------------------

describe('K-12 entry through a gap (rail)', () => {
  it('K-12 alignment: a block enters a gap of size n iff its height h ≤ n (W3: only 1-row blocks pass a 1-row gap; N6 heavy never)', () => {
    for (let size = 1; size <= 3; size++) {
      for (const shape of CANONICAL) {
        const d = grab(
          initialState({
            wall: { height: 8, gaps: [{ type: 'static', y: 2, size }] },
            pieces: [[shape.id, 'W', 0, 0]],
          }),
          0,
        );
        const fits = !shape.heavy && shape.h <= size;
        expect(d.canEnterRail, `${shape.id} gap size ${size}`).toBe(fits);
        expect(
          d.reachableNodes().some((n) => n.mode !== FREE && n.ix >= 6),
          `${shape.id} on the site rail, gap size ${size}`,
        ).toBe(fits);
      }
    }
  });

  it('K-12 the vertical position is locked on the rail, even inside a 2-row gap; on the site side the only way out is left', () => {
    const d = grab(
      initialState({
        wall: { height: 6, gaps: [{ type: 'static', y: 2, size: 2 }] },
        pieces: [['B1_0', 'W', 5, 2]],
      }),
      0,
    );
    expect(names(d.neighbours(RL(0, 6, 2)))).toEqual(['F(5,2)', 'R0(7,2)']);
    expect(names(d.neighbours(RL(0, 7, 2)))).toEqual(['R0(6,2)']);
    d.moveTo(RL(0, 6, 2));
    expect(d.distanceFromCurrent(RL(0, 6, 3))).toBe(3); // left, up in the yard, right again
  });

  it('K-12 GDD example: a 2-wide block leaves the rail only when both cells are back in the yard; half-way it is still RAIL (a cancel)', () => {
    const d = grab(
      initialState({
        wall: { height: 5, gaps: [{ type: 'static', y: 3, size: 1 }] },
        pieces: [['D2_90', 'W', 4, 3]],
      }),
      0,
    );
    expect(names(d.neighbours(RL(0, 6, 3)))).toEqual(['R0(5,3)']);
    expect(names(d.neighbours(RL(0, 5, 3)))).toEqual(['F(4,3)', 'R0(6,3)']);
    expect(d.isReachable(F(5, 3))).toBe(false); // a FREE straddle in a closed (gap) row does not exist
    expect(d.classify(RL(0, 5, 3))).toMatchObject({ kind: 'cancel', reason: 'straddle', row: 4 });
    expect(d.classify(RL(0, 6, 3))).toMatchObject({ kind: 'siteRail', row: 7, gap: 0 });
  });

  it('K-12 N3 at wall height 8 a 3-tall block reaches the site only through a 3-row gap, and stays on the rail', () => {
    const s = initialState({
      wall: { height: 8, gaps: [{ type: 'static', y: 2, size: 3 }] },
      pieces: [
        ['I3_0', 'W', 0, 0],
        ['L4_0', 'W', 2, 0],
      ],
    });
    for (const id of [0, 1]) {
      const d = grab(s, id);
      expect(
        d.reachableNodes().filter((n) => n.mode === FREE && n.ix + d.shape.w - 1 >= 6),
        d.shape.id,
      ).toEqual([]);
      expect(d.isReachable(RL(0, 6, 2)), d.shape.id).toBe(true);
      expect(d.classify(RL(0, 6, 2)), d.shape.id).toMatchObject({ kind: 'siteRail', row: 7 });
    }
  });

  it('K-12 debris exception: debris B1 at (7,3) in an open gap row starts on the rail too and is pulled to the yard in 2 steps; behind a closed gap it leaves only over the wall', () => {
    const open = initialState({
      wall: { height: 5, gaps: [{ type: 'static', y: 3, size: 1 }] },
      plan: ['WW', 'WW', 'WW', 'WW'],
      pieces: [['B1_0', 'W', 0, 0]],
      debris: [['B1_0', 'R', 7, 3]],
    });
    const d = grab(open, 1);
    expect(names(d.startNodes).sort()).toEqual(['F(7,3)', 'R0(7,3)']);
    expect(d.distanceFromStart(F(5, 3))).toBe(2);
    expect(d.classify(F(5, 3))).toMatchObject({ kind: 'yard', row: 2 });
    expect(d.classify(RL(0, 7, 3))).toMatchObject({ kind: 'cancel', reason: 'sameSpot', row: 1 });
    expect(d.classify(F(7, 3))).toMatchObject({ kind: 'cancel', reason: 'sameSpot', row: 1 });

    const closed = initialState({
      wall: { height: 5, gaps: [{ type: 'locked', y: 3, size: 1, keyId: 'k' }] },
      plan: ['WW', 'WW', 'WW', 'WW'],
      pieces: [['B1_0', 'W', 0, 0]],
      debris: [['B1_0', 'R', 7, 3]],
      obstacles: [{ type: 'key', x: 0, y: 0, id: 'k' }],
    });
    const c = grab(closed, 1);
    expect(names(c.startNodes)).toEqual(['F(7,3)']);
    expect(c.distanceFromStart(F(5, 3))).toBe(6); // up to row 5, over, down
  });

  it('K-12 debris exception needs all its rows inside the gap: D2_0 debris (rows 3–4) starts on the rail of a 2-row gap, not of a 1-row gap', () => {
    const twoRows = initialState({
      wall: { height: 6, gaps: [{ type: 'static', y: 3, size: 2 }] },
      plan: ['WW', 'WW', 'WW', 'WW', 'WW'],
      pieces: [['B1_0', 'W', 0, 0]],
      debris: [['D2_0', 'R', 6, 3]],
    });
    expect(names(grab(twoRows, 1).startNodes).sort()).toEqual(['F(6,3)', 'R0(6,3)']);
    expect(grab(twoRows, 1).distanceFromStart(F(5, 3))).toBe(1);
    const oneRow = initialState({
      wall: { height: 6, gaps: [{ type: 'static', y: 3, size: 1 }] },
      plan: ['WW', 'WW', 'WW', 'WW', 'WW'],
      pieces: [['B1_0', 'W', 0, 0]],
      debris: [['D2_0', 'R', 6, 3]],
    });
    expect(names(grab(oneRow, 1).startNodes)).toEqual(['F(6,3)']);
    expect(grab(oneRow, 1).isReachable(RL(0, 6, 3))).toBe(false);
  });

  it('K-12 GDD debris example through the move pipeline: pulled left out of the rail to (4,3)–(5,3) costs 1 move; released back at its start in either mode it is a free cancel', () => {
    const s = initialState({
      moves: 9,
      wall: { height: 5, gaps: [{ type: 'static', y: 3, size: 1 }] },
      plan: ['WW', 'WW', 'WW', 'WW'],
      pieces: [['B1_0', 'W', 0, 0]],
      debris: [['D2_90', 'R', 6, 3]],
    });
    const before = Array.from(s.buf);
    for (const start of [RL(0, 6, 3), F(6, 3)]) {
      expect(applyMove(s, drop(1, start), undefined, NO_HELP), name(start)).toMatchObject({
        status: 'cancelled',
        reason: 'sameSpot',
      });
      expect(Array.from(s.buf), name(start)).toEqual(before);
    }
    expect(grab(s, 1).distanceFromStart(F(4, 3))).toBe(2); // R(6,3) → R(5,3) → F(4,3)
    expect(applyMove(s, drop(1, F(4, 3)), undefined, NO_HELP).status).toBe('applied');
    expect([pieceZone(s, 1), pieceX(s, 1), pieceY(s, 1)]).toEqual([Zone.yard, 4, 3]);
    expect(hdr(s, H.movesLeft)).toBe(8);
  });

  it('K-12 GDD example through the move pipeline: D2_90 (4,3)–(5,3) enters the y=3 gap, is released at (6,3)–(7,3) and stays in row 3 over empty cells', () => {
    const s = initialState({
      moves: 6,
      wall: { height: 5, gaps: [{ type: 'static', y: 3, size: 1 }] },
      plan: ['WW', '..', '..', '..'],
      pieces: [
        ['D2_90', 'W', 4, 3],
        ['D2_0', 'W', 0, 3],
      ],
    });
    const d = grab(s, 0);
    expect(names(d.pathTo(RL(0, 6, 3)) ?? [])).toEqual(['R0(5,3)', 'R0(6,3)']);
    expect(computeFall(s, 0, RL(0, 6, 3))).toMatchObject({
      mode: 'rail',
      landing: { ix: 6, iy: 3 },
      distance: 0,
    });
    expect(applyMove(s, drop(0, RL(0, 6, 3)), undefined, NO_HELP).status).toBe('applied');
    expect([pieceZone(s, 0), pieceX(s, 0), pieceY(s, 0)]).toEqual([Zone.site, 6, 3]);
    expect(hasFlag(s, 0, 'locked')).toBe(true);
    expect(hdr(s, H.movesLeft)).toBe(5);
    // "Aynı geçide D2_0 (1×2, satır 3–4) giremez"
    expect(grab(s, 1).canEnterRail).toBe(false);
  });

  it('K-12 two adjacent 1-row gaps are two gaps, not one 2-row gap: a D2_0 spanning both rows cannot pass, a B1 passes either', () => {
    const wall = {
      height: 4,
      gaps: [
        { type: 'static' as const, y: 1, size: 1 },
        { type: 'static' as const, y: 2, size: 1 },
      ],
    };
    const tall = grab(initialState({ wall, pieces: [['D2_0', 'W', 0, 0]] }), 0);
    expect(tall.canEnterRail).toBe(false);
    expect(tall.reachableNodes().filter((n) => n.mode !== FREE)).toEqual([]); // over the wall it still goes (h 2 ≤ 6)
    const small = grab(initialState({ wall, pieces: [['B1_0', 'W', 0, 0]] }), 0);
    expect(small.isReachable(RL(0, 6, 1))).toBe(true);
    expect(small.isReachable(RL(1, 6, 2))).toBe(true);
    expect(small.isReachable(RL(0, 6, 2))).toBe(false);
  });
});

// --- K-13 no free side entry on the site -----------------------------------------------------------------------------

describe('K-13 no free side entry on the site', () => {
  it('K-13 GDD example built with real moves: B1 placed by rail at (7,3) over empty `.` cells locks; a FREE B1 at (6,1) cannot step right to (7,1)', () => {
    const s = initialState({
      moves: 10,
      wall: { height: 5, gaps: [{ type: 'static', y: 3, size: 1 }] },
      plan: ['WW', 'W.', 'W.', 'W.'],
      pieces: [
        ['B1_0', 'W', 5, 3],
        ['B1_0', 'W', 0, 0],
      ],
    });
    const placed = applyMove(s, drop(0, RL(0, 7, 3)), undefined, NO_HELP);
    expect(placed.status).toBe('applied');
    expect(pieceZone(s, 0)).toBe(Zone.site);
    expect(hasFlag(s, 0, 'locked')).toBe(true); // (7,0)–(7,2) are `.`: K-34 counts them as filled
    expect(tryBeginDrag(s, 0)).toEqual({ ok: false, reason: 'locked' }); // K-14: locked blocks never move

    // silhouette: top(6) = 0, top(7) = 4 (siteColumnTops holds top − 1, the dragged piece excluded)
    expect(Array.from(siteColumnTops(s, 1))).toEqual([-1, 3]);
    expect(Array.from(siteColumnTops(s, 0))).toEqual([-1, -1]);
    const d = grab(s, 1);
    expect(d.isReachable(F(6, 1))).toBe(true);
    expect(names(d.neighbours(F(6, 1)))).not.toContain('F(7,1)'); // top(7) = 4 > 1
    for (let y = 0; y <= 3; y++) expect(d.isReachable(F(7, y)), `F(7,${y})`).toBe(false);
    expect(d.isReachable(F(7, 4))).toBe(true);
    // the other entry of K-13: the rail (here only up to (6,3); (7,3) is taken)
    expect(d.isReachable(RL(0, 6, 3))).toBe(true);
    expect(d.isReachable(RL(0, 7, 3))).toBe(false);
  });
});

// =====================================================================================================================
// Round 2
// =====================================================================================================================

const STATIC = (y: number, size = 1) => ({ type: 'static' as const, y, size });

describe('round 2 — K-08 tie-breaks across modes and gaps', () => {
  it('K-08 tie-break 3 also orders RAIL nodes of two different gaps: at equal distance and equal steps the smaller y wins, whatever the gap order in the data', () => {
    // GDD K-08: "(2) serbest kip ray kipinden önce, (3) y'si küçük olan, (4) x'i küçük olan" — between two RAIL nodes
    // only (3)/(4) are left; the gap index is not a GDD criterion.
    for (const gaps of [
      [STATIC(1), STATIC(3)],
      [STATIC(3), STATIC(1)],
    ]) {
      const s = initialState({
        wall: { height: 5, gaps },
        plan: ['WW', 'WW', 'WW'],
        pieces: [
          ['B1_0', 'W', 4, 2],
          ['B1_0', 'W', 5, 2],
        ],
        debris: [['B1_0', 'R', 6, 2]],
      });
      const low = gaps.findIndex((g) => g.y === 1);
      const high = 1 - low;
      const label = `gaps listed as y ${gaps.map((g) => g.y).join(', ')}`;
      const d = grab(s, 0);
      // p = (6,2): (5,2) is a block and (6,2) debris; the rail nodes (6,1) and (6,3) are 1 away and 3 steps from (4,2)
      expect(d.distanceFromCurrent(RL(low, 6, 1)), label).toBe(3);
      expect(d.distanceFromCurrent(RL(high, 6, 3)), label).toBe(3);
      // the FREE nodes 1 away are only reachable over the wall (more steps); F(6,1) has no open sky under the debris
      expect(d.distanceFromCurrent(F(6, 3)), label).toBeGreaterThan(3);
      expect(d.distanceFromCurrent(F(7, 2)), label).toBeGreaterThan(3);
      expect(d.isReachable(F(6, 1)), label).toBe(false);
      expect(name(d.nearest(6, 2)), label).toBe(`R${low}(6,1)`);
      expect(name(d.follow(6, 2).node), label).toBe(`R${low}(6,1)`);
    }
  });

  it('K-08 tie-break 2 comes before 3: FREE (5,4) beats RAIL (6,3) at equal distance and steps although the rail node has the smaller y', () => {
    const s = initialState({
      wall: { height: 5, gaps: [STATIC(3)] },
      plan: ['WW', 'WW', 'WW', 'WW', 'WW'],
      pieces: [['B1_0', 'W', 4, 3]],
      debris: [['B1_0', 'R', 6, 4]], // removes F(6,4) (d = 0) and, by open sky, F(6,3)
    });
    const d = grab(s, 0);
    // p = (6,4): RAIL (6,3) and FREE (5,4) are both 1 away and 2 steps from (4,3)
    expect(d.distanceFromCurrent(RL(0, 6, 3))).toBe(2);
    expect(d.distanceFromCurrent(F(5, 4))).toBe(2);
    expect(d.isReachable(F(6, 4))).toBe(false);
    expect(d.isReachable(F(6, 3))).toBe(false);
    expect(d.distanceFromCurrent(F(6, 5))).toBe(4); // the other node 1 away, over the wall
    expect(d.nearest(6, 4)).toEqual(F(5, 4));
    expect(d.follow(6, 4).node).toEqual(F(5, 4));
  });
});

describe('round 2 — K-04 K-12 gap rows, gap hooks and two gaps', () => {
  it('K-01 K-05 R-03 geometry: crane rows 8–9 are neither yard nor site, x 5 | 6 is the boundary, only a box over both 5 and 6 straddles', () => {
    expect([sideOf(5), sideOf(6)]).toEqual(['yard', 'site']);
    expect([isYardCell(5, 7), isYardCell(5, 8), isYardCell(6, 0)]).toEqual([true, false, false]);
    expect([isSiteCell(6, 0), isSiteCell(7, 7), isSiteCell(6, 8), isSiteCell(5, 0)]).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect([isCraneCell(0, 8), isCraneCell(7, 9), isCraneCell(7, 7)]).toEqual([true, true, false]);
    // K-01: "Hiçbir bloğun hücresi y > 9, x < 0 ya da x > 7 olamaz"
    expect([inGrid(7, 9), inGrid(7, 10), inGrid(8, 0), inGrid(-1, 0), inGrid(0, -1)]).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
    // K-07 row 4: cells on both sides of the boundary
    expect([straddlesBoundary(5, 2), straddlesBoundary(4, 2), straddlesBoundary(6, 2)]).toEqual([
      true,
      false,
      false,
    ]);
    expect([straddlesBoundary(5, 1), straddlesBoundary(4, 3), straddlesBoundary(3, 3)]).toEqual([
      false,
      true,
      false,
    ]);
    expect(neighbors4(3, 8)).toEqual([]); // §0 neighbourhood is between board cells
  });

  it('K-04 K-12 a gap in the bottom row (y = 0, wall 2): B1 at (5,0) enters the rail in 1 step; FREE it needs 5 (up to row 2, over, down)', () => {
    expect(closedBoundaryMask(2, openRailMask(0, 1, true))).toBe(0b10);
    const s = initialState({
      wall: { height: 2, gaps: [STATIC(0)] },
      pieces: [['B1_0', 'W', 5, 0]],
    });
    const d = grab(s, 0);
    expect(names(d.neighbours(F(5, 0)))).toContain('R0(6,0)');
    expect(names(d.neighbours(F(5, 0)))).not.toContain('F(6,0)');
    expect(d.distanceFromStart(RL(0, 6, 0))).toBe(1);
    expect(d.distanceFromStart(F(6, 0))).toBe(5);
    expect(d.classify(RL(0, 6, 0))).toMatchObject({ kind: 'siteRail', row: 7, gap: 0 });
    expect(d.classify(F(6, 0))).toMatchObject({ kind: 'siteFree', row: 6 });
  });

  it('K-04 K-12 a gap closed by its rule (canPassGap false) is a closed boundary row for both modes; the other gap stays open', () => {
    const wall = { height: 6, gaps: [STATIC(1), STATIC(4)] };
    expect(closedBoundaryMask(6, openRailMask(1, 1, true) | openRailMask(4, 1, false))).toBe(0b111101);
    const onlyFirst: DragRules = { canPassGap: (_s, gap) => gap === 0 };
    const s = initialState({ wall, pieces: [['B1_0', 'W', 5, 4]] });
    const attempt = tryBeginDrag(s, 0, onlyFirst);
    if (!attempt.ok) throw new Error(attempt.reason);
    const d = attempt.session;
    expect(names(d.neighbours(F(5, 4)))).not.toContain('F(6,4)');
    expect(names(d.neighbours(F(5, 4)))).not.toContain('R1(6,4)');
    expect(d.reachableNodes().filter((n) => n.mode === railMode(1))).toEqual([]);
    expect(d.distanceFromStart(RL(0, 6, 1))).toBe(4); // down to (5,1), then through the open first gap
    expect(d.isReachable(F(6, 4))).toBe(true); // over the wall at row 6 and down
    expect(d.distanceFromStart(F(6, 4))).toBe(5);
    // without the hook both gaps are open (W1 static gaps are always open)
    expect(grab(s, 0).distanceFromStart(RL(1, 6, 4))).toBe(1);
  });

  it('K-12 two gaps: on the rail the block never changes row, so going from gap 0 to gap 1 means back through the yard; the release reports its own gap', () => {
    const s = initialState({
      wall: { height: 6, gaps: [STATIC(1), STATIC(4)] },
      pieces: [['B1_0', 'W', 5, 1]],
    });
    const d = grab(s, 0);
    d.moveTo(RL(0, 6, 1));
    expect(names(d.neighbours(RL(0, 6, 1)))).toEqual(['F(5,1)', 'R0(7,1)']);
    expect(d.distanceFromCurrent(RL(1, 6, 4))).toBe(5); // R0(6,1) → F(5,1) → F(5,2) → F(5,3) → F(5,4) → R1(6,4)
    expect(d.isReachable(RL(0, 6, 4))).toBe(false); // row 4 is outside gap 0
    expect(d.isReachable(RL(1, 6, 1))).toBe(false);
    expect(d.classify(RL(1, 6, 4))).toMatchObject({ kind: 'siteRail', row: 7, gap: 1 });
    expect(d.classify(RL(0, 7, 1))).toMatchObject({ kind: 'siteRail', row: 7, gap: 0 });
  });

  it('K-12 "Şantiye tarafından ray kipine girilemez": a 2-wide block lowered beside its gap row on the site cannot step back into the gap', () => {
    const s = initialState({
      wall: { height: 5, gaps: [STATIC(3)] },
      pieces: [['D2_90', 'W', 0, 0]],
    });
    const d = grab(s, 0);
    d.moveTo(F(6, 3));
    // left would be the straddle (5,3)|(6,3): closed for FREE (row 3 < 5), and a FREE node on the site has no RAIL edge
    expect(names(d.neighbours(F(6, 3)))).toEqual(['F(6,2)', 'F(6,4)']);
    expect(d.isReachable(F(5, 3))).toBe(false);
    // the rail straddle exists, but only from the yard side: up, over the wall, down to (4,3), right
    expect(d.distanceFromCurrent(RL(0, 5, 3))).toBe(7);
    expect(names(d.pathTo(RL(0, 5, 3)) ?? []).at(-2)).toBe('F(4,3)');
  });
});

describe('round 2 — K-09 (a), K-10 and the crane area', () => {
  it('K-09 (a) a block whose only translation is half-way into a gap (the site cell beyond is taken) can be picked, and every release of it is a free cancel', () => {
    const s = initialState({
      moves: 8,
      wall: { height: 5, gaps: [STATIC(3)] },
      plan: ['WW', 'WW', 'WW', 'WW'],
      pieces: fullYard([['D2_90', 'Y', 4, 3]]),
      debris: [['B1_0', 'R', 7, 3]],
    });
    const d = grab(s, 0); // K-09 (a): the step right to R0(5,3) is a valid K-08 position
    expect(names(d.reachableNodes())).toEqual(['F(4,3)', 'R0(5,3)']);
    expect(d.classify(RL(0, 5, 3))).toMatchObject({ kind: 'cancel', reason: 'straddle', row: 4 });
    const before = Array.from(s.buf);
    expect(applyMove(s, drop(0, RL(0, 5, 3)), undefined, NO_HELP)).toMatchObject({
      status: 'cancelled',
      reason: 'straddle',
    });
    expect(Array.from(s.buf)).toEqual(before);
    expect(hdr(s, H.movesLeft)).toBe(8);
  });

  it('K-10 K-05 over a full yard a block travels through the crane area to the only empty cell: path up, along row 8, down; release there is a yard move', () => {
    const s = initialState({
      moves: 15,
      wall: { height: 6 },
      pieces: fullYard([['B1_0', 'Y', 0, 7]], [[5, 7]]),
    });
    const d = grab(s, 0);
    expect(d.distanceFromStart(F(5, 7))).toBe(7);
    const go = d.moveTo(F(5, 7));
    expect(names(go.path)).toEqual(['F(0,8)', 'F(1,8)', 'F(2,8)', 'F(3,8)', 'F(4,8)', 'F(5,8)', 'F(5,7)']);
    for (const n of go.path.slice(0, -1))
      expect(d.classify(n), name(n)).toMatchObject({ kind: 'cancel', reason: 'craneOverYard', row: 3 });
    expect(d.classify()).toMatchObject({ kind: 'yard', row: 2 });
    expect(applyMove(s, drop(0, F(5, 7)), undefined, NO_HELP).status).toBe('applied');
    expect([pieceZone(s, 0), pieceX(s, 0), pieceY(s, 0)]).toEqual([Zone.yard, 5, 7]);
    expect(hdr(s, H.movesLeft)).toBe(14);
  });

  it('K-05 E-28 W2 (height 8): O4 crosses only in the crane rows — (4,8) cancels over the yard, the straddle (5,8) cancels, (6,8) falls 8 rows to (6,0)', () => {
    const s = initialState({
      moves: 5,
      wall: { height: 8 },
      plan: ['WW', 'WW'],
      pieces: [['O4_0', 'W', 0, 0]],
    });
    const d = grab(s, 0);
    expect(d.isReachable(F(5, 7))).toBe(false); // straddle with row 7 closed
    expect(d.isReachable(F(4, 7))).toBe(true);
    expect(d.classify(F(4, 8))).toMatchObject({ kind: 'cancel', reason: 'craneOverYard', row: 3 });
    expect(d.classify(F(5, 8))).toMatchObject({ kind: 'cancel', reason: 'straddle', row: 4 });
    expect(d.classify(F(6, 8))).toMatchObject({ kind: 'siteFree', row: 6 });
    expect(computeFall(s, 0, F(6, 8))).toMatchObject({
      mode: 'free',
      landing: { ix: 6, iy: 0 },
      distance: 8,
    });
    const before = Array.from(s.buf);
    for (const [node, reason] of [
      [F(4, 8), 'craneOverYard'],
      [F(5, 8), 'straddle'],
    ] as const) {
      expect(applyMove(s, drop(0, node), undefined, NO_HELP), name(node)).toMatchObject({
        status: 'cancelled',
        reason,
      });
      expect(Array.from(s.buf), name(node)).toEqual(before);
    }
    expect(applyMove(s, drop(0, F(6, 8)), undefined, NO_HELP).status).toBe('applied');
    expect([pieceZone(s, 0), pieceX(s, 0), pieceY(s, 0)]).toEqual([Zone.site, 6, 0]);
    expect(hdr(s, H.movesLeft)).toBe(4);
  });
});

describe('round 2 — K-07 row 1, K-11, K-13 on the site', () => {
  it('K-07 row 1 is decided by the release node, not by the landing: debris lifted one row and released is row 6 (a move); K-17 returns it to its start', () => {
    const s = initialState({
      moves: 10,
      wall: { height: 2 },
      plan: ['WW'],
      pieces: [['B1_0', 'W', 0, 0]],
      debris: [['B1_0', 'R', 6, 0]],
    });
    const d = grab(s, 1);
    expect(d.classify(F(6, 0))).toMatchObject({ kind: 'cancel', reason: 'sameSpot', row: 1 });
    expect(d.classify(F(6, 1))).toMatchObject({ kind: 'siteFree', row: 6 });
    expect(computeFall(s, 1, F(6, 1)).landing).toMatchObject({ ix: 6, iy: 0 });
    const r = applyMove(s, drop(1, F(6, 1)), undefined, NO_HELP);
    expect(r.status).toBe('applied');
    expect(hdr(s, H.movesLeft)).toBe(9); // K-17: "hamle yanar (maliyet 1)"
    // K-16 (2): debris is never correct → K-17 step 1: back to its (empty) start cells, still debris, not locked
    expect([pieceZone(s, 1), pieceX(s, 1), pieceY(s, 1)]).toEqual([Zone.site, 6, 0]);
    expect(hasFlag(s, 1, 'debris')).toBe(true);
    expect(hasFlag(s, 1, 'locked')).toBe(false);
  });

  it('K-13 K-11 even over a low wall a block cannot slide sideways under an overhang: the straddles under debris at (6,4) are no positions', () => {
    const s = initialState({
      wall: { height: 2 },
      plan: ['WW', 'WW', 'WW', 'WW', 'WW'],
      pieces: [
        ['D2_90', 'W', 0, 2],
        ['B1_0', 'W', 0, 4],
      ],
      debris: [['B1_0', 'R', 6, 4]],
    });
    const wide = grab(s, 0);
    // the boundary rows 2–3 are open (≥ height 2), but (6,2)/(6,3) lie under the filled (6,4): no open sky
    expect(wide.isReachable(F(4, 2))).toBe(true);
    expect(wide.isReachable(F(5, 2))).toBe(false);
    expect(wide.isReachable(F(5, 3))).toBe(false);
    expect(wide.isReachable(F(5, 5))).toBe(true);
    for (let y = 0; y <= 4; y++) expect(wide.isReachable(F(6, y)), `D2_90 F(6,${y})`).toBe(false);
    const small = grab(s, 1);
    expect(small.isReachable(F(5, 2))).toBe(true);
    expect(names(small.neighbours(F(5, 2)))).not.toContain('F(6,2)');
    // from column 7 (empty, open sky) the block cannot slide left under the overhang either
    expect(small.isReachable(F(7, 2))).toBe(true);
    expect(names(small.neighbours(F(7, 2)))).not.toContain('F(6,2)');
    for (let y = 0; y <= 3; y++) expect(small.isReachable(F(6, y)), `B1 F(6,${y})`).toBe(false);
  });

  it('K-22 K-09 K-11 debris of a later segment is no obstacle and cannot be picked until the site shifts to its segment; then it blocks and is pickable', () => {
    const s = initialState({
      moves: 10,
      wall: { height: 2 },
      plan: [['WW'], ['YY', 'YY']],
      pieces: [
        ['D2_90', 'W', 0, 0],
        ['B1_0', 'Y', 3, 0],
      ],
      debris: [['B1_0', 'R', 7, 1, 1]],
    });
    const debris = 2; // PieceId order: batch 0, truck batches, then debris
    expect(tryBeginDrag(s, debris)).toEqual({ ok: false, reason: 'hiddenSegment' });
    expect((collisionMasks(s, 1)[1] ?? 0) & (1 << 7)).toBe(0);
    expect(Array.from(siteColumnTops(s, 1))).toEqual([-1, -1]);
    expect(grab(s, 1).isReachable(F(7, 0))).toBe(true);

    expect(applyMove(s, drop(0, F(6, 2)), undefined, NO_HELP).status).toBe('applied');
    expect(hdr(s, H.activeSeg)).toBe(1);

    expect(tryBeginDrag(s, debris).ok).toBe(true);
    expect(grab(s, debris).start).toEqual(F(7, 1));
    expect((collisionMasks(s, 1)[1] ?? 0) & (1 << 7)).not.toBe(0);
    expect(Array.from(siteColumnTops(s, 1))).toEqual([-1, 1]);
    const d = grab(s, 1);
    expect(d.isReachable(F(7, 0))).toBe(false); // under the debris: no open sky
    expect(d.isReachable(F(7, 2))).toBe(true);
    expect(d.isReachable(F(6, 0))).toBe(true); // the new segment's column 6 is empty
  });
});

describe('round 2 — GDD §14.1 drag signals with a debris rail start', () => {
  it('K-12 K-11 debris pulled out through its own open gap emits neither gapPass nor overWall (GDD §14.1/3 example); lifted over the wall it emits overWall once', () => {
    const spec: LevelSpec = {
      wall: { height: 5, gaps: [STATIC(3)] },
      plan: ['WW', 'WW', 'WW', 'WW'],
      pieces: [['B1_0', 'W', 0, 0]],
      debris: [['D2_90', 'R', 6, 3]],
    };
    const s = initialState(spec);
    const viaRail = grab(s, 1);
    expect(viaRail.canCrossWall).toBe(true);
    expect(viaRail.canEnterRail).toBe(true); // from (4,3) back into the gap
    const out = viaRail.follow(4, 3);
    expect(out.node).toEqual(F(4, 3));
    expect(out.crossedWall).toBe(false); // the cells crossed the boundary in RAIL mode
    expect(out.enteredRail).toBe(false);

    const overWall = grab(s, 1);
    const up = overWall.moveTo(F(6, 5));
    expect(names(up.path)).toEqual(['F(6,4)', 'F(6,5)']);
    expect(up.crossedWall).toBe(false);
    const half = overWall.moveTo(F(5, 5));
    expect(half.crossedWall).toBe(true);
    expect(half.enteredRail).toBe(false);
    expect(overWall.moveTo(F(4, 5)).crossedWall).toBe(false); // once per drag
    expect(overWall.classify()).toMatchObject({ kind: 'yard', row: 2 });
  });
});

// =====================================================================================================================
// Round 3
// =====================================================================================================================

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** levels/level_00N.json through the game load path (schema + runtime logic). */
function levelState(id: number): GameState {
  const json: unknown = JSON.parse(
    readFileSync(join(ROOT, 'levels', `level_${String(id).padStart(3, '0')}.json`), 'utf8'),
  );
  const loaded = loadLevel(json);
  if (!loaded.ok) throw new Error(`level ${id} does not load: ${JSON.stringify(loaded.issues)}`);
  return createInitialState(loaded.level);
}

function grabWith(s: GameState, id: PieceId, rules: DragRules): DragSession {
  const attempt = tryBeginDrag(s, id, rules);
  if (!attempt.ok) throw new Error(`piece ${id} cannot be picked: ${attempt.reason}`);
  return attempt.session;
}

describe('round 3 — K-05 blockedByWallHeight (presentation signal of the open height)', () => {
  it('K-05 the signal fires exactly for blocks taller than 10 − height: every non-heavy shape × wall heights 0–8, finger at the highest site anchor', () => {
    // GDD K-05: "Sınırı serbest kipte geçen her hücre y ≥ height olmalıdır … Yapışkan takibin (K-08) duvar tepesinde
    // durması bir sunum olayıdır (blockedByWallHeight)"; TECH §4.4: box height h > 10 − wall.height.
    let fired = 0;
    let quiet = 0;
    for (const shape of CANONICAL.filter((sh) => !sh.heavy)) {
      for (let height = 0; height <= 8; height++) {
        const label = `${shape.id} height ${height}`;
        const d = grab(initialState({ wall: { height }, pieces: [[shape.id, 'W', 0, 0]] }), 0);
        const target = F(6, 10 - shape.h);
        const r = d.follow(target.ix, target.iy);
        const tall = shape.h > 10 - height;
        expect(r.blockedByWallHeight, label).toBe(tall);
        if (tall) {
          fired++;
          expect(r.node.mode, label).toBe(FREE);
          expect(r.node.ix, label).toBeLessThan(6); // the block waits at the wall, never on the site
        } else {
          quiet++;
          expect(r.node, label).toEqual(target);
        }
        // a presentation event: the rule is unchanged, the block sits on the K-08 nearest node
        expect(r.node, label).toEqual(d.nearest(target.ix, target.iy));
      }
    }
    expect(fired).toBeGreaterThan(0);
    expect(quiet).toBeGreaterThan(fired);
  });

  it('K-05 N3 a 3-tall block that reaches the site only by rail still gets blockedByWallHeight over the site crane, then rides the rail with no second signal', () => {
    // TECH §4.4 equivalence: "R'de sınırı FREE geçen düğüm yok ve h > 10 − height" — the rail does not change that.
    const s = initialState({
      wall: { height: 8, gaps: [STATIC(2, 3)] },
      plan: ['WW', 'WW', 'WW'],
      pieces: [['I3_0', 'W', 0, 0]],
    });
    const d = grab(s, 0);
    expect(d.canCrossWall).toBe(false);
    expect(d.canEnterRail).toBe(true);
    const over = d.follow(6, 7);
    expect(over.node).toEqual(F(5, 7)); // stops at the top of the wall
    expect(over.blockedByWallHeight).toBe(true);
    expect(over.crossedWall).toBe(false);
    const rail = d.follow(6, 2);
    expect(names(rail.path)).toEqual(['F(5,6)', 'F(5,5)', 'F(5,4)', 'F(5,3)', 'F(5,2)', 'R0(6,2)']);
    expect(rail.enteredRail).toBe(true);
    expect(rail.blockedByWallHeight).toBe(false);
    expect(d.classify()).toMatchObject({ kind: 'siteRail', row: 7, gap: 0 });
    const back = d.follow(6.5, 9);
    expect(back.node).toEqual(F(5, 7));
    expect(back.blockedByWallHeight).toBe(false); // at most once per drag
  });

  it('K-05 GDD §14.1 overWall: S4_0 and T4_0 hook over an 8-high wall top at (5,7) — a FREE boundary crossing (canCrossWall, crossedWall) that never becomes a site position; release there cancels (row 4)', () => {
    for (const shape of ['S4_0', 'T4_0'] as const) {
      const d = grab(initialState({ wall: { height: 8 }, pieces: [[shape, 'W', 0, 0]] }), 0);
      expect(
        d.reachableNodes().filter((n) => n.ix >= 6),
        shape,
      ).toEqual([]);
      expect(names(d.reachableNodes().filter((n) => n.ix === 5)), shape).toEqual(['F(5,7)']);
      // the cells past the boundary are all in the crane rows (K-05: crossing cells y ≥ height)
      const past = d.cells(F(5, 7)).filter((c) => c.x >= 6);
      expect(past.length, shape).toBeGreaterThan(0);
      expect(
        past.every((c) => c.y >= 8),
        shape,
      ).toBe(true);
      // "tutulan bloğun bir hücresi serbest kipte duvar sınırını ilk kez geçtiği an" → overWall
      expect(d.canCrossWall, shape).toBe(true);
      const r = d.follow(6, 7);
      expect(r.node, shape).toEqual(F(5, 7));
      expect(r.crossedWall, shape).toBe(true);
      expect(r.blockedByWallHeight, shape).toBe(true);
      expect(d.classify(), shape).toMatchObject({ kind: 'cancel', reason: 'straddle', row: 4 });
    }
    // Z4_0 has its 2-row column on the right: it cannot even start to cross
    expect(grab(initialState({ wall: { height: 8 }, pieces: [['Z4_0', 'W', 0, 0]] }), 0).canCrossWall).toBe(
      false,
    );
  });

  it('K-05 a 1-tall block held back by a full yard (not by the wall height) gets no blockedByWallHeight', () => {
    const s = initialState({ wall: { height: 8 }, pieces: fullYard([['B1_0', 'W', 1, 0]], [[0, 0]]) });
    const d = grab(s, 0);
    expect(names(d.reachableNodes())).toEqual(['F(0,0)', 'F(1,0)']);
    const r = d.follow(6.5, 9);
    expect(r.node).toEqual(F(1, 0));
    expect(r.blockedByWallHeight).toBe(false);
  });
});

describe('round 3 — two-way edges, debris on the rail, N14', () => {
  it('K-08 K-07 row 1 K-13 debris under an overhang (FREE start without open sky) leaves sideways or through its gap and can always be brought back to its start, in either mode', () => {
    const s = initialState({
      wall: { height: 5, gaps: [STATIC(3)] },
      plan: ['WW', 'WW', 'WW', 'WW', 'WW', 'WW'],
      pieces: [['B1_0', 'W', 0, 0]],
      debris: [
        ['B1_0', 'R', 7, 3],
        ['B1_0', 'R', 7, 5], // overhang: (7,4) stays empty
      ],
    });
    expect(Array.from(siteColumnTops(s, 1))).toEqual([-1, 5]);
    const d = grab(s, 1);
    expect(names(d.startNodes).sort()).toEqual(['F(7,3)', 'R0(7,3)']);
    // K-13: no other FREE position under the overhang; column 7 is open again only above (7,5)
    const col7 = [];
    for (let y = 0; y <= 9; y++) if (d.isReachable(F(7, y))) col7.push(y);
    expect(col7).toEqual([3, 6, 7, 8, 9]);
    expect(d.isReachable(RL(0, 7, 4))).toBe(false);
    expect(d.distanceFromStart(F(6, 3))).toBe(1); // sideways on the site into open sky
    expect(d.distanceFromStart(F(5, 3))).toBe(2); // R0(7,3) → R0(6,3) → F(5,3) (K-12 debris exception)
    d.moveTo(F(4, 0));
    expect(d.distanceFromCurrent(F(7, 3))).toBeGreaterThan(0);
    expect(d.moveTo(F(7, 3)).node).toEqual(F(7, 3));
    expect(d.classify()).toMatchObject({ kind: 'cancel', reason: 'sameSpot', row: 1 });
    d.moveTo(F(6, 9));
    expect(d.moveTo(RL(0, 7, 3)).node).toEqual(RL(0, 7, 3));
    expect(d.classify()).toMatchObject({ kind: 'cancel', reason: 'sameSpot', row: 1 });
  });

  it('K-08 every edge is two-way: from any node of R every node of R is reachable and BFS distances are symmetric (Bölüm 3 yard, debris boards)', () => {
    const boards: { spec: LevelSpec; ids: PieceId[] }[] = [
      { spec: LEVEL3, ids: [0, 1, 2, 4, 5, 9] },
      {
        spec: {
          wall: { height: 5, gaps: [STATIC(3)] },
          plan: ['WW', 'WW', 'WW', 'WW', 'WW', 'WW'],
          pieces: [
            ['B1_0', 'W', 0, 0],
            ['D2_90', 'Y', 2, 3],
          ],
          debris: [
            ['B1_0', 'R', 7, 3],
            ['B1_0', 'R', 7, 5],
          ],
        },
        ids: [1, 2, 3],
      },
      {
        spec: {
          wall: { height: 2 },
          plan: ['WW', 'WW', 'WW', 'WW', 'WW'],
          pieces: [['C3_0', 'W', 0, 0]],
          debris: [
            ['B1_0', 'R', 6, 1],
            ['B1_0', 'R', 6, 4],
          ],
        },
        ids: [0, 1, 2],
      },
    ];
    let pairs = 0;
    for (const { spec, ids } of boards) {
      const s = initialState(spec);
      for (const id of ids) {
        const d = grab(s, id);
        const all = d.reachableNodes();
        const step = Math.max(1, Math.floor(all.length / 10));
        const sample = [...all.filter((_, i) => i % step === 0), ...d.startNodes];
        const dist = new Map<string, number>();
        const unreachable: string[] = [];
        const jumps: string[] = [];
        for (const a of sample) {
          // K-08 "ışınlanmaz": each step is a unit translation, or a mode switch on the same cells (debris start)
          let prev = d.current;
          for (const n of d.moveTo(a).path) {
            const dx = Math.abs(n.ix - prev.ix);
            const dy = Math.abs(n.iy - prev.iy);
            if (!(dx + dy === 1 || (dx + dy === 0 && n.mode !== prev.mode)))
              jumps.push(`${name(prev)} → ${name(n)}`);
            prev = n;
          }
          expect(d.distanceFromCurrent(a)).toBe(0);
          for (const n of all) if (d.distanceFromCurrent(n) < 0) unreachable.push(`${name(a)} → ${name(n)}`);
          for (const b of sample) dist.set(`${name(a)}>${name(b)}`, d.distanceFromCurrent(b));
        }
        expect(unreachable, `piece ${id}`).toEqual([]);
        expect(jumps, `piece ${id}`).toEqual([]);
        const asym: string[] = [];
        for (const a of sample)
          for (const b of sample) {
            pairs++;
            const ab = dist.get(`${name(a)}>${name(b)}`);
            const ba = dist.get(`${name(b)}>${name(a)}`);
            if (ab !== ba) asym.push(`${name(a)}↔${name(b)}: ${ab} vs ${ba}`);
          }
        expect(asym, `piece ${id}`).toEqual([]);
      }
    }
    expect(pairs).toBeGreaterThan(500);
  });

  it('K-09 (a) K-12 K-13 debris in an open gap row whose only translation is right along its rail (under an overhang) is pickable; that release is a site move (row 7) and S4 returns it to its start for 1 move', () => {
    const s = initialState({
      moves: 9,
      wall: { height: 5, gaps: [STATIC(3)] },
      plan: ['WW', 'WW', 'WW', 'WW', 'WW'],
      pieces: [['B1_0', 'W', 5, 3]], // closes the way out to the yard
      debris: [
        ['B1_0', 'R', 6, 3],
        ['B1_0', 'R', 6, 4],
        ['B1_0', 'R', 7, 4], // overhang over (7,3)
      ],
    });
    const d = grab(s, 1); // "4 birim ötelemesinden en az biri": right, in rail mode
    expect(names(d.reachableNodes())).toEqual(['F(6,3)', 'R0(6,3)', 'R0(7,3)']);
    expect(d.isReachable(F(7, 3))).toBe(false); // K-13: FREE cannot slide under (7,4)
    expect(d.classify(RL(0, 7, 3))).toMatchObject({ kind: 'siteRail', row: 7, gap: 0 });
    const r = applyMove(s, drop(1, RL(0, 7, 3)), undefined, NO_HELP);
    expect(r.status).toBe('applied');
    expect(hdr(s, H.movesLeft)).toBe(8);
    // OBSTACLES S4: "Şantiyede başka yere bırakılırsa hatalı → başlangıcına döner"
    expect([pieceZone(s, 1), pieceX(s, 1), pieceY(s, 1)]).toEqual([Zone.site, 6, 3]);
    expect(hasFlag(s, 1, 'debris')).toBe(true);
  });

  it('K-12 N14 debris in a gap row blocks the rail for every other block (the site cell beyond is reachable only over the wall); once pulled out, the rail is open', () => {
    const s = initialState({
      moves: 9,
      wall: { height: 5, gaps: [STATIC(3)] },
      plan: ['WW', 'WW', 'WW', 'WW'],
      pieces: [['B1_0', 'W', 4, 3]],
      debris: [['B1_0', 'R', 6, 3]],
    });
    const blocked = grab(s, 0);
    expect(blocked.canEnterRail).toBe(false);
    expect(blocked.reachableNodes().filter((n) => n.mode !== FREE)).toEqual([]);
    expect(blocked.isReachable(RL(0, 7, 3))).toBe(false);
    expect(blocked.isReachable(F(7, 3))).toBe(true);
    expect(blocked.distanceFromStart(F(7, 3))).toBeGreaterThan(4); // up to row 5, over, down
    expect(blocked.isReachable(F(6, 4))).toBe(true); // on top of the debris (open sky)
    // the debris itself leaves through the gap and is parked above the gap row
    const debris = grab(s, 1);
    expect(debris.distanceFromStart(F(5, 4))).toBe(2);
    expect(names(debris.pathTo(F(5, 4)) ?? []).slice(-2)).toEqual(['F(5,3)', 'F(5,4)']);
    expect(applyMove(s, drop(1, F(5, 4)), undefined, NO_HELP).status).toBe('applied');
    expect([pieceZone(s, 1), pieceX(s, 1), pieceY(s, 1)]).toEqual([Zone.yard, 5, 4]);
    const open = grab(s, 0);
    expect(open.canEnterRail).toBe(true);
    expect(names(open.pathTo(RL(0, 7, 3)) ?? [])).toEqual(['F(5,3)', 'R0(6,3)', 'R0(7,3)']);
  });

  it('K-12 K-11 a FREE block lowered to a gap row on the site stays FREE (no rail from the site side) and falls on release; its rail twin is 6 steps away through the yard', () => {
    const s = initialState({
      wall: { height: 5, gaps: [STATIC(3)] },
      plan: ['WW', 'WW', 'WW', 'WW'],
      pieces: [['B1_0', 'W', 0, 0]],
    });
    const d = grab(s, 0);
    d.moveTo(F(6, 3));
    expect(names(d.neighbours(F(6, 3)))).toEqual(['F(7,3)', 'F(6,2)', 'F(6,4)']);
    expect(d.follow(6, 3.05).changed).toBe(false);
    expect(d.current).toEqual(F(6, 3));
    expect(d.distanceFromCurrent(RL(0, 6, 3))).toBe(6); // (6,4) (6,5) (5,5) (5,4) (5,3) R0(6,3)
    expect(d.classify(F(6, 3))).toMatchObject({ kind: 'siteFree', row: 6 });
    expect(computeFall(s, 0, F(6, 3))).toMatchObject({
      mode: 'free',
      landing: { ix: 6, iy: 0 },
      distance: 3,
    });
    expect(computeFall(s, 0, RL(0, 6, 3))).toMatchObject({
      mode: 'rail',
      landing: { ix: 6, iy: 3 },
      distance: 0,
    });
  });

  it('K-08 E-06 the gap state is frozen at pick time: a canPassGap answer that changes during the drag changes nothing; the next pick sees it', () => {
    let open = true;
    const rules: DragRules = { canPassGap: () => open };
    const s = initialState({ wall: { height: 5, gaps: [STATIC(3)] }, pieces: [['B1_0', 'W', 5, 3]] });
    const d = grabWith(s, 0, rules);
    open = false;
    expect(d.isReachable(RL(0, 6, 3))).toBe(true);
    expect(d.follow(6, 3).node).toEqual(RL(0, 6, 3));
    expect(d.classify()).toMatchObject({ kind: 'siteRail', row: 7, gap: 0 });
    expect(names(d.neighbours(RL(0, 6, 3)))).toEqual(['F(5,3)', 'R0(7,3)']);
    const next = grabWith(s, 0, rules);
    expect(next.canEnterRail).toBe(false);
    expect(next.isReachable(RL(0, 6, 3))).toBe(false);
    expect(next.distanceFromStart(F(6, 3))).toBe(5); // over the wall: (5,4) (5,5) (6,5) (6,4) (6,3)
  });
});

describe('round 3 — K-12 three gaps', () => {
  it('K-12 K-04 three gaps on an 8-high wall: each rail is entered only in its own rows, the rails are joined only through the yard, and each release reports its own gap', () => {
    const wall = { height: 8, gaps: [STATIC(0), STATIC(2), STATIC(4, 2)] };
    expect(
      closedBoundaryMask(8, openRailMask(0, 1, true) | openRailMask(2, 1, true) | openRailMask(4, 2, true)),
    ).toBe(0b11001010);
    const d = grab(initialState({ wall, pieces: [['B1_0', 'W', 0, 0]] }), 0);
    const rails = d.reachableNodes().filter((n) => n.mode !== FREE);
    expect(names(rails.filter((n) => n.ix === 6))).toEqual(['R0(6,0)', 'R1(6,2)', 'R2(6,4)', 'R2(6,5)']);
    expect(d.distanceFromStart(RL(0, 6, 0))).toBe(6);
    expect(d.distanceFromStart(RL(1, 6, 2))).toBe(8);
    expect(d.distanceFromStart(RL(2, 6, 5))).toBe(11);
    d.moveTo(RL(1, 7, 2));
    expect(d.classify()).toMatchObject({ kind: 'siteRail', row: 7, gap: 1 });
    // to the next gap up: back left into the yard, up 2 rows, right again
    expect(names(d.pathTo(RL(2, 6, 4)) ?? [])).toEqual(['R1(6,2)', 'F(5,2)', 'F(5,3)', 'F(5,4)', 'R2(6,4)']);
    expect(d.follow(6, 4).node).toEqual(RL(2, 6, 4));
    expect(d.classify()).toMatchObject({ kind: 'siteRail', row: 7, gap: 2 });
    // a 2-tall block fits only the 2-row gap
    const tall = grab(initialState({ wall, pieces: [['D2_0', 'W', 0, 0]] }), 0);
    expect(names(tall.reachableNodes().filter((n) => n.mode !== FREE && n.ix === 6))).toEqual(['R2(6,4)']);
  });
});

describe('round 3 — K-08 tie-break 4, off-grid targets, interleaved sessions', () => {
  it('K-08 tie-break 4: equal distance, equal BFS steps, same mode and same row → the smaller x wins', () => {
    const s = initialState({
      pieces: [
        ['B1_0', 'W', 2, 3],
        ['B1_0', 'W', 2, 0],
        ['B1_0', 'W', 2, 1],
        ['B1_0', 'W', 2, 2],
      ],
    });
    const d = grab(s, 0);
    // p = (2,0) is taken; (1,0) and (3,0) are 1 away and 4 steps from (2,3); (2,1) is taken too
    expect(d.distanceFromCurrent(F(1, 0))).toBe(4);
    expect(d.distanceFromCurrent(F(3, 0))).toBe(4);
    expect(d.nearest(2, 0)).toEqual(F(1, 0));
    expect(d.follow(2, 0).node).toEqual(F(1, 0));
  });

  it('K-01 K-08 a target far outside the grid snaps to the nearest node of R; the block never leaves the 8 × 10 grid', () => {
    const d = grab(initialState({ wall: { height: 0 }, pieces: [['B1_0', 'W', 0, 0]] }), 0);
    const visited: DragNode[] = [];
    for (const [px, py, want] of [
      [-5, 20, F(0, 9)],
      [20, -5, F(7, 0)],
      [3.4, 100, F(3, 9)],
      [-100, -100, F(0, 0)],
    ] as const) {
      const r = d.follow(px, py);
      expect(r.node, `p = (${px}, ${py})`).toEqual(want);
      visited.push(...r.path);
    }
    expect(visited.every((n) => inGrid(n.ix, n.iy))).toBe(true);
    expect(visited.length).toBeGreaterThan(20);
  });

  it('K-08 interleaved sessions on different levels (0, 1 and 2 gaps) answer exactly as when each runs alone', () => {
    const twoGaps: LevelSpec = {
      wall: { height: 7, gaps: [STATIC(1, 2), STATIC(4, 2)] },
      pieces: [
        ['D2_90', 'W', 0, 0],
        ['B1_0', 'R', 4, 5],
      ],
    };
    const plain: LevelSpec = { wall: { height: 3 }, pieces: [['C3_0', 'W', 1, 1]] };
    const cases: { spec: LevelSpec; id: PieceId }[] = [
      { spec: LEVEL3, id: 1 },
      { spec: LEVEL3, id: 0 },
      { spec: twoGaps, id: 1 },
      { spec: plain, id: 0 },
    ];
    const targets: [number, number][] = [
      [6, 2],
      [6, 8],
      [0, 9],
      [6, 0],
      [4, 4],
      [7, 9],
      [5, 1],
      [6, 5],
    ];
    const trace = (r: ReturnType<DragSession['follow']>): string =>
      `${names(r.path).join(' ')}|${r.crossedWall ? 'W' : ''}${r.enteredRail ? 'R' : ''}${r.blockedByWallHeight ? 'B' : ''}`;
    const alone = cases.map(({ spec, id }) => {
      const d = grab(initialState(spec), id);
      return targets.map(([x, y]) => trace(d.follow(x, y)));
    });
    const states = cases.map(({ spec }) => initialState(spec));
    const sessions = cases.map(({ id }, i) => grab(states[i] as GameState, id));
    const mixed: string[][] = cases.map(() => []);
    for (const [x, y] of targets) {
      sessions.forEach((d, i) => {
        mixed[i]?.push(trace(d.follow(x, y)));
        grab(states[(i + 1) % states.length] as GameState, cases[(i + 1) % cases.length]?.id ?? 0); // a BFS in between
      });
    }
    expect(mixed).toEqual(alone);
  });
});

describe('round 3 — Bölüm 1–5 start boards (level data)', () => {
  it('K-09 (a) Bölüm 1–5: a block is pickable iff one of its four unit translations is a valid K-08 position (independent cell oracle)', () => {
    let pickable = 0;
    let stuck = 0;
    for (let id = 1; id <= 5; id++) {
      const s = levelState(id);
      const height = s.lvl.wallHeight;
      const gaps = (
        JSON.parse(
          readFileSync(join(ROOT, 'levels', `level_${String(id).padStart(3, '0')}.json`), 'utf8'),
        ) as { wall: { gaps: { y: number; size: number }[] } }
      ).wall.gaps;
      const n = s.lvl.layout.counts.pieces;
      const occ = new Map<string, number>();
      const cellsOf = (pid: number) => {
        if (pieceZone(s, pid) !== Zone.yard) return [];
        return shapeByIndex(pieceShape(s, pid)).cells.map((c) => ({
          x: pieceX(s, pid) + c.x,
          y: pieceY(s, pid) + c.y,
        }));
      };
      for (let pid = 0; pid < n; pid++) for (const c of cellsOf(pid)) occ.set(`${c.x},${c.y}`, pid);
      for (let pid = 0; pid < n; pid++) {
        if (pieceZone(s, pid) !== Zone.yard) continue;
        const cells = cellsOf(pid);
        const free = (x: number, y: number) => {
          const o = occ.get(`${x},${y}`);
          return x >= 0 && x <= 7 && y >= 0 && y <= 9 && (o === undefined || o === pid);
        };
        let valid = false;
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ] as const) {
          const moved = cells.map((c) => ({ x: c.x + dx, y: c.y + dy }));
          if (!moved.every((c) => free(c.x, c.y))) continue;
          // FREE: every cell that changes side crosses in a row y ≥ height; every row cut by the block is open
          const crossOk = cells.every((c) => !(c.x === 5 && c.x + dx === 6) || c.y >= height);
          const rowsCut = new Set(moved.filter((c) => c.x <= 5).map((c) => c.y));
          const cutOk = moved.every((c) => c.x <= 5 || !rowsCut.has(c.y) || c.y >= height);
          if (crossOk && cutOk) valid = true;
          // RAIL (K-12): right, from fully in the yard, every row of the block inside one gap
          if (dx === 1 && cells.every((c) => c.x <= 5) && moved.some((c) => c.x >= 6))
            if (gaps.some((g) => cells.every((c) => c.y >= g.y && c.y < g.y + g.size))) valid = true;
        }
        const got = tryBeginDrag(s, pid).ok;
        expect(got, `Bölüm ${id} piece ${pid}`).toBe(valid);
        if (valid) pickable++;
        else stuck++;
      }
    }
    expect(pickable).toBeGreaterThan(10);
    expect(stuck).toBeGreaterThan(10);
  });

  it('K-11 K-12 GDD §14.1 Bölüm 1, 3 and 4 required drag steps: the hand path on the start board emits the step signal (overWall / gapPass) and ends where the step points', () => {
    const cases = [
      {
        level: 1,
        piece: 0,
        path: [
          [4, 8],
          [6, 8],
        ],
        signal: 'overWall',
        end: F(6, 8),
      },
      { level: 3, piece: 1, path: [[6, 2]], signal: 'gapPass', end: RL(0, 6, 2) },
      { level: 4, piece: 2, path: [[6, 3]], signal: 'gapPass', end: RL(0, 6, 3) },
    ] as const;
    for (const c of cases) {
      const label = `Bölüm ${c.level}`;
      const d = grab(levelState(c.level), c.piece);
      // lock guarantee (GDD §14.1/4): the event is reachable from the pick
      if (c.signal === 'overWall') expect(d.canCrossWall, label).toBe(true);
      else expect(d.canEnterRail, label).toBe(true);
      let crossed = false;
      let entered = false;
      for (const [x, y] of c.path) {
        const r = d.follow(x, y);
        crossed ||= r.crossedWall;
        entered ||= r.enteredRail;
      }
      expect(d.current, label).toEqual(c.end);
      expect(c.signal === 'overWall' ? crossed : entered, label).toBe(true);
      expect(c.signal === 'overWall' ? entered : crossed, label).toBe(false);
    }
  });

  it('K-11 S2 a plan `.` is no obstacle for the drag: over a correct (7,0) a B1 is lowered onto the `.` at (7,1); the release there is a site move (row 6) landing on the `.`', () => {
    const s = initialState({
      wall: { height: 2 },
      plan: ['WW', 'W.', 'WW'],
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'W', 2, 0],
      ],
    });
    expect(applyMove(s, drop(0, F(7, 8)), undefined, NO_HELP).status).toBe('applied');
    expect([pieceZone(s, 0), pieceX(s, 0), pieceY(s, 0), hasFlag(s, 0, 'locked')]).toEqual([
      Zone.site,
      7,
      0,
      true,
    ]);
    const d = grab(s, 1);
    expect(d.isReachable(F(7, 0))).toBe(false);
    expect(d.isReachable(F(7, 1))).toBe(true);
    expect(d.classify(F(7, 1))).toMatchObject({ kind: 'siteFree', row: 6 });
    expect(d.classify(F(7, 8))).toMatchObject({ kind: 'siteFree', row: 6 });
    expect(computeFall(s, 1, F(7, 8))).toMatchObject({ landing: { ix: 7, iy: 1 }, distance: 7 });
  });
});
