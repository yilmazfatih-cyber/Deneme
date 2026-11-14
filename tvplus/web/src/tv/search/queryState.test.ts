import { describe, expect, it } from 'vitest'
import { initialQuery, MAX_QUERY_LENGTH, needsCommit, normalizeText, reduceQuery, type QueryAction } from './queryState'

const run = (...actions: QueryAction[]) => actions.reduce(reduceQuery, initialQuery)

describe('sorgu durum makinesi', () => {
  it('ekran klavyesiyle yazı birikir, terim gecikmeli işlenir', () => {
    const s = run({ type: 'char', ch: 's' }, { type: 'char', ch: 'i' })
    expect(s.text).toBe('si')
    expect(s.term).toBe('')
    expect(needsCommit(s)).toBe(true)
    const c = reduceQuery(s, { type: 'commit' })
    expect(c.term).toBe('si')
    expect(needsCommit(c)).toBe(false)
    expect(reduceQuery(c, { type: 'commit' })).toBe(c)
  })

  it('boşluk: başta ve art arda eklenmez; terim kenar boşluğu taşımaz', () => {
    expect(run({ type: 'space' }).text).toBe('')
    const s = run({ type: 'char', ch: 'a' }, { type: 'space' }, { type: 'space' })
    expect(s.text).toBe('a ')
    expect(reduceQuery(s, { type: 'commit' }).term).toBe('a')
  })

  it('sil ve temizle; boşalınca "Sana Özel Öneriler"e hemen dönülür', () => {
    const s = reduceQuery(run({ type: 'char', ch: 'a' }, { type: 'char', ch: 'b' }), { type: 'commit' })
    const d = reduceQuery(s, { type: 'delete' })
    expect(d.text).toBe('a')
    expect(d.term).toBe('ab')
    const e = reduceQuery(d, { type: 'delete' })
    expect(e).toMatchObject({ text: '', term: '' })
    expect(reduceQuery(s, { type: 'clear' })).toMatchObject({ text: '', term: '' })
    expect(reduceQuery(initialQuery, { type: 'delete' })).toBe(initialQuery)
  })

  it('tahmin seçimi yazıya dönüşür ve hemen aranır', () => {
    const s = reduceQuery(run({ type: 'char', ch: 's' }), { type: 'set', text: 'Sintel', from: 'prediction' })
    expect(s).toMatchObject({ text: 'Sintel', term: 'Sintel', source: 'prediction' })
  })

  it('telefon TAM metni verir; "Ara" (submit) hemen işler', () => {
    const s = reduceQuery(run({ type: 'char', ch: 'x' }), { type: 'set', text: '  big   buck ', from: 'phone' })
    expect(s.text).toBe('big buck ')
    expect(s.term).toBe('')
    expect(reduceQuery(s, { type: 'commit' }).term).toBe('big buck')
    const t = reduceQuery(s, { type: 'set', text: 'sintel', from: 'phone', commit: true })
    expect(t.term).toBe('sintel')
  })

  it('her değişimde sürüm artar; uzunluk sınırlı', () => {
    const a = run({ type: 'char', ch: 'a' })
    expect(a.rev).toBe(1)
    expect(normalizeText('x'.repeat(200))).toHaveLength(MAX_QUERY_LENGTH)
    expect(run({ type: 'set', text: 'y'.repeat(200), from: 'phone' }).text).toHaveLength(MAX_QUERY_LENGTH)
  })
})
