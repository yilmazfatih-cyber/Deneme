# Yayın kılavuzu — Apple hesabından App Store'a

Bu belge uygulamayı App Store'a koymak ve haftalık abonelikle ödeme almak için sizin yapmanız gereken adımları sırayla
anlatır. Apple'ın ekranları zamanla değişir; bir adım burada yazdığı gibi görünmüyorsa ekran görüntüsünü gönderin.
Kimlik, banka ve vergi bilgilerinizi yalnız Apple'ın kendi sayfalarına girin; bize ya da depoya yazmayın.

Sıra: **1** hesap → **2** anlaşma, banka, vergi → **3** uygulama kaydı → **4** abonelik → **5** Xcode'dan yükleme →
**6** TestFlight → **7** incelemeye gönderme. 1 ve 2 Apple'ın onayını bekletir; onlara bugün başlayın.

## 1. Apple Developer Program'a katılın (yılda 99 ABD doları)

Gerekenler: iki adımlı doğrulaması açık bir Apple Kimliği, kimlik belgeniz, ödeme için bir kart.

1. iPhone'unuza App Store'dan **Apple Developer** uygulamasını indirin.
2. Apple Kimliğinizle giriş yapın.
3. **Hesap** sekmesinde **Şimdi Kaydolun**'a dokunun.
4. **Bireysel** (Individual) seçin. Şirket adına yayınlayacaksanız **Kuruluş** seçilir; o yol D-U-N-S numarası ister ve
   daha uzun sürer.
5. Adınızı kimliğinizdeki gibi girin, kimlik belgenizi telefonla taratın.
6. Yıllık ücreti ödeyin.

Onay çoğu zaman 48 saat içinde gelir; kimlik doğrulaması uzarsa daha geç olabilir. Bilgisayardan yapmak isterseniz:
https://developer.apple.com/programs/enroll/

Onay e-postası gelince bana haber verin; sonraki adımlar o zaman açılır.

## 2. Ücretli uygulama anlaşması, banka ve vergi

Bu adım tamamlanmadan abonelik satılamaz ve Xcode ürünü yükleyemez.

1. https://appstoreconnect.apple.com adresine Apple Kimliğinizle girin.
2. **İş** (Business; eski adı "Anlaşmalar, Vergi ve Banka") bölümünü açın.
3. **Ücretli Uygulamalar** (Paid Apps) anlaşmasını kabul edin.
4. Banka hesabınızı ekleyin (ödemeler bu hesaba gelir).
5. Vergi formlarını doldurun. Türkiye'de yaşayan biri için ABD formu çoğunlukla W-8BEN'dir; emin değilseniz mali
   müşavirinize sorun.

Durum "Etkin" (Active) olana dek birkaç gün sürebilir.

**Küçük İşletme Programı:** yıllık geliri 1 milyon doların altındaki geliştiriciler için Apple'ın payı %30 yerine
%15'tir. Başvuru: https://developer.apple.com/app-store/small-business-program/ — hesap açılır açılmaz başvurun.

## 3. Uygulamayı App Store Connect'te oluşturun

1. App Store Connect → **Uygulamalar** → **+** → **Yeni Uygulama**.
2. Platform: **iOS**. Ad: `docs/buyume/magaza.md` içindeki ad (ad alınmışsa oradaki yedeklerden biri). Adda ve anahtar
   kelimelerde "AirPods" kullanmayın; Apple başkasının marka adını bu alanlarda kabul etmez.
3. Birincil dil: **Türkçe**.
4. Paket kimliği (Bundle ID): `com.yilmazfatih.canliceviri`. Listede yoksa önce Xcode'da 5. adımın ilk üç maddesini
   yapın; Xcode kimliği kendisi kaydeder.
5. SKU: `canliceviri` (yalnız sizin gördüğünüz bir kod).

## 4. Haftalık aboneliği oluşturun

1. Uygulamanın sayfasında **Abonelikler** (Subscriptions) → **Abonelik Grubu Oluştur**: `Canlı Çeviri Sınırsız`.
2. Grubun içinde **+** ile abonelik ekleyin:
   - Referans adı: `Sınırsız haftalık`
   - Ürün kimliği: **`canliceviri.sinirsiz.haftalik`** (harfi harfine; uygulama bu kimliği arar)
3. Süre: **1 Hafta**.
4. Fiyat: ülke ve tutarı seçin. Fiyatı siz belirlersiniz; uygulama fiyatı Apple'dan okur, kodda fiyat yoktur.
5. Yerelleştirme ekleyin (Türkçe ve İngilizce): görünen ad ve kısa açıklama (`docs/buyume/magaza.md`).
6. **İnceleme bilgisi:** abonelik ekranının bir ekran görüntüsünü yükleyin (`docs/sprints/S03/shots/abonelik.png`).
7. Abonelik grubuna da Türkçe ve İngilizce yerelleştirme ekleyin.

İlk abonelik, uygulamanın ilk sürümüyle **birlikte** incelemeye gönderilir (7. adım).

## 5. Uygulamayı Xcode'dan yükleyin

1. Mac'te `canli-ceviri/CanliCeviri.xcodeproj` dosyasını açın.
2. Soldan **CanliCeviri** → **Signing & Capabilities** → **Team**: geliştirici hesabınızı seçin.
3. Paket kimliği `com.yilmazfatih.canliceviri` olmalı. Xcode "kullanılamıyor" derse kendinize özgü bir kimlik yazın
   (ör. `com.<adınız>.canliceviri`) ve 3. adımda aynısını seçin.
4. Önce kendi telefonunuzda deneyin: iPhone'u bağlayın, ▶︎. `docs/cihaz-testi.md` → U-0 ve U-1.
5. **Ödemeyi yerelde denemek için** (gerçek para gitmez): **Product → Scheme → Edit Scheme → Run → Options → StoreKit
   Configuration** → `Abonelik.storekit`. Uygulamada günlük süre dolunca ya da Ayarlar → Abonelik'ten satın almayı
   deneyin.
6. Mağazaya göndermek için: üstte hedef olarak **Any iOS Device** seçin → **Product → Archive** → açılan pencerede
   **Distribute App** → **App Store Connect** → **Upload**.

## 5b. Xcode'suz yol: GitHub uygulamayı sizin yerinize yüklesin

Xcode kullanmak istemiyorsanız 5. adımın 6. maddesi yerine bunu yapın. GitHub uygulamayı derler, imzalar ve Apple'a
yükler; siz yalnız telefonda TestFlight'tan kurarsınız. Önce 1, 2 ve 3. adımlar bitmiş olmalı. **Bu yol henüz hiç
çalıştırılmadı** (hesap yoktu); ilk denemede bir hata çıkarsa iş akışının kaydını gönderin.

**Bir kez yapılır: Apple'dan anahtar alıp GitHub'a girin**

1. https://appstoreconnect.apple.com → **Kullanıcılar ve Erişim** (Users and Access) → **Entegrasyonlar** (Integrations)
   → **App Store Connect API** → **Takım Anahtarları** (Team Keys). İlk seferde **Erişim İste** çıkarsa kabul edin.
2. **+** ile anahtar oluşturun. Ad: `GitHub TestFlight`. Erişim: **Admin**.
3. **API Anahtarını İndir**'e dokunun. Dosya (`AuthKey_….p8`) yalnız bir kez indirilir; saklayın.
4. GitHub'da depo sayfası → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Dört değeri
   tek tek ekleyin (adlar harfi harfine):

| Ad | Değer | Nerede |
| -- | ----- | ------ |
| `ASC_KEY_P8` | İndirdiğiniz dosyanın tüm içeriği (`-----BEGIN PRIVATE KEY-----` ile başlar) | Dosyayı TextEdit ile açın, hepsini kopyalayın |
| `ASC_KEY_ID` | Anahtar Kimliği (Key ID), 10 karakter | Anahtarın satırında |
| `ASC_ISSUER_ID` | Issuer ID, uzun ve tireli | Aynı sayfanın üstünde |
| `APPLE_TEAM_ID` | Takım Kimliği (Team ID), 10 karakter | https://developer.apple.com/account → Üyelik ayrıntıları |

Bu değerleri yalnız GitHub'ın bu sayfasına girin; sohbete, e-postaya ya da depodaki bir dosyaya yazmayın.

**Her yeni sürümde: tek düğme**

1. GitHub'da depo → **Actions** → **Canlı Çeviri (TestFlight'a yükle)** → **Run workflow** → **Run workflow**.
2. 10–20 dakika sonra iş yeşil olur; sürüm TestFlight'ta 10–30 dakika içinde görünür.
3. Telefonda **TestFlight** uygulamasını açıp **Yükle**'ye dokunun (6. adım).

## 6. TestFlight ile gerçek ortamda deneyin

1. Yükleme App Store Connect → **TestFlight** sekmesinde 10–30 dakika içinde görünür.
2. Şifreleme sorusu çıkarsa: uygulama yalnız standart şifreleme (HTTPS) kullanır; projede bu beyan hazırdır.
3. Kendinizi **Dahili Test** grubuna ekleyin; iPhone'a **TestFlight** uygulamasını kurup sürümü yükleyin.
4. TestFlight'ta abonelik gerçek gibi çalışır ama **para çekilmez** ve haftalık abonelik birkaç dakikada bir yenilenir.
   Satın almayı, iptali ve "Satın alımları geri yükle"yi deneyin.

## 7. İncelemeye gönderin

Uygulama sayfasında doldurulacaklar (metinler `docs/buyume/magaza.md` içinde hazır):

- Ad, alt başlık, anahtar kelimeler, açıklama, tanıtım metni.
- Ekran görüntüleri (6,9 inç iPhone): `docs/sprints/` altındaki simülatör görüntüleri tam boyutlu hâliyle
  `canli-ceviri-ekran` dalındadır.
- **Gizlilik Politikası adresi:** https://yilmazfatih-cyber.github.io/Deneme/canli-ceviri/gizlilik.html
- **Destek adresi:** https://yilmazfatih-cyber.github.io/Deneme/canli-ceviri/destek.html
- **Uygulama Gizliliği** soruları: biz hiçbir veri toplamıyoruz; ilk seçenek "Veri Toplanmıyor"dur. Bilmeniz gereken iki
  istisna var: cihazda tanınmayan dillerde ses Apple'ın sunucusunda tanınır; kullanıcı kendi Alania anahtarını girerse
  çeviri metni seslendirmek için Alania'ya gider. İkisi de gizlilik sayfasında yazılı. Apple bu soruda farklı bir beyan
  isterse iletisini gönderin; bu hukuki görüş değildir.
- Yaş sınırı anketi; kategori: Yardımcı Programlar ya da Seyahat.
- **Uygulama İçi Satın Alımlar** bölümünde haftalık aboneliği bu sürüme ekleyin.
- **İnceleme notu:** uygulamanın mikrofonla karşıdaki kişiyi dinleyip Türkçeye çevirdiğini, AirPods gerektiğini ve
  günde 10 dakika ücretsiz kullanım olduğunu yazın; hesap gerekmez.

Sonra **İncelemeye Gönder**. İlk inceleme çoğu zaman birkaç gün sürer. Apple bir şey isterse iletiyi olduğu gibi gönderin.

## Bilmeniz gerekenler

- **Haftalık abonelikler** Apple incelemesinde yakından bakılan bir türdür: fiyat, süre ve iptal yolu abonelik ekranında
  açıkça yazmalıdır (yazıyor); ücretsiz kullanım gerçekten işe yarar olmalıdır.
- **Henüz gerçek cihazda denenmedi.** Mağazaya göndermeden önce 5. adımın 4. maddesi şart: uygulama sizin telefonunuzda
  çalışmıyorsa inceleme de reddeder.
- **Ödeme kodu** yerel test ortamı ve TestFlight dışında denenemez; ikisi de sizin Mac'inizde ve hesabınızda yapılır.
