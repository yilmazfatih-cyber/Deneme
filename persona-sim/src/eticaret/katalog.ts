/**
 * E-ticaret ortamının girdileri: site varyantı (A/B kolları) ve ürün kataloğu.
 * Fiyatlar 2026 Türkiye e-ticaret raf fiyatlarına kaba yaklaşımdır (varsayım, TL, KDV dahil).
 */

export type Kategori = 'elektronik' | 'giyim' | 'ev' | 'kozmetik' | 'gida';
export const KATEGORILER: readonly Kategori[] = ['elektronik', 'giyim', 'ev', 'kozmetik', 'gida'];

export interface SiteVaryanti {
  ad: string;
  /** liste sayfasındaki seçenek sayısı */
  urunSayisiListe: number;
  /** her sayfa geçişinde beklenen yükleme süresi (sn) */
  yuklemeSuresiSn: number;
  puanGoster: boolean;
  yorumSayisiGoster: boolean;
  guvenRozeti: boolean;
  kitlikMesaji: boolean;
  kargoUcretiTL: number;
  /** 0 = eşik yok (kargo her siparişte ücretli) */
  ucretsizKargoEsigiTL: number;
  /** kargo ücretinin ilk görüldüğü yer; geç görünen ücret sürprizdir (WB Blake 2021) */
  kargoUcretiNeredeGorunur: 'urun' | 'sepet' | 'odeme';
  /** ödeme adımında ön seçili ek hizmet (varsayılan etkisi, Jachimowicz 2019) */
  onSecimliEkHizmet?: { ad: string; ucretTL: number };
  taksitSecenegi: boolean;
  /** 0–1 */
  indirimOrani: number;
  indirimCercevesi: 'yuzde' | 'tl';
}

/** A kolu: kargo ücreti ödemede ortaya çıkar, eşik yok, rozet yok. */
export const VARSAYILAN_VARYANT: SiteVaryanti = {
  ad: 'A — mevcut site',
  urunSayisiListe: 24,
  yuklemeSuresiSn: 2.5,
  puanGoster: true,
  yorumSayisiGoster: true,
  guvenRozeti: false,
  kitlikMesaji: false,
  kargoUcretiTL: 49.9,
  ucretsizKargoEsigiTL: 0,
  kargoUcretiNeredeGorunur: 'odeme',
  onSecimliEkHizmet: { ad: 'Hasar güvencesi', ucretTL: 39.9 },
  taksitSecenegi: true,
  indirimOrani: 0.1,
  indirimCercevesi: 'yuzde',
};

/** B kolu: "250 TL üzeri kargo bedava" eşiği, güven rozeti, kargo ücreti ürün sayfasında açık (05 §4.2). */
export const VARYANT_B: SiteVaryanti = {
  ...VARSAYILAN_VARYANT,
  ad: 'B — eşik + rozet + şeffaf kargo',
  guvenRozeti: true,
  ucretsizKargoEsigiTL: 250,
  kargoUcretiNeredeGorunur: 'urun',
};

export interface Urun {
  id: string;
  ad: string;
  kategori: Kategori;
  /** satış fiyatı (TL, indirim öncesi) */
  fiyat: number;
  /** üstü çizili / piyasa fiyatı */
  referansFiyat?: number;
  /** 1–5 */
  puan: number;
  yorumSayisi: number;
  /** 0–1 */
  populerlik: number;
  yeni?: boolean;
}

export const KATALOG: Urun[] = [
  { id: 'e1', ad: 'Kablosuz kulaklık', kategori: 'elektronik', fiyat: 1299, referansFiyat: 1599, puan: 4.4, yorumSayisi: 8200, populerlik: 0.85 },
  { id: 'e2', ad: 'Akıllı saat', kategori: 'elektronik', fiyat: 3499, puan: 4.2, yorumSayisi: 2100, populerlik: 0.6 },
  { id: 'e3', ad: 'Powerbank 20.000 mAh', kategori: 'elektronik', fiyat: 749, puan: 4.5, yorumSayisi: 5400, populerlik: 0.7 },
  { id: 'e4', ad: 'Telefon kılıfı', kategori: 'elektronik', fiyat: 199, puan: 4.1, yorumSayisi: 12000, populerlik: 0.75 },
  { id: 'e5', ad: 'Bluetooth hoparlör', kategori: 'elektronik', fiyat: 1099, puan: 4.3, yorumSayisi: 950, populerlik: 0.45, yeni: true },
  { id: 'g1', ad: 'Basic tişört', kategori: 'giyim', fiyat: 249, puan: 4.3, yorumSayisi: 15000, populerlik: 0.9 },
  { id: 'g2', ad: 'Kot pantolon', kategori: 'giyim', fiyat: 899, referansFiyat: 1199, puan: 4.2, yorumSayisi: 6100, populerlik: 0.7 },
  { id: 'g3', ad: 'Spor ayakkabı', kategori: 'giyim', fiyat: 2199, puan: 4.6, yorumSayisi: 3300, populerlik: 0.65 },
  { id: 'g4', ad: 'Şişme mont', kategori: 'giyim', fiyat: 2999, referansFiyat: 3999, puan: 4.1, yorumSayisi: 1200, populerlik: 0.5 },
  { id: 'v1', ad: 'Filtre kahve makinesi', kategori: 'ev', fiyat: 2499, puan: 4.4, yorumSayisi: 1800, populerlik: 0.5 },
  { id: 'v2', ad: 'Nevresim takımı', kategori: 'ev', fiyat: 799, puan: 4.3, yorumSayisi: 2600, populerlik: 0.55 },
  { id: 'v3', ad: 'Havlu seti', kategori: 'ev', fiyat: 449, puan: 4.5, yorumSayisi: 3900, populerlik: 0.6 },
  { id: 'k1', ad: 'Nemlendirici krem', kategori: 'kozmetik', fiyat: 329, puan: 4.6, yorumSayisi: 9800, populerlik: 0.8 },
  { id: 'k2', ad: 'Parfüm 100 ml', kategori: 'kozmetik', fiyat: 1499, referansFiyat: 1899, puan: 4.4, yorumSayisi: 4100, populerlik: 0.6 },
  { id: 'k3', ad: 'Şampuan', kategori: 'kozmetik', fiyat: 149, puan: 4.2, yorumSayisi: 7200, populerlik: 0.7 },
  { id: 'f1', ad: 'Türk kahvesi 250 g', kategori: 'gida', fiyat: 189, puan: 4.7, yorumSayisi: 11000, populerlik: 0.85 },
  { id: 'f2', ad: 'Zeytinyağı 1 L', kategori: 'gida', fiyat: 449, puan: 4.5, yorumSayisi: 5200, populerlik: 0.65 },
  { id: 'f3', ad: 'Karışık kuruyemiş 500 g', kategori: 'gida', fiyat: 279, puan: 4.3, yorumSayisi: 3100, populerlik: 0.55, yeni: true },
];
