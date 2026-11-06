import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHECK_IDS,
  RUNTIME_CHECKS,
  canReachSite,
  checkLevel,
  levelColorSet,
  materialShortfall,
  validateLevelJson,
} from '../../../src/core/level/logic.ts';
import type { Issue, LogicContext } from '../../../src/core/level/logic.ts';
import type { LevelData, MechanicId } from '../../../src/core/level/schema.ts';
import { mulberry32 } from '../../../src/core/rng.ts';
import { shapeById } from '../../../src/core/shapes.ts';
import { COLOR_CODES } from '../../../src/core/types.ts';
import type { ColorCode } from '../../../src/core/types.ts';
import { level, loadFixture } from '../../fixtures/builders.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..');
import type { LevelSpec } from '../../fixtures/builders.ts';

interface Case {
  /** Test name: rule id + code + short description. */
  readonly name: string;
  /** File in tests/fixtures/levels/invalid/. */
  readonly file: string;
  readonly code: string;
  readonly rule: string;
  readonly severity?: 'error' | 'warn';
  /** Other codes the fixture is allowed to raise (e.g. a material shortage is also untileable). */
  readonly also?: readonly string[];
  readonly ctx?: LogicContext;
}

const I18N = { tr: new Set(['tut.l4.window']), en: new Set(['tut.l4.window']) };
const prev = (...ids: MechanicId[]): ReadonlySet<MechanicId> => new Set(ids);

const CASES: readonly Case[] = [
  {
    name: 'K-45/1 schema_invalid unknown key',
    file: 'schema_invalid',
    code: 'schema_invalid',
    rule: 'K-45/1',
  },
  {
    name: 'K-45/1 chapter_mismatch chapter ≠ ceil(id/10)',
    file: 'chapter_mismatch',
    code: 'chapter_mismatch',
    rule: 'K-45/1',
  },
  { name: 'K-45/2 overlap two blocks on one cell', file: 'overlap', code: 'overlap', rule: 'K-45/2' },
  { name: 'K-45/2 out_of_yard block crosses x 5', file: 'out_of_yard', code: 'out_of_yard', rule: 'K-45/2' },
  { name: 'K-45/2 yard_fill_low 36/48 < 80%', file: 'yard_fill_low', code: 'yard_fill_low', rule: 'K-45/2' },
  {
    name: 'K-45/5 shape_forbidden I5_90 (K-44)',
    file: 'shape_forbidden',
    code: 'shape_forbidden',
    rule: 'K-45/5',
  },
  {
    name: 'K-44 Q9 in level 7 shape_locked',
    file: 'shape_locked_q9_level7',
    code: 'shape_locked',
    rule: 'K-45/5',
  },
  {
    name: 'K-44 I3 in chapter 1 shape_locked',
    file: 'shape_locked_i3_chapter1',
    code: 'shape_locked',
    rule: 'K-45/5',
  },
  { name: 'K-45/4 row_width plan row of 3 characters', file: 'row_width', code: 'row_width', rule: 'K-45/4' },
  {
    name: 'K-45/4 elevator_overflow h + b > 8',
    file: 'elevator_overflow',
    code: 'elevator_overflow',
    rule: 'K-45/4',
  },
  {
    name: 'K-45/4 too_many_colors from paint gate color',
    file: 'too_many_colors_paint_gate',
    code: 'too_many_colors',
    rule: 'K-45/4',
  },
  {
    name: 'K-45/4 color_locked O before level 11',
    file: 'color_locked',
    code: 'color_locked',
    rule: 'K-45/4',
  },
  {
    name: 'K-45/4 hidden_invalid ? without hidden rule',
    file: 'hidden_invalid',
    code: 'hidden_invalid',
    rule: 'K-45/4',
  },
  {
    name: 'K-45/3 gap_touches_top y + size > height − 1',
    file: 'gap_touches_top',
    code: 'gap_touches_top',
    rule: 'K-45/3',
  },
  {
    name: 'K-45/3 gap_overlap across slider range',
    file: 'gap_overlap_slider_range',
    code: 'gap_overlap',
    rule: 'K-45/3',
  },
  {
    name: 'K-45/3 shutter_phase phase ≥ 2·period',
    file: 'shutter_phase',
    code: 'shutter_phase',
    rule: 'K-45/3',
  },
  { name: 'K-45/3 slider_range a == b', file: 'slider_range_a_eq_b', code: 'slider_range', rule: 'K-45/3' },
  {
    name: 'K-45/3 key_missing locked gap without key',
    file: 'key_missing',
    code: 'key_missing',
    rule: 'K-45/3',
  },
  {
    name: 'K-45/3 fan_unused warns without 1-wide blocks',
    file: 'fan_unused',
    code: 'fan_unused',
    rule: 'K-45/3',
    severity: 'warn',
  },
  {
    name: 'K-27 material_short cumulative',
    file: 'material_short_cumulative',
    code: 'material_short',
    rule: 'K-27',
    also: ['untileable'],
  },
  {
    name: 'K-27 untileable cell above a window needs bridge, rail or balloon',
    file: 'untileable',
    code: 'untileable',
    rule: 'K-27',
  },
  {
    name: 'K-25 batch_invalid x beyond yard',
    file: 'batch_invalid_x_beyond_yard',
    code: 'batch_invalid',
    rule: 'K-25',
  },
  {
    name: 'K-45/7 debris_misplaced above the plan',
    file: 'debris_misplaced',
    code: 'debris_misplaced',
    rule: 'K-45/7',
  },
  {
    name: 'K-45/6 hidden_item_exposed screw not covered',
    file: 'hidden_item_exposed',
    code: 'hidden_item_exposed',
    rule: 'K-45/6',
  },
  {
    name: 'K-45/6 hidden_item_stacked two screws in one cell',
    file: 'hidden_item_stacked',
    code: 'hidden_item_stacked',
    rule: 'K-45/6',
  },
  {
    name: 'K-45/6 goal_count_too_high clear crate 2 with 1 crate',
    file: 'goal_count_too_high',
    code: 'goal_count_too_high',
    rule: 'K-45/6',
  },
  {
    name: 'K-45/6 goal_build_missing',
    file: 'goal_build_missing',
    code: 'goal_build_missing',
    rule: 'K-45/6',
  },
  {
    name: 'K-45/9 teaches must equal derived new mechanic',
    file: 'teaches_mismatch',
    code: 'teaches_mismatch',
    rule: 'K-45/9',
    ctx: { previousMechanics: prev() },
  },
  {
    name: 'K-45/9 size-1 gap in level 4 is too_many_new_mechanics',
    file: 'too_many_new_mechanics_size1_gap_level4',
    code: 'too_many_new_mechanics',
    rule: 'K-45/9',
    ctx: { previousMechanics: prev('W1') },
  },
  {
    name: 'GDD 14.1 tut_key_missing text key not in tr/en',
    file: 'tut_key_missing',
    code: 'tut_key_missing',
    rule: 'GDD 14.1',
    ctx: { i18nKeys: I18N },
  },
  {
    name: 'GDD 14.1/5 tut_highlight_invalid batch piece without startOn',
    file: 'tut_highlight_batch_piece_without_startOn',
    code: 'tut_highlight_invalid',
    rule: 'GDD 14.1',
  },
  {
    name: 'GDD 14.1/5 tut_highlight_invalid startOn piece not in first mortar batch',
    file: 'tut_highlight_startOn_not_first_mortar_batch',
    code: 'tut_highlight_invalid',
    rule: 'GDD 14.1',
  },
  {
    name: 'GDD 14 tut_highlight_invalid debris index out of range',
    file: 'tut_highlight_debris_out_of_range',
    code: 'tut_highlight_invalid',
    rule: 'GDD 14.1',
  },
  {
    name: 'GDD 14.1/4a tut_highlight_invalid required step without piece or debris',
    file: 'tut_highlight_required_without_piece',
    code: 'tut_highlight_invalid',
    rule: 'GDD 14.1',
  },
  {
    name: 'GDD 14.1 tut_done_invalid obstacleHit crate without crate',
    file: 'tut_done_obstaclehit_without_crate',
    code: 'tut_done_invalid',
    rule: 'GDD 14.1',
  },
  {
    name: 'GDD 14.1 tut_done_invalid steered without low gravity',
    file: 'tut_done_steered_without_low_gravity',
    code: 'tut_done_invalid',
    rule: 'GDD 14.1',
  },
  {
    name: 'GDD 14.1 tut_done_invalid startOn deliveryDone flag without such block',
    file: 'tut_done_startOn_flag_without_block',
    code: 'tut_done_invalid',
    rule: 'GDD 14.1',
  },
  {
    name: 'GDD 14.1/4a tut_done_invalid debris-only required step with placementCorrect',
    file: 'tut_done_debris_only_placementCorrect',
    code: 'tut_done_invalid',
    rule: 'GDD 14.1',
  },
  {
    name: 'LEVELS 0 difficulty_sawtooth warns for level 10 not hard',
    file: 'difficulty_sawtooth',
    code: 'difficulty_sawtooth',
    rule: 'LEVELS 0',
    severity: 'warn',
  },
  {
    name: 'K-45/5 flag_combo_forbidden glass + balloon (K-21)',
    file: 'flag_combo_forbidden',
    code: 'flag_combo_forbidden',
    rule: 'K-45/5',
  },
  { name: 'K-24 elevator_range a ≥ b', file: 'elevator_range', code: 'elevator_range', rule: 'K-24' },
  {
    name: 'K-23 carousel_every_missing',
    file: 'carousel_every_missing',
    code: 'carousel_every_missing',
    rule: 'K-23',
  },
  { name: 'Y4 wet_moves_missing', file: 'wet_moves_missing', code: 'wet_moves_missing', rule: 'Y4' },
];

const codes = (issues: readonly Issue[]): string[] => [...new Set(issues.map((i) => i.code))].sort();

describe('K-45 invalid fixtures (tests/fixtures/levels/invalid)', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const { issues } = validateLevelJson(loadFixture('invalid', c.file), c.ctx ?? {});
      const hit = issues.filter((i) => i.code === c.code);
      expect(hit.length, JSON.stringify(issues)).toBeGreaterThan(0);
      for (const i of hit) {
        expect(i.rule).toBe(c.rule);
        expect(i.severity).toBe(c.severity ?? 'error');
      }
      expect(codes(issues)).toEqual([...new Set([c.code, ...(c.also ?? [])])].sort());
    });
  }

  it('K-45/1 id_mismatch when the file name number differs', () => {
    const { issues } = validateLevelJson(loadFixture('valid', 'base'), { fileId: 5 });
    expect(codes(issues)).toEqual(['id_mismatch']);
    expect(issues[0]?.rule).toBe('K-45/1');
  });

  it('K-45/1 id_mismatch when id is outside 1–50', () => {
    const json = { ...(loadFixture('valid', 'base') as object), id: 51, chapter: 5 };
    const { issues } = validateLevelJson(json);
    expect(issues.map((i) => i.code)).toContain('id_mismatch');
  });

  it('every invalid fixture file has a case', async () => {
    const { readdirSync } = await import('node:fs');
    const { fixturePath } = await import('../../fixtures/builders.ts');
    const files = readdirSync(fixturePath('invalid')).map((f) => f.replace(/\.json$/, ''));
    expect(files.sort()).toEqual(CASES.map((c) => c.file).sort());
  });
});

describe('K-45 valid fixtures (tests/fixtures/levels/valid)', () => {
  const ctx: LogicContext = {
    previousMechanics: prev(
      ...(['W1', 'S1', 'S2', 'S4', 'Y5', 'Y1', 'Y6', 'G-H', 'W4', 'W5', 'Y2', 'Y7'] as const),
    ),
  };
  it('K-45 base fixture passes every check', () => {
    expect(validateLevelJson(loadFixture('valid', 'base'), { previousMechanics: prev() }).issues).toEqual([]);
  });
  it('K-44 Q9 in level 8 valid', () => {
    expect(
      validateLevelJson(loadFixture('valid', 'q9_level8'), { previousMechanics: prev() }).issues,
    ).toEqual([]);
  });
  it('K-42 screw under block is not overlap', () => {
    expect(
      validateLevelJson(loadFixture('valid', 'screw_under_block'), { previousMechanics: prev() }).issues,
    ).toEqual([]);
  });
  it('GDD 14.1/4a required debris-only yardMove step is valid', () => {
    expect(validateLevelJson(loadFixture('valid', 'debris_required_yardmove'), ctx).issues).toEqual([]);
  });
  it('GDD 14.1/5 startOn mortar delivery with first mortar batch piece is valid', () => {
    const r = validateLevelJson(loadFixture('valid', 'startOn_first_mortar_batch'), {
      previousMechanics: new Set([...(ctx.previousMechanics ?? []), 'Y8']),
    });
    expect(r.issues).toEqual([]);
  });
});

describe('K-45 logic details', () => {
  it('K-45/2 yard fill threshold is 80% inclusive (39/48 passes, 38/48 fails)', () => {
    const rowOf = (y: number): ['B1_0', 'W', number, number][] =>
      [0, 1, 2, 3, 4, 5].map((x) => ['B1_0', 'W', x, y] as ['B1_0', 'W', number, number]);
    const full = [0, 1, 2, 3, 4, 5].flatMap(rowOf); // 36 cells
    const fill = (n: number): ['B1_0', 'W', number, number][] => [...full, ...rowOf(6).slice(0, n)];
    const run = (n: number): string[] =>
      checkLevel(level({ id: 1, plan: ['WW'], pieces: fill(n) }), { only: ['L-03'] }).map((i) => i.code);
    expect(run(3)).toEqual([]); // 39
    expect(run(2)).toEqual(['yard_fill_low']); // 38
  });

  it('K-45/1 seed is optional (compile default, no issue)', () => {
    const json = { ...(loadFixture('valid', 'base') as Record<string, unknown>) };
    delete json.seed;
    expect(validateLevelJson(json, { previousMechanics: prev() }).issues).toEqual([]);
  });

  it('K-45/4 colour set holds plan, every block, debris and paint gate colours (K-31)', () => {
    const lvl = level({
      id: 22,
      wall: { height: 4, gaps: [{ type: 'paint', y: 0, size: 2, color: 'P' }] },
      plan: ['YY'],
      pieces: [['B1_0', 'W', 0, 0]],
      batches: [],
      debris: [['B1_0', 'G', 6, 0]],
    });
    expect(levelColorSet(lvl)).toEqual(['W', 'Y', 'G', 'P']);
  });

  it('K-27 moved debris is not supply', () => {
    const lvl = level({
      id: 17,
      plan: ['WW', 'WW'],
      pieces: [['D2_0', 'W', 0, 0]],
      debris: [['D2_0', 'W', 7, 0]],
    });
    expect(checkLevel(lvl, { only: ['L-10'] }).map((i) => i.code)).toEqual(['material_short']);
  });

  it('K-27 paint gate colour counts once per block (flow, not double counting)', () => {
    // One 4-cell block can be Y itself or P after the paint gate, never both.
    const block = { forSegment: 0, color: 'Y' as const, cells: 4, alts: ['P' as const] };
    expect(materialShortfall({ Y: 4 }, [block])).toEqual([]);
    expect(materialShortfall({ P: 4 }, [block])).toEqual([]);
    // Best assignment: the block stays Y (1 cell uncovered) rather than turning P (4 cells uncovered).
    expect(materialShortfall({ Y: 4, P: 1 }, [block])).toEqual(['P']);
    expect(materialShortfall({ Y: 2, P: 2 }, [block, { ...block, cells: 2 }])).toEqual([]);
  });

  it('K-27 TECH L-10 "her blok bir kez": a block supplies one colour as a whole, never a cell split', () => {
    const block = { forSegment: 0, color: 'Y' as const, cells: 4, alts: ['P' as const] };
    // 4 cells as Y or as P, never 2 Y + 2 P (a cell-split flow would accept this).
    expect(materialShortfall({ Y: 2, P: 2 }, [block])).toEqual(['P']);
    // Total supply 6 = demand 6, but no whole-block split gives 3 + 3.
    expect(materialShortfall({ Y: 3, P: 3 }, [block, { ...block, cells: 2 }])).toEqual(['P']);
    // A colour that is short on its own is always reported, whatever the other blocks do.
    const fixedW = { forSegment: 0, color: 'W' as const, cells: 2, alts: [] };
    expect(materialShortfall({ W: 3, Y: 4 }, [fixedW, block])).toEqual(['W']);
    expect(
      materialShortfall({ W: 2, Y: 4, P: 4 }, [
        fixedW,
        block,
        { ...block, color: 'P' as const, alts: ['Y' as const] },
      ]),
    ).toEqual([]);
    // Same verdict in a level: paint gate P (rows 1–2), plan PP over YY, one O4 Y.
    const lvl = level({
      id: 22,
      wall: { height: 6, gaps: [{ type: 'paint', y: 1, size: 2, color: 'P' }] },
      plan: ['PP', 'YY'],
      pieces: [['O4_0', 'Y', 0, 0]],
    });
    expect(checkLevel(lvl, { only: ['L-10'] }).map((i) => i.code)).toEqual(['material_short']);
  });

  it('K-27 whole-block assignment agrees with brute force on 400 seeded random demands (≤ 9 blocks)', () => {
    const rng = mulberry32(0x6b27);
    const pick = <T>(xs: readonly T[]): T => xs[rng.nextInt(xs.length)] as T;
    const palette: readonly ColorCode[] = ['W', 'Y', 'P', 'R'];
    for (let round = 0; round < 400; round++) {
      const gates = [...new Set([pick(palette), pick(palette)])].slice(0, 1 + rng.nextInt(2));
      const blocks = Array.from({ length: 1 + rng.nextInt(9) }, () => ({
        forSegment: 0,
        color: pick(palette),
        cells: 1 + rng.nextInt(4),
        alts: rng.nextInt(2) === 0 ? gates : [],
      }));
      const demand: Partial<Record<ColorCode, number>> = {};
      for (const c of palette) if (rng.nextInt(3) > 0) demand[c] = rng.nextInt(9);
      // Brute force: every block takes one of its colours as a whole.
      let feasible = false;
      const walk = (i: number, got: Partial<Record<ColorCode, number>>): void => {
        if (feasible) return;
        const b = blocks[i];
        if (b === undefined) {
          feasible = COLOR_CODES.every((c) => (got[c] ?? 0) >= (demand[c] ?? 0));
          return;
        }
        for (const c of new Set([b.color, ...b.alts])) walk(i + 1, { ...got, [c]: (got[c] ?? 0) + b.cells });
      };
      walk(0, {});
      const short = materialShortfall(demand, blocks);
      expect(short.length === 0, JSON.stringify({ demand, blocks, short })).toBe(feasible);
      for (const c of short) expect(demand[c] ?? 0).toBeGreaterThan(0);
      // A colour whose whole eligible supply is too small is always named.
      for (const c of palette) {
        const supply = blocks
          .filter((b) => b.color === c || b.alts.includes(c))
          .reduce((n, b) => n + b.cells, 0);
        if ((demand[c] ?? 0) > supply) expect(short).toContain(c);
      }
    }
  });

  it('K-27 untileable fixture becomes tileable with a 2-wide bridge over the window', () => {
    const json = loadFixture('invalid', 'untileable') as { yard: { batches: { pieces: unknown[] }[] } };
    // L-10/L-11 only look at the supply, not at yard positions: add one horizontal W lintel.
    json.yard.batches[0]?.pieces.push({ shape: 'D2_90', color: 'W', x: 0, y: 0 });
    expect(validateLevelJson(json, { only: ['L-10', 'L-11'] }).issues).toEqual([]);
  });

  it('K-27 rail through an aligned gap makes the cell above a window tileable', () => {
    // Plan WW / W. / WW needs three single bricks; (7,2) sits above the window (7,1).
    const make = (gaps: unknown[]): unknown => {
      const json = loadFixture('invalid', 'untileable') as {
        wall: { height: number; gaps: unknown[] };
        yard: { batches: { pieces: unknown[] }[] };
      };
      json.yard.batches[0]?.pieces.push({ shape: 'B1_0', color: 'W', x: 0, y: 0 });
      json.wall = { height: 4, gaps };
      return json;
    };
    // FREE drop in column 7 lands in the window: still untileable.
    expect(validateLevelJson(make([]), { only: ['L-11'] }).issues.map((i) => i.code)).toEqual(['untileable']);
    // A rail at row 2 holds the brick above the window (K-12).
    expect(validateLevelJson(make([{ type: 'static', y: 2, size: 1 }]), { only: ['L-11'] }).issues).toEqual(
      [],
    );
  });

  it('K-27 W6 S-21 a painted block keeps its colour and may then use any gap except a paint gate of another colour', () => {
    // Height 8: the 3-tall I3_0 never crosses the wall (K-05). Gap 0 = P paint gate rows 0–2; gap 1 rows 4–6.
    // Plan column 7: W rows 0–3 (two D2_0 W over the wall), P rows 4–6. The Y I3_0 half-enters the P gate (painted P,
    // "sahaya geri çekilse de boya kalıcıdır"), then rides gap 1 to (7,4)–(7,6).
    type Gap = NonNullable<NonNullable<LevelSpec['wall']>['gaps']>[number];
    const make = (gap1: Gap) =>
      level({
        id: 41,
        wall: { height: 8, gaps: [{ type: 'paint', y: 0, size: 3, color: 'P' }, gap1] },
        plan: ['.P', '.P', '.P', '.W', '.W', '.W', '.W'],
        pieces: [
          ['I3_0', 'Y', 0, 0],
          ['D2_0', 'W', 1, 0],
          ['D2_0', 'W', 2, 0],
        ],
      });
    const tile = (gap1: Gap): string[] => checkLevel(make(gap1), { only: ['L-11'] }).map((i) => i.code);
    expect(tile({ type: 'static', y: 4, size: 3 })).toEqual([]);
    // A second P paint gate keeps the colour P.
    expect(tile({ type: 'paint', y: 4, size: 3, color: 'P' })).toEqual([]);
    // An R paint gate repaints the block R on entry (last entered gate wins, E-39): no P route to rows 4–6.
    expect(tile({ type: 'paint', y: 4, size: 3, color: 'R' })).toEqual(['untileable']);
  });

  it('K-05 K-12 canReachSite: over the wall by box height or through a gap, never heavy', () => {
    const lvl8 = level({ id: 8, wall: { height: 8 }, plan: ['WW'], pieces: [['B1_0', 'W', 0, 0]] });
    expect(canReachSite(shapeById('D2_0'), lvl8)).toBe(true);
    expect(canReachSite(shapeById('I3_0'), lvl8)).toBe(false);
    expect(canReachSite(shapeById('S4_0'), lvl8)).toBe(false);
    expect(canReachSite(shapeById('I3_90'), lvl8)).toBe(false);
    const withGap = level({
      id: 8,
      wall: { height: 8, gaps: [{ type: 'static', y: 2, size: 3 }] },
      plan: ['WW'],
      pieces: [['B1_0', 'W', 0, 0]],
    });
    expect(canReachSite(shapeById('I3_0'), withGap)).toBe(true);
  });

  it('K-45 runtime subset is L-02, L-04, L-05, L-08, L-09, L-24, L-25, L-26', () => {
    expect(RUNTIME_CHECKS).toEqual(['L-02', 'L-04', 'L-05', 'L-08', 'L-09', 'L-24', 'L-25', 'L-26']);
    const { issues } = validateLevelJson(loadFixture('invalid', 'yard_fill_low'), { only: RUNTIME_CHECKS });
    expect(issues).toEqual([]);
    const gap = validateLevelJson(loadFixture('invalid', 'gap_touches_top'), { only: RUNTIME_CHECKS });
    expect(gap.issues.map((i) => i.code)).toEqual(['gap_touches_top']);
  });

  it('K-45 every issue carries code, rule, check and path', () => {
    for (const c of CASES) {
      for (const i of validateLevelJson(loadFixture('invalid', c.file), c.ctx ?? {}).issues) {
        expect(CHECK_IDS).toContain(i.check);
        expect(i.code).toMatch(/^[a-z_]+$/);
        expect(i.path.length).toBeGreaterThan(0);
        expect(i.message.length).toBeGreaterThan(0);
      }
    }
  });

  it('K-45/1 crate without hp is schema_invalid', () => {
    const lvl = level({
      id: 11,
      plan: ['WW'],
      pieces: [['B1_0', 'W', 0, 0]],
      obstacles: [{ type: 'crate', x: 1, y: 0 }],
    });
    expect(checkLevel(lvl, { only: ['L-14'] }).map((i) => i.code)).toEqual(['schema_invalid']);
  });

  it('GDD 14.1 tutorial booster and pre highlights need the unlock level (economy.json)', () => {
    const lvl = level({
      id: 9,
      plan: ['WW'],
      pieces: [['B1_0', 'W', 0, 0]],
      tutorial: [
        {
          step: 1,
          mode: 'soft',
          highlight: ['booster:hammer'],
          textKey: 'tut.l9.a',
          done: { timeoutMs: 1000 },
        },
        { step: 2, mode: 'soft', highlight: ['pre:thermos'], textKey: 'tut.l9.b', done: { event: 'tap' } },
      ],
    });
    const issues = checkLevel(lvl, { only: ['L-17'], boosterUnlock: { hammer: 8, thermos: 12 } });
    expect(issues.map((i) => i.path)).toEqual(['tutorial[1].highlight[0]']);
    expect(issues[0]?.code).toBe('tut_highlight_invalid');
  });

  it('L-17 a drag / hold glove starts on a cell of a highlighted block at its start (LEVELS 5; level 2 step 2 old (4,6) → error, new (4,7) → clean)', () => {
    const glove = (path: [number, number][], kind: 'drag' | 'hold' | 'tap' = 'hold') =>
      level({
        id: 2,
        plan: ['WW'],
        pieces: [
          ['C3_180', 'W', 4, 6],
          ['B1_0', 'G', 4, 5],
        ],
        tutorial: [
          {
            step: 1,
            mode: 'soft',
            highlight: ['piece:0', 'build'],
            hand: { kind, path },
            textKey: 'tut.l2.shadow',
            done: { event: 'placementCorrect', count: 1 },
          },
        ],
      });
    // C3_180 anchored (4,6) covers (5,6), (4,7), (5,7): (4,6) is the anchor, not a block cell
    const bad = checkLevel(
      glove([
        [4, 6],
        [4, 8],
        [6, 8],
      ]),
      { only: ['L-17'] },
    );
    expect(bad.map((i) => [i.code, i.path])).toEqual([['tut_highlight_invalid', 'tutorial[0].hand.path[0]']]);
    expect(
      checkLevel(
        glove([
          [4, 7],
          [4, 8],
          [6, 8],
        ]),
        { only: ['L-17'] },
      ),
    ).toEqual([]);
    expect(checkLevel(glove([[4, 6]], 'tap'), { only: ['L-17'] })).toEqual([]); // a tap may press any cell
  });

  it('L-17 tut_hold_done: a holdOverBuild done / startOn is a warning (LEVELS 5, Faz 2 tur 3); levels 1–5 have none', () => {
    const lvl = level({
      id: 2,
      plan: ['WW'],
      pieces: [['B1_0', 'W', 0, 0]],
      tutorial: [
        {
          step: 1,
          mode: 'soft',
          highlight: ['piece:0', 'build'],
          textKey: 'tut.l2.shadow',
          done: { event: 'holdOverBuild', count: 1, minMs: 500 },
        },
        {
          step: 2,
          mode: 'soft',
          highlight: ['build'],
          textKey: 'tut.l1.match',
          startOn: { event: 'holdOverBuild', count: 1, minMs: 500 },
          done: { event: 'placementCorrect', count: 1 },
        },
      ],
    });
    const issues = checkLevel(lvl, { only: ['L-17'] });
    expect(issues.map((i) => [i.code, i.path, i.severity])).toEqual([
      ['tut_hold_done', 'tutorial[0].done', 'warn'],
      ['tut_hold_done', 'tutorial[1].startOn', 'warn'],
    ]);
    for (const id of [1, 2, 3, 4, 5]) {
      const data = JSON.parse(
        readFileSync(join(ROOT, 'levels', `level_${String(id).padStart(3, '0')}.json`), 'utf8'),
      ) as LevelData;
      expect(
        checkLevel(data, { only: ['L-17'] }).filter((i) => i.code === 'tut_hold_done'),
        `level ${id}`,
      ).toEqual([]);
    }
  });

  it('L-17 every level 1–5 glove starts on its highlighted block', () => {
    for (const id of [1, 2, 3, 4, 5]) {
      const data = JSON.parse(
        readFileSync(join(ROOT, 'levels', `level_${String(id).padStart(3, '0')}.json`), 'utf8'),
      ) as LevelData;
      const glove = checkLevel(data, { only: ['L-17'] }).filter((i) => i.path.endsWith('hand.path[0]'));
      expect(glove, `level ${id}`).toEqual([]);
    }
  });

  it('GDD 14.1 tutorial steps are numbered 1, 2, … and done.at regions match the event', () => {
    const lvl = level({
      id: 7,
      plan: ['WW'],
      pieces: [['B1_0', 'W', 0, 0]],
      tutorial: [
        {
          step: 2,
          mode: 'soft',
          highlight: ['build'],
          textKey: 'tut.l7.a',
          done: { event: 'yardMove', at: [6, 0] },
        },
      ],
    });
    const issues = checkLevel(lvl, { only: ['L-17'] });
    expect(issues.map((i) => i.code)).toEqual(['tut_done_invalid', 'tut_done_invalid']);
  });
});
