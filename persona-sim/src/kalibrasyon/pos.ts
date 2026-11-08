/**
 * POS (kasa) dışa aktarımı okuma — ADR-004: mağaza verisi şirketin kendi fiş tutarlarıdır.
 * Müşteri kimliği takma adlıdır (06); bu modül kimliği yalnız ziyaret sıklığı hesabında kullanır, dışarı vermez.
 */
import type { Rng } from '../core/rng';

export interface PosKaydi {
  musteriId?: string;
  magazaId: string;
  /** ISO tarih (YYYY-MM-DD) */
  tarih: string;
  tutarTL: number;
  urunSayisi?: number;
  kampanya?: boolean;
}

export interface PosOkumaSonucu {
  kayitlar: PosKaydi[];
  /** atlanan (hatalı) veri satırı sayısı */
  hatali: number;
  /** atlanan satırların 1 tabanlı dosya satır numaraları (başlık = 1) */
  hataliSatirlar: number[];
}

/** Tek satırı ayırır; çift tırnaklı alanları ("12,50") destekler. */
function satirAyir(satir: string, ayirac: string): string[] {
  const alanlar: string[] = [];
  let cur = '';
  let tirnak = false;
  for (let i = 0; i < satir.length; i++) {
    const c = satir[i]!;
    if (tirnak) {
      if (c === '"' && satir[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') tirnak = false;
      else cur += c;
    } else if (c === '"') tirnak = true;
    else if (c === ayirac) { alanlar.push(cur); cur = ''; }
    else cur += c;
  }
  alanlar.push(cur);
  return alanlar.map((a) => a.trim());
}

/** "1.234,56" · "1234,56" · "1234.56" · "1,234.56" → sayı. Hatalıysa NaN. */
export function sayiOku(s: string): number {
  let t = s.replace(/\s|TL|₺/gi, '');
  if (t === '') return NaN;
  const sonVirgul = t.lastIndexOf(','), sonNokta = t.lastIndexOf('.');
  if (sonVirgul >= 0 && sonNokta >= 0) {
    t = sonVirgul > sonNokta ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (sonVirgul >= 0) {
    t = t.replace(',', '.');
  }
  if (!/^-?\d+(\.\d+)?$/.test(t)) return NaN;
  return Number(t);
}

/** YYYY-MM-DD veya GG.AA.YYYY / GG/AA/YYYY → ISO; hatalıysa null. */
export function tarihOku(s: string): string | null {
  let y: number, a: number, g: number;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) { y = +m[1]!; a = +m[2]!; g = +m[3]!; }
  else {
    m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s);
    if (!m) return null;
    g = +m[1]!; a = +m[2]!; y = +m[3]!;
  }
  const d = new Date(Date.UTC(y, a - 1, g));
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== a - 1 || d.getUTCDate() !== g) return null;
  return d.toISOString().slice(0, 10);
}

const DOGRU = new Set(['1', 'true', 'evet', 'e', 'var', 'yes', 'y']);
const YANLIS = new Set(['0', 'false', 'hayir', 'hayır', 'h', 'yok', 'no', 'n', '']);

export function posOkuRapor(csv: string): PosOkumaSonucu {
  const satirlar = csv.replace(/^﻿/, '').split(/\r?\n/);
  const baslikSatiri = satirlar[0] ?? '';
  // Türkçe Excel dışa aktarımı çoğunlukla ';' ayırır (ondalık virgül yüzünden)
  const ayirac = baslikSatiri.includes(';') ? ';' : baslikSatiri.includes('\t') ? '\t' : ',';
  const baslik = satirAyir(baslikSatiri, ayirac).map((b) => b.toLocaleLowerCase('tr-TR'));
  const sutun = (ad: string): number => baslik.indexOf(ad);
  const iMusteri = sutun('musteri_id'), iMagaza = sutun('magaza_id'), iTarih = sutun('tarih'), iTutar = sutun('tutar');
  const iUrun = sutun('urun_sayisi'), iKampanya = sutun('kampanya');
  if (iMagaza < 0 || iTarih < 0 || iTutar < 0) throw new Error('POS CSV: magaza_id, tarih ve tutar sütunları zorunlu');

  const kayitlar: PosKaydi[] = [];
  const hataliSatirlar: number[] = [];
  for (let i = 1; i < satirlar.length; i++) {
    const ham = satirlar[i]!;
    if (ham.trim() === '') continue;
    const f = satirAyir(ham, ayirac);
    const magazaId = f[iMagaza] ?? '';
    const tarih = tarihOku(f[iTarih] ?? '');
    const tutarTL = sayiOku(f[iTutar] ?? '');
    if (magazaId === '' || tarih === null || !Number.isFinite(tutarTL) || tutarTL <= 0) {
      hataliSatirlar.push(i + 1);
      continue;
    }
    const k: PosKaydi = { magazaId, tarih, tutarTL };
    const musteriId = iMusteri >= 0 ? f[iMusteri] ?? '' : '';
    if (musteriId !== '') k.musteriId = musteriId;
    if (iUrun >= 0 && (f[iUrun] ?? '') !== '') {
      const u = sayiOku(f[iUrun]!);
      if (!Number.isInteger(u) || u < 0) { hataliSatirlar.push(i + 1); continue; }
      k.urunSayisi = u;
    }
    if (iKampanya >= 0) {
      const v = (f[iKampanya] ?? '').toLocaleLowerCase('tr-TR');
      if (DOGRU.has(v)) k.kampanya = true;
      else if (YANLIS.has(v)) { if (v !== '') k.kampanya = false; }
      else { hataliSatirlar.push(i + 1); continue; }
    }
    kayitlar.push(k);
  }
  return { kayitlar, hatali: hataliSatirlar.length, hataliSatirlar };
}

/** Başlık satırlı POS CSV'sini okur; hatalı satırları atlar (sayısı için `posOkuRapor`). */
export function posOku(csv: string): PosKaydi[] {
  return posOkuRapor(csv).kayitlar;
}

/**
 * Demo için sentetik POS CSV: lognormal fiş tutarları, mağaza çarpanları, kampanya günleri (tutar ↑), %20 kartsız fiş.
 * Tarih aralığı 2026-08-01'den 90 gün. Sütunlar: musteri_id,magaza_id,tarih,tutar,urun_sayisi,kampanya.
 */
export function ornekPosCsv(rng: Rng, n: number, magazalar: string[]): string {
  if (magazalar.length === 0) throw new Error('en az bir mağaza gerekli');
  const TABAN_MEDYAN = 650, LOG_SD = 0.6, KAMPANYA_CARPANI = 1.25, GUN = 90;
  const carpan = magazalar.map(() => Math.exp(rng.normal(0, 0.25)));
  const musteriSayisi = Math.max(1, Math.round(n / 4));
  // her müşterinin "ev mağazası" ve kendi harcama düzeyi
  const ev = Array.from({ length: musteriSayisi }, () => rng.int(magazalar.length));
  const duzey = Array.from({ length: musteriSayisi }, () => rng.normal(0, 0.3));
  const kampanyaGunu = (g: number): boolean => g % 14 >= 11; // her iki haftanın son 3 günü
  const satirlar = ['musteri_id,magaza_id,tarih,tutar,urun_sayisi,kampanya'];
  const bas = Date.UTC(2026, 7, 1);
  for (let i = 0; i < n; i++) {
    const kartli = rng.bernoulli(0.8);
    const mi = rng.int(musteriSayisi);
    const magazaIndis = kartli ? (rng.bernoulli(0.85) ? ev[mi]! : rng.int(magazalar.length)) : rng.int(magazalar.length);
    const gun = rng.int(GUN);
    const kampanya = kampanyaGunu(gun);
    const mu = Math.log(TABAN_MEDYAN * carpan[magazaIndis]! * (kampanya ? KAMPANYA_CARPANI : 1)) + (kartli ? duzey[mi]! : 0);
    const tutar = Math.max(5, rng.lognormal(mu, Math.sqrt(Math.max(0.01, LOG_SD * LOG_SD - (kartli ? 0.09 : 0)))));
    const urun = Math.max(1, Math.round(tutar / 140 + rng.normal(0, 1)));
    const tarih = new Date(bas + gun * 86400000).toISOString().slice(0, 10);
    const mid = kartli ? `k${String(mi + 1).padStart(4, '0')}` : '';
    satirlar.push(`${mid},${magazalar[magazaIndis]},${tarih},${tutar.toFixed(2)},${urun},${kampanya ? 1 : 0}`);
  }
  return satirlar.join('\n') + '\n';
}
