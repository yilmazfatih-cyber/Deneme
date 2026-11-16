/**
 * İçe alma: Mixpanel dışa aktarımı (JSONL / .gz / düz JSONL / CSV) → kanonik kayıtlar → olay deposu.
 *
 * Gizlilik ve küçültme (hepsi bu aşamada, veri diske inmeden):
 *   - Kullanıcı kimliği HMAC-SHA256 ile 64 bitlik takma kimliğe çevrilir; ham kimlik hiçbir yere yazılmaz.
 *   - Yalnız eşlemede adı geçen özellikler okunur. Arama metni, e-posta, IP, cihaz kimliği vb. saklanmaz.
 *   - İsteğe bağlı kullanıcı örneklemesi: `sample` oranındaki kullanıcıların TÜM olayları alınır (kullanıcı bazlı,
 *     belirleyici), kalanlar ayrıştırılmadan atlanır. Churn analizi kullanıcı örneklemiyle yapılabilir; olay
 *     örneklemesiyle yapılamaz (kullanıcının geçmişi delik deşik olur).
 */
import { createHmac } from 'node:crypto'
import { closeSync, createReadStream, openSync, readSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { Readable } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import { createGunzip } from 'node:zlib'
import type { Lab } from '../core/lab'
import { FLAG_COMPLETED, FLAG_EMPTY, FLAG_LIVE, FLAG_NO_V1, K, KINDS, type LabRecord } from './events'
import {
  boolOf,
  compileMapping,
  matchRule,
  namesOf,
  numOf,
  pick,
  strOf,
  timeOf,
  type CompiledMapping,
  type CompiledRule,
  type LabMapping,
  type LabMappingInput,
} from './mapping'
import {
  DEFAULT_BUCKETS,
  emptyManifest,
  loadManifest,
  resetStore,
  saveManifest,
  StoreDictionaries,
  StoreWriter,
  type IngestRecord,
  type StoreManifest,
} from './store'

/* ───────────── Yerleşik değer sözlükleri (eşlemedeki haritaların altında yedek) ───────────── */

export const BUILTIN_DEVICE: Record<string, number> = {
  tv: 1,
  'smart tv': 1,
  smarttv: 1,
  'android tv': 1,
  androidtv: 1,
  tvos: 1,
  'apple tv': 1,
  appletv: 1,
  tizen: 1,
  webos: 1,
  roku: 1,
  'fire tv': 1,
  firetv: 1,
  stb: 1,
  'set top box': 1,
  ios: 2,
  iphone: 2,
  ipad: 2,
  ipados: 2,
  android: 2,
  mobile: 2,
  mobil: 2,
  phone: 2,
  tablet: 2,
  web: 3,
  browser: 3,
  desktop: 3,
  windows: 3,
  'mac os x': 3,
  macos: 3,
  linux: 3,
  'chrome os': 3,
}
export const BUILTIN_TYPE: Record<string, number> = {
  movie: 1,
  film: 1,
  vod: 1,
  episode: 2,
  series: 2,
  serie: 2,
  show: 2,
  dizi: 2,
  bolum: 2,
  bölüm: 2,
  tvshow: 2,
  live: 3,
  canli: 3,
  canlı: 3,
  channel: 3,
  kanal: 3,
  linear: 3,
  livetv: 3,
  sport: 4,
  sports: 4,
  spor: 4,
  match: 4,
  mac: 4,
  maç: 4,
  trailer: 5,
  fragman: 5,
  clip: 5,
  klip: 5,
}

/* ───────────── Dosya okuma ───────────── */

export type InputFormat = 'jsonl' | 'json' | 'csv'

function isGzip(path: string): boolean {
  const fd = openSync(path, 'r')
  try {
    const b = Buffer.alloc(2)
    return readSync(fd, b, 0, 2, 0) === 2 && b[0] === 0x1f && b[1] === 0x8b
  } finally {
    closeSync(fd)
  }
}

/** Dosyayı (gerekirse gzip açarak) satır öbekleri hâlinde okur. */
export async function* readLines(path: string): AsyncGenerator<string[]> {
  const raw = createReadStream(path, { highWaterMark: 1 << 20 })
  const src: Readable = isGzip(path) ? raw.pipe(createGunzip()) : raw
  const decoder = new StringDecoder('utf8')
  let carry = ''
  for await (const chunk of src) {
    const text = carry + decoder.write(chunk as Buffer)
    const parts = text.split('\n')
    carry = parts.pop() ?? ''
    if (parts.length) yield parts
  }
  const tail = carry + decoder.end()
  if (tail.length) yield [tail]
}

/** CSV satırını alanlara böler (çift tırnak, kaçışlı tırnak; ayırıcı verilir). */
export function splitCsv(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else quoted = false
      } else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

export interface RawEvent {
  /** Satırın en üst düzeyi */
  top: Record<string, unknown>
  /** Özellikler (iç içe `properties` ya da en üst düzey) */
  props: Record<string, unknown>
}

/**
 * Dosyadaki olayları nesne öbekleri hâlinde verir. Biçim ilk dolu satırdan anlaşılır:
 * '{' → JSONL · '[' → tek JSON dizisi (küçük dosyalar) · başka → başlıklı CSV.
 * Ayrıştırılamayan satırlar `onBad` ile bildirilir.
 */
export async function* readEvents(
  path: string,
  opts: {
    propertiesKey: string | null
    onBad?: () => void
    prefilter?: (line: string) => boolean
    onSkip?: () => void
  },
): AsyncGenerator<RawEvent[]> {
  let format: InputFormat | null = null
  let header: string[] = []
  let sep = ','
  let jsonArray = ''
  // CSV'de tırnak içinde satır sonu olabilir: tamamlanmamış satır bir sonrakiyle birleşir
  let pendingCsv = ''
  const wrap = (obj: unknown): RawEvent | null => {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null
    const top = obj as Record<string, unknown>
    const inner = opts.propertiesKey ? top[opts.propertiesKey] : undefined
    const props =
      typeof inner === 'object' && inner !== null && !Array.isArray(inner) ? (inner as Record<string, unknown>) : top
    return { top, props }
  }
  for await (const lines of readLines(path)) {
    const batch: RawEvent[] = []
    for (let line of lines) {
      if (format === null) {
        const t = line.trimStart()
        if (!t) continue
        if (t.charCodeAt(0) === 0xfeff) line = t.slice(1)
        const first = line.trimStart()[0]
        format = first === '{' ? 'jsonl' : first === '[' ? 'json' : 'csv'
        if (format === 'csv') {
          const tabs = (line.match(/\t/g) ?? []).length
          const semis = (line.match(/;/g) ?? []).length
          const commas = (line.match(/,/g) ?? []).length
          sep = tabs > commas && tabs > semis ? '\t' : semis > commas ? ';' : ','
          header = splitCsv(line.replace(/\r$/, ''), sep).map((h) => h.trim())
          continue
        }
      }
      if (format === 'jsonl') {
        if (line.length < 2) continue
        if (opts.prefilter && !opts.prefilter(line)) {
          opts.onSkip?.()
          continue
        }
        try {
          const ev = wrap(JSON.parse(line))
          if (ev) batch.push(ev)
          else opts.onBad?.()
        } catch {
          opts.onBad?.()
        }
      } else if (format === 'json') {
        jsonArray += `${line}\n`
        if (jsonArray.length > 400_000_000)
          throw new Error('Tek JSON dizisi çok büyük. Satır başına bir olay (JSONL) biçiminde dışa aktarın.')
      } else {
        let row = pendingCsv ? `${pendingCsv}\n${line}` : line
        if (((row.match(/"/g) ?? []).length & 1) === 1) {
          pendingCsv = row
          continue
        }
        pendingCsv = ''
        row = row.replace(/\r$/, '')
        if (!row) continue
        const cells = splitCsv(row, sep)
        const obj: Record<string, unknown> = {}
        for (let i = 0; i < header.length; i++) if (cells[i] !== undefined && cells[i] !== '') obj[header[i]] = cells[i]
        batch.push({ top: obj, props: obj })
      }
    }
    if (batch.length) yield batch
  }
  if (format === 'json') {
    let arr: unknown
    try {
      arr = JSON.parse(jsonArray)
    } catch {
      throw new Error('Dosya geçerli bir JSON değil.')
    }
    if (!Array.isArray(arr)) throw new Error('JSON dosyası bir olay dizisi olmalı.')
    const batch: RawEvent[] = []
    for (const x of arr) {
      const ev = wrap(x)
      if (ev) batch.push(ev)
      else opts.onBad?.()
    }
    if (batch.length) yield batch
  }
}

/** Girdi yolları: dosya ya da klasör (içindeki .json/.jsonl/.csv/.gz/.ndjson/.txt dosyaları, ada göre sıralı). */
export function expandInputs(paths: readonly string[]): string[] {
  const out: string[] = []
  for (const p of paths) {
    const st = statSync(p)
    if (st.isDirectory()) {
      for (const f of readdirSync(p).sort())
        if (/\.(jsonl?|ndjson|csv|tsv|txt|gz)$/i.test(f) && statSync(join(p, f)).isFile()) out.push(join(p, f))
    } else out.push(p)
  }
  return out
}

/* ───────────── Kimlik ───────────── */

export interface Uid {
  hi: number
  lo: number
}

/** Takma kimlik üreteci (önbellekli). */
export function createUidFn(key: Buffer): (raw: string) => Uid {
  let cache = new Map<string, Uid>()
  return (raw) => {
    const hit = cache.get(raw)
    if (hit) return hit
    const d = createHmac('sha256', key).update(raw).digest()
    const u: Uid = { hi: d.readUInt32BE(0), lo: d.readUInt32BE(4) }
    if (cache.size >= 400_000) cache = new Map()
    cache.set(raw, u)
    return u
  }
}

/* ───────────── Dönüştürme ───────────── */

export interface IngestReport {
  file: string
  format: string
  lines: number
  accepted: number
  /** Bozuk satır, kullanıcı kimliği ya da zamanı okunamayan olay */
  rejected: number
  /** Kullanıcı örneklemesinin dışında kalan */
  sampledOut: number
  ignored: number
  /** Eşlemede karşılığı olmayan olay adı → adet (en sık 40) */
  unmapped: Record<string, number>
  unmappedTotal: number
  byKind: Record<string, number>
  firstTs: number | null
  lastTs: number | null
  warnings: string[]
  seconds: number
}

export interface IngestOptions {
  mapping: LabMappingInput | LabMapping
  /** Kullanıcı örnekleme oranı (0–1]; depo boş değilse depodaki oran kullanılır */
  sample?: number
  buckets?: number
  /** Depoyu boşaltıp baştan başla */
  reset?: boolean
  /** Sentetik demo verisi (çıktılarda etiketlenir) */
  synthetic?: boolean
  /** Hiçbir şey yazma; yalnız rapor üret */
  dryRun?: boolean
  onProgress?: (lines: number) => void
}

class Transformer {
  readonly m: CompiledMapping
  readonly dict: StoreDictionaries
  readonly uidOf: (raw: string) => Uid
  readonly sampleLimit: number
  private readonly dimCodes: number[]
  private readonly fastUser: RegExp | null
  readonly dimWarned = new Set<string>()
  /** Kural eşleşmeyen olaylarda cihaz özelliği: genel `props.device` */
  private readonly deviceKeys: string[]

  constructor(m: CompiledMapping, dict: StoreDictionaries, key: Buffer, sample: number) {
    this.m = m
    this.dict = dict
    this.uidOf = createUidFn(key)
    this.sampleLimit = sample >= 1 ? 4294967296 : Math.floor(sample * 4294967296)
    this.dimCodes = new Array<number>(m.dimNames.length + 1).fill(0)
    this.deviceKeys = namesOf(m.raw.props.device)
    const k = m.userKeys[0]
    this.fastUser =
      sample < 1 && m.userKeys.length >= 1 && /^[\w$]+$/.test(k)
        ? new RegExp(`"${k.replace('$', '\\$')}"\\s*:\\s*"([^"\\\\]*)"`)
        : null
  }

  /** Ayrıştırmadan örnekleme ön süzgeci: satırdaki kullanıcı kimliği örneklem dışındaysa false. */
  prefilter = (line: string): boolean => {
    if (!this.fastUser) return true
    const hit = this.fastUser.exec(line)
    if (!hit) return true
    return this.uidOf(hit[1]).hi < this.sampleLimit
  }

  private device(v: unknown): number {
    const s = strOf(v)
    if (!s) return 0
    const key = s.trim().toLowerCase()
    return this.m.deviceMap.get(key) ?? BUILTIN_DEVICE[key] ?? 4
  }
  private contentClass(v: unknown): number {
    const s = strOf(v)
    if (!s) return 0
    const key = s.trim().toLowerCase()
    return this.m.typeMap.get(key) ?? BUILTIN_TYPE[key] ?? 6
  }

  /**
   * Olayı kayda çevirir. Dönüş: kayıt | 'ignored' | 'sampled' | 'rejected' | { unmapped: ad } (keepUnmapped kapalıyken).
   * `unmappedName` dolu dönerse olay 'OTHER' olarak saklanmıştır ve adı sayılmalıdır.
   */
  transform(
    ev: RawEvent,
    out: LabRecord,
  ): { status: 'ok' | 'ignored' | 'sampled' | 'rejected' | 'dropped'; unmappedName?: string } {
    const m = this.m
    const props = ev.props
    const name = strOf(pick(ev.top, m.eventKeys) ?? pick(props, m.eventKeys))
    if (!name) return { status: 'rejected' }
    if (m.ignore.has(name)) return { status: 'ignored' }
    const rawUser = strOf(pick(props, m.userKeys) ?? pick(ev.top, m.userKeys))
    if (!rawUser) return { status: 'rejected' }
    const uid = this.uidOf(rawUser)
    if (uid.hi >= this.sampleLimit) return { status: 'sampled' }
    const ts = timeOf(m, props, ev.top)
    if (ts === null) return { status: 'rejected' }

    const rules = m.rules.get(name)
    const rule: CompiledRule | null = rules ? matchRule(rules, props) : null
    out.uidHi = uid.hi
    out.uidLo = uid.lo
    out.ts = ts
    out.flags = 0
    out.aux = 0
    out.cid = 0
    out.v1 = 0
    out.v2 = -1

    // Boyut demeti: [cihaz sınıfı, …eşlemedeki boyutlar]
    const p = rule?.props
    const codes = this.dimCodes
    codes[0] = this.device(pick(props, p ? p.device : this.deviceKeys))
    for (let j = 0; j < m.dimNames.length; j++) {
      const s = strOf(pick(props, m.dimKeys[j]))
      if (!s) codes[j + 1] = 0
      else {
        const d = this.dict.dims[j + 1]
        const code = d.code(s.length > 60 ? s.slice(0, 60) : s)
        if (code === 0 && !this.dimWarned.has(m.dimNames[j])) this.dimWarned.add(m.dimNames[j])
        codes[j + 1] = code
      }
    }
    out.tuple = this.dict.tupleId(codes)

    if (!rule) {
      if (!m.raw.keepUnmapped) return { status: 'dropped', unmappedName: name }
      out.kind = K.OTHER
      return { status: 'ok', unmappedName: name }
    }

    const P = rule.props
    out.kind = K[rule.kind]
    const scale = m.durationScale
    const kind = rule.kind

    if (kind === 'EXPOSURE') {
      const exp = strOf(pick(props, P.experiment))
      const variant = strOf(pick(props, P.variant))
      if (!exp || !variant) return { status: 'rejected' }
      out.cid = this.dict.experiments.code(exp.slice(0, 120))
      out.aux = this.dict.variants.code(variant.slice(0, 120))
      return { status: 'ok' }
    }

    // İçerik
    const contentId = strOf(pick(props, P.contentId))
    let duration = 0
    if (contentId) {
      const cid = this.dict.contentId(contentId.length > 120 ? contentId.slice(0, 120) : contentId)
      out.cid = cid
      const c = this.dict.contents[cid]
      if (m.raw.storeTitles && c.title === undefined) {
        const t = strOf(pick(props, P.contentTitle))
        if (t) c.title = t.slice(0, 160)
      }
      if (c.klass === 0) {
        const k = this.contentClass(pick(props, P.contentType))
        if (k) c.klass = k
      }
      if (c.genres === undefined) {
        const g = pick(props, P.genre)
        const list = Array.isArray(g)
          ? g.map((x) => strOf(x)).filter((x): x is string => !!x)
          : typeof g === 'string'
            ? g
                .split(/[,;|]/)
                .map((x) => x.trim())
                .filter(Boolean)
            : []
        if (list.length) c.genres = list.slice(0, 4).map((x) => x.slice(0, 40))
      }
      if (c.series === 0) {
        const s = strOf(pick(props, P.seriesId))
        if (s) {
          c.series = this.dict.series.code(s.slice(0, 120))
          if (c.klass === 0) c.klass = 2
        }
      }
      if (c.season === undefined) {
        const n = numOf(pick(props, P.season))
        if (n !== null && n >= 0 && n < 1000) c.season = Math.floor(n)
      }
      if (c.episode === undefined) {
        const n = numOf(pick(props, P.episode))
        if (n !== null && n >= 0 && n < 100000) c.episode = Math.floor(n)
      }
      const d = numOf(pick(props, P.duration))
      if (d !== null && d > 0) {
        duration = Math.min(86_400, d * scale)
        if (duration > c.dur) c.dur = duration
      } else duration = c.dur
      const live = rule.live || boolOf(pick(props, P.live)) === true || c.klass === 3 || c.klass === 4
      if (live) {
        out.flags |= FLAG_LIVE
        if (c.klass === 0) c.klass = 3
      }
    } else if (rule.live || boolOf(pick(props, P.live)) === true) out.flags |= FLAG_LIVE

    if (kind === 'PLAY_START' || kind === 'PLAY_PROGRESS' || kind === 'PLAY_END') {
      const pos = numOf(pick(props, P.position))
      if (pos !== null && pos >= 0) out.v2 = Math.min(86_400, pos * scale)
      if (kind === 'PLAY_START') {
        out.v1 = duration
      } else {
        const w = numOf(pick(props, P.watched))
        if (w !== null && w >= 0) out.v1 = Math.min(86_400, w * scale)
        else out.flags |= FLAG_NO_V1
        if (kind === 'PLAY_END') {
          const done = boolOf(pick(props, P.completed))
          if (
            rule.completed ||
            done === true ||
            (done === null && duration > 0 && out.v2 >= 0 && out.v2 / duration >= m.raw.completionThreshold)
          )
            out.flags |= FLAG_COMPLETED
        }
      }
    } else if (kind === 'PLAY_ERROR' || kind === 'APP_ERROR') {
      const code = strOf(pick(props, P.errorCode))
      if (code) out.aux = this.dict.errors.code(code.slice(0, 80))
    } else if (kind === 'BUFFER') {
      const d = numOf(pick(props, P.bufferDuration))
      if (d !== null && d >= 0) out.v1 = Math.min(3600, d * scale)
      else out.flags |= FLAG_NO_V1
    } else if (kind === 'SEARCH') {
      const n = numOf(pick(props, P.resultCount))
      if (n !== null && n >= 0) {
        out.v1 = n
        if (n === 0) out.flags |= FLAG_EMPTY
      } else out.flags |= FLAG_NO_V1
      if (rule.empty) out.flags |= FLAG_EMPTY
    } else if (kind === 'IMPRESSION' || kind === 'CLICK') {
      const rank = numOf(pick(props, P.rank))
      if (rank !== null && rank >= 0) out.aux = Math.min(65_535, Math.floor(rank) + 1)
      const row = numOf(pick(props, P.row))
      if (row !== null && row >= 0) out.v2 = Math.min(10_000, row)
    } else if (kind === 'SCREEN') {
      const s = strOf(pick(props, P.screen))
      if (s) out.aux = this.dict.screens.code(s.slice(0, 80))
    } else if (kind === 'RATING') {
      const raw = pick(props, P.rating)
      const s = strOf(raw)
      const mapped = s ? this.m.ratingMap.get(s.trim().toLowerCase()) : undefined
      const n = mapped ?? numOf(raw)
      if (n !== null && n !== undefined) out.v1 = n
      else out.flags |= FLAG_NO_V1
    } else if (
      kind === 'SUBSCRIBE' ||
      kind === 'RENEW' ||
      kind === 'CANCEL' ||
      kind === 'EXPIRE' ||
      kind === 'PAYMENT_FAIL'
    ) {
      const a = numOf(pick(props, P.amount))
      if (a !== null) out.v1 = a
      else out.flags |= FLAG_NO_V1
    }
    return { status: 'ok' }
  }
}

function emptyRecord(): LabRecord {
  return { uidHi: 0, uidLo: 0, ts: 0, kind: 0, flags: 0, aux: 0, cid: 0, v1: 0, v2: -1, tuple: 0 }
}

/**
 * Dosyaları depoya alır. Aynı dosyayı yeniden almak güvenlidir (kurma aşaması birebir aynı kayıtları atar).
 */
export async function ingest(
  lab: Lab,
  paths: readonly string[],
  opts: IngestOptions,
): Promise<{ reports: IngestReport[]; manifest: StoreManifest }> {
  const mapping = compileMapping(opts.mapping)
  if (opts.reset && !opts.dryRun) resetStore(lab)
  let manifest = loadManifest(lab)
  const sample = Math.min(1, Math.max(1e-6, opts.sample ?? manifest?.sample ?? 1))
  if (manifest && manifest.events > 0 && Math.abs(manifest.sample - sample) > 1e-12)
    throw new Error(
      `Depo %${(manifest.sample * 100).toFixed(2)} kullanıcı örneklemesiyle kurulmuş; farklı oranla (%${(sample * 100).toFixed(2)}) eklenemez. ` +
        'Aynı oranı kullanın ya da --sifirla ile baştan başlayın.',
    )
  if (!manifest) manifest = emptyManifest(opts.buckets ?? DEFAULT_BUCKETS, sample)
  const dict = StoreDictionaries.load(lab.storeDir)
  dict.setDims(['cihaz', ...mapping.dimNames])
  // 'cihaz' boyutunun kodları sabittir (DEVICE_CLASSES sırası)
  if (dict.dims[0].size === 1) for (const d of ['TV', 'MOBIL', 'WEB', 'DIGER']) dict.dims[0].code(d)

  const tr = new Transformer(mapping, dict, lab.key, sample)
  const writer = opts.dryRun ? null : new StoreWriter(lab, manifest.buckets)
  const rec = emptyRecord()
  const reports: IngestReport[] = []
  const files = expandInputs(paths)
  if (!files.length) throw new Error('İçe alınacak dosya bulunamadı.')

  try {
    for (const file of files) {
      const t0 = Date.now()
      const report: IngestReport = {
        file: basename(file),
        format: '',
        lines: 0,
        accepted: 0,
        rejected: 0,
        sampledOut: 0,
        ignored: 0,
        unmapped: {},
        unmappedTotal: 0,
        byKind: {},
        firstTs: null,
        lastTs: null,
        warnings: [],
        seconds: 0,
      }
      report.format = isGzip(file) ? 'gzip' : 'düz'
      const kindCounts = new Array<number>(KINDS.length).fill(0)
      const unmapped = new Map<string, number>()
      for await (const batch of readEvents(file, {
        propertiesKey: mapping.raw.propertiesKey,
        onBad: () => {
          report.lines++
          report.rejected++
        },
        prefilter: tr.prefilter,
        onSkip: () => {
          report.lines++
          report.sampledOut++
        },
      })) {
        for (const ev of batch) {
          report.lines++
          const r = tr.transform(ev, rec)
          if (r.unmappedName) {
            report.unmappedTotal++
            unmapped.set(r.unmappedName, (unmapped.get(r.unmappedName) ?? 0) + 1)
          }
          if (r.status === 'ok') {
            report.accepted++
            kindCounts[rec.kind]++
            if (report.firstTs === null || rec.ts < report.firstTs) report.firstTs = rec.ts
            if (report.lastTs === null || rec.ts > report.lastTs) report.lastTs = rec.ts
            writer?.write(rec)
          } else if (r.status === 'ignored') report.ignored++
          else if (r.status === 'sampled') report.sampledOut++
          else if (r.status === 'rejected') report.rejected++
        }
        opts.onProgress?.(report.lines)
      }
      KINDS.forEach((k, i) => {
        if (kindCounts[i]) report.byKind[k] = kindCounts[i]
      })
      report.unmapped = Object.fromEntries([...unmapped].sort((a, b) => b[1] - a[1]).slice(0, 40))
      for (const d of tr.dimWarned)
        report.warnings.push(
          `'${d}' boyutunda ${StoreDictionaries.DIM_LIMIT}'den fazla farklı değer var; fazlası 'bilinmiyor' sayıldı. ` +
            'Bu özellik kimlik benzeri olabilir; boyut olarak eşlemeyin.',
        )
      if (report.accepted === 0 && report.lines > 0)
        report.warnings.push(
          'Hiçbir olay kabul edilmedi: eşlemedeki kullanıcı / zaman / olay adlarını denetleyin (lab kesif).',
        )
      report.seconds = Math.round((Date.now() - t0) / 100) / 10
      reports.push(report)
      if (!opts.dryRun) {
        const ir: IngestRecord = {
          file: report.file,
          at: new Date().toISOString(),
          lines: report.lines,
          accepted: report.accepted,
          rejected: report.rejected,
          sampledOut: report.sampledOut,
          ignored: report.ignored,
          unmapped: report.unmappedTotal,
          firstTs: report.firstTs,
          lastTs: report.lastTs,
        }
        manifest.ingests.push(ir)
        manifest.events += report.accepted
        if (report.firstTs !== null && (manifest.firstTs === null || report.firstTs < manifest.firstTs))
          manifest.firstTs = report.firstTs
        if (report.lastTs !== null && (manifest.lastTs === null || report.lastTs > manifest.lastTs))
          manifest.lastTs = report.lastTs
      }
    }
  } finally {
    writer?.close()
  }
  if (!opts.dryRun) {
    manifest.mapping = mapping.raw
    if (opts.synthetic !== undefined) manifest.synthetic = opts.synthetic
    dict.save(lab.storeDir)
    saveManifest(lab, manifest)
  }
  return { reports, manifest }
}
