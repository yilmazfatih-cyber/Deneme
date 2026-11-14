/**
 * PROGRESSIVE bağdaştırıcısı: sade <video src="imzalı /oca/<düğüm>/file adresi">; Range isteklerini tarayıcı yapar.
 * CDN yük devri: hata ya da 8 sn'den uzun takılmada kaynak sıradaki düğüme çevrilir, konum geri yüklenir.
 */
import type { ProgressiveManifest } from '../../../../shared/playback'
import { devbus } from '../../lib/devbus'
import { cdnHealth, CDN_TIMEOUT_MS } from '../engine/fetcher'
import { frameStats, MediaElementAdapter } from './mediaElement'
import type { AdapterOptions, PlayerStats } from './types'

export class ProgressiveAdapter extends MediaElementAdapter {
  readonly kind = 'PROGRESSIVE' as const
  private readonly manifest: ProgressiveManifest
  private order: { cdnId: string; url: string }[] = []
  private cursor = 0
  private stallTimer: number | null = null
  private readonly onError = () => this.failover('oynatıcı hatası')
  private readonly onStall = () => this.armStallTimer()
  private readonly onProgress = () => this.disarmStallTimer()

  constructor(manifest: ProgressiveManifest, opts: AdapterOptions) {
    super(manifest.viewableId, opts)
    this.manifest = manifest
  }

  async mount(container: HTMLElement): Promise<void> {
    container.append(this.media)
    this.order = cdnHealth.order(this.manifest.urls)
    this.cursor = 0
    if (!this.order.length) {
      this.fail('NO_SOURCE', 'Bu yayın için kaynak bulunamadı', false)
      return
    }
    this.media.addEventListener('error', this.onError)
    this.media.addEventListener('waiting', this.onStall)
    this.media.addEventListener('stalled', this.onStall)
    this.media.addEventListener('timeupdate', this.onProgress)
    this.media.addEventListener('playing', this.onProgress)
    this.load(this.opts.startSec, false)
    await this.autoplay()
  }

  private load(atSec: number, playAfter: boolean): void {
    const u = this.order[this.cursor]!
    const frag = atSec > 0 ? `#t=${atSec.toFixed(1)}` : ''
    devbus.emit('range', `progressive ${u.cdnId}`, {
      type: 'video',
      cdnId: u.cdnId,
      url: u.url.split('?')[0],
      startSec: atSec,
    })
    this.media.src = u.url + frag
    if (atSec > 0) {
      const restore = () => {
        if (Math.abs(this.media.currentTime - atSec) > 1) this.media.currentTime = atSec
        if (playAfter) void this.media.play().catch(() => undefined)
      }
      this.media.addEventListener('loadedmetadata', restore, { once: true })
    } else if (playAfter) {
      void this.media.play().catch(() => undefined)
    }
  }

  private armStallTimer(): void {
    if (this.stallTimer !== null || this.media.paused) return
    this.stallTimer = window.setTimeout(() => {
      this.stallTimer = null
      if (!this.media.paused && this.media.readyState < 3) this.failover('takılma (8 sn)')
    }, CDN_TIMEOUT_MS)
  }

  private disarmStallTimer(): void {
    if (this.stallTimer !== null) clearTimeout(this.stallTimer)
    this.stallTimer = null
  }

  private failover(reason: string): void {
    if (this.destroyed) return
    this.disarmStallTimer()
    const failed = this.order[this.cursor]
    if (failed) cdnHealth.quarantine(failed.cdnId)
    const pos = this.media.currentTime || this.opts.startSec
    const wasPlaying = !this.media.paused || this.state() === 'buffering' || this.state() === 'loading'
    this.cursor += 1
    const next = this.order[this.cursor]
    if (!failed || !next) {
      this.fail('ALL_CDNS_FAILED', 'Yayın sunucularına ulaşılamıyor', true)
      return
    }
    devbus.emit(
      'cdn',
      `yük devri ${failed.cdnId}→${next.cdnId}`,
      { from: failed.cdnId, to: next.cdnId, reason },
      { ok: false },
    )
    this.emit({ type: 'cdnSwitch', from: failed.cdnId, to: next.cdnId, reason })
    this.load(pos, wasPlaying)
  }

  stats(): PlayerStats | null {
    const v = this.media
    const ahead = this.buffered().find((r) => v.currentTime >= r.start - 0.25 && v.currentTime <= r.end)
    return {
      streamId: 'tek dosya',
      resolution: v.videoWidth ? `${v.videoWidth}×${v.videoHeight}` : null,
      bitrateKbps:
        this.manifest.sizeBytes && this.duration()
          ? Math.round((this.manifest.sizeBytes * 8) / this.duration() / 1000)
          : null,
      estimateKbps: null,
      bufferSec: ahead ? Math.round((ahead.end - v.currentTime) * 10) / 10 : 0,
      cdnId: this.order[this.cursor]?.cdnId ?? null,
      ...frameStats(v),
      profile: this.manifest.mimeType,
    }
  }

  retry(): void {
    cdnHealth.clear()
    this.order = cdnHealth.order(this.manifest.urls)
    this.cursor = 0
    this.clearError()
    this.load(this.media.currentTime || this.opts.startSec, true)
  }

  override destroy(): void {
    this.disarmStallTimer()
    this.media.removeEventListener('error', this.onError)
    this.media.removeEventListener('waiting', this.onStall)
    this.media.removeEventListener('stalled', this.onStall)
    this.media.removeEventListener('timeupdate', this.onProgress)
    this.media.removeEventListener('playing', this.onProgress)
    this.media.removeAttribute('src')
    try {
      this.media.load()
    } catch {
      /* yok say */
    }
    super.destroy()
  }
}
