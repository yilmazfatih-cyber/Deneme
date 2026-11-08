import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { onculSec, thetaMedyan } from '../src/core/parametreler';
import { TURKIYE_SEGMENTLERI, nufusUret } from '../src/core/nufus';
import type { Musteri, Segment } from '../src/core/nufus';
import { OlayGunlugu } from '../src/core/olay';
import type { MusteriGirdisi } from '../src/core/arayuz';
import {
  ORNEK_KAMPANYALAR, kampanyaUygula, hedeflemeRaporu, raporMetni, kontrolEtiketi, oranFarkiGA, poisson,
} from '../src/reklam';
import type { Kampanya } from '../src/reklam';

const oncul = onculSec('S1');

const kampanya = (ek: Partial<Kampanya> = {}): Kampanya => ({
  ad: 'test', kanal: 'sosyal', yaratici: 'indirim', belirginlik: 0.6, indirimOrani: 0.25,
  hedefSegmentler: 'hepsi', ortalamaMaruziyet: 3, butceTL: 1e6, bin_maliyetiTL: 30, kontrolGrubuOrani: 0.2, ...ek,
});

/** Basit ortam yerine: niyete bağlı satın alma olayları üretir (test için). */
function donusumUret(girdiler: MusteriGirdisi[], gunluk: OlayGunlugu, rng: Rng, taban = 0.05, etki = 0.8): void {
  for (const g of girdiler) {
    if (rng.bernoulli(taban + etki * g.niyet))
      gunluk.ekle({ t: 1, ortam: 'eticaret', musteriId: g.musteri.id, segmentId: g.musteri.segmentId, tur: 'satin_al' });
  }
}

describe('kampanyaUygula', () => {
  it('kontrol grubu oranı korunur', () => {
    const rng = new Rng(1);
    const m = nufusUret(5000, oncul, TURKIYE_SEGMENTLERI, rng);
    const r = kampanyaUygula(m, kampanya({ kontrolGrubuOrani: 0.3 }), rng, new OlayGunlugu());
    const kontrol = r.girdiler.filter((g) => g.reklamKaynagi === kontrolEtiketi('test'));
    expect(kontrol.length / m.length).toBeGreaterThan(0.27);
    expect(kontrol.length / m.length).toBeLessThan(0.33);
    expect(kontrol.every((g) => g.niyet === 0)).toBe(true);
  });

  it('bütçe aşılmaz ve gösterim sayısı bütçeyle tutarlı', () => {
    const rng = new Rng(2);
    const m = nufusUret(3000, oncul, TURKIYE_SEGMENTLERI, rng);
    const gunluk = new OlayGunlugu();
    const k = kampanya({ butceTL: 50, bin_maliyetiTL: 40 }); // en çok 1250 gösterim
    const r = kampanyaUygula(m, k, rng, gunluk);
    expect(r.harcananTL).toBeLessThanOrEqual(k.butceTL + 1e-9);
    expect(r.gosterim).toBe(1250);
    expect(gunluk.say('reklam_goster', 'reklam')).toBe(r.gosterim);
    expect(r.harcananTL).toBeCloseTo((r.gosterim * k.bin_maliyetiTL) / 1000, 6);
  });

  it('hedef dışı segment maruz kalmaz ve organik kalır', () => {
    const rng = new Rng(3);
    const m = nufusUret(2000, oncul, TURKIYE_SEGMENTLERI, rng);
    const gunluk = new OlayGunlugu();
    const r = kampanyaUygula(m, kampanya({ hedefSegmentler: ['emekli'] }), rng, gunluk);
    expect(gunluk.liste().every((o) => o.segmentId === 'emekli')).toBe(true);
    for (const g of r.girdiler.filter((x) => x.musteri.segmentId !== 'emekli')) {
      expect(g.niyet).toBe(0);
      expect('reklamKaynagi' in g).toBe(false);
    }
    expect(r.maruzKalan).toBeGreaterThan(0);
  });

  it('fiyat duyarlı segmentte indirim yaratıcısı daha yüksek tıklama verir', () => {
    // fiyat duyarlı (eta_fiyat yüksek) tek segment; aynı nüfusa iki yaratıcı
    const seg: Segment[] = [TURKIYE_SEGMENTLERI.find((s) => s.id === 'ebeveyn_dusuk')!];
    const m = nufusUret(4000, oncul, seg, new Rng(4));
    const oran = (y: Kampanya['yaratici']): number => {
      const r = kampanyaUygula(m, kampanya({ yaratici: y, indirimOrani: 0.3, kontrolGrubuOrani: 0 }), new Rng(5), new OlayGunlugu());
      return r.tiklama / m.length;
    };
    expect(oran('indirim')).toBeGreaterThan(oran('duygusal'));
    expect(oran('indirim')).toBeGreaterThan(oran('bilgi'));
  });

  it('niyet tavanı ve tohum tekrarlanabilirliği', () => {
    const m = nufusUret(500, oncul, TURKIYE_SEGMENTLERI, new Rng(6));
    const a = kampanyaUygula(m, kampanya({ ortalamaMaruziyet: 20 }), new Rng(7), new OlayGunlugu());
    const b = kampanyaUygula(m, kampanya({ ortalamaMaruziyet: 20 }), new Rng(7), new OlayGunlugu());
    expect(a.girdiler.every((g) => g.niyet >= 0 && g.niyet <= 0.6)).toBe(true);
    expect(a.girdiler.map((g) => g.niyet)).toEqual(b.girdiler.map((g) => g.niyet));
  });

  it('poisson ortalaması λ civarında', () => {
    const r = new Rng(8);
    const xs = Array.from({ length: 5000 }, () => poisson(r, 3));
    expect(xs.reduce((s, x) => s + x, 0) / xs.length).toBeCloseTo(3, 1);
  });

  it('örnek kampanyalar geçerli', () => {
    expect(ORNEK_KAMPANYALAR.length).toBeGreaterThanOrEqual(3);
    for (const k of ORNEK_KAMPANYALAR) {
      expect(k.kontrolGrubuOrani).toBeGreaterThan(0);
      expect(k.kontrolGrubuOrani).toBeLessThan(1);
    }
  });
});

describe('hedeflemeRaporu', () => {
  const seg: Segment[] = [
    { ...TURKIYE_SEGMENTLERI[0]!, id: 's1', ad: 'Segment 1' },
    { ...TURKIYE_SEGMENTLERI[1]!, id: 's2', ad: 'Segment 2' },
  ];
  const theta = thetaMedyan(oncul);
  const musteri = (id: string, segmentId: string): Musteri => ({ id, segmentId, theta, kaynak: 'A' });
  const k = kampanya({ ad: 'k', bin_maliyetiTL: 1000 }); // gösterim başı 1 TL

  /** s1: maruz 200 (40 dönüşüm), kontrol 100 (10 dönüşüm), 300 gösterim, 20 tıklayan, 10 rahatsız. s2: maruz 10, kontrol 5. */
  function kur(): { gunluk: OlayGunlugu; girdiler: MusteriGirdisi[] } {
    const gunluk = new OlayGunlugu();
    const girdiler: MusteriGirdisi[] = [];
    const ekle = (id: string, s: string, kaynak: string, donustu: boolean): void => {
      girdiler.push({ musteri: musteri(id, s), niyet: 0, reklamKaynagi: kaynak });
      if (donustu) gunluk.ekle({ t: 1, ortam: 'magaza', musteriId: id, segmentId: s, tur: 'kasa' });
    };
    for (let i = 0; i < 200; i++) ekle(`a${i}`, 's1', 'k', i < 40);
    for (let i = 0; i < 100; i++) ekle(`c${i}`, 's1', kontrolEtiketi('k'), i < 10);
    for (let i = 0; i < 10; i++) ekle(`b${i}`, 's2', 'k', i < 3);
    for (let i = 0; i < 5; i++) ekle(`d${i}`, 's2', kontrolEtiketi('k'), false);
    girdiler.push({ musteri: musteri('o1', 's1'), niyet: 0 }); // organik, sayılmaz
    gunluk.ekle({ t: 1, ortam: 'magaza', musteriId: 'o1', segmentId: 's1', tur: 'kasa' });
    const r = (tur: 'reklam_goster' | 'reklam_tikla' | 'reklam_rahatsiz', id: string): void =>
      gunluk.ekle({ t: 0, ortam: 'reklam', musteriId: id, segmentId: 's1', tur, veri: { kampanya: 'k' } });
    for (let i = 0; i < 300; i++) r('reklam_goster', `a${i % 200}`);
    for (let i = 0; i < 20; i++) r('reklam_tikla', `a${i}`);
    for (let i = 0; i < 10; i++) r('reklam_rahatsiz', `a${i}`);
    // başka kampanyanın olayı karışmaz
    gunluk.ekle({ t: 0, ortam: 'reklam', musteriId: 'a0', segmentId: 's1', tur: 'reklam_goster', veri: { kampanya: 'baska' } });
    return { gunluk, girdiler };
  }

  it('lift ve GA elle hesaplanan değerlerle tutar', () => {
    const { gunluk, girdiler } = kur();
    const [s1] = hedeflemeRaporu(gunluk, girdiler, seg, 'kasa', k);
    expect(s1!.maruzKalan).toBe(200);
    expect(s1!.kontrol).toBe(100);
    expect(s1!.donusumMaruz).toBeCloseTo(0.2, 10);
    expect(s1!.donusumKontrol).toBeCloseTo(0.1, 10);
    expect(s1!.artisPuan).toBeCloseTo(10, 10);
    // Agresti–Caffo: q1=41/202, q0=11/102
    const q1 = 41 / 202, q0 = 11 / 102;
    const se = Math.sqrt((q1 * (1 - q1)) / 202 + (q0 * (1 - q0)) / 102);
    expect(s1!.artisGuvenAraligi[0]).toBeCloseTo(100 * (q1 - q0 - 1.959964 * se), 6);
    expect(s1!.artisGuvenAraligi[1]).toBeCloseTo(100 * (q1 - q0 + 1.959964 * se), 6);
    expect(s1!.artisGuvenAraligi[0]).toBeGreaterThan(0);
    // 300 TL / (0.1 · 200 = 20 artan dönüşüm) = 15 TL
    expect(s1!.artanDonusumBasinaMaliyetTL).toBeCloseTo(15, 10);
    expect(s1!.tiklamaOrani).toBeCloseTo(0.1, 10);
    expect(s1!.rahatsizlikOrani).toBeCloseTo(0.05, 10);
    expect(s1!.guven).not.toBe('ayirt_edilemiyor');
    expect(s1!.oneri).toBe('hedefle');
  });

  it('n küçükken ayirt_edilemiyor ve kazanan ilan edilmez', () => {
    const { gunluk, girdiler } = kur();
    const s2 = hedeflemeRaporu(gunluk, girdiler, seg, 'kasa', k).find((s) => s.segmentId === 's2')!;
    expect(s2.artisPuan).toBeCloseTo(30, 10);
    expect(s2.guven).toBe('ayirt_edilemiyor');
    expect(s2.oneri).toBe('dene');
    expect(s2.artanDonusumBasinaMaliyetTL).toBe(0); // s2'de gösterim olayı yok → maliyet 0
  });

  it('rahatsızlık eşiği aşılırsa kacin; lift ≤ 0 ise hedefleme', () => {
    const { gunluk, girdiler } = kur();
    const esik = { rahatsizlikDusuk: 0.02, rahatsizlikKacin: 0.04, grupAsgariN: 30, asgariDonusum: 5 };
    expect(hedeflemeRaporu(gunluk, girdiler, seg, 'kasa', k, esik)[0]!.oneri).toBe('kacin');
    // grupları ters çevir: reklam dönüşümü düşürüyor gibi
    const ters = girdiler.map((g) =>
      g.reklamKaynagi === 'k' ? { ...g, reklamKaynagi: kontrolEtiketi('k') } : g.reklamKaynagi === kontrolEtiketi('k') ? { ...g, reklamKaynagi: 'k' } : g,
    );
    const s1 = hedeflemeRaporu(gunluk, ters, seg, 'kasa', k)[0]!;
    expect(s1.artisPuan).toBeCloseTo(-10, 10);
    expect(s1.artanDonusumBasinaMaliyetTL).toBeNull();
    expect(['hedefleme', 'kacin']).toContain(s1.oneri);
  });

  it('oranFarkiGA sıfır farkta sıfırı kapsar', () => {
    const [a, b] = oranFarkiGA(10, 100, 10, 100);
    expect(a).toBeLessThan(0);
    expect(b).toBeGreaterThan(0);
  });

  it('rapor ve metin kişi kimliği içermez (ADR-002), ayırt edilemeyen gizlenmez', () => {
    const { gunluk, girdiler } = kur();
    const satirlar = hedeflemeRaporu(gunluk, girdiler, seg, 'kasa', k);
    const json = JSON.stringify(satirlar);
    const metin = raporMetni(satirlar, k);
    for (const id of ['a0', 'c0', 'b0', 'd0', 'o1']) {
      expect(json).not.toMatch(new RegExp(`"${id}"`));
      expect(metin).not.toMatch(new RegExp(`\\b${id}\\b`));
    }
    expect(metin).toContain('ayırt edilemiyor');
    expect(metin).toContain('Gerekçe');
    expect(metin).toContain('Kanıt');
    expect(metin).toMatch(/\[\+[\d,]+; \+[\d,]+\]/);
  });

  it('uçtan uca: simüle nüfusta rapor her hedef segmente satır üretir', () => {
    const rng = new Rng(21);
    const m = nufusUret(6000, oncul, TURKIYE_SEGMENTLERI, rng);
    const gunluk = new OlayGunlugu();
    const kk = ORNEK_KAMPANYALAR[0]!;
    const r = kampanyaUygula(m, { ...kk, butceTL: 1e6 }, rng, gunluk);
    donusumUret(r.girdiler, gunluk, rng);
    const satirlar = hedeflemeRaporu(gunluk, r.girdiler, TURKIYE_SEGMENTLERI, 'satin_al', kk);
    expect(satirlar.length).toBe(TURKIYE_SEGMENTLERI.length);
    expect(raporMetni(satirlar, kk)).toContain(TURKIYE_SEGMENTLERI[0]!.ad);
    expect(satirlar.some((s) => s.artisPuan > 0)).toBe(true);
  });
});
