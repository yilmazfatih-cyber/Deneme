/**
 * Olay deposu: kullanıcıya göre bölümlenmiş, yalnız eklemeli ikili dosyalar (`depo/kova-NNN.bin`) + sözlükler.
 *
 * - Yazma sıralıdır (hızlı); bir kullanıcının tüm olayları aynı kovadadır (kova = uidLo mod kova sayısı).
 * - Kurma aşaması kovaları tek tek belleğe alır, (kullanıcı, an) sırasına dizer ve birebir aynı kayıtları atar;
 *   bu yüzden aynı dosyayı ikinci kez içe almak sonucu değiştirmez.
 * - Sözlükler (`sozluk.json`): içerik kimliği → dizin ve nitelikleri, boyut değerleri, boyut demetleri, yardımcı kodlar.
 * - Kayıt defteri (`alim.json`): içe alma geçmişi, örnekleme oranı, kova sayısı, kullanılan eşleme.
 */
import { closeSync, existsSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { Dictionary } from '../core/columns'
import { readJson, writeJson, type Lab } from '../core/lab'
import { RECORD_BYTES, writeRecord, type LabRecord } from './events'
import type { LabMapping } from './mapping'

export const STORE_VERSION = 1
export const DEFAULT_BUCKETS = 64
const BUCKET_BUFFER = 64 * 1024

export interface ContentEntry {
  /** Kaynaktaki içerik kimliği */
  id: string
  title?: string
  /** CONTENT_CLASSES dizini */
  klass: number
  genres?: string[]
  /** Dizi sözlüğü dizini (0 = dizi değil / bilinmiyor) */
  series: number
  season?: number
  episode?: number
  /** Süre (sn); bilinmiyorsa 0 */
  dur: number
}

export interface IngestRecord {
  file: string
  at: string
  lines: number
  accepted: number
  rejected: number
  sampledOut: number
  ignored: number
  unmapped: number
  firstTs: number | null
  lastTs: number | null
}

export interface StoreManifest {
  version: number
  buckets: number
  /** Kullanıcı örnekleme oranı (0–1]; tüm içe almalar aynı oranı kullanmalıdır */
  sample: number
  events: number
  firstTs: number | null
  lastTs: number | null
  ingests: IngestRecord[]
  /** Son kullanılan eşleme (kurma aşaması süre / tamamlanma kurallarını buradan okur) */
  mapping: LabMapping | null
  /** Sentetik demo verisi mi (çıktılarda öyle etiketlenir) */
  synthetic: boolean
  updatedAt: string
}

interface DictFile {
  version: number
  contents: ContentEntry[]
  series: string[]
  dimNames: string[]
  dimValues: string[][]
  tuples: number[][]
  screens: string[]
  errors: string[]
  experiments: string[]
  variants: string[]
}

/** Deponun sözlükleri (bellekte; içe almada büyür, sonunda kaydedilir). */
export class StoreDictionaries {
  contents: ContentEntry[] = [{ id: '', klass: 0, series: 0, dur: 0 }]
  private contentIndex = new Map<string, number>()
  series = new Dictionary('', 4_000_000)
  dimNames: string[] = []
  dims: Dictionary[] = []
  tuples: number[][] = [[]]
  private tupleIndex = new Map<string, number>()
  screens = new Dictionary('bilinmiyor', 2_000)
  errors = new Dictionary('bilinmiyor', 5_000)
  experiments = new Dictionary('bilinmiyor', 5_000)
  variants = new Dictionary('bilinmiyor', 5_000)

  static readonly DIM_LIMIT = 3_000

  static load(dir: string): StoreDictionaries {
    const d = new StoreDictionaries()
    const f = readJson<DictFile>(join(dir, 'sozluk.json'))
    if (!f) return d
    d.contents = f.contents
    f.contents.forEach((c, i) => {
      if (i > 0) d.contentIndex.set(c.id, i)
    })
    d.series = new Dictionary('', 4_000_000, f.series)
    d.dimNames = f.dimNames
    d.dims = f.dimValues.map((v) => new Dictionary('bilinmiyor', StoreDictionaries.DIM_LIMIT, v))
    d.tuples = f.tuples
    f.tuples.forEach((t, i) => d.tupleIndex.set(t.join(','), i))
    d.screens = new Dictionary('bilinmiyor', 2_000, f.screens)
    d.errors = new Dictionary('bilinmiyor', 5_000, f.errors)
    d.experiments = new Dictionary('bilinmiyor', 5_000, f.experiments)
    d.variants = new Dictionary('bilinmiyor', 5_000, f.variants)
    return d
  }

  save(dir: string): void {
    const f: DictFile = {
      version: STORE_VERSION,
      contents: this.contents,
      series: this.series.values,
      dimNames: this.dimNames,
      dimValues: this.dims.map((d) => d.values),
      tuples: this.tuples,
      screens: this.screens.values,
      errors: this.errors.values,
      experiments: this.experiments.values,
      variants: this.variants.values,
    }
    writeJson(join(dir, 'sozluk.json'), f, false)
  }

  /** Boyut adlarını sabitler (ilk içe almada); sonraki içe almalar aynı adları aynı sırayla kullanmalıdır. */
  setDims(names: readonly string[]): void {
    if (this.dimNames.length === 0 && this.tuples.length <= 1) {
      this.dimNames = [...names]
      this.dims = names.map(() => new Dictionary('bilinmiyor', StoreDictionaries.DIM_LIMIT))
      this.tuples = [names.map(() => 0)]
      this.tupleIndex.set(this.tuples[0].join(','), 0)
      return
    }
    if (names.length !== this.dimNames.length || names.some((n, i) => n !== this.dimNames[i]))
      throw new Error(
        `Eşlemedeki boyutlar (${names.join(', ') || 'yok'}) depodakilerle (${this.dimNames.join(', ') || 'yok'}) aynı değil. ` +
          'Boyutları değiştirdiyseniz depoyu sıfırlayıp yeniden içe alın (--sifirla).',
      )
  }

  contentId(id: string): number {
    const hit = this.contentIndex.get(id)
    if (hit !== undefined) return hit
    const c = this.contents.length
    this.contents.push({ id, klass: 0, series: 0, dur: 0 })
    this.contentIndex.set(id, c)
    return c
  }
  lookupContent(id: string): number {
    return this.contentIndex.get(id) ?? 0
  }

  tupleId(codes: readonly number[]): number {
    const key = codes.join(',')
    const hit = this.tupleIndex.get(key)
    if (hit !== undefined) return hit
    const id = this.tuples.length
    this.tuples.push([...codes])
    this.tupleIndex.set(key, id)
    return id
  }
}

export function loadManifest(lab: Lab): StoreManifest | null {
  return readJson<StoreManifest>(join(lab.storeDir, 'alim.json'))
}
export function saveManifest(lab: Lab, m: StoreManifest): void {
  m.updatedAt = new Date().toISOString()
  writeJson(join(lab.storeDir, 'alim.json'), m, false)
}
export function emptyManifest(buckets: number, sample: number): StoreManifest {
  return {
    version: STORE_VERSION,
    buckets,
    sample,
    events: 0,
    firstTs: null,
    lastTs: null,
    ingests: [],
    mapping: null,
    synthetic: false,
    updatedAt: new Date().toISOString(),
  }
}

export const bucketFile = (lab: Lab, i: number): string => join(lab.storeDir, `kova-${String(i).padStart(3, '0')}.bin`)

/** Depoyu (olaylar, sözlükler, kayıt defteri) siler. */
export function resetStore(lab: Lab): void {
  for (const f of readdirSync(lab.storeDir)) rmSync(join(lab.storeDir, f), { force: true })
}

/** Depodaki toplam kayıt sayısı (dosya boylarından). */
export function storeEventCount(lab: Lab, buckets: number): number {
  let bytes = 0
  for (let i = 0; i < buckets; i++) {
    const f = bucketFile(lab, i)
    if (existsSync(f)) bytes += statSync(f).size
  }
  return Math.floor(bytes / RECORD_BYTES)
}

/** Kovalara tamponlu yazıcı. */
export class StoreWriter {
  private readonly fds: number[] = []
  private readonly bufs: Buffer[] = []
  private readonly views: DataView[] = []
  private readonly used: number[] = []
  readonly buckets: number
  written = 0

  constructor(lab: Lab, buckets: number) {
    this.buckets = buckets
    for (let i = 0; i < buckets; i++) {
      this.fds.push(openSync(bucketFile(lab, i), 'a'))
      const b = Buffer.allocUnsafe(BUCKET_BUFFER - (BUCKET_BUFFER % RECORD_BYTES))
      this.bufs.push(b)
      this.views.push(new DataView(b.buffer, b.byteOffset, b.byteLength))
      this.used.push(0)
    }
  }

  write(r: LabRecord): void {
    const i = r.uidLo % this.buckets
    let off = this.used[i]
    if (off + RECORD_BYTES > this.bufs[i].length) {
      writeSync(this.fds[i], this.bufs[i], 0, off)
      off = 0
    }
    writeRecord(this.views[i], off, r)
    this.used[i] = off + RECORD_BYTES
    this.written++
  }

  close(): void {
    for (let i = 0; i < this.buckets; i++) {
      if (this.used[i] > 0) writeSync(this.fds[i], this.bufs[i], 0, this.used[i])
      closeSync(this.fds[i])
      this.used[i] = 0
    }
  }
}

/** Bir kovanın kayıtları: aynı bellek üstünde 32 bitlik ve kayan nokta görünümleri (kayıt başına 8 sözcük). */
export interface BucketView {
  n: number
  /** [hi, lo, ts, kind|flags<<8|aux<<16, cid, v1 bitleri, v2 bitleri, tuple] × n */
  w: Uint32Array
  /** Aynı bellek: f[i*8+5] = v1, f[i*8+6] = v2 */
  f: Float32Array
  /** (kullanıcı, an, tür) sırasına dizilmiş ve tekilleştirilmiş kayıt dizinleri */
  order: Int32Array
}

export function readBucket(lab: Lab, i: number): BucketView {
  const file = bucketFile(lab, i)
  if (!existsSync(file)) return { n: 0, w: new Uint32Array(0), f: new Float32Array(0), order: new Int32Array(0) }
  const buf = readFileSync(file)
  const n = Math.floor(buf.byteLength / RECORD_BYTES)
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + n * RECORD_BYTES)
  const w = new Uint32Array(ab)
  const f = new Float32Array(ab)
  const idx = new Int32Array(n)
  for (let k = 0; k < n; k++) idx[k] = k
  idx.sort((a, b) => {
    const x = a * 8
    const y = b * 8
    return (
      w[x] - w[y] ||
      w[x + 1] - w[y + 1] ||
      w[x + 2] - w[y + 2] ||
      (w[x + 3] & 0xff) - (w[y + 3] & 0xff) ||
      w[x + 4] - w[y + 4] ||
      w[x + 3] - w[y + 3] ||
      w[x + 5] - w[y + 5] ||
      w[x + 6] - w[y + 6] ||
      w[x + 7] - w[y + 7]
    )
  })
  // Birebir aynı kayıtları at (yeniden içe alma güvenli olsun)
  let m = 0
  for (let k = 0; k < n; k++) {
    if (m > 0) {
      const x = idx[k] * 8
      const y = idx[m - 1] * 8
      let same = true
      for (let j = 0; j < 8; j++) {
        if (w[x + j] !== w[y + j]) {
          same = false
          break
        }
      }
      if (same) continue
    }
    idx[m++] = idx[k]
  }
  return { n: m, w, f, order: idx.subarray(0, m) }
}
