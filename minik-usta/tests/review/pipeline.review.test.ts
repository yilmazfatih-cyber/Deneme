/**
 * Independent rule review (rounds 1–3) of the move pipeline: src/core/moves.ts, site.ts, delivery.ts, goals.ts, combo.ts,
 * session.ts and core/obstacles/** against docs/GDD.md K-22, K-25…K-29, K-33, K-35 (steps 0–12), K-39, K-41 (build),
 * K-43, K-46, docs/OBSTACLES.md W1 / S1 / S2 and the related edge cases (E-01, E-03, E-04, E-06, E-09, E-21, E-30,
 * E-34, E-37, E-38, E-42). Every expectation is derived from the GDD / OBSTACLES / TECH wording or their worked
 * examples, not from the implementation; only public module APIs are used. Coordinates are global board cells
 * (x 6–7 = site); plan rows in level data are written top → bottom. Round 2 (bottom of the file) adds delivery
 * geometry, queue counter events, Undo / resume corner cases, RNG determinism of step-12 help and S2 / W1 × S1 cases.
 * Round 3 adds the GDD worked examples of K-25 / K-26 / E-34 / E-03, E-09 on a non-final segment, the K-29 offer
 * exhaustion and decline paths, K-39 depth / trowel / GDD example cases, a prefix-by-prefix resume of the level 5 hand
 * solution, W1 × K-34 rail support, the S2 OBSTACLES example, K-35 steps 5 / 7 / 12 edges, N38 and the K-43 levelHash.
 */
import { describe, expect, it } from 'vitest';
import { ArraySink, applyMove, eventLogHash, isLevelWon, measureYao } from '../../src/core/moves.ts';
import type { ApplyOptions, MoveHooks, MoveResult } from '../../src/core/moves.ts';
import { GameSession, ReplayError, levelHash } from '../../src/core/session.ts';
import type { SessionOptions, StreakBonus } from '../../src/core/session.ts';
import { panoramaView } from '../../src/core/panorama.ts';
import { FREE, railMode, tryBeginDrag } from '../../src/core/movement.ts';
import { buildFront, movePiece, yardPlace } from '../../src/core/placement.ts';
import { goalViews } from '../../src/core/goals.ts';
import { activeRuleIds, infoKeysFor, levelHooks } from '../../src/core/obstacles/registry.ts';
import { checkLevel } from '../../src/core/level/logic.ts';
import { loadLevel } from '../../src/core/level/compile.ts';
import type { CompiledLevel } from '../../src/core/level/compile.ts';
import {
  H,
  SITE_TROWEL,
  STATE_FLAG,
  createInitialState,
  filledMask,
  hdr,
  pieceSeg,
  pieceX,
  pieceY,
  pieceZone,
  queueIds,
  setHdr,
  siteOcc,
  yardOcc,
} from '../../src/core/state.ts';
import type { GameState } from '../../src/core/state.ts';
import { stateInvariantErrors } from '../../src/core/grid.ts';
import { Zone } from '../../src/core/types.ts';
import type {
  DragNode,
  GameEvent,
  GameEventType,
  Move,
  PieceId,
  PreBooster,
  SessionAction,
} from '../../src/core/types.ts';
import { compiledLevel, level, levelJson } from '../fixtures/builders.ts';
import type { LevelSpec, PieceSpec } from '../fixtures/builders.ts';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// --- helpers --------------------------------------------------------------------------------------------------------

const N = (ix: number, iy: number): DragNode => ({ ix, iy, mode: FREE });
const RL = (gap: number, ix: number, iy: number): DragNode => ({ ix, iy, mode: railMode(gap) });
const drag = (pieceId: PieceId, to: DragNode): Move => ({ kind: 'drag', pieceId, to });
const trowel = (x: 0 | 1, y: number, seg = 0): Move => ({ kind: 'trowel', seg, x, y });

interface Played {
  readonly res: MoveResult;
  readonly ev: GameEvent[];
}

function play(s: GameState, move: Move, opts: ApplyOptions = {}): Played {
  const sink = new ArraySink();
  const res = applyMove(s, move, sink, { strict: true, ...opts });
  return { res, ev: sink.events };
}

function only<T extends GameEventType>(ev: readonly GameEvent[], t: T): Extract<GameEvent, { t: T }>[] {
  return ev.filter((e) => e.t === t) as Extract<GameEvent, { t: T }>[];
}

function first<T extends GameEventType>(ev: readonly GameEvent[], t: T): Extract<GameEvent, { t: T }> {
  const e = only(ev, t)[0];
  if (!e) throw new Error(`no ${t} event in [${ev.map((x) => x.t).join(', ')}]`);
  return e;
}

const at = (s: GameState, id: PieceId): [number, number, number] => [
  pieceX(s, id),
  pieceY(s, id),
  pieceZone(s, id),
];

/** A full yard column x (rows 0–7) of Y filler blocks. */
const fullColumn = (x: number): PieceSpec[] => [
  ['I4_0', 'Y', x, 0],
  ['I4_0', 'Y', x, 4],
];
/** Yard column x filled on rows 0–6 only (row 7 free). */
const column7 = (x: number): PieceSpec[] => [
  ['I4_0', 'Y', x, 0],
  ['I3_0', 'Y', x, 4],
];

function expectConsistent(s: GameState): void {
  expect(stateInvariantErrors(s)).toEqual([]);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
function levelFile(id: number): CompiledLevel {
  const json: unknown = JSON.parse(
    readFileSync(join(ROOT, 'levels', `level_${String(id).padStart(3, '0')}.json`), 'utf8'),
  );
  const loaded = loadLevel(json);
  if (!loaded.ok) throw new Error(`level ${id} does not load`);
  return loaded.level;
}

// --- fixtures -------------------------------------------------------------------------------------------------------

/**
 * K-25 stage 3: the mover B1 W (2,7) leaves (2,7) free; (4,7) is free too; columns 0, 1, 3, 5 are full. Segment 0 is
 * `W.` (one B1 completes it), the truck batch of segment 1 holds two B1 with x = 3. Ids: 0 mover, 1–12 fillers,
 * 13 = B1 R, 14 = B1 G.
 */
const TIE: LevelSpec = {
  plan: [['W.'], ['WW']],
  pieces: [
    ['B1_0', 'W', 2, 7],
    ...fullColumn(0),
    ...fullColumn(1),
    ...column7(2),
    ...fullColumn(3),
    ...column7(4),
    ...fullColumn(5),
  ],
  batches: [
    {
      forSegment: 1,
      pieces: [
        ['B1_0', 'R', 3, 8],
        ['B1_0', 'G', 3, 8],
      ],
    },
  ],
};

/** K-25 stage 2: room at (0,7) (after the mover leaves) and at (4,7); the truck block has x = 3 (column full). */
function dropColumnsLevel(dropColumns?: readonly number[]): LevelSpec {
  return {
    plan: [['W.'], ['WW']],
    pieces: [
      ['B1_0', 'W', 0, 7],
      ...column7(0),
      ...fullColumn(1),
      ...fullColumn(2),
      ...fullColumn(3),
      ...column7(4),
      ...fullColumn(5),
    ],
    batches: [{ forSegment: 1, pieces: [['B1_0', 'R', 3, 8]], ...(dropColumns ? { dropColumns } : {}) }],
  };
}

/**
 * K-25 "ilk desteğe oturur": column 2 holds only a B1 hanging at (2,5) (yard gravity off), (2,0)–(2,4) are empty.
 * Mover B1 W (5,7). Ids: 0 mover, 1–2 column 5, 3 the hanging B1, 4–11 columns 0, 1, 3, 4, 12 = B1 R, 13 = D2_0 G.
 */
const OVERHANG: LevelSpec = {
  plan: [['W.'], ['WW']],
  pieces: [
    ['B1_0', 'W', 5, 7],
    ...column7(5),
    ['B1_0', 'Y', 2, 5],
    ...fullColumn(0),
    ...fullColumn(1),
    ...fullColumn(3),
    ...fullColumn(4),
  ],
  batches: [
    {
      forSegment: 1,
      pieces: [
        ['B1_0', 'R', 2, 8],
        ['D2_0', 'G', 2, 8],
      ],
    },
  ],
};

/**
 * K-26 / E-04: three `W.` segments. Movers A = B1 W (0,7) and B = B1 W (5,7); every other yard cell is full.
 * Batch 1: P1, P2 (B1 R, x = 0) → ids 14, 15; batch 2: Q (B1 G, x = 5) → id 16.
 */
const FIFO: LevelSpec = {
  plan: [['W.'], ['W.'], ['W.']],
  pieces: [
    ['B1_0', 'W', 0, 7],
    ['B1_0', 'W', 5, 7],
    ...column7(0),
    ...column7(5),
    ...fullColumn(1),
    ...fullColumn(2),
    ...fullColumn(3),
    ...fullColumn(4),
  ],
  batches: [
    {
      forSegment: 1,
      pieces: [
        ['B1_0', 'R', 0, 8],
        ['B1_0', 'R', 0, 8],
      ],
    },
    { forSegment: 2, pieces: [['B1_0', 'G', 5, 8]] },
  ],
};

/** K-22: segment 0 is a 2 × 2 W wall, segment 1 one R row. O4 W (0,6) = 0, D2_90 R (2,7) = 1. */
const TWO_ROOMS: LevelSpec = {
  wall: { height: 2 },
  plan: [['WW', 'WW'], ['RR']],
  pieces: [
    ['O4_0', 'W', 0, 6],
    ['D2_90', 'R', 2, 7],
  ],
};

/**
 * K-33 / K-39: five W rows; four W dominoes (0–3), a Y single (4, wrong everywhere), a W single (5) that shuttles in
 * the yard between (5,0) and (5,1).
 */
const STREAK: LevelSpec = {
  moves: 20,
  wall: { height: 2 },
  plan: ['WW', 'WW', 'WW', 'WW', 'WW'],
  pieces: [
    ['D2_0', 'W', 0, 0],
    ['D2_0', 'W', 1, 0],
    ['D2_0', 'W', 2, 0],
    ['D2_0', 'W', 3, 0],
    ['B1_0', 'Y', 4, 0],
    ['B1_0', 'W', 5, 0],
  ],
};

/**
 * K-46 example (4 over the wall + 1 rail = 0.80): wall height 5, static gap at row 3 (size 1). Plan rows (bottom → top):
 * y0–y2 W, y3 R, y4 W. Ids: 0–2 D2_90 W, 3 D2_90 R at (4,3) next to the gap (GDD K-12 example position), 4 B1 W,
 * 5 B1 Y (decoy).
 */
const YAO_LEVEL: LevelSpec = {
  wall: { height: 5, gaps: [{ y: 3, size: 1, type: 'static' }] },
  plan: ['WW', 'RR', 'WW', 'WW', 'WW'],
  pieces: [
    ['D2_90', 'W', 0, 0],
    ['D2_90', 'W', 0, 2],
    ['D2_90', 'W', 0, 4],
    ['D2_90', 'R', 4, 3],
    ['B1_0', 'W', 2, 0],
    ['B1_0', 'Y', 3, 0],
  ],
};

/** GDD K-12 example: gap y = 3, size 1; plan row 3 = RR above three `.` rows. 0 = D2_90 R (4,3), 1 = D2_0 R (3,3). */
function gapOverVoids(top = 'RR'): LevelSpec {
  return {
    wall: { height: 5, gaps: [{ y: 3, size: 1, type: 'static' }] },
    plan: [top, '..', '..', '..'],
    pieces: [
      ['D2_90', 'R', 4, 3],
      ['D2_0', 'R', 3, 3],
      ['D2_90', 'R', 0, 0],
    ],
  };
}

// =====================================================================================================================

describe('K-22 / S1 sliding site', () => {
  it('K-22 the completed segment keeps its locked blocks for the panorama and the next segment arrives empty', () => {
    const s = createInitialState(compiledLevel(TWO_ROOMS));
    const m1 = play(s, drag(0, N(6, 8)));
    expect(m1.res.status).toBe('applied');
    expect(first(m1.ev, 'segmentCompleted').seg).toBe(0);
    expect(first(m1.ev, 'siteShifted').toSeg).toBe(1);
    expect(hdr(s, H.activeSeg)).toBe(1);
    // the O4 stays in segment 0 (panorama), locked: plan rows 0–1 of both columns are correctly filled
    expect([pieceZone(s, 0), pieceSeg(s, 0)]).toEqual([Zone.site, 0]);
    expect([filledMask(s, 0, 0), filledMask(s, 0, 1)]).toEqual([0b11, 0b11]);
    expect([siteOcc(s, 0, 0, 0), siteOcc(s, 0, 1, 1)]).toEqual([1, 1]);
    // "sıradaki dilim boş olarak gelir"
    for (let sy = 0; sy < 8; sy++) for (let sx = 0; sx < 2; sx++) expect(siteOcc(s, 1, sx, sy)).toBe(0);
    expect(buildFront(s)).toEqual([
      { zone: 'site', x: 6, y: 0, seg: 1 },
      { zone: 'site', x: 7, y: 0, seg: 1 },
    ]);
    // a block of a completed segment is out of reach
    expect(tryBeginDrag(s, 0).ok).toBe(false);
    expectConsistent(s);
  });

  it('K-22 the next drop falls onto the empty silhouette of the new segment (d = 8), the last one wins without a shift', () => {
    const s = createInitialState(compiledLevel(TWO_ROOMS));
    play(s, drag(0, N(6, 8)));
    const m2 = play(s, drag(1, N(6, 8)));
    expect(first(m2.ev, 'pieceFell')).toMatchObject({
      from: { zone: 'site', x: 6, y: 8, seg: 1 },
      to: { zone: 'site', x: 6, y: 0, seg: 1 },
      rows: 8,
      cause: 'release',
    });
    expect(first(m2.ev, 'placementCorrect').pieceId).toBe(1);
    expect(first(m2.ev, 'segmentCompleted').seg).toBe(1);
    expect(only(m2.ev, 'siteShifted')).toEqual([]);
    expect(m2.res.won).toBe(true);
    expect(first(m2.ev, 'levelWon')).toMatchObject({ step: 11, movesLeft: 18 });
  });

  it('K-22 GDD example (level 5): the last block of Sol Oda lands on move 6 → Sağ Oda and batch 1 come in the same move; move 7 builds Sağ Oda', () => {
    const s = createInitialState(levelFile(5));
    // ids (LEVELS §2): 0 = c (D2_90 R 4,7), 1 = a (O4 W 0,6), 2 = b (D2_90 G 2,6); truck 13–16 = k1_0 … k1_3
    play(s, drag(2, N(6, 8))); // 1: b → G row
    play(s, drag(0, N(2, 6))); // 2: yard
    play(s, drag(0, N(4, 7))); // 3: yard
    play(s, drag(1, N(6, 8))); // 4: a → W rows
    play(s, drag(0, N(2, 6))); // 5: yard
    expect(hdr(s, H.activeSeg)).toBe(0);
    const sixth = play(s, drag(0, N(6, 8))); // 6: c → R row, Sol Oda complete
    expect(hdr(s, H.turn)).toBe(6);
    expect(first(sixth.ev, 'segmentCompleted').seg).toBe(0);
    expect(first(sixth.ev, 'siteShifted').toSeg).toBe(1);
    expect(first(sixth.ev, 'deliveryArrived').pieces).toEqual([13, 14, 15]);
    expect(queueIds(s)).toEqual([16]);
    const seventh = play(s, drag(15, N(6, 8))); // 7: k1_2 C3_0 W on Sağ Oda
    expect(first(seventh.ev, 'placementCorrect').cells.every((c) => c.seg === 1)).toBe(true);
    expect(first(seventh.ev, 'pieceFell').to).toMatchObject({ x: 6, y: 0, seg: 1 });
    expect([hdr(s, H.turn), hdr(s, H.movesLeft)]).toEqual([7, 4]);
    expectConsistent(s);
  });

  it('K-41 the build goal panel shows completed segments: 0/2 → 1/2 → 2/2 done', () => {
    const s = createInitialState(compiledLevel(TWO_ROOMS));
    const view = (): [number, number, boolean] => {
      const g = goalViews(s)[0];
      return [g?.value ?? -1, g?.target ?? -1, g?.done ?? false];
    };
    expect(view()).toEqual([0, 2, false]);
    play(s, drag(0, N(6, 8)));
    expect(view()).toEqual([1, 2, false]);
    play(s, drag(1, N(6, 8)));
    expect(view()).toEqual([2, 2, true]);
  });

  it('S1 applies only to segments mode with ≥ 2 segments: not to a one-segment level, not to a carousel', () => {
    expect(activeRuleIds(compiledLevel(TWO_ROOMS))).toContain('S1');
    expect(activeRuleIds(compiledLevel({ plan: ['WW'], pieces: [['D2_90', 'W', 0, 0]] }))).not.toContain(
      'S1',
    );
    const carousel = compiledLevel({
      mode: 'carousel',
      carouselEvery: 2,
      plan: [['WW'], ['WW']],
      pieces: [['D2_90', 'W', 0, 0]],
    });
    expect(activeRuleIds(carousel)).not.toContain('S1');
  });
});

describe('K-25 / K-26 truck delivery and FIFO queue', () => {
  it('K-25 stage 3: x full → nearest column, tie to the wall side (4 before 2); the 2nd block of the same step sees the 1st', () => {
    const s = createInitialState(compiledLevel(TIE));
    const m = play(s, drag(0, N(6, 8)));
    expect(first(m.ev, 'siteShifted').toSeg).toBe(1);
    expect(first(m.ev, 'deliveryArrived').pieces).toEqual([13, 14]);
    expect(at(s, 13)).toEqual([4, 7, Zone.yard]);
    expect(at(s, 14)).toEqual([2, 7, Zone.yard]);
    expect(queueIds(s)).toEqual([]);
    expect(only(m.ev, 'pieceFell').filter((e) => e.cause === 'delivery')).toMatchObject([
      { pieceId: 13, step: 9, to: { zone: 'yard', x: 4, y: 7 } },
      { pieceId: 14, step: 9, to: { zone: 'yard', x: 2, y: 7 } },
    ]);
    expectConsistent(s);
  });

  it('K-25 stage 2: dropColumns are tried before the nearest columns of stage 3 (column 0 beats the nearer column 4)', () => {
    const plain = createInitialState(compiledLevel(dropColumnsLevel()));
    play(plain, drag(0, N(6, 8)));
    expect(at(plain, 13)).toEqual([4, 7, Zone.yard]);
    const listed = createInitialState(compiledLevel(dropColumnsLevel([0])));
    play(listed, drag(0, N(6, 8)));
    expect(at(listed, 13)).toEqual([0, 7, Zone.yard]);
  });

  it('K-25 a truck block falls from y = 10 − h onto its FIRST support: it stops on a hanging block, never in the hollow under it', () => {
    const s = createInitialState(compiledLevel(OVERHANG));
    const m = play(s, drag(0, N(6, 8)));
    // column 2: B1 hanging at (2,5) with (2,0)–(2,4) empty → the B1 R lands on (2,6)
    expect(at(s, 12)).toEqual([2, 6, Zone.yard]);
    // the D2_0 G (1 × 2) would need two free rows on top of some column: (2,7) and (5,7) are single cells → queued
    expect(pieceZone(s, 13)).toBe(Zone.queue);
    expect(queueIds(s)).toEqual([13]);
    expect(first(m.ev, 'deliveryQueued')).toMatchObject({ step: 9, queued: 1 });
    expect(first(m.ev, 'deliveryArrived').pieces).toEqual([12]);
    expectConsistent(s);
  });

  it('K-25 the truck drop moves no other block and triggers no neighbour effect (onNeighborMoved never sees a delivered block)', () => {
    const s = createInitialState(compiledLevel(TIE));
    const seen: PieceId[] = [];
    const hooks: MoveHooks = {
      onNeighborMoved: (_ctx, _entity, moved) => {
        seen.push(moved);
        return 'none';
      },
    };
    const before = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((id) => at(s, id));
    play(s, drag(0, N(6, 8)), { hooks });
    expect(new Set(seen)).toEqual(new Set([0]));
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((id) => at(s, id))).toEqual(before);
  });

  it('K-26 E-04 a block left in the truck keeps its place: it is tried before the next batch and takes the only free cell', () => {
    const s = createInitialState(compiledLevel(FIFO));
    const m1 = play(s, drag(0, N(6, 8)));
    expect(first(m1.ev, 'deliveryArrived').pieces).toEqual([14]);
    expect(at(s, 14)).toEqual([0, 7, Zone.yard]);
    expect(queueIds(s)).toEqual([15]);
    expect(first(m1.ev, 'deliveryQueued').queued).toBe(1);
    // K-26: queued (and not yet delivered) truck blocks cannot be picked
    expect(tryBeginDrag(s, 15)).toEqual({ ok: false, reason: 'notOnBoard' });
    expect(tryBeginDrag(s, 16)).toEqual({ ok: false, reason: 'notOnBoard' });

    const m2 = play(s, drag(1, N(6, 8)));
    expect(first(m2.ev, 'siteShifted').toSeg).toBe(2);
    // P2 (old) is tried first and drops into (5,7), freed by this move; Q (new batch) finds no room and waits
    expect(first(m2.ev, 'deliveryArrived').pieces).toEqual([15]);
    expect(at(s, 15)).toEqual([5, 7, Zone.yard]);
    expect(queueIds(s)).toEqual([16]);
    expect(pieceZone(s, 16)).toBe(Zone.queue);
    expectConsistent(s);
  });
});

describe('K-27 batch content (validator L-10)', () => {
  const twoSegments = (batch1: readonly PieceSpec[], batch0: readonly PieceSpec[] = [['D2_90', 'R', 0, 0]]) =>
    level({
      plan: [['RR'], ['WW', 'WW', 'WW']],
      pieces: batch0,
      batches: [{ forSegment: 1, pieces: batch1 }],
    });
  const short = (l: ReturnType<typeof level>): string[] =>
    checkLevel(l, { only: ['L-10'] }).map((i) => `${i.code}@${i.path}`);

  it('K-27 GDD example: 6 W cells, batch O4 + D2_0 (6) + decoy C3 W (3) → valid', () => {
    expect(
      short(
        twoSegments([
          ['O4_0', 'W', 0, 8],
          ['D2_0', 'W', 2, 8],
          ['C3_0', 'W', 3, 8],
        ]),
      ),
    ).toEqual([]);
  });

  it('K-27 too few W cells, or W only in a heavy block (not counted), is material_short', () => {
    expect(short(twoSegments([['O4_0', 'W', 0, 8]]))).toEqual(['material_short@build.segments[1]']);
    expect(
      short(
        twoSegments([
          ['O4_0', 'W', 0, 8],
          ['I3_90', 'W', 2, 8],
        ]),
      ),
    ).toEqual(['material_short@build.segments[1]']);
  });

  it('K-27 a later batch never supplies an earlier segment ("o ana kadar teslim edilmiş")', () => {
    const l = twoSegments(
      [
        ['D2_90', 'R', 0, 8],
        ['O4_0', 'W', 0, 8],
        ['D2_0', 'W', 2, 8],
      ],
      [['B1_0', 'G', 0, 0]],
    );
    expect(short(l)).toEqual(['material_short@build.segments[0]']);
  });
});

describe('K-28 / K-29 / K-35 step order', () => {
  it('K-35 a segment-completing move emits its events at the GDD step numbers (1 · 2 · 3 · 4 · 8 · 9)', () => {
    const s = createInitialState(levelFile(5));
    const hand: Move[] = [drag(2, N(6, 8)), drag(1, N(6, 8)), drag(0, N(6, 8))];
    play(s, hand[0] as Move);
    play(s, hand[1] as Move);
    const m3 = play(s, hand[2] as Move);
    expect(m3.ev.map((e) => [e.t, e.step])).toEqual([
      ['pieceMoved', 1],
      ['pieceFell', 2],
      ['placementCorrect', 3],
      ['comboChanged', 3],
      ['movesChanged', 4],
      ['segmentCompleted', 8],
      ['goalProgress', 8],
      ['siteShifted', 8],
      ['deliveryArrived', 9],
      ['pieceFell', 9],
      ['pieceFell', 9],
      ['pieceFell', 9],
      ['deliveryQueued', 9],
    ]);
    expect(m3.ev.map((e) => e.seq)).toEqual(m3.ev.map((_, i) => i));
  });

  it('K-35 step 0: a cancelled release (straddling the gap, E-06) changes no byte and emits only moveCancelled', () => {
    const s = createInitialState(compiledLevel(gapOverVoids()));
    const before = s.buf.slice();
    const m = play(s, drag(0, RL(0, 5, 3)));
    expect(m.res).toEqual({ status: 'cancelled', reason: 'straddle', won: false, outOfMoves: false });
    expect(m.ev).toEqual([{ seq: 0, step: 0, t: 'moveCancelled', pieceId: 0, reason: 'straddle' }]);
    expect(s.buf).toEqual(before);
  });

  it('K-28 E-01 in a session: a win on the very last move opens no +5 window (win is checked before out of moves)', () => {
    const session = GameSession.start(
      compiledLevel({ moves: 1, plan: ['WW'], pieces: [['D2_90', 'W', 0, 0]] }),
    );
    const res = session.commit(drag(0, N(6, 8)));
    expect(res).toEqual({ status: 'applied', reason: null, won: true, outOfMoves: false });
    expect([session.outcome, session.movesLeft, session.nextOffer()]).toEqual(['won', 0, null]);
    expect(isLevelWon(session.state)).toBe(true);
  });

  it('K-29 the out-of-moves window offers n = 1 with the ad option; accepting gives exactly 5 moves and play goes on', () => {
    const session = GameSession.start(compiledLevel({ ...STREAK, moves: 2 }));
    session.commit(drag(5, N(5, 1)));
    const last = session.commit(drag(5, N(5, 0)));
    expect(last.outOfMoves).toBe(true);
    expect([session.outcome, session.nextOffer()]).toEqual(['outOfMoves', { n: 1, adAllowed: true }]);
    expect(session.commit(drag(0, N(6, 8))).reason).toBe('notPlaying');
    expect(session.acceptOffer('offerCoins').status).toBe('applied');
    expect([session.outcome, session.movesLeft, session.movesMade]).toEqual(['playing', 5, 2]);
    expect(session.commit(drag(0, N(6, 8))).status).toBe('applied');
    expect(session.movesLeft).toBe(4);
  });
});

describe('K-33 Usta Serisi and Golden Trowel', () => {
  it('K-33 a trowel use leaves the streak alone (c = 3 stays 3); the next correct drag earns the trowel back', () => {
    const session = GameSession.start(compiledLevel(STREAK), { preBoosters: ['trowelStart'] });
    const s = session.state;
    session.commit(drag(0, N(6, 8)));
    session.commit(drag(1, N(7, 8)));
    session.commit(drag(2, N(6, 8)));
    expect([hdr(s, H.combo), hdr(s, H.trowels)]).toEqual([3, 1]);
    // build front: (6,4) and (7,2); the trowel fills (7,2)
    expect(buildFront(s).map((c) => [c.x, c.y])).toEqual([
      [6, 4],
      [7, 2],
    ]);
    expect(session.commit(trowel(1, 2)).status).toBe('applied');
    expect([hdr(s, H.combo), hdr(s, H.trowels), session.movesMade]).toEqual([3, 0, 3]);
    // the trowel cell supports the next drop (silhouette) and counts as correctly filled for K-34
    const sink = new ArraySink();
    session.commit(drag(3, N(7, 8)), sink);
    expect(first(sink.events, 'pieceFell').to).toMatchObject({ x: 7, y: 3 });
    expect(first(sink.events, 'placementCorrect').pieceId).toBe(3);
    expect(first(sink.events, 'trowelEarned').trowels).toBe(1);
    expect([hdr(s, H.combo), hdr(s, H.trowels)]).toEqual([0, 1]);
    // K-46: the trowel fill is not a drag placement
    expect(session.yao()).toEqual({ overWall: 4, rail: 0, yao: 1 });
  });

  it('K-33 the trowel refuses a cell that breaks K-34, a filled cell and a `.` cell; a refusal spends nothing', () => {
    const s = createInitialState(
      compiledLevel({ plan: ['WW', 'W.', 'WW'], pieces: [['B1_0', 'W', 0, 0]], wall: { height: 2 } }),
    );
    setHdr(s, H.trowels, 2);
    const before = s.buf.slice();
    for (const target of [trowel(0, 1), trowel(1, 1), trowel(1, 2), trowel(0, 0, 1)]) {
      const m = play(s, target);
      expect(m.res.status).toBe('rejected');
      expect(m.ev.map((e) => e.t)).toEqual(['boosterRejected']);
      expect(s.buf).toEqual(before);
    }
    // GDD K-33 example column 7: y0 filled, y1 `.`, y2 empty → (7,2) is allowed once (7,0) is filled
    expect(play(s, trowel(1, 0)).res.status).toBe('applied');
    expect(play(s, trowel(1, 2)).res.status).toBe('applied');
    expect(hdr(s, H.trowels)).toBe(0);
    expect(play(s, trowel(0, 0)).res.reason).toBe('noTrowel');
  });

  it('K-33 E-09 a trowel that completes the last segment wins in mini-pipeline step 11; m and the counter stay', () => {
    const s = createInitialState(compiledLevel({ plan: ['WW'], pieces: [['B1_0', 'W', 0, 0]], moves: 7 }));
    play(s, drag(0, N(6, 8)));
    setHdr(s, H.trowels, 1);
    const m = play(s, trowel(1, 0));
    expect(m.res.won).toBe(true);
    expect(m.ev.map((e) => [e.t, e.step])).toEqual([
      ['boosterApplied', 1],
      ['segmentCompleted', 8],
      ['goalProgress', 8],
      ['levelWon', 11],
    ]);
    expect(first(m.ev, 'levelWon').movesLeft).toBe(6);
    expect([hdr(s, H.turn), hdr(s, H.movesLeft)]).toEqual([1, 6]);
    expect(measureYao(s)).toEqual({ overWall: 1, rail: 0, yao: 1 });
  });

  it('K-35 the trowel mini pipeline runs step 12 while the level goes on, never after a trowel win', () => {
    const calls: number[] = [];
    const hooks: MoveHooks = {
      deadlock: (ctx) => {
        calls.push(hdr(ctx.s, H.turn));
        ctx.emit({ t: 'deadlockDetected', reason: 'noMoves' });
      },
    };
    const s = createInitialState(compiledLevel({ plan: ['WW', 'WW'], pieces: [['B1_0', 'W', 0, 0]] }));
    setHdr(s, H.trowels, 4);
    const a = play(s, trowel(0, 0), { hooks });
    expect(a.ev.map((e) => [e.t, e.step])).toEqual([
      ['boosterApplied', 1],
      ['deadlockDetected', 12],
    ]);
    play(s, trowel(1, 0), { hooks });
    play(s, trowel(0, 1), { hooks });
    const win = play(s, trowel(1, 1), { hooks });
    expect(win.res.won).toBe(true);
    expect(calls).toEqual([0, 0, 0]);
  });
});

describe('K-39 Undo', () => {
  it('K-39 Undo of the 4th correct placement takes the earned Golden Trowel back and restores c = 3 and the YAO counters', () => {
    const session = GameSession.start(compiledLevel(STREAK));
    const s = session.state;
    session.commit(drag(0, N(6, 8)));
    session.commit(drag(1, N(7, 8)));
    session.commit(drag(2, N(6, 8)));
    const before = s.buf.slice();
    session.commit(drag(3, N(7, 8)));
    expect([hdr(s, H.combo), hdr(s, H.trowels), session.yao().overWall]).toEqual([0, 1, 4]);
    expect(session.undo()).toBe(true);
    expect(s.buf).toEqual(before);
    expect([hdr(s, H.combo), hdr(s, H.trowels), session.movesLeft, session.movesMade]).toEqual([3, 0, 17, 3]);
    expect(at(s, 3)).toEqual([3, 0, Zone.yard]);
    expect(session.yao()).toEqual({ overWall: 3, rail: 0, yao: 1 });
    expect(session.undoBlock()).toBe('noDragMove');
  });

  it('K-39 a cancelled drag or a refused trowel is not an action: Undo still takes back the last committed drag', () => {
    const session = GameSession.start(compiledLevel(STREAK), { preBoosters: ['trowelStart'] });
    const s = session.state;
    const before = s.buf.slice();
    session.commit(drag(0, N(6, 8)));
    const logLength = session.log.length;
    expect(session.commit(drag(1, N(1, 0))).status).toBe('cancelled'); // K-07 row 1: back on its start cells
    expect(session.commit(trowel(1, 1)).status).toBe('rejected'); // (7,0) below is empty (K-34)
    expect(session.log.length).toBe(logLength);
    expect(session.canUndo()).toBe(true);
    expect(session.undo()).toBe(true);
    expect(s.buf).toEqual(before);
  });

  it('K-39 Undo of a rail placement restores the rail counter (K-46) and the block in the yard', () => {
    const session = GameSession.start(compiledLevel(YAO_LEVEL));
    session.commit(drag(0, N(6, 8)));
    session.commit(drag(1, N(6, 8)));
    session.commit(drag(2, N(6, 8)));
    session.commit(drag(3, RL(0, 6, 3)));
    expect(session.yao()).toEqual({ overWall: 3, rail: 1, yao: 0.75 });
    session.undo();
    expect(session.yao()).toEqual({ overWall: 3, rail: 0, yao: 1 });
    expect(at(session.state, 3)).toEqual([4, 3, Zone.yard]);
  });
});

describe('K-43 exit and resume', () => {
  it('K-43 a trowel use does not raise m: an exit after it is still free (m = 0)', () => {
    const session = GameSession.start(compiledLevel(STREAK), { preBoosters: ['trowelStart'] });
    expect(session.commit(trowel(0, 0)).status).toBe('applied');
    expect(session.movesMade).toBe(0);
    expect(session.exit()).toMatchObject({ kind: 'free', movesMade: 0, streakBonusConsumed: false });
  });

  it('K-43 K-39 Undo of the only move takes m back to 0, so the confirmed exit is free again', () => {
    const session = GameSession.start(compiledLevel(STREAK), { preBoosters: ['thermos'] });
    session.commit(drag(0, N(6, 8)));
    expect(session.movesMade).toBe(1);
    session.undo();
    expect(session.movesMade).toBe(0);
    expect(session.exit()).toEqual({
      kind: 'free',
      movesMade: 0,
      refundPreBoosters: ['thermos'],
      streakBonusConsumed: false,
    });
  });

  it('K-43 E-38 a mixed log (pre-level boosters, wrong placement, Undo, trowel, +5 offer) replays bit for bit and plays on identically', () => {
    const lvl = compiledLevel({ ...STREAK, moves: 6 });
    const live = GameSession.start(lvl, { preBoosters: ['trowelStart'] });
    live.commit(drag(0, N(6, 8))); // correct, 5 left
    live.commit(drag(4, N(7, 8))); // Y on W: wrong, bounces, 4 left
    live.undo(); // 5 left
    live.commit(drag(1, N(7, 8))); // correct, 4 left
    live.commit(trowel(0, 2)); // (6,2)
    live.commit(drag(2, N(7, 8))); // correct on column 7, 3 left
    for (const y of [1, 0, 1]) live.commit(drag(5, N(5, y))); // yard shuttle → 0 left
    expect(live.outcome).toBe('outOfMoves');
    live.acceptOffer('offerAd');
    live.commit(drag(3, N(6, 8)));
    expect(live.outcome).toBe('playing');

    const resumed = GameSession.replay(lvl, live.log);
    expect(resumed.state.buf).toEqual(live.state.buf);
    expect(resumed.log).toEqual(live.log);
    expect([
      resumed.offersUsed,
      resumed.adOfferUsed,
      resumed.canUndo(),
      resumed.movesMade,
      resumed.yao(),
    ]).toEqual([live.offersUsed, live.adOfferUsed, live.canUndo(), live.movesMade, live.yao()]);
    expect(resumed.offersUsed).toBe(1);
    // the next move produces the same event log on both
    const a = new ArraySink();
    const b = new ArraySink();
    live.commit(drag(5, N(5, 0)), a);
    resumed.commit(drag(5, N(5, 0)), b);
    expect(eventLogHash(b.events)).toBe(eventLogHash(a.events));
    expect(resumed.state.buf).toEqual(live.state.buf);
  });
});

describe('K-46 YAO', () => {
  it('K-46 GDD example: 4 over-wall + 1 rail correct placements → 0.80; a wrong placement and a trowel fill do not count', () => {
    const session = GameSession.start(compiledLevel(YAO_LEVEL), { preBoosters: ['trowelStart'] });
    const s = session.state;
    session.commit(drag(0, N(6, 8))); // (6,0)–(7,0) over the wall
    const wrong = new ArraySink();
    session.commit(drag(5, N(6, 8)), wrong); // Y onto W (6,1): bounces
    expect(first(wrong.events, 'pieceBounced').reason).toBe('color');
    session.commit(drag(1, N(6, 8))); // row 1
    session.commit(drag(2, N(6, 8))); // row 2
    const rail = new ArraySink();
    session.commit(drag(3, RL(0, 6, 3)), rail); // R through the gap
    expect(first(rail.events, 'placementCorrect').overWall).toBe(false);
    // K-33: a correct rail placement is a correct drag placement for the streak too (wrong reset it to 0 before)
    expect(hdr(s, H.combo)).toBe(3);
    expect(session.commit(trowel(0, 4)).status).toBe('applied');
    const last = session.commit(drag(4, N(7, 8)));
    expect(last.won).toBe(true);
    expect(measureYao(s)).toEqual({ overWall: 4, rail: 1, yao: 0.8 });
    expect(hdr(s, H.wrongCount)).toBe(1);
  });
});

describe('K-35 step 5 and K-41 debris through the rail', () => {
  it('K-35 step 5 neighbour effects also run for a block that bounced back (the move is not cancelled, K-17)', () => {
    const s = createInitialState(compiledLevel(STREAK));
    const seen: [PieceId, string][] = [];
    const hooks: MoveHooks = {
      onNeighborMoved: (_ctx, entity, moved) => {
        seen.push([moved, entity.kind === 'piece' ? `piece ${entity.id}` : `obstacle ${entity.index}`]);
        return 'none';
      },
    };
    // B1 Y (4,0) onto the W plan: wrong, bounces back to (4,0); its start neighbours are (3,0) and (5,0)
    const m = play(s, drag(4, N(6, 8)), { hooks });
    expect(first(m.ev, 'pieceBounced').to).toMatchObject({ zone: 'yard', x: 4, y: 0 });
    expect(seen).toEqual([
      [4, 'piece 3'],
      [4, 'piece 5'],
    ]);
  });

  it('K-41 debris leaving the site through the rail (K-12 exception) counts once; moving it again in the yard does not count', () => {
    const s = createInitialState(
      compiledLevel({
        wall: { height: 5, gaps: [{ y: 3, size: 1, type: 'static' }] },
        plan: ['WW', 'WW', 'WW', 'WW'],
        pieces: [['B1_0', 'W', 0, 0]],
        debris: [['D2_90', 'R', 6, 3]],
        goals: [{ type: 'build' }, { type: 'clear', target: 'debris', count: 2 }],
      }),
    );
    const debris = 1;
    const attempt = tryBeginDrag(s, debris);
    if (!attempt.ok) throw new Error(`debris not pickable: ${attempt.reason}`);
    expect(attempt.session.startNodes).toContainEqual(RL(0, 6, 3));
    expect(attempt.session.isReachable(N(4, 3))).toBe(true);
    const out = play(s, drag(debris, N(4, 3)));
    expect(first(out.ev, 'pieceMoved')).toMatchObject({
      from: { zone: 'site', x: 6, y: 3 },
      to: { zone: 'yard', x: 4, y: 3 },
    });
    expect(first(out.ev, 'goalProgress')).toMatchObject({ step: 7, goal: 1, value: 1, target: 2 });
    const again = play(s, drag(debris, N(4, 2)));
    expect(only(again.ev, 'goalProgress')).toEqual([]);
    expect(goalViews(s)[1]).toMatchObject({ value: 1, target: 2, done: false });
  });
});

describe('W1 static gap and S2 plan void', () => {
  it('W1 K-12 GDD example: D2_90 (4,3)–(5,3) → straddle (5,3)|(6,3) → (6,3)–(7,3) on the rail; released it stays on row 3 over the voids', () => {
    const s = createInitialState(compiledLevel(gapOverVoids()));
    const attempt = tryBeginDrag(s, 0);
    if (!attempt.ok) throw new Error(`not pickable: ${attempt.reason}`);
    const d = attempt.session;
    expect(d.isReachable(RL(0, 5, 3))).toBe(true);
    expect(d.isReachable(RL(0, 6, 3))).toBe(true);
    // on the rail the block moves only horizontally; it may leave to the left onto a node fully in the yard
    expect(d.neighbours(RL(0, 6, 3))).toEqual([RL(0, 5, 3)]);
    expect(d.neighbours(RL(0, 5, 3))).toEqual([N(4, 3), RL(0, 6, 3)]);
    expect(d.classify(RL(0, 6, 3))).toMatchObject({ kind: 'siteRail', gap: 0 });
    const m = play(s, drag(0, RL(0, 6, 3)));
    expect(first(m.ev, 'pieceMoved')).toMatchObject({
      entry: 'gap',
      gap: 0,
      to: { zone: 'site', x: 6, y: 3 },
    });
    expect(only(m.ev, 'pieceFell')).toEqual([]);
    expect(first(m.ev, 'placementCorrect').cells).toEqual([
      { zone: 'site', x: 6, y: 3, seg: 0 },
      { zone: 'site', x: 7, y: 3, seg: 0 },
    ]);
    // K-15: the `.` rows below stay empty, so the segment is complete
    expect(m.res.won).toBe(true);
  });

  it('W1 K-12 the same gap refuses D2_0 (rows 3–4: row 4 is outside the gap); over the wall the D2_90 would fall onto a void', () => {
    const s = createInitialState(compiledLevel(gapOverVoids()));
    const attempt = tryBeginDrag(s, 1);
    if (!attempt.ok) throw new Error(`not pickable: ${attempt.reason}`);
    expect(attempt.session.reachableNodes().filter((n) => n.mode !== FREE)).toEqual([]);
    const over = play(s, drag(2, N(6, 8)));
    expect(first(over.ev, 'pieceFell').to).toMatchObject({ x: 6, y: 0 });
    expect(first(over.ev, 'placementWrong').reasons[0]).toBe('window');
    expect(at(s, 2)).toEqual([0, 0, Zone.yard]);
  });

  it('W1 K-12 the rail cannot be entered from the site side: a block over the site at the gap row has no RAIL node', () => {
    const s = createInitialState(
      compiledLevel({
        wall: { height: 5, gaps: [{ y: 3, size: 1, type: 'static' }] },
        plan: ['WW', 'WW', 'WW', 'WW'],
        pieces: [
          ['B1_0', 'W', 0, 7],
          ['B1_0', 'Y', 4, 3],
          ['B1_0', 'Y', 5, 2],
          ['B1_0', 'Y', 5, 4],
        ],
      }),
    );
    const attempt = tryBeginDrag(s, 0);
    if (!attempt.ok) throw new Error(`not pickable: ${attempt.reason}`);
    const d = attempt.session;
    expect(d.isReachable(N(6, 3))).toBe(true); // over the wall, then down the empty site column
    expect(d.isReachable(N(5, 3))).toBe(false); // row 3 is closed in FREE mode, the yard side is walled in
    expect(d.isReachable(RL(0, 6, 3))).toBe(false);
    expect(d.reachableNodes().filter((n) => n.mode !== FREE)).toEqual([]);
  });

  it('W1 K-12 every block row must lie in the gap rows (gap y = 2, size 2): a D2_0 rides rows 2–3 only', () => {
    const s = createInitialState(
      compiledLevel({
        wall: { height: 5, gaps: [{ y: 2, size: 2, type: 'static' }] },
        plan: ['WW', 'WW', 'WW', 'WW'],
        pieces: [
          ['D2_0', 'R', 4, 2],
          ['I3_0', 'R', 3, 1],
        ],
      }),
    );
    const d0 = tryBeginDrag(s, 0);
    const d1 = tryBeginDrag(s, 1);
    if (!d0.ok || !d1.ok) throw new Error('not pickable');
    const rails = (n: readonly DragNode[]): [number, number][] =>
      n.filter((x) => x.mode !== FREE).map((x) => [x.ix, x.iy]);
    // D2_0 (1 × 2): only anchor row 2 (rows 2–3) fits; (6,1) or (6,3) would leave the gap rows
    expect(rails(d0.session.reachableNodes())).toEqual([
      [6, 2],
      [7, 2],
    ]);
    // I3_0 (1 × 3) never fits a 2-row gap
    expect(rails(d1.session.reachableNodes())).toEqual([]);
  });

  it('S2 a `.` on the bottom row: the cell above it is build front from the start; a 1-wide drop falls into the void', () => {
    // plan bottom → top: y0 `W.`, y1 `WW`
    const s = createInitialState(
      compiledLevel({ wall: { height: 2 }, plan: ['WW', 'W.'], pieces: [['B1_0', 'W', 0, 0]] }),
    );
    expect(buildFront(s).map((c) => [c.x, c.y])).toEqual([
      [6, 0],
      [7, 1],
    ]);
    const m = play(s, drag(0, N(7, 8)));
    expect(first(m.ev, 'pieceFell').to).toMatchObject({ x: 7, y: 0 });
    expect(first(m.ev, 'placementWrong').reasons[0]).toBe('window');
    setHdr(s, H.trowels, 1);
    expect(play(s, trowel(1, 1)).res.status).toBe('applied');
  });

  it('S2 a rail placement with a cell on a `.` is wrong (window) and bounces back to its yard start', () => {
    const s = createInitialState(compiledLevel(gapOverVoids('R.')));
    const m = play(s, drag(0, RL(0, 6, 3)));
    expect(m.res.status).toBe('applied');
    expect(first(m.ev, 'placementWrong').reasons[0]).toBe('window');
    expect(first(m.ev, 'pieceBounced')).toMatchObject({ reason: 'window', to: { zone: 'yard', x: 4, y: 3 } });
    expect(at(s, 0)).toEqual([4, 3, Zone.yard]);
    expect([hdr(s, H.movesLeft), hdr(s, H.combo)]).toEqual([19, 0]);
  });

  it('S2 K-34 a 2-wide block bridging over a `.` lands on the higher column and is correct (OBSTACLES S2 "köprü")', () => {
    // plan bottom → top: y0 WW, y1 W., y2 WW
    const s = createInitialState(
      compiledLevel({
        wall: { height: 2 },
        plan: ['WW', 'W.', 'WW'],
        pieces: [
          ['D2_90', 'W', 0, 0],
          ['B1_0', 'W', 2, 0],
          ['D2_90', 'W', 3, 0],
        ],
      }),
    );
    play(s, drag(0, N(6, 8))); // y0
    play(s, drag(1, N(6, 8))); // (6,1)
    const bridge = play(s, drag(2, N(6, 8)));
    expect(first(bridge.ev, 'pieceFell').to).toMatchObject({ x: 6, y: 2 });
    expect(first(bridge.ev, 'placementCorrect').pieceId).toBe(2);
    expect(bridge.res.won).toBe(true);
    expect(siteOcc(s, 0, 1, 1)).toBe(0);
  });
});

// =====================================================================================================================
// Round 2
// =====================================================================================================================

/** Step numbers of `ev` paired with their type (K-35 order checks). */
const steps = (ev: readonly GameEvent[]): [GameEventType, number][] => ev.map((e) => [e.t, e.step]);

/**
 * K-25 start row: mover B1 W (0,0) completes `W.`; the yard is otherwise empty. Batch 1: B1 R x 1 (id 1), O4 G x 2
 * (id 2), D2_0 Y x 4 (id 3).
 */
const DROP_START: LevelSpec = {
  plan: [['W.'], ['WW']],
  pieces: [['B1_0', 'W', 0, 0]],
  batches: [
    {
      forSegment: 1,
      pieces: [
        ['B1_0', 'R', 1, 8],
        ['O4_0', 'G', 2, 8],
        ['D2_0', 'Y', 4, 8],
      ],
    },
  ],
};

/**
 * K-25 stage 3 for a 2-wide block: columns 0, 1, 4, 5 filled on rows 0–5, column 2 on rows 0–6 (+ the mover B1 W at
 * (2,7)), column 3 full. Batch 1: two O4 with x = 2 (ids 13, 14).
 */
const WIDE_TIE: LevelSpec = {
  plan: [['W.'], ['WW']],
  pieces: [
    ['B1_0', 'W', 2, 7],
    ['I4_0', 'Y', 0, 0],
    ['D2_0', 'Y', 0, 4],
    ['I4_0', 'Y', 1, 0],
    ['D2_0', 'Y', 1, 4],
    ['I4_0', 'Y', 2, 0],
    ['I3_0', 'Y', 2, 4],
    ...fullColumn(3),
    ['I4_0', 'Y', 4, 0],
    ['D2_0', 'Y', 4, 4],
    ['I4_0', 'Y', 5, 0],
    ['D2_0', 'Y', 5, 4],
  ],
  batches: [
    {
      forSegment: 1,
      pieces: [
        ['O4_0', 'R', 2, 8],
        ['O4_0', 'G', 2, 8],
      ],
    },
  ],
};

/**
 * K-25 "ilk desteğe oturur" per column: column 1 filled on rows 0–3, column 2 on rows 0–5. Mover B1 W (5,0) = 0;
 * batch 1: C3_90 R x 1 = id 4 (GDD K-44: cells (0,0)(0,1)(1,1)).
 */
const UNEVEN: LevelSpec = {
  plan: [['W.'], ['WW']],
  pieces: [
    ['B1_0', 'W', 5, 0],
    ['I4_0', 'Y', 1, 0],
    ['I4_0', 'Y', 2, 0],
    ['D2_0', 'Y', 2, 4],
  ],
  batches: [{ forSegment: 1, pieces: [['C3_90', 'R', 1, 8]] }],
};

/**
 * K-28 + K-26: two `W.` segments; mover A B1 W (0,7); every other yard cell is full. Batch 1: B1 W x 0 (id 13, lands
 * on (0,7)) and O4 R x 0 (id 14, never fits).
 */
const WIN_WITH_TRUCK: LevelSpec = {
  plan: [['W.'], ['W.']],
  pieces: [
    ['B1_0', 'W', 0, 7],
    ...column7(0),
    ...fullColumn(1),
    ...fullColumn(2),
    ...fullColumn(3),
    ...fullColumn(4),
    ...fullColumn(5),
  ],
  batches: [
    {
      forSegment: 1,
      pieces: [
        ['B1_0', 'W', 0, 8],
        ['O4_0', 'R', 0, 8],
      ],
    },
  ],
};

/** W1 × S1: segment 0 = `WW`; segment 1 = RR over three `.` rows; static gap y = 3. 0 = D2_90 W (0,0), 1 = D2_90 R (4,3). */
const RAIL_AFTER_SHIFT: LevelSpec = {
  wall: { height: 5, gaps: [{ y: 3, size: 1, type: 'static' }] },
  plan: [['WW'], ['RR', '..', '..', '..']],
  pieces: [
    ['D2_90', 'W', 0, 0],
    ['D2_90', 'R', 4, 3],
  ],
};

/**
 * A stand-in for the Phase 3 truck help (K-30, E-37 / E-42): at step 12 it draws from the state's RNG and moves the
 * STREAK yard single B1 W (id 5, alone in column 5) to row 1 + rng(6). Deterministic only if the RNG lives in the state.
 */
function rngHelp(calls: number[] = []): MoveHooks {
  return {
    deadlock: (ctx) => {
      const id = 5;
      if (pieceZone(ctx.s, id) !== Zone.yard || pieceX(ctx.s, id) !== 5) return;
      const fromY = pieceY(ctx.s, id);
      const toY = 1 + ctx.rng.nextInt(6);
      calls.push(toY);
      movePiece(ctx.s, id, yardPlace({ ix: 5, iy: toY }));
      ctx.emit({
        t: 'truckHelp',
        kind: 'reshuffle',
        moves: [{ pieceId: id, from: { zone: 'yard', x: 5, y: fromY }, to: { zone: 'yard', x: 5, y: toY } }],
      });
    },
  };
}

describe('Round 2 · K-25 / K-26 truck delivery geometry and the queue counter', () => {
  it('K-25 a truck block is dropped from y = 10 − h (B1 from row 9, O4 / D2_0 from row 8) onto its first support; deliveryArrived names the new segment', () => {
    const s = createInitialState(compiledLevel(DROP_START));
    const m = play(s, drag(0, N(6, 8)));
    expect(first(m.ev, 'deliveryArrived')).toMatchObject({ step: 9, seg: 1, pieces: [1, 2, 3] });
    expect(only(m.ev, 'pieceFell').filter((e) => e.cause === 'delivery')).toMatchObject([
      { pieceId: 1, from: { x: 1, y: 9 }, to: { zone: 'yard', x: 1, y: 0 }, rows: 9 },
      { pieceId: 2, from: { x: 2, y: 8 }, to: { zone: 'yard', x: 2, y: 0 }, rows: 8 },
      { pieceId: 3, from: { x: 4, y: 8 }, to: { zone: 'yard', x: 4, y: 0 }, rows: 8 },
    ]);
    expect([at(s, 1), at(s, 2), at(s, 3)]).toEqual([
      [1, 0, Zone.yard],
      [2, 0, Zone.yard],
      [4, 0, Zone.yard],
    ]);
    expectConsistent(s);
  });

  it('K-25 stage 3 for a 2-wide block: anchors 0 and 4 are both 2 away from x = 2 → the wall side (4) wins; the 2nd O4 then takes anchor 0', () => {
    const s = createInitialState(compiledLevel(WIDE_TIE));
    const m = play(s, drag(0, N(6, 8)));
    expect(first(m.ev, 'siteShifted').toSeg).toBe(1);
    // anchor 2 (cols 2–3) and the distance-1 anchors 1 (col 2 top = 6) and 3 (col 3 full) have no room for 2 rows
    expect(at(s, 13)).toEqual([4, 6, Zone.yard]);
    expect(at(s, 14)).toEqual([0, 6, Zone.yard]);
    expect(queueIds(s)).toEqual([]);
    expectConsistent(s);
  });

  it('K-25 "ilk desteğe oturur" is per column: a C3_90 (cells (0,0)(0,1)(1,1)) rests on column 2 (top 5) over a hollow (1,4) in column 1', () => {
    const s = createInitialState(compiledLevel(UNEVEN));
    const m = play(s, drag(0, N(6, 8)));
    expect(at(s, 4)).toEqual([1, 5, Zone.yard]);
    expect(first(m.ev, 'pieceFell')).toBeDefined();
    expect(only(m.ev, 'pieceFell').filter((e) => e.cause === 'delivery')).toMatchObject([
      { pieceId: 4, from: { x: 1, y: 8 }, to: { x: 1, y: 5 }, rows: 3 },
    ]);
    // the hollow under the overhang stays empty: the truck drop never slides a block sideways into a gap
    expect([yardOcc(s, 1, 4), yardOcc(s, 1, 5), yardOcc(s, 2, 6)]).toEqual([0, 5, 5]);
    expectConsistent(s);
  });

  it('K-26 "Kamyonda: N": deliveryQueued reports N when it changes, and N = 0 when the last queued block lands (chip hidden)', () => {
    const lvl = compiledLevel({ ...FIFO, batches: FIFO.batches?.slice(0, 1) });
    const s = createInitialState(lvl);
    const m1 = play(s, drag(0, N(6, 8)));
    expect(only(m1.ev, 'deliveryQueued')).toMatchObject([{ step: 9, queued: 1 }]);
    const m2 = play(s, drag(1, N(6, 8)));
    expect(first(m2.ev, 'deliveryArrived').pieces).toEqual([15]);
    expect(only(m2.ev, 'deliveryQueued')).toMatchObject([{ step: 9, queued: 0 }]);
    expect(queueIds(s)).toEqual([]);
  });

  it('K-28 K-26 the win does not wait for the truck: the last segment completes while an O4 still has no room → won, the O4 stays queued', () => {
    const s = createInitialState(compiledLevel(WIN_WITH_TRUCK));
    play(s, drag(0, N(6, 8)));
    expect(at(s, 13)).toEqual([0, 7, Zone.yard]);
    expect(queueIds(s)).toEqual([14]);
    const last = play(s, drag(13, N(6, 8)));
    expect(first(last.ev, 'segmentCompleted').seg).toBe(1);
    expect(only(last.ev, 'siteShifted')).toEqual([]);
    expect(only(last.ev, 'deliveryArrived')).toEqual([]); // (0,7) is free again, but an O4 needs 2 × 2
    expect(last.res.won).toBe(true);
    expect(first(last.ev, 'levelWon').step).toBe(11);
    expect(queueIds(s)).toEqual([14]);
  });
});

describe('Round 2 · K-35 step order of the other release kinds', () => {
  it('K-35 a wrong over-wall placement emits exactly 1 pieceMoved · 2 pieceFell · 3 placementWrong, pieceBounced, comboChanged · 4 movesChanged', () => {
    const s = createInitialState(compiledLevel(STREAK));
    play(s, drag(0, N(6, 8))); // correct, c = 1
    const wrong = play(s, drag(4, N(7, 8))); // B1 Y onto W (7,0)
    expect(steps(wrong.ev)).toEqual([
      ['pieceMoved', 1],
      ['pieceFell', 2],
      ['placementWrong', 3],
      ['pieceBounced', 3],
      ['comboChanged', 3],
      ['movesChanged', 4],
    ]);
    expect(first(wrong.ev, 'comboChanged').combo).toBe(0);
    expect(first(wrong.ev, 'movesChanged')).toMatchObject({ movesLeft: 18, delta: -1, reason: 'move' });
  });

  it('K-35 a yard move (K-10) emits only pieceMoved (step 1) and movesChanged (step 4): no fall, no streak change', () => {
    const s = createInitialState(compiledLevel(STREAK));
    play(s, drag(0, N(6, 8)));
    const yard = play(s, drag(5, N(5, 1)));
    expect(steps(yard.ev)).toEqual([
      ['pieceMoved', 1],
      ['movesChanged', 4],
    ]);
    expect(first(yard.ev, 'pieceMoved')).toMatchObject({ entry: 'yard', to: { zone: 'yard', x: 5, y: 1 } });
    expect(hdr(s, H.combo)).toBe(1);
  });

  it('K-35 step 2 (TECH 6.3): a FREE site release at the silhouette (d = 0) still emits exactly one pieceFell{release} with rows 0', () => {
    const s = createInitialState(compiledLevel({ plan: ['WW'], pieces: [['D2_90', 'W', 4, 0]] }));
    const attempt = tryBeginDrag(s, 0);
    if (!attempt.ok) throw new Error(`not pickable: ${attempt.reason}`);
    expect(attempt.session.classify(N(6, 0))).toMatchObject({ kind: 'siteFree' });
    const m = play(s, drag(0, N(6, 0)));
    expect(only(m.ev, 'pieceFell')).toMatchObject([
      { step: 2, cause: 'release', rows: 0, from: { x: 6, y: 0 }, to: { x: 6, y: 0 } },
    ]);
    expect(first(m.ev, 'placementCorrect').overWall).toBe(true);
    expect(m.res.won).toBe(true);
  });

  it('K-29 K-35 a move that empties the counter still runs steps 8–9 (shift, delivery) before the step-11 window; step 12 is skipped', () => {
    const calls: number[] = [];
    const hooks: MoveHooks = { deadlock: () => void calls.push(1) };
    const s = createInitialState(
      compiledLevel({
        moves: 1,
        plan: [['W.'], ['WW']],
        pieces: [['B1_0', 'W', 0, 0]],
        batches: [{ forSegment: 1, pieces: [['B1_0', 'R', 1, 8]] }],
      }),
    );
    const m = play(s, drag(0, N(6, 8)), { hooks });
    expect(m.res).toEqual({ status: 'applied', reason: null, won: false, outOfMoves: true });
    expect(steps(m.ev).filter(([t]) => t !== 'deliveryQueued')).toEqual([
      ['pieceMoved', 1],
      ['pieceFell', 2],
      ['placementCorrect', 3],
      ['comboChanged', 3],
      ['movesChanged', 4],
      ['segmentCompleted', 8],
      ['goalProgress', 8],
      ['siteShifted', 8],
      ['deliveryArrived', 9],
      ['pieceFell', 9],
      ['outOfMoves', 11],
    ]);
    expect(at(s, 1)).toEqual([1, 0, Zone.yard]);
    expect(calls).toEqual([]);
  });

  it('E-30 K-09 (e) at 0 moves no block can be picked: a drag record is cancelled as invalid and changes nothing', () => {
    const s = createInitialState(compiledLevel(STREAK));
    setHdr(s, H.movesLeft, 0);
    expect(tryBeginDrag(s, 0).ok).toBe(false);
    const before = s.buf.slice();
    const sink = new ArraySink();
    const res = applyMove(s, drag(0, N(6, 8)), sink);
    expect(res).toEqual({ status: 'cancelled', reason: 'invalid', won: false, outOfMoves: false });
    expect(sink.events.map((e) => e.t)).toEqual(['moveCancelled']);
    expect(s.buf).toEqual(before);
  });
});

describe('Round 2 · K-22 / K-33 / W1 / S2 across segments', () => {
  it('K-33 K-22 the streak is not reset by a segment shift: level 5 moves 1, 4, 6 and 7 are the 4 correct drags → a Golden Trowel on move 7', () => {
    const s = createInitialState(levelFile(5));
    play(s, drag(2, N(6, 8))); // 1: c = 1
    play(s, drag(0, N(2, 6))); // 2: yard
    play(s, drag(0, N(4, 7))); // 3: yard
    play(s, drag(1, N(6, 8))); // 4: c = 2
    play(s, drag(0, N(2, 6))); // 5: yard
    play(s, drag(0, N(6, 8))); // 6: c = 3, Sol Oda complete → Sağ Oda
    expect([hdr(s, H.combo), hdr(s, H.activeSeg)]).toEqual([3, 1]);
    const seventh = play(s, drag(15, N(6, 8)));
    expect(first(seventh.ev, 'placementCorrect').pieceId).toBe(15);
    expect(only(seventh.ev, 'comboChanged').map((e) => e.combo)).toEqual([4, 0]);
    expect(first(seventh.ev, 'trowelEarned').trowels).toBe(1);
    expect([hdr(s, H.combo), hdr(s, H.trowels)]).toEqual([0, 1]);
  });

  it('W1 K-22 after the shift the static gap leads into the NEW segment: the rail placement is checked and locked in segment 1', () => {
    const s = createInitialState(compiledLevel(RAIL_AFTER_SHIFT));
    expect(first(play(s, drag(0, N(6, 8))).ev, 'siteShifted').toSeg).toBe(1);
    const rail = play(s, drag(1, RL(0, 6, 3)));
    expect(first(rail.ev, 'pieceMoved')).toMatchObject({
      entry: 'gap',
      gap: 0,
      to: { zone: 'site', x: 6, y: 3, seg: 1 },
    });
    expect(only(rail.ev, 'pieceFell')).toEqual([]);
    expect(first(rail.ev, 'placementCorrect')).toMatchObject({
      overWall: false,
      cells: [
        { zone: 'site', x: 6, y: 3, seg: 1 },
        { zone: 'site', x: 7, y: 3, seg: 1 },
      ],
    });
    expect([pieceZone(s, 1), pieceSeg(s, 1)]).toEqual([Zone.site, 1]);
    expect(rail.res.won).toBe(true);
    expect(measureYao(s)).toEqual({ overWall: 1, rail: 1, yao: 0.5 });
  });

  it('K-33 the trowel works only on the active segment: a future and a completed segment are refused and spend nothing', () => {
    const session = GameSession.start(compiledLevel(TWO_ROOMS), { preBoosters: ['trowelStart'] });
    const s = session.state;
    const future = session.commit(trowel(0, 0, 1));
    expect([future.status, future.reason]).toEqual(['rejected', 'notVisibleSegment']);
    expect(hdr(s, H.trowels)).toBe(1);
    session.commit(drag(0, N(6, 8))); // Sol oda complete → segment 1
    expect(session.commit(trowel(0, 0, 0)).status).toBe('rejected');
    expect(hdr(s, H.trowels)).toBe(1);
    expect(session.commit(trowel(0, 0, 1)).status).toBe('applied');
    expect([hdr(s, H.trowels), siteOcc(s, 1, 0, 0) !== 0]).toEqual([0, true]);
  });

  it('S2 K-34 a 2-wide block with one cell on a `.`: W over `W.` is wrong (window); R over `W.` reports [window, color], window first', () => {
    const same = createInitialState(compiledLevel({ plan: ['W.'], pieces: [['D2_90', 'W', 0, 0]] }));
    const a = play(same, drag(0, N(6, 8)));
    expect(first(a.ev, 'placementWrong').reasons).toEqual(['window']);
    expect(first(a.ev, 'pieceBounced')).toMatchObject({ reason: 'window', to: { zone: 'yard', x: 0, y: 0 } });
    const other = createInitialState(compiledLevel({ plan: ['W.'], pieces: [['D2_90', 'R', 0, 0]] }));
    const b = play(other, drag(0, N(6, 8)));
    expect(first(b.ev, 'placementWrong').reasons).toEqual(['window', 'color']);
    expect(first(b.ev, 'pieceBounced').reason).toBe('window');
  });

  it('K-41 debris dropped back onto the site is wrong (K-16 (2)), returns to its site start (K-17) and does not count as cleared', () => {
    const s = createInitialState(
      compiledLevel({
        plan: ['WW', 'WW', 'WW', 'WW'],
        pieces: [['B1_0', 'W', 0, 0]],
        debris: [['D2_90', 'R', 6, 3]],
        goals: [{ type: 'build' }, { type: 'clear', target: 'debris', count: 1 }],
      }),
    );
    const debris = 1;
    const m = play(s, drag(debris, N(6, 8)));
    expect(first(m.ev, 'placementWrong').reasons[0]).toBe('debris');
    expect(first(m.ev, 'pieceBounced').to).toMatchObject({ zone: 'site', x: 6, y: 3 });
    expect(at(s, debris)).toEqual([6, 3, Zone.site]);
    expect(only(m.ev, 'goalProgress')).toEqual([]);
    expect(goalViews(s)[1]).toMatchObject({ value: 0, target: 1, done: false });
    expect(hdr(s, H.movesLeft)).toBe(19);
  });

  it('K-46 wrong rail and wrong over-wall placements count in neither term: YAO stays undefined (null) until a correct drag placement', () => {
    const s = createInitialState(compiledLevel(gapOverVoids('R.')));
    const rail = play(s, drag(0, RL(0, 6, 3)));
    expect(first(rail.ev, 'placementWrong').reasons).toEqual(['window']);
    const over = play(s, drag(2, N(6, 8)));
    expect(first(over.ev, 'placementWrong').reasons[0]).toBe('window');
    expect(measureYao(s)).toEqual({ overWall: 0, rail: 0, yao: null });
    expect(hdr(s, H.wrongCount)).toBe(2);
  });

  it('K-27 TECH L-10 supply counts only blocks that can reach the site: I3_0 cannot cross an 8-high wall (K-05), so its W cells are short', () => {
    const tall = (height: number, w: readonly PieceSpec[]) =>
      checkLevel(
        level({
          wall: { height },
          plan: [['RR'], ['WW', 'WW', 'WW']],
          pieces: [['D2_90', 'R', 0, 0]],
          batches: [{ forSegment: 1, pieces: w }],
        }),
        { only: ['L-10'] },
      ).map((i) => `${i.code}@${i.path}`);
    const i3: PieceSpec[] = [
      ['I3_0', 'W', 0, 8],
      ['I3_0', 'W', 1, 8],
    ];
    expect(tall(8, i3)).toEqual(['material_short@build.segments[1]']);
    expect(tall(4, i3)).toEqual([]);
    expect(
      tall(8, [
        ['D2_0', 'W', 0, 8],
        ['D2_0', 'W', 1, 8],
        ['D2_0', 'W', 2, 8],
      ]),
    ).toEqual([]);
  });
});

describe('Round 2 · K-39 Undo corner cases', () => {
  it('E-21 K-26 Undo of a shift + delivery puts the old truck block back at the head of the queue and the new batch off the truck; redoing the move replays the same events', () => {
    const session = GameSession.start(compiledLevel(FIFO));
    const s = session.state;
    session.commit(drag(0, N(6, 8)));
    expect(queueIds(s)).toEqual([15]);
    const pendingZone = pieceZone(s, 16);
    const before = s.buf.slice();
    const first2 = new ArraySink();
    session.commit(drag(1, N(6, 8)), first2);
    expect([queueIds(s), at(s, 15)]).toEqual([[16], [5, 7, Zone.yard]]);
    expect(session.undo()).toBe(true);
    expect(s.buf).toEqual(before);
    expect(queueIds(s)).toEqual([15]);
    expect([pieceZone(s, 15), pieceZone(s, 16)]).toEqual([Zone.queue, pendingZone]);
    expect([hdr(s, H.activeSeg), goalViews(s)[0]?.value]).toEqual([1, 1]);
    expect(at(s, 1)).toEqual([5, 7, Zone.yard]);
    const again = new ArraySink();
    session.commit(drag(1, N(6, 8)), again);
    expect(eventLogHash(again.events)).toBe(eventLogHash(first2.events));
  });

  it('K-39 after an accepted +5 offer the next drag can be undone: back to the post-offer state (5 moves, offer kept, no window)', () => {
    const session = GameSession.start(compiledLevel({ ...STREAK, moves: 2 }));
    session.commit(drag(5, N(5, 1)));
    session.commit(drag(5, N(5, 0)));
    expect(session.outcome).toBe('outOfMoves');
    session.acceptOffer('offerCoins');
    expect(session.undoBlock()).toBe('noDragMove');
    const afterOffer = session.state.buf.slice();
    session.commit(drag(0, N(6, 8)));
    expect(session.canUndo()).toBe(true);
    expect(session.undo()).toBe(true);
    expect(session.state.buf).toEqual(afterOffer);
    expect([session.movesLeft, session.movesMade, session.offersUsed, session.outcome]).toEqual([
      5,
      2,
      1,
      'playing',
    ]);
    expect([session.nextOffer(), session.canUndo()]).toEqual([null, false]);
  });

  it('K-39 E-37 a step-12 truck help is undone with its move (RNG state included), so the same move afterwards brings the same help', () => {
    const calls: number[] = [];
    const session = GameSession.start(compiledLevel(STREAK), {}, { hooks: rngHelp(calls) });
    const s = session.state;
    const before = s.buf.slice();
    const rngBefore = hdr(s, H.rng);
    const a = new ArraySink();
    session.commit(drag(0, N(6, 8)), a);
    expect(first(a.events, 'truckHelp').step).toBe(12);
    const helped = pieceY(s, 5);
    expect(helped).toBe(calls[0]);
    expect(hdr(s, H.rng)).not.toBe(rngBefore);
    expect(session.undo()).toBe(true);
    expect(s.buf).toEqual(before);
    expect(at(s, 5)).toEqual([5, 0, Zone.yard]);
    const b = new ArraySink();
    session.commit(drag(0, N(6, 8)), b);
    expect(pieceY(s, 5)).toBe(helped);
    expect(eventLogHash(b.events)).toBe(eventLogHash(a.events));
  });
});

describe('Round 2 · K-43 resume and exit corner cases', () => {
  it('K-43 K-39 a trailing Undo survives the restart: the resumed attempt has the same state and no Undo left (depth 1)', () => {
    const lvl = compiledLevel(STREAK);
    const live = GameSession.start(lvl);
    live.commit(drag(0, N(6, 8)));
    live.commit(drag(1, N(7, 8)));
    live.undo();
    const resumed = GameSession.replay(lvl, live.log);
    expect(resumed.state.buf).toEqual(live.state.buf);
    expect([resumed.movesMade, resumed.undoBlock()]).toEqual([1, 'noDragMove']);
    expect(resumed.undo()).toBe(false);
  });

  it('K-43 K-29 an out-of-moves window after an ad offer comes back as offer 2 without the ad option', () => {
    const lvl = compiledLevel({ ...STREAK, moves: 1 });
    const live = GameSession.start(lvl);
    live.commit(drag(5, N(5, 1)));
    expect(live.nextOffer()).toEqual({ n: 1, adAllowed: true });
    live.acceptOffer('offerAd');
    for (const y of [0, 1, 0, 1, 0]) live.commit(drag(5, N(5, y)));
    expect([live.outcome, live.nextOffer()]).toEqual(['outOfMoves', { n: 2, adAllowed: false }]);
    const resumed = GameSession.replay(lvl, live.log);
    expect([resumed.outcome, resumed.nextOffer(), resumed.offersUsed, resumed.adOfferUsed]).toEqual([
      'outOfMoves',
      { n: 2, adAllowed: false },
      1,
      true,
    ]);
    const before = resumed.state.buf.slice();
    expect(resumed.acceptOffer('offerAd').reason).toBe('adNotAllowed');
    expect(resumed.state.buf).toEqual(before);
    expect(resumed.acceptOffer('offerCoins').status).toBe('applied');
    expect([resumed.movesLeft, resumed.offersUsed]).toEqual([5, 2]);
  });

  it('K-43 a tampered log does not replay: an offer with no window, an Undo after a trowel, a cancelled drag (never logged), a Termos inside the log', () => {
    const lvl = compiledLevel(STREAK);
    const start = (pre: readonly PreBooster[] = []): SessionAction => ({
      kind: 'start',
      preBoosters: pre,
      streakTier: 0,
    });
    const cases: [SessionAction[], number][] = [
      [[start(), { kind: 'addMoves', amount: 5, source: 'offerCoins' }], 1],
      [[start(['trowelStart']), drag(0, N(6, 8)), trowel(1, 0), { kind: 'undo' }], 3],
      [[start(), drag(0, N(0, 0))], 1],
      [[start(), { kind: 'addMoves', amount: 3, source: 'thermos' }], 1],
    ];
    for (const [log, index] of cases) {
      let caught: unknown = null;
      try {
        GameSession.replay(lvl, log);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(ReplayError);
      expect((caught as ReplayError).index).toBe(index);
    }
  });

  it('K-43 E-42 a step-12 help that draws random numbers (after moves and after an accepted offer) replays bit for bit', () => {
    const lvl = compiledLevel({ ...STREAK, moves: 2 });
    const liveCalls: number[] = [];
    const live = GameSession.start(lvl, {}, { hooks: rngHelp(liveCalls) });
    live.commit(drag(0, N(6, 8))); // step 12 help #1
    live.commit(drag(1, N(7, 8))); // 0 moves left: window, step 12 skipped
    expect(live.outcome).toBe('outOfMoves');
    const sink = new ArraySink();
    live.acceptOffer('offerCoins', sink); // step 12 once (E-42) → help #2
    expect(steps(sink.events)).toEqual([
      ['movesChanged', 1],
      ['truckHelp', 12],
    ]);
    expect(liveCalls.length).toBe(2);
    const replayCalls: number[] = [];
    const resumed = GameSession.replay(lvl, live.log, { hooks: rngHelp(replayCalls) });
    expect(replayCalls).toEqual(liveCalls);
    expect(resumed.state.buf).toEqual(live.state.buf);
    expect([resumed.outcome, resumed.movesLeft, resumed.movesMade]).toEqual(['playing', 5, 2]);
  });

  it('K-43 resume right after a shift + delivery (level 5, move 6): same truck queue, and move 7 yields the same events', () => {
    const lvl = levelFile(5);
    const live = GameSession.start(lvl);
    for (const m of [
      drag(2, N(6, 8)),
      drag(0, N(2, 6)),
      drag(0, N(4, 7)),
      drag(1, N(6, 8)),
      drag(0, N(2, 6)),
      drag(0, N(6, 8)),
    ])
      expect(live.commit(m).status).toBe('applied');
    const resumed = GameSession.replay(lvl, live.log);
    expect(resumed.state.buf).toEqual(live.state.buf);
    expect(queueIds(resumed.state)).toEqual([16]);
    expect(resumed.canUndo()).toBe(live.canUndo());
    const a = new ArraySink();
    const b = new ArraySink();
    live.commit(drag(15, N(6, 8)), a);
    resumed.commit(drag(15, N(6, 8)), b);
    expect(eventLogHash(b.events)).toBe(eventLogHash(a.events));
  });

  it('K-43 K-40 the Mala Başlangıcı trowel used at m = 0: the exit is still free and the pre-level booster is refunded', () => {
    const session = GameSession.start(compiledLevel(STREAK), { preBoosters: ['trowelStart'] });
    expect(session.commit(trowel(0, 0)).status).toBe('applied');
    expect(session.commit(drag(1, N(1, 0))).status).toBe('cancelled'); // K-07 row 1: not a move
    expect(session.exit()).toEqual({
      kind: 'free',
      movesMade: 0,
      refundPreBoosters: ['trowelStart'],
      streakBonusConsumed: false,
    });
  });

  it('K-43 E-09 a log that ends with a winning trowel replays to the won outcome (mini pipeline step 11)', () => {
    const lvl = compiledLevel({ plan: ['WW'], pieces: [['B1_0', 'W', 0, 0]], moves: 7 });
    const live = GameSession.start(lvl, { preBoosters: ['trowelStart'] });
    live.commit(drag(0, N(6, 8)));
    expect(live.commit(trowel(1, 0)).won).toBe(true);
    expect(live.outcome).toBe('won');
    const resumed = GameSession.replay(lvl, live.log);
    expect([resumed.outcome, isLevelWon(resumed.state), resumed.movesLeft, resumed.movesMade]).toEqual([
      'won',
      true,
      6,
      1,
    ]);
    expect(resumed.state.buf).toEqual(live.state.buf);
    expect(resumed.undoBlock()).toBe('levelOver');
  });

  it('K-43 two moves and an Undo of the second leave m = 1: the confirmed exit is a loss', () => {
    const session = GameSession.start(compiledLevel(STREAK));
    session.commit(drag(0, N(6, 8)));
    session.commit(drag(1, N(7, 8)));
    session.undo();
    expect(session.movesMade).toBe(1);
    expect(session.exit()).toEqual({
      kind: 'loss',
      movesMade: 1,
      refundPreBoosters: [],
      streakBonusConsumed: true,
    });
    expect(session.outcome).toBe('lost');
  });
});

// =====================================================================================================================
// Round 3
// =====================================================================================================================

/**
 * K-25 GDD example: column 0 full, column 1 filled on rows 0–5, columns 4–5 on rows 0–3 (top filled y = 3). Mover
 * B1 W (2,0) = 0; batch 1 = [O4 G x 4 (id 7), B1 R x 0 (id 8)].
 */
const K25_EXAMPLE: LevelSpec = {
  plan: [['W.'], ['WW']],
  pieces: [
    ['B1_0', 'W', 2, 0],
    ...fullColumn(0),
    ['I4_0', 'Y', 1, 0],
    ['D2_0', 'Y', 1, 4],
    ['O4_0', 'Y', 4, 0],
    ['O4_0', 'Y', 4, 2],
  ],
  batches: [
    {
      forSegment: 1,
      pieces: [
        ['O4_0', 'G', 4, 8],
        ['B1_0', 'R', 0, 8],
      ],
    },
  ],
};

/** K-26 GDD example: only (5,7) frees up (the mover B1 W leaves it); queue [O4 W (id 13), B1 Y x 1 (id 14)]. */
const K26_EXAMPLE: LevelSpec = {
  plan: [['W.'], ['WW']],
  pieces: [
    ['B1_0', 'W', 5, 7],
    ...fullColumn(0),
    ...fullColumn(1),
    ...fullColumn(2),
    ...fullColumn(3),
    ...fullColumn(4),
    ...column7(5),
  ],
  batches: [
    {
      forSegment: 1,
      pieces: [
        ['O4_0', 'W', 0, 8],
        ['B1_0', 'Y', 1, 8],
      ],
    },
  ],
};

/**
 * E-34: x = 2 and dropColumns [3, 0] are full; free after the move: (1,7), (4,7), (5,7). Mover B1 W (5,7) = 0;
 * batch 1 = four B1 R with x = 2 (ids 13–16).
 */
const E34_LEVEL: LevelSpec = {
  plan: [['W.'], ['WW']],
  pieces: [
    ['B1_0', 'W', 5, 7],
    ...column7(5),
    ...fullColumn(0),
    ...column7(1),
    ...fullColumn(2),
    ...fullColumn(3),
    ...column7(4),
  ],
  batches: [
    {
      forSegment: 1,
      dropColumns: [3, 0],
      pieces: [
        ['B1_0', 'R', 2, 8],
        ['B1_0', 'R', 2, 8],
        ['B1_0', 'R', 2, 8],
        ['B1_0', 'R', 2, 8],
      ],
    },
  ],
};

/**
 * E-03: after move 1 the truck O4 R (x 0, id 14) finds no 2 × 2 room and waits. Mover B1 W (5,7) = 0; column 5 rows
 * 0–6 (1–2), columns 2–4 full (3–8), columns 0–1 rows 0–5 (9–12), B1 Y (1,6) = 13: (0,6), (0,7), (1,7) stay open.
 */
const E03_LEVEL: LevelSpec = {
  plan: [['W.'], ['WW']],
  pieces: [
    ['B1_0', 'W', 5, 7],
    ...column7(5),
    ...fullColumn(2),
    ...fullColumn(3),
    ...fullColumn(4),
    ['I4_0', 'Y', 0, 0],
    ['D2_0', 'Y', 0, 4],
    ['I4_0', 'Y', 1, 0],
    ['D2_0', 'Y', 1, 4],
    ['B1_0', 'Y', 1, 6],
  ],
  batches: [{ forSegment: 1, pieces: [['O4_0', 'R', 0, 8]] }],
};

/** E-09 on a non-final segment: B1 W (0,0) = 0 fills (6,0), the trowel fills (7,0); batch 1 = D2_90 R x 3 (id 1). */
const TROWEL_SHIFT: LevelSpec = {
  plan: [['WW'], ['RR']],
  pieces: [['B1_0', 'W', 0, 0]],
  batches: [{ forSegment: 1, pieces: [['D2_90', 'R', 3, 8]] }],
};

/**
 * K-13 / K-15 / K-35 step 7 → 8: plan (bottom → top) y0 WW, y1 `..`; debris D2_90 R on (6,1)–(7,1) (id 1) over the
 * empty row 0; static gap y = 0 lets the D2_90 W (4,0) (id 0) slide in under the overhang.
 */
const UNDER_DEBRIS: LevelSpec = {
  wall: { height: 2, gaps: [{ y: 0, size: 1, type: 'static' }] },
  plan: ['..', 'WW'],
  pieces: [['D2_90', 'W', 4, 0]],
  debris: [['D2_90', 'R', 6, 1]],
  goals: [{ type: 'build' }, { type: 'clear', target: 'debris', count: 1 }],
};

/** The level 5 hand solution (LEVELS §2, tests/golden/level_005.hand.json): b, a, c, k1_2, k1_3, k1_1. */
const LEVEL5_HAND: readonly Move[] = [
  drag(2, N(6, 8)),
  drag(1, N(6, 8)),
  drag(0, N(6, 8)),
  drag(15, N(6, 8)),
  drag(16, N(6, 8)),
  drag(14, N(6, 8)),
];

/** A deadlock hook that only records its calls (turn) and emits `deadlockDetected` at step 12. */
function deadlockSpy(calls: number[]): MoveHooks {
  return {
    deadlock: (ctx) => {
      calls.push(hdr(ctx.s, H.turn));
      ctx.emit({ t: 'deadlockDetected', reason: 'noMoves' });
    },
  };
}

/** A neighbour hook that records every yard piece it is asked about and reports it as affected. */
function neighbourSpy(seen: PieceId[]): MoveHooks {
  return {
    onNeighborMoved: (_ctx, entity) => {
      if (entity.kind === 'piece') seen.push(entity.id);
      return 'affected';
    },
  };
}

describe('Round 3 · K-25 / K-26 / E-03 / E-34 truck delivery worked examples', () => {
  it('K-25 GDD example: O4 G x = 4 lands on (4,4) over columns 4–5 (top y = 3); B1 R x = 0 (column full) tries x = 1 first and lands on (1,6)', () => {
    const s = createInitialState(compiledLevel(K25_EXAMPLE));
    const m = play(s, drag(0, N(6, 8)));
    expect(first(m.ev, 'deliveryArrived')).toMatchObject({ step: 9, seg: 1, pieces: [7, 8] });
    expect([at(s, 7), at(s, 8)]).toEqual([
      [4, 4, Zone.yard],
      [1, 6, Zone.yard],
    ]);
    expect(only(m.ev, 'pieceFell').filter((e) => e.cause === 'delivery')).toMatchObject([
      { pieceId: 7, from: { x: 4, y: 8 }, to: { x: 4, y: 4 }, rows: 4 },
      { pieceId: 8, from: { x: 1, y: 9 }, to: { x: 1, y: 6 }, rows: 3 },
    ]);
    expect(queueIds(s)).toEqual([]);
    expectConsistent(s);
  });

  it('K-26 GDD example: queue [O4 W, B1 Y], only (5,7) free → the O4 stays, the B1 behind it is not held back and lands on (5,7); "Kamyonda: 1"', () => {
    const s = createInitialState(compiledLevel(K26_EXAMPLE));
    const m = play(s, drag(0, N(6, 8)));
    expect(first(m.ev, 'deliveryArrived').pieces).toEqual([14]);
    expect(at(s, 14)).toEqual([5, 7, Zone.yard]);
    expect(pieceZone(s, 13)).toBe(Zone.queue);
    expect(queueIds(s)).toEqual([13]);
    expect(only(m.ev, 'deliveryQueued')).toMatchObject([{ step: 9, queued: 1 }]);
    expectConsistent(s);
  });

  it('E-34 x and both dropColumns [3, 0] are full: stage 3 still runs by distance to x (1, 4, 5); the 4th block finds no column and stays queued', () => {
    const s = createInitialState(compiledLevel(E34_LEVEL));
    const m = play(s, drag(0, N(6, 8)));
    expect(first(m.ev, 'deliveryArrived').pieces).toEqual([13, 14, 15]);
    expect([at(s, 13), at(s, 14), at(s, 15)]).toEqual([
      [1, 7, Zone.yard],
      [4, 7, Zone.yard],
      [5, 7, Zone.yard],
    ]);
    expect(queueIds(s)).toEqual([16]);
    expect(first(m.ev, 'deliveryQueued').queued).toBe(1);
    expectConsistent(s);
  });

  it('E-03 a plain yard move that opens room delivers the waiting truck block in its own step 9 (no segment change needed)', () => {
    const s = createInitialState(compiledLevel(E03_LEVEL));
    const m1 = play(s, drag(0, N(6, 8)));
    expect(first(m1.ev, 'siteShifted').toSeg).toBe(1);
    expect(only(m1.ev, 'deliveryArrived')).toEqual([]);
    expect(queueIds(s)).toEqual([14]);
    // the B1 Y leaves (1,6) for (5,7): (0,6)–(1,7) is now a free 2 × 2 on top of columns 0–1
    const m2 = play(s, drag(13, N(5, 7)));
    expect(steps(m2.ev)).toEqual([
      ['pieceMoved', 1],
      ['movesChanged', 4],
      ['deliveryArrived', 9],
      ['pieceFell', 9],
      ['deliveryQueued', 9],
    ]);
    expect(first(m2.ev, 'deliveryArrived')).toMatchObject({ seg: 1, pieces: [14] });
    expect(first(m2.ev, 'deliveryQueued').queued).toBe(0);
    expect(at(s, 14)).toEqual([0, 6, Zone.yard]);
    expect(queueIds(s)).toEqual([]);
    expectConsistent(s);
  });
});

describe('Round 3 · K-22 / K-33 / E-09 segment shift outside a drag', () => {
  it('E-09 K-33 a trowel that completes a NON-final segment runs steps 8 (shift + batch), 9 (delivery) and 12; m, the counter and the streak stay', () => {
    const calls: number[] = [];
    const session = GameSession.start(
      compiledLevel(TROWEL_SHIFT),
      { preBoosters: ['trowelStart'] },
      { hooks: deadlockSpy(calls) },
    );
    const s = session.state;
    session.commit(drag(0, N(6, 8))); // (6,0), c = 1
    const sink = new ArraySink();
    const res = session.commit(trowel(1, 0), sink);
    expect(res).toEqual({ status: 'applied', reason: null, won: false, outOfMoves: false });
    expect(steps(sink.events)).toEqual([
      ['boosterApplied', 1],
      ['segmentCompleted', 8],
      ['goalProgress', 8],
      ['siteShifted', 8],
      ['deliveryArrived', 9],
      ['pieceFell', 9],
      ['deadlockDetected', 12],
    ]);
    expect(first(sink.events, 'siteShifted').toSeg).toBe(1);
    expect(at(s, 1)).toEqual([3, 0, Zone.yard]);
    expect([session.movesMade, session.movesLeft, hdr(s, H.combo), hdr(s, H.trowels)]).toEqual([1, 19, 1, 0]);
    expect(calls).toEqual([1, 1]);
    // K-39: a trowel use in between closes Undo
    expect(session.undoBlock()).toBe('noDragMove');
  });

  it('K-22 K-06 the completed segment joins the panorama as done and the next one becomes active; reading the panorama changes nothing', () => {
    const s = createInitialState(compiledLevel(TWO_ROOMS));
    const status = (): string[] => panoramaView(s).map((p) => p.status);
    expect(status()).toEqual(['active', 'future']);
    play(s, drag(0, N(6, 8)));
    const before = s.buf.slice();
    const view = panoramaView(s);
    expect(view.map((p) => p.status)).toEqual(['done', 'active']);
    expect(view.map((p) => p.rows)).toEqual([
      [
        ['W', 'W'],
        ['W', 'W'],
      ],
      [['R', 'R']],
    ]);
    expect(s.buf).toEqual(before);
    play(s, drag(1, N(6, 8)));
    expect(status()).toEqual(['done', 'done']);
  });

  it('K-22 OBSTACLES N38 debris belongs to its segment: hidden (not pickable) while segment 0 is active, no obstacle to completing segment 0, then it blocks column 7 of segment 1', () => {
    const s = createInitialState(
      compiledLevel({
        plan: [['WW'], ['WW', 'WW']],
        pieces: [['D2_90', 'W', 0, 0]],
        debris: [['B1_0', 'R', 7, 0, 1]],
      }),
    );
    const debris = 1;
    expect(tryBeginDrag(s, debris)).toEqual({ ok: false, reason: 'hiddenSegment' });
    expect([pieceZone(s, debris), pieceSeg(s, debris)]).toEqual([Zone.site, 1]);
    expect([siteOcc(s, 0, 1, 0), siteOcc(s, 1, 1, 0)]).toEqual([0, debris + 1]);
    const m = play(s, drag(0, N(6, 8)));
    expect(first(m.ev, 'pieceFell').to).toMatchObject({ x: 6, y: 0, seg: 0 });
    expect(first(m.ev, 'siteShifted').toSeg).toBe(1);
    expect(tryBeginDrag(s, debris).ok).toBe(true);
    // K-34 hook 1: column 7 holds a wrong object at the bottom → no build front cell there
    expect(buildFront(s)).toEqual([{ zone: 'site', x: 6, y: 0, seg: 1 }]);
    expectConsistent(s);
  });
});

describe('Round 3 · K-29 offers and K-39 Undo around the out-of-moves window', () => {
  it('K-29 after 3 accepted offers (ad, coins, coins) the next empty counter loses the level at once: no window, no offer, Undo closed', () => {
    const session = GameSession.start(compiledLevel({ ...STREAK, moves: 1 }));
    let y = 0;
    const shuttle = (n: number): MoveResult => {
      let last: MoveResult | null = null;
      for (let i = 0; i < n; i++) {
        y = 1 - y;
        last = session.commit(drag(5, N(5, y)));
        expect(last.status).toBe('applied');
      }
      if (!last) throw new Error('no move');
      return last;
    };
    shuttle(1);
    expect(session.nextOffer()).toEqual({ n: 1, adAllowed: true });
    session.acceptOffer('offerAd');
    shuttle(5);
    expect(session.nextOffer()).toEqual({ n: 2, adAllowed: false });
    session.acceptOffer('offerCoins');
    shuttle(5);
    expect(session.nextOffer()).toEqual({ n: 3, adAllowed: false });
    session.acceptOffer('offerCoins');
    const last = shuttle(5);
    expect(last.outOfMoves).toBe(true);
    expect([session.outcome, session.nextOffer(), session.offersUsed, session.movesMade]).toEqual([
      'lost',
      null,
      3,
      16,
    ]);
    expect(hdr(session.state, H.flags) & STATE_FLAG.lost).toBe(STATE_FLAG.lost);
    expect(session.acceptOffer('offerCoins').reason).toBe('noOffer');
    expect(session.undoBlock()).toBe('levelOver');
    expect(session.commit(drag(0, N(6, 8))).reason).toBe('notPlaying');
  });

  it('K-39 K-29 Undo is closed while the out-of-moves window is open; declining loses the level (Undo, moves and exit closed)', () => {
    const session = GameSession.start(compiledLevel({ ...STREAK, moves: 2 }));
    session.commit(drag(0, N(6, 8)));
    session.commit(drag(5, N(5, 1)));
    expect(session.outcome).toBe('outOfMoves');
    const before = session.state.buf.slice();
    const logLength = session.log.length;
    expect([session.undoBlock(), session.undo()]).toEqual(['lossWindow', false]);
    expect(session.state.buf).toEqual(before);
    session.declineOffer();
    expect([session.outcome, session.undoBlock(), session.nextOffer()]).toEqual(['lost', 'levelOver', null]);
    expect(hdr(session.state, H.flags) & STATE_FLAG.lost).toBe(STATE_FLAG.lost);
    expect(session.commit(drag(1, N(7, 8))).reason).toBe('notPlaying');
    expect(() => session.exit()).toThrow();
    expect(session.log.length).toBe(logLength);
  });

  it('K-29 an accepted offer changes neither m nor the streak nor the trowels; a coins offer still counts as n = 1, so offer 2 has no ad option', () => {
    const session = GameSession.start(compiledLevel({ ...STREAK, moves: 4 }));
    const s = session.state;
    session.commit(drag(0, N(6, 8)));
    session.commit(drag(1, N(7, 8)));
    session.commit(drag(2, N(6, 8)));
    session.commit(drag(5, N(5, 1))); // yard move: c stays 3, counter 0
    expect([session.outcome, hdr(s, H.combo)]).toEqual(['outOfMoves', 3]);
    const sink = new ArraySink();
    expect(session.acceptOffer('offerCoins', sink).status).toBe('applied');
    expect(steps(sink.events)).toEqual([['movesChanged', 1]]);
    expect(first(sink.events, 'movesChanged')).toMatchObject({ movesLeft: 5, delta: 5, reason: 'offer' });
    expect([session.movesLeft, session.movesMade, hdr(s, H.combo), hdr(s, H.trowels)]).toEqual([5, 4, 3, 0]);
    // the streak goes on from c = 3: the next correct placement earns the trowel
    const fourth = new ArraySink();
    session.commit(drag(3, N(7, 8)), fourth);
    expect(first(fourth.events, 'trowelEarned').trowels).toBe(1);
    for (const y of [0, 1, 0, 1]) session.commit(drag(5, N(5, y)));
    expect([session.outcome, session.nextOffer()]).toEqual(['outOfMoves', { n: 2, adAllowed: false }]);
  });

  it('K-39 GDD example: a wrong placement that bounced (c 3 → 0, counter −1) is undone → c = 3, the counter, m and the wrong count come back', () => {
    const session = GameSession.start(compiledLevel(STREAK));
    const s = session.state;
    session.commit(drag(0, N(6, 8)));
    session.commit(drag(1, N(7, 8)));
    session.commit(drag(2, N(6, 8)));
    expect([hdr(s, H.combo), session.movesLeft]).toEqual([3, 17]);
    const sink = new ArraySink();
    session.commit(drag(4, N(7, 8)), sink); // B1 Y onto W (7,2)
    expect(first(sink.events, 'pieceBounced').to).toMatchObject({ zone: 'yard', x: 4, y: 0 });
    expect([hdr(s, H.combo), session.movesLeft, hdr(s, H.wrongCount)]).toEqual([0, 16, 1]);
    expect(session.undo()).toBe(true);
    expect([hdr(s, H.combo), session.movesLeft, session.movesMade, hdr(s, H.wrongCount)]).toEqual([
      3, 17, 3, 0,
    ]);
    expect(at(s, 4)).toEqual([4, 0, Zone.yard]);
  });

  it('K-39 depth 1 is per move: drag, Undo, a new drag → Undo is available again; the log replays to the start state', () => {
    const lvl = compiledLevel(STREAK);
    const session = GameSession.start(lvl);
    const start = session.state.buf.slice();
    session.commit(drag(0, N(6, 8)));
    expect(session.undo()).toBe(true);
    expect(session.canUndo()).toBe(false);
    session.commit(drag(1, N(7, 8)));
    expect(session.canUndo()).toBe(true);
    expect(session.undo()).toBe(true);
    expect(session.state.buf).toEqual(start);
    expect(session.undo()).toBe(false);
    expect(session.log.map((a) => a.kind)).toEqual(['start', 'drag', 'undo', 'drag', 'undo']);
    const resumed = GameSession.replay(lvl, session.log);
    expect(resumed.state.buf).toEqual(start);
    expect([resumed.movesMade, resumed.canUndo()]).toEqual([0, false]);
  });

  it('K-39 a trowel use is never undone: Undo of the drag after it goes back to the post-trowel state (cell stays filled, trowel spent)', () => {
    const session = GameSession.start(compiledLevel(STREAK), { preBoosters: ['trowelStart'] });
    const s = session.state;
    expect(session.commit(trowel(0, 0)).status).toBe('applied');
    expect(session.undoBlock()).toBe('noDragMove');
    const afterTrowel = s.buf.slice();
    expect(session.commit(drag(0, N(7, 8))).status).toBe('applied');
    expect(session.undo()).toBe(true);
    expect(s.buf).toEqual(afterTrowel);
    expect([siteOcc(s, 0, 0, 0), hdr(s, H.trowels), session.movesMade]).toEqual([SITE_TROWEL, 0, 0]);
    expect(session.undoBlock()).toBe('noDragMove');
  });

  it('K-39 K-28 a winning drag cannot be undone (level over), and the attempt cannot be exited any more', () => {
    const session = GameSession.start(compiledLevel({ plan: ['WW'], pieces: [['D2_90', 'W', 0, 0]] }));
    expect(session.commit(drag(0, N(6, 8))).won).toBe(true);
    const before = session.state.buf.slice();
    expect([session.undoBlock(), session.undo()]).toEqual(['levelOver', false]);
    expect(session.state.buf).toEqual(before);
    expect(() => session.exit()).toThrow();
  });
});

describe('Round 3 · K-43 resume and exit', () => {
  it('K-43 K-39 level 5 hand solution: every prefix resumes bit for bit; Undo + redo of each non-winning move (shift and truck moves included) gives the same state and events', () => {
    const lvl = levelFile(5);
    const live = GameSession.start(lvl);
    LEVEL5_HAND.forEach((move, i) => {
      const before = live.state.buf.slice();
      const a = new ArraySink();
      expect(live.commit(move, a).status).toBe('applied');
      const after = live.state.buf.slice();
      if (i < LEVEL5_HAND.length - 1) {
        expect(live.undo()).toBe(true);
        expect(live.state.buf).toEqual(before);
        const b = new ArraySink();
        live.commit(move, b);
        expect(live.state.buf).toEqual(after);
        expect(eventLogHash(b.events)).toBe(eventLogHash(a.events));
      }
      const resumed = GameSession.replay(lvl, live.log);
      expect(resumed.state.buf).toEqual(live.state.buf);
      expect([resumed.resumed, resumed.canUndo(), resumed.outcome]).toEqual([
        true,
        live.canUndo(),
        live.outcome,
      ]);
    });
    expect([live.resumed, live.outcome, live.movesLeft, live.movesMade]).toEqual([false, 'won', 5, 6]);
    expect(live.yao()).toEqual({ overWall: 6, rail: 0, yao: 1 });
  });

  it('K-43 E-41 K-40 Termos + streak tier 2 (+2 moves, +1 trowel): 20 → 25 moves and 1 trowel; using that trowel keeps m = 0, the exit is free and the bonus is not consumed', () => {
    const lvl = compiledLevel({ ...STREAK, moves: 20 });
    const bonus: Record<1 | 2 | 3, StreakBonus> = {
      1: { moves: 1, trowels: 0 },
      2: { moves: 2, trowels: 1 },
      3: { moves: 3, trowels: 1 },
    };
    const opts: SessionOptions = { streakBonus: (tier) => bonus[tier] };
    const session = GameSession.start(lvl, { preBoosters: ['thermos'], streakTier: 2 }, opts);
    expect([session.movesLeft, hdr(session.state, H.trowels), session.movesMade]).toEqual([25, 1, 0]);
    expect(session.commit(trowel(0, 0)).status).toBe('applied');
    const resumed = GameSession.replay(lvl, session.log, opts);
    expect(resumed.state.buf).toEqual(session.state.buf);
    expect(resumed.exit()).toEqual({
      kind: 'free',
      movesMade: 0,
      refundPreBoosters: ['thermos'],
      streakBonusConsumed: false,
    });
  });

  it('K-43 item 4 levelHash: 16 hex digits, independent of JSON key order, changed by any change of the level data', () => {
    const json = levelJson(TWO_ROOMS);
    const h = levelHash(json);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    const reordered: unknown = Object.fromEntries(Object.entries(json).reverse());
    expect(levelHash(reordered)).toBe(h);
    expect(levelHash(level(TWO_ROOMS))).toBe(levelHash(level(TWO_ROOMS)));
    expect(levelHash(levelJson({ ...TWO_ROOMS, moves: 21 }))).not.toBe(h);
    expect(
      levelHash(
        levelJson({
          ...TWO_ROOMS,
          pieces: [
            ['O4_0', 'W', 0, 6],
            ['D2_90', 'R', 3, 7],
          ],
        }),
      ),
    ).not.toBe(h);
  });
});

describe('Round 3 · W1 / S1 / S2 plugins on the real levels', () => {
  it('W1 S1 S2 the data signatures of levels 1–5 switch on exactly the OBSTACLES rules (3: W1, 4: W1 + S2, 5: S1) with their info cards and no pipeline hook', () => {
    const rules = [1, 2, 3, 4, 5].map((n) => {
      const lvl = levelFile(n);
      return [activeRuleIds(lvl), infoKeysFor(lvl), Object.keys(levelHooks(lvl))];
    });
    expect(rules).toEqual([
      [[], [], []],
      [[], [], []],
      [['W1'], ['obs.w1.desc'], []],
      [['W1', 'S2'], ['obs.w1.desc', 'obs.s2.desc'], []],
      [['S1'], ['obs.s1.desc'], []],
    ]);
  });
});

describe('Round 3 · W1 / S2 placement through the pipeline', () => {
  it('W1 K-34 a rail block is held where it is released (no fall), so over empty plan rows it is wrong (support) and bounces back to its yard start', () => {
    const s = createInitialState(
      compiledLevel({
        wall: { height: 5, gaps: [{ y: 3, size: 1, type: 'static' }] },
        plan: ['WW', 'WW', 'WW', 'WW'],
        pieces: [['D2_90', 'W', 4, 3]],
      }),
    );
    const m = play(s, drag(0, RL(0, 6, 3)));
    expect(steps(m.ev)).toEqual([
      ['pieceMoved', 1],
      ['placementWrong', 3],
      ['pieceBounced', 3],
      ['movesChanged', 4],
    ]);
    const wrong = first(m.ev, 'placementWrong');
    expect(wrong.reasons).toEqual(['support']);
    // K-34 hook 2: missingSupport sorted by column, then row
    expect(wrong.missingSupport.map((c) => [c.x, c.y])).toEqual([
      [6, 0],
      [6, 1],
      [6, 2],
      [7, 0],
      [7, 1],
      [7, 2],
    ]);
    expect(first(m.ev, 'pieceBounced')).toMatchObject({
      reason: 'support',
      viaDrop: false,
      from: { zone: 'site', x: 6, y: 3 },
      to: { zone: 'yard', x: 4, y: 3 },
    });
    expect(at(s, 0)).toEqual([4, 3, Zone.yard]);
    expect(measureYao(s)).toEqual({ overWall: 0, rail: 0, yao: null });
  });

  it('W1 K-34 GDD example 2 through the gap: y0 WW, y1 W., y2 WW with (6,0), (7,0), (6,1) filled; D2_90 W by rail to (6,2)–(7,2) is correct', () => {
    const s = createInitialState(
      compiledLevel({
        wall: { height: 4, gaps: [{ y: 2, size: 1, type: 'static' }] },
        plan: ['WW', 'W.', 'WW'],
        pieces: [
          ['D2_90', 'W', 0, 0],
          ['B1_0', 'W', 2, 0],
          ['D2_90', 'W', 4, 2],
        ],
      }),
    );
    play(s, drag(0, N(6, 8)));
    play(s, drag(1, N(6, 8)));
    const rail = play(s, drag(2, RL(0, 6, 2)));
    expect(only(rail.ev, 'pieceFell')).toEqual([]);
    expect(first(rail.ev, 'placementCorrect')).toMatchObject({
      pieceId: 2,
      overWall: false,
      cells: [
        { zone: 'site', x: 6, y: 2, seg: 0 },
        { zone: 'site', x: 7, y: 2, seg: 0 },
      ],
    });
    expect(rail.res.won).toBe(true);
    expect(siteOcc(s, 0, 1, 1)).toBe(0);
    expect(measureYao(s)).toEqual({ overWall: 2, rail: 1, yao: 2 / 3 });
  });

  it('S2 OBSTACLES example: column 7 = y0 W, y1 `.`, y2 W; with (7,0) filled a B1 W dropped into column 7 falls onto (7,1) and is wrong (window)', () => {
    const s = createInitialState(
      compiledLevel({
        plan: ['WW', 'W.', 'WW'],
        pieces: [
          ['B1_0', 'W', 0, 0],
          ['B1_0', 'W', 1, 0],
        ],
      }),
    );
    const a = play(s, drag(0, N(7, 8)));
    expect(first(a.ev, 'placementCorrect').cells).toEqual([{ zone: 'site', x: 7, y: 0, seg: 0 }]);
    const b = play(s, drag(1, N(7, 8)));
    expect(first(b.ev, 'pieceFell').to).toMatchObject({ x: 7, y: 1 });
    expect(first(b.ev, 'placementWrong').reasons).toEqual(['window']);
    expect(first(b.ev, 'pieceBounced').to).toMatchObject({ zone: 'yard', x: 1, y: 0 });
    expect(siteOcc(s, 0, 1, 1)).toBe(0);
    expect(buildFront(s).map((c) => [c.x, c.y])).toEqual([
      [6, 0],
      [7, 2],
    ]);
  });
});

describe('Round 3 · K-35 steps 5, 7, 8 and 12', () => {
  it('K-35 K-15 K-13 a rail block under a debris overhang is correct, but the segment completes only when the debris leaves: goalProgress 7 → segmentCompleted 8 → levelWon 11', () => {
    const s = createInitialState(compiledLevel(UNDER_DEBRIS));
    const debris = 1;
    const rail = play(s, drag(0, RL(0, 6, 0)));
    expect(first(rail.ev, 'placementCorrect')).toMatchObject({ pieceId: 0, overWall: false });
    expect(only(rail.ev, 'segmentCompleted')).toEqual([]);
    expect(rail.res.won).toBe(false);
    const out = play(s, drag(debris, N(4, 2)));
    expect(steps(out.ev)).toEqual([
      ['pieceMoved', 1],
      ['movesChanged', 4],
      ['goalProgress', 7],
      ['segmentCompleted', 8],
      ['goalProgress', 8],
      ['levelWon', 11],
    ]);
    expect(only(out.ev, 'goalProgress').map((e) => [e.goal, e.value, e.target])).toEqual([
      [1, 1, 1],
      [0, 1, 1],
    ]);
    expect(out.res.won).toBe(true);
    expect(measureYao(s)).toEqual({ overWall: 0, rail: 1, yao: 0 });
  });

  it('K-41 a counter never passes its target: the 2nd debris leaving the site (count 1) emits no goalProgress and the goal stays 1/1 done', () => {
    const s = createInitialState(
      compiledLevel({
        plan: ['WW', 'WW', 'WW', 'WW'],
        pieces: [['B1_0', 'W', 0, 0]],
        debris: [
          ['B1_0', 'R', 6, 0],
          ['B1_0', 'R', 7, 0],
        ],
        goals: [{ type: 'build' }, { type: 'clear', target: 'debris', count: 1 }],
      }),
    );
    const one = play(s, drag(1, N(5, 0)));
    expect(only(one.ev, 'goalProgress')).toMatchObject([{ step: 7, goal: 1, value: 1, target: 1 }]);
    const two = play(s, drag(2, N(4, 1)));
    expect(at(s, 2)).toEqual([4, 1, Zone.yard]);
    expect(only(two.ev, 'goalProgress')).toEqual([]);
    expect(goalViews(s)[1]).toMatchObject({ value: 1, target: 1, done: true });
  });

  it('E-46 K-35 step 5: debris moved from (6,2) to the yard affects no yard neighbour ((5,2), (5,1)); a yard block moved from (5,2) does', () => {
    const s = createInitialState(
      compiledLevel({
        plan: ['WW', 'WW', 'WW', 'WW'],
        pieces: [
          ['B1_0', 'Y', 5, 2],
          ['B1_0', 'Y', 5, 1],
          ['B1_0', 'W', 5, 0],
        ],
        debris: [['B1_0', 'R', 6, 2]],
      }),
    );
    const seen: PieceId[] = [];
    const hooks = neighbourSpy(seen);
    const debris = 3;
    const out = play(s, drag(debris, N(4, 3)), { hooks });
    expect(first(out.ev, 'pieceMoved')).toMatchObject({ from: { zone: 'site', x: 6, y: 2 } });
    expect(seen).toEqual([]);
    play(s, drag(0, N(3, 0)), { hooks });
    expect(seen).toEqual([1]);
  });

  it('E-11 K-35 step 5: a neighbour touching two start cells is affected once; neighbours come in (y, x) order of their cells', () => {
    const s = createInitialState(
      compiledLevel({
        plan: ['WW', 'WW'],
        pieces: [
          ['D2_0', 'W', 2, 0],
          ['B1_0', 'Y', 1, 0],
          ['D2_0', 'Y', 3, 0],
          ['B1_0', 'Y', 1, 1],
        ],
      }),
    );
    const seen: PieceId[] = [];
    const m = play(s, drag(0, N(6, 8)), { hooks: neighbourSpy(seen) });
    expect(first(m.ev, 'placementCorrect').pieceId).toBe(0);
    // start cells (2,0), (2,1): neighbour cells (1,0) → 1, (3,0) → 2, (1,1) → 3, (3,1) → 2 again (skipped)
    expect(seen).toEqual([1, 2, 3]);
  });

  it('K-35 step 12 runs only after a move that was applied: a cancelled drag (step 0) and a refused trowel never reach it; a yard move does, last', () => {
    const calls: number[] = [];
    const hooks = deadlockSpy(calls);
    const s = createInitialState(compiledLevel(STREAK));
    const before = s.buf.slice();
    expect(play(s, drag(0, N(0, 0)), { hooks }).res.reason).toBe('sameSpot');
    expect(play(s, trowel(0, 0), { hooks }).res.reason).toBe('noTrowel');
    expect(calls).toEqual([]);
    expect(s.buf).toEqual(before);
    const yard = play(s, drag(5, N(5, 1)), { hooks });
    expect(steps(yard.ev)).toEqual([
      ['pieceMoved', 1],
      ['movesChanged', 4],
      ['deadlockDetected', 12],
    ]);
    expect(calls).toEqual([1]);
  });
});
