/**
 * Tek SourceBuffer'ı besleyen boru hattı (video ya da ses — ikisi birbirinden bağımsız çalışır, Netflix trafiğindeki gibi).
 * Her adımda: tampon hedefi dolduysa geride kalanı boşalt; değilse seçilen akışın başlatma bölümünü (gerekirse) ekle,
 * sıradaki bölümü bayt aralığıyla indir, sırayla ekle.
 */
import type { MediaStream as ManifestStream } from '../../../../shared/playback'
import { streamMime } from '../net/capabilities'
import { locateSegment, type SegmentIndex, type SegmentRef } from '../demux/types'
import { bufferedAhead, rangeAt, toRanges, type Range } from './buffered'
import { isAbortError, type RangeResult } from './fetcher'

export type MediaKind = 'video' | 'audio'

export interface StreamHeader {
  index: SegmentIndex
  init: Uint8Array<ArrayBuffer>
}

export interface PipelineHost {
  readonly media: HTMLMediaElement
  readonly mediaSource: MediaSource
  bufferGoalSec(): number
  /** Geride tutulacak tampon (sn) */
  backBufferSec(): number
  chooseStream(p: MediaPipeline, bufferSec: number): ManifestStream
  loadHeader(stream: ManifestStream, kind: MediaKind, signal: AbortSignal): Promise<StreamHeader>
  fetchSegment(stream: ManifestStream, kind: MediaKind, seg: SegmentRef, segIndex: number, signal: AbortSignal): Promise<RangeResult>
  onAppended(p: MediaPipeline, stream: ManifestStream, seg: SegmentRef): void
  onDone(p: MediaPipeline): void
  onFatal(p: MediaPipeline, err: Error): void
  onQuota(p: MediaPipeline): void
}

class QuotaError extends Error {}

export class MediaPipeline {
  readonly kind: MediaKind
  private readonly sb: SourceBuffer
  private readonly host: PipelineHost
  private mime: string
  /** Son eklenen akış */
  current: ManifestStream | null = null
  private appendedInit: string | null = null
  /** Sıradaki bölümün başlaması gereken an (sn) */
  nextTime: number
  done = false
  failed: Error | null = null
  private gen = 0
  private ctrl = new AbortController()
  private busy = false
  private inflight: SegmentRef | null = null
  private appendWindowFrom: number | null = null
  private quotaBackoffUntil = 0
  /** QuotaExceeded sonrası küçültülmüş hedef */
  private goalCap: number | null = null
  /** Temizlik sürerken yeni adım başlamaz */
  private flushing = false

  constructor(kind: MediaKind, sb: SourceBuffer, mime: string, startTime: number, host: PipelineHost) {
    this.kind = kind
    this.sb = sb
    this.mime = mime
    this.nextTime = startTime
    this.host = host
  }

  bufferedRanges(): Range[] {
    try {
      return toRanges(this.sb.buffered)
    } catch {
      return []
    }
  }

  bufferedAheadSec(): number {
    return bufferedAhead(this.bufferedRanges(), this.host.media.currentTime)
  }

  isUpdating(): boolean {
    try {
      return this.sb.updating
    } catch {
      return false
    }
  }

  /** Zamanlayıcıdan çağrılır; bir adım sürerken yeni adım başlamaz. */
  tick(): void {
    if (this.busy || this.flushing || this.done || this.failed) return
    this.busy = true
    this.step()
      .catch((err: unknown) => {
        if (isAbortError(err)) return
        if (err instanceof QuotaError) return
        this.failed = err instanceof Error ? err : new Error(String(err))
        this.host.onFatal(this, this.failed)
      })
      .finally(() => {
        this.busy = false
      })
  }

  private goal(): number {
    const g = this.host.bufferGoalSec()
    return this.goalCap !== null ? Math.min(g, this.goalCap) : g
  }

  private async step(): Promise<void> {
    const gen = this.gen
    const media = this.host.media
    const t = media.currentTime
    const ahead = bufferedAhead(this.bufferedRanges(), t)
    if (ahead >= this.goal()) {
      await this.evict(t)
      return
    }
    if (Date.now() < this.quotaBackoffUntil) return
    const stream = this.host.chooseStream(this, ahead)
    const header = await this.host.loadHeader(stream, this.kind, this.ctrl.signal)
    if (gen !== this.gen) return
    if (this.appendedInit !== stream.streamId) {
      const mime = streamMime(stream)
      if (mime !== this.mime) {
        await this.waitIdle()
        if (gen !== this.gen) return
        // Kodek değişimi (ör. Opus → AAC ses parçası): changeType destekleniyorsa aynı tamponda devam
        const sbx = this.sb as SourceBuffer & { changeType?: (type: string) => void }
        if (typeof sbx.changeType === 'function') sbx.changeType(mime)
        this.mime = mime
      }
      if (!(await this.append(header.init, gen))) return
      this.appendedInit = stream.streamId
    }
    const segs = header.index.segments
    const i = locateSegment(segs, this.nextTime + 1e-6)
    if (i < 0) {
      const last = segs[segs.length - 1]
      if (!last || this.nextTime >= last.endTime - 0.05) {
        this.done = true
        this.host.onDone(this)
      }
      return
    }
    const seg = segs[i]!
    this.inflight = seg
    const result = await this.host.fetchSegment(stream, this.kind, seg, i, this.ctrl.signal)
    if (gen !== this.gen) return
    let windowSet = false
    if (this.appendWindowFrom !== null) {
      await this.waitIdle()
      if (gen !== this.gen) return
      try {
        this.sb.appendWindowStart = Math.max(0, this.appendWindowFrom)
        windowSet = true
      } catch {
        /* pencere ayarlanamadıysa üst üste ekleme yine çalışır */
      }
    }
    const ok = await this.append(result.bytes, gen)
    if (windowSet) {
      await this.waitIdle()
      try {
        this.sb.appendWindowStart = 0
      } catch {
        /* yok say */
      }
      this.appendWindowFrom = null
    }
    if (!ok) return
    this.inflight = null
    this.current = stream
    this.nextTime = seg.endTime
    this.goalCap = null
    this.host.onAppended(this, stream, seg)
  }

  private waitIdle(): Promise<void> {
    if (!this.isUpdating()) return Promise.resolve()
    return new Promise((resolve) => {
      const done = () => {
        this.sb.removeEventListener('updateend', done)
        resolve()
      }
      this.sb.addEventListener('updateend', done)
    })
  }

  /** Ekler; nesil değiştiyse (arama/temizlik) eklemez ve false döner. */
  private async append(data: Uint8Array<ArrayBuffer>, gen: number): Promise<boolean> {
    await this.waitIdle()
    if (gen !== this.gen) return false
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        this.sb.removeEventListener('updateend', onEnd)
        this.sb.removeEventListener('error', onErr)
      }
      const onEnd = () => {
        cleanup()
        resolve()
      }
      const onErr = () => {
        cleanup()
        reject(new Error(`${this.kind === 'video' ? 'Video' : 'Ses'} verisi çözülemedi (SourceBuffer hatası)`))
      }
      this.sb.addEventListener('updateend', onEnd)
      this.sb.addEventListener('error', onErr)
      try {
        this.sb.appendBuffer(data)
      } catch (err) {
        cleanup()
        if ((err as DOMException).name === 'QuotaExceededError') {
          void this.onQuotaExceeded()
          reject(new QuotaError('tampon dolu'))
          return
        }
        reject(err as Error)
      }
    })
    return gen === this.gen
  }

  private async onQuotaExceeded(): Promise<void> {
    const t = this.host.media.currentTime
    const ahead = this.bufferedAheadSec()
    this.goalCap = Math.max(6, ahead * 0.7)
    this.quotaBackoffUntil = Date.now() + 1000
    this.host.onQuota(this)
    // gerideki tamponu agresif boşalt (2 sn bırak)
    const ranges = this.bufferedRanges()
    const first = ranges[0]
    if (first && t - 2 > first.start) await this.remove(first.start, t - 2).catch(() => undefined)
  }

  private async remove(start: number, end: number): Promise<void> {
    if (end <= start) return
    await this.waitIdle()
    await new Promise<void>((resolve) => {
      const onEnd = () => {
        this.sb.removeEventListener('updateend', onEnd)
        resolve()
      }
      this.sb.addEventListener('updateend', onEnd)
      try {
        this.sb.remove(start, end)
      } catch {
        this.sb.removeEventListener('updateend', onEnd)
        resolve()
      }
    })
  }

  /** Oynatma konumunun gerisinde `backBufferSec`'ten eskisini siler. */
  private async evict(t: number): Promise<void> {
    const back = this.host.backBufferSec()
    const ranges = this.bufferedRanges()
    const first = ranges[0]
    if (first && t - first.start > back + 5) await this.remove(first.start, t - back)
  }

  private restart(from: number): void {
    this.gen++
    this.ctrl.abort()
    this.ctrl = new AbortController()
    this.inflight = null
    if (this.isUpdating() && this.host.mediaSource.readyState === 'open') {
      try {
        this.sb.abort()
      } catch {
        /* yok say */
      }
    }
    // abort() ayrıştırıcıyı sıfırlar: sonraki bölümden önce başlatma bölümü yeniden eklenir
    this.appendedInit = null
    this.nextTime = from
    this.done = false
  }

  /** Arama: hedef tamponda ise tamponun sonundan, uçuştaki bölüm hedefi kapsıyorsa ona dokunmadan, değilse hedeften devam. */
  seek(t: number): void {
    this.done = false
    const r = rangeAt(this.bufferedRanges(), t, 0.1)
    if (r) {
      const cont = this.inflight ? this.inflight.startTime : this.nextTime
      if (Math.abs(cont - r.end) < 0.3) return
      this.restart(r.end)
      return
    }
    if (this.inflight && t >= this.inflight.startTime && t < this.inflight.endTime) return
    this.restart(t)
  }

  /** `from` anından sonrasını siler ve oradan yeniden doldurur (ses parçası değişimi, elle kalite). */
  async flushFrom(from: number, trimWithAppendWindow: boolean): Promise<void> {
    this.restart(from)
    const gen = this.gen
    this.flushing = true
    try {
      await this.waitIdle()
      if (gen !== this.gen) return
      const d = this.host.mediaSource.duration
      const end = Number.isFinite(d) && d > from ? d : Infinity
      await this.remove(from, end)
      if (gen !== this.gen) return
      this.appendWindowFrom = trimWithAppendWindow ? from : null
    } finally {
      this.flushing = false
    }
  }

  /** Tüm CDN'ler başarısız olduktan sonra "Tekrar dene". */
  resume(): void {
    this.failed = null
  }

  destroy(): void {
    this.gen++
    this.ctrl.abort()
    this.failed = new Error('kapandı')
  }
}
