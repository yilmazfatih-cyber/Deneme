/**
 * Deney yürütücüsü.
 *
 *   simülasyon  runSimExperiment — her kol ayrı bir evrendir: AYNI ikizler, AYNI rastgelelik, farklı varyant.
 *               Kullanıcı başına fark alındığı için (eşli) küçük etkiler az ikizle görülür; dakikalar sürer.
 *   gerçek      analyzeRealExperiment — içe alınan maruziyet olayları (ör. Mixpanel `$experiment_started`) ve
 *               davranış verisi; klasik eşsiz çözümleme + CUPED + örneklem oranı denetimi.
 *   güç         powerTable — gerçek verinin varyansından: bir etkiyi görmek için kaç kullanıcı ve ne kadar süre gerekir.
 *
 * Simülasyon gerçek A/B'nin yerini tutmaz: fikirleri eler ve sıralar, gerçek deneyin süresini ve örneklemini planlar.
 * Sonucun güvenilirliği gerçeklik karnesiyle (sim karne) birlikte okunur.
 */
import type { Experiment } from '../../../shared/experiments'
import type {
  ChurnDefinition,
  ExperimentArm,
  ExperimentMetric,
  ExperimentRun,
  PowerTable,
  SimCalibration,
} from '../../../shared/lab'
import type { ChurnData } from '../churn/data'
import { hazardEvaluator } from '../churn/hazard'
import type { HazardModel } from '../churn/triggers'
import { loadTable } from '../core/columns'
import type { Lab } from '../core/lab'
import { pearson, sd as stdev, mean as avg } from '../core/stats'
import { loadBridge } from '../sim/bridge'
import { DEFAULT_KNOBS, runUniverse, type SimKnobs, type Treatment } from '../sim/engine'
import { buildOracle } from '../sim/oracle'
import { buildPopulation } from '../sim/population'
import { openWorld } from '../sim/world'
import {
  adjustP,
  alwaysValidP,
  compareCuped,
  compareMeans,
  comparePaired,
  comparePairedRatios,
  compareProportions,
  compareRatios,
  minimumDetectableEffect,
  requiredSampleSize,
  sampleRatioMismatch,
  type Estimate,
} from './analyze'
import { metricByKey, METRICS, unitsFromReal, unitsFromUniverse, type MetricDef, type UnitTable } from './metrics'

export const SIM_CAVEATS: readonly string[] = [
  'Simülasyon sonucu modele bağlıdır: izleyicinin neyi seçeceği tercih kâhininden, bırakma kararı risk modelinden gelir.',
  'Geliş sıklığı deneyimden etkilenmez; churn etkisi yalnız "son gün" riski üzerinden ölçülür (etki muhtemelen olduğundan küçük görünür).',
  'Ufuk boyunca yeni kullanıcı gelmez; sonuç bugün etkin olan kullanıcılar içindir.',
  'Gerçek A/B deneyinin yerini tutmaz; fikirleri eler, sıralar ve gerçek deneyin örneklemini planlar.',
]

interface Roles {
  primary: string
  guardrails: string[]
}

/** Ölçü kümesi: birincil + korumalar + kalanlar (ikincil). */
function evaluate(
  control: UnitTable,
  treatment: UnitTable,
  roles: Roles,
  paired: boolean,
  pre?: { control: Float64Array; treatment: Float64Array; metric: string },
  exclude: readonly string[] = [],
  sequential = false,
): ExperimentMetric[] {
  const estimates: { def: MetricDef; e: Estimate }[] = []
  for (const def of METRICS) {
    if (exclude.includes(def.key)) continue
    const c = control.cols[def.col]
    const t = treatment.cols[def.col]
    if (!c || !t) continue
    let e: Estimate
    if (def.kind === 'bolum' && def.den) {
      const cd = control.cols[def.den]
      const td = treatment.cols[def.den]
      e = paired ? comparePairedRatios(c, cd, t, td) : compareRatios(c, cd, t, td)
    } else if (paired) e = comparePaired(c, t)
    else if (def.kind === 'ikili') e = compareProportions(c, t)
    else if (pre && pre.metric === def.key) e = compareCuped(c, t, pre.control, pre.treatment)
    else e = compareMeans(c, t)
    estimates.push({ def, e })
  }
  // İkincil ve koruma ölçülerinde çoklu karşılaştırma düzeltmesi; birincil ölçü düzeltilmez
  const others = estimates.filter((x) => x.def.key !== roles.primary)
  const adj = adjustP(others.map((x) => x.e.p))
  const pAdj = new Map(others.map((x, i) => [x.def.key, adj[i]]))
  return estimates
    .map(({ def, e }): ExperimentMetric => {
      const role = def.key === roles.primary ? 'birincil' : roles.guardrails.includes(def.key) ? 'koruma' : 'ikincil'
      const pa = role === 'birincil' ? e.p : (pAdj.get(def.key) ?? e.p)
      const better = def.higherIsBetter ? e.diff > 0 : e.diff < 0
      return {
        key: def.key,
        label: def.label,
        role,
        higherIsBetter: def.higherIsBetter,
        unit: def.unit,
        control: e.control,
        treatment: e.treatment,
        diff: e.diff,
        lo: e.lo,
        hi: e.hi,
        rel: e.rel,
        relLo: e.relLo,
        relHi: e.relHi,
        p: e.p,
        pAdj: pa,
        probBetter: def.higherIsBetter ? e.probBetter : 1 - e.probBetter,
        method: e.method,
        verdict: pa < 0.05 && e.diff !== 0 ? (better ? 'iyi' : 'kötü') : 'belirsiz',
        ...(sequential && role === 'birincil' ? { pAlways: sequentialP(e) } : {}),
      }
    })
    .sort((a, b) => rank(a.role) - rank(b.role))
}
const rank = (r: ExperimentMetric['role']): number => (r === 'birincil' ? 0 : r === 'koruma' ? 1 : 2)

/** Her an geçerli p: beklenen etki ölçeği ölçünün (etkin) standart sapmasının onda biri alınır. */
function sequentialP(e: Estimate): number {
  const spread = Math.sqrt(1 / Math.max(1, e.nControl) + 1 / Math.max(1, e.nTreatment))
  const sigma = spread > 0 ? e.se / spread : 0
  return alwaysValidP(e.diff, e.se, 0.1 * sigma)
}

function decide(metrics: ExperimentMetric[]): Pick<ExperimentArm, 'decision' | 'summary'> {
  const primary = metrics.find((m) => m.role === 'birincil')
  const broken = metrics.filter((m) => m.role === 'koruma' && m.verdict === 'kötü')
  const names = (list: ExperimentMetric[]): string => list.map((m) => m.key).join(', ')
  const better = metrics.filter((m) => m.role !== 'birincil' && m.verdict === 'iyi')
  const worse = metrics.filter((m) => m.role === 'ikincil' && m.verdict === 'kötü')
  const extra =
    (better.length ? ` İyileşen diğer ölçüler: ${names(better)}.` : '') +
    (worse.length ? ` Bozulan ikincil ölçüler: ${names(worse)}.` : '')
  if (primary?.verdict === 'kötü')
    return { decision: 'zararlı', summary: `Birincil ölçü (${primary.key}) anlamlı ölçüde bozuldu.${extra}` }
  if (broken.length) return { decision: 'riskli', summary: `Koruma ölçüsü bozuldu: ${names(broken)}.${extra}` }
  if (primary?.verdict === 'iyi')
    return { decision: 'aday', summary: `Birincil ölçü (${primary.key}) iyileşti, koruma ölçüleri bozulmadı.${extra}` }
  return { decision: 'etkisiz', summary: `Birincil ölçüde (${primary?.key ?? '–'}) anlamlı fark görülmedi.${extra}` }
}

/** Varyantın değiştirdiklerinin okunur özeti. */
export function describeTreatment(t: Treatment | undefined): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(t?.flags ?? {})) out.push(`bayrak ${k} = ${v}`)
  if (t?.env?.error !== undefined && t.env.error !== 1) out.push(`ortam: oynatma hatası × ${t.env.error}`)
  if (t?.env?.buffer !== undefined && t.env.buffer !== 1) out.push(`ortam: takılma × ${t.env.buffer}`)
  if (t?.behavior?.continueRate !== undefined && t.behavior.continueRate !== 1)
    out.push(`varsayım: sıradaki bölüme devam × ${t.behavior.continueRate}`)
  if (t?.behavior?.searchFail !== undefined && t.behavior.searchFail !== 1)
    out.push(`varsayım: sonuçsuz arama × ${t.behavior.searchFail}`)
  if (t?.behavior?.select !== undefined && t.behavior.select !== 0)
    out.push(`varsayım: seçim eğilimi ${t.behavior.select > 0 ? '+' : ''}${t.behavior.select} lojit`)
  return out.length ? out : ['değişiklik yok (kontrol)']
}

export interface SimArmSpec {
  key: string
  name: string
  treatment?: Treatment
}
export interface SimExperimentSpec {
  key: string
  name: string
  days: number
  twins: number
  seed: number
  /** İlk kol kontroldür */
  arms: SimArmSpec[]
  primaryMetric: string
  guardrails: string[]
}

/** Uygulama deney tanımından (content/experiments.json) simülasyon şartnamesi. */
export function specFromExperiment(
  e: Experiment,
  opts: { days?: number; twins?: number; seed?: number } = {},
): SimExperimentSpec {
  return {
    key: e.key,
    name: e.name,
    days: opts.days ?? 28,
    twins: opts.twins ?? 1500,
    seed: opts.seed ?? 1,
    arms: e.variants.map((v) => ({ key: v.key, name: v.name, treatment: { flags: v.flags as Treatment['flags'] } })),
    primaryMetric: metricByKey(e.primaryMetric) ? e.primaryMetric : 'izleme_dk',
    guardrails: e.guardrails.filter((g) => metricByKey(g)),
  }
}

export async function runSimExperiment(
  lab: Lab,
  d: ChurnData,
  def: ChurnDefinition,
  hazardModel: HazardModel,
  calibration: SimCalibration | null,
  spec: SimExperimentSpec,
  onProgress: (line: string) => void = () => {},
): Promise<ExperimentRun> {
  const t0 = Date.now()
  if (spec.arms.length < 2) throw new Error('Deneyde en az iki kol olmalı (ilki kontrol).')
  const bridge = loadBridge(lab)
  if (!bridge) throw new Error('Katalog köprüsü kurulmamış. Önce: npm run lab -- sim kur')
  const n = def.n
  const hazard = hazardEvaluator(hazardModel, d.tuples)
  const knobs: SimKnobs = calibration ? { ...DEFAULT_KNOBS, ...calibration.knobs } : { ...DEFAULT_KNOBS }
  const startDay = d.dayMax + 1
  onProgress('simülasyon dünyası kuruluyor…')
  const world = await openWorld(lab, { seed: spec.seed })
  try {
    const pop = buildPopulation(d, def, hazard, startDay, { max: spec.twins, seed: spec.seed })
    const oracle = buildOracle(lab, bridge, pop, { seed: spec.seed })
    const tables: UnitTable[] = []
    for (let a = 0; a < spec.arms.length; a++) {
      const arm = spec.arms[a]
      onProgress(`evren ${a + 1}/${spec.arms.length}: ${arm.key} (${pop.n} ikiz × ${spec.days} gün)…`)
      const r = runUniverse(lab, world, pop, oracle, hazard, {
        days: spec.days,
        seed: spec.seed,
        universe: `d${a}`,
        treatment: arm.treatment,
        knobs,
        n,
      })
      tables.push(unitsFromUniverse(r))
    }
    const roles: Roles = { primary: spec.primaryMetric, guardrails: spec.guardrails }
    const arms: ExperimentArm[] = spec.arms.slice(1).map((arm, k) => {
      const metrics = evaluate(tables[0], tables[k + 1], roles, true)
      return {
        key: arm.key,
        name: arm.name,
        n: pop.n,
        changes: describeTreatment(arm.treatment),
        metrics,
        ...decide(metrics),
      }
    })
    const notes = [
      `${pop.n} ikiz (bugün etkin ${pop.alive} kullanıcıdan) × ${spec.days} gün.`,
      `churn: ufuk bitmeden bırakma kararı veren ikizlerin payı (simülatörün gizli durumu; gerçek veride ${n} gün sessizlikten sonra görülür).`,
      calibration
        ? `Kalibrasyon: ${calibration.from} başlangıçlı ${calibration.horizon} günlük karne, puan ${calibration.score.toFixed(2)}.`
        : 'Kalibrasyon yapılmamış (sim karne): varsayılan ayarlarla koşuldu; sonuçlar yalnız yön için okunmalı.',
    ]
    return {
      key: spec.key,
      name: spec.name,
      source: 'simülasyon',
      design: 'ikiz evren',
      synthetic: d.meta.synthetic,
      at: new Date().toISOString(),
      days: spec.days,
      control: { key: spec.arms[0].key, name: spec.arms[0].name, n: pop.n },
      arms,
      fidelity: calibration?.score ?? null,
      srm: null,
      notes,
      caveats: [...SIM_CAVEATS],
      seconds: Math.round((Date.now() - t0) / 100) / 10,
    }
  } finally {
    await world.close()
  }
}

/* ───────────── Gerçek deney ───────────── */

export interface RealExperimentInfo {
  name: string
  variants: { name: string; users: number }[]
  firstDay: number
  lastDay: number
}

/** İçe alınan veride görülen deneyler (maruziyet olaylarından). */
export function listRealExperiments(lab: Lab, kAnon: number): RealExperimentInfo[] {
  const t = loadTable(lab.tableDir, 'maruziyet')
  const by = new Map<number, { variants: Map<number, number>; first: number; last: number }>()
  for (let r = 0; r < t.rows; r++) {
    const e = t.cols.exp[r]
    const x = by.get(e) ?? { variants: new Map<number, number>(), first: 1 << 30, last: -1 }
    x.variants.set(t.cols.variant[r], (x.variants.get(t.cols.variant[r]) ?? 0) + 1)
    x.first = Math.min(x.first, t.cols.day[r])
    x.last = Math.max(x.last, t.cols.day[r])
    by.set(e, x)
  }
  return [...by]
    .map(([e, x]) => ({
      name: t.dicts.exp?.[e] ?? String(e),
      variants: [...x.variants]
        .filter(([, n]) => n >= kAnon)
        .map(([v, n]) => ({ name: t.dicts.variant?.[v] ?? String(v), users: n })),
      firstDay: x.first,
      lastDay: x.last,
    }))
    .filter((x) => x.variants.length >= 2)
}

export function analyzeRealExperiment(
  lab: Lab,
  d: ChurnData,
  def: ChurnDefinition,
  name: string,
  opts: {
    window?: number
    control?: string
    primaryMetric?: string
    guardrails?: string[]
    /** Kolların planlanan trafik payları (kol adı → pay); verilmezse eşit paylaşım varsayılır (SRM denetimi için) */
    weights?: Record<string, number>
  } = {},
): ExperimentRun {
  const t0 = Date.now()
  const t = loadTable(lab.tableDir, 'maruziyet')
  const expCode = (t.dicts.exp ?? []).findIndex((x) => x === name)
  if (expCode < 0) {
    const names = (t.dicts.exp ?? []).filter((x, i) => i > 0 && x)
    throw new Error(`Veride '${name}' adlı deney yok. Görülenler: ${names.join(', ') || '(maruziyet olayı yok)'}`)
  }
  const window = Math.max(3, opts.window ?? 14)
  const byVariant = new Map<number, { users: number[]; from: number[] }>()
  let multi = 0
  let late = 0
  for (let r = 0; r < t.rows; r++) {
    if (t.cols.exp[r] !== expCode) continue
    if (t.cols.multi[r]) {
      multi++
      continue
    }
    // Ölçüm penceresi veri bitmeden tamamlanmalı
    if (t.cols.day[r] + window > d.dayMax + 1) {
      late++
      continue
    }
    const g = byVariant.get(t.cols.variant[r]) ?? { users: [], from: [] }
    g.users.push(t.cols.uid[r])
    g.from.push(t.cols.day[r])
    byVariant.set(t.cols.variant[r], g)
  }
  const k = lab.settings.kAnonim
  const variants = [...byVariant]
    .map(([code, g]) => ({ name: t.dicts.variant?.[code] ?? String(code), ...g }))
    .filter((v) => v.users.length >= k)
    .sort((a, b) => (a.name < b.name ? -1 : 1))
  if (variants.length < 2)
    throw new Error(`'${name}' deneyinde yeterli büyüklükte en az iki kol yok (kol başına en az ${k} kullanıcı).`)
  const controlName =
    opts.control ?? variants.find((v) => /^(control|kontrol|a|baseline)$/i.test(v.name))?.name ?? variants[0].name
  const ci = variants.findIndex((v) => v.name === controlName)
  if (ci < 0)
    throw new Error(`Kontrol kolu '${controlName}' bulunamadı. Kollar: ${variants.map((v) => v.name).join(', ')}`)
  const control = variants[ci]
  const roles: Roles = {
    primary: opts.primaryMetric && metricByKey(opts.primaryMetric) ? opts.primaryMetric : 'izleme_dk',
    guardrails: (opts.guardrails ?? ['bos_oturum', 'hata_orani']).filter((g) => metricByKey(g)),
  }
  const post = (v: (typeof variants)[number]): UnitTable => unitsFromReal(d, v.users, v.from, window, def.n)
  // Deney öncesi aynı uzunlukta dönem (CUPED): maruziyetten önceki `window` gün
  const pre = (v: (typeof variants)[number]): Float64Array => {
    const key = metricByKey(roles.primary)?.col ?? 'watchMin'
    return unitsFromReal(
      d,
      v.users,
      v.from.map((x) => x - window),
      window,
      def.n,
    ).cols[key]
  }
  const cTable = post(control)
  const cPre = pre(control)
  const primaryIsMean = metricByKey(roles.primary)?.kind === 'ortalama'
  // Maruz kalan herkes maruziyet günü etkindir: churn ancak pencere churn süresinden belirgin uzunsa ölçülebilir
  const churnMeasurable = window >= def.n + 7
  const exclude = churnMeasurable ? [] : ['churn']
  const arms: ExperimentArm[] = variants
    .filter((_, i) => i !== ci)
    .map((v) => {
      const metrics = evaluate(
        cTable,
        post(v),
        roles,
        false,
        primaryIsMean ? { control: cPre, treatment: pre(v), metric: roles.primary } : undefined,
        exclude,
        true,
      )
      return {
        key: v.name,
        name: v.name,
        n: v.users.length,
        changes: ['(gerçek deney: değişiklik uygulamada yapıldı)'],
        metrics,
        ...decide(metrics),
      }
    })
  const planned = opts.weights
  if (planned) {
    const missing = variants.filter((v) => !(planned[v.name] > 0)).map((v) => v.name)
    if (missing.length)
      throw new Error(
        `--pay içinde payı olmayan kol: ${missing.join(', ')}. Örnek: --pay "${variants.map((v) => `${v.name}=0.5`).join(',')}"`,
      )
  }
  const srm = sampleRatioMismatch(
    variants.map((v) => v.users.length),
    variants.map((v) => (planned ? planned[v.name] : 1)),
  )
  const notes = [
    `Ölçüm penceresi: maruziyetten sonraki ${window} gün; birincil ölçüde deney öncesi ${window} günle CUPED.`,
    `${variants.reduce((a, v) => a + v.users.length, 0)} kullanıcı çözümlendi.`,
  ]
  if (!churnMeasurable)
    notes.push(
      `churn ölçülmedi: pencere (${window} gün) churn süresinden (${def.n} gün) kısa. Ölçmek için: --pencere ${def.n + 14} (veri yetiyorsa).`,
    )
  else notes.push(`churn: pencerenin son ${def.n} gününde hiç gelmeyenler.`)
  if (multi) notes.push(`${multi} kullanıcı birden çok kolda görüldüğü için dışarıda bırakıldı.`)
  if (late) notes.push(`${late} kullanıcının ölçüm penceresi veri bitmeden tamamlanmadığı için dışarıda bırakıldı.`)
  if (!srm.ok)
    notes.push(
      `UYARI: kol büyüklükleri ${planned ? 'planlanan paylarla' : 'eşit paylaşımla'} uyumsuz (SRM p ${srm.p.toExponential(1)}); atama ya da olay kaydı bozuk olabilir, sonuçlara güvenmeyin.` +
        (planned ? '' : ' Deney eşit paylaşımlı değilse payları verin: --pay "kol=0.9,kol=0.1".'),
    )
  return {
    key: name,
    name,
    source: 'gerçek',
    design: 'klasik bölme',
    synthetic: d.meta.synthetic,
    at: new Date().toISOString(),
    days: window,
    control: { key: control.name, name: control.name, n: control.users.length },
    arms,
    fidelity: null,
    srm,
    notes,
    caveats: [
      'Kollar arası fark nedenseldir (rastgele atama varsa); ama yalnız maruziyet olayı kaydedilen kullanıcılar sayılır.',
      'Kısa pencere uzun dönem tutunmayı göstermez; churn etkisi için pencere en az churn süresi kadar olmalıdır.',
    ],
    seconds: Math.round((Date.now() - t0) / 100) / 10,
  }
}

/* ───────────── Güç ve süre ───────────── */

interface PowerStats {
  users: number
  mean: number
  sd: number
  rho: number
}

/** [from, from + window) aralığının ölçüsü ve bir önceki eşit uzunlukta dönemle korelasyonu. */
function powerStats(d: ChurnData, n: number, m: MetricDef, users: number[], from: number, window: number): PowerStats {
  const post = unitsFromReal(
    d,
    users,
    users.map(() => from),
    window,
    n,
  ).cols[m.col]
  const pre = unitsFromReal(
    d,
    users,
    users.map(() => from - window),
    window,
    n,
  ).cols[m.col]
  const rho = pearson(pre, post)
  return { users: users.length, mean: avg(post), sd: stdev(post), rho: Number.isFinite(rho) ? rho : 0 }
}

/** [lo, hi) aralığında en az bir kez uygulamaya gelen kullanıcılar. */
function activeBetween(d: ChurnData, lo: number, hi: number): number[] {
  const users: number[] = []
  for (let u = 0; u < d.n; u++) {
    for (let r = d.dayFrom[u]; r < d.dayTo[u]; r++) {
      const day = d.dDay[r]
      if (day >= hi) break
      if (day >= lo && d.dSessions[r] > 0) {
        users.push(u)
        break
      }
    }
  }
  return users
}

/**
 * Gerçek verinin varyansından güç ve süre.
 *
 *   süre tablosu   deney D gün sürerse: o D günde uygulamaya gelen herkes deneye girer, ölçü D gün boyunca toplanır,
 *                  bir önceki D gün CUPED için ön dönemdir → algılanabilir en küçük göreli etki.
 *   etki tablosu   `window` günlük ölçümde verilen göreli etkiyi görmek için kol başına kaç kullanıcı gerekir.
 *
 * churn ölçüsünde pencere en az churn süresi kadardır: pencereden önceki dönemde etkin olanların pencere boyunca hiç
 * gelmeyenleri (analizdeki churn tanımının aynısı).
 */
export function powerTable(
  d: ChurnData,
  def: ChurnDefinition,
  metricKey: string,
  opts: { window?: number; traffic?: number; effects?: readonly number[]; durations?: readonly number[] } = {},
): PowerTable {
  const m = metricByKey(metricKey)
  if (!m) throw new Error(`Bilinmeyen ölçü: ${metricKey}. Ölçüler: ${METRICS.map((x) => x.key).join(', ')}`)
  if (m.kind === 'bolum')
    throw new Error(
      `'${metricKey}' bölüm ölçüsüdür; güç tablosu ortalama ve ikili ölçüler içindir (ör. izleme_dk, churn).`,
    )
  const isChurn = m.col === 'gone'
  const traffic = Math.min(1, Math.max(0.01, opts.traffic ?? 1))
  const window = isChurn ? Math.max(def.n, opts.window ?? def.n) : Math.max(3, opts.window ?? 14)
  const W = d.dayMax - d.dayMin + 1
  if (W < 2 * window + 1) throw new Error(`Veri penceresi (${W} gün) ${window} günlük güç hesabı için kısa.`)
  const scale = traffic / Math.max(1e-6, d.meta.sample)
  const notes: string[] = []
  const from = d.dayMax + 1 - window
  // Uygun kullanıcılar: ölçüm penceresinden önceki `window` günde uygulamaya gelmiş olanlar
  const users = activeBetween(d, from - window, from)
  if (users.length < 50) throw new Error('Güç hesabı için yeterli etkin kullanıcı yok.')
  const st = powerStats(d, def.n, m, users, from, window)
  const cuped = st.sd * Math.sqrt(Math.max(0, 1 - st.rho * st.rho))
  const eligible = Math.round(users.length * scale)
  const perArm = Math.floor(eligible / 2)
  const rel = (sigma: number, arm: number, mu: number): number =>
    mu !== 0 && arm >= 2 ? minimumDetectableEffect(sigma, arm) / Math.abs(mu) : NaN
  const durations: PowerTable['durations'] = []
  if (isChurn)
    notes.push(
      `churn bir pencere ister: deney en az ${def.n + 7} gün sürmeli ve sonuç ancak o zaman okunur. Daha hızlı karar için öncü ölçü kullanın (ör. son_hafta, uygulama_gunu).`,
    )
  else
    for (const days of opts.durations ?? [7, 14, 21, 28]) {
      if (W < 2 * days + 1) continue
      const start = d.dayMax + 1 - days
      const reached = activeBetween(d, start, d.dayMax + 1)
      if (reached.length < 50) continue
      const s = powerStats(d, def.n, m, reached, start, days)
      const arm = Math.floor((reached.length * scale) / 2)
      durations.push({
        days,
        users: Math.round(reached.length * scale),
        mean: s.mean,
        sd: s.sd,
        preCorrelation: s.rho,
        mde: rel(s.sd, arm, s.mean),
        mdeCuped: rel(s.sd * Math.sqrt(Math.max(0, 1 - s.rho * s.rho)), arm, s.mean),
      })
    }
  if (d.meta.sample < 1)
    notes.push(
      `Kullanıcı sayıları örneklem oranına (%${(100 * d.meta.sample).toFixed(0)}) göre gerçek nüfusa ölçeklendi.`,
    )
  return {
    metric: m.key,
    label: m.label,
    traffic,
    window,
    eligible,
    mean: st.mean,
    sd: st.sd,
    preCorrelation: st.rho,
    mde: rel(st.sd, perArm, st.mean),
    mdeCuped: rel(cuped, perArm, st.mean),
    rows: (opts.effects ?? [0.01, 0.02, 0.05, 0.1, 0.2]).map((effect) => {
      const need = requiredSampleSize(st.sd, effect * Math.abs(st.mean))
      const needC = requiredSampleSize(cuped, effect * Math.abs(st.mean))
      return { effect, perArm: need, perArmCuped: needC, enough: need <= perArm, enoughCuped: needC <= perArm }
    }),
    durations,
    notes,
  }
}
