# code-lead kapanışları — Faz 1 revizyon turu (2026-10-04; tamamlama 2026-10-05)

Güncellenen belge: `docs/TECH_DESIGN.md`. Biçim: `kaynak-dosya#konu → KAPANDI (ne yapıldı) | RET (gerekçe) | AÇIK SORU (soru)`.
2026-10-04 turu API hatasıyla raporsuz kesildi. 2026-10-05'te her satır TECH'in **güncel** metnine karşı yeniden denetlendi
ve GDD/OBSTACLES/META'nın 2026-10-05 metnine eşitlendi (R-02). Önceki kapanışta yazılı olup metinde olmayan tek madde
(`bridgeSpendCapCoins`) ve istenip yazılmamış iki test adı bu turda eklendi. Bu turda değişen satırlar **[05-10]** ile işaretli.

Özet: **54 doğrudan yorum + 3 dolaylı satır = 57 → 57 KAPANDI · 0 RET · 0 AÇIK SORU** (yorum düzeyinde).
Turun tek Engeli (product-lead.md#K-34) kapalı: K-34 doğrulamada (§5.2), Vinç/Altın Mala'da (§6.4), solver'da (§9.3)
ve K-01…K-46 kapsam tablosunda (§12.4). S-29…S-38'in hepsi GDD/META'da yanıtlandı (TECH §16.2); açık kural sorusu yok.
Proje sahibi soruları TECH §16.3'te (O-1…O-4).

## product-lead.md → code-lead (18)

- product-lead.md#K-34 Alttan Üste doğrulamada yok (Engel) → KAPANDI [05-10] (tek `isCorrectPlacement` = K-16 + K-34, `filled`/`dotMask`/`planMask` ile sütun başına 1 AND; `verdict = { ok, reasons[], missingSupport[] }` GDD K-34 kanca 2 sırasıyla (`debris, outside, window, color, support`); `buildFront` = `eligibleTrowelCells` (kanca 1); `pieceBounced` birincil neden + eksik destek (kanca 3); ilk `support` → `tut.ctx.support` (kanca 4); ray, düşüş, balon, G-L, Vinç (§6.4), Altın Mala (§6.4), Boya Fırçası harç kilidi, gölge ve solver (§9.3, `buildFront` ön elemesi) aynı fonksiyon; moloz/yapışmış harç doğru dolu sayılmaz; Faz 2 kapsamında (§14.1); kapsam tablosu §12.4; testler "K-34 rail over empty colored cell is wrong", "K-34 crane and trowel obey support rule", "K-34 balloon obeys support rule", "K-34 verdict reasons keep fixed order", "K-34 solver never emits support-violating move")
- product-lead.md#kural kapsamı (§12.4 K-01…K-33) → KAPANDI [05-10] (`test:rules` K-01…K-46 + E-01…E-41 + W/Y/S/G + `[kural]` N-notları, kimlikler belgelerden okunur; §12.4 K-01…K-46 kapsam tablosu (K-05, K-07, K-19, K-29, K-34, K-43, K-45 satırları güncel); Faz 2 kapsamında K-34, K-35, K-41, K-43, K-44, §14.1)
- product-lead.md#teslimat sırası (§6.2 adım 8–9) → KAPANDI (adım 8 yalnızca `enqueue(batch)`, adım 9 tek teslimat noktası, bütün kuyruk FIFO, bekletmez; aday sütun sırası x → `dropColumns` → uzaklık, eşitlikte duvara yakın; testler "K-26 older queued pieces deliver first", "E-34 …")
- product-lead.md#S-21 boya kapısı → KAPANDI (`Move.drag.via`; BFS durumu `(düğüm, lastPaint)`, son girilen kapı geçerli; adım 1'de bırakma yerinden bağımsız boyama; solver "geçitten geç, sahaya dön" adayları; §4.2, §6.2, §9.3; test "E-39 via last entered paint gate wins")
- product-lead.md#S-9 balon tavanı → KAPANDI [05-10] (şantiyede en üst hücre `h + e − 1`, siluet tavandaysa siluetin üstünde → plan dışı; tavanın üstünden bırakılan balon tavana iner (E-35); O(1), §4.5'teki O(h) ve §9.3'teki "her varış ayrı aday" kaldırıldı; istenen test adı "S8 balloon hangs from plan top" §5.1'e eklendi)
- product-lead.md#iki küçük kural netleştirmesi (W8, Y8) → KAPANDI [05-10] (W8 `modifyFall` yalnızca `d ≥ 1`, balonda `d = abs(bırakma − tavan)`; Y8 yalnızca bütün hücreler plan alanındaysa `stick`; §5.1, §5.2, §7.2; istenen test adı "W8 no drift when resting" eklendi, "Y8 sticks only inside plan area" vardı)
- product-lead.md#adım 6 saha yerçekimi → KAPANDI [05-10] (`do { settle (yarım adımlı); düşüşlerin komşu etkileri } while (torba/kasa değişti)`; engel başına hamlede 1; düşen torba etki üretmez; Y6 açıkken balon yükselir; N24–N27, N33, N34, E-12, E-33, E-36 testleri; §5.3)
- product-lead.md#ıslak beton ve teslimat → KAPANDI (parça tamponuna `arrivedTurn`; Y4 `onMoveEnd` `arrivedTurn == turn` olanları atlar; E-31 testi; §2.4, §6.2, §7.2)
- product-lead.md#K-30 Kamyon Yardımı → KAPANDI [05-10] (`noMoves` → zincir/ıslaklık kalkar, gerekirse dizme; `material` → `deliverExtra('B1', c, n)` K-25 yolu; `tiling` → yapıcı yeniden şekillendirme; "kilit çoğunlukla şantiyeden" notu kaldırıldı; boya istismarı paragrafı GDD K-30 yanıtına (`B1` kalır) çevrildi; test "K-30 D2 delivers missing B1 bricks"; §9.7)
- product-lead.md#bot modeli (§11.2) → KAPANDI [05-10] (bütün parametreler `config/events.json`'dan; META §6.2'ye birebir: `s_i = 0,50 + 0,45·R(i,0,0)`, deneme aralığı `3 + floor(13·R(i,j,1))`, `p = clamp(s·difficultyFactor[d_k])`, `R(i,k,2) < p`, tohum `eventId`; Lig META §7.3: `W'·g_p(x)/1000`, `curveTable` tamsayı tablo, `R` tohumu `(weekId, groupId)`, `groupId = hash32(weekId, installId)`; ödeme/bakiye girmez; Monte Carlo testleri ≈ 18 bitiren ±3, Bronz 20. sıra ≈ 38; §2.7, §11.2)
- product-lead.md#bölüm şeması eksikleri → KAPANDI [05-10] (`DebrisPlacement.segment`, slider `dir`, `carouselEvery` 2–6, `wetMoves` 1–5; kepenk `period` 1–4, `repeat.period` 1–4, asansör 0–3, dilim 1–5; yön `1 | −1` GDD §14 biçimi; `seed` isteğe bağlı, yoksa `id × 1000 + id` (K-45/1); §8.2)
- product-lead.md#doğrulayıcı ile K-45 farkları (a–f) → KAPANDI [05-10] (`Issue.code` + `rule: 'K-45/n'`; (a) L-06/L-07 plan + bütün bloklar; (b) L-21 bayrak birleşimi; (c) L-22 yeni mekanik ≤ 1, mekanik kümesi **yalnızca** OBSTACLES veri imzasından (27 satır), L-16 `teaches_mismatch` = `teaches` türetilen yeni mekaniğe eşit; (d) L-23 saklı nesne çakışması; (e) L-03 öğreticilerde de error; (f) L-13 yalnızca kendi dilim alanı; W3 R-21 (B); §8.3)
- product-lead.md#güçlendirici kuralları K-36…K-40 → KAPANDI [05-10] (§6.4 ön koşul + etki tablosu, `boosterRejected` ile harcanmama, mini hat 5(saklı nesne)/6/7/8/9/11/12; W4/W7 `canPassGap` `openShutterUntil`'a bakar; Geri Al + Kamyon Yardımı E-37'ye bağlandı)
- product-lead.md#can ayırma ve çıkış (activeAttempt) → KAPANDI [05-10] (R-13 ile daha geniş: `inLevel` her eylemde kaydedilir, kapanma kayıp değil, belirlenimci tekrar; `inLevel` alanları GDD K-43 madde 3'e eşitlendi (`preBoosters`, `streakTier` üst düzeyde); `m = 0` çıkışı cezasız + iade, seri bonusu tüketilmez (E-41); "K-43 app killed mid-level resumes same state"; §11.1)
- product-lead.md#kenar modeli → KAPANDI (R-03: §2.2 sıfır genişlikli sınır, 8×10 ızgara; testler "K-05 3-tall piece cannot clear an 8-high wall", "K-12 piece must fit the gap rows entirely", "K-07 release straddling the boundary cancels")
- product-lead.md#G-L yönlendirme riski → KAPANDI [05-10] (R-2 notu K-34'e göre güncel; `steer` balon yükselişini de kapsar; geçersiz girdi hak yakmaz, `atRow` bırakma ile yönlendirmesiz iniş satırı arasında (GDD K-19 madde 3–6); §4.2, §4.7, §5.1, §9.3, §15)
- product-lead.md#denge araçları → KAPANDI [05-10] (LEVELS 1–10 el çözümleri `tests/golden/level_00N.hand.json`; `levels:bot --continue N` + "+5 sonrası kazanma oranı"; ekonomi sütunları R-16 ölçütüne çevrildi (medyan altın bakiyesi bandı + kayıp kurtarma karışımı); §9.5, §9.6)
- product-lead.md#ağır yerçekimi erişilebilirliği (→ code-lead, design-lead) → KAPANDI (R-11: varsayılan 700 ms, "Zaman baskısını azalt" açıkken 1400 ms; önerilen "sayaç yok" R-11 ile seçilmedi, ama `holdMs` tek parametre olduğundan kod değişikliği istemez; bot 700 ile ölçer; §4.7)

## design-lead.md → code-lead (21)

- design-lead.md#hücre ve duvar ölçüsü → KAPANDI (R-04: `/9` formülü yok; `layout.cellPx` 120, `wallW` 60, `yardX/wallX/buildX` + değişmez testleri; `wallWidthCells` gelirse eşitlik testi; 360 px'te 40 CSS px; §2.2, §15 R-10)
- design-lead.md#plan hücresi tarifi → KAPANDI (R-05: tebeşir altlık `planUnderlay` + `alpha.planFill` 0,8 (renk körü 0,9), kesik kontur `planStroke`, mürekkep `planInk`; ozalit ızgara kaplaması plan hücreleri ile bloklar arasında; §10.2, §10.3)
- design-lead.md#girdi kilidi → KAPANDI (R-12: tutma bekleyen tahta tween'lerini son kareye atlatır; kilit yalnızca dilim kayması / kamyon / Kamyon Yardımı, dokunuş 3× hızlandırır; saha zincirlemesi R-12 gereği kilit listesinde değil; §6.3)
- design-lead.md#animasyonları azalt → KAPANDI (JUICE solma varyantları: `reducedFade` 150 ms, ölçek ≤ 1,03, sallama yok, parçacık × 0,2, boşta animasyon durur; haptik yalnızca titreşim anahtarına bağlı; §6.3, §11.7)
- design-lead.md#hafif yerçekiminde yönlendirme girdisi → KAPANDI [05-10] (R-10: tahtaya dokunuş, dokunulan taraf = yön, tutma ile eşikle ayrılır, ↔ çipi/gölge anında güncellenir, 2 genişlikte girdi yok; iki aşamalı commit; `steerZone` varsayılanı GDD'ye göre `board`; §4.7)
- design-lead.md#ağır yerçekimi 700 ms (→ code-lead / proje sahibi) → KAPANDI (R-11 karar verdi: 700 ms + 1400 ms erişilebilirlik seçeneği; "indirilemez" alternatifi seçilmedi (product-lead gerekçesi: G-H'nin dersini siler), `holdMs` parametresiyle maliyetsiz kalır; §4.7, §15 R-3)
- design-lead.md#font → KAPANDI (Baloo 2 woff2 `public/fonts/`, preload + `@font-face` 400–800 `font-display: block`, Boot iki `document.fonts.load` bekler, yedek tokens, lisans Ayarlar'da; §10.2)
- design-lead.md#sabit genişlikli rakam → KAPANDI (değişen sayılar ortaya hizalı + en geniş hane genişliğinde sabit yuvalar; "Baloo 2 Tnum" gelirse tek satır; §10.2)
- design-lead.md#token anahtar adları → KAPANDI (`color.chapter.chN.skyTop`, `drag.fingerOffsetCells`, `layout.*`; `tokens.ts` zod kontrolü; `body` arka planı sahne değişiminde bölüm `skyTop`'u; §10.1, §10.2, §10.5)
- design-lead.md#Filter'sız efektler → KAPANDI (`setCrop` silme/dolma, `setTintMode(FILL)` parlama, gölgeler pişirilmiş siluet, spot ışığı 4 dikdörtgen + 4 çeyrek daire; §10.2)
- design-lead.md#iptal öngörüsü → KAPANDI [05-10] (`DragSession.classify` + `ShadowView` `cancel`: %60 opak + ↩ rozeti; sınıflandırma tablosu GDD K-07'nin 7 satırına eşitlendi (satır 5 kapalı şantiye `siteClosed`, E-27); §4.3, §5.1)
- design-lead.md#dokunma payı → KAPANDI (kod `touch.hitSlopPx` okur; çakışmada en yakın hücre merkezi; 30 px değerini tokens'ta design-lead yazar; §10.3)
- design-lead.md#haptik değerleri → KAPANDI (`Haptics.play(name)` tokens `haptic` anahtarlarını (light…win) okur, kodda sabit yok; Capacitor eşlemesi JUICE §0.7; §11.7)
- design-lead.md#ses parametrelerinin sahipliği → KAPANDI (ZzFX dizileri `tokens.json → audio.sfx.<ad>`; `sfx.ts` yalnızca ad eşler; §11.6)
- design-lead.md#düşüş süresi → KAPANDI (`tokens.physics` ivme + tavan hızı (normal 60/18, ağır 120/26); hafif sabit 4 hücre/s; G-L `atRow` aynı eğriden; §4.7, §6.3)
- design-lead.md#renk körü modu ve atlas → KAPANDI (mod değişince açılış atlası plan kareleri + bölüm sayfası yeniden pişirilir, 20–40 ms; §10.2)
- design-lead.md#ekran incelemesi araçları (CVD) → KAPANDI (`screens --cvd`: normal + deutan/protan/tritan, `feColorMatrix` (Machado); yalnızca DEV ve harness paketinde, R-20 gereği üretimde `?debug` yok; §12.2)
- design-lead.md#Faz 2 planı madde 12 (FTUE) → KAPANDI (giriş sahnesi 3 yer tutucu panelle Faz 2 #12'de; perf FTUE kapısı ≤ 10 s panellerle ölçülür; §10.7, §14.1)
- design-lead.md#blok otomatik döşemesi → KAPANDI (bölüm başı parça pişirme (R-05); içbükey köşe çeyrek yayı ve "parlama yalnızca üst+sol açık hücrede" kuralı tarifte; §10.2b)
- design-lead.md#EXPAND (P-7) → KAPANDI (tek karar P-7 = design-lead P-4; R-06 gereği FIT de desteklenir, çapa sözleşmesi §10.1; seçim proje sahibine O-1)
- design-lead.md#S12 yaş ekranı UX'i (→ entrepreneur / code-lead) → KAPANDI (konum Bölüm 3 kazanma → yaş ekranı → CMP → ana ekran; `ConsentService.ready()` sağlayıcı başlatmayı bekletir; yalnızca yaş kovası `<13 / 13-17 / 18+` (BUSINESS ile aynı); mağaza sürümü; §11.8)

## design-lead-2.md → code-lead (1)

- design-lead-2.md#hafif yerçekiminde yönlendirme girdisi (→ product-lead / code-lead) → KAPANDI [05-10] (dokunuş + tutulabilir blokta başlamayan yatay kaydırma ikisi de kabul, düşüş başına 1, geçersiz girdi hak yakmaz; ↔ çipi; 2 genişlikte girdi yok; `steer.atRow` modeli değişmedi; E-40; §4.7)

## entrepreneur.md → code-lead (12; biri design-lead'e yazılmış ama Faz 2 #11'i bağlıyor)

- entrepreneur.md#TECH §14 Faz 2 süresi ↔ BUSINESS §10 takvimi → KAPANDI (§14: Faz 2 24,5 g net / 29,5 g tamponlu ≈ 6 hf; Faz 3–5 iş listeleri ve günleri; toplam 107,5 g ≈ 21,5 hf ≤ 22 hf; kesme seçeneği §14.1; 2026-10-05 eşitlemesi tampon içinde; proje sahibi sorusu O-3)
- entrepreneur.md#TECH §14 iş #9 basit solver çift iş riski → KAPANDI (öneri kabul: Faz 2'de solver yok, LEVELS el çözümü golden'ları; solver Faz 3'te tek seferde; P-11; −0,5 g)
- entrepreneur.md#TECH §11.4 Analytics tip birliği → KAPANDI (`offer_result`, `ad_rewarded`, `coin_source`, `coin_sink`, `event_continue`, `store_open`, `chest_open`, `session_end`, `settings_changed` + `placement`, `priceCoins`, `offerIndex`, `context`, `method`, `plank`, `amount/reason/balanceAfter`, `age_gate_result`, `consent_result`; tek kaynak ANALYTICS.md tablosu + eşleme testi; §11.4)
- entrepreneur.md#TECH §11.2 EventService bağımsızlık → KAPANDI [05-10] (R-14: (a) ESLint `services/events/**` → economy/save/iap/ads/analytics yasağı, (b) "E8 bot standings are independent of purchases" — `installId`'si aynı, ödeme geçmişi farklı iki kayıt → bit bit aynı sıralama, (c) `tools/event-sim.ts` bitiren sayısı/pay raporu; tohumda ödeme/bakiye yok, kurulum kimliği yalnız META §7.1 `groupId`'de; `event_join.seedHash`; §1.3, §2.7, §11.2)
- entrepreneur.md#TECH §1.2 ve §11 reklam ve satın alma servisleri → KAPANDI [05-10] (R-23: `AdsService`, `IapService` (+ `ConsentService`), MVP'de sahte; tavanlar (`rewardedAdOffer` 1/deneme 3/gün, `ads.dailyCapTotal`), sayaçlar ve analytics servis katmanında; "Bu bir deneme satın alımıdır, ücret alınmaz."; §11.3, §11.8)
- entrepreneur.md#TECH §12.3 debug paneli üretimde → KAPANDI (R-20: yalnızca `import.meta.env.DEV`, üretimde `?debug=1` etkisiz; staging için panelsiz `harness` modu; `build:verify` `dist/`'te debug/harness parçası olmadığını denetler; §1.2, §12.2, §12.3)
- entrepreneur.md#TECH §10.7 ve §13 düşük seviye referans cihaz → KAPANDI (R-23: ≤ 3 GB, Android 10–12, giriş SoC; hedef ≥ 30 FPS, girdi ≤ 2 kare; Faz 2 çıkış kapısı; otomatik "azaltılmış efekt" profili; model listesi birlikte; §10.7, §14.1; O-4)
- entrepreneur.md#TECH §13 Capacitor paket kimliği → KAPANDI (nötr, ad adayından bağımsız, ilk yüklemeden önce kesinleşir; görünen ad NAMING sonrası; kod içi kimlikler kod adı; §13)
- entrepreneur.md#TECH §13 iOS derleme ortamı maliyeti → KAPANDI (§13'e "fiziksel Mac ya da bulut macOS CI" satırı; maliyet Faz 5 başında doğrulanıp BUSINESS §10'a; O-4)
- entrepreneur.md#TECH §11 onay ve yaş kapısı kancası → KAPANDI (`ConsentService { status, ageBucket, ready }`, MVP no-op `granted/null`; sağlayıcılar onaydan sonra dinamik import, öncesinde `track()` yerelde tamponlar; §11.8)
- entrepreneur.md#TECH kapsam etiketleri → KAPANDI (debug paneli, perf harness, `test:rules`, FIT/EXPAND, ASCII, hamle günlüğü dışa aktarma MVP; tarayıcıda Web Worker solver "Faz 3"; gerçek eklentiler mağaza sürümü; §12.3, §14)
- entrepreneur.md#JUICE kapsam etiketleri (→ design-lead; "code-lead'in Faz 2 #11 EventPlayer kapsamı P0 listesiyle eşleşsin") → KAPANDI (Faz 2 kapsamı ve #11 JUICE P0 listesine (#1–13, 18, 19, 50–53, 55–58, 69–71) bağlı; `EventPlayer` tablosu JUICE "Faz/Etiket" sütunuyla eşlenir; §6.3, §14.1)

## entrepreneur-2.md → code-lead (2)

- entrepreneur-2.md#GDD K-43 uygulama kapanınca kayıp sayılması (→ product-lead, code-lead) → KAPANDI [05-10] (R-13: her eylemde ve `pagehide`'da `inLevel { levelId, seed, preBoosters, streakTier, actions, offersUsed, adOfferUsed, outcomeWindow, levelHash, rulesVersion }` (GDD K-43 madde 3); açılışta doğrudan devam (belirlenimci tekrar < 5 ms); kayıp penceresi aynı teklif numarasıyla yeniden açılır; E-38; maliyet +0,5 g; §11.1)
- entrepreneur-2.md#LEVELS §3 B planı yeniden yazılmalı (→ product-lead, code-lead) → KAPANDI (§14.2 engel başına gün tablosu: ucuz/orta/orta+/pahalı; S5 + S6 kesimi ≈ 2,5 g, G-L yavaş düşüşe indirme ≈ 1 g; W8/Y8/S8 tek kanca, kesimin getirisi düşük)

## Dolaylı satırlar (başka ajana yazılmış, code-lead'i adıyla bağlayan) (3)

- design-lead-2.md#ara sahne tetikleyicisi (→ product-lead; "code-lead akışı buna göre kurar") → KAPANDI [05-10] (R-09: `meta/town.ts` tetikleyicileri yalnızca `economy.json → town.cutscenes`'ten okur — `prologue firstLaunch`, `chapter1Start afterTask1`, `chapterStartFrom2 nextHomeEntryAfterPreviousEnd`, `hideNextChapterTasksUntilStartPlayed`, `chapterEnd afterLastTask`, `skippedCountsAsSeen`, `maxCutscenesPerAction 1`; `config:validate` şeması bu alanları doğrular; test "R-09 first cutscene plays after first star spent, not after level 1"; §11.3)
- product-lead.md#ödemeyen oyuncu şartı (→ entrepreneur; "Faz 3 ekonomi simülasyonu … code-lead ile birlikte") → KAPANDI [05-10] (bot raporunda "altın / 10 bölüm", "+5 sonrası kazanma oranı" ve R-16 ölçütleri; §9.6)
- entrepreneur-2.md#ödemeyen oyuncu ölçütü (→ product-lead; "`coin_source`, `coin_sink`, `event_continue` code-lead'e istendi") → KAPANDI (üç olay tip birliğinde, `Wallet.apply` her işlemde yayınlar; bakiye bandı ve kurtarma karışımı §9.6 raporunda; §11.3, §11.4)

## Bu çalışmada (2026-10-05) TECH'e işlenenler

1. GDD K-34 görünürlük kancaları: `Verdict { ok, reasons[], missingSupport[] }` GDD sırasıyla (`'dot'` → `'window'`), `buildFront`
   (= `eligibleTrowelCells`), `pieceBounced`/`mortarStuck` birincil neden + eksik destek, `tut.ctx.support` (§1.2, §5.1, §5.2, §6.3, §6.4).
2. Solver K-34 ön elemesi (`buildFront`) ve "K-34 solver never emits support-violating move" testi (§9.3).
3. GDD K-07 7 satır: satır 5 kapalı şantiye → `moveCancelled{reason:'siteClosed'}` (E-27) (§4.3, §6.3, §12.4).
4. K-05 `blockedByWallHeight` sürükleme sinyali + `tut.ctx.tootall` (§4.4, §8.2); `tut.ctx.bottomup` → `tut.ctx.support`.
5. G-L: geçersiz girdi hak yakmaz, `atRow` aralığı, `steerZone` varsayılanı `board` (§4.7, §5.1, §9.3).
6. E-33…E-41 testlere bağlandı; S-29…S-38 yanıtlı tabloya çevrildi (§5.3, §6.2, §6.4, §11.1, §16.2).
7. K-45: `seed` isteğe bağlı (`id × 1000 + id`), L-16 `teaches_mismatch`, mekanik kümesi yalnız veri imzasından (27 satır),
   W3 = `size = 1` (R-21 B; seçenek A kaldırıldı) (§8.2, §8.3).
8. Bot modeli META §6.2/§7'ye birebir: `eventId`, `3 + floor(13·R)`, `R(i,k,2)`, Lig `(weekId, groupId)`, `groupId = hash32(weekId,
   installId)`; E8 testi aynı `installId` ile (§2.7, §11.2).
9. Ekonomi: `bridgeSpendCapCoins` (önceki kapanışta yazılı ama metinde `maxContinueCoinsPerRun` kalmıştı), reklam devamı tavandan
   bağımsız, ömürde ilk +5 bedava, `rewardedAdOffer`/`ads.dailyCapTotal`, `priceDisplay.referenceSku` (`refPrice` kaldırıldı),
   config v2'de yer tutucu yok (§11.1, §11.3).
10. R-09 ara sahne akışı ve `town.cutscenes` şeması (§11.3); R-16 ödemeyen oyuncu ölçütleri bot raporunda (§9.6).
11. İstenip eksik kalan test adları: "S8 balloon hangs from plan top", "W8 no drift when resting" (§5.1).
12. Biçim: §14.1 #3 bağımlılığı "OBSTACLES veri imzası"; §12.2 tablo hücresindeki `|` kaçışlandı; başlık E-01…E-41.

## product-lead-closure "Diğer ajanlara bağımlılıklar → code-lead" (R-02 uyumu)

- [x] `wobblyBridge.maxContinueCoinsPerRun` → `bridgeSpendCapCoins` (§11.3)
- [x] `config:validate` şemasına `town.cutscenes` alanları (§11.3)
- [x] ilk `blockedByWallHeight` → `tut.ctx.tootall` (§4.4, §8.2)
- [x] `steer`, `via`, yarım adım yerçekimi, `inLevel` (§4.7, §6.1, §5.3, §11.1) — zaten vardı, GDD metnine göre denetlendi
- [x] `verdict.reasons`, `buildFront`, `bounce` (§5.1, §5.2, §6.3)
- [x] `curveTable`, `fmix32-chain-v1` (§2.7, §11.2)
- [x] `levels:validate` veri imzaları (§8.3)

## Kararlar (R-xx) uygulaması

- [x] R-01 K-34: doğrulama §5.2, Vinç/Altın Mala §6.4, solver §9.3, kapsam tablosu §12.4, Faz 2 §14.1, görünürlük kancaları; proje sahibi onayı O-2
- [x] R-02 GDD geçerli: balon tavanı, `via`, FIFO, Kamyon Yardımı, bot modeli, K-45 kodları, yarım adım yerçekimi, K-07 7 satır, `verdict` biçimi, E-33…E-41
- [x] R-03 sıfır genişlikli sınır, 8×10 ızgara (§2.2, §4.2, Ek A)
- [x] R-04 120 px hücre / 60 px duvar `layout.*`'tan (§2.2, §10.2)
- [x] R-05 plan tarifi, sembol mürekkebi, çift kodlu gölge — atıflar (§5.1, §10.2, §10.3); renk kodları değişmedi
- [x] R-06 FIT + EXPAND ikisi de desteklenir, çapa sözleşmesi; seçim O-1 (§10.1, §15 R-9)
- [—] R-07 kasaba görev sayısı/maliyetleri kod verisi değil; yalnızca `town.chapters` okunur, 35 görev §14.3 iş satırında
- [x] R-08 `tut.l{n}.{konu}` regex, `tut.ctx.*` olaydan, `obs.{id}.desc` (§8.2)
- [x] R-09 ara sahne tetikleyicileri `town.cutscenes`'ten (§11.3)
- [x] R-10 G-L girdi biçimi + maliyet onayı (iki aşamalı commit; §4.7, §15 R-2)
- [x] R-11 `holdMs` 700 / 1400 (§4.7)
- [x] R-12 girdi kilidi yalnız dilim kayması/kamyon/karıştırma, fast-forward, azaltılmış hareket = solma (§6.3)
- [x] R-13 `inLevel` + belirlenimci tekrar, `m = 0` cezasız çıkış (§11.1)
- [x] R-14 saf bot modülü, import yasağı, iki-kayıt eşitlik testi, `seedHash` (§1.3, §11.2)
- [x] R-15 3 teklif sınırı reklam dahil, ilk teklif bedava, sayaçlar servis katmanında (§11.3, §11.8)
- [x] R-16 `bridgeSpendCapCoins` 4.050, ödemeyen oyuncu ölçütleri bot raporunda, Usta Sandığı ayar kuralı rapordan (§9.6, §11.3)
- [x] R-17 Usta Modu "MVP (onay bekliyor)" — §14.3'te onaya bağlı iş satırı
- [—] R-18 hamle bütçeleri product-lead'in; kod formülü (solver min + tampon, L-19) değişmedi
- [x] R-19 Albüm yok, kayıtta alan yok (§10.3, §11.1)
- [x] R-20 debug yalnız DEV, `harness`, `build:verify` (§12.2, §12.3)
- [x] R-21 Bölüm 4 geçit boy 2, W3 imzası `size = 1`, K-45/9 istisnasız (§8.3)
- [—] R-22 K-06 product-lead'in; TECH'te K-06 testi "panorama durumu oyun durumunu değiştirmez" (§12.4)
- [x] R-23 `ConsentService`, `AdsService`, `IapService` (sahte) + referans düşük cihaz (§10.7, §11.8)
- [—] R-24 EN adlandırma TECH'i etkilemez; paket kimliği nötr, firma adı `{company}` (§13)

## Proje sahibine sorular (TECH §16.3)

- O-1 Ölçekleme FIT mi EXPAND mı (R-06)? Kod ikisini de destekler; önerim EXPAND.
- O-2 K-34 Alttan Üste onayı (R-01)? Önerim kabul (Bölüm 3 çözülebilirliği buna bağlı).
- O-3 Faz 2 takvimi 4 → ≈ 6 hafta (toplam ≈ 21,5 hf, 22 hf içinde)? Önerim kabul; ya da §14.1 kesme seçeneği.
- O-4 Referans düşük + orta seviye Android cihazların Faz 2 başında alınması; iOS için macOS derleme ortamı (Faz 5)? Önerim kabul.

## Tutarlılık denetimi (tur 1)

- #0 [Engel] Öğretici şeması ↔ UX §13.1 / LEVELS Faz 2 → KAPANDI (TECH §8.2: `Highlight` regex'i UX §13.1 sözlüğünün tamamı — `piece:<i>`/`piece:k<p>_<i>`, `cell`, `gap`, `obstacle`, `booster:<hammer|crane|brush|undo>`, `pre:<thermos|trowel|shutter>`, `wall`, `crane`, `build`, `front`, `panorama`, `goals`, `moves`, `truck`, `streak`, `fan`; `done.event`'e `segmentDone`, `deliveryDone` ve `minMs` zorunlu `holdOverBuild` eklendi; her olayın kaynağı (çekirdek olayı / sahne sinyali) tabloya yazıldı; `textKey` `tut.ctx.*`'ı da kabul ediyor (LEVELS Bölüm 4 adım 2 `tut.ctx.support` da `schema_invalid` veriyordu); L-17 aynı sözlüğe ve varlık denetimine bağlandı, `tut_done_invalid` eklendi; şema scratchpad'de zod 4.6.5 ile LEVELS Bölüm 1–5 + 8 öğretici verisiyle geçti, 5 negatif örnek reddedildi). Not product-lead: GDD §14 tutorial satırı `textKey` için yalnızca `tut.l<bölüm>` yazıyor, LEVELS §0 `tut.ctx.{konu}`'yu da kullanıyor — GDD metni LEVELS'e eşitlenebilir; UX §13.2 Bölüm 11+ düzyazı tamam koşulları LEVELS'e `done` verisi olarak yazıldıkça TECH enum'u genişler (Faz 3).
- #1 [Önemli] Cam kırılınca Usta Serisi sıfırlanmıyor → KAPANDI (§5.1 madde 4, §6.2 adım 2 olaylarına `comboChanged` ve `combo = 0`, §7.2 S3 satırı; test "S3 glass break resets combo (K-33)"; §12.4 K-33 satırı).
- #2 [Önemli] Adım 10 zamanlayıcı sırası (W→Y→S `order`'ı Y4'ü S5/S6'dan önce çalıştırıyordu) → KAPANDI (§7.1 `moveEndOrder` alanı ve `SiteStrategy.onCarouselTick/onElevatorTick`; §7.3 tek `STEP10_TIMERS` listesi W4 → W5 → S5 → S6 → Y4 → K-40, `order`'dan bağımsız; §6.2 adım 10 ve §7.2 satırları; testler "K-35 step 10 timer order", "N8 timers advance in step-10 order").
- #3 [Önemli] G-L bekleyen hamle (`pending`) kapanma/Geri Al/güçlendirici/çıkışta tanımsız → KAPANDI (§4.7 "bekleyen hamle kuralı": yönlendirme dışındaki her girdi/olay — yeni tutma, Geri Al, güçlendirici yuvası, duraklatma/geri tuşu/çıkış menüsü, `visibilitychange: hidden`, `pagehide`, Capacitor `pause`, sahne değişimi — önce `flushPending()` ile yönlendirmesiz commit eder; §11.1 kayıt ve §1.4 akış buna bağlandı; testler "K-43 app killed during G-L fall keeps the released move", "K-39 undo during G-L fall reverts that move", "K-43 exit menu during first G-L fall sees m = 1"). Not product-lead: duraklatmanın G-L penceresini kapattığı (blok yönlendirmesiz iner) K-19 madde 1'e "yeni tutma" yanına yazılabilir; TECH bunu K-43 madde 1 ile çelişmeyen uygulama ayrıntısı olarak yazdı.
- #4 [Önemli] K-30 güvencesinde duvar saati bütçesi ve "bütçe dolunca yapıcı düzen kabul" → KAPANDI (§9.7 madde 4: 20 ms → belirlenimci açılım bütçesi `HELP_CHECK_MAX_EXPANSIONS = 32` (referans orta cihazda ≈ 20 ms, Faz 3'te kalibre, değişimi `rulesVersion`'ı artırır); bütçe sonuç bulmadan biterse GDD'ye uygun olarak D3 `reshape`'e yükseltme, yapıcı düzen yalnızca `reshape` çıktısında; testler "K-30 help guarantee deterministic under CPU throttling", "K-30 exhausted check escalates to reshape"; ek: §9.6 usta botunun 30 ms yerel araması da 2 000 açılımlık sayaca çevrildi). Not product-lead: GDD K-30'daki "20 ms bütçeli" ifadesi "≈ 20 ms'lik belirlenimci iş bütçeli" olarak netleştirilebilir (kural değişmez).
- #5 [Önemli] Şema zorunlu alanları/varsayılanları ve K-24/K-23/Y4 denetimleri → KAPANDI (§8.2: `elevator.start` ve `.dir` zorunlu; kepenk `phase` `_default` 0 (S-24), kayar kapı `dir` `_default` 1 (GDD §14); §8.3'e L-24 `elevator_range` (a < b, a ≤ start ≤ b), L-25 `carousel_every_missing` (carousel ⇒ zorunlu; segments'te yazılmışsa warn), L-26 `wet_moves_missing` (`wet` ⇔ `wetMoves`); her kod için `tests/level/invalid/` fikstürü; yükleme anı listesine eklendi; varsayılanlar scratchpad'de doğrulandı).
- #6 [Önemli] Solver hamle üretimi GDD hamle uzayını eksik üretiyor + YAO garantisi yok → KAPANDI (§9.3: bırakma yüksekliği aday boyutu — rüzgârda `d = 0` / `d ≥ 1` sınıfları (balonda tavan üstü dahil), G-L'de her `atRow` için ona izin veren en alçak bırakma; zamanlı mekanikli bölümlerde `Blockers` boşken de "bekleme" adayı; §9.5: maliyet `(hamle, −duvarÜstü)` tek tamsayıda `K = 128`, `h' = (K−1)·h` kabul edilebilir ve tutarlı, `g*` sonrası `f ≤ K·g*` tüketilip en yüksek `duvarÜstü / P` seçilir; testler "K-19 solver steers under overhang from higher release", "W8+S8 balloon at ceiling avoids drift", "K-46 max YAO among min-move solutions", "W4 solver waits for shutter with empty Blockers").
- #7 [Önemli] §4.1 ray başlangıcı, geçit açıklığı, çok kaynaklı başlangıç ve dilim kapısı → KAPANDI (ray kipinde başlangıç yalnızca moloz (S4, N14) ve yalnızca `canPassGap` true iken; Y8 yalnızca FREE (K-12); K-07 satır 1 çok kaynaklı başlangıçta "aynı hücre kümesi, kip başlangıç kiplerinden biri"; tutulabilirlik = başlangıçtan farklı hücre kümeli en az bir erişilebilir düğüm (K-09 (a) ile eşdeğer); tutma kapısına `seg == activeSeg / frontSeg`; 5 test adı). GDD/OBSTACLES değişikliği gerekmedi.
- #8 [Öneri] L-10 K-27 "henüz kullanılmamış" ve "solver çözümü üzerinde" koşulu → KAPANDI (L-10 birikimli: Σ_{j≤k} planHücre_j(c) ≤ Σ_{parti≤k} arz(c), carousel'de toplam; tam K-27 denetimi L-19'da solver çözümü çekirdekte oynatılarak, `material_short` `rule: 'K-27'`).
- #9 [Öneri] L-02 vida/anahtar `overlap`, parti k ≥ 1 `x`, L-13 "desteklenmiş" → KAPANDI (L-02 çakışma kümesi = parça + kasa + torba, vida/anahtar yalnızca L-14/L-23; L-12'ye parti k ≥ 1 için `0 ≤ x ≤ 6 − w`; L-13'ten "desteklenmiş" kaldırıldı — GDD K-45/7'de yok, OBSTACLES S4 "altı boşalsa da düşmez" ve GDD K-19 çıkıntı örneği desteksiz molozu varsayıyor).
- #10 [Öneri] Ek A Bölüm 4 etiketi, K-19/E-40 atfı, çıkıntı altı iddiası, histerezis → KAPANDI (Ek A "yalnızca biçim örneği, brif taslağı R-21 öncesi; güncel Bölüm 4 geçit boy 2"; §12.4 K-19 satırı "geçersiz girdi hak yakmaz (K-19 madde 4); yeni tutma pencereyi kapatır (E-40)"; §4.2 ve §15 R-2 GDD K-19 istisnasıyla (moloz/yapışmış harç altına doğru yerleşim mümkün) düzeltildi, test "K-19 correct placement under a debris overhang"; histerezis `≤` (eşitlik dahil, 1e-9 toleransı), test "K-08 hysteresis accepts exactly 0.2 improvement"; §8.2 başlığındaki "brif Bölüm 4 örneği geçti" iddiası `tutorial` alanı çıkarılarak ve yalnızca şema düzeyinde diye düzeltildi).
- #11 [Öneri] Kayıtta `attempts` yok, kazanma davranışı çelişkili → KAPANDI (§11.1 v1 içeriğine `levels[id] = { won, attempts }` (yeni denemede +1, devam artırmaz); kazanma tek davranış: ödüller kazanma anında, `inLevel` silmeyle aynı atomik yazımda; `outcomeWindow`'dan `'won'` kaldırıldı, kapanırsa açılışta ana ekran, ödül tekrar verilmez; test "K-43 app killed on win screen keeps rewards once"). Not design-lead: kazanma ekranı açılışta yeniden gösterilmiyor (UX §6'da bu durum tanımsızdı); istenirse salt gösterim için ayrı bir "son kazanç özeti" alanı eklenir, ödül mantığı değişmez.
- #13 [Öneri] Köprü tavanında altın düğmesinin "gizlendiğini" söyleyen test adı → KAPANDI (§11.3 metni "gizlenmez, gri, `lose.bridgeCap`" (UX §7) ve test "R-16 bridge coin option disabled (lose.bridgeCap) when runSpend + price > cap, ad option stays").
- #14 [Önemli] TECH'in tokens'ta olmayan yolları ve `check.*`'ı koddan okuması → KAPANDI (§2.2 `layout.grid.{cellPx,yardX,wallX,wallW,buildX,…}` ve `layout.board.{craneTopY,boardTopY,boardBottomY}`; §10.2 `layout.grid.cellPx`; plan bileşik/kontur ve sembol mürekkebi her zaman formülle (bileşik = `planUnderlay`·(1−a) + `color.block.X`·a, kontur = bileşik × `plan.strokeFactor`, mürekkep L* eşiğine göre `symbolDarkFactor` ya da beyaz `alpha.symbolWhite`); `check.*` yalnızca `tests/theme/tokens.test.ts`'te; `wallWidthCells` cümlesi silindi; scratchpad token yolu denetçisi TECH'te eksik yol bulmuyor).
- #15 [Önemli] FIT/EXPAND çapa sözleşmesi tokens `layout._doc` ve UX §0.1/§5.1 ile çelişiyordu → KAPANDI (§10.1 token gruplarına göre yeniden yazıldı: `top` üstten, `bottom` `y = H − bottomPx − h`, `board` (vinç alanı, tahta, durum şeridi) `y + (H − 1920) × expandShare`, `popup` ortalı; "eklerse" ve "dikey ortalanır" silindi; §2.2 değişmezlerine `top.groupBottomY + board.minGapTopPx ≤ board.craneTopY` ve `board.statusBottomY ≤ 1920 − bottom.groupTopFromBottomPx` eklendi; `steerZone` koordinatları kaydırmaya bağlandı).
- #16 [Önemli] Eski düşüş fiziği sayıları → KAPANDI (§4.7 ve §6.3'teki sayılar silindi, yalnızca token adları: `physics.fallNormalAccel/Max`, `fallHighAccel/Max`, `fallLowSpeed`, `balloonRiseSpeed`, `yardFallAccel/Max`).
- #18 [Önemli] Parlama hapı hücre sayısı ART §3 ile farklı → KAPANDI (§10.2b: parça başına tek hap, üstü ve solu açık hücreler arasından satırı en üstte, eşitlikte sütunu en solda olan; L örneği ve test "ART gloss pill once per piece at top-left open cell").
- #19 [Önemli] `audio.seq` biçimi TECH'te yoktu → KAPANDI (§11.6: `audio.seq.<ad>: [startMs, number[]][]` tek `AudioBuffer`'da toplanır, tepe > 1 ise normalize; ad çözümü önce `sfx` sonra `seq`, iki kümede aynı ad hata; eksik ad denetimi birleşime; `_doc` anahtarları ad sayılmaz; P-9 güncellendi; testler eklendi).
- #20 [Öneri] Katman sırası ve atlas listesinde R-01 katmanları ve tavan kirişi yok → KAPANDI (§10.3 sıra ART §4'e eşitlendi: ızgara → inşa cephesi konturu → bloklar → tavan kirişi → gölge (rozetler + eksik destek taraması) → sürüklenen blok; §10.2a atlasa `plan_front`, `plan_support_hatch`, `board_ceiling_beam` ve ↓ rozeti (`ghost_badge_support`) eklendi).
- #23 [Önemli] `AnalyticsEvent` birliği ANALYTICS §2 v1'den farklı → KAPANDI (§11.4 birlik tablodan birebir yeniden yazıldı: ad, parametre, tip, enum, `| null`; `level_resume`, `event_end` eklendi; `quitFree`, `level_resume_invalid`, `save_corrupt`, `resumed`, `offersUsed`, `truckHelps`, `booster_used.free`, `context` çıkarıldı; `CommonParams` §3; "Faz 4'te doldurulur" silindi; test iki yönlü tablo eşlemesi; §11.1'deki `track('save_corrupt')` / `track('level_resume_invalid')` yerel tanılama günlüğüne çevrildi; `AdsService` yerleşim tipi `ad_rewarded.placement` enum'u oldu). Öneri entrepreneur (tabloya eklenene kadar kodda yok): `save_corrupt`, `level_resume_invalid`, `level_end.exitFree: bool`, `level_end.truckHelps: int`. AÇIK SORU entrepreneur: Köprü bölümündeki +5 reklamı için `ad_rewarded.placement` değeri (tabloda `bridge_loss` reklam yerleşimi yok; TECH geçici olarak `out_of_moves` kullanıyor).
- Faz 2 takvimi (§14.1): öğretici denetleyicisi #12'de açıkça yazıldı, bekleyen hamle + `attempts` + analytics eşleme + `audio.seq` #13'te; net 24,5 → 25,25 g, tamponlu 29,5 g değişmedi (tampon 5 → 4,25 g). §17 P-6, P-7, P-9, P-12, P-16, P-17 satırları güncellendi.

## Tutarlılık denetimi (tur 2)

- #0 [Engel] K-34 `.` hücresi yanlış nesneyle koşulsuz "dolu" sayılıyordu (E-43 kilidi) → KAPANDI (TECH §5.2 madde 5: `wrongOcc[seg][c]` (moloz / yapışmış harç duran plan satırları) ve `dotFree = dotMask & ~wrongOcc`; `miss` ve `buildFront`'un `free` maskesi `dotMask` yerine `dotFree` kullanıyor, böylece yanlış nesneli `.` hücreleri `missingSupport`'a giriyor ve sütunda cephe kalmıyor; §5.1 `missingSupport` yorumu GDD K-34 kanca 2 ile aynı; §2.4 tampona `wrongOcc` (türetilmiş, karmaya girmez); §7.2 Y8 satırı; testler "E-43 dot cell with stuck mortar breaks support", "E-43 buildFront returns after stuck mortar is removed", "K-34 dot cell with debris is missing support"; eski test adı "K-34 empty dot cells count as filled" oldu; E-43 ve GDD Örnek 3 maskeleri elle doğrulandı).
- #1 [Önemli] K-30 D2 arzı ve yardım `B1` teslimatı GDD'ye uymuyordu → KAPANDI (TECH §9.7: D2 arzı = sahadaki + şantiyede yapışmış harçlı + kuyruktaki + teslim edilmemiş partilerdeki ağır olmayan `c` bloklar, moloz (boyanabilir moloz dahil) hiçbir terimde yok; `deliverExtra` yerine `deliverHelp`: `B1_0` `x = 5`, `dropColumns` yok, kuyruğun sonuna eklenip adım 12'de yalnız yardım `B1`'leri için bir kez K-25 aday sırasıyla (5, sonra 4, 3, 2 …) denenir, eski kuyruk adım 9'u bekler, `deliveryArrived` yayınlanmaz; D1 → D2 → D3 sırası ve en sonda tek güvence denetimi; güvence simülasyonunda birinci hamle adım 0–11 ile oynatılır, kalan `B1`'ler 1. hamlenin 9. adımında düşer; §6.2 adım 12 satırı, §6.3 `truckHelp` yorumu, L-19 "moloz olmayan" (+ yapışmış harç terimi); testler "E-44 debris is not supply for D2", "E-23 help B1 delivered in step 12 at x = 5", "K-30 D2 supply counts stuck mortar blocks", "K-30 help order D1 then D2 then D3 with one final guarantee check", "K-30 example help B1 land in step 12"). Not product-lead: "aynı adımda birden fazlası tutarsa" TECH'te ardışık değerlendirme olarak uygulandı (her denetim bir önceki yardımdan sonraki durumda; D3, D2 teslimatından sonra bakıldığı için eksik malzeme yüzünden gereksiz `reshape` olmaz). GDD başka bir okuma kastediyorsa K-30'a bir cümle yeter.
- #2 [Önemli] +5 kabulünden sonra adım 12 yok, reklam seçeneği 1. teklifle sınırlı değil → KAPANDI (TECH §6.1: `addMoves{source: 'offerCoins' | 'offerAd'}` sayacı 5 yapar, ardından K-35 adım 12 bir kez çalışır (`deadlockDetected`/`truckHelp`, `step: 12`), adım 0–11 çalışmaz, devamda aynı sonuç; §6.2 adım 12 satırı; §11.3: reklam seçeneği yalnız `n == rewardedAdOffer.offerIndex && !firstEverOffer` (+ `perAttempt`/`perDay`/`dailyCapTotal`), tek `canOfferAd` fonksiyonu; `config:validate` şemasında `outOfMoves.rewardedAdOffer.offerIndex` zorunlu `Int(1, 3)`; testler "E-42 offer acceptance runs step 12 once", "K-29 accepted offer sets moves to 5 without advancing timers", "K-29 ad option only in offer 1 and never in the lifetime-first offer"; §12.4 K-29 satırı).
- #3 [Önemli] Hamle hattı adım 4/5/10 GDD'nin son dört kuralını yansıtmıyordu → KAPANDI (adım 4: maliyet = taban (1; yapışmış harçta 2, `moveCost` = taban, birden çoksa en büyüğü) + cam cezası 1, toplanır → yapışmış harçlı cam 3; `movesChanged` `reason: 'move' | 'offer' | 'booster'` + `cost: { base, glass }` kırılımı; §5.1 madde 4 ve §7.2 S3/Y8 satırları; adım 5: komşuluk duvar sınırını aşmaz (tek `neighbors4` aynı bölge filtresi, adım 6 düşüş komşulukları da kullanır, E-46); `onCarouselTick`: bu hamlenin adım 8'inde ön dilim tamamlanıp döndüyse `t` artmaz (hamle içi `MoveScratch.rotatedAtStep8`, karmaya girmez); `onElevatorTick` ve W5: ortak `pingPong` — önce `pos + dir` aralık dışıysa `dir = −dir`, sonra `pos += dir`; testler "K-07 stuck glass mortar break cost", "E-46 no neighbor effect across the wall boundary", "K-23 carousel does not tick on the completion move", "K-24 start at bound facing out turns first", "W5 slider start at bound facing out turns first"; §12.4 K-07/K-23/K-24/K-35 satırları).
- #4 [Önemli] Geçersiz kalan denemede iade listesi eksikti → KAPANDI (TECH §11.1 `voidAttempt`: deneme yeniden oynatılmaz, hiç oynanmamış sayılır; iade: ayrılan can, `preBoosters`, `actions[]`'tan sayılan bölüm içi güçlendiriciler (`hammer`/`crane`/`paint`/`undo`; günlüğe yalnız uygulananlar yazılır), `offerSpendCoins` altını; Köprü'de deneme sayılmaz ve `runSpend −= offerSpendCoins` (E-45: 2.250 → 900); Usta Ligi puanı yok; seri bonusu ve seri korunur; reklam sayaçları ve ömür hediyesi geri verilmez; testler "E-45 invalidated attempt refunds life, boosters and offer coins and reduces bridge run spend", "K-43 rulesVersion mismatch is treated like level hash mismatch"). Not entrepreneur: GDD K-43/4 analytics `level_resume_invalid` diyor ama ANALYTICS §2 v1'de yok; `coin_source.reason` enum'unda iade değeri yok. Öneri: `level_resume_invalid` olayı ve `coin_source.reason = refund`. Tabloya eklenene kadar TECH yerel tanılama günlüğüne yazıyor.
- #5 [Önemli] L-06/L-07 renk kümesinde boya kapısı rengi yoktu → KAPANDI (L-06 kümesi = plan hücreleri (çözülmüş `?` dahil) ∪ bütün blokların renkleri (parti 0, partiler, moloz, şaşırtma ve dolgu) ∪ `wall.gaps[type = 'paint'].color`; L-07 aynı kümeyi kullanıyor; geçersiz fikstür "K-45/4 too_many_colors from paint gate color" (hikaye bölümü 3, plan + bloklar 5 renk, kapı 6. renk); §12.4 K-31 satırı).
- #6 [Önemli] Öğretici şeması `done.at` ve `debris:<i>`'yi reddediyordu → KAPANDI (TECH §8.2: `done` birleşimine `TutAtEvent` (`placementCorrect`, `yardMove`) + `at: tuple([Int(0,7), Int(0,7)])` üyesi, diğer olaylarda `at` şema hatası; regex'e `debris:\d{1,2}`; L-17'ye `debris:<i>` < `build.debris` boyu, `at` bölge uyumu (`yardMove` ⇒ x ≤ 5, `placementCorrect` ⇒ x ≥ 6) ve zorunlu adımda en az bir `piece:`; scratchpad'de zod 4.6.5 ile LEVELS Bölüm 1–10 öğretici verisi (Bölüm 7 `at: [0, 6]` dahil) + UX Bölüm 17 `debris:0` + `placementCorrect` `at` geçti (12/12), 9 negatif örnek reddedildi; eski şema Bölüm 7'yi ve `debris:0`'ı gerçekten reddediyordu (9/12)).
- #7 [Önemli] `overWall`/`gapPass` bırakmada sayılıyordu; `tut.ctx.*` adımı `seenContextTips` işaretlemiyordu; zorunlu adım kilit güvencesi yoktu → KAPANDI (TECH §8.2 tamam olayları tablosu GDD §14.1/3'ün üç sınıfıyla: `overWall` = sahne sinyali `dragCrossedWall` (izlenen yolda FREE → FREE kenarı sınırın şantiye tarafındaki hücre sayısını değiştirdiği ilk an), `gapPass` = `dragEnteredRail` (ilk `RAIL(g)` düğümü); sürükleme başına en çok 1, iptal edilse de sayılmış kalır, `pieceMoved.entry` ile karıştırılmaz; `TutorialController` kuralları: `tut.ctx.<konu>` adımı gösterildiği anda `seenContextTips.<konu>` işaretlenir (§5.2 kanca 4 paragrafı da güncellendi), Z adımı başlarken ve her hamle sonunda vurgulu `piece:` blokları K-09 + erişim kümesiyle olayı üretemiyorsa adım atlanır; testler "GDD 14.1 required tutorial step never locks", "GDD 14.1 ctx step marks seenContextTips", "tutorial overWall counts at first crossing even if drag is cancelled", "tutorial done.at counts only at anchor", "K-34 context tip suppressed after level 4 step 2 is shown"; §14.1 #12 +0,25 g, net 25,5 g, tamponlu 29,5 g sabit).
- #8 [Öneri] E aralığı E-41'de kalmıştı, §8.2'de eski not vardı → KAPANDI (§0 kaynak satırı "§14.1 öğretici kuralları, E-01…E-46"; §12.2 `test:rules` ve §12.4 E-01…E-46 + "GDD 14.1 …" test adları; E-42 (§6.1, §6.2, §9.7, §11.3), E-43 (§5.2), E-44 (§9.7), E-45 (§11.1), E-46 (§6.2 adım 5) test adları eklendi; §8.2'deki "GDD §14 tutorial satırı yalnızca `tut.l<bölüm>` yazıyor" notu silindi, yerine GDD §14.1 madde 1 atfı).

## Açık maddeler (F)

- F-2 → KAPANDI (TECH §8.3 L-17: Z adımının `highlight`'ında en az bir `piece:` **ya da** `debris:` (yoksa `tut_highlight_invalid`), `piece:` içermeyen Z adımında `done.event = placementCorrect` → `tut_done_invalid` (K-16 koşul 2), UX Bölüm 17 `debris:0` → `yardMove` geçerli; §8.2 tamam olayları: `yardMove` kaynağı `pieceMoved` + `to.zone = 'yard'` (`entry`'den bağımsız, şantiyeden sahaya moloz dahil), `placementCorrect` molozla hiç üretilmez, `gapPass` = yolun ilk FREE → `RAIL(g)` kenarı (ray kipinde başlayan molozun başlangıcı sayılmaz); `TutorialController`: `debris:<i>` → `CompiledLevel.tutorialPieceIds` (§2.3) ile `PieceId`, kilit güvencesi GDD §14.1/4b'ye eşit — `piece:` ve `debris:` blokları, `overWall` kenar tanımıyla (molozun başlangıcı şantiyede), `yardMove` K-07 satır 2 sınıflandırmasıyla; atlanan adım ANALYTICS §2 tablosundaki öğretici adımı kaydını tamamlanan adımla aynı üretir (yeni olay/parametre yok); testler "GDD 14.1 debris yardMove step completes when debris reaches yard", "GDD 14.1 required debris step skips when debris cannot reach yard", "tutorial gapPass not counted at debris rail start" + 2 geçersiz, 1 geçerli L-17 fikstürü; scratchpad'de L-17 Z kuralı 6/6 örnekte doğru). Not product-lead: ray kipinde başlayan molozun başlangıcının `gapPass` sayılmaması GDD §14.1/3 "ray kipine girdiği an" ifadesinin okumasıdır; farklıysa tek satır değişir.

## Son tutarlılık turu 1

- #0 [Önemli] `levels:solve` ✓-tuzağı taraması TECH'te yoktu, solver Kamyon Yardımı'nı kapatmıyordu → KAPANDI (TECH yeni §9.8 "✓-tuzağı (çıkmaz) taraması — `levels:solve --traps`": LEVELS §5 F-3 ölçütü; kapsam `E = kazı + 1` saha hamlesi (`SolveResult.digs`, `--trap-extra`); aşama 1 gevşetilmiş saha oyunu (gerçek oyunun üst kümesi: zincir/ıslaklık/kilit yok sayılır, boya dönüşü, moloz kaldırma, zamanlı bölümde "bekle"; bitmeyen durum kesin çıkmaz), aşama 2 budamasız kapsam araması + geri yayılımla "en kısa çözüm üzerindeki" durumlar, aşama 3 sınıflama: kesin çıkmaz, verimli oyuncu bütçe tuzağı, israf sonrası bütçe aşımı (kabul, sayılır), D1/D2'nin yakaladığı durumlar `caughtByHelp` (hata değil); belirlenimci açılım bütçesi `--trap-budget`, biterse `trap_scan_incomplete`; §8.3'e L-27 (`trap_dead_end`, `trap_budget` Kolay/Normal error, Zor/Çok Zor warn; `rule: 'K-30'`); sonuç `artifacts/solver/level_NNN.traps.json`, LEVEL_REPORT tablosunu `levels:bot` yazar (tek yazar); §12.2 `levels:solve --traps`, `levels:check` taramalı; 5 test (F-3 1–10 yeniden üretimi, Bölüm 5 eski verisi, D1/D2 ayrımı, gevşetilmiş kısa yol, bütçe bitişi). §6.1 `applyMove(…, opts?: { noTruckHelp })`, §9.1 solver/tarama/usta botu planlaması adım 12 kapalı, §9.2 "yok saydığı şeyler"e Kamyon Yardımı, §9.4 `M_c` gerekçesi, §9.7 güvence simülasyonu aynı seçenek ve `detectDeadlock(state, { d3 })` imzası; testler "K-30 solver ignores truck help", "K-30 solver solution never triggers step 12". Öneriden sapma: playtest botlarının **oynadığı** oyun adım 12 açık kalır (L-20 kazanma oranı ve LEVEL_REPORT "Kamyon Yardımı sayısı" gerçek oyunu ölçer); kapalı olan solver ve botun planlamasıdır. Takvim: tarama solver'la Faz 3'te, Faz 2'de Bölüm 1–5 için F-3 betik sonuçları geçerli; §14.2 +1 g).
- #1 [Önemli] E-47 TECH kapsamında ve test adlarında yoktu → KAPANDI (§0 kaynak satırı, §12.2 `test:rules`, §12.4 E-01…E-47; §4.7 testi "E-47 pause during first G-L fall commits move first; exit menu sees m = 1 (loss)" adıyla yeniden yazıldı, GDD K-19 madde 1 (d) / K-43 madde 1 atfı; §12.4 K-19 ve K-43 satırlarına E-47; E-47 G-L'ye bağlı olduğu için Faz 3'te zorunlu — `test:rules --phase` kuralıyla).
- #2 [Önemli] Solver hamle üretimi ek hedefleri (K-41/K-42), molozu (S4) ve W7 anahtarını hedeflemiyordu → KAPANDI (§9.3'e "hedef engelleyicileri": eksik `clear crate`/`clear chain` için canlı kasa ve zincirli bloğun 4-komşu tutulabilir parçaları (+ Y6'da altlarını boşaltanlar), şantiyedeki her tutulabilir molozun sahaya hamleleri, eksik `collect screw` ve kapalı `locked` geçidin anahtarı için örten parça/kasa (tutulamıyorsa koridor kuralı); yapı tamamken (E-27) yalnız bunlar + bekleme; `Blockers` koridor BFS'i kasa/torba/zincirli hücreyi +1 ile geçer ve yerine 4-komşu parçaları ekler; §9.4 `h = max(Σ⌈R_c/M_c⌉ + max(D, [yerleşim yok]), [ek hedef eksik])` — `D` şantiyedeki moloz; kabul edilebilirlik ve tutarlılık gerekçesi yazıldı (önerilen "[hedef eksik ∧ hedef ilerleten hamle yok]" yerine `max`: hedefi ilerleten hamle bir yerleştirme de olabildiği için toplam kabul edilebilir olmazdı); katmanlı aramada son katman hedefi `levelWon`, tohum sırasında ek hedef ilerlemesi; §9.6 orta bot aynı kümeyi kullanır; 6 test ("K-41 solver completes clear crate goal" Bölüm 12 fikstürü, zincir, vida, W7, S4, `h` kabul edilebilirlik/tutarlılık); §14.2 +0,5 g).
- #3 [Öneri] TECH içi doğrulayıcı ve faz kapsamı tutarsızlığı → KAPANDI (§12.2 `levels:validate` L-01…L-18, L-21…L-26; K-19 §12.4'te "2 (normal), 3 (G-H, G-L, cam)" + Faz 2 testi "K-19 normal gravity has no hold limit and no steering"; K-45/9 (L-16, L-22) tek fazda: §14.1 "K-45 (madde 1–7 ve 9)", §12.4 "2 (madde 1–7, 9), 3 (8)", §14.2 "Doğrulayıcı kalanları (K-45/8: L-19, L-20)"; ek: `test:rules --phase N` tanımı (K-xx §12.4 F sütunundaki ilk faz, engeller OBSTACLES "İlk bölüm", E-xx/N-notları andıkları kimliklerle) — Faz 2'de `npm run check`'in Faz 3 kurallarında kırmızıya düşmemesi için).
- #4 [Önemli] TECH §11.4/§11.1 ANALYTICS §2 v1'e göreydi → KAPANDI (§11.4 tek kaynak "v2, 2026-10-05, F-1"; birliğe `save_corrupt{stage, recovered}`, `level_resume_invalid{level, movesMade, cause}`, `level_end.exitFree`/`truckHelps`, `AdPlacement` + `'bridge_loss'`, `coin_source.reason` + `'refund'`; "gönderilmez … öneriler" cümlesi silindi, eşlemeler v2 "Değer tanımları"na göre (`exitFree` = quit ∧ m = 0, `truckHelps` Geri Al'la düşer ve devamda yeniden sayılır, `bridge_loss` = Köprü 1. teklif reklamı); §11.1 kayıt kurtarma yazımından sonra `save_corrupt`, `voidAttempt` yazımından sonra `level_resume_invalid` ve `offerSpendCoins > 0` ise `coin_source{refund}` (ANALYTICS §3 sırası; `level_end`/`level_resume`/`life_lost`/`event_eliminated` yok); §11.8 `AdsService` Köprü yerleşimi `'bridge_loss'`, günlük sayaç `out_of_moves` ile ortak; testler "ANALYTICS save_corrupt sent once after recovery write", "K-43 level_resume_invalid then coin_source refund sent after void write", "R-15 bridge_loss ad shares the out_of_moves daily cap"; iki yönlü eşleme testi artık tabloyla aynı).
- #5 [Önemli] Paket kimliği kuralı D-067 ile çelişiyordu → KAPANDI (TECH §13: "isim kararından (D-068) sonra, ilk mağaza yüklemesinden (Faz 5 `npx cap init`) önce kesinleşir; biçim `com.<şirket>.<ad>` (NAMING §6.1 tablosu)", yalnız `[a-z0-9.]`, kids/little/minik yok; "ad adayından bağımsız ve nötr" kaldırıldı).
- #6 [Önemli] Faz 2 JUICE P0 listesinde #83–84 yoktu → KAPANDI (§14.1 kapsam "#1–13, 18, 19, 50–53, 55–58, 69–71, 83–84; JUICE §0 kural 12"; #11 `EventPlayer` kalemine #83 `duration.frontShift` ve #84 `duration.supportFlash` + `color.ghost.support` (tokens'ta doğrulandı); efor #11 içinde).
- Takvim: Faz 3 30,5 → 32 g net, 36,5 → 38,5 g tamponlu (≈ 7,7 hf); Faz 2–5 toplamı 92 g net / 109,5 g tamponlu ≈ 21,9 hf (önceki net toplam 89,5 Faz 2'nin 25,5 g'ına eşitlenmemişti; tamponlu toplam doğruydu) — BUSINESS §10'un 22 haftası içinde; §15 R-1, R-20 ve §17 P-11 güncellendi. Not orkestratör: D-061 metnindeki "107,5 g ≈ 21,5 hf" → "109,5 g ≈ 21,9 hf". Not product-lead (isteğe bağlı metin eşitlemesi): GDD K-43/4 "analytics olayı ANALYTICS §2'ye eklenirse `level_resume_invalid`" artık v2'de var; LEVELS §5 "Araç desteği code-lead'den istenir" ve GDD K-30 "solver denetimi" TECH §9.8 / L-27'ye bağlanabilir; LEVELS §0 "Faz 2–3'te aynı tarama" TECH'te Faz 3 (Faz 2'de F-3 betik sonuçları).

## Son tutarlılık turu 2

- #0 [Önemli] Öğretici `done` sözlüğü / `startOn` / kilit güvencesi GDD §14.1'e eşit değildi → KAPANDI (TECH §8.2: `TutEvent`/`TutAtEvent` yerine 16 üyeli `TutCond` ayrık birleşimi = GDD §14.1/3 kapalı sözlüğü (`turnEnd`, `landed`, `steered`, `obstacleHit`, `itemCollected`, `yardFall`, `carouselTurn` eklendi); süzgeçler olay başına `strictObject` üyesinde — `type` zorunlu (`obstacleHit`: crate/cement_bag/chain, `itemCollected`: screw/key), `flag` (`landed`, `deliveryDone`), `wind` (`landed`), `hidden` (`placementCorrect`), `painted` (`yardMove`), başka olayda `schema_invalid`; `startOn: z.optional(TutCond)` (`timeoutMs` yok); "Tamam olayları" tablosuna her olayın `GameEvent` karşılığı ve `step` süzgeci (ör. `landed` = adım 2 `pieceFell{release}`/şantiye `balloonRose`, aynı hamlede `glassBroke` yok; `hidden` = adım 3 `cellsRevealed`; `painted` = `drag.via`; `deliveryDone` = adım 9 `pieceFell{delivery}`, adım 12 yardımı sayılmaz), hamle sonu olayları hamle başına en çok 1; `tap` + `pre:` hedefinde `preLevelClosed` adımı bitirir (pencere zaten kapalıysa hemen); `TutorialController` `startOn` kuralı (bekleme, sayaç, gerçekleşmezse sonraki adımlar gösterilmez); kilit güvencesi GDD §14.1/4b'ye göre: `steered` için şantiyeye FREE bırakma yeter, `landed` `computeFall` ile O(1), `hidden`/`painted` süzgeçleri, diğer hamle sonu olayları `R`'deki her bırakmada tampon kopyasında `applyMove(…, { noTruckHelp: true })` simülasyonu (maliyet ≤ 1,3 ms tipik, ≤ 8 ms en kötü, oynatma sırasında dilimli); "Faz 3'te eklenir" cümlesi kaldırıldı; L-17'ye `done`/`startOn` olay ↔ bölüm içeriği denetimleri (`steered` ⇒ G-L, `yardFall` ⇒ Y6, `carouselTurn` ⇒ carousel, `type`/`flag`/`wind`/`hidden`/`painted` ⇒ ilgili engel/bayrak/fan/`?`/boya kapısı) ve `piece:k<p>_<i>` ⇒ `startOn.event = deliveryDone` + süzgeci sağlayan ilk teslim partisi (Bölüm 35); §6.4'te güçlendiricinin doğrudan etkisi `step: 1` olarak tanımlandı (öğretici sayımı adım 5–6'yı ayırır); §6.3 `pieceFell{release}` her FREE şantiye bırakmasında tam bir kez; 16 yeni test + 5 L-17 geçersiz / 1 geçerli fikstür; scratchpad'de zod 4.6.5 ile belgedeki §8.2 kod bloğu çalıştırıldı: LEVELS §2 adımları + §3 11–38'in 35 adımı (Bölüm 35 `startOn` dahil) geçti, 15 olumsuz örnek reddedildi; efor Faz 2 #3 +0,25 g, Faz 3 +0,5 g). Not product-lead: GDD `obstacleHit` "adım 5–6 komşu etkisi" dediği için Çekiç'in doğrudan kırdığı kasa/torba/zincir sayılmıyor (Bölüm 11/18/24 Y adımı Çekiç kullanılırsa açık kalır) ve hamle sonu olayları hamle başına 1 sayılıyor; farklı istenirse GDD'ye yazılır, TECH'te tek satır.
- #1 [Önemli] L-09 kayar kapı `a < b` ve aralık boyunca örtüşme denetimi yoktu → KAPANDI (TECH §8.3 L-09: `range = [a, b]` için `a < b`, `a ≤ y ≤ b`, `b + size ≤ height − 1` → `slider_range`; örtüşme kümesi kayar kapıda `a … b + size − 1` bütün hareket aralığı, diğer geçitlerde `y … y + size − 1`, iki kayar kapı da aralıklarıyla → `gap_overlap`; `a = b`'de §2.6 döngü uzunluğu 0 sorunu kapandı; fikstürler "K-45/3 slider_range a == b" ve "K-45/3 gap_overlap across slider range" OBSTACLES W5 örnekleriyle).
- #2 [Önemli] K-17 yapışmış harçlı cam istisnası ve `stuck`'ın kalkması TECH'te yoktu → KAPANDI (TECH §5.2: tek hedef fonksiyonu `returnTarget(state, pieceId, { skipStart })`; başlangıcı şantiyede olan kırılan cam 1. adımı atlar, 2. adımda `xs` başlangıç `x`'ine (6/7) uzaklıkla — ilk aday duvara en yakın sütun —, gerekirse 3. adım; `stuck` yaşam döngüsü: şantiyeden çıkınca (sürükleme, Vinç, kırılma dönüşü), doğru yerleşince (sürükleme, ray, Vinç, Boya Fırçası K-38) ya da Çekiç'te `false`, yanlış plan konumunda yeniden yapışır, plan dışı bırakmada 1. adım başlangıç durumuna döndürür; her değişimde `wrongOcc` + `buildFront` O(1); maliyet tabanı hamle başındaki durumdan `MoveScratch.wasStuck` — aksi hâlde adım 4'te `stuck` kalkmış olurdu ve OBSTACLES Y8 örneği 10 → 9 çıkardı; §5.1 madde 4, §6.2 adım 4, §7.2 S3 ve Y8 satırları bağlandı; testler "K-17 broken stuck glass mortar returns to yard column 5 and unsticks" (GDD örneği 10 → 7, (6,2) boş kalır), "Y8 stuck mortar dragged to yard costs 2 and unsticks", "Y8 stuck mortar dropped wrong in plan restucks at new cell").
- #3 [Öneri] §14.1 Faz 2 kapsamında K-31 yoktu → KAPANDI (§14.1 kapsam listesine "K-31 (renk sayısı ve açılmış renk; L-06/L-07, K-45/4)"; §12.4 F = 2 ile aynı).
- #4 [Öneri] §9.5 el çözümü golden'ları 1–10 diyordu → KAPANDI (§9.5 "Faz 2'de Bölüm 1–5, Faz 3'te 6–10 (bölüm JSON'ları ve W2, Y5, W3 eklentileri geldikçe)"; D-059 ve §14.1 #9 ile aynı; 6–10 efor §14.2 "Solver … golden'lar" kaleminde).
- #5 [Öneri] §4.7 / P-16 "yönlendirme dışındaki her girdi" pencereyi kapatıyordu → KAPANDI (§4.7: yalnız GDD K-19/1 (a)–(f) = (1)–(6) `flushPending` çağırır, başka çağıran yok; panorama (K-06), hedef paneli, hamle sayacı gibi tahta dışı dokunuşlar `pending`'e dokunmaz, yönlendirme hakkı korunur; P-16 aynı; test "K-19 panorama tap during G-L fall keeps steer window").
- #6 [Öneri] §4.5 90 hücre ve §2.4 tampon tahmini eskiydi → KAPANDI (§4.5 "80 hücre (8×10 kenar modeli)"; §2.4 sabit satırlar 538 alan + değişkenler ≈ 550–600 alan ≈ 2,2–2,4 KB; `buf.slice()` ≈ 2,2–2,4 KB, Geri Al 50 × 2,4 KB ≈ 120 KB).
- #7 [Önemli] TECH §11.4 ANALYTICS v2'de kalmıştı → KAPANDI (ANALYTICS artık v4 olduğu için v4'e eşitlendi: `Mode` += `'replay'` (v4), `OfferKind` += `'daily_double'`, `OfferPlacement` `'daily'` → `'daily_double'`, `level_load_failed { level, stage: 'schema'|'logic', code: string|null }`, `cutscene_missing { scene }`, `star_spent.task` yorumu `ch{n}_t{m}`; eşleme paragrafına `mode`/`masterMode.variant`, günlük ×2, `star_spent`, `level_load_failed` (zod → `schema`/`null`, L-02…L-26 yükleme denetimi → `logic`/ilk `Issue.code`), `cutscene_missing` tanımları; §8.3 yükleme reddinde olay + Ana ekran; §11.1 ve §11.8 "v2" atıfları v4; §11.8'e günlük ×2 reklam yerleşimi (`dailyReward.rewardedAdDoublesCoins.perDay`); 4 test; scratchpad'de birlik ↔ tablo iki yönlü olay ve parametre karşılaştırması 0 fark).
- #8 [Önemli] D-024 `bridge_share_cap` denetimi TECH'te yoktu → KAPANDI (§11.3: `config:validate` kuralı — temel + her `liveOps.overrides.wobblyBridge` birleşimi, hikaye `L_0` 15–50 ve Usta Modu başlangıçları 11–50 (pencere 50 → 11 sarar), özgün zorluk etiketleri; `q` parça parça tek terimli integrandın kesin integrali (kırpma dahil), kesin binom, `E + finisherExtras.coins < offerCosts[0]`, boosters sayılmaz; hata + havuz tavanı bilgisi; bot modülü çağrılmaz; §12.2 `config:validate` satırı ve `tests/config/validate.test.ts`; 6 test ("META 6.2 bridge_share_cap rejects 10000 pool" dahil); scratchpad'de META §6.2 değerleri yeniden üretildi: 6.500 → en kötü 852,2 (`L_0` 49), 6.863 → 899,5 geçer, 6.864 → 900,05 hata, 10.000 → 1.311,5 ve 18 hikaye başlangıcı bozuk; §14.3 Faz 4 +0,25 g).
- Takvim: Faz 2 25,5 → 25,75 g net (tamponlu 29,5 sabit, tampon 3,75), Faz 3 32 → 32,5 net / 39 tamponlu, Faz 4 19,5 → 19,75 net / 23,5 tamponlu (tampon 3,75); Faz 2–5 93 g net / 110 g tamponlu ≈ 22,0 hf — BUSINESS §10'un 22 haftasına sığar ama pay kalmadı. Not orkestratör: D-061 metni "107,5 g ≈ 21,5 hf" → "110 g ≈ 22,0 hf".

## Son tutarlılık turu 3

- #0 [Önemli] `test:rules --phase` N-notlarını ve E-22'yi Faz 2'de zorunlu kılıyordu → KAPANDI (TECH §12.2: N-notları fazını OBSTACLES etkileşim matrisinden alır — hücre fazı = iki engelin büyüğü, not fazı = hücrelerin en küçüğü, andığı K-xx'ten küçük olamaz; Faz 2 hücreleri W1×S1 `·`, W1×S2 N10 `[not]`, S1×S2 `·` olduğundan 38 `[kural]` notunun hepsi Faz 3 (betikle doğrulandı; eski kural 31'ini Faz 2'ye düşürüyordu); E-xx satırı Sallanan Köprü/Usta Ligi'ni anıyorsa ya da "Kurallar"ı `META` içeriyorsa Faz 4 → E-22, E-45 Faz 4; `--phase 2` E kümesi E-01, E-03, E-06, E-21, E-27, E-28, E-30, E-34, E-38; §12.4 K-29 F "2, 4 (Köprü tavanı, E-22)", K-43 F "…, 4 (E-45)"; §14.1 çıkış ölçütü buna göre; test "test:rules phase 2 requires no N-note and no bridge E row"). Not: E-27 kural gereği Faz 2'de kalır; K-07 satır 5 zaten Faz 2'de (kapalı şantiye `clear` hedefli veriyle, Y1 eklentisi gerekmeden kurulabilir).
- #1 [Önemli] L-04 ağır şekil eşiği "8. bölümden itibaren" yoktu → KAPANDI (TECH §3.2 ve L-04: tür açılışı hikaye bölümüne göre, `heavy` şekiller (I5, Q9, w ≥ 3 yönelimler) yalnız `id ≥ 8`, ikisi de `shape_locked`; geçersiz fikstür "K-44 Q9 in level 7 shape_locked", geçerli fikstür "K-44 Q9 in level 8 valid" (LEVELS Bölüm 8 `Q9_0` (3,5)); §12.4 K-44 satırı).
- #2 [Önemli] G-L yönlendirme koşulu yalnız `atRow` satırına bakıyordu → KAPANDI (TECH §4.7 ve §5.1 madde 3: "çapası `atRow` satırında olan kaymış konumun **bütün** hücreleri x = 6–7 içinde ve boşsa", GDD K-19 madde 3 ile aynı; test "K-19 G-L steer of 1×2 piece blocked by occupied upper cell" — `D2_0`, (7,3) boş, (7,4) moloz, `atRow = 3` → kayma yok, hak korunur).
- #3 [Önemli] `blockedByWallHeight` sütun boyuna bakıyordu, `S4_0`/`Z4_0` için olay çıkmıyordu → KAPANDI (TECH §4.4: koşul bloğun kutu yüksekliği `h > 10 − wall.height` (eşdeğer: `R`'de sınırı FREE geçen düğüm yok ve `h > 10 − height`) + gerekçe (alt hücresi `y = 0` olan sütun çapa ≥ height, tahtada kalma çapa ≤ 10 − h ister; eski formül `L4_0` için de olay üretmiyordu); test "K-05 S4_0 at height 8 emits blockedByWallHeight" (+ `Z4_0`, `L4_0`; `D2_0`/`O4_0` olay yok)).
- #4 [Öneri] §1.4 akış özeti "yönlendirme dışı ilk girdi/olayda" diyordu → KAPANDI (TECH §1.4: "GDD K-19 madde 1 (a)–(f) olaylarından birinde `flushPending` (§4.7 kapalı liste; panorama, hedef paneli vb. pencereyi kapatmaz)").
- #5 [Öneri] L-17 güçlendirici açılışı K-44'e atıflıydı → KAPANDI (TECH L-17: "META §4, `economy.json → boosters.<ad>.unlockLevel ≤ id`"; vurgu adı → anahtar eşlemesi eklendi: `brush` → `paintBrush`, `trowel` → `trowelStart`, `shutter` → `openShutter`, diğerleri aynı; değerler economy.json'da doğrulandı).
- #6 [Öneri] Ek A'da `b` hem torba hem B renkli blok → KAPANDI (TECH Ek A: torba `%` (renk kodu olmayan karakter), örnek tahta güncellendi; `--ids` kipinde base36 kimlikler kasa `1`–`3` ile karışmasın diye kasa/torba ayrı `obstacles:` satırında; `fromAscii` iki kipi okur; test "ascii bag and blue block round-trip").
- #7 [Öneri] R-19 hâlâ `powFixed` diyordu → KAPANDI (TECH §15 R-19: "lig eğrisi `curveTable` tamsayı tablo + doğrusal ara değer (`Math.pow` yok; §11.2, S-35)").
- #8 [Öneri] §8.2 başlığı 11–38 eşlemesine 35 adım diyordu → KAPANDI (şema denemesi yeniden çalıştırıldı: belgedeki §8.2 kod bloğu ve LEVELS §2 (22 adım) + §3 tablosu (30 adım, Bölüm 35 `startOn` dahil) betikle okunarak zod 4.6.5 ile 52/52 geçti, 15/15 olumsuz örnek reddedildi; başlık "30 adım" ve tur 3 sonucuyla güncellendi).
- #9 [Önemli] §10.1 pencereleri dikey ortalıyordu → KAPANDI (TECH §10.1: `layout.popup.*` alttan çapa — panel alt kenarı `y = H − panelBottomPx`, seçenekler `optionsBottomInsetPx` yukarıdan alttan üste, dikey ortalama yok, EXPAND'de tabanla iner; `tests/theme/layout.test.ts` tokens `_doc` değişmezi `1920 − 296 − 64 − 3·152 − 2·24 = 1056 ≥ 1056` (sınırda) ve "UX 0.1 popup options anchored to bottom, never vertically centered").
- #10 [Önemli] G-L kaydırma eşiği UX/tokens'tan farklıydı → KAPANDI (TECH §4.7: kaydırma = `|dx| ≥ tokens.drag.steerSwipeMinPx` (48) ve `|dx| > |dy|`, yön `sign(dx)`; `startThresholdPx` ile bu koşul arasındaki hareket ne dokunuş ne yönlendirme, hak harcanmaz; test "K-19 G-L swipe below steerSwipeMinPx or mostly vertical does not steer").
- #11 [Önemli] §14 JUICE kapsamı eski listeyle sayılıyordu → KAPANDI (TECH §14.1 kapsam ve #11 `EventPlayer`: JUICE §0 kural 12 ile birebir 36 olay (+#15–17, #20, #22, #23, #87, #88); #11 4,5 → 5 g; Faz 2 net 25,75 → 26,25 g, tamponlu 29,5 g sabit (tampon 3,75 → 3,25 g ≈ %12); §14.3 Faz 5 "JUICE tamamlama (92 olay; Faz 2 P0'daki 36 olay dışında kalan 56 olay … + azaltılmış varyantlar)"; Faz 2–5 93 → 93,5 g net, 110 g tamponlu ≈ 22,0 hf değişmez; §15 R-20 güncellendi). Not proje sahibi/entrepreneur: Faz 2 tamponu %20 hedefinin altında (%12); 22 hafta sınırı korunduğu için tamponlu süre artırılmadı.
- #12 [Öneri] Parmak ofseti süresi 80 ms yazılmıştı → KAPANDI (TECH §4.4: "`tokens.duration.fingerOffset` (90 ms; kaldırma ölçeği ayrı, `duration.pick`) içinde 1,2 hücre yukarı süzülür").
- #13 [Öneri] §14.1 kesme seçeneği "4 haftada kalmak zorundaysa … 28 g" tutarsızdı → KAPANDI (TECH tarafı) (TECH §14.1: "Takvimi kısaltmak gerekirse … Faz 4'e alınabilir (−1 g net → 28,5 g tamponlu ≈ 5,7 hf; 4 haftaya inmez …)"; tampon sabit tutulduğu için #11'deki +0,5 g net bu sayıyı değiştirmez) | AÇIK SORU (entrepreneur: BUSINESS §10 satır 573–574 "Faz 2 28 g tamponlu ≈ 5,6 hf" → "28,5 g tamponlu ≈ 5,7 hf; 4 haftaya inmez", satır 580 "25,5 g net" → "26,25 g net", "%20 tampon ≈ 4 g" → "tampon 3,25 g").

## Senkron geçişi (2026-10-06)

- code-lead-K1 TECH §11.4 analytics birliği ↔ ANALYTICS §2 (güncel v5) → KAPANDI (tek kaynak satırı v5; `store_open.source` = `'nav' | 'coin_plus' | 'piggy' | 'out_of_moves' | 'bridge_loss' | 'lives_zero' | 'booster_plus'` + UX girişi → değer eşlemesi; `OfferKind`/`OfferPlacement` `daily_double`, `Mode` `replay`, `star_spent.task` `ch{n}_t{m}`, `level_load_failed`, `cutscene_missing`, `level_resume_invalid`, `save_corrupt`, `refund`, `exitFree`/`truckHelps` zaten tablodaydı; §11.1 "olay değil / göndermez" cümleleri ve §11.8 `'bridge_loss'` yorumu zaten güncel, sürüm atıfları v5; scratchpad'de tablo ↔ birlik iki yönlü karşılaştırma: 28 olay, 0 fark (mutasyon denemesi farkı yakaladı))
- code-lead-K2 TECH §10.3 Albüm satırı ↔ D-028 → KAPANDI (Albüm "Sonra", kilitli "Yakında" sekmesi; yapı kartı yalnız `story.ch1.end` Panel 4 (`cut_ch1_end_p4`) ve yalnız gösterilir; diğer bitiş sahneleri STORY §4 son panelleriyle kapanır, UX §8)
- code-lead-K3 TECH §11.1 `voidAttempt` bildirimi ve kaydı → KAPANDI (aynı atomik yazımda `voidNotice = { level, refunds: { life, boosters, coins }, bridge }`; ana ekranda her şeyden önce `resume.void`, "Tamam"la silinir, kapanırsa yeniden gelir, iade tekrarlanmaz; GDD K-43/4 yerel tanılama kaydı `{ levelId, cause, movesMade }`; analytics sırası değişmedi; kayıt içeriği listesine `voidNotice`; test "K-43 void notice shown once on home and survives restart without second refund")
- code-lead-K4 TECH pencere çapası ve yeni tokenlar → KAPANDI (`layout.popup.*` alttan çapa son tur 3 #9'da yapılmıştı, `panelBottomPx` 296 ve `_doc` değişmezi 1056 tokens'la yeniden doğrulandı; §10.1 `layout.board` grubuna `siteRibbonY` (tahtayla kayar) ve H'den bağımsız `siteRibbon{X,W,H,TiltDeg,NotchPx}`; §10.3 "Yapı tamam!" kurdelesi: `ui_site_ribbon`, `build.done`, JUICE #89 `duration.siteClosedRibbon` + 3 × `duration.goalNudge`)
- code-lead-K5 TECH §11.5 i18n anahtar listesi → KAPANDI (eklenen / kaldırılan / değişen anahtarlar listelendi: `tut.l23.light`, `build.done`, `replay.*`, `bridge.rule_card.extra/.daily`, `bridge.extra.got`, `bridge.dailyLimit`, `league.points_line`, `league.bonus.*`, `difficulty.*`, `league.rule_card.lines.both/.bronze/.diamond`, `league.header_lines.*`, `town.name`; `league.rule_card.lines` yaprağı ve `lose.offer` → `lose.offer.moves` kaldırıldı; "yaprak hem düğüm olamaz" kuralı + test; `t()` `{town}` = `t('town.name')` ve `{company}` (NAMING §5.2) küresel yer tutucuları + test)
- code-lead-K6 TECH §14.1 JUICE Faz 2 P0 → KAPANDI (JUICE §0 kural 12 yeniden okundu, liste değişmemiş: #1–13, 15–20, 22, 23, 50–53, 55–58, 69–71, 83–84, 87, 88 = 36 olay; kapsam satırı ve #11 zaten aynıydı; #13 ses kalemine liste ve `sfx_streak_pip`, `sfx_trowel`, `sfx_clamp` (`audio.sfx`), `sfx_gap_rail` (`audio.seq`) yazıldı; P0 satırlarındaki bütün ses adları tokens'ta betikle bulundu (0 eksik); yeniden tahmin gerekmedi: Faz 2 26,25 g net / 29,5 g tamponlu, Faz 2–5 93,5 g net / 110 g ≈ 22,0 hf)
- code-lead-K7 Çekiç doğrudan vuruşu ↔ `obstacleHit`, `gapPass` okuması → KAPANDI (GDD §14.1/3 bu geçişte değişti, ona eşitlendi: `obstacleHit` = adım 5–6 komşu etkisi ya da Çekiç'in `step: 1` vuruşu (Vinç, boya, mala `step: 1` sayılmaz); "hamle" = sürükleme ya da güçlendirici kullanımı, en çok 1 sayım; §6.4 cümlesi, §8.2 paragraf + tablo satırı, test adları "tutorial obstacleHit counts step 5-6 events and hammer direct hit", "… once per move or booster use"; `gapPass` = ilk FREE → `RAIL(g)` kenarı, ray kipinde başlayan moloz sahaya çıkıp yeniden girerse sayılır; GDD K-17 plan dışı bırakılan yapışmış harç örneği TECH §5.2 ile zaten aynıydı, testi eklendi (10 → 8))
- code-lead-R1 design-lead son tur 1 bağımlılığı: mevcut anahtarlarda config yer tutucuları (`{n}`, `{max}`, `{up}`/`{down}`, `{easy}`…`{superhard}`, `{extras}`) → KAPANDI (TECH §11.5: değeri çağıran STORY §7 "Sayılar config'ten" eşlemesine göre verir, metinde sabit sayı yok, D-017)
- code-lead-R2 design-lead son tur 2–3 i18n anahtarları (`resume.void.*`, `common.ok`, `common.minutes`, `common.unlockAt`, `bridge.play`; `bridge.rule_card.continue` `+{n}`; `shop.covers`, `piggy.threshold`) → KAPANDI (TECH §11.5 listesinde)
- code-lead-R3 design-lead son tur 3: `icon_life_unlimited` → KAPANDI (TECH §11.3 Can: sınırsız can süresinde kalbin yerine `icon_life_unlimited` + `common.minutes`; ∞ glifi yazılmaz)
- code-lead-R4 design-lead son tur 1: devam açılışında `outcomeWindow` → doğrudan Pencere 1 → KAPANDI (TECH §11.1: Duraklat açılmaz, UX §7 Pencere 1 aynı teklif numarasıyla `n = offersUsed + 1`)
- code-lead-R5 design-lead son tur 1: kazanma ekranında kapanmada bekleyen sandık penceresi işareti → KAPANDI (TECH §11.1: kazanma yazımında `pendingChest` (`'level' | 'master'`), pencere açılınca silinir, açılmadan kapanmışsa ana ekranda bir kez; test)
- code-lead-R6 design-lead son tur 1: `siteClosed` iptalinde JUICE #90 → KAPANDI (TECH §10.3: `moveCancelled{reason: 'siteClosed'}` → #8 dönüşü + kurdele sallanması + 1 × `goalNudge`; JUICE #89–90 P0 dışında, Faz 5 "JUICE tamamlama" kaleminde; durum ilk kez Bölüm 12'de)
- code-lead-R7 design-lead son tur 3: `npm run perf` 8,2 s + 1,8 s payı → KAPANDI (TECH §10.7 FTUE kapısı UX §2.1 bütçesiyle; kapı ≤ 10 s değişmedi)
- code-lead-R8 product-lead son tur 2 #2 bilgi notu: §8.2 "varsayılanı olan yalnızca iki alan" cümlesi `debris[].segment`'i anmıyordu → KAPANDI (TECH §8.2: `segment` `z.optional`, verilmezse derlemede 0)
- code-lead-R9 entrepreneur Açık maddeler F-1 (§11.1 "analytics olayı değil / göndermez" cümleleri, §11.8 Köprü reklam yorumu) → ZATEN YAPILMIŞ (son tur 1 #4; bu geçişte yalnız sürüm atfı v5)

## Faz 2 tur 1

Kaynaklar: `design-lead-phase2.md` tur 1 (ekran incelemesi, #0–#10), product-lead oyun testi (#11–#13), perf/kod
incelemesi (#14–#20), kural incelemesi (#21–#22). Her bulgu önce kodda / ekranda doğrulandı. Aynı kusurun iki raporu
birlikte kapandı (#11 = #14, #19 = #21, #20 = #22). product-lead'in Bölüm 3–4 öğretici veri değişikliği alındı: hazır
test yaması (`scratchpad/tut2/proposed-tests.diff`) uygulandı ve #12 girdi kapısına uyarlandı (sıra-bağımsızlık testi
artık Z adımında vurgusuz blok oynatan, gerçek oyunda oynanamayan sıraları atlıyor).

- #0 [Engel] rayda kontur/rozet sürüklenen bloğun altında → KAPANDI. Doğrulandı (`fallShadow` 70 < `draggedBlock` 90,
  rayda kontur bloğun tam yerinde). `ShadowView`: `look.body === false` iken kontur, rozet ve 45° tarama
  `DEPTH.draggedBlock` + 2…4'te; her karede `PieceView.drawn` (çizilen merkez + kaldırma ölçeği 1,08 / azaltılmışta
  1,03) ile `follow`; rozet sağ üst hücrede. Test "K-12 / K-18 rail look draws outline and badge above the dragged
  block and follows its lift scale" (`tests/scenes/shadowView.test.ts`, sahte sahne).
- #1 [Önemli] 45° tarama yok → KAPANDI (öneriden sapmayla). Çekirdeğe `Verdict.wrongCells` alanı yerine saf
  `reasonCells(state, pieceId, cells, reason)` eklendi (`core/placement.ts`): `Verdict` olaylarda, golden ve 80+ test
  fikstüründe birebir karşılaştırılıyor; ayrı fonksiyon aynı bilgiyi şekli bozmadan verir. `ShadowLook.mismatchCells`
  (birincil neden `debris`/`outside`/`window`/`color`, yalnız `wrong` ton = Kolay/Normal) → `ghost_hatch45` (açılış
  atlası; `color.ghost.invalid`, destek taramasıyla aynı 6 px / 20 px / `alpha.supportHatch`), 2 Hz nabız. Testler
  "K-34 hook 2 reasonCells names the cells behind each verdict reason …", "UX 5.4 wrong colour: the 45° hatch …".
- #2 [Önemli] düşüş yolu yok → KAPANDI. `ghost_path` (6 px, 8/12 kesik, beyaz; alfa %35 sahnede), her dolu sütunda
  bloğun alt kenarından gölgenin üst kenarına kırpılır, `DEPTH.fallShadow`; rayda ve iptal öngörüsünde gizli. Şerit
  8 satır (960 px) çünkü 1024'lük sayfa sınırı (TECH §10.2 küçük cihaz) 10 satıra izin vermiyor; daha uzun boşlukta
  gölgeye bağlı son 960 px görünür. Test "K-18 a free fall … one fall path per column".
- #3 [Önemli] Dede balonu HUD'u örtüyor → KAPANDI. `bubbleCandidates`: (1) HUD altı ile vinç alanı arası bant (sığarsa,
  ortalı; 390×844'te 216 px, 360×800'de 248 px), (2) vinç bandı, (3) durum şeridi üstü, (4) üst kenar en son;
  `bubbleSpot` duraklat/hedefler/hamle dikdörtgenlerini ceza alanı sayar (delik 4 kat ağır). Balon artık HUD altına
  indiği için UX §13.1 genişliğini (760) kullanır. Test "UX 13.1 the Dede bubble goes under the HUD first …".
- #4 [Önemli] spot deliği bloğu izlemiyor → KAPANDI. `TutorialOverlay` vurgu dikdörtgenlerini her karede hesaplar
  (birkaç dikdörtgen, çizim yok) ve değişince yeniden kurar: hamle işlenip tahta durunca yeni yerinde; sürükleme
  ortasında açılan adımda (Bölüm 1 adım 2) delik bloğun o anki sürükleme düğümünde (ray dahil) kurulur ve o sürükleme
  boyunca düğüm değişiminde yeniden kurulmaz (önerideki gibi; ilk denemede her düğüm değişiminde kurmak 4×'te > 50 ms
  kare üretti), bırakınca yeni yerine geçer. Spot kenarı ve yuvarlak koyu köşeler artık önceden çizilmiş parçalardan
  (`spotPieces.ts`): yeniden kurulum doku yüklemez; balon metni yalnız değişince yeniden çizilir. Yeniden kurulumda
  kaybolmuş eldiven geri gelmez. Test "UX 13.1 a piece: hole sits on the dragged block …".
- #5 [Önemli] "KAZANDIN!" yok → KAPANDI (birinci seçenek). Kazanmada başlık gizlenmez; `EventPlayer.showBanner`
  #55 başlığını son pozunda tutar (#55 hiç oynamamış K-43 devamında da çıkar); kayıp pencereleri gizlemeye devam eder.
- #6 [Önemli] kazanma paneli tahtayı ve Usta Serisi'ni örtüyor → KAPANDI. `winPanelLayout`: panel durum şeridi altı
  (+16) ile düğme üstü (−8) arasındaki bantta ortalı; satır adımı 60 → en az 44, iç pay 20 → en az 8 (390×844'te
  bant 185 px: 1 satır 172, 2 satır 184 px). Önerilen +24/+24 boşlukla 390'da iki satır sığmıyordu (161 px). FIT
  (H 1920) bant yok → eski yerleşim. Testler `tests/ui/winPanel.test.ts`.
- #7 [Önemli] devam şeridi karartmanın altında → KAPANDI. Şerit `DEPTH.windows` + 5'te krem hap (`ui.panel`,
  `radius.chip`, h 96, yan pay 32, alt gölge) + `ui.ink` yazı, vinç bandında. Kontrast testi (≥ 4,5:1).
- #8 [Önemli] kalp kalkan gibi → KAPANDI. `heartSpans` her lobun kendi aralığını + sivri ucu ayrı verir (çakışanlar
  birleşir); tepe çentiği 0,25 d. Test "UX 7 icon_life: two separate lobes …, a centre notch at least 0.12 d deep".
  ART §9 beyaz yıldız çıkartması (Öneri) yapılmadı.
- #9 [Önemli] kamyon çipi 2,1:1 → KAPANDI. Yazı `ui.ink` (turuncu üstünde 6,5:1). Kontrast testi.
- #10 [Önemli] inceleme kapsamı eksik → KAPANDI. (a) `--cvd protanopia,deuteranopia,tritanopia|all` (harness `&cvd=`
  → `#game` üstünde SVG `feColorMatrix`, Machado 2009, doğrusal RGB) → `artifacts/screens/<profil>-<cvd>/`;
  (b) `19-palette` harness fikstür sahnesi (8 renk × blok / plan / cephe varyantı + `plan_front`, `.`, `?`);
  (c) `01a/01b/01c-intro` harness `introPanel(n)` ile (duvar saati yok); (d) `20-home-l2`, `21-home-more-soon`,
  `22-pause`, `23-cancel-preview` (yeni `cancel` sürükleme türü), `24-bounce-support`, `25-trowel-pick` (yeni `trowel`
  dokunma hedefi). TECH §12.2 `screens` satırı güncellendi.
- #11 / #14 [Engel] çıkış onayında "Kal" ve × çalışmıyor → KAPANDI. Doğrulandı (`openPause` `windows.open !== null`
  iken dönüyordu). `openPause(resume, fromExit)`: çıkış penceresinden dönüşe izin verir; "Kal" ve × aynı yol (Android
  geri tuşu Faz 5'te aynı `onStay`'e bağlanır). Duman testi "UX 12 exit confirm: "Kal" and × return to the Pause window,
  then the level plays on" (can sayısı değişmez); harness × hedefi.
- #12 [Önemli] Z adımında vurgusuz blok tutuluyor ve adımı bitiriyor → KAPANDI. `TutorialController.allowsPick`
  (Z adımı vurgulu blok içeriyorsa yalnız onlar) → `DragController` `mayPick` kapısı (tepkisiz red); Z adımında
  `overWall`/`gapPass`/`holdOverBuild` yalnız vurgulu bloğun sürüklemesinde sayılır. Birleşen delik görsel kaldı.
  Test "GDD 14.1 required step ignores non-highlighted block (level 1 piece 3, level 3 piece 9)".
- #13 [Önemli] bağlamsal satır bağlamsız anda çıkıyor → KAPANDI (öneriden sapmayla). "Yumuşak adımda adımın yerine
  geçici göster" kısmı uygulanmadı: product-lead'in bu turda yazdığı GDD K-34 kanca 4 ve LEVELS §0 metni "bağlamsal
  satır öğretici adımı ekrandayken gösterilmez; kuyrukta bekler, adım aynı satırı gösterince ya da bölüm bitince
  düşer" diyor (kural sahibi). Uygulanan: kuyruktaki satır gösterilebileceği anda tetiği hâlâ geçerli değilse
  (kamyon kuyruğu boş, seri sıfır, mala yok, ya da anlık tetikten sonra yeni eylem) işaretlenmeden düşer ve sonraki
  gerçekleşmede yeniden tetiklenir — golden-L5'teki "kuyruk boşaldıktan sonra queue satırı" ve "4. doğrudan sonra
  streak" durumları artık çıkmaz. Önerilen test adı ("… shows at first support bounce during soft step") kuralla
  çeliştiği için yazılmadı; yerine "UX 13.2 a queued contextual tip whose trigger no longer holds is dropped
  unmarked". Bölüm 2'de adım 2'nin açık kalması (renk satırının hiç çıkmaması) product-lead PL-F2T1-3 (tur 2) ile
  birlikte çözülür.
- #15 [Önemli] touchcancel bırakma sayılıyor → KAPANDI. Doğrulandı (Phaser 4 `TOUCH_CANCEL` → `processUpEvents`,
  yalnız `wasCanceled`). `DragController.up`: `wasCanceled` → `abort()` (#8 dönüş, hiçbir şey harcanmaz);
  `OptionButton`, `PauseButton`, `Popup` (× ve anahtarlar), `StatusStrip` mala, `TrowelPicker` (hücre ve Vazgeç) iptal
  dokunuşunu dokunma saymaz. Konsol hatası için `installQuietTouchCancel`: TouchManager'ın tuval `touchcancel`
  dinleyicisi aynı işi yapan ama yalnız `cancelable` olayda `preventDefault` çağıran dinleyiciyle değişir. Duman testi
  "K-07 a system-cancelled touch (touchcancel) mid-drag commits no move …" (konsol hatası yok dahil).
- #16 [Önemli] perf kapısı eksik → KAPANDI (kapı), kapının bir maddesi bugün KIRMIZI. 4× CPU tarafında ortalama ≥ 50
  FPS + p95 ≤ 25 ms (`drag`, `win`), `drag`'de > 50 ms kare 0, FTUE ≤ 10 s; ölçülemeyen değer FAIL. Girdi gecikmesi
  `DragController`'ın pozu yazdığı olaydan (`DRAG_DRAWN_EVENT`) o pozu çizen `POST_RENDER`'a, ms + kare sayısı
  (gösterge, SwiftShader). TECH §10.7. Yeni kapının ortaya çıkardığı uzun kareler profillendi (karalama
  `scratchpad/longframes/`) ve üçü giderildi: (1) spot kenarı/köşeleri her değişimde bütün delikler kadar doku
  yüklüyordu → önceden çizilmiş parçalar (`spotPieces.ts`), (2) delik sürüklemenin her düğüm değişiminde yeniden
  kuruluyordu → sürükleme başına bir kez, (3) ses bankası ön-çizimi sürükleme karelerinde çalışıyordu (tek uzun ses
  4×'te ≈ 50 ms) → yalnız basış yokken. Son `npm run perf` (4×): drag ortalama 58,6 FPS (önce 50,8), p95 13,7 ms (önce
  23), en uzun 62 ms (önce 149); win 53,7 FPS / p95 21,2 ms; FTUE 8 970 ms; girdi ≤ 1 kare (85 örnek); konsol hatası
  yok. **Kalan tek FAIL:** `drag`'de 1 kare > 50 ms = oturumun ilk dokunuşunda `AudioContext` oluşturma (tarayıcı içi,
  4×'te ≈ 42–47 ms, etkinleştirme işleyicisinde). Dokunuştan sonraya ertelemek iOS Safari'de sesi bozar (WebKit sesi
  yalnız kullanıcı hareketi işleyicisinde başlatır); karar orkestratör / proje sahibine (bkz. issuesForOthers).
- #17 [Önemli] her bölümde LevelScene yeniden kuruluyor → KAPANDI. Ana ekrana `scene.switch` (uyku), ana ekrandan
  `scene.run` (uyanış) → `WAKE` → `startLevel`. Duman testi "TECH 10.4 … the level scene is woken, not created again"
  (harness `levelCreates`). TECH §10.4.
- #18 [Önemli] azaltılmış hareket EventPlayer dışında uygulanmıyor → KAPANDI. Ana ekran "BÖLÜM 2" nabzı yerine sabit
  altın kenar; spot kenarı sabit alfa; eldiven yolunu bir kez oynatıp hedefte basılı durur (design-lead onayına
  açık: alternatif tek kare poz); mala hücreleri sabit; seviye içinde ayar değişince `MovesCounter.setPulse` #51
  döngüsünü hemen keser. Koruma testi `tests/scenes/reducedMotion.test.ts`.
- #19 / #21 [Önemli] devamda `wrongPlacements`/`truckHelps` sıfırdan → KAPANDI. `GameSession.replay(lvl, log, opts,
  sink)` her eylemin olaylarını verir; `LevelAttempt.resumed(deps, inLevel, replayed)` sayaçları kurar; LevelScene
  devamda ArraySink ile oynatır. İnceleme testindeki `.fails` kaldırıldı (yeni API ile), ek test "K-43 resumed attempt
  keeps level_end wrongPlacements and truckHelps …". Kayıt şeması değişmedi.
- #20 / #22 [Önemli] `test:rules` taslak → KAPANDI. `tools/rule-coverage.ts` TECH §12.2'yi uygular (`vitest list
  --json`; K-xx GDD başlıkları + §12.4 F; engeller OBSTACLES imza tablosu; N-notları etkileşim matrisi; E satırları
  Kurallar + metin, Köprü/Lig/META → Faz 4); eksik → çıkış 1. `--phase 2` sonucu belgedeki kümeyle birebir: 35 K,
  W1/S1/S2, 9 E, 0 N; `--phase 3` bugün 54 eksik kimlik raporluyor (Faz 3 işi). Testler "test:rules phase 2 requires no
  N-note and no bridge E row" + 3 test; inceleme testindeki `.fails` kaldırıldı.

Özet (Faz 2 tur 1): **23 bulgu (3 çift aynı kusur) → 20 kusur, hepsi doğrulandı; 20 KAPANDI (3'ü öneriden gerekçeli
sapmayla: #1, #6, #13) · 0 RET · perf kapısının 1 maddesi kırmızı (#16, ilk dokunuşta `AudioContext`).** Ayrıca
product-lead'in Bölüm 3–4 öğretici verisi ve test yaması alındı. Çalıştırılanlar: `npm run check` yeşil (72 dosya,
1 375 test + 2 beklenen hata; `test:rules --phase 2` 47 kimlik), `npm run build` yeşil (verify-dist temiz), Playwright
duman 6/6 (yeni: çıkışta Kal/×, touchcancel, uyku/uyanış), `npm run screens` 54/54 çekim iki profilde (+ `--cvd all`
ile 19-palette), `npm run perf` yukarıdaki #16 satırı. Açık kalan önceki inceleme `.fails` testleri (bu turun listesinde
değil): JUICE #19 kamyon kilidi ≤ 900 ms, UX §1 (c) geçersiz denemeden sonra ana ekran düğmesi.

## Faz 2 tur 2

Kaynaklar: `design-lead-phase2.md` tur 2 ekran incelemesi (#0–#7), product-lead oyun testi (#8–#10), perf/kod incelemesi
(#11–#14), kural incelemesi (#15–#18); design-lead'in tur 2 ön koşul çalışması (tokens `color.board.rail` #3F454D, ART §4/§5,
UX §13.1 "Faz 2 tur 2b" balon yerleşimi ve Duraklat istisnası, JUICE #22/#84, ASSET `gap_rail`/`plan_support_hatch`).
Bu turun ilk çalışması (2026-10-07 00:00–00:32) kapanış yazmadan kesildi; o çalışmanın kodu bu çalışmada her bulgu için
kodda ve testte yeniden doğrulandı. "(önceki çalışma)" = kod oradan, bu çalışmada doğrulandı; diğerleri bu çalışmada yazıldı.
Senkron: STORY §6 `tut.ctx.resume` (TR "Tahta bıraktığın gibi duruyor, evlat." / EN "The board is just as you left it,
kiddo.") `tr.json`/`en.json`'da birebir (önceki çalışma; D-017 verbatim testi yeşil). product-lead'in `level_002.json`
adım 2 `hand.path` `[[4,7],[4,8],[6,8]]` verisi alındı: golden, öğretici ve ekran testleri yeni yolla yeşil; önerdiği L-17
denetimi uygulandı (aşağıda).

- #0 [Önemli] birleşen delik satır 7'yi aydınlatıyor → KAPANDI (önceki çalışma). `highlights.spotlight` → `fills` =
  `darkRects(kutu, üyelerin 12 px paylı dikdörtgenleri)`, aynı alfa, köşesiz; dolgunun içinde kalan kutu köşesine koyu köşe
  parçası konmaz; zorunlu adımda dolgu dokunuş da yutar. Test "UX 13.1 merged hole: level 1 step 1 lights only the crane
  band and piece 0" (390×844, 360×800, FIT).
- #1 [Önemli] sürüklenen blok ve gölgesi karartmanın altında → KAPANDI (önceki çalışma). `overTutorial(d)` = `tutorial + 5 +
  (d − fallShadow)/10`: sürükleme boyunca blok (görüntü, parlama, kalkık gölge), `ShadowView` tamamı (`setRaised`) ve #4 ipi
  spot/eldiven/balonun üstünde, pencerelerin altında; bırakınca döner. UX §13.1 sırası (karartma → el → balon → blok ve
  gölgesi → pencereler) `DEPTH`'le birebir. Test "UX 13.1 the dragged block and its shadow look draw above the spotlight
  during a drag".
- #2 [Önemli] W1 rayları görünmüyor → KAPANDI (önceki çalışma; renk bu turda design-lead'in token'ından). Ray 8 px
  `board.rail` + 2 px `board.wallLight` ışık çizgisi + 40 px'te 4×12 travers çentiği, gerçek boyunda pişirilir (gerilmez),
  `DEPTH.planOverlay + 2`; #22 ışığı `+ 3`. İnceleme testi pini `board.rail`'e çevrildi; çizim/token testleri yeni rengi
  token'dan okur.
- #3 [Önemli] azaltılmış harekette "BÖLÜM 2" ne nabız ne kenar → KAPANDI (önceki çalışma). `this.reduced` `build()`'den önce
  okunur. Test "UX 2.2 step 11 reduced motion: BÖLÜM 2 shows the steady gold edge on the first entry".
- #4 [Önemli] K-34 eksik destek taraması açık planda görünmüyor → KAPANDI (önceki çalışma). `plan_support_hatch` ART §4:
  her 6 px sarı çizginin altında 10 px `ui.ink` %80; JUICE #84 aynı çerçeve. Kontrast testi.
- #5 [Önemli] Altın Mala seçiminde soluklaşma yok → KAPANDI (önceki çalışma). Seçim açıkken cephe dışı plan hücreleri ve
  etkin dilimin `.` hücreleri alfa 0,5 (azaltılmış harekette de), kapanınca geri. Test "UX 5.2 trowel pick dims non-front
  plan cells to 50 %".
- #6 [Önemli] 24-bounce-support #84'ü bazen kaçırıyor → KAPANDI (önceki çalışma). Harness `waitCue(84, önceki sayı)` + 100 ms
  oyun zamanı; bu çalışmadaki `npm run screens`'te iki profilde de çekildi.
- #7 [Önemli] Bölüm 5 panoraması boş kutu, ok yok → KAPANDI (önceki çalışma). UX §5.1: satır sayısı en uzun dilimden, hücre
  `min(24, ⌊(110 − 2·pay)/satır⌋)` ≥ 12, dikey ortalı; panorama vurguluyken ve ≥ 2 dilimde 64×40 beyaz, mürekkep konturlu ok
  etkin dilimden sonrakine (1,2 s'de 16 px kayar; azaltılmışta sabit). Testler `tests/scenes/panorama.test.ts`.
- #8 [Önemli] K-43 devamında öğretici düşüyor → KAPANDI (önceki çalışma). `GameSession.replay(…, step)` her eylemden sonra
  `replayTutorialAction` ile denetleyiciyi canlı oyundaki gibi besler (sürükleme sinyali sonucun kanıtladığı kadar;
  `timeoutMs` adımı sonraki eylemden önce biter); kapanıştaki adım, zorunlu kapı ve sayaç aynen gelir; iptal edilmiş
  sürüklemenin adımı yeniden açılır. Birim testi (Bölüm 1–5 el çözümünün her noktası) + e2e "K-43 resume keeps the tutorial
  step (level 3 step 2 …)" bu çalışmada yeşil.
- #9 [Önemli] zorunlu adımda Duraklat yutuluyor → KAPANDI (önceki çalışma; UX §13.1 Faz 2 tur 2b ile uyumlu). Yutan bölgeler
  `pauseHitRect` (128 px) alanında kesilir (`blockerRects`); Duraklat karartmanın altında kalır, ek delik yok. Birim + e2e
  "UX 13.1 required step keeps the pause button (level 1 step 1) …" yeşil.
- #10 [Önemli] tekrarlanan yanlış bırakma seçimi sıfırlıyor (şüphe) → KAPANDI, kusur yeniden üretilemedi. Test "review Faz 2
  tur 2 #10: repeated wrong drops never reset the step, its highlighted blocks or the required gate" (Bölüm 1 adım 2'de 3
  geri sekme, Bölüm 3 adım 2'de başka bloğun sürüklemesi): adım, vurgulu bloklar ve kapı değişmiyor; kod değişmedi.
- #11 [Engel] `npm run perf` çıkış 1 → KAPANDI. (a) `AudioContext` açılışta (`AudioService.prepare`, BootScene), ilk girdi
  yalnız `resume()` + sessiz tampon; (b) `warmDragPath` bölüm başında kuru çalıştırma; (c) balonlar bölüm başında kurulur
  (önceki çalışma). Bu çalışmada profilleme (karalama `scratchpad/longframes/run2.ts`, küçültülmemiş harness) iki soğuk yol
  daha gösterdi ve giderildi: önceden kurulan balonların `BakedGraphics`'i ilk görünür karesinde pişiyordu (sürükleme
  ortasında açılan Bölüm 1 adım 2'de tuval + doku yükleme) → `bakeNow` / `SpeechBubble.prebake` kurulurken pişirir; JUICE
  #55/#57 başlık metni kazanma karesinde kuruluyordu → `EventPlayer.startLevel`'de gizli kurulur (dil değişince yenilenir;
  ilk ekran koşusunda gizli kurulmadığı için "HAMLELER BİTTİ!" sol üst köşede göründü — düzeltildi, e2e Bölüm 1 testi iki
  başlığın bitişe kadar görünmediğini ve kazanınca "KAZANDIN!"ın göründüğünü denetler). Ek: ses bankası
  ana ekranda da doldurulur. Son `npm run perf` (sessiz makine, 4×): drag 59,3 FPS, p95 12,6 ms, en uzun 37 ms (> 50 ms kare
  0); win 55,5 FPS, p95 18,2 ms (bu çalışmanın ilk ölçümünde 25,9 → FAIL); FTUE 8 790 ms; girdi ≤ 1 kare (80 örnek); 1×'te
  drag/win 60 FPS. Bütün kapılar PASS (bir önceki koşu da PASS: drag en uzun 47 ms, win p95 15,1, FTUE 9 155 ms). Not: başka iş yükü çalışırken (vitest/tsc) drag en uzun karesi 64 ms'ye çıkabiliyor; kapı ölçümü
  sessiz makinede yapılmalı.
- #12 [Önemli] dinlenen parmakta blok donuyor → KAPANDI (önceki çalışma). Blok kalkıkken `DragController.update` her karede
  `follow` çağırır (değişmeyen parmakta çekirdek önbellekteki `stay` sonucunu döndürür); ofset kayması, #1, #4, #3 biter.
  Test `tests/scenes/dragController.test.ts`.
- #13 [Önemli] dokunma geri bildirimi EventPlayer dışında → KAPANDI (önceki çalışma). `EventPlayer.tapped`: 1 hücre zıplama,
  azaltılmışta ≤ %3 ölçek nabzı, iki kipte `haptic('light')`. Test `tests/scenes/pieceView.test.ts`.
- #14 [Önemli] teklif miktarı iki kaynaktan → KAPANDI (önceki çalışma). Günlüğe çekirdeğin `OFFER_MOVES`'u yazılır, pencere
  "+N" aynı sabitten; `payOffer` `acceptOffer`'dan önce, başarısızsa iptal. Test "K-29 economy outOfMoves.extraMoves equals
  the core OFFER_MOVES …".
- #15 [Önemli] kısa ekranda balon alt yarıya iniyor → KAPANDI (bu çalışmada design-lead'in UX §13.1 Faz 2 tur 2b kararına
  göre yeniden yazıldı). Önceki çalışmanın aday listesi (HUD altı → vinç → üst deliklerin altı → durum şeridi → üst kenar,
  ağırlıklı ceza) kaldırıldı; `placeBubble` (`highlights.ts`): yasak alanlar = aydınlık vurgular (12 px pay), eldiven yolu
  hücre şeritleri, şantiye sütunu, Duraklat, alt yarı, yumuşak adım/bağlamsal satırda sahadaki bloklar (sürüklenen hariç);
  ceza = hedefler, hamle, vurgusuz panorama; adaylar 1 HUD altı (geniş ≤ 760) → 2 saha bandı (dar 494, +16 iner) → 3 vinç
  bandı (dar) → 4 HUD'a taşan bant (geniş; Duraklat'a değerse x 168, kutu ≤ 672) → 5 durum şeridi üstü (dar); > 3 satır o
  aday için geçersiz; seçim sözlük sırasıyla (yasak, ceza, sıra), ilk serbest adayda durur (sonrakilerin varyantı ölçülmez).
  Her adım metninin geniş + dar (çok kısa ekranda Duraklat yanı) balonu bölüm başında kurulup pişirilir; balon içerik
  açılınca ve ekran boyutlanınca yerleşir. Testler: "UX 13.1 on 390×844 and 360×800 … (candidate 1) …", "UX 13.1 … short
  screens too: 390×763, 360×740, 412×846, 375×667 …" (dar kutu 200 ve 229 px), "UX 13.1 Faz 2 tur 2b "Beklenen sonuç" …",
  "UX 13.1 the bubble never touches a lit hole nor the glove path …", "UX 13.1 Faz 2 tur 2b: no band under the HUD at FIT
  H 1920 …". UX "Beklenen sonuç" tablosu 4 kısa ekranda birebir tutuyor; tek koşullu satır Bölüm 1 adım 2: adım `overWall`'da
  (5,7) düğümünde açılır ve paylı delik vinç bandındaki dar kutunun alt kenarına 3 satırlık kutuda (229 px) 1 px değer → 4
  (TR "Şantiyenin üstünde bırak, kendisi düşer." dar kutuda 3 satır → tabloyla aynı); 2 satırlık kutuda (EN) değmez → 3.
  Kurallar tablodan önce gelir; design-lead'e bilgi. `screens` profilleri 390×763 ve 360×740 (`starts`) eklendi (önceki
  çalışma).
- #16 [Önemli] kamyon boş sütunda 1 075 ms kilit → KAPANDI (önceki çalışma). Kilit yalnız kamyon (700 ms); uzun düşüş kilit
  sonrası sıradan düşüş (R-12 hızlı sarmaya açık). İnceleme testi `.fails`'siz yeşil.
- #17 [Önemli] geçersiz denemeden sonra ana ekran düğmesi aynı bölümü açmıyor → KAPANDI (önceki çalışma). `homeTarget`
  `voidNotice.level`'i kullanır. İnceleme testi `.fails`'siz yeşil.
- #18 [Önemli] bağlamsal satır vurguları boş → KAPANDI (önceki çalışma). `ctxMoveHighlight`: geri seken blok `pid:<id>` +
  birincil nedenin hücreleri (`reasonCells`); `support` → eksik destek hücreleri + `front`; `blocked` → dokunulan blok;
  satır sürükleme sırasında açılmaz. İnceleme testi `.fails`'siz yeşil.
- product-lead PL-F2T2-0 önerisi (L-17 eldiven başlangıcı) → UYGULANDI. `drag`/`hold` eldiveninin `hand.path[0]`'ı vurgulu
  `piece:<i>` (parti 0) / `debris:<i>` (dilim 0) bloğunun JSON başlangıç hücrelerinden biri olmalı, değilse
  `tut_highlight_invalid` (`tutorial[i].hand.path[0]`); parti bloğu / sonraki dilim molozu Faz 3'te, `tap` denetlenmez. Testler
  "L-17 a drag / hold glove starts on a cell of a highlighted block …" (eski (4,6) → hata, yeni (4,7) → temiz) ve "L-17 every
  level 1–5 glove starts on its highlighted block". `levels:validate` 5 dosya 0 hata. TECH §8.3 L-17 satırı güncellendi.

Özet (Faz 2 tur 2): **19 bulgu → 18 doğrulandı ve KAPANDI, 1 yeniden üretilemedi (#10, test ile kapandı) · 0 RET.** Engel
(#11) kapalı: `npm run perf` bütün kapılar PASS. Çalıştırılanlar (bu çalışma): `npm run check` yeşil (75 dosya, 1 429 test
+ 2 beklenen hata; `test:rules --phase 2` 47 kimlik), `npm run build` yeşil (verify-dist temiz), `npm run build:harness`
yeşil, `npm run perf` PASS (yukarıda), Playwright duman 8/8 (yeni: K-43 öğretici devamı, zorunlu adımda Duraklat), `npm run screens` 64
çekim / 28 senaryo, 0 hata (390×844 ve 360×800 tam; 390×763 ve 360×740 Bölüm 1–5 başlangıçları — kısa profillerin tek
bağlamlı `starts` senaryosu ikinci bölümde harness'in K-43 korumasına takılıyordu: `start1`…`start5`, her biri boş
bağlamda). TECH §8.2 (balon yerleşimi), §8.3 (L-17), §10.6 (ön pişirme, başlık metni, ses bankası), §12.2 (`screens`)
güncellendi. design-lead'e bilgi: UX "Beklenen sonuç"ta Bölüm 1 adım 2 satırı metnin dar kutudaki satır sayısına bağlı
(TR 3 satır → 4, EN 2 satır → 3); ASSET `gap_rail` 240×12 yazıyor, ray ART §5'e göre duvar açıklığından da geçtiği için kod
`wallW + 240` = 300 px pişiriyor.
