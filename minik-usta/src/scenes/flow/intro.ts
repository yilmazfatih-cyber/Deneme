/**
 * The 3-panel intro timeline (UX_FLOWS §2, §2.1 "≤ 10 saniye ve ≤ 3 dokunuş"; STORY §4.0 `story.prologue`; D-018;
 * TECH_DESIGN §10.7 FTUE gate). Pure (no Phaser, the scene's clock is passed in):
 *
 * - each panel advances by itself after `duration.ftuePanelAuto` (1.8 s);
 * - a tap shows the next panel at once (3 taps at most finish the intro);
 * - "Geç" (`common.skip`) ends it with 1 tap;
 * - after the last panel the board comes in (`introToBoardMs` 0.4 s) and Level 1 starts; the first board fall is
 *   another 0.4 s, so the untouched path is 2.0 + 3 × 1.8 + 0.4 + 0.4 = 8.2 s (UX §2.1 table).
 */
import { TOKENS } from '../../theme/tokens.ts';
import { UI } from '../../ui/uiConstants.ts';

export const INTRO_PANELS = 3;

/** UX §2.1 step 1: launch animation + load budget (s → ms). */
export const FTUE_BOOT_MS = 2000;
/** UX §5.1 "ilk yükleme": blocks fall into place in 400 ms; input opens after it. */
export const FTUE_FIRST_FALL_MS = 400;

export class IntroTimeline {
  readonly panels: number;
  readonly autoMs: number;
  #panel = 0;
  #since = 0;
  #done = false;
  #taps = 0;

  constructor(panels: number = INTRO_PANELS, autoMs: number = TOKENS.duration.ftuePanelAuto) {
    if (!Number.isInteger(panels) || panels < 1) throw new RangeError(`IntroTimeline: ${panels} panels`);
    this.panels = panels;
    this.autoMs = autoMs;
  }

  /** Index of the panel on screen (0-based). */
  get panel(): number {
    return this.#panel;
  }

  get done(): boolean {
    return this.#done;
  }

  /** Taps the player used (panel taps + skip). */
  get taps(): number {
    return this.#taps;
  }

  start(now: number): void {
    this.#panel = 0;
    this.#since = now;
    this.#done = false;
    this.#taps = 0;
  }

  /** Auto-advance; returns true when the panel (or `done`) changed. */
  update(now: number): boolean {
    if (this.#done) return false;
    let changed = false;
    while (!this.#done && now - this.#since >= this.autoMs) {
      this.#since += this.autoMs;
      this.#advance();
      changed = true;
    }
    return changed;
  }

  /** A tap on the panel: the next one at once. */
  tap(now: number): void {
    if (this.#done) return;
    this.#taps += 1;
    this.#since = now;
    this.#advance();
  }

  /** "Geç": the intro ends. */
  skip(): void {
    if (this.#done) return;
    this.#taps += 1;
    this.#done = true;
  }

  #advance(): void {
    if (this.#panel + 1 >= this.panels) this.#done = true;
    else this.#panel += 1;
  }
}

/** UX §2.1: launch → Level 1 interactive without a touch (ms). */
export function ftueUntouchedMs(autoMs: number = TOKENS.duration.ftuePanelAuto): number {
  return FTUE_BOOT_MS + INTRO_PANELS * autoMs + UI.introToBoardMs + FTUE_FIRST_FALL_MS;
}
