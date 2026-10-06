# product-lead kapanışları — Faz 1 revizyon turu (2026-10-04; tamamlama 2026-10-05)

Güncellenen dosyalar: `docs/GDD.md`, `docs/OBSTACLES.md`, `docs/LEVELS.md`, `docs/META.md`, `config/economy.json`
(v2), `config/events.json` (v2). 2026-10-04 turu API hatasıyla raporsuz kesildi; 2026-10-05'te her satır dosyaların
**güncel** metnine karşı yeniden denetlendi, eksikler tamamlandı.

**Tamamlama turunda (2026-10-05) yapılanlar:**
1. META §1 + `economy.json → town.cutscenes`: `story.chN.start` (N ≥ 2) = önceki bitişten sonra ana ekranın bir sonraki
   açılışı (STORY §3 ve UX §8 ile aynı; ch1 brif FTUE sırası); N'nin görev baloncuğu bu sahneye kadar gizli; örnek eklendi.
2. `events.json`: `maxContinueCoinsPerRun` → `bridgeSpendCapCoins` (BUSINESS §4.5 ile aynı anahtar); META §6.1 anahtarı yazar.
3. META §9: Usta Modu taban gelirinde açık soru yerine belirlenimci **ayar kuralı** (`250 + 50 · ceil((900 − G)/50)`); §8.5 atıf.
4. META §8.3/§9: kumbara hızı hesapla düzeltildi (eşik 17. galibiyet = Bölüm 36; 50 sonunda 1.850; tavan Usta Modu 3. galibiyet).
5. GDD K-35 çoklu engel örneği: düşen sıradan blok için eksik olan `gravity.yard = true` ve zincir listeye eklendi.
6. GDD K-19 G-L örneği: çıkıntının altındaki (7,2) `.` olarak tanımlandı (aksi K-34 ile çelişiyordu); oraya kayma `window` ile hatalı; çıkıntı altına doğru yerleşimin yalnız moloz/harç çıkıntıda mümkün olduğu yazıldı.
7. GDD K-19: G-H `holdMs` ile `tokens.drag.holdMs` (K-07) ad çakışması tek cümleyle ayrıldı.
8. GDD K-05 + LEVELS B6 notu: ilk `blockedByWallHeight` → bağlamsal `tut.ctx.tootall` (STORY §6 / UX §13.2'de var).
9. OBSTACLES bilgi kartları: `obs.w6.desc` "giren" (W6 "girdiyse" kuralı), `obs.s1.desc` ve `obs.s7m.desc` STORY'nin "kat" terimiyle.
10. LEVELS: blockout lejantı ve §0 "duvar sütunu" → "duvar sınırı … sıfır genişlik (R-03)" (11 yer); §4/7 ölçümle yeniden yazıldı
    (aşağıda design-lead-2#Bölüm 1).
11. 1–10 karalama betiğiyle yeniden doğrulandı (değişiklik bölüm verisine dokunmadı): hepsi çözülür, K-34 ihlali yok,
    min/YAO: 3/%100, 3/%100, 3/%67, 5/%80, 6/%100, 6/%100, 7/%100, 7/%100, 8/%88, 11/%89.

Özet: **61 yorum → 60 KAPANDI (3'ünde bir alt madde gerekçeyle RET) · 1 RET · 0 AÇIK SORU** (yorum düzeyinde).
Proje sahibine kararlardan gelen 3 soru (R-01, R-17, R-18) + 1 bilgi aşağıda.

## design-lead-2.md (19)

- design-lead-2.md#K-34 oyuncu bu kuralı nasıl anlar → KAPANDI (GDD K-34 "Görünürlük kancaları": `buildFront`, `verdict.reasons` sabit sıra + `missingSupport`, `bounce` olayı, ilk karşılaşmada `tut.ctx.support`; LEVELS B4 yumuşak adım 2; doğal tetik B3/B4/B6 betikle doğrulandı. Kural KABUL R-01, proje sahibi onayı bekliyor)
- design-lead-2.md#öğretici metinlerin sahipliği, anahtarları ve terimler → KAPANDI (R-08: LEVELS yalnız `tut.l{n}.{konu}`/`tut.ctx.*`, hepsi STORY §6'da var (anahtar karşılaştırması); OBSTACLES `obs.{id}.desc` bilgi kartı; "blok" terimi; `{n}` W4/S5; 2026-10-05: S1/S7m kartları "kat" terimine eşitlendi)
- design-lead-2.md#öğretici metinde renk adı → KAPANDI (LEVELS 2/3/7/9 renk adsız; K-18 "oyuncu metninde renk adı geçmez"; STORY `tut.l2.shadow` "Gölgede ✓ varsa yer doğru." kurala uygun)
- design-lead-2.md#saklı nesnelerin görünürlüğü → KAPANDI (GDD K-42 "örtülü ama konumu her zaman görünür"; W7, Y7, LEVELS §5)
- design-lead-2.md#ara sahne tetikleyicisi → KAPANDI (2026-10-05'te önerinize geçildi: ch1 = 1. görev sonrası (R-09 brif FTUE); chN (N ≥ 2) = `story.ch(N−1).end` sonrası ana ekranın bir sonraki açılışı, "açılış" tanımı + kasaba N−1'i gösterir, N baloncuğu gizli; bitiş = 7. görev; META §1 örnek, `economy.json` `chapter1Start`/`chapterStartFrom2`/`hideNextChapterTasksUntilStartPlayed`)
- design-lead-2.md#kasaba görevleri sayı, ad, anahtarlar → KAPANDI (R-07: STORY §5'in 35 görevi esas; META §1 ve `economy.json` ad/sıra/★ STORY ile birebir — 2026-10-05'te 35 satır karşılaştırıldı; anahtarlar `town.ch{n}.t{m}.name/.scene`)
- design-lead-2.md#hafif yerçekiminde yönlendirme girdisi → KAPANDI (GDD K-19 "G-L yönlendirme kuralı", R-10: tahtaya dokunma, dokunulan taraf = yön, 1 sütun, düşüş başına 1, aynı hamle, geçersizde hak harcanmaz, `steer {dir, atRow}`; OBSTACLES G-L; E-40; 2026-10-05: çıkıntı örneği K-34 ile tutarlı hale getirildi)
- design-lead-2.md#K-07 0,3 hücre eşiği → KAPANDI (K-07 sayı içermez: `tokens.drag.startThresholdPx`/`tokens.drag.holdMs`; test token okur)
- design-lead-2.md#Bölüm 1 ilk hamle ergonomisi ve imza hareket → KAPANDI (a): ilk hedef `a` (4,7), duvarın yanında, betikle doğrulandı · RET (b): betik ölçümü öncülü çürütüyor — Bölüm 1'in 2. hamlesi (`b`) Vinç Alanı'na 2 satır, 3. hamlesi 1 satır kaldırma gerektirir; Bölüm 2'nin ilk hamlesi 2 satır; "yukarı" ilk oturumun 2. hamlesinde hissedilir, brif "Duvar 2" korunur (LEVELS §4/7 ölçüm tablosu). Proje sahibi sorusu geri çekildi.
- design-lead-2.md#K-18 ayrıntıları → KAPANDI (çatlak simgesi ve fizik bilgisi bütün zorluklarda; `?` nötr, doğru/hatalı sesi yok; G-L gölgesi yönlendirme sonrası aynı karede güncellenir)
- design-lead-2.md#ağır yerçekimi 1400 ms → KAPANDI (K-19 `holdMs` 700/1400, bot 700 ile ölçer; LEVELS/UX Bölüm 15 `tut.l15.setting` adımı)
- design-lead-2.md#balon tavanı → KAPANDI (kural değişmedi; kiriş görseli design-lead'in; E-35 tavan üstünden bırakılan balon iner)
- design-lead-2.md#kepenk sayacı → KAPANDI (W4 `k = period − ((m + phase) mod period)` + sonraki durum; S5 `carouselEvery − t`)
- design-lead-2.md#K-06 panorama → KAPANDI (R-22: "oyun durumunu değiştirmez; dokunuş yalnız önizleme açar" + bit bit eşitlik testi)
- design-lead-2.md#E-27 → KAPANDI (K-07 satır 5: dilimler tamamken şantiyeye bırakma iptal, 0 hamle; E-27)
- design-lead-2.md#Altın Mala hedef seçimi → KAPANDI (`eligibleTrowelCells` = `buildFront`, K-34 kanca 1, K-33)
- design-lead-2.md#Vinç Alanı yükseklik sınırı → KAPANDI (K-05 `blockedByWallHeight` + 2026-10-05: ilk olayda bağlamsal `tut.ctx.tootall`; LEVELS B6 notu) · RET (Bölüm 6 ikinci adımı: 1. hikaye bölümünde boyu > 2 blok yok, ipucu I3/L4'ün yüksek duvarla ilk buluşmasında bağlamsal)
- design-lead-2.md#düşüş hızları → KAPANDI (K-19'dan ms/satır sütunu çıktı; tek kaynak `tokens.physics`; iniş/cam hızdan bağımsız)
- design-lead-2.md#META ekranları ve ödüller → KAPANDI (iki düzeltme: uygulama kapanması kayıp değil → "Yarım kalan bölüm sayıldı" penceresi yok, kaldığı yerden devam K-43; `m = 0` çıkışında can da iade. Diğer maddeler doğru; D2 `B1` getirir)

## code-lead-2.md (19)

- code-lead-2.md#duvar = sıfır genişlikli sınır → KAPANDI (R-03: GDD §0 "Duvar sınırı", K-04, K-05, K-07 satır 4, K-08, K-11, K-12 örneği, E-05/06/07/28; OBSTACLES W2/W3/W4/Y5/N6; 2026-10-05: LEVELS lejantı ve §0)
- code-lead-2.md#teslimat kuyruğu sırası → KAPANDI (K-25: tek deneme noktası adım 9; `dropColumns` = öncelik listesi, son aşama kapanmaz; E-34)
- code-lead-2.md#Boya Kapısı via → KAPANDI (K-35 adım 1, W6: "girdiyse" tanımı, yarım girip çıkmak dahil; son girilen geçerli; E-39; 2026-10-05 `obs.w6.desc` "giren")
- code-lead-2.md#balon ile düşen blok aynı adım → KAPANDI (R-02: K-35 adım 6 düşme yarısı → yükselme yarısı; E-33; K-20)
- code-lead-2.md#K-45/9 ↔ 4. bölüm → KAPANDI (R-21: Bölüm 4 geçidi boy 2 — istisnasız doğrulayıcı, W3 B9'da; B4 min 5/YAO %80 aynı (betik); OBSTACLES "Veri imzası", S7-R/S7-M ayrı)
- code-lead-2.md#K-07 tutma eşiği → KAPANDI (token tabanlı; testi token okur)
- code-lead-2.md#öğretici verisi ve i18n anahtarları → KAPANDI (şema KABUL, GDD §14; LEVELS 1–10 adımları `step · mode · highlight · hand · textKey · done`; `piece:<i>` = tablo sırası; `front` vurgusu UX'te var)
- code-lead-2.md#K-43 uygulama kapanırsa kayıp → KAPANDI (R-13: K-43 madde 3; `inLevel` içeriği; açılışta bölüme dönüş; kayıp penceresi aynı teklifle yeniden açılır; E-38)
- code-lead-2.md#balon tavanı 3 nokta → KAPANDI ((1) E-35 tavana iner, (2) balonda `d = |bırakma − tavan|` W8, (3) E-36 teslimat balonu yükselmez, Y6'da sonraki adım 6)
- code-lead-2.md#K-19 düşüş süreleri → KAPANDI (ms sütunu çıktı; `steer.atRow` çekirdekte girdi, görsel eğriden bağımsız)
- code-lead-2.md#K-30 maliyeti ve güvence → KAPANDI (güvence: 1 hamle → 20 ms 2 hamle → D3) · RET (D2 `B1` yerine döşeyen şekil: boyayla rengi bozmak eksik hücre başına ≥ 1 hamle kaybettirir, istismar net negatif; gerekçe K-30'da)
- code-lead-2.md#K-39 Geri Al ve Kamyon Yardımı → KAPANDI (yardım hamleyle birlikte geri alınır; E-37)
- code-lead-2.md#LEVELS 1–10 → JSON eşlemesi → KAPANDI (seed `id×1000+id` K-45/1; `teaches` isteğe bağlı, engel dışı öğretim `tutorial`; golden el çözümleri LEVELS §0; parti kimlikleri `k<parti>_<i>`)
- code-lead-2.md#K-34 maliyeti → KAPANDI (değişiklik gerekmez; tek `isCorrectPlacement` + `buildFront`)
- code-lead-2.md#N-notları test kapsamı → KAPANDI (OBSTACLES N1–N43: 38 `[kural]`, 5 `[not]` — N9, N10, N12, N15, N36; lejant §Notlar başında)
- code-lead-2.md#bot belirlenimciliği → KAPANDI (`rng.hash: fmix32-chain-v1`; Lig `curveTable` 5 profil tamsayı tablo; bot denemesi yalnız süre içinde; `groupId = hash(weekId, installId)`)
- code-lead-2.md#kayıt şeması → KAPANDI (bölüm başına `{won, attempts}`; Köprü tur tavanı R-16 ile **4.050**, anahtar 2026-10-05'te `bridgeSpendCapCoins` (BUSINESS ile aynı); reklam tavanları META §3.3 ve `economy.json`)
- code-lead-2.md#config biçimi → KAPANDI (iki JSON v2: formüller `_doc`'ta, `entrepreneur_tbd` yok, tavanlar sayı; prettier + parse geçti)
- code-lead-2.md#Köprü ödeme zamanı ve Usta Modu sırası → KAPANDI (META §6.1 `T_öde` formülü; sıra 11…50 sonra 11, `order: sequential_loop`)

## entrepreneur-2.md (14)

- entrepreneur-2.md#Usta Modu → KAPANDI (META §8.5 "MVP (onay bekliyor)", R-17; (a) özgün etiketle ödül/lig/kumbara/bot `d_k`, (b) Usta Sandığı 250 + 1 Çekiç, (c) giriş kartı metni design-lead'e)
- entrepreneur-2.md#kumbara → KAPANDI (R-16 değerleri: $1,99, kırma 1.000, tavan 2.000, 50/75/100; `config:validate` değer kuralı; 2026-10-05 hız hesabı: eşik 17. galibiyet / Bölüm 36)
- entrepreneur-2.md#entrepreneur_tbd değerleri → KAPANDI (`economy.json`: reklam tavanları, paketler, başlangıç paketi, `priceDisplay`, `ads.dailyCapTotal`; altın miktarlarına itiraz yok, META §8.4 denge notu)
- entrepreneur-2.md#Köprü tur başına +5 harcama tavanı → KAPANDI (R-16: **4.050**; `events.json → wobblyBridge.bridgeSpendCapCoins: 4050` — BUSINESS'taki anahtarla aynı; reklam tavandan bağımsız; K-29, META §6.1)
- entrepreneur-2.md#Lig bot etiketi → KAPANDI (META §7.1 satırı, `botsLabeled: true` iki etkinlikte, adlar STORY `npc.apprentice.*`)
- entrepreneur-2.md#ödemeyen oyuncu ölçütü → KAPANDI (R-16: bakiye bandı + kurtarma karışımı META §9; "2 kez alamaz" üst sınırı kaldırıldı, ≥ 1 taban kaldı; 2026-10-05: Usta Modu tabanı için açık soru yerine ayar kuralı — Faz 3 medyan G < 900 ise Usta Sandığı = `250 + 50 · ceil((900 − G)/50)`, iki ajan aynı değeri yazar)
- entrepreneur-2.md#seri kayıp kaçınma → KAPANDI (META §5: teklif penceresinde seri yazılmaz; yumuşak sıfırlama A/B "Sonra")
- entrepreneur-2.md#ilk +5 ücretsiz → KAPANDI (MVP; teklif 1'e sayılır; GDD K-29, `economy.json → outOfMoves.firstEverOfferFree`)
- entrepreneur-2.md#bölüm sandığı E1 ve Köprü payı → KAPANDI (META §8.2 içerik açılmadan görünür; §6.2 koruma eşitsizliği 650 < 900; §9 P(bitirme) 0,08…0,25)
- entrepreneur-2.md#kapsam etiketleri → KAPANDI (META'da MVP / MVP (onay bekliyor) / Sonra)
- entrepreneur-2.md#K-43 kapanınca kayıp → KAPANDI (R-13; kayıp penceresi açılışta aynı teklifle gelir → kaçış yok)
- entrepreneur-2.md#P-7 `m = 0` çıkış → KAPANDI (KABUL; can ve oyun öncesi güçlendirici iade, seri bonusu tüketilmez; E-41)
- entrepreneur-2.md#kısa bölümler ve süre bandı → KAPANDI (LEVELS §0 süre bandı, `level_end.durationMs`; LEVELS §4/1 R-18 proje sahibi sorusu)
- entrepreneur-2.md#B planı ve bağımlı engeller → KAPANDI (LEVELS §3 "Engel bağımlılık dizini"; B planı etkisi 31, 34, 37, 39, 40, 48, 49 + G-L yedeği 23/49)

## 1. tur dosyalarında product-lead'i karar sahibi olarak anan satırlar (9)

- design-lead.md#hafif yerçekiminde yönlendirme (çıkıntı altına girme kararı) → KAPANDI (izinli: K-19 madde 3, K-13; örnek K-34 ile tutarlı)
- design-lead.md#ağır yerçekimi 700 ms ("indirilemez" alternatifi) → RET (R-11: kural 700 ms kalır, erişilebilirlik 1400 ms; "indirilemez" G-H'nin zaman baskısı dersini siler)
- design-lead.md#E10 / Bölüm 10 adı ortaklık vurgusu → KAPANDI (değişiklik gerekmez: LEVELS B10 "Ağaç Ev Tamam!"; yol haritası adı BUSINESS'ta, öneriyi destekliyorum)
- code-lead.md#tokens.json biçimi (`rules.heavyGravityHoldMs` oyun kuralıdır) → KAPANDI (değer GDD K-19'da; tokens'ta yalnız `drag.holdMs` 100 kaldı; 2026-10-05: K-19'a iki `holdMs`'i ayıran cümle)
- code-lead.md#hafif yerçekiminde yönlendirme (şantiye yarısına dokun) → KAPANDI (R-10: "dokunulan taraf" kuralı, K-19)
- code-lead.md#ağır yerçekimi "Zaman baskısı yok" anahtarı → KAPANDI (R-11: anahtar var, etkisi 1400 ms; "indirilemez" davranışı yukarıdaki RET)
- code-lead.md#gerçek para karşılığı `refPrice` → KAPANDI (`priceDisplay.referenceSku` + paket fiyatları `economy.json`)
- entrepreneur.md#Mağaza paket miktarları → KAPANDI (tek kaynak `economy.json → shop`, META §8.4)
- entrepreneur.md#solver çift iş / golden test → KAPANDI (LEVELS §0: el çözümleri golden; 1–10 betikle yeniden doğrulandı)

## R-08 doğrulaması: STORY §6 satırları ↔ kurallar (STORY'yi düzenlemedim)

2026-10-05 denetimi: önceki turdaki 9 bulgunun **hepsi** STORY §6'ya işlenmiş (`tut.ctx.bounce.color/.window/.offplan` +
`tut.ctx.support`, `tut.l15.heavyfall`, `tut.l23.steer`, `tut.l20.openshutter` "kepenkler ve kilitler", `tut.ctx.goldtrowel`
"parlayan hücre", `tut.l35.mortar` "yanlış yere", `tut.l10.crane`, `tut.l29.mirror`, `tut.l5.segments` "kat"). UX §13.2 adım
sırası LEVELS'la aynı (B3/B9 önce temel, B8 Çekiç ve B10 Vinç yumuşak, B4 `front`); UX §2.2 ilk görev "Ağaç basamakları".
Yeni satırlar (`tut.ctx.tootall`, `.lastmoves`, `.queue`, `.reshuffle`, `.truckhelp.*`, `.blocked`, `.resume`, `tut.l12.*`,
`tut.l13.undo`, `tut.l27.repeat`, `tut.meta.*`) kurala uygun. Kalan küçük notlar (design-lead'e, Öneri):
- `tut.l26.key` "Bul" — anahtarın yeri her zaman görünür (K-42); `obs.w7.desc` gibi "Anahtarın üstündeki bloğu kaldır" daha doğru.
- UX bağlamsal tabloda `debris` geri sekme nedeni (GDD K-34 kanca 2) için satır yok; `tut.l17.debris` yeniden kullanılabilir.
- STORY §3 tablosunun "Başlangıç sahnesi tetikleyicisi" sütunu 2–5 için "Bölüm N görev 1" diyor; altındaki metin, UX §8 ve
  META §1 "önceki bitişten sonra ana ekranın bir sonraki açılışı" diyor — sütun metne eşitlenmeli.

## Kararlar (R-xx) uygulaması

- [x] R-01 K-34 KABUL + görünürlük kancaları (GDD K-34, K-18, K-33; LEVELS §0, B3/B4/B6) — proje sahibi onayı bekliyor
- [x] R-02 GDD geçerli; yarım adım yerçekimi (K-35 adım 6, K-20, E-33), `via`, FIFO teslimat (K-25/26), Kamyon Yardımı (K-30, K-39)
- [x] R-03 sıfır genişlikli sınır ifadesi (GDD §0, K-04/05/07/12, E-05/06/07/28; OBSTACLES; LEVELS lejant + §0)
- [—] R-04 benim dosyalarımda px yok (K-07 token'a bağlı) · [—] R-05 renk adı/hex yok; K-18 "oyuncu metninde renk adı yok"
- [—] R-06 kapsam dışı (ölçekleme)
- [x] R-07 STORY'nin 35 görevi META §1 + `economy.json` (ad, sıra, ★ birebir; toplam 10/hikaye bölümü)
- [x] R-08 LEVELS `tut.l{n}.*`/`tut.ctx.*`, OBSTACLES `obs.{id}.desc`, "blok" terimi, renk adı yok; STORY §6 doğrulandı (yukarıda)
- [x] R-09 ch1 brif FTUE sırası; chN (N ≥ 2) STORY §3/UX §8 ile aynı (META §1, `economy.json`)
- [x] R-10 G-L kuralı GDD K-19 (1 sütun, aynı hamle, düşüş başına 1, `steer`)
- [x] R-11 `holdMs` 700/1400 (K-19, OBSTACLES G-H); bot 700
- [x] R-12 G-L penceresinde yeni blok tutmak pencereyi kapatır (K-19 madde 1, E-40)
- [x] R-13 K-43 kaldığı yerden devam, `m = 0` cezasız çıkış (META §2, §5, §6.1; `events.json appKillEliminates: false`)
- [x] R-14 etiketli çırak botlar, saflık ve iki-kayıt eşitlik testi (META §6.1, §6.2, §7.1; `botsLabeled`)
- [x] R-15 3 teklif sınırı reklam dahil, ilk teklif ücretsiz, sunum ilkeleri (K-29, META §3.2, §5, §6.1)
- [x] R-16 Köprü tavanı 4.050 (`bridgeSpendCapCoins`, BUSINESS ile aynı anahtar), kumbara 1,99/1.000/2.000/50-75-100, +5 900/1.350/1.800, Usta Sandığı 250 (+ Faz 3 ayar kuralı), ölçütler META §9
- [x] R-17 Usta Modu "MVP (onay bekliyor)" (META §8.5, `masterMode.status`)
- [x] R-18 formül kalır, LEVELS §4/1'de proje sahibi sorusu, ölçüt süre bandı (§0)
- [—] R-19 Albüm benim dosyalarımda yok · [—] R-20 debug paneli kapsam dışı
- [x] R-21 Bölüm 4 geçit boy 2 + OBSTACLES veri imzası; K-45/9 istisnasız
- [x] R-22 K-06 "oyun durumunu değiştirmez" + test cümlesi
- [—] R-23 kapsam dışı · [—] R-24 benim dosyalarımda EN ad/firma adı yok

## Proje sahibine sorular

1. R-01: K-34 Alttan Üste kuralı onayı (görünürlük kancaları ve Bölüm 4 öğretici adımıyla).
2. R-17: Usta Modu MVP kapsamında mı?
3. R-18: Hamle bütçeleri brif tahmininin %25–40 altında (formül solver min + tampon kalır; ölçüt bölüm süresi bandı).
4. Bilgi (karar gerekmez): Bölüm 4 geçidi boy 2 (brif boy 1; R-21 seçimi). Önceki "Bölüm 1–2 duvarını yükseltelim mi" sorusu
   ölçümle geri çekildi (yukarı hareket Bölüm 1'in 2. hamlesinde var).

## Diğer ajanlara bağımlılıklar

- design-lead: STORY §3 tablo sütunu (chN başlangıcı) metne/META'ya eşitlensin; `tut.l26.key` ifadesi; UX `debris` geri sekme
  satırı; UX §8'e "bitiş sahnesinin kapanması dönüş sayılmaz, N baloncuğu sahneye kadar gizli" ayrıntısı.
- code-lead: TECH §… (satır ≈ 1496) `wobblyBridge.maxContinueCoinsPerRun` → `bridgeSpendCapCoins`; `config:validate` şemasına
  `town.cutscenes` yeni alanları (`chapter1Start`, `chapterStartFrom2`, `hideNextChapterTasksUntilStartPlayed`,
  `skippedCountsAsSeen`); ilk `blockedByWallHeight` → `tut.ctx.tootall`; önceki listeden: `steer`, `via`, yarım adım
  yerçekimi, `inLevel`, `verdict.reasons`, `buildFront`, `bounce`, `curveTable`, `fmix32-chain-v1`, `levels:validate` veri imzaları.
- entrepreneur: BUSINESS §9.2'ye Usta Sandığı ayar kuralı (aynı formül); 4.050 ve anahtar adı zaten aynı.

## Öneriler (güncel durum; Faz 1 ilk rapora göre)

- P-1 K-34 Alttan Üste — KABUL (R-01), onay bekliyor; **değişti:** görünürlük kancaları.
- P-2a Rüzgârda d = 0 kayma yok — **değişti (genişledi):** balonda `d = |bırakma − tavan|`.
- P-2b Harç yalnız plan alanında yapışır — aynen.
- P-3 Balon tavanı = plan tepesi — R-02 ile geçerli; **değişti (genişledi):** E-35, E-36.
- P-4 `build.elevator` ayrı alan — aynen. P-5 moloz `segment` — aynen.
- P-6 Boya kapısı `via` — R-02 ile geçerli; **değişti:** "girdiyse" ve son girilen kuralı.
- P-7 `m = 0` cezasız çıkış — KABUL (R-13); **değişti:** can iadesi, seri bonusu tüketilmez.
- P-8 Usta Modu — MVP (onay bekliyor); **değişti:** özgün etiketle ödül, Usta Sandığı, döngü sırası, Faz 3 ayar kuralı.
- **Yeni:** P-9 Bölüm 4 geçit boy 2 (R-21). P-10 Yarım adım yerçekimi (R-02). P-11 G-L ayrıntıları (çıkıntı altı serbest,
  geçersiz girdi hak yakmaz, `atRow` iniş satırı dahil). P-12 E-27 kapalı şantiye = iptal. P-13 Saklı nesne konumu görünür.
  P-14 Ara sahne tetikleyicileri (ch1 brif FTUE; chN ≥ 2 ana ekranın sonraki açılışı — 2026-10-05'te design-lead kuralına
  çevrildi). P-15 Bölüm 1 ilk hedef duvar yanında. P-16 Lig eğrisi tamsayı tablo. P-17 Ömürde ilk +5 ücretsiz.
  P-18 Usta Sandığı Faz 3 ayar kuralı (2026-10-05).
- **Geri çekilen:** META'nın 36 görevlik listesi; kumbara 20/30/40 · 1.500 · 3.000; "10 bölümde 2 kez +5 alamaz" üst sınırı;
  K-43 "kapanma = çıkış"; K-07 0,3 hücre eşiği; K-19 ms/satır değerleri; ara sahnede "her hikaye bölümünde 1. görev" (P-14'ün
  ilk hali); Bölüm 1–2 duvar yükseltme sorusu.

## Tutarlılık denetimi (tur 1)

Tarih: 2026-10-05. Kaynak: bağımsız denetim + şüpheci onayı (27 bulgu). Dokunulan dosyalar: `docs/GDD.md`,
`docs/LEVELS.md`, `docs/OBSTACLES.md`, `docs/META.md`, `config/economy.json`, `config/events.json` (iki JSON prettier ile
biçimlendi ve ayrıştırıldı; economy.json'da içerik değişikliği yalnız 2 alan + 1 `_doc`, satır sayısındaki fark biçimdir).
Bölüm 1–6 bir karalama betiğiyle (scratchpad; proje kodu değil) LEVELS.md'den doğrudan okunup yeniden doğrulandı.

- #0 Bölüm 4 adım 2 `tut.ctx.support` anahtarı (Engel) → KAPANDI (yol b: GDD §14 + yeni §14.1 madde 1–2 — `textKey` = `tut.l<bölüm>.<konu>` ya da bağlamsal satırı yeniden kullanmak için `tut.ctx.<konu>`; yeni anahtar ailesi yok, R-08'in tek kümesi korunur; LEVELS §0 ve §5 GDD ile eşitlendi; code-lead regex'i ve "bölüm verisinde değil" cümlesini günceller)
- #1 D2 yardım `B1`'lerinin zamanı ve `x`'i → KAPANDI (GDD K-30: adım 12'de kuyruğun sonuna eklenip aynı adımda bir kez denenir — K-25 "tek deneme noktası"na yazılı tek istisna; `x = 5`, `dropColumns` yok, sırayla tek tek; sığmayan kuyrukta kalır; güvence denetimi teslimattan sonra, kuyruktaki `B1` 2 hamle simülasyonunda 9. adımda teslim; D1 → D2 → D3 sırası; K-25, K-35 adım 12, E-23 güncellendi)
- #2 +5 kabulünden sonra kilitlenme denetimi yok → KAPANDI (GDD K-29: kabulden sonra adım 12 bir kez çalışır; K-35 adım 12 satırı; yeni E-42)
- #3 K-23 dilim tamamlanan hamlede `t` → KAPANDI (GDD K-23: o hamlenin adım 10'unda `t` artmaz, örnekle uyumlu ve adım adım yazıldı; Mala/güçlendiriciyle tamamlanmada da artmaz; K-35 adım 10, S-15, E-09, OBSTACLES S5)
- #4 Asansör/kayar kapı sınırda dışarı bakan `dir` → KAPANDI (yol a: GDD K-24 ve OBSTACLES W5/S6 algoritması "önce `e + dir` aralık dışındaysa yön döner, sonra 1 adım"; doğrulayıcı kuralı gerekmez; örnekler `start 2, dir +1` → 1, 0, 1, 2 ve `y 3, dir 1` → 2, 1, 2, 3; test adı önerisi)
- #5 `.` hücresindeki yanlış nesne ve K-34 → KAPANDI (GDD K-34: `.` yalnızca boşken dolu sayılır; içinde moloz/yapışmış harç varsa üstündeki yerleşim `support` hatası, o sütunda `buildFront` yok; kanca 1–2 `missingSupport` tanımı; yeni E-43, E-24 güncellendi; OBSTACLES Y8, S4; code-lead `dotMask & ~wrongOcc`)
- #6 D2 sayımında moloz → KAPANDI (GDD K-30 D2 ve K-27: moloz bayraklı bloklar hiçbir terimde sayılmaz, boya kapısından geçen moloz dahil; ayrıca şantiyede yapışmış harçlı blok arz sayıldı (yanlış pozitif yardımı önler); yeni E-44; OBSTACLES S4)
- #7 K-31 renk sayımı kapsamı → KAPANDI (GDD K-31 "renk kümesi" = plan (çözülmüş `?` dahil) ∪ bütün bloklar (parti 0, kamyon partileri, moloz) ∪ Boya Kapısı `color`; Bölüm 5 ve 22 örnekleri; LEVELS §0 aynı cümle)
- #8 Güncelleme sonrası sürüm uyuşmazlığı → KAPANDI (GDD K-43 madde 4: deneme cezasız kapanır ve oynanmamış sayılır; can, oyun öncesi ve bölüm içi güçlendiriciler, tekliflere ödenen altının tamamı iade; seri bonusu tüketilmez; reklam sayaçları ve ömür ilk hediyesi geri verilmez; Köprü'de elenme/tahta yok, iade altın tur harcamasından düşülür; Lig puanı yok; `inLevel`'e `levelHash`, `rulesVersion`, `offerSpendCoins`; yeni E-45)
- #10 Yapışmış cam+harç kırılma maliyeti → KAPANDI (GDD K-07: maliyetler toplanır, taban 1 / yapışmış harçta 2 + cam 1 → 3; K-35 adım 4; OBSTACLES S3, Y8; test "K-07 stuck glass mortar break cost")
- #11 Duvarın iki yanında komşuluk → KAPANDI (GDD §0: x=5 ile x=6 hiçbir zaman komşu değil (R-03 eşdeğerliği); K-35 adım 5; yeni E-46; OBSTACLES S4)
- #12 Zorunlu öğretici adımları kilitliyor (Engel) → KAPANDI (B1 adım 2 Y + `piece:0`; GDD §14.1 madde 3 `overWall`/`gapPass`/`holdOverBuild` = sürükleme sinyali, sayım adım başladıktan sonra; B4 yeni düzende adım 2 ×2, adım 3 `piece:2` — her 2 doğru yerleşimden sonra `p` rayı geçerli ve K-34'e uygun (betik); §14.1 madde 4: Z adımı veri kuralı + çalışma anı güvencesi (olay üretilemiyorsa adım atlanır); LEVELS §5 maddesi; B3/B6/B7/B9 Z adımları betikle denetlendi)
- #13 Bölüm 3, 5, 6'da ✓ sonrası çıkmaz → KAPANDI (veri yolu seçildi, D3 MVP'de isteğe bağlı kalır: B3 üst satır `GG` + `b` G; B5 #34'teki değişiklik; B6 `E`/`F` renkleri ve y4–y6 plan satırları yer değiştirdi; B2 ve B4 de (#32, #33) — betik: 1–6'da Mala'sız, kazısız erişilebilen çıkmaz yok; LEVELS §5 "✓ sonrası çözüm" maddesi, §4 madde 8; GDD K-30'a D3'ün isteğe bağlı kalma koşulu yazıldı)
- #14 Bölüm 2 adım 2 "!" gösteremiyor → KAPANDI (adım 2 `piece:2` (`c`) hold, gölge `color`+`support` → "!"; yeni adım 3 `piece:1` (`b`) ✓, `tut.l1.match` yeniden kullanıldı; tasarım niyeti netleşti; betikle doğrulandı)
- #15 `tut.ctx.support` ne zaman çıkar → KAPANDI (GDD K-34 kanca 4 + §14.1 madde 2: Bölüm 4 adım 2 gösterilince `seenContextTips.support` işaretlenir — UX §5.5 ile aynı, design-lead'e değişiklik gerekmez; LEVELS §0 tetik listesi (yalnız Bölüm 3 doğal noktası) ve B6 notu "burada çıkmaz" olarak düzeltildi)
- #16 Reklam seçeneği yalnız 1. teklifte → KAPANDI (GDD K-29 kural + örnek gerekçesi; Köprü satırı "tavan doluysa 2. ve 3. teklifte yalnız ret"; META §3.2, §3.3, §6.1; `economy.json → outOfMoves.rewardedAdOffer.offerIndex: 1` (BUSINESS §4.3 tablosuyla aynı alan) ve `_doc`)
- #17 Bölüm 35 Zor ama niyet gölge "doğru"ya dayanıyor → KAPANDI (LEVELS §3 #35 niyeti: plan rengi + inşa cephesiyle (her zorlukta görünür) doğrulayıp gölge konumunda bırakmak; K-18 ve etiket değişmedi)
- #18 Bölüm 7 kazı adımı yanlış konumla bitiyor → KAPANDI (GDD §14.1 `done.at`; B7 adım 1 `{ event: yardMove, count: 1, at: [0, 6] }`; `b` → (1,6) sonrası `f`'in tutulamadığı betikle doğrulandı; code-lead şemaya `at` ekler)
- #19 G-L gölge geçişi "aynı karede" → KAPANDI (GDD K-18: "yönlendirme anında yeni inişi gösterir; geçiş animasyonu design-lead'in, JUICE #46 / UX §5.4")
- #20 N8 animasyon sırası → KAPANDI (OBSTACLES N8: sıra yalnız olay sırası; animasyonlar JUICE §0 kural 10'a göre eşzamanlı; test yalnız olay sırasını denetler)
- #22 Açılmadan gelen güçlendirici → KAPANDI (META §4 kuralı: envantere eklenir, yuva açılışa kadar kilitli, adet görünür, açılışta ücretsiz denemeler eklenir; sandık 10 içeriği korundu; test adı; `economy.json → boosters._doc`; UX kilitli yuvada adet rozeti design-lead'e)
- #23 LiveOps parametreleri events.json/META'da yok → KAPANDI (`events.json`: `wobblyBridge.maxBridgesPerDay: null`, `wobblyBridge.finisherExtras: null`, `masterLeague.pointsMultiplier: 1`, `masterLeague.weekendMultiplier: null` (`factor`, `addPoints`, `difficulties`, `appliesTo: "playerAndBots"` tek değer), `liveOps { startUtc, endUtc, overrides }`; META §6.1, §7.1 satırları; META §7.3 madde 4 bot formülü `κ = M · κ_w`, aralık başına artış çarpımı, Hafta 3 ve 6 örnekleri; test "META 7.3 league multiplier equal for player and bots")
- #24 META §6.1 sunum dili → KAPANDI (META §6.1: "altın seçeneği etkin değildir (sunum UX §7: gri düğme + `lose.bridgeCap`); reklam tavandan bağımsız (yalnız 1. teklif)"; "Bırak" ifadesi kaldırıldı)
- #25 META §9 türetilmiş sayılar → KAPANDI (taban 35,2 (1–50) / 37 (Usta Modu); galibiyet 500; toplam ≈ 1.030–1.140; Usta Modu ≈ 840–950 (tabanın iki yanında, ayar kuralı metni korundu); sandık ≈ 3,2; günlük ≈ 0,9; kumbara ≈ 60/galibiyet ≈ 600/10 bölüm)
- #26 Termos (12) ve Mala Başlangıcı (16) açılışları → KAPANDI (LEVELS §3 satır 12 ve 16; "11–50 öğretici notları"na `tut.l12.thermos`, `tut.l16.trowel` ve diğer açılış adımları (13, 20, 22); anahtarlar STORY §6'da mevcut)
- #27 `tutorial[]` sözleşmesi ↔ LEVELS → KAPANDI ((a) #0 ile; (b) `done.minMs`, B2 `{ event: holdOverBuild, count: 1, minMs: 500 }`; (c) LEVELS 1–10 bütün dilim adlarına EN karşılığı (Steps, Platform, Front Wall, Front Facade, Left/Right Room, Tall Trunk, Beam/Eaves, Fence 1/2, Rope/Rungs, Trunk/Window Floor/Roof); ek: `segmentDone`, `deliveryDone` (B5) GDD sözlüğüne girdi)
- #32 Bölüm 2 `d` çıkmazı → KAPANDI (`d` `B1_0` Y → G; betik: min 3, YAO %100, çıkmaz yok)
- #33 Bölüm 4 iki `B1_0` W çıkmazı → KAPANDI (`b`, `c`, `f` → tek `C3_0` W (2,6), (3,7) boş; doluluk 47/48; min 4, YAO %75, bütçe 12 (§1 tablosu); öğretici adım 2 ×2, adım 3 `piece:2`; blockout, çözüm, §4 madde 2 ve 7 (kaldırma ölçümü `a` 1 · `b` 2 · `d` 0) güncellendi; betik: çıkmaz yok)
- #34 Bölüm 5 çıkmazları → KAPANDI (`d` → `D2_90` R, `g` → `O4_0` R, parti 1 `B1_0` R → W; renkler G/R/W; betik: min 6, YAO %100, Mala'sız ve kazısız çıkmaz yok)
- #36 K-03 örneği satır sırası → KAPANDI (`["WW","WW","YY"]` → (6,0),(7,0)=Y; Bölüm 1 planı ve K-15 ile aynı)
- #37 Bölüm 2 dilimi 2×5 → KAPANDI (LEVELS §4 madde 9: O4 temel (2 satır) + C3 çifti çapraz şerit (3 satır) = 5; dilim satırında atıf)
- Ek bulgu (denetim dışı, kendi betiğim) Bölüm 9'da ✓ sonrası çıkmaz adayları → AÇIK (Faz 2) (kazısız aramada 15 durum, 3 kazıya kadar 7'si kurtarılamadı; kazılı tam arama karalama betiğinin sınırını aşıyor; B9 notu yazıldı; Faz 2 `levels:solve` ile kesinleşince parti 1 sırası/şaşırtma renkleri düzeltilir. Bölüm 7, 8, 10 aynı denetimi Faz 2'de alır)

Özet: **31 bulgu → 31 KAPANDI · 0 RET · 0 AÇIK SORU**; 1 ek bulgu AÇIK (Faz 2, product-lead).

**Diğer ajanlara bağımlılıklar (bu tur):**
- code-lead (TECH): §8.2 `textKey` regex'i `tut.ctx.*`'ı da kabul etsin, "bağlamsal öğreticiler bölüm verisinde değil"
  cümlesi §14.1 madde 2'ye göre; `done` enum'una `holdOverBuild`, `segmentDone`, `deliveryDone`; `done.minMs`, `done.at`;
  öğretici adımı gösterilince `seenContextTips` işareti; Z adımı çalışma anı güvencesi (§14.1 madde 4b). §9.7 D2:
  adım 12 teslimatı, `x = 5`, D1 → D2 → D3 sırası, moloz hariç / yapışmış harç dahil arz, D3 aday kümesi. §6.1
  `addMoves` (teklif kaynakları) → adım 12. §6.2 adım 4 (maliyet toplama, `moveCost` birleşimi §7.1), adım 5 (komşuluk
  sınırı aşmaz), adım 10 (S5 artmama). K-24/W5 ping-pong algoritması. §5.2 `dotMask & ~wrongOcc`. §11.1 geçersiz deneme
  iadeleri ve `inLevel` alanları. L-06/L-07'ye boya kapısı rengi. Satır ≈ 1753 "reklam yalnız 1. teklif". `config:validate`
  şemasına `rewardedAdOffer.offerIndex`, `events.json` yeni alanları (`maxBridgesPerDay`, `finisherExtras`,
  `pointsMultiplier`, `weekendMultiplier`, `liveOps`) ve bot simülasyonuna §7.3 madde 4. `levels:solve`'a ✓-tuzağı taraması
  (LEVELS §5).
- design-lead (UX §13.2): Bölüm 1 adım 2 Z → Y ve vurguya `piece:0 (a)`; Bölüm 2 adım 2 `piece:2 (c)` hold ("!") + yeni
  adım 3 `piece:1 (b)` (`tut.l1.match`); Bölüm 4 adım 2 `placementCorrect` ×2, adım 3 `piece:2 (p)`; Bölüm 7 adım 1 tamam
  koşulu "`b` (0,6)'ya yerleşti". UX §4/§5.1 kilitli güçlendirici yuvasında adet rozeti (META §4). UX §5.5 değişmez
  (GDD artık aynı kuralı yazıyor). LEVELS blok düzeni değişen bölümler (2, 3, 4, 5, 6) için ekran görüntüleri Faz 2'de.
- entrepreneur (BUSINESS): §5.4 satır ≈ 363 "≈ 1.010–1.120" → "≈ 1.030–1.140" (META §9); §7 LiveOps parametreleri artık
  `events.json`'da (anahtar adları yukarıda), hafta temaları `liveOps.overrides` ile yazılır.

## Tutarlılık denetimi (tur 2)

- #0 GDD K-43/4 analytics `level_resume_invalid` ANALYTICS §2'de yok → KAPANDI (GDD K-43 madde 4: "(yerel tanılama kaydı; analytics olayı ANALYTICS §2'ye eklenirse `level_resume_invalid`)" — TECH §11.1 ile aynı; olay gerekiyorsa entrepreneur ANALYTICS §2'ye satır ekler (code-lead-closure #23 önerisi), GDD olay adını ancak tabloya girince koşulsuz kullanır)
- #1 Duraklatma ↔ G-L yönlendirme penceresi çatışması → KAPANDI (TECH §4.7 `flushPending` listesi kural olarak kabul edildi: GDD K-19 madde 1'e pencereyi erken kapatan olayların tam listesi (a) yeni tutma, (b) Geri Al, (c) güçlendirici yuvası, (d) duraklatma / Android geri / çıkış menüsü, (e) arka plan / kapanma, (f) sahne değişimi + "listede olmayan hiçbir olay kapatmaz"; K-43 madde 1'e tek istisna ve gerekçe (çıkış onayı `m`'yi ve kaydı yarım hamleyle görmez; ilk düşüşte `m = 1`); yeni kenar durumu E-47; TECH değişikliği gerekmez)
- #2 OBSTACLES S2 "`.` dolu sayılır" koşulsuz → KAPANDI (S2: "K-34'te `.` yalnızca boşken dolu sayılır (içinde moloz S4 ya da yapışmış harçlı blok Y8 varsa sayılmaz; GDD K-34, E-43)"; ek olarak GDD K-19 örneği ve K-34 Örnek 2'de "boş `.`" netleştirildi)
- #3 GDD §14.1/4 Z adımı yalnız `piece:` ↔ UX Bölüm 17 `debris:0` → KAPANDI (§14.1/4 (a) "`piece:` ya da `debris:`", `piece:` içermeyen Z adımının `done`'ı `placementCorrect` olamaz (K-16 koşul 2; Bölüm 17 → `yardMove`); (b) çalışma anı denetimi `piece:` ve `debris:` bloklarına bakar, `yardMove` üretilebilirliği ikisi için aynı: K-10'a göre boş, x ≤ 5, y ≤ 7, `R`'de erişilebilir konum; LEVELS §5 kontrol listesi aynı biçimde güncellendi. code-lead'e bağımlılık: TECH §8.3 L-17 "zorunlu adımın `highlight`'ında en az bir `piece:`" → "`piece:` ya da `debris:`" ve `debris:`-yalnız Z adımında `done ≠ placementCorrect` denetimi; Z adımı çalışma anı güvencesi `debris:`'i de kapsar)
- #4 GDD K-30 bütçeleri duvar saati gibi yazılmış → KAPANDI (D3: "belirlenimci düğüm bütçesi içinde (sayı TECH §9.7, cihaz hızından bağımsız; bütçe biterse 'kilit yok' sayılır)"; güvence: "belirlenimci iş bütçeli (≈ 20 ms; sayı TECH §9.7, cihaz hızından bağımsız) 2 hamle denetimi"; ek cümle: bütçeler iş sayısına bağlı → her cihazda aynı yardım (K-43 devamı bit bit aynı), sayıyı değiştirmek `rulesVersion`'ı artırır)

Özet (tur 2): **5 bulgu → 5 KAPANDI · 0 RET · 0 AÇIK SORU.** Bağımlılıklar: entrepreneur (ANALYTICS §2'ye `level_resume_invalid` eklenip eklenmeyeceği, isteğe bağlı), code-lead (TECH §8.3 L-17 ve §14.1/4 çalışma anı denetimi `debris:` kapsamı).

## Açık maddeler (F)

- F-3 → KAPANDI (Bölüm 1–10 karalama çözücüsüyle tarandı: GDD hareket/yerçekimi/K-34/teslimat kuralları, Kamyon Yardımı ve Mala yok; gevşetilmiş saha oyunu + çözümdeki kazı + 1 saha hamlesine kadar kazılı tam arama (1–6'da 1: yanlışlıkla sahaya bırakma da kazıdır) + kalan bütçeyle derin arama. Çıkmaz (kesin + verimli oyuncu bütçe tuzağı) önce → sonra: B1 0→0 (min 3, YAO %100), B2 0→0 (3, %100), B3 0→0 (3, %67), B4 0→0 (4, %75), B5 36→0 (6, %100), B6 0→0 (6, %100), B7 110→0 (7, %100), B8 45→0 (7, %100), B9 ≥166 (kazısız 5)→0 (8, %88), B10 Zor 30→0 (11, %89; yalnız gereksiz hamlelerden sonra 3 durum, 2'si kesin çıkmaz, D3 kurtarır — belgelendi). LEVELS veri: B5 parti 1 `B1_0` W → `D2_0` R + `D2_90` R 2. sıraya; B7 `k1_0` R → G, `C3_0` W partinin sonuna; B8 üst plan satırları `WW` → `GG`, `w`/`k1_1` W → G, `b`/`d`/`k1_0` → Y; B9 `h`+`D` → `C3_180` Y, `k`+`j` → `C3_0` Y, `l` W → Y, parti 1 şaşırtmaları `D2_0` Y ve partinin başına; B10 `a` G → R, `k1_3`/`k2_3` G → W. Min, YAO, bütçe, doluluk, renk kümeleri ve öğretici adımları değişmedi (UX §13.2 / STORY etkilenmez; B5'ten `B1` çıktı, B9'a `C3` girdi). LEVELS §0 tarama tablosu, §4 madde 10, §5 ölçütü (kesin çıkmaz 0 + verimli bütçe tuzağı 0; parti sırası ve 1 genişlikte blok kuralı) ve bölüm notları; GDD K-30 güncellendi; B9 'AÇIK (Faz 2)' notu kaldırıldı. Ayrı karar sorusu proje sahibine: Zor/Çok Zor kalan çıkmazlar için D3 MVP'de zorunlu mu.)

## Son tutarlılık turu 1

- #0 GDD K-30 ↔ LEVELS §0 kapsam dışı çıkmazlar (Bölüm 5/6) → KAPANDI ((b) yolu: K-30'un D3'süz güvencesi "LEVELS §5 erişim kapsamıyla sınırlıdır" diye yazıldı (✓ yerleşimler + çözümdeki kazı + 1 saha hamlesi; 1–6'da 1); kapsam dışı çıkmazlar (iki gereksiz saha hamlesiyle B5 3, B6 2) LEVELS §0'da sayılır ve D3'süz sürümde +5 teklifi / kayıpla sonuçlanır; LEVELS §0 ve B5 notu aynı cümleye bağlandı. (a) veri yolu seçilmedi: her kapsam genişletmesinden sonra bir sonraki gereksiz hamle yeni çıkmaz üretir, mutlak güvence ancak D3'le olur. Seçilen yol ve "D3 MVP'de zorunlu mu" sorusu proje sahibine)
- #1 OBSTACLES N4 torba altı saklı nesne ↔ GDD K-42 / TECH L-02, L-14 → KAPANDI (N4'ten "torba" çıkarıldı; matriste Y2×W7 ve Y2×Y7 `·`; K-42'ye "Çimento Torbası örtü sayılmaz → `hidden_item_exposed`" eklendi. TECH L-02/L-14 zaten bu kuralı yazıyor, code-lead değişikliği gerekmez; hiçbir bölüm kaydı torba altı nesne kullanmıyor)
- #2 Kayar kapı `a < b` ve hareket aralığı örtüşmezliği → KAPANDI (OBSTACLES W5 kısıtı: `0 ≤ a < b`, `a ≤ y ≤ b`, `b + size ≤ height − 1`, `a … b + size − 1` satırları diğer geçitlerle örtüşmez; `slider_range` / `gap_overlap` ve iki geçersiz örnek; GDD K-45/3 aynı metin. LEVELS 16, 20, 43 kısıtlara uyuyor. Bağımlılık: code-lead TECH L-09'u eşitler)
- #3 LEVELS §0 öğretim kuralı ↔ hedef oranlar ve 13–19 dizilimi → KAPANDI (kural ölçülebilir yazıldı: tanıtım bölümü = veri imzasına göre yeni mekaniği olan bölüm (27 bölüm listelendi); hedef Normal'de ≥ %70, Zor'da ≥ %50, bant alt ucu yalnız kombinasyon/final; "sonraki iki bölüm pekiştirir" cümlesi kaldırıldı, yerine 13–19'da yedi ardışık tanıtım ve pekiştirmenin §3 bağımlılık dizinindeki yeniden kullanım olduğu yazıldı (Y2 yalnız 18). Veri: 18, 24, 29 %65 → %70; 35 %45 → %50 (§1 ve §3); §5 kontrol listesine madde. Bütçeler değişmedi, Faz 3 bot ayarı hedefe göre yapılır)
- #4 Yapışmış harçlı cam blok kırılınca dönüş yeri → KAPANDI (Seçenek 1: GDD K-17 istisnası "başlangıcı şantiyede olan kırılan cam blok 1. adımı atlar, 2. adımla sahaya döner, yapışma kalkar, maliyet 3" + sayısal örnek; OBSTACLES S3 ve Y8 aynı. Bağımlılık: code-lead TECH §5.2 adım 1'e istisna)
- #5 LEVELS §3 engel bağımlılık dizini → KAPANDI (W3 satırına 37 (sabit geçit boy 1), S2 satırına 44 (mazgal boşlukları `.`) eklendi)
- #6 GDD K-45 örneği gerçek Bölüm 9'u geçersiz gösteriyor → KAPANDI (örnek varsayımsal: "Bölüm 9'un geçidi (`height 6`, `y=3`, `size=1`, geçerli) `y=5`'e taşınırsa → 5+1 > 5 → `gap_touches_top`")
- #7 Köprü beklenen payı ↔ D-024 koruması → KAPANDI (META §6.2 kesin hesapla yeniden yazıldı: `q = E[s^7]·Π f`, `B ~ Binom(99, q)`, pencere türleri tablosu; 10.000 havuz 36 pencerenin 18'inde > 900 (en kötü ≈ 1.311, ortalama ≈ 930) → `events.json → wobblyBridge.prizePoolCoins` 10.000 → 6.500 (en kötü L0 44/45/49 ≈ 852, ortalama ≈ 605; bu bot modeliyle tavan 6.863); `config:validate` kuralı: temel değer + her LiveOps override, L0 = 15–50 ve Usta Modu başlangıçları, pay + `finisherExtras.coins` < `offerCosts[0]` (`bridge_share_cap`); §6.1 havuz satırı; §9 Köprü satırı 605 ile 50–150, toplam ≈ 1.030–1.130, Usta Modu ≈ 840–940; `events.json` `_doc`'ları. Bot becerisini artırma yolu seçilmedi: botlar LEVELS hedef bantlarından daha da yetenekli olurdu. Bağımlılık: entrepreneur BUSINESS §4.5-8 (650 → 852/605), §7 Hafta 2 12.000 havuzu (tavan 6.863), §5.4 1.140 → 1.130; design-lead UX Köprü tel çerçevesi "10.000" → 6.500. REVIEW_LOG orkestratörün dosyası olduğu için oraya yazmadım; bildirim orkestratör üzerinden)
- #8 GDD §14.1 `done` sözlüğü ↔ UX §13.2 11–38 satırları, Bölüm 35 başlama anı → KAPANDI (GDD §14.1/3 kapalı sözlük genişletildi: `turnEnd`, `landed`, `steered`, `obstacleHit{type}`, `itemCollected{type}`, `yardFall`, `carouselTurn` + süzgeçler `flag`, `wind`, `hidden`, `painted` (TECH `GameEvent` karşılıklarıyla); §14.1/4b çalışma anı güvencesi yeni olaylara genişletildi; yeni madde 5 `startOn` (Bölüm 35: `{ event: deliveryDone, flag: mortar }`); madde 6 kapsam (`tut.meta.*` bölüm verisi değil). LEVELS §3'e 11–38 `done` eşleme tablosu (her UX satırı tek olaya; "—" satırları `timeoutMs` ya da `pre:` için `tap`); LEVELS §0 atfı. Bağımlılık: code-lead TECH §8.2 `TutEvent` + süzgeçler + `startOn` + L-17 (Faz 2 öğretici şemasından önce); design-lead UX §13.1 "ek başlama alanı yok" cümlesi ve §13.2 Bölüm 35 satırı)
- #9 D-026 yedek kuralı META/economy.json'da yok → KAPANDI (META §8.5 yedek kural: özgün `moves`, yıldız yok, altın yalnız kazanma tabanı (Bonus İnşaat ve mala altını yok), kumbara/lig/bot zorluğu özgün etiketten, seri/Köprü/Lig'e sayılır, Usta Sandığı verilir ve aynı §9 ayar kuralına tabi (tahmin G ≈ 780–880 → sandık 300–400); §9'a satır; `economy.json → masterMode.variant: "master" | "replay"` + `replay` alanları + `_docVariant`. BUSINESS §9.2'deki "(öneri)" artık META kararı)
- #12 GDD K-43/4 analytics cümlesi koşullu → KAPANDI ("analytics: `level_resume_invalid` gönderilir; altın iadesi > 0 ise `coin_source{reason: refund}`; bu denemede `level_end`, `level_resume`, `life_lost`, `event_eliminated` gönderilmez — ANALYTICS §2 v2")
- #14 LEVELS `levels:solve` Faz 2 ↔ D-059 → KAPANDI (§0: "Faz 3'te aynı tarama `levels:solve` ile tekrarlanır; Faz 2'de 1–5 el çözümleri golden test (D-059)"; doğrulama notundaki "Faz 2–3'te … `levels:solve`" de `levels:validate` (Faz 2) / `levels:solve` (Faz 3) olarak ayrıldı; GDD K-30 aynı)

Özet (son tur 1): **12 bulgu → 12 KAPANDI · 0 RET · 1 AÇIK SORU (proje sahibi: D3 MVP'de zorunlu mu, #0).**
Bağımlılıklar: code-lead (TECH L-09 #2, §5.2 adım 1 #4, §8.2/L-17 öğretici şeması #8, `config:validate` `bridge_share_cap` #7);
entrepreneur (BUSINESS §4.5-8, §7 Hafta 2, §5.4 #7; §9.2 "(öneri)" #9); design-lead (UX §13.1, §13.2 Bölüm 35 #8; Köprü
tel çerçevesindeki havuz sayısı #7).

## Son tutarlılık turu 2

- #0 LEVELS §0 F-3 tablosu Bölüm 10 satırı ↔ sütun tanımı ve TECH §9.8 sınıflaması → KAPANDI (Bölüm 10 satırı: Çıkmaz "30 → 2 (2 kesin çıkmaz, yalnız gereksiz hamleden sonra; Zor → uyarı)", israf sonrası bütçe aşımı "1"; Bölüm 10 notu "2 kazıda verimli oyuncu bütçe tuzağı 0, 2 kesin çıkmaz (yalnız gereksiz hamleden sonra) ve 1 israf sonrası bütçe aşımı" + kesin çıkmazın hamle israfından bağımsız olarak Çıkmaz'a sayıldığı (TECH §9.8 sınıf 1, `trap_dead_end`), israf sınıfının yalnız çözülebilir durumlar için olduğu cümlesi. TECH testi "K-30 trap scan reproduces F-3 results for levels 1–10" artık tabloyla aynı sayıları bekler; TECH değişikliği gerekmez)
- #1 GDD K-23 ve K-10 örnekleri test olarak yanlış → KAPANDI (K-23: "dilim 1 atlanır" parantezi kaldırıldı, örnek uzatıldı: 10. hamle sonunda 2'den sıradaki indeks 0'a; 11.–14. hamle sonlarında `t` = 1…4 → 14. hamle sonunda 0'dan 2'ye, dilim 1 tamamlandığı için atlanır. K-10: "(4,5),(5,5),(4,4),(5,4) boş, (4,3),(5,3) dolu"; açıkken 2 satır iner, (4,4)'te durur)
- #2 Moloz `segment` zorunlu mu (GDD K-45/7 ↔ §14 ↔ TECH §8.2) → KAPANDI (isteğe bağlı yolu seçildi, TECH şemasıyla aynı: K-45/7 "moloz şantiye alanında (x 6–7) ve ait olduğu dilimin plan alanında, molozlar çakışmaz; `segment` isteğe bağlı, verilmezse 0 (§14, P-5); renk şartı yok, K-16 (2) — `debris_misplaced`, TECH L-13"; OBSTACLES S4 veri satırı `segment?` (verilmezse 0); LEVELS §5 kontrol listesi "moloz `segment` alanı dolu" → "ait olduğu dilimin plan alanında (`segment` verilmezse 0; dilim 0 dışındaki moloza yazılır)". code-lead değişikliği gerekmez; bilgi notu: TECH §8.2 "varsayılanı olan yalnızca iki alan" cümlesi `debris[].segment`'in yükleme varsayılanını (0, `_default` değil `optional`) anmıyor — code-lead isterse cümleye ekler)
- #3 LEVELS §3 "11–38 `tutorial[]` `done` eşlemesi" ↔ UX §13.2 adım sırası (12, 16, 23) → KAPANDI (12·1 `{ event: tap }` (`pre:thermos`, pencere kapanınca da biter) ↔ 12·2 `{ timeoutMs: 2000 }` (`goals`, `tut.l12.clear`); 16·1 `{ event: tap }` (`pre:trowel`) ↔ 16·2 `{ event: turnEnd }` (`gap:0`, `tut.l16.slider`); 23·1 Z `{ event: overWall }` (vurgu çözümün ilk 1 genişlikli `piece:` bloğu + `crane` + `build`, `tut.l23.light`) ve yeni 23·2 Y `{ event: steered }` (`tut.l23.steer`); 20·1 satırına da "pencere kapanınca da biter"; "11–50 öğretici notları"na "`pre:` adımı her zaman 1. adımdır (12, 16, 20)" ve "Bölüm 23 iki adımlıdır" cümleleri; GDD §14.1/3'teki atıf tablonun adına ("11–38 `tutorial[]` `done` eşlemesi") düzeltildi. design-lead-closure #0, #7 bağımlılığı kapandı)

Özet (son tur 2): **4 bulgu → 4 KAPANDI · 0 RET · 0 AÇIK SORU.** Bağımlılık yok (TECH §8.2 varsayılan cümlesi yalnız bilgi notu, #2).

## Son tutarlılık turu 3

- #0 GDD K-12 "şantiye tarafından ray kipine girilemez" ↔ OBSTACLES S4/N14, TECH §4.1 moloz ray istisnası → KAPANDI (K-12'ye tek istisna yazıldı: şantiyedeki başlangıç konumunda bütün satırları bir geçidin satır aralığında olan moloz, geçit tutulduğu an açıksa (W4 kepenk açık, W7 kilit açılmış) ray kipinde de başlar ve sola, bütün hücreleri sahaya geçecek biçimde çekilir (1 hamle, K-10); Y8 ve diğer şantiye blokları istisnaya girmez; moloz örneği + kapalı kepenkte yalnız serbest kip örneği. OBSTACLES S4 "bütün satırları bir geçitteyse ve geçit o an açıksa … GDD K-12'nin tek istisnası", N14 "geçit açıkken … GDD K-12 istisnası". TECH §4.1 adım 3 (`canPassGap` kancaları, Y8 rayda başlamaz) ile aynı; code-lead değişikliği gerekmez)
- #1 `clear/debris` aynı molozu iki kez sayıyor (GDD K-41, K-36 ↔ TECH §7.2 S4) → KAPANDI (K-41: "her moloz bloğu en çok 1 kez sayılır, şantiyeden çıktığı anda: sahaya yerleşim (sürükleme — serbest ya da ray kipi — ya da Vinç) veya şantiyedeyken Çekiç; sahaya taşınmış moloz sonra Çekiç'le kırılırsa ya da sahada yeniden konumlandırılırsa yeniden sayılmaz" + moloz örneği (1/3 → sahada Çekiç → 1/3 → şantiyede Çekiç → 2/3); K-36: "moloz (şantiyede) → yok olur (sayılır); sahaya taşınmış moloz → yok olur, yeniden sayılmaz (K-41)"; OBSTACLES S4 "Şantiyedeyken Çekiç kırar (sayılır). Her moloz en çok 1 kez sayılır". TECH §7.2 S4 "moloz şantiyeden çıkınca +1" ile aynı; code-lead değişikliği gerekmez)
- #2 GDD §14 `tutorial[]` veri tipi satırı eski → KAPANDI (satır: `{ …, textKey, startOn?: Cond, done: Cond | { timeoutMs } }`, `Cond = { event, count?, minMs?, at?: [x, y], type?, flag?, wind?: true, hidden?: true, painted?: true }`; hangi alanın hangi olayda yazılabileceği §14.1 madde 3, `startOn` madde 5 (`timeoutMs` olamaz); "Neden" sütunu: süzgeçler ve `startOn` eklendi, kesin şema TECH §8.2 `TutCond` / `TutDone`)
- #3 LEVELS §0 doğrulama notu "El çözümleri Faz 2'de golden test" ↔ D-059 / TECH §9.5 → KAPANDI ("1–5 el çözümleri Faz 2'de, 6–10 el çözümleri Faz 3'te golden test olarak hamle dizisine çevrilir (`tests/golden/level_NNN.hand.json`, code-lead; D-059, TECH §9.5)"; aynı §0'ın F-3 paragrafıyla ve TECH §9.5 ile aynı)
- #4 LEVELS §3 13·2 satırında kaldırılmış bağlamsal tetik notu → KAPANDI (satır: "`{ timeoutMs: 3000 }` (Bölüm 10 Vinç adımıyla aynı; Geri Al için bağlamsal tetik yok, UX §13.2)", UX karşılığı sütunu "— (3 s)"; LEVELS'ta başka "ilk hatalı yerleşimde" kalıntısı yok. design-lead-closure son tur 2 bağımlılığı kapandı)

Özet (son tur 3): **5 bulgu → 5 KAPANDI · 0 RET · 0 AÇIK SORU.** Bağımlılık yok (TECH §4.1 ve §7.2 S4 zaten yeni GDD metniyle aynı).

## Senkron geçişi (2026-10-06)

- product-lead-K1 LEVELS §3 `tutorial[]` `done` tablosu ↔ UX §13.2 (12·1/12·2, 16·1/16·2 sırası; 23·1 Z `overWall` `piece:<i>` 1 genişlikli + `crane` + `build`, `tut.l23.light`; 23·2 Y `steered`, `tut.l23.steer`; "11–50 öğretici notları") → ZATEN YAPILMIŞ (son tur 2 #3; satırlar UX §13.2 satır 1044–1064 ile yeniden karşılaştırıldı, fark yok; değişiklik yok)
- product-lead-K2 LEVELS §3 13·2 "ilk hatalı yerleşimde de bağlamsal tetiktir" notu → ZATEN YAPILMIŞ (son tur 3 #4; LEVELS'ta "ilk hatalı yerleşim" kalıntısı yok)
- product-lead-K3 GDD §14.1/3 sayım okumaları → KAPANDI (`obstacleHit` = adım 5–6 komşu etkisi **ya da Çekiç'in doğrudan vuruşu** (K-36, `step: 1`) + Bölüm 11 örneği; `count` maddesine "her hamle sonu olayı bir sürükleme hamlesinde ya da güçlendirici kullanımında en çok 1 kez sayılır" onayı; `gapPass` = yalnız serbest → ray geçişi, ray kipinde başlayan molozun başlangıcı sayılmaz (TECH okuması onaylandı, K-12 moloz örneği); K-17'ye plan dışına bırakılan yapışmış harçlı bloğun 1. adımla başlangıca dönüp yapışık kalması (maliyet 2) + örnek; OBSTACLES Y8 aynı cümle. Bağımlılık: code-lead TECH §8.2 `obstacleHit` kaynağı ve §6.4 "yalnız adım 5–6" cümlesi + test adı)
- product-lead-K4 atıf eşitlemesi → KAPANDI (GDD K-43/4 zaten koşulsuzdu, "ANALYTICS §2 v2" → "ANALYTICS §2; `level_resume_invalid` v2'den beri tabloda"; GDD K-30 "Faz 3'te `levels:solve --traps`, TECH §9.8, doğrulayıcı L-27"; LEVELS §5 "Araç desteği code-lead'den istenir" → "Araç: `levels:solve --traps` … TECH §9.8; L-27; Faz 3"; LEVELS §0 Faz 3 tarama cümlesine aynı atıf)
- product-lead-R1 code-lead-closure son tur 1 notu: LEVELS §0 "Faz 2–3'te aynı tarama" → Faz 3 → ZATEN YAPILMIŞ (son tur 1 #14; §0 "Faz 3'te … Faz 2'de 1–5 el çözümleri golden"; bu geçişte yalnız K4 atfı eklendi)

## Faz 2

Entegratör raporu (golden tekrarları, doğrulayıcı) ↔ `docs/LEVELS.md` §2 ve GDD denetimi (2026-10-06). `levels/*.json` ve
LEVELS değişmedi.

- PL-F2-1 El çözümleri ve bölüm verisi → DOĞRULANDI, veri değişikliği yok. `level_001…005.json` LEVELS §2 ile alan alan
  karşılaştırıldı: blok tablosu sırası = parti-0 dizi sırası, şekil, renk, çapa (23/13/15/15/13 blok), duvar boyu, geçit
  (Bölüm 3 y=2 boy 2, Bölüm 4 y=3 boy 2, static), plan satırları ve dilim adları, bütçe 11/11/11/12/11, zorluk, `seed`
  = id×1000+id, `teaches` (3 W1, 4 S2, 5 S1; 1 ve 2'de yok), öğretici adımları (vurgu, Z/Y, el yolu, `textKey`, `done`)
  ve Bölüm 5 parti 1 (`D2_0` R x=2, `D2_90` R x=4, `C3_0` W x=0, `C3_180` G x=2; `y` = 8, GDD §14 / K-25). Fark yok.
  Doluluk 46/47/48/47/46. `npm run levels:validate`: 5 dosya, 0 hata, 0 uyarı. `npx vitest run tests/golden`: 15/15.
  Golden dosyalarındaki adımlar (başlangıç hücresi, giriş, iniş, dilim tamamlama, Bölüm 5 dökümü `k1_0` (2,6), `k1_1`
  (4,7), `k1_2` (0,6), `k1_3` kuyrukta → 4. hamlenin 9. adımında (0,6)) LEVELS §2 çözüm satırlarıyla aynı; 3/3/3/4/6
  hamle, kalan 8/8/8/8/5, YAO 3/3, 3/3, 2/3, 3/4, 6/6. 12 öğretici anahtarı `tr.json` ve `en.json`'da var (L-17).
- PL-F2-2 Gerçek çekirdekle yeniden tarama (karalama betiği, proje kodu değil; `GameSession`/`applyMove` ile ✓
  yerleşimler + 1 saha hamlesi, LEVELS §5 kapsamı) → DOĞRULANDI. En kısa çözüm 3/3/3/4/6 (el çözümünden kısa çözüm yok,
  bütçe değişmez). ✓ yerleşimle girilen durumlarda kesin çıkmaz ve bütçe tuzağı 1–5'te 0 (F-3 tablosuyla aynı). Z adımları
  her durumda geçerli: Bölüm 1 adım 1 (1 durum), Bölüm 3 adım 2 (ilk ✓ sonrası 13 durum, `f` geçitten), Bölüm 4 adım 3
  (2 ✓ sonrası 38 durum, `p` (6,3)'e ✓). 1–4'te kapsamdaki **her** durum (saha hamlesiyle girilenler dahil) kalan bütçeyle
  bitirilebilir.
- PL-F2-3 Bölüm 5: tek gereksiz saha hamlesiyle girilen 4 kesin çıkmaz → AÇIK (Faz 3, product-lead; veri bu fazda
  değişmedi). Örnek: el çözümü 1–3 (`b`, `a`, `c`; dilim 1 biter, `k1_3` kuyrukta), sonra `k1_0` (2,6)'dan (3,6)'ya
  sahada kaydırılır → aynı hamlenin 9. adımında `k1_3` (`C3_180` G) (1,6)'ya düşer ve `k1_2`'nin (`C3_0` W) (1,6)
  hücresini örter; saha 48/48 dolu, hiçbir ✓ yerleşim yok, D1/D2 tutmaz → kayıp (+5 teklifi de kurtarmaz). Diğer üçü:
  `b`, `a`, `d` ✓ sonrası `c` → (0,7), `c` → (3,6) ya da `k1_0` → (3,6). Sınırsız hamleyle de kazanılamadıkları betikle
  doğrulandı. F-3 ölçütü yalnız "✓ yerleşimle girilen" durumları saydığı için §0 tablosundaki 0 tanım gereği doğrudur,
  ama §5 kamyon maddesinin amacı ("gereksiz bir saha hamlesinden sonra da döküm kazılabilir kalır") ve Bölüm 5 notundaki
  "1 saha bırakmasına kadar kesin çıkmaz 0" cümlesi bu durumları kapsamıyor. Kök neden: dilim 1 sonrası sahada 10 boş
  hücre var, parti 1 de 10 hücre; kuyruktaki blok saha hamlesinin 9. adımında da düşer (K-35 adım 9) ve sahayı tam
  doldurur. Denenen 5 veri seçeneği (kamyon şaşırtması `k1_0`'ı çıkarmak; saha şaşırtması `d`'yi çıkarmak, 2 biçim;
  parti sırası W, G, R, R; `k1_0` → `D2_90`) resmî ölçütte daha kötü (2–16 ✓ ile girilen çıkmaz); bu yüzden Faz 2'de
  veri değişmedi. GDD K-30 kapsam dışı çıkmazların +5 teklifi ya da kayıpla bittiğini zaten kabul eder. Faz 3: Bölüm 5'in
  üst satır düzeni ve parti 1 yeniden tasarlanır (parti sahayı %100 doldurmaz ya da kuyruktaki blok sıradaki gerekli
  bloğu örtemez); doğrulama, saha hamlesiyle girilen durumları da sayan `levels:solve --traps` ile. Bu değişiklik
  code-lead'in `tests/golden/level_005.hand.json` dosyasını ve Bölüm 5 verisine dayanan testlerini (E-03 kuyruk testi,
  S1 ve oturum testleri) yeniden üretmesini gerektirir.
  LEVELS değişikliği (Faz 3'te, veriyle birlikte): §0 F-3 paragrafına "ölçüt ✓ yerleşimle girilen durumları sayar;
  saha hamlesiyle girilen çıkmazlar ayrı satırda" cümlesi, Bölüm 5 F-3 notuna yukarıdaki 4 durum.
  Bağımlılık: code-lead, TECH §9.8 / L-27 tuzak taraması saha hamlesiyle girilen kesin çıkmazları ayrı bir uyarı
  sınıfıyla raporlasın (ör. `trap_dead_end_after_yard_move`).
- PL-F2-4 Raporun product-lead dışı maddeleri (code-lead TECH izleri, `rule-coverage` saplaması, Y2 `bagFell` olayı,
  design-lead token ve i18n anahtarları, `levels` klasörünün `.prettierignore`'da kalması) → BİLGİ. Bölüm verisini
  etkilemez. `levels` klasörünün Prettier dışında kalması onaylandı (dosyalar doğrulayıcıyla denetleniyor).

Özet (Faz 2): **4 madde → 2 DOĞRULANDI · 1 AÇIK (Faz 3, Bölüm 5 yeniden tasarımı) · 1 BİLGİ.** Bölüm JSON'u ve LEVELS
değişmedi.
