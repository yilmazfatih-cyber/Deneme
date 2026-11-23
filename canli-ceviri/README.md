# Canlı Çeviri (iOS)

Karşınızdaki kişinin konuşmasını iPhone mikrofonuyla dinler, cümle cümle Türkçeye çevirir ve çeviriyi AirPods'tan okur.

```
iPhone mikrofonu → konuşma tanıma (Apple) → çeviri (Apple, cihazda) → Türkçe ses (Alania-2 ya da Apple) → AirPods
```

Konuşma tanıma ve çeviri Apple'ın kendi çatılarıyla yapılır; dil paketi bir kez indirildikten sonra internet gerekmez.
Alania-2 sesi isteğe bağlıdır; anahtar yoksa ya da Alania'ya ulaşılamazsa Apple'ın Türkçe sesi okur.

## Web deneme sürümü (kurulumsuz)

iPhone uygulaması Xcode ile yüklenir; ondan önce akışı telefonda denemek için `web/` klasöründe tarayıcıda çalışan bir
deneme sürümü var. GitHub Pages iş akışı bu klasörü `/canli-ceviri/` altında yayınlar:

**Adres:** `https://<kullanıcı>.github.io/<depo>/canli-ceviri/`

iPhone'da **Safari** ile açın, AirPods'u takın, **Dinlemeyi Başlat**'a dokunup mikrofon iznini verin. Arayüz ve
1,2 saniyelik cümle sonu kuralı uygulamayla aynıdır; farklar:

|                 | iPhone uygulaması             | Web deneme sürümü                                               |
| --------------- | ----------------------------- | --------------------------------------------------------------- |
| Konuşma tanıma  | Cihazda (Apple Speech)        | Tarayıcının hizmeti (Safari'de Apple'ın dikte altyapısı)        |
| Çeviri          | Cihazda (Apple Translation)   | İnternet üzerinden [MyMemory](https://mymemory.translated.net/) |
| Mikrofon        | Her zaman iPhone'unki         | Tarayıcı seçer (AirPods takılıyken çoğunlukla AirPods'unki)     |
| Türkçe ses      | Alania-2 ya da Apple sesi     | Alania-2 ya da cihazın Türkçe sesi                              |
| İnternet        | Dil paketi indikten sonra yok | Gerekli                                                         |

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

| Sekme   | İçerik                                                                                          |
| ------- | ----------------------------------------------------------------------------------------------- |
| Çeviri  | Kaynak dil (7 dil → Türkçe), o an söylenen cümle, son çeviri, önceki 3 çeviri, AirPods durumu, Başlat / Durdur |
| Geçmiş  | Bu oturumdaki tüm çeviriler saatleriyle, en yenisi üstte; Temizle                               |
| Ayarlar | Alania-2 API anahtarı, ses (kadın / erkek), kısa "nasıl çalışır"                                 |

## Çalıştırma

Gerekenler: Mac'te **Xcode 16 veya üstü**, **iOS 18 veya üstü** bir iPhone, AirPods. Simülatörde mikrofon ve çeviri
çalışmaz; gerçek telefon gerekir. Ücretsiz Apple hesabı yeter.

1. `CanliCeviri.xcodeproj` dosyasını çift tıklayıp Xcode'da açın.
2. Soldaki listede en üstteki **CanliCeviri**'yi seçin → **Signing & Capabilities** sekmesi → **Team** kutusunda kendi
   Apple hesabınızı seçin. (Paket kimliği ekip kimliğinizle otomatik olarak benzersiz olur, değiştirmeniz gerekmez.)
3. iPhone'u kabloyla bağlayın, Xcode'un üst çubuğundan iPhone'unuzu seçin ve ▶︎ düğmesine basın.
   - İlk seferde iPhone'da **Ayarlar → Gizlilik ve Güvenlik → Geliştirici Modu**'nu açın (telefon yeniden başlar).
   - Ücretsiz hesapta **Ayarlar → Genel → VPN ve Aygıt Yönetimi**'nden kendi geliştirici hesabınıza güvenin.
4. Uygulamada **Dinlemeyi Başlat**'a dokunun. İlk seferde mikrofon ve konuşma tanıma izni istenir; dil paketi yoksa
   indirme penceresi açılır.

Alania-2 sesi için **Ayarlar** sekmesine API anahtarınızı girin (https://speech.patientdesk.ai/signup).

> Ücretsiz Apple hesabıyla yüklenen uygulama 7 gün sonra açılmaz olur; Xcode'dan yeniden ▶︎ yapmak yeter.

**Telefon olmadan arayüzü görmek:** Xcode'da `CanliCeviri/Arayuz/Onizleme.swift` dosyasını açın ve Canvas'ı açın
(Editor → Canvas). Çeviri, Geçmiş, Ayarlar ve ilk açılış ekranları örnek çevirilerle görünür.

## Dosyalar

| Dosya                         | Görevi                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `CeviriApp.swift`             | Uygulamanın giriş noktası                                                     |
| `Sabitler.swift`              | Diller, cümle sonu için sessizlik süresi, Alania adresi, renkler              |
| `Durum.swift`                 | Ekranların paylaştığı durum; çevir → ekrana yaz → seslendir döngüsü           |
| `Hat.swift`                   | Mikrofon, konuşma tanıma, cümle ayırma, seslendirme sırası, kesintiler        |
| `Arayuz/KokEkran.swift`       | Lacivert zemin, alttaki kapsül sekme çubuğu, Apple çeviri oturumu             |
| `Arayuz/CeviriEkrani.swift`   | Çeviri sekmesi                                                                |
| `Arayuz/GecmisEkrani.swift`   | Geçmiş sekmesi                                                                |
| `Arayuz/AyarlarEkrani.swift`  | Ayarlar sekmesi                                                               |
| `Arayuz/Bilesenler.swift`     | Başlıklı kart, asıl cümle + Türkçesi satırı                                   |
| `Arayuz/Onizleme.swift`       | Xcode önizlemeleri                                                            |
| `Assets.xcassets`             | Uygulama simgesi ve vurgu rengi                                               |

Yeni bir `.swift` dosyasını `CanliCeviri/` klasörüne koymanız yeterli; Xcode klasörü kendisi izler.

## Nasıl çalışır

- **Cümle sonu:** 1,2 saniye sessizlik bir cümleyi bitirir (`Sabitler.swift` → `duraklama`). Biten cümle çevrilir,
  ekrana yazılır ve seslendirme sırasına girer; cümleler üst üste binmez.
- **AirPods durumu:** Uygulama AirPods için tasarlandı. Başlat düğmesinin hemen üstünde bağlı kulaklığın adı görünür
  ("AirPods Pro bağlı"); kulaklık bağlı değilse ya da dinlerken çıkarılırsa sarı bir uyarı çıkar.
- **Ses yolu:** `.playAndRecord` + `.allowBluetoothA2DP`. Ses AirPods'a yüksek kalitede gider, mikrofon iPhone'unki kalır.
  AirPods bağlı değilse çeviri kulak hoparlöründen (ahize) gelir: hoparlörden çalsaydı mikrofon kendi sesini duyup
  yeniden çevirirdi.
- **Kesintiler:** AirPods takılıp çıkarılınca, telefon görüşmesi bitince ya da uygulama arka plandan dönünce dinleme
  kendiliğinden sürer. Mikrofon geri açılamazsa ekranda açıklama çıkar.
- **Durdur:** Mikrofon kapanır, sıradaki sesler atlanır, müzik gibi diğer uygulamaların sesi kaldığı yerden sürer.
