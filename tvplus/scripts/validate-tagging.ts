/**
 * Etiketleme doğrulayıcı (`npm run validate:tagging [klasör]`).
 *  1) content/tagging/vocabulary.json — şema (shared/tagging-schema.ts) ve çapraz kurallar: tüm türlerin adı, benzersiz
 *     anahtarlar, RTÜK bağları, yuva sırası, `implied` başvuruları.
 *  2) content/tagging/sheets/*.json — her fiş: ölçek/yüz/değer anahtarları sözlükte var mı, değer sayısı `max` içinde
 *     mi, başlık katalogda var mı, başlık başına en çok bir örnek fiş, fiş sözlüğün sürümüyle mi doldurulmuş.
 * Hata varsa çıkış kodu 1'dir.
 *
 * `npm run validate:content` da içerik raporundan sonra `runTaggingCheck` ile bu denetimi çalıştırır ve çıkış kodunu
 * iki denetimin birleşimiyle verir.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { zTitle } from '../shared/content-schema'
import {
  formatIssue,
  readTaggingContent,
  TAGGING_DIR,
  type TaggingIssue,
} from '../server/src/services/tagging/vocabulary'
import { defaultContentDir, titleFiles } from './lib/content'
import { isMain } from './lib/net'

export interface TaggingStats {
  version: string | null
  scales: number
  descriptors: number
  facets: number
  values: number
  /** Mikro tür adında kullanılabilen (hazır ifadesi olan) değerler */
  phrasedValues: number
  genres: number
  regions: number
  eras: number
  sheetFiles: number
  sheets: number
}

export interface TaggingReport {
  issues: TaggingIssue[]
  stats: TaggingStats
}

/** Katalogdaki üst başlık kimlikleri (şemadan geçenler). */
function catalogTitleIds(contentDir: string): Set<number> {
  const ids = new Set<number>()
  for (const file of titleFiles(contentDir)) {
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      continue // içerik doğrulayıcı raporlar
    }
    if (!Array.isArray(raw)) continue
    for (const item of raw) {
      const r = zTitle.safeParse(item)
      if (r.success) ids.add(r.data.videoId)
    }
  }
  return ids
}

export function validateTagging(contentDir: string): TaggingReport {
  const stats: TaggingStats = {
    version: null,
    scales: 0,
    descriptors: 0,
    facets: 0,
    values: 0,
    phrasedValues: 0,
    genres: 0,
    regions: 0,
    eras: 0,
    sheetFiles: 0,
    sheets: 0,
  }
  const r = readTaggingContent(contentDir)
  const issues = [...r.issues]
  if (!('vocabulary' in r)) return { issues, stats }
  const v = r.vocabulary
  stats.version = v.version
  stats.scales = v.scales.length
  stats.descriptors = v.scales.reduce((s, x) => s + x.descriptors.length, 0)
  stats.facets = v.facets.length
  stats.values = v.facets.reduce((s, f) => s + f.values.length, 0)
  stats.phrasedValues = v.facets.reduce((s, f) => s + (f.slot ? f.values.filter((x) => x.phrase).length : 0), 0)
  stats.genres = Object.keys(v.naming.genreNouns).length
  stats.regions = v.naming.regions.length
  stats.eras = v.naming.eras.length
  stats.sheetFiles = new Set(r.sheets.map((s) => s.file)).size
  stats.sheets = r.sheets.length

  const known = catalogTitleIds(contentDir)
  const perFile = new Map<string, number>()
  for (const { file, sheet } of r.sheets) {
    const i = perFile.get(file) ?? 0
    perFile.set(file, i + 1)
    if (!known.has(sheet.titleId))
      issues.push({
        level: 'error',
        file,
        path: `[${i}].titleId`,
        message: `${sheet.titleId} kimlikli başlık katalogda yok`,
      })
  }
  return { issues, stats }
}

export function formatTaggingReport(r: TaggingReport, dir: string): string {
  const s = r.stats
  const lines: string[] = []
  lines.push(`Etiketleme doğrulama: ${join(dir, TAGGING_DIR)}`)
  if (s.version) {
    lines.push(
      `  Sözlük ${s.version} · ölçek ${s.scales} (niteleyici ${s.descriptors}) · yüz ${s.facets} (değer ${s.values}, adda kullanılabilen ${s.phrasedValues})`,
    )
    lines.push(`  Adlandırma: tür ${s.genres} · köken bölgesi ${s.regions} · yapım dönemi ${s.eras}`)
    lines.push(`  Örnek fiş: ${s.sheets} (${s.sheetFiles} dosya)`)
  }
  const warnings = r.issues.filter((i) => i.level === 'warning')
  const errors = r.issues.filter((i) => i.level === 'error')
  if (warnings.length) {
    lines.push(`Uyarılar (${warnings.length}):`)
    warnings.forEach((w) => lines.push(`  ! ${formatIssue(w)}`))
  }
  if (errors.length) {
    lines.push(`Hatalar (${errors.length}):`)
    errors.forEach((e) => lines.push(`  ✗ ${formatIssue(e)}`))
    lines.push('Sonuç: BAŞARISIZ')
  } else lines.push('Sonuç: geçerli')
  return lines.join('\n')
}

/** Komut satırından: rapor yazdırır, hata sayısını döndürür. Etiketleme klasörü hiç yoksa `optional` ise atlar. */
export function runTaggingCheck(dir: string, optional = false): number {
  if (optional && !existsSync(join(dir, TAGGING_DIR))) {
    console.log(`Etiketleme doğrulama: ${relative(process.cwd(), join(dir, TAGGING_DIR)) || TAGGING_DIR} yok; atlandı`)
    return 0
  }
  const report = validateTagging(dir)
  console.log(formatTaggingReport(report, dir))
  return report.issues.filter((i) => i.level === 'error').length
}

if (isMain(import.meta.url)) {
  const dir = process.argv[2] ?? defaultContentDir()
  process.exit(runTaggingCheck(dir) > 0 ? 1 : 0)
}
