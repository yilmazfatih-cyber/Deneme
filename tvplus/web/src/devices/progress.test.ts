import { describe, expect, it } from 'vitest'
import type { DeviceInfo, NowPlaying } from '../../../shared/devices'
import {
  applyOptimistic,
  castTargets,
  formatClockSec,
  MAX_EXTRAPOLATE_SEC,
  pickerDevices,
  playingOn,
  positionAt,
  progressAt,
} from './progress'

const T0 = Date.parse('2026-11-13T20:00:00.000Z')
const np = (p: Partial<NowPlaying> = {}): NowPlaying => ({
  viewableId: 'Video:80010001',
  title: 'Sintel',
  subtitle: null,
  artUrl: null,
  live: false,
  positionSec: 100,
  durationSec: 888,
  paused: false,
  volume: 80,
  muted: false,
  updatedAt: new Date(T0).toISOString(),
  ...p,
})
const dev = (p: Partial<DeviceInfo>): DeviceInfo => ({
  deviceId: 'd',
  kind: 'TV',
  name: 'TV',
  online: true,
  isThisDevice: false,
  lastSeenAt: new Date(T0).toISOString(),
  profileName: null,
  screen: 'home',
  nowPlaying: null,
  ...p,
})

describe('konumun yerelde ilerletilmesi', () => {
  it('oynarken bildirimden bu yana geçen süre eklenir', () => {
    expect(positionAt(np(), T0 + 5_500)).toBeCloseTo(105.5)
  })
  it('duraklatılmışken konum sabit', () => {
    expect(positionAt(np({ paused: true }), T0 + 60_000)).toBe(100)
  })
  it('süreyi aşmaz', () => {
    expect(positionAt(np({ positionSec: 880 }), T0 + 60_000)).toBe(888)
  })
  it('saat geride kalırsa (gelecek tarihli bildirim) geri gitmez', () => {
    expect(positionAt(np(), T0 - 10_000)).toBe(100)
  })
  it('uzun kopuklukta en çok MAX_EXTRAPOLATE_SEC ilerler', () => {
    expect(positionAt(np({ durationSec: null }), T0 + 10 * 3600_000)).toBe(100 + MAX_EXTRAPOLATE_SEC)
  })
  it('geçersiz tarih ilerletmez', () => {
    expect(positionAt(np({ updatedAt: 'x' }), T0 + 9_000)).toBe(100)
  })
  it('ilerleme oranı; canlıda ve süresizde null', () => {
    expect(progressAt(np({ positionSec: 444, paused: true }), T0)).toBeCloseTo(0.5)
    expect(progressAt(np({ live: true }), T0)).toBeNull()
    expect(progressAt(np({ durationSec: null }), T0)).toBeNull()
  })
  it('saat biçimi', () => {
    expect(formatClockSec(65)).toBe('1:05')
    expect(formatClockSec(3725)).toBe('1:02:05')
    expect(formatClockSec(-3)).toBe('0:00')
  })
})

describe('iyimser katman', () => {
  it('aynı bildirime dayanıyorsa uygulanır, konum o andan yeniden ilerler', () => {
    const base = np()
    const o = { paused: true, basedOn: base.updatedAt, at: T0 + 2000 }
    const out = applyOptimistic(base, o, T0 + 3000)
    expect(out.paused).toBe(true)
    expect(out.positionSec).toBeCloseTo(102)
    expect(positionAt(out, T0 + 9000)).toBeCloseTo(102)
  })
  it('TV yeni bildirim yollayınca ya da süre dolunca düşer', () => {
    const base = np()
    const o = { paused: true, basedOn: 'eski', at: T0 }
    expect(applyOptimistic(base, o, T0)).toBe(base)
    const o2 = { paused: true, basedOn: base.updatedAt, at: T0 }
    expect(applyOptimistic(base, o2, T0 + 10_000)).toBe(base)
  })
  it('sarma hedefi konumu değiştirir', () => {
    const base = np()
    const out = applyOptimistic(base, { positionSec: 300, basedOn: base.updatedAt, at: T0 + 1000 }, T0 + 2000)
    expect(positionAt(out, T0 + 2000)).toBeCloseTo(301)
  })
})

describe('cihaz listesi', () => {
  const list = [
    dev({ deviceId: 'a', name: 'Yatak odası', online: false }),
    dev({ deviceId: 'b', name: 'Salon' }),
    dev({ deviceId: 'c', name: 'Bu TV', isThisDevice: true }),
    dev({ deviceId: 'd', kind: 'MOBILE', name: 'Telefon' }),
  ]
  it('yansıtılabilir: çevrimiçi, TV, bu cihaz değil', () => {
    expect(castTargets(list).map((d) => d.deviceId)).toEqual(['b'])
  })
  it('seçici: önce çevrimiçiler', () => {
    expect(pickerDevices(list).map((d) => d.deviceId)).toEqual(['b', 'a'])
  })
  it('playingOn: çevrimdışı ya da bu cihazsa null', () => {
    expect(playingOn(dev({ nowPlaying: np() }))?.title).toBe('Sintel')
    expect(playingOn(dev({ online: false, nowPlaying: np() }))).toBeNull()
    expect(playingOn(null)).toBeNull()
  })
})
