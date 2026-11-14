/**
 * Çizim sırasında bağdaştırıcıdan okunan değerler. Hiçbir koşulda fırlatmaz: YouTube IFrame oynatıcısı `onReady`
 * gelene dek yöntemsiz bir nesnedir; motor sökülürken de okumalar hata verebilir. Hatalı okuma yedek değere düşer.
 */
import type { AudioOption, PlaybackState, PlayerAdapter } from '../adapters/types'

export interface AdapterReadout {
  state: PlaybackState
  position: number
  duration: number
  /** 0–1 */
  volume: number
  muted: boolean
  buffered: { start: number; end: number }[]
  audio: AudioOption[]
  currentAudio: string | null
}

function safe<T>(fn: () => T, fallback: T, ok: (v: T) => boolean = () => true): T {
  try {
    const v = fn()
    return v === undefined || v === null || !ok(v) ? fallback : v
  } catch {
    return fallback
  }
}
const finite = (v: number) => Number.isFinite(v)

export function readAdapter(a: PlayerAdapter | null, startSec: number, fallbackDuration: number): AdapterReadout {
  if (!a)
    return {
      state: 'loading',
      position: startSec,
      duration: fallbackDuration,
      volume: 1,
      muted: false,
      buffered: [],
      audio: [],
      currentAudio: null,
    }
  const d = safe(() => a.duration(), 0, finite)
  return {
    state: safe<PlaybackState>(() => a.state(), 'loading'),
    position: safe(() => a.position(), startSec, finite),
    duration: d > 0 ? d : fallbackDuration,
    volume: Math.max(
      0,
      Math.min(
        1,
        safe(() => a.volume(), 1, finite),
      ),
    ),
    muted: safe(
      () => a.muted(),
      false,
      (v) => typeof v === 'boolean',
    ),
    buffered: safe(() => a.buffered(), [], Array.isArray),
    audio: safe(() => a.audioOptions(), [], Array.isArray),
    currentAudio: safe<string | null>(() => a.currentAudio(), null),
  }
}
