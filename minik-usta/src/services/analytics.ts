/**
 * Analytics (docs/TECH_DESIGN.md §11.4; docs/ANALYTICS.md §2 v5, §3).
 *
 * `ANALYTICS_EVENTS` is the runtime copy of the ANALYTICS §2 table — event names, parameter names, types, enum values,
 * int ranges and `| null` — and `AnalyticsEvent` is DERIVED from it, so code and table cannot drift apart silently:
 * tests/services/analytics.test.ts parses ANALYTICS.md §2 / §3 and compares them with `ANALYTICS_EVENTS` /
 * `COMMON_PARAMS` both ways. A new event or parameter is added to the table first (entrepreneur + code-lead), then here.
 *
 * MVP sink: every event goes to a local ring buffer (last 500, shown by the debug panel) and, in development, to the
 * console. A provider adapter (Faz 5) is just another sink, added only after consent (§11.8, P-10). `track()` adds the
 * §3 common parameters at call time, so events sent after a save write (`save_corrupt`, `level_resume_invalid`,
 * `coin_source{refund}`) carry the new state.
 */
import type { Clock } from './clock.ts';

export type ParamSpec =
  | { readonly kind: 'int'; readonly min?: number; readonly max?: number; readonly nullable?: boolean }
  | { readonly kind: 'str'; readonly nullable?: boolean }
  | { readonly kind: 'bool'; readonly nullable?: boolean }
  | { readonly kind: 'enum'; readonly values: readonly string[]; readonly nullable?: boolean };

const int = (min?: number, max?: number) =>
  ({ kind: 'int', ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) }) as {
    readonly kind: 'int';
    readonly min?: number;
    readonly max?: number;
  };
const str = () => ({ kind: 'str' }) as const;
const bool = () => ({ kind: 'bool' }) as const;
const en = <const V extends readonly string[]>(...values: V) => ({ kind: 'enum', values }) as const;
const nullable = <S extends ParamSpec>(spec: S) =>
  ({ ...spec, nullable: true }) as S & { readonly nullable: true };

/** `booster_used.booster` = `config/economy.json → boosters` keys (the test checks this list against the config). */
export const BOOSTER_IDS = [
  'hammer',
  'crane',
  'undo',
  'paintBrush',
  'thermos',
  'trowelStart',
  'openShutter',
] as const;
export type BoosterId = (typeof BOOSTER_IDS)[number];

const MODE = en('story', 'master', 'replay');
const OFFER_FIELDS = {
  offer: en('continue', 'life', 'booster_plus', 'starter', 'piggy', 'pack', 'daily_double'),
  placement: en(
    'out_of_moves',
    'bridge_loss',
    'lives_zero',
    'daily_double',
    'in_level_plus',
    'pre_level_plus',
    'shop',
  ),
  offerIndex: nullable(int(1, 3)),
  priceCoins: nullable(int()),
};

/** ANALYTICS §2 v5 table, row by row (tests compare both ways). */
export const ANALYTICS_EVENTS = {
  app_open: {},
  save_corrupt: { stage: en('parse', 'migrate', 'validate'), recovered: en('backup', 'defaults') },
  tutorial_step: { level: int(), step: int() },
  level_start: { level: int(), attempt: int(), mode: MODE, preBoosters: int() },
  level_end: {
    level: int(),
    mode: MODE,
    result: en('win', 'lose', 'quit'),
    movesLeft: int(),
    wrongPlacements: int(),
    yao: int(0, 100),
    durationMs: int(),
    extensions: int(0, 3),
    exitFree: bool(),
    truckHelps: int(),
  },
  level_resume: { level: int(), movesMade: int() },
  level_resume_invalid: { level: int(), movesMade: int(), cause: en('level_hash', 'rules_version', 'both') },
  level_load_failed: { level: int(), stage: en('schema', 'logic'), code: nullable(str()) },
  booster_used: { booster: en(...BOOSTER_IDS), level: int() },
  offer_shown: { ...OFFER_FIELDS },
  offer_result: { ...OFFER_FIELDS, result: en('coins', 'ad', 'free', 'declined', 'unavailable') },
  purchase: {
    sku: en(
      'coins_1000',
      'coins_2750',
      'coins_6000',
      'coins_13000',
      'coins_35000',
      'coins_75000',
      'starter',
      'piggy_break',
    ),
    fake: bool(),
  },
  ad_rewarded: {
    placement: en('out_of_moves', 'bridge_loss', 'lives_zero', 'daily_double'),
    outcome: en('rewarded', 'skipped', 'unavailable'),
  },
  coin_source: {
    amount: int(),
    reason: en(
      'level_win',
      'bonus',
      'golden_trowel',
      'level_chest',
      'master_chest',
      'daily',
      'bridge',
      'league',
      'piggy_break',
      'purchase',
      'refund',
    ),
    balanceAfter: int(),
  },
  coin_sink: {
    amount: int(),
    reason: en('continue', 'lives', 'booster', 'pre_booster'),
    balanceAfter: int(),
  },
  event_join: {
    event: en('bridge', 'league'),
    eventInstanceId: str(),
    botSimVersion: str(),
    seedHash: str(),
  },
  event_continue: {
    event: en('bridge'),
    plank: int(0, 7),
    offerIndex: int(1, 3),
    payment: en('coins', 'ad', 'free'),
    runCoinsSpent: int(),
  },
  event_eliminated: { event: en('bridge'), plank: int() },
  event_end: {
    event: en('bridge', 'league'),
    result: en('finished', 'eliminated', 'timeout', 'week_end'),
    plank: nullable(int()),
    rank: nullable(int()),
    rewardCoins: int(),
  },
  star_spent: { task: str() },
  cutscene_missing: { scene: str() },
  life_lost: { level: int() },
  store_open: {
    source: en('nav', 'coin_plus', 'piggy', 'out_of_moves', 'bridge_loss', 'lives_zero', 'booster_plus'),
  },
  chest_open: { chest: en('level', 'league', 'master'), contentId: str() },
  session_end: { durationMs: int(), levelsPlayed: int() },
  settings_changed: {
    key: en('sound', 'music', 'haptics', 'lang', 'colorblind', 'reduceMotion', 'heavyGravitySlow'),
    value: str(),
  },
  age_gate_result: { bucket: en('<13', '13-17', '18+') },
  consent_result: { status: en('granted', 'denied'), version: str() },
} as const satisfies Readonly<Record<string, Readonly<Record<string, ParamSpec>>>>;

/** ANALYTICS §3 common parameters, added by `track()`. */
export const COMMON_PARAMS = {
  sessionId: str(),
  appVersion: str(),
  platform: en('web', 'android', 'ios'),
  lang: en('tr', 'en'),
  coins: int(),
  lives: int(),
  highestLevel: int(),
  payer: bool(),
} as const satisfies Readonly<Record<string, ParamSpec>>;

type Specs = typeof ANALYTICS_EVENTS;
export type AnalyticsEventName = keyof Specs;

type BaseType<S> = S extends { readonly kind: 'int' }
  ? number
  : S extends { readonly kind: 'str' }
    ? string
    : S extends { readonly kind: 'bool' }
      ? boolean
      : S extends { readonly kind: 'enum'; readonly values: readonly (infer V)[] }
        ? V
        : never;
type ParamType<S> = S extends { readonly nullable: true } ? BaseType<S> | null : BaseType<S>;
type ParamsOf<P> = { -readonly [K in keyof P]: ParamType<P[K]> };
type Flatten<T> = { [K in keyof T]: T[K] };

/** One analytics event = `{ name }` + its table parameters (TECH §11.4 union, derived). */
export type AnalyticsEvent = {
  [N in AnalyticsEventName]: Flatten<{ name: N } & ParamsOf<Specs[N]>>;
}[AnalyticsEventName];
export type AnalyticsEventOf<N extends AnalyticsEventName> = Extract<AnalyticsEvent, { name: N }>;
export type CommonParams = ParamsOf<typeof COMMON_PARAMS>;

function checkValue(where: string, spec: ParamSpec, value: unknown, issues: string[]): void {
  if (value === null) {
    if (spec.nullable !== true) issues.push(`${where}: null not allowed`);
    return;
  }
  switch (spec.kind) {
    case 'int':
      if (typeof value !== 'number' || !Number.isInteger(value)) issues.push(`${where}: expected int`);
      else if ((spec.min !== undefined && value < spec.min) || (spec.max !== undefined && value > spec.max)) {
        issues.push(`${where}: ${value} outside ${spec.min ?? '-∞'}…${spec.max ?? '∞'}`);
      }
      return;
    case 'str':
      if (typeof value !== 'string') issues.push(`${where}: expected string`);
      return;
    case 'bool':
      if (typeof value !== 'boolean') issues.push(`${where}: expected boolean`);
      return;
    case 'enum':
      if (typeof value !== 'string' || !spec.values.includes(value)) {
        issues.push(`${where}: "${String(value)}" not in enum(${spec.values.join(', ')})`);
      }
      return;
  }
}

function checkParams(
  where: string,
  specs: Readonly<Record<string, ParamSpec>>,
  obj: Readonly<Record<string, unknown>>,
  skip: readonly string[],
  issues: string[],
): void {
  for (const [p, spec] of Object.entries(specs)) {
    if (!Object.hasOwn(obj, p)) issues.push(`${where}.${p}: missing`);
    else checkValue(`${where}.${p}`, spec, obj[p], issues);
  }
  for (const p of Object.keys(obj)) {
    if (!skip.includes(p) && !Object.hasOwn(specs, p)) issues.push(`${where}.${p}: not in ANALYTICS §2`);
  }
}

/** Runtime check of one event against the table; `[]` = valid. */
export function validateEvent(event: unknown): string[] {
  const issues: string[] = [];
  if (typeof event !== 'object' || event === null) return ['event: not an object'];
  const obj = event as Record<string, unknown>;
  const name = obj['name'];
  if (typeof name !== 'string' || !Object.hasOwn(ANALYTICS_EVENTS, name)) {
    return [`event: unknown name "${String(name)}"`];
  }
  const specs = ANALYTICS_EVENTS[name as AnalyticsEventName] as Readonly<Record<string, ParamSpec>>;
  checkParams(name, specs, obj, ['name'], issues);
  return issues;
}

export function validateCommon(common: unknown): string[] {
  const issues: string[] = [];
  if (typeof common !== 'object' || common === null) return ['common: not an object'];
  checkParams('common', COMMON_PARAMS, common as Record<string, unknown>, [], issues);
  return issues;
}

/** Fixed-capacity ring buffer (analytics log, save diagnostics). */
export class RingBuffer<T> {
  readonly capacity: number;
  #items: T[] = [];

  constructor(capacity: number) {
    this.capacity = Math.max(1, capacity);
  }

  push(item: T): void {
    this.#items.push(item);
    if (this.#items.length > this.capacity) this.#items.splice(0, this.#items.length - this.capacity);
  }

  toArray(): readonly T[] {
    return [...this.#items];
  }

  get size(): number {
    return this.#items.length;
  }
}

export interface AnalyticsRecord {
  readonly seq: number;
  readonly at: number;
  readonly event: AnalyticsEvent;
  readonly common: CommonParams;
}

export type AnalyticsSink = (record: AnalyticsRecord) => void;

export interface AnalyticsOptions {
  readonly clock: Clock;
  /** Current §3 common parameters (read at every `track`). */
  readonly common: () => CommonParams;
  /** Ring buffer size (TECH §11.4: 500). */
  readonly capacity?: number;
  /** Log every event to the console (development). */
  readonly console?: boolean;
  /** Called for an event that does not match the table; the event is dropped. Default: `console.error`. */
  readonly onInvalid?: (issues: readonly string[], event: unknown) => void;
}

export type Track = (event: AnalyticsEvent) => void;

export class Analytics {
  readonly #opts: AnalyticsOptions;
  readonly #log: RingBuffer<AnalyticsRecord>;
  readonly #sinks = new Set<AnalyticsSink>();
  #seq = 0;

  constructor(opts: AnalyticsOptions) {
    this.#opts = opts;
    this.#log = new RingBuffer(opts.capacity ?? 500);
  }

  /** Validates, stamps and records one event. Invalid events are dropped (never thrown into the game loop). */
  readonly track: Track = (event) => {
    const common = this.#opts.common();
    const issues = [...validateEvent(event), ...validateCommon(common)];
    if (issues.length > 0) {
      (this.#opts.onInvalid ?? ((i) => console.error('[analytics] invalid event', i)))(issues, event);
      return;
    }
    const record: AnalyticsRecord = { seq: this.#seq++, at: this.#opts.clock.now(), event, common };
    this.#log.push(record);
    if (this.#opts.console === true) console.debug('[analytics]', event.name, event);
    for (const sink of this.#sinks) {
      try {
        sink(record);
      } catch (err) {
        console.error('[analytics] sink failed', err);
      }
    }
  };

  /** Adds a sink (Faz 5 provider adapter, after consent); returns the remover. */
  addSink(sink: AnalyticsSink): () => void {
    this.#sinks.add(sink);
    return () => this.#sinks.delete(sink);
  }

  /** The local ring buffer, oldest first. */
  recent(): readonly AnalyticsRecord[] {
    return this.#log.toArray();
  }
}
