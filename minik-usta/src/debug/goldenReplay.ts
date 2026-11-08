/**
 * Golden replay on the level screen (docs/TECH_DESIGN.md §12.3 "Golden/solver çözümünü oynat … adım adım / sürekli;
 * her adım sürükleme animasyonuyla"; R-20: development only).
 *
 * Each logged drag is played like a finger on the real input path: mouse events on the game canvas (Phaser's input
 * manager → DragController → core `tryBeginDrag` / `follow` → `GameSession.commit` → save → EventPlayer → tutorial).
 * Nothing is committed behind the scene's back, so the replay also exercises the input, the cues and the tutorial.
 * The finger path comes from dragPlan.ts; after the release the committed action is compared with the golden one.
 *
 * Before every step the replay waits until the board takes input (no cue pending, no locked sequence, no window).
 * When the running attempt has left the solution (another move, an undo) or is over, the level is started again as
 * a new attempt.
 */
import { levelHooks } from '../core/obstacles/registry.ts';
import type { GameSession } from '../core/session.ts';
import type { SessionAction } from '../core/types.ts';
import { TOKENS } from '../theme/tokens.ts';
import { planDrag, toPage } from './dragPlan.ts';
import type { DragMove, Point } from './dragPlan.ts';
import { goldenProgress, loadGolden, sameAction } from './golden.ts';
import type { SceneBridge } from './sceneBridge.ts';

/** Finger points per path edge and animation frames per point (≈ 4 frames, 67 ms per cell at 60 FPS). */
const SUBSTEPS = 2;
const FRAMES_PER_POINT = 2;
/** After the press: hold-to-lift (`drag.holdMs`) and the finger-offset glide (`duration.fingerOffset`) end first. */
const LIFT_MARGIN_MS = 120;
/** Longest wait for the board to take input again (level end cues, truck, segment slide). */
const IDLE_TIMEOUT_MS = 20000;
/** Longest wait for the release to reach the session. */
const COMMIT_TIMEOUT_MS = 3000;
/** Pause between two steps of a continuous replay. */
const STEP_PAUSE_MS = 250;

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type ReplayMode = 'step' | 'play';

export class GoldenReplay {
  readonly #bridge: SceneBridge;
  readonly #status: (text: string) => void;
  #running = false;
  #stopRequested = false;

  constructor(bridge: SceneBridge, status: (text: string) => void) {
    this.#bridge = bridge;
    this.#status = status;
  }

  get running(): boolean {
    return this.#running;
  }

  stop(): void {
    this.#stopRequested = true;
  }

  /** Plays the next golden step (`step`) or the rest of the solution (`play`) of `levelId` (default: the running level). */
  async run(mode: ReplayMode, levelId?: number): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    this.#stopRequested = false;
    try {
      this.#status(await this.#run(mode, levelId));
    } catch (err) {
      this.#status(`error: ${String(err)}`);
    } finally {
      this.#running = false;
    }
  }

  async #run(mode: ReplayMode, levelId: number | undefined): Promise<string> {
    const id = levelId ?? this.#bridge.session()?.lvl.id;
    if (id === undefined) return 'open a level first';
    const golden = await loadGolden(id);
    if (!golden.ok) return golden.reason;
    const total = golden.log.length - 1;
    let done = this.#progress(id, golden.log);
    if (done === null) {
      const err = await this.#bridge.openLevel(id, true);
      if (err) return err;
      if (!(await this.#waitFor(() => this.#progress(id, golden.log) === 0, IDLE_TIMEOUT_MS)))
        return `level ${id} did not start`;
      done = 0;
    }
    while (done < total) {
      if (this.#stopRequested) return `L${id} golden: stopped at ${done}/${total}`;
      this.#status(`L${id} golden: step ${done + 1}/${total} …`);
      if (!(await this.#waitFor(() => this.#idle(), IDLE_TIMEOUT_MS)))
        return `L${id} golden: the board takes no input (window open?) before step ${done + 1}`;
      const session = this.#bridge.session();
      const action = golden.log[done + 1] as SessionAction;
      if (!session) return 'the level closed';
      if (action.kind !== 'drag') return `step ${done + 1}: only drag moves can be replayed (${action.kind})`;
      const err = await this.#drag(session, action);
      if (err) return `L${id} golden step ${done + 1}: ${err}`;
      done += 1;
      if (mode === 'step') break;
      await sleep(STEP_PAUSE_MS);
    }
    return `L${id} golden: ${done}/${total} played`;
  }

  /** Golden moves already played by the running attempt of `id` (null: none running, over, or off the solution). */
  #progress(id: number, golden: readonly SessionAction[]): number | null {
    const session = this.#bridge.session();
    if (!session || session.lvl.id !== id || session.outcome !== 'playing') return null;
    const n = goldenProgress(session.log, golden);
    return n === null ? null : n - 1;
  }

  /** The board takes input: an attempt is playing, no cue pending, no locked sequence, no window. */
  #idle(): boolean {
    const level = this.#bridge.levelScene();
    const session = level?.gameSession;
    if (!level || !session || session.outcome !== 'playing') return false;
    return level.openWindow === null && !level.eventPlayer.busy && !level.eventPlayer.locked;
  }

  async #waitFor(cond: () => boolean, timeoutMs: number): Promise<boolean> {
    const until = performance.now() + timeoutMs;
    while (!cond()) {
      if (this.#stopRequested || performance.now() > until) return false;
      await nextFrame();
    }
    return true;
  }

  /** One drag with the finger; null when the session committed exactly `move`. */
  async #drag(session: GameSession, move: DragMove): Promise<string | null> {
    const layout = this.#bridge.layout();
    const rules = levelHooks(session.lvl).drag ?? {};
    const res = planDrag(session.state, layout.grid, rules, move, TOKENS.drag.fingerOffsetCells, SUBSTEPS);
    if (!res.ok) return res.reason;
    const { plan } = res;
    const before = session.log.length;
    this.#fire('mousedown', plan.press, 1);
    await sleep(TOKENS.drag.holdMs + TOKENS.duration.fingerOffset + LIFT_MARGIN_MS);
    let last = plan.press;
    for (const p of plan.path) {
      this.#fire('mousemove', p, 1);
      last = p;
      for (let i = 0; i < FRAMES_PER_POINT; i++) await nextFrame();
    }
    await nextFrame();
    this.#fire('mouseup', last, 0);
    if (!(await this.#waitFor(() => session.log.length > before, COMMIT_TIMEOUT_MS)))
      return 'no move was committed (was the press taken by a window or a tutorial blocker?)';
    const got = session.log.at(-1);
    return sameAction(got, move)
      ? null
      : `committed ${JSON.stringify(got)} instead of ${JSON.stringify(move)}`;
  }

  #fire(type: 'mousedown' | 'mousemove' | 'mouseup', design: Point, buttons: number): void {
    const page = toPage(design, this.#bridge.mapping());
    this.#bridge.canvas.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: page.x - window.scrollX,
        clientY: page.y - window.scrollY,
        button: 0,
        buttons,
      }),
    );
  }
}
