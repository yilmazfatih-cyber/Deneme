/**
 * EXTERNAL_EMBED bağdaştırıcısı: YouTube'un resmî IFrame Player API'si (istek anında yüklenir).
 * Kurallar: YouTube'un kendi denetimleri açık (controls=1); iframe'in ÜSTÜNE hiçbir arayüz çizilmez; en az 200×200;
 * kaynak satırı ("YouTube · <kanal>") çerçevenin DIŞINDA gösterilir (WatchPage).
 */
import type { EmbedManifest } from '../../../../shared/playback'
import { devbus } from '../../lib/devbus'
import type {
  AdapterEvent,
  AdapterOptions,
  AudioOption,
  PlaybackState,
  PlayerAdapter,
  PlayerStats,
  QualityOption,
} from './types'

/* ───────────── IFrame API türleri (yalnız kullandıklarımız) ───────────── */
interface YTPlayer {
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  getCurrentTime(): number
  getDuration(): number
  setVolume(v: number): void
  getVolume(): number
  mute(): void
  unMute(): void
  isMuted(): boolean
  destroy(): void
  getVideoData?: () => { title?: string; author?: string; video_id?: string }
}
interface YTEvent {
  data: number
  target: YTPlayer
}
interface YTPlayerOptions {
  videoId?: string
  width?: string | number
  height?: string | number
  host?: string
  playerVars?: Record<string, string | number>
  events?: { onReady?: (e: YTEvent) => void; onStateChange?: (e: YTEvent) => void; onError?: (e: YTEvent) => void }
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: YTPlayerOptions) => YTPlayer
}
declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

const API_URL = 'https://www.youtube.com/iframe_api'
const API_TIMEOUT_MS = 10_000
let apiPromise: Promise<YTNamespace> | null = null

/** IFrame API'yi bir kez yükler. */
export function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise
  const t0 = performance.now()
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady
    const timer = window.setTimeout(() => {
      apiPromise = null
      reject(new Error('YouTube oynatıcısı yüklenemedi'))
    }, API_TIMEOUT_MS)
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer)
      prev?.()
      devbus.emit(
        'embed',
        'YouTube API yüklendi',
        { url: API_URL, videoId: null, state: 'UNSTARTED', error: null },
        { ms: performance.now() - t0 },
      )
      if (window.YT) resolve(window.YT)
      else reject(new Error('YouTube API eksik'))
    }
    const s = document.createElement('script')
    s.src = API_URL
    s.async = true
    s.onerror = () => {
      clearTimeout(timer)
      apiPromise = null
      reject(new Error('YouTube oynatıcısı yüklenemedi'))
    }
    document.head.append(s)
  })
  return apiPromise
}

const STATE_NAMES: Record<number, string> = {
  [-1]: 'UNSTARTED',
  0: 'ENDED',
  1: 'PLAYING',
  2: 'PAUSED',
  3: 'BUFFERING',
  5: 'CUED',
}

/** YouTube hata kodları → Türkçe ileti. */
export function youTubeErrorMessage(code: number): string {
  switch (code) {
    case 2:
      return 'Video bağlantısı geçersiz.'
    case 5:
      return 'Bu video tarayıcında oynatılamıyor.'
    case 100:
      return 'Video kaldırılmış ya da gizlenmiş.'
    case 101:
    case 150:
      return 'Video sahibi başka sitelerde oynatılmasına izin vermiyor.'
    default:
      return 'YouTube videoyu oynatamadı.'
  }
}

export class YouTubeAdapter implements PlayerAdapter {
  readonly kind = 'EXTERNAL_EMBED' as const
  readonly media = null
  private readonly manifest: EmbedManifest
  private readonly opts: AdapterOptions
  private player: YTPlayer | null = null
  private host: HTMLElement | null = null
  private listeners = new Set<(e: AdapterEvent) => void>()
  private st: PlaybackState = 'loading'
  private started = false
  private knownDuration = 0
  private destroyed = false
  private durationPoll: number | null = null
  private yt: YTNamespace | null = null
  private mode: 'live' | 'video' = 'video'
  /** Son bilinen oynatıcı durumu (devbus `embed.state`: UNSTARTED|BUFFERING|PLAYING|PAUSED|ENDED|CUED) */
  private lastState = 'UNSTARTED'

  constructor(manifest: EmbedManifest, opts: AdapterOptions) {
    this.manifest = manifest
    this.opts = opts
  }

  /** "YouTube'da aç" bağlantısı */
  externalUrl(): string {
    if (this.mode === 'live' && this.manifest.liveChannelId)
      return `https://www.youtube.com/channel/${encodeURIComponent(this.manifest.liveChannelId)}/live`
    if (this.manifest.videoId) return `https://www.youtube.com/watch?v=${encodeURIComponent(this.manifest.videoId)}`
    if (this.manifest.liveChannelId)
      return `https://www.youtube.com/channel/${encodeURIComponent(this.manifest.liveChannelId)}/live`
    return 'https://www.youtube.com/'
  }

  private emit(e: AdapterEvent): void {
    for (const l of this.listeners) {
      try {
        l(e)
      } catch {
        /* yok say */
      }
    }
  }

  private setState(s: PlaybackState): void {
    if (s === this.st) return
    this.st = s
    this.emit({ type: 'state', state: s })
  }

  private embedEvent(state: string, error: number | string | null = null): void {
    devbus.emit(
      'embed',
      error === null ? `YouTube: ${state}` : `YouTube: hata ${error}`,
      { videoId: this.manifest.videoId, liveChannelId: this.manifest.liveChannelId, state, error },
      { ok: error === null },
    )
  }

  private failWith(code: string, message: string): void {
    this.setState('error')
    this.emit({
      type: 'error',
      error: { code, message, retryable: code === 'API_LOAD', externalUrl: this.externalUrl() },
    })
  }

  async mount(container: HTMLElement): Promise<void> {
    const host = document.createElement('div')
    host.style.cssText = 'position:absolute;inset:0;min-width:200px;min-height:200px'
    container.append(host)
    this.host = host
    let YT: YTNamespace
    try {
      YT = await loadYouTubeApi()
    } catch (err) {
      if (this.destroyed) return
      this.embedEvent(this.lastState, 'API_LOAD_FAILED')
      this.failWith('API_LOAD', (err as Error).message)
      return
    }
    if (this.destroyed) return
    this.yt = YT
    // Canlı kanal gömmesi önce denenir; hata verirse ve manifestte videoId varsa ona düşülür
    if (this.manifest.liveChannelId) this.createPlayer('live')
    else if (this.manifest.videoId) this.createPlayer('video')
    else this.failWith('NO_VIDEO', 'Bu gömme için video bilgisi yok.')
  }

  private createPlayer(mode: 'live' | 'video'): void {
    const YT = this.yt
    const host = this.host
    if (!YT || !host) return
    this.mode = mode
    host.replaceChildren()
    const origin = window.location.origin
    const events: YTPlayerOptions['events'] = {
      onReady: (e) => this.onReady(e.target),
      onStateChange: (e) => this.onStateChange(e.data),
      onError: (e) => {
        this.embedEvent(this.lastState, e.data)
        if (this.mode === 'live' && this.manifest.videoId) {
          devbus.emit(
            'embed',
            'YouTube: canlı gömme hata verdi, videoya düşülüyor',
            { videoId: this.manifest.videoId, state: this.lastState, error: e.data },
            { ok: false },
          )
          try {
            this.player?.destroy()
          } catch {
            /* yok say */
          }
          this.player = null
          this.createPlayer('video')
          return
        }
        this.failWith(`YT_${e.data}`, youTubeErrorMessage(e.data))
      },
    }
    if (mode === 'video') {
      const target = document.createElement('div')
      host.append(target)
      const startSec = Math.floor(this.opts.startSec || this.manifest.startSec || 0)
      this.player = new YT.Player(target, {
        videoId: this.manifest.videoId ?? '',
        width: '100%',
        height: '100%',
        playerVars: {
          controls: 1,
          autoplay: this.opts.autoplay ? 1 : 0,
          mute: this.opts.muted ? 1 : 0,
          playsinline: 1,
          enablejsapi: 1,
          rel: 0,
          start: startSec,
          origin,
          hl: 'tr',
          cc_lang_pref: 'tr',
        },
        events,
      })
    } else {
      const iframe = document.createElement('iframe')
      const q = new URLSearchParams({
        channel: this.manifest.liveChannelId ?? '',
        autoplay: '1',
        enablejsapi: '1',
        playsinline: '1',
        controls: '1',
        origin,
      })
      if (this.opts.muted) q.set('mute', '1')
      iframe.src = `https://www.youtube.com/embed/live_stream?${q.toString()}`
      iframe.title = this.manifest.title
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'
      iframe.allowFullscreen = true
      iframe.style.cssText = 'width:100%;height:100%;border:0;display:block'
      host.append(iframe)
      this.player = new YT.Player(iframe, { events })
    }
    const ifr = host.querySelector('iframe')
    if (ifr) {
      ifr.style.width = '100%'
      ifr.style.height = '100%'
      ifr.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen')
    }
  }

  private onReady(p: YTPlayer): void {
    if (this.destroyed) return
    this.embedEvent(this.lastState)
    if (this.opts.muted) p.mute()
    if (this.opts.autoplay) p.playVideo()
    else this.setState('paused')
    this.pollDuration()
  }

  private pollDuration(): void {
    let tries = 0
    const check = () => {
      if (this.destroyed || !this.player) return
      const d = this.player.getDuration()
      if (d > 0 && Math.abs(d - this.knownDuration) > 0.5) {
        this.knownDuration = d
        this.emit({ type: 'duration', durationSec: d })
      }
      if (++tries < 20 && this.knownDuration === 0) this.durationPoll = window.setTimeout(check, 1000)
    }
    check()
  }

  private onStateChange(code: number): void {
    this.lastState = STATE_NAMES[code] ?? this.lastState
    this.embedEvent(this.lastState)
    switch (code) {
      case 1:
        if (!this.started) {
          this.started = true
          this.emit({ type: 'firstFrame' })
          this.pollDuration()
        }
        this.setState('playing')
        break
      case 2:
        this.setState('paused')
        break
      case 3:
        this.setState('buffering')
        break
      case 0:
        this.setState('ended')
        break
      case 5:
        this.setState('paused')
        break
    }
  }

  play(): Promise<void> {
    try {
      this.player?.playVideo()
    } catch {
      /* oynatıcı henüz hazır değil */
    }
    return Promise.resolve()
  }
  pause(): void {
    try {
      this.player?.pauseVideo()
    } catch {
      /* oynatıcı henüz hazır değil */
    }
  }
  seek(sec: number): void {
    try {
      this.player?.seekTo(Math.max(0, sec), true)
    } catch {
      /* oynatıcı henüz hazır değil */
    }
  }
  position(): number {
    try {
      return this.player?.getCurrentTime() ?? 0
    } catch {
      return 0
    }
  }
  duration(): number {
    return this.knownDuration
  }
  buffered(): { start: number; end: number }[] {
    return []
  }
  state(): PlaybackState {
    return this.st
  }
  // Not: IFrame oynatıcısı "hazır" olana dek nesnede bu yöntemler bulunmaz; çağrılar o yüzden korumalıdır.
  setVolume(v: number): void {
    try {
      this.player?.setVolume(Math.round(Math.max(0, Math.min(1, v)) * 100))
    } catch {
      /* oynatıcı henüz hazır değil */
    }
  }
  volume(): number {
    try {
      return (this.player?.getVolume() ?? 100) / 100
    } catch {
      return 1
    }
  }
  setMuted(m: boolean): void {
    try {
      if (m) this.player?.mute()
      else this.player?.unMute()
    } catch {
      /* oynatıcı henüz hazır değil */
    }
  }
  muted(): boolean {
    try {
      return this.player?.isMuted() ?? this.opts.muted
    } catch {
      return this.opts.muted
    }
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
  stats(): PlayerStats | null {
    return null
  }
  /** YouTube'un kanal adı (API verirse) */
  author(): string | null {
    try {
      return this.player?.getVideoData?.().author ?? null
    } catch {
      return null
    }
  }
  retry(): void {
    if (!this.host) return
    const parent = this.host.parentElement
    this.teardown()
    this.destroyed = false
    this.started = false
    this.setState('loading')
    if (parent) void this.mount(parent)
  }
  on(fn: (e: AdapterEvent) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  private teardown(): void {
    this.destroyed = true
    if (this.durationPoll !== null) clearTimeout(this.durationPoll)
    try {
      this.player?.destroy()
    } catch {
      /* yok say */
    }
    this.player = null
    this.host?.remove()
    this.host = null
  }
  destroy(): void {
    this.teardown()
    this.listeners.clear()
  }
}
