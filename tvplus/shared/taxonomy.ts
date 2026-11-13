/**
 * Sabit sınıflandırma sözlükleri. İçerik dosyaları (content/) bu anahtarları kullanır;
 * sunucu bunları kimlikli GraphQL/Falcor nesnelerine çevirir.
 */

export const GENRES = {
  aksiyon: { genreId: 1365, name: 'Aksiyon' },
  macera: { genreId: 7442, name: 'Macera' },
  animasyon: { genreId: 7424, name: 'Animasyon' },
  'bilim-kurgu': { genreId: 1492, name: 'Bilim Kurgu' },
  fantastik: { genreId: 9744, name: 'Fantastik' },
  komedi: { genreId: 6548, name: 'Komedi' },
  dram: { genreId: 5763, name: 'Dram' },
  gerilim: { genreId: 8933, name: 'Gerilim' },
  korku: { genreId: 8711, name: 'Korku' },
  suc: { genreId: 5824, name: 'Suç' },
  romantik: { genreId: 8883, name: 'Romantik' },
  belgesel: { genreId: 6839, name: 'Belgesel' },
  'doga-bilim': { genreId: 2595, name: 'Doğa ve Bilim' },
  tarih: { genreId: 5349, name: 'Tarih' },
  muzik: { genreId: 1701, name: 'Müzik' },
  spor: { genreId: 4370, name: 'Spor' },
  'cocuk-aile': { genreId: 783, name: 'Çocuk ve Aile' },
  klasik: { genreId: 31574, name: 'Klasikler' },
  'kisa-film': { genreId: 3015, name: 'Kısa Film' },
  yerli: { genreId: 9200, name: 'Yerli Yapımlar' },
  haber: { genreId: 9300, name: 'Haber ve Güncel' },
  yasam: { genreId: 9400, name: 'Yaşam ve Kültür' },
  teknoloji: { genreId: 9500, name: 'Teknoloji' },
  'sessiz-sinema': { genreId: 9600, name: 'Sessiz Sinema' },
} as const
export type GenreKey = keyof typeof GENRES

/** `isMood: true` olanlar duygu etiketi; diğerleri nitelik etiketi (Netflix moodTags ayrımı). */
export const MOODS = {
  duygusal: { id: 100001, displayName: 'Duygusal', isMood: true },
  heyecanli: { id: 100002, displayName: 'Heyecanlı', isMood: true },
  karanlik: { id: 100003, displayName: 'Karanlık', isMood: true },
  eglenceli: { id: 100004, displayName: 'Eğlenceli', isMood: true },
  'ic-isitan': { id: 100005, displayName: 'İç Isıtan', isMood: true },
  gerilimli: { id: 100006, displayName: 'Gerilimli', isMood: true },
  dusundurucu: { id: 100007, displayName: 'Düşündürücü', isMood: true },
  nostaljik: { id: 100008, displayName: 'Nostaljik', isMood: true },
  ilham: { id: 100009, displayName: 'İlham Verici', isMood: true },
  sakin: { id: 100010, displayName: 'Sakin', isMood: true },
  esprili: { id: 100011, displayName: 'Esprili', isMood: true },
  absurt: { id: 100012, displayName: 'Absürt', isMood: true },
  'goz-alici': { id: 100101, displayName: 'Göz Alıcı', isMood: false },
  odullu: { id: 100102, displayName: 'Ödüllü', isMood: false },
  'elestirmen-begenisi': { id: 100103, displayName: 'Eleştirmen Beğenisi', isMood: false },
  'acik-kaynak': { id: 100104, displayName: 'Açık Kaynak Film', isMood: false },
  'kult-klasik': { id: 100105, displayName: 'Kült Klasik', isMood: false },
  'sozsuz': { id: 100106, displayName: 'Sözsüz Anlatım', isMood: false },
  'gercek-hikaye': { id: 100107, displayName: 'Gerçek Hikâye', isMood: false },
  'kisa-ve-oz': { id: 100108, displayName: 'Kısa ve Öz', isMood: false },
  'aile-boyu': { id: 100109, displayName: 'Ailece İzlenir', isMood: false },
  '4k': { id: 100110, displayName: '4K Görüntü', isMood: false },
} as const
export type MoodKey = keyof typeof MOODS

/** RTÜK Akıllı İşaretler. `maturityLevel` Netflix'teki sayısal seviyenin karşılığıdır. */
export const MATURITY = {
  GENEL: { certificationValue: 'Genel İzleyici', maturityLevel: 10, minAge: 0 },
  '7+': { certificationValue: '7+', maturityLevel: 40, minAge: 7 },
  '13+': { certificationValue: '13+', maturityLevel: 80, minAge: 13 },
  '18+': { certificationValue: '18+', maturityLevel: 110, minAge: 18 },
} as const
export type MaturityKey = keyof typeof MATURITY

export const MATURITY_REASONS = {
  'siddet-korku': 'Şiddet ve Korku',
  cinsellik: 'Cinsellik',
  'olumsuz-ornek': 'Olumsuz Örnek Oluşturabilecek Davranışlar',
} as const
export type MaturityReasonKey = keyof typeof MATURITY_REASONS

/** Çocuk profili en çok bu seviyeyi görür. */
export const KIDS_MAX_MATURITY_LEVEL = 40

export const CHANNEL_CATEGORIES = {
  ulusal: 'Ulusal',
  haber: 'Haber',
  spor: 'Spor',
  'film-dizi': 'Film ve Dizi',
  cocuk: 'Çocuk',
  belgesel: 'Belgesel',
  muzik: 'Müzik',
} as const
export type ChannelCategoryKey = keyof typeof CHANNEL_CATEGORIES

/** Oynatma rozetleri (Netflix playbackBadges). */
export const PLAYBACK_BADGES = [
  'VIDEO_SD',
  'VIDEO_HD',
  'VIDEO_ULTRA_HD',
  'AUDIO_STEREO',
  'AUDIO_FIVE_DOT_ONE',
  'TEXT_SUBTITLES',
  'TEXT_CLOSED_CAPTIONS',
  'SOURCE_OWN_CDN',
  'SOURCE_YOUTUBE',
  'SOURCE_PROGRESSIVE',
  'LIVE',
] as const
export type PlaybackBadge = (typeof PLAYBACK_BADGES)[number]

/** Paket/eklenti ürünleri (yetki modeli örneği). */
export const PRODUCTS = {
  'tvplus-temel': { name: 'TV+ Temel' },
  'sinema-paketi': { name: 'Sinema Paketi' },
} as const
export type ProductKey = keyof typeof PRODUCTS
