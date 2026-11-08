import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MECHANICS, deriveMechanics, newMechanics } from '../../../src/core/level/mechanics.ts';
import { MECHANIC_IDS } from '../../../src/core/level/schema.ts';
import { level } from '../../fixtures/builders.ts';

const OBSTACLES = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'OBSTACLES.md'),
  'utf8',
);

/** OBSTACLES "Veri imzası" table rows: [id, first level]. */
function signatureRows(): [string, number][] {
  const start = OBSTACLES.indexOf('## Veri imzası');
  const end = OBSTACLES.indexOf('## ', start + 5);
  return OBSTACLES.slice(start, end)
    .split('\n')
    .flatMap((line) => {
      const m = /^\| ([A-Z][\w-]*) \| .* \| (\d+) \|$/.exec(line);
      return m ? [[m[1] ?? '', Number(m[2])] as [string, number]] : [];
    });
}

const B1: ['B1_0', 'W', number, number][] = [['B1_0', 'W', 0, 0]];

describe('K-45/9 mechanic signatures (OBSTACLES "Veri imzası")', () => {
  it('K-45/9 signature table equals the OBSTACLES rows (ids, order, first level)', () => {
    const rows = signatureRows();
    expect(rows).toHaveLength(27);
    expect(MECHANICS.map((m) => [m.id, m.firstLevel])).toEqual(rows);
    expect(MECHANICS.map((m) => m.id)).toEqual([...MECHANIC_IDS]);
  });

  it('K-45/9 W3 derived from gap size (any gap type, N2)', () => {
    const shutter = level({
      id: 13,
      wall: { height: 4, gaps: [{ type: 'shutter', y: 0, size: 1, period: 2 }] },
      pieces: B1,
    });
    expect(deriveMechanics(shutter)).toEqual(['W3', 'W4']);
    const wide = level({ id: 3, wall: { height: 6, gaps: [{ type: 'static', y: 2, size: 2 }] }, pieces: B1 });
    expect(deriveMechanics(wide)).toEqual(['W1']);
  });

  it('K-45/9 every signature is detected from data alone', () => {
    const full = level({
      id: 40,
      wall: {
        height: 8,
        fan: 'left',
        gaps: [
          { type: 'static', y: 0, size: 1 },
          { type: 'shutter', y: 2, size: 1, period: 2 },
          { type: 'slider', y: 4, size: 1, range: [4, 5] },
        ],
      },
      gravity: { build: 'high', yard: true },
      plan: [
        ['W.', 'WW'],
        ['??', 'WW'],
        ['??', 'WW'],
      ],
      hidden: [undefined, { kind: 'repeat', period: 1 }, { kind: 'mirrorOf', segment: 0 }],
      pieces: [
        ['B1_0', 'W', 0, 0, ['chained', 'wet'], 2],
        ['B1_0', 'W', 1, 0, ['glass', 'mortar']],
        ['B1_0', 'W', 2, 0, ['balloon']],
        ['I5_0', 'W', 0, 1],
      ],
      debris: [['B1_0', 'W', 6, 0]],
      obstacles: [
        { type: 'crate', x: 3, y: 0, hp: 1 },
        { type: 'cement_bag', x: 4, y: 0 },
        { type: 'screw', x: 0, y: 0 },
      ],
      elevator: { range: [0, 1], start: 0, dir: 1 },
    });
    expect(deriveMechanics(full)).toEqual([
      'W1',
      'W2',
      'W3',
      'W4',
      'W5',
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
      'S6',
      'S7-R',
      'S7-M',
      'S8',
      'G-H',
    ]);
    const others = level({
      id: 31,
      mode: 'carousel',
      carouselEvery: 3,
      gravity: { build: 'low' },
      wall: {
        height: 6,
        gaps: [
          { type: 'paint', y: 0, size: 2, color: 'W' },
          { type: 'locked', y: 3, size: 2, keyId: 'a' },
        ],
      },
      pieces: B1,
    });
    expect(deriveMechanics(others)).toEqual(['W6', 'W7', 'S5', 'G-L']);
  });

  it('K-45/9 a single segment is not S1, teaches adds nothing to the derived set', () => {
    expect(deriveMechanics(level({ id: 5, teaches: 'S1', pieces: B1 }))).toEqual([]);
    expect(deriveMechanics(level({ id: 5, plan: [['WW'], ['WW']], pieces: B1 }))).toEqual(['S1']);
  });

  it('K-45/9 newMechanics subtracts the earlier levels', () => {
    const l4 = level({
      id: 4,
      wall: { height: 6, gaps: [{ type: 'static', y: 3, size: 2 }] },
      plan: ['RR', 'WW', 'W.', 'WW', 'YY'],
      pieces: B1,
    });
    expect(newMechanics(l4, new Set(['W1']))).toEqual(['S2']);
  });
});
