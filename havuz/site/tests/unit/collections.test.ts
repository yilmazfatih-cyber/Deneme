import { describe, expect, it } from 'vitest'
import {
  collectTags,
  groupByGroup,
  isVisible,
  neighbours,
  readingMinutes,
  relatedEntries,
  sortByDateDesc,
  sortByOrder,
  translationsOf,
} from '../../src/lib/collections.ts'

const post = (id: string, date: string, tags: string[], title = id, draft = false) => ({
  id,
  data: { title, date: new Date(date), tags, draft },
})

const doc = (id: string, order: number, group: string) => ({ id, data: { order, group, title: id } })

describe('yazı listeleri', () => {
  const posts = [
    post('a', '2026-01-01', ['SEO']),
    post('b', '2026-03-01', ['SEO', 'Tasarım']),
    post('c', '2026-02-01', ['Tasarım']),
    post('d', '2026-03-01', ['Performans'], 'aa'),
  ]

  it('yeniden eskiye, aynı günde başlığa göre sıralar', () => {
    expect(sortByDateDesc(posts).map((entry) => entry.id)).toEqual(['d', 'b', 'c', 'a'])
  })

  it('taslakları yalnız istenirse gösterir', () => {
    expect(isVisible(post('x', '2026-01-01', [], 'x', true), false)).toBe(false)
    expect(isVisible(post('x', '2026-01-01', [], 'x', true), true)).toBe(true)
  })

  it('etiketleri sayar; Türkçe harfli ve büyük/küçük farklı yazımları aynı kısa ada toplar', () => {
    const tags = collectTags([...posts, post('e', '2026-01-02', ['tasarım', 'Erişilebilirlik'])], 'tr')
    expect(tags.map((tag) => [tag.slug, tag.count])).toEqual([
      ['tasarim', 3],
      ['seo', 2],
      ['erisilebilirlik', 1],
      ['performans', 1],
    ])
    expect(tags[0]?.name).toBe('Tasarım')
  })

  it('ilgili yazıları ortak etiket sayısına göre seçer, kendisini katmaz', () => {
    const related = relatedEntries(posts[1] as (typeof posts)[number], posts)
    expect(related.map((entry) => entry.id)).toEqual(['c', 'a'])
  })

  it('okuma süresini en az 1 dakika verir', () => {
    expect(readingMinutes('kısa')).toBe(1)
    expect(readingMinutes(Array.from({ length: 1000 }, () => 'kelime').join(' '))).toBe(5)
  })
})

describe('belgeler', () => {
  const docs = [doc('c', 30, 'İçerik'), doc('a', 10, 'Başlangıç'), doc('d', 40, 'Başlangıç'), doc('b', 20, 'Başlangıç')]

  it('order değerine göre sıralar ve ilk görünüş sırasıyla gruplar', () => {
    expect(sortByOrder(docs).map((entry) => entry.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(groupByGroup(docs).map((group) => [group.group, group.items.map((entry) => entry.id)])).toEqual([
      ['Başlangıç', ['a', 'b', 'd']],
      ['İçerik', ['c']],
    ])
  })

  it('önceki/sonraki belgeyi yan menü sırasıyla verir', () => {
    expect(neighbours(docs, 'd')).toEqual({ previous: docs[3], next: docs[0] })
    expect(neighbours(docs, 'a').previous).toBeUndefined()
    expect(neighbours(docs, 'c').next).toBeUndefined()
    expect(neighbours(docs, 'yok')).toEqual({})
  })
})

describe('translationsOf', () => {
  const entries = [
    { id: 'tr/ana-sayfa', data: { translationKey: 'ana' } },
    { id: 'en/home', data: { translationKey: 'ana' } },
    { id: 'tr/diger', data: { translationKey: undefined } },
  ]
  const localeOf = (entry: { id: string }) => entry.id.split('/')[0] as 'tr' | 'en'

  it('aynı anahtarı taşıyan çevirileri eşler', () => {
    expect(translationsOf(entries[0] as (typeof entries)[number], entries, localeOf)).toEqual({
      tr: entries[0],
      en: entries[1],
    })
  })

  it('anahtarı olmayan girdi yalnız kendisini döner', () => {
    expect(translationsOf(entries[2] as (typeof entries)[number], entries, localeOf)).toEqual({ tr: entries[2] })
  })
})
