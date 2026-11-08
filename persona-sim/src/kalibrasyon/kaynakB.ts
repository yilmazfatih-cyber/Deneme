/**
 * Kaynak B (gerçek müşteri verisi) kestirimi ve A–B fark raporu — ADR-003, ADR-004, 07 §4.4 ve §10.2.
 * Basitleştirmeler (varsayım): bootstrap/posterior yerine log ölçekte normal yaklaşım; A'nın değerleri sabit kabul edilir
 * (A'nın öngörü varyansı v_A hesaba katılmaz, bu yüzden GA'lar yalnız B'nin örnekleme belirsizliğini taşır — NOTLAR.md).
 */
import type { OnculSeti } from '../core/parametreler';
import type { PosKaydi } from './pos';

export type BGuven = 'yuksek' | 'orta' | 'dusuk';

export interface KaynakB {
  magazaId: string | 'hepsi';
  n: number;
  sepetMedyanTL: number;
  sepetLogOrt: number;
  sepetLogSd: number;
  sepetOrtTL: number;
  /** müşteri kimlikli fişlerden: müşteri başına aylık ziyaret */
  ziyaretSikligiAyda?: number;
  /** kampanya içi / dışı ortalama tutar oranı ve %95 GA */
  kampanyaEtkisi?: { oran: number; ga: [number, number] };
  musteriSayisi?: number;
  guven: BGuven;
  /** 07 §4.4 kuralları gereği okuyucuya gösterilecek uyarılar */
  uyarilar?: string[];
}

/** n < bu → güven düşük, "yerel" iddia yok (07 §4.4; 07 §3.5 aşırı kesinlik koruması). */
export const B_ASGARI_N = 50;
export const B_YUKSEK_N = 300;
const Z95 = 1.959964;
const GUN_AY = 30.4375;

const ortalama = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const orneklemVaryansi = (xs: number[]): number => {
  const m = ortalama(xs);
  return xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1);
};

/** Lognormal moment uydurma: log-tutarların ortalaması ve SD'si; medyan = exp(log-ortalama). */
export function kaynakBUydur(kayitlar: PosKaydi[], magazaId?: string): KaynakB {
  const secili = magazaId === undefined ? kayitlar : kayitlar.filter((k) => k.magazaId === magazaId);
  const n = secili.length;
  if (n < 2) throw new Error(`Kaynak B için en az 2 fiş gerekli (bulunan: ${n})`);
  const tutarlar = secili.map((k) => k.tutarTL);
  const loglar = tutarlar.map(Math.log);
  const sepetLogOrt = ortalama(loglar);
  const sepetLogSd = Math.sqrt(orneklemVaryansi(loglar));
  const uyarilar: string[] = [];
  const guven: BGuven = n < B_ASGARI_N ? 'dusuk' : n < B_YUKSEK_N ? 'orta' : 'yuksek';
  if (guven === 'dusuk')
    uyarilar.push(`n=${n} < ${B_ASGARI_N}: "yerel" (bu mağazaya/müşteriye özgü) iddia yok; karar için Kaynak A miras kalır.`);

  const b: KaynakB = {
    magazaId: magazaId ?? 'hepsi',
    n,
    sepetMedyanTL: Math.exp(sepetLogOrt),
    sepetLogOrt,
    sepetLogSd,
    sepetOrtTL: ortalama(tutarlar),
    guven,
  };

  // Ziyaret sıklığı: yalnız müşteri kimlikli fişlerden (07 §4.4 kural 2)
  const kimlikli = secili.filter((k) => k.musteriId !== undefined);
  if (kimlikli.length > 0) {
    const musteriler = new Set(kimlikli.map((k) => k.musteriId));
    const zamanlar = kimlikli.map((k) => Date.parse(k.tarih));
    const gun = (Math.max(...zamanlar) - Math.min(...zamanlar)) / 86400000 + 1;
    const ay = Math.max(1, gun / GUN_AY);
    b.musteriSayisi = musteriler.size;
    b.ziyaretSikligiAyda = kimlikli.length / musteriler.size / ay;
  } else {
    uyarilar.push('Müşteri kimliği yok: ziyaret sıklığı ve müşteri kümeleri kestirilemez; mağaza için yalnız Kaynak A.');
  }

  // Kampanya etkisi: ortalama tutar oranı, log ölçekte delta yöntemi
  const ic = secili.filter((k) => k.kampanya === true).map((k) => k.tutarTL);
  const dis = secili.filter((k) => k.kampanya === false).map((k) => k.tutarTL);
  if (ic.length >= 2 && dis.length >= 2) {
    const mi = ortalama(ic), md = ortalama(dis);
    const v = orneklemVaryansi(ic) / (ic.length * mi * mi) + orneklemVaryansi(dis) / (dis.length * md * md);
    const lr = Math.log(mi / md);
    b.kampanyaEtkisi = { oran: mi / md, ga: [Math.exp(lr - Z95 * Math.sqrt(v)), Math.exp(lr + Z95 * Math.sqrt(v))] };
    uyarilar.push('Kampanya etkisi gözlemseldir (kampanya günleri rastgele atanmadı); nedensel değil.');
  }
  if (uyarilar.length > 0) b.uyarilar = uyarilar;
  return b;
}

export type Anlamlilik = 'anlamli' | 'belirsiz' | 'esdeger';

export interface FarkSatiri {
  parametre: string;
  aDeger: number;
  bDeger: number;
  /** B − A, doğal ölçekte */
  fark: number;
  /** B/A − 1 */
  farkOrani: number;
  /** fark (B − A) için %95 GA, doğal ölçekte */
  ga: [number, number] | null;
  anlamlilik: Anlamlilik;
  yorum: string;
}

/** Pratik eşdeğerlik bölgesi (ROPE): A değerinin ±%10'u (log ölçekte ≈ ±0,1; 07 §10.2 "±0,1 SD" eşiğinin basit hâli, varsayım). */
export const ROPE_GORELI = 0.1;

function siniflandir(gaOrani: [number, number], bGuven: BGuven): Anlamlilik {
  const [lo, hi] = gaOrani;
  let s: Anlamlilik;
  if (lo > ROPE_GORELI || hi < -ROPE_GORELI) s = 'anlamli';
  else if (lo >= -ROPE_GORELI && hi <= ROPE_GORELI) s = 'esdeger';
  else s = 'belirsiz';
  // n küçükse B aşırı kesin olabilir: anlamlı/eşdeğer iddiası yapılmaz
  return bGuven === 'dusuk' ? 'belirsiz' : s;
}

const yuzde = (x: number): string => `%${(100 * Math.abs(x)).toFixed(0)}`;
const ondalik = (x: number, b = 2): string => x.toFixed(b).replace('.', ',');

function yorumYaz(etiket: string, a: number, bv: number, oranGa: [number, number], s: Anlamlilik, b: KaynakB, birim: string): string {
  const fo = bv / a - 1;
  const yon = fo >= 0 ? 'yüksek' : 'düşük';
  const bas = `${etiket}: Kaynak A ${ondalik(a)}${birim}, sizin verinizde (B, n=${b.n}) ${ondalik(bv)}${birim}; B ${yuzde(fo)} ${yon}`;
  const ga = ` [%95 GA ${oranGa[0] >= 0 ? '+' : '−'}${yuzde(oranGa[0])}; ${oranGa[1] >= 0 ? '+' : '−'}${yuzde(oranGa[1])}]`;
  const son =
    s === 'anlamli' ? 'Anlamlı fark.' :
    s === 'esdeger' ? `Pratik olarak eşdeğer (±${yuzde(ROPE_GORELI)}).` :
    b.guven === 'dusuk' ? `Belirsiz: B'de n < ${B_ASGARI_N}, yerel iddia yok.` : 'Belirsiz: aralık eşdeğerlik bölgesine taşıyor.';
  return `${bas}${ga}. ${son}`;
}

/**
 * A (genel model / simülasyon) ile B (gerçek POS verisi) karşılaştırması. Her satırda yön, büyüklük, %95 GA ve anlamlılık.
 * Dönüşüm (donusum) POS verisinde gözlenmez; A'da verilse de satır üretilmez (07 §4.4: mağaza verisinden tanımlanamaz).
 */
export function farkRaporu(
  a: { sepetMedyanTL: number; sepetLogSd: number; donusum?: number; ziyaretSikligiAyda?: number },
  b: KaynakB,
): FarkSatiri[] {
  const satirlar: FarkSatiri[] = [];

  // 1) Sepet medyanı — log ölçekte: se = sd_B / √n
  {
    const d = b.sepetLogOrt - Math.log(a.sepetMedyanTL);
    const se = b.sepetLogSd / Math.sqrt(b.n);
    const oranGa: [number, number] = [Math.exp(d - Z95 * se) - 1, Math.exp(d + Z95 * se) - 1];
    const s = siniflandir(oranGa, b.guven);
    satirlar.push({
      parametre: 'sepetMedyanTL',
      aDeger: a.sepetMedyanTL,
      bDeger: b.sepetMedyanTL,
      fark: b.sepetMedyanTL - a.sepetMedyanTL,
      farkOrani: b.sepetMedyanTL / a.sepetMedyanTL - 1,
      ga: [oranGa[0] * a.sepetMedyanTL, oranGa[1] * a.sepetMedyanTL],
      anlamlilik: s,
      yorum: yorumYaz('Sepet medyanı', a.sepetMedyanTL, b.sepetMedyanTL, oranGa, s, b, ' TL'),
    });
  }

  // 2) Sepet log-SD (yayılım) — se(sd) ≈ sd / √(2(n−1))
  {
    const se = b.sepetLogSd / Math.sqrt(2 * (b.n - 1));
    const lo = b.sepetLogSd - Z95 * se, hi = b.sepetLogSd + Z95 * se;
    const oranGa: [number, number] = [lo / a.sepetLogSd - 1, hi / a.sepetLogSd - 1];
    const s = siniflandir(oranGa, b.guven);
    satirlar.push({
      parametre: 'sepetLogSd',
      aDeger: a.sepetLogSd,
      bDeger: b.sepetLogSd,
      fark: b.sepetLogSd - a.sepetLogSd,
      farkOrani: b.sepetLogSd / a.sepetLogSd - 1,
      ga: [lo - a.sepetLogSd, hi - a.sepetLogSd],
      anlamlilik: s,
      yorum: yorumYaz('Sepet tutarı yayılımı (log-SD)', a.sepetLogSd, b.sepetLogSd, oranGa, s, b, ''),
    });
  }

  // 3) Ziyaret sıklığı — Poisson yaklaşımı, 1 aylık gözlem varsayımıyla (temkinli: uzun dönemde se olduğundan büyük)
  if (a.ziyaretSikligiAyda !== undefined && b.ziyaretSikligiAyda !== undefined && b.musteriSayisi) {
    const se = Math.sqrt(b.ziyaretSikligiAyda / b.musteriSayisi);
    const lo = b.ziyaretSikligiAyda - Z95 * se, hi = b.ziyaretSikligiAyda + Z95 * se;
    const oranGa: [number, number] = [lo / a.ziyaretSikligiAyda - 1, hi / a.ziyaretSikligiAyda - 1];
    const s = siniflandir(oranGa, b.guven);
    satirlar.push({
      parametre: 'ziyaretSikligiAyda',
      aDeger: a.ziyaretSikligiAyda,
      bDeger: b.ziyaretSikligiAyda,
      fark: b.ziyaretSikligiAyda - a.ziyaretSikligiAyda,
      farkOrani: b.ziyaretSikligiAyda / a.ziyaretSikligiAyda - 1,
      ga: [lo - a.ziyaretSikligiAyda, hi - a.ziyaretSikligiAyda],
      anlamlilik: s,
      yorum: yorumYaz('Aylık ziyaret sıklığı', a.ziyaretSikligiAyda, b.ziyaretSikligiAyda, oranGa, s, b, ''),
    });
  }
  return satirlar;
}

/**
 * Bütçe çarpanı: Kaynak B sepet medyanı / A öncülündeki `butce` medyanı. Segment kaydırmalarıyla birlikte `butce` merkezine
 * çarpan olarak uygulanabilir; mağaza simülasyonuna `gercekSepetMedyaniTL = b.sepetMedyanTL` olarak da verilebilir.
 */
export function butceCarpani(a: OnculSeti, b: KaynakB): number {
  return b.sepetMedyanTL / a.parametreler.butce.merkez;
}
