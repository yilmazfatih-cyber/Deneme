import { describe, expect, it, vi } from 'vitest';
import {
  computeFall,
  settleYard,
  shadowInfo,
  siteColumnMasks,
  siteLandingRow,
  yardBalloonLanding,
} from '../../src/core/gravity.ts';
import type { FallPlan, FallRules, FallenBlock } from '../../src/core/gravity.ts';
import { isCorrectPlacement } from '../../src/core/placement.ts';
import { FREE, blockCells, railMode, tryBeginDrag } from '../../src/core/movement.ts';
import {
  H,
  OF,
  PF,
  cloneState,
  hasFlag,
  hdr,
  obstacleField,
  pieceShape,
  pieceY,
  setFlag,
  setObstacleField,
  setPieceField,
  setYardOcc,
  siteOcc,
  yardOcc,
} from '../../src/core/state.ts';
import type { GameState } from '../../src/core/state.ts';
import { occupyPiece, refreshSiteMasks, stateInvariantErrors, vacatePiece } from '../../src/core/grid.ts';
import { neighbors4 } from '../../src/core/coords.ts';
import { shapeById, shapeByIndex } from '../../src/core/shapes.ts';
import { mulberry32 } from '../../src/core/rng.ts';
import { Zone } from '../../src/core/types.ts';
import type { At, DragNode, PieceId, ShapeId } from '../../src/core/types.ts';
import { compiledLevel, initialState } from '../fixtures/builders.ts';
import type { PieceSpec } from '../fixtures/builders.ts';

// --- helpers ---------------------------------------------------------------------------------------------------------

const N = (ix: number, iy: number): DragNode => ({ ix, iy, mode: FREE });
const R = (g: number, ix: number, iy: number): DragNode => ({ ix, iy, mode: railMode(g) });
const site = (x: number, y: number, seg = 0): At => ({ zone: 'site', x, y, seg });

/** Puts a piece on segment 0 of the site at global column x / plan row y. */
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

/** Takes a piece off the board (as if it had been moved away). */
function remove(s: GameState, id: PieceId): void {
  vacatePiece(s, id);
  setPieceField(s, id, PF.zone, Zone.gone);
}

/** S3-like hook (the real one is the obstacle plugin): glass breaks when d > the level's threshold. */
const GLASS_RULES: FallRules = {
  onLanded: (s, id, fall) =>
    hasFlag(s, id, 'glass') && fall.distance > s.lvl.gravity.glassThreshold
      ? { kind: 'break', penalty: 1 }
      : { kind: 'none' },
};
/** S8-like hook: balloon blocks rise. */
const BALLOON_RULES: FallRules = {
  modifyFall: (s, id, plan) => (hasFlag(s, id, 'balloon') ? { ...plan, dir: 1 } : plan),
};
/** W8-like hook, wind to the right: width-1 blocks with d ≥ 1 drift (E-17). */
const WIND_RIGHT: FallRules = {
  modifyFall: (s, id, plan) => {
    const w = shapeByIndex(pieceShape(s, id)).w;
    const d = Math.abs(plan.iy - siteLandingRow(s, id, plan.ix, plan.iy, plan.dir));
    return w === 1 && d >= 1 ? { ...plan, drift: 1 } : plan;
  },
};

// --- K-11 ------------------------------------------------------------------------------------------------------------

describe('K-11 over-the-wall drop and landing', () => {
  it('K-11 GDD example: D2_90 dropped from the crane area lands at (6,0) with d = 8; lowered to (6,1), d = 1', () => {
    const s = initialState({ plan: ['WW', 'WW', 'WW'], pieces: [['D2_90', 'W', 0, 0]] });
    const high = computeFall(s, 0, N(6, 8));
    expect(high).toMatchObject({ mode: 'free', landing: { ix: 6, iy: 0 }, dir: -1, distance: 8, drift: 0 });
    expect(high.path).toEqual([
      { ix: 6, iy: 8 },
      { ix: 6, iy: 0 },
    ]);
    expect(high.cells).toEqual([
      { x: 6, y: 0 },
      { x: 7, y: 0 },
    ]);
    expect(computeFall(s, 0, N(6, 1)).distance).toBe(1);
    expect(computeFall(s, 0, N(6, 0)).distance).toBe(0);
  });

  it('K-11 the landing uses each covered column (C3_180 over an uneven silhouette)', () => {
    const s = initialState({
      plan: ['WW', 'WW', 'WW', 'WW'],
      pieces: [
        ['D2_0', 'W', 0, 0],
        ['C3_180', 'W', 2, 0],
      ],
    });
    toSite(s, 0, 6, 0); // top(6) = 2, top(7) = 0
    // C3_180 = (1,0) (0,1) (1,1): column 6 bottom offset 1, column 7 bottom offset 0 → max(2 − 1, 0 − 0) = 1
    const fall = computeFall(s, 1, N(6, 8));
    expect(fall.landing).toEqual({ ix: 6, iy: 1 });
    expect(fall.cells).toEqual([
      { x: 7, y: 1 },
      { x: 6, y: 2 },
      { x: 7, y: 2 },
    ]);
  });

  it('K-11 the elevator platform is support: a fall stops on the frame floor (K-24)', () => {
    const s = initialState({
      id: 37,
      plan: ['WW', 'WW'],
      elevator: { range: [0, 2], start: 2, dir: 1 },
      pieces: [['B1_0', 'W', 0, 0]],
    });
    expect(siteColumnMasks(s)).toEqual([0b11, 0b11]);
    const fall = computeFall(s, 0, N(6, 8));
    expect(fall.landing).toEqual({ ix: 6, iy: 2 });
    expect(fall.verdict.ok).toBe(true);
  });

  it('K-11 every reachable FREE site release lands where a step-by-step fall stops (seeded boards)', () => {
    const shapes: ShapeId[] = ['B1_0', 'D2_0', 'D2_90', 'O4_0', 'C3_0', 'C3_90', 'C3_180', 'C3_270', 'L4_0'];
    const rng = mulberry32(611);
    let checked = 0;
    for (let round = 0; round < 100; round++) {
      const shape = shapes[rng.nextInt(shapes.length)] ?? 'B1_0';
      const blockers: PieceSpec[] = [];
      for (let i = 0; i < 6; i++) blockers.push(['B1_0', 'W', i, 0]);
      const s = initialState({
        plan: ['WW', 'WW', 'WW', 'WW', 'WW', 'WW', 'WW', 'WW'],
        pieces: [[shape, 'W', 0, 4], ...blockers],
      });
      // random site cells (not necessarily supported: the fall physics must not care)
      const used = new Set<string>();
      for (let i = 1; i <= 6; i++) {
        const x = 6 + rng.nextInt(2);
        const y = rng.nextInt(8);
        if (used.has(`${x},${y}`)) {
          remove(s, i);
          continue;
        }
        used.add(`${x},${y}`);
        toSite(s, i, x, y, { locked: rng.nextInt(2) === 0, stuck: false });
      }
      const attempt = tryBeginDrag(s, 0);
      if (!attempt.ok) continue;
      const before = s.buf.slice();
      const def = shapeById(shape);
      for (const node of attempt.session.reachableNodes()) {
        if (node.mode !== FREE || node.ix < 6) continue;
        const fall = computeFall(s, 0, node);
        let y = node.iy;
        const free = (c: { x: number; y: number }) => c.y >= 8 || siteOcc(s, 0, c.x - 6, c.y) === 0;
        while (y > 0 && blockCells(def, node.ix, y - 1).every(free)) y--;
        expect(fall.landing).toEqual({ ix: node.ix, iy: y });
        expect(fall.distance).toBe(node.iy - y);
        expect(fall.verdict).toEqual(isCorrectPlacement(s, 0, blockCells(def, node.ix, y)));
        checked++;
      }
      expect(s.buf).toEqual(before); // computeFall is pure
    }
    expect(checked).toBeGreaterThan(200);
  });
});

// --- K-18 ------------------------------------------------------------------------------------------------------------

describe('K-18 fall shadow', () => {
  it('K-18 on the rail the shadow is the block itself: no fall, no hooks, no glass break', () => {
    const s = initialState({
      wall: { height: 4, gaps: [{ type: 'static', y: 2, size: 1 }] },
      plan: ['WW', 'WW', 'WW'],
      pieces: [['D2_90', 'W', 4, 2, ['glass']]],
    });
    const modifyFall = vi.fn((_s: GameState, _id: PieceId, plan: FallPlan) => plan);
    const fall = computeFall(s, 0, R(0, 6, 2), { rules: { ...GLASS_RULES, modifyFall } });
    expect(fall).toMatchObject({
      mode: 'rail',
      landing: { ix: 6, iy: 2 },
      distance: 0,
      effect: { kind: 'none' },
    });
    expect(fall.path).toEqual([{ ix: 6, iy: 2 }]);
    expect(fall.verdict.reasons).toEqual(['support']);
    expect(modifyFall).not.toHaveBeenCalled();
  });

  const colourSpec = {
    difficulty: 'easy' as const,
    plan: ['WW', 'WY', 'WW', 'WW', 'WW'],
    pieces: [
      ['I3_0', 'W', 0, 0],
      ['I3_0', 'W', 1, 0],
      ['C3_0', 'W', 2, 0],
    ] as PieceSpec[],
  };

  it('K-18 GDD example: C3_0 W landing with (7,3) on a Y cell is wrong (colour) on easy, position only on hard', () => {
    const s = initialState(colourSpec);
    toSite(s, 0, 6, 0);
    toSite(s, 1, 7, 0);
    const fall = computeFall(s, 2, N(6, 8));
    expect(fall.landing).toEqual({ ix: 6, iy: 3 });
    expect(fall.verdict.reasons).toEqual(['color']);
    expect(shadowInfo(fall, 'easy')).toEqual({
      tone: 'wrong',
      reasons: ['color'],
      missingSupport: [],
      breaks: false,
    });
    expect(shadowInfo(fall, 'normal').tone).toBe('wrong');
    expect(shadowInfo(fall, 'hard')).toEqual({
      tone: 'neutral',
      reasons: [],
      missingSupport: [],
      breaks: false,
    });
    expect(shadowInfo(fall, 'superhard').tone).toBe('neutral');
  });

  it('K-18 neutral shadow never leaks color; support may show (K-34 hook 2)', () => {
    const s = initialState({
      plan: ['YY', 'WW', 'WW'],
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['O4_0', 'W', 2, 0],
      ],
    });
    toSite(s, 0, 6, 0);
    // O4 W lands at (6,1): (6,2)/(7,2) are Y (colour) and (7,0) is empty (support)
    const fall = computeFall(s, 1, N(6, 8));
    expect(fall.verdict.reasons).toEqual(['color', 'support']);
    for (const difficulty of ['hard', 'superhard'] as const) {
      const shown = shadowInfo(fall, difficulty);
      expect(shown.tone).toBe('neutral');
      expect(shown.reasons).toEqual(['support']);
      expect(shown.missingSupport).toEqual([site(7, 0)]);
    }
    expect(shadowInfo(fall, 'easy').reasons).toEqual(['color', 'support']);
  });

  it('E-20 a landing on an unrevealed `?` cell is neutral at every difficulty; once revealed it is not', () => {
    const s = initialState({
      plan: ['??', 'WY'],
      hidden: [{ kind: 'repeat', period: 1 }],
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'Y', 1, 0],
        ['B1_0', 'Y', 2, 0],
      ],
    });
    toSite(s, 0, 6, 0);
    toSite(s, 1, 7, 0);
    const fall = computeFall(s, 2, N(6, 8));
    expect(fall.landing).toEqual({ ix: 6, iy: 1 });
    expect(fall.touchesHidden).toBe(true);
    expect(fall.verdict.reasons).toEqual(['color']); // E-20: wrong colour on a hidden cell is a wrong placement
    for (const difficulty of ['easy', 'normal', 'hard', 'superhard'] as const)
      expect(shadowInfo(fall, difficulty)).toEqual({
        tone: 'neutral',
        reasons: [],
        missingSupport: [],
        breaks: false,
      });
    s.buf[s.lvl.layout.revealed] = 0b0100; // (6,1) revealed
    expect(computeFall(s, 2, N(6, 8)).touchesHidden).toBe(false);
  });

  it('K-18 physics information (glass crack) shows at every difficulty, also in a neutral shadow', () => {
    const s = initialState({ difficulty: 'hard', plan: ['WW'], pieces: [['B1_0', 'W', 0, 0, ['glass']]] });
    const fall = computeFall(s, 0, N(6, 8), { rules: GLASS_RULES });
    expect(fall.effect).toEqual({ kind: 'break', penalty: 1 });
    expect(shadowInfo(fall, s.lvl.difficulty)).toEqual({
      tone: 'neutral',
      reasons: [],
      missingSupport: [],
      breaks: true,
    });
  });

  it('K-18 computeFall only accepts a release node fully on the site', () => {
    const s = initialState({ plan: ['WW'], pieces: [['D2_90', 'W', 0, 0]] });
    expect(() => computeFall(s, 0, N(5, 8))).toThrow(RangeError);
    expect(() => computeFall(s, 0, N(2, 2))).toThrow(RangeError);
    expect(() => computeFall(s, 0, N(7, 8))).toThrow(RangeError);
  });
});

// --- K-19 ------------------------------------------------------------------------------------------------------------

describe('K-19 build gravity', () => {
  it('K-19 normal gravity has no hold limit and no steering', () => {
    const s = initialState({ plan: ['WW'], pieces: [['B1_0', 'W', 0, 0]] });
    expect(s.lvl.gravity).toMatchObject({
      build: 'normal',
      holdMs: null,
      holdMsReduced: null,
      steerable: false,
      glassThreshold: 3,
    });
    const seen: FallPlan[] = [];
    const rules: FallRules = {
      modifyFall: (_s, _id, plan) => {
        seen.push(plan);
        return plan;
      },
    };
    const plain = computeFall(s, 0, N(6, 8));
    const steered = computeFall(s, 0, N(6, 8), { steer: { dir: 1, atRow: 4 }, rules });
    expect(steered.steered).toBeNull();
    expect(steered.landing).toEqual(plain.landing);
    expect(steered.path).toEqual(plain.path);
    expect(seen[0]?.steer).toBeUndefined();
  });

  it('K-19 profiles: glass threshold low 4 / normal 3 / high 2; G-H hold 700 ms (1400 reduced)', () => {
    const pieces: PieceSpec[] = [['B1_0', 'W', 0, 0]];
    expect(compiledLevel({ pieces, gravity: { build: 'low' } }).gravity).toMatchObject({
      glassThreshold: 4,
      steerable: true,
      holdMs: null,
    });
    expect(compiledLevel({ pieces, gravity: { build: 'high' } }).gravity).toMatchObject({
      glassThreshold: 2,
      steerable: false,
      holdMs: 700,
      holdMsReduced: 1400,
    });
  });

  it('K-19 glass breaks only when d > threshold (OBSTACLES S3 example: normal, d = 5 breaks, d = 3 holds)', () => {
    const s = initialState({
      plan: ['WW', 'WW', 'WW', 'WW', 'WW'],
      pieces: [
        ['I3_0', 'W', 0, 0],
        ['I3_0', 'W', 1, 0],
        ['D2_90', 'W', 2, 0, ['glass']],
      ],
    });
    toSite(s, 0, 6, 0);
    toSite(s, 1, 7, 0);
    const high = computeFall(s, 2, N(6, 8), { rules: GLASS_RULES });
    expect([high.landing, high.distance, high.effect]).toEqual([
      { ix: 6, iy: 3 },
      5,
      { kind: 'break', penalty: 1 },
    ]);
    const low = computeFall(s, 2, N(6, 6), { rules: GLASS_RULES });
    expect([low.distance, low.effect]).toEqual([3, { kind: 'none' }]);
  });

  /** GDD K-19 example board (low): (6,0)–(6,1) and (7,0)–(7,1) filled, (7,2) empty `.`, (7,3) a rail block. */
  function steerBoard(): GameState {
    const s = initialState({
      gravity: { build: 'low' },
      plan: ['WW', 'W.', 'WW', 'WW'],
      pieces: [
        ['D2_0', 'W', 0, 0],
        ['D2_0', 'W', 1, 0],
        ['B1_0', 'W', 2, 0],
        ['B1_0', 'W', 3, 0],
      ],
    });
    toSite(s, 0, 6, 0);
    toSite(s, 1, 7, 0);
    toSite(s, 2, 7, 3);
    return s;
  }

  it('K-19 G-L GDD example: steer right at row 5 lands on the overhang; at row 2 it slides under it', () => {
    const s = steerBoard();
    expect(computeFall(s, 3, N(6, 8)).landing).toEqual({ ix: 6, iy: 2 });
    const over = computeFall(s, 3, N(6, 8), { steer: { dir: 1, atRow: 5 } });
    expect(over.steered).toEqual({ dir: 1, atRow: 5 });
    expect(over.landing).toEqual({ ix: 7, iy: 4 });
    expect(over.path).toEqual([
      { ix: 6, iy: 8 },
      { ix: 6, iy: 5 },
      { ix: 7, iy: 5 },
      { ix: 7, iy: 4 },
    ]);
    expect(over.distance).toBe(4); // K-19 rule 5: total fall from the release row
    const under = computeFall(s, 3, N(6, 8), { steer: { dir: 1, atRow: 2 } });
    expect(under.landing).toEqual({ ix: 7, iy: 2 });
    expect(under.verdict.reasons).toEqual(['window']); // access is the rule's, correctness is K-16/K-34's
  });

  it('K-19 G-L invalid steer does not consume the right (edge, outside the window rows)', () => {
    const s = steerBoard();
    for (const steer of [
      { dir: -1 as const, atRow: 5 }, // column 5 is not on the site
      { dir: 1 as const, atRow: 3 }, // (7,3) is occupied
      { dir: 1 as const, atRow: 9 }, // above the release row
      { dir: 1 as const, atRow: 1 }, // below the unsteered landing row
    ]) {
      const fall = computeFall(s, 3, N(6, 8), { steer });
      expect(fall.steered).toBeNull();
      expect(fall.landing).toEqual({ ix: 6, iy: 2 });
    }
  });

  it('K-19 G-L steer of 1×2 piece blocked by occupied upper cell', () => {
    const s = initialState({
      gravity: { build: 'low' },
      plan: ['WW', 'WW', 'WW', 'WW', 'WW', 'WW'],
      pieces: [['D2_0', 'W', 0, 0]],
      debris: [['B1_0', 'R', 7, 4]],
    });
    // D2_0 falls in column 6; at row 3 the shifted cells are (7,3) empty and (7,4) debris → no shift
    const blocked = computeFall(s, 0, N(6, 8), { steer: { dir: 1, atRow: 3 } });
    expect(blocked.steered).toBeNull();
    expect(blocked.landing).toEqual({ ix: 6, iy: 0 });
    const free = computeFall(s, 0, N(6, 8), { steer: { dir: 1, atRow: 6 } });
    expect(free.steered).toEqual({ dir: 1, atRow: 6 });
    expect(free.landing).toEqual({ ix: 7, iy: 5 });
  });
});

// --- wind (W8 via a rule hook) and balloon (S8 via a rule hook) ---------------------------------------------------------

describe('K-11 fall order: wind → fall/rise → steering', () => {
  /** OBSTACLES W8 example: top(6) = 2, top(7) = 3. */
  function windBoard(): GameState {
    const s = initialState({
      plan: ['WW', 'WW', 'WW', 'WW', 'WW'],
      pieces: [
        ['D2_0', 'W', 0, 0],
        ['I3_0', 'W', 1, 0],
        ['B1_0', 'W', 2, 0],
      ],
    });
    toSite(s, 0, 6, 0);
    toSite(s, 1, 7, 0);
    return s;
  }

  it('K-11 wind shifts the block at the release row before it falls (OBSTACLES W8 example)', () => {
    const fall = computeFall(windBoard(), 2, N(6, 7), { rules: WIND_RIGHT });
    expect(fall.drift).toBe(1);
    expect(fall.landing).toEqual({ ix: 7, iy: 3 });
    expect(fall.path).toEqual([
      { ix: 6, iy: 7 },
      { ix: 7, iy: 7 },
      { ix: 7, iy: 3 },
    ]);
  });

  it('E-17 no wind shift when the block already rests on the silhouette (d = 0)', () => {
    const fall = computeFall(windBoard(), 2, N(6, 2), { rules: WIND_RIGHT });
    expect(fall.drift).toBe(0);
    expect(fall.landing).toEqual({ ix: 6, iy: 2 });
  });

  it('K-11 the core ignores a wind shift off the site or into a blocked cell', () => {
    const always: FallRules = { modifyFall: (_s, _id, plan) => ({ ...plan, drift: -1 }) };
    expect(computeFall(windBoard(), 2, N(6, 7), { rules: always }).drift).toBe(0);
    const right: FallRules = { modifyFall: (_s, _id, plan) => ({ ...plan, drift: 1 }) };
    expect(computeFall(windBoard(), 2, N(6, 2), { rules: right }).drift).toBe(0); // (7,2) is filled
  });

  /** OBSTACLES S8 example: plan h = 6, column 7 rows 0–3 filled, (7,4) `.`, (7,5) W empty. */
  function balloonBoard(): GameState {
    const s = initialState({
      plan: ['WW', 'W.', 'WW', 'WW', 'WW', 'WW'],
      pieces: [
        ['I4_0', 'W', 0, 0],
        ['B1_0', 'W', 1, 0, ['balloon']],
        ['B1_0', 'W', 2, 0],
      ],
    });
    toSite(s, 0, 7, 0);
    return s;
  }

  it('K-34 balloon obeys support rule (OBSTACLES S8 example: the balloon hangs at (7,5), a plain block falls into `.`)', () => {
    const s = balloonBoard();
    const balloon = computeFall(s, 1, N(7, 8), { rules: BALLOON_RULES });
    expect(balloon).toMatchObject({ dir: 1, landing: { ix: 7, iy: 5 }, distance: -3 });
    expect(balloon.verdict.ok).toBe(true);
    const plain = computeFall(s, 2, N(7, 8), { rules: BALLOON_RULES });
    expect(plain.landing).toEqual({ ix: 7, iy: 4 });
    expect(plain.verdict.reasons).toEqual(['window']);
  });

  it('E-15 a free balloon rises to the plan ceiling; E-35 released above the ceiling it comes down to it', () => {
    const s = balloonBoard();
    const up = computeFall(s, 1, N(6, 0), { rules: BALLOON_RULES });
    expect([up.landing, up.distance]).toEqual([{ ix: 6, iy: 5 }, 5]);
    const down = computeFall(s, 1, N(6, 9), { rules: BALLOON_RULES });
    expect([down.landing, down.distance]).toEqual([{ ix: 6, iy: 5 }, -4]);
    expect(siteLandingRow(s, 1, 6, 9, 1)).toBe(5);
  });

  it('E-15 a balloon over a silhouette that reaches the ceiling stays on top of it (outside)', () => {
    const s = initialState({
      plan: ['WW', 'WW', 'WW', 'WW', 'WW', 'WW'],
      pieces: [
        ['I4_0', 'W', 0, 0],
        ['D2_0', 'W', 1, 0],
        ['B1_0', 'W', 2, 0, ['balloon']],
      ],
    });
    toSite(s, 0, 7, 0);
    toSite(s, 1, 7, 4);
    const fall = computeFall(s, 2, N(7, 8), { rules: BALLOON_RULES });
    expect(fall.landing).toEqual({ ix: 7, iy: 6 });
    expect(fall.verdict.reasons[0]).toBe('outside');
  });

  it('E-15 the balloon ceiling follows the elevator offset (h + e − 1)', () => {
    const s = initialState({
      id: 38,
      plan: ['WW', 'WW'],
      elevator: { range: [0, 2], start: 2, dir: 1 },
      pieces: [['B1_0', 'W', 0, 0, ['balloon']]],
    });
    expect(computeFall(s, 0, N(6, 9), { rules: BALLOON_RULES }).landing).toEqual({ ix: 6, iy: 3 });
  });

  it('K-19 G-L steering a balloon: rising under an overhang stops beneath it; above the ceiling it comes down', () => {
    const s = initialState({
      gravity: { build: 'low' },
      plan: ['WW', 'WW', 'WW', 'WW', 'WW', 'WW'],
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'W', 1, 0, ['balloon']],
      ],
    });
    toSite(s, 0, 7, 4);
    const rising = computeFall(s, 1, N(6, 0), { rules: BALLOON_RULES, steer: { dir: 1, atRow: 2 } });
    expect(rising.steered).toEqual({ dir: 1, atRow: 2 });
    expect(rising.landing).toEqual({ ix: 7, iy: 3 });
    const sinking = computeFall(s, 1, N(6, 9), { rules: BALLOON_RULES, steer: { dir: 1, atRow: 7 } });
    expect(sinking.landing).toEqual({ ix: 7, iy: 5 });
  });

  it('E-14 a balloon released in the yard rises under the first block above, else to y = 7', () => {
    const s = initialState({
      plan: ['WW'],
      pieces: [
        ['B1_0', 'W', 2, 1, ['balloon']],
        ['B1_0', 'W', 2, 5],
        ['D2_0', 'W', 4, 0, ['balloon']],
      ],
    });
    expect(yardBalloonLanding(s, 0, 2, 1)).toBe(4);
    expect(yardBalloonLanding(s, 0, 3, 1)).toBe(7);
    expect(yardBalloonLanding(s, 2, 4, 0)).toBe(6);
  });
});

// --- K-20 yard gravity -------------------------------------------------------------------------------------------------

describe('K-20 yard gravity (K-35 step 6)', () => {
  it('K-20 GDD example: a D2_90 resting on (3,1) holds; without it, the D2_90 and the B1 above fall 2 rows together', () => {
    const base: PieceSpec[] = [
      ['D2_0', 'W', 2, 0],
      ['D2_90', 'Y', 2, 2],
      ['B1_0', 'G', 2, 3],
    ];
    const held = initialState({ gravity: { yard: true }, pieces: [...base, ['D2_0', 'R', 3, 0]] });
    remove(held, 0);
    expect(settleYard(held)).toEqual([]);

    const s = initialState({ gravity: { yard: true }, pieces: base });
    remove(s, 0);
    const fallen: FallenBlock[][] = [];
    const motions = settleYard(s, {
      onFallen: (_s, f) => {
        fallen.push([...f]);
        return false;
      },
    });
    expect(motions).toEqual([
      { kind: 'piece', id: 1, from: { ix: 2, iy: 2 }, to: { ix: 2, iy: 0 }, dy: -2 },
      { kind: 'piece', id: 2, from: { ix: 2, iy: 3 }, to: { ix: 2, iy: 1 }, dy: -2 },
    ]);
    expect(fallen).toEqual([
      [
        {
          pieceId: 1,
          cells: [
            { x: 2, y: 2 },
            { x: 3, y: 2 },
          ],
        },
        { pieceId: 2, cells: [{ x: 2, y: 3 }] },
      ],
    ]);
    expect(stateInvariantErrors(s)).toEqual([]);
  });

  it('K-10 GDD example: yard gravity off leaves a dropped O4 hanging; on, it falls 2 rows to (4,4)', () => {
    const pieces: PieceSpec[] = [
      ['I4_0', 'W', 4, 0],
      ['I4_0', 'W', 5, 0],
      ['O4_0', 'Y', 4, 6],
    ];
    const off = initialState({ pieces });
    expect(settleYard(off)).toEqual([]);
    const on = initialState({ gravity: { yard: true }, pieces });
    expect(settleYard(on)).toEqual([
      { kind: 'piece', id: 2, from: { ix: 4, iy: 6 }, to: { ix: 4, iy: 4 }, dy: -2 },
    ]);
    expect(stateInvariantErrors(on)).toEqual([]);
  });

  it('K-20 crates never fall and support blocks; chained, wet and heavy blocks fall too (N27)', () => {
    const s = initialState({
      id: 12,
      gravity: { yard: true },
      pieces: [
        ['B1_0', 'W', 1, 4],
        ['B1_0', 'W', 3, 5, ['chained']],
        ['B1_0', 'W', 4, 6, ['wet'], 3],
        ['I3_90', 'W', 0, 7],
      ],
      obstacles: [{ type: 'crate', x: 1, y: 3, hp: 2 }],
    });
    const motions = settleYard(s);
    expect(motions.map((m) => [m.id, m.to])).toEqual([
      [1, { ix: 3, iy: 0 }],
      [2, { ix: 4, iy: 0 }],
      [3, { ix: 0, iy: 5 }],
    ]);
    expect(yardOcc(s, 1, 3)).toBe(-1);
    expect(pieceY(s, 0)).toBe(4);
    expect(stateInvariantErrors(s)).toEqual([]);
  });

  it('E-33 falling block lands on a rising balloon without a gap', () => {
    const s = initialState({
      gravity: { yard: true },
      pieces: [
        ['B1_0', 'W', 0, 4, ['balloon']],
        ['B1_0', 'Y', 0, 6],
        ['B1_0', 'R', 0, 7],
      ],
    });
    expect(settleYard(s)).toEqual([
      { kind: 'piece', id: 1, from: { ix: 0, iy: 6 }, to: { ix: 0, iy: 5 }, dy: -1 },
      { kind: 'piece', id: 2, from: { ix: 0, iy: 7 }, to: { ix: 0, iy: 6 }, dy: -1 },
    ]);
    expect(pieceY(s, 0)).toBe(4);
  });

  it('K-20 balloons rise to the yard ceiling (y = 7); stacked balloons rise together', () => {
    const s = initialState({
      gravity: { yard: true },
      pieces: [
        ['B1_0', 'W', 3, 2, ['balloon']],
        ['B1_0', 'W', 4, 0, ['balloon']],
        ['B1_0', 'W', 4, 1, ['balloon']],
        ['I4_0', 'W', 5, 0],
      ],
    });
    expect(settleYard(s)).toEqual([
      { kind: 'piece', id: 1, from: { ix: 4, iy: 0 }, to: { ix: 4, iy: 6 }, dy: 6 },
      { kind: 'piece', id: 2, from: { ix: 4, iy: 1 }, to: { ix: 4, iy: 7 }, dy: 6 },
      { kind: 'piece', id: 0, from: { ix: 3, iy: 2 }, to: { ix: 3, iy: 7 }, dy: 5 },
    ]);
    expect(stateInvariantErrors(s)).toEqual([]);
  });

  it('K-20 cement bags fall even with yard gravity off (S-12); a falling bag gives no neighbour effect (N26)', () => {
    const s = initialState({
      id: 18,
      pieces: [['B1_0', 'W', 2, 5]],
      obstacles: [{ type: 'cement_bag', x: 4, y: 5 }],
    });
    const onFallen = vi.fn(() => false);
    expect(settleYard(s, { onFallen })).toEqual([
      { kind: 'bag', id: 0, from: { ix: 4, iy: 5 }, to: { ix: 4, iy: 0 }, dy: -5 },
    ]);
    expect([yardOcc(s, 4, 5), yardOcc(s, 4, 0), yardOcc(s, 2, 5)]).toEqual([0, -1, 1]);
    expect(onFallen).not.toHaveBeenCalled();
  });

  it('E-12 gravity runs again after a fall effect removes an obstacle; one motion per block', () => {
    const s = initialState({
      id: 12,
      gravity: { yard: true },
      pieces: [
        ['B1_0', 'W', 0, 3],
        ['B1_0', 'Y', 1, 4],
        ['B1_0', 'G', 1, 7],
      ],
      obstacles: [{ type: 'crate', x: 1, y: 3, hp: 1 }],
    });
    const calls: number[][] = [];
    // neighbour effect of the falls: a crate next to a pre-fall cell loses its last hp and vanishes
    const onFallen = (st: GameState, fallen: readonly FallenBlock[]): boolean => {
      calls.push(fallen.map((f) => f.pieceId));
      let changed = false;
      for (const f of fallen)
        for (const c of f.cells)
          for (const n of neighbors4(c.x, c.y)) {
            if (n.ix > 5 || yardOcc(st, n.ix, n.iy) !== -1) continue;
            setYardOcc(st, n.ix, n.iy, 0);
            setObstacleField(st, 0, OF.hp, 0);
            changed = true;
          }
      return changed;
    };
    const motions = settleYard(s, { onFallen });
    expect(calls).toEqual([
      [0, 2],
      [1, 2],
    ]);
    expect(motions).toEqual([
      { kind: 'piece', id: 0, from: { ix: 0, iy: 3 }, to: { ix: 0, iy: 0 }, dy: -3 },
      { kind: 'piece', id: 1, from: { ix: 1, iy: 4 }, to: { ix: 1, iy: 0 }, dy: -4 },
      { kind: 'piece', id: 2, from: { ix: 1, iy: 7 }, to: { ix: 1, iy: 1 }, dy: -6 },
    ]);
    expect(obstacleField(s, 0, OF.hp)).toBe(0);
    expect(stateInvariantErrors(s)).toEqual([]);
  });

  it('K-14 locked site blocks never move with yard gravity; settling is deterministic', () => {
    const s = initialState({
      gravity: { yard: true },
      plan: ['WW', 'WW', 'WW'],
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['D2_90', 'W', 2, 4],
        ['B1_0', 'W', 1, 6, ['balloon']],
      ],
    });
    toSite(s, 0, 7, 2); // a floating locked block (no site gravity, TECH §5.4)
    const copy = cloneState(s);
    const a = settleYard(s);
    const b = settleYard(copy);
    expect(a).toEqual(b);
    expect(s.buf).toEqual(copy.buf);
    expect(hdr(s, H.turn)).toBe(0);
    expect(siteOcc(s, 0, 1, 2)).toBe(1);
    expect(a.map((m) => m.id)).toEqual([1, 2]);
  });
});
