/**
 * Which body lines a level window shows (STORY §7.3, §7.5 "Çıkış onayı ve devam"; UX_FLOWS §5.1, §7; GDD K-43 item 2,
 * D-022, META §5). Pure: keys only, the windows translate them.
 *
 * Exit confirm (future tense): `m = 0` → `exit.free` (+ `exit.refund` when pre-level boosters were used); `m ≥ 1` →
 * `exit.cost`, `exit.streak` (only with a win streak `s > 0`), `exit.bridge` (only in a Wobbly Bridge run), in this
 * order. Window 2 of a loss (past tense): `lose.life` + `lose.streak` (only when a streak was reset).
 */
import type { I18nKey } from '../services/i18n.ts';

export interface ExitInput {
  /** GDD `m`: completed moves. */
  readonly movesMade: number;
  /** Pre-level boosters of the attempt (K-40). */
  readonly preBoosters: number;
  /** Win streak `s` before leaving. */
  readonly winStreak: number;
  /** The attempt counts for a Wobbly Bridge run. */
  readonly bridge: boolean;
}

export type ExitKind = 'free' | 'loss';

export function exitKind(movesMade: number): ExitKind {
  return movesMade >= 1 ? 'loss' : 'free';
}

export function exitLines(input: ExitInput): I18nKey[] {
  if (exitKind(input.movesMade) === 'free')
    return input.preBoosters > 0 ? ['exit.free', 'exit.refund'] : ['exit.free'];
  const out: I18nKey[] = ['exit.cost'];
  if (input.winStreak > 0) out.push('exit.streak');
  if (input.bridge) out.push('exit.bridge');
  return out;
}

/** Window 2 lines; `streakLost` = the loss reset a streak `s > 0` (META §5). */
export function lossLines(streakLost: boolean): I18nKey[] {
  return streakLost ? ['lose.life', 'lose.streak'] : ['lose.life'];
}
