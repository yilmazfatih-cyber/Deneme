/**
 * Obstacle registry (docs/TECH_DESIGN.md §7.1, §7.3).
 *
 * `ALL_RULES` lists every rule plugin, one file each. `levelHooks(lvl)` keeps the rules the level uses (`appliesTo`),
 * sorts them by `order` and composes their hooks into the pipeline's `MoveHooks` (core/moves.ts), cached per
 * CompiledLevel. `applyMove` uses it unless the caller passes its own hooks; the scene passes `levelHooks(lvl).drag`
 * to `beginDrag` and `levelHooks(lvl).fall` to `computeFall` (shadow), so preview and move run the same rules.
 *
 * Composition (active rules in `order`; core never branches on a rule id):
 * - `canPick`: every rule must allow · `canPassGap`, `onPassGap`: the owner of the gap's type (`ruleByGapType`); a gap
 *   whose owner has no `canPassGap` reads its `open` field (the movement default).
 * - `modifyFall`: chained · `onLanded`: first non-`none` effect · `onPlacement`: first non-`default` override ·
 *   `onYardRelease`: every rule · `moveCost`: the largest defined value (none → base 1 in the pipeline).
 * - `onNeighborMoved`: an obstacle goes to the owner of its type, a block to the owners of its flags (strongest effect)
 *   · `onCellUncovered`: the owner of the hidden item's type.
 * - `timers`: `onMoveEnd` by rule id plus the site strategy's S5 / S6 ticks; the pipeline calls them in `lvl.step10`
 *   order (GDD K-35 step 10), never in `order`. The K-40 Open Shutter expiry joins in Phase 3.
 * A hook that no active rule provides stays undefined: a Phase 2 level (W1, S1, S2 are core models) gets empty hooks.
 * `validateRules` rejects a malformed table when this module loads (e.g. `onMoveEnd` without `moveEndOrder`, §7.3).
 */
import type { PieceFlag, PieceId, Verdict } from '../types.ts';
import { FLAG_BIT, GF, gapField, pieceFlags } from '../state.ts';
import type { GameState } from '../state.ts';
import { STEP10_TIMERS } from '../level/compile.ts';
import type { CompiledLevel, TimerId } from '../level/compile.ts';
import { NO_EFFECT } from '../gravity.ts';
import type { FallPlan, FallResult, FallRules, LandingEffect } from '../gravity.ts';
import type { DragRules } from '../movement.ts';
import type { PlacementOverride, PlacementRules } from '../placement.ts';
import type { BoardCell } from '../grid.ts';
import { siteStrategy } from '../site.ts';
import type { SiteStrategy } from '../site.ts';
import type { MoveHooks } from '../moves.ts';
import { RULE_IDS, RULE_ORDER_BASE, obstacleInfoKey, ruleZone } from './types.ts';
import type {
  EntityRef,
  GapType,
  NeighborEffect,
  ObstacleInfoKey,
  ObstacleRule,
  ObstacleType,
  RuleContext,
  RuleId,
  TimerHook,
} from './types.ts';
import { W1_staticGap } from './W1_staticGap.ts';
import { S1_slidingSite } from './S1_slidingSite.ts';
import { S2_planVoid } from './S2_planVoid.ts';

/** Every rule plugin (TECH §7.1). Phase 2: W1, S1, S2; a new obstacle adds one line here. */
export const ALL_RULES: readonly ObstacleRule[] = Object.freeze([W1_staticGap, S1_slidingSite, S2_planVoid]);

// --- validation --------------------------------------------------------------------------------------------------------

const TIMER_ORDER: ReadonlyMap<string, number> = new Map(STEP10_TIMERS.map((t) => [t.id, t.order]));
const INFO_KEY_FORMAT = /^obs\.[a-z0-9]+\.desc$/;

function isTimerId(id: string): id is TimerId {
  return TIMER_ORDER.has(id);
}

/**
 * Step-10 ticks of the site strategy (TECH §7.1 `SiteStrategy.onCarouselTick` / `onElevatorTick`, §7.3): S5 does not
 * tick in a move whose step 8 turned the platform (K-23, `MoveScratch.rotatedAtStep8`); S6 moves the frame (K-24).
 * These ids are not available to a rule's `onMoveEnd`.
 */
const SITE_TICKS: Readonly<Partial<Record<TimerId, (site: SiteStrategy) => TimerHook>>> = Object.freeze({
  S5:
    (site: SiteStrategy): TimerHook =>
    (ctx) => {
      if (ctx.scratch.rotatedAtStep8) return;
      const front = site.carouselTick(ctx.s);
      if (front !== null) ctx.emit({ t: 'carouselRotated', front });
    },
  S6:
    (site: SiteStrategy): TimerHook =>
    (ctx) => {
      ctx.emit({ t: 'elevatorMoved', offset: site.elevatorTick(ctx.s) });
    },
});

/** Problems of a rule table (empty = valid). TECH §7.1 / §7.3 contracts; see the module comment. */
export function validateRules(rules: readonly ObstacleRule[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const orders = new Map<number, RuleId>();
  const owners = new Map<string, RuleId>();
  for (const r of rules) {
    const where = `rule ${r.id}`;
    if (!(RULE_IDS as readonly string[]).includes(r.id)) {
      errors.push(`${where}: unknown rule id`);
      continue;
    }
    if (ids.has(r.id)) errors.push(`${where}: duplicate id`);
    ids.add(r.id);
    if (r.zone !== ruleZone(r.id)) errors.push(`${where}: zone ${r.zone} ≠ ${ruleZone(r.id)}`);
    const base = RULE_ORDER_BASE[ruleZone(r.id)];
    if (!Number.isInteger(r.order) || r.order <= base || r.order >= base + 100)
      errors.push(`${where}: order ${r.order} is outside ${base + 1}…${base + 99} (TECH §7.3)`);
    const twin = orders.get(r.order);
    if (twin !== undefined) errors.push(`${where}: order ${r.order} is also used by ${twin}`);
    else orders.set(r.order, r.id);

    const prefix = obstacleInfoKey(r.id).slice(0, -'.desc'.length);
    if (r.infoKeys.length === 0) errors.push(`${where}: no info card key (OBSTACLES R-08)`);
    for (const k of r.infoKeys)
      if (!INFO_KEY_FORMAT.test(k) || !k.startsWith(prefix))
        errors.push(`${where}: info card key ${k} is not ${prefix}….desc`);

    if (r.onMoveEnd) {
      const timerOrder = TIMER_ORDER.get(r.id);
      if (r.moveEndOrder === undefined) errors.push(`${where}: onMoveEnd needs moveEndOrder (TECH §7.3)`);
      else if (timerOrder === undefined || (isTimerId(r.id) && SITE_TICKS[r.id]))
        errors.push(`${where}: ${r.id} has no rule timer in K-35 step 10 (STEP10_TIMERS)`);
      else if (r.moveEndOrder !== timerOrder)
        errors.push(`${where}: moveEndOrder ${r.moveEndOrder} ≠ K-35 step 10 position ${timerOrder}`);
    } else if (r.moveEndOrder !== undefined) {
      errors.push(`${where}: moveEndOrder without onMoveEnd`);
    }

    const own = r.owns ?? {};
    const claims: readonly (readonly [string, string | undefined])[] = [
      ['obstacle', own.obstacle],
      ['pieceFlag', own.pieceFlag],
      ['gapType', own.gapType],
    ];
    for (const [kind, value] of claims) {
      if (value === undefined) continue;
      const prev = owners.get(`${kind}:${value}`);
      if (prev !== undefined) errors.push(`${where}: ${kind} ${value} is already owned by ${prev}`);
      else owners.set(`${kind}:${value}`, r.id);
    }
    if ((r.canPassGap || r.onPassGap) && own.gapType === undefined)
      errors.push(`${where}: canPassGap / onPassGap need owns.gapType`);
    if (r.onNeighborMoved && own.obstacle === undefined && own.pieceFlag === undefined)
      errors.push(`${where}: onNeighborMoved needs owns.obstacle or owns.pieceFlag`);
    if (r.onCellUncovered && own.obstacle === undefined)
      errors.push(`${where}: onCellUncovered needs owns.obstacle`);
  }
  return errors;
}

/** Throws when `rules` is not a valid rule table. */
export function assertValidRules(rules: readonly ObstacleRule[]): void {
  const errors = validateRules(rules);
  if (errors.length > 0) throw new Error(`obstacle registry:\n  ${errors.join('\n  ')}`);
}

assertValidRules(ALL_RULES);

// --- active rule set ---------------------------------------------------------------------------------------------------

/** The rules of one level, in `order`, with the ownership tables (TECH §7.1). */
export interface RuleSet {
  readonly rules: readonly ObstacleRule[];
  readonly ruleByObstacleType: ReadonlyMap<ObstacleType, ObstacleRule>;
  readonly ruleByPieceFlag: ReadonlyMap<PieceFlag, ObstacleRule>;
  readonly ruleByGapType: ReadonlyMap<GapType, ObstacleRule>;
}

export interface RuleOptions {
  /** Debug panel only (development, TECH §7.1 `disabledRules`): rules switched off. */
  readonly disabled?: ReadonlySet<RuleId>;
  /** A rule table instead of `ALL_RULES` (tests); it is validated first. */
  readonly rules?: readonly ObstacleRule[];
}

/** Active rules of `lvl` (`appliesTo`, not disabled), sorted by `order`, and their ownership tables. */
export function ruleSet(lvl: CompiledLevel, opts: RuleOptions = {}): RuleSet {
  if (opts.rules) assertValidRules(opts.rules);
  const table = opts.rules ?? ALL_RULES;
  const rules = table
    .filter((r) => !(opts.disabled?.has(r.id) ?? false) && r.appliesTo(lvl))
    .sort((a, b) => a.order - b.order);
  const ruleByObstacleType = new Map<ObstacleType, ObstacleRule>();
  const ruleByPieceFlag = new Map<PieceFlag, ObstacleRule>();
  const ruleByGapType = new Map<GapType, ObstacleRule>();
  for (const r of rules) {
    if (r.owns?.obstacle !== undefined) ruleByObstacleType.set(r.owns.obstacle, r);
    if (r.owns?.pieceFlag !== undefined) ruleByPieceFlag.set(r.owns.pieceFlag, r);
    if (r.owns?.gapType !== undefined) ruleByGapType.set(r.owns.gapType, r);
  }
  return Object.freeze({ rules: Object.freeze(rules), ruleByObstacleType, ruleByPieceFlag, ruleByGapType });
}

/** Ids of the active rules of `lvl`, in `order`. */
export function activeRuleIds(lvl: CompiledLevel, opts: RuleOptions = {}): RuleId[] {
  return ruleSet(lvl, opts).rules.map((r) => r.id);
}

/**
 * Info card keys of the level's obstacles, in rule order (OBSTACLES R-08; the scene shows a card on the first
 * encounter and on tap). Only keys of mechanics the level really uses (S7 covers S7-R and S7-M).
 */
export function infoKeysFor(lvl: CompiledLevel, opts: RuleOptions = {}): ObstacleInfoKey[] {
  const used = new Set<string>(lvl.mechanics.map(obstacleInfoKey));
  return ruleSet(lvl, opts).rules.flatMap((r) => r.infoKeys.filter((k) => used.has(k)));
}

// --- hook composition --------------------------------------------------------------------------------------------------

const CACHE = new WeakMap<CompiledLevel, MoveHooks>();

/**
 * The pipeline hooks of `lvl` (TECH §7.1): composed once per CompiledLevel and cached; with `opts` (debug panel,
 * tests) they are composed fresh.
 */
export function levelHooks(lvl: CompiledLevel, opts: RuleOptions = {}): MoveHooks {
  if (opts.disabled !== undefined || opts.rules !== undefined) return composeHooks(lvl, ruleSet(lvl, opts));
  let hooks = CACHE.get(lvl);
  if (!hooks) {
    hooks = composeHooks(lvl, ruleSet(lvl));
    CACHE.set(lvl, hooks);
  }
  return hooks;
}

type HookKey = {
  [K in keyof ObstacleRule]-?: NonNullable<ObstacleRule[K]> extends (...args: never[]) => unknown ? K : never;
}[keyof ObstacleRule];

/** The `key` hooks of `rules`, in order. */
function hooksOf<K extends HookKey>(rules: readonly ObstacleRule[], key: K): NonNullable<ObstacleRule[K]>[] {
  const out: NonNullable<ObstacleRule[K]>[] = [];
  for (const r of rules) {
    const f = r[key];
    if (f !== undefined) out.push(f as NonNullable<ObstacleRule[K]>);
  }
  return out;
}

const EFFECT_RANK: Readonly<Record<NeighborEffect, number>> = { none: 0, affected: 1, freed: 2 };
const DEFAULT_OVERRIDE: PlacementOverride = Object.freeze({ kind: 'default' });

/** `MoveHooks` of a rule set; every field is set only when an active rule provides that hook. */
export function composeHooks(lvl: CompiledLevel, set: RuleSet): MoveHooks {
  const drag = composeDrag(set);
  const fall = composeFall(set.rules);
  const placement = composePlacement(set.rules);
  const onPassGap = composePassGap(set);
  const onYardRelease = composeYardRelease(set.rules);
  const moveCost = composeMoveCost(set.rules);
  const onNeighborMoved = composeNeighborMoved(set);
  const onCellUncovered = composeCellUncovered(set);
  const timers = composeTimers(lvl, set.rules);
  return Object.freeze({
    ...(drag ? { drag } : {}),
    ...(fall ? { fall } : {}),
    ...(placement ? { placement } : {}),
    ...(onPassGap ? { onPassGap } : {}),
    ...(onYardRelease ? { onYardRelease } : {}),
    ...(moveCost ? { moveCost } : {}),
    ...(onNeighborMoved ? { onNeighborMoved } : {}),
    ...(onCellUncovered ? { onCellUncovered } : {}),
    ...(timers ? { timers } : {}),
  });
}

function gapOwner(set: RuleSet, s: GameState, gap: number): ObstacleRule | undefined {
  const g = s.lvl.gaps[gap];
  return g ? set.ruleByGapType.get(g.type) : undefined;
}

function composeDrag(set: RuleSet): DragRules | undefined {
  const pickers = hooksOf(set.rules, 'canPick');
  const gated = set.rules.some((r) => r.canPassGap !== undefined);
  if (pickers.length === 0 && !gated) return undefined;
  const canPick = (s: GameState, id: PieceId): boolean => pickers.every((f) => f(s, id));
  const canPassGap = (s: GameState, gap: number, id: PieceId): boolean => {
    const decide = gapOwner(set, s, gap)?.canPassGap;
    return decide ? decide(s, gap, id) : gapField(s, gap, GF.open) !== 0;
  };
  return Object.freeze({
    ...(pickers.length > 0 ? { canPick } : {}),
    ...(gated ? { canPassGap } : {}),
  });
}

function composeFall(rules: readonly ObstacleRule[]): FallRules | undefined {
  const mods = hooksOf(rules, 'modifyFall');
  const lands = hooksOf(rules, 'onLanded');
  if (mods.length === 0 && lands.length === 0) return undefined;
  const modifyFall = (s: GameState, id: PieceId, plan: FallPlan): FallPlan => {
    let p = plan;
    for (const f of mods) p = f(s, id, p);
    return p;
  };
  const onLanded = (s: GameState, id: PieceId, fall: Omit<FallResult, 'effect'>): LandingEffect => {
    for (const f of lands) {
      const e = f(s, id, fall);
      if (e.kind !== 'none') return e;
    }
    return NO_EFFECT;
  };
  return Object.freeze({
    ...(mods.length > 0 ? { modifyFall } : {}),
    ...(lands.length > 0 ? { onLanded } : {}),
  });
}

function composePlacement(rules: readonly ObstacleRule[]): PlacementRules | undefined {
  const fns = hooksOf(rules, 'onPlacement');
  if (fns.length === 0) return undefined;
  const onPlacement = (
    s: GameState,
    id: PieceId,
    cells: readonly BoardCell[],
    verdict: Verdict,
  ): PlacementOverride => {
    for (const f of fns) {
      const o = f(s, id, cells, verdict);
      if (o.kind !== 'default') return o;
    }
    return DEFAULT_OVERRIDE;
  };
  return Object.freeze({ onPlacement });
}

function composePassGap(set: RuleSet): MoveHooks['onPassGap'] {
  if (!set.rules.some((r) => r.onPassGap !== undefined)) return undefined;
  return (ctx: RuleContext, gap: number, id: PieceId): void => {
    gapOwner(set, ctx.s, gap)?.onPassGap?.(ctx, gap, id);
  };
}

function composeYardRelease(rules: readonly ObstacleRule[]): MoveHooks['onYardRelease'] {
  const fns = hooksOf(rules, 'onYardRelease');
  if (fns.length === 0) return undefined;
  return (ctx: RuleContext, id: PieceId): void => {
    for (const f of fns) f(ctx, id);
  };
}

function composeMoveCost(rules: readonly ObstacleRule[]): MoveHooks['moveCost'] {
  const fns = hooksOf(rules, 'moveCost');
  if (fns.length === 0) return undefined;
  return (ctx: RuleContext, id: PieceId): number | undefined => {
    let best: number | undefined;
    for (const f of fns) {
      const c = f(ctx, id);
      if (c !== undefined && (best === undefined || c > best)) best = c;
    }
    return best;
  };
}

function composeNeighborMoved(set: RuleSet): MoveHooks['onNeighborMoved'] {
  if (!set.rules.some((r) => r.onNeighborMoved !== undefined)) return undefined;
  const byFlag: { readonly bit: number; readonly f: NonNullable<ObstacleRule['onNeighborMoved']> }[] = [];
  for (const r of set.rules) {
    const flag = r.owns?.pieceFlag;
    if (flag !== undefined && r.onNeighborMoved) byFlag.push({ bit: FLAG_BIT[flag], f: r.onNeighborMoved });
  }
  return (ctx: RuleContext, entity: EntityRef, moved: PieceId): NeighborEffect => {
    if (entity.kind === 'obstacle') {
      const o = ctx.lvl.obstacles[entity.index];
      const f = o ? set.ruleByObstacleType.get(o.type)?.onNeighborMoved : undefined;
      return f ? f(ctx, entity, moved) : 'none';
    }
    const flags = pieceFlags(ctx.s, entity.id);
    let out: NeighborEffect = 'none';
    for (const { bit, f } of byFlag) {
      if ((flags & bit) === 0) continue;
      const e = f(ctx, entity, moved);
      if (EFFECT_RANK[e] > EFFECT_RANK[out]) out = e;
    }
    return out;
  };
}

function composeCellUncovered(set: RuleSet): MoveHooks['onCellUncovered'] {
  if (!set.rules.some((r) => r.onCellUncovered !== undefined)) return undefined;
  return (ctx: RuleContext, obstacle: number): void => {
    const o = ctx.lvl.obstacles[obstacle];
    if (o) set.ruleByObstacleType.get(o.type)?.onCellUncovered?.(ctx, obstacle);
  };
}

function composeTimers(lvl: CompiledLevel, rules: readonly ObstacleRule[]): MoveHooks['timers'] {
  const out: Partial<Record<TimerId, TimerHook>> = {};
  for (const r of rules) if (r.onMoveEnd && isTimerId(r.id)) out[r.id] = r.onMoveEnd;
  const site = siteStrategy(lvl);
  for (const t of lvl.step10) {
    const make = SITE_TICKS[t.id];
    if (make) out[t.id] = make(site);
  }
  return Object.keys(out).length > 0 ? Object.freeze(out) : undefined;
}
