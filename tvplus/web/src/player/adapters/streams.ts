/** STREAMS bağdaştırıcısı: kendi MSE motorumuz (ayrı ses/video, bayt aralığı, ABR, CDN yük devri). */
import type { StreamsManifest } from '../../../../shared/playback'
import { EngineError, MseEngine } from '../engine/engine'
import { AllCdnsFailedError } from '../engine/fetcher'
import { MediaElementAdapter } from './mediaElement'
import type { AdapterOptions, AudioOption, PlayerStats, QualityOption } from './types'

export class StreamsAdapter extends MediaElementAdapter {
  readonly kind = 'STREAMS' as const
  private readonly manifest: StreamsManifest
  private engine: MseEngine | null = null

  constructor(manifest: StreamsManifest, opts: AdapterOptions) {
    super(manifest.viewableId, opts)
    this.manifest = manifest
  }

  async mount(container: HTMLElement): Promise<void> {
    container.append(this.media)
    const engine = new MseEngine(this.media, this.manifest, { startSec: this.opts.startSec, maxHeight: this.opts.maxHeight ?? null }, (e) => {
      if (e.type === 'abr') {
        if (e.from === null) return
        this.emit({ type: 'bitrateSwitch', fromKbps: e.from.bitrateKbps, toKbps: e.to.bitrateKbps, reason: e.reason, height: e.to.height ?? null })
      } else if (e.type === 'cdn') {
        this.emit({ type: 'cdnSwitch', from: e.from, to: e.to, reason: e.reason })
      } else if (e.type === 'fatal') {
        if (e.error instanceof AllCdnsFailedError) this.fail('ALL_CDNS_FAILED', 'Yayın sunucularına ulaşılamıyor', true)
        else this.fail('MEDIA', 'Video oynatılamadı', true)
      } else if (e.type === 'ready') {
        this.emit({ type: 'duration', durationSec: e.durationSec })
        this.emit({ type: 'tracks' })
      }
    })
    this.engine = engine
    try {
      await engine.start()
    } catch (err) {
      if (this.destroyed) return
      if (err instanceof EngineError) this.fail(err.code, err.message, false)
      else if (err instanceof AllCdnsFailedError) this.fail('ALL_CDNS_FAILED', 'Yayın sunucularına ulaşılamıyor', true)
      else this.fail('MEDIA', 'Video başlatılamadı', true)
      return
    }
    if (this.destroyed) return
    await this.autoplay()
  }

  override audioOptions(): AudioOption[] {
    return (this.engine?.audioTracks() ?? []).map((t) => ({ id: t.trackId, label: `${t.languageDescription} · ${t.channels}`, language: t.language }))
  }
  override currentAudio(): string | null {
    return this.engine?.currentAudioTrack()?.trackId ?? null
  }
  override selectAudio(id: string): void {
    this.engine?.setAudioTrack(id)
    this.emit({ type: 'tracks' })
  }
  override qualityOptions(): QualityOption[] {
    return (this.engine?.videoStreams ?? []).map((s) => ({
      id: s.streamId,
      label: `${s.height ?? '?'}p · ${s.bitrateKbps} kbps`,
      bitrateKbps: s.bitrateKbps,
      height: s.height ?? null,
    }))
  }
  override currentQuality(): { lockedId: string | null; activeId: string | null } {
    return { lockedId: this.engine?.lockedStreamId() ?? null, activeId: this.engine?.playingVideoStream()?.streamId ?? null }
  }
  override selectQuality(id: string | null): void {
    this.engine?.setQualityLock(id)
    this.emit({ type: 'tracks' })
  }

  stats(): PlayerStats | null {
    const s = this.engine?.stats()
    if (!s) return null
    return {
      streamId: s.streamId,
      resolution: s.width && s.height ? `${s.width}×${s.height}` : null,
      bitrateKbps: s.bitrateKbps,
      estimateKbps: s.estimateKbps,
      bufferSec: s.bufferSec,
      cdnId: s.cdnId,
      droppedFrames: s.droppedFrames,
      totalFrames: s.totalFrames,
      profile: s.profile,
    }
  }

  retry(): void {
    this.clearError()
    this.engine?.retry()
    void this.play()
  }

  override destroy(): void {
    this.engine?.destroy()
    this.engine = null
    super.destroy()
  }
}
