/**
 * İzleme verisi deposu (dosya tabanlı; gerçek ölçekte yerini veri ambarı alır — bkz. docs/MIXPANEL.md "Sınırlar").
 *
 * Disk düzeni (dataDir/viewing/):
 *   <KAYNAK>/<YYYY-MM-DD>.ndjson   eklemeli olay günlüğü — olayın UTC gününe göre; satır = kanonik ViewingEvent
 *   snapshot.json                  bellekteki özetlerin anlık görüntüsü + her günlük dosyasının işlenmiş bayt sayısı
 *   ids-<kuşak>-<KAYNAK>.bin       görülmüş olay kimliklerinin 64 bitlik özetleri (yinelenme denetimi)
 *   LOCK                           depoyu açık tutan sürecin pid'i (iki sürecin aynı günlüğe yazmasını önler)
 *
 * Açılışta anlık görüntü okunur ve yalnız günlüklerin görüntüden sonra büyüyen kuyruğu yeniden oynatılır. Görüntü
 * yoksa ya da bir günlük beklenenden kısaysa o kaynak günlükten baştan kurulur; sonuç aynıdır (testle doğrulanır),
 * çünkü özetler sıradan bağımsızdır: toplamlar toplanır, ilk/son an min/maks'tır, liste ve beğeni zaman damgasıyla
 * en son olana göre belirlenir.
 *
 * Bellekte ham olay tutulmaz: yalnız izleyici × başlık özetleri, gün × başlık toplamları, izleyici cihaz/ülke
 * sayaçları ve kimlik özetleri tutulur.
 */
import { randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import {
  VIEWING_EVENT_TYPES,
  type DataSourceStatus,
  type ImportReport,
  type TitleTotals,
  type ViewingDevice,
  type ViewingEvent,
  type ViewingEventType,
  type ViewingFact,
  type ViewingSource,
} from '../../../../shared/intelligence'
import type { ViewingService } from '../../kernel/intelligence'
import { IdSet } from './hashset'
import { dayInWindow, dayToMonth, istanbulDay, pseudonymOf } from './ids'

export const VIEWING_SOURCES: readonly ViewingSource[] = ['TVPLUS', 'MIXPANEL', 'SYNTHETIC']
const REAL_SOURCES: readonly ViewingSource[] = ['TVPLUS', 'MIXPANEL']
const DEVICES: readonly ViewingDevice[] = ['TV', 'MOBILE', 'WEB', 'OTHER']
const TYPES = new Set<string>(VIEWING_EVENT_TYPES)
const SNAPSHOT_VERSION = 1
/** Tek olayın ekleyebileceği en uzun izleme süresi (bozuk veriye karşı) */
const MAX_WATCHED_PER_EVENT = 6 * 3600
const MAX_TS = Date.UTC(2100, 0, 1)

/* ───────────── İlgi puanı ───────────── */

/**
 * 0–1 ilgi puanı (docs/MIXPANEL.md "İlgi puanı"):
 *   oran   = min(1, izlenen sn / referans sn)       referans: film süresi; dizide ~3 bölümlük süre
 *   puan   = 0.60·oran + 0.15·[tamamladı] + 0.10·[listede] + 0.05·[2+ oynatma] + beğeni payı
 *   beğeni: çok beğendi +0.20 · beğendi +0.10 · beğenmedi → toplam × 0.3
 */
export function engagementOf(
  f: { watchedSec: number; completions: number; inList: boolean; plays: number; rating: -1 | 1 | 2 | null },
  referenceSec: number,
): number {
  const ratio = referenceSec > 0 ? Math.min(1, f.watchedSec / referenceSec) : 0
  let e = 0.6 * ratio + (f.completions > 0 ? 0.15 : 0) + (f.inList ? 0.1 : 0) + (f.plays >= 2 ? 0.05 : 0)
  if (f.rating === 2) e += 0.2
  else if (f.rating === 1) e += 0.1
  else if (f.rating === -1) e *= 0.3
  return Math.round(Math.max(0, Math.min(1, e)) * 10_000) / 10_000
}

/* ───────────── Bellek yapıları ───────────── */

interface FactAcc {
  plays: number
  /** İzlenen süre, saniyenin onda biri cinsinden tam sayı (toplama sırası sonucu değiştirmesin diye) */
  watched: number
  completions: number
  first: number
  last: number
  inList: boolean
  listTs: number
  /** 0 = değerlendirmemiş */
  rating: -1 | 0 | 1 | 2
  ratingTs: number
  /** Oynatma etkinliği olan İstanbul günleri (artan, tekrarsız) */
  days: number[]
}
interface ViewerAcc {
  facts: Map<number, FactAcc>
  /** DEVICES sırasıyla sayaçlar */
  devices: number[]
  countries: Map<string, number>
}
/** [oynatma, izlenen süre (sn/10, tam sayı), tamamlama] */
type DayCell = [number, number, number]
interface SourceState {
  events: number
  /** Başlığı eşlenemeyen olaylar */
  unresolved: number
  firstTs: number | null
  lastTs: number | null
  viewers: Map<string, ViewerAcc>
  titles: Set<number>
  daily: Map<number, Map<number, DayCell>>
  ids: IdSet
  lastImport: ImportReport | null
  /** günlük dosyası → işlenmiş bayt */
  files: Record<string, number>
}

const emptySource = (): SourceState => ({
  events: 0,
  unresolved: 0,
  firstTs: null,
  lastTs: null,
  viewers: new Map(),
  titles: new Set(),
  daily: new Map(),
  ids: new IdSet(),
  lastImport: null,
  files: {},
})

/* ───────────── Anlık görüntü biçimi ───────────── */

/** [titleId, plays, watched, completions, first, last, inList(0/1), listTs, rating, ratingTs, days] */
type FactRow = [number, number, number, number, number, number, number, number, number, number, number[]]
/** [viewerId, devices, [[ülke, n]], facts] */
type ViewerRow = [string, number[], [string, number][], FactRow[]]
interface SourceSnapshot {
  events: number
  unresolved: number
  firstTs: number | null
  lastTs: number | null
  titles: number[]
  viewers: ViewerRow[]
  daily: [number, [number, number, number, number][]][]
  lastImport: ImportReport | null
  files: Record<string, number>
  idsFile: string
}
interface Snapshot {
  version: number
  savedAt: string
  durations: [number, number][]
  sources: Partial<Record<ViewingSource, SourceSnapshot>>
}

/* ───────────── Arayüz ───────────── */

export interface ViewingStore extends ViewingService {
  /** Bu kimlik daha önce görüldü mü (deneme içe aktarımı için) */
  has(source: ViewingSource, id: string): boolean
  /** Kaynağın son içe aktarım raporunu saklar (sources() içinde döner) */
  recordImport(report: ImportReport): void
  /** Olaylarda görülen en uzun süre (künyede süresi olmayan videolar için) */
  observedDuration(videoId: number): number | null
  /** İlgi puanının referans süresi: titleId → sn (eklenti katalogla bağlar) */
  setReference(fn: (titleId: number) => number): void
  /** Hiç olay yok mu */
  isEmpty(): boolean
  /** Değiştiyse anlık görüntüyü hemen yazar */
  flush(): void
  /** Anlık görüntüyü yazar ve kilidi bırakır */
  close(): void
  /** Ölçüm: bellekteki yapıların boyu */
  stats(): { ids: number; viewers: number; facts: number; dayCells: number }
}

export interface ViewingStoreOptions {
  /** dataDir/viewing */
  dir: string
  /** deriveKey(config, 'viewer-id') */
  viewerKey: Buffer
  /** Değişiklikten sonra anlık görüntü gecikmesi (ms); 0 → her değişiklikte hemen */
  snapshotDelayMs?: number
  log?: (level: 'info' | 'warn' | 'error', message: string) => void
  /** Saat (testler) */
  now?: () => number
}

export class ViewingStoreLockedError extends Error {
  pid: number
  constructor(pid: number) {
    super(
      `İzleme deposu başka bir süreçte açık (pid ${pid}). Çalışan sunucuya --server ile gönderin ya da sunucuyu durdurun.`,
    )
    this.name = 'ViewingStoreLockedError'
    this.pid = pid
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** Kilit dosyası: başka canlı süreç tutuyorsa hata. */
export function lockOwner(dir: string): number | null {
  const file = join(dir, 'LOCK')
  if (!existsSync(file)) return null
  const pid = Number(readFileSync(file, 'utf8').trim())
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid || !pidAlive(pid)) return null
  return pid
}

/* ───────────── Doğrulama ───────────── */

const VIEWER_RE = /^v_[A-Za-z0-9_-]{4,64}$/
const COUNTRY_RE = /^[A-Z]{2}$/
const posInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0
const nonNeg = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/** Geçerliyse yalnız bilinen alanları taşıyan temiz bir kopya döner (fazla alan saklanmaz); değilse null. */
export function sanitizeEvent(raw: unknown): ViewingEvent | null {
  if (typeof raw !== 'object' || raw === null) return null
  const e = raw as Record<string, unknown>
  if (typeof e.id !== 'string' || e.id.length === 0 || e.id.length > 128) return null
  if (typeof e.source !== 'string' || !VIEWING_SOURCES.includes(e.source as ViewingSource)) return null
  if (typeof e.type !== 'string' || !TYPES.has(e.type)) return null
  if (typeof e.ts !== 'number' || !Number.isFinite(e.ts) || e.ts <= 0 || e.ts >= MAX_TS) return null
  if (typeof e.viewerId !== 'string' || !VIEWER_RE.test(e.viewerId)) return null
  if (e.titleId !== null && !posInt(e.titleId)) return null
  if (e.videoId !== null && e.videoId !== undefined && !posInt(e.videoId)) return null
  const out: ViewingEvent = {
    id: e.id,
    source: e.source as ViewingSource,
    type: e.type as ViewingEventType,
    ts: Math.round(e.ts),
    viewerId: e.viewerId,
    titleId: e.titleId as number | null,
    videoId: (e.videoId as number | null | undefined) ?? null,
  }
  if (nonNeg(e.watchedSec)) out.watchedSec = Math.min(MAX_WATCHED_PER_EVENT, Math.round(e.watchedSec * 10) / 10)
  if (nonNeg(e.positionSec)) out.positionSec = Math.round(e.positionSec * 10) / 10
  if (nonNeg(e.durationSec)) out.durationSec = Math.round(e.durationSec * 10) / 10
  if (typeof e.completed === 'boolean') out.completed = e.completed
  if (e.rating === -1 || e.rating === 1 || e.rating === 2) out.rating = e.rating
  if (typeof e.device === 'string' && DEVICES.includes(e.device as ViewingDevice))
    out.device = e.device as ViewingDevice
  if (typeof e.country === 'string' && COUNTRY_RE.test(e.country)) out.country = e.country
  if (typeof e.query === 'string' && e.query.trim()) out.query = e.query.trim().slice(0, 80)
  return out
}

/* ───────────── Depo ───────────── */

export async function openViewingStore(opts: ViewingStoreOptions): Promise<ViewingStore> {
  const dir = opts.dir
  const log = opts.log ?? (() => {})
  const delay = opts.snapshotDelayMs ?? 2000
  mkdirSync(dir, { recursive: true })

  const owner = lockOwner(dir)
  if (owner !== null) throw new ViewingStoreLockedError(owner)
  const lockFile = join(dir, 'LOCK')
  writeFileSync(lockFile, String(process.pid))

  const state = new Map<ViewingSource, SourceState>(VIEWING_SOURCES.map((s) => [s, emptySource()]))
  const st = (s: ViewingSource) => state.get(s)!
  const durations = new Map<number, number>()
  let reference: (titleId: number) => number = () => 1800
  let revision = 0
  let dirty = false
  let timer: NodeJS.Timeout | null = null
  let closed = false

  /* — olay uygulama (günlük yazımı ve yeniden oynatma ortak yolu) — */
  function apply(s: SourceState, ev: ViewingEvent): void {
    s.events++
    if (s.firstTs === null || ev.ts < s.firstTs) s.firstTs = ev.ts
    if (s.lastTs === null || ev.ts > s.lastTs) s.lastTs = ev.ts
    let v = s.viewers.get(ev.viewerId)
    if (!v) {
      v = { facts: new Map(), devices: [0, 0, 0, 0], countries: new Map() }
      s.viewers.set(ev.viewerId, v)
    }
    if (ev.device) v.devices[DEVICES.indexOf(ev.device)]! += 1
    if (ev.country) v.countries.set(ev.country, (v.countries.get(ev.country) ?? 0) + 1)
    if (ev.videoId !== null && ev.durationSec && ev.durationSec > 0) {
      const d = durations.get(ev.videoId)
      if (d === undefined || ev.durationSec > d) durations.set(ev.videoId, ev.durationSec)
    }
    if (ev.titleId === null) {
      s.unresolved += ev.type === 'SEARCH' ? 0 : 1
      return
    }
    s.titles.add(ev.titleId)
    const t = ev.type
    // Gösterim, tıklama ve arama özete girmez (yalnız kaynak sayaçlarına)
    if (t === 'IMPRESSION' || t === 'CLICK' || t === 'SEARCH') return
    let f = v.facts.get(ev.titleId)
    if (!f) {
      f = {
        plays: 0,
        watched: 0,
        completions: 0,
        first: ev.ts,
        last: ev.ts,
        inList: false,
        listTs: -1,
        rating: 0,
        ratingTs: -1,
        days: [],
      }
      v.facts.set(ev.titleId, f)
    }
    if (ev.ts < f.first) f.first = ev.ts
    if (ev.ts > f.last) f.last = ev.ts
    if (t === 'ADD_TO_LIST' || t === 'REMOVE_FROM_LIST') {
      const add = t === 'ADD_TO_LIST'
      if (ev.ts > f.listTs || (ev.ts === f.listTs && add)) {
        f.inList = add
        f.listTs = ev.ts
      }
      return
    }
    if (t === 'RATING') {
      const r = ev.rating ?? 0
      if (ev.ts > f.ratingTs || (ev.ts === f.ratingTs && r > f.rating)) {
        f.rating = r
        f.ratingTs = ev.ts
      }
      return
    }
    // Oynatma olayları
    const day = istanbulDay(ev.ts)
    addDay(f.days, day)
    let row = s.daily.get(day)
    if (!row) {
      row = new Map()
      s.daily.set(day, row)
    }
    let cell = row.get(ev.titleId)
    if (!cell) {
      cell = [0, 0, 0]
      row.set(ev.titleId, cell)
    }
    if (t === 'PLAY_START') {
      f.plays++
      cell[0]++
    } else {
      const w = Math.round((ev.watchedSec ?? 0) * 10)
      f.watched += w
      cell[1] += w
      if (t === 'PLAY_END' && ev.completed) {
        f.completions++
        cell[2]++
      }
    }
  }

  function addDay(days: number[], day: number): void {
    const n = days.length
    if (n === 0 || days[n - 1]! < day) {
      days.push(day)
      return
    }
    if (days[n - 1] === day) return
    let lo = 0
    let hi = n
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (days[mid]! < day) lo = mid + 1
      else hi = mid
    }
    if (days[lo] !== day) days.splice(lo, 0, day)
  }

  /* — anlık görüntü — */
  const snapshotFile = join(dir, 'snapshot.json')

  function writeSnapshot(): void {
    if (timer) clearTimeout(timer)
    timer = null
    if (!dirty) return
    const gen = randomBytes(4).toString('hex')
    const snap: Snapshot = {
      version: SNAPSHOT_VERSION,
      savedAt: new Date().toISOString(),
      durations: [...durations],
      sources: {},
    }
    const newIdFiles: string[] = []
    for (const [src, s] of state) {
      const idsFile = `ids-${gen}-${src}.bin`
      writeFileSync(join(dir, idsFile), s.ids.toBuffer())
      newIdFiles.push(idsFile)
      const viewers: ViewerRow[] = []
      for (const [id, v] of s.viewers) {
        const facts: FactRow[] = []
        for (const [titleId, f] of v.facts)
          facts.push([
            titleId,
            f.plays,
            f.watched,
            f.completions,
            f.first,
            f.last,
            f.inList ? 1 : 0,
            f.listTs,
            f.rating,
            f.ratingTs,
            f.days,
          ])
        viewers.push([id, v.devices, [...v.countries], facts])
      }
      snap.sources[src] = {
        events: s.events,
        unresolved: s.unresolved,
        firstTs: s.firstTs,
        lastTs: s.lastTs,
        titles: [...s.titles],
        viewers,
        daily: [...s.daily].map(([day, m]) => [day, [...m].map(([t, c]) => [t, c[0], c[1], c[2]])]),
        lastImport: s.lastImport,
        files: { ...s.files },
        idsFile,
      }
    }
    const tmp = `${snapshotFile}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(snap))
    renameSync(tmp, snapshotFile)
    // Eski kimlik dosyalarını temizle
    for (const f of readdirSync(dir)) if (/^ids-.*\.bin$/.test(f) && !newIdFiles.includes(f)) safeUnlink(join(dir, f))
    dirty = false
  }

  function safeUnlink(file: string): void {
    try {
      unlinkSync(file)
    } catch {
      /* yok sayılır */
    }
  }

  function scheduleSnapshot(): void {
    dirty = true
    if (closed) return
    if (delay <= 0) {
      writeSnapshot()
      return
    }
    if (!timer) {
      timer = setTimeout(writeSnapshot, delay)
      timer.unref()
    }
  }

  function loadSnapshot(): Snapshot | null {
    if (!existsSync(snapshotFile)) return null
    try {
      const s = JSON.parse(readFileSync(snapshotFile, 'utf8')) as Snapshot
      return s.version === SNAPSHOT_VERSION ? s : null
    } catch {
      log('warn', 'İzleme deposu anlık görüntüsü okunamadı; günlükten yeniden kurulacak.')
      return null
    }
  }

  function restoreSource(snap: SourceSnapshot): SourceState | null {
    const idsPath = join(dir, snap.idsFile)
    if (!existsSync(idsPath)) return null
    const s = emptySource()
    s.events = snap.events
    s.unresolved = snap.unresolved
    s.firstTs = snap.firstTs
    s.lastTs = snap.lastTs
    s.titles = new Set(snap.titles)
    for (const [id, devices, countries, facts] of snap.viewers) {
      const v: ViewerAcc = { facts: new Map(), devices, countries: new Map(countries) }
      for (const r of facts)
        v.facts.set(r[0], {
          plays: r[1],
          watched: r[2],
          completions: r[3],
          first: r[4],
          last: r[5],
          inList: r[6] === 1,
          listTs: r[7],
          rating: r[8] as FactAcc['rating'],
          ratingTs: r[9],
          days: r[10],
        })
      s.viewers.set(id, v)
    }
    for (const [day, cells] of snap.daily) s.daily.set(day, new Map(cells.map(([t, p, w, c]) => [t, [p, w, c]])))
    s.lastImport = snap.lastImport
    s.files = { ...snap.files }
    s.ids = IdSet.fromBuffer(readFileSync(idsPath))
    return s
  }

  /** Günlük dosyasını `offset`ten sonuna kadar oynatır; işlenen son tam satırın sonunu döner. */
  async function replayFile(s: SourceState, file: string, offset: number): Promise<number> {
    const size = statSync(file).size
    if (size <= offset) return offset
    // Yarım kalmış son satır varsa (çökme) onar: yeni satır ekle; yarım satır bozuk satır olarak atlanır.
    const fd = openSync(file, 'r')
    const last = Buffer.alloc(1)
    readSync(fd, last, 0, 1, size - 1)
    closeSync(fd)
    let end = size
    if (last[0] !== 0x0a) {
      appendFileSync(file, '\n')
      end = size + 1
    }
    let rest = ''
    let pos = offset
    for await (const chunk of createReadStream(file, { start: offset, end: end - 1, encoding: 'utf8' })) {
      const text = rest + (chunk as string)
      const lines = text.split('\n')
      rest = lines.pop() ?? ''
      for (const line of lines) {
        pos += Buffer.byteLength(line) + 1
        if (!line) continue
        let ev: ViewingEvent | null = null
        try {
          ev = sanitizeEvent(JSON.parse(line))
        } catch {
          ev = null
        }
        if (ev && s.ids.add(ev.id)) apply(s, ev)
      }
    }
    return pos
  }

  async function replaySource(src: ViewingSource, s: SourceState, full: boolean): Promise<number> {
    const sdir = join(dir, src)
    if (!existsSync(sdir)) return 0
    let replayed = 0
    const files = readdirSync(sdir)
      .filter((f) => f.endsWith('.ndjson'))
      .sort()
    for (const f of files) {
      const key = `${src}/${f}`
      const from = full ? 0 : (s.files[key] ?? 0)
      const end = await replayFile(s, join(sdir, f), from)
      if (end > from) replayed += end - from
      s.files[key] = end
    }
    return replayed
  }

  /** Görüntüdeki dosyalar diskte aynı ya da daha uzun mu (değilse görüntü bu kaynak için geçersiz) */
  function consistent(src: ViewingSource, s: SourceState): boolean {
    for (const [key, bytes] of Object.entries(s.files)) {
      if (!key.startsWith(`${src}/`)) return false
      const file = join(dir, key)
      if (!existsSync(file) || statSync(file).size < bytes) return false
    }
    return true
  }

  // — açılış —
  const t0 = Date.now()
  const snap = loadSnapshot()
  if (snap) for (const [vid, d] of snap.durations) durations.set(vid, d)
  let rebuilt = 0
  let tailBytes = 0
  for (const src of VIEWING_SOURCES) {
    const ss = snap?.sources[src]
    let s = ss ? restoreSource(ss) : null
    if (s && !consistent(src, s)) s = null
    if (s) {
      state.set(src, s)
      tailBytes += await replaySource(src, s, false)
    } else {
      const fresh = emptySource()
      if (ss?.lastImport) fresh.lastImport = ss.lastImport
      state.set(src, fresh)
      const n = await replaySource(src, fresh, true)
      if (n > 0) rebuilt++
    }
  }
  if (rebuilt > 0 || tailBytes > 0 || !snap) {
    dirty = true
    writeSnapshot()
  }
  if (rebuilt || tailBytes)
    log(
      'info',
      `İzleme deposu açıldı: ${rebuilt} kaynak günlükten kuruldu, ${tailBytes} bayt kuyruk oynatıldı (${Date.now() - t0} ms)`,
    )

  /* — sorgular — */
  const sourcesOf = (q?: { sources?: ViewingSource[] }) => q?.sources ?? store.activeSources()

  function toFact(src: ViewingSource, viewerId: string, titleId: number, f: FactAcc): ViewingFact | null {
    if (f.plays === 0 && f.watched === 0 && !f.inList && f.rating === 0) return null
    const rating = f.rating === 0 ? null : f.rating
    const watchedSec = f.watched / 10
    return {
      viewerId,
      titleId,
      source: src,
      plays: f.plays,
      watchedSec,
      completions: f.completions,
      firstTs: f.first,
      lastTs: f.last,
      inList: f.inList,
      rating,
      engagement: engagementOf(
        { watchedSec, completions: f.completions, inList: f.inList, plays: f.plays, rating },
        reference(titleId),
      ),
    }
  }

  /* — günlüğe yazım — */
  function persist(src: ViewingSource, s: SourceState, events: ViewingEvent[]): void {
    const byFile = new Map<string, string[]>()
    for (const ev of events) {
      const name = `${new Date(ev.ts).toISOString().slice(0, 10)}.ndjson`
      let arr = byFile.get(name)
      if (!arr) {
        arr = []
        byFile.set(name, arr)
      }
      arr.push(JSON.stringify(ev))
    }
    const sdir = join(dir, src)
    mkdirSync(sdir, { recursive: true })
    for (const [name, lines] of byFile) {
      const text = `${lines.join('\n')}\n`
      appendFileSync(join(sdir, name), text)
      const key = `${src}/${name}`
      s.files[key] = (s.files[key] ?? 0) + Buffer.byteLength(text)
    }
  }

  const store: ViewingStore = {
    append(events) {
      let accepted = 0
      let duplicates = 0
      let rejected = 0
      const fresh = new Map<ViewingSource, ViewingEvent[]>()
      for (const raw of events) {
        const ev = sanitizeEvent(raw)
        if (!ev) {
          rejected++
          continue
        }
        const s = st(ev.source)
        if (!s.ids.add(ev.id)) {
          duplicates++
          continue
        }
        apply(s, ev)
        let arr = fresh.get(ev.source)
        if (!arr) {
          arr = []
          fresh.set(ev.source, arr)
        }
        arr.push(ev)
        accepted++
      }
      for (const [src, evs] of fresh) persist(src, st(src), evs)
      if (accepted > 0) {
        revision++
        scheduleSnapshot()
      }
      return { accepted, duplicates, rejected }
    },

    facts(q) {
      const out: ViewingFact[] = []
      for (const src of sourcesOf(q))
        for (const [viewerId, v] of st(src).viewers)
          for (const [titleId, f] of v.facts) {
            const fact = toFact(src, viewerId, titleId, f)
            if (fact) out.push(fact)
          }
      return out
    },

    factsOfViewer(viewerId) {
      const out: ViewingFact[] = []
      for (const src of VIEWING_SOURCES) {
        const v = st(src).viewers.get(viewerId)
        if (!v) continue
        for (const [titleId, f] of v.facts) {
          const fact = toFact(src, viewerId, titleId, f)
          if (fact) out.push(fact)
        }
      }
      return out.sort((a, b) => b.lastTs - a.lastTs)
    },

    titleTotals(q) {
      const out = new Map<number, TitleTotals>()
      const get = (titleId: number) => {
        let t = out.get(titleId)
        if (!t) {
          t = { titleId, viewers: 0, plays: 0, hours: 0, completions: 0 }
          out.set(titleId, t)
        }
        return t
      }
      const windowed = q?.from !== undefined || q?.to !== undefined
      for (const src of sourcesOf(q)) {
        const s = st(src)
        for (const [day, row] of s.daily) {
          if (windowed && !dayInWindow(day, q?.from, q?.to)) continue
          for (const [titleId, c] of row) {
            const t = get(titleId)
            t.plays += c[0]
            t.hours += c[1]
            t.completions += c[2]
          }
        }
        for (const v of s.viewers.values())
          for (const [titleId, f] of v.facts) {
            if (f.days.length === 0) continue
            if (windowed && !f.days.some((d) => dayInWindow(d, q?.from, q?.to))) continue
            get(titleId).viewers++
          }
      }
      // hours burada sn/10 toplamıdır → saate çevir
      for (const t of out.values()) t.hours = Math.round(t.hours / 36) / 1000
      return out
    },

    monthlyTitleHours(q) {
      const out = new Map<string, Map<number, number>>()
      for (const src of sourcesOf(q))
        for (const [day, row] of st(src).daily) {
          if (!dayInWindow(day, q?.from, q?.to)) continue
          const month = dayToMonth(day)
          let m = out.get(month)
          if (!m) {
            m = new Map()
            out.set(month, m)
          }
          for (const [titleId, c] of row) m.set(titleId, (m.get(titleId) ?? 0) + c[1])
        }
      for (const m of out.values()) for (const [t, ds] of m) m.set(t, ds / 36_000)
      return new Map([...out].sort(([a], [b]) => (a < b ? -1 : 1)))
    },

    viewerTraits(viewerId) {
      const devices = [0, 0, 0, 0]
      const countries = new Map<string, number>()
      for (const src of VIEWING_SOURCES) {
        const v = st(src).viewers.get(viewerId)
        if (!v) continue
        v.devices.forEach((n, i) => (devices[i]! += n))
        for (const [c, n] of v.countries) countries.set(c, (countries.get(c) ?? 0) + n)
      }
      let di = -1
      devices.forEach((n, i) => {
        if (n > 0 && (di < 0 || n > devices[di]!)) di = i
      })
      let country: string | null = null
      let best = 0
      for (const [c, n] of [...countries].sort(([a], [b]) => (a < b ? -1 : 1)))
        if (n > best) {
          best = n
          country = c
        }
      return { device: di >= 0 ? DEVICES[di]! : null, country }
    },

    viewerIdOfProfile: (guid) => pseudonymOf(opts.viewerKey, 'profile', guid),

    sources() {
      const active = store.activeSources()
      return VIEWING_SOURCES.map((src): DataSourceStatus => {
        const s = st(src)
        return {
          source: src,
          events: s.events,
          viewers: s.viewers.size,
          titles: s.titles.size,
          firstTs: s.firstTs,
          lastTs: s.lastTs,
          active: active.includes(src),
          lastImport: s.lastImport,
        }
      })
    },

    activeSources() {
      const real = REAL_SOURCES.filter((s) => st(s).events > 0)
      if (real.length) return real
      return st('SYNTHETIC').events > 0 ? ['SYNTHETIC'] : []
    },

    clear(source) {
      rmSync(join(dir, source), { recursive: true, force: true })
      state.set(source, emptySource())
      revision++
      dirty = true
      writeSnapshot()
    },

    revision: () => revision,

    has: (source, id) => st(source).ids.has(id),

    recordImport(report) {
      st(report.source).lastImport = report
      dirty = true
      writeSnapshot()
    },

    observedDuration: (videoId) => durations.get(videoId) ?? null,

    setReference(fn) {
      reference = fn
    },

    isEmpty: () => VIEWING_SOURCES.every((s) => st(s).events === 0),

    flush: () => writeSnapshot(),

    close() {
      if (closed) return
      writeSnapshot()
      closed = true
      if (existsSync(lockFile) && readFileSync(lockFile, 'utf8').trim() === String(process.pid)) safeUnlink(lockFile)
    },

    stats() {
      let ids = 0
      let viewers = 0
      let facts = 0
      let dayCells = 0
      for (const s of state.values()) {
        ids += s.ids.size
        viewers += s.viewers.size
        for (const v of s.viewers.values()) facts += v.facts.size
        for (const row of s.daily.values()) dayCells += row.size
      }
      return { ids, viewers, facts, dayCells }
    },
  }
  return store
}
