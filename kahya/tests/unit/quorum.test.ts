import { describe, expect, it } from 'vitest'
import {
  proxyWarnings,
  quorum,
  scheduleWarnings,
  tally,
  voteCaps,
  type AttendanceInfo,
  type VoteValue,
} from '../../server/domain/quorum.ts'

// 10 bölüm; arsa payları toplamı 100. Malik "x" üç bölümün sahibi.
const units = Array.from({ length: 10 }, (_, i) => ({
  unitId: i + 1,
  landShare: i < 2 ? 20 : 7.5,
  ownerKey: i >= 7 ? 'x' : `p${i + 1}`,
  label: `Daire ${i + 1}`,
}))

const att = (present: number[], proxies: Record<number, string> = {}) =>
  new Map<number, AttendanceInfo>(
    units.map((u) => [u.unitId, { present: present.includes(u.unitId), proxy: proxies[u.unitId] ?? null }]),
  )
const votes = (v: Record<number, VoteValue>) =>
  new Map<number, VoteValue>(Object.entries(v).map(([k, x]) => [Number(k), x]))

describe('toplantı yeter sayısı (KMK m.30)', () => {
  it('ilk toplantıda sayı ve arsa payı çoğunluğu birlikte aranır', () => {
    // 6 bölüm katıldı ama arsa payları yalnız 45 → yetersiz
    expect(quorum(units, att([3, 4, 5, 6, 7, 8]), 'ilk').ok).toBe(false)
    // 6 bölüm ve arsa payı 70 → yeterli
    expect(quorum(units, att([1, 2, 3, 4, 5, 6]), 'ilk').ok).toBe(true)
  })

  it('ikinci toplantıda yeter sayı aranmaz', () => {
    expect(quorum(units, att([1, 2]), 'ikinci').ok).toBe(true)
  })
})

describe('karar yeter sayısı', () => {
  it('olağan karar: katılanların salt çoğunluğu', () => {
    const a = att([1, 2, 3, 4, 5, 6])
    expect(tally(units, a, votes({ 1: 'evet', 2: 'evet', 3: 'evet', 4: 'hayir' }), 'cogunluk').passed).toBe(false)
    expect(tally(units, a, votes({ 1: 'evet', 2: 'evet', 3: 'evet', 4: 'evet' }), 'cogunluk').passed).toBe(true)
  })

  it('yönetici seçimi: tüm maliklerin sayı ve arsa payı çoğunluğu', () => {
    const a = att([1, 2, 3, 4, 5, 6, 7])
    const t = tally(units, a, votes({ 1: 'evet', 2: 'evet', 3: 'evet', 4: 'evet', 5: 'evet', 6: 'evet' }), 'sayi_arsa')
    expect(t.passed).toBe(true)
    const t2 = tally(
      units,
      a,
      votes({ 3: 'evet', 4: 'evet', 5: 'evet', 6: 'evet', 7: 'evet', 1: 'hayir' }),
      'sayi_arsa',
    )
    expect(t2.passed).toBe(false) // 5 bölüm < 6
  })

  it('yönetim planı değişikliği: beşte dört', () => {
    const all = units.map((u) => u.unitId)
    const v: Record<number, VoteValue> = {}
    for (const id of all) v[id] = 'evet'
    v[1] = 'hayir'
    v[2] = 'hayir'
    // 8 evet ama malik x'in 3 oyu üçte bir sınırı (3) içinde → 8/10 ≥ 8
    expect(tally(units, att(all), votes(v), 'bestedort').passed).toBe(true)
    v[3] = 'hayir'
    expect(tally(units, att(all), votes(v), 'bestedort').passed).toBe(false)
  })
})

describe('KMK m.31 sınırları', () => {
  it('çok bölümlü malikin oyu üçte birle sınırlanır', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ unitId: i + 1, landShare: 1, ownerKey: i < 4 ? 'x' : `p${i}` }))
    expect(voteCaps(many)).toEqual({ cap: 2, capped: [{ ownerKey: 'x', units: 4 }] })
    const a = new Map(many.map((u) => [u.unitId, { present: true, proxy: null }]))
    const t = tally(many, a, new Map(many.map((u) => [u.unitId, 'evet' as const])), 'cogunluk')
    expect(t.yes).toBe(4) // x'in 4 oyundan 2'si sayılır + 2 diğer
  })

  it('vekâlet sınırı uyarısı', () => {
    const w = proxyWarnings(units, att([1, 2, 3, 4], { 1: 'Ali Yılmaz', 2: 'ali yilmaz', 3: 'Ali Yılmaz' }))
    expect(w.some((x) => x.includes('3 malike'))).toBe(true)
  })
})

describe('çağrı süreleri (KMK m.29)', () => {
  it('15 gün ve 7–15 gün aralığı', () => {
    expect(
      scheduleWarnings({
        invitedOn: '2026-11-01',
        firstDate: '2026-11-20',
        secondDate: '2026-11-27',
        today: '2026-11-09',
      }),
    ).toEqual([])
    const w = scheduleWarnings({
      invitedOn: null,
      firstDate: '2026-11-15',
      secondDate: '2026-11-18',
      today: '2026-11-09',
    })
    expect(w).toHaveLength(2)
    expect(
      scheduleWarnings({ invitedOn: '2026-10-01', firstDate: '2026-11-01', secondDate: null, today: '2026-11-09' })[0],
    ).toMatch(/ikinci toplantının/)
  })
})
