/**
 * Katalog köprüsü: lab'ın başlık tablosu (Mixpanel verisindeki içerikler) → örnek uygulamanın yükleyebildiği bir
 * içerik klasörü (`lab klasörü/sim/katalog/`). Böylece simülasyon, uygulamanın KENDİ kodunu (ana sayfa satırları,
 * tahmin modeli, Top 10, benzerler) sizin kataloğunuzun iskeleti üstünde çalıştırır: gerçek başlık sayısı, gerçek
 * popülerlik dağılımı, gerçek tür karması, gerçek izleme geçmişleri.
 *
 * Yalnız isteğe bağlı içerik (film, dizi) köprülenir; canlı kanallar simülasyonda uygulamanın ana sayfasından
 * bağımsız bir izleme eğilimi olarak modellenir. Köprülenen başlıklar oynatılmaz: kaynakları yer tutucudur.
 * Klasör yereldir ve depoya girmez.
 */
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { ContentHomeLayout, ContentTitle } from '../../../shared/content-schema'
import { zHomeLayout, zTitle } from '../../../shared/content-schema'
import { GENRES, type GenreKey } from '../../../shared/taxonomy'
import { norm } from '../../../shared/text'
import { loadTable } from '../core/columns'
import { dayStr } from '../core/format'
import { readJson, writeJson, type Lab } from '../core/lab'
import type { BuildMeta, TitleInfo } from '../data/build'

/** Türkçe / İngilizce tür adları → uygulamanın tür anahtarı (norm() sonrası anahtar sözcüklerle) */
const GENRE_WORDS: [RegExp, GenreKey][] = [
  [/\b(aksiyon|action)\b/, 'aksiyon'],
  [/\b(macera|adventure)\b/, 'macera'],
  [/\b(animasyon|animation|anime|cizgi)\b/, 'animasyon'],
  [/\b(bilim kurgu|bilimkurgu|sci fi|scifi|science fiction)\b/, 'bilim-kurgu'],
  [/\b(fantastik|fantasy)\b/, 'fantastik'],
  [/\b(komedi|comedy|sitcom)\b/, 'komedi'],
  [/\b(gerilim|thriller|gizem|mystery)\b/, 'gerilim'],
  [/\b(korku|horror)\b/, 'korku'],
  [/\b(suc|crime|polisiye)\b/, 'suc'],
  [/\b(romantik|romance|ask)\b/, 'romantik'],
  [/\b(belgesel|documentary|docu)\b/, 'belgesel'],
  [/\b(doga|nature|bilim|science)\b/, 'doga-bilim'],
  [/\b(tarih|history|historical|donem)\b/, 'tarih'],
  [/\b(muzik|music|konser)\b/, 'muzik'],
  [/\b(spor|sport|sports|futbol|basketbol)\b/, 'spor'],
  [/\b(cocuk|kids|children|aile|family)\b/, 'cocuk-aile'],
  [/\b(klasik|classic)\b/, 'klasik'],
  [/\b(kisa film|short)\b/, 'kisa-film'],
  [/\b(yerli|turk|turkish)\b/, 'yerli'],
  [/\b(haber|news|guncel)\b/, 'haber'],
  [/\b(yasam|lifestyle|life|yemek|gezi|kultur|magazin|eglence|reality|yarisma)\b/, 'yasam'],
  [/\b(teknoloji|technology|tech)\b/, 'teknoloji'],
  [/\b(dram|drama)\b/, 'dram'],
]

export function mapGenre(name: string): GenreKey | null {
  const n = norm(name)
  for (const [re, key] of GENRE_WORDS) if (re.test(n)) return key
  return null
}

export interface BridgeTitle {
  /** Lab başlık dizini */
  tid: number
  /** Uygulamadaki üst başlık kimliği */
  videoId: number
  type: 'MOVIE' | 'SHOW'
  /** Oynatılabilir yaprakların kimlikleri (film: kendisi; dizi: bölümler sırayla) ve süreleri (sn) */
  leaves: number[]
  runtimes: number[]
  genres: GenreKey[]
  popularity: number
}

export interface BridgeMap {
  dataRev: string
  dir: string
  titles: BridgeTitle[]
  /** Uygulama tür anahtarı → başlık sayısı */
  genres: Record<string, number>
  /** Uygulama türüne çevrilemeyen kaynak tür adları (hepsi 'dram' sayıldı) */
  unmappedGenres: string[]
  skipped: { live: number; unwatched: number; overLimit: number }
  /** Köprülenen başlıkların, köprülenebilir (isteğe bağlı) izleme süresindeki payı (0–1) */
  coverage?: number
}

/** Varsayılan başlık sınırı: ana sayfa kurulumu katalog boyutuyla doğrusal yavaşlar; kuyruk başlıklar az şey katar. */
export const DEFAULT_MAX_TITLES = 1500

/**
 * Varsayılan ikiz sayısı: küçük katalogda 1500; katalog büyüdükçe (kurulum süresi arttığı için) 600'e kadar iner.
 * Kullanıcı `--ikiz` ile her zaman kendi sayısını verebilir.
 */
export const defaultTwins = (titles: number): number =>
  titles <= 500 ? 1500 : Math.max(600, Math.round((1500 * 500) / titles / 50) * 50)

const BASE_ID = 70_000_000
const PLACEHOLDER_SOURCE = { type: 'YOUTUBE' as const, videoId: 'aaaaaaaaaaa' }

export const bridgeDir = (lab: Lab): string => join(lab.simDir, 'katalog')
export const bridgeFile = (lab: Lab): string => join(lab.simDir, 'kopru.json')

export function loadBridge(lab: Lab): BridgeMap | null {
  return readJson<BridgeMap>(bridgeFile(lab))
}

export function buildBridge(lab: Lab, opts: { maxTitles?: number } = {}): BridgeMap {
  const meta = readJson<BuildMeta>(join(lab.tableDir, 'meta.json'))
  const info = readJson<TitleInfo[]>(join(lab.tableDir, 'baslik.json'))
  if (!meta || !info) throw new Error('Tablolar kurulmamış. Önce: npm run lab -- kur')
  const t = loadTable(lab.tableDir, 'baslik')
  const klass = t.cols.klass
  const viewers = t.cols.viewers
  const firstDay = t.cols.first_day
  const durSec = t.cols.dur_sec
  const maxTitles = Math.max(20, Math.min(19_000, opts.maxTitles ?? DEFAULT_MAX_TITLES))
  const watchSec = t.cols.watch_sec
  const skipped = { live: 0, unwatched: 0, overLimit: 0 }
  const cand: number[] = []
  for (let tid = 1; tid < t.rows; tid++) {
    // 3 CANLI · 4 SPOR · 5 KLIP köprülenmez
    if (klass[tid] === 3 || klass[tid] === 4 || klass[tid] === 5) {
      skipped.live++
      continue
    }
    if (viewers[tid] === 0) {
      skipped.unwatched++
      continue
    }
    cand.push(tid)
  }
  cand.sort((a, b) => viewers[b] - viewers[a] || a - b)
  skipped.overLimit = Math.max(0, cand.length - maxTitles)
  const picked = cand.slice(0, maxTitles)
  let allWatch = 0
  let pickedWatch = 0
  cand.forEach((tid, i) => {
    allWatch += watchSec[tid]
    if (i < maxTitles) pickedWatch += watchSec[tid]
  })
  const coverage = allWatch > 0 ? pickedWatch / allWatch : 1
  const unmapped = new Set<string>()
  const genreCount: Record<string, number> = {}
  const titles: BridgeTitle[] = []
  const content: ContentTitle[] = []
  picked.forEach((tid, rank) => {
    const ti = info[tid]
    const videoId = BASE_ID + rank * 1000
    const genres: GenreKey[] = []
    for (const g of ti.genres) {
      const key = mapGenre(g)
      if (!key) unmapped.add(g)
      else if (!genres.includes(key)) genres.push(key)
    }
    if (!genres.length) genres.push('dram')
    for (const g of genres) genreCount[g] = (genreCount[g] ?? 0) + 1
    const popularity = Math.round(5 + 95 * Math.pow(1 - rank / Math.max(1, picked.length), 1.5))
    const isShow = klass[tid] === 2 && (ti.episodes?.length ?? 0) > 0
    const name = lab.settings.icerikAdlari && ti.title ? ti.title.slice(0, 120) : `Başlık ${rank + 1}`
    const addedAt = firstDay[tid] > meta.dayMin + 7 ? dayStr(firstDay[tid]) : '2020-01-01'
    const base = {
      videoId,
      slug: `kopru-${rank + 1}`,
      title: name,
      year: 2020,
      synopsis: 'Laboratuvar katalog köprüsünden gelen başlık; künyesi izleme verisinden türetildi.',
      shortSynopsis: 'Katalog köprüsü başlığı',
      genres: genres.slice(0, 4),
      maturity: { rating: 'GENEL' as const, reasons: [] },
      kids: genres.includes('cocuk-aile'),
      license: { name: 'Lab', attribution: 'Katalog köprüsü (oynatılmaz)' },
      availability: { addedAt },
      popularity,
      acquisition: 'LICENSED' as const,
    }
    let leaves: number[]
    let runtimes: number[]
    let raw: unknown
    if (isShow) {
      const eps = [...(ti.episodes ?? [])]
        .sort((a, b) => a.s - b.s || a.e - b.e || (a.id < b.id ? -1 : 1))
        .slice(0, 900)
      const seasons = new Map<number, typeof eps>()
      for (const e of eps) {
        const list = seasons.get(e.s) ?? []
        list.push(e)
        seasons.set(e.s, list)
      }
      leaves = []
      runtimes = []
      let k = 0
      const seasonList = [...seasons.keys()]
        .sort((a, b) => a - b)
        .map((sn, si) => ({
          number: si + 1,
          episodes: (seasons.get(sn) ?? []).map((e, ei) => {
            k++
            leaves.push(videoId + k)
            const rt = Math.max(60, Math.round(e.dur > 0 ? e.dur : durSec[tid] > 0 ? durSec[tid] : 2400))
            runtimes.push(rt)
            return {
              videoId: videoId + k,
              number: ei + 1,
              title: `${ei + 1}. Bölüm`,
              synopsis: 'Katalog köprüsü bölümü.',
              runtimeSec: rt,
              sources: [PLACEHOLDER_SOURCE],
            }
          }),
        }))
      raw = { ...base, type: 'SHOW', seasons: seasonList }
    } else {
      const rt = Math.max(60, Math.round(durSec[tid] > 0 ? durSec[tid] : 5400))
      leaves = [videoId]
      runtimes = [rt]
      raw = { ...base, type: 'MOVIE', runtimeSec: rt, sources: [PLACEHOLDER_SOURCE] }
    }
    const parsed = zTitle.safeParse(raw)
    if (!parsed.success) return
    content.push(parsed.data)
    titles.push({
      tid,
      videoId,
      type: isShow ? 'SHOW' : 'MOVIE',
      leaves,
      runtimes,
      genres: genres.slice(0, 4),
      popularity,
    })
  })
  if (!titles.length) throw new Error('Köprülenecek isteğe bağlı içerik (film / dizi) bulunamadı.')

  const dir = bridgeDir(lab)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'titles'), { recursive: true })
  writeJson(join(dir, 'titles', 'kopru.json'), content, false)
  // Ana sayfa düzeni: en popüler başlıklar vitrinde; en kalabalık türler satır olur
  const genreRows = Object.entries(genreCount)
    .filter(([g, n]) => n >= 6 && g in GENRES)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([g]) => ({ kind: 'genre' as const, genre: g as GenreKey }))
  const layout: ContentHomeLayout = zHomeLayout.parse({
    billboard: titles.slice(0, 6).map((x) => x.videoId),
    rows: genreRows,
  })
  writeJson(join(dir, 'home-layout.json'), layout, false)
  for (const f of [
    'channels.json',
    'epg.json',
    'collections.json',
    'notifications.json',
    'interstitials.json',
    'experiments.json',
  ])
    writeJson(join(dir, f), [], false)
  const map: BridgeMap = {
    dataRev: meta.dataRev,
    dir,
    titles,
    genres: genreCount,
    unmappedGenres: [...unmapped].slice(0, 40),
    skipped,
    coverage,
  }
  writeJson(bridgeFile(lab), map, false)
  return map
}
