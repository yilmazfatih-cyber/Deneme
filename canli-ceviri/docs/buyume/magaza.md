# App Store sayfası taslağı — Canlı Çeviri

Taslak: 25.11.2026 · Yazan: `buyume-sorumlusu` · Durum: **taslak, yayınlanmaya hazır değil**. Aşağıdakiler, uygulamanın
bugünkü yaptığına göre yazıldı; gerçek iPhone ve AirPods ile **henüz denenmedi** ve "çevrimdışı çalışır" iddiası
cihazda doğrulanmadı. Cihaz testi bu iddiaları değiştirirse metin güncellenir.

## 0. Vaat sınırları (metinde uyulan kurallar)

| Uygulama yapar | Uygulama yapmaz (metinde yok) |
| --- | --- |
| Karşıdaki yabancı dil → **Türkçe**, tek yönlü | Türkçeden yabancı dile çeviri, çift yönlü konuşma |
| 7 kaynak dil: İngilizce, Almanca, Fransızca, İspanyolca, İtalyanca, Rusça, Arapça | "Her dil", "100 dil" |
| Çoğu dilde tanıma ve çeviri cihazda (dil paketi bir kez inince) | "Her zaman çevrimdışı", "internetsiz her dilde" (**cihazda doğrulanmadı**; bazı dillerde tanıma Apple'ın sunucusunda) |
| Mikrofon iPhone'unki, ses AirPods'tan | Arka planda/kilitliyken dinleme; hoparlörden okuma |
| Geçmiş uygulama kapanınca silinir | Geçmişi saklama/dışa aktarma |
| Günde 10 dakika ücretsiz, sınırsız için haftalık abonelik | "Ücretsiz" (kısıtsız), "denemesiz" gibi yanıltıcı ifadeler |

Ek kurallar: **"AirPods"** Apple'ın tescilli markasıdır; adda, alt başlıkta ve anahtar kelimelerde kullanılmaz (Apple
2.3.7: tescilli terimlerle meta veri doldurma). Açıklamada uyumluluk bilgisi olarak geçer ve altına marka notu eklenir.
Fiyat metne yazılmaz (2.3.7: meta veride fiyat yok); fiyat App Store tarafından gösterilir. "En iyi", "1 numara" gibi
karşılaştırma iddiası yok. Rakip adı yok.

## 1. Metin alanları

Karakter sayısı Python `len()` ile sayıldı (boşluk ve noktalama dahil); sınır yanda.

### 1.1 Türkçe (ana dil: Türkiye)

| Alan | Metin | Sayı / sınır |
| --- | --- | --- |
| Uygulama adı | `Canlı Çeviri: Türkçe Kulağında` | 30 / 30 |
| Alternatif ad (ad alınmışsa) | `Canlı Çeviri Kulaklık` | 21 / 30 |
| Alt başlık | `Yabancı konuşmayı Türkçe dinle` | 30 / 30 |
| Anahtar kelimeler | `tercüman,anlık,simültane,konuşma,yabancı,ingilizce,almanca,fransızca,ispanyolca,italyanca,rusça` | 95 / 100 |
| Tanıtım metni | `Karşınızdaki yabancı dilde konuşur, siz Türkçesini kulaklığınızdan dinlersiniz. Günde 10 dakika ücretsiz; tanıma ve çeviri çoğu dilde cihazda yapılır.` | 150 / 170 |

Anahtar kelime notları: ad ve alt başlıkta geçen sözcükler ("canlı", "çeviri", "türkçe", "kulağında", "yabancı"
hariç; "yabancı" alt başlıkta da geçiyor, istenirse `rusça` yerine `arapça,seyahat` ile değiştirilebilir) tekrar
edilmez; Apple alanları birlikte arar. Çoğul/tekil ayrımı gerekmez. Arama hacmi verisi **yok**; liste varsayımdır,
ilk iki haftada ASC "Arama" kaynağına göre gözden geçirilir. "AirPods", "Apple", "Google", "DeepL" gibi marka adı **yok**.

### 1.2 İngilizce (Birleşik Devletler, ikinci yerelleştirme)

| Alan | Metin | Sayı / sınır |
| --- | --- | --- |
| App name | `Live Translate to Turkish` | 25 / 30 |
| Alternatif | `Live Translate: to Turkish` | 26 / 30 |
| Subtitle | `Hear foreign speech in Turkish` | 30 / 30 |
| Keywords | `translator,interpreter,realtime,conversation,earbuds,german,french,spanish,italian,russian,arabic` | 97 / 100 |
| Promotional text | `Someone speaks a foreign language; you hear it in Turkish in your earbuds. 10 minutes free daily. On most languages, recognition and translation run on your iPhone.` | 164 / 170 |

Not: İngilizce sayfa Türkçe konuşan kullanıcıların telefon dili İngilizce olanlarına ve yurtdışındaki Türklere hitap
eder. Başka bir dil hedeflenmiyor (hedef dil yalnız Türkçe).

## 2. Açıklama

### 2.1 Türkçe

```
Yabancı biriyle yüz yüze konuşuyorsunuz ama dilini bilmiyorsunuz. Canlı Çeviri, karşınızdakinin söylediğini dinler, cümle cümle Türkçeye çevirir ve çeviriyi kulaklığınızdan okur. Ekranda da hem söyleneni hem Türkçesini görürsünüz.

NASIL ÇALIŞIR
• Kaynak dili seçin: İngilizce, Almanca, Fransızca, İspanyolca, İtalyanca, Rusça ya da Arapça.
• Kulaklığınızı takın, iPhone'u karşınızdakine doğru tutun ya da masaya koyun, "Dinlemeyi Başlat"a dokunun.
• Karşınızdaki konuşur. Cümle bitince (yaklaşık bir saniyelik sessizlik) Türkçesi hem yazılır hem kulağınıza okunur.

NELER VAR
• Tek yönlü, sade: yabancı dilden Türkçeye. Türkçeden yabancı dile çeviri yoktur.
• Dinleyen her zaman iPhone'unuzun mikrofonudur; kulaklığın mikrofonu açılmaz, ses kalitesi düşmez.
• Kulaklık bağlı değilse ya da koptuysa ekran bunu açıkça söyler. Dinleme durduysa ekran yine söyler.
• Geçmiş sekmesinde o oturumun çevirilerini saatleriyle görürsünüz. Geçmiş, uygulama kapanınca silinir.
• Büyük yazı ve VoiceOver ile uyumlu.

GİZLİLİK
• Çoğu dilde konuşma tanıma ve çeviri cihazınızda yapılır; söylenenler telefondan çıkmaz. Dil paketi ilk kullanımda bir kez indirilir.
• İstisnalar ekranda yazılıdır: cihazda tanıması olmayan dillerde tanıma Apple'ın sunucusunda yapılır (internet gerekir). Alania sesi için isteğe bağlı anahtar girerseniz yalnız Türkçe çeviri metni seslendirme için Alania'ya gönderilir; söylenen asıl cümle gönderilmez.
• Hesap açmanız gerekmez, reklam yoktur.

ÜCRETSİZ VE ABONELİK
• Günde 10 dakika ücretsiz dinleyebilirsiniz; her gün yenilenir.
• Sınırsız dinleme için Canlı Çeviri Sınırsız aboneliği vardır (haftalık yenilenir).
• Abonelik ve fiyat bilgisi: aşağıdaki "Abonelik bilgisi" bölümüne ve uygulama içindeki abonelik ekranına bakın.

BİLMENİZ GEREKENLER
• AirPods ya da başka bir Bluetooth kulaklıkla kullanabilirsiniz; en iyi sonuç için AirPods önerilir. Kulaklık yoksa ses telefonun ahizesinden gelir.
• Uygulama ekran açıkken ve ön plandayken dinler; arka planda çalışmaz.
• Çeviri otomatiktir; hatalı olabilir. Sağlık, hukuk ya da güvenlik gibi önemli konularda resmî tercüman kullanın.
• Çeviri hızı ve doğruluğu dile, ortam gürültüsüne ve cihaza göre değişir.

Abonelik bilgisi
Canlı Çeviri Sınırsız, haftalık yenilenen bir otomatik abonelik. Ödeme, satın alma onayında Apple Kimliği hesabınızdan alınır. Abonelik, geçerli dönemin bitiminden en az 24 saat önce iptal edilmedikçe kendiliğinden yenilenir; yenileme ücreti dönem bitiminden önceki 24 saat içinde hesabınızdan alınır. Aboneliğinizi satın aldıktan sonra Ayarlar > Apple Kimliğiniz > Abonelikler bölümünden yönetebilir ve iptal edebilirsiniz. Fiyat, App Store'da ve uygulama içindeki abonelik ekranında gösterilir.
Kullanım Koşulları (Apple standart sözleşmesi): https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Gizlilik Politikası: https://yilmazfatih-cyber.github.io/Deneme/canli-ceviri/gizlilik.html
Destek: https://yilmazfatih-cyber.github.io/Deneme/canli-ceviri/destek.html

AirPods, Apple Inc.'in tescilli markasıdır. Canlı Çeviri, Apple ile bağlantılı ya da Apple tarafından onaylanmış değildir.
```

Sayı: 3096 / 4000.

### 2.2 English

```
You are talking to someone face to face but you do not speak their language. Canlı Çeviri listens to what the other person says, translates it into Turkish sentence by sentence and reads the translation to you in your earbuds. The screen shows both the original sentence and its Turkish translation.

HOW IT WORKS
• Choose the source language: English, German, French, Spanish, Italian, Russian or Arabic.
• Put in your earbuds, point your iPhone toward the speaker or put it on the table, tap "Start Listening".
• The other person speaks. After a short pause (about one second) the Turkish translation is written on screen and read to you.

WHAT YOU GET
• One direction, kept simple: foreign language into Turkish. It does not translate from Turkish into another language.
• The iPhone microphone always does the listening; your earbuds' microphone is not opened, so audio quality does not drop.
• If your earbuds are not connected or disconnect, the screen says so. If listening stops, the screen says that too.
• The History tab shows that session's translations with times. History is deleted when you close the app.
• Works with Dynamic Type and VoiceOver.

PRIVACY
• For most languages, speech recognition and translation run on your iPhone; what is said does not leave your phone. A language pack downloads once on first use.
• Exceptions are shown on screen: for languages without on-device recognition, recognition runs on Apple's servers (internet required). If you enter an optional Alania key for the voice, only the Turkish translation text is sent to Alania to be spoken; the original sentence is not sent.
• No account is needed and there are no ads.

FREE AND SUBSCRIPTION
• Listen up to 10 minutes per day for free; it resets every day.
• For unlimited listening there is the Canlı Çeviri Unlimited subscription (renews weekly).
• See "Subscription information" below and the subscription screen in the app for the price.

GOOD TO KNOW
• Works with AirPods or other Bluetooth earbuds; AirPods are recommended for the best experience. Without earbuds, audio plays from the phone's earpiece.
• The app listens while the screen is on and the app is in the foreground; it does not run in the background.
• Translations are automatic and may contain errors. For medical, legal or safety matters use a professional interpreter.
• Speed and accuracy vary with language, background noise and device.

Subscription information
Canlı Çeviri Unlimited is an auto-renewing subscription that renews weekly. Payment is charged to your Apple Account at confirmation of purchase. The subscription renews automatically unless it is cancelled at least 24 hours before the end of the current period; your account is charged for renewal within 24 hours before the end of the current period. You can manage and cancel your subscription in Settings > your Apple Account > Subscriptions after purchase. The price is shown on the App Store and on the in-app subscription screen.
Terms of Use (Apple standard EULA): https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Privacy Policy: https://yilmazfatih-cyber.github.io/Deneme/canli-ceviri/gizlilik.html
Support: https://yilmazfatih-cyber.github.io/Deneme/canli-ceviri/destek.html

AirPods is a trademark of Apple Inc. Canlı Çeviri is not affiliated with or endorsed by Apple.
```

Count: 3332 / 4000.

**Doğrulanacaklar (açıklama):** (a) "Hesap açmanız gerekmez, reklam yoktur" doğru (hesap/ reklam yok; PLAN ve S03).
(b) "VoiceOver ile uyumlu": kodda var, cihazda (U-24) doğrulanmadı; doğrulanana dek bu satırı kaldırmak daha güvenli.
(c) "Dil paketi bir kez indirilir": iOS bunu kullanıcıya sorarak yapar; cihaz testinde (U-1) doğrulanacak.
(d) İlk cümledeki "ahize" ayrıntısı: ses yolu bilgisi ses-hatti.md'ye uygun, cihazda doğrulanmadı.

## 3. Yenilikler

### Sürüm 1.0

Türkçe:

```
İlk sürüm. Yabancı dilde konuşulanı dinler, Türkçeye çevirir, kulaklığınızdan okur. Günde 10 dakika ücretsiz.
```

English:

```
First release. Listens to a foreign language, translates it into Turkish and reads it to you in your earbuds. 10 minutes free every day.
```

(1.0 sürümünde "Yenilikler" alanı Apple'ca zorunlu değildir; ama kısa tutuldu. Sonraki sürümlerde değişiklik özeti
gerçek değişikliğe göre yazılır; "iyileştirmeler ve hata düzeltmeleri" kalıbı kullanılmaz.)

## 4. Ekran görüntüsü sırası

Mevcut S01 görüntüleri (`docs/sprints/S01/shots/`) simülatörden alındı: 603×1311 px, koyu görünüm, örnek veri. Mağaza
için gereken boyut (ör. 6,9 inç) ASC'den doğrulanmalı; mevcut dosyalar yükseltmeyle bulanır, **yeniden çekilmeli**.
Apple 2.3.3: görüntüler uygulamanın kullanımını göstermeli; başlık/overlay serbest. İlk iki görüntü arama sonuçlarında da
görünür; sırayı değer anına göre kurdum.

| Sıra | Kaynak görüntü | Başlık (Türkçe) | Title (English) | Not |
| --- | --- | --- | --- | --- |
| 1 | `dinliyor.png` | Karşındaki konuşur, Türkçesi kulağında | They speak. You hear Turkish. | Ana vaat; "CANLI" rozeti ve canlı yarım cümle görünüyor |
| 2 | `ceviri.png` | Cümle cümle, hem yazıyla hem sesle | Sentence by sentence, text and sound | "Şu An" ve "Öncekiler" kartları |
| 3 | **Yok, çekilecek:** dil seçimi (`-ekran` ile eklenmesi gerekebilir) | Yedi dilden Türkçeye | Seven languages into Turkish | İngilizce, Almanca, Fransızca, İspanyolca, İtalyanca, Rusça, Arapça listesi |
| 4 | `kulakliksiz.png` | Kulaklık koparsa ekran söyler | If your earbuds drop, it tells you | Açık, suçlayıcı olmayan uyarı; güven mesajı |
| 5 | `gecmis.png` **(yeniden)** | Oturumun çevirileri saatleriyle | Your session, with times | Mevcut dosyada simülatör bildirimi var ("Ready for Apple Intelligence"); bildirim geçtikten sonra yeniden çek; `gecmis-bos.png` ya da `gecmis-buyuk-yazi.png` alternatif |
| 6 | **Yok, çekilecek:** `abonelik` (S03) | Günde 10 dakika ücretsiz, sınırsız için abonelik | 10 free minutes a day. Unlimited with a subscription. | **Fiyat görüntüde olmasın** (örnek fiyatla alınan görüntü yanıltabilir); koşulu açıkça gösteren, 2.3.2 gereği |
| 7 (isteğe bağlı) | `ceviri-buyuk-yazi.png` | Büyük yazıyla da rahat okunur | Comfortable at large text sizes | Erişilebilirlik; VoiceOver doğrulanmadan "VoiceOver" yazma |

Uygunsuz/çıkarılan: `ayarlar.png` (en üstte "Alania-2 API anahtarı" ürün hissini zayıflatır; öneri 4 yapılana kadar
kullanılmasın), `tanilama*.png` (geliştirici ekranı), `ceviri-bos.png` (boş durum; mağaza için değer taşımıyor).

Görüntü kuralları: gerçek uygulama ekranları (cihaz çerçevesi isteğe bağlı), örnek cümleler **Türkçe konuşan kullanıcıya
anlamlı** olmalı (İngilizce örnekler iyi: "Please keep your ticket with you" / "Lütfen biletinizi yanınızda bulundurun");
fiyat, "ücretsiz!", yıldız/ödül yok; AirPods çizimi/logosu yok (marka; görüntüdeki "AirPods Pro bağlı" metni uygulamanın kendi
arayüzüdür, ama simgesi yok: sorun yok). Ekran görüntüsü başlıkları 2–6 kelime hedefi; çevirisi yerelleştirilmiş sayfada
aynı sırayla.

## 5. Kategori ve diğer ASC alanları

| Alan | Öneri | Gerekçe |
| --- | --- | --- |
| Birincil kategori | **Seyahat** (Travel) | Ana kullanım: seyahatte yabancı konuşma; "Referans/Verimlilik" yerine kullanıcı niyeti. Seçenek: **Yardımcı Programlar** (Utilities) ya da **Referans** |
| İkincil kategori | **Yardımcı Programlar** (Utilities) | Çeviri uygulamaları çoğunlukla Referans/Yardımcı programlar/Seyahat arasında dağılır; sıralama verisi **yok**, ikisi de denenebilir. Kategori değişikliği yeni sürümle yapılır |
| Yaş derecelendirmesi | 4+ | Kullanıcı içeriği/yetişkin içerik yok. Çeviri edilen konuşma serbest metin: ASC soruları cevaplanırken "kullanıcı tarafından oluşturulan içerik" cevabını **lider kontrol etsin** |
| Fiyatlandırma | Ücretsiz uygulama + uygulama içi abonelik | Brief: haftalık abonelik `canliceviri.sinirsiz.haftalik`, grup "Canlı Çeviri Sınırsız" |
| Şifreleme | Muaf (`ITSAppUsesNonExemptEncryption = NO`) | S03 K5 |
| İnceleme notu | Mikrofon ve konuşma tanıma izni gerekir; ilk seferde dil paketi iner; günlük sınır ve abonelik ekranına ulaşma adımı; kısa demo videosu bağlantısı (varsa) | Reddi azaltır |
| Telif / marka | "AirPods" yalnız açıklamada, marka notuyla | 2.3.7 |

## 6. Abonelik için Apple'ın istediği açıklama satırları

Apple (App Review Guidelines 3.1.2(c), Schedule 2) satın alma öncesi kullanıcıya şunların açık olmasını bekler:
abonelik adı, süresi, fiyatı; bunun karşılığında ne alındığı; yenileme/iptal koşulları; Kullanım Koşulları ve Gizlilik
Politikası bağlantıları. Bunları üç yere koyuyoruz: (a) uygulama içi abonelik ekranı, (b) açıklamanın sonu, (c) ASC alanları.

| Öğe | Metin | Nerede |
| --- | --- | --- |
| Abonelik adı | Canlı Çeviri Sınırsız | ASC ürün görünen adı + abonelik ekranı |
| Süre | Haftalık, her hafta otomatik yenilenir | Abonelik ekranı, açıklama |
| Fiyat | App Store'dan (StoreKit) okunur; kodda ve mağaza metninde **sabit fiyat yok** | Abonelik ekranı (en belirgin sayı) |
| Ne alırsınız | Günlük sınır olmadan dinleme (ücretsiz sürümde günde 10 dakika) | Abonelik ekranı, açıklama |
| Ödeme | Satın alma onayında Apple Kimliği hesabından alınır | Açıklama (yukarıdaki "Abonelik bilgisi") |
| Yenileme | Dönem bitiminden en az 24 saat önce iptal edilmezse kendiliğinden yenilenir; yenileme ücreti dönem bitiminden önceki 24 saat içinde alınır | Açıklama |
| İptal | Satın alımdan sonra Ayarlar > Apple Kimliği > Abonelikler'den yönetilir ve iptal edilir | Açıklama, abonelik ekranında kısa satır |
| Geri yükleme | "Satın alımları geri yükle" düğmesi | Abonelik ekranı ve Ayarlar |
| Kullanım Koşulları | Apple'ın standart sözleşmesi: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/ | Abonelik ekranı, Ayarlar, açıklama; ASC'de EULA alanı boş bırakılır (varsayılan sözleşme) |
| Gizlilik Politikası | https://yilmazfatih-cyber.github.io/Deneme/canli-ceviri/gizlilik.html | Abonelik ekranı, Ayarlar, açıklama; ASC "Gizlilik Politikası URL" |
| Destek | https://yilmazfatih-cyber.github.io/Deneme/canli-ceviri/destek.html | ASC "Destek URL"; açıklama |
| Ücretsiz sınır | Günde 10 dakika; abonelik gerektiren şeyin mağaza metninde belirtilmesi (2.3.2) | Açıklama, ekran görüntüsü 6 |

Uygulama içi abonelik ekranı için kısa, 6 kelimeyi aşmayan satır önerileri (Köprü'deki 6 kelime kuralı bu projeye
uygulanmaz; yine de kısa tutuldu):

- Başlık: "Sınırsız dinleyin" · Alt satır: "Haftalık abonelik. İstediğiniz zaman iptal."
- Ücret satırı: StoreKit fiyatı + "/ hafta" (en büyük puntoda)
- İptal satırı: "Ayarlar > Apple Kimliği > Abonelikler"
- Düğme: "Abone ol" · ikincil: "Satın alımları geri yükle" · "Şimdi değil"
- Bağlantılar: "Kullanım Koşulları" · "Gizlilik Politikası"

**Yapılmayacaklar (karanlık desen):** sahte aciliyet ("son 2 saat"), ön seçili plan, "ücretsiz" kelimesinin yanıltıcı
kullanımı, "Şimdi değil"i gizlemek/silik yapmak, iptal yolunu saklamak, "yıllık" eşdeğeri faturalanan tutardan büyük göstermek.

## 7. Açıklanması gereken bilinen farklar (liderin dikkatine)

- Mağaza metni "ahize" ve "arka planda çalışmaz" gibi sınırları dürüstçe yazıyor; bu bilerek: ilke 8'e uygun, iade/yorum
  riskini azaltır.
- "Çevrimdışı" kelimesi metinde **kullanılmadı**: "çoğu dilde cihazda" ifadesi yeterince doğru; cihaz doğrulaması (U-1) ve
  dil başına tablo gelince "ilk indirmeden sonra internet gerekmez (çoğu dilde)" denebilir.
- Rakip adı, "Apple'ın özelliğinde Türkçe yok" cümlesi **metne yazılmadı**: Apple eklemiş olabilir ve karşılaştırma
  iddiası yanlışlandığında geri döner. Bu bilgi yalnız iç stratejide (büyüme raporu) kullanılır.
