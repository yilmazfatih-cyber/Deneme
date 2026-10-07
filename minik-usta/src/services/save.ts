/**
 * Save service (docs/TECH_DESIGN.md §11.1; GDD K-43, §14; ANALYTICS §2 `save_corrupt`, `level_resume`,
 * `level_resume_invalid`, `coin_source{refund}`, §3 order).
 *
 * Storage: one JSON document `{ v, data }` under `minikusta.save`, a copy of the last successful write under
 * `minikusta.save.bak`. Load = JSON parse → migration chain `v → v+1 → …` → zod/mini schema; a failing main save is
 * kept as text under `minikusta.save.corrupt` (local only), then the backup is tried, then defaults; the recovery write
 * happens first and `save_corrupt{ stage, recovered }` is tracked once AFTER it.
 *
 * Writes: `commit()` writes at once (level end, purchase, star spend, settings, every committed in-level action);
 * `update()` coalesces other changes for 500 ms; `appHidden()` (`visibilitychange: hidden`, `pagehide`) first lets the
 * game session commit a pending G-L move (`setPendingFlusher`, TECH §4.7 rule (5)) and then writes immediately.
 *
 * In-level resume (K-43, R-13): `inLevel` = move log (`actions[]`, `start` first) + level hash + rules version + offer
 * counters. `beginAttempt` → `recordAction` per action (after K-35 step 12) → `endAttempt`. On launch,
 * `resumeOnLaunch` either resumes (`level_resume`), or — on a level hash / rules version mismatch — voids the attempt
 * penalty-free in one atomic write (`voidAttempt`: refunds + `voidNotice`) and then tracks `level_resume_invalid` and,
 * when coins were refunded, `coin_source{ reason: 'refund' }`.
 *
 * Schema rule: v1 is not frozen until the first store release; a field added before that uses `z._default` so
 * development saves keep loading. After the first release every shape change bumps `SAVE_VERSION`, adds
 * `MIGRATIONS[old]` and a fixture test (old JSON → expected new JSON).
 */
import * as z from 'zod/mini';
import { COLOR_CODES } from '../core/types.ts';
import type { PreBooster, SessionAction } from '../core/types.ts';
import { BOOSTER_IDS, RingBuffer } from './analytics.ts';
import type { BoosterId, Track } from './analytics.ts';
import type { Clock, Scheduler, TimerHandle } from './clock.ts';
import { onAppHidden, randomId } from './platform.ts';

export const SAVE_KEY = 'minikusta.save';
export const BACKUP_KEY = 'minikusta.save.bak';
export const CORRUPT_KEY = 'minikusta.save.corrupt';
export const SAVE_VERSION = 1;
/** Coalescing window of `update()` (TECH §11.1). */
export const SAVE_DEBOUNCE_MS = 500;

// ---------------------------------------------------------------------------------------------------------------
// Key-value storage

/** Web: localStorage · Capacitor (Faz 5): @capacitor/preferences loaded into memory at start. */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export class MemoryStore implements KeyValueStore {
  readonly map = new Map<string, string>();

  get(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.map.set(key, value);
  }

  remove(key: string): void {
    this.map.delete(key);
  }
}

/** `localStorage` when it works (a probe write succeeds), else an in-memory store (private mode, blocked storage). */
export function browserStore(): KeyValueStore {
  try {
    const s = globalThis.localStorage;
    const probe = 'minikusta.probe';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return {
      get: (k) => s.getItem(k),
      set: (k, v) => s.setItem(k, v),
      remove: (k) => s.removeItem(k),
    };
  } catch {
    return new MemoryStore();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Schema v1

const nonNeg = () => z.int().check(z.gte(0));
const level = () => z.int().check(z.gte(1));

const PRE_BOOSTERS = ['thermos', 'trowelStart', 'openShutter'] as const satisfies readonly PreBooster[];
const PreBoosterSchema = z.enum(PRE_BOOSTERS);
const BoosterIdSchema = z.enum(BOOSTER_IDS);
const StreakTierSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const ModeSchema = z.enum(['story', 'master', 'replay']);

/** `SessionAction` (TECH §6.1) as stored in the move log. */
export const SessionActionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('drag'),
    pieceId: nonNeg(),
    to: z.object({ ix: z.int(), iy: z.int(), mode: nonNeg() }),
    via: z.optional(nonNeg()),
    steer: z.optional(z.object({ dir: z.union([z.literal(-1), z.literal(1)]), atRow: z.int() })),
  }),
  z.object({
    kind: z.literal('hammer'),
    target: z.union([z.object({ pieceId: nonNeg() }), z.object({ obstacle: nonNeg() })]),
  }),
  z.object({
    kind: z.literal('crane'),
    pieceId: nonNeg(),
    to: z.object({ zone: z.enum(['yard', 'site']), x: z.int(), y: z.int() }),
    rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  }),
  z.object({ kind: z.literal('paint'), pieceId: nonNeg(), color: z.enum(COLOR_CODES) }),
  z.object({
    kind: z.literal('trowel'),
    seg: nonNeg(),
    x: z.union([z.literal(0), z.literal(1)]),
    y: z.int(),
  }),
  z.object({
    kind: z.literal('addMoves'),
    amount: z.int(),
    source: z.enum(['offerCoins', 'offerAd', 'thermos', 'streak']),
  }),
  z.object({ kind: z.literal('undo') }),
  z.object({
    kind: z.literal('start'),
    preBoosters: z.array(PreBoosterSchema),
    streakTier: StreakTierSchema,
  }),
]);

/**
 * K-43 tutorial position (TECH §8.2 "K-43 devamında öğretici", review Faz 2 tur 3 #1): the step the player saw, so a
 * resume reopens it exactly — the action log alone cannot (a cancelled drag's `overWall` / `gapPass` is not logged,
 * a hold has no duration in it). `index` = step index in the sorted `tutorial[]` (`tutorial.length` = finished),
 * `shown` = on screen (false: waiting for its `startOn`), `count` = events counted toward its `done` / `startOn`,
 * `actions` = how many `actions[]` entries (`start` included) the position includes: the move ends after it (a kill
 * while the last move's cues played) are applied on resume.
 */
export const TutorialAtSchema = z.object({
  index: nonNeg(),
  shown: z.boolean(),
  count: nonNeg(),
  actions: z.int().check(z.gte(1)),
});
export type TutorialAt = z.output<typeof TutorialAtSchema>;

/**
 * Running attempt (TECH §11.1 `InLevel`; GDD K-43 item 3). Fields beyond TECH: `mode` (the same `level_end.mode` after a
 * resume), `movesMade` (`m` after the last action, for `level_resume*` without replay), `bridgeEventId` (the attempt
 * counts for a Wobbly Bridge run: `voidAttempt` lowers that run's spend and sets `voidNotice.bridge`).
 */
export const InLevelSchema = z.object({
  levelId: level(),
  seed: z.int(),
  mode: ModeSchema,
  preBoosters: z.array(PreBoosterSchema),
  streakTier: StreakTierSchema,
  actions: z.array(SessionActionSchema),
  movesMade: nonNeg(),
  offersUsed: nonNeg(),
  adOfferUsed: z.boolean(),
  offerSpendCoins: nonNeg(),
  outcomeWindow: z.enum(['none', 'outOfMoves']),
  levelHash: z.string(),
  rulesVersion: z.int(),
  attemptId: z.string(),
  startedAt: z.number(),
  bridgeEventId: z.nullable(z.string()),
  /** The tutorial step on screen (`TutorialAtSchema`); null = no tutorial position yet (level without one, old save). */
  tutorial: z._default(z.nullable(TutorialAtSchema), null),
});

/** `recordAction` counters: `m` after the action and the coins paid for an accepted offer. */
const ActionCountsSchema = z.object({ movesMade: nonNeg(), offerCoins: z.optional(nonNeg()) });

/** Pending home window after a voided attempt (UX §1 (c), TECH §11.1). */
export const VoidNoticeSchema = z.object({
  level: level(),
  refunds: z.object({
    life: z.union([z.literal(0), z.literal(1)]),
    boosters: z.partialRecord(BoosterIdSchema, z.int().check(z.gte(1))),
    coins: nonNeg(),
  }),
  bridge: z.boolean(),
});

export const SettingsSchema = z.object({
  sound: z.boolean(),
  music: z.boolean(),
  haptics: z.boolean(),
  lang: z.enum(['tr', 'en']),
  colorblind: z.boolean(),
  reduceMotion: z.boolean(),
  /** Settings > Accessibility "Zaman baskısını azalt" (G-H holdMs 1400, R-11). */
  heavyGravitySlow: z.boolean(),
});

export const SaveDataSchema = z.object({
  /** Analytics identity (ANALYTICS §3 has no user id; kept for the Faz 5 provider). */
  analyticsId: z.string().check(z.minLength(1)),
  /** Only used for the League `groupId = hash32(weekId, installId)` (TECH §11.2). */
  installId: z.string().check(z.minLength(1)),
  progress: z.object({
    /** Highest story level won (0 = none yet). */
    highestLevel: nonNeg(),
    /** GDD §14: `levels[id] = { won, attempts }`; `attempts` is analytics only (`level_start.attempt`). */
    levels: z.record(
      z.string().check(z.regex(/^[1-9]\d*$/)),
      z.object({ won: z.boolean(), attempts: nonNeg() }),
    ),
  }),
  stars: nonNeg(),
  coins: nonNeg(),
  lives: z.object({
    stored: nonNeg(),
    regenAnchor: z.number(),
    unlimitedUntil: z.number(),
    /** Life held by the running attempt (META: "ayrılır"); meta/lives subtracts it from the shown count. */
    reserved: z.union([z.literal(0), z.literal(1)]),
  }),
  boosters: z.object({
    inventory: z.partialRecord(BoosterIdSchema, nonNeg()),
    /** Boosters whose `freeTrials` were already granted at unlock (META §4). */
    freeTrialsGranted: z.array(BoosterIdSchema),
  }),
  winStreak: nonNeg(),
  town: z.object({ completedTasks: z.array(z.string()), seenScenes: z.array(z.string()) }),
  piggy: z.object({ coins: nonNeg() }),
  /** Event participations by event instance id: join time and the run's coin spend (`bridgeSpendCapCoins`). */
  events: z.record(z.string(), z.object({ joinedAt: z.number(), runSpend: nonNeg() })),
  settings: SettingsSchema,
  /** K-29 lifetime-first +5 gift used. */
  firstOfferGiftUsed: z.boolean(),
  /** ANALYTICS §3 `payer` (at least one purchase; fake purchases count in the MVP). */
  payer: z.boolean(),
  /** GDD §14.1/2: `tut.ctx.<topic>` shown once per account. */
  seenContextTips: z.record(z.string(), z.boolean()),
  inLevel: z.nullable(InLevelSchema),
  voidNotice: z.nullable(VoidNoticeSchema),
  pendingChest: z.nullable(z.enum(['level', 'master'])),
  /** Latest wall-clock time seen; time-based counters freeze here if the clock goes back (TECH §11.2–11.3). */
  lastSeenNow: z.number(),
});

export type SaveData = z.output<typeof SaveDataSchema>;
export type InLevel = z.output<typeof InLevelSchema>;
export type VoidNotice = z.output<typeof VoidNoticeSchema>;
export type Settings = z.output<typeof SettingsSchema>;
export type StoredAction = z.output<typeof SessionActionSchema>;
export type GameMode = z.output<typeof ModeSchema>;

// Compile-time guards: the stored log round-trips `SessionAction`, and every `PreBooster` is listed.
const toSessionAction = (a: StoredAction): SessionAction => a;
const toStoredAction = (a: SessionAction): StoredAction => a as StoredAction;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export const PRE_BOOSTERS_COMPLETE: Equal<(typeof PRE_BOOSTERS)[number], PreBooster> = true;
export const asSessionActions = (actions: readonly StoredAction[]): SessionAction[] =>
  actions.map(toSessionAction);

export type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

/** `config/economy.json → startingWallet`. */
export interface StartingWallet {
  readonly coins: number;
  readonly lives: number;
  readonly boosters: Readonly<Partial<Record<BoosterId, number>>>;
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  music: true,
  haptics: true,
  lang: 'tr',
  colorblind: false,
  reduceMotion: false,
  heavyGravitySlow: false,
};

export function createDefaultSave(init: {
  readonly analyticsId: string;
  readonly installId: string;
  readonly now: number;
  readonly wallet: StartingWallet;
  /** First-launch settings that come from the device (UX §11: "Animasyonları azalt" starts from the OS setting). */
  readonly settings?: Partial<Settings>;
}): SaveData {
  const inventory: Partial<Record<BoosterId, number>> = {};
  for (const id of BOOSTER_IDS) {
    const n = init.wallet.boosters[id];
    if (n !== undefined && n > 0) inventory[id] = n;
  }
  return {
    analyticsId: init.analyticsId,
    installId: init.installId,
    progress: { highestLevel: 0, levels: {} },
    stars: 0,
    coins: init.wallet.coins,
    lives: { stored: init.wallet.lives, regenAnchor: init.now, unlimitedUntil: 0, reserved: 0 },
    boosters: { inventory, freeTrialsGranted: [] },
    winStreak: 0,
    town: { completedTasks: [], seenScenes: [] },
    piggy: { coins: 0 },
    events: {},
    settings: { ...DEFAULT_SETTINGS, ...init.settings },
    firstOfferGiftUsed: false,
    payer: false,
    seenContextTips: {},
    inLevel: null,
    voidNotice: null,
    pendingChest: null,
    lastSeenNow: init.now,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Decode + migrations

export type CorruptStage = 'parse' | 'migrate' | 'validate';
export type Migration = (old: unknown) => unknown;
/** `MIGRATIONS[n]` turns a v`n` `data` into v`n+1`. Empty while v1 is the only version. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

/** Runs the chain `from → target`; throws when the save is newer than `target` or a step is missing. */
export function migrate(
  from: number,
  data: unknown,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
  target: number = SAVE_VERSION,
): unknown {
  if (from > target) throw new Error(`save v${from} is newer than this build (v${target})`);
  let cur = data;
  for (let v = from; v < target; v++) {
    const step = migrations[v];
    if (step === undefined) throw new Error(`no save migration v${v} → v${v + 1}`);
    cur = step(cur);
  }
  return cur;
}

export type DecodeResult =
  | { readonly ok: true; readonly data: SaveData; readonly migratedFrom: number | null }
  | { readonly ok: false; readonly stage: CorruptStage; readonly error: string };

/** Parses one stored save text; reports the FIRST failing stage (ANALYTICS `save_corrupt.stage`). */
export function decodeSave(text: string): DecodeResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { ok: false, stage: 'parse', error: String(err) };
  }
  const env = raw as { v?: unknown; data?: unknown } | null;
  if (typeof env !== 'object' || env === null || Array.isArray(env)) {
    return { ok: false, stage: 'validate', error: 'save is not an object' };
  }
  if (typeof env.v !== 'number' || !Number.isInteger(env.v) || env.v < 1 || !('data' in env)) {
    return { ok: false, stage: 'validate', error: 'save envelope needs { v: int ≥ 1, data }' };
  }
  let data: unknown;
  try {
    data = migrate(env.v, env.data);
  } catch (err) {
    return { ok: false, stage: 'migrate', error: String(err) };
  }
  const parsed = SaveDataSchema.safeParse(data);
  if (!parsed.success) return { ok: false, stage: 'validate', error: z.prettifyError(parsed.error) };
  return { ok: true, data: parsed.data, migratedFrom: env.v < SAVE_VERSION ? env.v : null };
}

export function encodeSave(data: SaveData): string {
  return JSON.stringify({ v: SAVE_VERSION, data });
}

// ---------------------------------------------------------------------------------------------------------------
// Pure K-43 transforms (used by the service; exported for meta and tests)

export type ResumeCause = 'level_hash' | 'rules_version' | 'both';

/** Level identity the running build has for a level (`null` = level no longer exists). */
export interface LevelIdentity {
  readonly levelHash: string;
  readonly rulesVersion: number;
}

export function resumeCause(inLevel: InLevel, current: LevelIdentity | null): ResumeCause | null {
  if (current === null) return 'level_hash';
  const hash = inLevel.levelHash !== current.levelHash;
  const rules = inLevel.rulesVersion !== current.rulesVersion;
  return hash && rules ? 'both' : hash ? 'level_hash' : rules ? 'rules_version' : null;
}

const ACTION_BOOSTER: Partial<Record<StoredAction['kind'], BoosterId>> = {
  hammer: 'hammer',
  crane: 'crane',
  paint: 'paintBrush',
  undo: 'undo',
};

/**
 * Boosters used by an attempt: pre-level boosters + one per applied `hammer` / `crane` / `paint` / `undo` action (the
 * log holds only applied boosters, so the count is exact; the Golden Trowel is not an inventory booster).
 */
export function attemptBoosters(inLevel: InLevel): Partial<Record<BoosterId, number>> {
  const out: Partial<Record<BoosterId, number>> = {};
  const add = (id: BoosterId): void => {
    out[id] = (out[id] ?? 0) + 1;
  };
  for (const p of inLevel.preBoosters) add(p);
  for (const a of inLevel.actions) {
    const id = ACTION_BOOSTER[a.kind];
    if (id !== undefined) add(id);
  }
  return out;
}

export function addBoosters(d: SaveData, counts: Readonly<Partial<Record<BoosterId, number>>>): void {
  for (const id of BOOSTER_IDS) {
    const n = counts[id];
    if (n !== undefined && n > 0) d.boosters.inventory[id] = (d.boosters.inventory[id] ?? 0) + n;
  }
}

/**
 * GDD K-43 item 4 / E-45: the attempt never happened. Refunds the reserved life, pre-level and in-level boosters and
 * every coin paid for +5 offers; a Wobbly Bridge run's spend drops by the refunded coins. Not refunded: ad counters,
 * the lifetime-first offer gift. Streak and `levels[id].attempts` stay. Clears `inLevel`, writes `voidNotice`.
 */
export function voidAttempt(d: SaveData): VoidNotice {
  const il = d.inLevel;
  if (il === null) throw new Error('voidAttempt: no attempt in progress');
  const boosters = attemptBoosters(il);
  addBoosters(d, boosters);
  const life = d.lives.reserved;
  d.lives.reserved = 0;
  d.coins += il.offerSpendCoins;
  const bridge = il.bridgeEventId !== null;
  if (il.bridgeEventId !== null) {
    const run = d.events[il.bridgeEventId];
    if (run !== undefined) run.runSpend = Math.max(0, run.runSpend - il.offerSpendCoins);
  }
  d.inLevel = null;
  const notice: VoidNotice = {
    level: il.levelId,
    refunds: { life, boosters, coins: il.offerSpendCoins },
    bridge,
  };
  d.voidNotice = notice;
  return notice;
}

/** Marks a story win in the progress record (rewards are meta's, in the same `endAttempt` write). */
export function recordWin(d: SaveData, levelId: number): void {
  const key = String(levelId);
  const rec = d.progress.levels[key] ?? { won: false, attempts: 0 };
  rec.won = true;
  d.progress.levels[key] = rec;
  d.progress.highestLevel = Math.max(d.progress.highestLevel, levelId);
}

// ---------------------------------------------------------------------------------------------------------------
// Service

export type LoadSource = 'main' | 'backup' | 'defaults' | 'new';

export interface LoadReport {
  /** Where the data came from: `new` = first launch, `defaults` = main and backup unusable. */
  readonly source: LoadSource;
  /** First failing stage of the MAIN save, `null` when it loaded (or did not exist). */
  readonly failedStage: CorruptStage | null;
  readonly migratedFrom: number | null;
}

export type SaveDiagnostic =
  | { readonly kind: 'saveCorrupt'; readonly stage: CorruptStage; readonly error: string }
  | { readonly kind: 'writeFailed'; readonly key: string; readonly error: string }
  | {
      readonly kind: 'attemptVoided';
      readonly levelId: number;
      /** `replay`: hash and rules matched but the saved log did not replay (a bug or a damaged log). */
      readonly cause: ResumeCause | 'replay';
      readonly movesMade: number;
    }
  | { readonly kind: 'flushFailed'; readonly error: string };

export interface SaveServiceOptions {
  readonly store: KeyValueStore;
  readonly clock: Clock;
  readonly scheduler: Scheduler;
  /** `config/economy.json → startingWallet` (first launch and the `defaults` recovery). */
  readonly startingWallet: StartingWallet;
  /** Analytics `track` (events are sent after the related write). */
  readonly track?: Track;
  readonly newId?: () => string;
  readonly debounceMs?: number;
  /** Settings a NEW save starts with (first launch, `defaults` recovery), e.g. the OS reduced-motion preference. */
  readonly defaultSettings?: Partial<Settings>;
}

export interface AttemptStart {
  readonly levelId: number;
  readonly seed: number;
  readonly mode: GameMode;
  readonly preBoosters: readonly PreBooster[];
  readonly streakTier: 0 | 1 | 2 | 3;
  readonly levelHash: string;
  readonly rulesVersion: number;
  /** META: a life is reserved at level start unless unlimited lives are active. */
  readonly reserveLife: boolean;
  /** Event instance id when the attempt counts for a Wobbly Bridge run. */
  readonly bridgeEventId?: string | null;
}

export type ResumeDecision =
  | { readonly kind: 'none' }
  /** Open the level from the log; `window` = Pause window, or the same out-of-moves offer (UX §1 (a)). */
  | {
      readonly kind: 'resume';
      readonly inLevel: DeepReadonly<InLevel>;
      readonly window: 'pause' | 'outOfMoves';
    }
  /** Attempt voided; go home and show `resume.void` first (UX §1 (c)). */
  | { readonly kind: 'void'; readonly cause: ResumeCause; readonly notice: DeepReadonly<VoidNotice> };

export class SaveService {
  readonly loadReport: LoadReport;
  readonly #store: KeyValueStore;
  readonly #clock: Clock;
  readonly #scheduler: Scheduler;
  readonly #track: Track;
  readonly #newId: () => string;
  readonly #debounceMs: number;
  readonly #diagnostics = new RingBuffer<SaveDiagnostic>(100);
  #data: SaveData;
  #dirty = false;
  #timer: TimerHandle | null = null;
  #pendingFlusher: (() => void) | null = null;

  private constructor(opts: SaveServiceOptions, data: SaveData, report: LoadReport) {
    this.#store = opts.store;
    this.#clock = opts.clock;
    this.#scheduler = opts.scheduler;
    this.#track = opts.track ?? (() => {});
    this.#newId = opts.newId ?? randomId;
    this.#debounceMs = opts.debounceMs ?? SAVE_DEBOUNCE_MS;
    this.#data = data;
    this.loadReport = report;
  }

  /** Loads (and if needed recovers) the save. Recovery is written before `save_corrupt` is tracked. */
  static open(opts: SaveServiceOptions): SaveService {
    const read = (key: string): string | null => {
      try {
        return opts.store.get(key);
      } catch {
        return null;
      }
    };
    const newId = opts.newId ?? randomId;
    const defaults = (): SaveData =>
      createDefaultSave({
        analyticsId: newId(),
        installId: newId(),
        now: opts.clock.now(),
        wallet: opts.startingWallet,
        ...(opts.defaultSettings ? { settings: opts.defaultSettings } : {}),
      });
    const fromBackup = (): SaveData | null => {
      const text = read(BACKUP_KEY);
      if (text === null) return null;
      const r = decodeSave(text);
      return r.ok ? r.data : null;
    };

    const corrupt: SaveDiagnostic[] = [];
    let data: SaveData;
    let source: LoadSource;
    let failedStage: CorruptStage | null = null;
    let migratedFrom: number | null = null;
    const mainText = read(SAVE_KEY);
    if (mainText === null) {
      const bak = fromBackup();
      data = bak ?? defaults();
      source = bak === null ? 'new' : 'backup';
    } else {
      const r = decodeSave(mainText);
      if (r.ok) {
        data = r.data;
        source = 'main';
        migratedFrom = r.migratedFrom;
      } else {
        failedStage = r.stage;
        corrupt.push({ kind: 'saveCorrupt', stage: r.stage, error: r.error });
        try {
          opts.store.set(CORRUPT_KEY, mainText);
        } catch (err) {
          corrupt.push({ kind: 'writeFailed', key: CORRUPT_KEY, error: String(err) });
        }
        const bak = fromBackup();
        data = bak ?? defaults();
        source = bak === null ? 'defaults' : 'backup';
      }
    }

    const svc = new SaveService(opts, data, { source, failedStage, migratedFrom });
    for (const c of corrupt) svc.#diagnostics.push(c);
    if (source !== 'main' || migratedFrom !== null) svc.#write();
    if (failedStage !== null) {
      svc.#track({
        name: 'save_corrupt',
        stage: failedStage,
        recovered: source === 'backup' ? 'backup' : 'defaults',
      });
    }
    return svc;
  }

  /** Current data (read only; change it through `commit` / `update`). */
  get data(): DeepReadonly<SaveData> {
    return this.#data;
  }

  diagnostics(): readonly SaveDiagnostic[] {
    return this.#diagnostics.toArray();
  }

  /** Applies `mutate` to a copy and writes at once (atomic: the copy replaces the data only if `mutate` returns). */
  commit(mutate?: (d: SaveData) => void): void {
    if (mutate !== undefined) this.#apply(mutate);
    this.#write();
  }

  /** Applies `mutate` and writes within `SAVE_DEBOUNCE_MS` together with other coalesced changes. */
  update(mutate: (d: SaveData) => void): void {
    this.#apply(mutate);
    this.#dirty = true;
    if (this.#timer === null) {
      this.#timer = this.#scheduler.setTimeout(() => {
        this.#timer = null;
        if (this.#dirty) this.#write();
      }, this.#debounceMs);
    }
  }

  /** Writes now if a coalesced change is waiting. */
  flush(): void {
    if (this.#dirty) this.#write();
  }

  /** `GameSession.flushPending` (TECH §4.7): commits a pending G-L move before a lifecycle write. */
  setPendingFlusher(flusher: (() => void) | null): void {
    this.#pendingFlusher = flusher;
  }

  /** `visibilitychange: hidden` / `pagehide` / Capacitor `pause`: pending move first, then an immediate write. */
  appHidden(): void {
    const flusher = this.#pendingFlusher;
    if (flusher !== null) {
      try {
        flusher();
      } catch (err) {
        this.#diagnostics.push({ kind: 'flushFailed', error: String(err) });
      }
    }
    this.flush();
  }

  /** Subscribes `appHidden` to the platform lifecycle; returns the unsubscribe function. */
  attachLifecycle(subscribe: (handler: () => void) => () => void = onAppHidden): () => void {
    return subscribe(() => this.appHidden());
  }

  // ----- K-43 in-level record ---------------------------------------------------------------------------------

  /**
   * New attempt: `levels[id].attempts + 1` (a resume does not count), life reservation flag, `inLevel` with the
   * `start` action. Written at once. Returns the attempt number (`level_start.attempt`). Another level cannot start
   * while an attempt exists (GDD K-43 item 3).
   */
  beginAttempt(a: AttemptStart): number {
    if (this.#data.inLevel !== null) {
      throw new Error(`beginAttempt: level ${this.#data.inLevel.levelId} is still in progress (K-43)`);
    }
    let attempt = 0;
    const attemptId = this.#newId();
    const startedAt = this.#clock.now();
    this.commit((d) => {
      const key = String(a.levelId);
      const rec = d.progress.levels[key] ?? { won: false, attempts: 0 };
      rec.attempts += 1;
      attempt = rec.attempts;
      d.progress.levels[key] = rec;
      d.lives.reserved = a.reserveLife ? 1 : 0;
      d.inLevel = {
        levelId: a.levelId,
        seed: a.seed,
        mode: a.mode,
        preBoosters: [...a.preBoosters],
        streakTier: a.streakTier,
        actions: [{ kind: 'start', preBoosters: [...a.preBoosters], streakTier: a.streakTier }],
        movesMade: 0,
        offersUsed: 0,
        adOfferUsed: false,
        offerSpendCoins: 0,
        outcomeWindow: 'none',
        levelHash: a.levelHash,
        rulesVersion: a.rulesVersion,
        attemptId,
        startedAt,
        bridgeEventId: a.bridgeEventId ?? null,
        tutorial: null,
      };
    });
    return attempt;
  }

  /**
   * Appends one committed action after K-35 step 12 (or a booster / accepted offer) and writes at once. `movesMade`
   * = `m` after the action. An accepted +5 offer (`addMoves` from `offerCoins` / `offerAd`) counts toward
   * `offersUsed` (K-29) and adds `offerCoins` (coins actually paid; 0 for the free gift) to `offerSpendCoins`.
   *
   * Hot path (one call per move): only the new entry is validated (a few µs) and appended in place; the full
   * copy + schema check of `commit` (≈ 0.5 ms for a 150-move log on desktop) is skipped. Nothing changes when the
   * entry is invalid, so the save stays loadable.
   */
  recordAction(
    action: SessionAction,
    info: { readonly movesMade: number; readonly offerCoins?: number },
  ): void {
    const il = this.#data.inLevel;
    if (il === null) throw new Error('recordAction: no attempt in progress');
    const parsed = SessionActionSchema.safeParse(toStoredAction(action));
    if (!parsed.success) throw new Error(`recordAction: invalid action\n${z.prettifyError(parsed.error)}`);
    const counts = ActionCountsSchema.safeParse(info);
    if (!counts.success) throw new Error(`recordAction: invalid counters\n${z.prettifyError(counts.error)}`);
    const entry = parsed.data; // a fresh object: the caller's action is never aliased
    il.actions.push(entry);
    il.movesMade = info.movesMade;
    if (entry.kind === 'addMoves' && (entry.source === 'offerCoins' || entry.source === 'offerAd')) {
      il.offersUsed += 1;
      if (entry.source === 'offerAd') il.adOfferUsed = true;
      il.offerSpendCoins += info.offerCoins ?? 0;
      il.outcomeWindow = 'none';
    }
    this.#write();
  }

  /**
   * K-43 tutorial position (review Faz 2 tur 3 #1): kept current in `inLevel.tutorial` and written at once when it
   * changes (a step change by a drag signal, a move end, a timeout), so every action record and a `pagehide` /
   * `visibilitychange` write carry the step on screen. Same hot path as `recordAction` (in place, entry checked only).
   * No attempt, or the same position: nothing written.
   */
  setTutorial(at: TutorialAt | null): void {
    const il = this.#data.inLevel;
    if (il === null) return;
    const cur = il.tutorial;
    if (
      at !== null &&
      cur !== null &&
      cur.index === at.index &&
      cur.shown === at.shown &&
      cur.count === at.count &&
      cur.actions === at.actions
    )
      return;
    if (at === null && cur === null) return;
    if (at === null) il.tutorial = null;
    else {
      const parsed = TutorialAtSchema.safeParse(at);
      if (!parsed.success) throw new Error(`setTutorial: invalid position\n${z.prettifyError(parsed.error)}`);
      il.tutorial = parsed.data;
    }
    this.#write();
  }

  /** Out-of-moves window open / closed (a kill while open reopens the same offer, UX §1 (a)). */
  setOutcomeWindow(window: InLevel['outcomeWindow']): void {
    if (this.#data.inLevel === null) throw new Error('setOutcomeWindow: no attempt in progress');
    this.commit((d) => {
      (d.inLevel as InLevel).outcomeWindow = window;
    });
  }

  /**
   * Ends the attempt (win, loss, confirmed exit) in ONE atomic write: `mutate` applies the outcome (win: rewards,
   * `recordWin`, `pendingChest`; loss: meta/lives charges the reserved life; `m = 0` exit: refunds), then `inLevel`
   * and the life reservation are cleared.
   */
  endAttempt(mutate?: (d: SaveData) => void): void {
    this.commit((d) => {
      mutate?.(d);
      d.inLevel = null;
      d.lives.reserved = 0;
    });
  }

  /**
   * Launch decision (K-43 item 3–4). `current(levelId)` gives this build's level hash and rules version (`null` = the
   * level is gone). Resume → tracks `level_resume`. Mismatch → `voidAttempt` in one write, then `level_resume_invalid`
   * and (if coins came back) `coin_source{ refund }`, in this order.
   */
  resumeOnLaunch(current: (levelId: number) => LevelIdentity | null): ResumeDecision {
    const il = this.#data.inLevel;
    if (il === null) return { kind: 'none' };
    const cause = resumeCause(il, current(il.levelId));
    if (cause === null) {
      this.#track({ name: 'level_resume', level: il.levelId, movesMade: il.movesMade });
      return {
        kind: 'resume',
        inLevel: structuredClone(il), // a snapshot: `recordAction` appends to the live record in place
        window: il.outcomeWindow === 'outOfMoves' ? 'outOfMoves' : 'pause',
      };
    }
    const { levelId, movesMade, offerSpendCoins } = il;
    this.commit((d) => {
      voidAttempt(d);
    });
    const notice = this.#data.voidNotice as DeepReadonly<VoidNotice>;
    this.#diagnostics.push({ kind: 'attemptVoided', levelId, cause, movesMade });
    this.#track({ name: 'level_resume_invalid', level: levelId, movesMade, cause });
    if (offerSpendCoins > 0) {
      this.#track({
        name: 'coin_source',
        amount: offerSpendCoins,
        reason: 'refund',
        balanceAfter: this.#data.coins,
      });
    }
    return { kind: 'void', cause, notice };
  }

  /**
   * The saved log of an attempt whose level hash and rules version MATCHED did not replay (`GameSession.replay` threw:
   * a bug or a damaged log). Same penalty-free void as K-43 item 4 (`voidAttempt`: refunds + `voidNotice`, one write),
   * then `coin_source{ refund }` when coins came back. `level_resume_invalid` is not sent: its `cause` enum (ANALYTICS
   * §2) names only hash / rules mismatches; the local diagnostic records `cause: 'replay'`.
   */
  voidUnreplayable(): DeepReadonly<VoidNotice> | null {
    const il = this.#data.inLevel;
    if (il === null) return null;
    const { levelId, movesMade, offerSpendCoins } = il;
    this.commit((d) => {
      voidAttempt(d);
    });
    this.#diagnostics.push({ kind: 'attemptVoided', levelId, cause: 'replay', movesMade });
    if (offerSpendCoins > 0) {
      this.#track({
        name: 'coin_source',
        amount: offerSpendCoins,
        reason: 'refund',
        balanceAfter: this.#data.coins,
      });
    }
    return this.#data.voidNotice as DeepReadonly<VoidNotice>;
  }

  /** "Tamam" on the `resume.void` window: the notice is removed in one write (the refund itself is never repeated). */
  dismissVoidNotice(): void {
    if (this.#data.voidNotice === null) return;
    this.commit((d) => {
      d.voidNotice = null;
    });
  }

  /** `tut.ctx.<topic>` was shown (GDD §14.1/2); written at once. */
  markContextTip(topic: string): void {
    if (this.#data.seenContextTips[topic] === true) return;
    this.commit((d) => {
      d.seenContextTips[topic] = true;
    });
  }

  // ----- internals ----------------------------------------------------------------------------------------------

  /**
   * Atomic change: `mutate` runs on a copy that must still match the schema; otherwise it throws (a code bug) and the
   * data stays as it was — a save that could not be loaded again is never written.
   */
  #apply(mutate: (d: SaveData) => void): void {
    const next = structuredClone(this.#data);
    mutate(next);
    const check = SaveDataSchema.safeParse(next);
    if (!check.success)
      throw new Error(`save: change breaks the v${SAVE_VERSION} schema\n${z.prettifyError(check.error)}`);
    this.#data = next;
  }

  #write(): boolean {
    if (this.#timer !== null) {
      this.#scheduler.clearTimeout(this.#timer);
      this.#timer = null;
    }
    this.#data.lastSeenNow = Math.max(this.#data.lastSeenNow, this.#clock.now());
    const text = encodeSave(this.#data);
    try {
      this.#store.set(SAVE_KEY, text);
    } catch (err) {
      this.#diagnostics.push({ kind: 'writeFailed', key: SAVE_KEY, error: String(err) });
      this.#dirty = true;
      return false;
    }
    this.#dirty = false;
    try {
      this.#store.set(BACKUP_KEY, text);
    } catch (err) {
      this.#diagnostics.push({ kind: 'writeFailed', key: BACKUP_KEY, error: String(err) });
    }
    return true;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Level hash

/**
 * `inLevel.levelHash` (TECH §11.1 "bölüm JSON karması", GDD K-43 item 4): ONE implementation for the game, the save,
 * the debug panel and the tools — core's FNV-1a 64 over canonical JSON (keys sorted at every depth, so key order and
 * whitespace do not matter; any data change does). The caller hashes the level as loaded (`CompiledLevel.data`) both
 * when it starts an attempt and when it checks a resume.
 */
export { canonicalJson } from '../core/moves.ts';
export { levelHash } from '../core/session.ts';
