# Çeviri — AirPods'a canlı Türkçe çeviri

Karşınızdaki yabancı dilde konuşur; iPhone dinler, Apple'ın telefondaki çeviri motoru Türkçeye çevirir,
Türkçesi **AirPods'tan sesli** gelir ve ekranda büyük yazıyla görünür.

Apple'ın AirPods canlı çevirisi (iOS 26) Türkçeyi kapsamıyordu; bu uygulama aynı işi Türkçe için yapar.
Arayüz koyu, sade ve büyük yazılıdır: lacivert zemin, mavi parıltı, yuvarlak kartlar, altta yüzen sekme çubuğu.

## Ekranlar

| Sekme   | Neler var                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------ |
| Çeviri  | Dil şeridi (İngilizce → Türkçe), "Şu An" kartı: o an söylenen söz ve son çeviri, ses düzeyi, Başlat/Durdur   |
| Geçmiş  | Çevrilen cümleler saatleriyle; her kartta yeniden dinle düğmesi; "Temizle" (onay ister)                      |
| Ayarlar | Kadın/erkek ses, sesli okuma açık/kapalı, Alania-2 anahtarı, mikrofon (iPhone/kulaklık), kilit ekranı        |

Dinlenen diller: İngilizce, Almanca, Fransızca, İspanyolca, İtalyanca, Rusça, Arapça.

## Kurulum

Gerekenler: Xcode 16 ya da üstü olan bir Mac, iOS 18 ya da üstü bir iPhone, Apple hesabı (ücretsiz hesap yeter).

1. `ceviri/Ceviri.xcodeproj` dosyasını Xcode ile açın.
2. Soldan **Ceviri** projesini, sonra **TARGETS › Ceviri**'yi seçin. **Signing & Capabilities › Team** kısmında kendi
   hesabınızı seçin. (Paket kimliği seçtiğiniz ekibe göre kendiliğinden benzersiz olur.)
3. iPhone'u kabloyla bağlayın, Xcode'un üstündeki cihaz listesinden seçin ve ▶︎ düğmesine basın.
4. İlk kez kuruyorsanız iPhone'da:
   - **Ayarlar › Gizlilik ve Güvenlik › Geliştirici Modu**'nu açın (telefon yeniden başlar).
   - **Ayarlar › Genel › VPN ve Aygıt Yönetimi**'nde kendi Apple hesabınıza güvenin.

Ücretsiz hesapla imzalanan uygulama 7 gün sonra açılmaz olur; Xcode'dan yeniden ▶︎ demek yeter.

Kendi projenize eklemek isterseniz yalnızca `Ceviri/CeviriApp.swift` yeterli; adımlar dosyanın başında yazılı.

## Kullanım

1. AirPods'u takın. "Çeviri" ekranının üstünde kulaklığın adı yeşil görünür.
2. Mavi şeritten konuşulan dili seçin.
3. **Dinlemeyi Başlat**'a dokunun. İlk seferde mikrofon ve konuşma tanıma izni istenir; dil dosyaları telefonda yoksa
   Apple bir kez indirmeyi önerir.
4. Telefonu konuşan kişiye doğru tutun. Her cümlenin Türkçesi kulaklığınızdan gelir ve ekranda yazar.

Kulaklık yoksa ses telefonun hoparlöründen çıkar; o sırada mikrofon kendi sesini yeniden çevirmesin diye kısa süre kısılır.
Konuşan çok hızlıysa okuma biraz hızlanır, birikme olursa eski cümleler atlanır (yazıları ekranda ve Geçmiş'te kalır).

## Ses

- **Apple'ın Türkçe sesi** varsayılandır; anahtar gerekmez. Telefonda Türkçe erkek ses yoksa kadın ses kullanılır
  (iPhone Ayarları › Erişilebilirlik › Seslendirilen İçerik › Sesler › Türkçe'den ses indirilebilir).
- **Alania-2** (PatientDesk AI'ın Türkçe ses modeli) isteğe bağlıdır. Anahtar `speech.patientdesk.ai` adresinden alınır
  (`pd_live_…`). Anahtar girilince çeviri metni seslendirme için PatientDesk sunucusuna gönderilir; kadın için
  `alania2-f1`, erkek için `alania2-oncel` sesi kullanılır. Anahtar kabul edilmez, kota dolar ya da sunucuya
  ulaşılamazsa uygulama Apple sesine döner ve nedenini Ayarlar'da yazar.

## Gizlilik

- Konuşma tanıma, dil destekliyorsa telefonun içinde yapılır; desteklemiyorsa Apple'ın sunucusu kullanılır.
- Çeviri Apple'ın Translation çatısıyla telefonda yapılır.
- Geçmiş yalnızca telefonda (uygulamanın Belgeler klasöründe) durur; Alania-2 anahtarı Anahtar Zinciri'nde saklanır.
- Reklam, hesap ve analitik yoktur.

## Bilinen sınırlar

- Kod burada (Linux'ta) Apple çatılarının taklitlerine karşı denetlendi; **gerçek Xcode derlemesi ve iPhone denemesi
  yapılmadı**. İlk derlemede hata çıkarsa iletisini paylaşın.
- Apple'ın çeviri motoru simülatörde çalışmaz; gerçek iPhone gerekir.
- **Telefon kilitliyken sürdür** seçeneği deneyseldir: hazır projede arka planda ses izni açıktır, ancak iOS'un
  konuşma tanımayı ve çeviriyi kilit ekranında ne kadar sürdürdüğü denenmedi. Kapalıyken uygulamadan çıkınca dinleme durur.
- Alania-2'nin istek biçimi herkese açık belgelerden alındı; gerçek anahtarla denenmedi.
- Konuşma tanıyıcı cümleyi bazen geç düzeltir; çok kısa duraklamalarda bir cümle iki parça hâlinde çevrilebilir.

## Klasör yapısı

```
ceviri/
  Ceviri.xcodeproj/        hazır Xcode projesi (araclar/xcode_projesi.rb üretir)
  Ceviri/
    CeviriApp.swift        uygulamanın tamamı (tek dosya)
    Info.plist             mikrofon/konuşma izin metinleri, arka planda ses
    Assets.xcassets/       uygulama simgesi ve vurgu rengi
  denetim/
    calistir.sh            Xcode'suz denetim (aşağıya bakın)
    cekirdek_testi.swift   cümle bölme ve WAV onarımı testleri
    taklit/                tip denetimi için Apple çatılarının taklitleri
  araclar/
    xcode_projesi.rb       Xcode projesini üretir (gem install xcodeproj)
    simge.svg              uygulama simgesinin kaynağı
    simge_ciz.mjs          simge.svg → AppIcon.png (Playwright)
```

## Denetim (Xcode gerekmez)

```bash
ceviri/denetim/calistir.sh
SWIFT_IMAJLARI="swift:6.0 swift:6.2 swift:latest" ceviri/denetim/calistir.sh
```

1. `CeviriApp.swift` içindeki `>>> CEKIRDEK … <<< CEKIRDEK` bölümü (konuşmayı cümlelere bölen `Parcalayici`, akış WAV
   başlığını onaran `DalgaDosyasi`) yalnızca Foundation ile derlenir ve `cekirdek_testi.swift` ile sınanır.
2. Uygulamanın tamamı, Apple çatılarının taklitlerine karşı Swift 5, Swift 5 + tam eşzamanlılık denetimi ve Swift 6
   kiplerinde derlenir (Swift 6'nın veri yarışı denetimleri dahil). Swift 6.2 ve üstünde Xcode 26'nın yeni proje
   ayarları (MainActor varsayılanı, "Approachable Concurrency") da denenir.

Linux'ta yerel `swiftc` ya da Docker gerekir; macOS'ta taklitler gerçek çatılarla çakışacağı için yalnızca 1. adım çalışır.
GitHub'da `ceviri/` değişince `.github/workflows/ceviri.yml` aynı denetimi çalıştırır.
