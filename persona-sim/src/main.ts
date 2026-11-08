/**
 * Persona Sim — uygulama kabuğu. Akış: nüfus (Kaynak A öncülleri, isteğe bağlı Kaynak B bütçesi) → kampanya (isteğe bağlı) →
 * ortam (mağaza 2D veya e-ticaret hunisi) → KPI, hedefleme raporu (segment düzeyi), dışa aktarım (pk_db.py yukle-kosu).
 */
import { Rng, onculSec, nufusUret, TURKIYE_SEGMENTLERI, OlayGunlugu } from './core';
import type { Musteri, MusteriGirdisi, Ortam, SimYapilandirmasi, OnculSeti } from './core';
import { MagazaOrtami, VARSAYILAN_DUZEN } from './magaza';
import type { MagazaAyarlari } from './magaza';
import { EticaretOrtami, VARSAYILAN_VARYANT, VARYANT_B } from './eticaret';
import type { SiteVaryanti } from './eticaret';
import { ORNEK_KAMPANYALAR, kampanyaUygula, hedeflemeRaporu, raporMetni } from './reklam';
import type { Kampanya, HedeflemeSatiri } from './reklam';
import { posOku, kaynakBUydur, farkRaporu, butceCarpani, ornekPosCsv } from './kalibrasyon';
import type { KaynakB } from './kalibrasyon';
import { el, kaydirma, secim, kutu, dugme, tablo, tl, yuzde, bicimle, kpiKarti, canvasHazirla, sayiAlani } from './ui/kontroller';

type Sekme = 'magaza' | 'eticaret' | 'reklam' | 'kalibrasyon';

interface Durum {
  sekme: Sekme;
  seed: number;
  musteriSayisi: number;
  seviye: 'S0' | 'S1';
  kaynak: 'A' | 'A+B';
  hiz: number;
  sureSaniye: number;
  kampanyaAktif: boolean;
  kampanya: Kampanya;
  magazaAyar: MagazaAyarlari;
  varyantAdi: 'A' | 'B';
  varyant: SiteVaryanti;
  kaynakB: KaynakB | null;
}

const durum: Durum = {
  sekme: 'magaza',
  seed: 42,
  musteriSayisi: 400,
  seviye: 'S1',
  kaynak: 'A',
  hiz: 20,
  sureSaniye: 3600,
  kampanyaAktif: false,
  kampanya: structuredClone(ORNEK_KAMPANYALAR[0]!),
  magazaAyar: { varisHiziDkBasina: 6, kasaSayisi: 2, kasaIslemSuresiSn: 60 },
  varyantAdi: 'A',
  varyant: structuredClone(VARSAYILAN_VARYANT),
  kaynakB: null,
};

interface Kosu {
  id: string;
  ortamAdi: 'magaza' | 'eticaret';
  ortam: Ortam;
  gunluk: OlayGunlugu;
  girdiler: MusteriGirdisi[];
  musteriler: Musteri[];
  oncul: OnculSeti;
  kampanyaOzeti: { maruzKalan: number; gosterim: number; tiklama: number; rahatsiz: number; harcananTL: number } | null;
  hedefleme: HedeflemeSatiri[] | null;
  bitti: boolean;
  cfg: SimYapilandirmasi;
}

let kosu: Kosu | null = null;
let animasyon = 0;
let sonKpiZamani = 0;

// ───────────────────────────── DOM iskeleti ─────────────────────────────
const app = document.getElementById('app')!;
const baslik = el('header', {}, el('h1', { text: 'Persona Sim' }, el('small', { text: 'perakende mağaza ve e-ticaret müşteri simülasyonu · Kaynak A (Türkiye) + Kaynak B (gerçek fişler)' })));
const sekmeler = el('nav', { class: 'sekmeler' });
baslik.append(sekmeler);
const solPanel = el('aside');
const sahne = el('section', { class: 'sahne' });
const canvas = el('canvas');
const altBar = el('div', { class: 'alt-bar' });
sahne.append(canvas, altBar);
const sagPanel = el('aside', { class: 'sag' });
const ana = el('main', {}, solPanel, sahne, sagPanel);
app.append(baslik, ana);

const SEKMELER: { id: Sekme; ad: string }[] = [
  { id: 'magaza', ad: 'Mağaza (2D)' },
  { id: 'eticaret', ad: 'E-ticaret hunisi' },
  { id: 'reklam', ad: 'Reklam ve hedefleme' },
  { id: 'kalibrasyon', ad: 'Kaynak B (gerçek veri)' },
];
for (const s of SEKMELER) {
  const b = el('button', { text: s.ad });
  b.addEventListener('click', () => { durum.sekme = s.id; ciz(); });
  sekmeler.append(b);
}

// ───────────────────────────── sol panel: kontroller ─────────────────────────────
function solPaneliCiz(): void {
  solPanel.replaceChildren();
  const nufus = el('fieldset', {}, el('legend', { text: 'Nüfus (Kaynak A)' }));
  nufus.append(
    kaydirma('Müşteri sayısı', { min: 50, max: 2000, adim: 50, deger: durum.musteriSayisi }, (v) => (durum.musteriSayisi = v)),
    secim('Öncül seviyesi', [{ deger: 'S0', ad: 'S0 · Dünya (literatür)' }, { deger: 'S1', ad: 'S1 · Türkiye' }], durum.seviye, (v) => (durum.seviye = v as 'S0' | 'S1')),
    secim('Parametre kaynağı', [{ deger: 'A', ad: 'A · genel model' }, { deger: 'A+B', ad: 'A+B · bütçe gerçek fişlerden' }], durum.kaynak, (v) => (durum.kaynak = v as 'A' | 'A+B')),
    sayiAlani('Tohum (seed)', durum.seed, (v) => (durum.seed = v), { min: '1', step: '1' }),
    kaydirma('Hız (sim sn / gerçek sn)', { min: 1, max: 120, adim: 1, deger: durum.hiz, birim: '×' }, (v) => (durum.hiz = v)),
    kaydirma('Süre', { min: 600, max: 14400, adim: 600, deger: durum.sureSaniye, bicim: (v) => `${(v / 3600).toFixed(1)} sa` }, (v) => (durum.sureSaniye = v)),
  );
  if (durum.kaynak === 'A+B' && !durum.kaynakB) nufus.append(el('p', { class: 'not', text: 'Kaynak B yok: "Kaynak B" sekmesinden fiş verisi yükleyin; yoksa yalnız A kullanılır.' }));
  solPanel.append(nufus);

  if (durum.sekme === 'magaza') {
    const f = el('fieldset', {}, el('legend', { text: 'Mağaza' }));
    const a = durum.magazaAyar;
    f.append(
      kaydirma('Varış (müşteri/dk)', { min: 1, max: 30, adim: 1, deger: a.varisHiziDkBasina }, (v) => (a.varisHiziDkBasina = v)),
      kaydirma('Kasa sayısı', { min: 1, max: 6, adim: 1, deger: a.kasaSayisi }, (v) => (a.kasaSayisi = v)),
      kaydirma('Kasa işlem süresi', { min: 20, max: 180, adim: 10, deger: a.kasaIslemSuresiSn, birim: ' sn' }, (v) => (a.kasaIslemSuresiSn = v)),
      kutu('Kampanya: atıştırmalık + içecek %20, promosyon adasında', !!a.kampanya, (v) => {
        if (v) a.kampanya = { kategoriler: ['atistirmalik', 'icecek'], indirimOrani: 0.2, kitlikMesaji: false, promosyonAdasinda: true };
        else delete a.kampanya;
      }),
      kutu('Kampanyada "son günler" kıtlık mesajı', !!a.kampanya?.kitlikMesaji, (v) => { if (a.kampanya) a.kampanya.kitlikMesaji = v; }),
    );
    solPanel.append(f);
  }
  if (durum.sekme === 'eticaret') {
    const f = el('fieldset', {}, el('legend', { text: 'Site varyantı' }));
    const v = durum.varyant;
    f.append(
      secim('Hazır varyant', [{ deger: 'A', ad: 'A · mevcut site' }, { deger: 'B', ad: 'B · ücretsiz kargo eşiği + rozet' }], durum.varyantAdi, (x) => {
        durum.varyantAdi = x as 'A' | 'B';
        durum.varyant = structuredClone(x === 'A' ? VARSAYILAN_VARYANT : VARYANT_B);
        solPaneliCiz();
      }),
      kaydirma('Listede ürün sayısı', { min: 4, max: 80, adim: 2, deger: v.urunSayisiListe }, (x) => (v.urunSayisiListe = x)),
      kaydirma('Sayfa yükleme', { min: 0.3, max: 10, adim: 0.1, deger: v.yuklemeSuresiSn, birim: ' sn' }, (x) => (v.yuklemeSuresiSn = x)),
      kaydirma('Kargo ücreti', { min: 0, max: 150, adim: 5, deger: v.kargoUcretiTL, birim: ' ₺' }, (x) => (v.kargoUcretiTL = x)),
      kaydirma('Ücretsiz kargo eşiği', { min: 0, max: 2000, adim: 50, deger: v.ucretsizKargoEsigiTL, birim: ' ₺' }, (x) => (v.ucretsizKargoEsigiTL = x)),
      secim('Kargo ücreti nerede görünür', [{ deger: 'urun', ad: 'ürün sayfasında' }, { deger: 'sepet', ad: 'sepette' }, { deger: 'odeme', ad: 'ödemede (sürpriz)' }], v.kargoUcretiNeredeGorunur, (x) => (v.kargoUcretiNeredeGorunur = x as SiteVaryanti['kargoUcretiNeredeGorunur'])),
      kaydirma('İndirim', { min: 0, max: 0.5, adim: 0.05, deger: v.indirimOrani, bicim: (x) => `%${Math.round(x * 100)}` }, (x) => (v.indirimOrani = x)),
      kutu('Puan göster', v.puanGoster, (x) => (v.puanGoster = x)),
      kutu('Yorum sayısı göster', v.yorumSayisiGoster, (x) => (v.yorumSayisiGoster = x)),
      kutu('Güven rozeti', v.guvenRozeti, (x) => (v.guvenRozeti = x)),
      kutu('Kıtlık mesajı ("son 2 ürün")', v.kitlikMesaji, (x) => (v.kitlikMesaji = x)),
      kutu('Taksit seçeneği', v.taksitSecenegi, (x) => (v.taksitSecenegi = x)),
      kutu('Ödemede ön seçili ek hizmet (sigorta 49 ₺)', !!v.onSecimliEkHizmet, (x) => { if (x) v.onSecimliEkHizmet = { ad: 'Kargo sigortası', ucretTL: 49 }; else delete v.onSecimliEkHizmet; }),
    );
    solPanel.append(f);
  }
  if (durum.sekme === 'reklam' || durum.sekme === 'magaza' || durum.sekme === 'eticaret') {
    const f = el('fieldset', {}, el('legend', { text: 'Reklam kampanyası' }));
    const k = durum.kampanya;
    f.append(
      kutu('Kampanyayı koşudan önce uygula', durum.kampanyaAktif, (x) => (durum.kampanyaAktif = x)),
      secim('Örnek kampanya', ORNEK_KAMPANYALAR.map((x, i) => ({ deger: String(i), ad: x.ad })), String(Math.max(0, ORNEK_KAMPANYALAR.findIndex((x) => x.ad === k.ad))), (x) => {
        durum.kampanya = structuredClone(ORNEK_KAMPANYALAR[Number(x)]!);
        solPaneliCiz();
      }),
      secim('Kanal', ['sosyal', 'video', 'arama', 'acik_hava', 'uygulama_ici', 'eposta'].map((x) => ({ deger: x, ad: x })), k.kanal, (x) => (k.kanal = x as Kampanya['kanal'])),
      secim('Yaratıcı', ['indirim', 'duygusal', 'bilgi', 'sosyal_kanit', 'kitlik'].map((x) => ({ deger: x, ad: x })), k.yaratici, (x) => (k.yaratici = x as Kampanya['yaratici'])),
      kaydirma('Belirginlik', { min: 0.1, max: 1, adim: 0.05, deger: k.belirginlik }, (x) => (k.belirginlik = x)),
      kaydirma('İndirim', { min: 0, max: 0.5, adim: 0.05, deger: k.indirimOrani ?? 0, bicim: (x) => `%${Math.round(x * 100)}` }, (x) => (k.indirimOrani = x)),
      kaydirma('Kişiselleştirme', { min: 0, max: 1, adim: 0.1, deger: k.kisisellestirme ?? 0 }, (x) => (k.kisisellestirme = x)),
      kaydirma('Kişi başı ort. gösterim', { min: 1, max: 20, adim: 1, deger: k.ortalamaMaruziyet }, (x) => (k.ortalamaMaruziyet = x)),
      kaydirma('Bütçe', { min: 1000, max: 200000, adim: 1000, deger: k.butceTL, bicim: (x) => tl(x) }, (x) => (k.butceTL = x)),
      kaydirma('Kontrol grubu (görmeyen)', { min: 0.05, max: 0.5, adim: 0.05, deger: k.kontrolGrubuOrani, bicim: (x) => yuzde(x, 0) }, (x) => (k.kontrolGrubuOrani = x)),
    );
    const hedef = el('div', { class: 'not', text: 'Hedef segmentler (ADR-002: kişi değil, segment):' });
    f.append(hedef);
    for (const s of TURKIYE_SEGMENTLERI) {
      const secili = k.hedefSegmentler === 'hepsi' || k.hedefSegmentler.includes(s.id);
      f.append(kutu(s.ad, secili, (x) => {
        const mevcut = new Set(k.hedefSegmentler === 'hepsi' ? TURKIYE_SEGMENTLERI.map((t) => t.id) : k.hedefSegmentler);
        if (x) mevcut.add(s.id); else mevcut.delete(s.id);
        k.hedefSegmentler = mevcut.size === TURKIYE_SEGMENTLERI.length ? 'hepsi' : [...mevcut];
      }));
    }
    solPanel.append(f);
  }

  const dugmeler = el('div', { class: 'dugmeler' });
  if (durum.sekme === 'magaza' || durum.sekme === 'eticaret') {
    dugmeler.append(
      dugme(kosu && !kosu.bitti ? 'Yeniden başlat' : 'Simülasyonu başlat', 'birincil', () => baslat(durum.sekme as 'magaza' | 'eticaret')),
      dugme('Durdur', 'ikincil', durdur),
    );
  }
  if (durum.sekme === 'reklam') dugmeler.append(dugme('Mağazada koş', 'birincil', () => baslat('magaza')), dugme('E-ticarette koş', 'birincil', () => baslat('eticaret')));
  const disaAktar = dugme('Koşuyu dışa aktar (JSON)', 'ikincil', disaAktarJson);
  disaAktar.disabled = !kosu;
  dugmeler.append(disaAktar);
  solPanel.append(dugmeler);
  const lejant = el('div', { class: 'lejant' });
  for (const s of TURKIYE_SEGMENTLERI) {
    const i = el('i'); i.style.background = s.renk;
    lejant.append(el('span', {}, i, s.ad.split(' (')[0] ?? s.ad));
  }
  solPanel.append(el('fieldset', {}, el('legend', { text: 'Segment renkleri' }), lejant));
}

// ───────────────────────────── koşu ─────────────────────────────
function baslat(ortamAdi: 'magaza' | 'eticaret'): void {
  durdur();
  durum.sekme = ortamAdi;
  const rng = new Rng(durum.seed);
  const oncul = onculSec(durum.seviye);
  const musteriler = nufusUret(durum.musteriSayisi, oncul, TURKIYE_SEGMENTLERI, rng.fork(), durum.kaynak === 'A+B' && durum.kaynakB ? 'A+B' : 'A');
  if (durum.kaynak === 'A+B' && durum.kaynakB) {
    const c = butceCarpani(oncul, durum.kaynakB);
    for (const m of musteriler) m.theta.butce *= c;
  }
  const gunluk = new OlayGunlugu();
  let girdiler: MusteriGirdisi[];
  let kampanyaOzeti: Kosu['kampanyaOzeti'] = null;
  if (durum.kampanyaAktif) {
    const s = kampanyaUygula(musteriler, durum.kampanya, rng.fork(), gunluk);
    girdiler = s.girdiler;
    kampanyaOzeti = { maruzKalan: s.maruzKalan, gosterim: s.gosterim, tiklama: s.tiklama, rahatsiz: s.rahatsiz, harcananTL: s.harcananTL };
  } else {
    girdiler = musteriler.map((musteri) => ({ musteri, niyet: 0 }));
  }
  const cfg: SimYapilandirmasi = { seed: durum.seed, sureSaniye: durum.sureSaniye, hiz: durum.hiz };
  const magazaAyar: MagazaAyarlari = { ...durum.magazaAyar };
  if (durum.kaynak === 'A+B' && durum.kaynakB) magazaAyar.gercekSepetMedyaniTL = durum.kaynakB.sepetMedyanTL;
  const ortam: Ortam = ortamAdi === 'magaza' ? new MagazaOrtami(VARSAYILAN_DUZEN, magazaAyar) : new EticaretOrtami(durum.varyant);
  ortam.baslat(girdiler, cfg, gunluk, rng.fork());
  kosu = {
    id: `kosu-${Date.now().toString(36)}-${durum.seed}`, ortamAdi, ortam, gunluk, girdiler, musteriler, oncul, kampanyaOzeti, hedefleme: null, bitti: false, cfg,
  };
  let onceki = performance.now();
  const dongu = (simdi: number): void => {
    if (!kosu) return;
    const dtGercek = Math.min(0.1, (simdi - onceki) / 1000);
    onceki = simdi;
    const dt = dtGercek * durum.hiz;
    // kararlılık için küçük adımlara böl
    const adimSayisi = Math.max(1, Math.ceil(dt / 1));
    for (let i = 0; i < adimSayisi && !kosu.ortam.bittiMi(); i++) kosu.ortam.adim(dt / adimSayisi);
    cizSahne();
    if (simdi - sonKpiZamani > 300) { sonKpiZamani = simdi; sagPaneliCiz(); }
    if (kosu.ortam.bittiMi()) { bitir(); return; }
    animasyon = requestAnimationFrame(dongu);
  };
  animasyon = requestAnimationFrame(dongu);
  ciz();
}

function durdur(): void {
  if (animasyon) cancelAnimationFrame(animasyon);
  animasyon = 0;
}

function bitir(): void {
  if (!kosu) return;
  kosu.bitti = true;
  if (durum.kampanyaAktif) {
    kosu.hedefleme = hedeflemeRaporu(kosu.gunluk, kosu.girdiler, TURKIYE_SEGMENTLERI, kosu.ortamAdi === 'magaza' ? 'kasa' : 'satin_al', durum.kampanya);
  }
  durdur();
  ciz();
}

function cizSahne(): void {
  const { ctx, w, h } = canvasHazirla(canvas);
  ctx.clearRect(0, 0, w, h);
  if (durum.sekme === 'magaza' || durum.sekme === 'eticaret') {
    if (kosu && kosu.ortamAdi === durum.sekme) kosu.ortam.ciz(ctx, w, h);
    else {
      ctx.fillStyle = '#94a3b8'; ctx.font = '16px system-ui';
      ctx.fillText(durum.sekme === 'magaza' ? 'Mağaza simülasyonu için "Simülasyonu başlat".' : 'E-ticaret hunisi için "Simülasyonu başlat".', 24, 40);
    }
  } else if (durum.sekme === 'reklam') {
    ctx.fillStyle = '#94a3b8'; ctx.font = '15px system-ui';
    const satirlar = [
      'Reklam ve hedefleme: kampanyayı solda ayarlayın, mağazada veya e-ticarette koşun.',
      'Rapor segment düzeyinde: maruz kalan vs kontrol grubu dönüşümü, artış (lift) ve %95 güven aralığı.',
      'Kişi düzeyi hedefleme yoktur (ADR-002). "Ayırt edilemiyor" sonucu gizlenmez.',
    ];
    satirlar.forEach((s, i) => ctx.fillText(s, 24, 40 + i * 24));
  } else {
    ctx.fillStyle = '#94a3b8'; ctx.font = '15px system-ui';
    ctx.fillText('Kaynak B: şirketin fiş verisini sağ panelden yapıştırın veya örnek üretin; A ile fark raporu çıkar.', 24, 40);
  }
}

// ───────────────────────────── sağ panel: KPI ve raporlar ─────────────────────────────
function sagPaneliCiz(): void {
  sagPanel.replaceChildren();
  if (durum.sekme === 'kalibrasyon') { kalibrasyonPaneli(); return; }
  if (!kosu) { sagPanel.append(el('p', { class: 'not', text: 'Henüz koşu yok.' })); return; }
  const k = kosu.ortam.kpi();
  const kart = el('div', { class: 'kpi' });
  const goster: [string, string][] = [
    ['Ziyaret', bicimle(k.ziyaret ?? 0, 0)],
    ['Dönüşüm', yuzde(k.donusum ?? 0)],
    ['Ort. sepet', tl(k.ortSepetTL ?? 0)],
    ['Ciro', tl(k.ciroTL ?? 0)],
    ['Terk', yuzde(k.terkOrani ?? 0)],
    ['Ort. süre', `${bicimle((k.ortSureSn ?? 0) / 60, 1)} dk`],
  ];
  for (const [a, d] of goster) kart.append(kpiKarti(a, d));
  sagPanel.append(el('fieldset', {}, el('legend', { text: `${kosu.ortamAdi === 'magaza' ? 'Mağaza' : 'E-ticaret'} · ${kosu.bitti ? 'bitti' : 'çalışıyor'} · ${(kosu.ortam.simdikiZaman() / 60).toFixed(0)} dk` }), kart));

  if (kosu.kampanyaOzeti) {
    const o = kosu.kampanyaOzeti;
    const kk = el('div', { class: 'kpi' });
    kk.append(kpiKarti('Maruz kalan', bicimle(o.maruzKalan, 0)), kpiKarti('Gösterim', bicimle(o.gosterim, 0)), kpiKarti('Tıklama', bicimle(o.tiklama, 0)), kpiKarti('Harcanan', tl(o.harcananTL)));
    sagPanel.append(el('fieldset', {}, el('legend', { text: `Kampanya · ${durum.kampanya.ad}` }), kk));
  }

  // segment özeti
  const ozet = kosu.gunluk.segmentOzeti(kosu.ortamAdi);
  const donusumTuru = kosu.ortamAdi === 'magaza' ? 'kasa' : 'satin_al';
  const satirlar = TURKIYE_SEGMENTLERI.map((s) => {
    const o = ozet[s.id] ?? {};
    const giris = o.giris ?? 0, d = o[donusumTuru] ?? 0, terk = o.terk ?? 0;
    const renk = el('i'); renk.style.background = s.renk;
    return [el('span', {}, renk, ` ${s.ad.split(' (')[0]}`), giris, giris ? yuzde(d / giris) : '–', giris ? yuzde(terk / giris) : '–'];
  });
  sagPanel.append(el('fieldset', {}, el('legend', { text: 'Segment başına' }), tablo(['Segment', 'Giriş', 'Dönüşüm', 'Terk'], satirlar, [1, 2, 3])));

  if (kosu.hedefleme) {
    const h = kosu.hedefleme.map((r) => [
      r.segmentAd.split(' (')[0] ?? r.segmentAd,
      `${yuzde(r.donusumMaruz)} / ${yuzde(r.donusumKontrol)}`,
      `${r.artisPuan >= 0 ? '+' : ''}${bicimle(r.artisPuan * 100, 1)} p [${bicimle(r.artisGuvenAraligi[0] * 100, 1)}; ${bicimle(r.artisGuvenAraligi[1] * 100, 1)}]`,
      r.artanDonusumBasinaMaliyetTL === null ? '–' : tl(r.artanDonusumBasinaMaliyetTL),
      el('span', { class: `etiket ${r.oneri}`, text: r.oneri }),
    ]);
    sagPanel.append(el('fieldset', {}, el('legend', { text: 'Hedefleme (segment düzeyi)' }), tablo(['Segment', 'Dönüşüm maruz/kontrol', 'Artış (%95 GA)', '₺ / artan dönüşüm', 'Öneri'], h, [1, 2, 3])));
    sagPanel.append(el('pre', { class: 'rapor', text: raporMetni(kosu.hedefleme, durum.kampanya) }));
  }
  if (kosu.ortamAdi === 'magaza' && kosu.ortam instanceof MagazaOrtami) {
    const b = kosu.ortam.bolgeSayimlari();
    sagPanel.append(el('fieldset', {}, el('legend', { text: 'Bölge sayımları (kamera benzeri, toplu)' }), tablo(['Bölge', 'Anlık', 'Toplam', 'Ort. bekleme'], b.map((x) => [x.ad, x.anlik, x.toplam, `${bicimle(x.ortBeklemeSn, 0)} sn`]), [1, 2, 3])));
  }
  if (kosu.ortamAdi === 'eticaret' && kosu.ortam instanceof EticaretOrtami) {
    const hn = kosu.ortam.huni();
    sagPanel.append(el('fieldset', {}, el('legend', { text: 'Huni' }), tablo(['Aşama', 'Giren', 'Terk', 'Geçiş'], hn.map((x) => [x.asama, x.giren, x.terk, yuzde(x.oran)]), [1, 2, 3])));
  }
}

function kalibrasyonPaneli(): void {
  const f = el('fieldset', {}, el('legend', { text: 'Kaynak B · şirketin fiş verisi (ADR-003/004)' }));
  f.append(el('p', { class: 'not', text: 'CSV sütunları: musteri_id, magaza_id, tarih, tutar, urun_sayisi, kampanya. Kimlik yalnız takma ad olmalı. Veri yalnız tarayıcıda kalır.' }));
  const alan = el('textarea', { placeholder: 'musteri_id,magaza_id,tarih,tutar,urun_sayisi,kampanya\n...' });
  f.append(alan);
  const d = el('div', { class: 'dugmeler' });
  const sonuc = el('div');
  const uydur = (csv: string): void => {
    const kayitlar = posOku(csv);
    if (kayitlar.length === 0) { sonuc.replaceChildren(el('p', { class: 'not', text: 'Okunabilir satır yok.' })); return; }
    const b = kaynakBUydur(kayitlar);
    durum.kaynakB = b;
    const aMedyan = kosu?.ortam.kpi().ortSepetTL ?? kosu?.oncul.parametreler.butce.merkez ?? onculSec(durum.seviye).parametreler.butce.merkez;
    const fark = farkRaporu({ sepetMedyanTL: aMedyan, sepetLogSd: onculSec(durum.seviye).parametreler.butce.yayilim }, b);
    sonuc.replaceChildren(
      el('div', { class: 'kpi' }, kpiKarti('Fiş', bicimle(b.n, 0)), kpiKarti('Sepet medyanı', tl(b.sepetMedyanTL)), kpiKarti('Güven', b.guven), kpiKarti('Müşteri', bicimle(b.musteriSayisi ?? 0, 0))),
      el('p', { class: 'not', text: `Bütçe çarpanı (A → A+B): ×${butceCarpani(onculSec(durum.seviye), b).toFixed(2)}. "Parametre kaynağı: A+B" seçilirse mağaza simülasyonunda bütçe buna ölçeklenir.` }),
      tablo(['Parametre', 'A (genel)', 'B (gerçek)', 'Fark', 'Anlamlılık', 'Yorum'], fark.map((x) => [x.parametre, bicimle(x.aDeger, 1), bicimle(x.bDeger, 1), `${x.fark >= 0 ? '+' : ''}${bicimle(x.fark, 1)}`, x.anlamlilik, x.yorum]), [1, 2, 3]),
    );
  };
  d.append(
    dugme('Uydur (Kaynak B)', 'birincil', () => uydur(alan.value)),
    dugme('Örnek fiş verisi üret', 'ikincil', () => { alan.value = ornekPosCsv(new Rng(durum.seed), 600, ['ist-avm', 'ank-cadde', 'izm-semt']); uydur(alan.value); }),
    dugme('Dosya seç', 'ikincil', () => {
      const inp = el('input', { type: 'file', accept: '.csv,text/csv' });
      inp.addEventListener('change', async () => { const f0 = inp.files?.[0]; if (f0) { alan.value = await f0.text(); uydur(alan.value); } });
      inp.click();
    }),
  );
  f.append(d, sonuc);
  sagPanel.append(f);
  sagPanel.append(el('p', { class: 'not', text: 'Sunucu tarafı: persona-katmani/db/pk_db.py yukle-pos ve kaynak-b aynı hesabı veritabanında yapar; buradaki uydurma demo içindir.' }));
}

// ───────────────────────────── dışa aktarım ─────────────────────────────
function disaAktarJson(): void {
  if (!kosu) return;
  const veri = {
    kosu: {
      id: kosu.id, ortam: kosu.ortamAdi, parametre_kaynagi: durum.kaynak === 'A+B' && durum.kaynakB ? 'A+B' : 'A', seviye: durum.seviye,
      seed: durum.seed, musteri_sayisi: durum.musteriSayisi, sure_sn: kosu.ortam.simdikiZaman(), kampanya_id: durum.kampanyaAktif ? durum.kampanya.ad : null,
      yapilandirma: kosu.ortamAdi === 'magaza' ? durum.magazaAyar : durum.varyant,
      surum_demeti: { uygulama: 'persona-sim 0.1.0', oncul: kosu.oncul.ad, seed: durum.seed },
    },
    olaylar: kosu.gunluk.liste(),
    kpi: kosu.ortam.kpi(),
    hedefleme: kosu.hedefleme ?? [],
  };
  const blob = new Blob([JSON.stringify(veri)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `${kosu.id}.json` });
  a.click();
  URL.revokeObjectURL(a.href);
}

// ───────────────────────────── çizim ─────────────────────────────
function ciz(): void {
  for (const [i, b] of [...sekmeler.children].entries()) b.classList.toggle('aktif', SEKMELER[i]?.id === durum.sekme);
  solPaneliCiz();
  sagPaneliCiz();
  cizSahne();
  altBar.replaceChildren(
    el('span', { text: `Öncül: ${durum.seviye === 'S1' ? 'S1 Türkiye' : 'S0 Dünya'} · kaynak ${durum.kaynak}${durum.kaynak === 'A+B' && durum.kaynakB ? ` (B: ${bicimle(durum.kaynakB.n, 0)} fiş)` : ''} · tohum ${durum.seed}` }),
    el('span', { text: kosu ? `Olay: ${bicimle(kosu.gunluk.liste().length, 0)}` : '' }),
    el('span', { text: 'Simülasyon karar desteğidir; ölçümün yerine geçmez.' }),
  );
}

window.addEventListener('resize', cizSahne);
ciz();
