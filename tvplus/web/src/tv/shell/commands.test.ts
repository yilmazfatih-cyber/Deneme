import { describe, expect, it, vi } from 'vitest'
import type { RemoteCommand, RemoteCommandEnvelope } from '../../../../shared/devices'
import {
  createCommandRouter,
  playbackOf,
  TextTargetRegistry,
  type CommandDeps,
  type PlayerRemoteLike,
} from './commands'
import { deviceScreenOf, railSectionOf, tvRedirectFor, watchPath } from './routes'

const env = (command: RemoteCommand, kind: 'MOBILE' | 'TV' | 'WEB' = 'MOBILE'): RemoteCommandEnvelope => ({
  id: 'k1',
  at: '2026-11-13T10:00:00.000Z',
  from: { deviceId: 'tel', name: "Deniz'in telefonu", kind },
  command,
})

function fakes(player: PlayerRemoteLike | null = null) {
  const calls: string[] = []
  const deps: CommandDeps = {
    dispatchKey: vi.fn(() => true),
    navigate: vi.fn((to: string) => calls.push(`git ${to}`)),
    back: vi.fn(() => calls.push('geri')),
    toast: vi.fn((t: string) => calls.push(`bildirim ${t}`)),
    player: () => player,
    sendCommand: vi.fn(async () => true),
    deviceName: (id) => (id === 'tel' ? "Deniz'in telefonu" : null),
    now: () => Date.parse('2026-11-13T10:00:10.000Z'),
  }
  const texts = new TextTargetRegistry()
  return { deps, calls, texts, router: createCommandRouter(deps, texts) }
}

describe('komut yönlendirme', () => {
  it('KEY → dispatchKey; telefondan ilk tuşta tek seferlik ipucu', () => {
    const f = fakes()
    expect(f.router.handle(env({ type: 'KEY', key: 'DOWN' }))).toBe(true)
    f.router.handle(env({ type: 'KEY', key: 'OK' }))
    expect(f.deps.dispatchKey).toHaveBeenNthCalledWith(1, 'DOWN')
    expect(f.deps.dispatchKey).toHaveBeenNthCalledWith(2, 'OK')
    expect(f.deps.toast).toHaveBeenCalledTimes(1)
    expect(f.deps.toast).toHaveBeenCalledWith('Telefon kumandası bağlı', 'phone')
  })

  it('TEXT: hedef varsa doğrudan uygular', () => {
    const f = fakes()
    const setText = vi.fn()
    const submit = vi.fn()
    f.texts.register({ setText, submit })
    f.router.handle(env({ type: 'TEXT', text: 'kuzgun' }))
    expect(setText).toHaveBeenCalledWith('kuzgun')
    expect(submit).not.toHaveBeenCalled()
    f.router.handle(env({ type: 'TEXT', text: 'kuzgun', submit: true }))
    expect(submit).toHaveBeenCalledOnce()
    expect(f.deps.navigate).not.toHaveBeenCalled()
  })

  it('TEXT: hedef yoksa önce aramaya gider, hedef kaydolunca uygular', () => {
    const f = fakes()
    f.router.handle(env({ type: 'TEXT', text: 'ku' }))
    f.router.handle(env({ type: 'TEXT', text: 'kuz', submit: true }))
    expect(f.calls).toEqual(['git /tv/ara', 'git /tv/ara'])
    const setText = vi.fn()
    const submit = vi.fn()
    const off = f.texts.register({ setText, submit })
    expect(setText).toHaveBeenCalledWith('kuz')
    expect(submit).toHaveBeenCalledOnce()
    off()
    expect(f.texts.current()).toBeNull()
  })

  it('CAST → oynatma yolu + "‹cihaz› gönderdi"', () => {
    const f = fakes()
    f.router.handle(env({ type: 'CAST', viewableId: 'v42', positionSec: 61.7, startOver: false, tctx: 'a b' }))
    expect(f.calls).toEqual(['git /tv/izle/v42?konum=61&tctx=a+b', "bildirim Deniz'in telefonu gönderdi"])
    const g = fakes()
    g.router.handle(env({ type: 'CAST', viewableId: 'v42', startOver: true }))
    expect(g.calls[0]).toBe('git /tv/izle/v42?baslat=bastan')
  })

  it('NAVIGATE yalnız /tv yollarını kabul eder', () => {
    const f = fakes()
    expect(f.router.handle(env({ type: 'NAVIGATE', route: '/tv/rehber' }))).toBe(true)
    expect(f.router.handle(env({ type: 'NAVIGATE', route: '/karsilama' }))).toBe(false)
    expect(f.router.handle(env({ type: 'NAVIGATE', route: 'https://kotu.example/tv' }))).toBe(false)
    expect(f.calls).toEqual(['git /tv/rehber'])
  })

  it('KEY: oynatıcı takılıysa ona gider; false dönerse odak motoruna düşer', () => {
    const dispatch = vi.fn((c: { type: string }) => c.type === 'KEY')
    const f = fakes({ dispatch, getState: () => ({ viewableId: 'v1' }) })
    f.router.handle(env({ type: 'KEY', key: 'UP' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'KEY', key: 'UP' })
    expect(f.deps.dispatchKey).not.toHaveBeenCalled()
    const g = fakes({ dispatch: vi.fn(() => false), getState: () => null })
    g.router.handle(env({ type: 'KEY', key: 'UP' }))
    expect(g.deps.dispatchKey).toHaveBeenCalledWith('UP')
  })

  it('SEEK / VOLUME / STOP oynatıcı yoksa işlenmez; varsa iletilir (STOP sonrası çıkışı oynatıcı yapar)', () => {
    const none = fakes()
    expect(none.router.handle(env({ type: 'SEEK', positionSec: 30 }))).toBe(false)
    expect(none.router.handle(env({ type: 'STOP' }))).toBe(false)
    const dispatch = vi.fn(() => true)
    const f = fakes({ dispatch, getState: () => null })
    expect(f.router.handle(env({ type: 'SEEK', positionSec: 30 }))).toBe(true)
    expect(f.router.handle(env({ type: 'VOLUME', volume: 40 }))).toBe(true)
    expect(f.router.handle(env({ type: 'STOP' }))).toBe(true)
    expect(dispatch.mock.calls.map((c) => (c as unknown as [RemoteCommand])[0].type)).toEqual([
      'SEEK',
      'VOLUME',
      'STOP',
    ])
    expect(f.calls).toEqual([])
  })

  it('TRANSFER: konumu okur, durdurur, hedefe CAST yollar', async () => {
    const dispatch = vi.fn(() => true)
    const f = fakes({
      dispatch,
      getState: () => ({
        viewableId: 'v7',
        positionSec: 100,
        paused: false,
        durationSec: 3000,
        updatedAt: '2026-11-13T10:00:00.000Z',
      }),
    })
    expect(f.router.handle(env({ type: 'TRANSFER', toDeviceId: 'tel' }))).toBe(true)
    expect(dispatch).toHaveBeenCalledWith({ type: 'STOP' })
    expect(f.deps.sendCommand).toHaveBeenCalledWith('tel', { type: 'CAST', viewableId: 'v7', positionSec: 110 })
    await Promise.resolve()
    await Promise.resolve()
    expect(f.calls).toEqual(["bildirim Devam ediyor: Deniz'in telefonu"])
  })

  it('TRANSFER: oynatma yoksa hiçbir şey yapmaz', () => {
    const f = fakes({ dispatch: vi.fn(() => true), getState: () => null })
    expect(f.router.handle(env({ type: 'TRANSFER', toDeviceId: 'tel' }))).toBe(false)
    expect(f.deps.sendCommand).not.toHaveBeenCalled()
  })
})

describe('playbackOf', () => {
  const now = Date.parse('2026-11-13T10:00:10.000Z')
  it('duraklatılmışsa konum ilerletilmez, süreyle sınırlanır', () => {
    expect(
      playbackOf({ viewableId: 'a', positionSec: 5, paused: true, updatedAt: '2026-11-13T10:00:00.000Z' }, now),
    ).toEqual({
      viewableId: 'a',
      positionSec: 5,
    })
    expect(
      playbackOf(
        { viewableId: 'a', positionSec: 95, paused: false, durationSec: 100, updatedAt: '2026-11-13T10:00:00.000Z' },
        now,
      ),
    ).toEqual({ viewableId: 'a', positionSec: 100 })
    expect(playbackOf({ positionSec: 1 }, now)).toBeNull()
  })
})

describe('yollar', () => {
  it('web yolları TV karşılığına yönlenir', () => {
    expect(tvRedirectFor('/')).toBe('/tv')
    expect(tvRedirectFor('/goz-at')).toBe('/tv')
    expect(tvRedirectFor('/izle/v9', '?tctx=x')).toBe('/tv/izle/v9?tctx=x')
    expect(tvRedirectFor('/canli')).toBe('/tv/canli')
    expect(tvRedirectFor('/ara')).toBe('/tv/ara')
    expect(tvRedirectFor('/karsilama')).toBe('/tv')
    expect(tvRedirectFor('/goz-at/diziler/')).toBe('/tv')
  })
  it('watchPath', () => {
    expect(watchPath('a/b')).toBe('/tv/izle/a%2Fb')
    expect(watchPath('v1', { positionSec: 0, startOver: true })).toBe('/tv/izle/v1?baslat=bastan')
  })
  it('ekran ve yan menü bölümü', () => {
    expect(deviceScreenOf('/tv')).toBe('home')
    expect(deviceScreenOf('/tv/izle/v1')).toBe('player')
    expect(deviceScreenOf('/tv/baslik/3/bolumler')).toBe('detail')
    expect(deviceScreenOf('/tv/ayarlar')).toBe('other')
    expect(railSectionOf('/tv/rehber')).toBe('canli')
    expect(railSectionOf('/tv/kategori/movies')).toBe('filmler')
    expect(railSectionOf('/tv/baslik/3')).toBeNull()
  })
})
