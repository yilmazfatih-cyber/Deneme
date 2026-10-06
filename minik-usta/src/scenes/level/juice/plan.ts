/**
 * Move → cue schedule (docs/TECH_DESIGN.md §6.3 "Sahne tarafı"; JUICE §0 rule 10 "Oynatma sırası = K-35 adımı").
 * Pure: the core already decided everything (TECH §1.4); this only turns one move's `GameEvent` log into timed cues.
 *
 * Order (JUICE §0 rule 10): steps 1–4 one after the other — release (#9 yard drop / #23 rail park), fall (#10) and
 * landing (#11), validation (#12 correct + #83 build front / #13 wrong → bounce, #88 to the truck queue, #84 missing
 * support; #15–16 streak with it), counter (#50, #51) —; step 6 yard cascade staggered by
 * `physics.yardCascadeStaggerMs`; step 8 segment slide (#18) then step 9 truck delivery (#19) and queue chip (#20),
 * both LOCKED; level end (#55 win + #56 bonus, #57 out of moves) last and locked. A final `end` cue re-syncs the board
 * with the state. Trowel use (#17) and an accepted +5 offer (#53) replace steps 1–4.
 *
 * Durations come from the catalogue (tokens); falls from `tokens.physics` (motion.ts), never ms per row.
 */
import { TOKENS } from '../../../theme/tokens.ts';
import type { At, GameEvent, PieceId } from '../../../core/types.ts';
import { fallLeg, glideMs } from '../motion.ts';
import { JUICE_VIEW } from '../viewConstants.ts';
import { juiceMs } from './catalog.ts';
import type { JuiceId } from './catalog.ts';

/** Cues of non-P0 events the board still has to show (glass return, balloon, yard cascade …) or bookkeeping. */
export type InternalCue = 'yardFall' | 'glide' | 'return' | 'streakReset' | 'resync' | 'end';
export type CueKind = JuiceId | InternalCue;

/** One block entering the yard: from the truck bed (#19) or out of the queue chip (#20). */
export interface Drop {
  readonly pieceId: PieceId;
  readonly from: At;
  readonly to: At;
  readonly rows: number;
  /** Offset from the cue start (ms). */
  readonly delay: number;
  /** Fall / flight duration (ms). */
  readonly ms: number;
}

export interface MoveCue {
  readonly kind: CueKind;
  readonly at: number;
  readonly ms: number;
  readonly lock: boolean;
  readonly ev: GameEvent | null;
  readonly piece: PieceId | null;
  /**
   * #12 / #15: streak value reached (1…4); #13: rows of the K-17 drop above the yard; #16: trowels held; #20: queued
   * blocks; #50 / #51 / #53: moves left; #55 / #56: moves left at the win; yard cascade: index.
   */
  readonly n?: number;
  /** #51: the counter just reached the last-moves threshold (sound + haptic once). */
  readonly first?: boolean;
  /** #13: the bounce lands in the truck queue (the flight is #88). #18: a next segment slides in. */
  readonly flag?: boolean;
  /** #18: the segment shown next (null: last segment). */
  readonly toSeg?: number | null;
  /** #19 / #20 deliveries. */
  readonly drops?: readonly Drop[];
  /** #84: cells of the missing support. */
  readonly cells?: readonly At[];
}

export type GravityBuild = 'normal' | 'low' | 'high';

export interface PlanContext {
  readonly reduced: boolean;
  /** Level gravity profile (JUICE §0.1). */
  readonly gravity: GravityBuild;
  /** Pieces in the truck queue before the move (K-26: they leave through the chip, oldest first). */
  readonly queuedBefore: readonly PieceId[];
  /** Moves left before the move (#51 threshold crossing). */
  readonly movesBefore: number;
  /** Height (rows) of each piece, for the K-17 drop target above the yard. */
  readonly pieceHeight: (id: PieceId) => number;
}

export interface MovePlan {
  readonly cues: readonly MoveCue[];
  /** Offset of the last cue's end. */
  readonly ms: number;
}

const ph = TOKENS.physics;
const D = TOKENS.duration;

/** Release fall per gravity profile (JUICE §0.1; K-19 has no ms values). */
export function releaseFallMs(rows: number, gravity: GravityBuild): number {
  if (gravity === 'low') return glideMs(rows, ph.fallLowSpeed);
  if (gravity === 'high') return fallLeg(rows, ph.fallHighAccel, ph.fallHighMax).ms;
  return fallLeg(rows, ph.fallNormalAccel, ph.fallNormalMax).ms;
}

/** Yard cascade, truck and K-17 drop falls (`physics.yardFall*`). */
export function yardFallMs(rows: number): number {
  return fallLeg(rows, ph.yardFallAccel, ph.yardFallMax).ms;
}

/** Rows a block above the yard falls to land at `to` (K-17 step 2 "sahanın üstünden düşürme", K-25 `y = 10 − h`). */
export function dropRows(to: At, h: number): number {
  return Math.max(0, TOKENS.layout.grid.rows + TOKENS.layout.grid.craneRows - h - to.y);
}

/** JUICE #13 bounce flight (after the wrong flash): arc to the target, or to above it and down (K-17 step 2). */
export function bounceMs(reduced: boolean, viaDrop: boolean, rows: number): number {
  const flight = reduced ? juiceMs(13, true) : juiceMs(13, false) - JUICE_VIEW.wrongShakeMs;
  return flight + (viaDrop ? yardFallMs(rows) : 0);
}

/** #56: animated bonus moves (META `bonusMaxMovesCounted`, ≤ `duration.bonusMax`). */
export function bonusMs(movesLeft: number, maxCounted: number, reduced: boolean): number {
  if (movesLeft <= 0) return 0;
  if (reduced) return juiceMs(56, true);
  return Math.min(D.bonusMax, Math.min(movesLeft, maxCounted) * D.bonusPerMove);
}

type Ev<T extends GameEvent['t']> = Extract<GameEvent, { t: T }>;

function cue(kind: CueKind, at: number, ms: number, extra: Partial<MoveCue> = {}): MoveCue {
  return { kind, at, ms, lock: false, ev: null, piece: null, ...extra };
}

/** Schedule of one committed move (drag, trowel or accepted offer). `bonusMax` = META `bonusMaxMovesCounted`. */
export function planMove(events: readonly GameEvent[], ctx: PlanContext, bonusMax: number): MovePlan {
  const r = ctx.reduced;
  const ms = (id: JuiceId): number => juiceMs(id, r);
  const cues: MoveCue[] = [];
  let t = 0;
  let end = 0;
  const add = (c: MoveCue): void => {
    cues.push(c);
    end = Math.max(end, c.at + c.ms);
  };
  const of = <T extends GameEvent['t']>(type: T, step?: number): Ev<T>[] =>
    events.filter((e): e is Ev<T> => e.t === type && (step === undefined || e.step === step));

  // --- step 1: release / trowel / offer
  for (const e of of('pieceMoved', 1)) {
    if (e.entry === 'yard') {
      add(cue(9, t, ms(9), { ev: e, piece: e.pieceId }));
      t += ms(9);
    } else if (e.entry === 'gap') {
      add(cue(23, t, ms(23), { ev: e, piece: e.pieceId }));
      t += ms(23);
    }
  }
  for (const e of of('boosterApplied', 1)) {
    if (e.booster !== 'trowel') continue;
    add(cue(17, t, ms(17), { ev: e }));
    t += ms(17);
  }
  for (const e of of('movesChanged')) {
    if (e.reason !== 'offer') continue;
    add(cue(53, t, ms(53), { ev: e, n: e.movesLeft }));
    t += ms(53);
  }

  // --- step 2: fall, balloon, glass return
  for (const e of events) {
    if (e.step !== 2) continue;
    if (e.t === 'pieceFell' && e.cause === 'release') {
      const fall = releaseFallMs(e.rows, ctx.gravity);
      add(cue(10, t, fall, { ev: e, piece: e.pieceId }));
      add(cue(11, t + fall, ms(11), { ev: e, piece: e.pieceId }));
      t += fall;
    } else if (e.t === 'balloonRose') {
      const rise = glideMs(e.rows, ph.balloonRiseSpeed);
      add(cue('glide', t, rise, { ev: e, piece: e.pieceId }));
      t += rise;
    } else if (e.t === 'pieceReturned') {
      const back = D.placeBad;
      add(cue('return', t, back, { ev: e, piece: e.pieceId }));
      t += back;
    } else if (e.t === 'comboChanged' && e.combo === 0) {
      add(cue('streakReset', t, 0, { ev: e }));
    }
  }

  // --- step 3: validation, streak
  let step3 = 0;
  const reachedEv = of('comboChanged', 3).find((e) => e.combo > 0);
  const earned = of('trowelEarned', 3)[0];
  for (const e of of('placementCorrect', 3)) {
    add(cue(12, t, ms(12), { ev: e, piece: e.pieceId, n: reachedEv?.combo ?? 1 }));
    add(cue(83, t + ms(12), ms(83), { ev: e }));
    step3 = Math.max(step3, ms(12));
  }
  if (reachedEv) {
    add(cue(15, t, ms(15), { ev: reachedEv, n: reachedEv.combo }));
    if (earned) add(cue(16, t + ms(15), ms(16), { ev: earned, n: earned.trowels }));
  }
  for (const e of of('pieceBounced', 3)) {
    const toQueue = e.to === 'queue';
    const h = ctx.pieceHeight(e.pieceId);
    const rows = toQueue ? 0 : dropRows(e.to as At, h);
    const flight = toQueue ? 0 : bounceMs(r, e.viaDrop, rows);
    const wrongMs = (r ? 0 : JUICE_VIEW.wrongShakeMs) + flight;
    add(cue(13, t, wrongMs, { ev: e, piece: e.pieceId, flag: toQueue, n: rows }));
    let done = t + wrongMs;
    if (toQueue) {
      const q = r ? 0 : JUICE_VIEW.wrongShakeMs;
      add(cue(88, t + q, ms(88), { ev: e, piece: e.pieceId }));
      done = t + q + ms(88);
    }
    if (e.missingSupport.length > 0) add(cue(84, done, ms(84), { ev: e, cells: e.missingSupport }));
    step3 = Math.max(step3, done - t);
  }
  for (const e of of('mortarStuck', 3)) {
    if (e.missingSupport.length > 0) add(cue(84, t, ms(84), { ev: e, cells: e.missingSupport }));
    add(cue('resync', t, 0, { ev: e }));
  }
  for (const e of of('comboChanged', 3)) {
    if (e.combo === 0 && !earned) add(cue('streakReset', t, 0, { ev: e }));
  }
  t += step3;

  // --- step 4: the counter
  for (const e of of('movesChanged', 4)) {
    if (e.reason !== 'move') continue;
    add(cue(50, t, ms(50), { ev: e, n: e.movesLeft }));
    const at = JUICE_VIEW.lastMovesAt;
    if (e.movesLeft <= at)
      add(cue(51, t, ms(51), { ev: e, n: e.movesLeft, first: ctx.movesBefore > at }));
    t += ms(50);
  }

  // --- step 6: yard cascade (K-20), staggered by column
  const cascade = of('pieceFell', 6)
    .filter((e) => e.cause === 'yardGravity')
    .sort((a, b) => a.from.x - b.from.x || a.from.y - b.from.y);
  let step6 = 0;
  cascade.forEach((e, i) => {
    const delay = i * ph.yardCascadeStaggerMs;
    const fall = yardFallMs(e.rows);
    add(cue('yardFall', t + delay, fall, { ev: e, piece: e.pieceId, n: i }));
    step6 = Math.max(step6, delay + fall);
  });
  t += step6;

  // --- step 8: segment slide (locked)
  const shifted = of('siteShifted', 8)[0];
  for (const e of of('segmentCompleted', 8)) {
    const toSeg = shifted ? shifted.toSeg : null;
    add(cue(18, t, ms(18), { ev: e, lock: true, flag: shifted !== undefined, toSeg }));
    t += ms(18);
  }

  // --- step 9: truck delivery (locked) and the queue chip
  const delivered = of('pieceFell', 9).filter((e) => e.cause === 'delivery');
  const fromQueue = delivered.filter((e) => ctx.queuedBefore.includes(e.pieceId));
  const fromTruck = delivered.filter((e) => !ctx.queuedBefore.includes(e.pieceId));
  const queuedEv = of('deliveryQueued', 9)[0];
  if (fromTruck.length > 0) {
    const enter = JUICE_VIEW.truckEnterMs;
    const drops = fromTruck.map((e, i) => ({
      pieceId: e.pieceId,
      from: e.from,
      to: e.to,
      rows: e.rows,
      delay: enter + i * ph.truckDropStaggerMs,
      ms: yardFallMs(e.rows),
    }));
    const lastLand = Math.max(...drops.map((d) => d.delay + d.ms));
    const truckMs = Math.max(ms(19), lastLand + JUICE_VIEW.truckExitMs);
    add(cue(19, t, truckMs, { lock: true, drops, ev: of('deliveryArrived', 9)[0] ?? null }));
    t += truckMs;
  }
  if (fromQueue.length > 0 || queuedEv) {
    const drops = fromQueue.map((e, i) => ({
      pieceId: e.pieceId,
      from: e.from,
      to: e.to,
      rows: e.rows,
      delay: i * ph.truckDropStaggerMs,
      ms: juiceMs(88, r),
    }));
    const flights = drops.reduce((m, d) => Math.max(m, d.delay + d.ms), 0);
    const chipMs = Math.max(ms(20), flights);
    add(cue(20, t, chipMs, { ev: queuedEv ?? null, n: queuedEv?.queued, drops }));
    t += chipMs;
  }

  // --- step 11: level end (locked; last)
  for (const e of of('levelWon')) {
    add(cue(55, t, ms(55), { ev: e, lock: true, n: e.movesLeft }));
    t += ms(55);
    const bonus = bonusMs(e.movesLeft, bonusMax, r);
    if (bonus > 0) {
      add(cue(56, t, bonus, { ev: e, lock: true, n: e.movesLeft }));
      t += bonus;
    }
  }
  for (const e of of('outOfMoves')) {
    add(cue(57, t, ms(57), { ev: e, lock: true }));
    t += ms(57);
  }

  // --- step 12 (K-30 truck help, Phase 3 presentation #21) and the end: re-sync the board with the state
  if (events.some((e) => e.step === 12)) add(cue('resync', t, 0));
  const last = Math.max(t, end);
  add(cue('end', last, 0));
  return { cues, ms: last };
}
