import { describe, expect, it } from 'vitest';
import economy from '../../config/economy.json' with { type: 'json' };
import { readFileSync } from 'node:fs';
import { GameSession, OFFER_MOVES } from '../../src/core/session.ts';
import { OFFER_ECONOMY, offerModel, offerPrice } from '../../src/ui/offer.ts';
import { APPROX_SIGN, realMoneyText, realMoneyValue, referencePack } from '../../src/ui/price.ts';
import { remainingPlanCells } from '../../src/ui/remaining.ts';
import { REWARD_ECONOMY, winRewards } from '../../src/ui/rewards.ts';
import { exitKind, exitLines, lossLines } from '../../src/ui/windowLines.ts';
import { handMoves, levelFile } from '../core/moves.fixtures.ts';

const none = { kind: 'none' } as const;

describe('UX 7 out-of-moves window 1 (K-29, D-024)', () => {
  it('K-29 offer prices escalate 900 / 1350 / 1800 with the visible counter, the last one says so', () => {
    const coins = 10_000;
    const [a, b, c] = [1, 2, 3].map((n) =>
      offerModel({ n, adAllowed: n === 1, giftAvailable: false, coins, ads: none }),
    );
    expect([a, b, c].map((m) => m && offerPrice(m))).toEqual(economy.outOfMoves.offerCosts);
    expect([a, b, c].map((m) => m?.counterKey)).toEqual([
      'lose.offer.count',
      'lose.offer.count',
      'lose.offer.last',
    ]);
    expect(a?.max).toBe(economy.outOfMoves.maxOffersPerAttempt);
    expect(a?.coin).toEqual({ kind: 'buy', moves: economy.outOfMoves.extraMoves, price: 900 });
  });

  it('K-29 the ad option only on offer 1 and never hidden: grey "Şu an reklam yok" without a provider', () => {
    const m1 = offerModel({ n: 1, adAllowed: true, giftAvailable: false, coins: 0, ads: none });
    expect(m1.ad).toEqual({ enabled: false, moves: OFFER_ECONOMY.adExtraMoves, line2: { key: 'ads.none' } });
    const m2 = offerModel({ n: 2, adAllowed: false, giftAvailable: false, coins: 0, ads: none });
    expect(m2.ad).toBeNull();
  });

  it('META 3.3 ad line counts today (n = watched + 1) and greys out at the daily cap', () => {
    const ok = offerModel({
      n: 1,
      adAllowed: true,
      giftAvailable: false,
      coins: 0,
      ads: { kind: 'available', watchedToday: 1 },
    });
    expect(ok.ad).toEqual({
      enabled: true,
      moves: 5,
      line2: { key: 'lose.adToday', n: 2, max: economy.outOfMoves.rewardedAdOffer.perDay },
    });
    const capped = offerModel({
      n: 1,
      adAllowed: true,
      giftAvailable: false,
      coins: 0,
      ads: { kind: 'available', watchedToday: economy.outOfMoves.rewardedAdOffer.perDay },
    });
    expect(capped.ad?.enabled).toBe(false);
    expect(capped.ad?.line2).toEqual({ key: 'ads.tomorrow' });
  });

  it("K-29 lifetime-first offer is Usta Dede's free gift: no price, no ad option", () => {
    const m = offerModel({ n: 1, adAllowed: true, giftAvailable: true, coins: 0, ads: none });
    expect(m.coin).toEqual({ kind: 'gift', moves: 5 });
    expect(m.ad).toBeNull();
    expect(offerPrice(m)).toBe(0);
    expect(m.counterKey).toBe('lose.offer.count');
  });

  it('UX 7 not enough coins: "Altın al · eksik" with the missing amount', () => {
    const m = offerModel({ n: 2, adAllowed: false, giftAvailable: false, coins: 1000, ads: none });
    expect(m.coin).toEqual({ kind: 'short', moves: 5, price: 1350, missing: 350 });
  });

  it('K-29 offer numbers outside 1…3 are a bug', () => {
    expect(() => offerModel({ n: 4, adAllowed: false, giftAvailable: false, coins: 0, ads: none })).toThrow();
  });
});

describe('UX 0.3 PriceLabel real-money line (BUSINESS E2)', () => {
  it('UX 0.3 900 coins ≈ 81 lira / $1.79 from the reference pack', () => {
    const pack = referencePack();
    expect(pack.coins).toBe(1000);
    expect(Math.round(realMoneyValue(900, 'tr'))).toBe(81);
    expect(realMoneyText(900, 'en')).toBe(`${APPROX_SIGN} $1.79`);
    expect(realMoneyText(900, 'tr')).toMatch(/^≈ .*81/);
  });
});

describe('UX 6 win rewards (K-28, META 3.1)', () => {
  it('K-28 bonus build turns at most 10 moves into coins; leftover trowels give coins too', () => {
    const r = winRewards({ difficulty: 'normal', movesLeft: 14, trowels: 1 });
    expect(r.bonusMoves).toBe(REWARD_ECONOMY.bonusMaxMovesCounted);
    expect(r.bonusCoins).toBe(10 * economy.levelRewards.bonusCoinsPerMoveLeft);
    expect(r.trowelCoins).toBe(economy.levelRewards.coinsPerLeftoverTrowel);
    expect(r.totalCoins).toBe(economy.levelRewards.winCoins.normal + r.bonusCoins + r.trowelCoins);
    expect(r.stars).toBe(economy.stars.perWin);
  });

  it('K-28 a win on the last move gives no bonus', () => {
    const r = winRewards({ difficulty: 'easy', movesLeft: 0, trowels: 0 });
    expect(r).toMatchObject({ bonusMoves: 0, bonusCoins: 0, trowels: 0, totalCoins: 20 });
  });
});

describe('STORY 7.5 exit confirm and loss lines (K-43 item 2, D-022)', () => {
  it('K-43 m = 0 exit is free: only exit.free (+ exit.refund with pre-level boosters)', () => {
    expect(exitKind(0)).toBe('free');
    expect(exitLines({ movesMade: 0, preBoosters: 0, winStreak: 3, bridge: true })).toEqual(['exit.free']);
    expect(exitLines({ movesMade: 0, preBoosters: 2, winStreak: 0, bridge: false })).toEqual([
      'exit.free',
      'exit.refund',
    ]);
  });

  it('K-43 m ≥ 1 exit costs a life; streak and bridge lines in STORY order', () => {
    expect(exitKind(1)).toBe('loss');
    expect(exitLines({ movesMade: 1, preBoosters: 1, winStreak: 0, bridge: false })).toEqual(['exit.cost']);
    expect(exitLines({ movesMade: 4, preBoosters: 0, winStreak: 2, bridge: true })).toEqual([
      'exit.cost',
      'exit.streak',
      'exit.bridge',
    ]);
  });

  it('UX 7 window 2 shows the streak reset only when a streak was lost', () => {
    expect(lossLines(false)).toEqual(['lose.life']);
    expect(lossLines(true)).toEqual(['lose.life', 'lose.streak']);
  });
});

describe('UX 7 "Kalan: n hücre" (K-15)', () => {
  it('K-15 remaining plan cells fall to 0 along the level 1 hand solution', () => {
    const lvl = levelFile(1);
    const g = GameSession.start(lvl);
    const total = remainingPlanCells(g.state);
    expect(total).toBe(6);
    const seen = [total];
    for (const m of handMoves(1)) {
      g.commit(m);
      seen.push(remainingPlanCells(g.state));
    }
    expect(seen).toEqual([6, 4, 2, 0]);
  });
});

describe('K-29 / K-43 the accepted offer is the one the core applies (review Faz 2 tur 2 #14)', () => {
  it('K-29 economy outOfMoves.extraMoves equals the core OFFER_MOVES (the +N shown = the moves added = the replayed amount)', () => {
    expect(economy.outOfMoves.extraMoves).toBe(OFFER_MOVES);
    expect(OFFER_ECONOMY.extraMoves).toBe(OFFER_MOVES);
    const m = offerModel({ n: 1, adAllowed: true, giftAvailable: true, coins: 0, ads: { kind: 'none' } });
    expect(m.coin.moves).toBe(OFFER_MOVES);
  });

  it('K-43 the level scene pays first (nothing changes when the wallet cannot pay) and logs +OFFER_MOVES', () => {
    const src = readFileSync(new URL('../../src/scenes/level/LevelScene.ts', import.meta.url), 'utf8');
    const take = src.slice(src.indexOf('  private takeOffer('), src.indexOf('  private showLoss('));
    const pay = take.indexOf('payOffer(');
    const accept = take.indexOf('game.acceptOffer(');
    expect(pay).toBeGreaterThan(0);
    expect(pay).toBeLessThan(accept);
    expect(take).toMatch(
      /if \(this\.attempt && !this\.attempt\.payOffer\(model, action, game\.movesMade\)\) return;/,
    );
    expect(take).toMatch(/amount: OFFER_MOVES, source: 'offerCoins'/);
  });
});
