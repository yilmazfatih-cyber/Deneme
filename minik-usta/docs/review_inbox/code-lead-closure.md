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
