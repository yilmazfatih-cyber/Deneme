/**
 * Segment hedefleme raporu — maruz grup ile kontrol (holdout) grubunun dönüşüm farkı (artış, lift), %95 güven aralığı,
 * artan dönüşüm başına maliyet ve rahatsızlık. 03 §7 metrikleri, §14 güven göstergeleri ("ayırt edilemiyor" gizlenmez).
 * ADR-002: çıktı yalnız segment düzeyindedir; hiçbir satır veya metin müşteri kimliği taşımaz.
 */
import type { Segment } from '../core/nufus';
import type { OlayGunlugu } from '../core/olay';
import type { MusteriGirdisi } from '../core/arayuz';
import type { Kampanya } from './kampanya';
import { kontrolEtiketi } from './kampanya';

export type Guven = 'yuksek' | 'orta' | 'dusuk' | 'ayirt_edilemiyor';
export type Oneri = 'hedefle' | 'dene' | 'hedefleme' | 'kacin';

export interface HedeflemeSatiri {
  /** 'segment' veya 'kume' (ADR-006) */
  birim: 'segment' | 'kume';
  /** grup kimliği: segment id veya küme id */
  segmentId: string;
  segmentAd: string;
  /** maruz (reklam gösterilmesi atanan) grup büyüklüğü — niyet-tedavi (ITT) */
  maruzKalan: number;
  kontrol: number;
  tiklamaOrani: number;
  donusumMaruz: number;
  donusumKontrol: number;
  /** yüzde puan (yp) artış: 100·(p_maruz − p_kontrol) */
  artisPuan: number;
  /** %95, iki oran farkı, yp (Agresti–Caffo düzeltmeli normal yaklaşım) */
  artisGuvenAraligi: [number, number];
  artanDonusumBasinaMaliyetTL: number | null;
  rahatsizlikOrani: number;
  guven: Guven;
  oneri: Oneri;
}

/** Grup başına asgari müşteri; altında fark "ayırt edilemiyor" (varsayım). */
export const GRUP_ASGARI_N = 30;
/** İki grupta toplam asgari dönüşüm sayısı; altında normal yaklaşım güvenilmez (varsayım). */
export const ASGARI_DONUSUM = 5;
/**
 * Rahatsızlık eşikleri (maruz grupta en az bir kez rahatsız olanların payı). Core tepki modelinde fark edilen gösterim başına
 * rahatsızlık ≈ %15–20 olduğundan 3–4 gösterimde segment payı tipik olarak %15–25 çıkar; eşikler buna göre seçildi (varsayım).
 */
export const RAHATSIZLIK_DUSUK = 0.2;
/** Bu oranın üstü "kaçın". */
export const RAHATSIZLIK_KACIN = 0.35;

export interface RaporEsikleri {
  rahatsizlikDusuk: number;
  rahatsizlikKacin: number;
  grupAsgariN: number;
  asgariDonusum: number;
}
export const VARSAYILAN_ESIKLER: RaporEsikleri = {
  rahatsizlikDusuk: RAHATSIZLIK_DUSUK,
  rahatsizlikKacin: RAHATSIZLIK_KACIN,
  grupAsgariN: GRUP_ASGARI_N,
  asgariDonusum: ASGARI_DONUSUM,
};
const Z95 = 1.959964;

/** İki oran farkı (p1 − p0) için %95 GA, Agresti–Caffo: her gruba 1 başarı + 1 başarısızlık eklenir. Döner: oran birimi. */
export function oranFarkiGA(x1: number, n1: number, x0: number, n0: number): [number, number] {
  const q1 = (x1 + 1) / (n1 + 2);
  const q0 = (x0 + 1) / (n0 + 2);
  const se = Math.sqrt((q1 * (1 - q1)) / (n1 + 2) + (q0 * (1 - q0)) / (n0 + 2));
  const d = q1 - q0;
  return [d - Z95 * se, d + Z95 * se];
}

export function hedeflemeRaporu(
  gunluk: OlayGunlugu,
  girdiler: MusteriGirdisi[],
  segmentler: Segment[],
  donusumOlayi: 'satin_al' | 'kasa',
  kampanya: Kampanya,
  esikler: RaporEsikleri = VARSAYILAN_ESIKLER,
  kumeler: { id: string; ad: string }[] = [],
): HedeflemeSatiri[] {
  const kontrolAd = kontrolEtiketi(kampanya.ad);
  const birim: 'segment' | 'kume' = kampanya.hedefBirimi === 'kume' ? 'kume' : 'segment';
  const gruplar: { id: string; ad: string }[] = birim === 'kume' ? kumeler : segmentler;
  const grupOf = new Map<string, string>();
  for (const g of girdiler) {
    const k = birim === 'kume' ? g.musteri.kumeId : g.musteri.segmentId;
    if (k !== undefined) grupOf.set(g.musteri.id, k);
  }
  const birimMaliyet = kampanya.bin_maliyetiTL / 1000;

  // Dönüşen müşteriler (tekil) ve kampanyanın reklam olayları
  const donusen = new Set<string>();
  const tiklayan = new Set<string>();
  const rahatsiz = new Set<string>();
  const gosterimSegment = new Map<string, number>();
  for (const o of gunluk.liste()) {
    if (o.tur === donusumOlayi && (o.ortam === 'eticaret' || o.ortam === 'magaza')) donusen.add(o.musteriId);
    if (o.ortam !== 'reklam' || o.veri?.['kampanya'] !== kampanya.ad) continue;
    if (o.tur === 'reklam_goster') { const gk = grupOf.get(o.musteriId); if (gk !== undefined) gosterimSegment.set(gk, (gosterimSegment.get(gk) ?? 0) + 1); }
    else if (o.tur === 'reklam_tikla') tiklayan.add(o.musteriId);
    else if (o.tur === 'reklam_rahatsiz') rahatsiz.add(o.musteriId);
  }

  interface Sayac { n1: number; x1: number; n0: number; x0: number; tik: number; rah: number }
  const sayac = new Map<string, Sayac>();
  for (const g of girdiler) {
    const grup = g.reklamKaynagi === kampanya.ad ? 1 : g.reklamKaynagi === kontrolAd ? 0 : -1;
    if (grup < 0) continue;
    const gk = grupOf.get(g.musteri.id);
    if (gk === undefined) continue;
    const s = sayac.get(gk) ?? { n1: 0, x1: 0, n0: 0, x0: 0, tik: 0, rah: 0 };
    const id = g.musteri.id;
    if (grup === 1) {
      s.n1++;
      if (donusen.has(id)) s.x1++;
      if (tiklayan.has(id)) s.tik++;
      if (rahatsiz.has(id)) s.rah++;
    } else {
      s.n0++;
      if (donusen.has(id)) s.x0++;
    }
    sayac.set(gk, s);
  }

  const satirlar: HedeflemeSatiri[] = [];
  for (const seg of gruplar) {
    const s = sayac.get(seg.id);
    if (!s) continue; // hedef dışı segment: rapora girmez
    const p1 = s.n1 > 0 ? s.x1 / s.n1 : 0;
    const p0 = s.n0 > 0 ? s.x0 / s.n0 : 0;
    const fark = p1 - p0;
    const [alt, ust] = oranFarkiGA(s.x1, s.n1, s.x0, s.n0);
    const tiklamaOrani = s.n1 > 0 ? s.tik / s.n1 : 0;
    const rahatsizlikOrani = s.n1 > 0 ? s.rah / s.n1 : 0;
    const artanDonusum = fark * s.n1;
    const maliyet = (gosterimSegment.get(seg.id) ?? 0) * birimMaliyet;
    const artanDonusumBasinaMaliyetTL = artanDonusum > 0 ? maliyet / artanDonusum : null;

    const kucukN = s.n1 < esikler.grupAsgariN || s.n0 < esikler.grupAsgariN || s.x1 + s.x0 < esikler.asgariDonusum;
    const sifiriKapsar = alt <= 0 && ust >= 0;
    let guven: Guven;
    if (kucukN || sifiriKapsar) guven = 'ayirt_edilemiyor';
    else if (Math.min(s.n1, s.n0) < 100) guven = 'dusuk';
    else guven = Math.abs(fark) >= (ust - alt) ? 'yuksek' : 'orta'; // |fark| ≥ GA genişliği ≈ yarı genişliğin 2 katı

    let oneri: Oneri;
    if (rahatsizlikOrani > esikler.rahatsizlikKacin) oneri = 'kacin';
    else if (!kucukN && ust < 0) oneri = 'kacin'; // reklam dönüşümü anlamlı biçimde düşürüyor
    else if (fark <= 0) oneri = 'hedefleme';
    else if (!kucukN && alt > 0 && rahatsizlikOrani <= esikler.rahatsizlikDusuk) oneri = 'hedefle';
    else oneri = 'dene';

    satirlar.push({
      birim,
      segmentId: seg.id,
      segmentAd: seg.ad,
      maruzKalan: s.n1,
      kontrol: s.n0,
      tiklamaOrani,
      donusumMaruz: p1,
      donusumKontrol: p0,
      artisPuan: 100 * fark,
      artisGuvenAraligi: [100 * alt, 100 * ust],
      artanDonusumBasinaMaliyetTL,
      rahatsizlikOrani,
      guven,
      oneri,
    });
  }
  return satirlar;
}

const ondalik = (x: number, b = 1): string => x.toFixed(b).replace('.', ',');
const yuzde = (x: number): string => `%${ondalik(100 * x)}`;
const isaretli = (x: number): string => `${x > 0 ? '+' : x < 0 ? '−' : ''}${ondalik(Math.abs(x))}`;

const GUVEN_METNI: Record<Guven, string> = {
  yuksek: 'yüksek',
  orta: 'orta',
  dusuk: 'düşük (grup küçük)',
  ayirt_edilemiyor: 'ayırt edilemiyor',
};
const ONERI_METNI: Record<Oneri, string> = {
  hedefle: 'HEDEFLE',
  dene: 'DENE (küçük ölçekli test)',
  hedefleme: 'HEDEFLEME',
  kacin: 'KAÇIN',
};

function gerekce(s: HedeflemeSatiri, e: RaporEsikleri): string {
  if (s.oneri === 'kacin' && s.rahatsizlikOrani > e.rahatsizlikKacin)
    return `rahatsızlık yüksek (${yuzde(s.rahatsizlikOrani)} > ${yuzde(e.rahatsizlikKacin)})`;
  if (s.oneri === 'kacin') return 'reklam dönüşümü düşürüyor (aralığın tamamı sıfırın altında)';
  if (s.oneri === 'hedefleme') return 'artış yok veya negatif';
  if (s.oneri === 'hedefle') return 'artış aralığın tamamında pozitif, rahatsızlık düşük';
  if (s.guven === 'ayirt_edilemiyor') return 'nokta tahmin pozitif ama fark kontrol grubundan ayırt edilemiyor';
  return 'artış pozitif ama rahatsızlık orta düzeyde';
}

/** Türkçe kısa rapor: her segment için gerekçe + güven + kanıt; tek skor yok, aralıklar ve "ayırt edilemiyor" görünür. */
export function raporMetni(
  satirlar: HedeflemeSatiri[],
  kampanya: Kampanya,
  esikler: RaporEsikleri = VARSAYILAN_ESIKLER,
): string {
  const s: string[] = [];
  s.push(`Kampanya: ${kampanya.ad} · kanal ${kampanya.kanal} · yaratıcı ${kampanya.yaratici} · bütçe ${ondalik(kampanya.butceTL, 0)} TL`);
  s.push(
    `Yöntem: rastgele kontrol grubu (${yuzde(kampanya.kontrolGrubuOrani)}) ile karşılaştırma; artış yüzde puan (yp), ` +
      `%95 güven aralığı (normal yaklaşım, Agresti–Caffo). Segment düzeyi; kişi düzeyi çıktı yok.`,
  );
  if (satirlar.length === 0) {
    s.push('Hedef kitlede müşteri yok; rapor üretilemedi.');
    return s.join('\n');
  }
  for (const r of satirlar) {
    const [a, u] = r.artisGuvenAraligi;
    const maliyet = r.artanDonusumBasinaMaliyetTL === null ? 'hesaplanamaz (artış yok)' : `≈ ${ondalik(r.artanDonusumBasinaMaliyetTL, r.artanDonusumBasinaMaliyetTL < 10 ? 2 : 0)} TL`;
    s.push('');
    s.push(`• ${r.segmentAd} — ${ONERI_METNI[r.oneri]}`);
    s.push(`  Gerekçe: ${gerekce(r, esikler)}.`);
    s.push(`  Güven: ${GUVEN_METNI[r.guven]}.`);
    s.push(
      `  Kanıt: dönüşüm maruz ${yuzde(r.donusumMaruz)} (n=${r.maruzKalan}) / kontrol ${yuzde(r.donusumKontrol)} (n=${r.kontrol}); ` +
        `artış ${isaretli(r.artisPuan)} yp [${isaretli(a)}; ${isaretli(u)}]; tıklama ${yuzde(r.tiklamaOrani)}; ` +
        `rahatsızlık ${yuzde(r.rahatsizlikOrani)}; artan dönüşüm başına maliyet ${maliyet}.`,
    );
  }
  const ayirt = satirlar.filter((r) => r.guven === 'ayirt_edilemiyor');
  s.push('');
  s.push('Ne bilmiyoruz:');
  if (ayirt.length > 0) s.push(`- Ayırt edilemeyen segmentler: ${ayirt.map((r) => r.segmentAd).join('; ')}. Kazanan ilan edilmez.`);
  s.push(`- ${satirlar.length} segment birlikte karşılaştırıldı; tek tek aralıklar çoklu karşılaştırma için düzeltilmedi.`);
  s.push('- Sonuçlar simülasyondur (Kaynak A öncülleri, kalibre edilmemiş); gerçek bir holdout testinin yerini almaz.');
  return s.join('\n');
}
