/**
 * Contextual Usta Dede lines `tut.ctx.*` (UX_FLOWS §13.2 "Bağlamsal öğreticiler"; STORY §6; GDD §14.1/2, K-34 hook 4;
 * TECH_DESIGN §8.2 last paragraph). Each one appears ONCE per account, the first time its trigger happens (the save's
 * `seenContextTips`); a tutorial step that reuses the same text (Level 4 step 2 `tut.ctx.support`) marks it too.
 *
 * Pure: triggers are read from a committed move's events (and a few scene signals); the queue shows one tip at a time
 * and never while a tutorial step is on screen (GDD K-34 hook 4, LEVELS §0: the line waits; a step showing the same
 * text marks it seen and it drops). Showing a tip marks it seen. A queued tip whose trigger no longer holds when it
 * could show (the truck queue emptied, the streak was reset, another move was made after a bounce — review Faz 2 tur 1
 * #13) is dropped WITHOUT marking: the next occurrence triggers it again, in context.
 *
 * Highlights (UX §13.2 "Vurgu", review Faz 2 tur 2 #18): a tip lights its static ids (`CTX_HIGHLIGHT`) plus the ids of
 * its occurrence (`ctxMoveHighlight`, `trigger(…, highlight)`): the bounced block and its reason cells (the mismatching,
 * `.` or off-plan cells where it tried to land), the missing-support cells (+ `front`), the block that could not be
 * picked.
 */
import { blockCells } from '../../../core/movement.ts';
import { reasonCells } from '../../../core/placement.ts';
import { shapeByIndex } from '../../../core/shapes.ts';
import { pieceShape } from '../../../core/state.ts';
import type { GameState } from '../../../core/state.ts';
import type { At, GameEvent, VerdictReason } from '../../../core/types.ts';
import { pidHighlight } from './highlights.ts';

export const CTX_TOPICS = [
  'streak',
  'goldtrowel',
  'bounce.color',
  'bounce.window',
  'bounce.offplan',
  'support',
  'tootall',
  'lastmoves',
  'queue',
  'truckhelp.free',
  'truckhelp.material',
  'reshuffle',
  'blocked',
  'resume',
] as const;
export type CtxTopic = (typeof CTX_TOPICS)[number];

/**
 * Static highlight of a tip (UX §13.2 "Vurgu" column; empty = only the occurrence's ids, `ctxMoveHighlight`, or the
 * bubble alone).
 */
export const CTX_HIGHLIGHT: Readonly<Record<CtxTopic, readonly string[]>> = {
  streak: ['streak'],
  goldtrowel: ['streak', 'front'],
  'bounce.color': [],
  'bounce.window': [],
  'bounce.offplan': [],
  support: ['front'],
  tootall: ['crane'],
  lastmoves: ['moves'],
  queue: ['truck'],
  'truckhelp.free': [],
  'truckhelp.material': [],
  reshuffle: [],
  blocked: [],
  resume: [],
};

const cellId = (c: { readonly x: number; readonly y: number }): string => `cell:${c.x},${c.y}`;

/**
 * Occurrence highlight of a move-triggered tip (UX §13.2; `s` = the state after the move): `bounce.*` → the bounced
 * block (`pid:`) + the cells of its primary reason at the landing it tried (`reasonCells`); `support` → the
 * missing-support cells (`cell:`; `front` comes from `CTX_HIGHLIGHT`). Other topics: [].
 */
export function ctxMoveHighlight(topic: CtxTopic, events: readonly GameEvent[], s: GameState): string[] {
  const out: string[] = [];
  const add = (id: string): void => {
    if (!out.includes(id)) out.push(id);
  };
  const support = (cells: readonly At[]): void => {
    for (const c of cells) add(cellId(c));
  };
  for (const e of events) {
    if (e.t === 'pieceBounced') {
      if (e.reason === 'support') {
        if (topic === 'support') support(e.missingSupport);
        continue;
      }
      if (BOUNCE[e.reason] !== topic) continue;
      add(pidHighlight(e.pieceId));
      const shape = shapeByIndex(pieceShape(s, e.pieceId));
      const landing = blockCells(shape, e.from.x, e.from.y);
      for (const c of reasonCells(s, e.pieceId, landing, e.reason)) add(cellId(c));
    } else if (e.t === 'mortarStuck' && e.reason === 'support' && topic === 'support') {
      support(e.missingSupport);
    }
  }
  return out;
}

const BOUNCE: Partial<Record<VerdictReason, CtxTopic>> = {
  color: 'bounce.color',
  window: 'bounce.window',
  outside: 'bounce.offplan',
};

/**
 * Tips a committed move triggers, in display priority. `streakBeforeTrowel` = `combo.correctPlacementsPerTrowel − 1`
 * (the first "3/4"); `lastMovesAt` = the last-moves threshold (5).
 */
export function ctxFromMove(
  events: readonly GameEvent[],
  movesBefore: number,
  streakBeforeTrowel: number,
  lastMovesAt: number,
): CtxTopic[] {
  const out: CtxTopic[] = [];
  const add = (t: CtxTopic): void => {
    if (!out.includes(t)) out.push(t);
  };
  for (const e of events) {
    switch (e.t) {
      case 'pieceBounced':
      case 'mortarStuck':
        if (e.reason === 'support') add('support');
        else {
          const t = BOUNCE[e.reason];
          if (t) add(t);
        }
        break;
      case 'placementWrong': {
        const primary = e.reasons[0];
        if (primary === 'support') add('support');
        else if (primary) {
          const t = BOUNCE[primary];
          if (t) add(t);
        }
        break;
      }
      case 'comboChanged':
        if (e.combo === streakBeforeTrowel) add('streak');
        break;
      case 'trowelEarned':
        add('goldtrowel');
        break;
      case 'movesChanged':
        if (movesBefore > lastMovesAt && e.movesLeft <= lastMovesAt && e.movesLeft > 0) add('lastmoves');
        break;
      case 'deliveryQueued':
        if (e.queued > 0) add('queue');
        break;
      case 'pieceReturned':
        if (e.to === 'queue') add('queue');
        break;
      case 'truckHelp':
        add(
          e.kind === 'unchain'
            ? 'truckhelp.free'
            : e.kind === 'deliverMissing'
              ? 'truckhelp.material'
              : 'reshuffle',
        );
        break;
      default:
        break;
    }
  }
  return out;
}

export interface CtxTipHost {
  seen(topic: CtxTopic): boolean;
  markSeen(topic: CtxTopic): void;
}

/**
 * Is a queued tip still in context? `serial` = the attempt's action count when it was triggered (the scene's
 * `GameSession.log.length`).
 */
export type CtxValidity = (topic: CtxTopic, serial: number) => boolean;

/** Topics whose trigger is a state that lasts (queue, streak, trowel, last moves, resume); the rest are moments. */
export const CTX_LASTING: ReadonlySet<CtxTopic> = new Set<CtxTopic>([
  'queue',
  'streak',
  'goldtrowel',
  'lastmoves',
  'resume',
]);

/** One tip on screen at a time; the rest wait (FIFO). */
export class ContextTips {
  readonly #host: CtxTipHost;
  #queue: { readonly topic: CtxTopic; readonly serial: number; readonly highlight: readonly string[] }[] = [];
  #showing: {
    readonly topic: CtxTopic;
    readonly since: number;
    readonly highlight: readonly string[];
  } | null = null;
  #version = 0;

  constructor(host: CtxTipHost) {
    this.#host = host;
  }

  get version(): number {
    return this.#version;
  }

  get showing(): CtxTopic | null {
    return this.#showing?.topic ?? null;
  }

  /** Highlight ids of the tip on screen: `CTX_HIGHLIGHT` + its occurrence's ids (empty when none shows). */
  get highlight(): readonly string[] {
    const sh = this.#showing;
    return sh ? [...CTX_HIGHLIGHT[sh.topic], ...sh.highlight] : [];
  }

  /** Topics waiting (tests, harness). */
  get queued(): readonly CtxTopic[] {
    return this.#queue.map((q) => q.topic);
  }

  /**
   * A trigger happened (`serial`: see `CtxValidity`; `highlight`: the occurrence's ids): queued when never seen (and
   * not already queued / showing).
   */
  trigger(topic: CtxTopic, serial = 0, highlight: readonly string[] = []): void {
    if (this.#host.seen(topic)) return;
    if (this.#showing?.topic === topic) return;
    const i = this.#queue.findIndex((q) => q.topic === topic);
    if (i >= 0)
      this.#queue[i] = { topic, serial, highlight }; // the newest occurrence is the context
    else this.#queue.push({ topic, serial, highlight });
  }

  /**
   * Per frame: hides the tip after `showMs`, shows the next one when `free` (no tutorial step / window on screen).
   * Showing marks the tip seen; a tip `valid` rejects is dropped unmarked.
   */
  update(now: number, free: boolean, showMs: number, valid: CtxValidity = () => true): void {
    if (this.#showing && now - this.#showing.since >= showMs) {
      this.#showing = null;
      this.#version += 1;
    }
    if (this.#showing || !free) return;
    for (;;) {
      const next = this.#queue.shift();
      if (next === undefined) return;
      if (this.#host.seen(next.topic)) continue; // a tutorial step showed the same text meanwhile
      if (!valid(next.topic, next.serial)) continue; // out of context now: the next occurrence brings it back
      this.#host.markSeen(next.topic);
      this.#showing = { topic: next.topic, since: now, highlight: next.highlight };
      this.#version += 1;
      return;
    }
  }

  /** The player started a drag: the tip leaves (it never covers the board while playing). */
  dismiss(): void {
    if (!this.#showing) return;
    this.#showing = null;
    this.#version += 1;
  }

  /** Level change. */
  clear(): void {
    this.#queue = [];
    if (this.#showing) this.#version += 1;
    this.#showing = null;
  }
}
