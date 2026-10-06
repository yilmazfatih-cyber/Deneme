# Sanat yönü — Minik Usta

Sahip: design-lead · Durum: Faz 1 revizyonu (2026-10-04; R-01, R-04, R-05, R-24 işlendi) · Kaynak: `docs/BRIEF.md` §6,
§7, §9, §11 · Kod karşılığı: `src/theme/tokens.json` (her değerin tek kaynağı; türetilen renkler `check.*`, salt
kontrol)

> Bu belgedeki tüm ölçüler **1080×1920 tasarım çözünürlüğünde piksel** (px) olarak verilir. 390 pt genişlikte bir
> telefonda 1 pt ≈ 2,77 px; 375 pt'de 1 pt ≈ 2,88 px. "Hücre" (c) = 120 px (bkz. `UX_FLOWS.md` §0).

---

## 1. His ve ilkeler

1. **Dokunsal ve sıcak (yetişkin casual cilası):** parlak, sıcak, dokunulası. Nesneler cilalı plastik/ahşap malzeme
   hissi taşır: kalın koyu kontur, üstte ışık bandı, altta gölge bandı, köşeler yuvarlak. Gerçekçi doku yok; düz renk +
   2 tonlu ışık. **Okul öncesi stil değil:** ABC küpü, bebeksi oran, neon parıltı yok; üretim istemlerinde "toy box /
   toy-like" yerine "polished, tactile casual-game art for adults" kullanılır (BUSINESS S2–S5).
2. **Önce okunabilirlik:** Tahtadaki her bilgi (renk, şekil, engel, geçit tipi) 375 pt genişlikte 1 saniyede okunur.
   Renk asla tek taşıyıcı değildir: her renk bir sembol, her geçit tipi bir biçim, her engel bir siluet taşır.
3. **Kodla güzel:** Final sanat gelmeden oyun güzel görünmelidir. Bloklar, plan hücreleri, duvar, geçitler ve engeller
   bu belgedeki tariflerle **prosedürel** çizilir: Canvas2D (`Path2D(svgPath)`, kesik çizgi, `shadowBlur`) →
   `textures.createCanvas` → `CanvasTexture`, tek `refresh()` (code-lead; Phaser 4'te Graphics SVG yolu ve blur
   desteklemez). Bloklar **bölüm başında parça bazlı** pişirilir (§3).
4. **Sakin arka plan, canlı tahta:** Arka planlar düşük doygunlukta ve bulanık; en doygun renkler yalnızca bloklarda.
5. **Sarı-siyah ikaz şeridi** yalnızca vurgu: geçit kenarları, duvar başlığı, "ZOR" etiketinin kenarı. Başka yerde yok.

---

## 2. Palet

### 2.1 Blok renkleri (final öneri — kodlar değişmedi)

| Kod | Ad | Brif hex | **Yeni hex** | L\* | Sembol | Sembol mürekkebi | Neden değişti |
| --- | -- | -------- | ------------ | --- | ------ | ---------------- | ------------- |
| W | Ahşap | #B8763E | **#764012** | 33 | ağaç damarı | beyaz %85 | Deuteranopide R ile neredeyse aynıydı (ΔE00 2,1). Koyu ceviz tonuna çekildi. |
| Y | Kum Sarısı | #FFC83D | **#FFE23E** | 90 | üç nokta | koyu (taban ×0,40) | O ile ayrışsın diye daha açık ve güneşli. |
| G | Bahçe Yeşili | #4CC35E | **#44D088** | 75 | yaprak | koyu (taban ×0,40) | Protanopide Y ve O ile karışıyordu; daha açık ve hafif nane. |
| R | Tuğla Kırmızısı | #E8483B | **#CF404E** | 49 | tuğla derzi | beyaz %85 | Protanopide W ile karışıyordu; hafif koyu, kiraz yönüne. |
| O | Kiremit Turuncusu | #F58A2B | **#EC8D20** | 67 | kiremit dalgası | koyu (taban ×0,40) | Küçük ince ayar. |
| C | Beton Grisi | #9AA4B1 | **#C8CFDA** | 83 | çapraz tarama | koyu (taban ×0,40) | Brifte B ile en yakın çiftti; açık, serin beton. |
| B | **Gök Mavisi** (EN *Sky Blue*) | #3BA6F5 | **#2984DE** | 54 | parıltı | beyaz %85 | Tritanopide G ile karışıyordu (6,5); daha koyu. |
| P | Mozaik Moru | #9B5DE5 | **#5D3AAE** | 35 | elmas | beyaz %85 | Deuteranopide B ile karışıyordu (9,3); derin mor. |

Ad notu (P-9, R-05 KABUL): B'nin adı **"Gök Mavisi"** (EN *Sky Blue*); eski ad "Cam Mavisi" S3 "Cam Blok" bayrağıyla
karışıyordu. Kod B aynı kalır. Palet değişikliği (P-1) proje sahibine bilgi olarak sunulur; renk kodları değişmedi.
Renk adları **yalnız belgelerde** geçer; oyuncuya görünen hiçbir metinde (öğretici, ipucu, renk körü modu dahil) renk
adı yoktur (R-08; renk sembolle tanınır). Bu yüzden STORY'de `color.name.*` anahtarı yoktur.

Açıklık merdiveni (L\*): **Y 90 › C 83 › G 75 › O 67 › B 54 › R 49 › P 35 › W 33.** Renk körlüğünde ton kaybolsa da
açıklık kalır; palet bu merdivenle ayrışır. W ile P aynı açıklıkta ama ton ekseni zıt (sarı-kahve ↔ mavi-mor) olduğu
için üç simülasyonda da ayrık kalır (≥ 22 ΔE00).

### 2.2 Renk körlüğü doğrulaması (hesaplandı)

**Yöntem.** Atılabilir betik (`scratchpad/design-lead/cvd_check.py`, proje dışında) 8 rengi üç modelle simüle etti:
Machado 2009 (şiddet 1,0), Brettel 1997 ve Viénot 1999 (yalnız protan/deutan; tritan için geçerli değil). Kütüphane:
DaltonLens 0.1.5 (`pip install daltonlens`). Her çift için sRGB → CIELAB (D65) → **CIEDE2000**; her koşulda modeller
arasındaki **en kötü** değer alındı. CIEDE2000 uygulaması Sharma (2005) test çiftleriyle doğrulandı (2,0425 ve
27,1492). Eşik: **ΔE00 < 12 = zayıf çift** (tahtada bir bakışta karışma riski); normal görüşte hedef ≥ 20.

**Brif paleti (başlangıç):**

| Koşul | En düşük ΔE00 (çift) | 2. | 3. | ΔE00 < 12 olan çiftler |
| ----- | -------------------- | -- | -- | ---------------------- |
| Normal | **12,9** (W–O) | C–B 17,6 | W–R 19,4 | — |
| Deuteranopi | **2,1** (W–R) | G–O 8,9 | G–R 9,1 | W–R 2,1 · G–O 8,9 · G–R 9,1 · B–P 9,3 · W–G 9,5 · Y–O 10,0 · R–O 11,0 |
| Protanopi | **7,4** (W–R) | Y–G 7,6 | G–O 9,1 | W–R 7,4 · Y–G 7,6 · G–O 9,1 · W–O 11,1 |
| Tritanopi | **6,5** (G–B) | W–O 10,3 | W–R 11,2 | G–B 6,5 · W–O 10,3 · W–R 11,2 |

**Yeni palet (öneri):**

| Koşul | En düşük ΔE00 (çift) | 2. | 3. | ΔE00 < 12 olan çiftler |
| ----- | -------------------- | -- | -- | ---------------------- |
| Normal | **26,3** (W–R) | Y–O 27,2 | B–P 28,7 | — |
| Deuteranopi | **14,4** (Y–O) | G–O 15,5 | B–P 15,8 | — |
| Protanopi | **14,1** (W–R) | Y–G 14,5 | G–O 15,1 | — |
| Tritanopi | **16,6** (G–B) | R–O 16,8 | G–C 16,9 | — |

Sonuç: en kötü çift 2,1 → 14,1. Zayıf çift kalmadı. En yakın kalan çiftler (Y–O deutan, W–R protan, G–B tritan)
sembolle ayrışır: üç nokta ↔ kiremit dalgası, ağaç damarı ↔ tuğla derzi, yaprak ↔ parıltı.

Simüle edilmiş görünüm (Machado / Brettel), inceleme için:

| Kod | Normal | Deutan | Protan | Tritan |
| --- | ------ | ------ | ------ | ------ |
| W | #764012 | #5C5211 / #5D4F0C | #50460A / #524613 | #813436 / #783A43 |
| Y | #FFE23E | #FEE649 / #FEE03E | #F8DC19 / #FEE13D | #FED0C2 / #FED4D9 |
| G | #44D088 | #BCB38C / #BEB18B | #CEBF83 / #D7C487 | #00CEBD / #6BC4E1 |
| R | #CF404E | #8A7F4A / #8A7B48 | #66604D / #635E4F | #E21946 / #CF3D58 |
| O | #EC8D20 | #C1AC21 / #C2A710 | #AA9600 / #B09822 | #FE7679 / #F18290 |
| C | #C8CFDA | #C9CDD9 / #C9CEDA | #CBCFDA / #CACED9 | #C3D1D2 / #C6CFD4 |
| B | #2984DE | #387ADC / #3881DE | #578AE1 / #3D83DD | #0099A6 / #008FAF |
| P | #5D3AAE | #004FAB / #0057AD | #0053B1 / #0047AE | #44566E / #41545C |

**Plan hücreleri de ölçüldü.** Brifteki "aynı renk %30 opak" ozalit mavisi (#1F4F8F) üstünde: normal görüşte en
düşük 7,7; renk körlüğünde **3,8–4,1** (W–R, G–C). Yani plan renkleri birbirinden zor ayrılır. Opaklık–ΔE00 tablosu:

| Plan dolgu opaklığı | Normal | Deutan | Protan | Tritan |
| ------------------- | ------ | ------ | ------ | ------ |
| %30 (brif) | 7,7 | 3,9 | 4,1 | 3,8 |
| %60 | 17,9 | 9,9 | 12,7 | 8,9 |
| %70 | 20,6 | 11,3 | 14,6 | 10,6 |
| %75 | 22,2 | 11,9 | 15,4 | 11,9 |
| **Açık altlık #BCCADD + renk %80 (seçilen)** | **22,8** | **12,2** | **13,6** | **13,5** |

%70 doğrudan mavi üstüne karıştırıldığında sarı zeytin yeşiline döner (#BCB656) ve "plan sarısı" bloğun sarısına
benzemez. Bu yüzden seçilen tarif: hücreye önce "açık altlık" (#BCCADD = beyaz %70 + ozalit), üstüne renk %80.
Renkler kendi tonunda kalır (Y plan = #F2DD5E) ve renk körlüğünde ayrım daha iyidir. Plan hücresini yerleşmiş bloktan
ayıran şey biçimdir: plan hücresi düz (bevel, parlama, gölge yok), içe 8 px çekik, **kesik** kontur ve ozalit ızgara
çizgileri plan hücresinin **üstünden** geçer ("kâğıda basılı"); bloğun üstünden asla geçmez (bkz. §4).

**Sembol kontrastı da ölçüldü.** Brifteki "%35 beyaz sembol" açık renklerde görünmez (kontrast oranı Y 1,08, C 1,18,
G 1,25). WCAG 1.4.11 grafik nesne eşiği 3:1'dir. Kural:

| Taban | Sembol mürekkebi | Kontrast (blok) |
| ----- | ---------------- | --------------- |
| L\* ≥ 60 (Y, C, G, O) | tabanın ×0,40 koyusu, %100 opak | Y 5,33 · C 4,93 · G 4,55 · O 4,10 |
| L\* < 60 (W, R, B, P) | beyaz, %85 opak | W 6,5 · P 6,2 · R 3,8 · B 3,2 |

### 2.3 Arayüz renkleri

| Token | Hex | Kullanım |
| ----- | --- | -------- |
| `ui.panel` | #FFF4D6 | krem panel zemini |
| `ui.panelInset` | #FBE7B5 | panel içi çukur alanlar (hedef kutusu, liste satırı) |
| `ui.panelEdge` | #F2D9A0 | panel iç kenar ışığı |
| `ui.panelShadow` | #C99A52 | panel alt "dudak" gölgesi |
| `ui.ink` | #3B2A1A | ana metin (krem üstünde 12,5:1) |
| `ui.inkSoft` | #6B5440 | ikincil metin, **yalnız krem / nötr zeminde** (krem #FFF4D6 üstünde 6,5:1, nötr #FFF9EA üstünde 6,7:1). Renkli düğme üstünde kullanılmaz (turuncu 3,3:1, yeşil 2,7:1); orada `ui.ink` (turuncu 6,5:1, yeşil 5,3:1) |
| `ui.primary` / `Top` / `Lip` / `Stroke` | #45B649 / #74D16F / #2C8A34 / #1E6427 | "Oyna", "Devam" |
| `ui.secondary` / `Top` / `Lip` / `Stroke` | #FF9A1F / #FFBE5C / #C46A00 / #8A4A00 | "+5 hamle", "Al" |
| `ui.danger` / `Top` / `Lip` / `Stroke` | #E8473B / #FF7468 / #A82A22 / #7A1C16 | kapat (×) |
| `ui.disabled` / `Lip` | #B9B2A5 / #8C8579 | pasif düğme |
| `ui.badgeLocked` | #6B5440 | kilitli öğedeki **gri adet rozeti** dolgusu (açılmadan kazanılan güçlendirici, META §4; UX §0.3): beyaz sayı 7,1:1, gri yuva `ui.disabled` üstünde 3,4:1. Kırmızı `ui.badge` "yeni / dikkat" anlamı taşıdığı için burada kullanılmaz |
| `ui.tagHard` | #E8473B | "ZOR" etiketi |
| `ui.tagSuperHard` | #8E44D9 | "ÇOK ZOR" etiketi |
| `ui.gold` / `goldDark` | #FFC21A / #C98A00 | altın, Altın Mala, Altın Vida |
| `ui.star` / `starOutline` | #FFD23F / #D99A00 | yıldız |
| `ui.heart` | #FF4F6A | can |
| `ui.hazardYellow` / `hazardBlack` | #FFC21A / #2B2B2B | ikaz şeridi (45°, 24 px bant) |
| `ui.overlay` | #141828 (%55) | açılır pencere arkası |
| `ui.neutral` / `Top` / `Lip` / `Stroke` | #FFF9EA / #FFFFFF / #D9C08A / #6B5440 | nötr dolgulu düğme ("Hayır, teşekkürler", "Reklam izle", çıkış onayında "Çık"; "Kal" yeşil, eşit çift düğme, UX §0.3 ve §5.1); yazı `ui.ink` |
| `ui.botBadge` | #E2D5B8 | "çırak" rozeti zemini (yazı `ui.inkSoft`) |
| `color.ghost.valid` | #5CF59A | düşüş gölgesi doğru (Kolay/Normal) |
| `color.ghost.invalid` | #FF4A3D | düşüş gölgesi hatalı (Kolay/Normal) |
| `color.ghost.neutral` | #FFFFFF | düşüş gölgesi (Zor/Çok Zor; açılmamış `?` hücresi) |
| `color.ghost.support` | #FFC21A | K-34 eksik destek hücrelerinin yatay taraması (UX §5.4–5.5) |

Token adları `tokens.json` ile birebirdir: `ui.*` = `color.ui.*`, `board.*` = `color.board.*`.

Düğme yazısı: beyaz dolgu + düğmenin `Stroke` renginde 0,12 em kontur + 4 px aşağı gölge (`Lip` rengi). Beyaz yazının
yeşil üstünde ham kontrastı düşüktür (2,7:1); kontur ve gölge okunurluğu taşır. Bu, türün yerleşik dilidir.

### 2.4 Tahta renkleri

| Token | Hex | Kullanım |
| ----- | --- | -------- |
| `board.yardFloor` | #E9C891 | saha zemini (kum/ahşap) |
| `board.yardFloorAlt` | #E2BD80 | dama deseni için ikinci ton (%50 hücre) |
| `board.yardGrid` | #D4AE6E | saha ızgara çizgisi (3 px) |
| `board.yardFrame` | #B98A4E | saha çerçevesi (20 px tahta kenar) |
| `board.blueprint` | #1F4F8F | şantiye ozalit zemini |
| `board.blueprintDeep` | #173D70 | plan dışı hücreler |
| `board.planUnderlay` | #BCCADD | plan hücresi açık altlığı (üstüne renk %80; bileşik renk formülle üretilir) |
| `board.buildFront` | #FFFFFF | inşa cephesi hücresinin düz konturu (K-34, §4) |
| `board.blueprintLine` + `alpha.blueprintLine` | #FFFFFF %14 | ince ızgara (2 px, her hücre) |
| `board.blueprintLine` + `alpha.blueprintLineMajor` | #FFFFFF %24 | kalın ızgara (3 px, her 2 hücre); ayrı renk token'ı yok, yalnız alfa farklı |
| `board.wall` / `wallLight` / `wallDark` | #A9AFB8 / #C9CED5 / #7D848E | duvar betonu |
| `board.scaffold` / `scaffoldClamp` | #8A96A3 / #FF9A1F | iskele boruları ve kelepçeler |
| `board.craneSky` | #FFFFFF %10 | vinç alanı bandı (gökyüzü üstüne) |
| `board.craneLine` | #FFFFFF %45 | vinç alanı alt sınırı (kesik çizgi) |

---

## 3. Blok render tarifi (prosedürel)

**Yaklaşım: bölüm başında parça bazlı pişirme** (code-lead önerisi, kabul). Bölümde geçen her (şekil × renk × bayrak)
birleşimi için **bir doku** Canvas2D ile çizilir (tipik ≤ 24 doku, en çok 360×360), `CanvasTexture`'a yüklenir; tahtada
parça başına tek `Image`. Böylece kesintisiz dış kontur, yuvarlak dış köşe, **içbükey (iç) köşe**, ilk hücre parlaması,
iç dikiş ve sembol birebir çizilir (4-komşu hücre maskesi iç köşeyi ve parça düzeyindeki parlamayı taşıyamıyordu).
Temas gölgesi, kaldırılmış gölge ve gölge parıltısı için şekil başına ayrı **siluet dokusu** pişirilir (çalışma anında
Filter yok). Renk körü modu açılınca dokular yeniden pişirilir (~10–30 ms). Hücre karosu yalnız plan hücreleri için
kalır. Bitişik iki aynı renkli blok konturla ayrılır.

Ölçüler hücre boyu `c` = `layout.grid.cellPx` 120 px'e göredir (oranlar `tokens.json` → `block`).

| Katman | Tarif | 120 px'te |
| ------ | ----- | --------- |
| 0. Yerleşim | Bloklar arası boşluk: blok dış kenarları 0,025c içe çekilir. | 3 px |
| 1. Taban | Düz `color.block.X`. Dış köşe yarıçapı 0,18c (`block.cornerRadiusRatio`); komşu olan kenarlarda köşe yok. **İç (içbükey) köşe** (L, T, C3): kontur 6 px'lik çeyrek yayla döner, yarıçap 0,06c (`block.innerCornerRadiusRatio`). | r = 22 / 7 px |
| 2. Üst ışık (bevel) | Üstü açık kenarlarda 0,14c yüksekliğinde bant, taban + %20 beyaz karışım. Solu açık kenarlarda 0,06c bant, %10 beyaz. | 17 px / 7 px |
| 3. Alt gölge | Altı açık kenarlarda 0,16c bant, taban × 0,75. Sağı açık kenarlarda 0,06c bant, taban × 0,88. | 19 px / 7 px |
| 4. Parlama | Parça düzeyinde: üstü **ve** solu açık olan hücrelerden en üst-soldakinde beyaz %28 hap: x 0,14c, y 0,12c, g 0,34c, y 0,10c, tam yuvarlak. | 41×12 px |
| 5. İç dikiş | İki komşu hücre arasında 3 px çizgi, taban × 0,85, %60 opak (blok kaç hücre, okunur). | 3 px |
| 6. Kontur | Bloğun dış sınırında 6 px (≈ 2 pt), taban × 0,55 (%45 koyu). | 6 px |
| 7. Sembol | Her hücrenin ortasında, kutu 0,46c; mürekkep §2.2'deki kurala göre. | 55 px |
| 8. Temas gölgesi | Tahtada dururken: `shadow.contact` (y +4, 6 px bulanık, #000 %12); pişirilmiş siluet. | — |
| 9. Kaldırılmış gölge | Sürüklerken: `shadow.lifted` (y +18, 16 px bulanık, #000 %30); vinç alanında `shadow.crane` (y +30, %20); blok ×1,08. | — |

Hesaplanmış katman renkleri (kodda formülle üretilir; `tokens.json` → `check.*` salt kontrol, test ±1):

| Kod | Taban | Üst ışık (+%20) | Alt gölge (×0,75) | Kontur (×0,55) | Sembol mürekkebi |
| --- | ----- | --------------- | ----------------- | -------------- | ---------------- |
| W | #764012 | #916641 | #58300E | #41230A | #FFFFFF %85 |
| Y | #FFE23E | #FFE865 | #BFAA2E | #8C7C22 | #665A19 |
| G | #44D088 | #69D9A0 | #339C66 | #25724B | #1B5336 |
| R | #CF404E | #D96671 | #9B303A | #72232B | #FFFFFF %85 |
| O | #EC8D20 | #F0A44D | #B16A18 | #824E12 | #5E380D |
| C | #C8CFDA | #D3D9E1 | #969BA4 | #6E7278 | #505357 |
| B | #2984DE | #549DE5 | #1F63A6 | #17497A | #FFFFFF %85 |
| P | #5D3AAE | #7D61BE | #462C82 | #332060 | #FFFFFF %85 |

**Bayrak katmanları** (renk bloğunun üstüne, sembolün altına):

| Bayrak | Görsel |
| ------ | ------ |
| `glass` (S3) | Taban %78 opak; iki çapraz beyaz çizgi (%55, 8 px ve 4 px, 35°); sağ alt köşede 28 px "çatlak cam" rozeti (beyaz üçgen kırık çizgi). Kontur beyaz %70, 4 px (normal konturun içinde). |
| `mortar` (Y8) | Alt kenardan sarkan 3 gri harç damlası (#B9B4AA, kontur #7D776C), sağ üstte 32 px mala rozeti. |
| `balloon` (S8) | Bloğun üst ortasına bağlı 1 balon (1×1–1×2 bloklarda) ya da 2 balon (daha geniş): beyaz balon #FFFFFF, kontur #3B2A1A, ip 3 px. Boşta 2 s sinüs, ±4 px yüzme. |
| `chained` (Y3) | Bloğun üstünde çapraz iki zincir (halkalar 22×14 px, #6E7681, kontur #3F454D); merkezde 40 px asma kilit (#FFC21A). |
| `wet` (Y4) | Bloğun üstünde parlak gri ıslak beton tabakası (#8E959E %55) + 2 beyaz parlama; sağ üstte sayaç rozeti (Ø 48 px, krem zemin, `ui.ink` rakam, Baloo 2 800, 34 px). Sembol %50 opak (blok hâlâ okunur). |

### 3.1 Sembol vektör tarifleri

Her sembol 100×100 birimlik kutuda tanımlıdır; hücrede 0,46c kutuya ölçeklenir (120 px'te 55 px). Çizgi kalınlığı
birim cinsindendir (×0,55 → px). `stroke-linecap: round; stroke-linejoin: round`. Dolgu ve çizgi = sembol mürekkebi.
Siluetler bilinçli olarak farklı yapıdadır (dalgalı çizgi / nokta / dolu yaprak / ızgara / kavis / X / yıldız / eşkenar
dörtgen) — gri tonlamada da ayırt edilirler.

| Kod | Sembol | SVG yolu (100×100) |
| --- | ------ | ------------------ |
| W | ağaç damarı | `<path d="M10 24 C30 14 50 34 90 22" stroke-width="9" fill="none"/>` `<path d="M10 50 C22 42 34 58 48 50" stroke-width="9" fill="none"/>` `<ellipse cx="70" cy="51" rx="11" ry="7" stroke-width="7" fill="none"/>` `<path d="M10 76 C30 66 50 86 90 74" stroke-width="9" fill="none"/>` (budak sağda; ortada olursa göze benziyor) |
| Y | üç nokta | `<circle cx="50" cy="28" r="13"/>` `<circle cx="27" cy="70" r="13"/>` `<circle cx="73" cy="70" r="13"/>` (dolu) |
| G | yaprak | `<path d="M18 82 C18 40 46 14 86 14 C86 54 60 82 18 82 Z"/>` (dolu) + damar `<path d="M24 76 L68 32" stroke="TABAN" stroke-width="7"/>` |
| R | tuğla derzi | `<rect x="10" y="16" width="80" height="68" rx="10" stroke-width="8" fill="none"/>` `<path d="M10 50 H90 M50 16 V50 M30 50 V84 M70 50 V84" stroke-width="8"/>` |
| O | kiremit dalgası | `<path d="M8 44 Q22 18 36 44 Q50 18 64 44 Q78 18 92 44" stroke-width="9" fill="none"/>` `<path d="M8 80 Q22 54 36 80 Q50 54 64 80 Q78 54 92 80" stroke-width="9" fill="none"/>` |
| C | çapraz tarama | `<path d="M18 50 L50 18 M18 82 L82 18 M50 82 L82 50 M18 50 L50 82 M18 18 L82 82 M50 18 L82 50" stroke-width="8"/>` |
| B | parıltı | `<path d="M46 8 C50 36 58 44 86 48 C58 52 50 60 46 88 C42 60 34 52 6 48 C34 44 42 36 46 8 Z"/>` + `<path d="M82 8 C83 16 85 18 93 19 C85 20 83 22 82 30 C81 22 79 20 71 19 C79 18 81 16 82 8 Z"/>` (dolu) |
| P | elmas | `<path d="M50 8 L90 42 L50 92 L10 42 Z"/>` (dolu) + faset `<path d="M10 42 H90 M30 42 L50 8 L70 42 L50 92" stroke="TABAN" stroke-width="6" fill="none"/>` |

`TABAN` = bloğun taban rengi (sembolün içine "oyma" çizgi). Renk körü modunda (§10) semboller ×1,2 büyür.

---

## 4. Şantiye (ozalit) ve plan hücreleri

- **Zemin:** `board.blueprint` #1F4F8F; ince ızgara her hücre (beyaz %14, 2 px), kalın ızgara her 2 hücre (beyaz %24,
  3 px); sol alt köşede 0,6c'lik "pafta" köşebendi (beyaz %30 L çizgisi). Kâğıt dokusu: 2 px'lik rastgele beyaz %4
  benekler (tohumlu gürültü, sabit).
- **İskele:** şantiyenin iki yanında dikey boru (16 px, `board.scaffold`, üstte ışık 4 px), her 2 satırda yatay
  kuşak borusu (10 px, %70 opak) ve birleşim yerlerinde turuncu kelepçe (20×20, `board.scaffoldClamp`). Dilim
  tamamlanınca iskele söner (%100 → %30 opaklık `alpha.segmentDoneScaffold`, 200 ms `duration.scaffoldFade`; JUICE #18).
- **Tavan kirişi (S8 balon tavanı, product-lead P-3):** aktif dilimin plan tepesinde (satır `h + e` sınırı) **her
  bölümde** yatay çelik kiriş: 12 px (`plan.ceilingBeamPx`) `board.scaffold` boru + iki uçta turuncu kelepçe. Plan
  yüksekliğini bir bakışta gösterir; asansörde (S6) çerçeveyle birlikte hareket eder. Balon kirişe çarpınca 2 küçük
  sekme yapar ve ipi kirişe bağlanır (JUICE #43).
- **Katman sırası** (alttan üste): ozalit zemin → plan hücreleri → **ozalit ızgara katmanı** (dilim başına önceden
  çizilmiş tek saydam doku) → inşa cephesi konturu → yerleşmiş bloklar → tavan kirişi → gölge → sürüklenen blok.
- **Plan hücresi (renk):** içe 8 px çekik, köşe yarıçapı 0,14c; önce açık altlık `board.planUnderlay` #BCCADD,
  üstüne renk %80 (`alpha.planFill`; renk körü modunda `a11y.colorBlindPlanFill` %90 — formül esastır, bileşik hex
  `check.plan` yalnız kontroldür; dolgu opak olduğu için düz renk çizilir); kontur 4 px **kesik** (14 px çizgi, 10 px boşluk), bileşik dolgu × 0,65; sembol
  %100, mürekkep (`color.planInk`): Y, G, O, C **ve B** plan hücrelerinde koyu lacivert #14233D; W, R, P'de beyaz %100
  (`alpha.planInkLight` 1,0). Plan sembolü renk körü oyuncu için rengin ikincil taşıyıcısıdır; her durumda WCAG 1.4.11
  ≥ 3:1 (ölçüldü; varsayılan / inşa cephesi +%15 açık): W 5,9 / 4,3 · R 4,0 / 3,2 · P 5,6 / 4,1 · B 4,8 / 5,8 · Y 11,4 ·
  G 8,1 · O 6,6 · C 9,9; renk körü modu (%90 dolgu) en düşük R 3,5. Eski B beyaz %90 (2,9:1, cephede 2,5:1) eşiğin
  altındaydı. Bevel, parlama ve gölge **yok**. Ozalit ızgarası plan hücrelerinin üstünden geçer (beyaz %14). Bileşik plan renkleri (kontrol için):
  W #845C3B · Y #F2DD5E · G #5CCF99 · R #CB5C6B · O #E29946 · C #C6CEDB · B #4692DE · P #7057B7.
- **`.` hücresi (boş kalacak):** dolgu yok; 45° beyaz %28 çapraz tarama (4 px çizgi, 16 px aralık); 3 px beyaz %40 kesik
  kontur. Pencere/kapı/kemerde komşu `.` hücreleri tek bir kemer/pencere çerçevesi olarak birleşik çizilir (dış hatta
  4 px beyaz %55 düz çizgi).
- **`?` hücresi (gizli):** dolgu beyaz %10; 4 px beyaz %60 kesik kontur; ortada 64×64 "kâğıt etiket" (krem #FFF4D6, 4 px
  ip deliği) üstünde `?` (Baloo 2 800 glifi, 52 px, `ui.ink`; el yazısı değil). Doğru dolunca etiket kart gibi döner
  (bkz. JUICE) ve plan rengi + sembol açılır. `?` hücresine değen gölge bütün zorluklarda nötrdür.
- **İnşa cephesi (K-34, R-01):** her şantiye sütununda doldurulabilir en alt boş plan hücresi (altındaki bütün hücreler
  doğru dolu ya da **boş** `.`; sütun tamamsa ya da altında yanlış nesne — moloz, yapışmış harçlı blok — duran bir `.`
  varsa o sütunda cephe yok, GDD K-34 kanca 1, E-43) **düz** 6 px kontur (`plan.frontStrokePx`, `board.buildFront`) ve +%15 açıklık
  (`plan.frontLighten`) alır; dış parlama `alpha.buildFrontGlow`. Diğer boş hücreler kesik konturda kalır. `?` hücresi
  cephedeyse etiketi aynı düz konturla çerçevelenir (renk bilgisi vermez). Altın Mala hedefleri bu kümedir.
- **Eksik destek taraması (K-34):** yatay çizgi (6 px, 20 px aralık, `color.ghost.support` %85), hücre konturunun
  içinde; renk uyuşmazlığının 45° taramasından yön olarak ayrılır. Taranan hücreler `missingSupport` kümesidir: doğru
  dolu olmayan plan hücreleri ve içinde yanlış nesne (moloz, yapışmış harçlı blok) duran `.` hücreleri; ikincisinde
  tarama nesnenin üstüne çizilir. Yalnız gölgede (Kolay/Normal) ve geri sekme ya da harç yapışmasından sonra 600 ms
  görünür.
- **Plan dışı:** `board.blueprintDeep`, ızgara yok.
- **Yerleşmiş blok:** §3 tarifinin aynısı + kilit işareti: yerleştiği an hücre köşelerinde 4 küçük "harç" noktası
  (beyaz %50, 6 px) belirir ve kalır (K-14 kilit, dokunulmaz).
- **Düşüş gölgesi (K-18):** bkz. `UX_FLOWS.md` §5.4.

---

## 5. Duvar, geçitler ve vinç alanı

**Duvar (K-04):** genişlik 0,5c (60 px, `layout.grid.wallW`), `height` satır kadar. Mantıkta duvar sütun 5 ile 6
arasındaki sıfır genişlikli **sınırdır** (R-03); 60 px yalnız görseldir, geçitten geçen blok çizimde duvar şeridinin
üstünden kayar. Beton gövde `board.wall`; dikey kalıp çizgileri (2 px,
`wallDark` %40, 20 px aralık); sol kenar 6 px `wallLight`, sağ kenar 6 px `wallDark`; 6 px `#3B2A1A` %80 kontur.
Üstte 20 px duvar başlığı: sarı-siyah ikaz şeridi + 6 px kontur. Duvar 8 satırsa başlık vinç alanının alt sınırına
oturur.

**Vinç alanı (K-05):** tahtanın üstünde 2 satır (240 px) gökyüzü; `board.craneSky` bandı + alt sınırda 4 px kesik çizgi
(`board.craneLine`, 16/12 px). Sol uçta sabit küçük vinç kancası süsü (80×120, sallanmaz). Sağ kenarda **açık yükseklik
işareti**: duvar tepesinden (y = `height`) vinç alanı tavanına (y = 10) uzanan dikey cetvel, içinde `10 − height` kısa
çentik + küçük ↕ (K-05; duvar 8 → 2 çentik, duvar 7 → 3 çentik; metin yok, sayı çentikten okunur). Boyu `10 − height`'i
aşan blok takılınca işaret ve kesik çizgi 400 ms parlar.
Saha tarafındaki havada bırakılan blok buradan yerine döner (JUICE: iptal).

**Hiza kılavuzu (S6 asansör, W5 kayar kapı):** geçidin satırını şantiyede gösteren 3 px beyaz %35 yatay kesik çizgi,
geçitten şantiyenin sağ kenarına kadar; geçit ya da çerçeve kayınca çizgi de kayar.

**Geçitler — her tipin ilk bakışta ayrışan bir siluet işareti var:**

| Tip | Kimlik | Görsel tarif | Bir bakışta ayırt eden |
| --- | ------ | ------------ | ---------------------- |
| Sabit | W1, `static` | Duvarda `size` satırlık açıklık; üst ve alt kenarda 14 px sarı-siyah ikaz bandı; açıklığın içinden şantiyeye uzanan **2 çelik ray** (6 px, `board.scaffold`, açıklığın üst ve alt sınırında). | Yalnızca ikaz bandı + ray. Temel tip. |
| Dar (**katman**, tip değil) | W3 = `size = 1` olan **her** geçit tipi (OBSTACLES W3, N2) | Geçidin kendi tip görünümünün **üstüne** eklenir: iki yanda içe bakan **çelik çene** (►◄, 18×28 px üçgenler, `board.narrowJaw` #4A525C) + açıklığın çevresinde 10 px çelik çerçeve. Tip işaretleri korunur ve tek satıra sığdırılır: dar sabit = ikaz bandı + ray; dar kepenk = lameller + sayaç rozeti (#35); dar kayar kapı = dikey ray izi + ▲▼ rozeti, turuncu plaka çenelerin dışında (#16); dar boya kapısı = damla çerçeve + sembol damlası, damlalar çerçevenin dışına sarkar (#22); dar kilitli = parmaklık (2 çubuk) + asma kilit 56×64'e küçülür, çene kilidi örtmez (#30). | İçe bakan çeneler + tek satırlık yarık; tip işareti ayrıca okunur. |
| Kepenk | W4, `shutter` | Açıklığa **yatay metal panjur** lamelleri (8 px lamel, 4 px aralık, #7D8793 / #A3ABB5). Açıkken panjur üstte 28 px'lik silindir olarak sarılı durur. Duvarın üstünde sayaç rozeti: Ø 52 px, içinde "kaç hamle sonra değişecek" rakamı + 1 küçük kilit/açık kilit simgesi. | Lamelli panjur + sayaç rozeti. |
| Kayar kapı | W5, `slider` | `range` boyunca duvarın yüzünde **2 dikey ray çizgisi** (4 px, beyaz %60); açıklığın yanında ▲▼ ok rozeti (Ø 52 px), bir sonraki hamledeki yön dolu, diğeri boş. Açıklık çerçevesi turuncu (#FF9A1F) "araba" plakası. | Dikey ray izi + yön oku. |
| Boya kapısı | W6, `paint` | Açıklık çerçevesi **geçidin renginde boya damlalarıyla** (8 damla, 10–18 px, kenardan sarkar); üstte damla biçimli rozet (56×68) içinde o rengin sembolü. Boşta damlalar 1,6 s'de bir hafif salınır. | Renkli damla çerçeve + sembol damlası. |
| Kilitli | W7, `locked` | Açıklık **dikey parmaklıklı kapı** ile kapalı (4 çubuk, 10 px, #6E7681); ortada büyük asma kilit (72×80, `ui.gold`, kontur `goldDark`); kilidin üstünde anahtarın kimlik rengi şeridi (birden çok kilitte). | Parmaklık + altın asma kilit. |
| Rüzgâr fanı | W8 (geçit değil) | Duvar başlığının üstünde fan muhafazası (112×112, `board.wall`, 6 px kontur), içinde dönen 3 kanat (#FFFFFF), şantiye üstünde `dir` yönünde 3 kesik rüzgâr çizgisi (beyaz %55, 2 s döngü). | Dönen fan + rüzgâr çizgileri. |

Gizli kural: Hiçbir iki geçit tipi aynı renk + aynı biçim kombinasyonunu kullanmaz. Kepenk ve kilitli ikisi de "kapalı"
olabilir; kepenk **yatay** lamel, kilitli **dikey** parmaklık + altın kilit — siluetleri diktir.

---

## 6. Engeller (saha ve şantiye)

| Engel | Kimlik | Görsel tarif (hücre 120 px) | Ayırt eden |
| ----- | ------ | --------------------------- | ---------- |
| Ahşap kasa 3 kat | Y1 hp3 | Açık çam kasa #D9A35B, 4 yatay tahta (çizgi #A8743A), X çapraz destek, köşe çivileri (6 px, #6E7681); **2 metal kuşak** (12 px, #8A96A3) dikey; sağ altta 3 nokta (●●●). Kontur #6B4420 6 px. | W bloğundan ayrımı: açık çam + X destek + sembol yok + metal kuşak. |
| Ahşap kasa 2 kat | Y1 hp2 | Aynı, **1 metal kuşak**; ●● ; köşede küçük çatlak. | Nokta sayısı = kat; kuşak sayısı = kat − 1. |
| Ahşap kasa 1 kat | Y1 hp1 | Kuşak yok; 2 çatlak çizgisi; ● ; tahta hafif eğik. | Kırılmaya hazır görünüm. |
| Çimento torbası | Y2 | Kâğıt çuval siluetinde (alt geniş, üst bağlı) #EDE6D6, kontur #8C8272; ortada gri tuğla piktogramı (#9AA4B1); üstte ip bağı. Hafif "çökmüş" alt kenar. | Yumuşak çuval silueti, blok değil. |
| Zincir | Y3 | §3 `chained` katmanı. | Çapraz zincir + kilit. |
| Islak beton | Y4 | §3 `wet` katmanı + sayaç. | Parlak gri tabaka + rakam. |
| Altın vida | Y7 | Zemin hücresinde altın vida başı (Ø 56, `ui.gold`, artı yarık #C98A00). Üstü kapalıyken, kapatan bloğun (ya da kasanın) o hücresinin sağ alt köşesinde 20 px altın "ışıltı" ucu + 28 px soluk vida simgesi **her zorlukta** görünür (adalet: konum gizlenmez; product-lead onayı, GDD K-42). | Altın daire + artı yarık. |
| Anahtar | W7 | Zemin hücresinde altın anahtar (88×40, `ui.gold`), halkasında kilidin kimlik rengi şeridi. Üstü kapalıyken vida gibi köşe ışıltısı. | Anahtar silueti. |
| Moloz | S4 | Blok şeklinde ama **kırık beton parçaları**: #8D8579 kahve-gri, 3–4 düzensiz çatlak (#5E574D), dış hattı tırtıklı (6 köşeli kırık), sembol yok, üstünde toz zerreleri. | Tırtıklı kenar + çatlak; C bloğundan (açık, düzgün, sembollü) belirgin koyu. |
| Cam blok | S3 | §3 `glass` katmanı. | Saydamlık + çapraz parıltı + kırık cam rozeti. |
| Harçlı blok | Y8 | §3 `mortar` katmanı. | Sarkan harç + mala rozeti. |
| Balonlu blok | S8 | §3 `balloon` katmanı. | Bağlı beyaz balon. |
| Ağır malzeme | Y5 | Normal blok tarifi + şerit: blok üstünde 2 sarı-siyah ikaz bandı (16 px) ve sol üstte 40 px "ağırlık" rozeti (kettlebell silueti, #3B2A1A). Genişlik ≥ 3. | İkaz bandı + ağırlık rozeti. |

---

## 7. Arka planlar (hikaye bölümüne göre)

Katmanlar (arkadan öne): gökyüzü gradyanı → bulutlar → uzak siluet → orta katman → yakın katman. Oyun ekranında
yalnızca tahtanın çevresi ve vinç alanı görünür; arka plan %0 bulanık ama doygunluğu tahtadan en az %30 düşük.
Ana ekranda (Kasaba) hafif paralaks: uzak 0,2, orta 0,5, yakın 1,0. Uzak / Orta / Yakın sütunlarının ilk hex'i
`tokens.color.chapter.ch<n>.far` / `mid` / `near` ile birebirdir (tek kaynak tokens).

| Hikaye bölümü | Gökyüzü (üst → alt) | Bulut | Uzak | Orta | Yakın / vurgu |
| ------------- | ------------------- | ----- | ---- | ---- | ------------- |
| 1 Ağaç Ev | #7FD3F7 → #D6F2FF | #FFFFFF | tepe silueti #9ED9A0 | orman #5FB86A, ağaç tepeleri yuvarlak | çimen #4FA65A, papatya noktaları #FFFFFF / #FFE23E |
| 2 Mahalle Fırını | #FFC98A → #FFF0D6 | #FFF7EA | çatı silueti #F2B27A | kasaba sokağı #E99A55, bacadan kıvrık duman | kaldırım #D98A4A, sıcak pencere ışıkları #FFE7A3 |
| 3 Okul Kütüphanesi | #9DB5F2 → #E6E2FF | #F4F2FF | okul silueti #A8A2E0 | ağaçlar #7C76C9 | kitap biçimli bulut süsleri, mozaik karo kenarı #5D3AAE / #2984DE |
| 4 Fener ve Köprü | #FF9E7A → #FFE3B0 (gün batımı) | #FFD3C2 | ufuk #7FD8D2, uzak fener silueti | deniz #2FB7B3 | kayalık #3F7F8C + dalga köpüğü #E8FFFB, martılar (beyaz V) |
| 5 Festival Şatosu | #2E2464 → #6B3FA0 (gece) | #8E6CD9 %50 | tepe silueti #3E2F7A | kasaba ışıkları #FFD24A noktaları | ön plan silueti #2E2464, bayrak dizileri (G, Y, R, B), sıcak sarı ip lambalar, uzak havai fişek (yalnız Kasaba ekranında) |

**Benzerlik sınırları (BUSINESS §2):** Festival Şatosu renkli bloklardan bir "festival kalesi"dir: taç, arma, kraliyet
altını kenar süsü, kırmızı pelerinli figür yok (Royal Match/Kingdom'dan uzak). Oyun ekranında ozalit yalnız 2 sütunda
kalır (tahtanın %24'ü), bloklar mat ve parıltısız (neon/glow yok; Block Blast'ın lacivert tahta + neon görünümünden
uzak); mağaza görsellerinde sıcak saha baskındır.

Ana ekranda aktif yapının yarı inşa hâli arka planın odağıdır (bkz. `ASSET_LIST.md` kasaba yapıları).

---

## 8. Tipografi

**Seçim: Baloo 2** (Ek Type), değişken ağırlık 400–800.

- **Lisans:** SIL Open Font License 1.1 — doğrulandı: Google Fonts deposundaki lisans dosyası
  <https://raw.githubusercontent.com/google/fonts/main/ofl/baloo2/OFL.txt> ("Copyright 2019 The Baloo 2 Project Authors
  (https://github.com/EkType/Baloo2) … licensed under the SIL Open Font License, Version 1.1") ve `METADATA.pb`
  (`license: "OFL"`, alt kümeler: latin, latin-ext, vietnamese, devanagari). OFL, yazılımla birlikte gömmeye ve ticari dağıtıma
  izin verir (madde 2); fontun tek başına satılması yasaktır (madde 1). Lisans dosyası "Reserved Font Name" ilan
  etmiyor; bu yüzden alt küme (değiştirilmiş sürüm) adı korunabilir (madde 3). Telif satırı ve lisans metni uygulama
  içi "Lisanslar" sayfasına eklenir (madde 2).
- **Türkçe karakterler — dosyadan doğrulandı:** `Baloo2[wght].ttf` (sürüm 1.700) indirildi ve fontTools ile cmap
  tarandı: ğ Ğ ü Ü ş Ş ı İ ö Ö ç Ç â î û ₺ … " " « » **hepsi var**. Ayrıca GSUB'da `latn/TRK` `locl` dil sistemi
  mevcut (Türkçe yerelleştirilmiş glifler).
- **Elenen aday — Fredoka:** Google Fonts'taki güncel `Fredoka[wdth,wght].ttf` (sürüm 2.001) tarandı: **ğ Ğ ş Ş İ ve ₺
  yok.** Türkçe metinde karışık font (fallback) görünür; bu yüzden elendi.
- **Teslim:** Latin + Latin Extended-A + Türkçe noktalama alt kümesi, değişken WOFF2: **≈ 38 KB** (pyftsubset ile
  denendi, 2026-10-05: 38.648 bayt; U+0020–007E, U+00A0–017F, U+2010–2027, U+20BA, U+2212, U+00D7, **U+2248** "≈" —
  PriceLabel'daki "≈ 81 TL" için eklendi; glif Baloo 2'de var). Uygulama içinde barındırılır (çevrimdışı ve Capacitor
  için), CDN'e bağımlılık yok. Yedek yığın: `"Baloo 2", "Nunito", system-ui, sans-serif`.
- **Alt küme dışı karakter yasağı:** i18n metinlerinde (`src/i18n/tr.json`, `en.json`) yalnız yukarıdaki aralıklardaki
  karakterler bulunur; yoksa o karakter yedek fontla çizilir ve Fredoka'yı eleten "karışık font" sorunu geri gelir.
  Baloo 2'de **olmayan** ● (U+25CF), ✓ (U+2713), ★, ♥, ∞ (U+221E), ↔, ↕ metne yazılmaz; satır içi simge yer tutucusu kullanılır
  (STORY §0-11: `{coin}` → `icon_coin`, `{ok}` → `ghost_badge_ok`). Wireframe'lerdeki "●" altın simgesidir, karakter
  değildir. **Test notu (code-lead):** i18n dosyalarındaki her karakter alt küme aralığında olmalı (ör. "i18n glyphs
  within Baloo 2 subset"); alt küme aralıkları tek listede tutulur ve font üretim betiği ile test aynı listeyi okur.
- **Rakamlar:** varsayılan rakamlar orantılıdır (0: 583, 1: 357 birim). Hamle sayacı gibi değişen sayılar **ortaya
  hizalanır** (genişlik değişimi kayma yapmaz). Canvas `tnum` açamaz (code-lead); hamle sayacı, altın ve süre
  etiketleri **sabit genişlikli hane yuvalarıyla** çizilir (her rakam en geniş hane genişliğinde ortalanır; code-lead).
- **Yükleme:** `<link rel="preload" as="font" type="font/woff2" crossorigin>` + `@font-face { font-weight: 400 800;
  font-display: block }`; Boot `document.fonts.load('800 120px "Baloo 2"')` ve `'600 44px "Baloo 2"'` bitmeden hiçbir
  `Text` oluşturmaz (yedek fontla rasterize olup kalmasın). iOS'ta değişken ağırlık seçimi bozuksa yedek: 700 ve 800
  statik örnekleri.

| Token | Boyut (px @1080) | ≈ pt @390 | Ağırlık | Satır yüksekliği | Kullanım |
| ----- | ---------------- | --------- | ------- | ---------------- | -------- |
| `font.size.display` | 120 | 43 | 800 | 1,0 | hamle sayacı, "Kazandın!" |
| `font.size.h1` | 88 | 32 | 800 | 1,05 | pencere başlığı, "Bölüm 12" |
| `font.size.h2` | 64 | 23 | 800 | 1,1 | alt başlık, düğme (büyük) |
| `font.size.button` | 56 | 20 | 700 | 1,0 | düğme |
| `font.size.body` | 44 | 16 | 600 | 1,25 | konuşma balonu, açıklama |
| `font.size.small` | 38 | 14 | 600 | 1,25 | rozet, sayaç etiketi |
| `font.size.caption` | 34 | 12 | 600 | 1,2 | **en küçük metin**, altı yasak |

Büyük harf her zaman `toLocaleUpperCase('tr-TR')` ("MİNİK USTA", "ÇOK ZOR"). Başlıklar ve düğmeler: beyaz dolgu + 0,12 em
koyu kontur + 4 px gölge. Konuşma balonu metni: `ui.ink` düz.

---

## 9. İkon dili

- **Izgara:** 128×128 tuval, 8 px iç boşluk; ana biçim 112 px'e sığar. Küçük kullanımda (64 px) aynı çizim ölçeklenir.
- **Kontur:** 8 px `#3B2A1A` (%100), yuvarlak birleşim/uç. 64 px'te 5 px'e iner (en az 4 px).
- **Dolgu:** 2 ton (ana + %25 koyu alt yarı) + üstte beyaz %35 parlama hapı. Gradyan yok.
- **Bakış:** ön/¾ önden, hafif aşağıdan; nesneler tombul ve kısa. Metin yok (i18n gerektirmesin).
- **Metafor:** inşaat ve kasaba nesneleri. Genel kavramlar için tanıdık şekil korunur (can = kalp, ayar = dişli).

| İkon | Biçim |
| ---- | ----- |
| Can | kalp #FF4F6A, ortasında küçük beyaz yıldız (Tuna'nın kask çıkartması) |
| Sınırsız can | aynı kalp; yıldız yerine çizilmiş kalın beyaz sonsuzluk işareti (vektör, font karakteri değil; §8 alt küme yasağı) |
| Altın | sikke `ui.gold`, üstünde kabartma mala |
| Yıldız | tombul 5 köşe `ui.star`, yuvarlatılmış uçlar |
| Hamle | ikon yok; büyük sayaç rakamı ve altında "hamle" etiketi |
| Çekiç | ahşap saplı, kırmızı başlı çekiç, 20° eğik |
| Vinç | sarı kule vinç değil, **kanca + halat** (turuncu kanca #FF9A1F) |
| Boya Fırçası | ahşap saplı fırça, ucu 3 renk şeritli (G, Y, B) |
| Geri Al | kıvrık ok, ucunda küçük mala |
| Termos | mavi termos #2984DE, buhar 2 kıvrım |
| Mala Başlangıcı | altın mala + parıltı |
| Açık Kepenk | yarı açık panjur, yukarı ok |
| Altın Mala (kombo) | altın mala, sapı ahşap |
| Kamyon | turuncu kamyon önden ¾, kasada 3 blok |
| Ayarlar | dişli içinde vida başı |
| Mağaza | çizgili tente + tezgâh |
| Lig | mala biçimli kupa |
| Ana sayfa | kiremit çatılı ev |
| Takım | yan yana iki kask (kilitli: gri + asma kilit) |
| Albüm | spiralli fotoğraf albümü |
| Sallanan Köprü | halat köprü silueti + simit |
| Günlük ödül | takvim yaprağı + yıldız |
| Kumbara | tuğla biçimli kumbara (domuz değil) |
| Bölüm sandığı | ahşap alet sandığı, metal köşeler |
| Duraklat | iki kalın dikey çubuk, yuvarlak düğme içinde |

---

## 10. Renk körü modu (Ayarlar)

Palet zaten üç simülasyonda ≥ 14 ΔE00 ayrıştığı için mod paleti değiştirmez; **ikincil işaretleri güçlendirir**
(her değerin anahtarı `tokens.a11y`):

| Değişiklik | Varsayılan → renk körü modu | Token |
| ---------- | --------------------------- | ----- |
| Blok ve plan sembolü boyu | ×1,0 → ×1,2 | `a11y.colorBlindSymbolScale` |
| Sembol mürekkebi kontrastı | +%15: koyu mürekkep `block.symbolDarkFactor` × (1 − 0,15) (0,40 → 0,34); beyaz mürekkep opaklığı × 1,15 (%85 → %98; plan mürekkebi zaten %100) | `a11y.colorBlindContrastBoost` |
| Plan hücresi renk dolgusu | %80 → %90 | `a11y.colorBlindPlanFill` |
| Gölge rozeti (✓ / ! / ↓) | 44 → 60 px | `a11y.colorBlindGhostBadgePx` |
| Gölge çizgisi (düz/kesik) | +2 px (6 → 8, 8 → 10, 5 → 7) | `a11y.colorBlindGhostStrokeAddPx` |
| Eksik destek taraması | 6 → 8 px | `a11y.colorBlindSupportHatchPx` |
| Boya kapısı damla rozetindeki sembol | ×1,3 | `a11y.colorBlindPaintSymbolScale` |
| Usta Serisi çubuğu | boncuklar + sayı ("3/4") | — |

Blok ve plan dokuları modla birlikte yeniden pişirilir. Renk adı etiketi bu modda da gösterilmez (§2.1).

---

## 11. Karakterler

Genel stil: **büyük kafa (boyun %45'i), küçük gövde**, iri gözler (yüz genişliğinin %16'sı), kalın 6 px `#3B2A1A`
kontur, düz renk + tek gölge tonu, burun küçük yuvarlak. Ten tonları gerçekçi değil, sıcak ve yumuşak. Her karakterin
**tek bir imza siluet öğesi** vardır (karanlıkta bile tanınsın).

### 11.1 Tuna — "Minik Usta"

> Yaş yalnız iç bilgidir (brif: 8); oyun içi metinde ve mağaza materyalinde geçmez (STORY §0-8). **Açık soru (proje
> sahibi):** görsel yaşın 10–12 görünüme çekilmesi (çocuk ürünü sinyalini azaltır; BUSINESS S15).

- **Cinsiyet nötr tasarım önerisi:** Çene hizasında, kaskın iki yanından taşan dağınık kestane saç (perçem değil,
  "kask altından fışkıran tutam"); kirpik vurgusu yok; çil; iri amber gözler; düz, yuvarlak yüz. Kıyafet cinsiyetsiz
  iş kıyafeti. İsim Türkçede iki cinsiyette de kullanılır. Hikaye metinlerinde zamir sorunu TR'de yok; **EN metinlerde
  "he/she" kullanılmaz, isim ya da "they" kullanılır** (bkz. STORY).
- **Kıyafet:** nane yeşili kask #7FE0C4 (brim #5CC9AB), önünde beyaz yıldız çıkartması; turuncu yelek #FF8A1F + 2
  açık sarı reflektör bant #FFF06A; altında krem/teal çizgili uzun kollu tişört (#F7F3EA / #2A9D8F); lacivert pantolon
  #2E3A59, dizde kum rengi yama #E9C891; **kocaman sarı iş eldivenleri** #FFC93C (el başından büyük — imza siluet);
  kırmızı spor ayakkabı #E8473B; sağ kulağın arkasında sarı kurşun kalem (#FFD23F, pembe silgi #FF8FA3).
- **Ten / saç / göz:** #E8B48A / #4A2C1D / #3B2A1A (parlama beyaz 2 nokta).
- **Kişilik pozları:** (1) eldivenli başparmak yukarı, (2) blok kucaklamış taşıyor, (3) kaskını iki eliyle düzeltiyor
  (açılış), (4) kalemle plana not alıyor, (5) zafer zıplaması (kombo dansı: iki eldiven havada döner), (6) şaşkın geri
  sıçrama, (7) oturmuş, çenesi eldivende (düşünme), (8) Kepçe'yi kucaklama.

### 11.2 Usta Dede

- **İmza siluet:** **katlanır ahşap metre** (açık sarı #E9C27A, siyah çentikler) — öğretici sahnelerde işaret çubuğu
  olarak kullanır.
- Kiremit rengi kasket #C65A3A (sert kask değil); çok kalın siyah yuvarlak çerçeveli gözlük (camlar gözleri %130
  büyütür); **mala biçimli** geniş beyaz bıyık #F5F5F0 (uçları yukarı kıvrık değil, düz ve küt); kasketin altından
  taşan beyaz kulak üstü saç; zeytin yeşili çok cepli iş ceketi #7A8B4A, beyaz gömlek; kemerinde sarı şerit metre
  kutusu #FFC21A; uzun ve ince (Tuna'dan 1,6 kat boylu), hafif kambur.
- Ten #D9A27A. Kişilik: sabırlı, şakacı, atasözü sever ama kısa konuşur.
- **Pozlar:** (1) metreyle işaret ediyor (ipucu balonu), (2) kollar kavuşmuş gülümseme, (3) gözlüğünü burnuna itiyor
  (düşünme), (4) Tuna'nın kaskına hafifçe dokunuyor, (5) şaşkınlıkla kasketini kaldırıyor, (6) eski tabelayı gösteriyor.

### 11.3 Kepçe

- **Sosis köpek** (kızıl #B5652B, ağız çevresi #D99A5E, kulaklar #8A4A1F). **Kulaklarına büyük gelen turuncu kask**
  #FF9A1F (sarı değil), kask bir yana kaymış, bir kulak kaskın altından sarkıyor — imza siluet. Nane yeşili tasma
  #7FE0C4, kemik biçimli künye.
- Gövde uzun, bacaklar çok kısa; kuyruk sürekli sallanır (boşta 3 Hz animasyon).
- Kişilik: kazmaya bayılır (kazı mekaniğinin maskotu), heyecanlı, sahibine sadık.
- **Pozlar:** (1) ön patilerle kazıyor (toprak fışkırır), (2) havlıyor (açılış), (3) kask gözüne düşmüş, (4) kuyruk
  pervane gibi dönüyor (kombo), (5) kulakları düşük (üzgün), (6) burnunda bir tuğlayı dengeliyor (gülme).

### 11.4 Bay Gribeton

- **İmza siluet:** **dikdörtgen gövde ve beton blok biçiminde düz, kalıp çizgili gri saç** (#B8BEC6, yatay kalıp izleri)
  — Tuna'nın yuvarlak siluetine bilinçli zıtlık.
- Gri üç parça takım #8C939C, beyaz gömlek, koyu gri kravat #5E656E üstünde minik beton mikseri kravat iğnesi; düz,
  kalın, koyu gri kaşlar #4A4F57; ince düz bıyık ("su terazisi" çizgisi); yarı kapalı, kendinden emin gözler; elinde
  gri sert kapaklı klasör (üstünde "G" harfi yok — logo/harf kullanılmaz; yalnızca gri kare amblem). Cilalı siyah
  ayakkabı. Ten #F0C8A8.
- Kişilik: kibirli ama komik, "verimlilik" takıntılı, gri her şeyi pratik bulur. Kötü adam değil; hikaye boyunca renge
  ısınır (bölüm 5'te kravatında küçük renkli bir mozaik iğne belirir).
- **Pozlar:** (1) klasörü göğsüne bastırıp burnu havada, (2) kaşını kaldırıp şüpheyle bakıyor, (3) ceketinden toz
  silkeliyor, (4) gizlice gülümsüyor (arkasını dönmüşken), (5) çatlak köprü önünde elleri başında, (6) Tuna'ya el sıkışmak
  için uzanıyor.

### 11.5 Kasaba halkı

| Karakter | İmza siluet | Renkler | Pozlar |
| -------- | ----------- | ------- | ------ |
| Fırıncı Ayşe Teyze | uzun saplı ahşap fırın küreği + topuz saç | hardal önlük #E9A93B, un lekeleri beyaz, koyu gri topuz #5A5A5A, pembe yanak | küreği omzunda; ekmek uzatıyor; elleri belinde; bacaya bakıp ağlamaklı |
| Öğretmen Selin | kucağında üst üste 3 kitap + yüksek at kuyruğu | mor hırka #8E6CD9, mozaik desenli atkı (B, P, Y), siyah saç | kitapları sallıyor; parmağını kaldırıp "bilgi" veriyor; ıslak rafa üzülüyor |
| Balıkçı Rıza Kaptan | lacivert örgü bere + sarı muşamba | bere #2E3A59, muşamba #FFD23F, kır kısa sakal #9A9A9A, balık biçimli düdük | dürbünle bakıyor; halat atıyor; şapka sallayarak teşekkür |
| Belediye Başkanı Bay Kurdele | dev altın tören makası + çapraz kırmızı-beyaz kuşak | lacivert takım #2E3A59, kuşak #E8473B / #FFFFFF, makas `ui.gold` | makası havaya kaldırıyor; kurdele kesiyor; nutuk atıyor (eli havada) |

Kasaba halkı §11.6'daki ifade setinden MVP kapsamındakileri kullanır.

### 11.6 İfade seti

**Kapsam (entrepreneur):** MVP'de ana 4 karakter (Tuna, Usta Dede, Kepçe, Gribeton) 6 ifade; yan 4 karakter (Ayşe,
Selin, Rıza, Kurdele) 3 ifade (mutlu, şaşkın, üzgün); kalan ifadeler **[Sonra]**. Figüranlar yalnız mutlu/şaşkın.

Yüz parçaları değiştirilerek üretilir (gözler, kaşlar, ağız). Koordinatlar 256×256 kafa kutusunda; göz merkezleri
(102, 140) ve (154, 140), ağız merkezi (128, 176). Karakterler kendi yüzlerine ölçekler.

| İfade | Gözler | Kaşlar | Ağız | Ek |
| ----- | ------ | ------ | ---- | -- |
| mutlu | elips rx 12 ry 15, parlama 4 px | yukarı kavis `M88 116 Q102 108 116 116` | gülümseme `M106 170 Q128 192 150 170` (stroke 6) | yanak pembe %40 |
| şaşkın | daire r 16, göz bebeği r 7 | yükseğe kalkık `M88 106 Q102 98 116 106` | "O" `ellipse rx 10 ry 13` dolu #7A2E2E | 3 küçük şaşırma çizgisi kafa üstünde |
| üzgün | elips ry 12 + üst göz kapağı çizgisi | iç uçlar yukarı `M88 122 L114 114` | ters kavis `M110 184 Q128 170 146 184` | gözyaşı yok (ölçülü) |
| kararlı | elips ry 11, bebek biraz içte | iç uçlar aşağı `M88 112 L116 120` | düz, bir yan yukarı `M110 178 L146 172` | yumruk pozu |
| gülme | kapalı ters U `M90 142 Q102 128 114 142` | yukarı kavis | açık D: `M104 166 H152 Q150 198 128 198 Q106 198 104 166 Z` dolu #7A2E2E + dil #FF8A8A | omuzlar kalkık |
| düşünme | bebekler sağ üste kaymış (+4, −4) | biri kalkık, biri düz | yan çizgi `M118 178 Q128 172 140 180` | el çenede |

### 11.7 Yer tutucu SVG tarifleri

Yer tutucular Faz 2'de kodla ya da statik SVG olarak kullanılır. Hepsi `viewBox="0 0 256 320"` (büst), 6 px kontur
`#3B2A1A`. Yüz parçaları `<g id="face">` içindedir; ifade değiştirmek için yalnız bu grup değişir (§11.6).

**Tuna:**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 320" stroke="#3B2A1A" stroke-width="6" stroke-linejoin="round">
  <rect x="80" y="206" width="96" height="92" rx="28" fill="#2A9D8F"/>
  <path d="M84 212 H172 V286 Q172 298 160 298 H96 Q84 298 84 286 Z" fill="#FF8A1F"/>
  <path d="M84 240 H172 M84 264 H172" stroke="#FFF06A" stroke-width="10"/>
  <circle cx="64" cy="262" r="30" fill="#FFC93C"/><circle cx="192" cy="262" r="30" fill="#FFC93C"/>
  <path d="M52 128 Q44 176 74 198 L88 188 Q70 162 76 130 Z" fill="#4A2C1D"/>
  <path d="M204 128 Q212 176 182 198 L168 188 Q186 162 180 130 Z" fill="#4A2C1D"/>
  <circle cx="128" cy="138" r="76" fill="#E8B48A"/>
  <rect x="198" y="112" width="12" height="54" rx="4" fill="#FFD23F" transform="rotate(18 204 139)"/>
  <path d="M46 118 A82 76 0 0 1 210 118 Z" fill="#7FE0C4"/>
  <rect x="34" y="108" width="188" height="22" rx="11" fill="#5CC9AB"/>
  <path d="M128 56 L135 72 L152 73 L139 84 L143 101 L128 92 L113 101 L117 84 L104 73 L121 72 Z" fill="#FFFFFF" stroke-width="4"/>
  <g id="face" stroke="none">
    <ellipse cx="102" cy="150" rx="12" ry="15" fill="#3B2A1A"/><circle cx="106" cy="144" r="4" fill="#FFF"/>
    <ellipse cx="154" cy="150" rx="12" ry="15" fill="#3B2A1A"/><circle cx="158" cy="144" r="4" fill="#FFF"/>
    <g fill="#B5652B" opacity=".55"><circle cx="86" cy="172" r="3"/><circle cx="96" cy="178" r="3"/><circle cx="160" cy="178" r="3"/><circle cx="170" cy="172" r="3"/></g>
    <path d="M108 182 Q128 202 148 182" fill="none" stroke="#3B2A1A" stroke-width="6" stroke-linecap="round"/>
  </g>
</svg>
```

**Usta Dede:**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 320" stroke="#3B2A1A" stroke-width="6" stroke-linejoin="round">
  <rect x="70" y="200" width="116" height="110" rx="26" fill="#7A8B4A"/>
  <path d="M112 200 L128 236 L144 200 Z" fill="#F7F3EA"/>
  <rect x="70" y="282" width="116" height="14" fill="#5A3A22"/><rect x="150" y="276" width="30" height="26" rx="6" fill="#FFC21A"/>
  <ellipse cx="128" cy="134" rx="70" ry="78" fill="#D9A27A"/>
  <path d="M60 124 Q56 150 70 160 M196 124 Q200 150 186 160" fill="none" stroke="#F5F5F0" stroke-width="12"/>
  <path d="M52 92 Q128 30 204 92 L210 104 H46 Z" fill="#C65A3A"/><rect x="40" y="98" width="140" height="16" rx="8" fill="#A84A2E"/>
  <g id="face">
    <circle cx="102" cy="138" r="24" fill="#FFFFFF" fill-opacity=".4" stroke-width="9"/>
    <circle cx="154" cy="138" r="24" fill="#FFFFFF" fill-opacity=".4" stroke-width="9"/>
    <path d="M126 138 H130" stroke-width="9"/>
    <circle cx="102" cy="140" r="9" fill="#3B2A1A" stroke="none"/><circle cx="154" cy="140" r="9" fill="#3B2A1A" stroke="none"/>
    <path d="M86 178 Q106 164 128 174 Q150 164 170 178 Q170 194 150 192 Q138 190 128 184 Q118 190 106 192 Q86 194 86 178 Z" fill="#F5F5F0"/>
    <path d="M116 202 Q128 210 140 202" fill="none" stroke-linecap="round"/>
  </g>
</svg>
```

**Kepçe:**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220" stroke="#3B2A1A" stroke-width="6" stroke-linejoin="round">
  <rect x="70" y="110" width="200" height="70" rx="35" fill="#B5652B"/>
  <path d="M268 128 Q300 112 306 90" fill="none" stroke-width="10" stroke-linecap="round"/>
  <rect x="88" y="168" width="22" height="34" rx="8" fill="#B5652B"/><rect x="230" y="168" width="22" height="34" rx="8" fill="#B5652B"/>
  <rect x="78" y="128" width="40" height="18" rx="9" fill="#7FE0C4"/>
  <ellipse cx="78" cy="104" rx="56" ry="48" fill="#B5652B"/>
  <ellipse cx="38" cy="122" rx="30" ry="22" fill="#D99A5E"/><circle cx="14" cy="114" r="10" fill="#3B2A1A"/>
  <path d="M104 92 Q132 130 112 168 Q96 150 98 112 Z" fill="#8A4A1F"/>
  <path d="M30 74 A58 50 0 0 1 140 66 L146 78 H24 Z" fill="#FF9A1F" transform="rotate(-12 85 72)"/>
  <g id="face" stroke="none"><ellipse cx="66" cy="96" rx="9" ry="12" fill="#3B2A1A"/><circle cx="69" cy="91" r="3" fill="#FFF"/>
    <path d="M24 134 Q38 144 52 134" fill="none" stroke="#3B2A1A" stroke-width="5" stroke-linecap="round"/></g>
</svg>
```

**Bay Gribeton:**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 320" stroke="#3B2A1A" stroke-width="6" stroke-linejoin="round">
  <rect x="62" y="196" width="132" height="116" rx="10" fill="#8C939C"/>
  <path d="M110 196 L128 230 L146 196 Z" fill="#FFFFFF"/><path d="M122 214 H134 L138 270 L128 282 L118 270 Z" fill="#5E656E"/>
  <rect x="150" y="226" width="40" height="54" rx="4" fill="#6E7681"/>
  <rect x="62" y="70" width="132" height="132" rx="26" fill="#F0C8A8"/>
  <rect x="54" y="30" width="148" height="56" rx="8" fill="#B8BEC6"/>
  <path d="M60 46 H196 M60 62 H196" stroke="#9AA1AA" stroke-width="3"/>
  <g id="face">
    <path d="M84 116 H118 M138 116 H172" stroke="#4A4F57" stroke-width="10" stroke-linecap="round"/>
    <path d="M90 136 Q101 130 112 136 M144 136 Q155 130 166 136" fill="none" stroke-width="6" stroke-linecap="round"/>
    <circle cx="101" cy="140" r="6" fill="#3B2A1A" stroke="none"/><circle cx="155" cy="140" r="6" fill="#3B2A1A" stroke="none"/>
    <path d="M106 166 H150" stroke="#4A4F57" stroke-width="6" stroke-linecap="round"/>
    <path d="M112 182 Q128 186 146 178" fill="none" stroke-linecap="round"/>
  </g>
</svg>
```

**Kasaba halkı şablonu** (parametreli): Tuna büstündeki gövde ve kafa geometrisi; `hat` (bere / topuz / at kuyruğu /
yok), `outfit` rengi ve tek bir imza aksesuarı (fırın küreği, kitap yığını, dürbün, dev makas) 64–96 px'lik basit
şekillerle eklenir.

### 11.8 Özgünlük kontrolü

| Benzememesi gereken | Onun belirgin öğeleri | Bizim farkımız |
| ------------------- | --------------------- | -------------- |
| Bob the Builder (Bob) | sarı sert kask, ekose gömlek, mavi tulum, alet kemeri, yetişkin erkek, kahverengi saç | Tuna 8 yaşında, **nane yeşili** kask + yıldız, turuncu yelek + çizgili tişört, tulum ve alet kemeri yok, imza öğe dev eldivenler. Kask rengi sarı **olmayacak** (kural). |
| Bob the Builder (Wendy) | sarı kask, kısa sarı saç, mavi tulum | Tuna'nın saçı koyu kestane, tulum yok. |
| Bob the Builder (makineler: Scoop, Muck, Dizzy) | konuşan iş makineleri, sarı kepçe | Oyunda konuşan makine yok; kamyon karaktersiz bir araç. **Not:** "Kepçe" kelimesi "Scoop"un sözlük karşılığıdır; Türkçe dublajda Scoop'un adı doğrulanamadı (web aramasında bulunamadı). Bizim Kepçe bir köpek, kelime gündelik Türkçe isim; TR'de risk düşük. EN'de "Scoop" diye **çevrilmez**, adı "Kepche" (BUSINESS P-6 ile uyumlu). EN metinde "Little Builder" da kullanılmaz (STORY §0). |
| PAW Patrol (Rubble) | sarı kasklı İngiliz buldok inşaat köpeği, kepçeli araç, sırt çantası | Kepçe **sosis köpek**, **turuncu** ve büyük gelen kask, araç/sırt çantası/rozet yok; imza: kulak kaskın altından sarkar, uzun gövde. |
| Handy Manny | konuşan aletler, alet kutusu | Konuşan alet yok. |
| Color Block Jam (Rollic) | renkli blokları eşleşen renkli **kapılardan** kaydırarak çıkarma; renkli çerçeveli kapılar | Bizde geçit duvarın içinde bir **kestirmedir**, çıkış değil; kapı rengi yalnız W6 Boya Kapısı'nda ve damla diliyle görünür; diğer geçitler gri/çelik. Mağaza görsellerinde geçit değil **duvar üstü kaldır–aşır–indir** hareketi öne çıkar. |
| Block Blast (Hungry Studio) | lacivert tahta, neon parlak bloklar, 8×8 ızgara, blok yığını ikonu | Sıcak kum saha baskın; ozalit yalnız 2 sütun; mat bloklar, neon yok; simgede blok yığını yok (ASSET_LIST §11). |
| Royal Match (Kral Robert) | taç, kırmızı pelerin, kahverengi bıyık, şato sahnesi | Kral/taç/pelerin yok; şato bizde bir festival yapısı, karakteri değil. Ekran düzeni: bizde tahta saha + duvar + şantiye olarak ikiye bölünmüş, üstte yapı panoraması şeridi, sol altta Tuna/Kepçe köşesi. |
| Pinokyo (Geppetto) | beyaz saç, gözlük, beyaz bıyık, yelek | Usta Dede: kasket, mala biçimli küt bıyık, zeytin iş ceketi, şerit metre, imza katlanır metre. |
| Monopoly (Bay Monopoly) | silindir şapka, beyaz bıyık, baston | Gribeton'da şapka/baston/monokl yok; imza beton blok saç ve dikdörtgen gövde. |
| Mario | kırmızı şapka, siyah bıyık, tulum | Bıyıklı karakterlerimizde tulum yok; renk ve siluet farklı. |

Kural listesi (ASSET_LIST brifine de girer; **marka adı değil öğe tarifi** olarak): sarı inşaat kaskı yok · tulum yok ·
konuşan makine yok · taç/pelerin yok · karakterlerde harf/logo yok · köpek buldok değil · üst üste renkli küp yığını
yok · neon parıltı yok.

---

## 12. Görsel doğrulama (Faz 1)

Tarifler `scratchpad` içinde Chromium ile çizdirilip kontrol edildi (8 blok, 6 şekil, plan hücreleri, `.` ve `?`
hücreleri, Baloo 2 ile "MİNİK USTA · ÇOK ZOR · ğüşıİöç", 4 karakter yer tutucusu). Bulunan ve düzeltilen sorunlar:
ortası budaklı ağaç damarı göze benziyordu (budak sağa alındı); Usta Dede'nin dikdörtgen bıyığı sırıtan dişlere
benziyordu (kıvrımlı bıyık + ayrı ağız); plan sarısı mavi üstünde zeytin rengine dönüyordu (açık altlık).

## 13. Blockout önce kuralı

Her ekran önce gri kutu düzeniyle (`#D9D9D9` bloklar, `#9E9E9E` çerçeve, yalnız metin etiketleri) uygulanır ve ekran
görüntüsü design-lead onayından geçer; sonra bu belgedeki görsel tarifler uygulanır (tasarım ilkesi 7).
