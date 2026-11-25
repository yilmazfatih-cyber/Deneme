# S01 — arayüz incelemesi (tur 1) · arayuz-denetcisi

Kapsam: iPhone uygulaması ve web deneme sürümü; dokunma alanı, karşıtlık, taşma/kesilme, Dinamik Yazı, VoiceOver, iki
sürümün tutarlılığı, metin ve ilke 5/6. Şartname: `docs/tasarim.md`.

## Yöntem ve sınırlar (ilke 8)

- **iPhone: koddan okundu, görüntüyle doğrulanmadı.** Simülatör görüntüleri bu sprintte gelecek (K2). Okunan dosyalar:
  `CanliCeviri/Sabitler.swift`, `CanliCeviri/Arayuz/*.swift`. Dinamik Yazı ve VoiceOver bulguları kodun okunmasından
  çıkarılan **beklentidir**; Xcode'da Erişilebilirlik Denetçisi ve görüntü gelince tur 2'de doğrulanır. VoiceOver'ın
  gerçekte ne okuduğu yalnız gerçek cihazda doğrulanır.
- **Web: gerçek görüntü ve ölçüyle doğrulandı.** `node tests/web-akis.cjs` (72 geçti, 0 kaldı) ile 390 ve 1280 px
  görüntüleri; ayrıca 320 × 568, 360 × 800 ve 360 × 640 için Playwright betiğiyle ölçüm ve görüntü. Yatay taşma 320, 360, 390
  ve 1280 px'te **yok** (K9'un bu kısmı sağlanıyor). VoiceOver ve Dinamik Yazı web'de denenmedi; erişilebilirlik ağacı
  HTML'den okundu.
- Karşıtlık oranları betikle hesaplandı (saydam renkler zemine karıştırılarak, sRGB göreli parlaklık); tablo
  `docs/tasarim.md` §1.3'tedir.

## Özet

| Önem    | Sayı | iOS | Web | Her ikisi |
| ------- | ---- | --- | --- | --------- |
| Engel   | 0    | —   | —   | —         |
| Önemli  | 12   | 6   | 3   | 3         |
| Öneri   | 10   | 2   | 5   | 3         |

**Engel yok.** K8 kapısı (gövde metni ≥ 4,5:1) geçiyor: beyaz ve `ikincil` metinlerin en düşük oranı 6,05:1. Ancak
**K6 (VoiceOver etiketleri, 44 pt) şu an sağlanmıyor**: B-1, B-2, B-3 ve B-4 kapanmadan K6 işaretlenemez. Üç Önemli bulgu
(B-6, B-7: beyaz/`mavi` 4,02:1; "Temizle" mavisi 4,19:1; B-9: dinlerken çeviri ekran altında) kullanıcı için en görünür olanlardır.

**En önemli üç bulgu:** (1) B-6/B-7 mavi ve kırmızı dolgu üstündeki beyaz yazı 4,02–4,08:1, ışımadaki mavi metin 4,19:1: kapı
eşiği 4,5. (2) B-9 küçük ekranda dinlerken Türkçe çeviri, dil şeridi ve iki satıra bölünen başlık yüzünden ekran altına düşüyor;
çevirinin kendisi görünmüyor. (3) B-1…B-5 iPhone'da sekme çubuğu, API anahtarı alanı ve "Temizle" VoiceOver etiketsiz/küçük; hata,
kulaklık ve dinleme durum değişimleri VoiceOver'a **duyurulmuyor** (ilke 5).

Sahipler: `ios-gelistirici` (iOS), `web-gelistirici` (web). Ortak bulgularda iki sahibe de yazıldı.

---

## Önemli

### B-1 · Sekme çubuğu düğmeleri açık etiket ve sekme özelliği taşımıyor
- **Sahip:** ios-gelistirici
- **Yer:** `KokEkran.swift:66-87` (`SekmeCubugu`)
- **Gözlem (koddan):** Düğme etiketi `VStack{Image(systemName:), Text}`; açık `accessibilityLabel` yok, simge gizli değil,
  yalnız seçili durumda `.isSelected` ekleniyor (`:79`). VoiceOver'ın simge adını da okuma ihtimali var; kapsayıcıda sekme
  çubuğu özelliği yok, "3 sekmeden 1" bilgisi sistemden gelmiyor.
- **Düzeltme:** simgeye `.accessibilityHidden(true)`; düğmeye `.accessibilityLabel(s.ad)`; kapsayıcı `HStack`'e
  `.accessibilityElement(children: .contain)` + `.accessibilityAddTraits(.isTabBar)`; seçili `.isSelected` kalsın. Beklenen
  okuma: "Çeviri, seçili, düğme". Tablo: `tasarim.md` §5.2 #17–20.

### B-2 · "Temizle" düğmesinin dokunma alanı ≈ 20 pt
- **Sahip:** ios-gelistirici
- **Yer:** `GecmisEkrani.swift:14-16`
- **Gözlem (koddan):** `Button("Temizle")` yalnız `.subheadline` metnin kendi yüksekliğinde (≈ 20 pt), dolgu ve `contentShape` yok.
  K6 açıkça "Temizle dahil ≥ 44 pt" diyor. Web'de aynı düğme ölçüldü: 68 × 35 px.
- **Düzeltme:** `.frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())`; sağa hizalı kalsın (başlık satırının
  yüksekliğini bozmasın: satırda `.frame(minHeight: 44)`). VoiceOver etiketi "Geçmişi temizle", ipucu "Bu oturumdaki tüm
  çevirileri siler".

### B-3 · API anahtarı alanının etiketi yer tutucu "pd_live_…"
- **Sahip:** ios-gelistirici
- **Yer:** `AyarlarEkrani.swift:15`
- **Gözlem (koddan):** `SecureField("pd_live_…", text:)` — başlık dizgesi hem yer tutucu hem VoiceOver adıdır; VoiceOver
  "pd alt çizgi live…" okur, alanın ne olduğunu söylemez. Üstteki "ALANIA-2 API ANAHTARI" metni alana bağlı değil.
- **Düzeltme:** `.accessibilityLabel("Alania-2 API anahtarı")` ve `.accessibilityHint("Boş bırakırsanız çeviri Apple'ın Türkçe
  sesiyle okunur")`. Bölüm başlığı metinlerine `.accessibilityAddTraits(.isHeader)` (`:52-57`). Web'de alan zaten
  `aria-labelledby` ile etiketli (`index.html:914`).

### B-4 · Asıl cümle yanlış dille okunur; başlıklar başlık özelliği taşımıyor
- **Sahip:** ios-gelistirici
- **Yer:** `Bilesenler.swift:15` (`Kart` başlığı), `:31` (asıl cümle `Text`), `CeviriEkrani.swift:27-43`, `GecmisEkrani.swift`
  (ekran başlıkları), `AyarlarEkrani.swift:11,52-57`
- **Gözlem (koddan):** (a) "Good morning…" gibi yabancı cümle, Türkçe VoiceOver sesiyle okunur (anlaşılmaz). Ekranların amacı
  çeviri olduğu için bu en sık karşılaşılacak okumadır. (b) Ekran başlıkları, "Şu An" / "Öncekiler" ve bölüm başlıkları
  `.isHeader` taşımıyor; rotor "Başlıklar" boş kalır. (c) Çeviri ve asıl iki ayrı öğe; sıra karışabilir.
- **Düzeltme:** `Satir`'a `kaynakDil` (kod) ekle; asıl `Text`'e `.accessibilityLanguage(satir.kaynakDil)`. `SatirGorunumu`
  `.accessibilityElement(children: .ignore)` + etiket = çeviri, değer = "Söylenen: \(asıl)" (tablo §5.2 #8, 10, 24). Başlıklara
  `.accessibilityAddTraits(.isHeader)`. Dil değişikliği veri modelini ilgilendirdiği için `Durum.swift` sahibi aynı kişidir.

### B-5 · Durum değişimleri VoiceOver'a duyurulmuyor (ilke 5)
- **Sahip:** ios-gelistirici
- **Yer:** `CeviriEkrani.swift:113-120` (kulaklık satırı), `:122-129` (hata), `:131` (düğme); `Durum.swift:29,42,61` (`hata` atamaları)
- **Gözlem (koddan):** Hata metni, kulaklık satırı ve CANLI rozeti **yalnız görsel olarak** değişiyor. VoiceOver kullanıcısı
  "Dinlemeyi başlat"a basar; izin reddedilirse (`hata = "Mikrofon ve konuşma tanıma izni gerekli…"`) hiçbir ses gelmez ve
  kullanıcı dinlediğini sanır. Kulaklık koptuğunda da sessiz. Bu, ilke 5'in tam karşılığıdır ("sessizce bozulmaz").
- **Düzeltme:** `AccessibilityNotification.Announcement("…").post()` — hata atanınca hata metni; kulaklık değişince
  "Kulaklık bağlandı" / "Kulaklık bağlantısı koptu"; başlat/durdur sonrası "Dinleme başladı" / "Dinleme durdu". Metinler
  `tasarim.md` §5.3'te. Hata `Text`'ine `.accessibilityAddTraits(.updatesFrequently)` gerekmez; duyuru yeter.

### B-6 · Beyaz yazı mavi ve kırmızı dolgu üstünde 4,5:1'in altında
- **Sahip:** ios-gelistirici, web-gelistirici
- **Yer:** `Sabitler.swift:38,41`; `CeviriEkrani.swift:132-139` ("Dinlemeyi Başlat" / "Durdur"), `:35` (CANLI rozeti), `:59`
  (dil şeridi alt yazısı, beyaz %85); web `--mavi`/`--kirmizi` `index.html:30,33`, `.ana-dugme` `:388-409`, `.canli` `:223-232`,
  `.dil-ipucu` `:266-269`
- **Hesap:** beyaz / `mavi` `#2e7af5` = **4,02**; beyaz / `kirmizi` `#eb3833` = **4,08**; beyaz %85 / `mavi` (dil şeridi alt
  yazı 15 pt) = **3,35**. 20 pt semibold büyük metin eşiğine girmez (600 < 700), eşik 4,5. CANLI (13 pt bold) kesinlikle
  küçük metin.
- **Düzeltme:** yeni belirteçler `maviDolgu` `#2b72e5` (beyazla **4,52**) ve `kirmiziDolgu` `#de3530` (**4,51**); Başlat,
  CANLI rozeti, dil şeridi gradyan başı ve anahtar (açık) `maviDolgu`'ya, Durdur `kirmiziDolgu`'ya geçer. Dil şeridi alt yazısı
  `opacity(0.85)` yerine tam opak beyaz (4,52). Renkler arası fark gözle neredeyse ayırt edilmez; tema bozulmaz.

### B-7 · Mavi ve kırmızı **metin** açık zeminlerde 4,5:1'in altında
- **Sahip:** ios-gelistirici, web-gelistirici
- **Yer:** `GecmisEkrani.swift:16` ("Temizle", `Renk.mavi`); `KokEkran.swift:75` (seçili sekme); `CeviriEkrani.swift:127`
  (hata, `Renk.kirmizi`); web `.temizle` `index.html:439-444`
- **Hesap:** `mavi` / `parilti` = **4,19**, `mavi` / `kart` = **4,39** (Temizle ve kart içi mavi metin; `zemin` üstünde 5,05,
  `alan` üstünde 4,79 geçer — yani sonuç ekranın neresinde durduğuna bağlı). iOS hata metni `kirmizi` / `zemin` 4,98 geçer
  ama `parilti` üstünde **4,14** (ışıma bölgesi ekranın ortası, hata metni düğmenin üstünde ışımaya yakın).
- **Düzeltme:** mavi metin ve simge için yeni `maviMetin` `#4a8ff7` (`zemin` 6,35 · `parilti` 5,28 · `kart` 5,52 · `alan`
  6,02); iOS hata metni için web'deki `acikKirmizi` `#ff7a73` (`zemin` 8,01 · `parilti` 6,66 · `kart` 6,96).

### B-8 · Dinamik Yazı: sabit boyutlar ve düğme yüksekliği kesilmeye yol açabilir
- **Sahip:** ios-gelistirici
- **Yer:** `CeviriEkrani.swift:139` (`.frame(height: 62)`), `:27-43` (başlık satırı), `GecmisEkrani.swift:23`
  (`.system(size: 54)`), `KokEkran.swift:70` (`.system(size: 21)`), `CeviriEkrani.swift:113-139` (alt blok)
- **Gözlem (koddan; görüntü yok, doğrulanmadı):** (a) Ana düğmenin yüksekliği sabit 62: büyük boyutta `title3` etiketi iki
  satıra inince metin kesilir. (b) "Canlı Çeviri" `largeTitle` + simge + CANLI rozeti tek `HStack`'te; erişilebilirlik
  boyutlarında başlık ya da rozet sıkışır (web 320 px'te aynı satır zaten iki satıra bölünüyor, bkz. B-9). (c) Alt blok
  (hata + kulaklık + düğme) `ScrollView` dışında sabit: en büyük boyutta ekranın büyük bölümünü yiyip "Şu An" kartını
  kaydırılan dar bir şeride sıkıştırabilir. (d) Sekme simgeleri ve boş durum simgesi `@ScaledMetric` değil.
- **Düzeltme:** `.frame(minHeight: 62)`; başlık satırı `ViewThatFits` ile rozeti başlığın altına geçirsin;
  `SekmeCubugu`'na `.dynamicTypeSize(...DynamicTypeSize.accessibility1)`; simge boyutları `@ScaledMetric(relativeTo: .title)`;
  alt blok en çok ekranın üçte biri, fazlası kaydırma alanına. Doğrulama: simülatörde `accessibility5` görüntüsü (öneri:
  iş akışına `-ekran ceviri` için ek bir Dinamik Yazı görüntüsü).

### B-9 · Dinlerken küçük ekranda çeviri ekranın altına düşüyor
- **Sahip:** ios-gelistirici, web-gelistirici
- **Yer:** web Çeviri ekranı 320 × 568 (görüntü: `320-dinliyor-uzun.png`); iOS `CeviriEkrani.swift:15-27, 46-73`
- **Gözlem (web: görüntüyle doğrulandı; iOS: koddan, hesapla):** 320 px'te başlık "Canlı / Çeviri" iki satıra bölünüyor
  (CANLI rozeti yüzünden), dil şeridi 110 px, kaydırma alanı yalnız 366 px: "Şu An" kartı ancak ilk satırını gösteriyor,
  Türkçe çeviri kaydırmadan görünmüyor. Uygulamanın amacı çeviriyi göstermek; dinlerken dil şeridi (devre dışı, işe yaramıyor)
  ekranın en değerli yerini tutuyor. 360 × 640'ta da çeviri kartının yarısı görünüyor. iPhone SE sınıfı (≈ 667 pt) için
  koddan benzer bir sıkışma bekleniyor; doğrulanmadı.
- **Düzeltme (`tasarim.md` §4.1):** dinlerken dil şeridi 56 yüksek kompakt tek satıra iner (alt yazı kalkar), başlık tek
  satırda kalır (`minimumScaleFactor(0.8)`, rozet `fixedSize`). Gerekirse "Şu An" kartı kaydırma alanının üstüne sabitlenir.

### B-10 · Web: dokunma alanları 44 px'in altında
- **Sahip:** web-gelistirici
- **Yer:** `index.html:523-529` (`.bolumlu button` height 28), `:544-552` (`.salter` 51 × 31), `:439-444` (`.temizle`,
  ölçüm 68 × 35), `:283-291` (`.menu-oge`, ölçüm 42–43 px)
- **Gözlem (ölçüldü, 320/360):** Kadın/Erkek **28 px**, anahtar **31 px** (etiket metni dokunulamıyor, yalnız anahtar), Temizle
  **35 px**, menü öğeleri **42–43 px**. Ana düğme 62, sekmeler 61, dil şeridi 110, girdi 48: yeterli.
- **Düzeltme:** `.bolumlu button { min-height: 44px }` (`.bolumlu` yüksekliği 48); `.salter-satiri` tamamı `<label>`/düğme
  olarak ≥ 44 px (`min-height: 44px`, satıra dokununca anahtar değişir); `.temizle { min-height: 44px; padding: 0 0 0 12px }`;
  `.menu-oge { padding-block: 13px }` (≥ 47 px).

### B-11 · Web: dil menüsü kısa ekranda kesiliyor
- **Sahip:** web-gelistirici
- **Yer:** `index.html:270-282` (`.menu`, `position:absolute` kaydırma alanının içinde), `.kaydir` `:180-187`
- **Gözlem (görüntüyle doğrulandı, `320-menu.png`):** 320 × 568'de menü 7 dilden yalnız 4'ünü gösteriyor (İngilizce…İspanyolca);
  İtalyanca, Rusça ve Arapça alt tarafta, sekme çubuğunun ve düğmenin arkasında. Ölçüm: menü alt kenarı 503 px, kaydırma
  alanı alt kenarı 366 px (320 × 568) ve 438 px (360 × 640); 390 × 844'te sığıyor (484 < 659). Kullanıcı kaydırabilir ama
  hiçbir işaret yok. İlke 6: tek elle ve bakmadan; Arapça konuşan biri için dil seçilemiyor gibi görünür.
- **Düzeltme:** menüyü `position: fixed`/`.ekran` içinde konumlayıp `max-height: calc(100% - …)` + kendi içinde
  `overflow-y: auto` ver; ya da şeridin **üstüne** aç (kısa ekranda). En az 4 öğe + yarım 5. öğe görünsün (kaydırma ipucu).

### B-12 · Web: "Şu An" kartı canlı bölge ve her kelimede yeniden çiziliyor
- **Sahip:** web-gelistirici
- **Yer:** `index.html:866` (`<div class="kart" aria-live="polite">`), `app.js:107-127` (`cizSuAn` her seferinde `replaceChildren`)
- **Gözlem (HTML'den okundu; VoiceOver'la denenmedi):** Canlı metin her yeni kelimede (`d.canliMetin`) yeniden çizilen
  bir canlı bölge içinde. Ekran okuyucu her ara sonuçta bölgeyi yeniden okuyabilir; "Hello", "Hello how", "Hello how are"
  tekrarları ve çeviri sesinin (AirPods) üstüne binen okumalar beklenir. Sayfanın temel işi çeviriyi dinletmek; VoiceOver
  bunu bozmamalı.
- **Düzeltme:** kartın `aria-live`'ını kaldır; yalnızca **son çeviri** için ayrı `<div aria-live="polite" aria-atomic="true">`
  kullan (içi yalnız biten cümlenin Türkçesi ile güncellenir); canlı metin ve "Dinliyorum…" canlı bölgenin dışında kalsın.
  Başla/durdur için ayrı `role="status"` ("Dinleme başladı" / "Dinleme durdu").

---

## Öneri

### B-13 · Geçmişi Temizle onaysız siler; geçmişin geçici olduğu söylenmiyor
- **Sahip:** ios-gelistirici, web-gelistirici
- **Yer:** `GecmisEkrani.swift:14` (`durum.satirlar.removeAll()`); web `#temizle`
- **Öneri:** `confirmationDialog` (iOS) / iki aşamalı düğme (web): "Geçmiş silinsin mi?" — "Geçmişi sil" / "Vazgeç". Listenin altına
  tek `footnote`: "Geçmiş uygulama kapanınca silinir." (PLAN'daki sınır ekranda yok; ilke 3'ün açıklığı).

### B-14 · Web: kulaklık durumu yok; not metni bunu söylemiyor
- **Sahip:** web-gelistirici
- **Yer:** `app.js:26` (`VARSAYILAN_NOT`), `index.html:880`
- **Gözlem:** iPhone ekranında "AirPods bağlı / bağlı değil" satırı var (ilke 1); web'de yok ve bu açıkça yazılmıyor. Kullanıcı
  durumu sorgulayamaz ama yokluğunu da bilmez.
- **Öneri:** varsayılan not: "Web deneme sürümü · kulaklık durumu gösterilmez · çeviri internetten yapılır" (320 px'te
  iki satıra iner, tek satırlık yer ayrılmış). Ya da yalnız "Kulaklık durumu bu sürümde gösterilmez." ikinci satırı.

### B-15 · Web: "Anahtar yalnızca bu telefonda saklanır" doğru değil
- **Sahip:** web-gelistirici
- **Yer:** `index.html:917`
- **Gözlem:** Web'de anahtar tarayıcı deposunda (`localStorage`, `app.js:42-50`) durur; geniş ekranda (masaüstü) "telefon" yanlış,
  "cihazınızın Türkçe sesiyle" (web) ile iOS'taki "Apple'ın Türkçe sesiyle" de farklı. İlke 3 doğru söylemeyi gerektirir.
- **Öneri:** web: "Boş bırakırsanız çeviri cihazınızın Türkçe sesiyle okunur. Anahtar yalnızca bu tarayıcıda saklanır."
  iOS metni (Anahtar Zinciri geçişinden sonra) "…yalnızca bu telefonda, güvenli biçimde saklanır." olabilir.

### B-16 · "Dinlemeyi duraklat" anahtarı yalnız web'de
- **Sahip:** ios-gelistirici (karar için ses-uzmani'na da danışılır)
- **Yer:** web `index.html:927-937`; iOS `AyarlarEkrani.swift` (yok)
- **Gözlem:** Kulaklıksız deneme için yazılmış anahtar iOS'ta yok; iOS'ta hoparlör zaten kapalı (`PLAN.md` "Hoparlörden okumaz").
  Fark bilinçli görünüyor ama hiçbir yerde belgeli değildi; şartnamede belgelendi (§7).
- **Öneri:** karar not düşülsün; iOS'a eklenmeyecekse web'de anahtarın açıklaması "yalnız bu web sürümünde" desin.

### B-17 · Dinlerken devre dışı dil şeridi bilgiyi soluk veriyor
- **Sahip:** web-gelistirici, ios-gelistirici
- **Yer:** `index.html:249-252` (`opacity: .45`), `CeviriEkrani.swift:73` (`.disabled`)
- **Gözlem:** Devre dışı bileşenler WCAG'den muaf, ama alt yazı ("Dili değiştirmek için önce durdurun") bilgi taşıyor;
  `.45` opaklıkla 2,32:1'e düşüyor (görüntüde `2-dinliyor.png` güçlükle okunuyor).
- **Öneri:** yalnız başlık ve ok soluk (`opacity .5`), alt yazı tam opak beyaz.

### B-18 · Web: yazı boyutları px; iOS Safari "metin boyutu" ayarını izlemiyor
- **Sahip:** web-gelistirici
- **Yer:** `index.html:21-710` (`font-size: 15px`, `13px`…)
- **Öneri:** boyutları `rem`'e çevir; gövde `font: -apple-system-body` (iPhone'da Dinamik Yazı'yı izler), `-webkit-text-size-adjust`
  kalsın. Sayfa yakınlaştırma şu an çalışıyor (K9 yatay taşma kontrolleri aynı kalır).

### B-19 · Web: metin dışı bileşen ve yer tutucu karşıtlıkları
- **Sahip:** web-gelistirici
- **Yer:** `index.html:509-511` (`.girdi::placeholder`), `:517-533` (`.bolumlu`), `:544-570` (`.salter`), `:499-508` (`.girdi`)
- **Hesap:** yer tutucu `soluk` (α 0,32) / `alan` = **2,58** (α 0,50 → **4,66**); seçili segment `#636366` / track = **2,24**
  (3:1 gerekir; `#8e8e93` 4,11 verir, üstüne siyah yazı 6,4:1); kapalı anahtar / `kart` = **1,32**; girdi `alan` / `kart` = **1,09**.
- **Öneri:** yer tutucu `rgba(235,235,245,.5)`; seçili segment `#8e8e93` + `#000` metin (ya da 2 px `ikincil` çerçeve); kapalı anahtar
  için 1,5 px `ikincil` çerçeve; girdi için 1 px `rgba(255,255,255,.18)` çerçeve. Odak halkası mavi dolgu üstünde (`acikMavi` /
  `mavi` = 2,21:1) beyaz olsun.

### B-20 · Web: asıl cümlede `lang` yok; sekmeler `aria-current` ile
- **Sahip:** web-gelistirici
- **Yer:** `app.js:98-103` (`satirGorunumu`), `app.js:128-129`, `index.html:975-985`
- **Gözlem:** `dir="auto"` var (Arapça için iyi) ama `lang` yok: iOS Safari VoiceOver Türkçe sesle okur. Sekmeler `aria-current="page"`
  ile "geçerli sayfa" der; çalışır ama gerçek bir sekme değil.
- **Öneri:** `asil.lang = dilBul(d.dil).kod` (satır oluşturulduğundaki dil; Geçmiş'te her satırın kendi dili tutulur); sekmelerde
  `role="tablist"/"tab"` + `aria-selected` + panel `role="tabpanel"` (eşdeğer bir iyileştirme; zorunlu değil).

### B-21 · Küçük metin ve simge tutarlılıkları
- **Sahip:** ios-gelistirici, web-gelistirici
- **Yer:** iOS `CeviriEkrani.swift:127` (hata), `:76` ("Şu An"); `AyarlarEkrani.swift:13,27,36` (bölüm başlıkları)
- **Öneri:** hata satırına, kulaklık uyarısıyla aynı biçimde, başına `exclamationmark.triangle.fill` (renk dışında işaret);
  "Şu An" → "Şu an" (Türkçe imla; "Şu An" ad gibi okunuyor); bölüm başlıkları metinde büyük harfle yazılmasın,
  `Text("Alania-2 API anahtarı").textCase(.uppercase)` ile gösterilsin (VoiceOver harf harf okumasın; `Locale tr` ile
  `i → İ` doğru çıkar). Kart içi ayraç opaklığı iOS 0,10 / web 0,14: ikisi 0,14.

### B-22 · Başlat düğmesine `startsMediaSession`
- **Sahip:** ios-gelistirici
- **Yer:** `CeviriEkrani.swift:131-139`
- **Gözlem:** VoiceOver "Dinlemeyi başlat" etkinleştirildikten hemen sonra konuşmaya devam ederse bu ses (kulaklıksız denemede
  ahize/hoparlör) iPhone mikrofonuna girebilir ve çevrilir.
- **Öneri:** `.accessibilityAddTraits(.startsMediaSession)` — VoiceOver düğme etkinleşince kendi konuşmasını keser. Duyuruların
  (B-5) kısa tutulması aynı nedenledir. **Cihazda denenmesi gerekir**; `docs/cihaz-testi.md`'ye VoiceOver açıkken başlat senaryosu.

---

## Doğrulananlar (sorun yok)

- 320, 360, 390, 1280 px'te yatay taşma yok; düğme ve sekmeler 320 × 568 ve 360 × 800'de ekran içinde (K9'un taşma kısmı).
- iOS ve web renkleri birebir aynı (`Renk` ↔ `:root`); gövde metinlerinin tamamı ≥ 6,05:1 (K8'in gövde koşulu).
- Başlat/Durdur, kulaklık durumu, hata ve kulaklık uyarısı metinle (renk dışında işaret) veriliyor; kırmızı çarpı ve suçlayıcı
  metin yok. Hata metinleri Türkçe ve ne yapılacağını söylüyor ("Mikrofon… izni gerekli (Ayarlar'dan açabilirsiniz)").
- Web: `role="alert"` (hata), `aria-checked`/`role="radio"`/`role="switch"` (ses ve anahtar), `aria-expanded`/`aria-haspopup`
  (dil şeridi), `aria-current` (sekme), simgelerde `aria-hidden`, `lang="tr"`, `prefers-reduced-motion` ve `:focus-visible` var.
- Ana düğme 62, sekmeler ≈ 61, dil şeridi ≈ 110 (iOS/web); tek birincil eylem ilkesine uyuluyor (Çeviri: Başlat/Durdur).

## Tur 2'de doğrulanacaklar

1. iOS simülatör görüntüleri (K2) üzerinde taşma/kesilme; `accessibility5` Dinamik Yazı görüntüsü (B-8).
2. B-1…B-5: Xcode Erişilebilirlik Denetçisi çıktısı; B-6/B-7: yeni belirteçlerle oranlar.
3. Tanılama ekranı: `docs/tasarim.md` §4.4 ve §5.2 #34-44'e göre uygulama (K3, K4, K6).
4. Web: B-9, B-10, B-11 için 320 × 568 / 360 × 640 / 360 × 800 görüntü ve ölçüm.
