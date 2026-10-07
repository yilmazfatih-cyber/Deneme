/**
 * Frame statistics of the debug FPS meter (docs/TECH_DESIGN.md §12.3 "FPS ve kare süresi grafiği", §10.6 frame budget
 * 16.7 ms; R-20). Pure: the panel feeds it the `requestAnimationFrame` intervals.
 */

/** 60 FPS frame budget (TECH §10.6). */
export const FRAME_BUDGET_MS = 1000 / 60;
/** Frames kept for the graph. */
export const FRAME_HISTORY = 120;
/** Frames averaged for the FPS figure (≈ 1 s at 60 FPS). */
export const FPS_WINDOW = 60;
/** An interval longer than this is a pause (tab hidden, debugger), not a frame: it is dropped. */
export const MAX_FRAME_MS = 1000;

export class FrameStats {
  readonly capacity: number;
  #ms: number[] = [];

  constructor(capacity = FRAME_HISTORY) {
    this.capacity = capacity;
  }

  /** One frame interval (ms); non-positive and pause-length intervals are ignored. */
  push(dtMs: number): void {
    if (!(dtMs > 0) || dtMs > MAX_FRAME_MS) return;
    this.#ms.push(dtMs);
    if (this.#ms.length > this.capacity) this.#ms.splice(0, this.#ms.length - this.capacity);
  }

  #window(): number[] {
    return this.#ms.slice(-FPS_WINDOW);
  }

  /** Frames per second over the last `FPS_WINDOW` frames (0 before the first frame). */
  get fps(): number {
    const w = this.#window();
    const sum = w.reduce((a, b) => a + b, 0);
    return sum > 0 ? (1000 * w.length) / sum : 0;
  }

  /** Longest frame of the last `FPS_WINDOW` frames (ms). */
  get worstMs(): number {
    return this.#window().reduce((a, b) => Math.max(a, b), 0);
  }

  /** Frames of the last `FPS_WINDOW` over the 60 FPS budget (with 1 ms tolerance for timer jitter). */
  get slowFrames(): number {
    return this.#window().filter((ms) => ms > FRAME_BUDGET_MS + 1).length;
  }

  /** Intervals, oldest first (graph). */
  history(): readonly number[] {
    return this.#ms;
  }

  clear(): void {
    this.#ms = [];
  }
}
