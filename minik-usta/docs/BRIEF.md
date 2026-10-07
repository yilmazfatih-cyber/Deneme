# MİNİK USTA — Claude Code Proje Brifi ve Çok Ajanlı Çalışma Talimatı

Bu belgeyi baştan sona oku. Projenin tek doğruluk kaynağı (single source of truth) budur. İlk iş olarak bu dosyayı `docs/BRIEF.md` adıyla repoya kaydet.

> Not (orkestratör): Proje, Deneme reposunda `minik-usta/` alt klasöründe yaşar (ayrı repo açılamadı; bkz. `docs/DECISIONS.md` D-001). Bu belgedeki tüm yollar `minik-usta/` köküne göredir.

---

## 0. Senin rolün

Sen bu projenin **Yapımcısı (orkestratör)** sın. Görevlerin:

1. Bölüm 2'deki 4 uzman alt ajanı `.claude/agents/` klasöründe, verilen içeriklerle birebir oluşturmak.
2. Ajanları Bölüm 3'teki fazlara göre birlikte çalıştırmak. Birbirine bağlı olmayan işleri paralel başlatmak.
3. Ajanlar arasındaki çelişkileri sahiplik matrisine göre çözmek ve her kararı `docs/DECISIONS.md`'ye yazmak.
4. Her fazın sonunda **durmak**, bana kısa bir özet, açık sorular ve bir sonraki fazın planını sunmak, onayımı beklemek.

Genel kurallar:
- Belgeler Türkçe. Kod, dosya adları, değişken adları ve commit mesajları İngilizce.
- Bu brifteki her şey **varsayılan karardır**. Bir ajan daha iyisini önerirse gerekçesiyle `DECISIONS.md`'ye "ÖNERİ" olarak yazar. Oyuncu deneyimini ya da kapsamı ciddi değiştiren önerileri bana sorarsın.
- Uydurma bilgi yok. Pazar verisi, fiyat, kütüphane sürümü gibi güncel bilgiler web'den ya da npm'den doğrulanır, kaynağı yazılır.
- Her faz sonunda git commit at (`phase-N: ...`).
- Ajan dosyalarını oluşturduktan sonra Agent aracında görünmüyorlarsa bana "Claude Code'u yeniden başlat" de. Bu arada, ilgili ajan dosyasının içeriğini prompt olarak vererek genel amaçlı bir alt ajanla devam edebilirsin.

---

## 1. Oyun özeti

| Alan | Değer |
|---|---|
| Çalışma adı | **Minik Usta** (EN: *Little Builder*). Kesin ad, girişimci ajanın marka araştırmasından sonra belirlenir. |
| Tür | Blok yerleştirme bulmacası + hikayeli meta ilerleme (Royal Match tarzı tür kalıpları) |
| Platform | Mobil, dikey (portrait). Önce mobil tarayıcıda oynanan web build, sonra Capacitor ile iOS/Android |
| Oturum | Bölüm başına 1–3 dakika |
| MVP kapsamı | 50 bölüm, 5 hikaye bölümü (chapter), kasaba meta ekranı, 2 etkinlik (botlarla), ekonomi |

**Tek cümle:** Sol taraftaki malzeme sahasından doğru renk ve şekildeki bloğu bul, "yukarı kaldır → duvarın üstünden taşı → aşağı indir" hareketiyle ya da duvardaki geçitlerden geçirerek sağdaki şantiyede planı inşa et; Minik Usta Tuna'nın küçük inşaat firmasını kasabanın en sevilen firması yap.

**Tasarım sütunları**
1. **İmza hareket:** Tatmin edici "kaldır–taşı–indir". Royal Match'te eşleştirmenin verdiği hazzı burada bir bloğu duvarın üstünden aşırıp yerine oturtmak verir.
2. **Okunabilir ama derin bulmaca:** renk + şekil + erişim (kazı) + yerçekimi.
3. **Her bölüm somut bir yapı parçası üretir.** Yapılar hikayeyi ilerletir, kasaba görsel olarak büyür.
4. **Tanıdık meta:** yıldız harcayarak kasaba inşası, 100 kişilik "7 bölümü art arda kazan" etkinliği, galibiyet serisi, haftalık lig.

**Referans ve özgünlük kuralı:** Royal Match, Royal Kingdom, Block Blast ve benzerleri yalnızca tür kalıpları, oyun akışı ve kalite çıtası için referanstır. Hiçbir isim, logo, karakter, ikon, ekran düzeni ya da sanat varlığı kopyalanmaz veya ayırt edilemeyecek kadar benzetilmez (mağaza reddi ve hukuki risk). Karakterler Bob the Builder gibi bilinen karakterlere de benzememelidir.

---

## 2. Ekip: 4 alt ajan

| Ajan | Dosya | Karar sahibi olduğu alan |
|---|---|---|
| `product-lead` | `.claude/agents/product-lead.md` | Kurallar, mekanikler, engeller, 50 bölüm, zorluk eğrisi, meta sistem tasarımı, oyun içi denge |
| `design-lead` | `.claude/agents/design-lead.md` | Görsel yön, UI/UX, animasyon ve his, hikaye ve karakterler, asset listesi |
| `code-lead` | `.claude/agents/code-lead.md` | Teknik mimari, tüm kod, araçlar (solver, playtest botu), testler, performans |
| `entrepreneur` | `.claude/agents/entrepreneur.md` | Pazar, konumlandırma, monetizasyon ve fiyatlar, KPI, LiveOps, kapsam, hukuki risk |

Ajan dosyalarının tam içeriği `.claude/agents/` altındadır (brifte verilen metinle birebir).

---

## 3. Çalışma protokolü

**Ortak belgeler (`docs/`):** BRIEF, DECISIONS, REVIEW_LOG ve her ajanın kendi belgeleri. Ajanlar başkasının belgesini düzenlemez; REVIEW_LOG'a yorum yazar, sahibi uygular.

**Karar günlüğü formatı (`docs/DECISIONS.md`):**

```
### D-012 — Hatalı yerleşimde blok geri seker
Durum: KABUL | ÖNERİ | RET     Sahip: product-lead     Tarih: YYYY-AA-GG
Karar: ...
Gerekçe: ...
Etkilenen: GDD K-17, src/core/placement.ts
```

**Çatışma çözümü:** Her taraf 3 satırlık pozisyon yazar. Orkestratör Bölüm 2'deki sahiplik matrisine göre karar verir. Oyuncu deneyimini, kapsamı ya da maliyeti ciddi etkileyen çatışmaları bana sorar.

**`CLAUDE.md` içeriği (Faz 0'da oluştur):** 10 satırlık proje özeti, ajan listesi ve sahiplik matrisi, klasör haritası, tüm npm komutları, dil kuralları (belgeler TR, kod EN), kural kimliği sistemi (K-xx), bitti tanımı (Bölüm 14).

**Fazlar ve onay kapıları**

| Faz | İçerik | Ajanlar | Çıkış kriteri |
|---|---|---|---|
| 0 Kurulum | Ajan dosyaları, CLAUDE.md, docs iskeleti, git, proje iskeleti (Vite + TypeScript + Phaser, boş sahne) | Orkestratör, code-lead | `npm run dev` boş sahneyi açıyor |
| 1 Tasarım | Paralel: product (GDD, OBSTACLES, LEVELS taslağı, META), design (ART_DIRECTION, UX_FLOWS, JUICE, STORY, tokens), entrepreneur (BUSINESS, NAMING), code (TECH_DESIGN). Ardından çapraz inceleme turu ve revizyon | Hepsi | Belgeler tamam, REVIEW_LOG'daki her yorum kapatılmış, DECISIONS güncel → **bana onay için sun** |
| 2 Dikey dilim | Çekirdek motor + 1–5. bölümler telefonda oynanabilir, temel his (juice) | code (+ product bölüm verisi, design ekran incelemesi) | Testler yeşil, telefonda oynanıyor, ekran görüntüleri incelenmiş → **onay** |
| 3 İçerik | Tüm engeller, 50 bölüm JSON, solver, playtest botu, LEVEL_REPORT, hamle ayarı | product + code | 50/50 bölüm doğrulanmış ve çözülebilir, zorluk eğrisi grafiği hazır → **onay** |
| 4 Meta | Açılış ekranı, ana ekran (kasaba), bölüm öncesi/sonrası pencereleri, hikaye ara sahneleri, can/altın/yıldız, galibiyet serisi, Sallanan Köprü, Usta Ligi (botlu), mağaza (sahte satın alma), ayarlar, kayıt | code + design + product + entrepreneur | İlk açılıştan 10. bölüme kadar uçtan uca akış çalışıyor → **onay** |
| 5 Cila ve çıkış hazırlığı | Juice tamamlama, ses yer tutucuları, erişilebilirlik, performans, analytics olayları, Capacitor projeleri, mağaza hazırlığı | Hepsi | Bölüm 14'teki kalite çıtası karşılandı |

Faz 1 onaylanmadan oyun koduna geçme (yalnızca Faz 0 iskeleti serbest).

---

## 4. Çekirdek oynanış kuralları (GDD tohumu)

### 4.1 Oyun alanı

- **K-01 Tahta:** 8 sütun × 8 satır. Koordinat (x, y): x=0 en sol, y=0 en alt.
- **K-02 Malzeme Sahası:** x=0–5. Sabittir, kaymaz. Bölüm başında %80–100 doludur.
- **K-03 Şantiye:** x=6–7. Hedef planın o anki 2 sütunluk dilimini gösterir; dilimler arasında hareket eder (4.5).
- **K-04 Şantiye Duvarı:** Saha ile şantiye arasında ekranı ikiye bölen dikey kolon. Parametreleri: `height` (alttan kaç satır kapladığı, 0–8) ve `gaps` (her biri satır `y`, boy `size` ve tip). Geçitler duvarın içinde açılmış boşluklardır.
- **K-05 Vinç Alanı:** Tahtanın üstünde 2 satırlık serbest hava (y=8–9). Bloklar buraya kaldırılarak yüksek duvarın üstünden aşırılır. Sahanın üstündeki havada bırakılan blok iptal sayılır ve yerine döner.
- **K-06 Yapı Panoraması:** Tahtanın üstünde planın tamamının küçük önizlemesi. Aktif dilim vurgulu, tamamlananlar renkli.

```
       VİNÇ ALANI (hava, y=8–9)
  9    .  .  .  .  .  .      .  .
  8    .  .  .  .  .  .      .  .
  7    ■  ■  ■  ■  ■  ■  ┃   ░  ░
  6    ■  ■  ■  ■  ■  ■  ┃   ░  ░
  5    ■  ■  ■  ■  ■  ■  ┃   ▒  ▒      ■ saha blokları
  4    ■  ■  ■  ■  ■  ■      ▒  ▒      ┃ duvar (boşluk = geçit, burada y=4)
  3    ■  ■  ■  ■  ■  ■  ┃   ▒  ▒      ▒ plan hücresi (hedef renk)
  2    ■  ■  ■  ■  ■  ■  ┃   ▒  ▒      ░ plan dışı
  1    ■  ■  ■  ■  ■  ■  ┃   ▒  ▒
  0    ■  ■  ■  ■  ■  ■  ┃   ▒  ▒
       0  1  2  3  4  5      6  7     x
       └──── SAHA (sabit) ─┘   └ ŞANTİYE (kayar) ┘
```

### 4.2 Hareket

- **K-07 Hamle:** Bir bloğu tutup başka bir geçerli konuma bırakmak 1 hamledir. Başladığı yere ya da geçersiz bir yere bırakmak iptaldir, hamle harcanmaz.
- **K-08 Yol kuralı:** Blok yalnızca boş hücrelerden oluşan kesintisiz bir yol boyunca hareket eder (şekil bazlı çarpışma, BFS ile yol bulma). Parmak ulaşılamaz bir konuma giderse blok, parmağa en yakın ulaşılabilir konumda kalır ("yapışkan takip"). Blok diğer blokların, duvarın ve engellerin içinden geçemez.
- **K-09 Çıkarma:** Dolu sahada blok ancak bir yönü açıksa hareket edebilir. Bölüm başında bu, yalnızca en üstteki blokların alınabileceği anlamına gelir. Böylece her hamle doğal olarak "yukarı" ile başlar.
- **K-10 Sahada yeniden konumlandırma:** Blok sahada başka bir boş konuma bırakılabilir (1 hamle). Kazı yapmak, tünel açmak ve sıralamak için kullanılır. Saha yerçekimi kapalıysa blok bırakıldığı yerde kalır.
- **K-11 Şantiyeye giriş A — Duvarın Üstünden (ana yol):** Blok duvarın üst kenarının üstünden (duvar 8 satırsa Vinç Alanı'ndan) şantiyenin üstüne taşınır. Parmak basılıyken oyuncu bloğu aşağı indirebilir, ama parmak kalktığı anda blok **düşer** (4.4) ve altındaki ilk desteğe oturur. Havada asılı kalamaz.
- **K-12 Şantiyeye giriş B — Geçitten (ray):** Blok, bir geçidin satır aralığına tamamen sığıyorsa (blok yüksekliği ≤ geçit boyu ve satırlar hizalı) duvarın içinden yatay olarak geçebilir. Geçitten giren blok **raydadır**: dikey konumu geçide kilitlidir, yalnızca yatayda oynar ve bırakıldığı yerde iskele tarafından tutulur, **düşmez**. Boşlukların (pencere, kapı, kemer) üstüne parça koymanın ana yolu budur.
- **K-13 Şantiyede serbest dikey hareket yoktur.** Bloklar şantiyeye ya üstten düşerek ya da raydan girer.
- **K-14 Doğru yerleşen blok kilitlenir.** Geri alınamaz (Geri Al güçlendiricisi hariç).

### 4.3 Plan ve doğrulama

- **K-15 Plan bir renk haritasıdır.** Her hücre şunlardan biridir: renk kodu, `.` (boş kalmalı: pencere, kapı, kemer) ya da `?` (gizli; renk örüntüden çıkarılır, bkz. 4.8).
- **K-16 Doğru yerleşim:** Bloğun kapladığı **her** hücre planda aynı renkteyse yerleşim doğrudur. Blok sınırlarının plandaki bir parça çizgisiyle örtüşmesi gerekmez; aynı renkli bölge, şekli uyan herhangi bir blok kombinasyonuyla döşenebilir. Yani "doğru blok" = doğru renk + kalan boşluğa uyan şekil.
- **K-17 Hatalı yerleşim ("kötü geçiş"):** Tek bir hücre bile uyuşmazsa (yanlış renk, `.` hücresine ya da plan dışına taşma) blok kırmızı parlar, sallanır ve sahaya geri seker: başlangıç konumu boşsa oraya, değilse sahanın üstünden düşerek ilk uygun boşluğa. Hamle yanar. İstisna: Harçlı blok (Y8) geri sekmez, yapışır.
- **K-18 Düşüş gölgesi:** Şantiye üstünde taşınan bloğun nereye düşeceği her zaman doğru gösterilir (rüzgâr dahil). Kolay ve Normal bölümlerde gölgenin konturu doğru yerleşimde yeşil, hatalıda kırmızıdır; Zor ve Çok Zor bölümlerde yalnızca konum gösterilir. Son karar design-lead'indir.

### 4.4 Yerçekimi

- **K-19 Şantiye yerçekimi (`gravity.build`):** bölüm parametresidir.

| Ayar | Düşüş | Şantiye üstünde tutma | Cam kırılma eşiği |
|---|---|---|---|
| `low` (Hafif) | Yavaş süzülür; düşerken bloğa tekrar dokunulursa 1 sütun kaydırılabilir (aynı hamle) | Sınırsız | 4 hücre |
| `normal` | Orta hız | Sınırsız | 3 hücre |
| `high` (Ağır) | Hızlı | Şantiye üstüne geçtikten 700 ms sonra blok parmaktan kayar ve düşer | 2 hücre |

- **K-20 Saha yerçekimi (`gravity.yard`, varsayılan kapalı):** Açıksa altı boşalan saha blokları düşer (zincirleme). Kamyon teslimatlarında yerçekimi o an için her zaman açıktır.
- **K-21 Blok bayrakları:** `glass` (eşiğin üstünde düşerse kırılır, sahaya geri döner, +1 hamle ceza), `balloon` (bırakılınca yukarı yükselir ve üstteki ilk engelde durur), `mortar` (hatalı yerde yapışır), `chained`, `wet` (bkz. Bölüm 7).
- **Düşme bir engeldir:** yanlış sütuna düşüş, pencere boşluğuna düşüş, cam kırılması, rüzgâr sapması, ağır yerçekiminde zaman baskısı ve saha yerçekiminde istenmeyen zincirleme kaymalar bölüm tasarımında bilinçli olarak kullanılır.

### 4.5 Hareketli şantiye

- **K-22 `segments` (varsayılan):** Plan S dilimden oluşur (her dilim 2 sütun × en fazla 8 satır). Aktif dilim tamamlanınca iskele söner, yapı parlar, şantiye sola kayar (yaklaşık 600 ms), tamamlanan dilim panoramaya eklenir ve sıradaki dilim gelir. Örnek (Bölüm 50): Sol Kule → Kapı → Sağ Kule → Bayrak Direkleri → Kule Tepeleri.
- **K-23 `carousel` (Döner Platform):** Dilimler her `carouselEvery` hamlede bir sırayla döner. Oyuncu öndeki dilime yerleştirir; hepsi bitince bölüm biter.
- **K-24 `elevator` (Asansör İskele):** Şantiye çerçevesi her hamleden sonra 1 satır yukarı ya da aşağı salınır (`elevatorRange`, örn. 0–2). Geçitlerin hangi plan satırına açıldığı değişir.

### 4.6 Malzeme teslimatı

Saha 48 hücredir; 4–5 dilimlik bir yapının bütün malzemesi sahaya sığmaz. Bu yüzden:

- **K-25 Partiler:** Her dilimin bir teslimat partisi vardır. İlk parti bölüm başında sahadadır. Bir dilim tamamlanınca **Malzeme Kamyonu** gelir ve sıradaki partinin blokları belirtilen sütunlardan sahaya üstten düşer.
- **K-26 Yer yoksa** kalan bloklar kuyrukta bekler ve her hamle sonunda yeniden denenir. Arayüzde "Kamyonda: 3 blok" gösterilir.
- **K-27 Parti içeriği:** O dilimi bitirmeye yetecek doğru bloklar + şaşırtmacalar (decoy). Bölüm tasarımı en az bir çözüm yolunu garanti eder; solver doğrular.

### 4.7 Hamle, kazanma, kaybetme

- **K-28 Kazanma:** Tüm dilimler ve ek hedefler hamle bitmeden tamamlanırsa kazanılır. Kalan hamleler "Bonus İnşaat" gösterisiyle altına dönüşür.
- **K-29 Kaybetme:** Hamle biterse "+5 hamle" teklifi gelir (altın; MVP'de ödüllü reklam yer tutucusu). Reddedilirse bölüm kaybedilir, 1 can gider, galibiyet serisi sıfırlanır.
- **K-30 Kilitlenme:** Hiçbir doğru yerleşime giden yol kalmadıysa "Kamyon Yardımı" sahayı ücretsiz karıştırır (en az bir çözüm korunacak şekilde). Tespit yöntemi code-lead'in tasarımıdır.

### 4.8 Örüntü mekanikleri

- **K-31 Renk örüntüsü:** Planlar rastgele değil, okunabilir desenlerdir: şeritler, dama, kemer, simetri, basit ikon (örn. fırın tabelasında ekmek).
- **K-32 Gizli plan (`?`):** Bazı hücrelerin rengi gösterilmez, oyuncu kuraldan çıkarır: `repeat` (dilim deseni tekrarlanır) ya da `mirrorOf` (başka bir dilimin aynası; şatonun sağ kulesi sol kulenin aynasıdır). Yanlış tahmin = hatalı yerleşim. Doğru doldurulan `?` hücresi açılır ve deseni ipucu olarak gösterir.

### 4.9 Hedef tipleri

- `build` — her bölümde var.
- `clear` — kasa, zincir ya da moloz kır (N adet).
- `collect` — Altın Vida topla (N adet).

Hedef paneli üstte, sayaçlı olarak gösterilir.

### 4.10 Güçlendiriciler ve kombo

- **K-33 Usta Serisi (kombo):** Araya hatalı yerleşim girmeden art arda 4 doğru yerleşim → **Altın Mala** kazanılır. Altın Mala, plandaki seçilen 1 boş hücreyi doğru renkle doldurur, destek gerektirmez.
- **Oyun içi güçlendiriciler:** Çekiç (bir bloğu ya da engeli kırar), Vinç (bir bloğu duvar, yol ve yerçekimi kurallarını yok sayarak, istenirse döndürerek istenen yere koyar), Boya Fırçası (bir bloğun rengini değiştirir), Geri Al (son hamleyi geri alır).
- **Oyun öncesi güçlendiriciler:** Termos (+3 hamle), Mala Başlangıcı (+1 Altın Mala), Açık Kepenk (ilk 5 hamle tüm geçitler açık).
- **Galibiyet serisi bonusu:** Art arda 1 / 2 / 3+ galibiyette bölüme artan bir başlangıç bonusuyla girilir (örn. Altın Mala, Termos). Kayıpta sıfırlanır.
- Oyuncu blokları kendisi döndüremez; yalnızca Vinç döndürür.

### 4.11 İmza hareket ilkesi: "Yukarı–Aşağı"

Oyunun oyunculara en sık yaptırmak istediğimiz hareketi parmakla **önce yukarı, sonra aşağı** sürüklemektir.

- Her bölümde çözümdeki şantiye yerleştirmelerinin en az %60'ı duvar üstünden olmalıdır. Buna **YAO (Yukarı–Aşağı Oranı)** denir; solver her bölüm için raporlar.
- Geçitler kestirmedir ama bedeli vardır: alçakta ve kalabalık sahanın içindedir (kazı gerekir), dardır, zamanlıdır ya da kilitlidir.
- Hareket hissi: kaldırınca blok %8 büyür ve gölge düşer; parmağın yaklaşık 1,2 hücre üstünde görünür; duvarın üstünden geçerken hafif bir "vuuş" sesi ve iz; inişte esneme (squash), toz bulutu ve haptik; doğru yerleşimde kombo arttıkça perdesi yükselen bir tını.

---

## 5. Bloklar

Block Blast'taki gibi poliomino bloklar; her blok tek renklidir. Her yönelim ayrı şekil sayılır, kimlik formatı `TÜR_AÇI` (örn. `L4_90`). Şantiye 2 sütun olduğu için yalnızca **genişliği ≤ 2** olan bloklar şantiyeye geçebilir (kod bunu şekilden otomatik hesaplar). Daha geniş olanlar **Ağır Malzeme**dir (Y5). Hücreler 0° yönelimde, sol alt köşeden (x, y) olarak verilmiştir.

| Kimlik | Ad | Hücreler (0°) | Kutu | Not |
|---|---|---|---|---|
| B1 | Tuğla | (0,0) | 1×1 | |
| D2 | Çift Tuğla | (0,0)(0,1) | 1×2 | 90° = yatay Lento (2×1) |
| I3 | Kolon | (0,0)(0,1)(0,2) | 1×3 | yatay hali Ağır |
| I4 | Uzun Kolon | (0,0)…(0,3) | 1×4 | yatay hali Ağır |
| O4 | Beton Blok | (0,0)(1,0)(0,1)(1,1) | 2×2 | |
| C3 | Köşe | (0,0)(1,0)(0,1) | 2×2 | 4 yönelimin hepsi geçer |
| L4 | Köşebent | (0,0)(1,0)(0,1)(0,2) | 2×3 | dikey halleri geçer, yatay halleri Ağır |
| J4 | Ters Köşebent | (0,0)(1,0)(1,1)(1,2) | 2×3 | aynı |
| T4 | T-Kiriş | (0,0)(0,1)(0,2)(1,1) | 2×3 | dikey halleri geçer |
| S4 | Merdiven | (0,0)(0,1)(1,1)(1,2) | 2×3 | dikey hali geçer, yatay hali Ağır |
| Z4 | Ters Merdiven | (1,0)(1,1)(0,1)(0,2) | 2×3 | aynı |
| I5 | Çelik Kiriş | (0,0)…(4,0) | 5×1 | her zaman Ağır (yalnızca yatay kullanılır) |
| Q9 | Paletli Yük | 3×3 kare | 3×3 | her zaman Ağır |

Blok çeşitliliği hikaye bölümleriyle açılır: Bölüm 1 → B1, D2, O4, C3; Bölüm 2 → + I3, L4, J4; Bölüm 3 → + T4, S4, Z4; Bölüm 4 → + I4. Ağır malzeme 8. bölümden itibaren.

---

## 6. Renkler

| Kod | Ad | Hex (başlangıç) | Sembol | İlk bölüm |
|---|---|---|---|---|
| W | Ahşap | #B8763E | ağaç damarı | 1 |
| Y | Kum Sarısı | #FFC83D | üç nokta | 1 |
| G | Bahçe Yeşili | #4CC35E | yaprak | 2 |
| R | Tuğla Kırmızısı | #E8483B | tuğla derzi | 4 |
| O | Kiremit Turuncusu | #F58A2B | kiremit dalgası | 11 |
| C | Beton Grisi | #9AA4B1 | çapraz tarama | 11 |
| B | Cam Mavisi | #3BA6F5 | parıltı | 21 |
| P | Mozaik Moru | #9B5DE5 | elmas | 21 |

- Bir bölümde en fazla renk: Hikaye bölümü 1 → 3, bölüm 2 → 4, bölüm 3–5 → 5.
- Blok render tarifi (design-lead ince ayar yapar): taban renk; üst kenarda %20 açık bevel; alt kenarda %25 koyu; tabanın %45 koyusu 2 px kontur; köşe yarıçapı hücrenin %18'i; ortada %35 opak beyaz sembol.
- Plan hücresi: aynı renk %30 opak + kesik kontur + sembol.
- Palet renk körlüğü simülasyonuyla doğrulanır. Gerekirse tonlar değişir ama kodlar korunur.
- Hikaye bağı: Beton Grisi (C), rakip Bay Gribeton'un malzemesidir. Hikaye ilerledikçe planlardaki payı artar; rakibin dostluğunun görsel izidir.

---

## 7. Engel kütüphanesi

**Duvar**

| Kimlik | Ad | Kural | İlk bölüm |
|---|---|---|---|
| W1 | Sabit Geçit | Duvarda sabit boşluk; geçit boyuna sığan bloklar ray ile geçer (K-12) | 3 |
| W2 | Yüksek Duvar | `height=8`; aşmak için bloğu Vinç Alanı'na kaldırmak gerekir, düşüş mesafesi uzar | 6 |
| W3 | Dar Geçit | `size=1`; yalnızca 1 satır yüksekliğindeki bloklar geçer (B1, yatay D2 …) | 9 |
| W4 | Kepenk | Geçit her `period` hamlede bir açılır/kapanır (`phase` başlangıç). Kapanırken içinde blok bulunamaz | 13 |
| W5 | Kayar Kapı | Geçit her hamle sonunda `range` içinde 1 satır kayar (yukarı-aşağı salınım) | 16 |
| W6 | Boya Kapısı | Geçitten geçen blok kapının rengine (`color`) boyanır | 22 |
| W7 | Kilitli Geçit | Sahadaki Anahtar (bir hücrenin zemininde saklı, üstü açılınca alınır) toplanınca açılır | 26 |
| W8 | Rüzgâr Fanı | Duvar üstünden atılan 1 geniş bloklar düşerken `dir` yönünde 1 sütun kayar; 2 geniş bloklar etkilenmez. Düşüş gölgesi sapmayı gösterir | 32 |

**Saha**

| Kimlik | Ad | Kural | İlk bölüm |
|---|---|---|---|
| Y1 | Ahşap Kasa | Hücre kaplar, hareket etmez; komşusundaki bir blok hareket edince 1 kat kırılır (1–3 kat) | 11 |
| Y2 | Çimento Torbası | Hareket ettirilemez ama yerçekimine tabidir (altı boşalınca düşer); 1 komşu hareketle yırtılıp kaybolur | 18 |
| Y3 | Zincir | Zincirli blok, komşusu 1 kez hareket edene kadar hareket edemez | 24 |
| Y4 | Islak Beton | Blok `wetMoves` hamle boyunca kurur, o süre hareket edemez; üstünde sayaç | 28 |
| Y5 | Ağır Malzeme | Genişliği ≥ 3 olan bloklar; şantiyeye geçemez, yalnızca sahada yer değiştirir ya da Çekiç'le kırılır | 8 |
| Y6 | Saha Yerçekimi | K-20 (bölüm ayarı) | 14 |
| Y7 | Altın Vida | Bir hücrenin zemininde saklıdır; üstündeki blok kalkınca toplanır (`collect` hedefi) | 19 |
| Y8 | Harçlı Blok | Hatalı yerleşince geri sekmez, şantiyede yapışır. Geri sürüklenebilir ama 2 hamle sayılır, ya da Çekiç | 35 |

**Şantiye ve yerçekimi**

| Kimlik | Ad | Kural | İlk bölüm |
|---|---|---|---|
| S1 | Kayan Şantiye | K-22 | 5 |
| S2 | Plan Boşluğu | `.` hücreleri boş kalmalı (pencere, kapı, kemer). Üstlerindeki hücreler yalnızca raydan ya da iki sütuna köprü kuran 2 geniş blokla doldurulabilir | 4 |
| S3 | Cam Blok | Eşiğin üstünde düşerse kırılır (K-21) | 21 |
| S4 | Moloz | Bölüm başında şantiyede duran yanlış parçalar; tutulup sahaya taşınmalı (1 hamle) ya da Çekiç'le kırılmalı | 17 |
| S5 | Döner Platform | K-23 | 31 |
| S6 | Asansör İskele | K-24 | 37 |
| S7 | Gizli Plan | K-32 (`repeat` 27, `mirrorOf` 29) | 27 |
| S8 | Balonlu Blok | Bırakılınca yukarı yükselir (K-21); asma köprü ve bayraklar için | 38 |
| G-H | Ağır yerçekimi | `gravity.build = high` | 15 |
| G-L | Hafif yerçekimi | `gravity.build = low` | 23 |

product-lead, `docs/OBSTACLES.md`'de her engel çifti için etkileşim matrisini yazar (örn. "Boya Kapısı + Cam Blok": cam boyanır ama camlığını korur).

---

## 8. 50 bölüm planı

Hamle sayıları başlangıç tahminidir. Nihai hamle = solver minimumu + tampon (Kolay +8, Normal +5, Zor +3, Çok Zor +2); ardından "orta" bot profiliyle hedef kazanma oranlarına göre ayar: Kolay ≥ %90, Normal %65–80, Zor %40–55, Çok Zor %25–40. Her yeni mekanik bölümünde el animasyonlu öğretici, Usta Dede'nin ipucu balonu ve sade bir tahta olur. Zor ve Çok Zor bölümler ana ekranda ve bölüm öncesi pencerede renkli etiketle gösterilir.

### Hikaye Bölümü 1 — Ağaç Ev (renkler: W, Y, G, R)

| # | Yapı parçası | Öğretilen yeni öğe | Kurgu | Hamle | Zorluk |
|---|---|---|---|---|---|
| 1 | Ağaç Basamakları | Kaldır–taşı–indir (duvar üstü + düşme) | Duvar 2, geçit yok, 1 dilim 2×3, 2 renk, B1/D2 | 10 | Kolay |
| 2 | Platform | Renk örüntüsü (şerit) + düşüş gölgesi | Duvar 3, 1 dilim 2×4, O4/C3 | 12 | Kolay |
| 3 | Ön Duvar | Sabit geçit + ray yerleştirme (W1) | Duvar 6, geçit y=2 boy 2, 1 dilim 2×4 | 12 | Kolay |
| 4 | Pencere | Plan boşluğu (S2): üstü yalnızca geçitten | Duvar 6, geçit y=3 boy 1, 1 dilim 2×5 | 14 | Kolay |
| 5 | İki Odalı Ev | Kayan şantiye (S1) + kamyon teslimatı | Duvar 4, 2 dilim | 16 | Normal |
| 6 | Uzun Gövde | Yüksek duvar (W2) → Vinç Alanı'na kaldırma | 1 dilim 2×7 | 16 | Normal |
| 7 | Çatı Altı | Kazı: sahada yeniden konumlandırma | Hedef parçalar gömülü, 2 dilim | 18 | Normal |
| 8 | Bahçe Çiti | Ağır malzeme (Y5) + Çekiç açılır | 2 dilim | 18 | Normal |
| 9 | İp Merdiven | Dar geçit (W3) | Geçit + pencere, 2 dilim | 18 | Normal |
| 10 | Ağaç Ev Tamam! | Bölüm finali + Vinç açılır | 3 dilim; yüksek duvar + pencere + dar geçit + ağır malzeme | 24 | Zor |

### Hikaye Bölümü 2 — Mahalle Fırını (+ O, C)

| # | Yapı parçası | Öğretilen yeni öğe | Kurgu | Hamle | Zorluk |
|---|---|---|---|---|---|
| 11 | Fırın Temeli | Ahşap Kasa (Y1), 1 kat | 2 dilim | 18 | Normal |
| 12 | Tezgâh | Temizleme hedefi (kasa ×6, 2 kat) | 2 dilim | 20 | Normal |
| 13 | Vitrin | Kepenk (W4), periyot 2 | 2 dilim | 20 | Normal |
| 14 | Un Deposu | Saha yerçekimi (Y6) | 2 dilim | 20 | Normal |
| 15 | Baca | Ağır yerçekimi (700 ms tutma) | 2 dilim 2×8 | 22 | Zor |
| 16 | Kapı Kemeri | Kayar Kapı (W5) | Kemer = `.` hücreler, 2 dilim | 22 | Normal |
| 17 | Eski Fırın | Moloz (S4) | 2 dilim | 22 | Normal |
| 18 | Un Çuvalları | Çimento Torbası (Y2) + saha yerçekimi | 3 dilim | 22 | Normal |
| 19 | Tabela | Toplama hedefi: Altın Vida (Y7) ×5 | 2 dilim | 22 | Normal |
| 20 | Fırın Açılışı | Bölüm finali | 4 dilim; kepenk + kayar kapı + saha yerçekimi + moloz | 28 | Çok Zor |

### Hikaye Bölümü 3 — Okul Kütüphanesi (+ B, P)

| # | Yapı parçası | Öğretilen yeni öğe | Kurgu | Hamle | Zorluk |
|---|---|---|---|---|---|
| 21 | Kütüphane Penceresi | Cam Blok (S3) | 2 dilim | 22 | Normal |
| 22 | Renkli Raflar | Boya Kapısı (W6) + Boya Fırçası açılır | 2 dilim | 22 | Normal |
| 23 | Okuma Köşesi | Hafif yerçekimi (yönlendirilebilir iniş) | Cam ile birlikte, 2 dilim | 22 | Normal |
| 24 | Kitap Kolileri | Zincir (Y3) | 3 dilim | 24 | Normal |
| 25 | Saat Kulesi | Kombinasyon | Yüksek duvar + cam + boya kapısı, 3 dilim 2×8 | 26 | Zor |
| 26 | Arşiv Kapısı | Kilitli Geçit (W7) + anahtar | 3 dilim | 24 | Normal |
| 27 | Mozaik Duvar | Gizli plan: tekrar örüntüsü (S7) | 3 dilim, 2. ve 3. dilim `?` | 24 | Normal |
| 28 | Bahçe Duvarı | Islak Beton (Y4) | 3 dilim | 24 | Normal |
| 29 | Simetrik Cephe | Gizli plan: ayna simetrisi | 2 dilim (2.si 1.nin aynası) + zincir | 26 | Normal |
| 30 | Kütüphane Açılışı | Bölüm finali | 4 dilim; boya kapısı + gizli plan + cam + kilitli geçit | 30 | Çok Zor |

### Hikaye Bölümü 4 — Deniz Feneri ve Köprü (tüm renkler)

| # | Yapı parçası | Öğretilen yeni öğe | Kurgu | Hamle | Zorluk |
|---|---|---|---|---|---|
| 31 | Balıkçı İskelesi | Döner Platform (S5), 4 hamlede bir | 3 dilim | 24 | Normal |
| 32 | Rüzgârlı Kıyı | Rüzgâr Fanı (W8) | 3 dilim | 24 | Normal |
| 33 | Fener Gövdesi | Kombinasyon | Yüksek duvar + rüzgâr + cam, 3 dilim 2×8 | 26 | Normal |
| 34 | Fener Odası | Zamanlama kombinasyonu | Döner platform + kepenk senkronu, 3 dilim | 26 | Normal |
| 35 | Islak Harç | Harçlı Blok (Y8) | 3 dilim | 26 | Zor |
| 36 | Martı Yuvaları | Kombinasyon | Vida toplama + rüzgâr + saha yerçekimi, 3 dilim | 26 | Normal |
| 37 | Yükselen İskele | Asansör İskele (S6), ofset 0–2 | 3 dilim | 26 | Normal |
| 38 | Köprü Halatları | Balonlu Blok (S8) | 3 dilim | 26 | Normal |
| 39 | Köprü Tabliyesi | Kombinasyon | Asansör + balon + dar geçit, 4 dilim | 28 | Normal |
| 40 | Fener Yandı! | Bölüm finali | 4 dilim döner platform; rüzgâr + harç + asansör + cam | 32 | Çok Zor |

### Hikaye Bölümü 5 — Festival Şatosu

| # | Yapı parçası | Öğretilen yeni öğe | Kurgu | Hamle | Zorluk |
|---|---|---|---|---|---|
| 41 | Hendek Köprüsü | Tekrar ve pekiştirme | Kasa + kepenk + saha yerçekimi, 3 dilim | 26 | Normal |
| 42 | Sol Kule Temeli | Kombinasyon | Ağır yerçekimi + cam + yüksek duvar, 3 dilim | 28 | Normal |
| 43 | Sol Kule Pencereleri | Kombinasyon | Pencere + kayar kapı + boya kapısı, 3 dilim | 28 | Normal |
| 44 | Mazgallar | Kombinasyon | Balon + gizli tekrar örüntüsü, 3 dilim | 28 | Normal |
| 45 | Büyük Kapı | Kombinasyon | Kemer + kilitli geçit + zincir + moloz, 4 dilim | 30 | Zor |
| 46 | Sağ Kule | Kombinasyon | Gizli ayna (sol kulenin aynası) + rüzgâr, 4 dilim | 30 | Normal |
| 47 | Bayraklar | Kombinasyon | Rüzgâr + balon + boya kapısı, 3 dilim | 30 | Normal |
| 48 | Şato Avlusu | Kombinasyon | Döner platform + ıslak beton + harç, 4 dilim | 30 | Normal |
| 49 | Festival Işıkları | Kombinasyon | Asansör + cam + hafif yerçekimi + vida toplama, 4 dilim | 32 | Zor |
| 50 | Festival Şatosu | BÜYÜK FİNAL | 5 dilim kayan şantiye: Sol Kule → Kapı → Sağ Kule (gizli ayna) → Bayrak Direkleri → Kule Tepeleri; her dilimde farklı engel seti | 40 | Çok Zor |

---

## 9. Hikaye

**Dünya:** Renkli Tepe kasabası.
**Firma:** Minik Usta İnşaat. Tuna, dedesinin tavan arasında unutulmuş eski "Usta Dede Yapı" tabelasını bulur, boyar ve firmayı yeniden açar.

| Karakter | Tanım |
|---|---|
| **Tuna** (8) | Kahraman, "Minik Usta". Nane yeşili kask (üstünde yıldız çıkartması), turuncu reflektörlü yelek, kocaman iş eldivenleri, kulağının arkasında kurşun kalem. Enerjik, meraklı, vazgeçmez. Cinsiyet nötr tasarım (design-lead önerir). |
| **Usta Dede** | Emekli usta, firmanın kurucusu. Kalın gözlük, beyaz bıyık, kemerinde şerit metre. Öğretici ipuçlarını o verir ("Önce temeli düşün, evlat!"). |
| **Kepçe** | Kaskı kulaklarına büyük gelen sosis köpek. Kazmaya bayılır; sahadaki kazı mekaniğinin maskotu. |
| **Bay Gribeton** | Rakip Gribeton A.Ş.'nin patronu. Her şeyi gri betondan yapar. Kibirli ama komik, kalbi iyi; hikaye boyunca Tuna'ya ısınır. Kötü adam değil, "karşı görüş". |
| Kasaba halkı | Fırıncı Ayşe Teyze, Öğretmen Selin, Balıkçı Rıza Kaptan, Belediye Başkanı Bay Kurdele |

| Hikaye bölümü | Sorun | Duygusal vuruş |
|---|---|---|
| 1 Ağaç Ev | Tuna firmayı yeniden açar ama kimse küçük bir çocuğa iş vermez. Bay Gribeton güler. | İlk yapı: arka bahçedeki ağaç ev. Kasaba fark eder. |
| 2 Mahalle Fırını | Ayşe Teyze'nin fırın bacası çöktü. Gribeton gri bir kutu önerir. | Renkli fırın açılır, kasaba ekmek kokusuyla dolar. İlk gerçek müşteri. |
| 3 Okul Kütüphanesi | Kütüphaneyi su bastı; çocukların okuyacak yeri yok. | Mozaik duvarlı kütüphane. Simetri ve örüntü öğretmen Selin'in ipuçlarıyla. |
| 4 Deniz Feneri ve Köprü | Fırtınadan sonra Gribeton'un gri köprüsü çatladı, balıkçılar mahsur. | Tuna feneri yakar ve asma köprüyü kurar. Gribeton ilk kez teşekkür eder. |
| 5 Festival Şatosu | Kasaba festivali için şato gerekiyor. | Gribeton gri bloklarını "temel" olarak getirir, birlikte inşa ederler. Kurdele kesme, havai fişek, "Yılın Firması". |

**Sunum:** Her hikaye bölümünün başında ve sonunda 3–6 panelli çizgi roman ara sahnesi (konuşma balonları, dokununca ilerler, "Geç" düğmesi). Kasaba görevleri tamamlandıkça kısa sahneler oynar. Bölüm içinde Usta Dede ipucu verir; Tuna ve Kepçe tepki verir.

---

## 10. Meta sistemler ve ekonomi

| Sistem | Varsayılan kural | Açılış |
|---|---|---|
| Yıldız ve Kasaba | Her kazanılan bölüm 1 yıldız verir. Her hikaye bölümünün kasabada 6–8 görevi vardır (1–3 yıldız). Görevler yapıyı adım adım kurar ve kısa sahne oynatır. Bölümler görevlerle kilitlenmez; ara sahneler görevlerle açılır. | 1 |
| Can | 5 can, 30 dakikada 1 yenilenir. Kayıpta 1 can gider. Altınla tam doldurma. | 1 |
| Altın | Kazanma ödülü + kalan hamle bonusu. Harcama: +5 hamle, can, güçlendirici. | 1 |
| Güçlendirici açılışları | Çekiç 8, Vinç 10, Geri Al 13, Boya Fırçası 22; Termos 12, Mala Başlangıcı 16, Açık Kepenk 20. Açılınca 2–3 ücretsiz deneme. | — |
| Galibiyet serisi | 4.10'daki kural | 15 |
| **Sallanan Köprü** | Aşağıda | 15 |
| **Usta Ligi** | Aşağıda | 25 |
| Günlük ödül | 7 günlük döngü | 2. gün |
| Bölüm sandığı | Her 10 bölümde bir | 10 |
| Kumbara | Kazandıkça dolar, satın alınarak kırılır | 20 |
| Mağaza | Altın paketleri, başlangıç paketi (MVP'de sahte satın alma) | 5 |
| Takım / Kulüp | MVP dışı (backend gerektirir) | — |

### Sallanan Köprü — 100 kişi, 7 bölüm art arda

- 100 küçük usta, nehrin üstündeki 7 tahtalı sallanan bir köprüye dizilir. Her kazanılan bölüm = 1 tahta ilerleme.
- Bir bölümü kaybeden (hamle bitip +5 almayan) köprüden suya düşer, simitle yüzerek kıyıya gider (sevimli, şiddet yok) ve elenir.
- 7. tahtaya ulaşan herkes ödül havuzunu (örn. 10.000 altın) eşit böler. Ekranda canlı sayaç: "Köprüde kalan: 47/100".
- Katılımdan sonra süre: varsayılan 6 saat (config). Bitince bir sonraki etkinliğe kadar bekleme süresi.
- MVP'de 99 rakip bottur. Her botun bir beceri değeri vardır; bölüm zorluğuna göre kazanma olasılığı hesaplanır; botlar gerçek zamanda 3–15 dakikada bir "oynar". Simülasyon seed + zaman damgasıyla deterministiktir; uygulama yeniden açıldığında tutarlı durum gösterilir.
- Etkinlik içinde +5 hamle almak elenmeyi önler. Bu bir gelir kaldıracıdır; entrepreneur oyuncu deneyimi ve etik açısından değerlendirir.

### Usta Ligi — haftalık 100 kişilik lig

- 100 kişilik grup, haftalık. Puan: Kolay/Normal galibiyet 1, Zor 2, Çok Zor 3.
- Ligler: Bronz Mala → Gümüş Mala → Altın Mala → Elmas Mala. İlk 20 terfi, son 20 düşer.
- İlk 3'e sandık, ilk 50'ye küçük ödül.

### Diğer

- **İçerik sonu:** 50. bölümden sonra "Usta Modu" (bölümlerin zorlaştırılmış tekrarları) ya da "Yeni bölümler yolda" ekranı. Etkinlikler oynanabilir kalmalı. Karar: product-lead + entrepreneur.
- **Online mimari:** MVP'de tüm 100 kişilik sistemler deterministik botlarla yerel çalışır ve `EventService` arayüzünün arkasında durur; sonra gerçek backend takılır. Yayında botların nasıl sunulacağına (gerçek eşleştirme ya da açıkça bot olduğu belli rakipler) entrepreneur risk kaydında karar verir.

---

## 11. Ekranlar, görsel yön ve his

### 11.1 Sanat yönü

- **His:** parlak, sıcak, "oyuncak kutusu". Yumuşak gölgeler, kalın yuvarlak konturlar, bol beyaz ışık vurgusu.
- **Arka planlar:** gökyüzü gradyanı, yumuşak bulutlar, uzakta kasaba silueti. Her hikaye bölümünün kendi paleti: Ağaç Ev orman yeşili; Fırın sıcak turuncu; Kütüphane mavi-mor; Fener deniz turkuazı ve gün batımı; Şato festival altını ve mor gece.
- **Arayüz:** krem-sarı paneller, kalın yeşil birincil düğme ("Oyna"), turuncu ikincil, kırmızı kapat. Düğmelerde alt gölgeli, "basılabilir" 3B his. İnşaat teması için ölçülü sarı-siyah ikaz şeridi, yalnızca vurgu olarak.
- **Tipografi:** yuvarlak, kalın, okunaklı açık kaynak bir font (örn. Baloo 2 ya da Fredoka). Lisans ve Türkçe karakter desteği (ğ, ü, ş, ı, İ, ö, ç) doğrulanır.
- **Karakterler:** büyük kafa / küçük gövde, iri gözler, basit şekiller. Her karakter için 6 ifade: mutlu, şaşkın, üzgün, kararlı, gülme, düşünme.

### 11.2 Ekranlar

1. **Açılış (splash/yükleme):** Bloklar yukarıdan düşerek "MİNİK USTA" logosunu inşa eder (squash ile). Tuna kaskını düzeltir, Kepçe havlar. Yükleme çubuğu = bir vincin soldan sağa taşıdığı blok.
2. **İlk oturum (FTUE):** Açılış → 3 panelli atlanabilir giriş hikayesi → doğrudan Bölüm 1 (önce oyun, sonra meta) → kazanma → ana ekran → ilk yıldızı harcama → ilk ara sahne. İlk açılıştan Bölüm 1'e en fazla 10 saniye ve 3 dokunuş.
3. **Ana ekran (Kasaba):**
   - Arka plan: aktif hikaye bölümünün yarı inşa edilmiş yapısı, hafif paralaks.
   - Üst çubuk: can (sayaçla), altın (+), yıldız.
   - Sol kenar: etkinlik ikonları (Sallanan Köprü kalan süre rozetiyle, Usta Ligi sıralamayla). Sağ kenar: günlük ödül, kumbara, bölüm sandığı.
   - Orta: yıldızla yapılacak görev baloncuğu (ünlemli).
   - Alt orta: büyük yeşil "Bölüm 12" düğmesi. Zor bölümde kırmızı "ZOR", çok zorda mor "ÇOK ZOR" etiketi.
   - Alt navigasyon (5 sekme): Mağaza · Lig · Ana Sayfa (ortada) · Takım (kilitli, "yakında") · Albüm (tamamlanan yapıların kartları).
4. **Bölüm öncesi pencere:** bölüm no, zorluk etiketi, hedef ikonları (yapının küçük resmi + ek hedefler), 3 oyun öncesi güçlendirici yuvası, galibiyet serisi göstergesi, büyük "Oyna".
5. **Oyun ekranı (üstten alta):**
   - Üst: duraklat (sol), yapı panoraması (ince şerit), hedefler ve büyük hamle sayacı (son 5 hamlede kırmızı nabız).
   - Orta: tahta (ekran genişliğinin ~%92'si). Yanında Usta Serisi / Altın Mala dolum çubuğu ve "Kamyonda: N blok" göstergesi.
   - Sol alt köşe: Tuna ve Kepçe (doğru yerleşimde sevinir, hatalıda yüzünü buruşturur, kombo'da dans eder).
   - Alt: 4 yuvalı güçlendirici çubuğu (adet / +).
6. **Kazanma:** dilimler son kez parlar, kurdele kesilir, konfeti; kalan hamleler "Bonus İnşaat"; yıldız ana ekrana uçar.
7. **Kaybetme:** "Hamleler bitti!" + 5 hamle teklifi; ikinci pencere can kaybı ve "Tekrar dene".
8. **Hikaye ara sahnesi:** çizgi roman panelleri, konuşma balonları, dokununca ilerler, "Geç".
9. **Sallanan Köprü:** 7 tahtalı köprü, nehir, 100 küçük kask, kalan sayısı, ödül havuzu, geri sayım.
10. **Usta Ligi:** lig rozeti, sıralama listesi, terfi/düşme çizgileri.
11. **Mağaza ve Ayarlar:** ses, müzik, titreşim, dil, renk körü modu, animasyonları azalt, destek.

### 11.3 Oyun tahtası görsel dili

- **Saha:** sıcak kum/ahşap zemin, ince ızgara çizgileri.
- **Duvar:** beton kolon; geçit kenarları sarı-siyah ikaz şeritli. Geçit tipleri ilk bakışta ayırt edilir: kepenk = metal panjur, kayar kapı = ray çizgileri ve ok, boya kapısı = renkli damla çerçeve, kilitli = asma kilit, dar = tek satırlık yarık.
- **Şantiye:** mavi ozalit (blueprint) kâğıt dokusu üstünde iskele ızgarası. Plan hücreleri yarı saydam renk + sembol + kesik kontur; `.` hücreleri çapraz taralı ("boş kalacak"); `?` hücreleri soru işareti etiketi.

### 11.4 His (juice) — en az bu liste

| Olay | Görsel | Süre | Ses | Haptik |
|---|---|---|---|---|
| Blok kaldırma | %8 büyüme, gölge, hafif yukarı zıplama | 80 ms | "pop" | hafif |
| Duvarın üstünden geçiş | hareket izi, vuuş | — | "whoosh" | — |
| İniş | esneme (squash), toz bulutu | 120 ms | "tok" | orta |
| Doğru yerleşim | parıltı + kıvılcım, hücre dolar | 200 ms | tını (kombo ile perdesi yükselir) | hafif |
| Hatalı yerleşim | kırmızı parlama, 2 px sallanma, kavisle geri sekme | 350 ms | "tıs" | çift hafif |
| Kombo / Altın Mala | mala parlar, altın kıvılcım yağmuru | 500 ms | fanfar | orta |
| Dilim tamamlama | iskele söner, yapı parlar, sola kayma | 600 ms | "ta-da" | güçlü |
| Kamyon teslimatı | kamyon girer, bloklar sahaya düşer | 700 ms | korna + tok sesler | hafif |
| Kazanma | kurdele, konfeti, karakter dansı | 1500 ms | zafer müziği | desen |

Sesler MVP'de prosedürel olarak üretilebilir (ZzFX benzeri küçük bir kütüphane; lisansı doğrulanır). Müzik sonra.

---

## 12. Teknik mimari

**Yığın (varsayılan):** TypeScript (strict) + Vite + Phaser (güncel kararlı sürüm, npm'den doğrula). Testler: Vitest. Ekran görüntüsü: Playwright. Lint/format: ESLint + Prettier. Mobil paket: Capacitor (Faz 5). Tasarım çözünürlüğü 1080×1920 dikey, FIT ölçekleme, güvenli alan (notch) desteği.

**Klasör yapısı**

```
/
├─ CLAUDE.md
├─ .claude/agents/          product-lead.md design-lead.md code-lead.md entrepreneur.md
├─ docs/                    BRIEF GDD OBSTACLES LEVELS LEVEL_REPORT META ART_DIRECTION UX_FLOWS
│                           JUICE STORY ASSET_LIST TECH_DESIGN BUSINESS NAMING STORE_LISTING
│                           ANALYTICS DECISIONS REVIEW_LOG (.md)
├─ levels/                  level_001.json … level_050.json
├─ config/                  economy.json events.json
├─ src/
│  ├─ core/                 saf oyun mantığı: grid, shapes, pathfinding, gravity, wall, placement,
│  │                        delivery, moves, goals, obstacles/ (her engel ayrı dosya), rng
│  ├─ scenes/               Phaser: Boot, Splash, Home, PreLevel, Level, Story, Bridge, League, Shop
│  ├─ ui/                   Button, Popup, TopBar, BoosterBar, GoalPanel, Panorama …
│  ├─ meta/                 economy, lives, stars, tasks, streak
│  ├─ services/             save, analytics, events (bot simülasyonu), i18n, audio, haptics
│  ├─ theme/                tokens.json, prosedürel doku üretimi
│  └─ i18n/                 tr.json, en.json
├─ tools/                   validate-levels.ts solve.ts playtest-bot.ts level-preview.ts screens.ts
└─ tests/
```

**Bölüm veri tipi**

```ts
type ColorCode = 'W' | 'Y' | 'G' | 'R' | 'O' | 'C' | 'B' | 'P';
type ShapeKind = 'B1' | 'D2' | 'I3' | 'I4' | 'O4' | 'C3' | 'L4' | 'J4' | 'T4' | 'S4' | 'Z4' | 'I5' | 'Q9';
type ShapeId = `${ShapeKind}_${0 | 90 | 180 | 270}`;
type I18nText = { tr: string; en: string };

interface LevelData {
  id: number;
  chapter: 1 | 2 | 3 | 4 | 5;
  name: I18nText;
  difficulty: 'easy' | 'normal' | 'hard' | 'superhard';
  moves: number;
  teaches?: string;                         // engel/mekanik kimliği, örn. "W1", "S2"
  seed: number;
  goals: Goal[];                            // build her zaman var
  gravity: { build: 'low' | 'normal' | 'high'; yard: boolean };
  wall: { height: number; gaps: Gap[]; fan?: { dir: 'left' | 'right' } };
  build: {
    mode: 'segments' | 'carousel' | 'elevator';
    carouselEvery?: number;
    elevatorRange?: [number, number];
    segments: { name: I18nText; rows: string[]; hidden?: HiddenRule }[];
    debris?: PiecePlacement[];              // şantiyede başta duran moloz
  };
  yard: { batches: { forSegment: number; dropColumns?: number[]; pieces: PiecePlacement[] }[] };
  obstacles: ObstacleInstance[];
  tutorial?: { step: number; highlight: string; textKey: string }[];
}

interface Gap {
  y: number; size: number;
  type: 'static' | 'shutter' | 'slider' | 'paint' | 'locked';
  period?: number; phase?: number;          // shutter
  range?: [number, number];                 // slider
  color?: ColorCode;                        // paint
  keyId?: string;                           // locked
}
interface PiecePlacement {
  shape: ShapeId; color: ColorCode; x: number; y: number;   // x,y = kutunun sol alt köşesi
  flags?: ('glass' | 'mortar' | 'balloon' | 'chained' | 'wet')[];
  wetMoves?: number;
}
interface ObstacleInstance { type: 'crate' | 'cement_bag' | 'screw' | 'key'; x: number; y: number; hp?: number; id?: string }
type Goal =
  | { type: 'build' }
  | { type: 'clear'; target: 'crate' | 'chain' | 'debris'; count: number }
  | { type: 'collect'; item: 'screw'; count: number };
type HiddenRule = { kind: 'repeat'; period: number } | { kind: 'mirrorOf'; segment: number };
```

`rows`: yukarıdan aşağıya yazılır, her satır 2 karakter; plan şantiyenin altına (y=0) hizalanır.

**Örnek (kısaltılmış; gerçek bölümde sahayı dolduran tüm bloklar listelenir):**

```json
{
  "id": 4, "chapter": 1,
  "name": { "tr": "Pencere", "en": "The Window" },
  "difficulty": "easy", "moves": 14, "teaches": "S2", "seed": 4004,
  "goals": [{ "type": "build" }],
  "gravity": { "build": "normal", "yard": false },
  "wall": { "height": 6, "gaps": [{ "y": 3, "size": 1, "type": "static" }] },
  "build": {
    "mode": "segments",
    "segments": [{ "name": { "tr": "Ön Cephe", "en": "Front Wall" }, "rows": ["YY", "WW", "W.", "WW", "YY"] }]
  },
  "yard": { "batches": [{ "forSegment": 0, "pieces": [
    { "shape": "D2_90", "color": "Y", "x": 0, "y": 7 },
    { "shape": "B1_0",  "color": "W", "x": 5, "y": 3 },
    { "shape": "D2_0",  "color": "W", "x": 2, "y": 6 },
    { "shape": "O4_0",  "color": "G", "x": 3, "y": 4 }
  ] }] },
  "obstacles": [],
  "tutorial": [{ "step": 1, "highlight": "gap", "textKey": "tut.l4.window" }]
}
```

**Engel eklenti arayüzü**

```ts
interface ObstacleRule {
  id: string;
  onLevelStart?(s: GameState): void;
  canPieceMove?(s: GameState, pieceId: string): boolean;                 // zincir, ıslak beton
  canPassGap?(s: GameState, gap: GapState, piece: Piece): boolean;       // kepenk, dar, kilitli
  onPassGap?(s: GameState, gap: GapState, piece: Piece): void;           // boya kapısı
  modifyFall?(s: GameState, piece: Piece, path: Cell[]): Cell[];         // rüzgâr, balon
  onLanded?(s: GameState, piece: Piece, fallDistance: number): LandingEffect; // cam, harç
  onNeighborMoved?(s: GameState, cell: Cell): void;                      // kasa, torba, zincir
  onMoveEnd?(s: GameState): void;  // kepenk, kayar kapı, döner platform, asansör, ıslak beton sayaçları
}
```

**Araçlar**

- `tools/validate-levels.ts`: şema + mantık kontrolü (çakışan bloklar, plan renkleri için yeterli malzeme, geçit/duvar tutarlılığı, renk sayısı limiti).
- `tools/solve.ts`: Girdi bölüm JSON; çıktı minimum (ya da bulunan en iyi) hamle sayısı, çözüm dizisi, YAO oranı, dallanma istatistikleri. Yöntem: A* / IDA* + durum karması (transposition table) + hamle budama (yalnızca anlamlı saha hamleleri: gerekli bir bloğu serbest bırakan, tünel açan ya da kamyon için yer açan). Bölüm başına zaman bütçesi (örn. 60 sn). Kesin çözüm bulunamazsa beam search üst sınır verir ve sonuç "sezgisel" diye işaretlenir. Zamanlı mekanikler hamle sayacına bağlıdır; gerçek zaman yoktur (ağır yerçekimindeki 700 ms tutma hariç; solver bunu yok sayar).
- `tools/playtest-bot.ts`: 3 profil: "acemi" (rastgele geçerli hamle, doğru yerleşime hafif eğilim), "orta" (açgözlü: önce doğrudan doğru yerleşim, yoksa kazı), "usta" (solver rehberli + %10 gürültü). Her profil × 500 oyun → kazanma oranı, ortalama kalan hamle, hatalı yerleşim sayısı, kayıp nedenleri → `docs/LEVEL_REPORT.md` + zorluk eğrisi grafiği.
- `tools/level-preview.ts`: her bölümün ASCII ve PNG önizlemesi (inceleme için).
- `tools/screens.ts`: Playwright ile tüm ekranların 390×844 görüntüleri → `artifacts/screens/`.

**Komutlar**

- `npm run dev` (`--host` ile aynı ağdaki telefondan test)
- `npm test`, `npm run build`
- `npm run levels:validate`, `levels:solve`, `levels:bot`, `levels:preview`, `levels:check` (ilk üçü bir arada)
- `npm run screens`

**Diğer**

- Kayıt: localStorage, sürümlü şema + migration. Bulut kaydı MVP dışı.
- Analytics: `track(event, params)`; MVP'de konsol/yerel çıktı. Olaylar: app_open, tutorial_step, level_start, level_end (sonuç, kalan hamle, hatalı yerleşim sayısı, YAO, süre), booster_used, offer_shown, purchase (sahte), event_join, event_eliminated, star_spent, life_lost.
- i18n: tüm metinler anahtarla; varsayılan TR, ek EN.
- Haptik: web'de Vibration API, Capacitor'da Haptics eklentisi.

---

## 13. Girişimci çıktılarının özeti

`docs/BUSINESS.md`, `NAMING.md`, `STORE_LISTING.md`, `ANALYTICS.md` (ayrıntılar ajan tanımında). Faz 1 sonunda bana özellikle şunları sun: hedef kitle kararı, monetizasyon modeli, MVP kesme çizgisi, en kritik 5 risk ve ilk 3 isim önerisi.

---

## 14. Kalite çıtası (bitti tanımı)

- `npm test`, `npm run build`, `npm run levels:check` yeşil; konsolda hata yok.
- Orta seviye telefonda 60 FPS; Chrome DevTools 4× CPU yavaşlatmasında ≥ 50 FPS.
- Sürükleme: dokunuş ile blok hareketi arasında tek kare; blok parmağın altında kaybolmaz.
- 50 bölümün tamamı çözülebilir, her bölümde YAO ≥ %60, zorluk eğrisi hedef aralıklarda.
- İlk açılıştan Bölüm 1'e ≤ 10 saniye ve ≤ 3 dokunuş.
- Her GDD kuralının en az bir testi var.
- Tüm ekranların görüntüleri design-lead tarafından incelenmiş; açık kritik yorum yok.
- Tüm metinler i18n'de, TR/EN eksiksiz; Türkçe karakterler fontta doğru görünüyor.

---

## 15. Varsayımlar (Faz 1 sonunda bana onaylat)

1. Önce web (mobil tarayıcı) prototip, sonra Capacitor ile iOS/Android.
2. Oyuncu blok döndüremez; yalnızca Vinç güçlendiricisi döndürür.
3. Hatalı yerleşimde blok geri seker ve hamle yanar (harçlı bloklar hariç).
4. Geçitten giren blok düşmez (ray + iskele); duvarın üstünden gelen blok düşer.
5. Saha yerçekimi varsayılan olarak kapalı; 14. bölümden itibaren bazı bölümlerde açık.
6. Büyük yapılar için malzeme kamyonla partiler halinde gelir.
7. 100 kişilik sistemler MVP'de botlarla çalışır.
8. Hedef kitle yetişkin casual oyuncu (çocuk karakter ≠ çocuk oyunu); entrepreneur teyit eder.
9. Dil: TR + EN. Çalışma adı: "Minik Usta".

---

## 16. Başla

**Faz 0'ı şimdi başlat:**
1. Bu belgeyi `docs/BRIEF.md` olarak kaydet.
2. Bölüm 2'deki 4 ajan dosyasını oluştur.
3. `CLAUDE.md`'yi oluştur (Bölüm 3'teki içerikle).
4. `docs/` iskeletini, boş `DECISIONS.md` ve `REVIEW_LOG.md`'yi oluştur.
5. `git init`; Vite + TypeScript + Phaser iskeletini kur; `npm run dev` ile boş sahnenin açıldığını doğrula; commit at.

**Ardından Faz 1:** 4 ajanı kendi belgeleri için paralel çalıştır. Hepsi bitince her ajandan diğerlerinin belgelerini incelemesini iste (çapraz inceleme turu). REVIEW_LOG'daki yorumları sahiplerine uygulat, kararları DECISIONS.md'ye yaz. Sonra **dur** ve bana şunları sun: 1 sayfalık özet, Bölüm 15'teki varsayımların onay listesi, açık sorular ve Faz 2 planı.
