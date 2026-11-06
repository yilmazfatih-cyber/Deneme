/**
 * Debug event log (docs/TECH_DESIGN.md §12.3 "Olay günlüğü (son 50 olay, adım numaralarıyla)"; R-20). Pure.
 *
 * Keeps the last `capacity` entries of the running attempt: one line per core event (`GameEvent`, TECH §6.3) with
 * its action number, K-35 step and sequence number, plus one line per action that emits nothing (undo, decline,
 * exit) or that the tap saw rejected.
 */
import type { GameEvent, SessionAction } from '../core/types.ts';
import type { TappedAction } from './sessionTap.ts';

export const EVENT_LOG_CAPACITY = 50;
/** Longest text of one entry (characters). */
export const ENTRY_TEXT_MAX = 140;

export interface LogEntry {
  /** Running number of the entry (never reused while the log lives). */
  readonly n: number;
  /** Action number in the attempt (`log` index; 0 = start). */
  readonly action: number;
  /** K-35 step; null for an action line. */
  readonly step: number | null;
  /** Event `seq` inside the move; null for an action line. */
  readonly seq: number | null;
  readonly text: string;
}

function compact(value: unknown): string {
  if (typeof value === 'string') return value;
  return (JSON.stringify(value) ?? String(value)).replace(/"/g, '');
}

function clip(text: string): string {
  return text.length <= ENTRY_TEXT_MAX ? text : `${text.slice(0, ENTRY_TEXT_MAX - 1)}…`;
}

/** `movesChanged movesLeft=7 delta=-1 reason=move cost={base:1,glass:0}` */
export function describeEvent(e: GameEvent): string {
  const parts: string[] = [e.t];
  for (const [key, value] of Object.entries(e)) {
    if (key === 't' || key === 'seq' || key === 'step' || value === undefined) continue;
    parts.push(`${key}=${compact(value)}`);
  }
  return clip(parts.join(' '));
}

/** `drag p3 → (6,8) FREE`, `drag p1 → (6,2) RAIL0`, `trowel seg0 (1,3)`, `+5 offerCoins`, `undo` … */
export function describeAction(a: TappedAction | SessionAction): string {
  switch (a.kind) {
    case 'drag': {
      const mode = a.to.mode === 0 ? 'FREE' : `RAIL${a.to.mode - 1}`;
      return clip(`drag p${a.pieceId} → (${a.to.ix},${a.to.iy}) ${mode}`);
    }
    case 'trowel':
      return `trowel seg${a.seg} (${a.x},${a.y})`;
    case 'addMoves':
      return `+${a.amount} ${a.source}`;
    case 'start':
      return clip(`start ${compact({ preBoosters: a.preBoosters, streakTier: a.streakTier })}`);
    default: {
      const { kind, ...rest } = a;
      return clip(Object.keys(rest).length > 0 ? `${kind} ${compact(rest)}` : kind);
    }
  }
}

export class EventLog {
  readonly capacity: number;
  #entries: LogEntry[] = [];
  #n = 0;

  constructor(capacity = EVENT_LOG_CAPACITY) {
    this.capacity = capacity;
  }

  /** A line for an action (`text` after the description, e.g. the result). */
  action(action: number, a: TappedAction, note = ''): void {
    this.#push({
      action,
      step: null,
      seq: null,
      text: clip(`${describeAction(a)}${note ? ` · ${note}` : ''}`),
    });
  }

  /** One line per event of action `action`. */
  events(action: number, events: readonly GameEvent[]): void {
    for (const e of events) this.#push({ action, step: e.step, seq: e.seq, text: describeEvent(e) });
  }

  /** A free text line (session start, replay). */
  note(action: number, text: string): void {
    this.#push({ action, step: null, seq: null, text: clip(text) });
  }

  /** Oldest first. */
  entries(): readonly LogEntry[] {
    return this.#entries;
  }

  clear(): void {
    this.#entries = [];
  }

  #push(e: Omit<LogEntry, 'n'>): void {
    this.#entries.push({ n: this.#n++, ...e });
    if (this.#entries.length > this.capacity) this.#entries.splice(0, this.#entries.length - this.capacity);
  }
}

/** One display line: `#3 s4.0 movesChanged …` (event) or `#3 · drag p0 → …` (action). */
export function formatEntry(e: LogEntry): string {
  const where = e.step === null ? '·' : `s${e.step}.${e.seq ?? 0}`;
  return `#${e.action} ${where} ${e.text}`;
}
