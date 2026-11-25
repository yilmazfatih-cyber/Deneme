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
2. Platform: **iOS**. Ad: `docs/buyume/magaza.md` içindeki ad (ad alınmışsa oradaki yedeklerden biri).
3. Birincil dil: **Türkçe**.
4. Paket kimliği (Bundle ID): `com.yilmazfatih.canliceviri`. Listede yoksa önce Xcode'da 5. adımın ilk üç maddesini
   yapın; Xcode kimliği kendisi kaydeder.
5. SKU: `canliceviri` (yalnız sizin gördüğünüz bir kod).

## 4. Haftalık aboneliği oluşturun

1. Uygulamanın sayfasında **Abonelikler** (Subscriptions) → **Abonelik Grubu Oluştur**: `Canlı Çeviri Sınırsız`.
2. Grubun içinde **+** ile abonelik ekleyin:
   - Referans adı: `Haftalık`
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
- **Uygulama Gizliliği** soruları: uygulama veri toplamaz ("Veri Toplanmıyor").
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
