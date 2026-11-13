/**
 * kehribar MSE motoru (Netflix Cadmium karşılığı) — manifest türü 'STREAMS' için.
 * Tek MediaSource, video ve ses için ayrı SourceBuffer'lar ve iki bağımsız boru hattı. Her akışın başlığı tek bayt-aralığı
 * isteğiyle (0 … index.end) alınır, parça dizini istemcide ayrıştırılır (sidx / WebM Cues), bölümler bayt aralığıyla indirilir.
 */
import type { AudioTrack, MediaStream as ManifestStream, StreamsManifest } from '../../../../shared/playback'
import { decide, type AbrReason } from '../abr/controller'
import { ThroughputEstimator } from '../abr/estimator'
import { parseSidx } from '../demux/sidx'
import type { SegmentRef } from '../demux/types'
import { parseWebmIndex } from '../demux/webmCues'
import { devbus } from '../../lib/devbus'
import { isStreamPlayable, mediaSourceCtor, streamMime } from '../net/capabilities'
import { nextRangeStart, toRanges } from './buffered'
import { cdnHealth, fetchRange, type RangeResult } from './fetcher'
import { MediaPipeline, type MediaKind, type PipelineHost, type StreamHeader } from './pipeline'

export const BUFFER_GOAL_SEC = 30
export const BACK_BUFFER_SEC = 30
const TICK_MS = 200
const BUFFER_EVENT_MS = 500

/** Oturumlar arası bant genişliği geçmişi (Netflix gibi: ikinci oynatma daha yüksek kaliteden başlar). */
export const sharedEstimator = new ThroughputEstimator({ defaultKbps: 500 })

export interface EngineOptions {
  startSec: number
  /** Önizleme için yükseklik sınırı (ör. 360) */
  maxHeight?: number | null
  audioTrackId?: string | null
  estimator?: ThroughputEstimator
  bufferGoalSec?: number
}

export type EngineEvent =
  | { type: 'abr'; from: ManifestStream | null; to: ManifestStream; reason: AbrReason; estimateKbps: number; bufferSec: number }
  | { type: 'cdn'; from: string; to: string; reason: string }
  | { type: 'fatal'; error: Error }
  | { type: 'ready'; durationSec: number }

export interface EngineStats {
  streamId: string | null
  width: number | null
  height: number | null
  bitrateKbps: number | null
  profile: string | null
  bufferingStreamId: string | null
  estimateKbps: number
  videoBufferSec: number
  audioBufferSec: number
  cdnId: string | null
  droppedFrames: number
  totalFrames: number
  lockedStreamId: string | null
}

export class EngineError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'EngineError'
    this.code = code
  }
}

function pickVideoStreams(m: StreamsManifest): ManifestStream[] {
  const track = m.videoTracks[0]
  if (!track) return []
  const playable = track.streams.filter(isStreamPlayable)
  const profile = (['vp9-webm', 'h264-mp4'] as const).find((p) => playable.some((s) => s.profile === p)) ?? playable[0]?.profile
  return playable.filter((s) => s.profile === profile).sort((a, b) => a.bitrateKbps - b.bitrateKbps)
}

export function defaultAudioTrack(tracks: AudioTrack[]): AudioTrack | null {
  const playable = tracks.filter((t) => t.streams.some(isStreamPlayable))
  return playable.find((t) => t.language.startsWith('tr')) ?? playable.find((t) => t.isNative) ?? playable[0] ?? null
}

function pickAudioStream(track: AudioTrack, estimateKbps: number): ManifestStream | null {
  const playable = track.streams.filter(isStreamPlayable)
  const profile = (['opus-webm', 'aac-mp4'] as const).find((p) => playable.some((s) => s.profile === p)) ?? playable[0]?.profile
  const list = playable.filter((s) => s.profile === profile).sort((a, b) => a.bitrateKbps - b.bitrateKbps)
  const budget = Math.max(160, estimateKbps * 0.2)
  let best = list[0] ?? null
  for (const s of list) if (s.bitrateKbps <= budget) best = s
  return best
}

export class MseEngine implements PipelineHost {
  readonly media: HTMLVideoElement
  readonly mediaSource: MediaSource
  private readonly manifest: StreamsManifest
  private readonly opts: EngineOptions
  private readonly onEvent: (e: EngineEvent) => void
  private readonly estimator: ThroughputEstimator
  private objectUrl: string | null = null
  private headers = new Map<string, Promise<StreamHeader>>()
  readonly videoStreams: ManifestStream[]
  private videoIndex: number | null = null
  private lockedIndex: number | null = null
  private audioTrack: AudioTrack | null
  private audioStream: ManifestStream | null = null
  private video: MediaPipeline | null = null
  private audio: MediaPipeline | null = null
  private timer: number | null = null
  private lastBufferEvent = 0
  private lastCdnId: string | null = null
  /** Eklenen video bölümlerinin zaman → akış eşlemesi (istatistikte "şu an oynayan" akış için) */
  private appendedVideo: { startTime: number; endTime: number; stream: ManifestStream }[] = []
  private destroyed = false
  private fatal: Error | null = null
  private readonly onSeeking = () => this.handleSeeking()

  constructor(media: HTMLVideoElement, manifest: StreamsManifest, opts: EngineOptions, onEvent: (e: EngineEvent) => void) {
    const MS = mediaSourceCtor()
    if (!MS) throw new EngineError('NO_MSE', 'Bu tarayıcı Media Source Extensions desteklemiyor')
    this.media = media
    this.manifest = manifest
    this.opts = opts
    this.onEvent = onEvent
    this.estimator = opts.estimator ?? sharedEstimator
    this.mediaSource = new MS()
    this.videoStreams = pickVideoStreams(manifest)
    const wanted = opts.audioTrackId ? manifest.audioTracks.find((t) => t.trackId === opts.audioTrackId) : null
    this.audioTrack = wanted ?? defaultAudioTrack(manifest.audioTracks)
  }

  /* ───────────── yaşam döngüsü ───────────── */

  async start(): Promise<void> {
    if (!this.videoStreams.length) throw new EngineError('NO_COMPATIBLE_SOURCE', 'Bu tarayıcı bu yayının görüntü biçimini çözemiyor')
    const ms = this.mediaSource
    const media = this.media
    // ManagedMediaSource (Safari) için uzak oynatma kapatılmalı
    ;(media as HTMLVideoElement & { disableRemotePlayback?: boolean }).disableRemotePlayback = true
    this.objectUrl = URL.createObjectURL(ms)
    const opened = new Promise<void>((resolve) => ms.addEventListener('sourceopen', () => resolve(), { once: true }))
    media.src = this.objectUrl
    await opened
    if (this.destroyed) return

    // İlk ABR kararı (tampon boş) ve başlıklar paralel
    const first = decide({
      streams: this.videoStreams,
      currentIndex: null,
      estimateKbps: this.estimator.estimateKbps(),
      bufferSec: 0,
      lockedIndex: null,
      maxHeight: this.opts.maxHeight ?? null,
    })
    this.videoIndex = first.index
    const vStream = this.videoStreams[first.index]!
    this.emitAbr(null, vStream, 'başlangıç', 0)
    this.audioStream = this.audioTrack ? pickAudioStream(this.audioTrack, this.estimator.estimateKbps()) : null
    const boot = new AbortController()
    const [vh, ah] = await Promise.all([
      this.loadHeader(vStream, 'video', boot.signal),
      this.audioStream ? this.loadHeader(this.audioStream, 'audio', boot.signal) : Promise.resolve(null),
    ])
    if (this.destroyed) return

    const vMime = streamMime(vStream)
    const vsb = ms.addSourceBuffer(vMime)
    this.video = new MediaPipeline('video', vsb, vMime, this.opts.startSec, this)
    if (this.audioStream) {
      const aMime = streamMime(this.audioStream)
      const asb = ms.addSourceBuffer(aMime)
      this.audio = new MediaPipeline('audio', asb, aMime, this.opts.startSec, this)
    }
    const durationSec = this.manifest.durationMs ? this.manifest.durationMs / 1000 : Math.max(vh.index.durationSec, ah?.index.durationSec ?? 0)
    try {
      ms.duration = durationSec
    } catch {
      /* süre ayarlanamazsa tarayıcı tampondan hesaplar */
    }
    if (this.opts.startSec > 0) media.currentTime = this.opts.startSec
    media.addEventListener('seeking', this.onSeeking)
    this.onEvent({ type: 'ready', durationSec })
    this.timer = window.setInterval(() => this.tick(), TICK_MS)
    this.tick()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    if (this.timer !== null) clearInterval(this.timer)
    this.media.removeEventListener('seeking', this.onSeeking)
    this.video?.destroy()
    this.audio?.destroy()
    try {
      if (this.mediaSource.readyState === 'open') {
        for (const sb of Array.from(this.mediaSource.sourceBuffers)) if (sb.updating) sb.abort()
      }
    } catch {
      /* yok say */
    }
    this.media.removeAttribute('src')
    try {
      this.media.load()
    } catch {
      /* yok say */
    }
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl)
    this.objectUrl = null
  }

  /** Tüm CDN'ler başarısız olduktan sonra kullanıcı "Tekrar dene" dediğinde. */
  retry(): void {
    cdnHealth.clear()
    this.fatal = null
    this.video?.resume()
    this.audio?.resume()
    this.tick()
  }

  /* ───────────── zamanlayıcı ───────────── */

  private tick(): void {
    if (this.destroyed || this.fatal) return
    this.video?.tick()
    this.audio?.tick()
    this.maybeEndOfStream()
    this.jumpGaps()
    const now = performance.now()
    if (now - this.lastBufferEvent >= BUFFER_EVENT_MS) {
      this.lastBufferEvent = now
      devbus.emit('buffer', 'tampon', {
        videoSec: round1(this.video?.bufferedAheadSec() ?? 0),
        audioSec: round1(this.audio?.bufferedAheadSec() ?? 0),
        state: this.media.paused ? 'duraklatıldı' : this.media.readyState < 3 ? 'tamponlanıyor' : 'oynuyor',
        positionSec: round1(this.media.currentTime),
      })
    }
  }

  private maybeEndOfStream(): void {
    const pipes = [this.video, this.audio].filter((p): p is MediaPipeline => p !== null)
    if (!pipes.length || !pipes.every((p) => p.done)) return
    if (this.mediaSource.readyState !== 'open') return
    if (pipes.some((p) => p.isUpdating())) return
    try {
      this.mediaSource.endOfStream()
      devbus.emit('player', 'akış sonu', { viewableId: this.manifest.viewableId, state: 'endOfStream', positionSec: round1(this.media.currentTime) })
    } catch {
      /* yok say */
    }
  }

  /** Oynatma küçük bir boşlukta takıldıysa (ses/video başlangıç farkı, bölüm sınırı) ileri atla. */
  private jumpGaps(): void {
    const m = this.media
    if (m.paused || m.seeking || m.readyState >= 3) return
    const start = nextRangeStart(toRanges(m.buffered), m.currentTime, 1.0)
    if (start !== null) {
      devbus.emit('buffer', 'boşluk atlandı', { from: round1(m.currentTime), to: round1(start) })
      m.currentTime = start + 0.001
    }
  }

  private handleSeeking(): void {
    const t = this.media.currentTime
    this.video?.seek(t)
    this.audio?.seek(t)
    this.tick()
  }

  /* ───────────── PipelineHost ───────────── */

  bufferGoalSec(): number {
    return this.opts.bufferGoalSec ?? BUFFER_GOAL_SEC
  }
  backBufferSec(): number {
    return BACK_BUFFER_SEC
  }

  chooseStream(p: MediaPipeline, bufferSec: number): ManifestStream {
    if (p.kind === 'audio') return this.audioStream!
    const d = decide({
      streams: this.videoStreams,
      currentIndex: this.videoIndex,
      estimateKbps: this.estimator.estimateKbps(),
      bufferSec,
      lockedIndex: this.lockedIndex,
      maxHeight: this.opts.maxHeight ?? null,
    })
    if (d.index !== this.videoIndex) {
      const from = this.videoIndex === null ? null : this.videoStreams[this.videoIndex]!
      this.videoIndex = d.index
      this.emitAbr(from, this.videoStreams[d.index]!, d.reason, bufferSec)
    }
    return this.videoStreams[this.videoIndex ?? 0]!
  }

  private emitAbr(from: ManifestStream | null, to: ManifestStream, reason: AbrReason, bufferSec: number): void {
    const estimateKbps = Math.round(this.estimator.estimateKbps())
    const arrow = from === null ? '•' : to.bitrateKbps > from.bitrateKbps ? '↑' : '↓'
    devbus.emit('abr', `${arrow} ${to.bitrateKbps} kbps`, {
      from: from?.bitrateKbps ?? null,
      to: to.bitrateKbps,
      height: to.height ?? null,
      streamId: to.streamId,
      reason,
      estimateKbps,
      bufferSec: round1(bufferSec),
    })
    this.onEvent({ type: 'abr', from, to, reason, estimateKbps, bufferSec })
  }

  loadHeader(stream: ManifestStream, kind: MediaKind, signal: AbortSignal): Promise<StreamHeader> {
    const cached = this.headers.get(stream.streamId)
    if (cached) return cached
    const end = Math.max(stream.init.end, stream.index.end)
    const p = (async () => {
      const r = await fetchRange(stream.urls, 0, end, { signal, onFailover: (a, b, why) => this.failover(a, b, why) })
      this.emitRange('header', stream, 0, end, r, null)
      const index = stream.container === 'mp4' ? parseSidx(r.bytes, 0) : parseWebmIndex(r.bytes, stream.sizeBytes)
      const init = r.bytes.slice(stream.init.start, stream.init.end + 1)
      devbus.emit('range', `${kind} dizini: ${index.segments.length} bölüm`, {
        type: 'header',
        streamId: stream.streamId,
        segments: index.segments.length,
        durationSec: round1(index.durationSec),
        container: stream.container,
      })
      return { index, init }
    })()
    this.headers.set(stream.streamId, p)
    p.catch(() => this.headers.delete(stream.streamId))
    return p
  }

  async fetchSegment(stream: ManifestStream, kind: MediaKind, seg: SegmentRef, segIndex: number, signal: AbortSignal): Promise<RangeResult> {
    const r = await fetchRange(stream.urls, seg.start, seg.end, { signal, onFailover: (a, b, why) => this.failover(a, b, why) })
    this.estimator.sample(r.bytes.length, r.totalMs)
    this.emitRange(kind, stream, seg.start, seg.end, r, segIndex)
    return r
  }

  private emitRange(type: 'video' | 'audio' | 'header', stream: ManifestStream, start: number, end: number, r: RangeResult, segment: number | null): void {
    this.lastCdnId = r.cdnId
    const kbps = r.totalMs > 0 ? Math.round((r.bytes.length * 8) / r.totalMs) : 0
    devbus.emit(
      'range',
      `${type} ${start}-${end}`,
      { type, cdnId: r.cdnId, start, end, bytes: r.bytes.length, ttfbMs: Math.round(r.ttfbMs), kbps, streamId: stream.streamId, segment },
      { ms: Math.round(r.totalMs) },
    )
  }

  private failover(from: string, to: string, reason: string): void {
    devbus.emit('cdn', `yük devri ${from}→${to}`, { from, to, reason }, { ok: false })
    this.onEvent({ type: 'cdn', from, to, reason })
  }

  onAppended(p: MediaPipeline, stream: ManifestStream, seg: SegmentRef): void {
    if (p.kind !== 'video') return
    this.appendedVideo.push({ startTime: seg.startTime, endTime: seg.endTime, stream })
    const t = this.media.currentTime
    if (this.appendedVideo.length > 64) this.appendedVideo = this.appendedVideo.filter((a) => a.endTime > t - BACK_BUFFER_SEC)
  }

  onDone(p: MediaPipeline): void {
    devbus.emit('buffer', `${p.kind === 'video' ? 'video' : 'ses'}: son bölüm eklendi`, { kind: p.kind })
  }

  onFatal(p: MediaPipeline, err: Error): void {
    if (this.fatal || this.destroyed) return
    this.fatal = err
    devbus.emit('player', 'motor hatası', { kind: p.kind, error: err.message, name: err.name }, { ok: false })
    this.onEvent({ type: 'fatal', error: err })
  }

  onQuota(p: MediaPipeline): void {
    devbus.emit('buffer', 'tampon kotası doldu', { kind: p.kind, videoSec: round1(this.video?.bufferedAheadSec() ?? 0) }, { ok: false })
  }

  /* ───────────── dış denetim ───────────── */

  audioTracks(): AudioTrack[] {
    return this.manifest.audioTracks.filter((t) => t.streams.some(isStreamPlayable))
  }
  currentAudioTrack(): AudioTrack | null {
    return this.audioTrack
  }

  /** Ses parçası değişimi: yalnız ses boru hattı yeniden kurulur, video oynamaya devam eder. */
  setAudioTrack(trackId: string): void {
    const track = this.manifest.audioTracks.find((t) => t.trackId === trackId)
    if (!track || track === this.audioTrack) return
    const stream = pickAudioStream(track, this.estimator.estimateKbps())
    if (!stream) return
    this.audioTrack = track
    this.audioStream = stream
    devbus.emit('player', `ses: ${track.languageDescription}`, { trackId, streamId: stream.streamId, channels: track.channels })
    if (this.audio) void this.audio.flushFrom(this.media.currentTime + 0.5, true).then(() => this.tick())
  }

  /** Elle kalite kilidi (null = Otomatik). Kilit değişince ileri tampon bir sonraki bölüm sınırından yenilenir. */
  setQualityLock(streamId: string | null): void {
    const idx = streamId === null ? null : this.videoStreams.findIndex((s) => s.streamId === streamId)
    this.lockedIndex = idx === null || idx < 0 ? null : idx
    if (this.lockedIndex === null || this.lockedIndex === this.videoIndex || !this.video) return
    const cur = this.videoStreams[this.videoIndex ?? 0]!
    void this.headers
      .get(cur.streamId)
      ?.then((h) => {
        const t = this.media.currentTime + 2
        const seg = h.index.segments.find((s) => s.startTime >= t)
        if (seg && this.video) return this.video.flushFrom(seg.startTime, false)
      })
      .then(() => this.tick())
  }

  lockedStreamId(): string | null {
    return this.lockedIndex === null ? null : (this.videoStreams[this.lockedIndex]?.streamId ?? null)
  }

  /** Şu an ekranda oynayan video akışı (eklenen bölümlerin zaman eşlemesinden). */
  playingVideoStream(): ManifestStream | null {
    const t = this.media.currentTime
    for (let i = this.appendedVideo.length - 1; i >= 0; i--) {
      const a = this.appendedVideo[i]!
      if (t >= a.startTime - 0.05 && t < a.endTime) return a.stream
    }
    return this.video?.current ?? null
  }

  bufferedVideo(): { start: number; end: number }[] {
    return this.video?.bufferedRanges() ?? []
  }

  stats(): EngineStats {
    const s = this.playingVideoStream()
    let dropped = 0
    let total = 0
    try {
      const q = this.media.getVideoPlaybackQuality()
      dropped = q.droppedVideoFrames
      total = q.totalVideoFrames
    } catch {
      /* desteklenmiyor */
    }
    return {
      streamId: s?.streamId ?? null,
      width: s?.width ?? null,
      height: s?.height ?? null,
      bitrateKbps: s?.bitrateKbps ?? null,
      profile: s?.profile ?? null,
      bufferingStreamId: this.video?.current?.streamId ?? null,
      estimateKbps: Math.round(this.estimator.estimateKbps()),
      videoBufferSec: round1(this.video?.bufferedAheadSec() ?? 0),
      audioBufferSec: round1(this.audio?.bufferedAheadSec() ?? 0),
      cdnId: this.lastCdnId,
      droppedFrames: dropped,
      totalFrames: total,
      lockedStreamId: this.lockedStreamId(),
    }
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
