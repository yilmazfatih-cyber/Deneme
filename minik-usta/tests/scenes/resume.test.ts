/**
 * TECH_DESIGN §14.1 #13 end-to-end wiring without Phaser: the save over one `MemoryStore` survives a "kill" (a second
 * `SaveService.open` on the same store), the launch decision and route, the core replay, the attempt record
 * (`LevelAttempt.settle` right after a game-ending commit) and the analytics events, in the order the scenes call them
 * (BootScene → LevelScene). Plus the page-wide audio unlock (TECH §11.6).
 */
import { describe, expect, it } from 'vitest';
import economy from '../../config/economy.json' with { type: 'json' };
import { hashHex } from '../../src/core/hash.ts';
import type { CompiledLevel } from '../../src/core/level/compile.ts';
import { ArraySink } from '../../src/core/moves.ts';
import { GameSession, OFFER_MOVES, RULES_VERSION, levelHash } from '../../src/core/session.ts';
import { pieceY } from '../../src/core/state.ts';
import type { SessionAction } from '../../src/core/types.ts';
import { Analytics } from '../../src/services/analytics.ts';
import type { AnalyticsEvent } from '../../src/services/analytics.ts';
import { FakeClock } from '../../src/services/clock.ts';
import { MemoryStore, SaveService } from '../../src/services/save.ts';
import type { KeyValueStore, LevelIdentity } from '../../src/services/save.ts';
import { LevelAttempt } from '../../src/scenes/flow/attempt.ts';
import { launchRoute } from '../../src/scenes/flow/launch.ts';
import { AUDIO_UNLOCK_EVENTS, installAudioUnlock } from '../../src/scenes/level/sceneServices.ts';
import type { UnlockEventTarget } from '../../src/scenes/level/sceneServices.ts';
import { offerModel } from '../../src/ui/offer.ts';
import { winRewards } from '../../src/ui/rewards.ts';
import { compiledLevel } from '../fixtures/builders.ts';
import type { LevelSpec } from '../fixtures/builders.ts';
import { dragTo, handMoves, levelFile } from '../core/moves.fixtures.ts';

/** One app launch over `store`: save + analytics recording into `events` (shared across launches). */
function launch(store: KeyValueStore, clock: FakeClock, events: AnalyticsEvent[]) {
  let n = 0;
  let save: SaveService | null = null;
  const analytics = new Analytics({
    clock,
    common: () => ({
      sessionId: 's',
      appVersion: 'test',
      platform: 'web',
      lang: 'tr',
      coins: save?.data.coins ?? 0,
      lives: save?.data.lives.stored ?? 0,
      highestLevel: save?.data.progress.highestLevel ?? 0,
      payer: save?.data.payer ?? false,
    }),
    onInvalid: (issues) => {
      throw new Error(issues.join('\n'));
    },
  });
  analytics.addSink((r) => events.push(r.event));
  save = SaveService.open({
    store,
    clock,
    scheduler: clock,
    startingWallet: economy.startingWallet,
    track: analytics.track,
    newId: () => `id${clock.now()}-${n++}`,
  });
  return { save, deps: { save, track: analytics.track, clock } };
}

/** BootScene's identity of a level in this build. */
const identityOf =
  (lvl: CompiledLevel) =>
  (id: number): LevelIdentity | null =>
    id === lvl.id ? { levelHash: levelHash(lvl.data), rulesVersion: RULES_VERSION } : null;

/** LevelScene.release: commit → record → settle (one save write each, before any cue). */
function play(
  g: GameSession,
  a: LevelAttempt,
  lvl: CompiledLevel,
  m: SessionAction,
): ReturnType<LevelAttempt['settle']> {
  const sink = new ArraySink();
  if (m.kind === 'start' || m.kind === 'addMoves' || m.kind === 'undo') throw new Error('not a move');
  expect(g.commit(m, sink).status).toBe('applied');
  a.observe(sink.events);
  a.recorded(m, g.movesMade);
  return a.settle(g, () => winRewards({ difficulty: lvl.difficulty, movesLeft: g.movesLeft, trowels: 0 }));
}

describe('K-43 kill / reload end to end (TECH 14.1 #13)', () => {
  it('K-43 app killed mid-level resumes same state: same attempt, replayed bit for bit, level_resume, no new attempt', () => {
    const store = new MemoryStore();
    const clock = new FakeClock(1_000_000);
    const events: AnalyticsEvent[] = [];
    const lvl = levelFile(5);
    const first = launch(store, clock, events);
    expect(first.save.resumeOnLaunch(identityOf(lvl))).toEqual({ kind: 'none' });
    const a = LevelAttempt.begin(first.deps, lvl, { preBoosters: [], streakTier: 0 });
    const live = GameSession.start(lvl);
    for (const m of handMoves(5).slice(0, 3)) expect(play(live, a, lvl, m)).toBeNull();
    const hashBefore = hashHex(live.state);
    const lives = first.save.data.lives.stored;

    // kill: nothing else is written; a new page opens the same store
    clock.advance(60_000);
    const second = launch(store, clock, events);
    const decision = second.save.resumeOnLaunch(identityOf(lvl));
    expect(decision.kind).toBe('resume');
    const route = launchRoute(second.save.data, decision);
    if (route.kind !== 'level') throw new Error(`expected the level route, got ${route.kind}`);
    expect(route).toMatchObject({ levelId: 5, window: 'pause' });
    const replayed = GameSession.replay(lvl, route.resume);
    expect(hashHex(replayed.state)).toBe(hashBefore);
    expect([replayed.movesMade, replayed.movesLeft]).toEqual([live.movesMade, live.movesLeft]);
    expect(second.save.data.progress.levels['5']?.attempts).toBe(1);
    expect(second.save.data.lives).toMatchObject({ stored: lives, reserved: 1 });
    expect(events.map((e) => e.name)).toEqual(['level_start', 'level_resume']);
    expect(events[1]).toEqual({ name: 'level_resume', level: 5, movesMade: 3 });

    // the resumed attempt goes on and is recorded on the same log
    const b = LevelAttempt.resumed(second.deps, second.save.data.inLevel ?? fail());
    const next = handMoves(5)[3];
    if (!next) throw new Error('hand solution too short');
    play(replayed, b, lvl, next);
    expect(second.save.data.inLevel?.actions).toHaveLength(5); // start + 4 moves
  });

  it('K-43 resumed attempt keeps level_end wrongPlacements and truckHelps of the moves before the kill (ANALYTICS 2)', () => {
    const store = new MemoryStore();
    const clock = new FakeClock(1_000_000);
    const events: AnalyticsEvent[] = [];
    const lvl = levelFile(1);
    const first = launch(store, clock, events);
    const a = LevelAttempt.begin(first.deps, lvl, { preBoosters: [], streakTier: 0 });
    const live = GameSession.start(lvl);
    play(live, a, lvl, dragTo(1, 6, 8)); // W onto the Y row: K-17 bounce (one wrong placement)

    clock.advance(60_000);
    const second = launch(store, clock, events);
    const decision = second.save.resumeOnLaunch(identityOf(lvl));
    const route = launchRoute(second.save.data, decision);
    if (route.kind !== 'level') throw new Error(`expected the level route, got ${route.kind}`);
    // LevelScene.startLevel: replay into a sink, the resumed attempt observes the replayed events
    const sink = new ArraySink();
    const replayed = GameSession.replay(lvl, route.resume, {}, sink);
    expect(sink.events.filter((e) => e.t === 'placementWrong')).toHaveLength(1);
    const b = LevelAttempt.resumed(second.deps, second.save.data.inLevel ?? fail(), sink.events);
    for (const m of handMoves(1)) play(replayed, b, lvl, m);
    expect(replayed.outcome).toBe('won');
    const end = events.find((e) => e.name === 'level_end');
    expect(end).toMatchObject({ result: 'win', wrongPlacements: 1, truckHelps: 0 });
  });

  it('K-43 app killed during the win cues: the win was saved at the winning commit; relaunch goes home, paid once', () => {
    const store = new MemoryStore();
    const clock = new FakeClock(1_000_000);
    const events: AnalyticsEvent[] = [];
    const lvl = levelFile(1);
    const first = launch(store, clock, events);
    const coins = first.save.data.coins;
    const a = LevelAttempt.begin(first.deps, lvl, { preBoosters: [], streakTier: 0 });
    const g = GameSession.start(lvl);
    const moves = handMoves(1);
    let end: ReturnType<LevelAttempt['settle']> = null;
    for (const m of moves) end = play(g, a, lvl, m);
    expect(g.outcome).toBe('won');
    if (end?.kind !== 'win') throw new Error('the last commit should settle a win');
    // written before any cue: inLevel gone, rewards and progress in the same write
    expect(first.save.data.inLevel).toBeNull();
    expect(first.save.data.coins).toBe(coins + end.rewards.totalCoins);
    expect(first.save.data.progress.levels['1']).toEqual({ won: true, attempts: 1 });
    expect(a.settle(g, () => end.rewards)).toBeNull(); // planEnded / a second call never pays again

    // kill on the win screen (or during the cues): home, rewards not given twice, no win window again
    const second = launch(store, clock, events);
    const decision = second.save.resumeOnLaunch(identityOf(lvl));
    expect(decision).toEqual({ kind: 'none' });
    expect(launchRoute(second.save.data, decision)).toEqual({ kind: 'home' });
    expect(second.save.data.coins).toBe(coins + end.rewards.totalCoins);
    expect(events.filter((e) => e.name === 'level_end')).toEqual([
      expect.objectContaining({ result: 'win', level: 1 }),
    ]);
  });

  it('K-29 out of moves with no offer left: settle saves the loss at the commit (life charged, life_lost, level_end lose)', () => {
    const SHUTTLE: LevelSpec = {
      moves: 2,
      wall: { height: 2 },
      plan: ['WW', 'WW'],
      pieces: [
        ['D2_0', 'W', 0, 0],
        ['D2_0', 'W', 1, 0],
        ['B1_0', 'W', 5, 0],
      ],
    };
    const lvl = compiledLevel(SHUTTLE);
    const store = new MemoryStore();
    const clock = new FakeClock(1_000_000);
    const events: AnalyticsEvent[] = [];
    const { save, deps } = launch(store, clock, events);
    const a = LevelAttempt.begin(deps, lvl, { preBoosters: [], streakTier: 0 });
    const g = GameSession.start(lvl);
    const shuttle = (): ReturnType<LevelAttempt['settle']> =>
      play(g, a, lvl, dragTo(2, 5, pieceY(g.state, 2) === 0 ? 1 : 0));
    const lives = save.data.lives.stored;
    for (let offer = 0; offer < 3; offer++) {
      while (g.outcome === 'playing') expect(shuttle()).toBeNull();
      expect(g.outcome).toBe('outOfMoves');
      // the window's coin option (the save pays nothing here: the record of an accepted offer is what matters)
      expect(g.acceptOffer('offerCoins').status).toBe('applied');
      a.recorded({ kind: 'addMoves', amount: OFFER_MOVES, source: 'offerCoins' }, g.movesMade);
    }
    let end: ReturnType<LevelAttempt['settle']> = null;
    while (g.outcome === 'playing') end = shuttle();
    expect(g.outcome).toBe('lost');
    expect(end).toEqual({ kind: 'loss', result: { lifeLost: true, streakLost: false } });
    expect(save.data.inLevel).toBeNull();
    expect(save.data.lives).toMatchObject({ stored: lives - 1, reserved: 0 });
    const names = events.map((e) => e.name);
    expect(names.slice(-2)).toEqual(['life_lost', 'level_end']);
    expect(events.at(-1)).toMatchObject({ result: 'lose', extensions: 3 });
  });

  it('ANALYTICS store_open out_of_moves when the out-of-moves window opens the store (UX 7 "Altın yetmez")', () => {
    const events: AnalyticsEvent[] = [];
    const { deps } = launch(new MemoryStore(), new FakeClock(1), events);
    const a = LevelAttempt.begin(deps, levelFile(1), { preBoosters: [], streakTier: 0 });
    const model = offerModel({
      n: 3,
      adAllowed: false,
      giftAvailable: false,
      coins: 0,
      ads: { kind: 'none' },
    });
    expect(model.coin.kind).toBe('short');
    a.storeOpened();
    expect(events.at(-1)).toEqual({ name: 'store_open', source: 'out_of_moves' });
  });

  it('K-43 a log that does not replay is voided without penalty: refunds, voidNotice, coin_source refund, home', () => {
    const store = new MemoryStore();
    const clock = new FakeClock(1_000_000);
    const events: AnalyticsEvent[] = [];
    const lvl = levelFile(1);
    const { save, deps } = launch(store, clock, events);
    const lives = save.data.lives.stored;
    LevelAttempt.begin(deps, lvl, { preBoosters: [], streakTier: 0 });
    save.commit((d) => {
      d.coins -= 400;
      const il = d.inLevel ?? fail();
      il.offerSpendCoins = 400;
    });
    const notice = save.voidUnreplayable();
    expect(notice).toEqual({ level: 1, refunds: { life: 1, boosters: {}, coins: 400 }, bridge: false });
    expect(save.data.inLevel).toBeNull();
    expect(save.data.lives).toMatchObject({ stored: lives, reserved: 0 });
    expect(save.diagnostics().at(-1)).toMatchObject({ kind: 'attemptVoided', cause: 'replay', levelId: 1 });
    expect(events.map((e) => e.name)).toEqual(['level_start', 'coin_source']);
    expect(events.at(-1)).toMatchObject({ reason: 'refund', amount: 400 });
    expect(save.voidUnreplayable()).toBeNull();
    // the next launch shows the notice at home (UX §1 (c)) and refunds nothing again
    const again = launch(store, clock, events);
    expect(again.save.data.voidNotice).toEqual(notice);
    expect(again.save.data.coins).toBe(save.data.coins);
  });
});

function fail(): never {
  throw new Error('missing value');
}

/** A minimal event target that records listeners (capture flag ignored). */
class Target implements UnlockEventTarget {
  readonly map = new Map<string, Set<() => void>>();
  addEventListener(type: string, fn: () => void): void {
    const set = this.map.get(type) ?? new Set();
    set.add(fn);
    this.map.set(type, set);
  }
  removeEventListener(type: string, fn: () => void): void {
    this.map.get(type)?.delete(fn);
  }
  fire(type: string): void {
    for (const fn of [...(this.map.get(type) ?? [])]) fn();
  }
  count(): number {
    let n = 0;
    for (const s of this.map.values()) n += s.size;
    return n;
  }
}

describe('TECH 11.6 page-wide audio unlock', () => {
  function fakeAudio() {
    const calls: string[] = [];
    let state: 'none' | 'suspended' | 'running' = 'none';
    const audio = {
      unlock: () => {
        calls.push('unlock');
        state = 'running';
      },
      get unlocked() {
        return state === 'running';
      },
      suspend: () => {
        calls.push('suspend');
        if (state === 'running') state = 'suspended';
      },
      resume: () => {
        calls.push('resume');
        if (state === 'suspended') state = 'running';
      },
    };
    return { audio, calls };
  }

  it('TECH 11.6 the first activating input anywhere unlocks; a touch pointerdown alone does not; listeners go once running', () => {
    const { audio, calls } = fakeAudio();
    const target = new Target();
    let active = false;
    const doc = new Target() as Target & { visibilityState: DocumentVisibilityState };
    const off = installAudioUnlock({
      audio,
      target,
      activation: () => ({ isActive: active, hasBeenActive: active }),
      lifecycle: { document: doc as never },
    });
    expect([...target.map.keys()].sort()).toEqual([...AUDIO_UNLOCK_EVENTS].sort());
    target.fire('pointerdown'); // touch down: no user activation yet
    expect(calls).toEqual([]);
    active = true;
    target.fire('pointerup'); // the end of the first tap or drag
    expect(calls).toEqual(['unlock']);
    target.fire('click');
    expect(target.count()).toBe(0); // running: the input listeners are gone
    off();
  });

  it('TECH 11.6 without the userActivation API every listed event tries; background suspends, foreground resumes', () => {
    const { audio, calls } = fakeAudio();
    const target = new Target();
    const doc = new Target() as Target & { visibilityState: DocumentVisibilityState };
    const win = new Target();
    const off = installAudioUnlock({
      audio,
      target,
      activation: () => null,
      lifecycle: { document: doc as never, window: win as never },
    });
    target.fire('keydown');
    expect(calls).toEqual(['unlock']);
    doc.visibilityState = 'hidden';
    doc.fire('visibilitychange');
    doc.visibilityState = 'visible';
    doc.fire('visibilitychange');
    expect(calls).toEqual(['unlock', 'suspend', 'resume']);
    off();
    expect(doc.count() + win.count() + target.count()).toBe(0);
  });
});
