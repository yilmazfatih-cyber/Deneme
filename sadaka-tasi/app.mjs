// Sadaka Taşı — arayüz (demo). Sunucu yok; demo sandığı bu tarayıcının localStorage'ında durur.
// Gerçek para alınmaz, gerçek kişi ve kurum yoktur. Kuralların tamamı kurallar.mjs'tedir.
import {
  TL,
  VARSAYILAN_KURALLAR as K,
  KATEGORILER,
  SADAKA_ALANLARI,
  DURUMLAR,
  GEREKCELER,
  KuralHatasi,
  paylariBol,
  paraYaz,
  paraKisa,
  paraOku,
  sayiYaz,
  ayAdi,
  ayEkle,
  ayFarki,
  kategoriAdi,
  alanAdi,
  limitDetay,
  uyeLimiti,
  etkiHesapla,
  uyeSayisi,
  bakiyeler,
  rezervHedefi,
  bekleyenBorc,
  butceKalan,
  uyeEkle,
  uyeGuncelle,
  talepDogrula,
  talepOlustur,
  talepKararVer,
  belgeEkle,
  itirazEt,
  geriCek,
  ayiKapat,
  projeksiyon,
  topla,
} from './kurallar.mjs'
import { ornekDurum, ornekUyeId } from './ornek.mjs'
import { esc, parcaliCubuk, olcer, sutunGrafigi, cizgiGrafigi, yatayCubuklar } from './grafik.mjs'

const ANAHTAR = 'sadaka-tasi:demo:v1'
const SEKMELER = [
  ['', 'Ana sayfa'],
  ['nasil', 'Nasıl işler'],
  ['hesapla', 'Hesapla'],
  ['seffaflik', 'Şeffaflık'],
  ['sss', 'Sorular'],
  ['hesabim', 'Hesabım'],
  ['kurul', 'Kurul'],
]
const SAYFA_SEKME = { katil: 'hesabim', talep: 'hesabim' }
const HESAP_ADI = { havuz: 'Havuz', sadaka: 'Sadaka', isletme: 'İşletme' }
const PROJEKSIYON_VARSAYILAN = {
  ay: 36,
  baslangicUye: 300,
  aylikYeniUye: 150,
  ayrilmaYuzde: 2,
  ortalamaPayTL: 350,
  talepYuzde: 10,
  ortalamaTalepTL: 7000,
  afet: false,
  afetAy: 18,
  afetYuzde: 15,
  afetTalepTL: 15000,
}

document.documentElement.lang = 'tr'

// ---------- Durum ----------

let durum = yukle()
const arayuz = {
  hesapPay: 500,
  hesapSekme: 'kisi',
  proj: { ...PROJEKSIYON_VARSAYILAN },
  kurulFiltre: 'karar',
  defterFiltre: 'hepsi',
  defterAdet: 20,
  acikPanel: null,
  sifirlaOnay: false,
  katilPay: 500,
}
let sifirlaZamanlayici = null

function yukle() {
  try {
    const ham = localStorage.getItem(ANAHTAR)
    if (ham) {
      const s = JSON.parse(ham)
      if (s && s.surum === 1 && Array.isArray(s.uyeler) && Array.isArray(s.defter) && s.butce) return s
    }
  } catch {
    /* depolama kapalıysa örnek sandıkla başlanır */
  }
  return ornekDurum()
}

function kaydet() {
  try {
    localStorage.setItem(ANAHTAR, JSON.stringify(durum))
  } catch {
    /* depolama yoksa demo bu sekmede sürer */
  }
}

function ben() {
  return durum.benId ? durum.uyeler.find((u) => u.id === durum.benId) || null : null
}

function rota() {
  const ad = decodeURIComponent(location.hash.replace(/^#/, ''))
  const bilinen = ['nasil', 'hesapla', 'seffaflik', 'sss', 'hesabim', 'kurul', 'katil', 'talep']
  return bilinen.includes(ad) ? ad : ''
}

// ---------- Küçük yardımcılar ----------

const SESLI_YIL = { 1: 'de', 2: 'de', 3: 'te', 4: 'te', 5: 'te', 6: 'da', 7: 'de', 8: 'de', 9: 'da' }
const SESLI_ONLAR = { 1: 'da', 2: 'de', 3: 'da', 4: 'ta', 5: 'de', 6: 'ta', 7: 'te', 8: 'de', 9: 'da', 0: 'de' }

/** 'Mart 2027'de', 'Ağustos 2026'da' — yılın okunuşuna göre bulunma eki. */
function ayDe(ay) {
  const yil = ay.slice(0, 4)
  const son = Number(yil.at(-1))
  const ek = son ? SESLI_YIL[son] : SESLI_ONLAR[Number(yil.at(-2))]
  return `${ayAdi(ay)}'${ek}`
}

function ikon(ad) {
  const yollar = {
    bilgi: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    onay: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    saat: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    belge: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>',
    eksi: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
    sira: '<path d="M4 7h16M4 12h10M4 17h6"/>',
  }
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${yollar[ad] || ''}</svg>`
}

function logo() {
  return `<svg viewBox="0 0 40 40" aria-hidden="true">
    <rect width="40" height="40" rx="10" fill="var(--cini)"/>
    <circle cx="20" cy="9.6" r="3.6" fill="var(--akce)"/>
    <path d="M9 16.4h22a1.8 1.8 0 0 1 0 3.6H9a1.8 1.8 0 0 1 0-3.6z" fill="var(--yuzey)"/>
    <ellipse cx="20" cy="16.7" rx="5.4" ry="1.5" fill="var(--cini)"/>
    <path d="M13.4 20h13.2l-1.3 12H14.7z" fill="var(--yuzey)"/>
    <rect x="11" y="32" width="18" height="3.2" rx="1" fill="var(--yuzey)"/>
  </svg>`
}

function tasCizimi() {
  return `<svg viewBox="0 0 120 200" aria-hidden="true">
    <rect x="18" y="182" width="84" height="12" rx="2" fill="var(--cizgi-guclu)"/>
    <path d="M35 62h50l-4 120H39z" fill="var(--cizgi)"/>
    <path d="M45 84h30M45 92h30M45 100h22" stroke="var(--cizgi-guclu)" stroke-width="2.5" stroke-linecap="round"/>
    <rect x="16" y="44" width="88" height="20" rx="4" fill="var(--cizgi-guclu)"/>
    <ellipse cx="60" cy="46.5" rx="27" ry="5.5" fill="var(--murekkep-2)" opacity=".5"/>
    <circle cx="52" cy="35" r="6.5" fill="var(--akce)"/>
    <circle cx="67" cy="28" r="6.5" fill="var(--akce)"/>
  </svg>`
}

function sayiKutu(etiket, deger, not = '') {
  return `<div class="sayi-kutu"><span class="etiket">${esc(etiket)}</span><span class="deger">${esc(deger)}</span>${
    not ? `<span class="not">${esc(not)}</span>` : ''
  }</div>`
}

function durumRozeti(t) {
  const sinif = { odendi: 'iyi', sirada: 'uyari', belge: 'uyari', inceleme: 'bilgi' }[t.durum] || ''
  const simge = { odendi: 'onay', sirada: 'sira', belge: 'belge', inceleme: 'saat' }[t.durum] || 'eksi'
  return `<span class="rozet ${sinif}">${ikon(simge)}${esc(DURUMLAR[t.durum])}</span>`
}

function yolRozeti(t) {
  return t.yol === 'hizli'
    ? '<span class="rozet">Hızlı inceleme</span>'
    : `<span class="rozet">${t.itiraz ? 'İtiraz · kurul' : 'Kurul incelemesi'}</span>`
}

function ornekNotu(metin = 'Örnek veri. Rakamlar bu demodaki sandığın kurallarla üretilmiş hâlidir; gerçek değildir.') {
  return `<p class="ornek-veri">${ikon('bilgi')}<span>${esc(metin)}</span></p>`
}

function toplamlar() {
  const r = durum.raporlar
  return {
    aySayisi: r.length,
    gelen: topla(r.map((x) => x.gelen)),
    sadaka: topla(r.map((x) => x.sadaka)),
    destek: topla(r.map((x) => x.destek)),
    destekAdet: topla(r.map((x) => x.destekAdet)),
    isletme: topla(r.map((x) => x.isletme)),
  }
}

function bildir(metin) {
  let kutu = document.getElementById('bildirim')
  if (!kutu) {
    kutu = document.createElement('div')
    kutu.id = 'bildirim'
    kutu.className = 'bildirim'
    kutu.setAttribute('role', 'status')
    document.body.append(kutu)
  }
  kutu.hidden = false
  kutu.textContent = metin
  clearTimeout(bildir.zaman)
  bildir.zaman = setTimeout(() => {
    kutu.hidden = true
  }, 7000)
}

// ---------- Çizim ----------

const kok = document.getElementById('uygulama')

function ciz({ basaDon = false } = {}) {
  const sayfa = rota()
  const govdeler = { nasil, hesapla, seffaflik, sss, hesabim, kurul, katil, talep }
  const govde = (govdeler[sayfa] || anaSayfa)()
  kok.innerHTML = `${ust(sayfa)}<main class="ana" id="icerik" tabindex="-1">${govde}${altbilgi()}</main>${demoSeridi()}`
  if (basaDon) {
    window.scrollTo(0, 0)
    document.getElementById('icerik')?.focus({ preventScroll: true })
  }
}

function ust(sayfa) {
  const aktif = SAYFA_SEKME[sayfa] ?? sayfa
  return `<header class="ust"><div class="ust-ic"><a class="marka" href="#">${logo()}<span>Sadaka Taşı</span></a><span class="demo-rozet">Demo</span></div>
  <nav class="sekmeler" aria-label="Bölümler">${SEKMELER.map(
    ([id, ad]) => `<a href="#${id}"${aktif === id ? ' aria-current="page"' : ''}>${ad}</a>`,
  ).join('')}</nav></header>`
}

function demoSeridi() {
  return `<div class="demo-serit" role="region" aria-label="Demo takvimi"><div class="demo-serit-ic">
    <div class="ay-bilgi"><strong>${ayAdi(durum.ay)}</strong><span>Demo takvimi</span></div>
    <button type="button" class="dugme" data-eylem="ayi-kapat">Ayı kapat</button>
    <button type="button" class="dugme sessiz" data-eylem="sifirla">${arayuz.sifirlaOnay ? 'Evet, baştan başlat' : 'Baştan başlat'}</button>
  </div></div>`
}

function altbilgi() {
  return `<footer class="altbilgi kap genis">
    <p><strong>Sadaka Taşı bir sigorta ürünü değildir.</strong> Destek garanti edilmez; kurul kararıyla ve havuzun durumuna göre verilir.</p>
    <p>Bu site bir tasarım örneğidir (demo). Gerçek para toplanmaz; kişiler, kurumlar ve rakamlar örnektir. Demo verisi yalnızca bu tarayıcıda saklanır.</p>
  </footer>`
}

// ---------- Ana sayfa ----------

function payKarti(tutar, baslik) {
  const p = paylariBol(tutar)
  return `<section class="akce-kart" aria-labelledby="pay-baslik">
    <h2 id="pay-baslik">${esc(baslik)}</h2>
    ${parcaliCubuk(
      [
        { ad: 'Sadaka payı', deger: p.sadaka, renk: 'akce', etiket: paraYaz(p.sadaka) },
        { ad: 'Dayanışma havuzu', deger: p.havuz, renk: 'cini', etiket: paraYaz(p.havuz) },
        { ad: 'İşletme', deger: p.isletme, renk: 'gri', etiket: paraYaz(p.isletme) },
      ],
      {
        aria: `${paraYaz(tutar)}: ${paraYaz(p.sadaka)} sadaka payı, ${paraYaz(p.havuz)} dayanışma havuzu, ${paraYaz(p.isletme)} işletme`,
      },
    )}
    <ul class="parca-liste">
      <li><i class="kutu renk-akce"></i><span class="ad">Sadaka payı</span><span class="tutar">${paraYaz(p.sadaka)}</span>
        <span class="aciklama">Aynı ay, seçtiğiniz alanda ihtiyaç sahibine ulaşır.</span></li>
      <li><i class="kutu renk-cini"></i><span class="ad">Dayanışma havuzu</span><span class="tutar">${paraYaz(p.havuz)}</span>
        <span class="aciklama">Kara günü gelen üyelere destek olur. İhtiyatın üstünde kalanı ay sonunda sadakaya döner.</span></li>
      <li><i class="kutu renk-gri"></i><span class="ad">İşletme</span><span class="tutar">${paraYaz(p.isletme)}</span>
        <span class="aciklama">Ödeme komisyonu, yazılım, personel ve bağımsız denetim. Bu oran bir tavandır.</span></li>
    </ul>
  </section>`
}

function anaSayfa() {
  const t = toplamlar()
  return `<div class="kap">
    <section class="kahraman">
      <p class="kicker">Dayanışma sandığı</p>
      <h1>Kara günde birbirimize yetişelim.</h1>
      <p class="lead">Her ay bir aidat ödersiniz. Aidatın bir kısmı aynı ay sadaka olarak ihtiyaç sahibine ulaşır.
        Kalanı dayanışma havuzunda durur; kara günü gelen üyeye kurul kararıyla destek olur. Havuzda ihtiyacın
        üstünde kalan her kuruş da ay sonunda sadakaya döner.</p>
      <div class="dugme-satiri"><a class="dugme" href="#hesapla">Aidatımı hesapla</a><a class="dugme ikincil" href="#nasil">Nasıl işler?</a></div>
    </section>
    ${payKarti(TL(100), 'Her 100 TL’lik aidatınız')}
    <section class="bolum" aria-labelledby="adim-baslik">
      <h2 id="adim-baslik">Üç adımda</h2>
      <ol class="adimlar yatay-adim">
        <li><h3>Aidatınızı ödeyin</h3><p>Ayda ${paraYaz(K.asgariAidat)}’den başlar. Tutarı istediğiniz zaman değiştirir ya da ara verirsiniz.</p></li>
        <li><h3>Kara gününüzde başvurun</h3><p>Üç ay kesintisiz aidattan sonra hastalık, cenaze, afet ya da iş kaybında destek istersiniz. Kurul, belgelenen ihtiyaca bakarak karar verir.</p></li>
        <li><h3>Kalan sadaka olur</h3><p>Havuzda üç aylık ihtiyatın üstünde kalan para, her ay seçtiğiniz alana sadaka olarak gider.</p></li>
      </ol>
    </section>
    <section class="bolum hikaye" aria-label="Sadaka taşı geleneği">
      ${tasCizimi()}
      <div class="yigin">
        <p class="alinti">Veren el, alan eli görmez.</p>
        <p>Osmanlı şehirlerinde cami avlularında, üstü oyuk taş sütunlar dururdu. Varlıklı olan oyuğa sessizce para
          bırakır, ihtiyacı olan yalnızca ihtiyacı kadarını alırdı. Kalan, bir sonraki kişiye kalırdı.</p>
        <p>Sadaka Taşı bu geleneği bugünün şeffaflığıyla sürdürür: kimin aldığı gizli kalır, paranın nereye gittiği
          herkese açıktır.</p>
      </div>
    </section>
    <section class="bolum" aria-labelledby="bugun-baslik">
      <h2 id="bugun-baslik">Sandık bugün</h2>
      ${ornekNotu()}
      <div class="sayilar dortlu">
        ${sayiKutu('Üye', sayiYaz(uyeSayisi(durum)))}
        ${sayiKutu('Destek olunan kara gün', sayiYaz(t.destekAdet), paraKisa(t.destek))}
        ${sayiKutu('Sadakaya giden', paraKisa(t.sadaka), `${t.aySayisi} ayda`)}
        ${sayiKutu('İşletme payı', '%10', 'tavan; her kuruşu raporda')}
      </div>
      <div class="dugme-satiri"><a class="dugme sessiz" href="#seffaflik">Paranın ay ay nereye gittiğini görün</a></div>
    </section>
    <section class="bolum" aria-labelledby="sigorta-baslik">
      <h2 id="sigorta-baslik">Bu bir sigorta değil</h2>
      <div class="kart">
        <ul class="yigin" style="margin:0;padding-left:20px">
          <li><strong>Destek bir hak değil, bir karardır.</strong> Sandık kimseye ödeme taahhüt etmez. Kurul, belgelenen ihtiyaca ve havuzun durumuna bakar; büyük bir afette ödemeler oransal yapılır.</li>
          <li><strong>Havuzdaki para derneğindir.</strong> Üyenin bakiyesi yoktur; ödenen aidat iade edilmez.</li>
          <li><strong>Çok ödemek çok almak demek değildir.</strong> Yardım tavanı herkes için aynıdır. Fazla ödeyen, fazla sadaka vermiş olur.</li>
          <li><strong>Sigortanın yerini tutmaz.</strong> DASK, SGK ve özel sigorta yerinde kalmalı. Sandık, onların kapatmadığı boşluğa yetişir.</li>
          <li><strong>Faiz yok.</strong> Havuz, derneğin katılım bankasındaki hesabında durur.</li>
        </ul>
      </div>
      <div class="dugme-satiri"><a class="dugme" href="#katil">Üye ol</a><a class="dugme sessiz" href="#sss">Soruları okuyun</a></div>
    </section>
  </div>`
}

// ---------- Nasıl işler ----------

/** Üyelik süresine göre tavan satırları: [{ aralik, tavan }] */
function tavanSatirlari() {
  const satirlar = [{ aralik: `1–${K.beklemeAy - 1}. ay`, tavan: null }]
  K.tavanlar.forEach(([esik, tavan], i) => {
    const sonraki = K.tavanlar[i + 1]
    satirlar.push({ aralik: sonraki ? `${esik}–${sonraki[0] - 1}. ay` : `${esik}. aydan sonra`, tavan })
  })
  return satirlar
}

function nasil() {
  return `<div class="kap">
    <section class="bolum">
      <p class="kicker">Sandık kuralları</p>
      <h1>Nasıl işler?</h1>
      <p class="lead">Kurallar az ve açıktır. Hepsi önceden yazılıdır ve herkes için aynıdır.</p>
    </section>
    ${payKarti(TL(100), 'Aidatınızın bölünüşü')}
    <section class="bolum">
      <h2>Bekleme süresi: üç ay</h2>
      <p>Üç ayın aidatı kesintisiz ödendikten sonra talep açılır. Ara verip dönen üye için de süre yeniden işler.
        Böylece kimse yalnızca kara günü geldiğinde katılıp hemen destek almaz; havuz, aidatını düzenli ödeyenlerindir.</p>
    </section>
    <section class="bolum">
      <h2>Yardım tavanı</h2>
      <p>Kurul ihtiyacınızı belgeyle görür ve 12 ay içinde en çok bu tavana kadar yardım edebilir. Tavan bir hak ya da
        bakiye değildir; kurulun verebileceği yardımın üst sınırıdır. <strong>Aidat tutarına bağlı değildir</strong>:
        ${paraYaz(K.asgariAidat)} ödeyen de 1.000 TL ödeyen de aynı tavana sahiptir. Fazla ödeyen, fazla sadaka vermiş olur.</p>
      <div class="kart">
        <div class="tablo-kap"><table><thead><tr><th scope="col">Üyelik süresi</th><th scope="col" class="sayi">12 ayda en çok</th></tr></thead>
        <tbody>${tavanSatirlari()
          .map(
            (t) =>
              `<tr><th scope="row">${t.aralik}</th><td class="sayi">${t.tavan ? paraYaz(t.tavan) : 'Bekleme'}</td></tr>`,
          )
          .join('')}</tbody></table></div>
        <p class="kucuk soluk">Onaylanan yardım 12 ay boyunca tavandan düşülür, sonra geri döner. Tavanlar her yıl enflasyona ve havuzun durumuna göre kurulca güncellenir.</p>
      </div>
    </section>
    <section class="bolum">
      <h2>Kara gün örnekleri</h2>
      <div class="tablo-kap"><table><thead><tr><th scope="col">Tür</th><th scope="col">Kapsar</th><th scope="col">İstenen belge</th></tr></thead><tbody>
        ${KATEGORILER.map(
          (c) =>
            `<tr><th scope="row"><strong>${esc(c.ad)}</strong></th><td>${esc(c.aciklama)}</td><td>${esc(c.belgeler.join('; '))}</td></tr>`,
        ).join('')}
      </tbody></table></div>
      <p class="kucuk soluk">Liste örnektir; kurul her talebi ihtiyaca göre değerlendirir. Düzenli giderler (kira, fatura, taksit) tek başına kara gün sayılmaz.</p>
    </section>
    <section class="bolum">
      <h2>Başvurudan ödemeye</h2>
      <ol class="adimlar">
        <li><h3>Başvuru</h3><p>Türü, tutarı ve ne olduğunu yazarsınız; belgeyi telefondan eklersiniz.</p></li>
        <li><h3>Belge kontrolü</h3><p>Görevli kimliğinizi ve belgeyi doğrular. e-Devlet’in barkodlu belgeleri en hızlısıdır.</p></li>
        <li><h3>Karar</h3><p>Kurul belgelenen gideri esas alır; sigorta, SGK ya da belediyeden karşılanan kısmı düşer. ${paraYaz(
          K.hizliTavan,
        )}’ye kadar ve kalan tavanınızın yarısına kadar olan talepler hızlı incelemeyle en geç 24 saatte, diğerleri kurulda en geç 3 iş gününde sonuçlanır.</p></li>
        <li><h3>Ödeme</h3><p>Mümkünse doğrudan hastaneye, eczaneye, ustaya ya da cenaze hizmetine; değilse adınıza kayıtlı hesaba.</p></li>
      </ol>
    </section>
    <section class="bolum">
      <h2>Kurul</h2>
      <p>Üyeler arasından seçilen üç gönüllü ve bir görevli. Kurul talep sahibinin adını görmez; üye kodunu, kıdemini,
        kalan tavanını, belgelerini ve açıklamasını görür. Her karar gerekçelidir. Uygun görülmeyen talebe bir kez itiraz
        edilir; itirazı ilk kararı vermeyen üyeler inceler.</p>
    </section>
    <section class="bolum">
      <h2>Afet kuralı</h2>
      <p>Bir ayda havuzdan en çok ay başı bakiyesinin <strong>%${K.aylikOdemeOrani * 100}’u</strong> ödenir. Onaylanan
        talepler bunu aşarsa sıraya girer ve sonraki aylarda, kalan tutarlarla orantılı olarak ödenir. Bu kural, büyük
        bir depremde havuzun ilk hafta tükenmesini ve sonra başvuranların eli boş kalmasını önler.</p>
    </section>
    <section class="bolum">
      <h2>Ay sonu: kalan sadakaya</h2>
      <p>Havuzda, o ayki havuz girişinin ${K.rezervKati} katı kadar ihtiyat akçesi tutulur. Sıradaki ödemeler
        ayrıldıktan sonra bunun üstünde kalan her kuruş, üyelerin seçtiği alanlara sadaka olarak dağıtılır.</p>
      <ul class="yigin" style="margin:0;padding-left:20px">
        ${SADAKA_ALANLARI.map((a) => `<li><strong>${esc(a.ad)}:</strong> ${esc(a.aciklama)}</li>`).join('')}
      </ul>
      <p class="kucuk soluk">Sadaka, anlaşmalı ve denetlenen dernek ve vakıflar aracılığıyla ulaştırılır; her ay hangi alana ne kadar gittiği yayımlanır.</p>
    </section>
    <div class="dugme-satiri"><a class="dugme" href="#hesapla">Aidatımı hesapla</a><a class="dugme ikincil" href="#katil">Üye ol</a></div>
  </div>`
}

// ---------- Hesapla ----------

function hesapla() {
  const kisi = arayuz.hesapSekme === 'kisi'
  return `<div class="kap genis">
    <section class="bolum">
      <p class="kicker">Hesaplayıcı</p>
      <h1>${kisi ? 'Aidatınız nereye gider?' : 'Sandık nasıl büyür?'}</h1>
      <div class="filtreler" role="group" aria-label="Hesaplayıcı">
        <button type="button" data-eylem="hesap-sekme" data-deger="kisi" aria-pressed="${kisi}">Benim aidatım</button>
        <button type="button" data-eylem="hesap-sekme" data-deger="sandik" aria-pressed="${!kisi}">Sandık projeksiyonu</button>
      </div>
    </section>
    ${kisi ? kisiHesabi() : sandikHesabi()}
  </div>`
}

function kisiHesabi() {
  return `<section class="kart">
      <div class="alan">
        <label for="hesap-pay">Aylık aidatınız</label>
        <div class="tutar-giris"><input id="hesap-pay" inputmode="numeric" autocomplete="off" value="${sayiYaz(arayuz.hesapPay)}"><span>TL</span></div>
        <input type="range" id="hesap-kaydirici" min="${K.asgariAidat / 100}" max="3000" step="50" value="${arayuz.hesapPay}" aria-label="Aylık aidat, kaydırarak seçin">
      </div>
      <div id="hesap-sonuc" class="yigin" aria-live="polite">${kisiSonucu()}</div>
    </section>`
}

function kisiSonucu() {
  const aidat = TL(arayuz.hesapPay)
  if (!(aidat >= K.asgariAidat)) {
    return `<p class="hata-listesi" role="alert">Aylık aidat en az ${paraYaz(K.asgariAidat)} olmalı.</p>`
  }
  const p = paylariBol(aidat)
  const t = toplamlar()
  const oran = (x) => (t.gelen ? Math.round((x / t.gelen) * 100) : 0)
  const ihtiyat = Math.max(0, 100 - oran(t.sadaka) - oran(t.destek) - oran(t.isletme))
  return `
    ${parcaliCubuk(
      [
        { ad: 'Sadaka payı', deger: p.sadaka, renk: 'akce', etiket: paraYaz(p.sadaka) },
        { ad: 'Dayanışma havuzu', deger: p.havuz, renk: 'cini', etiket: paraYaz(p.havuz) },
        { ad: 'İşletme', deger: p.isletme, renk: 'gri', etiket: paraYaz(p.isletme) },
      ],
      { aria: `Her ay ${paraYaz(p.sadaka)} sadaka payı, ${paraYaz(p.havuz)} havuz, ${paraYaz(p.isletme)} işletme` },
    )}
    <p>Her ay <strong>${paraYaz(p.sadaka)}</strong> sadaka payı olarak hemen ihtiyaç sahibine gider, <strong>${paraYaz(
      p.havuz,
    )}</strong> dayanışma havuzuna girer, ${paraYaz(p.isletme)} işletmeye gider. Bir yılda ${paraYaz(
      p.sadaka * 12,
    )} doğrudan sadaka olur.</p>
    <h3>Yardım tavanınız</h3>
    <div class="sayilar dortlu">
      ${tavanSatirlari()
        .map((s) =>
          sayiKutu(s.aralik, s.tavan ? paraYaz(s.tavan) : 'Bekleme', s.tavan ? '12 ayda en çok' : 'talep açılmaz'),
        )
        .join('')}
      ${sayiKutu('Aidat tutarı', 'Etkilemez', 'tavan herkes için aynı')}
    </div>
    <p class="kucuk soluk">Tavan bir hak ya da bakiye değildir. Kurul belgelenen ihtiyaca göre bu tavana kadar yardım edebilir.</p>
    <h3>Örnek sandıkta paranın yolculuğu</h3>
    <p>Bu demodaki sandıkta, ${t.aySayisi} ayda toplanan her 100 TL’nin yaklaşık <strong>${oran(t.sadaka)} TL’si sadaka</strong> oldu,
      ${oran(t.destek)} TL’si kara gün desteğine, ${oran(t.isletme)} TL’si işletmeye gitti; ${ihtiyat} TL’si ihtiyat akçesinde duruyor.
      Sandık büyüdükçe ihtiyat payı küçülür, sadaka payı büyür.</p>`
}

function sayiAlani(id, etiket, deger, { yardim = '', min = 0, max = '', adim = 1 } = {}) {
  return `<div class="alan"><label for="${id}">${esc(etiket)}</label>
    <input id="${id}" type="number" inputmode="decimal" min="${min}" ${max !== '' ? `max="${max}"` : ''} step="${adim}" value="${deger}" data-proj="${id.replace('proj-', '')}">
    ${yardim ? `<span class="yardim">${esc(yardim)}</span>` : ''}</div>`
}

function sandikHesabi() {
  const g = arayuz.proj
  return `<section class="kart">
      <h2>Varsayımlar</h2>
      <div class="sayilar">
        ${sayiAlani('proj-baslangicUye', 'Başlangıç üye sayısı', g.baslangicUye, { min: 1 })}
        ${sayiAlani('proj-aylikYeniUye', 'Her ay katılan yeni üye', g.aylikYeniUye)}
        ${sayiAlani('proj-ortalamaPayTL', 'Ortalama aylık aidat (TL)', g.ortalamaPayTL, { min: K.asgariAidat / 100, adim: 10 })}
        ${sayiAlani('proj-ayrilmaYuzde', 'Her ay ayrılan üye (%)', g.ayrilmaYuzde, { max: 50, adim: 0.5 })}
        ${sayiAlani('proj-talepYuzde', 'Yılda destek isteyen üye (%)', g.talepYuzde, { max: 100, adim: 1 })}
        ${sayiAlani('proj-ortalamaTalepTL', 'Ortalama destek (TL)', g.ortalamaTalepTL, { min: 250, adim: 250 })}
      </div>
      <div class="alan"><label for="proj-ay">Süre</label>
        <select id="proj-ay" data-proj="ay">${[12, 24, 36, 60]
          .map((a) => `<option value="${a}"${g.ay === a ? ' selected' : ''}>${a} ay</option>`)
          .join('')}</select></div>
      <label class="onay-satiri" for="proj-afet"><input type="checkbox" id="proj-afet" data-proj="afet"${g.afet ? ' checked' : ''}>
        <span><strong>Büyük afet senaryosu ekle</strong><br><span class="soluk kucuk">Bir ayda üyelerin bir bölümü aynı anda destek ister.</span></span></label>
      <div class="sayilar" ${g.afet ? '' : 'hidden'} id="afet-alanlari">
        ${sayiAlani('proj-afetAy', 'Afet hangi ayda', g.afetAy, { min: 1, max: g.ay })}
        ${sayiAlani('proj-afetYuzde', 'Etkilenen üye (%)', g.afetYuzde, { max: 100 })}
        ${sayiAlani('proj-afetTalepTL', 'Afette ortalama destek (TL)', g.afetTalepTL, { min: 250, adim: 250 })}
      </div>
    </section>
    <div id="proj-sonuc" class="yigin" aria-live="polite">${sandikSonucu()}</div>`
}

/** Beklenen değerler kesirli çıkar; projeksiyonda tutarlar tam TL yazılır. */
const tamTL = (kurus) => paraYaz(Math.round(kurus / 100) * 100)

function projeksiyonGirdisi() {
  const g = arayuz.proj
  const sayi = (v, varsayilan, alt = 0, ust = Infinity) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(ust, Math.max(alt, n)) : varsayilan
  }
  const ay = sayi(g.ay, 36, 1, 120)
  return {
    ay,
    baslangicUye: sayi(g.baslangicUye, 300, 1, 1e7),
    aylikYeniUye: sayi(g.aylikYeniUye, 150, 0, 1e6),
    ayrilmaOrani: sayi(g.ayrilmaYuzde, 2, 0, 50) / 100,
    ortalamaPay: TL(sayi(g.ortalamaPayTL, 350, K.asgariAidat / 100, 1e6)),
    yillikTalepOrani: sayi(g.talepYuzde, 10, 0, 100) / 100,
    ortalamaTalep: TL(sayi(g.ortalamaTalepTL, 7000, 0, 1e7)),
    afet: g.afet
      ? {
          ay: Math.round(sayi(g.afetAy, 18, 1, ay)),
          oran: sayi(g.afetYuzde, 15, 0, 100) / 100,
          ortalamaTalep: TL(sayi(g.afetTalepTL, 15000, 0, 1e7)),
        }
      : null,
  }
}

function sandikSonucu() {
  const girdi = projeksiyonGirdisi()
  const { seri, toplam } = projeksiyon(girdi)
  const sadakaOrani = toplam.katki ? Math.round((toplam.sadaka / toplam.katki) * 100) : 0
  const enYuksekTavan = K.tavanlar.at(-1)[1]
  let afetMetni = ''
  if (girdi.afet) {
    const i = girdi.afet.ay - 1
    const a = seri[i]
    const once = i > 0 ? seri[i - 1].kuyruk : 0
    const ihtiyac = once + a.ihtiyac
    const yuzde = ihtiyac ? Math.round((a.destek / ihtiyac) * 100) : 100
    const bitis = seri.findIndex((s, j) => j >= i && s.kuyruk === 0)
    afetMetni = `<div class="not-kutusu uyari"><strong>Afet ayında ihtiyaç ${paraKisa(ihtiyac)}.</strong>
      <span>O ay bunun %${yuzde}’i ödendi; kalanı sıraya girdi ve ${
        bitis >= 0 ? `${bitis - i} ay içinde ödendi.` : `dönem sonunda ${paraKisa(toplam.kuyrukSonu)} hâlâ sırada.`
      } Ödeme payı tavanı, havuzun ilk ayda tükenmesini önler.</span></div>`
  }
  const etiket = seri.map((s) => `${s.ay}. ay`)
  const adim = girdi.ay > 24 ? 6 : 3
  return `
    <div class="sayilar dortlu">
      ${sayiKutu('Toplanan aidat', paraKisa(toplam.katki), `${girdi.ay} ayda`)}
      ${sayiKutu('Sadakaya giden', paraKisa(toplam.sadaka), `aidatların %${sadakaOrani}’i`)}
      ${sayiKutu('Kara gün desteği', paraKisa(toplam.destek), `yaklaşık ${sayiYaz(toplam.destekAdet)} kişi`)}
      ${sayiKutu('Dönem sonu havuz', paraKisa(toplam.havuzSonu), `işletme ${paraKisa(toplam.isletme)}`)}
    </div>
    ${afetMetni}
    ${
      girdi.ortalamaTalep > enYuksekTavan
        ? `<div class="not-kutusu uyari">Ortalama destek, en yüksek yardım tavanının (${paraYaz(
            enYuksekTavan,
          )}) üstünde. Gerçekte yardımlar tavanla sınırlanır.</div>`
        : ''
    }
    <section class="kart">
      <h2>Her ay paralar nereye gider</h2>
      ${sutunGrafigi({
        etiketler: etiket,
        seriler: [
          { ad: 'Sadaka', renk: 'akce', degerler: seri.map((s) => s.sadaka) },
          { ad: 'Kara gün desteği', renk: 'cini', degerler: seri.map((s) => s.destek) },
          { ad: 'İşletme', renk: 'gri', degerler: seri.map((s) => s.isletme) },
        ],
        bicim: tamTL,
        etiketAdimi: adim,
        aria: 'Aylık sadaka, destek ve işletme tutarları',
      })}
    </section>
    <section class="kart">
      <h2>Havuz ve ihtiyat hedefi</h2>
      ${cizgiGrafigi({
        etiketler: etiket,
        seriler: [
          { ad: 'Havuz bakiyesi', renk: 'cini', degerler: seri.map((s) => s.havuz), alan: true },
          { ad: 'İhtiyat hedefi', renk: 'gri', degerler: seri.map((s) => s.hedef) },
        ],
        bicim: tamTL,
        etiketAdimi: adim,
        aria: 'Aylık havuz bakiyesi ve ihtiyat hedefi',
      })}
      <p class="kucuk soluk">Beklenen değer hesabıdır; gerçek aylar dalgalanır. Talep eden üyeler yalnızca bekleme süresini doldurmuş üyelerden sayılır.</p>
    </section>`
}

// ---------- Şeffaflık ----------

function seffaflik() {
  const b = bakiyeler(durum)
  const hedef = rezervHedefi(durum)
  const t = toplamlar()
  const r = durum.raporlar
  const alanToplam = {}
  for (const rap of r)
    for (const [alan, tutar] of Object.entries(rap.alanlar)) alanToplam[alan] = (alanToplam[alan] || 0) + tutar
  const fazla = b.havuz - hedef - bekleyenBorc(durum)
  const filtre = arayuz.defterFiltre
  const turlar = { destek: ['destek'], sadaka: ['dagitim', 'aktarim'], katki: ['katki'], gider: ['gider'] }
  const kayitlar = durum.defter.filter((d) => filtre === 'hepsi' || turlar[filtre].includes(d.tur)).reverse()
  const gosterilen = kayitlar.slice(0, arayuz.defterAdet)
  return `<div class="kap genis">
    <section class="bolum">
      <p class="kicker">Şeffaflık</p>
      <h1>Her kuruş nereye gitti?</h1>
      <p class="lead">Sandığın bütün para hareketleri burada. Kişiler görünmez; her desteğin türü ve tutarı görünür.</p>
      ${ornekNotu()}
    </section>
    <div class="sayilar dortlu">
      ${sayiKutu('Havuz bakiyesi', paraKisa(b.havuz), `ihtiyat hedefi ${paraKisa(hedef)}`)}
      ${sayiKutu('Bu ay ödenebilecek', paraKisa(butceKalan(durum)), `tavan ${paraKisa(durum.butce.tavan)}`)}
      ${sayiKutu('Sadakaya giden', paraKisa(t.sadaka), `${t.aySayisi} ayda`)}
      ${sayiKutu('Kara güne destek', sayiYaz(t.destekAdet), paraKisa(t.destek))}
    </div>
    <section class="kart">
      <h2>İhtiyat akçesi</h2>
      ${olcer(b.havuz, hedef, { aria: 'Havuzun ihtiyat hedefine oranı' })}
      <p>${
        fazla > 0
          ? `Havuz hedefin üstünde. Ay sonunda <strong>${paraYaz(fazla)}</strong> sadakaya aktarılacak.`
          : `Havuz, hedefin %${hedef ? sayiYaz((b.havuz / hedef) * 100) : 0}’i. Hedefe ulaşınca fazlası sadakaya gider.`
      } Hedef, o ayki havuz girişinin ${K.rezervKati} katıdır.</p>
      ${bekleyenBorc(durum) > 0 ? `<p class="not-kutusu uyari">Sırada ödenmeyi bekleyen ${paraYaz(bekleyenBorc(durum))} var; gelecek ay ilk bu ödenir.</p>` : ''}
    </section>
    ${
      r.length
        ? `<section class="kart">
      <h2>Her ay paralar nereye gitti</h2>
      ${sutunGrafigi({
        etiketler: r.map((x) => ayAdi(x.ay, { kisa: true })),
        seriler: [
          { ad: 'Sadaka', renk: 'akce', degerler: r.map((x) => x.sadaka) },
          { ad: 'Kara gün desteği', renk: 'cini', degerler: r.map((x) => x.destek) },
          { ad: 'İşletme', renk: 'gri', degerler: r.map((x) => x.isletme) },
        ],
        bicim: paraYaz,
        etiketAdimi: r.length > 8 ? 3 : 1,
        aria: 'Kapanan aylarda sadaka, destek ve işletme tutarları',
      })}
      <p class="kucuk soluk">Sütunlar kapanan ayları gösterir. Aidatların kalanı ihtiyat akçesinde durur.</p>
    </section>
    <section class="kart">
      <h2>Sadaka hangi alanlara gitti</h2>
      ${yatayCubuklar(
        Object.entries(alanToplam).map(([alan, deger]) => ({ ad: alanAdi(alan), deger })),
        { bicim: paraKisa, aria: 'Sadaka alanlarına göre toplam dağıtım' },
      )}
    </section>`
        : ''
    }
    <section class="kart">
      <h2>Defter</h2>
      <div class="filtreler" role="group" aria-label="Defter filtresi">
        ${[
          ['hepsi', 'Hepsi'],
          ['destek', 'Destek'],
          ['sadaka', 'Sadaka'],
          ['katki', 'Aidatlar'],
          ['gider', 'İşletme'],
        ]
          .map(
            ([id, ad]) =>
              `<button type="button" data-eylem="defter-filtre" data-deger="${id}" aria-pressed="${filtre === id}">${ad}</button>`,
          )
          .join('')}
      </div>
      <ol class="defter">${gosterilen
        .map(
          (d) =>
            `<li><span class="defter-aciklama">${esc(d.aciklama)}</span><span class="defter-tutar">${paraYaz(d.tutar, {
              isaret: true,
            })}</span><span class="defter-alt">${esc(ayAdi(d.ay))} · ${HESAP_ADI[d.kova]} hesabı</span></li>`,
        )
        .join('')}</ol>
      ${
        kayitlar.length > gosterilen.length
          ? `<div class="dugme-satiri"><button type="button" class="dugme sessiz kucuk" data-eylem="defter-daha">Daha eski ${Math.min(
              20,
              kayitlar.length - gosterilen.length,
            )} kaydı göster</button></div>`
          : ''
      }
      <p class="kucuk soluk">${sayiYaz(kayitlar.length)} kayıttan en yeni ${sayiYaz(gosterilen.length)} tanesi. Gerçek sürümde defter, bağımsız denetçinin raporuyla birlikte her ay yayımlanır.</p>
    </section>
  </div>`
}

// ---------- Sorular ----------

const SORULAR = [
  [
    'Bu bir sigorta mı?',
    'Hayır. Sigortada prim karşılığında belli bir ödeme sözleşmeyle taahhüt edilir. Sandık kimseye ödeme taahhüt etmez; üyelik bir yardım talep hakkı doğurmaz. Kurul, belgelenen ihtiyaca ve havuzun durumuna bakarak karar verir. Bu yüzden sandık DASK, SGK ya da özel sigortanın yerini tutmaz.',
  ],
  [
    'Ödediğim aidatı geri alabilir miyim?',
    'Hayır. Aidat derneğe ödenir; havuzdaki para derneğindir ve üyenin bakiyesi yoktur. Aidatın sadaka payı aynı ay ihtiyaç sahibine gider, kalanı havuzda kara günler için durur.',
  ],
  [
    'Ne kadar yardım alabilirim?',
    `Kurul belgelenen ihtiyacı esas alır. Üst sınır, üyeliğin 3. ayından sonra 12 ayda ${paraYaz(
      K.tavanlar[0][1],
    )}, 12. ayından sonra ${paraYaz(
      K.tavanlar.at(-1)[1],
    )}’dir. Tavan aidat tutarına bağlı değildir. Onaylanan yardım 12 ay tavandan düşülür, sonra geri döner.`,
  ],
  [
    'Daha çok aidat ödersem daha çok yardım alır mıyım?',
    'Hayır. Yardım tavanı herkes için aynıdır. Asgari aidatın üstünde ödediğiniz her kuruş, sadaka payı ve havuz fazlası olarak ihtiyaç sahiplerine gider.',
  ],
  [
    'Neden üç ay bekliyorum?',
    'Sandık, aidatını düzenli ödeyenlerin sandığıdır. Bekleme süresi, yalnızca kara günü geldiğinde katılıp hemen destek almayı önler. Böylece havuz herkes için ayakta kalır.',
  ],
  [
    'Talebim ne kadar sürede sonuçlanır?',
    `${paraYaz(
      K.hizliTavan,
    )}’ye kadar ve kalan tavanınızın yarısına kadar olan talepler hızlı incelemeyle en geç 24 saatte, diğerleri kurulda en geç 3 iş gününde sonuçlanır. Belge eksikse size hemen yazılır.`,
  ],
  [
    'Talebim uygun görülmezse ne olur?',
    'Gerekçesini görürsünüz. Bir kez itiraz edebilirsiniz; itirazınızı ilk kararı vermeyen kurul üyeleri inceler. Uygun görülmeyen talep tavanınızdan düşmez.',
  ],
  [
    'Kurul kimdir, adımı görür mü?',
    'Kurul, üyeler arasından seçilen üç gönüllü ve bir görevliden oluşur. Kimlik ve belge kontrolünü görevli yapar. Kurul adınızı görmez; üye kodunuzu, kıdeminizi, kalan tavanınızı, belgelerinizi ve açıklamanızı görür.',
  ],
  [
    'Sadakalar nereye gidiyor?',
    'Seçtiğiniz alana: gıda, eğitim, sağlık, barınma, afet ya da kurulun belirlediği en acil ihtiyaç. Sadaka, anlaşmalı ve denetlenen dernek ve vakıflar aracılığıyla ulaştırılır. Her ay hangi alana ne kadar gittiği yayımlanır.',
  ],
  [
    'Zekât ya da fitre verebilir miyim?',
    'Hayır. Zekât ve fitrenin kimlere verileceği dinen bellidir ve fakirin mülküne geçmesi gerekir; veren kişinin ileride yararlanabileceği bir havuza konamaz. Sandığa yalnızca dayanışma aidatı ve sadaka niyetiyle ödeme yapılır. Dini sorularınız için danışma kurulumuza ya da Diyanet’e başvurabilirsiniz.',
  ],
  [
    'Para nerede duruyor?',
    'Derneğin katılım bankasındaki hesabında; faiz işlemez. Hesaptan para çıkışı iki imzayla yapılır. Her yıl bağımsız denetim yapılır ve rapor yayımlanır.',
  ],
  [
    'Büyük bir afette ne olur?',
    `Bir ayda havuzun en çok %${
      K.aylikOdemeOrani * 100
    }’u ödenir. Onaylanan talepler bunu aşarsa sıraya girer ve sonraki aylarda orantılı olarak ödenir. Böylece ilk başvuranlar havuzu bitirmez.`,
  ],
  [
    'İşletme payı neden var, kim kazanıyor?',
    'Ödeme komisyonu, yazılım, personel, hukuk ve denetim giderleri içindir. Oranı en çok %10’dur ve her ay kuruşu kuruşuna yayımlanır. Sandığı bir dernek yürütür; dernek kâr dağıtmaz. Yazılımı sağlayan şirket paraya hiç dokunmaz: aidat, lisanslı ödeme kuruluşundan doğrudan derneğin hesabına geçer.',
  ],
  [
    'Verilerim güvende mi?',
    'Yalnızca gerekli veri toplanır. Sağlık bilgisi gibi hassas veriler açık rızanızla, şifreli olarak ve Türkiye’deki sunucularda saklanır; yasal süre dolunca silinir.',
  ],
  [
    'Kimler üye olabilir?',
    'Türkiye’de yaşayan, 18 yaşını doldurmuş ve kimliğini doğrulayan herkes. Üyelik, sandığı yürüten derneğe üyeliktir.',
  ],
]

function sss() {
  return `<div class="kap">
    <section class="bolum"><p class="kicker">Sorular</p><h1>Merak edilenler</h1></section>
    <div class="sss">${SORULAR.map(
      ([s, c], i) =>
        `<details${i === 0 ? ' open' : ''}><summary>${esc(s)}</summary><div class="cevap"><p>${esc(c)}</p></div></details>`,
    ).join('')}</div>
    <div class="not-kutusu"><strong>Hukuki not</strong><p>Bu sayfadaki kurallar bir tasarım önerisidir. Gerçek sandık kurulmadan önce
      dernek tüzüğü, yardım toplama (2860), sigortacılık (5684), ödeme hizmetleri (6493) ve kişisel veriler (6698) yönünden
      bir avukatla gözden geçirilmeli; mümkünse SEDDK’dan yazılı görüş alınmalıdır.</p></div>
  </div>`
}

// ---------- Katıl ----------

function katil() {
  const uye = ben()
  if (uye) {
    return `<div class="kap"><section class="bolum"><h1>Zaten üyesiniz</h1><p>Üye kodunuz ${esc(uye.kod)}.</p>
      <div class="dugme-satiri"><a class="dugme" href="#hesabim">Hesabıma git</a></div></section></div>`
  }
  const p = paylariBol(TL(arayuz.katilPay) || 0)
  return `<div class="kap">
    <section class="bolum"><p class="kicker">Üyelik</p><h1>Sandığa katılın</h1>
      <p class="lead">Üyelik, sandığı yürüten derneğe üyeliktir. Demo: gerçek para alınmaz. Gerçek sürümde aidat, lisanslı bir ödeme kuruluşu üzerinden derneğin banka hesabına geçer.</p></section>
    <form id="katil-form" class="kart" novalidate>
      <fieldset>
        <legend>Aylık aidatınız</legend>
        <div class="secimler">${[250, 500, 1000]
          .map(
            (t) =>
              `<label class="secim"><input type="radio" name="hazir-pay" value="${t}"${arayuz.katilPay === t ? ' checked' : ''}><span class="baslik">${sayiYaz(t)} TL</span></label>`,
          )
          .join('')}</div>
        <div class="alan"><label for="katil-pay">Ya da tutarı yazın</label>
          <div class="tutar-giris"><input id="katil-pay" name="pay" inputmode="numeric" autocomplete="off" value="${sayiYaz(arayuz.katilPay)}"><span>TL</span></div>
          <span class="yardim" id="katil-pay-yardim">${
            p.sadaka
              ? `${paraYaz(p.sadaka)} sadaka payı · ${paraYaz(p.havuz)} havuz · ${paraYaz(p.isletme)} işletme`
              : ''
          }</span></div>
      </fieldset>
      <fieldset>
        <legend>Sadakanız nereye gitsin?</legend>
        <div class="secimler">${SADAKA_ALANLARI.map(
          (a, i) => `<label class="secim"><input type="radio" name="alan" value="${a.id}"${i === 0 ? ' checked' : ''}>
            <span class="baslik">${esc(a.ad)}</span><span class="alt">${esc(a.aciklama)}</span></label>`,
        ).join('')}</div>
      </fieldset>
      <fieldset>
        <legend>Onaylar</legend>
        ${[
          [
            'o1',
            'Bunun bir sigorta olmadığını, üyeliğin yardım talep hakkı doğurmadığını; yardımın kurul kararına ve havuzun durumuna bağlı olduğunu biliyorum.',
          ],
          ['o2', 'Ödediğim aidatın derneğe ait olduğunu ve iade edilmediğini biliyorum.'],
          ['o3', 'Bu ödemeye zekât ya da fitre karıştırmıyorum; dayanışma aidatı ve sadaka niyetiyle ödüyorum.'],
          ['o4', 'Kişisel verilerimin aydınlatma metnine göre işlenmesini okudum.'],
        ]
          .map(
            ([id, metin]) =>
              `<label class="onay-satiri" for="katil-${id}"><input type="checkbox" id="katil-${id}" name="${id}"><span>${esc(metin)}</span></label>`,
          )
          .join('')}
      </fieldset>
      <div class="hata-yeri" aria-live="assertive"></div>
      <div class="dugme-satiri"><button type="submit" class="dugme">Üye ol ve ilk aidatı öde (demo)</button></div>
    </form>
    <div class="not-kutusu"><strong>Önce gezmek mi istersiniz?</strong>
      <p>15 aydır üye olan, bir kez yardım almış örnek bir üyenin hesabıyla gezebilirsiniz.</p>
      <div class="dugme-satiri"><button type="button" class="dugme sessiz" data-eylem="ornek-uye">Örnek üyeyle gez</button></div></div>
  </div>`
}

// ---------- Hesabım ----------

function hesabim() {
  const uye = ben()
  if (!uye) {
    return `<div class="kap">
      <section class="bolum"><p class="kicker">Hesabım</p><h1>Henüz üye değilsiniz</h1>
        <p class="lead">Demoda iki yol var: yeni üye olarak katılın ya da örnek bir üyenin hesabıyla gezin.</p></section>
      <div class="dugme-satiri"><a class="dugme" href="#katil">Üye ol</a>
        <button type="button" class="dugme sessiz" data-eylem="ornek-uye">Örnek üyeyle gez</button></div>
    </div>`
  }
  const l = uyeLimiti(durum, uye.id)
  const kidem = ayFarki(uye.katilimAy, durum.ay) + 1
  const talepler = durum.talepler
    .filter((t) => t.uyeId === uye.id)
    .slice()
    .reverse()
  const acik = talepler.some((t) => t.durum === 'inceleme' || t.durum === 'belge')
  const e = etkiHesapla(uye, durum.talepler)
  const odemeler = uye.odemeler.slice(-6).reverse()
  let destekKarti
  if (!l.aktif) {
    destekKarti = `<p class="not-kutusu uyari"><strong>Üyeliğiniz arada.</strong> Talep açmak için önce üyeliğinizi sürdürün. Döndüğünüzde üç aylık bekleme yeniden işler.</p>`
  } else if (l.beklemeKalanAy > 0) {
    const gecen = K.beklemeAy - l.beklemeKalanAy
    destekKarti = `<p class="etiket soluk">Bekleme süresi</p>
      <p class="buyuk-sayi">${l.beklemeKalanAy} ay</p>
      ${olcer(gecen, K.beklemeAy, { aria: 'Bekleme süresinin geçen kısmı' })}
      <p>${gecen}/${K.beklemeAy} ayın aidatı ödendi. ${ayDe(ayEkle(durum.ay, l.beklemeKalanAy))} talep açabilirsiniz.</p>`
  } else {
    destekKarti = `<p class="etiket soluk">Bu dönem kalan yardım tavanınız</p>
      <p class="buyuk-sayi">${paraYaz(l.kullanilabilir)}</p>
      ${olcer(l.kullanilabilir, l.limit, { aria: 'Kalan yardım tavanının 12 aylık tavana oranı' })}
      <p class="soluk">12 aylık tavan ${paraYaz(l.limit)}${l.kullanilan ? ` · son 12 ayda onaylanan ${paraYaz(l.kullanilan)}` : ''}${
        l.incelemede ? ` · incelemede ${paraYaz(l.incelemede)}` : ''
      }.</p>
      <p class="kucuk">Bu bir bakiye değildir. Kurul, belgelediğiniz ihtiyaca göre bu tavana kadar yardım edebilir.</p>
      ${l.geriDonusler.map((g) => `<p class="kucuk">${ayDe(g.ay)} ${paraYaz(g.tutar)} tavanınıza geri döner.</p>`).join('')}
      ${
        l.sonrakiTavan
          ? `<p class="kucuk">${l.sonrakiTavan.kalanAy} ay sonra tavanınız ${paraYaz(l.sonrakiTavan.tavan)} olur.</p>`
          : ''
      }`
  }
  const talepDugmesi =
    l.aktif && l.beklemeKalanAy === 0 && !acik
      ? '<a class="dugme" href="#talep">Kara gün desteği iste</a>'
      : `<span class="soluk kucuk">${acik ? 'İncelenen talebiniz sonuçlanınca yenisini açabilirsiniz.' : ''}</span>`
  return `<div class="kap">
    <section class="bolum">
      <p class="kicker">Hesabım</p>
      <h1>Üye ${esc(uye.kod)}</h1>
      <p class="soluk">${uye.sehir ? `${esc(uye.sehir)} · ` : ''}${kidem} aydır üye · aylık aidat ${paraYaz(uye.aylikPay)} · sadaka tercihi: ${esc(
        alanAdi(uye.alan),
      )}</p>
    </section>
    <section class="kart vurgulu">${destekKarti}<div class="dugme-satiri">${talepDugmesi}</div></section>
    ${
      talepler.length
        ? `<section class="bolum"><h2>Talepleriniz</h2>${talepler.map((t) => uyeTalepKarti(t)).join('')}</section>`
        : ''
    }
    <section class="kart">
      <h2>Aidatınız nereye gitti</h2>
      ${parcaliCubuk(
        [
          { ad: 'Sadaka payı', deger: e.sadaka, renk: 'akce', etiket: paraYaz(e.sadaka) },
          { ad: 'Dayanışma havuzu', deger: e.havuz, renk: 'cini', etiket: paraYaz(e.havuz) },
          { ad: 'İşletme', deger: e.isletme, renk: 'gri', etiket: paraYaz(e.isletme) },
        ],
        { ince: true, aria: 'Aidatınızın bölünüşü' },
      )}
      <ul class="parca-liste">
        <li><i class="kutu renk-akce"></i><span class="ad">Sadaka payı</span><span class="tutar">${paraYaz(e.sadaka)}</span>
          <span class="aciklama">Ödendiği ay ${esc(alanAdi(uye.alan).toLocaleLowerCase('tr-TR'))} alanına gitti.</span></li>
        <li><i class="kutu renk-cini"></i><span class="ad">Dayanışma havuzu</span><span class="tutar">${paraYaz(e.havuz)}</span>
          <span class="aciklama">Kara günü gelen üyelere destek oldu; ihtiyatın üstünde kalanı sadakaya döndü.</span></li>
        <li><i class="kutu renk-gri"></i><span class="ad">İşletme</span><span class="tutar">${paraYaz(e.isletme)}</span></li>
      </ul>
      <p>Toplam ${paraYaz(e.toplam)} aidat ödediniz. Siz üye olduğunuzdan beri sandık ${sayiYaz(
        topla(durum.raporlar.filter((r) => ayFarki(uye.katilimAy, r.ay) >= 0).map((r) => r.destekAdet)),
      )} kara güne destek oldu ve ${paraKisa(
        topla(durum.raporlar.filter((r) => ayFarki(uye.katilimAy, r.ay) >= 0).map((r) => r.sadaka)),
      )} sadaka dağıttı.</p>
    </section>
    <section class="kart">
      <h2>Aidatınız ve tercihleriniz</h2>
      <form id="pay-form" class="yigin" novalidate>
        <div class="alan"><label for="pay-yeni">Aylık aidat</label>
          <div class="tutar-giris"><input id="pay-yeni" name="pay" inputmode="numeric" autocomplete="off" value="${sayiYaz(uye.aylikPay / 100)}"><span>TL</span></div>
          <span class="yardim">Yeni tutar gelecek aydan itibaren alınır. Yardım tavanınızı değiştirmez.</span></div>
        <div class="alan"><label for="pay-alan">Sadaka tercihi</label>
          <select id="pay-alan" name="alan">${SADAKA_ALANLARI.map(
            (a) => `<option value="${a.id}"${uye.alan === a.id ? ' selected' : ''}>${esc(a.ad)}</option>`,
          ).join('')}</select></div>
        <div class="hata-yeri" aria-live="assertive"></div>
        <div class="dugme-satiri"><button type="submit" class="dugme ikincil">Kaydet</button></div>
      </form>
      ${uyelikPaneli(uye)}
    </section>
    <section class="kart">
      <h2>Son aidatlarınız</h2>
      <div class="tablo-kap"><table><thead><tr><th scope="col">Ay</th><th scope="col" class="sayi">Tutar</th></tr></thead>
        <tbody>${odemeler.map((o) => `<tr><th scope="row">${ayAdi(o.ay)}</th><td class="sayi">${paraYaz(o.tutar)}</td></tr>`).join('')}</tbody></table></div>
    </section>
    <div class="dugme-satiri"><button type="button" class="dugme sessiz" data-eylem="hesaptan-cik">Hesaptan çık (demo)</button></div>
  </div>`
}

function uyelikPaneli(uye) {
  if (uye.durum === 'ara') {
    return `<div class="karar-paneli"><p>Üyeliğiniz arada; aidat alınmıyor.</p>
      <div class="dugme-satiri"><button type="button" class="dugme" data-eylem="surdur">Üyeliği sürdür</button></div></div>`
  }
  if (arayuz.acikPanel === 'uyelik:ara') {
    return `<div class="karar-paneli"><p><strong>Ara vermek istediğinize emin misiniz?</strong> Ara süresince aidat alınmaz ve
      talep açılamaz. Döndüğünüzde üç aylık bekleme yeniden işler.</p>
      <div class="dugme-satiri"><button type="button" class="dugme" data-eylem="ara-ver">Evet, ara ver</button>
      <button type="button" class="dugme sessiz" data-eylem="panel-kapat">Vazgeç</button></div></div>`
  }
  return `<div class="karar-paneli"><div class="dugme-satiri"><button type="button" class="dugme sessiz" data-eylem="panel-ac" data-deger="uyelik:ara">Üyeliğe ara ver</button></div></div>`
}

function zamanCizelgesi(t) {
  return `<ol class="zaman">${t.gecmis
    .map((g) => `<li><span class="ay">${esc(ayAdi(g.ay, { kisa: true }))}</span>${esc(g.olay)}</li>`)
    .join('')}</ol>`
}

function uyeTalepKarti(t) {
  let eylem = ''
  if (t.durum === 'belge') {
    eylem = `<form class="karar-paneli" data-form="belge-ekle" data-talep="${t.id}" novalidate>
      <p class="not-kutusu uyari"><strong>Kurulun notu:</strong> ${esc(t.not)}</p>
      <div class="alan"><label for="belge-${t.id}">Belge ekle</label><input type="file" id="belge-${t.id}" name="belgeler" multiple>
        <span class="yardim">Demo: dosya hiçbir yere yüklenmez, yalnızca adı kaydedilir.</span></div>
      <div class="hata-yeri" aria-live="assertive"></div>
      <div class="dugme-satiri"><button type="submit" class="dugme kucuk">Gönder</button></div></form>`
  } else if (t.durum === 'uygun-degil') {
    eylem = `<div class="karar-paneli"><p><strong>Gerekçe:</strong> ${esc(t.gerekce)}</p>${
      t.itiraz
        ? '<p class="soluk kucuk">İtiraz hakkı kullanıldı.</p>'
        : arayuz.acikPanel === `${t.id}:itiraz`
          ? `<form class="yigin" data-form="itiraz" data-talep="${t.id}" novalidate>
              <div class="alan"><label for="itiraz-${t.id}">İtirazınız</label><textarea id="itiraz-${t.id}" name="aciklama" maxlength="200"></textarea></div>
              <div class="dugme-satiri"><button type="submit" class="dugme kucuk">İtirazı gönder</button>
              <button type="button" class="dugme sessiz kucuk" data-eylem="panel-kapat">Vazgeç</button></div></form>`
          : `<div class="dugme-satiri"><button type="button" class="dugme sessiz kucuk" data-eylem="panel-ac" data-deger="${t.id}:itiraz">İtiraz et</button></div>`
    }</div>`
  } else if (t.durum === 'inceleme') {
    eylem =
      arayuz.acikPanel === `${t.id}:geri`
        ? `<div class="karar-paneli"><p>Talebi geri çekmek istediğinize emin misiniz?</p><div class="dugme-satiri">
          <button type="button" class="dugme kucuk" data-eylem="geri-cek" data-talep="${t.id}">Evet, geri çek</button>
          <button type="button" class="dugme sessiz kucuk" data-eylem="panel-kapat">Vazgeç</button></div></div>`
        : `<div class="dugme-satiri"><button type="button" class="dugme sessiz kucuk" data-eylem="panel-ac" data-deger="${t.id}:geri">Talebi geri çek</button></div>`
  }
  return `<article class="talep-kart">
    <div class="talep-ust"><h3>${esc(kategoriAdi(t.kategori))}</h3><span class="tutar">${paraYaz(t.tutar)}</span></div>
    <div class="satir">${durumRozeti(t)}${yolRozeti(t)}${
      t.onaylanan ? `<span class="rozet">Onaylanan ${paraYaz(t.onaylanan)} · ödenen ${paraYaz(t.odenen)}</span>` : ''
    }</div>
    <p class="talep-aciklama">${esc(t.aciklama)}</p>
    ${zamanCizelgesi(t)}
    ${eylem}
  </article>`
}

// ---------- Talep ----------

function talep() {
  const uye = ben()
  if (!uye) {
    return `<div class="kap"><section class="bolum"><h1>Önce üye olun</h1><p>Talep açmak için sandığa üye olmanız gerekir.</p>
      <div class="dugme-satiri"><a class="dugme" href="#katil">Üye ol</a><button type="button" class="dugme sessiz" data-eylem="ornek-uye">Örnek üyeyle gez</button></div></section></div>`
  }
  const d = talepDogrula(durum, { uyeId: uye.id, kategori: 'saglik', tutar: K.asgariTalep, aciklama: 'kontrol amaçlı' })
  const engel = d.hatalar.filter((h) => !h.includes('kalan yardım tavanınızın'))
  if (engel.length) {
    return `<div class="kap"><section class="bolum"><h1>Şu an talep açılamıyor</h1>
      <ul class="hata-listesi">${engel.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
      <div class="dugme-satiri"><a class="dugme sessiz" href="#hesabim">Hesabıma dön</a></div></section></div>`
  }
  const l = d.limit
  return `<div class="kap">
    <section class="bolum"><p class="kicker">Kara gün desteği</p><h1>Ne oldu?</h1>
      <p class="lead">Kalan yardım tavanınız <strong>${paraYaz(l.kullanilabilir)}</strong>. Kurul belgelediğiniz gidere bakar;
        sigorta, SGK ya da belediyeden karşılanan kısmı düşer.</p></section>
    <form id="talep-form" class="kart" novalidate>
      <fieldset>
        <legend>Kara gün türü</legend>
        <div class="secimler">${KATEGORILER.map(
          (
            c,
            i,
          ) => `<label class="secim"><input type="radio" name="kategori" value="${c.id}"${i === 0 ? ' checked' : ''}>
            <span class="baslik">${esc(c.ad)}</span><span class="alt">${esc(c.aciklama)}</span></label>`,
        ).join('')}</div>
        <p class="yardim" id="talep-belge-yardim">İstenen belge: ${esc(KATEGORILER[0].belgeler.join('; '))}</p>
      </fieldset>
      <div class="alan"><label for="talep-tutar">Tutar</label>
        <div class="tutar-giris"><input id="talep-tutar" name="tutar" inputmode="decimal" autocomplete="off" aria-describedby="talep-tutar-yardim"><span>TL</span></div>
        <span class="yardim" id="talep-tutar-yardim">Belgelediğiniz gider kadar. En az ${paraYaz(K.asgariTalep)}, en çok ${paraYaz(l.kullanilabilir)}.</span></div>
      <div class="alan"><label for="talep-aciklama">Kısaca anlatın</label>
        <textarea id="talep-aciklama" name="aciklama" maxlength="600" placeholder="Örneğin: Annemin ameliyatı için hastanenin istediği fark ücreti."></textarea></div>
      <div class="alan"><label for="talep-belgeler">Belgeler</label><input type="file" id="talep-belgeler" name="belgeler" multiple>
        <span class="yardim">Demo: dosyalar hiçbir yere yüklenmez, yalnızca adları kaydedilir.</span></div>
      <fieldset>
        <legend>Ödeme nereye yapılsın?</legend>
        <div class="secimler">
          <label class="secim"><input type="radio" name="odemeYeri" value="kurum" checked><span class="baslik">Doğrudan kuruma</span><span class="alt">Hastane, eczane, usta, cenaze hizmeti. Önerilen.</span></label>
          <label class="secim"><input type="radio" name="odemeYeri" value="kendim"><span class="baslik">Kendi hesabıma</span><span class="alt">Adınıza kayıtlı IBAN.</span></label>
        </div>
      </fieldset>
      <div class="hata-yeri" aria-live="assertive"></div>
      <div class="dugme-satiri"><button type="submit" class="dugme">Talebi gönder</button><a class="dugme sessiz" href="#hesabim">Vazgeç</a></div>
    </form>
  </div>`
}

// ---------- Kurul ----------

const KURUL_FILTRELERI = [
  ['karar', 'Karar bekleyen', (t) => t.durum === 'inceleme'],
  ['belge', 'Belge bekleniyor', (t) => t.durum === 'belge'],
  ['sirada', 'Ödeme sırasında', (t) => t.durum === 'sirada'],
  ['sonuc', 'Sonuçlanan', (t) => ['odendi', 'uygun-degil', 'geri-cekildi'].includes(t.durum)],
]

function kurul() {
  const b = bakiyeler(durum)
  const filtre = KURUL_FILTRELERI.find((f) => f[0] === arayuz.kurulFiltre) || KURUL_FILTRELERI[0]
  const liste = durum.talepler.filter(filtre[2]).slice().reverse()
  return `<div class="kap genis">
    <section class="bolum">
      <p class="kicker">Kurul paneli</p>
      <h1>Kara gün talepleri</h1>
      <p class="ornek-veri">${ikon('bilgi')}<span>Demo: gerçekte bu ekranı yalnızca kurul üyeleri görür. Kurul talep sahibinin adını görmez; kimlik ve belge kontrolünü görevli yapar.</span></p>
    </section>
    <div class="sayilar dortlu">
      ${sayiKutu('Havuz bakiyesi', paraKisa(b.havuz))}
      ${sayiKutu('Bu ay ödenebilecek', paraKisa(butceKalan(durum)), `tavan ${paraKisa(durum.butce.tavan)}`)}
      ${sayiKutu('İhtiyat hedefi', paraKisa(rezervHedefi(durum)))}
      ${sayiKutu('Sırada bekleyen', paraKisa(bekleyenBorc(durum)))}
    </div>
    <div class="filtreler" role="group" aria-label="Talep filtresi">${KURUL_FILTRELERI.map(
      ([id, ad, f]) =>
        `<button type="button" data-eylem="kurul-filtre" data-deger="${id}" aria-pressed="${filtre[0] === id}">${ad} (${durum.talepler.filter(f).length})</button>`,
    ).join('')}</div>
    <div class="yigin">${liste.length ? liste.map(kurulTalepKarti).join('') : '<p class="soluk">Bu listede talep yok.</p>'}</div>
  </div>`
}

function kurulTalepKarti(t) {
  const uye = durum.uyeler.find((u) => u.id === t.uyeId)
  const l = limitDetay(uye, durum.talepler, durum.ay)
  const kidem = ayFarki(uye.katilimAy, durum.ay) + 1
  const sonOnay = topla(
    durum.talepler
      .filter(
        (x) => x.uyeId === uye.id && x.id !== t.id && x.onaylanan > 0 && x.kararAy && ayFarki(x.kararAy, durum.ay) < 12,
      )
      .map((x) => x.onaylanan),
  )
  const enCok = t.durum === 'inceleme' ? Math.min(t.tutar, l.kullanilabilir + t.tutar) : 0
  const kendi = uye.id === durum.benId
  const panel = arayuz.acikPanel?.startsWith(`${t.id}:`) ? arayuz.acikPanel.split(':')[1] : null
  let karar = ''
  if (t.durum === 'inceleme') {
    if (panel === 'kismi') {
      karar = `<form class="karar-paneli" data-form="kismi" data-talep="${t.id}" novalidate>
        <div class="alan"><label for="kismi-${t.id}">Onaylanacak tutar</label>
          <div class="tutar-giris"><input id="kismi-${t.id}" name="tutar" inputmode="decimal" autocomplete="off" value="${sayiYaz(enCok / 100)}"><span>TL</span></div>
          <span class="yardim">En çok ${paraYaz(enCok)}.</span></div>
        <div class="hata-yeri" aria-live="assertive"></div>
        <div class="dugme-satiri"><button type="submit" class="dugme kucuk">Bu tutarla onayla</button>
          <button type="button" class="dugme sessiz kucuk" data-eylem="panel-kapat">Vazgeç</button></div></form>`
    } else if (panel === 'belge') {
      karar = `<form class="karar-paneli" data-form="belge-iste" data-talep="${t.id}" novalidate>
        <div class="alan"><label for="not-${t.id}">Üyeye not</label>
          <textarea id="not-${t.id}" name="not" maxlength="300">Lütfen ${esc(
            (KATEGORILER.find((c) => c.id === t.kategori)?.belgeler[0] || 'ilgili belgeyi').toLocaleLowerCase('tr-TR'),
          )} ekleyin.</textarea></div>
        <div class="dugme-satiri"><button type="submit" class="dugme kucuk">Belge iste</button>
          <button type="button" class="dugme sessiz kucuk" data-eylem="panel-kapat">Vazgeç</button></div></form>`
    } else if (panel === 'red') {
      karar = `<form class="karar-paneli" data-form="red" data-talep="${t.id}" novalidate>
        <fieldset><legend>Gerekçe (üye görür)</legend>${GEREKCELER.map(
          (g, i) =>
            `<label class="onay-satiri" for="g-${t.id}-${i}"><input type="radio" id="g-${t.id}-${i}" name="gerekce" value="${i}"${
              i === 0 ? ' checked' : ''
            }><span>${esc(g)}</span></label>`,
        ).join('')}</fieldset>
        <div class="dugme-satiri"><button type="submit" class="dugme kucuk">Kararı kaydet</button>
          <button type="button" class="dugme sessiz kucuk" data-eylem="panel-kapat">Vazgeç</button></div></form>`
    } else {
      karar = `<div class="karar-paneli"><div class="dugme-satiri">
        <button type="button" class="dugme kucuk" data-eylem="onayla" data-talep="${t.id}">Onayla</button>
        <button type="button" class="dugme sessiz kucuk" data-eylem="panel-ac" data-deger="${t.id}:kismi">Kısmi onay</button>
        <button type="button" class="dugme sessiz kucuk" data-eylem="panel-ac" data-deger="${t.id}:belge">Belge iste</button>
        <button type="button" class="dugme sessiz kucuk" data-eylem="panel-ac" data-deger="${t.id}:red">Uygun değil</button>
      </div>${
        butceKalan(durum) < t.tutar
          ? `<p class="kucuk soluk">Bu ayın ödeme payında ${paraYaz(butceKalan(durum))} kaldı; onaylanırsa kalanı gelecek ay ödenir.</p>`
          : ''
      }</div>`
    }
  }
  return `<article class="talep-kart">
    <div class="talep-ust"><h3>${esc(kategoriAdi(t.kategori))}</h3><span class="tutar">${paraYaz(t.tutar)}</span></div>
    <div class="satir">${durumRozeti(t)}${yolRozeti(t)}${kendi ? '<span class="rozet bilgi">Sizin talebiniz</span>' : ''}</div>
    <div class="talep-meta"><span>Üye ${esc(uye.kod)}</span><span>${kidem} aydır üye</span>
      <span>Son 12 ayda onaylanan ${paraYaz(sonOnay)}</span>${
        t.durum === 'inceleme' ? `<span>Bu talep için en çok ${paraYaz(enCok)}</span>` : ''
      }<span>Ödeme: ${t.odemeYeri === 'kurum' ? 'doğrudan kuruma' : 'üyenin hesabına'}</span></div>
    <p class="kucuk soluk">Kurul aidat tutarını görmez; karar ihtiyaca göre verilir.</p>
    <p class="talep-aciklama">${esc(t.aciklama)}</p>
    ${
      t.belgeler.length
        ? `<ul class="belgeler" aria-label="Belgeler">${t.belgeler.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`
        : '<p class="kucuk soluk">Belge eklenmemiş.</p>'
    }
    ${kendi && t.durum === 'inceleme' ? '<p class="kucuk soluk">Gerçekte kendi talebinize karar veremezsiniz; demo için açık.</p>' : ''}
    <details class="gecmis"><summary>Geçmiş</summary>${zamanCizelgesi(t)}</details>
    ${karar}
  </article>`
}

// ---------- Eylemler ----------

function uygula(degistir, mesaj) {
  try {
    durum = degistir(durum)
    arayuz.acikPanel = null
    kaydet()
    ciz()
    if (mesaj) bildir(typeof mesaj === 'function' ? mesaj() : mesaj)
    return true
  } catch (e) {
    if (e instanceof KuralHatasi) {
      bildir(e.hatalar.join(' '))
      return false
    }
    throw e
  }
}

function ayKapanisMesaji(onceki) {
  const r = durum.raporlar.at(-1)
  return `${ayAdi(onceki)} kapandı: ${paraKisa(r.sadaka)} sadaka dağıtıldı, ${sayiYaz(r.destekAdet)} kara güne ${paraKisa(
    r.destek,
  )} destek ödendi. ${ayAdi(durum.ay)} aidatları alındı.`
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-eylem]')
  if (!el) return
  const deger = el.dataset.deger
  const talepId = el.dataset.talep
  switch (el.dataset.eylem) {
    case 'ayi-kapat': {
      const onceki = durum.ay
      uygula(
        (s) => ayiKapat(s),
        () => ayKapanisMesaji(onceki),
      )
      break
    }
    case 'sifirla':
      if (!arayuz.sifirlaOnay) {
        arayuz.sifirlaOnay = true
        ciz()
        clearTimeout(sifirlaZamanlayici)
        sifirlaZamanlayici = setTimeout(() => {
          arayuz.sifirlaOnay = false
          ciz()
        }, 5000)
      } else {
        clearTimeout(sifirlaZamanlayici)
        arayuz.sifirlaOnay = false
        uygula(() => ornekDurum(), 'Demo baştan başladı.')
      }
      break
    case 'ornek-uye':
      durum = { ...durum, benId: ornekUyeId(durum) }
      kaydet()
      if (location.hash === '#hesabim') ciz()
      else location.hash = 'hesabim'
      bildir('Örnek üyenin hesabıyla geziyorsunuz.')
      break
    case 'hesaptan-cik':
      durum = { ...durum, benId: null }
      kaydet()
      ciz()
      bildir('Hesaptan çıktınız. Üyelik sandıkta sürüyor.')
      break
    case 'hesap-sekme':
      arayuz.hesapSekme = deger
      ciz()
      break
    case 'kurul-filtre':
      arayuz.kurulFiltre = deger
      arayuz.acikPanel = null
      ciz()
      break
    case 'defter-filtre':
      arayuz.defterFiltre = deger
      arayuz.defterAdet = 20
      ciz()
      break
    case 'defter-daha':
      arayuz.defterAdet += 20
      ciz()
      break
    case 'panel-ac':
      arayuz.acikPanel = deger
      ciz()
      kok
        .querySelector('.karar-paneli input:not([type="radio"]), .karar-paneli textarea, .karar-paneli button')
        ?.focus()
      break
    case 'panel-kapat':
      arayuz.acikPanel = null
      ciz()
      break
    case 'onayla':
      uygula(
        (s) => talepKararVer(s, talepId, { tur: 'onay' }),
        () => odemeMesaji(talepId),
      )
      break
    case 'geri-cek':
      uygula((s) => geriCek(s, talepId), 'Talep geri çekildi.')
      break
    case 'ara-ver':
      uygula((s) => uyeGuncelle(s, s.benId, { durum: 'ara' }), 'Üyeliğiniz arada. İstediğiniz zaman dönebilirsiniz.')
      break
    case 'surdur':
      uygula(
        (s) => uyeGuncelle(s, s.benId, { durum: 'aktif' }),
        'Hoş geldiniz. Bu ayın aidatı alındı; üç aylık bekleme yeniden başladı.',
      )
      break
  }
})

function odemeMesaji(talepId) {
  const t = durum.talepler.find((x) => x.id === talepId)
  if (!t) return 'Karar kaydedildi.'
  return t.durum === 'odendi'
    ? `${talepId} onaylandı ve ${paraYaz(t.odenen)} ödendi.`
    : `${talepId} onaylandı. Bu ay ${paraYaz(t.odenen)} ödendi; kalan ${paraYaz(t.onaylanan - t.odenen)} gelecek ay ödenecek.`
}

function formHatasi(form, hatalar) {
  const yer = form.querySelector('.hata-yeri')
  if (!yer) return bildir(hatalar.join(' '))
  yer.innerHTML = `<ul class="hata-listesi" role="alert">${hatalar.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>`
  yer.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

function dosyaAdlari(input) {
  return Array.from(input?.files || []).map((f) => f.name)
}

document.addEventListener('submit', (e) => {
  const form = e.target
  e.preventDefault()
  const veri = new FormData(form)
  const talepId = form.dataset.talep
  try {
    if (form.id === 'katil-form') {
      const pay = paraOku(veri.get('pay'))
      const eksik = ['o1', 'o2', 'o3', 'o4'].filter((o) => !veri.get(o))
      const hatalar = []
      if (pay === null) hatalar.push('Aylık aidatı yazın.')
      if (eksik.length) hatalar.push('Devam etmek için dört onayı da işaretleyin.')
      if (hatalar.length) return formHatasi(form, hatalar)
      const r = uyeEkle(durum, { aylikPay: pay, alan: veri.get('alan'), ben: true })
      durum = r.durum
      kaydet()
      const p = paylariBol(pay)
      location.hash = 'hesabim'
      bildir(`Hoş geldiniz. İlk aidatınız alındı: ${paraYaz(p.sadaka)} sadaka oldu, ${paraYaz(p.havuz)} havuza girdi.`)
    } else if (form.id === 'talep-form') {
      const uye = ben()
      const girdi = {
        uyeId: uye.id,
        kategori: veri.get('kategori'),
        tutar: paraOku(veri.get('tutar')),
        aciklama: veri.get('aciklama'),
        belgeler: dosyaAdlari(form.querySelector('#talep-belgeler')),
        odemeYeri: veri.get('odemeYeri'),
      }
      const d = talepDogrula(durum, { ...girdi, tutar: girdi.tutar ?? 0 })
      if (!d.gecerli) return formHatasi(form, d.hatalar)
      const r = talepOlustur(durum, girdi)
      durum = r.durum
      kaydet()
      location.hash = 'hesabim'
      bildir(
        `Talebiniz alındı (${r.talepId}). ${d.yol === 'hizli' ? 'Hızlı inceleme: en geç 24 saat.' : 'Kurul incelemesi: en geç 3 iş günü.'} Demoda kararı Kurul sayfasından verebilirsiniz.`,
      )
    } else if (form.id === 'pay-form') {
      const pay = paraOku(veri.get('pay'))
      if (pay === null) return formHatasi(form, ['Aylık aidatı yazın.'])
      uygula(
        (s) => uyeGuncelle(s, s.benId, { aylikPay: pay, alan: veri.get('alan') }),
        'Kaydedildi. Yeni aidat gelecek aydan itibaren alınır.',
      )
    } else if (form.dataset.form === 'kismi') {
      const tutar = paraOku(veri.get('tutar'))
      if (tutar === null) return formHatasi(form, ['Tutarı yazın.'])
      uygula(
        (s) => talepKararVer(s, talepId, { tur: 'onay', tutar }),
        () => odemeMesaji(talepId),
      )
    } else if (form.dataset.form === 'belge-iste') {
      uygula((s) => talepKararVer(s, talepId, { tur: 'belge', not: veri.get('not') }), 'Üyeden ek belge istendi.')
    } else if (form.dataset.form === 'red') {
      const gerekce = GEREKCELER[Number(veri.get('gerekce'))]
      uygula(
        (s) => talepKararVer(s, talepId, { tur: 'red', gerekce }),
        'Karar kaydedildi. Üye gerekçeyi görecek ve bir kez itiraz edebilecek.',
      )
    } else if (form.dataset.form === 'belge-ekle') {
      const adlar = dosyaAdlari(form.querySelector('input[type="file"]'))
      if (!adlar.length) return formHatasi(form, ['En az bir belge seçin.'])
      uygula((s) => belgeEkle(s, talepId, adlar), 'Belge eklendi; talebiniz yeniden incelemede.')
    } else if (form.dataset.form === 'itiraz') {
      uygula(
        (s) => itirazEt(s, talepId, veri.get('aciklama')),
        'İtirazınız alındı; ilk kararı vermeyen kurul üyeleri inceleyecek.',
      )
    }
  } catch (hata) {
    if (hata instanceof KuralHatasi) formHatasi(form, hata.hatalar)
    else throw hata
  }
})

document.addEventListener('input', (e) => {
  const el = e.target
  if (el.id === 'hesap-pay' || el.id === 'hesap-kaydirici') {
    const tl = el.id === 'hesap-pay' ? (paraOku(el.value) ?? 0) / 100 : Number(el.value)
    arayuz.hesapPay = tl
    if (el.id === 'hesap-kaydirici') document.getElementById('hesap-pay').value = sayiYaz(tl)
    else document.getElementById('hesap-kaydirici').value = String(tl)
    document.getElementById('hesap-sonuc').innerHTML = kisiSonucu()
  } else if (el.dataset.proj) {
    const ad = el.dataset.proj
    arayuz.proj[ad] = ad === 'afet' ? el.checked : Number(el.value)
    if (ad === 'afet') document.getElementById('afet-alanlari').hidden = !el.checked
    document.getElementById('proj-sonuc').innerHTML = sandikSonucu()
  } else if (el.id === 'katil-pay') {
    const pay = paraOku(el.value)
    arayuz.katilPay = pay ? pay / 100 : 0
    const p = paylariBol(pay || 0)
    document.getElementById('katil-pay-yardim').textContent =
      pay >= K.asgariAidat
        ? `${paraYaz(p.sadaka)} sadaka payı · ${paraYaz(p.havuz)} havuz · ${paraYaz(p.isletme)} işletme`
        : `Aylık aidat en az ${paraYaz(K.asgariAidat)}.`
    for (const r of document.querySelectorAll('input[name="hazir-pay"]'))
      r.checked = Number(r.value) === arayuz.katilPay
  } else if (el.name === 'hazir-pay') {
    arayuz.katilPay = Number(el.value)
    const giris = document.getElementById('katil-pay')
    giris.value = sayiYaz(arayuz.katilPay)
    giris.dispatchEvent(new Event('input', { bubbles: true }))
  } else if (el.id === 'talep-tutar') {
    talepYardiminiGuncelle()
  } else if (el.name === 'kategori') {
    const c = KATEGORILER.find((x) => x.id === el.value)
    document.getElementById('talep-belge-yardim').textContent = `İstenen belge: ${c.belgeler.join('; ')}`
  }
})

document.addEventListener('change', (e) => {
  if (e.target.dataset?.proj === 'ay') {
    arayuz.proj.ay = Number(e.target.value)
    document.getElementById('proj-sonuc').innerHTML = sandikSonucu()
  }
})

function talepYardiminiGuncelle() {
  const uye = ben()
  const yardim = document.getElementById('talep-tutar-yardim')
  if (!uye || !yardim) return
  const tutar = paraOku(document.getElementById('talep-tutar').value)
  const l = uyeLimiti(durum, uye.id)
  if (tutar === null) {
    yardim.textContent = `Belgelediğiniz gider kadar. En az ${paraYaz(K.asgariTalep)}, en çok ${paraYaz(l.kullanilabilir)}.`
  } else if (tutar > l.kullanilabilir) {
    yardim.textContent = `Bu tutar kalan tavanınızın üstünde. En çok ${paraYaz(l.kullanilabilir)} isteyebilirsiniz.`
  } else if (tutar < K.asgariTalep) {
    yardim.textContent = `En küçük talep ${paraYaz(K.asgariTalep)}.`
  } else {
    const hizli = tutar <= K.hizliTavan && tutar <= l.kullanilabilir * K.hizliLimitOrani
    yardim.textContent = hizli ? 'Hızlı inceleme: en geç 24 saat.' : 'Kurul incelemesi: en geç 3 iş günü.'
  }
}

// ---------- İpuçları (grafikler) ----------

const ipucuKutusu = document.createElement('div')
ipucuKutusu.className = 'ipucu'
ipucuKutusu.hidden = true
ipucuKutusu.setAttribute('role', 'tooltip')
document.body.append(ipucuKutusu)
let ipucuKaynagi = null

function ipucuGoster(el) {
  let veri
  try {
    veri = JSON.parse(el.dataset.ipucu)
  } catch {
    return
  }
  ipucuKaynagi = el
  const baslik = document.createElement('div')
  baslik.className = 'ipucu-baslik'
  baslik.textContent = veri.b
  const satirlar = veri.r.map(([ad, deger, renk]) => {
    const satir = document.createElement('div')
    satir.className = 'ipucu-satir'
    const anahtar = document.createElement('i')
    anahtar.className = `ipucu-anahtar renk-${renk}`
    const d = document.createElement('strong')
    d.textContent = deger
    const a = document.createElement('span')
    a.textContent = ad
    satir.append(anahtar, d, a)
    return satir
  })
  ipucuKutusu.replaceChildren(baslik, ...satirlar)
  ipucuKutusu.hidden = false
  const r = el.getBoundingClientRect()
  const k = ipucuKutusu.getBoundingClientRect()
  const x = Math.min(Math.max(8, r.left + r.width / 2 - k.width / 2), window.innerWidth - k.width - 8)
  let y = r.top - k.height - 8
  if (y < 64) y = Math.min(r.bottom + 8, window.innerHeight - k.height - 8)
  ipucuKutusu.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
}

function ipucuGizle() {
  ipucuKutusu.hidden = true
  ipucuKaynagi = null
}

document.addEventListener('pointerover', (e) => {
  const el = e.target.closest?.('[data-ipucu]')
  if (el && el !== ipucuKaynagi) ipucuGoster(el)
})
document.addEventListener('pointerout', (e) => {
  if (e.pointerType === 'touch') return
  const el = e.target.closest?.('[data-ipucu]')
  if (el && !el.contains(e.relatedTarget)) ipucuGizle()
})
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest?.('[data-ipucu]')) ipucuGizle()
})
document.addEventListener('focusin', (e) => {
  const el = e.target.closest?.('[data-ipucu]')
  if (el) ipucuGoster(el)
  else ipucuGizle()
})
window.addEventListener('scroll', ipucuGizle, { passive: true })

// ---------- Başlat ----------

window.addEventListener('hashchange', () => {
  arayuz.acikPanel = null
  ipucuGizle()
  ciz({ basaDon: true })
})

window.addEventListener('storage', (e) => {
  if (e.key !== ANAHTAR) return
  durum = yukle()
  ciz()
})

ciz()
