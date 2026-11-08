/**
 * Mağaza düzeni: ızgara (hücre ≈ 1 m), raflar, promosyon adası, kasalar ve kamera bölgeleri.
 * Fiyatlar 2026 sonu Türk market rafı için kaba yaklaşımdır (varsayım, TL).
 */

export interface Nokta {
  x: number;
  y: number;
}

export interface Urun {
  id: string;
  ad: string;
  kategori: string;
  /** raf fiyatı (TL) */
  fiyat: number;
  /** müşterinin aklındaki fiyat (TL) */
  referansFiyat?: number;
  /** 0–1 */
  indirimOrani?: number;
  /** 0–1 */
  populerlik?: number;
  kitlikMesaji?: boolean;
  /** yeni ürün / bilinmeyen marka */
  yeni?: boolean;
  /** 0–1: rafta göz hizası, cephe genişliği, etiket */
  rafBelirginligi: number;
}

export interface Raf {
  id: string;
  kategori: string;
  x: number;
  y: number;
  w: number;
  h: number;
  urunler: Urun[];
}

export interface Promosyon {
  id: string;
  ad: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0–1; ada raftan daha belirgindir */
  belirginlik: number;
  /** kampanya yokken adada duran ürünler */
  urunIdleri: string[];
}

/** Kamera bölgesi (toplu sayım; kimlik yok). */
export interface Bolge {
  id: string;
  ad: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MagazaDuzeni {
  /** hücre birimi */
  genislik: number;
  yukseklik: number;
  giris: Nokta;
  /** ayrı çıkış kapısı; yoksa giriş kullanılır */
  cikis?: Nokta;
  /** kasa tezgâhı (1×2 hücre: y-1..y); müşteri tezgâhın solunda ödeme yapar, kuyruk yukarı uzar */
  kasalar: Nokta[];
  raflar: Raf[];
  promosyonAlanlari: Promosyon[];
  bolgeler: Bolge[];
}

export const KATEGORILER = ['gida', 'temizlik', 'kisisel_bakim', 'atistirmalik', 'icecek', 'ev'] as const;
export type Kategori = (typeof KATEGORILER)[number];

export const KATEGORI_ADLARI: Record<string, string> = {
  gida: 'Gıda',
  temizlik: 'Temizlik',
  kisisel_bakim: 'Kişisel bakım',
  atistirmalik: 'Atıştırmalık',
  icecek: 'İçecek',
  ev: 'Ev',
};

/** Raf renkleri (koyu zemin üstünde açık ton). */
export const KATEGORI_RENKLERI: Record<string, string> = {
  gida: '#bbf7d0',
  temizlik: '#bae6fd',
  kisisel_bakim: '#fbcfe8',
  atistirmalik: '#fde68a',
  icecek: '#c7d2fe',
  ev: '#e7e5e4',
};

/** Kategoriye temel ilgi (müşteri düzeyinde rastgele çarpanla); varsayım: market sepeti gıda ağırlıklı. */
export const KATEGORI_TEMEL_ILGI: Record<string, number> = {
  gida: 0.9,
  icecek: 0.7,
  atistirmalik: 0.55,
  temizlik: 0.55,
  kisisel_bakim: 0.45,
  ev: 0.35,
};

const u = (
  id: string,
  ad: string,
  kategori: Kategori,
  fiyat: number,
  rafBelirginligi: number,
  ek: Partial<Omit<Urun, 'id' | 'ad' | 'kategori' | 'fiyat' | 'rafBelirginligi'>> = {},
): Urun => ({ id, ad, kategori, fiyat, rafBelirginligi, ...ek });

const raf = (id: string, kategori: Kategori, x: number, urunler: Urun[]): Raf => ({ id, kategori, x, y: 3, w: 2, h: 11, urunler });

/**
 * 40×26 hücrelik küçük market. Giriş sol altta, çıkış sağ altta; 3 koridor × 2 raf (dikey), ara koridorda promosyon adası,
 * altta 2 kasa. Bölgeler kamera görüş alanlarıdır; ara koridorun bir kısmı hiçbir kameraya düşmez (gerçekçi).
 */
export const VARSAYILAN_DUZEN: MagazaDuzeni = {
  genislik: 40,
  yukseklik: 26,
  giris: { x: 2, y: 25 },
  cikis: { x: 38, y: 25 },
  kasalar: [
    { x: 34, y: 22 },
    { x: 29, y: 22 },
  ],
  raflar: [
    raf('A1', 'gida', 2, [
      u('g1', 'Ayçiçek yağı 5 L', 'gida', 420, 0.7, { referansFiyat: 440, populerlik: 0.8 }),
      u('g2', 'Baldo pirinç 2 kg', 'gida', 180, 0.5, { populerlik: 0.6 }),
      u('g3', 'Beyaz peynir 1 kg', 'gida', 320, 0.6, { populerlik: 0.7 }),
      u('g4', 'Makarna 500 g', 'gida', 28, 0.5, { populerlik: 0.9 }),
    ]),
    raf('A2', 'temizlik', 6, [
      u('t1', 'Çamaşır deterjanı 6 kg', 'temizlik', 480, 0.7, { referansFiyat: 520, populerlik: 0.7 }),
      u('t2', 'Bulaşık deterjanı 1,5 L', 'temizlik', 120, 0.5, { populerlik: 0.6 }),
      u('t3', 'Yüzey temizleyici 2,5 L', 'temizlik', 95, 0.4),
      u('t4', 'Çamaşır suyu 3,5 L', 'temizlik', 75, 0.4, { populerlik: 0.5 }),
    ]),
    raf('B1', 'kisisel_bakim', 10, [
      u('k1', 'Şampuan 500 ml', 'kisisel_bakim', 140, 0.6, { populerlik: 0.6 }),
      u('k2', 'Diş macunu 100 ml', 'kisisel_bakim', 85, 0.5, { populerlik: 0.7 }),
      u('k3', 'Duş jeli 500 ml', 'kisisel_bakim', 110, 0.4),
      u('k4', 'Organik yüz kremi', 'kisisel_bakim', 260, 0.6, { yeni: true }),
    ]),
    raf('B2', 'atistirmalik', 14, [
      u('a1', 'Patates cipsi 150 g', 'atistirmalik', 55, 0.7, { populerlik: 0.8 }),
      u('a2', 'Sütlü çikolata 80 g', 'atistirmalik', 40, 0.7, { populerlik: 0.8 }),
      u('a3', 'Bisküvi 3’lü', 'atistirmalik', 45, 0.5),
      u('a4', 'Protein bar', 'atistirmalik', 70, 0.5, { yeni: true }),
    ]),
    raf('C1', 'icecek', 18, [
      u('i1', 'Kola 2,5 L', 'icecek', 75, 0.7, { populerlik: 0.8 }),
      u('i2', 'Ayran 1 L', 'icecek', 45, 0.5, { populerlik: 0.7 }),
      u('i3', 'Maden suyu 6’lı', 'icecek', 60, 0.5, { populerlik: 0.6 }),
      u('i4', 'Soğuk kahve 250 ml', 'icecek', 65, 0.6, { yeni: true }),
    ]),
    raf('C2', 'ev', 22, [
      u('e1', 'Tuvalet kağıdı 32’li', 'ev', 330, 0.6, { referansFiyat: 360, populerlik: 0.7 }),
      u('e2', 'Kağıt havlu 8’li', 'ev', 150, 0.5, { populerlik: 0.6 }),
      u('e3', 'Çöp torbası 20’li', 'ev', 60, 0.4),
    ]),
  ],
  promosyonAlanlari: [
    { id: 'P1', ad: 'Promosyon adası', x: 16, y: 16, w: 4, h: 2, belirginlik: 0.6, urunIdleri: ['e2', 'a3', 'i3'] },
  ],
  bolgeler: [
    { id: 'giris', ad: 'Giriş', x: 0, y: 19, w: 9, h: 7 },
    { id: 'koridor_a', ad: 'Koridor A', x: 0, y: 2, w: 9, h: 12 },
    { id: 'koridor_b', ad: 'Koridor B', x: 9, y: 2, w: 8, h: 12 },
    { id: 'koridor_c', ad: 'Koridor C', x: 17, y: 2, w: 9, h: 12 },
    { id: 'promosyon', ad: 'Promosyon', x: 13, y: 14, w: 9, h: 5 },
    { id: 'kasa_onu', ad: 'Kasa önü', x: 22, y: 14, w: 18, h: 12 },
  ],
};
