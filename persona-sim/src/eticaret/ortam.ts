/**
 * E-ticaret hunisi ortamı: açılış → liste → ürün → sepet → ödeme → satın al; her aşamadan terk.
 * Tasarım: persona-katmani/docs/mimari/04-ortamlar.md §3.1 (web), §5 (eylem), §6 (sanal saat, dikkat), §7 (olay şeması);
 * 05 §4.2 (sepet kargo mesajı). Tüm kararlar core/karar ilkelleriyle; ortama özgü sabitler "varsayım" ve aşağıda toplu.
 */
import type { MusteriGirdisi, Ortam, SimYapilandirmasi } from '../core/arayuz';
import type { Teklif } from '../core/karar';
import {
  fayda,
  lojistik,
  satinAlmaOlasiligi,
  secimOlasiliklari,
  secimYukuTerkOlasiligi,
  terkOlasiligi,
  varsayilanKalmaOlasiligi,
} from '../core/karar';
import { TURKIYE_SEGMENTLERI } from '../core/nufus';
import type { OlayGunlugu, OlayTuru } from '../core/olay';
import type { Theta } from '../core/parametreler';
import { clamp, type Rng } from '../core/rng';
import { KATALOG, KATEGORILER, VARSAYILAN_VARYANT, type Kategori, type SiteVaryanti, type Urun } from './katalog';
import { huniSeridiCiz, type DusenNokta, type FisNokta, type GorselNokta } from './cizim';

export const ASAMALAR = ['acilis', 'liste', 'urun', 'sepet', 'odeme', 'satin_al'] as const;
export type Asama = (typeof ASAMALAR)[number];
export const ASAMA_ETIKETLERI: Record<Asama, string> = {
  acilis: 'Açılış',
  liste: 'Liste',
  urun: 'Ürün',
  sepet: 'Sepet',
  odeme: 'Ödeme',
  satin_al: 'Satın al',
};

const A_ACILIS = 0, A_LISTE = 1, A_URUN = 2, A_SEPET = 3, A_ODEME = 4, A_SATIN = 5;

/* ---- Ortama özgü varsayımlar (03 kalibre eder) ---- */
/** Yükleme beklemesi okuma süresinden daha ağır algılanır; core `terkOlasiligi` ölçeği yükleme için zayıf kalıyor (NOTLAR.md). */
const YUKLEME_ALGI_CARPANI = 15;
/** Bu süreyi aşan yükleme bir sürtünme olayıdır (04 §6.2 slow_load). */
const YAVAS_YUKLEME_ESIGI_SN = 3;
/** Yavaş yükleme hayal kırıklığı birikimine çeyrek sürtünme sayılır (form hatası, ücret sürprizi tam sayılır). */
const YAVAS_YUKLEME_AGIRLIK = 0.25;
/** Ek ücret ne kadar geç görünürse o kadar sert vurur (WB Blake 2021 "drip pricing"); çarpan ekUcret'e uygulanır. */
const SURPRIZ_CARPANI: Record<'urun' | 'sepet' | 'odeme', number> = { urun: 1, sepet: 1.3, odeme: 1.8 };
const FORM_HATA_OLASILIGI = 0.12;
/** Sürtünmenin etkisi zamanla söner (04 §6.2 frustration); eşiğe birikince kalıcı olur (rage quit). τ, sn. */
const SURTUNME_SONUM_SN = 8;
const FORM_HATA_EK_SURE_SN = 12;
/** liste: Hick-Hyman karar süresi katsayısı (sn / bit) ve taranan kart üst sınırı */
const HICK_KATSAYI = 1.2;
const TARANAN_KART_UST = 30;
const KELIME = { kart: 4, urunSayfasi: 80, sepet: 30, odemeFormu: 40 };
/** gezinme niyeti: organik ziyaretçi ürünü beğense de sepete eklemeyebilir */
const gezinmeCarpani = (niyet: number): number => 0.35 + 0.65 * niyet;
/** hedefsiz açılışta hemen çıkma (bounce) */
const hemenCikma = (niyet: number): number => 0.4 * (1 - niyet);
/** "sonraya bırak" tabanı — sepet/ödemede sürpriz olmasa da kalan devam olasılığı */
const SEPET_DEVAM_TABAN = (niyet: number): number => 0.9 + 0.08 * niyet;
const ODEME_DEVAM_TABAN = (niyet: number): number => 0.9 + 0.08 * niyet;
/** "100 kuralı": düşük fiyatta yüzde, yüksek fiyatta TL çerçevesi daha büyük algılanır (varsayım eşiği) */
const TL_CERCEVE_ESIGI = 500;
/** sim süresinin bu kesrinde gelişler biter; 2× sürede açık oturumlar kapatılır */
const VARIS_PENCERESI = 0.7;
const ZORLA_BITIR_CARPANI = 2;

type Durum = 'yukleme' | 'sayfa' | 'bitti';

interface Kalem {
  urun: Urun;
  fiyat: number;
}

interface Ziyaretci extends GorselNokta {
  girdi: MusteriGirdisi;
  theta: Theta;
  rng: Rng;
  varisT: number;
  hedefli: boolean;
  hedefKategori: Kategori;
  ilgi: Record<Kategori, number>;
  asama: number;
  durum: Durum;
  kalan: number;
  gecen: number;
  /** toplam (ağırlıklı) sürtünme */
  surtunme: number;
  /** sönümlü (etkin) sürtünme */
  etkinSurtunme: number;
  yavasBildirildi: boolean;
  secilen?: Urun;
  sepet: Kalem[];
  kargoBiliniyor: boolean;
  /** kargo ücreti hangi aşamada sürpriz olarak görüldü */
  surprizAsama?: 'sepet' | 'odeme';
}

export interface HuniSatiri {
  asama: string;
  giren: number;
  cikan: number;
  terk: number;
  oran: number;
}


export class EticaretOrtami implements Ortam {
  readonly ad = 'eticaret';
  private gunluk!: OlayGunlugu;
  private t = 0;
  private sure = 0;
  private bekleyenler: Ziyaretci[] = [];
  private bekleyenIndis = 0;
  private aktifler: Ziyaretci[] = [];
  private liste: Urun[] = [];
  private giren = [0, 0, 0, 0, 0, 0];
  private terkSay = [0, 0, 0, 0, 0, 0];
  private ciro = 0;
  private toplamSure = 0;
  private bitenSayisi = 0;
  private renkler = new Map<string, string>(TURKIYE_SEGMENTLERI.map((s) => [s.id, s.renk]));
  private cizimAktif = false;
  private dusenler: DusenNokta[] = [];
  private fisler: FisNokta[] = [];

  constructor(
    readonly varyant: SiteVaryanti = VARSAYILAN_VARYANT,
    readonly katalog: Urun[] = KATALOG,
  ) {
    if (katalog.length === 0) throw new Error('katalog boş');
  }

  baslat(musteriler: MusteriGirdisi[], cfg: SimYapilandirmasi, gunluk: OlayGunlugu, rng: Rng): void {
    this.gunluk = gunluk;
    this.t = 0;
    this.sure = cfg.sureSaniye;
    this.aktifler = [];
    this.bekleyenIndis = 0;
    this.giren = [0, 0, 0, 0, 0, 0];
    this.terkSay = [0, 0, 0, 0, 0, 0];
    this.ciro = 0;
    this.toplamSure = 0;
    this.bitenSayisi = 0;
    this.dusenler = [];
    this.fisler = [];

    // Liste sayfası: katalogdan döngüyle N seçenek; tekrar edenler "benzer ürün" (fiyat/puan/yorum sapması).
    const lr = rng.fork();
    this.liste = [];
    for (let i = 0; i < this.varyant.urunSayisiListe; i++) {
      const u = this.katalog[i % this.katalog.length]!;
      const tur = Math.floor(i / this.katalog.length);
      if (tur === 0) {
        this.liste.push(u);
        continue;
      }
      const v: Urun = {
        ...u,
        id: `${u.id}-b${tur}`,
        ad: `${u.ad} (benzer)`,
        fiyat: Math.round(u.fiyat * (0.75 + lr.next() * 0.5)),
        puan: clamp(u.puan + (lr.next() - 0.6) * 0.8, 1, 5),
        yorumSayisi: Math.round(u.yorumSayisi * (0.05 + lr.next() * 0.6)),
        populerlik: clamp(u.populerlik * (0.4 + lr.next() * 0.6), 0, 1),
      };
      this.liste.push(v);
    }

    // Her müşteriye ayrı alt üreteç: varyant değişince diğer müşterilerin akışı bozulmaz (ortak rastgele sayılar → daha az gürültülü A/B).
    const adaylar: Ziyaretci[] = [];
    musteriler.forEach((g, no) => {
      const r = rng.fork();
      const niyet = clamp(g.niyet, 0, 1);
      const gelir = r.bernoulli(0.4 + 0.6 * niyet);
      const varisT = r.next() * cfg.sureSaniye * VARIS_PENCERESI;
      const hedefKategori = r.pick(KATEGORILER);
      const hedefli = r.bernoulli(0.1 + 0.7 * niyet);
      const ilgi = {} as Record<Kategori, number>;
      for (const k of KATEGORILER) ilgi[k] = k === hedefKategori ? 0.45 + 0.5 * niyet : 0.1 + 0.35 * r.next();
      if (!gelir) return;
      adaylar.push({
        no,
        renk: this.renkler.get(g.musteri.segmentId) ?? '#94a3b8',
        girdi: g,
        theta: g.musteri.theta,
        rng: r,
        varisT,
        hedefli,
        hedefKategori,
        ilgi,
        asama: A_ACILIS,
        durum: 'yukleme',
        kalan: 0,
        gecen: 0,
        surtunme: 0,
        etkinSurtunme: 0,
        yavasBildirildi: false,
        sepet: [],
        kargoBiliniyor: false,
        vx: Number.NaN,
        vy: Number.NaN,
        yukleniyor: true,
      });
    });
    adaylar.sort((a, b) => a.varisT - b.varisT || a.no - b.no);
    this.bekleyenler = adaylar;
  }

  adim(dtSaniye: number): void {
    this.t += dtSaniye;
    while (this.bekleyenIndis < this.bekleyenler.length && this.bekleyenler[this.bekleyenIndis]!.varisT <= this.t) {
      const z = this.bekleyenler[this.bekleyenIndis++]!;
      this.olay(z, 'giris', z.girdi.reklamKaynagi ? { niyet: z.girdi.niyet, reklam: z.girdi.reklamKaynagi } : { niyet: z.girdi.niyet });
      this.giren[A_ACILIS]!++;
      this.yuklemeBaslat(z);
      this.aktifler.push(z);
    }

    const zorla = this.t >= this.sure * ZORLA_BITIR_CARPANI;
    for (const z of this.aktifler) {
      if (z.durum === 'bitti') continue;
      if (zorla) {
        this.terk(z, 'oturum_sonu');
        continue;
      }
      this.ilerlet(z, dtSaniye);
    }
    if (this.aktifler.some((z) => z.durum === 'bitti')) this.aktifler = this.aktifler.filter((z) => z.durum !== 'bitti');
  }

  bittiMi(): boolean {
    return this.bekleyenIndis >= this.bekleyenler.length && this.aktifler.length === 0 && this.t > 0;
  }

  simdikiZaman(): number {
    return this.t;
  }

  /* ---------------- durum makinesi ---------------- */

  /** core `terkOlasiligi`'na verilen sürtünme: eşiğe ulaştıysa toplam, değilse sönümlü değer. */
  private surtunmeGirdisi(z: Ziyaretci): number {
    return z.surtunme >= z.theta.hayal_kirikligi_esigi ? z.surtunme : z.etkinSurtunme;
  }

  private ilerlet(z: Ziyaretci, dt: number): void {
    z.kalan -= dt;
    z.gecen += dt;
    z.etkinSurtunme *= Math.exp(-dt / SURTUNME_SONUM_SN);
    if (z.durum === 'yukleme') {
      if (!z.yavasBildirildi && z.gecen > YAVAS_YUKLEME_ESIGI_SN) {
        z.yavasBildirildi = true;
        this.surtunme(z, 'yavas_yukleme', YAVAS_YUKLEME_AGIRLIK);
      }
      if (z.rng.bernoulli(terkOlasiligi(z.theta, z.gecen * YUKLEME_ALGI_CARPANI, this.surtunmeGirdisi(z), dt))) {
        this.terk(z, 'yavas_yukleme');
        return;
      }
      if (z.kalan <= 0) this.sayfaGir(z);
      return;
    }
    // sayfada: okuma/karar süresi sabır tüketir; sürtünmeler tehlikeyi büyütür (04 §6.2)
    if (z.rng.bernoulli(terkOlasiligi(z.theta, z.gecen, this.surtunmeGirdisi(z), dt))) {
      this.terk(z, z.surtunme >= z.theta.hayal_kirikligi_esigi ? 'hayal_kirikligi' : 'sabir');
      return;
    }
    if (z.kalan <= 0) this.karar(z);
  }

  private yuklemeBaslat(z: Ziyaretci): void {
    z.durum = 'yukleme';
    z.yukleniyor = true;
    z.kalan = this.varyant.yuklemeSuresiSn;
    z.gecen = 0;
    z.yavasBildirildi = false;
  }

  private okumaSn(z: Ziyaretci, kelime: number): number {
    return (kelime / Math.max(1, z.theta.okuma_hizi)) * 60;
  }

  private sayfaGir(z: Ziyaretci): void {
    const asama = ASAMALAR[z.asama]!;
    z.durum = 'sayfa';
    z.yukleniyor = false;
    z.gecen = 0;
    this.olay(z, 'sayfa', { asama });
    const r = z.rng;
    const v = this.varyant;
    switch (z.asama) {
      case A_ACILIS:
        z.kalan = 2 + r.next() * 3;
        break;
      case A_LISTE: {
        const n = this.liste.length;
        z.kalan = 2 + this.okumaSn(z, Math.min(n, TARANAN_KART_UST) * KELIME.kart) + HICK_KATSAYI * Math.log2(n + 1);
        this.olay(z, 'bak', { asama, secenek: n });
        break;
      }
      case A_URUN:
        z.kalan = 3 + this.okumaSn(z, KELIME.urunSayfasi) * (0.7 + 0.6 * r.next());
        if (z.secilen) this.olay(z, 'bak', { asama, urunId: z.secilen.id });
        break;
      case A_SEPET:
        z.kalan = 3 + this.okumaSn(z, KELIME.sepet);
        if (this.kargoGerekli(z) && !z.kargoBiliniyor && v.kargoUcretiNeredeGorunur === 'sepet') {
          z.kargoBiliniyor = true;
          z.surprizAsama = 'sepet';
          this.surtunme(z, 'kargo_surprizi');
        }
        break;
      case A_ODEME:
        z.kalan = 15 + this.okumaSn(z, KELIME.odemeFormu);
        if (this.kargoGerekli(z) && !z.kargoBiliniyor) {
          // ödeme adımında ilk kez görülen ücret en güçlü sürpriz
          z.kargoBiliniyor = true;
          z.surprizAsama = 'odeme';
          this.surtunme(z, 'kargo_surprizi');
        }
        if (r.bernoulli(FORM_HATA_OLASILIGI)) {
          z.kalan += FORM_HATA_EK_SURE_SN;
          this.surtunme(z, 'form_hatasi');
        }
        break;
    }
  }

  private karar(z: Ziyaretci): void {
    switch (z.asama) {
      case A_ACILIS:
        return this.acilisKarar(z);
      case A_LISTE:
        return this.listeKarar(z);
      case A_URUN:
        return this.urunKarar(z);
      case A_SEPET:
        return this.sepetKarar(z);
      case A_ODEME:
        return this.odemeKarar(z);
    }
  }

  private acilisKarar(z: Ziyaretci): void {
    const r = z.rng;
    if (!z.hedefli && r.bernoulli(hemenCikma(z.girdi.niyet))) return this.terk(z, 'hemen_cikma');
    if (z.hedefli) {
      // reklamdan/aramadan gelen: doğrudan hedef kategorideki ürün sayfasına
      const adaylar = this.katalog.filter((u) => u.kategori === z.hedefKategori);
      const havuz = adaylar.length > 0 ? adaylar : this.katalog;
      z.secilen = havuz[r.weighted(havuz.map((u) => u.populerlik))]!;
      this.olay(z, 'tikla', { asama: 'acilis', urunId: z.secilen.id, kaynak: 'dogrudan' });
      this.gec(z, A_URUN);
      return;
    }
    this.gec(z, A_LISTE);
  }

  private listeKarar(z: Ziyaretci): void {
    const r = z.rng;
    if (r.bernoulli(secimYukuTerkOlasiligi(z.theta, this.liste.length))) return this.terk(z, 'secim_yuku');
    const teklifler = this.liste.map((u) => this.teklif(z, u, false));
    const i = r.weighted(secimOlasiliklari(z.theta, teklifler));
    z.secilen = this.liste[i]!;
    this.olay(z, 'tikla', { asama: 'liste', urunId: z.secilen.id, sira: i + 1 });
    this.gec(z, A_URUN);
  }

  private urunKarar(z: Ziyaretci): void {
    const u = z.secilen ?? this.katalog[0]!;
    const fiyat = this.satisFiyati(u);
    const kargoGorunur = this.varyant.kargoUcretiNeredeGorunur === 'urun' && this.kargoGerekliTutar(fiyat);
    if (kargoGorunur) z.kargoBiliniyor = true;
    const g = gezinmeCarpani(z.girdi.niyet);
    const tk = this.teklif(z, u, true);
    const pKargosuz = satinAlmaOlasiligi(z.theta, tk) * g;
    const p = kargoGorunur ? satinAlmaOlasiligi(z.theta, { ...tk, ekUcret: this.varyant.kargoUcretiTL }) * g : pKargosuz;
    const x = z.rng.next();
    if (x < p) {
      z.sepet.push({ urun: u, fiyat });
      this.olay(z, 'sepete_ekle', { asama: 'urun', urunId: u.id, fiyat });
      this.gec(z, A_SEPET);
      return;
    }
    this.terk(z, x < pKargosuz ? 'kargo_ucreti' : 'urun_ikna_etmedi');
  }

  private sepetKarar(z: Ziyaretci): void {
    const r = z.rng;
    const v = this.varyant;
    const ana = z.sepet[0];
    const ilgiAna = ana ? z.ilgi[ana.urun.kategori] : 0.5;

    // Ücretsiz kargo eşiğini tamamlama (05 §4.2): kargo biliniyorsa "ikinci ürün ekle" ile "kargo öde" fayda farkı
    if (v.ucretsizKargoEsigiTL > 0 && v.kargoUcretiTL > 0 && z.kargoBiliniyor && this.kargoGerekli(z)) {
      const ara = this.araToplam(z);
      const eksik = v.ucretsizKargoEsigiTL - ara;
      let aday: Urun | undefined;
      let adayFiyat = Infinity;
      for (const u of this.katalog) {
        const f = this.satisFiyati(u);
        if (f >= eksik && f < adayFiyat && !z.sepet.some((k) => k.urun.id === u.id)) {
          aday = u;
          adayFiyat = f;
        }
      }
      if (aday) {
        const uKargo = fayda(z.theta, { fiyat: ara, ekUcret: v.kargoUcretiTL, ilgi: ilgiAna });
        const uEkle = fayda(z.theta, {
          fiyat: ara + adayFiyat,
          ilgi: (ilgiAna + z.ilgi[aday.kategori]) / 2,
          populerlik: aday.populerlik,
        });
        if (r.bernoulli(lojistik((uEkle - uKargo) / z.theta.tau_karar))) {
          z.sepet.push({ urun: aday, fiyat: adayFiyat });
          this.olay(z, 'sepete_ekle', { asama: 'sepet', urunId: aday.id, fiyat: adayFiyat, neden: 'esik_tamamlama' });
        }
      }
    }

    let p = SEPET_DEVAM_TABAN(z.girdi.niyet);
    const surpriz = z.surprizAsama === 'sepet' && this.kargoGerekli(z);
    if (surpriz) p *= this.surprizOrani(z, 'sepet');
    if (!r.bernoulli(p)) return this.terk(z, surpriz ? 'kargo_surprizi' : 'sonraya_birakti');
    this.gec(z, A_ODEME);
  }

  private odemeKarar(z: Ziyaretci): void {
    const r = z.rng;
    const v = this.varyant;
    let ekHizmet = 0;
    if (v.onSecimliEkHizmet) {
      if (r.bernoulli(varsayilanKalmaOlasiligi(z.theta))) ekHizmet = v.onSecimliEkHizmet.ucretTL;
      else this.olay(z, 'sepetten_cikar', { asama: 'odeme', kalem: v.onSecimliEkHizmet.ad, fiyat: v.onSecimliEkHizmet.ucretTL });
    }
    const ara = this.araToplam(z);
    const kargo = this.kargoGerekli(z) ? v.kargoUcretiTL : 0;
    const surpriz = z.surprizAsama === 'odeme' && kargo > 0;
    const ilgi = this.sepetIlgisi(z);
    // Son değerlendirme: referans teklife göre göreli; taksit ve rozet oranı 1'in üstüne çıkarabilir (≤1.15).
    const ref: Teklif = { fiyat: ara, ilgi };
    const son: Teklif = { fiyat: ara, ilgi };
    if (surpriz) son.ekUcret = kargo * SURPRIZ_CARPANI.odeme;
    if (v.taksitSecenegi) son.taksit = true;
    if (v.guvenRozeti) son.guvenIsareti = true;
    const oran = Math.min(1.15, satinAlmaOlasiligi(z.theta, son) / Math.max(1e-9, satinAlmaOlasiligi(z.theta, ref)));
    const p = clamp(ODEME_DEVAM_TABAN(z.girdi.niyet) * oran, 0, 1);
    if (!r.bernoulli(p)) return this.terk(z, surpriz ? 'kargo_surprizi' : z.surtunme > 0 ? 'odeme_surtunmesi' : 'odeme_vazgecti');
    const tutar = Math.round((ara + kargo + ekHizmet) * 100) / 100;
    this.giren[A_SATIN]!++;
    z.asama = A_SATIN;
    this.ciro += tutar;
    this.olay(z, 'satin_al', { tutar, urunSayisi: z.sepet.length, kargo, ekHizmet });
    this.bitir(z);
    if (this.cizimAktif && this.fisler.length < 400) this.fisler.push({ x: z.vx, y: z.vy, renk: z.renk, kare: 0 });
  }

  /* ---------------- yardımcılar ---------------- */

  private gec(z: Ziyaretci, hedef: number): void {
    for (let k = z.asama + 1; k <= hedef; k++) this.giren[k]!++;
    z.asama = hedef;
    this.yuklemeBaslat(z);
  }

  private terk(z: Ziyaretci, neden: string): void {
    this.terkSay[z.asama]!++;
    this.olay(z, 'terk', { asama: ASAMALAR[z.asama]!, neden });
    this.bitir(z);
    if (this.cizimAktif && this.dusenler.length < 400 && !Number.isNaN(z.vx)) {
      this.dusenler.push({ x: z.vx, y: z.vy, renk: z.renk, kare: 0 });
    }
  }

  private bitir(z: Ziyaretci): void {
    z.durum = 'bitti';
    this.olay(z, 'cikis');
    this.toplamSure += this.t - z.varisT;
    this.bitenSayisi++;
  }

  private surtunme(z: Ziyaretci, neden: string, agirlik = 1): void {
    z.surtunme += agirlik;
    z.etkinSurtunme += agirlik;
    this.olay(z, 'surtunme', { asama: ASAMALAR[z.asama]!, neden });
  }

  private olay(z: Ziyaretci, tur: OlayTuru, veri?: Record<string, number | string | boolean>): void {
    const o = { t: this.t, ortam: 'eticaret' as const, musteriId: z.girdi.musteri.id, segmentId: z.girdi.musteri.segmentId, tur };
    this.gunluk.ekle(veri ? { ...o, veri } : o);
  }

  private satisFiyati(u: Urun): number {
    return Math.round(u.fiyat * (1 - this.varyant.indirimOrani) * 100) / 100;
  }

  /** İndirimin algılanan büyüklüğü: çerçeve (yüzde / TL) ve "100 kuralı" (varsayım). */
  private algilananIndirim(u: Urun): number {
    const o = this.varyant.indirimOrani;
    if (o <= 0) return 0;
    if (this.varyant.indirimCercevesi === 'yuzde') return u.fiyat < TL_CERCEVE_ESIGI ? o * 1.2 : o * 0.8;
    return u.fiyat >= TL_CERCEVE_ESIGI ? o * 1.2 : o * 0.8;
  }

  private teklif(z: Ziyaretci, u: Urun, urunSayfasi: boolean): Teklif {
    const v = this.varyant;
    const t: Teklif = { fiyat: this.satisFiyati(u), ilgi: z.ilgi[u.kategori], populerlik: u.populerlik };
    const ref = u.referansFiyat ?? (v.indirimOrani > 0 ? u.fiyat : undefined);
    if (ref !== undefined) t.referansFiyat = ref;
    const ind = this.algilananIndirim(u);
    if (ind > 0) t.indirimOrani = ind;
    if (v.puanGoster) t.puan = u.puan;
    if (v.yorumSayisiGoster) t.yorumSayisi = u.yorumSayisi;
    if (v.kitlikMesaji) t.kitlikMesaji = true;
    if (u.yeni) t.yeni = true;
    if (urunSayfasi && v.guvenRozeti) t.guvenIsareti = true;
    return t;
  }

  private araToplam(z: Ziyaretci): number {
    let s = 0;
    for (const k of z.sepet) s += k.fiyat;
    return s;
  }

  private sepetIlgisi(z: Ziyaretci): number {
    if (z.sepet.length === 0) return 0.5;
    let s = 0;
    for (const k of z.sepet) s += z.ilgi[k.urun.kategori];
    return s / z.sepet.length;
  }

  private kargoGerekliTutar(tutar: number): boolean {
    const v = this.varyant;
    return v.kargoUcretiTL > 0 && (v.ucretsizKargoEsigiTL <= 0 || tutar < v.ucretsizKargoEsigiTL);
  }

  private kargoGerekli(z: Ziyaretci): boolean {
    return this.kargoGerekliTutar(this.araToplam(z));
  }

  /** Sürpriz ücretin devam olasılığına göreli etkisi: P(al | ek ücret × geç görünme) / P(al). */
  private surprizOrani(z: Ziyaretci, asama: 'sepet' | 'odeme'): number {
    const ref: Teklif = { fiyat: this.araToplam(z), ilgi: this.sepetIlgisi(z) };
    const p0 = satinAlmaOlasiligi(z.theta, ref);
    const p1 = satinAlmaOlasiligi(z.theta, { ...ref, ekUcret: this.varyant.kargoUcretiTL * SURPRIZ_CARPANI[asama] });
    return Math.min(1, p1 / Math.max(1e-9, p0));
  }

  /* ---------------- çıktılar ---------------- */

  huni(): HuniSatiri[] {
    return ASAMALAR.map((asama, k) => {
      const giren = this.giren[k]!;
      const terk = this.terkSay[k]!;
      const cikan = k < A_SATIN ? this.giren[k + 1]! : giren;
      return { asama, giren, cikan, terk, oran: giren > 0 ? cikan / giren : 0 };
    });
  }

  /** En çok terk edilen aşamanın indisi (ASAMALAR içinde). */
  private enCokTerkIndisi(): number {
    let en = 0;
    for (let k = 1; k < A_SATIN; k++) if (this.terkSay[k]! > this.terkSay[en]!) en = k;
    return en;
  }

  enCokTerk(): string {
    return ASAMALAR[this.enCokTerkIndisi()]!;
  }

  kpi(): Record<string, number> {
    const ziyaret = this.giren[A_ACILIS]!;
    const satis = this.giren[A_SATIN]!;
    const terk = this.terkSay.reduce((a, b) => a + b, 0);
    return {
      ziyaret,
      satis,
      donusum: ziyaret > 0 ? satis / ziyaret : 0,
      ortSepetTL: satis > 0 ? this.ciro / satis : 0,
      ciroTL: this.ciro,
      terkOrani: ziyaret > 0 ? terk / ziyaret : 0,
      enCokTerkAsamasi: this.enCokTerkIndisi(),
      ortSureSn: this.bitenSayisi > 0 ? this.toplamSure / this.bitenSayisi : 0,
    };
  }

  ciz(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    this.cizimAktif = true;
    const anlik = [0, 0, 0, 0, 0, 0];
    for (const z of this.aktifler) anlik[z.asama]!++;
    huniSeridiCiz(ctx, w, h, {
      varyantAdi: this.varyant.ad,
      zaman: this.t,
      etiketler: ASAMALAR.map((a) => ASAMA_ETIKETLERI[a]),
      huni: this.huni(),
      anlik,
      kpi: this.kpi(),
      aktifler: this.aktifler,
      dusenler: this.dusenler,
      fisler: this.fisler,
      segmentler: TURKIYE_SEGMENTLERI.map((s) => ({ ad: s.ad, renk: s.renk })),
    });
    this.dusenler = this.dusenler.filter((d) => d.kare < 45);
    this.fisler = this.fisler.filter((f) => f.kare < 30);
  }
}
