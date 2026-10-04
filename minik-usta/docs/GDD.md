# GDD — Oyun kuralları

Sahip: product-lead · Sürüm: Faz 1 taslağı (2026-10-04) · Kaynak: `docs/BRIEF.md` §4–§8, §10

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
| Blok (parça) | Tek renkli poliomino. Kimlik `TÜR_AÇI` (ör. `C3_90`). Çapa = kutusunun sol alt köşesi. |
| Saha | x=0–5, y=0–7 (48 hücre). Malzeme deposu. |
| Şantiye | x=6–7, y=0–7. Aktif dilimin planı burada gösterilir. |
| Duvar sütunu | Saha ile şantiye arasındaki mantıksal sütun. Genel koordinatta x indeksi yoktur (TECH_DESIGN §2.2: iç `ix=6`). |
| Vinç Alanı | Tahtanın üstündeki y=8–9 satırları; x=0–5 üstü, duvar sütunu üstü ve x=6–7 üstü dahil. |
| Hamle (tur) | İptal edilmeyen bir bırakma. Hamle sayacını düşürür, zamanlayıcıları 1 kez ilerletir. |
| Serbest kip (FREE) | Bloğun saha, Vinç Alanı ya da duvar üstünden şantiyeye taşındığı kip. Şantiyede bırakılınca düşer. |
| Ray kipi (RAIL) | Bloğun bir geçitten geçerek şantiyeye girdiği kip. Dikey konumu kilitli, bırakılınca düşmez. |
| Siluet (`top(c)`) | Şantiye sütunu `c`'deki en yüksek dolu hücrenin satırı + 1; sütun boşsa çerçeve tabanı (asansörsüz 0). |
| Düşüş mesafesi | Bırakma satırı − iniş satırı (bloğun çapa satırları farkı). |
| Doğru dolu hücre | Doğru yerleşmiş (kilitli) bir bloğun ya da Altın Mala'nın doldurduğu plan hücresi. |
| `m` | Bölüm başından beri tamamlanan hamle sayısı (`turn`). Bölüm başında 0. |

Yön sözcükleri: "yukarı" = +y, "sağ" = +x. "Komşu" her yerde **4-komşuluk** (sol, sağ, alt, üst) demektir.

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
**Örnek:** Plan `["YY","WW","WW"]` (h=3), e=0 → (6,0),(7,0)=Y; (6,1)…(7,2)=W; (6,3)…(7,7) plan dışı.

### K-04 Şantiye Duvarı
**Kural:** Duvar, saha ile şantiye arasında 1 mantıksal sütundur. Parametreler: `height` (0–8) ve `gaps[]`
(`y`, `size`, `type`). Duvar sütununun `y` satırındaki hücresi şu durumda **kapalıdır**: `y < height` ve `y` açık bir
geçidin satır aralığında değil. Vinç Alanı satırları (8–9) her zaman açıktır.
Geçit kısıtları (doğrulayıcı): `size ≥ 1`; `y ≥ 0`; `y + size ≤ height − 1` (geçidin üstünde en az 1 kapalı duvar
satırı olmalı; aksi halde bu geçit değil alçak duvardır); geçitler örtüşmez. Blok duvar sütununda **bırakılamaz**
(bırakılırsa iptal, K-07).
**Örnek:** `height=6`, geçit `y=2, size=2` → duvar sütunu satır 0–1 kapalı, 2–3 geçit, 4–5 kapalı, 6–9 açık (duvar üstü
hava). `height=6`, geçit `y=4, size=2` → 4+2=6 > 5 → doğrulayıcı hatası `gap_touches_top`.

### K-05 Vinç Alanı
**Kural:** y=8–9 satırları bütün sütunlarda serbest havadır. Blok sürüklenirken buraya girebilir. Bırakma anında
bloğun bütün hücreleri x ≤ 5 iken herhangi bir hücresi y ≥ 8 ise bırakma **iptaldir** (blok yerine döner, hamle
harcanmaz). x=6–7 üstündeki Vinç Alanı'nda bırakılan blok şantiyeye düşer (K-11).
**Sonuç (açık yükseklik):** Duvar sütunundan serbest kipte geçen her hücre `y ≥ height` olmalıdır. Bu yüzden duvarın
üstünden geçebilecek bloğun duvar sütunundaki en yüksek dikey hücre dizisi `10 − height` satırı aşamaz. `height=8`
iken yalnızca boyu ≤ 2 olan bloklar (B1, D2_0, D2_90, O4, C3 hepsi) duvarı aşar; I3_0, I4_0, L4_0 gibi boyu 3–4 olan
dikey bloklar yalnızca uygun bir geçitten girebilir.
**Örnek:** `height=8`, `I3_0` (1×3) çapası (5,7) → yukarı sürüklenir, en fazla çapa (5,7)'ye (hücreler 7–9) çıkar;
duvar sütununa girmek için 3 hücrenin de y ≥ 8 olması gerekir → imkânsız. `height=7` iken çapa (5,7) → hücreler
7,8,9 ≥ 7 → geçer.

### K-06 Yapı Panoraması
**Kural:** Tahtanın üstünde bütün dilimlerin küçük önizlemesi bulunur: tamamlanan dilimler tam renkli, aktif dilim
vurgulu çerçeveli, gelecek dilimler %30 opak gösterilir. Gizli `?` hücreleri panoramada da `?` görünür; açılınca
(K-32) rengini alır. Panorama yalnızca bilgi verir; dokunmaya tepki vermez.
**Örnek:** 3 dilimli bölümde 1. dilim bitince panorama: [dilim 1 renkli][dilim 2 çerçeveli][dilim 3 soluk].

---

## 2. Hareket

### K-07 Hamle, iptal ve hamle maliyeti
**Kural:** Bloğu tutmak için parmak bloğa basar ve en az 0,3 hücre sürükler; daha azı dokunmadır, hiçbir şey olmaz.
Bırakma anındaki konuma göre sonuç aşağıdaki tabloyla **tek** biçimde belirlenir:

| # | Bırakma konumu | Sonuç | Hamle maliyeti |
|---|---|---|---|
| 1 | Başlangıç konumu (aynı hücre kümesi, aynı kip) | İptal | 0 |
| 2 | Serbest kip, bütün hücreler x ≤ 5 ve y ≤ 7 | Sahaya yerleşim (K-10) | 1 |
| 3 | Serbest kip, bütün hücreler x ≤ 5, en az bir hücre y ≥ 8 | İptal (K-05) | 0 |
| 4 | En az bir hücre duvar sütununda | İptal | 0 |
| 5 | Serbest kip, bütün hücreler x ≥ 6 | Şantiyeye düşüş (K-11) → doğrulama (K-16) | 1 |
| 6 | Ray kipi, bütün hücreler x ≥ 6 | Rayda yerleşim (K-12) → doğrulama (K-16) | 1 |

Ek maliyetler: cam kırılması +1 (S3; toplam 2), harçla yapışmış bloğun her hamlesi 2 (Y8). Hamle sayacı 0'ın altına
inmez (1 hamle kalmışken maliyeti 2 olan hamle sayacı 0 yapar). Sayaç 0 iken blok tutulamaz. İptal edilen bırakmada
hiçbir durum değişmez: sayaç, Usta Serisi, zamanlayıcılar, boya, komşu etkileri olduğu gibi kalır.
**Örnek:** Blok (2,6)'dan alınıp Vinç Alanı'nda (2,8)'de bırakılır → satır 3 → iptal, kalan hamle 12 → 12.
Aynı blok (4,7)'de bırakılır (o hücre boş) → satır 2 → kalan hamle 12 → 11.

### K-08 Yol kuralı ve yapışkan takip
**Kural:** Blok yalnızca birim ötelemelerle (±1 x ya da ±1 y), her ara konumda bütün hücreleri boş ve geçerli olacak
biçimde hareket eder (BFS). Diğer bloklar, kapalı duvar hücreleri, kasa, torba ve şantiye platformu geçilemez.
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
**Kural:** Serbest kipte blok, duvar sütunundaki her hücresi `y ≥ height` olacak biçimde duvarı aşar ve şantiye
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
**Örnek:** Geçit y=3, size=1. Sahada (4,3)–(5,3)'teki `D2_90` sağa ötelenir: (5,3)+duvar → duvar+(6,3) → (6,3)–(7,3);
bırakılır → satır 3'te kalır. Aynı geçide `D2_0` (1×2, satır 3–4) giremez: satır 4 geçit dışında.

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
**Kural:** K-16'nın herhangi bir koşulu bozulursa yerleşim hatalıdır: blok kırmızı parlar, sallanır (350 ms) ve geri
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
konumudur. Gölge konturu Kolay ve Normal bölümlerde doğru yerleşimde yeşil, hatalıda kırmızıdır ve cam kırılacaksa
çatlak simgesi taşır; Zor ve Çok Zor bölümlerde yalnızca konum gösterilir. Gölge açılmamış bir `?` hücresine değiyorsa
bütün zorluklarda kontur **nötr**dür (gizli bilgi sızmaz). Hafif yerçekiminde gölge yönlendirmesiz inişi gösterir.
Görsel stil design-lead'indir.
**Örnek:** Kolay bölüm, `C3_0` W'nin inişinde (7,3) Y hücresine denk geliyor → gölge kırmızı. Aynı durum Zor bölümde →
gölge yalnızca konumu gösterir.

---

## 4. Yerçekimi

### K-19 Şantiye yerçekimi (`gravity.build`)
**Kural:** Bölüm parametresidir; değerler:

| Ayar | Düşüş hızı (başlangıç, design-lead ince ayar) | Şantiye üstünde tutma | Cam kırılma eşiği (d > eşik ⇒ kırılır) | Yönlendirme |
|---|---|---|---|---|
| `low` (G-L) | 220 ms/satır | Sınırsız | 4 | Düşüş/yükseliş başına en çok 1 kez, komşu şantiye sütununa |
| `normal` | 60 ms/satır | Sınırsız | 3 | Yok |
| `high` (G-H) | 30 ms/satır | Serbest kipte bloğun bir hücresi şantiye sütununa değdiği andan 700 ms sonra blok o anki konumda zorla bırakılır; şantiye sütunlarından tamamen çıkınca sayaç sıfırlanır | 2 | Yok |

Gerçek zaman yalnızca G-H tutma süresinde ve G-L yönlendirme penceresinde vardır; solver ikisini de yok sayar.
Erişilebilirlik ayarı "Zaman baskısını azalt" açıksa G-H tutma süresi 1400 ms olur (design-lead UX_FLOWS ile).
**Örnek:** `high`, cam blok Vinç Alanı'nda (6,8)'de şantiyeye değdi; oyuncu 700 ms içinde (6,4)'e indiremedi, blok
(6,6)'da bırakıldı, iniş (6,2) → d=4 > 2 → kırılır.

### K-20 Saha yerçekimi (`gravity.yard`, varsayılan `false`)
**Kural:** `true` ise hamle sonu yerçekimi adımında (K-35 adım 6) altı boş kalan saha blokları düşer; bütün
desteksizler aynı anda 1'er satır iner, tekrar desteklenene kadar sürer (zincirleme). Destek: y=0 tabanı, Ahşap Kasa
(Y1) ya da desteklenen başka bir blok/torba. Balonlu bloklar (S8) bu adımda tavana doğru yükselir. Zincirli ve ıslak
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

### K-34 Alttan Üste (destek) kuralı — YENİ
**Kural:** Şantiyede bir yerleşimin doğru sayılması için, bloğun kapladığı her sütun `c` ve o sütundaki en alt hücre
satırı `r` için, plan satırları `0 … r−1` içindeki `.` olmayan her hücre doğru dolu olmalıdır. Yani yapı her sütunda
alttan üste kurulur; bir bloğun altında doldurulması gereken boş hücre (gömülü delik) bırakılamaz. `.` hücreleri bu
kuralda "dolu sayılır". Kural ray yerleşimi, balon, Vinç güçlendiricisi ve Altın Mala için de geçerlidir. Moloz ya da
yapışmış harçlı blok (yanlış bloklar) "doğru dolu" değildir; üstlerine doğru yerleşim yapılamaz.
**Gerekçe:** Brif K-16 "doğru blok = doğru renk + kalan boşluğa uyan şekil" der; açık gökyüzü kuralı (K-13) yüzünden
gömülü bir delik bir daha doldurulamaz ve bölüm sessizce çözümsüz kalırdı. Bu kural kilitlenmeyi kaynağında önler ve
gölge rengiyle (K-18) öğretilir.
**Örnek 1:** Plan `["WW","WW","WW","WW"]` (h=4), şantiyede yalnızca (6,0)–(6,1)'de doğru `D2_0` W var. `O4` W
bırakılır → top(6)=2, top(7)=0 → iniş (6,2): dört hücre de W (K-16 koşul 1 sağlanır) ama sütun 7'de r=2 ve (7,0),(7,1)
boş → K-34 bozulur → hatalı, gölge kırmızı. Doğru hamle: önce bir `D2_0` W'yi sütun 7'ye bırakmak.
**Örnek 2:** Plan (alttan) y0 `WW`, y1 `W.`, y2 `WW`. (6,0)–(7,0) ve (6,1) dolu. `D2_90` W rayla (6,2)–(7,2)'ye girer:
sütun 7'de r=2, satır 1 `.` (dolu sayılır), satır 0 dolu → doğru.

---

## 5. Hareketli şantiye

Şantiye modu `build.mode` ile seçilir: `segments` (S1, varsayılan) ya da `carousel` (S5). Asansör (S6) moddan bağımsız
bir eklentidir: `build.elevator` alanı varsa her iki modla birlikte çalışır (Bölüm 40'ta döner platform + asansör;
TECH_DESIGN S-16/P-6 ile uyumlu, bkz. Önerilen karar P-4).

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
Ön dilim tamamlanırsa (adım 8) dönüş hemen o hamlede yapılır ve `t = 0` olur; aynı hamlenin adım 10'unda ikinci kez
dönülmez. Partiler: parti 0 bölüm başında sahadadır; `k`'inci dilim tamamlandığında (hangi dilim olduğundan bağımsız)
`forSegment = k` olan parti teslim edilir. Bütün dilimler tamamlanınca bölüm kazanılır (ek hedefler de tamamsa).
`carouselEvery` 2–6 arasıdır.
**Örnek:** 3 dilim, `carouselEvery = 4`. Hamle 1–4 ön dilim 0; 4. hamle sonunda ön dilim 1. Dilim 1, 6. hamlede
tamamlanırsa ön dilim hemen 2 olur, `t=0`; 10. hamle sonunda ön dilim 0'a döner (dilim 1 atlanır).

### K-24 `elevator` — Asansör İskele (S6)
**Kural:** `build.elevator = { range: [a, b], start, dir }` (0 ≤ a < b ≤ 3, a ≤ start ≤ b, dir ∈ {+1, −1}). Şantiye
çerçevesinin ofseti `e` başta `start`'tır. Her hamle sonunda (adım 10) `e += dir`; `e` sınıra ulaşınca bir sonraki
hamlede yön döner (ping-pong). Plan satırı `r` tahta satırı `r + e`'dedir; `y < e` şantiye hücreleri platformdur
(dolu, destek). Şantiyedeki bütün bloklar çerçeveyle birlikte hareket eder. Duvar ve geçitler tahtaya sabittir; bu
yüzden bir geçidin açıldığı plan satırı `g.y − e`'dir. Doğrulayıcı: her dilim için `h + b ≤ 8`.
**Örnek:** `range [0,2]`, `start 0`, `dir +1` → hamle sonları: e = 1, 2, 1, 0, 1 … Geçit tahta satırı 3'te; e=0 iken plan
satırı 3'e, e=2 iken plan satırı 1'e açılır.

---

## 6. Malzeme teslimatı

### K-25 Partiler ve kamyon dökümü
**Kural:** `yard.batches[k]` k'inci partidir. Parti 0'ın blokları bölüm başında kendi `(x, y)` konumlarındadır.
Parti k ≥ 1 teslim edildiğinde blokları dizideki sırayla **kamyon kuyruğunun sonuna** eklenir ve hemen teslim denenir
(K-26). Bir bloğun teslimi: aday sol sütunlar önce bloğun `x`'i, sonra (varsa) `dropColumns` listesindeki sütunlar
sırasıyla, yoksa diğer bütün geçerli sütunlar `x`'e uzaklık sırasıyla (eşitlikte duvara yakın önce); her adayda blok
y = 10 − boy'dan **yerçekimi ayarından bağımsız** düşürülür ve ilk desteğe oturur; bütün hücreleri y ≤ 7 olan ilk aday
seçilir. Parti k ≥ 1 bloklarındaki `y` yok sayılır (veride 8 yazılır). Teslimat düşüşü sahadaki diğer blokları
oynatmaz, komşu etkisi (kasa, torba, zincir) üretmez.
**Örnek:** Parti 1: `[O4 G x=4, B1 R x=0]`. Sütun 4–5'in en üst dolu hücresi y=3 → `O4` (4,4)'e iner. Sütun 0 tamamen
dolu → `B1` için sırayla x=1 (uzaklık 1), x=2 … denenir; x=1'de y=6 boş → (1,6)'ya iner.

### K-26 Kuyruk
**Kural:** Yer bulamayan blok kuyrukta kalır. Hamle sonu adım 9'da kuyruktaki her blok sırayla (FIFO) bir kez denenir;
yerleşemeyen blok sonrakileri bekletmez. Arayüz "Kamyonda: N blok" gösterir (N = kuyruktaki blok sayısı; N=0 iken
gösterge gizli). Kuyruktaki bloklar tutulamaz, Çekiç'le hedeflenemez.
**Örnek:** Kuyrukta `[O4 W, B1 Y]`; sahada yalnızca (5,7) boş → `O4` sığmaz, kalır; `B1` (5,7)'ye iner; gösterge "1 blok".

### K-27 Parti içeriği
**Kural:** Her parti, o dilimi bitirmeye yetecek doğru blokları ve şaşırtmacaları (decoy) içerir. Doğrulayıcı her
renk için "o dilimin renk hücresi sayısı ≤ o ana kadar teslim edilmiş ve henüz kullanılmamış o renkteki ağır olmayan
blokların hücre toplamı" koşulunu solver çözümü üzerinde denetler; solver en az bir çözümün varlığını kanıtlar.
**Örnek:** Dilim 2'de 6 W hücresi var; parti 1'de W blokları `O4`+`D2_0` (6 hücre) + şaşırtma `C3` W (3) → geçerli.

---

## 7. Hamle, kazanma, kaybetme

### K-28 Kazanma
**Kural:** Hamle sonu adım 11'de bütün dilimler tamamlanmış ve bütün ek hedefler (K-41) karşılanmışsa bölüm kazanılır;
bu kontrol hamle sayacı 0 olsa bile kaybetmeden önce yapılır. Kalan her hamle "Bonus İnşaat" gösterisinde altına
dönüşür; elde kalan Altın Mala'lar da altına dönüşür (miktarlar META.md, `config/economy.json`).
**Örnek:** Son hamlede (kalan 0) son dilim tamamlanır → kazanma; bonus 0 hamle.

### K-29 Kaybetme ve +5 hamle teklifi
**Kural:** Adım 11'de hamle sayacı 0 ve bölüm kazanılmamışsa "Hamleler bitti!" penceresi açılır: +5 hamle teklifi
(altınla; deneme başına en çok 3 teklif, fiyatlar META.md; ödüllü reklam seçeneği entrepreneur kararı). Kabul edilirse
sayaç 5 olur ve oyun aynı durumdan sürer (zamanlayıcılar ilerlemez). Reddedilirse bölüm kaybedilir: 1 can gider,
galibiyet serisi sıfırlanır, Sallanan Köprü'deyse oyuncu elenir.
**Örnek:** Kalan 0, plan %90 dolu; oyuncu 900 altın öder → kalan 5, aynı tahta.

### K-30 Kilitlenme ve Kamyon Yardımı
**Kural:** Adım 12'de, bölüm sürüyorsa (kazanılmamış, sayaç > 0) şu kilitlenmeler aranır:
- **D1 Hamle yok:** hiçbir blok K-09'a göre tutulamıyor.
- **D2 Malzeme açığı:** bir renk `c` için, kalan bütün dilimlerdeki boş `c` hücre sayısı > sahadaki + kuyruktaki +
  teslim edilmemiş partilerdeki ağır olmayan `c` blokların hücre toplamı (bölümde `c` renkli Boya Kapısı varsa,
  o kapıdan geçebilen her ağır olmayan blok `c` sayılır).
- **D3 Döşeme/erişim (code-lead yöntemi):** solver kalan planın bu durumdan çözülemeyeceğini zaman bütçesi içinde
  kanıtlarsa. MVP'de D1 ve D2 zorunlu, D3 isteğe bağlıdır.
Tespit edilirse ücretsiz, hamle harcamayan **Kamyon Yardımı** çalışır: D1 → bütün zincirler ve ıslaklık kalkar;
hâlâ D1 ise saha yeniden dizilir. D2 → eksik hücre sayısı kadar o renkte `B1` kamyonla teslim edilir (K-25 yolu).
D3 → saha blokları, renk başına hücre toplamı korunarak yeniden şekillendirilip dizilir (TECH_DESIGN §9.7, S-19).
Her durumda sonuçta en az bir doğru yerleşim ≤ 2 hamlede ulaşılabilir olmalıdır. Yardımın sayısı sınırsızdır.
**Örnek:** Oyuncu Çekiç'le son `O4` R'yi kırdı; kalan planda 4 R hücresi, sahada R blok yok → D2 → kamyon 4 `B1` R getirir.

---

## 8. Örüntü mekanikleri

### K-31 Renk örüntüsü
**Kural:** Her dilim okunabilir bir desene dayanır: şerit (yatay bantlar), çapraz şerit (C3 çiftleri), dama, kemer
(`.` hücreleriyle), simetri ya da basit ikon. LEVELS.md her dilimin desen adını yazar; desen incelemesi product-lead
kontrol listesidir. Kodla test edilen kısım: bölümün plan renk sayısı hikaye bölümü sınırını aşmaz
(bölüm 1 → 3, bölüm 2 → 4, bölüm 3–5 → 5) ve yalnızca o bölüme kadar açılmış renkleri kullanır (brif §6).
**Örnek:** Bölüm 12 (hikaye bölümü 2) planında W, Y, O, C, R → 5 renk → hata `too_many_colors`.

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
da kasayla örtülüdür (doğrulayıcı). Hamle sonunda adım 5 (taşıma ve komşu etkilerinden sonra) ve adım 6'dan (saha
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
döndürür. Altın Mala kullanımı: oyuncu malaya, sonra aktif (öndeki) dilimde **K-34'ü sağlayan** boş, `.` olmayan bir
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
**Kural:** Son eylem bir sürükleme hamlesiyse (aradan güçlendirici, +5 teklifi ya da Kamyon Yardımı geçmemişse) o hamle
tamamen geri alınır: blok konumları ve renkleri, hamle sayacı (cam cezası ve harç maliyeti dahil), `m`, zamanlayıcılar,
seri sayacı, kazanılan Altın Mala, teslimatlar ve kuyruk, dilim geçişi, kırılan kasa katları, toplanan nesneler, hedef
sayaçları. Derinlik 1'dir: Geri Al'dan sonra yeni bir hamle yapılmadan ikinci Geri Al kullanılamaz. Kayıp penceresi
açıkken kullanılamaz.
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

### K-43 Duraklatma ve bölümden çıkma — YENİ
**Kural:** Duraklatma sırasında hiçbir şey ilerlemez (G-H sayacı ve animasyonlar dahil). Bölümden çıkış onay ister.
`m ≥ 1` iken çıkış **kayıp** sayılır (1 can, seri sıfırlanır, Köprü'de elenme). `m = 0` iken çıkış cezasızdır ve oyun
öncesi güçlendiriciler iade edilir. Uygulama bölüm ortasında kapanırsa bir sonraki açılışta aynı kurallarla çıkış
sayılır.
**Örnek:** 3 hamle yapıldı, oyuncu çıkar → can 5 → 4, seri 3 → 0.

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
1. Şema (TECH_DESIGN), `id` 1–50, `chapter = ceil(id/10)`.
2. Saha doluluğu %80–100 (K-02); parçalar ve engeller çakışmaz; bütün parti-0 hücreleri x ≤ 5, y ≤ 7.
3. Duvar: `0 ≤ height ≤ 8`; geçitler K-04 kısıtları; `paint` geçidinde `color`, `locked` geçidinde var olan `keyId`;
   `shutter` için `period ≥ 1`, `0 ≤ phase < 2·period`; `slider` için `range` geçidin `y`'sini içerir ve
   `range[1] + size ≤ height − 1`.
4. Plan: satırlar 2 karakter; renk sayısı ve açılmış renkler (K-31); `?` kuralları (K-32); asansörde `h + b ≤ 8`.
5. Şekiller ve ağırlık (K-44); bayrak birleşimleri (K-21, OBSTACLES matrisi).
6. Saklı nesneler başta örtülü (K-42); `collect`/`clear` sayıları ≤ nesne sayısı (K-41).
7. Moloz şantiye alanında ve kendi dilimine göre yanlış; her moloz `segment` alanı taşır (öneri P-5).
8. Solver: çözüm var; `moves ≥ min + tampon` (Kolay +8, Normal +5, Zor +3, Çok Zor +2); YAO ≥ %60 (K-46).
9. Öğretim: `teaches` alanındaki mekanik bu bölümden önce hiçbir bölümde yoktur; bölümde, önceki bölümlerde
   görülmemiş en çok 1 mekanik vardır.
**Örnek:** Bölüm 9'da geçit `size=1`, `y=6`, `height=6` → 6+1 > 5 → `gap_touches_top`.

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
| 1 | Blok bırakma konumuna taşınır. Sürükleme yolu bir Boya Kapısı'nın ray kipinden geçtiyse blok boyanır (W6, öneri P-6). G-H zorla bırakması sıradan bırakmadır. | K-10–K-12, W6 |
| 2 | Şantiyede serbest kipteyse: rüzgâr kayması (W8) → düşüş ya da balon yükselişi (S8) → G-L yönlendirmesi → iniş. Cam (S3) d > eşikse kırılır, K-17 hedefine döner, adım 3 atlanır. Sahada bırakılan balon burada yükselir. | K-11, K-19, W8, S3, S8 |
| 3 | Şantiyedeyse doğrulama: doğru → kilitle, `?` aç, seri +1, gerekirse Altın Mala; hatalı → harçlı blok yapışır (Y8), değilse geri seker (K-17), seri 0. | K-14, K-16, K-17, K-32, K-33, K-34, Y8 |
| 4 | Maliyet: sayaç −1 (cam kırıldıysa −2; yapışmış harçlı bloğun hamlesi −2), en az 0; `m += 1`. | K-07 |
| 5 | Komşu etkileri: taşınan bloğun **başlangıç** hücrelerinin 4-komşusu olan kasa 1 kat kaybeder (Y1), torba yırtılır (Y2), zincirli bloğun zinciri kalkar (Y3); her engel bu hamlede en çok 1 kez etkilenir. Ardından saklı nesne denetimi #1 (K-42). | Y1, Y2, Y3, K-42 |
| 6 | Saha yerçekimi: torbalar her zaman, diğer bloklar Y6 açıksa düşer; balonlar Y6 açıksa yükselir (K-20). Düşen her bloğun düşüş öncesi hücrelerine komşu engeller 5. adım kuralıyla etkilenir (bu hamlede daha önce etkilenen etkilenmez). Bir torba yırtıldıysa ya da kasa yok olduysa yerçekimi yeniden çalışır; değişiklik kalmayınca biter. Saklı nesne denetimi #2. | K-20, Y2, Y6, S8 |
| 7 | Hedef sayaçları güncellenir. | K-41 |
| 8 | Aktif (ya da öndeki) dilim tamamlandıysa: `segments` → kayma ve sonraki dilim; `carousel` → ön dilim sıradaki tamamlanmamış dilim, `t = 0`. Sıradaki parti kamyon kuyruğunun sonuna eklenir. | K-22, K-23, K-25 |
| 9 | Teslimat: kuyruktaki bütün bloklar FIFO sırasıyla birer kez denenir. | K-25, K-26 |
| 10 | Zamanlayıcılar, bu sırayla: Kepenk (W4) → Kayar Kapı (W5) → Döner Platform sayacı (S5) → Asansör (S6) → Islak Beton (Y4; bu hamlenin 9. adımında teslim edilen bloklar hariç) → Açık Kepenk süresi (K-40). | W4, W5, S5, S6, Y4 |
| 11 | Kazanma (K-28) → değilse hamle bitti mi (K-29). | K-28, K-29 |
| 12 | Oyun sürüyorsa kilitlenme denetimi ve Kamyon Yardımı (K-30). | K-30 |

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

**Birden fazla engelin aynı anda tetiklendiği örnek:** Bölümde kepenk (period 2, phase 1), asansör, ıslak beton ve
torba var. Oyuncu (3,4)–(4,4) `D2_90`'ı ((5,4) boş olduğundan tutulabilir) şantiyeye doğru bırakır, dilim tamamlanır.
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
| E-05 | Kepenk kapanırken şantiyede, geçit satırında raydan konmuş blok var | Blok yerinde kalır; kepenk yalnızca duvar sütununu kapatır, şantiye hücrelerini etkilemez | W4, K-12 |
| E-06 | Blok, bir hücresi geçit (duvar sütunu) içindeyken bırakılır | İptal, hamle harcanmaz; kepenk/kayar kapı sürükleme sırasında değişmediği için "kapanırken içinde blok" oluşamaz | K-04, K-07 |
| E-07 | Kayar kapı, sahada geçide komşu blok varken kayar | Hiçbir blok itilmez; kapı yalnızca duvar sütunundaki açık satırları değiştirir | W5 |
| E-08 | Asansör yükselirken şantiyede yapışmış harçlı blok var | Harçlı blok yalnızca bütün hücreleri plan alanında (renkli ya da `.`) ise yapışır, değilse geri seker; bu yüzden h + b ≤ 8 ile tahta dışına çıkamaz | Y8, K-24 |
| E-09 | Dilim Altın Mala ile tamamlanır | Mini hat: adım 8 kayma ve parti, 9 teslimat, 11 kazanma; `m` artmaz, zamanlayıcılar ilerlemez | K-33, K-35 |
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
| E-23 | Kamyon Yardımı D2 `B1`'leri getirirken saha dolu | `B1`'ler kuyruğa girer; D1 değildir çünkü üstteki bloklar tutulabilir | K-30 |
| E-24 | Harçlı blok `.` (pencere) hücresine yapışır | Dilim tamamlanamaz (K-15: dilim alanında fazladan blok); 2 hamlelik geri sürükleme ya da Çekiç gerekir | Y8, K-15 |
| E-25 | Boya kapısından geçip boyanan blok şantiyede hatalı yerleşir | Geri seker, yeni rengini korur (boya hamle kesinleşince kalıcıdır) | W6, K-17 |
| E-26 | Kalan son plan hücresi 1×1, o renkte yalnızca 2 hücreli bloklar var | D2 tetiklenmez (sayı yeter); D3 (solver) ya da Kamyon Yardımı şekil değişimi çözer | K-30 |
| E-27 | `build` tamamlandı, `clear` hedefi eksik | Oyun sürer; şantiyede boş hücre yoktur, her şantiye bırakması hatalıdır; oyuncu saha hamleleriyle hedefi bitirir. Bölüm tasarımı bunu kaçınır (LEVELS kontrol listesi) | K-28, K-41 |
| E-28 | Blok duvar üstünde, bir hücresi duvar sütununda, Vinç Alanı'nda bırakılır | İptal (duvar sütunu) | K-07 |
| E-29 | Sahada, başlangıçtan farklı ama yine saklı vidanın hücresini örten konuma bırakma | Hücre boş kalmadığı için vida toplanmaz | K-42 |
| E-30 | Hamle sayacı 0 iken bloğa dokunma | Tutulamaz; kayıp penceresi zaten açıktır | K-09 |
| E-31 | Islak blok teslimatla gelir (wetMoves 3) | Geldiği hamlede sayaç 3 kalır, sonraki 3 hamlenin 10. adımında 2, 1, 0 olur | Y4, K-35 |
| E-32 | Döner platformda ön dilime yapışmış harç varken dönüş | Harç dilimiyle birlikte döner; dilim onu kaldırmadan tamamlanamaz | S5, Y8 |

---

## 14. Veri alanı ekleri (code-lead'e)

Brif §12 veri tipine product-lead'in istediği ekler (kesin şema TECH_DESIGN'dadır):

| Alan | Tip | Neden |
|---|---|---|
| `build.elevator` | `{ range: [number, number]; start: number; dir: 1 \| -1 }` | Asansör moddan bağımsız (K-24, P-4) |
| `build.debris[].segment` | `number` (varsayılan 0) | Molozun hangi dilime ait olduğu (K-45/7, P-5) |
| `wall.gaps[].dir` (slider) | `1 \| -1` (varsayılan 1) | Kayar kapının ilk yönü (W5) |
| `PiecePlacement.y` (parti ≥ 1) | `8` yazılır, yok sayılır | Kamyon dökümü sütundan yapılır (K-25) |
| Hamle kaydı `drag.via` | `number` (geçit indeksi, isteğe bağlı) | Boya kapısından geçip sahaya dönen blok (W6, P-6) |

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
| S-8 | Bırakınca, düşüşten önce, 1 sütun; hedef duvar/kenar/dolu ise kayma yok; ray etkilenmez. **Ek:** bırakma anında d = 0 (blok siluete oturmuş) ise kayma yok (W8). |
| S-9 | **Farklı:** Şantiyede tavan aktif dilimin plan tepesidir (tahta satırı h + e); sahada y=7. Gerekçe ve öneri P-3. |
| S-10 | d > eşik; d bırakma satırından; geri sekme ve teslimat düşüşünde cam kırılmaz (S3). |
| S-11 | Kuyruğun sonuna (K-17). |
| S-12 | Evet, torba her zaman düşer (K-20). |
| S-13 | Moloz düşmez; moloz hiçbir plan hücresinde doğru olamaz (K-16 koşul 2). |
| S-14 | Zamanlayıcılar `m` (iptal olmayan hamle) başına 1 kez; cezalar yalnızca sayacı düşürür; güçlendirici ve teklif ilerletmez (K-35). |
| S-15 | Atlar; sayaç `t` her hamle +1, dönüşte ve dilim tamamlanınca 0 (K-23). |
| S-16 | `build.elevator` ayrı alan (K-24, P-4). |
| S-17 | Dilim içinde `period` satır aşağısı, zincirle (K-32). |
| S-18 | Minimum hamleli çözüm, eşitlikte en yüksek YAO; yönlendirme ve balon duvar üstü; Mala/Vinç sayılmaz (K-46). |
| S-19 | Evet, yalnızca D3'te; renk başına hücre toplamı korunur (K-30). |
| S-20 | Hatalı yerleşim (harç yapışması dahil) ve cam kırılması bozar; saha hamlesi bozmaz (K-33). |
| S-21 | **Farklı:** Sürükleme yolu boya kapısının ray kipinden geçen ve iptal edilmeyen her hamlede blok boyanır; sahaya geri dönse bile. Gerekçe: "boyahane" kullanımı duvar üstü yerleşimi (YAO) korur. Öneri P-6. |
| S-22 | Evet, açıldığı denetimde toplanır (K-42). |
| S-23 | Ping-pong; iptalde oynamaz (K-24). |
| S-24 | `period` hamle açık + `period` hamle kapalı; açık ⇔ `floor((m + phase) / period)` çift; `phase = 0` açık başlar (W4). |
| S-25 | Lig haftası UTC Pazartesi 00:00 (META). |
| S-26 | Düşen/yükselen bloğa dokunup sola/sağa en az 0,5 hücre sürükleme; düşüş başına 1 kez (G-L). Girdi biçimi design-lead'le kesinleşir. |
| S-27 | Evet; erişilebilirlik ayarıyla 1400 ms (K-19). |
| S-28 | Hayır (§10 genel). |
