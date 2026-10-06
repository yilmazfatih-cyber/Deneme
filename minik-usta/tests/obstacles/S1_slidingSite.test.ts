import { describe, expect, it } from 'vitest';
import { S1_slidingSite } from '../../src/core/obstacles/S1_slidingSite.ts';
import { activeRuleIds, infoKeysFor } from '../../src/core/obstacles/registry.ts';
import { ArraySink } from '../../src/core/moves.ts';
import { GameSession } from '../../src/core/session.ts';
import { validateLevelJson } from '../../src/core/level/logic.ts';
import { H, createInitialState, hdr, pieceSeg, pieceZone, queueIds, siteOcc } from '../../src/core/state.ts';
import { Zone } from '../../src/core/types.ts';
import type { PieceId } from '../../src/core/types.ts';
import { compiledLevel, initialState, levelJson } from '../fixtures/builders.ts';
import type { LevelSpec, PieceSpec } from '../fixtures/builders.ts';
import { HAND, dragTo, expectConsistent, find, levelFile, run, types } from '../core/moves.fixtures.ts';
import { i18nText } from './obstacles.fixtures.ts';

/** Level 5 truck batch (`k1_0` … `k1_3`). */
const TRUCK: readonly PieceId[] = [13, 14, 15, 16];

/**
 * Two one-row segments `WW` → `RR`; the yard is full except for the W block on top (piece 0). The truck brings two
 * R blocks (24, 25) but only the two cells the W block leaves have room.
 */
function fullYard(): LevelSpec {
  const fillers: PieceSpec[] = [];
  for (let y = 0; y <= 6; y++) for (const x of [0, 2, 4]) fillers.push(['D2_90', 'G', x, y]);
  fillers.push(['D2_90', 'G', 0, 7], ['D2_90', 'G', 2, 7]);
  return {
    plan: [['WW'], ['RR']],
    pieces: [['D2_90', 'W', 4, 7], ...fillers],
    batches: [
      {
        forSegment: 1,
        pieces: [
          ['D2_90', 'R', 4, 8],
          ['D2_90', 'R', 0, 8],
        ],
      },
    ],
  };
}

describe('S1 Kayan Şantiye — sliding site (OBSTACLES S1, GDD K-22, K-25, K-26)', () => {
  it('S1 applies to segments mode with 2–5 segments only (level 5), with the obs.s1.desc card in TR and EN', () => {
    expect(S1_slidingSite.appliesTo(levelFile(5))).toBe(true);
    expect(activeRuleIds(levelFile(5))).toEqual(['S1']);
    expect(infoKeysFor(levelFile(5))).toEqual(['obs.s1.desc']);
    for (const id of [1, 2, 3, 4]) expect(S1_slidingSite.appliesTo(levelFile(id)), `level ${id}`).toBe(false);
    const carousel = compiledLevel({
      plan: [['WW'], ['WW']],
      mode: 'carousel',
      carouselEvery: 2,
      pieces: [['B1_0', 'W', 0, 0]],
    });
    expect(S1_slidingSite.appliesTo(carousel)).toBe(false); // S5, not S1
    for (const locale of ['tr', 'en'] as const) expect(i18nText(locale, 'obs.s1.desc')).toMatch(/\S/);
  });

  it('S1 K-22 a level has 1–5 segments (schema)', () => {
    const plan = (n: number): string[][] => Array.from({ length: n }, () => ['WW']);
    const pieces: PieceSpec[] = [['B1_0', 'W', 0, 0]];
    expect(validateLevelJson(levelJson({ plan: plan(5), pieces })).level).not.toBeNull();
    const six = validateLevelJson(levelJson({ plan: plan(6), pieces }));
    expect(six.level).toBeNull();
    expect(six.issues.map((i) => i.code)).toContain('schema_invalid');
  });

  it('S1 K-25 the truck batch of segment 2 stays off the board until segment 1 is complete', () => {
    const s = createInitialState(levelFile(5));
    for (const id of TRUCK) expect(pieceZone(s, id), `piece ${id}`).toBe(Zone.pending);
    expect(queueIds(s)).toEqual([]);
    run(s, HAND[5][0] ?? dragTo(2, 6, 8));
    run(s, HAND[5][1] ?? dragTo(1, 6, 8));
    for (const id of TRUCK) expect(pieceZone(s, id), `piece ${id}`).toBe(Zone.pending);
    expect(hdr(s, H.activeSeg)).toBe(0);
  });

  it('S1 K-22 completing the active segment shifts the site in step 8; the truck delivers in step 9 (level 5 move 3)', () => {
    const s = createInitialState(levelFile(5));
    run(s, HAND[5][0] ?? dragTo(2, 6, 8));
    run(s, HAND[5][1] ?? dragTo(1, 6, 8));
    const { ev } = run(s, HAND[5][2] ?? dragTo(0, 6, 8));
    expect(find(ev, 'segmentCompleted')).toMatchObject({ seg: 0, step: 8 });
    expect(find(ev, 'siteShifted')).toMatchObject({ toSeg: 1, step: 8 });
    // FIFO: k1_0 … k1_2 land, k1_3 finds no room yet and waits ("Kamyonda: 1", K-26)
    expect(find(ev, 'deliveryArrived')).toMatchObject({ step: 9, seg: 1, pieces: [13, 14, 15] });
    expect(find(ev, 'deliveryQueued')).toMatchObject({ step: 9, queued: 1 });
    expect(queueIds(s)).toEqual([16]);
    expect(types(ev).indexOf('siteShifted')).toBeLessThan(types(ev).indexOf('deliveryArrived'));
    expect(hdr(s, H.activeSeg)).toBe(1);
    // the new segment comes empty; the finished one keeps its locked blocks (panorama, K-06)
    for (let sy = 0; sy < 8; sy++) for (const sx of [0, 1]) expect(siteOcc(s, 1, sx, sy)).toBe(0);
    for (const id of [0, 1, 2]) {
      expect(pieceZone(s, id)).toBe(Zone.site);
      expect(pieceSeg(s, id)).toBe(0);
    }
    expectConsistent(s);
  });

  it('S1 K-22 the next move plays on segment 2 (GDD example: the move after the shift builds Sağ Oda)', () => {
    const s = createInitialState(levelFile(5));
    for (const m of HAND[5].slice(0, 3)) run(s, m);
    const { ev } = run(s, HAND[5][3] ?? dragTo(15, 6, 8));
    const placed = find(ev, 'placementCorrect');
    expect(placed.cells.every((c) => c.seg === 1)).toBe(true);
    expect(pieceSeg(s, placed.pieceId)).toBe(1);
    expect(types(ev)).not.toContain('siteShifted');
    // the waiting k1_3 comes in this move's step 9, where the moved block left room
    expect(find(ev, 'deliveryArrived')).toMatchObject({ step: 9, pieces: [16] });
    expect(queueIds(s)).toEqual([]);
  });

  it('S1 K-22 after the last segment there is no shift: step 11 wins (level 5 hand solution, 5 moves left)', () => {
    const session = GameSession.start(levelFile(5));
    const moves = HAND[5];
    for (const m of moves.slice(0, -1)) expect(session.commit(m).status).toBe('applied');
    const sink = new ArraySink();
    const last = session.commit(moves[moves.length - 1] ?? dragTo(14, 6, 8), sink);
    expect(last.won).toBe(true);
    expect(session.outcome).toBe('won');
    expect(session.movesLeft).toBe(5);
    expect(find(sink.events, 'segmentCompleted')).toMatchObject({ seg: 1, step: 8 });
    expect(types(sink.events)).not.toContain('siteShifted');
    expect(find(sink.events, 'levelWon')).toMatchObject({ step: 11, movesLeft: 5 });
    expect(session.yao()).toEqual({ overWall: 6, rail: 0, yao: 1 });
  });

  it('S1 K-26 a truck block without room waits in the queue ("Kamyonda: 1") and comes in a later step 9', () => {
    const s = initialState(fullYard());
    const shift = run(s, dragTo(0, 6, 8));
    expect(find(shift.ev, 'siteShifted').toSeg).toBe(1);
    expect(find(shift.ev, 'deliveryArrived').pieces).toEqual([24]);
    expect(find(shift.ev, 'deliveryQueued')).toMatchObject({ queued: 1, step: 9 });
    expect(queueIds(s)).toEqual([25]);
    expect(pieceZone(s, 25)).toBe(Zone.queue);

    const next = run(s, dragTo(24, 6, 8)); // frees the only two cells; the waiting block lands there
    expect(find(next.ev, 'deliveryArrived')).toMatchObject({ pieces: [25], step: 9 });
    expect(find(next.ev, 'deliveryQueued').queued).toBe(0);
    expect(pieceZone(s, 25)).toBe(Zone.yard);
    expect(next.res.won).toBe(true);
    expectConsistent(s);
  });
});
