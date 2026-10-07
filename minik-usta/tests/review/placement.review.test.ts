/**
 * Independent rule review of src/core/gravity.ts and src/core/placement.ts against docs/GDD.md K-14…K-19 (normal
 * gravity), K-22, K-34 and the related edge cases (E-08, E-20, E-24, E-43), plus OBSTACLES S2/S4/Y8 text.
 * Round 1: verdict, build front, shadow, bounce search, Y8 lifecycle, independent oracle.
 * Round 2 (end of file): shadow-equals-result property through applyMove, K-17 step 2 tie-break for yard starts and
 * the w = 2 broken-glass return, Y8 re-stick / E-08 partial-outside / N32, own-cell exclusion on a `.` cell, neutral
 * `?` shadow keeping `support`, K-15 + S2 example through the pipeline, K-14 example, bounce with colour + support.
 * Round 3 (end of file): S4 debris through the pipeline (completion on the move that removes it, debris stays debris
 * in the yard, debris rail start, the K-17 D2_0 debris example, E-43 with debris + S2 bridge), crane-row landing over a
 * full column (outside + support), Y8 re-drop onto its own cells (re-stick / lock), K-14 vs K-39 Undo, shadow purity
 * and repeatability, and a rail (K-12) shadow-equals-result property through applyMove.
 * Round 4 (after the Faz 2 tur 1 fix #1): `reasonCells`, the cells behind each verdict reason (UX §5.4 45° hatch),
 * against the K-16 / K-34 hook 2 definitions, on hand-built landings and on every landing of seeded random boards.
 * Every expectation below is derived from the GDD wording or its worked examples, not from the implementation.
 * Coordinates: global board cells (x 6–7 = site), plan rows written top → bottom as in level data.
 */
import { describe, expect, it } from 'vitest';
import { computeFall, shadowInfo, siteColumnMasks } from '../../src/core/gravity.ts';
import {
  allCellsInPlanArea,
  buildFront,
  dropIntoYard,
  isCorrectPlacement,
  isSegmentComplete,
  nearestColumnsFirst,
  piecePlace,
  reasonCells,
  returnBrokenPiece,
  returnTarget,
  settlePlacement,
} from '../../src/core/placement.ts';
import type { PlacementRules } from '../../src/core/placement.ts';
import { FREE, blockCells, railMode, tryBeginDrag } from '../../src/core/movement.ts';
import {
  H,
  PF,
  SITE_TROWEL,
  cloneState,
  filledMask,
  hasFlag,
  hdr,
  revealedMask,
  setFlag,
  setHdr,
  setPieceField,
  setSiteOcc,
  siteOcc,
  wrongOccMask,
  yardOcc,
} from '../../src/core/state.ts';
import type { GameState } from '../../src/core/state.ts';
import { occupyPiece, refreshSiteMasks, stateInvariantErrors, vacatePiece } from '../../src/core/grid.ts';
import { ArraySink, applyMove } from '../../src/core/moves.ts';
import { SHAPES, shapeById } from '../../src/core/shapes.ts';
import { mulberry32 } from '../../src/core/rng.ts';
import { GameSession } from '../../src/core/session.ts';
import { Zone } from '../../src/core/types.ts';
import type {
  At,
  ColorCode,
  DragNode,
  GameEvent,
  PieceId,
  ShapeId,
  Verdict,
  VerdictReason,
} from '../../src/core/types.ts';
import { compiledLevel, initialState } from '../fixtures/builders.ts';
import type { LevelSpec, PieceSpec } from '../fixtures/builders.ts';

// --- helpers (test setup only; no placement.ts code is used to build the boards) ------------------------------------

const N = (ix: number, iy: number): DragNode => ({ ix, iy, mode: FREE });
const R = (gap: number, ix: number, iy: number): DragNode => ({ ix, iy, mode: railMode(gap) });
const site = (x: number, y: number, seg = 0): At => ({ zone: 'site', x, y, seg });
const cellsOf = (shape: ShapeId, ix: number, iy: number) => blockCells(shapeById(shape), ix, iy);

/** Puts piece `id` on segment `seg` at global column x / plan row y, locked (default) or stuck. */
function toSite(
  s: GameState,
  id: PieceId,
  x: number,
  y: number,
  opts: { locked?: boolean; stuck?: boolean; seg?: number } = {},
): void {
  const seg = opts.seg ?? 0;
  vacatePiece(s, id);
  setPieceField(s, id, PF.zone, Zone.site);
  setPieceField(s, id, PF.x, x);
  setPieceField(s, id, PF.y, y);
  setPieceField(s, id, PF.seg, seg);
  setFlag(s, id, 'locked', opts.locked ?? true);
  setFlag(s, id, 'stuck', opts.stuck ?? false);
  occupyPiece(s, id);
  refreshSiteMasks(s, seg);
}

/** Y8-like placement hook (the real rule is Phase 3): mortar blocks ask to stick on a wrong placement. */
const MORTAR: PlacementRules = {
  onPlacement: (s, id) => ({ kind: hasFlag(s, id, 'mortar') ? 'stick' : 'default' }),
};

function eventsOf<T extends GameEvent['t']>(
  events: readonly GameEvent[],
  t: T,
): Extract<GameEvent, { t: T }>[] {
  return events.filter((e): e is Extract<GameEvent, { t: T }> => e.t === t);
}

function drag(s: GameState, pieceId: PieceId, to: DragNode): ArraySink {
  const sink = new ArraySink();
  const res = applyMove(s, { kind: 'drag', pieceId, to }, sink, { strict: true, noTruckHelp: true });
  expect(res.status).toBe('applied');
  return sink;
}

const WW = (h: number): string[] => Array.from({ length: h }, () => 'WW');

// --- K-16 + K-34: the single correctness test ----------------------------------------------------------------------

describe('review: K-16 / K-34 verdict and build front', () => {
  it('K-34 a block cannot leave a buried hole under its own overhang (C3_180 over (6,0),(7,0) leaves (6,1) empty)', () => {
    // GDD K-34: "bir bloğun altında doldurulması gereken boş hücre (gömülü delik) bırakılamaz"
    const s = initialState({
      plan: WW(3),
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'W', 1, 0],
        ['C3_180', 'W', 2, 0],
      ],
    });
    toSite(s, 0, 6, 0);
    toSite(s, 1, 7, 0);
    // C3_180 = (1,0) (0,1) (1,1): top(6) = top(7) = 1 → yL = max(1 − 1, 1 − 0) = 1 → cells (7,1) (6,2) (7,2)
    const fall = computeFall(s, 2, N(6, 8));
    expect(fall.landing).toEqual({ ix: 6, iy: 1 });
    expect(fall.distance).toBe(7);
    expect(fall.verdict).toEqual({ ok: false, reasons: ['support'], missingSupport: [site(6, 1)] });
    expect(buildFront(s)).toEqual([site(6, 1), site(7, 1)]);
  });

  it('K-34 a Golden Trowel cell is "doğru dolu": it supports a falling block that is then correct', () => {
    // GDD §0: "Doğru dolu hücre: Doğru yerleşmiş (kilitli) bir bloğun ya da Altın Mala'nın doldurduğu plan hücresi"
    const s = initialState({ plan: WW(2), pieces: [['B1_0', 'W', 0, 0]] });
    setSiteOcc(s, 0, 0, 0, SITE_TROWEL); // trowel at (6,0)
    refreshSiteMasks(s, 0);
    expect(filledMask(s, 0, 0)).toBe(0b1);
    expect(siteColumnMasks(s)).toEqual([0b1, 0b0]);
    const fall = computeFall(s, 0, N(6, 8));
    expect(fall.landing).toEqual({ ix: 6, iy: 1 });
    expect(fall.verdict).toEqual({ ok: true, reasons: [], missingSupport: [] });
    expect(buildFront(s)).toEqual([site(6, 1), site(7, 0)]);
    expect(isSegmentComplete(s, 0)).toBe(false);
  });

  it('K-34 an empty `.` in the bottom row counts as filled: no front there, a fall into it is `window`, a rail above it is correct', () => {
    // plan (top → bottom) WW / .W → (6,0) is `.`, (7,0) W, (6,1) W, (7,1) W; OBSTACLES S2: "`.` üstündeki hücre … ray"
    const s = initialState({
      wall: { height: 3, gaps: [{ type: 'static', y: 1, size: 1 }] },
      plan: ['WW', '.W'],
      pieces: [['B1_0', 'W', 5, 1]],
    });
    expect(buildFront(s)).toEqual([site(6, 1), site(7, 0)]);
    const into = computeFall(s, 0, N(6, 8));
    expect(into.landing).toEqual({ ix: 6, iy: 0 });
    expect(into.verdict).toEqual({ ok: false, reasons: ['window'], missingSupport: [] });
    const rail = computeFall(s, 0, R(0, 6, 1));
    expect(rail.mode).toBe('rail');
    expect(rail.landing).toEqual({ ix: 6, iy: 1 });
    expect(rail.verdict).toEqual({ ok: true, reasons: [], missingSupport: [] });
  });

  it('K-34 an unfilled `?` cell below is missing support; `?` cells can be front cells; K-15 needs them filled', () => {
    // K-32 repeat p = 1: (c, 1) takes the colour of (c, 0) → (6,1) = W, (7,1) = Y
    const s = initialState({
      plan: ['WW', '??', 'WY'],
      hidden: [{ kind: 'repeat', period: 1 }],
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'Y', 1, 0],
        ['B1_0', 'W', 2, 0],
      ],
    });
    toSite(s, 0, 6, 0);
    toSite(s, 1, 7, 0);
    expect(isCorrectPlacement(s, 2, cellsOf('B1_0', 6, 2))).toEqual({
      ok: false,
      reasons: ['support'],
      missingSupport: [site(6, 1)],
    });
    expect(buildFront(s)).toEqual([site(6, 1), site(7, 1)]);
    expect(isSegmentComplete(s, 0)).toBe(false);
  });

  it('K-34 a correct placement under a wrong-object overhang is allowed: only the cells below count (K-19 example note)', () => {
    // GDD K-19: "Çıkıntının altına doğru yerleşim yalnızca çıkıntı yanlış bir nesneyse (… Y8) mümkündür."
    const s = initialState({
      wall: { height: 4, gaps: [{ type: 'static', y: 2, size: 1 }] },
      plan: WW(4),
      pieces: [
        ['D2_0', 'W', 0, 0],
        ['B1_0', 'R', 1, 0, ['mortar']],
        ['B1_0', 'W', 5, 2],
      ],
    });
    toSite(s, 0, 7, 0); // (7,0)–(7,1) correctly filled
    toSite(s, 1, 7, 3, { locked: false, stuck: true }); // stuck mortar overhang at (7,3), (7,2) empty under it
    const under = computeFall(s, 2, R(0, 7, 2));
    expect(under.landing).toEqual({ ix: 7, iy: 2 });
    expect(under.verdict).toEqual({ ok: true, reasons: [], missingSupport: [] });
    // over the top of the mortar: above the plan (h = 4) and K-34 broken by the empty (7,2) and the mortar cell (7,3)
    const over = computeFall(s, 2, N(7, 8));
    expect(over.landing).toEqual({ ix: 7, iy: 4 });
    expect(over.verdict).toEqual({
      ok: false,
      reasons: ['outside', 'support'],
      missingSupport: [site(7, 2), site(7, 3)],
    });
  });

  it('K-34 hook 1: a wrong object ABOVE an empty plan cell does not remove the front below it', () => {
    // hook 1: "boş, `.` olmayan ve altındaki bütün plan hücreleri doğru dolu ya da boş `.` olan en alt plan hücresi"
    const s = initialState({ plan: WW(3), pieces: [['B1_0', 'W', 0, 0]], debris: [['B1_0', 'R', 6, 2]] });
    expect(wrongOccMask(s, 0, 0)).toBe(0b100);
    expect(buildFront(s)).toEqual([site(6, 0), site(7, 0)]);
    expect(isCorrectPlacement(s, 0, cellsOf('B1_0', 6, 0)).ok).toBe(true);
  });
});

// --- K-18 shadow ---------------------------------------------------------------------------------------------------------

describe('review: K-18 fall shadow', () => {
  it('K-18 a correct landing shows "correct" on easy/normal and only the position on hard/superhard', () => {
    const s = initialState({ plan: ['WW'], pieces: [['B1_0', 'W', 0, 0]] });
    const fall = computeFall(s, 0, N(6, 8));
    expect(fall.verdict.ok).toBe(true);
    const correct = { tone: 'correct', reasons: [], missingSupport: [], breaks: false };
    const neutral = { tone: 'neutral', reasons: [], missingSupport: [], breaks: false };
    expect(shadowInfo(fall, 'easy')).toEqual(correct);
    expect(shadowInfo(fall, 'normal')).toEqual(correct);
    expect(shadowInfo(fall, 'hard')).toEqual(neutral);
    expect(shadowInfo(fall, 'superhard')).toEqual(neutral);
  });

  it('K-18 a CORRECT landing on an unrevealed `?` cell is neutral even on easy (no correct cue leaks), free fall and rail', () => {
    // GDD K-18: "Gölge açılmamış bir `?` hücresine değiyorsa bütün zorluklarda doğruluk nötrdür (… doğru/hatalı sesi de çalmaz)"
    const s = initialState({
      difficulty: 'easy',
      wall: { height: 3, gaps: [{ type: 'static', y: 1, size: 1 }] },
      plan: ['??', 'WY'],
      hidden: [{ kind: 'repeat', period: 1 }],
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'Y', 1, 0],
        ['B1_0', 'W', 5, 1],
      ],
    });
    toSite(s, 0, 6, 0);
    toSite(s, 1, 7, 0);
    const neutral = { tone: 'neutral', reasons: [], missingSupport: [], breaks: false };
    const free = computeFall(s, 2, N(6, 8));
    expect(free.landing).toEqual({ ix: 6, iy: 1 });
    expect(free.verdict.ok).toBe(true);
    expect(free.touchesHidden).toBe(true);
    expect(shadowInfo(free, 'easy')).toEqual(neutral);
    const rail = computeFall(s, 2, R(0, 6, 1));
    expect(rail.touchesHidden).toBe(true);
    expect(shadowInfo(rail, 'easy')).toEqual(neutral);
    // the real placement is still correct and opens the cell (K-32)
    const out = settlePlacement(s, 2, free.landing, free.verdict);
    expect(out.kind === 'correct' && out.revealed).toEqual([{ x: 6, y: 1, color: 'W' }]);
  });

  it('K-18 a neutral shadow drops debris/window/colour but keeps support with its cells (K-34 hook 2 order on easy)', () => {
    // plan (top → bottom) WW / W. / WW: (7,1) is `.`; (6,0) filled; R debris O4 outside the plan at (6,4)
    const spec: LevelSpec = {
      plan: ['WW', 'W.', 'WW'],
      pieces: [['B1_0', 'W', 0, 0]],
      debris: [['O4_0', 'R', 6, 4]],
    };
    const s = initialState({ ...spec, difficulty: 'hard' });
    toSite(s, 0, 6, 0);
    const fall = computeFall(s, 1, N(6, 8));
    expect(fall.landing).toEqual({ ix: 6, iy: 1 });
    expect(fall.verdict).toEqual({
      ok: false,
      reasons: ['debris', 'window', 'color', 'support'],
      missingSupport: [site(7, 0)],
    });
    expect(shadowInfo(fall, s.lvl.difficulty)).toEqual({
      tone: 'neutral',
      reasons: ['support'],
      missingSupport: [site(7, 0)],
      breaks: false,
    });
    expect(shadowInfo(fall, 'easy')).toEqual({
      tone: 'wrong',
      reasons: ['debris', 'window', 'color', 'support'],
      missingSupport: [site(7, 0)],
      breaks: false,
    });
  });
});

// --- K-19 normal gravity / K-11 landing --------------------------------------------------------------------------------

describe('review: K-19 normal gravity and K-11 landing', () => {
  it('K-19 without steering the landing, distance, path and verdict do not depend on the gravity setting', () => {
    // GDD K-19: "İniş satırı, cam kırılması ve doğrulama hızdan bağımsızdır." Only G-L adds steering.
    const results = (['low', 'normal', 'high'] as const).map((build) => {
      const s = initialState({
        gravity: { build },
        plan: WW(4),
        pieces: [
          ['D2_0', 'W', 0, 0],
          ['O4_0', 'W', 2, 0],
        ],
      });
      toSite(s, 0, 6, 0);
      const f = computeFall(s, 1, N(6, 8));
      return {
        landing: f.landing,
        distance: f.distance,
        path: f.path,
        verdict: f.verdict,
        steered: f.steered,
      };
    });
    expect(results[0]).toEqual({
      landing: { ix: 6, iy: 2 },
      distance: 6,
      path: [
        { ix: 6, iy: 8 },
        { ix: 6, iy: 2 },
      ],
      verdict: { ok: false, reasons: ['support'], missingSupport: [site(7, 0), site(7, 1)] },
      steered: null,
    });
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  });

  it('K-17 a release over a full column lands in the crane rows (d = 0): outside, and a mortar block does not stick there (E-08)', () => {
    // GDD K-17 / OBSTACLES Y8: "Bir hücresi plan dışındaysa normal geri seker"; K-11: "Blok havada asılı kalamaz"
    const s = initialState({
      plan: WW(8),
      pieces: [
        ['I4_0', 'W', 0, 0],
        ['I4_0', 'W', 1, 0],
        ['B1_0', 'W', 2, 7, ['mortar']],
      ],
    });
    toSite(s, 0, 6, 0);
    toSite(s, 1, 6, 4);
    const start = piecePlace(s, 2);
    const fall = computeFall(s, 2, N(6, 8));
    expect(fall.landing).toEqual({ ix: 6, iy: 8 });
    expect(fall.distance).toBe(0);
    expect(fall.verdict).toEqual({ ok: false, reasons: ['outside'], missingSupport: [] });
    const out = settlePlacement(s, 2, fall.landing, fall.verdict, { start, rules: MORTAR });
    expect(out.kind).toBe('bounced');
    expect(out.kind === 'bounced' && out.target).toEqual({
      step: 1,
      to: { zone: 'yard', x: 2, y: 7, seg: -1 },
      dropFrom: null,
    });
    expect(hasFlag(s, 2, 'stuck')).toBe(false);
    expect(yardOcc(s, 2, 7)).toBe(3);
    expect(stateInvariantErrors(s)).toEqual([]);
  });
});

// --- K-17 bounce-back target -------------------------------------------------------------------------------------------

/** GDD K-17 step 2 order, written from the text: xs = 0 … 6 − w by |x − start x|, ties: larger x (nearer the wall). */
function gddColumnOrder(startX: number, w: number): number[] {
  const xs: number[] = [];
  for (let c = 0; c <= 6 - w; c++) xs.push(c);
  return xs.sort((a, b) => {
    const d = Math.abs(a - startX) - Math.abs(b - startX);
    return d !== 0 ? d : b - a;
  });
}

/** Step-by-step drop from y = 10 − h over an occupancy set; null when a landed cell would be above y = 7. */
function naiveDrop(occupied: ReadonlySet<string>, shape: ShapeId, x: number): number | null {
  const def = shapeById(shape);
  const free = (y: number) => def.cells.every((c) => !occupied.has(`${x + c.x},${y + c.y}`));
  let y = 10 - def.h;
  if (!free(y)) return null;
  while (y > 0 && free(y - 1)) y--;
  return y + def.h <= 8 ? y : null;
}

describe('review: K-17 bounce-back search', () => {
  it('K-17 step 2 equals a step-by-step drop from y = 10 − h on random yards (crates support, holes stay empty)', () => {
    const shapes: ShapeId[] = [
      'B1_0',
      'D2_0',
      'D2_90',
      'I3_0',
      'O4_0',
      'C3_0',
      'C3_90',
      'C3_180',
      'C3_270',
      'L4_0',
      'J4_0',
      'T4_0',
    ];
    const rng = mulberry32(17_2026);
    let step2 = 0;
    let step3 = 0;
    for (let round = 0; round < 80; round++) {
      const occupied = new Set<string>();
      const pieces: PieceSpec[] = [];
      const obstacles: NonNullable<LevelSpec['obstacles']>[number][] = [];
      for (let x = 0; x < 6; x++) {
        const top = rng.nextInt(9);
        for (let y = 0; y < top; y++) {
          if (rng.nextInt(4) === 0) continue; // a hole under an overhang
          occupied.add(`${x},${y}`);
          if (obstacles.length < 3 && rng.nextInt(7) === 0) obstacles.push({ type: 'crate', x, y, hp: 1 });
          else pieces.push(['B1_0', 'W', x, y]);
        }
      }
      if (pieces.length === 0) continue;
      const s = initialState({
        plan: ['WW'],
        pieces,
        obstacles,
        batches: [{ forSegment: 0, pieces: shapes.map((sh): PieceSpec => [sh, 'G', 0, 8]) }],
      });
      for (let x = 0; x < 6; x++)
        for (let y = 0; y < 8; y++) expect(yardOcc(s, x, y) !== 0).toBe(occupied.has(`${x},${y}`));
      shapes.forEach((sh, i) => {
        const id = pieces.length + i;
        const w = shapeById(sh).w;
        const h = shapeById(sh).h;
        for (const startX of [6, 7]) {
          if (startX + w > 8) continue;
          let expected: unknown = { step: 3 };
          for (const c of gddColumnOrder(startX, w)) {
            const y = naiveDrop(occupied, sh, c);
            if (y === null) continue;
            expected = {
              step: 2,
              to: { zone: 'yard', x: c, y, seg: -1 },
              dropFrom: { ix: c, iy: 10 - h },
            };
            break;
          }
          const got = returnTarget(s, id, {
            start: { zone: 'site', x: startX, y: 0, seg: 0 },
            skipStart: true,
          });
          if (got.step === 3) {
            step3++;
            expect({ step: got.step }).toEqual(expected);
            expect(got.to.zone).toBe('queue');
          } else {
            step2++;
            expect(got).toEqual(expected);
          }
          for (let c = 0; c <= 6 - w; c++)
            expect(dropIntoYard(s, shapeById(sh), c)).toBe(naiveDrop(occupied, sh, c) ?? -1);
        }
      });
    }
    expect(step2).toBeGreaterThan(300);
    expect(step3).toBeGreaterThan(0);
  });

  it('K-17 step 2: a full near column is skipped, a crate supports, the hole under it stays empty; 2-high drop from y = 8', () => {
    // column 5: crate (5,0) + blocks (5,1)…(5,6) → a D2_0 would end at (5,7)–(5,8) → not ≤ 7 → skipped
    // column 4: only a crate at (4,2) → D2_0 falls from (4,8) onto it → (4,3); (4,0)–(4,1) stay empty
    const pieces: PieceSpec[] = [];
    for (let y = 1; y <= 6; y++) pieces.push(['B1_0', 'W', 5, y]);
    const s = initialState({
      plan: ['WW'],
      pieces,
      obstacles: [
        { type: 'crate', x: 5, y: 0, hp: 1 },
        { type: 'crate', x: 4, y: 2, hp: 1 },
      ],
      batches: [{ forSegment: 0, pieces: [['D2_0', 'G', 0, 8]] }],
    });
    const id = pieces.length;
    const target = returnTarget(s, id, { start: { zone: 'site', x: 6, y: 0, seg: 0 }, skipStart: true });
    expect(target).toEqual({
      step: 2,
      to: { zone: 'yard', x: 4, y: 3, seg: -1 },
      dropFrom: { ix: 4, iy: 8 },
    });
  });

  it('K-17 Y8: a stuck mortar block re-dropped on a correct cell locks; stuck clears and its old cell is freed', () => {
    // TECH §5.2 / GDD Y8 "Doğru yerleşirse normal kilitlenir"; plan (top → bottom) WW / RW → (6,0) = R
    const s = initialState({ plan: ['WW', 'RW'], pieces: [['B1_0', 'R', 0, 0, ['mortar']]] });
    toSite(s, 0, 7, 1, { locked: false, stuck: true }); // stuck on the W cell (7,1)
    expect(wrongOccMask(s, 0, 1)).toBe(0b10);
    const start = piecePlace(s, 0);
    const fall = computeFall(s, 0, N(6, 8));
    expect(fall.landing).toEqual({ ix: 6, iy: 0 });
    expect(fall.verdict.ok).toBe(true);
    const out = settlePlacement(s, 0, fall.landing, fall.verdict, { start, rules: MORTAR });
    expect(out.kind).toBe('correct');
    expect(hasFlag(s, 0, 'stuck')).toBe(false);
    expect(hasFlag(s, 0, 'locked')).toBe(true);
    expect([wrongOccMask(s, 0, 0), wrongOccMask(s, 0, 1)]).toEqual([0, 0]);
    expect([filledMask(s, 0, 0), filledMask(s, 0, 1)]).toEqual([0b1, 0]);
    expect(siteOcc(s, 0, 1, 1)).toBe(0);
    expect(buildFront(s)).toEqual([site(6, 1), site(7, 0)]);
    expect(stateInvariantErrors(s)).toEqual([]);
  });

  it('E-24 a fresh mortar block falling into a `.` cell sticks (window): no front above it, segment incomplete (E-43)', () => {
    const s = initialState({
      plan: ['WW', 'W.', 'WW'],
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'W', 1, 0, ['mortar']],
        ['B1_0', 'W', 2, 0],
      ],
    });
    toSite(s, 0, 7, 0);
    const fall = computeFall(s, 1, N(7, 8));
    expect(fall.landing).toEqual({ ix: 7, iy: 1 });
    expect(fall.verdict).toEqual({ ok: false, reasons: ['window'], missingSupport: [] });
    const out = settlePlacement(s, 1, fall.landing, fall.verdict, { rules: MORTAR });
    expect(out).toEqual({
      kind: 'stuck',
      at: { zone: 'site', x: 7, y: 1, seg: 0 },
      reason: 'window',
      missingSupport: [],
    });
    expect(wrongOccMask(s, 0, 1)).toBe(0b10);
    expect(buildFront(s)).toEqual([site(6, 0)]);
    expect(isSegmentComplete(s, 0)).toBe(false);
    // E-43: the next W block in column 7 lands on the mortar at (7,2) and is wrong for support at (7,1)
    const next = computeFall(s, 2, N(7, 8));
    expect(next.landing).toEqual({ ix: 7, iy: 2 });
    expect(next.verdict).toEqual({ ok: false, reasons: ['support'], missingSupport: [site(7, 1)] });
    expect(stateInvariantErrors(s)).toEqual([]);
  });

  it('K-34 hook 4: a mortar block of the right colour sticks for support only; it is no "doğru dolu" for the front', () => {
    const s = initialState({
      plan: WW(2),
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['D2_90', 'W', 1, 0, ['mortar']],
      ],
    });
    toSite(s, 0, 6, 0);
    const fall = computeFall(s, 1, N(6, 8));
    expect(fall.landing).toEqual({ ix: 6, iy: 1 });
    expect(fall.verdict).toEqual({ ok: false, reasons: ['support'], missingSupport: [site(7, 0)] });
    const out = settlePlacement(s, 1, fall.landing, fall.verdict, { rules: MORTAR });
    expect(out).toEqual({
      kind: 'stuck',
      at: { zone: 'site', x: 6, y: 1, seg: 0 },
      reason: 'support',
      missingSupport: [site(7, 0)],
    });
    expect([wrongOccMask(s, 0, 0), wrongOccMask(s, 0, 1)]).toEqual([0b10, 0b10]);
    expect([filledMask(s, 0, 0), filledMask(s, 0, 1)]).toEqual([0b1, 0]);
    // column 6: the lowest unfilled cell (6,1) holds the mortar → no front; column 7: (7,0) is empty → front
    expect(buildFront(s)).toEqual([site(7, 0)]);
    expect(isSegmentComplete(s, 0)).toBe(false);
    expect(stateInvariantErrors(s)).toEqual([]);
  });
});

// --- through the move pipeline (public applyMove) ------------------------------------------------------------------------

describe('review: K-17 / K-34 / K-22 through applyMove', () => {
  it('K-17 GDD example: B1 Y from (3,7) onto a W cell bounces back to (3,7); 9 → 8, streak 0, bounce event', () => {
    const s = initialState({
      moves: 9,
      plan: ['WW'],
      pieces: [
        ['B1_0', 'Y', 3, 7],
        ['B1_0', 'W', 0, 0],
      ],
    });
    setHdr(s, H.combo, 2);
    const sink = drag(s, 0, N(6, 8));
    expect(hdr(s, H.movesLeft)).toBe(8);
    expect(hdr(s, H.combo)).toBe(0);
    expect(hdr(s, H.turn)).toBe(1);
    expect(piecePlace(s, 0)).toEqual({ zone: 'yard', x: 3, y: 7, seg: -1 });
    expect(siteOcc(s, 0, 0, 0)).toBe(0);
    expect(eventsOf(sink.events, 'placementWrong')).toMatchObject([{ pieceId: 0, reasons: ['color'] }]);
    expect(eventsOf(sink.events, 'pieceBounced')).toMatchObject([
      {
        pieceId: 0,
        from: site(6, 0),
        to: { zone: 'yard', x: 3, y: 7 },
        viaDrop: false,
        reason: 'color',
        missingSupport: [],
      },
    ]);
    expect(eventsOf(sink.events, 'placementCorrect')).toEqual([]);
    expect(stateInvariantErrors(s)).toEqual([]);
  });

  it('E-43 through the pipeline: a W block into column 7 bounces with support/[(7,1)]; once the mortar leaves, (7,2) is a front cell', () => {
    const s = initialState({
      plan: ['WW', 'W.', 'WW'],
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'R', 1, 0, ['mortar']],
        ['B1_0', 'W', 2, 0],
      ],
    });
    toSite(s, 0, 7, 0); // (7,0) correctly filled
    toSite(s, 1, 7, 1, { locked: false, stuck: true }); // mortar stuck on the `.` cell (7,1) (E-24)
    expect(buildFront(s)).toEqual([site(6, 0)]);
    const sink = drag(s, 2, N(7, 8));
    expect(eventsOf(sink.events, 'placementWrong')).toMatchObject([
      { pieceId: 2, reasons: ['support'], missingSupport: [site(7, 1)] },
    ]);
    expect(eventsOf(sink.events, 'pieceBounced')).toMatchObject([
      { pieceId: 2, from: site(7, 2), reason: 'support', missingSupport: [site(7, 1)] },
    ]);
    expect(piecePlace(s, 2)).toEqual({ zone: 'yard', x: 2, y: 0, seg: -1 });
    // the mortar is dragged out to the yard: (7,1) is an empty `.` again, the front comes back the same move
    drag(s, 1, N(5, 7));
    expect(piecePlace(s, 1)).toEqual({ zone: 'yard', x: 5, y: 7, seg: -1 });
    expect(hasFlag(s, 1, 'stuck')).toBe(false);
    expect(wrongOccMask(s, 0, 1)).toBe(0);
    expect(buildFront(s)).toEqual([site(6, 0), site(7, 2)]);
    expect(stateInvariantErrors(s)).toEqual([]);
  });

  it('K-34 example 1 through the pipeline: O4 bounces for support, after a D2_0 W in column 7 it is correct and the level is won', () => {
    const s = initialState({
      moves: 10,
      plan: WW(4),
      pieces: [
        ['D2_0', 'W', 0, 0],
        ['D2_0', 'W', 1, 0],
        ['O4_0', 'W', 2, 0],
      ],
    });
    drag(s, 0, N(6, 8)); // D2_0 W → (6,0)–(6,1), correct
    expect(hasFlag(s, 0, 'locked')).toBe(true);
    const wrong = drag(s, 2, N(6, 8)); // O4 W → (6,2): (7,0), (7,1) empty
    expect(eventsOf(wrong.events, 'pieceBounced')).toMatchObject([
      { pieceId: 2, from: site(6, 2), reason: 'support', missingSupport: [site(7, 0), site(7, 1)] },
    ]);
    expect(piecePlace(s, 2)).toEqual({ zone: 'yard', x: 2, y: 0, seg: -1 });
    drag(s, 1, N(7, 8)); // "Doğru hamle: önce bir D2_0 W'yi sütun 7'ye bırakmak."
    const sink = new ArraySink();
    const res = applyMove(s, { kind: 'drag', pieceId: 2, to: N(6, 8) }, sink, {
      strict: true,
      noTruckHelp: true,
    });
    expect(eventsOf(sink.events, 'placementCorrect')).toMatchObject([
      { pieceId: 2, cells: [site(6, 2), site(7, 2), site(6, 3), site(7, 3)] },
    ]);
    expect(res.won).toBe(true);
    expect(hdr(s, H.movesLeft)).toBe(6);
    expect(stateInvariantErrors(s)).toEqual([]);
  });

  it('K-22 after the slide the next segment comes empty: falls ignore the completed segment, verdicts use the new plan', () => {
    // segment 0: WW; segment 1 (top → bottom): YY / RR
    const s = initialState({
      plan: [['WW'], ['YY', 'RR']],
      pieces: [
        ['D2_90', 'W', 0, 0],
        ['B1_0', 'Y', 2, 0],
        ['B1_0', 'R', 3, 0],
      ],
    });
    const sink = drag(s, 0, N(6, 8));
    expect(eventsOf(sink.events, 'segmentCompleted')).toMatchObject([{ seg: 0 }]);
    expect(hdr(s, H.activeSeg)).toBe(1);
    expect(siteOcc(s, 0, 0, 0)).toBe(1); // the completed segment keeps its locked blocks (panorama)
    expect(siteColumnMasks(s)).toEqual([0, 0]);
    const y = computeFall(s, 1, N(6, 8));
    expect(y.landing).toEqual({ ix: 6, iy: 0 });
    expect(y.distance).toBe(8);
    expect(y.verdict).toEqual({ ok: false, reasons: ['color'], missingSupport: [] });
    expect(isCorrectPlacement(s, 1, cellsOf('B1_0', 6, 1))).toEqual({
      ok: false,
      reasons: ['support'],
      missingSupport: [site(6, 0, 1)],
    });
    expect(computeFall(s, 2, N(7, 8)).verdict.ok).toBe(true);
    expect(buildFront(s)).toEqual([site(6, 0, 1), site(7, 0, 1)]);
    expect(isSegmentComplete(s, 0)).toBe(true);
    expect(isSegmentComplete(s, 1)).toBe(false);
  });
});

// --- round 1 extras: K-22 debris of a later segment, K-33/K-34 trowel, K-19 normal steer record, yard drop support ----

describe('review: segment, trowel, steer record and yard support edges', () => {
  it('K-22 debris of segment 1 is invisible on segment 0; after the slide it blocks its column and bounces to its own start', () => {
    const s = initialState({
      plan: [['WW'], ['WW', 'WW']],
      pieces: [
        ['D2_90', 'W', 0, 0],
        ['B1_0', 'W', 2, 0],
      ],
      debris: [['B1_0', 'R', 7, 0, 1]],
    });
    const debris = 2;
    expect(wrongOccMask(s, 1, 1)).toBe(0b1);
    expect(tryBeginDrag(s, debris)).toEqual({ ok: false, reason: 'hiddenSegment' });
    expect(siteColumnMasks(s)).toEqual([0, 0]);
    expect(computeFall(s, 1, N(7, 8)).landing).toEqual({ ix: 7, iy: 0 });
    expect(computeFall(s, 1, N(7, 8)).verdict.ok).toBe(true);
    drag(s, 0, N(6, 8)); // segment 0 complete → slide (K-22)
    expect(hdr(s, H.activeSeg)).toBe(1);
    expect(siteColumnMasks(s)).toEqual([0, 0b1]);
    expect(buildFront(s)).toEqual([site(6, 0, 1)]);
    const sink = drag(s, debris, N(6, 8));
    expect(eventsOf(sink.events, 'pieceBounced')).toMatchObject([
      { pieceId: debris, from: site(6, 0, 1), to: site(7, 0, 1), reason: 'debris', viaDrop: false },
    ]);
    expect(piecePlace(s, debris)).toEqual({ zone: 'site', x: 7, y: 0, seg: 1 });
    expect(wrongOccMask(s, 1, 1)).toBe(0b1);
    expect(stateInvariantErrors(s)).toEqual([]);
  });

  it('K-34 the Golden Trowel obeys the support rule (K-33 = buildFront): above a wrong object refused, a hole under it allowed', () => {
    // E-43 board: (7,0) filled, mortar stuck on the `.` (7,1) → (7,2) is not a front cell
    const a = initialState({
      plan: ['WW', 'W.', 'WW'],
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'R', 1, 0, ['mortar']],
      ],
    });
    toSite(a, 0, 7, 0);
    toSite(a, 1, 7, 1, { locked: false, stuck: true });
    setHdr(a, H.trowels, 2);
    const refused = applyMove(a, { kind: 'trowel', seg: 0, x: 1, y: 2 }, new ArraySink(), {
      noTruckHelp: true,
    });
    expect(refused).toMatchObject({ status: 'rejected', reason: 'notBuildFront' });
    expect(siteOcc(a, 0, 1, 2)).toBe(0);
    const ok = applyMove(a, { kind: 'trowel', seg: 0, x: 0, y: 0 }, new ArraySink(), { noTruckHelp: true });
    expect(ok.status).toBe('applied');
    expect(filledMask(a, 0, 0)).toBe(0b1);
    // hook-4 board: a right-colour mortar stuck at (6,1)–(7,1) over the empty (7,0): (7,0) is a front cell
    const b = initialState({
      plan: WW(2),
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['D2_90', 'W', 1, 0, ['mortar']],
      ],
    });
    toSite(b, 0, 6, 0);
    toSite(b, 1, 6, 1, { locked: false, stuck: true });
    setHdr(b, H.trowels, 2);
    expect(
      applyMove(b, { kind: 'trowel', seg: 0, x: 0, y: 1 }, new ArraySink(), { noTruckHelp: true }).status,
    ).toBe('rejected');
    expect(
      applyMove(b, { kind: 'trowel', seg: 0, x: 1, y: 0 }, new ArraySink(), { noTruckHelp: true }).status,
    ).toBe('applied');
    expect(filledMask(b, 0, 1)).toBe(0b1);
    expect(stateInvariantErrors(a)).toEqual([]);
    expect(stateInvariantErrors(b)).toEqual([]);
  });

  it('K-19 normal gravity has no steering: a drag record with steer never shifts the block (refused or ignored)', () => {
    const s = initialState({ plan: WW(2), pieces: [['B1_0', 'W', 0, 0]] });
    const before = s.buf.slice();
    const sink = new ArraySink();
    const res = applyMove(s, { kind: 'drag', pieceId: 0, to: N(6, 8), steer: { dir: 1, atRow: 4 } }, sink, {
      noTruckHelp: true,
    });
    expect(eventsOf(sink.events, 'steered')).toEqual([]);
    if (res.status === 'applied') expect(piecePlace(s, 0)).toEqual({ zone: 'site', x: 6, y: 0, seg: 0 });
    else expect(s.buf).toEqual(before);
  });

  it('K-17 step 2: a cement bag supports the drop, a hidden screw neither supports nor blocks it (K-08)', () => {
    const s = initialState({
      plan: ['WW'],
      pieces: [['B1_0', 'W', 0, 0]],
      obstacles: [
        { type: 'cement_bag', x: 2, y: 0 },
        { type: 'screw', x: 3, y: 0 },
      ],
    });
    expect(dropIntoYard(s, shapeById('B1_0'), 2)).toBe(1);
    expect(dropIntoYard(s, shapeById('B1_0'), 3)).toBe(0);
    expect(dropIntoYard(s, shapeById('O4_0'), 2)).toBe(1);
    expect(dropIntoYard(s, shapeById('O4_0'), 3)).toBe(0);
  });
});

describe('review: K-34 example 2 and K-17 rail bounce through applyMove', () => {
  it('K-34 example 2 through the pipeline: the rail lintel bounces while (6,1) is empty, then is correct over the empty `.`', () => {
    // plan (bottom → top) y0 WW, y1 W., y2 WW; static gap y = 2 (W1, K-12)
    const s = initialState({
      moves: 10,
      wall: { height: 4, gaps: [{ type: 'static', y: 2, size: 1 }] },
      plan: ['WW', 'W.', 'WW'],
      pieces: [
        ['D2_90', 'W', 0, 0],
        ['D2_90', 'W', 4, 2],
        ['B1_0', 'W', 0, 7],
      ],
    });
    toSite(s, 0, 6, 0); // (6,0)–(7,0) filled
    const wrong = drag(s, 1, R(0, 6, 2));
    expect(eventsOf(wrong.events, 'pieceBounced')).toMatchObject([
      {
        pieceId: 1,
        from: site(6, 2),
        to: { zone: 'yard', x: 4, y: 2 },
        reason: 'support',
        missingSupport: [site(6, 1)],
      },
    ]);
    expect(hdr(s, H.movesLeft)).toBe(9);
    drag(s, 2, N(6, 8)); // B1 W falls onto (6,1)
    expect(piecePlace(s, 2)).toEqual({ zone: 'site', x: 6, y: 1, seg: 0 });
    expect(hasFlag(s, 2, 'locked')).toBe(true);
    const sink = new ArraySink();
    const res = applyMove(s, { kind: 'drag', pieceId: 1, to: R(0, 6, 2) }, sink, {
      strict: true,
      noTruckHelp: true,
    });
    expect(eventsOf(sink.events, 'placementCorrect')).toMatchObject([
      { pieceId: 1, cells: [site(6, 2), site(7, 2)], overWall: false },
    ]);
    expect(siteOcc(s, 0, 1, 1)).toBe(0); // the `.` stays empty under the lintel
    expect(res.won).toBe(true);
    expect(hdr(s, H.movesLeft)).toBe(7);
    expect(stateInvariantErrors(s)).toEqual([]);
  });
});

// --- independent oracle written from the GDD text (K-16, K-34 incl. hook 1 and hook 2) ---------------------------------

type Occupant = 'locked' | 'stuck' | 'trowel' | 'debris';

interface OracleBoard {
  /** `plan[sx][sy]`: colour, '.', or null (outside the plan area). */
  readonly plan: (string | null)[][];
  /** `occ[sx][sy]` for plan rows 0–7. */
  readonly occ: (Occupant | null)[][];
}

/** GDD K-16 (1)–(3) + K-34 + hook 2, written from the rule text (the moving block is not debris and not on the site). */
function oracleVerdict(b: OracleBoard, cells: readonly { x: number; y: number }[], color: string): Verdict {
  let outside = false;
  let window = false;
  let wrongColor = false;
  const low = [99, 99];
  for (const c of cells) {
    const sx = c.x - 6;
    if (sx < 0 || sx > 1 || c.y < 0) {
      outside = true;
      continue;
    }
    low[sx] = Math.min(low[sx] ?? 99, c.y);
    const ch = c.y < 8 ? (b.plan[sx]?.[c.y] ?? null) : null;
    if (ch === null) outside = true;
    else if (ch === '.') window = true;
    else if (ch !== color) wrongColor = true;
  }
  const missing: At[] = [];
  for (let sx = 0; sx < 2; sx++) {
    const r = low[sx] ?? 99;
    if (r === 99) continue;
    for (let sy = 0; sy < Math.min(r, 8); sy++) {
      const ch = b.plan[sx]?.[sy] ?? null;
      const o = b.occ[sx]?.[sy] ?? null;
      if (ch === null) continue;
      if (ch === '.') {
        // "`.` hücreleri bu kuralda yalnızca boşken dolu sayılır"
        if (o === 'stuck' || o === 'debris') missing.push(site(6 + sx, sy));
      } else if (o !== 'locked' && o !== 'trowel') {
        // "plan satırları 0 … r−1 içindeki `.` olmayan her hücre doğru dolu olmalıdır"
        missing.push(site(6 + sx, sy));
      }
    }
  }
  const reasons: VerdictReason[] = [];
  if (outside) reasons.push('outside');
  if (window) reasons.push('window');
  if (wrongColor) reasons.push('color');
  if (missing.length > 0) reasons.push('support');
  return { ok: reasons.length === 0, reasons, missingSupport: reasons.length === 0 ? [] : missing };
}

/** GDD K-34 hook 1, written from the rule text. */
function oracleFront(b: OracleBoard): At[] {
  const out: At[] = [];
  for (let sx = 0; sx < 2; sx++) {
    let r = -1;
    for (let sy = 0; sy < 8; sy++) {
      const ch = b.plan[sx]?.[sy] ?? null;
      const o = b.occ[sx]?.[sy] ?? null;
      if (ch !== null && ch !== '.' && o !== 'locked' && o !== 'trowel') {
        r = sy;
        break;
      }
    }
    if (r < 0 || (b.occ[sx]?.[r] ?? null) !== null) continue; // complete column, or the cell is not empty
    let below = true;
    for (let sy = 0; sy < r; sy++)
      if ((b.plan[sx]?.[sy] ?? null) === '.' && (b.occ[sx]?.[sy] ?? null) !== null) below = false;
    if (below) out.push(site(6 + sx, r));
  }
  return out;
}

describe('review: K-16 / K-34 against an independent oracle', () => {
  it('K-34 verdict, hook-2 reasons/missingSupport, hook-1 front and the K-11 fall match the GDD text on random boards', () => {
    const moving = SHAPES.filter((d) => d.id === d.canonical && d.w <= 2 && d.h <= 4 && !d.heavy).map(
      (d) => d.id,
    );
    const colors: ColorCode[] = ['W', 'Y', 'R'];
    const rng = mulberry32(34_1617);
    let verdicts = 0;
    let falls = 0;
    const seenReasons = new Set<string>();
    for (let round = 0; round < 250; round++) {
      const h = 1 + rng.nextInt(8);
      const plan: (string | null)[][] = [[], []];
      const occ: (Occupant | null)[][] = [[], []];
      for (let sx = 0; sx < 2; sx++)
        for (let sy = 0; sy < 8; sy++) {
          plan[sx]![sy] = sy >= h ? null : rng.nextInt(5) === 0 ? '.' : (colors[rng.nextInt(2)] ?? 'W');
          occ[sx]![sy] = null;
        }
      if (!plan.some((col) => col.some((ch) => ch !== null && ch !== '.'))) plan[0]![0] = 'W';
      const rows: string[] = [];
      for (let sy = h - 1; sy >= 0; sy--) rows.push(`${plan[0]![sy]}${plan[1]![sy]}`);
      // occupants: locked / trowel on colour cells, stuck on plan-area cells, debris anywhere in the 2 × 8 area
      const blocks: { x: number; y: number; kind: 'locked' | 'stuck'; color: ColorCode }[] = [];
      const debris: [ShapeId, ColorCode, number, number][] = [];
      const trowels: { sx: number; sy: number }[] = [];
      for (let sx = 0; sx < 2; sx++)
        for (let sy = 0; sy < 8; sy++) {
          const ch = plan[sx]![sy] ?? null;
          const roll = rng.nextInt(10);
          if (ch !== null && ch !== '.' && roll < 3) {
            occ[sx]![sy] = 'locked';
            blocks.push({ x: 6 + sx, y: sy, kind: 'locked', color: ch as ColorCode });
          } else if (ch !== null && ch !== '.' && roll === 3) {
            occ[sx]![sy] = 'trowel';
            trowels.push({ sx, sy });
          } else if (ch !== null && roll === 4) {
            occ[sx]![sy] = 'stuck';
            blocks.push({ x: 6 + sx, y: sy, kind: 'stuck', color: 'R' });
          } else if (roll === 5 && debris.length < 3) {
            occ[sx]![sy] = 'debris';
            debris.push(['B1_0', 'R', 6 + sx, sy]);
          }
        }
      const shape = moving[rng.nextInt(moving.length)] ?? 'B1_0';
      const color = colors[rng.nextInt(2)] ?? 'W';
      const pieces: PieceSpec[] = [[shape, color, 2, 4]];
      blocks.forEach((b, i) => pieces.push(['B1_0', b.color, i % 6, Math.floor(i / 6)]));
      const s = initialState({ plan: rows, pieces, debris });
      blocks.forEach((b, i) =>
        toSite(s, 1 + i, b.x, b.y, { locked: b.kind === 'locked', stuck: b.kind === 'stuck' }),
      );
      for (const tr of trowels) setSiteOcc(s, 0, tr.sx, tr.sy, SITE_TROWEL);
      refreshSiteMasks(s, 0);
      const board: OracleBoard = { plan, occ };
      expect(buildFront(s)).toEqual(oracleFront(board));

      const def = shapeById(shape);
      const freeAt = (ix: number, iy: number) =>
        blockCells(def, ix, iy).every((c) => c.y >= 8 || (occ[c.x - 6]?.[c.y] ?? null) === null);
      for (let k = 0; k < 12; k++) {
        const ix = 6 + rng.nextInt(3 - def.w);
        const iy = rng.nextInt(11 - def.h);
        if (!freeAt(ix, iy)) continue;
        const v = isCorrectPlacement(s, 0, blockCells(def, ix, iy));
        const want = oracleVerdict(board, blockCells(def, ix, iy), color);
        expect({ at: [shape, ix, iy], v }).toEqual({ at: [shape, ix, iy], v: want });
        for (const r of v.reasons) seenReasons.add(r);
        if (v.ok) seenReasons.add('ok');
        verdicts++;
      }
      // K-11 / K-18: a FREE release at the top of either column lands where a step-by-step fall stops
      for (let ix = 6; ix <= 8 - def.w; ix++) {
        const top = 10 - def.h;
        if (!freeAt(ix, top)) continue;
        let y = top;
        while (y > 0 && freeAt(ix, y - 1)) y--;
        const fall = computeFall(s, 0, N(ix, top));
        expect({ shape, ix, landing: fall.landing, d: fall.distance }).toEqual({
          shape,
          ix,
          landing: { ix, iy: y },
          d: top - y,
        });
        expect(fall.verdict).toEqual(oracleVerdict(board, blockCells(def, ix, y), color));
        falls++;
      }
    }
    expect(verdicts).toBeGreaterThan(1000);
    expect(falls).toBeGreaterThan(200);
    expect([...seenReasons].sort()).toEqual(['color', 'ok', 'outside', 'support', 'window']);
  });
});

describe('review: K-17 stuck block through applyMove', () => {
  it('K-17 GDD example through the pipeline: a stuck mortar dropped off the plan bounces to its start (step 1) and stays stuck', () => {
    // plan height 3, column 7 rows 0–2 filled, (6,0)–(6,1) filled, B1 mortar stuck at (6,2); released at (7,8) → (7,3)
    const s = initialState({
      moves: 10,
      plan: WW(3),
      pieces: [
        ['I3_0', 'W', 0, 0],
        ['D2_0', 'W', 1, 0],
        ['B1_0', 'R', 2, 0, ['mortar']],
      ],
    });
    toSite(s, 0, 7, 0);
    toSite(s, 1, 6, 0);
    toSite(s, 2, 6, 2, { locked: false, stuck: true });
    const sink = drag(s, 2, N(7, 8));
    expect(eventsOf(sink.events, 'pieceFell')).toMatchObject([
      { pieceId: 2, from: site(7, 8), to: site(7, 3), rows: 5 },
    ]);
    expect(eventsOf(sink.events, 'mortarStuck')).toEqual([]);
    expect(eventsOf(sink.events, 'pieceBounced')).toMatchObject([
      { pieceId: 2, from: site(7, 3), to: site(6, 2), viaDrop: false, reason: 'outside', missingSupport: [] },
    ]);
    expect(piecePlace(s, 2)).toEqual({ zone: 'site', x: 6, y: 2, seg: 0 });
    expect(hasFlag(s, 2, 'stuck')).toBe(true);
    expect([wrongOccMask(s, 0, 0), wrongOccMask(s, 0, 1)]).toEqual([0b100, 0]);
    expect(siteOcc(s, 0, 1, 3)).toBe(0);
    expect(stateInvariantErrors(s)).toEqual([]);
  });
});

// =====================================================================================================================
// Round 2
// =====================================================================================================================

describe('review round 2: K-18 the shadow is the move result', () => {
  it('K-18 on random boards the shadow (computeFall + shadowInfo) predicts applyMove: lock at the shadow or K-17 bounce to the yard start', () => {
    // GDD K-18: "bırakılırsa duracağı konum gölge olarak her zaman doğru gösterilir"; K-17 (1): saha başlangıcı her zaman boş
    const moving = SHAPES.filter((d) => d.id === d.canonical && d.w <= 2 && d.h <= 4 && !d.heavy).map(
      (d) => d.id,
    );
    const colors: ColorCode[] = ['W', 'Y'];
    const rng = mulberry32(18_2026);
    let correct = 0;
    let wrong = 0;
    let skipped = 0;
    const seen = new Set<string>();
    for (let round = 0; round < 300; round++) {
      const h = 1 + rng.nextInt(8);
      const plan: string[][] = [[], []];
      for (let sx = 0; sx < 2; sx++)
        for (let sy = 0; sy < h; sy++)
          plan[sx]![sy] = rng.nextInt(5) === 0 ? '.' : (colors[rng.nextInt(2)] ?? 'W');
      if (!plan.some((col) => col.some((ch) => ch !== '.'))) plan[0]![0] = 'W';
      const rows: string[] = [];
      for (let sy = h - 1; sy >= 0; sy--) rows.push(`${plan[0]![sy]}${plan[1]![sy]}`);
      const blocks: { x: number; y: number; kind: 'locked' | 'stuck'; color: ColorCode }[] = [];
      const debris: [ShapeId, ColorCode, number, number][] = [];
      const trowels: { sx: number; sy: number }[] = [];
      // a reachable board: per column a correctly built prefix (locked / trowel, empty `.`), wrong objects above it
      for (let sx = 0; sx < 2; sx++) {
        const built = rng.nextInt(h + 1);
        for (let sy = 0; sy < 8; sy++) {
          const ch = sy < h ? (plan[sx]![sy] ?? null) : null;
          if (sy < built) {
            if (ch === '.') continue;
            if (rng.nextInt(4) === 0) trowels.push({ sx, sy });
            else blocks.push({ x: 6 + sx, y: sy, kind: 'locked', color: ch as ColorCode });
            continue;
          }
          const roll = rng.nextInt(14);
          if (ch !== null && roll === 0) blocks.push({ x: 6 + sx, y: sy, kind: 'stuck', color: 'R' });
          else if (roll === 1 && debris.length < 2) debris.push(['B1_0', 'R', 6 + sx, sy]);
        }
      }
      const common: ShapeId[] = ['B1_0', 'B1_0', 'D2_0', 'D2_90', 'O4_0'];
      const shape =
        (rng.nextInt(2) === 0 ? common[rng.nextInt(common.length)] : moving[rng.nextInt(moving.length)]) ??
        'B1_0';
      // half of the time the colour of a front cell (more correct placements), else random
      const fronts = [0, 1].flatMap((sx) => {
        const sy = plan[sx]!.findIndex(
          (ch, y) =>
            ch !== '.' &&
            !blocks.some((b) => b.x === 6 + sx && b.y === y) &&
            !trowels.some((t) => t.sx === sx && t.sy === y),
        );
        return sy < 0 ? [] : [plan[sx]![sy] as ColorCode];
      });
      const color =
        (rng.nextInt(2) === 0 ? fronts[rng.nextInt(Math.max(fronts.length, 1))] : undefined) ??
        colors[rng.nextInt(2)] ??
        'W';
      const pieces: PieceSpec[] = [[shape, color, 2, 4]];
      blocks.forEach((b, i) => pieces.push(['B1_0', b.color, i % 6, Math.floor(i / 6)]));
      const base = initialState({ moves: 20, plan: rows, pieces, debris });
      blocks.forEach((b, i) =>
        toSite(base, 1 + i, b.x, b.y, { locked: b.kind === 'locked', stuck: b.kind === 'stuck' }),
      );
      for (const t of trowels) setSiteOcc(base, 0, t.sx, t.sy, SITE_TROWEL);
      refreshSiteMasks(base, 0);
      expect(stateInvariantErrors(base)).toEqual([]);
      const def = shapeById(shape);
      for (let ix = 6; ix <= 8 - def.w; ix++) {
        const node = N(ix, 10 - def.h);
        const s = cloneState(base);
        let fall;
        try {
          fall = computeFall(s, 0, node);
        } catch {
          skipped++;
          continue;
        }
        const shadow = shadowInfo(fall, 'easy');
        const sink = new ArraySink();
        const res = applyMove(s, { kind: 'drag', pieceId: 0, to: node }, sink, { noTruckHelp: true });
        if (res.status !== 'applied') {
          skipped++;
          continue;
        }
        const ctx = { shape, ix, h, landing: fall.landing };
        expect({
          ctx,
          fell: eventsOf(sink.events, 'pieceFell').filter((e) => e.cause === 'release'),
        }).toMatchObject({
          ctx,
          fell: [
            {
              pieceId: 0,
              from: site(node.ix, node.iy),
              to: site(fall.landing.ix, fall.landing.iy),
              rows: fall.distance,
            },
          ],
        });
        expect(hdr(s, H.movesLeft)).toBe(19);
        if (fall.verdict.ok) {
          expect({ ctx, tone: shadow.tone }).toEqual({ ctx, tone: 'correct' });
          expect(eventsOf(sink.events, 'placementCorrect')).toMatchObject([
            { pieceId: 0, cells: fall.cells.map((c) => site(c.x, c.y)), overWall: true },
          ]);
          expect(eventsOf(sink.events, 'pieceBounced')).toEqual([]);
          expect(piecePlace(s, 0)).toEqual({ zone: 'site', x: fall.landing.ix, y: fall.landing.iy, seg: 0 });
          expect(hasFlag(s, 0, 'locked')).toBe(true);
          correct++;
        } else {
          expect({ ctx, shadow }).toEqual({
            ctx,
            shadow: {
              tone: 'wrong',
              reasons: fall.verdict.reasons,
              missingSupport: fall.verdict.missingSupport,
              breaks: false,
            },
          });
          expect({ ctx, ev: eventsOf(sink.events, 'placementWrong') }).toMatchObject({
            ctx,
            ev: [{ pieceId: 0, reasons: fall.verdict.reasons, missingSupport: fall.verdict.missingSupport }],
          });
          expect(eventsOf(sink.events, 'pieceBounced')).toMatchObject([
            {
              pieceId: 0,
              from: site(fall.landing.ix, fall.landing.iy),
              to: { zone: 'yard', x: 2, y: 4 },
              viaDrop: false,
              reason: fall.verdict.reasons[0],
              missingSupport: fall.verdict.missingSupport,
            },
          ]);
          expect(piecePlace(s, 0)).toEqual({ zone: 'yard', x: 2, y: 4, seg: -1 });
          expect(hdr(s, H.combo)).toBe(0);
          for (const r of fall.verdict.reasons) seen.add(r);
          wrong++;
        }
        expect(stateInvariantErrors(s)).toEqual([]);
      }
    }
    expect(correct).toBeGreaterThan(20);
    expect(wrong).toBeGreaterThan(200);
    expect(skipped).toBeLessThan(correct + wrong);
    expect([...seen].sort()).toEqual(['color', 'outside', 'support', 'window']);
  });
});

describe('review round 2: K-17 bounce-back search edges', () => {
  it('K-17 step 2 tie-break for a yard start: equal distance goes to the larger x (nearer the wall) first', () => {
    // GDD K-17 (2): "xs = 0 … 6 − w başlangıç x'ine uzaklığa göre sıralanır, eşitlikte duvara yakın (büyük x) önce"
    expect(nearestColumnsFirst(2, 1)).toEqual([2, 3, 1, 4, 0, 5]);
    expect(nearestColumnsFirst(3, 2)).toEqual([3, 4, 2, 1, 0]);
    expect(nearestColumnsFirst(0, 1)).toEqual([0, 1, 2, 3, 4, 5]);
    // site starts (TECH §5.2 / GDD K-17 exception): "w = 1: 5, 4, 3 …; w = 2: 4, 3 …"
    expect(nearestColumnsFirst(6, 1)).toEqual([5, 4, 3, 2, 1, 0]);
    expect(nearestColumnsFirst(7, 1)).toEqual([5, 4, 3, 2, 1, 0]);
    expect(nearestColumnsFirst(6, 2)).toEqual([4, 3, 2, 1, 0]);

    const full = (x: number): PieceSpec[] => [
      ['I4_0', 'W', x, 0],
      ['I4_0', 'W', x, 4],
    ];
    // B1 (piece 0) whose start (2,7) is taken by another block → step 1 fails, step 2 searches 2, 3, 1, 4, 0, 5
    const b1 = (fullCols: number[]) => {
      const s = initialState({ plan: ['WW'], pieces: [['B1_0', 'G', 0, 7], ...fullCols.flatMap(full)] });
      return returnTarget(s, 0, { start: { zone: 'yard', x: 2, y: 7, seg: -1 } });
    };
    const yard = (x: number, y: number, h: number) => ({
      step: 2,
      to: { zone: 'yard', x, y, seg: -1 },
      dropFrom: { ix: x, iy: 10 - h },
    });
    expect(b1([2])).toEqual(yard(3, 0, 1));
    expect(b1([2, 3])).toEqual(yard(1, 0, 1));
    expect(b1([2, 3, 1])).toEqual(yard(4, 0, 1));
    // 2, 3, 1, 4 full: 0 (distance 2) comes before 5 (distance 3); the held B1's own cell (0,7) does not count
    expect(b1([2, 3, 1, 4])).toEqual(yard(0, 0, 1));
    expect(b1([2, 3, 1, 4, 0])).toEqual(yard(5, 0, 1));
    // O4 (piece 0, held, at (0,6)) with start x = 3: 3 (cols 3–4), 4 (cols 4–5), 2 (cols 2–3), 1, 0
    const o4 = (fullCols: number[]) => {
      const s = initialState({ plan: ['WW'], pieces: [['O4_0', 'G', 0, 6], ...fullCols.flatMap(full)] });
      return returnTarget(s, 0, { start: { zone: 'yard', x: 3, y: 6, seg: -1 } });
    };
    expect(o4([3])).toEqual(yard(4, 0, 2));
    // 3 and 5 full: x 3, 4 and 2 fail; x 1 covers columns 1–2 (the held block's own cells do not count)
    expect(o4([3, 5])).toEqual(yard(1, 0, 2));
  });

  it('K-17 exception: a broken stuck glass mortar D2_90 skips step 1, tries x 4 then 3 (w = 2), unsticks and reopens the front', () => {
    // GDD K-17 "İstisnalar"; TECH §5.2: "ilk aday duvara en yakın sütundur (w = 1: 5, 4, 3 …; w = 2: 4, 3 …)"
    const s = initialState({
      plan: WW(3),
      pieces: [
        ['D2_0', 'W', 0, 0],
        ['D2_0', 'W', 1, 0],
        ['D2_90', 'R', 2, 0, ['glass', 'mortar']],
        ['I4_0', 'W', 5, 0],
        ['I4_0', 'W', 5, 4],
      ],
    });
    toSite(s, 0, 6, 0);
    toSite(s, 1, 7, 0);
    toSite(s, 2, 6, 2, { locked: false, stuck: true });
    expect(buildFront(s)).toEqual([]);
    const target = returnBrokenPiece(s, 2, piecePlace(s, 2));
    // x 4 covers the full column 5 → a cell would end above y = 7; x 3 (columns 3–4) is empty
    expect(target).toEqual({
      step: 2,
      to: { zone: 'yard', x: 3, y: 0, seg: -1 },
      dropFrom: { ix: 3, iy: 9 },
    });
    expect(piecePlace(s, 2)).toEqual({ zone: 'yard', x: 3, y: 0, seg: -1 });
    expect(hasFlag(s, 2, 'stuck')).toBe(false);
    expect([wrongOccMask(s, 0, 0), wrongOccMask(s, 0, 1)]).toEqual([0, 0]);
    expect([siteOcc(s, 0, 0, 2), siteOcc(s, 0, 1, 2)]).toEqual([0, 0]);
    expect(buildFront(s)).toEqual([site(6, 2), site(7, 2)]);
    expect(stateInvariantErrors(s)).toEqual([]);
  });

  it('K-17 / Y8: a stuck mortar re-dropped wrong inside the plan sticks at the new cell; front and K-34 follow it', () => {
    // GDD K-17: "Plan içinde başka bir hatalı konuma inerse orada yeniden yapışır (Y8)"
    const s = initialState({
      plan: WW(2),
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'R', 1, 0, ['mortar']],
        ['B1_0', 'W', 2, 0],
      ],
    });
    toSite(s, 0, 6, 0);
    toSite(s, 1, 6, 1, { locked: false, stuck: true });
    expect(buildFront(s)).toEqual([site(7, 0)]);
    const start = piecePlace(s, 1);
    const fall = computeFall(s, 1, N(7, 8));
    expect(fall.landing).toEqual({ ix: 7, iy: 0 });
    expect(fall.verdict).toEqual({ ok: false, reasons: ['color'], missingSupport: [] });
    const out = settlePlacement(s, 1, fall.landing, fall.verdict, { start, rules: MORTAR });
    expect(out).toEqual({
      kind: 'stuck',
      at: { zone: 'site', x: 7, y: 0, seg: 0 },
      reason: 'color',
      missingSupport: [],
    });
    expect(hasFlag(s, 1, 'stuck')).toBe(true);
    expect(siteOcc(s, 0, 0, 1)).toBe(0);
    expect([wrongOccMask(s, 0, 0), wrongOccMask(s, 0, 1)]).toEqual([0, 0b1]);
    // column 6: (6,1) is empty again → front; column 7: the mortar sits on its lowest cell → no front
    expect(buildFront(s)).toEqual([site(6, 1)]);
    expect(computeFall(s, 2, N(6, 8)).verdict.ok).toBe(true);
    expect(isCorrectPlacement(s, 2, cellsOf('B1_0', 7, 1))).toEqual({
      ok: false,
      reasons: ['support'],
      missingSupport: [site(7, 0)],
    });
    expect(stateInvariantErrors(s)).toEqual([]);
  });
});

describe('review round 2: Y8 / K-34 edges', () => {
  it('E-08 a mortar block with one cell above the plan top (still inside the 2 × 8 site) bounces instead of sticking', () => {
    // OBSTACLES Y8: "bütün hücreleri plan alanında (renkli, `?` ya da `.` hücre) ise … yapışır. Bir hücresi plan dışındaysa normal geri seker"
    const s = initialState({
      plan: WW(2),
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['D2_0', 'R', 1, 0, ['mortar']],
        ['B1_0', 'R', 2, 0, ['mortar']],
      ],
    });
    toSite(s, 0, 6, 0);
    const tall = computeFall(s, 1, N(6, 8));
    expect(tall.landing).toEqual({ ix: 6, iy: 1 }); // cells (6,1) W and (6,2) above h = 2
    expect(tall.verdict).toEqual({ ok: false, reasons: ['outside', 'color'], missingSupport: [] });
    expect(allCellsInPlanArea(s, tall.cells)).toBe(false);
    const out = settlePlacement(s, 1, tall.landing, tall.verdict, { rules: MORTAR });
    expect(out.kind === 'bounced' && out.target).toEqual({
      step: 1,
      to: { zone: 'yard', x: 1, y: 0, seg: -1 },
      dropFrom: null,
    });
    expect(hasFlag(s, 1, 'stuck')).toBe(false);
    expect([wrongOccMask(s, 0, 0), wrongOccMask(s, 0, 1)]).toEqual([0, 0]);
    // the same release with a 1-high mortar stays inside the plan → it sticks at (6,1)
    const short = computeFall(s, 2, N(6, 8));
    expect(short.landing).toEqual({ ix: 6, iy: 1 });
    expect(settlePlacement(s, 2, short.landing, short.verdict, { rules: MORTAR }).kind).toBe('stuck');
    expect(wrongOccMask(s, 0, 0)).toBe(0b10);
    expect(stateInvariantErrors(s)).toEqual([]);
  });

  it('N32 / K-34 a mortar stuck on a `?` cell in the wrong colour opens nothing; that cell is missing support and the shadow above stays neutral', () => {
    // OBSTACLES N32: "Yanlış renkle `?` hücresine yapışan harç hücreyi açmaz"; K-32 repeat p = 1 → every row = W Y
    const s = initialState({
      plan: ['??', '??', 'WY'],
      hidden: [{ kind: 'repeat', period: 1 }],
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'Y', 1, 0],
        ['B1_0', 'R', 2, 0, ['mortar']],
        ['B1_0', 'W', 3, 0],
      ],
    });
    toSite(s, 0, 6, 0);
    toSite(s, 1, 7, 0);
    const m = computeFall(s, 2, N(6, 8));
    expect(m.landing).toEqual({ ix: 6, iy: 1 });
    expect(m.touchesHidden).toBe(true);
    expect(m.verdict).toEqual({ ok: false, reasons: ['color'], missingSupport: [] });
    expect(shadowInfo(m, 'easy')).toEqual({
      tone: 'neutral',
      reasons: [],
      missingSupport: [],
      breaks: false,
    });
    expect(settlePlacement(s, 2, m.landing, m.verdict, { rules: MORTAR }).kind).toBe('stuck');
    expect(revealedMask(s, 0)).toBe(0);
    const w = computeFall(s, 3, N(6, 8));
    expect(w.landing).toEqual({ ix: 6, iy: 2 });
    expect(w.touchesHidden).toBe(true);
    expect(w.verdict).toEqual({ ok: false, reasons: ['support'], missingSupport: [site(6, 1)] });
    expect(shadowInfo(w, 'easy')).toEqual({
      tone: 'neutral',
      reasons: ['support'],
      missingSupport: [site(6, 1)],
      breaks: false,
    });
    expect(buildFront(s)).toEqual([site(7, 1)]);
    expect(isSegmentComplete(s, 0)).toBe(false);
    expect(stateInvariantErrors(s)).toEqual([]);
  });

  it('K-34 a stuck mortar lifted from a `.` cell does not block itself: its own rail placement above is correct, another block is not (E-43)', () => {
    // K-34: "`.` hücreleri bu kuralda yalnızca boşken dolu sayılır" — once lifted, (7,1) is empty
    const s = initialState({
      wall: { height: 4, gaps: [{ type: 'static', y: 2, size: 1 }] },
      plan: ['WW', 'W.', 'WW'],
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'W', 1, 0, ['mortar']],
        ['B1_0', 'W', 2, 0],
      ],
    });
    toSite(s, 0, 7, 0);
    toSite(s, 1, 7, 1, { locked: false, stuck: true });
    expect(buildFront(s)).toEqual([site(6, 0)]);
    const own = computeFall(s, 1, R(0, 7, 2));
    expect(own.verdict).toEqual({ ok: true, reasons: [], missingSupport: [] });
    const other = computeFall(s, 2, R(0, 7, 2));
    expect(other.verdict).toEqual({ ok: false, reasons: ['support'], missingSupport: [site(7, 1)] });
    // FREE in column 7: the mortar falls through its own old cell back into the `.`; another block lands on top of it
    const ownFree = computeFall(s, 1, N(7, 8));
    expect(ownFree.landing).toEqual({ ix: 7, iy: 1 });
    expect(ownFree.verdict).toEqual({ ok: false, reasons: ['window'], missingSupport: [] });
    const otherFree = computeFall(s, 2, N(7, 8));
    expect(otherFree.landing).toEqual({ ix: 7, iy: 2 });
    expect(otherFree.verdict).toEqual({ ok: false, reasons: ['support'], missingSupport: [site(7, 1)] });
    // the mortar's own rail placement locks it at (7,2); (7,1) is an empty `.` again and column 7 is complete
    expect(settlePlacement(s, 1, own.landing, own.verdict, { rules: MORTAR }).kind).toBe('correct');
    expect(hasFlag(s, 1, 'stuck')).toBe(false);
    expect(siteOcc(s, 0, 1, 1)).toBe(0);
    expect([wrongOccMask(s, 0, 1), filledMask(s, 0, 1)]).toEqual([0, 0b101]);
    expect(buildFront(s)).toEqual([site(6, 0)]);
    expect(stateInvariantErrors(s)).toEqual([]);
  });

  it('K-18 / K-34 hook 2 on an unrevealed `?` landing (easy): the colour is hidden but `support` and its cells still show (E-20)', () => {
    // K-34 kanca 2: "`support` nedeni gizli bilgi taşımadığı için gölge nötr olduğunda (Zor, `?`) da gösterilebilir"
    const s = initialState({
      difficulty: 'easy',
      plan: ['??', 'WW'],
      hidden: [{ kind: 'repeat', period: 1 }],
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['D2_90', 'Y', 1, 0],
        ['D2_90', 'W', 3, 0],
      ],
    });
    toSite(s, 0, 6, 0);
    const y = computeFall(s, 1, N(6, 8));
    expect(y.landing).toEqual({ ix: 6, iy: 1 });
    expect(y.touchesHidden).toBe(true);
    expect(y.verdict).toEqual({ ok: false, reasons: ['color', 'support'], missingSupport: [site(7, 0)] });
    const neutralSupport = {
      tone: 'neutral',
      reasons: ['support'],
      missingSupport: [site(7, 0)],
      breaks: false,
    };
    expect(shadowInfo(y, 'easy')).toEqual(neutralSupport);
    expect(shadowInfo(y, 'normal')).toEqual(neutralSupport);
    const w = computeFall(s, 2, N(6, 8));
    expect(w.verdict).toEqual({ ok: false, reasons: ['support'], missingSupport: [site(7, 0)] });
    expect(shadowInfo(w, 'easy')).toEqual(neutralSupport);
    // E-20: the real placement of the Y block is wrong (primary reason colour) and opens nothing
    const out = settlePlacement(s, 1, y.landing, y.verdict);
    expect(out.kind === 'bounced' && out.reason).toBe('color');
    expect(revealedMask(s, 0)).toBe(0);
    expect(stateInvariantErrors(s)).toEqual([]);
  });
});

describe('review round 2: GDD examples through applyMove', () => {
  it('K-15 GDD example ["YY","W.","WW"]: S2 B1 into column 7 bounces (window); a Y bridge over the `.` completes it with (7,1) empty', () => {
    // K-15: "5 hücre doldurulur, (7,1) boş kalır"; OBSTACLES S2: "`B1` W sütun 7'ye bırakılır → (7,1)'e düşer → hatalı";
    // S2: "`.` üstündeki hücre … iki sütuna köprü kuran 2 geniş blok (duvar üstü)" ile dolar
    const s = initialState({
      moves: 10,
      plan: ['YY', 'W.', 'WW'],
      pieces: [
        ['D2_90', 'W', 0, 0],
        ['B1_0', 'W', 2, 0],
        ['B1_0', 'W', 3, 0],
        ['D2_90', 'Y', 4, 0],
      ],
    });
    drag(s, 0, N(6, 8)); // (6,0)–(7,0)
    expect(hasFlag(s, 0, 'locked')).toBe(true);
    const into = drag(s, 2, N(7, 8));
    expect(eventsOf(into.events, 'pieceFell')).toMatchObject([{ pieceId: 2, to: site(7, 1) }]);
    expect(eventsOf(into.events, 'pieceBounced')).toMatchObject([
      {
        pieceId: 2,
        from: site(7, 1),
        to: { zone: 'yard', x: 3, y: 0 },
        reason: 'window',
        missingSupport: [],
      },
    ]);
    drag(s, 1, N(6, 8)); // (6,1)
    expect(buildFront(s)).toEqual([site(6, 2), site(7, 2)]);
    const sink = new ArraySink();
    const res = applyMove(s, { kind: 'drag', pieceId: 3, to: N(6, 8) }, sink, {
      strict: true,
      noTruckHelp: true,
    });
    expect(eventsOf(sink.events, 'placementCorrect')).toMatchObject([
      { pieceId: 3, cells: [site(6, 2), site(7, 2)], overWall: true },
    ]);
    expect(res.won).toBe(true);
    expect(isSegmentComplete(s, 0)).toBe(true);
    expect(siteOcc(s, 0, 1, 1)).toBe(0);
    expect([filledMask(s, 0, 0), filledMask(s, 0, 1)]).toEqual([0b111, 0b101]);
    expect(hdr(s, H.movesLeft)).toBe(6);
    expect(stateInvariantErrors(s)).toEqual([]);
  });

  it('K-14 GDD example: touching the D2_90 Y locked at (6,0) does nothing and spends no move', () => {
    const s = initialState({
      moves: 10,
      plan: ['WW', 'YY'],
      pieces: [
        ['D2_90', 'Y', 0, 0],
        ['B1_0', 'W', 2, 0],
      ],
    });
    drag(s, 0, N(6, 8));
    expect(piecePlace(s, 0)).toEqual({ zone: 'site', x: 6, y: 0, seg: 0 });
    expect(hasFlag(s, 0, 'locked')).toBe(true);
    expect(tryBeginDrag(s, 0).ok).toBe(false);
    const before = s.buf.slice();
    const res = applyMove(s, { kind: 'drag', pieceId: 0, to: N(0, 5) }, new ArraySink(), {
      noTruckHelp: true,
    });
    expect(res.status).toBe('cancelled');
    expect(s.buf).toEqual(before);
    expect(hdr(s, H.movesLeft)).toBe(9);
  });

  it('K-34 hook 3 through applyMove: a bounce whose primary reason is colour still carries the missing support cells', () => {
    // K-34 kanca 3: "K-17 geri sekmesinde birincil neden ve eksik destek hücreleri olayla birlikte yayınlanır"
    const s = initialState({
      moves: 10,
      plan: WW(2),
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['D2_90', 'Y', 2, 0],
      ],
    });
    drag(s, 0, N(6, 8)); // (6,0) correct, streak 1
    expect(hdr(s, H.combo)).toBe(1);
    const sink = drag(s, 1, N(6, 8)); // top(6) = 1, top(7) = 0 → lands (6,1)–(7,1)
    expect(eventsOf(sink.events, 'placementWrong')).toMatchObject([
      { pieceId: 1, reasons: ['color', 'support'], missingSupport: [site(7, 0)] },
    ]);
    expect(eventsOf(sink.events, 'pieceBounced')).toMatchObject([
      {
        pieceId: 1,
        from: site(6, 1),
        to: { zone: 'yard', x: 2, y: 0 },
        viaDrop: false,
        reason: 'color',
        missingSupport: [site(7, 0)],
      },
    ]);
    expect(piecePlace(s, 1)).toEqual({ zone: 'yard', x: 2, y: 0, seg: -1 });
    expect(hdr(s, H.combo)).toBe(0);
    expect(hdr(s, H.movesLeft)).toBe(8);
    expect(stateInvariantErrors(s)).toEqual([]);
  });

  it('K-19 normal gravity: computeFall ignores a steer option; landing, path and verdict equal the unsteered fall', () => {
    // K-19 tablo: `normal` → Yönlendirme "Yok"
    const s = initialState({
      plan: WW(2),
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'W', 1, 0],
      ],
    });
    toSite(s, 0, 6, 0);
    const plain = computeFall(s, 1, N(7, 8));
    const asked = computeFall(s, 1, N(7, 8), { steer: { dir: -1, atRow: 4 } });
    expect(asked).toEqual(plain);
    expect(asked.steered).toBeNull();
    expect(asked.landing).toEqual({ ix: 7, iy: 0 });
    expect(asked.path).toEqual([
      { ix: 7, iy: 8 },
      { ix: 7, iy: 0 },
    ]);
  });
});

// =====================================================================================================================
// Round 3
// =====================================================================================================================

describe('review round 3: S4 debris through the pipeline (K-15, K-16 (2), K-17, K-34, E-43)', () => {
  it('K-15 S4 a filled plan with debris above it completes only on the move that takes the debris out; that yard move wins on the last move (E-01)', () => {
    // K-15: "dilim alanında (2×8 sütun parçası) başka hiçbir blok bulunmayınca dilim tamamlanır";
    // OBSTACLES S4: "Dilim, alanında moloz varken tamamlanmaz"; E-01: adım 11 önce kazanma
    const s = initialState({
      moves: 2,
      wall: { height: 1, gaps: [{ type: 'static', y: 0, size: 1 }] },
      plan: ['WW'],
      pieces: [['D2_90', 'W', 4, 0]],
      debris: [['B1_0', 'R', 7, 2]],
    });
    const debris = 1;
    expect(wrongOccMask(s, 0, 1)).toBe(0); // above the plan (h = 1): no K-34 bit
    const first = drag(s, 0, R(0, 6, 0));
    expect(eventsOf(first.events, 'placementCorrect')).toMatchObject([
      { pieceId: 0, cells: [site(6, 0), site(7, 0)], overWall: false },
    ]);
    expect([filledMask(s, 0, 0), filledMask(s, 0, 1)]).toEqual([0b1, 0b1]);
    expect(eventsOf(first.events, 'segmentCompleted')).toEqual([]);
    expect(eventsOf(first.events, 'levelWon')).toEqual([]);
    expect(isSegmentComplete(s, 0)).toBe(false);
    expect(buildFront(s)).toEqual([]);
    expect(hdr(s, H.movesLeft)).toBe(1);
    // the debris goes left through the open row 2 (≥ height 1) into the yard: a yard move (K-07 row 2)
    const sink = new ArraySink();
    const res = applyMove(s, { kind: 'drag', pieceId: debris, to: N(5, 2) }, sink, {
      strict: true,
      noTruckHelp: true,
    });
    expect(res).toMatchObject({ status: 'applied', won: true, outOfMoves: false });
    expect(piecePlace(s, debris)).toEqual({ zone: 'yard', x: 5, y: 2, seg: -1 });
    expect(eventsOf(sink.events, 'segmentCompleted')).toMatchObject([{ seg: 0 }]);
    expect(eventsOf(sink.events, 'levelWon')).toMatchObject([{ movesLeft: 0 }]);
    expect(eventsOf(sink.events, 'outOfMoves')).toEqual([]);
    expect(isSegmentComplete(s, 0)).toBe(true);
    expect(stateInvariantErrors(s)).toEqual([]);
  });

  it('K-16 S4 debris carried to the yard stays debris: dropped on a cell of its own colour with full support it is wrong and bounces to its yard start', () => {
    // OBSTACLES S4: "Sahaya bırakılınca … sahada sıradan, kullanılamaz bir blok olur"; K-16 (2): "blok moloz (S4) değildir"
    // plan (top → bottom) WW / RR → (6,0) = R
    const s = initialState({
      moves: 10,
      plan: ['WW', 'RR'],
      pieces: [['B1_0', 'W', 0, 0]],
      debris: [['B1_0', 'R', 7, 3]],
    });
    const debris = 1;
    drag(s, debris, N(5, 3));
    expect(piecePlace(s, debris)).toEqual({ zone: 'yard', x: 5, y: 3, seg: -1 });
    expect(hasFlag(s, debris, 'debris')).toBe(true);
    const fall = computeFall(s, debris, N(6, 8));
    expect(fall.landing).toEqual({ ix: 6, iy: 0 });
    expect(fall.verdict).toEqual({ ok: false, reasons: ['debris'], missingSupport: [] });
    expect(shadowInfo(fall, 'easy')).toEqual({
      tone: 'wrong',
      reasons: ['debris'],
      missingSupport: [],
      breaks: false,
    });
    expect(shadowInfo(fall, 'hard')).toEqual({
      tone: 'neutral',
      reasons: [],
      missingSupport: [],
      breaks: false,
    });
    const sink = drag(s, debris, N(6, 8));
    expect(eventsOf(sink.events, 'placementCorrect')).toEqual([]);
    expect(eventsOf(sink.events, 'pieceBounced')).toMatchObject([
      {
        pieceId: debris,
        from: site(6, 0),
        to: { zone: 'yard', x: 5, y: 3 },
        viaDrop: false,
        reason: 'debris',
        missingSupport: [],
      },
    ]);
    expect(piecePlace(s, debris)).toEqual({ zone: 'yard', x: 5, y: 3, seg: -1 });
    expect(siteOcc(s, 0, 0, 0)).toBe(0);
    expect([filledMask(s, 0, 0), wrongOccMask(s, 0, 0)]).toEqual([0, 0]);
    expect(buildFront(s)).toEqual([site(6, 0), site(7, 0)]);
    expect(hdr(s, H.movesLeft)).toBe(8);
    expect(stateInvariantErrors(s)).toEqual([]);
  });

  it('K-12 K-17 debris that starts on its rail and is released at another site cell is wrong (debris, support) and returns to its own start (step 1)', () => {
    // K-12 tek istisna (moloz ray kipinde başlayabilir); S4: "Şantiyede başka yere bırakılırsa hatalı → başlangıcına döner"
    const s = initialState({
      moves: 10,
      wall: { height: 4, gaps: [{ type: 'static', y: 3, size: 1 }] },
      plan: WW(4),
      pieces: [['B1_0', 'W', 0, 0]],
      debris: [['B1_0', 'W', 7, 3]],
    });
    const debris = 1;
    expect([wrongOccMask(s, 0, 0), wrongOccMask(s, 0, 1)]).toEqual([0, 0b1000]);
    expect(buildFront(s)).toEqual([site(6, 0), site(7, 0)]);
    const below = [site(6, 0), site(6, 1), site(6, 2)];
    const rail = computeFall(s, debris, R(0, 6, 3));
    expect(rail.mode).toBe('rail');
    expect(rail.landing).toEqual({ ix: 6, iy: 3 });
    expect(rail.verdict).toEqual({ ok: false, reasons: ['debris', 'support'], missingSupport: below });
    expect(shadowInfo(rail, 'hard')).toEqual({
      tone: 'neutral',
      reasons: ['support'],
      missingSupport: below,
      breaks: false,
    });
    const sink = drag(s, debris, R(0, 6, 3));
    expect(eventsOf(sink.events, 'pieceMoved')).toMatchObject([
      { pieceId: debris, from: site(7, 3), to: site(6, 3), entry: 'gap', gap: 0 },
    ]);
    expect(eventsOf(sink.events, 'pieceFell')).toEqual([]);
    expect(eventsOf(sink.events, 'placementWrong')).toMatchObject([
      { pieceId: debris, reasons: ['debris', 'support'], missingSupport: below },
    ]);
    expect(eventsOf(sink.events, 'pieceBounced')).toMatchObject([
      {
        pieceId: debris,
        from: site(6, 3),
        to: site(7, 3),
        viaDrop: false,
        reason: 'debris',
        missingSupport: below,
      },
    ]);
    expect(piecePlace(s, debris)).toEqual({ zone: 'site', x: 7, y: 3, seg: 0 });
    expect([wrongOccMask(s, 0, 0), wrongOccMask(s, 0, 1)]).toEqual([0, 0b1000]);
    expect(siteOcc(s, 0, 0, 3)).toBe(0);
    expect(hdr(s, H.movesLeft)).toBe(9);
    expect(stateInvariantErrors(s)).toEqual([]);
  });

  it('K-17 GDD example through the pipeline: debris D2_0 from (7,0)–(7,1) dropped into column 6 returns to (7,0)–(7,1); a W block on top of it is wrong (support)', () => {
    // K-17: "Moloz bloğu başlangıcı şantiyede (7,0)–(7,1) ise ve başka bir hatalı yere bırakıldıysa (7,0)–(7,1)'e döner"
    // K-34: "Moloz ya da yapışmış harçlı blok … 'doğru dolu' değildir; üstlerine doğru yerleşim yapılamaz"
    const s = initialState({
      moves: 10,
      plan: WW(3),
      pieces: [['B1_0', 'W', 0, 0]],
      debris: [['D2_0', 'R', 7, 0]],
    });
    const debris = 1;
    const fall = computeFall(s, debris, N(6, 8));
    expect(fall.landing).toEqual({ ix: 6, iy: 0 });
    expect(fall.verdict).toEqual({ ok: false, reasons: ['debris', 'color'], missingSupport: [] });
    const sink = drag(s, debris, N(6, 8));
    expect(eventsOf(sink.events, 'pieceBounced')).toMatchObject([
      { pieceId: debris, from: site(6, 0), to: site(7, 0), viaDrop: false, reason: 'debris' },
    ]);
    expect(piecePlace(s, debris)).toEqual({ zone: 'site', x: 7, y: 0, seg: 0 });
    expect([wrongOccMask(s, 0, 0), wrongOccMask(s, 0, 1)]).toEqual([0, 0b11]);
    expect(hdr(s, H.movesLeft)).toBe(9);
    expect(buildFront(s)).toEqual([site(6, 0)]);
    const w = computeFall(s, 0, N(7, 8));
    expect(w.landing).toEqual({ ix: 7, iy: 2 });
    expect(w.verdict).toEqual({ ok: false, reasons: ['support'], missingSupport: [site(7, 0), site(7, 1)] });
    const wrong = drag(s, 0, N(7, 8));
    expect(eventsOf(wrong.events, 'pieceBounced')).toMatchObject([
      { pieceId: 0, from: site(7, 2), to: { zone: 'yard', x: 0, y: 0 }, reason: 'support' },
    ]);
    expect(stateInvariantErrors(s)).toEqual([]);
  });

  it('E-43 S2 debris in a `.` cell: a bridge over it is wrong (support); once the debris is in the yard the same bridge is correct, the `.` stays empty and the level is won', () => {
    // S4: "Bir `.` hücresindeki moloz o hücreyi K-34'te 'dolu' yapmaz"; S2: "`.` üstündeki hücre … iki sütuna köprü kuran
    // 2 geniş blok (duvar üstü)" ile dolar; plan (top → bottom) WW / W. / WW
    const s = initialState({
      moves: 10,
      plan: ['WW', 'W.', 'WW'],
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'W', 1, 0],
        ['B1_0', 'W', 2, 0],
        ['D2_90', 'W', 3, 0],
      ],
      debris: [['B1_0', 'R', 7, 1]],
    });
    toSite(s, 0, 6, 0);
    toSite(s, 1, 7, 0);
    toSite(s, 2, 6, 1);
    const debris = 4;
    expect(wrongOccMask(s, 0, 1)).toBe(0b10);
    expect(buildFront(s)).toEqual([site(6, 2)]);
    const bridge = computeFall(s, 3, N(6, 8));
    expect(bridge.landing).toEqual({ ix: 6, iy: 2 });
    expect(bridge.verdict).toEqual({ ok: false, reasons: ['support'], missingSupport: [site(7, 1)] });
    const wrong = drag(s, 3, N(6, 8));
    expect(eventsOf(wrong.events, 'pieceBounced')).toMatchObject([
      {
        pieceId: 3,
        from: site(6, 2),
        to: { zone: 'yard', x: 3, y: 0 },
        reason: 'support',
        missingSupport: [site(7, 1)],
      },
    ]);
    expect(isSegmentComplete(s, 0)).toBe(false);
    drag(s, debris, N(5, 2)); // (7,1) → (7,2) → (6,2) → (5,2): out to the yard
    expect(wrongOccMask(s, 0, 1)).toBe(0);
    expect(buildFront(s)).toEqual([site(6, 2), site(7, 2)]);
    const sink = new ArraySink();
    const res = applyMove(s, { kind: 'drag', pieceId: 3, to: N(6, 8) }, sink, {
      strict: true,
      noTruckHelp: true,
    });
    expect(eventsOf(sink.events, 'pieceFell')).toMatchObject([{ pieceId: 3, to: site(6, 2), rows: 6 }]);
    expect(eventsOf(sink.events, 'placementCorrect')).toMatchObject([
      { pieceId: 3, cells: [site(6, 2), site(7, 2)], overWall: true },
    ]);
    expect(res.won).toBe(true);
    expect(siteOcc(s, 0, 1, 1)).toBe(0);
    expect([filledMask(s, 0, 0), filledMask(s, 0, 1)]).toEqual([0b111, 0b101]);
    expect(hdr(s, H.movesLeft)).toBe(7);
    expect(stateInvariantErrors(s)).toEqual([]);
  });
});

describe('review round 3: landing edges (K-11, K-17, K-34, Y8)', () => {
  it('K-11 K-34 a 2-wide block resting in the crane rows on a full column is outside AND breaks support in the empty column (r = 8)', () => {
    // K-11: "Blok havada asılı kalamaz" → (6,8), d = 0; K-34: column 7, r = 8 → plan rows 0 … 7 must be filled
    const s = initialState({
      moves: 10,
      plan: WW(8),
      pieces: [
        ['I4_0', 'W', 0, 0],
        ['I4_0', 'W', 1, 0],
        ['D2_90', 'W', 2, 0],
      ],
    });
    toSite(s, 0, 6, 0);
    toSite(s, 1, 6, 4);
    const fall = computeFall(s, 2, N(6, 8));
    expect(fall.landing).toEqual({ ix: 6, iy: 8 });
    expect(fall.distance).toBe(0);
    expect(fall.path).toEqual([{ ix: 6, iy: 8 }]);
    const column7 = [0, 1, 2, 3, 4, 5, 6, 7].map((y) => site(7, y));
    expect(fall.verdict).toEqual({ ok: false, reasons: ['outside', 'support'], missingSupport: column7 });
    const sink = drag(s, 2, N(6, 8));
    expect(eventsOf(sink.events, 'pieceBounced')).toMatchObject([
      {
        pieceId: 2,
        from: site(6, 8),
        to: { zone: 'yard', x: 2, y: 0 },
        viaDrop: false,
        reason: 'outside',
        missingSupport: column7,
      },
    ]);
    expect(piecePlace(s, 2)).toEqual({ zone: 'yard', x: 2, y: 0, seg: -1 });
    expect(buildFront(s)).toEqual([site(7, 0)]);
    expect(stateInvariantErrors(s)).toEqual([]);
  });

  it('K-17 Y8 a stuck mortar re-dropped so that it lands on exactly its own cells is still wrong and re-sticks there; masks and front are unchanged', () => {
    // K-17: "Plan içinde başka bir hatalı konuma inerse orada yeniden yapışır (Y8)" — the same cells are inside the plan too
    const s = initialState({
      plan: WW(2),
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'R', 1, 0, ['mortar']],
      ],
    });
    toSite(s, 0, 6, 0);
    toSite(s, 1, 6, 1, { locked: false, stuck: true });
    const masks = () => [
      filledMask(s, 0, 0),
      filledMask(s, 0, 1),
      wrongOccMask(s, 0, 0),
      wrongOccMask(s, 0, 1),
    ];
    const before = masks();
    expect(before).toEqual([0b1, 0, 0b10, 0]);
    expect(buildFront(s)).toEqual([site(7, 0)]);
    const start = piecePlace(s, 1);
    const fall = computeFall(s, 1, N(6, 8));
    expect(fall.landing).toEqual({ ix: 6, iy: 1 });
    expect(fall.verdict).toEqual({ ok: false, reasons: ['color'], missingSupport: [] });
    const out = settlePlacement(s, 1, fall.landing, fall.verdict, { start, rules: MORTAR });
    expect(out).toEqual({
      kind: 'stuck',
      at: { zone: 'site', x: 6, y: 1, seg: 0 },
      reason: 'color',
      missingSupport: [],
    });
    expect(hasFlag(s, 1, 'stuck')).toBe(true);
    expect(hasFlag(s, 1, 'locked')).toBe(false);
    expect(siteOcc(s, 0, 0, 1)).toBe(2);
    expect(masks()).toEqual(before);
    expect(buildFront(s)).toEqual([site(7, 0)]);
    expect(stateInvariantErrors(s)).toEqual([]);
  });

  it('K-17 Y8 a stuck W mortar whose missing base was filled by rail falls back onto its own cells and now locks (K-14): wrongOcc → filled', () => {
    // OBSTACLES Y8: "Doğru yerleşirse normal kilitlenir"; K-34: the block's own old cells are not a wrong object below it
    const s = initialState({
      plan: WW(3),
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['D2_0', 'W', 1, 0, ['mortar']],
      ],
    });
    toSite(s, 1, 6, 1, { locked: false, stuck: true }); // stuck for support: (6,0) was empty
    expect(isCorrectPlacement(s, 1, cellsOf('D2_0', 6, 1))).toEqual({
      ok: false,
      reasons: ['support'],
      missingSupport: [site(6, 0)],
    });
    toSite(s, 0, 6, 0); // (6,0) filled later through a row-0 gap (K-34 example 2 path)
    expect([filledMask(s, 0, 0), wrongOccMask(s, 0, 0)]).toEqual([0b1, 0b110]);
    expect(buildFront(s)).toEqual([site(7, 0)]);
    const start = piecePlace(s, 1);
    const fall = computeFall(s, 1, N(6, 8));
    expect(fall.landing).toEqual({ ix: 6, iy: 1 });
    expect(fall.verdict).toEqual({ ok: true, reasons: [], missingSupport: [] });
    const out = settlePlacement(s, 1, fall.landing, fall.verdict, { start, rules: MORTAR });
    expect(out).toMatchObject({ kind: 'correct', at: { zone: 'site', x: 6, y: 1, seg: 0 } });
    expect(hasFlag(s, 1, 'locked')).toBe(true);
    expect(hasFlag(s, 1, 'stuck')).toBe(false);
    expect([filledMask(s, 0, 0), wrongOccMask(s, 0, 0)]).toEqual([0b111, 0]);
    expect(buildFront(s)).toEqual([site(7, 0)]);
    expect(stateInvariantErrors(s)).toEqual([]);
  });

  it('K-14 K-39 Undo is the only way back for a locked block: afterwards it is at its yard start, pickable, and the masks and front are as before', () => {
    // K-14: "Doğru yerleşen blok kilitlenir; tutulamaz … Tek istisna Geri Al güçlendiricisidir (K-39)"
    const session = GameSession.start(
      compiledLevel({
        moves: 10,
        plan: WW(2),
        pieces: [
          ['D2_0', 'W', 3, 0],
          ['B1_0', 'W', 0, 0],
        ],
      }),
    );
    const s = session.state;
    const front = buildFront(s);
    const left = session.movesLeft;
    expect(front).toEqual([site(6, 0), site(7, 0)]);
    expect(session.commit({ kind: 'drag', pieceId: 0, to: N(6, 8) }).status).toBe('applied');
    expect(piecePlace(s, 0)).toEqual({ zone: 'site', x: 6, y: 0, seg: 0 });
    expect(hasFlag(s, 0, 'locked')).toBe(true);
    expect(tryBeginDrag(s, 0)).toEqual({ ok: false, reason: 'locked' });
    expect(filledMask(s, 0, 0)).toBe(0b11);
    expect(buildFront(s)).toEqual([site(7, 0)]);
    expect(session.undo()).toBe(true);
    expect(piecePlace(s, 0)).toEqual({ zone: 'yard', x: 3, y: 0, seg: -1 });
    expect(hasFlag(s, 0, 'locked')).toBe(false);
    expect(tryBeginDrag(s, 0).ok).toBe(true);
    expect([filledMask(s, 0, 0), filledMask(s, 0, 1)]).toEqual([0, 0]);
    expect(buildFront(s)).toEqual(front);
    expect(session.movesLeft).toBe(left);
    expect(stateInvariantErrors(s)).toEqual([]);
  });
});

/** Random plan + reachable board (round 2 recipe): per column a correctly built prefix, wrong objects above it. */
interface RandomBoard {
  readonly rows: string[];
  readonly plan: string[][];
  readonly blocks: { x: number; y: number; kind: 'locked' | 'stuck'; color: ColorCode }[];
  readonly debris: [ShapeId, ColorCode, number, number][];
  readonly trowels: { sx: number; sy: number }[];
}

function randomBoard(
  rng: ReturnType<typeof mulberry32>,
  keepFree: (x: number, y: number) => boolean = () => false,
  maxBuilt: (sx: number, h: number) => number = (_sx, h) => h,
): RandomBoard {
  const colors: ColorCode[] = ['W', 'Y'];
  const h = 1 + rng.nextInt(8);
  const plan: string[][] = [[], []];
  for (let sx = 0; sx < 2; sx++)
    for (let sy = 0; sy < h; sy++)
      plan[sx]![sy] = rng.nextInt(5) === 0 ? '.' : (colors[rng.nextInt(2)] ?? 'W');
  if (!plan.some((col) => col.some((ch) => ch !== '.'))) plan[0]![0] = 'W';
  const rows: string[] = [];
  for (let sy = h - 1; sy >= 0; sy--) rows.push(`${plan[0]![sy]}${plan[1]![sy]}`);
  const blocks: RandomBoard['blocks'] = [];
  const debris: RandomBoard['debris'] = [];
  const trowels: RandomBoard['trowels'] = [];
  for (let sx = 0; sx < 2; sx++) {
    const built = Math.min(rng.nextInt(h + 1), maxBuilt(sx, h));
    for (let sy = 0; sy < 8; sy++) {
      const ch = sy < h ? (plan[sx]![sy] ?? null) : null;
      if (keepFree(6 + sx, sy)) continue;
      if (sy < built) {
        if (ch === '.') continue;
        if (rng.nextInt(4) === 0) trowels.push({ sx, sy });
        else blocks.push({ x: 6 + sx, y: sy, kind: 'locked', color: ch as ColorCode });
        continue;
      }
      const roll = rng.nextInt(12);
      if (ch !== null && roll === 0) blocks.push({ x: 6 + sx, y: sy, kind: 'stuck', color: 'R' });
      else if (roll === 1 && debris.length < 2) debris.push(['B1_0', 'R', 6 + sx, sy]);
    }
  }
  return { rows, plan, blocks, debris, trowels };
}

/** Builds the board: piece 0 = `mover`, then one B1 per site block (yard slots x 0–3, rows 0–3, vacated by `toSite`). */
function buildBoard(b: RandomBoard, mover: PieceSpec, extra: Partial<LevelSpec> = {}): GameState {
  const pieces: PieceSpec[] = [mover];
  b.blocks.forEach((blk, i) => pieces.push(['B1_0', blk.color, i % 4, Math.floor(i / 4)]));
  const s = initialState({ moves: 20, ...extra, plan: b.rows, pieces, debris: b.debris });
  b.blocks.forEach((blk, i) =>
    toSite(s, 1 + i, blk.x, blk.y, { locked: blk.kind === 'locked', stuck: blk.kind === 'stuck' }),
  );
  for (const t of b.trowels) setSiteOcc(s, 0, t.sx, t.sy, SITE_TROWEL);
  refreshSiteMasks(s, 0);
  return s;
}

describe('review round 3: K-18 shadow properties', () => {
  it('K-18 the shadow is a pure, repeatable preview: computeFall, shadowInfo, isCorrectPlacement, buildFront and returnTarget never change the state', () => {
    // K-18: the shadow shows where the block WOULD stop; K-08: the board is frozen while dragging (TECH §5.1 "Pure")
    const shapes: ShapeId[] = ['B1_0', 'D2_0', 'D2_90', 'O4_0', 'C3_0', 'C3_180', 'I3_0', 'L4_0', 'T4_0'];
    const rng = mulberry32(18_3003);
    let calls = 0;
    for (let round = 0; round < 120; round++) {
      const b = randomBoard(rng);
      const shape = shapes[rng.nextInt(shapes.length)] ?? 'B1_0';
      const s = buildBoard(b, [shape, 'W', 4, 4]);
      expect(stateInvariantErrors(s)).toEqual([]);
      const before = s.buf.slice();
      // movers: the yard block and every stuck / debris block on the site
      const movers: PieceId[] = [0];
      for (let id = 1; id < s.lvl.layout.counts.pieces; id++)
        if (hasFlag(s, id, 'stuck') || hasFlag(s, id, 'debris')) movers.push(id);
      for (const id of movers) {
        const def = shapeById(id === 0 ? shape : 'B1_0'); // site blocks and debris of the board are B1
        for (let ix = 6; ix <= 8 - def.w; ix++) {
          for (let iy = 0; iy <= 10 - def.h; iy++) {
            for (const node of [N(ix, iy), R(0, ix, iy)]) {
              const a = computeFall(s, id, node);
              const again = computeFall(s, id, node);
              expect(again).toEqual(a);
              shadowInfo(a, 'easy');
              shadowInfo(a, 'hard');
              isCorrectPlacement(s, id, a.cells);
              calls++;
            }
          }
        }
        returnTarget(s, id);
        returnTarget(s, id, { skipStart: true });
      }
      buildFront(s);
      isSegmentComplete(s, 0);
      expect(s.buf).toEqual(before);
    }
    expect(calls).toBeGreaterThan(5000);
  });
});

describe('review round 3: K-12 rail placements through applyMove', () => {
  it('K-18 K-12 on random boards the rail shadow (the block itself + verdict) predicts applyMove: lock in place over the gap (overWall false) or a K-17 bounce that leaves the site masks untouched', () => {
    // K-18: "Ray kipinde gölge, bloğun kendi konumudur"; K-12: "Rayda … bırakılan blok … düşmez; altı boş olabilir";
    // K-34: "Kural ray yerleşimi … için de geçerlidir"; K-46: rail placements are "geçitten"
    const railShapes: ShapeId[] = ['B1_0', 'D2_90', 'D2_0', 'O4_0'];
    const rng = mulberry32(12_1803);
    let correct = 0;
    let wrong = 0;
    let skipped = 0;
    const seen = new Set<string>();
    for (let round = 0; round < 400; round++) {
      const shape = railShapes[rng.nextInt(railShapes.length)] ?? 'B1_0';
      const def = shapeById(shape);
      const g = rng.nextInt(9 - def.h); // gap rows g … g + h − 1 ≤ 7
      const ix = 6 + rng.nextInt(3 - def.w); // w = 1: x 6 or 7; w = 2: x 6
      // rail path cells: columns 6 … ix + w − 1 in the gap rows stay free; the built prefix there stays below g
      const onPath = (x: number, y: number) => x <= ix + def.w - 1 && y >= g && y < g + def.h;
      const b = randomBoard(rng, onPath, (sx, h) => (6 + sx <= ix + def.w - 1 ? Math.min(g, h) : h));
      const sx0 = ix - 6;
      const planColor = b.plan[sx0]?.[g];
      const color: ColorCode =
        rng.nextInt(3) > 0 && planColor !== undefined && planColor !== '.' ? (planColor as ColorCode) : 'W';
      const startX = 6 - def.w;
      const s = buildBoard(b, [shape, color, startX, g], {
        wall: { height: 8, gaps: [{ type: 'static', y: g, size: def.h }] },
      });
      expect(stateInvariantErrors(s)).toEqual([]);
      const node = R(0, ix, g);
      const fall = computeFall(s, 0, node);
      expect(fall).toMatchObject({
        mode: 'rail',
        landing: { ix, iy: g },
        distance: 0,
        steered: null,
        drift: 0,
      });
      expect(fall.cells).toEqual(blockCells(def, ix, g));
      const masks = () => [0, 1].flatMap((c) => [filledMask(s, 0, c), wrongOccMask(s, 0, c)]);
      const masksBefore = masks();
      const frontBefore = buildFront(s);
      const siteBefore = [6, 7].flatMap((x) =>
        [0, 1, 2, 3, 4, 5, 6, 7].map((y) => ({ x, y, v: siteOcc(s, 0, x - 6, y) })),
      );
      const counters = [hdr(s, H.overWallCount), hdr(s, H.railCount)];
      const sink = new ArraySink();
      const res = applyMove(s, { kind: 'drag', pieceId: 0, to: node }, sink, { noTruckHelp: true });
      if (res.status !== 'applied') {
        skipped++;
        continue;
      }
      const ctx = { shape, g, ix, rows: b.rows, verdict: fall.verdict };
      expect({ ctx, moved: eventsOf(sink.events, 'pieceMoved') }).toMatchObject({
        ctx,
        moved: [
          { pieceId: 0, from: { zone: 'yard', x: startX, y: g }, to: site(ix, g), entry: 'gap', gap: 0 },
        ],
      });
      expect(eventsOf(sink.events, 'pieceFell').filter((e) => e.cause === 'release')).toEqual([]);
      expect(hdr(s, H.movesLeft)).toBe(19);
      if (fall.verdict.ok) {
        expect({ ctx, ev: eventsOf(sink.events, 'placementCorrect') }).toMatchObject({
          ctx,
          ev: [{ pieceId: 0, cells: fall.cells.map((c) => site(c.x, c.y)), overWall: false }],
        });
        expect(piecePlace(s, 0)).toEqual({ zone: 'site', x: ix, y: g, seg: 0 });
        expect(hasFlag(s, 0, 'locked')).toBe(true);
        expect([hdr(s, H.overWallCount), hdr(s, H.railCount)]).toEqual([counters[0], (counters[1] ?? 0) + 1]);
        // the block hangs on the rail: every other site cell (also an empty one under it) is as before
        const others = siteBefore.filter((c) => !fall.cells.some((o) => o.x === c.x && o.y === c.y));
        expect(others.map((c) => siteOcc(s, 0, c.x - 6, c.y))).toEqual(others.map((c) => c.v));
        correct++;
      } else {
        expect({ ctx, ev: eventsOf(sink.events, 'placementWrong') }).toMatchObject({
          ctx,
          ev: [{ pieceId: 0, reasons: fall.verdict.reasons, missingSupport: fall.verdict.missingSupport }],
        });
        expect({ ctx, ev: eventsOf(sink.events, 'pieceBounced') }).toMatchObject({
          ctx,
          ev: [
            {
              pieceId: 0,
              from: site(ix, g),
              to: { zone: 'yard', x: startX, y: g },
              viaDrop: false,
              reason: fall.verdict.reasons[0],
              missingSupport: fall.verdict.missingSupport,
            },
          ],
        });
        expect(piecePlace(s, 0)).toEqual({ zone: 'yard', x: startX, y: g, seg: -1 });
        expect(masks()).toEqual(masksBefore);
        expect(buildFront(s)).toEqual(frontBefore);
        expect([hdr(s, H.overWallCount), hdr(s, H.railCount)]).toEqual(counters);
        for (const r of fall.verdict.reasons) seen.add(r);
        wrong++;
      }
      expect(stateInvariantErrors(s)).toEqual([]);
    }
    expect(correct).toBeGreaterThan(30);
    expect(wrong).toBeGreaterThan(150);
    expect(skipped).toBeLessThan(40);
    expect([...seen].sort()).toEqual(['color', 'outside', 'support', 'window']);
  });
});

describe('review round 4: K-34 hook 2 reasonCells — the cells behind each verdict reason (UX 5.4; fixed: Faz 2 tur 1 #1)', () => {
  const key = (cells: readonly { x: number; y: number }[]): string[] => cells.map((c) => `${c.x},${c.y}`);

  it('K-16 (1) / K-34 hook 2: color → only the cells whose plan colour differs; window → only `.` cells; outside → only cells off the plan; support → none (its cells are missingSupport); debris → every cell', () => {
    // plan (bottom → top): y0 WY, y1 W., y2 off the plan
    const s = initialState({
      plan: ['W.', 'WY'],
      pieces: [
        ['B1_0', 'Y', 0, 0],
        ['C3_0', 'W', 2, 0],
      ],
      debris: [['B1_0', 'W', 7, 1]],
    });
    const cells = cellsOf('C3_0', 6, 0); // (6,0) W ✓, (7,0) Y ✗ colour, (6,1) W ✓
    expect(isCorrectPlacement(s, 1, cells).reasons).toEqual(['color']);
    expect(key(reasonCells(s, 1, cells, 'color'))).toEqual(['7,0']);
    const high = cellsOf('C3_0', 6, 1); // (6,1) W ✓, (7,1) `.`, (6,2) off the plan
    expect(isCorrectPlacement(s, 1, high).reasons.slice(0, 2)).toEqual(['outside', 'window']);
    expect(key(reasonCells(s, 1, high, 'outside'))).toEqual(['6,2']);
    expect(key(reasonCells(s, 1, high, 'window'))).toEqual(['7,1']);
    expect(reasonCells(s, 1, high, 'color')).toEqual([]);
    expect(reasonCells(s, 1, high, 'support')).toEqual([]);
    const debris = 2;
    const on = cellsOf('B1_0', 6, 0); // a W debris block over a W cell is still wrong (K-16 (2))
    expect(isCorrectPlacement(s, debris, on).reasons[0]).toBe('debris');
    expect(key(reasonCells(s, debris, on, 'debris'))).toEqual(['6,0']);
  });

  it('K-32 / K-16 (1) the colour reason reads the RESOLVED `?` colour (the shadow is neutral there, K-18, but the cell is named)', () => {
    const s = initialState({
      plan: ['??', 'WY'],
      hidden: [{ kind: 'repeat', period: 1 }],
      pieces: [
        ['D2_90', 'Y', 0, 0],
        ['D2_90', 'Y', 2, 0],
      ],
    });
    toSite(s, 0, 6, 0, { locked: true });
    // a D2_90 Y on row 1 (`??` = W Y by repeat): (6,1) resolves to W → wrong colour, (7,1) resolves to Y → fine
    const cells = cellsOf('D2_90', 6, 1);
    expect(isCorrectPlacement(s, 1, cells).reasons[0]).toBe('color');
    expect(key(reasonCells(s, 1, cells, 'color'))).toEqual(['6,1']);
  });

  it('K-34 hook 2 property (seeded random boards): reasonCells(primary) is non-empty exactly for the cell reasons, is a subset of the landing in board order, and each named cell breaks that reason on its own', () => {
    const r = mulberry32(20261006);
    const rng = (): number => r.next();
    const COLORS: ColorCode[] = ['W', 'Y', 'G'];
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)] as T;
    let named = 0;
    for (let trial = 0; trial < 300; trial++) {
      const h = 1 + Math.floor(rng() * 4);
      const plan = Array.from({ length: h }, () =>
        [0, 1].map(() => (rng() < 0.15 ? '.' : pick(COLORS))).join(''),
      );
      if (plan.every((r) => r === '..')) continue;
      const shape = pick(['B1_0', 'D2_0', 'D2_90', 'C3_0', 'C3_90', 'C3_180', 'C3_270', 'O4_0'] as ShapeId[]);
      const color = pick(COLORS);
      const s = initialState({ plan, pieces: [[shape, color, 0, 0]] });
      const sh = shapeById(shape);
      for (let ix = 6; ix + sh.w <= 8; ix++) {
        for (let iy = 0; iy + sh.h <= 8; iy++) {
          const cells = blockCells(sh, ix, iy);
          const v = isCorrectPlacement(s, 0, cells);
          const primary = v.reasons[0];
          for (const reason of ['outside', 'window', 'color', 'support'] as VerdictReason[]) {
            const got = reasonCells(s, 0, cells, reason);
            const planAt = (x: number, y: number): string | null =>
              y < h ? ((plan[h - 1 - y] ?? '')[x - 6] ?? null) : null;
            const expected = cells.filter((c) => {
              const ch = planAt(c.x, c.y);
              if (reason === 'outside') return ch === null;
              if (reason === 'window') return ch === '.';
              if (reason === 'color') return ch !== null && ch !== '.' && ch !== color;
              return false;
            });
            expect(key(got)).toEqual(key(expected));
            if (reason === primary && reason !== 'support') {
              expect(got.length).toBeGreaterThan(0);
              named += 1;
            }
          }
        }
      }
    }
    expect(named).toBeGreaterThan(200);
  });
});
