/** Screens `--cvd` (TECH_DESIGN §12.2, §14.1 #15; review Faz 2 tur 1 #10): Machado 2009 matrices as an SVG filter. */
import { describe, expect, it } from 'vitest';
import { CVD_KINDS, CVD_MATRICES, feColorMatrixValues, isCvdKind } from '../../src/harness/cvd.ts';

describe('TECH 12.2 screens --cvd', () => {
  it('TECH 12.2 the three Machado matrices keep white white and become 4 × 5 feColorMatrix values', () => {
    for (const kind of CVD_KINDS) {
      const m = CVD_MATRICES[kind];
      expect(m).toHaveLength(9);
      for (let r = 0; r < 3; r++)
        expect((m[r * 3] ?? 0) + (m[r * 3 + 1] ?? 0) + (m[r * 3 + 2] ?? 0)).toBeCloseTo(1, 2);
      const values = feColorMatrixValues(m).split(' ').map(Number);
      expect(values).toHaveLength(20);
      expect(values.slice(15)).toEqual([0, 0, 0, 1, 0]);
    }
    expect(isCvdKind('deuteranopia')).toBe(true);
    expect(isCvdKind('mono')).toBe(false);
  });
});
