/**
 * Zevk vektörleri: her başlığın özellikleri (tür, mikro tür, niteleyici, yüz değeri) ve izleyicinin izlediği başlıklardan
 * ilgi puanıyla ağırlıklanmış toplamı. Yaygın özellikler ters sıklıkla (idf) bastırılır; satırlar birim uzunluktadır.
 *
 * Etiket yoksa (etiketleme servisi boş) başlık vektörü künyedeki tür + ruh hâli etiketlerine düşer.
 */
import type { ContentTitle } from '../../../../shared/content-schema'
import type { CommunityFeature, TagVocabulary, ViewingFact } from '../../../../shared/intelligence'
import { GENRES, MOODS } from '../../../../shared/taxonomy'
import type { MicrogenreService, TaggingService } from '../../kernel/intelligence'
import type { SparseMatrix, Work } from './kmeans'

export type FeatureKind = CommunityFeature['kind']

export interface FeatureDef {
  kind: FeatureKind
  key: string
  /** Listelerde görünen ad, ör. "Mekân: Uzay" */
  name: string
  /** Topluluk adında kullanılan kısa biçim, ör. "Belgesel", "Uzay", "Düşündürücü" */
  label: string
  /** Yalnız GENRE: adın başında kullanılan çoğul biçimler (sözlükten; yoksa yok) */
  nouns?: { movie: string; show: string; mixed: string }
}

export interface TitleVec {
  idx: number[]
  val: number[]
}

export interface FeatureSpace {
  features: FeatureDef[]
  titleVecs: Map<number, TitleVec>
}

/** Mikro tür boyutunun üst sınırı (en çok izlenme kapsayanlar kalır) ve en az başlık sayısı */
export const MAX_MICROGENRE_FEATURES = 256
export const MIN_MICROGENRE_TITLES = 3
/** Kümelemeye girmek için en az bu kadar başlıkta ilgi gerekir; azı "atanmamış" sayılır */
export const MIN_TITLES = 2
export const MIN_ENGAGEMENT = 0.05

const GROUP_WEIGHT: Record<FeatureKind, number> = { GENRE: 1, MICROGENRE: 0.9, DESCRIPTOR: 0.6, FACET: 0.6 }
const KIND_ORDER: Record<FeatureKind, number> = { GENRE: 0, MICROGENRE: 1, DESCRIPTOR: 2, FACET: 3 }

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

const EMPTY_VOCAB: TagVocabulary = {
  version: '0000.00-0',
  scales: [],
  facets: [],
  naming: { genreNouns: {}, regions: [], eras: [], order: ['ADJECTIVE'] },
}

/**
 * Özellik uzayı: katalogdaki her başlık için seyrek, birim uzunluklu vektör.
 * `coverage`: başlık → izleyici-başlık özeti sayısı (mikro tür boyutunu kapsama göre kısmak için).
 */
export function buildFeatureSpace(
  titles: ContentTitle[],
  tagging: TaggingService,
  microgenres: MicrogenreService,
  coverage: Map<number, number>,
): FeatureSpace {
  const vocab = safe(() => tagging.vocabulary(), EMPTY_VOCAB)
  const adjectives = new Map<string, string>()
  for (const s of vocab.scales) for (const d of s.descriptors) adjectives.set(d.key, d.adjective)
  const facetValues = new Map<string, { facet: string; name: string }>()
  for (const f of vocab.facets)
    for (const v of f.values) facetValues.set(`${f.key}:${v.key}`, { facet: f.name, name: v.name })

  const defs = new Map<string, FeatureDef>()
  const define = (kind: FeatureKind, key: string, name: string, label: string): string => {
    const id = `${kind}|${key}`
    if (!defs.has(id)) defs.set(id, { kind, key, name, label })
    return id
  }

  // Mikro türler: en az 3 başlıklı, en az bir yuvalı (çıplak tür zaten GENRE), kapsama göre ilk N
  const microCandidates = new Map<string, { name: string; size: number; coverage: number }>()
  const microOfTitle = new Map<number, string[]>()
  for (const t of titles) {
    const list = safe(() => microgenres.ofTitle(t.videoId), [])
    const ids: string[] = []
    for (const mg of list) {
      if (mg.size < MIN_MICROGENRE_TITLES || mg.specificity < 1) continue
      ids.push(mg.id)
      if (!microCandidates.has(mg.id)) {
        let cov = 0
        for (const id of mg.titleIds) cov += coverage.get(id) ?? 0
        microCandidates.set(mg.id, { name: mg.name, size: mg.size, coverage: cov })
      }
    }
    microOfTitle.set(t.videoId, ids)
  }
  const keptMicro = new Set(
    [...microCandidates.entries()]
      .sort((a, b) => b[1].coverage - a[1].coverage || b[1].size - a[1].size || (a[0] < b[0] ? -1 : 1))
      .slice(0, MAX_MICROGENRE_FEATURES)
      .map(([id]) => id),
  )

  const perTitle = new Map<number, { id: string; kind: FeatureKind }[]>()
  for (const t of titles) {
    const items: { id: string; kind: FeatureKind }[] = []
    for (const g of t.genres) {
      const id = define('GENRE', g, GENRES[g].name, GENRES[g].name)
      const nouns = vocab.naming.genreNouns[g]
      const def = defs.get(id)!
      if (nouns && !def.nouns) def.nouns = { movie: nouns.movie, show: nouns.show, mixed: nouns.mixed }
      items.push({ id, kind: 'GENRE' })
    }
    for (const id of microOfTitle.get(t.videoId) ?? []) {
      if (!keptMicro.has(id)) continue
      const mg = microCandidates.get(id)!
      items.push({ id: define('MICROGENRE', id, mg.name, mg.name), kind: 'MICROGENRE' })
    }
    const eff = safe(() => tagging.effective(t.videoId), null)
    let tagged = false
    if (eff) {
      for (const d of eff.descriptors) {
        const adj = adjectives.get(d) ?? d
        items.push({ id: define('DESCRIPTOR', d, adj, adj), kind: 'DESCRIPTOR' })
        tagged = true
      }
      for (const [facet, values] of Object.entries(eff.facets)) {
        for (const v of values) {
          const key = `${facet}:${v}`
          const fv = facetValues.get(key)
          items.push({
            id: define('FACET', key, fv ? `${fv.facet}: ${fv.name}` : key, fv?.name ?? v),
            kind: 'FACET',
          })
          tagged = true
        }
      }
    }
    if (!tagged) {
      // Etiket yok: künyedeki ruh hâli etiketleri niteleyici yerine geçer
      for (const m of t.moods) {
        const name = MOODS[m].displayName
        items.push({ id: define('DESCRIPTOR', m, name, name), kind: 'DESCRIPTOR' })
      }
    }
    perTitle.set(t.videoId, items)
  }

  const ordered = [...defs.entries()].sort(
    (a, b) => KIND_ORDER[a[1].kind] - KIND_ORDER[b[1].kind] || (a[1].key < b[1].key ? -1 : a[1].key > b[1].key ? 1 : 0),
  )
  const index = new Map<string, number>()
  ordered.forEach(([id], i) => index.set(id, i))
  const features = ordered.map(([, d]) => d)

  const titleVecs = new Map<number, TitleVec>()
  for (const [titleId, items] of perTitle) {
    const unique = new Map<number, FeatureKind>()
    for (const it of items) unique.set(index.get(it.id)!, it.kind)
    if (unique.size === 0) continue
    // Grup içinde eşit pay; her grubun toplam uzunluğu grup ağırlığı kadar; sonra birim uzunluk
    const groupCount: Record<FeatureKind, number> = { GENRE: 0, MICROGENRE: 0, DESCRIPTOR: 0, FACET: 0 }
    for (const kind of unique.values()) groupCount[kind]++
    const idx = [...unique.keys()].sort((a, b) => a - b)
    const val = idx.map((i) => {
      const kind = unique.get(i)!
      return GROUP_WEIGHT[kind] / Math.sqrt(groupCount[kind])
    })
    const norm = Math.sqrt(val.reduce((s, v) => s + v * v, 0))
    titleVecs.set(titleId, { idx, val: val.map((v) => v / norm) })
  }
  return { features, titleVecs }
}

export interface ViewerMatrix extends SparseMatrix {
  /** Satır → takma izleyici kimliği (artan sırada; kararlılık için) */
  viewerIds: string[]
  /** Satır → izlenen saat */
  hours: Float64Array
  /** Satır → izlenen başlıklar (CSR) */
  titlePtr: Uint32Array
  titleIds: Int32Array
  idf: Float32Array
  /** Geçmişi yetersiz olduğu için kümelemeye girmeyen izleyiciler */
  unassigned: number
}

/** Bir izleyicinin olgularını tek bir ham (idf'siz) vektörde toplar; dokunulan boyutları döndürür. */
function accumulateViewer(
  facts: ViewingFact[],
  space: FeatureSpace,
  scratch: Float64Array,
  touched: number[],
): { engaged: number; titles: number[]; hours: number } {
  let engaged = 0
  let hours = 0
  const titles: number[] = []
  for (const f of facts) {
    hours += Math.max(0, f.watchedSec) / 3600
    const tv = space.titleVecs.get(f.titleId)
    if (!tv) continue
    const e = Math.min(1, Math.max(0, f.engagement))
    titles.push(f.titleId)
    if (e < MIN_ENGAGEMENT) continue
    engaged++
    for (let q = 0; q < tv.idx.length; q++) {
      const d = tv.idx[q]!
      if (scratch[d] === 0) touched.push(d)
      scratch[d] = scratch[d]! + e * tv.val[q]!
    }
  }
  return { engaged, titles, hours }
}

const byTitle = (a: ViewingFact, b: ViewingFact) => a.titleId - b.titleId

/** İzleyici × özellik matrisi (CSR, birim satırlar). Büyük veri için üreteç: düzenli aralıklarla `yield` eder. */
export function* buildViewerMatrix(facts: ViewingFact[], space: FeatureSpace): Work<ViewerMatrix> {
  const dims = space.features.length
  // İzleyicileri kimliğe göre sırala (girdinin sırasından bağımsız)
  const firstSeen = new Map<string, number>()
  const factViewer = new Int32Array(facts.length)
  for (let i = 0; i < facts.length; i++) {
    const id = facts[i]!.viewerId
    let v = firstSeen.get(id)
    if (v === undefined) {
      v = firstSeen.size
      firstSeen.set(id, v)
    }
    factViewer[i] = v
    if ((i & 16383) === 0) yield
  }
  const ids = [...firstSeen.keys()].sort()
  const rank = new Int32Array(ids.length)
  ids.forEach((id, r) => (rank[firstSeen.get(id)!] = r))
  yield
  // Sayma sıralamasıyla olguları izleyiciye göre grupla
  const start = new Uint32Array(ids.length + 1)
  const factRank = new Int32Array(facts.length)
  for (let i = 0; i < facts.length; i++) {
    const r = rank[factViewer[i]!]!
    factRank[i] = r
    start[r + 1] = start[r + 1]! + 1
    if ((i & 65535) === 0) yield
  }
  for (let r = 0; r < ids.length; r++) start[r + 1] = start[r + 1]! + start[r]!
  const order = new Uint32Array(facts.length)
  const fill = start.slice(0, ids.length)
  for (let i = 0; i < facts.length; i++) {
    const r = factRank[i]!
    order[fill[r]!] = i
    fill[r] = fill[r]! + 1
    if ((i & 65535) === 0) yield
  }
  yield

  let cap = Math.max(16, facts.length * 8)
  let col = new Uint32Array(cap)
  let val = new Float32Array(cap)
  let titleCap = Math.max(16, facts.length)
  let titleIds = new Int32Array(titleCap)
  const rowPtr: number[] = [0]
  const titlePtr: number[] = [0]
  const viewerIds: string[] = []
  const hours: number[] = []
  const df = new Uint32Array(dims)
  const scratch = new Float64Array(dims)
  let nnz = 0
  let nTitles = 0
  let unassigned = 0
  for (let r = 0; r < ids.length; r++) {
    const vf: ViewingFact[] = []
    for (let p = start[r]!; p < start[r + 1]!; p++) vf.push(facts[order[p]!]!)
    vf.sort(byTitle)
    const touched: number[] = []
    const acc = accumulateViewer(vf, space, scratch, touched)
    if (acc.engaged >= MIN_TITLES && touched.length > 0) {
      touched.sort((a, b) => a - b)
      if (nnz + touched.length > cap) {
        cap = Math.max(cap * 2, nnz + touched.length)
        const c2 = new Uint32Array(cap)
        c2.set(col.subarray(0, nnz))
        col = c2
        const v2 = new Float32Array(cap)
        v2.set(val.subarray(0, nnz))
        val = v2
      }
      for (const d of touched) {
        col[nnz] = d
        val[nnz] = scratch[d]!
        df[d] = df[d]! + 1
        nnz++
      }
      rowPtr.push(nnz)
      if (nTitles + acc.titles.length > titleCap) {
        titleCap = Math.max(titleCap * 2, nTitles + acc.titles.length)
        const t2 = new Int32Array(titleCap)
        t2.set(titleIds.subarray(0, nTitles))
        titleIds = t2
      }
      for (const t of acc.titles) titleIds[nTitles++] = t
      titlePtr.push(nTitles)
      viewerIds.push(ids[r]!)
      hours.push(acc.hours)
    } else {
      unassigned++
    }
    for (const d of touched) scratch[d] = 0
    if ((r & 2047) === 0) yield
  }
  const n = viewerIds.length
  const idf = new Float32Array(dims)
  for (let d = 0; d < dims; d++) idf[d] = Math.log((1 + n) / (1 + df[d]!)) + 1
  // idf + birim uzunluk
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let p = rowPtr[i]!; p < rowPtr[i + 1]!; p++) {
      const w = val[p]! * idf[col[p]!]!
      val[p] = w
      s += w * w
    }
    const inv = s > 0 ? 1 / Math.sqrt(s) : 0
    for (let p = rowPtr[i]!; p < rowPtr[i + 1]!; p++) val[p] = val[p]! * inv
    if ((i & 4095) === 0) yield
  }
  return {
    n,
    dims,
    rowPtr: Uint32Array.from(rowPtr),
    col: col.slice(0, nnz),
    val: val.slice(0, nnz),
    viewerIds,
    hours: Float64Array.from(hours),
    titlePtr: Uint32Array.from(titlePtr),
    titleIds: titleIds.slice(0, nTitles),
    idf,
    unassigned,
  }
}

/** Tek izleyicinin vektörü (çalıştırmanın özellik uzayı ve idf'siyle); ilgi yoksa null. */
export function viewerVector(
  facts: ViewingFact[],
  space: FeatureSpace,
  idf: Float32Array,
): { idx: number[]; val: number[] } | null {
  const scratch = new Float64Array(space.features.length)
  const touched: number[] = []
  const acc = accumulateViewer([...facts].sort(byTitle), space, scratch, touched)
  if (acc.engaged === 0 || touched.length === 0) return null
  touched.sort((a, b) => a - b)
  const val = touched.map((d) => scratch[d]! * idf[d]!)
  const norm = Math.sqrt(val.reduce((s, v) => s + v * v, 0))
  if (norm === 0) return null
  return { idx: touched, val: val.map((v) => v / norm) }
}
