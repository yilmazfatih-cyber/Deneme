/**
 * The move pipeline (docs/GDD.md §12 K-35; K-07, K-17, K-22, K-25, K-26, K-28, K-29, K-33, K-41, K-46; TECH_DESIGN §6).
 *
 * `applyMove(state, move, sink, opts)` runs ONE move on `state` (mutating it) and writes its deterministic event log to
 * `sink`. A drag that is not cancelled runs every K-35 step once, in GDD order:
 *   0 classify the release (K-07 table; a cancel stops here and changes nothing) · 1 move the block (W6 paint hook) ·
 *   2 site FREE: wind → fall / balloon → G-L steer → landing (`computeFall`), S3 glass break returns the block and skips
 *   step 3 · 3 site: `isCorrectPlacement` (K-16 + K-34) → lock / Y8 stick / K-17 bounce, streak · 4 cost (base + glass,
 *   counter ≥ 0), `m += 1` · 5 neighbour effects of the start cells (once per entity, (y, x) order, never across the
 *   wall boundary) + hidden item check #1 · 6 yard gravity (`settleYard`) + check #2 · 7 goal counters · 8 segment
 *   completion (site strategy) + next batch queued · 9 FIFO delivery · 10 timers (`lvl.step10` order) · 11 win, else
 *   out of moves · 12 deadlock check / truck help (K-30 hook, Phase 3; skipped by `noTruckHelp`).
 * Boosters run the mini pipeline (GDD §10): the direct effect as step 1, then steps 5 (hidden items only), 6, 7, 8, 9,
 * 11, 12. Phase 2 implements the Golden Trowel (K-33); hammer, crane and paint brush (K-36…K-38) are Phase 3.
 * `addMoves` from an accepted +5 offer sets no timer and no streak and runs step 12 once (K-29, E-42).
 *
 * Obstacles: core has no obstacle-specific `if`. Every rule effect comes through `MoveHooks`; by default the level's
 * hooks from the obstacle registry (core/obstacles/registry.ts `levelHooks`, TECH §7). Phase 2 has W1 (core rail
 * model), S1 (core/site.ts segments) and S2 (core `.` validation) only, so a Phase 2 level gets empty hooks. Step 10
 * calls one timer hook per `lvl.step10` entry (rule `onMoveEnd`, site S5 / S6 ticks); a timer without a hook throws
 * "Phase 3".
 *
 * Events: `EvBase.step` = the K-35 step, `seq` = 0, 1, 2 … inside the move. The log is a pure function of (state, move);
 * `eventLogHash` (FNV-1a 64 over canonical JSON) pins it in golden tests (TECH §6.3, §9.5).
 */
import { Zone } from './types.ts';
import type { Anchor, At, DragNode, GameEvent, GameEventBody, Move, PieceId, Steer } from './types.ts';
import { BOARD_ROWS, YARD_COLS, neighbors4 } from './coords.ts';
import {
  FLAG_BIT,
  H,
  STATE_FLAG,
  goalValue,
  hdr,
  hiddenCollected,
  pieceFlags,
  pieceZone,
  setHdr,
  yardOcc,
} from './state.ts';
import type { GameState } from './state.ts';
import type { CompiledLevel, GravityProfile, TimerId } from './level/compile.ts';
import { bufferRng } from './rng.ts';
import type { Rng } from './rng.ts';
import { pieceBoardCells, visibleSegment } from './grid.ts';
import type { BoardCell } from './grid.ts';
import { railMode, tryBeginDrag } from './movement.ts';
import type { DragRules, DragSession, DropClass } from './movement.ts';
import { computeFall, settleYard } from './gravity.ts';
import type { FallResult, FallRules } from './gravity.ts';
import {
  movePiece,
  piecePlace,
  placeAt,
  returnBrokenPiece,
  settlePlacement,
  yardPlace,
} from './placement.ts';
import type { PiecePlace, PlacementRules, ReturnTarget } from './placement.ts';
import { applyTrowel, comboOnCorrect, comboReset, trowelRejection } from './combo.ts';
import {
  changedCountGoals,
  countDebrisLeftSite,
  goalSnapshot,
  goalTarget,
  levelGoalsMet,
  setBuildProgress,
} from './goals.ts';
import { deliverQueue } from './delivery.ts';
import { siteStrategy } from './site.ts';
import { levelHooks } from './obstacles/registry.ts';

// --- event sinks -------------------------------------------------------------------------------------------------------

/** Receiver of the move's events (TECH §6.3): the game uses `ArraySink`, solver and bots `NULL_SINK`. */
export interface EventSink {
  /** `false` = events are not built at all (no allocation). Default true. */
  readonly enabled?: boolean;
  push(e: GameEvent): void;
}

export const NULL_SINK: EventSink = Object.freeze({ enabled: false, push: (): void => undefined });

/** Collects events in order. */
export class ArraySink implements EventSink {
  readonly events: GameEvent[] = [];
  push(e: GameEvent): void {
    this.events.push(e);
  }
  clear(): void {
    this.events.length = 0;
  }
}

/** Numbers the events of one move: `seq` 0, 1, 2 …, `step` = the current K-35 step. */
class Emitter {
  step = 0;
  private seq = 0;
  private readonly on: boolean;
  private readonly sink: EventSink;
  constructor(sink: EventSink) {
    this.sink = sink;
    this.on = sink.enabled !== false;
  }
  emit(body: GameEventBody): void {
    if (!this.on) return;
    this.sink.push({ seq: this.seq++, step: this.step, ...body });
  }
}

// --- rule hooks --------------------------------------------------------------------------------------------------------

/** Per-move scratch data (TECH §5.2 `MoveScratch`, §7.1): never stored in the state buffer nor hashed. */
export interface MoveScratch {
  /** Y8: the moved block was stuck at move start (written in step 0; the base cost reads it, step 4). */
  readonly wasStuck: boolean;
  /** S5: the front segment turned in this move's step 8 (the step-10 counter then does not tick, K-23). */
  rotatedAtStep8: boolean;
  /** Occupancy codes (`pieceId + 1`, `−(obstacle + 1)`) of entities already hit by a neighbour effect in this move. */
  readonly affected: Set<number>;
}

/** What a rule hook sees (TECH §7.1 `RuleContext`). `emit` writes at the current pipeline step. */
export interface RuleContext {
  readonly lvl: CompiledLevel;
  readonly s: GameState;
  emit(e: GameEventBody): void;
  /** The state's mulberry32 (deterministic, K-30 truck help). */
  readonly rng: Rng;
  readonly gravity: GravityProfile;
  readonly scratch: MoveScratch;
}

/** A yard neighbour of a moved block (TECH §7.1 `EntityRef`). */
export type EntityRef =
  { readonly kind: 'obstacle'; readonly index: number } | { readonly kind: 'piece'; readonly id: PieceId };

/**
 * Result of `onNeighborMoved`: `none` (not affected), `affected` (counted once for this move) or `freed` (affected and
 * a yard cell became empty — bag torn, crate gone — so yard gravity runs again, E-12).
 */
export type NeighborEffect = 'none' | 'affected' | 'freed';

/** Step-10 timer ids (`STEP10_TIMERS`): rule `onMoveEnd` (W4, W5, Y4), site ticks (S5, S6), K-40 expiry. */
export type TimerHookId = TimerId;

/**
 * Obstacle hooks of the pipeline (TECH §7.1 `ObstacleRule`, composed in rule order by core/obstacles/registry.ts
 * `levelHooks`). Every field is optional; Phase 2 levels (W1, S1, S2) need none.
 */
export interface MoveHooks {
  /** K-09 (c) `canPick`, RAIL `canPassGap` (W4, W7, K-40), K-07 row 5 `siteClosed`. */
  readonly drag?: DragRules;
  /** Step 2 `modifyFall` (W8, S8) and `onLanded` (S3). */
  readonly fall?: FallRules;
  /** Step 3 `onPlacement` (Y8 stick). */
  readonly placement?: PlacementRules;
  /** Step 1: the drag passed the rail of paint gate `gap` (`move.via`, W6). */
  readonly onPassGap?: (ctx: RuleContext, gap: number, pieceId: PieceId) => void;
  /** Step 2: a block released in the yard (S8 balloon rises). */
  readonly onYardRelease?: (ctx: RuleContext, pieceId: PieceId) => void;
  /** Step 4 base cost (Y8: 2 when `ctx.scratch.wasStuck`); undefined = 1. The glass penalty is added on top. */
  readonly moveCost?: (ctx: RuleContext, pieceId: PieceId) => number | undefined;
  /** Steps 5–6: a yard entity next to the moved / fallen block (Y1 crate, Y2 bag, Y3 chain). */
  readonly onNeighborMoved?: (ctx: RuleContext, entity: EntityRef, movedPieceId: PieceId) => NeighborEffect;
  /** Steps 5–6: the cell of hidden item `obstacle` (screw Y7, key W7) is empty and not collected yet (K-42). */
  readonly onCellUncovered?: (ctx: RuleContext, obstacle: number) => void;
  /** Step 10 timers (rule `onMoveEnd`, site S5 / S6 ticks), called in `lvl.step10` order (§7.3). */
  readonly timers?: Readonly<Partial<Record<TimerHookId, (ctx: RuleContext) => void>>>;
  /** Step 12: K-30 deadlock check and truck help (core/deadlock.ts, Phase 3). */
  readonly deadlock?: (ctx: RuleContext) => void;
}

/** No rule at all (tests, tools that want the bare core). `applyMove` defaults to the level's registry hooks. */
export const NO_HOOKS: MoveHooks = Object.freeze({});

// --- results -----------------------------------------------------------------------------------------------------------

export type MoveStatus = 'applied' | 'cancelled' | 'rejected';

export interface MoveResult {
  /** `cancelled`: K-07 cancel row or an invalid record (state unchanged); `rejected`: booster precondition (unchanged). */
  readonly status: MoveStatus;
  /** Cancel reason (`moveCancelled.reason`) or rejection reason; null when applied. */
  readonly reason: string | null;
  /** K-28: won in this move's step 11. */
  readonly won: boolean;
  /** K-29: step 11 found the counter at 0 without a win ("Hamleler bitti!" window). */
  readonly outOfMoves: boolean;
}

export interface ApplyOptions {
  /** Rule hooks; default `levelHooks(state.lvl)` (the obstacle registry, TECH §7.1). */
  readonly hooks?: MoveHooks;
  /** Skip K-35 step 12 (solver, trap scan, bot planning, K-30 guarantee simulation; TECH §6.1). Never in GameSession. */
  readonly noTruckHelp?: boolean;
  /** Throw on an invalid move record instead of emitting `moveCancelled{reason: 'invalid'}` (development, tests). */
  readonly strict?: boolean;
}

const APPLIED: MoveResult = Object.freeze({ status: 'applied', reason: null, won: false, outOfMoves: false });

// --- applyMove ---------------------------------------------------------------------------------------------------------

/** `applyMove(state, move, sink, opts)` (TECH §6.1): runs one move; see the module comment. */
export function applyMove(
  s: GameState,
  move: Move,
  sink: EventSink = NULL_SINK,
  opts: ApplyOptions = {},
): MoveResult {
  const em = new Emitter(sink);
  const hooks = opts.hooks ?? levelHooks(s.lvl);
  switch (move.kind) {
    case 'drag':
      return dragMove(s, move, em, hooks, opts);
    case 'trowel':
      return trowelMove(s, move, em, hooks, opts);
    case 'addMoves':
      return addMovesMove(s, move, em, hooks, opts);
    default:
      throw new Error(`Phase 3: the ${move.kind} booster (GDD K-36…K-38) is not implemented yet`);
  }
}

/** K-28: the level is won (state flag). */
export function isLevelWon(s: GameState): boolean {
  return (hdr(s, H.flags) & STATE_FLAG.won) !== 0;
}

type DragMove = Extract<Move, { kind: 'drag' }>;

function dragMove(
  s: GameState,
  move: DragMove,
  em: Emitter,
  hooks: MoveHooks,
  opts: ApplyOptions,
): MoveResult {
  const { pieceId: id, to } = move;
  // --- step 0: release classification (K-07); an invalid record is a cancel too (TECH §6.1)
  em.step = 0;
  if (isLevelWon(s)) return invalid(em, id, opts, 'the level is already won');
  const attempt = tryBeginDrag(s, id, hooks.drag);
  if (!attempt.ok) return invalid(em, id, opts, `piece ${id} cannot be picked (${attempt.reason})`);
  const drag = attempt.session;
  const drop = drag.classify(to);
  if (drop.kind === 'cancel') {
    if (drop.reason === 'invalid')
      return invalid(em, id, opts, `node (${to.ix},${to.iy},${to.mode}) is not reachable`);
    em.emit({ t: 'moveCancelled', pieceId: id, reason: drop.reason });
    return { status: 'cancelled', reason: drop.reason, won: false, outOfMoves: false };
  }
  if (move.via !== undefined && !viaValid(s, drag, move.via))
    return invalid(em, id, opts, `via ${move.via} is not a paint gate on the drag's reach`);
  if (move.steer !== undefined && !steerValid(s, drag, drop, move.steer))
    return invalid(em, id, opts, 'steer needs light gravity, a 1-wide block and a FREE site release');

  const start = piecePlace(s, id);
  const startZone = pieceZone(s, id);
  const startCells = pieceBoardCells(s, id);
  const scratch: MoveScratch = {
    wasStuck: (pieceFlags(s, id) & FLAG_BIT.stuck) !== 0,
    rotatedAtStep8: false,
    affected: new Set(),
  };
  const ctx = makeContext(s, em, scratch);
  const goalsBefore = goalSnapshot(s);
  const queueBefore = hdr(s, H.queueLen);

  // --- step 1: the block goes to the release node (site blocks move once, in step 2/3)
  em.step = 1;
  const seg = visibleSegment(s);
  const onSite = drop.kind !== 'yard';
  em.emit({
    t: 'pieceMoved',
    pieceId: id,
    from: placeAt(s, start) ?? { zone: 'yard', x: start.x, y: start.y },
    to: onSite ? siteAt(to, seg) : yardAt(to),
    entry: drop.kind === 'yard' ? 'yard' : drop.kind === 'siteFree' ? 'overWall' : 'gap',
    ...(drop.kind === 'siteRail' ? { gap: drop.gap } : {}),
  });
  if (!onSite) movePiece(s, id, yardPlace(to));
  if (move.via !== undefined) hooks.onPassGap?.(ctx, move.via, id);

  // --- step 2: fall / balloon / steer on the site (K-11, K-19), S3 glass break; S8 in the yard
  em.step = 2;
  let glass = 0;
  let landed: FallResult | null = null;
  if (onSite) {
    const fall = computeFall(s, id, to, { steer: move.steer, rules: hooks.fall });
    const landingAt = siteAt(fall.landing, seg);
    if (fall.mode === 'free') {
      if (fall.drift !== 0) em.emit({ t: 'windDrift', pieceId: id, dx: fall.drift });
      if (fall.dir < 0)
        em.emit({
          t: 'pieceFell',
          pieceId: id,
          from: siteAt(to, seg),
          to: landingAt,
          rows: fall.distance,
          cause: 'release',
        });
      else
        em.emit({ t: 'balloonRose', pieceId: id, from: siteAt(to, seg), to: landingAt, rows: fall.distance });
      if (fall.steered)
        em.emit({ t: 'steered', pieceId: id, atRow: fall.steered.atRow, dx: fall.steered.dir });
    }
    if (fall.effect.kind === 'break') {
      glass = fall.effect.penalty;
      em.emit({ t: 'glassBroke', pieceId: id, at: landingAt, penalty: glass });
      const target = returnBrokenPiece(s, id, start);
      em.emit({ t: 'pieceReturned', pieceId: id, from: landingAt, to: targetAt(s, target) });
      if (comboReset(s)) em.emit({ t: 'comboChanged', combo: 0 });
    } else {
      landed = fall;
    }
  } else {
    hooks.onYardRelease?.(ctx, id);
  }

  // --- step 3: validation on the site (K-16, K-34), lock / stick / bounce (K-14, K-17, Y8), streak (K-33)
  em.step = 3;
  if (landed) placementStep(s, em, hooks, id, landed, start, seg);

  // --- step 4: cost (K-07: base + glass penalty, never below 0), m += 1
  em.step = 4;
  const rawBase = hooks.moveCost?.(ctx, id);
  const base = rawBase === undefined ? 1 : rawBase;
  const left = hdr(s, H.movesLeft);
  const delta = -Math.min(left, base + glass);
  setHdr(s, H.movesLeft, left + delta);
  setHdr(s, H.turn, hdr(s, H.turn) + 1);
  em.emit({
    t: 'movesChanged',
    movesLeft: left + delta,
    delta,
    reason: 'move',
    cost: { base: base >= 2 ? 2 : 1, glass: glass > 0 ? 1 : 0 },
  });

  // --- step 5: neighbour effects of the START cells + hidden item check #1 (K-42)
  em.step = 5;
  if (startZone === Zone.yard) neighbourEffects(ctx, hooks, startCells, id);
  uncoverCheck(ctx, hooks);

  // --- steps 6–12
  yardGravityStep(ctx, hooks);
  em.step = 7;
  countDebrisLeftSite(s, id, startZone);
  emitGoalChanges(s, em, goalsBefore);
  segmentStep(s, em);
  deliveryStep(s, em, queueBefore);
  em.step = 10;
  runTimers(ctx, hooks);
  return endOfMove(ctx, hooks, opts);
}

/** K-35 step 3 for a block that landed on the site (fall or rail). */
function placementStep(
  s: GameState,
  em: Emitter,
  hooks: MoveHooks,
  id: PieceId,
  landed: FallResult,
  start: PiecePlace,
  seg: number,
): void {
  const landingAt = siteAt(landed.landing, seg);
  const { verdict } = landed;
  const out = settlePlacement(s, id, landed.landing, verdict, { start, rules: hooks.placement });
  if (out.kind === 'correct') {
    const overWall = landed.mode === 'free';
    em.emit({ t: 'placementCorrect', pieceId: id, cells: out.cells, overWall });
    if (out.revealed.length > 0) em.emit({ t: 'cellsRevealed', seg: out.at.seg, cells: out.revealed });
    // K-46 counters: FREE entries (balloon and G-L included) are "over the wall", rail placements "through a gap"
    const counter = overWall ? H.overWallCount : H.railCount;
    setHdr(s, counter, hdr(s, counter) + 1);
    const step = comboOnCorrect(s);
    em.emit({ t: 'comboChanged', combo: step.reached });
    if (step.earned) {
      em.emit({ t: 'trowelEarned', trowels: step.trowels });
      em.emit({ t: 'comboChanged', combo: step.combo });
    }
    return;
  }
  setHdr(s, H.wrongCount, hdr(s, H.wrongCount) + 1);
  em.emit({
    t: 'placementWrong',
    pieceId: id,
    reasons: verdict.reasons,
    missingSupport: verdict.missingSupport,
  });
  if (out.kind === 'stuck') {
    em.emit({ t: 'mortarStuck', pieceId: id, reason: out.reason, missingSupport: out.missingSupport });
  } else {
    em.emit({
      t: 'pieceBounced',
      pieceId: id,
      from: landingAt,
      to: targetAt(s, out.target),
      viaDrop: out.target.step === 2,
      reason: out.reason,
      missingSupport: out.missingSupport,
    });
  }
  if (comboReset(s)) em.emit({ t: 'comboChanged', combo: 0 });
}

// --- Golden Trowel (K-33) and +moves ----------------------------------------------------------------------------------

type TrowelMove = Extract<Move, { kind: 'trowel' }>;

/** K-33 trowel use + mini pipeline (GDD §10: steps 5 (hidden items), 6, 7, 8, 9, 11, 12; no cost, no timers). */
function trowelMove(
  s: GameState,
  move: TrowelMove,
  em: Emitter,
  hooks: MoveHooks,
  opts: ApplyOptions,
): MoveResult {
  em.step = 0;
  const target = { seg: move.seg, x: move.x, y: move.y };
  const refused = trowelRejection(s, target);
  if (refused !== null) {
    em.emit({ t: 'boosterRejected', booster: 'trowel', reason: refused });
    return { status: 'rejected', reason: refused, won: false, outOfMoves: false };
  }
  const ctx = makeContext(s, em, { wasStuck: false, rotatedAtStep8: false, affected: new Set() });
  const goalsBefore = goalSnapshot(s);
  const queueBefore = hdr(s, H.queueLen);
  em.step = 1;
  const fill = applyTrowel(s, target);
  em.emit({
    t: 'boosterApplied',
    booster: 'trowel',
    detail: { cell: fill.cell, color: fill.color, trowels: fill.trowels },
  });
  if (fill.revealed)
    em.emit({
      t: 'cellsRevealed',
      seg: move.seg,
      cells: [{ x: fill.cell.x, y: fill.cell.y, color: fill.color }],
    });
  em.step = 5;
  uncoverCheck(ctx, hooks);
  yardGravityStep(ctx, hooks);
  em.step = 7;
  emitGoalChanges(s, em, goalsBefore);
  segmentStep(s, em);
  deliveryStep(s, em, queueBefore);
  return endOfMove(ctx, hooks, opts);
}

type AddMovesMove = Extract<Move, { kind: 'addMoves' }>;

/**
 * `addMoves` (TECH §6.1): an accepted +5 offer (`offerCoins` / `offerAd`, K-29) adds the moves and runs step 12 once
 * (E-42); `thermos` / `streak` are level-start bonuses (K-40) without step 12. `turn`, timers and the streak never
 * change.
 */
function addMovesMove(
  s: GameState,
  move: AddMovesMove,
  em: Emitter,
  hooks: MoveHooks,
  opts: ApplyOptions,
): MoveResult {
  em.step = 0;
  if (isLevelWon(s) || !Number.isInteger(move.amount) || move.amount <= 0) {
    if (opts.strict) throw new Error(`applyMove: invalid addMoves (${move.amount}, won ${isLevelWon(s)})`);
    return { status: 'rejected', reason: 'invalid', won: false, outOfMoves: false };
  }
  const offer = move.source === 'offerCoins' || move.source === 'offerAd';
  em.step = 1;
  const movesLeft = hdr(s, H.movesLeft) + move.amount;
  setHdr(s, H.movesLeft, movesLeft);
  em.emit({ t: 'movesChanged', movesLeft, delta: move.amount, reason: offer ? 'offer' : 'booster' });
  if (offer && !opts.noTruckHelp && hooks.deadlock) {
    em.step = 12;
    hooks.deadlock(makeContext(s, em, { wasStuck: false, rotatedAtStep8: false, affected: new Set() }));
  }
  return APPLIED;
}

// --- shared steps ------------------------------------------------------------------------------------------------------

/** The pipeline's own view of the context: the hooks see it as a `RuleContext`. */
interface PipelineContext extends RuleContext {
  readonly em: Emitter;
}

function makeContext(s: GameState, em: Emitter, scratch: MoveScratch): PipelineContext {
  return {
    lvl: s.lvl,
    s,
    em,
    emit: (e: GameEventBody) => em.emit(e),
    rng: bufferRng(s.buf, H.rng),
    gravity: s.lvl.gravity,
    scratch,
  };
}

/** K-35 step 6: yard gravity loop (bags always, Y6 blocks and balloons) + hidden item check #2. */
function yardGravityStep(ctx: PipelineContext, hooks: MoveHooks): void {
  const { s, em } = ctx;
  em.step = 6;
  const onNeighborMoved = hooks.onNeighborMoved;
  const motions = settleYard(s, {
    onFallen: onNeighborMoved
      ? (_s, fallen) => {
          let freed = false;
          for (const f of fallen) if (neighbourEffects(ctx, hooks, f.cells, f.pieceId)) freed = true;
          return freed;
        }
      : undefined,
  });
  for (const m of motions) {
    if (m.kind !== 'piece') continue; // a falling bag has no event of its own yet (Phase 3, Y2)
    const from = yardAt(m.from);
    const to = yardAt(m.to);
    if (m.dy < 0) em.emit({ t: 'pieceFell', pieceId: m.id, from, to, rows: -m.dy, cause: 'yardGravity' });
    else em.emit({ t: 'balloonRose', pieceId: m.id, from, to, rows: m.dy });
  }
  uncoverCheck(ctx, hooks);
}

/**
 * K-35 step 5 rule (also used for the falls of step 6): every yard entity next to `cells` (4-neighbourhood inside the
 * yard, never across the wall boundary — `neighbors4`, E-46), in (y, x) order of the neighbour cells, at most once per
 * move. Returns true when a yard cell was freed (bag torn, crate gone: gravity runs again, E-12).
 */
function neighbourEffects(
  ctx: RuleContext,
  hooks: MoveHooks,
  cells: readonly BoardCell[],
  moved: PieceId,
): boolean {
  const hook = hooks.onNeighborMoved;
  if (!hook) return false;
  const around: BoardCell[] = [];
  for (const c of cells) {
    if (c.x >= YARD_COLS || c.y >= BOARD_ROWS) continue;
    for (const n of neighbors4(c.x, c.y)) around.push({ x: n.ix, y: n.iy });
  }
  around.sort((a, b) => a.y - b.y || a.x - b.x);
  let freed = false;
  for (const n of around) {
    const v = yardOcc(ctx.s, n.x, n.y);
    if (v === 0 || v === moved + 1 || ctx.scratch.affected.has(v)) continue;
    const entity: EntityRef = v > 0 ? { kind: 'piece', id: v - 1 } : { kind: 'obstacle', index: -v - 1 };
    const effect = hook(ctx, entity, moved);
    if (effect !== 'none') ctx.scratch.affected.add(v);
    if (effect === 'freed') freed = true;
  }
  return freed;
}

/** Hidden item checks #1 / #2 (K-42): every uncollected screw / key whose yard cell is empty, in (y, x) order. */
function uncoverCheck(ctx: RuleContext, hooks: MoveHooks): void {
  const hook = hooks.onCellUncovered;
  if (!hook) return;
  const items = ctx.lvl.hiddenItems
    .map((i) => ctx.lvl.obstacles[i])
    .filter((o) => o !== undefined && (o.type === 'screw' || o.type === 'key'))
    .sort((a, b) => (a?.y ?? 0) - (b?.y ?? 0) || (a?.x ?? 0) - (b?.x ?? 0));
  for (const o of items) {
    if (!o || (o.type !== 'screw' && o.type !== 'key')) continue;
    if (!hiddenCollected(ctx.s, o.hiddenIndex) && yardOcc(ctx.s, o.x, o.y) === 0) hook(ctx, o.index);
  }
}

/** K-35 step 7: `goalProgress` for the clear / collect goals that changed in this move. */
function emitGoalChanges(s: GameState, em: Emitter, before: readonly number[]): void {
  for (const i of changedCountGoals(s, before))
    em.emit({ t: 'goalProgress', goal: i, value: goalValue(s, i), target: goalTarget(s.lvl, i) });
}

/** K-35 step 8 (K-22): segment completion through the site strategy; the next batch joins the queue (K-25). */
function segmentStep(s: GameState, em: Emitter): void {
  em.step = 8;
  const done = siteStrategy(s.lvl).completeIfDone(s);
  if (!done) return;
  em.emit({ t: 'segmentCompleted', seg: done.seg });
  for (const i of setBuildProgress(s, done.completed))
    em.emit({ t: 'goalProgress', goal: i, value: goalValue(s, i), target: goalTarget(s.lvl, i) });
  if (done.shiftedTo !== null) em.emit({ t: 'siteShifted', toSeg: done.shiftedTo });
}

/** K-35 step 9 (K-25, K-26): the single delivery point; "Kamyonda: N" when N changed during the move. */
function deliveryStep(s: GameState, em: Emitter, queueBefore: number): void {
  em.step = 9;
  const res = deliverQueue(s);
  if (res.delivered.length > 0) {
    em.emit({ t: 'deliveryArrived', seg: visibleSegment(s), pieces: res.delivered.map((d) => d.pieceId) });
    for (const d of res.delivered)
      em.emit({
        t: 'pieceFell',
        pieceId: d.pieceId,
        from: yardAt(d.from),
        to: yardAt(d.to),
        rows: d.rows,
        cause: 'delivery',
      });
  }
  if (res.queued !== queueBefore) em.emit({ t: 'deliveryQueued', queued: res.queued });
}

/**
 * K-35 step 10: one timer hook per `lvl.step10` entry, in that order (W4 → W5 → S5 → S6 → Y4 → K-40, TECH §7.3). The
 * registry binds rule `onMoveEnd` hooks and the site strategy's S5 / S6 ticks (K-23 skip included).
 */
function runTimers(ctx: RuleContext, hooks: MoveHooks): void {
  for (const t of ctx.lvl.step10) {
    const run = hooks.timers?.[t.id];
    if (!run) throw new Error(`Phase 3: step-10 timer ${t.id} has no rule hook yet (TECH_DESIGN §7.3)`);
    run(ctx);
  }
}

/** K-35 steps 11–12: win (K-28) before out of moves (K-29), then the deadlock hook while the level goes on. */
function endOfMove(ctx: PipelineContext, hooks: MoveHooks, opts: ApplyOptions): MoveResult {
  const { s, em } = ctx;
  em.step = 11;
  const movesLeft = hdr(s, H.movesLeft);
  if (levelGoalsMet(s)) {
    setHdr(s, H.flags, hdr(s, H.flags) | STATE_FLAG.won);
    em.emit({ t: 'levelWon', movesLeft });
    return { status: 'applied', reason: null, won: true, outOfMoves: false };
  }
  if (movesLeft <= 0) {
    em.emit({ t: 'outOfMoves' });
    return { status: 'applied', reason: null, won: false, outOfMoves: true };
  }
  em.step = 12;
  if (!opts.noTruckHelp) hooks.deadlock?.(ctx);
  return APPLIED;
}

function invalid(em: Emitter, pieceId: PieceId, opts: ApplyOptions, why: string): MoveResult {
  if (opts.strict) throw new Error(`applyMove: invalid drag of piece ${pieceId}: ${why}`);
  em.emit({ t: 'moveCancelled', pieceId, reason: 'invalid' });
  return { status: 'cancelled', reason: 'invalid', won: false, outOfMoves: false };
}

/** W6 `via`: a paint gate whose rail lies on the drag's reach (every reachable node is on some path, edges are 2-way). */
function viaValid(s: GameState, drag: DragSession, via: number): boolean {
  const gap = s.lvl.gaps[via];
  if (!gap || gap.type !== 'paint') return false;
  const mode = railMode(via);
  return drag.reachableNodes().some((n) => n.mode === mode);
}

/** K-19 `steer`: only on light gravity (G-L), for a 1-wide block released FREE over the site. */
function steerValid(s: GameState, drag: DragSession, drop: DropClass, steer: Steer): boolean {
  return (
    s.lvl.gravity.steerable &&
    drop.kind === 'siteFree' &&
    drag.shape.w === 1 &&
    (steer.dir === 1 || steer.dir === -1) &&
    Number.isInteger(steer.atRow)
  );
}

function siteAt(a: Anchor | DragNode, seg: number): At {
  return { zone: 'site', x: a.ix, y: a.iy, seg };
}

function yardAt(a: Anchor | DragNode): At {
  return { zone: 'yard', x: a.ix, y: a.iy };
}

function targetAt(s: GameState, target: ReturnTarget): At | 'queue' {
  return placeAt(s, target.to) ?? 'queue';
}

// --- K-46 YAO -----------------------------------------------------------------------------------------------------------

export interface YaoMeasure {
  /** Correct drag placements that entered the site FREE (over the wall; balloon and G-L steering included). */
  readonly overWall: number;
  /** Correct rail placements (through a gap). */
  readonly rail: number;
  /** overWall / (overWall + rail); null before the first correct drag placement. */
  readonly yao: number | null;
}

/** K-46: the player's YAO so far (trowel, crane and truck help never count; `level_end` analytics). */
export function measureYao(s: GameState): YaoMeasure {
  const overWall = hdr(s, H.overWallCount);
  const rail = hdr(s, H.railCount);
  const total = overWall + rail;
  return { overWall, rail, yao: total === 0 ? null : overWall / total };
}

// --- canonical JSON and FNV-1a (event log hash, level hash) ---------------------------------------------------------------

/** JSON with object keys sorted (recursively) and undefined fields dropped: one text per value. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === 'object') {
    const rec = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(rec).sort()) {
      const x = rec[k];
      if (x !== undefined) out[k] = sortKeys(x);
    }
    return out;
  }
  return v;
}

const FNV64_OFFSET = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const MASK64 = 0xffffffffffffffffn;

/** FNV-1a 64 over the UTF-8 bytes of `text`, as 16 lowercase hex digits. */
export function fnv1a64(text: string): string {
  let h = FNV64_OFFSET;
  const byte = (b: number): void => {
    h = ((h ^ BigInt(b)) * FNV64_PRIME) & MASK64;
  };
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x80) byte(cp);
    else if (cp < 0x800) {
      byte(0xc0 | (cp >> 6));
      byte(0x80 | (cp & 63));
    } else if (cp < 0x10000) {
      byte(0xe0 | (cp >> 12));
      byte(0x80 | ((cp >> 6) & 63));
      byte(0x80 | (cp & 63));
    } else {
      byte(0xf0 | (cp >> 18));
      byte(0x80 | ((cp >> 12) & 63));
      byte(0x80 | ((cp >> 6) & 63));
      byte(0x80 | (cp & 63));
    }
  }
  return h.toString(16).padStart(16, '0');
}

/** `eventLogHash` (TECH §6.3): FNV-1a 64 of the canonical JSON of the events (golden tests, §9.5). */
export function eventLogHash(events: readonly GameEvent[]): string {
  return fnv1a64(canonicalJson(events));
}
