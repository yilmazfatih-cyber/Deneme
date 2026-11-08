import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compile } from '../../src/core/level/compile.ts';
import type { CompiledLevel } from '../../src/core/level/compile.ts';
import type { LevelData, TutCondition } from '../../src/core/level/schema.ts';
import { levelHooks } from '../../src/core/obstacles/registry.ts';
import { ArraySink, applyMove, isLevelWon } from '../../src/core/moves.ts';
import { FREE, railMode, tryBeginDrag } from '../../src/core/movement.ts';
import { GameSession } from '../../src/core/session.ts';
import { cloneState, createInitialState, pieceZone } from '../../src/core/state.ts';
import type { GameState } from '../../src/core/state.ts';
import { Zone } from '../../src/core/types.ts';
import type { DragNode, GameEvent, Move, SessionAction } from '../../src/core/types.ts';
import { createLayout } from '../../src/theme/layout.ts';
import { TOKENS } from '../../src/theme/tokens.ts';
import { ContextTips, ctxFromMove } from '../../src/scenes/level/tutorial/contextTips.ts';
import type { CtxTopic } from '../../src/scenes/level/tutorial/contextTips.ts';
import { canProduce } from '../../src/scenes/level/tutorial/guarantee.ts';
import {
  blockerRects,
  bubbleBoxWidths,
  bubbleCandidates,
  bubbleForbidden,
  darkRects,
  handStrips,
  highlightAll,
  highlightRects,
  insideAny,
  padRect,
  placeBubble,
  spotlight,
  spotlightHoles,
  yardBlockRects,
} from '../../src/scenes/level/tutorial/highlights.ts';
import type { BubbleQuery, BubbleSize } from '../../src/scenes/level/tutorial/highlights.ts';
import { rectsOverlap } from '../../src/theme/layout.ts';
import type { Layout } from '../../src/theme/layout.ts';
import { UI } from '../../src/ui/uiConstants.ts';
import {
  TutorialController,
  TutorialResume,
  highlightedPieces,
  replayTutorialAction,
} from '../../src/scenes/level/tutorial/TutorialController.ts';
import type { SavedTutorialPosition } from '../../src/scenes/level/tutorial/TutorialController.ts';
import { pauseHitRect } from '../../src/ui/PauseButton.ts';
import { moveMatches } from '../../src/scenes/level/tutorial/tutorialEvents.ts';
import { handMoves, levelFile } from '../core/moves.fixtures.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function rawLevel(id: number): LevelData {
  return JSON.parse(
    readFileSync(join(ROOT, 'levels', `level_${String(id).padStart(3, '0')}.json`), 'utf8'),
  ) as LevelData;
}

interface Run {
  readonly lvl: CompiledLevel;
  readonly game: GameSession;
  readonly tut: TutorialController;
  readonly ended: [number, boolean][];
  readonly tips: string[];
  /** Commits a move and reports it to the controller like LevelScene.planEnded does. */
  play(move: Move, now?: number): GameEvent[];
}

function run(lvl: CompiledLevel, game: GameSession = GameSession.start(lvl)): Run {
  const ended: [number, boolean][] = [];
  const tips: string[] = [];
  const hooks = levelHooks(lvl);
  const tut = new TutorialController(lvl, {
    state: () => game.state,
    dragRules: () => hooks.drag ?? {},
    hooks: () => hooks,
    markContextTip: (t) => tips.push(t),
    stepEnded: (step, skipped) => ended.push([step, skipped]),
  });
  return {
    lvl,
    game,
    tut,
    ended,
    tips,
    play(move, now = 0) {
      const sink = new ArraySink();
      const res = game.commit(move, sink);
      expect(res.status).toBe('applied');
      tut.moveEnded(sink.events, now);
      return sink.events;
    },
  };
}

const step = (r: Run): number | null => r.tut.current?.data.step ?? null;

// --- UX 13.1 bubble placement helpers (Faz 2 tur 2b) ----------------------------------------------------------------------

const M = TOKENS.layout.marginPx;
const PAUSE = (layout: Layout) => pauseHitRect(layout.top.pause);
const rectRightOf = (r: { x: number; w: number }): number => r.x + r.w;
/** Every level 1–5 line: 2 lines in a box ≥ 600 px (bust height), 3 in the narrow one. */
const size = (maxW: number): BubbleSize => ({
  w: UI.dedeBustPx + 16 + Math.min(maxW, 700),
  h: maxW < 600 ? 229 : UI.dedeBustPx,
  lines: maxW < 600 ? 3 : 2,
});
const query = (layout: Layout, over: Partial<BubbleQuery>): BubbleQuery => ({
  layout,
  lit: [],
  handPath: [],
  yardBlocks: [],
  panoramaLit: false,
  size,
  ...over,
});

describe('GDD 14.1 TutorialController on the level 1–5 tutorials (UX 13.2)', () => {
  it('GDD 14.1 level 1: lift (required, overWall) → drop → match along the hand solution', () => {
    const r = run(levelFile(1));
    r.tut.start(0);
    expect(step(r)).toBe(1);
    expect(r.tut.current?.required).toBe(true);
    const a = r.lvl.tutorialPieceIds.get('piece:0');
    expect(r.tut.current?.pieces).toEqual([a]);
    // UX 13.1: the glove leaves at the first correct touch (the highlighted block is lifted)
    r.tut.dragStarted(a ?? -1);
    expect(r.tut.current?.handHidden).toBe(true);
    // the overWall signal ends step 1 while the block is still in the air; step 2 starts at once
    r.tut.dragSignal('overWall', 10);
    expect(step(r)).toBe(2);
    const [m1, m2] = handMoves(1);
    if (!m1 || !m2) throw new Error('hand moves');
    r.play(m1, 20);
    expect(step(r)).toBe(3);
    r.play(m2, 30);
    expect(r.tut.finished).toBe(true);
    expect(r.ended).toEqual([
      [1, false],
      [2, false],
      [3, false],
    ]);
  });

  it('tutorial overWall counts at first crossing even if drag is cancelled', () => {
    const r = run(levelFile(1));
    r.tut.start(0);
    r.tut.dragStarted(0);
    r.tut.dragSignal('overWall', 5);
    r.tut.dragSignal('overWall', 6); // once per drag
    expect(r.ended).toEqual([[1, false]]);
    expect(step(r)).toBe(2);
  });

  it('GDD 14.1 required tutorial step never locks (the highlighted block can no longer cross the wall)', () => {
    const lvl = levelFile(1);
    const game = GameSession.start(lvl);
    const [m1] = handMoves(1);
    if (!m1) throw new Error('hand moves');
    game.commit(m1); // piece:0 is placed and locked (K-14)
    const r = run(lvl, game);
    r.tut.start(0);
    expect(r.ended[0]).toEqual([1, true]);
    expect(step(r)).toBe(2);
  });

  it('GDD 14.1 required step (level 3) is checked again after every move; the rail line stays for the next move', () => {
    const r = run(levelFile(3));
    r.tut.start(0);
    expect(step(r)).toBe(1);
    const [m1, m2, m3] = handMoves(3);
    if (!m1 || !m2 || !m3) throw new Error('hand moves');
    r.play(m1);
    expect(step(r)).toBe(2);
    expect(r.tut.current?.required).toBe(true);
    const f = r.lvl.tutorialPieceIds.get('piece:1');
    const hooks = levelHooks(r.lvl);
    const rules = { drag: hooks.drag ?? {}, hooks };
    expect(canProduce(r.game.state, { event: 'gapPass' }, [f ?? -1], rules)).toBe(true);
    expect(canProduce(r.game.state, { event: 'placementCorrect' }, [f ?? -1], rules)).toBe(true);
    // LEVELS Bölüm 3: step 2 ends when f is on the rail (placementCorrect), not when it enters the gap
    r.tut.dragSignal('gapPass', 1);
    expect(step(r)).toBe(2);
    r.play(m2);
    expect(step(r)).toBe(3); // tut.l3.rail is on screen at the start of the b move
    r.play(m3);
    expect(r.tut.finished).toBe(true);
    expect(r.ended).toEqual([
      [1, false],
      [2, false],
      [3, false],
    ]);
  });

  it('GDD 14.1 holdOverBuild needs minMs (synthetic level 2 tutorial; levels 1–50 do not use it, LEVELS §5)', () => {
    // the pre-Faz 2 tur 3 level 2 step 2 shape: `holdOverBuild` stays in the GDD §14.1/3 vocabulary, only level data
    // 1–50 do not use it (product-lead PL-F2T3-0)
    const tutorial = [
      {
        step: 1,
        mode: 'soft' as const,
        highlight: ['panorama', 'build'],
        textKey: 'tut.l2.pattern',
        done: { event: 'placementCorrect' as const, count: 1 },
      },
      {
        step: 2,
        mode: 'soft' as const,
        highlight: ['piece:2', 'build'],
        textKey: 'tut.l2.shadow',
        done: { event: 'holdOverBuild' as const, count: 1, minMs: 500 },
      },
      {
        step: 3,
        mode: 'soft' as const,
        highlight: ['piece:1'],
        textKey: 'tut.l1.match',
        done: { event: 'placementCorrect' as const, count: 1 },
      },
    ];
    const r = run(compile({ ...rawLevel(2), tutorial }));
    r.tut.start(0);
    const [m1] = handMoves(2);
    if (!m1) throw new Error('hand moves');
    expect(r.tut.holdMinMs()).toBeNull(); // step 1 does not listen for it
    r.play(m1);
    expect(step(r)).toBe(2);
    expect(r.tut.holdMinMs()).toBe(500);
    r.tut.dragStarted(2);
    r.tut.dragSignal('holdOverBuild', 0, 499);
    expect(step(r)).toBe(2);
    r.tut.dragSignal('holdOverBuild', 0, 500);
    expect(step(r)).toBe(3);
    expect(r.tut.holdMinMs()).toBeNull();
  });

  it('LEVELS 5 levels 1–5 data use no holdOverBuild (done / startOn), so no hold timer runs in them', () => {
    for (const n of [1, 2, 3, 4, 5] as const) {
      for (const st of levelFile(n).data.tutorial ?? []) {
        expect('event' in st.done ? st.done.event : 'timeoutMs', `level ${n} step ${st.step}`).not.toBe(
          'holdOverBuild',
        );
        expect(st.startOn?.event, `level ${n} step ${st.step}`).not.toBe('holdOverBuild');
      }
    }
  });

  it('GDD 14.1 ctx step marks seenContextTips (level 4 step 2 opens at the first correct placement, no timer)', () => {
    const r = run(levelFile(4));
    r.tut.start(1000);
    expect(step(r)).toBe(1);
    r.tut.update(1000 + 60_000);
    expect(step(r)).toBe(1);
    expect(r.tips).toEqual([]);
    const [m1] = handMoves(4);
    if (!m1) throw new Error('hand moves');
    r.play(m1, 2000);
    expect(step(r)).toBe(2);
    expect(r.tips).toEqual(['support']);
  });

  it('GDD 14.1 timeoutMs ends a step by itself', () => {
    const tutorial = [
      {
        step: 1,
        mode: 'soft' as const,
        highlight: ['cell:7,2'],
        textKey: 'tut.l4.window',
        done: { timeoutMs: 2500 },
      },
      {
        step: 2,
        mode: 'soft' as const,
        highlight: ['front'],
        textKey: 'tut.ctx.support',
        done: { event: 'placementCorrect' as const, count: 1 },
      },
    ];
    const r = run(compile({ ...rawLevel(4), tutorial }));
    r.tut.start(1000);
    r.tut.update(1000 + 2499);
    expect(step(r)).toBe(1);
    r.tut.update(1000 + 2500);
    expect(step(r)).toBe(2);
    expect(r.tips).toEqual(['support']);
  });

  it('tutorial move-end events count once per move or booster use (level 4: first and second correct placement)', () => {
    const r = run(levelFile(4));
    r.tut.start(0);
    const [m1, m2] = handMoves(4);
    if (!m1 || !m2) throw new Error('hand moves');
    r.play(m1);
    expect(step(r)).toBe(2);
    r.play(m2);
    expect(step(r)).toBe(3);
  });

  it('GDD 14.1 level 5: segmentDone, then deliveryDone (truck)', () => {
    const r = run(levelFile(5));
    r.tut.start(0);
    const moves = handMoves(5);
    let i = 0;
    while (step(r) === 1) r.play(moves[i++] as Move);
    expect(step(r) ?? (r.tut.finished ? 'finished' : null)).not.toBe(1);
    expect(r.ended.map((e) => e[0])).toContain(1);
    while (!r.tut.finished && i < moves.length) r.play(moves[i++] as Move);
    expect(r.tut.finished).toBe(true);
  });

  it('GDD 14.1 startOn waits for the event, then starts step; never firing hides the rest', () => {
    const data = rawLevel(5);
    const tutorial = [
      {
        step: 1,
        mode: 'soft' as const,
        highlight: ['truck'],
        textKey: 'tut.l5.truck',
        startOn: { event: 'deliveryDone' as const },
        done: { timeoutMs: 2500 },
      },
    ];
    const lvl = compile({ ...data, tutorial });
    const r = run(lvl);
    r.tut.start(0);
    expect(r.tut.current).toBeNull();
    expect(r.tut.waiting?.step).toBe(1);
    const moves = handMoves(5);
    r.play(moves[0] as Move, 100);
    r.play(moves[1] as Move, 200);
    expect(r.tut.current).toBeNull();
    r.play(moves[2] as Move, 300); // segment 0 done → truck delivers (step 9)
    expect(r.tut.current?.data.step).toBe(1);
    expect(r.tut.current?.since).toBe(300);

    const never = run(lvl);
    never.tut.start(0);
    never.tut.stop();
    expect(never.tut.finished).toBe(true);
    expect(never.ended).toEqual([]);
  });

  it('tutorial done.at counts only at anchor', () => {
    const lvl = levelFile(1);
    const g = GameSession.start(lvl);
    const [m1] = handMoves(1);
    if (!m1) throw new Error('hand moves');
    const sink = new ArraySink();
    g.commit(m1, sink);
    const at = (x: number, y: number): TutCondition => ({ event: 'placementCorrect', at: [x, y] });
    expect(moveMatches(at(6, 0), sink.events, g.state)).toBe(true);
    expect(moveMatches(at(6, 1), sink.events, g.state)).toBe(false);
    expect(moveMatches({ event: 'turnEnd' }, sink.events, g.state)).toBe(true);
    expect(moveMatches({ event: 'segmentDone' }, sink.events, g.state)).toBe(false);
    expect(moveMatches({ event: 'overWall' }, sink.events, g.state)).toBe(false);
  });

  it('UX 13.1 piece highlights resolve through CompiledLevel.tutorialPieceIds', () => {
    const lvl = levelFile(5);
    expect(highlightedPieces(lvl, ['panorama', 'piece:1', 'piece:k1_0'])).toEqual([
      lvl.tutorialPieceIds.get('piece:1'),
      lvl.tutorialPieceIds.get('piece:k1_0'),
    ]);
  });
});

describe('UX 13.2 contextual tips tut.ctx.* (GDD 14.1/2, K-34 hook 4)', () => {
  const ev = (body: Record<string, unknown>, step = 3): GameEvent =>
    ({ seq: 0, step, ...body }) as unknown as GameEvent;

  it('K-34 the first support bounce triggers tut.ctx.support; colour / window / off-plan bounces their own line', () => {
    expect(
      ctxFromMove(
        [ev({ t: 'pieceBounced', pieceId: 1, reason: 'support', missingSupport: [], viaDrop: true })],
        9,
        3,
        5,
      ),
    ).toEqual(['support']);
    expect(
      ctxFromMove(
        [ev({ t: 'placementWrong', pieceId: 1, reasons: ['window', 'color'], missingSupport: [] })],
        9,
        3,
        5,
      ),
    ).toEqual(['bounce.window']);
    expect(
      ctxFromMove(
        [ev({ t: 'placementWrong', pieceId: 1, reasons: ['outside'], missingSupport: [] })],
        9,
        3,
        5,
      ),
    ).toEqual(['bounce.offplan']);
  });

  it('UX 13.2 streak 3/4, golden trowel, last five moves and the truck queue', () => {
    const topics = ctxFromMove(
      [
        ev({ t: 'comboChanged', combo: 3 }),
        ev({ t: 'trowelEarned', trowels: 1 }),
        ev({ t: 'movesChanged', movesLeft: 5, delta: -1, reason: 'move' }, 4),
        ev({ t: 'deliveryQueued', queued: 2 }, 9),
      ],
      6,
      3,
      5,
    );
    expect(topics).toEqual(['streak', 'goldtrowel', 'lastmoves', 'queue']);
    expect(
      ctxFromMove([ev({ t: 'movesChanged', movesLeft: 4, delta: -1, reason: 'move' }, 4)], 5, 3, 5),
    ).toEqual([]);
  });

  it('GDD 14.1/2 a tip shows once per account, one at a time, never over a tutorial step', () => {
    const seen = new Set<CtxTopic>(['queue']);
    const tips = new ContextTips({ seen: (t) => seen.has(t), markSeen: (t) => void seen.add(t) });
    tips.trigger('queue');
    tips.trigger('support');
    tips.trigger('lastmoves');
    tips.update(0, false, 2500);
    expect(tips.showing).toBeNull();
    tips.update(10, true, 2500);
    expect(tips.showing).toBe('support');
    expect(seen.has('support')).toBe(true);
    tips.trigger('support');
    tips.update(2509, true, 2500);
    expect(tips.showing).toBe('support');
    tips.update(2510, true, 2500);
    expect(tips.showing).toBe('lastmoves');
  });

  it('UX 13.2 opening the trowel pick closes and marks tut.ctx.goldtrowel', () => {
    // ContextTips side of the rule (the scene calls `retire('goldtrowel')` when the pick opens, LevelScene.toggleTrowel;
    // the e2e "UX 13.2 … level 5" drives it through the real trowel icon)
    const seen = new Set<CtxTopic>();
    const host = { seen: (t: CtxTopic) => seen.has(t), markSeen: (t: CtxTopic) => void seen.add(t) };
    // (a) the line shows → the pick opens: it closes, stays seen, a later trowel never brings it back
    const a = new ContextTips(host);
    a.trigger('goldtrowel', 4, ['streak', 'front']);
    a.update(0, true, 2500);
    expect(a.showing).toBe('goldtrowel');
    const v = a.version;
    a.retire('goldtrowel');
    expect(a.showing).toBeNull();
    expect(a.highlight).toEqual([]); // the streak / front frames leave with it
    expect(a.version).toBeGreaterThan(v);
    expect(seen.has('goldtrowel')).toBe(true);
    a.trigger('goldtrowel', 9);
    a.update(10, true, 2500);
    expect(a.showing).toBeNull();
    // (b) the line waits behind a step (level 5 step 2) → the pick opens: it drops and counts as seen; others stay
    seen.clear();
    const b = new ContextTips(host);
    b.trigger('goldtrowel', 4);
    b.trigger('lastmoves', 4);
    b.update(0, false, 2500);
    b.retire('goldtrowel');
    expect(b.queued).toEqual(['lastmoves']);
    expect(seen.has('goldtrowel')).toBe(true);
    b.update(10, true, 2500);
    expect(b.showing).toBe('lastmoves');
    // (c) never triggered: nothing to retire, nothing marked
    seen.clear();
    const c = new ContextTips(host);
    c.retire('goldtrowel');
    expect(seen.size).toBe(0);
  });
});

describe('UX 13.1 spotlight geometry (no mask, JUICE 0 rule 11)', () => {
  it('UX 13.1 overlapping holes merge; the dark rects cover the screen minus the holes', () => {
    const screen = { x: 0, y: 0, w: 1080, h: 1920 };
    const holes = spotlightHoles(
      [
        { x: 100, y: 100, w: 200, h: 200 },
        { x: 250, y: 250, w: 100, h: 100 },
        { x: 700, y: 1000, w: 120, h: 120 },
      ],
      12,
    );
    expect(holes).toHaveLength(2);
    const dark = darkRects(screen, holes);
    const area = (r: { w: number; h: number }): number => r.w * r.h;
    const holeArea = holes.reduce((s, h) => s + area(h), 0);
    expect(dark.reduce((s, r) => s + area(r), 0)).toBe(area(screen) - holeArea);
    expect(insideAny(holes, 150, 150)).toBe(true);
    expect(insideAny(holes, 600, 600)).toBe(false);
  });

  it('UX 13.1 the bubble never touches a lit hole nor the glove path (level 1 step 1: crane + piece 0, FIT H 1920 → the yard band)', () => {
    const lvl = levelFile(1);
    const g = GameSession.start(lvl);
    const layout = createLayout(TOKENS, 1920);
    const rects = highlightAll(['piece:0', 'crane'], {
      layout,
      state: g.state,
      level: lvl,
      hud: { truck: null, streak: null },
    });
    expect(rects).toHaveLength(2);
    const q = query(layout, {
      lit: rects.map((r) => padRect(r, UI.spotPadPx)),
      handPath: [
        [4, 7],
        [4, 8],
        [6, 8],
      ],
    });
    const place = placeBubble(q, M, UI.dedeBustPx, UI.bubbleMaxW, PAUSE(layout));
    expect(place.candidate).toBe(2);
    expect(bubbleForbidden(q, PAUSE(layout)).some((f) => rectsOverlap(f, place.rect))).toBe(false);
    expect(handStrips(layout, q.handPath).some((f) => rectsOverlap(f, place.rect))).toBe(false);
    expect(place.rect.y + place.rect.h).toBeLessThanOrEqual(layout.H / 2);
    expect(place.boxMaxW).toBe(
      bubbleBoxWidths(layout, UI.dedeBustPx, UI.bubbleMaxW, M, PAUSE(layout)).narrow,
    );
  });
});

describe('UX 13.1 tutorial texts exist in both languages (STORY 6, D-017)', () => {
  it('UX 13.2 every level 1–5 tutorial textKey and every tut.ctx topic is in tr and en', async () => {
    const { CTX_TOPICS } = await import('../../src/scenes/level/tutorial/contextTips.ts');
    const { DICTIONARIES, createTranslator } = await import('../../src/services/i18n.ts');
    const keys = new Set<string>();
    for (const id of [1, 2, 3, 4, 5]) for (const s of levelFile(id).data.tutorial ?? []) keys.add(s.textKey);
    for (const topic of CTX_TOPICS) keys.add(`tut.ctx.${topic}`);
    for (const locale of ['tr', 'en'] as const) {
      const tr = createTranslator(locale, DICTIONARIES);
      const missing = [...keys].filter((k) => !tr.has(k));
      expect(missing, locale).toEqual([]);
    }
  });
});

describe('LEVELS §5 tutorials of levels 1–5 are order- and time-independent (Faz 2 tur 1; level 2 since Faz 2 tur 3)', () => {
  /** Every winning order of ✓ placements plus at most `yardMoves` yard moves (rail moves send `gapPass`). */
  function winningOrders(
    lvl: CompiledLevel,
    yardMoves: number,
  ): { move: Move; rail: boolean; events: GameEvent[]; state: GameState }[][] {
    const hooks = levelHooks(lvl);
    const targets: { to: DragNode; rail: boolean; site: boolean }[] = [];
    for (const ix of [6, 7]) targets.push({ to: { ix, iy: 8, mode: FREE }, rail: false, site: true });
    lvl.gaps.forEach((_g, gi) => {
      for (const ix of [6, 7])
        for (let iy = 0; iy < 8; iy++)
          targets.push({ to: { ix, iy, mode: railMode(gi) }, rail: true, site: true });
    });
    for (let ix = 0; ix < 6; ix++)
      for (let iy = 0; iy < 10; iy++) targets.push({ to: { ix, iy, mode: FREE }, rail: false, site: false });
    const out: { move: Move; rail: boolean; events: GameEvent[]; state: GameState }[][] = [];
    const walk = (s: GameState, path: (typeof out)[number], yard: number): void => {
      if (isLevelWon(s)) {
        out.push(path);
        return;
      }
      for (let pid = 0; pid < lvl.pieces.length; pid++) {
        if (pieceZone(s, pid) !== Zone.yard) continue;
        for (const t of targets) {
          const c = cloneState(s);
          const sink = new ArraySink();
          const move: Move = { kind: 'drag', pieceId: pid, to: t.to };
          if (applyMove(c, move, sink, { hooks }).status !== 'applied') continue;
          const correct = sink.events.some((e) => e.t === 'placementCorrect');
          const wrong = sink.events.some((e) => e.t === 'placementWrong' || e.t === 'pieceReturned');
          if (t.site ? !correct : correct || wrong || yard >= yardMoves) continue;
          walk(c, [...path, { move, rail: t.rail, events: sink.events, state: c }], yard + (correct ? 0 : 1));
        }
      }
    };
    walk(createInitialState(lvl), [], 0);
    return out;
  }

  // ✓ placements only; levels 2, 3 and 4 (Faz 2 tur 1 #0, #1; level 2 since its step 2 ends on `placementCorrect`
  // instead of a `holdOverBuild` this walk cannot model, product-lead PL-F2T3-0) also with 1 yard move anywhere
  for (const [n, yardMoves] of [
    [1, 0],
    [2, 1],
    [3, 1],
    [4, 1],
    [5, 0],
  ] as const) {
    it(`GDD 14.1/4a level ${n}: in every winning order (✓ + ${yardMoves} yard move) and every timeout moment each step is shown, none is skipped, nothing is left on screen at the win`, () => {
      const lvl = levelFile(n);
      const steps = lvl.data.tutorial ?? [];
      const timed = steps.some((st) => 'timeoutMs' in st.done);
      const orders = winningOrders(lvl, yardMoves);
      expect(orders.length).toBeGreaterThan(0);
      let played = 0;
      let unplayable = 0;
      for (const order of orders) {
        for (const at of timed ? order.map((_m, i) => i).concat(order.length) : [-1]) {
          let state = createInitialState(lvl);
          const hooks = levelHooks(lvl);
          const shown = new Set<number>();
          const atMoveStart = new Set<number>();
          const skipped: number[] = [];
          const tut = new TutorialController(lvl, {
            state: () => state,
            dragRules: () => hooks.drag ?? {},
            hooks: () => hooks,
            markContextTip: () => {},
            stepEnded: (st, sk) => (sk ? skipped.push(st) : undefined),
          });
          let now = 0;
          const note = (): void => {
            const c = tut.current;
            if (c) shown.add(c.data.step);
          };
          const tick = (): void => {
            now += 100_000;
            tut.update(now);
            note();
          };
          tut.start(now);
          note();
          if (at === 0) tick();
          // review Faz 2 tur 1 #12: a required step lets only its highlighted blocks be picked — an order that moves
          // another block meanwhile cannot be played
          let playable = true;
          order.forEach((m, i) => {
            if (!playable) return;
            if (m.move.kind === 'drag' && !tut.allowsPick(m.move.pieceId)) {
              playable = false;
              return;
            }
            const before = tut.current;
            if (before) atMoveStart.add(before.data.step);
            now += 1;
            if (m.move.kind === 'drag') tut.dragStarted(m.move.pieceId);
            if (m.rail) tut.dragSignal('gapPass', now);
            else if (m.move.kind === 'drag' && m.move.to.ix >= 6) tut.dragSignal('overWall', now);
            note();
            state = m.state;
            tut.moveEnded(m.events, now);
            note();
            if (at === i + 1) tick();
          });
          if (!playable) {
            unplayable += 1;
            continue;
          }
          played += 1;
          const where = `level ${n}, timeout after move ${at}`;
          expect([...shown].sort(), where).toEqual(steps.map((st) => st.step));
          expect(skipped, where).toEqual([]);
          expect(tut.finished, where).toBe(true);
          // LEVELS §5: a step is on screen when a move starts, except a timed step (`timeoutMs`) and a step opened by
          // the drag signal of the move it describes (level 1 step 2 "drop", opened by overWall while the block is held)
          const dragOnly = n === 1 ? [2] : [];
          const unseen = steps.filter(
            (st) => !('timeoutMs' in st.done) && !dragOnly.includes(st.step) && !atMoveStart.has(st.step),
          );
          expect(
            unseen.map((st) => st.step),
            where,
          ).toEqual([]);
        }
      }
      expect(played).toBeGreaterThan(0);
      expect(played + unplayable).toBeGreaterThan(0);
    });
  }
});

describe('review Faz 2 tur 1: tutorial input gate, holes, bubble and contextual tips', () => {
  it('GDD 14.1 required step ignores non-highlighted block (level 1 piece 3, level 3 piece 9)', () => {
    // level 1 step 1 (Z, piece:0 + crane): the merged hole also covers row 7 where piece 3 lies
    const r1 = run(levelFile(1));
    r1.tut.start(0);
    const a = r1.lvl.tutorialPieceIds.get('piece:0') ?? -1;
    expect(r1.tut.current?.required).toBe(true);
    expect(r1.tut.allowsPick(3)).toBe(false);
    expect(r1.tut.allowsPick(a)).toBe(true);
    // a drag of piece 3 over the wall (it cannot be picked in the scene; the signal does not count either)
    r1.tut.dragStarted(3);
    r1.tut.dragSignal('overWall', 5);
    expect(step(r1)).toBe(1);
    expect(r1.tut.current?.handHidden).toBe(false);
    r1.tut.dragStarted(a);
    r1.tut.dragSignal('overWall', 6);
    expect(step(r1)).toBe(2);
    expect(r1.tut.allowsPick(3)).toBe(true); // soft step: every block is free again

    // level 3 step 2 (Z, gap:0 + piece:1 = f): l (piece 9) cannot be picked, f can
    const r3 = run(levelFile(3));
    r3.tut.start(0);
    const [m1] = handMoves(3);
    if (!m1) throw new Error('hand moves');
    r3.play(m1);
    expect(step(r3)).toBe(2);
    const f = r3.lvl.tutorialPieceIds.get('piece:1') ?? -1;
    expect(r3.tut.allowsPick(9)).toBe(false);
    expect(r3.tut.allowsPick(f)).toBe(true);
  });

  it('UX 13.1 a piece: hole sits on the dragged block (its drag node, rail included), else on its board cells', () => {
    const lvl = levelFile(3);
    const g = GameSession.start(lvl);
    const layout = createLayout(TOKENS, 1920);
    const f = lvl.tutorialPieceIds.get('piece:1') ?? -1;
    const input = { layout, state: g.state, level: lvl, hud: { truck: null, streak: null } };
    const [rest] = highlightAll(['piece:1'], input);
    const [dragged] = highlightAll(['piece:1'], { ...input, dragging: { pieceId: f, ix: 6, iy: 2 } });
    const [other] = highlightAll(['piece:1'], { ...input, dragging: { pieceId: f + 1, ix: 6, iy: 2 } });
    expect(dragged).not.toEqual(rest);
    expect(dragged?.x).toBe(layout.grid.pieceRect(6, 2, 1, 1).x);
    expect(other).toEqual(rest);
  });

  it('UX 13.1 the Dede bubble goes under the HUD first and never over pause / goals / moves (EXPAND 390×844 and 360×800)', () => {
    for (const H of [Math.round((1080 * 844) / 390), Math.round((1080 * 800) / 360)]) {
      const layout = createLayout(TOKENS, H);
      const q = query(layout, {});
      const first = bubbleCandidates(q, M, UI.dedeBustPx, UI.bubbleMaxW, PAUSE(layout))[0];
      expect(first?.candidate).toBe(1);
      expect(first?.rect.y).toBe(layout.top.groupBottomY + 16);
      expect((first?.rect.y ?? 0) + 200).toBeLessThanOrEqual(layout.board.crane.y);
      const place = placeBubble(q, M, UI.dedeBustPx, UI.bubbleMaxW, PAUSE(layout));
      expect(place.candidate).toBe(1);
      for (const hud of [PAUSE(layout), layout.top.goals, layout.top.moves, layout.top.panorama])
        expect(rectsOverlap(hud, place.rect)).toBe(false);
    }
  });

  it('UX 13.1 Faz 2 tur 2b: no band under the HUD at FIT H 1920; with the crane band and the yard taken the band over the HUD moves beside the pause button (x = 168, box to the right margin); a forbidden area outweighs a penalty; a box needing > 3 lines is invalid', () => {
    const fit = createLayout(TOKENS, 1920);
    const pause = PAUSE(fit);
    const widths = bubbleBoxWidths(fit, UI.dedeBustPx, UI.bubbleMaxW, M, pause);
    expect(widths).toEqual({ wide: 760, narrow: 494, besidePause: 672 });
    const crane = padRect(fit.board.crane, UI.spotPadPx);
    const g = GameSession.start(levelFile(1));
    const q = query(fit, { lit: [crane], yardBlocks: yardBlockRects(fit, g.state) });
    const all = bubbleCandidates(q, M, UI.dedeBustPx, UI.bubbleMaxW, pause);
    expect(all.map((c) => c.candidate)).not.toContain(1);
    const c4 = all.find((c) => c.candidate === 4);
    expect(c4?.rect.x).toBe(rectRightOf(pause) + 16);
    expect(c4?.boxMaxW).toBe(672);
    expect((c4?.rect.y ?? 0) + (c4?.rect.h ?? 0)).toBe(fit.board.crane.y - 16);
    const place = placeBubble(q, M, UI.dedeBustPx, UI.bubbleMaxW, pause);
    expect(place.candidate).toBe(4); // it covers goals / moves (penalties), the others touch the crane hole or the yard
    expect(bubbleForbidden(q, pause).some((f) => rectsOverlap(f, place.rect))).toBe(false);
    // the same, but the text needs 4 lines in every box but the narrow one → the narrow candidates only
    const tall = placeBubble(
      { ...q, size: (w) => ({ ...size(w), lines: w === widths.narrow ? 3 : 4 }) },
      M,
      UI.dedeBustPx,
      UI.bubbleMaxW,
      pause,
    );
    expect(tall.boxMaxW).toBe(widths.narrow);
  });

  it('UX 13.2 a queued contextual tip whose trigger no longer holds is dropped unmarked (queue emptied, a later move)', () => {
    const seen = new Set<CtxTopic>();
    const tips = new ContextTips({ seen: (t) => seen.has(t), markSeen: (t) => void seen.add(t) });
    let queueNow = 1;
    let serialNow = 3;
    const valid = (t: CtxTopic, serial: number): boolean =>
      t === 'queue' ? queueNow > 0 : serial === serialNow;
    tips.trigger('queue', 3);
    tips.trigger('support', 3);
    tips.update(0, false, 2500, valid); // a tutorial step is on screen: they wait
    expect(tips.showing).toBeNull();
    queueNow = 0; // the truck delivered meanwhile
    serialNow = 4; // and another move was committed after the bounce
    tips.update(10, true, 2500, valid);
    expect(tips.showing).toBeNull();
    expect(tips.queued).toEqual([]);
    expect(seen.size).toBe(0); // not marked: the next occurrence shows them in context
    tips.trigger('support', 4);
    tips.update(20, true, 2500, valid);
    expect(tips.showing).toBe('support');
  });
});

describe('review Faz 2 tur 2: merged holes, pause through the spotlight, K-43 tutorial resume', () => {
  const H844 = Math.round((1080 * 844) / 390);
  const lit = (sp: ReturnType<typeof spotlight>, x: number, y: number): boolean =>
    insideAny(sp.holes, x, y) && !insideAny(sp.fills, x, y);
  const centre = (r: { x: number; y: number; w: number; h: number }): [number, number] => [
    r.x + r.w / 2,
    r.y + r.h / 2,
  ];

  it('UX 13.1 merged hole: level 1 step 1 lights only the crane band and piece 0', () => {
    const lvl = levelFile(1);
    const g = GameSession.start(lvl);
    for (const H of [H844, Math.round((1080 * 800) / 360), 1920]) {
      const layout = createLayout(TOKENS, H);
      const input = { layout, state: g.state, level: lvl, hud: { truck: null, streak: null } };
      const rects = highlightAll(['piece:0', 'crane'], input);
      const sp = spotlight(rects, 12);
      expect(sp.holes).toHaveLength(1); // the 12 px pad merges the crane band and row 7
      expect(sp.fills.length).toBeGreaterThan(0);
      // the crane band and every cell of a are lit …
      const a = highlightRects('piece:0', input)[0];
      if (!a) throw new Error('piece 0');
      expect(lit(sp, ...centre(a))).toBe(true);
      expect(lit(sp, ...centre(layout.board.crane))).toBe(true);
      expect(lit(sp, layout.board.crane.x + 10, layout.board.crane.y + 10)).toBe(true);
      // … the other blocks of row 7 (Y (0,7), W (2,7), W (3,7)) are dark like the rest of the screen
      for (const [x, y] of [
        [0, 7],
        [2, 7],
        [3, 7],
      ] as const)
        expect(lit(sp, ...centre(layout.grid.cellRect(x, y))), `(${x},${y})`).toBe(false);
      // the dark layer + the fills cover the screen minus the lit parts, without overlaps
      const screen = { x: 0, y: 0, w: layout.W, h: layout.H };
      const area = (r: { w: number; h: number }): number => r.w * r.h;
      const dark = [...darkRects(screen, sp.holes), ...sp.fills];
      const litArea = sp.holes.reduce((s, h) => s + area(h), 0) - sp.fills.reduce((s, f) => s + area(f), 0);
      expect(dark.reduce((s, r) => s + area(r), 0)).toBeCloseTo(area(screen) - litArea, 6);
    }
  });

  it('UX 13.1 required step keeps the pause button: the touch blockers leave its hit area open, the rest stays blocked', () => {
    const lvl = levelFile(1);
    const g = GameSession.start(lvl);
    const layout = createLayout(TOKENS, H844);
    const rects = highlightAll(['piece:0', 'crane'], {
      layout,
      state: g.state,
      level: lvl,
      hud: { truck: null, streak: null },
    });
    const sp = spotlight(rects, 12);
    const screen = { x: 0, y: 0, w: layout.W, h: layout.H };
    const pause = pauseHitRect(layout.top.pause);
    expect(pause.w).toBeGreaterThanOrEqual(TOKENS.touch.minTargetPx);
    const blockers = blockerRects(screen, sp, [pause]);
    expect(insideAny(blockers, ...centre(pause))).toBe(false);
    expect(insideAny(blockers, pause.x + 1, pause.y + 1)).toBe(false);
    expect(insideAny(blockers, ...centre(layout.top.goals))).toBe(true);
    expect(insideAny(blockers, ...centre(layout.top.moves))).toBe(true);
    expect(insideAny(blockers, ...centre(layout.grid.cellRect(0, 7)))).toBe(true); // a fill swallows too
    expect(insideAny(blockers, ...centre(layout.board.crane))).toBe(false); // the hole stays touchable
  });

  /** Replays `log` like LevelScene does on a K-43 resume and returns the rebuilt controller. */
  function resumedTutorial(lvl: CompiledLevel, log: readonly SessionAction[]): TutorialController {
    let at: GameSession | null = null;
    const hooks = levelHooks(lvl);
    const tut = new TutorialController(lvl, {
      state: () => at?.state ?? null,
      dragRules: () => hooks.drag ?? {},
      hooks: () => hooks,
      markContextTip: () => undefined,
      stepEnded: () => undefined,
    });
    const sink = new ArraySink();
    let mark = 0;
    GameSession.replay(lvl, log, { hooks }, sink, (index, action, session) => {
      at = session;
      const events = sink.events.slice(mark);
      mark = sink.events.length;
      if (index === 0) tut.start(0);
      else replayTutorialAction(tut, action, events, 0);
    });
    return tut;
  }

  it('K-43 resume keeps the tutorial step (level 3 step 2 gate after a; level 1–5 at every point of the hand solution)', () => {
    // level 3: after a (m = 1) step 2 (Z, gapPass with f) is on screen and only f may be picked
    const l3 = run(levelFile(3));
    l3.tut.start(0);
    const [a] = handMoves(3);
    if (!a) throw new Error('level 3 hand');
    l3.tut.dragStarted(a.kind === 'drag' ? a.pieceId : -1);
    l3.play(a);
    const back = resumedTutorial(l3.lvl, l3.game.log);
    expect(back.current?.data.step).toBe(2);
    expect(back.current?.required).toBe(true);
    expect(back.allowsPick(9)).toBe(false);
    expect(back.allowsPick(l3.lvl.tutorialPieceIds.get('piece:1') ?? -1)).toBe(true);

    // every level 1–5: a kill after any move of the hand solution (played with its drag signals) resumes on the same step
    for (const id of [1, 2, 3, 4, 5]) {
      const lvl = levelFile(id);
      const live = run(lvl);
      live.tut.start(0);
      for (const m of handMoves(id)) {
        live.tut.endTimedStep(0); // the player read a timed line before moving (the replay assumes the same)
        if (m.kind === 'drag') {
          const at = tryBeginDrag(live.game.state, m.pieceId, levelHooks(lvl).drag ?? {});
          if (!at.ok) throw new Error(at.reason);
          live.tut.dragStarted(m.pieceId);
          for (const node of at.session.pathTo(m.to) ?? []) {
            const r = at.session.moveTo(node);
            if (r.crossedWall) live.tut.dragSignal('overWall', 0);
            if (r.enteredRail) live.tut.dragSignal('gapPass', 0);
          }
          const minMs = live.tut.holdMinMs();
          if (minMs !== null && m.to.mode === FREE && m.to.ix >= 6)
            live.tut.dragSignal('holdOverBuild', 0, minMs);
        }
        live.play(m);
        const back2 = resumedTutorial(lvl, live.game.log);
        expect([id, back2.current?.data.step ?? null, back2.finished]).toEqual([
          id,
          live.tut.current?.data.step ?? null,
          live.tut.finished,
        ]);
        expect(back2.current?.required ?? null).toBe(live.tut.current?.required ?? null);
      }
    }
  });

  it('review Faz 2 tur 2 #10: repeated wrong drops never reset the step, its highlighted blocks or the required gate', () => {
    // level 1 step 2 (soft, placementCorrect): b (W) dropped onto the Y row bounces, again and again
    const r1 = run(levelFile(1));
    r1.tut.start(0);
    const aId = r1.lvl.tutorialPieceIds.get('piece:0') ?? -1;
    r1.tut.dragStarted(aId);
    r1.tut.dragSignal('overWall', 1);
    expect(step(r1)).toBe(2);
    const pieces = [...(r1.tut.current?.pieces ?? [])];
    for (let i = 0; i < 3; i++) {
      r1.tut.dragStarted(1);
      const ev = r1.play({ kind: 'drag', pieceId: 1, to: { ix: 6, iy: 8, mode: FREE } });
      expect(ev.some((e) => e.t === 'pieceBounced')).toBe(true);
      expect(step(r1)).toBe(2);
      expect(r1.tut.current?.pieces).toEqual(pieces);
    }
    // level 3 step 2 (Z, gapPass with f): wrong drops of other blocks are refused by the gate; f's own wrong drops
    // (released on the rail before a, K-34) keep the step and the gate until its gapPass
    const r3 = run(levelFile(3));
    r3.tut.start(0);
    const [a] = handMoves(3);
    if (!a) throw new Error('level 3 hand');
    r3.play(a);
    expect(step(r3)).toBe(2);
    const f = r3.lvl.tutorialPieceIds.get('piece:1') ?? -1;
    for (let i = 0; i < 2; i++) {
      expect(r3.tut.allowsPick(9)).toBe(false);
      expect(r3.tut.allowsPick(f)).toBe(true);
      r3.tut.dragStarted(9);
      r3.tut.dragSignal('gapPass', 2); // a drag of another block never counts
      expect(step(r3)).toBe(2);
    }
  });
});

describe('review Faz 2 tur 3 #1: K-43 resume from the saved tutorial position (inLevel.tutorial)', () => {
  /** Resumes like LevelScene: `GameSession.replay` + `TutorialResume` with the saved position (null: old save). */
  function resumed(
    lvl: CompiledLevel,
    log: readonly SessionAction[],
    saved: SavedTutorialPosition | null,
  ): { tut: TutorialController; usable: boolean; tips: string[] } {
    let at: GameSession | null = null;
    const hooks = levelHooks(lvl);
    const tips: string[] = [];
    const tut = new TutorialController(lvl, {
      state: () => at?.state ?? null,
      dragRules: () => hooks.drag ?? {},
      hooks: () => hooks,
      markContextTip: (t) => tips.push(t),
      stepEnded: () => undefined,
    });
    const resume = new TutorialResume(tut, saved, log.length);
    const sink = new ArraySink();
    let mark = 0;
    GameSession.replay(lvl, log, { hooks }, sink, (index, action, session) => {
      at = session;
      const events = sink.events.slice(mark);
      mark = sink.events.length;
      resume.action(index, action, events, 0);
    });
    return { tut, usable: resume.usable, tips };
  }

  /** The live drag of `m` with its drag signals (no hold: levels 1–5 use none). */
  function liveDrag(r: Run, m: Move): void {
    if (m.kind !== 'drag') return;
    const at = tryBeginDrag(r.game.state, m.pieceId, levelHooks(r.lvl).drag ?? {});
    if (!at.ok) throw new Error(at.reason);
    r.tut.dragStarted(m.pieceId);
    for (const node of at.session.pathTo(m.to) ?? []) {
      const res = at.session.moveTo(node);
      if (res.crossedWall) r.tut.dragSignal('overWall', 0);
      if (res.enteredRail) r.tut.dragSignal('gapPass', 0);
    }
  }

  const savedOf = (r: Run, actions = r.game.log.length): SavedTutorialPosition => {
    const pos = r.tut.position();
    if (!pos) throw new Error('tutorial not started');
    return { ...pos, actions };
  };

  it('K-43 resume keeps the tutorial step: level 1 `a` released straddling the wall at (5,8) (K-07 row 4) is cancelled — step 2 comes back, not step 1 and its gate', () => {
    const r = run(levelFile(1));
    r.tut.start(0);
    const a = r.lvl.tutorialPieceIds.get('piece:0') ?? -1;
    const straddle: Move = { kind: 'drag', pieceId: a, to: { ix: 5, iy: 8, mode: FREE } };
    liveDrag(r, straddle); // overWall on the way: step 1 (Z) ends in the air, step 2 opens
    expect(step(r)).toBe(2);
    expect(r.game.commit(straddle).status).not.toBe('applied'); // the release cancels: no action is logged
    expect(r.game.log.length).toBe(1);
    const saved = savedOf(r);
    expect(saved).toEqual({ index: 1, shown: true, count: 0, actions: 1 });
    const back = resumed(r.lvl, r.game.log, saved);
    expect(back.usable).toBe(true);
    expect(back.tut.current?.data.step).toBe(2);
    expect(back.tut.current?.required).toBe(false);
    expect(back.tut.allowsPick(3)).toBe(true); // no step 1 gate
    // the log alone (an old save) cannot know the cancelled drag's signal: step 1 again (the finding)
    expect(resumed(r.lvl, r.game.log, null).tut.current?.data.step).toBe(1);
  });

  it('K-43 resume keeps the tutorial step: level 2 `b` released fast (no hold) → step 3 after the reload, as live', () => {
    const r = run(levelFile(2));
    r.tut.start(0);
    const [mA, mB] = handMoves(2);
    if (!mA || !mB) throw new Error('hand moves');
    liveDrag(r, mA);
    r.play(mA);
    expect(step(r)).toBe(2);
    liveDrag(r, mB); // fast: no holdOverBuild (and level 2 listens for none, PL-F2T3-0)
    r.play(mB);
    expect(step(r)).toBe(3);
    const back = resumed(r.lvl, r.game.log, savedOf(r));
    expect(back.tut.current?.data.step).toBe(3);
    expect(back.tut.current?.pieces).toEqual(r.tut.current?.pieces);
    expect(resumed(r.lvl, r.game.log, null).tut.current?.data.step).toBe(3);
  });

  it("K-43 a kill while the last move's cues played: the saved position + the later move ends (level 2: saved after A, b logged)", () => {
    const r = run(levelFile(2));
    r.tut.start(0);
    const [mA, mB] = handMoves(2);
    if (!mA || !mB) throw new Error('hand moves');
    r.play(mA);
    const saved = savedOf(r); // planEnded of A wrote step 2 with 2 log entries
    expect(saved).toEqual({ index: 1, shown: true, count: 0, actions: 2 });
    expect(r.game.commit(mB).status).toBe('applied'); // b is logged; its cues still play when the app is killed
    const back = resumed(r.lvl, r.game.log, saved);
    expect(back.tut.current?.data.step).toBe(3); // b's move end is read on resume, as live after its cues
  });

  it('K-43 the resume never goes past the saved step: a timed step the player moved under stays (the log replay ran ahead)', () => {
    const tutorial = [
      {
        step: 1,
        mode: 'soft' as const,
        highlight: ['cell:7,2'],
        textKey: 'tut.l4.window',
        done: { timeoutMs: 2500 },
      },
      {
        step: 2,
        mode: 'soft' as const,
        highlight: ['front'],
        textKey: 'tut.ctx.support',
        done: { event: 'placementCorrect' as const, count: 1 },
      },
    ];
    const r = run(compile({ ...rawLevel(4), tutorial }));
    r.tut.start(0);
    const [m1] = handMoves(4);
    if (!m1) throw new Error('hand moves');
    r.play(m1, 100); // within the 2,5 s: step 1 is still on screen
    expect(step(r)).toBe(1);
    const saved = savedOf(r);
    const back = resumed(r.lvl, r.game.log, saved);
    expect(back.tut.current?.data.step).toBe(1);
    expect(back.tips).toEqual([]); // step 2's `tut.ctx.support` was never shown, so it is not marked
    // the log replay ends the timed step before the move and counts the move for step 2: past the live step
    const old = resumed(r.lvl, r.game.log, null);
    expect(old.tut.current?.data.step ?? 'finished').not.toBe(1);
  });

  it('K-43 levels 1–5 at every point of the hand solution: the saved position resumes the live step', () => {
    for (const id of [1, 2, 3, 4, 5]) {
      const lvl = levelFile(id);
      const live = run(lvl);
      live.tut.start(0);
      for (const m of handMoves(id)) {
        liveDrag(live, m);
        live.play(m);
        const back = resumed(lvl, live.game.log, savedOf(live));
        expect([id, back.tut.position()]).toEqual([id, live.tut.position()]);
        expect(back.tut.current?.required ?? null).toBe(live.tut.current?.required ?? null);
        expect(back.tut.current?.pieces ?? null).toEqual(live.tut.current?.pieces ?? null);
      }
      expect(live.tut.finished).toBe(true);
    }
  });

  it('K-43 a foreign or damaged saved position is not used (the log replay rebuilds the tutorial)', () => {
    const lvl = levelFile(1); // 3 steps, no startOn
    const log = GameSession.start(lvl).log;
    for (const bad of [
      { index: 4, shown: false, count: 0, actions: 1 }, // past "finished"
      { index: 3, shown: true, count: 0, actions: 1 }, // finished is never shown
      { index: 0, shown: false, count: 0, actions: 1 }, // waits, but the step has no startOn
      { index: 0, shown: true, count: 1, actions: 1 }, // count 1 of 1 would have ended the step
      { index: 1, shown: true, count: 0, actions: 2 }, // more actions than the log has
    ]) {
      const back = resumed(lvl, log, bad);
      expect(back.usable, JSON.stringify(bad)).toBe(false);
      expect(back.tut.current?.data.step).toBe(1);
    }
    const done = resumed(lvl, log, { index: 3, shown: false, count: 0, actions: 1 });
    expect(done.usable).toBe(true);
    expect(done.tut.finished).toBe(true);
  });
});
