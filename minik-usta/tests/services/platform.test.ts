import { describe, expect, it } from 'vitest';
import { TOKENS } from '../../src/theme/tokens.ts';
import { FakeClock, localDayKey, monotonicNow, systemClock } from '../../src/services/clock.ts';
import { HAPTIC_NAMES, createWebHaptics } from '../../src/services/haptics.ts';
import {
  appVersion,
  detectPlatform,
  onAppHidden,
  onAppVisible,
  randomId,
  userActivation,
} from '../../src/services/platform.ts';
import type { LifecycleTarget } from '../../src/services/platform.ts';

describe('clock (TECH 11)', () => {
  it('TECH 11 FakeClock runs due timers in time order only on advance', () => {
    const c = new FakeClock(100);
    const log: string[] = [];
    c.setTimeout(() => log.push(`b@${c.now()}`), 20);
    const cancelled = c.setTimeout(() => log.push('x'), 10);
    c.setTimeout(() => {
      log.push(`a@${c.now()}`);
      c.setTimeout(() => log.push(`c@${c.now()}`), 5);
    }, 10);
    c.clearTimeout(cancelled);
    expect(log).toEqual([]);
    c.advance(19);
    expect(log).toEqual(['a@110', 'c@115']);
    c.advance(1);
    expect(log).toEqual(['a@110', 'c@115', 'b@120']);
    expect(c.now()).toBe(120);
    expect(c.pendingTimers).toBe(0);
  });

  it('TECH 11.2 time frozen at lastSeenNow when the clock goes back; local day key', () => {
    expect(monotonicNow(1000, 2000)).toBe(2000);
    expect(monotonicNow(3000, 2000)).toBe(3000);
    expect(localDayKey(new Date(2026, 9, 6, 23, 59).getTime())).toBe('2026-10-06');
    expect(localDayKey(new Date(2026, 0, 2, 0, 0).getTime())).toBe('2026-01-02');
    expect(Math.abs(systemClock.now() - Date.now())).toBeLessThan(1000);
  });
});

describe('platform (TECH 11.1, ANALYTICS §3)', () => {
  it('ANALYTICS §3 platform is web unless the Capacitor shell says android or ios', () => {
    expect(detectPlatform({})).toBe('web');
    expect(detectPlatform({ Capacitor: { getPlatform: () => 'android' } })).toBe('android');
    expect(detectPlatform({ Capacitor: { getPlatform: () => 'ios' } })).toBe('ios');
    expect(detectPlatform({ Capacitor: { getPlatform: () => 'web' } })).toBe('web');
    expect(appVersion()).toMatch(/\S/);
    expect(randomId()).not.toBe(randomId());
  });

  it('TECH 11.1 onAppHidden fires on visibilitychange→hidden and pagehide, and unsubscribes', () => {
    const listeners = new Map<string, () => void>();
    let visibility: DocumentVisibilityState = 'visible';
    const target = {
      document: {
        get visibilityState() {
          return visibility;
        },
        addEventListener: (type: string, fn: () => void) => listeners.set(`doc:${type}`, fn),
        removeEventListener: (type: string) => listeners.delete(`doc:${type}`),
      },
      window: {
        addEventListener: (type: string, fn: () => void) => listeners.set(`win:${type}`, fn),
        removeEventListener: (type: string) => listeners.delete(`win:${type}`),
      },
    } as unknown as LifecycleTarget;
    let calls = 0;
    const off = onAppHidden(() => calls++, target);
    listeners.get('doc:visibilitychange')?.();
    expect(calls).toBe(0);
    visibility = 'hidden';
    listeners.get('doc:visibilitychange')?.();
    listeners.get('win:pagehide')?.();
    expect(calls).toBe(2);
    off();
    expect(listeners.size).toBe(0);
  });
});

describe('haptics (TECH 11.7)', () => {
  it('TECH 11.7 haptics play the tokens.haptic patterns through vibrate', () => {
    expect(HAPTIC_NAMES).toEqual(['light', 'medium', 'heavy', 'doubleLight', 'success', 'win']);
    const calls: (number | number[])[] = [];
    const h = createWebHaptics({ vibrate: (p) => (calls.push(p), true) });
    h.play('light');
    h.play('win');
    expect(calls).toEqual([TOKENS.haptic.light, [...TOKENS.haptic.win]]);
  });

  it('TECH 11.7 Settings switch turns haptics off; no Vibration API (iOS web) and throwing vibrate are no-ops', () => {
    const calls: unknown[] = [];
    const h = createWebHaptics({ vibrate: (p) => (calls.push(p), true), enabled: false });
    h.play('heavy');
    expect(calls).toEqual([]);
    h.setEnabled(true);
    h.play('heavy');
    expect(calls).toEqual([TOKENS.haptic.heavy]);
    expect(h.enabled).toBe(true);
    expect(() => createWebHaptics({ vibrate: null }).play('success')).not.toThrow();
    const throwing = createWebHaptics({
      vibrate: () => {
        throw new Error('no user gesture');
      },
    });
    expect(() => throwing.play('medium')).not.toThrow();
    expect(() => createWebHaptics().play('light')).not.toThrow(); // Node: no navigator.vibrate
  });
});

describe('platform lifecycle and user activation (TECH 11.1, 11.6, 11.7)', () => {
  function target() {
    const listeners = new Map<string, Set<() => void>>();
    const on = (t: string, fn: () => void): void =>
      void listeners.set(t, (listeners.get(t) ?? new Set()).add(fn));
    const off = (t: string, fn: () => void): void => void listeners.get(t)?.delete(fn);
    const fire = (t: string): void => {
      for (const fn of [...(listeners.get(t) ?? [])]) fn();
    };
    const doc = {
      visibilityState: 'visible' as DocumentVisibilityState,
      addEventListener: on,
      removeEventListener: off,
    };
    const win = { addEventListener: on, removeEventListener: off };
    return { doc, win, fire, size: () => [...listeners.values()].reduce((n, s) => n + s.size, 0) };
  }

  it('TECH 11.1 onAppVisible fires on visibilitychange → visible and on pageshow; unsubscribe removes both', () => {
    const t = target();
    let n = 0;
    const off = onAppVisible(() => n++, { document: t.doc, window: t.win } as unknown as LifecycleTarget);
    t.doc.visibilityState = 'hidden';
    t.fire('visibilitychange');
    expect(n).toBe(0);
    t.doc.visibilityState = 'visible';
    t.fire('visibilitychange');
    t.fire('pageshow');
    expect(n).toBe(2);
    off();
    expect(t.size()).toBe(0);
  });

  it('TECH 11.7 haptics send nothing before the first user gesture (Chrome blocks and logs vibrate)', () => {
    const calls: unknown[] = [];
    let active = false;
    const h = createWebHaptics({ vibrate: (p) => (calls.push(p), true), activated: () => active });
    h.play('light');
    expect(calls).toEqual([]);
    active = true;
    h.play('light');
    expect(calls).toEqual([TOKENS.haptic.light]);
  });

  it('TECH 11.6 userActivation reads navigator.userActivation, null when the browser has none', () => {
    expect(userActivation({ navigator: {} })).toBeNull();
    const ua = { isActive: true, hasBeenActive: true };
    expect(userActivation({ navigator: { userActivation: ua } })).toBe(ua);
  });
});
