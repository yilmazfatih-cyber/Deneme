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
