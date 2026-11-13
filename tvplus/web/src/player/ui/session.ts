/**
 * Bir izleme oturumunun telemetrisi ve yer imi kalp atışı. Olaylar URL'deki tctx ile birlikte gider.
 * playback.intent → playback.start (startupMs) → heartbeat (10 sn) / rebuffer / bitrateSwitch / cdnSwitch / error → playback.end
 * Yer imi: oynarken 10 sn'de bir, duraklatınca ve çıkarken (canlı yayında yok).
 */
import type { LicensedManifest } from '../../../../shared/playback'
import { parseEntityId } from '../../../../shared/tctx'
import { devbus } from '../../lib/devbus'
import { logEvent } from '../../telemetry/logger'
import { sourceKindOf } from '../adapters'
import type { AdapterEvent, PlayerAdapter } from '../adapters/types'
import { saveBookmark } from './metadata'

const HEARTBEAT_MS = 10_000

export class PlaybackSession {
  readonly viewableId: string
  private readonly tctx: string | null
  private intentAt = performance.now()
  private adapter: PlayerAdapter | null = null
  private manifest: LicensedManifest | null = null
  private off: (() => void) | null = null
  private timer: number | null = null
  private started = false
  private ended = false
  private durationSec = 0
  private lastSavedPos = -1
  private live: boolean
  private rebuffers = 0

  constructor(viewableId: string, tctx: string | null, live: boolean) {
    this.viewableId = viewableId
    this.tctx = tctx
    this.live = live
  }

  intent(extra: Record<string, unknown> = {}): void {
    this.intentAt = performance.now()
    logEvent('playback.intent', { viewableId: this.viewableId, ...extra }, this.tctx)
  }

  setLive(live: boolean): void {
    this.live = live
  }

  /** Yeni bağdaştırıcıyı izlemeye başlar (kaynak değişiminde öncekinin yerine geçer). */
  attach(adapter: PlayerAdapter, manifest: LicensedManifest): void {
    this.off?.()
    this.adapter = adapter
    this.manifest = manifest
    this.ended = false
    if (manifest.durationMs) this.durationSec = manifest.durationMs / 1000
    this.off = adapter.on((e) => this.onEvent(e))
    if (this.timer === null) this.timer = window.setInterval(() => this.heartbeat(), HEARTBEAT_MS)
  }

  private base(): Record<string, unknown> {
    return {
      viewableId: this.viewableId,
      playbackContextId: this.manifest?.playbackContextId ?? null,
      sourceKind: this.manifest ? sourceKindOf(this.manifest) : null,
      positionSec: Math.round(this.adapter?.position() ?? 0),
    }
  }

  private onEvent(e: AdapterEvent): void {
    switch (e.type) {
      case 'firstFrame': {
        if (this.started) return
        this.started = true
        const startupMs = Math.round(performance.now() - this.intentAt)
        const ent = parseEntityId(this.viewableId)
        logEvent(
          'playback.start',
          { ...this.base(), startupMs, videoId: ent?.kind === 'Video' ? Number(ent.id) : null, entity: ent?.kind ?? null, kind: this.manifest?.kind },
          this.tctx,
        )
        devbus.emit('player', 'ilk kare', { viewableId: this.viewableId, state: 'playing', startupMs }, { ms: startupMs })
        break
      }
      case 'duration':
        this.durationSec = e.durationSec
        break
      case 'state':
        if (e.state === 'paused') this.saveBookmark('duraklatıldı')
        if (e.state === 'ended') this.end('ended')
        break
      case 'rebuffer':
        this.rebuffers += 1
        logEvent('playback.rebuffer', { ...this.base(), durationMs: e.durationMs }, this.tctx)
        break
      case 'bitrateSwitch':
        logEvent('playback.bitrateSwitch', { ...this.base(), fromKbps: e.fromKbps, toKbps: e.toKbps, reason: e.reason, height: e.height }, this.tctx)
        break
      case 'cdnSwitch':
        logEvent('playback.cdnSwitch', { ...this.base(), from: e.from, to: e.to, reason: e.reason }, this.tctx)
        break
      case 'error':
        logEvent('playback.error', { ...this.base(), code: e.error.code, message: e.error.message }, this.tctx)
        break
      case 'tracks':
        break
    }
  }

  private heartbeat(): void {
    const a = this.adapter
    if (!a || a.state() !== 'playing') return
    const s = a.stats()
    logEvent(
      'playback.heartbeat',
      { ...this.base(), bitrateKbps: s?.bitrateKbps ?? null, bufferSec: s?.bufferSec ?? null, cdnId: s?.cdnId ?? null, rebuffers: this.rebuffers },
      this.tctx,
    )
    this.saveBookmark('kalp atışı')
  }

  /** Yer imini kaydeder (canlıda yapılmaz). */
  saveBookmark(reason: string): void {
    if (this.live || !this.adapter) return
    const pos = this.adapter.position()
    if (!this.started && pos < 1) return
    const p = Math.floor(pos)
    if (p === this.lastSavedPos) return
    this.lastSavedPos = p
    const dur = this.adapter.duration() || this.durationSec || null
    devbus.emit('player', `yer imi: ${p} sn`, { viewableId: this.viewableId, positionSec: p, durationSec: dur, reason })
    saveBookmark(this.viewableId, p, dur).catch(() => undefined)
  }

  /** Oynatma sonu: bitti ya da sayfadan çıkıldı. */
  end(reason: 'ended' | 'exit' | 'zap' | 'source'): void {
    if (this.ended) return
    this.ended = true
    this.saveBookmark(reason === 'ended' ? 'bitti' : 'çıkış')
    logEvent('playback.end', { ...this.base(), reason, durationSec: Math.round(this.durationSec), rebuffers: this.rebuffers }, this.tctx)
  }

  dispose(reason: 'exit' | 'zap' = 'exit'): void {
    this.end(reason)
    this.off?.()
    this.off = null
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    this.adapter = null
  }
}
