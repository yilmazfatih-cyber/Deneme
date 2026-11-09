# BIST saatlik strateji kütüphanesi — özet

*Yatırım tavsiyesi değildir. Amaç: 40–100 hissenin 2 yıllık saatlik verisi üzerinde sayılacak strateji tanımlarını
ve bunların hangi durumlarda takip edildiğini belirlemek. Kayıt dosyası: `strateji_kayit.json` (29 strateji).*

## 1. Popülerlik sıralaması (kanıt gücüne göre)

Türk bireysel yatırımcı 2024'te pay piyasası hacminin ~%61'ini (yurt içi toplam %71) yaptı (TSPB Gösterge Bahar 2025);
bakiyeli yatırımcı 10,5 milyon, yeni sicil alanların en büyük grubu 21–40 yaş erkekler (MKK 2025). Elde tutma süresi
veya gün içi işlem oranı için resmî anket bulunamadı; popülerlik bu yüzden **içerik sıklığı** (haber/eğitim/tarama
şablonu) ve **BIST'e özgü mekaniğe bağlılık** ile derecelendirildi.

| Sıra | Strateji | Popülerlik | Kanıt türü | Hesaplanabilir |
|---|---|---|---|---|
| 1 | `tavan_kovalama` | çok yüksek | günlük haber formatı (Midas, Rota Borsa, Halkarz), SPK başkanı uyarısı, akademik mıknatıs etkisi | evet |
| 2 | `kap_haber_momentum` | çok yüksek | KAP akışı tüm platformlarda anlık; BIST'in "olağandışı hareket" sorgusu | evet |
| 3 | `rsi_asiri_satim` | çok yüksek | Midas "al sinyali veren hisseler" 170+ bölüm; Matriks/İdeal varsayılan gösterge | evet |
| 4 | `bedelsiz_oncesi_alim` | çok yüksek | aracı kurum "bedelsiz potansiyeli" raporları, 4+ olay çalışması | evet |
| 5 | `acilis_ilk_saat_momentum` | çok yüksek | gün içi U şekli belgelenmiş; sabah bültenleri | evet |
| 6 | `akd_kagit_toplama` | çok yüksek | hisse.net/Rota Borsa günlük AKD haberleri | kısmen (vekil) |
| 7 | `halka_arz_tavan_serisi` | çok yüksek | 2023: tüm halka arzlar ilk gün tavan, ~10 günlük seriler | kısmen |
| 8–19 | `tavan_serisi_devam`, `taban_donusu`, `gap_kapatma`, `hacim_patlamasi_kirilim`, `macd_kesisimi`, `ma_kesisimi_golden`, `aof_ustu_kapanis`, `kapanista_al_acilista_sat`, `bilanco_oncesi_alim`, `temettu_yakalama`, `tedbir_bitisi_alim`, `yabanci_takas_artisi` | yüksek | eğitim içeriği + tarama şablonu + kısmi akademik | 10 evet/kısmen, 1 hayır |
| 20–28 | `acilis_araligi_kirilimi`, `zirve_52h_kirilim`, `vwap_geri_cekilme`, `bilanco_sonrasi_surukleme`, `geri_alim_duyurusu`, `endekse_giris`, `goreli_guc_rotasyonu`, `kisa_vadeli_ters_donus`, `son_saat_momentum_devam` | orta | kurumsal/ithal kavramlar, perakende dilinde zayıf | evet (2 kısmen) |
| 29 | `ay_sonu_etkisi` | düşük | akademik anomali; 2010 sonrası kaybolmuş | evet |

Dağılım: çok yüksek 7 · yüksek 12 · orta 9 · düşük 1. Aile: olay 7, momentum 6, ortalamaya dönüş 4, trend 4,
mikro yapı 4, takvim 2, likidite 2. Ufuk: gün içi 6, 1–3 gün 13, 1–4 hafta 10.

## 2. Rejim × aile karar tablosu

Rejim değişkenleri: `xu100_ma200_uzaklik` (trend), `oynaklik_20g` (20 günlük std; medyana göre düşük/yüksek),
saat dilimi, `olay_sayi_1g`/`son_olay_tur` (haber), USDTRY 5 günlük değişim (kur şoku filtresi).

| XU100 trendi | Oynaklık | Saat | Haber | Öne çıkan aile / stratejiler | Kaçınılacaklar |
|---|---|---|---|---|---|
| MA200 üstü, `xu100_getiri_20g` > 0 | düşük | 10:00–11:00 | yok | **momentum**: `acilis_ilk_saat_momentum`, `tavan_kovalama`, `tavan_serisi_devam` | ters dönüş stratejileri (trend sürer) |
| MA200 üstü | düşük | 11:00–16:00 | yok | **trend/mikro yapı**: `acilis_araligi_kirilimi`, `vwap_geri_cekilme`, `hacim_patlamasi_kirilim`, `zirve_52h_kirilim` | `gap_kapatma` (gap'ler sürer) |
| MA200 üstü | düşük | 16:00–18:10 | yok | **mikro yapı**: `son_saat_momentum_devam`, `kapanista_al_acilista_sat`, `aof_ustu_kapanis` | — |
| MA200 üstü | yüksek (düzeltme) | 10:00–11:00 | yok | **ortalamaya dönüş**: `rsi_asiri_satim`, `kisa_vadeli_ters_donus`, `gap_kapatma`, `taban_donusu` | `tavan_kovalama` (gece gap riski) |
| MA200 üstü | herhangi | haber saati | KAP sözleşme/ihale/bedelsiz/geri alım | **olay**: `kap_haber_momentum`, `bedelsiz_oncesi_alim`, `geri_alim_duyurusu`, `bilanco_sonrasi_surukleme` | aynı hissede 20 günde 3+ haber (haber enflasyonu) |
| MA200 altı, `xu100_getiri_20g` < −5 | yüksek | tümü | — | yalnız **olay** (geri alım dalgaları) ve küçük boyutlu `taban_donusu`; çoğu uzun strateji kapalı | momentum, trend, `kapanista_al_acilista_sat` (geceler negatif), `tavan_kovalama` |
| MA200 altı | düşük (dip yatay) | 10:00–12:00 | yok | `akd_kagit_toplama` vekili (yatay + hacim artışı), `rsi_asiri_satim` küçük boyut | kırılım stratejileri (sahte kırılım) |
| herhangi | USDTRY 5g > +3 % (kur şoku) | tümü | — | hiçbiri; `yabanci_takas_artisi` tersine döner | tüm uzun stratejiler 1–2 gün beklemeli |
| herhangi | herhangi | — | VBTS brüt takas/tek fiyat duyurusu | `tedbir_bitisi_alim` (A bacağı: kaçış) — diğer stratejilerin evrensel çıkış filtresi | hissede yeni giriş |
| takvim: Mart–Haziran | — | — | kâr payı KAP | `temettu_yakalama` | — |
| takvim: bilanço haftaları | — | 17:00–18:10 | finansal rapor beklentisi | `bilanco_oncesi_alim` → ertesi gün `bilanco_sonrasi_surukleme` | gün içi momentum (haber bekleniyor, hacim düşük) |

Genel kural: **boğa + düşük oynaklıkta momentum/trend, boğa + yüksek oynaklıkta ortalamaya dönüş, ayıda yalnız olay.**
Akademik literatür endeks düzeyinde ortalamaya dönüş bulup momentum bulamıyor (ODTÜ tezi 2004–2014); bu, momentum
stratejilerinin yalnızca kısa (1–3 gün) ve limit mekaniğine bağlı (tavan) biçimlerinin çalışmasını bekletir.

## 3. BIST mekaniklerinin stratejilere etkisi

- **±%10 fiyat marjı (tavan/taban).** Baz fiyat = önceki günün kapanış fiyatı (2015 BISTECH sonrası; öncesinde AOF).
  Yıldız/Ana/Alt pazarlarda %10 (2020'den beri; önceden pazar grubuna göre %15–20 vardı). Yakın İzleme Pazarı ve
  tek fiyat tedbirli hisselerde günde 5 eşleşme → saatlik stratejiler uygulanamaz, bu hisseler evrenden çıkarılmalı.
  Etkiler: (a) tepki günlere yayılır → "sürüklenme" mekanik olarak üretilir (Bildik & Gülay 2006: gecikmiş fiyat
  keşfi); (b) mıknatıs etkisi (Aktaş vd. 2021) tavan kovalamayı besler; (c) limitte alım/satım kuyruğu → fill varsayımı
  "açılış < tavan ise" olmalı; (d) RSI/MA göstergeleri gecikir; (e) 5 günlük düşüş −%10 kuralı seri tabanlarla kirlenir.
- **Açılış seansı 09:40–09:55 emir toplama, 09:55–10:00 eşleşme; sürekli işlem 10:00–18:00 kesintisiz (öğle arası
  2019'da kalktı); kapanış seansı 18:00–18:10.** 10:00 çubuğunun açılışı tek fiyattır (gap burada oluşur);
  kapanış fiyatı ertesi günün baz fiyatı → "kapanış oyunu" algısı. Kadıoğlu & Küçükkocaoğlu (2015): getiride çift U,
  oynaklıkta L; açılış/kapanış seansları uç getirileri düşürdü. Saatlik çubuk 17 = 17:00–18:00 + kapanış seansı varsayımı
  veri sağlayıcıyla teyit edilmeli.
- **AOF.** Resmî günlük istatistik; terminallerde hissenin yanında durur, perakende "AOF üstü/altı" diye okur.
  Gün içi vekili `vwap_saat` (tipik fiyat × hacim kümülatifi); gün sonunda `aof_1g_sapma` ile kalibre edilebilir.
- **VBTS.** SPK kararıyla, önceden tanımlı kriterlerle otomatik; kademeler: açığa satış + kredili yasağı → brüt takas →
  emir paketi → tek fiyat → internet emir kısıtı; her kademe 1 ay (eskiden 15 gün), KAP'ta seans sonrası duyurulur.
  Brüt takasta aynı gün al-sat netleşmez → gün içi stratejiler fiilen kapanır; tek fiyatta saatlik çubuk yok.
  Bu yüzden `son_olay_tur ∈ {vbts_*}` tüm stratejilerde evrensel dışlama/çıkış filtresi.
- **Açığa satış bireyde fiilen sınırlı.** Şubat 2023 genel yasak; Ocak 2025'ten itibaren yalnız BIST-50; Mart–Ağustos
  2025 yeniden tam yasak; dönem dönem yukarı adım kuralı. Sonuç: kütüphane **yalnız uzun** bacakları test eder; "yukarı
  gap'te sat", "RSI 70 üstü sat", "endeksten çıkarılanı sat" yalnız pozisyon kapatma filtresi olarak kullanılır.
- **Maliyet.** Komisyon kademeli on binde 1–4 (büyük kurumlarda azami on binde 20), üzerine komisyonun %5'i BSMV;
  Midas kampanyalı sıfır komisyon. Fiyat adımı/fiyat oranı (ör. 20–50 TL arası 0,02 → %0,04–0,1) spread tabanını belirler.
  Sayımda tek yönlü maliyet varsayımı: likit BIST-50 hissede ~%0,10 (komisyon + yarım spread), küçük hissede
  ~%0,30–0,50. Gün içi stratejilerin (hedef +%2–3) maliyet sonrası hayatta kalması bu varsayıma çok duyarlıdır;
  her strateji iki maliyet senaryosuyla (0,05 % ve 0,30 %) raporlanmalı.
- **Bedelsiz/temettü düzeltmesi.** Bedelsizde fiyat ve lot ayarlanır; düzeltilmemiş seri sahte tavan/taban, sahte MA
  kesişimi ve bozuk hacim ortalaması üretir. Ex-day'de baz fiyat brüt temettü kadar düşürülür.

## 4. Hesaplanamayanlar ve kısmen hesaplananlar

| Strateji | Durum | Neden / çözüm |
|---|---|---|
| `yabanci_takas_artisi` | hayır | MKK yabancı takas oranı elimizde yok; vekil yok. Sayımdan çıkarılır, rapora "popüler ama ölçülemedi" notu. |
| `akd_kagit_toplama` | kısmen | AKD/takas yok; OHLCV vekili (10 gün yatay fiyat + hacim ortalaması 1,5×) tanımlandı. Vekil "sessiz birikim"i ölçer, kurum kimliğini ölçmez. |
| `bilanco_oncesi_alim` | kısmen | Beklenen bilanço tarihi gerekir: geçen yılın aynı çeyrek KAP tarihi ± 3 gün veya SPK son günü; `bilancodan_gun` negatif değerleri buna göre türetilmeli. |
| `temettu_yakalama` | kısmen | KAP olay tablosunda kâr payı hak kullanım tarihi varsa evet; yalnız "kâr payı kararı" varsa ex-day tahmini gerekir. |
| `endekse_giris` | kısmen | Endeks revizyonları Borsa İstanbul duyurusudur, KAP şirket bildirimi değil; çeyreklik duyuru tarihleri (yılda 4) elle eklenmeli. |
| `tedbir_bitisi_alim` | kısmen | VBTS duyuruları KAP'ta Borsa İstanbul bildirimi olarak var; olay tablosunda `vbts_*` türleri ayrıştırılmış olmalı, bitiş tarihi metinden çıkarılmalı. |
| `halka_arz_tavan_serisi` | kısmen | Evrende 2 yıl içinde halka arz olmuş hisse yoksa örneklem sıfır; varsa ilk 15 gün marj kuralları dönemsel değişti, teyit gerekir. |
| Derinlik (emir defteri) bazlı stratejiler | yok | "Tavanda bekleyen lot", "kademe boşalması" gibi popüler perakende gözlemleri derinlik verisi gerektirir; kütüphaneye alınmadı. |

## 5. Sayım için uygulama notları

1. Evrensel filtreler: `son_olay_tur ∉ {vbts_brut_takas, vbts_tek_fiyat}`, Yakın İzleme Pazarı dışı, saatlik hacim > 0.
2. Fill kuralı: tavanda kilitli çubukta alım yok (`acilis < tavan_fiyat`), tabanda kilitli çubukta satış yok.
3. Her strateji için raporlanacaklar: tetik sayısı/hisse/yıl, ortalama ve medyan getiri (maliyet öncesi/sonrası iki
   senaryo), isabet oranı, rejim kırılımı (MA200 üstü/altı × oynaklık düşük/yüksek), saat kırılımı (gün içi olanlar).
4. Gösterge tanımları: RSI Wilder 14; EMA'lar günlük kapanış; `vwap_saat` tipik fiyatla; `aralik_20g_yuksek` önceki
   20 günün en yükseği; `tavan_kapanis` = `getiri_1g ≥ 0,095` ve `kapanis_gun == yuksek_gun`.

## Başlıca kaynaklar

TSPB Gösterge Bahar 2025 · MKK 2025 Faaliyet Raporu ve aylık bültenler · Bildik & Gülay (2006, JFR) · Aktaş, Kryzanowski
& Zhang (2021, IMEFM) · Danışoğlu (2018, Annals of OR) · Kadıoğlu & Küçükkocaoğlu (2015, BDDK Dergisi) · Inci & Ozenbas
(2017, EMR) · Kadıoğlu, Bostancı & Öcal (2020, temettü) · Balıkesir Üniv. bedelsiz tezi · Boğaziçi endeks etkisi tezi ·
Karakuş vd. (2017), Torun & Karan (2023) geri alım · Tarsus (2024), Alanya (2025) gösterge testleri · ODTÜ momentum/
ortalamaya dönüş tezi · DergiPark EPFAD (2026) VBTS-volatilite · SPK basın duyuruları (2023, 2025) · KAP VBTS bildirimi
976897 · Midas, YatırımX, Rota Borsa, hisse.net, Borsa Atlas, Fintables, QNB Invest eğitim/haber içerikleri.
URL'ler `strateji_kayit.json` içindeki `kaynaklar` alanlarında.
