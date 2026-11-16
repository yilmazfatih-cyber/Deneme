/**
 * Kurma: olay deposu → analiz tabloları. Her kullanıcının olayları zaman sırasıyla bir kez taranır; bellekte yalnız
 * o anki kova ve büyüyen kolon tabloları durur.
 *
 * Tablolar (tablo/):
 *   kullanici  kullanıcı başına satır — toplamlar, baskın boyut değerleri, gün/oturum/özet satır aralıkları
 *   gun        kullanıcı × gün (yalnız olayı olan günler) — o günün deneyimi: izleme, tamamlama, hata, takılma,
 *              sonuçsuz arama, boş oturum, yeni başlık, biten dizi, abonelik olayları
 *   oturum     oturum başına satır
 *   izleme     kullanıcı × başlık özeti (dizi bölümleri diziye toplanır)
 *   baslik     başlık başına satır + adlar (baslik.json)
 *   maruziyet  kullanıcı × deney → kol (ilk maruziyet)
 *
 * Tanımlar
 *   gün        yerel gün (eşlemedeki saat dilimi; varsayılan İstanbul)
 *   oturum     olaysız `sessionGapMin` dakikadan sonra yeni oturum; oynatma sürerken boşluk oturumu bölmez
 *   oynatma    PLAY_START ile açılır (ya da başlangıcı olmayan ilk ilerleme/bitiş olayıyla), PLAY_END, yeni bir
 *              PLAY_START ya da oturum sonuyla kapanır; başladığı güne ve oturuma yazılır
 *   izlenen    eşlemedeki `watched` kipine göre (bkz. mapping.ts); oynatma başına en çok 6 saat
 *   boş oturum hiç oynatma içermeyen oturum
 *   etkin gün  eşlemedeki `activity` türlerinden en az bir olay (varsayılan: izleme)
 */
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { saveTable, TableBuilder, type ColumnMeta } from '../core/columns'
import { writeJson, type Lab } from '../core/lab'
import {
  CONTENT_CLASSES,
  DEVICE_CLASSES,
  FLAG_COMPLETED,
  FLAG_EMPTY,
  FLAG_LIVE,
  FLAG_NO_V1,
  K,
  KINDS,
  type Kind,
} from './events'
import { loadManifest, readBucket, StoreDictionaries } from './store'

export const SUB_SUBSCRIBE = 1
export const SUB_RENEW = 2
export const SUB_CANCEL = 4
export const SUB_EXPIRE = 8
export const SUB_PAYMENT_FAIL = 16
export const SUB_SIGNUP = 32

const MAX_PLAY_SEC = 6 * 3600
const DAY = 86_400

/** Başlık sınıfı: içerik sınıflarından türetilir (bölümler diziye toplanır) */
export const TITLE_CLASSES = ['bilinmiyor', 'FILM', 'DIZI', 'CANLI', 'SPOR', 'KLIP', 'DIGER'] as const

export interface BuildProfile {
  /** Oturum başlangıcı: yerel saat (0–23) */
  hours: number[]
  /** Oturum başlangıcı: haftanın günü (0 = Pazartesi) */
  weekdays: number[]
  /** Oturum başına oynatma sayısı (0 … 10+) */
  playsPerSession: number[]
  /** İzlenen oran (izlenen / süre), 20 eşit dilim — canlı olmayan, süresi bilinen oynatmalar */
  watchFraction: number[]
  /** Oynatma başına dakika: [<1, 1–5, 5–15, 15–30, 30–60, 60–120, 120+] */
  playMinutes: number[]
}

export interface BuildMeta {
  dataRev: string
  builtAt: string
  users: number
  events: number
  /** Veri penceresi (yerel gün numaraları, dahil) */
  dayMin: number
  dayMax: number
  tzMinutes: number
  sessionGapMin: number
  activity: Kind[]
  dimNames: string[]
  synthetic: boolean
  sample: number
  kinds: Record<string, number>
  contents: number
  titles: number
  userDays: number
  sessions: number
  facts: number
  profile: BuildProfile
  seconds: number
}

const USER_COLS: ColumnMeta[] = [
  { name: 'uid_hi', type: 'u32' },
  { name: 'uid_lo', type: 'u32' },
  { name: 'first_ts', type: 'u32' },
  { name: 'last_ts', type: 'u32' },
  { name: 'first_day', type: 'i32' },
  { name: 'last_day', type: 'i32' },
  { name: 'first_active_day', type: 'i32' },
  { name: 'last_active_day', type: 'i32' },
  { name: 'events', type: 'u32' },
  { name: 'days', type: 'u16' },
  { name: 'active_days', type: 'u16' },
  { name: 'sessions', type: 'u32' },
  { name: 'plays', type: 'u32' },
  { name: 'watch_sec', type: 'f32' },
  { name: 'completions', type: 'u32' },
  { name: 'titles', type: 'u32' },
  { name: 'errors', type: 'u32' },
  { name: 'buffers', type: 'u32' },
  { name: 'searches', type: 'u32' },
  { name: 'search_fails', type: 'u32' },
  { name: 'bounces', type: 'u32' },
  { name: 'signup_day', type: 'i32' },
  { name: 'cancel_day', type: 'i32' },
  { name: 'day_from', type: 'u32' },
  { name: 'day_to', type: 'u32' },
  { name: 'sess_from', type: 'u32' },
  { name: 'sess_to', type: 'u32' },
  { name: 'fact_from', type: 'u32' },
  { name: 'fact_to', type: 'u32' },
]

const DAY_COLS: ColumnMeta[] = [
  { name: 'uid', type: 'u32' },
  { name: 'day', type: 'i32' },
  { name: 'active', type: 'u8' },
  { name: 'sessions', type: 'u16' },
  { name: 'events', type: 'u16' },
  { name: 'plays', type: 'u16' },
  { name: 'watch_sec', type: 'f32' },
  { name: 'completions', type: 'u16' },
  { name: 'titles', type: 'u16' },
  { name: 'new_titles', type: 'u16' },
  { name: 'live_sec', type: 'f32' },
  { name: 'live_plays', type: 'u16' },
  { name: 'prime_sec', type: 'f32' },
  { name: 'errors', type: 'u16' },
  { name: 'app_errors', type: 'u16' },
  { name: 'buffers', type: 'u16' },
  { name: 'buffer_sec', type: 'f32' },
  { name: 'searches', type: 'u16' },
  { name: 'search_fails', type: 'u16' },
  { name: 'bounces', type: 'u16' },
  { name: 'impressions', type: 'u16' },
  { name: 'clicks', type: 'u16' },
  { name: 'list_adds', type: 'u16' },
  { name: 'notif_opens', type: 'u16' },
  { name: 'series_finished', type: 'u8' },
  { name: 'sub', type: 'u8' },
  { name: 'device', type: 'u8', dict: [...DEVICE_CLASSES] },
  { name: 'main_tid', type: 'u32' },
  { name: 'main_sec', type: 'f32' },
  { name: 'first_delay', type: 'f32' },
  /** O günün baskın boyut demeti (demet.json ile çözülür: günün sürümü, planı …) */
  { name: 'tuple', type: 'u32' },
]

const SESSION_COLS: ColumnMeta[] = [
  { name: 'uid', type: 'u32' },
  { name: 'start_ts', type: 'u32' },
  { name: 'day', type: 'i32' },
  { name: 'dur_sec', type: 'f32' },
  { name: 'events', type: 'u16' },
  { name: 'plays', type: 'u16' },
  { name: 'watch_sec', type: 'f32' },
  { name: 'errors', type: 'u16' },
  { name: 'buffers', type: 'u16' },
  { name: 'searches', type: 'u16' },
  { name: 'search_fails', type: 'u16' },
  { name: 'impressions', type: 'u16' },
  { name: 'clicks', type: 'u16' },
  { name: 'device', type: 'u8', dict: [...DEVICE_CLASSES] },
  { name: 'last_kind', type: 'u8', dict: [...KINDS] },
  { name: 'first_delay', type: 'f32' },
]

const FACT_COLS: ColumnMeta[] = [
  { name: 'uid', type: 'u32' },
  { name: 'tid', type: 'u32' },
  { name: 'plays', type: 'u16' },
  { name: 'watch_sec', type: 'f32' },
  { name: 'completions', type: 'u16' },
  { name: 'first_day', type: 'i32' },
  { name: 'last_day', type: 'i32' },
]

const TITLE_COLS: ColumnMeta[] = [
  { name: 'klass', type: 'u8', dict: [...TITLE_CLASSES] },
  { name: 'episodes', type: 'u32' },
  { name: 'dur_sec', type: 'f32' },
  { name: 'plays', type: 'u32' },
  { name: 'viewers', type: 'u32' },
  { name: 'watch_sec', type: 'f64' },
  { name: 'completions', type: 'u32' },
  { name: 'first_day', type: 'i32' },
  { name: 'last_day', type: 'i32' },
  { name: 'genre', type: 'u16' },
]

const EXPOSURE_COLS: ColumnMeta[] = [
  { name: 'uid', type: 'u32' },
  { name: 'exp', type: 'u16' },
  { name: 'variant', type: 'u16' },
  { name: 'ts', type: 'u32' },
  { name: 'day', type: 'i32' },
  { name: 'multi', type: 'u8' },
]

export interface TitleInfo {
  /** Kaynak kimliği: film/kanal için içerik kimliği, dizi için dizi kimliği */
  id: string
  title?: string
  genres: string[]
  /** Dizi: bölümler (kaynak kimliği, sezon, bölüm, süre sn) — katalog köprüsü için */
  episodes?: { id: string; s: number; e: number; dur: number }[]
}

/** Açık oynatma (içerik başına bir tane; eşzamanlı cihazlarda birden çok olabilir) */
interface OpenPlay {
  cid: number
  start: number
  /** Bu oynatmanın kendi son olayının anı */
  last: number
  dur: number
  sum: number
  max: number
  hasV1: boolean
  pos0: number
  pos1: number
  done: boolean
  live: boolean
  dayRow: number
  sessRow: number
  /** Bu oynatmaya ait olay sayısı (1 → yalnız başlangıç görüldü) */
  events: number
  /** Kendisinden sonraki ilk PLAY_START anı (0 → olmadı) */
  nextStart: number
}

interface FactAcc {
  plays: number
  watch: number
  completions: number
  first: number
  last: number
}

export function build(lab: Lab, opts: { onProgress?: (bucket: number, of: number) => void } = {}): BuildMeta {
  const t0 = Date.now()
  const manifest = loadManifest(lab)
  if (!manifest || !manifest.mapping || manifest.events === 0)
    throw new Error('Depo boş. Önce veri alın: npm run lab -- al <dosya> (ya da: npm run lab -- demo)')
  const mapping = manifest.mapping
  const dict = StoreDictionaries.load(lab.storeDir)
  const tzSec = lab.settings.tzDakika * 60
  const gapSec = mapping.sessionGapMin * 60
  const watchMode = mapping.watched
  const threshold = mapping.completionThreshold
  const activity = new Uint8Array(KINDS.length)
  for (const k of mapping.activity) activity[K[k]] = 1

  /* ── Başlık dizini: bölümler dizisine, diğer içerikler kendilerine ── */
  const nC = dict.contents.length
  const titleOf = new Uint32Array(nC)
  const epOrder = new Float64Array(nC)
  const seriesTid = new Map<number, number>()
  const titleInfo: TitleInfo[] = [{ id: '', genres: [] }]
  const titleKlass: number[] = [0]
  const titleEpisodes: number[] = [0]
  const titleMaxOrder: number[] = [0]
  const titleDurSum: number[] = [0]
  const titleDurN: number[] = [0]
  const seriesNames = new Map<number, string[]>()
  const genreDict = new Map<string, number>()
  const genreNames: string[] = ['bilinmiyor']
  const titleGenre: number[] = [0]
  const genreCode = (g: string | undefined): number => {
    if (!g) return 0
    const key = g.trim().toLocaleLowerCase('tr-TR')
    let c = genreDict.get(key)
    if (c === undefined) {
      if (genreNames.length >= 65_000) return 0
      c = genreNames.length
      genreNames.push(g.trim())
      genreDict.set(key, c)
    }
    return c
  }
  for (let cid = 1; cid < nC; cid++) {
    const c = dict.contents[cid]
    let tid: number
    if (c.series > 0) {
      const hit = seriesTid.get(c.series)
      if (hit !== undefined) tid = hit
      else {
        tid = titleInfo.length
        seriesTid.set(c.series, tid)
        titleInfo.push({ id: dict.series.values[c.series], genres: c.genres ?? [] })
        titleKlass.push(2)
        titleEpisodes.push(0)
        titleMaxOrder.push(0)
        titleDurSum.push(0)
        titleDurN.push(0)
        titleGenre.push(genreCode(c.genres?.[0]))
      }
      if (!titleInfo[tid].genres.length && c.genres?.length) {
        titleInfo[tid].genres = c.genres
        titleGenre[tid] = genreCode(c.genres[0])
      }
      epOrder[cid] = (c.season ?? 0) * 100_000 + (c.episode ?? 0)
      if (epOrder[cid] > titleMaxOrder[tid]) titleMaxOrder[tid] = epOrder[cid]
      // Bölümler katalog köprüsü için saklanır; dizinin adı bölüm adlarının ortak başından türetilir
      ;(titleInfo[tid].episodes ??= []).push({ id: c.id, s: c.season ?? 0, e: c.episode ?? 0, dur: c.dur })
      if (c.title) {
        const names = seriesNames.get(tid) ?? []
        if (names.length < 6) names.push(c.title)
        seriesNames.set(tid, names)
      }
    } else {
      tid = titleInfo.length
      titleInfo.push({ id: c.id, title: c.title, genres: c.genres ?? [] })
      // İçerik sınıfı → başlık sınıfı (dizisi bilinmeyen bölüm 'DIZI' sayılır)
      titleKlass.push(c.klass === 2 ? 2 : c.klass)
      titleEpisodes.push(0)
      titleMaxOrder.push(0)
      titleDurSum.push(0)
      titleDurN.push(0)
      titleGenre.push(genreCode(c.genres?.[0]))
    }
    titleOf[cid] = tid
    titleEpisodes[tid]++
    if (c.dur > 0) {
      titleDurSum[tid] += c.dur
      titleDurN[tid]++
    }
  }
  for (const [tid, names] of seriesNames) {
    const name = commonTitle(names)
    if (name) titleInfo[tid].title = name
  }
  const nT = titleInfo.length
  const titlePlays = new Uint32Array(nT)
  const titleViewers = new Uint32Array(nT)
  const titleWatch = new Float64Array(nT)
  const titleCompletions = new Uint32Array(nT)
  const titleFirst = new Int32Array(nT).fill(2 ** 31 - 1)
  const titleLast = new Int32Array(nT).fill(-1)

  /* ── Tablolar ── */
  const dimNames = dict.dimNames
  const nDims = dimNames.length
  const userCols: ColumnMeta[] = [
    ...USER_COLS,
    ...dimNames.map((n, d): ColumnMeta => ({ name: `dim_${n}`, type: 'u16', dict: dict.dims[d].values })),
  ]
  const users = new TableBuilder('kullanici', userCols, 1 << 14)
  const days = new TableBuilder('gun', DAY_COLS, 1 << 16)
  const sessions = new TableBuilder('oturum', SESSION_COLS, 1 << 16)
  const facts = new TableBuilder('izleme', FACT_COLS, 1 << 16)
  const exposures = new TableBuilder('maruziyet', EXPOSURE_COLS, 1024)

  const kindCounts = new Float64Array(KINDS.length)
  const profile: BuildProfile = {
    hours: new Array<number>(24).fill(0),
    weekdays: new Array<number>(7).fill(0),
    playsPerSession: new Array<number>(11).fill(0),
    watchFraction: new Array<number>(20).fill(0),
    playMinutes: new Array<number>(7).fill(0),
  }
  let dayMin = 2 ** 31 - 1
  let dayMax = -1
  let totalEvents = 0

  // Kullanıcı ömürlü çalışma alanları (her kullanıcıda temizlenir)
  const userFacts = new Map<number, FactAcc>()
  const tupleCounts = new Map<number, number>()
  const dayTitles = new Map<number, number>()
  const dayTuples = new Map<number, number>()
  const expSeen = new Map<number, { variant: number; ts: number; multi: number }>()
  const dayDevice = new Float64Array(DEVICE_CLASSES.length)
  const sessDevice = new Float64Array(DEVICE_CLASSES.length)
  const dimTally: Map<number, number>[] = dimNames.map(() => new Map())
  const openPlays = new Map<number, OpenPlay>()
  /** Hesap / abonelik olayları: tür dizini → gün satırındaki `sub` biti (0 → oturum olayı) */
  const ACCOUNT_KIND = new Uint8Array(KINDS.length)
  ACCOUNT_KIND[K.SIGNUP] = SUB_SIGNUP
  ACCOUNT_KIND[K.SUBSCRIBE] = SUB_SUBSCRIBE
  ACCOUNT_KIND[K.RENEW] = SUB_RENEW
  ACCOUNT_KIND[K.CANCEL] = SUB_CANCEL
  ACCOUNT_KIND[K.EXPIRE] = SUB_EXPIRE
  ACCOUNT_KIND[K.PAYMENT_FAIL] = SUB_PAYMENT_FAIL

  for (let b = 0; b < manifest.buckets; b++) {
    opts.onProgress?.(b, manifest.buckets)
    const bv = readBucket(lab, b)
    const w = bv.w
    const f = bv.f
    const order = bv.order
    let i = 0
    while (i < bv.n) {
      const hi = w[order[i] * 8]
      const lo = w[order[i] * 8 + 1]
      let j = i
      while (j < bv.n && w[order[j] * 8] === hi && w[order[j] * 8 + 1] === lo) j++

      /* ── Kullanıcı taraması ── */
      const u = users.addRow()
      const dayFrom = days.rows
      const sessFrom = sessions.rows
      userFacts.clear()
      tupleCounts.clear()
      expSeen.clear()
      let uEvents = 0
      let uPlays = 0
      let uWatch = 0
      let uCompletions = 0
      let uErrors = 0
      let uBuffers = 0
      let uSearches = 0
      let uSearchFails = 0
      let uBounces = 0
      let uActiveDays = 0
      let firstActive = -1
      let lastActive = -1
      let signupDay = -1
      let cancelDay = -1

      let curDay = -1
      let dayRow = -1
      let sessRow = -1
      let sessStart = 0
      let sessFirstPlay = -1
      let lastTs = 0
      let lastKind = 0
      openPlays.clear()

      const finalizeDay = (): void => {
        if (dayRow < 0) return
        let best = 0
        for (let d = 1; d < dayDevice.length; d++)
          if (dayDevice[d] > dayDevice[best] || (best === 0 && dayDevice[d] > 0)) best = d
        days.col('device')[dayRow] = dayDevice[best] > 0 ? best : 0
        let mt = 0
        let ms = 0
        for (const [tid, sec] of dayTitles) {
          if (sec > ms) {
            ms = sec
            mt = tid
          }
        }
        if (ms > days.col('main_sec')[dayRow]) {
          days.col('main_tid')[dayRow] = mt
          days.col('main_sec')[dayRow] = ms
        }
        days.col('titles')[dayRow] = Math.min(65_535, dayTitles.size)
        let bt = 0
        let bn = 0
        for (const [tuple, n] of dayTuples) {
          if (n > bn) {
            bn = n
            bt = tuple
          }
        }
        days.col('tuple')[dayRow] = bt
      }

      /** Oynatmayı kapatır ve başladığı güne / oturuma yazar. `closeTs`: kapanış anı (oturum sonu ya da olay anı). */
      const closePlay = (p: OpenPlay, closeTs: number): void => {
        openPlays.delete(p.cid)
        // Yalnız başlangıç olayı olan oynatma (bitiş / ilerleme göndermeyen kaynak): sonraki başlangıca ya da oturum sonuna dek
        const elapsed =
          p.events > 1
            ? Math.max(0, p.last - p.start)
            : Math.min(p.dur > 0 ? p.dur : 2 * 3600, Math.max(0, (p.nextStart > 0 ? p.nextStart : closeTs) - p.start))
        let watched: number
        const byPos = p.pos1 >= 0 && p.pos0 >= 0 ? Math.max(0, p.pos1 - p.pos0) : p.pos1 >= 0 ? p.pos1 : -1
        if (watchMode === 'delta') watched = p.hasV1 ? p.sum : 0
        else if (watchMode === 'cumulative') watched = p.hasV1 ? p.max : 0
        else if (watchMode === 'position') watched = byPos >= 0 ? byPos : 0
        else if (watchMode === 'timestamps') watched = elapsed
        else if (p.hasV1)
          // auto: değerler toplanır; toplam geçen süreyi belirgin aşıyorsa değerler birikimlidir → en büyüğü
          watched = p.sum > elapsed * 1.5 + 120 && p.max <= elapsed + 120 ? p.max : p.sum
        else if (byPos >= 0 && p.events > 1) watched = byPos
        else watched = elapsed
        if (p.dur > 0 && !p.live) watched = Math.min(watched, p.dur * 1.2)
        watched = Math.min(MAX_PLAY_SEC, Math.max(0, watched))
        const completed = !p.live && (p.done || (p.dur > 0 && watched / p.dur >= threshold))
        const tid = titleOf[p.cid]
        const dr = p.dayRow
        const pc = days.col('plays')
        pc[dr] = Math.min(65_535, pc[dr] + 1)
        days.col('watch_sec')[dr] += watched
        if (completed) days.col('completions')[dr] = Math.min(65_535, days.col('completions')[dr] + 1)
        if (p.live) {
          days.col('live_sec')[dr] += watched
          days.col('live_plays')[dr] = Math.min(65_535, days.col('live_plays')[dr] + 1)
        }
        const hour = Math.floor(((((p.start + tzSec) % DAY) + DAY) % DAY) / 3600)
        if (hour >= 19 && hour <= 23) days.col('prime_sec')[dr] += watched
        if (p.sessRow >= 0) {
          const sp = sessions.col('plays')
          sp[p.sessRow] = Math.min(65_535, sp[p.sessRow] + 1)
          sessions.col('watch_sec')[p.sessRow] += watched
        }
        uPlays++
        uWatch += watched
        if (completed) uCompletions++
        const day = days.col('day')[dr]
        if (tid > 0) {
          let fa = userFacts.get(tid)
          if (!fa) {
            fa = { plays: 0, watch: 0, completions: 0, first: day, last: day }
            userFacts.set(tid, fa)
            days.col('new_titles')[dr] = Math.min(65_535, days.col('new_titles')[dr] + 1)
          }
          fa.plays++
          fa.watch += watched
          if (completed) fa.completions++
          if (day < fa.first) fa.first = day
          if (day > fa.last) fa.last = day
          if (dr === dayRow) dayTitles.set(tid, (dayTitles.get(tid) ?? 0) + watched)
          else if (watched > days.col('main_sec')[dr]) {
            days.col('main_tid')[dr] = tid
            days.col('main_sec')[dr] = watched
          }
          if (
            completed &&
            titleEpisodes[tid] >= 3 &&
            epOrder[p.cid] > 0 &&
            epOrder[p.cid] >= titleMaxOrder[tid] &&
            days.col('series_finished')[dr] < 255
          )
            days.col('series_finished')[dr]++
        }
        if (!p.live && p.dur > 0) {
          const frac = Math.min(0.9999, watched / p.dur)
          profile.watchFraction[Math.floor(frac * 20)]++
        }
        const min = watched / 60
        profile.playMinutes[
          min < 1 ? 0 : min < 5 ? 1 : min < 15 ? 2 : min < 30 ? 3 : min < 60 ? 4 : min < 120 ? 5 : 6
        ]++
      }

      const closeSession = (): void => {
        if (sessRow < 0) return
        for (const p of [...openPlays.values()]) closePlay(p, lastTs)
        const sr = sessRow
        sessions.col('dur_sec')[sr] = Math.max(0, lastTs - sessStart)
        sessions.col('last_kind')[sr] = lastKind
        sessions.col('first_delay')[sr] = sessFirstPlay >= 0 ? sessFirstPlay - sessStart : -1
        let best = 0
        for (let d = 1; d < sessDevice.length; d++)
          if (sessDevice[d] > sessDevice[best] || (best === 0 && sessDevice[d] > 0)) best = d
        sessions.col('device')[sr] = sessDevice[best] > 0 ? best : 0
        const plays = sessions.col('plays')[sr]
        const sdr = sessDayRowOf
        if (plays === 0) {
          days.col('bounces')[sdr] = Math.min(65_535, days.col('bounces')[sdr] + 1)
          uBounces++
        } else if (sessFirstPlay >= 0) {
          const d = sessFirstPlay - sessStart
          const cur = days.col('first_delay')[sdr]
          if (cur < 0 || d < cur) days.col('first_delay')[sdr] = d
        }
        profile.playsPerSession[Math.min(10, plays)]++
        sessRow = -1
      }
      let sessDayRowOf = -1

      /** Canlı yayın: olayın kendi bayrağı ya da içeriğin (tüm içe almalardan öğrenilen) türü canlı / spor */
      const isLive = (cid: number, flags: number): boolean =>
        (flags & FLAG_LIVE) !== 0 || (cid > 0 && (dict.contents[cid]?.klass === 3 || dict.contents[cid]?.klass === 4))

      const openPlay = (cid: number, ts: number, dur: number, pos: number, live: boolean): OpenPlay => {
        // Açık kalan oynatma sayısı sınırlı: en eskisi kapatılır (bitiş olayı hiç gelmeyen kaynaklar)
        if (openPlays.size >= 6) {
          let oldest: OpenPlay | null = null
          for (const q of openPlays.values()) if (!oldest || q.last < oldest.last) oldest = q
          if (oldest) closePlay(oldest, ts)
        }
        const p: OpenPlay = {
          cid,
          start: ts,
          last: ts,
          dur: dur > 0 ? dur : cid > 0 ? dict.contents[cid].dur : 0,
          sum: 0,
          max: 0,
          hasV1: false,
          pos0: pos,
          pos1: pos,
          done: false,
          live,
          dayRow,
          sessRow,
          events: 0,
          nextStart: 0,
        }
        openPlays.set(cid, p)
        if (sessFirstPlay < 0) sessFirstPlay = ts
        return p
      }

      const ensureDay = (day: number): void => {
        if (day === curDay) return
        finalizeDay()
        curDay = day
        dayRow = days.addRow()
        days.col('uid')[dayRow] = u
        days.col('day')[dayRow] = day
        days.col('first_delay')[dayRow] = -1
        dayTitles.clear()
        dayTuples.clear()
        dayDevice.fill(0)
        if (day < dayMin) dayMin = day
        if (day > dayMax) dayMax = day
      }

      for (let k = i; k < j; k++) {
        const o = order[k] * 8
        const ts = w[o + 2]
        const packed = w[o + 3]
        const kind = packed & 0xff
        const flags = (packed >>> 8) & 0xff
        const aux = packed >>> 16
        const cid = w[o + 4] < nC ? w[o + 4] : 0
        const v1 = f[o + 5]
        const v2 = f[o + 6]
        const tuple = w[o + 7]
        const day = Math.floor((ts + tzSec) / DAY)

        if (kind === K.EXPOSURE) {
          // Deney maruziyeti etkinlik sayılmaz; oturum ve gün satırı açmaz
          const prev = expSeen.get(w[o + 4])
          if (!prev) expSeen.set(w[o + 4], { variant: aux, ts, multi: 0 })
          else if (prev.variant !== aux) prev.multi = 1
          kindCounts[kind]++
          totalEvents++
          continue
        }
        const account = ACCOUNT_KIND[kind]
        if (account) {
          // Abonelik / hesap olayları çoğunlukla sunucudan gelir: gün satırına işaretlenir ama oturum açmaz,
          // uygulama etkinliği sayılmaz
          ensureDay(day)
          days.col('sub')[dayRow] |= account
          if (kind === K.SIGNUP && signupDay < 0) signupDay = day
          if ((kind === K.CANCEL || kind === K.EXPIRE) && cancelDay < 0) cancelDay = day
          kindCounts[kind]++
          totalEvents++
          uEvents++
          tupleCounts.set(tuple, (tupleCounts.get(tuple) ?? 0) + 1)
          continue
        }

        // Oturum sınırı
        if (sessRow >= 0) {
          const gap = ts - lastTs
          let limit = gapSec
          if (openPlays.size > 0) {
            let recent: OpenPlay | null = null
            for (const q of openPlays.values()) if (!recent || q.last > recent.last) recent = q
            if (recent) {
              const remain = recent.dur > 0 ? Math.max(0, recent.dur - (recent.last - recent.start)) + 600 : 3 * 3600
              limit = Math.max(gapSec, Math.min(4 * 3600, remain))
            }
          }
          if (gap > limit) closeSession()
        }
        ensureDay(day)
        if (sessRow < 0) {
          sessRow = sessions.addRow()
          sessions.col('uid')[sessRow] = u
          sessions.col('start_ts')[sessRow] = ts
          sessions.col('day')[sessRow] = day
          sessStart = ts
          sessFirstPlay = -1
          sessDayRowOf = dayRow
          sessDevice.fill(0)
          const ds = days.col('sessions')
          ds[dayRow] = Math.min(65_535, ds[dayRow] + 1)
          const local = ts + tzSec
          profile.hours[Math.floor((((local % DAY) + DAY) % DAY) / 3600)]++
          // 1970-01-01 Perşembe: (gün + 3) mod 7 → 0 = Pazartesi
          profile.weekdays[(((day + 3) % 7) + 7) % 7]++
        }

        uEvents++
        totalEvents++
        kindCounts[kind]++
        const de = days.col('events')
        de[dayRow] = Math.min(65_535, de[dayRow] + 1)
        const se = sessions.col('events')
        se[sessRow] = Math.min(65_535, se[sessRow] + 1)
        tupleCounts.set(tuple, (tupleCounts.get(tuple) ?? 0) + 1)
        dayTuples.set(tuple, (dayTuples.get(tuple) ?? 0) + 1)
        const dev = tuple < dict.tuples.length ? (dict.tuples[tuple][0] ?? 0) : 0
        dayDevice[dev]++
        sessDevice[dev]++
        if (activity[kind] && days.col('active')[dayRow] === 0) {
          days.col('active')[dayRow] = 1
          uActiveDays++
          if (firstActive < 0) firstActive = day
          lastActive = day
        }

        switch (kind) {
          case K.PLAY_START: {
            for (const q of openPlays.values()) if (q.nextStart === 0) q.nextStart = ts
            const same = openPlays.get(cid)
            if (same) closePlay(same, ts)
            const p = openPlay(cid, ts, v1, v2, isLive(cid, flags))
            p.events = 1
            break
          }
          case K.PLAY_PROGRESS:
          case K.PLAY_END: {
            let p = openPlays.get(cid)
            if (!p && cid === 0 && openPlays.size > 0) {
              // İçerik kimliği taşımayan ilerleme/bitiş: en son etkin oynatmaya yazılır
              for (const q of openPlays.values()) if (!p || q.last > p.last) p = q
            }
            if (!p) p = openPlay(cid, ts, 0, v2, isLive(cid, flags))
            p.events++
            if (!(flags & FLAG_NO_V1)) {
              p.sum += v1
              if (v1 > p.max) p.max = v1
              p.hasV1 = true
            }
            if (v2 >= 0) {
              // Başlangıç konumu bilinmiyorsa (çoğu kaynakta başlangıç olayı konum taşımaz) ilk bildirilen konumdan
              // geçen süre düşülerek kestirilir: baştan izlenen oynatmada 0, kaldığı yerden devamda o yer
              if (p.pos0 < 0) p.pos0 = Math.max(0, v2 - Math.max(0, ts - p.start))
              if (v2 > p.pos1) p.pos1 = v2
            }
            p.last = ts
            if (kind === K.PLAY_END) {
              if (flags & FLAG_COMPLETED) p.done = true
              closePlay(p, ts)
            }
            break
          }
          case K.PLAY_ERROR: {
            const c = days.col('errors')
            c[dayRow] = Math.min(65_535, c[dayRow] + 1)
            const s = sessions.col('errors')
            s[sessRow] = Math.min(65_535, s[sessRow] + 1)
            uErrors++
            break
          }
          case K.APP_ERROR: {
            const c = days.col('app_errors')
            c[dayRow] = Math.min(65_535, c[dayRow] + 1)
            break
          }
          case K.BUFFER: {
            const c = days.col('buffers')
            c[dayRow] = Math.min(65_535, c[dayRow] + 1)
            if (!(flags & FLAG_NO_V1)) days.col('buffer_sec')[dayRow] += v1
            const s = sessions.col('buffers')
            s[sessRow] = Math.min(65_535, s[sessRow] + 1)
            uBuffers++
            break
          }
          case K.SEARCH: {
            const c = days.col('searches')
            c[dayRow] = Math.min(65_535, c[dayRow] + 1)
            const s = sessions.col('searches')
            s[sessRow] = Math.min(65_535, s[sessRow] + 1)
            uSearches++
            if (flags & FLAG_EMPTY) {
              const cf = days.col('search_fails')
              cf[dayRow] = Math.min(65_535, cf[dayRow] + 1)
              const sf = sessions.col('search_fails')
              sf[sessRow] = Math.min(65_535, sf[sessRow] + 1)
              uSearchFails++
            }
            break
          }
          case K.IMPRESSION: {
            const c = days.col('impressions')
            c[dayRow] = Math.min(65_535, c[dayRow] + 1)
            const s = sessions.col('impressions')
            s[sessRow] = Math.min(65_535, s[sessRow] + 1)
            break
          }
          case K.CLICK: {
            const c = days.col('clicks')
            c[dayRow] = Math.min(65_535, c[dayRow] + 1)
            const s = sessions.col('clicks')
            s[sessRow] = Math.min(65_535, s[sessRow] + 1)
            break
          }
          case K.LIST_ADD: {
            const c = days.col('list_adds')
            c[dayRow] = Math.min(65_535, c[dayRow] + 1)
            break
          }
          case K.NOTIF_OPEN: {
            const c = days.col('notif_opens')
            c[dayRow] = Math.min(65_535, c[dayRow] + 1)
            break
          }
          default:
            break
        }
        lastTs = ts
        lastKind = kind
      }
      closeSession()
      finalizeDay()

      /* ── Kullanıcı satırı ── */
      const firstRec = order[i] * 8
      const lastRec = order[j - 1] * 8
      users.col('uid_hi')[u] = hi
      users.col('uid_lo')[u] = lo
      users.col('first_ts')[u] = w[firstRec + 2]
      users.col('last_ts')[u] = w[lastRec + 2]
      users.col('first_day')[u] = Math.floor((w[firstRec + 2] + tzSec) / DAY)
      users.col('last_day')[u] = Math.floor((w[lastRec + 2] + tzSec) / DAY)
      users.col('first_active_day')[u] = firstActive
      users.col('last_active_day')[u] = lastActive
      users.col('events')[u] = uEvents
      let appDays = 0
      for (let r = dayFrom; r < days.rows; r++) if (days.col('sessions')[r] > 0) appDays++
      users.col('days')[u] = Math.min(65_535, appDays)
      users.col('active_days')[u] = Math.min(65_535, uActiveDays)
      users.col('sessions')[u] = sessions.rows - sessFrom
      users.col('plays')[u] = uPlays
      users.col('watch_sec')[u] = uWatch
      users.col('completions')[u] = uCompletions
      users.col('titles')[u] = userFacts.size
      users.col('errors')[u] = uErrors
      users.col('buffers')[u] = uBuffers
      users.col('searches')[u] = uSearches
      users.col('search_fails')[u] = uSearchFails
      users.col('bounces')[u] = uBounces
      users.col('signup_day')[u] = signupDay
      users.col('cancel_day')[u] = cancelDay
      users.col('day_from')[u] = dayFrom
      users.col('day_to')[u] = days.rows
      users.col('sess_from')[u] = sessFrom
      users.col('sess_to')[u] = sessions.rows
      // Baskın boyut değerleri (olay sayısına göre; 'bilinmiyor' yalnız başka değer yoksa)
      for (const m of dimTally) m.clear()
      for (const [tuple, n] of tupleCounts) {
        const codes = tuple < dict.tuples.length ? dict.tuples[tuple] : null
        if (!codes) continue
        for (let d = 0; d < nDims; d++) {
          const c = codes[d] ?? 0
          if (c > 0) dimTally[d].set(c, (dimTally[d].get(c) ?? 0) + n)
        }
      }
      for (let d = 0; d < nDims; d++) {
        let best = 0
        let bestN = 0
        for (const [c, n] of dimTally[d]) {
          if (n > bestN || (n === bestN && c < best)) {
            best = c
            bestN = n
          }
        }
        users.col(`dim_${dimNames[d]}`)[u] = best
      }
      // İzleme özetleri
      users.col('fact_from')[u] = facts.rows
      for (const [tid, fa] of userFacts) {
        const r = facts.addRow()
        facts.col('uid')[r] = u
        facts.col('tid')[r] = tid
        facts.col('plays')[r] = Math.min(65_535, fa.plays)
        facts.col('watch_sec')[r] = fa.watch
        facts.col('completions')[r] = Math.min(65_535, fa.completions)
        facts.col('first_day')[r] = fa.first
        facts.col('last_day')[r] = fa.last
        titlePlays[tid] += fa.plays
        titleViewers[tid]++
        titleWatch[tid] += fa.watch
        titleCompletions[tid] += fa.completions
        if (fa.first < titleFirst[tid]) titleFirst[tid] = fa.first
        if (fa.last > titleLast[tid]) titleLast[tid] = fa.last
      }
      users.col('fact_to')[u] = facts.rows
      for (const [exp, e] of expSeen) {
        const r = exposures.addRow()
        exposures.col('uid')[r] = u
        exposures.col('exp')[r] = exp
        exposures.col('variant')[r] = e.variant
        exposures.col('ts')[r] = e.ts
        exposures.col('day')[r] = Math.floor((e.ts + tzSec) / DAY)
        exposures.col('multi')[r] = e.multi
      }
      i = j
    }
  }
  opts.onProgress?.(manifest.buckets, manifest.buckets)
  if (users.rows === 0) throw new Error('Depoda kullanıcı bulunamadı.')

  /* ── Başlık tablosu ── */
  const titles = new TableBuilder('baslik', TITLE_COLS, nT)
  for (let t = 0; t < nT; t++) {
    const r = titles.addRow()
    titles.col('klass')[r] = titleKlass[t]
    titles.col('episodes')[r] = titleEpisodes[t]
    titles.col('dur_sec')[r] = titleDurN[t] > 0 ? titleDurSum[t] / titleDurN[t] : 0
    titles.col('plays')[r] = titlePlays[t]
    titles.col('viewers')[r] = titleViewers[t]
    titles.col('watch_sec')[r] = titleWatch[t]
    titles.col('completions')[r] = titleCompletions[t]
    titles.col('first_day')[r] = titleLast[t] >= 0 ? titleFirst[t] : -1
    titles.col('last_day')[r] = titleLast[t]
    titles.col('genre')[r] = titleGenre[t]
  }

  const dataRev = createHash('sha256')
    .update(`${manifest.updatedAt}|${manifest.events}|${users.rows}|${totalEvents}`)
    .digest('hex')
    .slice(0, 12)
  const meta: BuildMeta = {
    dataRev,
    builtAt: new Date().toISOString(),
    users: users.rows,
    events: totalEvents,
    dayMin,
    dayMax,
    tzMinutes: lab.settings.tzDakika,
    sessionGapMin: mapping.sessionGapMin,
    activity: mapping.activity,
    dimNames,
    synthetic: manifest.synthetic,
    sample: manifest.sample,
    kinds: Object.fromEntries(KINDS.map((k, idx) => [k, kindCounts[idx]]).filter(([, n]) => (n as number) > 0)),
    contents: nC - 1,
    titles: nT - 1,
    userDays: days.rows,
    sessions: sessions.rows,
    facts: facts.rows,
    profile,
    seconds: 0,
  }
  meta.seconds = Math.round((Date.now() - t0) / 100) / 10
  const m = meta as unknown as Record<string, unknown>
  saveTable(lab.tableDir, users.finish(m))
  saveTable(lab.tableDir, days.finish(m))
  saveTable(lab.tableDir, sessions.finish(m))
  saveTable(lab.tableDir, facts.finish(m))
  saveTable(lab.tableDir, titles.finish(m, { genre: genreNames }))
  saveTable(lab.tableDir, exposures.finish(m, { exp: dict.experiments.values, variant: dict.variants.values }))
  writeJson(join(lab.tableDir, 'baslik.json'), titleInfo, false)
  writeJson(
    join(lab.tableDir, 'demet.json'),
    { dimNames, dimValues: dict.dims.map((d) => d.values), tuples: dict.tuples },
    false,
  )
  writeJson(join(lab.tableDir, 'meta.json'), meta)
  return meta
}

/**
 * Bölüm adlarının ortak başı → dizi adı ("Kuzey Rüzgârı · S1 B3", "Kuzey Rüzgârı · S1 B4" → "Kuzey Rüzgârı").
 * Sondaki ayırıcılar ve sezon/bölüm kalıntıları atılır; anlamlı bir ad kalmazsa undefined.
 */
export function commonTitle(names: readonly string[]): string | undefined {
  if (!names.length) return undefined
  let prefix = names[0]
  for (const n of names) {
    let k = 0
    while (k < prefix.length && k < n.length && prefix[k] === n[k]) k++
    prefix = prefix.slice(0, k)
  }
  // Sonda kalan sezon / bölüm işareti ("… S01E0", "… - Sezon 1 Bölüm", "… · S") atılır
  const marker =
    /^(.*?)\s*[·\-–—:|,(]?\s*(?:S\d{1,2}(?:\s*[BE]\d*)?|Sezon\s*\d*(?:\s*Bölüm\s*\d*)?|Season\s*\d*(?:\s*Episode\s*\d*)?|\d+\.\s*(?:Sezon|Bölüm)|Bölüm\s*\d*|Episode\s*\d*)\s*$/i.exec(
      prefix,
    )
  if (marker) prefix = marker[1]
  const cleaned = prefix
    .replace(/(?:\s*[·\-–—:|,(]\s*)(?:S|B|E)?\s*\d*\s*$/i, '')
    .replace(/[\s·\-–—:|,(]+$/, '')
    .trim()
  return cleaned.length >= 3 ? cleaned : undefined
}

/** İçerik sınıfı adı (çıktılar için). */
export const contentClassName = (k: number): string => CONTENT_CLASSES[k] ?? 'bilinmiyor'
