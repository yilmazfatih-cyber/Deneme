/**
 * Platform adapter (docs/TECH_DESIGN.md §1.2, §11.1, §13). Web MVP today; Capacitor (Faz 5) plugs in here without the
 * game code changing.
 *
 * - `detectPlatform()` → ANALYTICS §3 `platform` (`'web' | 'android' | 'ios'`).
 * - `appVersion()` → ANALYTICS §3 `appVersion`.
 * - `onAppHidden()` → the lifecycle moments that must save at once (TECH §11.1: `visibilitychange: hidden`, `pagehide`;
 *   Capacitor `pause` in Faz 5), used by the save service after `GameSession.flushPending()` (§4.7 rule (5));
 *   `onAppVisible()` → back in the foreground (a new analytics session, audio resumes).
 * - `userActivation()` → whether the page has had a user gesture (Web Audio start, `navigator.vibrate`).
 */

export type Platform = 'web' | 'android' | 'ios';

interface CapacitorLike {
  getPlatform?: () => string;
}

/** Reads `globalThis.Capacitor.getPlatform()` when the native shell is present; the web build answers `'web'`. */
export function detectPlatform(g: unknown = globalThis): Platform {
  const cap = (g as { Capacitor?: CapacitorLike }).Capacitor;
  const name = cap?.getPlatform?.();
  return name === 'android' || name === 'ios' ? name : 'web';
}

/** Build version (`VITE_APP_VERSION` when the build defines it, else `'dev'`). */
export function appVersion(): string {
  const v = (import.meta.env as Record<string, unknown>)['VITE_APP_VERSION'];
  return typeof v === 'string' && v.length > 0 ? v : 'dev';
}

/** `true` in the Vite development server (debug-only behaviour, R-20). */
export function isDev(): boolean {
  return import.meta.env.DEV === true;
}

export interface LifecycleTarget {
  readonly document?: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>;
  readonly window?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}

/**
 * Calls `handler` when the app is hidden or the page is being unloaded (`visibilitychange` → `hidden`, `pagehide`).
 * Returns the unsubscribe function. Both events may fire for one exit; the handler must be idempotent.
 */
export function onAppHidden(
  handler: () => void,
  target: LifecycleTarget = defaultLifecycleTarget(),
): () => void {
  const doc = target.document;
  const win = target.window;
  const onVisibility = (): void => {
    if (doc?.visibilityState === 'hidden') handler();
  };
  const onPageHide = (): void => handler();
  doc?.addEventListener('visibilitychange', onVisibility);
  win?.addEventListener('pagehide', onPageHide);
  return () => {
    doc?.removeEventListener('visibilitychange', onVisibility);
    win?.removeEventListener('pagehide', onPageHide);
  };
}

/**
 * Calls `handler` when the app comes back to the foreground (`visibilitychange` → `visible`, `pageshow` from the
 * back/forward cache). Returns the unsubscribe function; the handler must be idempotent.
 */
export function onAppVisible(
  handler: () => void,
  target: LifecycleTarget = defaultLifecycleTarget(),
): () => void {
  const doc = target.document;
  const win = target.window;
  const onVisibility = (): void => {
    if (doc?.visibilityState === 'visible') handler();
  };
  const onPageShow = (): void => handler();
  doc?.addEventListener('visibilitychange', onVisibility);
  win?.addEventListener('pageshow', onPageShow);
  return () => {
    doc?.removeEventListener('visibilitychange', onVisibility);
    win?.removeEventListener('pageshow', onPageShow);
  };
}

/** HTML user activation: `navigator.userActivation` where the browser has it (Chrome 72+, Safari 16.4+), else null. */
export interface UserActivationLike {
  readonly isActive: boolean;
  readonly hasBeenActive: boolean;
}

export function userActivation(g: unknown = globalThis): UserActivationLike | null {
  const ua = (g as { navigator?: { userActivation?: UserActivationLike } }).navigator?.userActivation;
  return ua ?? null;
}

function defaultLifecycleTarget(): LifecycleTarget {
  return {
    ...(typeof document === 'undefined' ? {} : { document }),
    ...(typeof window === 'undefined' ? {} : { window }),
  };
}

/** A random identifier (analytics id, install id, attempt id): `crypto.randomUUID` when available. */
export function randomId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID !== undefined) return c.randomUUID();
  const hex = (n: number): string =>
    Math.floor(Math.random() * 16 ** n)
      .toString(16)
      .padStart(n, '0');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${hex(4)}-${hex(12)}`;
}
