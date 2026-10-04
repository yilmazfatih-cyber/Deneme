# Meta sistemler ve ekonomi

Sahip: product-lead · Sürüm: Faz 1 taslağı (2026-10-04) · Kaynak: `docs/BRIEF.md` §10, `docs/BUSINESS.md` §4–§5
Makine okunur karşılıklar: `config/economy.json`, `config/events.json` (bu belgeyle birebir; çelişkide bu belge geçerlidir
ve JSON düzeltilir).

Para birimi tektir: **altın**. Bu belgedeki bütün miktarlar altındır. Gerçek para fiyatları, altın paketleri, kumbara
ve paket fiyatları entrepreneur'ündür (`BUSINESS.md` §5); bunlara bağlı her yer "entrepreneur ile netleşecek" diye
işaretlidir. Altınla satılan öğelerin altın fiyatları entrepreneur'ün önerisiyle (BUSINESS §5.4) aynı tutuldu ve oyun
dengesi açısından onaylandı (§9).

"Açılış N" = oyuncunun sıradaki bölümü N olduğunda (yani N−1 kazanıldığında) özellik görünür.

---

## 1. Yıldız ve kasaba görevleri

- Kazanılan her bölüm **1 yıldız** verir (Usta Modu tekrarları yıldız vermez). Zorluk yıldızı değiştirmez.
- Her hikaye bölümünün görevlerinin toplam maliyeti **10 yıldızdır** = o hikaye bölümündeki bölüm sayısı. Böylece 10
  bölümü bitiren oyuncu o bölümün bütün görevlerini yapabilir; yıldızlar birikir, sonraki hikaye bölümüne taşınır.
- Görevler sırayla açılır (aynı anda tek görev baloncuğu). Görev yapılınca kısa sahne oynar (≤ 6 sn, "Geç" var) ve
  kasaba ekranındaki yapı bir adım büyür.
- Bölümler görevlerle **kilitlenmez**. Hikaye bölümü ara sahneleri: giriş sahnesi o hikaye bölümünün ilk görevi
  açıldığında (Hikaye Bölümü 1 için FTUE'deki 3 panelli giriş), bitiş sahnesi son görev yapılınca oynar.
- Kasaba ekranı, görevleri bitmemiş en eski hikaye bölümünü gösterir; oyuncu bölümlerde ileride olabilir.

| Hikaye bölümü | Görev (i18n anahtarı) | ★ | Toplam |
|---|---|---|---|
| 1 Ağaç Ev | 1 Bahçeyi temizle (`town.c1.t1`) · 2 Ağaca merdiven kur (`t2`) · 3 Platformu çak (`t3`) · 4 Duvarları ve pencereyi tak (`t4`) · 5 Çatıyı ört (`t5`) · 6 "Minik Usta İnşaat" tabelasını as (`t6`) | 1 · 1 · 2 · 2 · 2 · 2 | 10 |
| 2 Mahalle Fırını | 1 Çöken bacanın enkazını kaldır · 2 Temeli dök · 3 Tezgâhı kur · 4 Vitrini tak · 5 Bacayı ör · 6 Un çuvallarını diz · 7 Tabelayı boya ve açılışı yap | 1 · 1 · 1 · 2 · 2 · 1 · 2 | 10 |
| 3 Okul Kütüphanesi | 1 Suyu tahliye et · 2 Pencereleri tak · 3 Rafları boya · 4 Okuma köşesini döşe · 5 Saat kulesini kur · 6 Mozaik duvarı tamamla · 7 Açılış kurdelesini kes | 1 · 1 · 2 · 1 · 2 · 1 · 2 | 10 |
| 4 Deniz Feneri ve Köprü | 1 Balıkçı iskelesini onar · 2 Fener gövdesini yükselt · 3 Fener odasını kur · 4 Martı yuvalarını yap · 5 Köprü ayaklarını dik · 6 Halatları ger · 7 Tabliyeyi döşe · 8 Feneri yak | 1 · 1 · 1 · 1 · 1 · 2 · 1 · 2 | 10 |
| 5 Festival Şatosu | 1 Hendek köprüsünü kur · 2 Sol kuleyi yükselt · 3 Büyük kapıyı tak · 4 Sağ kuleyi yükselt · 5 Bayrakları as · 6 Avluyu döşe · 7 Festival ışıklarını yak · 8 Kurdeleyi kes ("Yılın Firması") | 1 · 1 · 2 · 1 · 1 · 1 · 1 · 2 | 10 |

Görev adları ve sahne metinleri STORY.md (design-lead) ile uyumlanır; maliyetler ve sıra product-lead'indir.

---

## 2. Can

| Kural | Değer |
|---|---|
| Azami can | 5 |
| Yenilenme | 30 dakikada 1, cihaz saatiyle; saat geri alınırsa yenileme o ana kadar durur (saat hilesi koruması yöntemi code-lead'in) |
| Can düşme | Bölüm başlarken 1 can **ayrılır**; kazanınca iade edilir. Kayıp, `m ≥ 1` iken çıkış ya da uygulamanın bölüm ortasında kapanması → ayrılan can gider (GDD K-29, K-43) |
| Can 0 | Bölüm başlatılamaz; pencere: "Tam can — 900 altın" · "Bekle (geri sayım)" · ödüllü reklam +1 can (günde 2; entrepreneur ile netleşecek) |
| Sınırsız can | Sandık/ödülden gelen süreli durum (15 / 30 / 60 dk); süre içinde can ayrılmaz |
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
| +5 hamle (kayıp anında) | 900 → 1.350 → 1.800 | Deneme başına en çok 3 teklif; 4. yok. Köprü'de aynı fiyat |
| Tam can | 900 | |
| Geri Al | 300 | |
| Çekiç | 600 | |
| Boya Fırçası | 600 | |
| Vinç | 900 | |
| Termos (+3 hamle) | 450 | 150/hamle < 180/hamle (+5 teklifi) — E6 |
| Mala Başlangıcı | 600 | |
| Açık Kepenk | 600 | W4/W7 olmayan bölümde seçilemez (GDD K-40) |

Başlangıç cüzdanı: **500 altın**, 5 can, güçlendirici yok (açılışta ücretsiz denemeler gelir).

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

- Açılış 15. Seri sayacı `s` = art arda kazanılan bölüm sayısı (Usta Modu dahil). Kayıp (K-29) ve `m ≥ 1` iken çıkış
  `s = 0` yapar; `m = 0` iken çıkış seriyi bozmaz.
- Bölüm başında bonus `s`'ye göre uygulanır (oyun öncesi güçlendiricilerle toplanır, GDD K-40):

| Kademe | Koşul | Başlangıç bonusu |
|---|---|---|
| 0 | s = 0 | — |
| 1 | s = 1 | +1 Altın Mala |
| 2 | s = 2 | +1 Altın Mala, +2 hamle |
| 3 | s ≥ 3 | +2 Altın Mala, +3 hamle |

- Bölüm öncesi pencerede 3 kademeli gösterge görünür. Bot kazanma oranı hedefleri (LEVELS) **kademe 0** ile ölçülür;
  seri bonusu ustalık ödülüdür.

---

## 6. Sallanan Köprü (100 kişi, 7 bölüm art arda)

### 6.1 Kurallar

| Kural | Değer |
|---|---|
| Açılış | 15 |
| Katılım | Etkinlik ikonundan "Katıl" (kural kartı: kaybedersen elenirsin, +5 hamleyle devam edebilirsin, havuz, süre) |
| Katılımcılar | Oyuncu + 99 bot ("Renkli Tepe çırakları"; açıkça bot etiketli — BUSINESS §4.6) |
| Tahta sayısı | 7. Katılımdan sonra **başlatılan** her kazanılmış bölüm = +1 tahta |
| Elenme | Kayıp (K-29'da +5 reddi) ya da `m ≥ 1` iken çıkış → oyuncu suya düşer, simitle kıyıya yüzer, elenir |
| +5 hamle | Elenmeyi önler; fiyat etkinlik dışıyla aynı (900/1.350/1.800, deneme başına en çok 3) |
| Süre | Katılımdan itibaren 6 saat (`durationMinutes 360`). Süre içinde başlatılan bölüm, süre dolduktan sonra bitse de sayılır |
| Süre dolarsa (7 tahta yok) | Ödül yok; "Süre doldu" (elenme mesajı değil) |
| Ödül havuzu | 10.000 altın; 7. tahtaya ulaşan herkes (oyuncu + botlar) eşit böler: `floor(10000 / bitirenSayısı)` |
| Ödeme anı | Etkinlik süresi bitince ya da köprüde oynayan kalmayınca (hangisi önce) |
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
6. `t` anındaki durum yalnızca `(eventId, t_0, t)`'nin fonksiyonudur; uygulama yeniden açılınca aynı durum hesaplanır.

**Beklenen sonuçlar (hepsi Normal bölümler):** botun 7 tahtayı bitirme olasılığı `s_i^7`; ortalaması
`(0,95^8 − 0,50^8) / (8 · 0,45) ≈ 0,18` → ≈ 18 bot biter. 7 denemeden 1–2'si Zor ise ≈ 11–14 bot. Oyuncu biterse payı
≈ 10.000 / 15 ≈ 650 altın. Bir botun bitirme süresi ortalama 7 × 9 = 63 dk (21–105 dk) → 6 saatlik pencere oyuncuya
rahat zaman bırakır.

---

## 7. Usta Ligi (haftalık, 100 kişi)

### 7.1 Kurallar

| Kural | Değer |
|---|---|
| Açılış | 25 |
| Hafta | UTC Pazartesi 00:00 → sonraki Pazartesi 00:00 (deterministik; TECH_DESIGN S-25) |
| Gruba giriş | Haftanın ilk kazanılan bölümünde 99 botlu gruba girilir |
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
3. `t` anında bot puanı: `P_i(t) = floor(W'_i · x^{k_i})`, `x = (t − t_giriş) / (t_hafta_sonu − t_giriş)` ∈ [0, 1],
   `k_i = 0,8 + 0,4 · R(i, 0, 1)` (erken ya da geç oynayan profiller).

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

Ödüllü reklamla ×2 (yalnızca altın; günde 1) — entrepreneur ile netleşecek.

### 8.2 Bölüm sandığı

Her 10 bölümde bir; sandık ilerleme çubuğu bölüm 1'den görünür, 10, 20, 30, 40, 50 kazanılınca açılır.

| Kazanılan bölüm | İçerik |
|---|---|
| 10 | 200 altın + 1 Çekiç + 1 Termos |
| 20 | 250 altın + 1 Vinç + 1 Mala Başlangıcı |
| 30 | 300 altın + 1 Boya Fırçası + 1 Açık Kepenk + 30 dk sınırsız can |
| 40 | 350 altın + 2 Çekiç + 1 Vinç |
| 50 | 500 altın + her güçlendiriciden 1 + 60 dk sınırsız can |

### 8.3 Kumbara

- Açılış 20. Her galibiyet kumbaraya altın ekler (harcanamaz): Kolay/Normal 20 · Zor 30 · Çok Zor 40.
- Kapasite 3.000 altın (BUSINESS önerisi 3.000–6.000'in alt ucu); dolunca dolmaz, "Dolu" görünür.
- Kırılabilir eşik: 1.500 altın. Kırma bir satın alımdır; fiyat **entrepreneur ile netleşecek** (öneri $2,99). Kırılınca
  içerik cüzdana geçer, kumbara 0'a döner.

### 8.4 Mağaza

Açılış 5. Altın paketleri ve Başlangıç Paketi **entrepreneur ile netleşecek** (BUSINESS §5.2–5.3); MVP'de sahte satın
alma.

### 8.5 İçerik sonu (50'den sonra) — ÖNERİ (proje sahibine açık soru)

"Usta Modu": 11–50. bölümler sırayla, hamle bütçesi `solver minimumu + 2` (bütün zorluklarda) ile yeniden oynanır;
altın ödülü normal, yıldız yok; Sallanan Köprü ve Usta Ligi'ne sayılır; "Yeni bölümler yolda" bandı ana ekranda kalır.
Kapsam ve LiveOps etkisi entrepreneur ile birlikte karara bağlanmalı (öneri P-8).

---

## 9. Kaynak / harcama (source / sink) tablosu

Ödemeyen, Normal ağırlıklı ilerleyen, orta kazanma oranlı (%70) bir oyuncu için **10 bölüm başına** tahmin
(Faz 3 ekonomi simülasyonu doğrular):

| Kaynak | Hesap | Altın / 10 bölüm |
|---|---|---|
| Bölüm galibiyeti | 10 × (ortalama taban 33 + bonus 5 hamle × 3 = 15) | 480 |
| Kalan Altın Mala | 10 × 0,5 mala × 10 | 50 |
| Bölüm sandığı | (200 + 250 + 300 + 350 + 500) / 5 | 320 |
| Günlük ödül | ≈ 1,5 gün × 61 altın/gün (döngü altını 425 / 7) | 90 |
| Sallanan Köprü | 10 bölümde 1 etkinlik × P(bitirme) 0,25 × 650 | 160 |
| Usta Ligi | 10 bölümde ≈ 0,3 hafta × 60 | 20 |
| **Toplam** | | **≈ 1.120** |

| Harcama | Fiyat | Not |
|---|---|---|
| +5 hamle | 900 / 1.350 / 1.800 | En sık harcama |
| Tam can | 900 | |
| Bölüm içi güçlendirici | 300–900 | |
| Oyun öncesi güçlendirici | 450–600 | |

**Denge kontrolü:** 1.120 altın / 10 bölüm ≥ 900 → ödemeyen oyuncu 10 bölümde en az 1 kez +5 hamle alabilir
(BUSINESS §5.4 şartı). Üst sınır: 10 bölümde 2 kez +5 alamamalı (1.120 < 1.800) → altın paketleri değerini korur.
Kumbara kaynak değildir (yalnızca satın alımla açılır): 10 galibiyet × 20 ≈ 200 altın/10 bölüm birikir, 1.500 eşiğine
≈ 75 galibiyette ulaşır.

**Bonuslar ve güçlendirici kaynakları (10 bölüm başına):** sandık ≈ 2,4 güçlendirici, günlük ≈ 0,6, lig ≈ 0,1;
ücretsiz denemeler (toplam 17) yalnızca açılışta.
