/**
 * Session tap (docs/TECH_DESIGN.md §12.3; R-20: development only). Pure: no DOM, no Phaser.
 *
 * The level screen builds every attempt with `GameSession.start` (new attempt) or `GameSession.replay` (K-43 resume),
 * passing the level's registry hooks. The debug panel has no seam in the scene, so while it is installed it wraps
 * these two factories (and restores them on `uninstall`):
 * - `hooks(lvl, base)` may replace the session's `MoveHooks` (unlimited moves, disabled rules — rules.ts); undefined
 *   keeps the caller's options untouched, so an idle panel changes nothing;
 * - every session they return is instrumented: its committed actions (drag, trowel, accepted offer, undo, decline,
 *   exit) and the events of each move reach `listener`. The events are teed from the sink the caller passes (the
 *   scene's `ArraySink`); a caller without a sink gets the same events built for the tap only (`applyMove` is a pure
 *   function of state and move: building the log changes nothing).
 * The core itself is not changed: the tap only calls the original factories and methods.
 */
import type { CompiledLevel } from '../core/level/compile.ts';
import { NULL_SINK } from '../core/moves.ts';
import type { EventSink, MoveHooks, MoveResult } from '../core/moves.ts';
import { GameSession, OFFER_MOVES } from '../core/session.ts';
import type { SessionOptions } from '../core/session.ts';
import type { GameEvent, Move, SessionAction } from '../core/types.ts';

/** A session action as the tap reports it: the logged actions plus the two outcome calls that log nothing. */
export type TappedAction = SessionAction | { readonly kind: 'decline' } | { readonly kind: 'exit' };

export interface TapListener {
  /** A session was built: `start` (new attempt) or `replay` (K-43 resume, `log.length` actions replayed). */
  sessionStarted(session: GameSession, kind: 'start' | 'replay'): void;
  /** An action was tried on a tapped session: its events (teed) and its result (null: undo / decline / exit). */
  action(
    session: GameSession,
    action: TappedAction,
    events: readonly GameEvent[],
    result: MoveResult | null,
  ): void;
}

export interface TapConfig {
  /** Session hooks under the current debug rules; undefined = keep the caller's options. */
  readonly hooks: (lvl: CompiledLevel, base: MoveHooks | undefined) => MoveHooks | undefined;
  readonly listener: TapListener;
}

export interface SessionTap {
  /** The last session built while the tap was installed. */
  readonly current: GameSession | null;
  /** Restores `GameSession.start` / `replay` (sessions already built stay instrumented; harmless). */
  uninstall(): void;
}

/** Forwards to `sink` (when enabled) and records every event for the tap. */
function teeSink(sink: EventSink, seen: GameEvent[]): EventSink {
  const forward = sink.enabled !== false;
  return {
    enabled: true,
    push(e: GameEvent): void {
      seen.push(e);
      if (forward) sink.push(e);
    },
  };
}

let installed = false;

export function installSessionTap(cfg: TapConfig): SessionTap {
  if (installed) throw new Error('installSessionTap: already installed');
  installed = true;
  const original = { start: GameSession.start, replay: GameSession.replay };
  let current: GameSession | null = null;

  const options = (lvl: CompiledLevel, opts: SessionOptions = {}): SessionOptions => {
    const hooks = cfg.hooks(lvl, opts.hooks);
    return hooks ? { ...opts, hooks } : opts;
  };

  const instrument = (session: GameSession, kind: 'start' | 'replay'): GameSession => {
    const commit = session.commit.bind(session);
    const acceptOffer = session.acceptOffer.bind(session);
    const undo = session.undo.bind(session);
    const declineOffer = session.declineOffer.bind(session);
    const exit = session.exit.bind(session);
    const report = (action: TappedAction, events: readonly GameEvent[], result: MoveResult | null): void =>
      cfg.listener.action(session, action, events, result);
    session.commit = (move: Move, sink: EventSink = NULL_SINK): MoveResult => {
      const seen: GameEvent[] = [];
      const res = commit(move, teeSink(sink, seen));
      report(move, seen, res);
      return res;
    };
    session.acceptOffer = (source: 'offerCoins' | 'offerAd', sink: EventSink = NULL_SINK): MoveResult => {
      const seen: GameEvent[] = [];
      const res = acceptOffer(source, teeSink(sink, seen));
      report({ kind: 'addMoves', amount: OFFER_MOVES, source }, seen, res);
      return res;
    };
    session.undo = (): boolean => {
      const ok = undo();
      if (ok) report({ kind: 'undo' }, [], null);
      return ok;
    };
    session.declineOffer = (): void => {
      declineOffer();
      report({ kind: 'decline' }, [], null);
    };
    session.exit = () => {
      const res = exit();
      report({ kind: 'exit' }, [], null);
      return res;
    };
    current = session;
    cfg.listener.sessionStarted(session, kind);
    return session;
  };

  GameSession.start = (lvl, start, opts, sink) =>
    instrument(original.start.call(GameSession, lvl, start, options(lvl, opts), sink), 'start');
  GameSession.replay = (lvl, log, opts) =>
    instrument(original.replay.call(GameSession, lvl, log, options(lvl, opts)), 'replay');

  return {
    get current() {
      return current;
    },
    uninstall(): void {
      if (!installed) return;
      GameSession.start = original.start;
      GameSession.replay = original.replay;
      current = null;
      installed = false;
    },
  };
}
