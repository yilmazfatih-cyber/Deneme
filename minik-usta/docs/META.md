# Meta sistemler ve ekonomi

Sahip: product-lead · Sürüm: Faz 1 revizyonu (2026-10-04; R-07, R-09, R-13–R-17) · Kaynak: `docs/BRIEF.md` §10, `docs/BUSINESS.md` §4–§5
Makine okunur karşılıklar: `config/economy.json`, `config/events.json` (bu belgeyle birebir; çelişkide bu belge geçerlidir
ve JSON düzeltilir).

Para birimi tektir: **altın**. Bu belgedeki bütün miktarlar altındır. Gerçek para fiyatları, paket içerikleri ve reklam
tavanları entrepreneur'ündür (`BUSINESS.md` §4–§5); revizyon turunda verdiği değerler buraya ve JSON'a işlendi, oyun
dengesi açısından onaylandı (§9). Köprü harcama tavanı ve kumbara sayıları iki ajanın ortak değeridir (R-16); aynı
sayılar BUSINESS'ta da yazılıdır. Kapsam etiketleri: **MVP**, **MVP (onay bekliyor)** (proje sahibine soruldu), **Sonra**.

"Açılış N" = oyuncunun sıradaki bölümü N olduğunda (yani N−1 kazanıldığında) özellik görünür.

---

## 1. Yıldız ve kasaba görevleri

- Kazanılan her bölüm **1 yıldız** verir (Usta Modu tekrarları yıldız vermez). Zorluk yıldızı değiştirmez.
- Her hikaye bölümünün görevlerinin toplam maliyeti **10 yıldızdır** = o hikaye bölümündeki bölüm sayısı. Böylece 10
  bölümü bitiren oyuncu o bölümün bütün görevlerini yapabilir; yıldızlar birikir, sonraki hikaye bölümüne taşınır.
- Görev listesi, adları ve sırası **STORY §5'teki 35 görevdir** (5 hikaye bölümü × 7; R-07). Yıldız maliyetleri bu
  tabloda **kesindir**; STORY §5 aynı değerleri gösterir. İlk görevin maliyeti her hikaye bölümünde 1'dir.
- Görevler sırayla açılır (aynı anda tek görev baloncuğu). Görev yapılınca mini sahne oynar (≤ 2 s yapı animasyonu +
  tek satır, "Geç" var; STORY §5) ve kasaba ekranındaki yapı bir adım büyür.
- Bölümler görevlerle **kilitlenmez**.
- **Ara sahne tetikleyicileri (R-09, brif FTUE):**
  - Giriş `story.prologue` (3 panel): ilk açılışta, Bölüm 1'den önce (FTUE).
  - Hikaye bölümü N başlangıcı `story.chN.start`: o hikaye bölümünün **1. görevi** yapılınca, görevin mini sahnesinden
    sonra. Hikaye Bölümü 1 için bu, brifteki "Bölüm 1 → ana ekran → ilk yıldızı harcama → ilk ara sahne" sırasıdır;
    2–5 için de aynı kural geçerlidir (brif: "ara sahneler görevlerle açılır"; STORY §3 ile aynı).
  - Hikaye bölümü N bitişi `story.chN.end`: o hikaye bölümünün **son (7.) görevi** yapılınca (N = 5: büyük final).
  - Bir eylem en çok bir ara sahne oynatır; N−1 bitişi ile N başlangıcı ayrı görev dokunuşlarıdır, arka arkaya otomatik
    oynamaz. Görülen sahneler kayda yazılır.
- Kasaba ekranı, görevleri bitmemiş en eski hikaye bölümünü gösterir; oyuncu bölümlerde ileride olabilir.

| Hikaye bölümü | Görev (STORY §5; anahtarlar `town.ch{n}.t{m}.name` / `town.ch{n}.t{m}.scene`) | ★ | Toplam |
|---|---|---|---|
| 1 Ağaç Ev | 1 Ağaç basamakları · 2 Platform · 3 Duvarlar · 4 Pencere ve perde · 5 Çatı · 6 İp merdiven ve makara · 7 Bayrak ve tabela | 1 · 1 · 1 · 2 · 2 · 1 · 2 | 10 |
| 2 Mahalle Fırını | 1 Fırın temeli · 2 Fırın ağzı · 3 Tezgâh · 4 Vitrin · 5 Kiremit çatı · 6 Baca · 7 Bahçe masaları | 1 · 1 · 1 · 2 · 2 · 1 · 2 | 10 |
| 3 Okul Kütüphanesi | 1 Kurutma rafları · 2 Okuma minderleri · 3 Mozaik duvar · 4 Saat kulesi · 5 Büyük pencereler · 6 Bahçe duvarı · 7 Açılış kapısı | 1 · 1 · 2 · 1 · 2 · 1 · 2 | 10 |
| 4 Deniz Feneri ve Köprü | 1 Balıkçı iskelesi · 2 Fener gövdesi · 3 Fener lambası · 4 Martı yuvaları · 5 Köprü halatları · 6 Köprü tabliyesi · 7 Balıkçı kulübesi | 1 · 2 · 2 · 1 · 1 · 2 · 1 | 10 |
| 5 Festival Şatosu | 1 Hendek köprüsü · 2 Sol kule · 3 Büyük kapı · 4 Sağ kule · 5 Bayraklar · 6 Avlu ve sahne · 7 Festival ışıkları | 1 · 2 · 1 · 2 · 1 · 1 · 2 | 10 |

Birikimli maliyet her hikaye bölümünde 10'a ulaştığı için bitiş sahnesi en erken o hikaye bölümünün 10. bölümü
kazanılınca oynayabilir. Görev adları ve sahne metinleri design-lead'indir (STORY); sayı, sıra ve maliyet product-lead'in.

---

## 2. Can

| Kural | Değer |
|---|---|
| Azami can | 5 |
| Yenilenme | 30 dakikada 1, cihaz saatiyle; saat geri alınırsa yenileme o ana kadar durur (saat hilesi koruması yöntemi code-lead'in) |
| Can düşme | Bölüm başlarken 1 can **ayrılır**; kazanınca ve `m = 0` çıkışında iade edilir. Kayıp (K-29 teklif reddi) ya da `m ≥ 1` iken onaylı çıkış → ayrılan can gider. Uygulamanın kapanması kayıp **değildir**: bölüm kaldığı yerden sürer, can ayrılmış kalır (GDD K-43, R-13) |
| Can 0 | Bölüm başlatılamaz; pencere: "Tam can — 900 altın" · "Bekle (geri sayım)" · ödüllü reklam +1 can (günde 2, §3.3) |
| Sınırsız can | **MVP.** Sandık/ödülden gelen süreli durum (15 / 30 / 60 dk); süre içinde can ayrılmaz |
| Tam doldurma fiyatı | 900 altın (5 cana tamamlar) |

---

## 3. Altın: kazanma ve harcama

### 3.1 Bölüm ödülü

| Kalem | Kural | Miktar |
|---|---|---|
| Kazanma | zorluğa göre | Kolay 20 · Normal 30 · Zor 50 · Çok Zor 75 |
| Bonus İnşaat | kalan hamle başına, en çok 10 hamle sayılır | 3 / hamle (en çok 30) |
| Kalan Altın Mala | kazanınca elde kalan her mala | 10 / mala |
| Kayıp | — | 0 |

Örnek: Normal bölüm 4 hamle ve 1 malayla kazanıldı → 30 + 12 + 10 = 52 altın.

### 3.2 Altınla satılanlar (fiyatlar BUSINESS §5.4 ile aynı)

| Öğe | Altın | Not |
|---|---|---|
| +5 hamle (kayıp anında) | 900 → 1.350 → 1.800 | Fiyat teklif numarasına göre (`n` = 1, 2, 3). Deneme başına en çok 3 teklif; **reklamla alınan +5 de sayılır** (R-15); 4. yok. Ömürde ilk teklif ücretsiz ("Usta Dede'den hediye", teklif 1'e sayılır; **MVP**). Köprü'de aynı fiyat + tur tavanı 4.050 (§6.1) |
| Tam can | 900 | |
| Geri Al | 300 | |
| Çekiç | 600 | |
| Boya Fırçası | 600 | |
| Vinç | 900 | |
| Termos (+3 hamle) | 450 | 150/hamle < 180/hamle (+5 teklifi) — E6 |
| Mala Başlangıcı | 600 | |
| Açık Kepenk | 600 | W4/W7 olmayan bölümde seçilemez (GDD K-40) |

Başlangıç cüzdanı: **500 altın**, 5 can, güçlendirici yok (açılışta ücretsiz denemeler gelir).

Altın fiyatlarının yanında gerçek para karşılığı gösterilir (BUSINESS E2): `economy.json` → `priceDisplay.referenceSku`
paketinin (`coins_1000`) birim fiyatı × altın; MVP'de "test sürümü" etiketiyle, mağaza sürümünde mağaza fiyatından.

### 3.3 Ödüllü reklam tavanları (entrepreneur kararı, BUSINESS §4.3; MVP'de sahte reklam)

| Yerleşim | Tavan |
|---|---|
| +1 can (can 0 penceresi) | günde 2 |
| +5 hamle ("Hamleler bitti") | deneme başına 1, günde 3; 3 teklif sınırına sayılır (R-15) |
| Günlük ödül altını ×2 | günde 1 |
| Toplam | günde 6 |

Gün = yerel takvim günü. Tavanlar ödeme geçmişinden bağımsızdır.

---

## 4. Güçlendirici açılışları ve ücretsiz denemeler

Açılış bölümünde öğretici adımı vardır; ücretsiz denemeler o an envantere eklenir.

| Güçlendirici | Tür | Açılış | Ücretsiz deneme | Öğretici bağlamı |
|---|---|---|---|---|
| Çekiç | bölüm içi | 8 | 3 | Ağır paleti kır (isteğe bağlı kısayol) |
| Vinç | bölüm içi | 10 | 2 | Gömülü bloğu döndürüp şantiyeye koy |
| Termos | oyun öncesi | 12 | 3 | Bölüm öncesi yuvası vurgulanır |
| Geri Al | bölüm içi | 13 | 3 | Kepenk kaçırılınca son hamleyi geri al |
| Mala Başlangıcı | oyun öncesi | 16 | 2 | |
| Açık Kepenk | oyun öncesi | 20 | 2 | Bölüm 20'de kepenk + kayar kapı |
| Boya Fırçası | bölüm içi | 22 | 2 | Boya kapısıyla birlikte |

---

## 5. Galibiyet serisi

- Açılış 15. Seri sayacı `s` = art arda kazanılan bölüm sayısı (Usta Modu dahil, **MVP**). Kayıp (K-29) ve `m ≥ 1` iken
  onaylı çıkış `s = 0` yapar; `m = 0` iken çıkış seriyi bozmaz ve verilen başlangıç bonusu **tüketilmez** (bir sonraki
  girişte aynen verilir; GDD K-43, E-41). Uygulama kapanması seriyi bozmaz (K-43).
- "Hamleler bitti" (+5 teklif) penceresinde seri kaybı yazılmaz ve gösterilmez; seri sıfırlanması yalnızca sonuç
  penceresinde bildirilir (entrepreneur önerisi KABUL).
- Bölüm başında bonus `s`'ye göre uygulanır (oyun öncesi güçlendiricilerle toplanır, GDD K-40):

| Kademe | Koşul | Başlangıç bonusu |
|---|---|---|
| 0 | s = 0 | — |
| 1 | s = 1 | +1 Altın Mala |
| 2 | s = 2 | +1 Altın Mala, +2 hamle |
| 3 | s ≥ 3 | +2 Altın Mala, +3 hamle |

- Bölüm öncesi pencerede 3 kademeli gösterge görünür. Bot kazanma oranı hedefleri (LEVELS) **kademe 0** ile ölçülür;
  seri bonusu ustalık ödülüdür.
- **Sonra (soft launch A/B adayı):** kayıpta seri 0'a değil 1 kademe aşağı insin. Köprü içi +5 gelir payı > %25 çıkarsa
  (BUSINESS §6.2) test öne alınır.

---

## 6. Sallanan Köprü (100 kişi, 7 bölüm art arda)

### 6.1 Kurallar

| Kural | Değer |
|---|---|
| Açılış | 15 |
| Katılım | Etkinlik ikonundan "Katıl" (kural kartı: kaybedersen elenirsin, +5 hamleyle devam edebilirsin, havuz, süre) |
| Katılımcılar | Oyuncu + 99 bot ("Renkli Tepe çırakları"; açıkça bot etiketli, adlar STORY `npc.apprentice.*`, gerçek insan adı yok; Köprü ekranında etiket + kural kartı — BUSINESS P-5, R-14) |
| Tahta sayısı | 7. Katılımdan sonra **başlatılan** her kazanılmış bölüm = +1 tahta |
| Elenme | Kayıp (K-29'da teklif reddi) ya da `m ≥ 1` iken onaylı çıkış → oyuncu suya düşer, simitle kıyıya yüzer, elenir. Uygulama kapanması elemez (K-43). Kayıp/elenme ekranında kalan oyuncu sayacı ve baskı metni gösterilmez (R-15) |
| +5 hamle | Elenmeyi önler; fiyat etkinlik dışıyla aynı (900/1.350/1.800, deneme başına en çok 3, reklam dahil). **Tur harcama tavanı: 4.050 altın** (= 900 + 1.350 + 1.800, tek denemenin tam eskalasyonu; R-16, BUSINESS ile ortak değer). Altın seçeneği yalnızca `tur harcaması + fiyat ≤ 4.050` iken sunulur; değilse pencerede yalnız reklam (hakkı varsa) ve "Bırak" kalır. Reklam seçeneği tavandan bağımsızdır |
| Süre | Katılımdan itibaren 6 saat (`durationMinutes 360`). Süre içinde başlatılan bölüm, süre dolduktan sonra bitse de sayılır |
| Süre dolarsa (7 tahta yok) | Ödül yok; "Süre doldu" (elenme mesajı değil) |
| Ödül havuzu | 10.000 altın; 7. tahtaya ulaşan herkes (oyuncu + botlar) eşit böler: `floor(10000 / bitirenSayısı)` |
| Ödeme anı | `T_öde = min(T_son, max(T_oyuncu, T_bot))`. `T_son` = `t_0 + durationMinutes` (oyuncunun süre içinde başlattığı bölüm sürüyorsa o bölümün bitişi); `T_oyuncu` = oyuncunun bitirdiği ya da elendiği an (oyunda ise ∞); `T_bot` = botların son olay anı (her bot 7. tahtada ya da elenmeyle biter; en çok 7 deneme) |
| Bekleme | Etkinlik bitince 120 dk sonra yeni etkinlik açılır |
| Canlı sayaç | "Köprüde kalan: N/100" = 100 − elenenler; bitirenler köprünün ucunda görünür |
| Usta Modu | 50'den sonra Usta Modu galibiyetleri tahta sayar |

### 6.2 Bot beceri modeli (deterministik)

Bütün rastgelelik `R(a, b, c) ∈ [0, 1)` ile üretilir: `seed = hash(eventId, a, b, c)` ile mulberry32'nin ilk çıktısı.
`eventId` = katılım zaman damgası (dakika) + etkinlik sıra numarası. **Oyuncunun ödeme geçmişi, cüzdanı, oturum
davranışı modele girmez** (BUSINESS E8).

1. Bot `i` (1…99) beceri: `s_i = 0,50 + 0,45 · R(i, 0, 0)` → [0,50; 0,95).
2. Bot `i`'nin `k`'inci denemesinin zamanı (dakika): `t_{i,k} = t_0 + Σ_{j=1..k} (3 + floor(13 · R(i, j, 1)))`
   → denemeler arası 3–15 dk.
3. Denemenin zorluğu `d_k`: oyuncunun katıldığı andaki sıradaki bölümü `L_0` ise bölüm `L_0 + k − 1`'in zorluk
   etiketi (50'yi aşarsa Usta Modu sırası). Botlar oyuncunun karşılaşacağı zorluklarla yarışır.
4. Kazanma olasılığı: `p_{i,k} = min(0,97, max(0,05, s_i · f(d_k)))`, `f(Kolay) = 1,10`, `f(Normal) = 1,00`,
   `f(Zor) = 0,80`, `f(Çok Zor) = 0,65`.
5. Sonuç: `R(i, k, 2) < p_{i,k}` ise bot `t_{i,k}`'da 1 tahta ilerler; değilse `t_{i,k}`'da elenir. 7. tahtada biter.
6. `t` anındaki durum yalnızca `(eventId, t_0, t, L_0)`'ın fonksiyonudur; uygulama yeniden açılınca aynı durum
   hesaplanır.
7. Bot denemesi yalnızca `t_{i,k} ≤ t_0 + durationMinutes` ise yapılır; sonraki denemeler yok sayılır.
8. `hash` = `fmix32-chain-v1` (murmur3 fmix32 zinciri; TECH_DESIGN §2.7 `hash32`; referans vektörleri testte). Bu
   modelde yalnızca dört işlem (+ − × ÷) ve karşılaştırma kullanılır; IEEE 754 sonucu motorlar arasında aynıdır.

**Saflık (R-14, BUSINESS E8):** bot modülü saf fonksiyondur; yalnızca `config/events.json`, `(eventId, t_0, t, L_0)` ve
bölüm zorluk tablosunu okur. `config/economy.json`'u ve oyuncu kaydını **import etmez** (lint kuralı, code-lead). Test:
ödeme geçmişi farklı iki kayıtla aynı girdiler → bit bit aynı bot durumu.

**Beklenen sonuçlar (hepsi Normal bölümler):** botun 7 tahtayı bitirme olasılığı `s_i^7`; ortalaması
`(0,95^8 − 0,50^8) / (8 · 0,45) ≈ 0,18` → ≈ 18 bot biter. 7 denemeden 1–2'si Zor ise ≈ 11–14 bot. Oyuncu biterse payı
≈ 10.000 / 15 ≈ 650 altın. Bir botun bitirme süresi ortalama 7 × 9 = 63 dk (21–105 dk) → 6 saatlik pencere oyuncuya
rahat zaman bırakır.

**Koruma (entrepreneur önerisi KABUL):** beklenen bitiren payı (≈ 650) < ilk +5 fiyatı (900): +5'e altın harcamak ödül
havuzu için "rasyonel yatırım" olmaz. Havuz ya da bot becerisi değişirse bu eşitsizlik Faz 3 ekonomi simülasyonunda
doğrulanır.

---

## 7. Usta Ligi (haftalık, 100 kişi)

### 7.1 Kurallar

| Kural | Değer |
|---|---|
| Açılış | 25 |
| Hafta | UTC Pazartesi 00:00 → sonraki Pazartesi 00:00 (deterministik; TECH_DESIGN S-25) |
| Gruba giriş | Haftanın ilk kazanılan bölümünde 99 botlu gruba girilir; `groupId = hash(weekId, installId)` (ödemeden bağımsız, oyuncuya özgü) |
| Katılımcılar | Oyuncu + 99 bot ("Renkli Tepe çırakları"; açıkça bot etiketli, adlar STORY `npc.apprentice.*`; lig ekranında etiket + kural kartı — R-14) |
| Puan | Kolay/Normal galibiyet 1 · Zor 2 · Çok Zor 3 (Usta Modu dahil). Kayıp puan düşürmez |
| Ligler | Bronz Mala → Gümüş Mala → Altın Mala → Elmas Mala. Yeni oyuncu Bronz'dan başlar |
| Terfi / düşme | İlk 20 bir üst lige (Elmas'ta kalır), son 20 bir alt lige (Bronz'da kalır), diğerleri aynı ligde |
| Eşitlik | Aynı puanda o puana daha erken ulaşan üstte |
| Hafta sonu | Sıralama dondurulur, ödül sandığı bir sonraki açılışta verilir |

### 7.2 Ödüller (içerik sabit ve açmadan önce görünür — BUSINESS E1)

| Sıra | Bronz Mala (taban) |
|---|---|
| 1 | Lig sandığı: 300 altın + 1 Vinç + 1 Çekiç + 30 dk sınırsız can |
| 2 | Lig sandığı: 200 altın + 1 Çekiç + 1 Termos |
| 3 | Lig sandığı: 150 altın + 1 Termos |
| 4–20 | 60 altın |
| 21–50 | 25 altın |
| 51–100 | — |

Lig çarpanı (yalnızca altına uygulanır): Bronz ×1 · Gümüş ×1,5 · Altın ×2 · Elmas ×3.

### 7.3 Bot puan modeli (deterministik)

`R` §6.2'deki gibi, `seed = hash(weekId, groupId, …)`.

1. Haftalık hedef: `W_i = M_lig · 100 · u_i²`, `u_i = R(i, 0, 0)`. `M_lig`: Bronz 0,6 · Gümüş 0,8 · Altın 1,0 · Elmas 1,3.
2. Oyuncu haftanın `x_0` kesrinde gruba girdiyse (0 ≤ x_0 < 1) botların hedefi kalan süreye ölçeklenir:
   `W'_i = W_i · (1 − x_0)`.
3. `t` anında bot puanı: `P_i(t) = floor(W'_i · g_{p_i}(x) / 1000)`, `x = (t − t_giriş) / (t_hafta_sonu − t_giriş)`
   ∈ [0, 1]. Profil `p_i = floor(5 · R(i, 0, 1))` ∈ {0…4} (erken → geç oynayan; eğri üssü 0,8 / 0,9 / 1,0 / 1,1 / 1,2).
   `g_p` **sabit tamsayı tablodan** doğrusal ara değerdir (`Math.pow` yok; motorlar arası bit-aynı): `j = min(19,
   floor(20x))`, `g = T_p[j] + (T_p[j+1] − T_p[j]) · (20x − j)`. Tablo `events.json` → `masterLeague.bot.curveTable`
   (21 nokta, ‰; `T_p[j] = round(1000 · (j/20)^{üs})`). Örnek: p = 2 (doğrusal) → x = 0,5 → g = 500.

**Beklenen eşikler (tam hafta):** 20. sıradaki bot `u ≈ 0,8` → Bronz'da ≈ 38, Elmas'ta ≈ 83 puan. 80. sıradaki bot
`u ≈ 0,2` → Bronz'da ≈ 2 puan. Günde 4–5 galibiyet alan oyuncu Bronz'dan terfi eder; haftada 3 galibiyet düşmeyi önler.

---

## 8. Diğer sistemler

### 8.1 Günlük ödül

- Açılış: kurulumdan sonraki 2. takvim günü (yerel saat). Takvim günü başına 1 alım.
- 7 günlük döngü; bir gün kaçırılırsa döngü **sıfırlanmaz, kaldığı yerden sürer** (BUSINESS E10).

| Gün | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| Ödül | 50 altın | 1 Çekiç | 75 altın | 1 Termos | 100 altın | 1 Geri Al | 200 altın + 1 Vinç + 15 dk sınırsız can |

Ödüllü reklamla ×2 (yalnızca altın; günde 1; §3.3).

### 8.2 Bölüm sandığı

Her 10 bölümde bir; sandık ilerleme çubuğu bölüm 1'den görünür, 10, 20, 30, 40, 50 kazanılınca açılır. İçerik sabittir
ve ilerleme çubuğunun yanında açılmadan önce görünür (BUSINESS E1).

| Kazanılan bölüm | İçerik |
|---|---|
| 10 | 200 altın + 1 Çekiç + 1 Termos |
| 20 | 250 altın + 1 Vinç + 1 Mala Başlangıcı |
| 30 | 300 altın + 1 Boya Fırçası + 1 Açık Kepenk + 30 dk sınırsız can |
| 40 | 350 altın + 2 Çekiç + 1 Vinç |
| 50 | 500 altın + her güçlendiriciden 1 + 60 dk sınırsız can |

### 8.3 Kumbara (R-16; entrepreneur ile ortak değerler)

- Açılış 20. Her galibiyet kumbaraya altın ekler (kırılmadan harcanamaz): Kolay/Normal **50** · Zor **75** · Çok Zor
  **100** (Usta Modu'nda bölümün özgün etiketi).
- Kırılabilir eşik **1.000** altın; kapasite **2.000** altın (dolunca dolmaz, "Dolu" görünür).
- Kırma bir satın alımdır: **$1,99 / 89,99 TL** (`piggy_break`). Kırılınca içerik cüzdana geçer, kumbara 0'a döner.
- Doğrulama kuralı (`config:validate`): eşikteki altın/$ ≥ referans paketin (`coins_1000`) altın/$'ı (1.000 / 1,99 ≥
  1.000 / 1,99 ✓); dolu kumbara ≈ 2 kat değer.
- Hız: 20. bölümden sonra ≈ 20 galibiyette eşik (≈ 40. bölüm), dolu hali Usta Modu'nda. Kumbara ödemeyen oyuncu için
  kaynak değildir.

### 8.4 Mağaza (MVP'de sahte satın alma; fiyatlar entrepreneur'ün, BUSINESS §5)

Açılış 5. Paketlerde "en popüler / en iyi değer" etiketi yok; kartta altın, fiyat ve taban pakete göre değer yüzdesi.

| SKU | Altın | USD | TRY |
|---|---|---|---|
| `coins_1000` (referans) | 1.000 | 1,99 | 89,99 |
| `coins_2750` | 2.750 | 4,99 | 219,99 |
| `coins_6000` | 6.000 | 9,99 | 449,99 |
| `coins_13000` | 13.000 | 19,99 | 899,99 |
| `coins_35000` | 35.000 | 49,99 | 2.249,99 |
| `coins_75000` | 75.000 | 99,99 | 4.499,99 |
| `starter` (ömürde 1, süresiz) | 2.500 + 2 Çekiç + 1 Vinç + 2 Termos | 1,99 | 89,99 |

Denge notu: en küçük paket ≈ 1,1 kez +5 (900) alır; başlangıç paketi ≈ 2,8 kez. Mağaza sürümünde fiyat metni mağazadan
gelir; JSON'daki USD/TRY yalnızca MVP gösterimi içindir.

### 8.5 İçerik sonu (50'den sonra): Usta Modu — **MVP (onay bekliyor)** (R-17; öneri P-8, entrepreneur destekliyor)

- 11–50. bölümler sırayla, sonra yeniden 11: `11, 12, …, 50, 11, …` (`masterMode.levels`).
- Hamle bütçesi `solver minimumu + 2` (bütün zorluklarda); yıldız yok.
- Altın ödülü, kumbara katkısı, lig puanı ve bot zorluğu (§6.2 `d_k`) bölümün **özgün** zorluk etiketinden hesaplanır
  (bütçe daralması enflasyon yaratmaz).
- Galibiyetler galibiyet serisine, Sallanan Köprü'ye ve Usta Ligi'ne sayılır.
- Bölüm sandığı yerine her 10 Usta Modu galibiyetinde **Usta Sandığı**: 250 altın + 1 Çekiç (sabit içerik, açmadan önce
  görünür; E1).
- "Yeni bölümler yolda" bandı ana ekranda kalır. Giriş kartı metni design-lead'in ("Usta Modu: bildiğin bölümler, daha
  az hamle." önerisi).

---

## 9. Kaynak / harcama (source / sink) tablosu

Ödemeyen, Normal ağırlıklı ilerleyen, orta kazanma oranlı (%70) bir oyuncu için **10 bölüm başına** tahmin
(Faz 3 ekonomi simülasyonu doğrular):

| Kaynak | Hesap | Altın / 10 bölüm |
|---|---|---|
| Bölüm galibiyeti | 10 × (ortalama taban 33 + bonus 5 hamle × 3 = 15) | 480 |
| Kalan Altın Mala | 10 × 0,5 mala × 10 | 50 |
| Bölüm sandığı (1–50) | (200 + 250 + 300 + 350 + 500) / 5 | 320 |
| Günlük ödül | ≈ 1,5 gün × 61 altın/gün (döngü altını 425 / 7) | 90 |
| Sallanan Köprü | 10 bölümde 1 etkinlik × P(bitirme) × 650; P = 0,08 (yalın: 0,7⁷) … 0,25 (seri bonusu + kurtarmayla; Faz 3 ölçer) | 50–160 |
| Usta Ligi | 10 bölümde ≈ 0,3 hafta × 60 | 20 |
| **Toplam (1–50)** | | **≈ 1.010–1.120** |

Usta Modu (50 sonrası): bölüm sandığı yerine Usta Sandığı (250); bütçe `min + 2` olduğu için bonus ≈ 1 hamle → galibiyet
10 × (33 + 3) = 360, mala ≈ 30 → **≈ 800–910 / 10 galibiyet** (tahmin; Faz 3 ölçer, taban için aşağıya bakın).

| Harcama | Fiyat | Not |
|---|---|---|
| +5 hamle | 900 / 1.350 / 1.800 | En sık harcama; reklam alternatifi §3.3 |
| Tam can | 900 | |
| Bölüm içi güçlendirici | 300–900 | |
| Oyun öncesi güçlendirici | 450–600 | |

**Denge ölçütleri (R-16; entrepreneur'ün iki ölçüsü — Faz 3 ekonomi simülasyonu ve soft launch'ta ölçülür, tahmin
bantları):**
- (a) **Altın bakiye bandı:** ödemeyen oyuncunun medyan altın bakiyesi 11–50. bölümlerde 400–1.500. Alarm: 30. bölümde
  medyan > 2.500 (paketler değer kaybeder) ya da 10 bölüm boyunca < 200 (hayal kırıklığı riski).
- (b) **Kayıp kurtarma karışımı** (ödemeyen oyuncu): altınla %15–25, reklamla %30–40, kurtarılmayan %40–50.
- **Taban (adalet):** 10 bölümlük gelir ≥ 900 → ödemeyen oyuncu 10 bölümde en az 1 kez +5'i altınla alabilir
  (BUSINESS §5.4). 1–50'de sağlanır (≈ 1.010–1.120). Usta Modu tahmini (≈ 800–910) tabana yakındır: Faz 3 ölçümü < 900
  çıkarsa Usta Sandığı altını entrepreneur ile birlikte yükseltilir (açık soru, closure).
- Önceki "10 bölümde 2 kez +5 alamamalı" üst sınırı **kaldırıldı**: ödemeyen oyuncuda dönüşümü altın kıtlığı değil reklam
  tavanı belirler; kazanma oranı farklı oyuncularda aynı tavan farklı baskı üretir.
- Ölçüm olayları: `coin_source`, `coin_sink`, `event_continue`, `level_end.durationMs` (code-lead, ANALYTICS).

Kumbara kaynak değildir (yalnızca satın alımla açılır): 10 galibiyet × ≈ 55 ≈ 550 altın / 10 bölüm birikir; 1.000 eşiğine
≈ 20 galibiyette ulaşır.

**Bonuslar ve güçlendirici kaynakları (10 bölüm başına):** sandık ≈ 2,4 güçlendirici, günlük ≈ 0,6, lig ≈ 0,1;
ücretsiz denemeler (toplam 17) yalnızca açılışta.
