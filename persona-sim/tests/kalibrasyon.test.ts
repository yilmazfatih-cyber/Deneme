import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { onculSec, S0_DUNYA } from '../src/core/parametreler';
import { posOku, posOkuRapor, kaynakBUydur, farkRaporu, butceCarpani, ornekPosCsv, sayiOku, tarihOku } from '../src/kalibrasyon';
import type { PosKaydi } from '../src/kalibrasyon';
import ornekCsv from '../public/ornek/pos.csv?raw';

function sentetik(rng: Rng, n: number, medyan: number, sd: number, magazaId = 'm1'): PosKaydi[] {
  return Array.from({ length: n }, (_, i) => ({
    musteriId: `k${i % Math.max(1, Math.floor(n / 5))}`,
    magazaId,
    tarih: `2026-08-${String(1 + (i % 30)).padStart(2, '0')}`,
    tutarTL: rng.lognormal(Math.log(medyan), sd),
  }));
}

describe('posOku', () => {
  it('hatalı satırları atlar ve sayar; Türkçe ondalık virgül toleransı', () => {
    const csv = [
      'musteri_id;magaza_id;tarih;tutar;urun_sayisi;kampanya',
      'k1;M01;2026-08-01;1.234,50;3;1',
      ';M01;05.08.2026;99,9;;0',
      'k2;M02;2026-08-02;abc;1;0', // tutar hatalı
      'k3;;2026-08-02;100;1;0', // mağaza yok
      'k4;M02;2026-02-30;100;1;0', // geçersiz tarih
      'k5;M02;2026-08-03;-5;1;0', // negatif tutar
      'k6;M02;2026-08-03;250;1;belki', // kampanya hatalı
      '',
      'k7;M02;2026-08-04;"250,75";2;evet',
    ].join('\n');
    const r = posOkuRapor(csv);
    expect(r.kayitlar.length).toBe(3);
    expect(r.hatali).toBe(5);
    expect(r.hataliSatirlar).toEqual([4, 5, 6, 7, 8]);
    expect(r.kayitlar[0]).toEqual({ musteriId: 'k1', magazaId: 'M01', tarih: '2026-08-01', tutarTL: 1234.5, urunSayisi: 3, kampanya: true });
    expect(r.kayitlar[1]).toEqual({ magazaId: 'M01', tarih: '2026-08-05', tutarTL: 99.9, kampanya: false });
    expect(r.kayitlar[2]!.tutarTL).toBe(250.75);
    expect(posOku(csv)).toEqual(r.kayitlar);
  });

  it('virgülle ayrılmış CSV, tırnaklı ondalık virgül', () => {
    const r = posOku('magaza_id,tarih,tutar\nM1,2026-08-01,"12,5"\nM1,2026-08-01,12.5\n');
    expect(r.map((k) => k.tutarTL)).toEqual([12.5, 12.5]);
  });

  it('zorunlu sütun yoksa hata', () => {
    expect(() => posOku('magaza_id,tarih\nM1,2026-08-01')).toThrow();
  });

  it('sayı ve tarih yardımcıları', () => {
    expect(sayiOku('1.234,56')).toBeCloseTo(1234.56);
    expect(sayiOku('1,234.56')).toBeCloseTo(1234.56);
    expect(sayiOku('₺ 45')).toBe(45);
    expect(Number.isNaN(sayiOku('12a'))).toBe(true);
    expect(tarihOku('1/9/2026')).toBe('2026-09-01');
    expect(tarihOku('2026-13-01')).toBeNull();
  });
});

describe('kaynakBUydur', () => {
  it('sentetik lognormal veride medyanı ±%10 bulur', () => {
    const k = sentetik(new Rng(1), 1000, 700, 0.6);
    const b = kaynakBUydur(k);
    expect(b.sepetMedyanTL).toBeGreaterThan(630);
    expect(b.sepetMedyanTL).toBeLessThan(770);
    expect(b.sepetLogSd).toBeGreaterThan(0.54);
    expect(b.sepetLogSd).toBeLessThan(0.66);
    expect(b.guven).toBe('yuksek');
    expect(b.magazaId).toBe('hepsi');
    expect(b.musteriSayisi).toBe(200);
    // 1000 fiş / 200 müşteri / 1 ay (30 gün)
    expect(b.ziyaretSikligiAyda).toBeCloseTo(5, 5);
    expect(b.sepetOrtTL).toBeGreaterThan(b.sepetMedyanTL); // lognormal: ortalama > medyan
  });

  it('mağaza filtresi ve n<50 → güven düşük, yerel iddia yok', () => {
    const k = [...sentetik(new Rng(2), 400, 700, 0.5, 'A'), ...sentetik(new Rng(3), 30, 400, 0.5, 'B')];
    const b = kaynakBUydur(k, 'B');
    expect(b.n).toBe(30);
    expect(b.guven).toBe('dusuk');
    expect(b.uyarilar?.join(' ')).toMatch(/yerel/);
  });

  it('kampanya etkisi oranı ve GA', () => {
    const rng = new Rng(4);
    const k: PosKaydi[] = Array.from({ length: 2000 }, (_, i) => {
      const kampanya = i % 4 === 0;
      return { magazaId: 'm', tarih: '2026-08-01', tutarTL: rng.lognormal(Math.log(kampanya ? 600 : 500), 0.4), kampanya };
    });
    const b = kaynakBUydur(k);
    expect(b.kampanyaEtkisi!.oran).toBeGreaterThan(1.1);
    expect(b.kampanyaEtkisi!.ga[0]).toBeGreaterThan(1);
    expect(b.kampanyaEtkisi!.ga[0]).toBeLessThan(1.2);
    expect(b.kampanyaEtkisi!.ga[1]).toBeGreaterThan(1.2);
    expect(b.ziyaretSikligiAyda).toBeUndefined();
  });
});

describe('farkRaporu', () => {
  it('B daha düşükse yön negatif ve anlamlı', () => {
    const b = kaynakBUydur(sentetik(new Rng(5), 2000, 500, 0.6));
    const r = farkRaporu({ sepetMedyanTL: 800, sepetLogSd: 0.6 }, b);
    const m = r.find((x) => x.parametre === 'sepetMedyanTL')!;
    expect(m.fark).toBeLessThan(0);
    expect(m.farkOrani).toBeCloseTo(b.sepetMedyanTL / 800 - 1, 10);
    expect(m.ga![1]).toBeLessThan(0);
    expect(m.anlamlilik).toBe('anlamli');
    expect(m.yorum).toMatch(/düşük/);
    // yayılım aynı → eşdeğer
    expect(r.find((x) => x.parametre === 'sepetLogSd')!.anlamlilik).toBe('esdeger');
  });

  it('B daha yüksekse yön pozitif; az veride belirsiz', () => {
    const buyuk = kaynakBUydur(sentetik(new Rng(6), 2000, 1000, 0.6));
    expect(farkRaporu({ sepetMedyanTL: 800, sepetLogSd: 0.6 }, buyuk)[0]!.anlamlilik).toBe('anlamli');
    expect(farkRaporu({ sepetMedyanTL: 800, sepetLogSd: 0.6 }, buyuk)[0]!.fark).toBeGreaterThan(0);
    const kucuk = kaynakBUydur(sentetik(new Rng(7), 40, 1000, 0.6));
    const r = farkRaporu({ sepetMedyanTL: 800, sepetLogSd: 0.6 }, kucuk)[0]!;
    expect(r.anlamlilik).toBe('belirsiz');
  });

  it('ziyaret sıklığı satırı yalnız iki tarafta da varsa üretilir', () => {
    const b = kaynakBUydur(sentetik(new Rng(8), 1000, 700, 0.6));
    expect(farkRaporu({ sepetMedyanTL: 700, sepetLogSd: 0.6 }, b).map((x) => x.parametre)).not.toContain('ziyaretSikligiAyda');
    const z = farkRaporu({ sepetMedyanTL: 700, sepetLogSd: 0.6, ziyaretSikligiAyda: 2 }, b).find((x) => x.parametre === 'ziyaretSikligiAyda')!;
    expect(z.fark).toBeCloseTo(3, 5);
    expect(z.anlamlilik).toBe('anlamli');
  });
});

describe('butceCarpani ve örnek POS', () => {
  it('butceCarpani = B medyanı / A bütçe medyanı', () => {
    const b = kaynakBUydur(sentetik(new Rng(9), 500, 400, 0.5));
    expect(butceCarpani(S0_DUNYA, b)).toBeCloseTo(b.sepetMedyanTL / 800, 10);
    expect(butceCarpani(onculSec('S1'), b)).toBeCloseTo(b.sepetMedyanTL / 800, 10);
  });

  it('ornekPosCsv okunabilir, mağaza farkı ve kampanya etkisi taşır', () => {
    const csv = ornekPosCsv(new Rng(3), 3000, ['M01', 'M02', 'M03']);
    const r = posOkuRapor(csv);
    expect(r.hatali).toBe(0);
    expect(r.kayitlar.length).toBe(3000);
    const b = kaynakBUydur(r.kayitlar);
    expect(b.sepetMedyanTL).toBeGreaterThan(400);
    expect(b.sepetMedyanTL).toBeLessThan(1000);
    expect(b.kampanyaEtkisi!.oran).toBeGreaterThan(1);
    expect(b.musteriSayisi).toBeGreaterThan(0);
  });

  it('public/ornek/pos.csv = ornekPosCsv(Rng(11), 600, [M01..M04])', () => {
    expect(ornekCsv).toBe(ornekPosCsv(new Rng(11), 600, ['M01', 'M02', 'M03', 'M04']));
    expect(posOkuRapor(ornekCsv).kayitlar.length).toBe(600);
  });
});
