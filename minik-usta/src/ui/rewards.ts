/**
 * Win rewards shown by the win screen (GDD K-28; UX_FLOWS §6; META §3.1; JUICE #56; STORY §7.6 `win.*`). Pure: amounts
 * come from `config/economy.json → levelRewards` and `stars` (D-017), never from code or text.
 *
 * - Base: `winCoins[difficulty]`.
 * - Bonus İnşaat: every move left becomes `bonusCoinsPerMoveLeft` coins, at most `bonusMaxMovesCounted` moves count
 *   (the rest only fade on the counter, JUICE #56).
 * - Leftover Golden Trowels: `coinsPerLeftoverTrowel` each (K-28, K-33: trowels do not carry over).
 * - Stars: `stars.perWin`.
 */
import economy from '../../config/economy.json' with { type: 'json' };

export type Difficulty = keyof typeof economy.levelRewards.winCoins;

export interface RewardEconomy {
  readonly winCoins: Readonly<Record<Difficulty, number>>;
  readonly bonusCoinsPerMoveLeft: number;
  readonly bonusMaxMovesCounted: number;
  readonly coinsPerLeftoverTrowel: number;
  readonly starsPerWin: number;
}

export const REWARD_ECONOMY: RewardEconomy = Object.freeze({
  winCoins: Object.freeze({ ...economy.levelRewards.winCoins }),
  bonusCoinsPerMoveLeft: economy.levelRewards.bonusCoinsPerMoveLeft,
  bonusMaxMovesCounted: economy.levelRewards.bonusMaxMovesCounted,
  coinsPerLeftoverTrowel: economy.levelRewards.coinsPerLeftoverTrowel,
  starsPerWin: economy.stars.perWin,
});

export interface WinInput {
  readonly difficulty: Difficulty;
  readonly movesLeft: number;
  /** Golden Trowels held at the win. */
  readonly trowels: number;
}

export interface WinRewards {
  readonly baseCoins: number;
  /** Moves that turn into coins (`win.bonus {n}`). */
  readonly bonusMoves: number;
  readonly bonusCoins: number;
  /** `win.trowel {n}` (line only when > 0). */
  readonly trowels: number;
  readonly trowelCoins: number;
  readonly stars: number;
  readonly totalCoins: number;
}

export function winRewards(input: WinInput, eco: RewardEconomy = REWARD_ECONOMY): WinRewards {
  const baseCoins = eco.winCoins[input.difficulty];
  const bonusMoves = Math.max(0, Math.min(input.movesLeft, eco.bonusMaxMovesCounted));
  const bonusCoins = bonusMoves * eco.bonusCoinsPerMoveLeft;
  const trowels = Math.max(0, input.trowels);
  const trowelCoins = trowels * eco.coinsPerLeftoverTrowel;
  return {
    baseCoins,
    bonusMoves,
    bonusCoins,
    trowels,
    trowelCoins,
    stars: eco.starsPerWin,
    totalCoins: baseCoins + bonusCoins + trowelCoins,
  };
}
