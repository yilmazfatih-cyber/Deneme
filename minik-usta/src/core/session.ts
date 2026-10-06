/**
 * `GameSession` (docs/GDD.md K-39, K-43, K-29, K-28, K-40; TECH_DESIGN §1.2, §6.1, §11.1): one attempt at one level.
 * Pure (no clock, no storage): the scene commits actions, the save service stores the action log after each one.
 *
 * - State + move log: `log[0]` is the `start` action (pre-level boosters, streak tier); then every committed drag,
 *   trowel use, accepted +5 offer and undo, in order (TECH §11.1 `InLevel.actions`). Cancelled drags and rejected
 *   boosters change nothing and are not logged.
 * - K-39 Undo: before each drag the buffer is copied (≈ 2–4 KB); Undo restores that copy IN PLACE (the scene keeps
 *   its state reference), so counter, `m`, timers, streak, trowels, deliveries and queue, segment shift, goals — and a
 *   truck help of that move's step 12 (E-37) — all come back. Depth 1; not after a trowel / +5 offer; not while the
 *   out-of-moves window is open (core/boosters.ts `undoBlock`).
 * - K-43 resume: `GameSession.replay(level, log)` rebuilds the attempt deterministically, bit for bit (E-38), with the
 *   same undo snapshot, offer count and out-of-moves window (UX §1 (a)). A replay that does not apply throws
 *   `ReplayError` (the caller voids the attempt, like a level hash / rules version mismatch, K-43 item 4).
 * - K-29: when a move ends with 0 moves and no win, the window offers `n = offersUsed + 1` (n ≤ 3; the ad option only
 *   for n = 1). Accepting runs `addMoves` (+5, step 12 once); declining loses the level. With 3 offers used the level is
 *   lost at once (no window).
 * - K-43 exit: only with the player's confirmation; `m ≥ 1` is a loss, `m = 0` is free (life and pre-level boosters are
 *   refunded by meta, the streak bonus is not consumed, E-41).
 * - Attempt counting (`levels[id].attempts`, K-43: a resume is the same attempt) lives in the save service;
 *   `resumed` tells the caller which case it is.
 */
import type { Move, PreBooster, SessionAction } from './types.ts';
import { H, STATE_FLAG, createInitialState, hdr, setHdr } from './state.ts';
import type { GameState } from './state.ts';
import type { CompiledLevel } from './level/compile.ts';
import { NULL_SINK, applyMove, canonicalJson, fnv1a64, measureYao } from './moves.ts';
import type { EventSink, MoveHooks, MoveResult, YaoMeasure } from './moves.ts';
import { grantTrowels } from './combo.ts';
import { undoBlock } from './boosters.ts';
import type { BoosterOutcome, UndoBlock } from './boosters.ts';

/** Core rules version (K-43 item 4): bump it whenever a rule change can change the replay of a saved log. */
export const RULES_VERSION = 1;
/** K-29: moves of an accepted offer. */
export const OFFER_MOVES = 5;
/** K-29: offers per attempt (ad or coins). */
export const MAX_OFFERS = 3;
/** K-40 Termos: extra moves. */
export const THERMOS_MOVES = 3;
/** K-40 Mala Başlangıcı: extra trowels. */
export const TROWEL_START = 1;
/** K-40 Açık Kepenk: W4 / W7 count as open while `m < 5`. */
export const OPEN_SHUTTER_MOVES = 5;

/** `playing` · `outOfMoves` (K-29 window open) · `won` (K-28) · `lost` (declined / no offer left / exit with m ≥ 1) ·
 * `exited` (free exit at m = 0). */
export type SessionOutcome = BoosterOutcome;

export type StartAction = Extract<SessionAction, { kind: 'start' }>;
export type StreakTier = StartAction['streakTier'];

/** Win-streak level-start bonus of a tier (amounts: config/economy.json `winStreak`, META; read by meta). */
export interface StreakBonus {
  readonly moves: number;
  readonly trowels: number;
}

export interface SessionOptions {
  readonly hooks?: MoveHooks;
  /**
   * Bonus of streak tier 1–3. Core cannot read config/economy.json, so the caller passes it; the default throws for a
   * tier above 0 (a silent zero would hide a wiring bug).
   */
  readonly streakBonus?: (tier: 1 | 2 | 3) => StreakBonus;
  /** Invalid move records throw (development) instead of becoming `moveCancelled{reason: 'invalid'}`. */
  readonly strict?: boolean;
}

/** The +5 offer the out-of-moves window shows (K-29). */
export interface OfferInfo {
  /** Offer number of this attempt (1–3); the price step is `offerCosts[n − 1]` (meta). */
  readonly n: number;
  /** The ad option exists only on the first offer of an attempt. */
  readonly adAllowed: boolean;
}

export interface ExitResult {
  /** `free`: m = 0 (K-43 item 2, E-41); `loss`: m ≥ 1. */
  readonly kind: 'free' | 'loss';
  readonly movesMade: number;
  /** Free exit: pre-level boosters to give back (the reserved life is meta's). Empty on a loss. */
  readonly refundPreBoosters: readonly PreBooster[];
  /** The win-streak bonus counts as used (false on a free exit: given again next time). */
  readonly streakBonusConsumed: boolean;
}

/** A logged action that does not replay (K-43): the attempt cannot be rebuilt. */
export class ReplayError extends Error {
  readonly index: number;
  constructor(index: number, message: string) {
    super(`replay: action ${index}: ${message}`);
    this.name = 'ReplayError';
    this.index = index;
  }
}

const NOT_PLAYING: MoveResult = Object.freeze({
  status: 'rejected',
  reason: 'notPlaying',
  won: false,
  outOfMoves: false,
});

function noStreakBonus(tier: number): StreakBonus {
  throw new Error(`GameSession: streak tier ${tier} needs options.streakBonus (META win-streak amounts)`);
}

function copyAction<T extends SessionAction>(a: T): T {
  return JSON.parse(JSON.stringify(a)) as T;
}

export class GameSession {
  readonly lvl: CompiledLevel;
  /** Built by `replay` (K-43 resume: the same attempt, `attempts` does not grow). */
  readonly resumed: boolean;
  readonly preBoosters: readonly PreBooster[];
  readonly streakTier: StreakTier;

  readonly #state: GameState;
  readonly #log: SessionAction[];
  readonly #opts: SessionOptions;
  /** Pre-move buffer of the last committed drag while it may be undone (K-39). */
  #undo: Int32Array | null = null;
  #outcome: SessionOutcome = 'playing';
  #offersUsed = 0;
  #adOfferUsed = false;

  private constructor(
    lvl: CompiledLevel,
    start: StartAction,
    opts: SessionOptions,
    resumed: boolean,
    sink: EventSink,
  ) {
    this.lvl = lvl;
    this.resumed = resumed;
    this.#opts = opts;
    this.preBoosters = Object.freeze([...start.preBoosters]);
    this.streakTier = start.streakTier;
    this.#state = createInitialState(lvl);
    this.#log = [copyAction(start)];
    this.#applyStart(sink);
  }

  /** A new attempt (K-40 bonuses applied: Termos, streak moves, trowels, Open Shutter). */
  static start(
    lvl: CompiledLevel,
    start: { readonly preBoosters?: readonly PreBooster[]; readonly streakTier?: StreakTier } = {},
    opts: SessionOptions = {},
    sink: EventSink = NULL_SINK,
  ): GameSession {
    const action: StartAction = {
      kind: 'start',
      preBoosters: [...(start.preBoosters ?? [])],
      streakTier: start.streakTier ?? 0,
    };
    return new GameSession(lvl, action, opts, false, sink);
  }

  /** K-43 resume: rebuilds the attempt from its action log (no events). Throws `ReplayError` when it does not apply. */
  static replay(lvl: CompiledLevel, log: readonly SessionAction[], opts: SessionOptions = {}): GameSession {
    const first = log[0];
    if (!first || first.kind !== 'start') throw new ReplayError(0, 'the log must start with a start action');
    const session = new GameSession(lvl, first, opts, true, NULL_SINK);
    for (let i = 1; i < log.length; i++) {
      const a = log[i] as SessionAction;
      if (a.kind === 'start') throw new ReplayError(i, 'a second start action');
      if (a.kind === 'undo') {
        if (!session.undo()) throw new ReplayError(i, `undo is not available (${session.undoBlock()})`);
        continue;
      }
      if (a.kind === 'addMoves') {
        if (a.source !== 'offerCoins' && a.source !== 'offerAd')
          throw new ReplayError(i, `addMoves from ${a.source} belongs to the start action`);
        if (a.amount !== OFFER_MOVES) throw new ReplayError(i, `an offer adds ${OFFER_MOVES} moves`);
        const res = session.acceptOffer(a.source);
        if (res.status !== 'applied') throw new ReplayError(i, `offer not accepted (${res.reason})`);
        continue;
      }
      const res = session.commit(a);
      if (res.status !== 'applied') throw new ReplayError(i, `${a.kind} did not apply (${res.reason})`);
    }
    return session;
  }

  /** The live state. Read it; never change it outside the session (the scene only replays events, TECH §1.4). */
  get state(): GameState {
    return this.#state;
  }

  /** The action log (a copy), `start` first (TECH §11.1 `InLevel.actions`). */
  get log(): SessionAction[] {
    return this.#log.map(copyAction);
  }

  /** GDD `m`: completed moves (K-43 exit, `level_resume.movesMade`). */
  get movesMade(): number {
    return hdr(this.#state, H.turn);
  }

  get movesLeft(): number {
    return hdr(this.#state, H.movesLeft);
  }

  get outcome(): SessionOutcome {
    return this.#outcome;
  }

  /** K-29 offers accepted in this attempt (ad or coins). */
  get offersUsed(): number {
    return this.#offersUsed;
  }

  get adOfferUsed(): boolean {
    return this.#adOfferUsed;
  }

  /** K-46 YAO of this attempt (`level_end`). */
  yao(): YaoMeasure {
    return measureYao(this.#state);
  }

  /** K-39 precondition (`canUseUndo`): null when Undo may be used. */
  undoBlock(): UndoBlock | null {
    return undoBlock({ outcome: this.#outcome, lastDragUndoable: this.#undo !== null });
  }

  canUndo(): boolean {
    return this.undoBlock() === null;
  }

  /** The offer of the open out-of-moves window (K-29); null when no window is open or 3 offers were used. */
  nextOffer(): OfferInfo | null {
    if (this.#outcome !== 'outOfMoves' || this.#offersUsed >= MAX_OFFERS) return null;
    return { n: this.#offersUsed + 1, adAllowed: this.#offersUsed === 0 };
  }

  /**
   * Commits a drag or a booster move (Phase 2: the Golden Trowel). Cancelled / rejected moves change nothing and are
   * not logged; a won level or an open out-of-moves window rejects every move. +5 offers go through `acceptOffer`.
   */
  commit(move: Move, sink: EventSink = NULL_SINK): MoveResult {
    if (move.kind === 'addMoves') throw new Error('GameSession.commit: use acceptOffer for +5 offers (K-29)');
    if (this.#outcome !== 'playing') return NOT_PLAYING;
    const snapshot = move.kind === 'drag' ? this.#state.buf.slice() : null;
    const res = applyMove(this.#state, move, sink, this.#applyOptions());
    if (res.status !== 'applied') return res;
    this.#log.push(copyAction(move));
    this.#undo = snapshot;
    if (res.won) this.#outcome = 'won';
    else if (res.outOfMoves) this.#outcome = this.#offersUsed >= MAX_OFFERS ? 'lost' : 'outOfMoves';
    if (this.#outcome === 'lost') this.#markLost();
    return res;
  }

  /** K-39: restores the state before the last drag (in place). Returns false when Undo is not available. */
  undo(): boolean {
    const snapshot = this.#undo;
    if (this.undoBlock() !== null || snapshot === null) return false;
    this.#state.buf.set(snapshot);
    this.#undo = null;
    this.#log.push({ kind: 'undo' });
    return true;
  }

  /** K-29: accepts offer `n` of the open window (+5 moves, step 12 once). Rejected when not allowed. */
  acceptOffer(source: 'offerCoins' | 'offerAd', sink: EventSink = NULL_SINK): MoveResult {
    const offer = this.nextOffer();
    if (!offer) return { ...NOT_PLAYING, reason: 'noOffer' };
    if (source === 'offerAd' && !offer.adAllowed) return { ...NOT_PLAYING, reason: 'adNotAllowed' };
    const move: Move = { kind: 'addMoves', amount: OFFER_MOVES, source };
    const res = applyMove(this.#state, move, sink, this.#applyOptions());
    if (res.status !== 'applied') return res;
    this.#log.push(move);
    this.#offersUsed += 1;
    if (source === 'offerAd') this.#adOfferUsed = true;
    this.#undo = null; // K-39: no Undo across a +5 offer
    this.#outcome = 'playing';
    return res;
  }

  /** K-29: the player declines the offer: the level is lost. */
  declineOffer(): void {
    if (this.#outcome !== 'outOfMoves')
      throw new Error(`declineOffer: no out-of-moves window (${this.#outcome})`);
    this.#outcome = 'lost';
    this.#markLost();
  }

  /** K-43 item 2: confirmed exit. `m ≥ 1` → loss; `m = 0` → free (refunds, streak bonus kept). */
  exit(): ExitResult {
    if (this.#outcome !== 'playing') throw new Error(`exit: the attempt is not running (${this.#outcome})`);
    const movesMade = this.movesMade;
    if (movesMade >= 1) {
      this.#outcome = 'lost';
      this.#markLost();
      return { kind: 'loss', movesMade, refundPreBoosters: [], streakBonusConsumed: true };
    }
    this.#outcome = 'exited';
    return {
      kind: 'free',
      movesMade,
      refundPreBoosters: [...this.preBoosters],
      streakBonusConsumed: false,
    };
  }

  #applyOptions(): { hooks?: MoveHooks; strict?: boolean } {
    return { hooks: this.#opts.hooks, strict: this.#opts.strict };
  }

  #markLost(): void {
    setHdr(this.#state, H.flags, hdr(this.#state, H.flags) | STATE_FLAG.lost);
  }

  /** K-40 level start: Termos, streak bonus, Mala Başlangıcı, Açık Kepenk (no step 12, no timers, `m` stays 0). */
  #applyStart(sink: EventSink): void {
    const s = this.#state;
    const opts = this.#applyOptions();
    let trowels = 0;
    if (this.preBoosters.includes('thermos'))
      applyMove(s, { kind: 'addMoves', amount: THERMOS_MOVES, source: 'thermos' }, sink, opts);
    if (this.streakTier > 0) {
      const bonus = (this.#opts.streakBonus ?? noStreakBonus)(this.streakTier as 1 | 2 | 3);
      if (bonus.moves > 0)
        applyMove(s, { kind: 'addMoves', amount: bonus.moves, source: 'streak' }, sink, opts);
      trowels += bonus.trowels;
    }
    if (this.preBoosters.includes('trowelStart')) trowels += TROWEL_START;
    if (trowels > 0) grantTrowels(s, trowels);
    if (this.preBoosters.includes('openShutter')) setHdr(s, H.openShutterUntil, OPEN_SHUTTER_MOVES);
  }
}

/**
 * K-43 item 4 `levelHash` (TECH §11.1): FNV-1a 64 of the canonical JSON of the level data, 16 hex digits. The single
 * implementation (services/save re-exports it). Hash the level as loaded (`CompiledLevel.data`, a `LevelData`) at
 * attempt start and at resume; any JSON value is accepted so tools and tests can hash raw data too.
 */
export function levelHash(data: unknown): string {
  return fnv1a64(canonicalJson(data));
}
