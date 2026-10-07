/**
 * Game-wide service instances the scenes share (TECH_DESIGN §11.6 sound, §11.7 haptics; JUICE §0 rule 8 reduced
 * motion). One `AudioService` per page: its context is created on the first user gesture (`unlock`, iOS) and its bank is
 * pre-rendered in budgeted slices from the scene update (`pump`, ≤ `audio.prerenderBudgetMsPerFrame`).
 *
 * `installAudioUnlock` (once per page, main.ts) listens for the first activation-triggering input anywhere on the page —
 * intro, home or level, before any scene handles it — and unlocks the audio there; it also suspends the context while
 * the app is in the background and resumes it in the foreground (TECH §11.6 "sekme gizlenince").
 */
import { AudioService } from '../../services/audio.ts';
import type { SoundName } from '../../services/audio.ts';
import { createWebHaptics } from '../../services/haptics.ts';
import type { Haptics } from '../../services/haptics.ts';
import { onAppHidden, onAppVisible, userActivation } from '../../services/platform.ts';
import type { LifecycleTarget, UserActivationLike } from '../../services/platform.ts';
import { JUICE, JUICE_P0_IDS } from './juice/catalog.ts';

let audio: AudioService | null = null;
let haptics: Haptics | null = null;

export function gameAudio(): AudioService {
  if (!audio) {
    audio = new AudioService();
    audio.bank.request(p0Sounds());
  }
  return audio;
}

export function gameHaptics(): Haptics {
  haptics ??= createWebHaptics();
  return haptics;
}

/** Every sound of the JUICE Phase 2 P0 rows (pre-rendered at level start). */
export function p0Sounds(): SoundName[] {
  const out = new Set<SoundName>();
  for (const id of JUICE_P0_IDS) for (const n of JUICE[id].sounds) out.add(n);
  return [...out];
}

/** `prefers-reduced-motion: reduce` (JUICE §0 rule 8; the Settings switch is OR-ed in by the caller). */
export function systemReducedMotion(): boolean {
  const mm = (globalThis as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia;
  try {
    return mm?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

/**
 * HTML "activation-triggering input events" (keydown, mousedown, a mouse pointerdown, a non-mouse pointerup, touchend)
 * plus click. A touch `pointerdown` is NOT one: unlocking there leaves Chrome / iOS contexts suspended, so the first
 * drag (down → move → up) unlocks on its `pointerup`.
 */
export const AUDIO_UNLOCK_EVENTS = [
  'pointerdown',
  'pointerup',
  'touchend',
  'mousedown',
  'keydown',
  'click',
] as const;

export interface UnlockEventTarget {
  addEventListener(type: string, listener: () => void, options?: AddEventListenerOptions): void;
  removeEventListener(type: string, listener: () => void, options?: EventListenerOptions): void;
}

export interface AudioUnlockOptions {
  readonly audio?: Pick<AudioService, 'unlock' | 'unlocked' | 'suspend' | 'resume'>;
  /** Where input events are heard (capture phase, before Phaser's own listeners). Default: `window`. */
  readonly target?: UnlockEventTarget | null;
  /** App lifecycle (default: document + window). */
  readonly lifecycle?: LifecycleTarget;
  /** `navigator.userActivation` (null: the browser has no such API, every listed event is tried). */
  readonly activation?: () => UserActivationLike | null;
}

/**
 * Unlocks the audio on the first input that carries user activation, anywhere on the page; the input listeners are
 * removed once the context runs. Background → `suspend`, foreground → `resume`. Returns the uninstaller.
 */
export function installAudioUnlock(opts: AudioUnlockOptions = {}): () => void {
  const audio = opts.audio ?? gameAudio();
  const target =
    opts.target === undefined ? ((globalThis as { window?: UnlockEventTarget }).window ?? null) : opts.target;
  const activation = opts.activation ?? (() => userActivation());
  const capture: AddEventListenerOptions = { capture: true, passive: true };
  let listening = target !== null;
  const removeInput = (): void => {
    if (!listening || target === null) return;
    listening = false;
    for (const type of AUDIO_UNLOCK_EVENTS) target.removeEventListener(type, onInput, { capture: true });
  };
  function onInput(): void {
    if (audio.unlocked) {
      removeInput();
      return;
    }
    // without the activation flag the context would be created suspended (and Chrome logs a warning)
    const ua = activation();
    if (ua !== null && !ua.isActive) return;
    audio.unlock();
  }
  if (target !== null)
    for (const type of AUDIO_UNLOCK_EVENTS) target.addEventListener(type, onInput, capture);
  const offHidden = onAppHidden(() => audio.suspend(), opts.lifecycle);
  const offVisible = onAppVisible(() => audio.resume(), opts.lifecycle);
  return () => {
    removeInput();
    offHidden();
    offVisible();
  };
}
