/**
 * Etiketleme sözlüğü ve içerik fişleri: okuma, şema doğrulaması, şemanın anlatamadığı çapraz kurallar ve hızlı arama
 * dizini. Sunucu (açılışta), `npm run validate:tagging` ve mikro tür üreteci aynı kuralları buradan kullanır.
 *
 * Anahtarlar koda gömülmez: ölçek, yüz, değer ve niteleyici anahtarları yalnız sözlükten okunur.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { z } from 'zod'
import { GENRES, MATURITY, type MaturityKey } from '../../../../shared/taxonomy'
import {
  MICROGENRE_SLOTS,
  SCALE_MAX,
  zTagSheet,
  zVocabulary,
  type MicrogenreSlot,
  type TagFacet,
  type TagScale,
  type TagSheet,
  type TagVocabulary,
} from '../../../../shared/tagging-schema'

/** content/ altındaki yerler */
export const TAGGING_DIR = 'tagging'
export const VOCABULARY_FILE = join(TAGGING_DIR, 'vocabulary.json')
export const SHEETS_DIR = join(TAGGING_DIR, 'sheets')

export interface TaggingIssue {
  level: 'error' | 'warning'
  /** contentDir'e göreli dosya yolu */
  file: string
  /** JSON yolu, ör. "scales[2].levels[3]" */
  path: string
  message: string
}

/** Zod yolunu okunur JSON yoluna çevirir: ['scales', 2, 'key'] → "scales[2].key" */
export function formatPath(p: readonly PropertyKey[]): string {
  return (
    p
      .map((k) => (typeof k === 'number' ? `[${k}]` : `.${String(k)}`))
      .join('')
      .replace(/^\./, '') || '(kök)'
  )
}

export function zodIssues(file: string, base: string, err: z.ZodError): TaggingIssue[] {
  return err.issues.slice(0, 30).map((i) => {
    const sub = formatPath(i.path)
    const path = base ? (sub === '(kök)' ? base : `${base}${sub.startsWith('[') ? '' : '.'}${sub}`) : sub
    return { level: 'error' as const, file, path, message: i.message }
  })
}

/* ───────────── Dizin ───────────── */

export interface FacetIndexEntry {
  facet: TagFacet
  values: Map<string, TagFacet['values'][number]>
}
export interface DescriptorIndexEntry {
  scale: TagScale
  key: string
  min: number
  max: number
  adjective: string
}
/** Sözlüğün hızlı arama hâli (bir kez kurulur, sözlük nesnesine bağlı önbellekte tutulur). */
export interface VocabIndex {
  vocabulary: TagVocabulary
  scales: Map<string, TagScale>
  facets: Map<string, FacetIndexEntry>
  descriptors: Map<string, DescriptorIndexEntry>
  /** Çekirdek tür önceliği: naming.genreNouns sırası (önce gelen, eşit okunurlukta tercih edilir) */
  corePriority: Map<string, number>
  /** Yuvanın addaki sırası */
  slotOrder: Map<MicrogenreSlot, number>
}

const indexCache = new WeakMap<TagVocabulary, VocabIndex>()

export function indexVocabulary(vocabulary: TagVocabulary): VocabIndex {
  const cached = indexCache.get(vocabulary)
  if (cached) return cached
  const scales = new Map(vocabulary.scales.map((s) => [s.key, s]))
  const facets = new Map<string, FacetIndexEntry>(
    vocabulary.facets.map((f) => [f.key, { facet: f, values: new Map(f.values.map((v) => [v.key, v])) }]),
  )
  const descriptors = new Map<string, DescriptorIndexEntry>()
  for (const s of vocabulary.scales)
    for (const d of s.descriptors) descriptors.set(d.key, { scale: s, key: d.key, min: d.min, max: d.max, adjective: d.adjective })
  const corePriority = new Map(Object.keys(vocabulary.naming.genreNouns).map((k, i) => [k, i]))
  const slotOrder = new Map<MicrogenreSlot, number>(vocabulary.naming.order.map((s, i) => [s, i]))
  const index: VocabIndex = { vocabulary, scales, facets, descriptors, corePriority, slotOrder }
  indexCache.set(vocabulary, index)
  return index
}

/** Ölçek değerlerinden türeyen niteleyici anahtarları (sözlük sırasıyla). */
export function descriptorsOf(index: VocabIndex, scales: Record<string, number>): string[] {
  const out: string[] = []
  for (const s of index.vocabulary.scales) {
    const v = scales[s.key]
    if (v === undefined) continue
    for (const d of s.descriptors) if (v >= d.min && v <= d.max) out.push(d.key)
  }
  return out
}

export const RATING_RANK: Record<MaturityKey, number> = { GENEL: 0, '7+': 1, '13+': 2, '18+': 3 }
export const RATING_KEYS = Object.keys(MATURITY) as MaturityKey[]

/* ───────────── Sözlüğün çapraz kuralları ───────────── */

/**
 * Şemanın denetleyemediği kurallar: tüm türlerin adı var mı, anahtarlar benzersiz mi, uyarı ölçekleri RTÜK'e bağlı mı,
 * yuva sırası eksiksiz mi, `implied` başvuruları çözülüyor mu …
 */
export function checkVocabulary(v: TagVocabulary, file: string): TaggingIssue[] {
  const issues: TaggingIssue[] = []
  const err = (path: string, message: string) => issues.push({ level: 'error', file, path, message })
  const warn = (path: string, message: string) => issues.push({ level: 'warning', file, path, message })

  const descriptorKeys = new Map<string, string>()
  const adjectives = new Map<string, string>()
  v.scales.forEach((s, si) => {
    const p = `scales[${si}]`
    if (s.group === 'ADVISORY' && !s.advisory) err(`${p}.advisory`, `${s.key}: içerik uyarısı ölçeğinde RTÜK bağı (advisory) zorunlu`)
    if (s.group !== 'ADVISORY' && s.advisory) err(`${p}.advisory`, `${s.key}: RTÜK bağı yalnız ADVISORY ölçeklerinde olur`)
    if (s.advisory) {
      const r = s.advisory.ratings
      for (let i = 1; i < r.length; i++)
        if (RATING_RANK[r[i]!] < RATING_RANK[r[i - 1]!])
          err(`${p}.advisory.ratings[${i}]`, `${s.key}: önerilen işaret seviye yükseldikçe düşemez (${r[i - 1]} → ${r[i]})`)
    }
    s.descriptors.forEach((d, di) => {
      const dp = `${p}.descriptors[${di}]`
      if (d.min > d.max) err(dp, `${d.key}: en düşük değer (${d.min}) en yüksekten (${d.max}) büyük`)
      const prev = descriptorKeys.get(d.key)
      if (prev) err(`${dp}.key`, `Niteleyici anahtarı "${d.key}" yinelenmiş (ilk: ${prev})`)
      else descriptorKeys.set(d.key, dp)
      const a = d.adjective.toLocaleLowerCase('tr-TR')
      const prevA = adjectives.get(a)
      if (prevA) warn(`${dp}.adjective`, `"${d.adjective}" sıfatı ${prevA} ile aynı`)
      else adjectives.set(a, dp)
    })
  })

  v.facets.forEach((f, fi) => {
    const p = `facets[${fi}]`
    if (!f.multi && f.max !== 1) err(`${p}.max`, `${f.key}: tek değerli (multi: false) yüzde max 1 olmalı`)
    if (f.max > f.values.length) warn(`${p}.max`, `${f.key}: max (${f.max}) değer sayısından (${f.values.length}) büyük`)
    const keys = new Set<string>()
    f.values.forEach((val, vi) => {
      if (keys.has(val.key)) err(`${p}.values[${vi}].key`, `${f.key}: değer anahtarı "${val.key}" yinelenmiş`)
      keys.add(val.key)
      if (f.slot === 'ADJECTIVE' && val.phrase) {
        const a = val.phrase.toLocaleLowerCase('tr-TR')
        const prevA = adjectives.get(a)
        if (prevA) warn(`${p}.values[${vi}].phrase`, `"${val.phrase}" sıfatı ${prevA} ile aynı`)
        else adjectives.set(a, `${p}.values[${vi}]`)
      }
    })
    if (f.slot && !f.values.some((x) => x.phrase))
      warn(`${p}.values`, `${f.key}: ${f.slot} yuvasını dolduruyor ama hiçbir değerinde hazır ifade (phrase) yok`)
    if (!f.slot && f.values.some((x) => x.phrase))
      warn(`${p}.slot`, `${f.key}: değerlerde hazır ifade var ama yüz bir yuvaya bağlı değil; ifadeler kullanılmaz`)
  })

  const n = v.naming
  for (const g of Object.keys(GENRES))
    if (!n.genreNouns[g]) err(`naming.genreNouns`, `"${g}" türünün adı (çoğul biçimleri) eksik`)
  const seenSlots = new Set<string>()
  n.order.forEach((s, i) => {
    if (seenSlots.has(s)) err(`naming.order[${i}]`, `${s} yuvası sırada iki kez geçiyor`)
    seenSlots.add(s)
  })
  for (const s of MICROGENRE_SLOTS) if (!seenSlots.has(s)) err('naming.order', `${s} yuvası sırada yok`)

  const regionKeys = new Set<string>()
  n.regions.forEach((r, i) => {
    if (regionKeys.has(r.key)) err(`naming.regions[${i}].key`, `Bölge anahtarı "${r.key}" yinelenmiş`)
    regionKeys.add(r.key)
  })
  const eraKeys = new Set<string>()
  const eras = [...n.eras].sort((a, b) => a.fromYear - b.fromYear)
  n.eras.forEach((e, i) => {
    if (eraKeys.has(e.key)) err(`naming.eras[${i}].key`, `Dönem anahtarı "${e.key}" yinelenmiş`)
    eraKeys.add(e.key)
    if (e.fromYear > e.toYear) err(`naming.eras[${i}]`, `${e.key}: başlangıç yılı bitişten büyük`)
  })
  for (let i = 1; i < eras.length; i++)
    if (eras[i]!.fromYear <= eras[i - 1]!.toYear)
      err('naming.eras', `Yapım dönemleri çakışıyor: ${eras[i - 1]!.key} ve ${eras[i]!.key}`)

  // implied: "YUVA:anahtar" — yuvaya göre çözülmeli
  const index = indexVocabulary(v)
  for (const [g, noun] of Object.entries(n.genreNouns))
    (noun.implied ?? []).forEach((ref, i) => {
      if (!resolvesQuality(index, ref))
        err(`naming.genreNouns.${g}.implied[${i}]`, `"${ref}" çözülemedi (biçim: YUVA:anahtar, ör. ADJECTIVE:komik)`)
    })
  return issues
}

/** "ADJECTIVE:komik", "FORMAT:bicim:sessiz", "REGION:yerli", "ERA:1920ler" sözlükte karşılığı olan bir nitelik mi */
export function resolvesQuality(index: VocabIndex, ref: string): boolean {
  const at = ref.indexOf(':')
  if (at < 0) return false
  const slot = ref.slice(0, at) as MicrogenreSlot
  const key = ref.slice(at + 1)
  if (!MICROGENRE_SLOTS.includes(slot) || slot === 'PERSON') return false
  const v = index.vocabulary
  if (slot === 'REGION') return v.naming.regions.some((r) => r.key === key)
  if (slot === 'ERA') return v.naming.eras.some((e) => e.key === key)
  if (slot === 'ADJECTIVE' && index.descriptors.has(key)) return true
  const [fk, vk] = key.split(':')
  const f = fk === undefined ? undefined : index.facets.get(fk)
  return !!f && f.facet.slot === slot && vk !== undefined && f.values.has(vk)
}

/* ───────────── Fiş denetimi ───────────── */

/**
 * Fişin sözlüğe uygunluğu: ölçek/yüz/değer anahtarları var mı, değer sayısı `max` içinde mi, değerler yinelenmiyor mu.
 * Hem içerik fişlerinde hem REST girişinde kullanılır.
 */
export function checkSheetAgainstVocabulary(
  index: VocabIndex,
  sheet: Pick<TagSheet, 'scales' | 'facets'>,
): { path: string; message: string }[] {
  const out: { path: string; message: string }[] = []
  for (const [k, val] of Object.entries(sheet.scales)) {
    if (!index.scales.has(k)) out.push({ path: `scales.${k}`, message: `Bilinmeyen ölçek: "${k}"` })
    else if (val !== null && (!Number.isInteger(val) || val < 0 || val > SCALE_MAX))
      out.push({ path: `scales.${k}`, message: `"${k}" ölçeği 0–${SCALE_MAX} arasında tam sayı olmalı` })
  }
  for (const [k, values] of Object.entries(sheet.facets)) {
    const f = index.facets.get(k)
    if (!f) {
      out.push({ path: `facets.${k}`, message: `Bilinmeyen yüz: "${k}"` })
      continue
    }
    const seen = new Set<string>()
    values.forEach((v, i) => {
      if (!f.values.has(v)) out.push({ path: `facets.${k}[${i}]`, message: `"${k}" yüzünde "${v}" değeri yok` })
      if (seen.has(v)) out.push({ path: `facets.${k}[${i}]`, message: `"${k}" yüzünde "${v}" iki kez seçilmiş` })
      seen.add(v)
    })
    if (values.length > f.facet.max)
      out.push({
        path: `facets.${k}`,
        message: `"${k}" yüzünde en çok ${f.facet.max} değer seçilebilir (${values.length} seçilmiş)`,
      })
  }
  return out
}

/** İçerik fişi kuralları: yalnız SAMPLE, izlenmemiş, etiketleyicisiz, sözlüğün sürümüyle. Başlık başına tek örnek fiş. */
export function checkContentSheets(
  index: VocabIndex,
  file: string,
  sheets: TagSheet[],
  seenSample: Map<number, string>,
): TaggingIssue[] {
  const issues: TaggingIssue[] = []
  sheets.forEach((s, i) => {
    const p = `[${i}]`
    const err = (path: string, message: string) => issues.push({ level: 'error', file, path, message })
    if (s.source !== 'SAMPLE')
      err(`${p}.source`, `Depodaki fişler yalnız SAMPLE olabilir (${s.source}); insan fişleri stüdyodan girilir`)
    if (s.watched) err(`${p}.watched`, 'Örnek fiş izlenmeden doldurulur: watched false olmalı')
    if (s.tagger !== null) err(`${p}.tagger`, 'Örnek fişte etiketleyici (tagger) null olmalı')
    if (s.rubricVersion !== index.vocabulary.version)
      err(
        `${p}.rubricVersion`,
        `Fiş ${s.rubricVersion} sürümüyle doldurulmuş; sözlük ${index.vocabulary.version} (fişi yeni sürüme göre gözden geçirin)`,
      )
    for (const x of checkSheetAgainstVocabulary(index, s)) err(`${p}.${x.path}`, x.message)
    if (s.source === 'SAMPLE') {
      const prev = seenSample.get(s.titleId)
      if (prev) err(`${p}.titleId`, `${s.titleId} için ikinci örnek fiş (ilk: ${prev})`)
      else seenSample.set(s.titleId, `${file} ${p}`)
    }
  })
  return issues
}

/* ───────────── Okuma ───────────── */

export interface TaggingContent {
  vocabulary: TagVocabulary
  /** Hangi dosyadan okundu (contentDir'e göreli ya da yedek yol) */
  vocabularyFile: string
  /** Depodaki örnek fişler (dosya adı sırasıyla) */
  sheets: { file: string; sheet: TagSheet }[]
  issues: TaggingIssue[]
}

function readJson(abs: string, rel: string, issues: TaggingIssue[]): unknown {
  try {
    return JSON.parse(readFileSync(abs, 'utf8')) as unknown
  } catch (e) {
    issues.push({ level: 'error', file: rel, path: '', message: `JSON okunamadı: ${(e as Error).message}` })
    return undefined
  }
}

/**
 * Sözlüğü ve örnek fişleri okur ve doğrular; sorunları döndürür (fırlatmaz).
 * contentDir'de sözlük yoksa `fallbackVocabulary` (depodaki asıl sözlük) kullanılır — test içerikleri yalnız başlık taşır.
 */
export function readTaggingContent(contentDir: string, fallbackVocabulary?: string): TaggingContent | { issues: TaggingIssue[] } {
  const issues: TaggingIssue[] = []
  let vocabAbs = join(contentDir, VOCABULARY_FILE)
  if (!existsSync(vocabAbs) && fallbackVocabulary && existsSync(fallbackVocabulary)) vocabAbs = fallbackVocabulary
  const vocabRel = vocabAbs.startsWith(contentDir) ? relative(contentDir, vocabAbs) : vocabAbs
  if (!existsSync(vocabAbs)) {
    issues.push({ level: 'error', file: VOCABULARY_FILE, path: '', message: 'Etiketleme sözlüğü yok' })
    return { issues }
  }
  const raw = readJson(vocabAbs, vocabRel, issues)
  if (raw === undefined) return { issues }
  const parsed = zVocabulary.safeParse(raw)
  if (!parsed.success) {
    issues.push(...zodIssues(vocabRel, '', parsed.error))
    return { issues }
  }
  const vocabulary = parsed.data
  issues.push(...checkVocabulary(vocabulary, vocabRel))
  const index = indexVocabulary(vocabulary)

  const sheets: { file: string; sheet: TagSheet }[] = []
  const dir = join(contentDir, SHEETS_DIR)
  const seenSample = new Map<number, string>()
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)
      .filter((f) => f.endsWith('.json') && !f.startsWith('.'))
      .sort()) {
      const rel = join(SHEETS_DIR, name)
      const data = readJson(join(dir, name), rel, issues)
      if (data === undefined) continue
      if (!Array.isArray(data)) {
        issues.push({ level: 'error', file: rel, path: '', message: 'Fiş dosyası bir dizi olmalı' })
        continue
      }
      const ok: TagSheet[] = []
      data.forEach((item: unknown, i) => {
        const r = zTagSheet.safeParse(item)
        if (r.success) ok.push(r.data)
        else issues.push(...zodIssues(rel, `[${i}]`, r.error))
      })
      issues.push(...checkContentSheets(index, rel, ok, seenSample))
      for (const sheet of ok) sheets.push({ file: rel, sheet })
    }
  }
  return { vocabulary, vocabularyFile: vocabRel, sheets, issues }
}

export const formatIssue = (i: TaggingIssue): string =>
  `${i.file}${i.path ? ` ${i.path}` : ''}: ${i.message}`

/** Sunucu açılışı: içerik geçersizse açık bir Türkçe iletiyle hemen durur (yarım sözlükle çalışılmaz). */
export function loadTaggingContentOrThrow(contentDir: string, fallbackVocabulary?: string): TaggingContent {
  const r = readTaggingContent(contentDir, fallbackVocabulary)
  const errors = r.issues.filter((i) => i.level === 'error')
  if (errors.length > 0 || !('vocabulary' in r)) {
    const lines = errors.slice(0, 20).map((i) => `  ✗ ${formatIssue(i)}`)
    if (errors.length > 20) lines.push(`  … ve ${errors.length - 20} hata daha`)
    throw new Error(
      `Etiketleme içeriği geçersiz; sunucu açılmıyor (npm run validate:tagging ayrıntıyı gösterir):\n${lines.join('\n')}`,
    )
  }
  return r
}
