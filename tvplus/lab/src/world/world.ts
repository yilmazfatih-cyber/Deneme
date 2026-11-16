/**
 * Yer gerçeği dünyası: churn nedenleri İÇİNE GÖMÜLMÜŞ sentetik bir TV+ benzeri servis. Mixpanel ham dışa aktarım
 * biçiminde satır üretir (kendi olay ve özellik adlarıyla) ve yanında "gerçekler" dosyasını verir.
 *
 * Neden var: gerçek veri paylaşılamadığı için lab'ın analizleri gerçeği BİLİNEN bir veriyle sınanır.
 *   - churn analizi gömülü nedenleri buluyor mu (kalite, keşif, içerik tükenmesi, zayıf başlangıç, fiyat, sezon sonu)
 *   - etkisi OLMAYAN boyutlara (şehir, arayüz dili) etki yakıştırıyor mu
 *   - gömülü A/B deneyinin yönünü ve büyüklüğünü doğru ölçüyor mu
 *   - bu veriden kalibre edilen simülatör tutunma eğrisini yeniden üretiyor mu
 * Simülatör (lab/src/sim) bu dosyayı KULLANMAZ ve işlev biçimini bilmez; yalnız içe alınan olayları görür.
 *
 * GERÇEK DEĞİLDİR. Kimlikler `sentetik-…` ile başlar, her satırda `"synthetic": true` vardır.
 *
 * Gömülü mekanizmalar (hepsi WORLD_PARAMS içinde sayısal):
 *   alışkanlık   son günlerin doyumu düştükçe bırakma olasılığı artar
 *   kalite       oynatma hatası ve takılma o günü "son gün" yapar; hatalı sürüm: Android TV 4.2.0
 *   keşif        izleyecek bir şey bulamadan çıkılan oturumlar ve sonuçsuz aramalar
 *   içerik       sevdiği dizileri bitirip sırada bir şey kalmayanlar
 *   başlangıç    ilk günlerinde tek bir içeriği bile bitirmeyen yeni kullanıcılar
 *   fiyat        3 aylık promosyonun bitişi; başarısız ödeme
 *   sezon        spor sezonu bitince canlı spor izleyicileri
 * Etkisi olmayanlar: şehir, arayüz dili. Karıştırıcı: operatör paketi kullanıcıları hem daha çok TV'dedir hem daha
 * az bırakır (TV'nin kendisi korumaz).
 */
import { hash01 } from '../../../shared/flags'
import { normal, poisson, rngFor, type Rng } from '../core/rng'
import { sigmoid } from '../core/stats'
import type { LabMappingInput } from '../data/mapping'
import { buildWorldCatalog, type WorldCatalog, type WorldGenre, type WorldTitle } from './catalog'

export interface WorldOptions {
  users: number
  days: number
  seed: number
  /** Son gün (dahil), 'YYYY-AA-GG' */
  end: string
  /** Gömülü A/B deneyi (varsayılan açık) */
  experiment?: boolean
  /** Kirli veri: kişisel veri benzeri özellikler, yinelenen ve bozuk satırlar, eşlenmeyen olaylar (varsayılan açık) */
  noise?: boolean
}

export const WORLD_CAUSES = ['aliskanlik', 'kalite', 'kesif', 'icerik', 'baslangic', 'fiyat', 'sezon', 'dogal'] as const
export type WorldCause = (typeof WORLD_CAUSES)[number]

/** Bırakma (o günü son gün yapma) olasılığının katsayıları — lojit ölçeğinde. */
export const WORLD_PARAMS = {
  /** Etkin gün sonunda taban */
  base: -5.0,
  /** Alışkanlık (0–1), 0.5'e göre */
  habit: -3.0,
  /** Başarısız oynatma denemesi başına (en çok 2) */
  errorFail: 1.0,
  /** O gün bir oynatmada 3+ takılma */
  bufferBurst: 0.5,
  /** Birikmiş kalite hayal kırıklığı (günde ×0.6 söner) */
  qualityFrustration: 1.1,
  /** Günün tüm oturumları boş (hiç oynatma yok) */
  bounceDay: 0.75,
  /** Sonuçsuz arama başına (en çok 2) */
  zeroSearch: 0.45,
  discoveryFrustration: 0.9,
  /** İzlenecek sevdiği içerik kalmadı (tükenme penceresi) */
  exhausted: 1.7,
  /** Yeni kullanıcı (ilk 7 gün), 3. günden sonra hâlâ hiç tamamlama yok */
  weakStart: 1.6,
  /** Promosyon bitiş penceresi (bitişten 2 gün önce … 10 gün sonra) */
  promoEnd: 2.3,
  /** Başarısız ödemeden sonraki 5 gün */
  paymentFail: 1.6,
  /** Spor sezonu bittikten sonraki 21 gün (canlı spor izleyicisi) */
  seasonEnd: 1.5,
  planYearly: -0.9,
  channelOperator: -0.5,
  /** Etkin olmayan günde sessizce bırakma tabanı */
  silentBase: -7.4,
  /** Hatalı sürümde oynatma başlatma hatası ve takılma oranı (saat başına) */
  bugErrorRate: 0.13,
  bugBufferRate: 1.4,
  baseErrorRate: 0.012,
  baseBufferRate: 0.25,
  /** Yeni kullanıcının ilk 7 gününde "izleyecek bir şey bulma" çarpanı (soğuk başlangıç) */
  coldStartFind: 0.55,
  /** Deney: kişisel sıralama kolunda "izleyecek bir şey bulma" olasılığı çarpanı */
  experimentFindBoost: 1.3,
} as const

export interface WorldUserTruth {
  /** Ham distinct_id */
  id: string
  archetype: string
  platform: string
  version: string
  plan: string
  channel: string
  /** Pencere gün dizini; negatif → pencereden önce de vardı */
  arrivalDay: number
  /** İlk bırakma kararının günü (pencere gün dizini) */
  quitDay: number | null
  cause: WorldCause | null
  /** Bıraktıktan sonra geri döndü mü */
  returned: boolean
  variant: string | null
}

export interface WorldTruth {
  options: Required<WorldOptions>
  /** Pencerenin ilk gününün epoch gün numarası (yerel) */
  startDay: number
  users: WorldUserTruth[]
  causes: Record<WorldCause, number>
  params: typeof WORLD_PARAMS
  experiment: { name: string; startDay: number; variants: string[]; findBoost: number } | null
  bug: { platform: string; version: string; fixDay: number }
  seasonEndDay: number
  lines: number
}

interface Archetype {
  key: string
  share: number
  genres: Partial<Record<WorldGenre, number>>
  /** Oturumda canlı yayın izleme eğilimi */
  live: number
  /** İsteğe bağlı izlemede dizi ağırlığı (kalanı film) */
  series: number
  poolSeries: number
  poolMovies: number
  binge: number
}

export const WORLD_ARCHETYPES: readonly Archetype[] = [
  {
    key: 'dizi',
    share: 0.26,
    genres: { 'Yerli Dizi': 1.6, Dram: 1.0, Romantik: 0.6, Gerilim: 0.5 },
    live: 0.06,
    series: 0.88,
    poolSeries: 3,
    poolMovies: 3,
    binge: 0.6,
  },
  {
    key: 'film',
    share: 0.17,
    genres: { Aksiyon: 1.2, Komedi: 1.0, 'Bilim Kurgu': 0.8, Gerilim: 0.8, Dram: 0.5, Korku: 0.4 },
    live: 0.05,
    series: 0.2,
    poolSeries: 1,
    poolMovies: 26,
    binge: 0.3,
  },
  {
    key: 'spor',
    share: 0.12,
    genres: { Spor: 2.0, Aksiyon: 0.3 },
    live: 0.82,
    series: 0.3,
    poolSeries: 1,
    poolMovies: 3,
    binge: 0.3,
  },
  {
    key: 'haber',
    share: 0.07,
    genres: { Haber: 1.8, Belgesel: 0.7, Tarih: 0.4 },
    live: 0.75,
    series: 0.3,
    poolSeries: 1,
    poolMovies: 3,
    binge: 0.25,
  },
  {
    key: 'cocuk',
    share: 0.1,
    genres: { Çocuk: 2.0, Aile: 1.0, Animasyon: 1.0 },
    live: 0.1,
    series: 0.65,
    poolSeries: 4,
    poolMovies: 8,
    binge: 0.55,
  },
  {
    key: 'belgesel',
    share: 0.08,
    genres: { Belgesel: 1.8, Yaşam: 1.0, Tarih: 0.9 },
    live: 0.1,
    series: 0.45,
    poolSeries: 3,
    poolMovies: 10,
    binge: 0.4,
  },
  { key: 'karma', share: 0.14, genres: {}, live: 0.2, series: 0.5, poolSeries: 3, poolMovies: 8, binge: 0.4 },
  {
    key: 'tekdizi',
    share: 0.06,
    genres: { 'Yerli Dizi': 1.5 },
    live: 0.04,
    series: 0.95,
    poolSeries: 1,
    poolMovies: 1,
    binge: 0.65,
  },
]

const PLATFORMS: readonly [string, number, string[], number[]][] = [
  ['Android TV', 0.22, ['4.1.3', '4.2.0', '4.3.0'], [0.4, 0.35, 0.25]],
  ['Tizen', 0.12, ['2.8.0', '2.9.1'], [0.45, 0.55]],
  ['webOS', 0.08, ['2.8.0', '2.9.1'], [0.5, 0.5]],
  ['tvOS', 0.04, ['5.0.2', '5.1.0'], [0.3, 0.7]],
  ['iOS', 0.2, ['7.3.1', '7.4.0', '7.5.2'], [0.2, 0.35, 0.45]],
  ['Android', 0.22, ['7.3.0', '7.4.1', '7.5.0'], [0.25, 0.35, 0.4]],
  ['Web', 0.12, ['web'], [1]],
]
const TV_PLATFORMS = ['Android TV', 'Tizen', 'webOS', 'tvOS']
const CITIES: readonly [string, number][] = [
  ['İstanbul', 0.3],
  ['Ankara', 0.12],
  ['İzmir', 0.09],
  ['Bursa', 0.06],
  ['Antalya', 0.05],
  ['Adana', 0.04],
  ['Konya', 0.04],
  ['Gaziantep', 0.04],
  ['Kayseri', 0.03],
  ['Diğer', 0.23],
]
const LANGS: readonly [string, number][] = [
  ['tr', 0.93],
  ['en', 0.05],
  ['ar', 0.02],
]
const PLANS: readonly [string, number][] = [
  ['aylik', 0.55],
  ['yillik', 0.2],
  ['promo-3ay', 0.25],
]
const CHANNELS: readonly [string, number][] = [
  ['organik', 0.45],
  ['kampanya', 0.3],
  ['operator-paketi', 0.25],
]
const PRICES: Record<string, number> = { aylik: 99.9, yillik: 899, 'promo-3ay': 29.9 }
const ERROR_CODES = ['PLAYER_INIT_TIMEOUT', 'DRM_LICENSE', 'NETWORK', 'MANIFEST_404']
const SCREENS = ['Home', 'Detail', 'Search', 'Live TV', 'Profile', 'My List']
/** İstanbul saatine göre oturum başlangıç ağırlıkları (0–23) */
const HOURS = [
  0.6, 0.3, 0.15, 0.1, 0.1, 0.1, 0.2, 0.4, 0.6, 0.7, 0.8, 0.9, 1, 1, 1, 1.1, 1.3, 1.6, 2.2, 2.9, 3.4, 3.4, 2.6, 1.4,
]
const EXPERIMENT_NAME = 'anasayfa-kisisel-siralama'
const DAY = 86_400

function pickW<T>(rng: Rng, items: readonly (readonly [T, number])[]): T {
  let total = 0
  for (const [, w] of items) total += w
  let r = rng() * total
  for (const [v, w] of items) {
    r -= w
    if (r < 0) return v
  }
  return items[items.length - 1][0]
}
const hex = (rng: Rng, n: number): string => {
  let s = ''
  for (let i = 0; i < n; i++) s += Math.floor(rng() * 16).toString(16)
  return s
}
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

/** 'YYYY-AA-GG' → epoch gün numarası */
function dayNumber(iso: string): number {
  const t = Date.parse(`${iso}T00:00:00Z`)
  if (!Number.isFinite(t)) throw new Error(`Geçersiz bitiş günü: ${iso}`)
  return Math.floor(t / 86_400_000)
}

interface PoolItem {
  title: WorldTitle
  aff: number
  /** Dizide sıradaki bölüm dizini */
  next: number
}

/**
 * Dünyayı üretir: her `yield` bir kullanıcının satırlarıdır ('\n' ile biten). Üreteç bittiğinde gerçekler döner.
 * Aynı seçenekler → bayt bayt aynı çıktı.
 */
export function* generateWorld(input: WorldOptions): Generator<string, WorldTruth> {
  const opts: Required<WorldOptions> = {
    experiment: true,
    noise: true,
    ...input,
    users: Math.max(1, Math.floor(input.users)),
    days: Math.max(30, Math.floor(input.days)),
  }
  const { days, seed } = opts
  const endDay = dayNumber(opts.end)
  const startDay = endDay - (days - 1)
  // Yerel (İstanbul) gün başlangıcı = UTC − 3 saat
  const dayStartUtc = (d: number): number => (startDay + d) * DAY - 3 * 3600
  const cat: WorldCatalog = buildWorldCatalog(seed, days)
  const seasonEndDay = Math.max(20, days - 50)
  const expStart = Math.max(10, days - 45)
  const fixDay = Math.max(15, days - 35)
  const P = WORLD_PARAMS
  const truth: WorldTruth = {
    options: opts,
    startDay,
    users: [],
    causes: Object.fromEntries(WORLD_CAUSES.map((c) => [c, 0])) as Record<WorldCause, number>,
    params: WORLD_PARAMS,
    experiment: opts.experiment
      ? {
          name: EXPERIMENT_NAME,
          startDay: expStart,
          variants: ['control', 'personal'],
          findBoost: P.experimentFindBoost,
        }
      : null,
    bug: { platform: 'Android TV', version: '4.2.0', fixDay },
    seasonEndDay,
    lines: 0,
  }
  const archMix = WORLD_ARCHETYPES.map((a) => [a, a.share] as const)
  const hourMix = HOURS.map((w, h) => [h, w] as const)
  const sportChannels = cat.channels.filter((c) => c.sport)

  for (let vi = 0; vi < opts.users; vi++) {
    const rng = rngFor(seed, 'kullanici', vi)
    const id = `sentetik-${seed}-${hex(rng, 12)}`
    const arch = pickW(rng, archMix)
    let channel = pickW(rng, CHANNELS)
    let [platform, , versions, versionShares] = pickW(
      rng,
      PLATFORMS.map((p) => [p, p[1]] as const),
    )
    // Karıştırıcı: operatör paketi kullanıcıları daha çok TV'dedir
    if (channel === 'operator-paketi' && !TV_PLATFORMS.includes(platform) && rng() < 0.5) {
      const tv = PLATFORMS.filter((p) => TV_PLATFORMS.includes(p[0]))
      ;[platform, , versions, versionShares] = pickW(
        rng,
        tv.map((p) => [p, p[1]] as const),
      )
    }
    let version = pickW(
      rng,
      versions.map((v, i) => [v, versionShares[i]] as const),
    )
    const plan = pickW(rng, PLANS)
    if (plan === 'yillik' && channel === 'kampanya' && rng() < 0.5) channel = 'organik'
    const city = pickW(rng, CITIES)
    const lang = pickW(rng, LANGS)
    const existing = rng() < 0.58
    const arrivalDay = existing
      ? -(5 + Math.floor(rng() * (plan === 'promo-3ay' ? 80 : 400)))
      : Math.floor(rng() * (days - 3))
    const promoEnd = plan === 'promo-3ay' ? arrivalDay + 90 : Infinity
    const sportsFan = arch.key === 'spor'
    const seriesDriven = arch.series >= 0.6
    const baseRate = Math.min(2.5, Math.max(0.04, Math.exp(Math.log(0.42) + 0.7 * normal(rng))))
    let habit = existing ? clamp01(0.55 + 0.18 * normal(rng)) : 0.32
    let fQuality = 0
    let fDiscovery = 0
    let exhaustUntil = -1
    let payFailUntil = -1
    let completedEver = existing
    let variant: string | null = null
    const upgrades = platform === 'Android TV' && version === '4.2.0' && rng() < 0.5

    /* ── Zevk havuzu ── */
    const affinityOf = (t: WorldTitle): number => {
      let s = 0
      for (const g of t.genres) s += arch.genres[g] ?? (arch.key === 'karma' ? 0.6 : 0)
      return s * (0.5 + t.pop) + 0.35 * normal(rng)
    }
    const takeTop = (list: WorldTitle[], k: number): PoolItem[] =>
      list
        .map((t) => ({ t, s: affinityOf(t) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, Math.max(0, k))
        .map((x) => ({ title: x.t, aff: clamp01(0.62 + 0.14 * normal(rng) + 0.1 * Math.min(1.5, x.s)), next: 0 }))
    let pool: PoolItem[]
    if (arch.key === 'tekdizi') {
      const tent = cat.series[Math.floor(rng() * 6)]
      pool = [{ title: tent, aff: 0.95, next: 0 }]
      if (rng() < 0.35) pool.push(...takeTop(cat.movies, 1))
    } else {
      pool = [
        ...takeTop(cat.series, poisson(rng, arch.poolSeries)),
        ...takeTop(cat.movies, poisson(rng, arch.poolMovies)),
      ]
    }
    // Pencereden önce de var olan kullanıcı havuzunun bir kısmını çoktan tüketmiştir
    if (existing) {
      pool = pool.filter(() => rng() > 0.3)
      for (const p of pool)
        if (p.title.kind === 'series') {
          const avail = p.title.episodes.filter((e) => e.releaseDay <= 0).length
          p.next = Math.floor(rng() * Math.max(1, avail * 0.8))
        }
    }
    let current: PoolItem | null = pool.find((p) => p.title.kind === 'series') ?? null

    const out: string[] = []
    let lineCount = 0
    const emit = (event: string, t: number, props: Record<string, unknown>): void => {
      const useMs = opts.noise && rng() < 0.02
      const obj: Record<string, unknown> = {
        event,
        properties: {
          time: useMs ? Math.floor(t) * 1000 : Math.floor(t),
          distinct_id: id,
          $insert_id: hex(rng, 20),
          platform,
          app_version: version,
          plan_type: plan,
          acquisition_channel: channel,
          $city: city,
          mp_country_code: 'TR',
          ui_language: lang,
          synthetic: true,
          ...props,
        },
      }
      let line = JSON.stringify(obj)
      if (opts.noise) {
        const r = rng()
        if (r < 0.0005) line = line.slice(0, Math.floor(line.length * 0.6))
        else if (r < 0.0008) line = line.replace(/"time":\d+,/, '')
      }
      out.push(line)
      lineCount++
      if (opts.noise && rng() < 0.003) {
        out.push(line)
        lineCount++
      }
    }
    const playProps = (t: WorldTitle, epIdx: number): Record<string, unknown> => {
      if (t.kind === 'series') {
        const e = t.episodes[epIdx]
        return {
          content_id: e.id,
          content_title: `${t.name} · S${e.season} B${e.episode}`,
          content_type: 'episode',
          genre: t.genres.join(', '),
          series_id: t.id,
          season_number: e.season,
          episode_number: e.episode,
          content_duration_sec: e.durSec,
          is_live: false,
        }
      }
      if (t.kind === 'movie')
        return {
          content_id: t.id,
          content_title: t.name,
          content_type: 'movie',
          genre: t.genres.join(', '),
          content_duration_sec: t.durSec,
          is_live: false,
        }
      return {
        content_id: t.id,
        content_title: t.name,
        content_type: t.sport ? 'sport' : 'live',
        genre: t.genres[0],
        is_live: true,
      }
    }
    const errorRate = (): number =>
      platform === 'Android TV' && version === '4.2.0' ? P.bugErrorRate : P.baseErrorRate
    const bufferRate = (): number =>
      platform === 'Android TV' && version === '4.2.0' ? P.bugBufferRate : platform === 'Web' ? 0.5 : P.baseBufferRate

    const startDayIdx = Math.max(0, arrivalDay)
    let alive = true
    let quitDay: number | null = null
    let cause: WorldCause | null = null
    let returned = false
    let returnDay = -1
    let cancelDay = -1

    for (let d = startDayIdx; d < days; d++) {
      if (!alive) {
        if (d === cancelDay)
          emit('Subscription Cancelled', dayStartUtc(d) + 12 * 3600 + rng() * 3600, { price: PRICES[plan] })
        if (d !== returnDay) continue
        // Geri dönüş: taze havuz, düşük alışkanlık
        alive = true
        returned = true
        habit = 0.3
        fQuality = 0
        fDiscovery = 0
        exhaustUntil = -1
        pool.push(
          ...takeTop(
            cat.series.filter((t) => !pool.some((p) => p.title === t)),
            2,
          ),
          ...takeTop(cat.movies, 3),
        )
        current = pool.find((p) => p.title.kind === 'series') ?? null
      }
      const t0 = dayStartUtc(d)
      if (upgrades && d === fixDay) version = '4.3.0'
      if (d === arrivalDay) {
        emit('Signup Completed', t0 + 9 * 3600 + rng() * 6 * 3600, {})
        emit('Subscription Started', t0 + 9 * 3600 + rng() * 6 * 3600 + 120, { price: PRICES[plan] })
      }
      // Aylık yenileme (yıllık plan pencere içinde yenilenmez)
      if (plan !== 'yillik' && d > arrivalDay && (d - arrivalDay) % 30 === 0) {
        if (rng() < 0.03) {
          emit('Payment Failed', t0 + 4 * 3600, { price: PRICES[plan] })
          payFailUntil = d + 5
        } else emit('Subscription Renewed', t0 + 4 * 3600, { price: d >= promoEnd ? PRICES.aylik : PRICES[plan] })
      }
      // Havuz tazelenmesi: yeni çıkan ve zevke uyan başlıklar ara sıra havuza girer
      if (rng() < 0.05) {
        const fresh = cat.movies.filter(
          (t) => t.releaseDay <= d && t.releaseDay > d - 14 && !pool.some((p) => p.title === t),
        )
        if (fresh.length) pool.push(...takeTop(fresh, 1))
      }

      const dow = (((startDay + d + 3) % 7) + 7) % 7 // 0 = Pazartesi
      const weekend = dow >= 5
      const matchDay = sportsFan && d < seasonEndDay && (dow === 5 || dow === 6 || dow === 2)
      let rate = baseRate * (0.35 + 1.3 * habit) * (weekend ? 1.2 : 1)
      if (sportsFan) rate *= d < seasonEndDay ? (matchDay ? 1.7 : 0.9) : 0.55
      const sessions = poisson(rng, rate)

      let errFails = 0
      let bufferBurst = false
      let zeroSearch = 0
      let dayPlays = 0
      let satisfaction = 0

      // Oturumlar gün içinde sıralıdır ve üst üste binmez (tek kullanıcı, tek ekran)
      const starts: number[] = []
      for (let s = 0; s < sessions; s++) starts.push(t0 + pickW(rng, hourMix) * 3600 + rng() * 3600)
      starts.sort((a, b) => a - b)
      let prevEnd = 0
      for (let s = 0; s < sessions; s++) {
        let t = Math.max(starts[s], prevEnd + 2400 + rng() * 1800)
        if (opts.experiment && variant === null && d >= expStart) {
          variant = hash01(`dunya-deney|${id}`) < 0.5 ? 'control' : 'personal'
          emit('$experiment_started', t - 2, { 'Experiment name': EXPERIMENT_NAME, 'Variant name': variant })
        }
        const treated = variant === 'personal'
        if (rng() < 0.05) emit('Push Notification Opened', t - 5, {})
        emit('App Opened', t, {})
        emit('Screen Viewed', t + 2, { screen_name: 'Home' })
        t += 6
        if (opts.noise) {
          if (rng() < 0.07) emit('Settings Opened', t + 1, {})
          if (rng() < 0.05) emit('Profile Switched', t + 2, {})
          if (rng() < 0.01)
            emit('Profile Updated', t + 3, {
              $email: `kisi${vi}@ornek-posta.example`,
              $name: `Ad${vi} Soyad${vi}`,
              msisdn: `90532${String(1_000_000 + vi).slice(-7)}`,
              $ip: `10.${vi % 250}.${(vi >> 8) % 250}.7`,
            })
        }
        let playsInSession = 0
        const wantsLive = rng() < arch.live * (matchDay ? 1.15 : 1)

        /* Tek oynatma: başlatma hatası, izleme, takılma. Dönüş: izlenen sn ve tamamlandı mı (hata → null). */
        const play = (
          title: WorldTitle,
          epIdx: number,
          aff: number,
        ): { watched: number; completed: boolean } | null => {
          const pp = playProps(title, epIdx)
          for (let attempt = 0; ; attempt++) {
            if (rng() < errorRate()) {
              emit('Playback Error', t, {
                content_id: pp.content_id,
                error_code: ERROR_CODES[Math.floor(rng() * ERROR_CODES.length)],
              })
              t += 9
              errFails++
              fQuality += 0.8
              if (attempt >= 1 || rng() > 0.6) return null
            } else break
          }
          emit('Playback Started', t, pp)
          const live = title.kind === 'channel'
          let dur: number
          let frac: number
          let completed = false
          if (live) {
            dur = Math.min(4 * 3600, Math.exp(Math.log(matchDay && title.sport ? 5400 : 1800) + 0.6 * normal(rng)))
            frac = 1
          } else {
            dur = title.kind === 'series' ? title.episodes[epIdx].durSec : title.durSec
            const completeP = 0.25 + 0.6 * aff
            if (rng() < completeP) {
              frac = 0.93 + 0.07 * rng()
              completed = true
            } else frac = rng() < 0.3 ? 0.02 + 0.1 * rng() : 0.12 + 0.75 * rng()
          }
          let watched = dur * frac
          const nBuf = poisson(rng, (bufferRate() * watched) / 3600)
          if (nBuf >= 3) {
            bufferBurst = true
            fQuality += 0.4
            if (rng() < 0.4) {
              watched *= 0.3 + 0.4 * rng()
              completed = false
            }
          }
          for (let pos = 600; pos < watched; pos += 600)
            emit('Playback Heartbeat', t + pos, { content_id: pp.content_id, position_sec: pos })
          for (let b = 0; b < nBuf; b++)
            emit('Buffering', t + rng() * watched, {
              content_id: pp.content_id,
              buffer_duration_sec: Math.round((2 + 18 * rng() * rng()) * 10) / 10,
            })
          emit('Playback Stopped', t + watched, {
            content_id: pp.content_id,
            watch_duration_sec: Math.round(watched),
            position_sec: Math.round(watched),
            ...(live ? {} : { content_duration_sec: dur }),
            completed,
          })
          t += watched + 8
          playsInSession++
          dayPlays++
          satisfaction += (watched / 60) * (live ? 0.75 : aff)
          return { watched, completed }
        }
        const browse = (target: WorldTitle | null): void => {
          const n = 2 + Math.floor(rng() * 4)
          const clickAt = target ? Math.floor(rng() * n) : -1
          for (let k = 0; k < n; k++) {
            const tt = k === clickAt && target ? target : cat.titles[Math.floor(rng() * cat.titles.length)]
            const cid = tt.kind === 'series' ? tt.episodes[0].id : tt.id
            const row = Math.floor(rng() * rng() * 9)
            const position = Math.floor(rng() * rng() * 12)
            emit('Content Impression', t + k, { content_id: cid, row_index: row, position })
            if (k === clickAt) emit('Content Clicked', t + k + 1, { content_id: cid, row_index: row, position })
          }
          t += n + 3
        }

        if (wantsLive) {
          emit('Screen Viewed', t, { screen_name: 'Live TV' })
          t += 3
          const pickFrom = sportsFan
            ? sportChannels
            : cat.channels.filter((c) => (arch.genres[c.genres[0]] ?? 0.3) > 0.2)
          const ch = pickW(
            rng,
            (pickFrom.length ? pickFrom : cat.channels).map((c) => [c, c.pop] as const),
          )
          play(ch, 0, 0.75)
        } else {
          // Sıradaki bölüm varsa çoğunlukla ona devam edilir
          const nextReady = (p: PoolItem | null): boolean =>
            !!p && p.next < p.title.episodes.length && p.title.episodes[p.next].releaseDay <= d
          let chosen: PoolItem | null = null
          let outside: WorldTitle | null = null
          if (nextReady(current) && rng() < 0.78) chosen = current
          else {
            const avail = pool.filter((p) => p.title.releaseDay <= d && (p.title.kind === 'movie' || nextReady(p)))
            const cold = !existing && d - arrivalDay <= 6 ? P.coldStartFind : 1
            const q = Math.min(0.9, 0.33 * cold * (treated ? P.experimentFindBoost : 1))
            const pFind = avail.length
              ? 1 - Math.pow(1 - q, Math.min(6, avail.length))
              : Math.min(0.5, 0.12 * (treated ? 1.5 : 1))
            if (rng() < pFind) {
              if (avail.length) {
                const wantSeries = rng() < arch.series
                const pref = avail.filter((p) => (p.title.kind === 'series') === wantSeries)
                chosen = pickW(
                  rng,
                  (pref.length ? pref : avail).map((p) => [p, 0.2 + p.title.pop] as const),
                )
              } else outside = cat.movies[Math.floor(Math.pow(rng(), 2) * cat.movies.length)]
            } else if (rng() < 0.3) {
              emit('Screen Viewed', t, { screen_name: 'Search' })
              const empty = rng() < 0.45
              const word = cat.titles[Math.floor(rng() * cat.titles.length)].name
                .split(' ')[0]
                .toLocaleLowerCase('tr-TR')
              emit('Search Performed', t + 4, {
                search_term: word,
                results_count: empty ? 0 : 1 + Math.floor(rng() * 12),
              })
              t += 8
              if (empty) {
                zeroSearch++
                fDiscovery += 0.5
              } else if (rng() < 0.5) outside = cat.movies[Math.floor(rng() * cat.movies.length)]
            }
          }
          if (chosen) {
            browse(chosen.title)
            emit('Screen Viewed', t, { screen_name: 'Detail' })
            t += 3
            const binge = Math.min(5, 1 + (rng() < arch.binge ? 1 + Math.floor(rng() * 3) : 0))
            for (let k = 0; k < binge; k++) {
              const item: PoolItem = chosen
              if (item.title.kind === 'series' && !nextReady(item)) break
              const r = play(item.title, item.next, item.aff)
              if (!r) break
              if (item.title.kind === 'movie') {
                if (r.completed) {
                  completedEver = true
                  pool = pool.filter((p) => p !== item)
                }
                break
              }
              if (!r.completed) break
              completedEver = true
              item.next++
              current = item
              if (item.next >= item.title.episodes.length) {
                // Dizi bitti: sırada sevdiği başka dizi var mı?
                pool = pool.filter((p) => p !== item)
                current = pool.find((p) => p.title.kind === 'series' && nextReady(p)) ?? null
                // Dizi ağırlıklı izleyicide sırada dizi kalmaması, diğerlerinde havuzun tümden boşalması tükenmedir
                const left = seriesDriven
                  ? pool.some((p) => p.title.kind === 'series' && nextReady(p))
                  : pool.some((p) => p.title.releaseDay <= d && (p.title.kind === 'movie' || nextReady(p)))
                if (!left) exhaustUntil = d + 14
                break
              }
            }
            if (rng() < 0.03)
              emit('Added To List', t, {
                content_id: chosen.title.kind === 'series' ? chosen.title.episodes[0].id : chosen.title.id,
              })
          } else if (outside) {
            browse(outside)
            const r = play(outside, 0, 0.15 + 0.3 * rng())
            if (r?.completed) completedEver = true
          } else {
            browse(null)
            fDiscovery += 0.25
          }
        }
        if (playsInSession === 0 && rng() < 0.3)
          emit('Screen Viewed', t, { screen_name: SCREENS[4 + Math.floor(rng() * 2)] })
        prevEnd = t
      }

      /* ── Gün sonu: durum güncellemesi ve bırakma kararı ── */
      const active = sessions > 0
      const newUser = !existing && d - arrivalDay <= 6
      const inPromo = d >= promoEnd - 2 && d <= promoEnd + 10
      const inSeason = sportsFan && d >= seasonEndDay && d < seasonEndDay + 21
      const exhausted = d <= exhaustUntil
      const contrib: Record<WorldCause, number> = {
        aliskanlik: Math.max(0, P.habit * (habit - 0.5)),
        kalite: 0,
        kesif: 0,
        icerik: exhausted ? P.exhausted : 0,
        baslangic: 0,
        fiyat: (inPromo ? P.promoEnd : 0) + (d <= payFailUntil ? P.paymentFail : 0),
        sezon: inSeason ? P.seasonEnd : 0,
        dogal: 0,
      }
      let z: number
      if (active) {
        contrib.kalite =
          P.errorFail * Math.min(2, errFails) +
          (bufferBurst ? P.bufferBurst : 0) +
          P.qualityFrustration * Math.min(2, fQuality)
        contrib.kesif =
          (dayPlays === 0 ? P.bounceDay : 0) +
          P.zeroSearch * Math.min(2, zeroSearch) +
          P.discoveryFrustration * Math.min(2, fDiscovery)
        contrib.baslangic = newUser && d - arrivalDay >= 2 && !completedEver ? P.weakStart : 0
        z = P.base + P.habit * (habit - 0.5)
        z += contrib.kalite + contrib.kesif + contrib.icerik + contrib.baslangic + contrib.fiyat + contrib.sezon
      } else {
        z = P.silentBase + P.habit * (habit - 0.5) * 1.2 + contrib.icerik + contrib.fiyat + contrib.sezon
      }
      if (plan === 'yillik') z += P.planYearly
      if (channel === 'operator-paketi') z += P.channelOperator
      if (rng() < sigmoid(z)) {
        alive = false
        let best: WorldCause = 'dogal'
        let bestV = 0.4
        for (const c of WORLD_CAUSES) {
          if (contrib[c] > bestV) {
            bestV = contrib[c]
            best = c
          }
        }
        if (quitDay === null) {
          quitDay = d
          cause = best
        }
        if (plan !== 'yillik' && rng() < 0.55) cancelDay = d + 1 + Math.floor(rng() * 20)
        returnDay = rng() < 0.05 ? d + 35 + Math.floor(rng() * 35) : -1
        continue
      }
      // Durum: alışkanlık doyuma doğru kayar; hayal kırıklıkları söner
      if (active) habit += 0.25 * (Math.min(1, satisfaction / 50) - habit)
      else habit *= 0.985
      fQuality *= 0.6
      fDiscovery *= 0.6
    }

    truth.users.push({
      id,
      archetype: arch.key,
      platform,
      version,
      plan,
      channel,
      arrivalDay,
      quitDay,
      cause,
      returned,
      variant,
    })
    if (cause) truth.causes[cause]++
    truth.lines += lineCount
    if (out.length) yield `${out.join('\n')}\n`
  }
  return truth
}

/** Dünyanın olay ve özellik adları için doğru lab eşlemesi (otomatik önerinin karşılaştırıldığı başvuru). */
export const WORLD_MAPPING: LabMappingInput = {
  $comment: 'Yer gerçeği dünyasının (sentetik demo) eşlemesi.',
  version: 1,
  events: {
    'App Opened': 'APP_OPEN',
    'Screen Viewed': 'SCREEN',
    'Content Impression': 'IMPRESSION',
    'Content Clicked': 'CLICK',
    'Playback Started': 'PLAY_START',
    'Playback Heartbeat': 'PLAY_PROGRESS',
    'Playback Stopped': 'PLAY_END',
    'Playback Error': 'PLAY_ERROR',
    Buffering: 'BUFFER',
    'Search Performed': 'SEARCH',
    'Added To List': 'LIST_ADD',
    'Push Notification Opened': 'NOTIF_OPEN',
    'Signup Completed': 'SIGNUP',
    'Subscription Started': 'SUBSCRIBE',
    'Subscription Renewed': 'RENEW',
    'Subscription Cancelled': 'CANCEL',
    'Payment Failed': 'PAYMENT_FAIL',
    $experiment_started: 'EXPOSURE',
  },
  props: {
    contentId: 'content_id',
    contentTitle: 'content_title',
    contentType: 'content_type',
    genre: 'genre',
    seriesId: 'series_id',
    season: 'season_number',
    episode: 'episode_number',
    duration: 'content_duration_sec',
    position: 'position_sec',
    watched: 'watch_duration_sec',
    completed: 'completed',
    live: 'is_live',
    device: 'platform',
    errorCode: 'error_code',
    bufferDuration: 'buffer_duration_sec',
    resultCount: 'results_count',
    rank: 'position',
    row: 'row_index',
    screen: 'screen_name',
    experiment: 'Experiment name',
    variant: 'Variant name',
    amount: 'price',
  },
  dims: {
    platform: 'platform',
    surum: 'app_version',
    plan: 'plan_type',
    kaynak: 'acquisition_channel',
    sehir: '$city',
    dil: 'ui_language',
  },
}
