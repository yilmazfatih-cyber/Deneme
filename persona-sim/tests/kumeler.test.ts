import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { onculSec, TURKIYE_SEGMENTLERI, nufusUret } from '../src/core';
import { kumele, kumeAta, musteriOzellikleri } from '../src/kalibrasyon/kumeler';
import type { PosKaydi } from '../src/kalibrasyon/pos';
import { hedefteMi } from '../src/reklam/kampanya';
import { ORNEK_KAMPANYALAR } from '../src/reklam';

function sentetik(rng: Rng, gruplar: { n: number; ziyaret: number; sepet: number; kampanya: number }[]): PosKaydi[] {
  const k: PosKaydi[] = [];
  let id = 0;
  for (const g of gruplar) {
    for (let i = 0; i < g.n; i++) {
      const mid = `m${id++}`;
      const fis = Math.max(2, Math.round(rng.normal(g.ziyaret * 3, 1)));
      for (let f = 0; f < fis; f++) {
        const gun = 1 + rng.int(85);
        k.push({ musteriId: mid, magazaId: 'M1', tarih: `2026-${String(8 + Math.floor(gun / 30)).padStart(2, '0')}-${String((gun % 28) + 1).padStart(2, '0')}`,
          tutarTL: rng.lognormal(Math.log(g.sepet), 0.3), kampanya: rng.bernoulli(g.kampanya) });
      }
    }
  }
  return k;
}

describe('Kaynak B kümeleri', () => {
  const rng = new Rng(5);
  const kayitlar = sentetik(rng, [
    { n: 150, ziyaret: 1, sepet: 250, kampanya: 0.5 },
    { n: 150, ziyaret: 2, sepet: 900, kampanya: 0.1 },
    { n: 150, ziyaret: 4, sepet: 400, kampanya: 0.15 },
  ]);
  it('özellikler kimliksiz ve tek fişli müşteriyi dışarıda bırakır', () => {
    const { ozellikler, disi } = musteriOzellikleri([...kayitlar, { magazaId: 'M1', tarih: '2026-09-01', tutarTL: 100 }, { musteriId: 'tek', magazaId: 'M1', tarih: '2026-09-01', tutarTL: 100 }]);
    expect(ozellikler.length).toBe(450);
    expect(disi).toBe(2);
  });
  it('üç belirgin grubu bulur, adlar nötr ve kodludur', () => {
    const s = kumele(kayitlar, { k: 3, seed: 3 });
    expect(s.kumeler.length).toBe(3);
    for (const km of s.kumeler) {
      expect(km.n).toBeGreaterThanOrEqual(50);
      expect(km.ad).toMatch(/^K\d · /);
      expect(km.ad).not.toMatch(/dürtüsel|zayıf|kolay/);
    }
    const sepetler = s.kumeler.map((k) => k.merkez.sepetMedyanTL);
    expect(sepetler[0]!).toBeLessThan(sepetler[2]!);
    expect(s.kumeler[0]!.ad).toContain('kampanya günlerini tercih eden');
  });
  it('asgari N altında küme üretmez', () => {
    const az = sentetik(new Rng(1), [{ n: 40, ziyaret: 2, sepet: 300, kampanya: 0.2 }]);
    const s = kumele(az);
    expect(s.kumeler.length).toBe(0);
    expect(s.uyarilar[0]).toContain('en az');
  });
  it('küme ataması payları korur ve bütçeyi ölçekler', () => {
    const s = kumele(kayitlar, { k: 3, seed: 3 });
    const m = nufusUret(3000, onculSec('S1'), TURKIYE_SEGMENTLERI, new Rng(9));
    const once = m.reduce((a, x) => a + x.theta.butce, 0) / m.length;
    kumeAta(m, s.kumeler, new Rng(2));
    const sayim: Record<string, number> = {};
    for (const x of m) sayim[x.kumeId!] = (sayim[x.kumeId!] ?? 0) + 1;
    for (const km of s.kumeler) expect(Math.abs(sayim[km.id]! / 3000 - km.pay)).toBeLessThan(0.05);
    const buyuk = m.filter((x) => x.kumeId === 'K3').reduce((a, x) => a + x.theta.butce, 0) / sayim['K3']!;
    const kucuk = m.filter((x) => x.kumeId === 'K1').reduce((a, x) => a + x.theta.butce, 0) / sayim['K1']!;
    expect(buyuk).toBeGreaterThan(kucuk);
    expect(once).toBeGreaterThan(0);
  });
  it('küme hedefli kampanya kümesiz müşteriyi hedeflemez', () => {
    const k = { ...ORNEK_KAMPANYALAR[0]!, hedefBirimi: 'kume' as const, hedefKumeler: ['K1'] };
    expect(hedefteMi(k, 'genc_dusuk', 'K1')).toBe(true);
    expect(hedefteMi(k, 'genc_dusuk', 'K2')).toBe(false);
    expect(hedefteMi(k, 'genc_dusuk')).toBe(false);
  });
});
