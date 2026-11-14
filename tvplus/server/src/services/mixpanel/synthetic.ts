/**
 * SENTETİK izleme verisi üreteci. Gerçek değildir; yalnız hattın uçtan uca çalıştığını göstermek içindir.
 * Mixpanel ham dışa aktarım biçiminde satır üretir ve gerçek veriyle AYNI içe aktarıcıdan geçer (kaynak SYNTHETIC).
 * Her satırda `"synthetic": true` ve `distinct_id: "sentetik-…"` bulunur.
 *
 * Model: izleyiciler katalogdaki tür ve ruh hâllerine göre tanımlı 10 gizli zevk ilkörneğinden çekilir (bir kısmı
 * iki ilkörneğin karışımı), izleyici × başlık gürültüsü eklenir, popülerlik eğilimi vardır. Etkinlik düzeyi
 * log-normal, oturum saati akşama ağırlıklı (İstanbul), izleme oranı ilgiye bağlı (beğenilen tamamlanır, ilgisiz
 * olan erken bırakılır). Cihaz ve ülke karışımı izleyici düzeyindedir. Aynı tohum + aynı bitiş günü → bayt bayt aynı dosya.
 */
import { setImmediate as yieldLoop } from 'node:timers/promises'
import type { ContentTitle } from '../../../../shared/content-schema'
import { zMixpanelMapping, type MixpanelMapping } from '../../../../shared/mixpanel-mapping'

/** Üretecin olay ve özellik adları (depodaki varsayılan eşlemeyle aynı). Kullanıcı eşlemeyi değiştirse de sentetik içe aktarma bununla yapılır. */
export const SYNTHETIC_MAPPING: MixpanelMapping = zMixpanelMapping.parse({
  version: 1,
  events: {
    'Content Impression': 'IMPRESSION',
    'Content Click': 'CLICK',
    'Video Start': 'PLAY_START',
    'Video Progress': 'PLAY_PROGRESS',
    'Video Stop': 'PLAY_END',
    'My List Add': 'ADD_TO_LIST',
    'My List Remove': 'REMOVE_FROM_LIST',
    'Content Rated': 'RATING',
    Search: 'SEARCH',
  },
  properties: {
    contentId: 'content_id',
    watchedSeconds: 'watched_seconds',
    positionSeconds: 'position',
    durationSeconds: 'duration',
    completed: 'completed',
    rating: 'rating',
    query: 'search_query',
    device: 'platform',
    country: 'mp_country_code',
  },
  deviceMap: { 'android tv': 'TV', 'smart tv': 'TV', tvos: 'TV', ios: 'MOBILE', android: 'MOBILE', web: 'WEB' },
  ratingMap: { thumbs_down: -1, thumbs_up: 1, thumbs_way_up: 2 },
})

export interface SyntheticOptions {
  viewers: number
  days: number
  seed: number
  /** Son gün (dahil), 'YYYY-MM-DD'. Belirleyicilik için açıkça verilir. */
  end: string
}

export const SYNTHETIC_LIMITS = { maxViewers: 50_000, maxDays: 730 } as const

interface Archetype {
  key: string
  name: string
  /** Nüfustaki göreli ağırlık */
  share: number
  genres: Record<string, number>
  moods: Record<string, number>
}

/** Gizli zevk ilkörnekleri — katalogdaki gerçek tür ve ruh hâli anahtarları üzerinden tanımlıdır. */
export const ARCHETYPES: readonly Archetype[] = [
  {
    key: 'bilim-uzay',
    name: 'Bilim ve uzay belgeselleri',
    share: 1.3,
    genres: { 'doga-bilim': 1.6, teknoloji: 1.2, belgesel: 0.5, 'bilim-kurgu': 0.4 },
    moods: { dusundurucu: 0.8, ilham: 0.6 },
  },
  {
    key: 'sessiz-sinema',
    name: 'Sessiz sinema klasikleri',
    share: 0.7,
    genres: { 'sessiz-sinema': 1.8, klasik: 1.2, komedi: 0.3 },
    moods: { 'kult-klasik': 0.6, nostaljik: 0.5, sozsuz: 0.4 },
  },
  {
    key: 'cocuk-aile',
    name: 'Çocuk ve aile',
    share: 1.2,
    genres: { 'cocuk-aile': 1.8, animasyon: 0.8, komedi: 0.3 },
    moods: { 'aile-boyu': 0.8, eglenceli: 0.5, 'ic-isitan': 0.4 },
  },
  {
    key: 'tarih-kultur',
    name: 'Tarih ve kültür',
    share: 1.0,
    genres: { tarih: 1.6, muzik: 0.6, yasam: 0.5, belgesel: 0.5, yerli: 0.4 },
    moods: { nostaljik: 0.5, dusundurucu: 0.3 },
  },
  {
    key: 'animasyon-kisa',
    name: 'Animasyon ve kısa film',
    share: 1.0,
    genres: { animasyon: 1.5, 'kisa-film': 1.2, fantastik: 0.5 },
    moods: { 'acik-kaynak': 0.4, 'goz-alici': 0.5, duygusal: 0.3 },
  },
  {
    key: 'korku-gerilim',
    name: 'Korku ve gerilim',
    share: 0.5,
    genres: { korku: 1.8, gerilim: 1.3 },
    moods: { karanlik: 0.8, gerilimli: 0.6 },
  },
  {
    key: 'yerli-yasam',
    name: 'Yerli yaşam belgeselleri',
    share: 1.1,
    genres: { yasam: 1.4, yerli: 1.3, belgesel: 0.6 },
    moods: { 'ic-isitan': 0.6, sakin: 0.5 },
  },
  {
    key: 'komedi',
    name: 'Komedi',
    share: 0.8,
    genres: { komedi: 1.7, macera: 0.3 },
    moods: { esprili: 0.7, eglenceli: 0.6, absurt: 0.4 },
  },
  {
    key: 'bilimkurgu-fantastik',
    name: 'Bilim kurgu ve fantastik',
    share: 0.7,
    genres: { 'bilim-kurgu': 1.6, fantastik: 1.2, macera: 0.6 },
    moods: { heyecanli: 0.5, dusundurucu: 0.3 },
  },
  {
    key: 'gezi-lezzet',
    name: 'Gezi, lezzet ve sakin anlatı',
    share: 0.9,
    genres: { yasam: 1.2, belgesel: 1.0 },
    moods: { sakin: 0.9, 'goz-alici': 0.6, 'ic-isitan': 0.3 },
  },
]

const DEVICE_MIX: readonly [string[], number][] = [
  [['Android TV', 'Smart TV', 'tvOS'], 0.45],
  [['iOS', 'Android'], 0.32],
  [['Web'], 0.23],
]
const COUNTRY_MIX: readonly [string, number][] = [
  ['TR', 0.8],
  ['DE', 0.07],
  ['NL', 0.03],
  ['AZ', 0.03],
  ['GB', 0.02],
  ['US', 0.02],
  ['FR', 0.015],
  ['AT', 0.015],
]
/** İstanbul saatine göre oturum başlangıç saati ağırlıkları (0–23) */
const HOUR_WEIGHTS = [
  0.6, 0.3, 0.15, 0.1, 0.1, 0.1, 0.2, 0.4, 0.6, 0.7, 0.8, 0.9, 1, 1, 1, 1.1, 1.3, 1.6, 2.2, 2.9, 3.4, 3.4, 2.6, 1.4,
]
/** Kaç saniyede bir "Video Progress" olayı */
const PROGRESS_EVERY_SEC = 600

/** mulberry32: küçük, hızlı, tohumlu üreteç */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickWeighted<T>(rng: () => number, items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((a, [, w]) => a + w, 0)
  let r = rng() * total
  for (const [v, w] of items) {
    r -= w
    if (r <= 0) return v
  }
  return items[items.length - 1]![0]
}
function normal(rng: () => number): number {
  const u = Math.max(1e-12, rng())
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng())
}
function poisson(rng: () => number, lambda: number): number {
  const l = Math.exp(-lambda)
  let k = 0
  let p = 1
  do {
    k++
    p *= rng()
  } while (p > l && k < 50)
  return k - 1
}
const hex = (rng: () => number, n: number) => {
  let s = ''
  for (let i = 0; i < n; i++) s += Math.floor(rng() * 16).toString(16)
  return s
}
/** Videonun süresi: künye; yoksa kimlikten türeyen kararlı tahmin */
function runtimeOf(videoId: number, known: number | null, short: boolean): number {
  if (known && known > 0) return known
  const h = mulberry32(videoId)()
  return Math.round(short ? 240 + h * 660 : 1200 + h * 1800)
}

interface Leaf {
  videoId: number
  runtime: number
}
interface TitleModel {
  title: ContentTitle
  leaves: Leaf[]
  /** İlkörnek başına puan */
  scores: number[]
  pop: number
}

function buildModels(titles: readonly ContentTitle[]): TitleModel[] {
  return [...titles]
    .sort((a, b) => a.videoId - b.videoId)
    .map((t) => {
      const short = t.genres.includes('kisa-film')
      const leaves: Leaf[] =
        t.type === 'MOVIE'
          ? [{ videoId: t.videoId, runtime: runtimeOf(t.videoId, t.runtimeSec, short) }]
          : t.seasons.flatMap((s) =>
              s.episodes.map((e) => ({ videoId: e.videoId, runtime: runtimeOf(e.videoId, e.runtimeSec, short) })),
            )
      const scores = ARCHETYPES.map(
        (a) =>
          t.genres.reduce((x, g) => x + (a.genres[g] ?? 0), 0) +
          0.5 * t.moods.reduce((x, m) => x + (a.moods[m] ?? 0), 0),
      )
      return { title: t, leaves, scores, pop: t.popularity / 100 }
    })
    .filter((m) => m.leaves.length > 0)
}

const DAY_MS = 86_400_000

/**
 * Satırları (her biri '\n' ile biten JSON) izleyici izleyici üretir. Uzun üretimde olay döngüsünü bırakır.
 * `shouldStop` true dönerse üretim erken biter.
 */
export async function* generateSyntheticExport(
  titles: readonly ContentTitle[],
  opts: SyntheticOptions,
  shouldStop: () => boolean = () => false,
): AsyncGenerator<string> {
  const models = buildModels(titles)
  if (!models.length) return
  const viewers = Math.max(1, Math.min(SYNTHETIC_LIMITS.maxViewers, Math.floor(opts.viewers)))
  const days = Math.max(1, Math.min(SYNTHETIC_LIMITS.maxDays, Math.floor(opts.days)))
  const endMs = Date.parse(`${opts.end}T00:00:00Z`)
  if (!Number.isFinite(endMs)) throw new Error(`Geçersiz bitiş günü: ${opts.end}`)
  // İstanbul gece yarısı = UTC 21:00 (önceki gün)
  const firstDayStart = endMs - (days - 1) * DAY_MS - 3 * 3_600_000
  const archetypeMix = ARCHETYPES.map((a, i) => [i, a.share] as const)
  const hourMix = HOUR_WEIGHTS.map((w, h) => [h, w] as const)

  for (let vi = 0; vi < viewers; vi++) {
    if (shouldStop()) return
    const rng = mulberry32((opts.seed * 1_000_003 + vi * 7919) >>> 0)
    const distinct = `sentetik-${opts.seed}-${String(vi).padStart(6, '0')}`
    const primary = pickWeighted(rng, archetypeMix)
    const weights = ARCHETYPES.map(() => 0)
    if (rng() < 0.35) {
      let secondary = pickWeighted(rng, archetypeMix)
      if (secondary === primary) secondary = (primary + 1) % ARCHETYPES.length
      weights[primary] = 0.7
      weights[secondary] = 0.3
    } else weights[primary] = 1
    // İzleyici × başlık tercihi
    const pref = models.map((m) => {
      const taste = m.scores.reduce((x, s, i) => x + s * weights[i]!, 0)
      return 2.0 * taste + 1.3 * m.pop + 0.5 * normal(rng)
    })
    const maxPref = Math.max(...pref)
    const expw = pref.map((p) => Math.exp(p - maxPref))
    const sorted = [...pref].sort((a, b) => a - b)
    const rankOf = (p: number) => sorted.indexOf(p) / Math.max(1, sorted.length - 1)
    const titleMix = models.map((_, i) => [i, expw[i]!] as const)
    const devices = pickWeighted(rng, DEVICE_MIX)
    const country = pickWeighted(rng, COUNTRY_MIX)
    const rate = Math.min(3, Math.max(0.03, Math.exp(Math.log(0.25) + 0.8 * normal(rng))))
    const startDay = Math.floor(rng() * rng() * days * 0.4)
    const nextEpisode = new Map<number, number>()
    const inList = new Set<number>()
    const out: string[] = []
    const emit = (event: string, time: number, props: Record<string, unknown>) => {
      out.push(
        JSON.stringify({
          event,
          properties: {
            time: Math.floor(time),
            distinct_id: distinct,
            $insert_id: hex(rng, 32),
            platform: devices[0] === 'Web' || rng() < 0.85 ? devices[0] : devices[Math.floor(rng() * devices.length)],
            mp_country_code: country,
            synthetic: true,
            ...props,
          },
        }),
      )
    }

    for (let d = startDay; d < days; d++) {
      const sessions = poisson(rng, rate)
      for (let si = 0; si < sessions; si++) {
        let t = (firstDayStart + d * DAY_MS) / 1000 + pickWeighted(rng, hourMix) * 3600 + rng() * 3600
        if (rng() < 0.03) emit('App Open', t - 30, {})
        const ti = pickWeighted(rng, titleMix)
        const m = models[ti]!
        const unknown = rng() < 0.003
        let leafIdx = 0
        if (m.title.type === 'SHOW') leafIdx = Math.min(m.leaves.length - 1, nextEpisode.get(ti) ?? 0)
        const leaf = m.leaves[leafIdx]!
        const contentId = unknown ? `eski-icerik-${1 + Math.floor(rng() * 12)}` : String(leaf.videoId)
        const affinity = rankOf(pref[ti]!)
        if (rng() < 0.04) {
          const words = m.title.title.toLocaleLowerCase('tr-TR').split(/\s+/)
          emit('Search', t - 60, { search_query: words.slice(0, 1 + Math.floor(rng() * 2)).join(' ') })
        }
        if (rng() < 0.5) emit('Content Impression', t - 20, { content_id: contentId })
        if (rng() < 0.5) emit('Content Click', t - 10, { content_id: contentId })
        emit('Video Start', t, { content_id: contentId, position: 0, duration: leaf.runtime })
        // İzleme oranı: ilgiye bağlı tamamlama, erken bırakma, ara değerler
        const completeP = 0.15 + 0.65 * affinity
        let fraction: number
        if (rng() < completeP) fraction = 0.93 + 0.07 * rng()
        else if (rng() < 0.3) fraction = 0.02 + 0.08 * rng()
        else fraction = 0.1 + 0.8 * rng()
        const watched = Math.round(leaf.runtime * fraction)
        let pos = 0
        while (watched - pos > PROGRESS_EVERY_SEC) {
          pos += PROGRESS_EVERY_SEC
          emit('Video Progress', t + pos, {
            content_id: contentId,
            watched_seconds: PROGRESS_EVERY_SEC,
            position: pos,
            duration: leaf.runtime,
          })
        }
        const completed = fraction >= 0.93
        emit('Video Stop', t + watched, {
          content_id: contentId,
          watched_seconds: watched - pos,
          position: watched,
          duration: leaf.runtime,
          completed,
        })
        t += watched + 5
        if (m.title.type === 'SHOW' && completed) nextEpisode.set(ti, leafIdx + 1)
        if (rng() < 0.05) {
          const r =
            affinity > 0.75
              ? rng() < 0.35
                ? 'thumbs_way_up'
                : 'thumbs_up'
              : affinity < 0.3
                ? 'thumbs_down'
                : 'thumbs_up'
          emit('Content Rated', t, { content_id: contentId, rating: r })
        }
        if (!unknown && affinity > 0.6 && !inList.has(ti) && rng() < 0.04) {
          inList.add(ti)
          emit('My List Add', t + 2, { content_id: String(m.title.videoId) })
        } else if (inList.has(ti) && completed && rng() < 0.3) {
          inList.delete(ti)
          emit('My List Remove', t + 2, { content_id: String(m.title.videoId) })
        }
      }
    }
    if (out.length) yield `${out.join('\n')}\n`
    if (vi % 50 === 49) await yieldLoop()
  }
}

/** Bugünün İstanbul günü ('YYYY-MM-DD') — varsayılan bitiş günü. */
export function istanbulToday(now = Date.now()): string {
  return new Date(now + 3 * 3_600_000).toISOString().slice(0, 10)
}
