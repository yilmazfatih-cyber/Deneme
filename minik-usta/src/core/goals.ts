/**
 * Goal counters (docs/GDD.md K-41, K-28; TECH_DESIGN §2.4 `goals` section, §6.2 steps 7–8, §7.2 S4).
 *
 * One counter per `lvl.goals[i]` (the state's goal section, same order):
 * - `build`: completed segments, target S (UX goal panel "2/4"). It changes when a segment completes (K-35 step 8), so
 *   its `goalProgress` event carries step 8; the other goals are reported in step 7.
 * - `clear` / `collect`: counted where the effect happens — crate destroyed, chain removed, screw collected (obstacle
 *   rules, Phase 3) and debris leaving the site (core, `countDebrisLeftSite`, K-41: each debris at most once, at the
 *   moment it leaves the site; moved debris broken or moved again later does not count again).
 * A counter never passes its target: the goal stays "done" and the surplus is not counted (K-41).
 */
import { Zone } from './types.ts';
import type { PieceId } from './types.ts';
import { FLAG_BIT, H, goalValue, hdr, pieceFlags, pieceZone, setGoalValue } from './state.ts';
import type { GameState } from './state.ts';
import type { CompiledLevel } from './level/compile.ts';
import type { GoalData } from './level/schema.ts';

/** Countable targets of `clear` / `collect` goals (GDD K-41). */
export type GoalCountKind = 'crate' | 'chain' | 'debris' | 'screw';
export type GoalKind = 'build' | GoalCountKind;

/** What a goal counts. */
export function goalKind(goal: GoalData): GoalKind {
  if (goal.type === 'build') return 'build';
  if (goal.type === 'clear') return goal.target;
  return goal.item;
}

/** Target of goal `i`: S for `build`, `count` otherwise. */
export function goalTarget(lvl: CompiledLevel, i: number): number {
  const goal = lvl.goals[i];
  if (!goal) return 0;
  return goal.type === 'build' ? lvl.segments.length : goal.count;
}

/** Goal `i` reached its target. */
export function goalDone(s: GameState, i: number): boolean {
  return goalValue(s, i) >= goalTarget(s.lvl, i);
}

/**
 * Adds `n` to every goal counting `kind` (capped at its target, K-41). Returns the indices whose value changed.
 * Called by obstacle rules (crate, chain, screw) and by `countDebrisLeftSite`.
 */
export function addGoalCount(s: GameState, kind: GoalCountKind, n = 1): number[] {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`addGoalCount: bad amount ${n}`);
  const changed: number[] = [];
  s.lvl.goals.forEach((goal, i) => {
    if (goalKind(goal) !== kind) return;
    const before = goalValue(s, i);
    const after = Math.min(goalTarget(s.lvl, i), before + n);
    if (after !== before) {
      setGoalValue(s, i, after);
      changed.push(i);
    }
  });
  return changed;
}

/** Writes the completed segment count into every `build` goal (K-35 step 8). Returns the indices that changed. */
export function setBuildProgress(s: GameState, completed: number): number[] {
  const changed: number[] = [];
  s.lvl.goals.forEach((goal, i) => {
    if (goal.type !== 'build') return;
    const value = Math.min(goalTarget(s.lvl, i), completed);
    if (goalValue(s, i) !== value) {
      setGoalValue(s, i, value);
      changed.push(i);
    }
  });
  return changed;
}

/**
 * K-41 `clear: debris`: a debris block counts once, when it leaves the site (moved to the yard, by drag — FREE or rail,
 * K-12 exception — or later by crane / hammer). `startZone` = the piece's zone at move start. Returns true when the
 * debris left the site in this move (the counter itself may already be at its target).
 */
export function countDebrisLeftSite(s: GameState, pieceId: PieceId, startZone: number): boolean {
  if (startZone !== Zone.site) return false;
  if ((pieceFlags(s, pieceId) & FLAG_BIT.debris) === 0) return false;
  if (pieceZone(s, pieceId) === Zone.site) return false;
  addGoalCount(s, 'debris', 1);
  return true;
}

/** Every goal other than `build` reached its target (K-28, E-27). */
export function extraGoalsMet(s: GameState): boolean {
  return s.lvl.goals.every((goal, i) => goal.type === 'build' || goalDone(s, i));
}

/** Every segment is complete: `deliveryCursor` counts completed segments (K-22, K-23, K-28). */
export function allSegmentsComplete(s: GameState): boolean {
  return hdr(s, H.deliveryCursor) >= s.lvl.segments.length;
}

/** K-28: every segment complete and every extra goal met. */
export function levelGoalsMet(s: GameState): boolean {
  return allSegmentsComplete(s) && extraGoalsMet(s);
}

/** Goal values in `lvl.goals` order (snapshot at move start, compared in step 7). */
export function goalSnapshot(s: GameState): number[] {
  return s.lvl.goals.map((_, i) => goalValue(s, i));
}

/** Indices of the non-`build` goals whose value differs from `before` (K-35 step 7 `goalProgress`). */
export function changedCountGoals(s: GameState, before: readonly number[]): number[] {
  const out: number[] = [];
  s.lvl.goals.forEach((goal, i) => {
    if (goal.type !== 'build' && goalValue(s, i) !== (before[i] ?? 0)) out.push(i);
  });
  return out;
}

/** Goal panel row (UX goal panel: `value/target`, ✓ when done). */
export interface GoalView {
  readonly index: number;
  readonly kind: GoalKind;
  readonly value: number;
  readonly target: number;
  readonly done: boolean;
}

export function goalViews(s: GameState): GoalView[] {
  return s.lvl.goals.map((goal, i) => ({
    index: i,
    kind: goalKind(goal),
    value: goalValue(s, i),
    target: goalTarget(s.lvl, i),
    done: goalDone(s, i),
  }));
}
