/**
 * Level schema (docs/TECH_DESIGN.md §8.2; GDD §14, §14.1; D-053, D-055). The game and the tools use THIS schema.
 * Written with `zod/mini` (bundle size, §8.1). Value presence rules (carousel ⇔ carouselEvery, wet ⇔ wetMoves,
 * elevator range …) live in logic.ts, not here.
 */
import * as z from 'zod/mini';
import { SHAPE_KINDS } from '../types.ts';

/** OBSTACLES "Veri imzası": 27 mechanic ids (S7-R and S7-M separate). Detection: mechanics.ts. */
export const MECHANIC_IDS = [
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
  'S7-R',
  'S7-M',
  'S8',
  'G-H',
  'G-L',
] as const;
export type MechanicId = (typeof MECHANIC_IDS)[number];

/** GDD §14.1/3 closed `done` vocabulary (16 events). Each one is a separate union member below. */
export const TUT_EVENTS = [
  'overWall',
  'gapPass',
  'holdOverBuild',
  'turnEnd',
  'placementCorrect',
  'yardMove',
  'landed',
  'steered',
  'obstacleHit',
  'itemCollected',
  'yardFall',
  'segmentDone',
  'deliveryDone',
  'carouselTurn',
  'tap',
  'boosterUsed',
] as const;
export type TutEvent = (typeof TUT_EVENTS)[number];

/** UX_FLOWS §13.1 highlight vocabulary, one regex alternative per entry (TECH §8.2). */
export const HIGHLIGHT_PATTERNS = [
  'piece:(\\d{1,2}|k[1-9]_\\d{1,2})',
  'cell:[0-7],[0-9]',
  'gap:[0-2]',
  'obstacle:\\d{1,2}',
  'debris:\\d{1,2}',
  'booster:(hammer|crane|brush|undo)',
  'pre:(thermos|trowel|shutter)',
  'wall',
  'crane',
  'build',
  'front',
  'panorama',
  'goals',
  'moves',
  'truck',
  'streak',
  'fan',
] as const;

const Color = z.enum(['W', 'Y', 'G', 'R', 'O', 'C', 'B', 'P']);
const ShapeIdSchema = z.templateLiteral([
  z.enum(SHAPE_KINDS),
  '_',
  z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
]);
const Int = (min: number, max: number) => z.int().check(z.minimum(min), z.maximum(max));
const I18nText = z.strictObject({
  tr: z.string().check(z.minLength(1)),
  en: z.string().check(z.minLength(1)),
});
const Flag = z.enum(['glass', 'mortar', 'balloon', 'chained', 'wet']);

const PiecePlacement = z.strictObject({
  shape: ShapeIdSchema,
  color: Color,
  x: Int(0, 7),
  /** Batch k ≥ 1: written as 8 and ignored (K-25). */
  y: Int(0, 9),
  flags: z.optional(z.array(Flag)),
  /** OBSTACLES Y4; `wet` ⇔ `wetMoves` (L-26). */
  wetMoves: z.optional(Int(1, 5)),
});

/** Debris: no flags (K-21), belongs to a segment (K-45/7, P-5); `segment` omitted = 0. */
const DebrisPlacement = z.strictObject({
  shape: ShapeIdSchema,
  color: Color,
  x: Int(6, 7),
  y: Int(0, 7),
  segment: z.optional(Int(0, 4)),
});

/** GDD §14 direction format (elevator and slider). */
const Dir = z.union([z.literal(1), z.literal(-1)]);
const GapBase = { y: Int(0, 7), size: Int(1, 7) };
const Gap = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('static'), ...GapBase }),
  /** `phase` default 0 = starts open (GDD S-24); `< 2·period` (L-09). */
  z.strictObject({
    type: z.literal('shutter'),
    ...GapBase,
    period: Int(1, 4),
    phase: z._default(Int(0, 7), 0),
  }),
  /** `dir` default 1 (GDD §14, OBSTACLES W5). */
  z.strictObject({
    type: z.literal('slider'),
    ...GapBase,
    range: z.tuple([Int(0, 7), Int(0, 7)]),
    dir: z._default(Dir, 1),
  }),
  z.strictObject({ type: z.literal('paint'), ...GapBase, color: Color }),
  z.strictObject({ type: z.literal('locked'), ...GapBase, keyId: z.string().check(z.minLength(1)) }),
]);

const HiddenRule = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('repeat'), period: Int(1, 4) }),
  z.strictObject({ kind: z.literal('mirrorOf'), segment: Int(0, 4) }),
]);

export const HIGHLIGHT_REGEX = new RegExp('^(' + HIGHLIGHT_PATTERNS.join('|') + ')$');
const Highlight = z.string().check(z.regex(HIGHLIGHT_REGEX));

const Count = z.optional(Int(1, 9));
/** Anchor in global coordinates; region check in L-17. */
const AtCell = z.optional(z.tuple([Int(0, 7), Int(0, 7)]));
const FlagFilter = z.optional(z.enum(['glass', 'balloon', 'mortar']));
const Yes = z.optional(z.literal(true));

/**
 * GDD §14.1/3 closed `done` vocabulary. Filters and parameters may only be written on the event GDD allows
 * (strictObject → elsewhere `schema_invalid`).
 */
export const TutCond = z.discriminatedUnion('event', [
  // drag signals
  z.strictObject({ event: z.literal('overWall'), count: Count }),
  z.strictObject({ event: z.literal('gapPass'), count: Count }),
  z.strictObject({ event: z.literal('holdOverBuild'), count: Count, minMs: Int(100, 5000) }),
  // move-end events (K-35)
  z.strictObject({ event: z.literal('turnEnd'), count: Count }),
  z.strictObject({ event: z.literal('placementCorrect'), count: Count, at: AtCell, hidden: Yes }),
  z.strictObject({ event: z.literal('yardMove'), count: Count, at: AtCell, painted: Yes }),
  z.strictObject({ event: z.literal('landed'), count: Count, flag: FlagFilter, wind: Yes }),
  z.strictObject({ event: z.literal('steered'), count: Count }),
  z.strictObject({
    event: z.literal('obstacleHit'),
    count: Count,
    type: z.enum(['crate', 'cement_bag', 'chain']),
  }),
  z.strictObject({ event: z.literal('itemCollected'), count: Count, type: z.enum(['screw', 'key']) }),
  z.strictObject({ event: z.literal('yardFall'), count: Count }),
  z.strictObject({ event: z.literal('segmentDone'), count: Count }),
  z.strictObject({ event: z.literal('deliveryDone'), count: Count, flag: FlagFilter }),
  z.strictObject({ event: z.literal('carouselTurn'), count: Count }),
  // other
  z.strictObject({ event: z.literal('tap'), count: Count }),
  z.strictObject({ event: z.literal('boosterUsed'), count: Count }),
]);
const TutDone = z.union([TutCond, z.strictObject({ timeoutMs: Int(500, 10000) })]);

const Segment = z.strictObject({
  name: I18nText,
  rows: z.array(z.string().check(z.regex(/^[WYGROCBP.?]{2}$/))).check(z.minLength(1), z.maxLength(8)),
  hidden: z.optional(HiddenRule),
});

const Goal = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('build') }),
  z.strictObject({
    type: z.literal('clear'),
    target: z.enum(['crate', 'chain', 'debris']),
    count: Int(1, 99),
  }),
  z.strictObject({ type: z.literal('collect'), item: z.literal('screw'), count: Int(1, 99) }),
]);

const TutorialStep = z.strictObject({
  step: Int(1, 20),
  mode: z.enum(['required', 'soft']),
  highlight: z.array(Highlight),
  hand: z.optional(
    z.strictObject({
      kind: z.enum(['tap', 'drag', 'hold']),
      path: z.optional(z.array(z.tuple([Int(0, 7), Int(0, 9)]))),
    }),
  ),
  /** `tut.l{n}.{topic}` | `tut.ctx.{topic}` (GDD §14.1/1, LEVELS §0). */
  textKey: z.string().check(z.regex(/^tut\.(l\d{1,2}|ctx)\.[a-z0-9_]+(\.[a-z0-9_]+)?$/)),
  /** GDD §14.1/5: same format as `done`, never `timeoutMs`. */
  startOn: z.optional(TutCond),
  done: TutDone,
});

export const LevelSchema = z.strictObject({
  schemaVersion: z.optional(z.literal(1)),
  id: Int(1, 999),
  chapter: Int(1, 5),
  name: I18nText,
  difficulty: z.enum(['easy', 'normal', 'hard', 'superhard']),
  moves: Int(1, 99),
  teaches: z.optional(z.enum(MECHANIC_IDS)),
  /** K-45/1: missing → compile uses `id × 1000 + id`. */
  seed: z.optional(z.int()),
  goals: z.array(Goal).check(z.minLength(1), z.maxLength(3)),
  gravity: z.strictObject({ build: z.enum(['low', 'normal', 'high']), yard: z.boolean() }),
  wall: z.strictObject({
    height: Int(0, 8),
    gaps: z.array(Gap).check(z.maxLength(3)),
    fan: z.optional(z.strictObject({ dir: z.enum(['left', 'right']) })),
  }),
  build: z.strictObject({
    /** BRIEF's 'elevator' mode moved to its own field (P-6, S-16). */
    mode: z.enum(['segments', 'carousel']),
    /** K-23; mode 'carousel' ⇔ present (L-25). */
    carouselEvery: z.optional(Int(2, 6)),
    /** K-24: 0 ≤ a < b ≤ 3, a ≤ start ≤ b (L-24); start and dir required (GDD §14). */
    elevator: z.optional(
      z.strictObject({ range: z.tuple([Int(0, 3), Int(0, 3)]), start: Int(0, 3), dir: Dir }),
    ),
    /** K-22: 1 ≤ S ≤ 5. */
    segments: z.array(Segment).check(z.minLength(1), z.maxLength(5)),
    debris: z.optional(z.array(DebrisPlacement)),
  }),
  yard: z.strictObject({
    batches: z
      .array(
        z.strictObject({
          forSegment: Int(0, 5),
          dropColumns: z.optional(z.array(Int(0, 5))),
          pieces: z.array(PiecePlacement).check(z.minLength(1)),
        }),
      )
      .check(z.minLength(1)),
  }),
  obstacles: z.array(
    z.strictObject({
      type: z.enum(['crate', 'cement_bag', 'screw', 'key']),
      x: Int(0, 5),
      y: Int(0, 7),
      hp: z.optional(Int(1, 3)),
      id: z.optional(z.string()),
    }),
  ),
  tutorial: z.optional(z.array(TutorialStep)),
});

/** Parsed level (defaults applied: shutter `phase`, slider `dir`). */
export type LevelData = z.output<typeof LevelSchema>;
/** Level as written in JSON. */
export type LevelInput = z.input<typeof LevelSchema>;
export type TutCondition = z.output<typeof TutCond>;
export type TutorialStepData = NonNullable<LevelData['tutorial']>[number];
export type GapData = LevelData['wall']['gaps'][number];
export type PieceData = LevelData['yard']['batches'][number]['pieces'][number];
export type DebrisData = NonNullable<LevelData['build']['debris']>[number];
export type ObstacleData = LevelData['obstacles'][number];
export type GoalData = LevelData['goals'][number];
export type SegmentData = LevelData['build']['segments'][number];
