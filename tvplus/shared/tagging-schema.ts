/**
 * Etiketleme içerik dosyalarının Zod şeması (content/tagging/**) — bkz. docs/ICERIK_ZEKASI.md §3–4.
 *
 *   vocabulary.json — etiketleme kılavuzunun veri hâli: ölçekler (0–5), yüzler (kategorik etiketler) ve
 *                     mikro tür adlarını kuran hazır Türkçe kalıplar. Çekim/ek ÜRETİLMEZ; her biçim burada hazır durur.
 *   sheets/*.json   — başlık etiket fişleri (dizi). Depodaki fişler ÖRNEK fişlerdir (source: 'SAMPLE', watched: false);
 *                     insan etiketleyicilerin fişleri sunucu deposunda tutulur ve bunların önüne geçer.
 *
 * Anahtarlar içerik dilindedir (ör. 'son-netligi'); kod bu anahtarları sabit kabul etmez, sözlükten okur.
 */
import { z } from 'zod'
import { GENRES, MATURITY, MATURITY_REASONS } from './taxonomy'

const keysOf = <T extends Record<string, unknown>>(o: T) =>
  Object.keys(o) as [keyof T & string, ...(keyof T & string)[]]

const zKey = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)

/** Her ölçek 0 (hiç yok) – 5 (yapımın belirleyici özelliği) arasındadır. */
export const SCALE_MAX = 5

export const zScaleLevel = z.object({
  value: z.number().int().min(0).max(SCALE_MAX),
  /** Kısa ad: "Yok", "Hafif", "Belirgin" … */
  label: z.string().min(1),
  /** Etiketleyicinin kararını sabitleyen somut ölçüt (kılavuz metni) */
  description: z.string().min(1),
})

/** Ölçek değerinden türeyen niteleyici: mikro tür adında sıfat olarak kullanılır (ör. romantizm ≥ 4 → "Romantik"). */
export const zScaleDescriptor = z.object({
  key: zKey,
  min: z.number().int().min(0).max(SCALE_MAX),
  max: z.number().int().min(0).max(SCALE_MAX).default(SCALE_MAX),
  adjective: z.string().min(1),
})

export const SCALE_GROUPS = ['ADVISORY', 'TONE', 'STORY', 'FORM'] as const

export const zTagScale = z.object({
  key: zKey,
  name: z.string().min(1),
  /** Etiketleyiciye sorulan soru */
  question: z.string().min(1),
  /** ADVISORY: içerik uyarıları (cinsellik, şiddet, kan…) · TONE: ton · STORY: anlatı · FORM: biçim */
  group: z.enum(SCALE_GROUPS),
  levels: z.array(zScaleLevel).length(SCALE_MAX + 1),
  descriptors: z.array(zScaleDescriptor).default([]),
  /** İçerik uyarısı ölçeklerinde: RTÜK gerekçesi ve her seviye (0–5) için önerilen en düşük işaret */
  advisory: z
    .object({
      reason: z.enum(keysOf(MATURITY_REASONS)),
      ratings: z.array(z.enum(keysOf(MATURITY))).length(SCALE_MAX + 1),
    })
    .optional(),
})

/**
 * Mikro tür adındaki yuvalar. Çekirdek tür (ör. Dram) merkezdedir; yuvalar onu daraltır.
 *   ADJECTIVE sıfat · REGION köken bölgesi · SOURCE uyarlama kaynağı · SETTING mekân · PERIOD hikâyenin geçtiği dönem
 *   SUBJECT konu · AGE yaş grubu · LEAD ana karakter · FORMAT biçim · ERA yapım dönemi · PERSON oyuncu/yönetmen/sunucu
 */
export const MICROGENRE_SLOTS = [
  'ADJECTIVE',
  'REGION',
  'SOURCE',
  'SETTING',
  'PERIOD',
  'SUBJECT',
  'AGE',
  'LEAD',
  'FORMAT',
  'ERA',
  'PERSON',
] as const
export type MicrogenreSlot = (typeof MICROGENRE_SLOTS)[number]

export const zFacetValue = z.object({
  key: zKey,
  name: z.string().min(1),
  description: z.string().optional(),
  /** Mikro tür adında kullanılacak HAZIR ifade, ör. "Uzayda Geçen", "Gerçek Olaylardan Uyarlanan", "8–10 Yaş için" */
  phrase: z.string().optional(),
})

export const zTagFacet = z.object({
  key: zKey,
  name: z.string().min(1),
  question: z.string().min(1),
  /** Bu yüz mikro tür adında hangi yuvayı doldurur (doldurmuyorsa null) */
  slot: z.enum(MICROGENRE_SLOTS).nullable().default(null),
  multi: z.boolean().default(true),
  /** Bir fişte bu yüzden en çok kaç değer seçilebilir */
  max: z.number().int().positive().default(3),
  values: z.array(zFacetValue).min(2),
})

/** Çekirdek türün adda kullanılan çoğul biçimleri: film ("Dram Filmleri"), dizi ("Dram Dizileri"), karışık ("Dramlar"). */
export const zGenreNoun = z.object({
  movie: z.string().min(1),
  show: z.string().min(1),
  mixed: z.string().min(1),
  /** Kişi adıyla tamlama biçimi: "Charlie Chaplin Komedileri" */
  compound: z.string().optional(),
  /**
   * Film/dizi adının kişi adıyla tamlama biçimi ("Kısa Filmler" → "Colin Levy Kısa Filmleri"). Verilmezse film/dizi
   * biçimi olduğu gibi kullanılır ("Komedi Filmleri" zaten tamlamadır).
   */
  compoundMovie: z.string().optional(),
  compoundShow: z.string().optional(),
  /**
   * Bu türün adında zaten söylenen nitelikler (`YUVA:anahtar`, ör. "ADJECTIVE:komik", "FORMAT:bicim:sessiz"):
   * bu çekirdek türle ada girmezler ("Komik Komediler", "Sessiz Sessiz Filmler" oluşmaz).
   */
  implied: z.array(z.string()).optional(),
})

/** Köken bölgesi: başlığın `origin.countries` alanından türetilir. */
export const zRegion = z.object({
  key: zKey,
  /** "Yerli", "İskandinav", "Japon" */
  adjective: z.string().min(1),
  countries: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1),
})

/** Yapım dönemi: başlığın `year` alanından türetilir, ör. 1920–1929 → "1920'lerden". */
export const zEra = z.object({
  key: zKey,
  phrase: z.string().min(1),
  fromYear: z.number().int(),
  toYear: z.number().int(),
})

export const zVocabulary = z
  .object({
    /** Kılavuz sürümü: YYYY.AA-N. Ölçek/yüz anlamı değişince artar; fişler hangi sürümle doldurulduğunu taşır. */
    version: z.string().regex(/^\d{4}\.\d{2}-\d+$/),
    scales: z.array(zTagScale).min(6),
    facets: z.array(zTagFacet).min(4),
    naming: z.object({
      /** Anahtar: shared/taxonomy GENRES anahtarı */
      genreNouns: z.record(z.string(), zGenreNoun),
      regions: z.array(zRegion).default([]),
      eras: z.array(zEra).default([]),
      /** Yuvaların addaki sırası (soldan sağa); çekirdek tür adı en sonda gelir */
      order: z.array(z.enum(MICROGENRE_SLOTS)).min(1),
    }),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>()
    for (const k of [...v.scales.map((s) => s.key), ...v.facets.map((f) => f.key)]) {
      if (seen.has(k)) ctx.addIssue({ code: 'custom', message: `Yinelenen ölçek/yüz anahtarı: ${k}` })
      seen.add(k)
    }
    for (const s of v.scales)
      s.levels.forEach((l, i) => {
        if (l.value !== i) ctx.addIssue({ code: 'custom', message: `${s.key}: seviyeler 0'dan 5'e sıralı olmalı` })
      })
    for (const g of Object.keys(v.naming.genreNouns))
      if (!(g in GENRES)) ctx.addIssue({ code: 'custom', message: `Bilinmeyen tür anahtarı: ${g}` })
  })
export type TagVocabulary = z.infer<typeof zVocabulary>
export type TagScale = z.infer<typeof zTagScale>
export type TagFacet = z.infer<typeof zTagFacet>

/**
 * Fişin nereden geldiği:
 *   SAMPLE  depodaki örnek fiş — yapım izlenmeden, özet ve künyeden dolduruldu (gerçek etiketlemenin yerini tutmaz)
 *   TAGGER  eğitimli etiketleyici yapımı izleyerek doldurdu
 *   MODEL   otomatik öneri (künyeden ya da gömme komşularından); yalnız başlangıç noktasıdır
 *   IMPORT  başka bir sistemden aktarıldı
 */
export const TAG_SHEET_SOURCES = ['SAMPLE', 'TAGGER', 'MODEL', 'IMPORT'] as const
export const TAG_SHEET_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED'] as const

export const zTagSheet = z.object({
  /** Üst başlık (film/dizi) kimliği */
  titleId: z.number().int().positive(),
  rubricVersion: z.string(),
  source: z.enum(TAG_SHEET_SOURCES),
  /** Etiketleyicinin takma adı (kişisel veri değil), ör. 'etiket-01'. Örnek fişlerde null. */
  tagger: z
    .string()
    .regex(/^[a-z0-9][a-z0-9._-]{1,31}$/)
    .nullable()
    .default(null),
  status: z.enum(TAG_SHEET_STATUSES).default('APPROVED'),
  /** Yapım baştan sona izlendi mi */
  watched: z.boolean().default(false),
  taggedAt: z.iso.date(),
  /** Ölçek anahtarı → 0–5; null = değerlendirilmedi */
  scales: z.record(z.string(), z.number().int().min(0).max(SCALE_MAX).nullable()),
  /** Yüz anahtarı → değer anahtarları */
  facets: z.record(z.string(), z.array(z.string())).default({}),
  notes: z.string().max(2000).optional(),
})
export const zTagSheetsFile = z.array(zTagSheet)
export type TagSheet = z.infer<typeof zTagSheet>
export type TagSheetSource = (typeof TAG_SHEET_SOURCES)[number]
export type TagSheetStatus = (typeof TAG_SHEET_STATUSES)[number]
