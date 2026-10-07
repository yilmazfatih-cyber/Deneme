import { describe, expect, it } from 'vitest';
import { COLOR_CODES, PIECE_FLAGS, SHAPE_KINDS, VERDICT_REASONS, Zone } from '../../src/core/types.ts';

describe('core types', () => {
  it('colour codes keep the BRIEF §6 order (internal index, D2 help order W Y G R O C B P)', () => {
    expect(COLOR_CODES.join('')).toBe('WYGROCBP');
  });

  it('K-44 thirteen shape kinds', () => {
    expect(SHAPE_KINDS).toHaveLength(13);
  });

  it('K-34 verdict reasons have the fixed GDD order', () => {
    expect(VERDICT_REASONS).toEqual(['debris', 'outside', 'window', 'color', 'support']);
  });

  it('zones and piece flags', () => {
    expect(Zone).toEqual({ yard: 0, site: 1, queue: 2, gone: 3, pending: 4 });
    expect(PIECE_FLAGS).toEqual([
      'glass',
      'mortar',
      'balloon',
      'chained',
      'wet',
      'locked',
      'debris',
      'stuck',
    ]);
  });
});
