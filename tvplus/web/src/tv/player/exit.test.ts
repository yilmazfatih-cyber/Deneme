import { describe, expect, it } from 'vitest'
import { castFromEvent, endedExit, fallbackExit, matchCast, resolveExit, type ExitInput } from './exit'

const base: ExitInput = { viewableId: 'Video:80010001', cast: false, continued: null, originScreen: null, canGoBack: false }

describe('çıkış hedefi', () => {
  it('yansıtmayla açıldıysa Ana Sayfa', () => {
    expect(resolveExit({ ...base, cast: true, canGoBack: true, originScreen: 'ayarlar' })).toEqual({
      kind: 'path',
      path: '/tv',
    })
  })
  it('detay / Canlı TV / Rehber ekranından gelindiyse geçmişte geri', () => {
    for (const s of ['detay-80010001', 'canli', 'rehber', 'ana'])
      expect(resolveExit({ ...base, originScreen: s, canGoBack: true })).toEqual({ kind: 'history' })
  })
  it('zap ya da sonraki bölüm önceki planı sürdürür (yansıtmadan gelen Ana Sayfa planı dahil)', () => {
    expect(resolveExit({ ...base, viewableId: 'Channel:20', continued: { kind: 'path', path: '/tv' } })).toEqual({
      kind: 'path',
      path: '/tv',
    })
    expect(resolveExit({ ...base, continued: { kind: 'history' }, canGoBack: true })).toEqual({ kind: 'history' })
  })
  it('geçmiş yoksa içeriğe göre', () => {
    expect(resolveExit({ ...base, originScreen: 'canli', canGoBack: false })).toEqual({
      kind: 'path',
      path: '/tv/baslik/80010001',
    })
    expect(fallbackExit('Channel:1')).toBe('/tv/canli')
    expect(fallbackExit('Airing:abc')).toBe('/tv/rehber')
    expect(fallbackExit('garip')).toBe('/tv')
  })
})

describe('bitişte', () => {
  it('film detayına döner; detaydan gelindiyse geçmişte geri', () => {
    expect(
      endedExit({ typename: 'Movie', videoId: 5, plan: { kind: 'history' }, originScreen: 'detay-5' }),
    ).toEqual({ kind: 'history' })
    expect(endedExit({ typename: 'Movie', videoId: 5, plan: { kind: 'history' }, originScreen: 'ana' })).toEqual({
      kind: 'path',
      path: '/tv/baslik/5',
    })
    expect(endedExit({ typename: 'Movie', videoId: 5, plan: { kind: 'path', path: '/tv' }, originScreen: null })).toEqual(
      { kind: 'path', path: '/tv/baslik/5' },
    )
  })
  it('bölüm ve kanal oynatıcıya bırakılır', () => {
    expect(endedExit({ typename: 'Episode', videoId: 7, plan: { kind: 'history' }, originScreen: null })).toBeNull()
    expect(endedExit({ typename: null, videoId: null, plan: { kind: 'history' }, originScreen: null })).toBeNull()
  })
})

describe('yansıtma kaydı', () => {
  const ev = {
    cat: 'device' as const,
    label: 'komut ← Deniz’in telefonu',
    at: 1000,
    detail: { from: { name: 'Deniz’in telefonu' }, command: { type: 'CAST', viewableId: 'Channel:1' } },
  }
  it('CAST komutunu tanır, diğerlerini atlar', () => {
    expect(castFromEvent(ev)).toEqual({ viewableId: 'Channel:1', from: 'Deniz’in telefonu', at: 1000 })
    expect(castFromEvent({ ...ev, detail: { command: { type: 'KEY', key: 'OK' } } })).toBeNull()
    expect(castFromEvent({ ...ev, label: 'komut → TV' })).toBeNull()
  })
  it('yalnız aynı içerik ve taze kayıt eşleşir', () => {
    const rec = castFromEvent(ev)
    expect(matchCast(rec, 'Channel:1', 3000)).not.toBeNull()
    expect(matchCast(rec, 'Channel:2', 3000)).toBeNull()
    expect(matchCast(rec, 'Channel:1', 60_000)).toBeNull()
  })
})
