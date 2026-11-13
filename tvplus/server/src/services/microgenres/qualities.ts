/**
 * Başlık nitelikleri: bir başlığın mikro tür tanımına girebilecek her özelliği, adda kullanılacak hazır ifadesiyle.
 *
 *   ADJECTIVE  ölçeklerden türeyen niteleyiciler + "ek sıfatlar" yüzünün değerleri
 *   SOURCE, SETTING, PERIOD, SUBJECT, AGE, LEAD, FORMAT  ilgili yüzlerin değerleri
 *   REGION     `origin.countries` → sözlükteki bölge     ERA  `year` → sözlükteki yapım dönemi
 *   PERSON     oyuncu / yönetmen / yaratıcı — katalogda en az iki başlıkta geçenler
 *
 * Yalnız hazır ifadesi (phrase) olan değerler nitelik olur: ad kurulamayan bir değer mikro türe girmez.
 * Nitelik anahtarları: niteleyici, bölge ve dönem için sözlük anahtarı; yüz değeri için "yüz:değer"; kişi için
 * düzleştirilmiş ad ("buster-keaton").
 */
import type { ContentTitle } from '../../../../shared/content-schema'
import type { EffectiveTags } from '../../../../shared/intelligence'
import type { MicrogenreSlot } from '../../../../shared/tagging-schema'
import { norm } from '../../../../shared/text'
import type { VocabIndex } from '../tagging/vocabulary'

export interface Quality {
  /** 1'den başlayan sıra numarası (0 = yok) */
  id: number
  slot: MicrogenreSlot
  key: string
  phrase: string
  /** Aynı yuvadaki sıralama (sıfat çiftinde önce ek sıfatlar, sonra ölçek niteleyicileri) */
  rank: number
  /** Ad karşılaştırmaları için düzleştirilmiş ifade */
  folded: string
}

export interface QualityRegistry {
  list: Quality[]
  get(id: number): Quality
  find(slot: MicrogenreSlot, key: string): Quality | undefined
  add(slot: MicrogenreSlot, key: string, phrase: string, rank: number): Quality
}

export function createRegistry(index: VocabIndex): QualityRegistry {
  const list: Quality[] = []
  const byRef = new Map<string, Quality>()
  const reg: QualityRegistry = {
    list,
    get: (id) => list[id - 1]!,
    find: (slot, key) => byRef.get(`${slot}|${key}`),
    add(slot, key, phrase, rank) {
      const ref = `${slot}|${key}`
      const hit = byRef.get(ref)
      if (hit) return hit
      const q: Quality = { id: list.length + 1, slot, key, phrase, rank, folded: norm(phrase) }
      list.push(q)
      byRef.set(ref, q)
      return q
    },
  }
  const v = index.vocabulary
  for (const f of v.facets) {
    if (!f.slot) continue
    f.values.forEach((val, i) => {
      if (val.phrase) reg.add(f.slot!, `${f.key}:${val.key}`, val.phrase, i)
    })
  }
  let d = 0
  for (const s of v.scales) for (const desc of s.descriptors) reg.add('ADJECTIVE', desc.key, desc.adjective, 1000 + d++)
  v.naming.regions.forEach((r, i) => reg.add('REGION', r.key, r.adjective, i))
  v.naming.eras.forEach((e, i) => reg.add('ERA', e.key, e.phrase, i))
  return reg
}

export interface TitleQualities {
  titleId: number
  type: ContentTitle['type']
  /** Çekirdek olabilecek türleri (sözlükte adı olanlar) */
  cores: string[]
  /** Nitelik kimlikleri, artan sırada, yinelenmesiz */
  quals: number[]
}

export const personKey = (name: string): string => norm(name).replace(/ /g, '-')

/** Katalogda en az `min` başlıkta geçen kişiler: anahtar → görünen ad (ilk görülen yazılış). */
export function recurringPeople(titles: readonly ContentTitle[], min = 2): Map<string, string> {
  const counts = new Map<string, { name: string; n: number }>()
  for (const t of titles)
    for (const name of new Set([...t.cast, ...t.directors, ...t.creators])) {
      const k = personKey(name)
      if (!k) continue
      const c = counts.get(k)
      if (c) c.n++
      else counts.set(k, { name: name.trim(), n: 1 })
    }
  const out = new Map<string, string>()
  for (const [k, c] of counts) if (c.n >= min) out.set(k, c.name)
  return out
}

export function extractQualities(
  index: VocabIndex,
  reg: QualityRegistry,
  title: ContentTitle,
  tags: EffectiveTags,
  people: Map<string, string>,
): TitleQualities {
  const v = index.vocabulary
  const ids = new Set<number>()
  const add = (q: Quality | undefined) => {
    if (q) ids.add(q.id)
  }
  for (const d of tags.descriptors) add(reg.find('ADJECTIVE', d))
  for (const [fk, values] of Object.entries(tags.facets)) {
    const slot = index.facets.get(fk)?.facet.slot
    if (slot) for (const val of values) add(reg.find(slot, `${fk}:${val}`))
  }
  const countries = title.origin?.countries ?? []
  for (const r of v.naming.regions) if (r.countries.some((c) => countries.includes(c))) add(reg.find('REGION', r.key))
  for (const e of v.naming.eras) if (title.year >= e.fromYear && title.year <= e.toYear) add(reg.find('ERA', e.key))
  for (const name of new Set([...title.cast, ...title.directors, ...title.creators])) {
    const k = personKey(name)
    const display = people.get(k)
    if (display) ids.add(reg.add('PERSON', k, display, 0).id)
  }
  return {
    titleId: title.videoId,
    type: title.type,
    cores: title.genres.filter((g) => g in v.naming.genreNouns),
    quals: [...ids].sort((a, b) => a - b),
  }
}
