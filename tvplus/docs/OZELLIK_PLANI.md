# TV+ özellik planı

Kasım 2026. Kaynak: ürün sahibinin geri bildirimi ve üç ekranın (web, mobil, TV) arayüz denetimi.
"Bugün" sütunları depoda çalışan şeyi, "Sıradaki" sütunları henüz yapılmamış önerileri anlatır.

## 1. Bu turda yapılanlar

| Konu                | Ne değişti                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Top 10 satırları    | Adlar ve görseller görünmüyordu. Yeni kart: büyük rakam + tam görünen yatay görsel + altında ad (web, mobil, TV).                     |
| Kart önizlemesi     | Detay penceresi kapanınca imleç kıpırdamadan açılıyordu; artık yalnız gerçek fare hareketiyle ya da klavyeyle gidince açılır.         |
| Kumanda: TV'de Aç   | TV boştayken telefon bir başlatıcıdır: kaldığın içerik ya da canlı kanal tek dokunuşla TV'de açılır.                                  |
| Mac'te açılmama     | Aynı klasördeki `Guards.tsx` / `guards.ts` adları büyük/küçük harf ayırmayan dosya sisteminde çakışıyordu; düzeltildi, testi eklendi. |
| Sunucusuz yayın     | Sunucu tarayıcının içinde çalışır; uygulama GitHub Pages'te `/tvplus/` altında açılır.                                                |
| Mobil kurgu         | Alt çubuk: Ana Sayfa · Kısa Videolar · Ara · TV+'ım. Ana sayfanın başında seçim: Dizi ve Film ya da Canlı TV.                         |
| Kısa Videolar       | Dikey, ekran ekran kayan önizleme akışı; önizleme sessiz başlar, bitince sıradakine geçer. Masaüstü menüsünde de var.                 |
| Yeni ve Popüler     | Mobilde bölüm çipleriyle akış: Çok Yakında, Herkes Bunları İzliyor, Top 10 listeleri (01, 02 …), Yeni Gelenler; kartta önizleme.      |
| Çok Yakında         | Canlı TV'nin sıradaki yayınları; karttan "Bana Hatırlat". Web'de satırların altında, mobilde akışın başında.                          |
| Topluluk işareti    | "Bugün dizilerde 1 numara", "Top 10'da 4. sırada", eşleşme yüzdesi; profilin topluluğu varsa "Senin Topluluğun" bölümü.               |
| Kategoriler         | Gruplu liste: hızlı erişim, sana özel alt türler, tüm alt türler (yeni dizin sorgusu), türler.                                        |
| Yönetici kipi       | Yönetici Paneli, Stüdyo ve Kaputun altı yalnız yönetici kodunu giren cihazda görünür; sunucu uçları da yöneticiye açıktır.            |
| Yönetici Paneli     | Hangi segmenttesin, sistem nasıl karar verdi, sıradaki adaylar; ana sayfadaki satırların dayanağı; alt tür ve model durumu.           |
| Afiş seçimi         | Başlık başına birden çok görsel adayı; arka uç profile göre seçer, gösterim ve tıklamadan öğrenir; panel seçimi ve nedenini gösterir. |
| Niyet anlayan arama | "kısa düşündürücü bilim kurgu" gibi ad içermeyen sorgular; arama nasıl anladığını kaldırılabilir çiplerle gösterir.                   |

## 2. Denetimde görülen, henüz düzeltilmemiş alanlar

| #   | Alan                       | Sorun                                                                                               | Öneri                                                                                           |
| --- | -------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | Mobil satırlardaki afişler | Görseller yatay olduğu için dikey afiş "bileşik" üretiliyor: görsel üstte küçük, ad görsele gömülü. | Gerçek içerikte dikey afiş varsa onu kullan; yoksa mobil satırlarda da yatay kart + altında ad. |
| 2   | İlk açılış                 | Tahmin modeli hazır olana dek (≈20 sn) kişisel satırlar ve eşleşme yüzdesi yok.                     | Eğitilmiş modeli derlemeye göm; ilk açılışta hazır gelsin.                                      |
| 3   | iPhone'da oynatma          | Parçalı akış iOS 17.1 altında yok; o cihazlar YouTube gömmesine düşer. Gerçek cihazda sınanmadı.    | Gerçek cihaz sınaması; HLS çıkışı.                                                              |

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

## 8. Segmentleme ve görünürlük

**Bugün:** izleyiciler ne izlediklerine göre zevk topluluklarına ayrılır (özellik uzayı + k-ortalama); profil kendi
izleme geçmişinden en yakın topluluğa yerleşir. Yönetici Paneli bu kararı açıklar: benzerlik, özellik ve başlık
katkıları, sıradaki adaylar. Topluluklar şimdilik örnek veriyle hesaplanır.

| Sıra | Öneri                       | Ne kazandırır                                                                                   |
| ---- | --------------------------- | ----------------------------------------------------------------------------------------------- |
| 1    | Gerçek veriyle topluluklar  | Mixpanel verisi bağlanınca segmentler gerçek izleyiciyi anlatır; panel aynı kalır.              |
| 2    | Segment geçmişi             | Profilin segmenti zaman içinde nasıl değişti; hangi izleme kararı değiştirdi.                   |
| 3    | "Ya şunu izleseydim?"       | Panelde başlık ekleyip çıkararak segmentin ve önerilerin nasıl değişeceğini görmek.             |
| 4    | Segmente göre sayfa düzeni  | Satırların sırası ve vitrin başlığı segmente göre; her segmentin kendi ilk ekranı.              |
| 5    | Segment × arama             | Aynı sorguda segmentin tıklama eğilimi sıralamaya girer; sonuçsuz aramada segmentin sevdikleri. |
| 6    | Segment sağlık göstergeleri | Kararsız izleyici oranı (sıradaki adaya yakın), segmentler arası geçiş, siluetin seyri.         |
| 7    | İzleyiciye açık gerekçe     | "Neden bunu görüyorum?": sayısız, sade bir açıklama; güven artar.                               |
| 8    | Hesap ve rol tabanlı yetki  | Tek kod yerine yönetici hesabı; kim neyi gördü kaydı.                                           |

## 9. Netflix'in önüne geçmek için

Netflix'in üstünlüğü veri ölçeği ve içerik bütçesidir; orada yarışılmaz. Önüne geçilebilecek yer, izleyiciye **denetim
ve açıklık** vermek ile **canlı TV ile isteğe bağlı içeriği tek deneyimde** birleştirmektir.

| Sıra | Öneri                          | Netflix'te durum                       | TV+'ta ne olur                                                                                    |
| ---- | ------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1    | Niyet anlayan arama (yapıldı)  | Ad, kişi ve tür sözcüğüyle arama       | Ne izlemek istediğini anlatırsın; arama nasıl anladığını gösterir, koşulu çipten atarsın.         |
| 2    | Ruh hali direksiyonu           | Yok; sayfa yalnız geçmişe göre kurulur | Ana sayfada "Hafif · Heyecanlı · Düşündürücü · Ailece · Kısa": satırlar anında yeniden sıralanır. |
| 3    | "Neden bunu görüyorum?"        | Yalnız "… izlediğin için" satır adı    | Her başlıkta sade gerekçe; "bunu daha az göster" ile anında geri bildirim.                        |
| 4    | Canlı + isteğe bağlı tek arama | Canlı yayın rehberi yok                | "Bu akşam maç", "şimdi haber": yayın akışı, hatırlatma ve katalog aynı sonuçta.                   |
| 5    | Karar yardımcısı               | "Bir Şeyler Oynat" kaldırıldı          | "Karar veremiyorum": gerekçeli üç öneri, kaydırarak seç; 20 dakikan varsa ona göre.               |
| 6    | Birlikte karar                 | Yok                                    | Evde iki profilin ortak zevkine göre "ikimize de uyanlar" satırı.                                 |
| 7    | Telefon ikinci ekran           | Sınırlı                                | TV oynarken telefonda oyuncu, sahne, müzik; hatırlatmadan tek dokunuşla TV'de aç.                 |
| 8    | Afiş seçimi (yapıldı)          | Var                                    | Aynı altyapı; farkı yönetici panelinde seçimin gerekçesinin görünmesi.                            |

Dürüst sınır: öneri ve arama kalitesinin Netflix'i geçtiği ancak gerçek izleme verisiyle ölçülerek söylenebilir. Bugün
modeller örnek veriyle eğitiliyor; ilk iş gerçek veriyi bağlamak ve çevrimiçi deneyle ölçmektir (§5.1, §5.7).

## 10. TV+ içeriğini bu uygulamaya getirmek

Uygulama içeriği koddan ayrı tutar (`content/`); katalog değişince kod değişmez. YouTube kaynaklı örnek içerik yerine
TV+ kataloğu şu üç parçayla gelir:

| Parça           | Ne gerekir                                                                   | Uygulamada karşılığı                                       |
| --------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Katalog bilgisi | Resmî dışa aktarım ya da API: ad, özet, tür, oyuncu, yaş sınırı, süre, sezon | `content/titles/*.json` (şema: `shared/content-schema.ts`) |
| Görseller       | Başlık başına afişler ve yatay görseller, kullanım izniyle                   | `artwork.storyArt`, `artwork.boxart`, `artwork.alternates` |
| Video           | Yayın akışı adresleri ve DRM lisans sunucusu, ya da yalnız fragmanlar        | `sources` (DASH); DRM bağlantısı henüz yok                 |

- Katalog bilgisi ve görseller için bir dönüştürücü yazmak küçük iştir; biçimi (CSV, JSON, API) görmek yeter.
- Afiş seçimi gerçek anlamını burada kazanır: başlık başına birkaç resmî afiş gelirse (oyuncu ağırlıklı, tür ağırlıklı)
  seçim "hangi kare" yerine "hangi vurgu" olur.
- Video için üç yol var: (a) yalnız fragman, (b) "TV+'ta izle" bağlantısı, (c) gerçek yayın. (c) için oynatıcıya
  Widevine / FairPlay lisans akışı eklenmelidir; bugünkü oynatıcı açık içerik ve YouTube gömmesi oynatır.
- Yapılmayacak olan: TV+'ın sitesinden ya da uygulamasından içerik ve görsel kopyalamak, DRM'li yayını izinsiz
  oynatmak. İçerik yetkili bir kaynaktan gelmelidir.

## 11. Öncelik önerisi

| Ne zaman | İş                                                                                                                    |
| -------- | --------------------------------------------------------------------------------------------------------------------- |
| Şimdi    | Gerçek veriyle eğitim (§5.1), gerçek cihaz sınaması (§7.1), mobil afişler (§2.1), eğitilmiş modeli göm (§2.2).        |
| Sıradaki | Anlamsal arama ve niyet çözümleme (§3.1–2), jeneriği atla ve sıradaki bölüm (§6.1), model destekli etiketleme (§4.1). |
| Sonra    | Sayfa düzeyi sıralama, deney altyapısı, birlikte izle, Chromecast/AirPlay köprüsü.                                    |
