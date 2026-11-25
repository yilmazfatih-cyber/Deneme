# S01 — arayüz incelemesi (tur 2) · arayuz-denetcisi

Kapsam: iPhone uygulaması (gerçek iOS simülatör görüntüleri + Swift kodu) ve web deneme sürümü (320, 360, 390, 1280 px).
Şartname: `docs/tasarim.md` (bu turda güncellendi: §1.4 ölçülen oranlar, §3.2, §4.1 aşamalar ve §4.1.1 Dinamik Yazı
tablosu, §5, §6, §7).

## Yöntem ve sınırlar (ilke 8)

- **iPhone:** `docs/sprints/S01/shots/` (iPhone 17, iOS 26.5, Xcode 26.6, koyu görünüm, commit `f937242`). Görüntüler
  603×1311 piksel = 402×874 pt (1 pt = 1,5 piksel). Dokunma alanı ve boşluklar bu orana göre ölçüldü; karşıtlık oranları
  görüntü piksellerinden hesaplandı (PNG renk profili yok, `maviDolgu` düğmesinin pikseli tam `#2b72e5` çıktı: renkler
  belirteçleri koruyor). Arayüz kodu görüntülerden sonra değişmedi; iki yeni sarı not metni `Durum.swift` / `Hat.swift`
  üzerinden okundu, görüntüsü yok.
- **Web:** `node tests/web-akis.cjs` yeşil (**204 geçti, 0 kaldı**). Buna ek olarak kendi Playwright betiğimle 4 genişlik ×
  12 durumda (boş, hazırlanıyor, dinliyorum, canlı metin, çeviri var, durdu, duraklatıldı: sayfa arka planda,
  duraklatıldı: okuma sürüyor, Ayarlar, Tanılama, Geçmiş, dil menüsü) taşma, dokunma alanı ve piksel karşıtlığı ölçüldü.
  Ölçümler **Chromium**'da; Safari/WebKit'te denenmedi.
- **Doğrulanamayanlar:** gerçek iPhone + VoiceOver (etiketler koddan okundu; konuşma biçimi `cihaz-testi.md` işi);
  Çeviri dışındaki ekranlarda en büyük Dinamik Yazı; iPhone SE sınıfı küçük ekran (iOS görüntüsü yalnız 402×874).

## Özet

| Önem | Sayı | iOS | Web | Her ikisi |
| ---- | ---- | --- | --- | --------- |
| Engel | 1 | — | 1 (C-1) | — |
| Önemli | 7 | 5 (C-2, 3, 4, 6, 7) | 1 (C-5) | 1 (C-8) |
| Öneri | 4 | 3 (C-9, 10, 11) | 1 (C-12) | — |

İlk turun **12 Önemli bulgusundan 11'i kapandı** (kanıtlar aşağıda), B-8 kısmen kapandı (C-2, C-3, C-4 olarak sürüyor).
Kabul edilen önerilerden yalnız B-19'un iOS yarısı (C-6) ve B-17'nin web yarısı (C-5) açık.

**En önemli üç bulgu**

1. **C-1 (Engel, web):** Gerçek bir dinleme oturumundan sonra Tanılama sayfası açılınca `.ekran` yukarı kayıyor; başlık ve
   "Bitti" ekran dışında kalıyor (456 px kayma, "Bitti" y = −444). Telefonda sayfa kapatılamıyor, yenilemek kaydı
   siliyor. Test yeşil çünkü konumu denetlemiyor. Tek satırlık düzeltme (`focus({ preventScroll: true })`).
2. **C-2 / C-3 (Önemli, iOS):** En büyük Dinamik Yazı'da (`ceviri-buyuk-yazi.png`) çeviri ekranda yok ve hata/kulaklık
   satırları kaydırılan alana taşındığı için görünmüyor (ilke 5). Öğe öğe düzeltme tablosu `tasarim.md` §4.1.1'de ve
   aşağıda C-2'de.
3. **C-5 / C-6 (Önemli):** Web'de dinlerken dil şeridi başlığı opaklık 0,6 ile 3,26:1 (en açık uçta 2,62:1); iOS'ta API
   anahtarı yer tutucusu 2,6:1. Diğer her gövde metni ölçümde ≥ 6,05:1 (alt sınır) çıktı.

---

## Engel

### C-1 · Web: Tanılama sayfası açılınca ekran kayıyor, başlık ve "Bitti" görünmüyor
- **Sahip:** web-gelistirici
- **Yer:** `web/app.js:374` (`tanilamayiAc` → `$('tanilamaBaslik').focus()`); aynı desen `app.js:383, 442, 1154, 1198, 1214,
  1219, 1225`; kapsayıcı `web/index.html:155-163` (`.ekran { overflow: hidden }`)
- **Gözlem (ölçüldü, Chromium; Safari'de denenmedi):** Sayfa `.sayfa` olarak `translateY(100%)` ile aşağıdan kayarak
  geliyor (`index.html:849-858`); `focus()` tam bu sırada çağrılınca tarayıcı, `overflow: hidden` olan `.ekran`'ı
  başlığı görünür kılmak için kaydırıyor. Olay listesi kısa iken kayma yok (0–8 px), **dört cümlelik bir oturumdan sonra
  `.ekran.scrollTop = 456`** (390×844; 320×568'de 318, 360×800'de 434). Sonuç: `getBoundingClientRect` ile başlık
  y = −442, **"Bitti" düğmesi y = −444…−400**; ekranda yalnız listenin ortası ve "Kopyala / Temizle" görünüyor
  (kendi betiğimin 320/360/390 px görüntülerinde: üstte kesilmiş satırlar, altta boş gradyan). `Esc` kapatıyor ama telefonda `Esc`
  yok; sayfayı yenilemek bellekteki kaydı siler, yani sorun bildirme amacına ters. `node tests/web-akis.cjs` 204/204 yeşil,
  çünkü yalnız yatay taşmayı denetliyor.
- **Neden Engel:** Tanılama sprintin ana çıktısı (K3/K4) ve proje sahibinin sorun anında ilk başvuracağı yer; gerçek bir
  oturumdan sonra kapatılamaz hale geliyor. (iPhone uygulamasında sorun yok; web Safari'de tekrarlanıp tekrarlanmadığı
  doğrulanmadı. Lider web'i ikincil sayarsa Önemli'ye indirebilir, ama düzeltme bir satır.)
- **Düzeltme:** (1) Bütün programatik odaklarda `el.focus({ preventScroll: true })`. (2) `.ekran { overflow: clip; }`
  (`hidden` yerine; programatik kaydırmayı da engeller, köşe yuvarlama çalışır). (3) Karşılığını teste ekle:
  4 cümlelik oturumdan sonra Tanılama'yı aç, `ekran.scrollTop === 0` ve `#tanilamaBitti.getBoundingClientRect().top >= 0`
  (C-12). Kopya üzerinde `preventScroll` ile denendi: üç senaryoda da `scrollTop = 0`.

---

## Önemli

### C-2 · iOS: en büyük Dinamik Yazı'da çeviri ekranda yok (`ceviri-buyuk-yazi.png`)
- **Sahip:** ios-gelistirici
- **Yer:** `CeviriEkrani.swift:33-62` (başlık), `:80-123` (dil şeridi), `:225-245` (ana düğme); `KokEkran.swift:101-135`
  (sekme çubuğu), `Bilesenler.swift:16` (kart başlığı)
- **Gözlem (görüntüden, pt):** başlık iki satır ≈ 120 pt (varsayılan 41); dil şeridi ≥ 305 pt ve alt yazısı ("için") alt
  blokta kesiliyor; ana düğme 139 pt (65); sekme çubuğu 137 pt (77), simgeler ≈ 61 pt (21). Kaydırılan alanın görünen 479
  pt'sini başlık ile dil şeridi dolduruyor; **"Şu An" kartı ve çeviri kaydırmadan hiç görünmüyor.** Çeviri uygulamanın
  asıl içeriği; "bitti" tanımı ("en büyük Dinamik Yazı'da metin kesilmiyor") sağlanmıyor.
- **Karar:** ölçeklenecek tek şey çeviri metni; geri kalanı sınırlanır, çünkü bu boyutta başlık, dil şeridi ve düğme
  çeviriyi ekrandan iter. Sınırlar öğe düzeyindedir (kökte genel sınır yok). **Uygulanabilir tablo** (aynısı `tasarim.md`
  §4.1.1'de):

| Öğe | Şimdi (AX5) | Sınır | Nasıl (SwiftUI) |
| --- | ----------- | ----- | --------------- |
| Çeviri metni ("Şu An", "Öncekiler", Geçmiş) | ölçekleniyor | **sınırsız** | dokunma; `.fixedSize(horizontal: false, vertical: true)` |
| Asıl cümle (`subheadline`) | ölçekleniyor | `...accessibility3` | `.dynamicTypeSize(...DynamicTypeSize.accessibility3)` |
| Aşama satırı, canlı metin | ölçekleniyor | `...accessibility2` | aynı |
| Kart başlığı "Şu An" / "Öncekiler" (`Kart`) | ≈ 44 pt | `...accessibility1` | başlık `Text`ine sınır |
| Başlık satırı "Canlı Çeviri" + CANLI | 2 satır, 120 pt | `...xxxLarge` | `baslik`e sınır; `buyukYazi` VStack dalı **kaldır**; hep `HStack`; `lineLimit(1)`, `minimumScaleFactor(0.7)`; rozet `fixedSize` sağda (≈ 340 pt < 362 pt) |
| Dil şeridi | 2+2 satır, ≥ 305 pt | `...xxxLarge`; `yaziBoyu >= .xxxLarge` iken **kompakt tek satır** | `let kompakt = durum.calisiyor \|\| yaziBoyu >= .xxxLarge`; `chevron` yalnız `!durum.calisiyor` iken; **`.disabled(durum.calisiyor)`** (şimdi `.disabled(kompakt)`, büyük yazıda dili değiştirilemez kılar); alt yazı VoiceOver ipucunda |
| Ana düğme | 139 pt, 2 satır | `...accessibility1` | etikete sınır + `lineLimit(1)` + `minimumScaleFactor(0.75)`; `minHeight: 62` kalır (≈ 70 pt) |
| Hata / sarı not / kulaklık satırı | **kaydırmaya taşınıyor, görünmüyor** | `...accessibility1`, **altta sabit blokta kalır** | bkz. C-3 |
| Sekme çubuğu | 137 pt, simge 61 pt | `...xxxLarge`, **etiketler kalır** (ilke 1) | bkz. C-4 |
| Boş durum simgesi | 54 → ≈ 170 pt | `min(bosSimge, 96)` | `GecmisEkrani.swift:36`, `TanilamaEkrani.swift:79` |

  **Yalnız-simge sekme çubuğu gerekmez:** `xxxLarge` sınırıyla çubuk ≈ 82 pt kalır ve etiketler sığar. **Beklenen sonuç
  (tahmin):** sabit alt kısım ≈ 220 pt, kaydırılan alanın tepesi ≈ 156 pt; "Şu An" kartı (asıl cümle 2 satır, çeviri 3
  satır) ≈ 280 pt ile ilk ekrana sığar. **Kabul:** CI'ye `ceviri-buyuk-yazi` (AX5) ve `ceviri-buyuk-yazi-ax3`
  (accessibility-large) birlikte konur; ikisinde çeviri ilk ekranda, düğme ve durum satırları tam.

### C-3 · iOS: büyük yazıda hata ve kulaklık satırı kaydırılan alana taşınıyor
- **Sahip:** ios-gelistirici
- **Yer:** `CeviriEkrani.swift:19` (`if buyukYazi { durumSatirlari }`) ve `:189` (`if !buyukYazi { durumSatirlari }`)
- **Gözlem:** `ceviri-buyuk-yazi.png`'de "AirPods Pro bağlı" satırı hiç yok; aynı durumda bir **hata** oluşsa (izin yok,
  tanıma durdu) metin dil şeridinin altında, ekran dışında kalır; düğme "Dinlemeyi Başlat"a döner ve kullanıcı neden
  durduğunu görmez. VoiceOver kullanıcısına duyuru gider ama büyük yazıyı görerek kullanan kişiye gitmez. İlke 5
  ("sessizce bozulmaz") ihlali.
- **Düzeltme:** `durumSatirlari`'nı her boyutta `altBlok`ta tut (iki `if`'i sil); her satıra `.lineLimit(3)` ve
  `.dynamicTypeSize(...DynamicTypeSize.accessibility1)`. Kaydırma alanı küçülürse bu bilinçli bir ödünleşmedir: durum
  çeviriden önemlidir.

### C-4 · iOS: sekme çubuğu simgeleri Dinamik Yazı sınırını aşıyor
- **Sahip:** ios-gelistirici
- **Yer:** `KokEkran.swift:103` (`@ScaledMetric(relativeTo: .body) simgeBoyu`), `:132` (`.dynamicTypeSize(...accessibility1)`)
- **Gözlem (`ceviri-buyuk-yazi.png`):** çubuk 137 pt, simge ≈ 61 pt. `@ScaledMetric` yapının *kendi* ortamını okur;
  sınır `body` içindeki alt görünüme verildiği için ölçek AX5'te çalışıyor, yalnız etiket sınırlanıyor.
- **Düzeltme:** sınırı çağrı yerine ver: `KokEkran.swift:51` → `SekmeCubugu(secili: $sekme).dynamicTypeSize(...DynamicTypeSize.xxxLarge)`
  ve `:132`'deki satırı sil; ayrıca `.font(.system(size: min(simgeBoyu, 28), weight: .semibold))`.

### C-5 · Web: kompakt dil şeridi başlığı 3,26:1
- **Sahip:** web-gelistirici
- **Yer:** `web/index.html:289-292` (`.dil-seridi[aria-disabled='true'] .dil-ad { opacity: .6 }`)
- **Hesap (piksel ölçümü, 390 px):** beyaz, opaklık 0,6 / `#225bca` = **3,38** (ölçülen çekirdek), hesapla 3,26; gradyanın en
  açık ucunda (`#2b72e5`) **2,62**. Alt yazı artık görünmediği için bu başlık tek bilgi ("hangi dili dinliyorum"); iOS'ta aynı
  başlık tam beyaz 6,12:1 (`dinliyor.png`). (B-17'nin alt yazı kısmı kapandı, başlık kısmı yeni bir sorun yarattı.)
- **Düzeltme:** `opacity` satırını sil (başlık 1,0: 6,15:1, en açık uçta 4,52:1). Devre dışılık ok yokluğu ve
  `aria-disabled` ile söylenir; iOS ile aynı olur.

### C-6 · iOS: API anahtarı yer tutucusu 2,6:1 (B-19'un iOS yarısı kapanmadı)
- **Sahip:** ios-gelistirici
- **Yer:** `AyarlarEkrani.swift:21` (`SecureField("pd_live_…", text: $anahtar)`), görüntü `ayarlar.png`
- **Hesap:** sistem yer tutucusu / `alan` = **2,62** (çekirdek), en uç 2,96; belirteçten (α 0,30) 2,40. Web'de aynı alan
  `--yer-tutucu` (α 0,5) ile 4,67:1 (geçer).
- **Düzeltme:** `SecureField("", text: $anahtar, prompt: Text("pd_live_…").foregroundStyle(.secondary))` (`.secondary`
  `kart` üstünde ≥ 6,05:1; `alan` üstünde 6,27:1 hesaplandı). Derlemede prompt rengi uygulanmazsa alanı `ZStack`'e al ve
  boşken `Text("pd_live_…").foregroundStyle(.secondary).allowsHitTesting(false).accessibilityHidden(true)` bindir.

### C-7 · iOS: sarı notlar VoiceOver'a duyurulmuyor, özellikle "Devam etmek için…"
- **Sahip:** ios-gelistirici
- **Yer:** `KokEkran.swift:66-79` (duyuru zinciri; `durum.notlar` için `onChange` yok), `Durum.swift:177-184`
- **Gözlem:** Aşama, hata, kulaklık ve yeni çeviri duyuruluyor; **notlar** (özellikle telefon kesintisi 10 sn sürünce çıkan
  "Devam etmek için Durdur'a, sonra Başlat'a dokunun." ve "Kesinti sırasında gelen çeviri okunmadı.") yalnız görsel.
  Bu iki not tam da kullanıcıya bir şey yapması gereken, ses yokken ortaya çıkan notlardır; VoiceOver kullanıcısı
  uzun bir kesintiden çıkış yolunu hiç duymaz (ilke 5).
- **Düzeltme:** `KokEkran`'a `.onChange(of: durum.notlar) { eski, yeni in for n in yeni where !eski.contains(n) { duyur(n.metin) } }`
  (`EkranNotu` zaten `Equatable`). `tasarim.md` § 5.2 #12 buna göre güncellendi.

### C-8 · İki sürüm: kaydırma kenarı sert kesiyor, alt blokla boşluk dar (K2: `kulakliksiz.png`, `ceviri.png`)
- **Sahip:** ios-gelistirici, web-gelistirici
- **Yer:** iOS `CeviriEkrani.swift:15-27` (`ScrollView` + `altBlok`); web `.kaydir` (`index.html:204-211`)
- **Gözlem:** `kulakliksiz.png`'de iki satırlık sarı uyarı alt bloğu ≈ 20 pt yükseltiyor; "Öncekiler" kartının son satırı
  ("Günaydın, size nasıl yardımcı olabilirim?") kaydırma alanının kenarında **harflerin ortasından yatay çizgiyle kesiliyor**
  (y ≈ 630 pt). K2 "hiçbirinde kesilen metin yok" der. `ceviri.png`'de kartın alt kenarı ile "AirPods Pro bağlı" satırı
  arası ≈ 10 pt (kartlar arası 20 pt): kaydırma alanının 20 pt alt dolgusu görünmüyor, çünkü içerik alandan ≈ 14 pt
  taşıyor; kabul edilebilir ama sıkışık. Web'de aynı (`320-7-duraklatildi-gizli.png`: "Öncekiler" başlığı yarım).
  `tanilama.png`'de (uzun liste) son satır da yarım; liste için doğal, solma ile yumuşar.
- **Düzeltme:** (1) Kaydırılan alanın alt 20 pt'si solsun: iOS 18 için `.mask { VStack(spacing: 0) { Color.black; LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .bottom).frame(height: 20) } }`
  (iOS 26'da `if #available(iOS 26, *) { .scrollEdgeEffectStyle(.soft, for: .bottom) }`); web `.kaydir { mask-image: linear-gradient(#000 calc(100% - 20px), transparent) }`.
  (2) `altBlok`a `.padding(.top, 8)` (web `.alt { padding-top: 8px }`): kart–satır arası ≥ 18 pt. (3) Aynı kural Tanılama
  listesine ve Ayarlar'a. Beklenen: kırpılan satır yarım görünmez, kaydırılabilirlik anlaşılır.

---

## Öneri

### C-9 · iOS: kesinti notları (metin, istif, kalıcılık)
- **Sahip:** ios-gelistirici (metin ve istif), ses-uzmani'na danışılarak (`okunmayanCeviri` ömrü, `Hat.swift:894`)
- **Değerlendirme:** Metinler kısa, yetişkin dilinde, suçlamıyor; ikincisi eylem söylüyor ("Devam etmek için Durdur'a, sonra
  Başlat'a dokunun." 50 karakter, 402 pt'te tek satır, 375 pt'te iki satıra inebilir, kesilmez). İkisi de **altta sabit
  blokta** çiziliyor, "Şu An" kartında yer açmıyor; iPhone 17'de (≈ 40 pt) sorun yok.
- **Öneriler:** (a) "okunmadı" belirsiz (çevrilmedi mi sanılır?): **"Kesintide gelen çeviri sesli okunmadı."** (çeviri ekranda
  duruyor). (b) Not türleri üst üste binince (kesinti sırasında kulaklıksız + sunucu tanıma + okunmadı + uzun kesinti) sabit
  blok 5 satıra çıkar; küçük ekranda (SE, 667 pt) çeviri alanı daralır: en çok **2 not** göster (en yenisi + hata), gerisi
  `+1` rozetiyle ya da en yeni önce. (c) `okunmayanCeviri` oturum sonuna kadar kalıyor; kesinti bitip bir sonraki çeviri
  **okununca** (`bildir?(.not(.okunmayanCeviri, nil))`) ya da 15 sn sonra kalksın; eski not "şu an bozuk" izlenimi verir.

### C-10 · iOS: dinlerken durum yeterince söyleniyor; canlı metin etiketi eksik
- **Sahip:** ios-gelistirici
- **Değerlendirme (`dinliyor.png`):** "Dinliyorum…" canlı metin varken görünmüyor ve bu **kabul edilebilir**: ilke 5
  için gerçek kanıt "duyulan metin akıyor"; ayrıca CANLI rozeti (`maviDolgu`, sağ üst), kırmızı "Durdur" düğmesi ve
  kompakt dil şeridi aşamayı üç ayrı işaretle söylüyor; metin yokken (`asamaSatiri`) "Dinliyorum…" geri geliyor. Kalan
  zayıflık: canlı metin, önceki çevirinin hemen üstünde 14 pt aralıkla soluk italik; yeni cümleyle eskisi karışabilir.
- **Öneri:** canlı metni `Label(canliMetin, systemImage: "ear")` yap (kulak simgesi "Dinliyorum…" ile aynı yerde kalır) ve
  `.accessibilityLabel("Duyulan: \(canliMetin)")` ekle (`tasarim.md` § 5.2 #7; şimdi ham metin okunuyor).

### C-11 · iOS: büyük yazıda diğer ekranlar görüntüsüz
- **Sahip:** ios-gelistirici
- **Gözlem:** Yalnız Çeviri'nin AX5 görüntüsü var. Koddan beklenen sorunlar: Geçmiş'te "Geçmiş" `largeTitle` (≈ 182 pt) ile
  "Temizle" (≈ 160 pt) aynı satırda 362 pt'e güçlükle sığar; Ayarlar'da `.segmented` Picker büyük yazıda kesilir; boş durum
  simgesi ≈ 170 pt.
- **Öneri:** iş akışına `gecmis-buyuk-yazi`, `ayarlar-buyuk-yazi`, `tanilama-buyuk-yazi` (hepsi AX5) ekle; "Temizle"ye
  `.dynamicTypeSize(...DynamicTypeSize.accessibility1)`, Picker'a `...xxxLarge` (C-2 tablosu).

### C-12 · Web: test, konum ve kayma denetlemiyor
- **Sahip:** web-gelistirici (`tests/`)
- **Gözlem:** 204 denetimin hiçbiri C-1'i yakalamadı; yatay taşma denetimi var, dikey konum yok.
- **Öneri:** (a) 4 cümlelik oturumdan sonra Tanılama: `#ekran.scrollTop === 0`, `#tanilamaBitti` üst kenarı ≥ 0, Bitti 44 px;
  aynısı 320×568'de. (b) Dil menüsü, Geçmiş onayı kapanınca odak `preventScroll` ile dönsün; her `focus()` sonrası
  `#ekran.scrollTop === 0` denetle. (c) Dinlerken dil şeridi başlığı için hesaplanan stil: `opacity === '1'`.

---

## İlk tur bulgularının kapanışı

| No | Durum | Kanıt |
| -- | ----- | ----- |
| B-1 sekme çubuğu | **Kapandı** | `KokEkran.swift:114` (simge gizli), `:123-124` (etiket, `.isSelected`), `:133-134` (kapsayıcı "Sekmeler"). SwiftUI'da `isTabBar` yok, "3 sekmeden 1" okunmaz: kabul (şartname § 5.2 #17 güncellendi). Simge ölçeği için C-4 |
| B-2 Temizle ≥ 44 pt | **Kapandı** | `GecmisEkrani.swift:24-25` (`minWidth/minHeight: 44`, `contentShape`), `:31` satır `minHeight: 44`; `gecmis.png`: metin 54 pt, başlıkla aynı eksende; Tanılama "Temizle": `tanilama.png` Kopyala altı 8 pt + 44 pt çerçeve merkezi (ölçülen 31 pt = 8 + 22 + yarım piksel) |
| B-3 anahtar alanı etiketi | **Kapandı** | `AyarlarEkrani.swift:27-29` (etiket, değer "Boş/Girildi", ipucu), `:87` başlıklar `.isHeader`. Yer tutucu karşıtlığı ayrı: C-6 |
| B-4 dil, başlık, sıra | **Kapandı (sapmalı)** | `Bilesenler.swift:37` asıl cümle `environment(\.locale, kaynakDil)`; `.isHeader`: `Bilesenler.swift:18`, `CeviriEkrani.swift:60`, `GecmisEkrani.swift:15`, `AyarlarEkrani.swift:17`, `TanilamaEkrani.swift:58`; sıra `Bilesenler.swift:38,41` (`accessibilitySortPriority`: çeviri önce). Şartnamenin "tek öğe + değer" biçimi uygulanmadı, iki öğe olarak kabul. **VoiceOver'ın İngilizce sesle okuduğu cihazda doğrulanmalı** (`environment(\.locale)` yolu) |
| B-5 duyurular | **Kapandı** (notlar hariç) | `KokEkran.swift:66-79` (aşama, hata, kulaklık, yeni çeviri), `Bilesenler.swift:67-70`, `TanilamaEkrani.swift:46,178`. Notlar: C-7 |
| B-6 beyaz / dolgu | **Kapandı** | `Sabitler.swift:58-59`; ölçüm: Başlat 4,52, CANLI 4,52, Kopyala 4,52, Durdur 4,51, dil şeridi alt yazısı 4,71–7,04 (`ceviri.png`, `dinliyor.png`); web `index.html:31,36`, ölçüm 4,52 / 4,51 |
| B-7 mavi / kırmızı metin | **Kapandı** | `Renk.maviMetin` `GecmisEkrani.swift:23`, `KokEkran.swift:119`: "Temizle" 6,99 (hesap 6,35), seçili sekme 7,25 (hesap 6,02); hata `acikKirmizi` `CeviriEkrani.swift:200` (hata görüntüsü yok: hesap 6,66–8,01; web ölçüm 7,41) |
| B-8 Dinamik Yazı | **Kısmen** | Kapanan: `minHeight: 62` `CeviriEkrani.swift:235`, `@ScaledMetric` `GecmisEkrani.swift:7`, `KokEkran.swift:103`. Kapanmayan: AX5'te çeviri yok (`ceviri-buyuk-yazi.png`) → C-2; durum satırları kaydırmaya taşınıyor → C-3; `@ScaledMetric` sınırı aşıyor → C-4 |
| B-9 dinlerken küçük ekran | **Kapandı** | iOS `dinliyor.png`: kompakt şerit 55 pt, başlık tek satır, çeviri ilk ekranda (SE sınıfı denenmedi); web `320-5-ceviri-canli.png`: 320×568'de çeviri görünüyor |
| B-10 web dokunma alanları | **Kapandı** | 4 genişlik × 12 durumda 44 px altı etkileşimli öğe **0** (betik); segment, anahtar satırı, Temizle h = 44; `index.html:343` (`.menu-oge min-height:48px`), `:656` (`.salter-satiri min-height:44px`) |
| B-11 web dil menüsü | **Kapandı** | `320-12-menu.png`: 7 dilin hepsi görünüyor; `app.js:296-310` (`menuyuKonumla`, kısa ekranda üste açar, kendi içinde kaydırır) |
| B-12 web canlı bölge | **Kapandı** | `index.html:1355-1356` ayrı `ceviriDuyuru` / `durumDuyuru`; "Şu An" kartında `aria-live` yok (`grep aria-live`: yalnız bu iki satır ve Tanılama duyurusu) |
| B-13 Geçmiş onayı | **Kapandı** | iOS `GecmisEkrani.swift:75-78` ("Geçmiş silinsin mi?" / "Geçmişi sil" / "Vazgeç"), `:65` dipnot, `gecmis.png`, `gecmis-bos.png`; web `gecmisOnay` (`app.js:265-267`) |
| B-14 web kulaklık notu | **Kapandı** | `app.js:37`; `320-2-hazirlaniyor.png`: "Web deneme sürümü · kulaklık durumu gösterilmez · çeviri internetten yapılır" |
| B-15 saklama metni | **Kapandı** | iOS `AyarlarEkrani.swift:30`, `ayarlar.png`; web `320-9-ayarlar.png` ("…yalnızca bu tarayıcıda saklanır.") |
| B-16 duraklat anahtarı | **Kapandı** | `index.html:1285` "Yalnız bu web sürümünde…"; iOS'a eklenmedi (KR5) |
| B-17 devre dışı şerit | **Kısmen** | iOS kapandı (`dinliyor.png`: başlık tam beyaz 6,12:1, alt yazı kalktı). Web: alt yazı kalktı ama başlık hâlâ `opacity .6` → C-5 |
| B-18 web `rem` | Birikim (KR5) | — |
| B-19 karşıtlık | **Kısmen** | Web kapandı: `--yer-tutucu` 4,67:1, seçili segment `#000`/`#8e8e93`, anahtar kenarlığı `index.html:674`, girdi çerçevesi `--girdi-cizgi`. iOS yer tutucu 2,62:1 → C-6; iOS seçili segment / iz 2,39:1 sistem bileşeni, kabul |
| B-20 `lang` | **Kapandı** | `app.js:184` (`asil.lang = satir.dil`), `:196` (canlı metin) |
| B-21 küçük tutarlılıklar | **Kapandı** | hata simgesi `Bilesenler.swift:57`; `textCase(.uppercase)` + `tr_TR` `AyarlarEkrani.swift:82-83` (`ayarlar.png`: "ALANİA-2 API ANAHTARI", doğru İ); ayraç 0,14 `Sabitler.swift:62`, web `--ayrac` 0,14; "Şu An" KR8 gereği değişmedi |
| B-22 `startsMediaSession` | **Kapandı** | `CeviriEkrani.swift:243`; cihazda denenmeli (`cihaz-testi`) |

---

## Kabul kriterleri

### K2 · görüntülerde kesilme / taşma

| Görüntü | Sonuç |
| ------- | ----- |
| `ceviri-bos` | Temiz. |
| `ceviri` | Temiz; "Öncekiler" kartı tam. Kart–alt blok aralığı ≈ 10 pt, dar (C-8). |
| `dinliyor` | Temiz. |
| `kulakliksiz` | **Kesme var:** "Öncekiler" son satırı kaydırma kenarında yarım (y ≈ 630 pt). Metin taşması yok, kaydırınca erişilir (C-8). |
| `gecmis` | Temiz. |
| `gecmis-bos` | Temiz. |
| `ayarlar` | Kesme yok; "Tanılama" kartının alt kenarı sekme çubuğuna ≈ 2 pt (içerik ≈ 18 pt kaydırılabilir), nefes payı yok. |
| `tanilama` | Liste son satırı ("çeviri · 16:21:34") kaydırma kenarında yarım; uzun liste için doğal, solma ile (C-8) yumuşar. Başlık, Bitti, Kopyala, Temizle tam. |

**K2: kısmen.** Yatay taşma ve başlık/düğme kesilmesi yok (8/8); ama 2 görüntüde kaydırma kenarı sert kesiyor, biri
(`kulakliksiz`) K2'nin "kesilen metin yok" şartıyla çelişiyor. C-8 düzeltilince (solma + 8 pt) karşılanır. Ek:
`ceviri-buyuk-yazi.png` sekiz görüntüden biri değil ama kesme ve eksik içerik gösteriyor (C-2).

### K6 · VoiceOver etiketleri ve 44 pt

Etiketler `docs/tasarim.md` § 5.2 ile satır satır karşılaştırıldı (kod): Çeviri #1-16, sekmeler #17-20, Geçmiş #21-24,
Ayarlar #25-33, Tanılama #34-44. **Sapmalar:** #7 canlı metin öneki yok (C-10, Öneri); #8/#10/#24 iki öğe (kabul, B-4);
#17 `isTabBar` yok (API yok); #12 notlar duyurulmuyor (C-7). Diğer her satır şartnameyle birebir (etiket, değer, ipucu,
`isHeader`, `startsMediaSession`, Tanılama devre dışı "Kaydı temizle").

| Denetim | Dokunma alanı | Kanıt |
| ------- | ------------- | ----- |
| Sekmeler | ≈ 107 × 63 pt (seçili kapsül ölçüldü; üçü eşit) | `ceviri.png`, `gecmis.png`; `KokEkran.swift:117-121` (`padding 10`, `contentShape(Capsule())`) |
| Dil şeridi | tam: ≈ 90 pt yüksek; kompakt: ≈ 55 pt (ölçülen 83 px) | `ceviri.png`, `dinliyor.png`; `CeviriEkrani.swift:112` (`minHeight: 56`) |
| Ana düğme / Kopyala | ≈ 65 pt (97–98 px) | `ceviri.png`, `dinliyor.png`, `tanilama.png`; `:235` |
| Temizle (Geçmiş) | görünür metin 54 × 20 pt, **hit alanı 44 × 44 pt** | kodda (`GecmisEkrani.swift:24-25`); görünmez alan görüntüden ölçülemez, merkez hizası tutarlı |
| Bitti (Tanılama) | görünür 29 pt geniş, **hit alanı 44 × 44** | `TanilamaEkrani.swift:67-68`; `tanilama.png` |
| Tanılama "Temizle" | ≥ 44 pt yüksek, tam genişlik | `TanilamaEkrani.swift:199`; Kopyala altı ölçüsü tutarlı |
| Ses seçici | ≈ 49 pt (74 px) | `ayarlar.png`; `AyarlarEkrani.swift:43` (`.controlSize(.large)`) |
| Tanılama satırı | ≥ 56 pt (kart 66 pt) | `ayarlar.png`; `AyarlarEkrani.swift:125` |
| Anahtar alanı | ≈ 49 pt (73 px) | `ayarlar.png` |
| Web: tüm etkileşimli öğeler | ≥ 44 px (0 ihlal, 4 genişlik × 12 durum) | betik |

**K6: karşılanıyor** (kod + görüntü). VoiceOver'ın gerçekte ne okuduğu ve İngilizce asıl cümlenin İngilizce sesle okunup
okunmadığı yalnız gerçek cihazda doğrulanır; `cihaz-testi.md` işi.

### K8 · karşıtlık

Ayrıntılı tablo `docs/tasarim.md` § 1.4'te (iOS 29 satır, web 13 satır). Özet:

| Çift | Ölçülen (çekirdek / en uç) | Hesap (alt sınır) | Eşik | Sonuç |
| ---- | -------------------------- | ----------------- | ---- | ----- |
| beyaz / `maviDolgu` (Başlat, CANLI, Kopyala) | 4,52 | 4,52 | 4,5 | geçer, sınırda |
| beyaz / `kirmiziDolgu` (Durdur) | 4,51 | 4,51 | 4,5 | geçer, sınırda |
| dil şeridi alt yazısı, beyaz / gradyan | 4,71 (sol) – 7,04 (sağ) | 4,52 | 4,5 | geçer |
| "Please keep your ticket with you." · `ikincil` / `kart` | 7,07 / 8,12 | 6,05 | 4,5 | geçer |
| "AirPods'u takın…" (boş durum) · `ikincil` / `kart` | 7,08 / 8,61 | 6,05 | 4,5 | geçer |
| "Geçmiş uygulama kapanınca silinir." · `ikincil` / zemin | 6,99 / 8,99 | 5,83 | 4,5 | geçer |
| "Çevrilen cümleler burada listelenir." · `ikincil` / `parilti` | 7,32 / 8,91 | 5,83 | 4,5 | geçer |
| "Henüz olay yok" (Ayarlar) · `ikincil` / `kart` | 6,90 / 7,87 | 6,05 | 4,5 | geçer |
| Olay ayrıntısı, saat (Tanılama) · `ikincil` / `kart` | 6,90 / 6,66 | 6,05 | 4,5 | geçer |
| Gizlilik cümlesi (Tanılama) · `ikincil` / `zemin` | 7,20 | 6,33 | 4,5 | geçer |
| Seçili sekme, Temizle, Bitti · `maviMetin` | 7,09–7,25 | 6,02–6,35 | 4,5 | geçer |
| `acikMavi` metin (kulaklık, canlı metin, saat) / `kart` | 11,24–12,64 | 9,27–9,69 | 4,5 | geçer |
| `sari` uyarı / zemin, `kart` | 12,06–13,34 | 10,33–10,80 | 4,5 | geçer |
| **API anahtarı yer tutucusu (iOS)** | **2,62 / 2,96** | 2,40 | 4,5 | **geçmez (C-6)** |
| **Web kompakt dil şeridi başlığı** | **3,38 (hesap 3,26; en açık uç 2,62)** | — | 4,5 | **geçmez (C-5)** |
| Web yer tutucu, `ikincil`, `sari`, `acikKirmizi`, `maviMetin` | 4,67; 6,17–6,35; 10,80; 7,41; 6,32 | — | 4,5 | geçer |
| iOS seçili segment / iz (metin dışı) | 2,39 | — | 3 | sistem bileşeni, kabul |

Not: iOS görüntüleri yarı boyutlu olduğundan ince harflerde çekirdek hem biraz parlayıp hem soluklaşabilir; bu yüzden
her satırda belirteçten hesaplanan alt sınır da verildi ve yalnız ikisinin de geçtiği satırlar "geçer" sayıldı. Dolgu
üstündeki beyaz yazılarda (düz renk) ölçüm kesindir. **K8: Engel (C-1) kapanana kadar sağlanmıyor; gövde metni
bakımından 2 açık Önemli (C-5, C-6), diğer her metin ≥ 4,5:1.**

### K9 · web

`node tests/web-akis.cjs`: **204 geçti, 0 kaldı**. 320, 360, 390, 1280 px × 12 durumda (kendi betiğim, durum listesi
yukarıda) belge genişliği = görünüm genişliği, görünür hiçbir öğe kenara taşmıyor; 320×568'de başlık, CANLI rozeti, dil
şeridi, düğme ve sekmeler tek satırda ve ekran içinde. **K9: karşılanıyor** (yatay taşma kriteri). Ama testin C-1'i
görmediğini not et (C-12).

---

## Diğer gözlemler

- **`ceviri.png` aralık / `kulakliksiz.png` kesme:** C-8'de. Kabul edilemez değil ama kulakliksiz'de K2 ile çelişiyor;
  solma + 8 pt ile kapanır, "yer değişmez" ilkesine dokunmaz.
- **`dinliyor.png`:** "Dinliyorum…" yok, CANLI + canlı metin + Durdur var; yeterli (C-10).
- **Saat biçimi:** `gecmis.png` "ÖS 4:21" simülatörün bölge ayarındandır (12 saatli bölge), Tanılama 24 saat (`16:21:53`).
  Gerçek Türkçe iPhone'da `16:21` çıkar; hata değil, şartname § 7'ye yazıldı.
- **Üç örnek çevirinin saati aynı** (`gecmis.png`): örnek veri; çeviri dizilişi sorun değil.
- **Aşama simgeleri:** iOS `hourglass` / `ear` / `pause.circle.fill`; web `kum` / `kulak` / `duraklat`; renkler aynı
  (`acikMavi`, `acikMavi`, `sari`); web duraklatıldı sarısı 10,80:1, hazırlanıyor mavisi 9,69:1.

## Web: yeni aşama metinleri (madde 7)

| Aşama | Metin | Renk | Simge | iOS ile |
| ----- | ----- | ---- | ----- | ------- |
| hazırlanıyor | "Hazırlanıyor…" | `acikMavi` 9,69:1 | kum saati | tutarlı |
| dinliyor | "Dinliyorum…" / canlı metin | `acikMavi` 9,69:1 | kulak | tutarlı |
| kesintide | "Duraklatıldı: okuma sürüyor" / "…sayfa arka planda" | `sari` 10,80:1 | duraklat | tutarlı (neden metni platforma özgü) |

Taşma yok (320 / 360 / 390 / 1280); "Duraklatıldı: sayfa arka planda" 320 px'te tek satır (`320-7-duraklatildi-gizli.png`).
Web'de aşama değişince CANLI rozeti yalnız "dinliyor"da; Durdur her aşamada (iOS ile aynı). Tek tutarsızlık: dinlerken dil
şeridi başlığı (C-5).

## iOS ile web arasındaki metin farkları (madde 8)

Hepsi `tasarim.md` § 7'ye işlendi; **düzeltilecek fark yok**, tek öneri C-5.

| Konu | iOS | Web | Değerlendirme |
| ---- | --- | --- | ------------- |
| Duraklatıldı nedeni | "arama, alarm ya da Siri", "uygulama arka planda", "ses yolu değişiyor", "mikrofondan ses gelmiyor" | "okuma sürüyor", "sayfa arka planda" | platforma özgü, uygun |
| Kesinti duyurusu | VoiceOver'a "Duraklatıldı: …" | duyurulmuyor | bilinçli (web'de okuma her cümlede tetikler) |
| Yedek ses terimi | "Apple sesi" | "cihazın sesi" | bilinçli (web motoru bilemez) |
| Sarı notlar | türü başına bir not, en çok 6, altta | tek not satırı | bilinçli; C-9(b) iOS için sınır |
| Kesinti sonrası notlar | "Kesinti sırasında gelen çeviri okunmadı." / "Devam etmek için Durdur'a, sonra Başlat'a dokunun." | yok | iOS'a özgü |
| Dil şeridi (dinlerken) | tam beyaz başlık | opaklık 0,6 | **tutarsız: C-5** |

---

## Geliştiriciye iş listesi

**iOS (`ios-gelistirici`)**
1. C-2: `CeviriEkrani.swift` ve `KokEkran.swift`'te öğe öğe Dinamik Yazı sınırları (tablo); başlık `HStack` + `xxxLarge`;
   dil şeridi `yaziBoyu >= .xxxLarge` iken kompakt, `.disabled(durum.calisiyor)`; ana düğme `accessibility1`, tek satır.
2. C-3: `durumSatirlari`'nı her boyutta `altBlok`ta tut (`CeviriEkrani.swift:19` ve `:189`'daki `if`'leri sil).
3. C-4: `SekmeCubugu` sınırını çağrı yerine taşı (`xxxLarge`), simge `min(simgeBoyu, 28)`.
4. C-6: API anahtarı yer tutucusu `.secondary` (prompt ya da bindirme).
5. C-7: `durum.notlar` değişince yeni notu `duyur`.
6. C-8: kaydırma alanı alt 20 pt solma + `altBlok` 8 pt üst dolgu (Çeviri, Tanılama, Ayarlar).
7. İş akışı: `ceviri-buyuk-yazi` (AX5) + `ceviri-buyuk-yazi-ax3`, ayrıca `gecmis/ayarlar/tanilama-buyuk-yazi` (C-11); yeni görüntü
   çıkınca K2 ve C-2 yeniden ölçülür.
8. Öneriler: C-9 (not metni, en çok 2 not, `okunmayanCeviri` ömrü), C-10 (canlı metin simgesi ve "Duyulan:" etiketi).

**Web (`web-gelistirici`)**
1. **C-1 (Engel):** tüm `focus()` çağrılarında `{ preventScroll: true }`; `.ekran { overflow: clip }`; kayma testi.
2. C-5: `.dil-seridi[aria-disabled='true'] .dil-ad` ve `.dil-ok` için `opacity` kaldır.
3. C-8: `.kaydir` alt 20 px solma, `.alt` 8 px üst dolgu.
4. C-12: testlere konum (`scrollTop === 0`, Bitti görünür) ve devre dışı şerit opaklığı.

**Cihaz testi / kalite:** VoiceOver ile "Dinlemeyi başlat" sonrası konuşmanın kesilmesi (B-22); İngilizce asıl cümlenin
İngilizce sesle okunması (B-4); "Devam etmek için…" notunun duyulması (C-7); AX5 ile Çeviri akışı.
