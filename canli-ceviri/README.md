# Canlı Çeviri (iOS)

Karşınızdaki kişinin konuşmasını iPhone mikrofonuyla dinler, cümle cümle Türkçeye çevirir ve çeviriyi AirPods'tan okur.

```
iPhone mikrofonu → konuşma tanıma (Apple) → çeviri (Apple, cihazda) → Türkçe ses (Alania-2 ya da Apple) → AirPods
```

Konuşma tanıma ve çeviri Apple'ın kendi çatılarıyla yapılır; dil paketi bir kez indirildikten sonra internet gerekmez.
Alania-2 sesi isteğe bağlıdır; anahtar yoksa ya da Alania'ya ulaşılamazsa Apple'ın Türkçe sesi okur.

> **Durum:** Uygulama GitHub'ın Mac makinelerinde derleniyor ve ekranları iOS simülatöründe görülüyor
> (`docs/sprints/S01/shots/`). **Gerçek iPhone ve AirPods ile henüz denenmedi.** Mikrofon, konuşma tanıma, çeviri ve
> ses yolu yalnız gerçek cihazda doğrulanabilir; deneme adımları `docs/cihaz-testi.md` içindedir.

## Web deneme sürümü (kurulumsuz)

iPhone uygulaması Xcode ile yüklenir; ondan önce akışı telefonda denemek için `web/` klasöründe tarayıcıda çalışan bir
deneme sürümü var. GitHub Pages iş akışı bu klasörü `/canli-ceviri/` altında yayınlar:

**Adres:** https://yilmazfatih-cyber.github.io/Deneme/canli-ceviri/

iPhone'da **Safari** ile açın, AirPods'u takın, **Dinlemeyi Başlat**'a dokunup mikrofon iznini verin. Arayüz ve
1,2 saniyelik cümle sonu kuralı uygulamayla aynıdır; farklar:

|                | iPhone uygulaması             | Web deneme sürümü                                               |
| -------------- | ----------------------------- | --------------------------------------------------------------- |
| Konuşma tanıma | Cihazda (Apple Speech)        | Tarayıcının hizmeti (Safari'de Apple'ın dikte altyapısı)        |
| Çeviri         | Cihazda (Apple Translation)   | İnternet üzerinden [MyMemory](https://mymemory.translated.net/) |
| Mikrofon       | Her zaman iPhone'unki         | Tarayıcı seçer (AirPods takılıyken çoğunlukla AirPods'unki)     |
| Türkçe ses     | Alania-2 ya da Apple sesi     | Alania-2 ya da cihazın Türkçe sesi                              |
| İnternet       | Dil paketi indikten sonra yok | Gerekli                                                         |

- Söylenen cümleler çevrilmek üzere MyMemory hizmetine gider; ücretsiz kullanım günde yaklaşık 5.000 karakterle sınırlıdır.
- Konuşma tanıma Chrome'da ve ana ekrana eklenmiş hâlde çalışmayabilir; Safari'nin kendisinde açın. iPhone'da
  **Ayarlar → Genel → Klavye → Dikteyi Etkinleştir** açık olmalıdır.
- Kulaklıksız denerken **Ayarlar → Çeviri okunurken dinlemeyi duraklat**'ı açın; yoksa uygulama kendi sesini duyabilir.
- Köprü daha önce aynı telefonda açıldıysa adres ilk seferde Köprü'yü gösterebilir; sayfayı bir kez yenileyin.

Test (gerçek mikrofon, internet ve ses gerekmez; sahte tanıma ve sahte çeviri hizmetiyle tüm akışı dener):

```bash
node canli-ceviri/tests/web-akis.cjs
```

## Ekranlar

| Ekran    | İçerik                                                                                                         |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| Çeviri   | Kaynak dil (7 dil → Türkçe), o an söylenen cümle, son çeviri, önceki 3 çeviri, AirPods durumu, Başlat / Durdur |
| Geçmiş   | Bu oturumdaki tüm çeviriler saatleriyle, en yenisi üstte; onaylı Temizle. Uygulama kapanınca silinir           |
| Ayarlar  | Alania-2 API anahtarı, ses (kadın / erkek), kısa "nasıl çalışır", Tanılama kaydı                               |
| Tanılama | Ayarlar'dan açılır: telefonda tutulan olay kaydı, Kopyala ve Temizle                                           |

Çeviri ekranı o anki aşamayı tek satırda söyler: **Hazırlanıyor…** (dil paketi ve izinler), **Dinliyorum…** (mikrofon
açık; sağ üstte CANLI rozeti), **Duraklatıldı: …** (arama, arka plan, ses yolu değişimi ya da mikrofondan ses gelmemesi).
Sarı notlar dinlemeyi durdurmayan durumları bildirir: kulaklık bağlı değil, Alania yerine Apple sesi okudu, bir cümle
çevrilemedi, kesinti sırasında gelen çeviri okunmadı.

## Çalıştırma

Gerekenler: Mac'te **Xcode 16 veya üstü**, **iOS 18 veya üstü** bir iPhone, AirPods. Simülatörde mikrofon ve çeviri
çalışmaz; gerçek telefon gerekir. Ücretsiz Apple hesabı yeter. (GitHub'daki derleme Xcode 26.6 ile yapılıyor; daha eski
Xcode sürümleriyle denenmedi.)

1. `CanliCeviri.xcodeproj` dosyasını çift tıklayıp Xcode'da açın.
2. Soldaki listede en üstteki **CanliCeviri**'yi seçin → **Signing & Capabilities** sekmesi → **Team** kutusunda kendi
   Apple hesabınızı seçin. (Paket kimliği ekip kimliğinizle otomatik olarak benzersiz olur, değiştirmeniz gerekmez.)
3. iPhone'u kabloyla bağlayın, Xcode'un üst çubuğundan iPhone'unuzu seçin ve ▶︎ düğmesine basın.
   - İlk seferde iPhone'da **Ayarlar → Gizlilik ve Güvenlik → Geliştirici Modu**'nu açın (telefon yeniden başlar).
   - Ücretsiz hesapta **Ayarlar → Genel → VPN ve Aygıt Yönetimi**'nden kendi geliştirici hesabınıza güvenin.
4. Uygulamada **Dinlemeyi Başlat**'a dokunun. İlk seferde mikrofon ve konuşma tanıma izni istenir; dil paketi yoksa
   indirme penceresi açılır.

Alania-2 sesi için **Ayarlar** sekmesine API anahtarınızı girin (https://speech.patientdesk.ai/signup). Anahtar
telefonun Anahtar Zinciri'nde saklanır.

> Ücretsiz Apple hesabıyla yüklenen uygulama 7 gün sonra açılmaz olur; Xcode'dan yeniden ▶︎ yapmak yeter.

**Telefon olmadan arayüzü görmek:** simülatör görüntüleri `docs/sprints/S01/shots/` altındadır. Xcode'da
`CanliCeviri/Arayuz/Onizleme.swift` dosyasını açıp Canvas'ı (Editor → Canvas) açarsanız aynı ekranlar örnek
çevirilerle görünür.

## Bir şey çalışmazsa: Tanılama

Uygulama ve web sürümü olan biteni telefonda kısa satırlar hâlinde kaydeder (başlat / durdur, izinler, dil paketi,
tanımanın açılıp kapanması, çeviri süresi, ses, ses yolu, kesintiler). Sorun olunca:

1. **Ayarlar → Tanılama kaydı**'nı açın.
2. **Kopyala**'ya dokunun ve metni olduğu gibi gönderin.

Kayıt **konuşma ya da çeviri metni, kulaklık ya da telefon adı ve API anahtarı içermez**; cümleler için yalnız kelime
sayısı yazılır. Bellekte tutulur, uygulama kapanınca silinir, hiçbir yere kendiliğinden gönderilmez.

## Dosyalar

| Dosya                          | Görevi                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `CeviriApp.swift`              | Uygulamanın giriş noktası                                                         |
| `Sabitler.swift`               | Diller, süreler (cümle sonu, bekçi, Alania), Alania adresi, renkler               |
| `Durum.swift`                  | Ekranların paylaştığı durum (aşama, notlar); çevir → ekrana yaz → seslendir döngüsü |
| `Hat.swift`                    | Mikrofon, konuşma tanıma, cümle ayırma, seslendirme sırası, ses yolu, kesintiler  |
| `Tanilama.swift`               | Telefonda tutulan olay kaydı                                                      |
| `Anahtarlik.swift`             | Alania anahtarının Anahtar Zinciri'nde saklanması                                 |
| `Arayuz/KokEkran.swift`        | Lacivert zemin, alttaki kapsül sekme çubuğu, Apple çeviri oturumu, duyurular      |
| `Arayuz/CeviriEkrani.swift`    | Çeviri sekmesi                                                                    |
| `Arayuz/GecmisEkrani.swift`    | Geçmiş sekmesi                                                                    |
| `Arayuz/AyarlarEkrani.swift`   | Ayarlar sekmesi                                                                   |
| `Arayuz/TanilamaEkrani.swift`  | Tanılama sayfası                                                                  |
| `Arayuz/Bilesenler.swift`      | Başlıklı kart, asıl cümle + Türkçesi satırı, uyarı satırı                         |
| `Arayuz/Onizleme.swift`        | Örnek durumlar: Xcode önizlemeleri ve simülatör görüntüleri (yalnız hata ayıklama derlemesinde) |
| `Assets.xcassets`              | Uygulama simgesi ve vurgu rengi                                                   |

Yeni bir `.swift` dosyasını `CanliCeviri/` klasörüne koymanız yeterli; Xcode klasörü kendisi izler.

## Nasıl çalışır

- **Cümle sonu:** 1,2 saniye sessizlik bir cümleyi bitirir (`Sabitler.swift` → `duraklama`). Biten cümle çevrilir,
  ekrana yazılır ve seslendirme sırasına girer; cümleler üst üste binmez.
- **AirPods durumu:** Uygulama AirPods için tasarlandı. Başlat düğmesinin hemen üstünde bağlı kulaklığın adı görünür
  ("AirPods Pro bağlı"); kulaklık bağlı değilse ya da dinlerken çıkarılırsa sarı bir uyarı çıkar.
- **Ses yolu:** `.playAndRecord` + `.allowBluetoothA2DP`. Ses AirPods'a yüksek kalitede gider, mikrofon iPhone'unki kalır.
  AirPods bağlı değilse çeviri kulak hoparlöründen (ahize) gelir: hoparlörden çalsaydı mikrofon kendi sesini duyup
  yeniden çevirirdi.
- **Kesintiler:** Arama, alarm ya da Siri gelince ve uygulama arka plana gidince ekran "Duraklatıldı: …" der; kesinti
  bitince dinleme kendiliğinden sürer. Arama ve arka plan çalan çeviriyi keser, okunmayan çeviri sarı notla söylenir.
  AirPods takılıp çıkarılınca mikrofon yeni ses yoluyla yeniden bağlanır, çalan çeviri sürer. Mikrofon geri açılamazsa
  dinleme durur ve ekranda ne yapılacağını söyleyen bir açıklama çıkar.
- **Bekçi:** Mikrofondan 2 saniye ses verisi gelmezse dinleme bir kez yeniden açılır; yine gelmezse "Mikrofondan ses
  gelmiyor" hatasıyla durur. Ekran, mikrofon sağırken "Dinliyorum" demez.
- **Sunucuda tanıma:** Cihazda tanıması olmayan dillerde konuşma tanıma Apple'ın sunucusunda yapılır; ekran bunu sarı
  notla söyler ve bu dillerde internet gerekir.
- **Alania yedeği:** Alania 5 saniyede yanıt vermezse o cümleyi Apple sesi okur ve ekranda not çıkar; art arda üç hatadan
  sonra o oturum boyunca Apple sesi kullanılır.
- **Durdur:** Mikrofon kapanır, sıradaki sesler atlanır, müzik gibi diğer uygulamaların sesi kaldığı yerden sürer.

## Geliştirme

Bu klasörün kuralları `CLAUDE.md` içindedir (sekiz ilke, dosya sahipliği, "bitti" tanımı); ekip ve sprint akışı
`docs/EKIP.md`, ürün planı `docs/PLAN.md`, yol haritası `docs/ROADMAP.md`, ses hattı ve tasarım şartnameleri
`docs/ses-hatti.md` ve `docs/tasarim.md`.

| Denetim                                                   | Ne doğrular                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| `python3 canli-ceviri/scripts/swift-sozdizimi.py --proje` | Swift sözdizimi ve proje dosyası (derleme değildir)                      |
| Dala `git push`                                           | "Canlı Çeviri (iOS derleme)" iş akışı: Mac'te derleme + simülatör görüntüleri |
| `node canli-ceviri/tests/web-akis.cjs`                    | Web sürümünün akışı (sahte tanıma, çeviri ve seslendirme ile)            |

Mac derlemesi yalnız `CanliCeviri/`, `CanliCeviri.xcodeproj/` ya da iş akışı dosyası değişince çalışır; simülatör
görüntülerini `canli-ceviri-ekran` dalına yazar. Hiçbir otomatik denetim mikrofonu, gerçek tanımayı, çeviriyi ya da
AirPods'u denemez.

Ekiple çalışmak için depo kökünden `/ceviri <istek>` (ör. `/ceviri S02 sprintini yürüt`).
