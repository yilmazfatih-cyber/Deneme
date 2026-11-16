/**
 * Tetikleyiciler ve neden dağılımı: "bir günü kullanıcının SON günü yapan deneyimler".
 *
 * Her uygulama günü (en az bir oturum) bir gözlemdir; sonuç, o günden sonra n gün boyunca hiç geri dönülmemesidir
 * (ayrık zamanlı risk). İki çözümleme yapılır:
 *
 * 1) Eşleştirilmiş risk oranı — bir deneyimin (oynatma hatası, sonuçsuz arama, dizinin bitmesi …) yaşandığı günlerle
 *    yaşanmadığı günler BENZER durumdaki kullanıcılar arasında karşılaştırılır: kıdem × önceki 28 günün etkinliği ×
 *    cihaz katmanlarında Mantel–Haenszel. Ham ilişkiden güçlü bir kanıttır (az kullanan / yeni kullanıcı karışmaz)
 *    ama gözlemseldir; katmanlarda olmayan karıştırıcılar kalabilir.
 *
 * 2) Ortak risk modeli (lojistik) — tüm deneyimler ve durum (önceki etkinlik, kıdem, cihaz, boyutlar) birlikte.
 *    Bundan iki şey çıkar:
 *      neden dağılımı  her churn olayında riski tabanın üstüne çıkaran pay, o gün var olan zararlı etkenlere
 *                      katkıları oranında dağıtılır; kalan pay "taban"dır (özel bir işaret yokken de var olan risk)
 *      simülatör       simüle kullanıcıların bırakma kararı bu modelden gelir (bkz. lab/src/sim)
 *
 * Neden burada, anlık görüntü modelinde değil: "son etkinlikten beri kaç gün geçti" gibi özellikler gidişin
 * SONUCUDUR ve her şeyi kendine çeker; son günün deneyimi ise gidişten ÖNCE yaşanmıştır.
 */
import type {
  ChurnDefinition,
  ChurnReasons,
  ChurnTriggers,
  ReasonFamily,
  ReasonRow,
  TriggerRow,
} from '../../../shared/lab'
import { REASON_FAMILIES, REASON_LABEL } from '../../../shared/lab'
import { SUB_PAYMENT_FAIL } from '../data/build'
import { mulberry32, sampleIndices } from '../core/rng'
import {
  benjaminiHochberg,
  logistic,
  mantelHaenszelRR,
  quantileSorted,
  sigmoid,
  sortedCopy,
  type Stratum,
} from '../core/stats'
import type { ChurnData } from './data'
import { familyOfDim } from './features'

export interface RiskDays {
  rows: number
  /** Gün tablosundaki satır dizini */
  dayRow: Int32Array
  uid: Uint32Array
  terminal: Uint8Array
  /** Önceki pencerede (bugün hariç) uygulama günü sayısı */
  prior: Uint16Array
  /** İlk görüldüğünden beri gün; pencere öncesinden beri var olanlarda −1 */
  tenure: Int32Array
  /** Son 7 günde ödeme hatası oldu mu */
  payFail: Uint8Array
  /** Son 14 günde (bugün hariç) bir dizi bitirdi */
  exhausted: Uint8Array
  /** Bir önceki uygulama gününün (en çok 3 gün önce) satırı; yoksa −1 */
  prevRow: Int32Array
  priorWindow: number
}

/** Sonucu bilinen uygulama günleri. */
export function collectRiskDays(d: ChurnData, def: ChurnDefinition): RiskDays {
  const W = d.dayMax - d.dayMin + 1
  const priorWindow = Math.max(7, Math.min(28, Math.floor(W / 4)))
  const n = def.n
  const firstDay = d.users.cols.first_day as Int32Array
  const sub = d.days.cols.sub as Uint8Array
  const finished = d.days.cols.series_finished as Uint8Array
  const from = d.dayMin + priorWindow
  let cap = 4096
  let dayRow = new Int32Array(cap)
  let uid = new Uint32Array(cap)
  let terminal = new Uint8Array(cap)
  let prior = new Uint16Array(cap)
  let tenure = new Int32Array(cap)
  let payFail = new Uint8Array(cap)
  let exhausted = new Uint8Array(cap)
  let prevRow = new Int32Array(cap)
  let rows = 0
  const grow = <T extends Int32Array | Uint32Array | Uint8Array | Uint16Array>(a: T): T => {
    const b = new (a.constructor as new (n: number) => T)(cap)
    b.set(a as never)
    return b
  }
  const appDays: number[] = []
  for (let u = 0; u < d.n; u++) {
    appDays.length = 0
    let lastFail = -1e9
    let lastFinish = -1e9
    const r0 = d.dayFrom[u]
    const r1 = d.dayTo[u]
    for (let r = r0; r < r1; r++) if (d.dSessions[r] > 0) appDays.push(r)
    let ai = 0
    let lo = 0
    for (let r = r0; r < r1; r++) {
      const day = d.dDay[r]
      if (sub[r] & SUB_PAYMENT_FAIL) lastFail = day
      // Bitirdiği günden SONRAKİ 14 gün
      const isExhausted = day > lastFinish && day - lastFinish <= 14
      if (finished[r] > 0) lastFinish = day
      if (d.dSessions[r] === 0) continue
      const next = ai + 1 < appDays.length ? d.dDay[appDays[ai + 1]] : -1
      const prev = ai > 0 && day - d.dDay[appDays[ai - 1]] <= 3 ? appDays[ai - 1] : -1
      ai++
      if (day < from) continue
      if (next < 0 && d.dayMax - day < n) continue
      while (lo < appDays.length && d.dDay[appDays[lo]] < day - priorWindow) lo++
      let cnt = 0
      for (let k = lo; k < appDays.length && d.dDay[appDays[k]] < day; k++) cnt++
      if (rows === cap) {
        cap *= 2
        dayRow = grow(dayRow)
        uid = grow(uid)
        terminal = grow(terminal)
        prior = grow(prior)
        tenure = grow(tenure)
        payFail = grow(payFail)
        exhausted = grow(exhausted)
        prevRow = grow(prevRow)
      }
      dayRow[rows] = r
      uid[rows] = u
      terminal[rows] = next < 0 || next - day >= n ? 1 : 0
      prior[rows] = cnt
      tenure[rows] = firstDay[u] <= d.dayMin + 1 ? -1 : day - firstDay[u]
      payFail[rows] = day - lastFail <= 7 ? 1 : 0
      exhausted[rows] = isExhausted ? 1 : 0
      prevRow[rows] = prev
      rows++
    }
  }
  return {
    rows,
    dayRow: dayRow.slice(0, rows),
    uid: uid.slice(0, rows),
    terminal: terminal.slice(0, rows),
    prior: prior.slice(0, rows),
    tenure: tenure.slice(0, rows),
    payFail: payFail.slice(0, rows),
    exhausted: exhausted.slice(0, rows),
    prevRow: prevRow.slice(0, rows),
    priorWindow,
  }
}

interface DayCols {
  plays: Uint16Array
  watch: Float32Array
  completions: Uint16Array
  errors: Uint16Array
  appErrors: Uint16Array
  buffers: Uint16Array
  fails: Uint16Array
  bounces: Uint16Array
  finished: Uint8Array
  newTitles: Uint16Array
  live: Float32Array
  notif: Uint16Array
  device: Uint8Array
  tuple: Uint32Array
}

/**
 * Bir uygulama gününün deneyimi (tetikleyicilerin girdisi). Hem gerçek veriden (gün tablosu) hem simülasyondan
 * (simüle günün toplamları) doldurulur; tetikleyici tanımları tek yerdedir ve ikisinde de aynıdır.
 */
export interface DayExp {
  plays: number
  /** İzlenen süre (sn) */
  watch: number
  completions: number
  errors: number
  appErrors: number
  buffers: number
  /** Sonuçsuz arama sayısı */
  fails: number
  /** Boş (oynatmasız) oturum sayısı */
  bounces: number
  /** O gün bitirilen dizi sayısı */
  finished: number
  newTitles: number
  /** Canlı yayın izleme süresi (sn) */
  live: number
  notif: number
  /** Son 7 günde ödeme hatası */
  payFail: boolean
  /** Son 14 günde (bugün hariç) bir dizi bitirdi */
  exhausted: boolean
  /** Bir önceki uygulama günü (en çok 3 gün önce) var mı ve o günün deneyimi */
  hasPrev: boolean
  prevErrors: number
  prevPlays: number
  prevFails: number
  prevBuffers: number
}

export const emptyDayExp = (): DayExp => ({
  plays: 0,
  watch: 0,
  completions: 0,
  errors: 0,
  appErrors: 0,
  buffers: 0,
  fails: 0,
  bounces: 0,
  finished: 0,
  newTitles: 0,
  live: 0,
  notif: 0,
  payFail: false,
  exhausted: false,
  hasPrev: false,
  prevErrors: 0,
  prevPlays: 0,
  prevFails: 0,
  prevBuffers: 0,
})

export interface TriggerSpec {
  key: string
  label: string
  family: ReasonFamily
  test: (x: DayExp) => boolean
}

export const TRIGGERS: readonly TriggerSpec[] = [
  { key: 'hata', label: 'Oynatma hatası yaşadı', family: 'kalite', test: (x) => x.errors >= 1 },
  { key: 'hata_2', label: 'İki ya da daha çok oynatma hatası', family: 'kalite', test: (x) => x.errors >= 2 },
  { key: 'takilma_3', label: 'Üç ya da daha çok takılma', family: 'kalite', test: (x) => x.buffers >= 3 },
  { key: 'uyg_hata', label: 'Uygulama hatası', family: 'kalite', test: (x) => x.appErrors >= 1 },
  {
    key: 'onceki_hata',
    label: 'Önceki gelişinde oynatma hatası yaşamıştı',
    family: 'kalite',
    test: (x) => x.hasPrev && x.prevErrors >= 1,
  },
  {
    key: 'onceki_takilma',
    label: 'Önceki gelişinde 3+ takılma yaşamıştı',
    family: 'kalite',
    test: (x) => x.hasPrev && x.prevBuffers >= 3,
  },
  { key: 'bos_gun', label: 'Hiçbir şey izlemeden çıktı', family: 'kesif', test: (x) => x.plays === 0 },
  {
    key: 'bos_oturum',
    label: 'İzledi ama bir oturumu boş geçti',
    family: 'kesif',
    test: (x) => x.plays > 0 && x.bounces >= 1,
  },
  { key: 'sonucsuz_arama', label: 'Sonuçsuz arama yaptı', family: 'kesif', test: (x) => x.fails >= 1 },
  {
    key: 'onceki_bos',
    label: 'Önceki gelişinde hiçbir şey izlemeden çıkmıştı',
    family: 'kesif',
    test: (x) => x.hasPrev && x.prevPlays === 0,
  },
  {
    key: 'onceki_sonucsuz',
    label: 'Önceki gelişinde sonuçsuz arama yapmıştı',
    family: 'kesif',
    test: (x) => x.hasPrev && x.prevFails >= 1,
  },
  {
    key: 'tukenme',
    label: 'Dizi bitirdikten sonraki 14 günde izleyecek bir şey bulamadı',
    family: 'icerik',
    test: (x) => x.exhausted && x.plays === 0,
  },
  { key: 'dizi_bitti', label: 'O gün bir diziyi bitirdi', family: 'icerik', test: (x) => x.finished >= 1 },
  { key: 'yeni_baslik', label: 'Yeni bir başlığa başladı', family: 'icerik', test: (x) => x.newTitles >= 1 },
  {
    key: 'tamamlama_yok',
    label: 'İzledi ama hiçbirini bitirmedi',
    family: 'icerik',
    test: (x) => x.plays > 0 && x.completions === 0,
  },
  {
    key: 'canli',
    label: 'Ağırlıkla canlı yayın izledi',
    family: 'icerik',
    test: (x) => x.watch > 0 && x.live >= 0.5 * x.watch,
  },
  {
    key: 'kisa_izleme',
    label: 'On dakikadan az izledi',
    family: 'aliskanlik',
    test: (x) => x.plays > 0 && x.watch < 600,
  },
  { key: 'uzun_izleme', label: 'Bir saatten çok izledi', family: 'aliskanlik', test: (x) => x.watch >= 3600 },
  { key: 'odeme_hatasi', label: 'Son 7 günde ödeme hatası', family: 'abonelik', test: (x) => x.payFail },
  { key: 'bildirim', label: 'Bildirimle geldi', family: 'baglam', test: (x) => x.notif >= 1 },
]

/** Risk satırı i'nin deneyimini `x` içine yazar (nesne yeniden kullanılır). */
function fillDayExp(x: DayExp, c: DayCols, risk: RiskDays, i: number): void {
  const r = risk.dayRow[i]
  x.plays = c.plays[r]
  x.watch = c.watch[r]
  x.completions = c.completions[r]
  x.errors = c.errors[r]
  x.appErrors = c.appErrors[r]
  x.buffers = c.buffers[r]
  x.fails = c.fails[r]
  x.bounces = c.bounces[r]
  x.finished = c.finished[r]
  x.newTitles = c.newTitles[r]
  x.live = c.live[r]
  x.notif = c.notif[r]
  x.payFail = risk.payFail[i] === 1
  x.exhausted = risk.exhausted[i] === 1
  const p = risk.prevRow[i]
  x.hasPrev = p >= 0
  if (p >= 0) {
    x.prevErrors = c.errors[p]
    x.prevPlays = c.plays[p]
    x.prevFails = c.fails[p]
    x.prevBuffers = c.buffers[p]
  }
}

function dayCols(d: ChurnData): DayCols {
  const c = d.days.cols
  return {
    plays: c.plays as Uint16Array,
    watch: c.watch_sec as Float32Array,
    completions: c.completions as Uint16Array,
    errors: c.errors as Uint16Array,
    appErrors: c.app_errors as Uint16Array,
    buffers: c.buffers as Uint16Array,
    fails: c.search_fails as Uint16Array,
    bounces: c.bounces as Uint16Array,
    finished: c.series_finished as Uint8Array,
    newTitles: c.new_titles as Uint16Array,
    live: c.live_sec as Float32Array,
    notif: c.notif_opens as Uint16Array,
    device: c.device as Uint8Array,
    tuple: c.tuple as Uint32Array,
  }
}

/** `primaryOfUser` içinde "taban risk" (özel bir neden baskın değil) */
export const BASELINE = 127

export const tenureBucket = (t: number): number => (t < 0 ? 4 : t <= 7 ? 0 : t <= 30 ? 1 : t <= 90 ? 2 : 3)
const priorBucket = (p: number): number => (p === 0 ? 0 : p <= 3 ? 1 : p <= 8 ? 2 : p <= 15 ? 3 : 4)
const N_STRATA = 5 * 5 * 5

/** Ortak risk modelinin bir sütunu */
export interface HazardColumn {
  /** 'hata' · 'ln_onceki_gun' · 'kidem_0_7' · 'cihaz_tv' · 'boyut:plan=promo-3ay' */
  name: string
  label: string
  family: ReasonFamily
  kind: 'tetik' | 'durum' | 'boyut'
  /**
   * Katkının başvurusu. Tetiklerde 0 (deneyim yaşanmadı). Kukla kümelerinde (kıdem, cihaz, her boyut) kümenin
   * ortalama etkisi: "ortalama kullanıcıya göre" — hangi kategorinin başvuru seçildiğinden bağımsız olsun diye.
   * Aynı `group` adını taşıyan sütunlar tek küme sayılır.
   */
  group: string
}

export interface HazardModel {
  columns: HazardColumn[]
  /** [kesişim, …] */
  coef: number[]
  se: number[]
  /** Atıfta kullanılan katsayılar (kesişim hariç; |z| < 1.96 olanlar 0) */
  effective: number[]
  /** Küme adı → o kümenin ortalama lojit katkısı (merkezleme; `effective` katsayılarla) */
  groupMean: Record<string, number>
  /** Önceki etkinlik sütununun (ln(1 + gün)) başvuru değeri: son gün olmayan günlerde ortanca */
  priorRef: number
  priorWindow: number
  /** Churn süresi (gün) */
  n: number
  rows: number
  baseRate: number
}

export interface TriggerAnalysis {
  triggers: ChurnTriggers
  reasons: ChurnReasons | null
  hazard: HazardModel | null
  /**
   * Kullanıcı dizini → çözümlenen churn olayının birincil nedeni: REASON_FAMILIES dizini, BASELINE (taban risk)
   * ya da −1 (kullanıcının çözümlenen bir churn olayı yok).
   */
  primaryOfUser: Int8Array
}

export function analyzeTriggers(
  d: ChurnData,
  def: ChurnDefinition,
  opts: { minExposed?: number; seed?: number } = {},
): TriggerAnalysis {
  const risk = collectRiskDays(d, def)
  const c = dayCols(d)
  const n = risk.rows
  let terminal = 0
  for (let i = 0; i < n; i++) terminal += risk.terminal[i]
  const baseRate = n ? terminal / n : 0
  const minExposed = opts.minExposed ?? 30
  const stratum = new Uint8Array(n)
  for (let i = 0; i < n; i++)
    stratum[i] =
      tenureBucket(risk.tenure[i]) * 25 + priorBucket(risk.prior[i]) * 5 + Math.min(4, c.device[risk.dayRow[i]])

  /* ── 1) Eşleştirilmiş risk oranları ── */
  const rows: TriggerRow[] = []
  const flags = new Map<string, Uint8Array>()
  // Tüm tetikleyicilerin bayrakları tek geçişte
  const allFlags = TRIGGERS.map(() => new Uint8Array(n))
  const exp = emptyDayExp()
  for (let i = 0; i < n; i++) {
    fillDayExp(exp, c, risk, i)
    for (let k = 0; k < TRIGGERS.length; k++) if (TRIGGERS[k].test(exp)) allFlags[k][i] = 1
  }
  for (let ti = 0; ti < TRIGGERS.length; ti++) {
    const t = TRIGGERS[ti]
    const flag = allFlags[ti]
    const a = new Float64Array(N_STRATA)
    const n1 = new Float64Array(N_STRATA)
    const cc = new Float64Array(N_STRATA)
    const n0 = new Float64Array(N_STRATA)
    let exposed = 0
    let expTerm = 0
    for (let i = 0; i < n; i++) {
      const s = stratum[i]
      if (flag[i]) {
        exposed++
        n1[s]++
        if (risk.terminal[i]) {
          a[s]++
          expTerm++
        }
      } else {
        n0[s]++
        if (risk.terminal[i]) cc[s]++
      }
    }
    if (exposed < minExposed || n - exposed < minExposed) continue
    const strata: Stratum[] = []
    let attributable = 0
    for (let s = 0; s < N_STRATA; s++) {
      if (n1[s] > 0 && n0[s] > 0) {
        strata.push({ a: a[s], n1: n1[s], c: cc[s], n0: n0[s] })
        attributable += a[s] - (n1[s] * cc[s]) / n0[s]
      }
    }
    const mh = mantelHaenszelRR(strata)
    if (!Number.isFinite(mh.rr)) continue
    flags.set(t.key, flag)
    rows.push({
      key: t.key,
      label: t.label,
      family: t.family,
      prevalence: exposed / n,
      exposedDays: exposed,
      rateWith: expTerm / exposed,
      rateWithout: (terminal - expTerm) / (n - exposed),
      rr: mh.rr,
      lo: mh.lo,
      hi: mh.hi,
      p: mh.p,
      pAdj: 1,
      attributable: Math.max(0, attributable),
      attributableShare: terminal > 0 ? Math.max(0, attributable) / terminal : 0,
      coef: null,
    })
  }
  const adj = benjaminiHochberg(rows.map((r) => r.p))
  rows.forEach((r, i) => (r.pAdj = adj[i]))
  rows.sort((x, y) => y.attributable - x.attributable || y.rr - x.rr)
  const triggers: ChurnTriggers = { days: n, terminal, baseRate, rows }
  const primaryOfUser = new Int8Array(d.n).fill(-1)
  if (n < 500 || terminal < 30) return { triggers, reasons: null, hazard: null, primaryOfUser }

  /* ── 2) Ortak risk modeli ── */
  const columns: HazardColumn[] = []
  const indicator: Uint8Array[] = []
  const value: (Uint8Array | Float32Array)[] = []
  const addFlag = (col: HazardColumn, flag: Uint8Array): void => {
    columns.push(col)
    indicator.push(flag)
    value.push(flag)
  }
  for (const t of TRIGGERS) {
    const flag = flags.get(t.key)
    if (flag) addFlag({ name: t.key, label: t.label, family: t.family, kind: 'tetik', group: t.key }, flag)
  }
  // Durum: önceki etkinlik (sürekli), kıdem ve cihaz kuklaları
  const lnPrior = new Float32Array(n)
  const lowPrior = new Uint8Array(n)
  const ten = [new Uint8Array(n), new Uint8Array(n), new Uint8Array(n)]
  const dev = [new Uint8Array(n), new Uint8Array(n), new Uint8Array(n)]
  for (let i = 0; i < n; i++) {
    lnPrior[i] = Math.log1p(risk.prior[i])
    if (risk.prior[i] <= 3) lowPrior[i] = 1
    const tb = tenureBucket(risk.tenure[i])
    if (tb < 3) ten[tb][i] = 1
    const dv = c.device[risk.dayRow[i]]
    if (dv >= 1 && dv <= 3) dev[dv - 1][i] = 1
  }
  columns.push({
    name: 'ln_onceki_gun',
    label: `Önceki ${risk.priorWindow} günde en çok 3 gün gelmişti`,
    family: 'aliskanlik',
    kind: 'durum',
    group: 'ln_onceki_gun',
  })
  indicator.push(lowPrior)
  value.push(lnPrior)
  const tenLabels = ['Kıdem ≤ 7 gün', 'Kıdem 8–30 gün', 'Kıdem 31–90 gün']
  ;['kidem_0_7', 'kidem_8_30', 'kidem_31_90'].forEach((name, k) => {
    if (count(ten[k]) >= minExposed)
      addFlag({ name, label: tenLabels[k], family: 'yasam', kind: 'durum', group: 'kidem' }, ten[k])
  })
  const devLabels = ['TV', 'Mobil', 'Web']
  ;['cihaz_tv', 'cihaz_mobil', 'cihaz_web'].forEach((name, k) => {
    if (count(dev[k]) >= minExposed && n - count(dev[k]) >= minExposed)
      addFlag({ name, label: `Cihaz: ${devLabels[k]}`, family: 'baglam', kind: 'durum', group: 'cihaz' }, dev[k])
  })
  // Boyutlar (o günkü değer): en sık değer başvurudur; yeterince görülen diğer değerler kukla olur
  d.tuples.dimNames.forEach((dim, di) => {
    if (dim === 'cihaz') return
    const dict = d.tuples.dimValues[di]
    const codes = new Uint16Array(n)
    const cn = new Float64Array(dict.length)
    for (let i = 0; i < n; i++) {
      const t = d.tuples.tuples[c.tuple[risk.dayRow[i]]]
      const code = t ? (t[di] ?? 0) : 0
      codes[i] = code
      cn[code]++
    }
    const order = [...cn.keys()].filter((k) => cn[k] > 0).sort((x, y) => cn[y] - cn[x])
    order
      .slice(1)
      .filter((k) => k !== 0 && cn[k] >= Math.max(minExposed * 4, n * 0.02))
      .slice(0, 6)
      .forEach((k) => {
        const flag = new Uint8Array(n)
        for (let i = 0; i < n; i++) if (codes[i] === k) flag[i] = 1
        addFlag(
          {
            name: `boyut:${dim}=${dict[k]}`,
            label: `${dim} = ${dict[k]}`,
            family: familyOfDim(dim),
            kind: 'boyut',
            group: `boyut:${dim}`,
          },
          flag,
        )
      })
  })

  const q = columns.length
  const cap = 400_000
  const pick = n > cap ? sampleIndices(mulberry32(opts.seed ?? 3), n, cap) : null
  const m = pick ? pick.length : n
  const X = new Float32Array(m * q)
  const y = new Uint8Array(m)
  for (let j = 0; j < m; j++) {
    const i = pick ? pick[j] : j
    for (let k = 0; k < q; k++) X[j * q + k] = value[k][i]
    y[j] = risk.terminal[i]
  }
  const fit = logistic(X, y, m, q, { l2: 0.5 })
  const coef = fit.coef
  for (const row of rows) {
    const k = columns.findIndex((col) => col.name === row.key)
    if (k >= 0) row.coef = coef[k + 1]
  }
  // Önceki etkinliğin başvurusu: son gün olmayan günlerde ortanca
  const nonTerminal: number[] = []
  for (let i = 0; i < n; i++) if (!risk.terminal[i]) nonTerminal.push(lnPrior[i])
  const priorRef = nonTerminal.length ? quantileSorted(sortedCopy(nonTerminal), 0.5) : 0
  const priorCol = columns.findIndex((col) => col.name === 'ln_onceki_gun')
  // Kümeler: aynı `group` adını taşıyan sütunlar; kukla kümeleri ortalama etkilerine göre merkezlenir
  const groupNames = [...new Set(columns.map((col) => col.group))]
  const colGroup = columns.map((col) => groupNames.indexOf(col.group))
  const G = groupNames.length
  const groupRef = new Float64Array(G)
  // Atıfta yalnız istatistiksel olarak desteklenen katsayılar kullanılır (|z| ≥ 1.96): gürültü katsayıları
  // (özellikle etkisi olmayan boyutların kuklaları) toplanıp sahte bir "neden" üretmesin
  const eff = new Float64Array(q)
  // Bağlam (cihaz, sürüm, şehir, kaynak …) modelde denetim değişkenidir ama "neden" sayılmaz: kimin gittiğini
  // anlatır, neden gittiğini değil. O kırılımlar segment taramasındadır (churn kim).
  for (let k = 0; k < q; k++)
    eff[k] = columns[k].family !== 'baglam' && Math.abs(fit.z[k + 1]) >= 1.96 ? coef[k + 1] : 0
  columns.forEach((col, k) => {
    if (col.kind === 'tetik') return
    if (k === priorCol) groupRef[colGroup[k]] = eff[k] * priorRef
    else groupRef[colGroup[k]] += (eff[k] * count(indicator[k])) / n
  })
  const famIndex = new Map(REASON_FAMILIES.map((f, i) => [f, i]))
  const groupFam = groupNames.map((g) => famIndex.get(columns[columns.findIndex((col) => col.group === g)].family) ?? 0)
  const colFam = columns.map((col) => famIndex.get(col.family) ?? 0)
  const hazard: HazardModel = {
    columns,
    coef: [...coef],
    se: [...fit.se],
    effective: [...eff],
    groupMean: Object.fromEntries(groupNames.map((g, gi) => [g, groupRef[gi]])),
    priorRef,
    priorWindow: risk.priorWindow,
    n: def.n,
    rows: m,
    baseRate,
  }

  /* ── Neden dağılımı ──
   * Her günde her kümenin başvurusuna göre lojit katkısı hesaplanır; aile katkısı kümelerinin toplamıdır (aynı
   * ailedeki koruyucu etkiler zararlıları dengeler), yalnız net zararlı aileler pay alır. */
  const F = REASON_FAMILIES.length
  const grp = new Float64Array(G)
  const fam = new Float64Array(F)
  const fraction = new Float64Array(F)
  const primaryCount = new Float64Array(F)
  const pafNum = new Float64Array(F)
  let pSum = 0
  let baselineFraction = 0
  let baselinePrimary = 0
  // Aile → sütun → o ailenin birincil olduğu churn olaylarında görülme sayısı
  const seen = new Float64Array(F * q)
  for (let i = 0; i < n; i++) {
    grp.fill(0)
    fam.fill(0)
    let eta = coef[0]
    for (let k = 0; k < q; k++) {
      const v = value[k][i]
      eta += coef[k + 1] * v
      grp[colGroup[k]] += eff[k] * v
    }
    for (let g = 0; g < G; g++) fam[groupFam[g]] += grp[g] - groupRef[g]
    let harm = 0
    for (let f = 0; f < F; f++) if (fam[f] > 0) harm += fam[f]
    const p = sigmoid(eta)
    pSum += p
    for (let f = 0; f < F; f++) if (fam[f] > 0) pafNum[f] += p - sigmoid(eta - fam[f])
    if (!risk.terminal[i]) continue
    const af = harm > 0 ? (p - sigmoid(eta - harm)) / p : 0
    baselineFraction += 1 - af
    let best = -1
    let bestW = 0
    for (let f = 0; f < F; f++) {
      if (fam[f] <= 0) continue
      const wgt = (af * fam[f]) / harm
      fraction[f] += wgt
      if (wgt > bestW) {
        bestW = wgt
        best = f
      }
    }
    // Birincil neden: tek başına churn olayının en az dörtte birini açıklayan en büyük aile
    if (best >= 0 && bestW >= 0.25) {
      primaryCount[best]++
      primaryOfUser[risk.uid[i]] = best
      for (let k = 0; k < q; k++) if (colFam[k] === best && indicator[k][i]) seen[best * q + k]++
    } else {
      baselinePrimary++
      primaryOfUser[risk.uid[i]] = BASELINE
    }
  }
  const overall = columns.map((_, k) => count(indicator[k]) / n)
  const reasonRows: ReasonRow[] = REASON_FAMILIES.filter((family) => family !== 'baglam')
    .map((family): ReasonRow => {
      const f = famIndex.get(family) ?? 0
      const signals = columns
        .map((col, k) => ({ col, k, share: primaryCount[f] ? seen[f * q + k] / primaryCount[f] : 0 }))
        .filter((x) => colFam[x.k] === f && x.share > 0 && eff[x.k] * (x.k === priorCol ? -1 : 1) > 0)
        .sort((x, yy) => yy.share - x.share)
        .slice(0, 3)
        .map((x) => ({ key: x.col.name, label: x.col.label, share: x.share, overall: overall[x.k] }))
      return {
        family,
        label: REASON_LABEL[family],
        share: terminal ? primaryCount[f] / terminal : 0,
        churners: primaryCount[f],
        fraction: terminal ? fraction[f] / terminal : 0,
        avoidableShare: pSum > 0 ? pafNum[f] / pSum : 0,
        signals,
      }
    })
    .sort((x, yy) => yy.fraction - x.fraction)
  const reasons: ChurnReasons = {
    baseRate,
    churners: terminal,
    rows: reasonRows,
    baselineShare: terminal ? baselinePrimary / terminal : 0,
    baselineFraction: terminal ? baselineFraction / terminal : 0,
  }
  return { triggers, reasons, hazard, primaryOfUser }
}

function count(a: Uint8Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i]
  return s
}
