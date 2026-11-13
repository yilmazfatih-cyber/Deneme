/**
 * Depoda gelen eğitilmiş vektörler: content/models/<model-id>/manifest.json + *.jsonl (biçim: ./PROTOKOL.md).
 *
 * TVP_EMBEDDING_PROVIDER verilmemişse ve geçerli bir manifest varsa servis bu vektörleri kullanır; modelin kapsamadığı
 * (ya da çekim sayısı artık çözümlemeyle uyuşmayan) yapraklar için `taban` yedeğine düşer. İki kaynak aynı matriste
 * AYRIK ALT UZAYLARDA durur: vektör = [model (dims) | taban (192)]; model vektörü taban bölümünde, taban vektörü model
 * bölümünde sıfırdır. Böylece model vektörleri yalnız birbiriyle, taban vektörleri yalnız birbiriyle benzeşir; iki
 * aile arasındaki kosinüs tam olarak 0'dır (anlamsız bir karşılaştırma yapılmaz).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { readImportDir, type ImportedVideo } from './dosya'
import { EMBEDDING_PROTOCOL, MAX_DIMS } from './http'
import { inputModalities, type EmbeddingInput, type EmbeddingOutput, type EmbeddingProvider } from './provider'
import { createTabanProvider, TABAN_DIMS } from './taban'

export const MODELS_DIR = 'models'
export const MANIFEST_FILE = 'manifest.json'

/** content/models/<model-id>/manifest.json */
export const zModelManifest = z.object({
  /** Protokol: 'tvplus-embedding/1' */
  format: z.literal(EMBEDDING_PROTOCOL),
  /** Model kimliği; klasör adıyla aynı olmalı */
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
  version: z.string().min(1).max(64),
  dims: z.number().int().min(2).max(MAX_DIMS),
  /** ISO 8601 üretim zamanı (birden çok geçerli model varsa en yenisi seçilir) */
  builtAt: z.iso.datetime({ offset: true }),
  /** Modelin kullandığı kipler (bilgi için) */
  modalities: z.array(z.enum(['VISUAL', 'AUDIO', 'TEXT', 'CONTEXT'])).default([]),
  /** Okunacak vektör dosyaları (klasöre göreli); verilmezse klasördeki tüm .jsonl */
  files: z
    .array(z.string().regex(/^[\w.-]+\.jsonl$/))
    .min(1)
    .optional(),
  /** Serbest açıklama (eğitim verisi, kod sürümü vb.) */
  description: z.string().max(2000).optional(),
})
export type ModelManifest = z.infer<typeof zModelManifest>

export interface ShippedModel {
  dir: string
  manifest: ModelManifest
  videos: Map<number, ImportedVideo>
  digest: string
}

export interface ModelScan {
  model: ShippedModel | null
  /** Geçersiz sayılan model klasörleri ve nedenleri */
  problems: { dir: string; reason: string }[]
}

/** content/models altındaki geçerli modeller arasından en yeni builtAt'lıyı (eşitlikte kimliği küçük olanı) seçer. */
export function findShippedModel(contentDir: string): ModelScan {
  const root = join(contentDir, MODELS_DIR)
  const problems: ModelScan['problems'] = []
  if (!existsSync(root)) return { model: null, problems }
  const valid: ShippedModel[] = []
  for (const name of readdirSync(root).sort()) {
    const dir = join(root, name)
    if (!statSync(dir).isDirectory()) continue
    try {
      const file = join(dir, MANIFEST_FILE)
      if (!existsSync(file)) throw new Error(`${MANIFEST_FILE} yok`)
      const parsed = zModelManifest.safeParse(JSON.parse(readFileSync(file, 'utf8')))
      if (!parsed.success)
        throw new Error(
          `manifest geçersiz: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
        )
      const manifest = parsed.data
      if (manifest.id !== name) throw new Error(`manifest id (${manifest.id}) klasör adıyla (${name}) aynı değil`)
      for (const f of manifest.files ?? []) if (!existsSync(join(dir, f))) throw new Error(`dosya yok: ${f}`)
      const read = readImportDir(dir, manifest.files)
      if (!read.model) throw new Error('vektör dosyasında model satırı yok')
      const m = read.model
      if (m.id !== manifest.id || m.version !== manifest.version || m.dims !== manifest.dims)
        throw new Error(`model satırı (${m.id}@${m.version}, ${m.dims}) manifestle uyuşmuyor`)
      if (read.videos.size === 0) throw new Error('hiç geçerli yaprak satırı yok')
      if (read.summary.rejected.length)
        problems.push({
          dir: name,
          reason: `${read.summary.rejected.length} satır okunamadı (ilk: ${read.summary.rejected[0]!.where} ${read.summary.rejected[0]!.reason})`,
        })
      valid.push({ dir, manifest, videos: read.videos, digest: read.digest })
    } catch (e) {
      problems.push({ dir: name, reason: e instanceof Error ? e.message : String(e) })
    }
  }
  valid.sort((a, b) =>
    a.manifest.builtAt === b.manifest.builtAt
      ? a.manifest.id.localeCompare(b.manifest.id)
      : Date.parse(b.manifest.builtAt) - Date.parse(a.manifest.builtAt),
  )
  return { model: valid[0] ?? null, problems }
}

/** Depodaki model + taban yedeği. id 'dosya'; gösterilen sürüm manifestteki `<id>@<version>`. */
export function createShippedModelProvider(model: ShippedModel): EmbeddingProvider {
  const taban = createTabanProvider()
  const md = model.manifest.dims
  const dims = md + TABAN_DIMS
  const own = (input: EmbeddingInput): ImportedVideo | null => {
    const v = model.videos.get(input.videoId)
    return v && v.count === input.shots.length ? v : null
  }
  return {
    id: 'dosya',
    // Önbellek anahtarı: model dosyalarının özeti ve taban sürümü (biri değişince yeniden kodlanır)
    version: `model:${model.manifest.id}@${model.manifest.version}#${model.digest}+${taban.version}`,
    modelVersion: `${model.manifest.id}@${model.manifest.version}`,
    dims,
    modalities: (inputs) => inputModalities(inputs),
    covers: (input) => own(input) !== null,
    init: () => taban.init(),
    async embed(input): Promise<EmbeddingOutput> {
      const v = own(input)
      const n = input.shots.length
      const shots = new Float32Array(n * dims)
      const pooled = new Float32Array(dims)
      if (v) {
        for (let i = 0; i < n; i++) shots.set(v.shots.subarray(i * md, (i + 1) * md), i * dims)
        pooled.set(v.pooled, 0)
      } else {
        const t = (await taban.embed(input))!
        for (let i = 0; i < n; i++) shots.set(t.shots.subarray(i * TABAN_DIMS, (i + 1) * TABAN_DIMS), i * dims + md)
        pooled.set(t.pooled, md)
      }
      return { dims, shots, pooled }
    },
  }
}
