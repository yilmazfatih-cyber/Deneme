import { describe, expect, it } from 'vitest';
import economy from '../../config/economy.json' with { type: 'json' };
import { ArraySink } from '../../src/core/moves.ts';
import { GameSession, RULES_VERSION, levelHash } from '../../src/core/session.ts';
import { Analytics } from '../../src/services/analytics.ts';
import type { AnalyticsEvent } from '../../src/services/analytics.ts';
import { FakeClock } from '../../src/services/clock.ts';
import { MemoryStore, SaveService, createDefaultSave } from '../../src/services/save.ts';
import type { SaveData } from '../../src/services/save.ts';
import {
  LevelAttempt,
  packFor,
  packSku,
  streakActive,
  streakBonusOf,
  streakTierOf,
} from '../../src/scenes/flow/attempt.ts';
import { INTRO_PANELS, IntroTimeline, ftueUntouchedMs } from '../../src/scenes/flow/intro.ts';
import { PROLOGUE_SCENE, homeTarget, launchRoute } from '../../src/scenes/flow/launch.ts';
import { offerModel } from '../../src/ui/offer.ts';
import { winRewards } from '../../src/ui/rewards.ts';
import { handMoves, levelFile } from '../core/moves.fixtures.ts';

function saveData(patch: (d: SaveData) => void = () => {}): SaveData {
  const d = createDefaultSave({ analyticsId: 'a', installId: 'i', now: 0, wallet: economy.startingWallet });
  patch(d);
  return d;
}

function harness(start = 1_000_000) {
  const clock = new FakeClock(start);
  const events: AnalyticsEvent[] = [];
  let n = 0;
  const save = SaveService.open({
    store: new MemoryStore(),
    clock,
    scheduler: clock,
    startingWallet: economy.startingWallet,
    newId: () => `id${n++}`,
  });
  const analytics = new Analytics({
    clock,
    common: () => ({
      sessionId: 's',
      appVersion: 'test',
      platform: 'web',
      lang: 'tr',
      coins: save.data.coins,
      lives: save.data.lives.stored,
      highestLevel: save.data.progress.highestLevel,
      payer: save.data.payer,
    }),
    onInvalid: (issues) => {
      throw new Error(issues.join('\n'));
    },
  });
  analytics.addSink((r) => events.push(r.event));
  return { clock, save, events, deps: { save, track: analytics.track, clock } };
}

describe('UX 1 / UX 12 launch route (K-43, D-018)', () => {
  it('D-018 first launch plays the prologue, then home on later launches', () => {
    expect(launchRoute(saveData(), { kind: 'none' })).toEqual({ kind: 'intro' });
    const seen = saveData((d) => d.town.seenScenes.push(PROLOGUE_SCENE));
    expect(launchRoute(seen, { kind: 'none' })).toEqual({ kind: 'home' });
    const played = saveData((d) => (d.progress.highestLevel = 2));
    expect(launchRoute(played, { kind: 'none' })).toEqual({ kind: 'home' });
  });

  it('K-43 a saved attempt resumes on the level screen (Pause, or the same offer window)', () => {
    const d = saveData();
    const route = launchRoute(d, {
      kind: 'resume',
      inLevel: {
        levelId: 3,
        seed: 3003,
        mode: 'story',
        preBoosters: [],
        streakTier: 0,
        actions: [{ kind: 'start', preBoosters: [], streakTier: 0 }],
        movesMade: 0,
        offersUsed: 0,
        adOfferUsed: false,
        offerSpendCoins: 0,
        outcomeWindow: 'outOfMoves',
        levelHash: 'x',
        rulesVersion: 1,
        attemptId: 'a',
        startedAt: 0,
        bridgeEventId: null,
      },
      window: 'outOfMoves',
    });
    expect(route).toMatchObject({ kind: 'level', levelId: 3, window: 'outOfMoves' });
  });

  it('K-43 item 4 a voided attempt goes home (the update window shows there)', () => {
    const route = launchRoute(saveData(), {
      kind: 'void',
      cause: 'level_hash',
      notice: { level: 2, refunds: { life: 1, boosters: {}, coins: 0 }, bridge: false },
    });
    expect(route).toEqual({ kind: 'home' });
  });
});

describe('UX 6 Phase 2 minimal home: level button and 1–5 loop', () => {
  it('UX 6 after a win the next slice level; after a loss the same level', () => {
    const d = saveData((x) => (x.progress.highestLevel = 3));
    expect(homeTarget(d, { levelId: 3, won: true }).next).toBe(4);
    expect(homeTarget(d, { levelId: 3, won: false }).next).toBe(3);
    expect(homeTarget(d, null).next).toBe(4);
  });

  it('UX 6 after level 5 the "Yeni bölümler yolda" band shows and the button opens level 1', () => {
    const d = saveData((x) => (x.progress.highestLevel = 5));
    expect(homeTarget(d, { levelId: 5, won: true })).toEqual({ next: 1, moreSoon: true, pulse: false });
    expect(homeTarget(d, null)).toMatchObject({ next: 1, moreSoon: true });
  });

  it('UX 2.2 step 11 "BÖLÜM 2" pulses after level 1 until level 2 is tried', () => {
    const d = saveData((x) => (x.progress.highestLevel = 1));
    expect(homeTarget(d, { levelId: 1, won: true }).pulse).toBe(true);
    const tried = saveData((x) => {
      x.progress.highestLevel = 1;
      x.progress.levels['2'] = { won: false, attempts: 1 };
    });
    expect(homeTarget(tried, null).pulse).toBe(false);
  });
});

describe('UX 2.1 intro: ≤ 10 s and ≤ 3 taps (D-018, P-8)', () => {
  it('UX 2.1 the 3 panels advance by themselves every ftuePanelAuto', () => {
    const t = new IntroTimeline();
    t.start(0);
    const auto = t.autoMs;
    t.update(auto - 1);
    expect(t.panel).toBe(0);
    t.update(auto);
    expect(t.panel).toBe(1);
    t.update(INTRO_PANELS * auto);
    expect(t.done).toBe(true);
    expect(t.taps).toBe(0);
  });

  it('UX 2.1 tapping each panel finishes in 3 taps; "Geç" in 1', () => {
    const t = new IntroTimeline();
    t.start(0);
    t.tap(100);
    t.tap(200);
    t.tap(300);
    expect(t.done).toBe(true);
    expect(t.taps).toBe(3);
    const s = new IntroTimeline();
    s.start(0);
    s.skip();
    expect(s.done && s.taps === 1).toBe(true);
  });

  it('UX 2.1 untouched path to an interactive Level 1 is 8.2 s ≤ 10 s', () => {
    expect(ftueUntouchedMs()).toBe(8200);
    expect(ftueUntouchedMs()).toBeLessThanOrEqual(10_000);
  });
});

describe('Level attempt record (K-28, K-29, K-43; TECH 11.1, ANALYTICS 2)', () => {
  it('K-43 begin writes inLevel with hash + rules version and reserves a life; level_start sent', () => {
    const h = harness();
    const lvl = levelFile(1);
    LevelAttempt.begin(h.deps, lvl, { preBoosters: [], streakTier: 0 });
    const il = h.save.data.inLevel;
    expect(il?.levelHash).toBe(levelHash(lvl.data));
    expect(il?.rulesVersion).toBe(RULES_VERSION);
    expect(h.save.data.lives.reserved).toBe(1);
    expect(h.events.map((e) => e.name)).toEqual(['level_start']);
  });

  it('K-28 win: rewards, progress and a refunded life in one write; level_end win', () => {
    const h = harness();
    const lvl = levelFile(1);
    const a = LevelAttempt.begin(h.deps, lvl, { preBoosters: [], streakTier: 0 });
    const g = GameSession.start(lvl);
    for (const m of handMoves(1)) {
      const sink = new ArraySink();
      g.commit(m, sink);
      a.observe(sink.events);
      a.recorded(m, g.movesMade);
    }
    expect(g.outcome).toBe('won');
    const r = winRewards({ difficulty: lvl.difficulty, movesLeft: g.movesLeft, trowels: 0 });
    const coins = h.save.data.coins;
    a.win(g, r);
    expect(h.save.data.coins).toBe(coins + r.totalCoins);
    expect(h.save.data.stars).toBe(1);
    expect(h.save.data.progress.highestLevel).toBe(1);
    expect(h.save.data.inLevel).toBeNull();
    expect(h.save.data.lives).toMatchObject({ reserved: 0, stored: economy.startingWallet.lives });
    const end = h.events.find((e) => e.name === 'level_end');
    expect(end).toMatchObject({ result: 'win', movesLeft: g.movesLeft, yao: 100, exitFree: false });
  });

  it('K-43 exit at m = 0 is free; m ≥ 1 costs the reserved life', () => {
    const free = harness();
    const lvl = levelFile(2);
    const a = LevelAttempt.begin(free.deps, lvl, { preBoosters: [], streakTier: 0 });
    const g = GameSession.start(lvl);
    const ex = g.exit();
    expect(ex.kind).toBe('free');
    a.exitFree(g, ex.refundPreBoosters);
    expect(free.save.data.lives).toMatchObject({ stored: 5, reserved: 0 });
    expect(free.events.find((e) => e.name === 'level_end')).toMatchObject({ result: 'quit', exitFree: true });

    const paid = harness();
    const b = LevelAttempt.begin(paid.deps, lvl, { preBoosters: [], streakTier: 0 });
    const g2 = GameSession.start(lvl);
    const first = handMoves(2)[0];
    if (!first) throw new Error('no hand move');
    g2.commit(first);
    b.recorded(first, g2.movesMade);
    expect(g2.exit().kind).toBe('loss');
    expect(b.loss(g2, 'quit')).toEqual({ lifeLost: true, streakLost: false });
    expect(paid.save.data.lives).toMatchObject({ stored: 4, reserved: 0 });
    expect(paid.events.map((e) => e.name)).toContain('life_lost');
  });

  it('K-29 lifetime-first gift is free and used up; later offers cost coins', () => {
    const h = harness();
    const lvl = levelFile(1);
    const a = LevelAttempt.begin(h.deps, lvl, { preBoosters: [], streakTier: 0 });
    const gift = offerModel({
      n: 1,
      adAllowed: true,
      giftAvailable: true,
      coins: h.save.data.coins,
      ads: { kind: 'none' },
    });
    a.offerShown(gift);
    expect(h.save.data.inLevel?.outcomeWindow).toBe('outOfMoves');
    const before = h.save.data.coins;
    expect(a.payOffer(gift, { kind: 'addMoves', amount: 5, source: 'offerCoins' }, 0)).toBe(true);
    expect(h.save.data.coins).toBe(before);
    expect(h.save.data.firstOfferGiftUsed).toBe(true);
    expect(h.save.data.inLevel).toMatchObject({ offersUsed: 1, offerSpendCoins: 0, outcomeWindow: 'none' });
    expect(h.events.find((e) => e.name === 'offer_result')).toMatchObject({ result: 'free', priceCoins: 0 });
  });

  it('UX 7 coins short: the fake store pack covers the missing coins, then the offer is paid', () => {
    const h = harness();
    const lvl = levelFile(1);
    const a = LevelAttempt.begin(h.deps, lvl, { preBoosters: [], streakTier: 0 });
    const short = offerModel({
      n: 2,
      adAllowed: false,
      giftAvailable: false,
      coins: h.save.data.coins,
      ads: { kind: 'none' },
    });
    expect(short.coin.kind).toBe('short');
    expect(a.payOffer(short, { kind: 'addMoves', amount: 5, source: 'offerCoins' }, 0)).toBe(false);
    if (short.coin.kind !== 'short') throw new Error('expected short');
    const pack = packFor(short.coin.missing);
    expect(pack.sku).toBe('coins_1000');
    a.fakePurchase(packSku(pack.sku));
    const after = offerModel({
      n: 2,
      adAllowed: false,
      giftAvailable: false,
      coins: h.save.data.coins,
      ads: { kind: 'none' },
    });
    expect(after.coin.kind).toBe('buy');
    expect(a.payOffer(after, { kind: 'addMoves', amount: 5, source: 'offerCoins' }, 0)).toBe(true);
    expect(h.save.data.coins).toBe(economy.startingWallet.coins + 1000 - 1350);
    expect(h.save.data.inLevel?.offerSpendCoins).toBe(1350);
    expect(h.events.find((e) => e.name === 'purchase')).toMatchObject({ sku: 'coins_1000', fake: true });
  });

  it('META 5 the win streak opens at level 15: no tier and no streak bonus before it', () => {
    expect(streakActive(5)).toBe(false);
    expect(streakTierOf(5, 9)).toBe(0);
    expect(streakTierOf(15, 1)).toBe(1);
    expect(streakTierOf(15, 7)).toBe(3);
    expect(streakBonusOf(3)).toEqual({ moves: 3, trowels: 2 });
  });
});
