/**
 * Katalog vektörlerini kurar ve `dosya` sağlayıcısının içe aktarma biçiminde dışa aktarır
 * (`npm run embed:catalog -- [--out vectors.jsonl]`) — bkz. server/src/services/embeddings/PROTOKOL.md.
 *
 * Yapılandırılmış sağlayıcı kullanılır (TVP_EMBEDDING_PROVIDER; varsayılan `taban`). Önbellek sunucuyla aynıdır
 * (<dataDir>/embeddings/cache), yani yalnız değişen yapraklar yeniden kodlanır. Çıktı, gerçek bir modelin çıktısıyla
 * karşılaştırmak ya da onun yerine koymak içindir: dosyayı <dataDir>/embeddings/import/ altına koyup
 * TVP_EMBEDDING_PROVIDER=dosya ile sunucu bu vektörleri kullanır.
 *
 * Sunucu ağa çıkmaz (offline); http sağlayıcısı seçilmişse yalnız TVP_EMBEDDING_URL'e gider.
 */
import { createWriteStream, mkdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { once } from 'node:events'
import { buildApp } from '../server/src/app'
import { embeddingsInternals } from '../server/src/services/embeddings/plugin'
import { isMain } from './lib/net'

/** Dışa aktarılan sayıların ondalık basamağı (float32 ≈ 7 anlamlı basamak taşır; 6 ondalık yeterli). */
export const EXPORT_DIGITS = 6

export function parseArgs(argv: string[]): { out: string | null } {
  let out: string | null = null
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') out = argv[++i] ?? null
    else if (argv[i]?.startsWith('--out=')) out = argv[i]!.slice(6)
  }
  return { out }
}

const fmt = (a: Float32Array, from = 0, to = a.length) => {
  const f = 10 ** EXPORT_DIGITS
  const parts: string[] = []
  for (let i = from; i < to; i++) parts.push(String(Math.round(a[i]! * f) / f))
  return `[${parts.join(',')}]`
}

/** Vektörleri JSONL satırları olarak üretir (önce model satırı). */
export function* exportLines(
  model: { id: string; version: string; dims: number },
  videos: { videoId: number; titleId: number; count: number; shots: Float32Array; pooled: Float32Array }[],
): Generator<string> {
  yield JSON.stringify({ kind: 'model', id: model.id, version: model.version, dims: model.dims })
  for (const v of videos) {
    const rows: string[] = []
    for (let i = 0; i < v.count; i++) rows.push(fmt(v.shots, i * model.dims, (i + 1) * model.dims))
    yield `{"kind":"video","videoId":${v.videoId},"titleId":${v.titleId},"shots":[${rows.join(',')}],"pooled":${fmt(v.pooled)}}`
  }
}

async function main(argv: string[]): Promise<void> {
  const { out } = parseArgs(argv)
  const t0 = Date.now()
  const app = await buildApp({ isTest: true, offline: true, logLevel: 'warn', sampleViewing: false })
  await app.ready()
  try {
    const svc = embeddingsInternals(app)
    const stats = await svc.rebuild()
    if (stats.error) throw new Error(`Kurulum başarısız: ${stats.error}`)
    const info = svc.info()
    const file = resolve(out ?? join(app.config.dataDir, 'embeddings', 'export', `${info.provider}.jsonl`))
    mkdirSync(dirname(file), { recursive: true })
    const videos = svc.videoIds().map((videoId) => {
      const v = svc.videoVectors(videoId)!
      const titleId = app.services.catalog.titleOf(videoId)?.videoId ?? videoId
      return { videoId, titleId, ...v }
    })
    const ws = createWriteStream(file)
    for (const line of exportLines({ id: info.provider, version: info.modelVersion, dims: info.dims }, videos)) {
      if (!ws.write(`${line}\n`)) await once(ws, 'drain')
    }
    ws.end()
    await once(ws, 'finish')
    console.log(
      `Sağlayıcı: ${info.provider} (${info.modelVersion}), ${info.dims} boyut\n` +
        `Kurulum: ${stats.computed} kodlandı, ${stats.reused} önbellekten, ${stats.skipped} atlandı, ` +
        `${stats.failed.length} hata (${stats.ms} ms)\n` +
        `Yazıldı: ${file} — ${videos.length} yaprak, ${info.shots} çekim, ${(statSync(file).size / 1024).toFixed(0)} KB ` +
        `(toplam ${((Date.now() - t0) / 1000).toFixed(1)} sn)`,
    )
    for (const f of stats.failed.slice(0, 10)) console.log(`  hata: ${f.videoId} — ${f.reason}`)
  } finally {
    await app.close()
  }
}

if (isMain(import.meta.url))
  main(process.argv.slice(2)).catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
