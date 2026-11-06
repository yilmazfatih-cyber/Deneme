/**
 * Small time-driven animations of the level screen (squash, flashes, HUD pops, crop sweeps …). Pure: no Phaser, no
 * clock — the scene passes its animation time to `run(now)` and every animation writes through its own `apply`
 * callback (TECH §10.6: no allocation per frame, no Graphics redraw; the callbacks only set transforms and alphas).
 *
 * R-12 / JUICE §0 rule 3: animations of class `board` jump to their last frame when the player grabs a block
 * (`finishBoard`), and are completed at once while the EventPlayer fast-forwards (`instantBoard`). Class `free`
 * animations (particles, sounds, the support hatch, HUD pulses, windows) keep their own pace.
 */
import type { Ease } from '../motion.ts';

export type FxClass = 'board' | 'free';

export interface FxSpec {
  /** Start time (scene animation clock, ms). Before it nothing is applied. */
  readonly start: number;
  readonly ms: number;
  readonly cls: FxClass;
  readonly ease?: Ease;
  /** Eased progress `k` and linear progress `u`, both 0 … 1. */
  apply(k: number, u: number): void;
  /** Called once after the final `apply(1, 1)`. */
  end?(): void;
  /**
   * Owner + channel: an animation replaces (finishes first) the running one with the same owner and channel, so two
   * squashes of one block never fight.
   */
  readonly owner?: object;
  readonly channel?: string;
}

const identity: Ease = (u) => u;

export class FxRunner {
  private items: FxSpec[] = [];
  /** While true, new `board` animations complete at once (EventPlayer fast-forward). */
  instantBoard = false;

  add(spec: FxSpec): void {
    if (spec.owner !== undefined && spec.channel !== undefined) {
      const i = this.items.findIndex((a) => a.owner === spec.owner && a.channel === spec.channel);
      if (i >= 0) {
        const old = this.items[i] as FxSpec;
        this.items.splice(i, 1);
        finish(old);
      }
    }
    if (spec.ms <= 0 || (this.instantBoard && spec.cls === 'board')) {
      finish(spec);
      return;
    }
    this.items.push(spec);
  }

  /** Applies every started animation at `now`; finished ones get their last frame and are removed. */
  run(now: number): void {
    if (this.items.length === 0) return;
    let w = 0;
    const items = this.items;
    const count = items.length;
    for (let r = 0; r < count; r++) {
      const a = items[r] as FxSpec;
      if (now < a.start) {
        items[w++] = a;
        continue;
      }
      const u = (now - a.start) / a.ms;
      if (u >= 1) {
        finish(a);
        continue;
      }
      a.apply((a.ease ?? identity)(u), u);
      items[w++] = a;
    }
    // animations added by an `end` callback during this pass were pushed after `count`
    for (let r = count; r < items.length; r++) items[w++] = items[r] as FxSpec;
    items.length = w;
  }

  /** R-12: every `board` animation jumps to its last frame. */
  finishBoard(): void {
    this.finishWhere((a) => a.cls === 'board');
  }

  /** Every animation of `owner` jumps to its last frame (a view goes back to its pool). */
  finishOwner(owner: object): void {
    this.finishWhere((a) => a.owner === owner);
  }

  finishAll(): void {
    this.finishWhere(() => true);
  }

  /** Drops everything without applying (level change: the targets are being released). */
  clear(): void {
    this.items = [];
  }

  get size(): number {
    return this.items.length;
  }

  /** Running `board` animations (tests, harness). */
  get boardCount(): number {
    return this.items.filter((a) => a.cls === 'board').length;
  }

  private finishWhere(match: (a: FxSpec) => boolean): void {
    // an `end` callback may add animations: loop until none matches
    for (let guard = 0; guard < 8; guard++) {
      const done = this.items.filter(match);
      if (done.length === 0) return;
      this.items = this.items.filter((a) => !match(a));
      for (const a of done) finish(a);
    }
  }
}

function finish(a: FxSpec): void {
  a.apply(1, 1);
  a.end?.();
}

/** 0 → peak → 0 over u (a flash). */
export function pulse01(u: number): number {
  return u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u);
}

/** `from` → `peak` → `rest` with the peak at `split` of the time (pops: 0,6 → 1,2 → 1,0). */
export function popCurve(u: number, from: number, peak: number, rest: number, split = 0.5): number {
  if (u <= 0) return from;
  if (u >= 1) return rest;
  if (u < split) return from + (peak - from) * (u / split);
  return peak + (rest - peak) * ((u - split) / (1 - split));
}
