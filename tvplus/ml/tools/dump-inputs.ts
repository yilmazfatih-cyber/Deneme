/**
 * Sunucunun gömme sağlayıcısına göndereceği girdileri (EmbeddingInput) diske döker — mediafm-mini eğitimi bunları
 * okur, böylece eğitimdeki genel bağlam (özet, GEÇERLİ etiketler, tür, ruh hâli) sunucunun gönderdiğiyle birebir aynıdır.
 *
 *   npx tsx ml/tools/dump-inputs.ts --out ml/.cache/inputs.json
 *
 * Yalnız okur: sunucu kodunu (buildApp, buildInput, loadShotIndex) içe aktarır, hiçbir dosyasını değiştirmez.
 * Sunucu çevrimdışı kurulur (ağ yok), veri klasörü olarak geçici bir klasör kullanılır (TVP_DATA_DIR verilmezse).
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

async function main(argv: string[]): Promise<void> {
  const i = argv.indexOf('--out')
  const out = resolve(i >= 0 && argv[i + 1] ? argv[i + 1]! : 'ml/.cache/inputs.json')
  if (!process.env.TVP_DATA_DIR) process.env.TVP_DATA_DIR = mkdtempSync(join(tmpdir(), 'mediafm-dump-'))
  const { buildApp } = await import('../../server/src/app')
  const { buildInput, embeddablePlayables, loadShotIndex } = await import('../../server/src/services/embeddings/shots')
  const app = await buildApp({ isTest: true, offline: true, logLevel: 'warn', sampleViewing: false })
  await app.ready()
  try {
    const catalog = app.services.catalog
    const tagging = app.services.tagging ?? null
    const shotIndex = loadShotIndex(app.config.contentDir)
    const inputs: unknown[] = []
    for (const title of catalog.allTitles()) {
      let tags = null
      try {
        tags = tagging?.effective(title.videoId) ?? null
      } catch {
        tags = null
      }
      for (const p of embeddablePlayables(catalog, title)) {
        inputs.push(buildInput(catalog, title, p, tags, shotIndex.videos.get(p.videoId) ?? null))
      }
    }
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, JSON.stringify({ generatedBy: 'ml/tools/dump-inputs.ts', inputs }))
    console.log(`${inputs.length} yaprak girdisi yazıldı: ${out}`)
  } finally {
    await app.close()
  }
}

main(process.argv.slice(2)).catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
