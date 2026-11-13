/**
 * Görsel hattı: istek → kaynak (uzak / yerel / yok) → çizim → disk önbelleği. Aynı varyantın eşzamanlı çizimleri
 * tek işe indirgenir. Varyant anahtarı kaynağın parmak izini de içerir: içerik değişirse eski önbellek kullanılmaz.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ArtworkSource } from '../../kernel/services'
import type { ImageRequest } from '../../kernel/imageUrls'
import { renderArtwork } from './render'
import { createRemoteLoader, resolveLocalFile } from './source'

/** Çizim mantığı değişince artırılır; tüm disk önbelleği kendiliğinden geçersiz olur. */
export const RENDER_VERSION = 7

export type ImageOrigin = 'remote' | 'source-cache' | 'local' | 'generated' | 'fallback'

export interface ImageResult {
  body: Buffer
  contentType: string
  etag: string
  origin: ImageOrigin
  cache: 'hit' | 'miss'
  /** false → geçici yedek (kaynak okunamadı); uzun süre önbelleklenmemeli */
  cacheable: boolean
}

export interface ImagePipelineOptions {
  dataDir: string
  publicDir: string
  offline: boolean
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

export function createImagePipeline(opts: ImagePipelineOptions) {
  const cacheDir = join(opts.dataDir, 'img-cache')
  const remote = createRemoteLoader({ dataDir: opts.dataDir, offline: opts.offline })
  const inflight = new Map<string, Promise<ImageResult>>()
  const stats = { requests: 0, diskHits: 0, renders: 0, fallbacks: 0, deduped: 0 }

  const contentTypeOf = (f: ImageRequest['format']) => (f === 'jpg' ? 'image/jpeg' : 'image/webp')

  async function produce(
    req: ImageRequest,
    src: ArtworkSource,
    variantKey: string,
    local: { path: string } | null,
  ): Promise<ImageResult> {
    const etagOf = (k: string) => `"${k.slice(0, 24)}"`
    const file = join(cacheDir, variantKey.slice(0, 2), `${variantKey}.${req.format}`)
    try {
      const body = await readFile(file)
      stats.diskHits++
      const origin: ImageOrigin = local ? 'local' : src.sourceUrl ? 'source-cache' : 'generated'
      return {
        body,
        contentType: contentTypeOf(req.format),
        etag: etagOf(variantKey),
        origin,
        cache: 'hit',
        cacheable: true,
      }
    } catch {
      /* önbellekte yok → çiz */
    }

    let image: Buffer | null = null
    let origin: ImageOrigin = 'generated'
    if (local) {
      try {
        image = await readFile(local.path)
        origin = 'local'
      } catch {
        image = null
      }
    } else if (src.sourceUrl) {
      const r = await remote.load(src.sourceUrl)
      image = r.buf
      origin = r.origin === 'remote' || r.origin === 'source-cache' ? r.origin : 'fallback'
    }

    stats.renders++
    const out = await renderArtwork({ ...req, source: src, image })
    if (out.decodeFailed) origin = 'fallback' // kaynak çözülemedi
    const cacheable = origin !== 'fallback'
    if (!cacheable) {
      stats.fallbacks++
      return {
        body: out.body,
        contentType: contentTypeOf(req.format),
        etag: etagOf(sha(`${variantKey}|fallback`)),
        origin,
        cache: 'miss',
        cacheable,
      }
    }
    try {
      await mkdir(join(cacheDir, variantKey.slice(0, 2)), { recursive: true })
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
      await writeFile(tmp, out.body)
      await rename(tmp, file)
    } catch {
      /* disk önbelleği yazılamadı: yanıt yine verilir */
    }
    return {
      body: out.body,
      contentType: contentTypeOf(req.format),
      etag: etagOf(variantKey),
      origin,
      cache: 'miss',
      cacheable,
    }
  }

  return {
    stats,
    /** İstenen varyantı üretir ya da önbellekten verir. Kaynak sorunlarında fırlatmaz; yedek kapak döner. */
    get(req: ImageRequest, src: ArtworkSource): Promise<ImageResult> {
      stats.requests++
      const local = src.localFile ? resolveLocalFile(opts.publicDir, src.localFile, req.type) : null
      const fingerprint = JSON.stringify([
        RENDER_VERSION,
        req.type,
        req.width,
        req.height,
        req.format,
        req.entityId,
        src.sourceUrl,
        local ? [local.path, local.mtimeMs] : src.localFile,
        src.title,
        src.subtitle,
        src.seed,
        src.focal,
        // Afiş düzeni anahtarın parçası: eski kırpılmış afişler yeni düzende sunulmasın
        req.type === 'BOXART' ? (src.posterFit ?? 'contain') : null,
      ])
      const variantKey = sha(fingerprint)
      const running = inflight.get(variantKey)
      if (running) {
        stats.deduped++
        return running
      }
      const p = produce(req, src, variantKey, local).finally(() => inflight.delete(variantKey))
      inflight.set(variantKey, p)
      return p
    },
  }
}
export type ImagePipeline = ReturnType<typeof createImagePipeline>
