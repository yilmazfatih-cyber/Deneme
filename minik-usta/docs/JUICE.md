# Oyun hissi (juice) — Minik Usta

Sahip: design-lead · Durum: Faz 1 revizyonu (2026-10-04; R-01, R-10…R-12, R-15, R-19 işlendi) · Kaynak: `docs/BRIEF.md`
§4.11, §11.4 · Süre token'ları: `src/theme/tokens.json` → `duration`, `easing`, `haptic`, `physics`, `particles`

---

## 0. Kurallar

1. **Katmanlı ödül (ilke 5):** her ödül anı = animasyon + parçacık + ses + haptik. Ödül anları: doğru yerleşim, kombo,
   dilim bitişi, kazanma, toplama (vida, anahtar), engel kırma.
2. **Gecikme eklenmez:** sürükleme sırasında hiçbir animasyon bloğun parmağı takibini geciktirmez (tek kare şartı).
   Animasyonlar görsel katmandadır; oyun durumu (`src/core`) anında güncellenir, animasyon arkadan gelir.
3. **Giriş kilidi (R-12):** bir animasyon oynarken oyuncu yeni blok tutabilir. **Tutma anında tahtayı değiştiren
   bekleyen animasyonlar son karesine atlar** (düşüş, iniş, geri sekme, saha yerçekimi zincirlemesi, engel tepkileri);
   parçacık ve ses kendi hızında sürer; sürükleme gerçek durumdan başlar. Tahta girişi yalnız **dilim kayması (600 ms),
   kamyon teslimatı (700 ms) ve Kamyon Yardımı / karıştırma (900 ms)** sırasında kapalıdır; bu dizilerde dokunuş
   oynatmayı 3× hızlandırır. Toplam bekleme her olayda ≤ 900 ms.
4. **Parçacık bütçesi:** ekranda aynı anda en fazla 120 parçacık; tek patlama (dalga) en fazla 40
   (`particles.maxPerBurst`). Daha büyük anlar dalgalara bölünür (kazanma: `particles.win` 40 × `winWaves` 2). Bütçe
   aşılırsa en eski patlama erken söner (doku ailesi başına bir emitter, `maxAliveParticles`). Parçacıklar tek bir doku
   atlasından (`fx_*`), toplu çizimle.
5. **Ekran sallama** yalnız iki olayda: dilim tamamlama (3 px) ve cam kırılma (2 px). Hatalı yerleşimde ekran değil
   **blok** sallanır.
6. **Ses:** MVP'de prosedürel (ZzFX benzeri küçük üreteç; kütüphane ve lisans code-lead'de). Aşağıdaki tarifler
   başlangıç parametresidir; Faz 2'de kulakla ayarlanır. Ses adı = `sfx_<olay>`. Aynı ses 60 ms içinde ikinci kez
   çalmaz (zincirleme düşüşlerde yığılma olmasın); 4 sesten fazlası aynı anda çalmaz. Üretim: 22,05 kHz mono
   (`audio.sampleRateHz`), sahne bazında ve boşta dilimlenerek (≤ 4 ms/kare) ön-çizilir. Perde ve ses farkları (kombo
   perdesi, `sfx_coin` +1 yarım ton, `sfx_land` +0…+4 dB, karakter sesi ±2 yarım ton) yeniden çizimle değil çalma
   `rate` / `volume` ile yapılır. Ses kilidi açılmadan istenen sesler **atılır** (kuyruğa alınmaz).
7. **Haptik ölçeği:**

   | Ad | Capacitor Haptics | Web `navigator.vibrate` |
   | -- | ----------------- | ----------------------- |
   | hafif | `impact({ style: Light })` | `10` |
   | orta | `impact({ style: Medium })` | `20` |
   | güçlü | `impact({ style: Heavy })` | `35` |
   | çift hafif | Light ×2, 80 ms arayla | `[10, 70, 10]` |
   | başarı | `notification({ type: Success })` | `[15, 60, 25]` |
   | zafer deseni | Light, Light, Medium, Heavy (120 ms aralık) | `[10, 110, 10, 110, 20, 100, 35]` |

   Not: iOS Safari `navigator.vibrate` desteklemez; web'de iOS'ta haptik sessizce atlanır. Ayarlarda titreşim
   kapalıysa hiçbiri çalmaz.
8. **Azaltılmış hareket** (`Animasyonları azalt` açık ya da `prefers-reduced-motion`) = **solma varyantları** (R-12):
   ölçek sıçramaları ≤ %3, ekran sallama yok, kayma geçişleri yerine 150 ms solma (`duration.reducedFade`), parçacık
   sayısı ≤ %20 (ya da tek bir sabit parıltı), konfeti yok (sabit pankart), döngüsel boşta animasyonlar durur. Hareketi
   hızlandırmak değil **azaltmak**tır. **Oyun bilgisi asla kaybolmaz** (ör. gölge, sayaç, geri sekme yönü, eksik destek
   taraması). Süreler oyun kuralı ise (ağır yerçekimi 700 / 1400 ms) değişmez. Haptik yalnız "Titreşim" anahtarına
   bağlıdır; azaltılmış hareket haptiği kapatmaz.
9. **Easing adları** Phaser adlandırmasıdır: `Linear`, `Quad.easeOut`, `Cubic.easeIn`, `Back.easeOut`,
   `Sine.easeInOut`, `Expo.easeOut`, `Elastic.easeOut`, `Bounce.easeOut`.
10. **Oynatma sırası = K-35 adımı** (product-lead): oyuncu neden-sonucu okuyabilsin diye hamle sonu olayları şu düzenle
    oynar:
    - Adım 1–4 **sıralı**: bırakma → düşüş → doğrulama (doğru: #12 / hatalı: #13) → sayaç (#50; cam varsa −2).
    - Adım 5 (komşu etkileri: kasa, torba, zincir, toplama) **aynı anda**.
    - Adım 6 (saha yerçekimi zincirlemesi) 30 ms kademeli; döngü tekrarlarsa her tur ayrı dalga.
    - Adım 8 (dilim kayması 600 ms) → adım 9 (kamyon 700 ms): **sıralı ve girdi kilitli**.
    - Adım 10 zamanlayıcıları (kepenk 350, kayar kapı 300, döner platform 500, asansör 300, ıslak beton 150 ms) **aynı
      anda**; en uzunu 500 ms.
    - Kamyon Yardımı (adım 12) en son kilitli dizi; kazanma ya da kaybetme **en son**.
    Kural 3 gereği oyuncu kilitsiz bir adımda blok tutarsa kalan kilitsiz adımlar son karesine atlar.
11. **Maske ve Filter kullanılmaz** (code-lead; düşük cihaz kare bütçesi): silme/dolma efektleri yeni renkli ikinci
    görüntünün `setCrop` genişliğini 0 → w tween'leyerek; parıltı süpürmesi yerine siluet üstünde ADD tint'li beyaz
    flaş (alfa 0 → 0,6 → 0); ekran dışına kayan öğeler ekran kenarıyla doğal kırpılır; spot ışığı 4 dikdörtgen + 4
    çeyrek daire. Bulanık gölgeler açılışta pişirilmiş siluet dokularıdır. Faz 5 perf testinde pay kalırsa süpürme
    Mask filtresiyle yeniden denenir.
12. **Kapsam etiketleri** (entrepreneur): **Faz 2 P0** = #1–13, 18, 19, 50–53, 55–58, 69–71, 83–84 · **engel
    olayları** #22–49 ilgili engelle birlikte Faz 3 · **[MVP-lite]** #16 (yalnız ikon parlaması), #75 (konfetisiz sade
    yükselme), #79 (blok düşüşü; karakter animasyonu Sonra) · **[Sonra]** #81 karakter "bla" sesleri, #82 boşta göz
    kırpma ve dans, §7 müzik. Diğerleri MVP.

### 0.1 Fizik sabitleri (görsel)

| Ayar | Düşüş hızı | Not |
| ---- | ---------- | --- |
| `gravity.build = normal` | ivme 90 hücre/s², tavan 22 hücre/s (1 hücre ≈ 150 ms, 6 hücre ≈ 395 ms ≈ 66 ms/satır, 8 hücre ≈ 61 ms/satır) | K-19 "60 ms/satır" ile hizalı |
| `low` (Hafif) | sabit 4,5 hücre/s (≈ 222 ms/satır; süzülme), hafif sinüs sallantı ±2° | düşerken tahtaya dokunulursa dokunulan yana 1 sütun kayar (K-19, UX §5.6); sabit hız yönlendirme penceresini öngörülebilir yapar |
| `high` (Ağır) | ivme 300 hücre/s², tavan 40 hücre/s (6 hücre ≈ 216 ms ≈ 36 ms/satır, 8 hücre ≈ 33 ms/satır) | şantiye üstüne geçtikten 700 ms (ayar açıkken 1400 ms) sonra parmaktan kayar |
| Saha yerçekimi / kamyon | ivme 80 hücre/s², tavan 20 hücre/s | zincirleme düşüşte sütunlar 30 ms kademeli |
| Balon yükselme | sabit 5 hücre/s, varışta 2 küçük sekme | tavan = aktif dilimin plan tepesi (tavan kirişi, ART §4) |

Tek kaynak `tokens.physics`; GDD K-19'daki ms/satır değerleri görsel varsayımdır. Kural sonucu (iniş, cam eşiği)
hızdan bağımsızdır; `steer.atRow` bu eğriden hesaplanır (code-lead).

---

## 1. Çekirdek sürükleme

| # | Olay | Görsel | Süre ms | Easing | Parçacık | Ses | Haptik | Azaltılmış hareket |
| - | ---- | ------ | ------- | ------ | -------- | --- | ------ | ------------------ |
| 1 | Blok kaldırma | ölçek 1,00→1,08, 6 px yukarı zıplama, gölge belirir (y +18, bulanık 16, %30), parmak ofseti 1,2 hücreye kayar (90 ms) | 80 | `Back.easeOut` | yok | `sfx_pick`: sine 520→780 Hz, 70 ms, atak 2 ms, hızlı sönüm ("pop") | hafif | ölçek 1,03, zıplama yok, ofset anında |
| 2 | Kaldırma engellendi (taşınamaz: üstü dolu, zincir, ıslak beton) | blok 2 px sağ-sol titreme ×3; engel (zincir/sayaç/üstteki blok) 300 ms beyaz parlar | 180 | `Sine.easeInOut` | 3 toz zerresi blok altından | `sfx_blocked`: triangle 220→180 Hz, 90 ms, yumuşak ("tık-tık") | hafif | titreme yok; yalnız engel parlaması |
| 3 | Sürükleme (takip) | blok parmak+ofset; eğim hıza göre ±4°; hız > 12 hücre/s ise 3 karelik soluk iz (%25) | sürekli | — | yok | yok | yok | eğim ve iz yok |
| 4 | Yapışkan takip engele çarptı | blok çarpma yönüne 6 px esner, 120 ms'de geri; ayrılık > 0,5 hücre ve > 150 ms ise noktalı ip belirir (bloktan parmağa), blok parmağa 3° yaslanır | 120 | `Back.easeOut` | 2 küçük toz çarpma noktasında | `sfx_bump`: sine 160 Hz, 50 ms, düşük ses (−12 dB) | hafif (yalnız ilk çarpmada, 400 ms'de bir) | esneme yok; yalnız ip |
| 5 | Vinç alanına giriş | blok gölgesi uzar (y +18 → +30), gölge %30→%20 | 150 | `Quad.easeOut` | yok | yok | yok | aynı (bilgi) |
| 6 | Duvarın üstünden geçiş | duvar başlığını geçerken 200 ms'lik beyaz hareket izi (bloğun arkasında 3 hayalet, %30→0) | 200 | `Quad.easeOut` | 6 rüzgâr çizgisi | `sfx_whoosh`: filtrelenmiş gürültü, bant 900→2400 Hz süpürme, 180 ms | yok | iz yok; ses kalır |
| 7 | Düşüş gölgesi durumu değişti (doğru↔hatalı, neden değişti) | kontur rengi/deseni 80 ms'de değişir, rozet (✓ / ! / ↓) 0,8→1,0; K-34'te eksik destek taraması belirir | 80 | `Quad.easeOut` | yok | `sfx_ghost_ok` (sine 880 Hz, 30 ms, −18 dB) yalnız Kolay/Normal'de ve gölge `?` hücresine değmiyorken; Zor/Çok Zor'da ve nötr gölgede **ses yok** (ses kanalından bilgi sızmaz); hatalıda ses yok | yok | aynı |
| 8 | İptal (havada bırakma / geçersiz yer, K-05, K-07) | blok kavisli yolla başladığı yere döner, ölçek 1,08→1,00 | 220 | `Cubic.easeInOut` | yok | `sfx_cancel`: sine 600→400 Hz, 90 ms, yumuşak | yok | 150 ms düz yol |
| 9 | Sahada bırakma (K-10) | hücreye oturma, ölçek 1,08→1,00, küçük squash (y 0,94) | 90 | `Quad.easeOut` | 4 toz zerresi | `sfx_set_yard`: triangle 330 Hz, 60 ms ("tok" yumuşak) | hafif | squash yok |
| 10 | Düşüş (şantiye) | blok fizik sabitleriyle düşer, düşüşte 2 karelik dikey iz (%20) | hesaplanan (§0.1) | ivmeli | yok | `sfx_fall`: gürültü bandı 1200→600 Hz, düşüş süresi boyunca, −14 dB (yalnız ≥ 3 hücre düşüşte) | yok | iz yok |
| 11 | İniş | squash: ölçek x 1,12 / y 0,86 → 1/1, toz bulutu iki yana | 120 | `Back.easeOut` | 10 toz (fx_dust), yatay yayılım ±60 px | `sfx_land`: sine 140→90 Hz + gürültü vuruşu 30 ms ("tok"); düşüş mesafesine göre ses +0…+4 dB | orta | squash x 1,03; 2 toz |
| 12 | Doğru yerleşim | plan hücreleri bloğun rengiyle "dolar" (üstteki yeni renk görüntüsü `setCrop` ile 200 ms'de açılır), blok silueti üstünde beyaz ADD flaş (alfa 0 → 0,6 → 0; süpürme maskesi yok), köşelere 4 harç noktası; inşa cephesi yeni hücreye kayar (#83) | 200 | `Expo.easeOut` | 14 kıvılcım (fx_spark, blok rengi + beyaz), yukarı 120–220 px | `sfx_place_ok`: üçgen + sine çan, kök 660 Hz (E5); kombo basamağına göre +0, +2, +4, +5, +7 yarım ton; 220 ms sönüm | hafif | 4 kıvılcım; süpürme yerine 150 ms parlama |
| 13 | Hatalı yerleşim (K-17) | blok kırmızı parlar (#FF4A3D %50 tint, 100 ms), 2 px yatay sallanma ×3, kavisle (yay yüksekliği 1,5 hücre) K-17 hedefine geri seker (başlangıç → sahanın üstünden düşürme → kamyon kuyruğu #88); neden K-34 ise ardından #84; Tuna yüz buruşturur | 350 | sallanma `Sine.easeInOut`, sekme `Quad.easeOut` | 3 küçük gri toz geri sekme noktasında | `sfx_place_bad`: kare dalga 300→200 Hz, 140 ms, hafif bitcrush ("tıs"); sonra `sfx_bounce` sine 420→520 Hz 80 ms | çift hafif | sallanma yok; parlama + düz yol 220 ms |
| 14 | Harçlı blok yapıştı (Y8) | kırmızı parlama yerine gri harç damlaları bloğun altına yayılır (3 damla, 0→100% ölçek), blok 1 px titrer; "yapışık" rozeti belirir | 300 | `Back.easeOut` | 6 gri harç damlası, yere yapışır | `sfx_mortar`: düşük sine 110 Hz + ıslak gürültü 150 ms ("şlap") | orta | damlalar anında |
| 15 | Usta Serisi boncuğu doldu | boncuk 0,6→1,2→1,0 ölçek, altın parlama | 160 | `Back.easeOut` | 4 altın kıvılcım | `sfx_streak_pip`: sine, kombo tınısıyla aynı perde, 60 ms | yok | ölçek 1,03 |
| 16 | Kombo / Altın Mala kazanıldı (K-33) **[MVP-lite: yalnız ikon parlaması + ses]** | 4. boncukta mala ikonu büyür (1,0→1,4→1,1), dönerek parlar; Tuna ve Kepçe dans eder | 500 | `Elastic.easeOut` | 30 altın kıvılcım yağmuru (yukarıdan, fx_gold) | `sfx_combo`: 4 notalı fanfar (E5-G5-B5-E6, kare+sine, 120 ms aralık) | orta | ikon parlar, yağmur yerine 6 kıvılcım |
| 17 | Altın Mala kullanımı | mala seçilen plan hücresine (yalnız inşa cephesi hücreleri seçilebilir) uçar (kavis), hücreyi "sıvar" (`setCrop` soldan sağa 200 ms), hücre doğru renkle dolar | 450 | `Quad.easeInOut` | 12 altın + renk kıvılcımı | `sfx_trowel`: gürültü süpürme 2000→800 Hz 200 ms + `sfx_place_ok` | hafif | uçuş yerine solma |
| 18 | Dilim tamamlama (K-22) | iskele söner (%100→%30, 200 ms), yapı parlar (beyaz %40 ×2), ekran 3 px sallanır, tamamlanan dilim **küçülerek panorama şeridindeki yerine uçar**, sıradaki dilim ekranın sağ kenarından girer (ekran kenarı kırpar; maske yok); panorama dilimi dolar | 600 | kayma `Cubic.easeInOut` | 24 konfeti parçası (renkler = dilimin renkleri) | `sfx_segment`: "ta-da" (sine akor C5-E5-G5 → C6, 350 ms) + vida sıkma tıkırtıları | güçlü | sallama yok; kayma yerine 150 ms solma + panorama dolumu |
| 19 | Kamyon teslimatı (K-25) | kamyon sağdan sahanın üstüne girer (300 ms), kasası kalkar, bloklar belirtilen sütunlardan 60 ms arayla düşer, kamyon çıkar | 700 | giriş `Back.easeOut`, çıkış `Quad.easeIn` | iniş tozları (her blok 4) | `sfx_truck_horn` (2 kare dalga 400/500 Hz, 2×120 ms "düt-düt") + her blokta `sfx_land` (−6 dB) | hafif (ilk blokta) | kamyon görünür/kaybolur; bloklar düşer (bilgi) |
| 20 | Kamyon kuyruğu (K-26) | "Kamyonda: N" çipi 1,0→1,15→1,0; N azaldıkça rakam yukarı kayar; yer açılınca kuyruğun bir sonraki bloğu çipten sahaya uçar (FIFO, eskiler önce) | 200 | `Back.easeOut` | yok | `sfx_queue`: sine 500 Hz 40 ms | yok | ölçek 1,03 |
| 21a | Kamyon Yardımı D1 — hamle yok (K-30) | Usta Dede balonu `tut.ctx.truckhelp.free` (1,2 s); bütün zincirler #36 gibi kırılır, ıslak tabakalar #38 gibi kurur (aynı anda) | 600 | `Cubic.easeIn` | 8 metal kıvılcım + 10 gri pul | `sfx_chain_break` + `sfx_dry` | orta | parçalar solar |
| 21b | Kamyon Yardımı D2 — malzeme açığı (K-30) | Dede balonu `tut.ctx.truckhelp.material`; kamyon #19 gibi gelir ve **eksik malzemeyi** (o renkte `B1` bloklar) döker | 700 | #19 | #19 | `sfx_truck_horn` + `sfx_land` | hafif | #19 |
| 21c | Kamyon Yardımı D3 — yeniden diziliş (K-30) | Dede balonu `tut.ctx.reshuffle`; kamyon gelir, saha blokları havaya kalkar (kasaya), yeniden kesilip dizilir, yeni yerlerine düşer | 900 | `Sine.easeInOut` | 20 toz | `sfx_reshuffle`: korna + tahta karışma tıkırtıları (8 gürültü vuruşu) | orta | kalkma/düşme yerine 300 ms solup yeniden belirme |

---

## 2. Geçitler, ray ve duvar

| # | Olay | Görsel | Süre ms | Easing | Parçacık | Ses | Haptik | Azaltılmış hareket |
| - | ---- | ------ | ------- | ------ | -------- | --- | ------ | ------------------ |
| 22 | Sabit geçitten geçiş (W1) | blok raya oturduğunda raylar boyunca kısa ışık akışı; ikaz bantları bir kez parlar | 150 | `Quad.easeOut` | 4 kıvılcım ray temasında | `sfx_gap_rail`: metalik "klak" (kare 900 Hz 30 ms + sine 1800 Hz 20 ms) | hafif | ışık akışı yok |
| 23 | Raya park (K-12, bırakma) | iskele kelepçeleri bloğu "tutar" (2 turuncu kelepçe 0→1 ölçek) | 120 | `Back.easeOut` | yok | `sfx_clamp`: sine 700→500 Hz 60 ms | hafif | ölçek yok |
| 24 | Dar geçitten geçiş (W3) | blok geçitte dikeyde %6 ezilir (y 0,94) ve çıkınca geri gelir; çeneler 4 px aralanır | 160 | `Sine.easeInOut` | 2 kıvılcım | `sfx_gap_squeeze`: sine 300→600 Hz kayış 140 ms ("vıjj") | hafif | ezilme yok |
| 25 | Kepenk açılma / kapanma (W4) | panjur lamelleri 1'er satır sarılır/iner; sayaç rozeti döner ve yeni sayıyı gösterir | 350 | `Cubic.easeInOut` | açılışta 4 toz | `sfx_shutter`: 6 hızlı tıkırtı (gürültü 20 ms, 40 ms aralık) + metalik son vuruş | yok | lameller anında, sayaç değişir |
| 26 | Kepenk sayaç tıkı (her hamle) | rozet rakamı yukarı kayar | 150 | `Quad.easeOut` | yok | `sfx_tick`: sine 1000 Hz 15 ms (−20 dB) | yok | anında |
| 27 | Kayar kapı kayması (W5) | açıklık rayda 1 satır kayar, ▲▼ oku yön değiştirir | 300 | `Sine.easeInOut` | 2 kıvılcım ray uçlarında | `sfx_slider`: gürültü + sine 220 Hz sürtünme 260 ms | yok | anında yer değiştirir, ok değişir |
| 28 | Boya kapısından geçiş (W6) | blok yolu boya düğümünden geçtiği an (bırakma yeri ne olursa olsun, `via`) soldan sağa yeni renge "boyanır" (`setCrop` silme, maske yok), sembol değişimi ortada çapraz solma; kapı damlaları sıçrar | 300 | `Quad.easeInOut` | 10 boya damlası (kapı rengi) | `sfx_paint`: ıslak "flup" (gürültü 400→1200 Hz 120 ms) + sine 880 Hz 60 ms | hafif | renk anında değişir, 2 damla |
| 29 | Kilitli geçit açılması (W7) | anahtar (toplandığı yerden) kilide uçar (kavis, 400 ms), kilit döner ve açılır, parmaklıklar yukarı kalkar | 700 | uçuş `Quad.easeInOut`, parmaklık `Back.easeOut` | 12 altın kıvılcım | `sfx_unlock`: metalik tıkırtı + sine akor (G5-D6) | başarı | uçuş yerine solma; parmaklık anında kalkar |
| 30 | Rüzgâr sapması (W8) | düşen 1 geniş blok `dir` yönünde kavisle 1 sütun kayar, ±6° yatar; fan hızlanır | düşüşle eş zamanlı (+ 120) | `Sine.easeInOut` | 6 rüzgâr çizgisi bloğun yanında | `sfx_wind`: gürültü bant 600 Hz, 300 ms "vuuu" | yok | yatma yok; kavis kalır (bilgi) |
| 31 | Fan boşta | 3 kanat dönüşü (1 tur / 0,8 s), rüzgâr çizgileri 2 s döngü | döngü | `Linear` | — | yok | yok | dönme durur, çizgiler sabit |

---

## 3. Engeller

| # | Olay | Görsel | Süre ms | Easing | Parçacık | Ses | Haptik | Azaltılmış hareket |
| - | ---- | ------ | ------- | ------ | -------- | --- | ------ | ------------------ |
| 32 | Kasa vurma (Y1, kat düşer) | kasa 4 px aşağı-yukarı sarsılır, bir metal kuşak kırılıp düşer (dönerek), yeni çatlak çizilir | 250 | `Back.easeOut` | 6 tahta kıymığı (fx_splinter) | `sfx_crate_hit`: tahta "tak" (gürültü vuruşu 25 ms + sine 260 Hz 60 ms) | hafif | sarsılma yok; kuşak solar |
| 33 | Kasa kırılma (son kat) | kasa 4 tahtaya ayrılır, tahtalar dönerek dağılır ve solar; hedef sayacına küçük ikon uçar (clear hedefi) | 400 | `Quad.easeOut` | 16 kıymık + 6 toz | `sfx_crate_break`: tahta çatırtı (3 gürültü vuruşu, 40 ms aralık) + `sfx_goal_tick` | orta | parçalanma yerine 150 ms solma; ikon uçar |
| 34 | Çimento torbası yırtılma (Y2) | torba ortadan yırtılır, gri toz bulutu yükselir, torba buruşup kaybolur | 400 | `Quad.easeOut` | 18 gri toz (yavaş, yukarı) | `sfx_bag_tear`: kâğıt yırtılma (yüksek bant gürültü 150 ms) + puf | hafif | toz 3, solma |
| 35 | Çimento torbası düşmesi (yerçekimi) | torba ağır düşer, inişte yassılır (y 0,8) | fizik + 140 | `Bounce.easeOut` | 6 toz | `sfx_bag_thud`: düşük sine 90 Hz 120 ms | hafif | yassılma 0,97 |
| 36 | Zincir kırılma (Y3) | asma kilit açılır, zincir halkaları 2 parçaya ayrılıp düşer (yerçekimiyle, döner) | 450 | `Cubic.easeIn` | 8 metal kıvılcım | `sfx_chain_break`: metal "çın" (sine 1500 Hz 40 ms + kare 700 Hz 60 ms) + halka şıngırtısı | orta | parçalar solar |
| 37 | Islak beton sayaç azalma (Y4) | sayaç rakamı aşağı kayar, ıslak tabaka %10 matlaşır | 150 | `Quad.easeOut` | 1 su damlası | `sfx_tick` | yok | anında |
| 38 | Islak beton kurudu | tabaka çatlayıp ince pul pul dökülür, sembol %50→%100 | 350 | `Quad.easeOut` | 10 gri pul | `sfx_dry`: kuru çıtırtı (gürültü 200 ms, düşük) + sine 660 Hz 40 ms | hafif | tabaka solar |
| 39 | Anahtar alma | anahtar zeminden yükselir (1,0→1,3), döner, ilgili kilide doğru küçük iz bırakır (ya da hedef paneline) | 400 | `Back.easeOut` | 10 altın kıvılcım | `sfx_key`: üç nota çan (C6-E6-G6, 60 ms aralık) | başarı | yükselme 1,03, iz yok |
| 40 | Vida toplama (Y7) | vida döne döne yükselir ve hedef panelindeki sayaca uçar (kavis), sayaç +1 zıplar | 500 | `Quad.easeInOut` | 8 altın kıvılcım + varışta 4 | `sfx_screw`: metalik "vıd" (sine 1200→1800 Hz 80 ms) + varışta `sfx_goal_tick` (sine 990 Hz 40 ms) | hafif | solma + sayaç güncellemesi |
| 41 | Moloz taşındı / kırıldı (S4) | moloz sahaya bırakılınca toz çıkar; kırılırsa 6 beton parçasına ayrılır | 300 | `Quad.easeOut` | 12 gri parça + toz | `sfx_debris`: taş "kırt" (gürültü 60 ms, düşük bant) | orta | parçalar 3 |
| 42 | Cam kırılma (S3, K-21) | cam blok inişte yıldız çatlakla çatlar (60 ms), parçalara ayrılır, parçalar düşer; ekran 2 px sallanır; blok K-17 sırasıyla **başlangıç hücresinde** (doluysa sahanın üstünden düşerek) yeniden belirir (+1 hamle cezası, toplam −2: sayaç kırmızı değil, turuncu "−1" ek çipi uçar) | 500 | `Expo.easeOut` | 20 cam kırığı (beyaz-mavi üçgen, dönerek), 6 parıltı | `sfx_glass`: yüksek gürültü vuruşu + sine 2400/3100 Hz şıngırtı 250 ms | orta | sallama yok; çatlak + 150 ms solma; "−1" çipi kalır |
| 43 | Balon yükselme (S8) | bırakılınca blok yukarı yükselir ve **tavana takılır** (aktif dilimin plan tepesindeki tavan kirişi, ya da siluet tavana ulaştıysa siluetin üstü), balon hafif şişer (1,0→1,1), varışta 2 küçük sekme, ip kirişe bağlanır. Tavanın **üstünden** bırakılan balonlu blok ipi gerilerek kirişe **aşağı süzülür** (`duration.ceilingSettle`) | yol / 5 hücre·s⁻¹ + 200 | `Sine.easeOut`, sekme `Bounce.easeOut` | 4 küçük yıldız | `sfx_balloon`: yükselen sine 400→900 Hz (yükselme boyunca, −10 dB) + varışta "pof" | hafif (varışta) | sekme yok |
| 44 | Saha yerçekimi zincirleme (Y6) | altı boşalan bloklar sütun sütun 30 ms kademeli düşer, her inişte küçük squash | fizik | ivmeli | her iniş 3 toz | `sfx_land` (−8 dB, 60 ms tekrar kilidi) | hafif (yalnız ilk iniş) | squash yok |
| 45 | Ağır yerçekimi kayma (G-H, 700 / 1400 ms) | şantiye üstüne geçince bloğun sağ üstünde Ø 96 halka sayaç dolar (beyaz → son %30'da turuncu; ayar açıkken 1400 ms, UX §5.7); son 300 ms'de hafif haptik tık; süre bitince blok parmaktan kayar (2° yatar) ve düşer | 700 / 1400 + düşüş | `Linear` (çubuk) | yok | `sfx_slip`: sine 500→300 Hz 120 ms | hafif (kayınca) | aynı (oyun bilgisi; çubuk kalır) |
| 46 | Hafif yerçekimi yönlendirme (G-L) | düşerken (ya da balon yükselirken) tahtaya dokunulunca ya da boş bir noktadan yatay kaydırılınca blok **dokunulan / kaydırılan yana** 1 sütun kayar (yay), "↔" çipi söner, gölge yeni inişe kayar (80 ms); o yönde sütun yoksa çip 2 px titrer. Düşüş başına 1 kez; 2 genişlikli blokta çip yok | 160 | `Quad.easeOut` | 3 rüzgâr çizgisi | `sfx_steer`: sine 600→700 Hz 60 ms | hafif | aynı (bilgi) |
| 47 | Döner platform dönüşü (S5) | dilimler bir sıra döner: öndeki dilim küçülerek panorama şeridine kayar, sıradaki ekranın sağ kenarından büyüyerek öne gelir (maske yok); sayaç sıfırlanır | 500 | `Cubic.easeInOut` | yok | `sfx_carousel`: mekanik tıkırtı dizisi (5 vuruş) + sine 440→660 Hz | hafif | 150 ms solma |
| 48 | Asansör iskele salınımı (S6) | şantiye çerçevesi (tavan kirişi dahil) 1 satır yukarı/aşağı kayar, iskele zincirleri sallanır; geçit hizası kılavuz çizgisi yeni satıra kayar | 300 | `Sine.easeInOut` | yok | `sfx_elevator`: zincir tıkırtısı + sine 200→240 Hz 250 ms | yok | anında yer değiştirir |
| 49 | Gizli `?` hücre açılması (K-32) | kâğıt etiket kart gibi döner (y ekseni), arkasından plan rengi + sembol çıkar; desen ipucu olarak ilgili diğer `?` hücrelerinde 400 ms soluk önizleme | 350 | `Back.easeOut` | 6 beyaz parıltı | `sfx_reveal`: sine C6→G6 60 ms ×2 | hafif | dönme yerine çapraz solma |

---

## 4. Hamle, teklif ve sonuç

| # | Olay | Görsel | Süre ms | Easing | Parçacık | Ses | Haptik | Azaltılmış hareket |
| - | ---- | ------ | ------- | ------ | -------- | --- | ------ | ------------------ |
| 50 | Hamle sayacı azalma | rakam yukarı kayıp kaybolur, yenisi aşağıdan gelir | 180 | `Quad.easeOut` | yok | yok | yok | anında |
| 51 | Son 5 hamle nabzı | sayaç paneli 1,0↔1,06 nabız (1,0 s periyot), rakam rengi `ui.ink` → #E8473B, panel kenarı kırmızı parlar; her hamlede bir kez güçlü nabız | 1000 döngü | `Sine.easeInOut` | yok | `sfx_lastmoves` (yalnız 5'e inince bir kez): iki nota uyarı (sine 660/520 Hz, 2×80 ms) | hafif (5'e inince) | nabız yok; renk ve kenar kalır |
| 52 | +5 hamle teklifi (K-29) | karartma (200 ms) → pencere aşağıdan kayarak gelir ve 1,0'a oturur; üç seçenek düğmesi **aynı** giriş animasyonuyla 40 ms arayla belirir; "+5" çipi pencere açılırken **bir kez** zıplar, sonra durur (döngüsel dikkat animasyonu yok, R-15); Tuna "kararlı" ifade, balon yok | 300 | `Back.easeOut` | yok | `sfx_offer`: sine 440→660 Hz 120 ms yumuşak | orta | 150 ms solma, zıplama yok |
| 53 | +5 hamle eklendi | 5 küçük "+1" çipi düğmeden sayaca uçar (60 ms arayla), sayaç 1,2 zıplar | 500 | `Quad.easeInOut` | 8 altın kıvılcım | `sfx_moves_add`: 5 artan nota (C5→G5), 60 ms aralık | başarı | tek çip, anında sayaç |
| 54 | Hedef tamamlandı | hedef ikonu ✓ ile döner, panel yeşil parlar | 300 | `Back.easeOut` | 6 yeşil kıvılcım | `sfx_goal_done`: sine G5-C6 120 ms | hafif | dönme yok |
| 55 | Kazanma (K-28) | (1) dilimler son kez sırayla parlar 400 ms → (2) kurdele gerilir ve Bay Kurdele makası keser 600 ms → (3) konfeti 1,5 s → (4) "KAZANDIN!" yazısı 0→1,1→1,0 → (5) Tuna ve Kepçe dansı ([Sonra]; MVP'de "mutlu" ifade) | 1500 | yazı `Elastic.easeOut` | konfeti 2 dalga × 40 (`particles.win` × `winWaves`; fx_confetti, palet renkleri) | `music_win`: 2,5 s'lik zafer cıngılı (prosedürel 4 ölçü arpej C-E-G-C + tambur) | zafer deseni | konfeti yerine sabit pankart; yazı solma |
| 56 | Bonus İnşaat (kalan hamle → altın) | altın veren kalan hamleler (META: en çok 10) için sayaçtan bir blok fırlar, şantiyeye düşer ve altın sikkeye dönüşüp altın sayacına uçar (120 ms aralık, en fazla 1,2 s; dokununca hızlanır ×3); fazla hamleler sayaçta söner; ardından kalan Altın Mala başına bir sikke | 120/hamle | `Quad.easeOut` | her dönüşümde 4 altın kıvılcım | `sfx_coin`: sine 1320/1760 Hz 40 ms; her 3'te perde +1 yarım ton (en fazla +12) | hafif (her 3'te bir) | toplam sayı 300 ms'de sayılır |
| 57 | Kaybetme: "Hamleler bitti!" | tahta %20 kararır, yazı yukarıdan iner; Tuna üzgün değil "kararlı" | 400 | `Back.easeOut` | yok | `sfx_out_of_moves`: inen iki nota (sine 523→392 Hz, 2×150 ms), sert değil | orta | solma |
| 58 | Can kaybı | kalp gri olur (dolgu aşağıdan yukarı söner), kırılma yok; sayaç −1 | 400 | `Quad.easeIn` | yok | `sfx_life_lost`: yumuşak alçalan sine 330→220 Hz 300 ms | hafif | anında gri |
| 59 | Yıldız ana ekrana uçuşu | yıldız kazanma ekranından üst çubuktaki sayaca kavisle uçar, 2 tur döner, sayaç +1 zıplar | 700 | `Cubic.easeInOut` | 10 sarı iz kıvılcımı | `sfx_star`: çan sine 1568 Hz + 2093 Hz 200 ms | başarı | uçuş yerine sayaç zıplaması |

---

## 5. Güçlendiriciler

| # | Olay | Görsel | Süre ms | Easing | Parçacık | Ses | Haptik | Azaltılmış hareket |
| - | ---- | ------ | ------- | ------ | -------- | --- | ------ | ------------------ |
| 60 | Güçlendirici seçildi (yuva) | yuva 16 px yükselir, 1,0→1,1, açıklama şeridi kayarak gelir; tahtada geçerli hedefler 1,2 s'de bir parlar | 180 | `Back.easeOut` | yok | `sfx_select`: sine 700 Hz 50 ms | hafif | yükselme yok |
| 61 | Çekiç | çekiç ekranın sağından hedefe döner (−60° → +20°), vurur: hedef 1 kare beyaz, kırılır (blok: 4 parça; engel: kendi kırılma animasyonu) | 450 | savrulma `Back.easeIn`, vuruş `Expo.easeOut` | 18 parça + 8 toz | `sfx_hammer`: kalın vuruş (gürültü 30 ms + sine 120 Hz 150 ms) + kırılma | güçlü | çekiç solarak belirir, vuruş tek kare beyaz |
| 62 | Vinç (güçlendirici) | kanca yukarıdan iner (halat uzar), bloğu kavrar, havaya kaldırır (gölge büyür), hedefin üstüne taşır, istenirse 90° döndürür (dönme 200 ms), indirir; kural yok sayılır | 900 | iniş `Quad.easeOut`, taşıma `Sine.easeInOut` | inişte 6 toz | `sfx_crane`: motor vınlaması (testere dalga 90 Hz, tremolo 8 Hz, 700 ms) + kanca "klak" | orta (bırakışta) | kanca yok: blok 200 ms solup hedefte belirir |
| 63 | Boya Fırçası | fırça bloğun üstünde soldan sağa 2 vuruş yapar, renk `setCrop` silmesiyle değişir (maske yok), sembol çapraz solar | 500 | `Sine.easeInOut` | 12 boya damlası (yeni renk) | `sfx_brush`: iki "şşık" (yüksek bant gürültü 100 ms ×2) + sine 880 Hz | hafif | renk anında değişir |
| 64 | Geri Al | son hamle tersine oynatılır (blok geldiği yola 300 ms'de geri gider; kırılan engel geri birleşir), hamle sayacı +1 geri döner, saat yönünün tersine dönen ok şeridi | 400 | `Cubic.easeInOut` | 6 mavi kıvılcım | `sfx_undo`: ters çevrilmiş "pop" (sine 780→520 Hz 120 ms) + tik | hafif | geri gidiş yerine solma ve yeniden belirme |
| 65 | Termos (+3 hamle, başlangıç) | bölüm açılışında termos kapağı açılır, buhar çıkar, 3 "+1" çipi sayaca uçar | 600 | `Quad.easeInOut` | 6 buhar halkası | `sfx_thermos`: kapak "pop" + 3 artan nota | hafif | çipler yerine sayaç güncellemesi |
| 66 | Mala Başlangıcı | açılışta Altın Mala ikonu Usta Serisi çubuğuna iner ve dolu parlar | 500 | `Back.easeOut` | 12 altın kıvılcım | `sfx_combo` kısaltılmış (2 nota) | hafif | ikon anında |
| 67 | Açık Kepenk (ilk 5 hamle Kepenk W4 ve Kilitli W7 açık; K-40) | yalnız **Kepenk ve Kilitli geçitlerin** üstünde yeşil "açık" bayrağı ve 5 boncukluk sayaç (kayar kapı ve boya kapısında bayrak yok); her hamlede bir boncuk söner; 5. hamlede bayraklar iner ve geçitler kendi durumuna döner (kepenk kapanabilir, kilit geri gelir) | 400 (açılış/kapanış) | `Back.easeOut` | 4 kıvılcım her geçitte | `sfx_shutter` hızlandırılmış + `sfx_tick` | hafif | bayraklar anında |
| 68 | Galibiyet serisi bonusu (giriş) | bölüm açılışında seri rozeti (1/2/3) tahtanın ortasından büyür, bonus ikonları (Altın Mala, Termos) yerlerine uçar | 700 | `Back.easeOut` | 10 altın kıvılcım | `sfx_streak_bonus`: sine arpej (seri seviyesine göre 2–4 nota) | hafif | ikonlar anında |

---

## 6. Arayüz ve meta

| # | Olay | Görsel | Süre ms | Easing | Parçacık | Ses | Haptik | Azaltılmış hareket |
| - | ---- | ------ | ------- | ------ | -------- | --- | ------ | ------------------ |
| 69 | Düğme basma | basılınca 0,94 ölçek + dudak 12→4 px (düğme "iner"); bırakınca 1,04→1,0 | 60 / 120 | `Quad.easeOut` / `Back.easeOut` | yok | `sfx_button`: sine 600 Hz 30 ms + yumuşak tık | hafif | yalnız dudak değişimi |
| 70 | Pencere açılma | karartma %0→%55 (180 ms), panel 0,85→1,03→1,0 | 220 | `Back.easeOut` | yok | `sfx_popup`: sine 520→700 Hz 80 ms | yok | 150 ms solma |
| 71 | Pencere kapanma | panel 1,0→0,9 + solma | 160 | `Quad.easeIn` | yok | `sfx_close`: sine 600→450 Hz 60 ms | yok | 120 ms solma |
| 72 | Sekme değişimi (alt nav) | seçili ikon 24 px yükselir ve 1,15 ölçek; içerik yatay kayar (yönlü) | 250 | `Cubic.easeOut` | yok | `sfx_tab`: tık 20 ms | hafif | solma |
| 73 | Kilitli öğeye dokunma | asma kilit 3 kez sallanır (±8°), "Bölüm 15'te açılır" balonu 1,2 s | 300 | `Sine.easeInOut` | yok | `sfx_locked`: tahta tok "tık-tık" (triangle 200 Hz 2×40 ms) | hafif | sallanma yok, balon kalır |
| 74 | Ödül toplama (altın / güçlendirici) | sikkeler (en fazla 12 görsel) ödül noktasından üst çubuğa kavisle 40 ms arayla uçar; sayaç kademeli sayar | 900 | `Quad.easeInOut` | sikke izleri | `sfx_coin` art arda (perde hafif rastgele ±1 yarım ton) | hafif (ilk ve son sikkede) | tek sikke + sayaç |
| 75 | Görev tamamlama sahnesi (kasaba) **[MVP-lite: konfetisiz sade yükselme + tek satır balon]** | yıldız görev balonuna uçar, yapı parçası iskeleyle yükselir (aşağıdan yukarı katman katman), iskele söner, karakter tepkisi; "Albüme eklendi" yok (R-19) | ≤ 2000 | `Back.easeOut` (katmanlar) | 30 konfeti + 10 toz | `sfx_town_build`: inşaat tıkırtıları + "ta-da" | başarı | parça solarak belirir, 500 ms |
| 76 | Sallanan Köprü: tahta ilerleme | oyuncunun kaskı bir tahta ileri zıplar; köprü 2 s sallanır; diğer kasklar (botlar) arka planda zıplar | 600 | `Back.easeOut` | 4 kıvılcım | `sfx_bridge_step`: tahta gıcırtı (sine 180→240 Hz + gürültü) | hafif | zıplama yerine konum değişimi |
| 77 | Sallanan Köprü: düşme (elenme) | kask tahtadan kayar, suya düşer (sıçrama), simit belirir, kıyıya yüzer — şiddet yok, sevimli | 1600 | düşüş `Cubic.easeIn`, yüzme `Sine.easeInOut` | 12 su damlası | `sfx_splash`: gürültü "şlap" + kabarcıklar | orta | düşme yerine kask kıyıda belirir + simit |
| 78 | Usta Ligi: sıra değişimi | oyuncu satırı yeni sırasına kayar, diğerleri yer açar; terfi bölgesine girince yeşil parlama | 500 | `Cubic.easeInOut` | yok | `sfx_rank_up` (sine C5-E5-G5) / yok (düşüşte ses yok) | hafif (yükselişte) | anında sıralama |
| 79 | Açılış logosu inşası **[MVP-lite: blok düşüşü; karakter animasyonu Sonra]** | 8 blok 120 ms arayla yukarıdan düşer, inişte squash + toz; oyun adı yazısı (`app.title`) bloklar oturunca 0→1,1→1,0; Tuna kaskını düzeltir, Kepçe havlar | 1800 | düşüş `Cubic.easeIn`, iniş `Back.easeOut` | her iniş 4 toz | her blok `sfx_land` (perde artarak) + Kepçe `sfx_woof` — **süs**: ses kilidi açık değilse atılır (kuyruğa alınmaz) | yok | bloklar yerinde belirir, 400 ms |
| 80 | Ara sahne panel geçişi | yeni panel sağdan 60 px kayarak + 2° dönerek gelir, balon 0,8→1,0 | 280 | `Back.easeOut` | yok | `sfx_page`: kâğıt hışırtısı (gürültü 120 ms) | yok | 150 ms solma |
| 81 | Konuşma balonu metni (**"bla" sesleri [Sonra]**; MVP'de yalnız daktilo) | daktilo `text.typewriterCps` (40 karakter/s), her 3 karakterde konuşan karaktere özel "bla" sesi | metin uzunluğu | `Linear` | yok | `sfx_voice_<karakter>`: Tuna kare 600 Hz, Dede triangle 260 Hz, Gribeton testere 180 Hz, Kepçe kare 900 Hz (her biri 25 ms, perde ±2 yarım ton rastgele) | yok | metin anında |
| 82 | Tuna/Kepçe tepkileri (oyun ekranı) **[MVP-lite: yalnız ifade değişimi; dans ve göz kırpma Sonra]** | doğruda: Tuna eldiveni havaya kaldırır (300 ms), Kepçe kuyruk sallar; hatalıda: Tuna yüz buruşturur, Kepçe kulağını indirir; komboda: ikisi dans eder (1 s); boşta 6 s'de bir göz kırpma | 300–1000 | `Back.easeOut` | komboda 4 nota simgesi | yok (olay sesleri yeterli) | yok | yalnız ifade değişir, hareket yok |
| 83 | İnşa cephesi kaydı (K-34, R-01) | doğru yerleşimden sonra sütunun yeni "sıradaki kat" hücresinin konturu kesikten düze döner ve +%15 açılır (önceki cephe hücresi dolduğu için kaybolur) | 160 | `Quad.easeOut` | yok | yok | yok | anında |
| 84 | Eksik destek vurgusu (K-34 geri sekmesi, R-01) | geri sekme bitince bloğun altında kalan boş plan hücreleri sarı yatay taramayla (`color.ghost.support`) 3 kez yanıp söner; ilk kez olunca `tut.ctx.support` | 600 (`supportFlash`) | `Sine.easeInOut` | yok | `sfx_tick` ×2 (−14 dB) | yok | tarama 600 ms sabit görünür (yanıp sönme yok) |
| 85 | Sandık açılışı (bölüm / lig sandığı) | içerik ikonları baştan kapalı sandığın üstünde; "Aç" ile kapak kalkar (400 ms), ikonlar **gösterilen sırayla** 120 ms arayla üst çubuğa uçar. Dönen çark, slot, yavaşlayan kart, "neredeyse" efekti **yok** (E1) | 400 + 120/öğe | `Back.easeOut` | 8 altın kıvılcım | `sfx_chest`: tahta kapak "kırt" + `sfx_coin` | başarı | kapak solar, ikonlar sayaçlara solarak geçer |
| 86 | Günlük ödül toplama | bugünkü kutu ✓ ile döner, ödül ikonları üst çubuğa uçar (#74); reklamla ×2 seçildiyse ikinci dalga | 600 (`dailyClaim`) | `Back.easeOut` | 6 yıldız | `sfx_coin` | hafif | kutu anında ✓ |
| 87 | Kaldığın yerden devam (R-13) | açılışta tahta son durumuyla belirir (bloklar düşmez, 150 ms solma), Duraklat penceresi açık gelir, üstte 1,5 s "Kaldığın yerden devam" şeridi | 150 + 1500 | `Quad.easeOut` | yok | `sfx_popup` | yok | aynı |
| 88 | Geri sekme → kamyon kuyruğu (K-17 adım 3) | sahada yer bulamayan blok küçülerek "Kamyonda: N" çipine uçar, çip #20 gibi zıplar | 400 | `Quad.easeInOut` | yok | `sfx_queue` | yok | blok solar, çip sayısı değişir |

---

## 7. Müzik (sonra)

MVP'de müzik yok (brif §11.4). Yer tutucu: Ana ekranda düşük sesli prosedürel "kasaba döngüsü" (C majör, 96 BPM,
marimba benzeri sine + hafif ritim) Faz 5'te değerlendirilir. Oyun ekranında müzik, efektlerin 8 dB altında durur.
