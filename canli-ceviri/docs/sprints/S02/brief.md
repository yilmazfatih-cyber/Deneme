# S02 — İkinci motor: bulut hattı (Soniox)

## Amaç

Proje sahibi 25.11.2026'da karar verdi: uygulamaya, var olan ücretsiz cihaz içi hattın **yanına**, ikinci bir motor
eklenir. İkinci motorda tanıma ve çeviri tek akışta Soniox'tan gelir; çeviri cümle bitmeden kelime kelime akar.
Amaç, proje sahibinin iki motoru aynı telefonda, aynı konuşmalarla karşılaştırabilmesidir.

Cihaz içi hat (Apple Speech + Translation) varsayılan olarak kalır ve davranışı değişmez. S01'in insan kapısı
(gerçek cihaz denemesi) henüz yapılmadı; bu sprint ona paralel yürür ve onun sonuçlarını beklemez.

## Kapsam

**İçinde**

1. **Motor seçimi** (iPhone): Ayarlar'da "Cihazda (Apple)" / "Bulut (Soniox)". Varsayılan cihaz. Bulut yalnız Soniox
   anahtarı girilmişse seçilebilir. Anahtar Anahtar Zinciri'nde saklanır.
2. **Bulut hattı** (iPhone): mikrofon sesi Soniox'un canlı tanıma WebSocket'ine akar; tek yönlü çeviri (seçili kaynak
   dil → Türkçe); canlı asıl metin ve akan Türkçe çeviri ekranda; cümle bitince çeviri var olan seslendirme sırasıyla
   (Alania ya da Apple sesi) okunur.
3. **Sessizce bozulmama:** geçersiz anahtar, internet yok, bağlantı koptu, bakiye bitti, süre sınırı: her biri ekranda
   Türkçe ve ne yapılacağını söyleyen bir açıklamayla. Cihaz motoruna **sessiz geçiş yok**.
4. **Gizlilik bildirimi:** bulut motorunda sesin Soniox'a gittiği Ayarlar'da ve Çeviri ekranında söylenir. Anayasanın
   3. ilkesi buna göre güncellendi (üçüncü istisna).
5. **Tanılama:** bulut hattının olayları (bağlantı, akışın başlaması, gecikmeler, hata türü, akış süresi); içerik ve
   anahtar yazılmaz.
6. **Saf mantık testi:** Soniox yanıtlarını cümlelere ayıran çözücü yalnız `Foundation` kullanır ve Mac koşucusunda
   `swiftc` ile derlenip çalıştırılan bir test betiğiyle sınanır (iPhone tarafındaki ilk otomatik test).
7. Şartnameler (`docs/ses-hatti.md`, `docs/tasarim.md`), cihaz testi belgesi (karşılaştırma senaryoları), README, PLAN.
8. Mümkünse **canlı protokol doğrulaması:** proje sahibi anahtar sağlarsa bu oturumdan gerçek Soniox akışı bir kez
   gözlenir (kamuya açık bir ses örneğiyle) ve gözlenen yanıtlar çözücü testine örnek olur. Sağlamazsa bu madde
   "cihazda görülecek" diye raporlanır (ilke 8).

**Dışında** (birikime): çift yönlü konuşma; Soniox'un kendi sesi (TTS); cümle bitmeden okumaya başlama; anahtarı
saklayan aktarıcı sunucu ve geçici anahtarlar (uygulama başkalarına dağıtılırsa gerekir); web deneme sürümünde bulut
motoru; bağlantı koptuğunda akışı kaldığı yerden sürdürme (`enable_reconnect`); terim sözlüğü arayüzü.

## Kabul kriterleri

| No  | Kriter                                                                                                                                                                                                                         | Doğrulama                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| K1  | Mac derlemesi yeşil: Debug ve Release, hata 0, uyarı 0.                                                                                                                                                                        | İş akışı                                |
| K2  | Çözücü testi Mac koşucusunda çalışır ve geçer; en az şu durumları kapsar: asıl ve çeviri belirteçlerinin ayrılması, kesin olmayan belirteçlerin yenilenmesi, `<end>` ile cümle kapanışı, çevirinin `<end>`'den sonra gelmesi, boş cümle, hata yanıtı, `finished` yanıtı, bozuk JSON. | İş akışı kaydı                          |
| K3  | Varsayılan motor cihazdır. Bulut yalnız anahtar girilmişse seçilir; anahtar silinince seçim cihaza döner. Yeni simülatör görüntüleri: `ayarlar-bulut`, `ceviri-bulut`.                                                          | Kod incelemesi, görüntüler              |
| K4  | Protokol belgeye uygundur: uç nokta, anahtarın `Authorization` başlığında gönderilmesi (başlangıç iletisinde `api_key` yok), başlangıç iletisinin alanları, boş metin çerçevesiyle bitirme, `ping` ile bağlantı denetimi, hataların `error_type`'a göre ayrılması. | `reviews/ses-uzmani-*.md`; varsa canlı deneme |
| K5  | Bulut motorunda sesin Soniox'a gittiği Ayarlar'da ve dinlerken Çeviri ekranında yazar. Tanılama'da konuşma ya da çeviri metni, anahtar ve cihaz adı yoktur. Anahtar yalnız Anahtar Zinciri'ndedir ve yalnız Soniox'a gider.       | Kod incelemesi (her `kaydet` çağrısı)   |
| K6  | Şu durumların her birinde dinleme durur ya da "Duraklatıldı" olur ve ekran nedenini söyler: geçersiz anahtar, internet yok, bağlantı koptu (pong gelmedi), bakiye ya da kota bitti, 300 dakikalık akış sınırı. Ekran hiçbir durumda bağlantı yokken "Dinliyorum" demez. | Kod incelemesi, çözücü testi            |
| K7  | Arama ya da arka plan kesintisinde bulut akışı kapatılır (ücret akış süresine göre işler); dönüşte yeni akış açılır. Durdur akışı boş metin çerçevesiyle bitirir.                                                               | Kod incelemesi                          |
| K8  | Cihaz motorunun davranışı değişmez: S01'in simülatör görüntüleri aynı kalır; cihaz hattındaki değişiklik motor ayrımıyla sınırlıdır.                                                                                            | Görüntü karşılaştırması, kod incelemesi |
| K9  | Uzman incelemelerinde Engel yok; Önemli bulgular kapandı.                                                                                                                                                                      | `reviews/`                              |
| K10 | `docs/cihaz-testi.md` bulut motoru için senaryolar içerir: anahtarın girilmesi, ilk deneme, iki motorun aynı cümlelerle karşılaştırılması (doğruluk ve gecikme), hata durumları, Soniox hesabında harcamanın görülmesi.           | Belge                                   |
| K11 | README ve PLAN iki motoru, maliyeti ve gizlilik farkını anlatır.                                                                                                                                                                | Belge                                   |
| K12 | Depo denetimi temiz: `npm run check`.                                                                                                                                                                                          | Komut çıktısı                           |

## Soniox protokolü (belgelerden; 25.11.2026'da okundu)

Belgeler `https://docs.soniox.com/<yol>.mdx` adresinden düz metin olarak okunabilir (bu ortamda erişim açık). Aşağıdaki
özet ekibin ortak dayanağıdır; bir alan adı ya da davranıştan emin olunamıyorsa belge yeniden okunur, tahmin edilmez.

| Konu                 | Bilgi                                                                                                                                                                                                             | Belge                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Uç nokta             | `wss://stt-rt.soniox.com/transcribe-websocket`                                                                                                                                                                    | `api-reference/stt/websocket-api`              |
| Kimlik               | Bağlantı isteğinde `Authorization: Bearer <anahtar>`. Başlangıç iletisindeki `api_key` kullanımdan kalkıyor (15.01.2027'de reddedilecek); **kullanılmaz**. Kimlik hatası el sıkışmayı bozmaz: bağlantı açılır, hata çerçevesi gelir, sunucu kapatır. | `authentication/websocket-authentication`      |
| Başlangıç iletisi    | İlk metin çerçevesi, JSON: `model` (`stt-rt-v6`), `audio_format` (`pcm_s16le`), `sample_rate` (16000), `num_channels` (1), `language_hints` (ör. `["en"]`), `enable_endpoint_detection` (true), `translation` (`{"type":"one_way","target_language":"tr"}`). İsteğe bağlı: `max_endpoint_delay_ms` (500–3000, varsayılan 2000), `endpoint_latency_adjustment_level` (0–3), `idle_timeout_ms` (3000–20000). | `api-reference/stt/websocket-api`              |
| Ses                  | İkili çerçeveler. Bir iletide en çok 2.097.144 bayt. Bir akış en çok 300 dakika.                                                                                                                                   | aynı                                           |
| Yanıt                | `{"tokens":[…], "final_audio_proc_ms", "total_audio_proc_ms"}`. Belirteç: `text`, `is_final`, `translation_status` (`none` / `original` / `translation`), `language`, `source_language`, `start_ms`, `end_ms`, `confidence`. Çeviri belirteçlerinde zaman damgası yoktur. Asıl ve çeviri belirteçleri birebir eşleşmez. | `translation/stt-translation`                  |
| Cümle sonu           | `enable_endpoint_detection` açıkken sunucu konuşmanın bittiğine karar verince önceki belirteçleri kesinleştirir ve özel `<end>` belirtecini gönderir (her zaman kesin).                                            | `stt/rt/endpoint-detection`                    |
| Bağlantı denetimi    | `{"type":"ping","id":N}` → `{"type":"pong","id":N}`. Başlangıç iletisinden sonra gönderilen ping, akış başlayınca yanıtlanır. Öneri: 5 saniyede bir ping; pong bu sürede gelmezse bağlantı kopmuş sayılır. Her ileti boşta kalma süresini (varsayılan 20 sn) sıfırlar; süre dolarsa `408 request_timeout`. | `stt/rt/connection-keepalive`                  |
| Bitirme              | Boş **metin** çerçevesi (boş dizge). Sunucu son yanıtları ve `{"finished":true}` yanıtını gönderip bağlantıyı kapatır.                                                                                              | `api-reference/stt/websocket-api`              |
| Hata                 | `{"error_code", "error_type", "error_message", "request_id"}`, ardından sunucu kapatır. Kod `error_type`'a göre dallanır (ör. `unauthenticated`, `request_timeout`, `service_unavailable`, `max_duration_reached`); tam liste `api-reference/errors`. | `stt/rt/error-handling`, `api-reference/errors` |
| Ücret                | Akışın **tüm süresi** ücretlenir (ses gönderilmese de). Canlı tanıma saati yaklaşık 0,12 $; çeviriyle yaklaşık 0,18 $ (çeviri çıkış belirteci olarak sayılır).                                                     | `soniox.com/pricing`                           |
| Veri                 | Canlı akışta ses ve yazı saklanmaz; modeller bu veriyle eğitilmez; kayıtlarda içerik yoktur (Soniox'un beyanı).                                                                                                    | `security-and-privacy`                         |
| Diller               | 60 dil; yedi kaynak dilimizin ve Türkçenin hepsi var.                                                                                                                                                              | `stt/concepts/supported-languages`             |

**Belgede yazmayan, bu sprintte öğrenilmesi gerekenler:** bir cümlenin çeviri belirteçlerinin `<end>`'den önce mi sonra mı
tamamlandığı; `<end>` belirtecinin `translation_status` değeri; çeviri belirteçlerinin kesinleşme sırası. Çözücü bu
sıraya dayanmamalı; ses uzmanı Soniox'un örnek uygulamalarını (GitHub `soniox/soniox_examples`, konuşmadan konuşmaya
çeviri örneği) okuyup şartnameye yazar, canlı deneme yapılabilirse gözlemle doğrulanır.

## Sözleşmeler

Swift kodunun tek yazarı `ios-gelistirici`'dir; aşağıdakiler iş akışının, incelemecilerin ve liderin güvendiği adlardır.

- **Ayar:** `Kayit.motor` (`UserDefaults`; değerler `"cihaz"`, `"bulut"`; yoksa `"cihaz"`).
- **Anahtar:** `Anahtarlik.sonioxAnahtari` (okunur ve yazılır `String`; yoksa boş), Alania anahtarıyla aynı kurallar.
- **Çözücü:** `CanliCeviri/Bulut/SonioxCozucu.swift`. Yalnız `Foundation` içe aktarır; arayüz, ses ve ağ türü kullanmaz.
  Girdi: sunucudan gelen bir metin çerçevesi (`String`). Çıktı: ekranın ve hattın kullanacağı olaylar (canlı asıl metin,
  akan çeviri, kapanan cümle = asıl + çeviri, akış bitti, hata türü). Bu dosya tek başına derlenebilmelidir.
- **Çözücü testi:** `canli-ceviri/tests/ios/cozucu-testi.swift` (sahibi `ios-gelistirici`; `tests/` altındaki bu klasör
  ona aittir). Mac iş akışında derleme adımından **önce** bir adım: `swiftc` ile çözücü + test derlenir ve çalıştırılır;
  başarısızlık işi kırar. XCTest ve simülatör gerektirmez.
- **Başlatma argümanı (yalnız `DEBUG`):** `-ekran ayarlar-bulut` (Ayarlar; anahtar girilmiş, motor bulut) ve
  `-ekran ceviri-bulut` (Çeviri; bulut motoruyla dinliyor, canlı asıl metin ve akan çeviri görünür). Var olan sekiz ad
  ve görüntüleri değişmez.
- **Tanılama olayları (bulut):** `başlat  dil=<kod> motor=bulut`, `bulut  bağlanıyor`, `bulut  akış başladı <ms> ms`,
  `bulut  ilk sonuç <ms> ms`, `cümle  kelime=<n>`, `çeviri  bulut <ms> ms`, `bulut  hata <error_code> <error_type>`,
  `bulut  koptu`, `bulut  kapandı süre=<sn> sn`. Kesin biçimi ses uzmanı şartnamede sabitler.

## İlgili ilkeler

1 (önce AirPods: ses yolu iki motorda aynı), 2 (mikrofon her zaman iPhone'unki), 3 (gizlilik: üçüncü istisna ve
bildirimi), 4 (gecikme: bulut motorunun varlık nedeni), 5 (sessizce bozulmaz: bağlantı yokken "Dinliyorum" yazmaz),
7 (derlenmeyen kod bitmemiştir), 8 (denenmeyeni denenmiş gösterme: gerçek Soniox akışı görülmediyse öyle yazılır).

## Riskler

- **Gerçek akış görülmeden yazılan çözücü.** Belge belirteç sırasını tam söylemiyor. Azaltma: çözücü sıraya dayanmaz;
  saf mantık testi; mümkünse canlı deneme; cihaz testinde Tanılama.
- **Ücret:** akış açık kaldıkça işler. Azaltma: Durdur, arama ve arka planda akış kapatılır; Tanılama akış süresini yazar.
- **Anahtarın telefonda durması.** Soniox uzun ömürlü anahtarın istemciye konmamasını öneriyor. Bu uygulama mağazada
  dağıtılmıyor; anahtarı telefonun sahibi kendisi giriyor ve Anahtar Zinciri'nde duruyor. Dağıtım olursa aktarıcı
  sunucu gerekir (birikim).
- **Ortak ses hattına dokunmak.** Mikrofon bağlantısı iki motora hizmet edecek; cihaz hattı henüz cihazda denenmedi.
  Azaltma: K8; cihaz hattının kodu yalnız motor ayrımı kadar değişir.
- **Veri kullanımı:** 16 kHz tek kanal 16 bit ses saatte yaklaşık 115 MB eder; Ayarlar'daki açıklamada yazılır.

## Kararlar (sprint başı, 25.11.2026)

| No  | Karar                                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| KR1 | **Sessiz geçiş yok.** Bulut motoru çalışamıyorsa dinleme durur ve ekran ne yapılacağını söyler ("…Ayarlar'dan cihaz motoruna geçebilirsiniz."); motor kendiliğinden değişmez.                                                       |
| KR2 | **Okuma cümle sonunda.** Çeviri ekranda akar, ama seslendirme `<end>` ile kapanan cümlenin tamamını okur. Türkçede fiil sonda olduğu için yarım cümle okutulmaz. Cümle bitmeden okuma birikimdedir.                                 |
| KR3 | **Ses biçimi:** 16 kHz, tek kanal, 16 bit (`pcm_s16le`); yaklaşık 100 ms'lik parçalar. Cihazın kendi biçimi dönüştürülür (saatte ~690 MB yerine ~115 MB).                                                                            |
| KR4 | **İzin:** bulut motorunda yalnız mikrofon izni istenir; konuşma tanıma izni ve dil paketi gerekmez.                                                                                                                                |
| KR5 | **Kopmada:** pong 5 saniyede gelmezse aşama "Duraklatıldı: bulut bağlantısı koptu" olur, yeni akış en çok iki kez denenir; olmazsa dinleme Türkçe hatayla durur. Kopma sırasında söylenenler kaybolur ve bu ekranda söylenir.         |
| KR6 | **Web sürümü bu sprintte değişmez.** Bulut motoru yalnız iPhone uygulamasındadır.                                                                                                                                                   |
| KR7 | **Bütçe:** en fazla 12 alt görev; web işi olmadığı için S01'deki aşım yinelenmemelidir.                                                                                                                                             |
