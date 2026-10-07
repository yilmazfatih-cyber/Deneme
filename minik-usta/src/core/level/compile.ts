/**
 * `compile(levelData)` → CompiledLevel (TECH_DESIGN §2.3): runs once per level, the result is frozen and shared by
 * every GameState. Holds resolved plans (K-32), wall/gaps, piece table (PieceId order: batch 0, then truck batches
 * in array order, then debris, then D2 help slots), obstacles, gravity profile (K-19), the step-10 timer list
 * (STEP10_TIMERS, §7.3), the tutorial highlight → PieceId table (§8.2), the buffer layout (§2.4) and Zobrist tables.
 */
import { COLOR_CODES, Zone } from '../types.ts';
import type { ColorCode, PieceId, ShapeId } from '../types.ts';
import { SEGMENT_CELLS } from '../coords.ts';
import { shapeById } from '../shapes.ts';
import { computeLayout } from '../state.ts';
import type { StateLayout } from '../state.ts';
import { FLAG_BIT } from '../state.ts';
import { buildZobrist, hashedFieldOffsets, lcm } from '../hash.ts';
import type { ZobristTables } from '../hash.ts';
import type { GapData, GoalData, LevelData, MechanicId } from './schema.ts';
import { deriveMechanics } from './mechanics.ts';
import { buildPlans } from './plan.ts';
import { RUNTIME_CHECKS, validateLevelJson } from './logic.ts';
import type { Issue, LogicContext } from './logic.ts';

/** K-19 gravity profile (core rule values; visual speeds live in tokens.physics). */
export interface GravityProfile {
  readonly build: 'low' | 'normal' | 'high';
  readonly yard: boolean;
  /** G-H forced release after this many ms over the site; null = unlimited (low, normal). */
  readonly holdMs: number | null;
  /** G-H value with "Zaman baskısını azalt" (R-11). */
  readonly holdMsReduced: number | null;
  /** Glass breaks when the fall distance is strictly greater (S3, K-19): low 4, normal 3, high 2. */
  readonly glassThreshold: number;
  /** G-L steering available. */
  readonly steerable: boolean;
}

export const GRAVITY_PROFILES: Readonly<Record<GravityProfile['build'], Omit<GravityProfile, 'yard'>>> = {
  low: { build: 'low', holdMs: null, holdMsReduced: null, glassThreshold: 4, steerable: true },
  normal: { build: 'normal', holdMs: null, holdMsReduced: null, glassThreshold: 3, steerable: false },
  high: { build: 'high', holdMs: 700, holdMsReduced: 1400, glassThreshold: 2, steerable: false },
};

/** K-35 step 10 order (GDD; §7.3). The rule `order` field is NOT used for step 10. */
export type TimerId = 'W4' | 'W5' | 'S5' | 'S6' | 'Y4' | 'K-40';
export interface Step10Timer {
  readonly id: TimerId;
  readonly order: number;
}
export const STEP10_TIMERS: readonly Step10Timer[] = Object.freeze([
  { id: 'W4', order: 1 }, // shutter
  { id: 'W5', order: 2 }, // slider
  { id: 'S5', order: 3 }, // carousel counter (K-23)
  { id: 'S6', order: 4 }, // elevator (K-24)
  { id: 'Y4', order: 5 }, // wet concrete (E-31)
  { id: 'K-40', order: 6 }, // open-shutter expiry
]);

export interface CompiledSegment {
  readonly index: number;
  readonly name: { readonly tr: string; readonly en: string };
  readonly height: number;
  /** Local index `sy * 2 + sx`: colour index 0–7, −1 `.`, −2 outside the plan (`?` already resolved). */
  readonly planColors: Int8Array;
  /** Bits of `?` cells (local index). */
  readonly hiddenMask: number;
  /** Per column: non-`.` plan rows / `.` rows. */
  readonly planMask: readonly [number, number];
  readonly dotMask: readonly [number, number];
  /** Bits (local index) of every cell that must be filled. */
  readonly targetMask: number;
}
export const PLAN_DOT = -1;
export const PLAN_OUTSIDE = -2;

export type PieceOrigin = 'yard' | 'truck' | 'debris' | 'help';

export interface CompiledPiece {
  readonly id: PieceId;
  readonly origin: PieceOrigin;
  /** Batch index (yard 0, truck k ≥ 1), −1 for debris and help slots. */
  readonly batch: number;
  /** Index inside its batch / `build.debris[]` / help slots. */
  readonly index: number;
  /** Shape id as written in the data. */
  readonly dataShape: ShapeId;
  /** Canonical shape index (K-44: symmetric aliases reduced). */
  readonly shapeIndex: number;
  readonly colorIndex: number;
  /** Start flag bits (state FLAG_BIT; debris gets `debris`). */
  readonly flags: number;
  readonly wetMoves: number;
  readonly startZone: Zone;
  /** Yard / truck drop column: global anchor x; debris: global column 6–7. */
  readonly x: number;
  /** Yard: global anchor y; truck: 8 (ignored, K-25); debris: plan row. */
  readonly y: number;
  /** Debris segment; −1 otherwise. */
  readonly segment: number;
}

export interface CompiledGap {
  readonly index: number;
  readonly type: GapData['type'];
  readonly y: number;
  readonly size: number;
  readonly period: number;
  readonly phase: number;
  readonly range: readonly [number, number] | null;
  readonly dir: 1 | -1;
  readonly color: ColorCode | null;
  readonly keyId: string | null;
}

export interface CompiledBatch {
  readonly index: number;
  readonly forSegment: number;
  readonly dropColumns: readonly number[];
  readonly pieceIds: readonly PieceId[];
}

export type CompiledObstacle =
  | {
      readonly index: number;
      readonly type: 'crate';
      readonly x: number;
      readonly y: number;
      readonly hp: number;
    }
  | { readonly index: number; readonly type: 'cement_bag'; readonly x: number; readonly y: number }
  | {
      readonly index: number;
      readonly type: 'screw' | 'key';
      readonly x: number;
      readonly y: number;
      readonly id: string | null;
      /** Index in the state's hidden-item section. */
      readonly hiddenIndex: number;
    };

export interface CompiledLevel {
  readonly data: LevelData;
  readonly id: number;
  readonly chapter: number;
  readonly difficulty: LevelData['difficulty'];
  readonly moves: number;
  /** `seed ?? id × 1000 + id` (K-45/1). */
  readonly seed: number;
  readonly goals: readonly GoalData[];
  readonly gravity: GravityProfile;
  readonly wallHeight: number;
  readonly fan: 'left' | 'right' | null;
  readonly gaps: readonly CompiledGap[];
  readonly mode: 'segments' | 'carousel';
  readonly carouselEvery: number;
  readonly elevator: {
    readonly range: readonly [number, number];
    readonly start: number;
    readonly dir: 1 | -1;
  } | null;
  readonly segments: readonly CompiledSegment[];
  readonly pieces: readonly CompiledPiece[];
  /** Pieces from data (batches + debris); help slots follow. */
  readonly staticPieceCount: number;
  readonly helpPieceBase: number;
  readonly helpPieceCount: number;
  readonly batches: readonly CompiledBatch[];
  readonly obstacles: readonly CompiledObstacle[];
  /** Obstacle indices of screws and keys, in hidden-section order. */
  readonly hiddenItems: readonly number[];
  readonly mechanics: readonly MechanicId[];
  /** Active step-10 timers in execution order (K-35 step 10, §7.3). */
  readonly step10: readonly Step10Timer[];
  /** `L` (§2.6). */
  readonly cycle: number;
  /** `piece:<i>`, `piece:k<p>_<i>`, `debris:<i>` → PieceId (§2.3, §8.2). */
  readonly tutorialPieceIds: ReadonlyMap<string, PieceId>;
  readonly layout: StateLayout;
  readonly zobrist: ZobristTables;
  /** Buffer offsets of the hashed scalar fields (hash.ts). */
  readonly hashFields: readonly number[];
}

const colorIndex = (c: ColorCode): number => COLOR_CODES.indexOf(c);

/** `L`: LCM of shutter 2·period, slider 2·(b − a), carousel carouselEvery·S, elevator 2·(b − a) (§2.6). */
export function cycleLength(level: LevelData): number {
  const parts: number[] = [];
  for (const g of level.wall.gaps) {
    if (g.type === 'shutter') parts.push(2 * g.period);
    if (g.type === 'slider') parts.push(2 * (g.range[1] - g.range[0]));
  }
  if (level.build.mode === 'carousel' && level.build.carouselEvery)
    parts.push(level.build.carouselEvery * level.build.segments.length);
  const el = level.build.elevator;
  if (el) parts.push(2 * (el.range[1] - el.range[0]));
  return lcm(parts);
}

/** Active step-10 timers, in STEP10_TIMERS order. */
export function step10Timers(level: LevelData): Step10Timer[] {
  const has = (t: GapData['type']): boolean => level.wall.gaps.some((g) => g.type === t);
  const wet = level.yard.batches.some((b) => b.pieces.some((p) => p.flags?.includes('wet')));
  const active: Record<TimerId, boolean> = {
    W4: has('shutter'),
    W5: has('slider'),
    S5: level.build.mode === 'carousel',
    S6: level.build.elevator !== undefined,
    Y4: wet,
    'K-40': has('shutter') || has('locked'),
  };
  return STEP10_TIMERS.filter((t) => active[t.id]);
}

/** Compiles schema-valid level data. Throws on structurally impossible data (run the validator first). */
export function compile(level: LevelData): CompiledLevel {
  const { plans } = buildPlans(level);
  const segments: CompiledSegment[] = plans.map((p, index) => {
    const planColors = new Int8Array(SEGMENT_CELLS).fill(PLAN_OUTSIDE);
    p.cells.forEach((c, i) => {
      if (c === '.') planColors[i] = PLAN_DOT;
      else if (c !== null) planColors[i] = colorIndex(c);
    });
    const name = level.build.segments[index]?.name ?? { tr: '', en: '' };
    return Object.freeze({
      index,
      name,
      height: p.height,
      planColors,
      hiddenMask: p.hiddenMask,
      planMask: [p.planMask[0] ?? 0, p.planMask[1] ?? 0] as const,
      dotMask: [p.dotMask[0] ?? 0, p.dotMask[1] ?? 0] as const,
      targetMask: p.targetMask,
    });
  });

  const pieces: CompiledPiece[] = [];
  const tutorialPieceIds = new Map<string, PieceId>();
  const batches: CompiledBatch[] = level.yard.batches.map((b, k) => {
    const pieceIds = b.pieces.map((p, i) => {
      const id = pieces.length;
      const shape = shapeById(p.shape);
      const flags = (p.flags ?? []).reduce((m, f) => m | FLAG_BIT[f], 0);
      pieces.push({
        id,
        origin: k === 0 ? 'yard' : 'truck',
        batch: k,
        index: i,
        dataShape: p.shape,
        shapeIndex: shape.canonicalIndex,
        colorIndex: colorIndex(p.color),
        flags,
        wetMoves: p.wetMoves ?? 0,
        startZone: k === 0 ? Zone.yard : Zone.pending,
        x: p.x,
        y: k === 0 ? p.y : 8,
        segment: -1,
      });
      tutorialPieceIds.set(k === 0 ? `piece:${i}` : `piece:k${k}_${i}`, id);
      return id;
    });
    return Object.freeze({
      index: k,
      forSegment: b.forSegment,
      dropColumns: Object.freeze([...(b.dropColumns ?? [])]),
      pieceIds,
    });
  });
  (level.build.debris ?? []).forEach((d, i) => {
    const id = pieces.length;
    pieces.push({
      id,
      origin: 'debris',
      batch: -1,
      index: i,
      dataShape: d.shape,
      shapeIndex: shapeById(d.shape).canonicalIndex,
      colorIndex: colorIndex(d.color),
      flags: FLAG_BIT.debris,
      wetMoves: 0,
      startZone: Zone.site,
      x: d.x,
      y: d.y,
      segment: d.segment ?? 0,
    });
    tutorialPieceIds.set(`debris:${i}`, id);
  });
  const staticPieceCount = pieces.length;
  // D2 help bricks (K-30, Phase 3): at most one B1 per plan cell.
  const helpPieceCount = segments.reduce((n, s) => n + popcount(s.targetMask), 0);
  const b1 = shapeById('B1_0').canonicalIndex;
  for (let i = 0; i < helpPieceCount; i++) {
    pieces.push({
      id: pieces.length,
      origin: 'help',
      batch: -1,
      index: i,
      dataShape: 'B1_0',
      shapeIndex: b1,
      colorIndex: 0,
      flags: 0,
      wetMoves: 0,
      startZone: Zone.gone,
      x: 5,
      y: 8,
      segment: -1,
    });
  }

  let hiddenCount = 0;
  const hiddenItems: number[] = [];
  const obstacles: CompiledObstacle[] = level.obstacles.map((o, index): CompiledObstacle => {
    if (o.type === 'crate') return { index, type: 'crate', x: o.x, y: o.y, hp: o.hp ?? 1 };
    if (o.type === 'cement_bag') return { index, type: 'cement_bag', x: o.x, y: o.y };
    hiddenItems.push(index);
    return { index, type: o.type, x: o.x, y: o.y, id: o.id ?? null, hiddenIndex: hiddenCount++ };
  });

  const gaps: CompiledGap[] = level.wall.gaps.map((g, index) =>
    Object.freeze({
      index,
      type: g.type,
      y: g.y,
      size: g.size,
      period: g.type === 'shutter' ? g.period : 0,
      phase: g.type === 'shutter' ? g.phase : 0,
      range: g.type === 'slider' ? ([g.range[0], g.range[1]] as const) : null,
      dir: g.type === 'slider' ? g.dir : 1,
      color: g.type === 'paint' ? g.color : null,
      keyId: g.type === 'locked' ? g.keyId : null,
    }),
  );

  const layout = computeLayout({
    segments: segments.length,
    pieces: pieces.length,
    gaps: gaps.length,
    obstacles: obstacles.length,
    hidden: hiddenCount,
    goals: level.goals.length,
  });
  const cycle = cycleLength(level);
  const el = level.build.elevator;
  return Object.freeze({
    data: level,
    id: level.id,
    chapter: level.chapter,
    difficulty: level.difficulty,
    moves: level.moves,
    seed: level.seed ?? level.id * 1000 + level.id,
    goals: Object.freeze([...level.goals]),
    gravity: Object.freeze({ ...GRAVITY_PROFILES[level.gravity.build], yard: level.gravity.yard }),
    wallHeight: level.wall.height,
    fan: level.wall.fan?.dir ?? null,
    gaps: Object.freeze(gaps),
    mode: level.build.mode,
    carouselEvery: level.build.carouselEvery ?? 0,
    elevator: el
      ? Object.freeze({ range: [el.range[0], el.range[1]] as const, start: el.start, dir: el.dir })
      : null,
    segments: Object.freeze(segments),
    pieces: Object.freeze(pieces.map((p) => Object.freeze(p))),
    staticPieceCount,
    helpPieceBase: staticPieceCount,
    helpPieceCount,
    batches: Object.freeze(batches),
    obstacles: Object.freeze(obstacles.map((o) => Object.freeze(o))),
    hiddenItems: Object.freeze(hiddenItems),
    mechanics: Object.freeze(deriveMechanics(level)),
    step10: Object.freeze(step10Timers(level)),
    cycle,
    tutorialPieceIds,
    layout,
    zobrist: buildZobrist(layout, cycle),
    hashFields: Object.freeze(hashedFieldOffsets(layout)),
  });
}

function popcount(n: number): number {
  let c = 0;
  for (let v = n; v !== 0; v &= v - 1) c++;
  return c;
}

/**
 * Game load path (TECH §8.3): schema + the runtime logic subset; an `error` means the level is not loaded
 * (`level_load_failed { stage, code }` is sent by the caller).
 */
export function loadLevel(
  json: unknown,
  ctx: Omit<LogicContext, 'only'> = {},
):
  | { ok: true; level: CompiledLevel; warnings: Issue[] }
  | { ok: false; stage: 'schema' | 'logic'; issues: Issue[] } {
  const { level, issues } = validateLevelJson(json, { ...ctx, only: RUNTIME_CHECKS });
  if (!level) return { ok: false, stage: 'schema', issues };
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) return { ok: false, stage: 'logic', issues };
  return { ok: true, level: compile(level), warnings: issues };
}
