# Canlı Çeviri — yol haritası

## Yapılanlar

| Tarih      | İş                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| 19.11.2026 | iPhone uygulamasının ilk sürümü: Xcode projesi, üç sekme, ses hattı, dayanıklılık düzeltmeleri             |
| 23.11.2026 | AirPods durum satırı; web deneme sürümü ve akış testi; `/canli-ceviri/` altında yayın                       |
| 25.11.2026 | Mac derleme iş akışı: uygulama ilk kez derlendi (Xcode 26.6; derleyici hatası ve uyarısı yok); ekip ve anayasa kuruldu |
| 25.11.2026 | S01: ses hattı ve tasarım şartnameleri, Tanılama (iPhone ve web), Anahtar Zinciri, aşama (hazırlanıyor / dinliyor / duraklatıldı), erişilebilirlik ve büyük yazı, cihaz testi belgesi; Mac derlemesi Debug ve Release, uyarıda kırılır; 13 simülatör görüntüsü |

## Sprintler

| Sprint | Hedef                                                                                                   | Durum   |
| ------ | ------------------------------------------------------------------------------------------------------- | ------- |
| S01    | Cihaz denemesine hazır sürüm: bağımsız kod incelemesi, Tanılama, anahtarın Anahtar Zinciri'nde saklanması, erişilebilirlik, simülatör ekran görüntüleri, cihaz testi belgesi | otomatik kapı ve uzman incelemesi geçti; **insan kapısını bekliyor** (`docs/sprints/S01/demo.md`) |
| S02    | Cihaz denemesinden çıkan sorunlar (proje sahibinin `docs/cihaz-testi.md` sonuçlarına göre)               | bekliyor |

## Birikim (öncelik sırasıyla)

### Cihaz denemesinin sonucuna bağlı (S02 adayları)

- Görüşme sürerken uygulamaya dönülünce dinlemenin hatayla bitmesi yerine görüşmenin bitmesini beklemek
  (`ses-uzmani-2` Ön-4). iOS'un bu durumda verdiği hata kodu cihazda görülmeden davranış değiştirilmez (KR4);
  Tanılama satırı eklendi.
- Tanıyıcının oturum ortasında kullanılamaz hâle gelmesini izlemek (`ses-uzmani-1` Ön-8, şartname T4). Uzun vadede
  iOS 26'daki `SpeechAnalyzer` / `SpeechTranscriber` uzun konuşma için değerlendirilebilir (uygunluğu doğrulanmadı).
- Hazırlık sürerken uygulama arka plana giderse başlatmayı ön plana dönüşe ertelemek (`ses-uzmani-2` Ön-12).
- Tanılama'da dil paketi için "hazır" ile "indirildi" ayrımı (`ses-uzmani-2` Ön-7a).
- Uygulama silinip yeniden kurulunca Anahtar Zinciri'nde kalan eski anahtarın temizlenmesi (`ses-uzmani-2` Ön-10d).
- Web sürümünde yazı boyutlarını `rem` ile vermek ve tarayıcının yazı büyütmesine uymak (`arayuz-denetcisi-1` B-18).
- Art arda iki kesintide (arama + alarm) bekleyen yeniden denemenin geçersiz kılınması (`ses-uzmani-3` Z-7).
- Tanılama'da `kesinti  bitti` satırının yalnız dinleme gerçekten sürünce yazılması (`ses-uzmani-3` Z-6; cihaz testi
  belgesindeki satır adlarıyla birlikte değişir).
- Anahtar Anahtar Zinciri'ne yazılamazsa Ayarlar'da söylenmesi; taşıma yazılamazsa eski değerin o oturumda
  kullanılması (`ses-uzmani-3` Z-8, `kalite-sorumlusu-1` Q-8, Q-9).
- Kullanıcı dil paketini indirmeyi reddedince doğru yol gösteren ileti ve "Dil paketi indiriliyor…" aşaması
  (`kalite-sorumlusu-1` Q-12).
- Paket kimliği `com.example…`: Xcode ücretsiz hesapta itiraz ederse değiştirilir (`kalite-sorumlusu-1` Q-16).
- Web'de Safari'nin `start` / `audiostart` sırası görülünce hazırlık geçişinin yeniden ayarlanması (KR15, D34).

### Küçük iyileştirmeler (S01 incelemelerinden)

- Sarı notlardan en çok ikisini göstermek; web'de çeviri notunun Alania notunu silmemesi (`arayuz-denetcisi-2` C-9b,
  `kalite-sorumlusu-2` R-1).
- Tanılama 300 olay sınırında oturumun ilk satırlarını korumak (`kalite-sorumlusu-1` Q-6).
- Web'de Alania anahtarının saklanması: ön ekli anahtar adları ya da yalnız oturum süresince saklama; köken aynı
  hesabın bütün Pages siteleriyle ortak (`kalite-sorumlusu-1` Q-10).
- Ayarlar'da "Tanılama kaydı" satırı iPhone 17'de ilk ekranda görünmüyor (kaydırmak gerekiyor); en büyük yazıda
  Ayarlar'ın bölüm başlıkları çok büyüyor.
- Canlı metnin yanına kulak simgesi (`arayuz-denetcisi-2` C-10).
- `docs/tasarim.md` § 4.1.1'de `ceviri-buyuk-yazi-ax3` için boyut adı düzeltilecek (accessibility-extra-large).

### Yeni özellikler

- Çift yönlü konuşma: kişinin Türkçe söylediğini karşı tarafın diline çevirip telefonun hoparlöründen okumak.
- Arka planda ve ekran kilitliyken dinleme (ses arka plan kipi; gizlilik göstergesi ve pil etkisiyle birlikte düşünülmeli).
- Mac'siz kurulum: derlemeden imzasız `.ipa` üretmek ya da TestFlight (ücretli geliştirici hesabı gerekir).
- Geçmişi isteğe bağlı saklama ve dışa aktarma.
- Kaynak dili kendiliğinden tanıma.
- Web sürümünde çeviriyi cihazda yapma (tarayıcı desteklediğinde) ve mikrofon seçimi.
- Daha çok kaynak dil; hedef dilin seçilebilmesi.

### Altyapı

- iPhone uygulamasının saf mantığı (cümle ayırma sayaçları, kimlik denetimleri, Tanılama biçimi) için birim testleri;
  bugün iOS tarafında otomatik test yok, yalnız derleme ve simülatör görüntüsü var.
- Mac iş akışında simülatörün ilk açılışı yaklaşık 7 dakika sürüyor; görüntü adımını yalnız arayüz dosyaları
  değişince çalıştırmak.
- Simülatörün kendi sistem bildirimi ekran görüntüsüne girebiliyor (S01'de `gecmis.png`); görüntüden önce bildirimin
  geçmesini beklemek ya da görüntüyü yinelemek.
- Web akış testinin gerçek Safari'den cömert olduğu yerler (otomatik oynatma, sahte hizmetlerin CORS izni); gerçek
  Alania'nın tarayıcıdan çalışması hiç sınanmıyor (`kalite-sorumlusu-1` Q-18).
