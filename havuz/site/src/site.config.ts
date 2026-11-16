/**
 * SİTENİN TEK AYAR DOSYASI. Adı, adresi, dilleri, menüsü, alt bilgisi, iletişim bilgileri, renkleri burada durur.
 * Kendi siteniz için önce bu dosyayı, sonra src/content/ altındaki içerikleri değiştirin; bileşenlere dokunmanız gerekmez.
 * Kim kullanır: astro.config.ts, bütün düzenler ve bileşenler, denetim betikleri (saf modül).
 * Doğrulama: yanlış yazılan bir alan derlemeyi Türkçe bir iletiyle durdurur (şema: src/lib/site-schema.ts).
 * Genişletme: yeni bir ayar alanı için önce şemaya, sonra buraya ekleyin. Tarifler: AGENTS.md.
 *
 * Adres yazma kuralı: iç sayfalar "/" ile başlar ("/blog/", "/#fiyatlar"); dış adresler "https://" ile.
 * Örnek marka ("Sedir") ve bütün kişi/firma adları kurgusaldır.
 */
import { defineSiteConfig } from './lib/site-schema.ts'

export const siteConfig = defineSiteConfig({
  /** Site / marka adı: üst menüde, sekme başlığında ve paylaşım görsellerinde görünür. */
  name: 'Sedir',

  /** Sitenin yayınlanacağı adres. Yayın sırasında SITE_URL ortam değişkeni verilirse o kullanılır. */
  url: 'https://sedir.example',

  /** Kök adreste ("/") yayınlanan dil. Diğer diller kendi klasöründe yayınlanır ("/en/"). */
  defaultLocale: 'tr',

  locales: {
    tr: {
      label: 'Türkçe',
      lang: 'tr',
      ogLocale: 'tr_TR',
      title: 'Sedir — Randevu ve hatırlatma yazılımı',
      description:
        'Sedir ile müşterileriniz 7/24 çevrim içi randevu alır, hatırlatmalar kendiliğinden gider. Küçük işletmeler için sade randevu yazılımı.',
      nav: [
        { label: 'Özellikler', href: '/#ozellikler' },
        { label: 'Fiyatlar', href: '/#fiyatlar' },
        { label: 'Blog', href: '/blog/' },
        { label: 'Belgeler', href: '/belgeler/' },
        { label: 'Hakkında', href: '/hakkinda/' },
      ],
      cta: { label: 'Ücretsiz deneyin', href: '/iletisim/' },
      footer: {
        tagline: 'Randevular dolsun, telefon sussun. Küçük işletmeler için sade randevu yazılımı.',
        columns: [
          {
            title: 'Ürün',
            links: [
              { label: 'Özellikler', href: '/#ozellikler' },
              { label: 'Nasıl çalışır?', href: '/#nasil-calisir' },
              { label: 'Fiyatlar', href: '/#fiyatlar' },
              { label: 'Sık sorulanlar', href: '/#sss' },
            ],
          },
          {
            title: 'Kaynaklar',
            links: [
              { label: 'Blog', href: '/blog/' },
              { label: 'Belgeler', href: '/belgeler/' },
              { label: 'RSS', href: '/rss.xml' },
            ],
          },
          {
            title: 'Şirket',
            links: [
              { label: 'Hakkında', href: '/hakkinda/' },
              { label: 'İletişim', href: '/iletisim/' },
            ],
          },
        ],
        legal: [
          { label: 'Gizlilik', href: '/gizlilik/' },
          { label: 'KVKK aydınlatma metni', href: '/kvkk/' },
          { label: 'Çerez politikası', href: '/cerez-politikasi/' },
        ],
      },
      announcement: {
        text: 'Yeni kılavuz: Sitenizi yayına almadan önce bakmanız gereken SEO listesi.',
        href: '/blog/seo-temel-denetim-listesi/',
        linkLabel: 'Yazıyı okuyun',
      },
    },
    en: {
      label: 'English',
      lang: 'en',
      ogLocale: 'en_US',
      title: 'Sedir — Booking and reminder software',
      description:
        'With Sedir your customers book online around the clock and reminders go out on their own. Simple scheduling software for small businesses.',
      nav: [
        { label: 'Features', href: '/en/#features' },
        { label: 'Pricing', href: '/en/#pricing' },
        { label: 'Blog', href: '/en/blog/' },
        { label: 'Docs', href: '/en/docs/' },
        { label: 'About', href: '/en/about/' },
      ],
      cta: { label: 'Start free', href: '/en/contact/' },
      footer: {
        tagline: 'Fill the calendar, quiet the phone. Simple scheduling software for small businesses.',
        columns: [
          {
            title: 'Product',
            links: [
              { label: 'Features', href: '/en/#features' },
              { label: 'How it works', href: '/en/#how-it-works' },
              { label: 'Pricing', href: '/en/#pricing' },
              { label: 'FAQ', href: '/en/#faq' },
            ],
          },
          {
            title: 'Resources',
            links: [
              { label: 'Blog', href: '/en/blog/' },
              { label: 'Docs', href: '/en/docs/' },
              { label: 'RSS', href: '/en/rss.xml' },
            ],
          },
          {
            title: 'Company',
            links: [
              { label: 'About', href: '/en/about/' },
              { label: 'Contact', href: '/en/contact/' },
            ],
          },
        ],
        legal: [],
      },
      announcement: null,
    },
  },

  /** Arama motorlarına verilen kurum bilgisi (JSON-LD). */
  organization: {
    legalName: 'Sedir Yazılım A.Ş.',
    foundingYear: 2021,
  },

  /** İletişim sayfasında ve alt bilgide görünür. `phone` ve `address` isteğe bağlıdır; kullanmıyorsanız silin. */
  contact: {
    email: 'merhaba@sedir.example',
    phone: '+90 000 000 00 00',
    address: {
      street: 'Örnek Mahallesi, Deneme Sokak No: 1',
      city: 'Kadıköy, İstanbul',
      postalCode: '34000',
      country: 'TR',
    },
  },

  /** Sosyal hesaplar: yalnız kullandıklarınızı bırakın (github, x, linkedin, instagram, youtube, facebook). */
  social: {
    instagram: 'https://example.com/instagram',
    linkedin: 'https://example.com/linkedin',
    x: 'https://example.com/x',
  },

  /**
   * Marka renkleri. Yalnız bu iki değeri değiştirin: düğme, bağlantı ve vurgu tonları (açık ve koyu tema için)
   * okunabilirlik kurallarına uyacak biçimde bu renklerden kendiliğinden türetilir (src/lib/color.ts).
   */
  brand: {
    primary: '#1f5f4a',
    accent: '#b4532a',
  },

  blog: {
    /** Blog listesinde bir sayfada kaç yazı görünsün? */
    postsPerPage: 4,
  },

  /**
   * Ziyaret ölçümü. Varsayılan `null`: hiçbir dış betik yüklenmez.
   * Açmak için: { src: 'https://…/script.js', attributes: { 'data-domain': 'ornek.com' } }
   */
  analytics: null,
})

/** Sitede tanımlı dil kodları: 'tr' | 'en' */
export type Locale = keyof typeof siteConfig.locales

export const locales = Object.keys(siteConfig.locales) as Locale[]
export const defaultLocale: Locale = siteConfig.defaultLocale
