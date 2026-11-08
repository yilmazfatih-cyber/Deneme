import { describe, expect, it } from 'vitest';
import { Rng, OlayGunlugu, nufusUret, onculSec, TURKIYE_SEGMENTLERI } from '../src/core';
import { MagazaOrtami, VARSAYILAN_DUZEN, type MagazaAyarlari } from '../src/magaza';

const TABAN: MagazaAyarlari = { varisHiziDkBasina: 2, kasaSayisi: 2, kasaIslemSuresiSn: 45 };

function kos(ayar: MagazaAyarlari, seed = 1, opts: { niyet?: number; saat?: number; n?: number } = {}) {
  const r = new Rng(seed);
  const girdiler = nufusUret(opts.n ?? 400, onculSec('S1'), TURKIYE_SEGMENTLERI, r).map((musteri) => ({ musteri, niyet: opts.niyet ?? 0.3 }));
  const o = new MagazaOrtami(VARSAYILAN_DUZEN, ayar);
  const g = new OlayGunlugu();
  o.baslat(girdiler, { seed, sureSaniye: (opts.saat ?? 4) * 3600, hiz: 1 }, g, r);
  while (!o.bittiMi()) o.adim(1);
  return { o, g, k: o.kpi() };
}

const medyan = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1] ?? 0;
};

describe('mağaza ortamı', () => {
  it('(1) aynı seed aynı KPI ve aynı olay dizisi; farklı seed farklı', () => {
    const a = kos(TABAN, 11);
    const b = kos(TABAN, 11);
    const c = kos(TABAN, 12);
    expect(a.k).toEqual(b.k);
    expect(a.g.liste().length).toBe(b.g.liste().length);
    expect(a.g.liste().slice(0, 200)).toEqual(b.g.liste().slice(0, 200));
    expect(c.k).not.toEqual(a.k);
    expect(a.k['ziyaret']).toBeGreaterThan(100);
  });

  it('(2) kampanyalı kategorinin satışı kampanyasızdan yüksek', () => {
    const kampanya = { kategoriler: ['atistirmalik'], indirimOrani: 0.25, kitlikMesaji: true, promosyonAdasinda: true };
    let kampsiz = 0;
    let kampli = 0;
    for (const seed of [1, 2, 3]) {
      kampsiz += kos(TABAN, seed).o.kategoriSatislari()['atistirmalik']?.adet ?? 0;
      kampli += kos({ ...TABAN, kampanya }, seed).o.kategoriSatislari()['atistirmalik']?.adet ?? 0;
    }
    expect(kampli).toBeGreaterThan(kampsiz * 1.15);
  });

  it('(3) kasa sayısı 1→3 kuyruk terk oranını düşürür', () => {
    const tek = kos({ ...TABAN, kasaSayisi: 1, kasaIslemSuresiSn: 60 }, 4);
    const uc = kos({ ...TABAN, kasaSayisi: 3, kasaIslemSuresiSn: 60 }, 4);
    expect(tek.k['terkOrani']!).toBeGreaterThan(0.1);
    expect(uc.k['terkOrani']!).toBeLessThan(tek.k['terkOrani']! / 3);
    expect(uc.k['kuyrukOrt']!).toBeLessThan(tek.k['kuyrukOrt']!);
    expect(tek.g.say('terk', 'magaza')).toBe(tek.k['terk']);
    expect(tek.g.say('surtunme', 'magaza')).toBeGreaterThan(0);
  });

  it('(4) gercekSepetMedyaniTL verilince sepet ona yaklaşır', () => {
    for (const hedef of [250, 1500]) {
      const { o, k } = kos({ ...TABAN, gercekSepetMedyaniTL: hedef }, 5);
      const med = medyan(o.fisler().map((f) => f.tutar));
      // medyan medyana kalibre edilir (±%30); ortalama sağa çarpık dağılım yüzünden medyanın üstündedir
      expect(med).toBeGreaterThan(hedef * 0.7);
      expect(med).toBeLessThan(hedef * 1.3);
      expect(k['ortSepetTL']!).toBeGreaterThan(hedef * 0.7);
      expect(k['ortSepetTL']!).toBeLessThan(hedef * 1.8);
    }
  });

  it('(5) bölge sayımları ziyaretle tutarlı', () => {
    const { o, g, k } = kos(TABAN, 6);
    const b = Object.fromEntries(o.bolgeSayimlari().map((x) => [x.bolgeId, x]));
    expect(Object.keys(b).sort()).toEqual(['giris', 'kasa_onu', 'koridor_a', 'koridor_b', 'koridor_c', 'promosyon']);
    expect(b['giris']!.tekil).toBe(k['ziyaret']);
    expect(b['kasa_onu']!.tekil).toBeGreaterThanOrEqual(k['fisSayisi']!);
    let toplam = 0;
    for (const x of Object.values(b)) {
      expect(x.tekil).toBeLessThanOrEqual(k['ziyaret']!);
      expect(x.toplam).toBeGreaterThanOrEqual(x.tekil);
      expect(x.anlik).toBe(0); // simülasyon bitti, herkes çıktı
      if (x.toplam > 0) expect(x.ortBeklemeSn).toBeGreaterThan(0);
      toplam += x.toplam;
    }
    expect(toplam).toBe(g.say('bolge', 'magaza'));
    expect(g.say('giris', 'magaza')).toBe(k['ziyaret']);
    expect(g.say('cikis', 'magaza')).toBe(k['ziyaret']);
    expect(g.say('kasa', 'magaza')).toBe(o.fisler().length);
  });

  it('(6) bütçe aşılmıyor; aşım olursa en düşük faydalı ürün çıkarılıyor', () => {
    for (const ayar of [TABAN, { ...TABAN, gercekSepetMedyaniTL: 300 }]) {
      const { g } = kos(ayar, 7, { niyet: 0.9 });
      const kasalar = g.filtrele((x) => x.tur === 'kasa');
      expect(kasalar.length).toBeGreaterThan(50);
      for (const x of kasalar) expect(x.veri!['tutar'] as number).toBeLessThanOrEqual((x.veri!['butce'] as number) + 0.01);
    }
    // ölçeksiz koşuda sınır θ.butce'nin kendisidir
    const r = new Rng(8);
    const girdiler = nufusUret(300, onculSec('S1'), TURKIYE_SEGMENTLERI, r).map((musteri) => ({ musteri, niyet: 1 }));
    const butce = new Map(girdiler.map((m) => [m.musteri.id, m.musteri.theta.butce]));
    const o = new MagazaOrtami(VARSAYILAN_DUZEN, TABAN);
    const g = new OlayGunlugu();
    o.baslat(girdiler, { seed: 8, sureSaniye: 3 * 3600, hiz: 1 }, g, r);
    while (!o.bittiMi()) o.adim(0.5);
    for (const x of g.filtrele((e) => e.tur === 'kasa')) {
      const id = x.musteriId.split('#')[0]!;
      expect(x.veri!['tutar'] as number).toBeLessThanOrEqual(butce.get(id)! + 0.01);
    }
    expect(g.say('sepetten_cikar', 'magaza')).toBeGreaterThan(0);
  });

  it('(7) kamera giriş sayımı varışı kalibre eder', () => {
    const { k } = kos({ ...TABAN, gercekBolgeSayimlari: { giris: 150 } }, 9, { saat: 3 });
    expect(k['ziyaret']!).toBeGreaterThan(450 * 0.8);
    expect(k['ziyaret']!).toBeLessThan(450 * 1.2);
  });
});
