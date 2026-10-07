import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FREE,
  HYSTERESIS_D2,
  NODES_PER_MODE,
  beginDrag,
  blockCells,
  canPickPiece,
  isCancelled,
  isSiteClosed,
  railMode,
  tryBeginDrag,
} from '../../src/core/movement.ts';
import type { DragRules, DragSession, DropClass } from '../../src/core/movement.ts';
import {
  GF,
  H,
  PF,
  SITE_TROWEL,
  createInitialState,
  enqueuePiece,
  hasFlag,
  setFlag,
  setGapField,
  setHdr,
  setPieceField,
  setSiteOcc,
  setYardOcc,
  siteOcc,
  yardOcc,
} from '../../src/core/state.ts';
import type { GameState } from '../../src/core/state.ts';
import { occupyPiece, refreshSiteMasks, vacatePiece, visibleSegment } from '../../src/core/grid.ts';
import { compile, loadLevel } from '../../src/core/level/compile.ts';
import type { CompiledLevel } from '../../src/core/level/compile.ts';
import type { LevelInput } from '../../src/core/level/schema.ts';
import { SHAPES, shapeById } from '../../src/core/shapes.ts';
import type { ShapeDef } from '../../src/core/shapes.ts';
import { mulberry32 } from '../../src/core/rng.ts';
import type { Rng } from '../../src/core/rng.ts';
import { Zone } from '../../src/core/types.ts';
import type { DragNode, PieceId, ShapeId } from '../../src/core/types.ts';
import { initialState, level } from '../fixtures/builders.ts';
import type { PieceSpec } from '../fixtures/builders.ts';

// --- helpers ---------------------------------------------------------------------------------------------------------

const N = (ix: number, iy: number): DragNode => ({ ix, iy, mode: FREE });
/** RAIL node of gap `g`. */
const R = (g: number, ix: number, iy: number): DragNode => ({ ix, iy, mode: railMode(g) });
const key = (n: DragNode): string => `${n.mode === FREE ? 'F' : `R${n.mode - 1}`}(${n.ix},${n.iy})`;
const keys = (list: readonly DragNode[]): string[] => list.map(key);

function drag(s: GameState, id: PieceId, rules?: DragRules): DragSession {
  const attempt = tryBeginDrag(s, id, rules);
  if (!attempt.ok) throw new Error(`piece ${id} is not pickable: ${attempt.reason}`);
  return attempt.session;
}

/** Yard rows y = 7 (first) … 0 (last), 6 characters: `#` = B1 blocker, anything else = empty. */
function blockers(rows: readonly string[]): PieceSpec[] {
  const out: PieceSpec[] = [];
  rows.forEach((row, i) => {
    [...row].forEach((ch, x) => {
      if (ch === '#') out.push(['B1_0', 'W', x, 7 - i]);
    });
  });
  return out;
}

/** Reachable anchors of one mode, rows y = 9 (first) … 0, `o` reachable. */
function anchorMap(d: DragSession, mode = FREE): string[] {
  const rows: string[] = [];
  for (let y = 9; y >= 0; y--) {
    let row = '';
    for (let x = 0; x < 8; x++) row += d.isReachable({ ix: x, iy: y, mode }) ? 'o' : '.';
    rows.push(row);
  }
  return rows;
}

/** Moves a piece onto the visible site segment at global column x / board row y (elevator 0). */
function toSite(
  s: GameState,
  id: PieceId,
  x: number,
  y: number,
  opts: { locked?: boolean; stuck?: boolean } = {},
) {
  vacatePiece(s, id);
  setPieceField(s, id, PF.zone, Zone.site);
  setPieceField(s, id, PF.x, x);
  setPieceField(s, id, PF.y, y);
  setPieceField(s, id, PF.seg, visibleSegment(s));
  setFlag(s, id, 'locked', opts.locked ?? true);
  setFlag(s, id, 'stuck', opts.stuck ?? false);
  occupyPiece(s, id);
  refreshSiteMasks(s, visibleSegment(s));
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
function levelFile(id: number): CompiledLevel {
  const json: unknown = JSON.parse(
    readFileSync(join(ROOT, 'levels', `level_${String(id).padStart(3, '0')}.json`), 'utf8'),
  );
  const loaded = loadLevel(json);
  if (!loaded.ok) throw new Error(`level ${id} does not load: ${JSON.stringify(loaded.issues)}`);
  return loaded.level;
}

// --- K-04 wall boundary ------------------------------------------------------------------------------------------------

describe('K-04 wall boundary (edge model, R-03)', () => {
  it('K-04 closed boundary rows block a FREE crossing; rows at or above the wall height are open', () => {
    const s = initialState({ wall: { height: 6 }, pieces: [['B1_0', 'W', 5, 2]] });
    const d = drag(s, 0);
    expect(keys(d.neighbours(N(5, 2)))).not.toContain('F(6,2)');
    expect(keys(d.neighbours(N(5, 5)))).not.toContain('F(6,5)');
    expect(keys(d.neighbours(N(5, 6)))).toContain('F(6,6)');
    expect(keys(d.neighbours(N(6, 2)))).not.toContain('F(5,2)');
    // (6,2) is still reachable: over the wall at row 6, then down the empty site column
    expect(d.distanceFromStart(N(6, 2))).toBe(4 + 1 + 4);
  });

  it('K-04 crane rows 8–9 are always open, even above an 8-high wall', () => {
    const s = initialState({ wall: { height: 8 }, pieces: [['B1_0', 'W', 5, 0]] });
    const d = drag(s, 0);
    expect(keys(d.neighbours(N(5, 7)))).not.toContain('F(6,7)');
    expect(keys(d.neighbours(N(5, 8)))).toContain('F(6,8)');
    expect(keys(d.neighbours(N(5, 9)))).toContain('F(6,9)');
    expect(d.isReachable(N(6, 0))).toBe(true);
  });

  it('K-04 an open gap opens its rows only to RAIL mode; a closed gap opens nothing', () => {
    const s = initialState({
      wall: {
        height: 6,
        gaps: [
          { type: 'static', y: 2, size: 2 },
          { type: 'locked', y: 0, size: 1, keyId: 'a' },
        ],
      },
      pieces: [
        ['B1_0', 'W', 5, 2],
        ['B1_0', 'W', 5, 0],
      ],
    });
    const open = drag(s, 0);
    expect(keys(open.neighbours(N(5, 2)))).toContain('R0(6,2)');
    expect(keys(open.neighbours(N(5, 2)))).not.toContain('F(6,2)');
    const closed = drag(s, 1);
    expect(keys(closed.neighbours(N(5, 0))).filter((k) => k.includes('6,0'))).toEqual([]);
    expect(closed.isReachable(R(1, 6, 0))).toBe(false);
    // the rule hook decides alone: a K-40-like hook opens the locked gap
    const k40: DragRules = { canPassGap: () => true };
    expect(drag(s, 1, k40).isReachable(R(1, 6, 0))).toBe(true);
  });
});

// --- K-05 crane area -------------------------------------------------------------------------------------------------

describe('K-05 crane area and wall height', () => {
  it('K-05 3-tall piece cannot clear an 8-high wall; at height 7 it can (GDD example)', () => {
    const at8 = drag(initialState({ wall: { height: 8 }, pieces: [['I3_0', 'W', 5, 0]] }), 0);
    expect(at8.reachableNodes().filter((n) => n.ix >= 6)).toEqual([]);
    expect(at8.isReachable(N(5, 7))).toBe(true); // cells 7–9: the highest anchor
    const at7 = drag(initialState({ wall: { height: 7 }, pieces: [['I3_0', 'W', 5, 0]] }), 0);
    expect(keys(at7.neighbours(N(5, 7)))).toContain('F(6,7)');
    expect(at7.isReachable(N(6, 0))).toBe(true);
  });

  it('K-05 at height 8 only blocks at most 2 tall clear the wall (B1, D2, O4, C3); 3–4 tall ones do not', () => {
    const crosses = (shape: ShapeId): boolean =>
      drag(initialState({ wall: { height: 8 }, pieces: [[shape, 'W', 0, 0]] }), 0)
        .reachableNodes()
        .some((n) => n.ix >= 6);
    for (const shape of ['B1_0', 'D2_0', 'D2_90', 'O4_0', 'C3_0', 'C3_90', 'C3_180', 'C3_270'] as const)
      expect(crosses(shape), shape).toBe(true);
    for (const shape of ['I3_0', 'I4_0', 'L4_0', 'J4_0', 'T4_0', 'S4_0', 'Z4_0', 'L4_180', 'T4_180'] as const)
      expect(crosses(shape), shape).toBe(false);
  });

  it('K-05 K-07 row 3: release over the yard with any cell in the crane area cancels', () => {
    const d = drag(initialState({ pieces: [['D2_0', 'W', 2, 0]] }), 0);
    expect(d.classify(N(2, 6))).toMatchObject({ kind: 'yard', row: 2 });
    expect(d.classify(N(2, 7))).toMatchObject({ kind: 'cancel', reason: 'craneOverYard', row: 3 });
    expect(d.classify(N(2, 8))).toMatchObject({ kind: 'cancel', reason: 'craneOverYard', row: 3 });
  });

  it('K-05 tall piece emits blockedByWallHeight once per drag', () => {
    const s = initialState({ wall: { height: 8 }, pieces: [['I3_0', 'W', 5, 5]] });
    const d = drag(s, 0);
    const first = d.follow(6.5, 8);
    expect(first.node).toEqual(N(5, 7));
    expect(first.blockedByWallHeight).toBe(true);
    expect(d.follow(6.6, 8.2).blockedByWallHeight).toBe(false);
    expect(d.follow(6.5, 9).blockedByWallHeight).toBe(false);
    // a new drag may emit it again
    expect(drag(s, 0).follow(6.5, 8).blockedByWallHeight).toBe(true);
  });

  it('K-05 S4_0 at height 8 emits blockedByWallHeight (also Z4_0, L4_0); D2_0 and O4_0 cross, no signal', () => {
    for (const shape of ['S4_0', 'Z4_0', 'L4_0'] as const) {
      const d = drag(initialState({ wall: { height: 8 }, pieces: [[shape, 'W', 0, 0]] }), 0);
      const r = d.follow(6.2, 8);
      expect(r.node.ix, shape).toBeLessThan(6); // in the yard or straddling: never fully on the site
      expect(r.blockedByWallHeight, shape).toBe(true);
    }
    for (const shape of ['D2_0', 'O4_0'] as const) {
      const d = drag(initialState({ wall: { height: 8 }, pieces: [[shape, 'W', 0, 0]] }), 0);
      const r = d.follow(6.2, 8);
      expect(r.node.ix, shape).toBe(6);
      expect(r.blockedByWallHeight, shape).toBe(false);
    }
  });

  it('K-05 no blockedByWallHeight while the target is over the yard or below the crane area', () => {
    const d = drag(initialState({ wall: { height: 8 }, pieces: [['I3_0', 'W', 5, 0]] }), 0);
    expect(d.follow(3, 8).blockedByWallHeight).toBe(false);
    expect(d.follow(6.5, 2).blockedByWallHeight).toBe(false);
    expect(d.follow(6.5, 8).blockedByWallHeight).toBe(true);
  });
});

// --- K-07 release table ------------------------------------------------------------------------------------------------

describe('K-07 release classification (cancel preview)', () => {
  const gapLevel = {
    wall: { height: 4, gaps: [{ type: 'static' as const, y: 1, size: 2 }] },
    pieces: [['D2_90', 'W', 2, 1]] as PieceSpec[],
  };

  it('K-07 rows 1, 2, 3, 4, 6, 7 in GDD order; E-06 rail straddle and E-28 crane straddle cancel', () => {
    const d = drag(initialState(gapLevel), 0);
    const rows: [DragNode, Partial<DropClass>][] = [
      [N(2, 1), { kind: 'cancel', reason: 'sameSpot', row: 1 }],
      [N(0, 0), { kind: 'yard', row: 2 }],
      [N(0, 8), { kind: 'cancel', reason: 'craneOverYard', row: 3 }],
      [N(5, 8), { kind: 'cancel', reason: 'straddle', row: 4 }], // E-28
      [R(0, 5, 1), { kind: 'cancel', reason: 'straddle', row: 4 }], // E-06
      [N(6, 8), { kind: 'siteFree', row: 6 }],
      [N(6, 0), { kind: 'siteFree', row: 6 }],
      [R(0, 6, 1), { kind: 'siteRail', row: 7, gap: 0 }],
    ];
    for (const [node, want] of rows) {
      expect(d.isReachable(node), key(node)).toBe(true);
      expect(d.classify(node), key(node)).toMatchObject(want);
    }
    expect(d.classify()).toMatchObject({ reason: 'sameSpot' }); // default: the current node
    expect(isCancelled(d.classify(N(5, 8)))).toBe(true);
    expect(isCancelled(d.classify(N(6, 8)))).toBe(false);
  });

  it('K-07 row 5 / E-27: a closed site cancels site drops (FREE and rail); straddle and yard rows come first', () => {
    const s = initialState(gapLevel);
    setHdr(s, H.deliveryCursor, s.lvl.segments.length);
    expect(isSiteClosed(s)).toBe(true);
    const d = drag(s, 0);
    expect(d.classify(N(6, 8))).toMatchObject({ kind: 'cancel', reason: 'siteClosed', row: 5 });
    expect(d.classify(R(0, 6, 1))).toMatchObject({ kind: 'cancel', reason: 'siteClosed', row: 5 });
    expect(d.classify(N(5, 8))).toMatchObject({ reason: 'straddle', row: 4 });
    expect(d.classify(N(0, 0))).toMatchObject({ kind: 'yard', row: 2 });
    // the rule hook can decide instead
    expect(drag(s, 0, { siteClosed: () => false }).classify(N(6, 8))).toMatchObject({ kind: 'siteFree' });
  });

  it('K-07 release straddling the boundary cancels (E-06 in a gap, E-28 above the wall)', () => {
    const s = initialState({
      wall: { height: 6, gaps: [{ type: 'static', y: 2, size: 1 }] },
      pieces: [
        ['D2_90', 'W', 3, 2],
        ['C3_0', 'W', 0, 0],
      ],
    });
    const rail = drag(s, 0);
    expect(rail.follow(5, 2).node).toEqual(R(0, 5, 2));
    expect(rail.classify()).toMatchObject({ kind: 'cancel', reason: 'straddle', row: 4 });
    const air = drag(s, 1);
    for (const node of [N(5, 6), N(5, 8)]) {
      expect(air.isReachable(node), key(node)).toBe(true);
      expect(air.classify(node), key(node)).toMatchObject({ kind: 'cancel', reason: 'straddle', row: 4 });
    }
  });

  it('K-07 a node outside R classifies as invalid', () => {
    const d = drag(
      initialState({ pieces: [['D2_90', 'W', 2, 1], ...blockers(['', '', '', '', '', '', '#'])] }),
      0,
    );
    expect(d.classify(N(0, 1))).toMatchObject({ kind: 'cancel', reason: 'invalid', row: 0 }); // (0,1) blocked
    expect(d.classify(N(7, 0))).toMatchObject({ reason: 'invalid' }); // out of the grid
    expect(d.classify({ ix: 2, iy: 1, mode: 9 })).toMatchObject({ reason: 'invalid' });
  });

  it('K-07 row 1 debris released at start cells in other mode cancels', () => {
    const s = initialState({
      wall: { height: 5, gaps: [{ type: 'static', y: 3, size: 1 }] },
      pieces: [['B1_0', 'W', 0, 0]],
      debris: [['D2_90', 'W', 6, 3]],
    });
    const d = drag(s, 1);
    expect(keys(d.startNodes)).toEqual(['F(6,3)', 'R0(6,3)']);
    expect(d.classify(N(6, 3))).toMatchObject({ reason: 'sameSpot', row: 1 });
    expect(d.classify(R(0, 6, 3))).toMatchObject({ reason: 'sameSpot', row: 1 });
  });
});

// --- K-08 path and sticky follow -------------------------------------------------------------------------------------

describe('K-08 BFS path and sticky follow', () => {
  it('K-08 GDD example: the finger over a blocked cell keeps the block; to (3,9) it goes (2,7), (2,8), (3,8), (3,9)', () => {
    const s = initialState({
      wall: { height: 4 },
      pieces: [
        ['B1_0', 'W', 2, 6],
        ...blockers(['##.###', '##.###', '######', '######', '######', '######']),
      ],
    });
    // rows y = 7 … 2 above; rows 1 and 0 are empty but closed off by the full row 2
    const d = drag(s, 0);
    const stay = d.follow(2, 3);
    expect(stay.changed).toBe(false);
    expect(stay.node).toEqual(N(2, 6));
    const go = d.follow(3, 9);
    expect(go.changed).toBe(true);
    expect(keys(go.path)).toEqual(['F(2,7)', 'F(2,8)', 'F(3,8)', 'F(3,9)']);
    expect(d.current).toEqual(N(3, 9));
  });

  it('K-08 the reachable set is fixed at pick time; later state changes do not alter the session', () => {
    const s = initialState({ pieces: [['B1_0', 'W', 2, 6]] });
    const d = drag(s, 0);
    const before = keys(d.reachableNodes());
    setYardOcc(s, 2, 7, -1);
    setYardOcc(s, 3, 6, -1);
    expect(keys(d.reachableNodes())).toEqual(before);
    expect(d.isReachable(N(2, 7))).toBe(true);
  });

  it('K-08 every follow path is a chain of unit steps through R (the block never teleports)', () => {
    const lvl = levelFile(3);
    const s = createInitialState(lvl);
    const rng = mulberry32(8);
    for (let id = 0; id < lvl.staticPieceCount; id++) {
      const d = beginDrag(s, id);
      if (!d) continue;
      for (let i = 0; i < 120; i++) {
        let prev = d.current;
        const r = d.follow(rng.next() * 9 - 0.5, rng.next() * 11 - 0.5);
        for (const next of r.path) {
          expect(d.isReachable(next)).toBe(true);
          const step = Math.abs(next.ix - prev.ix) + Math.abs(next.iy - prev.iy);
          if (step === 0) {
            expect(keys(d.startNodes)).toEqual(expect.arrayContaining([key(prev), key(next)]));
          } else {
            expect(keys(d.neighbours(prev))).toContain(key(next));
          }
          prev = next;
        }
        expect(prev).toEqual(r.node);
        expect(r.path.length === 0).toBe(!r.changed);
      }
    }
  });

  it('K-08 tie-break 1: fewer BFS steps from the current node wins', () => {
    const s = initialState({ wall: { height: 8 }, pieces: [['B1_0', 'W', 2, 7], ...blockers(['##.###'])] });
    const d = drag(s, 0);
    d.moveTo(N(2, 8));
    // (3,8) and (4,8) are both 0.25 away; (3,8) is 1 step from (2,8), (4,8) is 2
    expect(d.nearest(3.5, 8)).toEqual(N(3, 8));
    expect(d.follow(3.5, 8).node).toEqual(N(3, 8));
  });

  it('K-08 tie-break 2: FREE before RAIL at equal distance and equal BFS steps', () => {
    const level5 = { wall: { height: 5, gaps: [{ type: 'static' as const, y: 3, size: 1 }] } };
    // from (5,5): FREE(6,3) = right, down, down; RAIL(6,3) = down, down, right → both 3 steps
    const high = drag(initialState({ ...level5, pieces: [['B1_0', 'W', 5, 5]] }), 0);
    expect(high.distanceFromCurrent(N(6, 3))).toBe(3);
    expect(high.distanceFromCurrent(R(0, 6, 3))).toBe(3);
    expect(high.follow(6, 3).node).toEqual(N(6, 3));
    // from (5,3) the rail is 1 step, FREE(6,3) 5 steps: tie-break 1 decides first
    const low = drag(initialState({ ...level5, pieces: [['B1_0', 'W', 5, 3]] }), 0);
    expect(low.follow(6, 3).node).toEqual(R(0, 6, 3));
  });

  it('K-08 tie-break 3: smaller y at equal distance, equal steps, same mode', () => {
    // y = 7 … 0; (4,1) and (4,3) are 1 away from p = (4,2) and 3 steps from (2,2)
    const layout = ['######', '######', '######', '######', '##...#', '##.###', '##...#', '######'];
    const s = initialState({ pieces: [['B1_0', 'W', 2, 2], ...blockers(layout)] });
    const d = drag(s, 0);
    expect(d.distanceFromCurrent(N(4, 1))).toBe(3);
    expect(d.distanceFromCurrent(N(4, 3))).toBe(3);
    expect(d.follow(4, 2).node).toEqual(N(4, 1));
  });

  it('K-08 tie-break 4: smaller x at equal distance, equal steps, same mode and row', () => {
    // (1,4) and (3,4) are 1 away from p = (2,4) and 3 steps from (2,2)
    const layout = ['######', '######', '######', '#.#.##', '#.#.##', '#...##', '######', '######'];
    const s = initialState({ pieces: [['B1_0', 'W', 2, 2], ...blockers(layout)] });
    const d = drag(s, 0);
    expect(d.distanceFromCurrent(N(1, 4))).toBe(3);
    expect(d.distanceFromCurrent(N(3, 4))).toBe(3);
    expect(d.follow(2, 4).node).toEqual(N(1, 4));
  });

  it('K-08 tie-break 3 between two rails: the smaller y wins whatever the gap order (data order or runtime y swap)', () => {
    // GDD K-08 ties: (2) FREE before RAIL, (3) smaller y, (4) smaller x — the gap index is not a criterion.
    // Piece 0 at (4,2), blocker at (5,2), debris at (6,2): R(6,1) and R(6,3) are 1 away from p = (6,2), 3 steps each.
    const board = (ys: readonly [number, number]): GameState =>
      initialState({
        wall: { height: 5, gaps: ys.map((y) => ({ type: 'static' as const, y, size: 1 })) },
        plan: ['WW', 'WW', 'WW'],
        pieces: [
          ['B1_0', 'W', 4, 2],
          ['B1_0', 'W', 5, 2],
        ],
        debris: [['B1_0', 'R', 6, 2]],
      });
    const runtimeSwap = board([1, 3]);
    // a W5-style runtime move: gap 0 now covers row 3 and gap 1 row 1 (the data order no longer matches y)
    setGapField(runtimeSwap, 0, GF.y, 3);
    setGapField(runtimeSwap, 1, GF.y, 1);
    for (const [label, s, low] of [
      ['data [1, 3]', board([1, 3]), 0],
      ['data [3, 1]', board([3, 1]), 1],
      ['runtime swap', runtimeSwap, 1],
    ] as const) {
      const d = drag(s, 0);
      const high = 1 - low;
      expect(d.distanceFromCurrent(R(low, 6, 1)), label).toBe(3);
      expect(d.distanceFromCurrent(R(high, 6, 3)), label).toBe(3);
      expect(d.isReachable(N(6, 2)), label).toBe(false);
      expect(d.distanceFromCurrent(N(6, 3)), label).toBeGreaterThan(3);
      expect(d.distanceFromCurrent(N(7, 2)), label).toBeGreaterThan(3);
      expect(key(d.nearest(6, 2)), label).toBe(key(R(low, 6, 1)));
      expect(key(d.follow(6, 2).node), label).toBe(key(R(low, 6, 1)));
    }
  });

  it('K-08 tie-break 2 before 3 with two gaps: FREE beats RAIL even when the rail node has the smaller y', () => {
    // piece 0 at (4,3), debris at (6,4); p = (6,4): FREE (5,4) and RAIL (6,3) are 1 away and 2 steps from (4,3)
    for (const ys of [
      [1, 3],
      [3, 1],
    ] as const) {
      const s = initialState({
        wall: { height: 5, gaps: ys.map((y) => ({ type: 'static' as const, y, size: 1 })) },
        plan: ['WW', 'WW', 'WW', 'WW', 'WW'],
        pieces: [['B1_0', 'W', 4, 3]],
        debris: [['B1_0', 'R', 6, 4]],
      });
      const d = drag(s, 0);
      const g3 = ys.indexOf(3);
      expect(d.distanceFromCurrent(R(g3, 6, 3))).toBe(2);
      expect(d.distanceFromCurrent(N(5, 4))).toBe(2);
      expect(d.nearest(6, 4)).toEqual(N(5, 4));
    }
  });

  it('K-08 hysteresis accepts exactly 0.2 improvement and rejects less', () => {
    expect(HYSTERESIS_D2).toBe(0.2);
    const s = initialState({ pieces: [['B1_0', 'W', 2, 2]] });
    // p = (2.6, 2): d²(2,2) = 0.36, d²(3,2) = 0.16 → exactly 0.2 better
    const exact = drag(s, 0).follow(2.6, 2);
    expect(exact.changed).toBe(true);
    expect(exact.node).toEqual(N(3, 2));
    // p = (2.59, 2): 0.18 better → stays
    const less = drag(s, 0).follow(2.59, 2);
    expect(less.changed).toBe(false);
    expect(less.node).toEqual(N(2, 2));
  });

  it('K-08 hidden items (screw, key) do not block the path; crates and bags do (K-09 d)', () => {
    const s = initialState({
      pieces: [['B1_0', 'W', 2, 0]],
      obstacles: [
        { type: 'screw', x: 2, y: 1 },
        { type: 'key', x: 2, y: 2, id: 'a' },
        { type: 'crate', x: 1, y: 0, hp: 2 },
        { type: 'cement_bag', x: 3, y: 0 },
      ],
    });
    const d = drag(s, 0);
    expect(d.distanceFromStart(N(2, 2))).toBe(2);
    expect(d.isReachable(N(1, 0))).toBe(false);
    expect(d.isReachable(N(3, 0))).toBe(false);
    expect(d.distanceFromStart(N(1, 1))).toBe(2);
  });

  it('K-08 moveTo follows the BFS path and refuses nodes outside R', () => {
    const d = drag(initialState({ pieces: [['B1_0', 'W', 0, 0]] }), 0);
    expect(keys(d.moveTo(N(0, 3)).path)).toEqual(['F(0,1)', 'F(0,2)', 'F(0,3)']);
    expect(d.moveTo(N(0, 3)).changed).toBe(false);
    expect(keys(d.pathTo(N(1, 3)) ?? [])).toEqual(['F(1,3)']);
    expect(() => d.moveTo(N(7, 9.5))).toThrow(RangeError);
    expect(d.pathTo({ ix: 0, iy: 0, mode: 3 })).toBeNull();
  });

  it('K-08 a site block whose start breaks open sky can always step back to its start (two-way edges)', () => {
    const s = initialState({
      pieces: [['B1_0', 'W', 0, 0]],
      debris: [
        ['B1_0', 'R', 6, 2],
        ['B1_0', 'R', 6, 4], // over the dragged debris: its FREE start has no open sky
      ],
    });
    const d = drag(s, 1);
    expect(d.follow(7, 2).node).toEqual(N(7, 2));
    expect(keys(d.neighbours(N(7, 2)))).toContain('F(6,2)');
    expect(d.distanceFromCurrent(N(6, 2))).toBe(1);
    const back = d.follow(6, 2);
    expect(keys(back.path)).toEqual(['F(6,2)']);
    expect(d.classify()).toMatchObject({ reason: 'sameSpot' });
    expect(d.isReachable(N(6, 3))).toBe(false); // still no open sky between the two
  });

  it('K-08 interleaved sessions (scene drag + solver / tutorial checks) never disturb each other', () => {
    const s = createInitialState(levelFile(3));
    const targets: [number, number][] = [
      [6, 8],
      [0, 9],
      [6, 0],
      [3, 8],
      [7, 9],
    ];
    const replay = (id: PieceId): string[] => {
      const d = drag(s, id);
      return targets.map(([x, y]) => keys(d.follow(x, y).path).join(' '));
    };
    const alone0 = replay(0);
    const alone2 = replay(2);
    const a = drag(s, 0);
    const b = drag(s, 2);
    const mixed0: string[] = [];
    const mixed2: string[] = [];
    for (const [x, y] of targets) {
      mixed0.push(keys(a.follow(x, y).path).join(' '));
      drag(s, 1); // a third BFS in between
      mixed2.push(keys(b.follow(x, y).path).join(' '));
    }
    expect(mixed0).toEqual(alone0);
    expect(mixed2).toEqual(alone2);
  });
});

// --- K-09 pick gate ----------------------------------------------------------------------------------------------------

describe('K-09 pickability', () => {
  it('K-09 GDD example: the D2_0 under the crane area is pickable; the buried D2_0 is not', () => {
    const layout = ['.#####', '.#####', '.#####', '.#####', '######', '######', '######', '######'];
    const s = initialState({ pieces: [['D2_0', 'W', 0, 6], ['D2_0', 'W', 0, 4], ...blockers(layout)] });
    expect(canPickPiece(s, 0)).toBe(true);
    expect(drag(s, 0).isReachable(N(0, 8))).toBe(true);
    expect(tryBeginDrag(s, 1)).toEqual({ ok: false, reason: 'immovable' });
    expect(beginDrag(s, 1)).toBeNull();
  });

  it('K-09 (b) K-14 a locked block cannot be picked', () => {
    const s = initialState({ pieces: [['D2_90', 'W', 0, 0]] });
    toSite(s, 0, 6, 0, { locked: true });
    expect(tryBeginDrag(s, 0)).toEqual({ ok: false, reason: 'locked' });
  });

  it('K-09 (c) a canPick rule (Y3 chain, Y4 wet) forbids the pick; core has no obstacle-specific check', () => {
    const s = initialState({
      pieces: [
        ['B1_0', 'W', 0, 0, ['chained']],
        ['B1_0', 'W', 2, 0, ['wet'], 2],
        ['B1_0', 'W', 4, 0],
      ],
    });
    const rules: DragRules = { canPick: (st, id) => !hasFlag(st, id, 'chained') && !hasFlag(st, id, 'wet') };
    expect(tryBeginDrag(s, 0, rules)).toEqual({ ok: false, reason: 'rule' });
    expect(tryBeginDrag(s, 1, rules)).toEqual({ ok: false, reason: 'rule' });
    expect(canPickPiece(s, 2, rules)).toBe(true);
    expect(canPickPiece(s, 0)).toBe(true);
  });

  it('K-09 (d) crates and bags are not pieces: they cannot be picked and they block the path', () => {
    const s = initialState({
      pieces: [
        ['B1_0', 'W', 2, 0],
        ['B1_0', 'W', 2, 1],
      ],
      obstacles: [
        { type: 'crate', x: 1, y: 0 },
        { type: 'cement_bag', x: 3, y: 0 },
      ],
    });
    expect(tryBeginDrag(s, 0)).toEqual({ ok: false, reason: 'immovable' });
    expect(tryBeginDrag(s, s.lvl.layout.counts.pieces)).toEqual({ ok: false, reason: 'notOnBoard' });
    expect(tryBeginDrag(s, -1)).toEqual({ ok: false, reason: 'notOnBoard' });
    expect(canPickPiece(s, 1)).toBe(true);
  });

  it('K-09 (e) E-30 a block cannot be picked with 0 moves left', () => {
    const s = initialState({ pieces: [['B1_0', 'W', 0, 0]] });
    setHdr(s, H.movesLeft, 0);
    expect(tryBeginDrag(s, 0)).toEqual({ ok: false, reason: 'noMoves' });
    setHdr(s, H.movesLeft, 1);
    expect(canPickPiece(s, 0)).toBe(true);
  });

  it('K-09 queued, pending (undelivered batch) and gone pieces cannot be picked', () => {
    const s = initialState({
      plan: [['WW'], ['YY']],
      pieces: [['B1_0', 'W', 0, 0]],
      batches: [{ forSegment: 1, pieces: [['B1_0', 'Y', 1, 8]] }],
    });
    expect(tryBeginDrag(s, 1)).toEqual({ ok: false, reason: 'notOnBoard' }); // pending
    vacatePiece(s, 0);
    enqueuePiece(s, 0);
    expect(tryBeginDrag(s, 0)).toEqual({ ok: false, reason: 'notOnBoard' }); // queue
    setPieceField(s, 0, PF.zone, Zone.gone);
    expect(tryBeginDrag(s, 0)).toEqual({ ok: false, reason: 'notOnBoard' });
  });

  it('K-09 site piece of a non-visible segment cannot be picked (K-22)', () => {
    const s = initialState({
      plan: [['WW'], ['YY']],
      pieces: [['B1_0', 'W', 0, 0]],
      debris: [['B1_0', 'R', 6, 0, 1]],
    });
    expect(tryBeginDrag(s, 1)).toEqual({ ok: false, reason: 'hiddenSegment' });
    setHdr(s, H.activeSeg, 1);
    expect(canPickPiece(s, 1)).toBe(true);
  });

  it('K-09 site piece of non-front carousel segment cannot be picked', () => {
    const s = initialState({
      mode: 'carousel',
      carouselEvery: 2,
      plan: [['WW'], ['YY']],
      pieces: [['B1_0', 'W', 0, 0]],
      debris: [['B1_0', 'R', 6, 0, 1]],
    });
    expect(tryBeginDrag(s, 1)).toEqual({ ok: false, reason: 'hiddenSegment' });
    setHdr(s, H.frontSeg, 1);
    expect(canPickPiece(s, 1)).toBe(true);
  });

  it('K-09 debris in a closed gap row is not rail-pickable', () => {
    const s = initialState({
      wall: { height: 5, gaps: [{ type: 'locked', y: 3, size: 1, keyId: 'k' }] },
      pieces: [['B1_0', 'W', 0, 0]],
      debris: [['B1_0', 'R', 6, 3]],
    });
    expect(keys(drag(s, 1).startNodes)).toEqual(['F(6,3)']);
    // unlocked (or K-40 open shutter through the rule hook): RAIL start too
    expect(keys(drag(s, 1, { canPassGap: () => true }).startNodes)).toEqual(['F(6,3)', 'R0(6,3)']);
  });

  it('K-09 two start nodes do not make immovable debris pickable', () => {
    const s = initialState({
      wall: { height: 5, gaps: [{ type: 'static', y: 3, size: 1 }] },
      pieces: [['B1_0', 'W', 5, 3]],
      debris: [
        ['B1_0', 'R', 6, 3],
        ['B1_0', 'R', 6, 2],
        ['B1_0', 'R', 6, 4],
        ['B1_0', 'R', 7, 3],
      ],
    });
    expect(tryBeginDrag(s, 1)).toEqual({ ok: false, reason: 'immovable' });
    // freeing the yard cell behind the gap makes the RAIL start move
    vacatePiece(s, 0);
    setPieceField(s, 0, PF.zone, Zone.gone);
    expect(drag(s, 1).isReachable(N(5, 3))).toBe(true);
  });
});

// --- K-10 yard ---------------------------------------------------------------------------------------------------------

describe('K-10 yard repositioning', () => {
  it('K-10 any other empty yard position is a yard placement (K-07 row 2); the start cancels (row 1)', () => {
    const s = initialState({ pieces: [['O4_0', 'W', 2, 6], ...blockers(['', '', '', '', '....##'])] });
    const d = drag(s, 0);
    expect(d.isReachable(N(4, 6))).toBe(true);
    expect(d.classify(N(4, 6))).toMatchObject({ kind: 'yard', row: 2 });
    expect(d.classify(N(4, 4))).toMatchObject({ kind: 'yard', row: 2 });
    expect(d.isReachable(N(4, 3))).toBe(false); // (4,3), (5,3) are blocked
    expect(d.classify(N(2, 6))).toMatchObject({ kind: 'cancel', reason: 'sameSpot' });
  });
});

// --- K-11 over the wall ----------------------------------------------------------------------------------------------

describe('K-11 entry over the wall', () => {
  it('K-11 GDD example: D2_90 over the wall descends to the silhouette, never below it', () => {
    const s = initialState({
      wall: { height: 2 },
      pieces: [
        ['D2_90', 'Y', 0, 0],
        ['D2_0', 'W', 2, 0],
      ],
    });
    const empty = drag(s, 0);
    expect(empty.isReachable(N(6, 8))).toBe(true);
    expect(empty.isReachable(N(6, 0))).toBe(true);
    expect(empty.classify(N(6, 1))).toMatchObject({ kind: 'siteFree', row: 6 });
    // a locked D2_0 at (6,0)–(6,1): top(6) = 2 → the lowest anchor is (6,2)
    toSite(s, 1, 6, 0, { locked: true });
    const d = drag(s, 0);
    expect(anchorMap(d).map((row) => row.slice(6))).toEqual([
      'o.',
      'o.',
      'o.',
      'o.',
      'o.',
      'o.',
      'o.',
      'o.',
      '..',
      '..',
    ]);
  });

  it('K-11 in FREE mode a cell crosses the boundary only in a row y ≥ height', () => {
    const d = drag(initialState({ wall: { height: 4 }, pieces: [['D2_0', 'W', 5, 0]] }), 0);
    expect(keys(d.neighbours(N(5, 3)))).not.toContain('F(6,3)'); // rows 3–4: row 3 closed
    expect(keys(d.neighbours(N(5, 4)))).toContain('F(6,4)'); // rows 4–5 open
    expect(d.isReachable(N(6, 0))).toBe(true);
  });
});

// --- K-12 rail ---------------------------------------------------------------------------------------------------------

describe('K-12 entry through a gap (rail)', () => {
  const gap3 = { wall: { height: 5, gaps: [{ type: 'static' as const, y: 3, size: 1 }] } };

  it('K-12 W1 GDD example: D2_90 enters the y = 3 gap from (4,3) and lands on the rail; D2_0 cannot enter', () => {
    const s = initialState({
      ...gap3,
      pieces: [
        ['D2_90', 'W', 4, 3],
        ['D2_0', 'W', 0, 3],
      ],
    });
    const d = drag(s, 0);
    expect(keys(d.neighbours(N(4, 3)))).toContain('R0(5,3)');
    expect(d.distanceFromStart(R(0, 6, 3))).toBe(2);
    expect(d.classify(R(0, 5, 3))).toMatchObject({ reason: 'straddle' });
    expect(d.classify(R(0, 6, 3))).toMatchObject({ kind: 'siteRail', row: 7, gap: 0 });
    expect(
      drag(s, 1)
        .reachableNodes()
        .filter((n) => n.mode !== FREE),
    ).toEqual([]);
  });

  it('K-12 on the rail a block moves only horizontally and leaves it to the left, back to FREE', () => {
    const d = drag(initialState({ ...gap3, pieces: [['B1_0', 'W', 5, 3]] }), 0);
    expect(keys(d.neighbours(R(0, 6, 3)))).toEqual(['F(5,3)', 'R0(7,3)']);
    expect(keys(d.neighbours(R(0, 7, 3)))).toEqual(['R0(6,3)']);
    expect(anchorMap(d, railMode(0))).toEqual([
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '......oo',
      '........',
      '........',
      '........',
    ]);
  });

  it('K-12 a rail is entered only from the yard side, never from a FREE block on the site', () => {
    const d = drag(initialState({ ...gap3, pieces: [['B1_0', 'W', 0, 0]] }), 0);
    expect(d.isReachable(N(6, 3))).toBe(true); // dropped down the empty site column
    expect(keys(d.neighbours(N(6, 3)))).toEqual(['F(7,3)', 'F(6,2)', 'F(6,4)']);
    expect(d.isReachable(R(0, 6, 3))).toBe(true); // only through (5,3)
    expect(d.pathTo(R(0, 6, 3))?.at(-2)).toEqual(N(5, 3));
  });

  it('K-12 piece must fit the gap rows entirely', () => {
    const gap2 = { wall: { height: 5, gaps: [{ type: 'static' as const, y: 2, size: 2 }] } };
    const aligned = drag(initialState({ ...gap2, pieces: [['D2_0', 'W', 5, 2]] }), 0);
    expect(aligned.isReachable(R(0, 6, 2))).toBe(true);
    expect(aligned.isReachable(R(0, 6, 3))).toBe(false); // rows 3–4: row 4 is outside the gap
    const narrow = drag(initialState({ ...gap3, pieces: [['D2_0', 'W', 5, 3]] }), 0);
    expect(narrow.reachableNodes().filter((n) => n.mode !== FREE)).toEqual([]);
  });

  it('K-12 N14 debris example: in an open gap row it is pulled left through the gap to the yard', () => {
    const s = initialState({ ...gap3, pieces: [['B1_0', 'W', 0, 0]], debris: [['D2_90', 'R', 6, 3]] });
    const d = drag(s, 1);
    expect(keys(d.startNodes)).toEqual(['F(6,3)', 'R0(6,3)']);
    expect(d.distanceFromStart(N(4, 3))).toBe(2);
    expect(d.classify(N(4, 3))).toMatchObject({ kind: 'yard', row: 2 });
    // closed gap: only FREE, up and over the wall (2 up, 2 left, 2 down)
    const locked = initialState({
      wall: { height: 5, gaps: [{ type: 'locked', y: 3, size: 1, keyId: 'k' }] },
      pieces: [['B1_0', 'W', 0, 0]],
      debris: [['D2_90', 'R', 6, 3]],
    });
    expect(drag(locked, 1).distanceFromStart(N(4, 3))).toBe(6);
  });

  it('K-12 stuck mortar never starts in rail', () => {
    const s = initialState({ ...gap3, pieces: [['B1_0', 'W', 0, 0, ['mortar']]] });
    toSite(s, 0, 6, 3, { locked: false, stuck: true });
    const d = drag(s, 0);
    expect(keys(d.startNodes)).toEqual(['F(6,3)']);
    expect(d.isReachable(N(5, 3))).toBe(true); // through the yard: up, over, down
    expect(d.distanceFromStart(N(5, 3))).toBeGreaterThan(1);
  });

  it('K-12 N6 heavy blocks never cross the boundary, not even through a fitting gap', () => {
    const d = drag(initialState({ ...gap3, pieces: [['I3_90', 'W', 3, 3]] }), 0);
    expect(d.shape.heavy).toBe(true);
    expect(d.reachableNodes().filter((n) => n.ix + 3 > 6 || n.mode !== FREE)).toEqual([]);
    expect(d.isReachable(N(3, 9))).toBe(true);
  });
});

// --- K-13 no side entry under an overhang ----------------------------------------------------------------------------

describe('K-13 no free side entry on the site', () => {
  it('K-13 GDD example: a FREE block cannot slide under a rail-placed overhang', () => {
    const s = initialState({
      wall: { height: 2 },
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'W', 2, 0],
      ],
    });
    toSite(s, 1, 7, 3, { locked: true }); // placed from the rail, (7,2) below is empty
    const d = drag(s, 0);
    expect(d.isReachable(N(6, 1))).toBe(true);
    expect(keys(d.neighbours(N(6, 1)))).not.toContain('F(7,1)');
    expect(anchorMap(d).map((row) => row.slice(6))).toEqual([
      'oo',
      'oo',
      'oo',
      'oo',
      'oo',
      'oo',
      'o.',
      'o.',
      'o.',
      'o.',
    ]);
  });

  it('K-13 the underside of an overhang is reachable only by rail', () => {
    const s = initialState({
      wall: { height: 4, gaps: [{ type: 'static', y: 2, size: 1 }] },
      pieces: [
        ['B1_0', 'W', 5, 2],
        ['B1_0', 'W', 2, 0],
      ],
    });
    toSite(s, 1, 7, 3, { locked: true });
    const d = drag(s, 0);
    expect(d.isReachable(N(7, 2))).toBe(false);
    expect(d.isReachable(R(0, 7, 2))).toBe(true);
    expect(d.classify(R(0, 7, 2))).toMatchObject({ kind: 'siteRail' });
  });
});

// --- tutorial drag signals (TECH §8.2) -------------------------------------------------------------------------------

describe('drag signals for the tutorial (dragCrossedWall, dragEnteredRail)', () => {
  it('K-11 dragCrossedWall fires once, on the first FREE step across the boundary (Bölüm 1 overWall)', () => {
    const s = createInitialState(levelFile(1));
    const d = drag(s, 0); // `a`, D2_90 Y at (4,7)
    expect(d.canCrossWall).toBe(true);
    expect(d.canEnterRail).toBe(false);
    const up = d.follow(4, 8);
    expect(up.crossedWall).toBe(false);
    const over = d.follow(6, 8);
    expect(keys(over.path)).toEqual(['F(5,8)', 'F(6,8)']);
    expect(over.crossedWall).toBe(true);
    expect(d.classify()).toMatchObject({ kind: 'siteFree' });
    expect(d.follow(4, 8).crossedWall).toBe(false);
    expect(d.follow(6, 8).crossedWall).toBe(false);
  });

  it('K-12 dragEnteredRail fires on the first FREE → RAIL step (Bölüm 3 gapPass)', () => {
    const s = createInitialState(levelFile(3));
    const d = drag(s, 1); // `f`, D2_90 Y at (4,2), the yard is full
    expect(d.canEnterRail).toBe(true);
    expect(d.canCrossWall).toBe(false);
    const r = d.follow(6, 2);
    expect(keys(r.path)).toEqual(['R0(5,2)', 'R0(6,2)']);
    expect(r.enteredRail).toBe(true);
    expect(r.crossedWall).toBe(false);
    expect(d.classify()).toMatchObject({ kind: 'siteRail', gap: 0 });
  });

  it('K-12 a debris RAIL start is not a rail entry; leaving to the yard and re-entering from FREE is', () => {
    const s = initialState({
      wall: { height: 5, gaps: [{ type: 'static', y: 3, size: 1 }] },
      pieces: [['B1_0', 'W', 0, 0]],
      debris: [['D2_90', 'R', 6, 3]],
    });
    const d = drag(s, 1);
    const out = d.follow(4, 3);
    expect(keys(out.path)).toEqual(['R0(6,3)', 'R0(5,3)', 'F(4,3)']); // mode switch at the start cells first
    expect(out.enteredRail).toBe(false);
    const back = d.follow(5.9, 3);
    expect(back.enteredRail).toBe(true);
    expect(back.node).toEqual(N(6, 3)); // tie with R0(6,3): equal steps, FREE first
    expect(d.classify()).toMatchObject({ reason: 'sameSpot' });
  });
});

// --- levels 1–5 ------------------------------------------------------------------------------------------------------

describe('Bölüm 1–5 start positions', () => {
  it('K-09 K-11 K-12 every piece of levels 1–5 is checked; the hand-solution first moves are reachable', () => {
    for (let id = 1; id <= 5; id++) {
      const lvl = levelFile(id);
      const s = createInitialState(lvl);
      let pickable = 0;
      for (let p = 0; p < lvl.layout.counts.pieces; p++) {
        const attempt = tryBeginDrag(s, p);
        if (!attempt.ok) continue;
        pickable++;
        for (const n of attempt.session.reachableNodes()) {
          for (const c of attempt.session.cells(n)) {
            expect(c.y).toBeLessThan(10);
            if (c.x <= 5 && c.y <= 7) expect([0, p + 1]).toContain(yardOcc(s, c.x, c.y));
          }
        }
      }
      expect(pickable, `level ${id}`).toBeGreaterThan(0);
    }
    // Bölüm 1 move 1: `a` over the wall to x = 6; Bölüm 3 move 1: `a` (O4) over the wall, move 2: `f` by rail
    const l1 = drag(createInitialState(levelFile(1)), 0);
    expect(l1.classify(N(6, 8))).toMatchObject({ kind: 'siteFree' });
    const l3 = createInitialState(levelFile(3));
    expect(drag(l3, 0).classify(N(6, 8))).toMatchObject({ kind: 'siteFree' });
    expect(drag(l3, 1).classify(R(0, 6, 2))).toMatchObject({ kind: 'siteRail' });
  });
});

// --- edge model ≡ cell-by-cell model (TECH §2.2, §12.4) -------------------------------------------------------------

interface ModelGap {
  readonly lo: number;
  readonly hi: number;
  readonly open: boolean;
}
interface Model {
  readonly shape: ShapeDef;
  readonly height: number;
  readonly gaps: readonly ModelGap[];
  readonly blocked: (x: number, y: number) => boolean;
  /** Start node keys: the block may always return to its start cells (K-07 row 1). */
  readonly starts: Set<string>;
}

function modelCells(m: Model, n: DragNode): [number, number][] {
  return m.shape.cells.map((c) => [n.ix + c.x, n.iy + c.y]);
}

/** Literal TECH §4.2 node rules over explicit cell lists (no masks, no shifts). */
function modelValid(m: Model, n: DragNode): boolean {
  if (m.starts.has(key(n))) return true;
  const cells = modelCells(m, n);
  for (const [x, y] of cells) {
    if (x < 0 || x > 7 || y < 0 || y > 9) return false;
    if (m.shape.heavy && x > 5) return false;
    if (m.blocked(x, y)) return false;
  }
  const site = cells.filter(([x]) => x >= 6);
  if (n.mode === FREE) {
    for (let y = 0; y < 10; y++) {
      const row = cells.filter((c) => c[1] === y);
      if (row.some((c) => c[0] <= 5) && row.some((c) => c[0] >= 6) && y < m.height) return false;
    }
    for (const col of [6, 7]) {
      const ys = site.filter((c) => c[0] === col).map((c) => c[1]);
      if (ys.length === 0) continue;
      const lowest = Math.min(...ys);
      for (let y = lowest; y < 10; y++) if (m.blocked(col, y)) return false;
    }
    return true;
  }
  const g = m.gaps[n.mode - 1];
  if (!g || !g.open || site.length === 0) return false;
  return cells.every(([, y]) => y >= g.lo && y < g.hi);
}

function modelRowOpen(m: Model, y: number, mode: number): boolean {
  if (mode === FREE) return y >= m.height;
  const g = m.gaps[mode - 1];
  return g !== undefined && g.open && y >= g.lo && y < g.hi;
}

function modelStep(m: Model, from: DragNode, to: DragNode): boolean {
  if (from.iy !== to.iy) return true;
  const dx = to.ix - from.ix;
  const mode = from.mode !== FREE ? from.mode : to.mode;
  for (const [x, y] of modelCells(m, from)) {
    if (x <= 5 !== x + dx <= 5 && !modelRowOpen(m, y, mode)) return false;
  }
  return true;
}

function modelNeighbours(m: Model, n: DragNode): DragNode[] {
  const out: DragNode[] = [];
  const add = (t: DragNode): void => {
    if (modelValid(m, t) && modelStep(m, n, t)) out.push(t);
  };
  const fullyYard = (ix: number): boolean => ix + m.shape.w - 1 <= 5;
  if (n.mode === FREE) {
    add(N(n.ix - 1, n.iy));
    add(N(n.ix + 1, n.iy));
    if (fullyYard(n.ix)) m.gaps.forEach((_, g) => add(R(g, n.ix + 1, n.iy)));
    add(N(n.ix, n.iy - 1));
    add(N(n.ix, n.iy + 1));
  } else {
    add(fullyYard(n.ix - 1) ? N(n.ix - 1, n.iy) : { ix: n.ix - 1, iy: n.iy, mode: n.mode });
    add({ ix: n.ix + 1, iy: n.iy, mode: n.mode });
  }
  return out;
}

/** Multi-source BFS from the start nodes; returns node key → distance. */
function modelBfs(m: Model, starts: readonly DragNode[]): Map<string, number> {
  const dist = new Map<string, number>();
  const queue: DragNode[] = [];
  for (const st of starts) {
    dist.set(key(st), 0);
    queue.push(st);
  }
  for (let i = 0; i < queue.length; i++) {
    const u = queue[i] as DragNode;
    const du = dist.get(key(u)) ?? 0;
    for (const v of modelNeighbours(m, u)) {
      if (dist.has(key(v))) continue;
      dist.set(key(v), du + 1);
      queue.push(v);
    }
  }
  return dist;
}

/** Literal GDD K-07 table over cells (row 5 is not exercised here: the site is open). */
function modelClassify(m: Model, starts: readonly DragNode[], n: DragNode): string {
  const cells = modelCells(m, n);
  if (starts.some((st) => key(st) === key(n))) return 'sameSpot';
  const yardSide = cells.every(([x]) => x <= 5);
  const siteSide = cells.every(([x]) => x >= 6);
  if (n.mode === FREE && yardSide) return cells.every(([, y]) => y <= 7) ? 'yard' : 'craneOverYard';
  if (!yardSide && !siteSide) return 'straddle';
  return n.mode === FREE ? 'siteFree' : 'siteRail';
}

const dropName = (d: DropClass): string => (d.kind === 'cancel' ? d.reason : d.kind);

function randomGaps(rng: Rng, height: number): LevelInput['wall']['gaps'] {
  const gaps: LevelInput['wall']['gaps'] = [];
  if (height < 2) return gaps;
  const used = new Set<number>();
  const wanted = rng.nextInt(4);
  for (let tries = 0; tries < 6 && gaps.length < wanted; tries++) {
    const y = rng.nextInt(height - 1);
    const size = 1 + rng.nextInt(Math.min(3, height - 1 - y));
    const rows = Array.from({ length: size }, (_, i) => y + i);
    if (rows.some((r) => used.has(r))) continue;
    rows.forEach((r) => used.add(r));
    gaps.push(
      rng.next() < 0.75 ? { type: 'static', y, size } : { type: 'locked', y, size, keyId: `k${gaps.length}` },
    );
  }
  return gaps;
}

const CANONICAL = SHAPES.filter((s) => s.index === s.canonicalIndex);

describe('edge model equivalence (TECH §2.2, §4.2)', () => {
  it('K-04 K-05 K-07 K-09 K-11 K-12 K-13 R, BFS distances, edges and release classes equal a cell-by-cell model on 600 seeded boards', () => {
    const rng = mulberry32(20261006);
    let compared = 0;
    let immovable = 0;
    for (let trial = 0; trial < 600; trial++) {
      const height = rng.nextInt(9);
      const lvl = compile(
        level({
          wall: { height, gaps: randomGaps(rng, height) },
          pieces: [['B1_0', 'W', 0, 0]],
          debris: [['B1_0', 'W', 6, 0]],
        }),
      );
      const s = createInitialState(lvl);
      s.buf.fill(0, lvl.layout.yardOcc, lvl.layout.pieces);
      const elev = rng.next() < 0.7 ? 0 : 1 + rng.nextInt(2);
      setHdr(s, H.elev, elev);
      const onSite = rng.next() < 0.3;
      const id = onSite ? 1 : 0;
      setPieceField(s, 1 - id, PF.zone, Zone.gone);
      const pool = onSite ? CANONICAL.filter((sh) => sh.w <= 2 && !sh.heavy && sh.h <= 8 - elev) : CANONICAL;
      const shape = pool[rng.nextInt(pool.length)] as ShapeDef;
      setPieceField(s, id, PF.shape, shape.index);
      if (onSite) {
        setPieceField(s, id, PF.zone, Zone.site);
        setPieceField(s, id, PF.x, 6 + rng.nextInt(3 - shape.w));
        setPieceField(s, id, PF.y, rng.nextInt(8 - elev - shape.h + 1));
        setPieceField(s, id, PF.seg, 0);
        if (rng.next() < 0.3) setFlag(s, id, 'debris', false); // a stuck-mortar-like site block
      } else {
        setPieceField(s, id, PF.zone, Zone.yard);
        setPieceField(s, id, PF.x, rng.nextInt(6 - shape.w + 1));
        setPieceField(s, id, PF.y, rng.nextInt(8 - shape.h + 1));
      }
      occupyPiece(s, id);
      const yardDensity = rng.next() * 0.9;
      const siteDensity = rng.next() * 0.5;
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 6; x++)
          if (yardOcc(s, x, y) === 0 && rng.next() < yardDensity) setYardOcc(s, x, y, -1);
        for (let sx = 0; sx < 2; sx++)
          if (siteOcc(s, 0, sx, y) === 0 && rng.next() < siteDensity) setSiteOcc(s, 0, sx, y, SITE_TROWEL);
      }

      const m: Model = {
        shape,
        height,
        gaps: lvl.gaps.map((g) => ({ lo: g.y, hi: g.y + g.size, open: g.type !== 'locked' })),
        blocked: (x, y) => {
          if (x <= 5) {
            const v = yardOcc(s, x, y);
            return v !== 0 && v !== id + 1;
          }
          if (y < elev) return true;
          if (y >= 8) return false;
          const v = siteOcc(s, 0, x - 6, y - elev);
          return v !== 0 && v !== id + 1;
        },
        starts: new Set<string>(),
      };
      const anchor = N(
        s.buf[lvl.layout.pieces + id * 9 + PF.x] ?? 0,
        (s.buf[lvl.layout.pieces + id * 9 + PF.y] ?? 0) + (onSite ? elev : 0),
      );
      const starts = [anchor];
      if (onSite && hasFlag(s, id, 'debris'))
        m.gaps.forEach((_, g) => {
          if (modelValid(m, R(g, anchor.ix, anchor.iy))) starts.push(R(g, anchor.ix, anchor.iy));
        });
      starts.forEach((st) => m.starts.add(key(st)));
      const want = modelBfs(m, starts);
      const moves = [...want.keys()].some((k) => !k.endsWith(`(${anchor.ix},${anchor.iy})`));
      const attempt = tryBeginDrag(s, id);
      if (!moves) {
        expect(attempt, `trial ${trial}`).toEqual({ ok: false, reason: 'immovable' });
        immovable++;
        continue;
      }
      if (!attempt.ok) throw new Error(`trial ${trial}: expected a session, got ${attempt.reason}`);
      const d = attempt.session;
      expect(keys(d.startNodes), `trial ${trial}`).toEqual(keys(starts));
      const got = new Map(d.reachableNodes().map((n) => [key(n), d.distanceFromStart(n)]));
      expect([...got.entries()].sort(), `trial ${trial} R`).toEqual([...want.entries()].sort());
      for (const n of d.reachableNodes()) {
        expect(keys(d.neighbours(n)).sort(), `trial ${trial} edges of ${key(n)}`).toEqual(
          keys(modelNeighbours(m, n)).sort(),
        );
        expect(dropName(d.classify(n)), `trial ${trial} class of ${key(n)}`).toBe(
          modelClassify(m, starts, n),
        );
      }
      compared++;
    }
    expect(compared).toBeGreaterThan(300);
    expect(immovable).toBeGreaterThan(10);
  });

  it('K-08 node codes follow the TECH §2.1 layout and stay inside the per-level node space', () => {
    expect(NODES_PER_MODE).toBe(80);
    const d = drag(initialState({ pieces: [['B1_0', 'W', 0, 0]] }), 0);
    expect(d.isReachable({ ix: 0, iy: 1, mode: 1 })).toBe(false); // no gaps → no RAIL mode
    expect(d.distanceFromStart({ ix: 0, iy: 1, mode: 1 })).toBe(-1);
    expect(blockCells(shapeById('C3_0'), 5, 8)).toEqual([
      { x: 5, y: 8 },
      { x: 6, y: 8 },
      { x: 5, y: 9 },
    ]);
  });
});
