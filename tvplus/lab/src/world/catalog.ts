/**
 * Yer gerçeği dünyasının kataloğu: TV+ benzeri SENTETİK bir servis (dizi, film, canlı kanal, spor).
 * Örnek uygulamanın kataloğundan bilerek farklıdır: gerçek Mixpanel verisindeki içerik kimlikleri de örnek
 * uygulamanın kataloğuyla eşleşmez; lab bu durumu katalog köprüsüyle çözer.
 */
import { mulberry32, type Rng } from '../core/rng'

export const WORLD_GENRES = [
  'Yerli Dizi',
  'Dram',
  'Komedi',
  'Aksiyon',
  'Gerilim',
  'Romantik',
  'Bilim Kurgu',
  'Korku',
  'Belgesel',
  'Yaşam',
  'Tarih',
  'Çocuk',
  'Aile',
  'Animasyon',
  'Spor',
  'Haber',
] as const
export type WorldGenre = (typeof WORLD_GENRES)[number]

export interface WorldEpisode {
  id: string
  season: number
  episode: number
  durSec: number
  /** Yayına girdiği gün dizini (pencere başından; negatif → pencereden önce) */
  releaseDay: number
}
export interface WorldTitle {
  /** Başlık dizini */
  idx: number
  kind: 'series' | 'movie' | 'channel'
  /** Film / kanal içerik kimliği; dizide dizi kimliği */
  id: string
  name: string
  genres: WorldGenre[]
  /** 0–1 popülerlik */
  pop: number
  durSec: number
  episodes: WorldEpisode[]
  releaseDay: number
  /** Kanal: spor kanalı mı */
  sport?: boolean
}

const ADJ = [
  'Sessiz',
  'Kırık',
  'Uzak',
  'Son',
  'Gizli',
  'Mavi',
  'Kayıp',
  'Yeni',
  'Eski',
  'Derin',
  'Soğuk',
  'Sıcak',
  'Kara',
  'Altın',
  'Yalnız',
  'Büyük',
  'Küçük',
  'Yarım',
  'Sonsuz',
  'İnce',
]
const NOUN = [
  'Liman',
  'Aynalar',
  'Rüzgâr',
  'Sokak',
  'Köprü',
  'Deniz',
  'Gece',
  'Yol',
  'Bahçe',
  'Şehir',
  'Mektup',
  'Ada',
  'Dağlar',
  'Nehir',
  'Yıldız',
  'Ev',
  'Kıyı',
  'Orman',
  'Saat',
  'Hikâye',
]

function pickGenres(rng: Rng, primary: WorldGenre[], extra: WorldGenre[]): WorldGenre[] {
  const g: WorldGenre[] = [primary[Math.floor(rng() * primary.length)]]
  if (rng() < 0.6) {
    const e = extra[Math.floor(rng() * extra.length)]
    if (!g.includes(e)) g.push(e)
  }
  return g
}

export interface WorldCatalog {
  titles: WorldTitle[]
  series: WorldTitle[]
  movies: WorldTitle[]
  channels: WorldTitle[]
}

/** Kataloğu tohumdan kurar. `days`: pencere uzunluğu (haftalık bölümü çıkan diziler için). */
export function buildWorldCatalog(seed: number, days: number): WorldCatalog {
  const rng = mulberry32((seed ^ 0x5bd1e995) >>> 0)
  const titles: WorldTitle[] = []
  const used = new Set<string>()
  const name = (): string => {
    for (let k = 0; k < 50; k++) {
      const n = `${ADJ[Math.floor(rng() * ADJ.length)]} ${NOUN[Math.floor(rng() * NOUN.length)]}`
      if (!used.has(n)) {
        used.add(n)
        return n
      }
    }
    const n = `Yapım ${used.size + 1}`
    used.add(n)
    return n
  }
  const seriesGenres: WorldGenre[] = ['Yerli Dizi', 'Dram', 'Gerilim', 'Komedi', 'Çocuk', 'Belgesel', 'Bilim Kurgu']
  const movieGenres: WorldGenre[] = [
    'Aksiyon',
    'Komedi',
    'Dram',
    'Gerilim',
    'Bilim Kurgu',
    'Korku',
    'Romantik',
    'Aile',
    'Animasyon',
    'Belgesel',
  ]
  const extras: WorldGenre[] = ['Dram', 'Romantik', 'Aile', 'Tarih', 'Yaşam', 'Gerilim', 'Komedi']

  // Diziler: ilk 6'sı "sürükleyici" (çok popüler); 4'ünün bölümleri pencere içinde haftalık çıkar
  const nSeries = 64
  for (let s = 0; s < nSeries; s++) {
    const tentpole = s < 6
    const weekly = s >= 2 && s < 6
    const seasons = tentpole ? 1 + Math.floor(rng() * 2) : 1 + Math.floor(rng() * 3)
    const perSeason = tentpole ? 10 + Math.floor(rng() * 8) : 6 + Math.floor(rng() * 10)
    const kids = !tentpole && rng() < 0.14
    const genres: WorldGenre[] = kids
      ? ['Çocuk', 'Animasyon']
      : tentpole
        ? ['Yerli Dizi', rng() < 0.5 ? 'Dram' : 'Gerilim']
        : pickGenres(rng, seriesGenres, extras)
    const durBase = kids ? 660 + Math.floor(rng() * 600) : 2400 + Math.floor(rng() * 3000)
    const episodes: WorldEpisode[] = []
    const total = seasons * perSeason
    let n = 0
    for (let se = 1; se <= seasons; se++) {
      for (let ep = 1; ep <= perSeason; ep++) {
        n++
        // Haftalık dizide son bölümler pencere içinde çıkar; son bölüm pencere bitmeden ~3 hafta önce
        const releaseDay = weekly ? days - 21 - (total - n) * 7 : -400 + Math.floor(rng() * 300)
        episodes.push({
          id: `cnt_${10_000 + s * 100 + n}`,
          season: se,
          episode: ep,
          durSec: durBase + Math.floor(rng() * 240) - 120,
          releaseDay,
        })
      }
    }
    titles.push({
      idx: titles.length,
      kind: 'series',
      id: `srs_${200 + s}`,
      name: name(),
      genres,
      pop: tentpole ? 0.75 + 0.25 * rng() : Math.pow(rng(), 2.2) * 0.7,
      durSec: durBase,
      episodes,
      releaseDay: episodes[0].releaseDay,
    })
  }
  // Filmler: bir kısmı pencere içinde eklenir (katalog tazeliği)
  const nMovies = 260
  for (let m = 0; m < nMovies; m++) {
    const fresh = rng() < 0.12
    const kids = rng() < 0.1
    const genres: WorldGenre[] = kids ? ['Aile', 'Animasyon'] : pickGenres(rng, movieGenres, extras)
    titles.push({
      idx: titles.length,
      kind: 'movie',
      id: `cnt_${50_000 + m}`,
      name: name(),
      genres,
      pop: Math.pow(rng(), 2.6),
      durSec: 4800 + Math.floor(rng() * 3600),
      episodes: [],
      releaseDay: fresh ? Math.floor(rng() * days) : -600 + Math.floor(rng() * 550),
    })
  }
  // Canlı kanallar
  const channels: [string, WorldGenre, boolean, number][] = [
    ['Ulusal 1', 'Yerli Dizi', false, 0.9],
    ['Ulusal 2', 'Yerli Dizi', false, 0.8],
    ['Ulusal 3', 'Yaşam', false, 0.6],
    ['Haber 24', 'Haber', false, 0.7],
    ['Haber Merkez', 'Haber', false, 0.5],
    ['Ekonomi TV', 'Haber', false, 0.25],
    ['Spor 1', 'Spor', true, 0.95],
    ['Spor 2', 'Spor', true, 0.7],
    ['Spor Extra', 'Spor', true, 0.45],
    ['Sinema TV', 'Aksiyon', false, 0.5],
    ['Belgesel Kanalı', 'Belgesel', false, 0.4],
    ['Çocuk TV', 'Çocuk', false, 0.5],
    ['Minik TV', 'Çocuk', false, 0.3],
    ['Müzik TV', 'Yaşam', false, 0.2],
  ]
  channels.forEach(([n, g, sport, pop], c) => {
    titles.push({
      idx: titles.length,
      kind: 'channel',
      id: `ch_${100 + c}`,
      name: n,
      genres: [g],
      pop,
      durSec: 0,
      episodes: [],
      releaseDay: -1000,
      sport,
    })
  })
  return {
    titles,
    series: titles.filter((t) => t.kind === 'series'),
    movies: titles.filter((t) => t.kind === 'movie'),
    channels: titles.filter((t) => t.kind === 'channel'),
  }
}
