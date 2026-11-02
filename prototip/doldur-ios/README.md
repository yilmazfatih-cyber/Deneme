# Doldur: iOS ekran ajanı prototipi

> Bu klasör Köprü uygulamasının bir parçası değil. Ayrı bir iOS prototipidir.
> Köprü'nün `npm` komutları bu klasörü derlemez.

Doldur ekranı sürekli izler ve ekrandaki form alanlarını tanır. Kullanıcı bir alana dokunduğunda doğru bilgiyi tek
dokunuşla o alana yazar. Kargo formu, başvuru, sigorta, kurumsal uygulama gibi ekranlarda tekrarlayan yazma işini
kısaltır.

## 1. Araştırmanın değerlendirmesi (Mika ve Apple'ın RL makalesi)

| Kaynak                                                     | Ne gösteriyor                                                                                                                                                                                                                                    | iOS için anlamı                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mika** (Android, açık kaynak)                            | Ajan, arka planda gizli bir sanal ekranda uygulamaları kullanıyor. Android bunu Erişilebilirlik Servisi ile sağlıyor: başka uygulamanın arayüz ağacını okuyor, dokunuş ve yazı gönderiyor. Sunucu yok, kullanıcı kendi API anahtarını getiriyor. | **Doğrudan taşınamaz.** iOS'ta üçüncü taraf bir uygulama başka uygulamanın ekranını okuyamaz, ona dokunamaz, arka planda sanal ekran açamaz. App Store'da bunun bir karşılığı yok.                                                                                                           |
| **Apple, canlı iOS uygulamalarında RL ile arayüz gezinme** | 8B'lik planlayıcının görev başarısı %4,7'den %32,8'e çıkıyor (arXiv).                                                                                                                                                                            | Yön doğru, ama **tam otonom gezinme henüz güvenilir değil**: her üç görevden ikisi başarısız. Bu sonuç Apple'ın kendi test düzeneğinde alındı; App Store uygulamalarına bu erişim açık değil. Doğru ürün kararı, **insanı döngüde tutmak**: ajan önersin, kullanıcı tek dokunuşla onaylasın. |

**Sonuç:** "Telefonu kendi kullanan ajan" iOS'ta bugün kurulamaz. Ama isteğin özü kurulabilir: ekranı sürekli gören,
alanı anlayan ve hızlıca dolduran bir ajan. iOS'un izin verdiği üç resmi kapı bu iş için yeterli:

1. **Yayın uzantısı (ReplayKit):** Kullanıcı başlattığında tüm ekranı, her uygulamada sürekli görür. Bu ajanın gözü.
2. **Özel klavye:** Odaklı alana yazabilir ve alanın türünü (`textContentType`) bilir. Bu ajanın eli.
3. **Safari web uzantısı:** Web formlarında sayfanın içini görür ve tüm alanları tek seferde doldurabilir.

Girişim açısından: Kurye, satış ve servis personeline yönetilen bir ajan fikri Android'de (MDM ve Erişilebilirlik
Servisi ile) çok daha güçlü. iOS sürümü bir "yardımcı" olarak konumlanmalı. Pazarlanabilir değeri hız ve hatasız
yazım; tam otomasyon vaat edilmemeli. Mağaza riski: klavyelerin veri toplaması (Yönerge 4.4.1) ve ekran kaydı izni
App Review'da açıkça gerekçelendirilmeli.

## 2. Nasıl çalışır?

```
 ┌───────────────────────┐   ~1 sn'de bir kare    ┌───────────────────────────┐
 │  Herhangi bir uygulama │ ─────────────────────▶ │  Yayın uzantısı (göz)      │
 │  (kargo, banka, CRM…)  │                         │  Vision OCR → etiketler    │
 └───────────────────────┘                         │  FieldMatcher → profil     │
            ▲                                       │  [✨ istenirse] Claude     │
            │ insertText                            └────────────┬──────────────┘
 ┌──────────┴────────────┐   App Group + Darwin bildirimi        │ analysis.json
 │  Doldur Klavye (el)    │ ◀───────────────────────────────────┘
 │  "İmleç burada: E-posta│
 │   ali@ornek.com" [▼]   │ ── ✨ Akıllı analiz isteği ──▶ (yayın uzantısı)
 └───────────────────────┘
```

**Öneri sırası (klavyede):**

1. Uygulamanın alana koyduğu tür ipucu (`textContentType`: e-posta, ad, posta kodu…). En güvenilir sinyal.
2. Akıllı analizde Claude'un "imleç burada" dediği alan.
3. Ekranda görülen diğer alanlar, yukarıdan aşağıya.
4. Profilin geri kalanı.

**İki çalışma modu:**

| Mod                              | Ne olur                                                                                                                                                                                                                             | Veri nereye gider                                                                                                             |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Yerel** (varsayılan)           | Cihaz üstü Vision OCR, ekrandaki "T.C. Kimlik No", "Teslimat adresi" gibi etiketleri okur. Kural tabanlı eşleştirici bunları profil alanlarına bağlar.                                                                              | Hiçbir yere. İnternetsiz çalışır.                                                                                             |
| **Akıllı analiz** (isteğe bağlı) | Klavyedeki ✨ düğmesine basılınca o anki kare Claude'a gider. Claude her alanı, odaklı alanı ve profil anahtarını yapılandırılmış JSON olarak döndürür. Profilde karşılığı olmayan "Açıklama" gibi alanlar için kısa taslak önerir. | Ekran görüntüsü Anthropic API'ye gider. **Profil değerleri gitmez**, yalnızca alan adları gider. Değeri klavye cihazda yazar. |

## 3. Klasör yapısı

| Yol                                      | İçerik                                                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `project.yml`                            | XcodeGen proje tanımı: uygulama + 3 uzantı, ortak App Group                                                          |
| `Shared/`                                | Profil modeli, ortak depo (App Group), Darwin bildirimleri, anahtar zinciri, `FieldMatcher`, `ClaudeClient`          |
| `App/`                                   | SwiftUI ana uygulama: Ajan, Profil, Deneme formu, Ayarlar                                                            |
| `BroadcastExtension/SampleHandler.swift` | Ekran karelerini küçültür, OCR yapar, eşleştirir; akıllı analiz isteğini Claude'a iletir                             |
| `KeyboardExtension/`                     | Öneri sıralaması (`KeyboardModel`) ve klavye arayüzü                                                                 |
| `SafariExtension/`                       | Web formlarını tek dokunuşla dolduran ve geri alan uzantı (`content.js`), profili yerel mesajla veren Swift işleyici |

## 4. Kurulum (Mac + Xcode 15 veya üstü)

```bash
brew install xcodegen
```

```bash
cd prototip/doldur-ios && xcodegen generate && open Doldur.xcodeproj
```

1. Xcode'da her hedef için **Signing & Capabilities** altında takımınızı seçin.
2. `com.ornek.doldur` ve `group.com.ornek.doldur` kimliklerini kendi kimliklerinizle değiştirin.
   Bunu hem `project.yml` hem `Shared/AppConfig.swift` içinde yapın.
3. Gerçek bir iPhone'a kurun. Simülatörde yayın uzantısı ve özel klavye tam çalışmaz.
4. Telefonda şu ayarları yapın:
   - **Ayarlar › Genel › Klavye › Klavyeler › Yeni Klavye Ekle › Doldur Klavye** yolunu izleyin ve **Tam Erişim**'i açın.
   - **Safari › Uzantılar › Doldur Safari** uzantısını açın ve tüm sitelere izin verin.
   - Akıllı analiz için uygulamada **Ayarlar** sekmesinden API anahtarını girin ve anahtarı açın.

## 5. Deneme senaryosu

1. **Profil** sekmesinde ad, e-posta, telefon, adres, il, ilçe ve T.C. kimlik no girin.
2. **Ajan** sekmesinde **Ajanı başlat** düğmesine basın ve sistem penceresinde yayını başlatın.
   Üst çubuk kırmızı yanar.
3. **Deneme** sekmesinde "Kargo gönderimi" formunu açın. "Ajanın gördüğü" listesinde alanlar belirir.
4. "Ad Soyad" alanına dokunun ve 🌐 ile Doldur Klavye'ye geçin. Büyük düğmede "Alan türü · Ad Soyad" yazar.
   Tek dokunuşla alan dolar.
5. "T.C. Kimlik No" alanına dokunun. Bu alanda tür ipucu yok; öneri ekrandaki yazıdan gelir ("Ekranda").
6. "Kuryeye not" alanında ✨ **Akıllı analiz** düğmesine basın. Claude bu alan için kısa bir taslak önerir.
7. Aynı adımları gerçek bir uygulamada (kargo, e-ticaret, CRM) ve Safari'de bir web formunda tekrarlayın.

## 6. Bilinen sınırlar

- **iOS başka uygulamaya dokundurmaz.** Alanlar arasında geçişi ve "Gönder" düğmesine basmayı kullanıcı yapar.
  Bu bir eksik değil, iOS güvenlik modelidir. Apple'ın %32,8'lik sonucu da bu adımın otonom yapılmaması gerektiğini
  destekliyor.
- **Şifre ve telefon tuş takımı (`phonePad`) alanlarında** iOS özel klavyeyi açmaz. Bu alanlar için önerideki
  **Kopyala** kullanılır.
- Yayın uzantısının bellek sınırı yaklaşık 50 MB'tır. Bu yüzden kareler 720 px'e küçültülür ve tek kare tutulur.
- Ekran kaydında şifre alanları ve DRM'li içerik görünmez. Bazı bankacılık uygulamaları kaydı tamamen karartır.
- Kural tabanlı eşleştirme etiket metnine bağlıdır. Etiketi yalnızca simge olan alanlarda akıllı analiz gerekir.
- Bu prototip burada derlenmedi: geliştirme ortamında Xcode yok. İlk `xcodegen generate` ve derleme Mac'te
  yapılmalı. Küçük derleme hataları çıkabilir.

## 7. Sonraki adımlar (önerilen)

1. Saha testi: 3 gerçek iş akışında (kargo çıkışı, servis formu, CRM kaydı) alan başına süreyi ölçün.
   Elle yazmayla karşılaştırın.
2. Kurumsal sürüm: profil yerine şirket verisi (müşteri, sipariş no) MDM ile dağıtılan yapılandırma profilinden gelsin.
3. Akıllı analizi otomatik tetikleme: yerel OCR yeni bir form gördüğünde ve tanınmayan alan varsa, kullanıcı izin
   verdiyse Claude'a sorulsun.
4. Android sürümü: Erişilebilirlik Servisi ile tam otomatik doldurma ve "Gönder"den önce onay adımı.
   Asıl iş değeri burada olabilir.
5. KVKK: aydınlatma metni, ekran görüntüsü saklanmadığının belgesi, hassas alanların akıllı analizde maskelenmesi.
