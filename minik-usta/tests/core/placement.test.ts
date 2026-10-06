import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  allCellsInPlanArea,
  buildFront,
  dropIntoYard,
  eligibleTrowelCells,
  isCorrectPlacement,
  isSegmentComplete,
  lockPiece,
  movePiece,
  nearestColumnsFirst,
  piecePlace,
  placeAt,
  returnBrokenPiece,
  returnTarget,
  settlePlacement,
  sitePlace,
  stickPiece,
  yardPlace,
} from '../../src/core/placement.ts';
import type { PlacementRules } from '../../src/core/placement.ts';
import { computeFall } from '../../src/core/gravity.ts';
import type { FallRules } from '../../src/core/gravity.ts';
import { FREE, blockCells, railMode, tryBeginDrag } from '../../src/core/movement.ts';
import type { DragSession } from '../../src/core/movement.ts';
import {
  H,
  PF,
  SITE_TROWEL,
  createInitialState,
  enqueuePiece,
  filledMask,
  hasFlag,
  hdr,
  queueIds,
  setFlag,
  setPieceField,
  setSiteOcc,
  siteOcc,
  wrongOccMask,
  yardOcc,
} from '../../src/core/state.ts';
import type { GameState } from '../../src/core/state.ts';
import { occupyPiece, refreshSiteMasks, stateInvariantErrors, vacatePiece } from '../../src/core/grid.ts';
import { loadLevel } from '../../src/core/level/compile.ts';
import type { CompiledLevel } from '../../src/core/level/compile.ts';
import { shapeById } from '../../src/core/shapes.ts';
import { Zone } from '../../src/core/types.ts';
import type { At, DragNode, PieceId, ShapeId } from '../../src/core/types.ts';
import { initialState } from '../fixtures/builders.ts';
import type { PieceSpec } from '../fixtures/builders.ts';

// --- helpers ---------------------------------------------------------------------------------------------------------

const N = (ix: number, iy: number): DragNode => ({ ix, iy, mode: FREE });
const R = (g: number, ix: number, iy: number): DragNode => ({ ix, iy, mode: railMode(g) });
const site = (x: number, y: number, seg = 0): At => ({ zone: 'site', x, y, seg });
const cellsOf = (shape: ShapeId, ix: number, iy: number) => blockCells(shapeById(shape), ix, iy);

function drag(s: GameState, id: PieceId): DragSession {
  const attempt = tryBeginDrag(s, id);
  if (!attempt.ok) throw new Error(`piece ${id} is not pickable: ${attempt.reason}`);
  return attempt.session;
}

/** Puts a piece on segment 0 of the site at global column x / plan row y (test setup, independent of placement.ts). */
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
  setPieceField(s, id, PF.seg, 0);
  setFlag(s, id, 'locked', opts.locked ?? true);
  setFlag(s, id, 'stuck', opts.stuck ?? false);
  occupyPiece(s, id);
  refreshSiteMasks(s, 0);
}

function expectConsistent(s: GameState): void {
  expect(stateInvariantErrors(s)).toEqual([]);
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

/** S3-like landing hook for tests (the real one is the obstacle plugin): glass breaks when d > threshold. */
const GLASS_RULES: FallRules = {
  onLanded: (s, id, fall) =>
    hasFlag(s, id, 'glass') && fall.distance > s.lvl.gravity.glassThreshold
      ? { kind: 'break', penalty: 1 }
      : { kind: 'none' },
};
/** Y8-like placement hook for tests: mortar blocks stick on a wrong placement. */
const MORTAR_RULES: PlacementRules = {
  onPlacement: (s, id) => ({ kind: hasFlag(s, id, 'mortar') ? 'stick' : 'default' }),
};

// --- K-16 ------------------------------------------------------------------------------------------------------------

describe('K-16 correct placement', () => {
  const spec = {
    plan: ['WW', 'WW'],
    pieces: [
      ['O4_0', 'W', 0, 0],
      ['D2_0', 'W', 2, 0],
      ['D2_0', 'W', 3, 0],
      ['D2_0', 'Y', 4, 0],
    ] as PieceSpec[],
  };

  it('K-16 GDD example: O4 W on WW/WW is correct; two D2_0 W are both correct; D2_0 Y on W is wrong', () => {
    const s = initialState(spec);
    expect(isCorrectPlacement(s, 0, cellsOf('O4_0', 6, 0))).toEqual({
      ok: true,
      reasons: [],
      missingSupport: [],
    });
    const first = isCorrectPlacement(s, 1, cellsOf('D2_0', 6, 0));
    expect(first.ok).toBe(true);
    expect(settlePlacement(s, 1, { ix: 6, iy: 0 }, first).kind).toBe('correct');
    expect(isCorrectPlacement(s, 2, cellsOf('D2_0', 7, 0)).ok).toBe(true);
    const t = initialState(spec);
    expect(isCorrectPlacement(t, 3, cellsOf('D2_0', 6, 0))).toEqual({
      ok: false,
      reasons: ['color'],
      missingSupport: [],
    });
  });

  it('K-16 condition 1: a cell outside the plan area or in the yard is wrong (outside)', () => {
    const s = initialState({
      plan: ['WW', 'WW'],
      pieces: [
        ['O4_0', 'W', 0, 0],
        ['B1_0', 'W', 2, 0],
      ],
    });
    toSite(s, 0, 6, 0);
    expect(isCorrectPlacement(s, 1, cellsOf('B1_0', 6, 2)).reasons).toEqual(['outside']);
    expect(isCorrectPlacement(s, 1, cellsOf('B1_0', 5, 2)).reasons).toEqual(['outside']);
    expect(isCorrectPlacement(s, 1, cellsOf('B1_0', 7, 9)).reasons).toEqual(['outside']);
  });

  it('K-16 condition 2: debris is never correct, even on its own colour (S-13)', () => {
    const s = initialState({ plan: ['WW'], pieces: [['B1_0', 'W', 0, 0]], debris: [['B1_0', 'W', 6, 0]] });
    expect(isCorrectPlacement(s, 1, cellsOf('B1_0', 6, 0))).toEqual({
      ok: false,
      reasons: ['debris'],
      missingSupport: [],
    });
    expect(isCorrectPlacement(s, 1, cellsOf('B1_0', 7, 0)).reasons).toEqual(['debris']);
  });

  it('K-16 a hidden `?` cell is checked against its resolved colour; the correct block opens it (K-32)', () => {
    const s = initialState({
      plan: ['??', 'WY'],
      hidden: [{ kind: 'repeat', period: 1 }],
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'Y', 1, 0],
        ['B1_0', 'W', 2, 0],
        ['B1_0', 'Y', 3, 0],
      ],
    });
    toSite(s, 0, 6, 0);
    toSite(s, 1, 7, 0);
    expect(isCorrectPlacement(s, 3, cellsOf('B1_0', 6, 1)).reasons).toEqual(['color']);
    const v = isCorrectPlacement(s, 2, cellsOf('B1_0', 6, 1));
    expect(v.ok).toBe(true);
    const out = settlePlacement(s, 2, { ix: 6, iy: 1 }, v);
    expect(out.kind === 'correct' && out.revealed).toEqual([{ x: 6, y: 1, color: 'W' }]);
    expectConsistent(s);
  });
});

// --- K-34 ------------------------------------------------------------------------------------------------------------

describe('K-34 bottom-up support', () => {
  it('K-34 example 1 and example 3: O4 over an empty column is wrong (support); verdict and buildFront', () => {
    const s = initialState({
      plan: ['WW', 'WW', 'WW', 'WW'],
      pieces: [
        ['D2_0', 'W', 0, 0],
        ['O4_0', 'W', 2, 0],
      ],
    });
    toSite(s, 0, 6, 0);
    expect(drag(s, 1).isReachable(N(6, 8))).toBe(true);
    const fall = computeFall(s, 1, N(6, 8));
    expect(fall.landing).toEqual({ ix: 6, iy: 2 });
    expect(fall.verdict).toEqual({
      ok: false,
      reasons: ['support'],
      missingSupport: [site(7, 0), site(7, 1)],
    });
    expect(buildFront(s)).toEqual([site(6, 2), site(7, 0)]);
  });

  it('K-34 example 2: rail over an empty `.` cell is correct (empty dot cells count as filled)', () => {
    const s = initialState({
      wall: { height: 4, gaps: [{ type: 'static', y: 2, size: 1 }] },
      plan: ['WW', 'W.', 'WW'],
      pieces: [
        ['D2_90', 'W', 0, 0],
        ['B1_0', 'W', 2, 0],
        ['D2_90', 'W', 4, 2],
      ],
    });
    toSite(s, 0, 6, 0);
    toSite(s, 1, 6, 1);
    const d = drag(s, 2);
    expect(d.classify(R(0, 6, 2)).kind).toBe('siteRail');
    const fall = computeFall(s, 2, R(0, 6, 2));
    expect(fall.mode).toBe('rail');
    expect(fall.landing).toEqual({ ix: 6, iy: 2 });
    expect(fall.verdict.ok).toBe(true);
  });

  it('K-34 rail over an empty coloured cell is wrong (level 3: Y lintel through the gap before the base)', () => {
    const s = createInitialState(levelFile(3));
    const d = drag(s, 1); // D2_90 Y at (4,2), level 3 tutorial step 2
    expect(d.classify(R(0, 6, 2)).kind).toBe('siteRail');
    const fall = computeFall(s, 1, R(0, 6, 2));
    expect(fall.verdict).toEqual({
      ok: false,
      reasons: ['support'],
      missingSupport: [site(6, 0), site(6, 1), site(7, 0), site(7, 1)],
    });
    const out = settlePlacement(s, 1, fall.landing, fall.verdict);
    expect(out.kind).toBe('bounced');
    expect(out.kind === 'bounced' && out.reason).toBe('support');
    expect(out.kind === 'bounced' && out.target).toEqual({
      step: 1,
      to: { zone: 'yard', x: 4, y: 2, seg: -1 },
      dropFrom: null,
    });
    expectConsistent(s);
  });

  it('K-34 debris below blocks correct placement', () => {
    const s = initialState({
      plan: ['WW', 'WW'],
      pieces: [['B1_0', 'W', 0, 0]],
      debris: [['B1_0', 'W', 7, 0]],
    });
    const fall = computeFall(s, 0, N(7, 8));
    expect(fall.landing).toEqual({ ix: 7, iy: 1 });
    expect(fall.verdict).toEqual({ ok: false, reasons: ['support'], missingSupport: [site(7, 0)] });
    expect(buildFront(s)).toEqual([site(6, 0)]);
  });

  const dotSpec = {
    plan: ['WW', 'W.', 'WW'],
    pieces: [
      ['D2_90', 'W', 0, 0],
      ['B1_0', 'W', 2, 0],
      ['B1_0', 'W', 4, 0],
      ['B1_0', 'R', 5, 0, ['mortar']],
    ] as PieceSpec[],
  };

  it('K-34 dot cell with debris is missing support', () => {
    const s = initialState({ ...dotSpec, debris: [['B1_0', 'R', 7, 1]] });
    toSite(s, 0, 6, 0);
    toSite(s, 1, 6, 1);
    const fall = computeFall(s, 2, N(7, 8));
    expect(fall.landing).toEqual({ ix: 7, iy: 2 });
    expect(fall.verdict).toEqual({ ok: false, reasons: ['support'], missingSupport: [site(7, 1)] });
    expect(buildFront(s)).toEqual([site(6, 2)]);
  });

  it('E-43 dot cell with stuck mortar breaks support; buildFront returns after the mortar is removed', () => {
    const s = initialState(dotSpec);
    toSite(s, 0, 6, 0);
    toSite(s, 1, 6, 1);
    toSite(s, 3, 7, 1, { locked: false, stuck: true });
    expect(wrongOccMask(s, 0, 1)).toBe(0b10);
    expect(isCorrectPlacement(s, 2, cellsOf('B1_0', 7, 2))).toEqual({
      ok: false,
      reasons: ['support'],
      missingSupport: [site(7, 1)],
    });
    expect(buildFront(s)).toEqual([site(6, 2)]);
    // the mortar is dragged to the yard: the `.` cell is empty again, (7,2) becomes a front cell the same move
    movePiece(s, 3, yardPlace({ ix: 3, iy: 0 }));
    expect(hasFlag(s, 3, 'stuck')).toBe(false);
    expect(wrongOccMask(s, 0, 1)).toBe(0);
    expect(buildFront(s)).toEqual([site(6, 2), site(7, 2)]);
    expect(isCorrectPlacement(s, 2, cellsOf('B1_0', 7, 2)).ok).toBe(true);
    expectConsistent(s);
  });

  it('K-34 the moving block does not count as a wrong object below itself', () => {
    const s = initialState({
      ...dotSpec,
      pieces: [...dotSpec.pieces.slice(0, 3), ['B1_0', 'W', 5, 0, ['mortar']]],
    });
    toSite(s, 0, 6, 0);
    toSite(s, 3, 7, 1, { locked: false, stuck: true });
    expect(isCorrectPlacement(s, 3, cellsOf('B1_0', 7, 2)).ok).toBe(true);
    expect(isCorrectPlacement(s, 2, cellsOf('B1_0', 7, 2)).missingSupport).toEqual([site(7, 1)]);
  });

  it('K-34 verdict reasons keep fixed order: debris, outside, window, colour, support', () => {
    const s = initialState({
      plan: ['R.', 'WW'],
      pieces: [['B1_0', 'W', 0, 0]],
      debris: [['O4_0', 'W', 6, 0]],
    });
    expect(isCorrectPlacement(s, 1, cellsOf('O4_0', 6, 1))).toEqual({
      ok: false,
      reasons: ['debris', 'outside', 'window', 'color', 'support'],
      missingSupport: [site(6, 0), site(7, 0)],
    });
  });

  it('K-34 crane and trowel obey support rule', () => {
    const s = initialState({
      plan: ['WW', 'WW', 'WW'],
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'W', 1, 0],
      ],
    });
    toSite(s, 0, 6, 0);
    // crane target (K-37): any position, no fall; the same single test decides
    expect(isCorrectPlacement(s, 1, cellsOf('B1_0', 6, 2)).missingSupport).toEqual([site(6, 1)]);
    expect(isCorrectPlacement(s, 1, cellsOf('B1_0', 7, 1)).missingSupport).toEqual([site(7, 0)]);
    expect(isCorrectPlacement(s, 1, cellsOf('B1_0', 6, 1)).ok).toBe(true);
    // trowel (K-33): only build-front cells
    expect(eligibleTrowelCells(s)).toEqual([site(6, 1), site(7, 0)]);
    expect(eligibleTrowelCells(s)).toEqual(buildFront(s));
  });

  it('K-33 trowel cells equal buildFront (GDD K-33 example: (7,2) above an empty `.`, not (7,3))', () => {
    const s = initialState({
      plan: ['WW', 'WW', 'W.', 'WW'],
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'W', 1, 0],
      ],
    });
    toSite(s, 0, 6, 0);
    toSite(s, 1, 7, 0);
    expect(buildFront(s)).toEqual([site(6, 1), site(7, 2)]);
    expect(eligibleTrowelCells(s)).toEqual(buildFront(s));
    // a trowel cell is correctly filled: the front moves up
    setSiteOcc(s, 0, 1, 2, SITE_TROWEL);
    refreshSiteMasks(s, 0);
    expect(buildFront(s)).toEqual([site(6, 1), site(7, 3)]);
  });

  it('K-34 the front follows the elevator frame (board row = plan row + offset)', () => {
    const s = initialState({
      id: 37,
      plan: ['WW', 'WW'],
      elevator: { range: [0, 2], start: 2, dir: 1 },
      pieces: [['B1_0', 'W', 0, 0]],
    });
    expect(hdr(s, H.elev)).toBe(2);
    expect(buildFront(s)).toEqual([site(6, 2), site(7, 2)]);
    expect(isCorrectPlacement(s, 0, cellsOf('B1_0', 6, 2)).ok).toBe(true);
    expect(isCorrectPlacement(s, 0, cellsOf('B1_0', 6, 3)).missingSupport).toEqual([site(6, 2)]);
  });
});

// --- K-15 ------------------------------------------------------------------------------------------------------------

describe('K-15 segment completion', () => {
  const spec = {
    plan: ['W.', 'WW'],
    pieces: [
      ['D2_90', 'W', 0, 0],
      ['B1_0', 'W', 2, 0],
      ['B1_0', 'R', 3, 0, ['mortar']],
    ] as PieceSpec[],
  };

  it('K-15 a segment completes when every non-`.` cell is filled and nothing else is in it', () => {
    const s = initialState(spec);
    expect(isSegmentComplete(s, 0)).toBe(false);
    toSite(s, 0, 6, 0);
    expect(isSegmentComplete(s, 0)).toBe(false);
    toSite(s, 1, 6, 1);
    expect(isSegmentComplete(s, 0)).toBe(true);
  });

  it('E-24 a block stuck on a `.` cell keeps the segment incomplete', () => {
    const s = initialState(spec);
    toSite(s, 0, 6, 0);
    toSite(s, 1, 6, 1);
    toSite(s, 2, 7, 1, { locked: false, stuck: true });
    expect(isSegmentComplete(s, 0)).toBe(false);
  });

  it('K-15 debris anywhere in the segment area blocks completion; trowel cells count as filled', () => {
    const s = initialState({ plan: ['WW'], pieces: [['B1_0', 'W', 0, 0]], debris: [['B1_0', 'R', 6, 3]] });
    toSite(s, 0, 6, 0);
    setSiteOcc(s, 0, 1, 0, SITE_TROWEL);
    refreshSiteMasks(s, 0);
    expect(isSegmentComplete(s, 0)).toBe(false);
    movePiece(s, 1, yardPlace({ ix: 0, iy: 0 }));
    expect(isSegmentComplete(s, 0)).toBe(true);
  });
});

// --- K-14 ------------------------------------------------------------------------------------------------------------

describe('K-14 lock', () => {
  it('K-14 a correctly placed block locks: it cannot be picked and fills its plan cells', () => {
    const s = initialState({ plan: ['WW'], pieces: [['D2_90', 'W', 0, 0]] });
    const fall = computeFall(s, 0, N(6, 8));
    const out = settlePlacement(s, 0, fall.landing, fall.verdict);
    expect(out).toEqual({
      kind: 'correct',
      at: { zone: 'site', x: 6, y: 0, seg: 0 },
      cells: [site(6, 0), site(7, 0)],
      revealed: [],
    });
    expect(hasFlag(s, 0, 'locked')).toBe(true);
    expect(tryBeginDrag(s, 0)).toEqual({ ok: false, reason: 'locked' });
    expect([filledMask(s, 0, 0), filledMask(s, 0, 1)]).toEqual([1, 1]);
    expect(isSegmentComplete(s, 0)).toBe(true);
    expectConsistent(s);
  });

  it('K-14 locking a stuck block clears stuck and wrongOcc (paint lock, K-38)', () => {
    const s = initialState({ plan: ['WW', 'WW'], pieces: [['B1_0', 'W', 0, 0, ['mortar']]] });
    toSite(s, 0, 6, 0, { locked: false, stuck: true });
    expect(wrongOccMask(s, 0, 0)).toBe(1);
    expect(lockPiece(s, 0)).toEqual([]);
    expect(hasFlag(s, 0, 'stuck')).toBe(false);
    expect(hasFlag(s, 0, 'locked')).toBe(true);
    expect([wrongOccMask(s, 0, 0), filledMask(s, 0, 0)]).toEqual([0, 1]);
    expectConsistent(s);
  });
});

// --- K-17 ------------------------------------------------------------------------------------------------------------

describe('K-17 wrong placement and bounce-back', () => {
  it('K-17 GDD example: B1 Y from (3,7) lands on a W cell and returns to (3,7)', () => {
    const s = initialState({ plan: ['WW'], pieces: [['B1_0', 'Y', 3, 7]] });
    const start = piecePlace(s, 0);
    const fall = computeFall(s, 0, N(6, 8));
    expect(fall.verdict.reasons).toEqual(['color']);
    const out = settlePlacement(s, 0, fall.landing, fall.verdict, { start });
    expect(out).toEqual({
      kind: 'bounced',
      landing: { ix: 6, iy: 0 },
      target: { step: 1, to: { zone: 'yard', x: 3, y: 7, seg: -1 }, dropFrom: null },
      reason: 'color',
      missingSupport: [],
    });
    expect(yardOcc(s, 3, 7)).toBe(1);
    expect(siteOcc(s, 0, 0, 0)).toBe(0);
    expectConsistent(s);
  });

  it('K-17 GDD example: debris from (7,0)–(7,1) dropped elsewhere returns to (7,0)–(7,1)', () => {
    const s = initialState({
      plan: ['WW', 'WW', 'WW'],
      pieces: [['B1_0', 'W', 0, 0]],
      debris: [['D2_0', 'R', 7, 0]],
    });
    const d = drag(s, 1);
    expect(d.isReachable(N(6, 8))).toBe(true);
    const fall = computeFall(s, 1, N(6, 8));
    expect(fall.landing).toEqual({ ix: 6, iy: 0 });
    expect(fall.verdict.reasons[0]).toBe('debris');
    const out = settlePlacement(s, 1, fall.landing, fall.verdict);
    expect(out.kind === 'bounced' && out.target.to).toEqual({ zone: 'site', x: 7, y: 0, seg: 0 });
    expect(wrongOccMask(s, 0, 1)).toBe(0b11);
    expectConsistent(s);
  });

  it('K-17 step 2 order: nearest column to the start x first, ties nearer the wall', () => {
    expect(nearestColumnsFirst(2, 1)).toEqual([2, 3, 1, 4, 0, 5]);
    expect(nearestColumnsFirst(6, 1)).toEqual([5, 4, 3, 2, 1, 0]);
    expect(nearestColumnsFirst(7, 2)).toEqual([4, 3, 2, 1, 0]);
    expect(nearestColumnsFirst(0, 2)).toEqual([0, 1, 2, 3, 4]);
    expect(nearestColumnsFirst(3, 3)).toEqual([3, 2, 1, 0]);
  });

  it('K-17 step 2: blocked start cells → drop over the yard into the nearest column that fits', () => {
    const s = initialState({
      plan: ['WW'],
      pieces: [
        ['I4_0', 'W', 2, 0],
        ['I4_0', 'W', 2, 4],
        ['I4_0', 'W', 3, 0],
        ['I4_0', 'W', 3, 4],
        ['I4_0', 'W', 1, 0],
        ['B1_0', 'Y', 5, 0],
      ],
    });
    // start (2,7) is occupied by another block: columns 2 and 3 are full, column 1 lands on (1,4)
    const target = returnTarget(s, 5, { start: yardPlace({ ix: 2, iy: 7 }) });
    expect(target).toEqual({
      step: 2,
      to: { zone: 'yard', x: 1, y: 4, seg: -1 },
      dropFrom: { ix: 1, iy: 9 },
    });
  });

  it('K-17 step 3 and K-26: no yard column fits → end of the truck queue, after older queued blocks', () => {
    const full: PieceSpec[] = [];
    for (let x = 0; x < 6; x++) full.push(['I4_0', 'W', x, 0], ['I4_0', 'W', x, 4]);
    const s = initialState({
      plan: ['WW'],
      pieces: full,
      batches: [{ forSegment: 0, pieces: [['B1_0', 'G', 0, 8]] }],
      debris: [['B1_0', 'R', 6, 0]],
    });
    enqueuePiece(s, 12);
    const target = returnTarget(s, 13, { skipStart: true });
    expect(target).toEqual({ step: 3, to: { zone: 'queue', x: 5, y: 8, seg: -1 }, dropFrom: null });
    movePiece(s, 13, target.to);
    expect(queueIds(s)).toEqual([12, 13]);
    expect(siteOcc(s, 0, 0, 0)).toBe(0);
    expectConsistent(s);
  });

  it('K-17 GDD example: a stuck mortar block dropped off the plan returns to its start and stays stuck', () => {
    // plan height 3; column 7 rows 0–2 filled, (6,0)–(6,1) filled, B1 R mortar stuck at (6,2)
    const s = initialState({
      moves: 10,
      plan: ['WW', 'WW', 'WW'],
      pieces: [
        ['I3_0', 'W', 0, 0],
        ['D2_0', 'W', 1, 0],
        ['B1_0', 'R', 2, 0, ['mortar']],
      ],
    });
    toSite(s, 0, 7, 0);
    toSite(s, 1, 6, 0);
    toSite(s, 2, 6, 2, { locked: false, stuck: true });
    const start = piecePlace(s, 2);
    expect(drag(s, 2).isReachable(N(7, 8))).toBe(true);
    const fall = computeFall(s, 2, N(7, 8));
    expect(fall.landing).toEqual({ ix: 7, iy: 3 });
    expect(fall.verdict.reasons).toEqual(['outside']);
    // the mortar hook asks to stick, but a cell is outside the plan area: normal bounce, step 1 (E-08)
    expect(allCellsInPlanArea(s, fall.cells)).toBe(false);
    const out = settlePlacement(s, 2, fall.landing, fall.verdict, { start, rules: MORTAR_RULES });
    expect(out.kind === 'bounced' && out.target).toEqual({ step: 1, to: start, dropFrom: null });
    expect(piecePlace(s, 2)).toEqual({ zone: 'site', x: 6, y: 2, seg: 0 });
    expect(hasFlag(s, 2, 'stuck')).toBe(true);
    expect(wrongOccMask(s, 0, 0)).toBe(0b100);
    expectConsistent(s);
  });

  it('K-17 broken stuck glass mortar returns to yard column 5 and unsticks', () => {
    // GDD K-17 example: normal threshold 3; stuck glass mortar B1 at (6,2) released at (7,8) → lands (7,3), d = 5
    const s = initialState({
      moves: 10,
      plan: ['WW', 'WW', 'WW'],
      pieces: [
        ['I3_0', 'W', 0, 0],
        ['D2_0', 'W', 1, 0],
        ['B1_0', 'R', 2, 0, ['mortar', 'glass']],
        ['B1_0', 'G', 5, 0],
      ],
    });
    toSite(s, 0, 7, 0);
    toSite(s, 1, 6, 0);
    toSite(s, 2, 6, 2, { locked: false, stuck: true });
    const start = piecePlace(s, 2);
    const fall = computeFall(s, 2, N(7, 8), { rules: GLASS_RULES });
    expect(fall.distance).toBe(5);
    expect(fall.effect).toEqual({ kind: 'break', penalty: 1 });
    const target = returnBrokenPiece(s, 2, start);
    expect(target).toEqual({
      step: 2,
      to: { zone: 'yard', x: 5, y: 1, seg: -1 },
      dropFrom: { ix: 5, iy: 9 },
    });
    expect(siteOcc(s, 0, 0, 2)).toBe(0);
    expect(hasFlag(s, 2, 'stuck')).toBe(false);
    expect(wrongOccMask(s, 0, 0)).toBe(0);
    expectConsistent(s);
  });

  it('K-17 a broken glass block that started in the yard returns to its start cells (step 1)', () => {
    const s = initialState({ plan: ['WW'], pieces: [['B1_0', 'W', 2, 7, ['glass']]] });
    const fall = computeFall(s, 0, N(6, 8), { rules: GLASS_RULES });
    expect(fall.effect.kind).toBe('break');
    expect(returnBrokenPiece(s, 0).to).toEqual({ zone: 'yard', x: 2, y: 7, seg: -1 });
    expectConsistent(s);
  });

  it('K-17 a stuck mortar block dropped wrong inside the plan sticks again at the new cell (Y8 hook)', () => {
    const s = initialState({
      plan: ['WW', 'WW', 'WW'],
      pieces: [
        ['D2_0', 'W', 0, 0],
        ['B1_0', 'W', 1, 0],
        ['B1_0', 'R', 2, 0, ['mortar']],
      ],
    });
    toSite(s, 0, 6, 0);
    toSite(s, 1, 7, 0);
    toSite(s, 2, 6, 2, { locked: false, stuck: true });
    const fall = computeFall(s, 2, N(7, 8));
    expect(fall.landing).toEqual({ ix: 7, iy: 1 });
    expect(fall.verdict.reasons).toEqual(['color']);
    const out = settlePlacement(s, 2, fall.landing, fall.verdict, { rules: MORTAR_RULES });
    expect(out).toEqual({
      kind: 'stuck',
      at: { zone: 'site', x: 7, y: 1, seg: 0 },
      reason: 'color',
      missingSupport: [],
    });
    expect([wrongOccMask(s, 0, 0), wrongOccMask(s, 0, 1)]).toEqual([0, 0b10]);
    expect(hasFlag(s, 2, 'stuck')).toBe(true);
    expectConsistent(s);
  });

  it('K-17 a fresh mortar block sticks on a wrong in-plan landing; without the hook it bounces', () => {
    const spec = { plan: ['WW', 'WW'], pieces: [['B1_0', 'R', 0, 0, ['mortar']]] as PieceSpec[] };
    const s = initialState(spec);
    const fall = computeFall(s, 0, N(6, 8));
    expect(settlePlacement(s, 0, fall.landing, fall.verdict, { rules: MORTAR_RULES }).kind).toBe('stuck');
    expect(wrongOccMask(s, 0, 0)).toBe(1);
    expectConsistent(s);
    const t = initialState(spec);
    expect(settlePlacement(t, 0, fall.landing, fall.verdict).kind).toBe('bounced');
  });
});

// --- Y8 stuck lifecycle / state upkeep ---------------------------------------------------------------------------------

describe('K-17 stuck lifecycle and state upkeep', () => {
  it('K-17 leaving the site (yard, queue, gone) clears stuck and its wrongOcc bits', () => {
    const s = initialState({
      plan: ['WW', 'WW'],
      pieces: [
        ['B1_0', 'R', 0, 0, ['mortar']],
        ['B1_0', 'R', 1, 0, ['mortar']],
        ['B1_0', 'R', 2, 0, ['mortar']],
      ],
    });
    toSite(s, 0, 6, 0, { locked: false, stuck: true });
    toSite(s, 1, 7, 0, { locked: false, stuck: true });
    toSite(s, 2, 6, 1, { locked: false, stuck: true });
    movePiece(s, 0, yardPlace({ ix: 4, iy: 0 })); // OBSTACLES Y8 example: dragged back to the yard
    movePiece(s, 1, { zone: 'queue', x: 5, y: 8, seg: -1 });
    movePiece(s, 2, { zone: 'gone', x: 6, y: 1, seg: -1 }); // hammer
    for (const id of [0, 1, 2]) expect(hasFlag(s, id, 'stuck')).toBe(false);
    expect([wrongOccMask(s, 0, 0), wrongOccMask(s, 0, 1)]).toEqual([0, 0]);
    expect(queueIds(s)).toEqual([1]);
    expectConsistent(s);
  });

  it('K-17 stickPiece marks the plan-area cells only; movePiece rejects cells outside the yard or site', () => {
    const s = initialState({ plan: ['W.'], pieces: [['D2_0', 'R', 0, 0, ['mortar']]] });
    movePiece(s, 0, sitePlace(s, { ix: 7, iy: 0 }));
    stickPiece(s, 0);
    expect(wrongOccMask(s, 0, 1)).toBe(0b1);
    expectConsistent(s);
    expect(() => movePiece(s, 0, { zone: 'site', x: 7, y: 7, seg: 0 })).toThrow(RangeError);
    expect(() => movePiece(s, 0, { zone: 'yard', x: 5, y: 7, seg: -1 })).toThrow(RangeError);
    expect(() => movePiece(s, 0, { zone: 'site', x: 5, y: 0, seg: 0 })).toThrow(RangeError);
  });

  it('K-17 places map to event positions in board coordinates', () => {
    const s = initialState({
      id: 37,
      plan: ['WW', 'WW'],
      elevator: { range: [0, 2], start: 1, dir: 1 },
      pieces: [['B1_0', 'W', 0, 0]],
    });
    expect(sitePlace(s, { ix: 7, iy: 3 })).toEqual({ zone: 'site', x: 7, y: 2, seg: 0 });
    expect(placeAt(s, { zone: 'site', x: 7, y: 2, seg: 0 })).toEqual(site(7, 3));
    expect(placeAt(s, yardPlace({ ix: 1, iy: 2 }))).toEqual({ zone: 'yard', x: 1, y: 2 });
    expect(placeAt(s, { zone: 'queue', x: 5, y: 8, seg: -1 })).toBeNull();
  });

  it('K-17 drop over the yard ignores the yard gravity setting and lands on the first support (K-25 example)', () => {
    // GDD K-25 example: columns 4–5 top filled row 3 → O4 at (4,4); column 0 full → B1 goes to x = 1, (1,6)
    const s = initialState({
      plan: ['WW'],
      pieces: [
        ['I4_0', 'W', 4, 0],
        ['I4_0', 'W', 5, 0],
        ['I4_0', 'W', 0, 0],
        ['I4_0', 'W', 0, 4],
        ['I4_0', 'W', 1, 0],
        ['D2_0', 'W', 1, 4],
        ['O4_0', 'G', 2, 0],
      ],
    });
    expect(dropIntoYard(s, shapeById('O4_0'), 4)).toBe(4);
    expect(dropIntoYard(s, shapeById('B1_0'), 0)).toBe(-1);
    expect(nearestColumnsFirst(0, 1).find((x) => dropIntoYard(s, shapeById('B1_0'), x) >= 0)).toBe(1);
    expect(dropIntoYard(s, shapeById('B1_0'), 1)).toBe(6);
    // the moving piece itself is ignored; invalid columns give −1
    expect(dropIntoYard(s, shapeById('O4_0'), 2)).toBe(2);
    expect(dropIntoYard(s, shapeById('O4_0'), 2, 6)).toBe(0);
    expect(dropIntoYard(s, shapeById('O4_0'), 5)).toBe(-1);
  });
});
