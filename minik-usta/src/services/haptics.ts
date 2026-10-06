/**
 * Haptics (docs/TECH_DESIGN.md §11.7; JUICE §0.7). Pattern values come only from `tokens.haptic` (design-lead, D-003).
 *
 * Web: `navigator.vibrate(pattern)`. Verified support (TECH §0): Chrome Android 32+ (user gesture required since
 * Chrome 60), Firefox Android accepts the call but does not vibrate, Safari / iOS Safari have no Vibration API → no-op.
 * Capacitor (Faz 5): `@capacitor/haptics` behind the same interface. Only the Settings "vibration" switch turns haptics
 * off; "reduce motion" does not.
 */
import { TOKENS } from '../theme/tokens.ts';
import type { Tokens } from '../theme/tokens.ts';

/** = `tokens.haptic` keys. */
export type HapticName = keyof Tokens['haptic'];
export const HAPTIC_NAMES = Object.keys(TOKENS.haptic) as HapticName[];

export interface Haptics {
  play(name: HapticName): void;
  setEnabled(enabled: boolean): void;
  readonly enabled: boolean;
}

export type VibrateFn = (pattern: number | number[]) => boolean;

export interface WebHapticsOptions {
  /** Defaults to `navigator.vibrate` when present; `null` = no Vibration API (iOS web). */
  readonly vibrate?: VibrateFn | null;
  readonly patterns?: Tokens['haptic'];
  readonly enabled?: boolean;
}

function navigatorVibrate(): VibrateFn | null {
  const nav = (globalThis as { navigator?: { vibrate?: VibrateFn } }).navigator;
  const fn = nav?.vibrate;
  if (nav === undefined || typeof fn !== 'function') return null;
  return (pattern) => fn.call(nav, pattern);
}

export function createWebHaptics(opts: WebHapticsOptions = {}): Haptics {
  const vibrate = opts.vibrate === undefined ? navigatorVibrate() : opts.vibrate;
  const patterns = opts.patterns ?? TOKENS.haptic;
  let enabled = opts.enabled ?? true;
  return {
    play(name) {
      if (!enabled || vibrate === null) return;
      const p = patterns[name];
      try {
        vibrate(typeof p === 'number' ? p : [...p]);
      } catch {
        // Some browsers throw instead of returning false (no user gesture yet); haptics are decoration.
      }
    },
    setEnabled(on) {
      enabled = on;
    },
    get enabled() {
      return enabled;
    },
  };
}
