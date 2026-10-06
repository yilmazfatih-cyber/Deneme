import { describe, expect, it } from 'vitest';
import { S2_planVoid } from '../../src/core/obstacles/S2_planVoid.ts';
import { activeRuleIds, infoKeysFor, levelHooks } from '../../src/core/obstacles/registry.ts';
import { computeFall } from '../../src/core/gravity.ts';
import { buildFront, isSegmentComplete } from '../../src/core/placement.ts';
import { grantTrowels, trowelRejection } from '../../src/core/combo.ts';
import { GameSession } from '../../src/core/session.ts';
import { ArraySink } from '../../src/core/moves.ts';
import { H, hdr, pieceX, pieceY, pieceZone, siteOcc } from '../../src/core/state.ts';
import { Zone } from '../../src/core/types.ts';
import type { At } from '../../src/core/types.ts';
import { initialState } from '../fixtures/builders.ts';
import type { LevelSpec } from '../fixtures/builders.ts';
import { N, RAIL, dragTo, expectConsistent, find, levelFile, run, types } from '../core/moves.fixtures.ts';
import { i18nText } from './obstacles.fixtures.ts';

const site = (x: number, y: number): At => ({ zone: 'site', x, y, seg: 0 });

/** OBSTACLES S2 example: column 7 is y0 W, y1 `.`, y2 W (plan top → bottom). */
const EXAMPLE: LevelSpec = {
  plan: ['WW', 'W.', 'WW'],
  pieces: [
    ['B1_0', 'W', 3, 0],
    ['B1_0', 'W', 2, 0],
  ],
};

/** Plan (bottom → top) `WW`, `W.`, `YY`: a C3 W fills the L, a D2_90 Y bridges both columns above the void. */
const BRIDGE: LevelSpec = {
  plan: ['YY', 'W.', 'WW'],
  pieces: [
    ['C3_0', 'W', 0, 0],
    ['D2_90', 'Y', 2, 0],
  ],
};

/** Plan (bottom → top) `W.`, `YY` with a debris block in the void (7,0) (E-43). */
const DEBRIS_IN_VOID: LevelSpec = {
  plan: ['YY', 'W.'],
  pieces: [
    ['B1_0', 'W', 0, 0],
    ['D2_90', 'Y', 2, 0],
  ],
  debris: [['B1_0', 'R', 7, 0]],
};

describe('S2 Plan Boşluğu — plan void (OBSTACLES S2, GDD K-15, K-16, K-17, K-34, E-43)', () => {
  it('S2 applies when a plan has a `.` cell (level 4) and carries the obs.s2.desc card in TR and EN', () => {
    expect(S2_planVoid.appliesTo(levelFile(4))).toBe(true);
    for (const id of [1, 2, 3, 5]) expect(S2_planVoid.appliesTo(levelFile(id)), `level ${id}`).toBe(false);
    expect(activeRuleIds(levelFile(4))).toEqual(['W1', 'S2']);
    expect(infoKeysFor(levelFile(4))).toContain('obs.s2.desc');
    for (const locale of ['tr', 'en'] as const) expect(i18nText(locale, 'obs.s2.desc')).toMatch(/\S/);
  });

  it('S2 K-17 OBSTACLES example: a block dropped onto the void is wrong (window) and bounces back to its start', () => {
    const s = initialState(EXAMPLE);
    expect(run(s, dragTo(0, 7, 8)).ev.map((e) => e.t)).toContain('placementCorrect'); // (7,0) W
    const before = hdr(s, H.movesLeft);
    const { ev } = run(s, dragTo(1, 7, 8));
    expect(find(ev, 'pieceFell').to).toMatchObject({ zone: 'site', x: 7, y: 1 });
    expect(find(ev, 'placementWrong')).toMatchObject({ pieceId: 1, reasons: ['window'] });
    expect(find(ev, 'pieceBounced')).toMatchObject({ reason: 'window', to: { zone: 'yard', x: 2, y: 0 } });
    expect(hdr(s, H.movesLeft)).toBe(before - 1);
    expect([pieceZone(s, 1), pieceX(s, 1), pieceY(s, 1)]).toEqual([Zone.yard, 2, 0]);
    expect(siteOcc(s, 0, 1, 1)).toBe(0); // the void is still empty
    expectConsistent(s);
  });

  it('S2 K-18 the shadow verdict already shows the void before the release (registry fall hooks)', () => {
    const s = initialState(EXAMPLE);
    run(s, dragTo(0, 7, 8));
    const shadow = computeFall(s, 1, N(7, 8), { rules: levelHooks(s.lvl).fall });
    expect(shadow.landing).toMatchObject({ ix: 7, iy: 1 });
    expect(shadow.verdict).toMatchObject({ ok: false, reasons: ['window'] });
  });

  it('S2 K-34 a 2-wide block bridging both columns over the wall fills the cell above an empty void', () => {
    const s = initialState(BRIDGE);
    const l = run(s, dragTo(0, 6, 8));
    expect(find(l.ev, 'placementCorrect').cells).toEqual([site(6, 0), site(7, 0), site(6, 1)]);
    const bridge = run(s, dragTo(1, 6, 8));
    expect(find(bridge.ev, 'placementCorrect')).toMatchObject({
      pieceId: 1,
      overWall: true,
      cells: [site(6, 2), site(7, 2)],
    });
    expect(siteOcc(s, 0, 1, 1)).toBe(0); // (7,1) stays empty under the bridge
  });

  it('S2 K-15 a segment is complete with its void cells empty', () => {
    const s = initialState(BRIDGE);
    run(s, dragTo(0, 6, 8));
    expect(isSegmentComplete(s, 0)).toBe(false);
    const { ev, res } = run(s, dragTo(1, 6, 8));
    expect(isSegmentComplete(s, 0)).toBe(true);
    expect(find(ev, 'segmentCompleted').seg).toBe(0);
    expect(res.won).toBe(true);
  });

  it('S2 K-34 the build front skips an empty void and offers the cell above it', () => {
    const s = initialState(BRIDGE);
    expect(buildFront(s)).toEqual([site(6, 0), site(7, 0)]);
    run(s, dragTo(0, 6, 8));
    expect(buildFront(s)).toEqual([site(6, 2), site(7, 2)]);
  });

  it('S2 K-33 the Golden Trowel can fill the cell above an empty void, never the void itself', () => {
    const s = initialState(BRIDGE);
    run(s, dragTo(0, 6, 8));
    grantTrowels(s, 1);
    expect(trowelRejection(s, { seg: 0, x: 1, y: 1 })).toBe('notBuildFront');
    const { res, ev } = run(s, { kind: 'trowel', seg: 0, x: 1, y: 2 });
    expect(res.status).toBe('applied');
    expect(find(ev, 'boosterApplied').booster).toBe('trowel');
    expect(siteOcc(s, 0, 1, 1)).toBe(0);
    expect(siteOcc(s, 0, 1, 2)).not.toBe(0);
  });

  it('S2 E-43 a void holding debris is not filled: no build front in that column, the block above it is wrong (support)', () => {
    const s = initialState(DEBRIS_IN_VOID);
    expect(buildFront(s)).toEqual([site(6, 0)]);
    run(s, dragTo(0, 6, 8)); // (6,0) W
    expect(buildFront(s)).toEqual([site(6, 1)]);
    const { ev } = run(s, dragTo(1, 6, 8)); // lands on (6,1)–(7,1): right colours, but the void holds debris
    expect(find(ev, 'placementWrong')).toMatchObject({ reasons: ['support'], missingSupport: [site(7, 0)] });
    expect(find(ev, 'pieceBounced').reason).toBe('support');

    // the same move without the debris is correct (an empty void counts as filled)
    const clean = initialState({ ...DEBRIS_IN_VOID, debris: [] });
    run(clean, dragTo(0, 6, 8));
    expect(types(run(clean, dragTo(1, 6, 8)).ev)).toContain('placementCorrect');
  });

  it('S2 K-34 level 4: the lintel railed in before the wall below the window is wrong for support (LEVELS note)', () => {
    const session = GameSession.start(levelFile(4));
    session.commit(dragTo(0, 6, 8)); // a: Y row 0
    const { state } = session;
    // (6,1), (6,2), (7,1) are still empty W cells; the empty window (7,2) counts as filled
    const missing = [site(6, 1), site(6, 2), site(7, 1)];
    const shadow = computeFall(state, 2, RAIL(0, 6, 3), { rules: levelHooks(state.lvl).fall });
    expect(shadow.verdict).toMatchObject({ ok: false, reasons: ['support'], missingSupport: missing });
    const sink = new ArraySink();
    session.commit(dragTo(2, 6, 3, 0), sink);
    expect(find(sink.events, 'pieceBounced')).toMatchObject({
      reason: 'support',
      missingSupport: missing,
      to: { zone: 'yard', x: 4, y: 3 },
    });
  });

  it('S2 level 4 hand solution: the lintel goes through the gap above the window (4 moves, 8 left, YAO 3/4)', () => {
    const session = GameSession.start(levelFile(4));
    const moves = [dragTo(0, 6, 8), dragTo(1, 6, 8), dragTo(2, 6, 3, 0), dragTo(3, 6, 8)];
    const results = moves.map((m) => session.commit(m));
    expect(results.map((r) => r.status)).toEqual(['applied', 'applied', 'applied', 'applied']);
    expect(session.outcome).toBe('won');
    expect(session.movesLeft).toBe(8);
    expect(session.yao()).toEqual({ overWall: 3, rail: 1, yao: 0.75 });
    expect(siteOcc(session.state, 0, 1, 2)).toBe(0); // the window (7,2) stays open
    expect(hdr(session.state, H.wrongCount)).toBe(0);
  });
});
