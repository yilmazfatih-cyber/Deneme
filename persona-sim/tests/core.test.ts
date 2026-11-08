import { describe, expect, it } from 'vitest';
import { Rng, clamp } from '../src/core/rng';
import { PARAMETRE_ADLARI, S0_DUNYA, onculSec, thetaOrnekle, thetaMedyan } from '../src/core/parametreler';
import { TURKIYE_SEGMENTLERI, nufusUret } from '../src/core/nufus';
import { fayda, satinAlmaOlasiligi, reklamTepkisi, secimOlasiliklari, terkOlasiligi } from '../src/core/karar';

describe('rng', () => {
  it('aynı tohum aynı dizi', () => {
    const a = new Rng(42), b = new Rng(42);
    expect([a.next(), a.next(), a.normal()]).toEqual([b.next(), b.next(), b.normal()]);
  });
  it('lognormal medyanı yaklaşık exp(mu)', () => {
    const r = new Rng(1);
    const xs = Array.from({ length: 4000 }, () => r.lognormal(Math.log(1.5), 0.3)).sort((x, y) => x - y);
    expect(xs[2000]!).toBeGreaterThan(1.4);
    expect(xs[2000]!).toBeLessThan(1.6);
  });
});

describe('öncüller', () => {
  it('her parametre S0 içinde tanımlı ve sınırlar içinde örneklenir', () => {
    const r = new Rng(7);
    for (let i = 0; i < 200; i++) {
      const th = thetaOrnekle(S0_DUNYA, r);
      for (const p of PARAMETRE_ADLARI) {
        const d = S0_DUNYA.parametreler[p];
        expect(th[p]).toBeGreaterThanOrEqual(d.min ?? -Infinity);
        expect(th[p]).toBeLessThanOrEqual(d.max ?? Infinity);
      }
    }
  });
  it('S1 Türkiye güven işaretini ve fiyat duyarlılığını yukarı kaydırır', () => {
    const s0 = thetaMedyan(onculSec('S0')), s1 = thetaMedyan(onculSec('S1'));
    expect(s1.phi_guven_isareti).toBeGreaterThan(s0.phi_guven_isareti);
    expect(s1.eta_fiyat).toBeGreaterThan(s0.eta_fiyat);
    expect(s1.beta_simdicilik).toBeLessThan(s0.beta_simdicilik);
  });
});

describe('nüfus', () => {
  it('segment payları yaklaşık korunur ve düşük gelir bütçesi düşüktür', () => {
    const r = new Rng(3);
    const m = nufusUret(3000, onculSec('S1'), TURKIYE_SEGMENTLERI, r);
    const sayim: Record<string, number> = {};
    for (const x of m) sayim[x.segmentId] = (sayim[x.segmentId] ?? 0) + 1;
    expect((sayim['ebeveyn_orta'] ?? 0) / 3000).toBeGreaterThan(0.15);
    const ort = (id: string) => { const g = m.filter((x) => x.segmentId === id); return g.reduce((a, x) => a + x.theta.butce, 0) / g.length; };
    expect(ort('genc_dusuk')).toBeLessThan(ort('orta_yas_yuksek'));
  });
});

describe('karar', () => {
  const th = thetaMedyan(onculSec('S1'));
  it('fiyat artınca satın alma olasılığı düşer', () => {
    expect(satinAlmaOlasiligi(th, { fiyat: 200, ilgi: 0.6 })).toBeGreaterThan(satinAlmaOlasiligi(th, { fiyat: 2000, ilgi: 0.6 }));
  });
  it('ek ücret sürprizi faydayı düşürür, güven işareti yükseltir', () => {
    const taban = fayda(th, { fiyat: 500 });
    expect(fayda(th, { fiyat: 500, ekUcret: 60 })).toBeLessThan(taban);
    expect(fayda(th, { fiyat: 500, guvenIsareti: true })).toBeGreaterThan(taban);
  });
  it('kayıp çerçevesi kazanç çerçevesinden daha güçlü (λ>1)', () => {
    const kazanc = fayda(th, { fiyat: 90, referansFiyat: 100 }) - fayda(th, { fiyat: 100, referansFiyat: 100 });
    const kayip = fayda(th, { fiyat: 100, referansFiyat: 100 }) - fayda(th, { fiyat: 110, referansFiyat: 100 });
    expect(kayip).toBeGreaterThan(kazanc);
  });
  it('softmax olasılıkları 1 eder', () => {
    const p = secimOlasiliklari(th, [{ fiyat: 100 }, { fiyat: 120, puan: 4.8 }, { fiyat: 90, yeni: true }]);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });
  it('bekleme uzadıkça terk olasılığı artar', () => {
    expect(terkOlasiligi(th, 300, 0, 1)).toBeGreaterThan(terkOlasiligi(th, 10, 0, 1));
  });
  it('reklam: tekrar maruziyet fark etmeyi düşürür, indirim yaratıcı fiyat duyarlıda daha çok tıklanır', () => {
    const a = reklamTepkisi(th, { kanal: 'sosyal', yaratici: 'indirim', belirginlik: 0.6, maruziyetSayisi: 1, indirimOrani: 0.3 });
    const b = reklamTepkisi(th, { kanal: 'sosyal', yaratici: 'indirim', belirginlik: 0.6, maruziyetSayisi: 12, indirimOrani: 0.3 });
    expect(b.farkEtti).toBeLessThan(a.farkEtti);
    const duyarli = { ...th, eta_fiyat: th.eta_fiyat * 1.5 };
    expect(reklamTepkisi(duyarli, { kanal: 'sosyal', yaratici: 'indirim', belirginlik: 0.6, maruziyetSayisi: 1, indirimOrani: 0.3 }).tiklama).toBeGreaterThan(a.tiklama);
  });
  it('clamp', () => expect(clamp(5, 0, 1)).toBe(1));
});
