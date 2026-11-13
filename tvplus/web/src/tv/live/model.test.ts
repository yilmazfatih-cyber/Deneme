import { describe, expect, it } from 'vitest'
import {
  airingProgress,
  applyFilter,
  clockOffset,
  expireEntry,
  liveFilters,
  NUMBER_ENTRY_MS,
  nextRefreshAt,
  nowNext,
  typeDigit,
} from './model'

const T0 = Date.parse('2026-11-13T18:00:00Z')
const iso = (minFromT0: number): string => new Date(T0 + minFromT0 * 60_000).toISOString()
const air = (id: string, from: number, to: number) => ({ airingId: id, startAt: iso(from), endAt: iso(to) })

describe('nowNext', () => {
  const list = [air('c', 60, 90), air('a', 0, 30), air('b', 30, 60), air('d', 90, 150)]

  it('sunucu saatine göre şimdiki yayını ve sıradaki ikisini seçer (sırasız girdi)', () => {
    const r = nowNext(list, T0 + 45 * 60_000)
    expect(r.now?.airingId).toBe('b')
    expect(r.next.map((a) => a.airingId)).toEqual(['c', 'd'])
  })

  it('sınırda başlayan yayın şimdiki sayılır (bitiş hariç, başlangıç dahil)', () => {
    const r = nowNext(list, T0 + 30 * 60_000)
    expect(r.now?.airingId).toBe('b')
  })

  it('yayın yoksa (boşluk) şimdiki null, sıradakiler şimdiden sonrakiler', () => {
    const gap = [air('a', 0, 30), air('b', 60, 90), air('c', 90, 120)]
    const r = nowNext(gap, T0 + 40 * 60_000)
    expect(r.now).toBeNull()
    expect(r.next.map((a) => a.airingId)).toEqual(['b', 'c'])
  })

  it('aynı yayın iki kez gelirse bir kez sayılır', () => {
    const r = nowNext([air('a', 0, 30), air('a', 0, 30), air('b', 30, 60)], T0 + 10 * 60_000)
    expect(r.now?.airingId).toBe('a')
    expect(r.next.map((a) => a.airingId)).toEqual(['b'])
  })

  it('ilerleme 0–1 aralığında', () => {
    expect(airingProgress(air('a', 0, 60), T0 + 15 * 60_000)).toBeCloseTo(0.25)
    expect(airingProgress(air('a', 0, 60), T0 - 1)).toBe(0)
    expect(airingProgress(air('a', 0, 60), T0 + 99 * 60_000)).toBe(1)
  })
})

describe('süzgeç', () => {
  const chans = [
    { channelId: 1, category: 'film-dizi', categoryName: 'Film & Dizi', fav: true },
    { channelId: 20, category: 'haber', categoryName: 'Haber', fav: true },
    { channelId: 24, category: 'haber', categoryName: 'Haber', fav: false },
    { channelId: 60, category: 'cocuk', categoryName: 'Çocuk', fav: false },
  ]
  it('Tümü · Kanallarım · kategoriler (ilk görünme sırasıyla, tekrarsız)', () => {
    expect(liveFilters(chans).map((f) => f.label)).toEqual(['Tümü', 'Kanallarım', 'Film & Dizi', 'Haber', 'Çocuk'])
  })
  it('kategoriye ve Kanallarım\'a göre süzer', () => {
    const fav = (c: (typeof chans)[number]): boolean => c.fav
    expect(applyFilter(chans, 'kategori:haber', fav).map((c) => c.channelId)).toEqual([20, 24])
    expect(applyFilter(chans, 'kanallarim', fav).map((c) => c.channelId)).toEqual([1, 20])
    expect(applyFilter(chans, 'tumu', fav)).toHaveLength(4)
  })
})

describe('kanal numarası girişi', () => {
  const numbers = [1, 20, 21, 22, 23, 24, 26, 27, 28, 29, 30, 32, 60]

  it('daha uzun bir numaranın öneki değilse hemen geçer: "1" → 1', () => {
    expect(typeDigit(null, 1, numbers, 0)).toEqual({ entry: null, commit: 1 })
  })

  it('önekse bekler, ikinci hanede geçer: "2" → bekle, "21" → 21', () => {
    const a = typeDigit(null, 2, numbers, 0)
    expect(a.commit).toBeNull()
    expect(a.entry?.digits).toBe('2')
    const b = typeDigit(a.entry, 1, numbers, 500)
    expect(b).toEqual({ entry: null, commit: 21 })
  })

  it('süre dolunca yazılanla geçer ("2" + 2 sn → 2; listede olmasa da numara bildirilir)', () => {
    const a = typeDigit(null, 2, numbers, 0)
    expect(expireEntry(a.entry, NUMBER_ENTRY_MS - 1).commit).toBeNull()
    expect(expireEntry(a.entry, NUMBER_ENTRY_MS)).toEqual({ entry: null, commit: 2 })
  })

  it('süresi geçmiş girişe yeni rakam yeni giriş başlatır', () => {
    const a = typeDigit(null, 2, numbers, 0)
    const b = typeDigit(a.entry, 6, numbers, NUMBER_ENTRY_MS + 10)
    expect(b).toEqual({ entry: { digits: '6', at: NUMBER_ENTRY_MS + 10 }, commit: null })
  })

  it('en uzun numara kadar hane yazılınca geçer; baştaki sıfır yok sayılır', () => {
    const three = [1, 100, 105]
    const a = typeDigit(null, 1, three, 0)
    expect(a.commit).toBeNull()
    const b = typeDigit(a.entry, 0, three, 10)
    expect(b.commit).toBeNull()
    expect(typeDigit(b.entry, 5, three, 20).commit).toBe(105)
    expect(typeDigit(null, 0, three, 0)).toEqual({ entry: null, commit: null })
  })

  it('hiçbir numarayla başlamayan rakam hemen bildirilir (ekran "yok" der)', () => {
    expect(typeDigit(null, 9, numbers, 0)).toEqual({ entry: null, commit: 9 })
  })
})

describe('sunucu saati ve yeniden çekme', () => {
  it('saat farkı', () => {
    expect(clockOffset('2026-11-13T18:00:05Z', T0)).toBe(5000)
    expect(clockOffset('bozuk', T0)).toBe(0)
  })
  it('en kısa TTL ile ilk program sınırının erkeni', () => {
    expect(nextRefreshAt([60, 300], [iso(10), iso(-5), null], T0)).toBe(T0 + 60_000)
    expect(nextRefreshAt([60], [iso(0.5)], T0)).toBe(T0 + 30_000)
    expect(nextRefreshAt([], [], T0)).toBeNull()
  })
})
