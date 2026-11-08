/**
 * Debug rule switches (docs/TECH_DESIGN.md §12.3; R-20: development only). Pure: no DOM, no Phaser.
 *
 * Every switch goes through a core API — the debug layer decides no game rule itself:
 * - Unlimited moves: the K-35 step 4 base-cost hook (`MoveHooks.moveCost`) returns 0, so the core keeps `movesLeft`
 *   and still emits `movesChanged` (delta 0) and `m += 1` (TECH §12.3 "çekirdek `movesLeft` azalmaz; olay yine
 *   yayınlanır"). A glass penalty (S3, Phase 3) is not a base cost and still applies.
 * - Obstacle rules: `levelHooks(lvl, { disabled })`, the registry's debug switch (TECH §7.1 `disabledRules`). A rule
 *   with no hook (a core model: W1 rail, S1 segments, S2 `.` validation — all Phase 2 rules) cannot be switched off,
 *   so its switch is shown but not enabled.
 * - Gravity: the K-19 profile is level data (`gravity.build`, `gravity.yard`, compiled by core `loadLevel`), so it is
 *   overridden in the level data (levelOverride.ts) and the level is compiled again.
 */
import type { CompiledLevel } from '../core/level/compile.ts';
import type { MoveHooks } from '../core/moves.ts';
import { levelHooks, ruleSet } from '../core/obstacles/registry.ts';
import type { ObstacleRule, RuleId } from '../core/obstacles/types.ts';

export type BuildGravity = CompiledLevel['gravity']['build'];
export const BUILD_GRAVITIES: readonly BuildGravity[] = ['low', 'normal', 'high'];

export interface DebugRules {
  /** K-35 step 4 base cost 0 (TECH §12.3). */
  readonly unlimitedMoves: boolean;
  /** Obstacle rules switched off (TECH §7.1 `disabledRules`). */
  readonly disabledRules: ReadonlySet<RuleId>;
  /** Yard gravity (Y6, K-20) override; null = the level's value. */
  readonly yardGravity: boolean | null;
  /** Build gravity profile (K-19) override; null = the level's value. */
  readonly buildGravity: BuildGravity | null;
}

export const NO_DEBUG_RULES: DebugRules = Object.freeze({
  unlimitedMoves: false,
  disabledRules: new Set<RuleId>(),
  yardGravity: null,
  buildGravity: null,
});

/** The debug base cost of a move: nothing (unlimited moves). */
const FREE_MOVE = (): number => 0;

/**
 * Hooks for a new session of `lvl` under `rules`; undefined when no session-level switch is on (the caller's hooks
 * stay untouched, so an idle debug panel changes nothing). `base` = the caller's hooks (default: the level's
 * registry hooks).
 */
export function sessionHooks(lvl: CompiledLevel, rules: DebugRules, base?: MoveHooks): MoveHooks | undefined {
  if (!rules.unlimitedMoves && rules.disabledRules.size === 0) return undefined;
  const hooks =
    rules.disabledRules.size > 0
      ? levelHooks(lvl, { disabled: rules.disabledRules })
      : (base ?? levelHooks(lvl));
  return rules.unlimitedMoves ? Object.freeze({ ...hooks, moveCost: FREE_MOVE }) : hooks;
}

/** A rule plugin provides at least one hook (a function other than `appliesTo`). */
export function ruleHasHooks(rule: ObstacleRule): boolean {
  return Object.entries(rule).some(([key, value]) => key !== 'appliesTo' && typeof value === 'function');
}

/** One switch of the obstacle list: the level's active rules (registry order). */
export interface RuleSwitch {
  readonly id: RuleId;
  /** False for a core-model rule (no hook): switching it off would change nothing. */
  readonly switchable: boolean;
}

export function ruleSwitches(lvl: CompiledLevel): RuleSwitch[] {
  return ruleSet(lvl).rules.map((r) => ({ id: r.id, switchable: ruleHasHooks(r) }));
}

/** The gravity part of the level data (`LevelData.gravity`). */
export interface GravityData {
  build: BuildGravity;
  yard: boolean;
}

/** The level's gravity with the debug overrides applied. */
export function overriddenGravity(level: Readonly<GravityData>, rules: DebugRules): GravityData {
  return {
    build: rules.buildGravity ?? level.build,
    yard: rules.yardGravity ?? level.yard,
  };
}

/** Any switch that changes how an attempt plays (the level is reopened under the new rules). */
export function rulesActive(rules: DebugRules): boolean {
  return (
    rules.unlimitedMoves ||
    rules.disabledRules.size > 0 ||
    rules.yardGravity !== null ||
    rules.buildGravity !== null
  );
}
