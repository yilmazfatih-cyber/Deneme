/**
 * Simülasyon motoru: bir "evren"i (nüfus × ufuk × varyant) gün gün yürütür.
 *
 * Bir uygulama günü
 *   1. Oturum sayısı ikizin kendi ortalamasından çekilir.
 *   2. Oturum canlı yayınsa (ikizin canlı payı) ana sayfaya uğramadan izler.
 *      Değilse uygulamanın ANA SAYFASI o profil ve o varyantın bayraklarıyla kurulur (buildLolomo — gerçek kod).
 *   3. İzleyici satırları yukarıdan aşağı, kartları soldan sağa tarar (her adımda devam etme olasılığıyla); baktığı
 *      her başlığı tercih kâhinindeki faydasına göre seçer ya da geçer. Seçemezse arar; o da olmazsa oturum boş biter.
 *   4. Oynatma: başlatma hatası, izlenen oran, takılma; dizide sıradaki bölüme devam. Uygulamanın ilerleme ve izleme
 *      durumları güncellenir (ertesi gün "İzlemeye Devam Et", "izlediğin için" satırları ve tahminler buna göre değişir).
 *   5. Gün sonunda o günün deneyimi ortak risk modeline verilir: bu gün son gün mü? Değilse sıradaki geliş günü
 *      ikizin kendi boşluk dağılımından (n günden kısa) çekilir.
 *
 * Ortak rastgelelik: her çekiliş (ikiz, gün, oturum, karar türü, başlık) anahtarından türetilir. Aynı ikiz aynı gün
 * aynı başlığı görürse iki evrende de aynı tepkiyi verir; evrenler arasındaki fark yalnız varyantın değiştirdiği
 * şeyden (ne gösterildiği, sırası, ortam) doğar. Eşli karşılaştırmanın gücü buradan gelir.
 */
import type { Flags } from '../../../shared/flags'
import type { ProfileRecord } from '../../../server/src/kernel/context'
import { buildLolomo, type ListContext, type Lolomo } from '../../../server/src/services/discovery/lolomo'
import type { HazardEvaluator } from '../churn/hazard'
import { emptyDayExp } from '../churn/triggers'
import { loadTable } from '../core/columns'
import type { Lab } from '../core/lab'
import { mix32, mulberry32 } from '../core/rng'
import { sigmoid } from '../core/stats'
import type { BridgeTitle } from './bridge'
import type { Oracle } from './oracle'
import type { Population } from './population'
import type { SimWorld } from './world'

export interface SimKnobs {
  /** Seçim kesişimi (lojit): büyüdükçe izleyici daha kolay seçer. Kalibrasyonla bulunur. */
  selectBias: number
  /** Risk modelinin kesişimine eklenen düzeltme (lojit). Kalibrasyonla bulunur. */
  hazardShift: number
  /** Bir sonraki satıra / karta bakmaya devam etme olasılığı */
  rowContinue: number
  itemContinue: number
  /** "İzlemeye Devam Et" satırındaki ve yarım kalmış başlıkların seçilme primi (lojit). Kalibrasyonla bulunur. */
  continueBonus: number
  /** Geliş olasılığı çarpanı (ikizlerin kendi geliş sıklığının üstüne). Kalibrasyonla bulunur. */
  visitScale: number
  /** Tamamlama olasılığının lojit kayması (seçilen başlıkların faydası ortalamanın üstünde olduğu için). Kalibrasyonla bulunur. */
  completionShift: number
}

export const DEFAULT_KNOBS: SimKnobs = {
  selectBias: -6,
  hazardShift: 0,
  rowContinue: 0.78,
  itemContinue: 0.82,
  continueBonus: 2,
  visitScale: 1,
  completionShift: 0,
}

/** Varyantın değiştirebildiği şeyler */
export interface Treatment {
  /** Uygulama bayrakları (gerçek kod yolu) */
  flags?: Partial<Flags>
  /** Ortam çarpanları: oynatma hatası ve takılma oranı (ör. 0.5 → yarıya iner) */
  env?: { error?: number; buffer?: number }
  /** Davranış varsayımları (henüz yapılmamış özellikler için): sıradaki bölüme devam çarpanı, sonuçsuz arama çarpanı, seçim kayması */
  behavior?: { continueRate?: number; searchFail?: number; select?: number }
}

export interface UniverseConfig {
  days: number
  seed: number
  /** Profil kimliği öneki ve Top 10 evreni */
  universe: string
  treatment?: Treatment
  knobs: SimKnobs
  /** Churn süresi (boşlukların üst sınırı) */
  n: number
}

export interface UniverseResult {
  n: number
  days: number
  appDays: Uint16Array
  sessions: Uint16Array
  plays: Uint16Array
  watchMin: Float32Array
  liveMin: Float32Array
  bounceSessions: Uint16Array
  bounceDays: Uint16Array
  errors: Uint16Array
  bufferDays: Uint16Array
  searchFails: Uint16Array
  completions: Uint16Array
  newTitles: Uint16Array
  /** Bıraktığı gün (ufuktaki gün dizini); −1 bırakmadı; −2 başlangıçta çoktan gitmişti */
  quitDay: Int16Array
  /** Ufuktaki son uygulama günü; −1 hiç gelmedi */
  lastAppDay: Int16Array
  /** Gün başına uygulamaya gelen ikiz sayısı */
  dailyActive: Uint32Array
  /** Gün × ikiz: o gün geldi mi (haftalık etkinlik ve tutunma için), bit dizisi */
  activeBits: Uint8Array
  homeBuilds: number
  seconds: number
}

interface TitleState {
  /** Sıradaki oynatılacak yaprak dizini */
  next: number
  done: boolean
}

const P_SEL = 1
const P_ROW = 2
const P_ITEM = 3
const P_ERR = 4
const P_DONE = 5
const P_FRAC = 6
const P_BUF = 7
const P_BINGE = 8
const P_SESS = 9
const P_LIVE = 10
const P_SEARCH = 11
const P_GAP = 12
const P_QUIT = 13
const P_START = 14
const P_PICK = 15

const logit = (p: number): number =>
  Math.log(Math.min(1 - 1e-6, Math.max(1e-6, p)) / (1 - Math.min(1 - 1e-6, Math.max(1e-6, p))))
const SKIP_CONTEXT: ReadonlySet<ListContext> = new Set<ListContext>(['bridge'])

export function runUniverse(
  lab: Lab,
  world: SimWorld,
  pop: Population,
  oracle: Oracle,
  hazard: HazardEvaluator,
  cfg: UniverseConfig,
): UniverseResult {
  const t0 = Date.now()
  const N = pop.n
  const D = cfg.days
  const n = cfg.n
  const knobs = cfg.knobs
  const tr = cfg.treatment ?? {}
  const envErr = tr.env?.error ?? 1
  const envBuf = tr.env?.buffer ?? 1
  const contMult = tr.behavior?.continueRate ?? 1
  const failMult = tr.behavior?.searchFail ?? 1
  const selShift = tr.behavior?.select ?? 0
  const titles = world.bridge.titles
  const J = titles.length
  const jOfVideo = new Map(titles.map((t, j) => [t.videoId, j]))
  const { services, viewing, events } = world
  const progress = services.progress
  events.useUniverse(cfg.universe)

  /** Anahtarlı düzgün sayı: (ikiz, gün, oturum, amaç, anahtar) → [0, 1) */
  const unif = (twin: number, day: number, s: number, purpose: number, key: number): number =>
    mulberry32(mix32(mix32(mix32(mix32(mix32(cfg.seed, pop.src[twin]), day + 7), s), purpose), key >>> 0))()

  const res: UniverseResult = {
    n: N,
    days: D,
    appDays: new Uint16Array(N),
    sessions: new Uint16Array(N),
    plays: new Uint16Array(N),
    watchMin: new Float32Array(N),
    liveMin: new Float32Array(N),
    bounceSessions: new Uint16Array(N),
    bounceDays: new Uint16Array(N),
    errors: new Uint16Array(N),
    bufferDays: new Uint16Array(N),
    searchFails: new Uint16Array(N),
    completions: new Uint16Array(N),
    newTitles: new Uint16Array(N),
    quitDay: new Int16Array(N).fill(-1),
    lastAppDay: new Int16Array(N).fill(-1),
    dailyActive: new Uint32Array(D),
    activeBits: new Uint8Array(Math.ceil((N * D) / 8)),
    homeBuilds: 0,
    seconds: 0,
  }

  /* ── Başlangıç durumu: profiller, geçmiş, ilk geliş günü ── */
  const profiles: ProfileRecord[] = []
  const state: Map<number, TitleState>[] = []
  const nextVisit = new Int32Array(N).fill(1 << 30)
  const mask = Uint32Array.from(pop.priorMask)
  const lastAbs = Int32Array.from(pop.lastDay)
  const lastErrors = Uint16Array.from(pop.lastErrors)
  const lastPlays = Uint16Array.from(pop.lastPlays)
  const lastFails = Uint16Array.from(pop.lastFails)
  const lastBuffers = Uint16Array.from(pop.lastBuffers)
  const lastFinish = Int32Array.from(pop.lastFinish)
  const users = loadTable(lab.tableDir, 'kullanici', ['fact_from', 'fact_to'])
  const facts = loadTable(lab.tableDir, 'izleme')
  const fTid = facts.cols.tid
  const fPlays = facts.cols.plays
  const fWatch = facts.cols.watch_sec
  const fComp = facts.cols.completions
  const fFirst = facts.cols.first_day
  const fLast = facts.cols.last_day
  const startMs = pop.startDay * 86_400_000
  for (let i = 0; i < N; i++) {
    const guid = `${cfg.universe}-${i}`
    profiles.push(world.profile(guid))
    const st = new Map<number, TitleState>()
    state.push(st)
    const u = pop.src[i]
    // Geçmiş: başlangıçtan önce başlamış izlemeler, en eski önce (yer imi sırası = son izlenme sırası)
    const rows: number[] = []
    for (let r = users.cols.fact_from[u]; r < users.cols.fact_to[u]; r++)
      if (fFirst[r] < pop.startDay && world.byTid.has(fTid[r])) rows.push(r)
    rows.sort((a, b) => Math.min(fLast[a], pop.startDay - 1) - Math.min(fLast[b], pop.startDay - 1) || a - b)
    for (const r of rows) {
      const bt = world.byTid.get(fTid[r]) as BridgeTitle
      // Başlangıç gününü aşan izlemeler başlangıca kadarki paya ölçeklenir
      const span = fLast[r] - fFirst[r] + 1
      const share = fLast[r] < pop.startDay ? 1 : Math.max(0.1, (pop.startDay - fFirst[r]) / span)
      const comp = Math.floor(fComp[r] * share)
      const watch = fWatch[r] * share
      const ts = Math.min(fLast[r], pop.startDay - 1) * 86_400_000
      viewing.watch(guid, bt.videoId, watch, comp > 0, ts, Math.max(1, Math.round(fPlays[r] * share)))
      if (bt.type === 'MOVIE') {
        const done = comp > 0
        st.set(bt.videoId, { next: done ? 1 : 0, done })
        progress.setBookmark(
          guid,
          bt.leaves[0],
          done ? bt.runtimes[0] : Math.min(watch, bt.runtimes[0] * 0.5),
          bt.runtimes[0],
        )
      } else {
        const next = Math.min(bt.leaves.length, comp)
        st.set(bt.videoId, { next, done: next >= bt.leaves.length })
        // Yalnız son izlenen bölümler işaretlenir (uygulama sıradaki bölümü en son dokunulandan bulur)
        for (let k = Math.max(0, next - 3); k < next; k++)
          progress.setBookmark(guid, bt.leaves[k], bt.runtimes[k], bt.runtimes[k])
        if (next < bt.leaves.length && fPlays[r] * share > comp)
          progress.setBookmark(guid, bt.leaves[next], bt.runtimes[next] * 0.3, bt.runtimes[next])
      }
    }
    // Çoktan gitmiş mi? Değilse ilk geliş günü (n'den kısa kesilmiş geometrik boşluğun kalan kısmı)
    const e = pop.startDay - 1 - pop.lastDay[i]
    const room = n - 1 - e
    if (unif(i, -1, 0, P_START, 1) < pop.pGone[i] || room <= 0) {
      res.quitDay[i] = -2
      continue
    }
    const q = 1 - Math.min(1, pop.pVisit[i] * knobs.visitScale)
    const uu = unif(i, -1, 0, P_START, 2) * (1 - Math.pow(q, room))
    const g = q <= 0 ? 1 : Math.min(room, 1 + Math.floor(Math.log(Math.max(1e-12, 1 - uu)) / Math.log(q)))
    nextVisit[i] = g - 1
  }
  viewing.bump()

  const exp = emptyDayExp()
  const partial = pop.means.partialCdf
  const examined = new Set<number>()
  const contBase = pop.means.continueRate

  for (let day = 0; day < D; day++) {
    const abs = pop.startDay + day
    // Simülasyon saati: yerel akşam (19:00) — Top 10 penceresi ve "yeni gelenler" buna göre
    events.now = startMs + day * 86_400_000 + 16 * 3_600_000
    events.prune()
    viewing.bump()
    const now = new Date(events.now)
    for (let i = 0; i < N; i++) {
      const visiting = res.quitDay[i] === -1 && nextVisit[i] === day
      if (!visiting) {
        mask[i] = (mask[i] << 1) & 0x0fffffff
        continue
      }
      const profile = profiles[i]
      const guid = profile.guid
      const st = state[i]
      // Günün deneyimi
      exp.plays = 0
      exp.watch = 0
      exp.completions = 0
      exp.errors = 0
      exp.appErrors = 0
      exp.buffers = 0
      exp.fails = 0
      exp.bounces = 0
      exp.finished = 0
      exp.newTitles = 0
      exp.live = 0
      exp.notif = 0
      let burst = false
      let dayHome: Lolomo | null = null
      const extra = pop.sessionsPerDay[i] - 1
      // Oturum sayısı: 1 + Poisson(ortalama − 1), tek düzgün sayıdan ters dönüşümle
      let nSess = 1
      if (extra > 0) {
        const u0 = unif(i, day, 0, P_SESS, 0)
        let p = Math.exp(-extra)
        let cdf = p
        let k = 0
        while (u0 > cdf && k < 12) {
          k++
          p *= extra / k
          cdf += p
        }
        nSess += k
      }
      const pickiness = logit(pop.bounce[i]) - logit(pop.means.bounce)
      const bias = knobs.selectBias + selShift - pickiness
      const errP = Math.min(0.9, pop.errRate[i] * envErr)

      /** Bir yaprağı oynatır; başlatılamazsa null. */
      const playLeaf = (
        bt: BridgeTitle,
        j: number,
        leafIdx: number,
        s: number,
        ts: number,
      ): { completed: boolean } | null => {
        const leaf = bt.leaves[leafIdx]
        if (unif(i, day, s, P_ERR, leaf) < errP) {
          exp.errors++
          // Çoğu kez bir daha dener; ikinci deneme de başarısızsa vazgeçer
          if (unif(i, day, s, P_ERR, leaf + 1_000_003) >= 0.6) return null
          if (unif(i, day, s, P_ERR, leaf + 2_000_003) < errP) {
            exp.errors++
            return null
          }
        }
        const runtime = bt.runtimes[leafIdx]
        const u = oracle.utility(i, j)
        // Daha çok istenen başlık daha çok bitirilir (eğim varsayım; kayma kalibrasyonla)
        const completeP = sigmoid(logit(pop.completion[i]) + 0.3 * u + knobs.completionShift)
        let completed = unif(i, day, s, P_DONE, leaf) < completeP
        const f = unif(i, day, s, P_FRAC, leaf)
        let frac: number
        if (completed) frac = 0.93 + 0.07 * f
        else {
          // Yarım bırakılan oynatmanın oranı verideki dağılımdan (%5'lik dilimler)
          let b = 0
          while (b < partial.length - 1 && f > partial[b]) b++
          const lo = b === 0 ? 0 : partial[b - 1]
          const within = partial[b] > lo ? (f - lo) / (partial[b] - lo) : 0.5
          frac = Math.max(0.005, (b + within) * 0.05)
        }
        // Takılma: Poisson(oran × saat), tek düzgün sayıdan
        const lam = pop.bufRate[i] * envBuf * ((runtime * frac) / 3600)
        const ub = unif(i, day, s, P_BUF, leaf)
        let pb = Math.exp(-lam)
        let cdf = pb
        let nb = 0
        while (ub > cdf && nb < 30) {
          nb++
          pb *= lam / nb
          cdf += pb
        }
        if (nb >= 3) {
          burst = true
          if (unif(i, day, s, P_BUF, leaf + 5_000_011) < 0.4) {
            frac *= 0.5
            completed = false
          }
        }
        exp.buffers += nb
        const watched = runtime * frac
        exp.plays++
        exp.watch += watched
        if (completed) exp.completions++
        if (!st.has(bt.videoId)) {
          exp.newTitles++
          st.set(bt.videoId, { next: 0, done: false })
        }
        const ts2 = ts + Math.round(watched * 1000)
        progress.setBookmark(guid, leaf, completed ? runtime : watched, runtime)
        viewing.watch(guid, bt.videoId, watched, completed, ts2)
        events.play(leaf, ts2)
        return { completed }
      }

      for (let s = 0; s < nSess; s++) {
        const ts = events.now + s * 5_400_000
        const before = exp.plays
        if (unif(i, day, s, P_LIVE, 0) < pop.liveShare[i]) {
          /* ── Canlı yayın oturumu ── */
          if (unif(i, day, s, P_ERR, 1) < errP) exp.errors++
          else {
            const z = (unif(i, day, s, P_LIVE, 1) + unif(i, day, s, P_LIVE, 2) + unif(i, day, s, P_LIVE, 3) - 1.5) * 2
            // Log-normal: ortalaması ikizin kendi canlı oynatma süresi olacak biçimde (exp(σ²/2) düzeltmesi)
            const minutes = Math.min(360, pop.liveMinutes[i] * Math.exp(0.5 * z - 0.125))
            const lam = pop.bufRate[i] * envBuf * (minutes / 60)
            const ub = unif(i, day, s, P_BUF, 1)
            let pb = Math.exp(-lam)
            let cdf = pb
            let nb = 0
            while (ub > cdf && nb < 30) {
              nb++
              pb *= lam / nb
              cdf += pb
            }
            if (nb >= 3) burst = true
            exp.buffers += nb
            exp.plays++
            exp.watch += minutes * 60
            exp.live += minutes * 60
          }
        } else {
          /* ── İsteğe bağlı izleme: uygulamanın ana sayfası ── */
          // Ana sayfa gün içinde bir kez kurulur (aynı günün sonraki oturumları aynı sayfayı görür)
          if (!dayHome) {
            dayHome = buildLolomo(services, profile, { top10Supported: true, now, flags: tr.flags })
            res.homeBuilds++
          }
          const lolomo = dayHome
          examined.clear()
          let chosen = -1
          rows: for (let li = 0; li < lolomo.lists.length; li++) {
            const list = lolomo.lists[li]
            if (SKIP_CONTEXT.has(list.context)) continue
            if (li > 0 && unif(i, day, s, P_ROW, li) >= knobs.rowContinue) break
            const cw = list.context === 'continueWatching'
            for (let pos = 0; pos < list.videoIds.length; pos++) {
              if (pos > 0 && unif(i, day, s, P_ITEM, li * 64 + pos) >= knobs.itemContinue) break
              const vid = list.videoIds[pos]
              if (examined.has(vid)) continue
              examined.add(vid)
              const j = jOfVideo.get(vid)
              if (j === undefined) continue
              const ts0 = st.get(vid)
              if (ts0?.done) continue
              const inProgress = !!ts0 && ts0.next > 0
              const p = sigmoid(bias + oracle.utility(i, j) + (cw || inProgress ? knobs.continueBonus : 0))
              if (unif(i, day, s, P_SEL, vid) < p) {
                chosen = j
                break rows
              }
            }
          }
          if (chosen < 0) {
            // Arama: aklındaki bir başlığı arar (rastgele 12 izlenmemiş başlıktan en çok istediği)
            const ps = Math.min(
              0.95,
              pop.searchRate[i] / Math.max(0.02, pop.bounce[i] + pop.searchRate[i] * (1 - pop.searchFail[i])),
            )
            if (unif(i, day, s, P_SEARCH, 0) < ps) {
              if (unif(i, day, s, P_SEARCH, 1) < Math.min(1, pop.searchFail[i] * failMult)) exp.fails++
              else {
                let best = -1
                let bestU = -Infinity
                for (let k = 0; k < 12; k++) {
                  const j = Math.floor(unif(i, day, s, P_PICK, k) * J)
                  if (st.get(titles[j].videoId)?.done) continue
                  const u = oracle.utility(i, j)
                  if (u > bestU) {
                    bestU = u
                    best = j
                  }
                }
                chosen = best
              }
            }
          }
          if (chosen >= 0) {
            const bt = titles[chosen]
            let cur = st.get(bt.videoId) ?? { next: 0, done: false }
            for (let b = 0; b < 6; b++) {
              const leafIdx = bt.type === 'MOVIE' ? 0 : cur.next
              if (leafIdx >= bt.leaves.length) break
              const r = playLeaf(bt, chosen, leafIdx, s, ts + b * 1000)
              if (!r) break
              cur = st.get(bt.videoId) ?? cur
              if (!r.completed) break
              if (bt.type === 'MOVIE') {
                cur.done = true
                cur.next = 1
                break
              }
              cur.next++
              if (cur.next >= bt.leaves.length) {
                cur.done = true
                if (bt.leaves.length >= 3) exp.finished++
                break
              }
              if (unif(i, day, s, P_BINGE, bt.leaves[cur.next]) >= Math.min(0.95, contBase * contMult)) break
            }
          }
        }
        if (exp.plays === before) exp.bounces++
      }

      /* ── Gün sonu ── */
      const prev = lastAbs[i]
      exp.payFail = abs - pop.lastPayFail[i] <= 7
      exp.exhausted = lastFinish[i] < abs && abs - lastFinish[i] <= 14
      exp.hasPrev = abs - prev <= 3
      exp.prevErrors = lastErrors[i]
      exp.prevPlays = lastPlays[i]
      exp.prevFails = lastFails[i]
      exp.prevBuffers = lastBuffers[i]
      // Önceki penceredeki uygulama günleri (bugün hariç)
      let m = mask[i] & (hazard.priorWindow >= 28 ? 0x0fffffff : (1 << hazard.priorWindow) - 1)
      let prior = 0
      while (m) {
        prior += m & 1
        m >>>= 1
      }
      const tenure = pop.firstDay[i] < 0 ? -1 : abs - pop.firstDay[i]
      const eta = hazard.eta(exp, prior, tenure, pop.device[i], pop.tuple[i]) + knobs.hazardShift
      res.appDays[i]++
      res.sessions[i] += nSess
      res.plays[i] += exp.plays
      res.watchMin[i] += exp.watch / 60
      res.liveMin[i] += exp.live / 60
      res.bounceSessions[i] += exp.bounces
      if (exp.plays === 0) res.bounceDays[i]++
      res.errors[i] += exp.errors
      if (burst || exp.buffers >= 3) res.bufferDays[i]++
      res.searchFails[i] += exp.fails
      res.completions[i] += exp.completions
      res.newTitles[i] += exp.newTitles
      res.lastAppDay[i] = day
      res.dailyActive[day]++
      const bit = day * N + i
      res.activeBits[bit >> 3] |= 1 << (bit & 7)
      lastAbs[i] = abs
      lastErrors[i] = exp.errors
      lastPlays[i] = exp.plays
      lastFails[i] = exp.fails
      lastBuffers[i] = exp.buffers
      if (exp.finished > 0) lastFinish[i] = abs
      mask[i] = ((mask[i] << 1) | 1) & 0x0fffffff
      if (unif(i, day, 0, P_QUIT, 0) < sigmoid(eta)) {
        res.quitDay[i] = day
        nextVisit[i] = 1 << 30
      } else {
        const q = 1 - Math.min(1, pop.pVisit[i] * knobs.visitScale)
        const uu = unif(i, day, 0, P_GAP, 0) * (1 - Math.pow(q, n - 1))
        const g = q <= 0 ? 1 : Math.min(n - 1, 1 + Math.floor(Math.log(Math.max(1e-12, 1 - uu)) / Math.log(q)))
        nextVisit[i] = day + g
      }
    }
  }

  // Evrenin durumu bırakılır (bellek)
  viewing.resetProfiles(`${cfg.universe}-`)
  for (const p of profiles) progress.forgetProfile?.(p.guid)
  events.dropUniverse(cfg.universe)
  res.seconds = Math.round((Date.now() - t0) / 100) / 10
  return res
}

/** ikiz i, gün d'de uygulamaya geldi mi */
export function wasActive(r: UniverseResult, i: number, day: number): boolean {
  const bit = day * r.n + i
  return (r.activeBits[bit >> 3] & (1 << (bit & 7))) !== 0
}
