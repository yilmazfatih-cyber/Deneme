# code-lead inceleme kutusu — çapraz inceleme turu 1 (2026-10-04)

İncelenenler: design-lead → `ART_DIRECTION.md`, `UX_FLOWS.md`, `JUICE.md` (82 olay), `STORY.md`, `ASSET_LIST.md`,
`src/theme/tokens.json`; entrepreneur → `BUSINESS.md` (§4.4–4.6, §6.4, §10, §11, §12, P-4, P-5, P-10), `NAMING.md`.
Bakış açısı: teknik uygulanabilirlik ve maliyet; pahalı fikre ucuz alternatif. GDD/OBSTACLES/LEVELS/META bu turda yok.
Dayanak olarak kullanılan doğrulamalar: Phaser 4.2.1 kaynak ve tipleri (`node_modules/phaser`), MDN browser-compat-data
(Path2D: Safari 8+, Chrome 36+; `CanvasRenderingContext2D` yazı özellikleri: `fontKerning`, `fontStretch`,
`fontVariantCaps`, `letterSpacing`, `wordSpacing` — sayısal varyant özelliği yok), scratchpad ölçümleri (TECH_DESIGN §0).

Özet: **Engel 0 · Önemli 7 · Öneri 15** (toplam 22).

---

## design-lead

- [code-lead → design-lead] layout sözleşmesi — 120 px hücre + 60 px duvar (UX_FLOWS §0, §5.1; tokens `layout.*`) ile TECH_DESIGN'daki ~110 px / duvar 1 hücre varsayımı çelişiyor: Tasarım değerlerini kabul ediyorum (hücre 120, duvar 60, tahta 1020 px). Ancak 60 px'lik görsel duvarda benim "mantıksal duvar sütunu" modelim, geçitten geçen 120 px'lik bloğu komşu hücrelerin 30 px üstüne çizdirir. Bu yüzden çekirdeği **kenar modeline** çeviriyorum (duvar iki sütun arasındaki sıfır genişlikli sınır; K-12 "tamamen sığma" açık kural olur; TECH_DESIGN P-1 revizyonu). İkinci sorun: `layout` y değerleri 1920'ye göre mutlak, EXPAND'de (1920–2400) hangi öğenin üste, hangisinin alta yapışacağı tokens'ta yok.
  Önem: Önemli
  Düzeltme: (1) `layout.*` tek kaynak olsun; kod `cellPx`, `yardX`, `wallX`, `wallW`, `buildX` değerlerinden ızgarayı türetsin ve şu değişmezleri testle denetlesin: `yardX + 6·cellPx == wallX`, `wallX + wallW == buildX`, `buildX + 2·cellPx + marginPx ≤ 1080`. (2) `layout` öğeleri çapaya göre gruplansın: `layout.top.*` (y üstten), `layout.bottom.*` (y alttan; ör. `boosterBottom = 1920 − 1832 = 88`), `layout.board.*` (üst grubun altı ile alt grubun üstü arasında dikey ortalanır; `boardMinGapPx` ile). Ben `Layout.recompute(H)` ile uygularım.

- [code-lead → design-lead] tokens.json biçimi — kod generatörü doğrudan okuyabilir (düz hex + oran; easing adları Phaser 4 `EaseMap`'te birebir var: `Back.easeOut`, `Bounce.easeOut`…). Ama aynı değer birden çok yerde: `block.cellPx` = `layout.cellPx`; `radius.blockCorner` 22 ↔ `block.cornerRadiusRatio` 0,18 (21,6); `stroke.outlinePx` ↔ `block.outlinePx`; hazır `blockTop/Bottom/Outline` renkleri ↔ `bevelTopLighten`/`shadeBottomFactor`/`outlineFactor` çarpanları (ve `shadeRightFactor`, `seamFactor` için hazır renk yok); `shadow.contact`/`shadow.lifted` ↔ `block.contactShadow*`/`drag.liftedShadow*`/`alpha.*Shadow`. Ayrıca ART_DIRECTION §2.3'te `ui.ghostValid` yazıyor, tokens'ta `color.ghost.valid`. `rules.heavyGravityHoldMs` bir oyun kuralı (K-19, product-lead), görsel token değil. `physics.*` birimleri yazılı değil.
  Önem: Önemli
  Düzeltme: Her değerin tek kaynağı olsun: türetilen renkleri ya kaldır ya da "hesaplanmış, salt kontrol" diye işaretle. Ben `tests/theme/tokens.test.ts` ile formül ↔ hazır renk (±1) ve anahtar adlarını denetlerim. Adlar belgeyle eşitlensin (`color.ghost.*` ya da `ui.ghost*`, biri). 700 ms tokens'tan çıksın; sahne bu değeri çekirdeğin yerçekimi profilinden okur. `meta.units` eklensin: `physics` hücre/s ve hücre/s², `duration` ms, `*Px` 1080 tasarım pikseli.

- [code-lead → design-lead] blok çizim yöntemi (ART_DIRECTION §1.3, §3; ASSET_LIST `blk_<renk>_<mask>` 128 doku) — "Phaser Graphics → RenderTexture" yolu uygun değil. Phaser 4'te `Create.GenerateTexture` kaldırıldı ve RenderTexture her çizimde `render()` ister. Graphics de SVG yol dizgesini, kesik çizgiyi ve `shadowBlur`'u desteklemiyor; semboller ise SVG yolu olarak verilmiş. Ayrıca 4-komşu maske üç şeyi taşıyamaz: (a) iç (içbükey) köşe konturu çapraz komşu bilgisi ister (L, T, C3); (b) "ilk (sol üst) hücrede parlama" parça düzeyinde bir özelliktir; (c) bulanık temas gölgesi hücre sınırından taşar.
  Önem: Önemli
  Düzeltme: Çizim Canvas2D ile yapılsın (`Path2D(svgPath)`: Safari 8+, Chrome 36+), sonuç `textures.createCanvas` → `CanvasTexture` → tek `refresh()` ile yüklensin. 128 hücre karosu yerine **bölüm başında parça bazlı pişirme** öneriyorum: bölümde geçen her (şekil × renk × bayrak) birleşimi için bir doku, tipik ≤ 24 adet ≤ 360×360. Kesintisiz dış kontur, yuvarlak dış köşe, içbükey köşe, ilk hücrede parlama, iç dikiş ve sembol böylece birebir çizilir. Gölge ve gölge parıltısı için şekil başına ayrı siluet dokusu pişirilir (çalışma anında Filter yok). Parça başına 1 `Image` olur (9 hücrelik Container yerine), bu da JUICE #3/#6/#10 izlerini ucuzlatır. Renk körü modu açılınca yeniden pişirilir (~10–30 ms). Hücre karosu yalnız plan hücreleri için kalır. ASSET_LIST'teki `blk_*` satırı buna göre güncellensin.

- [code-lead → design-lead] plan hücresi tarifi P-2 (tebeşir altlık + renk %80; ART_DIRECTION §2.2, §4) — Kabul; TECH_DESIGN'daki %30'u bununla değiştireceğim. Altlık opak olduğu için `color.plan` bileşik hex'i düz dolgu olarak çizilir, karışım hesabı gerekmez. Bir noktayı netleştirmek gerekiyor: ozalit ızgarası plan hücrelerinin **üstünden**, blokların **altından** geçecek.
  Önem: Öneri
  Düzeltme: Katman sırası: ozalit zemin → plan hücreleri → ızgara katmanı (dilim başına önceden çizilmiş tek saydam doku) → bloklar. `color.plan` ile `alpha.planFill` + `board.planUnderlay` aynı sonucu iki kez tanımlıyor; birini "kontrol" diye işaretleyin (renk körü modunda %90 için hangisi esas?).

- [code-lead → design-lead] JUICE §0 kural 3 ("animasyon oynarken yeni blok tutulabilir") ile TECH_DESIGN §6.3 ("oynatma bitene kadar girdi kilitli") çelişiyor — Sizin kuralınız daha iyi his veriyor; benim kaygım, mantık durumu bitmişken ekranda hâlâ uçan bir bloğun içinden yeni blok sürüklenebilmesiydi.
  Önem: Önemli
  Düzeltme: Uzlaşı (TECH_DESIGN'ı buna göre değiştireceğim): oyuncu blok tuttuğu an `EventPlayer` tahtayı değiştiren bekleyen animasyonları **son karesine atlatır**; parçacık ve ses kendi hızında devam eder. Sürükleme ardından gerçek durumdan başlar. Kilit yalnız dilim kayması, kamyon ve karıştırmada olur (≤ 900 ms), kural 3'teki gibi. JUICE'e bir satır eklensin: "tutma anında tahta animasyonları anında tamamlanır".

- [code-lead → design-lead] maske gerektiren efektler (JUICE #12 parıltı süpürmesi, #28 ve #63 silme maskesi, #18 ve #47 şantiyenin kayıp gelmesi, UX §13.1 spot ışığı delikleri) — Phaser 4'te maske bir Filter, yani nesne başına ek render geçişi demek. Hepsi düşük seviye telefonda kare bütçesine yük.
  Önem: Öneri
  Düzeltme: Filter'sız karşılıklar: silme maskesi yerine üstteki yeni renk görüntüsünün `setCrop` genişliğini 0 → w tweenlemek (shader yok). Parıltı süpürmesi yerine parça silueti üstünde ADD/SCREEN tint'li beyaz flaş (alfa 0 → 0,6 → 0). #18'de tamamlanan dilim küçülerek panorama şeridine uçar, yeni dilim ekranın sağ kenarından girer; ekran kenarı doğal kırpar, maske gerekmez (#47 için de aynısı). Spot ışığı: delik çevresinde 4 dikdörtgen + 4 çeyrek-daire köşe görüntüsü. Faz 5 perf testinde pay kalırsa süpürme ayrıca Mask filtresiyle denenir.

- [code-lead → design-lead] Baloo 2 yükleme (ART_DIRECTION §8; FTUE) — 38 KB değişken WOFF2 tek dosya, uygun. İki teknik risk var: (1) Phaser `Text` canvas'a çizer; font yüklenmeden oluşturulan metin yedek fontla rasterize olur ve sonra düzelmez. (2) Canvas'ta `tnum` açılamaz (MDN: sayısal varyant özelliği yok). Değişken ağırlığın (600/700/800) canvas'ta, özellikle iOS'ta doğru seçildiği cihazda doğrulanmalı.
  Önem: Öneri
  Düzeltme: `index.html`'e `<link rel="preload" as="font" type="font/woff2" crossorigin>` ve `@font-face { font-weight: 400 800; font-display: block }` eklenir; Boot `document.fonts.load('800 120px "Baloo 2"')` + `'600 44px …'` bitmeden metin oluşturmaz (yerel dosya, < 50 ms). Hamle sayacı için bitmap font yerine sabit genişlikli hane yuvaları kullanırım: her rakam ayrı `Text`/kare, en geniş hane genişliğinde ortalanır. iOS'ta ağırlık seçimi bozuksa yedek: iki statik örnek (700, 800).

- [code-lead → design-lead] FTUE "8,0 s, 0 dokunuş" iddiası (UX_FLOWS §2.1) — Hesap tutarlı, 2 s pay var. Ölçülmemiş kalemler: Phaser paketi 1 375,6 KB minify / 358,1 KB gzip (orta telefonda parse/derleme 0,3–0,8 s, tahmin); prosedürel doku pişirme; tablodan bilinçli olarak dışarıda bırakılan web ilk ziyaret indirmesi. Tabloya göre paneller yükleme bitmeden başlamıyor, yani yük uzarsa doğrudan süreye ekleniyor.
  Önem: Öneri
  Düzeltme: Hedef `npm run perf`'e otomatik kapı olarak girer: soğuk başlangıç, 4× CPU yavaşlatma, ayrıca web ilk ziyaret için CDP "Fast 4G" ağ emülasyonu. Ölçüm, gezinme başlangıcı → `window.__levelInteractive`; eşik ≤ 10 s. Sıra değişikliği öneriyorum: font + giriş paneli görselleri hazır olunca paneller başlar; doku atlası, `level_001` derlemesi ve ses ön-çizimi panellerin arkasında yapılır. Giriş için yalnız 3 panel ilk yüke girer (WebP ya da SVG yer tutucu, ≤ 300 KB); diğer 44 panel tembel yüklenir.

- [code-lead → design-lead] parçacık bütçesi (JUICE §0 kural 4; tokens `particles`) — 120 ekranda / 40 patlama WebGL'de rahat, onaylıyorum. `win: 80` ise `maxPerBurst: 40` ile çelişiyor gibi duruyor; JUICE "2 dalga" diyor ama token bunu söylemiyor.
  Önem: Öneri
  Düzeltme: `particles.win` dalga başına 40 olarak yazılsın + `winWaves: 2`. Uygulama: doku ailesi başına bir `ParticleEmitter` (sahne açılışında). Phaser 4'teki `maxAliveParticles` alanıyla bütçe emitter'lara bölünür ("en eski patlama erken söner" kuralı buradan gelir). `reducedFactor` 0,2 doğrudan çarpan olarak uygulanır.

- [code-lead → design-lead] ses (JUICE §0 kural 6, ASSET_LIST §13: ~76 prosedürel efekt + `music_win`) — ZzFX'in `buildSamples`'ı bu tariflerin çoğunu karşılıyor (sine/üçgen/testere/gürültü, slide, bitcrush, tremolo, gecikme). Çok notalı fanfar ve `music_win`, notaların tek arabellekte karıştırılmasıyla yapılır. Ama 76 efektin hepsini ilk dokunuşta çizmek takılma yaratır. Ayrıca açılış logosundaki sesler (#79) ilk açılışta çalınamaz: kilitliyken başlatılan WebAudio kaynakları bağlam açılınca **topluca** çalar.
  Önem: Öneri
  Düzeltme: Efektler 22,05 kHz mono olarak sahne bazında ve boşta dilimlenerek (≤ 4 ms/kare) çizilir. Kilitliyken çalma istekleri **atılır**, kuyruğa alınmaz; açılış sesleri süs kabul edilsin. Perde ve ses farkları (`sfx_place_ok` kombo perdesi, `sfx_coin` +1 yarım ton, `sfx_voice_*` ±2 yarım ton, `sfx_land` +0…+4 dB) yeniden çizimle değil çalma `rate`/`volume` parametresiyle yapılır; tarif tablolarında bu yeterli. `sfx_fall` "düşüş süresince" efekti en uzun hâliyle çizilip inişte durdurulur.

- [code-lead → design-lead] kasaba katmanları bellek maliyeti (ASSET_LIST §7: 35 parça "≤ 1080×1200, şeffaf", + `town_ch<n>_base`) — Her tam tuval katman GPU'da ~5,2 MB (RGBA). Bir hikaye bölümünde 1 temel + 7 parça ≈ 41 MB, üstüne arka plan katmanları. Düşük seviye Android/WKWebView için fazla; WebP çözme süresi de ana ekran açılışına eklenir.
  Önem: Önemli
  Düzeltme: Parçalar sınır kutusuna kırpılıp `{x, y}` ofsetiyle teslim edilsin ve bölüm başına 1–2 atlasa (2048×2048) paketlensin. Yalnız aktif hikaye bölümü yüklenir, bölüm değişince boşaltılır. Ara sahne panelleri (47 × 1000×1000 ≈ 4 MB GPU/panel) de aynı ilkeyle: o an gösterilen + sıradaki panel bellekte, öncekiler yok edilir.

- [code-lead → design-lead] mağaza görüntüleri ve ekran aracı (ASSET_LIST §11 `store_screenshots` 1290×2796 / 1080×1920) — `npm run screens` 390×844 @3 = 1170×2532 üretiyor; bu boyutlar oradan çıkmaz.
  Önem: Öneri
  Düzeltme: `tools/screens.ts`'e iki profil eklerim: `--profile ios67` (430×932 @3 = 1290×2796) ve `--profile android` (360×640 @3 = 1080×1920). Tasarım EXPAND çapalarıyla iki oranda da düzgün görünmeli; bu yüzden §0 çapa sözleşmesi (ilk madde) şart.

- [code-lead → design-lead] Albüm kapsamı (UX_FLOWS §3 alt nav, §8 "Albüme eklendi", §12 akış; STORY bölüm sonu kartları) ↔ BUSINESS §12.1 "Albüm sekmesi: Sonra (kilitli gösterilir)" — Albüm ayrı bir ekran, kart ve izlenmiş sahne verisi, ayrıca kayıt alanı demek. MVP'de yapılmazsa maliyet düşer.
  Önem: Öneri
  Düzeltme: MVP'de Albüm sekmesi Takım gibi kilitli "Yakında" olsun. Bölüm sonu sahnesinin son paneli "Albüme eklendi" yerine yapı kartını yalnız gösterip kapansın. Akış diyagramından `AL` düğümü Sonra'ya taşınsın.

- [code-lead → design-lead] hafif yerçekiminde yönlendirme girdisi (JUICE #46, UX §13.2 Bölüm 23: "düşerken bloğa tap") — Düşen blok küçük ve hareketli bir hedef; isabet zor, yanlış dokunuş ise ölçülemeyen zorluk demek. Çekirdek modeli (`steer.atRow`) girdiden bağımsız, yani değişiklik ucuz (TECH_DESIGN R-2).
  Önem: Öneri
  Düzeltme: Düşüş sırasında **şantiyenin sol ya da sağ yarısına** dokunmak, bloğu o sütuna kaydırsın (büyük hedef; tek genişlikli blokta tek anlamlı). Öğretici eli aynı alanı gösterir. Karar design-lead + product-lead.

- [code-lead → design-lead] ağır yerçekimi 700 ms ve erişilebilirlik (UX_FLOWS §14, JUICE #45) — "Animasyonları azalt" süreyi değiştirmiyor, ama motor becerisi kısıtlı oyuncu için zaman baskısını kapatacak bir yol yok. Solver ve bot bu kuralı ölçemiyor (TECH_DESIGN R-3).
  Önem: Öneri
  Düzeltme: Ayarlara "Zaman baskısı yok" anahtarı eklensin. Açıkken ağır yerçekiminde blok indirilemez (geçtiği yükseklikten düşer), 700 ms sayacı yok. Deterministik ve ölçülebilir; product-lead K-19'a seçenek olarak yazar.

## entrepreneur

- [code-lead → entrepreneur] bot davranışının ödemeden bağımsızlığı nasıl denetlenir (BUSINESS E8, P-4, P-5) — Uygulanabilir, ve kodda kanıtlanabilir hâle getirilebilir. Not: TECH_DESIGN §11.2'deki tohum `hash32(instanceId, saveInstallId)` cihaz kimliğini de karıştırıyor. Ödemeyle ilgisi yok ama E8'in "yalnız etkinlik kimliği + zaman" ifadesine uymuyor.
  Önem: Önemli
  Düzeltme: (1) Bot simülasyonu saf bir modül olur (`src/services/events/botSim.ts`) ve imzası yalnız `(eventInstanceId, cohortIndex, config, joinAt, now)` alır. (2) ESLint `no-restricted-imports`, bu klasörden `meta/economy`, `services/save`, satın alma ve analytics importunu yasaklar (TECH_DESIGN §1.3'teki gibi derlemede kırılır). (3) Test: aynı etkinlik iki kayıt fikstürüyle (0 satın alma ↔ 50 satın alma, 0 ↔ 1 M altın, +5 kullanmış ↔ kullanmamış) çalıştırılır, bot sıralamaları birebir eşit olmalı. Ayrıca sabit tohumlu golden zaman çizelgesi. (4) `event_join` analytics olayına `botSimVersion` + `seedHash` eklenir; backend geldiğinde sonuçlar sunucuda yeniden hesaplanıp karşılaştırılabilir. Tohumu E8'e göre `hash32(eventInstanceId, cohortIndex)` yapacağım; `cohortIndex` = katılım saatinin kovası, oyuncu davranışı ama ödeme değil.

- [code-lead → entrepreneur] yaş ekranı P-10 / S12 — "13 ≤ yaş < ülkenin Madde 8 yaşı" ve "TR'de 18 altı" kuralları ülke bilgisi istiyor. Konum izni ve sunucu olmadan güvenilir ülke yok: cihaz dil/bölgesi (`Intl…locale`) yanıltıcı, mağaza ülkesi native API ister. SDK başlatma sırası da kodda kesin kural olmalı.
  Önem: Önemli
  Düzeltme: Ülkeden bağımsız tek ihtiyatlı kural önerisi: < 13 → çocuk muamelesi (kimlikli analitik ve kişiselleştirilmiş reklam yok); 13–17 → kişiselleştirilmemiş reklam (Madde 8 üst sınırı 16'yı ve TR 18 kuralını tek seferde kapsar); 18+ → onaya göre. Kod tarafı: `ConsentGate` servisi. Reklam ve analitik sağlayıcıları yalnız onay sonrasında **dinamik import** ile yüklenir; ondan önce `track()` yerelde tamponlanır (web MVP'deki gibi). Kayıtta yalnız `ageBucket` ve onay sürümü tutulur. Kararınız ülke bazlı kalacaksa ülkenin kaynağını (mağaza ülkesi mi, cihaz bölgesi mi) yazın.

- [code-lead → entrepreneur] takvim, ekip ve B planı (BUSINESS §10, §12.3, R-09) — Faz 2'nin 4 haftası benim planımla uyumlu (≈ 21 iş günü, TECH_DESIGN §14). Faz 3'ün 8 haftası solver + bot + 21 yeni engel + 45 bölüm için sıkı ama makul. B planı listesi (S5, W8, Y8, S6, S8) en pahalı mekaniklerle büyük ölçüde örtüşüyor. Eksik olan G-L: hafif yerçekiminde düşerken yönlendirme hem çekirdekte iki aşamalı commit hem solver dallanması getiriyor. R-09'daki "referans düşük seviye cihazda haftalık ölçüm" ise test cihazları ancak Aşama 1'de geliyorsa başlayamaz.
  Önem: Öneri
  Düzeltme: B planına "G-L: yönlendirme yok, yalnız yavaş düşüş" seçeneği eklensin. Test cihazları (§10 bütçesindeki 2 düşük + 1 orta Android, 1 eski iPhone) **Faz 2 başında** alınsın; Faz 2 çıkış kapısında perf ölçümü gerçek düşük seviye Android'de yapılsın.

- [code-lead → entrepreneur] analytics olay listesi (BUSINESS §6.4 ek olaylar: `offer_result`, `ad_rewarded`, `coin_source`/`coin_sink`, `event_continue`, `store_open`, `chest_open`, `session_end`, `settings_changed`, `age_gate_result`, `consent_result`) — TECH_DESIGN §11.4'teki tip birliğinde yoklar. İki belge kolayca ayrışabilir.
  Önem: Öneri
  Düzeltme: Olay adları ve parametreleri için tek kaynak `ANALYTICS.md` tablosu olsun (entrepreneur + code-lead). Ben tip birliğini oradan güncellerim ve tablodaki her olayın kodda var olduğunu denetleyen bir test eklerim. Parametre tipleri (sayı, metin, sabit liste) tabloda yazılsın.

- [code-lead → entrepreneur] Köprü ve reklam sayaçları (P-4: deneme başına en fazla 3 teklif, tur başına 5 400 altın tavanı, günlük 3 reklam; E10 günlük ödül) — Uygulanabilir, ama "gün" tanımı ve saat oynatma davranışı yazılı değil.
  Önem: Öneri
  Düzeltme: "Gün" = cihazın yerel takvim günü. Saat geri alınırsa (`now < lastSeenNow`) sayaçlar ve etkinlik simülasyonu `lastSeenNow`'da dondurulur (TECH_DESIGN §11.2). Sayaçlar kayıtta etkinlik örneği kimliği ve gün anahtarıyla tutulur. Kabul ederseniz §4.5'e tek satır olarak eklenmesi yeter.

- [code-lead → entrepreneur] gerçek para karşılığı (E2: "900 altın ≈ $1,79") — Native'de fiyat, faturalama API'sinin yerelleştirilmiş fiyatından hesaplanır. Web MVP'de mağaza fiyatı yok.
  Önem: Öneri
  Düzeltme: MVP'de karşılık `config/economy.json` içindeki para birimi başına referans fiyattan (`refPrice: { TRY, USD }`) ve `Intl.NumberFormat` ile gösterilir, yanında E9 "test sürümü" etiketi. Mağaza sürümünde aynı alan faturalama SDK'sının mikro-birim fiyatıyla değiştirilir. Alan product-lead + entrepreneur'ündür; ben şemasını yazarım.

- [code-lead → entrepreneur] isim ve paket kimliği (NAMING §5–§6) — iOS bundle ID ve Android `applicationId` yayından sonra **değiştirilemez** ve Play URL'sinde görünür. Görünen ad ise sonradan değişebilir. Adaylarda "&" (`Lift & Land`) ve Türkçe karakter (`Kaldır`) var.
  Önem: Öneri
  Düzeltme: Paket kimliği isim kararından sonra, ilk mağaza yüklemesinden (Faz 5 `npx cap init`) önce kesinleşsin. Yalnız `[a-z0-9.]` içersin, "kids/little/minik" içermesin (ör. `com.<şirket>.<adyok>`). Her dil için ana ekran ve PWA `short_name` için ≤ 12 karakterlik kısa ad verilsin; ana ekranda uzun adların kısaldığını cihazda doğrularız. "&" Android `strings.xml`'de `&amp;` olarak kaçırılır. Kod içi kimlikler (kayıt anahtarı `minikusta.save`, klasör adları) kod adı olarak kalır; böylece isim değişikliği kayıt göçü gerektirmez. Oyun adı metinleri yalnız i18n anahtarında (`app.title`, STORY'deki `{company}`).
