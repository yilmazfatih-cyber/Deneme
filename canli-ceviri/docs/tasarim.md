# Canlı Çeviri — tasarım şartnamesi

Sahibi: `arayuz-denetcisi` · Sürüm: S01 (plan kapısı) · İlgili ilkeler: 1, 3, 5, 6, 8 (`CLAUDE.md`)

Bu belge **var olan** tasarımı belgeler ve iki yeni parçayı (Tanılama ekranı, VoiceOver tablosu) tarif eder. Koyu
lacivert tema ve ekran düzeni proje sahibinindir; burada yeniden tasarlanmaz, iki sürümü (iPhone, web) tutarlı kılmak
için ölçü, belirteç ve metin verilir. Kaynaklar: `CanliCeviri/Sabitler.swift` (`Renk`), `CanliCeviri/Arayuz/*.swift`,
`web/index.html` (`:root`) ve `web/app.js`.

**Doğrulama düzeyi (ilke 8).** iPhone bölümleri Swift kodu okunarak yazıldı; **simülatör görüntüsüyle henüz
doğrulanmadı** (görüntüler bu sprintte gelecek). Web bölümleri gerçek görüntülerle (320, 360, 390, 1280 px) ve
ölçümle doğrulandı. Hiçbiri gerçek iPhone + VoiceOver ile denenmedi; VoiceOver tablosu bir **şartnamedir**, cihazda
doğrulanması `docs/cihaz-testi.md` işidir.

Belgede işaretler: **[var]** kodda olduğu gibi belgelendi · **[değişir]** bu sprintte değişmesi gereken · **[yeni]**
henüz kodda yok.

---

## 1. Renk belirteçleri

### 1.1 İki sürümün karşılaştırması

`Renk` (iOS, 0–1 ölçeği) ile `:root` (web) 0–255'e çevrilince **birebir aynıdır**; fark yok. Yeni belirteçler **[değişir]**
işaretlidir ve iki sürümde aynı adla eklenir.

| Belirteç (iOS `Renk.`) | Web `--`        | Değer     | Kullanım                                                                   |
| ---------------------- | --------------- | --------- | -------------------------------------------------------------------------- |
| `zemin`                | `--zemin`       | `#030417` | Ekran zemini                                                               |
| `parilti`              | `--parilti`     | `#081a45` | Ekran ortasındaki radyal ışıma (420 pt yarıçap, `zemin`'e söner)           |
| `kart`                 | `--kart`        | `#13172e` | Kart, sekme çubuğu, menü dışı tüm yüzeyler                                 |
| `alan`                 | `--alan`        | `#0a0d1f` | Girdi alanı, seçili sekmenin kapsülü                                       |
| `mavi`                 | `--mavi`        | `#2e7af5` | Birincil dolgu: Başlat düğmesi, CANLI rozeti, dil şeridi, anahtar (açık)   |
| `koyuMavi`             | `--koyu-mavi`   | `#1a47b3` | Dil şeridi gradyanının sonu                                                |
| `acikMavi`             | `--acik-mavi`   | `#61ccfa` | Vurgu metni ve simge (saat, "Dinliyorum", canlı metin, odak halkası)       |
| `kirmizi`              | `--kirmizi`     | `#eb3833` | Durdur düğmesi dolgusu; iOS'ta hata metni de bu                            |
| —                      | `--acik-kirmizi`| `#ff7a73` | Web hata metni (iOS'ta yok **[değişir]**)                                  |
| `sari`                 | `--sari`        | `#fac23d` | Uyarı (kulaklık bağlı değil)                                               |
| beyaz (`.white`)       | `--metin`       | `#ffffff` | Ana metin                                                                  |
| `.secondary`           | `--ikincil`     | beyazımsı `rgba(235,235,245,α)`, α = 0,60 (iOS sistem) / 0,62 (web) | İkincil metin, dipnot |
| tertiary (placeholder) | `--soluk`       | `rgba(235,235,245,0.32)` | Yer tutucu, ok işareti (yalnız bezek)                       |
| `Color.white.opacity(0.12)` | `--cizgi`  | `rgba(255,255,255,.12)` | Kapsül çizgisi                                               |
| `Color.white.opacity(0.10)` | `--ayrac`  | `rgba(255,255,255,.14)` | Kart içi ayraç (iOS 0,10 / web 0,14 — **[değişir]** ikisi 0,14 olsun) |

Yeni belirteçler **[değişir]** (nedenleri §1.3'te hesaplarla):

| Belirteç                    | Değer     | Neden                                                                                     |
| --------------------------- | --------- | ----------------------------------------------------------------------------------------- |
| `maviDolgu` (`--mavi-dolgu`) | `#2b72e5` | Beyaz yazı için 4,52:1. `mavi` (`#2e7af5`) beyazla 4,02:1 verir. Görsel fark çok küçük.   |
| `kirmiziDolgu` (`--kirmizi-dolgu`) | `#de3530` | Beyaz yazı için 4,51:1 (`kirmizi` ile 4,08:1)                                       |
| `maviMetin` (`--mavi-metin`) | `#4a8ff7` | Koyu zemindeki mavi **metin** için: tüm zeminlerde ≥ 5,28:1 (`mavi` parıltıda 4,19:1)   |
| `acikKirmizi`               | `#ff7a73` | iOS hata metni için (web'de zaten var): `zemin` 8,01, `parilti` 6,66, `kart` 6,96        |

Kural: **dolgu** (üstüne beyaz yazı gelen yüzey) `maviDolgu` / `kirmiziDolgu`; **metin ya da simge olarak mavi** gereken
yerde `maviMetin`. `mavi` ve `kirmizi` eski adlarıyla yalnız büyük dolgu bezeği (gradyan başı, anahtar rengi) için kalır
ve yeni koda girmez. Hata metni asla `kirmizi` değil `acikKirmizi`'dır.

### 1.2 Arka plan

`zemin` üstüne `parilti` radyal gradyan: merkez ekranın ortası, 0 → 420 pt yarıçap, `parilti` → saydam. Metin
karşıtlığı **en açık zemine** (`parilti`) göre denetlenir; yani hesaplarda zemin sütunu iki değerle verilir.

### 1.3 Metin / zemin karşıtlık oranları (WCAG 2.x)

Hesap: göreli parlaklık (sRGB doğrusallaştırma) ve `(L1+0,05)/(L2+0,05)`; saydam renkler (`ikincil`, opaklık)
önce zemine karıştırıldı. Eşikler: normal metin 4,5:1; büyük metin (≥ 24 px ya da ≥ 18,66 px **kalın = 700**) 3:1;
metin dışı bileşen 3:1. `semibold` (600) kalın sayılmaz; bu yüzden 20 pt semibold düğme metni **normal metin**
eşiğiyle (4,5) değerlendirildi. (Betik, inceleme sırasında geçici klasörde çalıştırıldı; sonuçlar aşağıdadır.)

| Metin / zemin çifti                                         | Nerede                                  | Oran    | AA (4,5)         |
| ----------------------------------------------------------- | --------------------------------------- | ------- | ---------------- |
| beyaz / `zemin`                                             | başlıklar                               | 20,32   | geçer            |
| beyaz / `parilti`                                           | başlıklar (ışıma bölgesi)               | 16,88   | geçer            |
| beyaz / `kart`                                              | kart içi metin, pasif sekme             | 17,65   | geçer            |
| beyaz / `alan`                                              | girdi metni                             | 19,26   | geçer            |
| `ikincil` (0,62) / `kart`                                   | asıl cümle, dipnot (web)                | 6,37    | geçer            |
| `ikincil` (0,60) / `kart`                                   | asıl cümle, dipnot (iOS)                | 6,05    | geçer            |
| `ikincil` (0,62) / `zemin`, `parilti`                       | bölüm başlığı, not, "Şu An" ipucu       | 6,71 / 6,14 | geçer        |
| `soluk` (0,32) / `alan`                                     | yer tutucu `pd_live_…`                  | 2,58    | **geçmez**       |
| `acikMavi` / `kart`, `zemin`, `parilti`                     | saat, canlı metin, "Dinliyorum"         | 9,69 / 11,15 / 9,27 | geçer |
| `mavi` / `alan`                                             | seçili sekme (metin + simge)            | 4,79    | geçer            |
| `mavi` / `zemin`                                            | "Temizle" (Geçmiş üstü)                 | 5,05    | geçer            |
| `mavi` / `parilti`                                          | "Temizle" (ışıma bölgesinde)            | 4,19    | **geçmez**       |
| `mavi` / `kart`                                             | kart içinde mavi metin                  | 4,39    | **geçmez**       |
| `sari` / `zemin`, `parilti`, `kart`                         | kulaklık uyarısı                        | 12,43 / 10,33 / 10,80 | geçer |
| `kirmizi` / `zemin`                                         | iOS hata metni                          | 4,98    | geçer            |
| `kirmizi` / `parilti`                                       | iOS hata metni (ışıma bölgesinde)       | 4,14    | **geçmez**       |
| `acikKirmizi` / `zemin`, `parilti`                          | web hata metni                          | 8,01 / 6,66 | geçer        |
| beyaz / `mavi`                                              | Başlat (20 pt semibold), CANLI (13 pt bold) | 4,02 | **geçmez**       |
| beyaz / `kirmizi`                                           | Durdur (20 pt semibold)                 | 4,08    | **geçmez**       |
| beyaz (0,85) / `mavi`                                       | dil şeridi alt yazısı (15 pt)           | 3,35    | **geçmez**       |
| beyaz (0,85) / `koyuMavi`                                   | aynı, gradyanın koyu ucu                | 6,32    | geçer            |
| beyaz / `koyuMavi`                                          | dil şeridi başlığı (gradyanın koyu ucu) | 8,09    | geçer            |
| beyaz / web seçili segment `#636366`                        | "Kadın" / "Erkek" seçili                | 5,99    | geçer            |
| beyaz / web menü zemini                                     | dil menüsü                              | 14,84   | geçer            |
| beyaz ve `beyaz .45` / `mavi .45` (devre dışı dil şeridi)   | dinleme sırasında dil şeridi            | 2,32    | geçmez (devre dışı bileşen WCAG'de muaf, ama bkz. B-17) |
| `ikincil` (0,62) / web sahne `#06070d`                      | geniş ekran not paneli                  | 6,71    | geçer            |

**Önerilen belirteçlerle** (§1.1) aynı çiftler:

| Çift                                          | Oran  | Sonuç  |
| --------------------------------------------- | ----- | ------ |
| beyaz / `maviDolgu` `#2b72e5`                 | 4,52  | geçer  |
| beyaz (1,0) / `maviDolgu` (dil şeridi alt yazısı artık tam opak) | 4,52 | geçer |
| beyaz / `kirmiziDolgu` `#de3530`              | 4,51  | geçer  |
| `maviMetin` `#4a8ff7` / `zemin`, `parilti`, `kart`, `alan` | 6,35 / 5,28 / 5,52 / 6,02 | geçer |
| `acikKirmizi` / `kart`                        | 6,96  | geçer  |
| yer tutucu: `ikincil` α 0,50 / `alan`         | 4,66  | geçer (α 0,45 → 3,99 geçmez) |

**Metin dışı bileşenler (3:1):**

| Bileşen                                         | Oran  | Sonuç                                                       |
| ----------------------------------------------- | ----- | ----------------------------------------------------------- |
| odak halkası `acikMavi` / `zemin`               | 11,15 | geçer                                                       |
| odak halkası `acikMavi` / `mavi` (dil şeridi, Başlat üstünde) | 2,21 | **geçmez**; halka beyaz olsun: beyaz / `maviDolgu` 4,52 |
| web anahtar (kapalı) `rgba(118,118,128,.24)` / `kart` | 1,32 | geçmez; iOS'ta yerel `Toggle` olduğu için sistem çözer. Web'de 1,5 px `ikincil` çerçeve eklenir |
| web anahtar (açık) `mavi` / `kart`              | 4,39  | geçer                                                       |
| web seçili segment `#636366` / segment zemini   | 2,24  | geçmez; `#8e8e93` 4,11 verir (üstüne beyaz 3,26: büyük/kalın metin olarak sınırda; yazı rengi `#000` 6,4:1 olur) — bkz. B-19 |
| kart / `zemin`, kart / `parilti`                | 1,15 / 1,05 | bezek (bilgi taşımaz); kartın içeriği metinle ayrılır |
| girdi alanı `alan` / `kart`                     | 1,09  | geçmez; alanın sınırı yalnız zeminle ayrılıyor. Girdiye 1 px `rgba(255,255,255,.18)` çerçeve eklenir (≈ 1,9:1 yetmez, bu yüzden bkz. not) |

Not (girdi alanı): alan, başında yer tutucu ve etiket taşıyan tek bir giriş olduğu ve çevresinde yazılı bölüm başlığı
bulunduğu için sınır karşıtlığı tek başına işlev taşımaz; yine de çerçeve eklemek önerilir (B-19). Anahtar açık/kapalı
durumu rengin yanında **konum** (düğme sağda/solda) ile de verilir (renk dışında işaret).

---

## 2. Yazı ölçeği

Yazı tipi: iOS'ta sistem (SF); web'de `-apple-system, 'SF Pro Text', system-ui…` (büyük başlıklarda `SF Pro Display`).
iOS'ta tüm metin **Dinamik Yazı** ile ölçeklenir; web'de boyutlar sabit px'tir (bkz. §6).

| Rol                                  | iOS biçemi                       | Boyut / kalınlık (varsayılan) | Web karşılığı                     |
| ------------------------------------ | -------------------------------- | ----------------------------- | --------------------------------- |
| Ekran başlığı ("Canlı Çeviri", "Geçmiş", "Ayarlar", **"Tanılama"**) | `largeTitle` + `.bold` | 34 pt / 700 | `.baslik h1` 34 px / 41 px satır / 700 |
| Kart başlığı ("Şu An", "Öncekiler"); dil şeridi başlığı | `title2` + `.semibold` | 22 pt / 600 | `.kart h2`, `.dil-ad` 22 px / 600 |
| Ana düğme metni                      | `title3` + `.semibold`           | 20 pt / 600                   | `.ana-dugme` 20 px / 600          |
| Boş durum başlığı                    | `title3` + `.semibold`           | 20 pt / 600                   | `.bos-baslik` 20 px / 600         |
| Çeviri (büyük, "Şu An" kartında)     | `title2` + `.semibold`           | 22 pt / 600                   | `.satir.buyuk .ceviri` 22 px      |
| Çeviri (öncekiler, geçmiş)           | `body` + `.medium`               | 17 pt / 500                   | `.ceviri` 17 px / 500             |
| Asıl cümle, ipucu, bilgi satırı, boş durum alt yazısı, canlı metin (italik) | `subheadline` | 15 pt / 400 | `.asil`, `.ipucu`, `.canli-metin` 15 px |
| Dipnot, bölüm başlığı, durum satırı (kulaklık, hata), Temizle (iOS: `subheadline`) | `footnote` + `.semibold`/`.medium` | 13 pt | `.dipnot`, `.bolum`, `.not`, `.hata` 13 px |
| Saat, sekme etiketi                  | `caption` + `.semibold`          | 12 pt / 600                   | `.saat`, `.sekme` 12 px / 600     |
| **Tanılama** olay adı                | `subheadline` + `.semibold`      | 15 pt / 600                   | 15 px / 600                       |
| **Tanılama** ayrıntı                 | `footnote`                       | 13 pt / 400                   | 13 px / 400                       |
| **Tanılama** saat                    | `caption` + `.monospacedDigit()` | 12 pt                         | 12 px, `font-variant-numeric: tabular-nums` |

Tutarsızlıklar (kod bunlara göre düzeltilir): "Temizle" iOS'ta `subheadline` (15), web'de 15 px — aynı; iOS bölüm
başlıkları `footnote.semibold` + `.secondary`, web 13 px / 600 — aynı. Başlık satır aralığı web'de 41 px sabittir;
iOS'ta sistem belirler.

---

## 3. Bileşenler

Ölçüler pt (iOS) = px (web, 1× CSS). Yan boşluk her yerde **20**. Bölümler arası boşluk Çeviri'de 20, Geçmiş'te 16,
Ayarlar'da 14 (**mevcut**; Ayarlar'ın 14'ü bölüm başlığındaki 10 pt üst dolguyla birlikte 24 eder, tutarlı sayılır).

### 3.1 Kart **[var]**
Başlıklı (`title2`) dikey yığın, iç dolgu **20** (Geçmiş ve Ayarlar kutularında **18**), köşe **28** (kutu ve geçmiş
satırında **24**, `.continuous`), zemin `kart`. Durumlar: tek durum (etkileşimsiz). Kart içi ayraç: 1 pt `ayrac`.

### 3.2 Dil şeridi **[var]**
Tam genişlik, dolgu 20, köşe 24, gradyan `mavi → koyuMavi` (sol üst → sağ alt) **[değişir]**: `maviDolgu → koyuMavi`.
İçerik: başlık (`title2.semibold`, "İngilizce → Türkçe"), alt yazı (`subheadline`), sağda `chevron.right` (`title3.bold`).
Yükseklik içeriğe göre (≈ 110 pt, 320 px'te alt yazı iki satıra düşer, 110 px ölçüldü); dokunma alanı tüm şerit.

| Durum           | Görünüm                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------- |
| olağan          | Alt yazı: "Kaynak dili değiştirmek için dokunun"                                                    |
| basılı          | iOS: sistem menü açılır; web: menü açılır, `aria-expanded=true`                                     |
| devre dışı (dinlerken) | Tüm şerit soluk (web `opacity .45`); alt yazı "Dili değiştirmek için önce durdurun". **[değişir]** alt yazı tam opaklıkta kalır (bilgi taşıyor), yalnız başlık ve ok solar |
| hata            | Yok (dil seçimi hata üretmez)                                                                       |

Menü (iOS `Menu` + `Picker`, sistem biçemi; web özel): 7 dil, seçili olan işaretli (tik + `aria-checked`). Web menü
genişliği 240, öğe yüksekliği ölçülen **42–43 px** (hedef ≥ 44, bkz. B-10), köşe 14, zemin `rgba(40,41,52,.94)` + bulanıklık.
Menü ekrandan taşmamalı (bkz. B-11): kısa ekranda şeridin üstüne ya da ekran içinde kaydırılabilir açılır; en az 4
öğe görünür ve gerisinin olduğunu gösteren yarım satır kesilir.

### 3.3 Ana düğme (Başlat / Durdur) **[var]**
Tam genişlik, yükseklik **62** (minimum, Dinamik Yazı'da büyür), köşe 22, `title3.semibold`, simge solda (`mic.fill` /
`stop.fill`, web 22 px). **Ekranın tek birincil eylemidir** (ilke 6).

| Durum   | Dolgu           | Metin                 | Simge       |
| ------- | --------------- | --------------------- | ----------- |
| olağan  | `maviDolgu`     | "Dinlemeyi Başlat"    | `mic.fill`  |
| dinlerken | `kirmiziDolgu` | "Durdur"              | `stop.fill` |
| basılı  | web: `scale(.98)`, 0,1 sn (hareket azaltmada kapalı); iOS: sistem basılı opaklığı |  |  |
| devre dışı | Yok (her zaman basılabilir) |           |             |
| hata    | Düğme değişmez; hata metni düğmenin üstünde görünür (§3.6)                                          |

Geri bildirim: iOS `sensoryFeedback(.impact)` durum değişince. Durdur'un kırmızı olması "durdur" eylemini söyler,
başarısızlık işareti değildir.

### 3.4 Kapsül sekme çubuğu **[var]**
Altta yüzen, köşe tam kapsül, zemin `kart`, 1 pt `cizgi` çerçeve, iç dolgu 6, yatay kenar boşluğu 28, alt 4 (web:
güvenli alan + 10). Üç eşit sekme; her biri dikey yığın: simge 21–22 + 4 + etiket `caption.semibold`, dikey dolgu 10
→ yükseklik ≈ **61** pt (genişlik 81 px @320, 95 px @360). Dokunma alanı `Capsule` biçimli, tüm sekme.

| Durum  | Simge + etiket      | Arka plan                      |
| ------ | ------------------- | ------------------------------ |
| pasif  | beyaz               | saydam                         |
| seçili | **`maviMetin`** **[değişir]** (şimdi `mavi`) | `alan` kapsülü (renk dışında işaret: kapsül şekli) |
| basılı | sistem              | —                              |

### 3.5 Durum satırı (kulaklık) **[var, yalnız iOS]**
Düğmenin hemen üstünde, ortalı, `footnote.medium`, simge + metin (`Label`).

| Durum          | Simge                          | Renk       | Metin                                                              |
| -------------- | ------------------------------ | ---------- | ------------------------------------------------------------------ |
| bağlı          | `airpods`                      | `acikMavi` | "AirPods Pro bağlı" (cihazın türü/adı, yalnız ekranda; kayda yazılmaz) |
| bağlı değil    | `exclamationmark.triangle.fill`| `sari`     | "AirPods bağlı değil. Çeviriyi duymak için AirPods'u takın."       |

Web'de bu satır yok; yerinde `VARSAYILAN_NOT` ("Web deneme sürümü · çeviri internet üzerinden yapılır") durur. Bu bilinçli
bir sapma olarak belgelenir: tarayıcı çıkış aygıtını güvenilir söyleyemez. Yine de metin bunu açık yazmalıdır (B-14).

### 3.6 Hata satırı **[var]**
Düğmenin üstünde, ortalı, `footnote`, `acikKirmizi` **[değişir]** (iOS şimdi `kirmizi`). Kırmızı çarpı simgesi yok;
metin neyin olduğunu ve ne yapılacağını söyler (ilke 8 genel ruhu, "Bitti" tanımı: Türkçe ve eylem söyleyen). Web
`role="alert"`; iOS'ta ayrıca VoiceOver duyurusu (bkz. §5.3). Önerilen: başına `exclamationmark.triangle.fill` simgesi
(renk dışında işaret, kulaklık uyarısıyla aynı biçim).

### 3.7 Bölümlü seçici (Kadın / Erkek) **[var]**
iOS: yerel `Picker(.segmented)` (≈ 32 pt, sistem). Web: özel; şimdi **28 px** yüksek, köşe 7, iç dolgu 2, seçili `#636366`.
**[değişir]** web 44 px yüksek (kutu içinde `min-height:44px`; iOS'ta `.controlSize(.large)` ya da çevresine
44 pt'lik `contentShape`). Etiket `footnote`/13 px 600.

### 3.8 Anahtar (yalnız web) **[var]**
51 × 31, köşe tam; kapalı `rgba(118,118,128,.24)`, açık `mavi`. **[değişir]** satırın tamamı (etiket + anahtar) tek
44 px yüksekliğinde dokunma alanı. iOS Ayarlar'da karşılığı yoktur (bilinçli fark: "dinlemeyi duraklat" kulaklıksız
deneme içindir; bkz. B-16).

### 3.9 Girdi (API anahtarı) **[var]**
Dolgu 14, köşe 14, zemin `alan`, yazı 17 pt/px, yer tutucu "pd_live_…" (α 0,50 **[değişir]**), güvenli metin.
Yükseklik ≈ 48. Altında `footnote` açıklama.

### 3.10 Boş durum **[var]**
Simge 54 pt `acikMavi`, başlık (`title3.semibold`), alt yazı (`subheadline`, `ikincil`), ortalı, üstten 120 boşluk.
Geçmiş: "Henüz çeviri yok" / "Çevrilen cümleler burada listelenir."

### 3.11 Temizle (metin düğmesi) **[değişir]**
`subheadline.semibold`, `maviMetin`; dokunma alanı **en az 44 × 44** (`.frame(minWidth:44, minHeight:44)` +
`.contentShape(Rectangle())`; sağ kenara hizalı, görünür metin kenar boşluğuna yaslanır). Şimdi iOS ≈ 20 pt, web 68 × 35 px.

---

## 4. Ekranlar

Her ekranda **tek birincil eylem** vardır (ilke 6). Menü derinliği: sekme → (Ayarlar) Tanılama sayfası; en çok 2 düzey.

### 4.1 Çeviri
Birincil eylem: **Dinlemeyi Başlat / Durdur** (altta, başparmağın erdiği yerde).
Yerleşim (yukarıdan): başlık satırı (waveform + "Canlı Çeviri" + dinlerken CANLI rozeti) · dil şeridi · "Şu An" kartı
· (≥ 2 çeviri varsa) "Öncekiler" kartı · altta sabit blok: hata satırı, kulaklık/not satırı, ana düğme · sekme çubuğu.

| Durum         | Ne görünür                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| boş           | "Şu An" kartında: "AirPods'u takın ve aşağıdaki düğmeye dokunun. Çeviri kulaklığınızdan okunur." Düğme "Dinlemeyi Başlat"       |
| dinliyor      | CANLI rozeti (`maviDolgu`, beyaz metin 13 pt bold + `dot.radiowaves.left.and.right`); kartta "Dinliyorum…" (`ear` simgesi, `acikMavi`); duyulan cümle canlı metin (italik, `acikMavi`); dil şeridi devre dışı; düğme "Durdur" |
| çeviri var    | Kartta son çeviri `title2.semibold` ve altında asıl cümle (`subheadline`, `ikincil`) — **asıl cümle çevirinin altında, çeviri öncelikli**; önceki üç çeviri "Öncekiler"de (en yeni üstte) |
| kulaklıksız   | Düğmenin üstünde sarı uyarı satırı (§3.5); akış çalışır (ses ahizeden gelir)                                                    |
| hata          | Düğmenin üstünde `acikKirmizi` açıklama (örnek: "Mikrofon ve konuşma tanıma izni gerekli (Ayarlar'dan açabilirsiniz)."); düğme "Dinlemeyi Başlat"a döner, yeniden denenebilir |

Sorun (ölçüldü, bkz. B-9): 320 × 568'de dinlerken "Şu An" kartındaki **çeviri ekran altına düşüyor** (dil şeridi 110 px,
başlık iki satıra bölünüyor). **[değişir]** Dinlerken dil şeridi tek satırlık **kompakt** hale gelir (yükseklik 56:
"İngilizce → Türkçe" `body.semibold`, alt yazı kaldırılır, devre dışı olduğu kalan `chevron`'un gizlenmesiyle ve
VoiceOver'a "Dinlerken değiştirilemez" denmesiyle belirtilir) ve başlık satırı tek satırda kalır (rozet simge-yalnız
küçülmez, `fixedSize` ile korunur; başlık gerekirse `minimumScaleFactor(0.8)`).

### 4.2 Geçmiş
Birincil eylem: **yok — salt okunur liste** (ikincil eylem Temizle). Bu ekranda birincil eylem gerekmez; sekme çubuğu
dışında tek dokunulabilir öğe "Temizle"dir.

| Durum | Ne görünür                                                                                                                  |
| ----- | --------------------------------------------------------------------------------------------------------------------------- |
| boş   | Başlık, "Temizle" gizli; ortada `text.bubble` + "Henüz çeviri yok" + "Çevrilen cümleler burada listelenir."                |
| dolu  | Başlık + "Temizle" (sağ üst); en yeni üstte; her satır bir kart: saat (`caption.semibold`, `acikMavi`), asıl (`subheadline`), çeviri (`body.medium`). Not: çeviri **asıl cümlenin altında** ve vurgulu; Çeviri sekmesinde de aynı sıra |

Not: Geçmiş satırında asıl cümle üstte, çeviri altta; "Şu An" kartında da aynı. Sıra iki yerde de aynıdır (tutarlı).
Geçmiş yalnız oturum boyunca tutulur (PLAN: "geçmiş saklanmaz"); ekran bunu söylemiyor — **[değişir, öneri]** boş durum ve
dolu listenin altına tek `footnote`: "Geçmiş uygulama kapanınca silinir." (ilke 3 açıklığı).

### 4.3 Ayarlar
Birincil eylem: **yok** (ayar ekranı); ilk girişi doldurmak isteyen için tek odak alanı API anahtarıdır.
Sıra (yukarıdan): "ALANIA-2 API ANAHTARI" kutusu · "SES" kutusu (Kadın/Erkek; web: + duraklat anahtarı) ·
"NASIL ÇALIŞIR" (iOS) / "WEB DENEME SÜRÜMÜ" (web) bilgi kutusu · **[yeni]** "TANILAMA" kutusu (en altta).

| Durum        | Ne görünür                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| anahtar boş  | Yer tutucu "pd_live_…"; dipnot: "Boş bırakırsanız çeviri Apple'ın Türkçe sesiyle okunur. Anahtar yalnızca bu telefonda saklanır." (web: "cihazınızın Türkçe sesiyle"; web'de "bu tarayıcıda saklanır" yazmalı, B-15) |
| anahtar dolu | Noktalı gösterim; açıklama aynı                                                                                      |
| Tanılama satırı | Bkz. §4.4                                                                                                         |

Tanılama satırı (kutu içinde tek satır, **[yeni]**): minimum yükseklik **56**, tam genişlik düğme, sol `waveform.path.ecg`
(`acikMavi`, 30 genişlikli sütun — bilgi satırlarıyla aynı), orta iki satır: "Tanılama kaydı" (`subheadline`, beyaz) ve
"12 olay · yalnız bu telefonda" (`footnote`, `ikincil`; boşsa "Henüz olay yok"), sağda `chevron.right`
(`footnote.bold`, `ikincil`). Bölüm başlığı: "TANILAMA" (`footnote.semibold`, `ikincil`). Kutunun altında dipnot yok (gizlilik
cümlesi Tanılama sayfasında).

### 4.4 Tanılama **[yeni]**

**Amaç:** proje sahibi telefonda bir sorunla karşılaşınca olay kaydını **tek dokunuşla kopyalayıp** göndersin
(brief K3/K4). **Tek birincil eylem: Kopyala.**

#### 4.4.1 Açılış ve yer
- **iPhone:** Ayarlar'daki "Tanılama kaydı" satırına dokununca **alttan açılan sayfa** (`.sheet`) çıkar. Uygulamada
  gezinme yığını olmadığı için sekme çubuğu sayfanın **altında** kalır ve sayfa onu örter. `.presentationDetents([.large])`,
  `.presentationDragIndicator(.visible)`, `.presentationBackground(Renk.zemin)` (parıltılı gradyan sayfada gerekmez),
  `.preferredColorScheme(.dark)`. Kapatma: sağ üstte "Bitti" düğmesi ya da aşağı çekme (VoiceOver'da iki parmakla "Z").
- **Web:** Ayarlar'ın en altındaki "TANILAMA" kutusundaki "Tanılama kaydı" satırına dokununca **`.ekran` içinde tam
  ekran bir sayfa** açılır (telefon çerçevesinin içinde; sekme çubuğu dahil her şeyi örter), `role="dialog"`
  `aria-modal="true"` `aria-labelledby="tanilamaBaslik"`. Aşağıdan 250 ms kayarak gelir (`prefers-reduced-motion`'da
  anında). Kapatma: "Bitti", `Esc`; kapanınca odak "Tanılama kaydı" satırına döner; açılınca odak başlığa (`tabindex=-1`) gider.

#### 4.4.2 Yerleşim (yukarıdan aşağı)
1. **Başlık satırı** (yan boşluk 20, üst 12; Geçmiş'teki gibi): "Tanılama" `largeTitle.bold` solda, "Bitti" sağda
   (`subheadline.semibold`, `maviMetin`, dokunma alanı **44 × 44**).
2. **Gizlilik cümlesi** (başlığın 8 pt altında, `footnote`, `ikincil`, 20 yan boşluk) — **tam olarak şu tek cümle:**
   > "Kayıt yalnızca bu telefonda, uygulama açıkken tutulur; konuşma ve çeviri metni içermez."

   (Web: aynı cümle, "bu telefonda" yerine "bu cihazda", "uygulama açıkken" yerine "sayfa açıkken".)
3. **Olay listesi** (kaydırılan alan; başlık ve alttaki düğmeler sabit): tek bir kart (zemin `kart`, köşe 24), satırlar
   arası 1 pt `ayrac`; kart yan boşluğu 20, üstten 16.
4. **Alt blok (sabit,** Çeviri'deki ana düğme bloğuyla aynı yerleşim, yan 20, alt 12 + güvenli alan):
   - **Kopyala** — birincil, tam genişlik, **62** yükseklik, köşe 22, `maviDolgu`, beyaz `title3.semibold`, simge
     `doc.on.doc` (web: aynı biçimde kopya simgesi, 22 px).
   - **Temizle** — ikincil, **Kopyala'nın 8 pt altında**, tam genişlik **metin düğmesi**, yükseklik **44** (en az),
     `subheadline.semibold`, `maviMetin`, simge `trash` solda; zemini yok.

#### 4.4.3 Olay listesi — sıra ve satır
- **Sıra: en yeni üstte** (Geçmiş sekmesiyle aynı kural; telefonda son olay açılışta ekranda görünür). Sayfa
  açıldığında liste en üsttedir. Sayfa açıkken yeni olay gelirse üste eklenir; kullanıcı aşağı kaydırmışsa konum
  **sıçramaz**.
- **Kopyalanan metin kronolojiktir** (en eski → en yeni; kaydı okuyan ekip zamanı yukarıdan aşağı izler). Başlık
  satırları brief'te tanımlı biçimdedir (uygulama sürümü, iOS sürümü, cihaz modeli); her satır `SS:DD:SS.mmm  olay  ayrıntı`.
  İki sıranın farkı bilinçlidir: ekran "ne oldu" için, kopya "nasıl oldu" için. Kopya metnin başındaki sürüm satırının
  altına tek satır eklenir: `Sıra: eskiden yeniye` **[öneri]**.
- Ekranda saat `SS:DD:SS` (milisaniyesiz); milisaniye yalnız kopyada.
- **Satır** (dolgu: yatay 18, dikey 12): iki satırlı dikey yığın.
  - Üst satır: olay adı (`subheadline.semibold`, beyaz) solda; saat (`caption`, `.monospacedDigit()`, `ikincil`) sağda,
    taban çizgisi hizalı. Dinamik Yazı'nın erişilebilirlik boyutlarında (`dynamicTypeSize.isAccessibilitySize`) saat olay
    adının **altına** iner (yığın dikey olur).
  - Alt satır: ayrıntı (`footnote`, `ikincil`), satır sınırı yok (kesilmez, taşarsa alt satıra iner), `.textSelection(.disabled)`.
  - **Uyarı olayı** (hata kodu, izin reddedildi, kesinti/motor başlatılamadı, Alania hatası, çeviri hatası): olay adının
    önünde `exclamationmark.triangle.fill` (13 pt, `sari`) ve ayrıntı aynı `ikincil` kalır. Renk **tek başına** bilgi
    taşımaz: olay adı "hata" ya da "başlatılamadı" gibi sözcüğü zaten içerir; simge ek işarettir. Kırmızı kullanılmaz.
- Satırlar dokunulabilir değildir (seçim, detay sayfası yok); tek eylem alt bloktadır.
- **Üst sınır:** 300 olay (brief K3). Liste dolunca (300) listenin altında tek `footnote` satırı: "Son 300 olay gösteriliyor."
  Eski olaylar sessizce atılır; bu satır ve kopya başlığı bunu söyler.

#### 4.4.4 Durumlar
| Durum          | Görünüm                                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| boş            | Liste kartı yerine ortalanmış boş durum (§3.10 ölçüleri): simge `list.bullet.clipboard` 54 pt `acikMavi`; başlık "Henüz olay yok"; alt yazı "Dinlemeyi başlattığınızda olaylar burada görünür." **Kopyala etkin kalır** (başlıktaki sürüm/model satırı da işe yarar); **Temizle devre dışı** (metin `ikincil`, `.disabled(true)`, VoiceOver "soluk"). |
| dolu           | Yukarıdaki liste; "Temizle" etkin.                                                                                                              |
| kopyalandı     | Kopyala düğmesi **2 sn** boyunca "Kopyalandı" + `checkmark` gösterir (dolgu değişmez, yeşile dönmez); `sensoryFeedback(.success)`; VoiceOver duyurusu "Kayıt panoya kopyalandı". 2 sn sonra eski haline döner. Düğme bu sürede de basılabilir (yeniden kopyalar). |
| kopyalanamadı  | iOS'ta yok sayılır (`UIPasteboard` hata vermez). Web: Pano API'si reddederse düğmenin üstünde `acikKirmizi` olmayan, `ikincil` renkte `footnote`: "Otomatik kopyalanamadı. Aşağıdaki metni seçip kopyalayın." ve düğmenin altında salt okunur, seçili `<textarea>` (yükseklik 160, `alan` zemin, `font-kod` 13 px) açılır. |
| temizleme onayı| iOS: `confirmationDialog` — başlık "Kayıt silinsin mi?", ileti "Kayıttaki 42 olay silinir.", eylemler "Kaydı sil" (`role: .destructive`) ve "Vazgeç". Web: düğme 4 sn boyunca "Silmek için yeniden dokunun" olur, sonra eski haline döner; ikinci dokunuşta siler. Silince liste boş duruma geçer ve VoiceOver "Kayıt temizlendi" der. |
| uygulama kapandı | Kayıt silinir (bellekte); sayfa açılışta boş durum.                                                                                           |

#### 4.4.5 Ölçü özeti
| Öğe                    | iOS                         | Web                           |
| ---------------------- | --------------------------- | ----------------------------- |
| Yan boşluk             | 20 pt                       | 20 px                         |
| Başlık                 | `largeTitle.bold`           | 34 px / 41 px / 700           |
| Bitti                  | 44 × 44 pt dokunma alanı    | 44 × 44 px                    |
| Gizlilik cümlesi       | `footnote`, `ikincil`       | 13 px / 1,4, `--ikincil`      |
| Liste kartı            | köşe 24, `kart`             | köşe 24, `--kart`             |
| Satır dolgusu          | 12 dikey / 18 yatay         | 12 / 18                       |
| Ayraç                  | 1 pt `ayrac`                | 1 px `--ayrac`                |
| Kopyala                | 62 pt, köşe 22, `maviDolgu` | 62 px, köşe 22, `.ana-dugme`  |
| Temizle                | ≥ 44 pt, metin düğmesi      | ≥ 44 px                       |
| Kopyala–Temizle aralığı| 8 pt                        | 8 px                          |
| Boş durum simgesi      | 54 pt                       | 54 px                         |

#### 4.4.6 Renk belirteçleri (Tanılama)
| Öğe                          | Metin / simge          | Zemin   | Oran |
| ---------------------------- | ---------------------- | ------- | ---- |
| Olay adı                     | beyaz                  | `kart`  | 17,65 |
| Ayrıntı, saat, gizlilik cümlesi | `ikincil`           | `kart` (cümle: `zemin`/`parilti`) | 6,05 (6,71 / 6,14) |
| Uyarı simgesi                | `sari`                 | `kart`  | 10,80 |
| Kopyala                      | beyaz                  | `maviDolgu` | 4,52 |
| Temizle, Bitti               | `maviMetin`            | `zemin` / `parilti` | 6,35 / 5,28 |
| Boş durum simgesi            | `acikMavi`             | `zemin` | 11,15 |
| Temizle (devre dışı)         | `ikincil`, α 0,5       | `zemin` | (devre dışı, muaf) |

#### 4.4.7 Hareket ve yazı büyütme
Sayfa açılışı sistem varsayılanı (iOS; `Reduce Motion` açıkken sistem kendisi sadeleştirir); web yalnız
`@media (prefers-reduced-motion: no-preference)` içinde kayar. Kopyalandı geri bildirimi hareketsizdir (metin değişimi).
En büyük Dinamik Yazı boyutunda: satır içeriği dikey yığına geçer (saat altta), "Kopyala" yüksekliği `minHeight: 62` olarak büyür,
alt blok sayfanın üçte birini aşarsa liste kaydırmalı kalır ve alt blok `ScrollView` dışında sabit durur.

---

## 5. VoiceOver

### 5.1 İlkeler
1. **Etiket Türkçe, kısa, eylemi söyler;** sembol adı ("waveform", "gearshape.fill") hiçbir yerde okunmaz: dekoratif
   simgeler `accessibilityHidden(true)` (web `aria-hidden="true"`; zaten var).
2. **Başlıklar** `isHeader` (web: `h1`/`h2`/`h3`) taşır; rotor ile başlıktan başlığa gidilir.
3. Değişen durum (dinleme başladı/durdu, hata, kulaklık koptu/bağlandı) **duyurulur** (iOS `AccessibilityNotification.Announcement`,
   web `role="alert"`/`role="status"`); ekran "Dinliyorum" derken duymamak en ağır hatadır (ilke 5), bu yüzden sessiz
   durum değişimi yoktur.
4. Yabancı dildeki asıl cümle kendi diliyle okunur (`accessibilityLanguage(kod)` / web `lang`); Türkçe ses İngilizce
   cümleyi okumaz.
5. Dinleme sürerken her yeni kelimede VoiceOver'ı sürekli konuşturmayız: canlı metin **duyurulmaz**, yalnız biten
   cümlenin çevirisi duyurulur (web: ayrı `aria-live="polite"` bölgesi, yalnız çeviri).

### 5.2 Denetim ve durum tablosu

Sütunlar: **öğe** · **etiket** (VoiceOver'ın okuduğu ad) · **değer / ipucu** · **özellik**.
iOS (i) ve web (w) ortak satırlar tek sıradadır; farklar sütunda belirtilir.

**Çeviri**

| # | Öğe | Etiket | Değer / ipucu | Özellik |
| - | --- | ------ | ------------- | ------- |
| 1 | Uygulama başlığı ("Canlı Çeviri") | "Canlı Çeviri" | — | başlık (`isHeader`); waveform simgesi gizli |
| 2 | CANLI rozeti (yalnız dinlerken) | "Dinleme açık" | — | metin; görünür "CANLI" yerine bu okunur (i: `accessibilityLabel`; w: gizli metin) |
| 3 | Dil şeridi | "Kaynak dil" | değer: "İngilizce, Türkçeye çevrilir"; ipucu: "Dil listesini açar" · dinlerken ipucu: "Dili değiştirmek için önce dinlemeyi durdurun" | düğme (menü); dinlerken **devre dışı** (`notEnabled`; w: `aria-disabled`); w: `aria-haspopup="menu"`, `aria-expanded`. `→` oku okunmaz |
| 4 | Dil menüsü öğesi (×7) | dil adı ("Almanca") | — | menü öğesi + işaretli (`isSelected` / w: `menuitemradio` `aria-checked`) |
| 5 | "Şu An" kartı başlığı | "Şu an" | — | başlık |
| 6 | "Dinliyorum…" durumu | "Dinliyorum" | — | metin; başladığında duyurulur: "Dinleme başladı" |
| 7 | Canlı metin (duyulan, bitmemiş cümle) | "Duyulan: …" | — | metin; **canlı bölge değil**; dil: kaynak dil (`accessibilityLanguage`; w: `lang`) |
| 8 | Son çeviri (büyük) | Türkçe çeviri metni | değer: "Söylenen: <asıl cümle>" | tek öğe (iki metin birleşik); çeviri önce okunur; asıl cümle kaynak dilinde. Yeni çeviri geldiğinde **duyurulur** (yalnız çeviri; w: `aria-live="polite"` ayrı bölge) |
| 9 | "Öncekiler" başlığı | "Öncekiler" | — | başlık |
| 10 | Önceki çeviri satırı (≤ 3) | Türkçe çeviri | değer: "Söylenen: <asıl>" | tek öğe, canlı bölge değil |
| 11 | Boş durum ipucu | "AirPods'u takın ve aşağıdaki düğmeye dokunun. Çeviri kulaklığınızdan okunur." | — | metin |
| 12 | Hata satırı | hata metni | — | metin; **görünür olunca duyurulur** (i: `Announcement`; w: `role="alert"`, var) |
| 13 | Kulaklık durumu (yalnız i) | "Kulaklık: AirPods Pro bağlı" / "Kulaklık bağlı değil. Çeviriyi duymak için AirPods'u takın" | — | metin; **değişince duyurulur** ("Kulaklık bağlandı" / "Kulaklık bağlantısı koptu") |
| 14 | Web notu (yalnız w) | "Web deneme sürümü, çeviri internet üzerinden yapılır" | — | metin |
| 15 | Ana düğme — dinlemiyorken | "Dinlemeyi başlat" | ipucu: "Karşınızdakini dinlemeye ve çevirmeye başlar" | düğme; i: ek `startsMediaSession` (VoiceOver konuşmasını keser) |
| 16 | Ana düğme — dinlerken | "Durdur" | ipucu: "Dinlemeyi ve okumayı durdurur" | düğme; basılınca "Dinleme durdu" duyurulur |

**Sekme çubuğu**

| # | Öğe | Etiket | Değer / ipucu | Özellik |
| - | --- | ------ | ------------- | ------- |
| 17 | Sekme çubuğu (kapsayıcı) | "Sekmeler" | — | i: `isTabBar`; w: `<nav aria-label="Sekmeler">` (var) |
| 18 | Sekme "Çeviri" | "Çeviri" | seçiliyken "Seçili" | düğme (i: `isButton`+`isSelected`; w: `aria-current="page"`, var); simge gizli; "3 sekmeden 1." (i: sistem sıra bilgisi için `accessibilityElement` + `isTabBar`) |
| 19 | Sekme "Geçmiş" | "Geçmiş" | seçiliyken "Seçili" | düğme + seçili |
| 20 | Sekme "Ayarlar" | "Ayarlar" | seçiliyken "Seçili" | düğme + seçili |

**Geçmiş**

| # | Öğe | Etiket | Değer / ipucu | Özellik |
| - | --- | ------ | ------------- | ------- |
| 21 | Ekran başlığı "Geçmiş" | "Geçmiş" | — | başlık |
| 22 | Temizle | "Geçmişi temizle" | ipucu: "Bu oturumdaki tüm çevirileri siler" | düğme; dokunma alanı ≥ 44; (öneri: onay "Geçmiş silinsin mi?") |
| 23 | Boş durum | "Henüz çeviri yok. Çevrilen cümleler burada listelenir." | — | tek metin öğesi; simge gizli |
| 24 | Geçmiş satırı | "<saat>, <Türkçe çeviri>" (saat 24 saat: "13 08") | değer: "Söylenen: <asıl>" | tek öğe; asıl cümle kaynak dilinde okunur |

**Ayarlar**

| # | Öğe | Etiket | Değer / ipucu | Özellik |
| - | --- | ------ | ------------- | ------- |
| 25 | Ekran başlığı "Ayarlar" | "Ayarlar" | — | başlık |
| 26 | Bölüm başlıkları ("Alania-2 API anahtarı", "Ses", "Nasıl çalışır" / "Web deneme sürümü", "Tanılama") | başlık metni (büyük harf yerine `textCase` ile) | — | başlık |
| 27 | API anahtarı alanı | "Alania-2 API anahtarı" | ipucu: "Boş bırakırsanız çeviri Apple'ın Türkçe sesiyle okunur"; değer: boşsa "Boş" | güvenli metin alanı; yer tutucu "pd_live_…" **etiket olarak okunmaz** (i: `accessibilityLabel`; w: `aria-labelledby` var) |
| 28 | Ses seçici | "Okuma sesi" | değer: "Kadın" / "Erkek" | iOS: segmentli seçici; w: `radiogroup` (var) |
| 29 | Seçenek "Kadın" / "Erkek" | "Kadın" / "Erkek" | — | seçenek + seçili (w: `role=radio` `aria-checked`, var) |
| 30 | Dinlemeyi duraklat anahtarı (yalnız w) | "Çeviri okunurken dinlemeyi duraklat" | değer: "Açık" / "Kapalı"; ipucu: "Kulaklıksız, hoparlörle deniyorsanız açın" | anahtar (`role="switch"`, var) |
| 31 | Bilgi satırı (×3) | satır metni | — | metin; simge gizli |
| 32 | Dipnot / açıklama | metin | — | metin (anahtar alanı ve ses kutusu için ipucuna da bağlanır: w `aria-describedby`) |
| 33 | Tanılama satırı | "Tanılama kaydı" | değer: "12 olay" (boşsa "Henüz olay yok"); ipucu: "Sorun bildirmek için olay kaydını açar" | düğme |

**Tanılama**

| # | Öğe | Etiket | Değer / ipucu | Özellik |
| - | --- | ------ | ------------- | ------- |
| 34 | Sayfa | "Tanılama" | — | i: sayfa açılınca ekran değişimi bildirimi (`.screenChanged`), odak başlığa; w: `role=dialog`, `aria-modal`, `aria-labelledby`, odak başlığa |
| 35 | Başlık "Tanılama" | "Tanılama" | — | başlık |
| 36 | Bitti | "Bitti" | ipucu: "Tanılama ekranını kapatır" | düğme; w: `Esc` de kapatır |
| 37 | Gizlilik cümlesi | cümlenin kendisi | — | metin |
| 38 | Olay satırı | "<olay>, saat <12 34 56>" | değer: "<ayrıntı>" | tek öğe (`combine`); uyarı olayında etiket "Uyarı: " ile başlar; simge gizli |
| 39 | "Son 300 olay gösteriliyor." | metin | — | metin |
| 40 | Boş durum | "Henüz olay yok. Dinlemeyi başlattığınızda olaylar burada görünür." | — | tek metin öğesi |
| 41 | Kopyala | "Kopyala" → kopyalandıktan sonra "Kopyalandı" | ipucu: "Olay kaydını panoya düz metin olarak kopyalar" | düğme; kopyalanınca duyuru: "Kayıt panoya kopyalandı" (w: `role="status"` `aria-live="polite"`) |
| 42 | Temizle | "Kaydı temizle" | ipucu: "Tanılama olaylarını siler" | düğme; boşken **devre dışı** (`notEnabled`) |
| 43 | Silme onayı | "Kayıt silinsin mi?" / "Kaydı sil" / "Vazgeç" | ileti: "Kayıttaki 42 olay silinir." | sistem iletişim kutusu (w: düğme metni "Silmek için yeniden dokunun" + duyuru) |
| 44 | Pano yedek metin alanı (yalnız w) | "Tanılama metni" | ipucu: "Seçip kopyalayın" | salt okunur metin alanı |

### 5.3 Duyurular (özet)
| Olay | Duyuru |
| ---- | ------ |
| Başlat'a basıldı | "Dinleme başladı" |
| Durdur'a basıldı | "Dinleme durdu" |
| Hata görünür oldu | hata metninin kendisi |
| Kulaklık bağlandı / koptu | "Kulaklık bağlandı" / "Kulaklık bağlantısı koptu" |
| Yeni çeviri | Türkçe çeviri metni (asıl cümle okunmaz; gezinince okunur) |
| Tanılama kopyalandı | "Kayıt panoya kopyalandı" |
| Tanılama temizlendi | "Kayıt temizlendi" |

Duyurular, çeviri sesinin (AirPods) üstüne binmesin diye **kısa tutulur**; VoiceOver kapalıyken hiçbir şey değişmez.

---

## 6. Erişilebilirlik

- **En küçük dokunma alanı 44 pt / 44 px.** Mevcut ihlaller (ölçüldü / koddan): iOS "Temizle" ≈ 20 pt; web "Kadın/Erkek" 28,
  anahtar 31, "Temizle" 35, dil menüsü öğeleri 42–43 px. Hepsi 44'e çıkar (§3.7, 3.8, 3.11, 3.2). Sekmeler (≈ 61), ana düğme (62),
  dil şeridi (≈ 110) ve girdi (48) yeterli.
- **Dinamik Yazı:** iOS'ta bütün metin sistem biçemlerini kullanır (`.font(.body)` vb.); **sabit boyutlar** `@ScaledMetric`
  olmalı: `.system(size: 54)` boş durum simgesi, `.system(size: 21)` sekme simgeleri, ana düğmenin `frame(height: 62)`'si
  `minHeight: 62` olmalı. En büyük boyut (`accessibility5`) için kurallar: sekme etiketi ve başlık satırı kesilmez
  (başlık iki satıra iner, CANLI rozeti sığmazsa başlığın **altına** geçer); sekme çubuğu `dynamicTypeSize(...accessibility1)`
  ile sınırlanır (Apple'ın sekme çubuğu gibi); alt blok (hata + kulaklık + düğme) ekranın en çok **üçte birini** kaplar,
  fazlası kaydırılan alana taşınır. Web'de px sabit: tarayıcının "sayfa yakınlaştırma"sı çalışır, iOS Safari "metin boyutu"
  ayarı çalışmaz (öneri B-18: `rem` + `font: -apple-system-body`).
- **Hareket azaltma:** iOS'ta yazılı animasyon yok (yalnız sistem geçişleri ve `sensoryFeedback`). Web'de `transition` ve
  `:active scale` var ve `@media (prefers-reduced-motion: reduce)` içinde kapanıyor (kontrol edildi); Tanılama sayfasının
  kayması da aynı koşula bağlanır.
- **Renk dışında işaret:** seçili sekme (kapsül şekli), seçili menü dili (tik), kulaklık uyarısı (simge + metin), dinleme
  (CANLI metni + Durdur metni/simgesi), anahtar (konum), uyarı olayı (simge + sözcük), hata (metin). Yalnız renkle verilen bilgi
  yoktur; kırmızı hiçbir yerde "yanlış/başarısızlık" işareti olarak kullanılmaz (Durdur eylemi dışında).
- **Odak (web):** `:focus-visible` 2 px halka. Mavi dolgu üstünde `acikMavi` halka yetersiz (2,21:1); dolgulu düğmelerde halka
  **beyaz** olur (`outline-color: #fff`, `outline-offset: 2px`).
- **Odak sırası:** görsel sıra = okuma sırası (yukarıdan aşağı; Çeviri'de ana düğme listenin sonunda, sekme çubuğundan önce).
  Tanılama sayfasında odak tuzağı vardır (web: `aria-modal`, `Tab` sayfa içinde döner).
- **Dil:** `lang="tr"` (web, var); asıl cümleler kaynak dil etiketiyle işaretlenir (web `lang="en"` vb.; iOS `accessibilityLanguage`).
  Sağdan sola diller (Arapça): web'de `dir="auto"` var; iOS'ta `Text` otomatik yönlendirir; satır hizası `leading` kalır.

---

## 7. İki sürüm arasındaki bilinçli farklar

| Konu                    | iPhone                                     | Web                                                     | Karar |
| ----------------------- | ------------------------------------------ | ------------------------------------------------------- | ----- |
| Kulaklık durumu         | satır var                                  | yok (not satırı)                                        | bilinçli; metin açık söylemeli (B-14) |
| Duraklat anahtarı       | yok                                        | var (kulaklıksız deneme için)                           | bilinçli; belgelendi (B-16) |
| Tanılama sayfası        | alttan sayfa                               | `.ekran` içi tam ekran sayfa                            | aynı içerik ve ölçü |
| Segmentli seçici, anahtar, menü | yerel (sistem)                      | özel CSS                                                | web, sistemin ölçüsüne ve 44'e uyar |
| Yazı boyutu             | Dinamik Yazı                               | sabit px                                                | öneri B-18 |
| Hata rengi              | `kirmizi` → `acikKirmizi`'ya geçer         | `acikKirmizi`                                           | ortaklaşır |

Bu belge değişirse `arayuz-denetcisi` günceller; kod sahipleri değişiklik ister, belgeyi düzenlemez.
