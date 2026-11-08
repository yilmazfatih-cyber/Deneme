/**
 * One level attempt as the save and analytics see it (GDD K-28, K-29, K-43; TECH_DESIGN §11.1, §11.4; META §2, §3, §5;
 * ANALYTICS §2). The core `GameSession` decides the game; this class only records what happened:
 *
 * - start: `save.beginAttempt` (life reserved, `inLevel` with the `start` action) + `level_start`;
 * - every committed action: `save.recordAction` (K-43 resume log; written at once);
 * - out-of-moves window: `setOutcomeWindow('outOfMoves')` + `offer_shown`; paying an offer (coins or the lifetime-first
 *   gift) + `offer_result` / `coin_sink`; declining → loss;
 * - end: ONE `save.endAttempt` write per outcome — win (rewards, `recordWin`, streak +1), loss (the reserved life is
 *   charged, streak reset; K-29 decline or a confirmed exit with `m ≥ 1`), free exit (`m = 0`: life and pre-level
 *   boosters back, streak untouched, E-41) — then `level_end` (+ `coin_source`, `life_lost`). A commit that ends the game
 *   by itself (step 11 win, or out of moves with no offer left) is saved by `settle` right after the commit, BEFORE its
 *   cues and window (K-43: "kazanma anında"; a kill during the cues neither loses the rewards nor strands the attempt).
 *
 * Phase 2 stand-in for `meta/economy` + `meta/lives` + `meta/streak` (TECH §1.2, Phase 4): only the few wallet changes
 * the vertical slice needs, amounts from `config/economy.json`. Pure TypeScript (no Phaser): tests drive it with a
 * `MemoryStore` save and a `FakeClock`.
 */
import economy from '../../../config/economy.json' with { type: 'json' };
import type { CompiledLevel } from '../../core/level/compile.ts';
import { RULES_VERSION, levelHash } from '../../core/session.ts';
import type { GameSession, StreakBonus } from '../../core/session.ts';
import type { GameEvent, PreBooster, SessionAction } from '../../core/types.ts';
import type { AnalyticsEventOf, Track } from '../../services/analytics.ts';
import type { Clock } from '../../services/clock.ts';
import { addBoosters } from '../../services/save.ts';
import type { DeepReadonly, InLevel, SaveService } from '../../services/save.ts';
import { offerPrice } from '../../ui/offer.ts';
import type { OfferModel } from '../../ui/offer.ts';
import type { WinRewards } from '../../ui/rewards.ts';

export interface AttemptDeps {
  readonly save: SaveService;
  readonly track: Track;
  readonly clock: Clock;
}

export type StreakTier = 0 | 1 | 2 | 3;

/** META §5: the win streak counts from `winStreak.unlockLevel` (15) on; below it the counter does not move. */
export function streakActive(levelId: number): boolean {
  return levelId >= economy.winStreak.unlockLevel;
}

/** Level-start tier of streak `s` (META §5 table, `winStreak.tiers`: highest tier whose `minStreak ≤ s`). */
export function streakTierOf(levelId: number, winStreak: number): StreakTier {
  if (!streakActive(levelId)) return 0;
  let tier: StreakTier = 0;
  for (const t of economy.winStreak.tiers) if (winStreak >= t.minStreak) tier = t.tier as StreakTier;
  return tier;
}

/** `GameSession` `streakBonus` option: the tier's moves and trowels (META §5). */
export function streakBonusOf(tier: 1 | 2 | 3): StreakBonus {
  const t = economy.winStreak.tiers.find((x) => x.tier === tier);
  if (!t) throw new Error(`winStreak tier ${tier} missing in config/economy.json`);
  return { moves: t.extraMoves, trowels: t.trowels };
}

/** The smallest coin pack that covers `missing` coins (UX §7 "Altın yetmez": the store highlights it). */
export function packFor(missing: number): (typeof economy.shop.coinPacks)[number] {
  const packs = [...economy.shop.coinPacks].sort((a, b) => a.coins - b.coins);
  return packs.find((p) => p.coins >= missing) ?? (packs[packs.length - 1] as (typeof packs)[number]);
}

/** Store SKUs of ANALYTICS `purchase.sku`; a coin pack's `sku` must be one of them. */
export type CoinPackSku = AnalyticsEventOf<'purchase'>['sku'];

const PACK_SKUS: readonly string[] = [
  'coins_1000',
  'coins_2750',
  'coins_6000',
  'coins_13000',
  'coins_35000',
  'coins_75000',
];

/** A coin pack's SKU as an analytics SKU (throws on a config typo). */
export function packSku(sku: string): CoinPackSku {
  if (!PACK_SKUS.includes(sku)) throw new Error(`coin pack sku ${sku} is not an ANALYTICS purchase sku`);
  return sku as CoinPackSku;
}

export interface LossResult {
  /** The reserved life was charged (no unlimited lives). */
  readonly lifeLost: boolean;
  /** A streak `s > 0` was reset (window 2 `lose.streak`). */
  readonly streakLost: boolean;
}

/** How a game-ending commit was saved (`LevelAttempt.settle`); the scene opens its window when the cues end. */
export type AttemptEnd =
  | { readonly kind: 'win'; readonly rewards: WinRewards }
  | { readonly kind: 'loss'; readonly result: LossResult };

export class LevelAttempt {
  readonly levelId: number;
  readonly #deps: AttemptDeps;
  /** `inLevel.startedAt` (kept: `endAttempt` clears `inLevel` before `level_end` is sent). */
  readonly #startedAt: number;
  #wrong = 0;
  #truckHelps = 0;
  #ended = false;

  private constructor(deps: AttemptDeps, levelId: number) {
    this.#deps = deps;
    this.levelId = levelId;
    this.#startedAt = deps.save.data.inLevel?.startedAt ?? deps.clock.now();
  }

  /** A new attempt: `inLevel` + `start` action (one write), then `level_start`. */
  static begin(
    deps: AttemptDeps,
    lvl: CompiledLevel,
    start: { readonly preBoosters: readonly PreBooster[]; readonly streakTier: StreakTier },
  ): LevelAttempt {
    const d = deps.save.data;
    const unlimited = d.lives.unlimitedUntil > deps.clock.now();
    const attempt = deps.save.beginAttempt({
      levelId: lvl.id,
      seed: lvl.seed,
      mode: 'story',
      preBoosters: start.preBoosters,
      streakTier: start.streakTier,
      levelHash: levelHash(lvl.data),
      rulesVersion: RULES_VERSION,
      reserveLife: economy.lives.reserveOnLevelStart && !unlimited,
    });
    deps.track({
      name: 'level_start',
      level: lvl.id,
      attempt,
      mode: 'story',
      preBoosters: start.preBoosters.length,
    });
    return new LevelAttempt(deps, lvl.id);
  }

  /**
   * The attempt already in the save (K-43 resume: same attempt, `attempts` does not grow). `replayed` = the events of
   * `GameSession.replay` over the saved log: the counters of `level_end` (`wrongPlacements`, `truckHelps`) cover the
   * whole attempt, the moves before the kill included (ANALYTICS §2; review Faz 2 tur 1 #19).
   */
  static resumed(
    deps: AttemptDeps,
    inLevel: DeepReadonly<InLevel>,
    replayed: readonly GameEvent[] = [],
  ): LevelAttempt {
    const attempt = new LevelAttempt(deps, inLevel.levelId);
    attempt.observe(replayed);
    return attempt;
  }

  get ended(): boolean {
    return this.#ended;
  }

  /** Counts `level_end.wrongPlacements` and `truckHelps` from a committed move's events. */
  observe(events: readonly GameEvent[]): void {
    for (const e of events) {
      if (e.t === 'placementWrong' || e.t === 'mortarStuck') this.#wrong += 1;
      else if (e.t === 'truckHelp') this.#truckHelps += 1;
    }
  }

  /** A committed action (drag, trowel, undo; offers go through `payOffer`). Written at once (K-43). */
  recorded(action: SessionAction, movesMade: number): void {
    if (this.#ended) return;
    this.#deps.save.recordAction(action, { movesMade });
  }

  /**
   * Right after a commit (drag, trowel; also after a resume's replay): a game the commit ended is saved at once —
   * `won` → `win` with `rewards()`, `lost` (K-29: out of moves with no offer left) → `loss('lose')`. `null` while the game
   * goes on, waits on the out-of-moves window, or the attempt was already ended.
   */
  settle(session: GameSession, rewards: () => WinRewards): AttemptEnd | null {
    if (this.#ended) return null;
    if (session.outcome === 'won') {
      const r = rewards();
      this.win(session, r);
      return { kind: 'win', rewards: r };
    }
    if (session.outcome === 'lost') return { kind: 'loss', result: this.loss(session, 'lose') };
    return null;
  }

  /** "Altın al" in the out-of-moves window opened the (fake) store (ANALYTICS v5 `store_open.source`). */
  storeOpened(): void {
    this.#deps.track({ name: 'store_open', source: 'out_of_moves' });
  }

  /** Window 1 is open: a kill reopens the same offer (UX §1 (a)); `offer_shown` once per opening. */
  offerShown(model: OfferModel): void {
    if (this.#ended) return;
    const save = this.#deps.save;
    if (save.data.inLevel?.outcomeWindow !== 'outOfMoves') save.setOutcomeWindow('outOfMoves');
    this.#deps.track({
      name: 'offer_shown',
      offer: 'continue',
      placement: 'out_of_moves',
      offerIndex: model.n,
      priceCoins: offerPrice(model),
    });
  }

  /**
   * The coin option was taken: pays the price (0 for the gift, which is then used up), then records the accepted
   * offer action. Returns false (nothing changes) when the wallet cannot pay.
   */
  payOffer(model: OfferModel, action: SessionAction, movesMade: number): boolean {
    if (this.#ended || model.coin.kind === 'short') return false;
    const price = offerPrice(model);
    const save = this.#deps.save;
    if (save.data.coins < price) return false;
    const gift = model.coin.kind === 'gift';
    save.commit((d) => {
      d.coins -= price;
      if (gift) d.firstOfferGiftUsed = true;
    });
    save.recordAction(action, { movesMade, offerCoins: price });
    if (price > 0)
      this.#deps.track({
        name: 'coin_sink',
        amount: price,
        reason: 'continue',
        balanceAfter: save.data.coins,
      });
    this.#deps.track({
      name: 'offer_result',
      offer: 'continue',
      placement: 'out_of_moves',
      offerIndex: model.n,
      priceCoins: price,
      result: gift ? 'free' : 'coins',
    });
    return true;
  }

  /** "Hayır, teşekkürler" (or × ): the offer result; the caller then ends the attempt with `loss`. */
  declined(model: OfferModel): void {
    if (model.coin.kind === 'gift') this.#deps.save.commit((d) => void (d.firstOfferGiftUsed = true));
    this.#deps.track({
      name: 'offer_result',
      offer: 'continue',
      placement: 'out_of_moves',
      offerIndex: model.n,
      priceCoins: offerPrice(model),
      result: 'declined',
    });
  }

  /** Fake store purchase (MVP: no charge, BUSINESS E9): the pack's coins are added. */
  fakePurchase(sku: CoinPackSku): void {
    const pack = economy.shop.coinPacks.find((p) => p.sku === sku);
    if (!pack) throw new Error(`unknown coin pack ${sku}`);
    const save = this.#deps.save;
    save.commit((d) => {
      d.coins += pack.coins;
      d.payer = true;
    });
    this.#deps.track({ name: 'purchase', sku, fake: true });
    this.#deps.track({
      name: 'coin_source',
      amount: pack.coins,
      reason: 'purchase',
      balanceAfter: save.data.coins,
    });
  }

  /** K-28 win: rewards and progress in one write, then `coin_source` per source and `level_end`. */
  win(session: GameSession, rewards: WinRewards): void {
    if (this.#ended) return;
    this.#ended = true;
    const save = this.#deps.save;
    const id = this.levelId;
    save.endAttempt((d) => {
      const key = String(id);
      const rec = d.progress.levels[key] ?? { won: false, attempts: 0 };
      rec.won = true;
      d.progress.levels[key] = rec;
      d.progress.highestLevel = Math.max(d.progress.highestLevel, id);
      d.coins += rewards.totalCoins;
      d.stars += rewards.stars;
      if (streakActive(id)) d.winStreak += 1;
    });
    let balance = save.data.coins - rewards.totalCoins;
    const source = (amount: number, reason: 'level_win' | 'bonus' | 'golden_trowel'): void => {
      if (amount <= 0) return;
      balance += amount;
      this.#deps.track({ name: 'coin_source', amount, reason, balanceAfter: balance });
    };
    source(rewards.baseCoins, 'level_win');
    source(rewards.bonusCoins, 'bonus');
    source(rewards.trowelCoins, 'golden_trowel');
    this.#levelEnd(session, 'win', false);
  }

  /**
   * K-29 decline / no offer left, or a confirmed exit with `m ≥ 1` (K-43 item 2): the reserved life is charged and the
   * streak resets, in one write; then `life_lost` and `level_end`.
   */
  loss(session: GameSession, result: 'lose' | 'quit'): LossResult {
    if (this.#ended) return { lifeLost: false, streakLost: false };
    this.#ended = true;
    const save = this.#deps.save;
    const lifeLost = save.data.lives.reserved > 0;
    const streakLost = streakActive(this.levelId) && save.data.winStreak > 0;
    save.endAttempt((d) => {
      if (d.lives.reserved > 0) d.lives.stored = Math.max(0, d.lives.stored - 1);
      if (streakActive(this.levelId)) d.winStreak = 0;
    });
    if (lifeLost) this.#deps.track({ name: 'life_lost', level: this.levelId });
    this.#levelEnd(session, result, false);
    return { lifeLost, streakLost };
  }

  /** K-43 item 2 / E-41: exit at `m = 0` — life and pre-level boosters back, the streak bonus is not consumed. */
  exitFree(session: GameSession, refund: readonly PreBooster[]): void {
    if (this.#ended) return;
    this.#ended = true;
    const counts: Partial<Record<PreBooster, number>> = {};
    for (const p of refund) counts[p] = (counts[p] ?? 0) + 1;
    this.#deps.save.endAttempt((d) => addBoosters(d, counts));
    this.#levelEnd(session, 'quit', true);
  }

  /** ANALYTICS `tutorial_step` (completed or skipped by the lock guarantee: the same record, TECH §8.2). */
  tutorialStep(step: number): void {
    this.#deps.track({ name: 'tutorial_step', level: this.levelId, step });
  }

  #levelEnd(session: GameSession, result: 'win' | 'lose' | 'quit', exitFree: boolean): void {
    const yao = session.yao().yao;
    this.#deps.track({
      name: 'level_end',
      level: this.levelId,
      mode: 'story',
      result,
      movesLeft: session.movesLeft,
      wrongPlacements: this.#wrong,
      yao: yao === null ? 0 : Math.round(yao * 100),
      durationMs: Math.max(0, Math.round(this.#deps.clock.now() - this.#startedAt)),
      extensions: Math.min(3, session.offersUsed),
      exitFree,
      truckHelps: this.#truckHelps,
    });
  }
}
