/**
 * Uygulamanın kimliği: ad, depolama öneki, renk. Hem derleme (vite.config.ts → PWA bildirimi) hem çalışma zamanı
 * buradan okur. Temeli yeni bir projeye kopyalarken İLK değiştirilecek dosya budur (bkz. havuz.json → yerTutucular).
 *
 * Genişletme: yeni bir sabit gerekiyorsa buraya ekleyin; ortam değişkeni gerektirenler `lib/env.ts` içindedir.
 */
export const APP = {
  /**
   * Depolama öneki: IndexedDB veritabanı ve localStorage anahtar adlarında kullanılır.
   * Aynı alan adında (ör. GitHub Pages) iki uygulama birbirinin verisini görmesin diye BENZERSİZ olmalıdır.
   * Yayına çıktıktan sonra değiştirmeyin: eski veriler eski adla kalır.
   */
  id: 'havuz-uygulama',
  /** Görünen ad (başlık çubuğu, kurulum adı). */
  name: 'Yapıtaşı',
  /** Ana ekran simgesinin altındaki kısa ad (en çok ~12 karakter). */
  shortName: 'Yapıtaşı',
  description: 'Görevler ve listeler: internetsiz de çalışan, cihazlar arasında eşitlenen örnek uygulama.',
  /** Tarayıcı çubuğu ve açılış ekranı renkleri (styles/tokens.css ile uyumlu tutun). */
  themeColor: '#0f5c53',
  backgroundColor: '#f7f5f0',
} as const
