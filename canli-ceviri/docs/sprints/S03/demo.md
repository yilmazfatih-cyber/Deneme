# S03 demo notu — ödeme, mağaza hazırlığı ve indirilebilir uygulama

Tarih: 26.11.2026 · Dal: `claude/epic-lovelace-lp6yyh` · Son derlenen commit: `3ff4c3d`

## Kısaca

- Uygulamaya haftalık abonelik ve günde 10 dakikalık ücretsiz kullanım eklendi (StoreKit 2; sunucu ve hesap yok).
- Uygulama indirilebilir bir `.ipa` dosyası olarak yayımlanıyor:
  https://github.com/yilmazfatih-cyber/Deneme/releases (adı `canli-ceviri-deneme-…` ile başlayan en yeni sürüm).
- App Store'a giden yol yazıldı (`docs/yayin.md`) ve TestFlight'a yükleyen iş akışı hazır.
- **Gerçek iPhone'da hiçbir şey denenmedi; ödeme hiçbir ortamda denenmedi; TestFlight iş akışı hiç çalıştırılmadı.**

## Ne doğrulandı, ne doğrulanmadı

| Konu                                   | Durum                                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| Derleme (Debug ve Release, simülatör)  | Geçti: hata ve uyarı yok (Xcode 26.6, iş akışı çalışması 14)                              |
| Gerçek cihaz için imzasız `.ipa`       | Üretildi; dosya indirilip içi okundu (arm64, iOS 18+, deneme bayrağı içinde)              |
| `.ipa` dosyasının bir iPhone'a kurulması | **Denenmedi**                                                                            |
| Abonelik ekranı, süre doldu ekranı     | Simülatör görüntüsü var (`shots/`); satın alma **denenmedi**                              |
| Mikrofon, tanıma, çeviri, AirPods sesi | **Denenmedi** (yalnız gerçek cihazda denenebilir; `docs/cihaz-testi.md`)                  |
| TestFlight'a yükleme                   | **Hiç çalıştırılmadı** (Apple Developer hesabı yok)                                        |
| Ödeme kodunun bağımsız incelemesi (KR4) | **Yapılmadı**; mağazaya göndermeden önce yapılmalı                                        |

## Sizden beklenenler (sırayla)

1. **Uygulamayı telefona kurun:** `README.md` → "Xcode'suz kurulum: hazır `.ipa`" (Sideloadly, bir kez bilgisayar ve
   kablo ister). Sonra `docs/cihaz-testi.md` → U-0 ve U-1. Olmayan her adım için ekran görüntüsü ve **Ayarlar →
   Tanılama kaydı → Kopyala** metni yeter.
2. **Apple Developer hesabı açın** (yılda 99 ABD doları): `docs/yayin.md` → 1 ve 2. Kimlik ve ödeme sizin adınıza
   yapıldığı için bu adımı kimse sizin yerinize yapamaz.
3. Hesap onaylanınca: `docs/yayin.md` → 3, 4 ve 5b. O noktadan sonra uygulama telefona TestFlight'tan, bilgisayarsız
   kurulur ve abonelik gerçek ortamda denenebilir.

## Sizin karar vereceğiniz konular

Ayrıntı `docs/buyume/2026-11-25.md` içinde: mağazadaki ad (alınmış olabilir), haftalık fiyat, gizlilik beyanı.

## Açık kalanlar

- Deneme `.ipa` dosyasında abonelik çalışmaz; bu yüzden o yapıda günlük süre sınırı kapalıdır. Mağaza ve TestFlight
  yapılarında sınır 10 dakikadır.
- S02 (bulut motoru, Soniox) isteğinizle beklemede.
