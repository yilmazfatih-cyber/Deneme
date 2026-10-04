# product-lead kapanışları — Faz 1 revizyon turu (2026-10-04)

Güncellenen dosyalar: `docs/GDD.md`, `docs/OBSTACLES.md`, `docs/LEVELS.md`, `docs/META.md`, `config/economy.json`
(v2), `config/events.json` (v2). Bölüm 1 ve 4 değişti; 1–10 karalama betiğiyle (proje dışı) yeniden doğrulandı: hepsi
çözülür, minimum hamle ve YAO aynı (B1: 3 / %100, B4: 5 / %80).

Özet: **60 yorum → 56 KAPANDI · 2 RET · 2 AÇIK SORU** (+ 4 proje sahibi sorusu kararlardan, aşağıda).

## design-lead-2.md (19)

- design-lead-2.md#K-34 oyuncu bu kuralı nasıl anlar → KAPANDI (GDD K-34 "Görünürlük kancaları": `buildFront`, `verdict.reasons` sabit sıralı + `missingSupport`, `bounce` olayında neden, ilk karşılaşmada `tut.ctx.support`; LEVELS Bölüm 4'e yumuşak adım; doğal tetik noktaları B3/B4/B6 betikle doğrulandı. Durum: KABUL R-01, proje sahibi onayı bekliyor)
- design-lead-2.md#öğretici metinlerin sahipliği, anahtarları ve terimler → KAPANDI (R-08: LEVELS yalnız `tut.l{n}.{konu}`/`tut.ctx.*`; OBSTACLES metinleri `obs.{id}.desc` bilgi kartı; "blok" terimi; `{n}` yer tutucu W4/S5)
- design-lead-2.md#öğretici metinde renk adı → KAPANDI (LEVELS 2, 3, 7, 9 satırlarından renk adları çıktı; K-17/K-18/K-34 metinleri renk adsız; `tut.l2.shadow` STORY'deki haliyle kurala uygun)
- design-lead-2.md#saklı nesnelerin görünürlüğü → KAPANDI (GDD K-42: "örtülü ama konumu her zaman görünür"; W7, Y7, LEVELS §3 ve §5 kontrol listesi)
- design-lead-2.md#ara sahne tetikleyicisi → KAPANDI (META §1, R-09: prolog FTUE'de; `story.chN.start` = o hikaye bölümünün 1. görevi yapılınca — 1 için brif FTUE sırası, 2–5 için aynı kural (brif "ara sahneler görevlerle açılır", STORY §3 ile aynı); "sonraki dönüşte" önerisi yerine; bir eylem en çok 1 ara sahne, arka arkaya oynamaz)
- design-lead-2.md#kasaba görevleri sayı, ad, anahtarlar → KAPANDI (R-07 yönü tersine: STORY §5'in 35 görevi esas; META §1 ve economy.json STORY adları/sırası, maliyetler STORY'deki değerlerle kesinleşti; anahtarlar `town.ch{n}.t{m}.name/.scene`. STORY'yi META'ya göre yeniden yazmaya gerek yok)
- design-lead-2.md#hafif yerçekiminde yönlendirme girdisi → KAPANDI (GDD K-19 "G-L yönlendirme kuralı", R-10: tahtaya dokunma, dokunulan taraf = yön, 1 sütun, düşüş başına 1, aynı hamle, geçersizde hak harcanmaz, çıkıntı altına girilebilir, `steer {dir, atRow}`; OBSTACLES G-L; E-40)
- design-lead-2.md#K-07 0,3 hücre eşiği → KAPANDI (K-07 sayı içermez: `tokens.drag.startThresholdPx`/`holdMs`)
- design-lead-2.md#Bölüm 1 ilk hamle ergonomisi ve imza hareket → KAPANDI (a) ilk hedef `a` (4,7)'ye, duvarın yanına alındı, betikle doğrulandı) + AÇIK SORU (b) duvarı saha üst satırının üstüne çıkarmak brif sapması; LEVELS §4/7, önerim duvar 2 kalsın)
- design-lead-2.md#K-18 ayrıntıları → KAPANDI (çatlak simgesi ve fizik bilgisi bütün zorluklarda; `?` nötr ve ses yok; G-L gölgesi yönlendirme sonrası güncellenir)
- design-lead-2.md#ağır yerçekimi 1400 ms → KAPANDI (K-19 `holdMs` 700/1400, bot 700 ile ölçer; LEVELS §3 Bölüm 15'e `tut.l15.setting` adımı)
- design-lead-2.md#balon tavanı → KAPANDI (kural değişmedi; kiriş görseli design-lead'in; E-35 tavan üstünden bırakılınca iner)
- design-lead-2.md#kepenk sayacı → KAPANDI (W4: `k = period − ((m + phase) mod period)` + sonraki durum; S5 `carouselEvery − t`; örnek tasarımcının örneğiyle aynı)
- design-lead-2.md#K-06 panorama → KAPANDI (R-22: "oyun durumunu değiştirmez; dokunuş yalnız önizleme açar" + test cümlesi)
- design-lead-2.md#E-27 → KAPANDI (K-07 satır 5: bütün dilimler tamamken şantiyeye bırakma iptal, 0 hamle)
- design-lead-2.md#Altın Mala hedef seçimi → KAPANDI (`eligibleTrowelCells` = `buildFront`, K-34 kanca 1)
- design-lead-2.md#Vinç Alanı yükseklik sınırı → KAPANDI (K-05 `blockedByWallHeight` sunum olayı; Bölüm 6 ikinci adımı RET: 1. hikaye bölümünde boyu > 2 blok yok, ipucu ilk I3/L4 + yüksek duvar karşılaşmasında bağlamsal — LEVELS B6 notu)
- design-lead-2.md#düşüş hızları → KAPANDI (K-19'dan ms/satır sütunu çıktı; tek kaynak `tokens.physics`)
- design-lead-2.md#META ekranları ve ödüller → KAPANDI (doğrulandı, iki düzeltme: (1) uygulama kapanması kayıp değil → "Yarım kalan bölüm sayıldı, 1 can gitti" penceresi YOK, yerine kaldığı yerden devam (K-43); (2) `m = 0` çıkışında can da iade. Diğer maddeler doğru; D2 `B1` getirir kalıyor)

## code-lead-2.md (19)

- code-lead-2.md#duvar = sıfır genişlikli sınır → KAPANDI (R-03: GDD §0 "Duvar sınırı", K-04, K-05, K-07 satır 4, K-08, K-11, K-12 örneği, E-05/06/07/28; OBSTACLES W2/W3/W4/Y5/N6; kurallar eşdeğer)
- code-lead-2.md#teslimat kuyruğu sırası → KAPANDI (K-25: tek deneme noktası adım 9; `dropColumns` = öncelik listesi, son aşama kapanmaz; E-34)
- code-lead-2.md#Boya Kapısı via → KAPANDI (K-35 adım 1, W6: "girdiyse" tanımı, yarım girip çıkmak dahil; son girilen geçerli; E-39; S-21)
- code-lead-2.md#balon ile düşen blok aynı adım → KAPANDI (R-02: K-35 adım 6 düşme yarısı → yükselme yarısı; E-33; K-20, N33)
- code-lead-2.md#K-45/9 ↔ 4. bölüm → KAPANDI (R-21: Bölüm 4 geçidi boy 2 seçildi — istisnasız doğrulayıcı, W3 dersi B9'da kalır, B4 min/YAO aynı (betik); OBSTACLES "Veri imzası" tablosu, S7-R/S7-M ayrı; K-45/9 türetme metni)
- code-lead-2.md#K-07 tutma eşiği → KAPANDI (token tabanlı; testi token okur)
- code-lead-2.md#öğretici verisi ve i18n anahtarları → KAPANDI (şema KABUL, GDD §14; LEVELS 1–10 adımları `step · mode · highlight · hand · textKey · done` biçiminde; `piece:<i>` = tablo sırası; yeni vurgu `front` istendi)
- code-lead-2.md#K-43 uygulama kapanırsa kayıp → KAPANDI (R-13: K-43 madde 3 yeniden yazıldı; `inLevel` içeriği, açılışta bölüme dönüş, kayıp penceresi yeniden açılır; E-38)
- code-lead-2.md#balon tavanı 3 nokta → KAPANDI ((1) E-35 tavana iner, (2) balonda `d = |bırakma − tavan|`, W8, (3) E-36 teslimat balonu yükselmez, Y6'da sonraki adım 6)
- code-lead-2.md#K-19 düşüş süreleri → KAPANDI (ms sütunu çıktı; `steer.atRow` çekirdekte girdi, görsel eğriden bağımsız)
- code-lead-2.md#K-30 maliyeti ve güvence → KAPANDI (güvence 1 hamle → 20 ms 2 hamle → D3) / D2 `B1` değişikliği RET (boyayla rengi bozmak eksik hücre başına ≥ 1 hamle kaybettirir; istismar net negatif; gerekçe K-30'da)
- code-lead-2.md#K-39 Geri Al ve Kamyon Yardımı → KAPANDI (yardım hamleyle birlikte geri alınır; E-37)
- code-lead-2.md#LEVELS 1–10 → JSON eşlemesi → KAPANDI (seed `id×1000+id` K-45/1; `teaches` isteğe bağlı, engel dışı öğretim `tutorial`; golden el çözümleri LEVELS §0; parti kimlikleri `k<parti>_<i>`)
- code-lead-2.md#K-34 maliyeti → KAPANDI (değişiklik gerekmez; tek `isCorrectPlacement` + `buildFront`)
- code-lead-2.md#N-notları test kapsamı → KAPANDI (38 `[kural]`, 5 `[not]`: N9, N10, N12, N15, N36; N38 `[kural]` sayıldı — moloz görünürlüğü durum belirler)
- code-lead-2.md#bot belirlenimciliği → KAPANDI (`rng.hash: fmix32-chain-v1`; Lig `x^k` yerine 5 profilli tamsayı tablo `curveTable`; bot denemesi yalnız süre içinde; `groupId = hash(weekId, installId)`)
- code-lead-2.md#kayıt şeması → KAPANDI (bölüm başına `{won, attempts}` — attempts yalnız analytics; Köprü tur tavanı R-16 ile **4.050** (5.400 değil); reklam tavanları META §3.3)
- code-lead-2.md#config biçimi → KAPANDI (iki JSON v2: dizgeler/formüller `_doc`'a, `entrepreneur_tbd` kalmadı, tavanlar sayı)
- code-lead-2.md#Köprü ödeme zamanı ve Usta Modu sırası → KAPANDI (META §6.1 `T_öde` formülü; sıra 11…50 sonra 11, `order: sequential_loop`)

## entrepreneur-2.md (14)

- entrepreneur-2.md#Usta Modu → KAPANDI (META §8.5 "MVP (onay bekliyor)", R-17; (a) ödül/lig/kumbara/bot `d_k` özgün etiketle, (b) Usta Sandığı 250 + 1 Çekiç, (c) giriş kartı metni design-lead'e)
- entrepreneur-2.md#kumbara → KAPANDI (R-16 değerleri aynen: $1,99, kırma 1.000, tavan 2.000, 50/75/100; doğrulama kuralı; itiraz yok)
- entrepreneur-2.md#entrepreneur_tbd değerleri → KAPANDI (economy.json: reklam tavanları, paketler, başlangıç paketi, `priceDisplay`, `ads.dailyCapTotal`; altın miktarlarına itiraz yok, META §8.4 denge notu)
- entrepreneur-2.md#Köprü tur başına +5 harcama tavanı → KAPANDI (R-16 varsayılanı **4.050** yazıldı — 5.400 yerine; events.json `maxContinueCoinsPerRun: 4050`; reklam tavandan bağımsız)
- entrepreneur-2.md#Lig bot etiketi → KAPANDI (META §7.1 satırı, `botsLabeled: true` iki etkinlikte)
- entrepreneur-2.md#ödemeyen oyuncu ölçütü → KAPANDI (R-16: bakiye bandı + kurtarma karışımı META §9'da; "2 kez alamaz" üst sınırı kaldırıldı; ≥ 1 taban kaldı) + AÇIK SORU (Usta Modu'nda `min+2` bütçe yüzünden 10 galibiyet geliri ≈ 800–910, tabana yakın; Faz 3 < 900 ölçerse Usta Sandığı altını entrepreneur ile yükseltilsin mi?)
- entrepreneur-2.md#seri kayıp kaçınma → KAPANDI (META §5: teklif penceresinde seri yazılmaz; yumuşak sıfırlama A/B "Sonra")
- entrepreneur-2.md#ilk +5 ücretsiz → KAPANDI (MVP; teklif 1'e sayılır; K-29, economy `firstEverOfferFree`)
- entrepreneur-2.md#bölüm sandığı E1 ve Köprü payı → KAPANDI (§8.2 içerik açmadan önce görünür; §6.2 koruma eşitsizliği; §9'da P(bitirme) 0,08…0,25 aralığı)
- entrepreneur-2.md#kapsam etiketleri → KAPANDI (META'da MVP / MVP (onay bekliyor) / Sonra etiketleri)
- entrepreneur-2.md#K-43 kapanınca kayıp → KAPANDI (R-13; kayıp penceresi açılışta yeniden gelir → kaçış yok)
- entrepreneur-2.md#P-7 `m = 0` çıkış → KAPANDI (KABUL; seri bonusu tüketilmez, can iade; E-41)
- entrepreneur-2.md#kısa bölümler ve süre bandı → KAPANDI (LEVELS §0 süre bandı, `level_end.durationMs`; R-18 açık soru notu §4/1)
- entrepreneur-2.md#B planı ve bağımlı engeller → KAPANDI (LEVELS §3 "Engel bağımlılık dizini" — sütun yerine tek tablo, aynı bilgi; B planı etkisi: 31, 34, 37, 39, 40, 48, 49 + G-L yedeği 23/49)

## 1. tur dosyalarındaki product-lead satırları (8)

- design-lead.md#hafif yerçekiminde yönlendirme (çıkıntı altına girme kararı) → KAPANDI (izinli: K-19 madde 3, K-13)
- design-lead.md#ağır yerçekimi 700 ms ("indirilemez" alternatifi) → RET (R-11: kural 700 ms kalır, erişilebilirlik 1400 ms)
- design-lead.md#E10 / Bölüm 10 adı ortaklık vurgusu → KAPANDI (benim dosyamda değişiklik gerekmez: LEVELS B10 "Ağaç Ev Tamam!"; yol haritası adı BUSINESS'ta, öneriyi destekliyorum)
- code-lead.md#hafif yerçekiminde yönlendirme (şantiye yarısına dokun) → KAPANDI (R-10 ile "dokunulan taraf" kuralı)
- code-lead.md#ağır yerçekimi "Zaman baskısı yok" anahtarı → KAPANDI (R-11: anahtar var, etkisi 1400 ms; "indirilemez" davranışı RET olarak yukarıda sayıldı)
- code-lead.md#gerçek para karşılığı `refPrice` → KAPANDI (`priceDisplay.referenceSku` + paket fiyatları economy.json)
- entrepreneur.md#Mağaza paket miktarları → KAPANDI (tek kaynak economy.json `shop`)
- entrepreneur.md#solver çift iş / golden test → KAPANDI (LEVELS §0: el çözümleri golden; B1/B4 güncel çözümleri betikle doğrulandı)

## R-08 doğrulaması: STORY §6 satırları ↔ kurallar (STORY'yi düzenlemedim; design-lead'e)

- Önemli `tut.ctx.bounce` "Renk uymadı…" — sekme nedeni renk dışında da olur (K-34 destek, plan dışı, pencere, moloz). Öneri: nötr satır + nedene göre `tut.ctx.support`.
- Önemli `tut.l15.heavyfall` "Ağır yük!" — G-H yerçekimidir, Y5 ağır malzemeyle karışır. Öneri: "Ağır yerçekimi! Şantiyede çabuk düşer."
- Önemli `tut.l23.steer` "Hafif blok süzülür…" — blok özelliği değil yerçekimi; girdi tahtaya dokunma (R-10). Öneri: "Düşerken dokun; blok o yana kayar."
- Önemli `tut.l20.openshutter` "geçitler açık" — K-40: yalnız kepenk ve kilitli geçit açılır. Öneri: "kepenkler açık".
- Önemli `tut.ctx.goldtrowel` "boş bir plan hücresine" — yalnız K-34'ü sağlayan (`buildFront`) hücreler. Öneri: "parlayan hücreye dokun".
- Öneri `tut.l35.mortar` "nereye düşerse yapışır" → "yanlış yere düşerse yapışır" (doğruysa kilitlenir, plan dışıysa seker).
- Öneri `tut.l10.crane` "her şeyi taşır" — zincirli/ıslak blok seçilemez, I5/Q9 şantiyeye konamaz.
- Öneri `tut.l29.mirror` "Bu taraf…" — ayna başka dilimdir. Öneri: "Bu kule, öbür kulenin aynası."
- Öneri `tut.l5.segments` "Bu parça…" — R-08 terim kuralıyla çakışır ("parça" = blok sanılır). Öneri: "Bu kısım…".
- Sıra (UX §13.2): B3 ve B9 1. adımı geçitle başlıyor → K-34 reddeder (betikle doğrulandı); LEVELS adımları temelle başlar. B8 Çekiç adımı ve B10 Vinç adımı LEVELS'ta yumuşak.
- Eksik anahtarlar: `tut.ctx.support` (B4 adımı ve bağlamsal), `tut.l15.setting`; vurgu sözlüğüne `front`. UX §2.2 ilk görev adı STORY'deki "Ağaç basamakları" olmalı. STORY §3/§5'teki "maliyetler öneri" notu düşebilir (META aynı değerleri kesinleştirdi).
- Uyumlu bulunanlar: geri kalan 40+ satır (ör. `tut.l3.rail`, `tut.l9.narrow`, `tut.l13.shutter`, `tut.l21.glass`, `tut.l38.balloon`).

## Proje sahibine açık sorular

1. R-01 K-34 Alttan Üste kuralının onayı (görünürlük kancalarıyla).
2. R-17 Usta Modu MVP kapsamı.
3. R-18 hamle bütçeleri brif tahmininin altında (formül kalır; ölçüt süre bandı).
4. Bölüm 1–2'de duvarı yükseltip "yukarı" hareketini ilk hamlede hissettirmek (brif "Duvar 2"; önerim: değiştirmeyelim).
5. Bilgi: Bölüm 4 geçidi boy 2 (brif boy 1; R-21 seçimi). Bilgi: Usta Modu taban geliri (entrepreneur maddesi) Faz 3'te ölçülecek.

## Diğer ajanlara bağımlılıklar

- design-lead: STORY §6 düzeltmeleri ve `tut.ctx.support`, `tut.l15.setting`; UX §13.2 adım sırası (LEVELS'a göre); UX §2.2 ilk görev adı; K-34 görselleri; `front` vurgusu; kayıp/çıkış metinleri (K-43 devam).
- code-lead: `steer`, `via` (son girilen), yarım adım yerçekimi, `inLevel` devam, `verdict.reasons`, `buildFront`, `bounce` olayı, `curveTable`, `fmix32-chain-v1`, `config:validate` (kumbara değer kuralı, `_doc` alanları), `levels:validate` veri imzaları.
- entrepreneur: BUSINESS'a 4.050 (5.400 yerine) ve kumbara değerleri; Usta Sandığı taban sorusu.

## Öneriler (güncel durum)

- P-1 K-34 Alttan Üste — KABUL (R-01), onay bekliyor; **değişti:** görünürlük kancaları eklendi.
- P-2a Rüzgârda d = 0 kayma yok — aynen; **genişledi:** balonda `d = |bırakma − tavan|`.
- P-2b Harç yalnız plan alanında yapışır — aynen.
- P-3 Balon tavanı = plan tepesi — R-02 ile geçerli; **genişledi:** E-35, E-36.
- P-4 `build.elevator` ayrı alan — aynen. P-5 moloz `segment` — aynen.
- P-6 Boya kapısı "boyahane" (`via`) — R-02 ile geçerli; **değişti:** "girdiyse" ve son girilen kuralı.
- P-7 `m = 0` cezasız çıkış — KABUL (R-13); **değişti:** can iadesi, seri bonusu tüketilmez.
- P-8 Usta Modu — MVP (onay bekliyor); **değişti:** özgün etiketle ödül, Usta Sandığı, döngü sırası.
- **Yeni** P-9 Bölüm 4 geçit boy 2 (R-21). P-10 Yarım adım yerçekimi (R-02). P-11 G-L kuralı: çıkıntı altına girme serbest, geçersiz girdi hak yakmaz, `atRow` iniş satırı dahil. P-12 E-27 kapalı şantiye = iptal. P-13 Saklı nesne konumu görünür. P-14 Ara sahne = her hikaye bölümünde 1. görev. P-15 Bölüm 1 ilk hedef duvar yanında. P-16 Lig eğrisi tamsayı tablo. P-17 Ömürde ilk +5 ücretsiz (entrepreneur fikri).
- **Geri çekilen:** META'nın 36 görevlik listesi (STORY'nin 35'i esas); kumbara 20/30/40 · 1.500 · 3.000; "10 bölümde 2 kez +5 alamaz" üst sınırı; K-43 "kapanma = çıkış"; K-07 0,3 hücre eşiği; K-19 ms/satır değerleri.
