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
 *  5. Kimlik = 'mg_' + SHA-256(kanonik tanım)'ın ilk 12 onaltılık hanesi; ad değişse de kimlik değişmez. Çakışmada
 *     kanonik biçimi sonra gelen tanım daha uzun önek alır (12, 16 … hane).
 */
import { hash as oneShotHash } from 'node:crypto'
import type { ContentTitle } from '../../../../shared/content-schema'
import type { EffectiveTags, Microgenre, MicrogenreDefinition, MicrogenreStats } from '../../../../shared/intelligence'
import { MICROGENRE_SLOTS, type MicrogenreSlot } from '../../../../shared/tagging-schema'
import type { VocabIndex } from '../tagging/vocabulary'
import { excludedForCore, genreNoun, nameOf, orderQualities } from './naming'
import { createRegistry, extractQualities, recurringPeople, type Quality } from './qualities'

/** Kimlikteki onaltılık hane sayısı (48 bit: milyon mikro türde bile çakışma olasılığı binde birin altında) */
export const ID_HEX = 12
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
  /** false → aynı başlık kümesi ayıklaması yapılmaz (yalnız tanılama ve testler için) */
  dedupe?: boolean
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
  /** Aşama süreleri (ms): nitelik, sayım, aday, ayıklama, kimlik/ad, dizin */
  phaseMs: Record<string, number>
}

export const sha256Hex = (s: string): string => oneShotHash('sha256', s, 'hex')

const SLOT_POS = new Map<MicrogenreSlot, number>(MICROGENRE_SLOTS.map((s, i) => [s, i]))

/**
 * Kimliğin dayandığı kanonik biçim: "çekirdek|tür|YUVA=anahtar,…" — yuvalar sözlük sırasından bağımsız olarak
 * MICROGENRE_SLOTS sırasıyla (aynı yuvada anahtar sırasıyla) dizilir; ad ve yuva sırası değişse de kimlik değişmez.
 */
export function canonicalDefinition(def: MicrogenreDefinition): string {
  const slots = [...def.slots]
    .sort((a, b) => SLOT_POS.get(a.slot)! - SLOT_POS.get(b.slot)! || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((s) => `${s.slot}=${s.key}`)
  return `${def.core}|${def.type ?? '*'}|${slots.join(',')}`
}

export function microgenreId(
  def: MicrogenreDefinition,
  hash: (s: string) => string = sha256Hex,
  length = ID_HEX,
): string {
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

/** Artan sıralı iki listenin kesişimi */
function intersect(a: readonly number[], b: readonly number[]): number[] {
  const out: number[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    const x = a[i]!
    const y = b[j]!
    if (x === y) {
      out.push(x)
      i++
      j++
    } else if (x < y) i++
    else j++
  }
  return out
}

export function generateMicrogenres(input: GenerateInput): Generation {
  const started = performance.now()
  const phaseMs: Record<string, number> = {}
  let mark = started
  const phase = (name: string) => {
    const now = performance.now()
    phaseMs[name] = Math.round(now - mark)
    mark = now
  }
  const { index, titles, minTitles } = input
  const hash = input.hash ?? sha256Hex
  const reg = createRegistry(index)
  const people = recurringPeople(titles.map((t) => t.title))
  const tq = titles.map((t) => extractQualities(index, reg, t.title, t.tags, people))

  phase('nitelik')
  const cores = Object.keys(index.vocabulary.naming.genreNouns)
  const coreIdx = new Map(cores.map((c, i) => [c, i]))
  const excluded = cores.map((c) => excludedForCore(index, c, reg.list))
  const refQuality = (ref: string) => {
    const at = ref.indexOf(':')
    return at < 0 ? undefined : reg.find(ref.slice(0, at) as MicrogenreSlot, ref.slice(at + 1))
  }
  const isPerson = (id: number) => reg.get(id).slot === 'PERSON'
  const isAdj = (id: number) => reg.get(id).slot === 'ADJECTIVE'
  // Birlikte ada girmeyen çiftler (sözlükte naming.redundantPairs)
  const redundant = new Set<string>()
  for (const [x, y] of index.vocabulary.naming.redundantPairs ?? []) {
    const qx = refQuality(x)
    const qy = refQuality(y)
    if (qx && qy) redundant.add(`${Math.min(qx.id, qy.id)}:${Math.max(qx.id, qy.id)}`)
  }
  const pairOk = (a: number, b: number) => {
    const qa = reg.get(a)
    const qb = reg.get(b)
    return (
      (qa.slot !== qb.slot || qa.slot === 'ADJECTIVE') &&
      qa.folded !== qb.folded &&
      !redundant.has(`${Math.min(a, b)}:${Math.max(a, b)}`)
    )
  }

  // Sık tanımlar → adaylar (film/dizi ayrımıyla)
  const candidates: Candidate[] = []
  const emit = (core: number, quals: number[], list: number[]) => {
    let movies = 0
    for (const ti of list) if (tq[ti]!.type === 'MOVIE') movies++
    const shows = list.length - movies
    if (shows === 0) candidates.push({ core, type: 'MOVIE', quals, titles: list })
    else if (movies === 0) candidates.push({ core, type: 'SHOW', quals, titles: list })
    else {
      candidates.push({ core, type: null, quals, titles: list })
      if (movies >= minTitles)
        candidates.push({ core, type: 'MOVIE', quals, titles: list.filter((ti) => tq[ti]!.type === 'MOVIE') })
      if (shows >= minTitles)
        candidates.push({ core, type: 'SHOW', quals, titles: list.filter((ti) => tq[ti]!.type === 'SHOW') })
    }
  }

  // Çekirdek tür başına dikey sayım: her niteliğin başlık listesi; çift = iki listenin kesişimi; üçlü = aynı ilk
  // nitelikli iki sık çiftin kesişimi (üçüncü çift de sık olmalı). Listeler artan sıradadır.
  const members: { ti: number; quals: number[] }[][] = cores.map(() => [])
  tq.forEach((t, ti) => {
    for (const core of t.cores) {
      const c = coreIdx.get(core)!
      members[c]!.push({ ti, quals: t.quals.filter((q) => !excluded[c]!.has(q)) })
    }
  })
  for (let c = 0; c < cores.length; c++) {
    const ms = members[c]!
    if (ms.length < minTitles) continue
    emit(
      c,
      [],
      ms.map((m) => m.ti),
    )
    const tid = new Map<number, number[]>()
    for (const m of ms)
      for (const q of m.quals) {
        const l = tid.get(q)
        if (l) l.push(m.ti)
        else tid.set(q, [m.ti])
      }
    const singles = [...tid].filter(([, l]) => l.length >= minTitles).sort((x, y) => x[0] - y[0])
    for (const [q, l] of singles) emit(c, [q], l)
    const F = singles.filter(([q]) => !isPerson(q))
    // çiftler: F[i] → [(j, liste)]
    const pairsOf: { j: number; list: number[] }[][] = F.map(() => [])
    const pairSet = new Set<number>()
    for (let i = 0; i < F.length; i++) {
      const [a, ta] = F[i]!
      for (let j = i + 1; j < F.length; j++) {
        const [b, tb] = F[j]!
        if (!pairOk(a, b)) continue
        const inter = intersect(ta, tb)
        if (inter.length < minTitles) continue
        pairsOf[i]!.push({ j, list: inter })
        pairSet.add(i * F.length + j)
        emit(c, [a, b], inter)
      }
    }
    if (MAX_SLOTS < 3) continue
    for (let i = 0; i < F.length; i++) {
      const ps = pairsOf[i]!
      const a = F[i]![0]
      for (let x = 0; x < ps.length; x++) {
        const { j, list: tab } = ps[x]!
        const b = F[j]![0]
        for (let y = x + 1; y < ps.length; y++) {
          const { j: k, list: tad } = ps[y]!
          const d = F[k]![0]
          if (!pairSet.has(j * F.length + k)) continue
          if (isAdj(a) && isAdj(b) && isAdj(d)) continue
          const inter = intersect(tab, tad)
          if (inter.length >= minTitles) emit(c, [a, b, d], inter)
        }
      }
    }
  }

  phase('sayım')
  const qualsOf = (cand: Candidate): Quality[] => cand.quals.map((id) => reg.get(id))
  const canonicalOf = (cand: Candidate) =>
    (cand.canonical ??= canonicalDefinition({
      core: cores[cand.core]!,
      type: cand.type,
      slots: qualsOf(cand).map((q) => ({ slot: q.slot, key: q.key })),
    }))
  /** Ad uzunluğu, adı kurmadan: ifadeler + boşluklar + tür adı */
  const nameLength = (cand: Candidate) => {
    const qs = qualsOf(cand)
    let n = genreNoun(
      index,
      cores[cand.core]!,
      cand.type,
      qs.some((q) => q.compound),
    ).length
    for (const q of qs) n += q.phrase.length + 1
    return n
  }
  const priority = cores.map((c) => index.corePriority.get(c) ?? 99)
  const better = (x: Candidate, y: Candidate): boolean => {
    if (x.quals.length !== y.quals.length) return x.quals.length < y.quals.length
    if (priority[x.core] !== priority[y.core]) return priority[x.core]! < priority[y.core]!
    const nx = nameLength(x)
    const ny = nameLength(y)
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
    const same = input.dedupe === false ? -1 : bucket.findIndex((x) => sameList(x.titles, cand.titles))
    if (same < 0) bucket.push(cand)
    else if (better(cand, bucket[same]!)) bucket[same] = cand
  }
  const winners: Candidate[] = []
  for (const bucket of groups.values()) for (const cand of bucket) winners.push(cand)
  groups.clear()

  phase('ayıklama')
  // Kimlik: 12 hanelik önek; çakışan önek grubunda kanonik sıraya göre ilki 12, sonrakiler daha uzun önek alır.
  const digests = winners.map((cand) => hash(canonicalOf(cand)))
  const firstOfPrefix = new Map<string, number>()
  const clashes = new Map<string, number[]>()
  digests.forEach((d, i) => {
    const p = d.slice(0, ID_HEX)
    const first = firstOfPrefix.get(p)
    if (first === undefined) firstOfPrefix.set(p, i)
    else {
      const l = clashes.get(p)
      if (l) l.push(i)
      else clashes.set(p, [first, i])
    }
  })
  const ids = digests.map((d) => `mg_${d.slice(0, ID_HEX)}`)
  for (const members of clashes.values()) {
    members.sort((x, y) => (canonicalOf(winners[x]!) < canonicalOf(winners[y]!) ? -1 : 1))
    const used = new Set<string>()
    for (const i of members) {
      const digest = digests[i]!
      let len = ID_HEX
      while (used.has(digest.slice(0, len)) && len < digest.length) len += 4
      used.add(digest.slice(0, len))
      ids[i] = `mg_${digest.slice(0, len)}`
    }
  }

  const items: Microgenre[] = []
  const byId = new Map<string, Microgenre>()
  winners.forEach((cand, i) => {
    const id = ids[i]!
    const specificity = cand.quals.length
    const size = cand.titles.length
    const ordered = orderQualities(index, qualsOf(cand))
    const core = cores[cand.core]!
    const mg: Microgenre = {
      id,
      name: nameOf(index, core, cand.type, ordered, true),
      definition: { core, type: cand.type, slots: ordered.map((q) => ({ slot: q.slot, key: q.key })) },
      titleIds: cand.titles.map((ti) => tq[ti]!.titleId),
      size,
      specificity,
      layer: size >= VISIBLE_MIN_TITLES && specificity <= VISIBLE_MAX_SLOTS ? 'VISIBLE' : 'HIDDEN',
    }
    items.push(mg)
    byId.set(id, mg)
  })
  candidates.length = 0
  // Sıra: az yuva → büyük; eşitlikte üretim sırası (kararlı sıralama; aynı girdi aynı sırayı verir)
  items.sort((a, b) => a.specificity - b.specificity || b.size - a.size)

  phase('kimlik-ad')
  const N = titles.length
  const weight = new Map<string, number>()
  const byTitle = new Map<number, Microgenre[]>()
  const titleWeight = new Map<number, number>()
  // Tersten gezilince her başlığın listesi kendiliğinden "en dar önce" (çok yuva → küçük) sıradadır.
  for (let i = items.length - 1; i >= 0; i--) {
    const mg = items[i]!
    const w = N > 0 ? Math.log(N / mg.size) : 0
    weight.set(mg.id, w)
    for (const id of mg.titleIds) {
      const l = byTitle.get(id)
      if (l) l.push(mg)
      else byTitle.set(id, [mg])
      titleWeight.set(id, (titleWeight.get(id) ?? 0) + w)
    }
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
  phase('dizin')
  return { items, byId, byTitle, weight, titleWeight, stats, tookMs: Math.round(performance.now() - started), phaseMs }
}
