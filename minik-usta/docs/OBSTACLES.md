# Engel kütüphanesi

Sahip: product-lead · Sürüm: Faz 1 taslağı (2026-10-04) · Kaynak: `docs/BRIEF.md` §7, `docs/GDD.md`

Her engel: kimlik, bölge, kural (kodlanabilir), veri parametreleri, ilk bölüm, öğretici metin (TR/EN, en çok 12 kelime).
Genel kurallar (yol, düşüş, doğrulama, hamle sonu hattı) GDD'dedir; burada yalnızca engele özel olan yazılır.
Hamle sonu adım numaraları GDD K-35'e göredir. `m` = tamamlanan hamle sayısı (bölüm başında 0).

Öğretici metinler `tut.<kimlik>` i18n anahtarlarıyla `src/i18n/tr.json` / `en.json`'a girer (ör. `tut.W1`); metin
sahibi product-lead, ses tonu ve balon tasarımı design-lead'indir.

---

## Duvar (W)

### W1 — Sabit Geçit
- **Bölge:** duvar · **İlk bölüm:** 3
- **Kural:** Duvarda her zaman açık boşluk. Satırları tamamen geçide sığan blok tamamen sahadaki bir konumdan sağa
  ötelenerek ray kipine girer (GDD K-12); şantiyede bırakılınca düşmez.
- **Veri:** `wall.gaps[] = { y, size, type: "static" }`; kısıt `y + size ≤ height − 1`.
- **Öğretici:** TR "Geçitten giren parça düşmez, bıraktığın yerde kalır." · EN "Pieces sent through the gap don't fall; they stay put."

### W2 — Yüksek Duvar
- **Bölge:** duvar · **İlk bölüm:** 6
- **Kural:** `height = 8`. Duvar sütunu y=0–7 arası kapalıdır (geçitler hariç); serbest kipte yalnızca Vinç Alanı
  (y=8–9) üzerinden geçilir. Sonuç: duvar sütunundaki dikey hücre dizisi 2'den uzun bloklar (I3_0, I4_0, L4_0 …)
  duvarı aşamaz (GDD K-05). Düşüş mesafesi uzar (cam için önemli).
- **Veri:** `wall.height: 8`.
- **Öğretici:** TR "Duvar çok yüksek! Parçayı en tepeye kaldırıp öyle aşır." · EN "The wall is tall! Lift the piece to the very top."

### W3 — Dar Geçit
- **Bölge:** duvar · **İlk bölüm:** 9
- **Kural:** `size = 1` olan her geçit. Yalnızca boyu 1 satır olan bloklar (B1, D2_90; ağırlar duvar sütununa hiç
  giremez) geçer. Geçit tipinden bağımsızdır: dar kepenk, dar kayar kapı vb. olabilir.
- **Veri:** `wall.gaps[].size: 1`.
- **Öğretici:** TR "Dar geçitten yalnızca tek sıra boyundaki parçalar geçer." · EN "Only one-row-tall pieces fit through the narrow gap."

### W4 — Kepenk
- **Bölge:** duvar · **İlk bölüm:** 13
- **Kural:** Geçit `m` için açıktır ⇔ `floor((m + phase) / period)` çift. Durum yalnızca hamle sonu adım 10'da değişir;
  sürükleme sırasında sabittir. Kapalıyken geçit satırları kapalı duvar hücresidir (ray kipine girilemez). Bloklar duvar
  sütununda duramadığı için "kapanırken içinde blok" oluşamaz (GDD E-06). Geçidin üstünde bir sonraki değişime kalan hamle
  sayısı gösterilir.
- **Veri:** `{ type: "shutter", y, size, period (1–4), phase (0 … 2·period−1) }`.
- **Örnek:** `period 2, phase 0` → m=0,1 açık; 2,3 kapalı; 4,5 açık. `phase 2` → kapalı başlar.
- **Öğretici:** TR "Kepenk iki hamlede bir açılıp kapanır. Sayaca bak!" · EN "The shutter opens and closes every two moves. Watch it!"

### W5 — Kayar Kapı
- **Bölge:** duvar · **İlk bölüm:** 16
- **Kural:** Geçidin alt satırı `y`, `range = [a, b]` içinde her hamle sonunda (adım 10) `dir` yönünde 1 satır kayar; sınıra
  gelince bir sonraki hamlede yön döner (ping-pong). Boy `size` sabittir. Kapı hiçbir bloğu itmez. Kısıt:
  `b + size ≤ height − 1`, `a ≥ 0`.
- **Veri:** `{ type: "slider", y (başlangıç), size, range: [a, b], dir (1 | −1, varsayılan 1) }`.
- **Örnek:** `range [1,3], y 1, dir 1` → hamle sonları: 2, 3, 2, 1, 2 …
- **Öğretici:** TR "Kayar kapı her hamleden sonra bir sıra kayar." · EN "The sliding door shifts one row after every move."

### W6 — Boya Kapısı
- **Bölge:** duvar · **İlk bölüm:** 22
- **Kural:** İptal edilmeyen bir hamlede sürükleme yolu bu geçidin ray kipinden geçtiyse blok kapının rengine boyanır
  (adım 1). Blok şantiyeye bırakılsa da sahaya geri çekilse de boya kalıcıdır; iptalde boya olmaz. Bayraklar korunur
  (cam camdır). Sürükleme sırasında blok kapıdayken yeni rengini gösterir (önizleme). Hamle kaydında `via` alanı
  (geçit indeksi) tutulur (öneri P-6).
- **Veri:** `{ type: "paint", y, size, color }`.
- **Örnek:** Kırmızı boya kapısı y=2. (4,2)'deki `B1` Y geçide girip sahada (5,6)'ya bırakılır → `B1` R, 1 hamle.
- **Öğretici:** TR "Boya kapısından geçen parça kapının rengini alır." · EN "Pieces passing the paint door take its color."

### W7 — Kilitli Geçit
- **Bölge:** duvar · **İlk bölüm:** 26
- **Kural:** `keyId` eşleşen anahtar toplanana kadar kapalıdır; toplandığı denetimde (GDD K-42) kalıcı olarak açılır ve
  sabit geçit gibi davranır. Açık Kepenk güçlendiricisi ilk 5 hamlede geçici olarak açar.
- **Veri:** geçit `{ type: "locked", y, size, keyId }`; anahtar `obstacles[] = { type: "key", x, y, id }` (saha hücresi,
  başta örtülü).
- **Öğretici:** TR "Anahtarın üstündeki parçayı kaldır; kilit açılsın." · EN "Move the piece covering the key to unlock the gate."

### W8 — Rüzgâr Fanı
- **Bölge:** duvar (şantiye üstüne eser) · **İlk bölüm:** 32
- **Kural:** Serbest kipte şantiyeye bırakılan, genişliği 1 olan blok (balon dahil) düşmeden/yükselmeden önce `dir`
  yönünde 1 sütun kayar; koşullar: (a) bırakma anında d ≥ 1 (blok siluete oturmuş değil), (b) kaymış konum x=6–7
  içinde, (c) kaymış konumun hücreleri boş ve açık gökyüzü koşulunu sağlıyor. Koşul tutmazsa kayma yok. (a) maddesi öneri P-2a'dır. Genişliği 2
  olan bloklar, ray kipi, Vinç güçlendiricisi etkilenmez. Gölge kaymış inişi gösterir (GDD K-18).
- **Veri:** `wall.fan: { dir: "left" | "right" }`.
- **Örnek:** `dir right`; `B1` (6,7)'de bırakılır, top(6)=2, top(7)=3 → (7,7) boş → kayar → (7,3)'e iner.
- **Öğretici:** TR "Rüzgâr ince parçaları bir sütun iter. Gölgeye bak!" · EN "Wind pushes thin pieces one column. Check the shadow!"

---

## Saha (Y)

### Y1 — Ahşap Kasa
- **Bölge:** saha · **İlk bölüm:** 11
- **Kural:** 1 hücre kaplar; tutulamaz, düşmez, destek olur. Can `hp` 1–3. Bir hamlede, taşınan bloğun başlangıç
  hücrelerine ya da saha yerçekimiyle düşen bir bloğun düşüş öncesi hücrelerine 4-komşu ise 1 can kaybeder (hamle başına
  en çok 1). Can 0 → kasa yok olur, `clear/crate` 1 sayılır, altındaki saklı nesne toplanır. Çekiç tek vuruşta yok eder.
  Teslimat düşüşü kasaya etki etmez.
- **Veri:** `obstacles[] = { type: "crate", x, y, hp }`.
- **Örnek:** Kasa (2,3) hp 2. (2,4)'teki blok taşınır → hp 1. Sonra (1,3)'teki blok taşınır → kasa yok olur.
- **Öğretici:** TR "Kasanın yanındaki parçayı oynat, kasa kırılsın." · EN "Move a piece next to a crate to break it."

### Y2 — Çimento Torbası
- **Bölge:** saha · **İlk bölüm:** 18
- **Kural:** 1 hücre kaplar; tutulamaz. Saha yerçekimi ayarından bağımsız olarak her hamle sonunda (adım 6) altı boşsa
  düşer. Kasa ile aynı komşuluk kuralıyla tek seferde yırtılır ve yok olur (can 1). Düşen torba komşu etkisi üretmez.
  Hiçbir hedefe sayılmaz (tasarımda "engel" ve destek olarak kullanılır).
- **Veri:** `obstacles[] = { type: "cement_bag", x, y }`.
- **Örnek:** Torba (4,5), altı (4,4) boşalır → adım 6'da (4,4)'e, oradan ilk desteğe düşer.
- **Öğretici:** TR "Torbanın yanındaki parçayı oynat; torba yırtılır." · EN "Move a piece beside the bag to tear it open."

### Y3 — Zincir
- **Bölge:** saha · **İlk bölüm:** 24
- **Kural:** `chained` bayraklı blok oyuncu tarafından tutulamaz, Vinçle seçilemez, ama saha yerçekimiyle düşer. Kasa ile
  aynı komşuluk kuralıyla bir kez tetiklenince zincir kalkar (`clear/chain` 1 sayılır). Çekiç zinciri kırar, bloğu değil.
- **Veri:** `PiecePlacement.flags: ["chained"]`.
- **Örnek:** Zincirli `O4` (0,0); (2,0)'daki blok taşınır → (2,0) zincirlinin komşusu (1,0)'a bitişik → zincir kalkar.
- **Öğretici:** TR "Zincirli parçanın komşusunu oynat, zincir çözülsün." · EN "Move a neighbor to free the chained piece."

### Y4 — Islak Beton
- **Bölge:** saha · **İlk bölüm:** 28
- **Kural:** `wet` bayraklı blokta sayaç `wetMoves` (1–5) görünür. Sayaç > 0 iken tutulamaz, Vinçle seçilemez. Her hamle
  sonunda (adım 10) 1 azalır; o hamlede kamyonla gelen ıslak blok azalmaz. 0 olunca bayrak kalkar. Saha yerçekimiyle
  düşer. Çekiç bloğu kırar.
- **Veri:** `flags: ["wet"], wetMoves: N`.
- **Örnek:** wetMoves 2; hamle 1 sonu 1, hamle 2 sonu 0 → 3. hamlede tutulabilir.
- **Öğretici:** TR "Islak beton kurusun; sayaç sıfır olunca kullanabilirsin." · EN "Wet concrete must dry; use it when the counter hits zero."

### Y5 — Ağır Malzeme
- **Bölge:** saha · **İlk bölüm:** 8
- **Kural:** Genişliği ≥ 3 olan her yönelim ve I5, Q9 her zaman. Duvar sütununa giremez (ne serbest ne ray kipinde);
  yalnızca sahada ve saha üstü Vinç Alanı'nda (x ≤ 5) sürüklenir. Çekiçle kırılır. Vinç güçlendiricisi I5/Q9 dışındakileri
  genişliği ≤ 2 yönelime döndürüp şantiyeye koyabilir (GDD K-37).
- **Veri:** şekil kimliği (`I5_0`, `Q9_0`, `L4_90` …).
- **Örnek:** `I5_0` (0,7)–(4,7) yukarı kaldırılıp (1,8)'de bırakılamaz (K-05 iptal); (0,7)'den (1,7)'ye kaydırılır (5,7 boşsa) → 1 hamle.
- **Öğretici:** TR "Ağır malzeme duvarı geçemez. Kenara çek ya da kır." · EN "Heavy material can't cross the wall. Move it or smash it."

### Y6 — Saha Yerçekimi
- **Bölge:** saha · **İlk bölüm:** 14
- **Kural:** `gravity.yard = true` (GDD K-20). Bütün saha blokları (zincirli, ıslak, ağır dahil) adım 6'da düşer, balonlar
  yükselir; kasalar sabittir.
- **Veri:** `gravity.yard: true`.
- **Öğretici:** TR "Bu sahada bloklar düşer. Alttakini alınca üsttekiler iner." · EN "Here blocks fall. Take one and the ones above drop."

### Y7 — Altın Vida
- **Bölge:** saha · **İlk bölüm:** 19
- **Kural:** Bir saha hücresinin zemininde saklıdır; bölüm başında örtülüdür. Hücre boş kaldığı ilk denetimde toplanır
  (GDD K-42), `collect/screw` 1 sayılır. Bir hücrede en çok 1 saklı nesne olur.
- **Veri:** `obstacles[] = { type: "screw", x, y }`.
- **Öğretici:** TR "Altın vidalar parçaların altında. Üstünü aç, topla!" · EN "Golden screws hide under pieces. Uncover them to collect!"

### Y8 — Harçlı Blok
- **Bölge:** saha (etkisi şantiyede) · **İlk bölüm:** 35
- **Kural:** `mortar` bayraklı blok şantiyede hatalı yerleşirse ve bütün hücreleri plan alanında (renkli, `?` ya da `.`
  hücre) ise geri sekmez, **yapışır** (kilitli değildir). Bir hücresi plan dışındaysa normal geri seker (öneri P-2b). Yapışmış blok
  sürüklenebilir; iptal olmayan her hamlesi 2 hamle yer. Çekiçle kırılır, Boya Fırçası ile boyanırsa ve yeni renkle
  doğruysa kilitlenir, Vinçle taşınır. Yapışmış blok dilimin tamamlanmasını engeller (GDD K-15) ve üstüne doğru
  yerleşim yapılamaz (K-34). Doğru yerleşirse normal kilitlenir.
- **Veri:** `flags: ["mortar"]`.
- **Örnek:** `B1` R harçlı (6,2) W hücresine düşer → yapışır. Oyuncu sahaya geri sürükler → kalan 10 → 8.
- **Öğretici:** TR "Harçlı parça yanlış yere yapışır. Dikkatli bırak!" · EN "Mortar pieces stick where they land. Drop with care!"

---

## Şantiye ve yerçekimi (S, G)

### S1 — Kayan Şantiye
- **Bölge:** şantiye · **İlk bölüm:** 5
- **Kural:** `build.mode = "segments"`, 2–5 dilim (GDD K-22, K-25). Dilim bitince kayma ve kamyon teslimatı.
- **Veri:** `build.segments[]`, `yard.batches[]` (`forSegment` = dilim indeksi).
- **Öğretici:** TR "Bir oda bitince şantiye kayar, kamyon malzeme getirir." · EN "Finish one part; the site slides and the truck delivers."

### S2 — Plan Boşluğu
- **Bölge:** şantiye · **İlk bölüm:** 4
- **Kural:** `.` hücresi boş kalmalıdır; bloğun herhangi bir hücresi `.` üstüne gelirse hatalı yerleşim. K-34'te `.`
  dolu sayılır. `.` üstündeki hücre şu yollarla dolar: ray (W1), iki sütuna köprü kuran 2 geniş blok (duvar üstü),
  balon (S8), Altın Mala, Vinç.
- **Veri:** `rows` içinde `.`.
- **Örnek:** Plan sütun 7: y0 W, y1 `.`, y2 W. `B1` W sütun 7'ye bırakılır → (7,1)'e düşer → hatalı.
- **Öğretici:** TR "Pencere boş kalmalı. Üstünü geçitten ya da köprüyle doldur." · EN "Keep the window empty. Fill above it via the gap."

### S3 — Cam Blok
- **Bölge:** şantiye (bayrak sahadaki blokta) · **İlk bölüm:** 21
- **Kural:** `glass` bayraklı blok serbest kipte şantiyeye düşerken d > eşik (low 4, normal 3, high 2) ise kırılır:
  doğrulama yapılmaz, blok GDD K-17 hedef sırasıyla sahaya döner, hamle maliyeti 2, Usta Serisi 0. Ray, Vinç, balon
  yükselişi, geri sekme, teslimat ve saha yerçekimi düşüşlerinde kırılmaz.
- **Veri:** `flags: ["glass"]`.
- **Örnek:** normal; cam `D2_90` (6,8)'de bırakılır, iniş (6,3) → d=5 > 3 → kırılır. (6,6)'ya indirilip bırakılırsa d=3 → sağlam.
- **Öğretici:** TR "Cam kırılır! Parçayı aşağı indir, sonra bırak." · EN "Glass breaks! Lower the piece before you let go."

### S4 — Moloz
- **Bölge:** şantiye · **İlk bölüm:** 17
- **Kural:** Bölüm başında dilimin şantiye alanında duran bloklar; hiçbir yerde doğru olamaz (GDD K-16). Tutulabilir
  (serbest kipte; satırları bir geçitteyse ray kipinde de). Sahaya bırakılınca (1 hamle) `clear/debris` 1 sayılır ve
  sahada sıradan, kullanılamaz bir blok olur. Şantiyede başka yere bırakılırsa hatalı → başlangıcına döner. Altı boşalsa da
  düşmez. Çekiç kırar (sayılır). Dilim, alanında moloz varken tamamlanmaz.
- **Veri:** `build.debris[] = { shape, color, x, y, segment }` (`segment` öneri P-5).
- **Öğretici:** TR "Eski moloz yolu tıkıyor. Önce onu sahaya taşı." · EN "Old rubble is in the way. Move it out first."

### S5 — Döner Platform
- **Bölge:** şantiye · **İlk bölüm:** 31
- **Kural:** `build.mode = "carousel"` (GDD K-23).
- **Veri:** `build.carouselEvery` (2–6).
- **Öğretici:** TR "Platform dört hamlede bir döner. Öndeki yüze inşa et." · EN "The platform turns every four moves. Build the front face."

### S6 — Asansör İskele
- **Bölge:** şantiye · **İlk bölüm:** 37
- **Kural:** `build.elevator` (GDD K-24); her iki modla birleşebilir.
- **Veri:** `build.elevator: { range: [a, b], start, dir }`.
- **Öğretici:** TR "İskele her hamlede bir sıra iner çıkar. Geçide dikkat!" · EN "The scaffold moves one row each move. Mind the gap!"

### S7 — Gizli Plan
- **Bölge:** şantiye · **İlk bölüm:** 27 (`repeat`), 29 (`mirrorOf`)
- **Kural:** GDD K-32.
- **Veri:** `rows` içinde `?`, `segments[].hidden: { kind: "repeat", period } | { kind: "mirrorOf", segment }`.
- **Öğretici:** TR (27) "Soru işaretleri deseni tekrarlar. Aşağıdaki sıralara bak!" · EN "Question marks repeat the pattern. Look at the rows below!"
  · TR (29) "Bu kule diğerinin aynası. Renkleri yer değiştir!" · EN "This tower mirrors the other. Swap the colors!"

### S8 — Balonlu Blok
- **Bölge:** şantiye ve saha · **İlk bölüm:** 38
- **Kural:** `balloon` bayraklı blok bırakılınca yükselir. Sahada: üstündeki ilk dolu hücreye ya da y=7'ye kadar.
  Şantiyede serbest kipte: bırakma yüksekliğinden bağımsız olarak sütunlarının **tavanına** asılır; tavan = aktif dilimin
  plan tepesi (bloğun en üst hücresi satır `h + e − 1`; öneri P-3); bloğun sütunlarında siluet tavana ulaşmışsa blok siluetin üstünde
  kalır (plan dışı → hatalı). Rayda bırakılan balon hareket etmez. Saha yerçekimi açıkken adım 6'da yükselir. Rüzgâr
  (genişlik 1) önce kaydırır; G-L yönlendirmesi yükselişte de kullanılabilir. Doğrulama K-16 ve K-34 iledir.
- **Veri:** `flags: ["balloon"]`.
- **Örnek:** Plan h=6, sütun 7: y0–y3 dolu, y4 `.`, y5 W boş. `B1` W balon sütun 7'ye bırakılır → (7,5)'e asılır → doğru.
  Normal `B1` W aynı yerde (7,4) `.` hücresine düşerdi → hatalı.
- **Öğretici:** TR "Balonlu parça yukarı süzülür ve tavana asılır." · EN "Balloon pieces float up and hang from the ceiling."

### G-H — Ağır yerçekimi
- **Bölge:** şantiye · **İlk bölüm:** 15
- **Kural:** `gravity.build = "high"`: hızlı düşüş, 700 ms tutma (sonra zorla bırakma), cam eşiği 2 (GDD K-19).
- **Veri:** `gravity.build: "high"`.
- **Öğretici:** TR "Ağır yerçekimi! Şantiye üstünde parça çabucak kayıp düşer." · EN "Heavy gravity! Over the site, pieces slip and drop fast."

### G-L — Hafif yerçekimi
- **Bölge:** şantiye · **İlk bölüm:** 23
- **Kural:** `gravity.build = "low"`: yavaş düşüş; düşen/yükselen bloğa dokunup sola/sağa ≥ 0,5 hücre sürüklemek onu komşu
  şantiye sütununa 1 kez kaydırır (o satırda hücreler boşsa); cam eşiği 4 (GDD K-19). Yönlendirilen yerleşim YAO'da
  "duvar üstü" sayılır.
- **Veri:** `gravity.build: "low"`.
- **Öğretici:** TR "Hafif yerçekimi: düşen parçaya dokun, bir yana kaydır." · EN "Low gravity: touch a falling piece to nudge it sideways."

---

## Aynı bloktaki bayrak birleşimleri

| | glass | balloon | mortar | chained | wet | debris | ağır şekil |
|---|---|---|---|---|---|---|---|
| **glass** | — | ✗ balon düşmez, cam anlamsız | ✓ önce kırılma denetimi; kırılırsa yapışmaz | ✓ | ✓ | ✗ | ✗ şantiyeye giremez |
| **balloon** | | — | ✓ hatalı balon tavanda yapışır | ✓ | ✓ | ✗ | ✗ |
| **mortar** | | | — | ✓ | ✓ | ✗ | ✗ |
| **chained** | | | | — | ✓ ikisi de kalkmalı | ✗ | ✓ |
| **wet** | | | | | — | ✗ | ✓ |
| **debris** | | | | | | — | ✗ moloz ≤ 2 geniş |

✓ izinli · ✗ doğrulayıcı reddeder (`flag_combo_forbidden`).

## Etkileşim matrisi (aynı bölümde birlikte bulunma)

Okuma: satır × sütun (üst üçgen). `·` = birlikte bulunabilir, kuralları birbirine dokunmaz (her biri kendi kuralıyla, K-35 sırasıyla çalışır). `Nxx` = önemsiz olmayan etkileşim, notu aşağıda. `—n` = aynı bölümde imkânsız, gerekçesi aşağıda. Aynı bloktaki bayrak birleşimleri yukarıdaki tablodadır. `■` = kendisi.

| | W1 | W2 | W3 | W4 | W5 | W6 | W7 | W8 | Y1 | Y2 | Y3 | Y4 | Y5 | Y6 | Y7 | Y8 | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | G-H | G-L |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **W1** | ■ | N3 | N2 | N1 | N1 | N1 | N1 | · | · | · | · | · | N6 | N9 | · | · | · | N10 | N11 | N14 | · | N16 | · | N19 | N21 | · |
| **W2** |   | ■ | N3 | N3 | N3 | N3 | N3 | · | · | · | · | · | · | · | · | · | · | · | N12 | · | · | · | · | · | N37 | · |
| **W3** |   |   | ■ | N2 | N2 | N2 | N2 | · | · | · | · | · | N6 | N9 | · | · | · | N10 | N11 | N14 | · | N16 | · | N19 | N21 | · |
| **W4** |   |   |   | ■ | N1,N8 | N1 | N1 | · | · | · | · | N8 | N6 | N9 | · | · | · | N10 | N11 | N14 | N8,N15 | N8,N16 | · | N19 | N21 | · |
| **W5** |   |   |   |   | ■ | N1 | N1 | · | · | · | · | N8 | N6 | N9 | · | · | · | N10 | N11 | N14 | N8 | N8,N17 | · | N19 | N21 | · |
| **W6** |   |   |   |   |   | ■ | N1 | · | · | · | N7 | N7 | N6 | N9 | · | N7 | · | N10 | N7,N11 | N14 | · | N16 | N41 | N7,N19 | N21 | · |
| **W7** |   |   |   |   |   |   | ■ | · | N4 | N4 | · | · | N6 | N40,N9 | N5 | · | · | N10 | N11 | N14 | · | N16 | · | N19 | N21 | · |
| **W8** |   |   |   |   |   |   |   | ■ | · | · | · | · | · | · | · | · | · | N18 | N13 | · | · | · | · | N20 | · | N22 |
| **Y1** |   |   |   |   |   |   |   |   | ■ | N23 | N24 | · | · | N25 | N4 | · | · | · | · | · | · | · | · | · | · | · |
| **Y2** |   |   |   |   |   |   |   |   |   | ■ | N24 | · | · | N26 | N4 | · | · | · | · | · | · | · | · | N34 | · | · |
| **Y3** |   |   |   |   |   |   |   |   |   |   | ■ | · | · | N27 | · | · | · | · | · | · | · | · | · | · | · | · |
| **Y4** |   |   |   |   |   |   |   |   |   |   |   | ■ | · | N27 | · | · | N28 | · | · | · | N28 | · | · | · | · | · |
| **Y5** |   |   |   |   |   |   |   |   |   |   |   |   | ■ | · | · | · | · | · | · | · | · | · | · | · | · | · |
| **Y6** |   |   |   |   |   |   |   |   |   |   |   |   |   | ■ | N4 | · | N43 | · | · | · | N42 | · | · | N33 | · | · |
| **Y7** |   |   |   |   |   |   |   |   |   |   |   |   |   |   | ■ | · | · | · | · | · | · | · | · | · | · | · |
| **Y8** |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   | ■ | N31 | N29 | N30 | · | N31 | N31 | N32 | · | · | · |
| **S1** |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   | ■ | · | · | N38 | —1 | N35 | · | · | · | · |
| **S2** |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   | ■ | · | · | · | · | · | N36 | · | · |
| **S3** |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   | ■ | · | · | · | · | · | N37 | N37 |
| **S4** |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   | ■ | N38 | · | · | · | · | · |
| **S5** |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   | ■ | N35 | · | · | · | · |
| **S6** |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   | ■ | · | · | · | · |
| **S7** |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   | ■ | · | · | · |
| **S8** |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   | ■ | · | N39 |
| **G-H** |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   | ■ | —2 |
| **G-L** |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   | ■ |

### Notlar

- **N1** — Geçit tipleri aynı geçitte birleşmez (bir geçidin tek `type`'ı vardır); farklı geçitlerde aynı bölümde bulunabilir.
- **N2** — W3 bir boyuttur (`size=1`), tip değildir: dar kepenk, dar kayar kapı, dar boya kapısı, dar kilitli geçit geçerlidir.
- **N3** — Yüksek duvarda geçit tek kestirmedir: boyu > 2 dikey bloklar (I3_0, L4_0 …) şantiyeye yalnızca geçitten girer (K-05).
- **N4** — Saklı nesne (anahtar/vida) kasa ya da torba altında olabilir: kasa yok olunca / torba düşünce ya da yırtılınca hücre boşalır, o denetimde toplanır. Saha yerçekimi zincirlemesiyle açılan hücre adım 6 denetiminde toplanır (K-42).
- **N5** — Bir hücrede en çok 1 saklı nesne (anahtar ya da vida).
- **N6** — Ağır blok duvar sütununa giremez: hiçbir geçitten geçemez, boyanamaz, kepenk/kilit onu etkilemez.
- **N7** — Boya kapısı yalnızca rengi değiştirir; bayraklar (cam, harç, balon) korunur. Zincirli/ıslak blok tutulamadığı için serbest kalana kadar boyanamaz.
- **N8** — İki zamanlayıcı aynı hamle sonunda ilerler; sıra adım 10'daki gibidir (kepenk → kayar kapı → döner platform → asansör → ıslak beton). Birbirlerinin girdisini kullanmazlar; sıra yalnızca olay/animasyon sırasıdır.
- **N9** — Saha yerçekimi geçide giden saha tünelini kapatabilir ya da açabilir; gölge yoktur ama yerçekimi deterministiktir, hamle sonu animasyonu gösterir.
- **N10** — `.` üstündeki hücreyi doldurmanın ana yolu raydır; geçit satırı `.`'nin hemen üstüne denk getirilir (Bölüm 4, 9).
- **N11** — Raydan giren cam blok düşmediği için asla kırılmaz; cam bölümlerinde geçit güvenli ama pahalı yoldur (kazı gerekir).
- **N12** — Yüksek duvarda blok Vinç Alanı'ndan bırakılırsa d büyür (8–9 satır); cam için mutlaka siluete yakın indirilmelidir.
- **N13** — Rüzgâr kayması düşüş mesafesini değiştirmez (aynı satırdan düşer); kaymış sütunun silueti d'yi belirler.
- **N14** — Geçit satırlarındaki moloz rayı tıkar; aynı moloz ray kipinde geçitten sahaya çekilebilir (1 hamle).
- **N15** — Döner platform ile kepenk aynı periyotta tasarlanırsa senkron bulmaca olur (Bölüm 34): kepenk açıkken hangi yüzün önde olduğu `m`'den hesaplanabilir.
- **N16** — Asansörde geçidin açıldığı plan satırı `g.y − e`'dir; ray yerleşimi hangi plan satırına gideceğini ofsete göre değiştirir.
- **N17** — Kayar kapı ve asansör aynı hamlede oynar: geçidin plan satırı her hamle −2, 0 ya da +2 değişebilir.
- **N18** — Rüzgâr 1 genişlikteki bloğu `.` sütununa itebilir; gölge bunu gösterir (E-16).
- **N19** — Raydan giren balon yükselmez (iskele tutar); balonun anlamı serbest kipte tavana asılmaktır.
- **N20** — Balon rüzgârla önce kayar, sonra tavana yükselir.
- **N21** — G-H 700 ms sayacı yalnızca serbest kipte şantiye sütunlarına değince işler; raydaki blok için zaman baskısı yoktur.
- **N22** — G-L yönlendirmesi rüzgâr kaymasını geri alabilir (düşüş başına 1 yönlendirme).
- **N23** — Torba kasanın üstünde durur; kasa yok olunca torba adım 6'da düşer.
- **N24** — Aynı komşu hareketi birden fazla engeli tetikler (kasa katı, torba, zincir); her biri hamle başına en çok 1 kez.
- **N25** — Kasa düşmez ve destektir; saha yerçekiminde kasa üstündeki bloklar yerinde kalır.
- **N26** — Düşen torba komşu etkisi üretmez (yalnızca düşen bloklar üretir).
- **N27** — Zincirli ve ıslak bloklar saha yerçekimiyle düşer; düşmeleri zinciri çözmez, sayacı değiştirmez.
- **N28** — Kamyonla gelen ıslak blok geldiği hamlede sayaç kaybetmez (E-31).
- **N29** — Harçlı blok `.` (pencere) hücresine yapışabilir; dilim tamamlanamaz, 2 hamlelik çekme ya da Çekiç gerekir (E-24).
- **N30** — Harçlı cam: önce kırılma denetlenir; kırılırsa sahaya döner, yapışmaz.
- **N31** — Yapışmış harç kendi dilimiyle birlikte döner/kayar; asansörde çerçeveyle oynar. Yalnızca plan alanında yapıştığı için tahtadan taşmaz (E-08, E-32).
- **N32** — Yanlış renkle `?` hücresine yapışan harç hücreyi açmaz; Boya Fırçası doğru renge boyarsa kilitlenir ve hücre açılır.
- **N33** — Saha yerçekimi açıkken balonlar adım 6'da yükselir; düşen bloklarla aynı sütunda karşılaşırlarsa birbirine dayanıp durur.
- **N34** — Torba balonun üstüne düşerse ikisi de durur (torba balona, balon torbaya dayanır).
- **N35** — Asansör ofseti dilim geçişinde ve döner platform dönüşünde korunur; yeni gelen/öne geçen dilim mevcut `e` ile görünür.
- **N36** — Balon `.` hücrelerinin üstündeki tavan hücrelerini doldurmanın duvar üstü yoludur (asma köprü, bayrak).
- **N37** — Cam eşiği: G-H 2, normal 3, G-L 4. G-H'de 700 ms içinde indirmek gerekir.
- **N38** — Moloz dilime aittir (`segment`); kayan şantiyede o dilim gelince, döner platformda kendi yüzündedir.
- **N39** — G-L yönlendirmesi balonun yükselişinde de kullanılabilir.
- **N40** — Kilitli geçidin anahtarı saha yerçekimiyle açığa çıkabilir (N4).
- **N41** — Gizli `?` hücresine düşecek gölge her zorlukta nötrdür; Boya Kapısı rengi ipucu olarak tasarlanabilir.
- **N42** — Döner platform ve kayan şantiyede teslim partisi dilim tamamlanma sayısına bağlıdır (K-23, K-25).
- **N43** — Saha yerçekimi açıkken kamyon blokları da oturmuş sahaya düşer; teslimat sahayı yeniden oynatmaz.

### İmkânsız çiftler

- **—1** — Aynı bölümde tek `build.mode` olur (segments ya da carousel).
- **—2** — Aynı bölümde tek `gravity.build` değeri olur.

Kullanılmayan not yok; her `Nxx` en az bir hücrede geçer. Matris, `docs/OBSTACLES.md` üretilirken bir betikle kontrol edildi: 26 engel, 325 çift, her çift tam bir kod taşır.
