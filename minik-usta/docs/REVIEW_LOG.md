# İnceleme günlüğü

Biçim: `[kaynak-ajan → hedef-ajan] konu: yorum` — ekran incelemesinde `[design-lead → code-lead] ekran: sorun → öneri`.
Her yorumun altına sahibi kapanışı yazar: `→ KAPANDI (sahip): ne yapıldı` ya da `→ RET (sahip): gerekçe` ya da `→ AÇIK SORU: proje sahibine`.

---

## Faz 1 çapraz inceleme — birleşik özet (2026-10-05)

Bu bölüm kanonik özettir. Arşiv (tam metin, değiştirilmeden saklanır): `docs/review_inbox/` altındaki yorum dosyaları
(`design-lead.md`, `design-lead-2.md`, `code-lead.md`, `code-lead-2.md`, `entrepreneur.md`, `entrepreneur-2.md`,
`product-lead.md`), kapanış dosyaları (`*-closure.md`) ve orkestratör kararları (`_orchestrator_rulings.md`, R-01…R-24;
D-004 sonrası kayıtlara taşındı).

Okuma kuralları:
- Yorumlar **hedef ajana** göre gruplanır, her grupta kaynak dosyaya göre alt başlık vardır. Yorum ve kapanış metinleri
  kısaltılmıştır; ayrıntı arşivdedir. Belge atıfları (§, K-xx, E-xx) kapanışı yapan ajanın belgesine aittir.
- **[çok hedefli]**: yorum birden çok ajana yazılmıştır; her hedefin kendi kapanışıyla o hedefin altında da yer alır
  (6 yorum). **[dolaylı]**: yorum başka ajana yazılmıştır ama bu ajanı adıyla bağlar; ajan kendi kapanışını yazmıştır.
- "Kısmi RET": yorum kapandı, bir alt maddesi gerekçeyle reddedildi. "Ek AÇIK SORU": yorum kapandı, ayrıca proje
  sahibine soru doğdu.

---

## A. code-lead'e yöneltilen yorumlar

### design-lead.md → code-lead (21)

- [design-lead → code-lead] hücre ve duvar ölçüsü (§10.2, §2.2): `round(boardWidthPx/9)` duvarı tam hücre sayıyor; ölçüler `tokens.layout.*`'tan (hücre 120, duvar 60) okunsun.
  Önem: Önemli
  → KAPANDI (code-lead): R-04; `/9` kalktı, `layout.grid.*` + değişmez testleri, 360 px'te 40 CSS px (TECH §2.2).
- [design-lead → code-lead] plan hücresi tarifi: %30 opak renk körlüğünde ayırt edilmiyor; altlık #BCCADD + renk %80 + kesik kontur, ozalit ızgara katmanı.
  Önem: Önemli
  → KAPANDI (code-lead): R-05; `planUnderlay` + `alpha.planFill` 0,8 (renk körü 0,9), ızgara plan hücreleri ile bloklar arasında (§10.2–10.3).
- [design-lead → code-lead] girdi kilidi (§6.3): her yerleşimden sonra 320–350 ms kilit "yapışkan" his verir; tutma bekleyen tween'leri bitirsin.
  Önem: Önemli
  → KAPANDI (code-lead): R-12; tutma tahta tween'lerini son kareye atlatır; kilit yalnız dilim kayması / kamyon / Kamyon Yardımı (§6.3).
- [design-lead → code-lead] "animasyonları azalt": 0,3× hızlandırma değil, JUICE solma varyantları; haptik bu ayara bağlı olmasın.
  Önem: Önemli
  → KAPANDI (code-lead): 150 ms solma, ölçek ≤ 1,03, sallama yok, parçacık ×0,2; haptik yalnız titreşim anahtarında (§6.3, §11.7).
- [design-lead → code-lead] hafif yerçekiminde yönlendirme girdisi: düşen bloğa dokunmak zor; tahtanın herhangi bir yerine dokunma bloğu öbür sütuna geçirsin.
  Önem: Önemli
  → KAPANDI (code-lead): R-10; tahtaya dokunuş, dokunulan taraf = yön, tutmayla eşikle ayrılır, iki aşamalı commit, `steerZone` = `board` (§4.7).
- [design-lead → code-lead] ağır yerçekimi 700 ms (→ code-lead / proje sahibi): zaman baskısız "şantiye üstünde indirilemez" alternatifi desteklenir.
  Önem: Önemli
  → KAPANDI (code-lead): R-11 karar verdi: 700 ms + 1400 ms erişilebilirlik seçeneği; "indirilemez" seçilmedi, `holdMs` tek parametre (§4.7).
- [design-lead → code-lead] font: Baloo 2 (OFL) seçildi; `@font-face`, preload ve Boot'ta `document.fonts.load` beklensin.
  Önem: Önemli
  → KAPANDI (code-lead): woff2 `public/fonts/`, preload + `font-display: block`, Boot iki yükü bekler, lisans Ayarlar'da (§10.2).
- [design-lead → code-lead] sabit genişlikli rakam: Canvas `tnum` açamaz; değişen sayılar ortaya hizalansın ya da Tnum alt kümesi.
  Önem: Öneri
  → KAPANDI (code-lead): ortaya hizalı + en geniş haneye göre sabit yuvalar; Tnum gelirse tek satır (§10.2).
- [design-lead → code-lead] token anahtar adları: `color.sky`, `drag.liftCells`, `board.wallWidthCells` tokens'ta yok; mevcut anahtarlar okunsun.
  Önem: Öneri
  → KAPANDI (code-lead): mevcut anahtarlar, `tokens.ts` zod denetimi, `body` arka planı bölüm `skyTop`'u (§10.1, §10.5).
- [design-lead → code-lead] Filter'sız efektler: dolma, silme, parlama ve bulanık gölge maske/blur istiyor; `setCrop`, tint, pişmiş gölge kullanılsın.
  Önem: Öneri
  → KAPANDI (code-lead): `setCrop`, `setTintMode(FILL)`, pişirilmiş siluet gölgeler, spot ışığı 4 dikdörtgen + 4 çeyrek daire (§10.2).
- [design-lead → code-lead] iptal öngörüsü (S-5): havada ya da duvarda bırakma iptali önceden görünmüyor; `ShadowView`'a `cancel` durumu.
  Önem: Öneri
  → KAPANDI (code-lead): `DragSession.classify` + `cancel` (%60 opak + ↩), K-07'nin 7 satırına eşit, `siteClosed` dahil (§4.3, §5.1).
- [design-lead → code-lead] dokunma payı: 30 px olsun, çakışmada en yakın hücre merkezi.
  Önem: Öneri
  → KAPANDI (code-lead): kod `touch.hitSlopPx` okur, çakışmada en yakın merkez; değer tokens'ta (§10.3).
- [design-lead → code-lead] haptik değerleri: web desenleri tokens'tan farklı; `Haptics` `tokens.haptic`'i okusun.
  Önem: Öneri
  → KAPANDI (code-lead): `Haptics.play(name)` tokens'tan, kodda sabit yok; Capacitor eşlemesi JUICE §0.7 (§11.7).
- [design-lead → code-lead] ses parametrelerinin sahipliği: ZzFX dizileri `tokens.json → audio.sfx`'te dursun.
  Önem: Öneri
  → KAPANDI (code-lead): `audio.sfx.<ad>` tokens'ta, `sfx.ts` yalnız ad eşler (§11.6).
- [design-lead → code-lead] düşüş süresi: sabit ms/satır yerine `tokens.physics` ivme + tavan hızı; hafif yerçekiminde sabit hız.
  Önem: Öneri
  → KAPANDI (code-lead): `tokens.physics` eğrileri; G-L `atRow` aynı eğriden (§4.7, §6.3).
- [design-lead → code-lead] renk körü modu ve atlas: mod değişince atlas yeniden üretilsin.
  Önem: Öneri
  → KAPANDI (code-lead): plan kareleri + bölüm sayfası yeniden pişirilir, 20–40 ms (§10.2).
- [design-lead → code-lead] ekran incelemesi araçları: CVD filtresi ve `screens`'te normal + 3 CVD çekimi.
  Önem: Öneri
  → KAPANDI (code-lead): `screens --cvd` (Machado `feColorMatrix`), yalnız DEV/harness; üretimde `?debug` yok (R-20; §12.2).
- [design-lead → code-lead] Faz 2 planı madde 12 (FTUE): ≤ 10 s ölçümü giriş sahnesini de içersin.
  Önem: Öneri
  → KAPANDI (code-lead): 3 yer tutucu panel Faz 2 #12'de; perf FTUE kapısı panellerle (§10.7, §14.1).
- [design-lead → code-lead] blok otomatik döşemesi: yaklaşım onaylı; içbükey köşe yayı ve parlama hapı kuralı eklenecek.
  Önem: Öneri
  → KAPANDI (code-lead): bölüm başı parça pişirme; çeyrek yay ve "üst + sol açık hücrede parlama" tarifte (§10.2b).
- [design-lead → code-lead] EXPAND (P-7): design-lead P-4 ile aynı; tek karar olsun.
  Önem: Öneri
  → KAPANDI (code-lead): tek karar (D-015); R-06 gereği FIT de desteklenir, seçim proje sahibinde (O-1) (§10.1).
- [design-lead → entrepreneur / code-lead] [çok hedefli] S12 yaş ekranı UX'i: Bölüm 3 sonrası, nötr tam sayfa, 4 hane + sayısal tuş takımı.
  Önem: Öneri
  → KAPANDI (code-lead): Bölüm 3 → yaş → CMP → ana ekran; `ConsentService.ready()` sağlayıcıları bekletir; kovalar <13 / 13-17 / 18+; yalnız mağaza sürümü (§11.8).

### design-lead-2.md → code-lead (1)

- [design-lead → product-lead / code-lead] [çok hedefli] G-L yönlendirme girdisi: düşerken tahtanın herhangi bir yerine dokunma ya da kaydırma; düşüş başına 1.
  Önem: Önemli
  → KAPANDI (code-lead): dokunuş + blokta başlamayan yatay kaydırma, geçersiz girdi hak yakmaz, 2 genişlikte yok; E-40 (§4.7).

### entrepreneur.md → code-lead (11)

- [entrepreneur → code-lead] Faz 2 süresi ↔ BUSINESS §10: 21 gün tamponsuz; %20 tampon ve Faz 3–5 tahminleri eklensin.
  Önem: Önemli
  → KAPANDI (code-lead): Faz 2 25,5 g net / 29,5 g tamponlu ≈ 6 hf; Faz 2–5 107,5 g ≈ 21,5 hf ≤ 22 hf; kesme seçeneği §14.1; proje sahibine O-3.
- [entrepreneur → code-lead] basit solver çift iş riski: Faz 2'de el çözümleri golden, solver tek seferde Faz 3'te.
  Önem: Öneri
  → KAPANDI (code-lead): öneri kabul (P-11), Faz 2'de solver yok, −0,5 g.
- [entrepreneur → code-lead] Analytics tip birliği: `offer_result`, `ad_rewarded`, `coin_source/sink`, `event_continue` vb. MVP'ye eklensin.
  Önem: Önemli
  → KAPANDI (code-lead): birlik ANALYTICS §2 tablosundan birebir + iki yönlü eşleme testi (§11.4).
- [entrepreneur → code-lead] EventService ödemeden bağımsızlık: ESLint import yasağı, iki-kayıt eşitlik testi, hayatta kalma raporu.
  Önem: Önemli
  → KAPANDI (code-lead): R-14; import yasağı, "E8 bot standings are independent of purchases", `tools/event-sim.ts`, `seedHash` (§1.3, §11.2).
- [entrepreneur → code-lead] reklam ve satın alma servisleri: `RewardedAds` ve `Purchases` arayüzleri, MVP'de sahte.
  Önem: Önemli
  → KAPANDI (code-lead): R-23; `AdsService`, `IapService`, `ConsentService` sahte; tavan ve analytics servis katmanında (§11.3, §11.8).
- [entrepreneur → code-lead] debug paneli üretimde: `?debug=1` üretimde çalışmasın, `dist/` denetlensin.
  Önem: Önemli
  → KAPANDI (code-lead): R-20; yalnız `import.meta.env.DEV`, `harness` modu, `build:verify` (§12.2–12.3).
- [entrepreneur → code-lead] düşük seviye referans cihaz: düşük + orta Android'de ölçüm; ≥ 30 FPS, girdi ≤ 2 kare, otomatik azaltılmış efekt.
  Önem: Önemli
  → KAPANDI (code-lead): R-23; Faz 2 çıkış kapısı + otomatik profil; cihaz alımı proje sahibine O-4 (§10.7, §14.1).
- [entrepreneur → code-lead] Capacitor paket kimliği: ad adayından bağımsız, nötr; görünen ad isim kararından sonra.
  Önem: Öneri
  → KAPANDI (code-lead): nötr kimlik, ilk yüklemeden önce kesinleşir; kod içi kimlikler kod adı (§13).
- [entrepreneur → code-lead] iOS derleme ortamı maliyeti: macOS satırı eklensin.
  Önem: Öneri
  → KAPANDI (code-lead): §13 fiziksel Mac / bulut macOS CI; maliyet BUSINESS §10'a; O-4.
- [entrepreneur → code-lead] onay ve yaş kapısı kancası: `services/consent`, MVP'de no-op.
  Önem: Öneri
  → KAPANDI (code-lead): `ConsentService { status, ageBucket, ready }`; sağlayıcılar onaydan sonra dinamik import, öncesi yerel tampon (§11.8).
- [entrepreneur → code-lead] TECH kapsam etiketleri: debug, perf, `test:rules`, EXPAND, ASCII MVP; Web Worker solver Faz 3.
  Önem: Öneri
  → KAPANDI (code-lead): etiketler §12.3 ve §14'te.

### entrepreneur-2.md → code-lead (2)

- [entrepreneur → product-lead, code-lead] [çok hedefli] K-43 kapanınca kayıp: haksız; her hamlede kayıt + belirlenimci tekrarla kaldığı yerden devam (MVP).
  Önem: Önemli
  → KAPANDI (code-lead): R-13; `inLevel` her eylemde ve `pagehide`'da, açılışta doğrudan devam, kayıp penceresi aynı teklifle; E-38; +0,5 g (§11.1).
- [entrepreneur → product-lead, code-lead] [çok hedefli] B planı yeniden yazılmalı: yalnız S6 + S5 kesilsin; engel başına gün verilsin.
  Önem: Önemli
  → KAPANDI (code-lead): §14.2 engel başına gün tablosu; S5 + S6 ≈ 2,5 g, G-L "yavaş düşüş" ≈ 1 g.

### product-lead.md → code-lead (18)

- [product-lead → code-lead] K-34 Alttan Üste doğrulamada yok: gömülü delik Bölüm 3'ü çözümsüz bırakır; 3. koşul + Vinç/Mala + gölge `verdict`.
  Önem: Engel
  → KAPANDI (code-lead): tek `isCorrectPlacement` (K-16 + K-34), `verdict.reasons` + `missingSupport`, `buildFront`; ray/düşüş/balon/G-L/Vinç/Mala/solver aynı fonksiyon; Faz 2 kapsamında (§5.2, §6.4, §9.3, §14.1).
- [product-lead → code-lead] kural kapsamı: `test:rules` K-01…K-46 + E-xx; Faz 2'ye K-34, K-35, K-41, K-43, K-44 eklensin.
  Önem: Önemli
  → KAPANDI (code-lead): K-01…K-46, E-01…E-46, engeller ve `[kural]` N-notları; Faz 2 kapsam satırı (§12.4, §14.1).
- [product-lead → code-lead] teslimat sırası (§6.2 adım 8–9): adım 8 yalnız kuyruğa ekler, adım 9 FIFO dener.
  Önem: Önemli
  → KAPANDI (code-lead): `enqueue` + tek teslimat noktası adım 9; aday sırası x → `dropColumns` → uzaklık (§6.2).
- [product-lead → code-lead] S-21 boya kapısı: yol boya geçidinin RAIL düğümünden geçerse boyanır; `Move.drag.via`.
  Önem: Önemli
  → KAPANDI (code-lead): `via`, son girilen kapı geçerli; solver "geç ve sahaya dön" adayları; E-39 (§4.2, §6.2, §9.3).
- [product-lead → code-lead] S-9 balon tavanı: şantiyede aktif dilimin plan tepesi.
  Önem: Önemli
  → KAPANDI (code-lead): en üst hücre `h + e − 1`; tavan üstünden bırakılan iner (E-35); O(1) (§4.5, §5.1).
- [product-lead → code-lead] iki küçük kural: W8'de d = 0 ise kayma yok; Y8 yalnız plan alanı içinde yapışır.
  Önem: Öneri
  → KAPANDI (code-lead): `modifyFall` `d ≥ 1` (balonda `|bırakma − tavan|`), Y8 `allCellsInPlanArea`; iki test (§5.1–5.2, §7.2).
- [product-lead → code-lead] adım 6 saha yerçekimi: düşüşlerin komşu etkileri, döngü, balon yükselişi yazılı değil.
  Önem: Önemli
  → KAPANDI (code-lead): `do { settle (yarım adımlı); komşu etkileri } while`; N24–N27, N33, N34, E-33 testleri (§5.3).
- [product-lead → code-lead] ıslak beton ve teslimat: o hamlede gelen ıslak blok sayaçtan kaybetmez (E-31).
  Önem: Öneri
  → KAPANDI (code-lead): `arrivedTurn`, Y4 atlar; E-31 testi (§2.4, §6.2, §7.2).
- [product-lead → code-lead] K-30 Kamyon Yardımı: D1 / D2 / D3 üç ayrı yol olmalı.
  Önem: Önemli
  → KAPANDI (code-lead): `noMoves` / `material` (`B1` teslimi) / `tiling`; test "K-30 D2 delivers missing B1 bricks" (§9.7).
- [product-lead → code-lead] bot modeli META / `events.json` ile çelişiyor; tohumda kurulum kimliği.
  Önem: Önemli
  → KAPANDI (code-lead): parametreler yalnız `events.json`'dan, META §6.2/§7.3 birebir; tohum `eventId`, Lig `(weekId, groupId)`; Monte Carlo testleri (§2.7, §11.2).
- [product-lead → code-lead] bölüm şeması eksikleri: `debris[].segment`, kayar kapı yönü, `carouselEvery` 2–6, `wetMoves` 1–5.
  Önem: Önemli
  → KAPANDI (code-lead): hepsi eklendi; `seed` isteğe bağlı (`id × 1000 + id`) (§8.2).
- [product-lead → code-lead] doğrulayıcı ↔ K-45 farkları (a–f): renk sayımı, bayrak birleşimi, yeni mekanik, saklı nesne.
  Önem: Önemli
  → KAPANDI (code-lead): `Issue.code` + `rule`; L-06/07 genişledi, L-21/22/23; mekanik kümesi OBSTACLES veri imzasından (§8.3).
- [product-lead → code-lead] güçlendirici kuralları K-36…K-40: ön koşul + etki tablosu ve mini hat.
  Önem: Önemli
  → KAPANDI (code-lead): §6.4 tablosu, `boosterRejected`, mini hat; W4/W7 `openShutterUntil`; Geri Al E-37.
- [product-lead → code-lead] can ayırma ve çıkış: kayda `activeAttempt` alanı.
  Önem: Öneri
  → KAPANDI (code-lead): R-13 ile genişletildi: `inLevel`, kapanma kayıp değil, `m = 0` cezasız (E-41) (§11.1).
- [product-lead → code-lead] kenar modeli kabulü; testler kural kimliğiyle sabitlensin.
  Önem: Öneri
  → KAPANDI (code-lead): R-03; 8×10 ızgara; K-05 / K-12 / K-07 test adları (§2.2).
- [product-lead → code-lead] G-L yönlendirme riski: K-34 ile çıkıntı altı hatalı olur; balon yükselişi de kapsansın.
  Önem: Öneri
  → KAPANDI (code-lead): R-2 notu güncel, `steer` balonu kapsar, geçersiz girdi hak yakmaz (§4.7, §15).
- [product-lead → code-lead] denge araçları: 1–10 el çözümleri golden; `--continue` ile "+5 sonrası kazanma oranı".
  Önem: Öneri
  → KAPANDI (code-lead): `tests/golden/level_00N.hand.json`, `levels:bot --continue N`, R-16 ekonomi sütunları (§9.5–9.6).
- [product-lead → code-lead, design-lead] [çok hedefli] ağır yerçekimi erişilebilirliği: "indirilemez" varsayılanı G-H + cam bölümlerini bozar; ayar açıkken sayaç olmasın.
  Önem: Önemli
  → KAPANDI (code-lead): R-11: 700 ms, ayar açıkken 1400 ms; "sayaç yok" seçilmedi, `holdMs` parametresiyle maliyetsiz (§4.7).

### Dolaylı satırlar → code-lead (4)

- [entrepreneur → design-lead] [dolaylı] JUICE kapsam etiketleri: code-lead'in Faz 2 #11 kapsamı P0 listesiyle eşleşsin.
  Önem: Öneri
  → KAPANDI (code-lead): Faz 2 #11 JUICE P0 listesine bağlı (§6.3, §14.1).
- [design-lead → product-lead] [dolaylı] ara sahne tetikleyicisi: "code-lead akışı buna göre kurar".
  Önem: Önemli
  → KAPANDI (code-lead): tetikleyiciler yalnız `economy.json → town.cutscenes`'ten; `config:validate` şeması (§11.3).
- [product-lead → entrepreneur] [dolaylı] ödemeyen oyuncu şartı: Faz 3 ekonomi simülasyonu sütunları code-lead ile.
  Önem: Öneri
  → KAPANDI (code-lead): bot raporunda "altın / 10 bölüm", "+5 sonrası kazanma oranı", R-16 ölçütleri (§9.6).
- [entrepreneur → product-lead] [dolaylı] ödemeyen oyuncu ölçütü: `coin_source`, `coin_sink`, `event_continue` olayları gerekli.
  Önem: Önemli
  → KAPANDI (code-lead): üç olay tip birliğinde, `Wallet.apply` her işlemde yayınlar (§11.3–11.4).

---

## B. design-lead'e yöneltilen yorumlar

### code-lead.md → design-lead (15)

- [code-lead → design-lead] layout sözleşmesi: 120/60 kabul, çekirdek kenar modeline geçer; EXPAND için `layout` çapa grupları (üst/alt/tahta) yok.
  Önem: Önemli
  → KAPANDI (design-lead): `layout.grid.*` (120 / 60 / 30 / 750 / 810) + `top/bottom/board/popup` grupları, `expandShare` 0,5; UX §0.1, §5.1.
- [code-lead → design-lead] tokens.json biçimi: aynı değer birden çok yerde, ad birliği yok, 700 ms oyun kuralı, birimler yazılı değil.
  Önem: Önemli
  → KAPANDI (design-lead): türetilmiş renkler `check.*` salt kontrol, yinelenenler kaldırıldı, `color.ghost.*`, `rules.heavyGravityHoldMs` çıktı, `meta.units`.
- [code-lead → design-lead] blok çizim yöntemi: Graphics/RenderTexture uygun değil; Canvas2D `Path2D` ile bölüm başı parça pişirme.
  Önem: Önemli
  → KAPANDI (design-lead): ART §3 parça pişirme + siluet dokuları; ASSET `blk_<şekil>_<renk>[_bayrak]`.
- [code-lead → design-lead] plan hücresi P-2: kabul; katman sırası ve esas değer netleşsin.
  Önem: Öneri
  → KAPANDI (design-lead): ART §4 sıra; esas `planUnderlay` + `alpha.planFill`, `check.plan` salt kontrol; renk körü 0,9.
- [code-lead → design-lead] JUICE kural 3 ↔ TECH girdi kilidi: tutma anında tahta animasyonları son kareye atlasın.
  Önem: Önemli
  → KAPANDI (design-lead): R-12; JUICE §0 kural 3 + UX §0.3; kilit yalnız 600 / 700 / 900 ms dizilerde.
- [code-lead → design-lead] maske gerektiren efektler: Filter'sız karşılıklar kullanılsın.
  Önem: Öneri
  → KAPANDI (design-lead): JUICE kural 11, #12/#18/#47 `setCrop` / tint / ekran kenarı kırpması; `ui_spotlight`.
- [code-lead → design-lead] Baloo 2 yükleme: yedek fontla rasterize riski, `tnum` yok, iOS ağırlık seçimi.
  Önem: Öneri
  → KAPANDI (design-lead): ART §8 preload + `font-display: block`, sabit hane yuvaları, iOS yedeği iki statik örnek.
- [code-lead → design-lead] FTUE "8,0 s" iddiası: ölçülmemiş kalemler; sıra değişikliği ve `npm run perf` kapısı.
  Önem: Öneri
  → KAPANDI (design-lead): UX §2.1 kritik yol font + 3 panel ≤ 300 KB; perf 4× CPU + Fast 4G; ASSET §9 tembel yükleme.
- [code-lead → design-lead] parçacık bütçesi: `win` 80 ↔ `maxPerBurst` 40.
  Önem: Öneri
  → KAPANDI (design-lead): `particles.win` 40 + `winWaves` 2.
- [code-lead → design-lead] ses: 76 efektin ön-çizimi takılma yaratır; kilitli bağlamda istekler atılsın.
  Önem: Öneri
  → KAPANDI (design-lead): JUICE kural 6; tokens `audio.sfx` (20) + `audio.seq` (9) ZzFX ile çizilip doğrulandı.
- [code-lead → design-lead] kasaba katmanları bellek maliyeti: tam tuval katman ≈ 5,2 MB GPU; kırpma + atlas.
  Önem: Önemli
  → KAPANDI (design-lead): ASSET §7 sınır kutusu + ofset, bölüm başına 1–2 atlas 2048², yalnız aktif bölüm; §9 panel belleği.
- [code-lead → design-lead] mağaza görüntüleri ve ekran aracı: 1290×2796 / 1080×1920 profilleri.
  Önem: Öneri
  → KAPANDI (design-lead): ASSET §11 `--profile ios67` / `android`; çapa sözleşmesi iki oranda.
- [code-lead → design-lead] Albüm kapsamı: MVP'de kilitli "Yakında".
  Önem: Öneri
  → KAPANDI (design-lead): R-19; UX §3/§8/§12, JUICE #75, STORY §4.1, ASSET `album_card_*` [Sonra].
- [code-lead → design-lead] G-L girdisi: şantiyenin sol/sağ yarısına dokunma.
  Önem: Öneri
  → KAPANDI (design-lead): R-10 tahtaya dokunma (önerinin üst kümesi); UX §5.6, JUICE #46.
- [code-lead → design-lead] ağır yerçekimi: Ayarlar'a "Zaman baskısı yok" anahtarı.
  Önem: Öneri
  → KAPANDI (design-lead): R-11; "Zaman baskısını azalt" = 1400 ms (UX §5.7, §11, §14; JUICE #45).

### code-lead-2.md → design-lead (1 + 2 dolaylı)

- [code-lead → product-lead + design-lead] [çok hedefli] K-07 tutma eşiği: 0,3 hücre ↔ 8 px / 100 ms; K-07 sayı içermesin, test token okusun.
  Önem: Önemli
  → KAPANDI (design-lead): UX §5.3 `drag.startThresholdPx` 8 / `holdMs` 100; eşik altı bırakma = dokunma.
- [code-lead → product-lead] [dolaylı] balon tavanı görsel notu: tavan üstünden bırakılan balon "ip gerilir, aşağı süzülür".
  Önem: Öneri
  → KAPANDI (design-lead): JUICE #43, `duration.ceilingSettle` 200; UX §5.4 gölge kirişin altında.
- [code-lead → product-lead] [dolaylı] K-34 maliyeti notu: Altın Mala vurgusu `eligibleTrowelCells` kümesini kullanır.
  Önem: Öneri
  → KAPANDI (design-lead): UX §5.2, §5.5: seçilebilir hücre = inşa cephesi, tek görsel dil.

### entrepreneur.md → design-lead (28)

- [entrepreneur → design-lead] UX §7 +5 penceresi seçenek asimetrisi: ücretli düğme baskın, "Vazgeç" metin düğme.
  Önem: Önemli
  → KAPANDI (design-lead): R-15; üç eşit 920×152 düğme, hiyerarşi yalnız renkle, "Hayır, teşekkürler" dolgulu.
- [entrepreneur → design-lead] UX §7 fiyat bilgisi ve eskalasyon: gerçek para karşılığı ve 2./3. teklif durumları yok.
  Önem: Önemli
  → KAPANDI (design-lead): `PriceLabel`, "Teklif n/3", 1.350 / 1.800, "son teklif"; 3. uzatmadan sonra can kaybı.
- [entrepreneur → design-lead] UX §7 + Köprü kaybı baskı dili: "Az kaldı!", "+5 elenmeyi önler".
  Önem: Önemli
  → KAPANDI (design-lead): nötr "Kalan: 2 hücre", Tuna balonsuz, kalan oyuncu ve havuz yok; `lose.tuna` kaldırıldı.
- [entrepreneur → design-lead] UX §9 Köprü kural kartı ve bot etiketi yok.
  Önem: Önemli
  → KAPANDI (design-lead): R-14; ilk "Katıl"da kural kartı + (i); `bridge.rule_card.*`, `bridge.bots_label`.
- [entrepreneur → design-lead] UX §10 Usta Ligi bot görünümü: "Selin_U" gerçek kullanıcı adı gibi.
  Önem: Önemli
  → KAPANDI (design-lead): kask + alet avatarı, `npc.apprentice.*` adı + "çırak" rozeti; `league.rule_card.*`.
- [entrepreneur → design-lead] UX §11 Mağaza paket miktarları BUSINESS §5 ile farklı; fiyat yok.
  Önem: Önemli
  → KAPANDI (design-lead): ● 1.000…75.000, Başlangıç 2.500 + 2 Çekiç + 1 Vinç + 2 Termos; "+%n" değer etiketi; "en popüler" yok; sayılar config'ten.
- [entrepreneur → design-lead] UX §3–§5 mini satın almalarda gerçek para karşılığı yok.
  Önem: Önemli
  → KAPANDI (design-lead): ortak `PriceLabel` (UX §0.3), kaynak `priceDisplay.referenceSku`.
- [entrepreneur → design-lead] UX ödüllü reklam yerleşimleri eksik (can, günlük ×2), tavan görünümü yok.
  Önem: Öneri
  → KAPANDI (design-lead): "+1 can (bugün 2/2)", günlük ×2, kayıp +5; tavanda gri "Yarın tekrar" [MVP yer tutucu].
- [entrepreneur → design-lead] günlük ödül ekranı tanımsız (E10 gösterilmeli).
  Önem: Önemli
  → KAPANDI (design-lead): UX §3.1 7 günlük takvim, "Bir gün gelmezsen ilerlemen kaybolmaz.", "bekliyor" saati.
- [entrepreneur → design-lead] sandık açılışı: içerik önceden görünsün, kumar çağrıştıran animasyon olmasın.
  Önem: Önemli
  → KAPANDI (design-lead): içerik kapalı sandığın üstünde; çark/slot/yavaşlayan kart yok; JUICE #85.
- [entrepreneur → design-lead] Kumbara kartı tanımsız.
  Önem: Öneri
  → KAPANDI (design-lead): "● n / 2.000", "1.000'de kırılabilir", "Kır · $1,99"; bildirim ve geri sayım yok (R-16).
- [entrepreneur → design-lead] FTUE'de mağaza sürümü yaş ekranı ve onay yeri yok.
  Önem: Öneri
  → KAPANDI (design-lead): UX §2.3 [Mağaza]; kaydırıcı yerine boş 4 hane + tuş takımı (BUSINESS S12 onayladı).
- [entrepreneur → design-lead] Ayarlar'da Gizlilik ve Harcama limiti satırları.
  Önem: Öneri
  → KAPANDI (design-lead): [Mağaza] satırları; web MVP'de gizli, yerleri ayrıldı.
- [entrepreneur → design-lead] "Altın al" → Mağaza yönlendirmesinde hangi paket öne çıkar.
  Önem: Öneri
  → KAPANDI (design-lead): eksik altını karşılayan en küçük paket çerçeveli; önseçim ve otomatik kaydırma yok.
- [entrepreneur → design-lead] UX kapsam etiketleri.
  Önem: Öneri
  → KAPANDI (design-lead): etiket sözlüğü; Sol el [Sonra], Albüm [Sonra], diğerleri [MVP] / [MVP-lite]; EXPAND proje sahibinde (R-06).
- [entrepreneur → design-lead] açılış logosu "MİNİK USTA" sabit; ad kararına bağlı olmalı.
  Önem: Öneri
  → KAPANDI (design-lead): `app.title` marka sabitinden, 8–12 harfe ölçeklenir; logo isim kararından sonra.
- [entrepreneur → design-lead] STORY §7.2 çırak adları ve bot bilgi metinleri yok.
  Önem: Önemli
  → KAPANDI (design-lead): STORY §7.4 100 ad çifti `npc.apprentice.n001…n100`; bilgi ve kural kartı metinleri.
- [entrepreneur → design-lead] STORY §7.3 vazgeç metni "Give up" suçlayıcı.
  Önem: Öneri
  → KAPANDI (design-lead): `lose.decline` "Hayır, teşekkürler / No thanks"; `lose.giveup` ve `lose.tuna` kaldırıldı.
- [entrepreneur → design-lead] STORY genel ton ve çocuk sinyali (Hikaye 1 ve 3).
  Önem: Öneri
  → KAPANDI (design-lead): yetişkin kasaba halkı en az çocuklar kadar; "kasabanın tek kütüphanesi"; figüran dengesi.
- [entrepreneur → design-lead] STORY kapsam etiketleri.
  Önem: Öneri
  → KAPANDI (design-lead): §7.1 tepki balonları [Sonra], "Devamı yolda…" [MVP], JUICE #81 [Sonra].
- [entrepreneur → design-lead] ASSET `app_icon`: oyuncak blok yığını + kask çocuk sinyali; imza hareketi göstermiyor.
  Önem: Önemli
  → KAPANDI (design-lead): ikaz şeritli duvar + kancadaki blok + yay; karakter/yüz/kask/küp yok; A/B yalnız 18+ hedeflemeyle.
- [entrepreneur → design-lead] `store_feature_graphic`: ağaç ev + büyük Tuna.
  Önem: Öneri
  → KAPANDI (design-lead): sol yarı kaldır–aşır–indir anı, sağ yarı fener/fırın, Tuna küçük ve köşede.
- [entrepreneur → design-lead] ART §11.8 özgünlük tablosunda Color Block Jam eksik.
  Önem: Öneri
  → KAPANDI (design-lead): satır eklendi (geçit duvar içinde kestirme, mağaza görselinde duvar üstü hareket).
- [entrepreneur → design-lead] final sanat üretim yöntemi ve fikri mülkiyet: insan sanatçı, üretim kaydı, istemlerde marka adı yok.
  Önem: Önemli
  → KAPANDI (design-lead): ASSET §0 ve §15 üretim kaydı; istemlerden marka adları ve "toy-like" çıktı.
- [entrepreneur → design-lead] final sanat maliyeti ve süresi (≈ 127 sanatçı-günü, tampon yok): öncelik sütunu.
  Önem: Önemli
  → KAPANDI (design-lead): P0/P1/P2 sütunu; §14 ≈ 126 sanatçı-günü (P0 ≈ 67), 1,5 FTE ≈ 17 hf.
- [entrepreneur → design-lead] ifade seti kapsamı: 8 karakter × 6 ifade fazla.
  Önem: Öneri
  → KAPANDI (design-lead): ana 4 × 6, yan 4 × 3 ifade; kalanı [Sonra].
- [entrepreneur → design-lead] JUICE #52: +5 çipi döngüsel zıplıyor.
  Önem: Öneri
  → KAPANDI (design-lead): açılışta bir kez zıplar; üç düğme aynı giriş animasyonu.
- [entrepreneur → design-lead] JUICE kapsam etiketleri.
  Önem: Öneri
  → KAPANDI (design-lead): JUICE §0 kural 12 listesi (Faz 2 P0, Faz 3, MVP-lite, Sonra); sütun yerine liste (telefonda okunurluk).

### product-lead.md → design-lead (22)

- [product-lead → design-lead] öğretici sırası LEVELS çözümüyle uyuşmuyor (Bölüm 3, 4, 9).
  Önem: Önemli
  → KAPANDI (design-lead): UX §13.2 Bölüm 1–10 LEVELS `tutorial[]` ile birebir (tutarlılık tur 2 #0 eşitlemesinden sonra).
- [product-lead → design-lead] K-34'ün öğretimi yok; gölge eksik desteği göstermiyor.
  Önem: Önemli
  → KAPANDI (design-lead): ↓ rozeti + eksik destek taraması, `tut.ctx.support`, `tut.ctx.bounce.*`; JUICE #83, #84.
- [product-lead → design-lead] gizli (`?`) hücrede gölge nötr olmalı.
  Önem: Önemli
  → KAPANDI (design-lead): UX §5.4 satırı; `sfx_ghost_ok` çalmaz; çatlak cam yine görünür.
- [product-lead → design-lead] G-L girdisi: tahtanın her yeri girdi olursa yeni tutma yönlendirme sanılır; şantiye + vinç alanıyla sınırla.
  Önem: Önemli
  → KAPANDI (design-lead): R-10 "tahtaya dokunma" seçti; endişe UX §5.6 tutma ayrımıyla (E-40) giderildi.
- [product-lead → design-lead] bölümden çıkış onayı: `m = 0` iken can gitmez.
  Önem: Öneri
  → KAPANDI (design-lead): `m = 0` "Henüz hamle yapmadın; can gitmez." + iade; Köprü ek satırı; STORY `exit.*`.
- [product-lead → design-lead] güçlendirici akışı K-36…K-40 ile uyumlanmalı.
  Önem: Önemli
  → KAPANDI (design-lead): UX §5.2 tablosu, gri/etkin durumlar, `tut.ctx.goldtrowel`.
- [product-lead → design-lead] Açık Kepenk yalnız W4/W7'yi açar; metin fazla geniş.
  Önem: Öneri
  → KAPANDI (design-lead): W4/W7 yoksa gri yuva; JUICE #67; `tut.l20.openshutter`.
- [product-lead → design-lead] Bölüm 8 öğreticisi zorunlu Çekiç adımıyla dersi atlıyor.
  Önem: Önemli
  → KAPANDI (design-lead): LEVELS B8'e göre iki yumuşak adım; zorunlu Çekiç kalktı.
- [product-lead → design-lead] Bölüm 27 `repeat` öğreticisi panoramayı yanlış kullanıyor.
  Önem: Önemli
  → KAPANDI (design-lead): ok aynı dilimde dikey; panorama yalnız Bölüm 29 `mirrorOf`.
- [product-lead → design-lead] Bölüm 22 boya kapısı öğreticisi (P-6 sonrası).
  Önem: Öneri
  → KAPANDI (design-lead): Z boya + sahaya geri çek, Y duvar üstü, Y Fırça.
- [product-lead → design-lead] Köprü'yü bitirme durumu: pay köprü kapanınca kesinleşir.
  Önem: Önemli
  → KAPANDI (design-lead): "bitirdi, bekliyor" + "ödeme" durumları; `bridge.finished` / `bridge.payout`.
- [product-lead → design-lead] Usta Ligi çizgileri ve ödül bantları.
  Önem: Öneri
  → KAPANDI (design-lead): bronzda düşme, elmasta terfi çizgisi yok; ödül bandı ikonları.
- [product-lead → design-lead] Bonus İnşaat örnek sayıları META ile uyuşmuyor.
  Önem: Öneri
  → KAPANDI (design-lead): "+7 hamle → ● 21", mala ● 10; sayılar config'ten.
- [product-lead → design-lead] kasaba görevleri: iki küçük tutarsızlık (ilk görev adı, "Boş" durumu).
  Önem: Öneri
  → KAPANDI (design-lead): `town.ch1.t1.name` "Ağaç basamakları"; `home.empty` "Yeni yapılar yolda".
- [product-lead → design-lead] ipucu satırlarının kurala uygunluğu; metnin tek kaynağı STORY.
  Önem: Öneri
  → KAPANDI (design-lead): STORY §6 güncel; `tut.l10.crane` "istediğin yere" alınmadı (şantiyede yanlış olur).
- [product-lead → design-lead] olay oynatma sırası K-35'e bağlansın.
  Önem: Öneri
  → KAPANDI (design-lead): JUICE §0 kural 10.
- [product-lead → design-lead] Kamyon Yardımı üç varyant; cam blok başlangıç hücresine döner.
  Önem: Öneri
  → KAPANDI (design-lead): JUICE #21a/b/c; #42 düzeltildi.
- [product-lead → design-lead] balon tavanı ekranda görünmeli.
  Önem: Öneri
  → KAPANDI (design-lead): ART §4 tavan kirişi her bölümde; JUICE #43; ASSET `board_ceiling_beam`.
- [product-lead → design-lead] saklı nesne ışıltısı her zorlukta.
  Önem: Öneri
  → KAPANDI (design-lead): ART §6 ışıltı + soluk simge her zorlukta; GDD K-42 ile aynı.
- [product-lead → design-lead] palet ve renk adı (P-1, P-9).
  Önem: Öneri
  → KAPANDI (design-lead): R-05; "Gök Mavisi"; eski ad ve hex yalnız karşılaştırma sütununda.
- [product-lead → design-lead] FTUE'de bölüm öncesi pencerenin atlanması.
  Önem: Öneri
  → KAPANDI (design-lead): UX §2 notu: can yine bölüm başında ayrılır.
- [product-lead → code-lead, design-lead] [çok hedefli] ağır yerçekimi erişilebilirliği ("sayaç hiç olmasın").
  Önem: Önemli
  → KAPANDI (design-lead): R-11 ile 1400 ms; halka sayaç iki durumda görünür ("sayaç yok" kararla değişti).

---

## C. entrepreneur'e yöneltilen yorumlar

### design-lead.md → entrepreneur (11)

- [design-lead → entrepreneur] S5 / S8 simge ve mağaza görselleri: simgede blokların arkasından "bakan" kask yüz çağrıştırıyor; öne çıkan görselde Tuna merkezde.
  Önem: Önemli
  → KAPANDI (entrepreneur): S5 yeniden yazıldı (simgede karakter/kask yok, imza hareket); öne çıkan görsel tarifi; "toy box" istemleri çıktı (BUSINESS §3, STORE_LISTING §6).
- [design-lead → entrepreneur] S2 / S3 sanat ve hikaye tonu; Tuna'nın yaşı oyun içi metinde ve mağazada geçmesin (S15).
  Önem: Önemli
  → KAPANDI (entrepreneur): S15 eklendi (BUSINESS §3, P-1).
  → AÇIK SORU (ek): Tuna'nın görsel yaşı 8 mi kalsın, 10–12 görünüme mi çekilsin? (D-045)
- [design-lead → entrepreneur] E5 ve §4.3 eşit düğme boyu ↔ UX §7: üç eşit seçenek önerisi onaylanıyor mu?
  Önem: Önemli
  → KAPANDI (entrepreneur): onaylandı: 920×152 üç eşit seçenek, renkle hiyerarşi, nötr bilgi satırı, Köprü kaybında kural satırı yok (E5, §4.5-4).
- [design-lead → entrepreneur] E4 "bölüm içinde satış penceresi yok" ↔ UX'teki "+" alımları.
  Önem: Önemli
  → KAPANDI (entrepreneur): E4 kendiliğinden açılan teklifleri kapsar; oyuncunun başlattığı "+" serbest (otomatik açılmaz, duraklatır, fiyat + gerçek para + eşit "Vazgeç").
- [design-lead → entrepreneur] E2 gerçek para karşılığı görünümü (biçim, konum, para birimi).
  Önem: Öneri
  → KAPANDI (entrepreneur): biçim onaylı; web MVP TR → TL, EN → USD; tek kaynak referans paket `coins_1000` (E2, P-3).
- [design-lead → entrepreneur] P-5 etiketli botlar ↔ UX §10; "çırak" rozeti ilk günden mi?
  Önem: Önemli
  → KAPANDI (entrepreneur): kullanıcı adı biçimi yok, kask + alet avatarı, "Çırak Fındık"; rozet ilk günden: evet (§4.6, P-5).
- [design-lead → entrepreneur / code-lead] [çok hedefli] S12 yaş ekranı UX'i.
  Önem: Öneri
  → KAPANDI (entrepreneur): konum ve nötr tarif S12'ye bağlandı; yalnız mağaza sürümü (R-23, P-10).
- [design-lead → entrepreneur] ad adayları ve sanat yönü (NAMING §5); EN firma adı `{company}`.
  Önem: Öneri
  → KAPANDI (entrepreneur): görsel değerlendirme NAMING §5.1'e; "Tuna & Co." onaylı, TR "Minik Usta İnşaat" hikaye öğesi (§5.2).
- [design-lead → entrepreneur] §2 benzerlik kuralları: Festival Şatosu ↔ Royal Match, ozalit ↔ Block Blast.
  Önem: Öneri
  → KAPANDI (entrepreneur): kurallar §2'ye; yan yana karşılaştırmaya Hikaye 5 ve oyun ekranı eklendi (P-6).
- [design-lead → entrepreneur] §12.1 Albüm "Sonra" ↔ UX / STORY / ASSET; görev sahnesi MVP-lite.
  Önem: Öneri
  → KAPANDI (entrepreneur): R-19 onay; görev sahnesi = yapı belirme + tek satırlık balon (§12.1).
- [design-lead → entrepreneur] E10 günlük ödül ve LiveOps adları.
  Önem: Öneri
  → KAPANDI (entrepreneur): "bekliyor" gösterimi E10'a; "Kepche's Dig Week"; Hikaye 10 "Gribeton'la Renkli Atölye" (§7, §9.3).

### code-lead.md → entrepreneur (7)

- [code-lead → entrepreneur] bot davranışının ödemeden bağımsızlığı nasıl denetlenir; tohumda cihaz kimliği.
  Önem: Önemli
  → KAPANDI (entrepreneur): E8: saf `botSim.ts`, import yasağı, iki-kayıt eşitlik testi, `botSimVersion` + `seedHash` (tohum tutarlılık turunda META'ya eşitlendi).
- [code-lead → entrepreneur] yaş ekranı ülke bilgisi gerektiriyor; SDK başlatma sırası.
  Önem: Önemli
  → KAPANDI (entrepreneur): ülkeden bağımsız tek kural <13 / 13–17 / 18+; SDK'lar onaydan sonra dinamik import; yalnız kova saklanır.
- [code-lead → entrepreneur] takvim, ekip ve B planı; G-L yedeği; test cihazları Faz 2 başında.
  Önem: Öneri
  → KAPANDI (entrepreneur): G-L yedeği eklendi; cihazlar Faz 2 başında; §10 mutabakatı, toplam 43 hf ≈ 10 ay.
- [code-lead → entrepreneur] analytics olay listesi için tek kaynak.
  Önem: Öneri
  → KAPANDI (entrepreneur): ANALYTICS §2 tablosu (24 olay, tipler, MVP/mağaza etiketi) + §3 ortak parametreler.
- [code-lead → entrepreneur] Köprü ve reklam sayaçlarında "gün" tanımı ve saat oynatma.
  Önem: Öneri
  → KAPANDI (entrepreneur): yerel takvim günü; saat geri alınırsa `lastSeenNow`'da dondurma (§4.3).
- [code-lead → entrepreneur] gerçek para karşılığının web MVP'deki kaynağı.
  Önem: Öneri
  → KAPANDI (entrepreneur): referans paket fiyatı + `Intl.NumberFormat` + "test sürümü" etiketi; mağazada SDK fiyatı (E2, §5.1).
- [code-lead → entrepreneur] isim ve paket kimliği değiştirilemez; kısa ad.
  Önem: Öneri
  → KAPANDI (entrepreneur): NAMING §6.1 kuralları (P-13).

### product-lead.md → entrepreneur (8)

- [product-lead → entrepreneur] +5 ve ödüllü reklam: reklamla alınan +5 3 teklif sınırına dahil mi?
  Önem: Önemli
  → KAPANDI (entrepreneur): reklam yalnız 1. teklifin alternatifi; sınıra sayılır (§4.3, P-4).
- [product-lead → entrepreneur] Köprü harcama tavanı 5.400 eskalasyon basamaklarıyla tutmuyor.
  Önem: Önemli
  → KAPANDI (entrepreneur): 4.050 (`bridgeSpendCapCoins`); reklam alternatifi tavandan bağımsız (§4.5-6).
- [product-lead → entrepreneur] kumbara dolum hızı; $2,99 bu eşikle uyumlu mu?
  Önem: Önemli
  → KAPANDI (entrepreneur): R-16: $1,99, kırma 1.000, tavan 2.000, 50/75/100; ≈ Bölüm 36'da kırılabilir (§5.3, P-3).
- [product-lead → entrepreneur] içerik sonu (P-8): min + 1 dar; "Sonra" kalırsa MVP yedek kuralı yok.
  Önem: Önemli
  → KAPANDI (entrepreneur): min + 2; Usta Modu "MVP (onay bekliyor)" + koşullar; "Sonra" yedeği yazıldı (§9.2, P-8).
  → AÇIK SORU (ek): Usta Modu MVP'de mi? (R-17, D-026)
- [product-lead → entrepreneur] LiveOps parametreleri; "günde 2 pencere" modele uymuyor; çarpan botlara da.
  Önem: Öneri
  → KAPANDI (entrepreneur): `maxBridgesPerDay` + `cooldownMinutes`; lig ve hafta sonu çarpanları "botlar dahil" (§7).
- [product-lead → entrepreneur] B planı kesme sırası.
  Önem: Öneri
  → KAPANDI (entrepreneur): yalnız S6 → S5; en çok 7 bölüm; G-L ayrı yedek (§12.3, P-7).
- [product-lead → entrepreneur] MVP tablosu "K-01…K-33".
  Önem: Öneri
  → KAPANDI (entrepreneur): "K-01…K-46 (GDD)" (§12.1).
- [product-lead → entrepreneur] ödemeyen oyuncu şartı ve simülasyon sütunları.
  Önem: Öneri
  → KAPANDI (entrepreneur): R-16 ölçütü (bakiye 400–1.500 + kurtarma karışımı), bot raporu sütunları (§5.4, P-11).

### Dolaylı satırlar → entrepreneur (3)

- [code-lead → product-lead] [dolaylı] kayıt şeması: `continueSpendCapCoins: 5400`, reklam tavanları "entrepreneur_tbd".
  Önem: Öneri
  → KAPANDI (entrepreneur): 4.050, anahtar `bridgeSpendCapCoins`; reklam tavanları sayı (+5: 1/deneme, 3/gün; can 2/gün; ×2 1/gün; toplam 6).
- [code-lead → product-lead] [dolaylı] config biçimi: "entrepreneur_tbd" dizgeleri.
  Önem: Öneri
  → KAPANDI (entrepreneur): alanındaki bütün tbd değerleri sayı olarak verildi (§4.3, §5.2–5.3).
- [design-lead → product-lead] [dolaylı] kasaba görevleri, c1 t6 tabelası `{company}` ile.
  Önem: Önemli
  → KAPANDI (entrepreneur): TR "Minik Usta İnşaat", EN `{company}` = "Tuna & Co."; görev sayısı R-07 (35).

---

## D. product-lead'e yöneltilen yorumlar

### design-lead-2.md → product-lead (19)

- [design-lead → product-lead] K-34: oyuncu kuralı nasıl anlar; dört görünürlük katmanı önerisi.
  Önem: Önemli
  → KAPANDI (product-lead): GDD K-34 görünürlük kancaları (`buildFront`, `verdict.reasons` + `missingSupport`, `bounce`, `tut.ctx.support`); LEVELS B4 yumuşak adım; kural proje sahibi onayında (R-01).
- [design-lead → product-lead] öğretici metinlerin sahipliği, anahtarları ve terimler üç belgede farklı.
  Önem: Önemli
  → KAPANDI (product-lead): R-08; LEVELS `tut.l{n}.*` / `tut.ctx.*` (hepsi STORY §6'da), OBSTACLES `obs.{id}.desc`, "blok", `{n}`.
- [design-lead → product-lead] öğretici metinde renk adı ("gölge yeşilse").
  Önem: Önemli
  → KAPANDI (product-lead): LEVELS renk adsız; K-18 "oyuncu metninde renk adı geçmez".
- [design-lead → product-lead] saklı nesnelerin konumu görünür olmalı (adalet ilkesi).
  Önem: Önemli
  → KAPANDI (product-lead): GDD K-42 "örtülü ama konumu her zaman görünür"; W7, Y7, LEVELS §5.
- [design-lead → product-lead] ara sahne tetikleyicisi (META ↔ brif ↔ UX ↔ STORY).
  Önem: Önemli
  → KAPANDI (product-lead): öneriye geçildi: ch1 = 1. görevden sonra; chN (N ≥ 2) = önceki bitişten sonra ana ekranın bir sonraki açılışı; `town.cutscenes`.
- [design-lead → product-lead] kasaba görevleri: sayı, ad ve anahtarlar META ↔ STORY farklı.
  Önem: Önemli
  → KAPANDI (product-lead): R-07: STORY'nin 35 görevi esas; META + `economy.json` birebir; `town.ch{n}.t{m}.name/.scene`.
- [design-lead → product-lead / code-lead] [çok hedefli] G-L yönlendirme girdisi.
  Önem: Önemli
  → KAPANDI (product-lead): GDD K-19 G-L kuralı (R-10), E-40; çıkıntı örneği K-34'le tutarlı.
- [design-lead → product-lead] K-07 "0,3 hücre" eşiği his bozuyor.
  Önem: Önemli
  → KAPANDI (product-lead): K-07 sayı içermez, `tokens.drag.*`'a bağlı.
- [design-lead → product-lead] Bölüm 1 ilk hamle ergonomisi: (a) ilk hedef duvara yakın, (b) duvarı üst dolu satırın üstüne çıkar.
  Önem: Önemli
  → KAPANDI (product-lead): (a) ilk hedef `a` (4,7), betikle doğrulandı.
  → Kısmi RET (product-lead): (b) ölçüm "yukarı" hareketi Bölüm 1'in 2. hamlesinde gösteriyor; brif "Duvar 2" korunur, proje sahibi sorusu geri çekildi (D-039).
- [design-lead → product-lead] K-18 ayrıntıları: çatlak her zorlukta, `?` nötr, G-L gölgesi.
  Önem: Öneri
  → KAPANDI (product-lead): çatlak her zorlukta; `?` nötr ve sessiz; G-L gölgesi yönlendirmede güncellenir.
- [design-lead → product-lead] ağır yerçekimi 1400 ms UX tarifi ve Bölüm 15 balonu.
  Önem: Öneri
  → KAPANDI (product-lead): K-19 `holdMs` 700/1400, bot 700; B15 `tut.l15.setting`.
- [design-lead → product-lead] balon tavanı ekranda görünmeli.
  Önem: Öneri
  → KAPANDI (product-lead): kural aynı, kiriş design-lead'in; E-35.
- [design-lead → product-lead] kepenk sayacı rozeti.
  Önem: Öneri
  → KAPANDI (product-lead): W4 `k = period − ((m + phase) mod period)`; S5 `carouselEvery − t`.
- [design-lead → product-lead] K-06 "dokunmaya tepki vermez" ↔ UX önizleme.
  Önem: Öneri
  → KAPANDI (product-lead): R-22; "oyun durumunu değiştirmez; dokunuş yalnız önizleme" + bit eşitlik testi.
- [design-lead → product-lead] E-27: yapı tamam, `clear` hedefi eksik; şantiyeye bırakma hamle yakıyor.
  Önem: Öneri
  → KAPANDI (product-lead): K-07 satır 5: şantiyeye bırakma iptal, 0 hamle.
- [design-lead → product-lead] Altın Mala hedef seçimi görünür olmalı.
  Önem: Öneri
  → KAPANDI (product-lead): `eligibleTrowelCells` = `buildFront` (K-34 kanca 1, K-33).
- [design-lead → product-lead] Vinç Alanı yükseklik sınırı görünür olmalı; Bölüm 6'ya ikinci adım.
  Önem: Öneri
  → KAPANDI (product-lead): `blockedByWallHeight` → bağlamsal `tut.ctx.tootall`.
  → Kısmi RET (product-lead): Bölüm 6 ikinci adımı yok (Hikaye 1'de boyu > 2 blok yok; ipucu ilk karşılaşmada bağlamsal).
- [design-lead → product-lead] K-19 düşüş hızları tokens ile uyumlansın.
  Önem: Öneri
  → KAPANDI (product-lead): ms/satır sütunu çıktı; tek kaynak `tokens.physics`.
- [design-lead → product-lead] META ekranları ve ödülleri ↔ UX / JUICE listesi.
  Önem: Öneri
  → KAPANDI (product-lead): iki düzeltme (kapanma kayıp değil; `m = 0`'da can da iade), diğerleri doğru.

### code-lead-2.md → product-lead (19)

- [code-lead → product-lead] duvar = sıfır genişlikli sınır ile GDD ifadeleri.
  Önem: Öneri
  → KAPANDI (product-lead): R-03; GDD §0, K-04/05/07/08/11/12, E-05/06/07/28; OBSTACLES; LEVELS lejant.
- [code-lead → product-lead] teslimat kuyruğu sırası; `dropColumns` iki türlü okunuyor.
  Önem: Önemli
  → KAPANDI (product-lead): K-25 tek deneme noktası adım 9; `dropColumns` öncelik listesi; E-34.
- [code-lead → product-lead] Boya Kapısı `via`: "geçtiyse" ve iki kapı durumu tanımsız.
  Önem: Önemli
  → KAPANDI (product-lead): "girdiyse" (yarım girip çıkmak dahil), son girilen geçerli; E-39.
- [code-lead → product-lead] balon ile düşen blok aynı boş hücreyi hedeflerse.
  Önem: Önemli
  → KAPANDI (product-lead): R-02; K-35 adım 6 yarım adımlar (önce düşme, sonra yükselme); E-33.
- [code-lead → product-lead] K-45/9 öğretim kuralı ↔ Bölüm 4 dar geçit.
  Önem: Önemli
  → KAPANDI (product-lead): R-21: Bölüm 4 geçidi boy 2; OBSTACLES veri imzası; doğrulayıcı istisnasız.
- [code-lead → product-lead + design-lead] [çok hedefli] K-07 tutma eşiği.
  Önem: Önemli
  → KAPANDI (product-lead): token tabanlı; test token okur.
- [code-lead → product-lead] öğretici verisi ve i18n anahtarları (şema, biçim, sahip).
  Önem: Önemli
  → KAPANDI (product-lead): şema KABUL (GDD §14); LEVELS 1–10 adımları `step · mode · highlight · hand · textKey · done`.
- [code-lead → product-lead] K-43 "uygulama kapanırsa kayıp" cezalandırıcı.
  Önem: Önemli
  → KAPANDI (product-lead): R-13; K-43 madde 3, `inLevel`, E-38.
- [code-lead → product-lead] balon tavanı üç açık nokta.
  Önem: Öneri
  → KAPANDI (product-lead): E-35 tavana iner; W8 `d = |bırakma − tavan|`; E-36 teslimat balonu yükselmez.
- [code-lead → product-lead] K-19 düşüş süreleri tek kaynak olmalı.
  Önem: Öneri
  → KAPANDI (product-lead): ms sütunu çıktı.
- [code-lead → product-lead] K-30 maliyeti, güvence ve boya istismarı.
  Önem: Öneri
  → KAPANDI (product-lead): güvence 1 hamle → bütçeli 2 hamle → D3.
  → Kısmi RET (product-lead): D2'de `B1` yerine döşeyen şekil önerisi (boya istismarı net negatif; gerekçe K-30'da).
- [code-lead → product-lead] K-39 Geri Al ve Kamyon Yardımı.
  Önem: Öneri
  → KAPANDI (product-lead): yardım hamleyle birlikte geri alınır; E-37.
- [code-lead → product-lead] LEVELS 1–10 → JSON eşlemesi (`seed`, `teaches`, golden).
  Önem: Öneri
  → KAPANDI (product-lead): `seed` = `id × 1000 + id`; `teaches` isteğe bağlı; golden el çözümleri; `k<parti>_<i>`.
- [code-lead → product-lead] K-34 maliyeti (sorulmuştu).
  Önem: Öneri
  → KAPANDI (product-lead): değişiklik gerekmez (tek `isCorrectPlacement` + `buildFront`).
- [code-lead → product-lead] N-notlarının test kapsamı.
  Önem: Öneri
  → KAPANDI (product-lead): 38 `[kural]`, 5 `[not]`.
- [code-lead → product-lead] bot belirlenimciliği (hash, `Math.pow`, süre, `groupId`).
  Önem: Öneri
  → KAPANDI (product-lead): `fmix32-chain-v1`, `curveTable` tamsayı, süre içi deneme, `groupId = hash(weekId, installId)`.
- [code-lead → product-lead] kayıt şeması etkisi.
  Önem: Öneri
  → KAPANDI (product-lead): `{won, attempts}`; Köprü tavanı 4.050 `bridgeSpendCapCoins`; reklam tavanları config'te.
- [code-lead → product-lead] config biçimi (dizge formüller, "tbd").
  Önem: Öneri
  → KAPANDI (product-lead): JSON v2: formüller `_doc`'ta, tbd yok, belirsiz `null`.
- [code-lead → product-lead] Köprü ödeme zamanı ve Usta Modu sırası.
  Önem: Öneri
  → KAPANDI (product-lead): `T_öde` formülü; sıra 11…50 sonra 11 (`sequential_loop`).

### entrepreneur-2.md → product-lead (14)

- [entrepreneur → product-lead] Usta Modu MVP + üç koşul (özgün etiket, Usta Sandığı, giriş kartı).
  Önem: Önemli
  → KAPANDI (product-lead): META §8.5 "MVP (onay bekliyor)" (R-17); (a)–(c) uygulandı.
- [entrepreneur → product-lead] kumbara MVP içeriğinde açılamıyor ve değeri zayıf.
  Önem: Önemli
  → KAPANDI (product-lead): R-16 değerleri; eşik ≈ Bölüm 36.
- [entrepreneur → product-lead] `economy.json` "entrepreneur_tbd" değerleri.
  Önem: Önemli
  → KAPANDI (product-lead): değerler girdi; paket altın miktarlarına itiraz yok.
- [entrepreneur → product-lead] Köprü tur başına +5 harcama tavanı eksik.
  Önem: Önemli
  → KAPANDI (product-lead): R-16: 4.050 `bridgeSpendCapCoins`; reklam tavandan bağımsız.
- [entrepreneur → product-lead] Usta Ligi'nde bot etiketi yok.
  Önem: Önemli
  → KAPANDI (product-lead): META §7.1, `botsLabeled: true`, adlar STORY `npc.apprentice.*`.
- [entrepreneur → product-lead] "10 bölümde 2 kez +5 alamaz" yanlış kaldıraç.
  Önem: Önemli
  → KAPANDI (product-lead): R-16: bakiye bandı + kurtarma karışımı; üst sınır kalktı, ≥ 1 taban kaldı; Usta Sandığı ayar kuralı.
- [entrepreneur → product-lead] galibiyet serisi ve kayıp kaçınma.
  Önem: Öneri
  → KAPANDI (product-lead): teklif penceresinde seri yazılmaz; yumuşak sıfırlama A/B [Sonra].
- [entrepreneur → product-lead] ilk +5 teklifi ömürde bir kez ücretsiz.
  Önem: Öneri
  → KAPANDI (product-lead): MVP; teklif 1'e sayılır (`firstEverOfferFree`).
- [entrepreneur → product-lead] bölüm sandığı içeriği önceden görünür; Köprü payı koruması.
  Önem: Öneri
  → KAPANDI (product-lead): META §8.2 içerik önceden görünür; §6.2 650 < 900 koruması.
- [entrepreneur → product-lead] META kapsam etiketleri.
  Önem: Öneri
  → KAPANDI (product-lead): MVP / MVP (onay bekliyor) / Sonra.
- [entrepreneur → product-lead, code-lead] [çok hedefli] K-43 kapanınca kayıp.
  Önem: Önemli
  → KAPANDI (product-lead): R-13; kayıp penceresi açılışta aynı teklifle gelir (kaçış yok).
- [entrepreneur → product-lead] P-7 `m = 0` cezasız çıkış: katılıyorum, seri bonusu tüketilmesin.
  Önem: Öneri
  → KAPANDI (product-lead): KABUL; can + oyun öncesi güçlendirici iadesi, seri bonusu tüketilmez (E-41).
- [entrepreneur → product-lead] kısa bölümler: içerik pisti ve süre bandı.
  Önem: Önemli
  → KAPANDI (product-lead): LEVELS §0 süre bandı + `level_end.durationMs`; bütçe sorusu proje sahibine (R-18).
- [entrepreneur → product-lead, code-lead] [çok hedefli] B planı ve bağımlı engeller.
  Önem: Önemli
  → KAPANDI (product-lead): LEVELS §3 bağımlılık dizini; 31, 34, 37, 39, 40, 48, 49 + G-L yedeği 23, 49.

### Dolaylı satırlar → product-lead (9)

- [design-lead → code-lead] [dolaylı] G-L: çıkıntı altına girme kararı product-lead'in.
  Önem: Önemli
  → KAPANDI (product-lead): izinli (K-19 madde 3, K-13); örnek K-34'le tutarlı.
- [design-lead → code-lead / proje sahibi] [dolaylı] ağır yerçekimi "şantiye üstünde indirilemez" alternatifi.
  Önem: Önemli
  → RET (product-lead): R-11: 700 ms kalır + 1400 ms erişilebilirlik; "indirilemez" G-H'nin zaman dersini siler ve G-H + cam + yüksek duvar bölümlerini (ör. 42) YAO ≥ %60 altına iter.
- [design-lead → entrepreneur] [dolaylı] E10 / yol haritası Bölüm 10 adında ortaklık vurgusu.
  Önem: Öneri
  → KAPANDI (product-lead): değişiklik gerekmez (LEVELS B10 "Ağaç Ev Tamam!"); öneri destekleniyor.
- [code-lead → design-lead] [dolaylı] tokens `rules.heavyGravityHoldMs` oyun kuralıdır.
  Önem: Önemli
  → KAPANDI (product-lead): değer GDD K-19'da; iki `holdMs` tek cümleyle ayrıldı.
- [code-lead → design-lead] [dolaylı] G-L: şantiyenin yarısına dokunma.
  Önem: Öneri
  → KAPANDI (product-lead): R-10 "dokunulan taraf" kuralı, K-19.
- [code-lead → design-lead] [dolaylı] "Zaman baskısı yok" anahtarı K-19'a seçenek.
  Önem: Öneri
  → KAPANDI (product-lead): R-11: anahtar var, etkisi 1400 ms.
- [code-lead → entrepreneur] [dolaylı] gerçek para `refPrice` alanı.
  Önem: Öneri
  → KAPANDI (product-lead): `priceDisplay.referenceSku` + paket fiyatları `economy.json`'da.
- [entrepreneur → design-lead] [dolaylı] mağaza paket miktarları tek kaynak.
  Önem: Önemli
  → KAPANDI (product-lead): tek kaynak `economy.json → shop` (META §8.4).
- [entrepreneur → code-lead] [dolaylı] solver çift iş / el çözümü golden.
  Önem: Öneri
  → KAPANDI (product-lead): LEVELS §0 el çözümleri golden; 1–10 betikle yeniden doğrulandı.

---

## E. Tutarlılık denetimi (revizyon sonrası, 2026-10-05)

İki tur bağımsız denetim + şüpheci onayı; her ajan yalnız kendi dosyalarını düzeltti. Aşağıda yalnız **onaylanmış**
bulgular var (numaralar kapanış dosyalarındaki gibidir; atlanan numaralar onaylanmamış ya da başka ajana ait bulgulardır).
Hepsinin kapanış sahibi bulgunun yöneltildiği ajandır.

### product-lead (tur 1: 31, tur 2: 5 — hepsi KAPANDI)

- T1 #0 (Engel) Bölüm 4 adım 2 `tut.ctx.support` anahtarı → KAPANDI: GDD §14.1 madde 1–2, `tut.ctx.<konu>` adımda yeniden kullanılabilir.
- T1 #1 D2 yardım `B1`'lerinin zamanı ve `x`'i → KAPANDI: adım 12'de kuyruk sonuna, aynı adımda bir deneme, `x = 5`; D1 → D2 → D3.
- T1 #2 +5 kabulünden sonra kilitlenme denetimi yok → KAPANDI: K-29 adım 12 bir kez; E-42.
- T1 #3 K-23 tamamlanan hamlede `t` → KAPANDI: o hamlenin adım 10'unda artmaz.
- T1 #4 Asansör/kayar kapı sınırda dışarı bakan `dir` → KAPANDI: önce yön döner, sonra 1 adım (K-24, W5, S6).
- T1 #5 `.` hücresindeki yanlış nesne ve K-34 → KAPANDI: `.` yalnız boşken dolu sayılır; E-43.
- T1 #6 D2 sayımında moloz → KAPANDI: moloz hiçbir terimde yok, yapışmış harç arz; E-44.
- T1 #7 K-31 renk sayımı kapsamı → KAPANDI: plan ∪ bütün bloklar ∪ boya kapısı rengi.
- T1 #8 Güncelleme sonrası sürüm uyuşmazlığı → KAPANDI: deneme oynanmamış sayılır, tam iade; E-45.
- T1 #10 Yapışmış cam + harç kırılma maliyeti → KAPANDI: maliyetler toplanır (3).
- T1 #11 Duvarın iki yanında komşuluk → KAPANDI: x=5 ile x=6 komşu değil; E-46.
- T1 #12 (Engel) Zorunlu öğretici adımları kilitliyor → KAPANDI: B1 adım 2 Y; sürükleme sinyalleri; §14.1 madde 4 çalışma anı güvencesi.
- T1 #13 Bölüm 3, 5, 6'da ✓ sonrası çıkmaz → KAPANDI: veri düzeltildi, betikle doğrulandı.
- T1 #14 Bölüm 2 adım 2 "!" gösteremiyor → KAPANDI: `piece:2` hold + yeni adım 3.
- T1 #15 `tut.ctx.support` ne zaman çıkar → KAPANDI: Bölüm 4 adım 2 gösterilince `seenContextTips.support`.
- T1 #16 Reklam seçeneği yalnız 1. teklifte → KAPANDI: K-29, `rewardedAdOffer.offerIndex: 1`.
- T1 #17 Bölüm 35 Zor ama niyet gölge "doğru"ya dayanıyor → KAPANDI: niyet inşa cephesiyle yeniden yazıldı.
- T1 #18 Bölüm 7 kazı adımı yanlış konumla bitiyor → KAPANDI: `done.at: [0, 6]`.
- T1 #19 G-L gölge geçişi "aynı karede" → KAPANDI: geçiş animasyonu design-lead'in.
- T1 #20 N8 animasyon sırası → KAPANDI: yalnız olay sırası; animasyon JUICE kural 10.
- T1 #22 Açılmadan gelen güçlendirici → KAPANDI: envantere eklenir, yuva kilitli, adet görünür (META §4).
- T1 #23 LiveOps parametreleri config'te yok → KAPANDI: `events.json` `liveOps`, çarpanlar oyuncu ve botlara eşit.
- T1 #24 META §6.1 sunum dili → KAPANDI: "altın seçeneği etkin değil", sunum UX §7.
- T1 #25 META §9 türetilmiş sayılar → KAPANDI: ≈ 1.030–1.140 altın / 10 bölüm.
- T1 #26 Termos (12) ve Mala Başlangıcı (16) açılışları → KAPANDI: LEVELS §3 ve öğretici notları.
- T1 #27 `tutorial[]` sözleşmesi ↔ LEVELS → KAPANDI: `done.minMs`, EN dilim adları, `segmentDone`/`deliveryDone`.
- T1 #32 Bölüm 2 `d` çıkmazı → KAPANDI: renk değişti; min 3, YAO %100.
- T1 #33 Bölüm 4 iki `B1_0` W çıkmazı → KAPANDI: tek `C3_0`; min 4, YAO %75, bütçe 12.
- T1 #34 Bölüm 5 çıkmazları → KAPANDI: şekil/renk düzeltmesi; min 6, YAO %100.
- T1 #36 K-03 örneği satır sırası → KAPANDI.
- T1 #37 Bölüm 2 dilimi 2×5 açıklaması → KAPANDI.
- T2 #0 `level_resume_invalid` ANALYTICS'te yok → KAPANDI: GDD'de "yerel tanılama kaydı" (olay ancak tabloya girince).
- T2 #1 Duraklatma ↔ G-L penceresi → KAPANDI: K-19 madde 1 kapatan olaylar listesi; E-47.
- T2 #2 OBSTACLES S2 "`.` dolu sayılır" koşulsuz → KAPANDI: yalnız boşken.
- T2 #3 GDD §14.1/4 Z adımı yalnız `piece:` ↔ UX Bölüm 17 `debris:0` → KAPANDI (GDD): "`piece:` ya da `debris:`". TECH L-17 bağımlılığı F-2'de KAPANDI (aşağıda).
- T2 #4 K-30 bütçeleri duvar saati gibi → KAPANDI: belirlenimci iş bütçesi, `rulesVersion`.
- Ek bulgu (denetim dışı) Bölüm 9 ✓ sonrası çıkmaz adayları → KAPANDI (product-lead, F-3): Bölüm 1–10 karalama çözücüsüyle tarandı, veri düzeltildi (aşağıda F-3).

### code-lead (tur 1: 20, tur 2: 9 — hepsi KAPANDI)

- T1 #0 (Engel) Öğretici şeması ↔ UX §13.1 / LEVELS → KAPANDI: vurgu sözlüğünün tamamı, `done` olayları, `tut.ctx.*` kabulü.
- T1 #1 (Önemli) Cam kırılınca Usta Serisi sıfırlanmıyor → KAPANDI: `combo = 0`, test.
- T1 #2 (Önemli) Adım 10 zamanlayıcı sırası → KAPANDI: tek `STEP10_TIMERS` listesi.
- T1 #3 (Önemli) G-L bekleyen hamle kapanma/Geri Al/çıkışta tanımsız → KAPANDI: `flushPending()` kuralı.
- T1 #4 (Önemli) K-30 güvencesinde duvar saati bütçesi → KAPANDI: belirlenimci açılım bütçesi, bitince D3.
- T1 #5 (Önemli) Şema zorunlu alanları ve K-24/K-23/Y4 denetimleri → KAPANDI: L-24, L-25, L-26.
- T1 #6 (Önemli) Solver hamle uzayı eksik, YAO garantisi yok → KAPANDI: bırakma yüksekliği adayları, maliyet `(hamle, −duvarÜstü)`.
- T1 #7 (Önemli) Ray başlangıcı, geçit açıklığı, dilim kapısı → KAPANDI: §4.1 kuralları + 5 test.
- T1 #8 (Öneri) L-10 K-27 koşulu → KAPANDI: birikimli denetim + L-19.
- T1 #9 (Öneri) L-02 / L-12 / L-13 ayrıntıları → KAPANDI.
- T1 #10 (Öneri) Ek A etiketi, K-19/E-40 atfı, histerezis → KAPANDI.
- T1 #11 (Öneri) Kayıtta `attempts` yok, kazanma davranışı → KAPANDI: `{won, attempts}`, atomik yazım.
- T1 #13 (Öneri) Köprü tavanında "gizlenen" düğme test adı → KAPANDI: gri + `lose.bridgeCap`.
- T1 #14 (Önemli) tokens'ta olmayan yollar, `check.*` okunması → KAPANDI: `layout.grid.*`, formülle bileşik renk.
- T1 #15 (Önemli) FIT/EXPAND çapa sözleşmesi tokens ile çelişiyordu → KAPANDI: §10.1 token gruplarıyla.
- T1 #16 (Önemli) Eski düşüş fiziği sayıları → KAPANDI: yalnız token adları.
- T1 #18 (Önemli) Parlama hapı hücre sayısı → KAPANDI: parça başına tek hap.
- T1 #19 (Önemli) `audio.seq` biçimi yoktu → KAPANDI: `[startMs, number[]][]`, tek arabellek.
- T1 #20 (Öneri) Katman sırası ve atlasta R-01 katmanları ve tavan kirişi yok → KAPANDI.
- T1 #23 (Önemli) `AnalyticsEvent` birliği ANALYTICS §2'den farklı → KAPANDI: tablodan birebir. Ek AÇIK SORU entrepreneur'e (aşağıda F-1; KAPANDI).
- T2 #0 (Önemli) K-34 `.` hücresi yanlış nesneyle "dolu" sayılıyordu → KAPANDI: `wrongOcc`, `dotFree`; E-43 testleri.
- T2 #1 (Önemli) K-30 D2 arzı ve yardım `B1` teslimatı → KAPANDI: `deliverHelp`, adım 12; E-44, E-23 testleri.
- T2 #2 (Önemli) +5 kabulünden sonra adım 12, reklam yalnız 1. teklif → KAPANDI: `addMoves`, `canOfferAd`; E-42.
- T2 #3 (Önemli) Adım 4/5/10 son GDD kurallarını yansıtmıyordu → KAPANDI: maliyet toplama, sınır komşuluğu, `pingPong`.
- T2 #4 (Önemli) Geçersiz denemede iade listesi eksik → KAPANDI: `voidAttempt`; E-45.
- T2 #5 (Önemli) L-06/L-07'de boya kapısı rengi yok → KAPANDI.
- T2 #6 (Önemli) Öğretici şeması `done.at` ve `debris:<i>`'yi reddediyordu → KAPANDI: zod ile 12/12 geçti.
- T2 #7 (Önemli) `overWall`/`gapPass` sayımı, `seenContextTips`, zorunlu adım kilidi → KAPANDI.
- T2 #8 (Öneri) E aralığı ve eski not → KAPANDI: E-01…E-46.

### design-lead (tur 1: 29, tur 2: 3 — hepsi KAPANDI)

- T1 #0 Panorama gelecek dilimleri → KAPANDI: %30 opak, `?` etiketi.
- T1 #1 Harç maliyeti önizlemesi → KAPANDI: "−2" çipi yalnız yapışmış harçlı blokta.
- T1 #2 Gölge/geri sekme nedenleri ↔ `verdict.reasons` → KAPANDI: `debris` satırı, birebir eşleme.
- T1 #3 Vinç alanı "2 sıra" işareti → KAPANDI: `10 − height`.
- T1 #4 Geri Al sayaç dönüşü → KAPANDI: harcanan kadar geri.
- T1 #5 Dar geçit (W3) katmanı → KAPANDI: `gap_narrow_jaw`.
- T1 #6 Bölüm 17 vurgu kimliği → KAPANDI: `debris:<i>`.
- T1 #7 Kamyon Yardımı D1 ikinci dalı → KAPANDI: #21a/#21c ayrımı.
- T1 #8 Harç yapışmasında eksik destek → KAPANDI: JUICE #14 → #84.
- T1 #9 (Engel) ch2–ch5 başlangıç sahnesi tetikleyicisi → KAPANDI: STORY §3 ve UX §8 META §1 ile birebir.
- T1 #10 Köprü altın düğmesi gri koşulu → KAPANDI: `lose.bridgeCap`.
- T1 #11 Usta Modu kazanma ekranı → KAPANDI: özgün zorluk etiketinden miktarlar.
- T1 #12 Seri bonusu Termos ikonuyla → KAPANDI: `ui_moves_chip`.
- T1 #13 Günlük ödül ×2 altınsız günler → KAPANDI.
- T1 #14 ●, ✓, ≈ font alt kümesi → KAPANDI: alt küme + satır içi simge yer tutucuları.
- T1 #15 128 px altı dokunma hedefleri → KAPANDI: "görsel + pay" kalıbı.
- T1 #16 PriceLabel 2. satır kontrastı → KAPANDI.
- T1 #18 JUICE §0.1 K-19 cümlesi → KAPANDI.
- T1 #19 İskele sönme süresi → KAPANDI: 200 ms.
- T1 #20 Kazanma süresi → KAPANDI: `duration.win` toplam 2500.
- T1 #21 Anahtarsız görsel değerler + Kamyon Yardımı kilit süresi → KAPANDI: yeni token'lar.
- T1 #22 Çıkış onayı "Kal" düğme boyu → KAPANDI: "eşit çift düğme" kalıbı.
- T1 #23 B plan sembol mürekkebi kontrastı → KAPANDI: `planInk.B` #14233D.
- T1 #24 "Gök Mavisi" adının ekrandaki yeri → KAPANDI: yalnız belgelerde.
- T1 #25 Hikaye 4 arka plan katmanları → KAPANDI.
- T1 #26 Nötr düğme varyantı → KAPANDI.
- T1 #27 Sembol brifi çizgi/dolu → KAPANDI.
- T1 #30 Köprü kayıp penceresinde kural satırı (R-15) → KAPANDI: `lose.bridge` kaldırıldı.
- T1 #31 `tut.l26.key` ve JUICE dipnotu → KAPANDI.
- T2 #0 UX §13.2 Bölüm 1, 2, 4, 7 ↔ LEVELS `tutorial[]` → KAPANDI.
- T2 #1 Kilitli yuvada adet (META §4) → KAPANDI: gri adet rozeti, `common.unlockAt`.
- T2 #2 Kural özetleri ↔ GDD son hali (E-43) → KAPANDI.

### entrepreneur (tur 1: 6, tur 2: 2 — hepsi KAPANDI)

- T1 #0 Köprü harcama tavanı koşulu ve metni → KAPANDI: `tur harcaması + fiyat ≤ 4.050`; gri düğme.
- T1 #1 E8 bot simülasyonu girdileri ve tohum → KAPANDI: META'ya eşitlendi.
- T1 #2 Kumbara dolum hızı → KAPANDI: eşik Bölüm 36.
- T1 #3 §5.4 gelir aralığı ve Termos TL → KAPANDI.
- T1 #4 Usta Sandığı ayar kuralı ve içeriği → KAPANDI: 250 + 1 Çekiç, formül aynen.
- T1 #6 Çırak ad kalıbında EN insan adı → KAPANDI: "Apprentice Hazelnut".
- T2 #0 §5.4 gelir aralığı META §9 ile ayrışıyordu → KAPANDI: ≈ 1.030–1.140.
- T2 #1 §7 hafta temalarının `liveOps.overrides` karşılığı → KAPANDI.

### Denetim özeti

| Ajan | Onaylı bulgu | KAPANDI | Açık |
| --- | --- | --- | --- |
| product-lead | 36 | 36 | — (ek bulgu F-3 KAPANDI) |
| code-lead | 29 | 29 | — |
| design-lead | 32 | 32 | — |
| entrepreneur | 8 | 8 | — |
| **Toplam** | **105** | **105** | 0 |

Son tutarlılık turlarının sayımı aşağıda, "Son tutarlılık turları (2026-10-05)" bölümündedir.

---

## F. Sayım ve kapanmamış madde beyanı

### Yorum sayımı (hedefe göre)

| Hedef | Doğrudan | Dolaylı | Toplam satır | KAPANDI | RET | AÇIK SORU | Not |
| --- | --- | --- | --- | --- | --- | --- | --- |
| code-lead | 53 | 4 | 57 | 57 | 0 | 0 | — |
| design-lead | 66 | 2 | 68 | 68 | 0 | 0 | 2'sinde öneri kararla değişti (R-11, R-10) |
| entrepreneur | 26 | 3 | 29 | 29 | 0 | 0 | +2 ek AÇIK SORU (Usta Modu, Tuna'nın görsel yaşı) |
| product-lead | 52 | 9 | 61 | 60 | 1 | 0 | 3 kısmi RET; RET: "indirilemez" ağır yerçekimi (R-11) |
| **Toplam** | **197** | **18** | **215** | **214** | **1** | **0** | |

Tekil yorum: **191** (197 doğrudan satır − 6 çok hedefli tekrar). Kaynağa göre: design-lead.md 31, design-lead-2.md 19,
code-lead.md 22, code-lead-2.md 19, entrepreneur.md 39, entrepreneur-2.md 14, product-lead.md 47.
Öneme göre (tekil): Engel 1 · Önemli 86 · Öneri 104. Tek Engel (K-34 doğrulamada yok) kapandı.

### Kapanmamış madde beyanı

**Kapanışsız yorum ve bulgu yoktur:** 191 tekil yorumun ve 18 dolaylı satırın hepsi hedefin kapanış dosyasında KAPANDI
ya da RET ile kapanmıştır. Son tutarlılık turlarında onaylanan 94 bulgunun hepsi KAPANDI (0 RET; aşağıdaki bölüm).
F-1, F-2, F-3 KAPANDI. Proje sahibine giden sorular yorumlardan değil kararlardan doğar (DECISIONS.md'de "ÖNERİ"
kayıtları). Açık kalanlar yorum değil: ajanlar arası uygulanmamış bağımlılıklar ve proje sahibi soruları (aşağıda,
"Son tutarlılık turlarından sonra açık kalanlar").

Yorum olmayan 3 madde (orkestratör denetimi, 2026-10-05) — üçü de KAPANDI:
- **F-1 — AÇIK SORU (code-lead → entrepreneur, ANALYTICS §2):** Köprü bölümündeki +5 reklamı hangi `ad_rewarded.placement`
  değerini kullanır? (`ad_rewarded` enum'unda `bridge_loss` yok; TECH geçici olarak `out_of_moves` kullanıyor.)
  `save_corrupt`, `level_resume_invalid`, `level_end.exitFree` (bool), `level_end.truckHelps` (int) ve
  `coin_source.reason = refund` tabloya eklensin mi? ANALYTICS §2 bu tarihte değişmedi; yanıt yok. Sahip: entrepreneur.
  → KAPANDI (entrepreneur, 2026-10-05): ANALYTICS §2 v2. `ad_rewarded.placement` += `bridge_loss` (Köprü +5 reklamı;
  `offer_shown.placement` ile aynı değer; ayrı tavan değil, günlük sayaç `out_of_moves` ile ortak, BUSINESS §4.3
  perDay 3, toplam tavan 6). 5 önerinin hepsi eklendi: `level_resume_invalid { level, movesMade, cause }` (GDD K-43/4;
  geçersiz denemede `level_start`'ı kapatan olay), `coin_source.reason = refund` (TECH §11.1 `voidAttempt` iadesi),
  `level_end.exitFree` (K-43/2 `m = 0` çıkışı), `level_end.truckHelps` (Geri Al'la düşer, E-37; pano 3),
  `save_corrupt { stage, recovered }` (bozuk metin gönderilmez). §2 altına "Değer tanımları", §3'e "kurtarma / iade
  yazımından sonra gönderilir"; BUSINESS §6.4 olay listesi güncellendi. code-lead bağımlılığı (TECH §11.4, §11.1, §11.8)
  son tutarlılık turu 1 code-lead #4 ile KAPANDI.
- **F-2 — Uygulanmamış bağımlılık (product-lead T2 #3 → code-lead):** GDD §14.1/4a zorunlu öğretici adımında
  "`piece:` ya da `debris:`" diyor; TECH §8.3 L-17 hâlâ "en az bir `piece:`" diyor (UX Bölüm 17 `debris:0` Z adımını
  reddeder). Sahip: code-lead; Faz 2 #3'ten önce.
  → KAPANDI (code-lead, 2026-10-05): TECH §8.3 L-17 Z adımının vurgusunda en az bir `piece:` ya da `debris:` ister
  (yoksa `tut_highlight_invalid`); `piece:` içermeyen Z adımı `placementCorrect` ile bitemez (`tut_done_invalid`,
  K-16 koşul 2); UX Bölüm 17 `debris:0` → `yardMove` geçerli. §8.2: `yardMove` = `pieceMoved` + `to.zone = 'yard'`
  (şantiyeden sahaya moloz dahil), `placementCorrect` molozla üretilmez, `gapPass` = yolun ilk FREE → ray kenarı;
  `debris:<i>` → `CompiledLevel.tutorialPieceIds` (§2.3); zorunlu adım kilit güvencesi `piece:` ve `debris:` bloklarını
  kapsar (GDD §14.1/4b). Atlanan adım tamamlanan adımla aynı kaydı üretir (yeni olay yok). 3 test, 2 geçersiz + 1 geçerli
  L-17 fikstürü. product-lead'e kontrol sorusu (engel değil) aşağıda.
- **F-3 — Ek bulgu AÇIK (Faz 2, product-lead):** Bölüm 9'da ✓ sonrası çıkmaz adayları; `levels:solve` gelince parti 1
  sırası / şaşırtma renkleri düzeltilir; Bölüm 7, 8, 10 aynı denetimi alır.
  → KAPANDI (product-lead, 2026-10-05): Bölüm 1–10 karalama çözücüsüyle tarandı (GDD hareket, yerçekimi, K-34 ve
  teslimat kuralları; Kamyon Yardımı, Mala ve güçlendiriciler yok sayıldı; gevşetilmiş saha oyunu + çözümdeki kazı + 1
  saha hamlesine kadar tam arama + her doğru yerleşimden sonra kalan bütçeyle derin arama). Çıkmaz önce → sonra:
  B5 36 → 0, B7 110 → 0, B8 45 → 0, B9 ≥ 166 → 0, B10 (Zor) 30 → 0 kapsam içinde; B1–B4 ve B6 zaten 0. LEVELS veri
  düzeltmeleri B5, B7, B8, B9, B10'da (renk, birleştirme, parti sırası); min, YAO, bütçe, doluluk, renk kümeleri ve
  öğretici adımları değişmedi; el çözümleri betikle yeniden oynatıldı ve kazanıyor. LEVELS §0 tablosu, §4 madde 10,
  §5 ölçütü; GDD K-30 D3 cümlesi; B9 "AÇIK (Faz 2)" notu kaldırıldı. B10'da yalnız gereksiz hamlelerden sonra kalan
  durumlar belgelendi (tablo son tur 2 product-lead #0'da "30 → 2 kesin çıkmaz, Zor → uyarı" olarak düzeltildi).
  Proje sahibine soru: D3 MVP'de zorunlu mu (aşağıda).

Faz 2'ye devreden uygulama bağımlılıkları (yorum değil, design-lead → code-lead; değerler tokens/STORY'de, TECH metninde
henüz yazılı değil): i18n glif alt küme testi ve `{coin}` / `{ok}` satır içi simge çizimi, `duration.win` = 2500 toplam
(`winGlow` / `winRibbon` / `winConfetti`), Kamyon Yardımı kilidi varyanta göre (600 / 700 / 900 ms), `color.ui.badgeLocked`,
`common.unlockAt`.

---

## Son tutarlılık turları (2026-10-05)

F-1…F-3 kapandıktan sonra bütün belgeler üç tur daha bağımsız denetimden geçti. Her turda: aday bulgular → şüpheci onayı →
her ajan yalnız kendi dosyalarını düzeltti. Aşağıda yalnız **onaylanmış** bulgular var. Numaralar kapanış dosyalarındaki
"Son tutarlılık turu N" bölümleriyle aynıdır; atlanan numaralar onaylanmamış ya da başka ajana ait bulgulardır. Her
bulgunun kapanış sahibi, altında yer aldığı ajandır. Ayrıntı: `docs/review_inbox/*-closure.md`.

| Tur | Aday | Onaylı | code-lead | product-lead | design-lead | entrepreneur | KAPANDI | RET |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 48 | 39 | 7 | 12 | 11 | 9 | 39 | 0 |
| 2 | 26 | 23 | 9 | 4 | 6 | 4 | 23 | 0 |
| 3 | — | 32 | 14 | 5 | 9 | 4 | 32 | 0 |
| **Toplam** | **74 + tur 3** | **94** | **30** | **21** | **26** | **17** | **94** | **0** |

Tur 3'ün aday sayısı orkestratör özetine ulaşmadı; onaylı sayısı kapanış dosyalarından sayıldı. **Yakınsama:** tur 3'te
onaylı bulgu 32; turlar 0 onaylı bulguya inmedi (39 → 23 → 32).

### Tur 1 (aday 48, onaylı 39)

**code-lead (7)**
- #0 [Önemli] `levels:solve` ✓-tuzağı taraması TECH'te yoktu; solver Kamyon Yardımı'nı kapatmıyordu → KAPANDI: TECH yeni
  §9.8 (`levels:solve --traps`, L-27; kesin çıkmaz ve bütçe tuzağı Kolay/Normal'de hata, Zor/Çok Zor'da uyarı),
  `applyMove(…, { noTruckHelp })`; playtest botlarının oynadığı oyunda adım 12 açık kalır; Faz 3 +1 g.
- #1 [Önemli] E-47 TECH kapsamında yoktu → KAPANDI: E-01…E-47 (§0, §12.2, §12.4); §4.7 testi E-47 adıyla; Faz 3'te zorunlu.
- #2 [Önemli] Solver ek hedefleri (K-41/K-42) ve W7 anahtarını hedeflemiyordu → KAPANDI: §9.3 hedef engelleyicileri,
  §9.4 `h = max(…)` (kabul edilebilir ve tutarlı), §9.6 orta bot aynı küme; 6 test; Faz 3 +0,5 g.
- #3 [Öneri] TECH içinde doğrulayıcı listesi ve faz kapsamı tutarsız → KAPANDI: §12.2 L-21…L-26; K-19 ve K-45/9 Faz 2'de;
  `test:rules --phase N` tanımı.
- #4 [Önemli] TECH §11.4/§11.1 ANALYTICS §2 v1'e göreydi → KAPANDI: birlik v2'ye çekildi (`save_corrupt`,
  `level_resume_invalid`, `exitFree`, `truckHelps`, `bridge_loss`, `refund`); §11.1 gönderim sırası; 3 test.
- #5 [Önemli] Paket kimliği kuralı D-067 ve NAMING §6.1 ile çelişiyordu → KAPANDI: TECH §13 `com.<şirket>.<ad>`, isim
  kararından sonra ve ilk mağaza yüklemesinden önce kesinleşir.
- #6 [Önemli] Faz 2 JUICE P0 listesinde #83–84 yoktu → KAPANDI: §14.1 kapsamına ve #11 `EventPlayer` kalemine eklendi.

**product-lead (12)**
- #0 [Önemli] GDD K-30'un D3'süz güvencesi LEVELS'taki Bölüm 5/6 kesin çıkmazlarıyla tutmuyordu → KAPANDI: (b) yolu,
  güvence LEVELS §5 erişim kapsamıyla sınırlandı; kapsam dışı çıkmazlar LEVELS §0'da sayıldı; D3 sorusu proje sahibine.
- #1 [Önemli] OBSTACLES N4 torba altı saklı nesne ↔ GDD K-42 / TECH L-14 → KAPANDI: N4'ten torba çıktı, matriste Y2×W7 ve
  Y2×Y7 `·`; K-42'de torba örtü sayılmaz (`hidden_item_exposed`).
- #2 [Önemli] Kayar kapıda `a < b` ve hareket aralığı boyunca örtüşmezlik yoktu → KAPANDI: OBSTACLES W5 ve GDD K-45/3
  kısıtları, `slider_range` / `gap_overlap`, iki geçersiz örnek.
- #3 [Önemli] LEVELS §0 öğretim kuralı hedef oranlar ve bölüm sırasıyla çelişiyordu → KAPANDI: ölçülebilir tanıtım bölümü
  tanımı (27 bölüm), Normal ≥ %70 / Zor ≥ %50; 18, 24, 29 → %70, 35 → %50; bütçeler değişmedi.
- #4 [Öneri] Yapışmış harçlı cam kırılınca dönüş yeri çelişkiliydi → KAPANDI: GDD K-17 istisnası (1. adım atlanır,
  yapışma kalkar, maliyet 3) + örnek; OBSTACLES S3 ve Y8.
- #5 [Öneri] §3 engel bağımlılık dizini veriyle uyuşmuyordu → KAPANDI: W3'e 37, S2'ye 44.
- #6 [Öneri] K-45 örneği gerçek Bölüm 9'u geçersiz gösteriyordu → KAPANDI: örnek varsayımsal yapıldı.
- #7 [Önemli] Köprü beklenen payı D-024 korumasını sağlamıyordu → KAPANDI: META §6.2 kesin hesap; `events.json`
  `prizePoolCoins` 10.000 → 6.500 (en kötü ≈ 852, ortalama ≈ 605, tavan 6.863); `config:validate` `bridge_share_cap`.
- #8 [Önemli] GDD §14.1 `done` sözlüğü UX §13.2 11–38 satırlarını ifade edemiyordu; Bölüm 35 başlama anı → KAPANDI: 7 yeni
  olay + 4 süzgeç, madde 5 `startOn`, madde 6 kapsam; LEVELS §3 "11–38 `tutorial[]` `done` eşlemesi" tablosu.
- #9 [Öneri] D-026 yedek kuralı META ve `economy.json`'da yoktu → KAPANDI: META §8.5 ve §9; `masterMode.variant` +
  `replay` alanları.
- #12 [Öneri] K-43/4 analytics cümlesi koşulluydu → KAPANDI: `level_resume_invalid` ve `coin_source{refund}` koşulsuz.
- #14 [Öneri] LEVELS `levels:solve`'u Faz 2'de anıyordu (D-059) → KAPANDI: tarama Faz 3'te; Faz 2'de 1–5 golden test.

**design-lead (11)**
- #0 [Önemli] Bölüm 23 ve 32'nin Z adımında tutulabilir `piece:` yoktu → KAPANDI: B32 vurgusu `piece:<i>`; B23 iki adım
  (Z `overWall` + Y `steered`), yeni `tut.l23.light`; 14, 22, 38 Z satırları açık yazıldı.
- #1 [Önemli] D-035 "Yapı tamam!" sunumu yoktu → KAPANDI: UX §5.1 "Şantiye kapalı" durumu, JUICE #89–90, `build.done`,
  yeni tokenlar, `ui_site_ribbon`.
- #2 [Önemli] 50 sonrası pasif düğme D-026 yedeğiyle çelişiyordu → KAPANDI: UX §3 `master` / `replay` düzenleri,
  `replay.*` metinleri, §6 ve §12.
- #3 [Önemli] LiveOps parametrelerinin sunumu eksikti → KAPANDI: lig puanı yer tutucuları, `league.bonus.*`,
  `difficulty.*`, UX §10 LiveOps bandı; Köprü ek ödül ve "günlük sınır doldu" durumu.
- #4 [Önemli] Tuna'nın yaşıyla dalga geçen satır (S15, D-044) → KAPANDI: STORY §4.1 Panel 2 ve §3 Sorun sütunu yeniden yazıldı.
- #5 [Öneri] Config sayıları metne gömülüydü (D-017) → KAPANDI: `{n}`, `{max}`, `{up}` / `{down}` yer tutucuları + config eşlemesi.
- #6 [Öneri] Devam akışı teklif penceresi ve kazanma ekranı istisnalarını kapsamıyordu → KAPANDI: UX §1, §5.1, §12; JUICE #87.
- #7 [Öneri] Bölüm 12 ve 16'da `pre:` adımı 2. sıradaydı → KAPANDI: `pre:` adımı 1.; UX §13.1 kuralı + `startOn` alanı.
- #8 [Öneri] "Hamleler bitti" seçenekleri rahat bölgenin dışındaydı → KAPANDI: pencereler alttan çapalı,
  `layout.popup.panelBottomPx` 296.
- #9 [Öneri] Yedek plan panel tasarrufu yanlış (−3) → KAPANDI: −4 panel, 47 → 43; STORY §4.4–4.5 yedek plan notları.
- #10 [Öneri] ASSET "tampon yok" BUSINESS kapasitesiyle çelişiyordu → KAPANDI: ASSET §14 ≈ 126 g / 150 g / %16.

**entrepreneur (9)**
- #0 [Önemli] E2 `PriceLabel` 2. satırı her zaman `ui.inkSoft` → KAPANDI: UX §0.3 kuralı (renkli düğmede `ui.ink`), ≥ 4,5:1.
- #1 [Önemli] BUSINESS §10 Faz 2'yi 4 hafta sayıyordu (D-061) → KAPANDI: 6 + 7,7 + 4,7 + 3,6 ≈ 22 hf; B planı tetiği
  Faz 2'nin 29,5 g tamponlu planına bağlandı.
- #2 [Öneri] Ret etiketi "Vazgeç" ↔ "Hayır, teşekkürler" → KAPANDI: E4 ve E5 "Hayır, teşekkürler".
- #3 [Öneri] Eskimiş durum etiketleri ve kırık atıflar → KAPANDI: P-12 KABUL (D-038), P-13 KABUL (D-067), S12 ve P-10 UX §2.3.
- #4 [Öneri] ANALYTICS §2'de üç sorun → KAPANDI: v3 (`star_spent.task` = `ch{n}_t{m}`, `daily_double`,
  `level_load_failed`, `cutscene_missing`); BUSINESS §6.4.
- #5 [Önemli] §10 teknik ve sanat mutabakat tablosu eskiydi → KAPANDI: TECH §14 ve D-047 değerleri; pay ≈ %16.
- #6 [Önemli] Öne çıkan görselde ağaç ev D-043 ile çelişiyordu → KAPANDI: STORE_LISTING §6 ve BUSINESS S5 fener / fırın.
- #7 [Önemli] MVP kesme tablosu D-042 ve D-038'i yansıtmıyordu → KAPANDI: sol el modu "Sonra" satırı; ilk +5 hediyesi MVP.
- #9 [Öneri] NAMING §5.2 geri çekilmiş görev listesine atıf yapıyordu → KAPANDI: STORY §1 ve §4.0 Panel 3 atfı.

Tur 1'den doğan bağımlılıklar: code-lead'e TECH L-09, §5.2, §8.2/L-17, `bridge_share_cap`, pencere çapası (tur 2 #0–#2,
#8 ve tur 3 #9'da KAPANDI); product-lead'e LEVELS §3 12/16/23 sırası (tur 2 #3'te KAPANDI); entrepreneur'e Köprü havuz
sayıları (tur 2 #0–#1'de KAPANDI); design-lead'e UX Köprü havuzu 6.500 (UX §9'da uygulandı).

### Tur 2 (aday 26, onaylı 23)

**code-lead (9)**
- #0 [Önemli] TECH §8.2 öğretici şeması GDD §14.1 `done` sözlüğünü, süzgeçleri ve `startOn`'u karşılamıyordu → KAPANDI:
  16 üyeli `TutCond`, olay başına süzgeçler, `startOn`, `tap` + `pre:` pencere kapanınca biter, kilit güvencesi
  GDD §14.1/4b'ye göre; L-17 olay ↔ bölüm içeriği denetimleri; 16 test; Faz 2 +0,25 g, Faz 3 +0,5 g.
- #1 [Önemli] L-09 kayar kapı `a < b` ve aralık boyunca örtüşme denetimi yoktu → KAPANDI: `slider_range`, aralık boyunca
  `gap_overlap`; 2 fikstür.
- #2 [Önemli] K-17 yapışmış harçlı cam istisnası ve `stuck`'ın kalkması yoktu → KAPANDI: §5.2
  `returnTarget(…, { skipStart })`, `stuck` yaşam döngüsü, `MoveScratch.wasStuck`; 3 test.
- #3 [Öneri] §14.1 Faz 2 kapsamında K-31 yoktu → KAPANDI.
- #4 [Öneri] §9.5 golden'lar 1–10 diyordu (D-059) → KAPANDI: Faz 2'de 1–5, Faz 3'te 6–10.
- #5 [Öneri] G-L penceresini "yönlendirme dışındaki her girdi" kapatıyordu → KAPANDI: yalnız K-19/1 (a)–(f)
  `flushPending` çağırır; P-16; test.
- #6 [Öneri] 8×10 kenar modeline güncellenmemiş sayılar → KAPANDI: 80 hücre; tampon ≈ 2,2–2,4 KB; Geri Al ≈ 120 KB.
- #7 [Önemli] TECH §11.4 ANALYTICS v2'de kalmıştı → KAPANDI: v4'e eşitlendi (`replay`, `daily_double`,
  `level_load_failed`, `cutscene_missing`, `ch{n}_t{m}`); iki yönlü karşılaştırma 0 fark; 4 test.
- #8 [Önemli] D-024 `bridge_share_cap` denetimi TECH'te yoktu → KAPANDI: §11.3 `config:validate` kuralı, 6 test
  (6.863 geçer, 6.864 hata); Faz 4 +0,25 g.

**product-lead (4)**
- #0 [Öneri] LEVELS §0 F-3 tablosunda Bölüm 10 satırı TECH §9.8 sınıflamasıyla çelişiyordu → KAPANDI: Çıkmaz 30 → 2
  (yalnız gereksiz hamleden sonra; Zor → uyarı), israf sonrası bütçe aşımı 1.
- #1 [Öneri] GDD K-23 ve K-10 örnekleri test olarak yanlış sonuç veriyordu → KAPANDI: iki örnek düzeltildi.
- #2 [Öneri] Moloz `segment` iki yerde farklı tanımlıydı → KAPANDI: isteğe bağlı (varsayılan 0); K-45/7, OBSTACLES S4,
  LEVELS §5.
- #3 [Önemli] LEVELS §3 11–38 `done` tablosu UX §13.2 sırasıyla çelişiyordu (12, 16, 23) → KAPANDI: `pre:` adımı 1.;
  Bölüm 23 iki adım; GDD §14.1/3 atfı düzeltildi.

**entrepreneur (4)**
- #0 [Önemli] BUSINESS Köprü havuz sayıları eski 10.000'e göreydi; Hafta 2 12.000 D-024'ü bozuyordu → KAPANDI: §4.5-8
  ortalama ≈ 605 / en kötü ≈ 852; §7 havuz 6.500; Hafta 2 bitirene +1 Termos (`finisherExtras.boosters`), havuz büyümez.
- #1 [Öneri] Türetilmiş sayılar kaynakla uyuşmuyordu → KAPANDI: §5.4 ≈ 1.030–1.130; §9.1 ≈ 978.
- #2 [Öneri] D-026 yedeğinde `level_start.mode` / `level_end.mode` tanımsızdı → KAPANDI: ANALYTICS v4 `mode` += `replay`;
  zorluk ve süre panoları yalnız `story`.
- #5 [Öneri] P-13 `{company}` NAMING §5.2 ile çelişiyordu → KAPANDI: oyun adı yalnız `app.title`.

**design-lead (6)**
- #0 [Önemli] JUICE §0 kural 12 Faz 2 P0 listesi TECH §14.1'in Faz 2 kurallarının (K-33, K-43, K-26/K-17 adım 3, W1)
  sunum olaylarını içermiyordu → KAPANDI: Faz 2 P0 = #1–13, 15–20, 22, 23, 50–53, 55–58, 69–71, 83–84, 87, 88; yeni ses
  tokenları (`sfx_streak_pip`, `sfx_trowel`, `sfx_clamp`, `sfx_gap_rail`).
- #1 UX §13.2 bağlamsal tetikler GDD §14.1 ile çelişiyordu → KAPANDI: moloz bağlamsal satırı çıktı; Bölüm 13 adım 2
  `timeoutMs` 3000; `tut.l*` bağlamsal tetik olamaz.
- #2 Lig çizgi kuralı metni Bronz / Elmas'ta yanlıştı → KAPANDI: `league.rule_card.lines.both/.bronze/.diamond`,
  `league.header_lines.*`; ayrıca `lose.offer` → `lose.offer.moves` (iç içe anahtar çakışması).
- #3 Çıkış onayında "Kal" rengi ART ↔ UX → KAPANDI: ART §2.3 `ui.neutral` "Çık"; "Kal" yeşil.
- #4 Kasabanın EN adı tutarsızdı → KAPANDI: `{town}` yer tutucusu, tek kaynak `town.name`.
- #5 `shop.covers` sayıya sabit ek bağlıyordu → KAPANDI: eksiz cümle; `piggy.threshold`; STORY §0-9 kuralı.

Tur 2'den doğan bağımlılıklar: code-lead'e TECH §14.1 JUICE P0 kümesi (tur 3 #11'de KAPANDI) ve yeni i18n anahtarları /
ses dizileri; product-lead'e LEVELS 13·2 notu (tur 3 #4'te KAPANDI); code-lead'e `Mode` += `replay` (tur 2 #7'de KAPANDI).

### Tur 3 (aday: orkestratör özetinde yok, onaylı 32)

**code-lead (14)**
- #0 [Önemli] `test:rules --phase` N-notlarını ve E-22'yi Faz 2'de zorunlu kılıyordu → KAPANDI: N-notu fazı OBSTACLES
  matrisinden; Köprü/Lig E satırları Faz 4; test.
- #1 [Önemli] L-04'te ağır şekil eşiği (Bölüm 8) yoktu → KAPANDI: `heavy` yalnız `id ≥ 8`, `shape_locked`; 2 fikstür.
- #2 [Önemli] G-L yönlendirme koşulu yalnız `atRow` satırına bakıyordu → KAPANDI: kaymış konumun bütün hücreleri; test.
- #3 [Önemli] `blockedByWallHeight` sütun boyuna bakıyordu → KAPANDI: kutu yüksekliği `h > 10 − height`; test.
- #4 [Öneri] §1.4 akış özeti "yönlendirme dışı ilk girdi" diyordu → KAPANDI: K-19/1 (a)–(f) kapalı listesi.
- #5 [Öneri] L-17 güçlendirici açılışı K-44'e atıflıydı → KAPANDI: META §4 `unlockLevel`; vurgu adı → anahtar eşlemesi.
- #6 [Öneri] Ek A'da `b` hem torba hem mavi blok → KAPANDI: torba `%`; test.
- #7 [Öneri] R-19 `powFixed` diyordu → KAPANDI: `curveTable`.
- #8 [Öneri] §8.2 başlığı 35 adım diyordu → KAPANDI: zod 52/52 geçti, 15/15 reddedildi; "30 adım".
- #9 [Önemli] §10.1 pencereleri dikey ortalıyordu → KAPANDI: alttan çapa (`panelBottomPx`), layout testi.
- #10 [Önemli] G-L kaydırma eşiği UX / tokens'tan farklıydı → KAPANDI: `drag.steerSwipeMinPx` (48) ve `|dx| > |dy|`; test.
- #11 [Önemli] §14 JUICE kapsamı eski listeyle sayılıyordu → KAPANDI: JUICE §0 kural 12 ile 36 olay; Faz 2 26,25 g net /
  29,5 g tamponlu (tampon ≈ %12); Faz 2–5 93,5 g net / 110 g ≈ 22,0 hf.
- #12 [Öneri] Parmak ofseti 80 ms yazılmıştı → KAPANDI: `duration.fingerOffset` 90 ms.
- #13 [Öneri] §14.1 kesme seçeneği tutarsızdı → KAPANDI: −1 g net → 28,5 g ≈ 5,7 hf; BUSINESS tarafı entrepreneur tur 3
  #1'de KAPANDI.

**design-lead (9)**
- #0 Güncellemeyle geçersiz kalan denemenin sunumu yoktu (K-43/4, E-45, D-022) → KAPANDI: UX §1 (c) tek düğmeli
  güncelleme penceresi, iade satırı, `resume.void.*`; JUICE #87 (c); STORY dört anahtar.
- #1 UX §5.2 madde 4 Geri Al'ı yok sayıyordu → KAPANDI: Geri Al istisnası (sayaç ve Usta Serisi hamle öncesine döner).
- #2 JUICE cam kırılma dönüşü ve maliyeti → KAPANDI: #42 K-17 sırası, yapışmış harçlı camda −3.
- #3 Yapı kartı yalnız ch1 bitişinde → KAPANDI: UX §8 ve ASSET §9 yalnız `story.ch1.end` Panel 4.
- #4 `bridge.rule_card.continue` sabit +5 → KAPANDI: `+{n}` (`outOfMoves.extraMoves`).
- #5 Köprü ekranında anahtarsız ve ekli sayı metinleri → KAPANDI: `bridge.play`, `common.unlockAt`.
- #6 Sınırsız can ikonu yoktu, ∞ font alt kümesi dışında → KAPANDI: `icon_life_unlimited` (P0), ∞ yasak glif,
  `common.minutes`.
- #7 UX §2.1 ilk yükleme düşüşünü saymıyordu → KAPANDI: 8,2 s + 1,8 s pay = 10 s.
- #10 ART §6 kasa kuşak sayısı çelişkisi → KAPANDI: kuşak sayısı = kat − 1.

**entrepreneur (4)**
- #0 Mağaza "+%" değer etiketi tek kurala bağlı değildi (BUSINESS §5.2) → KAPANDI: formül yazıldı; tablo
  `economy.json`'dan yeniden üretildi (USD +%9…+%49, TL +%12…+%49).
- #1 Faz 2–5 sayıları TECH §14'ten eskiydi (BUSINESS §10) → KAPANDI: 26,25 / 29,5 g; Faz 3 ≈ 7,8 hf; 110 g ≈ 22,0 hf;
  kesme 28,5 g.
- #2 `event_end` BUSINESS §6.4 MVP listesinde yoktu → KAPANDI: eklendi; 26 MVP olayı ANALYTICS §2 ile aynı.
- #3 `store_open.source` UX girişlerini karşılamıyordu → KAPANDI: ANALYTICS v5 (`coin_plus`, `piggy`, `bridge_loss`).

**product-lead (5)**
- #0 GDD K-12 ↔ OBSTACLES S4/N14 moloz ray istisnası → KAPANDI: K-12'ye tek istisna; S4 ve N14 eşitlendi.
- #1 `clear/debris` aynı molozu iki kez sayıyordu → KAPANDI: K-41 "her moloz en çok 1 kez"; K-36; S4.
- #2 GDD §14 `tutorial[]` veri tipi satırı eskiydi → KAPANDI: `startOn?`, `Cond` süzgeçleri.
- #3 LEVELS §0 golden notu D-059 / TECH §9.5 ile çelişiyordu → KAPANDI: 1–5 Faz 2'de, 6–10 Faz 3'te.
- #4 LEVELS §3 13·2'de kaldırılmış bağlamsal tetik notu → KAPANDI.

### Son tutarlılık turlarından sonra açık kalanlar

Bunlar yorum ya da onaylı bulgu değil; tur 3 kapanışlarından doğan bağımlılıklar ve sorulardır.

Ajanlar arası uygulanmamış bağımlılıklar:
- **code-lead:** TECH §11.4 `store_open.source` birliği ANALYTICS v5'e (`'nav' | 'coin_plus' | 'piggy' | 'out_of_moves' |
  'bridge_loss' | 'lives_zero' | 'booster_plus'`); çekilmezse iki yönlü tablo testi Faz 2'de kırılır (entrepreneur tur 3 #3).
- **code-lead:** TECH §10.3 Albüm satırı "yapı kartı yalnız `story.ch1.end` Panel 4" (design-lead tur 3 #3); TECH §11.1
  `voidAttempt` bekleyen bildirim kaydı (UX §1 (c), design-lead tur 3 #0).
- **code-lead (Faz 2 uygulaması):** turların yeni i18n anahtarları ve yer tutucuları (`{town}`, `{company}`,
  `resume.void.*`, `common.ok`, `common.minutes`, `bridge.play`, `league.*`, `replay.*`, `build.done`, `tut.l23.light` …),
  yeni tokenlar ve sesler (`siteRibbon*`, `siteClosedRibbon`, `goalNudge`, `sfx_*`), `icon_life_unlimited`, devamda
  `outcomeWindow` → Pencere 1, bekleyen sandık işareti, JUICE #90.
- **design-lead:** UX §11 tel çerçevesi "+%10" → "+%9" ve STORY `shop.value` notu BUSINESS §5.2 kuralına (entrepreneur tur 3 #0).
- **product-lead (isteğe bağlı, engel değil):** Çekiç'in doğrudan kırdığı kasa/torba/zincir `obstacleHit` sayılsın mı
  (Bölüm 11/18/24 Y adımı); hamle sonu olaylarının hamle başına 1 sayılması ve plan dışı bırakılan yapışmış harçlı bloğun
  başlangıca dönüp yapışık kalması okumalarının onayı; F-2: ray kipinde başlayan molozun başlangıcının `gapPass`
  sayılmaması okuması; LEVELS §5 "Araç desteği code-lead'den istenir" → TECH §9.8 / L-27 atfı.
- **Orkestratör:** D-061 metni ("25,5 g net … 107,5 g ≈ 21,5 hf … 28 g") → 26,25 g net / 29,5 g tamponlu; Faz 2–5
  93,5 g net / 110 g ≈ 22,0 hf; kesme seçeneği 28,5 g.

Proje sahibine sorular:
- D3 (döşeme/erişim kilitlenmesi) MVP'de zorunlu mu, en azından Zor/Çok Zor bölümlerde? Şu an güvence LEVELS §5
  kapsamıyla sınırlı; kapsam dışı çıkmazlar (B5 3, B6 2, B10 2; yalnız gereksiz hamlelerden sonra) +5 teklifi ya da kayıpla
  biter (product-lead F-3, tur 1 #0; maliyet code-lead TECH §9.7).
- D-061 (Faz 2 ≈ 6 hf) hâlâ ÖNERİ. Reddedilirse BUSINESS §10 Faz 2 satırı ve B planı tetiği kesme seçeneğine (28,5 g)
  göre yeniden yazılır. Faz 2 tamponu ≈ %12 (%20 hedefinin altında); 22 haftalık planda pay kalmadı.
- Köprü havuzu 6.500 (D-024 koruması). 10.000 başlığı istenirse tek yol bot becerisini artırmak; bu durumda botlar LEVELS
  hedef bantlarını aşar (product-lead tur 1 #7).
