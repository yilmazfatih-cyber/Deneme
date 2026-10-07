/**
 * `TutorialController` (docs/GDD.md §14.1; TECH_DESIGN §8.2 "TutorialController kuralları"; UX_FLOWS §13; LEVELS
 * `tutorial[]`). Pure state machine over a level's tutorial steps; the overlay (spotlight, glove, Usta Dede bubble) only
 * draws `current`. No Phaser, no clock of its own: the scene passes its animation time.
 *
 * - Steps run in order. A step with `startOn` WAITS (nothing shown, play is free) until its start event happens after
 *   the previous step ended; without `startOn` it starts when the previous one ends (the first one at level start).
 *   A `startOn` that never happens hides that step and every later one (GDD §14.1/5).
 * - `done`: the counter starts at 0 when the step is shown (earlier events never count); `count` defaults to 1; a
 *   move-end event counts at most once per move; drag signals count at most once per drag; `timeoutMs` ends the step
 *   by itself. Move-end events reach the controller when the EventPlayer has finished playing the move, so the step
 *   change is visible after the animation (TECH §8.2).
 * - A `tut.ctx.<topic>` text marks `seenContextTips.<topic>` the moment the step is shown (GDD §14.1/2).
 * - Required steps: the never-lock guarantee (guarantee.ts) runs when the step starts and after every move; when no
 *   highlighted block can produce the `done` event the step is skipped (it counts as done, same analytics record).
 * - The glove disappears after the player's first correct touch: a highlighted block is picked (UX §13.1).
 * - Required (Z) step with highlighted blocks (UX §13.1 "Zorunlu adımda delik dışındaki dokunuşlar yok sayılır"; GDD
 *   §14.1/4): only those blocks may be picked (`allowsPick`, the scene's input gate — merged spotlight holes may cover
 *   other blocks), and its drag signals count only in a drag of one of them.
 * - K-43 resume (review Faz 2 tur 2 #8, Faz 2 tur 3 #1): the scene saves the position on screen (`position()` +
 *   the actions it includes, `inLevel.tutorial`) whenever it changes; on resume the controller goes to that saved
 *   position (`restore`) after the actions it includes, then reads only the move ends of the later actions (a kill
 *   while the last move's cues played): the step on screen at the kill — its required gate, `tut.ctx.*` line and
 *   counter — opens again, never a later one, also after a cancelled drag whose `overWall` / `gapPass` the log does not
 *   hold. Without a saved position (old save) it is rebuilt from the log (`replayTutorialAction`): a replayed drag gives
 *   only the signals its result proves (`overWall`: yard → site FREE, `gapPass`: released on a rail); a hold has no
 *   duration in the log, so `holdOverBuild` is never assumed; a `timeoutMs` step ends before the next action.
 */
import type { CompiledLevel } from '../../../core/level/compile.ts';
import type { TutCondition, TutorialStepData } from '../../../core/level/schema.ts';
import type { MoveHooks } from '../../../core/moves.ts';
import type { DragRules } from '../../../core/movement.ts';
import type { GameState } from '../../../core/state.ts';
import type { GameEvent, PieceId, SessionAction } from '../../../core/types.ts';
import { canProduce } from './guarantee.ts';
import { moveMatches } from './tutorialEvents.ts';
import type { DragSignalEvent } from './tutorialEvents.ts';

export interface TutorialHost {
  /** Current game state (null while no attempt runs). */
  state(): GameState | null;
  dragRules(): DragRules;
  hooks(): MoveHooks;
  /** GDD §14.1/2: `seenContextTips.<topic>` (written at once). */
  markContextTip(topic: string): void;
  /** A step ended (completed or skipped): ANALYTICS `tutorial_step`. */
  stepEnded(step: number, skipped: boolean): void;
}

export interface ShownStep {
  /** Index in `tutorial[]`. */
  readonly index: number;
  readonly data: TutorialStepData;
  readonly required: boolean;
  /** Highlighted blocks (`piece:` / `debris:` resolved through `CompiledLevel.tutorialPieceIds`). */
  readonly pieces: readonly PieceId[];
  /** Animation time the step was shown. */
  readonly since: number;
  /** The glove is gone (first correct touch). */
  readonly handHidden: boolean;
}

type Phase = 'idle' | 'waiting' | 'shown' | 'finished';

/**
 * Where the tutorial is (K-43 resume, `inLevel.tutorial` without its `actions`): step `index` of the sorted steps
 * (`steps.length` = finished), on screen (`shown`) or waiting for its `startOn`, `count` events toward its condition.
 */
export interface TutorialPosition {
  readonly index: number;
  readonly shown: boolean;
  readonly count: number;
}

const CTX_PREFIX = 'tut.ctx.';

/** `piece:<i>`, `piece:k<p>_<i>`, `debris:<i>` of a step → PieceIds (TECH §8.2 "Vurgu → blok çözümü"). */
export function highlightedPieces(lvl: CompiledLevel, highlight: readonly string[]): PieceId[] {
  const out: PieceId[] = [];
  for (const h of highlight) {
    if (!h.startsWith('piece:') && !h.startsWith('debris:')) continue;
    const id = lvl.tutorialPieceIds.get(h);
    if (id !== undefined && !out.includes(id)) out.push(id);
  }
  return out;
}

export class TutorialController {
  readonly lvl: CompiledLevel;
  readonly steps: readonly TutorialStepData[];
  readonly #host: TutorialHost;
  #phase: Phase = 'idle';
  #index = -1;
  #count = 0;
  #since = 0;
  #handHidden = false;
  #pieces: PieceId[] = [];
  /** Drag signals already counted in this drag. */
  #dragCounted = new Set<DragSignalEvent>();
  /** The block of the current drag (null between drags). */
  #dragPiece: PieceId | null = null;
  #version = 0;
  /** Bumped on every change of `position()` (visible changes and counter steps). */
  #positionVersion = 0;

  constructor(lvl: CompiledLevel, host: TutorialHost) {
    this.lvl = lvl;
    this.steps = [...(lvl.data.tutorial ?? [])].sort((a, b) => a.step - b.step);
    this.#host = host;
  }

  /** Bumped on every visible change (the overlay redraws only then). */
  get version(): number {
    return this.#version;
  }

  /** Bumped whenever `position()` may have changed (the scene's K-43 save compares it each frame, allocation-free). */
  get positionVersion(): number {
    return this.#positionVersion;
  }

  get finished(): boolean {
    return this.#phase === 'finished';
  }

  /** The step on screen, or null (waiting for `startOn`, idle or finished). */
  get current(): ShownStep | null {
    if (this.#phase !== 'shown') return null;
    const data = this.steps[this.#index];
    if (!data) return null;
    return {
      index: this.#index,
      data,
      required: data.mode === 'required',
      pieces: this.#pieces,
      since: this.#since,
      handHidden: this.#handHidden,
    };
  }

  /** The step waiting for its `startOn` event (no overlay), if any. */
  get waiting(): TutorialStepData | null {
    return this.#phase === 'waiting' ? (this.steps[this.#index] ?? null) : null;
  }

  /** The position on screen (K-43 save); null before `start`. */
  position(): TutorialPosition | null {
    if (this.#phase === 'idle') return null;
    if (this.#phase === 'finished') return { index: this.steps.length, shown: false, count: 0 };
    return { index: this.#index, shown: this.#phase === 'shown', count: this.#count };
  }

  /** Can `pos` be a position of this tutorial (a damaged or foreign save is not restored)? */
  accepts(pos: TutorialPosition): boolean {
    const { index, shown, count } = pos;
    if (!Number.isInteger(index) || !Number.isInteger(count) || index < 0 || count < 0) return false;
    if (index >= this.steps.length) return index === this.steps.length && !shown && count === 0;
    const step = this.steps[index];
    if (!step) return false;
    const cond = shown ? step.done : step.startOn;
    if (!shown && !cond) return false; // a step without `startOn` never waits
    if (!cond || 'timeoutMs' in cond) return count === 0;
    return count < (cond.count ?? 1);
  }

  /**
   * K-43 resume (review Faz 2 tur 3 #1): goes to the saved position as it was on screen — the step with its required
   * gate and `tut.ctx.*` mark, its counter, the glove back (its timer, like every animation, starts again). Neither
   * `tutorial_step` nor a later step: the required-step guarantee runs on the state of now. False (nothing changed)
   * when `accepts(pos)` is false.
   */
  restore(pos: TutorialPosition, now: number): boolean {
    if (!this.accepts(pos)) return false;
    this.#dragCounted.clear();
    this.#dragPiece = null;
    this.#index = pos.index;
    if (pos.index >= this.steps.length) {
      this.#phase = 'finished';
      this.#count = 0;
      this.#bump();
      return true;
    }
    if (pos.shown) {
      this.#show(now); // phase, since, glove, highlighted blocks, `tut.ctx.*` mark, guarantee
      if (this.#phase === 'shown' && this.#index === pos.index) {
        this.#count = pos.count;
        this.#positionVersion += 1;
      }
    } else {
      this.#phase = 'waiting';
      this.#count = pos.count;
      this.#bump();
    }
    return true;
  }

  /** Level start: the first step (or its `startOn` wait). */
  start(now: number): void {
    this.#index = -1;
    this.#phase = 'idle';
    this.#next(now);
  }

  /** Level over: nothing more is shown (GDD §14.1/5: steps whose `startOn` never came stay hidden). */
  stop(): void {
    if (this.#phase === 'finished') return;
    this.#phase = 'finished';
    this.#bump();
  }

  /**
   * May block `pieceId` be picked now? False only on a required step that highlights other blocks (the gate of review
   * Faz 2 tur 1 #12; a required step without block highlights leaves every block free).
   */
  allowsPick(pieceId: PieceId): boolean {
    const step = this.current;
    if (!step || !step.required || step.pieces.length === 0) return true;
    return step.pieces.includes(pieceId);
  }

  /** The player lifted a block (K-07 threshold passed). */
  dragStarted(pieceId: PieceId): void {
    this.#dragCounted.clear();
    this.#dragPiece = pieceId;
    if (this.#phase === 'shown' && !this.#handHidden && this.#pieces.includes(pieceId)) {
      this.#handHidden = true;
      this.#bump();
    }
  }

  /**
   * Drag signal (`overWall` = DragSession `crossedWall`, `gapPass` = `enteredRail`, `holdOverBuild` from the scene's
   * hold timer); each counts at most once per drag, even when the drag is cancelled later.
   */
  dragSignal(kind: DragSignalEvent, now: number, holdMs = 0): void {
    if (this.#dragCounted.has(kind)) return;
    const cond = this.#activeCond();
    if (!cond || cond.event !== kind) return;
    if (this.#phase === 'shown' && this.#dragPiece !== null && !this.allowsPick(this.#dragPiece)) return;
    if (kind === 'holdOverBuild' && cond.event === 'holdOverBuild' && holdMs < cond.minMs) return;
    this.#dragCounted.add(kind);
    this.#hit(cond, now);
  }

  /** `holdOverBuild.minMs` the scene's hold timer must reach now; null when no step listens for it. */
  holdMinMs(): number | null {
    const cond = this.#activeCond();
    return cond?.event === 'holdOverBuild' ? cond.minMs : null;
  }

  /** A tap (under the K-07 threshold) on block `pieceId`: counts for `tap` when the block is highlighted. */
  tapped(pieceId: PieceId, now: number): void {
    const cond = this.#activeCond();
    if (!cond || cond.event !== 'tap') return;
    const step = this.steps[this.#index];
    if (!step || !highlightedPieces(this.lvl, step.highlight).includes(pieceId)) return;
    this.#hit(cond, now);
  }

  /**
   * One committed move (drag or booster use) finished playing: move-end events count once, then the required-step
   * guarantee runs on the new state.
   */
  moveEnded(events: readonly GameEvent[], now: number): void {
    const cond = this.#activeCond();
    if (cond && moveMatches(cond, events, this.#host.state())) this.#hit(cond, now);
    this.#guard(now);
  }

  /** K-43 replay: a `timeoutMs` step on screen ends now (the log has no clock; the player read it before acting). */
  endTimedStep(now: number): void {
    if (this.#phase !== 'shown') return;
    const done = this.steps[this.#index]?.done;
    if (done && 'timeoutMs' in done) this.#complete(now, false);
  }

  /** Per frame: `timeoutMs` steps. */
  update(now: number): void {
    if (this.#phase !== 'shown') return;
    const done = this.steps[this.#index]?.done;
    if (done && 'timeoutMs' in done && now - this.#since >= done.timeoutMs) this.#complete(now, false);
  }

  // --- internals ---------------------------------------------------------------------------------------------------------

  /** The condition the controller listens for now: `startOn` while waiting, `done` while shown. */
  #activeCond(): TutCondition | null {
    const step = this.steps[this.#index];
    if (!step) return null;
    if (this.#phase === 'waiting') return step.startOn ?? null;
    if (this.#phase === 'shown' && !('timeoutMs' in step.done)) return step.done;
    return null;
  }

  #hit(cond: TutCondition, now: number): void {
    this.#count += 1;
    this.#positionVersion += 1;
    if (this.#count < (cond.count ?? 1)) return;
    if (this.#phase === 'waiting') this.#show(now);
    else this.#complete(now, false);
  }

  #next(now: number): void {
    this.#index += 1;
    this.#count = 0;
    this.#dragCounted.clear();
    const step = this.steps[this.#index];
    if (!step) {
      this.#phase = 'finished';
      this.#bump();
      return;
    }
    if (step.startOn) {
      this.#phase = 'waiting';
      this.#bump();
      return;
    }
    this.#show(now);
  }

  #show(now: number): void {
    const step = this.steps[this.#index];
    if (!step) return;
    this.#phase = 'shown';
    this.#count = 0;
    this.#since = now;
    this.#handHidden = false;
    this.#pieces = highlightedPieces(this.lvl, step.highlight);
    if (step.textKey.startsWith(CTX_PREFIX)) this.#host.markContextTip(step.textKey.slice(CTX_PREFIX.length));
    this.#bump();
    this.#guard(now);
  }

  /** GDD §14.1/4b: a required step nobody can finish is skipped. */
  #guard(now: number): void {
    if (this.#phase !== 'shown') return;
    const step = this.steps[this.#index];
    if (!step || step.mode !== 'required' || 'timeoutMs' in step.done) return;
    const s = this.#host.state();
    if (!s) return;
    const ok = canProduce(s, step.done, this.#pieces, {
      drag: this.#host.dragRules(),
      hooks: this.#host.hooks(),
    });
    if (!ok) this.#complete(now, true);
  }

  #complete(now: number, skipped: boolean): void {
    const step = this.steps[this.#index];
    if (step) this.#host.stepEnded(step.step, skipped);
    this.#next(now);
  }

  #bump(): void {
    this.#version += 1;
    this.#positionVersion += 1;
  }
}

/**
 * K-43 resume without a saved position (old save; review Faz 2 tur 2 #8): feeds one replayed action to `tut` like the
 * live scene did — a timed step ends first; a drag starts, gives the drag signals its result proves (from the action's
 * `pieceMoved` event: `overWall` for a yard block released FREE over the site, `gapPass` for a block released on a
 * rail) and ends with the move's events. `holdOverBuild` is never assumed (the log has no hold duration; review Faz 2
 * tur 3 #1). Undo is skipped (the controller does not rewind). The host's `state()` must return the state right after
 * `action` (the guarantee sees the state of that time).
 */
export function replayTutorialAction(
  tut: TutorialController,
  action: SessionAction,
  events: readonly GameEvent[],
  now: number,
): void {
  if (action.kind === 'start' || action.kind === 'undo') return;
  tut.endTimedStep(now);
  if (action.kind === 'drag') {
    tut.dragStarted(action.pieceId);
    const moved = events.find((e) => e.t === 'pieceMoved' && e.pieceId === action.pieceId);
    if (moved?.t === 'pieceMoved') {
      if (moved.entry === 'gap') tut.dragSignal('gapPass', now);
      if (moved.entry === 'overWall' && moved.from.zone === 'yard') tut.dragSignal('overWall', now);
    }
  }
  tut.moveEnded(events, now);
}

/** A saved K-43 tutorial position: `TutorialPosition` + how many log entries (`start` included) it includes. */
export interface SavedTutorialPosition extends TutorialPosition {
  readonly actions: number;
}

/**
 * K-43 resume of the tutorial (TECH §8.2; review Faz 2 tur 3 #1), driven by `GameSession.replay`'s per-action callback
 * (`index` 0 = `start`; the host's `state()` = the state right after `action`):
 * - with a usable saved position (`usable`): nothing until the last action it includes, then `restore` (the step on
 *   screen at that time, not one step further: the cancelled drags and holds the log does not hold are in it); every
 *   later action (its cues were still playing at the kill) gives only its move end — its drag signals came before the
 *   position was saved and are in it already;
 * - without one: the whole log through `replayTutorialAction`.
 */
export class TutorialResume {
  readonly #tut: TutorialController;
  readonly #saved: SavedTutorialPosition | null;

  /** `saved` is used only when the controller accepts it and it includes 1…`logLength` entries. */
  constructor(tut: TutorialController, saved: SavedTutorialPosition | null, logLength: number) {
    this.#tut = tut;
    this.#saved =
      saved !== null && saved.actions >= 1 && saved.actions <= logLength && tut.accepts(saved) ? saved : null;
  }

  /** The saved position is the one restored (tests, debug). */
  get usable(): boolean {
    return this.#saved !== null;
  }

  action(index: number, action: SessionAction, events: readonly GameEvent[], now: number): void {
    const saved = this.#saved;
    if (saved === null) {
      if (index === 0) this.#tut.start(now);
      else replayTutorialAction(this.#tut, action, events, now);
      return;
    }
    if (index === saved.actions - 1) this.#tut.restore(saved, now);
    else if (index >= saved.actions && action.kind !== 'start' && action.kind !== 'undo')
      this.#tut.moveEnded(events, now);
  }
}
