/**
 * Kolon tabloları: her sütun bir tipli dizi; kategorik sütunlar kod + sözlük. Diskte `tablo/<ad>/meta.json` ve
 * sütun başına `<sütun>.bin` (ham küçük-endian baytlar). Bellek dostu ve hızlıdır; analizler doğrudan dizilerle çalışır.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type ColType = 'f32' | 'f64' | 'i32' | 'u32' | 'u16' | 'u8'
export type NumArray = Float32Array | Float64Array | Int32Array | Uint32Array | Uint16Array | Uint8Array

const CTOR = {
  f32: Float32Array,
  f64: Float64Array,
  i32: Int32Array,
  u32: Uint32Array,
  u16: Uint16Array,
  u8: Uint8Array,
} as const

export const allocate = (type: ColType, n: number): NumArray => new CTOR[type](n)

export interface ColumnMeta {
  name: string
  type: ColType
  /** Kategorik sütun: kod → ad (kod 0 genellikle 'bilinmiyor') */
  dict?: string[]
}

export interface Table {
  name: string
  rows: number
  cols: Record<string, NumArray>
  dicts: Record<string, string[]>
  meta: Record<string, unknown>
}

interface TableFile {
  name: string
  rows: number
  columns: ColumnMeta[]
  meta: Record<string, unknown>
}

export function saveTable(dir: string, t: Table): void {
  const d = join(dir, t.name)
  rmSync(d, { recursive: true, force: true })
  mkdirSync(d, { recursive: true })
  const columns: ColumnMeta[] = []
  for (const [name, arr] of Object.entries(t.cols)) {
    const type = typeOf(arr)
    const view = arr.subarray(0, t.rows)
    writeFileSync(join(d, `${name}.bin`), Buffer.from(view.buffer, view.byteOffset, view.byteLength))
    columns.push(t.dicts[name] ? { name, type, dict: t.dicts[name] } : { name, type })
  }
  const file: TableFile = { name: t.name, rows: t.rows, columns, meta: t.meta }
  writeFileSync(join(d, 'meta.json'), JSON.stringify(file))
}

export function tableExists(dir: string, name: string): boolean {
  return existsSync(join(dir, name, 'meta.json'))
}

/** Tabloyu yükler; `only` verilirse yalnız o sütunlar okunur. */
export function loadTable(dir: string, name: string, only?: readonly string[]): Table {
  const d = join(dir, name)
  const file = JSON.parse(readFileSync(join(d, 'meta.json'), 'utf8')) as TableFile
  const cols: Record<string, NumArray> = {}
  const dicts: Record<string, string[]> = {}
  for (const c of file.columns) {
    if (only && !only.includes(c.name)) continue
    const buf = readFileSync(join(d, `${c.name}.bin`))
    // Hizalı kopya: Buffer havuzundan gelen ofset tipli dizi için uygun olmayabilir
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    cols[c.name] = new CTOR[c.type](ab)
    if (c.dict) dicts[c.name] = c.dict
  }
  return { name: file.name, rows: file.rows, cols, dicts, meta: file.meta }
}

export function tableMeta(
  dir: string,
  name: string,
): { rows: number; columns: ColumnMeta[]; meta: Record<string, unknown> } | null {
  const f = join(dir, name, 'meta.json')
  if (!existsSync(f)) return null
  const file = JSON.parse(readFileSync(f, 'utf8')) as TableFile
  return { rows: file.rows, columns: file.columns, meta: file.meta }
}

function typeOf(arr: NumArray): ColType {
  if (arr instanceof Float32Array) return 'f32'
  if (arr instanceof Float64Array) return 'f64'
  if (arr instanceof Int32Array) return 'i32'
  if (arr instanceof Uint32Array) return 'u32'
  if (arr instanceof Uint16Array) return 'u16'
  return 'u8'
}

/** Büyüyen sütun kümesi: satır satır eklenir, sonunda Table'a çevrilir. */
export class TableBuilder {
  readonly name: string
  private readonly spec: ColumnMeta[]
  private cap: number
  private n = 0
  private readonly data: Record<string, NumArray> = {}

  constructor(name: string, spec: ColumnMeta[], capacity = 1024) {
    this.name = name
    this.spec = spec
    this.cap = Math.max(16, capacity)
    for (const c of spec) this.data[c.name] = allocate(c.type, this.cap)
  }

  get rows(): number {
    return this.n
  }

  /** Yeni satırın dizinini döner; değerler `col(ad)[dizin] = …` ile yazılır (varsayılan 0). */
  addRow(): number {
    if (this.n === this.cap) this.grow()
    return this.n++
  }

  col(name: string): NumArray {
    return this.data[name]
  }

  private grow(): void {
    this.cap *= 2
    for (const c of this.spec) {
      const next = allocate(c.type, this.cap)
      next.set(this.data[c.name] as never)
      this.data[c.name] = next
    }
  }

  finish(meta: Record<string, unknown> = {}, dicts: Record<string, string[]> = {}): Table {
    const cols: Record<string, NumArray> = {}
    for (const c of this.spec) cols[c.name] = this.data[c.name].slice(0, this.n)
    const allDicts: Record<string, string[]> = { ...dicts }
    for (const c of this.spec) if (c.dict && !allDicts[c.name]) allDicts[c.name] = c.dict
    return { name: this.name, rows: this.n, cols, dicts: allDicts, meta }
  }
}

/** Dizge → küçük tamsayı kodu sözlüğü (kod 0 ayrılmıştır: bilinmiyor / diğer). */
export class Dictionary {
  readonly values: string[]
  private readonly index = new Map<string, number>()
  private readonly limit: number

  constructor(zeroLabel = 'bilinmiyor', limit = 65_535, initial: readonly string[] = []) {
    this.values = initial.length ? [...initial] : [zeroLabel]
    this.limit = limit
    this.values.forEach((v, i) => {
      if (i > 0) this.index.set(v, i)
    })
  }

  /** Değerin kodu; yoksa eklenir. Sınır aşılınca 0 (diğer). */
  code(value: string): number {
    const hit = this.index.get(value)
    if (hit !== undefined) return hit
    if (this.values.length >= this.limit) return 0
    const c = this.values.length
    this.values.push(value)
    this.index.set(value, c)
    return c
  }

  /** Yalnız bak; yoksa 0. */
  lookup(value: string): number {
    return this.index.get(value) ?? 0
  }

  get size(): number {
    return this.values.length
  }
}
