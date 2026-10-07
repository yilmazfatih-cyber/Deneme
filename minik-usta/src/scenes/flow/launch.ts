/**
 * Where the game opens and which level the minimal home offers (UX_FLOWS §1, §2, §6 "Faz 2 dikey dilimi", §12; GDD
 * K-43 item 3–4; D-018 prologue on first launch; TECH_DESIGN §14.1 #12). Pure decisions over the save data.
 *
 * Launch (after `save.resumeOnLaunch`):
 * - an attempt to resume → the level screen, Pause window (or the same out-of-moves offer, UX §1 (a));
 * - a voided attempt → home, the `resume.void` window first (UX §1 (c));
 * - first launch (prologue not seen, no level won) → the 3-panel intro, then straight into Level 1 (UX §2);
 * - otherwise → home.
 *
 * Home button (Phase 2 slice: levels 1–5 loop): after a win the next slice level, after a loss the same level; after a
 * voided attempt (UX §1 (c) "aynı bölümü Bölüm düğmesiyle yeniden başlatır") that attempt's level; on a cold start the
 * level after the highest won one. Once level 5 is won, the `home.moreSoon` band shows and the button opens
 * Level 1 again. UX §2.2 step 11: right after Level 1, "BÖLÜM 2" pulses until Level 2 is first tried.
 */
import type { SessionAction } from '../../core/types.ts';
import type { DeepReadonly, ResumeDecision, SaveData } from '../../services/save.ts';
import { SLICE_LEVELS, nextSliceLevel } from '../level/levels.ts';

/** `town.seenScenes` id of the 3-panel intro (economy.json `town.cutscenes.prologue`, META §1). */
export const PROLOGUE_SCENE = 'story.prologue';

export type LaunchRoute =
  | { readonly kind: 'intro' }
  | { readonly kind: 'home' }
  | {
      readonly kind: 'level';
      readonly levelId: number;
      readonly resume: readonly SessionAction[];
      readonly window: 'pause' | 'outOfMoves';
    };

export function launchRoute(data: DeepReadonly<SaveData>, decision: ResumeDecision): LaunchRoute {
  if (decision.kind === 'resume') {
    return {
      kind: 'level',
      levelId: decision.inLevel.levelId,
      resume: decision.inLevel.actions as readonly SessionAction[],
      window: decision.window,
    };
  }
  if (decision.kind === 'void') return { kind: 'home' };
  const prologueSeen = data.town.seenScenes.includes(PROLOGUE_SCENE);
  if (!prologueSeen && data.progress.highestLevel === 0) return { kind: 'intro' };
  return { kind: 'home' };
}

/** The level the home screen got back from (win → next level, loss / exit → the same level). */
export interface LastLevel {
  readonly levelId: number;
  readonly won: boolean;
}

export interface HomeTarget {
  /** Level the "BÖLÜM N" button opens. */
  readonly next: number;
  /** `home.moreSoon` band (the slice's content end is reached). */
  readonly moreSoon: boolean;
  /** UX §2.2 step 11: the button pulses. */
  readonly pulse: boolean;
}

export function homeTarget(data: DeepReadonly<SaveData>, last: LastLevel | null): HomeTarget {
  const highest = data.progress.highestLevel;
  const voided = data.voidNotice?.level;
  if (!last && voided !== undefined) last = { levelId: voided, won: false };
  const next = last
    ? last.won
      ? nextSliceLevel(last.levelId)
      : last.levelId
    : highest >= SLICE_LEVELS
      ? 1
      : highest + 1;
  const triedNext = (data.progress.levels[String(next)]?.attempts ?? 0) > 0;
  return {
    next,
    moreSoon: highest >= SLICE_LEVELS,
    pulse: next === 2 && highest === 1 && !triedNext,
  };
}

/** Home data after a voided attempt (UX §1 (c)): the button keeps that level after the notice is dismissed. */
export function voidedLast(data: DeepReadonly<SaveData>): LastLevel | undefined {
  const level = data.voidNotice?.level;
  return level === undefined ? undefined : { levelId: level, won: false };
}
