# Canlı Çeviri — ürün planı

## Ne ve kimin için

Yabancı dil konuşan biriyle yüz yüze konuşan, Türkçe bilen bir kişi için. Kişi AirPods'unu takar, iPhone'u karşısındakine
doğru tutar ya da masaya koyar; karşısındaki konuşur, uygulama cümle cümle Türkçesini kulağına okur. Ekran aynı
çeviriyi yazıyla da gösterir.

Bu, Apple'ın AirPods ile canlı çeviri özelliğinin Türkçesi olmayan yerde kullanılacak, tek yönlü (dinle → Türkçeye çevir)
bir araçtır. Karşı tarafa Türkçeden çeviri bu sürümün işi değildir.

## Akış

```
iPhone mikrofonu → konuşma tanıma (cihazda) → çeviri (cihazda) → Türkçe ses → AirPods
                                                    └→ ekranda asıl cümle + Türkçesi
```

1. **Hazırlık:** Kişi kaynak dili seçer (İngilizce, Almanca, Fransızca, İspanyolca, İtalyanca, Rusça, Arapça).
2. **Başlat:** İlk seferde dil paketi iner, mikrofon ve konuşma tanıma izni istenir.
3. **Dinleme:** Söylenen cümle ekranda canlı yazılır. 1,2 saniye sessizlik cümleyi bitirir.
4. **Çeviri:** Biten cümle Türkçeye çevrilir, ekranda büyük yazıyla görünür, kulaklıktan okunur.
5. **Durdur:** Mikrofon kapanır, bekleyen sesler atılır, diğer uygulamaların sesi geri gelir.

## Ekranlar

| Sekme   | İçerik                                                                                                    |
| ------- | --------------------------------------------------------------------------------------------------------- |
| Çeviri  | Kaynak dil, o an söylenen cümle, son çeviri, önceki üç çeviri, kulaklık durumu, Başlat / Durdur          |
| Geçmiş  | Bu oturumun çevirileri saatleriyle; Temizle                                                               |
| Ayarlar | Alania-2 API anahtarı, ses seçimi, nasıl çalışır, Tanılama (sorun bildirmek için cihazda tutulan olay kaydı) |

## Sınırlar (bilerek yapılmayanlar)

- **Çift yönlü konuşma yok.** Yalnız karşıdakini dinler ve Türkçeye çevirir.
- **Geçmiş saklanmaz.** Çeviriler uygulama kapanınca silinir; konuşma kaydı telefonda birikmez.
- **Arka planda çalışmaz.** Ekran açıkken ve uygulama öndeyken dinler; ekranın kararmasını kendisi engeller.
- **Hoparlörden okumaz.** Kulaklık yoksa ses ahizeden gelir; hoparlör mikrofonun kendi sesini duymasına yol açardı.
- **App Store'da değil.** Xcode ile kişinin kendi telefonuna yüklenir.

## İki sürüm

| Sürüm            | Yer                     | Ne için                                                                                       |
| ---------------- | ----------------------- | --------------------------------------------------------------------------------------------- |
| iPhone uygulaması | `CanliCeviri.xcodeproj` | Asıl ürün. Tanıma ve çeviri cihazda, mikrofon iPhone'un, ses AirPods'ta yüksek kalitede.      |
| Web deneme sürümü | `web/`                  | Kurulumsuz deneme. Çeviri internetten (MyMemory), mikrofonu tarayıcı seçer; ilkeleri sağlayamaz. |

Web sürümü iPhone uygulamasının yerine geçmez; arayüzü ve akışı Xcode kurmadan göstermek içindir.

## Doğrulama gerçeği

Bulut oturumunda Xcode, iPhone ve AirPods yoktur. Bu yüzden üç doğrulama düzeyi ayrı tutulur:

1. **Mac derlemesi** (GitHub Actions): kod derleniyor mu, uyarı var mı, ekranlar simülatörde nasıl görünüyor.
2. **Sahte servislerle test:** web sürümünün akışı (tanıma, cümle sonu, çeviri, ses, hata yolları).
3. **Gerçek cihaz** (proje sahibi): mikrofon, tanıma, çeviri, AirPods ses yolu, kesintiler. Adımları
   `docs/cihaz-testi.md` içindedir; sorun olursa Tanılama kaydı gönderilir.
