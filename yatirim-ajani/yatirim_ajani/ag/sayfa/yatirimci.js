// Yatırımcı izleri: iki evrende hangi ölçü ödüllendiriliyor; kısa vade; tavan-taban; halka arz; araştırma bulguları.
function gorunumYatirimci(kok) {
  const Y = V.yatirimci || {};
  const F = al(Y, 'faktor', 'ozellik') || {};
  if (!Object.keys(F).length) { kok.append(p('Yatırımcı verisi bulunamadı.')); return; }
  const ufuk = al(Y, 'faktor', 'ufuk_gun') || 20;
  const fb = (oz, grup, alan) => al(F, oz, grup, alan);
  const cumleF = (oz, grup) => `${yz(fb(oz, grup, 'ust_alt'), 1)} (t ${sy(fb(oz, grup, 't'), 1)})`;
  const kv = (s, grup, tur, alan) => al(Y, 'kisa', s, grup, tur, alan);
  const fm = (grup, oz) => al(Y, 'fm', grup, 'katsayi', oz, 't');

  kok.append(giris('Büyük ve küçük yatırımcı neye göre alıyor?',
    'Kimin aldığını gösteren kayıtlar (hesap bazında takas, MKK dökümleri) herkese açık değil. Onun yerine iki evren karşılaştırıldı: yabancının ve kurumların ağırlıkta olduğu **BIST 100** ile bireysel yatırımcının ağırlıkta olduğu **BIST 100 dışı**. ' +
    `Bir ölçüye göre en yüksek ve en düşük beşte birlik dilimin sonraki ${ufuk} günlük getiri farkı, o evrendeki alıcının neyi fiyatladığını ve neyi fazla ödediğini gösterir.`));

  // 1) İki evren
  kok.append(h('div', { class: 'grid' }, sekil({ baslik: 'İki evrenin iki ayrı kuralı' },
    h('div', { class: 'ikili' },
      h('div', null, h('h4', { text: 'BIST 100: büyük yatırımcının evreni' }), h('ul', { class: 'duz' },
        h('li', null, metin(`Ödüllendirilen tek ölçü **kazanç verimi**: en ucuz dilim en pahalıdan ${cumleF('kazanc_verimi', 'bist100')} önde.`)),
        h('li', null, metin(`Momentum ${cumleF('momentum_120_20', 'bist100')}, oynaklık ${cumleF('oynaklik_20g', 'bist100')}, devir hızı ${cumleF('devir_hizi_20g', 'bist100')}: ayırt edici değil. Bilinen ölçüler zaten fiyatta.`)),
        h('li', null, metin(`Çok değişkenli testte **halka açıklığı düşük** hisseler önde (t ${sy(fm('bist100', 'halka_aciklik'), 1)}): dolaşımdaki pay azaldıkça fiyat daha kolay taşınıyor.`)),
        h('li', null, metin(`Gece güçlü olan hisse ertesi gece de güçlü (${bpz(kv('gece_20g', 'bist100', 'ertesi_gece', 'ust_alt'))}, t ${sy(kv('gece_20g', 'bist100', 'ertesi_gece', 't'), 1)}), gün içinde geri veriyor (${bpz(kv('gece_20g', 'bist100', 'ertesi_gunici', 'ust_alt'))}).`)))),
      h('div', null, h('h4', { text: 'BIST 100 dışı: küçük yatırımcının evreni' }), h('ul', { class: 'duz' },
        h('li', null, metin(`**Kalabalığın izleri cezalandırılıyor:** devir hızı ${cumleF('devir_hizi_20g', 'bist100_disi')}, oynaklık ${cumleF('oynaklik_20g', 'bist100_disi')}, son 20 günün en büyük sıçraması ${cumleF('max_20g', 'bist100_disi')}, hacim patlaması ${cumleF('hacim_soku', 'bist100_disi')}.`)),
        h('li', null, metin(`**Sessiz güç ödüllendiriliyor:** 52 hafta zirvesine yakınlık ${cumleF('zirveye_yakinlik', 'bist100_disi')}, gün içi güç ${cumleF('gunici_20g', 'bist100_disi')}.`)),
        h('li', null, metin(`Halka açık değeri küçük hisseler önde: büyük dilim ${cumleF('halka_acik_deger', 'bist100_disi')} geride.`)),
        h('li', null, metin(`Dün hacmi patlayan hisse bugün gün içinde ${bpz(kv('hacim_soku', 'bist100_disi', 'ertesi_gunici', 'ust_alt'))} (t ${sy(kv('hacim_soku', 'bist100_disi', 'ertesi_gunici', 't'), 1)}): ilgi geldiğinde fiyat çoktan gitmiş oluyor.`))))),
    p('Sonuç: büyük hisselerde "ucuz olanı al" dışında bir üstünlük ölçülemiyor. Küçük hisselerde kazanç, kalabalığın peşinden gitmemekten geliyor: herkesin konuştuğu, hacmi ve oynaklığı artmış hisse sonraki haftalarda geride kalıyor.', 'okuma'))));

  const yb = yabanciSekli();
  if (yb) kok.append(...[].concat(yb));

  // 2) Faktör primleri + dilimler
  const ozler = Object.keys(F);
  const SER = [{ ad: 'BIST 100', renk: 'var(--s1)' }, { ad: 'BIST 100 dışı', renk: 'var(--s2)' }];
  const fEl = cizimKutusu(), dEl = cizimKutusu();
  let secOz = ozler.includes('devir_hizi_20g') ? 'devir_hizi_20g' : ozler[0];
  const dCiz = cubukDikey(dEl, { baslik: 'Beşte birlik dilimlerin sonraki getirisi', kat: ['En düşük', '2', '3', '4', 'En yüksek'], yukseklik: 230, bicim: v => yz(v, 2), eksenBicim: v => yz(v, 1),
    seri: () => [{ ad: 'BIST 100', renk: 'var(--s1)', v: fb(secOz, 'bist100', 'dilim_ort') || [] }, { ad: 'BIST 100 dışı', renk: 'var(--s2)', v: fb(secOz, 'bist100_disi', 'dilim_ort') || [] }] });
  const dNot = h('p', { class: 'okuma' });
  const dNotYaz = () => dNot.replaceChildren(...metin(`**${ozAd(secOz)}**: en yüksek ve en düşük dilim farkı BIST 100'de ${cumleF(secOz, 'bist100')}, BIST 100 dışında ${cumleF(secOz, 'bist100_disi')}. ` +
    `Dönemin iki yarısında BIST 100 dışı fark: ${yz(fb(secOz, 'bist100_disi', 'yari1'), 1)} ve ${yz(fb(secOz, 'bist100_disi', 'yari2'), 1)}.`));
  kok.append(h('div', { class: 'grid' },
    sekil({ baslik: 'Hangi ölçü hangi evrende işe yarıyor?', cls: 'y7', alt: `Ölçüye göre en yüksek dilim eksi en düşük dilim, sonraki ${ufuk} işlem günü getirisi. Nokta: |t| ≥ 2.` },
      gosterge(SER), fEl,
      tabloAc([{ ad: 'Ölçü' }, { ad: 'BIST 100', n: 1 }, { ad: 't', n: 1 }, { ad: 'BIST 100 dışı', n: 1 }, { ad: 't', n: 1 }],
        () => ozler.map(o => [ozAd(o), yz(fb(o, 'bist100', 'ust_alt'), 2), sy(fb(o, 'bist100', 't'), 1), yz(fb(o, 'bist100_disi', 'ust_alt'), 2), sy(fb(o, 'bist100_disi', 't'), 1)]))),
    sekil({ baslik: 'Dilim dilim bakış', cls: 'y5', alt: `Seçilen ölçüye göre beşe bölünen hisselerin sonraki ${ufuk} günlük ortalama getirisi.` },
      h('div', { class: 'ctl' }, h('label', null, 'Ölçü', h('select', { id: 'dilim-olcu', onchange: e => { secOz = e.target.value; dCiz(); dNotYaz(); } },
        ozler.map(o => h('option', { value: o, text: ozAd(o), selected: o === secOz }))))),
      gosterge(SER), dEl, dNot)));
  dNotYaz();
  cubukYatay(fEl, { baslik: 'Faktör primleri', seri: SER, bicim: v => yz(v, 1), etiketGen: 250,
    satir: ozler.map(o => ({ ad: ozAd(o), v: [fb(o, 'bist100', 'ust_alt'), fb(o, 'bist100_disi', 'ust_alt')], isaret: [Math.abs(fb(o, 'bist100', 't') || 0) >= 2, Math.abs(fb(o, 'bist100_disi', 't') || 0) >= 2],
      ipucu: () => [tipSatir('BIST 100', yz(fb(o, 'bist100', 'ust_alt'), 2), 'var(--s1)'), tipSatir('t', sy(fb(o, 'bist100', 't'), 1)),
        tipSatir('BIST 100 dışı', yz(fb(o, 'bist100_disi', 'ust_alt'), 2), 'var(--s2)'), tipSatir('t', sy(fb(o, 'bist100_disi', 't'), 1)),
        tipSatir('Artı kapanan dönem (100 dışı)', yzp(fb(o, 'bist100_disi', 'pozitif_donem')))] }))
      .sort((a, b) => (b.v[1] || 0) - (a.v[1] || 0)) });

  // 3) Kısa vade tablosu
  const sinyaller = Object.keys(Y.kisa || {});
  const hucre = (s, g, tur) => `${bpz(kv(s, g, tur, 'ust_alt'))} (${sy(kv(s, g, tur, 't'), 1)})`;
  // 4) Tavan - taban
  const T = al(Y, 'tavan', 'tavan') || {}, B = al(Y, 'tavan', 'taban') || {};
  const diziKat = Object.keys(T.dizi || {});
  const tEl = cizimKutusu(), sbEl = cizimKutusu();
  const TS = [{ ad: 'Tavan serisi', renk: 'var(--s1)' }, { ad: 'Taban serisi', renk: 'var(--s2)' }];
  const sonra = ['sonraki_1g', 'sonraki_5g', 'sonraki_20g'];
  kok.append(h('div', { class: 'grid' },
    sekil({ baslik: 'Bugünün işareti yarını nasıl etkiliyor?', cls: 'y12', alt: 'İşarete göre en yüksek dilim eksi en düşük dilim; ertesi günün gece ve gün içi getirisi, baz puan (parantez içinde t).' },
      tablo([{ ad: 'Bugünkü işaret' }, { ad: '100 dışı · ertesi gece', n: 1 }, { ad: '100 dışı · ertesi gün içi', n: 1 }, { ad: 'BIST 100 · ertesi gece', n: 1 }, { ad: 'BIST 100 · ertesi gün içi', n: 1 }],
        sinyaller.map(s => [ozAd(s), hucre(s, 'bist100_disi', 'ertesi_gece'), hucre(s, 'bist100_disi', 'ertesi_gunici'), hucre(s, 'bist100', 'ertesi_gece'), hucre(s, 'bist100', 'ertesi_gunici')]), { genis: true }),
      p('Aynı hissede gece alanla gün içi satan farklı davranıyor: son haftalarda gecesi güçlü olan hisse ertesi gece yine kazanıyor, gün içinde yine kaybediyor. Gün içinde alıp gün içinde satan bu düzenin kaybeden tarafında kalıyor.', 'okuma')),
    sekil({ baslik: 'Seri uzadıkça devam olasılığı artıyor', cls: 'y6', alt: `Tavanda (ya da tabanda) kapanan hissenin ertesi gün yine aynı yerde kapanma olasılığı. ${tam(T.gun)} tavan, ${tam(B.gun)} taban günü.` },
      gosterge(TS), tEl,
      p(`Tavanların yalnız ${tam(T.bist100_gun)} tanesi BIST 100 hissesinde: bu, küçük hisse olayı. Taban günleri yıllara göre: ${Object.entries(B.yillik || {}).map(([y, n]) => `${y} **${tam(n)}**`).join(', ')}.`, 'okuma')),
    sekil({ baslik: 'Seri bitince geri veriyor', cls: 'y6', alt: 'Serinin bozulduğu günün kapanışından sonraki ortalama getiri. Nokta: |t| ≥ 2.' },
      gosterge(TS), sbEl,
      p(`Tavan serisi bozulan hissede sonraki 5 günde kazananların oranı ${yzp(al(T, 'dizi_bitince', 'sonraki_5g', 'pozitif'))}, 20 günde medyan ${yz(al(T, 'dizi_bitince', 'sonraki_20g', 'medyan'), 1)}. ` +
        '"Tavan bozdu, ucuzladı" diye alınan hisse ortalamada zarar ettiriyor.', 'okuma'))));
  cubukDikey(tEl, { baslik: 'Seri gününe göre devam olasılığı', kat: diziKat.map(k => k + '. gün'), bicim: v => yzp(v), eksenBicim: v => yzp(v), yukseklik: 220,
    seri: [{ ad: 'Tavan serisi', renk: 'var(--s1)', v: diziKat.map(k => al(T, 'dizi', k, 'ertesi_gun_devam')) }, { ad: 'Taban serisi', renk: 'var(--s2)', v: diziKat.map(k => al(B, 'dizi', k, 'ertesi_gun_devam')) }],
    ipucu: i => [tipBaslik(`Serinin ${diziKat[i]}. günü`), tipSatir('Tavan: ertesi gün yine tavan', yzp(al(T, 'dizi', diziKat[i], 'ertesi_gun_devam')), 'var(--s1)'), tipSatir('Olay', tam(al(T, 'dizi', diziKat[i], 'n'))),
      tipSatir('Taban: ertesi gün yine taban', yzp(al(B, 'dizi', diziKat[i], 'ertesi_gun_devam')), 'var(--s2)'), tipSatir('Olay', tam(al(B, 'dizi', diziKat[i], 'n')))] });
  cubukDikey(sbEl, { baslik: 'Seri bittikten sonraki getiri', kat: ['1 gün', '5 gün', '20 gün'], bicim: v => yz(v, 2), eksenBicim: v => yz(v, 1), yukseklik: 220,
    seri: [{ ad: 'Tavan serisi bitince', renk: 'var(--s1)', v: sonra.map(k => al(T, 'dizi_bitince', k, 'ort')), isaret: sonra.map(k => Math.abs(al(T, 'dizi_bitince', k, 't') || 0) >= 2) },
      { ad: 'Taban serisi bitince', renk: 'var(--s2)', v: sonra.map(k => al(B, 'dizi_bitince', k, 'ort')), isaret: sonra.map(k => Math.abs(al(B, 'dizi_bitince', k, 't') || 0) >= 2) }],
    ipucu: i => [tipBaslik(['1 gün', '5 gün', '20 gün'][i] + ' sonra'), tipSatir('Tavan serisi bitince', yz(al(T, 'dizi_bitince', sonra[i], 'ort'), 2), 'var(--s1)'), tipSatir('t', sy(al(T, 'dizi_bitince', sonra[i], 't'), 1)),
      tipSatir('Taban serisi bitince', yz(al(B, 'dizi_bitince', sonra[i], 'ort'), 2), 'var(--s2)'), tipSatir('t', sy(al(B, 'dizi_bitince', sonra[i], 't'), 1))] });

  // 5) Tabandan alım + halka arz
  const TA = Y.taban_alimi || {};
  const taSatir = [['hepsi', 'Tüm taban alımları'], ['bist100', 'BIST 100'], ['bist100_disi', 'BIST 100 dışı'], ['ayni_gun_cikilabilen', 'Ertesi gün satılabilen'], ['kilitli', 'Ertesi gün de tabanda kalan']].filter(x => TA[x[0]]);
  const taEl = cizimKutusu(), haEl = cizimKutusu();
  const TAS = [{ ad: 'Kapanıştan kapanışa ölçülen', renk: 'var(--s1)' }, { ad: 'Satılabildiği güne kadar gerçekleşen', renk: 'var(--s2)' }];
  const HA = Y.halka_arz || {};
  const dag = Object.entries(HA.tavan_dizisi_dagilim || {}).map(([k, v]) => [Number(k), v]).sort((a, b) => a[0] - b[0]);
  const enUzun = dag.length ? dag[dag.length - 1][0] : 0;
  const dagTam = Array.from({ length: enUzun + 1 }, (_, i) => (dag.find(d => d[0] === i) || [i, 0])[1]);
  const hg = HA.dizi_grubuna_gore || {};
  kok.append(h('div', { class: 'grid' },
    sekil({ baslik: 'Tabandan alım: kâğıtta kâr, gerçekte zarar', cls: 'y6', alt: `Tabanda kapanan hisseyi kapanışta alıp ertesi gün satma denemesi, ${tam(al(TA, 'hepsi', 'n'))} olay. Tabanda kilitli kalan pozisyon satılabildiği güne kadar taşınır.` },
      gosterge(TAS), taEl,
      p(`Olayların **${yzp(al(TA, 'hepsi', 'kilitli_kalan'))}**'inde hisse ertesi gün de tabanda: satılamıyor. Kapanış fiyatlarıyla ölçülen ${yz(al(TA, 'hepsi', 'olculen_ort'), 1)} "toparlanma" bir ölçüm yanılgısı; ` +
        `gerçekleşen ortalama **${yz(al(TA, 'hepsi', 'gercek_ort'), 1)}**, en kötü yirmide bir ${yz(al(TA, 'hepsi', 'yuzde5'), 0)}.`, 'okuma')),
    sekil({ baslik: 'Halka arzlar: seri bitince alan kaybediyor', cls: 'y6', alt: `2024'ten bu yana ${tam(HA.hisse)} halka arz. İlk işlem gününden başlayan tavan serisinin uzunluğu.` },
      haEl,
      h('div', { class: 'sayilar iki' }, sayi(sy(HA.tavan_dizisi_ort, 1) + ' gün', 'ortalama tavan serisi'), sayi(yz(HA.dizi_getirisi_ort, 0), 'seri boyunca ortalama getiri'),
        sayi(yz(al(HA, 'sonra_20g', 'medyan'), 0), 'seri bittikten 20 gün sonra medyan'), sayi(yz(al(HA, 'bugune', 'medyan'), 0), 'seri bitiminden bugüne medyan')),
      tablo([{ ad: 'Seri uzunluğu' }, { ad: 'Halka arz', n: 1 }, { ad: '20 gün sonra', n: 1 }, { ad: '60 gün sonra', n: 1 }, { ad: 'Bugüne', n: 1 }],
        Object.keys(hg).map(k => [k === '0' ? 'Hiç tavan yok' : k + ' gün', tam(hg[k].n), yz(hg[k].sonra_20g, 0), yz(hg[k].sonra_60g, 0), yz(hg[k].bugune, 0)])),
      p(`En uzun serilerin sonrası en kötü. Halka açık değeri küçük arzlarda seri daha uzun (${sy(al(HA, 'halka_acik_deger_kucuk', 'tavan_dizisi'), 1)} gün; büyüklerde ${sy(al(HA, 'halka_acik_deger_buyuk', 'tavan_dizisi'), 1)} gün): az pay, çok talep. ` +
        'Tahsisat alabilen kazanıyor, seri bitince borsadan alan kaybediyor.', 'okuma'),
      tabloAc([{ ad: 'Hisse' }, { ad: 'İlk gün' }, { ad: 'Tavan serisi', n: 1 }, { ad: 'Seri getirisi', n: 1 }, { ad: '20 gün', n: 1 }, { ad: '60 gün', n: 1 }, { ad: 'Bugüne', n: 1 }],
        () => (HA.liste || []).map(r => [h('span', { class: 'mono', text: r[0] }), r[1], String(r[2]), yz(r[3], 0), yz(r[4], 0), yz(r[5], 0), yz(r[6], 0)]), 'Halka arzları tablo olarak göster'))));
  cubukYatay(taEl, { baslik: 'Tabandan alım', seri: TAS, bicim: v => yz(v, 1), etiketGen: 200,
    satir: taSatir.map(([k, ad]) => ({ ad, alt: `${tam(TA[k].n)} olay`, v: [TA[k].olculen_ort, TA[k].gercek_ort],
      ipucu: () => [tipSatir('Ölçülen ortalama', yz(TA[k].olculen_ort, 2), 'var(--s1)'), tipSatir('Gerçekleşen ortalama', yz(TA[k].gercek_ort, 2), 'var(--s2)'), tipSatir('Medyan', yz(TA[k].gercek_medyan, 2)),
        tipSatir('Kazanan oranı', yzp(TA[k].kazanan)), tipSatir('Kilitli kalan', yzp(TA[k].kilitli_kalan))] })) });
  cubukDikey(haEl, { baslik: 'Halka arzlarda tavan serisi uzunluğu', kat: dagTam.map((_, i) => String(i)), bicim: v => tam(v) + ' arz', eksenBicim: v => tam(v), yukseklik: 170,
    seri: [{ ad: 'Halka arz sayısı', renk: 'var(--s1)', v: dagTam }], ipucu: i => [tipBaslik(i ? `${i} gün tavan serisi` : 'İlk gün tavan yok'), tipSatir('Halka arz', tam(dagTam[i]))] });

  // 6) Yanıltıcı bulgu örneği + araştırmalar
  const AK = al(V, 'zaman', 'akis') || {};
  const B_ = al(V, 'fon', 'bulgu') || [];
  const TIP = [{ k: 'bireysel', ad: 'Bireysel' }, { k: 'yabanci', ad: 'Yabancı' }, { k: 'fon', ad: 'Fon' }, { k: 'genel', ad: 'Genel' }].filter(t => B_.some(b => b.tip === t.k));
  const bKap = h('div');
  const bYaz = tip => bKap.replaceChildren(...B_.filter(b => b.tip === tip).map(b => h('details', { class: 'ac' },
    h('summary', null, b.baslik, h('small', { text: b.kanit ? `kanıt: ${b.kanit}` : '' })), h('div', null, h('p', { text: b.ozet || '' }), b.kunye ? h('p', { class: 'alt', text: b.kunye }) : null))));
  const ist = al(V, 'fon', 'istatistik') || [];
  kok.append(h('div', { class: 'grid' },
    sekil({ baslik: 'Dikkat: "alım baskısı" yanıltıyor', cls: 'y5', alt: 'Saatlik çubuklardan hesaplanan alım-satım baskısına göre en yüksek ve en düşük dilimin ertesi gece getiri farkı.' },
      tablo([{ ad: 'Örneklem' }, { ad: 'Ertesi gece farkı', n: 1 }, { ad: 't', n: 1 }],
        [['Tüm günler', bpz(al(AK, 'ham', 'ertesi_gece', 'ust_alt')), sy(al(AK, 'ham', 'ertesi_gece', 't'), 1)],
          ['Tavan ve taban günleri hariç', bpz(al(AK, 'tavan_taban_haric', 'ertesi_gece', 'ust_alt')), sy(al(AK, 'tavan_taban_haric', 'ertesi_gece', 't'), 1)]]),
      p('İlk satır çok güçlü bir öngörü gibi görünüyor. Tamamı tavanda kapanan hisselerden geliyor: tavandaki hisse zaten alınamaz. Bu günler çıkarılınca etki kayboluyor. Sayfadaki her kural bu süzgeçten geçirildi.', 'okuma')),
    sekil({ baslik: 'Araştırmalar ne diyor?', cls: 'y7', alt: 'Borsa İstanbul üzerine akademik çalışmalar ve kurum raporlarından derlenen bulgular (arama özetlerinden; künyeler bulgunun altında).' },
      TIP.length ? h('div', { class: 'ctl' }, seg(TIP, TIP[0].k, bYaz, 'Yatırımcı tipi')) : null, bKap,
      ist.length ? tabloAc([{ ad: 'Ölçü' }, { ad: 'Değer' }, { ad: 'Tarih' }], () => ist.map(i => [i.olcu, i.deger, i.tarih || '']), 'Yatırımcı sayıları ve paylar') : null)));
  if (TIP.length) bYaz(TIP[0].k);
}
