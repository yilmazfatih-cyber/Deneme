// Yayılım görünümü: küresel seriler → açılış boşluğu → küçük hisseler; sektör bağları; katmanlar arası öncü-takipçi.
function gorunumYayilim(kok) {
  const Y = V.yayilim || {};
  if (!Y.seriler || !Y.seriler.length) { kok.append(p('Yayılım verisi bulunamadı.')); return; }
  const kor = (o, seri, tur) => al(o, seri, tur, 'kor');
  const og = new Map((Y.oncu_grup || []).map(e => [e[0] + '>' + e[1], e]));
  const b30ana = og.get('bist30>ana_pazar') || [];
  const b30yil = og.get('bist30>yildiz_diger') || [];

  kok.append(giris('Bilgi nereden girip nereye yayılıyor?',
    'Gece dünyada olan biten sabah BIST 30\'un açılış fiyatına girer ve orada biter: açılıştan sonra aynı yönde devam yoktur. ' +
    'Küçük hisseler aynı haberi yarı güçle ve birkaç gün gecikmeyle fiyatlar. **Erken davranma şansı açılışta değil, küçük hisselerin gecikmesindedir.**'));

  kok.append(h('div', { class: 'zincir' },
    h('div', null, h('span', { class: 'ne', text: 'Gece · 18:10 → 09:55' }), h('b', { text: 'Dünya' }), p('S&P 500 ve Nasdaq vadelileri, dolar/TL, Brent, ABD\'de işlem gören Türkiye fonu (TUR).')),
    h('div', null, h('span', { class: 'ne', text: 'Açılış' }), h('b', { text: sy(kor(Y.bist30, 'ES=F', 'bosluk'), 2) }),
      p(`BIST 30 açılış boşluğunun S&P vadelisinin gece değişimiyle korelasyonu. Dolar/TL ile ${sy(kor(Y.bist30, 'USDTRY=X', 'bosluk'), 2)}.`)),
    h('div', null, h('span', { class: 'ne', text: 'Gün içi' }), h('b', { text: sy(kor(Y.bist30, 'ES=F', 'devam'), 2) }),
      p('Aynı gece değişiminin açılıştan kapanışa getiriyle korelasyonu: haber açılışta fiyatlanmış, devamı yok.')),
    h('div', null, h('span', { class: 'ne', text: '1–4 gün' }), h('b', { text: sy(b30ana[2], 2) }),
      p(`BIST 30'un dünkü getirisi Ana Pazar'ın bugünkü getirisini öngörür (Yıldız Pazar: ${sy(b30yil[2], 2)}). Küçük hisseler geç tepki verir.`))));

  // 1) Gece değişimi → açılış boşluğu ve gün içi devam
  let hedef = 'bist30';
  const zEl = cizimKutusu();
  const seriRenk = [{ ad: 'Açılış boşluğu', renk: 'var(--s1)' }, { ad: 'Açılıştan kapanışa (devam)', renk: 'var(--s2)' }];
  const zSatir = () => {
    const o = hedef === 'bist30' ? Y.bist30 : Y.kucuk;
    return Y.seriler.map(s => ({ ad: seriAd(s), v: [kor(o, s, 'bosluk'), kor(o, s, 'devam')],
      isaret: [Math.abs(al(o, s, 'bosluk', 't') || 0) >= 2.6, Math.abs(al(o, s, 'devam', 't') || 0) >= 2.6],
      ipucu: () => [tipSatir('Açılış boşluğu: korelasyon', sy(kor(o, s, 'bosluk'), 2), 'var(--s1)'), tipSatir('t', sy(al(o, s, 'bosluk', 't'), 1)),
        tipSatir('1 puanlık gece değişimine tepki', sy(al(o, s, 'bosluk', 'beta'), 2)), tipSatir('Gün içi devam: korelasyon', sy(kor(o, s, 'devam'), 2), 'var(--s2)'),
        tipSatir('t', sy(al(o, s, 'devam', 't'), 1))] }))
      .sort((a, b) => Math.abs(b.v[0]) - Math.abs(a.v[0]));
  };
  const zCiz = cubukYatay(zEl, { baslik: 'Gece küresel değişim ile açılış boşluğu ve gün içi devam', seri: seriRenk, bicim: v => sy(v, 2), satir: zSatir, etiketGen: 170 });
  const zTablo = () => Y.seriler.map(s => [seriAd(s), sy(kor(Y.bist30, s, 'bosluk'), 2), sy(al(Y.bist30, s, 'bosluk', 'beta'), 2), sy(kor(Y.bist30, s, 'devam'), 2),
    sy(kor(Y.kucuk, s, 'bosluk'), 2), sy(al(Y.kucuk, s, 'bosluk', 'beta'), 2), sy(kor(Y.kucuk, s, 'devam'), 2)]);

  // 2) Fiyat gecikmesi
  const gEl = cizimKutusu(), rEl = cizimKutusu();
  const gs = AD.grup_sira.filter(g => Y.gecikme && Y.gecikme[g]);
  const kf = Y.kucuk_faktor || {};

  kok.append(h('div', { class: 'grid' },
    sekil({ baslik: 'Gece haberi açılışa girer, gün içinde sürmez', cls: 'y7',
      alt: `Her küresel serinin BIST kapanışından açılışına değişimi ile hisselerin açılış boşluğu ve açılıştan kapanışa getirisi arasındaki korelasyon; ${tam(Y.gun)} gün. Nokta: istatistiksel olarak anlamlı.` },
      h('div', { class: 'ctl' }, seg([{ k: 'bist30', ad: 'BIST 30' }, { k: 'kucuk', ad: 'BIST 100 dışı' }], 'bist30', k => { hedef = k; zCiz(); }, 'Hisse grubu')),
      gosterge(seriRenk), zEl,
      p('BIST 30\'da tek istisna yok: hiçbir serinin gece değişimi gün içi getiriyi öngörmüyor. BIST 100 dışında ise Türkiye fonunun gece değişimi gün içinde de küçük bir devam bırakıyor: küçük hisseler açılışta eksik fiyatlıyor.', 'okuma'),
      tabloAc([{ ad: 'Seri' }, { ad: 'BIST 30 boşluk', n: 1 }, { ad: 'tepki', n: 1 }, { ad: 'devam', n: 1 }, { ad: '100 dışı boşluk', n: 1 }, { ad: 'tepki', n: 1 }, { ad: 'devam', n: 1 }], zTablo)),
    sekil({ baslik: 'Küçük hisseler endeksi gecikmeyle izler', cls: 'y5', alt: 'Hissenin bugünkü getirisinin endeksin önceki dört gününe duyarlılığı (gecikmeli betaların toplamı). Sıfır: haber aynı gün fiyatlanıyor.' },
      gEl, h('div', { class: 'kbaslik', text: 'Aynı gün endeksle açıklanan pay (R²)' }), rEl,
      p(`Küçük hisselerin ortak dalgası kendi başına bir etken: günlük oynaklığı ${yzp(kf.gunluk_std, 2)}, bugünkü değeri dünkü değeriyle ${sy(kf.oz_iliski, 2)}, endeksin dünkü getirisiyle ${sy(kf.piyasa_once, 2)} korelasyonlu. Endeks güçlü kapandıysa ertesi gün küçük hisseler ortalamanın üstünde açar.`, 'okuma'))));
  cubukYatay(gEl, { baslik: 'Gecikmeli beta toplamı', seri: [{ ad: 'Gecikmeli beta toplamı', renk: 'var(--s1)' }], bicim: v => sy(v, 2), etiketGen: 150,
    satir: gs.map(g => ({ ad: grupAd(g), v: [Y.gecikme[g].gecikmeli_beta_toplam], ipucu: () => [tipSatir('Aynı gün beta', sy(Y.gecikme[g].beta, 2)),
      tipSatir('Gecikmeli beta toplamı', sy(Y.gecikme[g].gecikmeli_beta_toplam, 2)), tipSatir('Dünkü endekse beta', sy(Y.gecikme[g].l1_beta, 2))] })) });
  cubukYatay(rEl, { baslik: 'Eşanlı R²', seri: [{ ad: 'R²', renk: 'var(--s1)' }], bicim: v => yzp(v), etiketGen: 150, satir: gs.map(g => ({ ad: grupAd(g), v: [Y.gecikme[g].r2_esanli] })) });

  // 3) Sektör × küresel seri
  const TUR = [{ k: 0, ad: 'Açılış boşluğu' }, { k: 2, ad: 'Seans içi, aynı anda' }, { k: 1, ad: 'Gece değişimi → gün içi' }];
  let tur = 0, hepsi = false;
  const H = new Map();
  (Y.hucre || []).forEach(c => H.set(c[0] + '|' + c[1] + '|' + c[2], c));
  const guc = new Map();
  (Y.hucre || []).forEach(c => { if (c[6] && c[7]) guc.set(c[1], Math.max(guc.get(c[1]) || 0, Math.abs(c[3]))); });
  const sekSira = Y.sektorler.map((s, i) => i).sort((a, b) => (guc.get(b) || 0) - (guc.get(a) || 0));
  const iEl = h('div');
  const iCiz = () => isi(iEl, { satir: sekSira.map(i => sekAd(Y.sektorler[i])), sutun: Y.seriler.map(s => SERI_KISA[s] || s), vmax: 0.4, rbGen: '9.5em', hucreMin: 30,
    hucre: (r, c) => {
      const d = H.get(c + '|' + sekSira[r] + '|' + tur);
      if (!d) return null;
      const anlamli = d[6] && d[7];
      return { v: d[3], soluk: !anlamli && !hepsi, isaret: anlamli && hepsi,
        ipucu: [tipBaslik(`${sekAd(Y.sektorler[sekSira[r]])} · ${seriAd(Y.seriler[c])}`, TUR.find(t => t.k === tur).ad), tipSatir('Korelasyon', sy(d[3], 2)), tipSatir('t', sy(d[4], 1)),
          tipSatir('1 puanlık değişime tepki', sy(d[5], 2)), tipSatir('Çoklu test sonrası', anlamli ? 'anlamlı, iki yarıda tutarlı' : 'anlamlı değil')] };
    } });
  const st = Y.sektor_test || {};
  const enGuclu = (Y.hucre || []).filter(c => c[6] && c[7]).sort((a, b) => Math.abs(b[3]) - Math.abs(a[3]));
  const cumle = t => enGuclu.filter(c => c[2] === t).slice(0, 5).map(c => `${seriAd(Y.seriler[c[0]])} → ${sekAd(Y.sektorler[c[1]]).toLocaleLowerCase('tr-TR')} **${sy(c[3], 2)}**`).join(', ');
  kok.append(h('div', { class: 'grid' },
    sekil({ baslik: 'Hangi sektör hangi küresel seriye bağlı?', alt: `Sektörün endeksten arındırılmış getirisi ile küresel serinin değişimi arasındaki korelasyon. ${tam(st.test)} bağ sınandı; yanlış keşif oranı %10 ile ${tam(st.anlamli_tutarli)} tanesi anlamlı ve dönemin iki yarısında aynı işaretli.` },
      h('div', { class: 'ctl' }, seg(TUR, 0, k => { tur = k; iCiz(); }, 'Ölçüm'),
        h('label', null, h('input', { type: 'checkbox', id: 'isi-hepsi', onchange: e => { hepsi = e.target.checked; iCiz(); } }), 'Anlamlı olmayanları da göster')),
      h('div', { class: 'olcek' }, sy(-0.4, 1), h('i'), '+' + sy(0.4, 1), h('span', { text: 'korelasyon' })), iEl,
      p(`Açılışta en güçlü bağlar: ${cumle(0)}. Seans içinde: ${cumle(2)}.`, 'okuma'),
      tabloAc([{ ad: 'Sektör' }, { ad: 'Seri' }, { ad: 'Ölçüm' }, { ad: 'Korelasyon', n: 1 }, { ad: 't', n: 1 }, { ad: 'Tepki', n: 1 }],
        () => enGuclu.map(c => [sekAd(Y.sektorler[c[1]]), seriAd(Y.seriler[c[0]]), TUR.find(t => t.k === c[2]).ad, sy(c[3], 2), sy(c[4], 1), sy(c[5], 2)]), 'Anlamlı bağları tablo olarak göster'))));
  iCiz();

  // 4) Katmanlar arası öncü-takipçi ve sektörler
  const mEl = h('div');
  const os = Y.oncu_sektor || {};
  const nKenar = (os.kenar || []).length;
  const kendi = (os.kenar || []).filter(e => e[0] === e[1]).length;
  const capraz = (os.kenar || []).filter(e => e[0] !== e[1]).map(e => Math.abs(e[2]));
  const caprazEnAz = capraz.length ? Math.min(...capraz) : 0;
  const caprazEnCok = capraz.length ? Math.max(...capraz) : 0;
  kok.append(h('div', { class: 'grid' },
    sekil({ baslik: 'Dünden bugüne: kim kimi izliyor?', cls: 'y6', alt: 'Satır: dünkü getiri. Sütun: bugünkü getiri. Endeks ve küçük hisse dalgası çıkarılmış getirilerin korelasyonu; kalın olanlar anlamlı ve iki yarıda tutarlı.' },
      mEl, p('Köşegen kendi kendini izlemeyi gösterir: küçük katmanlarda dünkü hareket bugün de sürer. BIST 30 satırı öncülüğü gösterir: dünkü BIST 30 getirisi diğer katmanların bugününü etkiler, tersi olmaz.', 'okuma')),
    sekil({ baslik: 'Sektörler birbirini izlemiyor', cls: 'y6', alt: `${tam(os.test)} sektör çiftinde dünkü getiri → bugünkü getiri sınandı.` },
      p(`**${tam(nKenar)}** çift anlamlı: **${kendi}** tanesi sektörün kendi dünkü getirisi, yani süreklilik. Başka bir sektöre geçiş gösteren ${tam(nKenar - kendi)} bağın korelasyonu ${sy(caprazEnAz, 2)}–${sy(caprazEnCok, 2)} arasında: ` +
        'günlük işlem maliyetini karşılayacak büyüklükte değil. "Bankalar gitti, sırada sanayi var" türü günlük rotasyon veride yok.', 'okuma'),
      tablo([{ ad: 'Dün' }, { ad: 'Bugün' }, { ad: 'Korelasyon', n: 1 }, { ad: 't', n: 1 }], (os.kenar || []).map(e => [sekAd(e[0]), sekAd(e[1]), sy(e[2], 2), sy(e[3], 1)])),
      p('İki ortak dalga ayıklanmadan aynı test yapıldığında 676 çiftin 317\'si "anlamlı" çıkıyordu: hepsi küçük hisse dalgasının kendi sürekliliğiydi.', 'alt'))));
  // 5) Komşudan komşuya geçiş
  const KG = Y.komsu || {};
  if (al(KG, 'test', 'yukari', 'ertesi')) {
    const satir = [['Örneklem dışı · komşu sıçradı', al(KG, 'test', 'yukari')], ['Örneklem dışı · komşu düştü', al(KG, 'test', 'asagi')],
      ['Çiftlerin seçildiği dönem · komşu sıçradı', al(KG, 'olusum', 'yukari')], ['Çiftlerin seçildiği dönem · komşu düştü', al(KG, 'olusum', 'asagi')]].filter(x => x[1] && x[1].ertesi);
    const hc = (o, k) => `${yz(al(o, k, 'ort'), 2)} (${sy(al(o, k, 't'), 1)})`;
    kok.append(h('div', { class: 'grid' },
      sekil({ baslik: 'Komşu sıçrayınca sıra bu hissede mi?', alt: `Ağaçta birbirine en sıkı bağlı ${tam(KG.cift)} çift ${KG.kesim} öncesinin verisiyle seçildi; sonrası test edildi. Olay: komşu pazar katmanına göre ${yzp(KG.sok)} ve üstü hareket ederken hissenin kendisi kıpırdamamış. Fazla getiri, parantez içinde t.` },
        tablo([{ ad: 'Durum' }, { ad: 'Olay', n: 1 }, { ad: 'Ertesi gün', n: 1 }, { ad: 'Ertesi gece', n: 1 }, { ad: 'Sonraki 5 gün', n: 1 }, { ad: 'Artı kapanan', n: 1 }],
          satir.map(([ad, o]) => [ad, tam(o.olay), hc(o, 'ertesi'), hc(o, 'ertesi_gece'), hc(o, 'sonraki5'), yzp(o.pozitif)]), { genis: true }),
        p(`Aynı gruptan kardeş hisse sıçradığında geride kalan hisse ertesi gün onu izlemiyor: örneklem dışında ertesi gün ${yz(al(KG, 'test', 'yukari', 'ertesi', 'ort'), 2)} (t ${sy(al(KG, 'test', 'yukari', 'ertesi', 't'), 1)}). ` +
          `Düşüşte küçük bir gecikmeli geçiş var (${yz(al(KG, 'test', 'asagi', 'ertesi', 'ort'), 2)}, t ${sy(al(KG, 'test', 'asagi', 'ertesi', 't'), 1)}) ama işlem maliyetinin altında. **Ağdaki bağlar aynı gün fiyatlanıyor; "kardeşi gitti, sıra bunda" diye alım yapmanın karşılığı yok.**`, 'okuma'))));
  }
  isi(mEl, { satir: AD.grup_sira.map(g => GRUP_KISA[g]), sutun: AD.grup_sira.map(g => GRUP_KISA[g]), vmax: 0.25, rbGen: '5.5em', hucreMin: 44, odak: true,
    hucre: (r, c) => {
      const e = og.get(AD.grup_sira[r] + '>' + AD.grup_sira[c]);
      if (!e) return null;
      return { v: e[2], yazi: sy(e[2], 2), kalin: e[4] && e[5],
        ipucu: [tipBaslik(`Dün ${grupAd(AD.grup_sira[r])} → bugün ${grupAd(AD.grup_sira[c])}`), tipSatir('Korelasyon', sy(e[2], 2)), tipSatir('t', sy(e[3], 1)),
          tipSatir('Çoklu test sonrası', e[4] && e[5] ? 'anlamlı, tutarlı' : 'anlamlı değil')] };
    } });
}
