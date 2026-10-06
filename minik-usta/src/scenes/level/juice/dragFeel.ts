/**
 * Drag feel signals (JUICE #3 follow, #4 sticky-follow contact; UX_FLOWS §5.3). Pure: from the drawn anchor of the
 * dragged block and the follow target (both in anchor cells, DragController) it derives the block's speed, a NEW
 * contact with an obstacle (the target pulls away from the drawn block), the push direction, the haptic throttle
 * (`JUICE_VIEW.bumpHapticMs`) and whether the dotted tether shows (separation > `drag.tetherMinCells` for longer than
 * `drag.tetherDelayMs`).
 */
import { TOKENS } from '../../../theme/tokens.ts';
import { JUICE_VIEW } from '../viewConstants.ts';

/** Separation (cells) above which the block counts as pressed against an obstacle. */
export const CONTACT_CELLS = 0.15;
/** Velocity smoothing (exponential, per sample). */
const SMOOTH = 0.5;

export interface FeelFrame {
  /** Horizontal speed (cells/s, signed) and speed (cells/s) of the drawn block. */
  readonly vx: number;
  readonly speed: number;
  /** A contact started this frame (#4 stretch, dust, sound). */
  readonly contact: boolean;
  /** The contact may vibrate (≤ 1 per `bumpHapticMs`). */
  readonly haptic: boolean;
  /** Unit push direction (screen: +x right, +y down). */
  readonly dirX: number;
  readonly dirY: number;
  /** Separation (cells). */
  readonly sep: number;
  /** The dotted tether shows. */
  readonly tether: boolean;
}

export class DragFeel {
  private lastAx = 0;
  private lastAy = 0;
  private lastT = 0;
  private vx = 0;
  private vy = 0;
  private inContact = false;
  private sepSince: number | null = null;
  private lastHaptic = -Infinity;
  private started = false;

  reset(now: number, ax: number, ay: number): void {
    this.lastAx = ax;
    this.lastAy = ay;
    this.lastT = now;
    this.vx = 0;
    this.vy = 0;
    this.inContact = false;
    this.sepSince = null;
    this.started = true;
  }

  step(now: number, ax: number, ay: number, px: number, py: number): FeelFrame {
    if (!this.started) this.reset(now, ax, ay);
    const dt = (now - this.lastT) / 1000;
    if (dt > 0) {
      this.vx = this.vx * (1 - SMOOTH) + ((ax - this.lastAx) / dt) * SMOOTH;
      this.vy = this.vy * (1 - SMOOTH) + ((ay - this.lastAy) / dt) * SMOOTH;
      this.lastAx = ax;
      this.lastAy = ay;
      this.lastT = now;
    }
    const dx = px - ax;
    const dy = py - ay;
    const sep = Math.hypot(dx, dy);
    const touching = sep > CONTACT_CELLS;
    const contact = touching && !this.inContact;
    this.inContact = touching;
    let haptic = false;
    if (contact && now - this.lastHaptic >= JUICE_VIEW.bumpHapticMs) {
      haptic = true;
      this.lastHaptic = now;
    }
    if (sep > TOKENS.drag.tetherMinCells) this.sepSince ??= now;
    else this.sepSince = null;
    const tether = this.sepSince !== null && now - this.sepSince > TOKENS.drag.tetherDelayMs;
    // anchor y grows upward; screen y grows downward
    const dirX = sep > 0 ? dx / sep : 0;
    const dirY = sep > 0 ? -dy / sep : 0;
    return { vx: this.vx, speed: Math.hypot(this.vx, this.vy), contact, haptic, dirX, dirY, sep, tether };
  }

  end(): void {
    this.started = false;
  }
}
