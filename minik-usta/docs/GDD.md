# GDD — Oyun kuralları

Sahip: product-lead · Sürüm: Faz 1 revizyonu (2026-10-04; orkestratör kararları R-01…R-24; tutarlılık denetimi tur 1–2, 2026-10-05) · Kaynak: `docs/BRIEF.md` §4–§8, §10

Bu belge oyunun **bütün** kurallarını kimlikle (K-xx) verir. Brifteki K-01…K-33 kimlikleri ve anlamları korunmuştur;
yalnızca belirsizlikleri sayıyla kapatan açıklamalar eklenmiştir. Yeni kurallar K-34'ten başlar. Engel ayrıntıları
`docs/OBSTACLES.md`'dedir (kimlikler W1–W8, Y1–Y8, S1–S8, G-H, G-L); bu belge onlara atıf yapar.
Teknik modelle (TECH_DESIGN §2–§6) uyumludur; code-lead'in açık sorularına (S-1…S-28) yanıtlar §15'tedir.

Her kural: **Kural** (test edilebilir cümle) + **Örnek** (koordinat, önce/sonra). Test adları kural kimliğini içerir.

---

## 0. Sözlük ve gösterim

| Terim | Tanım |
|---|---|
| Hücre | Tahtadaki 1×1 kare. Genel koordinat `(x, y)`; x=0 en sol, y=0 en alt. |
| Blok | Tek renkli poliomino. Kimlik `TÜR_AÇI` (ör. `C3_90`). Çapa = kutusunun sol alt köşesi. Oyuncuya görünen metinde terim her zaman "blok / block"tur ("parça / piece" kullanılmaz, R-08). |
| Saha | x=0–5, y=0–7 (48 hücre). Malzeme deposu. |
| Şantiye | x=6–7, y=0–7. Aktif dilimin planı burada gösterilir. |
| Duvar sınırı | x=5 ile x=6 arasındaki **sıfır genişlikli** sınır (R-03; TECH_DESIGN P-1). Satır `y`'de sınır **kapalıdır** ⇔ `y < height` ve `y` açık bir geçidin satırlarında değil; diğer satırlarda açıktır. Bir öteleme adımında sınırı geçen her hücre kendi satırında geçer ve o satır açık olmalıdır. Bloğun hücreleri sınırın iki yanındaysa blok "sınırı kesiyor"dur. (Önceki taslaktaki "duvar sütunu" ile kurallar eşdeğerdir; yalnızca ara konum sayısı değişir.) |
| Vinç Alanı | Tahtanın üstündeki y=8–9 satırları; x=0–7 üstü ve sınırın üstü dahil. |
| Hamle (tur) | İptal edilmeyen bir bırakma. Hamle sayacını düşürür, zamanlayıcıları 1 kez ilerletir. |
| Serbest kip (FREE) | Bloğun saha, Vinç Alanı ya da duvar üstünden şantiyeye taşındığı kip. Şantiyede bırakılınca düşer. |
| Ray kipi (RAIL) | Bloğun bir geçitten geçerek şantiyeye girdiği kip. Dikey konumu kilitli, bırakılınca düşmez. |
| Siluet (`top(c)`) | Şantiye sütunu `c`'deki en yüksek dolu hücrenin satırı + 1; sütun boşsa çerçeve tabanı (asansörsüz 0). |
| Düşüş mesafesi | Bırakma satırı − iniş satırı (bloğun çapa satırları farkı). |
| Doğru dolu hücre | Doğru yerleşmiş (kilitli) bir bloğun ya da Altın Mala'nın doldurduğu plan hücresi. |
| `m` | Bölüm başından beri tamamlanan hamle sayısı (`turn`). Bölüm başında 0. |

Yön sözcükleri: "yukarı" = +y, "sağ" = +x. "Komşu" her yerde **4-komşuluk** (sol, sağ, alt, üst) demektir.
Komşuluk duvar sınırını **aşmaz**: x=5 ile x=6 hücreleri duvar yüksekliğinden ve geçitlerden bağımsız olarak hiçbir zaman
komşu sayılmaz (R-03 eşdeğerliği: önceki "duvar sütunu" modelinde bu hücreler arasında duvar hücresi vardı; E-46).

---

## 1. Oyun alanı

### K-01 Tahta
**Kural:** Oyun tahtası 8 sütun × 8 satırdır; geçerli hücreler `0 ≤ x ≤ 7`, `0 ≤ y ≤ 7`. Bunun üstünde Vinç Alanı
(y=8–9) vardır. Hiçbir bloğun hücresi y > 9, x < 0 ya da x > 7 olamaz.
**Örnek:** `D2_0` (1×2) çapası (3,8) ise hücreleri (3,8),(3,9) → geçerli. Çapası (3,9) ise (3,10) taşar → bu konum yok.

### K-02 Malzeme Sahası
**Kural:** Saha x=0–5, y=0–7'dir; kaymaz. Bölüm başında saha hücrelerinin en az %80'i (≥ 39/48) ve en çok %100'ü
blok, Ahşap Kasa (Y1) ya da Çimento Torbası (Y2) ile doludur. Doğrulayıcı bu oranı bütün bölümlerde (öğretici bölümler
dahil) zorunlu tutar. "Sade tahta" (brif §8) az renk, az şekil ve az şaşırtma demektir; düşük doluluk demek değildir.
**Örnek:** 46 hücre dolu, 2 boş → %95,8 → geçerli. 38 hücre dolu → %79,2 → doğrulayıcı hatası `yard_fill_low`.

### K-03 Şantiye
**Kural:** Şantiye x=6–7'dir ve yalnızca aktif dilimin (döner platformda öndeki dilimin) planını gösterir. Plan
satırları şantiyenin tabanına hizalanır: plan satırı `r`, tahta satırı `r + e`'dir (`e` = asansör ofseti, K-24;
asansör yoksa `e = 0`). Plan yüksekliği `h` (1–8) ise `y ≥ h + e` şantiye hücreleri **plan dışıdır**.
**Örnek:** Plan `["WW","WW","YY"]` (h=3; `rows` yukarıdan aşağıya, K-15), e=0 → (6,0),(7,0)=Y; (6,1)…(7,2)=W;
(6,3)…(7,7) plan dışı (Bölüm 1 planı).

### K-04 Şantiye Duvarı
**Kural:** Duvar, saha (x ≤ 5) ile şantiye (x ≥ 6) arasındaki sıfır genişlikli sınırdır (§0). Parametreler:
`height` (0–8) ve `gaps[]` (`y`, `size`, `type`). Sınır `y` satırında şu durumda **kapalıdır**: `y < height` ve `y` açık
bir geçidin satır aralığında değil. Vinç Alanı satırları (8–9) her zaman açıktır.
Geçit kısıtları (doğrulayıcı): `size ≥ 1`; `y ≥ 0`; `y + size ≤ height − 1` (geçidin üstünde en az 1 kapalı duvar
satırı olmalı; aksi halde bu geçit değil alçak duvardır); geçitler örtüşmez. Blok sınırı keserken **bırakılamaz**
(bırakılırsa iptal, K-07).
**Örnek:** `height=6`, geçit `y=2, size=2` → sınır satır 0–1 kapalı, 2–3 geçit, 4–5 kapalı, 6–9 açık (duvar üstü
hava). `height=6`, geçit `y=4, size=2` → 4+2=6 > 5 → doğrulayıcı hatası `gap_touches_top`.

### K-05 Vinç Alanı
**Kural:** y=8–9 satırları bütün sütunlarda serbest havadır. Blok sürüklenirken buraya girebilir. Bırakma anında
bloğun bütün hücreleri x ≤ 5 iken herhangi bir hücresi y ≥ 8 ise bırakma **iptaldir** (blok yerine döner, hamle
harcanmaz). x=6–7 üstündeki Vinç Alanı'nda bırakılan blok şantiyeye düşer (K-11).
**Sonuç (açık yükseklik):** Sınırı serbest kipte geçen her hücre `y ≥ height` olmalıdır. Bu yüzden duvarın üstünden
geçebilecek bloğun sınırı geçen sütunundaki dikey hücre dizisi `10 − height` satırı aşamaz. `height=8` iken yalnızca
boyu ≤ 2 olan bloklar (B1, D2_0, D2_90, O4, C3 hepsi) duvarı aşar; I3_0, I4_0, L4_0 gibi boyu 3–4 olan dikey bloklar
yalnızca uygun bir geçitten girebilir. Yapışkan takibin (K-08) duvar tepesinde durması bir sunum olayıdır
(`blockedByWallHeight`; design-lead bu anda vinç alanı sınırını ve yükseklik işaretini gösterir); kuralı değiştirmez.
Oyuncunun hesabındaki ilk `blockedByWallHeight` olayında bağlamsal öğretici `tut.ctx.tootall` bir kez tetiklenir (metin
STORY §6, UX §13.2 bağlamsal tablo).
**Örnek:** `height=8`, `I3_0` (1×3) çapası (5,7) → yukarı sürüklenir, en fazla çapa (5,7)'ye (hücreler 7–9) çıkar;
sınırı geçmek için 3 hücrenin de y ≥ 8 olması gerekir → imkânsız. `height=7` iken çapa (5,7) → hücreler
7,8,9 ≥ 7 → geçer.

### K-06 Yapı Panoraması
**Kural:** Tahtanın üstünde bütün dilimlerin küçük önizlemesi bulunur: tamamlanan dilimler tam renkli, aktif dilim
vurgulu çerçeveli, gelecek dilimler %30 opak gösterilir. Gizli `?` hücreleri panoramada da `?` görünür; açılınca
(K-32) rengini alır. Panorama **oyun durumunu değiştirmez**; dokunuş yalnızca büyük önizleme açar (sunum design-lead'in,
UX_FLOWS §5.1; R-22). Test: önizleme açılıp kapanınca oyun durumu (tahta, sayaçlar, `m`) bit bit aynıdır.
**Örnek:** 3 dilimli bölümde 1. dilim bitince panorama: [dilim 1 renkli][dilim 2 çerçeveli][dilim 3 soluk].

---

## 2. Hareket

### K-07 Hamle, iptal ve hamle maliyeti
**Kural:** Dokunma ile sürükleme ayrımı sayı içermez: `tokens.drag.startThresholdPx` / `tokens.drag.holdMs`
(design-lead) ile yapılır; eşik altında kalan bırakma **dokunmadır**, hiçbir şey olmaz (blok tutulmamış sayılır). Test
token değerini okur. Bırakma anındaki konuma göre sonuç aşağıdaki tabloyla **tek** biçimde belirlenir (satırlar
yukarıdan aşağı denenir, ilk tutan geçerlidir):

| # | Bırakma konumu | Sonuç | Hamle maliyeti |
|---|---|---|---|
| 1 | Başlangıç konumu (aynı hücre kümesi, aynı kip) | İptal | 0 |
| 2 | Serbest kip, bütün hücreler x ≤ 5 ve y ≤ 7 | Sahaya yerleşim (K-10) | 1 |
| 3 | Serbest kip, bütün hücreler x ≤ 5, en az bir hücre y ≥ 8 | İptal (K-05) | 0 |
| 4 | Blok duvar sınırını kesiyor (hücreleri sınırın iki yanında) | İptal | 0 |
| 5 | Bütün hücreler x ≥ 6 ve şantiye **kapalı**: bütün dilimler tamamlanmış, bölüm ek hedef (K-41) yüzünden sürüyor | İptal (E-27) | 0 |
| 6 | Serbest kip, bütün hücreler x ≥ 6 | Şantiyeye düşüş (K-11) → doğrulama (K-16) | 1 |
| 7 | Ray kipi, bütün hücreler x ≥ 6 | Rayda yerleşim (K-12) → doğrulama (K-16) | 1 |

Ek maliyetler **toplanır**: hamle maliyeti = taban + cam cezası. Taban 1'dir; harçla yapışmış (Y8) bloğun hamlesinde
2'dir. Cam kırılırsa (S3) +1. Buna göre sıradan cam kırılması 2, yapışmış harçlı cam bloğun yeniden sürüklenip kırılması
3 hamle yer (test "K-07 stuck glass mortar break cost"). Hamle sayacı 0'ın altına inmez (1 hamle kalmışken maliyeti 2
olan hamle sayacı 0 yapar). Sayaç 0 iken blok tutulamaz. İptal edilen bırakmada
hiçbir durum değişmez: sayaç, Usta Serisi, zamanlayıcılar, boya, komşu etkileri olduğu gibi kalır.
**Örnek:** Blok (2,6)'dan alınıp Vinç Alanı'nda (2,8)'de bırakılır → satır 3 → iptal, kalan hamle 12 → 12.
Aynı blok (4,7)'de bırakılır (o hücre boş) → satır 2 → kalan hamle 12 → 11.

### K-08 Yol kuralı ve yapışkan takip
**Kural:** Blok yalnızca birim ötelemelerle (±1 x ya da ±1 y), her ara konumda bütün hücreleri boş ve geçerli olacak
biçimde hareket eder (BFS). Diğer bloklar, sınırın kapalı satırları, kasa, torba ve şantiye platformu geçilemez.
Saklı nesneler (anahtar, vida) yolu kapatmaz. Tutma anında erişilebilir konum kümesi `R` hesaplanır; sürükleme
süresince tahta donuktur (hiçbir şey düşmez, kırılmaz), bu yüzden `R` değişmez.
Parmak hedefi `p = parmak − tutmaOfseti + (0; 1,2)` hücredir (blok parmağın 1,2 hücre üstünde görünür). Blok, `R`
içinde `p`'ye Öklid uzaklığı en küçük konuma gider ("yapışkan takip"). Eşitlikte sırasıyla: (1) mevcut konumdan BFS
adımı az olan, (2) serbest kip ray kipinden önce, (3) y'si küçük olan, (4) x'i küçük olan (TECH_DESIGN §4.4 düğüm sırası). Titremeyi önlemek için
yeni konum ancak uzaklık karesi mevcut konumunkinden en az 0,2 küçükse seçilir. Blok ekranda hiçbir zaman bir engelin
içinden "ışınlanmaz"; yeni konuma BFS yolu boyunca gider.
**Örnek:** (2,6)'daki `B1` tutulur; parmak (2,3)'e (dolu, kapalı) iner. `R`'de en yakın konum (2,6)'dır (aşağısı dolu) →
blok yerinde kalır. Parmak (3,9)'a çıkınca blok (2,7)→(2,8)→(3,8)→(3,9) yolunu izler.

### K-09 Çıkarma (tutulabilirlik)
**Kural:** Bir blok ancak şu koşulların hepsi sağlanırsa tutulabilir: (a) 4 birim ötelemesinden en az biri K-08'e göre
geçerli bir konuma götürür ("bir yönü açık"); (b) kilitli değildir (K-14); (c) zincirli (Y3) ya da ıslak (Y4) değildir;
(d) kasa ya da torba değildir; (e) hamle sayacı > 0. Bölüm başında saha %80+ dolu olduğundan (a) koşulunu yalnızca üstü,
yanı ya da bir geçide bakan yüzü boş olan bloklar sağlar.
**Örnek:** Saha tamamen dolu; (0,6)–(0,7)'deki `D2_0`'ın üstü (0,8) Vinç Alanı → yukarı öteleme geçerli → tutulabilir.
(0,4)–(0,5)'teki blok: üst (0,6) dolu, alt (0,3) dolu, sol tahta dışı, sağ (1,4)/(1,5) dolu → tutulamaz; dokununca
hafif "kımıldamıyor" sarsıntısı (design-lead), hamle harcanmaz.

### K-10 Sahada yeniden konumlandırma
**Kural:** Blok sahada başlangıçtan farklı, bütün hücreleri x ≤ 5 ve y ≤ 7 olan boş bir konuma bırakılabilir (1 hamle).
Saha yerçekimi kapalıysa (`gravity.yard=false`) blok bırakıldığı yerde kalır, altı boş olsa bile. Açıksa hamle
sonundaki yerçekimi adımında düşer (K-20). Balonlu blok (S8) bırakıldığı anda yükselir.
**Örnek:** `O4` (2,6)'dan alınıp (4,6)'ya bırakılır; (4,5),(5,5) boş. Saha yerçekimi kapalı → (4,6)'da asılı kalır.
Açık → hamle sonunda (4,4)'e (altında ilk destek) iner.

### K-11 Şantiyeye giriş A — Duvarın Üstünden (ana yol)
**Kural:** Serbest kipte blok, sınırı geçen her hücresi `y ≥ height` olacak biçimde duvarı aşar ve şantiye
üstüne gelir. Şantiye üstünde serbest kipteki blok için **açık gökyüzü** koşulu geçerlidir: bloğun kapladığı her
şantiye sütunu `c` için bloğun o sütundaki en alt hücresi `y ≥ top(c)`. Parmak basılıyken blok bu koşulla aşağı
indirilebilir (gölgenin altına inemez). Parmak kalkınca blok **düşer**: iniş satırı
`yL = max_c (top(c) − altOfset_c)` (altOfset_c = bloğun c sütunundaki en alt hücresinin çapaya göre satırı).
Düşüş mesafesi `d = yBırakma − yL` (cam için S3). Blok havada asılı kalamaz. Rüzgâr (W8), balon (S8) ve hafif
yerçekimi yönlendirmesi (G-L) bu düşüşü değiştirir; sıra: rüzgâr kayması → düşüş/yükseliş → (G-L yönlendirme).
**Örnek:** Şantiye boş, plan h=3. `D2_90` (yatay) Vinç Alanı'nda çapa (6,8)'de bırakılır → top(6)=top(7)=0 → iner (6,0);
d=8. Aynı blok önce çapa (6,1)'e indirilip bırakılırsa d=1.

### K-12 Şantiyeye giriş B — Geçitten (ray)
**Kural:** Blok ancak **tamamen sahadaki** bir konumdan sağa ötelenerek bir geçide girebilir ve bunun için bloğun
bütün satırları geçidin satır aralığında olmalıdır (`g.y ≤ yAlt` ve `yÜst ≤ g.y + g.size − 1`) ve geçit o an açık
olmalıdır (W4 kepenk açık, W7 kilit açılmış). Geçide giren blok **ray kipindedir**: yalnızca yatay hareket eder,
dikey konumu kilitlidir. Ray kipinden sola, bütün hücreleri sahaya geçecek biçimde çıkılabilir (serbest kipe döner).
Şantiye tarafından ray kipine girilemez. Rayda, bütün hücreleri x ≥ 6 iken bırakılan blok iskele tarafından tutulur
ve **düşmez**; altı boş olabilir.
**Örnek:** Geçit y=3, size=1. Sahada (4,3)–(5,3)'teki `D2_90` sağa ötelenir: (4,3)–(5,3) → (5,3)|(6,3) (sınırı
kesiyor, ray kipi) → (6,3)–(7,3); bırakılır → satır 3'te kalır. Aynı geçide `D2_0` (1×2, satır 3–4) giremez: satır 4
geçit dışında.

### K-13 Şantiyede serbest dikey hareket yoktur
**Kural:** Şantiyede duran (kilitli) bloklar hiçbir yönde hareket etmez. Şantiyeye blok yalnızca (a) üstten düşerek
(K-11) ya da (b) raydan (K-12) girer. Serbest kipteki blok açık gökyüzü koşulu nedeniyle bir çıkıntının (üstü dolu
hücrenin) altına yandan giremez; bunun tek yolları ray ve hafif yerçekimi yönlendirmesidir (G-L).
**Örnek:** (7,3)'te raydan konmuş blok var, (7,2) boş. Serbest kipteki `B1` (6,1)'e indirilmiş; sağa (7,1)'e öteleme
geçersizdir çünkü top(7)=4 > 1.

### K-14 Doğru yerleşen blok kilitlenir
**Kural:** Doğru yerleşen (K-16) blok kilitlenir; tutulamaz, Çekiç ve Boya Fırçası ile hedeflenemez, yerçekiminden
etkilenmez. Tek istisna Geri Al güçlendiricisidir (K-39).
**Örnek:** (6,0)'a doğru konmuş `D2_90` Y'ye dokunulur → tepki yok, hamle harcanmaz.

---

## 3. Plan ve doğrulama

### K-15 Plan bir renk haritasıdır
**Kural:** Her dilimin planı 2 sütun × `h` satırdır (1 ≤ h ≤ 8); `rows` yukarıdan aşağıya yazılır, her satır tam 2
karakterdir. Karakterler: renk kodu (`W Y G R O C B P`), `.` (boş kalmalı: pencere, kapı, kemer) ya da `?` (gizli,
K-32). Bir dilimin bütün `.` olmayan hücreleri doğru dolu olunca ve dilim alanında (2×8 sütun parçası) başka hiçbir
blok bulunmayınca dilim **tamamlanır**.
**Örnek:** `rows: ["YY","W.","WW"]` → (6,0)=W,(7,0)=W,(6,1)=W,(7,1)=`.`,(6,2)=Y,(7,2)=Y; 5 hücre doldurulur, (7,1) boş kalır.

### K-16 Doğru yerleşim
**Kural:** Yerleşim ancak şu üç koşulun hepsi sağlanırsa doğrudur: (1) bloğun **her** hücresi aktif dilimin plan
alanındadır ve o hücrenin plan rengi (gizliyse çözülmüş rengi) bloğun rengine eşittir; (2) blok moloz (S4) değildir;
(3) Alttan Üste kuralı (K-34) sağlanır. Blok sınırlarının plandaki bir parça çizgisiyle örtüşmesi gerekmez.
**Örnek:** Plan alt iki satırı `WW`,`WW`. `O4` W (6,0)'a iner → doğru. Bunun yerine iki `D2_0` W (6,0) ve (7,0) → ikisi
de doğru. `D2_0` Y (6,0) → (6,0) W ≠ Y → hatalı.

### K-17 Hatalı yerleşim ("kötü geçiş") ve geri sekme
**Kural:** K-16'nın herhangi bir koşulu bozulursa yerleşim hatalıdır: blok "hatalı" vurgusuyla parlar (görsel design-lead), sallanır (350 ms) ve geri
seker; hamle yanar (maliyet 1), Usta Serisi sıfırlanır. Geri sekme hedefi şu sırayla aranır:
1. Başlangıç konumunun bütün hücreleri boşsa oraya (kavisli animasyon). Sürükleme sırasında tahta donuk olduğundan
   (K-08) bu, saha ve moloz bloklarında her zaman sağlanır.
2. Değilse sahanın üstünden düşürme: aday sol sütunlar `xs = 0 … 6 − w` başlangıç `x`'ine uzaklığa göre sıralanır,
   eşitlikte duvara yakın (büyük x) önce; her aday için blok y = 10 − boy'dan saha yerçekimi ayarından bağımsız düşürülür;
   iniş konumunun bütün hücreleri y ≤ 7 ise hedef budur.
3. Hiçbiri olmazsa blok kamyon kuyruğunun **sonuna** girer (K-26).
İstisnalar: Harçlı blok (Y8) geri sekmez, iniş yerinde yapışır. Cam blok (S3) eşiği aştıysa önce kırılma uygulanır;
kırılan blok aynı hedef arama sırasıyla sahaya döner.
**Örnek:** `B1` Y başlangıç (3,7). Şantiyede W hücresine düşer → hatalı → (3,7) boş → oraya döner; kalan hamle 9 → 8.
Moloz bloğu başlangıcı şantiyede (7,0)–(7,1) ise ve başka bir hatalı yere bırakıldıysa (7,0)–(7,1)'e döner.

### K-18 Düşüş gölgesi
**Kural:** Serbest kipte blok şantiye sütunlarına değdiği sürece, bırakılırsa duracağı konum gölge olarak **her zaman
doğru** gösterilir: rüzgâr kayması (W8), balon yükselişi (S8), asansör ofseti dahil. Ray kipinde gölge, bloğun kendi
konumudur. Gölge, doğruluk bilgisini `verdict` (K-34 "Görünürlük kancaları") ile taşır:
- **Doğruluk** (doğru/hatalı ve nedeni): Kolay ve Normal bölümlerde gösterilir; Zor ve Çok Zor bölümlerde gölge yalnızca
  konumu gösterir (nötr). Gölge açılmamış bir `?` hücresine değiyorsa bütün zorluklarda doğruluk **nötr**dür (gizli
  bilgi sızmaz; doğru/hatalı sesi de çalmaz).
- **Fizik bilgisi** (cam kırılacak: çatlak simgesi; rüzgâr kayması, balon yükselişi ve asansör ofseti dahil konum):
  **bütün zorluklarda** ve nötr gölgede de gösterilir (K-21 okunabilirlik ilkesi).
- **Hafif yerçekimi:** gölge önce yönlendirmesiz inişi gösterir; yönlendirme (K-19) yapıldığı anda yeni inişi gösterir
  (eski konumdan yeniye geçiş animasyonu design-lead'in, JUICE #46 / UX §5.4).
Renk, desen ve rozetler design-lead'indir; oyuncuya görünen metinde renk adı geçmez (renk körlüğü, R-05/P-7).
**Örnek:** Kolay bölüm, `C3_0` W'nin inişinde (7,3) Y hücresine denk geliyor → gölge "hatalı (renk)". Aynı durum Zor
bölümde → gölge yalnızca konumu gösterir. Zor bölümde cam blok d=5 ile düşecek → gölge nötr ama çatlak simgesi var.

---

## 4. Yerçekimi

### K-19 Şantiye yerçekimi (`gravity.build`)
**Kural:** Bölüm parametresidir; değerler:

| Ayar | Şantiye üstünde tutma | Cam kırılma eşiği (d > eşik ⇒ kırılır) | Yönlendirme |
|---|---|---|---|
| `low` (G-L) | Sınırsız | 4 | Düşüş/yükseliş başına en çok 1 kez, 1 sütun (aşağıda) |
| `normal` | Sınırsız | 3 | Yok |
| `high` (G-H) | Serbest kipte bloğun bir hücresi şantiye sütununa değdiği andan `holdMs` sonra blok o anki konumda zorla bırakılır; şantiye sütunlarından tamamen çıkınca sayaç sıfırlanır. `holdMs` = 700; Ayarlar > Erişilebilirlik "Zaman baskısını azalt" açıksa 1400 (R-11) | 2 | Yok |

Bu kuraldaki `holdMs` G-H tutma süresidir (çekirdeğin yerçekimi profili, TECH_DESIGN); K-07'deki dokunma/sürükleme
eşiği `tokens.drag.holdMs` ile ilgisi yoktur.

**Düşüş hızı kural değildir:** görsel düşüş/yükseliş eğrisinin tek kaynağı `tokens.physics` (JUICE §0.1,
design-lead). İniş satırı, cam kırılması ve doğrulama hızdan bağımsızdır. Gerçek zaman yalnızca G-H tutma süresinde ve
G-L yönlendirme penceresinde vardır. Bot zorluk ölçümü `holdMs = 700` ile yapılır (1400 ayarı kolaylaştırıcıdır;
LEVELS hedef kazanma oranları 700'e göredir).

**G-L yönlendirme kuralı (R-10):**
1. **Pencere:** serbest kipte şantiyeye bırakılan bloğun düşüşü (ya da balonun yükselişi) görsel olarak sürerken açıktır;
   iniş satırına varış anı pencereye dahildir, iniş animasyonu bitince kapanır. Pencereyi erken kapatan olayların
   **tam listesi** (TECH §4.7 `flushPending`): (a) yeni bir blok tutma (R-12, E-40); (b) Geri Al (K-39; geri alınan,
   düşmekte olan bu hamledir); (c) güçlendirici yuvasına dokunma (Çekiç, Vinç, Boya Fırçası, Altın Mala); (d) duraklatma
   düğmesi, Android geri tuşu ya da çıkış menüsü (K-43 madde 1 istisnası, E-47); (e) uygulamanın arka plana gitmesi ya
   da kapanması (K-43 madde 3 kaydı); (f) sahne değişimi. Bu olaylardan biri gelince pencere kapanır, blok o ana
   kadarki durumuyla (yönlendirilmediyse yönlendirmesiz) hemen iner, hamle sonu çözümlemesi (K-35) biter, olay **ondan
   sonra** işlenir. Listede olmayan hiçbir olay pencereyi kapatmaz.
2. **Girdi (biçim design-lead'in):** pencere içinde tahtanın herhangi bir yerine **dokunma** (K-07 eşiği altında).
   Dokunuş noktası bloğun dikey orta çizgisinin solundaysa yön −1 (sol), sağındaysa +1 (sağ). Kaydırma (swipe) girdisi
   de aynı yönü verir (design-lead seçimi).
3. **Etki:** blok, dokunuş anındaki satırı `atRow`'da 1 sütun `yön` tarafına kayar; koşul: kaymış konumun bütün hücreleri
   x=6–7 içinde ve boş. Kayma bir çıkıntının (üstü dolu hücrenin) altına girebilir (K-13'ün izin verdiği yol). Kaydıktan
   sonra blok aynı yönde (düşüş ya da yükseliş) yeni sütun(lar)ında ilk desteğe/tavana kadar sürer.
4. **Hak:** düşüş/yükseliş başına en çok 1 yönlendirme. Koşul tutmazsa (kenar, dolu hücre, 2 genişlikli blok) hiçbir
   şey olmaz ve hak **harcanmaz**.
5. **Aynı hamle:** yönlendirme ayrı hamle değildir; hamle sayacını, `m`'yi, zamanlayıcıları değiştirmez. Cam için `d`
   bırakma satırı ile son iniş satırı arasındaki toplam düşüştür.
6. **Kayıt ve solver:** hamle kaydı `steer: { dir, atRow }` taşır; çekirdek sonucu yalnızca bu iki değerden hesaplar
   (görsel eğriden bağımsız). Solver yönlendirmeyi hamle parametresi olarak modeller: `atRow`, bırakma satırı ile
   yönlendirmesiz iniş satırı (ikisi de dahil) arasındaki herhangi bir satır olabilir. YAO'da yönlendirilmiş yerleşim
   "duvar üstü"dür.
**Örnek:** `low`. Sütun 6: (6,0)–(6,1) dolu. Sütun 7: (7,0)–(7,1) dolu, (7,2) plan `.` hücresi (boş), (7,3) dolu
(raydan konmuş doğru blok = çıkıntı; altındaki boş `.` K-34'te dolu sayıldığı için doğrudur). `B1` (6,8)'den bırakılır;
yönlendirmesiz iniş (6,2). Blok (6,5)'teyken oyuncu bloğun sağına dokunur → (7,5)'e kayar → sütun 7'de (7,4)'e iner
(çıkıntının üstü). Dokunuş blok (6,2)'ye vardığında gelirse (`atRow = 2`) → (7,2)'ye kayar ve çıkıntının altında
kalır; (7,2) `.` olduğu için yerleşim hatalıdır (`window`) ve blok geri seker — kural erişimi verir, doğruluğu K-16/K-34
belirler. Çıkıntının altına **doğru** yerleşim yalnızca çıkıntı yanlış bir nesneyse (moloz S4, yapışmış harçlı blok Y8)
mümkündür. Bloğun soluna dokunmak hiçbir şey yapmaz (sütun 5 şantiye dışı), hak harcanmaz.
**Örnek (G-H):** `high`, cam blok Vinç Alanı'nda (6,8)'de şantiyeye değdi; oyuncu 700 ms içinde (6,4)'e indiremedi,
blok (6,6)'da bırakıldı, iniş (6,2) → d=4 > 2 → kırılır.

### K-20 Saha yerçekimi (`gravity.yard`, varsayılan `false`)
**Kural:** `true` ise hamle sonu yerçekimi adımında (K-35 adım 6) altı boş kalan saha blokları düşer; bütün
desteksizler aynı anda 1'er satır iner, tekrar desteklenene kadar sürer (zincirleme). Destek: y=0 tabanı, Ahşap Kasa
(Y1) ya da desteklenen başka bir blok/torba. Balonlu bloklar (S8) bu adımda tavana doğru yükselir; düşen bloklarla
aynı turda karşılaşmaları K-35 adım 6'nın "yarım adım" kuralıyla çözülür (E-33). Zincirli ve ıslak
bloklar da düşer (yalnızca oyuncunun tutması yasaktır). Kasalar düşmez. Çimento Torbası (Y2) saha yerçekimi kapalıyken
de düşer. Kamyon teslimatındaki bloklar ayardan bağımsız olarak düşer (K-25); bu düşüş sahadaki diğer blokları
oynatmaz.
**Örnek:** `gravity.yard=true`; (2,0)–(2,1) `D2_0` alınıp şantiyeye konur. (2,2)–(3,2) `D2_90` ve üstündeki (2,3)
`B1` desteksiz kalır, ama (3,2)'nin altı (3,1) doluysa `D2_90` desteklidir → hiçbir şey düşmez. (3,1) boşsa ikisi
birlikte 2 satır iner: `D2_90` (2,0)–(3,0), `B1` (2,1).

### K-21 Blok bayrakları
**Kural:** Bir bloğun bayrakları: `glass` (S3), `balloon` (S8), `mortar` (Y8), `chained` (Y3), `wet` (Y4, `wetMoves`
ile), ve doğrulayıcının eklediği `debris` (S4). İzin verilen birleşimler ve yasaklar OBSTACLES.md etkileşim
matrisindedir; özetle: `debris` hiçbir başka bayrakla birleşmez; `glass`+`balloon` yasaktır; ağır bloklar (Y5) yalnızca
`chained` ve `wet` alabilir.
**Örnek:** `{ "shape":"B1_0","color":"B","flags":["glass","chained"] }` geçerli. `["glass","balloon"]` → hata
`flag_combo_forbidden`.

**Düşme bir engeldir (tasarım ilkesi):** Yanlış sütuna düşüş, pencere boşluğuna düşüş, cam kırılması, rüzgâr sapması,
ağır yerçekiminde zaman baskısı ve saha yerçekiminde istenmeyen zincirleme kaymalar bölüm tasarımında bilinçli
kullanılır; her biri gölge ya da görünür bir göstergeyle önceden okunabilir olmalıdır.

### K-34 Alttan Üste (destek) kuralı — YENİ (öneri P-1)
**Kural:** Şantiyede bir yerleşimin doğru sayılması için, bloğun kapladığı her sütun `c` ve o sütundaki en alt hücre
satırı `r` için, plan satırları `0 … r−1` içindeki `.` olmayan her hücre doğru dolu olmalıdır. Yani yapı her sütunda
alttan üste kurulur; bir bloğun altında doldurulması gereken boş hücre (gömülü delik) bırakılamaz. `.` hücreleri bu
kuralda **yalnızca boşken** "dolu sayılır". Kural ray yerleşimi, balon, Vinç güçlendiricisi ve Altın Mala için de
geçerlidir. Moloz ya da yapışmış harçlı blok (yanlış bloklar) "doğru dolu" değildir; üstlerine doğru yerleşim yapılamaz.
Bu, yanlış nesnenin bir `.` hücresinde durduğu durumu da kapsar: `.` hücresinde moloz ya da yapışmış harçlı blok varsa o
hücre "dolu" sayılmaz; o sütunda bu hücrenin üstüne düşen her yerleşim `support` nedeniyle hatalıdır ve nesne
kaldırılana kadar o sütunda inşa cephesi (kanca 1) yoktur (E-43). Nedeni: aksi halde `.` içindeki harcın üstü doğru
blokla kapanır, harç tutulamaz hale gelir ve dilim K-15 gereği hiç tamamlanamazdı (D1/D2/D3'ün yakalamadığı kilit).
**Gerekçe:** Brif K-16 "doğru blok = doğru renk + kalan boşluğa uyan şekil" der; açık gökyüzü kuralı (K-13) yüzünden
gömülü bir delik bir daha doldurulamaz ve bölüm sessizce çözümsüz kalırdı. Bu kural kilitlenmeyi kaynağında önler ve
gölge rengiyle (K-18) öğretilir.
**Örnek 1:** Plan `["WW","WW","WW","WW"]` (h=4), şantiyede yalnızca (6,0)–(6,1)'de doğru `D2_0` W var. `O4` W
bırakılır → top(6)=2, top(7)=0 → iniş (6,2): dört hücre de W (K-16 koşul 1 sağlanır) ama sütun 7'de r=2 ve (7,0),(7,1)
boş → K-34 bozulur → hatalı, gölge "hatalı (destek)". Doğru hamle: önce bir `D2_0` W'yi sütun 7'ye bırakmak.
**Örnek 2:** Plan (alttan) y0 `WW`, y1 `W.`, y2 `WW`. (6,0)–(7,0) ve (6,1) dolu. `D2_90` W rayla (6,2)–(7,2)'ye girer:
sütun 7'de r=2, satır 1 boş `.` (dolu sayılır), satır 0 dolu → doğru.
**Durum:** KABUL (R-01; proje sahibine onay için sunulur). Kural test edilebilir kalır; aşağıdaki kancalar yalnızca
oyuncunun kuralı **görmesi** içindir, sonucu değiştirmez.

**Görünürlük kancaları (çekirdek bunları üretir, sunum design-lead'in):**
1. **İnşa cephesi** `buildFront(state)`: aktif dilimin her sütunu `c` için, boş, `.` olmayan ve altındaki bütün plan
   hücreleri doğru dolu ya da **boş** `.` olan **en alt** plan hücresi (sütun tamamsa ya da altında yanlış nesne varsa
   yok). Altın Mala'nın seçilebilir hücreleri (K-33) bu kümeyle aynıdır (`eligibleTrowelCells` = `buildFront`). Bütün
   zorluklarda gösterilebilir (renk bilgisi değil, yapı sırası bilgisi).
2. **Gölge kararı** `verdict = { ok, reasons[], missingSupport[] }`: `reasons` şu sabit sırayla dolar: `debris` (S4),
   `outside` (plan alanı dışı), `window` (`.` hücresi), `color` (renk ya da çözülmüş `?` rengi), `support` (K-34).
   **Birincil neden** = ilk eleman. `missingSupport` = K-34'ü bozan plan hücreleri: doğru dolu olmayan `.` olmayan
   hücreler ve içinde yanlış nesne bulunan `.` hücreleri (sütun, satır sıralı).
   `support` nedeni gizli bilgi taşımadığı için gölge nötr olduğunda (Zor, `?`) da gösterilebilir.
3. **Geri sekme olayı** `bounce { pieceId, reason, missingSupport[] }`: K-17 geri sekmesinde birincil neden ve eksik
   destek hücreleri olayla birlikte yayınlanır (sekme sonrası vurgu bütün zorluklarda).
4. **İlk karşılaşma:** oyuncunun hesabında ilk kez `reason = support` olan bir geri sekme (ya da harç yapışması) olunca
   bağlamsal öğretici `tut.ctx.support` bir kez tetiklenir (metin STORY §6) — **ancak** `seenContextTips.support` henüz
   işaretli değilse. Bölüm 4'ün 2. öğretici adımı aynı satırı (`textKey` = `tut.ctx.support`) yumuşak adım olarak
   gösterir; adım gösterildiği anda `seenContextTips.support` işaretlenir ve bağlamsal tetik bir daha çıkmaz (genel
   kural §14.1 madde 2; sunum UX §5.5). Sonuç: bağlamsal satır yalnızca Bölüm 4'ten **önce** bir `support` reddi
   yaşayan oyuncuda (ör. Bölüm 3'te `f` temelden önce raya) bağlamsal olarak çıkar; diğer herkes onu Bölüm 4 adım 2'de
   görür. Bölüm 4'ten sonraki `support` redlerinde Dede satırı çıkmaz; neden gösterimi (kanca 2–3) her zaman sürer.
**Örnek 3 (kanca):** Örnek 1 durumunda `verdict = { ok: false, reasons: ["support"], missingSupport: [(7,0),(7,1)] }`;
`buildFront = {(6,2), (7,0)}`.

---

## 5. Hareketli şantiye

Şantiye modu `build.mode` ile seçilir: `segments` (S1, varsayılan) ya da `carousel` (S5). Asansör (S6) moddan bağımsız
bir eklentidir: `build.elevator` alanı varsa her iki modla birlikte çalışır (Bölüm 40'ta döner platform + asansör;
TECH_DESIGN S-16 ve code-lead'in önerisiyle uyumlu; bkz. öneri P-4).

### K-22 `segments` — Kayan Şantiye (S1)
**Kural:** Plan S dilimden oluşur (1 ≤ S ≤ 5; her dilim 2 sütun × en çok 8 satır). Bir anda yalnızca aktif dilim
şantiyededir. Aktif dilim tamamlanınca (K-15) hamle sonu adım 8'de: iskele söner, yapı parlar, şantiye sola kayar
(600 ms), tamamlanan dilim (üstündeki kilitli bloklarla) panoramaya eklenir, sıradaki dilim boş olarak gelir ve onun
partisi kamyonla teslim edilir (K-25). Son dilim tamamlanınca kayma yerine kazanma kontrolüne geçilir.
**Örnek:** Bölüm 5, dilim 1 (Sol Oda) son bloğu 6. hamlede doğru yerleşir → aynı hamle sonunda dilim 2 (Sağ Oda) gelir,
parti 1 sahaya düşer; 7. hamle dilim 2'de oynanır.

### K-23 `carousel` — Döner Platform (S5)
**Kural:** Bütün dilimler aynı anda vardır ve durumlarını korur; şantiyede yalnızca **öndeki** dilim gösterilir ve
oyuncu ona yerleştirir. Bölüm başında ön dilim 0'dır; dönüş sayacı `t = 0`. Her hamle sonunda (adım 10) `t` 1 artar;
`t = carouselEvery` olunca ön dilim, sıradaki (dairesel artan indeks) **tamamlanmamış** dilime geçer ve `t = 0` olur.
Ön dilim tamamlanırsa (adım 8) dönüş hemen o hamlede yapılır ve `t = 0` olur; **ön dilimin tamamlandığı hamlenin
adım 10'unda `t` artmaz** (0 kalır) ve ikinci kez dönülmez; sayım bir sonraki hamlenin adım 10'unda 1'den başlar.
Ön dilim Altın Mala, Vinç ya da Boya Fırçası ile tamamlanırsa (E-09) mini hat adım 8'de aynı dönüşü yapar ve `t = 0`
olur; mini hat adım 10'u çalıştırmadığından `t` bu eylemde artmaz. Partiler: parti 0 bölüm başında sahadadır; `k`'inci dilim tamamlandığında (hangi dilim olduğundan bağımsız)
`forSegment = k` olan parti teslim edilir. Bütün dilimler tamamlanınca bölüm kazanılır (ek hedefler de tamamsa).
`carouselEvery` 2–6 arasıdır.
**Örnek:** 3 dilim, `carouselEvery = 4`. Hamle 1–4 ön dilim 0; 4. hamle sonunda ön dilim 1. Dilim 1, 6. hamlede
tamamlanırsa ön dilim hemen 2 olur, `t=0` (6. hamlenin adım 10'unda artmaz); 7., 8., 9., 10. hamle sonlarında
`t` = 1, 2, 3, 4 → 10. hamle sonunda ön dilim 0'a döner (dilim 1 atlanır).

### K-24 `elevator` — Asansör İskele (S6)
**Kural:** `build.elevator = { range: [a, b], start, dir }` (0 ≤ a < b ≤ 3, a ≤ start ≤ b, dir ∈ {+1, −1}). Şantiye
çerçevesinin ofseti `e` başta `start`'tır. Her hamle sonunda (adım 10) şu iki iş bu sırayla yapılır: (1) `e + dir`
aralığın dışındaysa (`< a` ya da `> b`) önce yön döner (`dir = −dir`); (2) `e += dir` (ping-pong). Böylece `e` sınıra
ulaştıktan sonraki hamlede geri döner; `e` başta sınırdaysa ve `dir` dışarı bakıyorsa (`start = b, dir = +1` ya da
`start = a, dir = −1`; geçerli veri) ilk hamlede önce yön döner, `e` hiçbir zaman aralığın dışına çıkmaz ve
`h + b ≤ 8` güvencesi korunur. Plan satırı `r` tahta satırı `r + e`'dedir; `y < e` şantiye hücreleri platformdur
(dolu, destek). Şantiyedeki bütün bloklar çerçeveyle birlikte hareket eder. Duvar ve geçitler tahtaya sabittir; bu
yüzden bir geçidin açıldığı plan satırı `g.y − e`'dir. Doğrulayıcı: her dilim için `h + b ≤ 8`.
**Örnek:** `range [0,2]`, `start 0`, `dir +1` → hamle sonları: e = 1, 2, 1, 0, 1 … Geçit tahta satırı 3'te; e=0 iken plan
satırı 3'e, e=2 iken plan satırı 1'e açılır. Sınırda dışarı bakan başlangıç: `range [0,2]`, `start 2`, `dir +1` → 1.
hamle sonunda önce `dir = −1`, sonra e = 1; devamı e = 0, 1, 2, 1 … (test "K-24 start at bound facing out turns first").

---

## 6. Malzeme teslimatı

### K-25 Partiler ve kamyon dökümü
**Kural:** `yard.batches[k]` k'inci partidir. Parti 0'ın blokları bölüm başında kendi `(x, y)` konumlarındadır.
Parti k ≥ 1 teslim edildiğinde (K-35 adım 8) blokları dizideki sırayla **kamyon kuyruğunun sonuna** eklenir; teslim
**aynı hamlenin 9. adımında**, kuyruktaki eski bloklardan sonra denenir (K-26; tek deneme noktası adım 9'dur; tek
yazılı istisna K-30 D2 yardım teslimatıdır, adım 12). Bir
bloğun teslimi: aday sol sütun sırası (öncelik listesi, son aşama hiçbir zaman atlanmaz):
1. bloğun `x`'i;
2. varsa `dropColumns` listesindeki sütunlar, listedeki sırayla (1. aşamada denenenler atlanır);
3. kalan bütün geçerli sol sütunlar (`0 … 6 − w`), `x`'e uzaklık sırasıyla, eşitlikte duvara yakın (büyük x) önce.
Her adayda blok y = 10 − boy'dan **yerçekimi ayarından bağımsız** düşürülür ve ilk desteğe oturur; bütün hücreleri
y ≤ 7 olan ilk aday seçilir (E-34). Parti k ≥ 1 bloklarındaki `y` yok sayılır (veride 8 yazılır). Teslimat düşüşü
sahadaki diğer blokları oynatmaz, komşu etkisi (kasa, torba, zincir) üretmez. Balonlu blok da diğerleri gibi düşüp
oturur, teslimatta yükselmez (E-36).
**Örnek:** Parti 1: `[O4 G x=4, B1 R x=0]`. Sütun 4–5'in en üst dolu hücresi y=3 → `O4` (4,4)'e iner. Sütun 0 tamamen
dolu → `B1` için sırayla x=1 (uzaklık 1), x=2 … denenir; x=1'de y=6 boş → (1,6)'ya iner.

### K-26 Kuyruk
**Kural:** Yer bulamayan blok kuyrukta kalır. Hamle sonu adım 9'da kuyruktaki her blok sırayla (FIFO) bir kez denenir;
yerleşemeyen blok sonrakileri bekletmez. Arayüz "Kamyonda: N blok" gösterir (N = kuyruktaki blok sayısı; N=0 iken
gösterge gizli). Kuyruktaki bloklar tutulamaz, Çekiç'le hedeflenemez.
**Örnek:** Kuyrukta `[O4 W, B1 Y]`; sahada yalnızca (5,7) boş → `O4` sığmaz, kalır; `B1` (5,7)'ye iner; gösterge "1 blok".

### K-27 Parti içeriği
**Kural:** Her parti, o dilimi bitirmeye yetecek doğru blokları ve şaşırtmacaları (decoy) içerir. Doğrulayıcı her
renk için "o dilimin renk hücresi sayısı ≤ o ana kadar teslim edilmiş ve henüz kullanılmamış o renkteki ağır olmayan,
**moloz olmayan** blokların hücre toplamı" koşulunu solver çözümü üzerinde denetler (moloz hiçbir yerde doğru olamaz,
K-16 koşul 2; sahaya taşınmış moloz arz değildir); solver en az bir çözümün varlığını kanıtlar.
**Örnek:** Dilim 2'de 6 W hücresi var; parti 1'de W blokları `O4`+`D2_0` (6 hücre) + şaşırtma `C3` W (3) → geçerli.

---

## 7. Hamle, kazanma, kaybetme

### K-28 Kazanma
**Kural:** Hamle sonu adım 11'de bütün dilimler tamamlanmış ve bütün ek hedefler (K-41) karşılanmışsa bölüm kazanılır;
bu kontrol hamle sayacı 0 olsa bile kaybetmeden önce yapılır. Kalan her hamle "Bonus İnşaat" gösterisinde altına
dönüşür; elde kalan Altın Mala'lar da altına dönüşür (miktarlar META.md, `config/economy.json`).
**Örnek:** Son hamlede (kalan 0) son dilim tamamlanır → kazanma; bonus 0 hamle.

### K-29 Kaybetme ve +5 hamle teklifi
**Kural:** Adım 11'de hamle sayacı 0 ve bölüm kazanılmamışsa "Hamleler bitti!" penceresi açılır. Pencere, bu denemenin
`n`'inci teklifidir (`n` = 1, 2, 3; deneme = bölüm başından kazanma/kayıp/çıkışa kadar, K-43 devamı aynı denemedir):
- **Altın seçeneği:** +5 hamle, fiyat `offerCosts[n−1]` = 900 / 1.350 / 1.800 (META §3.2).
- **Reklam seçeneği:** +5 hamle; **yalnızca teklif `n = 1`'de** sunulur (dolayısıyla deneme başına en çok 1), günde en
  çok 3 (ve günlük toplam reklam tavanı) — META §3.3, entrepreneur kararı (BUSINESS §4.3, P-4). 2. ve 3. teklifte reklam
  seçeneği yoktur. Ömrün ilk (ücretsiz) teklifinde de reklam seçeneği gösterilmez (UX §7).
- Hangisi kabul edilirse edilsin teklif `n`'e sayılır (R-15). 3 teklif kullanılmışsa pencere teklif içermez, doğrudan
  sonuç (kayıp) gösterilir.
- Oyuncunun ömründeki **ilk** teklif penceresinde altın seçeneğinin fiyatı 0'dır ("Usta Dede'den hediye"); teklif 1'e
  sayılır (META §3.2).
- Sallanan Köprü'de altın seçeneği yalnızca tur harcaması + fiyat ≤ 4.050 ise etkindir (META §6.1); reklam seçeneği bu
  tavandan bağımsızdır (yine yalnız `n = 1`). Tavan doluyken 2. ve 3. teklifte kabul edilebilir seçenek kalmaz; pencerede
  yalnız ret seçeneği kullanılabilir (sunum UX §7).
- Sunum ilkeleri (R-15; design-lead uygular): eşit boy düğmeler, altının gerçek para karşılığı, eskalasyon ve kalan
  teklif sayısı görünür, baskı metni yok, seri kaybı bu pencerede yazılmaz (META §5).
Kabul edilirse sayaç 5 olur ve oyun aynı durumdan sürer (zamanlayıcılar, `m` ve Usta Serisi değişmez); ardından
**K-35 adım 12 (kilitlenme denetimi ve Kamyon Yardımı, K-30) bir kez çalışır**. Gerekçe: son hamle bir kilit (ör. D1)
üretip sayacı 0 yaptıysa adım 12 o hamlede atlanmıştır (sayaç 0); teklif sonrası denetim olmazsa oyuncu +5'i ödeyip
hiçbir bloğa dokunamazdı (E-42). Reddedilirse bölüm kaybedilir: 1 can gider, galibiyet serisi sıfırlanır, Sallanan
Köprü'deyse oyuncu elenir.
**Örnek:** Kalan 0, plan %90 dolu; teklif 1'de oyuncu reklam izler → kalan 5. Yine biter → teklif 2: altın 1.350, reklam
seçeneği yok (reklam yalnız 1. teklifte). Reddeder → kayıp.

### K-30 Kilitlenme ve Kamyon Yardımı
**Kural:** Adım 12'de, bölüm sürüyorsa (kazanılmamış, sayaç > 0) şu kilitlenmeler aranır:
- **D1 Hamle yok:** hiçbir blok K-09'a göre tutulamıyor.
- **D2 Malzeme açığı:** bir renk `c` için, kalan bütün dilimlerdeki boş `c` hücre sayısı > sahadaki + şantiyede
  yapışmış harçlı + kuyruktaki + teslim edilmemiş partilerdeki ağır olmayan `c` blokların hücre toplamı (bölümde `c`
  renkli Boya Kapısı varsa, o kapıdan geçebilen her ağır olmayan blok `c` sayılır). **Moloz bayraklı bloklar (S4) hiçbir
  terimde sayılmaz** — sahaya taşınmış moloz da, boya kapısından geçip `c` olan moloz da (moloz hiçbir yerde doğru
  olamaz, K-16 koşul 2; E-44).
- **D3 Döşeme/erişim (code-lead yöntemi):** solver kalan planın bu durumdan çözülemeyeceğini belirlenimci düğüm
  bütçesi içinde kanıtlarsa (sayı TECH §9.7, cihaz hızından bağımsız; bütçe biterse "kilit yok" sayılır). MVP'de D1
  ve D2 zorunlu, D3 isteğe bağlıdır. D3'ün isteğe bağlı kalabilmesinin koşulu bölüm tasarımıdır: Kolay ve Normal
  bölümlerde gölgenin ✓ gösterdiği hiçbir yerleşim D1/D2'nin yakalamadığı kesin çıkmaza götürmez (LEVELS §5 kontrol
  listesi; solver denetimi, Bölüm 1–6 betikle doğrulandı).
Tespit edilirse ücretsiz, hamle harcamayan **Kamyon Yardımı** çalışır: D1 → bütün zincirler ve ıslaklık kalkar;
hâlâ D1 ise saha yeniden dizilir. D2 → eksik hücre sayısı kadar o renkte `B1` kamyonla teslim edilir (K-25 yolu).
D3 → saha blokları, renk başına hücre toplamı korunarak yeniden şekillendirilip dizilir (TECH_DESIGN §9.7, S-19).
Denetim ve yardım sırası D1 → D2 → D3'tür; aynı adımda birden fazlası tutarsa yardımlar bu sırayla uygulanır, güvence
denetimi en sonda bir kez yapılır.
**D2 teslimatının zamanı ve sütunu (K-25 istisnası):** Yardım `B1`'leri adım 12'de kamyon kuyruğunun sonuna eklenir ve
**aynı adımda bir kez** K-25 aday sırasıyla teslim edilmeye çalışılır; bu, K-25 "tek deneme noktası adım 9" kuralının
tek yazılı istisnasıdır. Bu denemede yalnızca yardım `B1`'leri denenir (kuyruktaki eski bloklar sonraki hamlenin 9.
adımını bekler). Her yardım `B1`'inin `x`'i **5**'tir (duvara en yakın saha sütunu; K-25 aşama 1), `dropColumns` yoktur;
birden çok `B1` dizideki sırayla tek tek düşer: ilki sütun 5'e, sütun 5 y=7'ye kadar dolunca sonrakiler aşama 3 sırasıyla
(4, 3, 2 …). Yer bulamayan `B1` kuyrukta kalır ve sonraki hamlelerin 9. adımında FIFO ile denenir (E-23).
**Güvence (sonuç denetimi):** yardımdan (ve bu teslimattan) sonraki durumda 1 hamlelik doğru yerleşim varsa yeterlidir;
yoksa belirlenimci iş bütçeli (≈ 20 ms; sayı TECH §9.7, cihaz hızından bağımsız) 2 hamle denetimi yapılır; o da
bulamazsa yardım D3 yeniden şekillendirmesine yükselir (D3 yapıcı karıştırma doğru yerleşimi inşa yoluyla garanti
eder). Bütçeler cihaz saatine değil iş sayısına bağlı olduğundan aynı durum her cihazda aynı yardımı üretir (K-43
devamı bit bit aynı); bütçe sayısını değiştirmek `rulesVersion`'ı artırır (K-43 madde 4). 1 ve 2 hamle denetimleri
tam hamle hattıyla simüle edilir: kuyrukta kalan yardım `B1`'leri denetimde 1. hamlenin 9. adımında teslim edilir (yer
açan bir hamle + `B1`'in yerleşimi 2 hamle denetimini karşılar). Yardımın sayısı sınırsızdır. D2'nin `B1` teslimatı kalır: boya kapısıyla rengi bilerek
bozmak hamle kaybettirir (eksik her hücre için en az 1 hamle), bu yüzden istismar değildir.
**Örnek:** Oyuncu Çekiç'le son `O4` R'yi kırdı; kalan planda 4 R hücresi, sahada R blok yok → D2 → kamyon 4 `B1` R getirir
(adım 12'de hemen: sütun 5'te en üst dolu hücre y=4 ise `B1`'ler (5,5), (5,6), (5,7)'ye, dördüncüsü sütun 4'ün
tepesine iner).

---

## 8. Örüntü mekanikleri

### K-31 Renk örüntüsü
**Kural:** Her dilim okunabilir bir desene dayanır: şerit (yatay bantlar), çapraz şerit (C3 çiftleri), dama, kemer
(`.` hücreleriyle), simetri ya da basit ikon. LEVELS.md her dilimin desen adını yazar; desen incelemesi product-lead
kontrol listesidir. Kodla test edilen kısım: bölümün **renk kümesi** hikaye bölümü sınırını aşmaz (bölüm 1 → 3,
bölüm 2 → 4, bölüm 3–5 → 5) ve yalnızca o bölüme kadar açılmış renkleri içerir (brif §6). Renk kümesi = bütün dilimlerin
plan hücreleri (`?` hücrelerinin çözülmüş renkleri dahil) ∪ bölümdeki bütün blokların renkleri (parti 0, bütün kamyon
partileri, moloz; şaşırtma ve dolgu dahil) ∪ Boya Kapısı (W6) geçitlerinin `color` değerleri (LEVELS §0 ile aynı;
TECH L-06/L-07).
**Örnek:** Bölüm 12 (hikaye bölümü 2) planında W, Y, O, C, R → 5 renk → hata `too_many_colors`. Bölüm 5 (sınır 3): plan
G/R/W, bloklar G/R/W → 3 renk, geçerli; sahaya bir Y şaşırtma eklenirse plan hâlâ 3 renk olsa da küme 4 renk olur →
`too_many_colors`. Bölüm 22'de boya kapısı rengi P kümeye girer (B, P, Y, R → 4).

### K-32 Gizli plan (`?`)
**Kural:** `?` hücresinin rengi gösterilmez; dilimin `hidden` kuralından çözülür:
- `repeat` (`period = p`, 1 ≤ p ≤ 4): `?` hücresi (c, r)'nin rengi aynı dilimde (c, r − p) hücresinin rengidir; o da `?`
  ise zincirle çözülür. Doğrulayıcı: her dilimin alt `p` satırında `?` yoktur.
- `mirrorOf` (`segment = j`): `?` hücresi (c, r)'nin rengi j dilimindeki (1 − c, r) hücresinin rengidir (sütunlar yer
  değiştirir). Doğrulayıcı: j dilimi aynı yükseklikte ve `?` içermez; j < bu dilimin indeksi.
`.` hücresi hiçbir zaman gizli değildir. Gizli hücreye konan bloğun rengi çözülmüş renkten farklıysa hatalı yerleşimdir
(K-17). Doğru dolan `?` hücresi açılır, rengini gösterir ve panoramada da açılır.
**Örnek:** `repeat p=2`, dilim `["??","??","YW","WY"]` (alttan: y0 `WY`, y1 `YW`) → y2 = y0 = `WY`, y3 = y1 = `YW`.
`mirrorOf 0`: dilim 0 alttan y0 `RW` → dilim 1 y0 = `WR`.

---

## 9. Hedefler

### K-41 Hedef tipleri ve sayım — YENİ
**Kural:** `goals` her zaman bir `build` içerir. Ek hedefler:
- `clear` / `crate`: bir kasa canı 0'a indiğinde 1 sayılır (kat kırmak sayılmaz).
- `clear` / `chain`: bir zincir kalktığında (komşu hareketi, Çekiç ya da Kamyon Yardımı) 1 sayılır.
- `clear` / `debris`: bir moloz bloğu şantiyeden sahaya yerleştirildiğinde ya da Çekiç'le kırıldığında 1 sayılır.
- `collect` / `screw`: bir Altın Vida toplandığında (K-42) 1 sayılır.
Sayaç hedefi aşınca hedef "tamam" kalır; fazlası sayılmaz. Hedef paneli her hedef için `değer/hedef` gösterir.
Doğrulayıcı: `count` ≤ bölümdeki ilgili nesne sayısı.
**Örnek:** `{type:"clear", target:"crate", count:6}`; 3 kasa 2 katlı, 3 kasa 1 katlı. 4 kasa yok edildi → "4/6".

### K-42 Saklı nesnelerin toplanması — YENİ
**Kural:** Anahtar (W7) ve Altın Vida (Y7) bir saha hücresinin zemininde saklıdır; bölüm başında o hücre bir blokla ya
da kasayla örtülüdür (doğrulayıcı). "Saklı" = **örtülü ama konumu her zaman görünür**: örten bloğun/kasanın o hücresinde
işaret gösterilir (sunum design-lead'in; adalet ilkesi — gizli bilgi yalnızca `?` ile verilir). Hamle sonunda adım 5 (taşıma ve komşu etkilerinden sonra) ve adım 6'dan (saha
yerçekimi) sonra, hücresi **boş** olan her saklı nesne toplanır; hücre bu iki denetim arasında yeniden örtülse bile
ilk denetimde toplanmış olur. Kasa altındaki nesne kasa yok olunca toplanır. Güçlendirici (Çekiç, Vinç) ile açılan
hücre de aynı güçlendirici adımının sonunda toplanır.
**Örnek:** Vida (3,2)'nin altında; (3,2)–(3,3) `D2_0` alınıp şantiyeye konur → adım 5'te (3,2) boş → vida toplanır;
adım 6'da (3,4)'teki blok (3,2)'ye düşse bile vida sayılmıştır.

---

## 10. Güçlendiriciler ve kombo

Genel: Güçlendiriciler **hamle harcamaz**, `m`'yi artırmaz, zamanlayıcıları ilerletmez, Usta Serisi'ni değiştirmez
ve YAO'ya sayılmaz. Uygulanınca "mini hat" çalışır: K-35 adım 5 (saklı nesne), 6, 7, 8, 9, 11, 12. Geçersiz hedefe
dokunulursa güçlendirici harcanmaz. Açılış bölümleri ve ücretsiz denemeler META.md'dedir. Oyuncu blokları kendisi
döndüremez; yalnızca Vinç döndürür.

### K-33 Usta Serisi ve Altın Mala
**Kural:** Seri sayacı `c` bölüm başında 0'dır. Her doğru yerleşimde (sürükleme hamlesiyle) `c += 1`; `c = 4` olunca
oyuncu 1 Altın Mala kazanır ve `c = 0` olur. Hatalı yerleşim (geri sekme, harç yapışması) ve cam kırılması `c = 0`
yapar. Saha hamleleri, güçlendiriciler ve Altın Mala kullanımı `c`'yi değiştirmez; Geri Al `c`'yi hamle öncesi değerine
döndürür. Altın Mala kullanımı (K-34 kısıtı öneri P-1'in parçası): oyuncu malaya, sonra aktif (öndeki) dilimde **K-34'ü sağlayan** boş, `.` olmayan bir
plan hücresine dokunur; hücre doğru renkle dolar ve kilitlenir (`?` ise açılır). "Destek gerektirmez" şu demektir:
fiziksel taşıyıcı gerekmez, `.` üstündeki hücre de doldurulabilir; ama altında boş renkli hücre bırakılamaz (K-34).
Altın Mala bölümler arasında taşınmaz; kazanınca kalanlar altına dönüşür (K-28), kaybedince yok olur.
**Örnek:** Sırasıyla doğru, doğru, saha hamlesi, doğru, doğru → 4. doğru yerleşimde +1 mala, c=0. Doğru, doğru,
hatalı → c=0. Plan sütun 7: y0 W dolu, y1 `.`, y2 W boş → mala (7,2)'yi doldurabilir; (7,3) boş ve (7,2) boşken (7,3)
seçilemez.

### K-36 Çekiç — YENİ (brif §4.10 tanımının ayrıntısı)
**Kural:** Hedef ve etkisi: saha bloğu (ağır, cam, balon, ıslak dahil) → blok yok olur; zincirli blok → yalnızca zincir
kalkar (zincir hedefi sayılır); Ahşap Kasa → bütün katlarıyla yok olur (sayılır); Çimento Torbası → yırtılır; moloz →
yok olur (sayılır); şantiyede yapışmış harçlı blok → yok olur. Hedeflenemez: kilitli bloklar, kuyruktaki bloklar,
duvar ve geçitler, saklı nesne hücreleri (boşken). Yok olan blok malzemesi geri gelmez; açık oluşursa K-30 D2 devreye
girer.
**Örnek:** Çapası (0,6) olan `I5_0` (ağır, (0,6)…(4,6)) Çekiç'le kırılır → beş hücre boşalır; saha yerçekimi açıksa
mini hatta (1,7)'deki `B1` (1,6)'ya, oradan altındaki ilk desteğe düşer.

### K-37 Vinç (güçlendirici) — YENİ
**Kural:** Kilitli olmayan, zincirsiz, ıslak olmayan herhangi bir saha bloğu, moloz ya da yapışmış harçlı blok seçilir
(gömülü olsa bile; yol kuralı yok sayılır). Oyuncu bloğu 90°'lik adımlarla saat yönünde döndürebilir. Hedef:
(a) sahada bütün hücreleri boş ve y ≤ 7 olan herhangi bir konum ya da (b) şantiyede K-16'ya (K-34 dahil) göre **doğru**
olan bir konum. Vinçle şantiyeye konan blok düşmez, rüzgâr ve cam kuralları uygulanmaz; doğru yerleşim olarak kilitlenir
ama Usta Serisi'ne ve YAO'ya sayılmaz. I5 ve Q9 döndürülse de ağırdır ve şantiyeye konamaz; diğer ağır bloklar
genişliği ≤ 2 olan bir yönelime döndürülürse şantiyeye konabilir. Geçersiz hedef = işlem yapılmaz, güçlendirici
harcanmaz.
**Örnek:** Sahada gömülü `L4_90` W (ağır, 3×2) Vinçle seçilir, 90° döndürülür → `L4_180` (2×3) → şantiyede doğru
konuma konur.

### K-38 Boya Fırçası — YENİ
**Kural:** Kilitli olmayan bir saha bloğu ya da şantiyede yapışmış harçlı blok seçilir ve bölümün planlarında geçen
renklerden biri seçilir; bloğun rengi değişir, bayrakları korunur. Moloz boyanamaz. Yapışmış harçlı blok yeni renkle
bulunduğu yerde K-16'yı sağlıyorsa hemen kilitlenir (doğru yerleşim sayılır; seriye sayılmaz).
**Örnek:** Sahada `O4` Y, plan renkleri W/Y/R → R'ye boyanır → `O4` R.

### K-39 Geri Al — YENİ (K-14 istisnası)
**Kural:** Son eylem bir sürükleme hamlesiyse (aradan güçlendirici ya da +5 teklifi geçmemişse) o hamle tamamen geri
alınır: blok konumları ve renkleri, hamle sayacı (cam cezası ve harç maliyeti dahil), `m`, zamanlayıcılar,
seri sayacı, kazanılan Altın Mala, teslimatlar ve kuyruk, dilim geçişi, kırılan kasa katları, toplanan nesneler, hedef
sayaçları. O hamlenin 12. adımında tetiklenen **Kamyon Yardımı da hamleyle birlikte** geri alınır (hamle öncesi
anlık görüntüye dönülür; gerekirse yardım bir sonraki hamle sonunda yeniden çalışır; E-37). Derinlik 1'dir: Geri
Al'dan sonra yeni bir hamle yapılmadan ikinci Geri Al kullanılamaz. Kayıp penceresi açıkken kullanılamaz.
**Örnek:** Hamle 7'de bir blok hatalı yerleşti ve geri sekti (kalan 9 → 8, c=3 → 0). Geri Al → kalan 9, c=3, blok
hamle öncesi konumunda.

### K-40 Oyun öncesi güçlendiriciler ve başlangıç bonusları — YENİ
**Kural:** Bölüm öncesi pencerede seçilen güçlendiriciler bölüm başlarken harcanır:
- **Termos:** hamle sayacı +3.
- **Mala Başlangıcı:** +1 Altın Mala.
- **Açık Kepenk:** `m = 0 … 4` (ilk 5 hamle) boyunca bütün Kepenk (W4) ve Kilitli (W7) geçitleri açık sayılır; Kayar
  Kapı (W5) kaymaya, Boya Kapısı (W6) boyamaya devam eder. 5. hamlenin adım 10'undan sonra geçitler kendi kurallarına
  döner. Bölümde W4 ya da W7 yoksa bu yuva seçilemez (gri, "Bu bölümde kepenk yok").
Galibiyet serisi bonusu (META.md) aynı anda uygulanır ve güçlendiricilerle toplanır. Oyuncu ilk hamleden önce bölümden
çıkarsa harcanan güçlendiriciler iade edilir (K-43).
**Örnek:** Termos + seri kademe 2 (+2 hamle, +1 mala) → bölüm 20 hamle yerine 25 hamle ve 1 malayla başlar.

---

## 11. Bölüm akışı, şekiller, veri

### K-43 Duraklatma, bölümden çıkma ve kaldığı yerden devam — YENİ (R-13; `m = 0` cezasız çıkış P-7 KABUL)
**Kural:**
1. **Duraklatma:** hiçbir şey ilerlemez (G-H sayacı ve animasyonlar dahil). Tek istisna: G-L yönlendirme penceresi
   açıkken (düşüş/yükseliş sürerken) duraklatma pencereyi kapatır; blok yönlendirmesiz (daha önce yönlendirildiyse o
   haliyle) hemen iner ve hamle sonu çözümlemesi (K-35) duraklatma penceresi açılmadan biter (K-19 madde 1 (d), E-47).
   Gerekçe: duraklatma penceresindeki çıkış onayı `m`'yi ve kaydı yarım kalmış bir hamleyle görmemelidir (madde 2–3);
   ilk hamlenin düşüşünde açılan çıkış menüsü `m = 1` görür.
2. **Çıkış:** yalnızca oyuncunun onayıyla olur. `m ≥ 1` iken çıkış **kayıp** sayılır (1 can, seri sıfırlanır, Köprü'de
   elenme). `m = 0` iken çıkış cezasızdır: ayrılan can iade edilir, oyun öncesi güçlendiriciler iade edilir, galibiyet
   serisi bonusu **tüketilmez** (bir sonraki girişte aynen verilir), seri bozulmaz.
3. **Kaldığı yerden devam (MVP):** uygulamanın kapanması, sistemin uygulamayı öldürmesi, telefon araması, sekme
   kapanması **kayıp değildir**. Kayıp yalnızca (a) onaylı çıkışla (`m ≥ 1`) ya da (b) K-29'da teklifin reddiyle olur.
   - Kayıt: bölüm başında ve her eylemden sonra (K-35 adım 12 bittiğinde) ve `pagehide`/`visibilitychange` anında
     `inLevel = { levelId, levelHash, rulesVersion, seed, actions[], offersUsed, adOfferUsed, offerSpendCoins,
     preBoosters, streakTier, outcomeWindow }` yazılır (`levelHash`, `rulesVersion`, `offerSpendCoins` madde 4 içindir).
     `actions[]` = sürükleme hamleleri (`drag.via` ve `steer` dahil), güçlendirici kullanımları, kabul edilen teklifler.
   - Açılış: `inLevel` varsa oyun ana ekrana değil o bölüme döner; durum belirlenimci yeniden oynatmayla (ya da durum
     tamponundan) kurulur ve sonuç bit bit aynıdır. Ayrılan can ayrılmış kalır. Başka bölüm başlatılamaz.
   - Sürükleme ortasında kapanma = o sürükleme iptal (K-07 satır 1). G-H sayacı ve animasyonlar sıfırdan başlar.
   - "Hamleler bitti" penceresi açıkken kapanırsa açılışta **aynı pencere** aynı teklif numarasıyla gelir (kaçış yolu
     yok); kazanma ekranındayken kapanırsa ödüller verilmiş sayılır.
   - Sallanan Köprü: devam eden bölüm süre dolduktan sonra biterse de sayılır (META §6.1, süre içinde başlatıldıysa).
4. **Güncellemeyle geçersiz kalan deneme:** Açılışta `inLevel`'in kaydedildiği bölüm verisi (`levelHash`) ya da kural
   sürümü (`rulesVersion`) uygulamadaki sürümden farklıysa deneme yeniden oynatılmaz ve **cezasız kapanır** (oyuncunun
   seçimi değil, oyunun değişikliği): deneme hiç oynanmamış sayılır. İade edilenler: ayrılan can, oyun öncesi
   güçlendiriciler, bu denemede kullanılan bölüm içi güçlendiriciler, bu denemede +5 tekliflerine ödenen altının tamamı
   (`offerSpendCoins`). Galibiyet serisi bonusu tüketilmez (sonraki girişte aynen verilir), seri bozulmaz. Geri
   verilmeyenler: izlenen reklamların günlük sayaçları ve kullanılmışsa ömür ilk teklif hediyesi (K-29). Sallanan
   Köprü'de deneme sayılmaz: elenme yok, tahta yok; iade edilen altın tur harcamasından (`bridgeSpendCapCoins` sayacı)
   düşülür. Usta Ligi'ne puan yazılmaz. Oyuncu ana ekrana döner ve aynı bölümü yeniden başlatabilir (yerel tanılama
   kaydı; analytics olayı ANALYTICS §2'ye eklenirse `level_resume_invalid`). Bu, K-43 madde 3'teki "kayıp yalnızca (a) ya da (b) ile olur" kuralının istisnası değildir:
   bu denemede kayıp da kazanma da yoktur (E-45).
**Örnek:** 3 hamle yapıldı, oyuncu çıkışı onaylar → can 5 → 4, seri 3 → 0. 3 hamle yapıldı, telefon çaldı, sistem
uygulamayı kapattı → açılışta aynı bölüm, kalan hamle ve tahta aynı; can ayrılmış, seri 3.

### K-44 Şekiller, yönelimler ve ağırlık — YENİ
**Kural:** Hücreler brif §5'teki 0° tanımından **saat yönünde** 90°'lik dönüşle üretilir ve kutunun sol alt köşesine
(0,0) normalize edilir (TECH_DESIGN §3.3 tablosu bağlayıcıdır). Simetrik eş kimlikler (`O4_90`, `D2_180` …) veride kabul
edilir ve kanonik kimliğe indirgenir. Ağır (Y5): genişlik ≥ 3 ya da tür I5/Q9. `I5_90`/`I5_270` bölüm verisinde
yasaktır. Hikaye bölümüne göre izinli türler: 1 → B1, D2, O4, C3; 2 → + I3, L4, J4; 3 → + T4, S4, Z4; 4–5 → + I4.
I5 ve Q9 8. bölümden itibaren her hikaye bölümünde kullanılabilir. Bir türün ağır yönelimleri (ör. `L4_90`) tür
açıldığında kullanılabilir ama 8. bölümden önce kullanılamaz.
**Örnek:** `C3_90` hücreleri (0,0)(0,1)(1,1) → görünüm `XX / X.` (üst satır solda). Bölüm 5'te `I3_0` → hata
`shape_locked`.

### K-45 Bölüm verisi doğrulama kuralları — YENİ
**Kural:** `npm run levels:validate` her bölüm için aşağıdakileri denetler; her madde ayrı hata kodudur:
1. Şema (TECH_DESIGN), `id` 1–50, `chapter = ceil(id/10)`. `seed` verilmemişse `seed = id × 1000 + id` (ör. 4004).
2. Saha doluluğu %80–100 (K-02); bloklar ve engeller çakışmaz; bütün parti-0 hücreleri x ≤ 5, y ≤ 7.
3. Duvar: `0 ≤ height ≤ 8`; geçitler K-04 kısıtları; `paint` geçidinde `color`, `locked` geçidinde var olan `keyId`;
   `shutter` için `period ≥ 1`, `0 ≤ phase < 2·period`; `slider` için `range` geçidin `y`'sini içerir ve
   `range[1] + size ≤ height − 1`.
4. Plan: satırlar 2 karakter; renk sayısı ve açılmış renkler (K-31); `?` kuralları (K-32); asansörde `h + b ≤ 8`.
5. Şekiller ve ağırlık (K-44); bayrak birleşimleri (K-21, OBSTACLES matrisi).
6. Saklı nesneler başta örtülü (K-42); `collect`/`clear` sayıları ≤ nesne sayısı (K-41).
7. Moloz şantiye alanında ve kendi dilimine göre yanlış; her moloz `segment` alanı taşır (öneri P-5).
8. Solver: çözüm var; `moves ≥ min + tampon` (Kolay +8, Normal +5, Zor +3, Çok Zor +2); YAO ≥ %60 (K-46).
9. Öğretim: bir bölümün mekanik kümesi veriden türetilir (OBSTACLES "Veri imzası" tablosu; yalnızca imzası tanımlı
   mekanikler). Bölümde, önceki bölümlerin kümelerinde olmayan **en çok 1** mekanik vardır. `teaches` isteğe bağlıdır;
   verilmişse türetilen yeni mekaniğe eşit olmalıdır (yeni mekanik yoksa `teaches` verilemez). Engel olmayan öğretimler
   (kaldır–taşı–indir, gölge, kazı, güçlendirici açılışı) yalnızca `tutorial` adımlarıyla ifade edilir. W3'ün imzası
   `size = 1` olduğundan ilk kez Bölüm 9'da görünür (Bölüm 4'ün geçidi boy 2'dir; R-21).
**Örnek:** Bölüm 9'da geçit `size=1`, `y=6`, `height=6` → 6+1 > 5 → `gap_touches_top`. Bölüm 4'e `size=1` geçit
konursa türetilen yeni mekanikler {S2, W3} olur → `too_many_new_mechanics`.

### K-46 YAO (Yukarı–Aşağı Oranı) — YENİ (brif §4.11)
**Kural:** YAO = (serbest kipte şantiyeye girip doğru yerleşen sürükleme hamleleri) / (bütün doğru yerleşen sürükleme
hamleleri). Balon yükselişi ve hafif yerçekimi yönlendirmesi "duvar üstü" sayılır; ray yerleşimi "geçit" sayılır;
Vinç, Altın Mala ve Kamyon Yardımı sayılmaz. Bölüm ölçütü solver'ın minimum hamleli çözümü üzerindendir; eşit
hamleli çözümler arasında YAO'su en yüksek olan alınır. Her bölümde YAO ≥ 0,60. Oyuncunun YAO'su `level_end`
analytics olayına yazılır.
**Örnek:** Çözümde 5 doğru yerleşim: 4 duvar üstü, 1 ray → YAO 0,80.

---

## 12. K-35 Hamle sonu çözümleme hattı — YENİ

**Kural:** İptal edilmeyen her bırakma aşağıdaki adımları **bu sırayla**, her adım bir kez (6. adımın iç döngüsü hariç)
çalıştırır. Adım numaraları TECH_DESIGN §6.2 ile aynıdır. Aynı adımda birden fazla nesne etkilenirse işlem sırası:
satır küçükten büyüğe, aynı satırda x küçükten büyüğe (y, x sıralı tarama).

| Adım | İş | Kurallar |
|---|---|---|
| 0 | Bırakma sınıflandırması (K-07 tablosu). İptalse **dur**: hiçbir şey değişmez. | K-05, K-07 |
| 1 | Blok bırakma konumuna taşınır. Sürüklemede blok bir Boya Kapısı'nın ray kipine **girdiyse** (en az bir hücresi sınırı o geçidin satırlarında geçtiyse; yarım girip geri çıkmak dahil) blok boyanır; birden çok boya kapısına girildiyse **son girilenin** rengi geçerlidir, `drag.via` = son girilen boya kapısının geçit indeksi (W6, S-21). G-H zorla bırakması sıradan bırakmadır. | K-10–K-12, W6 |
| 2 | Şantiyede serbest kipteyse: rüzgâr kayması (W8) → düşüş ya da balon yükselişi (S8) → G-L yönlendirmesi (`steer`, K-19) → iniş. Cam (S3) d > eşikse kırılır, K-17 hedefine döner, adım 3 atlanır. Sahada bırakılan balon burada yükselir. | K-11, K-19, W8, S3, S8 |
| 3 | Şantiyedeyse doğrulama: doğru → kilitle, `?` aç, seri +1, gerekirse Altın Mala; hatalı → harçlı blok yapışır (Y8), değilse geri seker (K-17), seri 0. | K-14, K-16, K-17, K-32, K-33, K-34, Y8 |
| 4 | Maliyet: sayaç − (taban + cam cezası), en az 0; taban 1 (yapışmış harçlı blokta 2), cam kırıldıysa +1; maliyetler toplanır (yapışmış harçlı cam kırılırsa 3). `m += 1`. | K-07 |
| 5 | Komşu etkileri: taşınan bloğun **başlangıç** hücrelerinin 4-komşusu (komşuluk duvar sınırını aşmaz, §0) olan kasa 1 kat kaybeder (Y1), torba yırtılır (Y2), zincirli bloğun zinciri kalkar (Y3); her engel bu hamlede en çok 1 kez etkilenir. Ardından saklı nesne denetimi #1 (K-42). | Y1, Y2, Y3, K-42 |
| 6 | Saha yerçekimi: torbalar her zaman, diğer bloklar Y6 açıksa düşer; balonlar Y6 açıksa yükselir (K-20). Her tur iki **yarım adımdır** (R-02): (a) **düşme yarısı** — balonlar katı sayılır, bütün desteksiz blok ve torbalar aynı anda 1 satır iner; (b) **yükselme yarısı** — diğer her şey katı sayılır, tutulmayan bütün balonlar aynı anda 1 satır çıkar. Hareket kalmayınca biter; aynı boş hücreyi hedefleyen düşen blok ve balon arasında boşluk kalmaz (E-33). Düşen her bloğun düşüş öncesi hücrelerine komşu engeller 5. adım kuralıyla etkilenir (bu hamlede daha önce etkilenen etkilenmez). Bir torba yırtıldıysa ya da kasa yok olduysa yerçekimi yeniden çalışır; değişiklik kalmayınca biter. Saklı nesne denetimi #2. | K-20, Y2, Y6, S8 |
| 7 | Hedef sayaçları güncellenir. | K-41 |
| 8 | Aktif (ya da öndeki) dilim tamamlandıysa: `segments` → kayma ve sonraki dilim; `carousel` → ön dilim sıradaki tamamlanmamış dilim, `t = 0`. Sıradaki parti kamyon kuyruğunun sonuna eklenir. | K-22, K-23, K-25 |
| 9 | Teslimat: kuyruktaki bütün bloklar FIFO sırasıyla birer kez denenir. | K-25, K-26 |
| 10 | Zamanlayıcılar, bu sırayla: Kepenk (W4) → Kayar Kapı (W5) → Döner Platform sayacı (S5; bu hamlenin 8. adımında ön dilim tamamlandıysa artmaz, K-23) → Asansör (S6) → Islak Beton (Y4; bu hamlenin 9. adımında teslim edilen bloklar hariç) → Açık Kepenk süresi (K-40). | W4, W5, S5, S6, Y4 |
| 11 | Kazanma (K-28) → değilse hamle bitti mi (K-29). | K-28, K-29 |
| 12 | Oyun sürüyorsa (kazanılmamış, sayaç > 0) kilitlenme denetimi ve Kamyon Yardımı (K-30; D2 yardım `B1`'leri bu adımda bir kez teslim denenir). Ayrıca +5 teklifi kabul edildiğinde hamle olmadan bir kez çalışır (K-29). | K-29, K-30 |

**Sıranın gerekçesi**
1. **Komşu etkileri (5) yerçekiminden (6) önce:** yırtılan torba ve kırılan kasa aynı hamlede boşluk açar, yerçekimi
   bunu hemen doldurur; oyuncu tek hamlede tek "zincirleme" görür.
2. **Yerçekimi (6) teslimattan (8–9) önce:** kamyon blokları oturmuş bir sahaya düşer; teslimat düşüşü sahayı yeniden
   oynatmaz, böylece aynı hamlede ikinci zincirleme olmaz.
3. **Dilim tamamlama (8) zamanlayıcılardan (10) önce:** döner platform tamamlanmış dilimi öne getirmez, asansör yeni
   dilimin çerçevesini oynatır; oyuncu yeni dilimi zamanlayıcı ilerlemiş haliyle görür.
4. **Zamanlayıcılar (10) teslimattan sonra:** yeni gelen ıslak blok sayacının tamamını korur; sonraki hamlenin başında
   görülen geçit/çerçeve durumu kesindir.
5. **Kazanma (11) kaybetmeden önce:** son hamlede biten bölüm kazanılır. Kazanma zamanlayıcılardan etkilenmez, ama
   kilitlenme (12) zamanlayıcı sonrası durumla bakılmalıdır (açılan bir kepenk D1'i çözebilir).

**Birden fazla engelin aynı anda tetiklendiği örnek:** Bölümde kepenk (period 2, phase 1), asansör, ıslak beton,
torba, zincir ve saha yerçekimi (`gravity.yard = true`, Y6) var. Oyuncu (3,4)–(4,4) `D2_90`'ı ((5,4) boş olduğundan tutulabilir) şantiyeye doğru bırakır, dilim tamamlanır.
Adım 3 doğru → adım 4 kalan 12 → 11, m 5 → 6 → adım 5 (3,5)'teki torba yırtılır → adım 6 (3,6)'daki blok (3,4)'e düşer;
düşüş öncesi komşusu (2,6)'daki zincirli bloğun zinciri kalkar → adım 8 dilim 2 gelir, parti 2 kuyruğa → adım 9 bloklar
düşer → adım 10 kepenk durumu `floor((6+1)/2)=3` tek → kapalı; asansör e 1 → 2; ıslak sayaçlar −1 (yeni gelenler
hariç) → adım 11 kazanma yok, sayaç > 0 → adım 12 kilitlenme yok.

---

## 13. Kenar durumları

Her satır bir test senaryosudur (test adı "E-xx …" ve ilgili K kimliği).

| # | Durum | Sonuç | Kural |
|---|---|---|---|
| E-01 | Son hamle (kalan 1) son dilimi tamamlar | Adım 4 kalan 0; adım 11 önce kazanma → kazanılır, bonus 0 | K-28, K-35 |
| E-02 | Kalan 1 hamlede cam blok eşiği aşan yükseklikten bırakılır | Kırılır, sahaya döner, maliyet 2 → sayaç 0 (negatif olmaz) → "Hamleler bitti" | K-07, S3 |
| E-03 | Teslimat sırasında sahada yer yok | Bloklar kuyrukta; sonraki hamlede yer açılınca o hamlenin 9. adımında düşer; arayüz "Kamyonda: N blok" | K-26 |
| E-04 | Kuyrukta eski bloklar varken döner platformda yeni dilim tamamlanır | Yeni parti kuyruğun sonuna eklenir; eskiler önce denenir | K-23, K-26 |
| E-05 | Kepenk kapanırken şantiyede, geçit satırında raydan konmuş blok var | Blok yerinde kalır; kepenk yalnızca sınırın o satırlarını kapatır, şantiye hücrelerini etkilemez | W4, K-12 |
| E-06 | Blok geçitte sınırı keserken (hücreleri sınırın iki yanında) bırakılır | İptal, hamle harcanmaz; kepenk/kayar kapı sürükleme sırasında değişmediği için "kapanırken içinde blok" oluşamaz | K-04, K-07 |
| E-07 | Kayar kapı, sahada geçide komşu blok varken kayar | Hiçbir blok itilmez; kapı yalnızca sınırın açık satırlarını değiştirir | W5 |
| E-08 | Asansör yükselirken şantiyede yapışmış harçlı blok var | Harçlı blok yalnızca bütün hücreleri plan alanında (renkli ya da `.`) ise yapışır, değilse geri seker (öneri P-2b); bu yüzden h + b ≤ 8 ile tahta dışına çıkamaz | Y8, K-24 |
| E-09 | Dilim Altın Mala ile tamamlanır | Mini hat: adım 8 kayma ve parti (döner platformda ön dilim değişir, `t = 0`), 9 teslimat, 11 kazanma, 12 kilitlenme; `m` artmaz, zamanlayıcılar ilerlemez (`t` de artmaz) | K-23, K-33, K-35 |
| E-10 | Anahtar açığa çıkar | Adım 5/6'da toplanır, Kilitli Geçit aynı anda açılır; ilk kullanım bir sonraki hamlede | W7, K-42 |
| E-11 | Taşınan bloğun başlangıç hücrelerinden ikisi aynı kasaya komşu | Kasa yalnızca 1 kat kaybeder | Y1, K-35 |
| E-12 | Yırtılan torba yüzünden düşen blok başka bir torbaya komşu geçer | 6. adım döngüsü: ikinci torba yırtılır, yerçekimi yeniden çalışır | Y2, K-35 |
| E-13 | Zincirli blok, komşusu taşındığı hamlede saha yerçekimiyle de düşer | 5. adımda zincir kalkar, 6. adımda düşer | Y3, K-20 |
| E-14 | Sahada bırakılan balonun üstünde blok var | Balon o bloğun altına kadar yükselir, yoksa y=7'ye kadar | S8 |
| E-15 | Şantiyede serbest kipte bırakılan balon | Plan tavanına (h + e satırının altı) ya da üstündeki ilk bloğa kadar yükselir; sonra doğrulama | S8, öneri P-3 |
| E-16 | Rüzgâr 1 genişlikteki bloğu `.` sütununa iter | Blok pencereye düşer → hatalı; gölge bunu önceden gösterir | W8, K-18 |
| E-17 | Oyuncu 1 genişlikteki bloğu rüzgârlı bölümde siluete kadar indirip bırakır | d = 0 → rüzgâr kayması yok | W8 |
| E-18 | G-H: blok Vinç Alanı'ndayken 700 ms dolar | O konumdan zorla bırakılır, normal düşüş ve cam kuralı | G-H, K-19 |
| E-19 | G-H: blok şantiye üstünden sahaya geri çekilir | Sayaç sıfırlanır; tekrar şantiyeye değince yeniden 700 ms | G-H |
| E-20 | Açılmamış `?` hücresine yanlış renk | Hatalı yerleşim; gölge her zorlukta nötr kalmıştır | K-18, K-32 |
| E-21 | Dilim geçişi ve teslimat yapan hamleden sonra Geri Al | Kayma ve teslimat dahil bütün durum hamle öncesine döner | K-39 |
| E-22 | Sallanan Köprü'de hamle biter, oyuncu +5 alır | Elenmez; deneme sürer | K-29, META |
| E-23 | Kamyon Yardımı D2 `B1`'leri getirirken saha dolu | `B1`'ler adım 12'de kuyruğun sonuna eklenir ve hemen bir kez denenir (`x = 5`, sonra K-25 aşama 3); sığmayanlar kuyrukta kalır ve sonraki hamlenin 9. adımında yeniden denenir. D1 değildir çünkü üstteki bloklar tutulabilir. Güvence 2 hamle denetimiyle sağlanır (1. hamle yer açar, 9. adımda `B1` düşer, 2. hamle onu yerleştirir) | K-25, K-30 |
| E-24 | Harçlı blok `.` (pencere) hücresine yapışır | Dilim tamamlanamaz (K-15: dilim alanında fazladan blok); 2 hamlelik geri sürükleme ya da Çekiç gerekir. Harç oradayken o sütunda üstüne doğru yerleşim yapılamaz (E-43), bu yüzden harcın üstü kapanıp tutulamaz hale gelmez | Y8, K-15, K-34 |
| E-25 | Boya kapısından geçip boyanan blok şantiyede hatalı yerleşir | Geri seker, yeni rengini korur (boya hamle kesinleşince kalıcıdır) | W6, K-17 |
| E-26 | Kalan son plan hücresi 1×1, o renkte yalnızca 2 hücreli bloklar var | D2 tetiklenmez (sayı yeter); D3 (solver) ya da Kamyon Yardımı şekil değişimi çözer | K-30 |
| E-27 | `build` tamamlandı, `clear` hedefi eksik | Oyun sürer; şantiye **kapalıdır**: şantiyeye bırakma iptal (0 hamle, K-07 satır 5); oyuncu saha hamleleriyle hedefi bitirir. Bölüm tasarımı bunu kaçınır (LEVELS kontrol listesi) | K-07, K-28, K-41 |
| E-28 | Blok duvar üstünde, Vinç Alanı'nda sınırı keserken bırakılır | İptal (K-07 satır 4) | K-07 |
| E-29 | Sahada, başlangıçtan farklı ama yine saklı vidanın hücresini örten konuma bırakma | Hücre boş kalmadığı için vida toplanmaz | K-42 |
| E-30 | Hamle sayacı 0 iken bloğa dokunma | Tutulamaz; kayıp penceresi zaten açıktır | K-09 |
| E-31 | Islak blok teslimatla gelir (wetMoves 3) | Geldiği hamlede sayaç 3 kalır, sonraki 3 hamlenin 10. adımında 2, 1, 0 olur | Y4, K-35 |
| E-32 | Döner platformda ön dilime yapışmış harç varken dönüş | Harç dilimiyle birlikte döner; dilim onu kaldırmadan tamamlanamaz | S5, Y8 |
| E-33 | Y6 açık; aynı sütunda düşen blok (6. satır) ile yükselen balon (4. satır) arasında 1 boş hücre (5. satır) | Tur 1 düşme yarısı: blok 5'e iner; yükselme yarısı: balonun üstü dolu, kalır. Sonuç: blok 5'te balona oturur, balon bloğa dayanır, boşluk yok (R-02) | K-20, K-35, S8, N33 |
| E-34 | Teslimat: bloğun `x`'i dolu, `dropColumns` [3, 0] ikisi de dolu | Aşama 3: kalan sütunlar `x`'e uzaklıkla denenir; liste son aşamayı kapatmaz. Hiçbiri olmazsa kuyrukta kalır | K-25, K-26 |
| E-35 | Balon şantiyede tavanın **üstünden** (Vinç Alanı) bırakılır | Tavana **iner** (yükselmez); W8 için `d = |bırakma satırı − tavan satırı|`, `d = 0` ise rüzgâr kayması yok | S8, W8 |
| E-36 | Kamyonla balonlu blok gelir (Y6 kapalı / açık) | Diğer bloklar gibi düşüp oturur, yükselmez. Y6 açıksa **sonraki** hamlenin 6. adımında yükselir; Y6 kapalıysa oyuncu bırakana kadar yerinde kalır | K-25, S8 |
| E-37 | Hamle sonunda Kamyon Yardımı (D2) `B1` getirdi; oyuncu Geri Al kullanır | Hamle ve yardım birlikte geri alınır; `B1`'ler yok olur. Durum yine kilitliyse yardım bir sonraki hamle sonunda yeniden çalışır | K-30, K-39 |
| E-38 | 5. hamleden sonra sistem uygulamayı kapatır, oyuncu 2 saat sonra açar | Bölüm aynı durumdan sürer (kalan hamle, tahta, seri, ayrılan can); kayıp değildir. Can yenilenmesi saatle işlemiştir | K-43 |
| E-39 | Sürükleme sırasında blok önce R boya kapısına, sonra Y boya kapısına girip sahaya bırakılır | Blok Y olur (son girilen); `via` = Y kapısının indeksi; 1 hamle | W6, K-35 |
| E-40 | G-L: blok düşerken oyuncu başka bir bloğu tutar | Yönlendirme penceresi kapanır, düşen blok yönlendirmesiz (ya da daha önce yönlendirildiyse o haliyle) iner; yeni blok tutulur | K-19, R-12 |
| E-41 | `m = 0`, galibiyet serisi kademe 2 bonusu (+2 hamle, +1 mala) verilmiş; oyuncu çıkar | Ceza yok; can, oyun öncesi güçlendiriciler iade; bonus tüketilmez, sonraki girişte yine verilir | K-40, K-43 |
| E-42 | Son hamle hiçbir bloğun tutulamadığı bir durum (D1) üretir ve sayacı 0 yapar; adım 12 atlanır, kayıp penceresi açılır; oyuncu +5'i kabul eder | Teklif kabulünden hemen sonra adım 12 çalışır: D1 → zincirler/ıslaklık kalkar, hâlâ D1 ise saha yeniden dizilir, güvence denetimi; oyuncu 5 hamleyle oynayabilir. `m`, zamanlayıcılar ve seri değişmez | K-29, K-30 |
| E-43 | Harçlı blok (7,1) `.` hücresine yapıştı (E-24); (7,0) doğru dolu, (7,2) W boş. Oyuncu sütun 7'ye W blok bırakır | Blok (7,2)'ye iner ve **hatalıdır** (`support`; `missingSupport` = [(7,1)]); harç orada durdukça sütun 7'de `buildFront` yoktur. Harç sürüklenip çıkarılınca (7,1) yeniden boş `.` olur ve (7,2) cephe hücresi olur | K-34, Y8 |
| E-44 | Son R blok Çekiç'le kırıldı; sahada 2 hücrelik R moloz var; planda 2 R hücre kaldı | Moloz arz sayılmaz → D2 tetiklenir → 2 `B1` R (adım 12) | K-27, K-30, S4 |
| E-45 | Oyuncu 2. teklifi 1.350 altınla almış (1. teklif reklamla); uygulama kapanır, güncellenir, bölüm verisi değişmiştir; Sallanan Köprü'de, tur harcaması 2.250 | Deneme cezasız kapanır: can ve güçlendiriciler iade, 1.350 altın iade, tur harcaması 2.250 → 900; elenme ve tahta yok; reklam sayacı geri verilmez; oyuncu ana ekranda | K-43 |
| E-46 | Moloz (6,2)'den sahaya taşınır; (5,2)'de Ahşap Kasa, (5,1)'de zincirli blok var | Hiçbiri etkilenmez: x=5 ile x=6 komşu değildir (duvar sınırı, §0); kasa kat kaybetmez, zincir kalkmaz | §0, K-35, Y1, Y3 |
| E-47 | G-L: bölümün ilk hamlesinde blok düşerken (yönlendirilmemiş) oyuncu Duraklat'a basar, sonra "Bölümden çık"ı seçer | Yönlendirme penceresi kapanır, blok yönlendirmesiz iner (animasyon son karesine atlar), hamle sonu çözümlemesi biter ve kayıt yazılır; sonra Duraklat penceresi açılır. Devam'da o düşüş için yönlendirme hakkı yoktur. Çıkış menüsü `m = 1` görür → çıkış kayıptır | K-19, K-43 |

---

## 14. Veri alanı ekleri (code-lead'e)

Brif §12 veri tipine product-lead'in istediği ekler (kesin şema TECH_DESIGN'dadır):

| Alan | Tip | Neden |
|---|---|---|
| `build.elevator` | `{ range: [number, number]; start: number; dir: 1 \| -1 }` | Asansör moddan bağımsız (K-24, P-4) |
| `build.debris[].segment` | `number` (varsayılan 0) | Molozun hangi dilime ait olduğu (K-45/7, P-5) |
| `wall.gaps[].dir` (slider) | `1 \| -1` (varsayılan 1) | Kayar kapının ilk yönü (W5) |
| `PiecePlacement.y` (parti ≥ 1) | `8` yazılır, yok sayılır | Kamyon dökümü sütundan yapılır (K-25) |
| Hamle kaydı `drag.via` | `number` (geçit indeksi, isteğe bağlı) | Son girilen boya kapısı (W6, K-35 adım 1, E-39) |
| Hamle kaydı `steer` | `{ dir: 1 \| -1; atRow: number }` (isteğe bağlı) | G-L yönlendirmesi (K-19) |
| `seed` | `number` (isteğe bağlı; yoksa `id × 1000 + id`) | K-45/1 |
| `teaches` | mekanik kimliği (OBSTACLES veri imzası tablosu), isteğe bağlı | K-45/9 |
| `tutorial[]` | `{ step, mode: 'required' \| 'soft', highlight: string[], hand?: { kind: 'tap' \| 'drag' \| 'hold', path?: [x, y][] }, textKey, done: { event, count?, minMs?, at?: [x, y] } \| { timeoutMs } }` | code-lead önerisi KABUL; `minMs` ve `at` eklendi. `highlight` sözlüğü UX_FLOWS §13.1; `piece:<i>` = parti-0 dizi sırası = LEVELS tablosundaki satır sırası; partilerde `k<parti>_<indeks>`. `textKey` biçimi ve `done` sözlüğü aşağıda (§14.1) |
| Kayıt `inLevel` | K-43 madde 3 | Kaldığı yerden devam (R-13) |
| Kayıt, bölüm başına | `{ won: boolean, attempts: number }` | `attempts` yalnızca analytics içindir (`level_start.attempt`); kural kullanmaz |

### 14.1 Öğretici adımı (`tutorial[]`) kuralları

1. **`textKey`:** `tut.l<bölüm>.<konu>` **ya da** bağlamsal bir satırı öğretici adımında yeniden kullanmak için
   `tut.ctx.<konu>`. R-08'in tek anahtar kümesi korunur: yeni bir anahtar ailesi açılmaz; `tut.ctx.*` UX §13.1 ve
   STORY §6'da zaten tanımlı bağlamsal satırlardır. Anahtardaki bölüm numarası metnin ilk yazıldığı bölümdür; aynı
   metin başka bölümün adımında yeniden kullanılabilir (ör. `tut.l1.match` Bölüm 2, 3 ve 9'da). code-lead şema
   regex'ini iki biçimi kabul edecek şekilde genişletir.
2. **Bağlamsal satırın adımda gösterilmesi:** `textKey`'i `tut.ctx.<konu>` olan bir adım ekranda gösterildiği anda
   `seenContextTips.<konu>` işaretlenir; o bağlamsal tetik bu hesapta bir daha çıkmaz (K-34 kanca 4, UX §5.5). Tek
   kullanım: Bölüm 4 adım 2 (`tut.ctx.support`).
3. **`done` olay sözlüğü** (code-lead enum'u buna eşitler):
   - **Sürükleme sinyalleri** (bırakma beklenmez; sürükleme sonra iptal edilse de sayılmış kalır): `overWall` — tutulan
     bloğun bir hücresi serbest kipte duvar sınırını ilk kez geçtiği an (hamle sonu kaydındaki `entry: 'overWall'` ile
     karıştırılmaz); `gapPass` — tutulan blok bir geçitte ray kipine girdiği an (K-12); `holdOverBuild` — serbest kipteki
     bloğun bir hücresi şantiye sütunlarına değerken kesintisiz `minMs` milisaniye geçtiği an.
   - **Hamle sonu olayları** (K-35): `placementCorrect` (adım 3, sürükleme hamlesiyle doğru yerleşim), `yardMove`
     (K-07 satır 2, sahaya yerleşim), `segmentDone` (adım 8, dilim tamamlandı), `deliveryDone` (adım 9, en az bir blok
     sahaya düştü).
   - **Diğer:** `tap` (vurgulanan hedefe dokunma), `boosterUsed`.
   - `count` (varsayılan 1) adım **başladıktan sonra** gerçekleşen olayları sayar; önceki olaylar sayılmaz.
   - `minMs` yalnız `holdOverBuild` içindir (ör. Bölüm 2: `{ event: 'holdOverBuild', count: 1, minMs: 500 }`).
   - `at: [x, y]` yalnız `yardMove` ve `placementCorrect` içindir: olay yalnızca blok bu çapaya yerleşince sayılır
     (ör. Bölüm 7 kazı adımı: `{ event: 'yardMove', count: 1, at: [0, 6] }`).
4. **Kilit güvencesi (zorunlu adım):** (a) Veri kuralı (LEVELS §5): Z adımının `highlight`'ı en az bir `piece:` ya da
   `debris:` (moloz, UX §13.1) içerir; `piece:` içermeyen Z adımının `done` olayı `placementCorrect` olamaz (moloz
   hiçbir yerde doğru olamaz, K-16 koşul 2; ör. Bölüm 17 `debris:0` adımı `yardMove` bekler). Z adımı yalnızca istediği
   hamle, önceki adımın tamamlanabildiği **her** durumda geçerli ve K-34'e uygunsa yazılır; spot ışığı en az bir
   tutulabilir bloğu açık bırakır. (b) Çalışma anı: Z adımı başlarken ve her hamle sonunda, vurgulanan `piece:` ve
   `debris:` bloklarından hiçbiri adımın `done` olayını o anki durumda üretemiyorsa adım atlanır (tamam sayılır) ve
   sonraki adıma geçilir. "Üretemiyor" = blok K-09'a göre tutulamıyor ya da erişim kümesinde (K-08 `R`) olayı üreten
   konum yok: `overWall` için sınırı serbest kipte geçen konum, `gapPass` için ray konumu, `placementCorrect` için doğru
   yerleşim (`debris:` için hiçbir zaman yok), `yardMove` için (`at` verilmişse o çapada) sahaya yerleşim (`piece:` ve
   `debris:` için aynı koşul: K-10'a göre boş, bütün hücreleri x ≤ 5 ve y ≤ 7 olan, `R`'de erişilebilir bir konum;
   moloz için OBSTACLES S4). `holdOverBuild` ve `tap` için tutulabilirlik yeter; `timeoutMs` adımı kendiliğinden biter. Oyuncu spot ışığı içinde hiçbir zaman
   kilitli kalmaz. Test "GDD 14.1 required tutorial step never locks".

---

## 15. code-lead sorularına yanıtlar (TECH_DESIGN §16, S-1…S-28)

| Soru | Yanıt (bağlayıcı kural) |
|---|---|
| S-1 | Saat yönünde, sol alta normalize (K-44). |
| S-2 | `I5_90/270` veride yasak; I5 ve Q9 Vinçle döndürülse de ağır (K-37, K-44). |
| S-3 | %80–100 öğretici bölümlerde de geçerli (K-02). |
| S-4 | Şart: `y + size ≤ height − 1` (K-04). |
| S-5 | İptal, hamle harcanmaz (K-07 satır 4). |
| S-6 | Hamle sonunda; sürüklemede tahta donuk (K-08, K-35). |
| S-7 | Başlangıç hücrelerinin 4-komşuluğu; saha yerçekimi düşüşleri sayılır (düşüş öncesi hücreler), teslimat sayılmaz; engel başına hamlede en çok 1 (K-35 adım 5–6). |
| S-8 | Bırakınca, düşüşten önce, 1 sütun; hedef duvar/kenar/dolu ise kayma yok; ray etkilenmez. **Ek:** bırakma anında d = 0 (blok siluete oturmuş) ise kayma yok (W8, öneri P-2a). |
| S-9 | **Farklı (R-02: GDD geçerli):** Şantiyede tavan aktif dilimin plan tepesidir (tahta satırı h + e); sahada y=7. Tavanın üstünden bırakılan balon tavana iner (E-35); teslimat balonu yükselmez (E-36). Öneri P-3. |
| S-10 | d > eşik; d bırakma satırından; geri sekme ve teslimat düşüşünde cam kırılmaz (S3). |
| S-11 | Kuyruğun sonuna (K-17). |
| S-12 | Evet, torba her zaman düşer (K-20). |
| S-13 | Moloz düşmez; moloz hiçbir plan hücresinde doğru olamaz (K-16 koşul 2). |
| S-14 | Zamanlayıcılar `m` (iptal olmayan hamle) başına 1 kez; cezalar yalnızca sayacı düşürür; güçlendirici ve teklif ilerletmez (K-35). |
| S-15 | Atlar; sayaç `t` her hamle +1 (ön dilimin tamamlandığı hamlede artmaz), dönüşte ve dilim tamamlanınca 0 (K-23). |
| S-16 | `build.elevator` ayrı alan (K-24, P-4). |
| S-17 | Dilim içinde `period` satır aşağısı, zincirle (K-32). |
| S-18 | Minimum hamleli çözüm, eşitlikte en yüksek YAO; yönlendirme ve balon duvar üstü; Mala/Vinç sayılmaz (K-46). |
| S-19 | Evet, yalnızca D3'te; renk başına hücre toplamı korunur (K-30). |
| S-20 | Hatalı yerleşim (harç yapışması dahil) ve cam kırılması bozar; saha hamlesi bozmaz (K-33). |
| S-21 | **Farklı (R-02: GDD geçerli):** Sürüklemede boya kapısının ray kipine giren (yarım girip çıkmak dahil) ve iptal edilmeyen her hamlede blok boyanır; sahaya geri dönse bile; birden çok kapıda son girilen geçerli (K-35 adım 1, E-39). Gerekçe: "boyahane" kullanımı duvar üstü yerleşimi (YAO) korur. Öneri P-6. |
| S-22 | Evet, açıldığı denetimde toplanır (K-42). |
| S-23 | Ping-pong; iptalde oynamaz (K-24). |
| S-24 | `period` hamle açık + `period` hamle kapalı; açık ⇔ `floor((m + phase) / period)` çift; `phase = 0` açık başlar (W4). |
| S-25 | Lig haftası UTC Pazartesi 00:00 (META). |
| S-26 | **Değişti (R-10):** düşüş/yükseliş sürerken tahtanın herhangi bir yerine dokunma; dokunulan taraf (bloğun orta çizgisine göre) = yön; 1 sütun; düşüş başına 1; aynı hamle; kayıt `steer { dir, atRow }` (K-19). |
| S-27 | Evet; erişilebilirlik ayarıyla 1400 ms (K-19). |
| S-28 | Hayır (§10 genel). |
