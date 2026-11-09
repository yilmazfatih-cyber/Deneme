# BIST faktör, anomali ve formül literatürü: kısa özet

*Yatırım tavsiyesi değildir. Ayrıntılar, formüller ve kaynaklar `bist_formuller.json` dosyasında (40 madde).*

**Yöntem notu:** Bulgular web aramalarında görülen özetlere ve künyelere dayanır. Bu oturumda tam metinler açılamadı (dergipark, ideas.repec ve benzeri alan adları ağ izninde yoktu). Bu yüzden rakamlar özet düzeyindedir ve kullanmadan önce asıl makalelerle doğrulanmalıdır.

**Kanıt dağılımı:** 2 güçlü, 15 orta, 20 zayıf, 3 yok.

## BIST'te en güçlü görünenler

1. **Amihud illikidite primi.** Kanıt güçlü. Atılgan, Demirtaş ve Günaydın (2016, *Applied Economics*) en illikit beşte birlik dilimde yıllık %7,2–19,2 risk ayarlı fazla getiri buldu. Sonuç beta, büyüklük, DD/PD ve momentum kontrollerinden sonra da korunuyor. Prim küçük ve oynak hisselerde toplanıyor, bu yüzden işlem maliyeti onu büyük ölçüde yiyebilir.
2. **PEAD (kâr açıklaması sonrası sürüklenme).** Kanıt güçlü. Ahlatcıoğlu ve Okay (2021, *Borsa Istanbul Review*) 60 günde %2,9 kümülatif anormal getiri farkı buldu. Bu fark çok faktörlü modellerle açıklanmıyor. Ramazan'da yapılan açıklamalarda sürüklenme %16–25 daha zayıf.
3. **MAX etkisi (negatif yön).** Kanıt orta. Alkan ve Güner (2018, *JIFMIM*) yüksek MAX'lı "piyango" hisselerinin daha düşük getiri verdiğini gösterdi. Etki bireysel yatırımcı yoğunluğuyla ve açığa satış kısıtıyla artıyor. En pratik kullanım, bu hisseleri dışlayan bir filtre.
4. **Ters dönüş (contrarian), momentum değil.** Kanıt orta. 1 aylık ters dönüş piyasa durumuna bağlı olarak öngörülebiliyor (Demirer ve diğ. 2017). 1–5 yıllık contrarian strateji de kârlı bulunmuş (Alper ve Aydoğan 2017; Ünal 2021). BIST'te geçmişte kazananlar sonra kaybetme eğiliminde.
5. **Değer (PD/DD ve F/K).** Kanıt orta ama çelişkili. Sektör içi düşük çarpanlı portföyler BIST 100'ü geçmiş (Yalçın 2024). Buna karşılık bazı Fama-MacBeth testleri değer primini anlamsız buluyor.
6. **Olay çalışmaları.** Kanıt orta, etkiler kısa vadeli. Temettü artışında pozitif tepki var, azalışta negatif. Pay geri alımında pozitif tepki var, küçük firmalarda daha belirgin. Bedelsiz sermaye artırımında önce aşırı tepki, sonra düzeltme görülüyor. Endeksten çıkarılmada anlamlı negatif getiri var. Endekse dahil olmanın etkisi ise zayıf.
7. **IVOL, ABD'nin tersine pozitif.** Kanıt orta. İki *Borsa Istanbul Review* makalesi (Çam ve diğ. 2024; Akarsu 2023) bu yönde. ABD'deki IVOL bulmacası BIST'e aktarılmamalı.

## Maliyet sonrası ölen veya zayıf kalanlar

- **Teknik kurallar (hareketli ortalama, RSI, MACD).** 223 kurallık İMKB testinde kuralların çoğu maliyet hariç kârlı görünüyor. Maliyetler eklenince yalnızca "göz ardı edilebilir" bir fazla getiri kalıyor. Birkaç çalışmada al-tut stratejisi en iyi sonucu veriyor. Bu kurallar en fazla endeks düzeyinde rejim filtresi olarak kullanılabilir.
- **Momentum (12-1 ve 6-1).** Bulgular çelişkili ve yakın tarihli literatür "geçerli değil" diyor. 52 haftalık zirve primi anlamsız.
- **Takvim etkileri.** Bunlar haftanın günü, Ocak, Ramazan/bayram ve tatil öncesi etkileri. Zamanla zayıflamışlar ve yönleri dönemden döneme değişiyor. Günlük işlem maliyeti etkinin büyüklüğünü aşıyor. Ay dönümü etkisi görece daha tutarlı ama yalnız endeks düzeyinde. Ramazan'da ortalama getiri değişmiyor, oynaklık düşüyor.
- **Makro değişkenler (USD/TRY, CDS, VIX, petrol).** Güçlü eşzamanlı ilişkiler var ama öngörü gücü kanıtlanmamış. TÜFE sürprizinin BIST'te sistematik bir etkisi bulunamamış. TCMB faiz artırımları banka hisselerinde asimetrik negatif tepki yaratıyor.
- **Büyüklük primi.** Bulgular çelişkili. Görülen prim büyük olasılıkla likidite primiyle iç içe.

## Veri olmadığı için uygulanamayan veya kısmen uygulanabilenler

Bu değerlendirme ücretsiz fiyat-hacim verisi ile İş Yatırım'ın F/K, PD/DD, FD/FAVÖK ve piyasa değeri verisine göre yapıldı.

- **Uygulanamaz:**
  - Hisse bazında yabancı takas değişimi: MKK hisse verisi gerekiyor.
  - Brüt kârlılık: mali tablo kalemleri gerekiyor.
- **Kısmen uygulanabilir (ek veri gerekiyor):**
  - KAP olay tarihleri: PEAD-SUE, temettü, bedelsiz ve geri alım için.
  - Temettü geçmişi.
  - Alış-satış kotasyonu: Corwin-Schultz vekili hesaplanabilir.
  - Türkiye CDS, VIX, Brent ve DXY serileri.
  - PPK ve TÜFE beklenti anketleri.
  - TCMB haftalık yabancı akımı.
  - Endeks kuralları için resmi halka açıklık oranı.
  - Holding NAD'ı için iştirak pay oranları ve holding solo net borcu. NAD'ın yalnızca listeli kısmı İş Yatırım piyasa değerleriyle yaklaşık hesaplanabilir.
- **BIST kanıtı hiç yok ama hemen test edilebilir:** Gece ve gün içi getiri ayrışması. Ücretsiz açılış ve kapanış verisi yeterli ve BIST'e özgü bir test bulunamadı.

## Uygulama önerisi (kanıt sırasına göre)

1. Evren filtresi: minimum TL hacim ve halka açık piyasa değeri eşiği koy, yüksek MAX'lı hisseleri dışla.
2. Ana sinyaller: sektör içi değer (PD/DD ve E/P), orta düzey illikidite eğimi, EAR tabanlı PEAD ve piyasa durumuna bağlı kısa vadeli ters dönüş.
3. Fiyat serilerini mutlaka bedelsiz ve temettüye göre düzelt.
4. Enflasyon muhasebesi (TMS 29) dönem kırılmasını hesaba kat.
5. Komisyon, kayma ve BSMV dahil net getiriyle test et.
