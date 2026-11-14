import { describe, expect, it } from 'vitest'
import type { EmbedManifest } from '../../../../shared/playback'
import type { PlayerAdapter } from '../adapters/types'
import { YouTubeAdapter } from '../adapters/youtube'
import { makeSnapshot } from '../remote'
import { readAdapter } from './readout'

const manifest = {
  kind: 'EXTERNAL_EMBED',
  provider: 'YOUTUBE',
  viewableId: 'Video:80031101',
  videoId: 'abc',
  liveChannelId: null,
  startSec: 0,
  title: 'Deneme',
  durationMs: null,
  live: null,
  bookmark: null,
  alternatives: ['YOUTUBE'],
  attribution: null,
} as unknown as EmbedManifest

describe('readAdapter: çizim sırasında okuma asla fırlatmaz', () => {
  it('YouTube oynatıcısı henüz yöntemsizken (onReady öncesi) yedek değerler', () => {
    const a = new YouTubeAdapter(manifest, { startSec: 0, autoplay: true, muted: false })
    // IFrame API'nin hazır olmadan döndürdüğü nesne: hiçbir yöntemi yok
    ;(a as unknown as { player: object }).player = {}
    const r = readAdapter(a, 12, 600)
    expect(r).toMatchObject({ state: 'loading', volume: 1, muted: false, duration: 600 })
    expect(Number.isFinite(r.position)).toBe(true)
    const s = makeSnapshot({
      viewableId: 'Video:80031101',
      title: 'Deneme',
      subtitle: null,
      artUrl: null,
      live: false,
      positionSec: r.position,
      durationSec: r.duration,
      state: r.state,
      volume: r.volume,
      muted: r.muted,
      sourceKind: 'YOUTUBE',
      chrome: 'tv',
    })
    expect(s.volume).toBe(100)
    expect(s.state).toBe('loading')
    // Komut yolu da fırlatmaz
    expect(() => {
      a.setVolume(0.5)
      a.setMuted(true)
      void a.play()
      a.pause()
      a.seek(10)
    }).not.toThrow()
  })

  it('her yöntemi fırlatan bağdaştırıcıda da yedek değerler', () => {
    const boom = (): never => {
      throw new Error('hazır değil')
    }
    const a = new Proxy({} as PlayerAdapter, { get: () => boom })
    const r = readAdapter(a, 5, 0)
    expect(r).toEqual({
      state: 'loading',
      position: 5,
      duration: 0,
      volume: 1,
      muted: false,
      buffered: [],
      audio: [],
      currentAudio: null,
    })
  })

  it('NaN / tanımsız değerler yedeğe düşer, ses 0–1 aralığına sıkıştırılır', () => {
    const a = {
      state: () => 'playing',
      position: () => Number.NaN,
      duration: () => Number.NaN,
      volume: () => 7,
      muted: () => undefined,
      buffered: () => null,
      audioOptions: () => [],
      currentAudio: () => 'a1',
    } as unknown as PlayerAdapter
    expect(readAdapter(a, 3, 100)).toMatchObject({
      state: 'playing',
      position: 3,
      duration: 100,
      volume: 1,
      muted: false,
      buffered: [],
    })
  })
})

describe('tvButtonStep: oynatılamıyor / hata düğmeleri', () => {
  it('◀/▶ odağı sınırlar içinde taşır, OK etkinleştirir, Geri her zaman çıkar', async () => {
    const { tvButtonStep, errorButtons } = await import('./common')
    expect(errorButtons(true)).toEqual(['retry', 'back'])
    expect(tvButtonStep('RIGHT', 0, 2)).toMatchObject({ focus: 1, action: null })
    expect(tvButtonStep('RIGHT', 1, 2).focus).toBe(1)
    expect(tvButtonStep('LEFT', 0, 2).focus).toBe(0)
    expect(tvButtonStep('OK', 1, 2).action).toBe('activate')
    expect(tvButtonStep('BACK', 0, 2).action).toBe('back')
    // Yüklenirken düğme yok: OK bir şey yapmaz, Geri yine çıkar
    expect(tvButtonStep('OK', 0, 0).action).toBeNull()
    expect(tvButtonStep('BACK', 0, 0).action).toBe('back')
    expect(tvButtonStep('DIGIT_1', 0, 2).handled).toBe(false)
  })
})
