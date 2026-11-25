# S01 — Cihaz denemesine hazır sürüm

## Amaç

Uygulama derleniyor (Xcode 26.6, hatasız ve uyarısız) ama hiçbir gerçek iPhone'da denenmedi. Bu sprintin amacı proje
sahibinin ilk cihaz denemesini verimli kılmaktır: kod yazandan bağımsız gözlerce okunmuş olsun, bir şey çalışmazsa
nedeni telefonun kendisinden okunabilsin, ekranlar gerçek iOS'ta görülmüş olsun ve deneme adımları yazılı olsun.

## Kapsam

**İçinde**

1. Ses hattı şartnamesi (`docs/ses-hatti.md`) ve `Hat.swift`, `Durum.swift`, `web/app.js` dinleme mantığının uzman
   incelemesi; Engel ve Önemli bulguların kapatılması.
2. **Tanılama** (iPhone uygulaması ve web): cihazda tutulan olay kaydı; Ayarlar'dan açılır, panoya kopyalanır.
3. **Anahtar Zinciri:** Alania anahtarı `UserDefaults` yerine Anahtar Zinciri'nde saklanır; eski değer taşınır.
4. **Erişilebilirlik:** VoiceOver etiketleri, en az 44 pt dokunma alanı, Dinamik Yazı'da kesilmeme.
5. **Simülatör ekran görüntüleri:** Mac iş akışı uygulamayı simülatörde açar, her ekranın görüntüsünü alır.
6. Tasarım şartnamesi (`docs/tasarim.md`); iPhone uygulaması ve web arayüzünün incelemesi.
7. Cihaz testi belgesi (`docs/cihaz-testi.md`).
8. Bağımsız kalite incelemesi ve kabul kriterlerinin kanıtlı doğrulaması.

**Dışında** (bkz. `docs/ROADMAP.md` birikim): çift yönlü konuşma, arka planda dinleme, geçmişi saklama, `.ipa` ya da
TestFlight, yeni diller, web sürümünde çeviri hizmetini değiştirme. Koyu lacivert tema ve ekran düzeni proje sahibinin
tasarımıdır; yeniden tasarlanmaz, tutarlı kılınır.

## Kabul kriterleri

| No  | Kriter                                                                                                                                                                                                                                              | Doğrulama                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| K1  | Mac derlemesi yeşil; derleyici hatası ve uyarısı yok (Debug, iOS Simülatörü).                                                                                                                                                                       | İş akışı kaydı                     |
| K2  | Sekiz simülatör görüntüsü `docs/sprints/S01/shots/` altında: `ceviri-bos`, `ceviri`, `dinliyor`, `kulakliksiz`, `gecmis`, `gecmis-bos`, `ayarlar`, `tanilama`. Hiçbirinde kesilen metin ya da taşma yok.                                            | Görüntüler                         |
| K3  | iPhone Tanılama kaydı aşağıdaki olayları tutar, **konuşma ya da çeviri metni ve cihaz adı tutmaz**, en çok 300 olay saklar; "Kopyala" düz metni panoya koyar, "Temizle" siler.                                                                       | Kod incelemesi, `tanilama` görüntüsü |
| K4  | Web Tanılama kaydı aynı olayları tutar; Ayarlar'da görünür ve kopyalanır; akış testi kayıtta cümle metni olmadığını doğrular.                                                                                                                       | `node tests/web-akis.cjs`          |
| K5  | Alania anahtarı Anahtar Zinciri'ndedir; `UserDefaults`'ta kalmaz; eski kurulumdaki değer ilk okumada taşınır; `Hat.swift` anahtarı yalnız `Anahtarlik` üzerinden okur.                                                                              | Kod incelemesi                     |
| K6  | Her denetimin VoiceOver etiketi vardır (dil şeridi, ana düğme, sekmeler, Temizle, anahtar alanı, ses seçici, Tanılama düğmeleri); seçili sekme ve kulaklık durumu VoiceOver'a doğru okunur; dokunma alanları en az 44 pt ("Temizle" dahil).          | Kod incelemesi, görüntüler         |
| K7  | Ses uzmanı incelemesinde Engel yok; Önemli bulgular kapandı ya da gerekçesiyle birikime yazıldı.                                                                                                                                                    | `reviews/ses-uzmani-*.md`          |
| K8  | Arayüz incelemesinde Engel yok; metin / zemin çiftlerinin karşıtlık oranları hesaplanmış, gövde metni en az 4,5:1.                                                                                                                                  | `reviews/arayuz-denetcisi-*.md`    |
| K9  | Web akış testi yeşil; 320, 360, 390 ve 1280 px genişliklerde yatay taşma yok.                                                                                                                                                                       | `node tests/web-akis.cjs`          |
| K10 | `docs/cihaz-testi.md` iPhone uygulaması ve web için numaralı senaryolar içerir; `docs/ses-hatti.md` içindeki kesinti senaryolarının ve "doğrulanamayanlar" listesinin her biri en az bir senaryoda yer alır.                                         | Belge, çapraz denetim              |
| K11 | Kalite incelemesinde Engel yok; bu tablodaki her satır kanıtıyla işaretlenmiş.                                                                                                                                                                      | `reviews/kalite-sorumlusu-*.md`    |
| K12 | Depo denetimi temiz: `npm run check` (kök dosyalar değiştiği için).                                                                                                                                                                                 | Komut çıktısı                      |

## Tanılama: ne kaydedilir

Amaç: proje sahibi telefonda bir sorunla karşılaşınca kaydı kopyalayıp göndersin, ekip nedenini oradan okusun.

| Olay                  | Ayrıntı (örnek)                                              |
| --------------------- | ------------------------------------------------------------ |
| başlat / durdur       | kaynak dil (`en`), durdurma nedeni (düğme, hata, izin yok)   |
| izin                  | mikrofon: verildi, konuşma tanıma: reddedildi                |
| dil paketi            | hazır / indirildi / hata                                     |
| tanıma açıldı         | `en-US`, cihazda ya da sunucuda                              |
| tanıma bitti          | neden: sessizlik, son sonuç, hata kodu ve açıklaması         |
| cümle                 | kelime sayısı (metin **değil**)                              |
| çeviri                | süre (ms) ya da hata                                         |
| ses                   | Alania (süre ms) / Apple sesi / Alania hatası (HTTP kodu)    |
| ses yolu              | çıkış türü: Bluetooth, kablolu kulaklık, ahize, hoparlör     |
| kesinti               | başladı / bitti, motor yeniden başlatıldı / başlatılamadı    |
| arka plan / ön plan   | uygulama etkin oldu / etkinliğini yitirdi                    |

Kopyalanan metnin başında uygulama sürümü, iOS sürümü ve cihaz modeli (ör. `iPhone17,1`) yer alır; her satır
`SS:DD:SS.mmm  olay  ayrıntı` biçimindedir. Kayıt bellekte tutulur, uygulama kapanınca silinir, hiçbir yere
gönderilmez. Cihazın ya da kulaklığın adı (ör. "Ayşe'nin AirPods'u") yazılmaz; yalnız türü yazılır (ilke 3).

## Sözleşmeler

Swift kodunun tek yazarı `ios-gelistirici`'dir; aşağıdakiler iş akışının ve liderin güvendiği arayüzlerdir.

**Başlatma argümanı (yalnız `DEBUG`):** `-ekran <ad>`. Uygulama bu argümanla açılınca mikrofona, çeviriye ve gerçek ses
yoluna dokunmaz; ekranı örnek verilerle gösterir.

| `<ad>`        | Gösterilen                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------- |
| `ceviri-bos`  | Çeviri sekmesi, hiç çeviri yok, "AirPods Pro bağlı"                                            |
| `ceviri`      | Çeviri sekmesi, üç örnek çeviri, "AirPods Pro bağlı"                                           |
| `dinliyor`    | Çeviri sekmesi, dinleme sürüyor görünümü (CANLI, Durdur), canlı metin "Excuse me, where is the" |
| `kulakliksiz` | Çeviri sekmesi, üç örnek çeviri, kulaklık bağlı değil uyarısı                                  |
| `gecmis`      | Geçmiş sekmesi, üç örnek çeviri                                                                |
| `gecmis-bos`  | Geçmiş sekmesi, boş durum                                                                      |
| `ayarlar`     | Ayarlar sekmesi                                                                                |
| `tanilama`    | Tanılama ekranı, örnek olaylarla                                                               |

**Ekran görüntüsü işi** (`.github/workflows/canli-ceviri-ios.yml`): derlemeden sonra bir iPhone simülatörü açar,
uygulamayı kurar, yukarıdaki her `<ad>` için uygulamayı `-ekran <ad>` ile başlatıp `<ad>.png` alır ve görüntüleri
`canli-ceviri-ekran` dalına yazar (dalın tek içeriği bu görüntüler ve derlemenin commit'ini, Xcode ve simülatör
sürümünü yazan `BILGI.txt`). Derleme adımı ile görüntü adımı ayrı adımlardır; kayıtta hangisinin kırıldığı görünür.

**Anahtar:** `Anahtarlik.alaniaAnahtari` (okunur ve yazılır `String`; yoksa boş). Anahtarı okuyan her yer bunu kullanır.

## İlgili ilkeler

1 (önce AirPods), 3 (gizlilik: Tanılama içerik tutmaz, anahtar Anahtar Zinciri'nde), 5 (sessizce bozulmaz), 6 (tek elle,
VoiceOver), 7 (derlenmeyen kod bitmemiştir), 8 (denenmeyeni denenmiş gösterme).

## Riskler

- **Gerçek cihaz yok.** Mikrofon, tanıma, çeviri ve AirPods ses yolu bu sprintte doğrulanamaz; hepsi cihaz testine
  yazılır (K10).
- **Simülatör işi kırılgan olabilir** (açılış süresi, sürüm farkı). Görüntü adımı kırılırsa derleme sonucu yine okunur.
- **Ses hattında davranış değişikliği** cihazda denenmeden yapılır. Uzmanın "emin değilim" dediği değişiklikler
  yapılmaz; cihaz testine soru olarak yazılır.

## Kararlar (plan kapısı, 25.11.2026)

Girdi: `docs/ses-hatti.md`, `docs/tasarim.md`, `reviews/ses-uzmani-1.md` (3 Engel, 12 Önemli, 12 Öneri),
`reviews/arayuz-denetcisi-1.md` (0 Engel, 12 Önemli, 10 Öneri). **Bir karar şartnameyle çelişiyorsa karar geçerlidir;**
şartnamenin sahibi bir sonraki turda metnini buna göre günceller.

| No   | Karar                                                                                                                                                                                                                                                                                             |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| KR1  | **Ses uzmanı bulguları:** E1–E3 ve Ö-1…Ö-12'nin hepsi bu sprintte kapatılır. Önerilerden Ön-1, 2, 3, 4, 5, 6, 10, 11, 12 yapılır. Ön-7 ve Ön-9 cihaz sorusudur, kod değişmez. Ön-8 (tanıyıcı kullanılabilirliği, şartname T4) birikime yazılır.                                                   |
| KR2  | **Cihazda tanıması olmayan dil (şartname T1'in yerine):** dinleme reddedilmez; proje sahibinin özgün tasarımı sunucu tanımasına izin veriyordu. Bunun yerine ekranda kalıcı sarı not çıkar ("Bu dilde konuşma tanıma Apple'ın sunucusunda yapılır.") ve Tanılama'ya `tanıma açıldı <bölge> sunucuda` yazılır. İlke 3 buna göre güncellendi. |
| KR3  | **Aşama tek kaynaktır (D-0):** `Durum.asama` = duruyor / hazırlanıyor / dinliyor / kesintide(neden). CANLI rozeti ve "Dinliyorum…" yalnız "dinliyor"da görünür; "hazırlanıyor"da "Hazırlanıyor…", "kesintide"de "Duraklatıldı: <neden>". Ana düğme duruyor dışındaki her aşamada "Durdur" yazar.        |
| KR4  | **"Emin değilim" denen davranışlar** (şartname § 7) cihazda denenmeden değiştirilmez; yalnız sessiz başarısızlığı görünür kılan savunma denetimleri eklenir.                                                                                                                                       |
| KR5  | **Arayüz bulguları:** B-1…B-12 kapatılır. Önerilerden B-13, 14, 15, 17, 19, 20 (yalnız `lang`), 21 (kısmen, bkz. KR8) ve 22 yapılır. B-16: iPhone'a "okurken duraklat" eklenmez; web'de açıklaması "yalnız bu web sürümünde" der. B-18 (web'de `rem` ve Dinamik Yazı) birikime yazılır.            |
| KR6  | **Renk belirteçleri (B-6, B-7):** karşıtlık için dört belirteç eklenir, iki sürümde de: `maviDolgu` `#2b72e5` ve `kirmiziDolgu` `#de3530` (beyaz yazılı dolgular), `maviMetin` `#4a8ff7` (mavi metin ve simge), `acikKirmizi` `#ff7a73` (hata metni). Fark gözle neredeyse seçilmez; tema değişmez. Demo notunda proje sahibine bildirilir. |
| KR7  | **Dinlerken dil şeridi (B-9):** duruyor dışındaki aşamalarda şerit tek satıra iner (alt yazı kalkar, yükseklik 56); başlık tek satırda kalır. Amaç, çevirinin küçük ekranda görünür kalmasıdır.                                                                                                    |
| KR8  | **"Şu An" başlığı değişmez** (proje sahibinin metni). B-21'in geri kalanı yapılır: hata satırının başında uyarı simgesi, bölüm başlıklarında büyük harf biçemle (`textCase`), ayraç opaklığı iki sürümde 0,14.                                                                                     |
| KR9  | **Geçmiş (B-13):** "Temizle" onay ister ("Geçmiş silinsin mi?" — "Geçmişi sil" / "Vazgeç"); listenin altında "Geçmiş uygulama kapanınca silinir." yazar.                                                                                                                                          |
| KR10 | **Alania:** iki sürümde toplam bekleme 5 sn; Durdur uçuştaki isteği iptal eder; art arda 3 hatadan sonra o oturum boyunca cihazın sesi kullanılır; yedeğe düşüş ekranda notla söylenir ve Tanılama'ya HTTP koduyla yazılır.                                                                        |
| KR11 | **iPhone işi iki adımda yapılır, her adımdan sonra Mac derlemesi:** (A) mantık katmanı: `Hat.swift`, `Durum.swift`, `Sabitler.swift`, yeni `Tanilama.swift` ve `Anahtarlik.swift`; arayüzün bugün kullandığı adlar bozulmaz. (B) arayüz: `Arayuz/`, `CeviriApp.swift`, `-ekran` başlatma argümanı, Tanılama ekranı, erişilebilirlik, iş akışındaki ekran görüntüsü adımı. |
| KR12 | **Tanılama ekranı** `docs/tasarim.md` § 4.4'e, VoiceOver etiketleri § 5.2 tablosuna, duyurular § 5.3'e göre yapılır.                                                                                                                                                                              |

## Kararlar (son düzeltme turu, 25.11.2026)

Girdi: `reviews/ses-uzmani-3.md` (0 Engel, 3 Önemli, 6 Öneri), `reviews/arayuz-denetcisi-2.md` (1 Engel, 7 Önemli,
4 Öneri), `reviews/kalite-sorumlusu-1.md` (0 Engel, 5 Önemli, 13 Öneri). Bu, sprintin üçüncü ve son düzeltme turudur.

| No   | Karar                                                                                                                                                                                                                                                                                             |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| KR13 | **Bu turda kapananlar.** Engel: C-1 (web Tanılama sayfasının kayması; ilk iş). Önemli: Z-1, Z-2, Z-9, C-2…C-8, Q-1…Q-5 (Q-5 liderin: README).                                                                                                                                                   |
| KR14 | **Yapılan öneriler** (tek satırlık ya da ilk cihaz denemesini doğrudan iyileştirenler): Z-3, Z-4, Z-5 (= C-9c, Q-7) ve C-9a metni, C-10'un yalnız VoiceOver etiketi, C-11, C-12, Q-14, Q-15, Q-8'in yalnız "değer değişmediyse yazma" koruması. **Birikime yazılanlar:** Z-6, Z-7, Z-8, C-9b, C-10'un simgesi, Q-6, Q-9, Q-10, Q-12, Q-16, Q-17, Q-18. |
| KR15 | **Web'de hazırlık (Z-9, Q-11):** "dinliyor"a geçişi yalnız `audiostart` ya da ilk sonuç yapar; `start` yalnız Tanılama'ya yazılır. 5 sn içinde ikisi de gelmezse aşama **değişmez**; satır "Mikrofon bekleniyor. İzin istendiyse izin verin." olur ve Tanılama'ya uyarı yazılır. Safari'nin hangi olayı ne zaman verdiği cihazda görülecek (D34). |
| KR16 | **Sürüm etiketi (Q-3):** iki sürümde aynı etiket, her düzeltme turunda artar; bu tur **`S01 tur 4`**. Web'de `SURUM`, iPhone'da `Sabitler.swift` → `yapiEtiketi`; ikisi de Tanılama kopyasının başlığında yazar. Web testi etiketi bekler.                                                          |
| KR17 | **Metinler:** (a) Ayarlar dipnotuna, iki sürümde: "Anahtar girerseniz çeviri metni seslendirmek için Alania'ya gönderilir; söylenen asıl cümle gönderilmez." (b) 10 sn notu: "Dinleme kendiliğinden sürmezse Durdur'a, sonra Başlat'a dokunun." (c) Okunmayan çeviri notu: "Kesintide gelen çeviri sesli okunmadı."; kesintiden sonraki ilk okumada kalkar. (d) Z-2: "Görüşme sürerken dinleme sürdürülemez. Görüşme bitince Başlat'a dokunun." (e) Q-4: "Çeviri durdu. Dinlemeyi yeniden başlatın." |
| KR18 | **Dinamik Yazı (C-2, C-3, C-4):** `docs/tasarim.md` § 4.1.1 tablosu uygulanır: çeviri metni sınırsız ölçeklenir; başlık, dil şeridi, ana düğme ve sekme çubuğu sınırlanır; hata, sarı notlar ve kulaklık satırı her boyutta altta sabit blokta kalır.                                           |
| KR19 | **Mac iş akışı (Q-1, Q-14, C-11):** derleyici uyarısı işi kırar; Debug'a ek olarak Release de derlenir; simülatörün açılış kaydı kısaltılır (kayıt sonu okunabilsin). Görüntüler: sekiz ekran + `ceviri-buyuk-yazi` (AX5), `ceviri-buyuk-yazi-ax3`, `gecmis-buyuk-yazi`, `ayarlar-buyuk-yazi`, `tanilama-buyuk-yazi`. |
| KR20 | **Bütçe aşıldı:** sprint 12 alt görev sınırını son düzeltme turu ve kapanış doğrulamasıyla 14'e çıkarıyor. Neden: iPhone işi iki adıma bölündü (KR11) ve ses hattı üç tur incelendi. Demo notunda proje sahibine bildirilir.                                                                    |
