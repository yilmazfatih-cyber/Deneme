# Canlı Çeviri — yol haritası

## Yapılanlar

| Tarih      | İş                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| 19.11.2026 | iPhone uygulamasının ilk sürümü: Xcode projesi, üç sekme, ses hattı, dayanıklılık düzeltmeleri             |
| 23.11.2026 | AirPods durum satırı; web deneme sürümü ve akış testi; `/canli-ceviri/` altında yayın                       |
| 25.11.2026 | Mac derleme iş akışı: uygulama ilk kez derlendi (Xcode 26.6, hatasız ve uyarısız); ekip ve anayasa kuruldu |
| 25.11.2026 | S01: ses hattı ve tasarım şartnameleri, Tanılama (iPhone ve web), Anahtar Zinciri, aşama (hazırlanıyor / dinliyor / duraklatıldı), erişilebilirlik, ilk simülatör görüntüleri |

## Sprintler

| Sprint | Hedef                                                                                                   | Durum   |
| ------ | ------------------------------------------------------------------------------------------------------- | ------- |
| S01    | Cihaz denemesine hazır sürüm: bağımsız kod incelemesi, Tanılama, anahtarın Anahtar Zinciri'nde saklanması, erişilebilirlik, simülatör ekran görüntüleri, cihaz testi belgesi | sürüyor |
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
