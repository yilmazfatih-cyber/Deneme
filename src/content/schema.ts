import { z } from 'zod'

/** İçerik dosyalarının (content/*.json) şeması. İçerikçi ajan bu şemaya göre yazar. */

const id = z.string().regex(/^[a-z0-9_]+$/, 'id yalnızca küçük ASCII harf, rakam ve _ içerebilir')

const symbolPath = z.string().regex(/^symbols\/[A-Za-z0-9_.-]+\.svg$/, 'sembol yolu symbols/<ad>.svg olmalı')

const audioPath = z.string().regex(/^audio\/[a-z0-9_]+\.(mp3|m4a|ogg|webm)$/)

export const fitzKeys = ['kisiler', 'eylemler', 'nesneler', 'yerler', 'duygular', 'sorular', 'sosyal'] as const
export const FitzSchema = z.enum(fitzKeys)
export type Fitz = z.infer<typeof FitzSchema>

export const CategorySchema = z.object({
  id,
  label: z.string().min(1),
  parent: id.optional(),
  fitz: FitzSchema,
  symbol: symbolPath,
})
export type Category = z.infer<typeof CategorySchema>

export const TemplateSchema = z.object({
  id,
  label: z.string().includes('___'),
  fallback: z.string().includes('{w}'),
  symbol: symbolPath,
})
export type Template = z.infer<typeof TemplateSchema>

export const QuickItemSchema = z
  .object({
    id,
    label: z.string().min(1),
    speak: z.string().min(1),
    symbol: symbolPath.optional(),
    icon: z.enum(['yes', 'no', 'repeat', 'unknown']).optional(),
    wordId: id.optional(),
    tone: z.enum(['yes', 'no', 'urgent', 'neutral']),
  })
  .refine((q) => q.symbol || q.icon, 'hızlı ihtiyaç öğesinin sembolü ya da simgesi olmalı')
export type QuickItem = z.infer<typeof QuickItemSchema>

/** Cümlede "…" ile boşluk bırakılır; boşluğa hedef kelime gelir. */
const sentenceCue = z.string().includes('…', { message: 'cümle tamamlama ipucu "…" içermeli' })

export const WordSchema = z
  .object({
    id,
    word: z.string().min(1),
    category: id,
    symbol: symbolPath,
    symbolVariants: z.object({ kadin: symbolPath, erkek: symbolPath }).optional(),
    audio: audioPath.optional(),
    phrases: z.array(z.string().min(1)),
    forms: z.record(id, z.string().min(1)),
    syllables: z.array(z.string().min(1)).min(1),
    frequency: z.enum(['high', 'medium', 'low']),
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    cues: z.object({
      semantic: z.array(z.string().min(1)).length(3),
      sentence: z.array(sentenceCue).length(2),
      firstSound: z.string().regex(/^.+…$/),
    }),
    features: z.object({
      group: z.string().min(1),
      use: z.string().min(1),
      place: z.string().min(1),
      looks: z.string().min(1),
    }),
  })
  .refine((w) => w.phrases.length + Object.keys(w.forms).length >= 2, {
    message: 'her kelimenin en az 2 hazır biçimi (phrases + forms) olmalı',
  })
  .refine((w) => w.syllables.join('') === w.word.replace(/ /g, ''), {
    message: 'heceler birleşince kelimeyi vermeli',
  })
export type Word = z.infer<typeof WordSchema>

export const StopSchema = z.object({
  id,
  label: z.string().min(1),
  symbol: symbolPath,
  personalCategories: z.array(id),
  words: z.array(id).min(8).max(12),
})
export type Stop = z.infer<typeof StopSchema>

export const WarmupSchema = z.object({
  id,
  label: z.string().min(1),
  items: z.array(z.string().min(1)).min(3),
})
export type Warmup = z.infer<typeof WarmupSchema>

export const ScenarioSchema = z.object({
  id,
  label: z.string().min(1),
  prompt: z.string().min(1),
  answer: id,
  phrase: z.string().min(1),
})
export type Scenario = z.infer<typeof ScenarioSchema>

export const JourneySchema = z.object({
  stops: z.array(StopSchema).min(1),
  warmups: z.array(WarmupSchema).min(1),
  scenarios: z.array(ScenarioSchema),
})
export type Journey = z.infer<typeof JourneySchema>

export interface ContentBundle {
  categories: Category[]
  templates: Template[]
  quick: QuickItem[]
  words: Word[]
  journey: Journey
}

/**
 * Dosyalar arası tutarlılık: kategori, kalıp ve kelime kimlikleri birbirini doğru göstermeli.
 * Hata listesi boşsa içerik geçerlidir.
 */
export function crossCheck(bundle: ContentBundle): string[] {
  const errors: string[] = []
  const categoryIds = new Set(bundle.categories.map((c) => c.id))
  const parentIds = new Set(bundle.categories.flatMap((c) => (c.parent ? [c.parent] : [])))
  const templateIds = new Set(bundle.templates.map((t) => t.id))
  const wordIds = new Set<string>()

  const dupes = (ids: string[], what: string) => {
    const seen = new Set<string>()
    for (const i of ids) {
      if (seen.has(i)) errors.push(`${what} kimliği tekrar ediyor: ${i}`)
      seen.add(i)
    }
  }
  dupes(
    bundle.categories.map((c) => c.id),
    'kategori',
  )
  dupes(
    bundle.words.map((w) => w.id),
    'kelime',
  )
  dupes(
    bundle.templates.map((t) => t.id),
    'kalıp',
  )
  dupes(
    bundle.quick.map((q) => q.id),
    'hızlı ihtiyaç',
  )

  for (const c of bundle.categories) {
    if (c.parent && !categoryIds.has(c.parent)) errors.push(`${c.id}: üst kategori yok: ${c.parent}`)
    if (c.parent && bundle.categories.find((p) => p.id === c.parent)?.parent)
      errors.push(`${c.id}: kategori ağacı en fazla 2 kategori seviyesi olabilir (kelimelerle 3)`)
  }

  for (const w of bundle.words) {
    wordIds.add(w.id)
    if (!categoryIds.has(w.category)) errors.push(`${w.id}: kategori yok: ${w.category}`)
    if (parentIds.has(w.category)) errors.push(`${w.id}: alt kategorisi olan bir kategoriye bağlanamaz: ${w.category}`)
    for (const key of Object.keys(w.forms)) {
      if (!templateIds.has(key)) errors.push(`${w.id}: forms içinde bilinmeyen kalıp: ${key}`)
    }
  }

  for (const q of bundle.quick) {
    if (q.wordId && !wordIds.has(q.wordId)) errors.push(`hızlı ihtiyaç ${q.id}: kelime yok: ${q.wordId}`)
  }

  const inStops = new Map<string, string>()
  for (const s of bundle.journey.stops) {
    for (const wid of s.words) {
      if (!wordIds.has(wid)) errors.push(`durak ${s.id}: kelime yok: ${wid}`)
      const other = inStops.get(wid)
      if (other) errors.push(`${wid} iki durakta birden: ${other}, ${s.id}`)
      inStops.set(wid, s.id)
    }
    for (const cid of s.personalCategories) {
      if (!categoryIds.has(cid)) errors.push(`durak ${s.id}: kategori yok: ${cid}`)
    }
  }
  for (const sc of bundle.journey.scenarios) {
    if (!wordIds.has(sc.answer)) errors.push(`senaryo ${sc.id}: kelime yok: ${sc.answer}`)
  }
  return errors
}
