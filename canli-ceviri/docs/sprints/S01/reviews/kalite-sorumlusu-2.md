# S01 — Kalite incelemesi, tur 2 (kapanış doğrulaması) · kalite-sorumlusu

**Sonuç: 0 Engel · 0 Önemli · 1 Öneri (R-1, birikime).** Kapatıldığı bildirilen 38 bulgunun 38'i kodda kapalı; 3'ünün
görsel sonucu (C-2, C-6, C-8 iOS) yeni simülatör görüntüleriyle doğrulanacak (lider). K7 ✓, K8 ✓ (görüntü koşuluyla),
K11 ✓. K1 ve K2'nin son hâli: lider doğrulayacak.

İncelenen sürüm: iOS `2266283`, web `d44b238` (HEAD; `git status` temiz). Yöntem: `git diff fe54d87..HEAD` (Swift,
web, test, iş akışı) satır satır; değişen her işlevin çağrı yerleri ve çıkış yolları ayrıca okundu. Yeni öneri avlamadım;
yalnız kapanış ve ilk cihaz denemesini kıracak / yanıltacak gerileme arandı. Bu turda yalnız bu dosyayı ve
`docs/cihaz-testi.md`'yi yazdım.

## 1. Denetimler (kendim çalıştırdım, depo kökünden)

| Komut | Sonuç |
| ----- | ----- |
| `node canli-ceviri/tests/web-akis.cjs` | `220 geçti, 0 kaldı`, çıkış 0 (yeni: `Sürüm: S01 tur 4` beklentisi `:822`; dört cümleden sonra Tanılama `#ekran.scrollTop 0` üç boyutta `:1361`; dil menüsü ve Geçmiş onayı sonrası kayma yok `:1378`, `:1387`) |
| `python3 canli-ceviri/scripts/swift-sozdizimi.py --proje` | `13 dosya, 0 sorun` (yalnız sözdizimi; derleme değil) |
| `npm run check` | çıkış 0 (Prettier temiz, 53 test, içerik geçerli) — `docs/cihaz-testi.md` düzenlendikten sonra yeniden çalıştırıldı, yine 0 |

## 2. Kapanış tablosu

### iOS

| Bulgu | Durum | Kanıt |
| ----- | ----- | ----- |
| Z-1 motor hata alanı | kapandı | `Hat.swift:19-26` `SesHatasi` iki alanı kabul ediyor; `Durum.swift:239`, `:242` ve `Hat.swift:708` onu kullanıyor. `motor.start()` hatası sarılmadan akıyor (`Hat.swift:728` → `Durum.turkce`) |
| Z-2 sürdürme iletisi | kapandı | `Hat.swift:656-666`: görüşme / mikrofon başka uygulamada / genel üç ileti; davranış aynı (KR4) |
| Z-3 bekçi alarmı açıkken dönüş | kapandı | `Hat.swift:625` `neden == .bekci \|\| bekciAlarmi != nil`; telefon ve arka plan kesintisi alarmı zaten siliyor (`:567`, `:583`) |
| Z-4 10 sn notu metni | kapandı | `Hat.swift:600` "Dinleme kendiliğinden sürmezse Durdur'a, sonra Başlat'a dokunun." (KR17b) |
| Z-5 = C-9c = Q-7 okunmadı notu ömrü | kapandı | `Hat.swift:929` her okuma başlarken kaldırılıyor. Kesinti sürerken kalkmıyor: telefon / arka plan kesintisinde `seslendir` sıraya koymuyor (`:898-901`) ve `sesiKes` `sesNo`'yu artırdığı için sıradakiler `:928`'de dönüyor |
| C-2 en büyük yazı | kapandı (kod) · görüntü lider | `CeviriEkrani.swift:31-40` başlık tek satır, `...xxxLarge`, 0,7; `:73` kompakt şerit, `:110`, `:112` yalnız dinlerken devre dışı; `:124` aşama satırı `...accessibility2`; `:232` düğme; `Bilesenler.swift:18`, `:39`, `:43`; boş durum `GecmisEkrani.swift:37`, `TanilamaEkrani.swift:80`. `docs/tasarim.md` § 4.1.1 tablosunun her satırı karşılanıyor |
| C-3 durum satırları altta | kapandı | `CeviriEkrani.swift:183-191`: `buyukYazi` dalı silindi (grep: yok), `durumSatirlari` her boyutta `altBlok`ta, `lineLimit(3)`, `...accessibility1` |
| C-4 sekme simgeleri | kapandı | `KokEkran.swift:52` sınır çağrı yerinde, `:120` `min(simgeBoyu, 28)`, eski iç sınır silindi |
| C-6 yer tutucu karşıtlığı | kapandı (kod) · görüntü lider | `AyarlarEkrani.swift:23` `prompt: Text(…).foregroundStyle(.secondary)`. Rengin gerçekten uygulandığı yalnız `ayarlar.png`'de görülür (tasarım şartnamesi yedek yolu yazmış) |
| C-7 sarı not duyurusu | kapandı | `KokEkran.swift:74-78` yalnız yeni ya da metni değişen not duyuruluyor (`EkranNotu: Equatable`, `Durum.swift:43`) |
| C-8 kaydırma kenarı | kapandı (kod) · görüntü lider | `Bilesenler.swift:69-81` `altSolma()`; Çeviri `CeviriEkrani.swift:24`, Ayarlar `AyarlarEkrani.swift:71`, Tanılama `TanilamaEkrani.swift:33`; alt blok üst dolgu `CeviriEkrani.swift:191` |
| C-9a okunmadı metni | kapandı | `Hat.swift:910` "Kesintide gelen çeviri sesli okunmadı." |
| C-10 (yalnız VoiceOver etiketi) | kapandı | `CeviriEkrani.swift:158` "Duyulan: …" |
| C-11 büyük yazıda diğer ekranlar | kapandı (kod + iş akışı) · görüntü lider | iş akışı `:132-138` dört AX5 + bir AX3 görüntüsü; "Temizle" `GecmisEkrani.swift:23`; ses seçici `AyarlarEkrani.swift:46` |
| Q-1 uyarı işi kırar | kapandı | iş akışı `:37-62` (bkz. § 4) |
| Q-2 Alania cümlesi | kapandı | `AyarlarEkrani.swift:32` (KR17a metniyle birebir) |
| Q-3 yapı etiketi | kapandı | `Sabitler.swift:24` `yapiEtiketi = "S01 tur 4"`, `Tanilama.swift:55` başlık `Canlı Çeviri 1.0 (1) · S01 tur 4` |
| Q-4 döngü sessizce biterse (genişletilmiş) | kapandı | `Durum.swift:101-108`: gövde `calistirIc`'e taşındı; her çıkıştan sonra `benim == kimlik && calisiyor` ise `hataylaBitir("Çeviri durdu. Dinlemeyi yeniden başlatın.", neden: "hata çeviri döngüsü bitti")`. Olağan çıkışların hepsi kimliği artırıyor (Durdur `:73`, `hataylaBitir` `:221`); Durdur, U-3 (dil paketi inerken Durdur) ve `-ekran` kipinde yanlış ileti çıkmıyor (DEBUG kipinde `ayar` hiç atanmıyor, `:74-79`) |
| Q-8 (yalnız "değişmediyse yazma") | kapandı | `AyarlarEkrani.swift:73-83`: `onAppear` okuduğunu `sonAnahtar`'a da yazıyor; `onChange` eşitse yazmıyor, yani ziyaret başına geri yazma yok |
| Q-14 Release derlemesi | kapandı | iş akışı `:62` `derle Release`; görüntü adımı Debug yolunu kullanıyor (`:116`), Release ayrı klasöre derleniyor, çakışma yok |

### Web

| Bulgu | Durum | Kanıt |
| ----- | ----- | ----- |
| C-1 (Engel) Tanılama kayması | kapandı | `app.js:376`, `:385`, `:408`, `:444`, `:1168`, `:1198-1204`, `:1212`, `:1228-1239` hepsi `focus({ preventScroll: true })`; `index.html:161-162` `overflow: clip` (`hidden` eski tarayıcı yedeği). Test `:1361`, `:1368` üç boyutta `scrollTop 0`; liderin bağımsız ölçümü 456/434/318 → 0/0/0 |
| C-5 kompakt şerit başlığı | kapandı | `index.html` `opacity: .6` kuralı silindi (diff); tasarım § 3.2 "tam opak beyaz" |
| C-8 kaydırma kenarı | kapandı | `index.html:212-221` `mask-image` + menü açıkken kaldırma (`:has`); `.alt` üst dolgu 8 px (`:439`) |
| C-12 test kayma denetimi | kapandı | `tests/web-akis.cjs:1316-1390` |
| Z-9 (KR15) yedek süre | kapandı | `app.js:596-601` `start` yalnız `tanıma  start N ms`; `:489-498` geçiş yalnız `audiostart` / `sonuç`; `:535-541` 5 sn dolunca aşama değişmiyor, `hazirlikGecikti` satırı "Mikrofon bekleniyor. İzin istendiyse izin verin." (`:36`, `:206`) ve uyarılı `aşama  hazırlanıyor: 5 sn içinde audiostart ya da sonuç gelmedi`. `olay=yedek` kodda yok (grep) |
| Q-2 Alania cümlesi | kapandı | `index.html:1265-1268` |
| Q-3 sürüm | kapandı | `app.js:32` `SURUM = 'S01 tur 4'`, test `:822` |
| Q-15 tek çeviri hatası | kapandı | `app.js:772-787`: kırmızı satır yerine `d.not`; ağ ve sınır iletileri `ozgul` (`:821`, `:828`), diğerleri "Bir cümle çevrilemedi."; sonraki başarılı çeviride kalkıyor. Bkz. R-1 |

### Lider

| Bulgu | Durum | Kanıt |
| ----- | ----- | ----- |
| Q-5 README | kapandı | `README.md:9-10` "çoğu dilde … cihaz testinde görülecek", `:31` "AirPods'unki olabilir; cihaz testinde görülecek", `:33`; `:127-130` 10 sn notu ve görüşme istisnası; `:131-132` bekçi "en geç üç saniye"; `:77-78` Alania cümlesi; `:151` `npm run check` |
| `CLAUDE.md` dosya listesi | kapandı | "Mimari özeti → Dosyalar": `Tanilama.swift`, `Anahtarlik.swift`, `Arayuz/` (Tanılama sayfası dahil) |

**Sayım:** 38 bulgu → 38 kodda kapandı, 0 kısmen, 0 kapanmadı. Bunlardan C-2, C-6, C-8 (iOS) ve C-11'in **görsel
sonucu** `2266283` görüntüleriyle lider tarafından doğrulanacak; kod tarafında eksik yok.

Bilerek yapılmayanlar (KR14, birikimde; açık sayılmadı): Z-6, Z-7, Z-8, C-9b, C-10'un simgesi, Q-6, Q-9, Q-10, Q-12,
Q-16, Q-17, Q-18. `docs/cihaz-testi.md`'deki Tanılama satır adları Z-6 yapılmadığı için değişmedi.

## 3. Yeni bulgular (son turun getirdiği)

### Engel / Önemli

Yok. İlk cihaz denemesini kıracak ya da yanıltacak bir gerileme bulmadım. Özellikle bakılanlar: Q-4'ün genişletilmiş
denetiminin Durdur / dil paketi / önizleme yollarında yanlış "Çeviri durdu" çıkarması (çıkarmıyor); Z-5'in notu kesinti
sürerken kaldırması (kaldırmıyor); C-7'nin aynı notu yinelemesi (yinelemiyor, `contains` ile); Z-9'dan sonra web'in
"Hazırlanıyor"da takılı kalması (ilk sonuç her durumda geçişi yapıyor, `app.js:606`); C-1'den sonra başka `focus()`
çağrısının kaydırma yapması (hepsi `preventScroll`).

### Öneri

#### R-1 (Öneri, web) — Tek çeviri hatası Alania devre kesici notunu siliyor

**Yer:** `web/app.js:777-785` ile `:928`. Web'de tek not yeri var (`d.not`). Alania bu oturumda kapandıysa
(`KESICI_NOTU` / `ANAHTAR_NOTU`, "oturum boyunca" kalmalı, KR10) ve ardından bir MyMemory hatası olursa, not "Bir
cümle çevrilemedi."e döner; sonraki başarılı çeviri onu da siler. Ekranda Alania'nın kapalı olduğu artık yazmaz, cihaz
sesi okumaya devam eder. Tanılama'da yine yazılı; olasılık düşük (anahtar + çeviri hatası birlikte). İlk denemeyi
yanıltma payı küçük olduğu için Önemli saymadım.
**Düzeltme:** çeviri notunu yalnız `d.not` boşken ya da `ALANIA_NOTU`'yken yaz; kaldırırken önceki notu geri koy
(ya da iOS'taki gibi türlü not listesi: `d.notlar = { alania, ceviri }`). Birikime.

## 4. Mac iş akışı ve derleme riski (K1 için)

**İş akışı (`.github/workflows/canli-ceviri-ios.yml`) — mantık hatası görmedim:**

- **Uyarı işi kırıyor mu?** Evet. `derle()` (`:37-60`) önce `BUILD SUCCEEDED` yoksa, sonra `: warning:` ya da satır başı
  `warning: ` varsa `return 1`. Adım kabuğu belirtilmemiş; GitHub'ın varsayılanı `bash -e` olduğu için `derle Debug`'ın
  1 dönmesi adımı kırar ve Release'e geçilmez. `xcodebuild … || true` yalnız çıkış kodunu yutar; karar kayıttan verilir.
- **Release derleniyor mu?** Evet, `:62`. Ayrı kayıt (`derleme-release.log`) ve `if: always()` ile ikisi de saklanıyor
  (`:63-71`).
- **Desen:** `ld: warning:` gibi bağlayıcı uyarılarını da yakalar (doğru: onlar da uyarıdır). `appintentsmetadataprocessor[…]
  warning:` satırı `]` ile başladığı için desene uymaz (yorumdaki gerekçe doğru). İlk koşuda iş beklenmedik bir **araç**
  uyarısıyla kırılırsa kayıttaki `== Debug: hata ve uyarı satırları ==` bölümüne bakın: `.swift:` içermeyen bir satırsa
  derleyici uyarısı değildir; deseni o satıra göre daraltmak iOS geliştiricisinin işidir.
- **Küçük not:** `BILGI.txt`'deki "hata 0, uyarı 0" satırı sabit metindir; doğruluğu, o adımın yalnız derleme geçince
  çalışmasına dayanır (öyle: önceki adımlar kırılınca sonraki adımlar `always()` olmadıkça çalışmaz).
- `ceviri-buyuk-yazi-ax3` `accessibility-extra-large` ile alınıyor; bu AX3'tür (tasarım şartnamesindeki
  "accessibility-large" AX2 olurdu). Ad doğru, şartnamedeki örnek boyut adı yanlış; sonuç etkilenmez.

**Derleme kırılırsa ilk bakılacak satırlar** (kesin hata görmedim; Xcode 26.6, Swift 5 kipi, iOS 18 hedefi):

| Yer | Neden |
| --- | ----- |
| `AyarlarEkrani.swift:23` `SecureField("", text:, prompt: Text(…).foregroundStyle(.secondary))` | `Text.foregroundStyle` `Text` döndüren aşırı yüklemesi iOS 17+; `prompt: Text?` bağlamı onu seçmeli. Belirsizlik hatası çıkarsa `Text("pd_live_…").foregroundColor(.secondary)` aynı işi görür |
| `KokEkran.swift:74-78` `for not in yeni where !eski.contains(not)` | `not` anahtar sözcük değil; `onChange(of:)` iki parametreli kapanış iOS 17+. Sorun beklemem |
| `Bilesenler.swift:69-81` `extension View { @MainActor func altSolma() … mask { … } }` | `mask(alignment:_:)` iOS 15+; `View` iOS 18 SDK'da zaten ana aktörlü, `@MainActor` fazlalık ama uyarı vermez |
| `Hat.swift:19-26` `enum SesHatasi` (`private static let alanlar: Set<String>`) | Yalıtımsız; `Set<String>` Sendable, Swift 5 kipinde uyarı beklemem. `nonisolated static func oncelikYetersiz` (`:707`) içinden çağrılıyor, uygun |
| `Durum.swift:101-111` `calistir` → `private func calistirIc(…) async` | Ana aktörlü sınıf içinde; `benim` kullanılıyor (kullanılmayan değişken uyarısı yok) |
| `CeviriEkrani.swift:73` `yaziBoyu >= .xxxLarge` | `DynamicTypeSize` `Comparable`; geçerli |
| `CeviriEkrani.swift:184` `Group { durumSatirlari }.lineLimit(3)` | `durumSatirlari` `@ViewBuilder`; geçerli |
| Release'e özgü | Yeni `#if DEBUG` yok; Release'te tanımsız ad kalmıyor (`onizlemeKipi`, `ornekleDoldur`, `OrnekEkran` yalnız DEBUG'dan çağrılıyor). Release'in ilk kez derlenmesi olduğu için yalnız Release kaydında uyarı çıkarsa önce DEBUG dışında kalan ama yalnız DEBUG'da kullanılan bir ad aranmalı (bugün yok) |

## 5. Kabul kriterleri (son hâl)

| No  | Durum | Kanıt / neden |
| --- | ----- | ------------- |
| K1  | lider doğrulayacak | `2266283` işi kuyrukta. İş akışı artık uyarıda ve Release'te kırılıyor (§ 4); yeşilse "hatasız ve uyarısız, Debug + Release" kanıtıdır, kaydı ayrıca gözle okumaya gerek kalmaz |
| K2  | lider doğrulayacak | 13 görüntü (`:128-138`): sekiz ekran + `ceviri-buyuk-yazi`, `-ax3`, `gecmis-`, `ayarlar-`, `tanilama-buyuk-yazi`. Bakılacaklar: AX5'te "Şu An" kartı ve çeviri ilk ekranda, düğme ve durum satırları tam (C-2, C-3); `ayarlar.png`'de yer tutucu okunur gri (C-6); `kulakliksiz.png`'de son satır yarım değil, solarak bitiyor (C-8). Depodaki `shots/` hâlâ `f937242`'den; lider yeni görüntüleri sprint klasörüne almalı |
| K3  | ✓ | Değişmedi (tur 1 kanıtı geçerli); yeni olay `durdur  neden=hata çeviri döngüsü bitti` içerik taşımıyor; başlıkta yapı etiketi (`Tanilama.swift:55`) |
| K4  | ✓ | 220/220; Tanılama içerik denetimleri ve `Sürüm: S01 tur 4` |
| K5  | ✓ | Değişmedi; Q-8 koruması eklendi (`AyarlarEkrani.swift:80`) |
| K6  | ✓ (kod) · VoiceOver okuması cihazda (U-24) | Tur 1 kanıtı + notlar duyuruluyor (`KokEkran.swift:74`), canlı metin "Duyulan: …" (`CeviriEkrani.swift:158`) |
| K7  | ✓ | **Ses incelemesinde Engel yok, Önemliler kapandı:** `ses-uzmani-3.md` 0 Engel, 3 Önemli (Z-1, Z-2, Z-9) — üçü de kapandı (§ 2); önceki turların Engel ve Önemlileri `ses-uzmani-3.md` § 1'de kapalı. Yapılan öneriler Z-3, Z-4, Z-5 de kapandı; Z-6/7/8 birikimde |
| K8  | ✓ (C-2, C-6, C-8 görüntü koşuluyla) | **Arayüz incelemesinde Engel yok, Önemliler kapandı:** C-1 (Engel) kapandı ve testle korunuyor; C-2…C-8 kodda kapandı. Karşıtlık oranları hesaplı (`docs/tasarim.md` § 1.3–1.4), C-5 ve C-6 ile kalan iki düşük oran giderildi. Lider K2'de AX5 ve `ayarlar.png`'de beklenen görünümü görmezse K8 o maddede yeniden açılır |
| K9  | ✓ | 220/220; 320/360/390/1280 yatay taşma yok, ayrıca dikey kayma yok |
| K10 | ✓ | `docs/cihaz-testi.md` S01 tur 4'e göre güncellendi; § 7 karşılık tablosu D1–D35 ve K1–K16'yı kapsıyor (`docs/ses-hatti.md` § 7 yeniden okundu) |
| K11 | ✓ | Bu inceleme: 0 Engel, 0 Önemli; tur 1'in Q-1…Q-5'i kapandı; her satır kanıtlı |
| K12 | ✓ | `npm run check` çıkış 0 (kendim, iş akışı değişikliğinden ve bu belgeden sonra) |

## 6. `docs/cihaz-testi.md` değişiklikleri

Sürüm satırı `S01 tur 4` (`2266283` + `d44b238`). § 0.2 (bilinen hata yalnız eski sürüm için; satır adları kesin),
W-0 (`Sürüm: S01 tur 4`), W-1, W-2 (yeni beklenti: 5 sn'de aşama değişmez, "Mikrofon bekleniyor…"), W-6 (dipnot),
W-9 (sarı not, kırmızı yalnız tanıma durunca), U-0 (kopya başlığı), U-1 ("Çeviri durdu" durumu), U-9 (yeni not
metinleri, notun kalkışı), U-10 (görüşme iletisi), U-11, U-12, U-13, U-14, U-17 (iletiler), U-20 (dipnot), U-22,
U-24 (VoiceOver duyuruları + büyük yazı bölümü), sonuç tablosu konu adları, § 7 tablosu (D34 ve geliştirici maddeleri).
Senaryo numaraları değişmedi.
