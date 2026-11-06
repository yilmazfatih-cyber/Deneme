/**
 * Board motion in anchor units (docs/TECH_DESIGN.md §6.3 "Sahne tarafı", §10.5; JUICE §0 rules 2–3, §0.1).
 *
 * Pure (no Phaser, no clock): the scene passes its own time. A `Track` is a list of legs a piece view travels in
 * continuous anchor coordinates (cells; the layout turns them into pixels, so a resize never breaks a running motion).
 * A `Timeline` holds the callbacks that follow the motions (site refresh after a landing, newly delivered pieces …).
 * R-12 fast-forward = evaluate every track at its end and run every pending callback now (`Timeline.flush`).
 *
 * Falls are not "ms per row": they accelerate up to a top speed from `tokens.physics` (normal `fallNormalAccel` /
 * `fallNormalMax`, yard and truck `yardFallAccel` / `yardFallMax`, low gravity constant `fallLowSpeed`), JUICE §0.1.
 */

/** Easing over normalised time u ∈ [0, 1] → progress (Phaser ease functions fit this signature). */
export type Ease = (u: number) => number;

export const linear: Ease = (u) => u;

/** A view's pose: continuous anchor (bottom-left of the piece box, board coordinates), scale, alpha. */
export interface Pose {
  readonly ax: number;
  readonly ay: number;
  readonly scale: number;
  readonly alpha: number;
}

/** Duration (ms) of a fall of `rows` cells: constant acceleration `accel` (cells/s²) up to `maxSpeed` (cells/s). */
export function fallDurationMs(rows: number, accel: number, maxSpeed: number): number {
  const d = Math.abs(rows);
  if (d === 0) return 0;
  if (!(accel > 0) || !(maxSpeed > 0)) throw new RangeError('fallDurationMs: accel and maxSpeed must be > 0');
  const t1 = maxSpeed / accel;
  const d1 = (maxSpeed * maxSpeed) / (2 * accel);
  const t = d <= d1 ? Math.sqrt((2 * d) / accel) : t1 + (d - d1) / maxSpeed;
  return t * 1000;
}

/** Cells fallen after `ms` with the same profile (not clamped to a distance). */
export function fallDistanceAt(ms: number, accel: number, maxSpeed: number): number {
  const t = Math.max(0, ms) / 1000;
  const t1 = maxSpeed / accel;
  if (t <= t1) return 0.5 * accel * t * t;
  return (maxSpeed * maxSpeed) / (2 * accel) + maxSpeed * (t - t1);
}

/** Duration and ease of an accelerated fall of `rows` cells (progress = distance fraction). */
export function fallLeg(rows: number, accel: number, maxSpeed: number): { ms: number; ease: Ease } {
  const d = Math.abs(rows);
  const ms = fallDurationMs(d, accel, maxSpeed);
  if (ms === 0) return { ms: 0, ease: linear };
  return { ms, ease: (u) => Math.min(1, fallDistanceAt(u * ms, accel, maxSpeed) / d) };
}

/** Duration of a constant-speed glide (low gravity, balloon). */
export function glideMs(rows: number, speed: number): number {
  if (!(speed > 0)) throw new RangeError('glideMs: speed must be > 0');
  return (Math.abs(rows) / speed) * 1000;
}

export interface LegSpec {
  readonly ax: number;
  readonly ay: number;
  readonly ms: number;
  readonly ease?: Ease;
  /** Peak height (cells, upward) of a parabolic arc over the leg (JUICE #8 cancel, #13 bounce). */
  readonly arc?: number;
  readonly scale?: number;
  readonly alpha?: number;
}

interface Leg {
  readonly from: Pose;
  readonly to: Pose;
  readonly start: number;
  readonly end: number;
  readonly ease: Ease;
  readonly arc: number;
}

/** Straight-line or arced legs, one after the other, from a start pose at a start time. */
export class Track {
  readonly start: number;
  private readonly legs: Leg[] = [];
  private last: Pose;
  private time: number;

  constructor(from: Pose, start: number) {
    this.start = start;
    this.last = from;
    this.time = start;
  }

  /** Appends a leg to `(ax, ay)`; scale and alpha keep their last value unless given. */
  to(spec: LegSpec): this {
    const ms = Math.max(0, spec.ms);
    const to: Pose = {
      ax: spec.ax,
      ay: spec.ay,
      scale: spec.scale ?? this.last.scale,
      alpha: spec.alpha ?? this.last.alpha,
    };
    this.legs.push({
      from: this.last,
      to,
      start: this.time,
      end: this.time + ms,
      ease: spec.ease ?? linear,
      arc: spec.arc ?? 0,
    });
    this.last = to;
    this.time += ms;
    return this;
  }

  /** Holds the last pose for `ms`. */
  wait(ms: number): this {
    return this.to({ ax: this.last.ax, ay: this.last.ay, ms });
  }

  /** Time the last leg ends. */
  get end(): number {
    return this.time;
  }

  /** Final pose. */
  get final(): Pose {
    return this.last;
  }

  /** Pose at time `now` (before the start: the start pose; after the end: the final pose). */
  at(now: number): Pose {
    if (this.legs.length === 0 || now >= this.time) return this.last;
    for (const leg of this.legs) {
      if (now >= leg.end) continue;
      if (now <= leg.start) return leg.from;
      const u = (now - leg.start) / (leg.end - leg.start);
      const k = leg.ease(u);
      const lift = leg.arc * 4 * u * (1 - u);
      return {
        ax: leg.from.ax + (leg.to.ax - leg.from.ax) * k,
        ay: leg.from.ay + (leg.to.ay - leg.from.ay) * k + lift,
        scale: leg.from.scale + (leg.to.scale - leg.from.scale) * k,
        alpha: leg.from.alpha + (leg.to.alpha - leg.from.alpha) * k,
      };
    }
    return this.last;
  }
}

/** Callbacks at scene times, run in time order (ties: insertion order). `flush` runs all of them now (R-12). */
export class Timeline {
  private items: { at: number; seq: number; fn: () => void }[] = [];
  private seq = 0;

  at(time: number, fn: () => void): void {
    this.items.push({ at: time, seq: this.seq++, fn });
    this.items.sort((a, b) => a.at - b.at || a.seq - b.seq);
  }

  /** Runs every callback due at `now`. A callback may schedule more (they run when due). */
  run(now: number): void {
    while (this.items.length > 0 && (this.items[0]?.at ?? Infinity) <= now) {
      const item = this.items.shift();
      item?.fn();
    }
  }

  /** Runs every pending callback in order, including ones scheduled while flushing. */
  flush(): void {
    while (this.items.length > 0) {
      const item = this.items.shift();
      item?.fn();
    }
  }

  clear(): void {
    this.items = [];
  }

  get pending(): number {
    return this.items.length;
  }
}
