/**
 * Eğitim verisi: izleyici × başlık özetlerinden (ViewingFact) tipli dizilere, ardından değerlendirme bölmeleri.
 *
 * Bölmeler (docs/ICERIK_ZEKASI.md §13.2 "Değerlendirme"):
 *   - Soğuk başlangıç: başlıkların sabit bir payı (tohumlu) değerlendirme modelinin eğitiminden TAMAMEN çıkarılır.
 *   - Zamana göre: yeterli geçmişi olan her izleyicinin başlıkları son zaman damgasına göre sıralanır; en yeni ~%20'si
 *     SINAMA, ondan önceki ~%10'u DOĞRULAMA (sıralayıcı bununla eğitilir), kalanı EĞİTİM olur.
 * Sınama kümesi hiçbir öğrenmede kullanılmaz; yalnız ölçülür.
 */
import type { ViewingFact } from '../../../../shared/intelligence'
import { mixSeed, mulberry32 } from './linalg'

export type Work<T> = Generator<void, T, void>

/** Etkileşim rolü */
export const ROLE_TRAIN = 0
export const ROLE_VALID = 1
export const ROLE_TEST = 2
/** Soğuk başlangıç için eğitimden çıkarılmış başlık */
export const ROLE_COLD = 3

export interface Interactions {
  viewerIds: string[]
  /** Model başlık evreni (katalog), artan kimlik sırasıyla */
  titleIds: number[]
  titleIndex: Map<number, number>
  /** Etkileşimler (izleyici, başlık) sırasıyla; aynı çift bir kez */
  u: Int32Array
  i: Int32Array
  engagement: Float32Array
  firstTs: Float64Array
  lastTs: Float64Array
  inList: Uint8Array
  completed: Uint8Array
  /** İzleyici başına etkileşim aralığı: [ptr[v], ptr[v+1]) */
  ptr: Int32Array
}

/**
 * Olgulardan tipli etkileşim dizileri. Katalogda olmayan başlıklar atlanır; aynı izleyici × başlık birden çok
 * kaynaktan gelirse birleştirilir (en yüksek ilgi, en erken ilk / en geç son zaman, bayraklar VEYA).
 */
export function* buildInteractions(facts: ViewingFact[], catalogTitleIds: number[]): Work<Interactions> {
  const titleIds = [...new Set(catalogTitleIds)].sort((a, b) => a - b)
  const titleIndex = new Map<number, number>()
  titleIds.forEach((t, k) => titleIndex.set(t, k))
  const viewerSet = new Set<string>()
  for (let k = 0; k < facts.length; k++) {
    const f = facts[k]!
    if (titleIndex.has(f.titleId)) viewerSet.add(f.viewerId)
    if ((k & 8191) === 0) yield
  }
  const viewerIds = [...viewerSet].sort()
  yield
  const viewerIndex = new Map<string, number>()
  viewerIds.forEach((v, k) => viewerIndex.set(v, k))
  // Anahtar = izleyici × T + başlık; birleştirme için harita, sonra sıralı diziler
  const T = titleIds.length
  const merged = new Map<number, number>()
  const keys: number[] = []
  const eng: number[] = []
  const first: number[] = []
  const last: number[] = []
  const list: number[] = []
  const done: number[] = []
  for (let k = 0; k < facts.length; k++) {
    const f = facts[k]!
    const ti = titleIndex.get(f.titleId)
    if (ti === undefined) continue
    const key = viewerIndex.get(f.viewerId)! * T + ti
    const e = Number.isFinite(f.engagement) ? Math.max(0, Math.min(1, f.engagement)) : 0
    const at = merged.get(key)
    if (at === undefined) {
      merged.set(key, keys.length)
      keys.push(key)
      eng.push(e)
      first.push(f.firstTs)
      last.push(f.lastTs)
      list.push(f.inList ? 1 : 0)
      done.push(f.completions > 0 ? 1 : 0)
    } else {
      eng[at] = Math.max(eng[at]!, e)
      first[at] = Math.min(first[at]!, f.firstTs)
      last[at] = Math.max(last[at]!, f.lastTs)
      if (f.inList) list[at] = 1
      if (f.completions > 0) done[at] = 1
    }
    if ((k & 8191) === 0) yield
  }
  // Anahtarlar tekildir: sayısal sıralama (tipli dizi) + anahtar → kayıt eşlemesi
  const sortedKeys = Float64Array.from(keys).sort()
  yield
  const n = sortedKeys.length
  const out: Interactions = {
    viewerIds,
    titleIds,
    titleIndex,
    u: new Int32Array(n),
    i: new Int32Array(n),
    engagement: new Float32Array(n),
    firstTs: new Float64Array(n),
    lastTs: new Float64Array(n),
    inList: new Uint8Array(n),
    completed: new Uint8Array(n),
    ptr: new Int32Array(viewerIds.length + 1),
  }
  for (let k = 0; k < n; k++) {
    const key = sortedKeys[k]!
    const s = merged.get(key)!
    const v = Math.floor(key / T)
    out.u[k] = v
    out.i[k] = key - v * T
    out.engagement[k] = eng[s]!
    out.firstTs[k] = first[s]!
    out.lastTs[k] = last[s]!
    out.inList[k] = list[s]!
    out.completed[k] = done[s]!
    out.ptr[v + 1]!++
    if ((k & 8191) === 0) yield
  }
  for (let v = 0; v < viewerIds.length; v++) out.ptr[v + 1]! += out.ptr[v]!
  return out
}

export interface SplitOptions {
  seed: number
  /** Sınama payı (izleyici başına en yeni başlıklar) */
  testShare: number
  /** Doğrulama payı (sınamadan hemen önceki başlıklar) */
  validShare: number
  /** Zamana göre bölmeye girmek için gereken en az başlık (soğuk başlıklar sayılmaz) */
  minHistory: number
  /** Eğitimden tamamen çıkarılacak başlık payı (yalnız en az `coldMinViewers` izleyicisi olanlardan seçilir) */
  coldShare: number
  coldMinViewers: number
}

export const DEFAULT_SPLIT: Omit<SplitOptions, 'seed'> = {
  testShare: 0.2,
  validShare: 0.1,
  minHistory: 5,
  coldShare: 0.15,
  coldMinViewers: 3,
}

export interface Split {
  /** Etkileşim başına rol (ROLE_*) */
  role: Uint8Array
  /** Başlık soğuk başlangıç için çıkarıldı mı */
  cold: Uint8Array
  coldTitles: number
  /**
   * İzleyici başına zaman kesitleri (ms): doğrulama / sınama öncesi geçmişin bittiği an (önceki başlıkların en son
   * zamanı). Kesitten önce başlanmış bir sonraki dönem başlığı "devam eden"dir. Bölmeye girmeyende NaN.
   */
  validCutoff: Float64Array
  testCutoff: Float64Array
}

/**
 * Bölmeleri kurar. Aynı veri + tohum → aynı bölme. Sızıntı olmaz: soğuk başlığın HİÇBİR etkileşimi eğitim, doğrulama
 * ya da sınamaya girmez; bir izleyicinin sınama başlıklarının son zamanı, eğitim/doğrulama başlıklarının hepsinden
 * sonra (ya da eşit) gelir.
 */
export function* splitInteractions(data: Interactions, opts: SplitOptions): Work<Split> {
  const T = data.titleIds.length
  const V = data.viewerIds.length
  const n = data.u.length
  const viewersPerTitle = new Int32Array(T)
  for (let k = 0; k < n; k++) viewersPerTitle[data.i[k]!]!++
  // Soğuk başlıklar: uygun olanlardan tohumlu kısmi karıştırma
  const eligible: number[] = []
  for (let t = 0; t < T; t++) if (viewersPerTitle[t]! >= opts.coldMinViewers) eligible.push(t)
  const cold = new Uint8Array(T)
  const want = eligible.length >= 5 ? Math.max(1, Math.round(opts.coldShare * eligible.length)) : 0
  const rng = mulberry32(mixSeed(opts.seed, 101))
  for (let k = 0; k < want; k++) {
    const j = k + Math.floor(rng() * (eligible.length - k))
    const tmp = eligible[k]!
    eligible[k] = eligible[j]!
    eligible[j] = tmp
    cold[eligible[k]!] = 1
  }
  yield
  const role = new Uint8Array(n)
  const validCutoff = new Float64Array(V).fill(NaN)
  const testCutoff = new Float64Array(V).fill(NaN)
  const idx: number[] = []
  for (let v = 0; v < V; v++) {
    idx.length = 0
    for (let k = data.ptr[v]!; k < data.ptr[v + 1]!; k++) {
      if (cold[data.i[k]!]) role[k] = ROLE_COLD
      else idx.push(k)
    }
    const m = idx.length
    if (m >= opts.minHistory) {
      // son zaman, eşitlikte başlık kimliği (kararlı)
      idx.sort((a, b) => data.lastTs[a]! - data.lastTs[b]! || data.i[a]! - data.i[b]!)
      const nTest = Math.max(1, Math.round(opts.testShare * m))
      const nValid = Math.max(1, Math.round(opts.validShare * m))
      const firstTest = m - nTest
      const firstValid = firstTest - nValid
      for (let q = firstValid; q < firstTest; q++) role[idx[q]!] = ROLE_VALID
      for (let q = firstTest; q < m; q++) role[idx[q]!] = ROLE_TEST
      // Kesit = geçmişin bittiği an (öncekilerin en son zamanı); sonrası "gelecek"tir
      validCutoff[v] = data.lastTs[idx[firstValid - 1]!]!
      testCutoff[v] = data.lastTs[idx[firstTest - 1]!]!
    }
    if ((v & 4095) === 0) yield
  }
  return { role, cold, coldTitles: want, validCutoff, testCutoff }
}

/** Seçilen rollerdeki etkileşimlerden CSR (izleyici satırları) ve başlık sütunları. */
export interface Csr {
  rows: number
  cols: number
  ptr: Int32Array
  idx: Int32Array
  /** İlgi puanı (0–1) */
  val: Float32Array
}

export function* buildCsr(
  data: Interactions,
  keep: (k: number) => boolean,
): Work<{ byViewer: Csr; byTitle: Csr; nnz: number }> {
  const V = data.viewerIds.length
  const T = data.titleIds.length
  const n = data.u.length
  const vp = new Int32Array(V + 1)
  const tp = new Int32Array(T + 1)
  let nnz = 0
  for (let k = 0; k < n; k++) {
    if (!keep(k)) continue
    vp[data.u[k]! + 1]!++
    tp[data.i[k]! + 1]!++
    nnz++
    if ((k & 65535) === 65535) yield
  }
  for (let v = 0; v < V; v++) vp[v + 1]! += vp[v]!
  for (let t = 0; t < T; t++) tp[t + 1]! += tp[t]!
  const vIdx = new Int32Array(nnz)
  const vVal = new Float32Array(nnz)
  const tIdx = new Int32Array(nnz)
  const tVal = new Float32Array(nnz)
  const vFill = vp.slice(0, V)
  const tFill = tp.slice(0, T)
  for (let k = 0; k < n; k++) {
    if (!keep(k)) continue
    const u = data.u[k]!
    const i = data.i[k]!
    const e = data.engagement[k]!
    const a = vFill[u]!++
    vIdx[a] = i
    vVal[a] = e
    const b = tFill[i]!++
    tIdx[b] = u
    tVal[b] = e
    if ((k & 65535) === 65535) yield
  }
  return {
    byViewer: { rows: V, cols: T, ptr: vp, idx: vIdx, val: vVal },
    byTitle: { rows: T, cols: V, ptr: tp, idx: tIdx, val: tVal },
    nnz,
  }
}
