/**
 * Obstacle plugin interface (docs/TECH_DESIGN.md §7.1–§7.3; rules: docs/OBSTACLES.md, docs/GDD.md K-35).
 *
 * Every obstacle (W1–W8, Y1–Y8, S1–S8) and gravity profile (G-H, G-L) is ONE `ObstacleRule` in its own file. The
 * registry (registry.ts) keeps the rules of the levels that use them (`appliesTo`), sorts them by `order` (§7.3) and
 * composes their hooks into the pipeline's `MoveHooks` (core/moves.ts). Core code never branches on an obstacle id:
 * a new obstacle = a new file + one line in `ALL_RULES`.
 *
 * Hook signatures follow the move pipeline (TECH §7.1, refined in Phase 2):
 * - board hooks take the state, because the scene also calls them outside a move (drag preview `beginDrag`, shadow
 *   `computeFall`): `canPick`, `canPassGap`, `modifyFall`, `onLanded`, `onPlacement`;
 * - move hooks take the `RuleContext` of the running move (events at the current K-35 step, the state's RNG, the
 *   move scratch): `onPassGap`, `onYardRelease`, `moveCost`, `onNeighborMoved`, `onCellUncovered`, `onMoveEnd`.
 * Obstacle state lives in the generic state-buffer fields (gap open / y / phase, obstacle hp, piece flags / counter),
 * so a plugin writes no hashing or cloning code (Zobrist covers those fields, TECH §2.6).
 *
 * Site modes (S1 segments, S5 carousel, S6 elevator) are strategies of core/site.ts; the registry turns their step-10
 * ticks into timer hooks (§7.3). Rules whose behaviour is a core model (W1 rail, W2/W3 wall data, Y5 heavy shapes,
 * Y6 yard gravity, S1 segments, S2 `.` validation) carry no hook: the plugin only declares `appliesTo`, its rank and
 * its info card (the "öğretici bayrağı" of TECH §7.2).
 */
import type { PieceFlag } from '../types.ts';
import type { CompiledGap, CompiledLevel, CompiledObstacle } from '../level/compile.ts';
import type { MechanicId } from '../level/schema.ts';
import type { DragRules } from '../movement.ts';
import type { FallRules } from '../gravity.ts';
import type { PlacementRules } from '../placement.ts';
import type { EntityRef, MoveHooks, NeighborEffect, RuleContext } from '../moves.ts';

export type { EntityRef, NeighborEffect, RuleContext };

/** Rule ids (OBSTACLES.md): one plugin per id. S7 covers both hidden-plan mechanics (S7-R, S7-M). */
export const RULE_IDS = [
  'W1',
  'W2',
  'W3',
  'W4',
  'W5',
  'W6',
  'W7',
  'W8',
  'Y1',
  'Y2',
  'Y3',
  'Y4',
  'Y5',
  'Y6',
  'Y7',
  'Y8',
  'S1',
  'S2',
  'S3',
  'S4',
  'S5',
  'S6',
  'S7',
  'S8',
  'G-H',
  'G-L',
] as const;
export type RuleId = (typeof RULE_IDS)[number];

/** OBSTACLES zone of a rule: W wall, Y yard, S site, G gravity. */
export type RuleZone = 'wall' | 'yard' | 'site' | 'gravity';

/** TECH §7.3: hook call order W (100s) → Y (200s) → S (300s) → G (400s). An `order` is `base + 1 … base + 99`. */
export const RULE_ORDER_BASE: Readonly<Record<RuleZone, number>> = Object.freeze({
  wall: 100,
  yard: 200,
  site: 300,
  gravity: 400,
});

/** The zone a rule id belongs to (its first letter). */
export function ruleZone(id: RuleId): RuleZone {
  const p = id.charAt(0);
  return p === 'W' ? 'wall' : p === 'Y' ? 'yard' : p === 'S' ? 'site' : 'gravity';
}

export type ObstacleType = CompiledObstacle['type'];
export type GapType = CompiledGap['type'];

/**
 * Entities a rule owns (TECH §7.1 `owns`). The registry builds `ruleByObstacleType`, `ruleByPieceFlag` and
 * `ruleByGapType` from it, so `onNeighborMoved`, `onCellUncovered`, `canPassGap` and `onPassGap` go straight to the
 * owner. Each entity type has at most one owner.
 */
export interface RuleOwnership {
  readonly obstacle?: ObstacleType;
  readonly pieceFlag?: PieceFlag;
  readonly gapType?: GapType;
}

/** i18n key of an obstacle info card (OBSTACLES R-08): `obs.{id}.desc`, id lower case without the dash. */
export type ObstacleInfoKey = `obs.${string}.desc`;

/** `W1` → `obs.w1.desc`, `G-H` → `obs.gh.desc`, `S7-R` → `obs.s7r.desc` (OBSTACLES R-08). */
export function obstacleInfoKey(id: MechanicId | RuleId): ObstacleInfoKey {
  return `obs.${id.toLowerCase().replace('-', '')}.desc`;
}

/** The level uses mechanic `id` (derived from its data signature only, K-45/9; core/level/mechanics.ts). */
export function usesMechanic(lvl: CompiledLevel, id: MechanicId): boolean {
  return lvl.mechanics.includes(id);
}

type Hook<T> = NonNullable<T>;

/** A step-10 timer (K-35 step 10). */
export type TimerHook = (ctx: RuleContext) => void;

/** One obstacle / gravity rule (TECH §7.1 `ObstacleRule`). Every hook is optional. */
export interface ObstacleRule {
  readonly id: RuleId;
  readonly zone: RuleZone;
  /** Hook call order inside one hook (§7.3); unique; inside the zone's hundred (`RULE_ORDER_BASE`). */
  readonly order: number;
  /** Info card keys shown on the first encounter / on tap (OBSTACLES R-08); one per mechanic the rule covers. */
  readonly infoKeys: readonly ObstacleInfoKey[];
  /** The level uses this rule (normally its OBSTACLES data signature, `usesMechanic`). */
  readonly appliesTo: (lvl: CompiledLevel) => boolean;
  readonly owns?: RuleOwnership;

  // --- board hooks (state only; also called by the scene outside a move) ---
  /** K-09 (c): false forbids picking the block (Y3 chain, Y4 wet). All active rules must agree. */
  readonly canPick?: Hook<DragRules['canPick']>;
  /** RAIL condition 4 for gaps of the owned `gapType` (W4, W7, K-40 included); the owner decides alone. */
  readonly canPassGap?: Hook<DragRules['canPassGap']>;
  /** K-35 step 2: wind drift / balloon direction (W8, S8); chained in rule order. */
  readonly modifyFall?: Hook<FallRules['modifyFall']>;
  /** K-35 step 2: landing effect (S3 glass); the first non-`none` effect wins. */
  readonly onLanded?: Hook<FallRules['onLanded']>;
  /** K-35 step 3, wrong placements only: `stick` (Y8); the first `stick` wins. */
  readonly onPlacement?: Hook<PlacementRules['onPlacement']>;

  // --- move hooks (RuleContext of the running move) ---
  /** K-35 step 1: the drag passed the rail of a gap of the owned `gapType` (`move.via`, W6). */
  readonly onPassGap?: Hook<MoveHooks['onPassGap']>;
  /** K-35 step 2: a block was released in the yard (S8 balloon rises). */
  readonly onYardRelease?: Hook<MoveHooks['onYardRelease']>;
  /** K-35 step 4 base cost (Y8 stuck: 2); undefined = no opinion. Several rules → the largest; none → 1 (K-07). */
  readonly moveCost?: Hook<MoveHooks['moveCost']>;
  /** K-35 steps 5–6: a yard entity of the owned obstacle type / piece flag next to the moved or fallen block. */
  readonly onNeighborMoved?: Hook<MoveHooks['onNeighborMoved']>;
  /** K-35 steps 5–6 (K-42): the cell of a hidden item of the owned obstacle type is empty (Y7 screw, W7 key). */
  readonly onCellUncovered?: Hook<MoveHooks['onCellUncovered']>;
  /** K-35 step 10 timer; needs `moveEndOrder` and an id of `STEP10_TIMERS` (W4, W5, Y4). */
  readonly onMoveEnd?: TimerHook;
  /** GDD K-35 step 10 position of `onMoveEnd` (= `STEP10_TIMERS` order of the id), independent of `order`. */
  readonly moveEndOrder?: number;
}

/** Freezes a rule (and its `infoKeys` / `owns`); plugin files declare their rule with it. */
export function defineRule(rule: ObstacleRule): ObstacleRule {
  return Object.freeze({
    ...rule,
    infoKeys: Object.freeze([...rule.infoKeys]),
    ...(rule.owns ? { owns: Object.freeze({ ...rule.owns }) } : {}),
  });
}
