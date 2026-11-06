# Engel kütüphanesi

Sahip: product-lead · Sürüm: Faz 1 revizyonu (2026-10-04; R-08, R-10, R-21; tutarlılık denetimi tur 1, 2026-10-05) · Kaynak: `docs/BRIEF.md` §7, `docs/GDD.md`

Her engel: kimlik, bölge, kural (kodlanabilir), veri parametreleri, ilk bölüm, bilgi kartı metni (TR/EN, en çok 12 kelime).
Genel kurallar (yol, düşüş, doğrulama, hamle sonu hattı) GDD'dedir; burada yalnızca engele özel olan yazılır.
Hamle sonu adım numaraları GDD K-35'e göredir. `m` = tamamlanan hamle sayısı (bölüm başında 0).

**Metin sahipliği (R-08):** Bu belgedeki TR/EN cümleler **engel bilgi kartı** metnidir (kural özeti; oyuncu engele
dokununca ya da ilk karşılaşmada kartta görür). Anahtar `obs.{id}.desc`; `id` küçük harf, tire atılır (`obs.w1.desc`,
`obs.gh.desc`, `obs.s7r.desc`). Yazarı product-lead, ton denetimi design-lead. Bölüm içinde ekranda görünen öğretici /
Usta Dede satırları STORY §6'dadır (`tut.l{n}.{konu}`, design-lead). Kurallar: terim "blok" (parça değil); renk adı
yok (renk körlüğü); bölüme göre değişen sayılar `{n}` yer tutucusuyla (ör. kepenk periyodu, platform dönüşü).
**Duvar:** saha ile şantiye arasındaki sıfır genişlikli sınırdır (GDD §0, K-04; R-03).

---

## Duvar (W)

### W1 — Sabit Geçit
- **Bölge:** duvar · **İlk bölüm:** 3
- **Kural:** Duvarda her zaman açık boşluk. Satırları tamamen geçide sığan blok tamamen sahadaki bir konumdan sağa
  ötelenerek ray kipine girer (GDD K-12); şantiyede bırakılınca düşmez.
- **Veri:** `wall.gaps[] = { y, size, type: "static" }`; kısıt `y + size ≤ height − 1`.
- **Bilgi kartı** (`obs.w1.desc`): TR "Geçitten giren blok düşmez, bıraktığın yerde kalır." · EN "Blocks sent through a gap don't fall; they stay put."

### W2 — Yüksek Duvar
- **Bölge:** duvar · **İlk bölüm:** 6
- **Kural:** `height = 8`. Sınır y=0–7 arası kapalıdır (geçitler hariç); serbest kipte yalnızca Vinç Alanı
  (y=8–9) üzerinden geçilir. Sonuç: sınırı geçen sütunundaki dikey hücre dizisi 2'den uzun bloklar (I3_0, I4_0, L4_0 …)
  duvarı aşamaz (GDD K-05). Düşüş mesafesi uzar (cam için önemli).
- **Veri:** `wall.height: 8`.
- **Bilgi kartı** (`obs.w2.desc`): TR "Duvar çok yüksek! Bloğu en tepeye kaldırıp öyle aşır." · EN "The wall is tall! Lift the block to the very top."

### W3 — Dar Geçit
- **Bölge:** duvar · **İlk bölüm:** 9
- **Kural:** `size = 1` olan her geçit. Yalnızca boyu 1 satır olan bloklar (B1, D2_90; ağırlar sınırı hiç
  geçemez) geçer. Geçit tipinden bağımsızdır: dar kepenk, dar kayar kapı vb. olabilir.
- **Veri:** `wall.gaps[].size: 1`.
- **Bilgi kartı** (`obs.w3.desc`): TR "Dar geçitten yalnızca tek sıra boyundaki bloklar geçer." · EN "Only one-row-tall blocks fit through a narrow gap."

### W4 — Kepenk
- **Bölge:** duvar · **İlk bölüm:** 13
- **Kural:** Geçit `m` için açıktır ⇔ `floor((m + phase) / period)` çift. Durum yalnızca hamle sonu adım 10'da değişir;
  sürükleme sırasında sabittir. Kapalıyken geçit satırları sınırın kapalı satırlarıdır (ray kipine girilemez). Bloklar
  sınırı keserken bırakılamadığı için "kapanırken içinde blok" oluşamaz (GDD E-06). **Sayaç:** geçidin üstünde bir sonraki
  değişime kalan hamle sayısı `k = period − ((m + phase) mod period)` (1…period) ve bir sonraki durum (açık/kapalı) gösterilir;
  `k = 1` iken sayaç vurgulanır (sunum design-lead). Aynı sayaç dili S5 (dönmeye kalan) ve Y4 (`wetMoves`) için kullanılır.
- **Veri:** `{ type: "shutter", y, size, period (1–4), phase (0 … 2·period−1) }`.
- **Örnek:** `period 2, phase 0` → m=0,1 açık; 2,3 kapalı; 4,5 açık. `phase 2` → kapalı başlar. Sayaç: m=0 → 2 (sonra
  kapalı), m=1 → 1 (sonra kapalı, vurgulu), m=2 → 2 (sonra açık).
- **Bilgi kartı** (`obs.w4.desc`): TR "Kepenk {n} hamlede bir açılıp kapanır. Sayaca bak!" · EN "The shutter opens and closes every {n} moves. Watch the counter!"

### W5 — Kayar Kapı
- **Bölge:** duvar · **İlk bölüm:** 16
- **Kural:** Geçidin alt satırı `y`, `range = [a, b]` içinde her hamle sonunda (adım 10) şu sırayla kayar: (1) `y + dir`
  aralığın dışındaysa önce yön döner (`dir = −dir`); (2) `y += dir` (1 satır; ping-pong, GDD K-24 ile aynı algoritma).
  Başlangıçta sınırdaysa ve `dir` dışarı bakıyorsa (`y = b, dir = 1` ya da `y = a, dir = −1`; geçerli veri) ilk hamlede
  önce yön döner; `y` hiçbir zaman aralığın dışına çıkmaz. Boy `size` sabittir. Kapı hiçbir bloğu itmez. Kısıt
  (doğrulayıcı, GDD K-45/3): `0 ≤ a < b` (asansör K-24 ile aynı; `a = b` iken ping-pong aralık dışına çıkardı), `a ≤ y ≤ b`,
  `b + size ≤ height − 1`; kayar kapının hareket boyunca kapsadığı bütün satırlar (`a … b + size − 1`) diğer geçitlerin
  satırlarıyla örtüşmez (yalnız başlangıç `y`'si değil). Hata kodları `slider_range`, `gap_overlap`.
  **Örnek (geçersiz):** `range [3,3], y 3, dir 1` → `a < b` değil → `slider_range` (kabul edilseydi ilk hamlede `dir = −1`,
  `y = 2`, aralık dışı). `height 8`, kayar kapı `range [1,3]`, `size 2` (satır 1–4) + sabit geçit `y 4, size 1` → satır 4 ortak →
  `gap_overlap`.
- **Veri:** `{ type: "slider", y (başlangıç), size, range: [a, b], dir (1 | −1, varsayılan 1) }`.
- **Örnek:** `range [1,3], y 1, dir 1` → hamle sonları: 2, 3, 2, 1, 2 … · `range [1,3], y 3, dir 1` → 2, 1, 2, 3, 2 …
- **Bilgi kartı** (`obs.w5.desc`): TR "Kayar kapı her hamleden sonra bir sıra kayar." · EN "The sliding gate shifts one row after every move."

### W6 — Boya Kapısı
- **Bölge:** duvar · **İlk bölüm:** 22
- **Kural:** İptal edilmeyen bir hamlede blok sürükleme sırasında bu geçidin ray kipine **girdiyse** (en az bir hücresi
  sınırı bu geçidin satırlarında geçtiyse; yarım girip geri çıkmak dahil) kapının rengine boyanır (adım 1). Birden çok boya
  kapısına girildiyse **son girilenin** rengi geçerlidir (GDD E-39). Blok şantiyeye bırakılsa da sahaya geri çekilse de boya kalıcıdır; iptalde boya olmaz. Bayraklar korunur
  (cam camdır). Sürükleme sırasında blok kapıdayken yeni rengini gösterir (önizleme). Hamle kaydında `via` alanı
  (son girilen boya kapısının geçit indeksi) tutulur (öneri P-6, S-21).
- **Veri:** `{ type: "paint", y, size, color }`.
- **Örnek:** Kırmızı boya kapısı y=2. (4,2)'deki `B1` Y geçide girip sahada (5,6)'ya bırakılır → `B1` R, 1 hamle.
- **Bilgi kartı** (`obs.w6.desc`): TR "Boya kapısına giren blok kapının rengini alır." · EN "A block that enters the paint gate takes its color."

### W7 — Kilitli Geçit
- **Bölge:** duvar · **İlk bölüm:** 26
- **Kural:** `keyId` eşleşen anahtar toplanana kadar kapalıdır; toplandığı denetimde (GDD K-42) kalıcı olarak açılır ve
  sabit geçit gibi davranır. Anahtarın konumu örtülü ama her zaman görünürdür (GDD K-42). Açık Kepenk güçlendiricisi ilk 5 hamlede geçici olarak açar.
- **Veri:** geçit `{ type: "locked", y, size, keyId }`; anahtar `obstacles[] = { type: "key", x, y, id }` (saha hücresi,
  başta örtülü).
- **Bilgi kartı** (`obs.w7.desc`): TR "Anahtarın üstündeki bloğu kaldır; kilit açılsın." · EN "Move the block covering the key to unlock the gate."

### W8 — Rüzgâr Fanı
- **Bölge:** duvar (şantiye üstüne eser) · **İlk bölüm:** 32
- **Kural:** Serbest kipte şantiyeye bırakılan, genişliği 1 olan blok (balon dahil) düşmeden/yükselmeden önce `dir`
  yönünde 1 sütun kayar; koşullar: (a) bırakma anında d ≥ 1 (blok siluete oturmuş değil; balonda
  `d = |bırakma satırı − tavan satırı|`, GDD E-35), (b) kaymış konum x=6–7
  içinde, (c) kaymış konumun hücreleri boş ve açık gökyüzü koşulunu sağlıyor. Koşul tutmazsa kayma yok. (a) maddesi öneri P-2a'dır. Genişliği 2
  olan bloklar, ray kipi, Vinç güçlendiricisi etkilenmez. Gölge kaymış inişi gösterir (GDD K-18).
- **Veri:** `wall.fan: { dir: "left" | "right" }`.
- **Örnek:** `dir right`; `B1` (6,7)'de bırakılır, top(6)=2, top(7)=3 → (7,7) boş → kayar → (7,3)'e iner.
- **Bilgi kartı** (`obs.w8.desc`): TR "Rüzgâr ince blokları bir sütun iter. Gölgeye bak!" · EN "Wind pushes thin blocks one column. Check the shadow!"

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
- **Bilgi kartı** (`obs.y1.desc`): TR "Kasanın yanındaki bloğu oynat, kasa kırılsın." · EN "Move a block next to a crate to break it."

### Y2 — Çimento Torbası
- **Bölge:** saha · **İlk bölüm:** 18
- **Kural:** 1 hücre kaplar; tutulamaz. Saha yerçekimi ayarından bağımsız olarak her hamle sonunda (adım 6) altı boşsa
  düşer. Kasa ile aynı komşuluk kuralıyla tek seferde yırtılır ve yok olur (can 1). Düşen torba komşu etkisi üretmez.
  Hiçbir hedefe sayılmaz (tasarımda "engel" ve destek olarak kullanılır).
- **Veri:** `obstacles[] = { type: "cement_bag", x, y }`.
- **Örnek:** Torba (4,5), altı (4,4) boşalır → adım 6'da (4,4)'e, oradan ilk desteğe düşer.
- **Bilgi kartı** (`obs.y2.desc`): TR "Torbanın yanındaki bloğu oynat; torba yırtılır." · EN "Move a block beside the bag to tear it open."

### Y3 — Zincir
- **Bölge:** saha · **İlk bölüm:** 24
- **Kural:** `chained` bayraklı blok oyuncu tarafından tutulamaz, Vinçle seçilemez, ama saha yerçekimiyle düşer. Kasa ile
  aynı komşuluk kuralıyla bir kez tetiklenince zincir kalkar (`clear/chain` 1 sayılır). Çekiç zinciri kırar, bloğu değil.
- **Veri:** `PiecePlacement.flags: ["chained"]`.
- **Örnek:** Zincirli `O4` (0,0); (2,0)'daki blok taşınır → (2,0) zincirlinin komşusu (1,0)'a bitişik → zincir kalkar.
- **Bilgi kartı** (`obs.y3.desc`): TR "Zincirli bloğun komşusunu oynat, zincir çözülsün." · EN "Move a neighbor to free the chained block."

### Y4 — Islak Beton
- **Bölge:** saha · **İlk bölüm:** 28
- **Kural:** `wet` bayraklı blokta sayaç `wetMoves` (1–5) görünür. Sayaç > 0 iken tutulamaz, Vinçle seçilemez. Her hamle
  sonunda (adım 10) 1 azalır; o hamlede kamyonla gelen ıslak blok azalmaz. 0 olunca bayrak kalkar. Saha yerçekimiyle
  düşer. Çekiç bloğu kırar.
- **Veri:** `flags: ["wet"], wetMoves: N`.
- **Örnek:** wetMoves 2; hamle 1 sonu 1, hamle 2 sonu 0 → 3. hamlede tutulabilir.
- **Bilgi kartı** (`obs.y4.desc`): TR "Islak beton kurusun; sayaç sıfır olunca kullanabilirsin." · EN "Wet concrete must dry; use it when the counter hits zero."

### Y5 — Ağır Malzeme
- **Bölge:** saha · **İlk bölüm:** 8
- **Kural:** Genişliği ≥ 3 olan her yönelim ve I5, Q9 her zaman. Duvar sınırını geçemez (ne serbest ne ray kipinde);
  yalnızca sahada ve saha üstü Vinç Alanı'nda (x ≤ 5) sürüklenir. Çekiçle kırılır. Vinç güçlendiricisi I5/Q9 dışındakileri
  genişliği ≤ 2 yönelime döndürüp şantiyeye koyabilir (GDD K-37).
- **Veri:** şekil kimliği (`I5_0`, `Q9_0`, `L4_90` …).
- **Örnek:** `I5_0` (0,7)–(4,7) yukarı kaldırılıp (1,8)'de bırakılamaz (K-05 iptal); (0,7)'den (1,7)'ye kaydırılır (5,7 boşsa) → 1 hamle.
- **Bilgi kartı** (`obs.y5.desc`): TR "Ağır malzeme duvarı geçemez. Kenara çek ya da kır." · EN "Heavy material can't cross the wall. Move it or smash it."

### Y6 — Saha Yerçekimi
- **Bölge:** saha · **İlk bölüm:** 14
- **Kural:** `gravity.yard = true` (GDD K-20). Bütün saha blokları (zincirli, ıslak, ağır dahil) adım 6'da düşer, balonlar
  yükselir; kasalar sabittir.
- **Veri:** `gravity.yard: true`.
- **Bilgi kartı** (`obs.y6.desc`): TR "Bu sahada bloklar düşer. Alttakini alınca üsttekiler iner." · EN "Here blocks fall. Take one and the ones above drop."

### Y7 — Altın Vida
- **Bölge:** saha · **İlk bölüm:** 19
- **Kural:** Bir saha hücresinin zemininde saklıdır; bölüm başında örtülüdür, konumu her zaman görünür (GDD K-42). Hücre
  boş kaldığı ilk denetimde toplanır
  (GDD K-42), `collect/screw` 1 sayılır. Bir hücrede en çok 1 saklı nesne olur.
- **Veri:** `obstacles[] = { type: "screw", x, y }`.
- **Bilgi kartı** (`obs.y7.desc`): TR "Altın vidalar blokların altında. Üstünü aç, topla!" · EN "Golden screws hide under blocks. Uncover them to collect!"

### Y8 — Harçlı Blok
- **Bölge:** saha (etkisi şantiyede) · **İlk bölüm:** 35
- **Kural:** `mortar` bayraklı blok şantiyede hatalı yerleşirse ve bütün hücreleri plan alanında (renkli, `?` ya da `.`
  hücre) ise geri sekmez, **yapışır** (kilitli değildir). Bir hücresi plan dışındaysa normal geri seker (öneri P-2b); yapışmış blok böyle bırakılırsa başlangıç konumuna döner
  ve yapışık kalır (GDD K-17). Yapışmış blok
  sürüklenebilir; iptal olmayan her hamlesi 2 hamle yer (cam da kırılırsa 3; maliyetler toplanır, GDD K-07; kırılan
  yapışmış cam blok sahaya döner ve yapışma kalkar, GDD K-17). Çekiçle kırılır, Boya Fırçası ile boyanırsa ve yeni renkle
  doğruysa kilitlenir, Vinçle taşınır. Yapışmış blok dilimin tamamlanmasını engeller (GDD K-15) ve üstüne doğru
  yerleşim yapılamaz (K-34); bir `.` hücresine yapışmışsa o `.` hücresi K-34'te "dolu" sayılmaz, o sütunda üstündeki her
  yerleşim `support` nedeniyle hatalıdır (GDD E-43). Doğru yerleşirse normal kilitlenir.
- **Veri:** `flags: ["mortar"]`.
- **Örnek:** `B1` R harçlı (6,2) W hücresine düşer → yapışır. Oyuncu sahaya geri sürükler → kalan 10 → 8.
- **Bilgi kartı** (`obs.y8.desc`): TR "Harçlı blok yanlış yere düşerse yapışır. Dikkatli bırak!" · EN "A mortar block sticks if it lands wrong. Drop with care!"

---

## Şantiye ve yerçekimi (S, G)

### S1 — Kayan Şantiye
- **Bölge:** şantiye · **İlk bölüm:** 5
- **Kural:** `build.mode = "segments"`, 2–5 dilim (GDD K-22, K-25). Dilim bitince kayma ve kamyon teslimatı.
- **Veri:** `build.segments[]`, `yard.batches[]` (`forSegment` = dilim indeksi).
- **Bilgi kartı** (`obs.s1.desc`): TR "Bu kat bitince şantiye kayar, kamyon malzeme getirir." · EN "Finish this floor; the site slides and the truck delivers."

### S2 — Plan Boşluğu
- **Bölge:** şantiye · **İlk bölüm:** 4
- **Kural:** `.` hücresi boş kalmalıdır; bloğun herhangi bir hücresi `.` üstüne gelirse hatalı yerleşim. K-34'te `.`
  yalnızca boşken dolu sayılır (içinde moloz S4 ya da yapışmış harçlı blok Y8 varsa sayılmaz; GDD K-34, E-43). `.`
  üstündeki hücre şu yollarla dolar: ray (W1), iki sütuna köprü kuran 2 geniş blok (duvar üstü), balon (S8), Altın
  Mala, Vinç.
- **Veri:** `rows` içinde `.`.
- **Örnek:** Plan sütun 7: y0 W, y1 `.`, y2 W. `B1` W sütun 7'ye bırakılır → (7,1)'e düşer → hatalı.
- **Bilgi kartı** (`obs.s2.desc`): TR "Taralı hücre boş kalmalı. Üstünü geçitten ya da köprüyle doldur." · EN "Keep hatched cells empty. Fill above them via a gap or bridge."

### S3 — Cam Blok
- **Bölge:** şantiye (bayrak sahadaki blokta) · **İlk bölüm:** 21
- **Kural:** `glass` bayraklı blok serbest kipte şantiyeye düşerken d > eşik (low 4, normal 3, high 2) ise kırılır:
  doğrulama yapılmaz, blok GDD K-17 hedef sırasıyla sahaya döner, hamle maliyeti taban + 1 (sıradan blokta 2; yapışmış
  harçlı cam blokta 2 + 1 = 3, GDD K-07), Usta Serisi 0. Yapışmış harçlı cam blok kırılırsa (başlangıcı şantiyede)
  K-17'nin 1. adımı atlanır: blok başlangıç konumuna değil, 2. adımla sahaya döner ve yapışma kalkar (GDD K-17 istisnası
  ve örneği). Ray, Vinç, balon
  yükselişi, geri sekme, teslimat ve saha yerçekimi düşüşlerinde kırılmaz.
- **Veri:** `flags: ["glass"]`.
- **Örnek:** normal; cam `D2_90` (6,8)'de bırakılır, iniş (6,3) → d=5 > 3 → kırılır. (6,6)'ya indirilip bırakılırsa d=3 → sağlam.
- **Bilgi kartı** (`obs.s3.desc`): TR "Cam kırılır! Bloğu aşağı indir, sonra bırak." · EN "Glass breaks! Lower the block before you let go."

### S4 — Moloz
- **Bölge:** şantiye · **İlk bölüm:** 17
- **Kural:** Bölüm başında dilimin şantiye alanında duran bloklar; hiçbir yerde doğru olamaz (GDD K-16). Tutulabilir
  (serbest kipte; bütün satırları bir geçitteyse ve geçit o an açıksa ray kipinde de — GDD K-12'nin tek istisnası).
  Sahaya bırakılınca (1 hamle; sürükleme ya da Vinç) `clear/debris` 1 sayılır ve sahada sıradan, kullanılamaz bir blok
  olur. Şantiyede başka yere bırakılırsa hatalı → başlangıcına döner. Altı boşalsa da düşmez. Şantiyedeyken Çekiç kırar
  (sayılır). Her moloz en çok 1 kez sayılır (GDD K-41): sahaya taşınmış moloz Çekiç'le kırılınca yeniden sayılmaz.
  Dilim, alanında moloz varken tamamlanmaz. Moloz malzeme arzı değildir: K-27 ve K-30 D2
  sayımlarında sahada da, kuyrukta da sayılmaz (GDD E-44). Bir `.` hücresindeki moloz o hücreyi K-34'te "dolu" yapmaz
  (GDD K-34, E-43). Moloz şantiyeden alınırken (6,y)/(7,y) başlangıç hücreleri sahadaki (5,y) engellerine komşu
  sayılmaz (duvar sınırı; GDD §0, E-46).
- **Veri:** `build.debris[] = { shape, color, x, y, segment? }` (`segment` isteğe bağlı, verilmezse 0; P-5, GDD §14, K-45/7).
- **Bilgi kartı** (`obs.s4.desc`): TR "Eski moloz yolu tıkıyor. Önce onu sahaya taşı." · EN "Old rubble is in the way. Move it out first."

### S5 — Döner Platform
- **Bölge:** şantiye · **İlk bölüm:** 31
- **Kural:** `build.mode = "carousel"` (GDD K-23). Sayaç: dönmeye kalan hamle `carouselEvery − t` (W4 sayaç dili). `t`
  her hamlenin adım 10'unda 1 artar; **ön dilimin tamamlandığı hamlede artmaz** (dönüş adım 8'de olmuş, `t = 0` kalır) ve
  güçlendirici / Altın Mala ile tamamlanmada da artmaz (mini hatta adım 10 yok).
- **Veri:** `build.carouselEvery` (2–6).
- **Bilgi kartı** (`obs.s5.desc`): TR "Platform {n} hamlede bir döner. Öndeki yüze inşa et." · EN "The platform turns every {n} moves. Build on the front face."

### S6 — Asansör İskele
- **Bölge:** şantiye · **İlk bölüm:** 37
- **Kural:** `build.elevator` (GDD K-24); her iki modla birleşebilir. Adım 10'da önce `e + dir` aralık dışındaysa yön
  döner, sonra `e += dir` (W5 ile aynı ping-pong); başlangıçta sınırda ve dışarı bakan `dir` geçerli veridir.
- **Veri:** `build.elevator: { range: [a, b], start, dir }`.
- **Bilgi kartı** (`obs.s6.desc`): TR "İskele her hamlede bir sıra iner çıkar. Geçide dikkat!" · EN "The scaffold moves one row each move. Mind the gap!"

### S7 — Gizli Plan
- **Bölge:** şantiye · **İlk bölüm:** 27 (`repeat`), 29 (`mirrorOf`)
- **Kural:** GDD K-32.
- **Veri:** `rows` içinde `?`, `segments[].hidden: { kind: "repeat", period } | { kind: "mirrorOf", segment }`.
- **Bilgi kartı** (`obs.s7r.desc`, 27): TR "Soru işaretleri deseni tekrarlar. Aşağıdaki sıralara bak!" · EN "Question marks repeat the pattern. Look at the rows below!"
  · (`obs.s7m.desc`, 29): TR "Bu kat, öbür katın aynası. Renkler yer değiştirir!" · EN "This floor mirrors the other. Colors swap sides!"

### S8 — Balonlu Blok
- **Bölge:** şantiye ve saha · **İlk bölüm:** 38
- **Kural:** `balloon` bayraklı blok bırakılınca yükselir. Sahada: üstündeki ilk dolu hücreye ya da y=7'ye kadar.
  Şantiyede serbest kipte: bırakma yüksekliğinden bağımsız olarak sütunlarının **tavanına** asılır; tavan = aktif dilimin
  plan tepesi (bloğun en üst hücresi satır `h + e − 1`; öneri P-3); bloğun sütunlarında siluet tavana ulaşmışsa blok siluetin üstünde
  kalır (plan dışı → hatalı). Rayda bırakılan balon hareket etmez. Saha yerçekimi açıkken adım 6'da yükselir. Rüzgâr
  (genişlik 1) önce kaydırır; G-L yönlendirmesi yükselişte de kullanılabilir. Doğrulama K-16 ve K-34 iledir.
  Tavanın üstünden (Vinç Alanı) bırakılan balon tavana **iner** (GDD E-35). Kamyonla gelen balon düşüp oturur, yükselmez;
  Y6 açıksa sonraki hamlenin 6. adımında yükselir (E-36). Saha yerçekiminde düşen bloklarla karşılaşma "yarım adım"
  kuralıyla çözülür (GDD K-35 adım 6, E-33).
- **Veri:** `flags: ["balloon"]`.
- **Örnek:** Plan h=6, sütun 7: y0–y3 dolu, y4 `.`, y5 W boş. `B1` W balon sütun 7'ye bırakılır → (7,5)'e asılır → doğru.
  Normal `B1` W aynı yerde (7,4) `.` hücresine düşerdi → hatalı.
- **Bilgi kartı** (`obs.s8.desc`): TR "Balonlu blok yukarı süzülür ve tavana asılır." · EN "Balloon blocks float up and hang from the ceiling."

### G-H — Ağır yerçekimi
- **Bölge:** şantiye · **İlk bölüm:** 15
- **Kural:** `gravity.build = "high"`: `holdMs` tutma (sonra zorla bırakma), cam eşiği 2 (GDD K-19). `holdMs` = 700;
  Ayarlar > Erişilebilirlik "Zaman baskısını azalt" açıksa 1400 (R-11). Bot ölçümü 700 ile yapılır.
- **Veri:** `gravity.build: "high"`.
- **Bilgi kartı** (`obs.gh.desc`): TR "Ağır yerçekimi! Şantiye üstünde blok çabucak kayıp düşer." · EN "Heavy gravity! Over the site, blocks slip and drop fast."

### G-L — Hafif yerçekimi
- **Bölge:** şantiye · **İlk bölüm:** 23
- **Kural:** `gravity.build = "low"`: yavaş düşüş; düşüş/yükseliş sürerken tahtanın herhangi bir yerine dokunmak bloğu
  dokunulan tarafa (bloğun orta çizgisine göre) 1 sütun kaydırır; koşul: kaymış hücreler x=6–7 içinde ve boş; düşüş
  başına en çok 1; aynı hamle; koşul tutmazsa hak harcanmaz; kayıt `steer { dir, atRow }` (GDD K-19, R-10). Cam eşiği 4.
  Yönlendirilen yerleşim YAO'da "duvar üstü" sayılır. Gölge yönlendirmeden sonra yeni inişi gösterir (K-18).
- **Veri:** `gravity.build: "low"`.
- **Bilgi kartı** (`obs.gl.desc`): TR "Hafif yerçekimi: düşerken tahtaya dokun, blok o yana kayar." · EN "Low gravity: tap the board while it falls to nudge it."

---

## Veri imzası (mekanik türetme; GDD K-45/9, R-21)

`levels:validate` her bölümün mekanik kümesini aşağıdaki imzalardan türetir; "yeni mekanik" = önceki bölümlerin
kümelerinde olmayan imza. İmzası olmayan öğretimler (kaldır–taşı–indir, gölge, kazı K-10, `clear`/`collect` hedef
türleri, güçlendirici açılışları) yalnızca `tutorial` adımlarıyla ifade edilir.

| Mekanik | Veri imzası | İlk bölüm |
|---|---|---|
| W1 | bir geçitte `type = "static"` | 3 |
| W2 | `wall.height = 8` | 6 |
| W3 | herhangi bir geçitte `size = 1` (tipten bağımsız, N2) | 9 |
| W4 | `type = "shutter"` | 13 |
| W5 | `type = "slider"` | 16 |
| W6 | `type = "paint"` | 22 |
| W7 | `type = "locked"` (+ `key` nesnesi) | 26 |
| W8 | `wall.fan` var | 32 |
| Y1 | `obstacles[]` içinde `crate` | 11 |
| Y2 | `cement_bag` | 18 |
| Y3 | herhangi bir blokta (parti 0 ya da k) `chained` | 24 |
| Y4 | `wet` | 28 |
| Y5 | herhangi bir blokta ağır şekil (GDD K-44) | 8 |
| Y6 | `gravity.yard = true` | 14 |
| Y7 | `screw` | 19 |
| Y8 | `mortar` | 35 |
| S1 | `build.mode = "segments"` ve dilim sayısı ≥ 2 | 5 |
| S2 | herhangi bir planda `.` | 4 |
| S3 | `glass` | 21 |
| S4 | `build.debris[]` dolu | 17 |
| S5 | `build.mode = "carousel"` | 31 |
| S6 | `build.elevator` var | 37 |
| S7-R | `hidden.kind = "repeat"` | 27 |
| S7-M | `hidden.kind = "mirrorOf"` | 29 |
| S8 | `balloon` | 38 |
| G-H | `gravity.build = "high"` | 15 |
| G-L | `gravity.build = "low"` | 23 |

Denetim (product-lead, LEVELS §2–§3 üzerinden elle): 50 bölümün her birinde türetilen yeni mekanik ≤ 1 ve `teaches`
alanlarıyla birebir. Bölüm 4'ün geçidi boy 2'dir (R-21), bu yüzden W3 ilk kez 9'da görünür.

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
| **W7** |   |   |   |   |   |   | ■ | · | N4 | · | · | · | N6 | N40,N9 | N5 | · | · | N10 | N11 | N14 | · | N16 | · | N19 | N21 | · |
| **W8** |   |   |   |   |   |   |   | ■ | · | · | · | · | · | · | · | · | · | N18 | N13 | · | · | · | · | N20 | · | N22 |
| **Y1** |   |   |   |   |   |   |   |   | ■ | N23 | N24 | · | · | N25 | N4 | · | · | · | · | · | · | · | · | · | · | · |
| **Y2** |   |   |   |   |   |   |   |   |   | ■ | N24 | · | · | N26 | · | · | · | · | · | · | · | · | · | N34 | · | · |
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

`[kural]` = test edilebilir kural; test adı "N33 …" biçimindedir ve kapsam aracı bunları zorlar (code-lead). `[not]` =
tasarım notu, test gerektirmez.

- **N1** [kural] — Geçit tipleri aynı geçitte birleşmez (bir geçidin tek `type`'ı vardır); farklı geçitlerde aynı bölümde bulunabilir.
- **N2** [kural] — W3 bir boyuttur (`size=1`), tip değildir: dar kepenk, dar kayar kapı, dar boya kapısı, dar kilitli geçit geçerlidir.
- **N3** [kural] — Yüksek duvarda geçit tek kestirmedir: boyu > 2 dikey bloklar (I3_0, L4_0 …) şantiyeye yalnızca geçitten girer (K-05).
- **N4** [kural] — Saklı nesne (anahtar/vida) bir bloğun ya da kasanın altında olabilir (GDD K-42; Çimento Torbası Y2 örtü değildir, torba altındaki nesne doğrulayıcıda `hidden_item_exposed`, TECH L-14): kasa yok olunca hücre boşalır, o denetimde toplanır. Saha yerçekimi zincirlemesiyle açılan hücre adım 6 denetiminde toplanır (K-42).
- **N5** [kural] — Bir hücrede en çok 1 saklı nesne (anahtar ya da vida).
- **N6** [kural] — Ağır blok duvar sınırını geçemez: hiçbir geçitten geçemez, boyanamaz, kepenk/kilit onu etkilemez.
- **N7** [kural] — Boya kapısı yalnızca rengi değiştirir; bayraklar (cam, harç, balon) korunur. Zincirli/ıslak blok tutulamadığı için serbest kalana kadar boyanamaz.
- **N8** [kural] — İki zamanlayıcı aynı hamle sonunda ilerler; sıra adım 10'daki gibidir (kepenk → kayar kapı → döner platform → asansör → ıslak beton). Birbirlerinin girdisini kullanmazlar; sıra yalnızca **olay (event) sırasıdır**. Animasyonlar bu sıraya bağlı değildir: JUICE §0 kural 10'a göre eşzamanlı oynar (sunum design-lead'in). Test yalnızca olay sırasını denetler.
- **N9** [not] — Saha yerçekimi geçide giden saha tünelini kapatabilir ya da açabilir; gölge yoktur ama yerçekimi deterministiktir, hamle sonu animasyonu gösterir.
- **N10** [not] — `.` üstündeki hücreyi doldurmanın ana yolu raydır; geçit satırı `.`'nin hemen üstüne denk getirilir (Bölüm 4, 9).
- **N11** [kural] — Raydan giren cam blok düşmediği için asla kırılmaz; cam bölümlerinde geçit güvenli ama pahalı yoldur (kazı gerekir).
- **N12** [not] — Yüksek duvarda blok Vinç Alanı'ndan bırakılırsa d büyür (8–9 satır); cam için mutlaka siluete yakın indirilmelidir.
- **N13** [kural] — Rüzgâr kayması düşüş mesafesini değiştirmez (aynı satırdan düşer); kaymış sütunun silueti d'yi belirler.
- **N14** [kural] — Geçit satırlarındaki moloz rayı tıkar; geçit açıkken aynı moloz ray kipinde geçitten sahaya çekilebilir (1 hamle; GDD K-12 istisnası).
- **N15** [not] — Döner platform ile kepenk aynı periyotta tasarlanırsa senkron bulmaca olur (Bölüm 34): kepenk açıkken hangi yüzün önde olduğu `m`'den hesaplanabilir.
- **N16** [kural] — Asansörde geçidin açıldığı plan satırı `g.y − e`'dir; ray yerleşimi hangi plan satırına gideceğini ofsete göre değiştirir.
- **N17** [kural] — Kayar kapı ve asansör aynı hamlede oynar: geçidin plan satırı her hamle −2, 0 ya da +2 değişebilir.
- **N18** [kural] — Rüzgâr 1 genişlikteki bloğu `.` sütununa itebilir; gölge bunu gösterir (E-16).
- **N19** [kural] — Raydan giren balon yükselmez (iskele tutar); balonun anlamı serbest kipte tavana asılmaktır.
- **N20** [kural] — Balon rüzgârla önce kayar, sonra tavana yükselir.
- **N21** [kural] — G-H 700 ms sayacı yalnızca serbest kipte şantiye sütunlarına değince işler; raydaki blok için zaman baskısı yoktur.
- **N22** [kural] — G-L yönlendirmesi rüzgâr kaymasını geri alabilir (düşüş başına 1 yönlendirme).
- **N23** [kural] — Torba kasanın üstünde durur; kasa yok olunca torba adım 6'da düşer.
- **N24** [kural] — Aynı komşu hareketi birden fazla engeli tetikler (kasa katı, torba, zincir); her biri hamle başına en çok 1 kez.
- **N25** [kural] — Kasa düşmez ve destektir; saha yerçekiminde kasa üstündeki bloklar yerinde kalır.
- **N26** [kural] — Düşen torba komşu etkisi üretmez (yalnızca düşen bloklar üretir).
- **N27** [kural] — Zincirli ve ıslak bloklar saha yerçekimiyle düşer; düşmeleri zinciri çözmez, sayacı değiştirmez.
- **N28** [kural] — Kamyonla gelen ıslak blok geldiği hamlede sayaç kaybetmez (E-31).
- **N29** [kural] — Harçlı blok `.` (pencere) hücresine yapışabilir; dilim tamamlanamaz, 2 hamlelik çekme ya da Çekiç gerekir (E-24).
- **N30** [kural] — Harçlı cam: önce kırılma denetlenir; kırılırsa sahaya döner, yapışmaz.
- **N31** [kural] — Yapışmış harç kendi dilimiyle birlikte döner/kayar; asansörde çerçeveyle oynar. Yalnızca plan alanında yapıştığı için tahtadan taşmaz (E-08, E-32).
- **N32** [kural] — Yanlış renkle `?` hücresine yapışan harç hücreyi açmaz; Boya Fırçası doğru renge boyarsa kilitlenir ve hücre açılır.
- **N33** [kural] — Saha yerçekimi açıkken balonlar adım 6'da yükselir; düşen bloklarla aynı sütunda karşılaşırlarsa "yarım adım" kuralı geçerlidir (GDD K-35 adım 6): önce düşme yarısı (balon katı), sonra yükselme yarısı; blok balona oturur, balon bloğa dayanır, arada boşluk kalmaz (E-33).
- **N34** [kural] — Torba balonun üstüne düşerse ikisi de durur (torba balona, balon torbaya dayanır).
- **N35** [kural] — Asansör ofseti dilim geçişinde ve döner platform dönüşünde korunur; yeni gelen/öne geçen dilim mevcut `e` ile görünür.
- **N36** [not] — Balon `.` hücrelerinin üstündeki tavan hücrelerini doldurmanın duvar üstü yoludur (asma köprü, bayrak).
- **N37** [kural] — Cam eşiği: G-H 2, normal 3, G-L 4. G-H'de 700 ms içinde indirmek gerekir.
- **N38** [kural] — Moloz dilime aittir (`segment`); kayan şantiyede o dilim gelince, döner platformda kendi yüzündedir.
- **N39** [kural] — G-L yönlendirmesi balonun yükselişinde de kullanılabilir.
- **N40** [kural] — Kilitli geçidin anahtarı saha yerçekimiyle açığa çıkabilir (N4).
- **N41** [kural] — Gizli `?` hücresine düşecek gölge her zorlukta nötrdür; Boya Kapısı rengi ipucu olarak tasarlanabilir.
- **N42** [kural] — Döner platform ve kayan şantiyede teslim partisi dilim tamamlanma sayısına bağlıdır (K-23, K-25).
- **N43** [kural] — Saha yerçekimi açıkken kamyon blokları da oturmuş sahaya düşer; teslimat sahayı yeniden oynatmaz.

### İmkânsız çiftler

- **—1** — Aynı bölümde tek `build.mode` olur (segments ya da carousel).
- **—2** — Aynı bölümde tek `gravity.build` değeri olur.

Kullanılmayan not yok; her `Nxx` en az bir hücrede geçer. Matris, `docs/OBSTACLES.md` üretilirken bir betikle kontrol edildi: 26 engel, 325 çift, her çift tam bir kod taşır.
