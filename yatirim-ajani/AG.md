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
| `kap_bildirimler.csv.gz`  | KAP bildirim sorgusu       | Seçili konularda şirket bildirimleri (pay alım satım, geri alım, kâr payı, sermaye artırımı …)  |
| `kap_pay_detay.csv.gz`    | KAP bildirim sayfaları     | Pay alım satım ve halka arzda %5 üstü alım bildirimlerinin metni                                |
| `_cekim_raporu.json`      | —                          | Her kaynağın durumu, hata örnekleri, uç nokta keşfi sonuçları                                   |
| `analiz/*.json`           | `ag-analiz`                | Ağaç, öncü-takipçi, akış, yatırımcı tipleri, kural testleri                                     |

Araştırma ajanı çıktıları kod dalında: `dosya_kaynak/ag/fon_bildirimleri.json` (87 pay bildirimi), `fon_stratejileri.json`
(22 şirket), `yatirimci_davranisi.json` (istatistikler, bulgular, veri kaynakları). Hepsi arama özetlerinden; güven alanına bakın.

Çekilemeyenler (rapora yazılır): TEFAS (robot engeli), İş Yatırım yabancı payı geçmişi (uç nokta gövdesi bulunamadı; güncel
kesit tablosu sayfadan okunabiliyor), MKK yatırımcı sayıları, aracı kurum dağılımı.

## 2. Modüller (`yatirim_ajani/ag/`)

| Modül          | Ne yapar                                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kaynaklar.py` | Ham veri çekicileri; her kaynak bağımsız, hata rapora yazılır                                                                                         |
| `panel.py`     | Tarih × hisse panelleri (getiri, gece, gün içi, hacim, piyasa değeri), hisse evreni (sektör = BIST sektör endeksi üyeliği), saat dilimi getirileri   |
| `agac.py`      | Korelasyon ağı, piyasa + küçük hisse etkeni ayıklama, en küçük kapsayan ağaç, kümeler, öncü-takipçi (çoklu test düzeltmeli), fiyat gecikmesi         |
| `akis.py`      | Saat profili, işaretli hacim ve dürüstlük testleri, işlem ilgisi, sektör rotasyonu, mevsimsellik, varlık rotasyonu, küresel zincir, maden → sektör   |
| `yatirimci.py` | Tavan/taban dizileri, tabandan alım simülasyonu (kilit), halka arzlar, faktör primleri (BIST 100 içi/dışı), fon bildirimleri olay çalışması          |
| `strateji.py`  | Kural testleri: gece taşıma, lider-takipçi, dönemsel portföy, olay kuralları; maliyet senaryoları, Deflated Sharpe                                   |
| `calistir.py`  | Hepsini çalıştırır, JSON çıktıları ve raporu yazar                                                                                                   |
| `rapor.py`     | Türkçe rapor; kayıtlı JSON'lardan yeniden üretilebilir                                                                                               |
| `sayfa.py`     | Etkileşimli sayfa: analiz JSON'larını tek veri nesnesine indirger, ağaç yerleşimini hesaplar, `sayfa/` şablon parçalarıyla tek dosyalık HTML yazar    |

## 3. Komutlar

```bash
# Veri (Actions): is=ag-veri, kaynak=tv,yahoo,isy,mali,seri,saatlik,hisse_saatlik  (≈ 30 dk; KAP ayrı: kaynak=kap_liste ≈ 50 dk, sonra kaynak=kap_detay ≈ 150 dk, kaldığı yerden sürer)
python -m yatirim_ajani ag-veri-cek --klasor veri/ag --kaynak tv,yahoo,isy

# Analiz + rapor (yerel, ≈ 2 dk)
python -m yatirim_ajani ag-analiz --klasor cikti/veri/ag --rapor cikti/raporlar/ag-analiz-YYYYMMDD.md --arastirma dosya_kaynak/ag

# Yalnız raporu yeniden üret
python -m yatirim_ajani ag-analiz --yalniz-rapor --klasor cikti/veri/ag --rapor cikti/raporlar/ag-analiz-YYYYMMDD.md

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

## 5. Başlıca bulgular (ayrıntı ve sayılar raporda)

1. BIST iki katmanlı: endeks etkeni + küçük hisse etkeni. İkisi ayıklanınca kalan bağların en güçlüleri aynı gruba ait şirketler;
   gerçek sektör kümeleri bankalar, savunma/teknoloji, sigorta, spor, madencilik, çimento.
2. Bilgi gece küresel serilerden BIST 30'un açılış boşluğuna giriyor (S&P vadelisi, dolar/TL, TUR), açılıştan sonra devam yok.
   Küçük hisseler 1–4 gün gecikmeli izliyor.
3. Getiri gecede, kayıp gün içinde; en zayıf dilimler 11:30–14:30 ve son yarım saat.
4. BIST 100'de ödüllendirilen ölçü kazanç verimi; BIST 100 dışında dikkat ve kalabalık izleri (devir hızı, hacim patlaması, son
   günlerin sıçraması) cezalandırılıyor, zirveye yakınlık ve gün içi güç ödüllendiriliyor.
5. Tavan serisi bozulunca, hacim patlamasından sonra, halka arzda seri bittikten sonra ve tabanda alım zarar ettiriyor.
6. Yoğun pozisyon alan fonların hisseleri 2025'te çok kazandırdı, SPK'nın 17 Eylül 2026 kararıyla çöktü; fon satış bildirimi
   güçlü bir çıkış işareti.
7. Sınanan alım kurallarından Deflated Sharpe eşiğini (0,95) net geçen yok. Adaylar: BIST 100 gece taşıma (maliyete bağlı) ve
   BIST 100 dışında bileşik puan (kıyası geçiyor, mutlak getirisi rejime bağlı).

## 6. Haftalık yönetime aktarım (öneri; HAFTA.md'ye ancak kullanıcı onayıyla girer)

- Alım 17:00–17:50, satış açılış: korunur (gece primi ve son yarım saat bulgusuyla uyumlu).
- Yeni kaçınma kuralları: tavan serisi bozulan, hacmi 3 katına çıkan (BIST 100 dışı), tabanda olan, halka arzı yeni biten ve yoğun
  fon payı ya da fon satış bildirimi olan hisseye alım yazılmaz.
- S&P vadelisi gece %0,5'ten fazla düştüyse o gün alım 17:00'ye bırakılır (zaten öyle), satış açılışta yapılır.
- BIST 100 dışına çıkılacaksa: bileşik puan + küçük hisse etkeni süzgeci; tez listesi kuralı (ekip oturumu) geçerli kalır.

## 7. Kuyruk

1. KAP bildirim listesinin tamamı (hız sınırı yüzünden parça parça) → fon bildirimleri olay çalışmasını arama özetleri yerine KAP
   kayıtlarıyla yinele; geri alım, bedelsiz, kâr payı olaylarını tüm BIST için tam saatleriyle ekle.
2. Yabancı payı geçmişi: sayfanın tarih parametresi çözülürse haftalık panel → "yabancı neye göre alıyor" doğrudan ölçülür.
3. Sektör endekslerinin uzun dönem geçmişi (İş Yatırım `IndexHistoricalAll`) → sektör mevsimselliği 2010'dan.
4. TEFAS fon fiyatları erişilebilir olursa getiri-tabanlı stil analizi (fonların sektör ve stil yükleri).
