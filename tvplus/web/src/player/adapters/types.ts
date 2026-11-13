/**
 * Oynatıcı bağdaştırıcıları için tek arayüz: kendi motorumuz (STREAMS), tek dosya (PROGRESSIVE) ve YouTube gömmesi
 * (EXTERNAL_EMBED). Arayüz katmanı (WatchPage, PreviewPlayer) yalnızca bu arayüzü bilir.
 */
import type { LicensedManifest } from '../../../../shared/playback'

export type PlaybackState = 'loading' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error'

export const STATE_LABEL: Record<PlaybackState, string> = {
  loading: 'yükleniyor',
  playing: 'oynuyor',
  paused: 'duraklatıldı',
  buffering: 'tamponlanıyor',
  ended: 'bitti',
  error: 'hata',
}

export interface QualityOption {
  id: string
  label: string
  bitrateKbps: number
  height: number | null
}
export interface AudioOption {
  id: string
  label: string
  language: string
}

export interface PlayerStats {
  streamId: string | null
  resolution: string | null
  bitrateKbps: number | null
  estimateKbps: number | null
  bufferSec: number
  cdnId: string | null
  droppedFrames: number
  totalFrames: number
  profile: string | null
}

export interface PlayerError {
  message: string
  retryable: boolean
  code: string
  /** Dış sağlayıcıda açma bağlantısı (YouTube'da aç) */
  externalUrl?: string
}

export type AdapterEvent =
  | { type: 'state'; state: PlaybackState }
  | { type: 'firstFrame' }
  | { type: 'duration'; durationSec: number }
  | { type: 'bitrateSwitch'; fromKbps: number | null; toKbps: number; reason: string; height: number | null }
  | { type: 'cdnSwitch'; from: string; to: string; reason: string }
  | { type: 'rebuffer'; durationMs: number; positionSec: number }
  | { type: 'error'; error: PlayerError }
  | { type: 'tracks' }

export interface AdapterOptions {
  startSec: number
  autoplay: boolean
  muted: boolean
  /** Önizleme için video yüksekliği sınırı */
  maxHeight?: number | null
  /** Önizleme: kendi denetimleri olmayan sade gömme */
  preview?: boolean
}

export interface PlayerAdapter {
  readonly kind: LicensedManifest['kind']
  /** Altyazı saati ve yerel olaylar için; YouTube'da null */
  readonly media: HTMLVideoElement | null
  mount(container: HTMLElement): Promise<void>
  play(): Promise<void>
  pause(): void
  seek(sec: number): void
  position(): number
  duration(): number
  buffered(): { start: number; end: number }[]
  state(): PlaybackState
  setVolume(v: number): void
  volume(): number
  setMuted(m: boolean): void
  muted(): boolean
  audioOptions(): AudioOption[]
  currentAudio(): string | null
  selectAudio(id: string): void
  qualityOptions(): QualityOption[]
  /** kilitli akış (null = Otomatik) ve şu an oynayan akış */
  currentQuality(): { lockedId: string | null; activeId: string | null }
  selectQuality(id: string | null): void
  stats(): PlayerStats | null
  retry(): void
  on(fn: (e: AdapterEvent) => void): () => void
  destroy(): void
}
