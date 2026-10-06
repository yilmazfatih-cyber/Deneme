import { describe, expect, it } from 'vitest';
import {
  ALWAYS_HEAVY,
  BASE_CELLS,
  FORBIDDEN_SHAPES,
  HEAVY_MIN_LEVEL_ID,
  KIND_FIRST_CHAPTER,
  SHAPES,
  SHAPE_IDS,
  isShapeId,
  rotateClockwise,
  rotateShapeId,
  shapeById,
  shapeByIndex,
} from '../../src/core/shapes.ts';
import { SHAPE_KINDS } from '../../src/core/types.ts';
import type { ShapeId } from '../../src/core/types.ts';

/** TECH_DESIGN §3.3, transcribed literally: id → [cells, "w×h", heavy]. */
const TECH_TABLE: Record<string, [string, string, boolean]> = {
  B1_0: ['(0,0)', '1x1', false],
  D2_0: ['(0,0)(0,1)', '1x2', false],
  D2_90: ['(0,0)(1,0)', '2x1', false],
  I3_0: ['(0,0)(0,1)(0,2)', '1x3', false],
  I3_90: ['(0,0)(1,0)(2,0)', '3x1', true],
  I4_0: ['(0,0)(0,1)(0,2)(0,3)', '1x4', false],
  I4_90: ['(0,0)(1,0)(2,0)(3,0)', '4x1', true],
  O4_0: ['(0,0)(1,0)(0,1)(1,1)', '2x2', false],
  C3_0: ['(0,0)(1,0)(0,1)', '2x2', false],
  C3_90: ['(0,0)(0,1)(1,1)', '2x2', false],
  C3_180: ['(1,0)(0,1)(1,1)', '2x2', false],
  C3_270: ['(0,0)(1,0)(1,1)', '2x2', false],
  S4_0: ['(0,0)(0,1)(1,1)(1,2)', '2x3', false],
  S4_90: ['(1,0)(2,0)(0,1)(1,1)', '3x2', true],
  I5_0: ['(0,0)(1,0)(2,0)(3,0)(4,0)', '5x1', true],
  I5_90: ['(0,0)(0,1)(0,2)(0,3)(0,4)', '1x5', true],
  Q9_0: ['(0,0)(1,0)(2,0)(0,1)(1,1)(2,1)(0,2)(1,2)(2,2)', '3x3', true],
  L4_0: ['(0,0)(1,0)(0,1)(0,2)', '2x3', false],
  L4_90: ['(0,0)(0,1)(1,1)(2,1)', '3x2', true],
  L4_180: ['(1,0)(1,1)(0,2)(1,2)', '2x3', false],
  L4_270: ['(0,0)(1,0)(2,0)(2,1)', '3x2', true],
  J4_0: ['(0,0)(1,0)(1,1)(1,2)', '2x3', false],
  J4_90: ['(0,0)(1,0)(2,0)(0,1)', '3x2', true],
  J4_180: ['(0,0)(0,1)(0,2)(1,2)', '2x3', false],
  J4_270: ['(2,0)(0,1)(1,1)(2,1)', '3x2', true],
  T4_0: ['(0,0)(0,1)(1,1)(0,2)', '2x3', false],
  T4_90: ['(1,0)(0,1)(1,1)(2,1)', '3x2', true],
  T4_180: ['(1,0)(0,1)(1,1)(1,2)', '2x3', false],
  T4_270: ['(0,0)(1,0)(2,0)(1,1)', '3x2', true],
  Z4_0: ['(1,0)(0,1)(1,1)(0,2)', '2x3', false],
  Z4_90: ['(0,0)(1,0)(1,1)(2,1)', '3x2', true],
};

/** TECH §3.3 "(=…)" aliases: same cell set as the listed canonical id. */
const TECH_ALIASES: Record<string, ShapeId> = {
  B1_90: 'B1_0',
  B1_180: 'B1_0',
  B1_270: 'B1_0',
  D2_180: 'D2_0',
  D2_270: 'D2_90',
  I3_180: 'I3_0',
  I3_270: 'I3_90',
  I4_180: 'I4_0',
  I4_270: 'I4_90',
  O4_90: 'O4_0',
  O4_180: 'O4_0',
  O4_270: 'O4_0',
  S4_180: 'S4_0',
  S4_270: 'S4_90',
  Z4_180: 'Z4_0',
  Z4_270: 'Z4_90',
  I5_180: 'I5_0',
  I5_270: 'I5_90',
  Q9_90: 'Q9_0',
  Q9_180: 'Q9_0',
  Q9_270: 'Q9_0',
};

const cellsText = (id: ShapeId): string =>
  shapeById(id)
    .cells.map((c) => `(${c.x},${c.y})`)
    .join('');

describe('K-44 shapes', () => {
  it('K-44 generates 52 shape ids in kind × rotation index order', () => {
    expect(SHAPES).toHaveLength(52);
    expect(SHAPE_IDS).toHaveLength(52);
    SHAPES.forEach((s, i) => {
      expect(s.index).toBe(i);
      expect(shapeByIndex(i)).toBe(s);
      expect(SHAPE_KINDS[Math.floor(i / 4)]).toBe(s.kind);
    });
    expect(new Set(SHAPE_IDS).size).toBe(52);
  });

  it('K-44 generated table equals TECH_DESIGN §3.3 cell by cell', () => {
    for (const [id, [cells, box, heavy]] of Object.entries(TECH_TABLE)) {
      const s = shapeById(id as ShapeId);
      expect(cellsText(s.id), id).toBe(cells);
      expect(`${s.w}x${s.h}`, id).toBe(box);
      expect(s.heavy, id).toBe(heavy);
    }
    for (const [alias, canonical] of Object.entries(TECH_ALIASES)) {
      expect(cellsText(alias as ShapeId), alias).toBe(cellsText(canonical));
      expect(shapeById(alias as ShapeId).canonical, alias).toBe(canonical);
    }
    expect(Object.keys(TECH_TABLE).length + Object.keys(TECH_ALIASES).length).toBe(52);
  });

  it('K-44 0° cells come from BRIEF §5 and rotation is clockwise with bottom-left normalisation', () => {
    for (const kind of SHAPE_KINDS) {
      const s = shapeById(`${kind}_0`);
      const brief = [...BASE_CELLS[kind]].map(([x, y]) => ({ x, y })).sort((a, b) => a.y - b.y || a.x - b.x);
      expect(s.cells).toEqual(brief);
    }
    // (x, y) → (y, −x): L4_0 foot (1,0) goes below the column, so L4_90 is "X.. / XXX" (top row left).
    expect(rotateClockwise(shapeById('L4_0').cells)).toEqual(shapeById('L4_90').cells);
    // GDD K-44 example: C3_90 = (0,0)(0,1)(1,1), view "XX / X." (top row left).
    expect(cellsText('C3_90')).toBe('(0,0)(0,1)(1,1)');
    // Four clockwise steps return to 0°.
    for (const kind of SHAPE_KINDS) {
      let cells = shapeById(`${kind}_0`).cells;
      for (let i = 0; i < 4; i++) cells = rotateClockwise(cells);
      expect(cells).toEqual(shapeById(`${kind}_0`).cells);
    }
  });

  it('K-44 BRIEF §5 notes hold for the generated table', () => {
    // "D2 90° = yatay Lento (2×1)"
    expect([shapeById('D2_90').w, shapeById('D2_90').h]).toEqual([2, 1]);
    // "I3 / I4 yatay hali Ağır"
    expect(shapeById('I3_90').heavy && shapeById('I4_90').heavy).toBe(true);
    expect(shapeById('I3_0').heavy || shapeById('I4_0').heavy).toBe(false);
    // "C3 4 yönelimin hepsi geçer"
    for (const r of [0, 90, 180, 270] as const) expect(shapeById(`C3_${r}`).heavy).toBe(false);
    // "L4/J4/T4 dikey halleri geçer, yatay halleri Ağır"; "S4/Z4 dikey hali geçer, yatay hali Ağır"
    for (const k of ['L4', 'J4', 'T4', 'S4', 'Z4'] as const) {
      for (const r of [0, 180] as const) expect(shapeById(`${k}_${r}`).heavy, `${k}_${r}`).toBe(false);
      for (const r of [90, 270] as const) expect(shapeById(`${k}_${r}`).heavy, `${k}_${r}`).toBe(true);
    }
    // "I5 her zaman Ağır (yalnızca yatay kullanılır)", "Q9 her zaman Ağır"
    for (const r of [0, 90, 180, 270] as const) {
      expect(shapeById(`I5_${r}`).heavy).toBe(true);
      expect(shapeById(`Q9_${r}`).heavy).toBe(true);
    }
    expect(shapeById('I5_0').w).toBe(5);
  });

  it('K-44 heavy = width ≥ 3 or kind I5/Q9, so every non-heavy shape is at most 2 wide', () => {
    for (const s of SHAPES) {
      expect(s.heavy).toBe(s.w >= 3 || ALWAYS_HEAVY.has(s.kind));
      if (!s.heavy) expect(s.w).toBeLessThanOrEqual(2);
    }
    // I5_90 is 1 wide but stays heavy (ALWAYS_HEAVY, S-2).
    expect(shapeById('I5_90').w).toBe(1);
    expect(shapeById('I5_90').heavy).toBe(true);
  });

  it('K-44 symmetric aliases reduce to the canonical id', () => {
    expect(shapeById('O4_270').canonical).toBe('O4_0');
    expect(shapeById('D2_180').canonical).toBe('D2_0');
    expect(shapeById('C3_270').canonical).toBe('C3_270');
    for (const s of SHAPES) {
      const c = shapeById(s.canonical);
      expect(c.canonical).toBe(c.id);
      expect(c.index).toBe(s.canonicalIndex);
      expect(c.cells).toEqual(s.cells);
      expect(c.index).toBeLessThanOrEqual(s.index);
    }
  });

  it('K-44 I5_90 and I5_270 are the forbidden data orientations', () => {
    expect([...FORBIDDEN_SHAPES].sort()).toEqual(['I5_270', 'I5_90']);
  });

  it('K-44 kind unlock table and heavy level threshold', () => {
    expect(KIND_FIRST_CHAPTER).toEqual({
      B1: 1,
      D2: 1,
      O4: 1,
      C3: 1,
      I3: 2,
      L4: 2,
      J4: 2,
      T4: 3,
      S4: 3,
      Z4: 3,
      I4: 4,
      I5: 1,
      Q9: 1,
    });
    expect(HEAVY_MIN_LEVEL_ID).toBe(8);
  });

  it('K-44 row, column masks and column bounds agree with the cells', () => {
    for (const s of SHAPES) {
      expect(s.rows).toHaveLength(s.h);
      expect(s.colRows).toHaveLength(s.w);
      expect(s.cellCount).toBe(s.cells.length);
      for (let x = 0; x < s.w; x++) {
        const ys = s.cells.filter((c) => c.x === x).map((c) => c.y);
        expect(ys.length, `${s.id} column ${x} occupied`).toBeGreaterThan(0);
        expect(s.colBottom[x]).toBe(Math.min(...ys));
        expect(s.colTop[x]).toBe(Math.max(...ys));
        expect(s.colRows[x]).toBe(ys.reduce((m, y) => m | (1 << y), 0));
      }
      for (let y = 0; y < s.h; y++) {
        expect(s.rows[y]).toBe(s.cells.filter((c) => c.y === y).reduce((m, c) => m | (1 << c.x), 0));
      }
    }
    // S4_0 = X. / XX / .X (bottom row first): bottom of column 1 is row 1.
    expect(shapeById('S4_0').colBottom).toEqual([0, 1]);
  });

  it('K-44 id helpers', () => {
    expect(isShapeId('C3_90')).toBe(true);
    expect(isShapeId('C3_45')).toBe(false);
    expect(() => shapeById('X1_0' as ShapeId)).toThrow();
    expect(rotateShapeId('L4_0', 1)).toBe('L4_90');
    expect(rotateShapeId('L4_270', 1)).toBe('L4_0');
    expect(rotateShapeId('L4_0', -1)).toBe('L4_270');
  });
});
