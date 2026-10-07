import { describe, expect, it } from 'vitest';
import {
  GRAVITY_PROFILES,
  PLAN_DOT,
  PLAN_OUTSIDE,
  STEP10_TIMERS,
  compile,
  cycleLength,
  loadLevel,
  step10Timers,
} from '../../../src/core/level/compile.ts';
import { shapeById } from '../../../src/core/shapes.ts';
import { Zone } from '../../../src/core/types.ts';
import { compiledLevel, level, loadFixture } from '../../fixtures/builders.ts';

const B1: ['B1_0', 'W', number, number][] = [['B1_0', 'W', 0, 0]];

describe('compile (TECH §2.3)', () => {
  it('K-45/1 seed defaults to id × 1000 + id', () => {
    expect(compiledLevel({ id: 4, pieces: B1 }).seed).toBe(4004);
    expect(compiledLevel({ id: 4, seed: 7, pieces: B1 }).seed).toBe(7);
  });

  it('K-44 symmetric shape ids are reduced to the canonical shape', () => {
    const lvl = compiledLevel({
      pieces: [
        ['O4_270', 'W', 0, 0],
        ['D2_180', 'Y', 2, 0],
      ],
    });
    expect(lvl.pieces[0]?.shapeIndex).toBe(shapeById('O4_0').index);
    expect(lvl.pieces[1]?.shapeIndex).toBe(shapeById('D2_0').index);
    expect(lvl.pieces[0]?.dataShape).toBe('O4_270');
  });

  it('K-15 K-32 plan colours by local index with `.`, outside and resolved `?`', () => {
    const lvl = compiledLevel({
      plan: [
        ['WY', 'W.'],
        ['??', 'YW'],
      ],
      hidden: [undefined, { kind: 'mirrorOf', segment: 0 }],
      pieces: B1,
    });
    const s0 = lvl.segments[0];
    // rows top → bottom: "WY" is plan row 1, "W." row 0
    expect([...(s0?.planColors.slice(0, 4) ?? [])]).toEqual([0, PLAN_DOT, 0, 1]);
    expect(s0?.planColors[4]).toBe(PLAN_OUTSIDE);
    expect(s0?.planMask).toEqual([0b11, 0b10]);
    expect(s0?.dotMask).toEqual([0, 0b01]);
    // mirrorOf 0: (c, r) ← segment 0 (1 − c, r); row 1 of segment 0 is W Y → ? ? = Y W
    const s1 = lvl.segments[1];
    expect([...(s1?.planColors.slice(2, 4) ?? [])]).toEqual([1, 0]);
    expect(s1?.hiddenMask).toBe(0b1100);
  });

  it('K-25 piece ids: batch 0, then truck batches, then debris, then D2 help slots', () => {
    const lvl = compiledLevel({
      id: 17,
      plan: [['WW'], ['YY']],
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'Y', 1, 0],
      ],
      batches: [{ forSegment: 1, pieces: [['D2_90', 'Y', 2, 8]] }],
      debris: [['B1_0', 'W', 7, 0, 1]],
    });
    expect(lvl.pieces.map((p) => p.origin)).toEqual([
      'yard',
      'yard',
      'truck',
      'debris',
      'help',
      'help',
      'help',
      'help',
    ]);
    expect(lvl.pieces.map((p) => p.startZone)).toEqual([
      Zone.yard,
      Zone.yard,
      Zone.pending,
      Zone.site,
      Zone.gone,
      Zone.gone,
      Zone.gone,
      Zone.gone,
    ]);
    expect(lvl.staticPieceCount).toBe(4);
    expect(lvl.helpPieceCount).toBe(4); // one B1 per plan cell (K-30 D2)
    expect(lvl.batches.map((b) => b.pieceIds)).toEqual([[0, 1], [2]]);
    expect(lvl.pieces[3]?.segment).toBe(1);
  });

  it('GDD 14.1 tutorial highlight table maps piece:, piece:k and debris: to PieceIds', () => {
    const lvl = compiledLevel({
      id: 17,
      plan: [['WW'], ['YY']],
      pieces: B1,
      batches: [
        {
          forSegment: 1,
          pieces: [
            ['B1_0', 'Y', 0, 8],
            ['B1_0', 'Y', 1, 8],
          ],
        },
      ],
      debris: [['B1_0', 'W', 7, 0]],
    });
    expect(Object.fromEntries(lvl.tutorialPieceIds)).toEqual({
      'piece:0': 0,
      'piece:k1_0': 1,
      'piece:k1_1': 2,
      'debris:0': 3,
    });
  });

  it('K-19 gravity profiles: glass thresholds 4/3/2, G-H hold 700 (1400 reduced), only G-L steers', () => {
    expect(GRAVITY_PROFILES.low.glassThreshold).toBe(4);
    expect(GRAVITY_PROFILES.normal.glassThreshold).toBe(3);
    expect(GRAVITY_PROFILES.high.glassThreshold).toBe(2);
    expect(GRAVITY_PROFILES.high.holdMs).toBe(700);
    expect(GRAVITY_PROFILES.high.holdMsReduced).toBe(1400);
    expect(GRAVITY_PROFILES.normal.holdMs).toBeNull();
    expect([
      GRAVITY_PROFILES.low.steerable,
      GRAVITY_PROFILES.normal.steerable,
      GRAVITY_PROFILES.high.steerable,
    ]).toEqual([true, false, false]);
  });

  it('K-19 normal gravity has no hold limit and no steering', () => {
    const lvl = compiledLevel({ pieces: B1 });
    expect(lvl.gravity).toEqual({
      build: 'normal',
      yard: false,
      holdMs: null,
      holdMsReduced: null,
      glassThreshold: 3,
      steerable: false,
    });
  });

  it('K-35 step 10 timer order is W4, W5, S5, S6, Y4, K-40 and independent of rule order', () => {
    expect(STEP10_TIMERS.map((t) => t.id)).toEqual(['W4', 'W5', 'S5', 'S6', 'Y4', 'K-40']);
    const all = level({
      id: 40,
      mode: 'carousel',
      carouselEvery: 3,
      wall: {
        height: 8,
        gaps: [
          { type: 'slider', y: 4, size: 1, range: [4, 5] },
          { type: 'shutter', y: 0, size: 1, period: 2 },
        ],
      },
      elevator: { range: [0, 1], start: 0, dir: 1 },
      plan: [['WW'], ['WW']],
      pieces: [['B1_0', 'W', 0, 0, ['wet'], 2]],
    });
    expect(step10Timers(all).map((t) => t.id)).toEqual(['W4', 'W5', 'S5', 'S6', 'Y4', 'K-40']);
    expect(compile(all).step10.map((t) => t.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(step10Timers(level({ pieces: B1 }))).toEqual([]);
    const locked = level({
      id: 26,
      wall: { height: 6, gaps: [{ type: 'locked', y: 0, size: 2, keyId: 'a' }] },
      pieces: B1,
    });
    expect(step10Timers(locked).map((t) => t.id)).toEqual(['K-40']);
  });

  it('K-23 K-24 cycle length L is the LCM of the timed mechanics', () => {
    expect(cycleLength(level({ pieces: B1 }))).toBe(1);
    const lvl = level({
      id: 40,
      mode: 'carousel',
      carouselEvery: 2,
      plan: [['WW'], ['WW'], ['WW']],
      wall: { height: 8, gaps: [{ type: 'shutter', y: 0, size: 1, period: 2 }] },
      elevator: { range: [0, 2], start: 0, dir: 1 },
      pieces: B1,
    });
    // shutter 2·2 = 4, carousel 2·3 = 6, elevator 2·2 = 4 → 12
    expect(cycleLength(lvl)).toBe(12);
  });

  it('compiled level is frozen and buffer layout matches TECH §2.4 sections', () => {
    const lvl = compile(level({ id: 4, plan: ['WW', 'WW'], pieces: [['O4_0', 'W', 0, 0]] }));
    expect(Object.isFrozen(lvl)).toBe(true);
    expect(Object.isFrozen(lvl.pieces)).toBe(true);
    const L = lvl.layout;
    expect(L.yardOcc).toBe(18);
    expect(L.siteOcc - L.yardOcc).toBe(60);
    expect(L.filled - L.siteOcc).toBe(16);
    expect(L.pieces - L.wrongOcc).toBe(2);
    expect(L.size).toBe(L.revealed + 1);
  });

  it('K-45 loadLevel runs schema + runtime checks and refuses invalid levels', () => {
    const good = loadLevel(loadFixture('valid', 'base'));
    expect(good.ok).toBe(true);
    const badSchema = loadLevel(loadFixture('invalid', 'schema_invalid'));
    expect(badSchema.ok === false && badSchema.stage).toBe('schema');
    const badLogic = loadLevel(loadFixture('invalid', 'gap_touches_top'));
    expect(badLogic.ok === false && badLogic.stage).toBe('logic');
    // yard fill is a tool-time check, not a load-time one (TECH §8.3)
    expect(loadLevel(loadFixture('invalid', 'yard_fill_low')).ok).toBe(true);
  });
});
