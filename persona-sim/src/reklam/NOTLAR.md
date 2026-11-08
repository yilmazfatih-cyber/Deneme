# Reklam ve kalibrasyon modülleri — notlar

## Core'da eksik görülenler (core değiştirilmedi)

1. **`Rng.poisson` yok.** `src/reklam/kampanya.ts` içinde Knuth yöntemiyle `poisson()` yazıldı; core'a taşınması önerilir.
2. **`Reklam.kanal` tepkiye etki etmiyor.** `reklamTepkisi` kanalı okumaz; e-posta ile video aynı fark etme/tıklama üretir.
   Kanal başına belirginlik veya tolerans çarpanı (ör. e-posta: düşük fark etme, yüksek tıklama) core'da tanımlanmalı.
3. **Rahatsızlık fark etmeden bağımsız.** `reklamTepkisi.rahatsizlik` fark etme koşulu içermez; burada yalnız fark edilen
   gösterimde çekiliyor (varsayım). Ayrıca fark edilen gösterim başına ≈ %15–20 rahatsızlık, 3–4 gösterimde segment payını
   %15–25'e çıkarıyor; rapor eşikleri (`RAHATSIZLIK_DUSUK` 0,20, `RAHATSIZLIK_KACIN` 0,35) buna göre seçildi, kalibre edilmeli.
4. **`niyetArtisi` beklenen değerdir** (fark etme olasılığını zaten içerir); tıklama niyete ek katkı yapmaz. Tıklayan ile
   tıklamayan arasında niyet farkı isteniyorsa core'da `tiklamaNiyetArtisi` gibi bir alan gerekir.
5. **`OlayTuru` içinde `pos_transaction` yok** (ADR-004 "olay günlüğüne `pos_transaction` olarak alınır" diyor). POS kayıtları
   şimdilik günlüğe yazılmıyor, doğrudan `kaynakBUydur`'a giriyor.
6. **Olay zamanı:** reklam olayları `t = 0` ile yazılıyor (kampanya ortama girişten önce). Çok günlü kampanya için core'da
   gün/oturum alanı gerekir.
7. **`MusteriGirdisi` maruz/kontrol ayrımını yalnız `reklamKaynagi` dizgisiyle taşıyor** (`'kontrol:'+ad`). Ayrı bir
   `grup: 'maruz' | 'kontrol' | 'organik'` alanı daha güvenli olur.

## Varsayımlar

- **Karşılaştırma niyet-tedavidir (ITT).** Kontrol/maruz ataması bütçeden önce yapılır; bütçe bittiği için hiç gösterim
  almayan maruz grup üyeleri de "maruz" grupta sayılır (yansız ama lift'i seyreltir). `kampanyaUygula().maruzKalan`
  en az bir gösterim alan sayıdır; `HedeflemeSatiri.maruzKalan` maruz grup büyüklüğüdür.
- Bütçenin belirli segmentlere yığılmaması için gösterim sırası karıştırılır.
- Rahatsız olan müşterinin niyeti × 0,4 (`RAHATSIZ_NIYET_CARPANI`); kişi başı gösterim tavanı 30.
- Lift GA: Agresti–Caffo düzeltmeli normal yaklaşım. Grup başına n < 30 veya toplam dönüşüm < 5 ya da GA sıfırı kapsıyorsa
  `ayirt_edilemiyor`. Segmentler arası çoklu karşılaştırma düzeltmesi yok (rapor metninde yazıyor).
- Öneri sırası: rahatsızlık > eşik → `kacin`; lift GA tamamen < 0 → `kacin`; lift ≤ 0 → `hedefleme`;
  GA alt > 0 ve rahatsızlık ≤ düşük eşik → `hedefle`; diğer → `dene`.
- `ORNEK_KAMPANYALAR` bütçeleri ~2.000 kişilik demo nüfusuna ölçeklidir (gerçek TL bütçesi değildir).
- Kalibrasyon: A değerleri sabit kabul edilir (07 §10.1'deki A öngörü varyansı v_A yok) → GA'lar yalnız B'nin örnekleme
  belirsizliğini taşır, A ile B arası fark olduğundan kesin görünebilir. ROPE = A'nın ±%10'u. B'de n < 50 ise anlamlılık
  her zaman `belirsiz` ve `uyarilar` "yerel iddia yok" der. Ziyaret sıklığı se'si 1 aylık Poisson varsayımıyla (temkinli).
- `farkRaporu` `donusum` satırı üretmez: POS verisi dönüşüm gözlemez (07 §4.4).
- Kampanya etkisi gözlemseldir (kampanya günleri rastgele değil); `uyarilar` bunu söyler.

## `public/ornek/pos.csv` nasıl üretildi

`ornekPosCsv(new Rng(11), 600, ['M01','M02','M03','M04'])`. `tsc --module commonjs` ile `src/core/rng.ts` ve
`src/kalibrasyon/pos.ts` geçici klasöre derlenip `node -e` ile yazıldı. `tests/kalibrasyon.test.ts` dosyanın bu çağrıyla
birebir aynı olduğunu doğrular (değişirse test kırılır).
