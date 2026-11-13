/**
 * `dosya` sağlayıcısı — başka yerde (ör. GPU'lu bir makinede) üretilmiş vektörleri içe alır.
 * Klasör: <dataDir>/embeddings/import/*.jsonl (ada göre sıralı okunur; aynı videoId sonraki dosyada yeniden geçerse
 * sonuncusu geçerlidir). Biçim (satır başına bir JSON; ayrıntı: ./PROTOKOL.md):
 *   {"kind":"model","id":"…","version":"…","dims":768}                         — her dosyada bir kez, ilk satırda
 *   {"kind":"video","videoId":80010001,"shots":[[…],…],"pooled":[…]}          — pooled isteğe bağlı (yoksa ortalama)
 * `npm run embed:catalog -- --out <dosya>` aynı biçimde dışa aktarır.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EmbeddingModality } from '../../../../shared/intelligence'
import { MAX_DIMS } from './http'
import {
  inputModalities,
  normalizeRows,
  type EmbeddingInput,
  type EmbeddingOutput,
  type EmbeddingProvider,
} from './provider'

export const IMPORT_DIR = join('embeddings', 'import')

export interface ImportedVideo {
  shots: Float32Array
  count: number
  pooled: Float32Array
}

export interface ImportSummary {
  files: string[]
  videos: number
  /** Okunamayan satırlar: dosya:satır → neden */
  rejected: { where: string; reason: string }[]
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const finiteVec = (v: unknown, dims: number): v is number[] =>
  Array.isArray(v) && v.length === dims && v.every((x) => typeof x === 'number' && Number.isFinite(x))

/** İçe aktarma klasörünü okur. Model bilgisi tutarsızsa (farklı dims) hata fırlatır; bozuk satırlar raporlanır. */
export function readImportDir(dir: string): {
  model: { id: string; version: string; dims: number } | null
  videos: Map<number, ImportedVideo>
  digest: string
  summary: ImportSummary
} {
  const videos = new Map<number, ImportedVideo>()
  const summary: ImportSummary = { files: [], videos: 0, rejected: [] }
  const hash = createHash('sha256')
  let model: { id: string; version: string; dims: number } | null = null
  const files = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.jsonl'))
        .sort()
    : []
  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf8')
    hash.update(f).update('\0').update(text)
    summary.files.push(f)
    text.split('\n').forEach((line, i) => {
      if (!line.trim()) return
      const where = `${f}:${i + 1}`
      let row: unknown
      try {
        row = JSON.parse(line)
      } catch {
        summary.rejected.push({ where, reason: 'JSON değil' })
        return
      }
      if (!isObj(row)) return void summary.rejected.push({ where, reason: 'nesne değil' })
      if (row.kind === 'model') {
        const dims = row.dims
        if (typeof row.id !== 'string' || typeof row.version !== 'string' || typeof dims !== 'number')
          throw new Error(`${where}: model satırı eksik (id, version, dims)`)
        if (!Number.isInteger(dims) || dims < 2 || dims > MAX_DIMS) throw new Error(`${where}: dims geçersiz`)
        if (model && model.dims !== dims) throw new Error(`${where}: dims ${dims}, önceki dosyalarda ${model.dims}`)
        model = { id: row.id, version: row.version, dims }
        return
      }
      if (row.kind !== 'video') return void summary.rejected.push({ where, reason: 'bilinmeyen kind' })
      if (!model) return void summary.rejected.push({ where, reason: 'model satırından önce' })
      const dims = model.dims
      const videoId = row.videoId
      if (typeof videoId !== 'number' || !Number.isInteger(videoId) || videoId <= 0)
        return void summary.rejected.push({ where, reason: 'videoId geçersiz' })
      if (!Array.isArray(row.shots) || row.shots.length === 0 || !row.shots.every((s) => finiteVec(s, dims)))
        return void summary.rejected.push({ where, reason: `shots ${dims} boyutlu sonlu vektörler olmalı` })
      const rows = row.shots as number[][]
      const shots = new Float32Array(rows.length * dims)
      rows.forEach((r, k) => shots.set(r, k * dims))
      normalizeRows(shots, dims)
      let pooled: Float32Array
      if (row.pooled !== undefined) {
        if (!finiteVec(row.pooled, dims))
          return void summary.rejected.push({ where, reason: 'pooled geçersiz' })
        pooled = Float32Array.from(row.pooled)
      } else {
        pooled = new Float32Array(dims)
        for (let k = 0; k < rows.length; k++) for (let d = 0; d < dims; d++) pooled[d]! += shots[k * dims + d]!
      }
      videos.set(videoId, { shots, count: rows.length, pooled: normalizeRows(pooled, dims) })
    })
  }
  summary.videos = videos.size
  return { model, videos, digest: hash.digest('hex').slice(0, 12), summary }
}

export function createDosyaProvider(dataDir: string): EmbeddingProvider & { summary(): ImportSummary | null } {
  const dir = join(dataDir, IMPORT_DIR)
  let state: ReturnType<typeof readImportDir> | null = null
  const provider = {
    id: 'dosya',
    version: 'dosya:yok',
    dims: 0,
    modalities: (inputs: EmbeddingInput[]): EmbeddingModality[] => inputModalities(inputs),
    summary: () => state?.summary ?? null,
    async init() {
      state = readImportDir(dir)
      if (!state.model) throw new Error(`İçe aktarılacak vektör yok: ${dir} altında model satırı olan .jsonl bulunamadı`)
      provider.dims = state.model.dims
      provider.version = `dosya:${state.model.id}@${state.model.version}#${state.digest}`
    },
    async embed(input: EmbeddingInput): Promise<EmbeddingOutput | null> {
      if (!state) await provider.init()
      const v = state!.videos.get(input.videoId)
      if (!v) return null
      if (v.count !== input.shots.length)
        throw new Error(`videoId ${input.videoId}: dosyada ${v.count} çekim vektörü var, çözümlemede ${input.shots.length} çekim`)
      return { dims: provider.dims, shots: v.shots, pooled: v.pooled }
    },
  }
  return provider
}
