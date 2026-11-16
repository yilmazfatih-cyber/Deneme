/**
 * İçerik şemaları: src/content/ altındaki her dosyanın ön bilgisi (frontmatter) ya da JSON verisi buna uymak zorundadır.
 * Bir yanlış (eksik alan, kısa açıklama, bilinmeyen anahtar) derlemeyi hangi dosyada neyin yanlış olduğunu söyleyen
 * Türkçe bir iletiyle durdurur. Kim kullanır: src/content.config.ts (koleksiyonları tanımlar), tests/unit/content-schemas.test.ts.
 * Genişletme: yazılara yeni bir ön bilgi alanı eklemek için ilgili şemaya alanı ekleyin; alan adı bilinmezse
 * "Bilinmeyen alan" hatası alırsınız (yazım hatalarını yakalamak için bilerek böyle). Tarif: AGENTS.md.
 */
import { lineIconNames } from '../components/icons.ts'
import { z } from './zod-tr.ts'

/** Üreteçlerin yazdığı yer tutucu açıklama. Yayımlanan (draft: false) içerikte kalırsa kural testi uyarır. */
export const PLACEHOLDER_DESCRIPTION =
  'AÇIKLAMA YAZIN: arama sonuçlarında görünen, 50 ile 160 karakter arası tek cümlelik özet.'

const length = (input: unknown) => (typeof input === 'string' ? input.trim().length : 0)

/** Zorunlu metin alanı: uzunluk sınırı ve ne yazılacağını anlatan iletiler. */
function text(min: number, max: number, hint: string) {
  return z
    .string({ error: (issue) => (issue.input === undefined ? `Bu alan zorunlu. ${hint}` : `Metin olmalı. ${hint}`) })
    .trim()
    .min(min, { error: (issue) => `En az ${min} karakter olmalı (şu an ${length(issue.input)}). ${hint}` })
    .max(max, { error: (issue) => `En fazla ${max} karakter olmalı (şu an ${length(issue.input)}). ${hint}` })
}

const date = (hint: string) => z.coerce.date({ error: `Tarih YYYY-AA-GG biçiminde olmalı, ör. 2026-11-16. ${hint}` })

const bool = (hint: string) => z.boolean({ error: `Yalnız true ya da false yazılabilir. ${hint}` })

const translationKey = z
  .string({ error: 'translationKey metin olmalı.' })
  .regex(/^[a-z0-9-]+$/u, {
    error:
      'translationKey yalnız küçük harf, rakam ve tire içerebilir. Çevirileri birbirine bağlamak için iki dilde aynı değeri yazın.',
  })
  .optional()

/** İç adres ("/blog/", "/#fiyatlar") ya da dış adres ("https://…", "mailto:…"). */
const href = z.string({ error: 'Adres metin olmalı.' }).regex(/^(\/|#|https?:\/\/|mailto:|tel:)\S*$/u, {
  error: 'Adres "/" ile (iç sayfa) ya da "https://", "mailto:", "tel:" ile (dış adres) başlamalı; boşluk içeremez.',
})

/** Ön bilgide bilinmeyen anahtar varsa izinli alanları sayan nesne şeması. */
function strict<T extends z.ZodRawShape>(shape: T) {
  const allowed = Object.keys(shape).join(', ')
  return z.strictObject(shape, {
    error: (issue) =>
      issue.code === 'unrecognized_keys'
        ? `Bilinmeyen alan: ${issue.keys.join(', ')}. Yazım hatası olabilir. Kullanılabilen alanlar: ${allowed}.`
        : undefined,
  })
}

const ICON_HINT = `Simge adlarından biri olmalı: ${lineIconNames.join(', ')}.`
const icon = z.enum(lineIconNames, { error: ICON_HINT })

/* ---------------------------------------------------------------- Markdown koleksiyonları */

/** Blog yazısı: src/content/blog/<dil>/<kisa-ad>.md(x) */
export function blogSchema<I extends z.ZodType>(image: () => I) {
  return strict({
    title: text(10, 70, 'Yazının başlığı; arama sonuçlarında görünür.'),
    description: text(50, 160, 'Arama sonuçlarında ve paylaşım kartında görünen özet.'),
    date: date('Yayın tarihi.'),
    updated: date('Son güncelleme tarihi (isteğe bağlı).').optional(),
    tags: z
      .array(text(2, 30, 'Etiket adı.'), { error: 'Etiketler liste olmalı, ör. tags: [SEO, Tasarım]' })
      .max(5, { error: 'En fazla 5 etiket yazın.' })
      .default([]),
    draft: bool('Taslak yazılar canlı sitede görünmez.').default(false),
    cover: image().optional(),
    coverAlt: text(5, 160, 'Kapak görselini anlatan kısa metin (ekran okuyucular için).').optional(),
    author: z
      .string({ error: 'author, src/content/ekip/<dil>.json içindeki bir kişinin "id" değeri olmalı.' })
      .regex(/^[a-z0-9-]+$/u, { error: 'author yalnız küçük harf, rakam ve tire içerir (ekip dosyasındaki "id").' })
      .optional(),
    translationKey,
  }).superRefine((data, ctx) => {
    if (data.cover !== undefined && data.coverAlt === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['coverAlt'],
        message: 'Kapak görseli varsa coverAlt (görselin açıklaması) zorunlu.',
      })
    }
    if (data.updated !== undefined && data.updated < data.date) {
      ctx.addIssue({ code: 'custom', path: ['updated'], message: 'Güncelleme tarihi yayın tarihinden önce olamaz.' })
    }
  })
}

/** Belge: src/content/belgeler/<dil>/<kisa-ad>.md(x) — yan menüde `order` sırasıyla, `group` başlığı altında görünür. */
export const docSchema = strict({
  title: text(3, 70, 'Belgenin başlığı.'),
  description: text(50, 160, 'Arama sonuçlarında görünen özet.'),
  group: text(2, 40, 'Yan menüdeki grup başlığı, ör. "Başlangıç".'),
  order: z
    .number({ error: 'order bir sayı olmalı (10, 20, 30… gibi aralıklı yazın; araya yeni belge sığsın).' })
    .int({ error: 'order tam sayı olmalı.' }),
  updated: date('Son güncelleme tarihi (isteğe bağlı).').optional(),
  draft: bool('Taslak belgeler canlı sitede görünmez.').default(false),
  translationKey,
})

/** Serbest sayfa: src/content/sayfalar/<dil>/<kisa-ad>.md(x) → /<kisa-ad>/ */
export const pageSchema = strict({
  title: text(3, 70, 'Sayfanın başlığı.'),
  description: text(50, 160, 'Arama sonuçlarında görünen özet.'),
  /** Yasal metin şablonu mu? true ise sayfanın başında "şablondur, hukuki danışmanlık değildir" uyarısı çıkar. */
  legalTemplate: bool('Yasal şablon uyarısı gösterilsin mi?').default(false),
  /** true ise sayfanın sonunda ekip (src/content/ekip/<dil>.json) gösterilir. */
  showTeam: bool('Ekip listesi gösterilsin mi?').default(false),
  updated: date('Son güncelleme tarihi (isteğe bağlı).').optional(),
  draft: bool('Taslak sayfalar canlı sitede görünmez.').default(false),
  translationKey,
})

/* ---------------------------------------------------------------- Veri koleksiyonları (dil başına bir JSON) */

const link = strict({ label: text(2, 40, 'Düğme yazısı.'), href })

/** Ana sayfa metinleri: src/content/anasayfa/<dil>.json */
export const homeSchema = strict({
  hero: strict({
    eyebrow: text(3, 60, 'Başlığın üstündeki küçük etiket.'),
    title: text(10, 80, 'Ana sayfanın en büyük başlığı (sayfadaki tek h1).'),
    lead: text(40, 260, 'Başlığın altındaki açıklama.'),
    primary: link,
    secondary: link.optional(),
    note: text(5, 100, 'Düğmelerin altındaki küçük not.').optional(),
    /** Sağdaki örnek ürün ekranı (HTML ile çizilir; görsel dosyası gerekmez). Silinirse başlık tek sütun olur. */
    mockup: strict({
      title: text(3, 40, 'Ekranın başlığı, ör. "Bugün".'),
      subtitle: text(3, 40, 'Başlığın üstündeki küçük metin, ör. tarih.'),
      badge: text(2, 24, 'Sağ üstteki küçük rozet.'),
      items: z
        .array(
          strict({
            time: text(3, 8, 'Saat, ör. "09:30".'),
            name: text(2, 30, 'Kişi adı.'),
            service: text(2, 40, 'Hizmet adı.'),
            status: text(2, 20, 'Durum etiketi.'),
            tone: z.enum(['brand', 'accent', 'neutral'], { error: 'tone: "brand", "accent" ya da "neutral" olmalı.' }),
          }),
        )
        .min(2, { error: 'En az 2 satır yazın.' })
        .max(5, { error: 'En fazla 5 satır yazın.' }),
      footer: text(5, 70, 'Ekranın altındaki bilgi satırı.'),
      stat: strict({
        value: text(1, 10, 'Büyük sayı, ör. "%38".'),
        label: text(5, 60, 'Sayının açıklaması.'),
      }).optional(),
    }).optional(),
  }),
  features: strict({
    eyebrow: text(2, 40, 'Küçük etiket.'),
    title: text(5, 90, 'Bölüm başlığı.'),
    lead: text(10, 260, 'Bölüm açıklaması.'),
  }),
  steps: strict({
    eyebrow: text(2, 40, 'Küçük etiket.'),
    title: text(5, 90, 'Bölüm başlığı.'),
    lead: text(10, 260, 'Bölüm açıklaması.'),
    items: z
      .array(strict({ title: text(3, 60, 'Adım başlığı.'), text: text(10, 260, 'Adım açıklaması.') }))
      .min(2, { error: 'En az 2 adım yazın.' })
      .max(4, { error: 'En fazla 4 adım yazın.' }),
  }),
  testimonials: strict({
    eyebrow: text(2, 40, 'Küçük etiket.'),
    title: text(5, 90, 'Bölüm başlığı.'),
    lead: text(10, 260, 'Bölüm açıklaması.'),
  }),
  pricing: strict({
    eyebrow: text(2, 40, 'Küçük etiket.'),
    title: text(5, 90, 'Bölüm başlığı.'),
    lead: text(10, 260, 'Bölüm açıklaması.'),
    note: text(5, 200, 'Fiyat tablosunun altındaki not.').optional(),
  }),
  faq: strict({
    eyebrow: text(2, 40, 'Küçük etiket.'),
    title: text(5, 90, 'Bölüm başlığı.'),
    lead: text(10, 260, 'Bölüm açıklaması.'),
    contact: link.optional(),
  }),
  cta: strict({
    title: text(5, 90, 'Sayfa sonundaki çağrı başlığı.'),
    lead: text(10, 260, 'Çağrı açıklaması.'),
    primary: link,
    secondary: link.optional(),
  }),
})

/** Özellikler: src/content/ozellikler/<dil>.json */
export const featuresSchema = strict({
  items: z
    .array(strict({ icon, title: text(3, 50, 'Özellik başlığı.'), text: text(20, 220, 'Özelliğin kısa açıklaması.') }))
    .min(1, { error: 'En az bir özellik yazın.' })
    .max(12, { error: 'En fazla 12 özellik yazın.' }),
})

/** Sık sorulan sorular: src/content/sss/<dil>.json (ana sayfada ve FAQPage yapısal verisinde kullanılır). */
export const faqSchema = strict({
  items: z
    .array(strict({ question: text(8, 140, 'Soru.'), answer: text(20, 700, 'Yanıt (düz metin).') }))
    .min(1, { error: 'En az bir soru yazın.' }),
})

/** Fiyatlar: src/content/fiyatlar/<dil>.json */
export const pricingSchema = strict({
  /** Para birimi kodu: TRY, USD, EUR… */
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/u, { error: 'currency üç büyük harfli para birimi kodu olmalı: "TRY", "USD", "EUR".' }),
  /** Fiyatın yanındaki dönem: "ay", "month" */
  period: text(2, 20, 'Fiyat dönemi, ör. "ay".'),
  items: z
    .array(
      strict({
        name: text(2, 30, 'Paket adı.'),
        price: z
          .number({ error: 'price bir sayı olmalı (ücretsiz paket için 0).' })
          .min(0, { error: 'price eksi olamaz.' }),
        description: text(10, 140, 'Paketin kime uygun olduğu.'),
        features: z
          .array(text(3, 80, 'Paket özelliği.'))
          .min(1, { error: 'En az bir özellik yazın.' })
          .max(10),
        cta: link,
        highlighted: bool('Öne çıkan paket mi?').default(false),
      }),
    )
    .min(1, { error: 'En az bir paket yazın.' })
    .max(4, { error: 'En fazla 4 paket yazın.' }),
}).superRefine((data, ctx) => {
  if (data.items.filter((item) => item.highlighted).length > 1) {
    ctx.addIssue({ code: 'custom', path: ['items'], message: 'Yalnız bir paket "highlighted": true olabilir.' })
  }
})

/** Müşteri görüşleri: src/content/referanslar/<dil>.json */
export const testimonialsSchema = strict({
  items: z
    .array(
      strict({
        quote: text(30, 400, 'Müşterinin sözü.'),
        name: text(3, 60, 'Kişinin adı.'),
        role: text(3, 80, 'Görevi ve işletmesi.'),
      }),
    )
    .min(1, { error: 'En az bir görüş yazın.' })
    .max(6, { error: 'En fazla 6 görüş yazın.' }),
})

/** Ekip: src/content/ekip/<dil>.json (Hakkında sayfasında ve yazı yazarlarında kullanılır). */
export const teamSchema = strict({
  items: z
    .array(
      strict({
        id: z
          .string()
          .regex(/^[a-z0-9-]+$/u, { error: 'id yalnız küçük harf, rakam ve tire içerir, ör. "elif-aydin".' }),
        name: text(3, 60, 'Ad soyad.'),
        role: text(2, 60, 'Görevi.'),
        bio: text(20, 300, 'Kısa tanıtım.'),
      }),
    )
    .min(1, { error: 'En az bir kişi yazın.' }),
})
