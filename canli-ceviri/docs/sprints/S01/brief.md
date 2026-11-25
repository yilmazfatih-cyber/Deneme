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

## Kararlar (plan kapısından sonra lider doldurur)

_Henüz karar yok._
