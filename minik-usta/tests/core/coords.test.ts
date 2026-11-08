import { describe, expect, it } from 'vitest';
import {
  BOARD_ROWS,
  GRID_CELLS,
  GRID_COLS,
  GRID_ROWS,
  boundaryAllows,
  cellIndex,
  cellX,
  cellY,
  closedBoundaryMask,
  dragNodeCode,
  dragNodeFromCode,
  inGrid,
  isCraneCell,
  isSiteCell,
  isYardCell,
  neighbors4,
  openFreeMask,
  openRailMask,
  rowRangeMask,
  straddlesBoundary,
} from '../../src/core/coords.ts';
import { shapeById } from '../../src/core/shapes.ts';

const rows = (mask: number): number[] => [...Array(10).keys()].filter((y) => (mask >> y) & 1);

describe('K-01 board and grid (edge model R-03)', () => {
  it('K-01 the core grid is 8 × 10: board y 0–7 plus crane rows 8–9; internal = global coordinates', () => {
    expect([GRID_COLS, GRID_ROWS, GRID_CELLS, BOARD_ROWS]).toEqual([8, 10, 80, 8]);
    expect(cellIndex(3, 9)).toBe(75);
    expect([cellX(75), cellY(75)]).toEqual([3, 9]);
  });

  it('K-01 D2_0 anchored at (3,8) fits, anchored at (3,9) leaves the grid', () => {
    const d2 = shapeById('D2_0');
    const fits = (ax: number, ay: number): boolean => d2.cells.every((c) => inGrid(ax + c.x, ay + c.y));
    expect(fits(3, 8)).toBe(true);
    expect(fits(3, 9)).toBe(false);
    expect(inGrid(-1, 0) || inGrid(8, 0) || inGrid(0, 10)).toBe(false);
  });

  it('K-02 K-03 K-05 regions: yard x 0–5, site x 6–7, crane area y 8–9', () => {
    expect(isYardCell(5, 7) && !isYardCell(6, 7) && !isYardCell(5, 8)).toBe(true);
    expect(isSiteCell(6, 0) && isSiteCell(7, 7) && !isSiteCell(7, 8) && !isSiteCell(5, 0)).toBe(true);
    expect(isCraneCell(0, 8) && isCraneCell(7, 9) && !isCraneCell(0, 7)).toBe(true);
  });
});

describe('K-04 wall boundary row masks', () => {
  it('K-04 height 6 with an open gap y=2 size 2: rows 0–1 closed, 2–3 gap, 4–5 closed, 6–9 open', () => {
    const gap = openRailMask(2, 2, true);
    expect(rows(gap)).toEqual([2, 3]);
    expect(rows(closedBoundaryMask(6, gap))).toEqual([0, 1, 4, 5]);
    expect(rows(openFreeMask(6))).toEqual([6, 7, 8, 9]);
  });

  it('K-04 a closed gap adds nothing; crane rows are always open', () => {
    expect(openRailMask(2, 2, false)).toBe(0);
    expect(rows(closedBoundaryMask(8, 0))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(rows(openFreeMask(8))).toEqual([8, 9]);
    expect(rows(openFreeMask(0))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(closedBoundaryMask(0, 0)).toBe(0);
  });

  it('K-05 a 3-tall piece cannot clear an 8-high wall, a 2-tall one can (open height rule)', () => {
    // Crossing column of a 1-wide piece anchored at row iy: its row mask shifted by iy must be inside openFree.
    const canCross = (id: 'I3_0' | 'D2_0', height: number): boolean => {
      const s = shapeById(id);
      for (let iy = 0; iy + s.h <= GRID_ROWS; iy++) {
        if (boundaryAllows((s.colRows[0] ?? 0) << iy, openFreeMask(height))) return true;
      }
      return false;
    };
    expect(canCross('I3_0', 8)).toBe(false);
    expect(canCross('D2_0', 8)).toBe(true);
    expect(canCross('I3_0', 7)).toBe(true);
  });

  it('K-04 boundary straddle test and row ranges', () => {
    expect(straddlesBoundary(5, 2)).toBe(true);
    expect(straddlesBoundary(4, 2)).toBe(false);
    expect(straddlesBoundary(6, 2)).toBe(false);
    expect(straddlesBoundary(5, 1)).toBe(false);
    expect(rowRangeMask(8, 5)).toBe(rowRangeMask(8, 2));
    expect(rowRangeMask(3, 0)).toBe(0);
  });
});

describe('E-46 neighbourhood never crosses the wall boundary', () => {
  it('E-46 (5,y) and (6,y) are never neighbours', () => {
    for (let y = 0; y < BOARD_ROWS; y++) {
      expect(neighbors4(5, y).some((n) => n.ix === 6)).toBe(false);
      expect(neighbors4(6, y).some((n) => n.ix === 5)).toBe(false);
    }
    expect(neighbors4(5, 2)).toEqual([
      { ix: 4, iy: 2 },
      { ix: 5, iy: 1 },
      { ix: 5, iy: 3 },
    ]);
    expect(neighbors4(0, 0)).toEqual([
      { ix: 1, iy: 0 },
      { ix: 0, iy: 1 },
    ]);
    expect(neighbors4(3, 8)).toEqual([]);
  });
});

describe('drag node codes (TECH §2.1)', () => {
  it('round-trips (mode * 10 + iy) * 8 + ix', () => {
    for (const mode of [0, 1, 3]) {
      for (let iy = 0; iy < 10; iy++) {
        for (let ix = 0; ix < 8; ix++) {
          const node = { ix, iy, mode };
          expect(dragNodeFromCode(dragNodeCode(node))).toEqual(node);
        }
      }
    }
    expect(dragNodeCode({ ix: 6, iy: 3, mode: 1 })).toBe((1 * 10 + 3) * 8 + 6);
  });
});
