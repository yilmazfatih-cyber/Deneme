/**
 * "Hamleler bitti!" window 1 model (GDD K-29; UX_FLOWS §7; D-024 / R-15; STORY §7.3; META §3.2–3.3). Pure: it only
 * turns the core's open offer (`GameSession.nextOffer()`: number `n`, ad allowed) plus the wallet and the ad state into
 * what the window shows. Prices, move counts and caps come from `config/economy.json` (D-017: numbers never in texts).
 *
 * - Equal options (R-15): coins (orange), ad (cream, only on offer 1), "Hayır, teşekkürler" (cream). Hierarchy only by
 *   colour; the escalation and the cap are visible ("Teklif n/3", the last one "· son teklif").
 * - Lifetime-first offer (META §3.2, K-29): the coin option is free ("Usta Dede'den hediye"), no price, no ad.
 * - Not enough coins: the coin option becomes "Altın al · eksik ● N" (the fake store covers it, UX §7 "Altın yetmez").
 * - Ads (META §3.3): the option is never hidden; with no ad provider (web MVP) it is grey with `ads.none`, at the daily
 *   cap grey with `ads.tomorrow`, else enabled with `lose.adToday` "bugün {n}/{max}" (n = today's watched + 1).
 */
import economy from '../../config/economy.json' with { type: 'json' };
import { OFFER_MOVES } from '../core/session.ts';

export interface OfferEconomy {
  /**
   * +N of the coin option: the core's `OFFER_MOVES` — what `GameSession.acceptOffer` adds and the replay checks (review
   * Faz 2 tur 2 #14); `outOfMoves.extraMoves` must equal it (tests/ui/windows.test.ts).
   */
  readonly extraMoves: number;
  /** `outOfMoves.offerCosts[n − 1]`. */
  readonly offerCosts: readonly number[];
  readonly maxOffers: number;
  readonly firstEverOfferFree: boolean;
  readonly adExtraMoves: number;
  readonly adPerDay: number;
}

export const OFFER_ECONOMY: OfferEconomy = Object.freeze({
  extraMoves: OFFER_MOVES,
  offerCosts: Object.freeze([...economy.outOfMoves.offerCosts]),
  maxOffers: economy.outOfMoves.maxOffersPerAttempt,
  firstEverOfferFree: economy.outOfMoves.firstEverOfferFree,
  adExtraMoves: economy.outOfMoves.rewardedAdOffer.extraMoves,
  adPerDay: economy.outOfMoves.rewardedAdOffer.perDay,
});

/** Rewarded-ad availability (TECH §11.8 `AdsService`; the web MVP has none). */
export type AdAvailability =
  { readonly kind: 'none' } | { readonly kind: 'available'; readonly watchedToday: number };

export interface OfferInput {
  /** Core `nextOffer()`. */
  readonly n: number;
  readonly adAllowed: boolean;
  /** `!save.firstOfferGiftUsed`. */
  readonly giftAvailable: boolean;
  readonly coins: number;
  readonly ads: AdAvailability;
}

export type CoinOption =
  | { readonly kind: 'gift'; readonly moves: number }
  | { readonly kind: 'buy'; readonly moves: number; readonly price: number }
  | { readonly kind: 'short'; readonly moves: number; readonly price: number; readonly missing: number };

export type AdLine =
  | { readonly key: 'lose.adToday'; readonly n: number; readonly max: number }
  | { readonly key: 'ads.none' }
  | { readonly key: 'ads.tomorrow' };

export interface AdOption {
  readonly enabled: boolean;
  readonly moves: number;
  readonly line2: AdLine;
}

export interface OfferModel {
  readonly n: number;
  readonly max: number;
  /** `lose.offer.last` only when `n = max` (STORY §7.3). */
  readonly counterKey: 'lose.offer.count' | 'lose.offer.last';
  readonly coin: CoinOption;
  /** null: no ad option at all (offer 2–3, lifetime-first gift). */
  readonly ad: AdOption | null;
}

export function offerModel(input: OfferInput, eco: OfferEconomy = OFFER_ECONOMY): OfferModel {
  const { n } = input;
  if (!Number.isInteger(n) || n < 1 || n > eco.maxOffers) throw new RangeError(`offerModel: offer ${n}`);
  const gift = eco.firstEverOfferFree && input.giftAvailable && n === 1;
  const price = eco.offerCosts[n - 1] ?? eco.offerCosts[eco.offerCosts.length - 1] ?? 0;
  const coin: CoinOption = gift
    ? { kind: 'gift', moves: eco.extraMoves }
    : input.coins >= price
      ? { kind: 'buy', moves: eco.extraMoves, price }
      : { kind: 'short', moves: eco.extraMoves, price, missing: price - input.coins };
  let ad: AdOption | null = null;
  if (input.adAllowed && !gift) {
    const ads = input.ads;
    if (ads.kind === 'none') ad = { enabled: false, moves: eco.adExtraMoves, line2: { key: 'ads.none' } };
    else if (ads.watchedToday >= eco.adPerDay)
      ad = { enabled: false, moves: eco.adExtraMoves, line2: { key: 'ads.tomorrow' } };
    else
      ad = {
        enabled: true,
        moves: eco.adExtraMoves,
        line2: { key: 'lose.adToday', n: ads.watchedToday + 1, max: eco.adPerDay },
      };
  }
  return {
    n,
    max: eco.maxOffers,
    counterKey: n >= eco.maxOffers ? 'lose.offer.last' : 'lose.offer.count',
    coin,
    ad,
  };
}

/** Coins actually paid when the coin option is taken (0 for the gift; the save's `offerSpendCoins`, K-43/4). */
export function offerPrice(model: OfferModel): number {
  return model.coin.kind === 'gift' ? 0 : model.coin.price;
}
