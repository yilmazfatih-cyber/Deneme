# S03 — Ödeme ve App Store hazırlığı

## Amaç

Proje sahibi 25.11.2026'da karar verdi: uygulama gerçek bir iPhone uygulaması olarak yayınlanacak ve **haftalık
abonelikle** para kazanacak. Apple Developer hesabı henüz yok; açılana kadar ödeme Xcode'un yerel test ortamında
denenebilir olmalı, hesap açılınca aynı kod gerçek ödemeyle çalışmalı. S02 (Soniox) proje sahibinin isteğiyle beklemede.

## Kapsam

1. **Abonelik (StoreKit 2):** tek ürün, haftalık yenilenen abonelik. Günde 10 dakika ücretsiz dinleme; sınırsız
   kullanım abonelikle.
2. **Abonelik ekranı:** fiyat App Store'dan okunur (kodda fiyat yok), süre ("haftalık"), ne kazandırdığı, "Satın
   alımları geri yükle", Kullanım Koşulları ve Gizlilik Politikası bağlantıları (Apple'ın abonelik kuralları).
3. **App Store gereklilikleri:** gizlilik bildirimi dosyası (`PrivacyInfo.xcprivacy`), şifreleme beyanı, gerçek paket
   kimliği, Xcode'da yerel deneme için StoreKit yapılandırma dosyası.
4. **Web:** gizlilik politikası ve destek sayfası (App Store bunların adresini ister).
5. **Yayın kılavuzu** (`docs/yayin.md`, lider): Apple Developer hesabının açılması, App Store Connect'te uygulamanın ve
   aboneliğin oluşturulması, TestFlight, incelemeye gönderme.
6. **Büyüme ajanı** (`buyume-sorumlusu`): ürünü, abonelik ekranını ve mağaza hazırlığını büyüme açısından düzenli
   inceler; raporları `docs/buyume/` altına yazar.

Dışında: Soniox motoru (S02, beklemede), sunucu tarafı makbuz doğrulama, reklam, web'de ödeme.

## Kabul kriterleri

| No | Kriter | Doğrulama |
| -- | ------ | --------- |
| K1 | Mac derlemesi yeşil: Debug ve Release, hata 0, uyarı 0. | İş akışı |
| K2 | Abone olmayan kullanıcı günde 10 dakika dinleyebilir; süre dolunca dinleme durur ve abonelik ekranı açılır; ekran ne olduğunu söyler (ilke 5). Abonede sınır yoktur. | Kod incelemesi |
| K3 | Abonelik ekranı fiyatı ve süreyi StoreKit'ten gösterir; satın alma, geri yükleme, iptal edilmiş / süresi dolmuş / beklemede durumları ele alınır; ürün yüklenemezse ekran bunu söyler. | Kod incelemesi, `abonelik` görüntüsü |
| K4 | Koşullar ve gizlilik bağlantıları abonelik ekranında ve Ayarlar'da vardır; gizlilik sayfası uygulamanın gerçekte ne yaptığını doğru anlatır. | Görüntü, sayfa |
| K5 | `PrivacyInfo.xcprivacy` ve `ITSAppUsesNonExemptEncryption = NO` projede; paket kimliği `com.example` ile başlamaz. | Proje dosyası |
| K6 | Tanılama'ya satın alma olayları yazılır; kişisel veri, işlem kimliği ve fiyat yazılmaz. | Kod incelemesi |
| K7 | Web akış testi yeşil; yeni sayfalar 320–1280 px'te taşmaz. | `node tests/web-akis.cjs` |
| K8 | `docs/yayin.md` teknik olmayan biri için adım adımdır. | Belge |

## Sözleşmeler

- **Ürün kimliği:** `canliceviri.sinirsiz.haftalik` (haftalık yenilenen abonelik; abonelik grubu "Canlı Çeviri Sınırsız").
- **Paket kimliği:** `com.yilmazfatih.canliceviri` (proje sahibi Xcode'da değiştirebilir).
- **Ücretsiz sınır:** `gunlukUcretsizSure = 600` saniye (`Sabitler.swift`); yalnız "dinliyor" aşamasında sayılır, gün
  değişince sıfırlanır, telefonda tutulur.
- **StoreKit yapılandırması:** `CanliCeviri/Abonelik.storekit` (yerel deneme; ürün kimliği aynı).
- **Başlatma argümanı (yalnız DEBUG):** `-ekran abonelik` (abonelik ekranı, örnek fiyatla) ve `-ekran sinir-doldu`
  (Çeviri ekranı, günlük süre dolmuş). Var olan görüntüler değişmez.
- **Sayfalar:** `web/gizlilik.html`, `web/destek.html`; yayın adresleri
  `https://yilmazfatih-cyber.github.io/Deneme/canli-ceviri/gizlilik.html` ve `…/destek.html`. Kullanım koşulları için
  Apple'ın standart sözleşmesi: `https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`.
- **Tanılama olayları:** `abonelik  ürün yüklendi`, `abonelik  ürün yüklenemedi <kod>`, `abonelik  satın alındı`,
  `abonelik  iptal edildi`, `abonelik  beklemede`, `abonelik  geri yüklendi`, `abonelik  durum=abone|ücretsiz`,
  `sınır  günlük süre doldu`.

## Kararlar

| No  | Karar |
| --- | ----- |
| KR1 | Abonelik durumu StoreKit 2'nin cihazdaki doğrulamasıyla (`Transaction.currentEntitlements`) belirlenir; sunucu yok. |
| KR2 | Süre dolduğunda çalan çeviri bitirilir, yeni dinleme başlamaz; kullanıcı suçlanmaz, ekran seçenekleri söyler (yarın yeniden ya da abonelik). |
| KR3 | Ücretsiz sürenin kalanı Çeviri ekranında sürekli gösterilmez; son 1 dakikada sarı notla söylenir. |
| KR4 | Hız önceliklidir: tek uygulama turu, ardından Mac derlemesi ve liderin okuması; ayrı inceleme turu yalnız ödeme kodu için (kalite sorumlusu). |
