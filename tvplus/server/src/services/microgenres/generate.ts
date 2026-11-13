/**
 * Mikro tür üreteci (bkz. docs/ICERIK_ZEKASI.md §4).
 *
 * Tanım = çekirdek tür (+ film/dizi) + 0–3 yuva. Her yuvada en çok bir değer; yalnız sıfat yuvasında en çok iki.
 * Kişi yuvası tek başına kullanılır ("Buster Keaton Komedi Filmleri"): kişi adına başka nitelik eklemek ek gerektirir.
 *
 * Adımlar:
 *  1. Her başlığın nitelikleri çıkarılır (./qualities.ts); çekirdek türün adında zaten geçen nitelikler o çekirdekle
 *     kullanılmaz ("Komik Komediler" oluşmaz).
 *  2. Tanımlar düzey düzey sayılır (Apriori budaması): k yuvalı bir tanım ancak bütün (k−1) yuvalı alt tanımları en az
 *     `minTitles` başlıkta geçiyorsa sayılır. Böylece gerçek katalogda bile tanım uzayının yalnız dolu kısmı gezilir.
 *     Anahtarlar sayıdır: ((çekirdek·M + a)·M + b)·M + c  (a < b < c nitelik kimlikleri, 0 = boş).
 *  3. En az `minTitles` başlığı olan tanım mikro tür olur; başlıkların hepsi aynı türdeyse (hepsi film) yalnız o türle
 *     adlandırılır, karışıksa hem karışık hem de yeterince başlığı olan film/dizi biçimi üretilir.
 *  4. Aynı başlık kümesini veren tanımlardan en okunuru kalır: az yuva → sözlükte önce gelen çekirdek tür → kısa ad.
 *  5. Kimlik = 'mg_' + SHA-256(kanonik tanım)'ın ilk 8 onaltılık hanesi; ad değişse de kimlik değişmez. Çakışmada
 *     kanonik biçimi sonra gelen tanım daha uzun önek alır (12, 16 … hane).
 */
import { createHash } from 'node:crypto'
import type { ContentTitle } from '../../../../shared/content-schema'
import type { EffectiveTags, Microgenre, MicrogenreDefinition, MicrogenreStats } from '../../../../shared/intelligence'
import { MICROGENRE_SLOTS, type MicrogenreSlot } from '../../../../shared/tagging-schema'
import type { VocabIndex } from '../tagging/vocabulary'
import { excludedForCore, nameOf, orderQualities } from './naming'
import { createRegistry, extractQualities, recurringPeople, type Quality } from './qualities'

export const MAX_SLOTS = 3
/** Görünen katman: ana sayfada satır olabilecek genişlik */
export const VISIBLE_MIN_TITLES = 4
export const VISIBLE_MAX_SLOTS = 2

export interface GenerateInput {
  index: VocabIndex
  titles: readonly { title: ContentTitle; tags: EffectiveTags }[]
  minTitles: number
  now?: () => Date
  /** Kimlik işlevi (testlerde çakışma denemek için değiştirilebilir) */
  hash?: (canonical: string) => string
}

export interface Generation {
  items: Microgenre[]
  byId: Map<string, Microgenre>
  /** Başlık → mikro türleri, en dar önce */
  byTitle: Map<number, Microgenre[]>
  /** Mikro tür → ters sıklık ağırlığı ln(N / boyut) */
  weight: Map<string, number>
  /** Başlık → mikro türlerinin ağırlık toplamı (benzerlikte paydanın parçası) */
  titleWeight: Map<number, number>
  stats: MicrogenreStats
  /** Üretimin sürdüğü süre (ms) */
  tookMs: number
}

export const sha256Hex = (s: string): string => createHash('sha256').update(s).digest('hex')

const SLOT_POS = new Map<MicrogenreSlot, number>(MICROGENRE_SLOTS.map((s, i) => [s, i]))

/** Kimliğin dayandığı kanonik biçim: yuvalar sözlük sırasından bağımsız, MICROGENRE_SLOTS sırasıyla. */
export function canonicalDefinition(def: MicrogenreDefinition): string {
  const slots = [...def.slots]
    .sort((a, b) => SLOT_POS.get(a.slot)! - SLOT_POS.get(b.slot)! || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((s) => [s.slot, s.key])
  return JSON.stringify([def.core, def.type, slots])
}

export function microgenreId(def: MicrogenreDefinition, hash: (s: string) => string = sha256Hex, length = 8): string {
  return `mg_${hash(canonicalDefinition(def)).slice(0, length)}`
}

/** Sözlüğün tanımlayabildiği kuramsal birleşim sayısı: çekirdek × (karışık/film/dizi) × 0–3 yuvalı seçimler. */
export function possibleDefinitions(index: VocabIndex): number {
  const reg = createRegistry(index)
  const perSlot = new Map<MicrogenreSlot, number>()
  for (const q of reg.list) perSlot.set(q.slot, (perSlot.get(q.slot) ?? 0) + 1)
  // Üreteç çarpımı: her yuva (1 + n·x); sıfat yuvası (1 + n·x + C(n,2)·x²); x^0..x^3 katsayıları toplanır.
  let poly = [1]
  for (const [slot, n] of perSlot) {
    const factor = slot === 'ADJECTIVE' ? [1, n, (n * (n - 1)) / 2] : [1, n]
    const next = new Array<number>(Math.min(poly.length + factor.length - 1, MAX_SLOTS + 1)).fill(0)
    poly.forEach((a, i) =>
      factor.forEach((b, j) => {
        if (i + j <= MAX_SLOTS) next[i + j]! += a * b
      }),
    )
    poly = next
  }
  const combos = poly.reduce((a, b) => a + b, 0)
  return Object.keys(index.vocabulary.naming.genreNouns).length * 3 * combos
}

interface Candidate {
  core: number
  type: MicrogenreDefinition['type']
  quals: number[]
  titles: number[]
  name?: string
  canonical?: string
}

/** İki 32 bitlik FNV-1a özeti + uzunluk: başlık kümesi anahtarı */
function setKey(list: readonly number[]): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193 ^ list.length
  for (const x of list) {
    h1 = Math.imul(h1 ^ x, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ (x + 0x9e3779b9), 0x85ebca6b) >>> 0
  }
  return `${list.length}:${h1}:${h2}`
}

const sameList = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i])

export function generateMicrogenres(input: GenerateInput): Generation {
  const started = performance.now()
  const { index, titles, minTitles } = input
  const hash = input.hash ?? sha256Hex
  const reg = createRegistry(index)
  const people = recurringPeople(titles.map((t) => t.title))
  const tq = titles.map((t) => extractQualities(index, reg, t.title, t.tags, people))

  const cores = Object.keys(index.vocabulary.naming.genreNouns)
  const coreIdx = new Map(cores.map((c, i) => [c, i]))
  const M = reg.list.length + 1
  if (cores.length * M ** 3 >= Number.MAX_SAFE_INTEGER)
    throw new Error(`Mikro tür üreteci: nitelik sayısı (${M - 1}) sayısal anahtar sınırını aşıyor`)
  const excluded = cores.map((c) => excludedForCore(index, c, reg.list))
  const slotOf = (id: number) => reg.get(id).slot
  const K = (c: number, a = 0, b = 0, d = 0) => ((c * M + a) * M + b) * M + d

  const lists = new Map<number, number[]>()
  const push = (k: number, ti: number) => {
    const l = lists.get(k)
    if (l) l.push(ti)
    else lists.set(k, [ti])
  }
  const frequent = (k: number) => (lists.get(k)?.length ?? 0) >= minTitles

  // Başlık × çekirdek başına kullanılabilir nitelikler
  const allowed: { ti: number; c: number; quals: number[] }[] = []
  tq.forEach((t, ti) => {
    for (const core of t.cores) {
      const c = coreIdx.get(core)!
      allowed.push({ ti, c, quals: t.quals.filter((q) => !excluded[c]!.has(q)) })
    }
  })

  // Düzey 0 ve 1
  for (const { ti, c, quals } of allowed) {
    push(K(c), ti)
    for (const a of quals) push(K(c, a), ti)
  }
  // Düzey 2 (kişi yuvası tek başınadır)
  const level2 = allowed.map(({ ti, c, quals }) => ({
    ti,
    c,
    f: quals.filter((a) => slotOf(a) !== 'PERSON' && frequent(K(c, a))),
  }))
  const pairOk = (a: number, b: number) => {
    const qa = reg.get(a)
    const qb = reg.get(b)
    return (qa.slot !== qb.slot || qa.slot === 'ADJECTIVE') && qa.folded !== qb.folded
  }
  for (const { ti, c, f } of level2)
    for (let i = 0; i < f.length; i++)
      for (let j = i + 1; j < f.length; j++) if (pairOk(f[i]!, f[j]!)) push(K(c, f[i]!, f[j]!), ti)
  // Düzey 3: üç alt çiftin hepsi sık olmalı; üç sıfat olamaz
  if (MAX_SLOTS >= 3)
    for (const { ti, c, f } of level2) {
      if (f.length < 3) continue
      for (let i = 0; i < f.length; i++) {
        const a = f[i]!
        for (let j = i + 1; j < f.length; j++) {
          const b = f[j]!
          if (!frequent(K(c, a, b))) continue
          for (let k = j + 1; k < f.length; k++) {
            const d = f[k]!
            if (slotOf(a) === 'ADJECTIVE' && slotOf(b) === 'ADJECTIVE' && slotOf(d) === 'ADJECTIVE') continue
            if (frequent(K(c, a, d)) && frequent(K(c, b, d))) push(K(c, a, b, d), ti)
          }
        }
      }
    }

  // Sık tanımlar → adaylar (film/dizi ayrımıyla)
  const candidates: Candidate[] = []
  for (const [k, list] of lists) {
    if (list.length < minTitles) continue
    let rest = k
    const d = rest % M
    rest = (rest - d) / M
    const b = rest % M
    rest = (rest - b) / M
    const a = rest % M
    const c = (rest - a) / M
    const quals = [a, b, d].filter((x) => x > 0)
    const movies = list.filter((ti) => tq[ti]!.type === 'MOVIE')
    const shows = list.length - movies.length
    if (shows === 0) candidates.push({ core: c, type: 'MOVIE', quals, titles: list })
    else if (movies.length === 0) candidates.push({ core: c, type: 'SHOW', quals, titles: list })
    else {
      candidates.push({ core: c, type: null, quals, titles: list })
      if (movies.length >= minTitles) candidates.push({ core: c, type: 'MOVIE', quals, titles: movies })
      if (shows >= minTitles)
        candidates.push({ core: c, type: 'SHOW', quals, titles: list.filter((ti) => tq[ti]!.type === 'SHOW') })
    }
  }

  const qualsOf = (cand: Candidate): Quality[] => cand.quals.map((id) => reg.get(id))
  const defOf = (cand: Candidate): MicrogenreDefinition => ({
    core: cores[cand.core]!,
    type: cand.type,
    slots: orderQualities(index, qualsOf(cand)).map((q) => ({ slot: q.slot, key: q.key })),
  })
  const nameOfCand = (cand: Candidate) => (cand.name ??= nameOf(index, cores[cand.core]!, cand.type, qualsOf(cand)))
  const canonicalOf = (cand: Candidate) => (cand.canonical ??= canonicalDefinition(defOf(cand)))
  const better = (x: Candidate, y: Candidate): boolean => {
    if (x.quals.length !== y.quals.length) return x.quals.length < y.quals.length
    const px = index.corePriority.get(cores[x.core]!) ?? 99
    const py = index.corePriority.get(cores[y.core]!) ?? 99
    if (px !== py) return px < py
    const nx = nameOfCand(x).length
    const ny = nameOfCand(y).length
    if (nx !== ny) return nx < ny
    return canonicalOf(x) < canonicalOf(y)
  }

  // Aynı başlık kümesi → en okunur tanım
  const groups = new Map<string, Candidate[]>()
  for (const cand of candidates) {
    const key = setKey(cand.titles)
    const bucket = groups.get(key)
    if (!bucket) {
      groups.set(key, [cand])
      continue
    }
    const same = bucket.findIndex((x) => sameList(x.titles, cand.titles))
    if (same < 0) bucket.push(cand)
    else if (better(cand, bucket[same]!)) bucket[same] = cand
  }
  const winners = [...groups.values()].flat().sort((x, y) => (canonicalOf(x) < canonicalOf(y) ? -1 : 1))

  const items: Microgenre[] = []
  const byId = new Map<string, Microgenre>()
  for (const cand of winners) {
    const definition = defOf(cand)
    const digest = hash(canonicalOf(cand))
    let len = 8
    let id = `mg_${digest.slice(0, len)}`
    while (byId.has(id) && len < digest.length) {
      len += 4
      id = `mg_${digest.slice(0, len)}`
    }
    const specificity = cand.quals.length
    const size = cand.titles.length
    const mg: Microgenre = {
      id,
      name: nameOfCand(cand),
      definition,
      titleIds: cand.titles.map((ti) => tq[ti]!.titleId),
      size,
      specificity,
      layer: size >= VISIBLE_MIN_TITLES && specificity <= VISIBLE_MAX_SLOTS ? 'VISIBLE' : 'HIDDEN',
    }
    items.push(mg)
    byId.set(id, mg)
  }
  items.sort((a, b) => a.specificity - b.specificity || b.size - a.size || a.name.localeCompare(b.name, 'tr'))

  const N = titles.length
  const weight = new Map<string, number>()
  const byTitle = new Map<number, Microgenre[]>()
  for (const mg of items) {
    weight.set(mg.id, N > 0 ? Math.log(N / mg.size) : 0)
    for (const id of mg.titleIds) {
      const l = byTitle.get(id)
      if (l) l.push(mg)
      else byTitle.set(id, [mg])
    }
  }
  const titleWeight = new Map<number, number>()
  for (const [id, l] of byTitle) {
    l.sort((a, b) => b.specificity - a.specificity || a.size - b.size || a.name.localeCompare(b.name, 'tr'))
    titleWeight.set(
      id,
      l.reduce((s, m) => s + (weight.get(m.id) ?? 0), 0),
    )
  }

  const bySpecificity: Record<string, number> = {}
  let visible = 0
  for (const mg of items) {
    bySpecificity[String(mg.specificity)] = (bySpecificity[String(mg.specificity)] ?? 0) + 1
    if (mg.layer === 'VISIBLE') visible++
  }
  const stats: MicrogenreStats = {
    rubricVersion: index.vocabulary.version,
    generatedAt: (input.now ?? (() => new Date()))().toISOString(),
    total: items.length,
    visible,
    hidden: items.length - visible,
    bySpecificity,
    coveredTitles: byTitle.size,
    possibleDefinitions: possibleDefinitions(index),
  }
  return { items, byId, byTitle, weight, titleWeight, stats, tookMs: Math.round(performance.now() - started) }
}
