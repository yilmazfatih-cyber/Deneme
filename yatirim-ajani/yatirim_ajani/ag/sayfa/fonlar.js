// Fonlar: düzenleme çizelgesi, yoğun fon payı taşıyan hisseler, bildirim olay çalışması, şirket bazında karar ölçütleri, KAP kayıtları.
const TUR_AD = { bagimsiz: 'Bağımsız', banka_bagli: 'Banka bağlı', katilim: 'Katılım', araci_kurum_bagli: 'Aracı kurum bağlı', holding_bagli: 'Holding bağlı' };
const ORUNTU_AD = { buyume_kucuk_orta_olcek: 'küçük ve orta ölçekli büyüme hisseleri', endeks_izleme: 'endeks izleme', tematik_sektor: 'tema ya da sektör', yogun_portfoy: 'az hissede yoğun portföy',
  grup_hissesi: 'grup hisseleri', diger: 'karma' };

function gorunumFonlar(kok) {
  const F = V.fon || {};
  const O = F.olay || {};
  const T = F.tasfiye || {};
  const K = al(V, 'ek', 'kap');

  kok.append(giris('Fon şirketleri nasıl karar veriyor, onlara karşı nasıl durulur?',
    'Fonların günlük alım satımı yayımlanmaz. Görünen iki iz var: bir şirkette %5 ve katlarını aşınca KAP\'a verilen pay bildirimi ve fonların yazılı strateji beyanları. ' +
    'Bu izlerde iki ayrı dünya çıkıyor: **endeksi ve büyük hisseleri izleyen banka fonları** ile **az sayıda küçük hissede halka açık payın büyük bölümünü tutan bağımsız fonlar**. İkincisi 2024 ve 2025\'te getiri listelerinin başındaydı, 2026\'da çöktü.'));

  // 1) Düzenleme çizelgesi
  kok.append(h('div', { class: 'grid' }, sekil({ baslik: '2026\'da kurallar değişti', alt: 'SPK kararlarını aktaran haberlerden (Capital, Oksijen, NTV, Paratic, Foreks). Tera grubu bu sayfanın kapsamı dışındadır.' },
    h('dl', { class: 'akis' },
      h('dt', { text: '28 Ağu 2026' }), h('dd', null, metin('**Fon rehberi değişti:** serbest fonların bir şirketin halka açık paylarında toplam tutabileceği paya sınır geldi; uyum süresi 31 Aralık 2026.')),
      h('dt', { text: '17 Eyl 2026' }), h('dd', null, metin('**Yedi portföy şirketinin tüm fonları TEFAS\'ta işleme kapatıldı**, bir bölümü için tasfiye kararı verildi. İncelenen altısı: Pusula, Hedef, Atlas, A1 Capital, Pardus, Bulls.')),
      h('dt', { text: '26 Eki 2026' }), h('dd', null, metin('Aralarında Pusula\'nın da bulunduğu iki şirketin **faaliyetleri durduruldu**.'))))));

  // 2) Tasfiye kümesi
  const dn = Object.keys(T.donem || {});
  const tEl = cizimKutusu(), oEl = cizimKutusu();
  const TS = [{ ad: `Bu fonların ağır pozisyonları (${(T.hisseler || []).length} hisse)`, renk: 'var(--s2)' }, { ad: 'Diğer hisseler', renk: 'var(--s1)' }];
  const son = dn.length ? T.donem[dn[dn.length - 1]] : null;
  const tabanPay = d => { const x = al(d, 'tavan_taban_gun') || {}; return [x.kume_gun ? x.kume_taban / x.kume_gun : null, x.kiyas_gun ? x.kiyas_taban / x.kiyas_gun : null]; };
  const OS = [{ ad: 'Alım bildirimi', renk: 'var(--s1)' }, { ad: 'Satım bildirimi', renk: 'var(--s2)' }];
  const PEN = [['once_20g', '20 gün önce'], ['once_5g', '5 gün önce'], ['gun_0', 'Bildirim günü'], ['sonra_5g', '5 gün sonra'], ['sonra_20g', '20 gün sonra']];
  if (dn.length || O.alim) {
    kok.append(h('div', { class: 'grid' },
      dn.length ? sekil({ baslik: 'Yoğun fon payı taşıyan hisseler: önce uçtu, sonra çöktü', cls: 'y7', alt: 'İşleme kapatılan fonların ağır pozisyonu olduğu bildirilen hisselerin ortalama getirisi ile diğer hisselerin ortalaması, dönem dönem.' },
        gosterge(TS), tEl,
        p(`2025'te bu hisseler diğerlerinin kat kat üstünde kazandırdı; karardan sonraki dört haftada ${yz(al(T, 'donem', '17 Eyl–15 Eki 2026', 'kume_ort'), 0)} (diğerleri ${yz(al(T, 'donem', '17 Eyl–15 Eki 2026', 'kiyas_ort'), 0)}). ` +
          (son ? `Son dönemde işlem günlerinin ${yzp(tabanPay(son)[0], 1)}'i tabanda kapandı (diğer hisselerde ${yzp(tabanPay(son)[1], 1)}): satmak isteyen satamadı. ` : '') +
          'Halka açık payın büyük bölümü birkaç fonda toplandığında fiyatı fon girişi taşır; giriş durduğunda alıcı kalmaz.', 'okuma'),
        tabloAc([{ ad: 'Dönem' }, { ad: 'Fon hisseleri ort.', n: 1 }, { ad: 'medyan', n: 1 }, { ad: 'Diğerleri ort.', n: 1 }, { ad: 'medyan', n: 1 }, { ad: 'Günlük fark t', n: 1 }],
          () => dn.map(d => [d, yz(T.donem[d].kume_ort, 0), yz(T.donem[d].kume_medyan, 0), yz(T.donem[d].kiyas_ort, 0), yz(T.donem[d].kiyas_medyan, 0), sy(T.donem[d].gunluk_fark_t, 1)]))) : null,
      O.alim ? sekil({ baslik: 'Bildirimin öncesi ve sonrası', cls: 'y5', alt: `${tam(O.olay)} fon bildirimi, ${tam(O.hisse)} hisse (arama özetlerinden derlendi). Bildirim gününe göre ortalama getiri.` },
        gosterge(OS), oEl,
        p(`Alım bildirimi yükselişin ardından geliyor: önceki 20 gün ${yz(al(O, 'alim', 'once_20g', 'ort'), 1)}, sonraki 20 gün ${yz(al(O, 'alim', 'sonra_20g', 'ort'), 1)}. ` +
          `**Satım bildiriminden sonraki 20 gün ${yz(al(O, 'satim', 'sonra_20g', 'ort'), 1)}** (t ${sy(al(O, 'satim', 'sonra_20g', 't'), 1)}): fon çıkıyorsa beklemek pahalı.`, 'okuma')) : null));
    if (dn.length) cubukYatay(tEl, { baslik: 'Fon hisseleri ve diğerleri', seri: TS, bicim: v => yz(v, 0), etiketGen: 150,
      satir: dn.map(d => ({ ad: d, v: [T.donem[d].kume_ort, T.donem[d].kiyas_ort] })) });
    if (O.alim) cubukDikey(oEl, { baslik: 'Bildirim çevresinde getiri', kat: PEN.map(x => x[1]), bicim: v => yz(v, 1), eksenBicim: v => yz(v, 0), yukseklik: 230,
      seri: [{ ad: 'Alım bildirimi', renk: 'var(--s1)', v: PEN.map(x => al(O, 'alim', x[0], 'ort')) }, { ad: 'Satım bildirimi', renk: 'var(--s2)', v: PEN.map(x => al(O, 'satim', x[0], 'ort')) }],
      ipucu: i => [tipBaslik(PEN[i][1]), tipSatir('Alım: ortalama', yz(al(O, 'alim', PEN[i][0], 'ort'), 1), 'var(--s1)'), tipSatir('medyan', yz(al(O, 'alim', PEN[i][0], 'medyan'), 1)), tipSatir('olay', tam(al(O, 'alim', PEN[i][0], 'n'))),
        tipSatir('Satım: ortalama', yz(al(O, 'satim', PEN[i][0], 'ort'), 1), 'var(--s2)'), tipSatir('medyan', yz(al(O, 'satim', PEN[i][0], 'medyan'), 1)), tipSatir('olay', tam(al(O, 'satim', PEN[i][0], 'n')))] });
  }

  // 3) Hedef özellikleri + şirket tablosu
  const HO = O.hedef_ozellikleri_yuzdelik || {};
  const hoEl = cizimKutusu();
  const sirketler = Object.entries(O.sirket || {}).sort((a, b) => b[1].olay - a[1].olay);
  if (Object.keys(HO).length) {
    const sirali = Object.entries(HO).sort((a, b) => b[1].medyan - a[1].medyan);
    const sadeAd = k => ozAd(k).replace(/\s*\(.*\)$/, '').toLocaleLowerCase('tr-TR');
    kok.append(h('div', { class: 'grid' },
      sekil({ baslik: 'Bildirim veren fonların seçtiği hisseler neye benziyor?', cls: 'y5', alt: 'Bildirim günü hissenin tüm BIST içindeki sırası (medyan yüzdelik). Çizgi: ortadaki hisse (%50).' }, hoEl,
        p(`En belirgin özellikler: ${sirali.slice(0, 2).map(x => `${sadeAd(x[0])} ${Math.round(x[1].medyan * 100)}. yüzdelikte`).join(', ')}; ${sadeAd(sirali[sirali.length - 1][0])} ${Math.round(sirali[sirali.length - 1][1].medyan * 100)}. yüzdelikte. ` +
          'Yani oynak, pahalı ve yükselmekte olan hisseler: değer değil hikâye alınıyor.', 'okuma')),
      sekil({ baslik: 'Şirket şirket bildirimler', cls: 'y7', alt: 'Bildirimlerin öncesinde ve sonrasında hissenin 20 günlük getirisi (ortalama). Az sayıda olay; yön gösterir, kesinlik taşımaz.' },
        tablo([{ ad: 'Fon şirketi' }, { ad: 'Alım / satım', n: 1 }, { ad: 'Hisseler' }, { ad: 'Alım öncesi', n: 1 }, { ad: 'Alım sonrası', n: 1 }, { ad: 'Satım sonrası', n: 1 }],
          sirketler.map(([ad, s]) => [ad.replace(' Portföy Yönetimi', ''), `${s.alim} / ${s.satim}`, h('span', { class: 'mono', text: (s.hisse || []).join(' ') }), yz(s.alim_once_20g, 0), yz(s.alim_sonra_20g, 0), yz(s.satim_sonra_20g, 0)]), { sinirli: true, genis: true }))));
    cubukYatay(hoEl, { baslik: 'Hedef hisselerin özellikleri', seri: [{ ad: 'Medyan yüzdelik', renk: 'var(--s1)' }], bicim: v => yzp(v), enBuyuk: 1, cizgi: 0.5, etiketGen: 210,
      satir: sirali.map(([k, v]) => ({ ad: ozAd(k), alt: `${v.n} bildirim`, v: [v.medyan] })) });
  }

  // 4) KAP kayıtlarından (varsa)
  if (K && typeof gorunumKap === 'function') gorunumKap(kok, K);

  // 5) Şirket bazında karar ölçütleri
  const ST = F.strateji || [];
  if (ST.length) {
    const turler = Object.keys(TUR_AD).filter(t => ST.some(s => s.tur === t)).map(t => ({ k: t, ad: `${TUR_AD[t]} (${ST.filter(s => s.tur === t).length})` }));
    const sKap = h('div');
    const sYaz = tur => sKap.replaceChildren(...ST.filter(s => s.tur === tur).map(s => h('details', { class: 'ac' },
      h('summary', null, s.ad, h('small', { text: `${ORUNTU_AD[s.oruntu] || s.oruntu || ''}${s.guven != null ? ' · güven ' + sy(s.guven, 1) : ''}` })),
      h('div', null,
        (s.olcut || []).length ? h('ul', { class: 'duz' }, s.olcut.map(o => h('li', { text: o }))) : null,
        (s.fon || []).map(f => h('p', null, h('span', { class: 'cip', text: f.kod || '' }), ' ', f.beyan || f.ad || '',
          (f.poz || []).length ? h('span', { class: 'mono', text: '  ' + f.poz.filter(x => !/^(TERA|TEHOL|TRHOL)$/.test(x)).join(' ') }) : null)),
        s.kanit ? h('p', { class: 'alt', text: s.kanit }) : null))));
    kok.append(h('div', { class: 'grid' }, sekil({ baslik: 'Hangi fon şirketi neye göre alıyor?', alt: 'Yazılı strateji beyanları, bilinen ağır pozisyonlar ve basına yansıyan getiriler. Arama özetlerinden derlendi; güven puanı kaynağın sağlamlığını gösterir (0–1).' },
      h('div', { class: 'ctl' }, seg(turler, turler[0].k, sYaz, 'Şirket türü')), sKap,
      p('Kamuya açık beyanlar sınırlı ve çoğunun güveni düşük. Görünen: banka bağlı şirketlerde ana kanal endeks ve tema fonları, ağır pozisyonlar BIST 30 hisseleri; strateji açıklayan bağımsız şirketlerde BIST 30 dışı küçük ve orta ölçek ile az sayıda hissede yoğunlaşma. ' +
        'Birçok şirket için yazılı bir karar ölçütü bulunamadı; asıl kanıt yukarıdaki bildirimlerin kendisidir.', 'okuma'))));
    sYaz(turler[0].k);
  }
  const GE = F.genel || [];
  if (GE.length) {
    kok.append(h('div', { class: 'grid' }, sekil({ baslik: 'Fonların davranışını belirleyen kurallar' },
      GE.map(g => h('details', { class: 'ac' }, h('summary', null, String(g.soru || '').replace(/^[a-z]\)\s*/, ''), h('small', { text: g.guven != null ? 'güven ' + sy(g.guven, 1) : '' })), h('div', null, h('p', { text: g.yanit || '' })))))));
  }

  // 6) Karşı duruş
  kok.append(h('div', { class: 'grid' }, sekil({ baslik: 'Onlara karşı nasıl durulur?' },
    h('ul', { class: 'duz' },
      h('li', null, metin('**Fon aldı diye alma.** Pay bildirimi yükselişin sonunda yayımlanır; bildirimden sonra ortalama getiri eksi.')),
      h('li', null, metin('**Satım bildirimi çıkış işaretidir.** Fon pay azaltıyorsa aynı gün çık; sonraki 20 günün ortalaması en sert kayıp.')),
      h('li', null, metin('**Halka açık payı birkaç fonda toplanmış hissede likidite yanıltır.** Günlük hacim yüksek görünür ama alıcı tek bir kaynaktır; kaynak kesildiğinde taban serisi başlar ve satış gerçekleşmez.')),
      h('li', null, metin('**Halka arzda seri bitince borsadan alma.** Tahsisat alan kazanır; seri bittikten sonra alan, payı tahsisat alana devralır.')),
      h('li', null, metin('**Düzenleme takvimini izle.** Pay sınırını aşan fonların 31 Aralık 2026 uyum tarihine kadar payını azaltması gerekiyor; bu hisselerde satış baskısı yıl sonuna kadar sürebilir.'))),
    p('Bu maddeler birer kaçınma kuralıdır: fonların ağır olduğu küçük hisselerde alıcı olmamak. Açığa satış bireysel yatırımcı için pratik değildir ve tabanda kilit riski taşır.', 'okuma'))));
}
