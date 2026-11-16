/**
 * Türkçe arayüz sözlüğü. Ziyaretçinin gördüğü bütün ARAYÜZ metinleri (düğme, etiket, hata iletisi…) burada durur;
 * bileşenlere Türkçe metin gömülmez. Sayfa içerikleri (yazılar, ana sayfa metinleri) src/content/ altındadır.
 * Kim kullanır: src/i18n/index.ts → `useTranslations(locale)`; Markdown eklentileri ve testler (saf modül).
 * Genişletme: yeni bir metin gerektiğinde buraya ekleyin, ardından AYNI anahtarı diğer dillerin sözlüğüne
 * (en.ts) de ekleyin; eksik anahtar `npm run check` sırasında tür hatası verir. `{ad}` yer tutucudur.
 */
export const tr = {
  a11y: {
    skipToContent: 'İçeriğe geç',
    mainNav: 'Ana menü',
    footerNav: 'Alt bilgi bağlantıları',
    legalNav: 'Yasal bağlantılar',
    breadcrumbs: 'Sayfa yolu',
    pagination: 'Sayfalar',
    social: 'Sosyal hesaplar',
    homeLink: '{site} ana sayfası',
  },
  header: {
    openMenu: 'Menüyü aç',
    closeMenu: 'Menüyü kapat',
    search: 'Ara',
  },
  theme: {
    label: 'Tema',
    light: 'Açık',
    dark: 'Koyu',
    system: 'Sistem',
  },
  language: {
    label: 'Dil',
  },
  search: {
    title: 'Sitede ara',
    placeholder: 'Ne aramıştınız?',
    hint: 'Aramak için en az iki harf yazın.',
    loading: 'Aranıyor…',
    noResults: '“{query}” için sonuç bulunamadı.',
    resultsOne: '1 sonuç bulundu.',
    resultsMany: '{count} sonuç bulundu.',
    unavailable: 'Arama dizini yalnız derlenmiş sitede çalışır. Denemek için: npm run build, sonra npm run preview.',
    close: 'Aramayı kapat',
  },
  home: {
    sections: {
      features: 'ozellikler',
      steps: 'nasil-calisir',
      testimonials: 'referanslar',
      pricing: 'fiyatlar',
      faq: 'sss',
    },
    popularPlan: 'En çok tercih edilen',
    mockupLabel: 'Örnek ekran: bugünün randevu listesi',
  },
  blog: {
    title: 'Blog',
    description:
      'Küçük işletmeler için web sitesi, görünürlük ve müşteri iletişimi üzerine uygulanabilir, kısa yazılar.',
    readingTime: '{minutes} dk okuma',
    updated: 'Güncellendi: {date}',
    tagsLabel: 'Etiketler',
    tagTitle: '“{tag}” etiketli yazılar',
    tagDescription: '“{tag}” etiketiyle yayınlanmış bütün blog yazılarımız tek sayfada: {count} yazı, en yeniden eskiye sıralı.',
    allPosts: 'Tüm yazılar',
    related: 'İlgili yazılar',
    pageTitle: 'Blog — Sayfa {page}',
    readPost: 'Yazıyı oku',
    author: 'Yazan',
    feedTitle: '{site} Blog',
  },
  docs: {
    title: 'Belgeler',
    description:
      'Bu site temelinin kullanım kılavuzu: içerik ekleme, menü ve renkleri değiştirme, formu bağlama ve yayınlama.',
    menu: 'Belgeler menüsü',
    onThisPage: 'Bu sayfada',
    previous: 'Önceki',
    next: 'Sonraki',
    pager: 'Önceki ve sonraki belge',
    startHere: 'Buradan başlayın',
  },
  pagination: {
    previous: 'Önceki',
    next: 'Sonraki',
    page: 'Sayfa {page}',
  },
  contact: {
    title: 'İletişim',
    description:
      'Sorunuzu, önerinizi ya da deneme talebinizi yazın; genellikle bir iş günü içinde yanıtlıyoruz. Dilerseniz doğrudan e-posta gönderin.',
    lead: 'Sorunuzu yazın; genellikle bir iş günü içinde yanıtlıyoruz.',
    infoTitle: 'Bize ulaşın',
    email: 'E-posta',
    phone: 'Telefon',
    address: 'Adres',
    form: {
      title: 'İleti gönderin',
      name: 'Adınız',
      email: 'E-posta adresiniz',
      message: 'İletiniz',
      messageHint: 'Ne kadar ayrıntı verirseniz o kadar iyi yardımcı oluruz.',
      trap: 'Bu alanı boş bırakın',
      submit: 'Gönder',
      sending: 'Gönderiliyor…',
      success: 'Teşekkürler, iletiniz bize ulaştı. En kısa sürede yanıtlayacağız.',
      failure: 'İleti gönderilemedi. Lütfen yeniden deneyin ya da doğrudan e-posta yazın: {email}',
      mailto: 'E-posta uygulamanız açıldı; iletiyi oradan gönderebilirsiniz. Açılmadıysa bize yazın: {email}',
      tooFast: 'Form çok hızlı gönderildi. Lütfen birkaç saniye sonra yeniden deneyin.',
      summary: 'Lütfen işaretli alanları düzeltin.',
      required: 'Bu alanı doldurun.',
      invalidEmail: 'Geçerli bir e-posta adresi yazın (ornek@alan.com).',
      tooShort: 'En az {min} karakter yazın.',
      tooLong: 'En fazla {max} karakter yazabilirsiniz.',
      mailSubject: '{site} iletişim formu: {name}',
    },
  },
  newsletter: {
    title: 'Yeni yazılardan haberdar olun',
    description: 'Ayda bir e-posta. İstediğiniz an tek tıkla ayrılırsınız.',
    email: 'E-posta adresiniz',
    submit: 'Abone ol',
    sending: 'Kaydediliyor…',
    success: 'Kaydınız alındı, teşekkürler.',
    failure: 'Kayıt yapılamadı. Lütfen biraz sonra yeniden deneyin.',
    invalidEmail: 'Geçerli bir e-posta adresi yazın.',
  },
  notFound: {
    title: 'Sayfa bulunamadı',
    description: 'Aradığınız sayfa taşınmış ya da hiç var olmamış olabilir. Ana sayfadan devam edebilirsiniz.',
    home: 'Ana sayfaya dön',
    blog: 'Blog yazılarına göz atın',
  },
  footer: {
    rights: 'Tüm hakları saklıdır.',
  },
  callout: {
    note: 'Not',
    tip: 'İpucu',
    important: 'Önemli',
    warning: 'Dikkat',
    caution: 'Tehlike',
  },
  code: {
    copy: 'Kopyala',
    copied: 'Kopyalandı',
  },
  table: {
    label: 'Tablo',
  },
  footnotes: {
    label: 'Dipnotlar',
    back: 'Metne dön',
  },
  legal: {
    templateTitle: 'Bu metin bir şablondur',
    templateNotice:
      'Bu sayfa örnek bir şablondur; hukuki danışmanlık değildir. Yayınlamadan önce kendi işleyişinize göre düzenleyin ve bir hukukçuya inceletin.',
    lastUpdated: 'Son güncelleme: {date}',
  },
  announcement: {
    label: 'Duyuru',
    dismiss: 'Duyuruyu kapat',
  },
}

/** Bütün dillerin sözlükleri bu biçime uymak zorundadır. */
export type Dictionary = typeof tr
