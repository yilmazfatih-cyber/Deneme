import { describe, expect, it } from 'vitest';
import {
  ArraySink,
  NULL_SINK,
  applyMove,
  canonicalJson,
  eventLogHash,
  fnv1a64,
  isLevelWon,
  measureYao,
} from '../../src/core/moves.ts';
import type { EntityRef, MoveHooks, NeighborEffect, RuleContext } from '../../src/core/moves.ts';
import type { FallRules } from '../../src/core/gravity.ts';
import type { PlacementRules } from '../../src/core/placement.ts';
import {
  H,
  createInitialState,
  goalValue,
  hasFlag,
  hdr,
  pieceX,
  pieceY,
  pieceZone,
  setHdr,
} from '../../src/core/state.ts';
import { Zone } from '../../src/core/types.ts';
import type { GameEvent, PieceId } from '../../src/core/types.ts';
import { initialState } from '../fixtures/builders.ts';
import type { LevelSpec } from '../fixtures/builders.ts';
import { HAND, dragTo, expectConsistent, find, levelFile, run, types } from './moves.fixtures.ts';

/** S3-like landing hook (the real one is the obstacle plugin, Phase 3): glass breaks when d > threshold. */
const GLASS: FallRules = {
  onLanded: (s, id, fall) =>
    hasFlag(s, id, 'glass') && fall.distance > s.lvl.gravity.glassThreshold
      ? { kind: 'break', penalty: 1 }
      : { kind: 'none' },
};
/** Y8-like placement hook: mortar blocks stick on a wrong placement. */
const MORTAR: PlacementRules = {
  onPlacement: (s, id) => ({ kind: hasFlag(s, id, 'mortar') ? 'stick' : 'default' }),
};

/** Two W columns of height 2 (plan y0–y1) and four small yard blocks. */
const TWO_ROWS: LevelSpec = {
  wall: { height: 2 },
  plan: ['WW', 'WW'],
  pieces: [
    ['D2_0', 'W', 0, 0],
    ['D2_0', 'W', 1, 0],
    ['D2_0', 'Y', 2, 0],
    ['B1_0', 'W', 3, 0],
  ],
};

describe('K-35 move pipeline on the hand solutions (LEVELS §2)', () => {
  it('K-35 level 5: segment shift, truck queue and win with 5 moves left (K-22, K-25, K-26, K-28)', () => {
    const s = createInitialState(levelFile(5));
    const moves = HAND[5];
    const ran = moves.slice(0, 3).map((m) => run(s, m));
    for (const r of ran) expect(r.res.status).toBe('applied');
    expectConsistent(s);
    const third = ran[2]?.ev ?? [];
    expect(types(third)).toEqual([
      'pieceMoved',
      'pieceFell',
      'placementCorrect',
      'comboChanged',
      'movesChanged',
      'segmentCompleted',
      'goalProgress',
      'siteShifted',
      'deliveryArrived',
      'pieceFell',
      'pieceFell',
      'pieceFell',
      'deliveryQueued',
    ]);
    expect(find(third, 'segmentCompleted').seg).toBe(0);
    expect(find(third, 'siteShifted').toSeg).toBe(1);
    expect(find(third, 'goalProgress')).toMatchObject({ goal: 0, value: 1, target: 2, step: 8 });
    expect(find(third, 'deliveryArrived').pieces).toEqual([13, 14, 15]);
    expect(find(third, 'deliveryQueued').queued).toBe(1);
    // LEVELS §2: k1_0 (2,6), k1_1 (4,7), k1_2 (0,6); k1_3 waits ("Kamyonda: 1")
    expect([13, 14, 15].map((id) => [pieceX(s, id), pieceY(s, id)])).toEqual([
      [2, 6],
      [4, 7],
      [0, 6],
    ]);
    expect(pieceZone(s, 16)).toBe(Zone.queue);

    const fourth = run(s, moves[3] ?? dragTo(0, 0, 0)).ev;
    expect(find(fourth, 'deliveryArrived').pieces).toEqual([16]);
    expect([pieceX(s, 16), pieceY(s, 16), pieceZone(s, 16)]).toEqual([0, 6, Zone.yard]);
    expect(find(fourth, 'deliveryQueued').queued).toBe(0);
    run(s, moves[4] ?? dragTo(0, 0, 0));
    const last = run(s, moves[5] ?? dragTo(0, 0, 0));
    expect(last.res).toEqual({ status: 'applied', reason: null, won: true, outOfMoves: false });
    expect(find(last.ev, 'levelWon').movesLeft).toBe(5);
    expect(hdr(s, H.turn)).toBe(6);
    expect(measureYao(s)).toEqual({ overWall: 6, rail: 0, yao: 1 });
    expectConsistent(s);
  });

  it('K-35 step numbers never go down inside a move and seq counts 0, 1, 2 …', () => {
    const s = createInitialState(levelFile(5));
    for (const m of HAND[5]) {
      const { ev } = run(s, m);
      ev.forEach((e, i) => {
        expect(e.seq).toBe(i);
        if (i > 0) expect(e.step).toBeGreaterThanOrEqual((ev[i - 1] as GameEvent).step);
      });
    }
  });

  it('K-46 level 3: two over-wall placements and one rail placement → YAO 2/3 (K-12 rail entry)', () => {
    const s = createInitialState(levelFile(3));
    run(s, HAND[3][0] ?? dragTo(0, 0, 0));
    const rail = run(s, HAND[3][1] ?? dragTo(0, 0, 0)).ev;
    expect(types(rail)).toEqual(['pieceMoved', 'placementCorrect', 'comboChanged', 'movesChanged']);
    expect(find(rail, 'pieceMoved')).toMatchObject({
      entry: 'gap',
      gap: 0,
      to: { zone: 'site', x: 6, y: 2 },
    });
    expect(find(rail, 'placementCorrect').overWall).toBe(false);
    const last = run(s, HAND[3][2] ?? dragTo(0, 0, 0));
    expect(last.res.won).toBe(true);
    expect(measureYao(s)).toEqual({ overWall: 2, rail: 1, yao: 2 / 3 });
  });

  it('K-35 the event log is a pure function of state and move (eventLogHash)', () => {
    const play = (): GameEvent[] => {
      const s = createInitialState(levelFile(5));
      const sink = new ArraySink();
      for (const m of HAND[5]) applyMove(s, m, sink, { strict: true });
      return sink.events;
    };
    const a = play();
    const b = play();
    expect(b).toEqual(a);
    expect(eventLogHash(a)).toBe(eventLogHash(b));
    expect(eventLogHash(a)).toMatch(/^[0-9a-f]{16}$/);
    expect(eventLogHash(a.slice(1))).not.toBe(eventLogHash(a));
  });

  it('K-35 NULL_SINK runs the same rules without events', () => {
    const a = createInitialState(levelFile(5));
    const b = createInitialState(levelFile(5));
    for (const m of HAND[5]) {
      applyMove(a, m, NULL_SINK, { strict: true });
      run(b, m);
    }
    expect(a.buf).toEqual(b.buf);
  });
});

describe('K-07 release table and move cost (K-35 steps 0 and 4)', () => {
  it('K-07 row 1: release on the start cells cancels and changes nothing', () => {
    const s = createInitialState(levelFile(5));
    const before = s.buf.slice();
    const r = run(s, dragTo(2, 2, 6));
    expect(r.res).toEqual({ status: 'cancelled', reason: 'sameSpot', won: false, outOfMoves: false });
    expect(r.ev).toEqual([{ seq: 0, step: 0, t: 'moveCancelled', pieceId: 2, reason: 'sameSpot' }]);
    expect(s.buf).toEqual(before);
  });

  it('K-07 row 3: release over the yard with a cell in the crane area cancels at no cost (K-05)', () => {
    const s = createInitialState(levelFile(5));
    const before = s.buf.slice();
    const r = run(s, dragTo(2, 2, 8));
    expect(r.res.reason).toBe('craneOverYard');
    expect(s.buf).toEqual(before);
  });

  it('K-07 row 2: a yard move costs 1 move, m += 1, the block stays where released (K-10)', () => {
    const s = createInitialState(levelFile(5));
    const r = run(s, dragTo(2, 2, 7));
    expect(r.res.status).toBe('applied');
    expect(types(r.ev)).toEqual(['pieceMoved', 'movesChanged']);
    expect(find(r.ev, 'pieceMoved')).toMatchObject({
      step: 1,
      entry: 'yard',
      from: { zone: 'yard', x: 2, y: 6 },
      to: { zone: 'yard', x: 2, y: 7 },
    });
    expect(find(r.ev, 'movesChanged')).toMatchObject({
      step: 4,
      movesLeft: 10,
      delta: -1,
      reason: 'move',
      cost: { base: 1, glass: 0 },
    });
    expect([pieceX(s, 2), pieceY(s, 2), hdr(s, H.turn)]).toEqual([2, 7, 1]);
    expectConsistent(s);
  });

  it('K-07 costs add up (base + glass) and the counter stops at 0', () => {
    const s = initialState({ ...TWO_ROWS, pieces: [['D2_0', 'W', 0, 0, ['glass']]] });
    setHdr(s, H.movesLeft, 1);
    const r = run(s, dragTo(0, 6, 8), { hooks: { fall: GLASS } });
    expect(find(r.ev, 'movesChanged')).toMatchObject({
      movesLeft: 0,
      delta: -1,
      cost: { base: 1, glass: 1 },
    });
    expect(r.res.outOfMoves).toBe(true);
  });

  it('K-07 an invalid record (unpickable piece, unreachable node) is cancelled as invalid; strict throws', () => {
    const s = createInitialState(levelFile(5));
    const before = s.buf.slice();
    const buried = run(s, dragTo(4, 0, 6), { strict: false });
    expect(buried.ev).toEqual([{ seq: 0, step: 0, t: 'moveCancelled', pieceId: 4, reason: 'invalid' }]);
    expect(run(s, dragTo(2, 0, 0), { strict: false }).res.reason).toBe('invalid');
    expect(s.buf).toEqual(before);
    expect(() => run(s, dragTo(2, 0, 0))).toThrow(/not reachable/);
  });

  it('K-19 normal gravity: a steer in the move record is invalid (no steering, commit on release)', () => {
    const s = initialState(TWO_ROWS);
    expect(() =>
      run(s, { kind: 'drag', pieceId: 3, to: { ix: 6, iy: 8, mode: 0 }, steer: { dir: 1, atRow: 3 } }),
    ).toThrow(/steer/);
  });

  it('K-35 step 1: `via` must name a paint gate whose rail the drag can reach', () => {
    const s = createInitialState(levelFile(3));
    expect(() => run(s, { kind: 'drag', pieceId: 1, to: { ix: 6, iy: 2, mode: 1 }, via: 0 })).toThrow(/via/);
  });
});

describe('K-35 steps 2–3: fall, validation, bounce', () => {
  it('K-11 an over-wall release falls onto the silhouette: pieceFell{release} rows = d', () => {
    const s = createInitialState(levelFile(5));
    const { ev } = run(s, HAND[5][0] ?? dragTo(0, 0, 0));
    expect(find(ev, 'pieceMoved')).toMatchObject({
      entry: 'overWall',
      to: { zone: 'site', x: 6, y: 8, seg: 0 },
    });
    expect(find(ev, 'pieceFell')).toMatchObject({
      step: 2,
      cause: 'release',
      from: { zone: 'site', x: 6, y: 8 },
      to: { zone: 'site', x: 6, y: 0, seg: 0 },
      rows: 8,
    });
    expect(find(ev, 'placementCorrect')).toMatchObject({ step: 3, overWall: true });
  });

  it('K-17 a wrong placement bounces back to the start, burns 1 move and resets the streak', () => {
    const s = createInitialState(levelFile(5));
    run(s, HAND[5][0] ?? dragTo(0, 0, 0)); // b → (6,0), streak 1
    expect(hdr(s, H.combo)).toBe(1);
    const r = run(s, dragTo(3, 6, 8)); // d (D2_90 R) lands on (6,1) = W
    expect(types(r.ev)).toEqual([
      'pieceMoved',
      'pieceFell',
      'placementWrong',
      'pieceBounced',
      'comboChanged',
      'movesChanged',
    ]);
    expect(find(r.ev, 'placementWrong')).toMatchObject({ reasons: ['color'], missingSupport: [] });
    expect(find(r.ev, 'pieceBounced')).toMatchObject({
      from: { zone: 'site', x: 6, y: 1 },
      to: { zone: 'yard', x: 4, y: 6 },
      viaDrop: false,
      reason: 'color',
    });
    expect(find(r.ev, 'comboChanged').combo).toBe(0);
    expect([pieceX(s, 3), pieceY(s, 3), pieceZone(s, 3)]).toEqual([4, 6, Zone.yard]);
    expect([hdr(s, H.movesLeft), hdr(s, H.combo), hdr(s, H.wrongCount)]).toEqual([9, 0, 1]);
    expectConsistent(s);
  });

  it('K-35 step 2: a glass break returns the block, skips step 3, costs base + 1 and resets the streak', () => {
    const s = initialState({
      ...TWO_ROWS,
      pieces: [
        ['D2_0', 'W', 0, 0, ['glass']],
        ['D2_0', 'W', 1, 0],
      ],
    });
    run(s, dragTo(1, 7, 8), { hooks: { fall: GLASS } });
    expect(hdr(s, H.combo)).toBe(1);
    const r = run(s, dragTo(0, 6, 8), { hooks: { fall: GLASS } });
    expect(types(r.ev)).toEqual([
      'pieceMoved',
      'pieceFell',
      'glassBroke',
      'pieceReturned',
      'comboChanged',
      'movesChanged',
    ]);
    expect(find(r.ev, 'glassBroke')).toMatchObject({ step: 2, penalty: 1, at: { zone: 'site', x: 6, y: 0 } });
    expect(find(r.ev, 'pieceReturned')).toMatchObject({ step: 2, to: { zone: 'yard', x: 0, y: 0 } });
    expect(find(r.ev, 'movesChanged')).toMatchObject({ delta: -2, cost: { base: 1, glass: 1 } });
    expect([pieceZone(s, 0), hdr(s, H.combo), hdr(s, H.movesLeft)]).toEqual([Zone.yard, 0, 17]);
    expectConsistent(s);
  });

  it('K-35 step 3: a sticking hook keeps the block on the site; the next move of it reads MoveScratch.wasStuck', () => {
    const s = initialState({ ...TWO_ROWS, pieces: [['B1_0', 'Y', 0, 0, ['mortar']]] });
    const hooks: MoveHooks = {
      placement: MORTAR,
      moveCost: (ctx) => (ctx.scratch.wasStuck ? 2 : undefined),
    };
    const stick = run(s, dragTo(0, 6, 8), { hooks });
    expect(types(stick.ev)).toEqual([
      'pieceMoved',
      'pieceFell',
      'placementWrong',
      'mortarStuck',
      'movesChanged',
    ]);
    expect(find(stick.ev, 'mortarStuck')).toMatchObject({ reason: 'color' });
    expect([pieceZone(s, 0), hasFlag(s, 0, 'stuck'), hdr(s, H.wrongCount)]).toEqual([Zone.site, true, 1]);
    const back = run(s, dragTo(0, 3, 0), { hooks });
    expect(find(back.ev, 'movesChanged')).toMatchObject({ delta: -2, cost: { base: 2, glass: 0 } });
    expect([pieceZone(s, 0), hasFlag(s, 0, 'stuck')]).toEqual([Zone.yard, false]);
    expectConsistent(s);
  });
});

describe('K-35 steps 5–6: neighbour effects and yard gravity hooks', () => {
  /** Records every neighbour call and emits a probe event (its `step` shows where the hook ran). */
  function recorder(): { hooks: MoveHooks; calls: [EntityRef, PieceId][] } {
    const calls: [EntityRef, PieceId][] = [];
    const hooks: MoveHooks = {
      onNeighborMoved: (ctx: RuleContext, entity, moved): NeighborEffect => {
        ctx.emit({ t: 'chainReleased', pieceId: -1 });
        calls.push([entity, moved]);
        return 'affected';
      },
    };
    return { hooks, calls };
  }

  it('K-35 step 5: yard entities next to the START cells, (y, x) order, once each, never across the wall boundary', () => {
    const s = initialState({
      wall: { height: 2 },
      plan: ['WW', 'WW'],
      pieces: [
        ['D2_90', 'W', 2, 2], // 0: moved, start cells (2,2) (3,2)
        ['B1_0', 'W', 2, 1], // 1
        ['B1_0', 'W', 3, 1], // 2
        ['D2_90', 'W', 2, 3], // 3: next to both start cells → once
        ['B1_0', 'W', 5, 4], // 4
      ],
      debris: [['D2_0', 'R', 6, 0]],
      obstacles: [{ type: 'crate', x: 1, y: 2, hp: 2 }],
    });
    const { hooks, calls } = recorder();
    const r = run(s, dragTo(0, 4, 2), { hooks });
    expect(calls).toEqual([
      [{ kind: 'piece', id: 1 }, 0],
      [{ kind: 'piece', id: 2 }, 0],
      [{ kind: 'obstacle', index: 0 }, 0],
      [{ kind: 'piece', id: 3 }, 0],
    ]);
    expect(r.ev.filter((e) => e.t === 'chainReleased').every((e) => e.step === 5)).toBe(true);

    // a block at x = 5 has no neighbour on the site (x = 6), whatever is there (GDD §0)
    const t = initialState({
      wall: { height: 2 },
      plan: ['WW', 'WW'],
      pieces: [
        ['B1_0', 'W', 5, 1],
        ['B1_0', 'W', 4, 1],
      ],
      debris: [['D2_0', 'R', 6, 0]],
      obstacles: [{ type: 'crate', x: 5, y: 0, hp: 1 }],
    });
    const rec = recorder();
    run(t, dragTo(0, 5, 2), { hooks: rec.hooks });
    expect(rec.calls.map(([e]) => e)).toEqual([
      { kind: 'obstacle', index: 0 },
      { kind: 'piece', id: 1 },
    ]);
  });

  it('K-35 step 6: a block falling by yard gravity affects the neighbours of its pre-fall cells', () => {
    const s = initialState({
      wall: { height: 2 },
      plan: ['WW'],
      gravity: { yard: true },
      pieces: [
        ['B1_0', 'W', 0, 0], // 0: moved away
        ['B1_0', 'W', 0, 1], // 1: falls to (0,0)
      ],
      obstacles: [{ type: 'crate', x: 1, y: 1, hp: 1 }],
    });
    const { hooks, calls } = recorder();
    const r = run(s, dragTo(0, 2, 0), { hooks });
    expect(calls).toEqual([
      [{ kind: 'piece', id: 1 }, 0],
      [{ kind: 'obstacle', index: 0 }, 1],
    ]);
    expect(find(r.ev, 'pieceFell')).toMatchObject({
      step: 6,
      cause: 'yardGravity',
      pieceId: 1,
      from: { zone: 'yard', x: 0, y: 1 },
      to: { zone: 'yard', x: 0, y: 0 },
      rows: 1,
    });
    expectConsistent(s);
  });

  it('K-35 step 5: hidden item check #1 asks the rule once the item cell is empty', () => {
    const s = initialState({
      wall: { height: 2 },
      plan: ['WW'],
      pieces: [['B1_0', 'W', 0, 0]],
      obstacles: [{ type: 'screw', x: 0, y: 0 }],
    });
    const seen: [number, number][] = [];
    const hooks: MoveHooks = {
      onCellUncovered: (ctx, obstacle) => {
        seen.push([obstacle, hdr(ctx.s, H.turn)]);
      },
    };
    run(s, dragTo(0, 3, 0), { hooks });
    // checks #1 (step 5) and #2 (step 6) both see the empty cell; the rule marks it collected (Phase 3, Y7)
    expect(seen).toEqual([
      [0, 1],
      [0, 1],
    ]);
  });
});

describe('K-35 step 10 timers and step 12', () => {
  const TIMED: LevelSpec = {
    wall: {
      height: 6,
      gaps: [
        { type: 'shutter', y: 0, size: 1, period: 2 },
        { type: 'slider', y: 2, size: 1, range: [2, 3] },
      ],
    },
    plan: ['WW'],
    pieces: [
      ['B1_0', 'W', 0, 0, ['wet'], 3],
      ['B1_0', 'W', 3, 0],
    ],
  };

  it('K-35 step 10 timer order is W4 → W5 → Y4 → K-40 (lvl.step10, not the rule order)', () => {
    const s = initialState(TIMED);
    const order: string[] = [];
    const tick = (id: string) => (ctx: RuleContext) => {
      order.push(id);
      ctx.emit({ t: 'gapChanged', gap: order.length, open: true, y: 0 });
    };
    const r = run(s, dragTo(1, 4, 0), {
      hooks: { timers: { 'K-40': tick('K-40'), Y4: tick('Y4'), W5: tick('W5'), W4: tick('W4') } },
    });
    expect(order).toEqual(['W4', 'W5', 'Y4', 'K-40']);
    expect(r.ev.filter((e) => e.t === 'gapChanged').map((e) => e.step)).toEqual([10, 10, 10, 10]);
  });

  it('K-35 step 10: a level timer without a rule hook throws "Phase 3"', () => {
    const s = initialState(TIMED);
    expect(() => run(s, dragTo(1, 4, 0))).toThrow(/Phase 3/);
  });

  it('K-35 step 12: the deadlock hook runs once while the level goes on; never after a win, at 0 moves or with noTruckHelp', () => {
    const calls: number[] = [];
    const hooks: MoveHooks = {
      deadlock: (ctx) => {
        calls.push(hdr(ctx.s, H.turn));
        ctx.emit({ t: 'deadlockDetected', reason: 'noMoves' });
      },
    };
    const s = createInitialState(levelFile(1));
    const first = run(s, HAND[1][0] ?? dragTo(0, 0, 0), { hooks });
    expect(find(first.ev, 'deadlockDetected').step).toBe(12);
    run(s, HAND[1][1] ?? dragTo(0, 0, 0), { hooks, noTruckHelp: true });
    run(s, HAND[1][2] ?? dragTo(0, 0, 0), { hooks }); // wins
    expect(calls).toEqual([1]);

    const t = createInitialState(levelFile(1));
    setHdr(t, H.movesLeft, 1);
    const out = run(t, dragTo(1, 1, 6), { hooks }); // yard move (b → (1,6)) with the last move
    expect(out.res.outOfMoves).toBe(true);
    expect(calls).toEqual([1]);
  });
});

describe('K-28 / K-29 step 11', () => {
  it('K-28 E-01 the last move completes the last segment: won with 0 moves left, no out-of-moves', () => {
    const s = createInitialState(levelFile(1));
    run(s, HAND[1][0] ?? dragTo(0, 0, 0));
    run(s, HAND[1][1] ?? dragTo(0, 0, 0));
    setHdr(s, H.movesLeft, 1);
    const r = run(s, HAND[1][2] ?? dragTo(0, 0, 0));
    expect(r.res).toEqual({ status: 'applied', reason: null, won: true, outOfMoves: false });
    expect(find(r.ev, 'levelWon')).toMatchObject({ step: 11, movesLeft: 0 });
    expect(types(r.ev)).not.toContain('outOfMoves');
    expect(isLevelWon(s)).toBe(true);
  });

  it('K-28 a won level takes no further drag', () => {
    const s = createInitialState(levelFile(1));
    for (const m of HAND[1]) run(s, m);
    expect(() => run(s, dragTo(3, 0, 7))).toThrow(/won/);
  });

  it('K-29 the counter reaches 0 without a win: outOfMoves at step 11', () => {
    const s = createInitialState(levelFile(1));
    setHdr(s, H.movesLeft, 1);
    const r = run(s, HAND[1][0] ?? dragTo(0, 0, 0));
    expect(r.res).toEqual({ status: 'applied', reason: null, won: false, outOfMoves: true });
    expect(r.ev.at(-1)).toMatchObject({ t: 'outOfMoves', step: 11 });
  });
});

describe('K-41 goals in the pipeline', () => {
  it('E-27 the build is done but a clear goal is open: the level goes on and a site drop cancels (K-07 row 5)', () => {
    const s = initialState({
      wall: { height: 2 },
      plan: ['WW'],
      goals: [{ type: 'build' }, { type: 'clear', target: 'crate', count: 1 }],
      pieces: [
        ['D2_90', 'W', 0, 0],
        ['B1_0', 'W', 0, 1],
      ],
      obstacles: [{ type: 'crate', x: 5, y: 0, hp: 1 }],
    });
    const done = run(s, dragTo(0, 6, 8));
    expect(done.res).toEqual({ status: 'applied', reason: null, won: false, outOfMoves: false });
    expect(types(done.ev)).toContain('segmentCompleted');
    expect([goalValue(s, 0), goalValue(s, 1)]).toEqual([1, 0]);
    const closed = run(s, dragTo(1, 6, 8));
    expect(closed.res.reason).toBe('siteClosed');
    expect(closed.ev).toEqual([{ seq: 0, step: 0, t: 'moveCancelled', pieceId: 1, reason: 'siteClosed' }]);
  });

  it('K-41 step 7: debris that leaves the site counts once for `clear: debris`', () => {
    const s = initialState({
      wall: { height: 2 },
      plan: ['WW', 'WW'],
      goals: [{ type: 'build' }, { type: 'clear', target: 'debris', count: 1 }],
      pieces: [['D2_0', 'W', 0, 0]],
      debris: [['B1_0', 'R', 7, 1]],
    });
    const out = run(s, dragTo(1, 5, 2));
    expect(find(out.ev, 'pieceMoved')).toMatchObject({
      from: { zone: 'site', x: 7, y: 1, seg: 0 },
      entry: 'yard',
    });
    expect(find(out.ev, 'goalProgress')).toMatchObject({ step: 7, goal: 1, value: 1, target: 1 });
    const again = run(s, dragTo(1, 4, 2));
    expect(types(again.ev)).not.toContain('goalProgress');
    expect(goalValue(s, 1)).toBe(1);
    expectConsistent(s);
  });
});

describe('canonical JSON and FNV-1a', () => {
  it('K-35 canonicalJson sorts keys and drops undefined; fnv1a64 matches the reference vectors', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: undefined } })).toBe(
      '{"a":{"d":[2,{"y":2,"z":1}]},"b":1}',
    );
    expect(fnv1a64('')).toBe('cbf29ce484222325');
    expect(fnv1a64('a')).toBe('af63dc4c8601ec8c');
    expect(fnv1a64('foobar')).toBe('85944171f73967e8');
    expect(fnv1a64('ı')).not.toBe(fnv1a64('i'));
  });
});
