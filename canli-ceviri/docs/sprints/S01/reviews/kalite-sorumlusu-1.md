# S01 — Kalite incelemesi, tur 1 · kalite-sorumlusu

**Bulgular: 0 Engel · 5 Önemli · 13 Öneri** · Kabul kriterleri: 7 ✓ (K6 kodda; VoiceOver okuması cihazda; K10 bu
belgeyle), 1 lider doğrulayacak (K1), 1 kısmen (K2), 2 ✗ bugün (K7: ses uzmanında 3 Önemli açık; K8: arayüz
denetçisinde 1 Engel, C-1), K11 bu inceleme. Ayrıntı § 3.

İncelenen sürüm: dal `claude/epic-lovelace-lp6yyh`, HEAD `9031f22`. İnceleme başında çalışma ağacı temizdi (`git status`
boş). İnceleme sürerken başka ajanlar `README.md`, `docs/ROADMAP.md` ve `docs/ses-hatti.md` dosyalarını düzenlemeye
başladı (commit'lenmemiş); README çelişkileri (Q-5) çalışma ağacındaki sürüme göre yazıldı. Ben yalnız bu dosyayı ve
`docs/cihaz-testi.md`'yi yazdım.

## Yöntem ve sınırlar (ilke 8)

- **Okunan (baştan sona):** `CanliCeviri/` altındaki 13 Swift dosyasının hepsi; `web/app.js`, `web/index.html` (baş, CSP,
  Ayarlar metinleri), `tests/web-akis.cjs`, `/.github/workflows/canli-ceviri-ios.yml`, `scripts/swift-sozdizimi.py`,
  `project.pbxproj` (yapı ayarları), `reviews/ses-uzmani-1.md`, `ses-uzmani-2.md`, `arayuz-denetcisi-1.md`; işin
  sonunda yazılan `ses-uzmani-3.md` ve `arayuz-denetcisi-2.md`'nin özetleri ve çakışan bulguları (aşağıda "aynı:" diye
  işaretli).
- **Ağırlık:** ses uzmanının bakmadığı yerler: `Durum.swift` çeviri döngüsü ve kimlik denetimleri, `Arayuz/`, DEBUG
  sınırı (`Onizleme.swift`, `-ekran`), Tanılama'ya yazılan **her** `kaydet(...)` çağrısı (iOS 47, web 25; tek tek
  okundu), `Anahtarlik.swift`, web `localStorage` ve dış istekler, iş akışı, test. Ses hattının kural kural incelemesini
  tekrar etmedim.
- **Çalıştırılan:** üç denetim (§ 2). Ayrıca yayındaki web sürümünün `app.js`'i indirilip depodaki sürümlerle
  karşılaştırıldı (Q-3).
- **Doğrulanmayan:** Swift derlemesi (bu ortamda Xcode yok; K1 lider doğrulayacak), simülatörde çalışma, gerçek tanıma /
  çeviri / ses / AirPods (hepsi cihaz testine). Simülatör görüntülerine yalnız K2/K3 kanıtı için bakıldı.

---

## 1. Bulgular

Önem: **Engel** = ilk cihaz denemesini kırar ya da yanıltır · **Önemli** = bu sprintte kapanır · **Öneri** = birikime.

### Engel

Yok. İlk denemeyi kıracak bir mantık hatası, DEBUG kipinin gerçek sürüme sızması ya da Tanılama'dan içerik sızması
bulmadım. Gerekçe kısaca:

- `-ekran` kipi yalnız `#if DEBUG` içinde (`CeviriApp.swift:27-35`, `Onizleme.swift:5`, `Hat.swift:1061-1072`,
  `Durum.swift:74-79`) ve yalnız başlatma argümanıyla açılır. Projede paylaşılan şema (`xcshareddata/xcschemes`) yok;
  Xcode'un ▶︎ ile telefona yüklediği Debug yapısı argümansız başlar, örnek kip devreye girmez. Release'te
  `onizlemede` hep `false` (`Hat.swift:222`).
- Tanılama'ya yazılan 47 iOS çağrısının (`Hat.swift` 38, `Durum.swift` 8, `Anahtarlik.swift` 1) hiçbiri `canliMetin`,
  çeviri metni, `portName`, `UIDevice.name`, URL ya da anahtar içermiyor. Ayrıntılarda yalnız dil/bölge kodu, kelime
  sayısı, ms, `alan/kod`, port **türü**, kesinti nedeni, `shouldResume`, örnekleme hızı, `OSStatus` var. Kopya
  başlığındaki model `uname().machine` (`Tanilama.swift:95-104`), ad değil. Web'de 25 çağrı aynı biçimde; başlıkta
  `navigator.userAgent` (ad içermez) ve yalnız dosya adı (`app.js:137`).
- Kimlik denetimi her `await` sonrasında ve `translate`'ten önce (`Durum.swift:112`, `:117`, `:122`, `:146`, `:150`,
  `:158`, `:169`); geç gelen çeviri, izin ya da dil paketi sonucu yan etki yapmıyor.

**Başka incelemecinin Engeli:** arayüz denetçisi 2. turda **C-1**'i (web: gerçek bir oturumdan sonra Tanılama sayfası
açılınca `focus()` yüzünden ekran kayıyor, başlık ve "Bitti" görünmüyor) Engel saydı. Ben bunu kendim tekrarlamadım;
kodda nedeni makul (`web/app.js:374` `focus()` + `.ekran { overflow: hidden }`) ve bizim akış testi dikey kaymayı
denetlemediği için yakalamıyor (§ 4.1). Cihaz testini kırmasın diye `docs/cihaz-testi.md` § 0.2'ye geçici yol yazdım
(Kopyala yine görünür; kopyaladıktan sonra sayfayı yenilemek). Düzeltilmeden web Tanılama'sı ilk denemede yanıltıcı
olur; son turda **ilk iş** olarak kapanmalı.

### Önemli

#### Q-1 (Önemli) — Mac iş akışı uyarıları yakalamıyor; "yeşil" K1'in "uyarısız" şartını kanıtlamıyor

**Yer:** `/.github/workflows/canli-ceviri-ios.yml:31-43`. Adım yalnız `BUILD SUCCEEDED` arar; `: warning:` satırları
kayda basılır ama adımı kırmaz. İlke 7 ve K1 "hatasız **ve uyarısız**" der; bugün uyarılı bir derleme de yeşil görünür.
Lider K1'i "yeşil" diye işaretlerse yanlış güven doğar.
**Düzeltme:** `xcodebuild` çağrısına `SWIFT_TREAT_WARNINGS_AS_ERRORS=YES GCC_TREAT_WARNINGS_AS_ERRORS=YES` ekle; ya da
`grep -q "BUILD SUCCEEDED"`'den sonra `! grep -E ": warning:" derleme.log` (bilinen araç uyarıları çıkarsa yalnız
`\.swift:[0-9]+:[0-9]+: warning:` deseniyle). Bu düzeltmeye kadar lider K1'de kaydın grep çıktısını gözle okumalı.

#### Q-2 (Önemli) — İlke 3'ün ikinci istisnası (Alania'ya giden Türkçe metin) ekranda söylenmiyor

**Yer:** `CanliCeviri/Arayuz/AyarlarEkrani.swift:30`; `web/index.html:1259-1262`. İlke 3: "kullanıcı anahtar girdiyse
Türkçe çeviri metni Alania'ya gider … ikisi de ekranda söylenir." Anahtar alanının altında yalnız "Boş bırakırsanız …
Anahtar yalnızca bu telefonda, güvenli biçimde saklanır." yazıyor; "Nasıl çalışır" kutusu "Konuşma cihazda Türkçeye
çevrilir" diyor. Anahtar giren kullanıcı metnin telefondan çıktığını hiçbir yerde okumuyor. (Web'de MyMemory için
söyleniyor, Alania için söylenmiyor.)
**Düzeltme:** İki sürümde dipnota tek cümle: "Anahtar girerseniz çeviri metni seslendirmek için Alania'ya gönderilir;
söylenen asıl cümle gönderilmez." (metin `arayuz-denetcisi` onayıyla). ses-hatti S9'la uyumlu.

#### Q-3 (Önemli) — Hangi sürümün denendiği Tanılama'dan güvenilir okunamıyor

**Yer:** `web/app.js:32` (`SURUM = 'S01 tur 3'`, elle), `CanliCeviri.xcodeproj/project.pbxproj:253`, `:269`
(`1.0 (1)`, hiç değişmiyor), `Tanilama.swift:55`.
**Kanıt:** Yayındaki `app.js` indirildi ve `a29d6db` sürümüyle **birebir aynı** çıktı: yayında `Sürüm:` satırı **hiç
yok**, "Hazırlanıyor…" ve `aşama` olayı da yok. Yani cihaz testinde "Sürüm satırına bak" adımı bugün "satır yoksa eski
sürüm" diye okunmalı (belgeye öyle yazdım). Daha önemlisi: son düzeltme turunda web değişir ama `SURUM` elle
artırılmazsa `9031f22` ile düzeltilmiş sürüm aynı başlığı taşır. iPhone'da başlık her zaman `Canlı Çeviri 1.0 (1)`;
proje sahibinin hangi commit'i yüklediği kayıttan anlaşılmaz.
**Düzeltme:** Web: her web değişikliğinde `SURUM`'u artır (ör. `'S01 tur 4'`); akış testine `Sürüm: S01 tur 4`
beklentisi koyarak unutulmasını testle yakala. iOS: `Sabitler.swift`'e `let yapiEtiketi = "S01 tur 4"` ekle ve
`Tanilama.metin` başlığına yaz (ya da her turda `CURRENT_PROJECT_VERSION`'ı artır). İkisi de tek satır.

#### Q-4 (Önemli) — Çeviri döngüsü hatasız biterse ekran "Dinliyorum" kalır, hiçbir şey çevrilmez

**Yer:** `CanliCeviri/Durum.swift:144-173`. `for try await cumle in cumleler` döngüsü hatasız biterse (akış `finish()`
edildi ya da görev iptal edildi) işlev hiçbir şey yapmadan döner. Bugün akışı hatasız bitiren tek yol Durdur'dur ve orada
kimlik zaten artmıştır; sorun yok. Ama `translationTask` görevi yapılandırma değişmeden iptal edilirse
(`AsyncThrowingStream` yineleyicisi iptalde `nil` döner) `Hat` dinlemeyi, bekçiyi ve CANLI rozetini sürdürür, cümleler
akışa yazılır ve kimse okumaz: ilke 5'in "en ağır hata"sı, Tanılama'da da yalnız `cümle` satırları görünür, `çeviri`
satırı hiç gelmez. SwiftUI'nin bu görevi ne zaman iptal ettiği belgede yazmıyor (D1'in tersi).
**Düzeltme (KR4'e uygun savunma, 3 satır):** döngüden sonra
`guard benim == kimlik, calisiyor else { return }` ve
`hataylaBitir("Çeviri durdu. Dinlemeyi yeniden başlatın.", neden: "hata çeviri döngüsü bitti")`. (`gecerli()`
`Task.isCancelled`'a da baktığı için burada yalnız kimlik karşılaştırılmalı.)

#### Q-5 (Önemli) — README cihaz testini yanıltabilecek üç iddia taşıyor (çalışma ağacındaki sürüm)

**Yer:** `README.md` (lider şu an düzenliyor; satırlar çalışma ağacına göre):

1. `:9` "dil paketi bir kez indirildikten sonra internet gerekmez" ve tablo `:30` "İnternet: Dil paketi indikten sonra
   yok" ↔ aynı belgenin `:133-134` "Sunucuda tanıma … bu dillerde internet gerekir" ve KR2. Ayrıca İngilizce gibi
   dillerde de cihazdaki tanıma modeli inmemişse `supportsOnDeviceRecognition` `false` dönebilir (D4).
   **Düzeltme:** "çoğu dilde" + "hangi dillerin cihazda tanındığı cihaz testinde görülecek".
2. `:131-132` "Bekçi … Ekran, mikrofon sağırken 'Dinliyorum' demez." Kodda bekçi 1 sn aralıkla bakar ve 2 sn sınır
   kullanır (`Sabitler.swift:31-32`); mikrofon sustuktan sonra ekran 2–3 sn "Dinliyorum" der. İlke 8: denenmemişi
   kesin söyleme. **Düzeltme:** "en geç üç saniye içinde 'Duraklatıldı: mikrofondan ses gelmiyor' der".
3. `:126-127` "kesinti bitince dinleme kendiliğinden sürer" — bitiş bildirimi gelmezse (D8, D20) 10 sn sonra "Durdur'a,
   sonra Başlat'a dokunun" notu çıkar; görüşme sürerken uygulamaya dönülürse dinleme hatayla biter (birikimde, Ön-4).
   **Düzeltme:** bu iki istisnayı tek cümleyle ekle. Ayrıca `:29` "AirPods takılıyken çoğunlukla AirPods'unki"
   (web mikrofonu) doğrulanmamış bir gözlem; "olabilir (cihaz testinde görülecek, D14)" yaz.

Diğer README çelişkileri (Öneri düzeyi): `## Geliştirme` tablosunda `npm run check` yok (`CLAUDE.md` komut tablosunda
var); Ayarlar'daki Alania gizlilik cümlesi README'de de yok (Q-2). `CLAUDE.md` "Mimari özeti → Dosyalar" satırında
`Tanilama.swift`, `Anahtarlik.swift`, `TanilamaEkrani.swift` yok. Tur başında listelenen eski README çelişkileri
(dosya tablosu, Ekranlar tablosu, Tanılama, adres) çalışma ağacında giderilmiş.

### Öneri

- **Q-6** — Tanılama sınırı (300) kaydın **başını** atıyor: `Tanilama.swift:119-122`, `web/app.js:114-117`. Cümle başına
  ~4 satır (tanıma bitti, cümle, çeviri, ses) yazıldığı için ~70 cümlede `başlat`, `izin`, `ses yolu`, `tanıma açıldı`
  satırları düşer; uzun denemede (D18) sorunun kökü kayıttan çıkar. Düzeltme: oturumun ilk 30 olayını sabit tut, atılanı
  ortadan at ve yerine tek satır koy (`… 84 olay atıldı …`). Cihaz testi belgesine "sorunu gördüğünüz anda kopyalayın"
  yazdım.
- **Q-7** (aynı: ses-uzmani-3 Z-5, arayüz C-9) — "Kesinti sırasında gelen çeviri okunmadı." notu oturum boyunca kalıyor: not yalnız Başlat/Durdur'da
  temizleniyor (`Durum.swift:85`, `:88`, `:220`), `Hat.swift:892-895` kaldırmıyor. Arama bitip dinleme sürdükten sonra da
  sarı not durur; sarı not sürekli görünürse kullanıcı sarıyı önemsememeyi öğrenir (ilke 5). Düzeltme: kesintiden sonraki
  ilk başarılı okumada `bildir?(.not(.okunmayanCeviri, nil))`.
- **Q-8** (yazma hatasının ekranda söylenmemesi kısmı aynı: ses-uzmani-3 Z-8) — Ayarlar açılınca anahtar geri yazılıyor: `AyarlarEkrani.swift:68-76`. `onAppear`'daki atama `onChange`'i
  tetikler ve her ziyarette Anahtar Zinciri'ne yazılır. Okuma geçici bir hatayla dönerse (getter `""` döner ama bellekte
  tutmaz, `Anahtarlik.swift:20-23`) bu geri yazma kayıtlı anahtarı **siler**. Ayrıca yazma başarısızlığı yalnız
  Tanılama'ya gider; ekran "güvenli biçimde saklanır" demeye devam eder (ilke 5). Düzeltme: `onChange`'de son okunan
  değerle aynıysa yazma; yazılamazsa alanın altında "Anahtar kaydedilemedi; yeniden deneyin." göster (setter'ı `Bool`
  döndüren bir işleve çevir).
- **Q-9** — A2 kenar durumu: `Anahtarlik.swift:39-44` taşıma yazılamazsa getter Anahtar Zinciri'ndeki (belki boş) değeri
  döndürür, `UserDefaults`'taki kullanıcı anahtarı o oturumda kullanılmaz ve `errSecItemNotFound` ise `""` bellekte
  kalır. Şartname A2 "UserDefaults kazanır" der. Düzeltme: taşıma yazılamazsa o oturum için eski değeri döndür.
- **Q-10** — Web'de Alania anahtarı `localStorage`'da düz metin (`web/app.js:1235`) ve köken
  `yilmazfatih-cyber.github.io` aynı hesabın **bütün** Pages sitelerince paylaşılıyor (Köprü dahil); oradaki her betik
  okuyabilir. Anahtarlar ön eksiz (`kaynakDil`, `alaniaSes`, `alaniaAnahtar`, `okurkenDuraklat`). Düzeltme: anahtar
  adlarına `canliCeviri.` ön eki; dipnotta "bu sitedeki sayfalar okuyabilir; ortak telefonda girmeyin" ya da yalnız
  `sessionStorage` seçeneği. Dış istekler CSP ile yalnız `api.mymemory.translated.net` ve `voice.patientdesk.ai`'ye
  sınırlı (`index.html:14-17`); başka hiçbir yere istek yok.
- **Q-11** (aynı: ses-uzmani-3 Z-9, orada Önemli; onların önemi geçerli) — Web yedek süresi doğrulanmamış "Dinliyorum…" gösteriyor: `web/app.js:33-35`, `:660-664`. Safari 5 sn içinde
  `start`/`audiostart`/sonuç vermezse (ör. izin istemi hâlâ açık) ekran "Dinliyorum…" der; yalnız Tanılama'da uyarı
  (`olay=yedek`) kalır. İlke 5'le gerilimli. Cihaz testinde (W-2, D34) Safari olayları güvenilir gelirse yedek
  kaldırılmalı; gelmiyorsa yedekte "Dinliyorum… (konuşunca doğrulanır)" gibi ayrı bir metin.
- **Q-12** — iOS'ta "Dil paketi indiriliyor…" yok (ses-hatti § 2.1) ve kullanıcı indirmeyi reddedince ileti yanlış yol
  gösteriyor: `Durum.swift:114` her hata için "İnternete bağlanıp yeniden deneyin." der. Düzeltme: iptal hatasını
  (`CancellationError` / Translation'ın iptal kodu, D cihazda görülecek) ayır: "Dil paketi indirilmedi. Başlat'a yeniden
  dokunup indirmeyi onaylayın."
- **Q-13** — En büyük yazı boyutunda aşama satırı ve hata ekran dışında: `CeviriEkrani.swift:19`
  (görüntü `ceviri-buyuk-yazi.png`: dil şeridi ekranı dolduruyor, "Şu An" kartı ve durum satırları kaydırmanın altında).
  "Duraklatıldı" ya da hata görünmez kalır (ilke 5). Aynı: arayüz C-2, C-3 (orada Önemli); ayrı iş açılmasın.
- **Q-14** — Release yapılandırması hiç derlenmiyor (`canli-ceviri-ios.yml:38`). `#if DEBUG` sınırı okuyarak doğru
  görünüyor ama derlenerek doğrulanmadı. Düzeltme: derleme adımına ikinci bir `-configuration Release` çağrısı (görüntü
  adımı Debug'la kalır).
- **Q-15** — Web'de tek bir çeviri hatası **hata satırına** (`acikKirmizi`) yazılıyor ve dinleme sürüyor
  (`web/app.js:764-768`); iPhone aynı durumda sarı not gösteriyor (`Durum.swift:161`). Kırmızı satır "durdu" gibi
  okunur. Düzeltme: web'de `d.not`'a yaz, hata satırını durmaya ayır.
- **Q-16** — Paket kimliği `com.example.CanliCeviri$(DEVELOPMENT_TEAM)` (`project.pbxproj:270`, `:301`). Ekip kimliği
  eki onu benzersiz kılıyor ama Xcode'un ücretsiz hesapta `com.example` önekini kabul edip etmediğinden emin değilim.
  Cihaz testinde (U-0) imza adımında hata çıkarsa ilk bakılacak yer; olmazsa kimliği `tr.canliceviri.app$(…)` gibi bir
  önekle değiştirin.
- **Q-17** — iOS tarafında hiç otomatik test yok (bkz. § 4.2); en ucuz ilk adımlar orada.
- **Q-18** — Web akış testi üç yerde gerçek Safari'den daha cömert (bkz. § 4.1): Chromium ve otomatik oynatmayı
  serbest bırakan bayrak (`tests/web-akis.cjs:88-91`), sahte Alania/MyMemory yanıtlarının CORS başlıkları (`:117-208`),
  mikro görevde gelen `start`. Bunlar yüzünden web Alania sesinin Safari'de çalıp çalmadığı ve gerçek Alania'nın CORS
  izni hiç sınanmıyor; cihaz testinde W-6.

---

## 2. Denetim çıktıları (olduğu gibi)

### 2.1 `python3 canli-ceviri/scripts/swift-sozdizimi.py --proje` (depo kökünden)

```text
TAMAM  CanliCeviri/Anahtarlik.swift
TAMAM  CanliCeviri/Arayuz/AyarlarEkrani.swift
TAMAM  CanliCeviri/Arayuz/Bilesenler.swift
TAMAM  CanliCeviri/Arayuz/CeviriEkrani.swift
TAMAM  CanliCeviri/Arayuz/GecmisEkrani.swift
TAMAM  CanliCeviri/Arayuz/KokEkran.swift
TAMAM  CanliCeviri/Arayuz/Onizleme.swift
TAMAM  CanliCeviri/Arayuz/TanilamaEkrani.swift
TAMAM  CanliCeviri/CeviriApp.swift
TAMAM  CanliCeviri/Durum.swift
TAMAM  CanliCeviri/Hat.swift
TAMAM  CanliCeviri/Sabitler.swift
TAMAM  CanliCeviri/Tanilama.swift
TAMAM  CanliCeviri.xcodeproj/project.pbxproj (15 nesne, tüm başvurular tanımlı)

13 dosya, 0 sorun (yalnız sözdizimi; derleme Mac'te yapılır)
CIKIS=0
```

Not: betik `tree-sitter` ile yalnız sözdizimini denetler; tür, aktör yalıtımı ve uyarıları **görmez** (betiğin kendi
açıklaması da böyle). K1'in yerine geçmez.

### 2.2 `node canli-ceviri/tests/web-akis.cjs` (depo kökünden; çıkış kodu 0)

Özet: 25 bölüm (+25i), **204 geçti, 0 kaldı**. Tam çıktı:

<details>
<summary>Tam çıktı (233 satır)</summary>

```text
1. Açılış
  ✓ başlık
  ✓ boş durumda AirPods ipucu
  ✓ hata görünmüyor
  ✓ düğme: Dinlemeyi Başlat
  ✓ yatay taşma yok (390)
  ✓ telefon genişliğinde sayfa kaymıyor
2. Dinleme akışı
  ✓ tanıma açıldı
  ✓ tanıma ayarları (en-US, sürekli)
  ✓ CANLI rozeti
  ✓ düğme: Durdur
  ✓ Dinliyorum…
  ✓ dil şeridi kilitli
  ✓ seslendirme dokunuşta sessizce açıldı
  ✓ canlı metin görünüyor
  ✓ sessizlik dolmadan çeviri istenmedi (sayaç sıfırlandı)
  ✓ 1,2 sn sessizlikten sonra çeviri istendi
  ✓ istek: q ve langpair=en|tr
  ✓ çeviri ekranda
  ✓ asıl cümle ekranda
  ✓ çeviri Türkçe okundu
  ✓ cümleden sonra yeni tanıma açıldı
  ✓ yeni tanıma dinliyor
  ✓ canlı metin temizlendi
3. Tanıma kendiliğinden biterse
  ✓ yeniden açıldı
  ✓ yarım cümle kaybolmadı
  ✓ yarım cümleden sonra da yeniden açıldı
  ✓ Öncekiler kartı göründü
4. Durdur ve Geçmiş
  ✓ tanıma kapandı
  ✓ düğme eski hâlinde
  ✓ CANLI rozeti gitti
  ✓ durduktan sonra yeni tanıma açılmadı
  ✓ Geçmiş: 2 çeviri
  ✓ Geçmiş: saat biçimi
  ✓ Temizle onay istiyor, henüz silmedi (KR9)
  ✓ onay metni: Geçmiş silinsin mi?
  ✓ Vazgeç: geçmiş duruyor
  ✓ Vazgeç: odak Temizle düğmesine döndü
  ✓ geçmişin geçici olduğu yazıyor
  ✓ Temizle: boş durum
5. Dil değişimi
  ✓ dil menüsü açıldı
  ✓ 7 dil
  ✓ şerit: Almanca → Türkçe
  ✓ tanıma dili de-DE
  ✓ istek: langpair=de|tr
  ✓ Almanca çeviri ekranda
6. Çeviri hataları
  ✓ günlük sınır mesajı
  ✓ hata sonrası dinleme sürüyor
  ✓ bağlantı hatası mesajı
  ✓ başarılı çeviri hatayı temizledi
  ✓ HTML varlıkları çözüldü
7. Arka plan
  ✓ arka planda dinleme bekliyor
  ✓ dönünce dinleme sürüyor
8. İzin hatası
  ✓ izin mesajı
  ✓ izin hatasında durdu
  ✓ izin hatasından sonra yeniden denemedi
9. Hemen biten tanıma
  ✓ 6 boş denemeden sonra durdu
  ✓ neden: internet
10. Okurken dinlemeyi duraklat
  ✓ şalter açık
  ✓ okunurken tanıma kapalı
  ✓ okunurken yeni tanıma açılmadı
  ✓ okuma bitince dinleme sürdü
11. Alania
  ✓ Alania isteği: model, metin, ses
  ✓ Alania isteği: anahtar
  ✓ Alania çalınca cihaz sesi kullanılmadı
  ✓ Alania hata verince cihaz sesi okudu
  ✓ Alania notu göründü
  ✓ 401: "Alania anahtarı geçersiz" notu
  ✓ 401 sonrası bu oturumda Alania denenmedi
12. Kalıcılık
  ✓ dil hatırlandı
  ✓ anahtar hatırlandı
  ✓ ses seçimi hatırlandı
13. Desteklemeyen tarayıcı
  ✓ açılışta uyarı
  ✓ başlamıyor
14. Genişlikler
  ✓ yatay taşma yok (360)
  ✓ düğme ve sekmeler ekranda (360×800)
  ✓ yatay taşma yok (320)
  ✓ düğme ve sekmeler ekranda (320×568)
  ✓ yatay taşma yok (1280)
15. Duraklama sayacı yalnız metin değişince sıfırlanır
  ✓ aynı metni yineleyen sonuç cümleyi uzatmadı
16. Okurken sekme gizlenip görünür olunca
  ✓ okuma sürüyor, tanıma kapalı
  ✓ okuma bitince gizli sekmede tanıma açılmadı
  ✓ gizli sekmede oturum hatayla durmadı
  ✓ sekme görününce tanıma bir kez açıldı
  ✓ okuma sürerken sekme görününce tanıma açılmadı ("okurken beklet" bozulmadı)
  ✓ okuma bitince tanıma açıldı
17. "end" gelmeyen tanıma (sigorta)
  ✓ "end" gelmeden yeni tanıma açılmadı
  ✓ sigorta yeni tanımayı açtı, aynı anda tek tanıma açık
18. Durdur ve bekleyen cihaz sesi
  ✓ yeni oturumun ilk sesi eski sesi beklemedi
19. Ekran kilidi
  ✓ geç gelen ekran kilidi bırakıldı
20. Alania: zaman aşımı, iptal, devre kesici
  ✓ Durdur sonrası ilk cümle eski Alania isteğini beklemedi
  ✓ iptal edilen cümle cihaz sesiyle de okunmadı
  ✓ 5 sn dolmadan yedeğe düşülmedi
  ✓ 5 sn sonunda istek kesildi, cihaz sesi okudu
  ✓ zaman aşımında yedek notu
  ✓ başarılı Alania sesinden sonra not kalktı
  ✓ 3 hatadan sonra Alania denenmedi
  ✓ 4 cümlenin hepsi cihaz sesiyle okundu
  ✓ devre kesici notu oturum boyunca
  ✓ yeni oturumda Alania yeniden denendi
21. Tanılama
  ✓ Ayarlar: Tanılama satırı olay sayısı
  ✓ Tanılama sayfası açıldı
  ✓ sayfa: role=dialog, aria-modal
  ✓ açılınca odak başlıkta
  ✓ kayıt beklenen olayları içeriyor
  ✓ ayrıntılar: dil, kelime sayısı, süre, HTTP kodu, neden
  ✓ liste en yeni üstte; uyarı olayı "Uyarı:" ile okunur
  ✓ ekrandaki kayıtta söylenen cümle ve çevirisi yok
  ✓ gizlilik cümlesi
  ✓ Kopyala: başlıkta tarayıcı, sürüm, protokol + dosya adı (yol yok) ve tarih
  ✓ Kopyala: her satır "SS:DD:SS.mmm  olay  ayrıntı"
  ✓ Kopyala: eskiden yeniye
  ✓ kopyalanan kayıtta söylenen cümle ve çevirisi yok
  ✓ düğme: Kopyalandı
  ✓ duyuru: Kayıt panoya kopyalandı
  ✓ 2 sn sonra düğme eski hâlinde
  ✓ pano reddedince metin seçilebilir alanda
  ✓ Temizle: ilk dokunuş onay istiyor, silmiyor
  ✓ onay 4 sn sonra kalktı
  ✓ Temizle: ikinci dokunuşta silindi, boş durum, Temizle devre dışı
  ✓ duyuru: Kayıt temizlendi
  ✓ Esc kapattı, odak Tanılama satırına döndü
  ✓ özet: Henüz olay yok
  ✓ en çok 300 olay; "Son 300 olay gösteriliyor."
  ✓ kopyada 300 olay satırı
22. Erişilebilirlik ve metinler
  ✓ "Şu An" kartı canlı bölge değil
  ✓ "Şu An" başlığı değişmedi
  ✓ not: kulaklık durumu gösterilmez
  ✓ Başlat dolgusu --mavi-dolgu
  ✓ seçili sekme --mavi-metin
  ✓ duyuru: Dinleme başladı
  ✓ Durdur dolgusu --kirmizi-dolgu
  ✓ CANLI rozeti --mavi-dolgu
  ✓ CANLI rozeti: "Dinleme açık"
  ✓ canlı metin lang=en
  ✓ asıl cümle lang=en
  ✓ çeviride ayrı lang yok (sayfa tr)
  ✓ canlı bölge yalnız son çeviriyi okur
  ✓ çeviri bölgesi aria-live=polite
  ✓ duyuru: Dinleme durdu
  ✓ hata satırının başında uyarı simgesi
  ✓ anahtar: "bu tarayıcıda saklanır"
  ✓ duraklat: "yalnız bu web sürümünde"
  ✓ bölüm başlığı biçemle büyük harf, metni olağan
  ✓ şalter etiketine dokunmak da değiştirir
23. 320×568
  ✓ Çeviri: dokunma alanları ≥ 44 px
  ✓ dil menüsü ekranın içinde
  ✓ 320×568: 7 dilin hepsi erişilebilir
  ✓ dil menüsü öğeleri ≥ 44 px
  ✓ Arapça seçilebildi
  ✓ dinlerken başlık tek satırda, kesilmeden
  ✓ dinlerken dil şeridi tek satır, 56 px
  ✓ dinlerken son çeviri kaydırmadan görünüyor
  ✓ dinlerken yatay taşma yok (320)
  ✓ dinlerken dokunma alanları ≥ 44 px
  ✓ Geçmiş: dokunma alanları ≥ 44 px
  ✓ Geçmiş onayı: dokunma alanları ≥ 44 px
  ✓ Ayarlar: dokunma alanları ≥ 44 px
  ✓ Tanılama satırı en az 56 px
  ✓ Tanılama: dokunma alanları ≥ 44 px
  ✓ Tanılama açıkken yatay taşma yok (320)
24. Genişlikler (dinlerken, Tanılama)
  ✓ yatay taşma yok, dinlerken ve Tanılama açıkken (320)
  ✓ yatay taşma yok, dinlerken ve Tanılama açıkken (360)
  ✓ yatay taşma yok, dinlerken ve Tanılama açıkken (390)
  ✓ yatay taşma yok, dinlerken ve Tanılama açıkken (1280)
25. Aşamalar
  ✓ izin beklenirken "Hazırlanıyor…"
  ✓ hazırlanırken CANLI rozeti yok
  ✓ hazırlanırken düğme: Durdur
  ✓ hazırlanırken dil şeridi kilitli
  ✓ duyuru: Hazırlanıyor
  ✓ audiostart gelince "Dinliyorum…" ve CANLI
  ✓ duyuru: Dinleme başladı
  ✓ Tanılama: tanıma açıldı … konum=bilinmiyor
  ✓ Tanılama: izin verildi satırı (audiostart)
  ✓ Tanılama: geçişi yapan olay = audiostart
  ✓ hazırlanırken Durdur: duruyor aşamasına döndü
  ✓ yalnız start gelince de dinliyor
  ✓ Tanılama: geçişi yapan olay = start
  ✓ Tanılama: start izin sayılmaz; izin ilk sonuçta, bir kez
  ✓ olay yoksa ilk sonuç dinliyor yapar
  ✓ Tanılama: geçişi yapan olay = sonuç
  ✓ olay gelmezse 4,5 sn sonra hâlâ Hazırlanıyor…
  ✓ yedek süre (5 sn) dolunca "Dinliyorum…"
  ✓ Tanılama: olay=yedek; izin "verildi" yazılmadı
  ✓ hazırlanırken gizli: Duraklatıldı
  ✓ dönünce yine Hazırlanıyor…
  ✓ okurken "Duraklatıldı: okuma sürüyor"
  ✓ okurken CANLI rozeti yok
  ✓ okurken düğme: Durdur
  ✓ "Duraklatıldı" rengi --sari
  ✓ okurken gizli: "sayfa arka planda"
  ✓ görününce okuma sürüyor: yine Duraklatıldı
  ✓ okuma bitince "Dinliyorum…" ve CANLI
  ✓ gizli sekmede "Duraklatıldı", CANLI yok
  ✓ gizli sekmede düğme: Durdur
  ✓ görününce "Dinliyorum…" ve CANLI
  ✓ Tanılama: kesinti başladı / neden eklendi / neden kalktı / bitti
  ✓ Tanılama: eski "bekleme" adı yok
25i. Durdur ve uçuştaki çeviri isteği
  ✓ Durdur çeviri isteğini iptal etti
  ✓ yeni oturumun ilk cümlesi eski isteği beklemeden çevrildi
  ✓ iptal edilen istek hata göstermedi
  ✓ iptal edilen cümle ekrana gelmedi
  ✓ Tanılama: çeviri  istek iptal edildi
  ✓ Tanılama: iptal hata sayılmadı
  ✓ betik ya da güvenlik politikası (CSP) hatası yok

204 geçti, 0 kaldı
CIKIS=0
```

</details>

### 2.3 `npm run check` (depo kökünde; `node_modules` vardı, `npm ci` gerekmedi; çıkış kodu 0)

```text

> kopru@0.1.0 check
> npm run typecheck && npm run lint && npm run format:check && npm run test && npm run validate:content


> kopru@0.1.0 typecheck
> tsc -b --noEmit


> kopru@0.1.0 lint
> eslint .


> kopru@0.1.0 format:check
> prettier --check .

Checking formatting...
All matched files use Prettier code style!

> kopru@0.1.0 test
> vitest run


 RUN  v5.0.3 /home/user/Deneme

Not implemented: HTMLMediaElement's play() method
Not implemented: HTMLMediaElement's play() method
Not implemented: HTMLMediaElement's pause() method
Not implemented: HTMLMediaElement's play() method
Not implemented: HTMLMediaElement's play() method
Not implemented: HTMLMediaElement's play() method
Not implemented: HTMLMediaElement's pause() method
Not implemented: HTMLMediaElement's play() method
Not implemented: HTMLMediaElement's pause() method
Not implemented: HTMLMediaElement's play() method
Not implemented: HTMLMediaElement's pause() method
Not implemented: HTMLMediaElement's play() method

 Test Files  9 passed (9)
      Tests  53 passed (53)
   Start at  17:21:09
   Duration  4.02s (environment 57%, tests 21%, setup 11%, transform 7%, import 4%)

Environment  jsdom was created 9 times · 5.92s total, 57% of tracked time
             create it once per worker with pool: 'vmThreads' (keeps per-file isolation) or isolate: false (shares it across files)
             learn more: https://vitest.dev/guide/improving-performance#test-environments


> kopru@0.1.0 validate:content
> tsx scripts/validate-content.ts

İçerik geçerli: 152 kelime, 19 kategori, 5 kalıp, 9 hızlı ihtiyaç, 8 durak.
```

Not: `npm run check` Canlı Çeviri için yalnız ESLint (`web/app.js`, `tests/web-akis.cjs`) ve Prettier (bütün
`canli-ceviri/` metin dosyaları) denetimidir; birim testler ve içerik doğrulaması Köprü'nündür. "Not implemented:
HTMLMediaElement" satırları Köprü'nün jsdom testlerinden gelir, hata değildir. Komut, başka ajanların o an
commit'lenmemiş README / ROADMAP / ses-hatti düzenlemeleri çalışma ağacındayken çalıştı.

---

## 3. Kabul kriterleri

| No  | Durum | Kanıt / neden |
| --- | ----- | ------------- |
| K1  | lider doğrulayacak | `9031f22` derlemesi sürüyor. `f937242` yeşildi (`shots/BILGI.txt`: Xcode 26.6, iPhone 17, iOS 26.5). Dikkat: iş akışı uyarıda kırılmıyor (Q-1); "uyarısız" için kayıttaki `: warning:` satırları gözle okunmalı. Kırabilecek / uyarı üretebilecek yerler § 5'te. |
| K2  | kısmen | `docs/sprints/S01/shots/`: `ceviri-bos`, `ceviri`, `dinliyor`, `kulakliksiz`, `gecmis`, `gecmis-bos`, `ayarlar`, `tanilama` (+ `ceviri-buyuk-yazi`) ve `BILGI.txt`. Görüntüler `f937242`'den; `f937242..9031f22` arasında `Arayuz/` değişmedi (`git diff --stat`), görüntüler HEAD arayüzü için geçerli. Sekiz görüntünün hepsi var. Kesilme: arayüz denetçisi `kulakliksiz`'da kaydırma kenarında yarım satır buldu (C-8, "kısmen"); ben de aynı yeri gördüm, metin taşması yok. `ceviri-buyuk-yazi` sekizden biri değil ama içerik ekran dışında (Q-13, C-2). |
| K3  | ✓ | Olaylar: başlat/durdur `Durum.swift:81`, `:92`, `:216`; izin `:123`; dil paketi `:113`, `:118`; tanıma açıldı `Hat.swift:291`, `:298`, `:328`; tanıma bitti `:808`, `:816`; cümle `:872` (yalnız kelime sayısı); çeviri `Durum.swift:151`, `:160`; ses `Hat.swift:880-1019`; ses yolu `:384`, `:391`, `:397` (yalnız tür); kesinti `:523-646`; arka plan/ön plan `:490`, `:501`, `:504`. İçerik ve cihaz adı yok (47 çağrının her biri tek tek okundu). 300 sınırı `Tanilama.swift:119-122`; Kopyala düz metin `TanilamaEkrani.swift:175` + `Tanilama.metin` (`Tanilama.swift:53-68`; başlıkta sürüm, iOS, model, saat dilimi); Temizle onaylı `TanilamaEkrani.swift:43-51`. Görüntü `tanilama.png`. Eksik: "dil paketi indirildi" ayrımı yok (ses-uzmani-2 Ön-7a, ROADMAP birikimine yazıldı). |
| K4  | ✓ | `web-akis.cjs` § 21: "kayıt beklenen olayları içeriyor", "ekrandaki kayıtta söylenen cümle ve çevirisi yok", "kopyalanan kayıtta söylenen cümle ve çevirisi yok", "Kopyala: her satır SS:DD:SS.mmm  olay  ayrıntı", "en çok 300 olay"; § 25 aşama satırları. Hepsi ✓ (§ 2.2). |
| K5  | ✓ | `Anahtarlik.swift:16-35` okuma/yazma, `:90` `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, `:39-44` taşıma ve `UserDefaults`'tan silme, `:30` yazınca eski değeri silme, `:72` yazma hatası yalnız `OSStatus`. Anahtarı okuyan yerler yalnız `Hat.swift:920` ve `AyarlarEkrani.swift:70` (`grep alaniaAnahtari`). Kenar durumlar Q-8, Q-9. Yeniden kurulumda kalma: D25 (cihazda). |
| K6  | ✓ (kod) · VoiceOver okuması cihazda doğrulanmalı | Dil şeridi `CeviriEkrani.swift:120-122`; ana düğme `:240-243`; kulaklık `:220-222`; sekmeler `KokEkran.swift:123-124` (`isSelected`), kapsayıcı `:133-134`; Geçmiş Temizle `GecmisEkrani.swift:27-28` ve 44 pt `:24-25`; anahtar alanı `AyarlarEkrani.swift:27-29`; ses seçici `:44`; Tanılama satırı `:129-133`; Tanılama Kopyala/Temizle/Bitti `TanilamaEkrani.swift:189-190`, `:203-204`, `:70`, 44 pt `:67`, `:199`. Duyurular `KokEkran.swift:66-97`. Görüntüler `dinliyor`, `ayarlar`, `tanilama`. |
| K7  | ✗ (bugün) | `ses-uzmani-3.md` özeti: **0 Engel, 3 Önemli** (Z-1 motor hata alanı, Z-2 sürdürme iletisi, Z-9 web yedek süresi), 6 Öneri; 2. turun Engeli YE1 kapanmış (benim okumam da: `Hat.swift:747-764`, ikinci alarm G13). Kriter "Önemli bulgular kapandı" der; son düzeltme turunda Z-1, Z-2, Z-9 kapanınca ✓. |
| K8  | ✗ (bugün) | `arayuz-denetcisi-2.md` özeti: **1 Engel** (C-1, web Tanılama kayması), 7 Önemli. Karşıtlık oranları hesaplı (`docs/tasarim.md` § 1.3–1.4; gövde metni ≥ 4,5:1). C-1 ve Önemliler kapanınca ✓. |
| K9  | ✓ | § 2.2: 204/204; genişlikler 320, 360, 390, 1280'de "yatay taşma yok" (§ 14, 23, 24; dinlerken ve Tanılama açıkken de). |
| K10 | ✓ (bu belgeyle) | `docs/cihaz-testi.md`: web (W-) ve iPhone (U-) senaryoları; sonda § 7 karşılık tablosu (D1–D35 ve K1–K16, her biri en az bir senaryoda). Belge yazılmadan hemen önce `docs/ses-hatti.md` yeniden okundu. |
| K11 | ✓ (bu incelemede Engel yok) | Bu dosya: 0 Engel, 5 Önemli (Q-1…Q-5), her satır kanıtlı. Önemliler son düzeltme turunda kapanmalı. Sprint düzeyinde Engel yine de var: arayüz C-1 (K8). |
| K12 | ✓ | § 2.3: `npm run check` çıkış kodu 0 (tsc, ESLint, Prettier, 53 test, içerik doğrulaması). |

---

## 4. Testin kendisi

### 4.1 Web akış testi neyi kanıtlıyor, neyi kanıtlayamıyor

**Gerçekten kanıtladıkları** (uygulamanın kendi davranışı, sahte değil): 1,2 sn duraklama sayacının yalnız metin
değişince sıfırlanması; yarım cümlenin kaybolmaması; Durdur'un tanımayı, uçuştaki çeviriyi ve Alania isteğini iptal
etmesi ve yeni oturumun eskisini beklememesi; aşama makinesinin (hazırlanıyor / dinliyor / kesintide) ekrana tek
kaynaktan yansıması; CANLI'nın yalnız dinlerken görünmesi; Tanılama'da **söylenen cümle ve çevirinin hiç geçmemesi**
(ekranda ve panoda, `ICERIK` listesiyle; iyi bir denetim); 300 sınırı; 44 px ve taşma ölçümleri; CSP ihlali olmaması.

**Kanıtlayamadıkları** (sahte yüzünden):

- **Tarayıcı Safari değil.** Test Chromium'da koşar (`web-akis.cjs:88-91`). iPhone Safari'nin `webkitSpeechRecognition`
  olay sırası (start/audiostart/sonuç), `continuous` kipte kendiliğinden bitişi (D15), `speechSynthesis` sesinin
  AirPods'tan gelip gelmediği (D14), pano izni ve görünürlük olayları sınanmaz.
- **Otomatik oynatma serbest.** `--autoplay-policy=no-user-gesture-required` bayrağı, uygulamanın "dokunuşta sesi açma"
  hilesinin (`app.js:1030-1049`) işe yarayıp yaramadığını gizler. "seslendirme dokunuşta sessizce açıldı" denetimi yalnız
  uygulamanın `speak(' ')` çağırdığını gösterir, Safari'nin sonraki sesleri dokunuşsuz çaldığını değil (D16).
- **CORS sahte.** Sahte MyMemory ve Alania yanıtları `access-control-allow-origin: *` ekler (`:117-208`). Gerçek
  Alania'nın tarayıcıdan gelen isteğe CORS izni verip vermediği bilinmiyor; vermiyorsa web'de Alania her seferinde `ağ`
  hatasıyla düşer ve 3. hatada kesilir. Yanlış güven veren tek gerçek nokta bu (Q-18).
- **Başlangıç olayları mikro görevde gelir.** Varsayılan kipte `start` hemen gelir; "Hazırlanıyor…" yalnız `__olayKipi`
  elle `yok` yapılınca sınanır (§ 25). Gerçek izin istemi süresi, yedek sürenin (5 sn) yeterliliği sınanmaz (D34).
- **Zamanlamaya dayalı.** Çok sayıda `waitForTimeout` (700/900/1450 ms…) var; yüklü bir makinede kırılgan olabilir.
  Bu turda tek koşuda yeşil.
- **Dikey kayma ölçülmüyor.** Genişlik denetimleri yalnız yatay taşmaya bakar; arayüz denetçisinin C-1'i (Tanılama
  açılınca `.ekran`'ın kayması) bu yüzden 204/204 yeşilken kaçtı.
- Her zaman geçen ya da yalnız sahtenin davranışını sınayan bir denetim **bulmadım**; yukarıdakiler kapsam sınırıdır.

**Öneriler:** (1) Aynı testi Playwright'ın `webkit` motoruyla da koş (Linux'ta çalışır; Safari'nin birebiri değil ama
otomatik oynatma ve CSS farklarını yakalar). (2) Bir senaryoda otomatik oynatma bayrağını kaldırıp Alania sesinin
Başlat dokunuşundan sonra çalabildiğini sına. (3) Bir senaryoda Alania sahtesi CORS başlığı vermesin; uygulama `ağ`
hatasını notla göstermeli. (4) `Sürüm:` satırını beklenen değere bağla (Q-3). (5) Dört cümlelik bir oturumdan sonra
Tanılama'yı açıp `.ekran.scrollTop === 0` ve "Bitti"nin ekranda olduğunu denetle (arayüz C-12).

### 4.2 iOS: otomatik test yok — risk ve en ucuz ilk adım

**Risk:** iOS mantığı (bekçi, kesinti numarası, kimlik, ses sırası, Tanılama biçimi, anahtar taşıma) yalnız okunarak
doğrulandı. Her düzeltme turunda bu mantık değişti (tur 2'de `Hat.swift` +258 satır) ve hiçbiri çalıştırılmadı; geriye
dönük bozulmayı ancak cihaz testi yakalar.

**En ucuz ilk adımlar** (sıra önerisi):

1. **Saf işlevler için birim test hedefi** (`CanliCeviriTests`, iş akışına `xcodebuild test -sdk iphonesimulator`):
   `Hat.uyariMetni`, `turAdi`, `yolNedeniAdi`, `KesintiNedeni.ekranMetni/kayitAdi`, `Asama.canli/duraklatmaMetni`,
   `Durum.turkce` (hata alanı/kodu → ileti), `Tanilama.kaydet` (tekrar birleştirme, 300 sınırı, `metin` biçimi),
   `MikrofonKutusu.tamponGeldi`, `SesBekleyici` (S4a: başka öğenin bitişi beklemeyi bitirmez). Hepsi donanımsız
   çalışır; `private static` olanlar `internal`'a açılmalı.
2. **Anahtarlik** simülatörde Anahtar Zinciri'yle gerçekten çalışır: taşıma (A2), boş değer silme, kırpma.
3. **Karar mantığını donanımdan ayır:** bekçinin "alarm / tampon geldi / ikinci alarm" kararı ve kesinti neden
   değişimi (G11a) bugün `Hat` içinde `AVAudioEngine`'e bağlı; küçük bir `struct` (girdi: zaman, olay; çıktı: eylem)
   olarak çıkarılırsa saat taklidiyle sınanır.
4. **İlke 3 koruması (betik):** `scripts/`e `kaydet(` çağrılarının ikinci argümanında `canliMetin`, `metin`,
   `targetText`, `portName`, `anahtar` geçerse hata veren 20 satırlık bir denetim; `swift-sozdizimi.py`'ye eklenebilir.
5. **Arayüz duman testi:** XCUITest ile `-ekran` kiplerinden birini açıp ana düğmenin etiketini okumak; görüntü adımı
   zaten simülatörü açtığı için ek maliyet küçük.

---

## 5. K1 için: derlemeyi kırabilecek ya da uyarı üretebilecek yerler

Kesin bir hata görmedim. Swift 5 dil kipi, iOS 18 hedefi, Xcode 26.6 ile `f937242` yeşildi; `9031f22`'de değişen
Swift satırları (yalnız `Hat`, `Durum`, `Tanilama`, `Anahtarlik`, `Sabitler`) arasında dikkat edilecekler:

| Yer | Neden |
| --- | ----- |
| `Anahtarlik.swift:6` `@MainActor enum` (yeni) | Çağıranlar: `Hat.oku` (ana aktör) ve `AyarlarEkrani` (`View`, iOS 18 SDK'da ana aktör). Ana aktör dışından çağrı yok; Swift 5'te uyarı beklemem. |
| `Hat.swift:952-956` `var calindi` kapanış içinde değiştiriliyor | Kapanış kaçmayan (`() -> Bool`) ve `withCheckedContinuation` gövdesinden çağrılıyor; `f937242`'deki biçimle aynı. Uyarı beklemem. |
| `Hat.swift:846` `hataKodu($0)` `nonisolated static` kapanıştan | `hataKodu` global ve yalıtımsız (`Tanilama.swift:127`); sorun yok. |
| `Hat.swift:586-591`, `:639-644` `Task { [weak self] … }` | Ana aktörü miras alır; `kesintiNotuSuresi` global `let` `TimeInterval` (Sendable). |
| `Hat.swift:522` `o.kesintiNedeni == 1` | `UInt?` ile tamsayı sabiti; geçerli. `.appWasSuspended` adının kullanılmaması kullanımdan kalkma uyarısından kaçınmak içindir. |
| `Tanilama.swift:90`, `:109` `nonisolated static` yardımcılar, `:106-107` statik `DateFormatter` | Ana aktörlü sınıfın statik özellik başlatıcısından yalıtımsız işlev çağrısı; `f937242`'de de vardı. |
| `Hat.swift:1061-1072`, `Durum.swift:74-79` `#if DEBUG` | Release hiç derlenmiyor (Q-14); okuyarak bakınca Release'te tanımsız ad kalmıyor (`onizlemeKipi` yalnız `Onizleme.swift`'ten, o da DEBUG). |
| Xcode 16 uyumu (README) | Kullanılan API'ler iOS 17–18'de var (`assumeIsolated`, `AVAudioApplication`, `sensoryFeedback`, `.translationTask`); Xcode 16 ile derlenmedi. |

---

## 6. Geliştiriciye iş listesi (son düzeltme turu)

**iOS (`ios-gelistirici`)**

1. Q-1: iş akışında uyarıyı hata say (ve isterse Q-14: Release derlemesi).
2. Q-4: `Durum.calistir` döngü sonrası savunma (3 satır).
3. Q-2: Ayarlar dipnotuna Alania cümlesi (metin arayüz denetçisiyle).
4. Q-3: Tanılama başlığına yapı etiketi (`S01 tur 4`).
5. Ses uzmanının Önemlileri Z-1, Z-2 ve arayüz denetçisinin iOS Önemlileri (C-2…C-7) kendi dosyalarında.
6. Öneri, zaman kalırsa: Q-7 (okunmayan notunu kaldır), Q-8 (Ayarlar geri yazması), Q-12 (dil paketi reddi iletisi).

**Web (`web-gelistirici`)**

1. **Arayüz C-1 (Engel):** Tanılama açılınca kayma; `focus({ preventScroll: true })` + teste dikey denetim.
2. Q-3: `SURUM`'u artır ve testte beklenen değere bağla.
3. Q-2: Ayarlar dipnotuna Alania cümlesi.
4. Ses uzmanının Z-9'u (yedek süre) ve arayüz C-5 kendi dosyalarında.
5. Öneri: Q-15 (çeviri hatası sarı not), Q-10 (`localStorage` ön eki), Q-18 (test: webkit, CORS'suz Alania, otomatik
   oynatmasız senaryo). Q-11 cihaz testi sonucuna bağlı.

**Lider:** Q-5 (README), K1'de uyarıları gözle oku, `CLAUDE.md` dosya listesi; birleştirmeden sonra yayındaki
`Sürüm:` satırını cihaz testi öncesi kontrol et. Ses uzmanı Z-6 (Tanılama satır adları) uygulanırsa `docs/cihaz-testi.md`
deki satır adlarını güncellemem için haber ver. **Arayüz denetçisi:** Q-13 (C-2, C-3 ile aynı).
