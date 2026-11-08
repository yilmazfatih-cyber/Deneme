/**
 * Nüfus: segmentler ve müşteri üretimi (Kaynak A). Segment kaydırmaları Excel "Fark matrisi"nden; kimlikler yorumlarda.
 * Segment = sosyolojik birim (ADR-002); kişi değil. Paylar TÜİK yaş/gelir dağılımına kaba yaklaşımdır (varsayım).
 */
import type { ParametreAdi, Theta, OnculSeti } from './parametreler';
import { thetaOrnekle } from './parametreler';
import type { Rng } from './rng';

export type YasBandi = '18-24' | '25-34' | '35-44' | '45-54' | '55+';
export type Gelir = 'dusuk' | 'orta' | 'yuksek';
export type Cinsiyet = 'K' | 'E';

export interface Segment {
  id: string;
  ad: string;
  /** nüfus payı (toplamı 1 olacak şekilde normalize edilir) */
  pay: number;
  yas: YasBandi;
  gelir: Gelir;
  cinsiyet: Cinsiyet | 'karma';
  /** medyan/ortalama çarpanları */
  kaydirmalar: Partial<Record<ParametreAdi, number>>;
  /** Excel satır kimlikleri */
  kaynaklar: string[];
  renk: string;
}

export interface Musteri {
  id: string;
  segmentId: string;
  theta: Theta;
  /** A: genel model, B: gerçek müşteri modeli, 'A+B': birleşik (ADR-003) */
  kaynak: 'A' | 'B' | 'A+B';
}

/**
 * Moderatör kaydırmaları (çarpan):
 * - yaş 55+: tek olumsuz yoruma duyarlı, ortalama puanı yok sayar → w_yorum ↑ (WB von Helversen 2018); risk alma ↓ (EK GPS);
 *   sabır ↑, okuma hızı ↓, dikkat eşiği ↓ (RK yaş; 04 §4.3); reklamsız katmana geçme eğilimi (RK Pandora 55+).
 * - genç (18-24): reklama tutum daha olumlu (RK van der Goot), yenilik ↑, sabır ↓, sosyal kanıt ↑ (RK influencer).
 * - düşük gelir: şimdicilik ↑ (TR-015 %32 vs %6), fiyat duyarlılığı ↑ (EK gelir), bütçe ↓.
 * - yüksek gelir: bütçe ↑, fiyat duyarlılığı ↓, kıtlık tepkisi ↓.
 * - kadın: risk alma ↓ (EK GPS, Byrnes), reklamdan kaçınma davranışsal (TR Rojas-Méndez) → tau_reklam_tolerans ~.
 * - eğitim/deneyim artınca yorumun etkisi ↑ (WB Zhu & Zhang), karanlık desene duyarlılık ↓ (WB Luguri).
 */
export const TURKIYE_SEGMENTLERI: Segment[] = [
  {
    id: 'genc_dusuk', ad: 'Genç, düşük gelir (öğrenci / yeni çalışan)', pay: 0.16, yas: '18-24', gelir: 'dusuk', cinsiyet: 'karma',
    kaydirmalar: { beta_simdicilik: 0.93, eta_fiyat: 1.4, butce: 0.45, nu_yenilik: 1.4, sabir: 0.8, w_sosyal_kanit: 1.4, tau_reklam_tolerans: 1.2, dikkat_esigi: 1.1 },
    kaynaklar: ['TR-015', 'RK-van der Goot', 'RK-influencer', 'EK-gelir'], renk: '#f59e0b',
  },
  {
    id: 'genc_profesyonel', ad: 'Genç profesyonel (25-34, orta/yüksek gelir)', pay: 0.18, yas: '25-34', gelir: 'orta', cinsiyet: 'karma',
    kaydirmalar: { nu_yenilik: 1.2, sabir: 0.85, w_yorum: 1.15, butce: 1.1, kappa_secim_yuku: 0.8, tau_reklam_tolerans: 0.9 },
    kaynaklar: ['WB-Zhu&Zhang', 'RK-yaş'], renk: '#3b82f6',
  },
  {
    id: 'ebeveyn_orta', ad: 'Ebeveyn, orta gelir (35-44)', pay: 0.2, yas: '35-44', gelir: 'orta', cinsiyet: 'karma',
    kaydirmalar: { eta_fiyat: 1.15, lambda_kayip: 1.1, butce: 1.2, phi_guven_isareti: 1.2, sabir: 0.9, theta_kitlik: 1.1 },
    kaynaklar: ['WB-kargo eşiği', 'TR-033'], renk: '#10b981',
  },
  {
    id: 'ebeveyn_dusuk', ad: 'Ebeveyn, düşük gelir (35-44)', pay: 0.12, yas: '35-44', gelir: 'dusuk', cinsiyet: 'karma',
    kaydirmalar: { eta_fiyat: 1.5, beta_simdicilik: 0.92, butce: 0.6, lambda_kayip: 1.15, theta_kitlik: 1.2, phi_guven_isareti: 1.1 },
    kaynaklar: ['TR-015', 'EK-gelir', 'WB-Luguri eğitim'], renk: '#ef4444',
  },
  {
    id: 'orta_yas_yuksek', ad: 'Orta yaş, yüksek gelir (45-54)', pay: 0.12, yas: '45-54', gelir: 'yuksek', cinsiyet: 'karma',
    kaydirmalar: { butce: 2.0, eta_fiyat: 0.7, theta_kitlik: 0.7, rho_risk: 1.1, w_yorum: 1.1, kappa_secim_yuku: 1.1, tau_reklam_tolerans: 0.8 },
    kaynaklar: ['EK-gelir', 'WB-von Helversen'], renk: '#8b5cf6',
  },
  {
    id: 'orta_yas_orta', ad: 'Orta yaş, orta gelir (45-54)', pay: 0.1, yas: '45-54', gelir: 'orta', cinsiyet: 'karma',
    kaydirmalar: { butce: 1.1, rho_risk: 1.15, w_yorum: 1.2, okuma_hizi: 0.9, sabir: 1.1, varsayilan_yapiskanlik: 1.1 },
    kaynaklar: ['EK-GPS yaş', 'WB-von Helversen'], renk: '#14b8a6',
  },
  {
    id: 'emekli', ad: '55+ (emekli / emeklilik yakını)', pay: 0.12, yas: '55+', gelir: 'orta', cinsiyet: 'karma',
    kaydirmalar: { rho_risk: 1.3, w_yorum: 1.3, okuma_hizi: 0.75, sabir: 1.3, dikkat_esigi: 0.8, nu_yenilik: 0.6, varsayilan_yapiskanlik: 1.25, tau_reklam_tolerans: 0.9, butce: 0.9 },
    kaynaklar: ['WB-von Helversen 2018', 'EK-GPS yaş', 'RK-Pandora 55+', 'RK-yaş'], renk: '#64748b',
  },
];

export function nufusUret(
  n: number,
  oncul: OnculSeti,
  segmentler: Segment[],
  rng: Rng,
  kaynak: Musteri['kaynak'] = 'A',
): Musteri[] {
  const paylar = segmentler.map((s) => s.pay);
  const musteriler: Musteri[] = [];
  for (let i = 0; i < n; i++) {
    const seg = segmentler[rng.weighted(paylar)];
    if (!seg) throw new Error('segment yok');
    musteriler.push({ id: `m${i}`, segmentId: seg.id, theta: thetaOrnekle(oncul, rng, seg.kaydirmalar), kaynak });
  }
  return musteriler;
}

export function segmentBul(segmentler: Segment[], id: string): Segment {
  const s = segmentler.find((x) => x.id === id);
  if (!s) throw new Error(`segment bulunamadı: ${id}`);
  return s;
}
