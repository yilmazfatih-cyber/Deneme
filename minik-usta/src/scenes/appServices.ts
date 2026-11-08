/**
 * Game-wide save + analytics instances the scenes share (TECH_DESIGN §11.1 save, §11.4 analytics; ANALYTICS §3 common
 * parameters). Created once per page, lazily, on first use:
 *
 * - `appSave()`: `SaveService.open` over `browserStore()` (localStorage, in-memory fallback), the system clock and
 *   scheduler, `config/economy.json → startingWallet`; a new save starts "reduce motion" from the OS preference (UX §11).
 *   Its lifecycle writes (`visibilitychange: hidden`, `pagehide`) are attached at once.
 * - `appTrack`: validated analytics events into the local ring buffer (console in development); the §3 common
 *   parameters are read from the save at every event. Events sent while the save is still opening (`save_corrupt`)
 *   wait until it is ready, so they carry the recovered state. The play session (`sessionId`, `session_end`) follows the
 *   app lifecycle (`SessionTracker`).
 * - `applySettings()`: the save's settings (sound, music, haptics, language) on the audio, haptics and i18n services and
 *   on the document (`<html lang>`, title).
 * - `changeSetting()`: the settings stub every switch goes through (Pause window today, the Settings screen of UX §11
 *   later): one save write, applied at once, `settings_changed`, then the scenes' listeners (`onSettingChanged`)
 *   relabel or restyle what they show.
 */
import economy from '../../config/economy.json' with { type: 'json' };
import { Analytics, SessionTracker } from '../services/analytics.ts';
import type { AnalyticsEvent, Track } from '../services/analytics.ts';
import { systemClock, systemScheduler } from '../services/clock.ts';
import { getLocale, setLocale, t } from '../services/i18n.ts';
import {
  appVersion,
  detectPlatform,
  isDev,
  onAppHidden,
  onAppVisible,
  randomId,
} from '../services/platform.ts';
import { SaveService, browserStore } from '../services/save.ts';
import type { DeepReadonly, Settings } from '../services/save.ts';
import { gameAudio, gameHaptics, systemReducedMotion } from './level/sceneServices.ts';

let save: SaveService | null = null;
let analytics: Analytics | null = null;
let session: SessionTracker | null = null;
const pending: AnalyticsEvent[] = [];

function analyticsInstance(): Analytics {
  analytics ??= new Analytics({
    clock: systemClock,
    console: isDev(),
    common: () => {
      const d = save?.data;
      return {
        sessionId: sessionTracker().id,
        appVersion: appVersion(),
        platform: detectPlatform(),
        lang: getLocale(),
        coins: d?.coins ?? 0,
        lives: d?.lives.stored ?? 0,
        highestLevel: d?.progress.highestLevel ?? 0,
        payer: d?.payer ?? false,
      };
    },
  });
  return analytics;
}

/** The play session: starts at app open / back in the foreground, `session_end` when hidden (ANALYTICS §2, §3). */
function sessionTracker(): SessionTracker {
  if (session) return session;
  const tracker = new SessionTracker({ clock: systemClock, track: (e) => appTrack(e), newId: randomId });
  session = tracker;
  onAppHidden(() => tracker.hidden());
  onAppVisible(() => tracker.visible());
  return tracker;
}

/** ANALYTICS `track` for the game (events before the save is open are held back). */
export const appTrack: Track = (event) => {
  sessionTracker().observe(event);
  if (save === null) {
    pending.push(event);
    return;
  }
  analyticsInstance().track(event);
};

export function appSave(): SaveService {
  if (save) return save;
  const opened = SaveService.open({
    store: browserStore(),
    clock: systemClock,
    scheduler: systemScheduler,
    startingWallet: economy.startingWallet,
    track: appTrack,
    // UX §11: "Animasyonları azalt" starts from the OS `prefers-reduced-motion` on first launch
    defaultSettings: { reduceMotion: systemReducedMotion() },
  });
  save = opened;
  opened.attachLifecycle();
  for (const e of pending.splice(0)) analyticsInstance().track(e);
  return opened;
}

/** The analytics instance (debug panel: `recent()`). */
export function appAnalytics(): Analytics {
  return analyticsInstance();
}

/** Save settings → audio (sound / music), haptics, language (+ `<html lang>` and the page title). */
export function applySettings(): void {
  const s = appSave().data.settings;
  gameAudio().setEnabled({ sound: s.sound, music: s.music });
  gameHaptics().setEnabled(s.haptics);
  setLocale(s.lang);
  const doc = (globalThis as { document?: Document }).document;
  if (doc) {
    doc.documentElement.lang = getLocale();
    doc.title = t('app.title');
  }
}

/** JUICE §0 rule 8: reduced motion = the "Animasyonları azalt" setting OR `prefers-reduced-motion: reduce`. */
export function reducedMotion(): boolean {
  return appSave().data.settings.reduceMotion || systemReducedMotion();
}

export type SettingKey = keyof Settings;
/** `key` changed; `settings` = all settings after the change. */
export type SettingListener = (key: SettingKey, settings: DeepReadonly<Settings>) => void;

const listeners = new Set<SettingListener>();

/** Scenes listen while they run (unsubscribe on shutdown): a language change relabels, reduce motion restyles. */
export function onSettingChanged(listener: SettingListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Settings stub (UX §5.1 switches, UX §11 Settings screen later): writes the setting at once (TECH §11.1 "ayar
 * değişimi"), applies it, sends `settings_changed { key, value }` and tells the running scenes. Returns false when the
 * value did not change (nothing is written or sent).
 */
export function changeSetting<K extends SettingKey>(key: K, value: Settings[K]): boolean {
  const s = appSave();
  if (s.data.settings[key] === value) return false;
  s.commit((d) => {
    d.settings[key] = value;
  });
  applySettings();
  appTrack({ name: 'settings_changed', key, value: String(value) });
  for (const fn of [...listeners]) fn(key, s.data.settings);
  return true;
}
