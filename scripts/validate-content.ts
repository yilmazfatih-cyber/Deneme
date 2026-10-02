/**
 * İçerik doğrulama: content/ altındaki her JSON dosyasını Zod şemasıyla ve
 * dosyalar arası tutarlılık kurallarıyla denetler; sembol dosyalarının varlığını kontrol eder.
 * Kullanım: npm run validate:content
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import {
  CategorySchema,
  crossCheck,
  JourneySchema,
  QuickItemSchema,
  TemplateSchema,
  WordSchema,
  type ContentBundle,
} from '../src/content/schema.ts'

const root = join(import.meta.dirname, '..')
const errors: string[] = []

function load<T>(relPath: string, schema: z.ZodType<T>): T | undefined {
  const raw: unknown = JSON.parse(readFileSync(join(root, relPath), 'utf8'))
  const result = schema.safeParse(raw)
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`${relPath} → ${issue.path.join('.')}: ${issue.message}`)
    }
    return undefined
  }
  return result.data
}

const categories = load('content/categories.json', z.array(CategorySchema)) ?? []
const templates = load('content/templates.json', z.array(TemplateSchema)) ?? []
const quick = load('content/quick.json', z.array(QuickItemSchema)) ?? []
const journey = load('content/journey.json', JourneySchema)
const words = readdirSync(join(root, 'content/vocabulary'))
  .filter((f) => f.endsWith('.json'))
  .sort()
  .flatMap((f) => load(`content/vocabulary/${f}`, z.array(WordSchema)) ?? [])

if (journey) {
  const bundle: ContentBundle = { categories, templates, quick, words, journey }
  errors.push(...crossCheck(bundle))

  const symbols = new Set<string>([
    ...categories.map((c) => c.symbol),
    ...templates.map((t) => t.symbol),
    ...quick.flatMap((q) => (q.symbol ? [q.symbol] : [])),
    ...words.flatMap((w) => [w.symbol, ...(w.symbolVariants ? Object.values(w.symbolVariants) : [])]),
    ...journey.stops.map((s) => s.symbol),
  ])
  for (const s of symbols) {
    if (!existsSync(join(root, 'public', s))) errors.push(`sembol dosyası yok: public/${s}`)
  }
  for (const w of words) {
    if (w.audio && !existsSync(join(root, 'public', w.audio)))
      errors.push(`${w.id}: ses dosyası yok: public/${w.audio}`)
  }
}

if (errors.length) {
  console.error(`İçerik doğrulaması başarısız (${errors.length} hata):`)
  for (const e of errors) console.error(`  • ${e}`)
  process.exit(1)
}
console.log(
  `İçerik geçerli: ${words.length} kelime, ${categories.length} kategori, ${templates.length} kalıp, ` +
    `${quick.length} hızlı ihtiyaç, ${journey?.stops.length ?? 0} durak.`,
)
