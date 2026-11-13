/**
 * İçerik dosyalarının (content/*.json) Zod şeması. İçerik ekibi yalnızca bu şemaya uyan JSON yazar;
 * `npm run validate:content` derlemeden önce doğrular. Sunucu (katalog servisi) aynı şemayla yükler.
 *
 * Kimlik aralıkları (çakışmasın diye):
 *   800100xx açık filmler (kendi CDN hattımız) · 8002xxxx arşiv klasikleri (tek dosya)
 *   8003xxxx–8006xxxx YouTube başlıkları · bölümler: dizi kimliği + 100 + sıra · fragman/ek video: 81xxxxxx
 *   kanallar 1–999 · koleksiyonlar 9000–9999
 */
import { z } from 'zod'
import { CHANNEL_CATEGORIES, GENRES, MATURITY, MATURITY_REASONS, MOODS, PRODUCTS } from './taxonomy'

const keysOf = <T extends Record<string, unknown>>(o: T) =>
  Object.keys(o) as [keyof T & string, ...(keyof T & string)[]]

export const zTimedText = z.object({
  lang: z.string().min(2), // 'tr', 'en'
  label: z.string(), // 'Türkçe'
  format: z.enum(['vtt', 'ttml']),
  /** Uzak adres ya da content/subtitles/ altındaki dosya adı (ikisinden biri). */
  url: z.url().optional(),
  file: z.string().optional(),
  kind: z.enum(['SUBTITLES', 'CC']).default('SUBTITLES'),
})

/** Bir içeriğin nereden ve nasıl oynatıldığı. İlk sıradaki kaynak varsayılandır. */
export const zSource = z.discriminatedUnion('type', [
  /** Kendi CDN hattımız: uzak açık köken, "on-demand" DASH (tek dosya + bayt aralığı dizini). */
  z.object({
    type: z.literal('DASH'),
    manifest: z.url(),
    /** Aynı içeriğin ek ses parçalarını (ör. 5.1) taşıyan ikinci MPD. */
    extraAudioManifest: z.url().optional(),
    timedText: z.array(zTimedText).default([]),
  }),
  /** Kendi CDN hattımız: `npm run package:title` ile yerelde paketlenmiş içerik (media/packaged/<id>/index.json). */
  z.object({ type: z.literal('PACKAGED'), id: z.string(), timedText: z.array(zTimedText).default([]) }),
  /** Tek dosya (ör. archive.org MP4); tarayıcı kendi Range istekleriyle oynatır, adres yine imzalı OCA üzerinden gider. */
  z.object({
    type: z.literal('PROGRESSIVE'),
    url: z.url(),
    mimeType: z.string().default('video/mp4'),
    sizeBytes: z.number().int().positive().optional(),
    timedText: z.array(zTimedText).default([]),
  }),
  /** YouTube resmî gömme (IFrame Player API). */
  z.object({
    type: z.literal('YOUTUBE'),
    videoId: z.string().regex(/^[\w-]{11}$/),
    startSec: z.number().int().min(0).optional(),
  }),
  /** Bir YouTube kanalının canlı yayını. */
  z.object({
    type: z.literal('YOUTUBE_LIVE'),
    channelId: z.string().regex(/^UC[\w-]{22}$/),
    /** Biliniyorsa sabit canlı yayın videosu. */
    videoId: z
      .string()
      .regex(/^[\w-]{11}$/)
      .optional(),
  }),
  /** Katalogdaki videolardan döngüyle kurulan doğrusal kanal (duvar saatine göre konumlanır). */
  z.object({ type: z.literal('LINEAR'), playlist: z.array(z.number().int()).min(1) }),
])
export type ContentSource = z.infer<typeof zSource>
export type ContentTimedText = z.infer<typeof zTimedText>

export const zArtwork = z
  .object({
    /** Kaynak görsel adresleri; boşsa görsel servisi başlıktan kapak üretir. */
    boxart: z.url().nullable().default(null), // dikey 2:3 afiş kaynağı
    storyArt: z.url().nullable().default(null), // yatay 16:9
    /** Kırpma odağı, CSS object-position biçiminde. */
    focal: z.string().default('50% 35%'),
    /**
     * Yatay (16:9) kaynaktan dikey afiş üretilirken: 'contain' görseli kırpmadan üst bölüme yerleştirir (üzerinde yazı
     * olan YouTube küçük resimleri için varsayılan), 'crop' odağa göre 2:3 kırpar (yazısız, temiz kareler için).
     */
    posterFit: z.enum(['crop', 'contain']).default('contain'),
  })
  .prefault({})

export const zMaturity = z.object({
  rating: z.enum(keysOf(MATURITY)),
  reasons: z.array(z.enum(keysOf(MATURITY_REASONS))).default([]),
})

export const zLicense = z.object({
  name: z.string(), // 'CC BY 3.0', 'Kamu malı', 'YouTube standart lisansı'
  attribution: z.string(), // '© Blender Foundation | durian.blender.org'
  url: z.url().optional(),
})

const zPlayableBase = z.object({
  videoId: z.number().int().positive(),
  title: z.string().min(1),
  synopsis: z.string().min(1),
  runtimeSec: z.number().int().positive().nullable().default(null),
  sources: z.array(zSource).min(1),
  artwork: zArtwork,
})

export const zEpisode = zPlayableBase.extend({
  number: z.number().int().positive(),
})

export const zSeason = z.object({
  number: z.number().int().positive(),
  title: z.string().optional(),
  episodes: z.array(zEpisode).min(1),
})

export const zSupplemental = zPlayableBase.extend({
  /** 'TRAILER' fragman · 'TEASER' · 'BEHIND_THE_SCENES' kamera arkası */
  subType: z.enum(['TRAILER', 'TEASER', 'BEHIND_THE_SCENES']).default('TRAILER'),
})

export const zTitle = z
  .object({
    videoId: z.number().int().positive(),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    type: z.enum(['MOVIE', 'SHOW']),
    title: z.string().min(1),
    originalTitle: z.string().optional(),
    year: z.number().int().min(1888).max(2100),
    /** Detay ekranı özeti (2–4 cümle). */
    synopsis: z.string().min(20),
    /** Kart/önizleme özeti (en çok 140 karakter). */
    shortSynopsis: z.string().max(140),
    genres: z
      .array(z.enum(keysOf(GENRES)))
      .min(1)
      .max(4),
    moods: z
      .array(z.enum(keysOf(MOODS)))
      .max(5)
      .default([]),
    cast: z.array(z.string()).default([]),
    directors: z.array(z.string()).default([]),
    creators: z.array(z.string()).default([]),
    keywords: z.array(z.string()).default([]),
    maturity: zMaturity,
    kids: z.boolean().default(false),
    /** Filmler için süre; YouTube kaynaklarında bilinmiyorsa null (oynatıcı öğrenip bildirir). */
    runtimeSec: z.number().int().positive().nullable().default(null),
    /** Filmlerde oynatma kaynakları (dizilerde kaynak bölümlerdedir). */
    sources: z.array(zSource).default([]),
    seasons: z.array(zSeason).default([]),
    /** Üzerine gelince oynayan kısa önizleme: hangi kaynağın kaçıncı saniyesinden. */
    promo: z
      .object({ source: zSource, offsetSec: z.number().int().min(0).default(0) })
      .nullable()
      .default(null),
    supplementals: z.array(zSupplemental).default([]),
    artwork: zArtwork,
    license: zLicense,
    availability: z
      .object({
        addedAt: z.iso.date(), // 'YYYY-MM-DD'
        leavingAt: z.iso.date().nullable().default(null),
        exclusive: z.boolean().default(false), // "Sadece TV+'ta" rozeti
        requiredProduct: z.enum(keysOf(PRODUCTS)).nullable().default(null), // null → temel pakette
      })
      .prefault({ addedAt: '2026-01-01' }),
    /** 0–100 başlangıç popülerliği (Top 10 için olay sayılarıyla harmanlanır). */
    popularity: z.number().min(0).max(100).default(50),
    /* ── İçerik zekâsı alanları (hepsi isteğe bağlı; bkz. docs/ICERIK_ZEKASI.md) ── */
    /** Yapımın kökeni: ülke ve özgün dil. İçgörülerdeki "dil ve ülke" kırılımı ile mikro türlerin bölge yuvası bunu kullanır. */
    origin: z
      .object({
        /** ISO 3166-1 alpha-2, ilk sıradaki ana yapım ülkesi, ör. ['TR'] */
        countries: z.array(z.string().regex(/^[A-Z]{2}$/)).default([]),
        /** ISO 639 özgün dil(ler), ör. ['tr']; sözsüz/sessiz yapımlar için 'zxx' */
        languages: z.array(z.string().regex(/^[a-z]{2,3}$/)).default([]),
      })
      .optional(),
    /**
     * Edinim türü: ORIGINAL kendi yapımı · LICENSED lisanslı kütüphane içeriği · OPEN açık lisans/kamu malı ·
     * EMBED üçüncü taraf gömme. Verilmezse lisans ve kaynak türünden türetilir.
     */
    acquisition: z.enum(['ORIGINAL', 'LICENSED', 'OPEN', 'EMBED']).optional(),
    /**
     * Başka sistemlerdeki kimlikler: ad alanı → kimlik, ör. { "mixpanel": "cnt_48213" }.
     * Mixpanel içe aktarımı izleme olaylarını katalogla bununla eşler.
     */
    externalIds: z.record(z.string(), z.string()).optional(),
  })
  .superRefine((t, ctx) => {
    if (t.type === 'MOVIE' && t.sources.length === 0)
      ctx.addIssue({ code: 'custom', message: 'Filmde en az bir kaynak olmalı' })
    if (t.type === 'SHOW' && t.seasons.length === 0)
      ctx.addIssue({ code: 'custom', message: 'Dizide en az bir sezon olmalı' })
  })
export type ContentTitle = z.infer<typeof zTitle>
export type ContentEpisode = z.infer<typeof zEpisode>
export type ContentSeason = z.infer<typeof zSeason>
export type ContentSupplemental = z.infer<typeof zSupplemental>

export const zChannel = z.object({
  channelId: z.number().int().min(1).max(999),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  number: z.number().int().positive(), // kumanda numarası
  category: z.enum(keysOf(CHANNEL_CATEGORIES)),
  description: z.string(),
  /** web/public/brand/channels/ altındaki dosya ya da null (ad baş harflerinden logo üretilir). */
  logo: z.string().nullable().default(null),
  isHd: z.boolean().default(true),
  favorite: z.boolean().default(false), // varsayılan "Kanallarım"
  kids: z.boolean().default(false),
  source: zSource,
  requiredProduct: z.enum(keysOf(PRODUCTS)).nullable().default(null),
})
export type ContentChannel = z.infer<typeof zChannel>

/** Örnek yayın akışı şablonu: her gün aynı saatlerde tekrar eder (İstanbul saati). LINEAR kanalların akışı çalma listesinden üretilir. */
export const zEpgTemplate = z.object({
  channelId: z.number().int(),
  /** true → arayüz "örnek yayın akışı" notu gösterir (gerçek kanalın gerçek akışı değildir). */
  isSample: z.boolean().default(true),
  programs: z
    .array(
      z.object({
        start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        durationMin: z.number().int().positive(),
        title: z.string(),
        synopsis: z.string().default(''),
        kind: z.enum(['haber', 'film', 'dizi', 'spor', 'belgesel', 'cocuk', 'program', 'muzik']),
        /** Katalogda karşılığı varsa (geri al / baştan başlat bu videoyu oynatır). */
        videoId: z.number().int().optional(),
      }),
    )
    .min(1),
})
export type ContentEpgTemplate = z.infer<typeof zEpgTemplate>

export const zCollection = z.object({
  collectionId: z.number().int().min(9000).max(9999),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  description: z.string(),
  videoIds: z.array(z.number().int()).min(2),
})
export type ContentCollection = z.infer<typeof zCollection>

/** Film & Dizi ana sayfasının editoryal satır düzeni (kişisel satırları keşif servisi ekler). */
export const zHomeLayout = z.object({
  billboard: z.array(z.number().int()).min(1), // vitrin adayları
  rows: z.array(
    z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('genre'), genre: z.enum(keysOf(GENRES)), title: z.string().optional() }),
      z.object({ kind: z.literal('collection'), collectionId: z.number().int() }),
      z.object({
        kind: z.literal('curated'),
        id: z.string(),
        title: z.string(),
        videoIds: z.array(z.number().int()).min(3),
      }),
    ]),
  ),
})
export type ContentHomeLayout = z.infer<typeof zHomeLayout>

export const zNotificationSeed = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  videoId: z.number().int().optional(),
  channelId: z.number().int().optional(),
})

export const zInterstitial = z.object({
  id: z.string(),
  location: z.enum(['HOME', 'LIVE']),
  title: z.string(),
  body: z.string(),
  cta: z.string(),
  /** Uygulama içi hedef (hash yolu), ör. '#/canli'. */
  href: z.string(),
})

/** content/ klasöründeki dosyalar ve şemaları. `titles/*.json` her biri ContentTitle[] içerir. */
export const CONTENT_FILES = {
  titlesDir: 'titles',
  channels: 'channels.json',
  epg: 'epg.json',
  collections: 'collections.json',
  homeLayout: 'home-layout.json',
  notifications: 'notifications.json',
  interstitials: 'interstitials.json',
  subtitlesDir: 'subtitles',
} as const

export const zTitlesFile = z.array(zTitle)
export const zChannelsFile = z.array(zChannel)
export const zEpgFile = z.array(zEpgTemplate)
export const zCollectionsFile = z.array(zCollection)
export const zNotificationsFile = z.array(zNotificationSeed)
export const zInterstitialsFile = z.array(zInterstitial)
