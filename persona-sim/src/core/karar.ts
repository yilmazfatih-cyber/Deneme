/**
 * Karar ilkelleri — 07 §4.1 ölçüm modelinin simülasyon tarafı. Tüm ortamlar (mağaza, e-ticaret, reklam) bunları kullanır;
 * böylece aynı θ her yerde aynı anlama gelir. Sayısal sabitler varsayım; 03 kalibre eder.
 */
import type { Theta } from './parametreler';
import { clamp } from './rng';

export interface Teklif {
  fiyat: number;
  /** kişinin aklındaki referans fiyat (yoksa fiyat) */
  referansFiyat?: number;
  /** 0–1 */
  indirimOrani?: number;
  /** 1–5 */
  puan?: number;
  yorumSayisi?: number;
  /** 0–1, "çok satan" / popülerlik */
  populerlik?: number;
  kitlikMesaji?: boolean;
  guvenIsareti?: boolean;
  /** ödeme adımında görünen ek ücret (kargo vb.) */
  ekUcret?: number;
  taksit?: boolean;
  /** bilinmeyen marka / ilk kez görülen ürün */
  yeni?: boolean;
  /** kişinin bu kategoriye temel ilgisi, 0–1 */
  ilgi?: number;
}

/** Fiyatın bütçeye oranından fayda cezası; −η·ln(p/b) biçimi 07 §4.1 */
export function fiyatTerimi(theta: Theta, fiyat: number): number {
  const oran = Math.max(1e-6, fiyat / Math.max(1, theta.butce));
  return -theta.eta_fiyat * Math.log(oran);
}

/** Bir teklifin fayda puanı (ölçek: logit birimi). */
export function fayda(theta: Theta, t: Teklif): number {
  let u = 0;
  u += 2.5 * (t.ilgi ?? 0.5) - 1.25; // temel ilgi, nötr 0
  u += fiyatTerimi(theta, t.fiyat);
  // referans fiyata göre kazanç/kayıp (λ: kayıp ağır basar)
  if (t.referansFiyat !== undefined && t.referansFiyat > 0) {
    const fark = (t.referansFiyat - t.fiyat) / t.referansFiyat; // + = kazanç
    u += fark >= 0 ? 1.0 * fark : theta.lambda_kayip * 1.0 * fark;
  }
  if (t.indirimOrani) u += 1.5 * t.indirimOrani; // indirim çerçevesi (WB fiyat sunumu)
  if (t.puan !== undefined) u += theta.w_yorum * (t.puan - 3.5); // 3.5 nötr
  if (t.yorumSayisi !== undefined) u += theta.w_yorum * 0.3 * Math.log1p(t.yorumSayisi) / Math.log(101); // hacim, doygun
  if (t.populerlik !== undefined) u += theta.w_sosyal_kanit * (t.populerlik - 0.5) * 2;
  if (t.kitlikMesaji) u += theta.theta_kitlik;
  if (t.guvenIsareti) u += theta.phi_guven_isareti * 0.5;
  if (t.ekUcret && t.ekUcret > 0) u -= theta.lambda_kayip * theta.eta_fiyat * (t.ekUcret / Math.max(1, t.fiyat)) * 2; // ek ücret ihmali/sürprizi (WB Blake 2021)
  if (t.taksit) u += (1 - theta.beta_simdicilik) * 2; // şimdicilik yüksekse taksit cazip (TR-033)
  if (t.yeni) u += (theta.nu_yenilik - 0.5) - theta.rho_risk * 0.3;
  return u;
}

export function lojistik(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Satın alma olasılığı: fayda / karar gürültüsü */
export function satinAlmaOlasiligi(theta: Theta, t: Teklif): number {
  return clamp(lojistik(fayda(theta, t) / theta.tau_karar), 0, 1);
}

/** Birden çok seçenek arasında softmax; `secenekSayisi` seçim yükü cezası uygular (WB Chernev moderatörleri). */
export function secimOlasiliklari(theta: Theta, teklifler: Teklif[]): number[] {
  const u = teklifler.map((t) => fayda(theta, t) / theta.tau_karar);
  const m = Math.max(...u);
  const e = u.map((x) => Math.exp(x - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
}

/** Seçenek sayısı arttıkça hiç seçmeme olasılığı. */
export function secimYukuTerkOlasiligi(theta: Theta, secenekSayisi: number): number {
  if (secenekSayisi <= 6) return 0;
  return clamp(theta.kappa_secim_yuku * Math.log(secenekSayisi / 6), 0, 0.9);
}

/**
 * Bekleme/sürtünme sonrası terk: sağkalım tehlikesi. `gecenSaniye` beklenen süre, `surtunmeSayisi` yaşanan sürtünme olayı.
 * Döner: bu adımda (dt) terk olasılığı.
 */
export function terkOlasiligi(theta: Theta, gecenSaniye: number, surtunmeSayisi: number, dtSaniye: number): number {
  const tehlike = (gecenSaniye / theta.sabir) * 0.02 + (surtunmeSayisi >= theta.hayal_kirikligi_esigi ? 0.2 : surtunmeSayisi * 0.02);
  return clamp(1 - Math.exp(-tehlike * dtSaniye), 0, 1);
}

/**
 * Bir uyaranı (raf, afiş, banner) fark etme olasılığı; `belirginlik` 0–1.
 * `gorus_kaybi` (ADR-008): insan algı kusuru; belirginliği düşük uyaranlar daha çok kaçar, belirgin olanlar etkilenmez.
 */
export function farkEtmeOlasiligi(theta: Theta, belirginlik: number): number {
  const kusur = 1 - theta.gorus_kaybi * (1 - belirginlik);
  return clamp(theta.dikkat_esigi * (0.5 + belirginlik) * kusur, 0, 1);
}

/** Varsayılan/ön seçili seçenekte kalma olasılığı (d → olasılık; Jachimowicz d=0.68 ≈ %63). */
export function varsayilanKalmaOlasiligi(theta: Theta): number {
  return lojistik(theta.varsayilan_yapiskanlik * 0.8);
}

export interface Reklam {
  kanal: 'sosyal' | 'video' | 'arama' | 'acik_hava' | 'uygulama_ici' | 'eposta';
  /** yaratıcı tür */
  yaratici: 'indirim' | 'duygusal' | 'bilgi' | 'sosyal_kanit' | 'kitlik';
  /** 0–1 ne kadar göze çarpıyor */
  belirginlik: number;
  /** kişinin bu kampanyayı kaçıncı görüşü */
  maruziyetSayisi: number;
  indirimOrani?: number;
  /** 0–1 kişiselleştirme derecesi (tepkisellik riski) */
  kisisellestirme?: number;
  /** Kaynak C'den öğrenilmiş yaratıcı tür çarpanı (1 = yok); çekimi ölçekler (ADR-009) */
  ogrenilenCarpan?: number;
}

export interface ReklamTepkisi {
  farkEtti: number; // olasılık
  tiklama: number; // farkettiyse tıklama/ilgi olasılığı
  /** 0–1 arası ilgi (niyet) artışı — ortama giriş olasılığını ve ilgi terimini yükseltir */
  niyetArtisi: number;
  /** olumsuz tepki (kaçınma, yorgunluk) olasılığı */
  rahatsizlik: number;
}

/**
 * Reklam tepkisi (RK): banner körlüğü (dikkat), sıklık yıpranması (~10 maruziyet tepe), kişiselleştirme tepkiselliği,
 * yaratıcı türü ile θ etkileşimi (indirim → eta_fiyat; sosyal kanıt → w_sosyal_kanit; kıtlık → theta_kitlik).
 */
export function reklamTepkisi(theta: Theta, r: Reklam): ReklamTepkisi {
  const yipranma = r.maruziyetSayisi <= 3 ? 1 : Math.max(0.2, 1 - (r.maruziyetSayisi - 3) * 0.08);
  const farkEtti = clamp(farkEtmeOlasiligi(theta, r.belirginlik) * yipranma, 0, 1);
  let cekim = 0;
  if (r.yaratici === 'indirim') cekim += 0.6 * Math.min(2, theta.eta_fiyat) * (r.indirimOrani ?? 0.2) * 2;
  if (r.yaratici === 'sosyal_kanit') cekim += 0.5 * theta.w_sosyal_kanit;
  if (r.yaratici === 'kitlik') cekim += theta.theta_kitlik;
  if (r.yaratici === 'duygusal') cekim += 0.3;
  if (r.yaratici === 'bilgi') cekim += 0.25 * (theta.okuma_hizi / 200);
  cekim *= r.ogrenilenCarpan ?? 1;
  const tepkisellik = (r.kisisellestirme ?? 0) * (1.2 - Math.min(1.2, theta.tau_reklam_tolerans)) * 0.4;
  const tolerans = Math.log(theta.tau_reklam_tolerans + 0.1) * 0.5;
  const tiklama = clamp(lojistik(-2.2 + cekim + tolerans - tepkisellik), 0, 1);
  const rahatsizlik = clamp(lojistik(-1.5 - tolerans + (r.maruziyetSayisi - 3) * 0.1 + tepkisellik), 0, 1);
  const niyetArtisi = clamp(farkEtti * (0.15 + cekim * 0.3) * (1 - rahatsizlik), 0, 0.6);
  return { farkEtti, tiklama, niyetArtisi, rahatsizlik };
}
