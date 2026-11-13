import { describe, expect, it } from 'vitest'
import type { DeviceInfo, NowPlaying, RemoteCommand } from '../../../shared/devices'
import { afterCastRoute, castCommand, createCastController, watchHref, type CastDeps } from './cast'
import type { DeviceClientState } from './client-core'

const T0 = Date.parse('2026-11-13T20:00:00.000Z')
const tv = (p: Partial<DeviceInfo>): DeviceInfo => ({
  deviceId: 'tv1',
  kind: 'TV',
  name: 'Salon TV',
  online: true,
  isThisDevice: false,
  lastSeenAt: '',
  profileName: null,
  screen: 'home',
  nowPlaying: null,
  ...p,
})

function setup(devices: DeviceInfo[], o: { delivered?: boolean; player?: boolean; ff?: 'mobile' | 'desktop' } = {}) {
  const log: string[] = []
  const sent: { id: string; cmd: RemoteCommand }[] = []
  let player = o.player ?? false
  const state: DeviceClientState = { connection: 'online', thisDevice: null, devices, targetDeviceId: null }
  const deps: CastDeps = {
    getState: () => state,
    setTarget: (id) => log.push(`target ${id}`),
    sendCommand: async (id, cmd) => {
      sent.push({ id, cmd })
      return o.delivered ?? true
    },
    hasLocalPlayer: () => player,
    leaveLocalPlayer: async (to) => {
      player = false
      log.push(`leave local → ${to}`)
    },
    formFactor: () => o.ff ?? 'mobile',
    navigate: (to) => log.push(`go ${to}`),
    toast: (m) => log.push(`toast ${m}`),
    openPicker: (req) => log.push(`picker ${req?.viewableId}`),
    now: () => T0 + 4000,
  }
  return { c: createCastController(deps), log, sent }
}
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('yansıtma', () => {
  it('tek çevrimiçi TV: hemen yansıtır, yerel oynatıcıyı durdurur, telefonda kumandaya geçer', async () => {
    const s = setup([tv({}), tv({ deviceId: 'off', online: false })], { player: true })
    s.c.request({ viewableId: 'Video:80010001', positionSec: 61.7 })
    await flush()
    expect(s.sent).toEqual([{ id: 'tv1', cmd: { type: 'CAST', viewableId: 'Video:80010001', positionSec: 61 } }])
    expect(s.log).toEqual(['target tv1', 'toast Salon TV cihazında açılıyor', 'leave local → /kumanda'])
  })
  it('masaüstünde oynatıcıdan yansıtınca başlığın detayına geçer (geçmişte geri gidilmez)', async () => {
    const s = setup([tv({})], { ff: 'desktop', player: true })
    s.c.request({ viewableId: 'Video:80010001', positionSec: 10 })
    await flush()
    expect(s.log.at(-1)).toBe('leave local → /goz-at?jbv=80010001')
    expect(afterCastRoute('Channel:1')).toBe('/canli')
  })
  it('masaüstünde oynatıcı yokken sayfada kalır', async () => {
    const s = setup([tv({})], { ff: 'desktop' })
    s.c.request({ viewableId: 'Channel:1' })
    await flush()
    expect(s.sent[0]!.cmd).toEqual({ type: 'CAST', viewableId: 'Channel:1' })
    expect(s.log.some((l) => l.startsWith('go'))).toBe(false)
  })
  it('birden çok TV: seçici açılır', () => {
    const s = setup([tv({}), tv({ deviceId: 'tv2', name: 'Yatak' })])
    s.c.request({ viewableId: 'x' })
    expect(s.log).toEqual(['picker x'])
    expect(s.sent).toEqual([])
  })
  it('TV yok: sakin bildirim', () => {
    const s = setup([tv({ online: false }), tv({ deviceId: 'me', isThisDevice: true })])
    s.c.request({ viewableId: 'x' })
    expect(s.log.length).toBe(1)
    expect(s.log[0]).toMatch(/^toast Yansıtılacak TV bulunamadı/)
  })
  it('teslim edilmezse yerel oynatma sürer, gezinme yok', async () => {
    const s = setup([tv({})], { delivered: false, player: true })
    expect(await s.c.castTo(tv({}), { viewableId: 'x' })).toBe(false)
    expect(s.log).toEqual(['target tv1', 'toast Salon TV yanıt vermedi. Burada izlemeye devam edebilirsin.'])
  })
  it('Bu Cihazda Devam Et: TV durur, konum ilerletilmiş olarak burada açılır', async () => {
    const np: NowPlaying = {
      viewableId: 'Video:80010001',
      title: 'Sintel',
      subtitle: null,
      artUrl: null,
      live: false,
      positionSec: 120,
      durationSec: 888,
      paused: false,
      volume: 100,
      muted: false,
      updatedAt: new Date(T0).toISOString(),
    }
    const s = setup([tv({ nowPlaying: np })])
    await s.c.continueHere(tv({}), np)
    expect(s.sent).toEqual([{ id: 'tv1', cmd: { type: 'STOP' } }])
    expect(s.log).toEqual(['go /izle/Video:80010001?konum=124'])
  })
  it('komut ve adres biçimi', () => {
    expect(castCommand({ viewableId: 'a', positionSec: 0, startOver: true, tctx: 't' })).toEqual({
      type: 'CAST',
      viewableId: 'a',
      startOver: true,
      tctx: 't',
    })
    expect(watchHref('Channel:1', null)).toBe('/izle/Channel:1')
  })
})
