import { describe, expect, it } from 'vitest';
import { TOKENS } from '../../src/theme/tokens.ts';
import { createLayout } from '../../src/theme/layout.ts';
import { GameSession } from '../../src/core/session.ts';
import { pieceBoardCells } from '../../src/core/grid.ts';
import { pieceZone } from '../../src/core/state.ts';
import { Zone } from '../../src/core/types.ts';
import { pieceAtPoint } from '../../src/scenes/level/hitTest.ts';
import { pieceFrameName, statePose } from '../../src/scenes/level/pieceState.ts';
import { dragTo, levelFile } from '../core/moves.fixtures.ts';

const layout = createLayout(TOKENS, 2337);
const g = layout.grid;
const SLOP = layout.touch.hitSlopPx;
const centre = (x: number, y: number): { x: number; y: number } => {
  const r = g.cellRect(x, y);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
};

describe('block hit test (TECH 10.3, UX 0.1 hitSlopPx)', () => {
  const lvl = levelFile(1);

  it('TECH 10.3 every cell centre of every yard block picks that block', () => {
    const { state: s } = GameSession.start(lvl);
    for (let id = 0; id < lvl.layout.counts.pieces; id++) {
      if (pieceZone(s, id) !== Zone.yard) continue;
      for (const c of pieceBoardCells(s, id)) {
        const p = centre(c.x, c.y);
        expect(pieceAtPoint(s, g, p.x, p.y, SLOP)).toBe(id);
      }
    }
  });

  it('UX 0.1 a block cell is grown by touch.hitSlopPx (30 px): inside the pad picks, beyond it does not', () => {
    const { state: s } = GameSession.start(lvl);
    const cell = g.cellRect(0, 0); // `y y` corner block of level 1 (D2_0 Y at (0, 0))
    const id = pieceAtPoint(s, g, cell.x + 10, cell.y + 10, SLOP);
    expect(id).not.toBeNull();
    expect(pieceAtPoint(s, g, cell.x - SLOP + 1, cell.y + 60, SLOP)).toBe(id);
    expect(pieceAtPoint(s, g, cell.x - SLOP - 1, cell.y + 60, SLOP)).toBeNull();
  });

  it('UX 0.1 overlapping pads: the touch goes to the block with the nearest cell centre', () => {
    const { state: s } = GameSession.start(lvl);
    // the boundary between yard cells (2, 1) and (3, 1) belongs to two different blocks in level 1
    const a = pieceAtPoint(s, g, g.colLeft(3) - 5, centre(2, 1).y, SLOP);
    const b = pieceAtPoint(s, g, g.colLeft(3) + 5, centre(3, 1).y, SLOP);
    expect(a).toBe(pieceAtPoint(s, g, centre(2, 1).x, centre(2, 1).y, SLOP));
    expect(b).toBe(pieceAtPoint(s, g, centre(3, 1).x, centre(3, 1).y, SLOP));
    expect(a).not.toBe(b);
  });

  it('K-22 site blocks of the shown segment are picked; empty crane rows are not', () => {
    const game = GameSession.start(lvl);
    expect(game.commit(dragTo(0, 6, 8)).status).toBe('applied');
    const s = game.state;
    const p = centre(6, 0);
    expect(pieceAtPoint(s, g, p.x, p.y, SLOP)).toBe(0);
    const sky = centre(3, 9);
    expect(pieceAtPoint(s, g, sky.x, sky.y, SLOP)).toBeNull();
    expect(statePose(s, 0)).toEqual({ ax: 6, ay: 0, scale: 1, alpha: 1 });
    expect(pieceFrameName(s, 0)).toBe('blk_D2_90_Y');
  });

  it('TECH 1.4 the hit test and the pose reads never change the state', () => {
    const { state: s } = GameSession.start(lvl);
    const before = s.buf.slice();
    for (let y = g.craneTopY; y < g.boardBottomY; y += 37)
      for (let x = 0; x < 1080; x += 41) pieceAtPoint(s, g, x, y, SLOP);
    for (let id = 0; id < lvl.layout.counts.pieces; id++) statePose(s, id);
    expect(s.buf).toEqual(before);
  });
});
