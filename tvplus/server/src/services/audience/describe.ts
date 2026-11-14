/**
 * Kümeleri okunur topluluklara çevirir: büyüklüğe göre sıra ve kimlik (tc_01…), ayırt edici özellikler (genele göre
 * kaldıraç), Türkçe ad, öne çıkan başlıklar (kaldıraç + en az erişim), cihaz/ülke dağılımı, saat payı, sıkılık.
 */
import type { CommunityFeature, TasteCommunity, ViewingDevice } from '../../../../shared/intelligence'
import type { FeatureDef, FeatureSpace, ViewerMatrix } from './features'
import { round, type ClusterResult, type Work } from './kmeans'

export interface TitleLift {
  titleId: number
  lift: number
  reach: number
}

export interface Described {
  communities: TasteCommunity[]
  /** Topluluk sırasıyla: kaldıraca göre başlıklar (en çok TITLE_LIFT_LIMIT) */
  titleLifts: TitleLift[][]
  /** Satır → yeni (sıralı) topluluk dizini */
  assign: Int32Array
  /** Sıralı topluluklar için özellik-öncelikli merkezler */
  ct: Float32Array
}

export type TraitsOf = (viewerId: string) => { device: ViewingDevice | null | undefined; country: string | null }

const TOP_FEATURES = 8
const TOP_TITLES = 10
export const TITLE_LIFT_LIMIT = 200
/** Ayırt edici sayılmak için en az kaldıraç ve toplulukta en az ortalama ağırlık */
const MIN_FEATURE_LIFT = 1.15
const MIN_FEATURE_MEAN = 0.01
/** Öne çıkan başlıkta en az erişim (topluluk üyelerinin oranı) */
const MIN_TITLE_REACH = 0.05

export function communityId(index: number, k: number): string {
  const width = Math.max(2, String(k).length)
  return `tc_${String(index + 1).padStart(width, '0')}`
}

export function* describe(
  mat: ViewerMatrix,
  space: FeatureSpace,
  res: ClusterResult,
  traitsOf: TraitsOf,
  titleTypes: Map<number, 'MOVIE' | 'SHOW'>,
): Work<Described> {
  const { k, n } = { k: res.k, n: mat.n }
  const dims = mat.dims
  // Sıralama: büyükten küçüğe; eşitlikte ilk üyesi önce gelen
  const sizes = new Int32Array(k)
  const firstRow = new Int32Array(k).fill(n)
  for (let i = 0; i < n; i++) {
    const a = res.assign[i]!
    sizes[a] = sizes[a]! + 1
    if (i < firstRow[a]!) firstRow[a] = i
  }
  const order = Array.from({ length: k }, (_, j) => j).sort(
    (a, b) => sizes[b]! - sizes[a]! || firstRow[a]! - firstRow[b]!,
  )
  const newOf = new Int32Array(k)
  order.forEach((old, j) => (newOf[old] = j))
  const assign = new Int32Array(n)
  for (let i = 0; i < n; i++) assign[i] = newOf[res.assign[i]!]!
  const ct = new Float32Array(dims * k)
  for (let f = 0; f < dims; f++) for (let j = 0; j < k; j++) ct[f * k + j] = res.ct[f * k + order[j]!]!

  // Topluluk ortalamaları ve genel ortalama (birim satırlar üzerinden)
  const sums = new Float64Array(dims * k)
  const global = new Float64Array(dims)
  const size = new Int32Array(k)
  const hours = new Float64Array(k)
  const simSum = new Float64Array(k)
  const titleCount: Map<number, number>[] = Array.from({ length: k }, () => new Map())
  const titleGlobal = new Map<number, number>()
  const devices: Map<string, number>[] = Array.from({ length: k }, () => new Map())
  const countries: Map<string, number>[] = Array.from({ length: k }, () => new Map())
  let totalHours = 0
  for (let i = 0; i < n; i++) {
    const a = assign[i]!
    size[a] = size[a]! + 1
    hours[a] = hours[a]! + mat.hours[i]!
    totalHours += mat.hours[i]!
    simSum[a] = simSum[a]! + res.sim[i]!
    for (let p = mat.rowPtr[i]!; p < mat.rowPtr[i + 1]!; p++) {
      const f = mat.col[p]!
      sums[f * k + a] = sums[f * k + a]! + mat.val[p]!
      global[f] = global[f]! + mat.val[p]!
    }
    const seen = new Set<number>()
    for (let p = mat.titlePtr[i]!; p < mat.titlePtr[i + 1]!; p++) {
      const t = mat.titleIds[p]!
      if (seen.has(t)) continue
      seen.add(t)
      titleCount[a]!.set(t, (titleCount[a]!.get(t) ?? 0) + 1)
      titleGlobal.set(t, (titleGlobal.get(t) ?? 0) + 1)
    }
    const tr = traitsOf(mat.viewerIds[i]!)
    if (tr.device) devices[a]!.set(tr.device, (devices[a]!.get(tr.device) ?? 0) + 1)
    if (tr.country) countries[a]!.set(tr.country, (countries[a]!.get(tr.country) ?? 0) + 1)
    if ((i & 2047) === 0) yield
  }

  const communities: TasteCommunity[] = []
  const titleLifts: TitleLift[][] = []
  const takenNames = new Set<string>()
  for (let j = 0; j < k; j++) {
    const sz = size[j]!
    const ranked: { def: FeatureDef; lift: number; score: number }[] = []
    for (let f = 0; f < dims; f++) {
      const g = global[f]! / n
      if (g <= 0) continue
      const mean = sums[f * k + j]! / sz
      const lift = mean / g
      if (k === 1) {
        // Tek topluluk: genelle aynıdır (kaldıraç 1); en ağır özellikler listelenir
        if (mean >= MIN_FEATURE_MEAN) ranked.push({ def: space.features[f]!, lift: 1, score: mean })
        continue
      }
      if (lift < MIN_FEATURE_LIFT || mean < MIN_FEATURE_MEAN) continue
      ranked.push({ def: space.features[f]!, lift, score: mean * Math.log(lift) })
    }
    ranked.sort((a, b) => b.score - a.score || (a.def.key < b.def.key ? -1 : 1))
    const topFeatures: CommunityFeature[] = ranked
      .slice(0, TOP_FEATURES)
      .map((r) => ({ kind: r.def.kind, key: r.def.key, name: r.def.name, lift: round(r.lift, 2) }))

    const minCount = Math.min(2, sz)
    const lifts: TitleLift[] = []
    for (const [titleId, cnt] of titleCount[j]!) {
      const reach = cnt / sz
      if (cnt < minCount || reach < MIN_TITLE_REACH) continue
      const lift = reach / (titleGlobal.get(titleId)! / n)
      if (lift < 1) continue // genelden az izlenen başlık topluluğu temsil etmez
      lifts.push({ titleId, lift: round(lift, 3), reach: round(reach, 4) })
    }
    // Topluluğun izlediklerinde film payı → ad başındaki tür adının biçimi (film / dizi / karışık)
    let movieViews = 0
    let allViews = 0
    for (const [titleId, cnt] of titleCount[j]!) {
      allViews += cnt
      if (titleTypes.get(titleId) === 'MOVIE') movieViews += cnt
    }
    const movieShare = allViews > 0 ? movieViews / allViews : 0.5
    const form: NounForm = movieShare >= 0.8 ? 'movie' : movieShare <= 0.2 ? 'show' : 'mixed'
    lifts.sort((a, b) => b.lift - a.lift || b.reach - a.reach || a.titleId - b.titleId)
    titleLifts.push(lifts.slice(0, TITLE_LIFT_LIMIT))

    communities.push({
      id: communityId(j, k),
      name: k === 1 ? 'Tüm İzleyiciler' : nameCommunity(ranked, takenNames, form),
      size: sz,
      share: round(sz / n, 4),
      hoursShare: totalHours > 0 ? round(hours[j]! / totalHours, 4) : 0,
      topFeatures,
      topTitles: lifts.slice(0, TOP_TITLES),
      devices: distribution(devices[j]!, sz) as Partial<Record<ViewingDevice, number>>,
      countries: distribution(countries[j]!, sz),
      cohesion: round(Math.max(0, Math.min(1, simSum[j]! / sz)), 4),
    })
  }
  return { communities, titleLifts, assign, ct }
}

/** Sayımlardan 0–1 paylar (büyükten küçüğe, eşitlikte anahtar sırası). */
function distribution(counts: Map<string, number>, size: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, c] of [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)))
    out[key] = round(c / size, 4)
  return out
}

export type NounForm = 'movie' | 'show' | 'mixed'

/** Mikro tür adı baş olabilsin diye kaldıracı en iyi türünkine en az bu oranda yakın olmalı */
const MICRO_HEAD_RATIO = 0.8
/** İkinci tür, puanı en iyi türün en az bu oranıysa eklenir */
const SECOND_GENRE_RATIO = 0.4

const lower = (x: string) => x.toLocaleLowerCase('tr-TR')

/**
 * Ad = baş + (varsa) ikinci tür + bir niteleyici, " · " ile:
 *   baş       en ayırt edici mikro tür (kaldıracı en iyi türünkine yakınsa; adı zaten okunur bir Türkçe öbek)
 *             ya da en ayırt edici türün çoğul adı — topluluk çoğunlukla film izliyorsa "… Filmleri", dizi izliyorsa
 *             "… Dizileri", karışıksa sözlükteki karışık biçim
 *   ikinci    başta geçmeyen güçlü ikinci tür (kısa adıyla)
 *   niteleyici başta geçmeyen ilk niteleyici (sıfat); yoksa bir yüz değeri
 * Örnek: "Uzay Keşfi Hakkında Doğa ve Bilim Yapımları · Teknoloji · Öğretici". Ad başka toplulukta kullanılmışsa
 * sıradaki ayırt edici özellik eklenir.
 */
export function nameCommunity(
  ranked: { def: FeatureDef; score: number; lift: number }[],
  taken: Set<string>,
  form: NounForm = 'mixed',
): string {
  const parts: string[] = []
  const contains = (label: string) => parts.some((p) => lower(p).includes(lower(label)))
  const genres = ranked.filter((r) => r.def.kind === 'GENRE')
  const bestGenre = genres[0]
  const bestMicro = ranked.find((r) => r.def.kind === 'MICROGENRE')
  let headGenre: (typeof ranked)[number] | undefined
  if (bestMicro && (!bestGenre || bestMicro.lift >= MICRO_HEAD_RATIO * bestGenre.lift)) {
    parts.push(bestMicro.def.label)
  } else if (bestGenre) {
    headGenre = bestGenre
    parts.push(bestGenre.def.nouns?.[form] ?? bestGenre.def.label)
  }
  const second = genres.find(
    (r) => r !== headGenre && !contains(r.def.label) && (!bestGenre || r.score >= SECOND_GENRE_RATIO * bestGenre.score),
  )
  if (second) parts.push(second.def.label)
  const qual =
    ranked.find((r) => r.def.kind === 'DESCRIPTOR' && !contains(r.def.label)) ??
    ranked.find((r) => r.def.kind === 'FACET' && !contains(r.def.label))
  if (qual) parts.push(qual.def.label)
  if (parts.length === 0) parts.push('Karışık Zevkler')
  let name = parts.join(' · ')
  for (const r of ranked) {
    if (!taken.has(name)) break
    if (contains(r.def.label)) continue
    parts.push(r.def.label)
    name = parts.join(' · ')
  }
  let suffix = 2
  const base = name
  while (taken.has(name)) name = `${base} (${suffix++})`
  taken.add(name)
  return name
}
