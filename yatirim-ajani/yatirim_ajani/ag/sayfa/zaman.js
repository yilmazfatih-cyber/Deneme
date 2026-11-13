// Saat, mevsim, yıl: getirinin gün içindeki dağılımı, ayların düzeni, varlıklar ve sektörler arası dönüş, ilginin yönü.
function gorunumZaman(kok) {
  const Z = V.zaman || {};
  const S = Z.saat || {};
  if (!S.dilim || !S.dilim.length) { kok.append(p('Zaman verisi bulunamadı.')); return; }
  const b30 = al(S, 'grup', 'bist30') || {};

  kok.append(giris('Para günün, yılın ve yılların içinde nasıl dolaşıyor?',
    `Getiri kapanıştan açılışa, yani gecede oluşuyor; seans içinde ortalama hisse değer kaybediyor. BIST 30'da bir gecenin ortalaması **${bpz(al(b30, 'gece', 'ort'))}**, ` +
    `kapanış yarım saatininki **${bpz(al(b30, '17:30', 'ort'))}**. Aylar arasında tekrarlayan bir düzen var; sektör liderliği ise bir yıldan ötekine taşınmıyor.`));

  // 1) Günün saatleri
  let kirilim = 'g:bist30';
  const satirlar = () => (kirilim.startsWith('g:') ? al(S, 'grup', kirilim.slice(2)) : al(S, 'yil', kirilim.slice(2))) || {};
  const sEl = cizimKutusu(), hEl = cizimKutusu();
  const sCiz = cubukDikey(sEl, { baslik: 'Saat dilimine göre ortalama getiri', kat: () => S.dilim.map(d => (d === 'gece' ? 'Gece' : d)), isaretRenk: true, yukseklik: 240,
    bicim: bpz, eksenBicim: v => sy(v * 1e4, 0),
    seri: () => [{ ad: 'Ortalama getiri', v: S.dilim.map(d => al(satirlar(), d, 'ort')), isaret: S.dilim.map(d => Math.abs(al(satirlar(), d, 't') || 0) >= 2) }],
    ipucu: i => { const d = S.dilim[i], r = satirlar()[d] || {}; return [tipBaslik(d === 'gece' ? 'Gece (kapanış → açılış)' : `${d} çubuğu`), tipSatir('Ortalama', bpz(r.ort)), tipSatir('t', sy(r.t, 1)), tipSatir('Gün', tam(r.gun))]; } });
  const hacimGrup = () => (kirilim.startsWith('g:') ? kirilim.slice(2) : 'bist30');
  const hDilim = S.dilim.filter(d => d !== 'gece');
  const hCiz = cubukDikey(hEl, { baslik: 'İşlem hacminin saatlere dağılımı', kat: hDilim, yukseklik: 150, bicim: v => yzp(v, 1), eksenBicim: v => yzp(v),
    seri: () => [{ ad: 'Günlük hacimdeki pay', renk: 'var(--s1)', v: hDilim.map(d => al(S, 'hacim', hacimGrup(), d)) }] });
  const kSec = h('select', { id: 'saat-kirilim', 'aria-label': 'Kırılım', onchange: e => { kirilim = e.target.value; sCiz(); hCiz(); hBas.textContent = hacimBaslik(); } },
    h('optgroup', { label: 'Pazar katmanı' }, AD.grup_sira.filter(g => al(S, 'grup', g)).map(g => h('option', { value: 'g:' + g, text: grupAd(g) }))),
    h('optgroup', { label: 'Yıl (tüm hisseler)' }, Object.keys(S.yil || {}).sort().map(y => h('option', { value: 'y:' + y, text: y }))));
  const hacimBaslik = () => `İşlem hacminin saatlere dağılımı · ${grupAd(hacimGrup())}`;
  const hBas = h('div', { class: 'kbaslik', text: hacimBaslik() });

  // 2) Haftanın günleri
  const gunler = Object.keys(al(Z, 'takvim', 'haftanin_gunu') || {});
  const wEl = cizimKutusu();
  const GUN_UZUN = { Pzt: 'pazartesi', Sal: 'salı', 'Çar': 'çarşamba', Per: 'perşembe', Cum: 'cuma' };
  const enZayif = gunler.slice().sort((a, b) => al(Z, 'takvim', 'haftanin_gunu', a, 'gunici') - al(Z, 'takvim', 'haftanin_gunu', b, 'gunici')).slice(0, 2)
    .map(g => `${GUN_UZUN[g] || g} ${bpz(al(Z, 'takvim', 'haftanin_gunu', g, 'gunici'))}`).join(', ');
  const wSeri = [{ ad: 'Gece', renk: 'var(--s1)', v: gunler.map(g => al(Z, 'takvim', 'haftanin_gunu', g, 'gece')) }, { ad: 'Gün içi', renk: 'var(--s2)', v: gunler.map(g => al(Z, 'takvim', 'haftanin_gunu', g, 'gunici')) }];

  kok.append(h('div', { class: 'grid' },
    sekil({ baslik: 'Günün saatleri', cls: 'y7', alt: 'Yarım saatte başlayan saatlik çubukların ortalama getirisi (baz puan; 100 bp = %1). 09:30 çubuğu açılış seansını da içerir. Nokta: istatistiksel olarak anlamlı.' },
      h('div', { class: 'ctl' }, h('label', null, 'Kırılım', kSec)), sEl,
      p('Düzen her katmanda aynı: kazanç gecede, kayıp öğle saatlerinde ve kapanışa doğru. **Alımı kapanışa, satışı açılışa yaklaştırmak** bu düzenle aynı yöne bakar; gün ortasında alım yapmak ona karşı durur.', 'okuma'),
      hBas, hEl),
    sekil({ baslik: 'Haftanın günleri', cls: 'y5', alt: `Tüm hisselerin ortalaması, ${tam(al(Z, 'takvim', 'gun'))} gün. Gece: önceki kapanıştan o günün açılışına.` },
      gosterge(wSeri), wEl,
      p(`Gece getirisi ${gunler.length} günün ${gunler.filter(g => al(Z, 'takvim', 'haftanin_gunu', g, 'gece') > 0).length}'inde artı, gün içi getiri ${gunler.filter(g => al(Z, 'takvim', 'haftanin_gunu', g, 'gunici') < 0).length}'inde eksi. ` +
        `En zayıf gün içi: ${enZayif}. İki yıllık veriyle tek tek günlerin farkı kesin sayılmaz; gece ve gün içi ayrımı ise haftanın geneline yayılmış.`, 'okuma'))));
  cubukDikey(wEl, { baslik: 'Haftanın günlerine göre gece ve gün içi getiri', kat: gunler, seri: wSeri, bicim: bpz, eksenBicim: v => sy(v * 1e4, 0), yukseklik: 220 });

  // 3) Ayların düzeni
  const M = Z.mevsim || {};
  const mAd = Object.keys(M);
  const mEl = h('div');
  const eniyi = ad => { const a = (M[ad] || {}).ay || []; return a.map((x, i) => [i, x ? x.ort : 0, x ? x.t : 0]).sort((x, y) => y[1] - x[1]); };
  const b100 = eniyi('BIST 100');
  const ayCumle = (ad, n, ters) => { const s = eniyi(ad); return (ters ? s.slice(-n).reverse() : s.slice(0, n)).map(x => `${AD.ay_uzun[x[0]]} ${yz(x[1], 1)}`).join(', '); };
  kok.append(h('div', { class: 'grid' },
    sekil({ baslik: 'Ayların düzeni, 2010–2026', alt: 'Her ayın ortalama getirisi. Nokta: o ayın ortalaması sıfırdan istatistiksel olarak ayrışıyor (|t| ≥ 2). Bir hücrenin üstüne gelince medyan ve artı kapanan yıl oranı görünür.' },
      h('div', { class: 'olcek' }, yz(-0.06, 0), h('i'), yz(0.06, 0), h('span', { text: 'aylık ortalama getiri' })), mEl,
      p(b100.length ? `BIST 100'ün güçlü ayları: ${ayCumle('BIST 100', 3)}. Dolar bazında en zayıf ay: ${ayCumle('BIST 100 (dolar)', 1, true)}. Altın (TL) için en güçlü ay: ${ayCumle('Altın (TL)', 1)}. ` +
        'Ay etkisi 17 yılın ortalamasıdır; tek bir yılda tersine dönebilir, bu yüzden tek başına işlem gerekçesi olmaz, ağırlık ayarıdır.' : '', 'okuma'),
      tabloAc([{ ad: 'Seri' }].concat(AD.ay.map(a => ({ ad: a, n: 1 }))), () => mAd.map(ad => [ad].concat((M[ad].ay || []).map(x => (x ? yz(x.ort, 1) : '–'))))))));
  isi(mEl, { satir: mAd, sutun: AD.ay, vmax: 0.06, rbGen: '9.5em', hucreMin: 30,
    hucre: (r, c) => {
      const x = (M[mAd[r]].ay || [])[c];
      if (!x) return null;
      return { v: x.ort, isaret: Math.abs(x.t || 0) >= 2, ipucu: [tipBaslik(`${mAd[r]} · ${AD.ay_uzun[c]}`), tipSatir('Ortalama', yz(x.ort, 1)), tipSatir('Medyan', yz(x.medyan, 1)),
        tipSatir('Artı kapanan yıl', yzp(x.pozitif)), tipSatir('t', sy(x.t, 1)), tipSatir('Yıl sayısı', String(x.yil))] };
    } });

  // 4) Varlıklar arası dönüş
  const VA = Z.varlik || {};
  const yil = Object.keys(VA.yillik || {}).sort();
  const VARLIK = [['bist', 'BIST 100'], ['altin', 'Altın (TL)'], ['gumus', 'Gümüş (TL)'], ['dolar', 'Dolar/TL']];
  const vEl = h('div'), kEl = cizimKutusu();
  const K6 = al(VA, 'kural', '6ay') || {};
  const kazanan = {};
  Object.values(VA.kazanan || {}).forEach(k => { kazanan[k] = (kazanan[k] || 0) + 1; });
  kok.append(h('div', { class: 'grid' },
    sekil({ baslik: 'Yılın kazananı her yıl değişiyor', cls: 'y7', alt: 'Yıllık getiri (TL). Kalın: o yılın en çok kazandıranı.' }, vEl,
      p(`${yil.length} yılda birincilik sayısı: ${VARLIK.map(([k, ad]) => `${ad} **${kazanan[k] || 0}**`).join(', ')}. BIST ile altının aylık getirileri neredeyse ilişkisiz (${sy(al(VA, 'aylik_kor', 'altin-bist'), 2)}); ` +
        `altın ile gümüş birlikte hareket eder (${sy(al(VA, 'aylik_kor', 'altin-gumus'), 2)}).`, 'okuma')),
    sekil({ baslik: '2010\'da 1 TL bugün kaç TL?', cls: 'y5', alt: 'Al-tut, dört varlığa eşit ağırlık ve "son 6 ayın en iyisini tut" kuralı.' }, kEl,
      p(`Kural ${tam(K6.degisim_sayisi)} kez varlık değiştirdi ve ayların ${yzp(K6.isabet)}'inde doğru varlıktaydı. Dönemin ilk yarısında eşit ağırlığı geçti (${katsayi((K6.yari1 || 0) + 1)} ve ${katsayi((K6.esit_yari1 || 0) + 1)}), ` +
        `ikinci yarısında gerisinde kaldı (${katsayi((K6.yari2 || 0) + 1)} ve ${katsayi((K6.esit_yari2 || 0) + 1)}). Sağlam bir kural değil; madenleri hisseyle birlikte tutmak, hangisinin kazanacağını tahmin etmekten daha güvenli.`, 'okuma'))));
  isi(vEl, { satir: yil, sutun: VARLIK.map(v => v[1]), vmax: 0.7, rbGen: '3.2em', hucreMin: 64, odak: true,
    hucre: (r, c) => {
      const v = al(VA, 'yillik', yil[r], VARLIK[c][0]);
      if (v == null) return null;
      return { v, yazi: yz(v, 0), kalin: al(VA, 'kazanan', yil[r]) === VARLIK[c][0], ipucu: [tipBaslik(`${VARLIK[c][1]} · ${yil[r]}`), tipSatir('Yıllık getiri', yz(v, 1))] };
    } });
  const katlar = VARLIK.map(([k, ad]) => ({ ad, v: [(al(K6, 'al_tut', k) || 0) + 1] }))
    .concat([{ ad: 'Eşit ağırlık (dört varlık)', v: [(K6.esit_agirlik || 0) + 1] }, { ad: 'Son 6 ayın en iyisi kuralı', v: [(K6.kumulatif || 0) + 1] }]).sort((a, b) => b.v[0] - a.v[0]);
  cubukYatay(kEl, { baslik: '2010 başından bugüne çarpan', seri: [{ ad: 'Çarpan', renk: 'var(--s1)' }], bicim: katsayi, satir: katlar, etiketGen: 190 });

  // 5) Sektörler arası dönüş ve ilgi
  const RO = Z.rotasyon || {};
  const ry = Object.keys(RO.yil || {}).sort();
  const IL = Z.ilgi || {};
  const iy = Object.keys(IL.grup_yil || {}).sort();
  const dEl = cizimKutusu();
  const deg = Object.entries(IL.sektor_degisim || {}).sort((a, b) => b[1] - a[1]);
  const uclar = deg.slice(0, 5).concat(deg.slice(-5));
  const parcali = y => h('div', { class: 'parcali', role: 'img', 'aria-label': `${y}: ` + AD.grup_sira.map(g => `${grupAd(g)} ${yzp(al(IL, 'grup_yil', y, g), 1)}`).join(', ') },
    AD.grup_sira.map((g, i) => { const v = al(IL, 'grup_yil', y, g) || 0; const e = h('div', { class: 'pc p' + (i + 1), style: `flex:${v} 1 0` }, v >= 0.09 ? yzp(v) : ''); tipBaglan(e, () => [tipBaslik(`${grupAd(g)} · ${y}`), tipSatir('İşlem hacmindeki pay', yzp(v, 1))]); return e; }));
  const kal = RO.kalicilik || {};
  kok.append(h('div', { class: 'grid' },
    sekil({ baslik: 'Sektör liderliği bir yıldan ötekine taşınmıyor', cls: 'y7', alt: 'Sektörlerin eşit ağırlıklı yıllık getirisi; her yılın en iyi ve en kötü dördü.' },
      tablo([{ ad: 'Yıl' }, { ad: 'En iyi dört' }, { ad: 'En kötü dört' }, { ad: 'Ortalama', n: 1 }],
        ry.map(y => [y, RO.yil[y].en_iyi.map(x => `${sekAd(x[0])} ${yz(x[1], 0)}`).join(' · '), RO.yil[y].en_kotu.map(x => `${sekAd(x[0])} ${yz(x[1], 0)}`).join(' · '), yz(RO.yil[y].ortalama, 0)]), { genis: true }),
      p(`Bir yılın sektör sıralaması ertesi yılı öngörmüyor: sıra korelasyonu ${Object.entries(RO.yildan_yila || {}).map(([k, v]) => `${k} **${sy(v, 2)}**`).join(', ')}. ` +
        `Aylık ölçekte zayıf bir süreklilik var: geçen ayın sıralaması bu ayla ${sy(al(kal, '1ay', 'sira_kor'), 2)} korelasyonlu (t ${sy(al(kal, '1ay', 't'), 1)}); üç ve altı aylıkta kayboluyor.`, 'okuma')),
    sekil({ baslik: 'İlgi büyük hisselere kayıyor', cls: 'y5', alt: 'Toplam işlem hacminin pazar katmanlarına dağılımı. Pay, para girişi değil ilgi ölçüsüdür.' },
      gosterge(AD.grup_sira.map((g, i) => ({ ad: grupAd(g), renk: ORDINAL[i] }))),
      h('div', { class: 'parcali-liste' }, iy.map(y => h('div', { class: 'parcali-satir' }, h('span', { class: 'num', text: y }), parcali(y)))),
      h('div', { class: 'kbaslik', text: 'Hacim payı en çok değişen sektörler (ilk yıldan son yıla, puan)' }), dEl,
      p(`İlgi ile getiri arasındaki bağ iki yönde de zayıf: iyi getiriden sonraki ay sektörün hacim payı hafif artıyor (sıra korelasyonu ${sy(al(IL, 'getiri_sonra_ilgi', 'sira_kor'), 2)}, t ${sy(al(IL, 'getiri_sonra_ilgi', 't'), 1)}), ` +
        `payı artan sektörün sonraki ay getirisi farklılaşmıyor (${sy(al(IL, 'ilgi_sonra_getiri', 'sira_kor'), 2)}, t ${sy(al(IL, 'ilgi_sonra_getiri', 't'), 1)}). Hacim payına bakarak sektör seçmek için kanıt yok.`, 'okuma'))));
  cubukYatay(dEl, { baslik: 'Sektör hacim payı değişimi', seri: [{ ad: 'Pay değişimi' }], isaretRenk: true, bicim: v => sy(v * 100, 1), etiketGen: 170, satir: uclar.map(([k, v]) => ({ ad: sekAd(k), v: [v] })) });

  // 6) Mevsimlere göre ağ
  const AM = al(V, 'agac', 'mevsim') || {};
  const ms = ['kis', 'ilkbahar', 'yaz', 'sonbahar'].filter(m => AM[m]);
  const msSirali = ms.slice().sort((a, b) => AM[b].ort_kor_ham - AM[a].ort_kor_ham);
  const mAdi = m => (AD.mevsim || {})[m] || m;
  if (ms.length) {
    kok.append(h('div', { class: 'grid' },
      sekil({ baslik: 'Mevsimlere göre hisseler ne kadar birlikte hareket ediyor?', alt: '2024–2026 günleri mevsimlere bölündü. Ortalama korelasyon yükseldikçe hisse seçimi yerine endeks yönü belirleyici olur.' },
        tablo([{ ad: 'Mevsim' }, { ad: 'Gün', n: 1 }, { ad: 'Ort. korelasyon', n: 1 }, { ad: 'Endeks çıkarılınca', n: 1 }, { ad: 'XU100 günlük ort.', n: 1 }, { ad: 'XU100 günlük oynaklık', n: 1 }, { ad: 'Hisseler arası fark', n: 1 }],
          ms.map(m => [buyukIlk((AD.mevsim || {})[m] || m), tam(AM[m].gun), sy(AM[m].ort_kor_ham, 2), sy(AM[m].ort_kor_artik, 2), bpz(AM[m].xu100_gunluk_ort), yzp(AM[m].xu100_oynaklik, 1), yzp(AM[m].kesit_dagilim, 1)]), { genis: true }),
        p(`Bu üç yılda korelasyonun en yüksek olduğu mevsim ${mAdi(msSirali[0])} (${sy(AM[msSirali[0]].ort_kor_ham, 2)}; endeksin günlük ortalaması ${bpz(AM[msSirali[0]].xu100_gunluk_ort)}), ` +
          `en düşük olduğu mevsim ${mAdi(msSirali[msSirali.length - 1])} (${sy(AM[msSirali[msSirali.length - 1]].ort_kor_ham, 2)}; ${bpz(AM[msSirali[msSirali.length - 1]].xu100_gunluk_ort)}). ` +
          'Hisseler zayıf dönemde birlikte, güçlü dönemde ayrı ayrı hareket ediyor: hisse seçimi en çok endeksin güçlü olduğu mevsimde fark yaratıyor.', 'okuma'))));
  }
}
