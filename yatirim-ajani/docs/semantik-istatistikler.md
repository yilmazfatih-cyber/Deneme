# Futboldaki gibi gözlem istatistikleri: BIST'te "tehlikeli atak", "isabetli şut", "xG" (Kasım 2026)

> Yatırım tavsiyesi değildir. Test kodu: [`semantik_istatistik_testi.py`](semantik_istatistik_testi.py).
> Veri: `ajan-ciktilari` dalı, 74 hisse, Ocak 2024 → Ekim 2026. Evren bugünkü hisselerdir (hayatta kalma yanlılığı).

## Futbolda nasıl hesaplanıyor?

"Tehlikeli atak", "büyük fırsat" ya da "xG" ham sayım değildir. Dört katmanı vardır:

1. **Olay:** pas, şut, top kaybı. Veri şirketleri her olayı yeri ve zamanıyla kaydeder.
2. **Bağlam:** sahanın neresi, rakip baskısı, vücudun hangi bölgesi, atağın hızı.
3. **Etiket:** kurala göre ("top hücum üçte birinde ve takımda" = tehlikeli atak) ya da analist yargısıyla
   ("oyuncunun gol atması beklenirdi" = büyük fırsat).
4. **Olasılık modeli:** geçmişteki çok sayıda benzer olaydan "bu tür şut ne sıklıkla gole döner" tahmini (xG).
   Sonra gerçekleşen ile beklenen karşılaştırılır (gol − xG = bitiricilik).

Borsada aynı yöntem uygulanabilir: olay = günlük ya da saatlik hareket veya KAP bildirimi; bağlam = hacim, kapanışın
gün içi aralıktaki yeri, kritik seviyeye yakınlık, piyasa rejimi; etiket = açık kural ya da dil modeli; olasılık
modeli = benzer olaylardan sonra endekse göre fazla getiri ("xR", beklenen getiri).

## Futbol → BIST karşılıkları

| Futbol | BIST karşılığı | Nasıl hesaplanır | Ajanda veri var mı? |
| --- | --- | --- | --- |
| Topla oynama | Alıcı hakimiyeti | Kapanış ağırlıklı ortalama fiyatın (AOF) üstünde ve gün içi aralığın üst kısmında; 20 günlük oranı. Daha iyisi: alıcının başlattığı işlem hacmi / toplam hacim (işlem bazında veri gerekir) | Var (OHLC + AOF) |
| Tehlikeli atak | Kritik seviyeye hacimli giriş | 52 haftalık zirveye %3 yakın + log hacim z ≥ 2 + kapanış aralığın üst çeyreğinde + günü endeksin üstünde kapattı | Var |
| İsabetli şut / direkten dönen | Kırılım tuttu mu? | Tehlikeli ataktan 5 gün sonra endeksi geçti mi (isabet) ya da zirvenin altına geri düştü mü | Var |
| Büyük fırsat ve xG | Katalizör ve beklenen getiri (xR) | KAP olayı (ihale/sözleşme tutarı ÷ piyasa değeri, bedelsiz, geri alım, bilanço sürprizi, endeks girişi) + benzer olayların geçmişteki ortalama fazla getirisi (lojistik model ya da karar ağacı) | Kısmen (bilgi veritabanında olay türleri; KAP metni dil modeliyle etiketlenebilir) |
| Bitiricilik (gol − xG) | Tepki farkı | Gerçekleşen fazla getiri − xR. Eksik tepki fırsat adayı, aşırı tepki geri dönüş adayı | xR modeli kurulunca |
| Pres, top kazanma | Emme (absorption) | Hacim z ≥ 2 ama fiyat ≤ 0,3 ATR oynadı ve kapanış üstte: biri satışları topluyor | Var |
| Kontra atak | Panik sonrası alıcı dönüşü | Panik gününün ertesi günü yükseliş + üst çeyrekte kapanış | Var |
| Sarı / kırmızı kart | Borsa ve SPK tedbirleri | Volatilite bazlı tedbirler: açığa satış ve kredili işlem yasağı (sarı), brüt takas ve tek fiyat (kırmızı) | Yok (Borsa İstanbul günlük duyuruları toplanmalı) |
| Kendi kalesine gol | Seyreltme ve içeriden satış | Bedelli sermaye artırımı, ortak satışı, dönüştürülebilir tahvil | Kısmen (KAP) |
| Tribün baskısı | İlgi ve akış | Sosyal medya bahsi, aracı kurum dağılımında tek kurum yoğunluğu, TEFAS fon akışı (Tera dersi) | Yok |
| Oyuncu reytingi | Hisse günlük karnesi | Etiketlerin ağırlıklı bileşimi; ağırlıklar ileri getirilerden öğrenilir (aşırı uyuma dikkat) | Yapılabilir |

Projenin bilgi veritabanındaki `yatirimci_tepkisi` alanı (panik_satisi, fomo_alimi, kademeli_birikim,
haber_sonrasi_duzeltme…) zaten bu türden anlamsal etiketlerdir. Bugün elle ya da dil modeliyle yazılıyorlar; aşağıdaki
kurallar bunları veriden otomatik üretebilir.

## Bizim verimizde sonuç (günlük, 74 hisse, Ocak 2024 → Ekim 2026)

Bağlam ölçüleri: kapanış konumu CLV = ((kapanış − en düşük) − (en yüksek − kapanış)) / (en yüksek − en düşük);
hacim olağandışılığı = log hacmin önceki 20 güne göre z-skoru; ATR = son 20 günün ortalama (en yüksek − en düşük) /
kapanış. Aynı hissede aynı etiket 5 işlem günü içinde bir kez sayıldı. "İsabet" = 5 günde endeksi geçme oranı;
tabanda (bütün günler) bu oran %47.

| Etiket | Olay | Ayrı gün | İsabet | Ort. fazla getiri 5g | t (gün kümeli) | Ort. fazla getiri 20g |
| --- | --- | --- | --- | --- | --- | --- |
| Tehlikeli atak | 168 | 126 | %46 | +%0,61 | 1,1 | +%0,29 |
| Kontra atak | 4 | 4 | %100 | +%3,28 | 2,4 | +%11,03 |
| Panik satışı (dibe yakın kapanış) | 30 | 19 | %37 | −%2,74 | −2,8 | −%1,68 |
| Pres (emme) | 49 | 40 | %43 | +%0,67 | 1,0 | +%1,60 |
| FOMO (≥ +%7, hacim z ≥ 3) | 134 | 108 | %43 | +%0,36 | 1,0 | +%0,75 |
| Topla oynama (günlük) | 11.073 | 680 | %47 | +%0,01 | −1,2 | +%0,31 |

Topla oynama yüzdesinin (20 gün) bir sonraki 20 günle aylık kesit ilişkisi: bilgi katsayısı +0,025, t 0,9 (32 ay).

**Okuma:**

1. **Görünür kalıplar büyük hisselerde kenar vermiyor.** Tehlikeli atak, pres, FOMO ve topla oynama tabandan ayrışmadı.
   Projenin strateji haritası da aynı şeyi söylüyor: herkesin gördüğü teknik kalıp maliyet sonrası para kazandırmıyor.
2. **Tek işaret veren: panik satışı.** Dibe yakın kapanan, hacimli sert düşüş günlerinden sonra hisse 5 günde endeksin
   ortalama %2,7 altında kaldı (t −2,8, gün kümeli). Ama yalnız 30 olay ve 19 gün var; olaylar birkaç şok gününde
   toplanıyor (19–20 Mart 2025, 2–3 Eylül 2025, Eylül 2026 fon krizi). Altı etiket denendiği için bu sonuç şansla da
   çıkabilir. Kanıt değil, izlenecek aday: "panik dibinden hemen alma" kuralını destekliyor.
3. **Kontra atak çok nadir** (4 olay); yorum yapılamaz.
4. **Futboldan farkı:** Bir maçtaki xG, rakibin bir sonraki maçtaki davranışını değiştirmez. Borsada ise herkesin
   bildiği bir kalıp kısa sürede fiyatlanır; kalabalığın kovaladığı "tehlikeli atak" başkasının çıkış kapısı olabilir
   (Tera dersi). Bu yüzden asıl değer, herkesin görmediği verideki etiketlerde: KAP metni, fon akışı ve sahiplik,
   tedbir listeleri, aracı kurum dağılımı.

## Sonraki adımlar

1. **Kart verisi:** Borsa İstanbul'un günlük tedbir duyurularını toplayıp her hisse için "sarı/kırmızı kart" sayısı.
2. **xR modeli:** KAP bildirimlerini dil modeliyle etiketle (tür, tutar ÷ piyasa değeri, yön), benzer olayların geçmiş
   fazla getirisinden beklenen tepkiyi tahmin et; gerçekleşen − beklenen farkını izle.
3. **Otomatik tepki etiketi:** Bu dosyadaki kurallarla bilgi veritabanındaki `yatirimci_tepkisi` alanını veriden doldur.
4. **Tribün:** TEFAS fon akışı ve sahiplik (kırılganlık bekçisi S3 ile aynı veri).
