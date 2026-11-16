/**
 * Tercih kâhini: simüle bir izleyicinin bir başlığı izlemek isteme eğilimi (fayda). Uygulamanın öneri modelinden
 * BAĞIMSIZ kurulur — yoksa "modelin önerdiğini izleyici de ister" döngüsü oluşur ve model tabanlı her varyant
 * kendiliğinden kazanır.
 *
 *   fayda(u, t) = w₁ · birlikte izlenme yakınlığı (u'nun geçmişindeki başlıklara en benzer 3'ünün ortalaması)
 *               + w₂ · tür yakınlığı (u'nun izlediklerinde t'nin türlerinin payı)
 *               + w₃ · popülerlik
 *               + kişiye özgü kararlı gürültü (aynı izleyici aynı başlığa hep aynı tepkiyi verir)
 *
 * Ağırlıklar gerçek seçimlerden kestirilir: bir kullanıcının sıradaki izlediği başlık (olumlu) ile izlemediği
 * rastgele başlıklar (olumsuz) arasında lojistik regresyon; özellikler yalnız o ana kadarki geçmişten hesaplanır.
 * Ayrılan sınama kümesindeki AUC, kâhinin gerçek seçimleri ne kadar iyi sıraladığını söyler ve karneye girer.
 */
import { loadTable } from '../core/columns'
import type { Lab } from '../core/lab'
import { mix32, mulberry32, sampleIndices } from '../core/rng'
import { auc, logistic, logisticPredict } from '../core/stats'
import type { BridgeMap } from './bridge'
import type { Population } from './population'

const NEIGHBORS = 40
const TOP_SIM = 3

export interface Oracle {
  /** İkiz i'nin köprü başlığı j için faydası (lojit ölçeği) */
  utility(twin: number, title: number): number
  /** İkizin başlangıçtaki geçmişi (köprü başlık dizinleri) */
  history(twin: number): Int32Array
  titles: number
  weights: { knn: number; genre: number; popularity: number }
  /** Ağırlıkların kestirildiği satır sayısı ve ayrılan kümedeki AUC */
  fit: { rows: number; auc: number; users: number }
}

interface UserTitles {
  /** Köprü başlık dizinleri, ilk izleme gününe göre sıralı */
  idx: Int32Array
}

export function buildOracle(
  lab: Lab,
  bridge: BridgeMap,
  pop: Population,
  opts: { beforeDay?: number; seed?: number; noise?: number } = {},
): Oracle {
  const seed = opts.seed ?? 1
  const J = bridge.titles.length
  const jOfTid = new Map(bridge.titles.map((t, j) => [t.tid, j]))
  const facts = loadTable(lab.tableDir, 'izleme', ['uid', 'tid', 'first_day', 'watch_sec'])
  const fUid = facts.cols.uid
  const fTid = facts.cols.tid
  const fFirst = facts.cols.first_day
  const titlesT = loadTable(lab.tableDir, 'baslik', ['viewers'])
  const viewers = titlesT.cols.viewers

  /* ── Kullanıcı → başlık listeleri (ilk izleme sırasıyla) ── */
  const lists = new Map<number, { j: number; day: number }[]>()
  for (let r = 0; r < facts.rows; r++) {
    const j = jOfTid.get(fTid[r])
    if (j === undefined) continue
    if (opts.beforeDay !== undefined && fFirst[r] >= opts.beforeDay) continue
    const list = lists.get(fUid[r]) ?? []
    list.push({ j, day: fFirst[r] })
    lists.set(fUid[r], list)
  }
  const users = new Map<number, UserTitles>()
  for (const [u, list] of lists) {
    list.sort((a, b) => a.day - b.day || a.j - b.j)
    users.set(u, { idx: Int32Array.from(list.map((x) => x.j)) })
  }

  /* ── Birlikte izlenme benzerliği (kosinüs), başlık başına en yakın komşular ── */
  const count = new Float64Array(J)
  const co: Map<number, number>[] = Array.from({ length: J }, () => new Map())
  const rng = mulberry32(mix32(seed, 77))
  const all = [...users.keys()]
  const pick = all.length > 60_000 ? sampleIndices(rng, all.length, 60_000) : null
  const used = pick ? [...pick].map((i) => all[i]) : all
  for (const u of used) {
    const idx = users.get(u)?.idx
    if (!idx) continue
    const m = Math.min(idx.length, 60)
    const from = idx.length - m
    for (let a = from; a < idx.length; a++) {
      count[idx[a]]++
      for (let b = a + 1; b < idx.length; b++) {
        const x = idx[a]
        const y = idx[b]
        if (x === y) continue
        co[x].set(y, (co[x].get(y) ?? 0) + 1)
        co[y].set(x, (co[y].get(x) ?? 0) + 1)
      }
    }
  }
  const nbrIdx: Int32Array[] = []
  const nbrSim: Float32Array[] = []
  for (let j = 0; j < J; j++) {
    const list: [number, number][] = []
    for (const [k, c] of co[j]) {
      // Tek kullanıcıya dayanan eşleşmeler gürültüdür
      if (c < 2 && used.length > 500) continue
      list.push([k, c / Math.sqrt(Math.max(1, count[j]) * Math.max(1, count[k]))])
    }
    list.sort((a, b) => b[1] - a[1])
    const top = list.slice(0, NEIGHBORS)
    nbrIdx.push(Int32Array.from(top.map((x) => x[0])))
    nbrSim.push(Float32Array.from(top.map((x) => x[1])))
    co[j].clear()
  }

  /* ── Tür ve popülerlik ── */
  const genreNames = [...new Set(bridge.titles.flatMap((t) => t.genres))]
  const G = genreNames.length
  const titleGenres: Int32Array[] = bridge.titles.map((t) =>
    Int32Array.from(t.genres.map((g) => genreNames.indexOf(g))),
  )
  let maxViewers = 1
  for (const t of bridge.titles) if (viewers[t.tid] > maxViewers) maxViewers = viewers[t.tid]
  const popularity = Float32Array.from(bridge.titles.map((t) => Math.log1p(viewers[t.tid]) / Math.log1p(maxViewers)))

  // Geçmişten özellik çıkarıcılar
  const topBuf = new Float32Array(TOP_SIM)
  const genreShare = new Float32Array(G)
  const knnOf = (history: ArrayLike<number>, len: number, target: number): number => {
    // Hedefin komşuları içinde geçmişte olanların benzerliklerinden en büyük TOP_SIM'in ortalaması
    const ni = nbrIdx[target]
    const ns = nbrSim[target]
    topBuf.fill(0)
    for (let a = 0; a < ni.length; a++) {
      const k = ni[a]
      let inHist = false
      for (let h = 0; h < len; h++) {
        if (history[h] === k) {
          inHist = true
          break
        }
      }
      if (!inHist) continue
      const s = ns[a]
      let minAt = 0
      for (let q = 1; q < TOP_SIM; q++) if (topBuf[q] < topBuf[minAt]) minAt = q
      if (s > topBuf[minAt]) topBuf[minAt] = s
    }
    let sum = 0
    for (let q = 0; q < TOP_SIM; q++) sum += topBuf[q]
    return sum / TOP_SIM
  }
  const genreOf = (history: ArrayLike<number>, len: number, target: number): number => {
    if (len === 0) return 0
    genreShare.fill(0)
    for (let h = 0; h < len; h++) {
      const gs = titleGenres[history[h]]
      for (let a = 0; a < gs.length; a++) genreShare[gs[a]] += 1 / len
    }
    const tg = titleGenres[target]
    if (!tg.length) return 0
    let s = 0
    for (let a = 0; a < tg.length; a++) s += genreShare[tg[a]]
    return s / tg.length
  }

  /* ── Ağırlıkların kestirimi: sıradaki başlık (olumlu) ↔ izlenmemiş rastgele başlıklar (olumsuz) ── */
  const X: number[] = []
  const y: number[] = []
  const isTest: number[] = []
  const NEG = 6
  const trainUsers = [...users.entries()].filter(([, v]) => v.idx.length >= 4)
  const cap = Math.min(trainUsers.length, 6000)
  const order = sampleIndices(rng, trainUsers.length, cap)
  let fitUsers = 0
  for (let o = 0; o < order.length && y.length < 250_000; o++) {
    const [, v] = trainUsers[order[o]]
    const idx = v.idx
    const own = new Set(idx)
    const test = rng() < 0.2 ? 1 : 0
    fitUsers++
    for (let k = 2; k < idx.length && k < 40; k++) {
      const t = idx[k]
      X.push(knnOf(idx, k, t), genreOf(idx, k, t), popularity[t])
      y.push(1)
      isTest.push(test)
      for (let q = 0; q < NEG; q++) {
        let neg = Math.floor(rng() * J)
        for (let guard = 0; guard < 8 && own.has(neg); guard++) neg = Math.floor(rng() * J)
        if (own.has(neg)) continue
        X.push(knnOf(idx, k, neg), genreOf(idx, k, neg), popularity[neg])
        y.push(0)
        isTest.push(test)
      }
    }
  }
  let weights = { knn: 6, genre: 2, popularity: 1.5 }
  let fitAuc = NaN
  const rows = y.length
  if (rows >= 400) {
    const trX: number[] = []
    const trY: number[] = []
    const teX: number[] = []
    const teY: number[] = []
    for (let i = 0; i < rows; i++) {
      const dst = isTest[i] ? teX : trX
      dst.push(X[i * 3], X[i * 3 + 1], X[i * 3 + 2])
      ;(isTest[i] ? teY : trY).push(y[i])
    }
    if (trY.length >= 200) {
      const fit = logistic(Float64Array.from(trX), trY, trY.length, 3, { l2: 0.1 })
      weights = { knn: Math.max(0, fit.coef[1]), genre: Math.max(0, fit.coef[2]), popularity: Math.max(0, fit.coef[3]) }
      if (teY.length >= 100) fitAuc = auc(logisticPredict(fit.coef, Float64Array.from(teX), teY.length, 3), teY)
    }
  }

  /* ── İkizler: başlangıç geçmişi ve tembel fayda önbelleği ── */
  const histories: Int32Array[] = []
  for (let i = 0; i < pop.n; i++) histories.push(users.get(pop.src[i])?.idx ?? new Int32Array(0))
  const cache: (Float32Array | null)[] = new Array<Float32Array | null>(pop.n).fill(null)
  const noise = opts.noise ?? 1
  const compute = (twin: number): Float32Array => {
    const h = histories[twin]
    const out = new Float32Array(J)
    const g = mulberry32(mix32(mix32(seed, 9001), pop.src[twin]))
    for (let j = 0; j < J; j++) {
      // Kararlı gürültü: yaklaşık standart normal (dört düzgün sayının toplamı, birim varyansa ölçekli)
      const z = (g() + g() + g() + g() - 2) * 1.7320508
      out[j] =
        weights.knn * knnOf(h, h.length, j) +
        weights.genre * genreOf(h, h.length, j) +
        weights.popularity * popularity[j] +
        noise * z
    }
    return out
  }
  return {
    titles: J,
    weights,
    fit: { rows, auc: fitAuc, users: fitUsers },
    history: (twin) => histories[twin],
    utility(twin, title) {
      let u = cache[twin]
      if (!u) {
        u = compute(twin)
        cache[twin] = u
      }
      return u[title]
    },
  }
}
