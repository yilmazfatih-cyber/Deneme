// KAP kayıtlarından: bildirim türüne göre fiyat tepkisi, takvim zamanlı sepet testleri, portföy şirketi profilleri ve ortak hisse ağı,
// yabancı oranı kesiti, sektör endekslerinin uzun dönem mevsimselliği. Veri yoksa ilgili şekil hiç kurulmaz.
const KONU_AD = [
  ['geri_alim_ilk', 'Pay geri alımı (ilk bildirim)'], ['bedelsiz_ilk', 'Bedelsiz sermaye artırımı (ilk bildirim)'], ['bedelsiz_onay', 'Bedelsiz: SPK onayı'],
  ['bedelli_ilk', 'Bedelli sermaye artırımı (ilk bildirim)'], ['tahsisli_ilk', 'Tahsisli sermaye artırımı (ilk bildirim)'], ['kar_payi_yk', 'Kâr payı: yönetim kurulu kararı'],
  ['birlesme_ilk', 'Birleşme (ilk bildirim)'], ['pay_kap_ilk', 'Ortaklık payı eşik bildirimi (ilk)'],
  ['pay_portfoy', 'Portföy şirketi pay bildirimi'], ['pay_sirket_ilk', 'Şirketin başka şirkette pay alımı (ilk)'],
];
const KURAL_AD = [
  ['geri_alim_acilis_5g', 'İlk geri alım: ertesi açılışta al, 5 gün tut'], ['geri_alim_kapanis_5g', 'İlk geri alım: kapanışta al, 5 gün tut'],
  ['geri_alim_kapanis_20g', 'İlk geri alım: 20 gün tut'], ['geri_alim_kapanis_60g', 'İlk geri alım: 60 gün tut'], ['kar_payi_20g', 'Kâr payı kararı: 20 gün tut'],
  ['portfoy_alim_20g', 'Portföy şirketi alım bildirimi: 20 gün tut'], ['portfoy_20g', 'Portföy şirketi bildirimi: 20 gün tut'],
  ['portfoy_satim_20g', 'Portföy şirketi satım bildirimi: 20 gün tut'], ['sirket_alimi_20g', 'Şirketin pay alımı: 20 gün tut'],
  ['kap_esik_alim_20g', 'Eşik bildirimi, pay artışı: 20 gün tut'], ['kap_esik_20g', 'Ortaklık payı eşik bildirimi: 20 gün tut'], ['kap_esik_satim_20g', 'Eşik bildirimi, pay azalışı: 20 gün tut'],
  ['bedelli_20g', 'Bedelli kararı: 20 gün tut'], ['bedelsiz_60g', 'Bedelsiz kararı: 60 gün tut'], ['bedelsiz_20g', 'Bedelsiz kararı: 20 gün tut'],
];
const PEN_AD = [['once_20g', 'Önceki 20 gün'], ['gece_0', 'Açılış boşluğu'], ['gunici_0', 'İlk gün, açılıştan kapanışa'], ['sonra_5g', 'Sonraki 5 gün'], ['sonra_20g', 'Sonraki 20 gün']];
const tDeger = x => (x && x.t != null ? x.t : 0);

function gorunumBildirim(kok) {
  const K = al(V, 'ek', 'kap');
  if (!K || !K.olay || !K.olay.konu) {
    kok.append(giris('KAP bildirimleri', 'Bildirim verisi henüz yüklenmedi.'));
    return;
  }
  const O = K.olay, R = K.kural || {};
  const an = O.an_sayim || {};
  const toplamAn = (an.oncesi || 0) + (an.seans || 0) + (an.sonrasi || 0);
  const bz = O.konu.bedelsiz_ilk || {}, ga = O.konu.geri_alim_ilk || {}, bl = O.konu.bedelli_ilk || {};
  kok.append(giris('KAP bildirimi gelince fiyat ne yapıyor?',
    `2024'ten bu yana ${tam(O.bildirim)} bildirim tam yayım saatiyle incelendi: geri alımlar, sermaye artırımları, kâr payları, pay alım satımları. ` +
    `Bildirimlerin **${yzp((an.sonrasi || 0) / (toplamAn || 1))}**'i seans kapandıktan sonra geliyor; tepki ertesi sabahın açılış fiyatına yazılıyor. ` +
    'Haberi görüp alan, çoğu zaman tepkinin bittiği yerden alıyor. Getiriler hissenin kendi pazar katmanına göre fazla getiridir.'));

  // 1) Olay tablosu
  let pen = 'sonra_20g';
  const satirlar = KONU_AD.filter(([k]) => O.konu[k] && O.konu[k].olay >= 20);
  const oEl = cizimKutusu();
  const oCiz = cubukYatay(oEl, { baslik: 'Bildirim türüne göre fazla getiri', seri: [{ ad: 'Fazla getiri' }], isaretRenk: true, bicim: v => yz(v, 1), etiketGen: 280,
    satir: () => satirlar.map(([k, ad]) => { const o = O.konu[k], x = o[pen] || {}; return { ad, alt: `${tam(o.olay)} bildirim, ${tam(o.hisse)} hisse`, v: [x.ort], isaret: [Math.abs(tDeger(x)) >= 2],
      ipucu: () => PEN_AD.map(([p2, pad]) => tipSatir(pad, `${yz(al(o, p2, 'ort'), 2)} (t ${sy(al(o, p2, 't'), 1)})`)) }; }) });
  kok.append(h('div', { class: 'grid' },
    sekil({ baslik: 'Bildirim türüne göre fiyat tepkisi', cls: 'y8', alt: 'Bildirimin fiyata ilk yansıyabildiği gün "ilk gün" sayılır. Nokta: |t| ≥ 2 (aynı günün bildirimleri tek gözlem sayılarak).' },
      h('div', { class: 'ctl' }, seg(PEN_AD.map(([k, ad]) => ({ k, ad })), pen, k => { pen = k; oCiz(); }, 'Pencere')), oEl,
      tabloAc([{ ad: 'Bildirim' }, { ad: 'Olay', n: 1 }].concat(PEN_AD.map(x => ({ ad: x[1], n: 1 }))),
        () => satirlar.map(([k, ad]) => [ad, tam(O.konu[k].olay)].concat(PEN_AD.map(([p2]) => `${yz(al(O.konu[k], p2, 'ort'), 1)} (${sy(al(O.konu[k], p2, 't'), 1)})`)))) ),
    sekil({ baslik: 'Üç bildirim, üç ayrı hikâye', cls: 'y4' },
      h('ul', { class: 'duz' },
        h('li', null, metin(`**Bedelsiz:** haberden önceki 20 günde ${yz(al(bz, 'once_20g', 'ort'), 1)}, haber sabahı açılışta ${yz(al(bz, 'gece_0', 'ort'), 1)}; sonraki 20 günde **${yz(al(bz, 'sonra_20g', 'ort'), 1)}**. Bedelsiz şirkete para getirmez; sıçrama beklentinin fiyatıdır ve geri verilir.`)),
        h('li', null, metin(`**Bedelli:** açılışta ${yz(al(bl, 'gece_0', 'ort'), 1)}, sonraki 20 günde ${yz(al(bl, 'sonra_20g', 'ort'), 1)} daha. Ortaktan para isteyen şirkette düşüş ilk günle bitmiyor.`)),
        h('li', null, metin(`**Geri alım:** öncesinde hisse zayıf (${yz(al(ga, 'once_20g', 'ort'), 1)}); ilk bildirimin günü açılıştan kapanışa ${yz(al(ga, 'gunici_0', 'ort'), 2)}, sonraki 5 günde ${yz(al(ga, 'sonra_5g', 'ort'), 1)}. Şirket almaya devam ettiği için tepki açılışla sınırlı kalmıyor.`))))));

  // 2) Takvim zamanlı sepet testi
  const kr = KURAL_AD.filter(([k]) => R[k] && al(R[k], 'net', 'fazla_ort') != null);
  const kEl = cizimKutusu();
  const gaA = R.geri_alim_acilis_5g || {};
  kok.append(h('div', { class: 'grid' },
    sekil({ baslik: 'Aynı bildirimler bir kurala dönüşünce', alt: `Her bildirimden sonra hisse alınıp belirtilen süre tutulsaydı: sepetin, pazar katmanına göre günlük fazla getirisi (baz puan). Gidiş-dönüş ${sy((R.maliyet || 0.003) * 1e4, 0)} bp maliyet düşüldü; alım anında tavanda olan hisse alınmadı. Nokta: |t| ≥ 2.` },
      kEl,
      p(`Olay ortalamaları birkaç hisseye ve kalabalık günlere fazla ağırlık verir; bu test her günü bir kez sayar. Sonuç: **bedelsiz, bedelli ve eşik bildirimlerinin ardından almak düzenli biçimde kaybettiriyor** (iki yarıda da, her yıl). ` +
        (gaA.net ? `Tek olumlu aday ilk geri alım bildirimi: ertesi açılışta alıp 5 gün tutmak maliyet sonrası yılda ${yz(al(gaA, 'net', 'yillik'), 0)}, günlük fazla getiri ${bpz(al(gaA, 'net', 'fazla_ort'))} (t ${sy(al(gaA, 'net', 'fazla_t'), 1)}); ` +
          `dönemin iki yarısında ${(al(gaA, 'net', 'fazla_yari') || []).map(x => bpz(x)).join(' ve ')}. Deflated Sharpe ${sy(gaA.dsr_fazla, 2)}: çoklu deneme eşiğinin altında, bu yüzden "aday".` : ''), 'okuma'),
      tabloAc([{ ad: 'Kural' }, { ad: 'Alınan', n: 1 }, { ad: 'Net yıllık', n: 1 }, { ad: 'Kıyas yıllık', n: 1 }, { ad: 'Fazla (bp/gün)', n: 1 }, { ad: 't', n: 1 }, { ad: 'İlk yarı', n: 1 }, { ad: 'İkinci yarı', n: 1 }, { ad: 'En büyük düşüş', n: 1 }],
        () => kr.map(([k, ad]) => { const r = R[k], n = r.net || {}; return [ad, tam(r.alinan), yz(n.yillik, 0), yz(al(r, 'kiyas', 'yillik'), 0), sy((n.fazla_ort || 0) * 1e4, 1), sy(n.fazla_t, 1),
          sy(((n.fazla_yari || [])[0] || 0) * 1e4, 1), sy(((n.fazla_yari || [])[1] || 0) * 1e4, 1), yz(n.en_buyuk_dusus, 0)]; }))) ));
  cubukYatay(kEl, { baslik: 'Bildirim kurallarının günlük fazla getirisi', seri: [{ ad: 'Günlük fazla getiri' }], isaretRenk: true, bicim: v => sy(v * 1e4, 1) + ' bp', etiketGen: 330, degerGen: 70,
    satir: kr.map(([k, ad]) => { const r = R[k], n = r.net || {}; return { ad, alt: `${tam(r.alinan)} alım, ortalama ${sy(r.ort_pozisyon, 0)} pozisyon`, v: [n.fazla_ort], isaret: [Math.abs(n.fazla_t || 0) >= 2],
      ipucu: () => [tipSatir('Net yıllık getiri', yz(n.yillik, 0)), tipSatir('Kıyas (pazar katmanı)', yz(al(r, 'kiyas', 'yillik'), 0)), tipSatir('Günlük fazla getiri', bpz(n.fazla_ort)), tipSatir('t', sy(n.fazla_t, 1)),
        tipSatir('İki yarı', (n.fazla_yari || []).map(x => sy(x * 1e4, 1)).join(' / ') + ' bp'), tipSatir('Deflated Sharpe (fazla)', sy(r.dsr_fazla, 2))] }; })
      .sort((a, b) => (b.v[0] || 0) - (a.v[0] || 0)) });

  // 3) Yayım anı
  const aEl = cizimKutusu();
  const AN = [['oncesi', 'Açılıştan önce'], ['seans', 'Seans içinde'], ['sonrasi', 'Kapanıştan sonra ya da tatilde']];
  kok.append(h('div', { class: 'grid' },
    sekil({ baslik: 'Bildirimler ne zaman yayımlanıyor?', cls: 'y5', alt: 'Fiyata ilk yansıyabildiği işlem gününe göre.' }, aEl,
      p('Kapanıştan sonra gelen haberi ertesi sabah açılış seansı fiyatlar. Açılışta piyasa emriyle alan, gece boyunca birikmiş tüm talebin oluşturduğu fiyatı öder.', 'okuma')),
    sekil({ baslik: 'Bu bölümden çıkan kurallar', cls: 'y7' },
      h('div', { class: 'kural-liste' },
        h('div', { class: 'kural' }, h('div', null, h('h4', { text: 'Bedelsiz haberi' }), p('Haber çıktıktan sonra **alma**; elindeyse sabahki sıçramada sat.', 'ne')),
          p(`20 gün tutmak: günlük ${bpz(al(R, 'bedelsiz_20g', 'net', 'fazla_ort'))} (t ${sy(al(R, 'bedelsiz_20g', 'net', 'fazla_t'), 1)}), yılda ${yz(al(R, 'bedelsiz_20g', 'net', 'yillik'), 0)}.`, 'kanit'), hap('kacin', 'Kaçın')),
        h('div', { class: 'kural' }, h('div', null, h('h4', { text: 'Bedelli kararı' }), p('Karar çıkan hisseden **çık**; düşüş haftalarca sürüyor.', 'ne')),
          p(`20 gün tutmak: günlük ${bpz(al(R, 'bedelli_20g', 'net', 'fazla_ort'))} (t ${sy(al(R, 'bedelli_20g', 'net', 'fazla_t'), 1)}).`, 'kanit'), hap('kacin', 'Kaçın')),
        h('div', { class: 'kural' }, h('div', null, h('h4', { text: 'Ortaklık payı eşik bildirimi' }), p('Bir ortağın %5, %10 gibi eşikleri geçtiği bildirimi alım işareti sayma.', 'ne')),
          p(`Öncesinde ${yz(al(O.konu, 'pay_kap_ilk', 'once_20g', 'ort'), 1)} yükseliş; sonrasında 20 gün tutmak günlük ${bpz(al(R, 'kap_esik_20g', 'net', 'fazla_ort'))} (t ${sy(al(R, 'kap_esik_20g', 'net', 'fazla_t'), 1)}).`, 'kanit'), hap('kacin', 'Kaçın')),
        h('div', { class: 'kural' }, h('div', null, h('h4', { text: 'İlk geri alım bildirimi' }), p('Akşam gelen ilk geri alım bildiriminin ertesi sabahı açılışta al, 5 işlem günü tut.', 'ne')),
          p(`Günlük fazla getiri ${bpz(al(gaA, 'net', 'fazla_ort'))} (t ${sy(al(gaA, 'net', 'fazla_t'), 1)}); yıllara göre ${Object.entries(gaA.yil_fazla || {}).map(([y, v]) => `${y} ${yz(v, 0)}`).join(', ')} (yıllık fazla).`, 'kanit'), hap('aday', 'Aday'))))));
  cubukDikey(aEl, { baslik: 'Yayım anına göre bildirim sayısı', kat: AN.map(x => x[1]), bicim: v => tam(v), eksenBicim: v => tam(v), yukseklik: 190,
    seri: [{ ad: 'Bildirim', renk: 'var(--s1)', v: AN.map(x => an[x[0]] || 0) }] });
}

// --- Fonlar bölümüne eklenen KAP kayıtları ---
function cemberAg(el, baglar) {
  return ciz(el, w => {
    const derece = new Map();
    baglar.forEach(b => { derece.set(b.a, (derece.get(b.a) || 0) + b.adet); derece.set(b.b, (derece.get(b.b) || 0) + b.adet); });
    const dugum = [...derece.keys()].sort((x, y) => derece.get(y) - derece.get(x));
    const H = Math.min(Math.max(300, w * 0.8), 440);
    const cx = w / 2, cy = H / 2, r = Math.min(w / 2 - 92, H / 2 - 34);
    const yer = new Map(dugum.map((d, i) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / dugum.length; return [d, [cx + r * Math.cos(a), cy + r * Math.sin(a), a]]; }));
    const svg = sv('svg', { viewBox: `0 0 ${w} ${H}`, width: w, height: H, role: 'img', 'aria-label': 'Portföy şirketlerinin ortak hisse ağı' });
    baglar.forEach(b => {
      const [x1, y1] = yer.get(b.a), [x2, y2] = yer.get(b.b);
      const g = sv('g', { class: 'satir', tabindex: 0 });
      g.append(sv('line', { x1, y1, x2, y2, stroke: 'var(--s1)', 'stroke-opacity': 0.55, 'stroke-width': 0.8 + b.adet * 0.9, 'stroke-linecap': 'round' }));
      g.append(sv('line', { x1, y1, x2, y2, stroke: 'transparent', 'stroke-width': 14 }));
      tipBaglan(g, () => [tipBaslik(`${b.a} – ${b.b}`, `${b.adet} ortak hisse`), h('div', { class: 'ts mono', text: b.ortak.join(' ') })]);
      svg.append(g);
    });
    dugum.forEach(d => {
      const [x, y, a] = yer.get(d);
      svg.append(sv('circle', { cx: x, cy: y, r: 4 + Math.sqrt(derece.get(d)), fill: 'var(--s1)', stroke: 'var(--surface)', 'stroke-width': 2 }));
      const sag = Math.cos(a) > 0.2, sol = Math.cos(a) < -0.2;
      svg.append(sv('text', { x: x + (sag ? 12 : sol ? -12 : 0), y: y + (sag || sol ? 0 : Math.sin(a) > 0 ? 20 : -14), 'text-anchor': sag ? 'start' : sol ? 'end' : 'middle', 'dominant-baseline': 'middle', text: d }));
    });
    el.append(svg);
  });
}

function gorunumKap(kok, K) {
  const F = K.fon;
  if (!F || !F.hepsi) return;
  const hep = F.hepsi, R = K.kural || {};
  const ho = Object.entries(F.hedef_ozellikleri || {}).sort((a, b) => b[1].medyan - a[1].medyan);
  const sirketler = Object.entries(F.sirket || {}).sort((a, b) => b[1].bildirim - a[1].bildirim);
  const hoEl = cizimKutusu(), agEl = cizimKutusu();
  const om = (s, k) => (al(s, 'ozellik_medyan', k) == null ? '–' : String(Math.round(al(s, 'ozellik_medyan', k) * 100)));
  const yonVar = sirketler.some(([, s]) => s.alim || s.satim);
  const buyukler = sirketler.filter(([, s]) => s.bildirim >= 10);
  const oz = (s, k) => al(s, 'ozellik_medyan', k);
  const tipler = {
    hareketli: buyukler.filter(([, s]) => oz(s, 'oynaklik_20g') >= 0.8 && oz(s, 'defter_piyasa') != null && oz(s, 'defter_piyasa') <= 0.33).map(x => x[0]),
    genis: buyukler.filter(([, s]) => s.hisse_sayisi >= 30).map(x => x[0]),
    sakin: buyukler.filter(([, s]) => oz(s, 'oynaklik_20g') != null && oz(s, 'oynaklik_20g') <= 0.62 && oz(s, 'defter_piyasa') >= 0.4).map(x => x[0]),
    yeni: buyukler.filter(([, s]) => s.ilk >= '2026-09-01').map(x => x[0]),
  };
  kok.append(h('div', { class: 'grid' },
    sekil({ baslik: 'KAP kayıtlarından: portföy şirketleri hangi hisseleri seçiyor?', alt: `2024'ten bu yana portföy yönetim şirketlerinin verdiği ${tam(F.bildirim)} pay alım satım bildirimi; ${tam(F.sirket_sayisi)} şirket, ${tam(F.hisse_sayisi)} hisse. Bildirim, bir şirketteki pay %5 ve katlarını geçince verilir: yani fonun gerçekten büyük pay tuttuğu hisseler.` },
      h('div', { class: 'sayilar' }, sayi(yzp(1 - (hep.bist100_payi || 0)), 'hisselerin BIST 100 dışında olanı'), sayi(sy(hep.hao_medyan_mlr, 1) + ' mlr TL', 'ortadaki hissenin halka açık değeri'),
        sayi(yzp(hep.yeni_arz_payi), 'son bir yılda halka arz olmuş'), sayi(tam((hep.arz_yasi_medyan_gun || 0) / 365) + ' yıl', 'ortadaki hissenin borsadaki yaşı')),
      p('Seçilen hisse küçük ama cüce değil: fonun %5 ve üstü pay tutabileceği kadar küçük, günlük alım satım yapabileceği kadar hareketli. Yeni halka arzlar bu bildirimlerin küçük bir bölümü; ağırlık yıllardır işlem gören küçük şirketlerde.', 'okuma')),
    sekil({ baslik: 'Hedef hissenin bildirim öncesi görünümü', cls: 'y5', alt: 'Her (şirket, hisse) çiftinin ilk bildiriminden bir gün önce, hissenin tüm BIST içindeki sırası. Çizgi: ortadaki hisse. Nokta: ortadan farkı anlamlı.' },
      hoEl, p(ho.length ? `Fonların büyük pay aldığı hisse tipik olarak **oynak** (${Math.round(al(F, 'hedef_ozellikleri', 'oynaklik_20g', 'medyan') * 100)}. yüzdelik), **çok el değiştiren** (${Math.round(al(F, 'hedef_ozellikleri', 'devir_hizi_20g', 'medyan') * 100)}.), ` +
        `**son altı ayda yükselmiş** (${Math.round(al(F, 'hedef_ozellikleri', 'momentum_120_20', 'medyan') * 100)}.) ve **defter değerine göre pahalı** (${Math.round(al(F, 'hedef_ozellikleri', 'defter_piyasa', 'medyan') * 100)}.). Kazanç verimi ortalama: ucuzluk bir ölçüt değil.` : '', 'okuma')),
    sekil({ baslik: 'Şirketler hangi hisselerde buluşuyor?', cls: 'y7', alt: 'İki portföy şirketi aynı hissede bildirim verdiyse bir çizgiyle bağlanır; çizgi kalınlığı ortak hisse sayısı. Bir çizginin üstüne gelince hisseler görünür.' },
      agEl, p('Aynı küçük hissede birden çok fon şirketi büyük pay tuttuğunda çıkış kapısı daralır: biri satmak zorunda kaldığında diğerlerinin payı da değer kaybeder ve satış zincirleme olur. 17 Eylül 2026 kararından sonra olan buydu.', 'okuma'),
      tabloAc([{ ad: 'Şirketler' }, { ad: 'Ortak', n: 1 }, { ad: 'Hisseler' }], () => (F.ortak_hisse_agi || []).map(b => [`${b.a} – ${b.b}`, String(b.adet), h('span', { class: 'mono', text: b.ortak.join(' ') })])))));
  cubukYatay(hoEl, { baslik: 'Hedef hisselerin özellikleri', seri: [{ ad: 'Medyan yüzdelik', renk: 'var(--s1)' }], bicim: v => yzp(v), enBuyuk: 1, cizgi: 0.5, etiketGen: 210,
    satir: ho.map(([k, v]) => ({ ad: ozAd(k), alt: `${v.n} şirket-hisse çifti`, v: [v.medyan], isaret: [Math.abs(v.t || 0) >= 2], ipucu: () => [tipSatir('Medyan yüzdelik', yzp(v.medyan)), tipSatir('Ortalama', yzp(v.ort)), tipSatir('Ortadan fark, t', sy(v.t, 1))] })) });
  cemberAg(agEl, (F.ortak_hisse_agi || []).slice(0, 24));

  const pd = R.portfoy_donem || {};
  const donemler = Object.keys(pd);
  kok.append(h('div', { class: 'grid' },
    sekil({ baslik: 'Şirket şirket: kim neyi, nasıl seçiyor?', alt: 'Özellik sütunları hedef hisselerin medyan yüzdeliğidir (50 = ortadaki hisse). Yüksek oynaklık ve momentum ile düşük defter/piyasa "hareketli ve pahalı" hisseyi; tersi "sakin ve ucuz" hisseyi gösterir.' },
      tablo([{ ad: 'Şirket' }, { ad: 'Bildirim', n: 1 }, { ad: 'Hisse', n: 1 }, { ad: 'Dönem' }, { ad: 'En çok bildirim verilen hisseler' }, { ad: 'Oynaklık', n: 1 }, { ad: 'Momentum', n: 1 }, { ad: 'Devir', n: 1 }, { ad: 'Defter/piyasa', n: 1 },
        { ad: 'BIST 100 payı', n: 1 }, { ad: 'Medyan HAD (mlr)', n: 1 }].concat(yonVar ? [{ ad: 'Alım / satım', n: 1 }] : []),
        sirketler.map(([ad, s]) => [ad, tam(s.bildirim), tam(s.hisse_sayisi), `${s.ilk.slice(0, 7)} – ${s.son.slice(0, 7)}`, h('span', { class: 'mono', text: (s.hisseler || []).slice(0, 7).map(x => x[0]).join(' ') }),
          om(s, 'oynaklik_20g'), om(s, 'momentum_120_20'), om(s, 'devir_hizi_20g'), om(s, 'defter_piyasa'), yzp(s.bist100_payi), sy(s.hao_medyan_mlr, 1)].concat(yonVar ? [`${al(s, 'alim', 'bildirim') || 0} / ${al(s, 'satim', 'bildirim') || 0}`] : [])), { sinirli: true, genis: true }),
      p(`Üç tip ayrışıyor. **Hareket peşindekiler** (hedefleri oynaklıkta en üst beşte bir, defter değerine göre en pahalı üçte bir): ${tipler.hareketli.join(', ') || 'yok'}. ` +
        `**Geniş sepet kuranlar** (30 ve üstü hissede bildirim): ${tipler.genis.join(', ') || 'yok'}. **Sakin seçenler** (ortalama oynaklık, defter değerine göre ucuz ya da ortalama): ${tipler.sakin.join(', ') || 'yok'}.` +
        (tipler.yeni.length ? ` ${tipler.yeni.join(' ve ')} bildirimlerinin tamamı Eylül 2026 ve sonrasına ait; basında, işleme kapatılan fonların işlemlerini banka portföy şirketlerinin yürüttüğü aktarıldı.` : ''), 'okuma')),
    donemler.length ? sekil({ baslik: 'Fon bildirimi artık yükseliş işareti değil', cls: 'y6', alt: 'Portföy şirketi bildirimlerinin öncesinde ve sonrasında hissenin fazla getirisi, fon rehberinin değiştiği 28 Ağustos 2026 öncesi ve sonrası.' },
      tablo([{ ad: 'Dönem' }, { ad: 'Bildirim', n: 1 }, { ad: 'Önceki 20 gün', n: 1 }, { ad: 'İlk gün', n: 1 }, { ad: 'Sonraki 5 gün', n: 1 }, { ad: 'Sonraki 20 gün', n: 1 }],
        donemler.map(d => [d, tam(pd[d].bildirim), yz(al(pd[d], 'once_20g', 'ort'), 1), yz(al(pd[d], 'gun_0', 'ort'), 1), yz(al(pd[d], 'sonra_5g', 'ort'), 1), yz(al(pd[d], 'sonra_20g', 'ort'), 1)])),
      p(`Sepet testinde de aynı kırılma var: bildirimden sonra 20 gün tutmanın yıllık fazla getirisi ${Object.entries(al(R, 'portfoy_20g', 'yil_fazla') || {}).map(([y, v]) => `${y} **${yz(v, 0)}**`).join(', ')}. ` +
        'Fon girişi sürerken bildirim "burada alıcı var" demekti; giriş durunca aynı bildirim "burada satıcı olacak" demeye başladı.', 'okuma')) : null,
    (F.en_kalabalik_hisseler || []).length ? sekil({ baslik: 'En çok fon şirketinin buluştuğu hisseler', cls: 'y6', alt: 'Birden fazla portföy şirketinin pay bildirimi verdiği hisseler.' },
      tablo([{ ad: 'Hisse' }, { ad: 'Şirket', n: 1 }, { ad: 'Bildirim', n: 1 }, { ad: 'Şirketler' }],
        F.en_kalabalik_hisseler.slice(0, 14).map(x => [h('span', { class: 'mono', text: x.hisse }), String(x.sirket), String(x.bildirim), x.sirketler.join(', ')]), { sinirli: true })) : null));
}

// --- Yatırımcı izleri bölümüne eklenen yabancı oranı ---
function yabanciSekli() {
  const Y = al(V, 'ek', 'yabanci', 'kesit');
  if (!Y || !Y.ozellik) return null;
  const SEC = ['halka_acik_deger', 'buyukluk', 'roe', 'kazanc_verimi', 'momentum_120_20', 'zirveye_yakinlik', 'defter_piyasa', 'oynaklik_20g', 'max_20g', 'halka_aciklik'].filter(k => Y.ozellik[k]);
  const SER = [{ ad: 'Tüm hisseler', renk: 'var(--s1)' }, { ad: 'BIST 100 içinde', renk: 'var(--s2)' }];
  const oEl = cizimKutusu(), gEl = cizimKutusu();
  const kor = k => al(Y, 'ozellik', k, 'bist100_sira_kor');
  const fig = h('div', { class: 'grid' },
    sekil({ baslik: 'Yabancı neyi tutuyor?', cls: 'y7', alt: `Halka açık paylar içinde yabancı yatırımcının payı (İş Yatırım, ${tam(Y.hisse)} hisse, güncel kesit) ile hissenin özellikleri arasındaki sıra korelasyonu. Artı: özellik arttıkça yabancı payı da yüksek.` },
      gosterge(SER), oEl,
      p(`Yabancı önce **büyüklüğe ve derinliğe** bakıyor. BIST 100'ün içinde ise ayrım netleşiyor: payı yüksek hisseler **yükselmiş** (momentum ${sy(kor('momentum_120_20'), 2)}), **kârlı** (özkaynak kârlılığı ${sy(kor('roe'), 2)}) ve **sakin** (oynaklık ${sy(kor('oynaklik_20g'), 2)}). ` +
        'Fonların büyük pay aldığı hisse tipinin tam tersi: orada oynaklık ve devir hızı yüksek, kârlılık ölçüt değil.', 'okuma'),
      tabloAc([{ ad: 'Özellik' }, { ad: 'Tüm hisseler', n: 1 }, { ad: 't', n: 1 }, { ad: 'BIST 100 içinde', n: 1 }],
        () => Object.entries(Y.ozellik).map(([k, v]) => [ozAd(k), sy(v.sira_kor, 2), sy(v.t, 1), sy(v.bist100_sira_kor, 2)]))),
    sekil({ baslik: 'Yabancı payı büyük hisselerde toplanıyor', cls: 'y5', alt: 'Pazar katmanına göre ortalama yabancı payı.' },
      gEl,
      h('div', { class: 'sayilar iki' }, sayi(yzp(Y.pd_agirlikli / 100), 'piyasa değeri ağırlıklı ortalama'), sayi(yzp(Y.medyan / 100, 1), 'ortadaki hisse'),
        sayi(yzp(Y.yuzde10_alti_payi), 'yabancı payı %10\'un altında olan hisseler'), sayi(yzp(Y.yuzde40_ustu_payi), 'yabancı payı %40\'ın üstünde olanlar')),
      p(`En yüksek paylar: ${(Y.en_yuksek || []).slice(0, 8).map(x => `${x[0]} ${yzp(x[1] / 100)}`).join(', ')}. Hisselerin dörtte üçünde yabancı neredeyse yok; o hisselerde fiyatı yerli bireysel ve fonlar belirliyor.`, 'okuma')));
  queueMicrotask(() => {
    cubukYatay(oEl, { baslik: 'Yabancı payı ile özelliklerin sıra korelasyonu', seri: SER, bicim: v => sy(v, 2), etiketGen: 240,
      satir: SEC.map(k => ({ ad: ozAd(k), v: [al(Y, 'ozellik', k, 'sira_kor'), kor(k)], isaret: [Math.abs(al(Y, 'ozellik', k, 't') || 0) >= 2, false] })) });
    cubukYatay(gEl, { baslik: 'Pazar katmanına göre yabancı payı', seri: [{ ad: 'Ortalama yabancı payı', renk: 'var(--s1)' }], bicim: v => yzp(v / 100), etiketGen: 150,
      satir: AD.grup_sira.filter(g => al(Y, 'grup', g)).map(g => ({ ad: grupAd(g), alt: `${Y.grup[g].hisse} hisse`, v: [Y.grup[g].ort], ipucu: () => [tipSatir('Ortalama', yzp(Y.grup[g].ort / 100, 1)), tipSatir('Medyan', yzp(Y.grup[g].medyan / 100, 1))] })) });
  });
  return fig;
}

// --- Saat, mevsim, yıl bölümüne eklenen sektör endeksleri ---
function sektorMevsimSekli() {
  const M = al(V, 'ek', 'sektor_mevsim');
  if (!M || !M.ay_etkisi) return null;
  const sek = Object.keys(M.sektor).sort((a, b) => M.sektor[a].localeCompare(M.sektor[b], 'tr'));
  const iEl = h('div');
  const su = M.sureklilik || {};
  const anlamli = (M.en_belirgin || []).filter(x => Math.abs(x.t) >= 2).length;
  const fig = h('div', { class: 'grid' },
    sekil({ baslik: 'Sektörlerin ayları, 2010–2026', cls: 'y8', alt: `Sektör endeksinin o aydaki getirisi eksi BIST 100 (ortalama). ${tam(M.ay_sayisi)} ay, ${sek.length} sektör. Nokta: |t| ≥ 2.` },
      h('div', { class: 'olcek' }, yz(-0.06, 0), h('i'), yz(0.06, 0), h('span', { text: 'BIST 100\'e göre aylık fazla getiri' })), iEl,
      p(`${tam(M.test_sayisi)} sektör-ay çiftinden ${anlamli} tanesinde |t| ≥ 2; hiçbir etki olmasa şans eseri beklenen sayı yaklaşık ${Math.round(M.test_sayisi * 0.046)}. Yani **sektörlerin güvenilir bir ay takvimi yok.** ` +
        'Dikkat çeken tek düzen spor hisselerinde: sezon ortası ve sonu zayıf, yaz transfer dönemi güçlü.', 'okuma')),
    sekil({ baslik: 'Geçmişin kazananı kazanmaya devam ediyor mu?', cls: 'y4', alt: 'Geçmiş dönemin en iyi ve en kötü üç sektörünün ertesi ayki getirisi, tüm sektörlerin ortalamasına göre.' },
      tablo([{ ad: 'Bakılan dönem' }, { ad: 'En iyi 3', n: 1 }, { ad: 't', n: 1 }, { ad: 'En kötü 3', n: 1 }, { ad: 't', n: 1 }],
        Object.keys(su).map(k => [k.replace('ay', ' ay'), yz(su[k].ust3_fazla, 2), sy(su[k].ust3_t, 1), yz(su[k].alt3_fazla, 2), sy(su[k].alt3_t, 1)])),
      p(`17 yılda zayıf ama ölçülebilir bir süreklilik var: son 12 ayın en kötü üç sektörü ertesi ay ortalamanın ${yz(al(su, '12ay', 'alt3_fazla'), 1)} gerisinde (t ${sy(al(su, '12ay', 'alt3_t'), 1)}), en iyi üçü ${yz(al(su, '12ay', 'ust3_fazla'), 1)} önünde (t ${sy(al(su, '12ay', 'ust3_t'), 1)}). ` +
        'Kural olarak işe yarayan yarısı kaçınma: **bir yıldır en kötü giden sektöre "dipten döner" diye girme.**', 'okuma')));
  queueMicrotask(() => isi(iEl, { satir: sek.map(c => M.sektor[c]), sutun: AD.ay, vmax: 0.06, rbGen: '10.5em', hucreMin: 28,
    hucre: (r, c) => {
      const x = al(M.ay_etkisi, sek[r], String(c + 1));
      if (!x) return null;
      return { v: x.ort, isaret: Math.abs(x.t || 0) >= 2, ipucu: [tipBaslik(`${M.sektor[sek[r]]} · ${AD.ay_uzun[c]}`), tipSatir('BIST 100\'e göre', yz(x.ort, 1)), tipSatir('t', sy(x.t, 1)), tipSatir('Artı kapanan yıl', yzp(x.pozitif)), tipSatir('Yıl sayısı', String(x.yil))] };
    } }));
  return fig;
}
