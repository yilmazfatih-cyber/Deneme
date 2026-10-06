/**
 * Cue playback of the EventPlayer (docs/TECH_DESIGN.md §6.3 "Sahne tarafı" and "Animasyon sırasında girdi"; JUICE §0
 * rules 3 and 10; D-021 / R-12). Pure: the scene passes its animation time.
 *
 * - `schedule(cues, now)`: cues carry offsets (`at`) from the start of a move; they run in time order (ties: insertion).
 * - Lock windows: a cue with `lock` (segment slide, truck delivery, level end) closes board input for `[t, t + ms)`.
 * - `fastForward(now)` (a grab, R-12): every cue BEFORE the next lock window runs at once with `instant = true` (the
 *   caller completes board motions); the rest of the schedule moves earlier so the lock window starts now. Inside a
 *   lock window nothing is skipped: the board stays locked.
 * - `speedUp(now)`: a touch during a lock window plays it 3× faster (`rate`); the rate falls back to 1 when the window
 *   ends. The scene's animation clock advances by `delta · rate`.
 */

export interface TimedCue {
  /** Offset from the start of its move (ms). */
  readonly at: number;
  readonly ms: number;
  readonly lock: boolean;
}

/** JUICE §0 rule 3: "bu dizilerde dokunuş oynatmayı 3× hızlandırır". */
export const LOCK_SPEEDUP = 3;

interface Entry<C> {
  t: number;
  readonly seq: number;
  readonly cue: C;
}

interface Window {
  from: number;
  to: number;
}

export class Playback<C extends TimedCue> {
  private queue: Entry<C>[] = [];
  private windows: Window[] = [];
  private seq = 0;
  private spedUp = false;
  private readonly runCue: (cue: C, time: number, instant: boolean) => void;

  /** `runCue(cue, time, instant)`: `time` is the cue's scheduled (absolute) start. */
  constructor(runCue: (cue: C, time: number, instant: boolean) => void) {
    this.runCue = runCue;
  }

  schedule(cues: readonly C[], now: number): void {
    for (const cue of cues) {
      const t = now + cue.at;
      this.queue.push({ t, seq: this.seq++, cue });
      if (cue.lock && cue.ms > 0) this.windows.push({ from: t, to: t + cue.ms });
    }
    this.queue.sort((a, b) => a.t - b.t || a.seq - b.seq);
    this.windows.sort((a, b) => a.from - b.from);
  }

  /** Runs every cue due at `now` (cues scheduled by a running cue run when due, in the same pass if already due). */
  advance(now: number): void {
    while (this.queue.length > 0 && (this.queue[0] as Entry<C>).t <= now) {
      const e = this.queue.shift() as Entry<C>;
      this.runCue(e.cue, e.t, false);
    }
    this.pruneWindows(now);
  }

  /** True while a lock window holds `now`. */
  locked(now: number): boolean {
    return this.windows.some((w) => w.from <= now && now < w.to);
  }

  /** End of the lock window holding `now` (or `now`). */
  lockEnd(now: number): number {
    let end = now;
    for (const w of this.windows) if (w.from <= now && now < w.to) end = Math.max(end, w.to);
    return end;
  }

  /** R-12: unlocked cues before the next lock window run now (instant); the rest of the schedule moves to `now`. */
  fastForward(now: number): void {
    if (this.locked(now)) return;
    const next = this.windows.find((w) => w.from > now);
    const limit = next ? next.from : Infinity;
    while (this.queue.length > 0 && (this.queue[0] as Entry<C>).t < limit) {
      const e = this.queue.shift() as Entry<C>;
      this.runCue(e.cue, Math.min(e.t, now), true);
    }
    if (next) {
      const shift = next.from - now;
      for (const e of this.queue) e.t -= shift;
      for (const w of this.windows) {
        if (w.from >= next.from) {
          w.from -= shift;
          w.to -= shift;
        }
      }
    }
    this.pruneWindows(now);
  }

  /** A touch during a lock window: the rest of it plays `LOCK_SPEEDUP`× faster. */
  speedUp(now: number): void {
    if (this.locked(now)) this.spedUp = true;
  }

  /** Clock rate for the frame starting at `now`. */
  rate(now: number): number {
    if (!this.spedUp) return 1;
    if (this.locked(now)) return LOCK_SPEEDUP;
    this.spedUp = false;
    return 1;
  }

  /** Runs every remaining cue at once (level change, debug "skip"). */
  flush(now: number): void {
    while (this.queue.length > 0) {
      const e = this.queue.shift() as Entry<C>;
      this.runCue(e.cue, Math.min(e.t, now), true);
    }
    this.windows = [];
    this.spedUp = false;
  }

  /** Drops everything without running it. */
  clear(): void {
    this.queue = [];
    this.windows = [];
    this.spedUp = false;
  }

  get pending(): number {
    return this.queue.length;
  }

  /** Time the last scheduled cue starts (or `now`). */
  lastStart(now: number): number {
    const last = this.queue[this.queue.length - 1];
    return last ? Math.max(now, last.t) : now;
  }

  private pruneWindows(now: number): void {
    if (this.windows.length > 0) this.windows = this.windows.filter((w) => w.to > now);
  }
}
