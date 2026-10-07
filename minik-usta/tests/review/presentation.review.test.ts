/**
 * Independent rule review, round 1 of the Phase 2 code written after Phase 2A (presentation, level flow, windows):
 *
 * - JUICE P0 schedule (src/scenes/level/juice/plan.ts) and handlers (handlers.ts) against JUICE.md §0 rules 3, 5, 7, 10
 *   and rows #19, #51, #56, GDD K-28 / K-29 / E-01;
 * - TutorialController and its matcher (src/scenes/level/tutorial/*) against GDD §14.1/3 (closed `done` vocabulary,
 *   `count` after the step starts, drag moves only);
 * - the attempt record (src/scenes/flow/attempt.ts), launch routing (launch.ts) and the window models (src/ui/offer.ts,
 *   remaining.ts, windowLines.ts, rewards.ts) against GDD K-15, K-28, K-29, K-43 (worked examples), UX_FLOWS §1 (a),
 *   §6, §7, META §3 and ANALYTICS §2 (`level_end`).
 *
 * Expectations are derived from the documents' wording and worked examples, not from the implementation; only public
 * module APIs are used (no Phaser: handlers run against a recording fake stage). Tests named "FINDING …" are
 * `it.fails`: they reproduce a defect reported to code-lead (REVIEW_LOG) and will turn red once it is fixed — then drop
 * `.fails`.
 *
 * Round 2 (bottom of the file, after the Faz 2 tur 1 fixes #0–#22): the fall shadow look (`shadowLook` + core
 * `reasonCells`) against UX §5.4 / GDD K-18 / K-34 hooks 2–3 with an independent plan oracle; the required-step input
 * gate and the LEVELS §2 Bölüm 1/3/4/5 tutorial claims by enumerating every ✓ sequence (+ ≤ 2 yard moves) through
 * `TutorialController` with the gate applied; spotlight holes and the Usta Dede bubble (UX §13.1) on the phone
 * profiles and on TECH §10.1's 390×763; contextual lines (GDD K-34 hook 4, LEVELS §0, TECH §8.2, UX §13.2);
 * `DragController` on a fake scene (K-07 tap / drag threshold, K-08 finger offset, TECH §4.6 second finger, touchcancel,
 * the tutorial gate); JUICE #22 / #23 / #83 / #84 (W1, K-34); the FTUE route and the 1–5 home loop (UX §2.1, §2.2, §6);
 * a killed + resumed attempt's `level_end`; and the `test:rules` gate failing on a phase it does not cover.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import economy from '../../config/economy.json' with { type: 'json' };
import { loadLevel } from '../../src/core/level/compile.ts';
import type { CompiledLevel } from '../../src/core/level/compile.ts';
import { levelHooks } from '../../src/core/obstacles/registry.ts';
import { computeFall } from '../../src/core/gravity.ts';
import { FREE, tryBeginDrag } from '../../src/core/movement.ts';
import { ArraySink } from '../../src/core/moves.ts';
import { GameSession, RULES_VERSION, levelHash } from '../../src/core/session.ts';
import type { StreakBonus } from '../../src/core/session.ts';
import { shapeByIndex } from '../../src/core/shapes.ts';
import {
  FLAG_BIT,
  H,
  cloneState,
  hdr,
  pieceColor,
  pieceFlags,
  pieceShape,
  pieceZone,
  queueIds,
} from '../../src/core/state.ts';
import { COLOR_CODES, Zone } from '../../src/core/types.ts';
import type { DragNode, GameEvent, Move, PieceId, SessionAction } from '../../src/core/types.ts';
import { Analytics } from '../../src/services/analytics.ts';
import type { AnalyticsEvent, AnalyticsEventOf } from '../../src/services/analytics.ts';
import { FakeClock } from '../../src/services/clock.ts';
import { MemoryStore, SaveService } from '../../src/services/save.ts';
import { LevelAttempt, streakBonusOf, streakTierOf } from '../../src/scenes/flow/attempt.ts';
import { IntroTimeline, ftueUntouchedMs } from '../../src/scenes/flow/intro.ts';
import { homeTarget, launchRoute } from '../../src/scenes/flow/launch.ts';
import { DragController } from '../../src/scenes/level/DragController.ts';
import type { DragHost } from '../../src/scenes/level/DragController.ts';
import type { PieceView } from '../../src/scenes/level/PieceView.ts';
import { cancelPreview, shadowLook, showsShadow } from '../../src/scenes/level/shadowLook.ts';
import {
  CTX_HIGHLIGHT,
  ContextTips,
  ctxFromMove,
  ctxMoveHighlight,
} from '../../src/scenes/level/tutorial/contextTips.ts';
import type { CtxTopic } from '../../src/scenes/level/tutorial/contextTips.ts';
import {
  bubbleAvoid,
  bubbleCandidates,
  bubbleSpot,
  highlightAll,
  highlightRects,
  hudPenalties,
  pidHighlight,
  spotlightHoles,
} from '../../src/scenes/level/tutorial/highlights.ts';
import { JUICE_HANDLERS } from '../../src/scenes/level/juice/handlers.ts';
import type { JuiceId } from '../../src/scenes/level/juice/catalog.ts';
import { planMove } from '../../src/scenes/level/juice/plan.ts';
import type { MoveCue, PlanContext } from '../../src/scenes/level/juice/plan.ts';
import type { JuiceCue, JuiceStage, Tweenable } from '../../src/scenes/level/juice/stage.ts';
import { TutorialController } from '../../src/scenes/level/tutorial/TutorialController.ts';
import { moveMatches } from '../../src/scenes/level/tutorial/tutorialEvents.ts';
import { createLayout, designHeight, rectsOverlap } from '../../src/theme/layout.ts';
import type { Layout, Rect } from '../../src/theme/layout.ts';
import { TOKENS } from '../../src/theme/tokens.ts';
import { offerModel } from '../../src/ui/offer.ts';
import type { OfferModel } from '../../src/ui/offer.ts';
import { remainingPlanCells } from '../../src/ui/remaining.ts';
import { winRewards } from '../../src/ui/rewards.ts';
import { UI } from '../../src/ui/uiConstants.ts';
import { exitLines, lossLines } from '../../src/ui/windowLines.ts';
import { compiledLevel } from '../fixtures/builders.ts';
import type { LevelSpec } from '../fixtures/builders.ts';
import { handMoves, levelFile } from '../core/moves.fixtures.ts';

// --- helpers ------------------------------------------------------------------------------------------------------------

const N = (ix: number, iy: number): DragNode => ({ ix, iy, mode: FREE });
const drag = (pieceId: PieceId, ix: number, iy: number): Move => ({ kind: 'drag', pieceId, to: N(ix, iy) });
const kinds = (cues: readonly MoveCue[]): string[] => cues.map((c) => String(c.kind));
const BONUS_MAX = economy.levelRewards.bonusMaxMovesCounted;

interface Planned {
  readonly events: GameEvent[];
  readonly cues: readonly MoveCue[];
}

/** Commits `move` and plans its cues with the context LevelScene passes to the EventPlayer. */
function commitAndPlan(game: GameSession, move: Move, reduced = false): Planned {
  const s = game.state;
  const ctx: PlanContext = {
    reduced,
    gravity: game.lvl.gravity.build,
    queuedBefore: queueIds(s),
    movesBefore: game.movesLeft,
    pieceHeight: (id) => shapeByIndex(pieceShape(s, id)).h,
  };
  const sink = new ArraySink();
  expect(game.commit(move, sink).status).toBe('applied');
  return { events: sink.events, cues: planMove(sink.events, ctx, BONUS_MAX).cues };
}

/** Every move of a LEVELS §2 hand solution, planned. */
function planHand(id: 1 | 2 | 3 | 4 | 5, reduced = false): Planned[] {
  const game = GameSession.start(levelFile(id));
  return handMoves(id).map((m) => commitAndPlan(game, m, reduced));
}

// recording fake stage (no Phaser) ----------------------------------------------------------------------------------------

interface Call {
  readonly cue: JuiceId;
  readonly name: string;
  readonly args: readonly unknown[];
}

const RECT = { x: 0, y: 0, w: 120, h: 120 };
const PT = { x: 60, y: 60 };
const ANSWERS: Partial<Record<keyof JuiceStage, unknown>> = {
  boardRect: RECT,
  screenRect: RECT,
  cellRect: RECT,
  pieceBox: RECT,
  boxAt: RECT,
  restAnchor: { ax: 0, ay: 0 },
  pieceAnchor: { ax: 0, ay: 0 },
  anchorAt: { ax: 0, ay: 0 },
  pieceColor: 0xffffff,
  colorOf: 0xffffff,
  siteColors: [0xffffff],
  queueCount: 0,
  chipPoint: PT,
  trowelPoint: PT,
  beadPoint: PT,
  movesPoint: PT,
  levelNumber: 1,
};

function recorder(): { readonly calls: Call[]; play(cue: JuiceCue): void } {
  const calls: Call[] = [];
  let current: JuiceId = 1;
  const stage = new Proxy({} as JuiceStage, {
    get(_t, prop: string) {
      return (...args: unknown[]) => {
        calls.push({ cue: current, name: prop, args });
        if (prop === 'ease') return (u: number) => u;
        if (prop === 'drive') (args[3] as (k: number, u: number) => void)(1, 1);
        return ANSWERS[prop as keyof JuiceStage];
      };
    },
  });
  return {
    calls,
    play(cue) {
      current = cue.id;
      JUICE_HANDLERS[cue.id](cue, stage);
    },
  };
}

const tween = (): Tweenable => ({ x: 0, y: 0, scaleX: 1, scaleY: 1, alpha: 1 });
const UI_TARGETS = {
  button: { ...tween(), setLip: () => {} },
  window: { dim: tween(), panel: tween(), options: [tween(), tween(), tween()], chip: tween() },
  heart: { setDrain: () => {} },
};

/** A planned board cue as the EventPlayer hands it to its handler. */
function juiceCue(c: MoveCue, reduced: boolean): JuiceCue | null {
  if (typeof c.kind !== 'number') return null;
  return {
    id: c.kind,
    time: c.at,
    ms: c.ms,
    reduced,
    instant: false,
    ev: c.ev,
    piece: c.piece,
    gravity: 'normal',
    n: c.n,
    first: c.first,
    flag: c.flag,
    toSeg: c.toSeg,
    drops: c.drops,
    cells: c.cells,
    ...UI_TARGETS,
  };
}

// fixtures ----------------------------------------------------------------------------------------------------------------

/** E-01: one horizontal D2 W completes the only plan row with the last move. */
const LAST_MOVE_WIN: LevelSpec = { moves: 1, plan: ['WW'], pieces: [['D2_90', 'W', 0, 0]] };
/** K-29: the last move is correct but the plan is not finished. */
const LAST_MOVE_SHORT: LevelSpec = {
  moves: 1,
  plan: ['WW', 'WW'],
  pieces: [
    ['D2_90', 'W', 0, 0],
    ['D2_90', 'W', 2, 0],
  ],
};
/**
 * K-25 truck into an EMPTY yard column: one B1 W completes segment 0 (`W.`), the segment-1 batch (B1 R, x = 3) is
 * dropped from y = 10 − h = 9 and falls to the floor (9 rows) — the normal case once the yard has been dug out.
 */
const EMPTY_COLUMN_TRUCK: LevelSpec = {
  moves: 5,
  plan: [['W.'], ['WW']],
  pieces: [['B1_0', 'W', 0, 0]],
  batches: [{ forSegment: 1, pieces: [['B1_0', 'R', 3, 8]] }],
};
/** K-29 offers: two W blocks for the plan and a B1 Y whose yard moves (K-07 row 2, cost 1) burn the counter. */
const OFFER_LEVEL: LevelSpec = {
  moves: 1,
  plan: ['WW', 'WW'],
  pieces: [
    ['D2_90', 'W', 0, 0],
    ['D2_90', 'W', 2, 0],
    ['B1_0', 'Y', 5, 0],
  ],
};
/** Yard move of the B1 Y (piece 2) between (5,0) and (5,1); `k` = how many moves were made before. */
const burn = (k: number, pieceId: PieceId = 2): Move => drag(pieceId, 5, k % 2 === 0 ? 1 : 0);

// save + analytics of one app process (a K-43 kill = a new process on the same store) --------------------------------

interface Proc {
  readonly clock: FakeClock;
  readonly save: SaveService;
  readonly events: AnalyticsEvent[];
  readonly deps: {
    readonly save: SaveService;
    readonly track: (e: AnalyticsEvent) => void;
    readonly clock: FakeClock;
  };
}

function proc(store: MemoryStore = new MemoryStore(), now = 1_000_000): Proc {
  const clock = new FakeClock(now);
  const events: AnalyticsEvent[] = [];
  let n = 0;
  let save: SaveService | null = null;
  const analytics = new Analytics({
    clock,
    common: () => ({
      sessionId: 's',
      appVersion: 'review',
      platform: 'web',
      lang: 'tr',
      coins: save?.data.coins ?? 0,
      lives: save?.data.lives.stored ?? 0,
      highestLevel: save?.data.progress.highestLevel ?? 0,
      payer: save?.data.payer ?? false,
    }),
    onInvalid: (issues) => {
      throw new Error(issues.join('\n'));
    },
  });
  analytics.addSink((r) => events.push(r.event));
  save = SaveService.open({
    store,
    clock,
    scheduler: clock,
    startingWallet: economy.startingWallet,
    track: analytics.track,
    newId: () => `id${n++}`,
  });
  return { clock, save, events, deps: { save, track: analytics.track, clock } };
}

const identity = (lvl: CompiledLevel) => () => ({
  levelHash: levelHash(lvl.data),
  rulesVersion: RULES_VERSION,
});

/** LevelScene.recordMove: observe the events, append the action (written at once), settle a game-ending commit. */
function scenePlay(a: LevelAttempt, game: GameSession, move: Move, lvl: CompiledLevel): GameEvent[] {
  const sink = new ArraySink();
  expect(game.commit(move, sink).status).toBe('applied');
  a.observe(sink.events);
  a.recorded(move, game.movesMade);
  a.settle(game, () => winRewards({ difficulty: lvl.difficulty, movesLeft: game.movesLeft, trowels: 0 }));
  return sink.events;
}

/** The out-of-moves window as LevelScene.openOffer builds it (web MVP: no ad provider). */
function windowModel(game: GameSession, save: SaveService): OfferModel {
  const offer = game.nextOffer();
  if (!offer) throw new Error('no out-of-moves window');
  return offerModel({
    n: offer.n,
    adAllowed: offer.adAllowed,
    giftAvailable: !save.data.firstOfferGiftUsed,
    coins: save.data.coins,
    ads: { kind: 'none' },
  });
}

/** LevelScene.takeOffer (coin option): core +5 first, then the payment and the logged action. */
function takeCoins(a: LevelAttempt, game: GameSession, model: OfferModel): void {
  const sink = new ArraySink();
  expect(game.acceptOffer('offerCoins', sink).status).toBe('applied');
  const action: SessionAction = { kind: 'addMoves', amount: model.coin.moves, source: 'offerCoins' };
  expect(a.payOffer(model, action, game.movesMade)).toBe(true);
  a.observe(sink.events);
}

function levelEnd(events: readonly AnalyticsEvent[]): AnalyticsEventOf<'level_end'> {
  const e = events.find((x) => x.name === 'level_end');
  if (!e || e.name !== 'level_end') throw new Error('no level_end');
  return e;
}

// --- JUICE schedule -----------------------------------------------------------------------------------------------------

describe('review: JUICE 0 rule 10 / K-35 cue order at the level end (K-28, K-29, E-01)', () => {
  it('E-01 / K-28 the last move completes the last segment: #55 win is last and locked, no #56 bonus, no #57', () => {
    const game = GameSession.start(compiledLevel(LAST_MOVE_WIN));
    const { cues } = commitAndPlan(game, drag(0, 6, 8));
    expect(game.outcome).toBe('won');
    expect(game.movesLeft).toBe(0);
    const k = kinds(cues);
    expect(k).toEqual(expect.arrayContaining(['12', '50', '18', '55']));
    expect(k).not.toContain('56'); // "bonus 0"
    expect(k).not.toContain('57'); // step 11 checks the win before the loss
    expect(k.slice(-2)).toEqual(['55', 'end']); // "kazanma ya da kaybetme en son"
    expect(cues.find((c) => c.kind === 55)?.lock).toBe(true);
    expect(winRewards({ difficulty: 'easy', movesLeft: 0, trowels: 0 })).toMatchObject({
      bonusMoves: 0,
      bonusCoins: 0,
      totalCoins: economy.levelRewards.winCoins.easy,
    });
  });

  it('K-29 the last move leaves the plan unfinished: #57 "Hamleler bitti!" is last and locked, after the counter (#50)', () => {
    const game = GameSession.start(compiledLevel(LAST_MOVE_SHORT));
    const { cues } = commitAndPlan(game, drag(0, 6, 8));
    expect(game.outcome).toBe('outOfMoves');
    const k = kinds(cues);
    expect(k).not.toContain('55');
    expect(k.slice(-2)).toEqual(['57', 'end']);
    expect(k.indexOf('57')).toBeGreaterThan(k.indexOf('50'));
    expect(cues.find((c) => c.kind === 57)?.lock).toBe(true);
  });

  it('JUICE 0 rule 3 along the level 1–5 hand solutions only #18, #19 and the level end (#55–#57) lock the board', () => {
    for (const id of [1, 2, 3, 4, 5] as const)
      for (const { cues } of planHand(id))
        for (const c of cues) if (c.lock) expect([18, 19, 55, 56, 57]).toContain(c.kind);
  });

  it('JUICE 0 rule 3 segment slide (#18) and the level 5 truck (#19) each lock the board ≤ 900 ms', () => {
    for (const { cues } of planHand(5))
      for (const c of cues) if (c.kind === 18 || c.kind === 19) expect(c.ms).toBeLessThanOrEqual(900);
  });

  it('JUICE 0 rule 3 / #19 a truck block falling into an empty yard column still locks the board ≤ 900 ms (fixed: Faz 2 tur 2 #16)', () => {
    const game = GameSession.start(compiledLevel(EMPTY_COLUMN_TRUCK));
    const { events, cues } = commitAndPlan(game, drag(0, 6, 8));
    const fell = events.find((e) => e.t === 'pieceFell' && e.cause === 'delivery');
    expect(fell && fell.t === 'pieceFell' ? fell.rows : 0).toBeGreaterThanOrEqual(8);
    const truck = cues.find((c) => c.kind === 19);
    expect(truck?.lock).toBe(true);
    // JUICE §0 rule 3: "kamyon teslimatı (700 ms) … Toplam bekleme her olayda ≤ 900 ms"
    expect(truck?.ms ?? 0).toBeLessThanOrEqual(900);
  });
});

describe('review: JUICE handlers on real cues (rules 5, 7; rows #19, #51, #56)', () => {
  /** Every board cue of the level 1–5 hand solutions, a K-17 bounce and a truck into an empty column. */
  function boardCues(reduced: boolean): JuiceCue[] {
    const planned: Planned[] = [];
    for (const id of [1, 2, 3, 4, 5] as const) planned.push(...planHand(id, reduced));
    const l1 = GameSession.start(levelFile(1));
    planned.push(commitAndPlan(l1, drag(1, 6, 8), reduced)); // W onto the Y row: K-17 bounce
    planned.push(commitAndPlan(GameSession.start(compiledLevel(EMPTY_COLUMN_TRUCK)), drag(0, 6, 8), reduced));
    const out: JuiceCue[] = [];
    for (const p of planned)
      for (const c of p.cues) {
        const jc = juiceCue(c, reduced);
        if (jc) out.push(jc);
      }
    return out;
  }

  it('JUICE 0 rule 5 screen shake only on the segment completion (#18), 3 px; never in reduced motion', () => {
    for (const reduced of [false, true]) {
      const rec = recorder();
      const cues = boardCues(reduced);
      expect(cues.some((c) => c.id === 18)).toBe(true);
      for (const c of cues) rec.play(c);
      for (const id of [52, 57, 58, 69, 70, 71] as const)
        rec.play({ id, time: 0, ms: 200, reduced, instant: false, ev: null, piece: null, ...UI_TARGETS });
      const shakes = rec.calls.filter((c) => c.name === 'shake');
      if (reduced) expect(shakes).toEqual([]);
      else {
        expect(shakes.length).toBeGreaterThan(0);
        for (const s of shakes) {
          expect(s.cue).toBe(18);
          expect(s.args[0]).toBe(3);
        }
      }
    }
  });

  it('JUICE #19 the truck plays its light haptic once (first block), sfx_land once per block', () => {
    const plans = planHand(5);
    const truck = plans.flatMap((p) => p.cues).find((c) => c.kind === 19);
    const jc = truck ? juiceCue(truck, false) : null;
    expect(jc?.drops?.length).toBe(3);
    const rec = recorder();
    if (jc) rec.play(jc);
    expect(rec.calls.filter((c) => c.name === 'haptic').map((c) => c.args[0])).toEqual(['light']);
    expect(rec.calls.filter((c) => c.name === 'sound' && c.args[0] === 'sfx_land')).toHaveLength(3);
  });

  it('JUICE #56 Bonus İnşaat: one coin per counted move (≤ 10, META 3.1), light haptic every 3rd coin', () => {
    const last = planHand(1).at(-1);
    const bonus = last?.cues.find((c) => c.kind === 56);
    const left = bonus?.n ?? 0;
    expect(left).toBeGreaterThan(0);
    const counted = Math.min(left, BONUS_MAX);
    const rec = recorder();
    const jc = bonus ? juiceCue(bonus, false) : null;
    if (jc) rec.play(jc);
    expect(rec.calls.filter((c) => c.name === 'sound' && c.args[0] === 'sfx_coin')).toHaveLength(counted);
    expect(rec.calls.filter((c) => c.name === 'haptic')).toHaveLength(Math.floor(counted / 3));
  });

  it('JUICE #51 sfx_lastmoves + haptic only on the move that brings the counter to 5', () => {
    const game = GameSession.start(compiledLevel({ ...OFFER_LEVEL, moves: 7 }));
    const seen: { left: number; sounds: number; haptics: number }[] = [];
    for (let k = 0; k < 4; k++) {
      const { cues } = commitAndPlan(game, burn(k));
      const rec = recorder();
      for (const c of cues) {
        const jc = c.kind === 51 ? juiceCue(c, false) : null;
        if (jc) rec.play(jc);
      }
      seen.push({
        left: game.movesLeft,
        sounds: rec.calls.filter((c) => c.name === 'sound' && c.args[0] === 'sfx_lastmoves').length,
        haptics: rec.calls.filter((c) => c.name === 'haptic').length,
      });
    }
    expect(seen).toEqual([
      { left: 6, sounds: 0, haptics: 0 },
      { left: 5, sounds: 1, haptics: 1 },
      { left: 4, sounds: 0, haptics: 0 },
      { left: 3, sounds: 0, haptics: 0 },
    ]);
  });

  /** Sound requests of one handler run, as "name@time" (rate / gain ignored). */
  function soundKeys(cue: JuiceCue): string[] {
    const rec = recorder();
    rec.play(cue);
    return rec.calls
      .filter((c) => c.name === 'sound')
      .map((c) => `${String(c.args[0])}@${String((c.args[1] as { at?: number } | undefined)?.at)}`);
  }

  it('JUICE 0 rule 6 no board handler asks for the same sound twice at the same instant (the gate would drop it)', () => {
    for (const reduced of [false, true])
      for (const c of boardCues(reduced)) {
        const keys = soundKeys(c);
        expect({ id: c.id, keys }).toEqual({ id: c.id, keys: [...new Set(keys)] });
      }
  });
});

describe('review: K-33 worked examples through the cue plan (#15, #16, streak reset)', () => {
  it('K-33 example 1: correct, correct, yard move, correct, correct → beads 1, 2, (none), 3, 4 + trowel (#16)', () => {
    const game = GameSession.start(levelFile(5));
    const [m1, m2, m3, m4] = handMoves(5);
    if (!m1 || !m2 || !m3 || !m4) throw new Error('level 5 hand solution');
    const beads = (p: Planned): number[] => p.cues.filter((c) => c.kind === 15).map((c) => c.n ?? 0);
    const trowel = (p: Planned): number[] => p.cues.filter((c) => c.kind === 16).map((c) => c.n ?? 0);
    const resets = (p: Planned): number => p.cues.filter((c) => c.kind === 'streakReset').length;
    const a = commitAndPlan(game, m1);
    const b = commitAndPlan(game, m2);
    const yard = commitAndPlan(game, drag(0, 2, 7)); // D2_90 R (4,7) → (2,7): K-10 yard move, c unchanged
    const c = commitAndPlan(game, m3);
    const d = commitAndPlan(game, m4);
    expect([beads(a), beads(b), beads(yard), beads(c), beads(d)]).toEqual([[1], [2], [], [3], [4]]);
    expect([trowel(a), trowel(b), trowel(yard), trowel(c), trowel(d)]).toEqual([[], [], [], [], [1]]);
    expect(resets(yard)).toBe(0);
    const k = kinds(d.cues);
    expect(k.indexOf('16')).toBeGreaterThan(k.indexOf('15'));
  });

  it('K-33 example 2: correct, correct, wrong → the streak resets (no bead, a streakReset cue with the #13 bounce)', () => {
    const game = GameSession.start(levelFile(1));
    const [m1, m2] = handMoves(1);
    if (!m1 || !m2) throw new Error('level 1 hand solution');
    commitAndPlan(game, m1);
    commitAndPlan(game, m2);
    const wrong = commitAndPlan(game, drag(4, 6, 8)); // D2_90 W lands on row 3, outside the plan
    const k = kinds(wrong.cues);
    expect(k).toContain('13');
    expect(k).toContain('streakReset');
    expect(k).not.toContain('15');
  });
});

// --- tutorial -----------------------------------------------------------------------------------------------------------

/** A level compiled with another `tutorial[]` (board and pieces unchanged). */
function withTutorial(base: CompiledLevel, tutorial: readonly unknown[]): CompiledLevel {
  const loaded = loadLevel({ ...base.data, tutorial });
  if (!loaded.ok) throw new Error(`tutorial variant does not load: ${JSON.stringify(loaded.issues)}`);
  return loaded.level;
}

describe('review: GDD 14.1/3 tutorial done events', () => {
  const TROWEL_BONUS = (): StreakBonus => ({ moves: 0, trowels: 1 });

  it('GDD 14.1/3 a Golden Trowel fill is not placementCorrect nor turnEnd (drag moves only), but counts for segmentDone', () => {
    const lvl = compiledLevel({ moves: 5, plan: ['W.'], pieces: [['B1_0', 'Y', 0, 0]] });
    const game = GameSession.start(lvl, { streakTier: 1 }, { streakBonus: TROWEL_BONUS });
    const sink = new ArraySink();
    expect(game.commit({ kind: 'trowel', seg: 0, x: 0, y: 0 }, sink).status).toBe('applied');
    expect(moveMatches({ event: 'placementCorrect', count: 1 }, sink.events, game.state)).toBe(false);
    expect(moveMatches({ event: 'turnEnd', count: 1 }, sink.events, game.state)).toBe(false);
    expect(moveMatches({ event: 'landed', count: 1 }, sink.events, game.state)).toBe(false);
    expect(moveMatches({ event: 'segmentDone', count: 1 }, sink.events, game.state)).toBe(true);
  });

  it('GDD 14.1/3 landed = a free-mode block dropped on the site stopped (correct or wrong); not a yard move, not a rail park', () => {
    const l1 = GameSession.start(levelFile(1));
    const wrong = commitAndPlan(l1, drag(1, 6, 8)).events; // W onto the Y row: lands, then bounces (K-17)
    expect(wrong.some((e) => e.t === 'placementWrong')).toBe(true);
    expect(moveMatches({ event: 'landed', count: 1 }, wrong, l1.state)).toBe(true);
    expect(moveMatches({ event: 'turnEnd', count: 1 }, wrong, l1.state)).toBe(true);
    const yard = commitAndPlan(l1, drag(3, 1, 6)).events; // D2_0 Y (0,6) → (1,6): K-10 yard move
    expect(moveMatches({ event: 'yardMove', count: 1 }, yard, l1.state)).toBe(true);
    expect(moveMatches({ event: 'turnEnd', count: 1 }, yard, l1.state)).toBe(true);
    expect(moveMatches({ event: 'landed', count: 1 }, yard, l1.state)).toBe(false);
    const l3 = GameSession.start(levelFile(3));
    const [r1, r2] = handMoves(3);
    if (!r1 || !r2) throw new Error('level 3 hand solution');
    l3.commit(r1);
    const rail = commitAndPlan(l3, r2).events; // W1 rail park (K-12): no fall
    expect(rail.some((e) => e.t === 'pieceMoved' && e.entry === 'gap')).toBe(true);
    expect(moveMatches({ event: 'placementCorrect', count: 1 }, rail, l3.state)).toBe(true);
    expect(moveMatches({ event: 'landed', count: 1 }, rail, l3.state)).toBe(false);
  });

  it('GDD 14.1/3 count only counts events after the step started (level 4 board, timed step 1: two correct placements during step 1 do not finish step 2)', () => {
    // the pre-round level 4 tutorial (step 1 timeoutMs 2500, step 2 placementCorrect ×2) on the level 4 board; the data
    // itself now ends step 1 with an event (LEVELS Bölüm 4, Faz 2 tur 1 #0)
    const lvl = withTutorial(levelFile(4), [
      { step: 1, mode: 'soft', highlight: ['cell:7,2'], textKey: 'tut.l4.window', done: { timeoutMs: 2500 } },
      {
        step: 2,
        mode: 'soft',
        highlight: ['front'],
        textKey: 'tut.ctx.support',
        done: { event: 'placementCorrect', count: 2 },
      },
    ]);
    const game = GameSession.start(lvl);
    const hooks = levelHooks(lvl);
    const ended: [number, boolean][] = [];
    const tut = new TutorialController(lvl, {
      state: () => game.state,
      dragRules: () => hooks.drag ?? {},
      hooks: () => hooks,
      markContextTip: () => {},
      stepEnded: (step, skipped) => ended.push([step, skipped]),
    });
    tut.start(0);
    expect(tut.current?.data.step).toBe(1); // timeoutMs 2500
    const [m1, m2, m3] = handMoves(4);
    if (!m1 || !m2 || !m3) throw new Error('level 4 hand solution');
    for (const [m, now] of [
      [m1, 500],
      [m2, 1500],
    ] as const) {
      const sink = new ArraySink();
      expect(game.commit(m, sink).status).toBe('applied');
      expect(sink.events.some((e) => e.t === 'placementCorrect')).toBe(true);
      tut.moveEnded(sink.events, now);
    }
    expect(tut.current?.data.step).toBe(1);
    tut.update(2500);
    expect(ended).toEqual([[1, false]]);
    expect(tut.current?.data.step).toBe(2); // placementCorrect ×2, counted from now on
    const sink = new ArraySink();
    expect(game.commit(m3, sink).status).toBe('applied');
    tut.moveEnded(sink.events, 3000);
    expect(tut.current?.data.step).toBe(2);
    expect(ended).toEqual([[1, false]]);
  });
});

// --- K-29 / K-43 attempt record -----------------------------------------------------------------------------------------

describe('review: K-29 offers through the attempt record (UX 7, META 3.2, ANALYTICS 2)', () => {
  it('K-29 gift (n = 1, free, no ad) → 1.350 (2/3, no ad) → 1.800 (3/3 · son teklif) → no 4th: loss, 3 extensions', () => {
    const p = proc();
    const lvl = compiledLevel(OFFER_LEVEL);
    p.save.commit((d) => void (d.coins = 10_000));
    const a = LevelAttempt.begin(p.deps, lvl, { preBoosters: [], streakTier: 0 });
    const game = GameSession.start(lvl);
    let k = 0;
    const burnTo0 = (): void => {
      while (game.outcome === 'playing') scenePlay(a, game, burn(k++), lvl);
    };

    burnTo0();
    const m1 = windowModel(game, p.save);
    expect(m1).toMatchObject({ n: 1, max: 3, counterKey: 'lose.offer.count', ad: null });
    expect(m1.coin).toEqual({ kind: 'gift', moves: 5 });
    a.offerShown(m1);
    takeCoins(a, game, m1);
    expect(p.save.data.coins).toBe(10_000);
    expect(game.movesLeft).toBe(5);

    burnTo0();
    const m2 = windowModel(game, p.save);
    expect(m2).toMatchObject({ n: 2, counterKey: 'lose.offer.count', ad: null });
    expect(m2.coin).toMatchObject({ kind: 'buy', price: 1350, moves: 5 });
    a.offerShown(m2);
    takeCoins(a, game, m2);

    burnTo0();
    const m3 = windowModel(game, p.save);
    expect(m3).toMatchObject({ n: 3, counterKey: 'lose.offer.last', ad: null });
    expect(m3.coin).toMatchObject({ kind: 'buy', price: 1800 });
    a.offerShown(m3);
    takeCoins(a, game, m3);
    expect(p.save.data.inLevel).toMatchObject({ offersUsed: 3, offerSpendCoins: 3150 });

    burnTo0(); // "3 teklif kullanılmışsa pencere teklif içermez, doğrudan sonuç (kayıp)"
    expect(game.outcome).toBe('lost');
    expect(game.nextOffer()).toBeNull();
    expect(p.save.data.inLevel).toBeNull();
    expect(p.save.data.coins).toBe(10_000 - 3150);
    expect(p.save.data.lives).toMatchObject({ stored: economy.startingWallet.lives - 1, reserved: 0 });
    expect(levelEnd(p.events)).toMatchObject({
      result: 'lose',
      extensions: 3,
      movesLeft: 0,
      exitFree: false,
    });
    const results = p.events.filter((e) => e.name === 'offer_result');
    expect(
      results.map((e) => (e.name === 'offer_result' ? [e.offerIndex, e.result, e.priceCoins] : null)),
    ).toEqual([
      [1, 'free', 0],
      [2, 'coins', 1350],
      [3, 'coins', 1800],
    ]);
  });

  it('K-29 GDD example: offer 1 taken with an ad → offer 2 costs 1.350 and has no ad option', () => {
    const game = GameSession.start(compiledLevel(OFFER_LEVEL));
    game.commit(burn(0));
    expect(game.nextOffer()).toEqual({ n: 1, adAllowed: true });
    expect(game.acceptOffer('offerAd').status).toBe('applied');
    expect(game.movesLeft).toBe(5);
    for (let k = 1; k <= 5; k++) game.commit(burn(k));
    const offer = game.nextOffer();
    expect(offer).toEqual({ n: 2, adAllowed: false });
    const m = offerModel({
      n: offer?.n ?? 0,
      adAllowed: offer?.adAllowed ?? true,
      giftAvailable: false,
      coins: 5000,
      ads: { kind: 'available', watchedToday: 1 },
    });
    expect(m.coin).toMatchObject({ kind: 'buy', price: 1350 });
    expect(m.ad).toBeNull();
    expect(game.acceptOffer('offerAd').status).toBe('rejected');
  });

  it('K-43 (a) / UX 1 a kill with the out-of-moves window open reopens the SAME offer (n, price, no ad) on launch', () => {
    const store = new MemoryStore();
    const p = proc(store);
    const lvl = compiledLevel(OFFER_LEVEL);
    p.save.commit((d) => {
      d.coins = 10_000;
      d.firstOfferGiftUsed = true;
    });
    const a = LevelAttempt.begin(p.deps, lvl, { preBoosters: [], streakTier: 0 });
    const game = GameSession.start(lvl);
    let k = 0;
    scenePlay(a, game, burn(k++), lvl);
    const m1 = windowModel(game, p.save);
    a.offerShown(m1);
    takeCoins(a, game, m1);
    while (game.outcome === 'playing') scenePlay(a, game, burn(k++), lvl);
    const m2 = windowModel(game, p.save);
    a.offerShown(m2);

    const q = proc(store, 2_000_000); // app killed, opened again
    const decision = q.save.resumeOnLaunch(identity(lvl));
    const route = launchRoute(q.save.data, decision);
    expect(route).toMatchObject({ kind: 'level', levelId: lvl.id, window: 'outOfMoves' });
    if (route.kind !== 'level') return;
    const again = GameSession.replay(lvl, route.resume);
    expect(again.outcome).toBe('outOfMoves');
    expect(windowModel(again, q.save)).toEqual(m2);
    expect(q.save.data.lives.reserved).toBe(1);
  });

  it('K-43 item 4 a voided attempt gives back the coins paid for +5 offers but not the lifetime-first gift', () => {
    const store = new MemoryStore();
    const p = proc(store);
    const lvl = compiledLevel(OFFER_LEVEL);
    p.save.commit((d) => void (d.coins = 2000));
    const a = LevelAttempt.begin(p.deps, lvl, { preBoosters: [], streakTier: 0 });
    const game = GameSession.start(lvl);
    let k = 0;
    scenePlay(a, game, burn(k++), lvl);
    const gift = windowModel(game, p.save);
    expect(gift.coin.kind).toBe('gift');
    takeCoins(a, game, gift);
    while (game.outcome === 'playing') scenePlay(a, game, burn(k++), lvl);
    const paid = windowModel(game, p.save);
    takeCoins(a, game, paid);
    expect(p.save.data.coins).toBe(2000 - 1350);

    const q = proc(store, 2_000_000);
    const decision = q.save.resumeOnLaunch(() => ({ levelHash: 'changed', rulesVersion: RULES_VERSION }));
    expect(decision.kind).toBe('void');
    expect(launchRoute(q.save.data, decision)).toEqual({ kind: 'home' });
    expect(q.save.data.coins).toBe(2000);
    expect(q.save.data.firstOfferGiftUsed).toBe(true);
    expect(q.save.data.lives).toMatchObject({ stored: economy.startingWallet.lives, reserved: 0 });
    expect(q.events.some((e) => e.name === 'level_end' || e.name === 'life_lost')).toBe(false);
  });
});

describe('review: K-43 worked example and resume (GDD K-43, META 5, STORY 7.5)', () => {
  /** Level 15 (the win streak counts from 15, META §5): a W block for the plan and a B1 Y to make yard moves. */
  const LEVEL_15: LevelSpec = {
    id: 15,
    moves: 10,
    plan: ['WW'],
    pieces: [
      ['D2_90', 'W', 0, 0],
      ['B1_0', 'Y', 5, 0],
    ],
  };

  function threeMoves(p: Proc): { lvl: CompiledLevel; game: GameSession; a: LevelAttempt } {
    const lvl = compiledLevel(LEVEL_15);
    p.save.commit((d) => void (d.winStreak = 3));
    const streakTier = streakTierOf(lvl.id, p.save.data.winStreak);
    const a = LevelAttempt.begin(p.deps, lvl, { preBoosters: [], streakTier });
    const game = GameSession.start(lvl, { preBoosters: [], streakTier }, { streakBonus: streakBonusOf });
    for (let k = 0; k < 3; k++) scenePlay(a, game, burn(k, 1), lvl);
    expect(game.movesMade).toBe(3);
    return { lvl, game, a };
  }

  it('K-43 example: 3 moves, exit confirmed → lives 5 → 4, streak 3 → 0 (exit.cost + exit.streak, then lose.life + lose.streak)', () => {
    const p = proc();
    const { game, a } = threeMoves(p);
    expect(exitLines({ movesMade: game.movesMade, preBoosters: 0, winStreak: 3, bridge: false })).toEqual([
      'exit.cost',
      'exit.streak',
    ]);
    expect(game.exit().kind).toBe('loss');
    const res = a.loss(game, 'quit');
    expect(res).toEqual({ lifeLost: true, streakLost: true });
    expect(lossLines(res.streakLost)).toEqual(['lose.life', 'lose.streak']);
    expect(p.save.data.lives).toMatchObject({ stored: 4, reserved: 0 });
    expect(p.save.data.winStreak).toBe(0);
    expect(levelEnd(p.events)).toMatchObject({ result: 'quit', exitFree: false });
  });

  it('K-43 example: 3 moves, the system kills the app → same level, same moves left and board; life reserved, streak 3', () => {
    const store = new MemoryStore();
    const p = proc(store);
    const { lvl, game } = threeMoves(p);
    const q = proc(store, 1_000_000 + 2 * 3600_000); // E-38: opened 2 hours later
    const decision = q.save.resumeOnLaunch(identity(lvl));
    const route = launchRoute(q.save.data, decision);
    expect(route).toMatchObject({ kind: 'level', levelId: 15, window: 'pause' });
    if (route.kind !== 'level') return;
    const again = GameSession.replay(lvl, route.resume, { streakBonus: streakBonusOf });
    expect(again.movesLeft).toBe(game.movesLeft);
    expect(Array.from(again.state.buf)).toEqual(Array.from(game.state.buf));
    expect(q.save.data.lives).toMatchObject({ stored: 5, reserved: 1 });
    expect(q.save.data.winStreak).toBe(3);
    expect(q.events.map((e) => e.name)).toEqual(['level_resume']);
  });

  it('K-43 item 2 / E-41 exit at m = 0 keeps the streak and its bonus, gives the life back (exit.free only)', () => {
    const p = proc();
    const lvl = compiledLevel(LEVEL_15);
    p.save.commit((d) => void (d.winStreak = 3));
    const tier = streakTierOf(lvl.id, 3);
    const a = LevelAttempt.begin(p.deps, lvl, { preBoosters: [], streakTier: tier });
    const game = GameSession.start(
      lvl,
      { preBoosters: [], streakTier: tier },
      { streakBonus: streakBonusOf },
    );
    expect(exitLines({ movesMade: 0, preBoosters: 0, winStreak: 3, bridge: false })).toEqual(['exit.free']);
    const ex = game.exit();
    expect(ex).toMatchObject({ kind: 'free', streakBonusConsumed: false });
    a.exitFree(game, ex.refundPreBoosters);
    expect(p.save.data.lives).toMatchObject({ stored: 5, reserved: 0 });
    expect(p.save.data.winStreak).toBe(3);
    expect(streakTierOf(lvl.id, p.save.data.winStreak)).toBe(tier); // the next entry gets the same bonus
    expect(levelEnd(p.events)).toMatchObject({ result: 'quit', exitFree: true });
    expect(p.events.some((e) => e.name === 'life_lost')).toBe(false);
  });

  it('ANALYTICS level_end.wrongPlacements counts the whole attempt, also the moves before a K-43 resume (fixed: Faz 2 tur 1 #19)', () => {
    const store = new MemoryStore();
    const p = proc(store);
    const lvl = levelFile(1);
    const a = LevelAttempt.begin(p.deps, lvl, { preBoosters: [], streakTier: 0 });
    const game = GameSession.start(lvl);
    const ev = scenePlay(a, game, drag(1, 6, 8), lvl); // W onto the Y row → K-17 bounce
    expect(ev.some((e) => e.t === 'placementWrong')).toBe(true);

    const q = proc(store, 1_200_000); // killed and opened again: the same attempt goes on (K-43 item 3)
    const decision = q.save.resumeOnLaunch(identity(lvl));
    if (decision.kind !== 'resume') throw new Error(decision.kind);
    // the scene replays the log into a sink and hands its events to the resumed attempt (LevelScene.startLevel)
    const replayed = new ArraySink();
    const again = GameSession.replay(lvl, decision.inLevel.actions as SessionAction[], {}, replayed);
    const inLevel = q.save.data.inLevel;
    if (!inLevel) throw new Error('no inLevel');
    const b = LevelAttempt.resumed(q.deps, inLevel, replayed.events);
    for (const m of handMoves(1)) scenePlay(b, again, m, lvl);
    expect(again.outcome).toBe('won');
    // ANALYTICS §2 level_end.wrongPlacements: the attempt's wrong placements (resume = the same attempt)
    expect(levelEnd(q.events).wrongPlacements).toBe(1);
  });
});

// --- window models ------------------------------------------------------------------------------------------------------

describe('review: window models (K-15, UX 7)', () => {
  it('K-15 example rows ["YY","W.","WW"]: 5 cells to fill, (7,1) stays empty → "Kalan: 5 hücre"', () => {
    const s = GameSession.start(
      compiledLevel({ plan: ['YY', 'W.', 'WW'], pieces: [['B1_0', 'W', 0, 0]] }),
    ).state;
    expect(remainingPlanCells(s)).toBe(5);
  });

  it('K-15 / UX 7 "Kalan" counts every segment and drops by the cells a correct placement fills', () => {
    const game = GameSession.start(levelFile(5));
    expect(remainingPlanCells(game.state)).toBe(16); // two segments of 2 × 4, no "."
    const [first] = handMoves(5);
    if (!first) throw new Error('level 5 hand solution');
    game.commit(first); // D2_90 G → (6,0)-(7,0)
    expect(remainingPlanCells(game.state)).toBe(14);
  });
});

// --- launch after a voided attempt (UX 1 (c)) ---------------------------------------------------------------------------

describe('review: UX 1 (c) the home button after a voided attempt', () => {
  it('UX 1 (c) after a voided attempt the home button restarts the SAME level (1–5 loop: level 3 voided → "BÖLÜM 3"; fixed: Faz 2 tur 2 #17)', () => {
    const store = new MemoryStore();
    const p = proc(store);
    p.save.commit((d) => {
      d.progress.highestLevel = 5; // the slice was finished once: the 1–5 loop (UX 6)
      d.town.seenScenes.push('story.prologue');
    });
    const lvl = levelFile(3);
    const a = LevelAttempt.begin(p.deps, lvl, { preBoosters: [], streakTier: 0 });
    const game = GameSession.start(lvl);
    const [m1] = handMoves(3);
    if (!m1) throw new Error('level 3 hand solution');
    scenePlay(a, game, m1, lvl);

    const q = proc(store, 2_000_000); // an update changed level 3
    const decision = q.save.resumeOnLaunch(() => ({ levelHash: 'changed', rulesVersion: RULES_VERSION }));
    expect(decision.kind).toBe('void');
    expect(launchRoute(q.save.data, decision)).toEqual({ kind: 'home' });
    expect(q.save.data.voidNotice?.level).toBe(3);
    // UX §1 (c): "Oyuncu aynı bölümü Bölüm düğmesiyle yeniden başlatır"
    expect(homeTarget(q.save.data, null).next).toBe(3);
  });
});

// --- TECH 12.2 / 14.1 rule coverage gate --------------------------------------------------------------------------------

describe('review: TECH 12.2 test:rules --phase 2 (rule coverage of the Phase 2 scope)', () => {
  const ROOT = fileURLToPath(new URL('../../', import.meta.url));
  const TECH = readFileSync(join(ROOT, 'docs/TECH_DESIGN.md'), 'utf8');

  /** §12.4 coverage table: K-xx whose first phase (F column) is ≤ 2. */
  function phase2Rules(): string[] {
    const out: string[] = [];
    for (const line of TECH.split('\n')) {
      if (!line.startsWith('| K-')) continue;
      const cells = line.split('|').map((c) => c.trim());
      for (let i = 1; i + 2 < cells.length; i++) {
        const id = /^K-\d\d$/.exec(cells[i] ?? '')?.[0];
        if (!id) continue;
        const f = Number(/\d/.exec(cells[i + 2] ?? '')?.[0]);
        if (f <= 2) out.push(id);
      }
    }
    return [...new Set(out)].sort();
  }

  /** §12.2: "`--phase 2` zorunlu E kümesi = E-01, …". */
  function phase2EdgeCases(): string[] {
    const m = /--phase 2` zorunlu E kümesi = ([^;]+);/.exec(TECH);
    return [...(m?.[1] ?? '').matchAll(/E-\d\d/g)].map((x) => x[0]);
  }

  /** Titles of every it / test / describe in tests/** (a test name contains its describe titles). */
  function testTitles(): string[] {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.test\.ts$/.test(e.name)) files.push(p);
      }
    };
    walk(join(ROOT, 'tests'));
    const out: string[] = [];
    const re = /\b(?:it|test|describe)(?:\.\w+)*\(\s*(['"`])(.*?)\1/gs;
    for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(re)) out.push(m[2] ?? '');
    return out;
  }

  it('TECH 14.1 every Phase 2 rule id (K-xx with F ≤ 2, W1, S1, S2 and the 9 E rows) is in at least one test name', () => {
    const rules = phase2Rules();
    expect(rules).toEqual(expect.arrayContaining(['K-01', 'K-19', 'K-29', 'K-43', 'K-45', 'K-46']));
    expect(rules).not.toContain('K-20');
    expect(rules).not.toContain('K-30');
    const edges = phase2EdgeCases();
    expect(edges).toEqual(['E-01', 'E-03', 'E-06', 'E-21', 'E-27', 'E-28', 'E-30', 'E-34', 'E-38']);
    const titles = testTitles();
    const missing = [...rules, 'W1', 'S1', 'S2', ...edges].filter(
      (id) => !titles.some((t) => new RegExp(`(^|[^\\w-])${id}(?!\\d)`).test(t)),
    );
    expect(missing).toEqual([]);
  });

  it(
    'TECH 12.2 / 14.1 `npm run test:rules` enforces the phase 2 coverage (fixed: Faz 2 tur 1 #20 / #22)',
    { timeout: 60_000 },
    () => {
      const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'rule-coverage.ts'), '--phase', '2'], {
        cwd: ROOT,
        encoding: 'utf8',
      });
      expect(r.status).toBe(0);
      expect(r.stdout).not.toMatch(/not implemented|NOT enforced/);
    },
  );
});

// =========================================================================================================================
// Round 2 — the code the Faz 2 tur 1 fixes touched (#0–#4, #12, #13, #15, #19) and the Phase 2 rules round 1 left open
// =========================================================================================================================

const layoutOf = (width: number, height: number): Layout =>
  createLayout(TOKENS, designHeight('expand', { width, height }, TOKENS));
const sortedXY = (cells: readonly { readonly x: number; readonly y: number }[]): string[] =>
  cells.map((c) => `${c.x},${c.y}`).sort();
const play = (game: GameSession, moves: readonly Move[]): void => {
  for (const m of moves) expect(game.commit(m).status).toBe('applied');
};
const handMove = (id: 1 | 2 | 3 | 4 | 5, i: number): Move => {
  const m = handMoves(id)[i];
  if (!m) throw new Error(`level ${id} hand move ${i}`);
  return m;
};

/** The fall shadow of releasing `pieceId` at `node` now, as LevelScene feeds ShadowView. */
function lookAt(
  game: GameSession,
  pieceId: PieceId,
  node: DragNode,
  difficulty: CompiledLevel['difficulty'] = game.lvl.difficulty,
) {
  const fall = computeFall(game.state, pieceId, node);
  return { fall, look: shadowLook(fall, difficulty, { state: game.state, pieceId }) };
}

/** Plan character of global site cell (x, y) in segment `seg` from the level DATA (rows top → bottom); null = outside. */
function planChar(lvl: CompiledLevel, seg: number, x: number, y: number): string | null {
  const rows = lvl.data.build.segments[seg]?.rows ?? [];
  if (x < 6 || x > 7 || y < 0 || y >= rows.length) return null;
  return rows[rows.length - 1 - y]?.[x - 6] ?? null;
}

describe('review round 2: UX 5.4 fall shadow look (K-18, K-34 hook 2; fixed: Faz 2 tur 1 #0–#2)', () => {
  /** Three D2_90 W fill plan rows 0–2; row 3 is `WY`; a C3_0 W lands with (7,3) on the Y cell. */
  const K18: LevelSpec = {
    moves: 9,
    plan: ['WW', 'WY', 'WW', 'WW', 'WW'],
    pieces: [
      ['D2_90', 'W', 0, 0],
      ['D2_90', 'W', 2, 0],
      ['D2_90', 'W', 4, 0],
      ['C3_0', 'W', 2, 2],
    ],
  };

  it('K-18 GDD example (easy, C3_0 W lands with (7,3) on a Y cell → "hatalı (renk)"): dashed invalid outline, "!", 2 Hz, 45° hatch on (7,3) only; hard: position only', () => {
    const game = GameSession.start(compiledLevel({ ...K18, difficulty: 'easy' }));
    play(game, [drag(0, 6, 8), drag(1, 6, 8), drag(2, 6, 8)]);
    const { fall, look } = lookAt(game, 3, N(6, 8));
    expect(fall.landing).toEqual({ ix: 6, iy: 3 });
    expect(fall.verdict.reasons).toEqual(['color']);
    // UX §5.4 "Hatalı — renk uyuşmuyor": kesik kırmızı kontur, 2 Hz nabız + rozet "!"; uyuşmayan hücrelerde 45° tarama
    expect([look.outline, look.badge, look.pulse, look.body]).toEqual(['invalid', 'warn', true, true]);
    expect(sortedXY(look.mismatchCells)).toEqual(['7,3']);
    expect(look.supportCells).toEqual([]);
    // GDD K-18: "Aynı durum Zor bölümde → gölge yalnızca konumu gösterir"
    const hard = lookAt(game, 3, N(6, 8), 'hard').look;
    expect([hard.outline, hard.badge, hard.pulse]).toEqual(['neutral', null, false]);
    expect([hard.mismatchCells, hard.supportCells]).toEqual([[], []]);
  });

  it('K-34 example 1 / example 3 (O4 W over a D2_0 W in column 6): "↓" badge and the horizontal hatch on (7,0), (7,1), no 45° hatch; hard: neutral, missing support not shown before the bounce (UX 5.4, 5.5)', () => {
    const lvl = (difficulty: 'easy' | 'hard') =>
      compiledLevel({
        moves: 9,
        difficulty,
        plan: ['WW', 'WW', 'WW', 'WW'],
        pieces: [
          ['D2_0', 'W', 0, 0],
          ['O4_0', 'W', 2, 0],
        ],
      });
    const easy = GameSession.start(lvl('easy'));
    play(easy, [drag(0, 6, 8)]);
    const e = lookAt(easy, 1, N(6, 8));
    expect(e.fall.landing).toEqual({ ix: 6, iy: 2 });
    expect([e.look.outline, e.look.badge, e.look.pulse]).toEqual(['invalid', 'support', true]);
    expect(sortedXY(e.look.supportCells)).toEqual(['7,0', '7,1']);
    expect(e.look.mismatchCells).toEqual([]);
    const hard = GameSession.start(lvl('hard'));
    play(hard, [drag(0, 6, 8)]);
    const h = lookAt(hard, 1, N(6, 8)).look;
    // UX §5.4 Zor / Çok Zor: "nötr kontur; eksik destek gösterilmez (geri sekme ya da harç yapışmasından sonra gösterilir)"
    expect([h.outline, h.badge, h.supportCells, h.mismatchCells]).toEqual(['neutral', null, [], []]);
  });

  it('UX 5.4 "Gölge yalnız birincil nedeni gösterir": level 2 c (C3_180 Y) at x = 6 after A is colour + support → "!" and the 45° hatch on (7,2), (6,3) only, no support hatch', () => {
    const game = GameSession.start(levelFile(2));
    play(game, [handMove(2, 0)]);
    const { fall, look } = lookAt(game, 2, N(6, 8));
    expect(fall.verdict.reasons).toEqual(['color', 'support']); // LEVELS Bölüm 2: "`color` (birincil) + `support`"
    expect(look.badge).toBe('warn');
    expect(sortedXY(look.mismatchCells)).toEqual(['6,3', '7,2']);
    expect(look.supportCells).toEqual([]);
  });

  it('UX 5.4 window / off-plan / debris rows: the 45° hatch covers the `.` cell, the cells above the plan, every debris cell — and nothing else', () => {
    const win = GameSession.start(
      compiledLevel({
        moves: 9,
        plan: ['W.', 'WW'],
        pieces: [
          ['D2_90', 'W', 0, 0],
          ['D2_90', 'W', 2, 0],
        ],
      }),
    );
    play(win, [drag(0, 6, 8)]);
    const w = lookAt(win, 1, N(6, 8));
    expect([w.fall.verdict.reasons[0], w.look.badge, sortedXY(w.look.mismatchCells)]).toEqual([
      'window',
      'warn',
      ['7,1'],
    ]);
    const off = GameSession.start(compiledLevel({ moves: 9, plan: ['WW'], pieces: [['D2_0', 'W', 0, 0]] }));
    const o = lookAt(off, 0, N(6, 8));
    expect([o.fall.verdict.reasons[0], o.look.badge, sortedXY(o.look.mismatchCells)]).toEqual([
      'outside',
      'warn',
      ['6,1'],
    ]);
    const deb = GameSession.start(
      compiledLevel({
        moves: 9,
        plan: ['WW', 'WW'],
        pieces: [['B1_0', 'W', 0, 0]],
        debris: [['B1_0', 'W', 6, 0]],
      }),
    );
    const debris = 1;
    expect(tryBeginDrag(deb.state, debris).ok).toBe(true);
    const d = lookAt(deb, debris, N(7, 8));
    // UX §5.4 moloz: "gölgenin bütün hücrelerinde 45° tarama" (a W debris block over a W cell is still wrong, K-16 (2))
    expect([d.fall.verdict.reasons[0], d.look.badge, sortedXY(d.look.mismatchCells)]).toEqual([
      'debris',
      'warn',
      ['7,0'],
    ]);
  });

  it('K-18 / E-20 a landing on an unrevealed `?` cell is neutral on an EASY level too: no badge, no 45° hatch (no hidden colour leaks)', () => {
    const game = GameSession.start(
      compiledLevel({
        moves: 9,
        difficulty: 'easy',
        plan: ['??', 'WY'],
        hidden: [{ kind: 'repeat', period: 1 }],
        pieces: [
          ['B1_0', 'W', 0, 0],
          ['B1_0', 'Y', 1, 0],
          ['B1_0', 'Y', 2, 0],
        ],
      }),
    );
    play(game, [drag(0, 6, 8), drag(1, 7, 8)]);
    const { fall, look } = lookAt(game, 2, N(6, 8)); // Y onto the hidden W cell
    expect(fall.touchesHidden).toBe(true);
    expect([look.outline, look.badge, look.pulse, look.mismatchCells]).toEqual(['neutral', null, false, []]);
  });

  it('K-12 / UX 5.4 "Ray": level 3 f on the rail before a → no ghost body, wrong outline with "↓" and the hatch on (6,0)…(7,1); after a → ✓ on the block', () => {
    const game = GameSession.start(levelFile(3));
    const f = handMove(3, 1);
    if (f.kind !== 'drag') throw new Error('drag');
    const before = lookAt(game, f.pieceId, f.to);
    expect(before.fall.mode).toBe('rail');
    expect([before.look.body, before.look.outline, before.look.badge]).toEqual([false, 'invalid', 'support']);
    expect(sortedXY(before.look.supportCells)).toEqual(['6,0', '6,1', '7,0', '7,1']);
    play(game, [handMove(3, 0)]);
    const after = lookAt(game, f.pieceId, f.to).look;
    expect([after.body, after.outline, after.badge, after.pulse]).toEqual([false, 'valid', 'ok', false]);
  });

  it('E-27 / K-07 row 5 / UX 5.4 "Şantiye kapalı": no shadow over a closed site, the ↩ cancel preview instead (also rows 3 and 4); none at the start node (row 1) and none for a real release', () => {
    const game = GameSession.start(
      compiledLevel({
        moves: 10,
        wall: { height: 2 },
        plan: ['WW'],
        goals: [{ type: 'build' }, { type: 'clear', target: 'crate', count: 1 }],
        obstacles: [{ type: 'crate', x: 0, y: 0 }],
        pieces: [
          ['D2_90', 'W', 2, 0],
          ['B1_0', 'Y', 4, 0],
          ['D2_90', 'Y', 2, 3],
        ],
      }),
    );
    play(game, [drag(0, 6, 2)]);
    expect(game.outcome).toBe('playing'); // the crate goal keeps the level open (K-41)
    const b1 = tryBeginDrag(game.state, 1);
    if (!b1.ok) throw new Error(b1.reason);
    const closed = b1.session.classify(N(7, 8));
    expect(closed).toMatchObject({ kind: 'cancel', reason: 'siteClosed', row: 5 });
    expect([showsShadow(closed), cancelPreview(closed)]).toEqual([false, true]);
    const crane = b1.session.classify(N(4, 8));
    expect([crane.row, showsShadow(crane), cancelPreview(crane)]).toEqual([3, false, true]);
    const home = b1.session.classify(N(4, 0));
    expect([home.row, cancelPreview(home)]).toEqual([1, false]);
    const yard = b1.session.classify(N(4, 1));
    expect([yard.row, showsShadow(yard), cancelPreview(yard)]).toEqual([2, false, false]);
    const d2 = tryBeginDrag(game.state, 2);
    if (!d2.ok) throw new Error(d2.reason);
    const straddle = d2.session.classify(N(5, 8));
    expect([straddle.row, cancelPreview(straddle)]).toEqual([4, true]);
  });

  it('UX 5.4 / K-34 hook 2 on every site release of every level 1–5 hand-solution state: the badge, the 45° cells and the support cells match an independent plan oracle (primary reason only)', () => {
    const seen = new Set<string>();
    for (const id of [1, 2, 3, 4, 5] as const) {
      const lvl = levelFile(id);
      const game = GameSession.start(lvl);
      for (const next of [...handMoves(id), null]) {
        const s = game.state;
        const seg = hdr(s, H.activeSeg);
        for (let pid = 0; pid < lvl.layout.counts.pieces; pid++) {
          const a = tryBeginDrag(s, pid);
          if (!a.ok) continue;
          const color = COLOR_CODES[pieceColor(s, pid)];
          const debris = (pieceFlags(s, pid) & FLAG_BIT.debris) !== 0;
          for (const node of a.session.reachableNodes()) {
            const kind = a.session.classify(node).kind;
            if (kind !== 'siteFree' && kind !== 'siteRail') continue;
            const { fall, look } = lookAt(game, pid, node);
            const chars = fall.cells.map((c) => ({ c, ch: planChar(lvl, seg, c.x, c.y) }));
            const outside = chars.filter((x) => x.ch === null).map((x) => x.c);
            const windows = chars.filter((x) => x.ch === '.').map((x) => x.c);
            const colour = chars
              .filter((x) => x.ch !== null && x.ch !== '.' && x.ch !== color)
              .map((x) => x.c);
            const cellReason = debris
              ? { reason: 'debris', cells: fall.cells }
              : outside.length > 0
                ? { reason: 'outside', cells: outside }
                : windows.length > 0
                  ? { reason: 'window', cells: windows }
                  : colour.length > 0
                    ? { reason: 'color', cells: colour }
                    : null;
            expect(look.body).toBe(fall.mode === 'free');
            if (cellReason) {
              seen.add(cellReason.reason);
              expect(fall.verdict.reasons[0]).toBe(cellReason.reason);
              expect([look.outline, look.badge]).toEqual(['invalid', 'warn']);
              expect(sortedXY(look.mismatchCells)).toEqual(sortedXY(cellReason.cells));
              expect(look.supportCells).toEqual([]);
            } else if (fall.verdict.ok) {
              seen.add('ok');
              expect([look.outline, look.badge, look.mismatchCells, look.supportCells]).toEqual([
                'valid',
                'ok',
                [],
                [],
              ]);
            } else {
              seen.add('support');
              expect(fall.verdict.reasons).toEqual(['support']);
              expect([look.outline, look.badge, look.mismatchCells]).toEqual(['invalid', 'support', []]);
              expect(sortedXY(look.supportCells)).toEqual(sortedXY(fall.verdict.missingSupport));
              expect(look.supportCells.length).toBeGreaterThan(0);
            }
          }
        }
        if (next) play(game, [next]);
      }
    }
    // the `.` row is covered by the window test above: no level 1–5 landing reaches level 4's (7,2) before it is closed in
    expect([...seen].sort()).toEqual(['color', 'ok', 'outside', 'support']);
  });
});

// --- tutorial gate and the LEVELS §2 tutorial sequences ------------------------------------------------------------------

type Signal = 'overWall' | 'gapPass';
interface TutMove {
  readonly move: Move;
  readonly signals: readonly Signal[];
  readonly yard: boolean;
}
interface TutRun {
  readonly game: GameSession;
  readonly tut: TutorialController;
  readonly ended: [number, boolean][];
  readonly shown: Set<number>;
  /** After each move: the step on screen, the correct placements so far, piece 2's zone. */
  readonly after: { readonly step: number | null; readonly correct: number; readonly p2Zone: number }[];
}

function tutController(
  lvl: CompiledLevel,
  game: GameSession,
  ended: [number, boolean][] = [],
  markContextTip: (topic: string) => void = () => {},
): TutorialController {
  const hooks = levelHooks(lvl);
  return new TutorialController(lvl, {
    state: () => game.state,
    dragRules: () => hooks.drag ?? {},
    hooks: () => hooks,
    markContextTip,
    stepEnded: (step, skipped) => ended.push([step, skipped]),
  });
}

/** Plays `seq` as the scene does: lift (gate checked) → drag signals → commit → move-end events after the cues. */
function tutorialRun(lvl: CompiledLevel, seq: readonly TutMove[]): TutRun {
  const game = GameSession.start(lvl, {}, { hooks: levelHooks(lvl) });
  const ended: [number, boolean][] = [];
  const shown = new Set<number>();
  const tut = tutController(lvl, game, ended);
  const after: TutRun['after'] = [];
  let now = 0;
  let correct = 0;
  const mark = (): void => {
    const c = tut.current;
    if (c) shown.add(c.data.step);
  };
  tut.start(now);
  mark();
  for (const m of seq) {
    if (m.move.kind !== 'drag') throw new Error('drag moves only');
    expect(tut.allowsPick(m.move.pieceId)).toBe(true);
    now += 40;
    tut.dragStarted(m.move.pieceId);
    for (const sig of m.signals) {
      tut.dragSignal(sig, now);
      mark();
    }
    const sink = new ArraySink();
    expect(game.commit(m.move, sink).status).toBe('applied');
    if (sink.events.some((e) => e.t === 'placementCorrect')) correct += 1;
    now += 2000;
    tut.moveEnded(sink.events, now);
    tut.update(now);
    mark();
    after.push({ step: tut.current?.data.step ?? null, correct, p2Zone: pieceZone(game.state, 2) });
  }
  return { game, tut, ended, shown, after };
}

/** Moves the gate allows now: every ✓ site release (one per landing) and, while `yardLeft` > 0, every yard move. */
function tutorialMoves(lvl: CompiledLevel, run: TutRun, yardLeft: number): TutMove[] {
  const out: TutMove[] = [];
  const s = run.game.state;
  const rules = levelHooks(lvl).drag ?? {};
  for (let pid = 0; pid < lvl.layout.counts.pieces; pid++) {
    if (!run.tut.allowsPick(pid)) continue;
    const a = tryBeginDrag(s, pid, rules);
    if (!a.ok) continue;
    const landings = new Set<string>();
    for (const node of a.session.reachableNodes()) {
      const drop = a.session.classify(node);
      const move: Move = { kind: 'drag', pieceId: pid, to: node };
      if (drop.kind === 'yard') {
        if (yardLeft > 0) out.push({ move, signals: [], yard: true });
      } else if (drop.kind === 'siteFree' || drop.kind === 'siteRail') {
        const fall = computeFall(s, pid, node);
        const key = `${fall.mode}:${fall.landing.ix},${fall.landing.iy}`;
        if (!fall.verdict.ok || landings.has(key)) continue;
        landings.add(key);
        out.push({ move, signals: drop.kind === 'siteRail' ? ['gapPass'] : ['overWall'], yard: false });
      }
    }
  }
  return out;
}

describe('review round 2: GDD 14.1/4 required-step gate and the LEVELS 2 tutorial sequences (fixed: Faz 2 tur 1 #12)', () => {
  it('GDD 14.1/4 / UX 13.1 "Zorunlu adımda delik dışındaki dokunuşlar yok sayılır": on a required step only its `piece:` blocks may be picked; soft steps and a finished tutorial leave every block free (levels 1–5 hand solutions)', () => {
    let required = 0;
    for (const id of [1, 2, 3, 4, 5] as const) {
      const lvl = levelFile(id);
      const seq = handMoves(id).map((move) => ({
        move,
        signals: (move.kind === 'drag' && move.to.mode !== FREE
          ? ['gapPass']
          : ['overWall']) as readonly Signal[],
        yard: false,
      }));
      for (let k = 0; k <= seq.length; k++) {
        const { tut } = tutorialRun(lvl, seq.slice(0, k));
        const step = tut.current;
        // TECH §8.2 / UX §13.1: `piece:<i>` = batch-0 index i (no truck pieces are highlighted in levels 1–5)
        const highlighted = (step?.data.highlight ?? [])
          .filter((h) => h.startsWith('piece:'))
          .map((h) => Number(h.slice(6)));
        if (step?.required) required += 1;
        for (let pid = 0; pid < lvl.layout.counts.pieces; pid++) {
          expect(tut.allowsPick(pid)).toBe(step?.required ? highlighted.includes(pid) : true);
        }
      }
    }
    expect(required).toBeGreaterThanOrEqual(3); // L1 step 1, L3 step 2, L4 step 3
  });

  it('GDD 14.1/3 drag signals: on the required level 1 step 1 an `overWall` of a non-highlighted block does not count; on the soft level 2 step 2 a `holdOverBuild` of any block counts', () => {
    const l1 = levelFile(1);
    const g1 = GameSession.start(l1);
    const t1 = tutController(l1, g1);
    t1.start(0);
    expect(t1.current?.data.step).toBe(1);
    t1.dragStarted(1);
    t1.dragSignal('overWall', 10);
    expect(t1.current?.data.step).toBe(1);
    t1.dragStarted(0);
    t1.dragSignal('overWall', 20);
    expect(t1.current?.data.step).toBe(2); // opens mid-drag (LEVELS Bölüm 1 step 2)

    const l2 = levelFile(2);
    const g2 = GameSession.start(l2);
    const t2 = tutController(l2, g2);
    t2.start(0);
    const sink = new ArraySink();
    expect(g2.commit(handMove(2, 0), sink).status).toBe('applied');
    t2.moveEnded(sink.events, 100);
    expect(t2.current?.data.step).toBe(2);
    expect(t2.current?.required).toBe(false);
    t2.dragStarted(1); // b, not the highlighted c
    t2.dragSignal('holdOverBuild', 200, 499);
    expect(t2.current?.data.step).toBe(2); // minMs 500 not reached
    t2.dragSignal('holdOverBuild', 300, 600);
    expect(t2.current?.data.step).toBe(3);
  });

  it("LEVELS Bölüm 1 / 3 / 4 / 5 every ✓ sequence (+ ≤ 2 yard moves) through the gate: every step is shown, none is skipped, no step is open at the win; Bölüm 3 step 3 is on screen right after f's rail placement; Bölüm 4 step 3 opens with the 2nd correct placement while p is in the yard", () => {
    for (const id of [1, 3, 4, 5] as const) {
      const lvl = levelFile(id);
      const steps = lvl.data.tutorial?.length ?? 0;
      let wins = 0;
      const dfs = (seq: TutMove[], yardLeft: number): void => {
        const run = tutorialRun(lvl, seq);
        expect(run.ended.filter(([, skipped]) => skipped)).toEqual([]);
        if (id === 3) {
          seq.forEach((m, i) => {
            if (m.move.kind === 'drag' && m.move.pieceId === 1 && !m.yard) expect(run.after[i]?.step).toBe(3);
          });
        }
        if (id === 4) {
          const i = run.after.findIndex((a) => a.correct === 2);
          if (i >= 0) {
            expect(run.after[i]?.step).toBe(3);
            expect(run.after[i]?.p2Zone).toBe(Zone.yard);
          }
        }
        if (run.game.outcome === 'won') {
          wins += 1;
          expect(run.tut.finished).toBe(true);
          expect(run.shown.size).toBe(steps);
          return;
        }
        if (run.game.outcome !== 'playing') return;
        for (const m of tutorialMoves(lvl, run, yardLeft)) dfs([...seq, m], yardLeft - (m.yard ? 1 : 0));
      };
      dfs([], id === 5 ? 1 : 2);
      expect(wins).toBeGreaterThan(0);
    }
  }, 60_000);

  it.fails(
    'FINDING UX 13.1 "oyuncu ilk doğru dokunuşu yapınca el kaybolur": the level 3 step 3 glove taps f on the rail, but f is locked (K-14) and a tap on it never hides the glove',
    () => {
      const lvl = levelFile(3);
      const game = GameSession.start(lvl);
      const tut = tutController(lvl, game);
      tut.start(0);
      let now = 0;
      for (const m of [handMove(3, 0), handMove(3, 1)]) {
        const sink = new ArraySink();
        if (m.kind === 'drag') tut.dragStarted(m.pieceId);
        expect(game.commit(m, sink).status).toBe('applied');
        tut.moveEnded(sink.events, (now += 1000));
      }
      const step = tut.current;
      expect([step?.data.step, step?.data.hand?.kind]).toEqual([3, 'tap']);
      const f = step?.pieces[0] ?? -1;
      expect(tryBeginDrag(game.state, f)).toEqual({ ok: false, reason: 'locked' }); // the scene drops the press
      tut.tapped(f, now + 100); // even if the scene forwarded the tap …
      expect(tut.current?.handHidden).toBe(true); // … the glove stays for the whole step
    },
  );
});

// --- spotlight holes and the Usta Dede bubble ----------------------------------------------------------------------------

interface StepView {
  readonly step: number;
  readonly highlight: readonly string[];
  readonly state: ReturnType<typeof cloneState>;
  readonly dragging: { readonly pieceId: number; readonly ix: number; readonly iy: number } | null;
}

/** The state (and the drag node, for a step that opens mid-drag) at the moment each step of level `id` is shown. */
function stepViews(id: 1 | 2 | 3 | 4 | 5): { lvl: CompiledLevel; views: StepView[] } {
  const lvl = levelFile(id);
  const game = GameSession.start(lvl);
  const tut = tutController(lvl, game);
  const views: StepView[] = [];
  const snap = (dragging: StepView['dragging']): void => {
    const c = tut.current;
    if (c && !views.some((v) => v.step === c.data.step))
      views.push({ step: c.data.step, highlight: c.data.highlight, state: cloneState(game.state), dragging });
  };
  tut.start(0);
  snap(null);
  let now = 0;
  for (const m of handMoves(id)) {
    if (m.kind !== 'drag') continue;
    const a = tryBeginDrag(game.state, m.pieceId);
    if (!a.ok) throw new Error(a.reason);
    tut.dragStarted(m.pieceId);
    for (const node of a.session.pathTo(m.to) ?? []) {
      const r = a.session.moveTo(node);
      const sig: Signal | null = r.crossedWall ? 'overWall' : r.enteredRail ? 'gapPass' : null;
      if (sig) {
        tut.dragSignal(sig, (now += 10));
        snap({ pieceId: m.pieceId, ix: node.ix, iy: node.iy });
      }
    }
    const sink = new ArraySink();
    expect(game.commit(m, sink).status).toBe('applied');
    tut.moveEnded(sink.events, (now += 2000));
    snap(null);
  }
  return { lvl, views };
}

/** UX 13.1 bubble: bust 200 + 16 + bubble ≤ 760 wide; every level 1–5 line fits 2 lines → the bust height. */
function bubbleFor(layout: Layout, lvl: CompiledLevel, v: StepView): { spot: Rect; holes: Rect[] } {
  const rects = highlightAll(v.highlight, {
    layout,
    state: v.state,
    level: lvl,
    hud: { truck: null, streak: null },
    dragging: v.dragging,
  });
  const holes = spotlightHoles(rects, UI.spotPadPx);
  const maxW = TOKENS.meta.designWidth - 2 * TOKENS.layout.marginPx - UI.dedeBustPx - 16;
  const w = UI.dedeBustPx + 16 + Math.min(UI.bubbleMaxW, maxW);
  const h = UI.dedeBustPx;
  // as TutorialOverlay places it (Faz 2 tur 2 #15: the candidate under the upper holes, the plan and the lower half avoided)
  const candidates = bubbleCandidates(layout, w, h, TOKENS.layout.marginPx, UI.bubbleHudGapPx, holes);
  const spot =
    bubbleSpot(candidates, holes, hudPenalties(layout), bubbleAvoid(layout, v.state)) ?? candidates[0];
  if (!spot) throw new Error('no bubble spot');
  return { spot, holes };
}

/** UX 13.1: upper half, over no spotlight hole and none of the HUD parts the player reads. */
function bubbleProblems(width: number, height: number): string[] {
  const layout = layoutOf(width, height);
  const out: string[] = [];
  for (const id of [1, 2, 3, 4, 5] as const) {
    const { lvl, views } = stepViews(id);
    for (const v of views) {
      const { spot, holes } = bubbleFor(layout, lvl, v);
      const where = `${width}×${height} L${id} step ${v.step}`;
      if (spot.y + spot.h / 2 > layout.H / 2)
        out.push(`${where}: lower half (y ${spot.y}–${spot.y + spot.h})`);
      if (holes.some((h) => rectsOverlap(h, spot))) out.push(`${where}: covers a spotlight hole`);
      if (hudPenalties(layout).some((r) => rectsOverlap(r, spot))) out.push(`${where}: covers the HUD`);
      const plan = bubbleAvoid(layout, v.state)[1];
      if (plan && rectsOverlap(plan, spot)) out.push(`${where}: covers the plan`);
    }
  }
  return out;
}

describe('review round 2: UX 13.1 spotlight holes and the Usta Dede bubble (fixed: Faz 2 tur 1 #3, #4)', () => {
  it('UX 13.1 a `piece:` hole sits on the block where it is: at the drag node while the step opens mid-drag (level 1 step 2), on the landed block after the move (level 1 a, level 3 f on the rail)', () => {
    const layout = layoutOf(390, 844);
    const l1 = stepViews(1);
    const step2 = l1.views.find((v) => v.step === 2);
    if (!step2?.dragging) throw new Error('level 1 step 2 opens mid-drag');
    const box = (s: StepView['state'], pid: number, ix: number, iy: number): Rect => {
      const shape = shapeByIndex(pieceShape(s, pid));
      return layout.grid.pieceRect(ix, iy, shape.w, shape.h);
    };
    const input = { layout, level: l1.lvl, hud: { truck: null, streak: null } };
    expect(highlightRects('piece:0', { ...input, state: step2.state, dragging: step2.dragging })).toEqual([
      box(step2.state, 0, step2.dragging.ix, step2.dragging.iy),
    ]);
    const game = GameSession.start(l1.lvl);
    play(game, [handMove(1, 0)]);
    const landed = game.state;
    expect(pieceZone(landed, 0)).toBe(Zone.site);
    expect(highlightRects('piece:0', { ...input, state: landed, dragging: null })).toEqual([
      box(landed, 0, 6, 0),
    ]);
    const l3 = stepViews(3);
    const step3 = l3.views.find((v) => v.step === 3);
    if (!step3) throw new Error('level 3 step 3');
    expect(
      highlightRects('piece:1', {
        layout,
        level: l3.lvl,
        hud: { truck: null, streak: null },
        state: step3.state,
        dragging: null,
      }),
    ).toEqual([box(step3.state, 1, 6, 2)]);
  });

  it('UX 13.1 on 390×844 and 360×800 the bubble of every level 1–5 step is in the upper half, under the HUD, over no hole and no pause / goals / moves panel', () => {
    expect([...bubbleProblems(390, 844), ...bubbleProblems(360, 800)]).toEqual([]);
  });

  it('UX 13.1 "ekranın üst yarısında (hedefi kapatmayacak yerde)" on short screens too: 390×763 (TECH 10.1, 390×844 in Safari), 360×740, 412×846, 375×667 — the level 1 step 1 bubble stays in the upper half, off the plan (fixed: Faz 2 tur 2 #15)', () => {
    expect([
      ...bubbleProblems(390, 763),
      ...bubbleProblems(360, 740),
      ...bubbleProblems(412, 846),
      ...bubbleProblems(375, 667),
    ]).toEqual([]);
  });
});

// --- contextual lines ----------------------------------------------------------------------------------------------------

const STREAK_AT = economy.combo.correctPlacementsPerTrowel - 1;
const LAST_MOVES_AT = 5;

function topicsOf(game: GameSession, move: Move): CtxTopic[] {
  const before = game.movesLeft;
  const sink = new ArraySink();
  expect(game.commit(move, sink).status).toBe('applied');
  return ctxFromMove(sink.events, before, STREAK_AT, LAST_MOVES_AT);
}

function tipHost(): { seen: Set<string>; tips: ContextTips } {
  const seen = new Set<string>();
  return {
    seen,
    tips: new ContextTips({ seen: (t) => seen.has(t), markSeen: (t) => void seen.add(t) }),
  };
}

describe('review round 2: contextual lines (GDD K-34 hook 4, LEVELS 0, TECH 8.2, UX 13.2; fixed: Faz 2 tur 1 #13)', () => {
  it('UX 13.2 triggers: the first wrong placement by primary reason (colour / window / off-plan / K-34 support), none for debris; streak 3/4; last 5 moves only when crossing 5; the truck queue', () => {
    expect(topicsOf(GameSession.start(levelFile(1)), drag(1, 6, 8))).toEqual(['bounce.color']);
    const l3 = GameSession.start(levelFile(3));
    expect(topicsOf(l3, handMove(3, 1))).toEqual(['support']); // f on the rail before a
    const win = GameSession.start(
      compiledLevel({
        moves: 9,
        plan: ['W.', 'WW'],
        pieces: [
          ['D2_90', 'W', 0, 0],
          ['D2_90', 'W', 2, 0],
        ],
      }),
    );
    play(win, [drag(0, 6, 8)]);
    expect(topicsOf(win, drag(1, 6, 8))).toEqual(['bounce.window']);
    const off = GameSession.start(compiledLevel({ moves: 9, plan: ['WW'], pieces: [['D2_0', 'W', 0, 0]] }));
    expect(topicsOf(off, drag(0, 6, 8))).toEqual(['bounce.offplan']);
    const deb = GameSession.start(
      compiledLevel({
        moves: 9,
        plan: ['WW', 'WW'],
        pieces: [['B1_0', 'W', 0, 0]],
        debris: [['B1_0', 'W', 6, 0]],
      }),
    );
    expect(topicsOf(deb, drag(1, 7, 8))).toEqual([]); // UX 13.2: "Moloz (`debris`) geri sekmesi … için bağlamsal satır yoktur"

    const streak = GameSession.start(
      compiledLevel({
        moves: 20,
        plan: ['WW', 'WW', 'WW', 'WW'],
        pieces: [
          ['D2_90', 'W', 0, 0],
          ['D2_90', 'W', 2, 0],
          ['D2_90', 'W', 4, 0],
        ],
      }),
    );
    expect(topicsOf(streak, drag(0, 6, 8))).toEqual([]);
    expect(topicsOf(streak, drag(1, 6, 8))).toEqual([]);
    expect(topicsOf(streak, drag(2, 6, 8))).toEqual(['streak']); // "Usta Serisi ilk kez 3/4"

    const last = GameSession.start(compiledLevel({ ...OFFER_LEVEL, moves: 7 }));
    const got = [0, 1, 2, 3].map((k) => [last.movesLeft, topicsOf(last, burn(k))] as const);
    expect(got).toEqual([
      [7, []],
      [6, ['lastmoves']],
      [5, []],
      [4, []],
    ]);

    const l5 = GameSession.start(levelFile(5));
    const queued = handMoves(5).map((m) => topicsOf(l5, m));
    expect(queued.some((t) => t.includes('queue'))).toBe(true); // LEVELS Bölüm 5: "Kamyonda: 1" (K-26)
  });

  it('GDD K-34 hook 4 / LEVELS 0: level 3 f on the rail before a → the support line waits while the steps are on screen and never shows in level 3; level 4 step 2 shows it and marks it; a later support bounce shows nothing', () => {
    const { seen, tips } = tipHost();
    let now = 0;
    const shownTips: CtxTopic[] = [];
    const frame = (tut: TutorialController, game: GameSession): void => {
      tips.update((now += 16), tut.current === null, TOKENS.duration.hint, (_t, serial) => {
        return game.outcome === 'playing' && serial === game.log.length; // TECH 8.2: a moment, until the next action
      });
      if (tips.showing) shownTips.push(tips.showing);
    };
    const step = (tut: TutorialController, game: GameSession, move: Move): void => {
      if (move.kind === 'drag') {
        tut.dragStarted(move.pieceId);
        if (move.to.mode !== FREE) tut.dragSignal('gapPass', now);
        else if (move.to.ix >= 6) tut.dragSignal('overWall', now);
      }
      const before = game.movesLeft;
      const sink = new ArraySink();
      expect(game.commit(move, sink).status).toBe('applied');
      tut.moveEnded(sink.events, (now += 1500));
      for (const t of ctxFromMove(sink.events, before, STREAK_AT, LAST_MOVES_AT))
        tips.trigger(t, game.log.length);
      for (let i = 0; i < 10; i++) frame(tut, game);
    };

    const l3 = levelFile(3);
    const g3 = GameSession.start(l3);
    const t3 = tutController(l3, g3, [], (t) => seen.add(t));
    t3.start(now);
    step(t3, g3, handMove(3, 1)); // f before a: K-34 bounce
    expect(tips.queued).toEqual(['support']);
    for (const m of handMoves(3)) step(t3, g3, m);
    expect(g3.outcome).toBe('won');
    tips.clear(); // level change
    expect([shownTips, seen.has('support')]).toEqual([[], false]);

    const l4 = levelFile(4);
    const g4 = GameSession.start(l4);
    const t4 = tutController(l4, g4, [], (t) => seen.add(t));
    t4.start(now);
    step(t4, g4, handMove(4, 0)); // a: step 1 done → step 2 `tut.ctx.support`
    expect(t4.current?.data.textKey).toBe('tut.ctx.support');
    expect(seen.has('support')).toBe(true); // GDD 14.1/2: marked the moment the step is shown
    step(t4, g4, handMove(4, 2)); // p before b: K-34 bounce (LEVELS Bölüm 4)
    expect(tips.queued).toEqual([]);
    expect(shownTips).toEqual([]);
  });

  it('GDD K-34 hook 4: with no tutorial step on screen the first support bounce shows the line at once and marks it; the next one shows nothing', () => {
    const { seen, tips } = tipHost();
    const game = GameSession.start(
      compiledLevel({
        moves: 9,
        plan: ['WW', 'WW', 'WW', 'WW'],
        pieces: [
          ['D2_0', 'W', 0, 0],
          ['O4_0', 'W', 2, 0],
        ],
      }),
    );
    play(game, [drag(0, 6, 8)]);
    for (const t of topicsOf(game, drag(1, 6, 8))) tips.trigger(t, game.log.length);
    tips.update(100, true, TOKENS.duration.hint, () => true);
    expect([tips.showing, seen.has('support')]).toEqual(['support', true]);
    tips.update(100 + TOKENS.duration.hint, true, TOKENS.duration.hint, () => true);
    expect(tips.showing).toBe(null);
    for (const t of topicsOf(game, drag(1, 6, 8))) tips.trigger(t, game.log.length);
    tips.update(10_000, true, TOKENS.duration.hint, () => true);
    expect([tips.showing, tips.queued]).toEqual([null, []]);
  });

  it('TECH 8.2: a queued tip whose trigger no longer holds when it could show is dropped UNMARKED and the next occurrence brings it back', () => {
    const { seen, tips } = tipHost();
    tips.trigger('bounce.color', 3);
    tips.update(0, false, TOKENS.duration.hint, () => true); // a step is on screen
    expect(tips.showing).toBe(null);
    tips.update(50, true, TOKENS.duration.hint, () => false); // the player moved on
    expect([tips.showing, tips.queued, seen.has('bounce.color')]).toEqual([null, [], false]);
    tips.trigger('bounce.color', 7);
    tips.update(100, true, TOKENS.duration.hint, () => true);
    expect([tips.showing, seen.has('bounce.color')]).toEqual(['bounce.color', true]);
  });

  it('UX 13.2 "Vurgu" column: the first-bounce lines light the bounced block and its reason cells, "blocked" lights the block, `tut.ctx.support` lights the missing-support cells + front (UX 5.5 layer 4; fixed: Faz 2 tur 2 #18)', () => {
    // UX 13.2: "geri seken blok + uyuşmayan hücreler" / "+ `.` hücreleri" / "+ plan dışı hücreler"; "blok";
    // "eksik destek hücreleri + `front`"
    const lit = (game: GameSession, move: Move): { topics: CtxTopic[]; ids: string[] } => {
      const before = game.movesLeft;
      const sink = new ArraySink();
      expect(game.commit(move, sink).status).toBe('applied');
      const topics = ctxFromMove(sink.events, before, STREAK_AT, LAST_MOVES_AT);
      return {
        topics,
        ids: topics.flatMap((t) => [...CTX_HIGHLIGHT[t], ...ctxMoveHighlight(t, sink.events, game.state)]),
      };
    };
    const color = lit(GameSession.start(levelFile(1)), drag(1, 6, 8)); // W onto the Y row
    expect(color.topics).toEqual(['bounce.color']);
    expect(color.ids).toContain(pidHighlight(1));
    expect(color.ids.filter((i) => i.startsWith('cell:')).length).toBeGreaterThan(0);

    const win = GameSession.start(
      compiledLevel({
        moves: 9,
        plan: ['W.', 'WW'],
        pieces: [
          ['D2_90', 'W', 0, 0],
          ['D2_90', 'W', 2, 0],
        ],
      }),
    );
    play(win, [drag(0, 6, 8)]);
    const dot = lit(win, drag(1, 6, 8));
    expect(dot.topics).toEqual(['bounce.window']);
    expect(dot.ids).toEqual([pidHighlight(1), 'cell:7,1']); // the `.` cell it tried to fill

    const off = lit(
      GameSession.start(compiledLevel({ moves: 9, plan: ['WW'], pieces: [['D2_0', 'W', 0, 0]] })),
      drag(0, 6, 8),
    );
    expect(off.topics).toEqual(['bounce.offplan']);
    expect(off.ids[0]).toBe(pidHighlight(0));
    expect(off.ids.filter((i) => i.startsWith('cell:')).length).toBeGreaterThan(0);

    const support = lit(GameSession.start(levelFile(3)), handMove(3, 1)); // f on the rail before a
    expect(support.topics).toEqual(['support']);
    expect(support.ids).toContain('front');
    expect(support.ids.filter((i) => i.startsWith('cell:')).length).toBeGreaterThan(0);

    // "blocked": the scene triggers it with the block it could not pick; the tip lights it
    const { tips } = tipHost();
    tips.trigger('blocked', 0, [pidHighlight(3)]);
    tips.update(0, true, TOKENS.duration.hint, () => true);
    expect(tips.highlight).toEqual([pidHighlight(3)]);
    const l1 = GameSession.start(levelFile(1));
    const layout = layoutOf(390, 844);
    const [rect] = highlightRects(pidHighlight(3), {
      layout,
      state: l1.state,
      level: levelFile(1),
      hud: { truck: null, streak: null },
    });
    expect(rect).toBeDefined();
  });
});

// --- DragController on a fake scene --------------------------------------------------------------------------------------

type PointerHandler = (pointer: unknown, over?: unknown[]) => void;

function dragRig(game: GameSession, mayPick: (id: PieceId) => boolean = () => true) {
  const handlers = new Map<string, PointerHandler>();
  const scene = {
    input: {
      on: (name: string, fn: PointerHandler) => void handlers.set(name, fn),
      off: () => undefined,
    },
    game: { events: { emit: () => true } },
  };
  const log: (string | number)[][] = [];
  const clock = { now: 0 };
  const layout = layoutOf(390, 844);
  const view = { pose: { ax: 0, ay: 0, scale: 1, alpha: 1 }, render: () => undefined };
  const host: DragHost = {
    boardState: () => game.state,
    mayPick,
    layout: () => layout,
    dragRules: () => ({}),
    view: () => view as unknown as PieceView,
    now: () => clock.now,
    fastForward: () => undefined,
    touched: () => undefined,
    pickFailed: (id, reason) => void log.push(['pickFailed', id, reason]),
    tapped: (id) => void log.push(['tapped', id]),
    lifted: (s) => void log.push(['lifted', s.pieceId]),
    nodeChanged: () => undefined,
    moved: (_s, _ax, _ay, px, py) => void log.push(['moved', px, py]),
    released: (s, node) => void log.push(['released', s.pieceId, node.ix, node.iy]),
    aborted: (s) => void log.push(['aborted', s.pieceId]),
    signal: (kind) => void log.push(['signal', kind]),
  };
  const ctl = new DragController(scene as unknown as ConstructorParameters<typeof DragController>[0], host);
  const centre = (x: number, y: number): { x: number; y: number } => {
    const r = layout.grid.cellRect(x, y);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  };
  const fire = (name: string, id: number, x: number, y: number, wasCanceled = false): void =>
    handlers.get(name)?.({ id, worldX: x, worldY: y, wasCanceled, event: { timeStamp: clock.now } }, []);
  const names = (): (string | number | undefined)[] => log.map((l) => l[0]);
  return { ctl, log, clock, centre, fire, names };
}

describe('review round 2: DragController (K-07 tap / drag, K-08 finger offset, TECH 4.6; fixed: Faz 2 tur 1 #12, #15)', () => {
  // level 1 a = D2_90 Y at (4,7): free above (crane area)
  const A = { id: 0, x: 4, y: 7 };

  it('K-07 / UX 5.3 a press released before drag.startThresholdPx and drag.holdMs is a tap: nothing is lifted or released', () => {
    const rig = dragRig(GameSession.start(levelFile(1)));
    const c = rig.centre(A.x, A.y);
    rig.fire('pointerdown', 1, c.x, c.y);
    rig.clock.now = TOKENS.drag.holdMs - 1;
    rig.ctl.update(rig.clock.now);
    rig.fire('pointermove', 1, c.x + TOKENS.drag.startThresholdPx - 1, c.y);
    rig.fire('pointerup', 1, c.x + TOKENS.drag.startThresholdPx - 1, c.y);
    expect(rig.log).toEqual([['tapped', A.id]]);
  });

  it('K-07 / UX 5.3 the press becomes a drag at drag.startThresholdPx of movement, or after drag.holdMs held still', () => {
    const moved = dragRig(GameSession.start(levelFile(1)));
    const c = moved.centre(A.x, A.y);
    moved.fire('pointerdown', 1, c.x, c.y);
    moved.fire('pointermove', 1, c.x, c.y - TOKENS.drag.startThresholdPx);
    expect(moved.names()[0]).toBe('lifted');

    const held = dragRig(GameSession.start(levelFile(1)));
    held.fire('pointerdown', 1, c.x, c.y);
    held.ctl.update(TOKENS.drag.holdMs - 1);
    expect(held.log).toEqual([]);
    held.ctl.update(TOKENS.drag.holdMs);
    expect(held.names()[0]).toBe('lifted');
  });

  it('K-08 "p = parmak − tutmaOfseti + (0; 1,2)": once the finger-offset glide is over, the follow target is the finger cell + 1.2 rows', () => {
    const rig = dragRig(GameSession.start(levelFile(1)));
    const c = rig.centre(A.x, A.y);
    rig.fire('pointerdown', 1, c.x, c.y); // grabbed cell (0,0) of a, at its centre
    rig.fire('pointermove', 1, c.x, c.y - TOKENS.drag.startThresholdPx);
    rig.clock.now = TOKENS.duration.fingerOffset + 10;
    const to = rig.centre(3, 8);
    rig.fire('pointermove', 1, to.x, to.y);
    const last = rig.log.filter((l) => l[0] === 'moved').at(-1);
    expect(last?.[1]).toBeCloseTo(3, 6);
    expect(last?.[2]).toBeCloseTo(8 + TOKENS.drag.fingerOffsetCells, 6);
  });

  it('K-07 / TECH 4.6 a system-cancelled touch (wasCanceled) mid-drag aborts: no release, nothing committed (fixed: Faz 2 tur 1 #15)', () => {
    const game = GameSession.start(levelFile(1));
    const before = game.state.buf.slice();
    const rig = dragRig(game);
    const c = rig.centre(A.x, A.y);
    rig.fire('pointerdown', 1, c.x, c.y);
    const to = rig.centre(6, 8);
    rig.fire('pointermove', 1, to.x, to.y);
    rig.fire('pointerup', 1, to.x, to.y, true);
    expect(rig.names()).toContain('aborted');
    expect(rig.names()).not.toContain('released');
    expect(rig.ctl.active).toBe(false);
    expect(game.state.buf).toEqual(before);
  });

  it('GDD 14.1/4 a block the tutorial gate refuses gets no reaction (no tap, no shake); TECH 4.6 a second finger is ignored', () => {
    const gated = dragRig(GameSession.start(levelFile(1)), (id) => id !== A.id);
    const c = gated.centre(A.x, A.y);
    gated.fire('pointerdown', 1, c.x, c.y);
    gated.fire('pointermove', 1, c.x, c.y - 200);
    gated.fire('pointerup', 1, c.x, c.y - 200);
    expect(gated.log).toEqual([]);

    const two = dragRig(GameSession.start(levelFile(1)));
    two.fire('pointerdown', 1, c.x, c.y);
    const other = two.centre(5, 7);
    two.fire('pointerdown', 2, other.x, other.y);
    two.fire('pointermove', 2, other.x, other.y - 200);
    two.fire('pointerup', 2, other.x, other.y - 200);
    expect(two.log).toEqual([]);
    two.fire('pointerup', 1, c.x, c.y);
    expect(two.log).toEqual([['tapped', A.id]]);
  });
});

// --- JUICE W1 / K-34 cues ------------------------------------------------------------------------------------------------

describe('review round 2: JUICE #22 / #23 (W1, K-12) and #83 / #84 (K-34 hooks 1 and 3)', () => {
  it('JUICE #23 level 3 f parks on the rail: #23 (clamps, sfx_clamp, light haptic) and no fall cues (#10 / #11); #22 plays sfx_gap_rail + light haptic, the light flow only without reduced motion', () => {
    const game = GameSession.start(levelFile(3));
    play(game, [handMove(3, 0)]);
    const { cues } = commitAndPlan(game, handMove(3, 1));
    expect(kinds(cues)).toContain('23');
    expect(kinds(cues)).not.toContain('10');
    expect(kinds(cues)).not.toContain('11');
    const c23 = cues.find((c) => c.kind === 23);
    if (!c23) throw new Error('#23');
    const rec = recorder();
    const j23 = juiceCue(c23, false);
    if (j23) rec.play(j23);
    expect(rec.calls.filter((c) => c.name === 'sound').map((c) => c.args[0])).toEqual(['sfx_clamp']);
    expect(rec.calls.filter((c) => c.name === 'haptic').map((c) => c.args[0])).toEqual(['light']);
    for (const reduced of [false, true]) {
      const r = recorder();
      r.play({ ...(j23 as JuiceCue), id: 22, n: 0, reduced });
      expect(r.calls.filter((c) => c.name === 'sound').map((c) => c.args[0])).toEqual(['sfx_gap_rail']);
      expect(r.calls.filter((c) => c.name === 'haptic').map((c) => c.args[0])).toEqual(['light']);
      expect(r.calls.find((c) => c.name === 'railGlow')?.args[3]).toBe(!reduced); // "ışık akışı yok"
    }
  });

  it('JUICE #84 / UX 5.5 layer 3: after a K-34 bounce the missing-support cells flash for duration.supportFlash on EVERY difficulty; JUICE #83 the front shifts for duration.frontShift after a correct placement', () => {
    for (const difficulty of ['easy', 'hard'] as const) {
      const game = GameSession.start(
        compiledLevel({
          moves: 9,
          difficulty,
          plan: ['WW', 'WW', 'WW', 'WW'],
          pieces: [
            ['D2_0', 'W', 0, 0],
            ['O4_0', 'W', 2, 0],
          ],
        }),
      );
      const ok = commitAndPlan(game, drag(0, 6, 8)).cues.find((c) => c.kind === 83);
      expect(ok?.ms).toBe(TOKENS.duration.frontShift);
      const { events, cues } = commitAndPlan(game, drag(1, 6, 8));
      const bounce = events.find((e) => e.t === 'pieceBounced');
      expect(bounce && bounce.t === 'pieceBounced' ? bounce.reason : null).toBe('support');
      const flash = cues.find((c) => c.kind === 84);
      expect(flash?.ms).toBe(TOKENS.duration.supportFlash);
      expect(sortedXY(flash?.cells ?? [])).toEqual(['7,0', '7,1']);
    }
  });
});

// --- FTUE and the 1–5 home loop --------------------------------------------------------------------------------------------

describe('review round 2: FTUE route and the minimal home (UX 2.1, 2.2, 6; TECH 14.1 #12)', () => {
  it('UX 2.1 first launch → the 3-panel intro → Level 1: untouched 2.0 + 3 × 1.8 + 0.8 = 8.2 s (≤ 10 s), panel taps finish it in ≤ 3 taps, "Geç" in 1', () => {
    const p = proc();
    const decision = p.save.resumeOnLaunch(() => ({ levelHash: 'x', rulesVersion: RULES_VERSION }));
    expect(launchRoute(p.save.data, decision)).toEqual({ kind: 'intro' });
    expect(ftueUntouchedMs()).toBe(8200);
    const auto = new IntroTimeline();
    auto.start(0);
    auto.update(3 * TOKENS.duration.ftuePanelAuto - 1);
    expect(auto.done).toBe(false);
    auto.update(3 * TOKENS.duration.ftuePanelAuto);
    expect([auto.done, auto.taps]).toEqual([true, 0]);
    const tapped = new IntroTimeline();
    tapped.start(0);
    for (let i = 0; i < 3; i++) tapped.tap(10 * (i + 1));
    expect([tapped.done, tapped.taps]).toEqual([true, 3]);
    const skipped = new IntroTimeline();
    skipped.start(0);
    skipped.skip();
    expect([skipped.done, skipped.taps]).toEqual([true, 1]);
  });

  it('UX 2.2 step 11 / UX 6 "Faz 2 dikey dilimi": after Level 1 "BÖLÜM 2" pulses until Level 2 is tried; after a loss the same level; after Level 5 the moreSoon band and Level 1', () => {
    const p = proc();
    p.save.commit((d) => {
      d.progress.highestLevel = 1;
    });
    expect(homeTarget(p.save.data, { levelId: 1, won: true })).toEqual({
      next: 2,
      moreSoon: false,
      pulse: true,
    });
    expect(homeTarget(p.save.data, { levelId: 2, won: false }).next).toBe(2);
    p.save.commit((d) => {
      d.progress.levels['2'] = { won: false, attempts: 1 };
    });
    expect(homeTarget(p.save.data, null)).toEqual({ next: 2, moreSoon: false, pulse: false });
    p.save.commit((d) => {
      d.progress.highestLevel = 5;
    });
    expect(homeTarget(p.save.data, { levelId: 5, won: true })).toEqual({
      next: 1,
      moreSoon: true,
      pulse: false,
    });
  });
});

// --- K-43 resume: the same attempt ---------------------------------------------------------------------------------------

describe('review round 2: K-43 a killed and resumed attempt is the same attempt (fixed: Faz 2 tur 1 #19 / #21)', () => {
  it('K-43 item 3 / ANALYTICS 2 level_end of a killed + resumed level 1 attempt equals the uninterrupted one (all fields but durationMs); no second level_start', () => {
    const lvl = levelFile(1);
    const moves: Move[] = [drag(1, 6, 8), ...handMoves(1)]; // a K-17 colour bounce, then the hand solution
    const strip = (e: AnalyticsEventOf<'level_end'>) => ({ ...e, durationMs: 0 });

    const one = proc();
    const a = LevelAttempt.begin(one.deps, lvl, { preBoosters: [], streakTier: 0 });
    const g = GameSession.start(lvl);
    for (const m of moves) scenePlay(a, g, m, lvl);
    expect(g.outcome).toBe('won');

    const store = new MemoryStore();
    const first = proc(store);
    const b = LevelAttempt.begin(first.deps, lvl, { preBoosters: [], streakTier: 0 });
    const h = GameSession.start(lvl);
    for (const m of moves.slice(0, 2)) scenePlay(b, h, m, lvl);
    const again = proc(store, 1_500_000);
    const decision = again.save.resumeOnLaunch(identity(lvl));
    if (decision.kind !== 'resume') throw new Error(decision.kind);
    const replayed = new ArraySink();
    const r = GameSession.replay(lvl, decision.inLevel.actions as SessionAction[], {}, replayed);
    const inLevel = again.save.data.inLevel;
    if (!inLevel) throw new Error('no inLevel');
    const c = LevelAttempt.resumed(again.deps, inLevel, replayed.events);
    for (const m of moves.slice(2)) scenePlay(c, r, m, lvl);
    expect(r.outcome).toBe('won');

    expect(strip(levelEnd(again.events))).toEqual(strip(levelEnd(one.events)));
    expect(again.events.filter((e) => e.name === 'level_start')).toEqual([]);
    expect([...first.events, ...again.events].filter((e) => e.name === 'level_start')).toHaveLength(1);
  });

  it.fails(
    'FINDING ANALYTICS level_end.wrongPlacements counts one K-17 wrong placement of a mortar block (Y8 stick: placementWrong + mortarStuck) twice',
    () => {
      const p = proc();
      const lvl = compiledLevel({
        moves: 9,
        plan: ['WW', 'YY'],
        pieces: [['B1_0', 'W', 0, 0, ['mortar']]],
      });
      const stick = { placement: { onPlacement: () => ({ kind: 'stick' as const }) } };
      const a = LevelAttempt.begin(p.deps, lvl, { preBoosters: [], streakTier: 0 });
      const game = GameSession.start(lvl, {}, { hooks: stick });
      const ev = scenePlay(a, game, drag(0, 6, 8), lvl); // W onto the Y row 0 → wrong, sticks (K-17 "iniş yerinde yapışır")
      expect(ev.filter((e) => e.t === 'placementWrong')).toHaveLength(1);
      expect(ev.filter((e) => e.t === 'mortarStuck')).toHaveLength(1);
      expect(hdr(game.state, H.wrongCount)).toBe(1); // the core counts one wrong placement
      game.exit();
      a.loss(game, 'quit');
      expect(levelEnd(p.events).wrongPlacements).toBe(1);
    },
  );
});

// --- the rule-coverage gate is a gate --------------------------------------------------------------------------------------

describe('review round 2: TECH 12.2 test:rules really fails on a phase whose rules have no tests', () => {
  it(
    'TECH 12.2 `rule-coverage --phase 3` exits 1 and names the missing ids (Phase 3 rules have no tests yet)',
    { timeout: 60_000 },
    () => {
      const root = fileURLToPath(new URL('../../', import.meta.url));
      const r = spawnSync(process.execPath, [join(root, 'tools', 'rule-coverage.ts'), '--phase', '3'], {
        cwd: root,
        encoding: 'utf8',
      });
      expect(r.status).toBe(1);
      expect(`${r.stdout}${r.stderr}`).toMatch(/without a test name: (K|E|N|[WYSG])-?\d/);
    },
  );
});
