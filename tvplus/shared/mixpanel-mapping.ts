/**
 * Mixpanel eşleme dosyasının şeması (content/analytics/mixpanel-mapping.json; sunucu deposundaki kopya
 * `dataDir/viewing/mixpanel-mapping.json` varsa onun önüne geçer). Ayrıntılı anlatım: docs/MIXPANEL.md.
 *
 * Eşleme; hangi Mixpanel olay adının hangi kanonik olay türüne (ViewingEventType), hangi özelliğin hangi alana
 * karşılık geldiğini söyler. Yeni bir olay adını bağlamak için yalnız bu JSON düzenlenir; kod değişmez.
 */
import { z } from 'zod'
import { VIEWING_EVENT_TYPES } from './intelligence'

/** Özellik eşlemesi yapılabilen alanlar. */
export const MAPPING_PROPERTY_FIELDS = [
  'contentId',
  'contentTitle',
  'watchedSeconds',
  'positionSeconds',
  'durationSeconds',
  'completed',
  'rating',
  'query',
  'device',
  'country',
] as const
export type MappingPropertyField = (typeof MAPPING_PROPERTY_FIELDS)[number]

export const TITLE_MATCH_STEPS = ['externalId', 'videoId', 'slug', 'title'] as const
export type TitleMatchStep = (typeof TITLE_MATCH_STEPS)[number]

/** Tek özellik adı ya da sırayla denenen adlar (ilk dolu olan kullanılır). */
const zPropertyNames = z.union([z.string().min(1).max(200), z.array(z.string().min(1).max(200)).min(1).max(10)])

const zPropertyMap = z
  .object({
    /** İçerik kimliği (katalogla `titleMatch.order` sırasıyla eşlenir) */
    contentId: zPropertyNames.optional(),
    /** İçerik adı: kimlik eşleşmezse ya da yoksa ad ile eşleme denenir */
    contentTitle: zPropertyNames.optional(),
    /** Bu olayın eklediği izleme süresi (`durationUnit` biriminde) */
    watchedSeconds: zPropertyNames.optional(),
    positionSeconds: zPropertyNames.optional(),
    durationSeconds: zPropertyNames.optional(),
    /** true / 'true' / 1 → tamamlandı */
    completed: zPropertyNames.optional(),
    /** Değer `ratingMap` ile −1 / 0 (temizle) / 1 / 2'ye çevrilir */
    rating: zPropertyNames.optional(),
    /** Arama sorgusu (en çok 80 karakter saklanır) */
    query: zPropertyNames.optional(),
    /** Cihaz/platform; değer `deviceMap` ile TV / MOBILE / WEB / OTHER'a çevrilir */
    device: zPropertyNames.optional(),
    /** ISO 3166-1 alpha-2 ülke kodu (Mixpanel'in kendi zenginleştirmesi: mp_country_code) */
    country: zPropertyNames.optional(),
  })
  .strict()

const zEventType = z.enum(VIEWING_EVENT_TYPES)

/** Olay kuralı: yalnız tür ya da tür + o olaya özgü özellik adları (genel `properties`'in önüne geçer). */
const zEventRule = z.union([zEventType, z.object({ type: zEventType, properties: zPropertyMap.optional() }).strict()])

export const zMixpanelMapping = z
  .object({
    /** Düzenleyicinin JSON şeması / açıklama alanı için serbest metin (yok sayılır) */
    $comment: z.string().max(2000).optional(),
    version: z.literal(1),
    /** İzleyici kimliğini taşıyan özellik; varsayılan Mixpanel'in `distinct_id`'si */
    viewerProperty: z.string().min(1).max(200).default('distinct_id'),
    /** Yinelenme anahtarı; yoksa satırın özeti kullanılır */
    insertIdProperty: z.string().min(1).max(200).default('$insert_id'),
    time: z
      .object({
        property: z.string().min(1).max(200).default('time'),
        /** 'auto': 10^11'den büyük değer milisaniye, değilse saniye sayılır */
        unit: z.enum(['auto', 's', 'ms']).default('auto'),
        /**
         * Değer UTC değil de proje saat diliminde yazılmışsa (2023 öncesi bazı projeler) o dilimin UTC farkı (dakika).
         * Örnek: İstanbul için 180 → okunan değerden 3 saat çıkarılır.
         */
        offsetMinutes: z.number().int().min(-840).max(840).default(0),
      })
      .strict()
      .prefault({}),
    /** Mixpanel olay adı → kanonik tür (adlar büyük/küçük harfe duyarlıdır) */
    events: z
      .record(z.string().min(1).max(255), zEventRule)
      .refine((r) => Object.keys(r).length > 0, 'En az bir olay eşlenmeli'),
    /** Tüm olaylar için özellik adları */
    properties: zPropertyMap.prefault({}),
    /** watchedSeconds / positionSeconds / durationSeconds değerlerinin birimi */
    durationUnit: z.enum(['s', 'ms', 'min']).default('s'),
    /** PLAY_END'de `completed` yoksa konum / süre bu oranı geçince tamamlandı sayılır */
    completionThreshold: z.number().min(0.5).max(1).default(0.9),
    /** Cihaz değeri (küçük harfe çevrilmiş) → cihaz sınıfı; eşleşmeyen dolu değer OTHER olur */
    deviceMap: z.record(z.string().min(1).max(100), z.enum(['TV', 'MOBILE', 'WEB', 'OTHER'])).default({}),
    /** Beğeni değeri (küçük harfe çevrilmiş metin) → −1 beğenmedi · 0 temizle · 1 beğendi · 2 çok beğendi */
    ratingMap: z
      .record(z.string().min(1).max(100), z.union([z.literal(-1), z.literal(0), z.literal(1), z.literal(2)]))
      .default({}),
    titleMatch: z
      .object({
        /** İçerik kimliğinin katalogla eşlenme sırası */
        order: z
          .array(z.enum(TITLE_MATCH_STEPS))
          .min(1)
          .default(['externalId', 'videoId', 'slug', 'title'])
          .refine((a) => new Set(a).size === a.length, 'Sıra adımları tekrar etmemeli'),
        /** Başlıklardaki `externalIds.<ad alanı>` */
        namespace: z
          .string()
          .regex(/^[a-z0-9_-]{1,40}$/)
          .default('mixpanel'),
      })
      .strict()
      .prefault({}),
  })
  .strict()

export type MixpanelMapping = z.infer<typeof zMixpanelMapping>
export type MixpanelMappingInput = z.input<typeof zMixpanelMapping>
export type MappingPropertyMap = z.infer<typeof zPropertyMap>
export type MappingEventRule = z.infer<typeof zEventRule>
