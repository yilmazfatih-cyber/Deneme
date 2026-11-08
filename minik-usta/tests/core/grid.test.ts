import { describe, expect, it } from 'vitest';
import {
  collisionMasks,
  occupyPiece,
  pieceBoardCells,
  refreshSiteMasks,
  siteColumnTops,
  stateInvariantErrors,
  vacatePiece,
  visibleSegment,
} from '../../src/core/grid.ts';
import {
  H,
  PF,
  SITE_TROWEL,
  cloneState,
  filledMask,
  pieceField,
  setFlag,
  setHdr,
  setPieceField,
  setSiteOcc,
  setYardOcc,
  wrongOccMask,
  yardOcc,
} from '../../src/core/state.ts';
import type { GameState } from '../../src/core/state.ts';
import { hashHex } from '../../src/core/hash.ts';
import { mulberry32 } from '../../src/core/rng.ts';
import { shapeByIndex } from '../../src/core/shapes.ts';
import { Zone } from '../../src/core/types.ts';
import { initialState } from '../fixtures/builders.ts';

/** Moves a piece onto the site (segment `seg`, global column x, plan row y) and refreshes the masks. */
function toSite(s: GameState, id: number, x: number, y: number, seg = 0, locked = true): void {
  vacatePiece(s, id);
  setPieceField(s, id, PF.zone, Zone.site);
  setPieceField(s, id, PF.x, x);
  setPieceField(s, id, PF.y, y);
  setPieceField(s, id, PF.seg, seg);
  setFlag(s, id, 'locked', locked);
  occupyPiece(s, id);
  refreshSiteMasks(s, seg);
}

const rows = (m: Uint8Array): string[] =>
  [...m].map((r) => [...Array(8).keys()].map((x) => ((r >> x) & 1 ? '#' : '.')).join('')).reverse();

describe('grid operations', () => {
  it('K-08 collision rows: yard occupancy minus the dragged piece, crane rows empty', () => {
    const s = initialState({
      pieces: [
        ['O4_0', 'W', 0, 0],
        ['B1_0', 'Y', 5, 7],
      ],
    });
    expect(rows(collisionMasks(s, 0))).toEqual([
      '........',
      '........',
      '.....#..',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
    ]);
    expect((collisionMasks(s, 1)[0] ?? 0) & 0b11).toBe(0b11);
  });

  it('K-24 site rows follow the elevator offset; rows below it are platform', () => {
    const s = initialState({
      id: 37,
      plan: ['WW', 'WW'],
      elevator: { range: [0, 2], start: 2, dir: 1 },
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'W', 1, 0],
      ],
    });
    toSite(s, 0, 6, 0);
    const m = collisionMasks(s, 1);
    expect([m[0], m[1], m[2], m[3]].map((r) => ((r ?? 0) >> 6) & 0b11)).toEqual([0b11, 0b11, 0b01, 0]);
    expect([...siteColumnTops(s, -1)]).toEqual([2, 1]);
    expect(pieceBoardCells(s, 0)).toEqual([{ x: 6, y: 2 }]);
  });

  it('K-11 site column tops: −1 for an empty column, excluding the dragged piece', () => {
    const s = initialState({
      plan: ['WW', 'WW', 'WW'],
      pieces: [
        ['D2_0', 'W', 0, 0],
        ['B1_0', 'W', 2, 0],
      ],
    });
    expect([...siteColumnTops(s, -1)]).toEqual([-1, -1]);
    toSite(s, 0, 7, 0);
    expect([...siteColumnTops(s, -1)]).toEqual([-1, 1]);
    expect([...siteColumnTops(s, 0)]).toEqual([-1, -1]);
  });

  it('K-34 E-43 filled holds locked blocks and trowel cells; wrongOcc holds debris and stuck mortar (also on `.`)', () => {
    const s = initialState({
      id: 35,
      plan: ['WW', 'W.', 'WW'],
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'W', 1, 0, ['mortar']],
      ],
      debris: [['B1_0', 'W', 6, 2]],
    });
    toSite(s, 0, 6, 0);
    toSite(s, 1, 7, 1, 0, false);
    setFlag(s, 1, 'stuck', true);
    setSiteOcc(s, 0, 1, 0, SITE_TROWEL);
    refreshSiteMasks(s, 0);
    expect([filledMask(s, 0, 0), filledMask(s, 0, 1)]).toEqual([0b001, 0b001]);
    // debris at (6,2) and stuck mortar on the `.` cell (7,1)
    expect([wrongOccMask(s, 0, 0), wrongOccMask(s, 0, 1)]).toEqual([0b100, 0b010]);
    expect(stateInvariantErrors(s)).toEqual([]);
  });

  it('visible segment is the active one, or the front one on a carousel (K-22, K-23)', () => {
    const seg = initialState({ plan: [['WW'], ['WW']], pieces: [['B1_0', 'W', 0, 0]] });
    setHdr(seg, H.activeSeg, 1);
    expect(visibleSegment(seg)).toBe(1);
    const car = initialState({
      id: 31,
      mode: 'carousel',
      carouselEvery: 2,
      plan: [['WW'], ['WW']],
      pieces: [['B1_0', 'W', 0, 0]],
    });
    setHdr(car, H.frontSeg, 1);
    setHdr(car, H.activeSeg, 0);
    expect(visibleSegment(car)).toBe(1);
  });

  it('invariants catch corrupted occupancy, overlaps, stale masks, queue drift and K-34 holes', () => {
    const s = initialState({
      plan: ['WW', 'WW'],
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'W', 1, 0],
      ],
    });
    const broken: [string, (t: GameState) => void][] = [
      ['stale yard cell', (t) => setYardOcc(t, 3, 3, 1)],
      ['overlap', (t) => setPieceField(t, 1, PF.x, 0)],
      ['stale filled', (t) => setSiteOcc(t, 0, 0, 0, 0)],
      ['queue drift', (t) => setPieceField(t, 0, PF.zone, Zone.queue)],
      ['K-34 hole', (t) => toSite(t, 0, 6, 1)],
    ];
    for (const [name, corrupt] of broken) {
      const t = cloneState(s);
      if (name === 'stale filled') {
        toSite(t, 0, 6, 0);
        corrupt(t);
      } else corrupt(t);
      expect(stateInvariantErrors(t).length, name).toBeGreaterThan(0);
    }
    expect(stateInvariantErrors(s)).toEqual([]);
  });

  it('invariants hold over 1 000 seeded random yard relocations; cell count kept, same seed → same hashes', () => {
    const spec = {
      pieces: [
        ['O4_0', 'W', 0, 0],
        ['D2_0', 'Y', 2, 0],
        ['D2_90', 'W', 3, 0],
        ['C3_90', 'Y', 0, 4],
        ['B1_0', 'W', 5, 7],
      ],
      obstacles: [{ type: 'crate', x: 4, y: 4, hp: 2 }],
    } as const;
    const runOnce = (seed: number): string[] => {
      const s = initialState(spec);
      const rng = mulberry32(seed);
      const hashes: string[] = [];
      const cells = (): number => {
        let n = 0;
        for (let y = 0; y < 10; y++) for (let x = 0; x < 6; x++) if (yardOcc(s, x, y) > 0) n++;
        return n;
      };
      const total = cells();
      for (let step = 0; step < 1000; step++) {
        const id = rng.nextInt(5);
        const shape = shapeByIndex(pieceField(s, id, PF.shape));
        const x = rng.nextInt(6 - shape.w + 1);
        const y = rng.nextInt(8 - shape.h + 1);
        vacatePiece(s, id);
        const free = shape.cells.every((c) => yardOcc(s, x + c.x, y + c.y) === 0);
        if (free) {
          setPieceField(s, id, PF.x, x);
          setPieceField(s, id, PF.y, y);
        }
        occupyPiece(s, id);
        expect(stateInvariantErrors(s)).toEqual([]);
        expect(cells()).toBe(total);
        hashes.push(hashHex(s));
      }
      return hashes;
    };
    const a = runOnce(7);
    expect(runOnce(7)).toEqual(a);
    expect(runOnce(8)).not.toEqual(a);
  });
});
