/**
 * Simülasyon nüfusu: gerçek kullanıcıların "ikizleri". Her ikiz, T gününde hâlâ etkin olan gerçek (takma kimlikli)
 * bir kullanıcının o güne kadarki davranışından kestirilen parametreleri taşır: ne sıklıkla gelir, oturumda kaç
 * oynatma yapar, ne kadarını bitirir, hangi cihazdadır, oynatma hatası ve takılmaya ne kadar maruz kalır.
 *
 * Kullanıcı başına oranlar az gözlemle gürültülüdür; bu yüzden hepsi nüfus ortalamasına doğru büzülür
 * (sözde gözlem ekleyerek): az verisi olan kullanıcı ortalamaya yakın, çok verisi olan kendi değerine yakın kalır.
 *
 * İkizin T anındaki durumu da veriden gelir: son 28 günde hangi günler geldi, en son ne zaman geldi ve o gün ne
 * yaşadı, en son ne zaman bir dizi bitirdi. T anında "etkin" görünenlerin bir kısmı aslında çoktan gitmiştir (son
 * günü yaşamış ama henüz n gün dolmamıştır); bu olasılık risk modelinden ve sessiz geçen gün sayısından hesaplanır.
 */
import type { ChurnDefinition } from '../../../shared/lab'
import type { ChurnData } from '../churn/data'
import type { HazardEvaluator } from '../churn/hazard'
import { emptyDayExp } from '../churn/triggers'
import { SUB_PAYMENT_FAIL } from '../data/build'
import { mulberry32, sampleIndices } from '../core/rng'
import { sigmoid } from '../core/stats'

export interface PopulationMeans {
  /** Art arda iki uygulama günü arasındaki ortalama gün (n'den kısa boşluklarda) */
  gap: number
  sessionsPerDay: number
  /** Oynatmaların canlı yayın olan payı */
  liveShare: number
  /** Canlı oynatma başına dakika */
  liveMinutes: number
  bounce: number
  completion: number
  errRate: number
  bufRate: number
  searchRate: number
  searchFail: number
  /** İzlenen bir oturumda bir oynatmadan sonra bir tane daha izleme olasılığı */
  continueRate: number
  vodMinutesPerPlay: number
  /**
   * Tamamlanmayan oynatmalarda izlenen oranın birikimli dağılımı (18 dilim × %5: 0–%90), veriden.
   * Veri yoksa düzgün dağılım.
   */
  partialCdf: number[]
}

export interface Population {
  /** Simülasyonun 0. günü (yerel gün numarası) */
  startDay: number
  n: number
  /** T anında etkin olan gerçek kullanıcı sayısı (örneklemeden önce) */
  alive: number
  /** Lab kullanıcı dizini */
  src: Uint32Array
  pVisit: Float32Array
  sessionsPerDay: Float32Array
  liveShare: Float32Array
  liveMinutes: Float32Array
  bounce: Float32Array
  completion: Float32Array
  errRate: Float32Array
  bufRate: Float32Array
  searchRate: Float32Array
  searchFail: Float32Array
  device: Uint8Array
  tuple: Uint32Array
  /** İlk görüldüğü gün; pencere öncesinden beri var olanlarda −1 */
  firstDay: Int32Array
  /** Bit k: (başlangıç − 1 − k). gün uygulama günüydü (k < 28) */
  priorMask: Uint32Array
  lastDay: Int32Array
  lastErrors: Uint16Array
  lastPlays: Uint16Array
  lastFails: Uint16Array
  lastBuffers: Uint16Array
  lastFinish: Int32Array
  lastPayFail: Int32Array
  /** T anında çoktan gitmiş olma olasılığı */
  pGone: Float32Array
  means: PopulationMeans
}

const shrink = (num: number, den: number, mean: number, m: number): number => (num + m * mean) / (den + m)

/** İzlenen oran histogramından (20 dilim) tamamlanmayan oynatmaların birikimli dağılımı (ilk 18 dilim). */
function partialCdfOf(hist: readonly number[]): number[] {
  const bins = 18
  let total = 0
  for (let b = 0; b < bins; b++) total += hist[b] ?? 0
  const out: number[] = []
  let acc = 0
  for (let b = 0; b < bins; b++) {
    acc += total > 0 ? (hist[b] ?? 0) / total : 1 / bins
    out.push(acc)
  }
  out[bins - 1] = 1
  return out
}

export function buildPopulation(
  d: ChurnData,
  def: ChurnDefinition,
  hazard: HazardEvaluator | null,
  startDay: number,
  opts: { max?: number; seed?: number; historyDays?: number } = {},
): Population {
  const n = def.n
  const from = startDay - (opts.historyDays ?? 84)
  const c = d.days.cols
  const firstDayCol = d.users.cols.first_day as Int32Array
  const alive: number[] = []
  for (let u = 0; u < d.n; u++) {
    let last = -1
    for (let r = d.dayFrom[u]; r < d.dayTo[u]; r++) {
      const day = d.dDay[r]
      if (day >= startDay) break
      if (d.dSessions[r] > 0) last = day
    }
    if (last >= startDay - n) alive.push(u)
  }
  if (!alive.length) throw new Error('Başlangıç gününde etkin kullanıcı yok; simülasyon nüfusu kurulamadı.')

  /* ── Nüfus ortalamaları (etkin kullanıcıların kalibrasyon penceresindeki toplamlarından) ── */
  let gapSum = 0
  let gapN = 0
  let sess = 0
  let appDays = 0
  let watch = 0
  let live = 0
  let livePlays = 0
  let bounces = 0
  let plays = 0
  let completions = 0
  let errors = 0
  let buffers = 0
  let searches = 0
  let fails = 0
  for (const u of alive) {
    let prev = -1
    for (let r = d.dayFrom[u]; r < d.dayTo[u]; r++) {
      const day = d.dDay[r]
      if (day >= startDay) break
      if (d.dSessions[r] === 0 || day < from) continue
      if (prev >= 0 && day - prev < n) {
        gapSum += day - prev
        gapN++
      }
      prev = day
      appDays++
      sess += c.sessions[r]
      watch += c.watch_sec[r]
      live += c.live_sec[r]
      livePlays += c.live_plays[r]
      bounces += c.bounces[r]
      plays += c.plays[r]
      completions += c.completions[r]
      errors += c.errors[r]
      buffers += c.buffers[r]
      searches += c.searches[r]
      fails += c.search_fails[r]
    }
  }
  const pps = d.meta.profile.playsPerSession
  let watched = 0
  let extra = 0
  for (let k = 1; k < pps.length; k++) {
    watched += pps[k]
    extra += pps[k] * (k - 1)
  }
  const vodSec = Math.max(0, watch - live)
  const means: PopulationMeans = {
    gap: gapN ? gapSum / gapN : 3,
    sessionsPerDay: appDays ? Math.max(1, sess / appDays) : 1,
    liveShare: plays > 0 ? livePlays / plays : 0,
    liveMinutes: livePlays ? live / 60 / livePlays : 30,
    bounce: sess ? bounces / sess : 0.15,
    // Tamamlama yalnız isteğe bağlı içerikte anlamlıdır (canlı yayın tamamlanmaz)
    completion: plays - livePlays > 0 ? completions / (plays - livePlays) : 0.5,
    errRate: plays + errors > 0 ? errors / (plays + errors) : 0.01,
    bufRate: watch > 0 ? buffers / (watch / 3600) : 0.2,
    searchRate: sess ? searches / sess : 0.05,
    searchFail: searches ? fails / searches : 0.3,
    // Geometrik: ortalama fazladan oynatma = g / (1 − g)
    continueRate: watched > 0 ? extra / watched / (1 + extra / watched) : 0.3,
    vodMinutesPerPlay: plays - livePlays > 0 ? vodSec / 60 / (plays - livePlays) : 30,
    partialCdf: partialCdfOf(d.meta.profile.watchFraction),
  }

  /* ── Örneklem ── */
  const max = opts.max ?? 2000
  const pickIdx =
    alive.length > max
      ? [...sampleIndices(mulberry32(opts.seed ?? 1), alive.length, max)].sort((a, b) => a - b)
      : alive.map((_, i) => i)
  const N = pickIdx.length
  const pop: Population = {
    startDay,
    n: N,
    alive: alive.length,
    src: new Uint32Array(N),
    pVisit: new Float32Array(N),
    sessionsPerDay: new Float32Array(N),
    liveShare: new Float32Array(N),
    liveMinutes: new Float32Array(N),
    bounce: new Float32Array(N),
    completion: new Float32Array(N),
    errRate: new Float32Array(N),
    bufRate: new Float32Array(N),
    searchRate: new Float32Array(N),
    searchFail: new Float32Array(N),
    device: new Uint8Array(N),
    tuple: new Uint32Array(N),
    firstDay: new Int32Array(N),
    priorMask: new Uint32Array(N),
    lastDay: new Int32Array(N),
    lastErrors: new Uint16Array(N),
    lastPlays: new Uint16Array(N),
    lastFails: new Uint16Array(N),
    lastBuffers: new Uint16Array(N),
    lastFinish: new Int32Array(N),
    lastPayFail: new Int32Array(N),
    pGone: new Float32Array(N),
    means,
  }
  const devCount = new Float64Array(8)
  const exp = emptyDayExp()
  for (let i = 0; i < N; i++) {
    const u = alive[pickIdx[i]]
    pop.src[i] = u
    let prev = -1
    let prevRow = -1
    let lastRow = -1
    let gs = 0
    let gn = 0
    let uSess = 0
    let uDays = 0
    let uWatch = 0
    let uLive = 0
    let uLivePlays = 0
    let uBounce = 0
    let uPlays = 0
    let uComp = 0
    let uErr = 0
    let uBuf = 0
    let uSearch = 0
    let uFail = 0
    let mask = 0
    let lastFinish = -1_000_000
    let lastPayFail = -1_000_000
    devCount.fill(0)
    for (let r = d.dayFrom[u]; r < d.dayTo[u]; r++) {
      const day = d.dDay[r]
      if (day >= startDay) break
      if (c.sub[r] & SUB_PAYMENT_FAIL) lastPayFail = day
      if (c.series_finished[r] > 0) lastFinish = day
      if (d.dSessions[r] === 0) continue
      const back = startDay - 1 - day
      if (back < 28) mask |= 1 << back
      if (lastRow >= 0) prevRow = lastRow
      lastRow = r
      if (day < from) {
        prev = day
        continue
      }
      if (prev >= 0 && day - prev < n) {
        gs += day - prev
        gn++
      }
      prev = day
      uDays++
      uSess += c.sessions[r]
      uWatch += c.watch_sec[r]
      uLive += c.live_sec[r]
      uLivePlays += c.live_plays[r]
      uBounce += c.bounces[r]
      uPlays += c.plays[r]
      uComp += c.completions[r]
      uErr += c.errors[r]
      uBuf += c.buffers[r]
      uSearch += c.searches[r]
      uFail += c.search_fails[r]
      devCount[c.device[r]]++
    }
    const meanGap = shrink(gs, gn, means.gap, 3)
    pop.pVisit[i] = Math.min(1, 1 / Math.max(1, meanGap))
    pop.sessionsPerDay[i] = Math.max(1, shrink(uSess, uDays, means.sessionsPerDay, 3))
    pop.liveShare[i] = Math.min(1, shrink(uLivePlays, uPlays, means.liveShare, 4))
    pop.liveMinutes[i] = Math.max(3, shrink(uLive / 60, uLivePlays, means.liveMinutes, 3))
    pop.bounce[i] = Math.min(0.95, shrink(uBounce, uSess, means.bounce, 6))
    pop.completion[i] = Math.min(0.98, Math.max(0.02, shrink(uComp, uPlays - uLivePlays, means.completion, 6)))
    pop.errRate[i] = Math.min(0.6, shrink(uErr, uPlays + uErr, means.errRate, 30))
    pop.bufRate[i] = Math.min(20, shrink(uBuf, uWatch / 3600, means.bufRate, 3))
    pop.searchRate[i] = Math.min(1, shrink(uSearch, uSess, means.searchRate, 10))
    pop.searchFail[i] = Math.min(1, shrink(uFail, uSearch, means.searchFail, 5))
    let dev = 0
    for (let k = 1; k < devCount.length; k++) if (devCount[k] > devCount[dev] || (dev === 0 && devCount[k] > 0)) dev = k
    pop.device[i] = dev > 0 ? dev : lastRow >= 0 ? c.device[lastRow] : 0
    pop.tuple[i] = lastRow >= 0 ? c.tuple[lastRow] : 0
    pop.firstDay[i] = firstDayCol[u] <= d.dayMin + 1 ? -1 : firstDayCol[u]
    pop.priorMask[i] = mask >>> 0
    const last = lastRow >= 0 ? d.dDay[lastRow] : startDay - n
    pop.lastDay[i] = last
    pop.lastErrors[i] = lastRow >= 0 ? c.errors[lastRow] : 0
    pop.lastPlays[i] = lastRow >= 0 ? c.plays[lastRow] : 0
    pop.lastFails[i] = lastRow >= 0 ? c.search_fails[lastRow] : 0
    pop.lastBuffers[i] = lastRow >= 0 ? c.buffers[lastRow] : 0
    pop.lastFinish[i] = lastFinish
    pop.lastPayFail[i] = lastPayFail

    /* ── Çoktan gitmiş olma olasılığı ── */
    let gone = 0
    if (hazard && lastRow >= 0) {
      exp.plays = c.plays[lastRow]
      exp.watch = c.watch_sec[lastRow]
      exp.completions = c.completions[lastRow]
      exp.errors = c.errors[lastRow]
      exp.appErrors = c.app_errors[lastRow]
      exp.buffers = c.buffers[lastRow]
      exp.fails = c.search_fails[lastRow]
      exp.bounces = c.bounces[lastRow]
      exp.finished = c.series_finished[lastRow]
      exp.newTitles = c.new_titles[lastRow]
      exp.live = c.live_sec[lastRow]
      exp.notif = c.notif_opens[lastRow]
      exp.payFail = last - lastPayFail <= 7
      exp.exhausted = lastFinish < last && last - lastFinish <= 14
      exp.hasPrev = prevRow >= 0 && last - d.dDay[prevRow] <= 3
      if (exp.hasPrev) {
        exp.prevErrors = c.errors[prevRow]
        exp.prevPlays = c.plays[prevRow]
        exp.prevFails = c.search_fails[prevRow]
        exp.prevBuffers = c.buffers[prevRow]
      }
      // Son günden önceki penceredeki uygulama günleri
      let prior = 0
      for (let r = d.dayFrom[u]; r < lastRow; r++)
        if (d.dSessions[r] > 0 && d.dDay[r] >= last - hazard.priorWindow) prior++
      const tenure = pop.firstDay[i] < 0 ? -1 : last - pop.firstDay[i]
      const pi = sigmoid(hazard.eta(exp, prior, tenure, pop.device[i], pop.tuple[i]))
      // Gitmemiş olsaydı e gündür dönmemiş olma olasılığı (n'den kısa kesilmiş geometrik boşluk)
      const e = startDay - 1 - last
      const q = 1 - pop.pVisit[i]
      const tail = Math.pow(q, n - 1)
      const surv = e <= 0 ? 1 : e >= n - 1 ? 0 : (Math.pow(q, e) - tail) / Math.max(1e-12, 1 - tail)
      gone = pi / Math.max(1e-12, pi + (1 - pi) * surv)
    }
    pop.pGone[i] = Math.min(1, Math.max(0, gone))
  }
  return pop
}
