import { describe, expect, it } from 'vitest';
import { TOKENS } from '../../src/theme/tokens.ts';
import { createLayout } from '../../src/theme/layout.ts';
import { createInitialState } from '../../src/core/state.ts';
import { beginDrag } from '../../src/core/movement.ts';
import type { DragSession } from '../../src/core/movement.ts';
import {
  NO_EDGES,
  drawAnchor,
  edgesOf,
  exceedsThreshold,
  grabAt,
  pathDurationMs,
  pathPoint,
  pointColumn,
  pointRow,
  targetAnchor,
} from '../../src/scenes/level/dragMath.ts';
import { VIEW } from '../../src/scenes/level/viewConstants.ts';
import { levelFile } from '../core/moves.fixtures.ts';

const OFFSET = TOKENS.drag.fingerOffsetCells;

/** Screen point of continuous cell coordinates (u, v): inverse of pointColumn / pointRow. */
function screenOf(
  g: ReturnType<typeof createLayout>['grid'],
  u: number,
  v: number,
): { x: number; y: number } {
  return { x: g.pieceX(u - 0.5, 1) + g.cellPx / 2, y: g.boardBottomY - v * g.cellPx };
}

describe('drag geometry (TECH 4.4, UX 5.3)', () => {
  for (const H of [1920, 2337, 2400]) {
    const g = createLayout(TOKENS, H).grid;

    it(`R-03 continuous columns over the wall strip, H ${H}`, () => {
      expect(pointColumn(g, g.colLeft(2) + g.cellPx / 2)).toBeCloseTo(2.5, 9);
      expect(pointColumn(g, g.colLeft(6) + g.cellPx / 2)).toBeCloseTo(6.5, 9);
      // the middle of the 60 px wall strip is the zero-width boundary x = 6
      expect(pointColumn(g, g.wallX + g.wallW / 2)).toBeCloseTo(6, 9);
      expect(pointRow(g, g.rowTop(3) + g.cellPx / 2)).toBeCloseTo(3.5, 9);
      expect(pointRow(g, g.rowTop(9))).toBeCloseTo(10, 9);
    });
  }

  it('UX 5.3 a press becomes a drag at drag.startThresholdPx (8 px)', () => {
    const th = TOKENS.drag.startThresholdPx;
    expect(exceedsThreshold(th - 1, 0, th)).toBe(false);
    expect(exceedsThreshold(th, 0, th)).toBe(true);
    expect(exceedsThreshold(6, 6, th)).toBe(true); // 8.49 px diagonal
  });

  const g = createLayout(TOKENS, 1920).grid;
  const cells = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
  ];

  it('TECH 4.4 no jump at pick: at t = 0 the target is the block anchor, wherever the finger holds it', () => {
    for (const [fx, fy] of [
      [2.1, 3.9],
      [3.7, 3.2],
      [3.5, 4.8],
    ] as const) {
      const p = screenOf(g, fx, fy);
      const grab = grabAt(g, p.x, p.y, { ix: 2, iy: 3 }, cells);
      const t0 = targetAnchor(g, grab, p.x, p.y, 0, OFFSET);
      expect(t0.px).toBeCloseTo(2, 9);
      expect(t0.py).toBeCloseTo(3, 9);
    }
  });

  it('UX 5.3 finger offset: at t = 1 the grabbed cell centre is drag.fingerOffsetCells (1.2) above the finger', () => {
    const p = screenOf(g, 3.7, 4.8); // finger on cell (1, 1) of the block at (2, 3)
    const grab = grabAt(g, p.x, p.y, { ix: 2, iy: 3 }, cells);
    expect(grab.cell).toEqual({ x: 1, y: 1 });
    const t1 = targetAnchor(g, grab, p.x, p.y, 1, OFFSET);
    expect(t1.px + grab.cell.x + 0.5).toBeCloseTo(3.7, 9);
    expect(t1.py + grab.cell.y + 0.5).toBeCloseTo(4.8 + OFFSET, 9);
    // halfway through the glide the block is halfway up
    const th = targetAnchor(g, grab, p.x, p.y, 0.5, OFFSET);
    expect(th.py).toBeCloseTo((3 + t1.py) / 2, 9);
  });

  it('TECH 4.4 drawing: off the node only toward an edge, at most one cell', () => {
    const node = { ix: 3, iy: 4, mode: 0 };
    expect(drawAnchor(node, { px: 3.4, py: 3.6 }, NO_EDGES)).toEqual({ ax: 3, ay: 4 });
    const edges = edgesOf(node, [
      { ix: 4, iy: 4, mode: 0 },
      { ix: 3, iy: 3, mode: 0 },
    ]);
    expect(edges).toEqual({ left: false, right: true, down: true, up: false });
    expect(drawAnchor(node, { px: 3.4, py: 3.6 }, edges)).toEqual({ ax: 3.4, ay: 3.6 });
    expect(drawAnchor(node, { px: 2.5, py: 5.5 }, edges)).toEqual({ ax: 3, ay: 4 });
    expect(drawAnchor(node, { px: 9, py: 0 }, edges)).toEqual({ ax: 4, ay: 3 });
    // a rail entry to the right counts as a right edge; a mode switch in place is no direction
    expect(
      edgesOf(node, [
        { ix: 4, iy: 4, mode: 1 },
        { ix: 3, iy: 4, mode: 1 },
      ]),
    ).toEqual({ left: false, right: true, down: false, up: false });
  });

  it('TECH 4.4 BFS path following: 12 ms per cell, at most 120 ms, cell by cell', () => {
    expect(pathDurationMs(3, VIEW.pathMsPerCell, VIEW.pathMaxMs)).toBe(36);
    expect(pathDurationMs(30, VIEW.pathMsPerCell, VIEW.pathMaxMs)).toBe(120);
    const pts = [
      { ax: 2, ay: 6 },
      { ax: 2, ay: 7 },
      { ax: 2, ay: 8 },
      { ax: 3, ay: 8 },
    ];
    expect(pathPoint(pts, 0)).toEqual({ ax: 2, ay: 6 });
    expect(pathPoint(pts, 1 / 3)).toEqual({ ax: 2, ay: 7 });
    expect(pathPoint(pts, 5 / 6)).toEqual({ ax: 2.5, ay: 8 });
    expect(pathPoint(pts, 1)).toEqual({ ax: 3, ay: 8 });
  });
});

describe('scene target point + core sticky follow (K-08, TECH 1.4)', () => {
  const g = createLayout(TOKENS, 2337).grid;
  it('K-08 a finger path over the wall brings level 1 piece a to its golden release node (6, 8)', () => {
    const lvl = levelFile(1);
    const s = createInitialState(lvl);
    const session = beginDrag(s, 0) as DragSession; // `a`: D2_90 Y at (4, 7)
    expect(session).not.toBeNull();
    const c0 = session.shape.cells[0] ?? { x: 0, y: 0 };
    const pick = screenOf(g, session.start.ix + c0.x + 0.5, session.start.iy + c0.y + 0.5);
    const grab = grabAt(g, pick.x, pick.y, session.start, session.shape.cells);
    const fingerFor = (ix: number, iy: number): { x: number; y: number } =>
      screenOf(g, ix + grab.cell.x + 0.5, iy + grab.cell.y + 0.5 - OFFSET);
    const path = [fingerFor(4, 7), fingerFor(4, 8), fingerFor(6, 8)];
    let node = session.current;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1] as { x: number; y: number };
      const b = path[i] as { x: number; y: number };
      for (let k = 1; k <= 10; k++) {
        const fx = a.x + ((b.x - a.x) * k) / 10;
        const fy = a.y + ((b.y - a.y) * k) / 10;
        const t = targetAnchor(g, grab, fx, fy, 1, OFFSET);
        node = session.follow(t.px, t.py).node;
      }
    }
    expect(node).toEqual({ ix: 6, iy: 8, mode: 0 });
    expect(session.classify()).toMatchObject({ kind: 'siteFree', row: 6 });
  });
});
