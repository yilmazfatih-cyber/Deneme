# AG.md — ağ katmanı yönergesi (BIST'i ağ ve ağaç olarak inceleme)

Amaç: Borsa İstanbul'un tamamında hisseler, sektörler, madenler ve küresel seriler arasındaki bağlantıları çıkarmak; bilginin ve
işlem ilgisinin nasıl yayıldığını (yıl, mevsim, saat) ölçmek; büyük (yabancı, kurumsal, fon) ve küçük (bireysel) yatırımcının hangi
ölçülere göre işlem yaptığını vekillerle tahmin etmek; bunlardan günlük kurallar türetip maliyetli ve dürüst biçimde sınamak.
Yatırım tavsiyesi değildir. Tera grubu hisseleri (TERA, TEHOL, TRHOL) hiçbir adımda yer almaz.

## 1. Veri (`ajan-ciktilari:veri/ag/`)

Dış ağ bu ortamda kapalıdır; veri GitHub Actions "Yatırım ajanı" iş akışının `ag-veri` işiyle çekilir
(`ref=claude/lucid-mccarthy-ofpol0`, girdi `kaynak=` ile kaynak seçilir).

| Dosya                     | Kaynak                     | İçerik                                                                                          |
| ------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------- |
| `tv_tarama.csv`           | TradingView tarayıcı       | 625 pay: sektör, piyasa değeri, halka açıklık, halka arz günü, üye olduğu endeksler             |
| `isy_panel.csv.gz`        | İş Yatırım `HisseTekil`    | 620 pay, 2024-01→: düzeltilmiş kapanış, AOF, TL hacim, piyasa değeri, halka açık piyasa değeri  |
| `gunluk_panel.csv.gz`     | Yahoo                      | 621 pay günlük açılış/kapanış (gece ve gün içi getiri ayrımı için)                              |
| `hisse_saatlik.csv.gz`    | Yahoo                      | 251 payın ham saatlik çubukları (09:30 … 17:30; ilk çubuk açılış seansını içerir), Kas 2024→    |
| `mali_panel.csv.gz`       | İş Yatırım `MaliTablo`     | 585 pay, seçili kalemler (özkaynak, net kâr, satış …), çeyreklik                                |
| `seriler_gunluk.csv.gz`   | Yahoo                      | XU100, XU030, XBANK, XUSIN, madenler (altın, gümüş, bakır, platin …), petrol, kur, 2010→ günlük |
| `seriler_saatlik.csv.gz`  | Yahoo                      | Aynı seriler + sektör endeksleri + ABD'deki Türkiye fonu (TUR), son 2 yıl saatlik               |
| `kap_bildirimler.csv.gz`  | KAP bildirim sorgusu       | 2024-01→: 20.558 bildirim, yayım saatiyle (geri alım, pay alım satım, kâr payı, sermaye …)      |
| `kap_pay_detay.csv.gz`    | KAP bildirim sayfaları     | 1.489 sayfanın metni: portföy şirketi bildirimlerinin ve "%5 üstü alanlar" bildirimlerinin tamamı, eşik bildirimlerinden 265 (artımlı) |
| `yabanci_oran_guncel.csv.gz` | İş Yatırım (sayfa tablosu) | 610 pay: halka açık paylar içinde yabancı payı, son iki işlem günü                            |
| `yabanci_gecmis.csv.gz`   | İş Yatırım (tablo isteği)  | Yabancı payının 144 haftalık kesiti, 2024-01→ (40.520 satır; kaynakta 2004'e kadar tarih var)   |
| `endeks_gunluk.csv.gz`    | İş Yatırım `IndexHistoricalAll` | 44 endeks, 2010→ günlük kapanış (sektör mevsimselliği ve süreklilik)                       |
| `_cekim_raporu.json`      | —                          | Her kaynağın durumu, hata örnekleri, uç nokta keşfi sonuçları                                   |
| `analiz/*.json`           | `ag-analiz`                | Ağaç, öncü-takipçi, akış, yatırımcı tipleri, kural testleri                                     |

Araştırma ajanı çıktıları kod dalında: `dosya_kaynak/ag/fon_bildirimleri.json` (87 pay bildirimi), `fon_stratejileri.json`
(22 şirket), `yatirimci_davranisi.json` (istatistikler, bulgular, veri kaynakları). Hepsi arama özetlerinden; güven alanına bakın.

Çekilemeyenler (rapora yazılır): TEFAS (robot engeli), MKK yatırımcı sayıları, aracı kurum dağılımı. Borsada işlem gören altın
ve gümüş fonlarının fiyat geçmişi Yahoo'da yok; madenler ons fiyatı × dolar/TL üzerinden izlenir.

## 2. Modüller (`yatirim_ajani/ag/`)

| Modül          | Ne yapar                                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kaynaklar.py` | Ham veri çekicileri; her kaynak bağımsız, hata rapora yazılır                                                                                         |
| `panel.py`     | Tarih × hisse panelleri (getiri, gece, gün içi, hacim, piyasa değeri), hisse evreni (sektör = BIST sektör endeksi üyeliği), saat dilimi getirileri   |
| `agac.py`      | Korelasyon ağı, piyasa + küçük hisse etkeni ayıklama, en küçük kapsayan ağaç, kümeler, öncü-takipçi (çoklu test düzeltmeli), fiyat gecikmesi         |
| `akis.py`      | Saat profili, işaretli hacim ve dürüstlük testleri, işlem ilgisi, sektör rotasyonu, mevsimsellik, varlık rotasyonu, küresel zincir, maden → sektör   |
| `yatirimci.py` | Tavan/taban dizileri, tabandan alım simülasyonu (kilit), halka arzlar, faktör primleri (BIST 100 içi/dışı), fon bildirimleri olay çalışması          |
| `strateji.py`  | Kural testleri: gece taşıma, lider-takipçi, dönemsel portföy, olay kuralları; maliyet senaryoları, Deflated Sharpe                                   |
| `kap.py`       | KAP bildirimleri: sınıflama, olay günü, katmana göre anormal getiri, ilk bildirim süzgeci, takvim zamanlı olay sepeti, portföy şirketi profilleri ve ortak hisse ağı; bildirim sayfasındaki form tablosundan yön ve tutulan pay (sermayeye ve halka açık paya oran), "%5 üstü alanlar" tablosundan alıcı türleri, eşik bildirimlerinde pay sahibi türü; yabancı oranı kesiti ve geçmişi; sektör endekslerinde ay etkisi ve süreklilik |
| `calistir.py`  | Hepsini çalıştırır, JSON çıktıları ve raporu yazar                                                                                                   |
| `rapor.py`     | Türkçe rapor; kayıtlı JSON'lardan yeniden üretilebilir                                                                                               |
| `sayfa.py`     | Etkileşimli sayfa: analiz JSON'larını tek veri nesnesine indirger, ağaç yerleşimini hesaplar, `sayfa/` şablon parçalarıyla tek dosyalık HTML yazar    |

## 3. Komutlar

```bash
# Veri (Actions): is=ag-veri, kaynak=tv,yahoo,isy,mali,seri,saatlik,hisse_saatlik  (≈ 30 dk)
#   KAP ayrı: kaynak=kap_liste (≈ 50 dk), sonra kaynak=kap_detay (≈ 150 dk; kaldığı yerden sürer)
#   İş Yatırım ek: kaynak=isy_ek (yabancı kesiti + endeks geçmişi, ≈ 2 dk), kaynak=yabanci_gecmis (haftalık kesitler)
python -m yatirim_ajani ag-veri-cek --klasor veri/ag --kaynak tv,yahoo,isy

# Analiz + rapor (yerel, ≈ 2 dk)
python -m yatirim_ajani ag-analiz --klasor cikti/veri/ag --rapor cikti/raporlar/ag-analiz-YYYYMMDD.md --arastirma dosya_kaynak/ag

# Yalnız raporu yeniden üret
python -m yatirim_ajani ag-analiz --yalniz-rapor --klasor cikti/veri/ag --rapor cikti/raporlar/ag-analiz-YYYYMMDD.md

# Günlük tarama (akşam): fiyat panelini ve KAP listesini tazele (liste artımlıdır: son bildirimden üç gün öncesinden bugüne)
#   Actions: is=ag-veri, kaynak=isy,yahoo,kap_liste  (≈ 20 dk)  →  ag-analiz  →  veri/ag/analiz/tarama.json (kaçınma ve aday listesi)

# Etkileşimli sayfa ("BIST Ağacı"): tek dosyalık HTML; tarayıcıda açılır ya da Artifact olarak yayınlanır
python -m yatirim_ajani ag-sayfa --klasor cikti/veri/ag --html cikti/raporlar/bist-agaci.html
```

Sayfanın altı bölümü: ağaç (gez, yakınlaş, hisse ara, sektör vurgula; iki ağaç türü), yayılım (küresel seri → açılış → küçük hisseler;
sektör × seri ısı haritası), saat-mevsim-yıl, yatırımcı izleri, fonlar, günlük kurallar. Şablon `yatirim_ajani/ag/sayfa/` altında:
`stil.css`, `govde.html` ve bölüm başına bir betik. Sayılar şablona yazılmaz; her cümle veriden doldurulur.

## 4. Dürüstlük kuralları (her testte)

- **Tavan/taban kilidi:** tavanda kapanan hisse o fiyattan alınamaz, tabanda kapanan satılamaz. Giriş günü kilitli olan hisse teste
  girmez; çıkış günü tabanda kapanan pozisyon ertesi güne taşınır. Bu kural iki sahte bulguyu ayıkladı: "alım baskısı ertesi geceyi
  öngörür" (t 13 → t −1) ve "tabandan sonra toparlanma" (+%0,8 → −%7,2).
- **Endeksin açılış değeri bayattır:** boşluk ve gün içi ayrımı hisselerin kendi açılış fiyatlarından yapılır.
- **İki ortak etken ayıklanır:** XU100 ve küçük hisse etkeni. Ayıklanmadan yapılan sektör öncü-takipçi testinde 676 çiftin 317'si
  "anlamlı" çıkıyordu; ayıklanınca 10.
- **Çoklu test:** Benjamini–Hochberg (yanlış keşif oranı %10), iki yarıda işaret tutarlılığı, kural testlerinde Deflated Sharpe
  (deneme sayısı raporda).
- **Maliyet:** gece taşımada gidiş-dönüş 10 ve 30 bp; dönemsel portföyde devir × 30 ve 60 bp.
- **İşlem hacmi payı para girişi değildir.** "İlgi" ölçer; net akış yalnız yatırımcı tipi verisiyle ölçülür.
- **Olay ortalaması karar ölçütü değildir.** Anormal getiri, hissenin getirisinin pazar katmanı ortalamasına oranıdır
  (log getirilerin ortalamasını çıkarmak rastgele olayda bile 20 günde ≈ +%1 sapma verir; testi var). Olay ortalamaları birkaç
  hisseye ve bildirimlerin yığıldığı günlere fazla ağırlık verir; kurallar **takvim zamanlı sepet** testine göre sınıflanır
  (her gün bir gözlem, tavanda alınmaz, tabanda satılamaz, maliyet düşülür). Bu ayrım üç sahte alım işaretini eledi: kâr payı
  kararı, şirketin başka şirkette pay alımı ve her geri alım bildirimi (olay ortalamasında artı, sepette sıfır ya da eksi).
- **Bildirim saati:** 18:00'den sonra ya da işlem günü dışında yayımlanan bildirimin olay günü sonraki ilk işlem günüdür.
- **Çift seçimi örneklem dışı:** komşu geçişi testinde çiftler kesim gününe kadarki veriyle seçilir, sonrası test edilir.

## 5. Başlıca bulgular (ayrıntı ve sayılar raporda)

1. BIST iki katmanlı: endeks etkeni + küçük hisse etkeni. İkisi ayıklanınca kalan bağların en güçlüleri aynı gruba ait şirketler;
   gerçek sektör kümeleri bankalar, savunma/teknoloji, sigorta, spor, madencilik, çimento.
2. Bilgi gece küresel serilerden BIST 30'un açılış boşluğuna giriyor (S&P vadelisi, dolar/TL, TUR), açılıştan sonra devam yok.
   Küçük hisseler 1–4 gün gecikmeli izliyor.
3. Getiri gecede, kayıp gün içinde; en zayıf dilimler 11:30–14:30 ve son yarım saat.
4. BIST 100'de ödüllendirilen ölçü kazanç verimi; BIST 100 dışında dikkat ve kalabalık izleri (devir hızı, hacim patlaması, son
   günlerin sıçraması) cezalandırılıyor, zirveye yakınlık ve gün içi güç ödüllendiriliyor.
5. Tavan serisi bozulunca, hacim patlamasından sonra, halka arzda seri bittikten sonra ve tabanda alım zarar ettiriyor.
6. Yoğun pozisyon alan fonların hisseleri 2025'te çok kazandırdı, SPK'nın 17 Eylül 2026 kararıyla çöktü. Fon satım bildirimi günü
   hisse −%1,7 (t −5,3); sonraki 60 günün ortalaması −%5,4 (t −1,2).
7. Sınanan alım kurallarından Deflated Sharpe eşiğini (0,95) net geçen yok. Adaylar: BIST 100 gece taşıma (maliyete bağlı),
   BIST 100 dışında bileşik puan (kıyası geçiyor, mutlak getirisi rejime bağlı) ve ilk geri alım bildirimi (ertesi açılışta
   al, 5 gün tut: günde +13 bp fazla, t 2,0, iki yarıda da aynı).
8. KAP bildirimleri (19.803 bildirim): bedelsiz ve bedelli haberinden sonra almak düzenli kaybettiriyor (20 gün tutan sepet günde
   −30 ve −26 bp); ortaklık payı eşik bildirimi alım işareti değil (−9 bp/gün). Bildirimlerin %55'i seans kapandıktan sonra
   geliyor, tepki ertesi açılışta fiyatlanıyor.
9. Portföy şirketlerinin 741 pay bildirimi: hedefler %91 BIST 100 dışı, oynak (70. yüzdelik), çok el değiştiren, yükselmiş,
   defter değerine göre pahalı (32. yüzdelik). Şirketler ortak hisselerde buluşuyor (merkezde Pardus). Bildirim 28 Ağustos 2026'ya
   kadar yükselişin ortasında geliyordu; sonrasında öncesi de sonrası da eksi. Bildirim sayfalarından yönü okunan 642 bildirimde
   (345 alım, 297 satım): alım bildirimi öncesinde hisse katmanının %12 önünde (t 6,3), ama bildirimi izleyip 20 gün tutan sepet
   günde −11 bp (t −1,7). **Tutulan pay:** 186 konumda sermayedeki pay medyan %4,8, halka açık paya oranı medyan %11; 37 konum
   dolaşımdaki payın dörtte birinden, 14 konum yarısından büyük. Dolaşımdaki payı toplayan şirket Pusula (ortadaki konumu halka
   açık payın %40'ı; 16 konumun 10'u dörtte birin üstünde); Pardus ve Hedef geniş sepetli (%9–11).
10. Yabancı payı (596 hisse): büyüklük ve derinlikle 0,5; BIST 100 içinde momentum +0,45, özkaynak kârlılığı +0,39, oynaklık −0,43.
    Hisselerin %76'sında yabancı payı %10'un altında.
11. Sektör endeksleri 2010–2026: güvenilir bir ay takvimi yok (276 çiftten 17'si |t| ≥ 2, şansla beklenen 13); 12 aylık
    süreklilik zayıf ama anlamlı (en kötü üç sektör ertesi ay −0,7 puan, t −2,1).
12. Altın, gümüş ve doların TL getirisi BIST kapalıyken oluşuyor (altın: gece +15 bp, seans +2 bp). Ağdaki en yakın komşu
    sıçradığında geride kalan hisse ertesi gün izlemiyor (örneklem dışı %0,0).
13. Bedelli artırımdan kalan payların satışı (78 satış, 62 şirket): ortadaki satışta payların %95'i birkaç büyük alıcıya gidiyor,
    36 satışta tek alıcı yarısından fazlasını alıyor. Alınan payın %89'u gerçek kişilerde; 84 kişiden 8'i kayıtların %56'sını
    oluşturuyor (en sık görülen kişi 44 satışta). Fonlar az ama büyük alıyor (Hedef Portföy fonları 6 satışta ortalama %64).
    Satış sonucu bildirildikten sonraki 5 gün: sepet günde −44 bp (t −2,8). İlk halka arzlarda ise 61 arzın yalnız 4'ünde
    payların %5'inden fazlasını alan var.
14. Yabancı payının haftalık değişimi (144 hafta, 603 hisse): payın arttığı hafta hisse de yükseliyor (uç beşte birlikler arası
    +%2,65, t 22), sonraki hafta +%0,13 (t 1,3), sonraki 20 gün sıfır. Artıştan önce hisse sakin, likit, zirvesine yakın ve son
    20 günde yükselmiş. Yayımlanan yabancı payı verisinden alım kuralı çıkmıyor. Toplam pay %22,2 → dip %20,6 (Eyl 2025) → %26,3.
15. Eşik bildirimlerinde (metni okunan 236 bildirim) pay sahibi: gerçek kişi 102, yerli şirket ve holding 94, yabancı kurum 40
    (Bank of America 28, Goldman Sachs 9; büyük olasılıkla saklama hesapları).

## 6. Haftalık yönetime aktarım (öneri; HAFTA.md'ye ancak kullanıcı onayıyla girer)

- Alım 17:00–17:50, satış açılış: korunur (gece primi ve son yarım saat bulgusuyla uyumlu).
- Yeni kaçınma kuralları: tavan serisi bozulan, hacmi 3 katına çıkan (BIST 100 dışı), tabanda olan, halka arzı yeni biten ve yoğun
  fon payı ya da fon satış bildirimi olan hisseye alım yazılmaz. KAP'tan: bedelsiz ya da bedelli sermaye artırımı bildirimi son
  20 işlem gününde çıkmış hisseye ve ortaklık payı eşik bildirimi gelmiş hisseye alım yazılmaz; bedelliden kalan payların satış
  sonucu bildirilmiş hisseye 5 işlem günü alım yazılmaz.
- Aday (küçük tutarla, ayrı izlenerek): akşam ilk geri alım bildirimi gelen hisse ertesi açılışta alınır, 5 işlem günü tutulur.
- S&P vadelisi gece %0,5'ten fazla düştüyse o gün alım 17:00'ye bırakılır (zaten öyle), satış açılışta yapılır.
- BIST 100 dışına çıkılacaksa: bileşik puan + küçük hisse etkeni süzgeci; tez listesi kuralı (ekip oturumu) geçerli kalır.

## 7. Kuyruk

1. Eşik bildirimlerinin kalan yaklaşık 4.800 sayfası (`kap_detay`, çalıştırma başına ≈150 dk): pay sahibi türleri tüm örneklemde;
   yön bildirimin ekinde olduğu için ek dosyaları okumadan ayrılamıyor.
2. Yabancı payı geçmişini 2004'e uzat (kaynakta tarih seçenekleri var): farklı rejimlerde aynı sonuç çıkıyor mu?
3. KAP listesini günlük artımlı çek (yalnız son 3 gün) → akşam taramasında kaçınma ve aday listeleri otomatik üretilsin.
4. TEFAS fon fiyatları erişilebilir olursa getiri-tabanlı stil analizi (fonların sektör ve stil yükleri).
