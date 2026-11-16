/**
 * Kalibrasyon ve gerçeklik karnesi.
 *
 * Simülatör, verinin son `horizon` gününün başına (T₀) götürülür: nüfus T₀'da etkin olan kullanıcıların ikizleridir,
 * uygulamanın tahmin modeli ve tercih kâhini yalnız T₀'dan önceki izlemelerle kurulur. Sonra o günler simüle edilir
 * ve gerçekte olanla karşılaştırılır. İki serbest ayar gerçek veriye uydurulur (birkaç kısa koşuyla):
 *   seçim kesişimi   → boş oturum payı gerçektekiyle aynı olsun
 *   risk düzeltmesi  → ufuk sonunda gitmiş olanların payı gerçektekiyle aynı olsun
 * Diğer ölçüler (gün başına oynatma, izleme süresi, tamamlama, hata günleri, haftalık etkinlik …) uydurulmaz;
 * karnede yalnız RAPORLANIR — simülatörün veriyi ne kadar yeniden ürettiğinin dürüst ölçüsü onlardır.
 *
 * Sınır: risk modelinin katsayıları tüm pencereden kestirilmiştir (T₀ sonrası dahil); bu yüzden karne tam anlamıyla
 * örneklem dışı değildir. Veri penceresi uzadıkça ayrı bir doğrulama dönemi ayrılabilir.
 */
import type { ChurnDefinition, FidelityMetric, SimAssumption, SimCalibration } from '../../../shared/lab'
import type { ChurnData } from '../churn/data'
import { hazardEvaluator } from '../churn/hazard'
import type { HazardModel } from '../churn/triggers'
import { dayStr } from '../core/format'
import type { Lab } from '../core/lab'
import { loadBridge } from './bridge'
import { DEFAULT_KNOBS, runUniverse, wasActive, type SimKnobs, type UniverseResult } from './engine'
import { buildOracle } from './oracle'
import { buildPopulation, type Population } from './population'
import { openWorld } from './world'

const logit = (p: number): number => {
  const q = Math.min(1 - 1e-4, Math.max(1e-4, p))
  return Math.log(q / (1 - q))
}

/**
 * Tek ayarın sekant yöntemiyle güncellenmesi: hata (hedefe uzaklık) sıfıra çekilir. İlk adımda ya da eğim güvenilmezse
 * (çok yassı / ters işaretli) `gain × hata` kadar yedek adım atılır. Adım ve aralık sınırlıdır.
 */
class Tuner {
  x: number
  private px: number | null = null
  private py: number | null = null
  private readonly lo: number
  private readonly hi: number
  private readonly maxStep: number
  private readonly gain: number
  constructor(x0: number, lo: number, hi: number, maxStep: number, gain: number) {
    this.x = x0
    this.lo = lo
    this.hi = hi
    this.maxStep = maxStep
    this.gain = gain
  }
  update(err: number): void {
    let step = this.gain * err
    if (this.px !== null && this.py !== null && Math.abs(this.x - this.px) > 1e-9) {
      const slope = (err - this.py) / (this.x - this.px)
      // Beklenen yön: ayar büyüdükçe hata küçülür (eğim negatif)
      if (slope < -0.02) step = -err / slope
    }
    step = Math.max(-this.maxStep, Math.min(this.maxStep, step))
    this.px = this.x
    this.py = err
    this.x = Math.max(this.lo, Math.min(this.hi, this.x + step))
  }
}

interface Summary {
  appDaysPerUser: number
  sessionsPerAppDay: number
  playsPerAppDay: number
  watchMinPerAppDay: number
  bounceSessionShare: number
  bounceDayShare: number
  errorDayShare: number
  bufferDayShare: number
  searchFailPerAppDay: number
  completionRate: number
  newTitlesPerAppDay: number
  liveShare: number
  goneShare: number
  weekly: number[]
}

/** Gerçek veriden: ikizlerin kaynak kullanıcılarının [T₀, T₀ + H) aralığında yaşadıkları. */
export function realSummary(d: ChurnData, pop: Population, horizon: number, n: number): Summary {
  const c = d.days.cols
  const T0 = pop.startDay
  const weeks = Math.floor(horizon / 7)
  const weekly = new Float64Array(weeks)
  let appDays = 0
  let sess = 0
  let plays = 0
  let watch = 0
  let live = 0
  let bounces = 0
  let bounceDays = 0
  let errDays = 0
  let bufDays = 0
  let fails = 0
  let comps = 0
  let newTitles = 0
  let gone = 0
  const seenWeek = new Uint8Array(Math.max(1, weeks))
  for (let i = 0; i < pop.n; i++) {
    const u = pop.src[i]
    let last = -1
    seenWeek.fill(0)
    for (let r = d.dayFrom[u]; r < d.dayTo[u]; r++) {
      const day = d.dDay[r]
      if (day < T0) continue
      if (day >= T0 + horizon) break
      if (d.dSessions[r] === 0) continue
      appDays++
      last = day
      sess += c.sessions[r]
      plays += c.plays[r]
      watch += c.watch_sec[r]
      live += c.live_sec[r]
      bounces += c.bounces[r]
      if (c.plays[r] === 0) bounceDays++
      if (c.errors[r] >= 1) errDays++
      if (c.buffers[r] >= 3) bufDays++
      fails += c.search_fails[r]
      comps += c.completions[r]
      newTitles += c.new_titles[r]
      const w = Math.floor((day - T0) / 7)
      if (w < weeks && !seenWeek[w]) {
        seenWeek[w] = 1
        weekly[w]++
      }
    }
    if (last < T0 + horizon - n) gone++
  }
  return {
    appDaysPerUser: appDays / pop.n,
    sessionsPerAppDay: appDays ? sess / appDays : 0,
    playsPerAppDay: appDays ? plays / appDays : 0,
    watchMinPerAppDay: appDays ? watch / 60 / appDays : 0,
    bounceSessionShare: sess ? bounces / sess : 0,
    bounceDayShare: appDays ? bounceDays / appDays : 0,
    errorDayShare: appDays ? errDays / appDays : 0,
    bufferDayShare: appDays ? bufDays / appDays : 0,
    searchFailPerAppDay: appDays ? fails / appDays : 0,
    completionRate: plays ? comps / plays : 0,
    newTitlesPerAppDay: appDays ? newTitles / appDays : 0,
    liveShare: watch > 0 ? live / watch : 0,
    goneShare: gone / pop.n,
    weekly: [...weekly].map((x) => x / pop.n),
  }
}

export function simSummary(r: UniverseResult, n: number): Summary {
  const weeks = Math.floor(r.days / 7)
  const weekly = new Float64Array(weeks)
  let appDays = 0
  let sess = 0
  let plays = 0
  let watch = 0
  let live = 0
  let bounces = 0
  let bounceDays = 0
  let errors = 0
  let bufDays = 0
  let fails = 0
  let comps = 0
  let newTitles = 0
  let gone = 0
  for (let i = 0; i < r.n; i++) {
    appDays += r.appDays[i]
    sess += r.sessions[i]
    plays += r.plays[i]
    watch += r.watchMin[i]
    live += r.liveMin[i]
    bounces += r.bounceSessions[i]
    bounceDays += r.bounceDays[i]
    errors += r.errors[i]
    bufDays += r.bufferDays[i]
    fails += r.searchFails[i]
    comps += r.completions[i]
    newTitles += r.newTitles[i]
    if (r.lastAppDay[i] < r.days - n) gone++
    for (let w = 0; w < weeks; w++) {
      for (let k = 0; k < 7; k++) {
        if (wasActive(r, i, w * 7 + k)) {
          weekly[w]++
          break
        }
      }
    }
  }
  return {
    appDaysPerUser: appDays / r.n,
    sessionsPerAppDay: appDays ? sess / appDays : 0,
    playsPerAppDay: appDays ? plays / appDays : 0,
    watchMinPerAppDay: appDays ? watch / appDays : 0,
    bounceSessionShare: sess ? bounces / sess : 0,
    bounceDayShare: appDays ? bounceDays / appDays : 0,
    // Simülasyonda hata günü sayılmaz; hata sayısından yaklaşık gün payı (gün başına en çok bir kez sayılsın diye üst sınırlı)
    errorDayShare: appDays ? Math.min(1, errors / appDays) : 0,
    bufferDayShare: appDays ? bufDays / appDays : 0,
    searchFailPerAppDay: appDays ? fails / appDays : 0,
    completionRate: plays ? comps / plays : 0,
    newTitlesPerAppDay: appDays ? newTitles / appDays : 0,
    liveShare: watch > 0 ? live / watch : 0,
    goneShare: gone / r.n,
    weekly: [...weekly].map((x) => x / r.n),
  }
}

const METRICS: {
  key: keyof Omit<Summary, 'weekly'>
  label: string
  unit: FidelityMetric['unit']
  calibrated?: boolean
}[] = [
  { key: 'goneShare', label: 'Ufuk sonunda gitmiş olanların payı', unit: 'oran', calibrated: true },
  { key: 'bounceSessionShare', label: 'Boş oturum payı', unit: 'oran', calibrated: true },
  { key: 'appDaysPerUser', label: 'İkiz başına uygulama günü', unit: 'sayı', calibrated: true },
  { key: 'newTitlesPerAppDay', label: 'Uygulama günü başına yeni başlık', unit: 'sayı', calibrated: true },
  { key: 'completionRate', label: 'Tamamlama oranı', unit: 'oran', calibrated: true },
  { key: 'sessionsPerAppDay', label: 'Uygulama günü başına oturum', unit: 'sayı' },
  { key: 'playsPerAppDay', label: 'Uygulama günü başına oynatma', unit: 'sayı' },
  { key: 'watchMinPerAppDay', label: 'Uygulama günü başına izleme (dk)', unit: 'dk' },
  { key: 'bounceDayShare', label: 'Hiç izlenmeden biten günlerin payı', unit: 'oran' },
  { key: 'errorDayShare', label: 'Oynatma hatası yaşanan günlerin payı', unit: 'oran' },
  { key: 'bufferDayShare', label: '3+ takılma yaşanan günlerin payı', unit: 'oran' },
  { key: 'searchFailPerAppDay', label: 'Uygulama günü başına sonuçsuz arama', unit: 'sayı' },
  { key: 'liveShare', label: 'Canlı yayının izlemedeki payı', unit: 'oran' },
]

export function compare(real: Summary, sim: Summary): { metrics: FidelityMetric[]; score: number; absent: string[] } {
  const absent: string[] = []
  const metrics: FidelityMetric[] = []
  for (const m of METRICS) {
    const a = real[m.key]
    const b = sim[m.key]
    // Gerçekte de simülasyonda da sıfır: bu ölçü veride yok (olay eşlenmemiş). "Tuttu" sayılmaz, karneye girmez.
    if (a === 0 && b === 0) {
      absent.push(m.label)
      continue
    }
    const ratio = a > 0 ? b / a : Infinity
    const ok = (ratio >= 0.75 && ratio <= 1.33) || (m.unit === 'oran' && Math.abs(a - b) <= 0.015)
    metrics.push({
      key: m.key,
      label: m.label,
      real: a,
      sim: b,
      ratio,
      ok,
      unit: m.unit,
      calibrated: m.calibrated === true,
    })
  }
  // Puan yalnız UYDURULMAYAN ölçülerden hesaplanır (uydurulanlar tanım gereği tutar)
  const free = metrics.filter((m) => !m.calibrated)
  let s = 0
  for (const m of free) s += Number.isFinite(m.ratio) && m.ratio > 0 ? Math.min(m.ratio, 1 / m.ratio) : 0
  return { metrics, score: free.length ? s / free.length : 0, absent }
}

export interface CalibrationOptions {
  /** Karne nüfusu (ikiz sayısı) */
  twins?: number
  /** Ayar koşularındaki ikiz sayısı (hız için daha küçük) */
  tuneTwins?: number
  horizon?: number
  seed?: number
  onProgress?: (line: string) => void
}

export async function calibrate(
  lab: Lab,
  d: ChurnData,
  def: ChurnDefinition,
  hazardModel: HazardModel,
  opts: CalibrationOptions = {},
): Promise<SimCalibration> {
  const t0 = Date.now()
  const say = opts.onProgress ?? (() => {})
  const bridge = loadBridge(lab)
  if (!bridge) throw new Error('Katalog köprüsü kurulmamış. Önce: npm run lab -- sim kur')
  const n = def.n
  const W = d.dayMax - d.dayMin + 1
  // Ufuk: en az n + 14 gün (gidişi görebilmek için), en çok pencerenin yarısı
  const horizon = Math.max(n + 7, Math.min(opts.horizon ?? n + 28, Math.floor(W / 2)))
  if (W < horizon + 28) throw new Error(`Veri penceresi (${W} gün) karne için kısa; en az ${horizon + 28} gün gerekir.`)
  const T0 = d.dayMax + 1 - horizon
  const seed = opts.seed ?? 1
  const hazard = hazardEvaluator(hazardModel, d.tuples)
  say('simülasyon dünyası kuruluyor (uygulama + tahmin modeli)…')
  const world = await openWorld(lab, { beforeDay: T0, seed })
  try {
    const pop = buildPopulation(d, def, hazard, T0, { max: opts.twins ?? 1500, seed })
    const oracle = buildOracle(lab, bridge, pop, { beforeDay: T0, seed })
    const real = realSummary(d, pop, horizon, n)
    // Ayar koşuları küçük bir alt nüfusla
    // Ayar nüfusu: karne nüfusunun yaklaşık dörtte biri (150–400)
    const tuneMax = opts.tuneTwins ?? Math.max(150, Math.min(400, Math.round((opts.twins ?? 1500) * 0.27)))
    const tune = buildPopulation(d, def, hazard, T0, { max: tuneMax, seed: seed + 1 })
    const tuneOracle = buildOracle(lab, bridge, tune, { beforeDay: T0, seed })
    const tuneReal = realSummary(d, tune, horizon, n)
    const knobs: SimKnobs = { ...DEFAULT_KNOBS }
    const pctOf = (x: number): string => `${(x * 100).toFixed(1)}%`

    /* ── Aşama A (kısa ufuk): seçim kesişimi → boş oturum payı · devam primi → gün başına yeni başlık ── */
    const shortH = Math.min(horizon, 14)
    const shortReal = realSummary(d, tune, shortH, n)
    const bias = new Tuner(knobs.selectBias, -16, 4, 3, 4)
    const bonus = new Tuner(knobs.continueBonus, -2, 8, 1.5, 2)
    // Başlangıç: seçilen başlıkların tipik faydası kadar geri kaydır
    const shift = new Tuner(-0.6, -6, 3, 1.5, 1)
    for (let it = 0; it < 7; it++) {
      knobs.selectBias = bias.x
      knobs.continueBonus = bonus.x
      knobs.completionShift = shift.x
      const r = runUniverse(lab, world, tune, tuneOracle, hazard, {
        days: shortH,
        seed,
        universe: `ayarA${it}`,
        knobs,
        n,
      })
      const s = simSummary(r, n)
      const eB = logit(s.bounceSessionShare) - logit(shortReal.bounceSessionShare)
      const eN = Math.log(Math.max(1e-3, s.newTitlesPerAppDay) / Math.max(1e-3, shortReal.newTitlesPerAppDay))
      const eC = logit(s.completionRate) - logit(shortReal.completionRate)
      say(
        `ayar A${it + 1}: boş oturum ${pctOf(s.bounceSessionShare)} (gerçek ${pctOf(shortReal.bounceSessionShare)}) · ` +
          `yeni başlık/gün ${s.newTitlesPerAppDay.toFixed(2)} (gerçek ${shortReal.newTitlesPerAppDay.toFixed(2)}) · ` +
          `tamamlama ${pctOf(s.completionRate)} (gerçek ${pctOf(shortReal.completionRate)})`,
      )
      if (Math.abs(eB) < 0.08 && Math.abs(eN) < 0.1 && Math.abs(eC) < 0.08) break
      // Boş oturum fazlaysa izleyici daha kolay seçmeli; yeni başlık fazlaysa yarım kalana dönme primi artmalı;
      // tamamlama fazlaysa kayma küçülmeli (hata işareti ters çevrilir: ayar büyüdükçe hata küçülmeli)
      bias.update(eB)
      bonus.update(eN)
      shift.update(-eC)
    }
    knobs.selectBias = bias.x
    knobs.continueBonus = bonus.x
    knobs.completionShift = shift.x

    /* ── Aşama B (tam ufuk): geliş çarpanı → uygulama günü · risk düzeltmesi → gidenlerin payı ── */
    for (let it = 0; it < 4; it++) {
      const r = runUniverse(lab, world, tune, tuneOracle, hazard, {
        days: horizon,
        seed,
        universe: `ayarB${it}`,
        knobs,
        n,
      })
      const s = simSummary(r, n)
      const eV = Math.log(Math.max(1e-3, s.appDaysPerUser) / Math.max(1e-3, tuneReal.appDaysPerUser))
      const eG = logit(tuneReal.goneShare) - logit(s.goneShare)
      say(
        `ayar B${it + 1}: uygulama günü ${s.appDaysPerUser.toFixed(1)} (gerçek ${tuneReal.appDaysPerUser.toFixed(1)}) · ` +
          `giden ${pctOf(s.goneShare)} (gerçek ${pctOf(tuneReal.goneShare)})`,
      )
      if (Math.abs(eV) < 0.04 && Math.abs(eG) < 0.06) break
      knobs.visitScale = Math.min(3, Math.max(0.3, knobs.visitScale * Math.exp(-Math.max(-0.5, Math.min(0.5, eV)))))
      knobs.hazardShift += Math.max(-1.5, Math.min(1.5, eG))
    }
    say(`karne koşusu: ${pop.n} ikiz × ${horizon} gün…`)
    const run = runUniverse(lab, world, pop, oracle, hazard, { days: horizon, seed, universe: 'karne', knobs, n })
    const sim = simSummary(run, n)
    const { metrics, score, absent } = compare(real, sim)
    const assumptions: SimAssumption[] = [
      {
        name: 'İkiz parametreleri (geliş sıklığı, oturum, tamamlama, hata ve takılma maruziyeti)',
        value: 'kullanıcı başına, ortalamaya büzülmüş',
        source: 'veriden',
      },
      {
        name: 'Bırakma kararı (ortak risk modeli katsayıları)',
        value: `${hazardModel.columns.length} sütun`,
        source: 'veriden',
      },
      {
        name: 'Tercih kâhini ağırlıkları (birlikte izlenme / tür / popülerlik)',
        value: `${oracle.weights.knn.toFixed(2)} / ${oracle.weights.genre.toFixed(2)} / ${oracle.weights.popularity.toFixed(2)}`,
        source: 'veriden',
      },
      { name: 'Seçim kesişimi (→ boş oturum payı)', value: knobs.selectBias.toFixed(2), source: 'kalibrasyon' },
      {
        name: 'Yarım kalmış başlığın seçilme primi (→ gün başına yeni başlık)',
        value: knobs.continueBonus.toFixed(2),
        source: 'kalibrasyon',
      },
      {
        name: 'Geliş olasılığı çarpanı (→ ikiz başına uygulama günü)',
        value: knobs.visitScale.toFixed(2),
        source: 'kalibrasyon',
      },
      {
        name: 'Tamamlama kayması, lojit (→ tamamlama oranı)',
        value: knobs.completionShift.toFixed(2),
        source: 'kalibrasyon',
      },
      { name: 'Yarım bırakılan oynatmada izlenen oranın dağılımı', value: '%5 dilimli histogram', source: 'veriden' },
      { name: 'İstenen başlığın daha çok bitirilmesi (lojit eğimi)', value: '0.3 × fayda', source: 'varsayım' },
      {
        name: 'Risk düzeltmesi, lojit (→ gidenlerin payı)',
        value: knobs.hazardShift.toFixed(2),
        source: 'kalibrasyon',
      },
      {
        name: 'Sonraki satıra / karta bakma olasılığı',
        value: `${knobs.rowContinue} / ${knobs.itemContinue}`,
        source: 'varsayım',
      },
      { name: 'Hatadan sonra yeniden deneme olasılığı', value: '0.6', source: 'varsayım' },
      { name: '3+ takılmada izlemeyi yarıda bırakma olasılığı', value: '0.4', source: 'varsayım' },
      {
        name: 'Canlı yayın oturumları ana sayfadan bağımsız',
        value: 'canlı payı kullanıcının kendi verisinden',
        source: 'varsayım',
      },
      {
        name: 'Geliş sıklığı deneyimden etkilenmez',
        value: 'etki yalnız "son gün" riski üzerinden',
        source: 'varsayım',
      },
    ]
    return {
      synthetic: d.meta.synthetic,
      from: dayStr(T0),
      horizon,
      n,
      twins: pop.n,
      alive: pop.alive,
      knobs: { ...knobs },
      oracle: {
        knn: oracle.weights.knn,
        genre: oracle.weights.genre,
        popularity: oracle.weights.popularity,
        auc: Number.isFinite(oracle.fit.auc) ? oracle.fit.auc : null,
        rows: oracle.fit.rows,
      },
      world: {
        titles: bridge.titles.length,
        viewers: world.training.viewers,
        facts: world.training.facts,
        modelReady: world.training.modelReady,
        communities: world.training.communities,
      },
      metrics,
      absent,
      score,
      weekly: real.weekly.map((x, w) => ({ week: w + 1, real: x, sim: sim.weekly[w] ?? 0 })),
      assumptions,
      seconds: Math.round((Date.now() - t0) / 100) / 10,
    }
  } finally {
    await world.close()
  }
}
