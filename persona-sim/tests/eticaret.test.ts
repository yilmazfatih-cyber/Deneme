import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { onculSec } from '../src/core/parametreler';
import { TURKIYE_SEGMENTLERI, nufusUret } from '../src/core/nufus';
import { OlayGunlugu } from '../src/core/olay';
import type { MusteriGirdisi } from '../src/core/arayuz';
import { EticaretOrtami, VARSAYILAN_VARYANT, VARYANT_B, type SiteVaryanti } from '../src/eticaret';

function girdiler(n: number, seed: number): MusteriGirdisi[] {
  const r = new Rng(seed);
  const nufus = nufusUret(n, onculSec('S1'), TURKIYE_SEGMENTLERI, r);
  return nufus.map((musteri) => {
    const reklam = r.bernoulli(0.35);
    return reklam ? { musteri, niyet: 0.3 + 0.6 * r.next(), reklamKaynagi: 'sosyal' } : { musteri, niyet: 0 };
  });
}

function kos(varyant: SiteVaryanti, seed = 11, n = 4000) {
  const ortam = new EticaretOrtami(varyant);
  const gunluk = new OlayGunlugu();
  ortam.baslat(girdiler(n, seed), { seed, sureSaniye: 1800, hiz: 1 }, gunluk, new Rng(seed + 1));
  let guvenlik = 0;
  while (!ortam.bittiMi() && guvenlik++ < 100000) ortam.adim(1);
  return { ortam, gunluk, kpi: ortam.kpi(), huni: ortam.huni() };
}

const terkOrani = (huni: { asama: string; giren: number; terk: number }[], asama: string): number => {
  const s = huni.find((x) => x.asama === asama)!;
  return s.giren > 0 ? s.terk / s.giren : 0;
};

describe('e-ticaret hunisi', () => {
  it('aynı seed aynı KPI', () => {
    const a = kos(VARSAYILAN_VARYANT, 5, 800);
    const b = kos(VARSAYILAN_VARYANT, 5, 800);
    expect(a.kpi).toEqual(b.kpi);
    expect(a.gunluk.liste().length).toBe(b.gunluk.liste().length);
    expect(a.ortam.bittiMi()).toBe(true);
  });

  it('kargo ücreti ödemede görünürse ödeme terki, ürün sayfasında görünene göre yüksek', () => {
    const odeme = kos({ ...VARSAYILAN_VARYANT, kargoUcretiNeredeGorunur: 'odeme' });
    const urun = kos({ ...VARSAYILAN_VARYANT, kargoUcretiNeredeGorunur: 'urun' });
    expect(terkOrani(odeme.huni, 'odeme')).toBeGreaterThan(terkOrani(urun.huni, 'odeme'));
  });

  it('yükleme süresi 0.5 → 8 sn dönüşümü düşürür', () => {
    const hizli = kos({ ...VARSAYILAN_VARYANT, yuklemeSuresiSn: 0.5 });
    const yavas = kos({ ...VARSAYILAN_VARYANT, yuklemeSuresiSn: 8 });
    expect(yavas.kpi['donusum']!).toBeLessThan(hizli.kpi['donusum']!);
    expect(yavas.gunluk.filtrele((o) => o.tur === 'surtunme' && o.veri?.['neden'] === 'yavas_yukleme').length).toBeGreaterThan(0);
  });

  it('liste seçenek sayısı 6 → 60 liste terkini artırır', () => {
    const az = kos({ ...VARSAYILAN_VARYANT, urunSayisiListe: 6 });
    const cok = kos({ ...VARSAYILAN_VARYANT, urunSayisiListe: 60 });
    expect(terkOrani(cok.huni, 'liste')).toBeGreaterThan(terkOrani(az.huni, 'liste'));
  });

  it('güven rozeti + puan gösterimi dönüşümü artırır', () => {
    const yok = kos({ ...VARSAYILAN_VARYANT, guvenRozeti: false, puanGoster: false });
    const var_ = kos({ ...VARSAYILAN_VARYANT, guvenRozeti: true, puanGoster: true });
    expect(var_.kpi['donusum']!).toBeGreaterThan(yok.kpi['donusum']!);
  });

  it('huni tutarlı: giren = sonraki giren + terk', () => {
    for (const v of [VARSAYILAN_VARYANT, VARYANT_B]) {
      const { huni, kpi, gunluk } = kos(v, 3, 1500);
      for (let k = 0; k < huni.length - 1; k++) {
        expect(huni[k]!.giren).toBe(huni[k + 1]!.giren + huni[k]!.terk);
        expect(huni[k]!.cikan).toBe(huni[k + 1]!.giren);
      }
      expect(huni[5]!.giren).toBe(gunluk.say('satin_al', 'eticaret'));
      expect(kpi['ziyaret']).toBe(gunluk.say('giris', 'eticaret'));
      expect(gunluk.say('cikis')).toBe(gunluk.say('giris'));
    }
  });
});
