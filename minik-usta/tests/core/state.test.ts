import { describe, expect, it } from 'vitest';
import {
  FLAG_BIT,
  GF,
  H,
  HEADER_SIZE,
  OF,
  PF,
  PIECE_STRIDE,
  bitsToFlags,
  cloneState,
  computeLayout,
  decodeState,
  encodeState,
  enqueuePiece,
  flagsToBits,
  gapField,
  hasFlag,
  hdr,
  obstacleField,
  pieceField,
  queueIds,
  readPiece,
  removeQueueAt,
  setFlag,
  setHdr,
  setPieceX,
  siteOcc,
  wrongOccMask,
  yardOcc,
} from '../../src/core/state.ts';
import { Zone } from '../../src/core/types.ts';
import { stateInvariantErrors } from '../../src/core/grid.ts';
import { compiledLevel, initialState } from '../fixtures/builders.ts';

describe('state buffer (TECH §2.4, D-052)', () => {
  it('layout follows the TECH §2.4 table: header 18, yardOcc 60, siteOcc S×16, filled/wrongOcc S×2, pieces P×9', () => {
    const L = computeLayout({ segments: 5, pieces: 40, gaps: 3, obstacles: 8, hidden: 4, goals: 3 });
    expect(HEADER_SIZE).toBe(18);
    expect(PIECE_STRIDE).toBe(9);
    expect(L.yardOcc).toBe(18);
    expect(L.siteOcc).toBe(18 + 60);
    expect(L.filled).toBe(L.siteOcc + 80);
    expect(L.wrongOcc).toBe(L.filled + 10);
    expect(L.pieces).toBe(L.wrongOcc + 10);
    // the fixed part of the typical level: 18 + 60 + 80 + 10 + 10 + 360 = 538 (TECH §2.4)
    expect(L.pieces + 40 * PIECE_STRIDE).toBe(538);
    expect(L.size).toBe(538 + 9 + 16 + 4 + 3 + 40 + 5);
  });

  it('K-25 initial state: batch 0 in the yard, trucks pending, help slots gone, header start values', () => {
    const s = initialState({
      id: 17,
      moves: 13,
      seed: 99,
      plan: [['WW', 'WW'], ['YY']],
      pieces: [
        ['O4_0', 'W', 0, 0],
        ['D2_90', 'Y', 2, 7],
      ],
      batches: [{ forSegment: 1, pieces: [['B1_0', 'Y', 0, 8]] }],
      debris: [['B1_0', 'W', 7, 1]],
      obstacles: [
        { type: 'crate', x: 4, y: 0, hp: 2 },
        { type: 'cement_bag', x: 5, y: 0 },
        { type: 'screw', x: 0, y: 0 },
      ],
    });
    expect(hdr(s, H.movesLeft)).toBe(13);
    expect(hdr(s, H.rng)).toBe(99);
    expect(hdr(s, H.turn)).toBe(0);
    expect(yardOcc(s, 1, 1)).toBe(1);
    expect(yardOcc(s, 3, 7)).toBe(2);
    expect(yardOcc(s, 4, 0)).toBe(-1);
    expect(yardOcc(s, 5, 0)).toBe(-2);
    expect(obstacleField(s, 0, OF.hp)).toBe(2);
    expect(readPiece(s, 2).zone).toBe('pending');
    expect(readPiece(s, 3)).toMatchObject({
      zone: 'site',
      x: 7,
      y: 1,
      seg: 0,
      debris: true,
      shape: 'B1_0',
      color: 'W',
    });
    expect(siteOcc(s, 0, 1, 1)).toBe(4);
    expect(wrongOccMask(s, 0, 1)).toBe(0b10);
    expect(readPiece(s, s.lvl.helpPieceBase).zone).toBe('gone');
    expect(pieceField(s, 0, PF.arrivedTurn)).toBe(-1);
    expect(stateInvariantErrors(s)).toEqual([]);
  });

  it('K-24 W4 W5 W7 start values: elevator offset/direction, shutter phase, slider direction, locked closed', () => {
    const s = initialState({
      id: 40,
      wall: {
        height: 8,
        gaps: [
          { type: 'shutter', y: 0, size: 1, period: 2, phase: 2 },
          { type: 'slider', y: 3, size: 1, range: [2, 4], dir: -1 },
          { type: 'locked', y: 6, size: 1, keyId: 'a' },
        ],
      },
      elevator: { range: [0, 2], start: 2, dir: 1 },
      pieces: [['B1_0', 'W', 0, 0]],
    });
    expect([hdr(s, H.elev), hdr(s, H.elevDir)]).toEqual([2, 1]);
    // OBSTACLES W4: open ⇔ floor((m + phase) / period) even → m 0, phase 2, period 2 → 1 → closed
    expect(gapField(s, 0, GF.open)).toBe(0);
    expect(gapField(s, 0, GF.phase)).toBe(2);
    expect([gapField(s, 1, GF.open), gapField(s, 1, GF.y), gapField(s, 1, GF.phase)]).toEqual([1, 3, -1]);
    expect(gapField(s, 2, GF.open)).toBe(0);
  });

  it('cloneState: changes to the copy never leak into the original', () => {
    const s = initialState({ pieces: [['B1_0', 'W', 0, 0]] });
    const before = s.buf.slice();
    const c = cloneState(s);
    setHdr(c, H.turn, 5);
    setPieceX(c, 0, 3);
    expect(s.buf).toEqual(before);
    expect(c.lvl).toBe(s.lvl);
  });

  it('encodeState / decodeState round-trip and length check', () => {
    const s = initialState({
      seed: -123456,
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['O4_0', 'Y', 2, 0],
      ],
    });
    setHdr(s, H.combo, 7);
    const text = encodeState(s);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = decodeState(s.lvl, text);
    expect(back.buf).toEqual(s.buf);
    expect(() =>
      decodeState(compiledLevel({ plan: [['WW'], ['WW']], pieces: [['B1_0', 'W', 0, 0]] }), text),
    ).toThrow();
    expect(() => decodeState(s.lvl, `${text.slice(0, -1)}!`)).toThrow();
  });

  it('K-26 queue is FIFO: append at the end, removal keeps the order of the others', () => {
    const s = initialState({
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'W', 1, 0],
        ['B1_0', 'W', 2, 0],
      ],
    });
    for (const id of [2, 0, 1]) {
      s.buf[s.lvl.layout.pieces + id * PIECE_STRIDE + PF.zone] = Zone.gone;
      enqueuePiece(s, id);
    }
    expect(queueIds(s)).toEqual([2, 0, 1]);
    expect(readPiece(s, 0).zone).toBe('queue');
    expect(removeQueueAt(s, 1)).toBe(0);
    expect(queueIds(s)).toEqual([2, 1]);
    expect(hdr(s, H.queueLen)).toBe(2);
  });

  it('piece flag bits round-trip and setFlag toggles one bit', () => {
    expect(bitsToFlags(flagsToBits(['glass', 'stuck', 'locked']))).toEqual(['glass', 'locked', 'stuck']);
    const s = initialState({ pieces: [['B1_0', 'W', 0, 0, ['glass']]] });
    expect(hasFlag(s, 0, 'glass')).toBe(true);
    setFlag(s, 0, 'locked', true);
    setFlag(s, 0, 'glass', false);
    expect(pieceField(s, 0, PF.flags)).toBe(FLAG_BIT.locked);
  });
});
