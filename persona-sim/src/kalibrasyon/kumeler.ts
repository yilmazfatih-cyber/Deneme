/**
 * Kaynak B davranış kümeleri (ADR-006): şirketin fiş verisinden, kişi değil küme düzeyinde hedefleme birimi.
 * Özellikler yalnız davranıştan: ziyaret sıklığı, sepet medyanı, kampanya günlerine duyarlılık. Demografi yok.
 * Kurallar: küme en az `asgariN` müşteri (07 §3.4, 06 §3.3); ad = kod + nötr betimleme (F-17); zaaf çağrıştıran sıfat yok.
 */
import type { ParametreAdi } from '../core/parametreler';
import type { Musteri } from '../core/nufus';
import { Rng, clamp } from '../core/rng';
import type { PosKaydi } from './pos';

export interface MusteriOzellik {
  musteriId: string;
  fisSayisi: number;
  ziyaretAyda: number;
  sepetMedyanTL: number;
  /** kampanya günü fişlerinin payı (0–1) */
  kampanyaPayi: number;
}

export interface KumeMerkezi {
  ziyaretAyda: number;
  sepetMedyanTL: number;
  kampanyaPayi: number;
}

export interface KaynakBKume {
  id: string;
  /** "K1 · sık gelen, küçük sepet, kampanyaya duyarlı" */
  ad: string;
  n: number;
  pay: number;
  merkez: KumeMerkezi;
  /** simülasyon nüfusuna aktarılırken θ medyan çarpanları */
  thetaCarpanlari: Partial<Record<ParametreAdi, number>>;
  guven: 'yuksek' | 'orta' | 'dusuk';
  /** müşteri takma adları dışa verilmez; yalnız sayı */
}

export interface KumeSonucu {
  kumeler: KaynakBKume[];
  genel: KumeMerkezi & { musteriSayisi: number; kampanyaGunuPayi: number };
  /** kimliksiz fişler ve 2'den az fişi olan müşteriler kümelemeye girmez */
  disiBirakilan: number;
  uyarilar: string[];
}

function medyan(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function musteriOzellikleri(kayitlar: PosKaydi[]): { ozellikler: MusteriOzellik[]; disi: number; kampanyaGunuPayi: number } {
  const grup = new Map<string, PosKaydi[]>();
  let disi = 0;
  let kampanyaFis = 0;
  for (const k of kayitlar) {
    if (k.kampanya) kampanyaFis++;
    if (!k.musteriId) { disi++; continue; }
    const l = grup.get(k.musteriId) ?? [];
    l.push(k);
    grup.set(k.musteriId, l);
  }
  const ozellikler: MusteriOzellik[] = [];
  for (const [musteriId, fisler] of grup) {
    if (fisler.length < 2) { disi++; continue; }
    const gunler = fisler.map((f) => Date.parse(f.tarih)).filter((x) => Number.isFinite(x));
    const aralikGun = gunler.length >= 2 ? Math.max(30, (Math.max(...gunler) - Math.min(...gunler)) / 86400000 + 30) : 60;
    ozellikler.push({
      musteriId,
      fisSayisi: fisler.length,
      ziyaretAyda: (fisler.length / aralikGun) * 30,
      sepetMedyanTL: medyan(fisler.map((f) => f.tutarTL)),
      kampanyaPayi: fisler.filter((f) => f.kampanya).length / fisler.length,
    });
  }
  return { ozellikler, disi, kampanyaGunuPayi: kayitlar.length ? kampanyaFis / kayitlar.length : 0 };
}

interface Nokta { v: [number, number, number]; i: number }

function uzaklik(a: [number, number, number], b: [number, number, number]): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

/** k-means (k-means++ başlangıç, tohumlu). Girdi z-puanlı 3 boyut. */
function kmeans(noktalar: Nokta[], k: number, rng: Rng, tur = 60): number[] {
  const merkezler: [number, number, number][] = [];
  merkezler.push([...rng.pick(noktalar).v]);
  while (merkezler.length < k) {
    const d = noktalar.map((p) => Math.min(...merkezler.map((m) => uzaklik(p.v, m))));
    const idx = rng.weighted(d.map((x) => x + 1e-9));
    merkezler.push([...noktalar[idx]!.v]);
  }
  let atama = new Array<number>(noktalar.length).fill(0);
  for (let t = 0; t < tur; t++) {
    const yeni = noktalar.map((p) => {
      let en = 0, enU = Infinity;
      merkezler.forEach((m, j) => { const u = uzaklik(p.v, m); if (u < enU) { enU = u; en = j; } });
      return en;
    });
    const degisti = yeni.some((a, i) => a !== atama[i]);
    atama = yeni;
    for (let j = 0; j < k; j++) {
      const uyeler = noktalar.filter((_, i) => atama[i] === j);
      if (uyeler.length === 0) continue;
      merkezler[j] = [0, 1, 2].map((d) => uyeler.reduce((s, p) => s + p.v[d]!, 0) / uyeler.length) as [number, number, number];
    }
    if (!degisti) break;
  }
  return atama;
}

export interface KumelemeSecenekleri { k?: number; seed?: number; asgariN?: number }

export function kumele(kayitlar: PosKaydi[], secenek: KumelemeSecenekleri = {}): KumeSonucu {
  const k = secenek.k ?? 3;
  const asgariN = secenek.asgariN ?? 50;
  const rng = new Rng(secenek.seed ?? 7);
  const { ozellikler, disi, kampanyaGunuPayi } = musteriOzellikleri(kayitlar);
  const uyarilar: string[] = [];
  const genel = {
    ziyaretAyda: medyan(ozellikler.map((o) => o.ziyaretAyda)),
    sepetMedyanTL: medyan(ozellikler.map((o) => o.sepetMedyanTL)),
    kampanyaPayi: medyan(ozellikler.map((o) => o.kampanyaPayi)),
    musteriSayisi: ozellikler.length,
    kampanyaGunuPayi,
  };
  if (ozellikler.length < asgariN * 2) {
    uyarilar.push(`Kümeleme için en az ${asgariN * 2} kimlikli müşteri gerekir; ${ozellikler.length} var. Küme üretilmedi, hedefleme segment düzeyinde kalır.`);
    return { kumeler: [], genel, disiBirakilan: disi, uyarilar };
  }
  // z-puan: log ziyaret, log sepet, kampanya payı
  const ham = ozellikler.map((o) => [Math.log(o.ziyaretAyda + 0.05), Math.log(o.sepetMedyanTL + 1), o.kampanyaPayi] as [number, number, number]);
  const ort = [0, 1, 2].map((d) => ham.reduce((s, v) => s + v[d]!, 0) / ham.length);
  const sd = [0, 1, 2].map((d) => Math.sqrt(ham.reduce((s, v) => s + (v[d]! - ort[d]!) ** 2, 0) / ham.length) || 1);
  const noktalar: Nokta[] = ham.map((v, i) => ({ v: [0, 1, 2].map((d) => (v[d]! - ort[d]!) / sd[d]!) as [number, number, number], i }));
  let atama = kmeans(noktalar, Math.min(k, Math.floor(ozellikler.length / asgariN)), rng);

  // küçük kümeleri en yakın büyük kümeye birleştir (en az asgariN)
  for (let guard = 0; guard < 10; guard++) {
    const sayim = new Map<number, number>();
    for (const a of atama) sayim.set(a, (sayim.get(a) ?? 0) + 1);
    const kucuk = [...sayim.entries()].find(([, n]) => n < asgariN);
    if (!kucuk || sayim.size <= 1) break;
    const [kucukId] = kucuk;
    const merkezOf = (id: number): [number, number, number] => {
      const uy = noktalar.filter((_, i) => atama[i] === id);
      return [0, 1, 2].map((d) => uy.reduce((s, p) => s + p.v[d]!, 0) / uy.length) as [number, number, number];
    };
    const mk = merkezOf(kucukId);
    let hedef = -1, enU = Infinity;
    for (const id of sayim.keys()) { if (id === kucukId) continue; const u = uzaklik(mk, merkezOf(id)); if (u < enU) { enU = u; hedef = id; } }
    atama = atama.map((a) => (a === kucukId ? hedef : a));
    uyarilar.push(`${kucuk[1]} müşterilik küçük küme en yakın kümeyle birleştirildi (asgari ${asgariN}).`);
  }

  const idler = [...new Set(atama)];
  const kumeler: KaynakBKume[] = idler.map((id) => {
    const uy = ozellikler.filter((_, i) => atama[i] === id);
    const merkez: KumeMerkezi = {
      ziyaretAyda: medyan(uy.map((o) => o.ziyaretAyda)),
      sepetMedyanTL: medyan(uy.map((o) => o.sepetMedyanTL)),
      kampanyaPayi: medyan(uy.map((o) => o.kampanyaPayi)),
    };
    return { id: '', ad: '', n: uy.length, pay: uy.length / ozellikler.length, merkez, thetaCarpanlari: {}, guven: uy.length >= 200 ? 'yuksek' : uy.length >= 100 ? 'orta' : 'dusuk' };
  });
  // kararlı sıra: sepet medyanı artan; ad ve çarpanlar
  kumeler.sort((a, b) => a.merkez.sepetMedyanTL - b.merkez.sepetMedyanTL);
  kumeler.forEach((km, i) => {
    km.id = `K${i + 1}`;
    km.ad = `${km.id} · ${kumeBetimle(km.merkez, genel)}`;
    const butce = clamp(km.merkez.sepetMedyanTL / Math.max(1, genel.sepetMedyanTL), 0.3, 3);
    const kampanyaFarki = km.merkez.kampanyaPayi - genel.kampanyaPayi; // + : kampanya günlerine daha çok gelir
    km.thetaCarpanlari = {
      butce,
      eta_fiyat: clamp(1 + kampanyaFarki * 2, 0.6, 1.6),
      sabir: clamp(1 + (km.merkez.ziyaretAyda - genel.ziyaretAyda) * 0.1, 0.8, 1.3),
    };
  });
  return { kumeler, genel, disiBirakilan: disi, uyarilar };
}

/** Nötr betimleme: kod + üç davranış ekseni. Zaaf çağrıştıran sıfat yok (F-17). */
export function kumeBetimle(m: KumeMerkezi, genel: KumeMerkezi): string {
  const sik = m.ziyaretAyda > genel.ziyaretAyda * 1.25 ? 'sık gelen' : m.ziyaretAyda < genel.ziyaretAyda * 0.8 ? 'seyrek gelen' : 'orta sıklıkta gelen';
  const sepet = m.sepetMedyanTL > genel.sepetMedyanTL * 1.25 ? 'büyük sepet' : m.sepetMedyanTL < genel.sepetMedyanTL * 0.8 ? 'küçük sepet' : 'orta sepet';
  const kamp = m.kampanyaPayi > genel.kampanyaPayi + 0.08 ? 'kampanya günlerini tercih eden' : m.kampanyaPayi < genel.kampanyaPayi - 0.08 ? 'kampanyadan bağımsız' : 'kampanyaya nötr';
  return `${sik}, ${sepet}, ${kamp}`;
}

/** Simülasyon nüfusuna küme ataması: küme payına göre örnekle, θ çarpanlarını uygula (A+B birleşimi, ADR-003). */
export function kumeAta(musteriler: Musteri[], kumeler: KaynakBKume[], rng: Rng): void {
  if (kumeler.length === 0) return;
  const paylar = kumeler.map((k) => k.pay);
  for (const m of musteriler) {
    const km = kumeler[rng.weighted(paylar)]!;
    m.kumeId = km.id;
    m.kaynak = 'A+B';
    for (const [ad, c] of Object.entries(km.thetaCarpanlari) as [ParametreAdi, number][]) m.theta[ad] *= c;
  }
}
