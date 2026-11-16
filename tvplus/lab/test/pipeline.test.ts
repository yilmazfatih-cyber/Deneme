/**
 * Uçtan uca hat, geçici bir klasörde küçük bir sentetik dünyayla: içe alma → tablolar → derin churn analizi.
 *
 *   tutarlılık      tablolar ve meta, ham dosyadan bağımsız hesaplanan başvuruyla (kullanıcı, olay, gün, tür) uyuşur
 *   yeniden alma    aynı dosyayı ikinci kez içe almak olayları çoğaltmaz
 *   örnekleme       kullanıcı düzeyi: bir kullanıcı ya tümüyle içeride ya dışarıda; pay istenene yakın
 *   churn           tanım ve genel görünüm akla yatkın; bölümler birbiriyle tutarlı
 *   belirlenimcilik aynı girdi + aynı anahtar → bayt bayt aynı tablolar ve aynı sonuç
 *   gizlilik        ham kimlik, e-posta, telefon, IP, ad hiçbir lab dosyasında ve çıktısında yok; takma kimlik
 *                   anahtara bağlı; sonuçlarda kullanıcı düzeyi veri yok; kırılımlar k-anonim
 */
import { createHash, createHmac } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ChurnDeep } from '../../shared/lab'
import { loadChurnData, statusOf } from '../src/churn/data'
import { runDeep } from '../src/churn/deep'
import { GAP_CANDIDATES } from '../src/churn/definition'
import { buildFrame } from '../src/churn/features'
import { parseArgs } from '../src/cli/args'
import { execute } from '../src/cli/commands'
import { loadTable, type Table } from '../src/core/columns'
import { dayStr } from '../src/core/format'
import { openLab, type Lab } from '../src/core/lab'
import { kaplanMeier, kmAt } from '../src/core/stats'
import { build, type BuildMeta } from '../src/data/build'
import { KINDS } from '../src/data/events'
import { createUidFn, ingest, type IngestReport } from '../src/data/ingest'
import type { LabMappingInput } from '../src/data/mapping'
import { loadManifest, type StoreManifest } from '../src/data/store'
import { WORLD_MAPPING, type WorldTruth } from '../src/world/world'
import { truthPathOf, writeWorld } from '../src/world/write'

const SECRET = 'hat-testi-anahtari'
const OTHER_SECRET = 'baska-bir-anahtar'
const WORLD = { users: 500, days: 120, seed: 11, end: '2026-11-10' }
const TZ_SEC = 180 * 60
const BUCKETS = 64

// Ortam değişkenleri sonucu etkilemesin; `execute` ile açılan lab da aynı anahtarı kullansın (anahtar dosyası yazılmaz)
delete process.env.TVP_LAB_K
delete process.env.TVP_LAB_DIR
delete process.env.TVP_DATA_DIR
process.env.TVP_LAB_SECRET = SECRET

const root = mkdtempSync(join(tmpdir(), 'lab-hat-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

/* ───────────── Ham dosyadan bağımsız başvuru ───────────── */

interface UserRef {
  /** Yinelenenler atıldıktan sonra, deney maruziyeti dışındaki olaylar */
  events: number
  firstTs: number
  lastTs: number
  city: string
  lang: string
  variant: string | null
  /** Dosyadaki tüm satırları (bozuklar dahil) */
  lines: number
  /** Olaylardan doğrudan okunan deneyim (yinelenenler atıldıktan sonra) */
  plays: number
  /** "Playback Stopped" olaylarının bildirdiği izlenen süre toplamı (sn) ve tamamlanan oynatma sayısı */
  watchSec: number
  completed: number
  errors: number
  searches: number
  searchFails: number
  buffers: number
  /** En az bir oynatma olayı olan yerel günler */
  playDays: Set<number>
}

interface RawRef {
  lines: number
  /** JSON olarak okunamayan + zamanı olmayan satırlar */
  rejected: number
  /** Kabul edilmesi gereken satırlar (yinelenenler dahil) ve türlere dağılımı */
  accepted: number
  acceptedByKind: Record<string, number>
  unmapped: number
  /** Yinelenenler atıldıktan sonra */
  distinct: number
  distinctByKind: Record<string, number>
  users: Map<string, UserRef>
  firstTs: number
  lastTs: number
  dayMin: number
  dayMax: number
}

interface Pii {
  ids: string[]
  emails: string[]
  phones: string[]
  ips: string[]
  names: string[]
  insertIds: Set<string>
  searchTerms: Set<string>
}

const kindOfEvent = (name: string): string => {
  const rule = (WORLD_MAPPING.events as Record<string, unknown>)[name]
  return typeof rule === 'string' ? rule : 'OTHER'
}

/**
 * Dünya dosyasını lab kodundan bağımsız okur. Bir satır; JSON ise, olay adı, kullanıcı kimliği ve sayısal zamanı
 * varsa kabul edilir. Birebir aynı olaylar (yalnız `$insert_id` farkı da sayılmaz) tek sayılır.
 */
function readRaw(raw: string): RawRef {
  const ref: RawRef = {
    lines: 0,
    rejected: 0,
    accepted: 0,
    acceptedByKind: {},
    unmapped: 0,
    distinct: 0,
    distinctByKind: {},
    users: new Map(),
    firstTs: Infinity,
    lastTs: -Infinity,
    dayMin: Infinity,
    dayMax: -Infinity,
  }
  // Dosya kullanıcıya göre bitişiktir: yinelenen olay denetimi kullanıcı başına tutulur
  let current = ''
  let seen = new Set<string>()
  const closed = new Set<string>()
  let start = 0
  while (start < raw.length) {
    let end = raw.indexOf('\n', start)
    if (end < 0) end = raw.length
    const line = raw.slice(start, end)
    start = end + 1
    if (!line) continue
    ref.lines++
    const id = /"distinct_id":"([^"]+)"/.exec(line)?.[1]
    if (id === undefined) throw new Error('başvuru: kimliği okunamayan satır')
    if (id !== current) {
      if (closed.has(id)) throw new Error('başvuru: dünya dosyası kullanıcıya göre bitişik değil')
      closed.add(current)
      current = id
      seen = new Set()
    }
    let user = ref.users.get(id)
    if (!user) {
      user = {
        events: 0,
        firstTs: Infinity,
        lastTs: -Infinity,
        city: '',
        lang: '',
        variant: null,
        lines: 0,
        plays: 0,
        watchSec: 0,
        completed: 0,
        errors: 0,
        searches: 0,
        searchFails: 0,
        buffers: 0,
        playDays: new Set(),
      }
      ref.users.set(id, user)
    }
    user.lines++
    let obj: { event?: unknown; properties?: Record<string, unknown> }
    try {
      obj = JSON.parse(line) as typeof obj
    } catch {
      ref.rejected++
      continue
    }
    const props = obj.properties ?? {}
    const time = props.time
    if (typeof obj.event !== 'string' || typeof time !== 'number') {
      ref.rejected++
      continue
    }
    const kind = kindOfEvent(obj.event)
    ref.accepted++
    ref.acceptedByKind[kind] = (ref.acceptedByKind[kind] ?? 0) + 1
    if (kind === 'OTHER') ref.unmapped++
    // Milisaniye gelen zamanlar saniyeye çevrilir
    const ts = Math.floor(time > 1e11 ? time / 1000 : time)
    if (ts < ref.firstTs) ref.firstTs = ts
    if (ts > ref.lastTs) ref.lastTs = ts
    if (ts < user.firstTs) user.firstTs = ts
    if (ts > user.lastTs) user.lastTs = ts
    if (typeof props.$city === 'string') user.city = props.$city
    if (typeof props.ui_language === 'string') user.lang = props.ui_language
    const key = line.replace(/"\$insert_id":"[^"]*",/, '')
    if (seen.has(key)) continue
    seen.add(key)
    ref.distinct++
    ref.distinctByKind[kind] = (ref.distinctByKind[kind] ?? 0) + 1
    if (kind === 'EXPOSURE') {
      user.variant = String(props['Variant name'])
      continue
    }
    user.events++
    const day = Math.floor((ts + TZ_SEC) / 86_400)
    if (day < ref.dayMin) ref.dayMin = day
    if (day > ref.dayMax) ref.dayMax = day
    switch (kind) {
      case 'PLAY_START':
        user.plays++
        user.playDays.add(day)
        break
      case 'PLAY_PROGRESS':
        user.playDays.add(day)
        break
      case 'PLAY_END':
        user.playDays.add(day)
        user.watchSec += Number(props.watch_duration_sec)
        if (props.completed === true) user.completed++
        break
      case 'PLAY_ERROR':
        user.errors++
        break
      case 'SEARCH':
        user.searches++
        if (props.results_count === 0) user.searchFails++
        break
      case 'BUFFER':
        user.buffers++
        break
      default:
        break
    }
  }
  return ref
}

function collectPii(raw: string): Pii {
  const all = (re: RegExp): string[] => [...new Set([...raw.matchAll(re)].map((m) => m[1]))]
  return {
    ids: all(/"distinct_id":"([^"]+)"/g),
    emails: all(/"\$email":"([^"]+)"/g),
    phones: all(/"msisdn":"([^"]+)"/g),
    ips: all(/"\$ip":"([^"]+)"/g),
    names: all(/"\$name":"([^"]+)"/g),
    insertIds: new Set(all(/"\$insert_id":"([^"]+)"/g)),
    searchTerms: new Set(all(/"search_term":"([^"]+)"/g)),
  }
}

/** Ham kimliğin takma kimliği: HMAC-SHA256(anahtar, kimlik) ilk 8 bayt — lab kodundan bağımsız hesap. */
function pseudonym(secret: string, id: string): { hi: number; lo: number } {
  const d = createHmac('sha256', Buffer.from(secret, 'utf8')).update(id).digest()
  return { hi: d.readUInt32BE(0), lo: d.readUInt32BE(4) }
}
const pairKey = (hi: number, lo: number): string => `${hi}:${lo}`

/* ───────────── Dosya taraması ───────────── */

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

/**
 * `needles` içinden `buf` içinde (UTF-8 baytları olarak) geçenler. Tarama iğnelerin ortak önekine göre yapılır:
 * önekin her geçtiği yerde olası her uzunluk denenir (binlerce iğneyi tek tek aramaktan çok daha hızlı ve kesin).
 */
function findNeedles(buf: Buffer, needles: readonly string[]): string[] {
  if (!needles.length) return []
  const bytes = needles.map((n) => Buffer.from(n, 'utf8').toString('latin1'))
  let prefix = bytes[0]
  for (const b of bytes) {
    let k = 0
    while (k < prefix.length && k < b.length && prefix[k] === b[k]) k++
    prefix = prefix.slice(0, k)
  }
  if (prefix.length < 2) throw new Error(`tarama: iğnelerin ortak öneki çok kısa ('${prefix}')`)
  const set = new Set(bytes)
  const lengths = [...new Set(bytes.map((b) => b.length))]
  const hits = new Set<string>()
  const p = Buffer.from(prefix, 'latin1')
  for (let i = buf.indexOf(p); i >= 0; i = buf.indexOf(p, i + 1))
    for (const len of lengths) {
      const cand = buf.toString('latin1', i, i + len)
      if (set.has(cand)) hits.add(cand)
    }
  return [...hits]
}

/** JSON içindeki tüm dizgeler (anahtarlar dahil) */
function jsonStrings(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === 'string') out.add(value)
  else if (Array.isArray(value)) for (const v of value) jsonStrings(v, out)
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) {
      out.add(k)
      jsonStrings(v, out)
    }
  return out
}

const tableBytes = (lab: Lab): Map<string, Buffer> => {
  const out = new Map<string, Buffer>()
  for (const t of ['kullanici', 'gun', 'oturum', 'izleme', 'baslik', 'maruziyet'])
    for (const f of readdirSync(join(lab.tableDir, t)))
      if (f.endsWith('.bin')) out.set(`${t}/${f}`, readFileSync(join(lab.tableDir, t, f)))
  return out
}

const sumOf = (xs: ArrayLike<number>): number => {
  let s = 0
  for (let i = 0; i < xs.length; i++) s += xs[i]
  return s
}

/** Zaman damgası ve veri sürümü dışında sonucun tamamı (karşılaştırma için) */
const comparable = (r: ChurnDeep): unknown =>
  JSON.parse(JSON.stringify({ ...r, status: { ...r.status, builtAt: '', dataRev: '' } }))

/* ───────────── Ortak kurulum ───────────── */

const worldPath = join(root, 'ham', 'dunya.jsonl')
let truth: WorldTruth
let rawSize = 0
let rawHash = ''
let ref: RawRef
let pii: Pii

let lab: Lab
let report: IngestReport
let manifest: StoreManifest
let meta: BuildMeta
let deep: ChurnDeep
let users: Table
let days: Table
let sessions: Table

/** Aynı anahtarla ikinci kurulum (belirlenimcilik) ve ardından aynı dosyanın yeniden içe alınması */
let labAgain: Lab
let metaAgain: BuildMeta
let deepAgain: ChurnDeep
let bytesAgain: Map<string, Buffer>
let metaReingested: BuildMeta
let bytesReingested: Map<string, Buffer>
let manifestReingested: StoreManifest

/** Kullanıcıların yarısıyla kurulum */
let labSample: Lab
let reportSample: IngestReport
let metaSample: BuildMeta

/** Başka anahtarla kurulum */
let labOther: Lab
let metaOther: BuildMeta
let deepOther: ChurnDeep

beforeAll(async () => {
  truth = await writeWorld(worldPath, WORLD)
  const raw = readFileSync(worldPath, 'utf8')
  rawSize = raw.length
  rawHash = createHash('sha256').update(readFileSync(worldPath)).digest('hex')
  ref = readRaw(raw)
  pii = collectPii(raw)

  lab = openLab({ dir: join(root, 'lab'), secret: SECRET })
  const first = await ingest(lab, [worldPath], { mapping: WORLD_MAPPING, reset: true, synthetic: true })
  report = first.reports[0]
  manifest = first.manifest
  meta = build(lab)
  deep = runDeep(lab).result
  users = loadTable(lab.tableDir, 'kullanici')
  days = loadTable(lab.tableDir, 'gun')
  sessions = loadTable(lab.tableDir, 'oturum')

  labAgain = openLab({ dir: join(root, 'lab-yeniden'), secret: SECRET })
  await ingest(labAgain, [worldPath], { mapping: WORLD_MAPPING, reset: true, synthetic: true })
  metaAgain = build(labAgain)
  deepAgain = runDeep(labAgain).result
  bytesAgain = tableBytes(labAgain)
  manifestReingested = (await ingest(labAgain, [worldPath], { mapping: WORLD_MAPPING })).manifest
  metaReingested = build(labAgain)
  bytesReingested = tableBytes(labAgain)

  labSample = openLab({ dir: join(root, 'lab-ornek'), secret: SECRET })
  reportSample = (await ingest(labSample, [worldPath], { mapping: WORLD_MAPPING, reset: true, sample: 0.5 })).reports[0]
  metaSample = build(labSample)

  labOther = openLab({ dir: join(root, 'lab-baska-anahtar'), secret: OTHER_SECRET })
  await ingest(labOther, [worldPath], { mapping: WORLD_MAPPING, reset: true, synthetic: true })
  metaOther = build(labOther)
  deepOther = runDeep(labOther).result
}, 240_000)

/** Lab'daki kullanıcı satırı ← ham kimlik */
function rowIndex(t: Table, secret: string): (id: string) => number | undefined {
  const index = new Map<string, number>()
  for (let u = 0; u < t.rows; u++) index.set(pairKey(t.cols.uid_hi[u], t.cols.uid_lo[u]), u)
  return (id) => {
    const p = pseudonym(secret, id)
    return index.get(pairKey(p.hi, p.lo))
  }
}

describe('sentetik dünya', () => {
  it('aynı seçenekler bayt bayt aynı dosyayı üretir; tohum değişince değişir', async () => {
    const again = join(root, 'ham-2', 'dunya.jsonl')
    const t2 = await writeWorld(again, WORLD)
    expect(createHash('sha256').update(readFileSync(again)).digest('hex')).toBe(rawHash)
    expect(t2.lines).toBe(truth.lines)
    expect(readFileSync(truthPathOf(again), 'utf8')).toBe(readFileSync(truthPathOf(worldPath), 'utf8'))
    const other = join(root, 'ham-3', 'dunya.jsonl')
    await writeWorld(other, { ...WORLD, users: 30, days: 40, seed: 12 })
    const same = join(root, 'ham-4', 'dunya.jsonl')
    await writeWorld(same, { ...WORLD, users: 30, days: 40, seed: 11 })
    expect(readFileSync(other).equals(readFileSync(same))).toBe(false)
  }, 60_000)

  it('başvuru okuması dünyanın kendi sayımlarıyla uyuşur ve gürültü içerir', () => {
    expect(ref.lines).toBe(truth.lines)
    expect(truth.users).toHaveLength(WORLD.users)
    // Her kullanıcının en az bir satırı vardır; kimlikler tekildir
    expect(ref.users.size).toBeLessThanOrEqual(WORLD.users)
    expect(ref.users.size).toBeGreaterThan(WORLD.users * 0.95)
    expect(new Set(truth.users.map((u) => u.id)).size).toBe(WORLD.users)
    // Kirli veri: bozuk satır, yinelenen satır, eşlenmeyen olay ve milisaniye zamanlar gerçekten var
    expect(ref.rejected).toBeGreaterThan(20)
    expect(ref.accepted - ref.distinct).toBeGreaterThan(100)
    expect(ref.unmapped).toBeGreaterThan(500)
    expect(rawSize).toBeGreaterThan(50_000_000)
  })
})

describe('içe alma', () => {
  it('rapor ham dosyayla birebir: satır, kabul, ret, türler, zaman aralığı', () => {
    expect(report.file).toBe('dunya.jsonl')
    expect(report.format).toBe('düz')
    expect(report.lines).toBe(ref.lines)
    expect(report.accepted).toBe(ref.accepted)
    expect(report.rejected).toBe(ref.rejected)
    expect(report.sampledOut).toBe(0)
    expect(report.ignored).toBe(0)
    expect(report.accepted + report.rejected).toBe(report.lines)
    expect(report.byKind).toEqual(ref.acceptedByKind)
    expect(sumOf(Object.values(report.byKind))).toBe(report.accepted)
    expect(report.unmappedTotal).toBe(ref.unmapped)
    expect(sumOf(Object.values(report.unmapped))).toBe(ref.unmapped)
    expect(Object.keys(report.unmapped).sort()).toEqual(['Profile Switched', 'Profile Updated', 'Settings Opened'])
    // Milisaniye gelen zamanlar saniyeye çevrilmiştir: aralık pencerenin içinde
    expect(report.firstTs).toBe(ref.firstTs)
    expect(report.lastTs).toBe(ref.lastTs)
    expect(report.warnings).toEqual([])
  })

  it('kayıt defteri: olay sayısı, örnekleme, sentetik etiketi, eşleme', () => {
    expect(manifest.events).toBe(ref.accepted)
    expect(manifest.buckets).toBe(BUCKETS)
    expect(manifest.sample).toBe(1)
    expect(manifest.synthetic).toBe(true)
    expect(manifest.firstTs).toBe(ref.firstTs)
    expect(manifest.lastTs).toBe(ref.lastTs)
    expect(manifest.ingests).toHaveLength(1)
    expect(manifest.ingests[0]).toMatchObject({
      file: 'dunya.jsonl',
      lines: ref.lines,
      accepted: ref.accepted,
      rejected: ref.rejected,
    })
    expect(manifest.mapping?.events['Playback Started']).toBe('PLAY_START')
    expect(loadManifest(lab)).toEqual(manifest)
  })

  it('depo: 32 baytlık kayıtlar kullanıcıya göre kovalanır ve yalnız takma kimlik taşır', () => {
    const known = new Set(pii.ids.map((id) => pairKey(pseudonym(SECRET, id).hi, pseudonym(SECRET, id).lo)))
    let records = 0
    const kinds = new Array<number>(KINDS.length).fill(0)
    for (let b = 0; b < BUCKETS; b++) {
      const file = join(lab.storeDir, `kova-${String(b).padStart(3, '0')}.bin`)
      if (!existsSync(file)) continue
      const buf = readFileSync(file)
      expect(buf.length % 32).toBe(0)
      for (let off = 0; off < buf.length; off += 32) {
        const hi = buf.readUInt32LE(off)
        const lo = buf.readUInt32LE(off + 4)
        if (lo % BUCKETS !== b) throw new Error(`kayıt yanlış kovada: ${lo} mod ${BUCKETS} ≠ ${b}`)
        if (!known.has(pairKey(hi, lo))) throw new Error('depoda bilinmeyen kullanıcı kimliği')
        const ts = buf.readUInt32LE(off + 8)
        if (ts < ref.firstTs || ts > ref.lastTs) throw new Error(`zaman aralık dışında: ${ts}`)
        kinds[buf.readUInt8(off + 12)]++
        records++
      }
    }
    expect(records).toBe(ref.accepted)
    expect(Object.fromEntries(KINDS.map((k, i) => [k, kinds[i]]).filter(([, n]) => (n as number) > 0))).toEqual(
      ref.acceptedByKind,
    )
  })

  it('deneme kipi (dryRun) hiçbir şey yazmaz; rapor aynıdır', async () => {
    const dry = openLab({ dir: join(root, 'lab-deneme'), secret: SECRET })
    const r = await ingest(dry, [worldPath], { mapping: WORLD_MAPPING, dryRun: true })
    expect(r.reports[0]).toMatchObject({
      lines: ref.lines,
      accepted: ref.accepted,
      rejected: ref.rejected,
      byKind: ref.acceptedByKind,
    })
    expect(readdirSync(dry.storeDir)).toEqual([])
    expect(loadManifest(dry)).toBeNull()
    expect(() => build(dry)).toThrow(/Depo boş/)
  }, 60_000)

  it('gzip ve düz dosya aynı kayıtları verir; klasör girdisi dosyalarına açılır', async () => {
    const plain = join(root, 'kucuk', 'a.jsonl')
    const gz = join(root, 'kucuk-gz', 'a.jsonl.gz')
    const opts = { users: 40, days: 40, seed: 5, end: '2026-11-10' }
    await writeWorld(plain, opts)
    await writeWorld(gz, opts)
    // Yer gerçeği dosyası içe alınacak klasörde durmasın (o bir olay dosyası değildir)
    rmSync(truthPathOf(gz))
    expect(statSync(gz).size).toBeLessThan(statSync(plain).size / 3)
    const a = openLab({ dir: join(root, 'lab-duz'), secret: SECRET })
    const b = openLab({ dir: join(root, 'lab-gz'), secret: SECRET })
    const ra = await ingest(a, [plain], { mapping: WORLD_MAPPING, reset: true })
    // Klasör verilir: içindeki .gz dosyası bulunur
    const rb = await ingest(b, [join(root, 'kucuk-gz')], { mapping: WORLD_MAPPING, reset: true })
    expect(rb.reports).toHaveLength(1)
    expect(rb.reports[0].format).toBe('gzip')
    expect({ ...rb.reports[0], file: '', format: '', seconds: 0 }).toEqual({
      ...ra.reports[0],
      file: '',
      format: '',
      seconds: 0,
    })
    build(a)
    build(b)
    const ta = tableBytes(a)
    const tb = tableBytes(b)
    expect([...tb.keys()]).toEqual([...ta.keys()])
    for (const [name, bytes] of ta) expect(bytes.equals(tb.get(name) ?? Buffer.alloc(0)), name).toBe(true)
  }, 60_000)
})

describe('tablolar ve meta', () => {
  it('meta: kullanıcı, olay, tür sayıları ve gün aralığı ham dosyayla aynı', () => {
    expect(meta.users).toBe(ref.users.size)
    expect(meta.events).toBe(ref.distinct)
    expect(meta.kinds).toEqual(ref.distinctByKind)
    expect(sumOf(Object.values(meta.kinds))).toBe(meta.events)
    expect(meta.dayMin).toBe(ref.dayMin)
    expect(meta.dayMax).toBe(ref.dayMax)
    // Pencere: istenen gün sayısı (+ gece yarısını aşan son oturumlar için en çok bir gün)
    expect(dayStr(meta.dayMax) >= WORLD.end).toBe(true)
    expect(meta.dayMax - meta.dayMin + 1).toBeGreaterThanOrEqual(WORLD.days)
    expect(meta.dayMax - meta.dayMin + 1).toBeLessThanOrEqual(WORLD.days + 1)
    expect(meta.dimNames).toEqual(['cihaz', 'platform', 'surum', 'plan', 'kaynak', 'sehir', 'dil'])
    expect(meta.activity).toEqual(['PLAY_START', 'PLAY_PROGRESS', 'PLAY_END'])
    expect(meta).toMatchObject({ synthetic: true, sample: 1, tzMinutes: 180, sessionGapMin: 30 })
    expect(meta.dataRev).toMatch(/^[0-9a-f]{12}$/)
    const status = statusOf(meta)
    expect(status).toMatchObject({
      ready: true,
      users: meta.users,
      events: meta.events,
      days: meta.dayMax - meta.dayMin + 1,
    })
    expect(status.from).toBe(dayStr(meta.dayMin))
    expect(status.to).toBe(dayStr(meta.dayMax))
  })

  it('satır sayıları meta ile ve tablolar birbiriyle tutarlı', () => {
    const facts = loadTable(lab.tableDir, 'izleme')
    const titles = loadTable(lab.tableDir, 'baslik')
    expect(users.rows).toBe(meta.users)
    expect(days.rows).toBe(meta.userDays)
    expect(sessions.rows).toBe(meta.sessions)
    expect(facts.rows).toBe(meta.facts)
    expect(titles.rows).toBe(meta.titles + 1)
    // Olaylar: kullanıcı toplamı = tüm olaylar − deney maruziyetleri
    expect(sumOf(users.cols.events)).toBe(meta.events - (meta.kinds.EXPOSURE ?? 0))
    // Oturum ve oynatma toplamları her tabloda aynı
    expect(sumOf(users.cols.sessions)).toBe(sessions.rows)
    expect(sumOf(days.cols.sessions)).toBe(sessions.rows)
    const plays = sumOf(users.cols.plays)
    expect(sumOf(days.cols.plays)).toBe(plays)
    expect(sumOf(sessions.cols.plays)).toBe(plays)
    expect(sumOf(facts.cols.plays)).toBe(plays)
    expect(sumOf(titles.cols.plays)).toBe(plays)
    expect(sumOf(titles.cols.viewers)).toBe(facts.rows)
    expect(sumOf(users.cols.titles)).toBe(facts.rows)
    expect(sumOf(days.cols.completions)).toBe(sumOf(users.cols.completions))
    expect(sumOf(days.cols.errors)).toBe(meta.kinds.PLAY_ERROR)
    expect(sumOf(days.cols.searches)).toBe(meta.kinds.SEARCH)
    expect(sumOf(days.cols.impressions)).toBe(meta.kinds.IMPRESSION)
    expect(sumOf(days.cols.clicks)).toBe(meta.kinds.CLICK)
    expect(sumOf(days.cols.buffers)).toBe(meta.kinds.BUFFER)
    expect(sumOf(days.cols.notif_opens)).toBe(meta.kinds.NOTIF_OPEN)
    expect(sumOf(days.cols.list_adds)).toBe(meta.kinds.LIST_ADD)
    // İzlenen süre: gün ve kullanıcı toplamları (float32 birikimi payıyla) aynı; oynatma başına makul
    const watch = sumOf(users.cols.watch_sec)
    expect(Math.abs(sumOf(days.cols.watch_sec) / watch - 1)).toBeLessThan(1e-4)
    expect(watch / plays).toBeGreaterThan(5 * 60)
    expect(watch / plays).toBeLessThan(90 * 60)
    // Oynatma sayısı, başlatma olaylarına çok yakın (yinelenen başlangıçlar dışında bire bir)
    expect(Math.abs(plays / meta.kinds.PLAY_START - 1)).toBeLessThan(0.02)
    expect(sumOf(days.cols.completions)).toBeLessThanOrEqual(plays)
  })

  it('her kullanıcının olay sayısı ve ilk / son anı ham dosyayla aynı (takma kimlik üzerinden)', () => {
    const rowOf = rowIndex(users, SECRET)
    const seen = new Set<number>()
    for (const [id, u] of ref.users) {
      const row = rowOf(id)
      expect(row, id).toBeDefined()
      if (row === undefined) continue
      seen.add(row)
      if (users.cols.events[row] !== u.events)
        throw new Error(`olay sayısı farklı: tablo ${users.cols.events[row]}, ham ${u.events}`)
      if (users.cols.first_ts[row] !== u.firstTs || users.cols.last_ts[row] !== u.lastTs)
        throw new Error('ilk / son an farklı')
    }
    expect(seen.size).toBe(users.rows)
  })

  it('deneyim sayımları ham olaylarla birebir; oynatma ve izleme süresi olayların bildirdiğine çok yakın', () => {
    const rowOf = rowIndex(users, SECRET)
    const sums = { plays: 0, playsRaw: 0, watch: 0, watchRaw: 0, completed: 0, completedRaw: 0 }
    let differing = 0
    for (const [id, u] of ref.users) {
      const row = rowOf(id)
      if (row === undefined) throw new Error('kullanıcı tabloda yok')
      // Tek olaydan sayılanlar birebir tutar
      const exact: [string, number, number][] = [
        ['errors', users.cols.errors[row], u.errors],
        ['searches', users.cols.searches[row], u.searches],
        ['search_fails', users.cols.search_fails[row], u.searchFails],
        ['buffers', users.cols.buffers[row], u.buffers],
        ['active_days', users.cols.active_days[row], u.playDays.size],
      ]
      for (const [name, got, expected] of exact)
        if (got !== expected) throw new Error(`${name}: tablo ${got}, ham ${expected}`)
      sums.plays += users.cols.plays[row]
      sums.playsRaw += u.plays
      sums.watch += users.cols.watch_sec[row]
      sums.watchRaw += u.watchSec
      sums.completed += users.cols.completions[row]
      sums.completedRaw += u.completed
      if (users.cols.plays[row] !== u.plays) differing++
    }
    // Oynatmalar olaylardan birleştirilir (başlangıç + ilerleme + bitiş). Dünyadaki gürültü (eksik satırlar, gece
    // yarısında üst üste binen oturumlar) küçük bir sapma bırakır; sistematik bir kayma olmamalı.
    expect(sums.playsRaw).toBeGreaterThan(10_000)
    expect(Math.abs(sums.plays / sums.playsRaw - 1)).toBeLessThan(0.01)
    expect(Math.abs(sums.watch / sums.watchRaw - 1)).toBeLessThan(0.01)
    expect(Math.abs(sums.completed / sums.completedRaw - 1)).toBeLessThan(0.01)
    expect(differing / ref.users.size).toBeLessThan(0.1)
  })

  it('kullanıcı boyutları dünyanın gerçeğiyle aynı: plan, kaynak, platform, cihaz sınıfı, şehir, dil', () => {
    const rowOf = rowIndex(users, SECRET)
    const dim = (name: string, row: number): string => users.dicts[`dim_${name}`][users.cols[`dim_${name}`][row]]
    const deviceOf: Record<string, string> = {
      'Android TV': 'TV',
      Tizen: 'TV',
      webOS: 'TV',
      tvOS: 'TV',
      iOS: 'MOBIL',
      Android: 'MOBIL',
      Web: 'WEB',
    }
    let checked = 0
    for (const tu of truth.users) {
      const row = rowOf(tu.id)
      const raw = ref.users.get(tu.id)
      if (row === undefined || !raw) continue
      checked++
      expect(dim('plan', row)).toBe(tu.plan)
      expect(dim('kaynak', row)).toBe(tu.channel)
      expect(dim('platform', row)).toBe(tu.platform)
      expect(dim('cihaz', row)).toBe(deviceOf[tu.platform])
      expect(dim('sehir', row)).toBe(raw.city)
      expect(dim('dil', row)).toBe(raw.lang)
    }
    expect(checked).toBe(users.rows)
  })

  it('gün ve oturum satırları kullanıcıya bitişik, günler artan sırada', () => {
    const { day_from: dayFrom, day_to: dayTo, sess_from: sessFrom, sess_to: sessTo } = users.cols
    let prevDayTo = 0
    let prevSessTo = 0
    for (let u = 0; u < users.rows; u++) {
      if (dayFrom[u] !== prevDayTo || sessFrom[u] !== prevSessTo)
        throw new Error(`kullanıcı ${u}: satır aralığı bitişik değil`)
      let appDays = 0
      let activeDays = 0
      for (let r = dayFrom[u]; r < dayTo[u]; r++) {
        if (days.cols.uid[r] !== u) throw new Error('gün satırı başka kullanıcıya ait')
        if (r > dayFrom[u] && days.cols.day[r] <= days.cols.day[r - 1]) throw new Error('günler artan sırada değil')
        if (days.cols.day[r] < meta.dayMin || days.cols.day[r] > meta.dayMax) throw new Error('gün pencere dışında')
        if (days.cols.sessions[r] > 0) appDays++
        activeDays += days.cols.active[r]
      }
      if (users.cols.days[u] !== appDays || users.cols.active_days[u] !== activeDays)
        throw new Error('gün sayıları tutmuyor')
      if (users.cols.sessions[u] !== sessTo[u] - sessFrom[u]) throw new Error('oturum sayısı tutmuyor')
      for (let s = sessFrom[u]; s < sessTo[u]; s++) {
        if (sessions.cols.uid[s] !== u) throw new Error('oturum satırı başka kullanıcıya ait')
        if (s > sessFrom[u] && sessions.cols.start_ts[s] <= sessions.cols.start_ts[s - 1])
          throw new Error('oturumlar zaman sırasında değil')
      }
      if (users.cols.first_day[u] > users.cols.last_day[u]) throw new Error('ilk gün son günden sonra')
      prevDayTo = dayTo[u]
      prevSessTo = sessTo[u]
    }
    expect(prevDayTo).toBe(days.rows)
    expect(prevSessTo).toBe(sessions.rows)
  })

  it('deney maruziyeti: kullanıcı başına bir satır ve dünyanın atadığı kol', () => {
    const exp = loadTable(lab.tableDir, 'maruziyet')
    const rowOf = rowIndex(users, SECRET)
    const exposed = [...ref.users].filter(([, u]) => u.variant !== null)
    expect(exp.rows).toBe(exposed.length)
    expect(exp.rows).toBeGreaterThan(100)
    expect(exp.dicts.exp).toEqual(['bilinmiyor', truth.experiment?.name])
    const variantOfRow = new Map<number, string>()
    for (let r = 0; r < exp.rows; r++) {
      expect(exp.cols.multi[r]).toBe(0)
      variantOfRow.set(exp.cols.uid[r], exp.dicts.variant[exp.cols.variant[r]])
    }
    expect(variantOfRow.size).toBe(exp.rows)
    for (const [id, u] of exposed) expect(variantOfRow.get(rowOf(id) ?? -1)).toBe(u.variant)
    const byTruth = new Map(truth.users.map((u) => [u.id, u.variant]))
    for (const [id, u] of exposed) expect(byTruth.get(id)).toBe(u.variant)
  })
})

describe('yeniden içe alma', () => {
  it('aynı dosyayı ikinci kez içe almak olayları çoğaltmaz (tablolar değişmez)', () => {
    // İkinci içe alma depoya gerçekten yazıldı
    expect(manifestReingested.ingests).toHaveLength(2)
    expect(manifestReingested.events).toBe(2 * ref.accepted)
    // …ama kurulan tablolar ilk kurulumla aynı kalmalı
    expect(metaReingested.kinds).toEqual(metaAgain.kinds)
    expect(metaReingested.events).toBe(metaAgain.events)
    expect(metaReingested).toMatchObject({
      users: metaAgain.users,
      userDays: metaAgain.userDays,
      sessions: metaAgain.sessions,
      facts: metaAgain.facts,
      titles: metaAgain.titles,
      dayMin: metaAgain.dayMin,
      dayMax: metaAgain.dayMax,
    })
    const changed = [...bytesAgain]
      .filter(([name, bytes]) => !bytes.equals(bytesReingested.get(name) ?? Buffer.alloc(0)))
      .map(([name]) => name)
    expect(changed, 'yeniden içe almadan sonra değişen sütunlar').toEqual([])
  })

  it('en küçük örnek: türü sonradan öğrenilen içeriğin olayı ikinci içe almada yinelenmez', async () => {
    // Gösterim olayı içerik türünü taşımaz; tür (canlı) sonraki oynatma olayından öğrenilir. Kayıt, sözlüğün o anki
    // durumuna bağlı olmamalı: ilk geçişte bayraksız, ikinci geçişte "canlı" bayraklı yazılırsa iki kayıt aynı sayılmaz.
    const mapping: LabMappingInput = {
      version: 1,
      events: { goster: 'IMPRESSION', basla: 'PLAY_START', bitir: 'PLAY_END' },
      props: { contentId: 'cid', contentType: 'tur', duration: 'sure', watched: 'izlenen', position: 'konum' },
    }
    const t = 1_790_000_000
    const cases: [string, Record<string, unknown>[]][] = [
      [
        'canlı içeriğin gösterimi',
        [
          { event: 'goster', properties: { time: t, distinct_id: 'u1', cid: 'kanal-1' } },
          { event: 'basla', properties: { time: t + 60, distinct_id: 'u1', cid: 'kanal-1', tur: 'live' } },
        ],
      ],
      [
        'süresi sonradan öğrenilen oynatma başı',
        [
          { event: 'basla', properties: { time: t, distinct_id: 'u1', cid: 'film-1' } },
          {
            event: 'bitir',
            properties: { time: t + 1500, distinct_id: 'u1', cid: 'film-1', sure: 3000, izlenen: 1500, konum: 1500 },
          },
        ],
      ],
    ]
    const failures: string[] = []
    for (const [name, rows] of cases) {
      const dir = mkdtempSync(join(root, 'yeniden-'))
      const file = join(dir, 'olay.jsonl')
      writeFileSync(file, `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`)
      const small = openLab({ dir: join(dir, 'lab'), secret: SECRET })
      await ingest(small, [file], { mapping, reset: true })
      const before = build(small)
      const playsBefore = loadTable(small.tableDir, 'kullanici').cols.plays[0]
      expect(before.events).toBe(2)
      await ingest(small, [file], { mapping })
      const after = build(small)
      const playsAfter = loadTable(small.tableDir, 'kullanici').cols.plays[0]
      if (after.events !== before.events || playsAfter !== playsBefore)
        failures.push(
          `${name}: olay ${before.events} → ${after.events}, oynatma ${playsBefore} → ${playsAfter} (${JSON.stringify(after.kinds)})`,
        )
    }
    expect(failures).toEqual([])
  })
})

describe('kullanıcı düzeyi örnekleme', () => {
  const LIMIT = Math.floor(0.5 * 4294967296)

  it('rapor: her satır ya kabul, ya ret, ya da örneklem dışı; örneklem dışı satırlar dışarıdaki kullanıcılarındır', () => {
    expect(reportSample.lines).toBe(ref.lines)
    expect(reportSample.accepted + reportSample.rejected + reportSample.sampledOut + reportSample.ignored).toBe(
      ref.lines,
    )
    let outLines = 0
    for (const [id, u] of ref.users) if (pseudonym(SECRET, id).hi >= LIMIT) outLines += u.lines
    expect(reportSample.sampledOut).toBe(outLines)
    expect(loadManifest(labSample)?.sample).toBe(0.5)
    expect(metaSample.sample).toBe(0.5)
  })

  it('pay istenene yakın ve seçim takma kimliğe göre belirlenimci', () => {
    const sampled = loadTable(labSample.tableDir, 'kullanici')
    expect(sampled.rows).toBe(metaSample.users)
    const share = sampled.rows / users.rows
    expect(share).toBeGreaterThan(0.4)
    expect(share).toBeLessThan(0.6)
    // Seçim kuralı: takma kimliğin üst 32 biti < oran × 2³²
    const inSample = new Set<string>()
    for (let v = 0; v < sampled.rows; v++) inSample.add(pairKey(sampled.cols.uid_hi[v], sampled.cols.uid_lo[v]))
    let expected = 0
    for (let u = 0; u < users.rows; u++) {
      const should = users.cols.uid_hi[u] < LIMIT
      if (should) expected++
      expect(inSample.has(pairKey(users.cols.uid_hi[u], users.cols.uid_lo[u]))).toBe(should)
    }
    expect(sampled.rows).toBe(expected)
  })

  it('örnekleme alınan kullanıcı TÜM olaylarıyla alınır: satırı tam kurulumdakiyle aynıdır', () => {
    const sampled = loadTable(labSample.tableDir, 'kullanici')
    const fullRow = new Map<string, number>()
    for (let u = 0; u < users.rows; u++) fullRow.set(pairKey(users.cols.uid_hi[u], users.cols.uid_lo[u]), u)
    const names = Object.keys(users.cols).filter((c) => !/_(from|to)$/.test(c))
    expect(names).toContain('events')
    expect(names).toContain('watch_sec')
    for (let v = 0; v < sampled.rows; v++) {
      const u = fullRow.get(pairKey(sampled.cols.uid_hi[v], sampled.cols.uid_lo[v]))
      if (u === undefined) throw new Error('örneklemdeki kullanıcı tam kurulumda yok')
      for (const c of names) {
        // Sözlük kodları kurulumdan kuruluma değişebilir: kategorik sütunlar adlarıyla karşılaştırılır
        const a = users.dicts[c] ? users.dicts[c][users.cols[c][u]] : users.cols[c][u]
        const b = sampled.dicts[c] ? sampled.dicts[c][sampled.cols[c][v]] : sampled.cols[c][v]
        if (a !== b) throw new Error(`örneklemdeki kullanıcının '${c}' değeri farklı: ${String(a)} ≠ ${String(b)}`)
      }
    }
    // Toplamlar da tutar: örneklemdeki olaylar = o kullanıcıların tam kurulumdaki olayları
    let events = 0
    for (let u = 0; u < users.rows; u++) if (users.cols.uid_hi[u] < LIMIT) events += users.cols.events[u]
    expect(sumOf(sampled.cols.events)).toBe(events)
  })

  it('dolu depoya farklı örnekleme oranıyla ekleme reddedilir; oran verilmezse depodaki kullanılır', async () => {
    await expect(
      ingest(labSample, [worldPath], { mapping: WORLD_MAPPING, sample: 0.25, dryRun: true }),
    ).rejects.toThrow(/farklı oranla/)
    const r = await ingest(labSample, [worldPath], { mapping: WORLD_MAPPING, dryRun: true })
    expect(r.reports[0].sampledOut).toBe(reportSample.sampledOut)
    expect(r.reports[0].accepted).toBe(reportSample.accepted)
  }, 60_000)
})

describe('churn tanımı ve genel görünüm', () => {
  it('tanım veriden seçilir: geri dönme olasılığı eşiğin altına düşen ilk süre', () => {
    const def = deep.overview.definition
    const W = meta.dayMax - meta.dayMin + 1
    expect(def.chosenBy).toBe('veri')
    expect(def.activity).toBe('izleme')
    expect(def.threshold).toBe(0.2)
    expect(GAP_CANDIDATES as readonly number[]).toContain(def.n)
    expect(def.n).toBeGreaterThanOrEqual(14)
    expect(def.n).toBeLessThanOrEqual(Math.max(7, Math.floor(W / 3)))
    expect(def.gaps.length).toBeGreaterThanOrEqual(4)
    for (let i = 0; i < def.gaps.length; i++) {
      const g = def.gaps[i]
      expect(g.exceedShare).toBeGreaterThan(0)
      expect(g.exceedShare).toBeLessThan(1)
      expect(g.returnRate).toBeGreaterThanOrEqual(0)
      expect(g.returnRate).toBeLessThanOrEqual(1)
      if (i > 0) {
        expect(g.n).toBeGreaterThan(def.gaps[i - 1].n)
        // Daha uzun sessizlik: daha az boşluk o kadar sürer ve geri dönme olasılığı düşer
        expect(g.exceedShare).toBeLessThanOrEqual(def.gaps[i - 1].exceedShare)
        expect(g.returnRate).toBeLessThanOrEqual(def.gaps[i - 1].returnRate)
      }
    }
    const eligible = def.gaps.filter((g) => g.n <= Math.max(7, Math.floor(W / 3)))
    expect(def.n).toBe((eligible.find((g) => g.returnRate <= def.threshold) ?? eligible[eligible.length - 1]).n)
  })

  it('boşluk çözümlemesi genel Kaplan–Meier ile aynı (bağımsız hesap)', () => {
    // Etkin günler arası boşluklar olaydır; son etkin günden pencere sonuna dek geçen süre sansürlüdür
    const d = loadChurnData(lab)
    const time: number[] = []
    const event: number[] = []
    for (let u = 0; u < d.n; u++) {
      let prev = -1
      for (let r = d.dayFrom[u]; r < d.dayTo[u]; r++) {
        if (d.dActive[r] !== 1) continue
        if (prev >= 0) {
          time.push(d.dDay[r] - prev)
          event.push(1)
        }
        prev = d.dDay[r]
      }
      if (prev >= 0 && d.dayMax - prev > 0) {
        time.push(d.dayMax - prev)
        event.push(0)
      }
    }
    const km = kaplanMeier(time, event)
    for (const g of deep.overview.definition.gaps) expect(g.exceedShare).toBeCloseTo(kmAt(km, g.n), 12)
  })

  it('genel görünüm: sayılar tutarlı, oranlar (0, 1) içinde, sağkalım artmıyor', () => {
    const ov = deep.overview
    const n = ov.definition.n
    expect(ov.users).toBe(meta.users)
    expect(ov.everActive + ov.neverActive).toBe(ov.users)
    expect(ov.churned + ov.active).toBe(ov.everActive)
    expect(ov.churnedShare).toBeCloseTo(ov.churned / ov.everActive, 12)
    expect(ov.churnedShare).toBeGreaterThan(0)
    expect(ov.churnedShare).toBeLessThan(1)
    // Bağımsız sayım: son etkin günü pencere sonundan en az n gün önce olanlar
    let churned = 0
    let ever = 0
    for (let u = 0; u < users.rows; u++) {
      let last = -1
      for (let r = users.cols.day_from[u]; r < users.cols.day_to[u]; r++)
        if (days.cols.active[r] === 1) last = days.cols.day[r]
      if (last < 0) continue
      ever++
      if (meta.dayMax - last >= n) churned++
    }
    expect(ov.everActive).toBe(ever)
    expect(ov.churned).toBe(churned)

    expect(ov.periods.length).toBeGreaterThanOrEqual(2)
    for (const p of ov.periods) {
      expect(p.base).toBeGreaterThan(0)
      expect(p.churned).toBeLessThanOrEqual(p.base)
      expect(p.rate).toBeCloseTo(p.churned / p.base, 12)
      expect(p.rate).toBeGreaterThan(0)
      expect(p.rate).toBeLessThan(1)
      expect(p.from < p.to).toBe(true)
    }
    for (let i = 1; i < ov.periods.length; i++) expect(ov.periods[i].from > ov.periods[i - 1].to).toBe(true)

    expect(ov.newUsers).toBeGreaterThan(50)
    expect(ov.newUsers).toBeLessThanOrEqual(ov.everActive)
    expect(ov.survival.length).toBeGreaterThanOrEqual(5)
    for (let i = 0; i < ov.survival.length; i++) {
      const s = ov.survival[i]
      expect(s.s).toBeGreaterThan(0)
      expect(s.s).toBeLessThanOrEqual(1)
      expect(s.lo).toBeLessThanOrEqual(s.s)
      expect(s.hi).toBeGreaterThanOrEqual(s.s)
      expect(s.lo).toBeGreaterThanOrEqual(0)
      expect(s.hi).toBeLessThanOrEqual(1)
      if (i > 0) {
        expect(s.day).toBeGreaterThan(ov.survival[i - 1].day)
        expect(s.s).toBeLessThanOrEqual(ov.survival[i - 1].s)
      }
    }
    if (ov.medianLifetime !== null) expect(ov.medianLifetime).toBeGreaterThan(0)

    for (const w of ov.weekly) {
      expect(w.retained).toBeLessThanOrEqual(w.base)
      expect(w.rate).toBeCloseTo(w.retained / w.base, 12)
      expect(w.rate).toBeGreaterThan(0)
      expect(w.rate).toBeLessThanOrEqual(1)
    }
    expect(ov.weekly.map((w) => w.week)).toEqual(ov.weekly.map((_, i) => i + 1))
    expect(ov.wau.length).toBeGreaterThan(10)
    for (const w of ov.wau) expect(w.users).toBeLessThanOrEqual(ov.everActive)
    expect(ov.stickiness ?? 0).toBeGreaterThan(0)
    expect(ov.stickiness ?? 2).toBeLessThanOrEqual(1)
    for (const h of ov.hazardByTenure) {
      expect(h.terminal).toBeLessThanOrEqual(h.days)
      expect(h.rate).toBeCloseTo(h.terminal / h.days, 12)
      expect(h.rate).toBeLessThan(0.5)
    }
  })

  it('bölümler birbiriyle tutarlı: dönem churnü = model anlık görüntüsü; nedenler toplamı 1', () => {
    const { overview: ov, model, triggers, reasons, segments } = deep
    expect(model).not.toBeNull()
    expect(triggers).not.toBeNull()
    expect(reasons).not.toBeNull()
    expect(segments).not.toBeNull()
    if (!model || !triggers || !reasons || !segments) return
    // En yeni anlık görüntü son dönemle aynı kullanıcılar ve aynı etiket
    const lastPeriod = ov.periods[ov.periods.length - 1]
    const lastSnap = model.snapshots[model.snapshots.length - 1]
    expect(lastSnap.role).toBe('sınama')
    expect(lastSnap.n).toBe(lastPeriod.base)
    expect(lastSnap.churnRate).toBeCloseTo(lastPeriod.rate, 12)
    expect(model.snapshots.slice(0, -1).every((s) => s.role === 'eğitim')).toBe(true)
    expect(sumOf(model.snapshots.map((s) => s.n))).toBe(model.rows)
    expect(model.churnRate).toBeGreaterThan(0)
    expect(model.churnRate).toBeLessThan(1)
    expect(segments.baseRate).toBeCloseTo(model.churnRate, 12)
    // Model sınama kümesinde rastgeleden belirgin iyi; ağaç modeli de çalıştı
    expect(model.logistic.auc).toBeGreaterThan(0.7)
    expect(model.logistic.auc).toBeLessThanOrEqual(1)
    expect(model.gbdt).not.toBeNull()
    expect(model.gbdt?.auc ?? 0).toBeGreaterThan(0.7)
    expect(sumOf(model.calibration.map((c) => c.n))).toBe(lastSnap.n)
    for (let i = 1; i < model.drivers.length; i++)
      expect(model.drivers[i].iv).toBeLessThanOrEqual(model.drivers[i - 1].iv)
    for (const dr of model.drivers)
      for (const b of dr.bins) {
        expect(b.rate).toBeCloseTo(b.churned / b.n, 12)
        expect(b.lo).toBeLessThanOrEqual(b.rate)
        expect(b.hi).toBeGreaterThanOrEqual(b.rate)
      }

    // Tetikleyiciler: genel oran, yaşanan / yaşanmayan günlerin ağırlıklı ortalamasıdır
    expect(triggers.baseRate).toBeCloseTo(triggers.terminal / triggers.days, 12)
    expect(triggers.rows.length).toBeGreaterThan(5)
    for (const t of triggers.rows) {
      expect(t.prevalence).toBeCloseTo(t.exposedDays / triggers.days, 12)
      expect(t.prevalence * t.rateWith + (1 - t.prevalence) * t.rateWithout).toBeCloseTo(triggers.baseRate, 10)
      expect(t.lo).toBeLessThanOrEqual(t.rr)
      expect(t.hi).toBeGreaterThanOrEqual(t.rr)
      expect(t.pAdj).toBeGreaterThanOrEqual(t.p - 1e-15)
      expect(t.pAdj).toBeLessThanOrEqual(1)
      expect(t.attributableShare).toBeGreaterThanOrEqual(0)
      expect(t.attributableShare).toBeLessThanOrEqual(1)
    }
    for (let i = 1; i < triggers.rows.length; i++)
      expect(triggers.rows[i].attributable).toBeLessThanOrEqual(triggers.rows[i - 1].attributable)

    // Nedenler: aile payları + taban = 1 (hem kesirli atıf hem birincil neden)
    expect(reasons.churners).toBe(triggers.terminal)
    expect(sumOf(reasons.rows.map((r) => r.fraction)) + reasons.baselineFraction).toBeCloseTo(1, 9)
    expect(sumOf(reasons.rows.map((r) => r.share)) + reasons.baselineShare).toBeCloseTo(1, 9)
    expect(sumOf(reasons.rows.map((r) => r.churners))).toBeLessThanOrEqual(reasons.churners)
    for (const r of reasons.rows) {
      expect(r.fraction).toBeGreaterThanOrEqual(0)
      expect(r.share).toBeCloseTo(r.churners / reasons.churners, 12)
      expect(r.avoidableShare).toBeGreaterThanOrEqual(0)
      expect(r.avoidableShare).toBeLessThan(1)
    }

    // Bulgular: önem sırasında, numaralı, kanıtlı
    expect(deep.findings.length).toBeGreaterThan(5)
    deep.findings.forEach((f, i) => {
      expect(f.id).toBe(`b${i + 1}`)
      expect(f.title.length).toBeGreaterThan(10)
      expect(f.evidence.length).toBeGreaterThan(10)
      if (i > 0) expect(f.severity).toBeLessThanOrEqual(deep.findings[i - 1].severity)
    })
    expect(deep.caveats.length).toBeGreaterThan(0)
    expect(deep.status).toEqual(statusOf(meta))
  })

  it('yeni kullanıcı analizi: oranlar ve aralıklar tutarlı', () => {
    const early = deep.early
    expect(early).not.toBeNull()
    if (!early) return
    expect(early.window).toBe(7)
    expect(early.users).toBeGreaterThanOrEqual(120)
    expect(early.users).toBeLessThanOrEqual(deep.overview.newUsers)
    expect(early.churnRate).toBeGreaterThan(0)
    expect(early.churnRate).toBeLessThan(1)
    for (const m of early.moments) {
      expect(m.share).toBeGreaterThan(0)
      expect(m.share).toBeLessThan(1)
      expect(m.rr).toBeCloseTo(m.rateWith / m.rateWithout, 10)
      expect(m.lo).toBeLessThanOrEqual(m.rr)
      expect(m.hi).toBeGreaterThanOrEqual(m.rr)
      // Yapan ve yapmayanların ağırlıklı ortalaması genel oran
      expect(m.share * m.rateWith + (1 - m.share) * m.rateWithout).toBeCloseTo(early.churnRate, 10)
    }
  })

  it('elle verilen churn süresi kullanılır; geçersiz süre reddedilir', () => {
    const manual = runDeep(labOther, { n: 14, gbdt: false }).result
    expect(manual.overview.definition).toMatchObject({ n: 14, chosenBy: 'elle' })
    // Daha kısa süre → pencere sonunda daha çok kullanıcı gitmiş sayılır
    expect(manual.overview.churned).toBeGreaterThanOrEqual(deepOther.overview.churned)
    expect(manual.model?.gbdt).toBeNull()
    expect(() => runDeep(labOther, { n: 0 })).toThrow(/Churn süresi 1 ile/)
    expect(() => runDeep(labOther, { n: 5000 })).toThrow(/Churn süresi 1 ile/)
    // Varsayılan tanımla yeniden çalıştırınca sonuç dosyası eski hâline döner
    expect(comparable(runDeep(labOther).result)).toEqual(comparable(deepOther))
  })
})

describe('belirlenimcilik', () => {
  it('aynı dosya + aynı anahtar → bayt bayt aynı tablolar', () => {
    const first = tableBytes(lab)
    expect([...bytesAgain.keys()]).toEqual([...first.keys()])
    const changed = [...first]
      .filter(([name, bytes]) => !bytes.equals(bytesAgain.get(name) ?? Buffer.alloc(0)))
      .map(([name]) => name)
    expect(changed).toEqual([])
    expect({ ...metaAgain, dataRev: '', builtAt: '', seconds: 0 }).toEqual({
      ...meta,
      dataRev: '',
      builtAt: '',
      seconds: 0,
    })
    for (const f of ['baslik.json', 'demet.json'])
      expect(readFileSync(join(labAgain.tableDir, f), 'utf8')).toBe(readFileSync(join(lab.tableDir, f), 'utf8'))
  })

  it('churn analizi iki kurulumda ve art arda iki koşuda aynı sonucu verir', () => {
    expect(comparable(deepAgain)).toEqual(comparable(deep))
    expect(comparable(runDeep(lab).result)).toEqual(comparable(deep))
    const saved = JSON.parse(readFileSync(join(lab.resultDir, 'churn.json'), 'utf8')) as {
      name: string
      dataRev: string
      data: ChurnDeep
    }
    expect(saved.name).toBe('churn')
    expect(saved.dataRev).toBe(meta.dataRev)
    expect(comparable(saved.data)).toEqual(comparable(deep))
  })

  it('analiz takma kimlik anahtarından bağımsızdır (anahtar yalnız kimlikleri değiştirir)', () => {
    expect(metaOther.kinds).toEqual(meta.kinds)
    expect(metaOther).toMatchObject({
      users: meta.users,
      events: meta.events,
      userDays: meta.userDays,
      sessions: meta.sessions,
      facts: meta.facts,
    })
    // Kullanıcı sırası değişir ama sayımlar ve genel görünüm aynı kalır
    expect(JSON.parse(JSON.stringify(deepOther.overview))).toEqual(JSON.parse(JSON.stringify(deep.overview)))
    expect(deepOther.triggers?.days).toBe(deep.triggers?.days)
    expect(deepOther.triggers?.terminal).toBe(deep.triggers?.terminal)
    expect(deepOther.model?.rows).toBe(deep.model?.rows)
  })
})

describe('gizlilik', () => {
  const outputs: string[] = []
  let files: { path: string; bytes: Buffer }[] = []
  let everything: Buffer

  beforeAll(async () => {
    // Denetim günlüğü de taransın diye lab'a birkaç komut yazdırılır
    const commands: string[][] = [
      ['durum'],
      ['churn'],
      ['churn', 'genel'],
      ['churn', 'neden'],
      ['churn', 'tetik', '--limit', '30'],
      ['churn', 'kim', '--limit', '40'],
      ['churn', 'etken', '--limit', '40'],
      ['churn', 'yeni'],
      ['churn', 'tanim'],
      ['churn', '--json'],
      ['durum', '--json'],
      ['sorgu', 'kullanici', '--grup', 'plan,cihaz', '--olc', 'n,kisi,oran(churn),ort(izleme_dk)'],
      ['sorgu', 'gun', '--grup', 'platform', '--olc', 'n,kisi,p90(izleme_dk),maks(events)', '--json'],
      ['sorgu', 'oturum', '--grup', 'saat:6', '--olc', 'n,kisi,ort(dur_sec)'],
      ['sorgu', 'baslik', '--grup', 'klass', '--olc', 'n,top(plays),maks(viewers)'],
      ['sorgu', 'anlik', '--grup', 'sehir', '--olc', 'n,kisi,oran(churn)'],
      ['gunluk', '--tam', '--son', '50'],
    ]
    for (const argv of commands) outputs.push(await execute([...argv, '--lab', lab.dir], parseArgs, undefined, true))
    files = [lab, labAgain, labSample, labOther]
      .flatMap((l) => walk(l.dir))
      .map((path) => ({ path, bytes: readFileSync(path) }))
    everything = Buffer.concat([...files.map((f) => f.bytes), Buffer.from(outputs.join('\n'), 'utf8')])
  }, 120_000)

  it('ham dosyada kişisel veri gerçekten var (tarama anlamlı olsun) ve tarayıcı onu buluyor', () => {
    expect(pii.ids).toHaveLength(ref.users.size)
    expect(pii.ids.every((id) => /^sentetik-11-[0-9a-f]{12}$/.test(id))).toBe(true)
    expect(pii.emails.length).toBeGreaterThan(50)
    expect(pii.emails.every((e) => /^kisi\d+@ornek-posta\.example$/.test(e))).toBe(true)
    expect(pii.phones.length).toBeGreaterThan(50)
    expect(pii.phones.every((p) => /^90532\d{7}$/.test(p))).toBe(true)
    expect(pii.ips.length).toBeGreaterThan(50)
    expect(pii.ips.every((ip) => /^10\.\d+\.\d+\.7$/.test(ip))).toBe(true)
    expect(pii.names.length).toBeGreaterThan(50)
    expect(pii.insertIds.size).toBeGreaterThan(ref.distinct * 0.99)
    expect(pii.searchTerms.size).toBeGreaterThan(5)
    // Tarayıcının kendisi: gürültü içine gömülü değerleri bulur, olmayanı bulmaz
    const hay = Buffer.from(
      `\u0000\u0001xx${pii.ids[3]}yy 10.9 Ad ${pii.names[1]} · ${pii.phones[2]}0 ${pii.ips[4]}!${pii.emails[0]}`,
      'utf8',
    )
    expect(findNeedles(hay, pii.ids)).toEqual([pii.ids[3]])
    expect(findNeedles(hay, pii.names)).toEqual([pii.names[1]])
    expect(findNeedles(hay, pii.phones)).toEqual([pii.phones[2]])
    expect(findNeedles(hay, pii.ips)).toEqual([pii.ips[4]])
    expect(findNeedles(hay, pii.emails)).toEqual([pii.emails[0]])
    expect(findNeedles(Buffer.from('sentetik-11-000000000000 kisi@ornek-posta.example 905320000000'), pii.ids)).toEqual(
      [],
    )
  })

  it('ham kimlik, e-posta, telefon, IP ve ad hiçbir lab dosyasında ve hiçbir çıktıda yok', () => {
    // Depo, sözlükler, kayıt defteri, tablolar, yan JSON dosyaları, sonuçlar, denetim günlüğü — dört kurulumun tamamı
    const kinds = new Set(
      files.map((f) => f.path.slice(f.path.lastIndexOf('/') + 1).replace(/^kova-\d+\.bin$/, 'kova.bin')),
    )
    for (const must of [
      'kova.bin',
      'sozluk.json',
      'alim.json',
      'meta.json',
      'baslik.json',
      'demet.json',
      'churn.json',
      'ciktilar.ndjson',
      'uid_hi.bin',
    ])
      expect(kinds.has(must), must).toBe(true)
    expect(everything.length).toBeGreaterThan(10_000_000)
    expect(findNeedles(everything, pii.ids)).toEqual([])
    expect(findNeedles(everything, pii.emails)).toEqual([])
    expect(findNeedles(everything, pii.phones)).toEqual([])
    expect(findNeedles(everything, pii.ips)).toEqual([])
    expect(findNeedles(everything, pii.names)).toEqual([])
    // Değerlerden bağımsız işaretler: özellik adları ve değer kalıpları (ikili dosyalar dahil)
    for (const marker of [
      'sentetik-',
      'ornek-posta',
      'Soyad',
      'msisdn',
      '$email',
      '$name',
      'search_term',
      '$insert_id',
    ])
      expect(
        files.filter((f) => f.bytes.includes(marker)).map((f) => f.path.slice(root.length + 1)),
        `'${marker}' içeren dosyalar`,
      ).toEqual([])
    // Kısa işaretler ikili veride rastlantıyla geçebilir: yalnız metin dosyalarında aranır
    const text = files.filter((f) => /\.(json|ndjson)$/.test(f.path))
    for (const marker of ['@', '$ip'])
      expect(
        text.filter((f) => f.bytes.includes(marker)).map((f) => f.path.slice(root.length + 1)),
        `'${marker}' içeren metin dosyaları`,
      ).toEqual([])
    for (const f of text) expect(f.bytes.toString('utf8')).not.toMatch(/\b10\.\d{1,3}\.\d{1,3}\.7\b|90532\d{7}/)
    for (const o of outputs) {
      expect(o).not.toMatch(/sentetik-|ornek-posta|Soyad\d|@|msisdn|\$insert_id|search_term/)
      expect(o).not.toMatch(/\b10\.\d+\.\d+\.7\b/)
      expect(o).not.toMatch(/90532\d{7}/)
    }
  })

  it('olay kimlikleri ($insert_id) ve arama metinleri saklanmaz', () => {
    const text = files.filter((f) => /\.(json|ndjson)$/.test(f.path))
    expect(text.length).toBeGreaterThan(20)
    let hexTokens = 0
    for (const f of text)
      for (const m of f.bytes.toString('utf8').matchAll(/[0-9a-f]{20}/g)) {
        hexTokens++
        expect(pii.insertIds.has(m[0])).toBe(false)
      }
    for (const o of outputs) for (const m of o.matchAll(/[0-9a-f]{20}/g)) expect(pii.insertIds.has(m[0])).toBe(false)
    expect(hexTokens).toBeLessThan(50)
    // Arama metni: depo ve tablo sözlüklerindeki hiçbir dizge bir arama metnine eşit değil (içerik adları saklanır,
    // kullanıcının yazdığı metin saklanmaz)
    const stored = new Set<string>()
    for (const f of text) {
      if (!/\/(depo|tablo)\//.test(f.path)) continue
      jsonStrings(JSON.parse(f.bytes.toString('utf8')), stored)
    }
    expect(stored.size).toBeGreaterThan(500)
    expect([...pii.searchTerms].filter((t) => stored.has(t))).toEqual([])
  })

  it('takma kimlik = HMAC-SHA256(anahtar, ham kimlik) ilk 8 bayt; anahtar değişince tüm kimlikler değişir', () => {
    const pairs = (t: Table): Set<string> => {
      const out = new Set<string>()
      for (let u = 0; u < t.rows; u++) out.add(pairKey(t.cols.uid_hi[u], t.cols.uid_lo[u]))
      return out
    }
    const expected = (secret: string): Set<string> =>
      new Set(pii.ids.map((id) => pairKey(pseudonym(secret, id).hi, pseudonym(secret, id).lo)))
    const mine = pairs(users)
    const other = pairs(loadTable(labOther.tableDir, 'kullanici'))
    expect(mine.size).toBe(users.rows)
    expect(mine).toEqual(expected(SECRET))
    expect(other).toEqual(expected(OTHER_SECRET))
    // Ortak tek bir takma kimlik bile yok; aynı anahtarla kurulan ikinci lab ise birebir aynı kimlikleri verir
    expect([...mine].filter((p) => other.has(p))).toEqual([])
    expect(pairs(loadTable(labAgain.tableDir, 'kullanici'))).toEqual(mine)
    // Lab'ın kendi üreteci bağımsız hesapla aynı
    const uidOf = createUidFn(Buffer.from(SECRET, 'utf8'))
    for (const id of pii.ids.slice(0, 50)) expect(uidOf(id)).toEqual(pseudonym(SECRET, id))
    // Anahtar lab klasörüne düz metin olarak yazılmaz (bu testte ortam değişkeninden gelir)
    expect(everything.includes(SECRET)).toBe(false)
    expect(everything.includes(OTHER_SECRET)).toBe(false)
    expect(existsSync(join(lab.dir, 'anahtar'))).toBe(false)
  })

  it('anahtar dosyası: rastgele, 0600 izinli ve kalıcı; ortam değişkeni ve açıkça verilen anahtar önceliklidir', () => {
    const saved = process.env.TVP_LAB_SECRET
    delete process.env.TVP_LAB_SECRET
    try {
      const dirA = join(root, 'lab-anahtar-a')
      const a = openLab({ dir: dirA })
      const file = join(dirA, 'anahtar')
      expect(a.key).toHaveLength(32)
      expect(readFileSync(file, 'utf8')).toMatch(/^[0-9a-f]{64}$/)
      expect(statSync(file).mode & 0o777).toBe(0o600)
      // Yeniden açınca aynı anahtar; başka lab başka anahtar
      expect(openLab({ dir: dirA }).key.equals(a.key)).toBe(true)
      expect(openLab({ dir: join(root, 'lab-anahtar-b') }).key.equals(a.key)).toBe(false)
      // Aynı ham kimlik iki labda farklı takma kimlik alır
      const other = openLab({ dir: join(root, 'lab-anahtar-b') })
      expect(createUidFn(a.key)('kullanici-1')).not.toEqual(createUidFn(other.key)('kullanici-1'))
      process.env.TVP_LAB_SECRET = 'ortam-anahtari'
      expect(openLab({ dir: dirA }).key.toString('utf8')).toBe('ortam-anahtari')
      expect(openLab({ dir: dirA, secret: 'acik-anahtar' }).key.toString('utf8')).toBe('acik-anahtar')
      // Ortam değişkeni dosyadaki anahtarı değiştirmez
      delete process.env.TVP_LAB_SECRET
      expect(openLab({ dir: dirA }).key.equals(a.key)).toBe(true)
    } finally {
      process.env.TVP_LAB_SECRET = saved
    }
  })

  it('sonuç dosyalarında ve çıktılarda kullanıcı düzeyi veri yok (kimlik anahtarlı ya da kullanıcı boyunda dizi)', () => {
    const results = walk(lab.resultDir)
    expect(results.map((p) => p.slice(lab.resultDir.length + 1)).sort()).toEqual(['churn-risk.json', 'churn.json'])
    const uidDec = new Set<string>()
    const uidHex = new Set<string>()
    for (let u = 0; u < users.rows; u++)
      for (const v of [users.cols.uid_hi[u], users.cols.uid_lo[u]]) {
        // Küçük sayılar sıradan sayımlarla karışmasın
        if (v < 1e6) continue
        uidDec.add(String(v))
        uidHex.add(v.toString(16).padStart(8, '0'))
      }
    expect(uidDec.size).toBeGreaterThan(users.rows)
    const texts = [
      ...results.map((p) => readFileSync(p, 'utf8')),
      readFileSync(join(lab.logDir, 'ciktilar.ndjson'), 'utf8'),
      ...outputs,
    ]
    for (const text of texts) {
      for (const m of text.matchAll(/\d{7,}/g)) expect(uidDec.has(m[0]), `takma kimlik (onluk) ${m[0]}`).toBe(false)
      for (const m of text.matchAll(/\b[0-9a-f]{8}\b/gi))
        expect(uidHex.has(m[0].toLowerCase()), `takma kimlik (onaltılık) ${m[0]}`).toBe(false)
    }
    // Yapı: kullanıcı sayısıyla ölçeklenen dizi / nesne yok; kimlik benzeri anahtar yok
    let longest = 0
    let widest = 0
    const keys = new Set<string>()
    const visit = (v: unknown): void => {
      if (Array.isArray(v)) {
        longest = Math.max(longest, v.length)
        v.forEach(visit)
      } else if (v && typeof v === 'object') {
        const entries = Object.entries(v)
        widest = Math.max(widest, entries.length)
        for (const [k, x] of entries) {
          keys.add(k)
          visit(x)
        }
      }
    }
    for (const p of results) visit(JSON.parse(readFileSync(p, 'utf8')))
    expect(longest).toBeLessThan(users.rows / 4)
    expect(widest).toBeLessThan(users.rows / 4)
    expect([...keys].filter((k) => /uid|user_?id|kullanici_?(id|kimlik)|distinct|kimlik|pseudonym/i.test(k))).toEqual(
      [],
    )
  })

  it('churn kırılımlarındaki her grup en az kAnonim TEKİL kullanıcı içerir', () => {
    // docs/LAB.md: "sorgu ve tüm kırılımlar en az 20 kullanıcılı grupları gösterir". Anlık görüntü çerçevesinde bir
    // kullanıcı birden çok satırdır (anlık görüntü başına bir); eşik satıra değil kullanıcıya uygulanmalı.
    const k = lab.settings.kAnonim
    expect(k).toBe(20)
    const d = loadChurnData(lab)
    const frame = buildFrame(d, deep.overview.definition)
    expect(frame.rows).toBe(deep.model?.rows)
    const usersOf = (dim: string, value: string): number => {
      const cat = frame.cats.find((c) => c.key === dim)
      if (!cat) throw new Error(`boyut yok: ${dim}`)
      const code = cat.dict.indexOf(value)
      const seen = new Set<number>()
      for (let i = 0; i < frame.rows; i++) if (cat.codes[i] === code) seen.add(frame.uid[i])
      return seen.size
    }
    const small: string[] = []
    for (const row of deep.segments?.dims ?? []) {
      const n = usersOf(row.dim, row.value)
      if (n < k) small.push(`churn kim: ${row.dim} = ${row.value} → ${row.n} satır, ${n} kullanıcı`)
    }
    for (const dr of deep.model?.drivers ?? []) {
      if (dr.kind !== 'kategori') continue
      for (const b of dr.bins) {
        if (b.label === 'diğer') continue
        const n = usersOf(dr.feature, b.label)
        if (n < k) small.push(`churn etken ${dr.feature}: ${b.label} → ${b.n} satır, ${n} kullanıcı`)
      }
    }
    expect(small, `${k} kullanıcıdan küçük gruplar sonuçta yer alıyor`).toEqual([])
  })
})
