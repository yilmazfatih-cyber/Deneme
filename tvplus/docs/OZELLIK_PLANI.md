# TV+ özellik planı

Kasım 2026. Kaynak: ürün sahibinin geri bildirimi ve üç ekranın (web, mobil, TV) arayüz denetimi.
"Bugün" sütunları depoda çalışan şeyi, "Sıradaki" sütunları henüz yapılmamış önerileri anlatır.

## 1. Bu turda yapılanlar

| Konu              | Ne değişti                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Top 10 satırları  | Adlar ve görseller görünmüyordu. Yeni kart: büyük rakam + tam görünen yatay görsel + altında ad (web, mobil, TV).                     |
| Kart önizlemesi   | Detay penceresi kapanınca imleç kıpırdamadan açılıyordu; artık yalnız gerçek fare hareketiyle ya da klavyeyle gidince açılır.         |
| Kumanda: TV'de Aç | TV boştayken telefon bir başlatıcıdır: kaldığın içerik ya da canlı kanal tek dokunuşla TV'de açılır.                                  |
| Mac'te açılmama   | Aynı klasördeki `Guards.tsx` / `guards.ts` adları büyük/küçük harf ayırmayan dosya sisteminde çakışıyordu; düzeltildi, testi eklendi. |
| Sunucusuz yayın   | Sunucu tarayıcının içinde çalışır; uygulama GitHub Pages'te `/tvplus/` altında açılır.                                                |

## 2. Denetimde görülen, henüz düzeltilmemiş alanlar

| #   | Alan                       | Sorun                                                                                               | Öneri                                                                                           |
| --- | -------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | Mobil satırlardaki afişler | Görseller yatay olduğu için dikey afiş "bileşik" üretiliyor: görsel üstte küçük, ad görsele gömülü. | Gerçek içerikte dikey afiş varsa onu kullan; yoksa mobil satırlarda da yatay kart + altında ad. |
| 2   | Mobil vitrin kartı         | Uzun adlarda afişe gömülü yıl ile etiket satırı üst üste biniyor.                                   | Vitrinde yatay görsel + arayüzün yazdığı ad; afişe gömülü yazıyı bırak.                         |
| 3   | İlk açılış                 | Tahmin modeli hazır olana dek (≈20 sn) kişisel satırlar ve eşleşme yüzdesi yok.                     | Eğitilmiş modeli derlemeye göm; ilk açılışta hazır gelsin.                                      |
| 4   | iPhone'da oynatma          | Parçalı akış iOS 17.1 altında yok; o cihazlar YouTube gömmesine düşer. Gerçek cihazda sınanmadı.    | Gerçek cihaz sınaması; HLS çıkışı.                                                              |

## 3. Arama altyapısı

**Bugün:** çevrimiçi öğrenen sıralama modeli (metin, beğeni, popülerlik, tıklanma, yenilik, devam), yazarken tamamlama,
yazım düzeltme, "… ile ilgili" ve "Bunlar ilgini çekebilir" tahmin bölümleri, tıklama geri bildirimi, canlı yayın sonuçları.

| Sıra | Öneri                         | Ne kazandırır                                                                              | Dayandığı altyapı                                  |
| ---- | ----------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| 1    | Anlamsal arama                | "uzayda geçen duygusal film" gibi ad içermeyen sorgular sonuç verir.                       | Başlık vektörleri var; sorgu için metin kodlayıcı. |
| 2    | Niyet çözümleme               | Kişi, tür, ruh hali, süre, "bu akşam" ayrıştırılır; sorgu alt türlere ve rehbere bağlanır. | Etiket sözlüğü, alt türler, yayın akışı.           |
| 3    | Sonuçsuz aramayı kurtarma     | Boş sayfa yerine en yakın alt tür ve "bunu arayanlar şunu izledi".                         | Alt tür benzerliği, izleme verisi.                 |
| 4    | Arama içgörüleri (Stüdyo)     | Aranıp bulunamayanlar katalog boşluğu olarak planlayıcıya girer.                           | Olay deposu, planlayıcı.                           |
| 5    | Türkçe'ye özgü eşleme         | Ek çözümleme, ı/i/İ, eksik yazım; TV'de telefon mikrofonuyla sesli arama.                  | Kumandanın yazı gönderme yolu.                     |
| 6    | Kişisel sıralama ve ölçüm     | Sıralama zevk topluluğuna göre değişir; çevrimdışı NDCG ve araya serpiştirme deneyi.       | Zevk toplulukları, geri bildirim kaydı.            |
| 7    | Canlı yayın ve rehberde arama | "maç", "haber" şu an ve yakında yayınlananları getirir; sonuçtan hatırlatma kurulur.       | Rehber, hatırlatmalar.                             |

## 4. Alt tür altyapısı

**Bugün:** 16 ölçek, 8 yüz ve 141 değerlik sözlük; etiket fişleri ve uzlaşı; alt tür üreticisi; görünen ve görünmeyen
katman; alt türe dayalı benzerlik ve satırlar.

| Sıra | Öneri                       | Ne kazandırır                                                                                |
| ---- | --------------------------- | -------------------------------------------------------------------------------------------- |
| 1    | Model destekli etiketleme   | Çekim vektörlerinden ölçek tahmini fiş taslağı olur; etiketleyici onaylar, hız artar.        |
| 2    | Etiketleyici iş akışı       | Kuyruk, iki etiketleyici uyumu ölçümü, anlaşmazlıkta hakem; kılavuz güncellemesi sürümlenir. |
| 3    | Alt tür kalite puanı        | Aynı alt türdeki başlıkların birlikte izlenme oranı; tutarsız alt türler görünmeyene alınır. |
| 4    | Profil başına satır seçimi  | Hangi alt tür satırının gösterileceğini deneyerek öğrenen seçici (bandit).                   |
| 5    | Ad ve zaman bağlamı         | Satır adlarının A/B denemesi; akşam, hafta sonu, bayram gibi bağlama göre satırlar.          |
| 6    | Topluluk × alt tür haritası | Hangi topluluk hangi alt türü izliyor; planlayıcıya ve satın almaya girdi.                   |

## 5. Öneriler

**Bugün:** örtük geri bildirimli çarpanlara ayırma + içerik kulesi + sıralayıcı; eşleşme yüzdesi; soğuk başlangıç;
"Sana özel" satırı; zevk toplulukları. Ölçümler sentetik örnek üzerindedir.

| Sıra | Öneri                  | Ne kazandırır                                                                    |
| ---- | ---------------------- | -------------------------------------------------------------------------------- |
| 1    | Gerçek veriyle eğitim  | Mixpanel verisi bağlanınca aynı hat gerçek sonuç verir; önce bu yapılmalı.       |
| 2    | Sayfa düzeyi sıralama  | Yalnız satır içi değil satırların sırası da kişiye göre; ilk ekran değeri artar. |
| 3    | Açıklama               | "Çünkü … izledin", "… topluluğunda popüler": öneriye güven.                      |
| 4    | İlk açılış zevk seçici | Yeni profilde üç beş başlık seçtirilir; soğuk başlangıç kısalır.                 |
| 5    | Çeşitlilik ve tazelik  | Aynı türün üst üste gelmesini ve bayat öneriyi sınırlayan kısıtlar.              |
| 6    | Görsel kişiselleştirme | Aynı başlık için kişiye göre farklı görsel.                                      |
| 7    | Deney altyapısı        | Çevrimiçi A/B; model sürümlerini karşılaştırma.                                  |
| 8    | Bağlam                 | Cihaz ve saat: akşam TV'de uzun, öğle telefonda kısa içerik.                     |

## 6. TV izleme deneyimi

**Bugün:** QR ile giriş, kumandayla gezinme (odak motoru), TV oynatıcısı, canlı TV ve rehber, ekran klavyesi.

| Sıra | Öneri                         | Ne kazandırır                                                  |
| ---- | ----------------------------- | -------------------------------------------------------------- |
| 1    | Jeneriği atla, sıradaki bölüm | Dizi izlemede kesintisiz akış; bölüm sonunda geri sayım.       |
| 2    | Canlıda mini rehber           | Yayından çıkmadan kanal ve program değiştirme.                 |
| 3    | Hızlı ses ve altyazı menüsü   | Oynatmayı durdurmadan tek tuşla.                               |
| 4    | İzlerken telefonda bilgi      | Oyuncu, sahne, müzik bilgisi telefonda; TV ekranı temiz kalır. |
| 5    | Hatırlatma → telefon → TV     | Yayın başlarken telefona bildirim; dokununca TV'de açılır.     |
| 6    | Birlikte izle                 | Ayrı evlerde eşzamanlı oynatma.                                |
| 7    | Bekleme ekranı                | TV boştayken öneri ve devam et görselleri.                     |

## 7. Telefon ↔ TV

**Bugün:** TV'de QR ile giriş; kumanda (dokunmatik ped, yön tuşları, yazı gönderme, sarma, ses, altyazı, rakamlar);
film ve canlı yayını TV'ye yansıtma; "Bu Cihazda Devam Et"; kumandada "TV'de Aç".

| Sıra | Öneri                         | Ne kazandırır                                                                                  |
| ---- | ----------------------------- | ---------------------------------------------------------------------------------------------- |
| 1    | Gerçek cihazlarda sınama      | iPhone, Android ve gerçek TV tarayıcılarında doğrulama; bugüne dek yalnız masaüstü Chromium.   |
| 2    | Sıraya ekle                   | Telefondan TV'nin oynatma sırasına başlık ekleme.                                              |
| 3    | Kilit ekranı denetimleri      | Telefon kilitliyken oynat/duraklat ve sarma.                                                   |
| 4    | Sesli komut                   | Telefon mikrofonundan "TRT Haber'i aç".                                                        |
| 5    | Chromecast ve AirPlay köprüsü | TV+ uygulaması olmayan ekranlara yansıtma.                                                     |
| 6    | Sunucusuz sitede aktarıcı     | GitHub Pages sürümünde gerçek telefon ile gerçek TV'nin eşleşebilmesi için küçük bir aktarıcı. |

## 8. Öncelik önerisi

| Ne zaman | İş                                                                                                                    |
| -------- | --------------------------------------------------------------------------------------------------------------------- |
| Şimdi    | Gerçek veriyle eğitim (§5.1), gerçek cihaz sınaması (§7.1), mobil afişler (§2.1), eğitilmiş modeli göm (§2.3).        |
| Sıradaki | Anlamsal arama ve niyet çözümleme (§3.1–2), jeneriği atla ve sıradaki bölüm (§6.1), model destekli etiketleme (§4.1). |
| Sonra    | Sayfa düzeyi sıralama, deney altyapısı, birlikte izle, Chromecast/AirPlay köprüsü.                                    |
