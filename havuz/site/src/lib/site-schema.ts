/**
 * site.config.ts dosyasının şeması ve `defineSiteConfig()` yardımcısı.
 * Ayar dosyasındaki bir yanlış (eksik alan, kısa açıklama, hatalı renk) derlemeyi Türkçe bir iletiyle durdurur.
 * Kim kullanır: src/site.config.ts (tek çağrı). Türler: bütün bileşenler `SiteConfig` üzerinden okur.
 * Genişletme: ayar dosyasına yeni bir alan ekleyecekseniz önce buradaki şemaya ekleyin (aksi hâlde "Tanınmayan anahtar" hatası alırsınız).
 */
import { formatIssues, z } from './zod-tr.ts'

const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, { error: `En az ${min} karakter olmalı.` })
    .max(max, { error: `En fazla ${max} karakter olmalı.` })

/** İç adres ("/blog/", "/#fiyatlar") ya da dış adres ("https://…", "mailto:…", "tel:…"). */
const href = z.string().regex(/^(\/|#|https?:\/\/|mailto:|tel:)\S*$/u, {
  error: 'Adres "/" ile (iç sayfa) ya da "https://", "mailto:", "tel:" ile (dış adres) başlamalı; boşluk içeremez.',
})

const link = z.strictObject({ label: text(1, 40), href })

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/u, { error: 'Renk "#1f5f4a" gibi 6 haneli yazılmalı.' })

const httpsUrl = z.string().regex(/^https:\/\/\S+$/u, { error: 'Adres "https://" ile başlamalı.' })

const localeSchema = z.strictObject({
  /** Dil değiştiricide görünen ad: "Türkçe" */
  label: text(2, 30),
  /** <html lang> ve hreflang değeri: "tr", "en", "en-GB" */
  lang: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/u, { error: 'Dil kodu "tr" ya da "en-GB" biçiminde olmalı.' }),
  /** Open Graph yerel ayarı: "tr_TR" */
  ogLocale: z.string().regex(/^[a-z]{2}_[A-Z]{2}$/u, { error: 'ogLocale "tr_TR" biçiminde olmalı.' }),
  /** Ana sayfanın <title> metni (arama sonuçlarında görünen başlık). */
  title: text(10, 65),
  /** Varsayılan meta açıklaması; açıklaması olmayan sayfalarda kullanılır. */
  description: text(50, 160),
  /** Üst menü. */
  nav: z.array(link).min(1).max(7),
  /** Üst menünün sağındaki ana düğme (yoksa null). */
  cta: link.nullable(),
  footer: z.strictObject({
    tagline: text(10, 160),
    columns: z.array(z.strictObject({ title: text(2, 30), links: z.array(link).min(1).max(8) })).max(4),
    legal: z.array(link).max(6),
  }),
  /** Sayfanın en üstündeki duyuru şeridi (yoksa null). */
  announcement: z.strictObject({ text: text(5, 90), href, linkLabel: text(2, 30) }).nullable(),
})

const siteSchema = z
  .strictObject({
    name: text(1, 40),
    url: z.string().regex(/^https?:\/\/[^\s/]+(\/[^\s?#]*)?$/u, {
      error: 'Site adresi "https://www.ornek.com" gibi tam bir adres olmalı.',
    }),
    defaultLocale: z.string(),
    locales: z.record(
      z.string().regex(/^[a-z]{2}$/u, { error: 'Dil anahtarı iki küçük harf olmalı: "tr", "en".' }),
      localeSchema,
    ),
    organization: z.strictObject({
      legalName: text(2, 80),
      foundingYear: z.number().int().min(1900).max(2100).optional(),
    }),
    contact: z.strictObject({
      email: z.email({ error: 'Geçerli bir e-posta adresi yazın: "merhaba@ornek.com".' }),
      phone: z
        .string()
        .regex(/^\+?[0-9 ()-]{7,20}$/u, { error: 'Telefon "+90 212 000 00 00" biçiminde olmalı.' })
        .optional(),
      address: z
        .strictObject({
          street: text(2, 120),
          city: text(2, 60),
          postalCode: text(3, 12).optional(),
          country: z.string().regex(/^[A-Z]{2}$/u, { error: 'Ülke kodu iki büyük harf olmalı: "TR".' }),
        })
        .optional(),
    }),
    /** Sosyal hesaplar; kullanmadığınızı silin. */
    social: z.strictObject({
      github: httpsUrl.optional(),
      x: httpsUrl.optional(),
      linkedin: httpsUrl.optional(),
      instagram: httpsUrl.optional(),
      youtube: httpsUrl.optional(),
      facebook: httpsUrl.optional(),
    }),
    brand: z.strictObject({ primary: hexColor, accent: hexColor }),
    blog: z.strictObject({ postsPerPage: z.number().int().min(1).max(50) }),
    /** Ziyaret ölçümü. Varsayılan: null (hiçbir betik yüklenmez). */
    analytics: z.strictObject({ src: httpsUrl, attributes: z.record(z.string(), z.string()).default({}) }).nullable(),
  })
  .superRefine((config, ctx) => {
    if (!(config.defaultLocale in config.locales)) {
      ctx.addIssue({
        code: 'custom',
        path: ['defaultLocale'],
        message: `"${config.defaultLocale}" dili "locales" içinde tanımlı değil.`,
      })
    }
  })

export type SiteConfigInput = z.input<typeof siteSchema>
type ParsedSiteConfig = z.output<typeof siteSchema>
export type LocaleConfig = ParsedSiteConfig['locales'][string]
export type SiteLink = z.output<typeof link>

/** Doğrulanmış ayar; dil anahtarları ("tr" | "en") tür düzeyinde korunur. */
export type SiteConfig<L extends string = string> = Omit<ParsedSiteConfig, 'locales' | 'defaultLocale'> & {
  defaultLocale: L
  locales: Record<L, LocaleConfig>
}

/**
 * Ayarı doğrular ve türleriyle birlikte geri verir. Hata varsa hangi alanın neden yanlış olduğunu yazar.
 */
export function defineSiteConfig<const T extends SiteConfigInput>(input: T): SiteConfig<keyof T['locales'] & string> {
  const parsed = siteSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error(
      `src/site.config.ts hatalı:\n${formatIssues(parsed.error)}\nAlanların anlamı: AGENTS.md → "Harita".`,
    )
  }
  return parsed.data as SiteConfig<keyof T['locales'] & string>
}
