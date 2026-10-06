import { describe, expect, it } from 'vitest';
import {
  GameSession,
  MAX_OFFERS,
  OFFER_MOVES,
  RULES_VERSION,
  ReplayError,
  levelHash,
} from '../../src/core/session.ts';
import { ArraySink } from '../../src/core/moves.ts';
import type { MoveHooks } from '../../src/core/moves.ts';
import { buildFront } from '../../src/core/placement.ts';
import { tryBeginDrag } from '../../src/core/movement.ts';
import { mulberry32 } from '../../src/core/rng.ts';
import {
  FLAG_BIT,
  PF,
  H,
  STATE_FLAG,
  hdr,
  pieceField,
  pieceX,
  pieceY,
  pieceZone,
  queueIds,
  setHdr,
} from '../../src/core/state.ts';
import { Zone } from '../../src/core/types.ts';
import type { Move, SessionAction } from '../../src/core/types.ts';
import { compiledLevel } from '../fixtures/builders.ts';
import type { LevelSpec } from '../fixtures/builders.ts';
import { HAND, dragTo, expectConsistent, find, levelFile } from './moves.fixtures.ts';

/** Four W rows, four W dominoes, a Y single (wrong anywhere) and a W single that shuttles in the yard. */
const SHUTTLE: LevelSpec = {
  moves: 12,
  wall: { height: 2 },
  plan: ['WW', 'WW', 'WW', 'WW'],
  pieces: [
    ['D2_0', 'W', 0, 0],
    ['D2_0', 'W', 1, 0],
    ['D2_0', 'W', 2, 0],
    ['D2_0', 'W', 3, 0],
    ['B1_0', 'Y', 4, 0],
    ['B1_0', 'W', 5, 0],
  ],
};

/** `n` yard moves of the W single between (5,0) and (5,1). */
function shuttle(session: GameSession, n: number): void {
  for (let i = 0; i < n; i++) {
    const y = pieceY(session.state, 5) === 0 ? 1 : 0;
    expect(session.commit(dragTo(5, 5, y)).status).toBe('applied');
  }
}

/** Ends the moves with one yard move (counter forced to 1 first). */
function runOut(session: GameSession): void {
  setHdr(session.state, H.movesLeft, 1);
  shuttle(session, 1);
}

describe('K-39 Undo', () => {
  it('K-39 GDD example: after a wrong placement (9 → 8, c 3 → 0) Undo gives back 9, c = 3 and the start cell', () => {
    const session = GameSession.start(compiledLevel(SHUTTLE));
    for (const m of [dragTo(0, 6, 8), dragTo(1, 7, 8), dragTo(2, 6, 8)]) session.commit(m);
    const s = session.state;
    expect([session.movesLeft, hdr(s, H.combo)]).toEqual([9, 3]);
    const wrong = session.commit(dragTo(4, 7, 8));
    expect(wrong.status).toBe('applied');
    expect([session.movesLeft, hdr(s, H.combo), session.movesMade]).toEqual([8, 0, 4]);
    expect(session.canUndo()).toBe(true);
    expect(session.undo()).toBe(true);
    expect([session.movesLeft, hdr(s, H.combo), session.movesMade]).toEqual([9, 3, 3]);
    expect([pieceZone(s, 4), pieceX(s, 4), pieceY(s, 4)]).toEqual([Zone.yard, 4, 0]);
    expect(session.state).toBe(s); // restored in place
    expectConsistent(s);
  });

  it('K-39 depth 1: a second Undo needs a new drag move', () => {
    const session = GameSession.start(compiledLevel(SHUTTLE));
    shuttle(session, 2);
    expect(session.undo()).toBe(true);
    expect(session.undo()).toBe(false);
    expect(session.undoBlock()).toBe('noDragMove');
    shuttle(session, 1);
    expect(session.undo()).toBe(true);
    expect(session.log.map((a) => a.kind)).toEqual(['start', 'drag', 'drag', 'undo', 'drag', 'undo']);
  });

  it('K-39 Undo takes a correctly placed (locked) block back to the yard — the only K-14 exception', () => {
    const session = GameSession.start(levelFile(5));
    session.commit(HAND[5][0] ?? dragTo(0, 0, 0));
    const s = session.state;
    expect(pieceField(s, 2, PF.flags) & FLAG_BIT.locked).not.toBe(0);
    session.undo();
    expect([pieceZone(s, 2), pieceX(s, 2), pieceY(s, 2)]).toEqual([Zone.yard, 2, 6]);
    expect(pieceField(s, 2, PF.flags) & FLAG_BIT.locked).toBe(0);
  });

  it('E-21 Undo of a move with a segment shift and a delivery restores everything', () => {
    const session = GameSession.start(levelFile(5));
    session.commit(HAND[5][0] ?? dragTo(0, 0, 0));
    session.commit(HAND[5][1] ?? dragTo(0, 0, 0));
    const before = session.state.buf.slice();
    const first = new ArraySink();
    session.commit(HAND[5][2] ?? dragTo(0, 0, 0), first);
    expect(hdr(session.state, H.activeSeg)).toBe(1);
    expect(queueIds(session.state)).toEqual([16]);
    expect(session.undo()).toBe(true);
    expect(session.state.buf).toEqual(before);
    expect([13, 14, 15, 16].map((id) => pieceZone(session.state, id))).toEqual(Array(4).fill(Zone.pending));
    const again = new ArraySink();
    session.commit(HAND[5][2] ?? dragTo(0, 0, 0), again);
    expect(again.events).toEqual(first.events);
  });

  it('K-39 no Undo after a trowel use, after a +5 offer, in the out-of-moves window or after the win', () => {
    const lvl5 = GameSession.start(levelFile(5));
    for (const m of HAND[5].slice(0, 4)) lvl5.commit(m);
    expect(hdr(lvl5.state, H.trowels)).toBe(1);
    const cell = buildFront(lvl5.state)[0];
    if (!cell) throw new Error('no build front cell');
    const trowel: Move = { kind: 'trowel', seg: cell.seg ?? 0, x: cell.x === 6 ? 0 : 1, y: cell.y };
    expect(lvl5.commit(trowel).status).toBe('applied');
    expect(lvl5.undoBlock()).toBe('noDragMove');

    const session = GameSession.start(compiledLevel(SHUTTLE));
    runOut(session);
    expect(session.outcome).toBe('outOfMoves');
    expect(session.undoBlock()).toBe('lossWindow');
    expect(session.undo()).toBe(false);
    session.acceptOffer('offerCoins');
    expect(session.undoBlock()).toBe('noDragMove');

    const won = GameSession.start(levelFile(1));
    for (const m of HAND[1]) won.commit(m);
    expect([won.outcome, won.undoBlock()]).toEqual(['won', 'levelOver']);
    expect(won.commit(dragTo(3, 0, 6)).reason).toBe('notPlaying');
  });
});

describe('K-29 +5 offers', () => {
  it('K-29 an accepted offer sets 5 moves; m, timers and the streak stay; step 12 runs once (E-42)', () => {
    const calls: number[] = [];
    const hooks: MoveHooks = {
      deadlock: (ctx) => {
        calls.push(hdr(ctx.s, H.movesLeft));
        ctx.emit({ t: 'deadlockDetected', reason: 'noMoves' });
      },
    };
    const session = GameSession.start(compiledLevel(SHUTTLE), {}, { hooks });
    session.commit(dragTo(0, 6, 8)); // c = 1
    runOut(session);
    expect(calls).toEqual([11]); // after the first move only: never at 0 moves
    const m = session.movesMade;
    const sink = new ArraySink();
    const res = session.acceptOffer('offerAd', sink);
    expect(res.status).toBe('applied');
    expect(sink.events.map((e) => [e.t, e.step])).toEqual([
      ['movesChanged', 1],
      ['deadlockDetected', 12],
    ]);
    expect(find(sink.events, 'movesChanged')).toMatchObject({
      reason: 'offer',
      delta: OFFER_MOVES,
      movesLeft: 5,
    });
    expect(calls).toEqual([11, 5]);
    expect([session.movesLeft, session.movesMade, hdr(session.state, H.combo)]).toEqual([5, m, 1]);
    expect([session.outcome, session.offersUsed, session.adOfferUsed]).toEqual(['playing', 1, true]);
  });

  it('K-29 the ad option exists only on offer 1; after 3 offers the level is lost at once', () => {
    const session = GameSession.start(compiledLevel(SHUTTLE));
    runOut(session);
    expect(session.nextOffer()).toEqual({ n: 1, adAllowed: true });
    expect(session.acceptOffer('offerAd').status).toBe('applied');
    shuttle(session, OFFER_MOVES);
    expect(session.nextOffer()).toEqual({ n: 2, adAllowed: false });
    expect(session.acceptOffer('offerAd').reason).toBe('adNotAllowed');
    expect(session.acceptOffer('offerCoins').status).toBe('applied');
    shuttle(session, OFFER_MOVES);
    expect(session.nextOffer()).toEqual({ n: 3, adAllowed: false });
    session.acceptOffer('offerCoins');
    shuttle(session, OFFER_MOVES);
    expect(MAX_OFFERS).toBe(3);
    expect([session.outcome, session.nextOffer(), session.offersUsed]).toEqual(['lost', null, 3]);
    expect(hdr(session.state, H.flags) & STATE_FLAG.lost).toBe(STATE_FLAG.lost);
  });

  it('K-29 declining the offer loses the level; no move is taken afterwards', () => {
    const session = GameSession.start(compiledLevel(SHUTTLE));
    expect(() => session.declineOffer()).toThrow(/no out-of-moves window/);
    runOut(session);
    session.declineOffer();
    expect(session.outcome).toBe('lost');
    expect(session.commit(dragTo(5, 5, 0)).reason).toBe('notPlaying');
    expect(session.acceptOffer('offerCoins').reason).toBe('noOffer');
  });
});

describe('K-43 exit and resume', () => {
  it('K-43 E-41 exit at m = 0 is free: pre-level boosters come back, the streak bonus is not consumed', () => {
    const session = GameSession.start(
      compiledLevel(SHUTTLE),
      { preBoosters: ['thermos', 'trowelStart'], streakTier: 2 },
      { streakBonus: () => ({ moves: 2, trowels: 1 }) },
    );
    expect([session.movesLeft, hdr(session.state, H.trowels)]).toEqual([17, 2]);
    expect(session.exit()).toEqual({
      kind: 'free',
      movesMade: 0,
      refundPreBoosters: ['thermos', 'trowelStart'],
      streakBonusConsumed: false,
    });
    expect(session.outcome).toBe('exited');
    expect(() => session.exit()).toThrow(/not running/);
  });

  it('K-43 exit after a move (m ≥ 1) is a loss', () => {
    const session = GameSession.start(compiledLevel(SHUTTLE), { preBoosters: ['thermos'] });
    shuttle(session, 1);
    expect(session.exit()).toEqual({
      kind: 'loss',
      movesMade: 1,
      refundPreBoosters: [],
      streakBonusConsumed: true,
    });
    expect(session.outcome).toBe('lost');
  });

  it('K-43 E-38 replay rebuilds the attempt bit for bit and plays on like the live session', () => {
    const lvl = levelFile(5);
    const live = GameSession.start(lvl);
    live.commit(HAND[5][0] ?? dragTo(0, 0, 0));
    live.commit(dragTo(3, 6, 8)); // wrong (bounces)
    live.undo();
    live.commit(HAND[5][1] ?? dragTo(0, 0, 0));
    live.commit(HAND[5][2] ?? dragTo(0, 0, 0));
    const resumed = GameSession.replay(lvl, live.log);
    expect(resumed.resumed).toBe(true);
    expect(live.resumed).toBe(false);
    expect(resumed.state.buf).toEqual(live.state.buf);
    expect(resumed.log).toEqual(live.log);
    expect([resumed.canUndo(), resumed.outcome]).toEqual([live.canUndo(), live.outcome]);
    for (const m of HAND[5].slice(3)) {
      live.commit(m);
      resumed.commit(m);
    }
    expect(resumed.state.buf).toEqual(live.state.buf);
    expect([resumed.outcome, resumed.movesLeft, resumed.yao()]).toEqual([
      'won',
      5,
      { overWall: 6, rail: 0, yao: 1 },
    ]);
  });

  it('K-43 the out-of-moves window survives a restart with the same offer number', () => {
    const lvl = compiledLevel(SHUTTLE);
    const live = GameSession.start(lvl);
    shuttle(live, 12);
    live.acceptOffer('offerAd');
    shuttle(live, OFFER_MOVES);
    expect(live.outcome).toBe('outOfMoves');
    const resumed = GameSession.replay(lvl, live.log);
    expect([resumed.outcome, resumed.nextOffer(), resumed.adOfferUsed]).toEqual([
      'outOfMoves',
      { n: 2, adAllowed: false },
      true,
    ]);
  });

  it('K-43 a log that does not replay throws ReplayError with the action index', () => {
    const lvl = levelFile(5);
    const start: SessionAction = { kind: 'start', preBoosters: [], streakTier: 0 };
    expect(() => GameSession.replay(lvl, [])).toThrow(ReplayError);
    const buried: SessionAction[] = [start, dragTo(4, 0, 6)];
    expect(() => GameSession.replay(lvl, buried)).toThrow(/action 1/);
    expect(() => GameSession.replay(lvl, [start, start])).toThrow(/second start/);
    expect(() => GameSession.replay(lvl, [start, { kind: 'undo' }])).toThrow(/undo/);
    expect(() =>
      GameSession.replay(lvl, [start, { kind: 'addMoves', amount: OFFER_MOVES, source: 'offerAd' }]),
    ).toThrow(/offer/);
    try {
      GameSession.replay(lvl, buried);
    } catch (e) {
      expect(e instanceof ReplayError ? e.index : -1).toBe(1);
    }
  });

  it('K-43 seeded random play: every state stays consistent and the replay equals the live session', () => {
    const lvl = levelFile(5);
    for (let seed = 1; seed <= 12; seed++) {
      const rng = mulberry32(seed);
      const live = GameSession.start(lvl);
      for (let step = 0; step < 60 && live.outcome !== 'won' && live.outcome !== 'lost'; step++) {
        if (live.outcome === 'outOfMoves') {
          if (live.acceptOffer('offerCoins').status !== 'applied') break;
          continue;
        }
        if (live.canUndo() && rng.next() < 0.1) {
          live.undo();
          continue;
        }
        const P = lvl.layout.counts.pieces;
        const sessions = [];
        for (let id = 0; id < P; id++) {
          const a = tryBeginDrag(live.state, id);
          if (a.ok) sessions.push(a.session);
        }
        const drag = sessions[rng.nextInt(sessions.length)];
        if (!drag) break;
        const nodes = drag.reachableNodes();
        const to = nodes[rng.nextInt(nodes.length)] ?? drag.start;
        live.commit({ kind: 'drag', pieceId: drag.pieceId, to }, new ArraySink());
        expectConsistent(live.state);
      }
      const resumed = GameSession.replay(lvl, live.log);
      expect(resumed.state.buf).toEqual(live.state.buf);
      expect([resumed.outcome, resumed.offersUsed, resumed.canUndo()]).toEqual([
        live.outcome,
        live.offersUsed,
        live.canUndo(),
      ]);
    }
  });
});

describe('K-40 level start and versioning', () => {
  it('K-40 Termos +3 moves, Mala Başlangıcı +1 trowel, Açık Kepenk for the first 5 moves; m stays 0', () => {
    const sink = new ArraySink();
    const session = GameSession.start(
      compiledLevel(SHUTTLE),
      { preBoosters: ['thermos', 'trowelStart', 'openShutter'], streakTier: 3 },
      { streakBonus: (tier) => ({ moves: tier, trowels: 2 }) },
      sink,
    );
    const s = session.state;
    expect([session.movesLeft, hdr(s, H.trowels), hdr(s, H.openShutterUntil), session.movesMade]).toEqual([
      18, 3, 5, 0,
    ]);
    expect(sink.events.map((e) => (e.t === 'movesChanged' ? [e.reason, e.delta] : e.t))).toEqual([
      ['booster', 3],
      ['booster', 3],
    ]);
    expect(session.log).toEqual([
      { kind: 'start', preBoosters: ['thermos', 'trowelStart', 'openShutter'], streakTier: 3 },
    ]);
    expect(() => GameSession.start(compiledLevel(SHUTTLE), { streakTier: 1 })).toThrow(/streakBonus/);
  });

  it('K-43 levelHash pins the level data; RULES_VERSION is a positive integer', () => {
    const a = compiledLevel(SHUTTLE);
    expect(levelHash(a.data)).toMatch(/^[0-9a-f]{16}$/);
    expect(levelHash(compiledLevel(SHUTTLE).data)).toBe(levelHash(a.data));
    expect(levelHash(compiledLevel({ ...SHUTTLE, moves: 13 }).data)).not.toBe(levelHash(a.data));
    expect(Number.isInteger(RULES_VERSION) && RULES_VERSION >= 1).toBe(true);
  });
});
