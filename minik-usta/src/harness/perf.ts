/**
 * In-page frame sampler (`window.__perf` in docs/TECH_DESIGN.md §10.7 item 5; read through `__harness.perf*`).
 *
 * Per rendered frame (Phaser `POST_RENDER`):
 * - rAF interval (`game.loop.now` = the frame's rAF time): the frame rate the page shows, GPU / compositor share
 *   included — in a headless run that is SwiftShader, an indicator only (TECH §10.7 item 7);
 * - CPU side = the game's main-thread JS of the frame: the touch handlers dispatched since the previous frame
 *   (window capture → window bubble; DragController follows and moves the block inside them, TECH §4.6) + Phaser's
 *   step from `PRE_STEP` to `POST_RENDER` (scene updates, tweens, EventPlayer, render command submission). Waits for
 *   the GPU process before the frame starts are not in it; `work` (rAF time → `POST_RENDER`) keeps them for reference;
 * - Phaser step split: `PRE_STEP → PRE_RENDER` (update) and `PRE_RENDER → POST_RENDER` (render calls);
 * - input latency (TECH §10.7 item 5): from the touch move whose handler wrote the dragged block's new pose
 *   (`DRAG_DRAWN_EVENT`, DragController) to the `POST_RENDER` of the frame that draws it — in ms and in rendered
 *   frames (1 = drawn by the next frame).
 * `long-animation-frame` entries come from a PerformanceObserver (Chromium 123+), when available.
 *
 * Samples go into named buckets; recording can stop and start again into the same bucket (e.g. every drag of a run
 * into `drag`); intervals are only taken between frames of one recording window.
 */
import Phaser from 'phaser';
import { DRAG_DRAWN_EVENT } from '../scenes/level/DragController.ts';
import type { PerfStats } from './api.ts';

const VSYNC_MS = 1000 / 60;
const TOUCH_EVENTS = ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const;

interface Bucket {
  frames: number;
  readonly intervals: number[];
  readonly work: number[];
  readonly cpu: number[];
  readonly update: number[];
  readonly render: number[];
  readonly input: number[];
  readonly inputFrames: number[];
  readonly long: number[];
  /** Breakdown of the frame with the longest CPU side (diagnostics of `cpuMax`). */
  worst: PerfStats['cpuMaxFrame'];
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i] ?? 0;
}

const round = (v: number, d = 2): number => Math.round(v * 10 ** d) / 10 ** d;
const sum = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0);
const sorted = (v: readonly number[]): number[] => [...v].sort((a, b) => a - b);

export class PerfSampler {
  private readonly buckets = new Map<string, Bucket>();
  private active: Bucket | null = null;
  /** rAF time of the previous recorded frame of the current window (null at a window start). */
  private prevTs: number | null = null;
  /** Poses written by touch moves, waiting for the frame that draws them: event time and the frame count then. */
  private pendingDrawn: { readonly eventTs: number; readonly seq: number }[] = [];
  /** Rendered frames since the sampler started (every POST_RENDER, recording or not). */
  private frameSeq = 0;
  private preStep = 0;
  private preRender = 0;
  private handlerStart = 0;
  private handlerMs = 0;
  /** Touch event types dispatched since the previous frame (diagnostics). */
  private handlerTypes = new Set<string>();
  /** Recorded frames since the current recording window started. */
  private windowFrame = 0;

  constructor(game: Phaser.Game) {
    game.events.on(Phaser.Core.Events.PRE_STEP, () => {
      this.preStep = performance.now();
    });
    game.events.on(Phaser.Core.Events.PRE_RENDER, () => {
      this.preRender = performance.now();
    });
    game.events.on(Phaser.Core.Events.POST_RENDER, () => this.frame(game.loop.now));
    for (const type of TOUCH_EVENTS) {
      window.addEventListener(
        type,
        () => {
          this.handlerStart = performance.now();
          this.handlerTypes.add(type);
        },
        { capture: true, passive: true },
      );
      window.addEventListener(
        type,
        () => {
          this.handlerMs += performance.now() - this.handlerStart;
        },
        { passive: true },
      );
    }
    game.events.on(DRAG_DRAWN_EVENT, (eventTs: number | null) => {
      if (this.active) this.pendingDrawn.push({ eventTs: eventTs ?? performance.now(), seq: this.frameSeq });
    });
    try {
      const obs = new PerformanceObserver((list) => {
        const b = this.active;
        if (!b) return;
        for (const e of list.getEntries()) b.long.push(e.duration);
      });
      obs.observe({ type: 'long-animation-frame', buffered: false });
    } catch {
      // long-animation-frame is Chromium 123+; the other numbers do not need it
    }
  }

  /** Starts (or continues) recording into `label`. */
  start(label: string): void {
    let b = this.buckets.get(label);
    if (!b) {
      b = {
        frames: 0,
        intervals: [],
        work: [],
        cpu: [],
        update: [],
        render: [],
        input: [],
        inputFrames: [],
        long: [],
        worst: null,
      };
      this.buckets.set(label, b);
    }
    this.active = b;
    this.prevTs = null;
    this.pendingDrawn = [];
    this.handlerMs = 0;
    this.handlerTypes.clear();
    this.windowFrame = 0;
  }

  stop(): void {
    this.active = null;
    this.prevTs = null;
  }

  /** Statistics of a bucket (null: fewer than two frames recorded). */
  stats(label: string): PerfStats | null {
    const b = this.buckets.get(label);
    if (!b || b.intervals.length === 0 || b.cpu.length === 0) return null;
    const iv = sorted(b.intervals);
    const work = sorted(b.work);
    const cpu = sorted(b.cpu);
    const input = sorted(b.input);
    const inputFrames = sorted(b.inputFrames);
    const update = sorted(b.update);
    const render = sorted(b.render);
    const durationMs = sum(b.intervals);
    const budget = b.cpu.reduce((a, w) => a + Math.max(w, VSYNC_MS), 0) / b.cpu.length;
    return {
      label,
      frames: b.frames,
      durationMs: round(durationMs, 1),
      fps: round((b.intervals.length * 1000) / Math.max(1, durationMs), 1),
      intervalP50: round(quantile(iv, 0.5)),
      intervalP95: round(quantile(iv, 0.95)),
      intervalP99: round(quantile(iv, 0.99)),
      over20Ratio: round(b.intervals.filter((v) => v > 20).length / b.intervals.length, 3),
      over50: b.intervals.filter((v) => v > 50).length,
      workP50: round(quantile(work, 0.5)),
      workP95: round(quantile(work, 0.95)),
      cpuP50: round(quantile(cpu, 0.5)),
      cpuP95: round(quantile(cpu, 0.95)),
      cpuMax: round(cpu[cpu.length - 1] ?? 0),
      cpuOver50: b.cpu.filter((v) => v > 50).length,
      cpuFps: round(1000 / budget, 1),
      updateP50: round(quantile(update, 0.5)),
      updateP95: round(quantile(update, 0.95)),
      renderP50: round(quantile(render, 0.5)),
      renderP95: round(quantile(render, 0.95)),
      inputSamples: input.length,
      inputP50: round(quantile(input, 0.5)),
      inputP95: round(quantile(input, 0.95)),
      inputFramesP95: quantile(inputFrames, 0.95),
      inputFramesMax: inputFrames[inputFrames.length - 1] ?? 0,
      longFrames: b.long.length,
      longestFrameMs: round(Math.max(0, ...b.long), 1),
      cpuMaxFrame: b.worst,
    };
  }

  reset(): void {
    this.buckets.clear();
    this.stop();
  }

  private frame(rafTime: number): void {
    const handlers = this.handlerMs;
    this.handlerMs = 0;
    const touches = this.handlerTypes.size > 0 ? [...this.handlerTypes].join('+') : '';
    this.handlerTypes.clear();
    this.frameSeq += 1;
    const b = this.active;
    if (!b) return;
    const now = performance.now();
    b.frames += 1;
    this.windowFrame += 1;
    if (this.prevTs !== null) b.intervals.push(rafTime - this.prevTs);
    this.prevTs = rafTime;
    const cpu = handlers + Math.max(0, now - this.preStep);
    const update = Math.max(0, this.preRender - this.preStep);
    const render = Math.max(0, now - this.preRender);
    b.work.push(Math.max(0, now - rafTime));
    b.cpu.push(cpu);
    b.update.push(update);
    b.render.push(render);
    if (b.worst === null || cpu > b.worst.cpuMs)
      b.worst = {
        cpuMs: round(cpu),
        handlersMs: round(handlers),
        updateMs: round(update),
        renderMs: round(render),
        touches,
        frameInWindow: this.windowFrame,
      };
    for (const d of this.pendingDrawn) {
      b.input.push(Math.max(0, now - d.eventTs));
      b.inputFrames.push(this.frameSeq - d.seq);
    }
    this.pendingDrawn.length = 0;
  }
}
