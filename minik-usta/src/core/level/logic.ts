/**
 * Level logic checks (docs/TECH_DESIGN.md §8.3; codes = GDD K-45, D-005). Pure functions: the game runs the runtime
 * subset at load time, `tools/validate-levels.ts` runs L-01…L-18 and L-21…L-26. Solver (L-19, L-27) and bot (L-20)
 * stages live in their own tools.
 *
 * Every finding is an `Issue { code, rule, check, severity, path, message }`; `code` is the K-45 snake_case name,
 * `rule` the K-45 item (or K id), `check` the internal L-xx number. Any `error` means the level must not load.
 */
import { COLOR_CODES } from '../types.ts';
import type { ColorCode, ShapeId } from '../types.ts';
import { BOARD_ROWS, GRID_ROWS, SITE_COLS, YARD_COLS } from '../coords.ts';
import { FORBIDDEN_SHAPES, HEAVY_MIN_LEVEL_ID, KIND_FIRST_CHAPTER, shapeById } from '../shapes.ts';
import type { ShapeDef } from '../shapes.ts';
import { LevelSchema } from './schema.ts';
import type { GapData, LevelData, MechanicId, PieceData, TutCondition } from './schema.ts';
import { deriveMechanics } from './mechanics.ts';
import { buildPlans, localIndex } from './plan.ts';
import type { SegmentPlan } from './plan.ts';

export type Severity = 'error' | 'warn';

export interface Issue {
  /** K-45 snake_case code, e.g. `gap_touches_top`. */
  readonly code: string;
  /** `K-45/<item>` or the related rule id (`K-27`, `K-24`, `GDD 14.1` …). */
  readonly rule: string;
  /** Internal check number `L-xx`. */
  readonly check: CheckId;
  readonly severity: Severity;
  /** Data path, e.g. `wall.gaps[0]`. */
  readonly path: string;
  readonly message: string;
}

export const CHECK_IDS = [
  'L-01',
  'L-02',
  'L-03',
  'L-04',
  'L-05',
  'L-06',
  'L-07',
  'L-08',
  'L-09',
  'L-10',
  'L-11',
  'L-12',
  'L-13',
  'L-14',
  'L-15',
  'L-16',
  'L-17',
  'L-18',
  'L-21',
  'L-22',
  'L-23',
  'L-24',
  'L-25',
  'L-26',
] as const;
export type CheckId = (typeof CHECK_IDS)[number];

/** Checks the game runs when it loads a level (TECH §8.3, < 1 ms). The schema always runs. */
export const RUNTIME_CHECKS: readonly CheckId[] = [
  'L-02',
  'L-04',
  'L-05',
  'L-08',
  'L-09',
  'L-24',
  'L-25',
  'L-26',
];

export interface LogicContext {
  /** Level number taken from the file name `level_NNN.json` (L-01 `id_mismatch`). */
  readonly fileId?: number;
  /** Union of the mechanic sets of all earlier levels (L-16, L-22). Without it both checks are skipped. */
  readonly previousMechanics?: ReadonlySet<MechanicId>;
  /** `config/economy.json → boosters.<name>.unlockLevel` (L-17 `booster:` / `pre:`). Without it the check is skipped. */
  readonly boosterUnlock?: Readonly<Record<string, number>>;
  /** i18n keys of `src/i18n/tr.json` and `en.json` (L-17 `tut_key_missing`). Without them the check is skipped. */
  readonly i18nKeys?: { readonly tr: ReadonlySet<string>; readonly en: ReadonlySet<string> };
  /** Run only these checks (default: all of CHECK_IDS). */
  readonly only?: readonly CheckId[];
  /** Node budget of the L-11 tiling search (default 200 000). */
  readonly tileBudget?: number;
}

/** First level of each colour (BRIEF §6, GDD K-31). */
export const COLOR_FIRST_LEVEL: Readonly<Record<ColorCode, number>> = {
  W: 1,
  Y: 1,
  G: 2,
  R: 4,
  O: 11,
  C: 11,
  B: 21,
  P: 21,
};
/** Colours per level by story chapter: 1 → 3, 2 → 4, 3–5 → 5 (GDD K-31). */
export const CHAPTER_COLOR_LIMIT: Readonly<Record<number, number>> = { 1: 3, 2: 4, 3: 5, 4: 5, 5: 5 };
/** Sawtooth plan (LEVELS §0). */
export const HARD_LEVELS: ReadonlySet<number> = new Set([10, 15, 25, 35, 45, 49]);
export const SUPERHARD_LEVELS: ReadonlySet<number> = new Set([20, 30, 40, 50]);
/** Highlight name → economy.json booster key (TECH §8.3 L-17). */
export const HIGHLIGHT_BOOSTER_KEY: Readonly<Record<string, string>> = {
  hammer: 'hammer',
  crane: 'crane',
  undo: 'undo',
  brush: 'paintBrush',
  thermos: 'thermos',
  trowel: 'trowelStart',
  shutter: 'openShutter',
};

const CHECK_RULE: Readonly<Record<CheckId, string>> = {
  'L-01': 'K-45/1',
  'L-02': 'K-45/2',
  'L-03': 'K-45/2',
  'L-04': 'K-45/5',
  'L-05': 'K-45/4',
  'L-06': 'K-45/4',
  'L-07': 'K-45/4',
  'L-08': 'K-45/4',
  'L-09': 'K-45/3',
  'L-10': 'K-27',
  'L-11': 'K-27',
  'L-12': 'K-25',
  'L-13': 'K-45/7',
  'L-14': 'K-45/6',
  'L-15': 'K-45/6',
  'L-16': 'K-45/9',
  'L-17': 'GDD 14.1',
  'L-18': 'LEVELS 0',
  'L-21': 'K-45/5',
  'L-22': 'K-45/9',
  'L-23': 'K-45/6',
  'L-24': 'K-24',
  'L-25': 'K-23',
  'L-26': 'Y4',
};

type Push = (check: CheckId, code: string, path: string, message: string, severity?: Severity) => void;

/** Cells of a shape anchored at (x, y). */
export function cellsAt(shape: ShapeDef, x: number, y: number): { x: number; y: number }[] {
  return shape.cells.map((c) => ({ x: x + c.x, y: y + c.y }));
}

/**
 * A non-heavy block can reach the site over the wall (K-05: box height ≤ 10 − height) or through some gap whose rows
 * hold all of its rows (K-12). Heavy blocks never cross the boundary (Y5).
 */
export function canReachSite(shape: ShapeDef, level: LevelData): boolean {
  if (shape.heavy) return false;
  return shape.h <= GRID_ROWS - level.wall.height || level.wall.gaps.some((g) => shape.h <= g.size);
}

/** Paint gate colours a block can take: it must fit the gate rows (K-12) and not be heavy (N6). */
function paintColors(shape: ShapeDef, level: LevelData): ColorCode[] {
  if (shape.heavy) return [];
  return level.wall.gaps.flatMap((g) => (g.type === 'paint' && shape.h <= g.size ? [g.color] : []));
}

function gapRows(g: GapData): [number, number] {
  return g.type === 'slider' ? [g.range[0], g.range[1] + g.size - 1] : [g.y, g.y + g.size - 1];
}

/** Rows of all flags of a piece. */
const flagsOf = (p: PieceData): readonly string[] => p.flags ?? [];

// ---------------------------------------------------------------------------------------------------------------
// Schema (L-01)
// ---------------------------------------------------------------------------------------------------------------

function formatPath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const k of path) {
    if (typeof k === 'number') out += `[${k}]`;
    else out += out === '' ? String(k) : `.${String(k)}`;
  }
  return out === '' ? '(root)' : out;
}

type SchemaError = NonNullable<ReturnType<typeof LevelSchema.safeParse>['error']>;

/** Maps zod issues to K-45 issues: a plan row of the wrong width is `row_width` (L-05), everything else `schema_invalid`. */
export function issuesFromSchema(error: SchemaError, json: unknown): Issue[] {
  return error.issues.map((iss): Issue => {
    const path = formatPath(iss.path);
    const p = iss.path;
    if (p.length === 5 && p[0] === 'build' && p[1] === 'segments' && p[3] === 'rows') {
      const row = p.reduce<unknown>(
        (acc, k) =>
          acc !== null && typeof acc === 'object' ? (acc as Record<PropertyKey, unknown>)[k] : undefined,
        json,
      );
      if (typeof row === 'string' && row.length !== 2 && /^[WYGROCBP.?]*$/.test(row)) {
        return {
          code: 'row_width',
          rule: CHECK_RULE['L-05'],
          check: 'L-05',
          severity: 'error',
          path,
          message: `plan row "${row}" must be exactly 2 characters`,
        };
      }
    }
    return {
      code: 'schema_invalid',
      rule: CHECK_RULE['L-01'],
      check: 'L-01',
      severity: 'error',
      path,
      message: iss.message,
    };
  });
}

/** Parses JSON with the schema and, when it passes, runs the logic checks. */
export function validateLevelJson(
  json: unknown,
  ctx: LogicContext = {},
): { level: LevelData | null; issues: Issue[] } {
  const parsed = LevelSchema.safeParse(json);
  if (!parsed.success) return { level: null, issues: issuesFromSchema(parsed.error, json) };
  return { level: parsed.data, issues: checkLevel(parsed.data, ctx) };
}

// ---------------------------------------------------------------------------------------------------------------
// Logic checks
// ---------------------------------------------------------------------------------------------------------------

/** Runs the logic checks (L-01 data part … L-26) on a schema-valid level. */
export function checkLevel(level: LevelData, ctx: LogicContext = {}): Issue[] {
  const issues: Issue[] = [];
  const enabled = new Set<CheckId>(ctx.only ?? CHECK_IDS);
  const push: Push = (check, code, path, message, severity = 'error') => {
    if (enabled.has(check)) issues.push({ code, rule: CHECK_RULE[check], check, severity, path, message });
  };
  const { plans, problems } = buildPlans(level);

  if (enabled.has('L-01')) checkIdentity(level, ctx, push);
  if (enabled.has('L-02') || enabled.has('L-03')) checkYard(level, push);
  if (enabled.has('L-04')) checkShapes(level, push);
  if (enabled.has('L-05')) checkElevatorOverflow(level, push);
  if (enabled.has('L-06') || enabled.has('L-07')) checkColors(level, plans, push);
  if (enabled.has('L-08')) {
    for (const p of problems) push('L-08', 'hidden_invalid', `build.segments[${p.seg}]`, p.message);
  }
  if (enabled.has('L-09')) checkWall(level, push);
  if (enabled.has('L-10')) checkMaterial(level, plans, push);
  if (enabled.has('L-11')) checkTiling(level, plans, ctx.tileBudget ?? 200_000, push);
  if (enabled.has('L-12')) checkBatches(level, push);
  if (enabled.has('L-13')) checkDebris(level, plans, push);
  if (enabled.has('L-14') || enabled.has('L-23')) checkHiddenItems(level, push);
  if (enabled.has('L-15')) checkGoals(level, push);
  if ((enabled.has('L-16') || enabled.has('L-22')) && ctx.previousMechanics)
    checkMechanics(level, ctx.previousMechanics, push);
  if (enabled.has('L-17')) checkTutorial(level, ctx, push);
  if (enabled.has('L-18')) checkSawtooth(level, push);
  if (enabled.has('L-21')) checkFlagCombos(level, push);
  if (enabled.has('L-24')) checkElevatorRange(level, push);
  if (enabled.has('L-25')) checkCarousel(level, push);
  if (enabled.has('L-26')) checkWet(level, push);
  return issues;
}

function checkIdentity(level: LevelData, ctx: LogicContext, push: Push): void {
  if (level.id < 1 || level.id > 50) push('L-01', 'id_mismatch', 'id', `id ${level.id} is outside 1–50`);
  if (ctx.fileId !== undefined && ctx.fileId !== level.id)
    push('L-01', 'id_mismatch', 'id', `id ${level.id} does not match the file name (level ${ctx.fileId})`);
  const chapter = Math.ceil(level.id / 10);
  if (level.chapter !== chapter)
    push('L-01', 'chapter_mismatch', 'chapter', `chapter ${level.chapter} ≠ ceil(id / 10) = ${chapter}`);
}

/** L-02 overlap / out_of_yard, L-03 yard_fill_low. Occupying entities: batch-0 pieces, crates, cement bags. */
function checkYard(level: LevelData, push: Push): void {
  const owner = new Map<number, string>();
  const claim = (x: number, y: number, path: string): void => {
    const key = y * YARD_COLS + x;
    const prev = owner.get(key);
    if (prev !== undefined) push('L-02', 'overlap', path, `cell (${x},${y}) is already taken by ${prev}`);
    else owner.set(key, path);
  };
  const batch0 = level.yard.batches[0];
  batch0?.pieces.forEach((p, i) => {
    const path = `yard.batches[0].pieces[${i}]`;
    const shape = shapeById(p.shape);
    const cells = cellsAt(shape, p.x, p.y);
    const outside = cells.filter((c) => c.x < 0 || c.x >= YARD_COLS || c.y < 0 || c.y >= BOARD_ROWS);
    if (outside.length > 0) {
      push('L-02', 'out_of_yard', path, `${p.shape} at (${p.x},${p.y}) leaves the yard (x 0–5, y 0–7)`);
      return;
    }
    for (const c of cells) claim(c.x, c.y, path);
  });
  level.obstacles.forEach((o, i) => {
    if (o.type === 'crate' || o.type === 'cement_bag') claim(o.x, o.y, `obstacles[${i}]`);
  });
  const filled = owner.size;
  const total = YARD_COLS * BOARD_ROWS;
  if (filled * 100 < 80 * total)
    push(
      'L-03',
      'yard_fill_low',
      'yard',
      `yard fill ${filled}/${total} = ${((100 * filled) / total).toFixed(1)}% < 80%`,
    );
}

function allPlaced(
  level: LevelData,
): { path: string; shape: ShapeId; isDebris: boolean; piece?: PieceData }[] {
  const out: { path: string; shape: ShapeId; isDebris: boolean; piece?: PieceData }[] = [];
  level.yard.batches.forEach((b, bi) =>
    b.pieces.forEach((p, i) =>
      out.push({ path: `yard.batches[${bi}].pieces[${i}]`, shape: p.shape, isDebris: false, piece: p }),
    ),
  );
  level.build.debris?.forEach((d, i) =>
    out.push({ path: `build.debris[${i}]`, shape: d.shape, isDebris: true }),
  );
  return out;
}

/** L-04 (K-44): forbidden orientations, I5/Q9 only in the yard, kinds per chapter, heavy only from level 8. */
function checkShapes(level: LevelData, push: Push): void {
  for (const { path, shape: id, isDebris } of allPlaced(level)) {
    const shape = shapeById(id);
    if (FORBIDDEN_SHAPES.has(id))
      push('L-04', 'shape_forbidden', path, `${id} is forbidden in level data (K-44)`);
    if (isDebris && (shape.kind === 'I5' || shape.kind === 'Q9'))
      push('L-04', 'shape_forbidden', path, `${shape.kind} may only be used in the yard`);
    const first = KIND_FIRST_CHAPTER[shape.kind];
    if (first > level.chapter)
      push(
        'L-04',
        'shape_locked',
        path,
        `${shape.kind} unlocks in story chapter ${first} (level is chapter ${level.chapter})`,
      );
    if (shape.heavy && level.id < HEAVY_MIN_LEVEL_ID)
      push(
        'L-04',
        'shape_locked',
        path,
        `heavy shape ${id} is allowed only from level ${HEAVY_MIN_LEVEL_ID}`,
      );
  }
}

/** L-05 elevator_overflow: `h + b ≤ 8` for every segment (K-24). (`row_width` comes from the schema mapping.) */
function checkElevatorOverflow(level: LevelData, push: Push): void {
  const el = level.build.elevator;
  if (!el) return;
  level.build.segments.forEach((s, i) => {
    if (s.rows.length + el.range[1] > BOARD_ROWS)
      push(
        'L-05',
        'elevator_overflow',
        `build.segments[${i}]`,
        `plan height ${s.rows.length} + ${el.range[1]} > 8`,
      );
  });
}

/** Colour set (GDD K-31): plan cells (resolved `?`) ∪ every block (all batches, debris) ∪ paint gate colours. */
export function levelColorSet(
  level: LevelData,
  plans: readonly SegmentPlan[] = buildPlans(level).plans,
): ColorCode[] {
  const set = new Set<ColorCode>();
  for (const plan of plans) for (const c of plan.cells) if (c !== null && c !== '.') set.add(c);
  for (const b of level.yard.batches) for (const p of b.pieces) set.add(p.color);
  for (const d of level.build.debris ?? []) set.add(d.color);
  for (const g of level.wall.gaps) if (g.type === 'paint') set.add(g.color);
  return COLOR_CODES.filter((c) => set.has(c));
}

function checkColors(level: LevelData, plans: readonly SegmentPlan[], push: Push): void {
  const colors = levelColorSet(level, plans);
  const limit = CHAPTER_COLOR_LIMIT[level.chapter] ?? 5;
  if (colors.length > limit)
    push(
      'L-06',
      'too_many_colors',
      'level',
      `${colors.length} colours (${colors.join(' ')}) > ${limit} for chapter ${level.chapter}`,
    );
  const locked = colors.filter((c) => COLOR_FIRST_LEVEL[c] > level.id);
  if (locked.length > 0)
    push(
      'L-07',
      'color_locked',
      'level',
      locked.map((c) => `${c} unlocks at level ${COLOR_FIRST_LEVEL[c]}`).join('; '),
    );
}

/** L-09 (K-04, K-45/3, OBSTACLES W4/W5/W7/W8). */
function checkWall(level: LevelData, push: Push): void {
  const { height, gaps } = level.wall;
  gaps.forEach((g, i) => {
    const path = `wall.gaps[${i}]`;
    if (g.type !== 'slider' && g.y + g.size > height - 1)
      push('L-09', 'gap_touches_top', path, `y + size = ${g.y + g.size} > height − 1 = ${height - 1}`);
    if (g.type === 'shutter' && g.phase >= 2 * g.period)
      push('L-09', 'shutter_phase', path, `phase ${g.phase} must be < 2·period = ${2 * g.period}`);
    if (g.type === 'slider') {
      const [a, b] = g.range;
      if (!(a < b)) push('L-09', 'slider_range', path, `range [${a},${b}] needs a < b`);
      if (g.y < a || g.y > b)
        push('L-09', 'slider_range', path, `start y ${g.y} is outside range [${a},${b}]`);
      if (b + g.size > height - 1)
        push('L-09', 'slider_range', path, `range end ${b} + size ${g.size} > height − 1 = ${height - 1}`);
    }
    if (g.type === 'locked' && !level.obstacles.some((o) => o.type === 'key' && o.id === g.keyId))
      push('L-09', 'key_missing', path, `no key obstacle with id "${g.keyId}"`);
  });
  for (let i = 0; i < gaps.length; i++) {
    for (let j = i + 1; j < gaps.length; j++) {
      const gi = gaps[i];
      const gj = gaps[j];
      if (!gi || !gj) continue;
      const [a0, a1] = gapRows(gi);
      const [b0, b1] = gapRows(gj);
      if (a0 <= b1 && b0 <= a1)
        push('L-09', 'gap_overlap', `wall.gaps[${j}]`, `rows ${b0}–${b1} overlap gap ${i} rows ${a0}–${a1}`);
    }
  }
  if (level.wall.fan && !allPlaced(level).some((p) => !p.isDebris && shapeById(p.shape).w === 1))
    push('L-09', 'fan_unused', 'wall.fan', 'wind fan in a level without 1-wide blocks', 'warn');
}

// ---------------------------------------------------------------------------------------------------------------
// L-10 material (K-27): cumulative supply ≥ demand per colour; every block counts once, WHOLE, for one colour
// ---------------------------------------------------------------------------------------------------------------

interface SupplyBlock {
  readonly forSegment: number;
  readonly color: ColorCode;
  readonly cells: number;
  /** Paint gate colours this block can take on its way to the site (K-27 / TECH L-10, OBSTACLES W6). */
  readonly alts: readonly ColorCode[];
}

/** Search nodes of the whole-block assignment before `materialShortfall` settles for what it has proven. */
const MATERIAL_SEARCH_BUDGET = 50_000;

/**
 * Returns the colours whose demand cannot be met (empty = enough material), in `COLOR_CODES` order.
 *
 * GDD K-27 sums "o renkteki … blokların hücre toplamı" and TECH L-10 counts a paint-gate block for the gate colour
 * too, "her blok bir kez": a block is one colour as a whole, so a 4-cell block that is Y or P (after the gate)
 * supplies 4 Y **or** 4 P, never 2 Y + 2 P. Single-colour blocks are counted directly; blocks with a choice are
 * assigned by a depth-first branch and bound (largest blocks first, own colour before gate colours) that minimises
 * the number of uncovered plan cells; the colours left uncovered by the best assignment are reported. A colour that is
 * short on its own is therefore always reported, and a demand some assignment covers always gives `[]`.
 * Pathological inputs (more than `MATERIAL_SEARCH_BUDGET` nodes) keep the best assignment found only when a shortage
 * is already proven by the per-colour or total supply bound; otherwise nothing is reported, because the check must not
 * refuse a level on an unproven claim (L-11 exact cover and the L-19 solver stay authoritative).
 */
export function materialShortfall(
  demand: Readonly<Partial<Record<ColorCode, number>>>,
  blocks: readonly SupplyBlock[],
): ColorCode[] {
  const rest = new Map<ColorCode, number>();
  for (const c of COLOR_CODES) {
    const d = demand[c] ?? 0;
    if (d > 0) rest.set(c, d);
  }
  const flexible: { readonly cells: number; readonly colors: readonly ColorCode[] }[] = [];
  for (const b of blocks) {
    const colors = [...new Set([b.color, ...b.alts])];
    const d = rest.get(b.color);
    if (colors.length > 1) flexible.push({ cells: b.cells, colors });
    else if (d !== undefined) rest.set(b.color, d - b.cells);
  }
  const open = [...rest].filter(([, d]) => d > 0).map(([c]) => c);
  if (open.length === 0) return [];
  const m = open.length;
  const items = flexible
    .map((b) => ({
      cells: b.cells,
      opts: b.colors.flatMap((c) => (open.includes(c) ? [open.indexOf(c)] : [])),
    }))
    .filter((it) => it.opts.length > 0)
    .sort((a, b) => b.cells - a.cells);
  const n = items.length;
  // Suffix supplies for the lower bound: per open colour and in total, from item i on.
  const suffix = Array.from({ length: n + 1 }, () => Array.from({ length: m + 1 }, () => 0));
  for (let i = n - 1; i >= 0; i--) {
    const it = items[i] as (typeof items)[number];
    const row = suffix[i] as number[];
    const next = suffix[i + 1] as number[];
    for (let k = 0; k <= m; k++) row[k] = next[k] ?? 0;
    for (const k of it.opts) row[k] = (row[k] ?? 0) + it.cells;
    row[m] = (row[m] ?? 0) + it.cells;
  }
  const lowerBound = (i: number, d: readonly number[]): number => {
    const s = suffix[i] as number[];
    let perColor = 0;
    let total = 0;
    d.forEach((v, k) => {
      perColor += Math.max(0, v - (s[k] ?? 0));
      total += v;
    });
    return Math.max(perColor, total - (s[m] ?? 0));
  };
  const start = open.map((c) => rest.get(c) ?? 0);
  const relaxedShort = lowerBound(0, start) > 0;
  let best = start.reduce((s, v) => s + v, 0) + 1;
  let bestRest: readonly number[] = start;
  const seen = new Set<string>();
  let nodes = 0;
  // Exploring a state again cannot beat `best`: `best` only falls, so the first visit already found anything better.
  const search = (i: number, d: readonly number[]): void => {
    const uncovered = d.reduce((s, v) => s + v, 0);
    if (uncovered < best && (uncovered === 0 || i === n)) {
      best = uncovered;
      bestRest = d;
    }
    if (best === 0 || i === n || lowerBound(i, d) >= best || nodes >= MATERIAL_SEARCH_BUDGET) return;
    const key = `${i}|${d.join(',')}`;
    if (seen.has(key)) return;
    seen.add(key);
    nodes++;
    const it = items[i] as (typeof items)[number];
    for (const k of it.opts)
      search(
        i + 1,
        d.map((v, j) => (j === k ? Math.max(0, v - it.cells) : v)),
      );
  };
  search(0, start);
  if (nodes >= MATERIAL_SEARCH_BUDGET && best > 0 && !relaxedShort) return [];
  return open.filter((_, k) => (bestRest[k] ?? 0) > 0);
}

function supplyBlocks(level: LevelData): SupplyBlock[] {
  return level.yard.batches.flatMap((b) =>
    b.pieces.flatMap((p) => {
      const shape = shapeById(p.shape);
      if (!canReachSite(shape, level)) return [];
      return [
        { forSegment: b.forSegment, color: p.color, cells: shape.cellCount, alts: paintColors(shape, level) },
      ];
    }),
  );
}

function checkMaterial(level: LevelData, plans: readonly SegmentPlan[], push: Push): void {
  const blocks = supplyBlocks(level);
  const S = plans.length;
  const stages = level.build.mode === 'segments' ? [...Array(S).keys()] : [S - 1];
  const reported = new Set<ColorCode>();
  for (const k of stages) {
    const demand: Partial<Record<ColorCode, number>> = {};
    plans.forEach((plan, j) => {
      if (j > k) return;
      for (const c of plan.cells) if (c !== null && c !== '.') demand[c] = (demand[c] ?? 0) + 1;
    });
    const short = materialShortfall(
      demand,
      blocks.filter((b) => b.forSegment <= k),
    );
    for (const c of short) {
      if (reported.has(c)) continue;
      reported.add(c);
      const where = level.build.mode === 'segments' ? `segments 0–${k}` : 'all segments';
      push(
        'L-10',
        'material_short',
        `build.segments[${k}]`,
        `colour ${c}: plan cells of ${where} exceed the delivered supply`,
      );
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// L-11 tiling (K-27, K-34): bottom-up exact cover with physically reachable placements
// ---------------------------------------------------------------------------------------------------------------

interface BlockType {
  readonly shape: ShapeDef;
  readonly color: ColorCode;
  readonly balloon: boolean;
  readonly alts: readonly ColorCode[];
  readonly free: boolean;
}

function typeKey(t: BlockType): string {
  return `${t.shape.canonicalIndex}:${t.color}:${t.balloon ? 1 : 0}:${t.alts.join('')}`;
}

/**
 * Exact-cover search over one segment after another (segments mode; carousel: each segment alone with the whole
 * supply). A placement is valid when its cells are empty target cells of the block colour, K-34 holds, and it is
 * physically reachable: FREE drop landing exactly there (K-11), a rail through a gap whose rows hold the block
 * (K-12, path cells empty; elevator offsets a…b tried), or a balloon hanging from the plan top / a filled cell (S8).
 * Phase-3 mechanics (wind, G-L steering, debris) are approximated; the solver (L-19) is authoritative.
 */
export function tileLevel(
  level: LevelData,
  plans: readonly SegmentPlan[],
  budget: number,
): 'ok' | 'fail' | 'unknown' | number {
  const types: BlockType[] = [];
  const typeIndex = new Map<string, number>();
  const batchCounts: number[][] = level.yard.batches.map(() => []);
  const addCount = (counts: number[], i: number): void => {
    counts[i] = (counts[i] ?? 0) + 1;
  };
  level.yard.batches.forEach((b, bi) => {
    for (const p of b.pieces) {
      const shape = shapeById(shapeById(p.shape).canonical);
      if (!canReachSite(shape, level)) continue;
      const t: BlockType = {
        shape,
        color: p.color,
        balloon: flagsOf(p).includes('balloon'),
        alts: paintColors(shape, level),
        free: shape.h <= GRID_ROWS - level.wall.height,
      };
      const key = typeKey(t);
      let idx = typeIndex.get(key);
      if (idx === undefined) {
        idx = types.length;
        types.push(t);
        typeIndex.set(key, idx);
      }
      addCount(batchCounts[bi] as number[], idx);
    }
  });
  const offsets: number[] = [];
  const el = level.build.elevator;
  if (el) for (let e = el.range[0]; e <= el.range[1]; e++) offsets.push(e);
  else offsets.push(0);

  let nodes = 0;
  const failed = new Set<string>();
  const S = plans.length;

  const supplyFor = (seg: number): number[] => {
    const out: number[] = [];
    level.yard.batches.forEach((b, bi) => {
      if (b.forSegment !== seg) return;
      (batchCounts[bi] ?? []).forEach((n, i) => {
        if (n) out[i] = (out[i] ?? 0) + n;
      });
    });
    return out;
  };
  const merge = (a: readonly number[], b: readonly number[]): number[] => {
    const out = [...a];
    b.forEach((n, i) => {
      if (n) out[i] = (out[i] ?? 0) + n;
    });
    return out;
  };

  const solveSeg = (seg: number, filled: number, counts: number[], chain: boolean): boolean | 'budget' => {
    const plan = plans[seg];
    if (!plan) return true;
    if (filled === plan.targetMask) {
      if (!chain || seg + 1 >= S) return true;
      return solveSeg(seg + 1, 0, merge(counts, supplyFor(seg + 1)), chain);
    }
    const key = `${seg}|${filled}|${counts.join(',')}`;
    if (failed.has(key)) return false;
    if (++nodes > budget) return 'budget';
    const filledAt = (sx: number, sy: number): boolean => ((filled >> localIndex(sx, sy)) & 1) === 1;
    const topOf = (sx: number): number => {
      for (let sy = plan.height - 1; sy >= 0; sy--) if (filledAt(sx, sy)) return sy + 1;
      return 0;
    };
    for (let ti = 0; ti < types.length; ti++) {
      if (!counts[ti]) continue;
      const t = types[ti] as BlockType;
      const s = t.shape;
      for (const color of new Set([t.color, ...t.alts])) {
        for (let ax = 0; ax + s.w <= SITE_COLS; ax++) {
          for (let ay = 0; ay + s.h <= plan.height; ay++) {
            let mask = 0;
            let ok = true;
            for (const c of s.cells) {
              const i = localIndex(ax + c.x, ay + c.y);
              if (plan.cells[i] !== color || ((filled >> i) & 1) === 1) {
                ok = false;
                break;
              }
              mask |= 1 << i;
            }
            if (!ok) continue;
            // K-34: every non-dot plan row below the block's lowest cell of each column is filled.
            for (let c = 0; c < s.w && ok; c++) {
              const sx = ax + c;
              const r = ay + (s.colBottom[c] ?? 0);
              const below = ((1 << r) - 1) & (plan.planMask[sx] ?? 0);
              const filledCol = colMask(filled, sx, plan.height);
              if ((below & ~filledCol) !== 0) ok = false;
            }
            if (!ok) continue;
            if (!reachable(t, color, ax, ay, plan, filled, topOf)) continue;
            counts[ti] = (counts[ti] ?? 0) - 1;
            const res = solveSeg(seg, filled | mask, counts, chain);
            counts[ti] = (counts[ti] ?? 0) + 1;
            if (res !== false) return res;
          }
        }
      }
    }
    failed.add(key);
    return false;
  };

  const reachable = (
    t: BlockType,
    color: ColorCode,
    ax: number,
    ay: number,
    plan: SegmentPlan,
    filled: number,
    topOf: (sx: number) => number,
  ): boolean => {
    const s = t.shape;
    // FREE: over the wall (after a paint-gate detour when the colour is a paint colour).
    if (t.free && !t.balloon) {
      let landing = 0;
      for (let c = 0; c < s.w; c++) landing = Math.max(landing, topOf(ax + c) - (s.colBottom[c] ?? 0));
      if (landing === ay) return true;
    }
    if (t.free && t.balloon) {
      let rest = Infinity;
      for (let c = 0; c < s.w; c++) {
        const sx = ax + c;
        let stop = plan.height;
        for (let sy = ay + (s.colTop[c] ?? 0) + 1; sy < plan.height; sy++) {
          if (((filled >> localIndex(sx, sy)) & 1) === 1) {
            stop = sy;
            break;
          }
        }
        rest = Math.min(rest, stop - (s.colTop[c] ?? 0) - 1);
      }
      if (rest === ay) return true;
    }
    // RAIL through a gap. W6 / S-21: paint is permanent once the block has entered a paint gate's rail (even half
    // way and back into the yard), so a painted block may then use any gap; only a paint gate of another colour is
    // excluded because entering it would repaint the block (last entered gate wins, E-39).
    for (const g of level.wall.gaps) {
      if (g.type === 'paint' && g.color !== color) continue;
      const starts = g.type === 'slider' ? range(g.range[0], g.range[1]) : [g.y];
      const fits = offsets.some((e) => starts.some((p) => p - e <= ay && ay + s.h <= p - e + g.size));
      if (!fits) continue;
      let clear = true;
      for (let tx = -s.w + 1; tx < ax && clear; tx++) {
        for (const c of s.cells) {
          const sx = tx + c.x;
          if (sx < 0 || sx >= SITE_COLS) continue;
          if (((filled >> localIndex(sx, ay + c.y)) & 1) === 1) clear = false;
        }
      }
      if (clear) return true;
    }
    return false;
  };

  if (level.build.mode === 'segments') {
    const res = solveSeg(0, 0, supplyFor(0), true);
    if (res === 'budget') return 'unknown';
    if (res) return 'ok';
    return 'fail';
  }
  // carousel: each segment alone with the whole supply
  const all = level.yard.batches.reduce<number[]>((acc, _b, bi) => merge(acc, batchCounts[bi] ?? []), []);
  for (let seg = 0; seg < S; seg++) {
    const res = solveSeg(seg, 0, [...all], false);
    if (res === 'budget') return 'unknown';
    if (!res) return seg;
  }
  return 'ok';
}

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

function colMask(filled: number, sx: number, height: number): number {
  let m = 0;
  for (let sy = 0; sy < height; sy++) if ((filled >> localIndex(sx, sy)) & 1) m |= 1 << sy;
  return m;
}

function checkTiling(level: LevelData, plans: readonly SegmentPlan[], budget: number, push: Push): void {
  if (plans.some((p) => p.cells.some((c, i) => c === null && ((p.targetMask >> i) & 1) === 1))) return; // L-08
  const res = tileLevel(level, plans, budget);
  if (res === 'ok') return;
  if (res === 'unknown') {
    push(
      'L-11',
      'untileable',
      'build.segments',
      `tiling search budget (${budget} nodes) exhausted; inconclusive`,
      'warn',
    );
    return;
  }
  const where = typeof res === 'number' ? `segment ${res}` : 'the segments';
  push(
    'L-11',
    'untileable',
    typeof res === 'number' ? `build.segments[${res}]` : 'build.segments',
    `${where} cannot be built bottom-up (K-34) with the delivered blocks and reachable placements`,
  );
}

// ---------------------------------------------------------------------------------------------------------------
// L-12 … L-26
// ---------------------------------------------------------------------------------------------------------------

/** L-12 (K-25). */
function checkBatches(level: LevelData, push: Push): void {
  const S = level.build.segments.length;
  const batches = level.yard.batches;
  if (batches[0]?.forSegment !== 0)
    push('L-12', 'batch_invalid', 'yard.batches[0]', 'batch 0 must be the start batch of segment 0');
  if (batches[0]?.dropColumns)
    push('L-12', 'batch_invalid', 'yard.batches[0].dropColumns', 'dropColumns is unused on batch 0', 'warn');
  batches.forEach((b, k) => {
    const path = `yard.batches[${k}]`;
    if (b.forSegment > S - 1)
      push('L-12', 'batch_invalid', path, `forSegment ${b.forSegment} ≥ segment count ${S}`);
    if (k >= 1 && b.forSegment < 1)
      push(
        'L-12',
        'batch_invalid',
        path,
        'a truck batch (k ≥ 1) is delivered when a segment completes: forSegment ≥ 1',
      );
    if (k === 0) return;
    b.pieces.forEach((p, i) => {
      const w = shapeById(p.shape).w;
      if (p.y !== 8)
        push(
          'L-12',
          'batch_invalid',
          `${path}.pieces[${i}]`,
          `truck piece y must be written as 8 (got ${p.y})`,
        );
      if (p.x > YARD_COLS - w)
        push(
          'L-12',
          'batch_invalid',
          `${path}.pieces[${i}]`,
          `truck piece x ${p.x} > 6 − w = ${YARD_COLS - w}`,
        );
      for (const c of b.dropColumns ?? []) {
        if (c > YARD_COLS - w)
          push(
            'L-12',
            'batch_invalid',
            `${path}.dropColumns`,
            `drop column ${c} does not fit ${p.shape} (w ${w})`,
          );
      }
    });
  });
}

/** L-13 (K-45/7): debris inside the site, inside its own segment's plan height, no debris overlap. */
function checkDebris(level: LevelData, plans: readonly SegmentPlan[], push: Push): void {
  const taken = new Map<string, number>();
  level.build.debris?.forEach((d, i) => {
    const path = `build.debris[${i}]`;
    const seg = d.segment ?? 0;
    const plan = plans[seg];
    if (!plan) {
      push('L-13', 'debris_misplaced', path, `segment ${seg} does not exist`);
      return;
    }
    const cells = cellsAt(shapeById(d.shape), d.x, d.y);
    if (cells.some((c) => c.x < 6 || c.x > 7 || c.y < 0 || c.y >= plan.height)) {
      push(
        'L-13',
        'debris_misplaced',
        path,
        `debris must lie in x 6–7 inside segment ${seg}'s plan rows 0–${plan.height - 1}`,
      );
      return;
    }
    for (const c of cells) {
      const key = `${seg}:${c.x},${c.y}`;
      const other = taken.get(key);
      if (other !== undefined)
        push('L-13', 'debris_misplaced', path, `overlaps build.debris[${other}] at (${c.x},${c.y})`);
      else taken.set(key, i);
    }
  });
}

/** L-14 hidden_item_exposed (+ crate hp), L-23 hidden_item_stacked (K-42, N4, N5). */
function checkHiddenItems(level: LevelData, push: Push): void {
  const covered = new Set<string>();
  level.yard.batches[0]?.pieces.forEach((p) => {
    for (const c of cellsAt(shapeById(p.shape), p.x, p.y)) covered.add(`${c.x},${c.y}`);
  });
  const crates = new Set(level.obstacles.filter((o) => o.type === 'crate').map((o) => `${o.x},${o.y}`));
  const items = new Map<string, number>();
  level.obstacles.forEach((o, i) => {
    const path = `obstacles[${i}]`;
    if (o.type === 'crate' && o.hp === undefined)
      push('L-14', 'schema_invalid', path, 'a crate needs hp 1–3 (OBSTACLES Y1)');
    if (o.type !== 'screw' && o.type !== 'key') return;
    const key = `${o.x},${o.y}`;
    if (!covered.has(key) && !crates.has(key))
      push(
        'L-14',
        'hidden_item_exposed',
        path,
        `${o.type} at (${key}) is not under a block or a crate at start`,
      );
    const prev = items.get(key);
    if (prev !== undefined)
      push('L-23', 'hidden_item_stacked', path, `second hidden item in cell (${key}) (obstacles[${prev}])`);
    else items.set(key, i);
  });
}

/** L-15 (K-41). */
function checkGoals(level: LevelData, push: Push): void {
  const builds = level.goals.filter((g) => g.type === 'build').length;
  if (builds !== 1)
    push('L-15', 'goal_build_missing', 'goals', `exactly one build goal required (found ${builds})`);
  const pieces = level.yard.batches.flatMap((b) => b.pieces);
  const available = {
    crate: level.obstacles.filter((o) => o.type === 'crate').length,
    chain: pieces.filter((p) => flagsOf(p).includes('chained')).length,
    debris: level.build.debris?.length ?? 0,
    screw: level.obstacles.filter((o) => o.type === 'screw').length,
  };
  level.goals.forEach((g, i) => {
    const path = `goals[${i}]`;
    if (g.type === 'clear' && g.count > available[g.target])
      push(
        'L-15',
        'goal_count_too_high',
        path,
        `clear ${g.target} ${g.count} > ${available[g.target]} in the level`,
      );
    if (g.type === 'collect' && g.count > available.screw)
      push('L-15', 'goal_count_too_high', path, `collect screw ${g.count} > ${available.screw} in the level`);
  });
}

/** L-16 teaches_mismatch, L-22 too_many_new_mechanics (K-45/9). */
function checkMechanics(level: LevelData, previous: ReadonlySet<MechanicId>, push: Push): void {
  const fresh = deriveMechanics(level).filter((m) => !previous.has(m));
  if (fresh.length > 1)
    push(
      'L-22',
      'too_many_new_mechanics',
      'level',
      `${fresh.length} new mechanics (${fresh.join(', ')}); at most 1`,
    );
  if (level.teaches !== undefined) {
    if (fresh.length === 0)
      push(
        'L-16',
        'teaches_mismatch',
        'teaches',
        `teaches ${level.teaches} but the data has no new mechanic`,
      );
    else if (!fresh.includes(level.teaches))
      push(
        'L-16',
        'teaches_mismatch',
        'teaches',
        `teaches ${level.teaches} but the derived new mechanic is ${fresh.join(', ')}`,
      );
  }
}

/** Why the event of a `done` / `startOn` condition can never happen in this level (null = possible). */
function conditionImpossible(level: LevelData, cond: TutCondition): string | null {
  const allPieces = level.yard.batches.flatMap((b) => b.pieces);
  const truckPieces = level.yard.batches.slice(1).flatMap((b) => b.pieces);
  switch (cond.event) {
    case 'segmentDone':
      return level.build.segments.length >= 2 ? null : 'segmentDone needs ≥ 2 segments';
    case 'deliveryDone':
      if (level.yard.batches.length < 2) return 'deliveryDone needs a truck batch';
      if (cond.flag && !truckPieces.some((p) => flagsOf(p).includes(cond.flag as string)))
        return `deliveryDone flag ${cond.flag} needs a truck block with that flag`;
      return null;
    case 'gapPass':
      return level.wall.gaps.length >= 1 ? null : 'gapPass needs a gap';
    case 'obstacleHit':
      if (cond.type === 'chain')
        return allPieces.some((p) => flagsOf(p).includes('chained'))
          ? null
          : 'obstacleHit chain needs a chained block';
      return level.obstacles.some((o) => o.type === cond.type)
        ? null
        : `obstacleHit ${cond.type} needs a ${cond.type}`;
    case 'itemCollected':
      return level.obstacles.some((o) => o.type === cond.type)
        ? null
        : `itemCollected ${cond.type} needs a ${cond.type}`;
    case 'landed':
      if (cond.flag && !allPieces.some((p) => flagsOf(p).includes(cond.flag as string)))
        return `landed flag ${cond.flag} needs a block with that flag`;
      if (cond.wind && !level.wall.fan) return 'landed wind needs wall.fan';
      return null;
    case 'steered':
      return level.gravity.build === 'low' ? null : 'steered needs gravity.build "low"';
    case 'yardFall':
      return level.gravity.yard ? null : 'yardFall needs gravity.yard';
    case 'carouselTurn':
      return level.build.mode === 'carousel' ? null : 'carouselTurn needs build.mode "carousel"';
    case 'placementCorrect':
      if (cond.hidden && !level.build.segments.some((s) => s.rows.some((r) => r.includes('?'))))
        return 'placementCorrect hidden needs a `?` cell';
      if (cond.at && cond.at[0] < 6) return 'placementCorrect at must be a site anchor (x ≥ 6)';
      return null;
    case 'yardMove':
      if (cond.painted && !level.wall.gaps.some((g) => g.type === 'paint'))
        return 'yardMove painted needs a paint gate';
      if (cond.at && cond.at[0] > 5) return 'yardMove at must be a yard anchor (x ≤ 5)';
      return null;
    default:
      return null;
  }
}

/** Batches k ≥ 1 in delivery order (forSegment ascending, then array order). */
function deliveryOrder(level: LevelData): number[] {
  return level.yard.batches
    .map((b, k) => ({ k, seg: b.forSegment }))
    .filter((b) => b.k >= 1)
    .sort((a, b) => a.seg - b.seg || a.k - b.k)
    .map((b) => b.k);
}

/** L-17 (GDD §14.1, UX §13.1). */
function checkTutorial(level: LevelData, ctx: LogicContext, push: Push): void {
  const steps = level.tutorial ?? [];
  const batches = level.yard.batches;
  steps.forEach((st, i) => {
    const path = `tutorial[${i}]`;
    if (st.step !== i + 1)
      push(
        'L-17',
        'tut_done_invalid',
        `${path}.step`,
        `steps must be numbered 1, 2, … in order (expected ${i + 1})`,
      );
    if (ctx.i18nKeys) {
      const missing = (['tr', 'en'] as const).filter((lang) => !ctx.i18nKeys?.[lang].has(st.textKey));
      if (missing.length > 0)
        push(
          'L-17',
          'tut_key_missing',
          `${path}.textKey`,
          `${st.textKey} missing in ${missing.join(', ')}.json`,
        );
    }
    let hasPiece = false;
    let hasDebris = false;
    st.highlight.forEach((h, hi) => {
      const hpath = `${path}.highlight[${hi}]`;
      const bad = (msg: string): void => push('L-17', 'tut_highlight_invalid', hpath, `${h}: ${msg}`);
      const [kind, arg = ''] = h.split(':') as [string, string | undefined];
      if (kind === 'piece') {
        hasPiece = true;
        const batchMatch = /^k(\d+)_(\d+)$/.exec(arg);
        if (!batchMatch) {
          if (Number(arg) >= (batches[0]?.pieces.length ?? 0)) bad('no such batch-0 block');
          return;
        }
        const p = Number(batchMatch[1]);
        const idx = Number(batchMatch[2]);
        const piece = batches[p]?.pieces[idx];
        if (p < 1 || !piece) {
          bad('no such truck block');
          return;
        }
        const start = st.startOn;
        if (!start || start.event !== 'deliveryDone') {
          bad('a truck block may only be highlighted in a step with startOn deliveryDone (GDD 14.1/5)');
          return;
        }
        const matches = (q: PieceData): boolean => !start.flag || flagsOf(q).includes(start.flag);
        if (!matches(piece)) {
          bad(`the block does not satisfy the startOn filter flag ${start.flag}`);
          return;
        }
        if (level.build.mode === 'segments') {
          const order = deliveryOrder(level).filter((k) => batches[k]?.pieces.some(matches));
          const expected = order[(start.count ?? 1) - 1];
          if (expected !== p) bad(`the startOn delivery is batch ${expected ?? 'none'}, not batch ${p}`);
        }
      } else if (kind === 'debris') {
        hasDebris = true;
        if (Number(arg) >= (level.build.debris?.length ?? 0)) bad('no such debris');
      } else if (kind === 'cell') {
        const y = Number(arg.split(',')[1]);
        if (y > BOARD_ROWS - 1) bad('cell is not on the board');
      } else if (kind === 'gap') {
        if (Number(arg) >= level.wall.gaps.length) bad('no such gap');
      } else if (kind === 'obstacle') {
        if (Number(arg) >= level.obstacles.length) bad('no such obstacle');
      } else if (kind === 'fan') {
        if (!level.wall.fan) bad('level has no wind fan');
      } else if (kind === 'truck') {
        if (batches.length < 2) bad('level has no truck batch');
      } else if ((kind === 'booster' || kind === 'pre') && ctx.boosterUnlock) {
        const key = HIGHLIGHT_BOOSTER_KEY[arg] ?? arg;
        const unlock = ctx.boosterUnlock[key];
        if (unlock === undefined) bad(`economy.json has no booster ${key}`);
        else if (unlock > level.id) bad(`${key} unlocks at level ${unlock}`);
      }
    });
    checkGloveStart(level, st, path, push);
    for (const [field, cond] of [
      ['done', 'event' in st.done ? st.done : undefined],
      ['startOn', st.startOn],
    ] as const) {
      if (!cond) continue;
      const why = conditionImpossible(level, cond);
      if (why) push('L-17', 'tut_done_invalid', `${path}.${field}`, why);
    }
    if (st.mode === 'required') {
      if (!hasPiece && !hasDebris)
        push(
          'L-17',
          'tut_highlight_invalid',
          `${path}.highlight`,
          'a required step highlights at least one piece: or debris:',
        );
      else if (!hasPiece && 'event' in st.done && st.done.event === 'placementCorrect')
        push(
          'L-17',
          'tut_done_invalid',
          `${path}.done`,
          'debris can never be placed correctly (K-16 condition 2)',
        );
    }
  });
}

/**
 * L-17 glove start (LEVELS §5 "Eldiven vurgulu bloktan başlar", product-lead Faz 2 tur 2): a `drag` / `hold` glove's
 * `path[0]` is a cell of a highlighted `piece:<i>` (batch 0) or `debris:<i>` (segment 0) block at its JSON start — the
 * finger presses the block it moves, not its anchor nor a neighbour. A step whose blocks are all truck blocks
 * (`piece:k<p>_<i>`, start = the delivery) or debris of a later segment is not checked here (Phase 3). `tap` is not checked
 * (it may press a cell or a block that moved).
 */
function checkGloveStart(
  level: LevelData,
  st: NonNullable<LevelData['tutorial']>[number],
  path: string,
  push: Push,
): void {
  const hand = st.hand;
  const first = hand?.path?.[0];
  if (!hand || hand.kind === 'tap' || !first) return;
  const starts: (readonly [number, number])[] = [];
  let checkable = false;
  for (const h of st.highlight) {
    const [kind, arg = ''] = h.split(':') as [string, string | undefined];
    let block: { shape: ShapeId; x: number; y: number } | undefined;
    if (kind === 'piece' && /^\d+$/.test(arg)) block = level.yard.batches[0]?.pieces[Number(arg)];
    else if (kind === 'debris') {
      const d = level.build.debris?.[Number(arg)];
      if (d && (d.segment ?? 0) === 0) block = d;
    }
    if (!block) continue;
    checkable = true;
    const { x, y } = block;
    for (const c of shapeById(block.shape).cells) starts.push([x + c.x, y + c.y]);
  }
  if (!checkable) return;
  const [fx, fy] = first;
  if (!starts.some(([x, y]) => x === fx && y === fy))
    push(
      'L-17',
      'tut_highlight_invalid',
      `${path}.hand.path[0]`,
      `a ${hand.kind} glove starts on a highlighted block's cell (LEVELS 5): (${fx},${fy}) is none of ${starts
        .map(([x, y]) => `(${x},${y})`)
        .join(' ')}`,
    );
}

/** L-18 (LEVELS §0 sawtooth). */
function checkSawtooth(level: LevelData, push: Push): void {
  const expected = HARD_LEVELS.has(level.id) ? 'hard' : SUPERHARD_LEVELS.has(level.id) ? 'superhard' : null;
  if (expected && level.difficulty !== expected)
    push('L-18', 'difficulty_sawtooth', 'difficulty', `level ${level.id} should be ${expected}`, 'warn');
  if (!expected && (level.difficulty === 'hard' || level.difficulty === 'superhard'))
    push('L-18', 'difficulty_sawtooth', 'difficulty', `level ${level.id} should be easy or normal`, 'warn');
}

/** L-21 (K-21, OBSTACLES flag table). Debris has no flags in the schema; heavy debris is forbidden too. */
function checkFlagCombos(level: LevelData, push: Push): void {
  for (const { path, shape, isDebris, piece } of allPlaced(level)) {
    const heavy = shapeById(shape).heavy;
    if (isDebris) {
      if (heavy)
        push('L-21', 'flag_combo_forbidden', path, 'debris cannot be a heavy shape (debris ≤ 2 wide)');
      continue;
    }
    const flags = piece ? flagsOf(piece) : [];
    if (flags.includes('glass') && flags.includes('balloon'))
      push('L-21', 'flag_combo_forbidden', path, 'glass + balloon is forbidden');
    if (heavy) {
      const bad = flags.filter((f) => f === 'glass' || f === 'balloon' || f === 'mortar');
      if (bad.length > 0)
        push('L-21', 'flag_combo_forbidden', path, `heavy block cannot be ${bad.join(', ')}`);
    }
  }
}

/** L-24 (K-24). */
function checkElevatorRange(level: LevelData, push: Push): void {
  const el = level.build.elevator;
  if (!el) return;
  const [a, b] = el.range;
  if (!(a < b)) push('L-24', 'elevator_range', 'build.elevator', `range [${a},${b}] needs a < b`);
  if (el.start < a || el.start > b)
    push('L-24', 'elevator_range', 'build.elevator', `start ${el.start} outside [${a},${b}]`);
}

/** L-25 (K-23). */
function checkCarousel(level: LevelData, push: Push): void {
  const b = level.build;
  if (b.mode === 'carousel' && b.carouselEvery === undefined)
    push('L-25', 'carousel_every_missing', 'build.carouselEvery', 'carousel mode needs carouselEvery');
  if (b.mode === 'segments' && b.carouselEvery !== undefined)
    push(
      'L-25',
      'carousel_every_missing',
      'build.carouselEvery',
      'carouselEvery is unused in segments mode',
      'warn',
    );
}

/** L-26 (Y4): `wet` ⇔ `wetMoves`. */
function checkWet(level: LevelData, push: Push): void {
  level.yard.batches.forEach((b, bi) =>
    b.pieces.forEach((p, i) => {
      const wet = flagsOf(p).includes('wet');
      if (wet !== (p.wetMoves !== undefined))
        push(
          'L-26',
          'wet_moves_missing',
          `yard.batches[${bi}].pieces[${i}]`,
          wet ? 'wet block needs wetMoves' : 'wetMoves without the wet flag',
        );
    }),
  );
}
