import { describe, expect, it } from 'vitest'
import { airingAction, catchupHint, catchupOpen, liveWatchPath, locativeSuffix, packageLock, timeStateOf, upcomingNote, type AiringLike } from './airing'
import type { AccessData } from './types'

const PLAYABLE: AccessData = { state: 'PLAYABLE', reasonText: null, requiredProduct: null, requiredProductName: null, cta: null }
const H = 3_600_000
// 13 Kasım 2026 12:00 Türkiye saati (UTC+3)
const NOW = Date.parse('2026-11-13T09:00:00Z')

function airing(over: Partial<AiringLike> = {}): AiringLike {
  return {
    airingId: '1-20261113-1100',
    startAt: new Date(NOW - H).toISOString(),
    endAt: new Date(NOW + H).toISOString(),
    startOver: true,
    catchup: { available: false, until: new Date(NOW + 7 * 24 * H).toISOString() },
    access: PLAYABLE,
    ...over,
  }
}

describe('yayın durumu', () => {
  it('istemci saatinden hesaplanır', () => {
    const a = airing()
    expect(timeStateOf(a.startAt, a.endAt, NOW - 2 * H)).toBe('UPCOMING')
    expect(timeStateOf(a.startAt, a.endAt, NOW)).toBe('LIVE')
    expect(timeStateOf(a.startAt, a.endAt, NOW + H)).toBe('ENDED')
  })
})

describe('airingAction', () => {
  it('LIVE + startOver → Canlı izle + Baştan başlat', () => {
    const r = airingAction(airing(), 1, NOW, '0,1,x,2,,,,,,,Channel:1,')
    expect(r.kind).toBe('live')
    if (r.kind !== 'live') return
    expect(r.primary).toEqual({ label: 'Canlı izle', to: '/izle/Channel:1?tctx=0%2C1%2Cx%2C2%2C%2C%2C%2C%2C%2C%2CChannel%3A1%2C' })
    expect(r.secondary?.label).toBe('Baştan başlat')
    expect(r.secondary?.to).toContain('baslat=bastan')
  })

  it('LIVE, startOver yok → ikincil eylem yok', () => {
    const r = airingAction(airing({ startOver: false }), 20, NOW)
    expect(r.kind === 'live' && r.secondary).toBe(null)
  })

  it('ENDED + geri al penceresi açık → İzle (Airing:<id>)', () => {
    const a = airing({ startAt: new Date(NOW - 3 * H).toISOString(), endAt: new Date(NOW - H).toISOString() })
    const r = airingAction(a, 1, NOW)
    expect(r).toEqual({ kind: 'catchup', primary: { label: 'İzle', to: '/izle/Airing:1-20261113-1100' }, hint: null })
  })

  it('ENDED + pencere 24 saatten az → ipucu', () => {
    const a = airing({ startAt: new Date(NOW - 3 * H).toISOString(), endAt: new Date(NOW - H).toISOString(), catchup: { available: true, until: new Date(NOW + 5 * H + 1000).toISOString() } })
    const r = airingAction(a, 1, NOW)
    expect(r.kind === 'catchup' && r.hint).toBe('Son 5 saat')
  })

  it('ENDED, geri al yok → Tekrar izlenemiyor (OUT_OF_WINDOW kilit sayılmaz)', () => {
    const a = airing({
      startAt: new Date(NOW - 3 * H).toISOString(),
      endAt: new Date(NOW - H).toISOString(),
      catchup: { available: false, until: null },
      access: { ...PLAYABLE, state: 'OUT_OF_WINDOW', reasonText: 'Tekrar izlenemiyor' },
    })
    expect(airingAction(a, 20, NOW)).toEqual({ kind: 'ended', note: 'Tekrar izlenemiyor' })
  })

  it('canlıyken biten yayın, yeniden çekmeden önce de doğru eylemi gösterir', () => {
    const a = airing({ endAt: new Date(NOW + 60_000).toISOString() })
    expect(airingAction(a, 1, NOW).kind).toBe('live')
    expect(airingAction(a, 1, NOW + 2 * 60_000).kind).toBe('catchup')
  })

  it('UPCOMING → eylem yok, başlama notu', () => {
    const a = airing({ startAt: '2026-11-13T19:15:00Z', endAt: '2026-11-13T20:15:00Z' })
    expect(airingAction(a, 20, NOW)).toEqual({ kind: 'upcoming', note: "Bugün 22:15'te başlıyor", lockReason: null })
  })

  it('pakette olmayan canlı yayın → kilit + gerekçe', () => {
    const a = airing({ access: { ...PLAYABLE, state: 'UPSELL', reasonText: null, requiredProductName: 'Spor Paketi' } })
    expect(airingAction(a, 40, NOW)).toEqual({ kind: 'locked', reason: 'Spor Paketi ile' })
  })
})

describe('yardımcılar', () => {
  it('bulunma eki saatin okunuşuna uyar', () => {
    expect(locativeSuffix('22:15')).toBe('te')
    expect(locativeSuffix('20:00')).toBe('de')
    expect(locativeSuffix('21:30')).toBe('da')
    expect(locativeSuffix('09:00')).toBe('da')
    expect(locativeSuffix('19:40')).toBe('ta')
    expect(locativeSuffix('00:00')).toBe('da')
    expect(locativeSuffix('13:00')).toBe('te')
  })

  it('başlama notu gün adını taşır', () => {
    expect(upcomingNote('2026-11-14T17:00:00Z', NOW)).toBe("Yarın 20:00'de başlıyor")
  })

  it('geri al ipucu yalnız son 24 saatte', () => {
    expect(catchupHint(new Date(NOW + 30 * H).toISOString(), NOW)).toBe(null)
    expect(catchupHint(new Date(NOW + 20 * H).toISOString(), NOW)).toBe('Son 1 gün')
    expect(catchupHint(new Date(NOW + 30 * 60_000).toISOString(), NOW)).toBe('Son 30 dk')
    expect(catchupHint(new Date(NOW - 1).toISOString(), NOW)).toBe(null)
  })

  it('geri al penceresi: bitmiş ve until geçmemiş', () => {
    const a = { endAt: new Date(NOW - H).toISOString(), catchup: { available: true, until: new Date(NOW + H).toISOString() } }
    expect(catchupOpen(a, NOW)).toBe(true)
    expect(catchupOpen(a, NOW + 2 * H)).toBe(false)
    expect(catchupOpen({ ...a, catchup: { available: false, until: null } }, NOW)).toBe(false)
  })

  it('OUT_OF_WINDOW kilit simgesi almaz', () => {
    expect(packageLock({ ...PLAYABLE, state: 'OUT_OF_WINDOW', reasonText: 'Tekrar izlenemiyor' })).toBe(null)
    expect(packageLock({ ...PLAYABLE, state: 'UPSELL', reasonText: 'Spor Paketi ile' })).toBe('Spor Paketi ile')
  })

  it('izleme yolu', () => {
    expect(liveWatchPath(1)).toBe('/izle/Channel:1')
    expect(liveWatchPath(1, null, true)).toBe('/izle/Channel:1?baslat=bastan')
  })
})
