// Günlük kurallar: kanıt gücüne göre sıralı kaçınma, zamanlama, aday ve reddedilen kurallar; gün akışı ve sınırlar.
function gorunumKurallar(kok) {
  const KU = V.kural || {};
  const Yt = V.yatirimci || {};
  const T = al(Yt, 'tavan', 'tavan') || {};
  const TA = Yt.taban_alimi || {};
  const HA = Yt.halka_arz || {};
  const FO = al(V, 'fon', 'olay') || {};
  const S = al(V, 'zaman', 'saat') || {};
  const hp = al(KU, 'hacim_patlamasi', 'bist100_disi') || {};
  const kg = al(KU, 'kotu_gece', 'bist100') || {};
  const ig = al(KU, 'iyi_gece', 'bist100') || {};
  const lt = al(KU, 'lider_takipci', 'bist100_disi') || {};
  const g1 = KU.gece_bist100 || {}, g2 = KU.gece_bist100_gece20 || {}, g3 = KU.gece_kucuk_gece20 || {};
  const bl = KU.bilesik || {};
  const bk = KU.bist100_kazanc || {};
  const ogle = ['11:30', '12:30', '13:30', '14:30'].reduce((a, d) => a + (al(S, 'grup', 'bist30', d, 'ort') || 0), 0);
  const K6 = al(V, 'zaman', 'varlik', 'kural', '6ay') || {};
  const os = al(V, 'yayilim', 'oncu_sektor') || {};
  const ak = al(V, 'zaman', 'akis', 'tavan_taban_haric', 'ertesi_gece') || {};
  const KR = al(V, 'ek', 'kap', 'kural') || {};
  const KO = al(V, 'ek', 'kap', 'olay', 'konu') || {};
  const gaA = KR.geri_alim_acilis_5g;
  const kural = (ad, ne, kanit, tur, etiket) => h('div', { class: 'kural' }, h('div', null, h('h4', { text: ad }), h('p', { class: 'ne' }, metin(ne))), h('p', { class: 'kanit' }, metin(kanit)), hap(tur, etiket));

  kok.append(giris('Günlük kurallar',
    `${tam(KU.deneme_sayisi)} kural sınandı. Hiçbir alım kuralı, çok sayıda deneme yapılmış olmasını hesaba katan eşiği (Deflated Sharpe 0,95) maliyet sonrası geçemedi. ` +
    '**En sağlam bulgular neyi yapmamak gerektiğini söylüyor.** Kurallar kanıt gücüne göre sıralıdır; sayılar 2024–2026 verisinden, maliyet ve tavan-taban kilidi hesaba katılarak çıkarıldı.'));

  kok.append(h('div', { class: 'grid' },
    sekil({ baslik: 'Kaçınma kuralları', alt: 'Kanıtı en güçlü grup: çok sayıda olay, yüksek t değeri, dönemin iki yarısında aynı yön.' }, h('div', { class: 'kural-liste' },
      kural('Tavan serisi bozulan hisse', 'Seri bittikten sonraki günlerde **alma**; elindeyse serinin bozulduğu gün çık.',
        `Sonraki 5 gün ortalama **${yz(al(T, 'dizi_bitince', 'sonraki_5g', 'ort'), 1)}** (t ${sy(al(T, 'dizi_bitince', 'sonraki_5g', 't'), 1)}), ${tam(al(T, 'dizi_bitince', 'sonraki_5g', 'n'))} olay; kazananların oranı ${yzp(al(T, 'dizi_bitince', 'sonraki_5g', 'pozitif'))}.`, 'kacin', 'Kaçın'),
      kural('Hacmi patlayan küçük hisse', 'BIST 100 dışında günlük hacim son 60 günün ortalamasının 3 katını aştıysa **alma**.',
        `Sonraki 5 gün **${yz(al(hp, 'sonraki_5g', 'ort'), 2)}** (t ${sy(al(hp, 'sonraki_5g', 't'), 1)}), 20 gün ${yz(al(hp, 'sonraki_20g', 'ort'), 2)}; ${tam(hp.olay)} olay. BIST 100 hisselerinde etki anlamlı değil.`, 'kacin', 'Kaçın'),
      kural('Tabanda kapanan hisse', '"Ucuzladı" diye tabandan **alma**.',
        `Gerçekleşen ortalama **${yz(al(TA, 'hepsi', 'gercek_ort'), 1)}**; olayların ${yzp(al(TA, 'hepsi', 'kilitli_kalan'))}'inde ertesi gün de taban, satış yapılamıyor.`, 'kacin', 'Kaçın'),
      kural('Yeni halka arz', 'Tavan serisi bittikten sonra borsadan **alma**.',
        `Seri bittikten 20 gün sonra medyan **${yz(al(HA, 'sonra_20g', 'medyan'), 0)}**, bugüne medyan ${yz(al(HA, 'bugune', 'medyan'), 0)}; ${tam(HA.hisse)} halka arz.`, 'kacin', 'Kaçın'),
      kural('Fonun sattığı ya da ağır olduğu küçük hisse', 'Fon satım bildirimi gelen hisseden **çık**; halka açık payı birkaç fonda toplanmış hisseyi **alma**.',
        `Satım bildiriminden sonraki 20 gün **${yz(al(FO, 'satim', 'sonra_20g', 'ort'), 1)}** (t ${sy(al(FO, 'satim', 'sonra_20g', 't'), 1)}, ${tam(al(FO, 'satim', 'sonra_20g', 'n'))} olay; az sayıda olay).`, 'kacin', 'Kaçın'),
      KR.bedelsiz_20g ? kural('Bedelsiz sermaye artırımı haberi', 'Haber çıktıktan sonra **alma**; elindeyse haber sabahındaki sıçramada sat.',
        `Haber sabahı açılışta ${yz(al(KO, 'bedelsiz_ilk', 'gece_0', 'ort'), 1)}; sonra 20 gün tutan sepet pazar katmanının günde **${bpz(al(KR, 'bedelsiz_20g', 'net', 'fazla_ort'))}** gerisinde (t ${sy(al(KR, 'bedelsiz_20g', 'net', 'fazla_t'), 1)}), her yıl aynı yönde.`, 'kacin', 'Kaçın') : null,
      KR.bedelli_20g ? kural('Bedelli sermaye artırımı kararı', 'Karar çıkan hisseden **çık**; yeni alım yapma.',
        `Açılışta ${yz(al(KO, 'bedelli_ilk', 'gece_0', 'ort'), 1)}; sonraki 20 günde sepet günde **${bpz(al(KR, 'bedelli_20g', 'net', 'fazla_ort'))}** geride (t ${sy(al(KR, 'bedelli_20g', 'net', 'fazla_t'), 1)}).`, 'kacin', 'Kaçın') : null,
      KR.kap_esik_20g ? kural('Ortaklık payı eşik bildirimi', 'Bir ortağın payının %5, %10 gibi eşikleri geçtiği bildirimi alım işareti sayma.',
        `Bildirimden önceki 20 günde ${yz(al(KO, 'pay_kap_ilk', 'once_20g', 'ort'), 1)} yükseliş; sonra 20 gün tutan sepet günde **${bpz(al(KR, 'kap_esik_20g', 'net', 'fazla_ort'))}** geride (t ${sy(al(KR, 'kap_esik_20g', 'net', 'fazla_t'), 1)}).`, 'kacin', 'Kaçın') : null,
      kural('Kötü gecenin sabahı', 'S&P 500 vadelisi BIST kapanışından açılışına %0,5\'ten fazla düştüyse o gün **gün içinde alım yapma**; satılacak varsa açılışta sat.',
        `Böyle ${tam(kg.gun)} günde BIST 100'ün açılıştan kapanışa ortalaması **${yz(al(kg, 'brut', 'ort'), 2)}**; diğer günlerde ${yz(kg.kosul_disi_ort, 2)}.`, 'kacin', 'Kaçın'),
      kural('Endeksin sert düştüğü günün ertesi', 'BIST 100 günü %1\'den fazla düşüşle kapattıysa ertesi gün **küçük hisse alma**.',
        `Ertesi gün BIST 100 dışı ortalama **${yz(al(lt, 'zayif_gun_sonrasi', 'brut', 'ort'), 2)}** (t ${sy(al(lt, 'zayif_gun_sonrasi', 'brut', 't'), 1)}, ${tam(al(lt, 'zayif_gun_sonrasi', 'gun'))} gün); dönemin ikinci yarısında ${yz(al(lt, 'zayif_gun_sonrasi', 'brut', 'yari2_ort'), 2)}. ` +
        `Tersi (güçlü günün ertesi ${yz(al(lt, 'guclu_gun_sonrasi', 'brut', 'ort'), 2)}) ikinci yarıda ${yz(al(lt, 'guclu_gun_sonrasi', 'brut', 'yari2_ort'), 2)} ile söndü.`, 'kacin', 'Kaçın')))));

  kok.append(h('div', { class: 'grid' },
    sekil({ baslik: 'Zamanlama kuralları', cls: 'y6', alt: 'Ne alınacağını değil, emrin günün hangi saatinde verileceğini söyler.' }, h('div', { class: 'kural-liste' },
      kural('Alım kapanışa, satış açılışa', 'Alım emri 17:00–17:50 arası, satış emri açılışta.',
        `BIST 100'de ortalama gece **${bpz(al(g1, 'brut', 'ort'))}**, ortalama gün içi **${bpz(kg.kosulsuz_ort)}**.`, 'uygula', 'Uygula'),
      kural('Öğle saatlerinde işlem açma', '11:30–14:30 arasında yeni alım yok.',
        `BIST 30'da bu dört saatin toplamı **${bpz(ogle)}**; kapanış yarım saati ${bpz(al(S, 'grup', 'bist30', '17:30', 'ort'))}.`, 'uygula', 'Uygula'))),
    sekil({ baslik: 'Aday alım kuralları', cls: 'y6', alt: 'Brüt getirisi anlamlı, ama maliyete ya da piyasa rejimine bağlı. Küçük tutarla ve izleyerek denenebilir.' }, h('div', { class: 'kural-liste' },
      gaA && gaA.net ? kural('İlk geri alım bildirimi', 'Akşam gelen ilk geri alım bildiriminin ertesi sabahı açılışta al, 5 işlem günü tut.',
        `30 bp maliyetle yıllık ${yz(al(gaA, 'net', 'yillik'), 0)}; pazar katmanına göre günde **${bpz(al(gaA, 'net', 'fazla_ort'))}** fazla (t ${sy(al(gaA, 'net', 'fazla_t'), 1)}), iki yarıda ${(al(gaA, 'net', 'fazla_yari') || []).map(x => bpz(x)).join(' ve ')}. Deflated Sharpe ${sy(gaA.dsr_fazla, 2)}.`, 'aday', 'Aday') : null,
      kural('BIST 100 gece taşıma', 'Kapanışta al, ertesi açılışta sat.',
        `Brüt **${bpz(al(g1, 'brut', 'ort'))}** / gece. Gidiş-dönüş 10 bp maliyetle yıllık ${yz(al(g1, 'net_10bp', 'yillik'), 0)}, 30 bp ile **${yz(al(g1, 'net_30bp', 'yillik'), 0)}**. Başabaş maliyet ${sy((g1.basabas_maliyet || 0) * 1e4, 0)} bp; Deflated Sharpe ${sy(g1.dsr_10bp, 2)}.`, 'aday', 'Maliyete bağlı'),
      kural('Gece taşıma, gecesi güçlü hisselerle', 'BIST 100 içinde son 20 günün gece getirisi en yüksek beşte biri kapanışta al, açılışta sat.',
        `Brüt **${bpz(al(g2, 'brut', 'ort'))}** / gece; 10 bp ile yıllık ${yz(al(g2, 'net_10bp', 'yillik'), 0)}, Deflated Sharpe ${sy(g2.dsr_10bp, 2)}; 30 bp ile ${yz(al(g2, 'net_30bp', 'yillik'), 0)}.`, 'aday', 'Maliyete bağlı'),
      kural('BIST 100 dışı bileşik puan', `${tam(bl.tutma_gun)} günde bir, puanı en yüksek beşte biri tut: zirveye yakın, gün içi güçlü, kazanç verimi yüksek; devir hızı, oynaklık, sıçrama ve hacim patlaması düşük.`,
        `30 bp maliyetle yıllık ${yz(al(bl, 'net_30bp', 'yillik'), 0)}; kıyasa göre dönem başına **${yz(al(bl, 'net_30bp', 'fazla_ort'), 2)}** fazla (t ${sy(al(bl, 'net_30bp', 'fazla_t'), 1)}). İkinci yarıda kıyası yine geçti ama mutlak getirisi ${yz(al(bl, 'ikinci_yari', 'brut', 'ort'), 2)}: küçük hisseler düşerken o da düşüyor.`, 'aday', 'Rejime bağlı')))));

  kok.append(h('div', { class: 'grid' },
    sekil({ baslik: 'Reddedilenler', alt: 'İlk bakışta işe yarar görünen, dürüst testte dayanmayan kurallar.' }, h('div', { class: 'kural-liste' },
      kural('BIST 100\'de ucuz hisse sepeti', 'Kazanç verimi en yüksek beşte biri al-tut.',
        `Eşit ağırlıklı BIST 100 kıyasını geçmiyor: dönem başına ${yz(al(bk, 'net_20bp', 'fazla_ort'), 2)} (t ${sy(al(bk, 'net_20bp', 'fazla_t'), 1)}). Uzun-kısa farkı var, yalnız uzun tarafı yetmiyor.`, 'ret', 'Reddedildi'),
      kural('İyi gecenin sabahı alım', 'S&P vadelisi gece %0,5\'ten fazla yükseldiyse açılışta al.',
        `${tam(ig.gun)} günde açılıştan kapanışa ortalama ${yz(al(ig, 'brut', 'ort'), 2)}: iyi haber açılış fiyatında, sonrası yok.`, 'ret', 'Reddedildi'),
      kural('Alım baskısını izlemek', 'Saatlik çubuklardan alım baskısı yüksek hisseyi kapanışta al.',
        `Tavan ve taban günleri çıkarılınca ertesi gece farkı ${bpz(ak.ust_alt)} (t ${sy(ak.t, 1)}).`, 'ret', 'Reddedildi'),
      al(V, 'yayilim', 'komsu', 'test', 'yukari', 'ertesi') ? kural('Kardeş hisse sıçradı, sıra bunda', 'Ağda en sıkı bağlı komşusu sıçrayan ama kendisi kıpırdamamış hisseyi kapanışta al.',
        `Örneklem dışında ertesi gün ${yz(al(V, 'yayilim', 'komsu', 'test', 'yukari', 'ertesi', 'ort'), 2)} (t ${sy(al(V, 'yayilim', 'komsu', 'test', 'yukari', 'ertesi', 't'), 1)}, ${tam(al(V, 'yayilim', 'komsu', 'test', 'yukari', 'olay'))} olay): bağlar aynı gün fiyatlanıyor.`, 'ret', 'Reddedildi') : null,
      kural('Günlük sektör rotasyonu', 'Dün yükselen sektörün ardından bugün başka bir sektörü al.',
        `${tam(os.test)} sektör çiftinden ${tam((os.kenar || []).length)} tanesi anlamlı; ${tam((os.kenar || []).filter(e => e[0] === e[1]).length)} tanesi sektörün kendi sürekliliği, kalanların korelasyonu 0,15'in altında.`, 'ret', 'Reddedildi'),
      kural('Varlık momentumu', 'BIST, altın, gümüş ve dolardan son 6 ayın en iyisini tut.',
        `Dönemin ikinci yarısında ${katsayi((K6.yari2 || 0) + 1)}; dört varlığa eşit ağırlık ${katsayi((K6.esit_yari2 || 0) + 1)}.`, 'ret', 'Reddedildi')))));

  // Gece taşıma maliyeti + bileşik puan
  const gEl = cizimKutusu();
  const GS = [{ ad: 'Gidiş-dönüş 10 bp maliyetle', renk: 'var(--s1)' }, { ad: '30 bp maliyetle', renk: 'var(--s2)' }];
  const gSatir = [['BIST 100, tüm hisseler', g1], ['BIST 100, gecesi güçlü beşte bir', g2], ['BIST 100 dışı, gecesi güçlü beşte bir', g3]].filter(x => x[1].brut);
  const yillar = Object.keys(g1.yil || {}).sort();
  kok.append(h('div', { class: 'grid' },
    sekil({ baslik: 'Gece taşımada her şeyi maliyet belirliyor', cls: 'y6', alt: 'Kapanışta alıp açılışta satmanın yıllık getirisi, iki maliyet varsayımıyla.' },
      gosterge(GS), gEl,
      p(`Her gece iki işlem demek: yılda yaklaşık 500 işlem. Gece başına brüt getiri yıldan yıla azalıyor: ${yillar.map(y => `${y} **${bpz(g1.yil[y])}**`).join(', ')}. ` +
        'Komisyon ve alım-satım fiyat farkı toplamı 20 bp\'ye yaklaşan bir hesapta bu kural zarar ettirir. Açılış ve kapanış seansı emirleriyle fiyat farkını ödememek şart.', 'okuma')),
    sekil({ baslik: 'Bileşik puanın karnesi', cls: 'y6', alt: 'BIST 100 dışı, 20 günde bir yenilenen sepet.' },
      tablo([{ ad: 'Ölçü' }, { ad: 'Değer', n: 1 }], [
        ['Yıllık getiri, 30 bp maliyetle', yz(al(bl, 'net_30bp', 'yillik'), 0)], ['Kıyasın yıllık getirisi (BIST 100 dışı, eşit ağırlık)', yz(al(bl, 'kiyas', 'yillik'), 0)],
        ['Dönem başına fazla getiri (t)', `${yz(al(bl, 'net_30bp', 'fazla_ort'), 2)} (${sy(al(bl, 'net_30bp', 'fazla_t'), 1)})`], ['En büyük düşüş', yz(al(bl, 'net_30bp', 'en_buyuk_dusus'), 0)],
        ['Deflated Sharpe: kıyasa göre fazla getiri', sy(bl.dsr_fazla, 2)], ['Deflated Sharpe: mutlak getiri', sy(bl.dsr_mutlak, 2)],
        ['Küçük hisse dalgası yukarıdayken tut, değilse nakit: yıllık', yz(al(bl, 'rejimli', 'yillik'), 0)], ['Bu süzgeçle en büyük düşüş', yz(al(bl, 'rejimli', 'en_buyuk_dusus'), 0)]]),
      p(`Seçim ölçütü kıyası sağlam biçimde geçiyor; mutlak getiri ise küçük hisselerin genel yönüne bağlı. Süzgeç şu an **${bl.rejim_acik_mi ? 'açık: sepet tutulur' : 'kapalı: nakitte beklenir'}**.`, 'okuma'),
      (bl.son_secim || []).length ? h('div', { class: 'kbaslik', text: 'Son yenilemede puanı en yüksek hisseler (örnek; öneri değil)' }) : null,
      h('div', { class: 'cipler' }, (bl.son_secim || []).map(x => h('span', { class: 'cip', text: x }))))));
  cubukYatay(gEl, { baslik: 'Gece taşıma, maliyet sonrası yıllık getiri', seri: GS, bicim: v => yz(v, 0), etiketGen: 230,
    satir: gSatir.map(([ad, g]) => ({ ad, alt: `ortalama ${sy(g.ort_hisse, 0)} hisse`, v: [al(g, 'net_10bp', 'yillik'), al(g, 'net_30bp', 'yillik')],
      ipucu: () => [tipSatir('Brüt, gece başına', bpz(al(g, 'brut', 'ort'))), tipSatir('10 bp ile yıllık', yz(al(g, 'net_10bp', 'yillik'), 0), 'var(--s1)'), tipSatir('30 bp ile yıllık', yz(al(g, 'net_30bp', 'yillik'), 0), 'var(--s2)'),
        tipSatir('Deflated Sharpe (10 bp)', sy(g.dsr_10bp, 2)), tipSatir('En büyük düşüş (10 bp)', yz(al(g, 'net_10bp', 'en_buyuk_dusus'), 0))] })) });

  // Gün akışı + sınırlar
  kok.append(h('div', { class: 'grid' },
    sekil({ baslik: 'Bir işlem gününün akışı', cls: 'y7', alt: 'Kuralların saat sırasına dizilmiş hali. Hangi hissenin alınacağını tez listesi belirler; bu akış ne zaman ve nelerden uzak durulacağını söyler.' },
      h('dl', { class: 'akis' },
        h('dt', { text: '09:40' }), h('dd', null, metin('**Gece verisine bak:** S&P 500 vadelisi, dolar/TL, Brent. S&P vadelisi %0,5\'ten fazla düştüyse bugün alım yok.')),
        h('dt', { text: '09:55–10:10' }), h('dd', null, metin('**Satışlar açılışta.** Gece primi alınmış olur; gün içini beklemek ortalamada kaybettirir.')),
        h('dt', { text: '10:30–16:30' }), h('dd', null, metin('**Yeni alım yok.** KAP akışını izle: fon satım bildirimi, tavan serisi bozan, hacmi üç katına çıkan hisseler kaçınma listesine girer.')),
        h('dt', { text: '17:00–17:50' }), h('dd', null, metin('**Alımlar.** Tez listesindeki ve kaçınma listesinde olmayan hisseler; endeks bugün %1\'den fazla düştüyse küçük hisse alımı ertelenir.')),
        h('dt', { text: '18:10 sonrası' }), h('dd', null, metin('**Günün taraması:** tavan ve taban kapananlar, hacim patlamaları ve akşam KAP bildirimleri. Bedelsiz, bedelli ve eşik bildirimleri kaçınma listesine; ilk geri alım bildirimi ertesi sabahın alım adaylarına yazılır.')))),
    sekil({ baslik: 'Bu sonuçların sınırları', cls: 'y5' },
      h('ul', { class: 'duz' },
        h('li', { text: 'Veri 2024–2026: yüksek enflasyon ve tek bir düzenleme dönemi. Başka bir rejimde sayılar değişebilir.' }),
        h('li', { text: 'Kimin aldığını gösteren veri yok (MKK, takas, aracı kurum dağılımı). Büyük ve küçük yatırımcı ayrımı evren üzerinden dolaylı yapıldı.' }),
        h('li', { text: 'Fon şirketlerinin bildirimleri KAP listesinden alındı; bildirimin alım mı satım mı olduğu metinden ayrıştırılıyor ve her zaman kesin değil. TEFAS fon fiyatları çekilemedi.' }),
        h('li', { text: 'Olay ortalamaları ile sepet testi farklı sonuç verebilir: ortalama, birkaç hisseye ve kalabalık günlere fazla ağırlık verir. Kurallar sepet testine göre sınıflandı.' }),
        h('li', { text: 'Maliyet varsayımı gidiş-dönüş 10 ve 30 baz puan. Gerçek maliyet aracı kuruma, emir tipine ve hissenin derinliğine göre değişir.' }),
        h('li', { text: 'Küçük hisselerde büyük tutarla işlem fiyatı oynatır; testler fiyat etkisini hesaba katmaz.' }),
        h('li', { text: 'Deflated Sharpe: çok sayıda kural denendiğinde en iyisinin şans eseri iyi görünme payını düşen ölçü. 0,95 altı "şans olabilir" demektir.' })),
      p('Bu sayfa bir araştırma özetidir. Yatırım tavsiyesi değildir.', 'alt'))));
}
