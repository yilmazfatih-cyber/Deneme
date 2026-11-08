/**
 * Parametre vektörü θ ve literatür öncülleri (Kaynak A: S0 Dünya, S1 Türkiye).
 * Sayıların kaynağı: persona-katmani/data/davranis-etkileri.xlsx — satır kimlikleri yorumlarda (EK-, RK-, WB-, TR-).
 * Tanımlar: persona-katmani/docs/mimari/07-dijital-ikiz-istatistik.md §2.
 * Tüm dağılım parametreleri "varsayım" statüsündedir; kalibrasyon döngüsü (03) günceller.
 */
import { Rng, clamp } from './rng';

export const PARAMETRE_ADLARI = [
  'lambda_kayip', // kayıptan kaçınma λ (>1 kayıp ağır basar)                 EK: Brown 2024 λ=1.96, Walasek 2024 λ=1.31
  'beta_simdicilik', // şimdicilik β (1 = yok)                                 EK: β=0.82 (0.74–0.90) para ödüllerinde
  'delta_iskonto', // yıllık iskonto faktörü δ                                 EK: düzeltilmiş yıllık oran ~0.33 → δ≈0.75
  'rho_risk', // göreli riskten kaçınma (CRRA)                                 EK: GPS cinsiyet/yaş farkları
  'w_sosyal_kanit', // popülerlik / "herkes alıyor" ağırlığı                    WB: hacim esnekliği 0.236
  'tau_reklam_tolerans', // reklama tahammül (1 = ortalama)                     RK: ad load esnekliği −0.07, kaçınma öncülleri
  'eta_fiyat', // fiyat duyarlılığı (esneklik büyüklüğü)                        WB: sol basamak θ≈0.2, kargo ücreti; TR: taksit, enflasyon
  'w_yorum', // yorum puanı/hacmi ağırlığı                                      WB: puan esnekliği 0.417 (You 2015)
  'kappa_secim_yuku', // seçenek sayısı arttıkça terk eğilimi                   WB: ortalama ≈0, moderatörlerle çıkar
  'theta_kitlik', // kıtlık/aciliyet mesajına tepki (negatif = ters tepme)      WB: çevrimiçi aciliyet etkisiz, ters tepme riski
  'phi_guven_isareti', // güven rozeti / bilinen platform ağırlığı              WB: Özpolat & Jank; TR-045 %69 güvenilir platformu tercih
  'sabir', // terk etmeden önce tahammül edilen süre (saniye, web referansı)     WB: yükleme hızı ve dönüşüm; 04 §6
  'dikkat_esigi', // bir uyaranı fark etme olasılığı (0–1)                       RK: banner körlüğü, ilk 2–3 saniye
  'varsayilan_yapiskanlik', // ön seçili seçenekte kalma eğilimi (d birimi)      EK/WB: Jachimowicz 2019 d=0.68
  'tau_karar', // karar gürültüsü (softmax sıcaklığı)                            07 §2 ek parametre
  'nu_yenilik', // yeni ürün/marka deneme eğilimi (0–1)                           07 §2 ek parametre
  'okuma_hizi', // kelime/dakika                                                 07 §2 ek parametre
  'hayal_kirikligi_esigi', // terk öncesi tahammül edilen sürtünme olayı sayısı  07 §2 ek parametre
  'butce', // alışveriş başına bütçe (TL)                                       TR: sepet tutarı dağılımı; S3/B verisiyle değişir
  'gorus_kaybi', // düşük belirginlikli uyaranı kaçırma eğilimi (0–1); insan algı kusuru (ADR-008). KALİBRE EDİLMEMİŞ VARSAYIM.
] as const;

export type ParametreAdi = (typeof PARAMETRE_ADLARI)[number];
export type Theta = Record<ParametreAdi, number>;

export interface Dagilim {
  tip: 'lognormal' | 'normal' | 'sabit';
  /** lognormal: medyan; normal: ortalama; sabit: değer */
  merkez: number;
  /** lognormal: log-sd; normal: sd */
  yayilim: number;
  min?: number;
  max?: number;
}

export type Seviye = 'S0' | 'S1' | 'S2' | 'S3';

export interface OnculSeti {
  seviye: Seviye;
  ad: string;
  /** Excel satır kimlikleri */
  kaynaklar: string[];
  parametreler: Record<ParametreAdi, Dagilim>;
}

const ln = (merkez: number, yayilim: number, min?: number, max?: number): Dagilim => {
  const d: Dagilim = { tip: 'lognormal', merkez, yayilim };
  if (min !== undefined) d.min = min;
  if (max !== undefined) d.max = max;
  return d;
};
const nm = (merkez: number, yayilim: number, min?: number, max?: number): Dagilim => {
  const d: Dagilim = { tip: 'normal', merkez, yayilim };
  if (min !== undefined) d.min = min;
  if (max !== undefined) d.max = max;
  return d;
};

/** S0 · Dünya öncülleri (literatür). */
export const S0_DUNYA: OnculSeti = {
  seviye: 'S0',
  ad: 'Dünya (literatür)',
  kaynaklar: ['EK-001..061', 'RK-001..062', 'WB-001..053'],
  parametreler: {
    lambda_kayip: ln(1.5, 0.3, 1.0, 4.0),
    beta_simdicilik: nm(0.82, 0.08, 0.4, 1.0),
    delta_iskonto: nm(0.75, 0.1, 0.3, 0.99),
    rho_risk: ln(0.7, 0.4, 0.05, 4.0),
    w_sosyal_kanit: ln(0.3, 0.5, 0, 2),
    tau_reklam_tolerans: ln(1.0, 0.5, 0.1, 5),
    eta_fiyat: ln(1.2, 0.4, 0.2, 5),
    w_yorum: ln(0.42, 0.4, 0, 2),
    kappa_secim_yuku: ln(0.1, 0.6, 0, 1),
    theta_kitlik: nm(0.1, 0.15, -0.4, 0.6),
    phi_guven_isareti: ln(0.3, 0.5, 0, 2),
    sabir: ln(90, 0.5, 10, 900),
    dikkat_esigi: nm(0.3, 0.1, 0.05, 0.8),
    varsayilan_yapiskanlik: nm(0.68, 0.2, 0, 1.5),
    tau_karar: ln(1.0, 0.3, 0.3, 3),
    nu_yenilik: nm(0.3, 0.15, 0, 1),
    okuma_hizi: ln(200, 0.2, 80, 450),
    hayal_kirikligi_esigi: ln(3, 0.4, 1, 10),
    butce: ln(800, 0.7, 50, 20000),
    gorus_kaybi: nm(0.25, 0.1, 0, 0.8),
  },
};

/**
 * S1 · Türkiye kaydırmaları (S0 medyanına çarpan veya S0 ortalamasına toplam).
 * TR-001 sabır −0.05 SD · TR-006 genelleşmiş güven ~%14 · TR-010 belirsizlikten kaçınma 85 · TR-013 yüksek UAI → daha hiperbolik
 * iskonto · TR-017 hanehalkı enflasyon beklentisi · TR-033 taksit payı %35–38 · TR-045 %69 güvenilir platformu %10 pahalıya tercih.
 */
export interface Kaydirma {
  carpan?: number; // lognormal medyanına
  toplam?: number; // normal ortalamasına
  kaynak: string;
}

export const S1_TURKIYE: { ad: string; kaydirmalar: Partial<Record<ParametreAdi, Kaydirma>> } = {
  ad: 'Türkiye',
  kaydirmalar: {
    beta_simdicilik: { toplam: -0.04, kaynak: 'TR-013, TR-015' },
    sabir: { carpan: 0.95, kaynak: 'TR-001' },
    phi_guven_isareti: { carpan: 1.5, kaynak: 'TR-006, TR-010, TR-045' },
    eta_fiyat: { carpan: 1.15, kaynak: 'TR-017, TR-033' },
    rho_risk: { carpan: 1.1, kaynak: 'TR-010' },
    w_sosyal_kanit: { carpan: 1.1, kaynak: 'TR-002 (karşılıklılık, geçici eşleme)' },
    butce: { carpan: 1.0, kaynak: 'S3/B verisi gelene kadar S0' },
  },
};

export function kaydirmaUygula(
  taban: OnculSeti,
  kaydirmalar: Partial<Record<ParametreAdi, Kaydirma>>,
  seviye: Seviye,
  ad: string,
): OnculSeti {
  const parametreler = { ...taban.parametreler };
  const kaynaklar = [...taban.kaynaklar];
  for (const adi of PARAMETRE_ADLARI) {
    const k = kaydirmalar[adi];
    if (!k) continue;
    const d = { ...parametreler[adi] };
    if (d.tip === 'lognormal' && k.carpan !== undefined) d.merkez *= k.carpan;
    if (d.tip === 'normal' && k.toplam !== undefined) d.merkez += k.toplam;
    if (d.tip === 'normal' && k.carpan !== undefined) d.merkez *= k.carpan;
    if (d.tip === 'lognormal' && k.toplam !== undefined) d.merkez += k.toplam;
    parametreler[adi] = d;
    kaynaklar.push(k.kaynak);
  }
  return { seviye, ad, kaynaklar, parametreler };
}

export function onculSec(seviye: 'S0' | 'S1'): OnculSeti {
  return seviye === 'S0' ? S0_DUNYA : kaydirmaUygula(S0_DUNYA, S1_TURKIYE.kaydirmalar, 'S1', 'Türkiye');
}

export function dagilimOrnekle(d: Dagilim, rng: Rng): number {
  let x: number;
  if (d.tip === 'sabit') x = d.merkez;
  else if (d.tip === 'lognormal') x = rng.lognormal(Math.log(d.merkez), d.yayilim);
  else x = rng.normal(d.merkez, d.yayilim);
  return clamp(x, d.min ?? -Infinity, d.max ?? Infinity);
}

/**
 * Bir θ örnekle. `carpanlar` segment kaydırmalarıdır (medyan/ortalama çarpanı), 02 §7 moderatör regresyonunun basit hâli.
 */
export function thetaOrnekle(oncul: OnculSeti, rng: Rng, carpanlar: Partial<Record<ParametreAdi, number>> = {}): Theta {
  const theta = {} as Theta;
  for (const adi of PARAMETRE_ADLARI) {
    const d = { ...oncul.parametreler[adi] };
    const c = carpanlar[adi];
    if (c !== undefined) d.merkez *= c;
    theta[adi] = dagilimOrnekle(d, rng);
  }
  return theta;
}

export function thetaMedyan(oncul: OnculSeti): Theta {
  const theta = {} as Theta;
  for (const adi of PARAMETRE_ADLARI) {
    const d = oncul.parametreler[adi];
    theta[adi] = clamp(d.merkez, d.min ?? -Infinity, d.max ?? Infinity);
  }
  return theta;
}
