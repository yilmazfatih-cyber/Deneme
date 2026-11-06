/**
 * Time sources (docs/TECH_DESIGN.md §11). `meta/` is pure and takes time only through `Clock` (`now()` in ms); services
 * take a `Scheduler` for delayed work (save coalescing, §11.1). Tests use `FakeClock`, which is both and runs its timers
 * only when `advance()` is called — can regen, event windows and the save debounce become deterministic.
 */

export interface Clock {
  /** Wall-clock milliseconds since the Unix epoch. */
  now(): number;
}

export type TimerHandle = number;

export interface Scheduler {
  setTimeout(fn: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

export const systemClock: Clock = { now: () => Date.now() };

export const systemScheduler: Scheduler = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms) as unknown as TimerHandle,
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
};

/**
 * "Time never runs backwards" guard (TECH §11.2, §11.3): when the device clock was set back (`now < lastSeenNow`),
 * time-based counters stay frozen at `lastSeenNow`.
 */
export function monotonicNow(now: number, lastSeenNow: number): number {
  return now < lastSeenNow ? lastSeenNow : now;
}

/** Local calendar day key `YYYY-MM-DD` ("gün" = the device's local calendar day, TECH §11.3). */
export function localDayKey(ms: number): string {
  const d = new Date(ms);
  const p2 = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

interface FakeTimer {
  readonly id: TimerHandle;
  readonly at: number;
  readonly fn: () => void;
}

/** Deterministic clock + scheduler for tests. Timers fire in (time, creation) order during `advance`. */
export class FakeClock implements Clock, Scheduler {
  #now: number;
  #nextId = 1;
  #timers: FakeTimer[] = [];

  constructor(startMs = 0) {
    this.#now = startMs;
  }

  now(): number {
    return this.#now;
  }

  /** Sets the time without running timers (for example a clock set back by the user). */
  set(ms: number): void {
    this.#now = ms;
  }

  setTimeout(fn: () => void, ms: number): TimerHandle {
    const id = this.#nextId++;
    this.#timers.push({ id, at: this.#now + Math.max(0, ms), fn });
    return id;
  }

  clearTimeout(handle: TimerHandle): void {
    this.#timers = this.#timers.filter((t) => t.id !== handle);
  }

  /** Moves time forward by `ms`, running every timer that becomes due. */
  advance(ms: number): void {
    const end = this.#now + ms;
    for (;;) {
      const due = this.#timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (due === undefined) break;
      this.#timers = this.#timers.filter((t) => t.id !== due.id);
      this.#now = Math.max(this.#now, due.at);
      due.fn();
    }
    this.#now = end;
  }

  get pendingTimers(): number {
    return this.#timers.length;
  }
}
