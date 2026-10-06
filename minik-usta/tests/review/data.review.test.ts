/**
 * Independent rule review, rounds 1–3 (reviewer, not the author). Round 3 (last section) checks the K-05 box-height
 * rule the round-2 movement fix touched from the validator side (L-10 supply / `canReachSite` ↔ drag engine site nodes
 * for every shape × wall height × gap, LEVELS solution steps), runs TECH L-11 against an independent bottom-up
 * exact-cover oracle (K-11, K-12, K-16, K-34, K-05, Y5) on seeded random levels plus a K-34 order example and a W6
 * paint route, and adds debris (K-27 supply, K-31 colours, `.` cells), the K-32 worked examples, the K-02 39/48
 * boundary, debris shape locks and the LEVELS §0 tables / §2 block roles. Round 2 adds the section before it:
 * the whole-block material check that the round-1 fix touched (TECH L-10 / GDD K-27: cumulative per segment, carousel
 * total only, paint gate fit, heavy blocks, two gate colours, resolved `?` demand, an independent per-colour oracle on
 * mutated levels 1–5) and gaps of round 1 (K-45/9 GDD example, `?` rules, batch 0, L-17 carousel/filter rules, schema
 * limits of K-45/2, K-45/3, K-45/6, heavy debris).
 *
 * Round 1: level data rules against docs/GDD.md K-01, K-31, K-44,
 * K-45 (items 1–7 and 9 = TECH_DESIGN §8.3 checks L-01…L-18, L-21…L-26, incl. L-09 and L-17), the level files
 * levels/level_001…005.json against docs/LEVELS.md §0/§2 (the Markdown is read and parsed at test time) and the golden
 * replays against the LEVELS §2 solution text. Every expectation comes from the GDD / OBSTACLES / TECH / LEVELS text and
 * worked examples, not from the implementation. Only public APIs are used: core/shapes, core/coords,
 * core/level/{logic, compile, mechanics}, core/session (+ moves, movement, state helpers), the fixture builders and
 * tools/lib/levels (i18n keys, economy unlock levels).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { inGrid, isCraneCell, isSiteCell, isYardCell, onBoard } from '../../src/core/coords.ts';
import { SHAPES, shapeById } from '../../src/core/shapes.ts';
import {
  canReachSite,
  checkLevel,
  levelColorSet,
  materialShortfall,
  validateLevelJson,
} from '../../src/core/level/logic.ts';
import type { CheckId, Issue, LogicContext } from '../../src/core/level/logic.ts';
import { compile, loadLevel } from '../../src/core/level/compile.ts';
import type { CompiledLevel } from '../../src/core/level/compile.ts';
import { deriveMechanics } from '../../src/core/level/mechanics.ts';
import type { LevelInput, MechanicId } from '../../src/core/level/schema.ts';
import { GameSession } from '../../src/core/session.ts';
import { ArraySink } from '../../src/core/moves.ts';
import { FREE, railMode, tryBeginDrag } from '../../src/core/movement.ts';
import { createInitialState, pieceX, pieceY, pieceZone, queueIds } from '../../src/core/state.ts';
import { COLOR_CODES, SHAPE_KINDS, Zone } from '../../src/core/types.ts';
import type { ColorCode, GameEvent, Move, PieceId, ShapeId, ShapeKind } from '../../src/core/types.ts';
import { level, levelJson } from '../fixtures/builders.ts';
import type { LevelSpec, PieceSpec } from '../fixtures/builders.ts';
import { loadBoosterUnlock, loadI18nKeys } from '../../tools/lib/levels.ts';

// --- helpers -----------------------------------------------------------------------------------------------------------

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pad = (n: number): string => String(n).padStart(3, '0');

function readLevelJson(n: number): LevelInput {
  return JSON.parse(readFileSync(join(ROOT, 'levels', `level_${pad(n)}.json`), 'utf8')) as LevelInput;
}

const codes = (list: readonly Issue[]): string[] => [...new Set(list.map((i) => i.code))].sort();
const errorCodes = (list: readonly Issue[]): string[] => codes(list.filter((i) => i.severity === 'error'));

/** Logic checks `only` on a schema-valid builder level. */
function run(spec: LevelSpec, only: readonly CheckId[], ctx: LogicContext = {}): Issue[] {
  return checkLevel(level(spec), { ...ctx, only });
}
/** Schema + logic checks on raw JSON. */
function runJson(json: unknown, only?: readonly CheckId[], ctx: LogicContext = {}): Issue[] {
  return validateLevelJson(json, only ? { ...ctx, only } : ctx).issues;
}

function batchOf(json: LevelInput, k: number): LevelInput['yard']['batches'][number] {
  const b = json.yard.batches[k];
  if (!b) throw new Error(`no batch ${k}`);
  return b;
}

type Step = NonNullable<LevelInput['tutorial']>[number];
function withTutorial(n: number, steps: readonly Step[]): LevelInput {
  return { ...readLevelJson(n), tutorial: [...steps] };
}
const soft = (highlight: string[], done: Step['done'], extra: Partial<Step> = {}): Step => ({
  step: 1,
  mode: 'soft',
  highlight,
  textKey: 'tut.l1.lift',
  done,
  ...extra,
});

/** B1 W bricks on the first `n` yard cells (row-major from (0,0)), skipping `skip`. */
function bricks(n: number, skip: readonly string[] = []): PieceSpec[] {
  const out: PieceSpec[] = [];
  for (let y = 0; y < 8 && out.length < n; y++)
    for (let x = 0; x < 6 && out.length < n; x++)
      if (!skip.includes(`${x},${y}`)) out.push(['B1_0', 'W', x, y]);
  return out;
}

const cellKey = (x: number, y: number): string => `${x},${y}`;
function cellsOf(shape: ShapeId, x: number, y: number): string[] {
  return shapeById(shape)
    .cells.map((c) => cellKey(x + c.x, y + c.y))
    .sort();
}

// --- LEVELS.md parser (docs/LEVELS.md §2 blockouts) -------------------------------------------------------------------

const LEVELS_MD = readFileSync(join(ROOT, 'docs', 'LEVELS.md'), 'utf8');

interface DocPiece {
  readonly letter: string;
  readonly shape: ShapeId;
  readonly color: ColorCode;
  readonly x: number;
  readonly y: number;
}
interface DocLevel {
  readonly n: number;
  readonly fields: ReadonlyMap<string, string>;
  readonly pieces: readonly DocPiece[];
  /** y → the 9 blockout tokens: x 0–5, wall, x 6–7. */
  readonly blockout: ReadonlyMap<number, readonly string[]>;
  readonly trucks: readonly {
    readonly batch: number;
    readonly pieces: readonly [ShapeId, ColorCode, number][];
  }[];
  /** Numbered items, continuation lines joined with single spaces. */
  readonly solution: readonly string[];
  readonly tutorial: readonly string[];
}

function numberedList(lines: readonly string[], header: string): string[] {
  let i = lines.findIndex((l) => l.startsWith(header));
  if (i < 0) return [];
  i++;
  while (i < lines.length && (lines[i] ?? '').trim() === '') i++;
  const items: string[] = [];
  for (; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.trim() === '') break;
    if (/^\d+\. /.test(line)) items.push(line.trim());
    else if (items.length > 0) items[items.length - 1] = `${items[items.length - 1] ?? ''} ${line.trim()}`;
    else break;
  }
  return items.map((s) => s.replace(/\s+/g, ' '));
}

function docLevel(n: number): DocLevel {
  const start = LEVELS_MD.indexOf(`### Bölüm ${n} — `);
  if (start < 0) throw new Error(`LEVELS.md has no "### Bölüm ${n} — " section`);
  const end = LEVELS_MD.indexOf('\n### ', start + 1);
  const lines = LEVELS_MD.slice(start, end < 0 ? undefined : end).split('\n');
  const fields = new Map<string, string>();
  const pieces: DocPiece[] = [];
  const blockout = new Map<number, string[]>();
  const trucks: { batch: number; pieces: [ShapeId, ColorCode, number][] }[] = [];
  for (const line of lines) {
    const piece = /^\| `([^`]+)` \| `([A-Z][0-9]_\d+)` \| ([A-Z]) \| \((\d+),(\d+)\) \|/.exec(line);
    if (piece) {
      pieces.push({
        letter: piece[1] ?? '',
        shape: piece[2] as ShapeId,
        color: piece[3] as ColorCode,
        x: Number(piece[4]),
        y: Number(piece[5]),
      });
      continue;
    }
    const field = /^\| ([^`|][^|]*?) \| (.*) \|$/.exec(line);
    if (field && field[1] !== 'Alan' && !(field[1] ?? '').startsWith('---'))
      fields.set(field[1] ?? '', field[2] ?? '');
    const row = /^\s+y=(\d):\s+(.*)$/.exec(line);
    if (row) blockout.set(Number(row[1]), (row[2] ?? '').trim().split(/\s+/).slice(0, 9));
    const truck = /^- Parti (\d+) \([^)]*\): (.*)$/.exec(line);
    if (truck)
      trucks.push({
        batch: Number(truck[1]),
        pieces: [...(truck[2] ?? '').matchAll(/`([A-Z][0-9]_\d+)` ([A-Z]) x=(\d)/g)].map(
          (m) => [m[1] as ShapeId, m[2] as ColorCode, Number(m[3])] as [ShapeId, ColorCode, number],
        ),
      });
  }
  return {
    n,
    fields,
    pieces,
    blockout,
    trucks,
    solution: numberedList(lines, 'Çözüm (hamle hamle'),
    tutorial: numberedList(lines, 'Öğretici adımları (`tutorial[]`)'),
  };
}

function field(doc: DocLevel, name: string): string {
  const v = doc.fields.get(name);
  if (v === undefined) throw new Error(`LEVELS Bölüm ${doc.n}: no "${name}" row`);
  return v;
}
function match(re: RegExp, text: string, what: string): RegExpExecArray {
  const m = re.exec(text);
  if (!m) throw new Error(`${what}: "${text}" does not match ${re}`);
  return m;
}

const DIFFICULTY: Readonly<Record<string, LevelInput['difficulty']>> = {
  Kolay: 'easy',
  Normal: 'normal',
  Zor: 'hard',
  'Çok Zor': 'superhard',
};
/** LEVELS §0 "Hamle bütçesi": Kolay +8, Normal +5, Zor +3, Çok Zor +2. */
const BUFFER: Readonly<Record<LevelInput['difficulty'], number>> = {
  easy: 8,
  normal: 5,
  hard: 3,
  superhard: 2,
};

const LEVEL_IDS = [1, 2, 3, 4, 5] as const;

// =====================================================================================================================
// K-01 board, K-44 shapes
// =====================================================================================================================

describe('review K-01 board and K-44 shapes', () => {
  it('K-01 GDD example: D2_0 anchored at (3,8) is (3,8),(3,9); anchored at (3,9) it reaches (3,10), which does not exist', () => {
    expect(cellsOf('D2_0', 3, 8)).toEqual(['3,8', '3,9']);
    const ok = shapeById('D2_0').cells.map((c) => [3 + c.x, 8 + c.y] as const);
    expect(ok.every(([x, y]) => inGrid(x, y))).toBe(true);
    const bad = shapeById('D2_0').cells.map((c) => [3 + c.x, 9 + c.y] as const);
    expect(bad).toContainEqual([3, 10]);
    expect(bad.every(([x, y]) => inGrid(x, y))).toBe(false);
  });

  it('K-01 the 8 × 8 board plus crane rows y 8–9; nothing at x < 0, x > 7 or y > 9', () => {
    for (const [x, y, grid, board, crane] of [
      [0, 0, true, true, false],
      [7, 7, true, true, false],
      [7, 8, true, false, true],
      [0, 9, true, false, true],
      [3, 10, false, false, false],
      [-1, 0, false, false, false],
      [8, 0, false, false, false],
      [0, -1, false, false, false],
    ] as const) {
      expect([inGrid(x, y), onBoard(x, y), isCraneCell(x, y)], `(${x},${y})`).toEqual([grid, board, crane]);
    }
    // yard x 0–5 (K-02), site x 6–7 (K-03), both only on board rows
    expect([isYardCell(5, 7), isYardCell(6, 0), isYardCell(5, 8)]).toEqual([true, false, false]);
    expect([isSiteCell(6, 0), isSiteCell(7, 7), isSiteCell(5, 0), isSiteCell(6, 8)]).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it('K-44 GDD example: C3_90 cells (0,0)(0,1)(1,1), view "XX / X." (top row full, bottom row left only)', () => {
    const c = shapeById('C3_90');
    expect(c.cells.map((p) => cellKey(p.x, p.y)).sort()).toEqual(['0,0', '0,1', '1,1']);
    const view = [...c.rows]
      .reverse()
      .map((mask) => [0, 1].map((x) => ((mask >> x) & 1 ? 'X' : '.')).join(''));
    expect(view).toEqual(['XX', 'X.']);
  });

  it('K-44 every orientation is the clockwise 90° turn of BRIEF §5 0° cells, normalised to the bottom-left; heavy = w ≥ 3 or I5/Q9', () => {
    // BRIEF §5 table, typed here independently of src/core/shapes.ts.
    const BRIEF: Record<ShapeKind, [number, number][]> = {
      B1: [[0, 0]],
      D2: [
        [0, 0],
        [0, 1],
      ],
      I3: [
        [0, 0],
        [0, 1],
        [0, 2],
      ],
      I4: [
        [0, 0],
        [0, 1],
        [0, 2],
        [0, 3],
      ],
      O4: [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ],
      C3: [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
      L4: [
        [0, 0],
        [1, 0],
        [0, 1],
        [0, 2],
      ],
      J4: [
        [0, 0],
        [1, 0],
        [1, 1],
        [1, 2],
      ],
      T4: [
        [0, 0],
        [0, 1],
        [0, 2],
        [1, 1],
      ],
      S4: [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 2],
      ],
      Z4: [
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 2],
      ],
      I5: [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
        [4, 0],
      ],
      Q9: [0, 1, 2].flatMap((y) => [0, 1, 2].map((x) => [x, y] as [number, number])),
    };
    const norm = (cells: [number, number][]): string[] => {
      const mx = Math.min(...cells.map((c) => c[0]));
      const my = Math.min(...cells.map((c) => c[1]));
      return cells.map(([x, y]) => cellKey(x - mx, y - my)).sort();
    };
    const cw = (cells: [number, number][]): [number, number][] => cells.map(([x, y]) => [y, -x]);
    for (const kind of SHAPE_KINDS) {
      let cells = BRIEF[kind];
      const seen: string[] = [];
      for (const deg of [0, 90, 180, 270] as const) {
        if (deg > 0) cells = cw(cells);
        const id = `${kind}_${deg}` as ShapeId;
        const s = shapeById(id);
        const mine = norm(cells);
        expect(s.cells.map((c) => cellKey(c.x, c.y)).sort(), id).toEqual(mine);
        const w = Math.max(...mine.map((k) => Number(k.split(',')[0]))) + 1;
        expect([s.w, s.heavy], `${id} width / heavy`).toEqual([w, w >= 3 || kind === 'I5' || kind === 'Q9']);
        // canonical = first orientation (0, 90, 180, 270) with the same cell set
        const firstSame = seen.indexOf(mine.join(';'));
        expect(s.canonical, `${id} canonical`).toBe(
          firstSame < 0 ? id : (`${kind}_${[0, 90, 180, 270][firstSame] ?? 0}` as ShapeId),
        );
        seen.push(mine.join(';'));
      }
    }
    expect(SHAPES.length).toBe(52);
  });

  it('K-44 symmetric aliases are accepted in level data and compile to the canonical shape (O4_90, D2_180, D2_270, I3_270, Q9_270)', () => {
    const spec: LevelSpec = {
      id: 11,
      plan: ['WW'],
      pieces: [
        ['O4_90', 'W', 0, 0],
        ['D2_180', 'W', 2, 0],
        ['D2_270', 'W', 3, 0],
        ['I3_270', 'W', 0, 2],
        ['Q9_270', 'W', 3, 1],
      ],
    };
    expect(run(spec, ['L-02', 'L-04', 'L-21'])).toEqual([]);
    const lvl = compile(level(spec));
    const expected: [ShapeId, ShapeId][] = [
      ['O4_90', 'O4_0'],
      ['D2_180', 'D2_0'],
      ['D2_270', 'D2_90'],
      ['I3_270', 'I3_90'],
      ['Q9_270', 'Q9_0'],
    ];
    expected.forEach(([data, canon], i) => {
      const p = lvl.pieces[i];
      expect([p?.dataShape, p?.shapeIndex], data).toEqual([data, shapeById(canon).index]);
    });
  });
});

// =====================================================================================================================
// K-44 / K-45/5 shape lock, forbidden shapes, flag combinations
// =====================================================================================================================

describe('review K-44 K-45/5 shapes and flags in level data', () => {
  it('K-44 GDD example: I3_0 in level 5 is shape_locked (also when it only arrives by truck)', () => {
    const json = readLevelJson(5);
    batchOf(json, 1).pieces.push({ shape: 'I3_0', color: 'R', x: 0, y: 8 });
    const hit = runJson(json).filter((i) => i.code === 'shape_locked');
    expect(hit.map((i) => [i.rule, i.path])).toEqual([['K-45/5', 'yard.batches[1].pieces[4]']]);
  });

  it('K-44 kinds unlock by story chapter: I3 L4 J4 at 11 (not 10), T4 S4 Z4 at 21 (not 20), I4 at 31 (not 30)', () => {
    const vertical: [ShapeId[], number][] = [
      [['I3_0', 'L4_0', 'J4_0'], 11],
      [['T4_0', 'S4_0', 'Z4_0'], 21],
      [['I4_0'], 31],
    ];
    for (const [ids, first] of vertical) {
      const pieces: PieceSpec[] = ids.map((id, i) => [id, 'W', i * 2, 0]);
      expect(
        codes(run({ id: first - 1, plan: ['WW'], pieces }, ['L-04'])),
        `${ids.join()} @${first - 1}`,
      ).toEqual(['shape_locked']);
      expect(run({ id: first - 1, plan: ['WW'], pieces }, ['L-04']).length).toBe(ids.length);
      expect(run({ id: first, plan: ['WW'], pieces }, ['L-04']), `${ids.join()} @${first}`).toEqual([]);
    }
  });

  it('K-44 heavy shapes only from level 8: I5_0/Q9_0 locked at 7, valid at 8 and 41; L4_90 usable once L4 is unlocked (11); I3_90 at 9 still locked (kind)', () => {
    const heavy: PieceSpec[] = [
      ['I5_0', 'W', 0, 0],
      ['Q9_0', 'W', 0, 1],
    ];
    expect(run({ id: 7, plan: ['WW'], pieces: heavy }, ['L-04']).map((i) => i.code)).toEqual([
      'shape_locked',
      'shape_locked',
    ]);
    expect(run({ id: 8, plan: ['WW'], pieces: heavy }, ['L-04'])).toEqual([]);
    expect(run({ id: 41, plan: ['WW'], pieces: heavy }, ['L-04'])).toEqual([]);
    expect(run({ id: 11, plan: ['WW'], pieces: [['L4_90', 'W', 0, 0]] }, ['L-04'])).toEqual([]);
    expect(codes(run({ id: 9, plan: ['WW'], pieces: [['I3_90', 'W', 0, 0]] }, ['L-04']))).toEqual([
      'shape_locked',
    ]);
  });

  it('K-44 I5_90 and I5_270 are forbidden in level data at every level; I5_0 and I5_180 are not', () => {
    for (const id of [8, 41]) {
      const issues = run(
        {
          id,
          plan: ['WW'],
          pieces: [
            ['I5_0', 'W', 0, 0],
            ['I5_180', 'W', 0, 1],
            ['I5_90', 'W', 5, 2],
            ['I5_270', 'W', 4, 2],
          ],
        },
        ['L-04'],
      );
      expect(
        issues.map((i) => [i.code, i.path]),
        `level ${id}`,
      ).toEqual([
        ['shape_forbidden', 'yard.batches[0].pieces[2]'],
        ['shape_forbidden', 'yard.batches[0].pieces[3]'],
      ]);
    }
  });

  it('K-44 I5 and Q9 only in the yard: a truck Q9 (delivered to the yard) is valid, Q9/I5 debris is shape_forbidden', () => {
    const truck: LevelSpec = {
      id: 8,
      plan: [['WW'], ['WW']],
      pieces: [['D2_90', 'W', 0, 0]],
      batches: [{ forSegment: 1, pieces: [['Q9_0', 'W', 3, 8]] }],
    };
    expect(run(truck, ['L-04'])).toEqual([]);
    const debris = run(
      {
        id: 41,
        plan: ['WW', 'WW', 'WW'],
        pieces: [['D2_90', 'W', 0, 0]],
        debris: [
          ['Q9_0', 'G', 6, 0],
          ['I5_0', 'G', 6, 0],
        ],
      },
      ['L-04'],
    );
    expect(debris.map((i) => [i.code, i.path])).toEqual([
      ['shape_forbidden', 'build.debris[0]'],
      ['shape_forbidden', 'build.debris[1]'],
    ]);
  });

  it('K-45/5 flag combinations follow the OBSTACLES table (✓ chained/wet on heavy, glass+mortar …; ✗ glass+balloon, heavy glass/balloon/mortar)', () => {
    const allowed: PieceSpec[] = [
      ['D2_90', 'W', 0, 0, ['glass', 'mortar']],
      ['D2_90', 'W', 2, 0, ['glass', 'chained']],
      ['D2_90', 'W', 4, 0, ['glass', 'wet'], 2],
      ['D2_90', 'W', 0, 1, ['balloon', 'mortar']],
      ['D2_90', 'W', 2, 1, ['balloon', 'chained']],
      ['D2_90', 'W', 4, 1, ['mortar', 'chained']],
      ['D2_90', 'W', 0, 2, ['chained', 'wet'], 3],
      ['I3_90', 'W', 0, 3, ['chained']],
      ['I3_90', 'W', 3, 3, ['wet'], 1],
    ];
    expect(run({ id: 41, plan: ['WW'], pieces: allowed }, ['L-21', 'L-26'])).toEqual([]);
    const forbidden: PieceSpec[] = [
      ['D2_90', 'W', 0, 0, ['glass', 'balloon']],
      ['I3_90', 'W', 0, 1, ['glass']],
      ['I3_90', 'W', 0, 2, ['balloon']],
      ['Q9_0', 'W', 0, 3, ['mortar']],
    ];
    // debris carries no flags at all (K-21 table: debris × every flag ✗) — the schema refuses the field
    const debrisJson = levelJson({
      id: 41,
      plan: ['WW'],
      pieces: [['B1_0', 'W', 0, 0]],
      debris: [['B1_0', 'R', 6, 0]],
    });
    const d0 = debrisJson.build.debris?.[0];
    if (d0) Object.assign(d0, { flags: ['glass'] });
    expect(codes(runJson(debrisJson))).toEqual(['schema_invalid']);
    const issues = run({ id: 41, plan: ['WW'], pieces: forbidden }, ['L-21']);
    expect(issues.map((i) => [i.code, i.rule, i.path])).toEqual(
      [0, 1, 2, 3].map((k) => ['flag_combo_forbidden', 'K-45/5', `yard.batches[0].pieces[${k}]`]),
    );
  });
});

// =====================================================================================================================
// K-31 colour set (L-06, L-07)
// =====================================================================================================================

describe('review K-31 colour set and unlocks', () => {
  it('K-31 GDD example: level 12 (story chapter 2) with W, Y, O, C, R in the plan is 5 > 4 colours → too_many_colors', () => {
    const issues = run({ id: 12, plan: ['WY', 'OC', 'RR'], pieces: [['D2_90', 'R', 0, 0]] }, [
      'L-06',
      'L-07',
    ]);
    expect(issues.map((i) => [i.code, i.rule, i.severity])).toEqual([['too_many_colors', 'K-45/4', 'error']]);
  });

  it('K-31 GDD example on level_005.json: G/R/W is valid; one Y decoy in the yard makes 4 colours → too_many_colors although the plan keeps 3', () => {
    const json = readLevelJson(5);
    expect(runJson(json)).toEqual([]);
    batchOf(json, 0).pieces.push({ shape: 'B1_0', color: 'Y', x: 2, y: 7 });
    const issues = runJson(json);
    expect(codes(issues)).toEqual(['too_many_colors']);
  });

  it('K-31 GDD example: in level 22 the paint gate colour P joins the set (B, P, Y, R → 4 ≤ 5, nothing locked)', () => {
    const spec: LevelSpec = {
      id: 22,
      wall: { height: 6, gaps: [{ type: 'paint', y: 1, size: 2, color: 'P' }] },
      plan: ['BB', 'YR'],
      pieces: [
        ['D2_90', 'B', 0, 0],
        ['B1_0', 'Y', 2, 0],
        ['B1_0', 'R', 3, 0],
      ],
    };
    expect(levelColorSet(level(spec))).toEqual(['Y', 'R', 'B', 'P']);
    expect(run(spec, ['L-06', 'L-07'])).toEqual([]);
  });

  it('K-31 colours unlock at their first level (W,Y 1; G 2; R 4; O,C 11; B,P 21) for every source: decoy, truck block, debris, paint gate', () => {
    const lockedAt = (spec: LevelSpec): string[] => run(spec, ['L-07']).map((i) => i.code);
    // G decoy in level 1, fine in level 2
    const gDecoy = (id: number): LevelSpec => ({
      id,
      plan: ['WW', 'YY'],
      pieces: [
        ['D2_90', 'W', 0, 0],
        ['D2_90', 'Y', 2, 0],
        ['B1_0', 'G', 4, 0],
      ],
    });
    expect(lockedAt(gDecoy(1))).toEqual(['color_locked']);
    expect(lockedAt(gDecoy(2))).toEqual([]);
    // R only in a truck batch: locked in level 3, fine in level 4
    const rTruck = (id: number): LevelSpec => ({
      id,
      plan: [['WW'], ['YY']],
      pieces: [['D2_90', 'W', 0, 0]],
      batches: [
        {
          forSegment: 1,
          pieces: [
            ['D2_90', 'Y', 0, 8],
            ['B1_0', 'R', 2, 8],
          ],
        },
      ],
    });
    expect(lockedAt(rTruck(3))).toEqual(['color_locked']);
    expect(lockedAt(rTruck(4))).toEqual([]);
    // C only as debris: locked in level 10, fine in 11
    const cDebris = (id: number): LevelSpec => ({
      id,
      plan: ['WW', 'YY'],
      pieces: [
        ['D2_90', 'W', 0, 0],
        ['D2_90', 'Y', 2, 0],
      ],
      debris: [['B1_0', 'C', 6, 0]],
    });
    expect(lockedAt(cDebris(10))).toEqual(['color_locked']);
    expect(lockedAt(cDebris(11))).toEqual([]);
    // B only as a paint gate colour: locked in level 20, fine in 21
    const bGate = (id: number): LevelSpec => ({
      id,
      wall: { height: 6, gaps: [{ type: 'paint', y: 1, size: 2, color: 'B' }] },
      plan: ['WW'],
      pieces: [['D2_90', 'W', 0, 0]],
    });
    expect(lockedAt(bGate(20))).toEqual(['color_locked']);
    expect(lockedAt(bGate(21))).toEqual([]);
  });

  it('K-31 colour limit per story chapter: 4 colours fail in level 10 and pass in 11; 6 colours fail in 21 and 41, 5 pass', () => {
    const tooMany = (id: number, plan: string[]): string[] =>
      run({ id, plan, pieces: [['B1_0', 'W', 0, 0]] }, ['L-06']).map((i) => i.code);
    expect(tooMany(10, ['WY', 'GR'])).toEqual(['too_many_colors']);
    expect(tooMany(11, ['WY', 'GR'])).toEqual([]);
    expect(tooMany(21, ['WY', 'GR', 'OO'])).toEqual([]);
    expect(tooMany(21, ['WY', 'GR', 'OC'])).toEqual(['too_many_colors']);
    expect(tooMany(41, ['WY', 'GR', 'OC'])).toEqual(['too_many_colors']);
  });

  it('K-31 resolved `?` colours count, `.` is not a colour: repeat `?` takes the colour p rows below', () => {
    const spec: LevelSpec = {
      id: 27,
      plan: ['?.', 'RW', 'YW'],
      hidden: [{ kind: 'repeat', period: 2 }],
      pieces: [['B1_0', 'W', 0, 0]],
    };
    // (6,2) = `?` → (6,0) = Y (period 2); the set is W, Y, R from the plan and W from the block.
    expect(levelColorSet(level(spec))).toEqual(['W', 'Y', 'R']);
    const seg = compile(level(spec)).segments[0];
    expect(seg?.planColors[2 * 2 + 0]).toBe(COLOR_CODES.indexOf('Y'));
  });
});

// =====================================================================================================================
// K-45 items 1–7: L-01 … L-15, L-23
// =====================================================================================================================

describe('review K-45/1 identity, seed', () => {
  it('K-45/1 id 1–50 and chapter = ceil(id/10) at the boundaries (10 → 1, 11 → 2, 41 → 5, 50 → 5, 51 out of range)', () => {
    const l01 = (id: number, chapter: number): string[] =>
      run({ id, chapter, plan: ['WW'], pieces: [['B1_0', 'W', 0, 0]] }, ['L-01']).map((i) => i.code);
    expect(l01(10, 1)).toEqual([]);
    expect(l01(10, 2)).toEqual(['chapter_mismatch']);
    expect(l01(11, 2)).toEqual([]);
    expect(l01(11, 1)).toEqual(['chapter_mismatch']);
    expect(l01(41, 5)).toEqual([]);
    expect(l01(50, 5)).toEqual([]);
    expect(l01(51, 5)).toContain('id_mismatch');
  });

  it('K-45/1 seed missing → id × 1000 + id (GDD example 4004), written seed kept; level files 1–5 use the same values', () => {
    const json = readLevelJson(4);
    delete json.seed;
    const loaded = loadLevel(json);
    expect(loaded.ok && loaded.level.seed).toBe(4004);
    expect(compile(level({ id: 37, plan: ['WW'], pieces: [['B1_0', 'W', 0, 0]] })).seed).toBe(37037);
    expect(compile(level({ id: 37, seed: 0, plan: ['WW'], pieces: [['B1_0', 'W', 0, 0]] })).seed).toBe(0);
    for (const n of LEVEL_IDS) expect(readLevelJson(n).seed ?? n * 1000 + n, `level ${n}`).toBe(n * 1000 + n);
  });
});

describe('review K-45/2 yard fill and overlap', () => {
  it('K-45/2 K-02 GDD example: 46/48 is valid, 38/48 is yard_fill_low', () => {
    const fill = (n: number): string[] =>
      run({ id: 1, plan: ['WW'], pieces: bricks(n) }, ['L-03']).map((i) => i.code);
    expect(fill(46)).toEqual([]);
    expect(fill(48)).toEqual([]);
    expect(fill(38)).toEqual(['yard_fill_low']);
  });

  it('K-45/2 crates and cement bags fill yard cells, screws and keys do not', () => {
    const obstacles: LevelInput['obstacles'] = [
      { type: 'crate', x: 1, y: 6, hp: 1 },
      { type: 'cement_bag', x: 2, y: 6 },
    ];
    // 37 bricks + crate + bag = 39 → valid
    expect(run({ id: 18, plan: ['WW'], pieces: bricks(37), obstacles }, ['L-03'])).toEqual([]);
    // 38 bricks + screw + key (both under bricks) = 38 → low
    const hidden: LevelInput['obstacles'] = [
      { type: 'screw', x: 0, y: 0 },
      { type: 'key', x: 1, y: 0, id: 'a' },
    ];
    expect(
      run({ id: 26, plan: ['WW'], pieces: bricks(38), obstacles: hidden }, ['L-03']).map((i) => i.code),
    ).toEqual(['yard_fill_low']);
  });

  it('K-45/2 batch-0 cells must be x ≤ 5 and y ≤ 7: a block reaching the crane rows or the site is out_of_yard', () => {
    const spec: LevelSpec = {
      id: 1,
      plan: ['WW'],
      pieces: [
        ['D2_0', 'W', 0, 7],
        ['D2_90', 'W', 5, 0],
        ['B1_0', 'W', 6, 0],
        ['D2_0', 'W', 5, 6],
      ],
    };
    expect(run(spec, ['L-02']).map((i) => [i.code, i.path])).toEqual([
      ['out_of_yard', 'yard.batches[0].pieces[0]'],
      ['out_of_yard', 'yard.batches[0].pieces[1]'],
      ['out_of_yard', 'yard.batches[0].pieces[2]'],
    ]);
  });

  it('K-45/2 blocks, crates and bags must not overlap; a screw or key under a crate is not an overlap', () => {
    const overlaps = run(
      {
        id: 18,
        plan: ['WW'],
        pieces: [['O4_0', 'W', 0, 0]],
        obstacles: [
          { type: 'crate', x: 1, y: 1, hp: 2 },
          { type: 'crate', x: 3, y: 3, hp: 1 },
          { type: 'cement_bag', x: 3, y: 3 },
        ],
      },
      ['L-02'],
    );
    expect(overlaps.map((i) => [i.code, i.path])).toEqual([
      ['overlap', 'obstacles[0]'],
      ['overlap', 'obstacles[2]'],
    ]);
    const hidden = run(
      {
        id: 26,
        plan: ['WW'],
        pieces: [['B1_0', 'W', 0, 0]],
        obstacles: [
          { type: 'crate', x: 3, y: 3, hp: 1 },
          { type: 'screw', x: 3, y: 3 },
          { type: 'key', x: 0, y: 0, id: 'a' },
        ],
      },
      ['L-02', 'L-14', 'L-23'],
    );
    expect(hidden).toEqual([]);
  });
});

describe('review K-45/3 wall and gaps (L-09)', () => {
  it('K-45/3 K-04 GDD examples: height 6 gap y=2 size 2 valid, y=4 size 2 gap_touches_top; level 9 gap y=3 size 1 valid, y=5 touches top', () => {
    const wall = (height: number, y: number, size: number): string[] =>
      run(
        {
          id: 9,
          wall: { height, gaps: [{ type: 'static', y, size }] },
          plan: ['WW'],
          pieces: [['B1_0', 'W', 0, 0]],
        },
        ['L-09'],
      ).map((i) => i.code);
    expect(wall(6, 2, 2)).toEqual([]);
    expect(wall(6, 4, 2)).toEqual(['gap_touches_top']);
    expect(wall(6, 3, 1)).toEqual([]);
    expect(wall(6, 5, 1)).toEqual(['gap_touches_top']);
    // boundary: y + size = height − 1 is valid (level 4: height 6, y 3, size 2)
    expect(wall(6, 3, 2)).toEqual([]);
    // a "gap" above the wall top is no gap
    expect(wall(3, 4, 1)).toEqual(['gap_touches_top']);
    expect(wall(0, 0, 1)).toEqual(['gap_touches_top']);
  });

  it('K-45/3 the K-04 top rule holds for every gap type (shutter, paint, locked)', () => {
    const gaps: LevelInput['wall']['gaps'] = [
      { type: 'shutter', y: 0, size: 2, period: 2 },
      { type: 'paint', y: 2, size: 2, color: 'W' },
      { type: 'locked', y: 4, size: 1, keyId: 'a' },
    ];
    const issues = run(
      {
        id: 30,
        wall: { height: 5, gaps },
        plan: ['WW'],
        pieces: [['B1_0', 'W', 0, 0]],
        obstacles: [{ type: 'key', x: 0, y: 0, id: 'a' }],
      },
      ['L-09'],
    );
    // height 5: y + size ≤ 4 → shutter 2 ok, paint 4 ok, locked 5 > 4
    expect(issues.map((i) => [i.code, i.path])).toEqual([['gap_touches_top', 'wall.gaps[2]']]);
  });

  it('K-45/3 OBSTACLES W5 examples: range [3,3] y 3 → slider_range; height 8 slider [1,3] size 2 + static y 4 size 1 → gap_overlap; static y 5 → no overlap', () => {
    const slider = (height: number, gaps: LevelInput['wall']['gaps']): (string | undefined)[][] =>
      run({ id: 16, wall: { height, gaps }, plan: ['WW'], pieces: [['B1_0', 'W', 0, 0]] }, ['L-09']).map(
        (i) => [i.code, i.path],
      );
    expect(slider(8, [{ type: 'slider', y: 3, size: 1, range: [3, 3], dir: 1 }])).toEqual([
      ['slider_range', 'wall.gaps[0]'],
    ]);
    expect(
      slider(8, [
        { type: 'slider', y: 1, size: 2, range: [1, 3] },
        { type: 'static', y: 4, size: 1 },
      ]),
    ).toEqual([['gap_overlap', 'wall.gaps[1]']]);
    expect(
      slider(8, [
        { type: 'slider', y: 1, size: 2, range: [1, 3] },
        { type: 'static', y: 5, size: 1 },
      ]),
    ).toEqual([]);
  });

  it('K-45/3 slider: start y inside [a, b] and b + size ≤ height − 1; two sliders overlap over their whole ranges', () => {
    const codesOf = (height: number, gaps: LevelInput['wall']['gaps']): string[] =>
      run({ id: 16, wall: { height, gaps }, plan: ['WW'], pieces: [['B1_0', 'W', 0, 0]] }, ['L-09']).map(
        (i) => i.code,
      );
    expect(codesOf(6, [{ type: 'slider', y: 0, size: 1, range: [1, 3] }])).toEqual(['slider_range']);
    expect(codesOf(6, [{ type: 'slider', y: 4, size: 1, range: [1, 3] }])).toEqual(['slider_range']);
    expect(codesOf(6, [{ type: 'slider', y: 1, size: 2, range: [1, 3] }])).toEqual([]); // 3 + 2 = 5 ≤ 5
    expect(codesOf(6, [{ type: 'slider', y: 1, size: 2, range: [1, 4] }])).toEqual(['slider_range']); // 6 > 5
    // OBSTACLES W5: the range may start at row 0 (0 ≤ a)
    expect(codesOf(6, [{ type: 'slider', y: 0, size: 1, range: [0, 2] }])).toEqual([]);
    // two sliders: rows 0–1 and 2–3 do not overlap; rows 0–2 and 2–3 do
    expect(
      codesOf(8, [
        { type: 'slider', y: 0, size: 1, range: [0, 1] },
        { type: 'slider', y: 3, size: 1, range: [2, 3] },
      ]),
    ).toEqual([]);
    expect(
      codesOf(8, [
        { type: 'slider', y: 0, size: 1, range: [0, 2] },
        { type: 'slider', y: 3, size: 1, range: [2, 3] },
      ]),
    ).toEqual(['gap_overlap']);
    // static gaps on adjacent rows touch but do not overlap
    expect(
      codesOf(8, [
        { type: 'static', y: 1, size: 2 },
        { type: 'static', y: 3, size: 2 },
      ]),
    ).toEqual([]);
    expect(
      codesOf(8, [
        { type: 'static', y: 1, size: 2 },
        { type: 'static', y: 2, size: 2 },
      ]),
    ).toEqual(['gap_overlap']);
  });

  it('K-45/3 shutter 0 ≤ phase < 2·period (W4: period 2 → phase 0…3; phase 2 starts closed and is valid)', () => {
    const phase = (period: number, ph: number): string[] =>
      run(
        {
          id: 13,
          wall: { height: 6, gaps: [{ type: 'shutter', y: 1, size: 2, period, phase: ph }] },
          plan: ['WW'],
          pieces: [['B1_0', 'W', 0, 0]],
        },
        ['L-09'],
      ).map((i) => i.code);
    expect(phase(2, 2)).toEqual([]);
    expect(phase(2, 3)).toEqual([]);
    expect(phase(2, 4)).toEqual(['shutter_phase']);
    expect(phase(1, 1)).toEqual([]);
    expect(phase(1, 2)).toEqual(['shutter_phase']);
  });

  it('K-45/3 a wind fan in a level without any 1-wide block is fan_unused (warn); a 1-wide truck block is enough', () => {
    const fan = (batches: LevelSpec['batches']): [string, string][] =>
      run(
        {
          id: 32,
          wall: { height: 4, fan: 'right' },
          plan: [['WW'], ['WW']],
          pieces: [['O4_0', 'W', 0, 0]],
          batches,
        },
        ['L-09'],
      ).map((i) => [i.code, i.severity]);
    expect(fan([])).toEqual([['fan_unused', 'warn']]);
    expect(fan([{ forSegment: 1, pieces: [['D2_0', 'W', 0, 8]] }])).toEqual([]);
    expect(fan([{ forSegment: 1, pieces: [['D2_90', 'W', 0, 8]] }])).toEqual([['fan_unused', 'warn']]);
  });

  it('K-45/3 a locked gate needs a key obstacle with the same id (a screw with that id or a key with another id is key_missing)', () => {
    const lockedWith = (obstacles: LevelInput['obstacles']): string[] =>
      run(
        {
          id: 26,
          wall: { height: 6, gaps: [{ type: 'locked', y: 1, size: 2, keyId: 'gold' }] },
          plan: ['WW'],
          pieces: [['O4_0', 'W', 0, 0]],
          obstacles,
        },
        ['L-09'],
      ).map((i) => i.code);
    expect(lockedWith([{ type: 'key', x: 0, y: 0, id: 'gold' }])).toEqual([]);
    expect(lockedWith([{ type: 'key', x: 0, y: 0, id: 'silver' }])).toEqual(['key_missing']);
    expect(lockedWith([{ type: 'screw', x: 0, y: 0, id: 'gold' }])).toEqual(['key_missing']);
    expect(lockedWith([])).toEqual(['key_missing']);
  });
});

describe('review K-45/4 plan rows, elevator, hidden cells (L-05, L-08)', () => {
  it('K-45/4 a plan row of 1 character is row_width (not schema_invalid); an unknown letter is schema_invalid', () => {
    const json = levelJson({ id: 1, plan: ['WW'], pieces: [['B1_0', 'W', 0, 0]] });
    const seg = json.build.segments[0];
    if (!seg) throw new Error('no segment');
    seg.rows = ['W', 'WW'];
    expect(runJson(json).map((i) => [i.code, i.rule, i.path])).toEqual([
      ['row_width', 'K-45/4', 'build.segments[0].rows[0]'],
    ]);
    seg.rows = ['WX'];
    expect(codes(runJson(json))).toEqual(['schema_invalid']);
  });

  it('K-45/4 K-24 elevator: h + b ≤ 8 for every segment (6 + 2 valid, 6 + 3 overflow on that segment only)', () => {
    const el = (b: number): Issue[] =>
      run(
        {
          id: 37,
          plan: [
            ['WW', 'WW', 'WW', 'WW', 'WW', 'WW'],
            ['WW', 'WW', 'WW', 'WW'],
          ],
          pieces: [['B1_0', 'W', 0, 0]],
          elevator: { range: [0, b], start: 0, dir: 1 },
        },
        ['L-05'],
      );
    expect(el(2)).toEqual([]);
    expect(el(3).map((i) => [i.code, i.path])).toEqual([['elevator_overflow', 'build.segments[0]']]);
  });

  it('K-45/4 K-32 repeat: no `?` in the bottom p rows; a `?` that resolves to `.` is invalid ("`.` gizli olamaz"); chains resolve', () => {
    const hidden = (rows: string[], period: number): string[] =>
      run({ id: 27, plan: rows, hidden: [{ kind: 'repeat', period }], pieces: [['B1_0', 'W', 0, 0]] }, [
        'L-08',
      ]).map((i) => i.code);
    expect(hidden(['??', '??', 'WY'], 1)).toEqual([]); // chain: r2 → r1 → r0
    expect(hidden(['??', 'WY'], 2)).toEqual(['hidden_invalid', 'hidden_invalid']); // r1 < p = 2
    expect(hidden(['?W', '.W'], 1)).toEqual(['hidden_invalid']); // resolves to `.`
    const chain = compile(
      level({
        id: 27,
        plan: ['??', '??', 'WY'],
        hidden: [{ kind: 'repeat', period: 1 }],
        pieces: [['B1_0', 'W', 0, 0]],
      }),
    ).segments[0];
    // local index sy * 2 + sx: (sx 0, sy 2) = W, (sx 1, sy 2) = Y
    expect([chain?.planColors[4], chain?.planColors[5]]).toEqual([
      COLOR_CODES.indexOf('W'),
      COLOR_CODES.indexOf('Y'),
    ]);
  });

  it('K-45/4 K-32 mirrorOf: earlier segment, same height, no `?` in the target; columns swap (c → 1 − c)', () => {
    const mirror = (plans: string[][], segment: number): string[] =>
      run(
        {
          id: 29,
          plan: plans,
          hidden: plans.map((_, i) =>
            i === plans.length - 1 ? { kind: 'mirrorOf' as const, segment } : undefined,
          ),
          pieces: [['B1_0', 'W', 0, 0]],
        },
        ['L-08'],
      ).map((i) => i.code);
    expect(mirror([['WY'], ['?R']], 0)).toEqual([]);
    expect(mirror([['WY'], ['?R']], 1)).not.toEqual([]); // itself
    expect(mirror([['WY', 'WW'], ['?R']], 0)).not.toEqual([]); // height 2 ≠ 1
    // target with `?`: segment 0 uses repeat, segment 1 mirrors it
    const withHiddenTarget = run(
      {
        id: 29,
        plan: [
          ['?Y', 'WY'],
          ['?R', 'RR'],
        ],
        hidden: [
          { kind: 'repeat', period: 1 },
          { kind: 'mirrorOf', segment: 0 },
        ],
        pieces: [['B1_0', 'W', 0, 0]],
      },
      ['L-08'],
    );
    expect(codes(withHiddenTarget)).toEqual(['hidden_invalid']);
    // mirrorOf a later segment
    const later = run(
      {
        id: 29,
        plan: [['?R'], ['WY']],
        hidden: [{ kind: 'mirrorOf', segment: 1 }, undefined],
        pieces: [['B1_0', 'W', 0, 0]],
      },
      ['L-08'],
    );
    expect(codes(later)).toEqual(['hidden_invalid']);
    // resolution: (c, r) takes (1 − c, r) of the target → seg 1 (6,0) `?` = seg 0 (7,0) = Y
    const seg1 = compile(
      level({
        id: 29,
        plan: [['WY'], ['?R']],
        hidden: [undefined, { kind: 'mirrorOf', segment: 0 }],
        pieces: [['B1_0', 'W', 0, 0]],
      }),
    ).segments[1];
    expect(seg1?.planColors[0]).toBe(COLOR_CODES.indexOf('Y'));
  });
});

describe('review K-45/6 hidden items and goals (L-14, L-15, L-23)', () => {
  it('K-45/6 hidden items start covered by a batch-0 block or a crate; a cement bag or a truck-only block does not cover', () => {
    const exposed = (spec: Partial<LevelSpec>): string[] =>
      run({ id: 26, plan: [['WW'], ['WW']], pieces: [['O4_0', 'W', 0, 0]], ...spec }, ['L-14']).map(
        (i) => i.code,
      );
    expect(exposed({ obstacles: [{ type: 'screw', x: 1, y: 1 }] })).toEqual([]);
    expect(
      exposed({
        obstacles: [
          { type: 'crate', x: 4, y: 4, hp: 3 },
          { type: 'key', x: 4, y: 4, id: 'a' },
        ],
      }),
    ).toEqual([]);
    expect(
      exposed({
        obstacles: [
          { type: 'cement_bag', x: 4, y: 4 },
          { type: 'screw', x: 4, y: 4 },
        ],
      }),
    ).toEqual(['hidden_item_exposed']);
    expect(
      exposed({
        batches: [{ forSegment: 1, pieces: [['O4_0', 'W', 4, 8]] }],
        obstacles: [{ type: 'screw', x: 4, y: 0 }],
      }),
    ).toEqual(['hidden_item_exposed']);
  });

  it('K-45/6 at most one hidden item per cell (screw + key → hidden_item_stacked)', () => {
    const issues = run(
      {
        id: 26,
        plan: ['WW'],
        pieces: [['O4_0', 'W', 0, 0]],
        obstacles: [
          { type: 'screw', x: 1, y: 1 },
          { type: 'key', x: 1, y: 1, id: 'a' },
          { type: 'screw', x: 0, y: 0 },
        ],
      },
      ['L-23'],
    );
    expect(issues.map((i) => [i.code, i.rule, i.path])).toEqual([
      ['hidden_item_stacked', 'K-45/6', 'obstacles[1]'],
    ]);
  });

  it('K-45/6 K-41 goals: exactly one build; clear/collect counts ≤ objects (chained truck blocks and debris count)', () => {
    const goals = (g: LevelSpec['goals'], extra: Partial<LevelSpec> = {}): string[] =>
      run(
        {
          id: 24,
          plan: [['WW'], ['WW']],
          pieces: [['O4_0', 'W', 0, 0]],
          obstacles: [{ type: 'screw', x: 0, y: 0 }],
          batches: [{ forSegment: 1, pieces: [['D2_90', 'W', 0, 8, ['chained']]] }],
          debris: [['B1_0', 'R', 6, 0]],
          goals: g,
          ...extra,
        },
        ['L-15'],
      ).map((i) => i.code);
    expect(goals([{ type: 'build' }, { type: 'collect', item: 'screw', count: 1 }])).toEqual([]);
    expect(goals([{ type: 'build' }, { type: 'collect', item: 'screw', count: 2 }])).toEqual([
      'goal_count_too_high',
    ]);
    expect(goals([{ type: 'build' }, { type: 'clear', target: 'chain', count: 1 }])).toEqual([]);
    expect(goals([{ type: 'build' }, { type: 'clear', target: 'chain', count: 2 }])).toEqual([
      'goal_count_too_high',
    ]);
    expect(goals([{ type: 'build' }, { type: 'clear', target: 'debris', count: 1 }])).toEqual([]);
    expect(goals([{ type: 'build' }, { type: 'clear', target: 'debris', count: 2 }])).toEqual([
      'goal_count_too_high',
    ]);
    expect(goals([{ type: 'build' }, { type: 'clear', target: 'crate', count: 1 }])).toEqual([
      'goal_count_too_high',
    ]);
    expect(goals([{ type: 'build' }, { type: 'build' }])).toEqual(['goal_build_missing']);
    expect(goals([{ type: 'collect', item: 'screw', count: 1 }])).toEqual(['goal_build_missing']);
  });
});

describe('review K-45/7 debris (L-13)', () => {
  const base = (debris: LevelSpec['debris'], plan: LevelSpec['plan'] = ['WW', 'WW', 'WW']): string[] =>
    run({ id: 17, plan, pieces: [['O4_0', 'W', 0, 0]], debris }, ['L-13']).map((i) => i.code);

  it('K-45/7 every debris cell lies in x 6–7: a horizontal D2 anchored at x 7 reaches x 8 → debris_misplaced', () => {
    expect(base([['D2_90', 'R', 6, 0]])).toEqual([]);
    expect(base([['D2_90', 'R', 7, 0]])).toEqual(['debris_misplaced']);
    expect(base([['D2_0', 'R', 7, 1]])).toEqual([]);
  });

  it('K-45/7 debris stays inside its own segment plan height (segment default 0); support is not required', () => {
    const plans = [['WW', 'WW', 'WW'], ['WW']];
    expect(base([['B1_0', 'R', 6, 2]], plans)).toEqual([]); // floating at row 2 of segment 0 (OBSTACLES S4)
    expect(base([['B1_0', 'R', 6, 2, 1]], plans)).toEqual(['debris_misplaced']); // segment 1 has 1 row
    expect(base([['B1_0', 'R', 6, 0, 1]], plans)).toEqual([]);
    expect(base([['D2_0', 'R', 6, 2]], plans)).toEqual(['debris_misplaced']); // rows 2–3, plan has 3 rows
    expect(base([['B1_0', 'R', 6, 0, 2]], plans)).toEqual(['debris_misplaced']); // no segment 2
  });

  it('K-45/7 debris pieces of one segment must not overlap; the same cell in two different segments is no overlap', () => {
    const plans = [['WW'], ['WW']];
    expect(
      base(
        [
          ['D2_90', 'R', 6, 0],
          ['B1_0', 'G', 7, 0],
        ],
        plans,
      ),
    ).toEqual(['debris_misplaced']);
    expect(
      base(
        [
          ['D2_90', 'R', 6, 0],
          ['B1_0', 'G', 7, 0, 1],
        ],
        plans,
      ),
    ).toEqual([]);
  });
});

// =====================================================================================================================
// K-27 material (L-10), K-25 batches (L-12)
// =====================================================================================================================

describe('review K-27 material and K-25 truck batches', () => {
  it('K-27 GDD example: segment 2 has 6 W cells, batch 1 brings O4 + D2_0 W (6) and a decoy C3 W → enough; O4 alone is material_short', () => {
    const spec = (truck: PieceSpec[]): LevelSpec => ({
      id: 5,
      plan: [['GG'], ['W.', 'WW', 'WW', 'W.']],
      pieces: [['D2_90', 'G', 0, 0]],
      batches: [{ forSegment: 1, pieces: truck }],
    });
    expect(
      run(
        spec([
          ['O4_0', 'W', 0, 8],
          ['D2_0', 'W', 2, 8],
          ['C3_0', 'W', 3, 8],
        ]),
        ['L-10'],
      ),
    ).toEqual([]);
    const short = run(spec([['O4_0', 'W', 0, 8]]), ['L-10']);
    expect(short.map((i) => [i.code, i.rule])).toEqual([['material_short', 'K-27']]);
  });

  it('K-27 heavy blocks are not supply ("ağır olmayan"): an I3_90 W cannot cover 2 W cells', () => {
    const supply = (pieces: PieceSpec[]): string[] =>
      run({ id: 11, plan: ['WW'], pieces }, ['L-10']).map((i) => i.code);
    expect(supply([['I3_90', 'W', 0, 0]])).toEqual(['material_short']);
    expect(
      supply([
        ['I3_90', 'W', 0, 0],
        ['D2_90', 'W', 0, 1],
      ]),
    ).toEqual([]);
  });

  it('K-27 only blocks that can reach the site are supply: I3_0 cannot cross a height-8 wall (K-05) unless a gap of size ≥ 3 exists', () => {
    const pieces: PieceSpec[] = [
      ['I3_0', 'W', 0, 0],
      ['I3_0', 'W', 1, 0],
    ];
    const plan = ['WW', 'WW', 'WW'];
    expect(run({ id: 11, wall: { height: 8 }, plan, pieces }, ['L-10']).map((i) => i.code)).toEqual([
      'material_short',
    ]);
    expect(
      run({ id: 11, wall: { height: 8, gaps: [{ type: 'static', y: 0, size: 3 }] }, plan, pieces }, ['L-10']),
    ).toEqual([]);
  });

  it('K-27 TECH L-10 "her blok bir kez": one O4 that is either Y or P (paint gate) cannot supply 2 Y + 2 P cells → material_short', () => {
    const spec: LevelSpec = {
      id: 22,
      wall: { height: 6, gaps: [{ type: 'paint', y: 1, size: 2, color: 'P' }] },
      plan: ['PP', 'YY'],
      pieces: [['O4_0', 'Y', 0, 0]],
    };
    // The level is refused anyway by the exact cover (L-11) …
    expect(codes(run(spec, ['L-11']))).toEqual(['untileable']);
    // … but the material condition counts every block once, for one colour: 4 cells as Y or as P, never 2 + 2.
    expect(codes(run(spec, ['L-10']))).toEqual(['material_short']);
    const block = { forSegment: 0, color: 'Y' as const, cells: 4, alts: ['P' as const] };
    expect(materialShortfall({ Y: 2, P: 2 }, [block]).length).toBeGreaterThan(0);
  });

  it('K-25 truck blocks: y written as 8, 0 ≤ x ≤ 6 − w, forSegment 1…S−1, dropColumns fit the block', () => {
    const truck = (
      pieces: PieceSpec[],
      extra: { forSegment?: number; dropColumns?: number[] } = {},
    ): string[] =>
      run(
        {
          id: 5,
          plan: [['WW'], ['WW'], ['WW']],
          pieces: [['D2_90', 'W', 0, 0]],
          batches: [
            {
              forSegment: extra.forSegment ?? 1,
              pieces,
              ...(extra.dropColumns ? { dropColumns: extra.dropColumns } : {}),
            },
          ],
        },
        ['L-12'],
      ).map((i) => i.code);
    expect(truck([['O4_0', 'W', 4, 8]])).toEqual([]);
    expect(truck([['O4_0', 'W', 5, 8]])).toEqual(['batch_invalid']);
    expect(truck([['B1_0', 'W', 5, 8]])).toEqual([]);
    expect(truck([['B1_0', 'W', 6, 8]])).toEqual(['batch_invalid']);
    expect(truck([['B1_0', 'W', 0, 8]], { forSegment: 2 })).toEqual([]);
    expect(truck([['B1_0', 'W', 0, 8]], { forSegment: 3 })).toEqual(['batch_invalid']);
    expect(truck([['B1_0', 'W', 0, 8]], { forSegment: 0 })).toEqual(['batch_invalid']);
    expect(truck([['D2_90', 'W', 0, 8]], { dropColumns: [4, 0] })).toEqual([]);
    expect(truck([['D2_90', 'W', 0, 8]], { dropColumns: [5] })).toEqual(['batch_invalid']);
    // y of a truck block is written as 8 (GDD §14)
    const json = levelJson({
      id: 5,
      plan: [['WW'], ['WW']],
      pieces: [['D2_90', 'W', 0, 0]],
      batches: [{ forSegment: 1, pieces: [['B1_0', 'W', 0, 8]] }],
    });
    const p = batchOf(json, 1).pieces[0];
    if (p) p.y = 7;
    expect(runJson(json, ['L-12']).map((i) => i.code)).toEqual(['batch_invalid']);
  });
});

// =====================================================================================================================
// K-45/9 mechanics (L-16, L-22)
// =====================================================================================================================

describe('review K-45/9 mechanics derived from data', () => {
  it('K-45/9 levels 1–5 derive {}, {}, {W1}, {W1, S2}, {S1}; each new mechanic equals `teaches`, 1 and 2 have none', () => {
    const previous = new Set<MechanicId>();
    const expected: Record<number, [MechanicId[], MechanicId | undefined]> = {
      1: [[], undefined],
      2: [[], undefined],
      3: [['W1'], 'W1'],
      4: [['W1', 'S2'], 'S2'],
      5: [['S1'], 'S1'],
    };
    for (const n of LEVEL_IDS) {
      const res = validateLevelJson(readLevelJson(n), {
        only: ['L-16', 'L-22'],
        previousMechanics: new Set(previous),
      });
      expect(res.issues, `level ${n}`).toEqual([]);
      const lvl = res.level;
      if (!lvl) throw new Error(`level ${n} fails the schema`);
      const [derived, teaches] = expected[n] ?? [[], undefined];
      expect(deriveMechanics(lvl), `level ${n} derived set`).toEqual(derived);
      expect(lvl.teaches, `level ${n} teaches`).toBe(teaches);
      const fresh = derived.filter((m) => !previous.has(m));
      expect(fresh, `level ${n} new mechanics`).toEqual(teaches ? [teaches] : []);
      for (const m of derived) previous.add(m);
    }
  });

  it('K-45/9 teaches is only valid for the one new mechanic: an already seen mechanic, or a level without a new one, is teaches_mismatch', () => {
    const seen = new Set<MechanicId>(['W1', 'S2', 'S1']);
    const lvl = (teaches: MechanicId, wall: LevelSpec['wall']): string[] =>
      run({ id: 6, teaches, wall, plan: ['WW'], pieces: [['B1_0', 'W', 0, 0]] }, ['L-16', 'L-22'], {
        previousMechanics: seen,
      }).map((i) => i.code);
    expect(lvl('W1', { height: 6, gaps: [{ type: 'static', y: 1, size: 2 }] })).toEqual(['teaches_mismatch']);
    expect(lvl('W2', { height: 8 })).toEqual([]);
    expect(lvl('W1', { height: 8 })).toEqual(['teaches_mismatch']);
    // level 9: a size-1 gap is W3 (any type, N2)
    const nine = run(
      {
        id: 9,
        teaches: 'W3',
        wall: { height: 6, gaps: [{ type: 'static', y: 3, size: 1 }] },
        plan: ['WW'],
        pieces: [['B1_0', 'W', 0, 0]],
      },
      ['L-16', 'L-22'],
      { previousMechanics: new Set<MechanicId>(['W1', 'S2', 'S1', 'W2', 'Y5']) },
    );
    expect(nine).toEqual([]);
  });
});

// =====================================================================================================================
// GDD §14.1 tutorial data (L-17)
// =====================================================================================================================

describe('review GDD 14.1 tutorial data (L-17)', () => {
  const l17 = (json: unknown): string[] => runJson(json, ['L-17']).map((i) => i.code);

  it('GDD 14.1 highlights must exist in the level: piece:<i> < batch-0 size, cell on the board (y ≤ 7), gap/obstacle/debris index, truck, fan', () => {
    const one = (h: string, n = 1): string[] => l17(withTutorial(n, [soft([h], { event: 'turnEnd' })]));
    expect(one('piece:22')).toEqual([]); // level 1 has 23 blocks
    expect(one('piece:23')).toEqual(['tut_highlight_invalid']);
    expect(one('cell:7,7')).toEqual([]);
    expect(one('cell:6,8')).toEqual(['tut_highlight_invalid']); // crane row is not the board
    expect(one('gap:0')).toEqual(['tut_highlight_invalid']);
    expect(one('gap:0', 3)).toEqual([]);
    expect(one('truck')).toEqual(['tut_highlight_invalid']);
    expect(one('truck', 5)).toEqual([]);
    expect(one('fan')).toEqual(['tut_highlight_invalid']);
    expect(one('obstacle:0')).toEqual(['tut_highlight_invalid']);
    expect(one('debris:0')).toEqual(['tut_highlight_invalid']);
    expect(one('piece:k1_0', 5)).toEqual(['tut_highlight_invalid']); // truck block needs startOn deliveryDone
  });

  it('GDD 14.1 done and startOn events that can never happen in level 1 are tut_done_invalid', () => {
    const impossible: Step['done'][] = [
      { event: 'segmentDone' },
      { event: 'deliveryDone' },
      { event: 'gapPass' },
      { event: 'carouselTurn' },
      { event: 'yardFall' },
      { event: 'steered' },
      { event: 'landed', flag: 'glass' },
      { event: 'landed', wind: true },
      { event: 'obstacleHit', type: 'crate' },
      { event: 'obstacleHit', type: 'chain' },
      { event: 'itemCollected', type: 'key' },
      { event: 'placementCorrect', hidden: true },
      { event: 'yardMove', painted: true },
    ];
    for (const done of impossible) {
      expect(l17(withTutorial(1, [soft(['build'], done)])), JSON.stringify(done)).toEqual([
        'tut_done_invalid',
      ]);
      if ('event' in done)
        expect(
          l17(withTutorial(1, [soft(['build'], { timeoutMs: 2000 }, { startOn: done })])),
          `startOn ${JSON.stringify(done)}`,
        ).toEqual(['tut_done_invalid']);
    }
    const possible: Step['done'][] = [
      { event: 'overWall' },
      { event: 'turnEnd' },
      { event: 'landed' },
      { event: 'placementCorrect' },
      { event: 'yardMove' },
      { event: 'tap' },
      { event: 'boosterUsed' },
      { event: 'holdOverBuild', minMs: 500 },
    ];
    for (const done of possible)
      expect(l17(withTutorial(1, [soft(['build'], done)])), JSON.stringify(done)).toEqual([]);
    expect(l17(withTutorial(5, [soft(['build'], { event: 'segmentDone' })]))).toEqual([]);
    expect(l17(withTutorial(5, [soft(['build'], { event: 'deliveryDone' })]))).toEqual([]);
    expect(l17(withTutorial(3, [soft(['build'], { event: 'gapPass' })]))).toEqual([]);
  });

  it('GDD 14.1/3 done.at must be in the event zone: yardMove x ≤ 5, placementCorrect x ≥ 6', () => {
    const at = (event: 'yardMove' | 'placementCorrect', x: number, y: number): string[] =>
      l17(withTutorial(1, [soft(['build'], { event, at: [x, y] })]));
    expect(at('yardMove', 5, 7)).toEqual([]);
    expect(at('yardMove', 6, 0)).toEqual(['tut_done_invalid']);
    expect(at('placementCorrect', 6, 0)).toEqual([]);
    expect(at('placementCorrect', 5, 0)).toEqual(['tut_done_invalid']);
  });

  it('GDD 14.1/4a a required step highlights a piece: or debris:; without piece: its done cannot be placementCorrect', () => {
    const req = (highlight: string[], done: Step['done'], n = 1): string[] =>
      l17(withTutorial(n, [soft(highlight, done, { mode: 'required' })]));
    expect(req(['piece:0'], { event: 'placementCorrect' })).toEqual([]);
    expect(req(['cell:6,0', 'build'], { event: 'turnEnd' })).toEqual(['tut_highlight_invalid']);
    const debrisLevel = (done: Step['done']): string[] =>
      l17({
        ...levelJson({
          id: 17,
          plan: ['WW', 'WW'],
          pieces: [['O4_0', 'W', 0, 0]],
          debris: [['B1_0', 'R', 6, 0]],
        }),
        tutorial: [soft(['debris:0'], done, { mode: 'required' })],
      });
    expect(debrisLevel({ event: 'yardMove' })).toEqual([]);
    expect(debrisLevel({ event: 'placementCorrect' })).toEqual(['tut_done_invalid']);
  });

  it('GDD 14.1/5 piece:k<p>_<i> is the startOn delivery block: p follows the delivery order (forSegment ascending), not the array order; count picks the n-th', () => {
    // batch 1 is delivered for segment 2, batch 2 for segment 1 → batch 2 arrives first.
    const make = (highlight: string, count?: number): unknown => ({
      ...levelJson({
        id: 35,
        plan: [['WW'], ['WW'], ['WW']],
        pieces: [['D2_90', 'W', 0, 0]],
        batches: [
          { forSegment: 2, pieces: [['D2_90', 'W', 0, 8, ['mortar']]] },
          { forSegment: 1, pieces: [['D2_90', 'W', 0, 8, ['mortar']]] },
        ],
      }),
      tutorial: [
        soft(
          [highlight],
          { timeoutMs: 2500 },
          {
            startOn: { event: 'deliveryDone', flag: 'mortar', ...(count ? { count } : {}) },
          },
        ),
      ],
    });
    expect(l17(make('piece:k2_0'))).toEqual([]);
    expect(l17(make('piece:k1_0'))).toEqual(['tut_highlight_invalid']);
    expect(l17(make('piece:k1_0', 2))).toEqual([]);
    expect(l17(make('piece:k2_0', 2))).toEqual(['tut_highlight_invalid']);
  });

  it('GDD 14.1 booster:/pre: highlights need the item unlocked in this level (economy.json unlockLevel; brush → paintBrush, trowel → trowelStart, shutter → openShutter)', () => {
    const unlock = loadBoosterUnlock(ROOT);
    if (!unlock) throw new Error('config/economy.json missing');
    const names: [string, string][] = [
      ['booster:hammer', 'hammer'],
      ['booster:crane', 'crane'],
      ['booster:undo', 'undo'],
      ['booster:brush', 'paintBrush'],
      ['pre:thermos', 'thermos'],
      ['pre:trowel', 'trowelStart'],
      ['pre:shutter', 'openShutter'],
    ];
    for (const [h, key] of names) {
      const at = unlock[key];
      if (at === undefined) throw new Error(`economy.json has no boosters.${key}.unlockLevel`);
      const check = (id: number): string[] =>
        run(
          { id, plan: ['WW'], pieces: [['B1_0', 'W', 0, 0]], tutorial: [soft([h], { event: 'tap' })] },
          ['L-17'],
          { boosterUnlock: unlock },
        ).map((i) => i.code);
      expect(check(at), `${h} at ${at}`).toEqual([]);
      if (at > 1) expect(check(at - 1), `${h} at ${at - 1}`).toEqual(['tut_highlight_invalid']);
    }
  });

  it('GDD 14.1 textKey must exist in both tr.json and en.json (tut_key_missing names the missing language)', () => {
    const json = withTutorial(1, [soft(['build'], { event: 'turnEnd' }, { textKey: 'tut.l1.only_tr' })]);
    const issues = runJson(json, ['L-17'], {
      i18nKeys: { tr: new Set(['tut.l1.only_tr']), en: new Set<string>() },
    });
    expect(issues.map((i) => i.code)).toEqual(['tut_key_missing']);
    expect(issues[0]?.message).toContain('en');
    const real = loadI18nKeys(ROOT);
    if (!real) throw new Error('i18n files missing');
    for (const n of LEVEL_IDS)
      for (const st of readLevelJson(n).tutorial ?? [])
        expect([real.tr.has(st.textKey), real.en.has(st.textKey)], `level ${n} ${st.textKey}`).toEqual([
          true,
          true,
        ]);
  });

  it('GDD 14.1 steps are numbered 1, 2, … in order', () => {
    const steps = [soft(['build'], { event: 'turnEnd' }), soft(['build'], { event: 'turnEnd' }, { step: 3 })];
    expect(l17(withTutorial(1, steps)).length).toBe(1);
    steps[1] = soft(['build'], { event: 'turnEnd' }, { step: 2 });
    expect(l17(withTutorial(1, steps))).toEqual([]);
  });
});

// =====================================================================================================================
// L-18, L-24, L-25, L-26
// =====================================================================================================================

describe('review LEVELS §0 sawtooth (L-18), K-24 (L-24), K-23 (L-25), Y4 (L-26)', () => {
  it('LEVELS 0 difficulty sawtooth: hard = 10 15 25 35 45 49, superhard = 20 30 40 50 (warn), others easy or normal', () => {
    const saw = (id: number, difficulty: LevelInput['difficulty']): Issue[] =>
      run({ id, difficulty, plan: ['WW'], pieces: [['B1_0', 'W', 0, 0]] }, ['L-18']);
    expect(saw(15, 'hard')).toEqual([]);
    expect(saw(49, 'hard')).toEqual([]);
    expect(saw(50, 'superhard')).toEqual([]);
    expect(saw(5, 'normal')).toEqual([]);
    expect(saw(1, 'easy')).toEqual([]);
    for (const [id, d] of [
      [15, 'easy'],
      [20, 'hard'],
      [21, 'hard'],
      [11, 'superhard'],
      [40, 'normal'],
    ] as const) {
      expect(
        saw(id, d).map((i) => [i.code, i.severity]),
        `${id} ${d}`,
      ).toEqual([['difficulty_sawtooth', 'warn']]);
    }
  });

  it('K-24 elevator range 0 ≤ a < b ≤ 3 and a ≤ start ≤ b (start at a bound facing out is valid data)', () => {
    const elev = (range: [number, number], start: number, dir: 1 | -1 = 1): string[] =>
      codes(
        run({ id: 37, plan: ['WW'], pieces: [['B1_0', 'W', 0, 0]], elevator: { range, start, dir } }, [
          'L-24',
        ]),
      );
    expect(elev([0, 2], 2, 1)).toEqual([]); // GDD K-24 example
    expect(elev([0, 3], 0, -1)).toEqual([]);
    expect(elev([2, 2], 2)).toEqual(['elevator_range']);
    expect(elev([3, 1], 2)).toEqual(['elevator_range']);
    expect(elev([1, 3], 0)).toEqual(['elevator_range']);
  });

  it('K-23 carousel ⇔ carouselEvery: missing in carousel mode is an error, written in segments mode a warning', () => {
    const car = (mode: 'segments' | 'carousel', every?: number): [string, string][] =>
      run(
        {
          id: 31,
          mode,
          ...(every ? { carouselEvery: every } : {}),
          plan: [['WW'], ['WW']],
          pieces: [['B1_0', 'W', 0, 0]],
        },
        ['L-25'],
      ).map((i) => [i.code, i.severity]);
    expect(car('carousel', 3)).toEqual([]);
    expect(car('carousel')).toEqual([['carousel_every_missing', 'error']]);
    expect(car('segments', 3)).toEqual([['carousel_every_missing', 'warn']]);
    expect(car('segments')).toEqual([]);
  });

  it('Y4 wet ⇔ wetMoves on every block, truck batches included', () => {
    const wet = (p: PieceSpec, inTruck = false): string[] =>
      run(
        {
          id: 28,
          plan: [['WW'], ['WW']],
          pieces: inTruck ? [['B1_0', 'W', 0, 0]] : [p],
          batches: inTruck ? [{ forSegment: 1, pieces: [p] }] : [],
        },
        ['L-26'],
      ).map((i) => i.code);
    expect(wet(['D2_90', 'W', 0, 0, ['wet'], 3])).toEqual([]);
    expect(wet(['D2_90', 'W', 0, 0, ['wet']])).toEqual(['wet_moves_missing']);
    expect(wet(['D2_90', 'W', 0, 0, [], 3])).toEqual(['wet_moves_missing']);
    expect(wet(['D2_90', 'W', 0, 8, ['wet']], true)).toEqual(['wet_moves_missing']);
  });
});

// =====================================================================================================================
// levels/level_001…005.json against docs/LEVELS.md §0, §2
// =====================================================================================================================

describe.each(LEVEL_IDS)('review LEVELS §2 Bölüm %i ↔ levels JSON', (n) => {
  const doc = docLevel(n);
  const json = readLevelJson(n);
  const batch0 = batchOf(json, 0).pieces;

  it(`K-45/2 level ${n}: the LEVELS block table is the batch-0 array (order, shape, colour, anchor)`, () => {
    expect(doc.pieces.length).toBeGreaterThan(0);
    expect(batch0.map((p) => [p.shape, p.color, p.x, p.y])).toEqual(
      doc.pieces.map((p) => [p.shape, p.color, p.x, p.y]),
    );
    expect(batch0.every((p) => p.flags === undefined)).toBe(true);
  });

  it(`K-45/2 level ${n}: blockout letters are exactly the table blocks' cells and the yard fill equals "Saha doluluğu"`, () => {
    const byLetter = new Map<string, string[]>();
    let empty = 0;
    for (let y = 0; y < 8; y++) {
      const row = doc.blockout.get(y);
      if (!row) throw new Error(`no blockout row y=${y}`);
      for (let x = 0; x < 6; x++) {
        const t = row[x] ?? '?';
        if (t === '.') empty++;
        else byLetter.set(t, [...(byLetter.get(t) ?? []), cellKey(x, y)]);
      }
    }
    expect([...byLetter.keys()].sort()).toEqual(doc.pieces.map((p) => p.letter).sort());
    for (const p of doc.pieces)
      expect(byLetter.get(p.letter)?.sort(), `block ${p.letter}`).toEqual(cellsOf(p.shape, p.x, p.y));
    const docFill = Number(match(/^(\d+)\/48/, field(doc, 'Saha doluluğu'), 'Saha doluluğu')[1]);
    expect(48 - empty).toBe(docFill);
    const jsonCells = new Set(batch0.flatMap((p) => cellsOf(p.shape, p.x, p.y)));
    expect(jsonCells.size).toBe(docFill);
    expect(docFill).toBeGreaterThanOrEqual(39); // K-02
  });

  it(`K-04 level ${n}: blockout wall column and site columns match wall height, gaps and the first segment plan`, () => {
    const gaps = json.wall.gaps;
    const h = json.wall.height;
    const rows = json.build.segments[0]?.rows ?? [];
    for (let y = 0; y <= 9; y++) {
      const row = doc.blockout.get(y);
      if (!row) throw new Error(`no blockout row y=${y}`);
      const inGap = gaps.some((g) => g.y <= y && y < g.y + g.size);
      expect(row[6], `wall y=${y}`).toBe(y < h ? (inGap ? '=' : '#') : ':');
      for (const sx of [0, 1]) {
        const want =
          y >= 8 ? '·' : y < rows.length ? (rows[rows.length - 1 - y]?.[sx] ?? '').replace('.', '+') : '~';
        expect(row[7 + sx], `site (${6 + sx},${y})`).toBe(want);
      }
    }
  });

  it(`K-45/1 level ${n}: header rows (wall, gravity, segments, colours, shapes, difficulty, budget = min + buffer, teaches) match the JSON`, () => {
    const wall = field(doc, 'Duvar');
    expect(Number(match(/height (\d+)/, wall, 'Duvar')[1])).toBe(json.wall.height);
    const gapText = match(/geçit: (.*)$/, wall, 'Duvar')[1] ?? '';
    const docGaps = gapText.startsWith('yok')
      ? []
      : [...gapText.matchAll(/y=(\d+) boy \**(\d+)\**\s*\((\w+)/g)].map((m) => ({
          type: m[3],
          y: Number(m[1]),
          size: Number(m[2]),
        }));
    expect(json.wall.gaps).toEqual(docGaps);
    const grav = match(/build `(\w+)`, yard `(\w+)`/, field(doc, 'Yerçekimi'), 'Yerçekimi');
    expect(json.gravity).toEqual({ build: grav[1], yard: grav[2] === 'true' });
    const segs = [...field(doc, 'Dilimler').matchAll(/(\d+)\. (.+?) \(EN: (.+?)\) `(\[.*?\])`/g)].map(
      (m) => ({
        name: { tr: m[2], en: m[3] },
        rows: JSON.parse(m[4] ?? '[]') as string[],
      }),
    );
    expect(json.build).toEqual({ mode: 'segments', segments: segs });
    const cs = match(/^(.*?) \((\d+)\) \/ (.*)$/, field(doc, 'Renkler / şekiller'), 'Renkler / şekiller');
    const docColors = (cs[1] ?? '').split(', ').sort();
    expect(docColors.length).toBe(Number(cs[2]));
    const parsed = validateLevelJson(json).level;
    if (!parsed) throw new Error('schema');
    expect([...levelColorSet(parsed)].sort()).toEqual(docColors);
    const kinds = [
      ...new Set(json.yard.batches.flatMap((b) => b.pieces.map((p) => shapeById(p.shape).kind))),
    ].sort();
    expect(kinds).toEqual((cs[3] ?? '').split(', ').sort());
    const diff =
      DIFFICULTY[
        match(/^(Kolay|Normal|Zor|Çok Zor) \//, field(doc, 'Zorluk / hedef kazanma'), 'Zorluk')[1] ?? ''
      ];
    expect(json.difficulty).toBe(diff);
    const min = Number(field(doc, 'Minimum hamle (el çözümü)'));
    const budget = match(/^(\d+) \+ (\d+) = \*\*(\d+)\*\*/, field(doc, 'Hamle bütçesi'), 'Hamle bütçesi');
    expect([Number(budget[1]), Number(budget[2]), Number(budget[3])]).toEqual([
      min,
      BUFFER[json.difficulty],
      json.moves,
    ]);
    expect(json.moves).toBe(min + BUFFER[json.difficulty]);
    const taught = /^(W\d|Y\d|S\d|G-[HL]) /.exec(field(doc, 'Öğretilen'));
    expect(json.teaches).toBe(taught?.[1]);
    expect(json.goals).toEqual([{ type: 'build' }]);
    expect(json.obstacles).toEqual([]);
    expect(json.chapter).toBe(1);
    expect(json.name.tr.length).toBeGreaterThan(0);
  });

  it(`K-25 level ${n}: truck batches equal LEVELS "Kamyon partileri" (array order, shape, colour, x; y written as 8)`, () => {
    const trucks = json.yard.batches.slice(1);
    expect(trucks.map((b, i) => [i + 1, b.forSegment])).toEqual(doc.trucks.map((t) => [t.batch, t.batch]));
    trucks.forEach((b, i) => {
      expect(b.pieces.map((p) => [p.shape, p.color, p.x, p.y])).toEqual(
        (doc.trucks[i]?.pieces ?? []).map(([s, c, x]) => [s, c, x, 8]),
      );
    });
  });

  it(`GDD 14.1 level ${n}: tutorial[] equals the LEVELS step list (mode, highlight, hand kind, textKey, done)`, () => {
    const steps = json.tutorial ?? [];
    expect(steps.length).toBe(doc.tutorial.length);
    doc.tutorial.forEach((item, i) => {
      const parts = item.split(' · ');
      const [head = '', hl = '', hand = '', key = '', done = ''] = parts;
      const st = steps[i];
      const where = `level ${n} step ${i + 1}`;
      expect(parts.length, where).toBe(5);
      expect(st?.step, where).toBe(Number(match(/^(\d+)\./, head, where)[1]));
      expect(st?.mode, where).toBe(head.endsWith('Z') ? 'required' : 'soft');
      expect(st?.highlight, where).toEqual([...hl.matchAll(/`([^`]+)`/g)].map((m) => m[1]));
      const handKind = /^(drag|hold|tap)\b/.exec(hand)?.[1];
      expect(st?.hand?.kind, where).toBe(handKind);
      expect(st?.textKey, where).toBe(match(/^`([^`]+)`$/, key, where)[1]);
      const timeout = /^`timeoutMs` (\d+)$/.exec(done);
      const hold = /^`\{ event: (\w+), count: (\d+), minMs: (\d+) \}`$/.exec(done);
      const simple = /^`(\w+)` ×(\d+)$/.exec(done);
      const want = timeout
        ? { timeoutMs: Number(timeout[1]) }
        : hold
          ? { event: hold[1], count: Number(hold[2]), minMs: Number(hold[3]) }
          : { event: simple?.[1], count: Number(simple?.[2]) };
      expect(st?.done, where).toEqual(want);
    });
  });
});

describe('review K-03 plan rows of the level data', () => {
  it('K-03 GDD example (level 1 plan): rows top → bottom, (6,0)(7,0) = Y, (6,1)…(7,2) = W, rows 3–7 outside the plan', () => {
    const loaded = loadLevel(readLevelJson(1));
    if (!loaded.ok) throw new Error('level 1 does not load');
    const seg = loaded.level.segments[0];
    const at = (sx: number, sy: number): number | undefined => seg?.planColors[sy * 2 + sx];
    expect([at(0, 0), at(1, 0)]).toEqual([COLOR_CODES.indexOf('Y'), COLOR_CODES.indexOf('Y')]);
    for (const sy of [1, 2])
      for (const sx of [0, 1]) expect(at(sx, sy), `(${6 + sx},${sy})`).toBe(COLOR_CODES.indexOf('W'));
    for (let sy = 3; sy < 8; sy++) for (const sx of [0, 1]) expect(at(sx, sy), `(${6 + sx},${sy})`).toBe(-2);
    expect(seg?.height).toBe(3);
  });
});

describe('review LEVELS §1 difficulty curve rows for levels 1–5', () => {
  it('K-45/1 LEVELS §1 table: difficulty and move budget of levels 1–5 equal the JSON (Kolay ×4, Normal; 11 11 11 12 11)', () => {
    const rows = new Map<number, [string, number]>();
    for (const line of LEVELS_MD.split('\n')) {
      const m = /^\| (\d+) \| ([^|]+?) \| (\d+) \| [^|]+ \| (\d+) \| ([^|]+?) \| (\d+) \|/.exec(line);
      if (!m) continue;
      rows.set(Number(m[1]), [m[2] ?? '', Number(m[3])]);
      rows.set(Number(m[4]), [m[5] ?? '', Number(m[6])]);
    }
    expect(rows.size).toBe(50);
    for (const n of LEVEL_IDS) {
      const [label, moves] = rows.get(n) ?? ['', 0];
      const word = label
        .replace(/\*\*/g, '')
        .replace(/\s*\(nefes\)$/, '')
        .trim();
      const json = readLevelJson(n);
      expect([json.difficulty, json.moves], `level ${n}`).toEqual([DIFFICULTY[word], moves]);
    }
  });
});

describe('review K-45 levels 1–5 through the whole validator', () => {
  it('K-45 levels 1–5 pass every check L-01…L-18, L-21…L-26 in sequence (mechanic history, real tr/en keys and economy unlocks): no error, no warning', () => {
    const i18nKeys = loadI18nKeys(ROOT);
    const boosterUnlock = loadBoosterUnlock(ROOT);
    expect(i18nKeys).not.toBeNull();
    expect(boosterUnlock).not.toBeNull();
    const previous = new Set<MechanicId>();
    for (const n of LEVEL_IDS) {
      const res = validateLevelJson(readLevelJson(n), {
        fileId: n,
        previousMechanics: new Set(previous),
        ...(i18nKeys ? { i18nKeys } : {}),
        ...(boosterUnlock ? { boosterUnlock } : {}),
      });
      expect(res.issues, `level ${n}`).toEqual([]);
      if (res.level) for (const m of deriveMechanics(res.level)) previous.add(m);
      // the game load path accepts it too
      expect(loadLevel(readLevelJson(n)).ok, `level ${n} loadLevel`).toBe(true);
    }
  });

  it('K-45/9 npm run levels:validate on levels/ exits 0; --level 4 still uses levels 1–3 as mechanic history (only S2 is new)', () => {
    const cli = (...args: string[]): { code: number | null; out: string } => {
      const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'validate-levels.ts'), ...args], {
        cwd: ROOT,
        encoding: 'utf8',
      });
      return { code: r.status, out: `${r.stdout}${r.stderr}` };
    };
    const all = cli();
    expect(all.code, all.out).toBe(0);
    for (const line of [
      'level_001.json  OK',
      'level_002.json  OK',
      'level_003.json  OK  mechanics: W1',
      'level_004.json  OK  mechanics: W1 S2',
      'level_005.json  OK  mechanics: S1',
    ])
      expect(all.out).toContain(line);
    expect(all.out).toMatch(/0 error\(s\), 0 warning\(s\)/);
    const four = cli('--level', '4');
    expect(four.code, four.out).toBe(0);
    expect(four.out).toContain('level_004.json  OK  mechanics: W1 S2');
    expect(four.out).toContain('1 file(s), 0 error(s)');
  });

  it('K-45/1 a level file name number must equal its id (L-01 id_mismatch otherwise)', () => {
    const json = readLevelJson(2);
    expect(errorCodes(runJson(json, ['L-01'], { fileId: 3 }))).toEqual(['id_mismatch']);
    expect(runJson(json, ['L-01'], { fileId: 2 })).toEqual([]);
  });
});

// =====================================================================================================================
// Golden replays against the LEVELS §2 solution text
// =====================================================================================================================

interface DocMove {
  readonly text: string;
  readonly ref: string;
  readonly shape: ShapeId;
  readonly color: ColorCode;
  readonly from: readonly [number, number];
  readonly entry: 'overWall' | 'gap';
  /** overWall: column x of "x=c üstüne"; gap: the rail landing. */
  readonly release: readonly [number, number];
  readonly lands: readonly [number, number];
  readonly delivered: readonly (readonly [string, number, number])[];
  readonly queued: readonly string[];
}

function docMoves(doc: DocLevel): DocMove[] {
  const refOf = (letter: string): string => {
    const i = doc.pieces.findIndex((p) => p.letter === letter);
    if (i >= 0) return `piece:${i}`;
    if (/^k\d+_\d+$/.test(letter)) return `piece:${letter}`;
    throw new Error(`LEVELS Bölüm ${doc.n}: unknown block ${letter}`);
  };
  return doc.solution.map((text) => {
    const head = match(/^\d+\. `([^`]+)` \(([A-Z][0-9]_\d+) ([A-Z])\) \((\d),(\d)\)/, text, 'solution step');
    const over = /duvar üstünden x=(\d) üstüne taşı → bırak → \((\d),(\d)\)/.exec(text);
    const rail = /geçitten raya → \((\d),(\d)\)'de bırak/.exec(text);
    const lands: [number, number] = over
      ? [Number(over[2]), Number(over[3])]
      : rail
        ? [Number(rail[1]), Number(rail[2])]
        : [-1, -1];
    const delivered: [string, number, number][] = [];
    const truck = /kamyon partisi \d+ düşer: ([^;]*)/.exec(text);
    if (truck)
      for (const m of (truck[1] ?? '').matchAll(/`(k\d+_\d+)` \((\d),(\d)\)/g))
        delivered.push([`piece:${m[1] ?? ''}`, Number(m[2]), Number(m[3])]);
    for (const m of text.matchAll(/9\. adımında `(k\d+_\d+)` \([^)]*\) \((\d),(\d)\)/g))
      delivered.push([`piece:${m[1] ?? ''}`, Number(m[2]), Number(m[3])]);
    const queued = [...text.matchAll(/`(k\d+_\d+)` \([^)]*\) sığmaz, kuyrukta bekler/g)].map(
      (m) => `piece:${m[1] ?? ''}`,
    );
    return {
      text,
      ref: refOf(head[1] ?? ''),
      shape: head[2] as ShapeId,
      color: head[3] as ColorCode,
      from: [Number(head[4]), Number(head[5])] as const,
      entry: rail ? 'gap' : 'overWall',
      release: over ? [Number(over[1]), 8] : lands,
      lands,
      delivered,
      queued,
    };
  });
}

function pieceIdOf(lvl: CompiledLevel, ref: string): PieceId {
  const id = lvl.tutorialPieceIds.get(ref);
  if (id === undefined) throw new Error(`level ${lvl.id}: no ${ref}`);
  return id;
}

function moveOf(lvl: CompiledLevel, m: DocMove): Move {
  const pieceId = pieceIdOf(lvl, m.ref);
  if (m.entry === 'overWall') return { kind: 'drag', pieceId, to: { ix: m.release[0], iy: 8, mode: FREE } };
  const gap = lvl.data.wall.gaps.findIndex((g) => g.y <= m.lands[1] && m.lands[1] < g.y + g.size);
  return { kind: 'drag', pieceId, to: { ix: m.lands[0], iy: m.lands[1], mode: railMode(gap) } };
}

interface GoldenFile {
  readonly budget: number;
  readonly minMoves: number;
  readonly yao: { readonly overWall: number; readonly rail: number };
  readonly steps: readonly {
    readonly ref: string;
    readonly from: readonly number[];
    readonly entry: string;
    readonly lands: readonly number[];
    readonly delivered?: readonly (readonly [string, number, number])[];
    readonly queue?: readonly string[];
  }[];
  readonly log: readonly { readonly kind: string }[];
}

describe.each(LEVEL_IDS)('review golden Bölüm %i against the LEVELS §2 solution text', (n) => {
  const doc = docLevel(n);
  const moves = docMoves(doc);
  const loaded = loadLevel(readLevelJson(n));
  if (!loaded.ok) throw new Error(`level ${n} does not load`);
  const lvl = loaded.level;
  const min = Number(field(doc, 'Minimum hamle (el çözümü)'));
  const yao = match(/^(\d+) duvar üstü \/ (\d+) yerleşim/, field(doc, 'YAO (çözüm)'), 'YAO');

  it(`K-46 level ${n}: the LEVELS solution text replays move by move (start cell, entry, landing, deliveries, queue) and wins with the documented YAO`, () => {
    expect(moves.length).toBe(min);
    const sink = new ArraySink();
    const session = GameSession.start(lvl, {}, { strict: true }, sink);
    let queue: string[] = [];
    moves.forEach((m, i) => {
      const where = `L${n} step ${i + 1}: ${m.text}`;
      const id = pieceIdOf(lvl, m.ref);
      const p = lvl.pieces[id];
      expect([p?.dataShape, COLOR_CODES[p?.colorIndex ?? -1]], where).toEqual([m.shape, m.color]);
      const s = session.state;
      expect([pieceZone(s, id), pieceX(s, id), pieceY(s, id)], `${where} — start cell`).toEqual([
        Zone.yard,
        ...m.from,
      ]);
      const first = sink.events.length;
      const res = session.commit(moveOf(lvl, m), sink);
      const ev: GameEvent[] = sink.events.slice(first);
      expect([res.status, res.won], where).toEqual(['applied', i === moves.length - 1]);
      const moved = ev.filter((e): e is Extract<GameEvent, { t: 'pieceMoved' }> => e.t === 'pieceMoved');
      expect(
        moved.map((e) => e.entry),
        `${where} — entry`,
      ).toEqual([m.entry]);
      const correct = ev.filter(
        (e): e is Extract<GameEvent, { t: 'placementCorrect' }> => e.t === 'placementCorrect',
      );
      expect(correct.length, `${where} — doğru`).toBe(1);
      const cells = correct[0]?.cells ?? [];
      expect(
        [Math.min(...cells.map((c) => c.x)), Math.min(...cells.map((c) => c.y))],
        `${where} — landing`,
      ).toEqual([...m.lands]);
      const arrived = ev.flatMap((e) => (e.t === 'deliveryArrived' ? e.pieces : []));
      expect(arrived, `${where} — delivered`).toEqual(m.delivered.map(([ref]) => pieceIdOf(lvl, ref)));
      for (const [ref, x, y] of m.delivered) {
        const did = pieceIdOf(lvl, ref);
        expect([pieceZone(s, did), pieceX(s, did), pieceY(s, did)], `${where} — ${ref}`).toEqual([
          Zone.yard,
          x,
          y,
        ]);
      }
      queue = [...queue, ...m.queued].filter((r) => !m.delivered.some(([d]) => d === r));
      expect(queueIds(s), `${where} — queue`).toEqual(queue.map((r) => pieceIdOf(lvl, r)));
    });
    expect(session.outcome).toBe('won');
    expect(session.movesLeft).toBe(lvl.moves - min);
    const y = session.yao();
    expect([y.overWall, y.overWall + y.rail]).toEqual([Number(yao[1]), Number(yao[2])]);
    expect(y.yao ?? 0).toBeGreaterThanOrEqual(0.6);
  });

  it(`K-46 level ${n}: tests/golden/level_${pad(n)}.hand.json transcribes the same LEVELS solution (moves, cells, entries, deliveries, YAO)`, () => {
    const golden = JSON.parse(
      readFileSync(join(ROOT, 'tests', 'golden', `level_${pad(n)}.hand.json`), 'utf8'),
    ) as GoldenFile;
    expect([golden.minMoves, golden.budget]).toEqual([min, lvl.moves]);
    expect([golden.yao.overWall, golden.yao.overWall + golden.yao.rail]).toEqual([
      Number(yao[1]),
      Number(yao[2]),
    ]);
    expect(golden.log.slice(1)).toEqual(moves.map((m) => moveOf(lvl, m)));
    expect(golden.steps.map((s) => [s.ref, [...s.from], s.entry, [...s.lands]])).toEqual(
      moves.map((m) => [m.ref, [...m.from], m.entry, [...m.lands]]),
    );
    expect(golden.steps.map((s) => (s.delivered ?? []).map((d) => [...d]))).toEqual(
      moves.map((m) => m.delivered.map((d) => [...d])),
    );
  });
});

// =====================================================================================================================
// Round 2 — TECH L-10 / GDD K-27 whole-block material check (the round-1 fix) and gaps of round 1
// =====================================================================================================================

/** `[code, path]` of the L-10 issues of a builder level. */
const l10 = (spec: LevelSpec, only: readonly CheckId[] = ['L-10']): [string, string][] =>
  run(spec, only).map((i) => [i.code, i.path]);

/**
 * Independent count of TECH L-10 for levels without paint gates: for every segment k (segments mode) the plan cells of
 * segments 0…k per colour against the cells of the non-heavy blocks of batches with forSegment ≤ k that can reach the
 * site (K-05 over the wall: box height ≤ 10 − height; K-12 through a gap: height ≤ size). Returns the failing stages
 * as data paths `build.segments[k]`.
 */
function materialOracle(json: LevelInput): string[] {
  const reaches = (id: ShapeId): boolean => {
    const s = shapeById(id);
    return !s.heavy && (s.h <= 10 - json.wall.height || json.wall.gaps.some((g) => s.h <= g.size));
  };
  const failing: string[] = [];
  json.build.segments.forEach((_, k) => {
    const need = new Map<string, number>();
    for (const seg of json.build.segments.slice(0, k + 1))
      for (const row of seg.rows) for (const ch of row) if (ch !== '.') need.set(ch, (need.get(ch) ?? 0) + 1);
    const have = new Map<string, number>();
    for (const b of json.yard.batches)
      if (b.forSegment <= k)
        for (const p of b.pieces)
          if (reaches(p.shape)) have.set(p.color, (have.get(p.color) ?? 0) + shapeById(p.shape).cells.length);
    if ([...need].some(([c, d]) => d > (have.get(c) ?? 0))) failing.push(`build.segments[${k}]`);
  });
  return failing;
}

describe('review round 2: K-27 material (TECH L-10) after the whole-block fix', () => {
  it('K-27 TECH L-10 is cumulative per segment: a truck batch for segment 1 cannot pay for segment 0; carousel checks only the total', () => {
    // segment 0 needs 4 W and batch 0 brings 2 W; batch 1 (segment 1) brings 4 W and the 2 Y of segment 1.
    const spec = (mode: 'segments' | 'carousel'): LevelSpec => ({
      id: mode === 'segments' ? 5 : 31,
      mode,
      ...(mode === 'carousel' ? { carouselEvery: 3 } : {}),
      plan: [['WW', 'WW'], ['YY']],
      pieces: [['D2_90', 'W', 0, 0]],
      batches: [
        {
          forSegment: 1,
          pieces: [
            ['O4_0', 'W', 0, 8],
            ['D2_90', 'Y', 2, 8],
          ],
        },
      ],
    });
    expect(l10(spec('segments'))).toEqual([['material_short', 'build.segments[0]']]);
    expect(l10(spec('carousel'))).toEqual([]);
  });

  it('K-27 TECH L-10 the shortage shows at the first segment whose cumulative demand exceeds the supply; a truck for that segment fixes it', () => {
    // stage 0: 2 W ≤ 2; stage 1: 4 W > 2 (batch 1 brings only Y); stage 2: 6 W ≤ 2 + 4 (batch 2 brings an O4 W).
    const spec = (oForSegment: 1 | 2): LevelSpec => ({
      id: 5,
      plan: [['WW'], ['WW'], ['WW']],
      pieces: [['D2_90', 'W', 0, 0]],
      batches:
        oForSegment === 2
          ? [
              { forSegment: 1, pieces: [['D2_90', 'Y', 0, 8]] },
              { forSegment: 2, pieces: [['O4_0', 'W', 0, 8]] },
            ]
          : [
              {
                forSegment: 1,
                pieces: [
                  ['D2_90', 'Y', 0, 8],
                  ['O4_0', 'W', 2, 8],
                ],
              },
            ],
    });
    expect(run(spec(2), ['L-10']).map((i) => [i.code, i.rule, i.severity, i.path])).toEqual([
      ['material_short', 'K-27', 'error', 'build.segments[1]'],
    ]);
    expect(l10(spec(1))).toEqual([]);
  });

  it('K-27 TECH L-10 paint gate: only blocks that fit the gate rows count for its colour (D2_0 needs size ≥ 2, D2_90 fits size 1)', () => {
    // plan P W / P W: 2 P cells (left column) and 2 W cells; the Y block can only become P at the gate.
    const gate = (size: number, shape: ShapeId): [string, string][] =>
      l10({
        id: 22,
        wall: { height: 6, gaps: [{ type: 'paint', y: 1, size, color: 'P' }] },
        plan: ['PW', 'PW'],
        pieces: [
          [shape, 'Y', 0, 0],
          ['D2_0', 'W', 3, 0],
        ],
      });
    expect(gate(1, 'D2_0')).toEqual([['material_short', 'build.segments[0]']]);
    expect(gate(2, 'D2_0')).toEqual([]);
    expect(gate(1, 'D2_90')).toEqual([]);
  });

  it('K-27 TECH L-10 heavy blocks are never supply, not even for a paint gate they would fit by height (Y5 never crosses the boundary)', () => {
    const one = (shape: ShapeId): [string, string][] =>
      l10({
        id: 22,
        wall: { height: 6, gaps: [{ type: 'paint', y: 1, size: 2, color: 'P' }] },
        plan: ['PP'],
        pieces: [[shape, 'Y', 0, 0]],
      });
    expect(one('I3_90')).toEqual([['material_short', 'build.segments[0]']]); // 3 wide → heavy (K-44)
    expect(one('D2_90')).toEqual([]);
    expect(one('O4_0')).toEqual([]);
  });

  it('K-27 TECH L-10 "her blok bir kez" with two paint gates (E-39: the last gate wins): one D2_90 is P or B as a whole, never P + B; L-11 agrees', () => {
    const twoGates = (pieces: PieceSpec[]): string[] =>
      codes(
        run(
          {
            id: 22,
            wall: {
              height: 6,
              gaps: [
                { type: 'paint', y: 1, size: 1, color: 'P' },
                { type: 'paint', y: 3, size: 1, color: 'B' },
              ],
            },
            plan: ['PB'],
            pieces,
          },
          ['L-10', 'L-11'],
        ),
      );
    expect(twoGates([['D2_90', 'Y', 0, 0]])).toEqual(['material_short', 'untileable']);
    expect(
      twoGates([
        ['B1_0', 'Y', 0, 0],
        ['B1_0', 'Y', 1, 0],
      ]),
    ).toEqual([]);
  });

  it('K-27 K-32 resolved `?` cells are demand in their resolved colour: `??` over `YW` (repeat 1) needs 2 Y and 2 W', () => {
    const hidden = (pieces: PieceSpec[]): [string, string][] =>
      l10({ id: 27, plan: ['??', 'YW'], hidden: [{ kind: 'repeat', period: 1 }], pieces });
    const w2: PieceSpec[] = [
      ['B1_0', 'W', 0, 0],
      ['B1_0', 'W', 1, 0],
    ];
    expect(hidden([...w2, ['B1_0', 'Y', 2, 0]])).toEqual([['material_short', 'build.segments[0]']]);
    expect(hidden([...w2, ['B1_0', 'Y', 2, 0], ['B1_0', 'Y', 3, 0]])).toEqual([]);
  });

  it('K-27 a block whose only way to the site is a paint gate arrives in the gate colour: the validator refuses a plan of its own colour (L-10 or L-11) and accepts the gate colour', () => {
    // height 8: I3_0 (3 tall) cannot go over the wall (K-05: 3 > 10 − 8); the only gap tall enough is the P gate.
    const behindGate = (rows: string[]): Issue[] =>
      run(
        {
          id: 22,
          wall: { height: 8, gaps: [{ type: 'paint', y: 0, size: 3, color: 'P' }] },
          plan: rows,
          pieces: [
            ['I3_0', 'W', 0, 0],
            ['I3_0', 'W', 1, 0],
          ],
        },
        ['L-10', 'L-11'],
      );
    expect(errorCodes(behindGate(['WW', 'WW', 'WW'])).length).toBeGreaterThan(0);
    expect(behindGate(['PP', 'PP', 'PP'])).toEqual([]);
  });

  it('K-27 K-34 TECH L-11 a cell above a window needs an aligned gap (K-24: plan row g.y − e), a 2-wide bridge or an arch shape: `WW` over `.W`', () => {
    // plan (bottom → top): r0 `.W`, r1 `WW`; (6,1) sits above the window (6,0).
    const tile = (spec: Partial<LevelSpec>): string[] =>
      codes(
        run({ id: 37, wall: { height: 4 }, plan: ['WW', '.W'], pieces: bricks(3), ...spec }, [
          'L-10',
          'L-11',
        ]),
      );
    // three bricks, no gap: a FREE drop in column 6 falls into the window → untileable
    expect(tile({})).toEqual(['untileable']);
    // a rail at board row 1 holds the brick above the window (K-12); a gap at row 2 is one row too high …
    expect(tile({ wall: { height: 4, gaps: [{ type: 'static', y: 1, size: 1 }] } })).toEqual([]);
    expect(tile({ wall: { height: 4, gaps: [{ type: 'static', y: 2, size: 1 }] } })).toEqual(['untileable']);
    // … unless the scaffold stands one row higher: with e = 1 the gap opens onto plan row 2 − 1 = 1 (K-24)
    expect(
      tile({
        wall: { height: 4, gaps: [{ type: 'static', y: 2, size: 1 }] },
        elevator: { range: [0, 1], start: 0, dir: 1 },
      }),
    ).toEqual([]);
    // a horizontal D2 bridges both columns (lands on top(7) = 1); C3_180 is the arch itself; C3_0 has no hole
    expect(
      tile({
        pieces: [
          ['D2_90', 'W', 0, 0],
          ['B1_0', 'W', 2, 0],
        ],
      }),
    ).toEqual([]);
    expect(tile({ pieces: [['C3_180', 'W', 0, 0]] })).toEqual([]);
    expect(tile({ pieces: [['C3_0', 'W', 0, 0]] })).toEqual(['untileable']);
  });

  it.each(LEVEL_IDS)(
    'K-27 TECH L-10 level %i: the verdict equals an independent cumulative count for the level, every one-block removal and every plan-cell recolouring',
    (n) => {
      const base = readLevelJson(n);
      expect(base.build.mode).toBe('segments');
      expect(base.wall.gaps.every((g) => g.type !== 'paint')).toBe(true);
      const variants: [string, LevelInput][] = [['as written', base]];
      base.yard.batches.forEach((b, bi) =>
        b.pieces.forEach((p, pi) => {
          if (b.pieces.length < 2) return;
          const v = structuredClone(base);
          v.yard.batches[bi]?.pieces.splice(pi, 1);
          variants.push([`without batches[${bi}].pieces[${pi}] ${p.shape} ${p.color}`, v]);
        }),
      );
      base.build.segments.forEach((s, si) =>
        s.rows.forEach((row, ri) =>
          [0, 1].forEach((ci) => {
            if (row[ci] === '.') return;
            for (const c of ['W', 'Y', 'G', 'R'] as const) {
              if (row[ci] === c) continue;
              const v = structuredClone(base);
              const seg = v.build.segments[si];
              if (!seg) continue;
              seg.rows[ri] = ci === 0 ? `${c}${row[1] ?? ''}` : `${row[0] ?? ''}${c}`;
              variants.push([`segment ${si} row ${ri} col ${ci} → ${c}`, v]);
            }
          }),
        ),
      );
      let shortVariants = 0;
      for (const [what, v] of variants) {
        const failing = materialOracle(v);
        const issues = runJson(v, ['L-10']);
        const where = `level ${n} ${what}`;
        expect(
          issues.every((i) => i.code === 'material_short' && i.rule === 'K-27'),
          where,
        ).toBe(true);
        expect(issues.length > 0, `${where}: oracle ${failing.join(' ')}`).toBe(failing.length > 0);
        for (const i of issues) expect(failing, where).toContain(i.path);
        if (failing.length > 0) {
          shortVariants++;
          expect(
            issues.map((i) => i.path),
            where,
          ).toContain(failing[0]);
        }
      }
      expect(materialOracle(base)).toEqual([]);
      expect(shortVariants).toBeGreaterThan(0);
    },
  );
});

describe('review round 2: gaps of round 1 (K-45/9, K-32, K-25, GDD 14.1/5, K-45/5, schema limits)', () => {
  const l17 = (json: unknown): string[] => runJson(json, ['L-17']).map((i) => i.code);

  it('K-45/9 GDD example: a size-1 gap in level 4 makes the derived new mechanics {S2, W3} → too_many_new_mechanics', () => {
    const history = new Set<MechanicId>();
    for (const n of [1, 2, 3]) {
      const lvl = validateLevelJson(readLevelJson(n)).level;
      if (!lvl) throw new Error(`level ${n} fails the schema`);
      for (const m of deriveMechanics(lvl)) history.add(m);
    }
    expect([...history]).toEqual(['W1']);
    const json = readLevelJson(4);
    const gap = json.wall.gaps[0];
    if (!gap) throw new Error('level 4 has no gap');
    gap.size = 1;
    const res = validateLevelJson(json, { only: ['L-22'], previousMechanics: history });
    expect(res.issues.map((i) => [i.code, i.rule])).toEqual([['too_many_new_mechanics', 'K-45/9']]);
    if (!res.level) throw new Error('schema');
    expect(
      deriveMechanics(res.level)
        .filter((m) => !history.has(m))
        .sort(),
    ).toEqual(['S2', 'W3']);
    // the moved gap itself is fine under K-04 (y 3 + size 1 ≤ height 6 − 1)
    expect(runJson(json, ['L-09'])).toEqual([]);
  });

  it('K-32 a `?` needs a hidden rule in its segment, and a mirrorOf `?` that lands on a `.` is invalid ("`.` hücresi hiçbir zaman gizli değildir")', () => {
    expect(codes(run({ id: 27, plan: ['?W', 'WW'], pieces: [['B1_0', 'W', 0, 0]] }, ['L-08']))).toEqual([
      'hidden_invalid',
    ]);
    const mirror = (target: string): string[] =>
      codes(
        run(
          {
            id: 29,
            plan: [[target], ['?R']],
            hidden: [undefined, { kind: 'mirrorOf', segment: 0 }],
            pieces: [['B1_0', 'W', 0, 0]],
          },
          ['L-08'],
        ),
      );
    // segment 1 (6,0) `?` takes segment 0 (7,0): `.` → invalid, Y → valid
    expect(mirror('W.')).toEqual(['hidden_invalid']);
    expect(mirror('WY')).toEqual([]);
  });

  it('K-25 TECH L-12 batch 0 is the start batch of segment 0 ("parti 0 dilim 0 için var"): forSegment 1 on batch 0 is batch_invalid', () => {
    const json = levelJson({
      id: 5,
      plan: [['WW'], ['WW']],
      pieces: [['D2_90', 'W', 0, 0]],
      batches: [{ forSegment: 1, pieces: [['D2_90', 'W', 0, 8]] }],
    });
    expect(runJson(json, ['L-12'])).toEqual([]);
    batchOf(json, 0).forSegment = 1;
    expect(runJson(json, ['L-12']).map((i) => [i.code, i.path])).toEqual([
      ['batch_invalid', 'yard.batches[0]'],
    ]);
  });

  it('GDD 14.1/5 TECH L-17 carousel: for piece:k<p>_<i> only the startOn filter is checked (delivery order depends on the player); a block without the flag stays invalid', () => {
    const make = (highlight: string, mode: 'segments' | 'carousel'): unknown => ({
      ...levelJson({
        id: 35,
        mode,
        ...(mode === 'carousel' ? { carouselEvery: 3 } : {}),
        plan: [['WW'], ['WW'], ['WW']],
        pieces: [['D2_90', 'W', 0, 0]],
        batches: [
          { forSegment: 1, pieces: [['D2_90', 'W', 0, 8, ['mortar']]] },
          {
            forSegment: 2,
            pieces: [
              ['D2_90', 'W', 0, 8, ['mortar']],
              ['B1_0', 'W', 2, 8],
            ],
          },
        ],
      }),
      tutorial: [
        soft([highlight], { timeoutMs: 2500 }, { startOn: { event: 'deliveryDone', flag: 'mortar' } }),
      ],
    });
    expect(l17(make('piece:k1_0', 'carousel'))).toEqual([]);
    expect(l17(make('piece:k2_0', 'carousel'))).toEqual([]);
    expect(l17(make('piece:k2_1', 'carousel'))).toEqual(['tut_highlight_invalid']);
    // segments mode keeps the order rule: the first mortar delivery is batch 1
    expect(l17(make('piece:k1_0', 'segments'))).toEqual([]);
    expect(l17(make('piece:k2_0', 'segments'))).toEqual(['tut_highlight_invalid']);
  });

  it('GDD 14.1 TECH L-17 deliveryDone.flag needs a truck (k ≥ 1) block with that flag: a flagged batch-0 block is not enough (done and startOn)', () => {
    const make = (truckFlag: boolean, done: Step['done'], startOn?: Step['startOn']): unknown => ({
      ...levelJson({
        id: 35,
        plan: [['WW'], ['WW']],
        pieces: [['D2_90', 'W', 0, 0, truckFlag ? [] : ['mortar']]],
        batches: [{ forSegment: 1, pieces: [['D2_90', 'W', 0, 8, truckFlag ? ['mortar'] : []]] }],
      }),
      tutorial: [soft(['truck'], done, startOn ? { startOn } : {})],
    });
    const flagged = { event: 'deliveryDone', flag: 'mortar' } as const;
    expect(l17(make(false, flagged))).toEqual(['tut_done_invalid']);
    expect(l17(make(false, { timeoutMs: 2000 }, flagged))).toEqual(['tut_done_invalid']);
    expect(l17(make(false, { event: 'deliveryDone' }))).toEqual([]);
    expect(l17(make(true, flagged))).toEqual([]);
    expect(l17(make(true, { timeoutMs: 2000 }, flagged))).toEqual([]);
  });

  it('GDD 14.1 TECH L-17 piece:k<p>_<i> needs 1 ≤ p < batch count and i < that batch size (level 5: k1_3 valid; k1_4 and k2_0 invalid)', () => {
    const one = (h: string): string[] =>
      l17(withTutorial(5, [soft([h], { timeoutMs: 2500 }, { startOn: { event: 'deliveryDone' } })]));
    expect(batchOf(readLevelJson(5), 1).pieces.length).toBe(4);
    expect(one('piece:k1_0')).toEqual([]);
    expect(one('piece:k1_3')).toEqual([]);
    expect(one('piece:k1_4')).toEqual(['tut_highlight_invalid']);
    expect(one('piece:k2_0')).toEqual(['tut_highlight_invalid']);
  });

  it('K-45/5 OBSTACLES flag table "debris × ağır şekil ✗ (moloz ≤ 2 geniş)": heavy debris is flag_combo_forbidden, 2-wide debris is not', () => {
    const debris = (shape: ShapeId, only: readonly CheckId[]): string[] =>
      codes(
        run(
          { id: 41, plan: ['WW', 'WW', 'WW'], pieces: [['B1_0', 'W', 0, 0]], debris: [[shape, 'R', 6, 0]] },
          only,
        ),
      );
    expect(debris('I3_90', ['L-21'])).toEqual(['flag_combo_forbidden']);
    expect(debris('L4_90', ['L-21'])).toEqual(['flag_combo_forbidden']);
    expect(debris('D2_90', ['L-21'])).toEqual([]);
    expect(debris('O4_0', ['L-21', 'L-13'])).toEqual([]);
    // a 3-wide debris also leaves x 6–7 (K-45/7)
    expect(debris('I3_90', ['L-13'])).toEqual(['debris_misplaced']);
  });

  it('K-45/3 wall limits are schema errors: height 9, paint gate without colour, shutter period 0, slider range start −1, locked gate without keyId', () => {
    const base = (): LevelInput =>
      levelJson({
        id: 30,
        wall: { height: 6 },
        plan: ['WW'],
        pieces: [['B1_0', 'W', 0, 0]],
        obstacles: [{ type: 'key', x: 0, y: 0, id: 'a' }],
      });
    const schemaOnly = (json: LevelInput): string[] => codes(runJson(json, []));
    expect(schemaOnly(base())).toEqual([]);
    const tall = base();
    tall.wall.height = 9;
    expect(schemaOnly(tall)).toEqual(['schema_invalid']);
    const top = base();
    top.wall.height = 8;
    expect(schemaOnly(top)).toEqual([]);
    const badGaps: unknown[] = [
      { type: 'paint', y: 1, size: 2 },
      { type: 'shutter', y: 1, size: 2, period: 0 },
      { type: 'slider', y: 1, size: 1, range: [-1, 2] },
      { type: 'locked', y: 1, size: 1 },
    ];
    for (const g of badGaps) {
      const json = base();
      Object.assign(json.wall, { gaps: [g] });
      expect(schemaOnly(json), JSON.stringify(g)).toEqual(['schema_invalid']);
    }
    const okGaps: LevelInput['wall']['gaps'] = [
      { type: 'paint', y: 1, size: 2, color: 'W' },
      { type: 'shutter', y: 1, size: 2, period: 1 },
      { type: 'slider', y: 1, size: 1, range: [0, 2] },
      { type: 'locked', y: 1, size: 1, keyId: 'a' },
    ];
    for (const g of okGaps) {
      const json = base();
      json.wall.gaps = [g];
      expect(schemaOnly(json), JSON.stringify(g)).toEqual([]);
    }
  });

  it('K-45/2 K-45/6 obstacles lie in the yard (x 0–5, y 0–7) and a crate has hp 1–3 (OBSTACLES Y1): x 6, y 8, hp 0, hp 4 and a missing hp are refused', () => {
    const withObstacle = (o: Record<string, unknown>): string[] => {
      const json = levelJson({ id: 11, plan: ['WW'], pieces: [['B1_0', 'W', 0, 0]] });
      Object.assign(json, { obstacles: [o] });
      return errorCodes(runJson(json, ['L-14']));
    };
    expect(withObstacle({ type: 'crate', x: 5, y: 7, hp: 3 })).toEqual([]);
    expect(withObstacle({ type: 'crate', x: 0, y: 0, hp: 1 })).toEqual([]);
    for (const bad of [
      { type: 'crate', x: 6, y: 0, hp: 1 },
      { type: 'crate', x: 0, y: 8, hp: 1 },
      { type: 'crate', x: 0, y: 0, hp: 0 },
      { type: 'crate', x: 0, y: 0, hp: 4 },
      { type: 'crate', x: 0, y: 0 },
    ])
      expect(withObstacle(bad), JSON.stringify(bad)).toEqual(['schema_invalid']);
  });

  it('K-45/9 OBSTACLES "Veri imzası": every one of the 27 signatures derives exactly its mechanic from a minimal level (W3 always comes with its gap type)', () => {
    const base: LevelSpec = { id: 41, wall: { height: 4 }, plan: ['WW'], pieces: [['B1_0', 'W', 0, 0]] };
    const derive = (extra: Partial<LevelSpec>): string[] =>
      deriveMechanics(level({ ...base, ...extra })).sort();
    expect(derive({})).toEqual([]);
    const gap = (g: LevelInput['wall']['gaps'][number]): Partial<LevelSpec> => ({
      wall: { height: 4, gaps: [g] },
    });
    const two: Partial<LevelSpec> = { plan: [['WW'], ['WW']] };
    const cases: [string, Partial<LevelSpec>, string[]][] = [
      ['W1', gap({ type: 'static', y: 0, size: 2 }), ['W1']],
      ['W2', { wall: { height: 8 } }, ['W2']],
      ['W3 static', gap({ type: 'static', y: 0, size: 1 }), ['W1', 'W3']],
      ['W3 shutter', gap({ type: 'shutter', y: 0, size: 1, period: 2 }), ['W3', 'W4']],
      ['W4', gap({ type: 'shutter', y: 0, size: 2, period: 2 }), ['W4']],
      ['W5', gap({ type: 'slider', y: 0, size: 1, range: [0, 1] }), ['W3', 'W5']],
      [
        'W5 size 2',
        { wall: { height: 6, gaps: [{ type: 'slider', y: 0, size: 2, range: [0, 1] }] } },
        ['W5'],
      ],
      ['W6', gap({ type: 'paint', y: 0, size: 2, color: 'W' }), ['W6']],
      [
        'W7',
        {
          ...gap({ type: 'locked', y: 0, size: 2, keyId: 'a' }),
          obstacles: [{ type: 'key', x: 0, y: 0, id: 'a' }],
        },
        ['W7'],
      ],
      ['W8', { wall: { height: 4, fan: 'left' } }, ['W8']],
      ['Y1', { obstacles: [{ type: 'crate', x: 3, y: 3, hp: 1 }] }, ['Y1']],
      ['Y2', { obstacles: [{ type: 'cement_bag', x: 3, y: 3 }] }, ['Y2']],
      ['Y3 batch 0', { pieces: [['B1_0', 'W', 0, 0, ['chained']]] }, ['Y3']],
      [
        'Y3 truck',
        { ...two, batches: [{ forSegment: 1, pieces: [['B1_0', 'W', 0, 8, ['chained']]] }] },
        ['S1', 'Y3'],
      ],
      ['Y4', { pieces: [['B1_0', 'W', 0, 0, ['wet'], 2]] }, ['Y4']],
      ['Y5', { pieces: [['I3_90', 'W', 0, 0]] }, ['Y5']],
      ['Y6', { gravity: { yard: true } }, ['Y6']],
      ['Y7', { obstacles: [{ type: 'screw', x: 0, y: 0 }] }, ['Y7']],
      ['Y8', { pieces: [['B1_0', 'W', 0, 0, ['mortar']]] }, ['Y8']],
      ['S1', two, ['S1']],
      ['S2', { plan: ['W.'] }, ['S2']],
      ['S3', { pieces: [['B1_0', 'W', 0, 0, ['glass']]] }, ['S3']],
      ['S4', { plan: ['WW', 'WW'], debris: [['B1_0', 'R', 6, 0]] }, ['S4']],
      ['S5', { ...two, mode: 'carousel', carouselEvery: 3 }, ['S5']],
      ['S6', { elevator: { range: [0, 1], start: 0, dir: 1 } }, ['S6']],
      ['S7-R', { plan: ['??', 'WY'], hidden: [{ kind: 'repeat', period: 1 }] }, ['S7-R']],
      [
        'S7-M',
        { plan: [['WY'], ['?R']], hidden: [undefined, { kind: 'mirrorOf', segment: 0 }] },
        ['S1', 'S7-M'],
      ],
      ['S8', { pieces: [['B1_0', 'W', 0, 0, ['balloon']]] }, ['S8']],
      ['G-H', { gravity: { build: 'high' } }, ['G-H']],
      ['G-L', { gravity: { build: 'low' } }, ['G-L']],
    ];
    const covered = new Set<string>();
    for (const [name, extra, want] of cases) {
      expect(derive(extra), name).toEqual([...want].sort());
      for (const m of want) covered.add(m);
    }
    expect(covered.size).toBe(27);
  });
});

// =====================================================================================================================
// Round 3 — the K-05 box-height rule the round-2 movement fix touched, seen from the validator (L-10 / L-11 reach),
// an independent L-11 oracle, W6 paint routes, debris, K-32 examples and the LEVELS §0 / §2 claims about levels 1–5
// =====================================================================================================================

/** Box height of a shape from its cells (BRIEF §5 cells were checked against shapes.ts in round 1). */
const boxH = (id: ShapeId): number => Math.max(...shapeById(id).cells.map((c) => c.y)) + 1;
/** OBSTACLES Y5 / GDD K-44: heavy = width ≥ 3 or kind I5 / Q9. */
const isHeavyByText = (id: ShapeId): boolean => {
  const s = shapeById(id);
  return Math.max(...s.cells.map((c) => c.x)) + 1 >= 3 || s.kind === 'I5' || s.kind === 'Q9';
};

/**
 * GDD K-05 ("dikey hücre dizisi `10 − height` satırı aşamaz"), K-12 ("bloğun bütün satırları geçidin satır aralığında")
 * and OBSTACLES Y5 ("Duvar sınırını geçemez (ne serbest ne ray kipinde)"): over the wall / through some gap.
 */
function reachByText(
  id: ShapeId,
  height: number,
  gapSizes: readonly number[],
): { free: boolean; rail: boolean } {
  if (isHeavyByText(id)) return { free: false, rail: false };
  const h = boxH(id);
  return { free: h <= 10 - height, rail: gapSizes.some((size) => h <= size) };
}

describe('review round 3: K-05 box-height rule (round-2 movement fix) seen from the validator', () => {
  it('K-27 K-05 K-12 Y5 every shape × wall height 0–8 × gap size: L-10 supply, canReachSite and the drag engine (site nodes) agree with the K-05 / K-12 text', () => {
    let free = 0;
    let railOnly = 0;
    let never = 0;
    for (const s of SHAPES) {
      if (s.id === 'I5_90' || s.id === 'I5_270') continue; // forbidden in level data (K-44)
      for (let height = 0; height <= 8; height++) {
        // one static gap at row 0 of every legal size (K-04: y + size ≤ height − 1), or none
        const options: number[][] = [[]];
        for (let size = 1; size <= height - 1; size++) options.push([size]);
        for (const sizes of options) {
          const lvl = level({
            id: 41,
            wall: { height, gaps: sizes.map((size) => ({ type: 'static' as const, y: 0, size })) },
            plan: ['W.'],
            pieces: [[s.id, 'W', 0, 0]],
          });
          const where = `${s.id} height ${height} gap ${sizes.join() || '—'}`;
          const want = reachByText(s.id, height, sizes);
          const compiled = compile(lvl);
          const id = compiled.tutorialPieceIds.get('piece:0');
          if (id === undefined) throw new Error('piece:0 missing');
          const attempt = tryBeginDrag(createInitialState(compiled), id);
          if (!attempt.ok)
            throw new Error(`${where}: a lone block in an empty yard is not pickable (${attempt.reason})`);
          const kinds = new Set(
            attempt.session.reachableNodes().map((n) => attempt.session.classify(n).kind),
          );
          expect({ free: kinds.has('siteFree'), rail: kinds.has('siteRail') }, `${where}: engine`).toEqual(
            want,
          );
          const reach = want.free || want.rail;
          expect(canReachSite(s, lvl), `${where}: canReachSite`).toBe(reach);
          // plan `W.` needs 1 W cell: the block is the only supply (TECH L-10 "şantiyeye geçebilen ağır olmayan")
          expect(
            checkLevel(lvl, { only: ['L-10'] }).map((i) => i.code),
            `${where}: L-10`,
          ).toEqual(reach ? [] : ['material_short']);
          if (want.free) free++;
          else if (want.rail) railOnly++;
          else never++;
        }
      }
    }
    // the sweep really exercises all three outcomes
    expect(Math.min(free, railOnly, never)).toBeGreaterThan(50);
    // GDD K-05 example: height 8 I3_0 never crosses; height 7 it does (cells 7, 8, 9 ≥ 7)
    expect(reachByText('I3_0', 8, [])).toEqual({ free: false, rail: false });
    expect(reachByText('I3_0', 7, [])).toEqual({ free: true, rail: false });
  });

  it.each(LEVEL_IDS)(
    'K-05 K-12 LEVELS level %i: every solution step obeys the open height (over the wall: box height ≤ 10 − height) or K-12 (rail: block rows inside the gap rows)',
    (n) => {
      const doc = docLevel(n);
      const json = readLevelJson(n);
      const moves = docMoves(doc);
      expect(moves.length).toBeGreaterThan(0);
      for (const m of moves) {
        const h = boxH(m.shape);
        if (m.entry === 'overWall') {
          expect(h, `${m.text}: K-05`).toBeLessThanOrEqual(10 - json.wall.height);
        } else {
          const [, ly] = m.lands;
          const gate = json.wall.gaps.find((g) => g.y <= ly && ly + h - 1 <= g.y + g.size - 1);
          expect(gate, `${m.text}: K-12 rows ${ly}–${ly + h - 1}`).toBeDefined();
        }
        expect(isHeavyByText(m.shape), `${m.text}: Y5`).toBe(false);
      }
    },
  );
});

// --- independent L-11 oracle (GDD K-11, K-12, K-16 (1), K-34, K-05, Y5) -------------------------------------------------

interface TileBlock {
  readonly shape: ShapeId;
  readonly color: 'W' | 'Y';
  readonly seg: number;
}
interface TileCase {
  readonly height: number;
  readonly gaps: readonly { readonly y: number; readonly size: number }[];
  /** Rows per segment, top → bottom. */
  readonly plans: readonly (readonly string[])[];
  readonly blocks: readonly TileBlock[];
}

/**
 * Can every segment be built, one after another (segments mode), from the blocks delivered so far? A placement counts
 * when its cells are empty plan cells of the block colour (K-16 (1)), K-34 holds (every non-`.` plan cell below the
 * block's lowest cell in each of its columns is filled) and the block can get there: FREE (K-05 open height) dropped
 * from above, landing row `max_c(top(c) − altOfset_c)` (K-11), or on a rail through a gap that holds all block rows
 * (K-12), sliding in from the yard over empty site cells and held there ("düşmez"). Heavy blocks never (Y5).
 */
function tileOracle(c: TileCase): boolean {
  const plans = c.plans.map((rows) => ({
    h: rows.length,
    at: (x: number, y: number): string => rows[rows.length - 1 - y]?.[x] ?? '?',
  }));
  const key = (x: number, y: number): string => `${x},${y}`;
  const failed = new Set<string>();
  const dfs = (k: number, filled: ReadonlySet<string>, pool: readonly TileBlock[]): boolean => {
    const p = plans[k];
    if (!p) return true;
    let done = true;
    for (let y = 0; y < p.h; y++)
      for (let x = 0; x < 2; x++) if (p.at(x, y) !== '.' && !filled.has(key(x, y))) done = false;
    if (done) return dfs(k + 1, new Set(), [...pool, ...c.blocks.filter((b) => b.seg === k + 1)]);
    const memo = `${k}|${[...filled].sort().join(' ')}|${pool
      .map((b) => `${shapeById(b.shape).canonical}${b.color}`)
      .sort()
      .join(',')}`;
    if (failed.has(memo)) return false;
    const top = (x: number): number => {
      let t = 0;
      for (let y = 0; y < p.h; y++) if (filled.has(key(x, y))) t = y + 1;
      return t;
    };
    const tried = new Set<string>();
    for (let i = 0; i < pool.length; i++) {
      const b = pool[i];
      if (!b) continue;
      const s = shapeById(b.shape);
      const sig = `${s.canonical}${b.color}`;
      if (tried.has(sig) || isHeavyByText(b.shape)) continue;
      tried.add(sig);
      const h = boxH(b.shape);
      const w = Math.max(...s.cells.map((q) => q.x)) + 1;
      const freeOk = h <= 10 - c.height;
      for (let ax = 0; ax + w <= 2; ax++) {
        for (let ay = 0; ay + h <= p.h; ay++) {
          const cells = s.cells.map((q) => ({ x: ax + q.x, y: ay + q.y }));
          if (!cells.every((q) => p.at(q.x, q.y) === b.color && !filled.has(key(q.x, q.y)))) continue;
          const cols = [...new Set(cells.map((q) => q.x))];
          const lowest = (x: number): number => Math.min(...cells.filter((q) => q.x === x).map((q) => q.y));
          const supported = cols.every((x) => {
            for (let y = 0; y < lowest(x); y++)
              if (p.at(x, y) !== '.' && !filled.has(key(x, y))) return false;
            return true;
          });
          if (!supported) continue;
          const landing = Math.max(...cols.map((x) => top(x) - (lowest(x) - ay)));
          let reach = freeOk && landing === ay;
          if (!reach && c.gaps.some((g) => g.y <= ay && ay + h - 1 <= g.y + g.size - 1)) {
            reach = true;
            for (let tx = ax - 1; tx > -w; tx--)
              for (const q of s.cells) {
                const x = tx + q.x;
                if (x >= 0 && x < 2 && filled.has(key(x, ay + q.y))) reach = false;
              }
          }
          if (!reach) continue;
          const next = new Set(filled);
          for (const q of cells) next.add(key(q.x, q.y));
          if (
            dfs(
              k,
              next,
              pool.filter((_, j) => j !== i),
            )
          )
            return true;
        }
      }
    }
    failed.add(memo);
    return false;
  };
  return dfs(
    0,
    new Set(),
    c.blocks.filter((b) => b.seg === 0),
  );
}

/** Deterministic LCG (test data only). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return (s >>> 8) / 0x1000000;
  };
}

const TILE_POOL: readonly ShapeId[] = [
  'B1_0',
  'D2_0',
  'D2_90',
  'O4_0',
  'C3_0',
  'C3_90',
  'C3_180',
  'C3_270',
  'I3_0',
  'L4_0',
  'L4_180',
  'J4_0',
  'J4_180',
  'T4_0',
  'T4_180',
  'S4_0',
  'Z4_0',
  'I4_0',
];

/** A random 1–2 segment level: plans tiled by random blocks (plus `.` and bricks), then perturbed. */
function randomTileCase(rnd: () => number): TileCase {
  const pick = <T>(a: readonly T[]): T => {
    const v = a[Math.floor(rnd() * a.length)];
    if (v === undefined) throw new Error('empty pick');
    return v;
  };
  const colour = (): 'W' | 'Y' => (rnd() < 0.5 ? 'W' : 'Y');
  const S = rnd() < 0.3 ? 2 : 1;
  const blocks: TileBlock[] = [];
  const plans: string[][] = [];
  for (let k = 0; k < S; k++) {
    const ph = 1 + Math.floor(rnd() * 4);
    const grid: string[][] = Array.from({ length: ph }, () => ['', '']);
    for (let t = 0; t < 30; t++) {
      const id = pick(TILE_POOL);
      const s = shapeById(id);
      const w = Math.max(...s.cells.map((q) => q.x)) + 1;
      const h = boxH(id);
      if (w > 2 || h > ph) continue;
      const ax = Math.floor(rnd() * (3 - w));
      const ay = Math.floor(rnd() * (ph - h + 1));
      if (s.cells.some((q) => grid[ay + q.y]?.[ax + q.x] !== '')) continue;
      const c = colour();
      for (const q of s.cells) {
        const row = grid[ay + q.y];
        if (row) row[ax + q.x] = c;
      }
      blocks.push({ shape: id, color: c, seg: k });
    }
    for (const row of grid)
      for (let x = 0; x < 2; x++)
        if (row[x] === '') {
          if (rnd() < 0.5) row[x] = '.';
          else {
            const c = colour();
            row[x] = c;
            blocks.push({ shape: 'B1_0', color: c, seg: k });
          }
        }
    if (!grid.some((row) => row.some((ch) => ch !== '.'))) {
      const row0 = grid[0];
      if (row0) row0[0] = 'W';
      blocks.push({ shape: 'B1_0', color: 'W', seg: k });
    }
    plans.push(grid.map((row) => row.join('')).reverse());
  }
  const r = rnd();
  if (r < 0.2 && blocks.length > 1) blocks.splice(Math.floor(rnd() * blocks.length), 1);
  else if (r < 0.4) blocks.push({ shape: pick(TILE_POOL), color: colour(), seg: Math.floor(rnd() * S) });
  else if (r < 0.5 && S === 2) {
    const i = blocks.findIndex((b) => b.seg === 0);
    const b = blocks[i];
    if (b) blocks[i] = { ...b, seg: 1 };
  } else if (r < 0.6) {
    const i = Math.floor(rnd() * blocks.length);
    const b = blocks[i];
    if (b) blocks[i] = { ...b, shape: pick(TILE_POOL) };
  }
  // the schema wants at least one block per batch
  for (let k = 0; k < S; k++)
    if (!blocks.some((b) => b.seg === k)) blocks.push({ shape: 'B1_0', color: 'W', seg: k });
  const height = Math.floor(rnd() * 9);
  const gaps: { y: number; size: number }[] = [];
  if (rnd() < 0.6 && height >= 2) {
    const size = 1 + Math.floor(rnd() * Math.min(4, height - 1));
    gaps.push({ y: Math.floor(rnd() * (height - size)), size });
  }
  return { height, gaps, plans, blocks };
}

function tileSpec(c: TileCase): LevelSpec {
  const spec = (b: TileBlock): PieceSpec => [b.shape, b.color, 0, 0];
  return {
    id: 41,
    wall: { height: c.height, gaps: c.gaps.map((g) => ({ type: 'static' as const, ...g })) },
    plan: c.plans.map((rows) => [...rows]),
    pieces: c.blocks.filter((b) => b.seg === 0).map(spec),
    batches:
      c.plans.length > 1 ? [{ forSegment: 1, pieces: c.blocks.filter((b) => b.seg === 1).map(spec) }] : [],
  };
}

describe('review round 3: K-27 / K-34 tiling (TECH L-11) against an independent oracle', () => {
  it('K-27 K-34 TECH L-11 on 2 500 seeded random 1–2 segment levels (W1 gaps, wall 0–8, B1…I4): `untileable` exactly when the oracle finds no bottom-up build', () => {
    const rnd = lcg(20261006);
    let ok = 0;
    let bad = 0;
    const mismatches: string[] = [];
    for (let n = 0; n < 2500; n++) {
      const c = randomTileCase(rnd);
      const want = tileOracle(c);
      const got = run(tileSpec(c), ['L-11']);
      if (want) ok++;
      else bad++;
      const gotOk = got.length === 0;
      if (gotOk !== want || got.some((i) => i.code !== 'untileable' || i.severity !== 'error'))
        mismatches.push(`${JSON.stringify(c)} oracle ${want} L-11 ${JSON.stringify(got.map((i) => i.path))}`);
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
    // both verdicts are well represented
    expect(Math.min(ok, bad)).toBeGreaterThan(500);
  });

  it('K-34 TECH L-11 order matters: plan y0 `YY`, y1 `Y.`, y2 `YW` with L4_0 Y + B1 W is untileable (the W brick reaches (7,2) only by rail before the L4 blocks (6,2), and then hangs over the empty (7,0)); D2_90 + D2_0 Y instead is fine', () => {
    const wall = { height: 4, gaps: [{ type: 'static' as const, y: 0, size: 3 }] };
    const plan = ['YW', 'Y.', 'YY'];
    const l4: LevelSpec = {
      id: 41,
      wall,
      plan,
      pieces: [
        ['L4_0', 'Y', 0, 0],
        ['B1_0', 'W', 3, 0],
      ],
    };
    // material is exact (4 Y + 1 W) and an exact cover exists (L4_0 at (6,0), B1 at (7,2)) …
    expect(run(l4, ['L-10'])).toEqual([]);
    // … but no bottom-up order: L4 first closes the rail path, B1 first breaks K-34 in column 7
    expect(run(l4, ['L-11']).map((i) => [i.code, i.severity])).toEqual([['untileable', 'error']]);
    const pair: LevelSpec = {
      ...l4,
      pieces: [
        ['D2_90', 'Y', 0, 0],
        ['D2_0', 'Y', 2, 0],
        ['B1_0', 'W', 3, 0],
      ],
    };
    // D2_90 at y0, B1 W by rail at (7,2) over the window, D2_0 dropped into column 6 (lands on top(6) = 1)
    expect(run(pair, ['L-10', 'L-11'])).toEqual([]);
    // without the gap the W brick falls into the window (7,1) → untileable
    expect(codes(run({ ...pair, wall: { height: 4 } }, ['L-11']))).toEqual(['untileable']);
  });

  it('K-27 OBSTACLES W6 TECH L-11 a block painted at the paint gate keeps its colour and may then enter through a plain gap ("sahaya geri çekilse de boya kalıcıdır"): the level is tileable', () => {
    // height 8: I3_0 (3 tall) never crosses over the wall (K-05). Gap 0 = P paint gate rows 0–2, gap 1 = static rows 4–6.
    // Plan column 7: W rows 0–3 (two D2_0 W dropped over the wall), P rows 4–6; column 6 all `.`.
    // Route for the Y I3_0: half into the paint gate (rows 0–2) → painted P → back to the yard (W6 example: 1 move) →
    // rail through the static gap at rows 4–6 → (7,4)–(7,6), held by the scaffold (K-12), K-34 holds (rows 0–3 W).
    const spec = (color: ColorCode): LevelSpec => ({
      id: 41,
      wall: {
        height: 8,
        gaps: [
          { type: 'paint', y: 0, size: 3, color: 'P' },
          { type: 'static', y: 4, size: 3 },
        ],
      },
      plan: ['.P', '.P', '.P', '.W', '.W', '.W', '.W'],
      pieces: [
        ['I3_0', color, 0, 0],
        ['D2_0', 'W', 1, 0],
        ['D2_0', 'W', 2, 0],
      ],
    });
    // the data itself is fine: wall, material (the Y block counts for P, TECH L-10)
    expect(run(spec('Y'), ['L-09', 'L-10'])).toEqual([]);
    // a block that is P from the start uses the same static gap → tileable
    expect(run(spec('P'), ['L-11'])).toEqual([]);
    // the painted Y block reaches exactly the same cells through exactly the same gap
    expect(run(spec('Y'), ['L-11'])).toEqual([]);
  });
});

// --- debris, K-32 examples, K-02 / K-44 boundaries -------------------------------------------------------------------

describe('review round 3: debris, K-32 worked examples, boundaries', () => {
  it('K-27 debris is never supply ("moloz olmayan … sahaya taşınmış moloz arz değildir"): an R plan row with only R debris is material_short and untileable; one R yard block fixes both', () => {
    const base: LevelSpec = {
      id: 17,
      plan: ['RR', 'WW'],
      pieces: [['D2_90', 'W', 0, 0]],
      debris: [['D2_90', 'R', 6, 1]],
    };
    expect(run(base, ['L-10', 'L-11']).map((i) => [i.code, i.rule])).toEqual([
      ['material_short', 'K-27'],
      ['untileable', 'K-27'],
    ]);
    expect(
      run({ ...base, pieces: [...(base.pieces ?? []), ['D2_90', 'R', 2, 0]] }, ['L-10', 'L-11']),
    ).toEqual([]);
  });

  it('K-31 debris colours join the colour set: level 5 (limit 3) with plan W/Y/G and one R debris has 4 colours → too_many_colors', () => {
    const spec = (debrisColor: ColorCode): LevelSpec => ({
      id: 5,
      plan: ['WY', 'GG'],
      pieces: [['B1_0', 'W', 0, 0]],
      debris: [['B1_0', debrisColor, 6, 1]],
    });
    expect(levelColorSet(level(spec('R')))).toEqual(['W', 'Y', 'G', 'R']);
    expect(codes(run(spec('R'), ['L-06']))).toEqual(['too_many_colors']);
    expect(run(spec('G'), ['L-06'])).toEqual([]);
  });

  it('K-45/7 OBSTACLES S4 debris may stand on a `.` plan cell ("Bir `.` hücresindeki moloz", GDD E-43): no debris_misplaced', () => {
    const spec: LevelSpec = {
      id: 17,
      plan: ['WW', '.W'],
      pieces: [['D2_90', 'W', 0, 0]],
      debris: [['B1_0', 'R', 6, 0]],
    };
    expect(run(spec, ['L-13'])).toEqual([]);
    // still inside x 6–7 and the plan rows: one row higher is the top W row (fine), two rows higher is outside
    expect(run({ ...spec, debris: [['B1_0', 'R', 6, 1]] }, ['L-13'])).toEqual([]);
    expect(codes(run({ ...spec, debris: [['B1_0', 'R', 6, 2]] }, ['L-13']))).toEqual(['debris_misplaced']);
  });

  it('K-32 GDD examples: repeat p=2 `["??","??","YW","WY"]` resolves y2 = y0 = `WY`, y3 = y1 = `YW`; mirrorOf 0 of y0 `RW` is `WR`', () => {
    const W = COLOR_CODES.indexOf('W');
    const Y = COLOR_CODES.indexOf('Y');
    const R = COLOR_CODES.indexOf('R');
    const rep = compile(
      level({
        id: 27,
        plan: ['??', '??', 'YW', 'WY'],
        hidden: [{ kind: 'repeat', period: 2 }],
        pieces: [['B1_0', 'W', 0, 0]],
      }),
    ).segments[0];
    const row = (sy: number): (number | undefined)[] => [0, 1].map((sx) => rep?.planColors[sy * 2 + sx]);
    expect([row(0), row(1), row(2), row(3)]).toEqual([
      [W, Y],
      [Y, W],
      [W, Y],
      [Y, W],
    ]);
    const mir = compile(
      level({
        id: 29,
        plan: [['RW'], ['??']],
        hidden: [undefined, { kind: 'mirrorOf', segment: 0 }],
        pieces: [['B1_0', 'W', 0, 0]],
      }),
    ).segments[1];
    expect([mir?.planColors[0], mir?.planColors[1]]).toEqual([W, R]);
    // both are valid data (K-45/4)
    expect(
      run(
        {
          id: 29,
          plan: [['RW'], ['??']],
          hidden: [undefined, { kind: 'mirrorOf', segment: 0 }],
          pieces: [['B1_0', 'W', 0, 0]],
        },
        ['L-08'],
      ),
    ).toEqual([]);
  });

  it('K-32 a repeat chain that ends on `.` is invalid ("`.` hücresi hiçbir zaman gizli değildir"): `?W / ?W / .W` with p = 1', () => {
    const issues = run(
      {
        id: 27,
        plan: ['?W', '?W', '.W'],
        hidden: [{ kind: 'repeat', period: 1 }],
        pieces: [['B1_0', 'W', 0, 0]],
      },
      ['L-08'],
    );
    expect(codes(issues)).toEqual(['hidden_invalid']);
    expect(
      run(
        {
          id: 27,
          plan: ['?W', '?W', 'YW'],
          hidden: [{ kind: 'repeat', period: 1 }],
          pieces: [['B1_0', 'W', 0, 0]],
        },
        ['L-08'],
      ),
    ).toEqual([]);
  });

  it('K-02 the lower bound is exactly 39/48 ("en az %80\'i (≥ 39/48)"): 39 bricks or 38 bricks + 1 crate are valid, 38 bricks + 1 screw are not', () => {
    const fill = (spec: Partial<LevelSpec>): string[] =>
      run({ id: 26, plan: ['WW'], pieces: bricks(39), ...spec }, ['L-03']).map((i) => i.code);
    expect(fill({})).toEqual([]);
    expect(fill({ pieces: bricks(38, ['5,7']), obstacles: [{ type: 'crate', x: 5, y: 7, hp: 1 }] })).toEqual(
      [],
    );
    expect(fill({ pieces: bricks(38, ['5,7']), obstacles: [{ type: 'cement_bag', x: 5, y: 7 }] })).toEqual(
      [],
    );
    expect(fill({ pieces: bricks(38), obstacles: [{ type: 'screw', x: 0, y: 0 }] })).toEqual([
      'yard_fill_low',
    ]);
  });

  it('K-44 kinds per story chapter hold for debris too: I3_0 debris in level 10 is shape_locked (build.debris[0]), in level 11 valid', () => {
    const debris = (id: number): [string, string][] =>
      run(
        {
          id,
          plan: ['WW', 'WW', 'WW'],
          pieces: [['B1_0', 'W', 0, 0]],
          debris: [['I3_0', 'R', 6, 0]],
        },
        ['L-04'],
      ).map((i) => [i.code, i.path]);
    expect(debris(10)).toEqual([['shape_locked', 'build.debris[0]']]);
    expect(debris(11)).toEqual([]);
  });
});

// --- LEVELS §0 tables and §2 block roles against the validator, the data and the engine -----------------------------

describe('review round 3: LEVELS §0 tables and §2 block roles', () => {
  it('K-31 K-44 LEVELS §0 unlock table (colour pool, colours per level, shapes) is what the validator enforces at every chapter boundary', () => {
    const lines = LEVELS_MD.split('\n').filter((l) => /^\| \d [^|]+ \| \d+–\d+ \|/.test(l));
    expect(lines.length).toBe(5);
    let kinds: ShapeKind[] = [];
    for (const line of lines) {
      const cols = line.split('|').map((c) => c.trim());
      const chapter = Number(/^(\d)/.exec(cols[1] ?? '')?.[1]);
      const [first, last] = (cols[2] ?? '').split('–').map(Number) as [number, number];
      expect([first, last], `chapter ${chapter} range`).toEqual([chapter * 10 - 9, chapter * 10]);
      // colours: "W (1), Y (1), G (2), R (4)" / "+ O, C (11)" / "hepsi"
      for (const m of (cols[3] ?? '').matchAll(/([A-Z](?:, [A-Z])*) \((\d+)\)/g)) {
        const at = Number(m[2]);
        for (const c of (m[1] ?? '').split(', ') as ColorCode[]) {
          const spec = (id: number): LevelSpec => ({ id, plan: [`${c}${c}`], pieces: [['B1_0', c, 0, 0]] });
          expect(run(spec(at), ['L-07']), `${c} at ${at}`).toEqual([]);
          if (at > 1)
            expect(codes(run(spec(at - 1), ['L-07'])), `${c} at ${at - 1}`).toEqual(['color_locked']);
        }
      }
      // colours per level: limit passes, limit + 1 fails (L-06 does not look at unlocks)
      const limit = Number(cols[4]);
      const palette: ColorCode[] = ['W', 'Y', 'G', 'R', 'O', 'C', 'B', 'P'];
      const plan = (k: number): string[] => {
        const cs = palette.slice(0, k);
        const rows: string[] = [];
        for (let i = 0; i < cs.length; i += 2) rows.push(`${cs[i] ?? 'W'}${cs[i + 1] ?? cs[i] ?? 'W'}`);
        return rows;
      };
      for (const id of [first, last]) {
        expect(
          run({ id, plan: plan(limit), pieces: [['B1_0', 'W', 0, 0]] }, ['L-06']),
          `${id}: ${limit}`,
        ).toEqual([]);
        expect(
          codes(run({ id, plan: plan(limit + 1), pieces: [['B1_0', 'W', 0, 0]] }, ['L-06'])),
          `${id}: ${limit + 1}`,
        ).toEqual(['too_many_colors']);
      }
      // shapes: "B1, D2, O4, C3; 8'den itibaren ağır I5, Q9" / "+ I3, L4, J4" / "hepsi"
      const shapeText = (cols[5] ?? '').split(';')[0] ?? '';
      const fresh =
        shapeText === 'hepsi' ? [] : (shapeText.match(/[A-Z]\d/g) ?? []).map((k) => k as ShapeKind);
      for (const kind of fresh) {
        const piece = (id: number): LevelSpec => ({
          id,
          plan: ['WW'],
          pieces: [[`${kind}_0` as ShapeId, 'W', 0, 0]],
        });
        if (kind === 'I5' || kind === 'Q9') continue; // heavy: level 8, round 1
        expect(run(piece(first), ['L-04']), `${kind} at ${first}`).toEqual([]);
        if (first > 1)
          expect(codes(run(piece(first - 1), ['L-04'])), `${kind} at ${first - 1}`).toEqual(['shape_locked']);
      }
      kinds = [...kinds, ...fresh];
    }
    expect([...kinds].sort()).toEqual(
      SHAPE_KINDS.filter((k) => k !== 'I5' && k !== 'Q9')
        .slice()
        .sort(),
    );
  });

  it('K-45/9 LEVELS §0 "Tanıtım bölümü" list: among levels 1–5 exactly the listed ones (3, 4, 5) derive a new mechanic; 1 and 2 teach only through tutorial[]', () => {
    const para = /\*\*Tanıtım bölümü\*\* = [^(]*\(OBSTACLES "Veri imzası"; ([^)]*)\)/.exec(
      LEVELS_MD.replace(/\n/g, ' '),
    );
    expect(para).not.toBeNull();
    const listed = new Set<number>();
    for (const part of (para?.[1] ?? '').split(',').map((p) => p.trim())) {
      const range = /^(\d+)–(\d+)$/.exec(part);
      if (range) for (let i = Number(range[1]); i <= Number(range[2]); i++) listed.add(i);
      else listed.add(Number(part));
    }
    const history = new Set<MechanicId>();
    for (const n of LEVEL_IDS) {
      const res = validateLevelJson(readLevelJson(n));
      if (!res.level) throw new Error(`level ${n} fails the schema`);
      const fresh = deriveMechanics(res.level).filter((m) => !history.has(m));
      expect(fresh.length === 1, `level ${n}: new ${fresh.join() || '—'}`).toBe(listed.has(n));
      for (const m of deriveMechanics(res.level)) history.add(m);
    }
    for (const n of [1, 2]) {
      const json = readLevelJson(n);
      expect(json.teaches, `level ${n}`).toBeUndefined();
      expect((json.tutorial ?? []).length, `level ${n}`).toBeGreaterThan(0);
    }
  });

  describe.each(LEVEL_IDS)('LEVELS §2 Bölüm %i block roles', (n) => {
    const doc = docLevel(n);
    const roles = new Map<string, string>();
    const start = LEVELS_MD.indexOf(`### Bölüm ${n} — `);
    const end = LEVELS_MD.indexOf('\n### ', start + 1);
    for (const line of LEVELS_MD.slice(start, end).split('\n')) {
      const m = /^\| `([^`]+)` \| `[A-Z][0-9]_\d+` \| [A-Z] \| \(\d+,\d+\) \| (.*) \|$/.exec(line);
      if (m) roles.set(m[1] ?? '', m[2] ?? '');
    }

    it(`K-27 level ${n}: the "hedef" (target) blocks are exactly the batch-0 blocks the LEVELS solution moves; the rest are decoys or filler`, () => {
      expect(roles.size).toBe(doc.pieces.length);
      const targets = [...roles].filter(([, r]) => r.startsWith('hedef')).map(([l]) => l);
      const moved = docMoves(doc)
        .map((m) => m.ref)
        .filter((ref) => /^piece:\d+$/.test(ref))
        .map((ref) => doc.pieces[Number(ref.slice(6))]?.letter);
      expect([...new Set(moved)].sort()).toEqual(targets.sort());
    });

    it(`K-09 level ${n}: every block marked "başta tutulabilir" has a free unit step on the start board, and the drag engine lets it be picked`, () => {
      const json = readLevelJson(n);
      const loaded = loadLevel(json);
      if (!loaded.ok) throw new Error(`level ${n} does not load`);
      const state = createInitialState(loaded.level);
      const occupied = new Map<string, number>();
      batchOf(json, 0).pieces.forEach((p, i) => {
        for (const c of cellsOf(p.shape, p.x, p.y)) occupied.set(c, i);
      });
      const claimed = [...roles].filter(([, r]) => r.includes('başta tutulabilir')).map(([l]) => l);
      for (const letter of claimed) {
        const i = doc.pieces.findIndex((p) => p.letter === letter);
        const p = batchOf(json, 0).pieces[i];
        if (!p) throw new Error(`no block ${letter}`);
        // K-09 (a): one unit translation onto empty cells of the 8 × 10 grid (K-01) that K-08 allows: cells that cross
        // the boundary into the (empty) site need y ≥ height (K-05) — or, on a right step, every block row inside one
        // gap (K-12 rail).
        const cells = shapeById(p.shape).cells;
        const free = [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ].some(([dx = 0, dy = 0]) => {
          const moved = cells.map((c) => ({ x: p.x + c.x + dx, y: p.y + c.y + dy }));
          const empty = moved.every((c) => {
            const other = occupied.get(cellKey(c.x, c.y));
            return inGrid(c.x, c.y) && (other === undefined || other === i);
          });
          const crossing = moved.filter((c) => c.x >= 6);
          const ys = moved.map((c) => c.y);
          const rail =
            dx === 1 &&
            json.wall.gaps.some((g) => g.y <= Math.min(...ys) && Math.max(...ys) <= g.y + g.size - 1);
          return empty && (crossing.every((c) => c.y >= json.wall.height) || rail);
        });
        expect(free, `block ${letter}: free unit step`).toBe(true);
        const id = loaded.level.tutorialPieceIds.get(`piece:${i}`);
        if (id === undefined) throw new Error(`piece:${i} missing`);
        expect(tryBeginDrag(state, id).ok, `block ${letter}: tryBeginDrag`).toBe(true);
      }
    });
  });
});
