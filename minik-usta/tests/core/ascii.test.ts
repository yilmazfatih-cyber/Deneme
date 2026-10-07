import { describe, expect, it } from 'vitest';
import { fromAscii, parseAscii, toAscii } from '../../src/core/ascii.ts';
import { occupyPiece, refreshSiteMasks, vacatePiece } from '../../src/core/grid.ts';
import {
  H,
  OF,
  PF,
  SITE_TROWEL,
  enqueuePiece,
  setFlag,
  setHdr,
  setHiddenCollected,
  setObstacleField,
  setPieceField,
  setSiteOcc,
  setYardOcc,
} from '../../src/core/state.ts';
import type { GameState } from '../../src/core/state.ts';
import { Zone } from '../../src/core/types.ts';
import { expectAscii, initialState } from '../fixtures/builders.ts';

function toSite(s: GameState, id: number, x: number, y: number, locked = true): void {
  vacatePiece(s, id);
  setPieceField(s, id, PF.zone, Zone.site);
  setPieceField(s, id, PF.x, x);
  setPieceField(s, id, PF.y, y);
  setPieceField(s, id, PF.seg, 0);
  setFlag(s, id, 'locked', locked);
  occupyPiece(s, id);
  refreshSiteMasks(s, 0);
}

/** TECH Appendix A example board (BRIEF §12 level 4 draft: wall 6, gap y 3 size 1). */
function appendixState(): GameState {
  const s = initialState({
    id: 4,
    wall: { height: 6, gaps: [{ type: 'static', y: 3, size: 1 }] },
    plan: ['YY', 'WW', 'W.', 'WW', 'YY'],
    pieces: [
      ['D2_90', 'Y', 0, 7],
      ['D2_0', 'W', 2, 6],
      ['O4_0', 'G', 3, 4],
      ['B1_0', 'W', 5, 3],
      ['D2_90', 'Y', 0, 0],
      ['D2_90', 'W', 2, 0],
      ['D2_0', 'W', 4, 0],
    ],
    obstacles: [
      { type: 'crate', x: 5, y: 4, hp: 2 },
      { type: 'cement_bag', x: 0, y: 2 },
      { type: 'screw', x: 3, y: 4 },
      { type: 'key', x: 5, y: 3, id: 'a' },
    ],
  });
  toSite(s, 4, 6, 0);
  toSite(s, 5, 6, 1);
  toSite(s, 6, 6, 2);
  setHdr(s, H.turn, 3);
  setHdr(s, H.movesLeft, 11);
  return s;
}

describe('ASCII board (TECH Appendix A)', () => {
  it('prints the Appendix A example exactly', () => {
    expectAscii(
      appendixState(),
      `
      L4 turn 3 moves 11 seg 1/1 elev 0
       y  0 1 2 3 4 5 | W | 6 7
       9  . . . . . . | : | . .
       8  . . . . . . | : | . .
       7  y y w . . . | : | . .
       6  . . w . . . | : | . .
       5  . . . g g . | # | . .
       4  . . . g g 2 | # | . .
       3  . . . . . w | = | W .
       2  % . . . . . | # | W .
       1  . . . . . . | # | W W
       0  . . . . . . | # | Y Y
      plan seg0 (top→bottom): YY WW W. WW YY
      hidden: screw@(3,4) key:a@(5,3)
      `,
    );
  });

  it('ascii bag and blue block round-trip', () => {
    const s = initialState({
      id: 21,
      plan: ['BB'],
      pieces: [['B1_0', 'B', 1, 0]],
      obstacles: [{ type: 'cement_bag', x: 0, y: 0 }],
    });
    const colour = parseAscii(toAscii(s));
    expect(colour.cells[0]?.slice(0, 2)).toEqual(['%', 'b']);
    const idsText = toAscii(s, { ids: true });
    expect(idsText).toContain('obstacles: bag@(0,0)');
    expect(parseAscii(idsText).cells[0]?.slice(0, 2)).toEqual(['.', '0']);
    const back = fromAscii(s.lvl, idsText);
    expect(back.buf).toEqual(s.buf);
    expect(toAscii(back)).toBe(toAscii(s));
  });

  it('ids mode round-trips locked, stuck, queue, trowel, destroyed crates and collected items', () => {
    const s = appendixState();
    // stuck mortar on the window cell (7,2), one block in the truck queue, a trowel cell (7,3), crate gone,
    // screw collected
    toSite(s, 3, 7, 2, false);
    setFlag(s, 3, 'stuck', true);
    refreshSiteMasks(s, 0);
    vacatePiece(s, 0);
    enqueuePiece(s, 0);
    setSiteOcc(s, 0, 1, 3, SITE_TROWEL);
    refreshSiteMasks(s, 0);
    setObstacleField(s, 0, OF.hp, 0);
    setYardOcc(s, 5, 4, 0);
    setObstacleField(s, 2, OF.hp, 0);
    setHiddenCollected(s, 0, true);
    const text = toAscii(s, { ids: true });
    expect(text).toContain('queue: 0');
    expect(text).toContain('locked: 4 5 6');
    expect(text).toContain('stuck: 3');
    expect(text).toContain('hidden: key:a@(5,3)');
    const back = fromAscii(s.lvl, text);
    expect(toAscii(back, { ids: true })).toBe(text);
    expect(back.buf).toEqual(s.buf);
  });

  it('wall column: closed gap x, K-40 open shutter =, platform _ under the elevator offset', () => {
    const s = initialState({
      id: 37,
      wall: { height: 6, gaps: [{ type: 'shutter', y: 1, size: 1, period: 1, phase: 1 }] },
      plan: ['WW'],
      elevator: { range: [0, 1], start: 1, dir: 1 },
      pieces: [['B1_0', 'W', 0, 0]],
    });
    const wall = (t: GameState): string[] => [...parseAscii(toAscii(t)).wall];
    expect(wall(s)).toEqual(['#', 'x', '#', '#', '#', '#', ':', ':', ':', ':']);
    setHdr(s, H.openShutterUntil, 5);
    expect(wall(s)[1]).toBe('=');
    const board = parseAscii(toAscii(s));
    expect([board.cells[0]?.[6], board.cells[0]?.[7], board.cells[1]?.[6]]).toEqual(['_', '_', '.']);
    expect(board.elev).toBe(1);
  });

  it('parseAscii rejects malformed text and fromAscii needs ids mode', () => {
    expect(() => parseAscii('nonsense')).toThrow();
    const s = initialState({ pieces: [['B1_0', 'W', 0, 0]] });
    const text = toAscii(s);
    expect(() => parseAscii(text.split('\n').slice(0, 5).join('\n'))).toThrow();
    expect(() => fromAscii(s.lvl, text)).toThrow(/ids mode/);
  });
});
