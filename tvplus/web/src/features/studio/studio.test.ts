import { describe, expect, it } from 'vitest'
import type { MixRow } from '../../../../shared/intelligence'
import type { TagVocabulary } from '../../../../shared/tagging-schema'
import {
  fmtClock,
  fmtDec,
  fmtDuration,
  fmtInt,
  fmtMonth,
  fmtPct,
  fmtRatio,
  fmtSigned,
  pctWithSuffix,
  possessiveSuffix,
} from './format'
import { extent, gapReadings, groupedBars, linear, linePath, niceMax, pairedRows, symmetricMax, ticks } from './scales'
import { initialForm, setScale, toggleFacet, toInput, validateForm } from './tagForm'

describe('biçimler', () => {
  it('Türkçe sayılar', () => {
    expect(fmtInt(1497)).toBe('1.497')
    expect(fmtInt(213795)).toBe('213.795')
    expect(fmtInt(12)).toBe('12')
    expect(fmtPct(0.1244)).toBe('%12,4')
    expect(fmtPct(0.5, 0)).toBe('%50')
    expect(fmtDec(0.6178, 3)).toBe('0,618')
    expect(fmtRatio(3.23)).toBe('3,2×')
    expect(fmtSigned(0.42)).toBe('+0,42')
    expect(fmtSigned(-0.1)).toBe('−0,10')
    expect(fmtSigned(0)).toBe('0,00')
    expect(fmtInt(null)).toBe('—')
    expect(fmtPct(Number.NaN)).toBe('—')
  })
  it('süre ve saat', () => {
    expect(fmtClock(44.9)).toBe('0:44')
    expect(fmtClock(3723)).toBe('1:02:03')
    expect(fmtDuration(850)).toBe('850 ms')
    expect(fmtDuration(3500)).toBe('3,5 sn')
    expect(fmtDuration(125_000)).toBe('2 dk 5 sn')
    expect(fmtMonth('2026-11')).toBe('Kas 26')
  })
  it('sayıdan sonra iyelik eki', () => {
    const cases: [number, string][] = [
      [17, 'si'],
      [55, 'i'],
      [12, 'si'],
      [39, 'u'],
      [23, 'ü'],
      [11, 'i'],
      [40, 'ı'],
      [10, 'u'],
      [30, 'u'],
      [60, 'ı'],
      [100, 'ü'],
      [6, 'sı'],
      [0, 'ı'],
    ]
    for (const [n, s] of cases) expect(possessiveSuffix(n), String(n)).toBe(s)
    expect(pctWithSuffix(0.17)).toBe("%17'si")
    expect(pctWithSuffix(0.5512)).toBe("%55'i")
  })
})

describe('ölçekler', () => {
  it('doğrusal ölçek ve eksen', () => {
    const s = linear([0, 10], [100, 0])
    expect(s(0)).toBe(100)
    expect(s(5)).toBe(50)
    expect(linear([3, 3], [0, 10])(3)).toBe(5)
    expect(niceMax(0.392)).toBeCloseTo(0.4)
    expect(niceMax(87)).toBe(100)
    expect(niceMax(0)).toBe(1)
    expect(ticks(0, 0.4, 4)).toEqual([0, 0.1, 0.2, 0.3, 0.4])
    expect(ticks(0, 1, 4)).toEqual([0, 0.25, 0.5, 0.75, 1])
    expect(symmetricMax([-0.3, 0.1])).toBe(0.3)
    expect(symmetricMax([])).toBe(1)
    const [lo, hi] = extent([0, 10])
    expect(lo).toBeLessThan(0)
    expect(hi).toBeGreaterThan(10)
  })
  it('çizgi yolu boşlukta kopar', () => {
    expect(linePath([{ x: 0, y: 1 }, { x: 1, y: 2 }, null, { x: 3, y: 4 }])).toBe('M0 1 L1 2 M3 4')
  })
  it('gruplu çubuklar', () => {
    const l = groupedBars(['A', 'B'], ['m', 'p'], [[0.5, 0.25], [null, 1]], 600, 100)
    expect(l.max).toBe(1)
    expect(l.groups[0]!.bars).toHaveLength(2)
    expect(l.groups[1]!.bars).toHaveLength(1)
    expect(l.groups[0]!.bars[0]!.h).toBeCloseTo(50)
    expect(l.groups[1]!.bars[0]!.x).toBeGreaterThan(l.groups[0]!.bars[1]!.x)
  })
})

const row = (key: string, catalogShare: number, viewShare: number, titles = 3): MixRow => ({
  key,
  name: key,
  titles,
  catalogShare,
  hours: viewShare * 100,
  viewShare,
  efficiency: catalogShare > 0 && viewShare >= 0 ? viewShare / catalogShare : null,
})

describe('eşli çubuk verisi', () => {
  it('verime göre sıralar, verimsizleri sona atar, ortak ölçek kurar', () => {
    const rows = [row('a', 0.2, 0.1), row('b', 0.1, 0.39), { ...row('c', 0.3, 0), efficiency: null }, row('d', 0, 0, 0)]
    const d = pairedRows(rows)
    expect(d.rows.map((r) => r.key)).toEqual(['b', 'a', 'c'])
    expect(d.max).toBeCloseTo(0.4)
    expect(d.rows[0]!.gap).toBeCloseTo(0.29)
    expect(pairedRows(rows, 1).rows).toHaveLength(1)
  })
  it('en büyük farkları düz Türkçe okur', () => {
    const rows = [
      { ...row('Sessiz Sinema', 0.17, 0.55) },
      { ...row('Doğa ve Bilim', 0.23, 0.11) },
      { ...row('Komedi', 0.18, 0.19) },
    ]
    expect(gapReadings(rows)).toEqual([
      "Sessiz Sinema kataloğun %17'si, izlenmenin %55'i.",
      "Doğa ve Bilim kataloğun %23'ü, izlenmenin %11'i.",
    ])
    expect(gapReadings([{ ...row('x', 0.2, 0), efficiency: null }])).toEqual([])
  })
})

const vocab = {
  version: '2026.11-1',
  scales: [
    {
      key: 'romantizm',
      name: 'Romantizm',
      question: '?',
      group: 'TONE',
      levels: [0, 1, 2, 3, 4, 5].map((v) => ({ value: v, label: `L${v}`, description: `D${v}` })),
      descriptors: [],
    },
    {
      key: 'son-netligi',
      name: 'Sonun netliği',
      question: '?',
      group: 'STORY',
      levels: [0, 1, 2, 3, 4, 5].map((v) => ({ value: v, label: `L${v}`, description: `D${v}` })),
      descriptors: [],
    },
  ],
  facets: [
    {
      key: 'mekan',
      name: 'Mekân',
      question: '?',
      slot: 'SETTING',
      multi: true,
      max: 2,
      values: [
        { key: 'uzay', name: 'Uzay' },
        { key: 'deniz', name: 'Deniz' },
        { key: 'kent', name: 'Kent' },
      ],
    },
    {
      key: 'yas-grubu',
      name: 'Yaş grubu',
      question: '?',
      slot: 'AGE',
      multi: false,
      max: 1,
      values: [
        { key: 'yetiskin', name: 'Yetişkin' },
        { key: 'cocuk', name: 'Çocuk' },
      ],
    },
  ],
  naming: { genreNouns: {}, regions: [], eras: [], order: ['ADJECTIVE'] },
} as unknown as TagVocabulary

describe('etiket formu', () => {
  it('fişten başlar, bilinmeyenleri ayıklar', () => {
    const f = initialForm(vocab, {
      watched: true,
      scales: { romantizm: 4, bilinmeyen: 2, 'son-netligi': null },
      facets: { mekan: ['uzay', 'yok', 'deniz', 'kent'] },
    })
    expect(f.scales).toEqual({ romantizm: 4, 'son-netligi': null })
    expect(f.facets.mekan).toEqual(['uzay', 'deniz'])
    expect(f.facets['yas-grubu']).toEqual([])
  })
  it('ölçek seçimi ikinci basışta kalkar', () => {
    const f = setScale(initialForm(vocab), 'romantizm', 3)
    expect(f.scales.romantizm).toBe(3)
    expect(setScale(f, 'romantizm', 3).scales.romantizm).toBeNull()
  })
  it('yüz seçimi max ile sınırlanır; tek seçimlide yer değiştirir', () => {
    let f = initialForm(vocab)
    const mekan = vocab.facets[0]!
    f = toggleFacet(f, mekan, 'uzay').state
    f = toggleFacet(f, mekan, 'deniz').state
    const third = toggleFacet(f, mekan, 'kent')
    expect(third.blocked).toBe(true)
    expect(third.state.facets.mekan).toEqual(['uzay', 'deniz'])
    const yas = vocab.facets[1]!
    f = toggleFacet(f, yas, 'cocuk').state
    f = toggleFacet(f, yas, 'yetiskin').state
    expect(f.facets['yas-grubu']).toEqual(['yetiskin'])
    expect(toggleFacet(f, mekan, 'uzay').state.facets.mekan).toEqual(['deniz'])
  })
  it('doğrulama: kimlik, izlendi, sözlük dışı değer, not uzunluğu', () => {
    const base = initialForm(vocab)
    expect(validateForm(vocab, base, 'etiket-01', 'DRAFT')).toEqual([])
    expect(validateForm(vocab, base, 'E', 'DRAFT').map((i) => i.path)).toEqual(['tagger'])
    const sub = validateForm(vocab, base, 'etiket-01', 'SUBMITTED').map((i) => i.path)
    expect(sub).toEqual(['watched', 'scales'])
    const ok = { ...setScale(base, 'romantizm', 2), watched: true }
    expect(validateForm(vocab, ok, 'etiket-01', 'SUBMITTED')).toEqual([])
    const bad = { ...ok, facets: { ...ok.facets, mekan: ['uzay', 'mars', 'deniz'] }, notes: 'x'.repeat(2001) }
    const paths = validateForm(vocab, bad, 'etiket-01', 'SUBMITTED').map((i) => i.path)
    expect(paths).toContain('facets.mekan')
    expect(paths).toContain('notes')
    expect(validateForm(vocab, { ...ok, scales: { ...ok.scales, romantizm: 7 } }, 'etiket-01', 'DRAFT')[0]?.path).toBe(
      'scales.romantizm',
    )
  })
  it('tel gövdesi boş yüzleri atar, notu kırpar', () => {
    const f = { ...toggleFacet(initialForm(vocab), vocab.facets[0]!, 'uzay').state, notes: '  izlendi  ' }
    expect(toInput(f, 'DRAFT')).toEqual({
      watched: false,
      scales: { romantizm: null, 'son-netligi': null },
      facets: { mekan: ['uzay'] },
      notes: 'izlendi',
      status: 'DRAFT',
    })
  })
})
