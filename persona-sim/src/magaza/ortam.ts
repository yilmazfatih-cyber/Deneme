/**
 * Fiziksel mağaza ortamı (2D ızgara, ajan tabanlı). Kararlar core/karar ilkelleriyle verilir; bu dosya yalnız mekân,
 * zaman ve kuyruk mekaniğini ekler. Sayısal sabitler varsayımdır (NOTLAR.md).
 */
import type { Ortam, MusteriGirdisi, SimYapilandirmasi } from '../core/arayuz';
import type { Theta } from '../core/parametreler';
import type { Teklif } from '../core/karar';
import {
  fayda,
  farkEtmeOlasiligi,
  satinAlmaOlasiligi,
  secimOlasiliklari,
  secimYukuTerkOlasiligi,
  terkOlasiligi,
} from '../core/karar';
import type { OlayGunlugu, OlayTuru } from '../core/olay';
import { TURKIYE_SEGMENTLERI } from '../core/nufus';
import { Rng, clamp } from '../core/rng';
import type { MagazaDuzeni, Nokta, Raf, Urun } from './duzen';
import { KATEGORI_TEMEL_ILGI, VARSAYILAN_DUZEN } from './duzen';
import { cizMagaza } from './ciz';

export interface MagazaKampanyasi {
  kategoriler: string[];
  /** 0–1 */
  indirimOrani: number;
  kitlikMesaji: boolean;
  promosyonAdasinda: boolean;
}

export interface MagazaAyarlari {
  /** kapı önünden geçen potansiyel müşteri / dakika (Poisson) */
  varisHiziDkBasina: number;
  kasaSayisi: number;
  /** ortalama fiş (≈6 ürün) işlem süresi */
  kasaIslemSuresiSn: number;
  kampanya?: MagazaKampanyasi;
  /** Kaynak B'den gelirse bütçe ölçeklenir (ADR-004) */
  gercekSepetMedyaniTL?: number;
  /** kamera toplu sayım: bölge → saatlik ortalama kişi; varış ve bölge çekiciliğini kalibre eder */
  gercekBolgeSayimlari?: Record<string, number>;
}

export const VARSAYILAN_AYARLAR: MagazaAyarlari = { varisHiziDkBasina: 2, kasaSayisi: 2, kasaIslemSuresiSn: 45 };

export interface BolgeSayimi {
  bolgeId: string;
  ad: string;
  /** şu an bölgedeki kişi */
  anlik: number;
  /** bölgeye giriş sayısı (kamera çizgi geçişi) */
  toplam: number;
  /** bölgeye en az bir kez uğrayan ziyaret sayısı */
  tekil: number;
  ortBeklemeSn: number;
}

export interface Fis {
  t: number;
  segmentId: string;
  tutar: number;
  urunSayisi: number;
}

/** Varsayımlar (NOTLAR.md'de gerekçeli). */
export const MAGAZA_SABITLERI = {
  /** θ.sabir web saniyesidir; fiziksel kuyrukta 1 web sn ≈ 8 mağaza sn (zaman ölçeği). */
  sabirZamanOlcegi: 8,
  /** raftaki her ürün için varyant (boy/marka) sayısı → seçim yükü seçenek sayısı */
  varyantCarpani: 3,
  /** bir seçeneğin etiketinde okunan kelime */
  secenekBasinaKelime: 5,
  /** hedeflenmemiş rafta göz gezdirme: fark etme olasılığına çarpan */
  plansizRafCarpani: 0.35,
  /** kuyrukta önde bu kadar kişi varsa sürtünme */
  surtunmeKuyrukEsigi: 4,
  surtunmeAraligiSn: 150,
  /** yürüme hızı (hücre/sn), müşteri başına ±%20 */
  yurumeHizi: 0.9,
  maxAdimSn: 0.25,
};

interface EtkinUrun {
  urun: Urun;
  idx: number;
  rafIdx: number;
  katIdx: number;
  fiyat: number;
  teklif: Teklif;
  belirginlik: number;
  erisim: number[];
}

interface SepetKalemi {
  u: EtkinUrun;
  fayda: number;
  adet: number;
}

interface PlanKalemi {
  u: EtkinUrun;
  adet: number;
}

interface Durak {
  rafIdx: number;
  urunler: PlanKalemi[];
}

type Durum = 'yuru' | 'raf' | 'kuyruk' | 'odeme' | 'cikiyor';

interface Ajan {
  id: string;
  segmentId: string;
  renk: string;
  theta: Theta;
  niyet: number;
  ilgi: Float64Array;
  duraklar: Durak[];
  durak: Durak | null;
  sepet: SepetKalemi[];
  sepetToplam: number;
  durum: Durum;
  x: number;
  y: number;
  hucre: number;
  sonraki: number;
  hedef: number;
  alan: Int32Array | null;
  hiz: number;
  yon: number;
  bekle: number;
  girisT: number;
  bolge: number;
  bolgeGirisT: number;
  ugradigi: Uint8Array;
  gorulenRaf: Uint8Array;
  promoGordu: boolean;
  kasa: number;
  kuyrukGirisT: number;
  surtunme: number;
  sonSurtunmeT: number;
  aktif: boolean;
}

interface Kasa {
  x: number;
  y: number;
  kuyruk: Ajan[];
  yolda: number;
}

const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

function medyan(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export class MagazaOrtami implements Ortam {
  readonly ad = 'Fiziksel mağaza';
  readonly duzen: MagazaDuzeni;
  readonly ayar: MagazaAyarlari;

  // ızgara
  private W: number;
  private H: number;
  private yurunur: Uint8Array;
  private hucreBolge: Int16Array;
  private hucreRaflar: number[][];
  private hucrePromo: Int16Array;
  private alanlar = new Map<number, Int32Array>();
  private girisHucre: number;
  private cikisHucre: number;
  readonly kasalar: Kasa[];

  // içerik
  private kategoriler: string[];
  private urunler: EtkinUrun[] = [];
  private kategoriUrunleri: EtkinUrun[][] = [];
  private rafUrunleri: EtkinUrun[][] = [];
  private rafSecenek: number[] = [];
  private rafMaxBelirginlik: number[] = [];
  private promoUrunleri: EtkinUrun[][] = [];
  private promoBelirginlik: number[] = [];
  private kategoriCekicilik: Float64Array;

  // durum
  private rng: Rng = new Rng(1);
  private gunluk: OlayGunlugu | null = null;
  private havuz: MusteriGirdisi[] = [];
  private ziyaretNo = new Map<string, number>();
  private cfg: SimYapilandirmasi = { seed: 1, sureSaniye: 3600, hiz: 1 };
  private t = 0;
  private sonrakiVaris = Infinity;
  private varisOrani = 0;
  private butceCarpani = 1;
  private sonKalibrasyonFis = 0;
  ajanlar: Ajan[] = [];

  // sayaçlar
  private sayac = { gecen: 0, ziyaret: 0, kasa: 0, terk: 0, ciro: 0, cikis: 0, sureToplam: 0, kuyrukIntegral: 0 };
  private bolgeToplam: number[];
  private bolgeTekil: number[];
  private bolgeAnlik: number[];
  private bolgeBeklemeToplam: number[];
  private bolgeBeklemeSayi: number[];
  private fisListesi: Fis[] = [];
  private kategoriSatis: Record<string, { adet: number; tutar: number }> = {};

  constructor(duzen: MagazaDuzeni = VARSAYILAN_DUZEN, ayar: MagazaAyarlari = VARSAYILAN_AYARLAR) {
    this.duzen = duzen;
    this.ayar = ayar;
    this.W = duzen.genislik;
    this.H = duzen.yukseklik;
    const N = this.W * this.H;
    this.yurunur = new Uint8Array(N).fill(1);
    this.hucreBolge = new Int16Array(N).fill(-1);
    this.hucreRaflar = Array.from({ length: N }, () => []);
    this.hucrePromo = new Int16Array(N).fill(-1);

    // kasalar: düzendekiler + gerekirse soldan ek
    const ks: Nokta[] = duzen.kasalar.slice(0, Math.max(1, ayar.kasaSayisi));
    while (ks.length < ayar.kasaSayisi) {
      const son = ks[ks.length - 1] ?? { x: this.W - 6, y: this.H - 4 };
      ks.push({ x: son.x - 5, y: son.y });
    }
    this.kasalar = ks.map((k) => ({ x: k.x, y: k.y, kuyruk: [], yolda: 0 }));

    const engel = (x: number, y: number, w: number, h: number) => {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (this.icinde(xx, yy)) this.yurunur[this.i(xx, yy)] = 0;
    };
    for (const r of duzen.raflar) engel(r.x, r.y, r.w, r.h);
    for (const p of duzen.promosyonAlanlari) engel(p.x, p.y, p.w, p.h);
    for (const k of this.kasalar) engel(k.x, k.y - 1, 1, 2);

    duzen.bolgeler.forEach((b, bi) => {
      for (let yy = b.y; yy < b.y + b.h; yy++)
        for (let xx = b.x; xx < b.x + b.w; xx++) if (this.icinde(xx, yy) && this.hucreBolge[this.i(xx, yy)] === -1) this.hucreBolge[this.i(xx, yy)] = bi;
    });
    const nb = duzen.bolgeler.length;
    this.bolgeToplam = new Array<number>(nb).fill(0);
    this.bolgeTekil = new Array<number>(nb).fill(0);
    this.bolgeAnlik = new Array<number>(nb).fill(0);
    this.bolgeBeklemeToplam = new Array<number>(nb).fill(0);
    this.bolgeBeklemeSayi = new Array<number>(nb).fill(0);

    this.girisHucre = this.i(duzen.giris.x, duzen.giris.y);
    this.cikisHucre = duzen.cikis ? this.i(duzen.cikis.x, duzen.cikis.y) : this.girisHucre;

    // ürünler, kampanya
    this.kategoriler = [...new Set(duzen.raflar.map((r) => r.kategori))];
    this.kategoriUrunleri = this.kategoriler.map(() => []);
    const kamp = ayar.kampanya;
    duzen.raflar.forEach((r, ri) => {
      const katIdx = this.kategoriler.indexOf(r.kategori);
      r.urunler.forEach((urun, ui) => {
        const kampanyali = !!kamp && kamp.kategoriler.includes(urun.kategori) && kamp.indirimOrani > 0;
        const indirim = kampanyali ? kamp.indirimOrani : (urun.indirimOrani ?? 0);
        const fiyat = kampanyali ? urun.fiyat * (1 - kamp.indirimOrani) : urun.fiyat;
        const teklif: Teklif = { fiyat };
        const ref = kampanyali ? Math.max(urun.fiyat, urun.referansFiyat ?? 0) : urun.referansFiyat;
        if (ref !== undefined) teklif.referansFiyat = ref;
        if (indirim > 0) teklif.indirimOrani = indirim;
        if (urun.populerlik !== undefined) teklif.populerlik = urun.populerlik;
        if (urun.kitlikMesaji || (kampanyali && kamp.kitlikMesaji)) teklif.kitlikMesaji = true;
        if (urun.yeni) teklif.yeni = true;
        const yy = r.y + Math.floor(((ui + 0.5) * r.h) / r.urunler.length);
        const erisim: number[] = [];
        for (const xx of [r.x - 1, r.x + r.w]) if (this.icinde(xx, yy) && this.yurunur[this.i(xx, yy)]) erisim.push(this.i(xx, yy));
        if (erisim.length === 0) erisim.push(this.enYakinYurunur(r.x, yy));
        const eu: EtkinUrun = {
          urun,
          idx: this.urunler.length,
          rafIdx: ri,
          katIdx,
          fiyat,
          teklif,
          belirginlik: clamp(urun.rafBelirginligi + (kampanyali ? 0.15 : 0), 0, 1),
          erisim,
        };
        this.urunler.push(eu);
        this.kategoriUrunleri[katIdx]!.push(eu);
      });
      const bunlar = this.urunler.filter((x) => x.rafIdx === ri);
      this.rafUrunleri.push(bunlar);
      this.rafSecenek.push(r.urunler.length * MAGAZA_SABITLERI.varyantCarpani);
      this.rafMaxBelirginlik.push(Math.max(0, ...bunlar.map((x) => x.belirginlik)));
      // rafa komşu yürünür hücreler
      for (let yy = r.y; yy < r.y + r.h; yy++)
        for (const xx of [r.x - 1, r.x + r.w]) if (this.icinde(xx, yy) && this.yurunur[this.i(xx, yy)]) this.hucreRaflar[this.i(xx, yy)]!.push(ri);
    });
    duzen.promosyonAlanlari.forEach((p, pi) => {
      let liste: EtkinUrun[];
      let belirginlik = p.belirginlik;
      if (kamp && kamp.promosyonAdasinda && kamp.kategoriler.length > 0) {
        liste = this.urunler.filter((x) => kamp.kategoriler.includes(x.urun.kategori));
        belirginlik = Math.max(belirginlik, 0.9);
      } else liste = this.urunler.filter((x) => p.urunIdleri.includes(x.urun.id));
      this.promoUrunleri.push(liste);
      this.promoBelirginlik.push(belirginlik);
      for (let yy = p.y - 2; yy < p.y + p.h + 2; yy++)
        for (let xx = p.x - 2; xx < p.x + p.w + 2; xx++) if (this.icinde(xx, yy) && this.yurunur[this.i(xx, yy)]) this.hucrePromo[this.i(xx, yy)] = pi;
    });

    // bölge çekiciliği (kamera sayımı): koridor/promosyon bölgelerinin göreli payı → kategori ağırlığı
    this.kategoriCekicilik = new Float64Array(this.kategoriler.length).fill(1);
    const gs = ayar.gercekBolgeSayimlari;
    if (gs) {
      const rafBolge = duzen.raflar.map((r) => this.hucreBolge[this.i(Math.min(this.W - 1, r.x + (r.w >> 1)), Math.min(this.H - 1, r.y + (r.h >> 1)))] ?? -1);
      const ilgili = [...new Set(rafBolge.filter((b) => b >= 0))].filter((b) => gs[duzen.bolgeler[b]!.id] !== undefined);
      if (ilgili.length > 1) {
        const ort = ilgili.reduce((a, b) => a + gs[duzen.bolgeler[b]!.id]!, 0) / ilgili.length;
        duzen.raflar.forEach((r, ri) => {
          const b = rafBolge[ri]!;
          const v = b >= 0 ? gs[duzen.bolgeler[b]!.id] : undefined;
          if (v !== undefined && ort > 0) this.kategoriCekicilik[this.kategoriler.indexOf(r.kategori)] = clamp(v / ort, 0.3, 3);
        });
      }
    }
  }

  // ───────────────────────── Ortam arayüzü ─────────────────────────

  baslat(musteriler: MusteriGirdisi[], cfg: SimYapilandirmasi, gunluk: OlayGunlugu, rng: Rng): void {
    this.rng = rng.fork();
    this.gunluk = gunluk;
    this.havuz = musteriler;
    this.cfg = cfg;
    this.t = 0;
    this.ajanlar = [];
    this.ziyaretNo.clear();
    this.fisListesi = [];
    this.kategoriSatis = {};
    this.sayac = { gecen: 0, ziyaret: 0, kasa: 0, terk: 0, ciro: 0, cikis: 0, sureToplam: 0, kuyrukIntegral: 0 };
    for (const a of [this.bolgeToplam, this.bolgeTekil, this.bolgeAnlik, this.bolgeBeklemeToplam, this.bolgeBeklemeSayi]) a.fill(0);
    for (const k of this.kasalar) {
      k.kuyruk = [];
      k.yolda = 0;
    }

    // varış hızı: kamera giriş sayımı varsa ona göre (giren/saat ÷ ortalama giriş olasılığı)
    let dk = this.ayar.varisHiziDkBasina;
    const girisSayim = this.ayar.gercekBolgeSayimlari?.['giris'];
    if (girisSayim !== undefined && musteriler.length > 0) {
      const pOrt = musteriler.reduce((a, m) => a + this.girisOlasiligi(m.niyet), 0) / musteriler.length;
      dk = girisSayim / 60 / Math.max(0.05, pOrt);
    }
    this.varisOrani = Math.max(0, dk) / 60;
    this.sonrakiVaris = this.varisOrani > 0 && musteriler.length > 0 ? this.rng.exponential(this.varisOrani) : Infinity;

    // bütçe ölçeği (ADR-004): gerçek sepet medyanı verilmişse θ.butce medyanı ona çekilir, sonra fişlerle düzeltilir
    this.butceCarpani = 1;
    this.sonKalibrasyonFis = 0;
    const hedef = this.ayar.gercekSepetMedyaniTL;
    if (hedef !== undefined && hedef > 0 && musteriler.length > 0) {
      const ortNiyet = musteriler.reduce((a, m) => a + m.niyet, 0) / musteriler.length;
      const beklenenPay = (0.5 + 0.4 * ortNiyet) * 0.9; // liste hedefi / bütçe × alım olasılığı (yaklaşık)
      this.butceCarpani = hedef / Math.max(1, medyan(musteriler.map((m) => m.musteri.theta.butce))) / beklenenPay;
    }
  }

  adim(dtSaniye: number): void {
    let kalan = Math.max(0, dtSaniye);
    while (kalan > 1e-9) {
      const dt = Math.min(kalan, MAGAZA_SABITLERI.maxAdimSn);
      this.altAdim(dt);
      kalan -= dt;
    }
  }

  bittiMi(): boolean {
    return (this.t >= this.cfg.sureSaniye && this.ajanlar.length === 0) || this.t >= this.cfg.sureSaniye + 3600;
  }

  simdikiZaman(): number {
    return this.t;
  }

  kpi(): Record<string, number> {
    const s = this.sayac;
    let kuyrukAnlik = 0;
    for (const k of this.kasalar) kuyrukAnlik += k.kuyruk.filter((a) => a.durum === 'kuyruk').length;
    return {
      ziyaret: s.ziyaret,
      iceride: this.ajanlar.length,
      donusum: s.ziyaret > 0 ? s.kasa / s.ziyaret : 0,
      ortSepetTL: s.kasa > 0 ? s.ciro / s.kasa : 0,
      ciroTL: s.ciro,
      terkOrani: s.kasa + s.terk > 0 ? s.terk / (s.kasa + s.terk) : 0,
      ortSureSn: s.cikis > 0 ? s.sureToplam / s.cikis : 0,
      kuyrukOrt: this.t > 0 ? s.kuyrukIntegral / this.t : 0,
      kuyrukAnlik,
      fisSayisi: s.kasa,
      terk: s.terk,
      gecen: s.gecen,
    };
  }

  bolgeSayimlari(): BolgeSayimi[] {
    return this.duzen.bolgeler.map((b, i) => ({
      bolgeId: b.id,
      ad: b.ad,
      anlik: this.bolgeAnlik[i]!,
      toplam: this.bolgeToplam[i]!,
      tekil: this.bolgeTekil[i]!,
      ortBeklemeSn: this.bolgeBeklemeSayi[i]! > 0 ? this.bolgeBeklemeToplam[i]! / this.bolgeBeklemeSayi[i]! : 0,
    }));
  }

  fisler(): Fis[] {
    return this.fisListesi;
  }

  /** kategori → satılan adet ve tutar (kasadan geçen) */
  kategoriSatislari(): Record<string, { adet: number; tutar: number }> {
    return this.kategoriSatis;
  }

  /** Bütçe kalibrasyonunun güncel çarpanı (1 = θ.butce olduğu gibi). */
  butceOlcegi(): number {
    return this.butceCarpani;
  }

  ciz(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const maks = Math.max(1, ...this.bolgeToplam);
    cizMagaza(ctx, w, h, {
      duzen: this.duzen,
      kasalar: this.kasalar.map((k) => ({ x: k.x, y: k.y, kuyruk: k.kuyruk.length })),
      bolgeYogunluk: this.bolgeToplam.map((v) => v / maks),
      kampanya: this.ayar.kampanya,
      ajanlar: this.ajanlar.map((a) => ({ x: a.x, y: a.y, renk: a.renk, sepet: MagazaOrtami.adet(a.sepet), durum: a.durum })),
      kpi: this.kpi(),
      t: this.t,
    });
  }

  // ───────────────────────── iç mekanik ─────────────────────────

  private i(x: number, y: number): number {
    return y * this.W + x;
  }
  private icinde(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.W && y < this.H;
  }
  private hx(c: number): number {
    return c % this.W;
  }
  private hy(c: number): number {
    return Math.floor(c / this.W);
  }

  private enYakinYurunur(x: number, y: number): number {
    let en = -1;
    let enD = Infinity;
    for (let c = 0; c < this.yurunur.length; c++) {
      if (!this.yurunur[c]) continue;
      const d = Math.abs(this.hx(c) - x) + Math.abs(this.hy(c) - y);
      if (d < enD) {
        enD = d;
        en = c;
      }
    }
    return en;
  }

  /** hedefe BFS uzaklık alanı (önbellekli; hedef sayısı sınırlı: erişim hücreleri, kuyruk girişleri, çıkış). */
  private alan(hedef: number): Int32Array {
    let a = this.alanlar.get(hedef);
    if (a) return a;
    a = new Int32Array(this.W * this.H).fill(-1);
    const q = new Int32Array(this.W * this.H);
    let bas = 0;
    let son = 0;
    a[hedef] = 0;
    q[son++] = hedef;
    while (bas < son) {
      const c = q[bas++]!;
      const x = this.hx(c);
      const y = this.hy(c);
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k]!;
        const ny = y + DY[k]!;
        if (!this.icinde(nx, ny)) continue;
        const n = this.i(nx, ny);
        if (!this.yurunur[n] || a[n] !== -1) continue;
        a[n] = a[c]! + 1;
        q[son++] = n;
      }
    }
    this.alanlar.set(hedef, a);
    return a;
  }

  private girisOlasiligi(niyet: number): number {
    return clamp(0.55 + 0.45 * niyet, 0, 1);
  }

  private olay(a: Ajan, tur: OlayTuru, veri?: Record<string, number | string | boolean>): void {
    if (!this.gunluk) return;
    const o = { t: this.t, ortam: 'magaza' as const, musteriId: a.id, segmentId: a.segmentId, tur };
    this.gunluk.ekle(veri ? { ...o, veri } : o);
  }

  private teklif(a: Ajan, eu: EtkinUrun, ilgiCarpani: number): Teklif {
    return { ...eu.teklif, ilgi: clamp(a.ilgi[eu.katIdx]! * ilgiCarpani + (ilgiCarpani >= 1 ? 0.3 : 0), 0, 1) };
  }

  private altAdim(dt: number): void {
    // varışlar
    while (this.sonrakiVaris <= this.t && this.t < this.cfg.sureSaniye) {
      this.varis();
      this.sonrakiVaris += this.rng.exponential(this.varisOrani);
    }
    if (this.t >= this.cfg.sureSaniye) this.sonrakiVaris = Infinity;

    // ajanlar
    for (const a of this.ajanlar) {
      if (!a.aktif) continue;
      if (a.durum === 'yuru' || a.durum === 'cikiyor') this.yuru(a, dt);
      else if (a.durum === 'raf') {
        a.bekle -= dt;
        if (a.bekle <= 0) this.raftaKarar(a);
      }
    }
    this.kasaAdimi(dt);

    // bölge takibi (kamera: konuma göre)
    for (const a of this.ajanlar) if (a.aktif) this.bolgeGuncelle(a);

    // çıkanları ayıkla
    let j = 0;
    for (const a of this.ajanlar) if (a.aktif) this.ajanlar[j++] = a;
    this.ajanlar.length = j;

    let bekleyen = 0;
    for (const k of this.kasalar) for (const a of k.kuyruk) if (a.durum === 'kuyruk') bekleyen++;
    this.sayac.kuyrukIntegral += bekleyen * dt;
    this.t += dt;
    this.butceKalibrasyonu();
  }

  private varis(): void {
    if (this.havuz.length === 0) return;
    const g = this.rng.pick(this.havuz);
    this.sayac.gecen++;
    if (!this.rng.bernoulli(this.girisOlasiligi(g.niyet))) return;
    const m = g.musteri;
    const no = (this.ziyaretNo.get(m.id) ?? 0) + 1;
    this.ziyaretNo.set(m.id, no);
    const seg = TURKIYE_SEGMENTLERI.find((s) => s.id === m.segmentId);
    const theta: Theta = { ...m.theta, butce: m.theta.butce * this.butceCarpani };
    const nk = this.kategoriler.length;
    const ilgi = new Float64Array(nk);
    for (let k = 0; k < nk; k++) ilgi[k] = clamp((KATEGORI_TEMEL_ILGI[this.kategoriler[k]!] ?? 0.5) * (0.4 + 0.9 * this.rng.next()), 0, 1);
    const a: Ajan = {
      id: no > 1 ? `${m.id}#${no}` : m.id,
      segmentId: m.segmentId,
      renk: seg?.renk ?? '#94a3b8',
      theta,
      niyet: g.niyet,
      ilgi,
      duraklar: [],
      durak: null,
      sepet: [],
      sepetToplam: 0,
      durum: 'yuru',
      x: this.hx(this.girisHucre),
      y: this.hy(this.girisHucre),
      hucre: this.girisHucre,
      sonraki: -1,
      hedef: this.girisHucre,
      alan: null,
      hiz: MAGAZA_SABITLERI.yurumeHizi * (0.8 + 0.4 * this.rng.next()),
      yon: this.rng.int(4),
      bekle: 0,
      girisT: this.t,
      bolge: -1,
      bolgeGirisT: this.t,
      ugradigi: new Uint8Array(this.duzen.bolgeler.length),
      gorulenRaf: new Uint8Array(this.duzen.raflar.length),
      promoGordu: false,
      kasa: -1,
      kuyrukGirisT: 0,
      surtunme: 0,
      sonSurtunmeT: 0,
      aktif: true,
    };
    this.sayac.ziyaret++;
    const veri: Record<string, number | string | boolean> = { niyet: g.niyet, butce: Math.round(theta.butce) };
    if (g.reklamKaynagi) veri['reklamKaynagi'] = g.reklamKaynagi;
    this.olay(a, 'giris', veri);
    this.listeOlustur(a);
    this.ajanlar.push(a);
    this.bolgeGuncelle(a);
    this.sonrakiDurak(a);
  }

  /** θ'dan alışveriş listesi: kategori ilgisi × bölge çekiciliği; ürün seçimi softmax (yenilik θ.nu_yenilik'ten). */
  private listeOlustur(a: Ajan): void {
    const r = this.rng;
    const hedefTutar = a.theta.butce * (0.45 + 0.4 * a.niyet + 0.1 * r.next());
    // çeşit sayısı niyetle ve harcama hedefiyle artar (büyük bütçe = büyük alışveriş)
    const maxCesit = 2 + r.int(3) + Math.round(6 * a.niyet) + Math.floor(hedefTutar / 400);
    const kamp = this.ayar.kampanya;
    // reklam/broşürle gelen (niyet) müşteri kampanyalı kategoriyi listesine daha sık yazar
    const agirlik = Array.from(a.ilgi, (v, k) => {
      const kampanyali = kamp?.kategoriler.includes(this.kategoriler[k]!) ? 1 + 2 * kamp.indirimOrani * a.niyet : 1;
      return v * this.kategoriCekicilik[k]! * kampanyali;
    });
    const plan = new Map<number, PlanKalemi>();
    let toplam = 0;
    for (let deneme = 0; deneme < 60; deneme++) {
      const k = r.weighted(agirlik);
      const adaylar = this.kategoriUrunleri[k] ?? [];
      if (adaylar.length === 0) continue;
      const p = secimOlasiliklari(a.theta, adaylar.map((eu) => this.teklif(a, eu, 1)));
      const eu = adaylar[r.weighted(p)]!;
      const var_ = plan.get(eu.idx);
      if (!var_ && plan.size >= maxCesit) continue;
      if (var_ && var_.adet >= 6) continue;
      if (toplam + eu.fiyat > hedefTutar && plan.size > 0) break;
      if (eu.fiyat > a.theta.butce) continue;
      if (var_) var_.adet++;
      else plan.set(eu.idx, { u: eu, adet: 1 });
      toplam += eu.fiyat;
    }
    // raf bazında durak; girişten en yakın komşu sırası
    const rafa = new Map<number, PlanKalemi[]>();
    for (const pk of plan.values()) {
      const l = rafa.get(pk.u.rafIdx) ?? [];
      l.push(pk);
      rafa.set(pk.u.rafIdx, l);
    }
    const kalan = [...rafa.entries()].map(([rafIdx, urunler]) => ({ rafIdx, urunler }));
    let cx = this.hx(this.girisHucre);
    let cy = this.hy(this.girisHucre);
    while (kalan.length > 0) {
      let en = 0;
      let enD = Infinity;
      kalan.forEach((d, i) => {
        const rf = this.duzen.raflar[d.rafIdx]!;
        const dd = Math.abs(rf.x + rf.w / 2 - cx) + Math.abs(rf.y + rf.h / 2 - cy);
        if (dd < enD) {
          enD = dd;
          en = i;
        }
      });
      const d = kalan.splice(en, 1)[0]!;
      const rf: Raf = this.duzen.raflar[d.rafIdx]!;
      cx = rf.x + rf.w / 2;
      cy = rf.y + rf.h / 2;
      a.duraklar.push(d);
    }
  }

  private hedefle(a: Ajan, hedef: number): void {
    a.hedef = hedef;
    a.alan = this.alan(hedef);
    a.sonraki = -1;
  }

  private sonrakiDurak(a: Ajan): void {
    const d = a.duraklar.shift();
    if (d) {
      a.durak = d;
      a.durum = 'yuru';
      const eu = d.urunler[0]!.u;
      this.hedefle(a, eu.erisim[this.rng.int(eu.erisim.length)]!);
      return;
    }
    a.durak = null;
    if (a.sepet.length === 0) {
      a.durum = 'cikiyor';
      this.hedefle(a, this.cikisHucre);
      return;
    }
    // en kısa kuyruk (yoldakiler dahil)
    let en = 0;
    let enV = Infinity;
    this.kasalar.forEach((k, i) => {
      const v = k.kuyruk.length + k.yolda + (Math.abs(k.x - a.x) + Math.abs(k.y - a.y)) * 0.01;
      if (v < enV) {
        enV = v;
        en = i;
      }
    });
    const k = this.kasalar[en]!;
    k.yolda++;
    a.kasa = en;
    a.durum = 'yuru';
    this.hedefle(a, this.kuyrukGirisi(k));
  }

  private kuyrukGirisi(k: Kasa): number {
    const x = k.x - 1;
    const y = Math.max(0, k.y - 8);
    return this.yurunur[this.i(x, y)] ? this.i(x, y) : this.enYakinYurunur(x, y);
  }

  private yuru(a: Ajan, dt: number): void {
    let mesafe = a.hiz * dt;
    let guvenlik = 8;
    while (mesafe > 0 && guvenlik-- > 0) {
      if (a.sonraki < 0) {
        if (a.hucre === a.hedef) {
          this.vardi(a);
          return;
        }
        const al = a.alan!;
        const d = al[a.hucre]!;
        const x = this.hx(a.hucre);
        const y = this.hy(a.hucre);
        let sec = -1;
        for (let s = 0; s < 4; s++) {
          const k = (s + a.yon) & 3;
          const nx = x + DX[k]!;
          const ny = y + DY[k]!;
          if (!this.icinde(nx, ny)) continue;
          const n = this.i(nx, ny);
          if (al[n] === d - 1 && d > 0) {
            sec = n;
            break;
          }
        }
        if (sec < 0) {
          // erişilemez (olmamalı): hedefe ışınla
          a.hucre = a.hedef;
          a.x = this.hx(a.hedef);
          a.y = this.hy(a.hedef);
          continue;
        }
        a.sonraki = sec;
      }
      const tx = this.hx(a.sonraki);
      const ty = this.hy(a.sonraki);
      const ddx = tx - a.x;
      const ddy = ty - a.y;
      const uz = Math.abs(ddx) + Math.abs(ddy);
      if (uz <= mesafe) {
        a.x = tx;
        a.y = ty;
        mesafe -= uz;
        a.hucre = a.sonraki;
        a.sonraki = -1;
        this.hucreyeGirdi(a);
        if (!a.aktif) return;
      } else {
        a.x += (ddx / uz) * mesafe;
        a.y += (ddy / uz) * mesafe;
        mesafe = 0;
      }
    }
  }

  /** Koridorda plansız fark etme: komşu raf ve promosyon adası. */
  private hucreyeGirdi(a: Ajan): void {
    if (a.durum !== 'yuru') return;
    const raflar = this.hucreRaflar[a.hucre]!;
    for (const ri of raflar) {
      if (a.gorulenRaf[ri]) continue;
      a.gorulenRaf[ri] = 1;
      if (a.durak && a.durak.rafIdx === ri) continue;
      const p = farkEtmeOlasiligi(a.theta, this.rafMaxBelirginlik[ri]!) * MAGAZA_SABITLERI.plansizRafCarpani;
      if (!this.rng.bernoulli(p)) continue;
      const adaylar = this.rafUrunleri[ri]!;
      this.plansizDene(a, adaylar, adaylar.map((x) => x.belirginlik), 0.6, 'raf');
    }
    const pi = this.hucrePromo[a.hucre]!;
    if (pi >= 0 && !a.promoGordu) {
      a.promoGordu = true;
      const adaylar = this.promoUrunleri[pi]!;
      if (adaylar.length > 0 && this.rng.bernoulli(farkEtmeOlasiligi(a.theta, this.promoBelirginlik[pi]!))) {
        this.plansizDene(a, adaylar, adaylar.map((x) => x.belirginlik), 0.75, 'promosyon');
      }
    }
  }

  private plansizDene(a: Ajan, adaylar: EtkinUrun[], agirlik: number[], ilgiCarpani: number, kaynak: string): void {
    const eu = adaylar[this.rng.weighted(agirlik)]!;
    if (a.sepet.some((s) => s.u.idx === eu.idx)) return;
    this.olay(a, 'bak', { urunId: eu.urun.id, kategori: eu.urun.kategori, plansiz: true, kaynak });
    const tk = this.teklif(a, eu, ilgiCarpani);
    if (this.rng.bernoulli(satinAlmaOlasiligi(a.theta, tk))) this.sepeteEkle(a, eu, 1, fayda(a.theta, tk), true);
  }

  private vardi(a: Ajan): void {
    if (a.durum === 'cikiyor') {
      this.cikis(a);
      return;
    }
    if (a.durak) {
      const d = a.durak;
      const rafId = this.duzen.raflar[d.rafIdx]!.id;
      for (const { u: eu } of d.urunler) this.olay(a, 'bak', { urunId: eu.urun.id, kategori: eu.urun.kategori, raf: rafId, plansiz: false });
      const secenek = this.rafSecenek[d.rafIdx]!;
      const okuma = (secenek * MAGAZA_SABITLERI.secenekBasinaKelime * 60) / Math.max(40, a.theta.okuma_hizi);
      a.bekle = 2 + okuma * (0.6 + 0.4 * this.rng.next()) + 3 * d.urunler.length;
      a.durum = 'raf';
      return;
    }
    if (a.kasa >= 0) {
      const k = this.kasalar[a.kasa]!;
      k.yolda = Math.max(0, k.yolda - 1);
      const onde = k.kuyruk.length;
      k.kuyruk.push(a);
      a.durum = 'kuyruk';
      a.kuyrukGirisT = this.t;
      a.sonSurtunmeT = this.t;
      if (onde >= MAGAZA_SABITLERI.surtunmeKuyrukEsigi) {
        a.surtunme++;
        this.olay(a, 'surtunme', { sebep: 'kuyruk', onde, kasa: a.kasa });
      }
      return;
    }
    this.sonrakiDurak(a);
  }

  private raftaKarar(a: Ajan): void {
    const d = a.durak;
    if (d) {
      const p = secimYukuTerkOlasiligi(a.theta, this.rafSecenek[d.rafIdx]!);
      if (this.rng.bernoulli(p)) {
        this.olay(a, 'bak', { raf: this.duzen.raflar[d.rafIdx]!.id, secimYuku: true, alinmadi: d.urunler.length });
      } else {
        for (const { u: eu, adet } of d.urunler) {
          const tk = this.teklif(a, eu, 1);
          if (this.rng.bernoulli(satinAlmaOlasiligi(a.theta, tk))) this.sepeteEkle(a, eu, adet, fayda(a.theta, tk), false);
        }
      }
    }
    this.sonrakiDurak(a);
  }

  private sepeteEkle(a: Ajan, eu: EtkinUrun, adet: number, u: number, plansiz: boolean): void {
    a.sepet.push({ u: eu, fayda: u, adet });
    a.sepetToplam += eu.fiyat * adet;
    this.olay(a, 'sepete_ekle', { urunId: eu.urun.id, kategori: eu.urun.kategori, fiyat: eu.fiyat, adet, plansiz });
    // bütçe aşımı: en düşük faydalı üründen birer adet bırakılır
    while (a.sepetToplam > a.theta.butce + 1e-9 && a.sepet.length > 0) {
      let en = 0;
      for (let j = 1; j < a.sepet.length; j++) if (a.sepet[j]!.fayda < a.sepet[en]!.fayda) en = j;
      const c = a.sepet[en]!;
      c.adet--;
      a.sepetToplam -= c.u.fiyat;
      if (c.adet <= 0) a.sepet.splice(en, 1);
      this.olay(a, 'sepetten_cikar', { urunId: c.u.urun.id, kategori: c.u.urun.kategori, fiyat: c.u.fiyat, adet: 1, sebep: 'butce' });
    }
  }

  private static adet(sepet: SepetKalemi[]): number {
    let n = 0;
    for (const s of sepet) n += s.adet;
    return n;
  }

  private kasaAdimi(dt: number): void {
    const K = MAGAZA_SABITLERI.sabirZamanOlcegi;
    this.kasalar.forEach((k, ki) => {
      // sıra konumları (kuyruk yukarı, 8'den sonra sola sarar)
      k.kuyruk.forEach((a, sira) => {
        const col = Math.floor(sira / 8);
        const tx = k.x - 1 - col;
        const ty = k.y - (sira % 8);
        const ddx = tx - a.x;
        const ddy = ty - a.y;
        const uz = Math.hypot(ddx, ddy);
        const m = a.hiz * dt;
        if (uz <= m) {
          a.x = tx;
          a.y = ty;
        } else {
          a.x += (ddx / uz) * m;
          a.y += (ddy / uz) * m;
        }
      });
      const bas = k.kuyruk[0];
      if (bas && bas.durum === 'kuyruk' && Math.abs(bas.x - (k.x - 1)) < 0.05 && Math.abs(bas.y - k.y) < 0.05) {
        bas.durum = 'odeme';
        const n = MagazaOrtami.adet(bas.sepet);
        bas.bekle = this.ayar.kasaIslemSuresiSn * (0.5 + (0.5 * n) / 6) * (0.8 + 0.4 * this.rng.next());
      }
      if (bas && bas.durum === 'odeme') {
        bas.bekle -= dt;
        if (bas.bekle <= 0) {
          k.kuyruk.shift();
          this.odeme(bas, ki);
        }
      }
      // bekleyenlerde terk ve sürtünme
      for (let s = k.kuyruk.length - 1; s >= 0; s--) {
        const a = k.kuyruk[s]!;
        if (a.durum !== 'kuyruk') continue;
        if (this.t - a.sonSurtunmeT >= MAGAZA_SABITLERI.surtunmeAraligiSn) {
          a.sonSurtunmeT = this.t;
          a.surtunme++;
          this.olay(a, 'surtunme', { sebep: 'bekleme', beklemeSn: Math.round(this.t - a.kuyrukGirisT), kasa: ki });
        }
        const p = terkOlasiligi(a.theta, (this.t - a.kuyrukGirisT) / K, a.surtunme, dt / K);
        if (this.rng.bernoulli(p)) {
          k.kuyruk.splice(s, 1);
          this.sayac.terk++;
          this.olay(a, 'terk', {
            sebep: 'kuyruk',
            tutar: Math.round(a.sepetToplam * 100) / 100,
            urunSayisi: MagazaOrtami.adet(a.sepet),
            beklemeSn: Math.round(this.t - a.kuyrukGirisT),
          });
          a.sepet = [];
          a.sepetToplam = 0;
          this.kuyruktanCik(a);
        }
      }
    });
  }

  private kuyruktanCik(a: Ajan): void {
    const x = Math.round(a.x);
    const y = Math.round(a.y);
    a.x = x;
    a.y = y;
    a.hucre = this.icinde(x, y) && this.yurunur[this.i(x, y)] ? this.i(x, y) : this.enYakinYurunur(x, y);
    a.durum = 'cikiyor';
    a.kasa = -1;
    this.hedefle(a, this.cikisHucre);
  }

  private odeme(a: Ajan, ki: number): void {
    const tutar = Math.round(a.sepetToplam * 100) / 100;
    this.sayac.kasa++;
    this.sayac.ciro += tutar;
    for (const s of a.sepet) {
      const ks = (this.kategoriSatis[s.u.urun.kategori] ??= { adet: 0, tutar: 0 });
      ks.adet += s.adet;
      ks.tutar += s.u.fiyat * s.adet;
    }
    const urunSayisi = MagazaOrtami.adet(a.sepet);
    this.fisListesi.push({ t: this.t, segmentId: a.segmentId, tutar, urunSayisi });
    this.olay(a, 'kasa', { tutar, urunSayisi, kasa: ki, butce: Math.round(a.theta.butce * 100) / 100 });
    this.kuyruktanCik(a);
  }

  private cikis(a: Ajan): void {
    a.aktif = false;
    this.sayac.cikis++;
    this.sayac.sureToplam += this.t - a.girisT;
    if (a.bolge >= 0) {
      this.bolgeAnlik[a.bolge]!--;
      this.bolgeBeklemeToplam[a.bolge]! += this.t - a.bolgeGirisT;
      this.bolgeBeklemeSayi[a.bolge]!++;
      a.bolge = -1;
    }
    this.olay(a, 'cikis', { sureSn: Math.round(this.t - a.girisT), sepet: a.sepet.length });
  }

  private bolgeGuncelle(a: Ajan): void {
    const x = Math.round(a.x);
    const y = Math.round(a.y);
    const b = this.icinde(x, y) ? this.hucreBolge[this.i(x, y)]! : -1;
    if (b === a.bolge) return;
    if (a.bolge >= 0) {
      this.bolgeAnlik[a.bolge]!--;
      this.bolgeBeklemeToplam[a.bolge]! += this.t - a.bolgeGirisT;
      this.bolgeBeklemeSayi[a.bolge]!++;
    }
    a.bolge = b;
    a.bolgeGirisT = this.t;
    if (b >= 0) {
      this.bolgeAnlik[b]!++;
      this.bolgeToplam[b]!++;
      if (!a.ugradigi[b]) {
        a.ugradigi[b] = 1;
        this.bolgeTekil[b]!++;
      }
      this.olay(a, 'bolge', { bolge: this.duzen.bolgeler[b]!.id });
    }
  }

  /** Gerçek sepet medyanı verilmişse her 20 fişte bir bütçe çarpanını düzelt (sönümlü). */
  private butceKalibrasyonu(): void {
    const hedef = this.ayar.gercekSepetMedyaniTL;
    if (hedef === undefined || hedef <= 0) return;
    const n = this.fisListesi.length;
    if (n - this.sonKalibrasyonFis < 20) return;
    this.sonKalibrasyonFis = n;
    const son = this.fisListesi.slice(-200).map((f) => f.tutar);
    const med = medyan(son);
    if (med <= 0) return;
    this.butceCarpani = clamp(this.butceCarpani * clamp(Math.pow(hedef / med, 0.7), 0.75, 1.33), 0.02, 50);
  }
}
