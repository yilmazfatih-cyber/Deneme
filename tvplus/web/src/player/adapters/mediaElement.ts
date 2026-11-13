/**
 * <video> öğesine dayanan bağdaştırıcıların ortak tabanı (STREAMS ve PROGRESSIVE): durum geçişleri, ilk kare,
 * yeniden tamponlama ölçümü, ses düzeyi.
 */
import type { LicensedManifest } from '../../../../shared/playback'
import { devbus } from '../../lib/devbus'
import { toRanges } from '../engine/buffered'
import type {
  AdapterEvent,
  AdapterOptions,
  AudioOption,
  PlaybackState,
  PlayerAdapter,
  PlayerStats,
  QualityOption,
} from './types'
import { STATE_LABEL } from './types'

export abstract class MediaElementAdapter implements PlayerAdapter {
  abstract readonly kind: LicensedManifest['kind']
  readonly media: HTMLVideoElement
  protected readonly opts: AdapterOptions
  protected readonly viewableId: string
  private listeners = new Set<(e: AdapterEvent) => void>()
  private st: PlaybackState = 'loading'
  private started = false
  private rebufferAt: number | null = null
  private disposers: (() => void)[] = []
  protected destroyed = false

  constructor(viewableId: string, opts: AdapterOptions) {
    this.viewableId = viewableId
    this.opts = opts
    const v = document.createElement('video')
    v.playsInline = true
    v.preload = 'auto'
    v.muted = opts.muted
    v.setAttribute('playsinline', '')
    v.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000'
    this.media = v
    this.wire()
  }

  abstract mount(container: HTMLElement): Promise<void>

  protected emit(e: AdapterEvent): void {
    for (const l of this.listeners) {
      try {
        l(e)
      } catch {
        /* dinleyici hatası oynatmayı durdurmaz */
      }
    }
  }

  protected setState(s: PlaybackState): void {
    if (s === this.st) return
    this.st = s
    devbus.emit('player', `durum: ${STATE_LABEL[s]}`, {
      viewableId: this.viewableId,
      state: s,
      positionSec: Math.round(this.media.currentTime * 10) / 10,
      kind: this.kind,
    })
    this.emit({ type: 'state', state: s })
  }

  private listen<K extends keyof HTMLMediaElementEventMap>(
    name: K,
    fn: (ev: HTMLMediaElementEventMap[K]) => void,
  ): void {
    this.media.addEventListener(name, fn)
    this.disposers.push(() => this.media.removeEventListener(name, fn))
  }

  private wire(): void {
    const v = this.media
    this.listen('playing', () => {
      if (!this.started) {
        this.started = true
        const fire = () => this.emit({ type: 'firstFrame' })
        const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number })
          .requestVideoFrameCallback
        if (typeof rvfc === 'function') rvfc.call(v, fire)
        else fire()
      }
      this.endRebuffer()
      this.setState('playing')
    })
    this.listen('pause', () => {
      if (this.st !== 'ended' && this.st !== 'error') this.setState('paused')
    })
    this.listen('waiting', () => {
      if (v.paused || this.st === 'error') return
      if (this.started && !v.seeking && this.rebufferAt === null) this.rebufferAt = performance.now()
      this.setState('buffering')
    })
    this.listen('seeking', () => {
      // aramadan doğan bekleme yeniden tamponlama sayılmaz
      this.rebufferAt = null
    })
    this.listen('ended', () => this.setState('ended'))
    this.listen('durationchange', () => {
      if (Number.isFinite(v.duration) && v.duration > 0) this.emit({ type: 'duration', durationSec: v.duration })
    })
  }

  private endRebuffer(): void {
    if (this.rebufferAt === null) return
    const durationMs = Math.round(performance.now() - this.rebufferAt)
    this.rebufferAt = null
    devbus.emit(
      'buffer',
      'yeniden tamponlama',
      { durationMs, positionSec: Math.round(this.media.currentTime) },
      { ok: false, ms: durationMs },
    )
    this.emit({ type: 'rebuffer', durationMs, positionSec: this.media.currentTime })
  }

  protected async autoplay(): Promise<void> {
    if (!this.opts.autoplay) {
      this.setState('paused')
      return
    }
    try {
      await this.media.play()
    } catch (err) {
      // Otomatik oynatma engellendiyse sessize alıp yeniden dene (yine olmazsa kullanıcı oynat'a basar)
      if ((err as DOMException).name === 'NotAllowedError' && !this.media.muted) {
        this.media.muted = true
        try {
          await this.media.play()
          return
        } catch {
          /* aşağıda duraklatıldı */
        }
      }
      if (!this.destroyed && this.st !== 'error') this.setState('paused')
    }
  }

  protected fail(code: string, message: string, retryable: boolean): void {
    this.setState('error')
    devbus.emit('player', 'hata', { viewableId: this.viewableId, code, message }, { ok: false })
    this.emit({ type: 'error', error: { code, message, retryable } })
  }

  /** Hatadan çıkınca (yeniden deneme) */
  protected clearError(): void {
    if (this.st === 'error') this.setState(this.media.paused ? 'paused' : 'buffering')
  }

  play(): Promise<void> {
    return this.media.play().catch(() => undefined)
  }
  pause(): void {
    this.media.pause()
  }
  seek(sec: number): void {
    const d = this.duration()
    const t = Math.max(0, d > 0 ? Math.min(sec, d - 0.25) : sec)
    this.media.currentTime = t
    if (this.st === 'ended') this.setState(this.media.paused ? 'paused' : 'buffering')
  }
  position(): number {
    return this.media.currentTime
  }
  duration(): number {
    const d = this.media.duration
    return Number.isFinite(d) ? d : 0
  }
  buffered(): { start: number; end: number }[] {
    return toRanges(this.media.buffered)
  }
  state(): PlaybackState {
    return this.st
  }
  setVolume(v: number): void {
    this.media.volume = Math.max(0, Math.min(1, v))
    if (v > 0 && this.media.muted) this.media.muted = false
  }
  volume(): number {
    return this.media.volume
  }
  setMuted(m: boolean): void {
    this.media.muted = m
  }
  muted(): boolean {
    return this.media.muted
  }
  audioOptions(): AudioOption[] {
    return []
  }
  currentAudio(): string | null {
    return null
  }
  selectAudio(_id: string): void {}
  qualityOptions(): QualityOption[] {
    return []
  }
  currentQuality(): { lockedId: string | null; activeId: string | null } {
    return { lockedId: null, activeId: null }
  }
  selectQuality(_id: string | null): void {}
  abstract stats(): PlayerStats | null
  abstract retry(): void

  on(fn: (e: AdapterEvent) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    for (const d of this.disposers) d()
    this.disposers = []
    this.listeners.clear()
    try {
      this.media.pause()
    } catch {
      /* yok say */
    }
    this.media.remove()
  }
}

export function frameStats(v: HTMLVideoElement): { droppedFrames: number; totalFrames: number } {
  try {
    const q = v.getVideoPlaybackQuality()
    return { droppedFrames: q.droppedVideoFrames, totalFrames: q.totalVideoFrames }
  } catch {
    return { droppedFrames: 0, totalFrames: 0 }
  }
}
