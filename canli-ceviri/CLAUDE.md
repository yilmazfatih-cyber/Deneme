# Canlı Çeviri — ortak anayasa

Canlı Çeviri, karşıdaki kişinin konuşmasını iPhone mikrofonuyla dinleyen, cümle cümle Türkçeye çeviren ve çeviriyi
AirPods'tan okuyan iOS uygulamasıdır. `web/` altında aynı arayüzle tarayıcıda çalışan bir deneme sürümü vardır.
Ürün planı: `docs/PLAN.md` · Yol haritası: `docs/ROADMAP.md` · Ekip ve akış: `docs/EKIP.md` · Sprintler: `docs/sprints/`.

Bu dosya `canli-ceviri/` klasörü içindir; depo kökündeki `CLAUDE.md` Köprü'nün anayasasıdır ve buraya uygulanmaz.

## Sekiz ilke (her inceleme bunlara göre yapılır)

1. **Önce AirPods:** Uygulamanın işi çeviriyi kulaklıktan duyurmaktır. Ses yolu, bağlantı durumu ve kesintiler birinci
   sınıf konulardır; kulaklık bağlı değilse ekran bunu açıkça söyler.
2. **Mikrofon karşıya, ses kulağa:** Dinleyen her zaman iPhone'un mikrofonudur. AirPods'un mikrofonu açılmaz; açılırsa
   kulaklıktaki ses telefon görüşmesi kalitesine düşer.
3. **Cihazda ve gizli:** Tanıma ve çeviri cihazda yapılır; konuşma metni telefondan çıkmaz. Tek istisna, kullanıcının
   anahtar girerek açtığı Alania sesidir (yalnız Türkçe çeviri metni gider). Tanılama kaydı konuşma içeriği tutmaz.
4. **Gecikme düşmandır:** Cümle bitince çeviri hemen görünür ve okunur. Hiçbir adım dinlemeyi bekletmez; ağ hatası
   akışı durdurmaz.
5. **Sessizce bozulmaz:** Dinleme durduysa, kulaklık koptuysa ya da ses yedeğe düştüyse ekran bunu söyler.
   Ekranda "Dinliyorum" yazarken duymamak en ağır hatadır.
6. **Tek elle, bakmadan:** Ekranda tek birincil eylem vardır (Başlat / Durdur). Dokunma alanı en az 44 pt, her denetimin
   VoiceOver etiketi var, Dinamik Yazı düzeni bozmaz.
7. **Derlenmeyen kod bitmemiştir:** Bulut oturumunda Xcode yoktur. Her Swift değişikliği GitHub'daki Mac derlemesinden
   hatasız ve uyarısız geçmeden bitmiş sayılmaz.
8. **Denenmeyeni denenmiş gösterme:** Simülatörde ve sahte servislerle doğrulanan ile gerçek iPhone + AirPods'ta
   doğrulanan ayrı raporlanır. Mikrofon, çeviri ve ses yalnızca gerçek cihazda denenebilir.

## Komutlar

| Komut                                             | Ne yapar                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| `python3 canli-ceviri/scripts/swift-sozdizimi.py` | Swift dosyalarında sözdizimi ön denetimi (derleme değildir; bkz. aşağısı)   |
| Dala `git push`                                   | "Canlı Çeviri (iOS derleme)" iş akışını çalıştırır: Mac'te derleme + ekranlar |
| `node canli-ceviri/tests/web-akis.cjs`            | Web sürümünün uçtan uca akış testi (sahte tanıma, çeviri ve seslendirme)    |
| `npm run check` (depo kökünde)                    | Depo geneli denetim; `.github/` ve kök yapılandırma değiştiyse çalıştırılır |

Mac derlemesi yalnızca `canli-ceviri/CanliCeviri/**`, `CanliCeviri.xcodeproj/**` ya da iş akışı dosyası değişince çalışır.
Sonucu ve kaydı GitHub Actions'tan okunur; simülatör ekran görüntüleri `canli-ceviri-ekran` dalına yazılır.

## Klasör sahipliği (her dosyanın tek yazarı vardır)

| Yol                                                                                                 | Sahibi           |
| --------------------------------------------------------------------------------------------------- | ---------------- |
| `CLAUDE.md`, `docs/PLAN.md`, `docs/ROADMAP.md`, `docs/EKIP.md`, `docs/sprints/*/brief.md`, `demo.md` | ceviri-lideri    |
| `CanliCeviri/`, `CanliCeviri.xcodeproj/`, `scripts/`, `.github/workflows/canli-ceviri-ios.yml`      | ios-gelistirici  |
| `web/`, `tests/`                                                                                    | web-gelistirici  |
| `docs/ses-hatti.md`                                                                                 | ses-uzmani       |
| `docs/tasarim.md`                                                                                   | arayuz-denetcisi |
| `docs/cihaz-testi.md`                                                                               | kalite-sorumlusu |
| `README.md`                                                                                         | ceviri-lideri    |

Ajanlar birbirinin dosyasını değiştirmez; geri bildirim `docs/sprints/SNN/reviews/<ajan>-<tur>.md` dosyasına yazılır.
Her bulgu: **önem** (Engel / Önemli / Öneri) + **yer** (dosya:satır ya da ekran) + **somut düzeltme önerisi**.
Engel varsa iş geri döner; Önemli olanlar aynı sprintte kapanır; Öneriler `docs/ROADMAP.md` birikim listesine yazılır.

## Mimari özeti

- **Akış:** iPhone mikrofonu → konuşma tanıma (Speech, cihazda) → çeviri (Translation, cihazda) → Türkçe ses
  (Alania-2, anahtar yoksa ya da ulaşılamazsa Apple sesi) → AirPods.
- **Dosyalar:** `Sabitler.swift` (diller, süreler, renkler) · `Durum.swift` (ekranların paylaştığı durum, çeviri döngüsü) ·
  `Hat.swift` (mikrofon, cümle ayırma, seslendirme, kesintiler) · `Arayuz/` (ekranlar ve bileşenler).
- **Cümle sonu:** 1,2 saniye sessizlik bir cümleyi bitirir (`Sabitler.swift` → `duraklama`). Biten cümle çevrilir, ekrana
  yazılır ve seslendirme sırasına girer; sesler üst üste binmez.
- **Ses yolu:** `.playAndRecord` + `.allowBluetoothA2DP`. Ses AirPods'a yüksek kalitede gider, mikrofon iPhone'unki kalır.
  Kulaklık yoksa ses ahizeden gelir; hoparlöre verilmez, çünkü mikrofon kendi sesini duyup yeniden çevirirdi.
- **Dil kipi:** Proje Swift 5 dil kipinde derlenir (`SWIFT_VERSION = 5.0`). Arayüz ve durum ana aktördedir (`@MainActor`);
  ses verisi ve tanıma geri çağrıları başka iş parçacığında gelir ve `nonisolated` işlevlerle ana aktöre taşınır.
- **Proje dosyası:** `CanliCeviri/` klasörü Xcode'da eşitlenen klasördür; içine konan `.swift` dosyası kendiliğinden
  derlemeye girer, `project.pbxproj` dosyasını elle düzenlemek gerekmez.
- **Web deneme sürümü:** Tek sayfa (`web/index.html` + `web/app.js`), derleme yok. Tanıma tarayıcının, çeviri MyMemory'nin
  hizmetidir; iPhone uygulamasının gizlilik ve mikrofon ilkeleri burada sağlanamaz ve bu sayfada açıkça yazılıdır.

## "Bitti" tanımı

- [ ] Mac derlemesi yeşil; derleyici hatası ve uyarısı yok
- [ ] Değişen her ekranın simülatör görüntüsü sprint klasöründe; arayüz incelemesinde Engel yok
- [ ] Her denetimin VoiceOver etiketi var; dokunma alanları en az 44 pt; en büyük Dinamik Yazı boyutunda metin kesilmiyor
- [ ] Hata durumunda ekranda Türkçe, ne yapılacağını söyleyen bir açıklama var; sessiz başarısızlık yok
- [ ] Konuşma ya da çeviri metni cihaz dışına çıkmıyor ve Tanılama kaydına yazılmıyor
- [ ] Web sürümü değiştiyse `node canli-ceviri/tests/web-akis.cjs` yeşil
- [ ] Gerçek cihazda denenmesi gereken her şey `docs/cihaz-testi.md` içinde adım adım yazılı

## Kalite kapıları

1. **Plan kapısı** (lider): ses hattı şartnamesi ve tasarım şartnamesi kabul kriterleriyle uyumlu.
2. **Otomatik kapı** (geliştiriciler): Mac derlemesi yeşil ve uyarısız; web akış testi yeşil; kök dosyalar değiştiyse
   `npm run check` temiz.
3. **Uzman incelemesi** (ses uzmanı, arayüz denetçisi, kalite sorumlusu): Engel yok; Önemli bulgular kapandı.
4. **İnsan kapısı** (proje sahibi): gerçek iPhone ve AirPods ile `docs/cihaz-testi.md` adımları.

Bir sprintte en fazla **3 düzeltme turu**. Üçüncü turdan sonra Engel kalırsa lider durur, seçenekleri `demo.md`'ye yazar ve sorar.

**Commit ve push:** Mac derlemesi yalnızca push ile çalıştığı için ekip kendi dalına commit ve push yapabilir.
Varsayılan dala birleştirme, GitHub Pages yayını ve depo dışı her eylem için proje sahibine sorulur.
