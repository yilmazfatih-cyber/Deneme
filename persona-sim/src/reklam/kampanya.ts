/**
 * Reklam kampanyası uygulama — hedef segmentlere gösterim, kontrol grubu (ghost-ads / holdout), bütçe.
 * Tepki modeli core `reklamTepkisi`dir; burada yalnız gösterim dağıtımı, bütçe ve olay kaydı yapılır.
 * ADR-002: hedefleme yalnız segment düzeyinde; kişiye özel karar verilmez, müşteri kimliği yalnız olay günlüğünde (iç) kalır.
 */
import type { Musteri } from '../core/nufus';
import type { Reklam } from '../core/karar';
import { reklamTepkisi } from '../core/karar';
import type { OlayGunlugu } from '../core/olay';
import type { MusteriGirdisi } from '../core/arayuz';
import type { Rng } from '../core/rng';

export interface Kampanya {
  ad: string;
  kanal: Reklam['kanal'];
  yaratici: Reklam['yaratici'];
  belirginlik: number;
  indirimOrani?: number;
  /** 0–1 */
  kisisellestirme?: number;
  hedefSegmentler: string[] | 'hepsi';
  /** Hedef birimi: sosyolojik segment (varsayılan) veya Kaynak B davranış kümesi (ADR-006). */
  hedefBirimi?: 'segment' | 'kume';
  /** hedefBirimi 'kume' ise: küme kimlikleri; kümesi olmayan müşteri (Kaynak B yoksa) hedef dışıdır */
  hedefKumeler?: string[] | 'hepsi';
  /** kişi başı ortalama gösterim (Poisson) */
  ortalamaMaruziyet: number;
  butceTL: number;
  /** 1000 gösterim maliyeti (CPM) */
  bin_maliyetiTL: number;
  /** 0–1, reklamı görmeyen holdout payı (ghost-ads mantığı) */
  kontrolGrubuOrani: number;
}

export interface KampanyaSonucu {
  girdiler: MusteriGirdisi[];
  /** en az bir gösterim alan müşteri sayısı */
  maruzKalan: number;
  gosterim: number;
  /** tıklayan müşteri sayısı (tekil) */
  tiklama: number;
  /** en az bir kez rahatsız olan müşteri sayısı (tekil) */
  rahatsiz: number;
  harcananTL: number;
}

/** Niyet tavanı (core `niyetArtisi` tavanıyla aynı). */
export const NIYET_TAVANI = 0.6;
/** Rahatsız olan müşterinin niyetine uygulanan çarpan (varsayım). */
export const RAHATSIZ_NIYET_CARPANI = 0.4;
/** Kişi başı gösterim sınırı (sıklık tavanı; Poisson kuyruğunu keser). */
export const KISI_BASI_GOSTERIM_TAVANI = 30;

export const kontrolEtiketi = (ad: string): string => `kontrol:${ad}`;

/** Poisson(λ) — Knuth; λ küçük (kişi başı gösterim) olduğundan yeterli. Core Rng'de yok (NOTLAR.md). */
export function poisson(rng: Rng, lambda: number): number {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.next();
  } while (p > L);
  return k - 1;
}

export function hedefteMi(kampanya: Kampanya, segmentId: string, kumeId?: string): boolean {
  if (kampanya.hedefBirimi === 'kume') {
    if (kumeId === undefined) return false;
    const h = kampanya.hedefKumeler ?? 'hepsi';
    return h === 'hepsi' || h.includes(kumeId);
  }
  return kampanya.hedefSegmentler === 'hepsi' || kampanya.hedefSegmentler.includes(segmentId);
}

/** Raporlama/hedefleme için müşterinin grup anahtarı. */
export function grupAnahtari(kampanya: Kampanya, m: Musteri): string | undefined {
  return kampanya.hedefBirimi === 'kume' ? m.kumeId : m.segmentId;
}

function reklamNesnesi(k: Kampanya, maruziyetSayisi: number): Reklam {
  const r: Reklam = { kanal: k.kanal, yaratici: k.yaratici, belirginlik: k.belirginlik, maruziyetSayisi };
  if (k.indirimOrani !== undefined) r.indirimOrani = k.indirimOrani;
  if (k.kisisellestirme !== undefined) r.kisisellestirme = k.kisisellestirme;
  return r;
}

/**
 * Kampanyayı nüfusa uygular. Hedef segmentteki her müşteri önce kontrol/maruz grubuna rastgele atanır (atama bütçeden
 * bağımsızdır, böylece karşılaştırma niyet-tedavi (ITT) olarak yansızdır). Maruz gruptakilere Poisson sayıda gösterim yapılır;
 * bütçe biterse gösterim durur. Bütçenin belirli müşteri sırasına (dolayısıyla segmente) yığılmaması için gösterim sırası karıştırılır.
 */
export function kampanyaUygula(
  musteriler: Musteri[],
  kampanya: Kampanya,
  rng: Rng,
  gunluk: OlayGunlugu,
): KampanyaSonucu {
  const birimMaliyet = kampanya.bin_maliyetiTL / 1000;
  const girdiler: MusteriGirdisi[] = musteriler.map((m) => ({ musteri: m, niyet: 0 }));

  // 1) Atama: kontrol / maruz (bütçeden önce, tüm hedef kitle için)
  const maruzIndisler: number[] = [];
  musteriler.forEach((m, i) => {
    if (!hedefteMi(kampanya, m.segmentId, m.kumeId)) return; // organik: reklamKaynagi yok
    if (rng.bernoulli(kampanya.kontrolGrubuOrani)) {
      girdiler[i] = { musteri: m, niyet: 0, reklamKaynagi: kontrolEtiketi(kampanya.ad) };
    } else {
      girdiler[i] = { musteri: m, niyet: 0, reklamKaynagi: kampanya.ad };
      maruzIndisler.push(i);
    }
  });

  // 2) Gösterim sırası karıştırılır (Fisher–Yates)
  for (let i = maruzIndisler.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const a = maruzIndisler[i]!;
    maruzIndisler[i] = maruzIndisler[j]!;
    maruzIndisler[j] = a;
  }

  let gosterim = 0, maruzKalan = 0, tiklama = 0, rahatsiz = 0, harcananTL = 0;
  let butceBitti = false;
  for (const i of maruzIndisler) {
    const m = musteriler[i]!;
    const k = Math.min(KISI_BASI_GOSTERIM_TAVANI, poisson(rng, kampanya.ortalamaMaruziyet));
    let niyet = 0;
    let gordu = false, tikladi = false, rahatsizOldu = false;
    for (let j = 1; j <= k; j++) {
      if (butceBitti || harcananTL + birimMaliyet > kampanya.butceTL + 1e-9) {
        butceBitti = true;
        break;
      }
      harcananTL += birimMaliyet;
      gosterim++;
      gordu = true;
      const veri = { kampanya: kampanya.ad, maruziyet: j, kanal: kampanya.kanal };
      const ortak = { t: 0, ortam: 'reklam' as const, musteriId: m.id, segmentId: m.segmentId };
      gunluk.ekle({ ...ortak, tur: 'reklam_goster', veri });
      const tepki = reklamTepkisi(m.theta, reklamNesnesi(kampanya, j));
      niyet += tepki.niyetArtisi;
      if (!rng.bernoulli(tepki.farkEtti)) continue;
      gunluk.ekle({ ...ortak, tur: 'reklam_fark', veri });
      if (rng.bernoulli(tepki.tiklama)) {
        gunluk.ekle({ ...ortak, tur: 'reklam_tikla', veri });
        tikladi = true;
      }
      if (rng.bernoulli(tepki.rahatsizlik)) {
        gunluk.ekle({ ...ortak, tur: 'reklam_rahatsiz', veri });
        rahatsizOldu = true;
      }
    }
    niyet = Math.min(NIYET_TAVANI, niyet);
    if (rahatsizOldu) niyet *= RAHATSIZ_NIYET_CARPANI;
    girdiler[i] = { musteri: m, niyet, reklamKaynagi: kampanya.ad };
    if (gordu) maruzKalan++;
    if (tikladi) tiklama++;
    if (rahatsizOldu) rahatsiz++;
  }

  return { girdiler, maruzKalan, gosterim, tiklama, rahatsiz, harcananTL };
}

export const ORNEK_KAMPANYALAR: Kampanya[] = [
  {
    ad: 'Hafta sonu %25 indirim', kanal: 'sosyal', yaratici: 'indirim', belirginlik: 0.6, indirimOrani: 0.25,
    hedefSegmentler: 'hepsi', ortalamaMaruziyet: 4, butceTL: 60, bin_maliyetiTL: 35, kontrolGrubuOrani: 0.2,
  },
  {
    ad: 'Aile anları videosu', kanal: 'video', yaratici: 'duygusal', belirginlik: 0.8,
    hedefSegmentler: ['ebeveyn_orta', 'ebeveyn_dusuk', 'orta_yas_orta'], ortalamaMaruziyet: 3, butceTL: 80, bin_maliyetiTL: 90,
    kontrolGrubuOrani: 0.2,
  },
  {
    ad: 'Çok satanlar (uygulama içi)', kanal: 'uygulama_ici', yaratici: 'sosyal_kanit', belirginlik: 0.5, kisisellestirme: 0.5,
    hedefSegmentler: ['genc_dusuk', 'genc_profesyonel'], ortalamaMaruziyet: 6, butceTL: 40, bin_maliyetiTL: 20,
    kontrolGrubuOrani: 0.15,
  },
  {
    ad: 'Son 48 saat (e-posta)', kanal: 'eposta', yaratici: 'kitlik', belirginlik: 0.4, kisisellestirme: 0.3,
    hedefSegmentler: 'hepsi', ortalamaMaruziyet: 2, butceTL: 15, bin_maliyetiTL: 5, kontrolGrubuOrani: 0.25,
  },
];
