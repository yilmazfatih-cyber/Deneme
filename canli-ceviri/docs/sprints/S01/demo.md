# S01 demo notu — cihaz denemesine hazır sürüm

Tarih: 25.11.2026 · Dal: `claude/epic-lovelace-lp6yyh` · Sürüm etiketi: **`S01 tur 4`** (Tanılama kopyasının başında yazar)

## Kısaca

- iPhone uygulaması GitHub'ın Mac makinelerinde derleniyor ve ekranları gerçek iOS simülatöründe görüldü.
- Kod, yazandan bağımsız üç uzman tarafından altı incelemede okundu: 5 Engel, 44 Önemli bulgu çıktı; bu sprintte
  kapananların durumu aşağıdaki tabloda.
- Uygulama ve web sürümü artık olan biteni telefonda kaydediyor (**Tanılama**). Bir şey çalışmazsa kaydı kopyalayıp
  göndermeniz yeterli; nedenini oradan okuyacağız.
- **Gerçek iPhone ve AirPods ile hiçbir şey denenmedi.** Mikrofon, konuşma tanıma, çeviri ve AirPods ses yolu yalnız
  sizin telefonunuzda doğrulanabilir. Bu sprintin işi o denemeyi verimli kılmaktı.

## Nasıl denenir

Adımların tamamı `docs/cihaz-testi.md` içinde. Acele ediyorsanız yalnız şu ikisi:

1. **Web (yalnız telefon yeter, 6 dakika):** iPhone'da Safari ile
   https://yilmazfatih-cyber.github.io/Deneme/canli-ceviri/ adresini açın; **W-0** (hangi sürüm açık) ve **W-1** (dinle,
   çevir, kulakta duy).
2. **iPhone uygulaması (Mac ve Xcode gerekir, 10 dakika):** `README.md` → "Çalıştırma"; sonra **U-0** ve **U-1**.

Her "olmadı" için: senaryo numarası + ekran görüntüsü + **Ayarlar → Tanılama kaydı → Kopyala** ile alınan metin.

## Ne yapıldı

| İş                    | Çıktı                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Ses hattı şartnamesi  | `docs/ses-hatti.md`: ses yolu, durum makinesi, cümle ayırma, 16 kesinti senaryosu, cihazda sorulacak 35 soru                    |
| Tasarım şartnamesi    | `docs/tasarim.md`: renkler ve ölçülmüş karşıtlık oranları, yazı ölçeği, bileşenler, ekranlar, VoiceOver etiketleri              |
| Aşama                 | Ekran tek satırda söyler: Hazırlanıyor… / Dinliyorum… / Duraklatıldı: neden. "Dinliyorum" yalnız mikrofon gerçekten açıkken     |
| Tanılama              | iPhone ve web: olay kaydı, Kopyala, Temizle. Konuşma ve çeviri metni, cihaz adı ve anahtar **yazılmaz**                         |
| Anahtar Zinciri       | Alania anahtarı artık telefonun Anahtar Zinciri'nde; eski kurulumdaki değer taşınır                                             |
| Kesintiler            | Arama, arka plan, AirPods takıp çıkarma, mikrofondan ses gelmemesi: her biri ekranda söylenir, sessizce bozulmaz                |
| Erişilebilirlik       | VoiceOver etiketleri ve duyuruları, en az 44 pt dokunma alanı, büyük yazıda çevirinin ekranda kalması                           |
| Mac iş akışı          | Derleme (Debug ve Release; uyarı işi kırar) + simülatörde 13 ekran görüntüsü → `docs/sprints/S01/shots/`                        |
| Web deneme sürümü     | Aynı aşama ve Tanılama; akış testi sahte tanıma, çeviri ve sesle uçtan uca dener                                                |
| Cihaz testi belgesi   | `docs/cihaz-testi.md`: web için W-0…W-9, uygulama için U-0…U-25; her senaryoda yap / beklenen / olmazsa                         |
| Ekip                  | Altı ajan (`.claude/agents/`), anayasa (`CLAUDE.md`), `/ceviri` komutu                                                          |

## Kabul kriterleri

| No  | Kriter (kısaca)                                             | Durum | Kanıt                                                                                                      |
| --- | ----------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------- |
| K1  | Mac derlemesi yeşil, hatasız ve uyarısız                    | ✓     | Çalıştırma 45696954433 (`1e308ea`): Debug ve Release, hata 0, uyarı 0. İş akışı artık uyarıda kırılıyor |
| K2  | Simülatör görüntüleri; kesilen metin ve taşma yok           | ✓     | `shots/`: sekiz ekran + beş büyük yazı görüntüsü (iPhone 17, iOS 26.5). Lider tek tek baktı; bkz. "Bilinen açıklar" |
| K3  | iPhone Tanılama içerik ve cihaz adı tutmaz; 300 olay        | ✓     | `kalite-sorumlusu-1.md`: 47 kayıt çağrısının her biri okundu; `tanilama.png`                                |
| K4  | Web Tanılama aynı olayları tutar; kayıtta cümle yok         | ✓     | `web-akis.cjs` bölüm 21                                                                                     |
| K5  | Anahtar Anahtar Zinciri'nde; eski değer taşınır             | ✓     | `Anahtarlik.swift`; `kalite-sorumlusu-1.md`, `-2.md`                                                        |
| K6  | VoiceOver etiketleri, 44 pt dokunma alanı                   | ✓ kodda | `arayuz-denetcisi-2.md` K6. VoiceOver'ın gerçekte ne okuduğu cihazda: U-24                                |
| K7  | Ses incelemesi: Engel yok, Önemliler kapandı                | ✓     | `ses-uzmani-3.md` + `kalite-sorumlusu-2.md` (Z-1, Z-2, Z-9 kapalı)                                          |
| K8  | Arayüz incelemesi: Engel yok; karşıtlıklar hesaplı          | ✓     | `arayuz-denetcisi-2.md` + `kalite-sorumlusu-2.md`; C-6 son görüntüde yeniden ölçüldü: 6,25:1 (önce 2,38:1)       |
| K9  | Web testi yeşil; 320 / 360 / 390 / 1280 px'te taşma yok     | ✓     | `node tests/web-akis.cjs`: 220 geçti, 0 kaldı                                                               |
| K10 | Cihaz testi belgesi; her kesinti ve cihaz sorusu kapsanıyor | ✓     | `docs/cihaz-testi.md` → "§ 7 karşılık tablosu" (D1–D35, K1–K16)                                             |
| K11 | Kalite incelemesi: Engel yok; her satır kanıtlı             | ✓     | `kalite-sorumlusu-2.md`: 38 bulgunun 38'i kapalı, yeni Engel ve Önemli yok                                  |
| K12 | Depo denetimi temiz                                         | ✓     | `npm run check`: çıkış 0                                                                                    |

## Neyin nerede doğrulandığı (ilke 8)

| Düzey                              | Ne kanıtlıyor                                                                  | Ne kanıtlamıyor                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Mac derlemesi (GitHub Actions)     | Kod Xcode 26.6 ile hatasız ve uyarısız derleniyor (Debug ve Release)           | Çalıştığını; eski Xcode sürümleriyle derlendiğini                        |
| Simülatör görüntüleri              | Ekranlar gerçek iOS'ta böyle çiziliyor (örnek verilerle, koyu görünüm)         | Mikrofon, tanıma, çeviri, ses: simülatörde hiçbiri çalıştırılmadı        |
| Web akış testi (Chromium, sahte servisler) | Cümle sonu, çeviri sırası, ses sırası, hata yolları, aşamalar, Tanılama içeriği | Safari'nin davranışını; gerçek tanımayı, MyMemory'yi, Alania'yı, AirPods'u |
| Kod incelemeleri                   | Mantık üç bağımsız gözle okundu; bulgular dosya ve satırıyla yazılı            | Okuyanların "emin değilim" dediği iOS davranışlarını (35 cihaz sorusu)   |
| **Gerçek iPhone + AirPods**        | **Henüz hiçbir şey**                                                           |                                                                          |

## Bilmeniz gereken kararlar

Tasarımınıza dokunan ya da sizin adınıza verilen kararlar; istemediğiniz olursa söyleyin, geri alınır.

1. **Renkler (KR6):** okunabilirlik için dört renk çok az koyulaştırıldı / açıldı (beyaz yazılı mavi ve kırmızı düğmeler,
   mavi metin, hata metni). Fark gözle neredeyse seçilmez; lacivert tema aynı.
2. **Dinlerken dil şeridi (KR7):** dinleme sürerken şerit tek satıra iner ki çeviri küçük ekranda görünür kalsın.
3. **Geçmiş'te Temizle (KR9):** silmeden önce sorar; listenin altında "Geçmiş uygulama kapanınca silinir." yazar.
4. **Cihazda tanınmayan diller (KR2):** özgün tasarımınızdaki gibi dinleme reddedilmez, tanıma Apple'ın sunucusunda
   yapılır; ekran bunu sarı notla söyler. Bu dillerde internet gerekir.
5. **Büyük yazı (KR18):** telefonun yazı boyutu çok büyütülünce yalnız çeviri metni büyür; başlık, dil şeridi, düğme ve
   sekme çubuğu bir sınırda durur. Yoksa çeviri ekrana sığmıyordu.
6. **Alania bildirimi (KR17):** Ayarlar'da artık "Anahtar girerseniz çeviri metni seslendirmek için Alania'ya
   gönderilir; söylenen asıl cümle gönderilmez." yazıyor.
7. **Web'de "Dinliyorum" (KR15):** tarayıcı mikrofonu açtığını bildirene ya da ilk kelime gelene dek ekran
   "Hazırlanıyor…" der. Safari bu bildirimi vermiyorsa ekran ilk kelimeye dek öyle kalabilir; cihaz testinde görülecek.

## Bilinen açıklar

- **Gerçek cihazda hiçbir şey denenmedi.** Yukarıdaki ✓'lerin hiçbiri "telefonda çalışıyor" demek değildir.
- **Yayındaki web sürümü eski ve bir hata taşıyor:** birkaç cümlelik bir dinlemeden sonra Tanılama sayfası açılınca ekran
  kayıyor, "Bitti" görünmüyor (Chromium'da ölçüldü; Safari'de denenmedi). Bu sürümde düzeltildi; siz onaylayıp yayına
  alınana dek yayındaki sayfada "Kopyala" yine çalışır, sonra sayfayı yenilemek gerekir.
- **Web yalnız Chromium'da denendi.** Safari'nin mikrofonun açıldığını ne zaman bildirdiği bilinmiyor (D34); bildirmezse
  ekran ilk kelimeye dek "Hazırlanıyor…" ya da "Mikrofon bekleniyor…" der.
- **Web'de Alania sesi gerçek hizmetle hiç denenmedi** (test sahte hizmet kullanıyor): W-6.
- **Paket kimliği** `com.example…` ile başlıyor; Xcode ücretsiz hesapta itiraz ederse U-0'daki adımı izleyin.
- **En büyük yazı boyutunda** Ayarlar'da bölüm başlıkları çok büyüyor (kaydırarak kullanılır); iPhone 17'de Ayarlar'ın
  "Tanılama kaydı" satırı ilk ekranda görünmüyor, biraz kaydırmak gerekiyor.
- **iPhone tarafında otomatik test yok;** yalnız derleme ve ekran görüntüsü var.
- **`shots/gecmis.png`:** üstte simülatörün kendi sistem bildirimi görünüyor ve başlığı örtüyor; uygulamanın hatası
  değil. Başlık ve "Temizle" aynı derlemenin `gecmis-buyuk-yazi.png` görüntüsünde görülüyor.
- **Önceki "uyarısız" derlemeler:** derleyici uyarısı yoktu, ama xcodebuild'in bir mimari uyarısı kayıtta görünmeden
  duruyordu. Bu sprintte nedeni giderildi; artık her uyarı işi kırıyor.
- **Belge:** `docs/tasarim.md` § 4.1.1 `ceviri-buyuk-yazi-ax3` için boyut adını yanlış yazıyor (doğrusu
  accessibility-extra-large); görüntü doğru boyutta alındı.

## Sizden beklenenler

1. **Yayın onayı:** bu sürümün varsayılan dala birleştirilip GitHub Pages'te yayınlanması için onayınız gerekiyor.
2. **Cihaz denemesi:** yukarıdaki iki kısa senaryo; sonuç ve Tanılama kopyası bir sonraki sprintin (S02) girdisi.
3. **Mac'iniz var mı?** iPhone uygulaması telefona yalnız Mac ve Xcode ile yüklenebiliyor. Yoksa söyleyin: Mac'siz kurulum
   (TestFlight; ücretli geliştirici hesabı gerekir) birikimde, öne alınır.

## Birikime düşenler

`docs/ROADMAP.md` → Birikim. Bu sprintten gelenler: görüşme sürerken uygulamaya dönünce beklemek (cihazdaki hata kodu
görülünce), tanıyıcının oturum ortasında kullanılamaz olması, Tanılama'nın uzun oturumda kaydın başını tutması, web'de
anahtarın saklanma biçimi, sarı notların en çok ikisinin gösterilmesi, iPhone tarafı için birim testleri.

## Süreç notu

- Üç düzeltme turunun üçü de kullanıldı. Üçüncü tur iki ek gönderim gerektirdi: iş akışının yakaladığı mimari uyarısı ve
  görüntüde etkisiz çıkan yer tutucu düzeltmesi (ölçülünce 1,44:1'e gerilemişti; yedek çözümle 6,25:1 oldu).
- Son doğrulama: `kalite-sorumlusu-2.md` (38 bulgunun 38'i kapalı) ve son derlemenin 13 görüntüsüne liderin tek tek
  bakması.
- Alt görev bütçesi aşıldı: 12 yerine 14 (KR20). Neden: iPhone işi iki adıma bölündü ve ses hattı üç tur incelendi.
- Altı incelemenin tamamı `docs/sprints/S01/reviews/` altında; kararlar `brief.md` → KR1–KR20.
