# design-lead — Faz 2 ekran incelemesi (dikey dilim, Bölüm 1–5)

İncelenen: `npm run screens` çıktısı, `artifacts/screens/390x844/*.png` ve `artifacts/screens/360x800/*.png` (18 + 18
görüntü). Ölçüt: `docs/ART_DIRECTION.md`, `docs/UX_FLOWS.md` (§0, §1, §2, §5, §6, §7, §13), `docs/JUICE.md` (§0 kural 12
P0 listesi), `src/theme/tokens.json`, D-014 (gölge çift kodlama), D-015 (EXPAND). Önem: **Engel** = oynanamaz /
okunamaz / yanlış kural gösteriliyor · **Önemli** = Faz 2'de kapanmalı · **Öneri** = sonra.

## Tur 1 (2026-10-06)

Ekranlar yeniden çekildi (`npm run screens`, iki profil). Genel durum: tahta, plan hücreleri, inşa cephesi (K-34 katman
1), serbest düşüşte doğru/hatalı gölge (düz yeşil + ✓ / kesik kırmızı + !), eksik destek taraması (yatay sarı),
pencereler (eşit düğmeler, baskı metni yok, "Teklif 1/3" görünür, × var), EXPAND çapaları (üst grup üstte, tahta
208 / 240 px aşağı, pencereler alttan çapalı, birincil eylemler y ≥ 1400) ve Baloo 2 ile Türkçe karakterler (ğ ü ş ı İ
ö ç; "HAMLELER BİTTİ!", "KALDIĞIN YERDEN DEVAM", "Bonus İnşaat") doğru. 360 px'te yatay taşma yok. Dokunma hedefleri
kodda doğrulandı: duraklat 128, anahtar satırı 128 (`Popup.ts:276` satır bölgesi), metin düğme ve seçenekler
`hitArea(…, touch.minTargetPx)`, × 144, eşit çift 440×152, "Devam" 640×176.

### Engel

- [design-lead → code-lead] 09-drag-support-k34, 10-drag-rail-gap (iki profil): **rayda (K-12) gölge konturu ve rozeti
  sürüklenen bloğun altında kalıyor** → UX §5.4 "Ray" satırına göre kontur doğrudan bloğun üstünde gösterilmeli.
  Kanıt: `ShadowView.ts:49-51` gövde/kontur/rozet `DEPTH.fallShadow` (70) + 0…3; sürüklenen blok `DEPTH.draggedBlock`
  (90, `depth.ts:26-30`); rayda `look.body = false` olduğu için kontur bloğun **tam aynı yerinde**. 09'da yalnız bloğun
  üst/alt kenarında kırmızı kesik kırıntıları görünüyor, **↓ rozeti hiç görünmüyor**; 10'da doğru yerleşimin düz yeşil
  konturu ve ✓ rozeti yok. Bölüm 3–4 W1'i (ray) öğreten bölümler; oyuncu rayda bırakmadan önce doğru/hatalı/K-34
  bilgisini alamıyor (K-18 "her zaman görünür", D-014).
  Öneri: `look.body === false` iken kontur ve rozeti `DEPTH.draggedBlock + 1` (ya da `effects`) derinliğinde çiz,
  sürüklenen bloğun görsel ölçeğini (1,08; azaltılmış harekette 1,03) ve konumunu her karede izlesin; rozet bloğun
  sağ üst hücresinde. Test: `tests/scenes/*` "rail look draws outline and badge above the dragged block".

### Önemli

- [design-lead → code-lead] 08-drag-wrong (iki profil): **renk uyuşmazlığında 45° tarama yok** → UX §5.4 "Hatalı —
  renk" satırı: uyuşmayan hücrelerde 45° tarama (pencere / plan dışı / moloz satırlarında da). Şu an ayrım yalnız kesik
  kırmızı kontur + "!" ile; renk körü oyuncu için tarama hangi hücrenin yanlış olduğunu gösteren tek işaret.
  Kanıt: `shadowLook.ts:7-13` tablosunda bu sütun yok, yalnız `supportCells`; çekirdek `Verdict` hücre listesi
  vermiyor (`gravity.ts:292-310` `shadowInfo` → `reasons`, `missingSupport`).
  Öneri: çekirdeğe `verdict.wrongCells` (birincil nedenin hücreleri: `color` uyuşmayan, `window` `.`, `outside` plan
  dışı, `debris` bütün gölge) ekle; `ShadowLook.mismatchCells` → `ghost_hatch45` çerçevesi (`color.ghost.invalid`,
  6 px çizgi, 20 px aralık; yalnız Kolay/Normal), `pulse` ile aynı 2 Hz.

- [design-lead → code-lead] 07-drag-correct, 08-drag-wrong (iki profil): **düşüş yolu çizilmiyor** → UX §5.4 "Düşüş yolu:
  bloktan gölgeye dikey noktalı çizgi (beyaz %35, 8/12)", bütün zorluklarda. Bloğun altından gölgeye kadar 6 boş satır
  var (ozalit + plan dışı), ama çizgi yok; oyuncu bloğun hangi sütundan düşeceğini yalnız gölgeden çıkarıyor.
  Kanıt: `ShadowView.ts:1-8` yalnız gövde/kontur/rozet/tarama çiziyor; kodda `ghost_path` benzeri öğe yok.
  Öneri: her dolu sütun için bloğun alt kenarından gölgenin üst kenarına pişirilmiş kesik dikey şerit (`ghost_path`,
  6 px, 8/12, beyaz %35), `DEPTH.fallShadow`; rayda ve iptal öngörüsünde gizli.

- [design-lead → code-lead] 02-l1-start, 18-tutorial-l1, 04-l3-start, 05-l4-start, 09, 10, 11-truck-chip-l5 (iki profil):
  **Usta Dede balonu HUD'u örtüyor** — büst duraklat düğmesinin üstünde, balon hedefler panelini ("0/1", "1/2")
  kapatıyor. UX §13.1 "üst yarıda, hedefi kapatmayacak yerde"; hedefler paneli öğreticinin anlattığı bilgiyi taşıyor.
  Kanıt: `TutorialOverlay.ts:192-199` ilk aday `y = marginPx`; `highlights.ts:157` ilk delikle kesişmeyen adayı alır,
  HUD'u engel saymaz. Yalnız panorama vurgulanan adımlarda (03, 06) balon aşağı iniyor.
  Öneri: aday sırası (1) üst grup altı ile vinç alanı arası bant (`layout.top` hedefler alt kenarı 264 + 16;
  EXPAND'de bu bant 390×844'te 232 px, 360×800'de 264 px — iki satırlık balon ≈ 185 px sığar), (2) vinç bandı,
  (3) durum şeridinin üstü, (4) en son `y = marginPx`; duraklat / hedefler / hamle dikdörtgenlerini `bubbleSpot`'ta
  ceza alanı say.

- [design-lead → code-lead] 10-drag-rail-gap (iki profil): **spot ışığı deliği bloğu izlemiyor** — Bölüm 3 adım 3
  (`piece:1` "rayda") sürükleme sırasında `gapPass` ile başlıyor; delik bloğun sahadaki eski yerinde (4..5, 2), eldiven
  ve dokunma halkası raydaki blokta (6..7, 2). Bırakınca da delik yerinde kalıyor.
  Kanıt: delikler yalnız adım değişince ya da yeniden boyutlanınca kuruluyor (`TutorialOverlay.ts:97-121`,
  `LevelScene.ts:551-558` `show()` yalnız içerik anahtarı değişince). Aynı desen Bölüm 1 adım 2'de (`piece:0` +
  `build`, `overWall` ile blok parmaktayken başlıyor).
  Öneri: vurgulanan parçanın çapası değişince (hamle işlenip tahta durunca) delikleri yeniden kur; sürükleme sırasında
  başlayan adımda `piece:` deliği parçanın o anki (ray / sürükleme) kutusunu kullansın.

- [design-lead → code-lead] 12-win (iki profil): **"KAZANDIN!" başlığı kazanma ekranında yok** → UX §6 başlık
  `win.title` display 120 px; ekranın ana mesajı. JUICE #55 başlığı gösteriyor ama pencere açılırken siliniyor.
  Kanıt: `LevelScene.ts:833` `showEnd()` kazanma için de `this.player.hideBanners()` çağırıyor; `WinScreen.ts`'te başlık
  yok (yalnız Bonus satırları + ödül satırı + "Devam").
  Öneri: `kind === 'win'` iken başlığı gizleme (yalnız kendi başlığı olan kayıp pencerelerinde gizle) ya da
  `WinScreen`'e `upper(t('win.title'))` başlığını vinç bandına (tahta üstü, `font.size.display`) ekle.

- [design-lead → code-lead] 12-win: **kazanma paneli tahtanın altını ve Usta Serisi şeridini örtüyor** — 390×844'te
  saha 0. satırı ve "Usta Serisi" etiketinin yarısı, 360×800'de etiketin tamamı ("Us…") panelin altında kalıyor
  (kırpılmış metin).
  Kanıt: `WinScreen.ts:38-58` satırlar düğme üstünden `winLinesAboveButtonPx` (340) yukarıda → panel üstü
  H − 144 − 176 − 340 − 60 − 60 = 1557 px (390×844, H 2337); tahta alt kenarı 1488 + 208 = 1696, durum şeridi 1712–1808.
  Öneri: paneli durum şeridinin alt kenarı (`layout.board.status` y + h + 24) ile düğme üstü arasına çapala (iki
  profilde 200–240 px'lik bant; 1 satır + ödül satırı 180 px sığar); sığmazsa önce satır aralığı 60 → 52.

- [design-lead → code-lead] 17-resume-strip (iki profil): **"Bölüm 2 · hamlelerin kayıtlı" şeridi pencere karartmasının
  altında** — beyaz yazı karartmayla griye dönüyor (dolgu ≈ 1,5:1; okunurluğu yalnız kontur taşıyor), şerit zemini yok.
  UX §1 / JUICE #87 "üstte 1,5 s şerit". UX §14 kontrast ≥ 4,5:1.
  Kanıt: `EventPlayer.ts:1410-1417` metin `DEPTH.hud + 10` (210) < `DEPTH.windows` (300, `depth.ts:38`).
  Öneri: derinlik `DEPTH.windows + 5`; krem hap zemin (`ui.panel`, köşe `radius.chip`, h 96, yatay pay 32) üstünde
  `ui.ink` yazı (12,5:1), vinç bandında (pencere paneliyle çakışmaz).

- [design-lead → code-lead] 14-lose-2-life (iki profil): **can ikonu kalp gibi okunmuyor** — iki lob birleşip düz tepeli
  bir kalkan/iğne biçimi oluşuyor; tepedeki kalp çentiği yok.
  Kanıt: `icons.ts:41-62` `heartSpan` her satırda iki dairenin **en sol–en sağ** aralığını tek dikdörtgenle dolduruyor;
  loblar arasındaki boşluk da boyanıyor.
  Öneri: her dairenin kendi aralığını ayrı `fillRect` ile çiz (ya da 2 × `fillCircle` + `fillTriangle`); çentik
  derinliği ≥ 0,12 d; ART §9 beyaz yıldız çıkartması da eklensin (Öneri düzeyi).

- [design-lead → code-lead] 11-truck-chip-l5 (iki profil): **"Kamyonda: 1" yazısı turuncu üstünde beyaz, konturu yok**
  → kontrast ≈ 2,1:1 (38 px metin). ART §2.3: renkli zeminde küçük metin `ui.ink` (turuncu üstünde 6,5:1); beyaz yalnız
  0,12 em kontur + 4 px gölgeyle (düğme kalıbı).
  Kanıt: `StatusStrip.ts:79` `textStyle('small', C.inkOnDark)`, kontur yok.
  Öneri: `C.ink` dolgu (ya da beyaz + `ui.secondaryStroke` 0,12 em kontur).

- [design-lead → code-lead] ekran seti (tools/screens.ts): **inceleme kapsamı eksik** — (a) `--cvd` yok (TECH §12.2,
  §14.1 #15 "profiller, CVD"); (b) Bölüm 1–5 yalnız W, Y, G, R kullanıyor, O / C / B / P hiç çekilmiyor → 8 rengin
  360 px'te okunurluğu incelenemiyor; (c) `01-intro` duvar saatiyle çekiliyor: 390'da panel 1, 360'ta panel 2 (kararsız);
  (d) çekilmeyen Faz 2 ekranları: asgari ana ekran (Bölüm 1 sonrası "BÖLÜM 2" nabzı, Bölüm 5 sonrası `home.moreSoon`),
  normal Duraklat penceresi, iptal öngörüsü (↩), geri sekme + #84 eksik destek yanıp sönmesi, Altın Mala (#16 / #17).
  Kanıt: `tools/screens.ts` seçenekleri yalnız `--profile`, `--only`; `grep -i cvd tools src/harness` boş.
  Öneri: `--cvd` (`&cvd=` → `#game` SVG `feColorMatrix`, Machado), harness fikstürü `19-palette` (8 blok + 8 plan
  hücresi + cephe varyantı + `.` + `?`, iki profil), `01a/01b/01c-intro` (harness `introPanel(n)`), `20-home-l2`,
  `21-home-more-soon`, `22-pause`, `23-cancel-preview`, `24-bounce-support`, `25-trowel-pick`.

### Öneri

- [design-lead → code-lead] 01-intro (iki profil): konuşma balonunun kuyruğu yok, konuşan belli değil; karakterler
  ART §11.7 yer tutucu SVG'lerini kullanmıyor (Tuna'nın dev eldivenleri, Dede'nin kalın yuvarlak gözlüğü = imza
  siluetleri; 360'ta panel 2'de Dede yerden çıkan bir büst). Öğretici büstünde de (`icons.ts` `drawDedeBust`) gözlük
  yok. → §11.7 SVG'lerini `Path2D` ile pişir; balona konuşana dönük kuyruk.
- [design-lead → code-lead] durum şeridi (02–18): Altın Mala ikonu boştayken bej üstünde bej (≈ 1,3:1), mala değil
  bayrak gibi okunuyor. → `ui.gold` + `ui.ink` konturlu ikon, pasifken %45 opak.
- [design-lead → code-lead] HUD (12–17): panorama şeridinin zemini yok; 12 px'lik minik plan gökyüzünde yüzüyor.
  → hedefler paneliyle aynı `ui.panelInset` zeminli 592×110 kutu.

### design-lead kendi işleri (bu tur, kendi dosyalarımda)

- ART §5 / tokens `color.board.rail`: ray rengi iskele kuşağıyla aynı (#8A96A3) ve aynı satır sınırında; 04 / 10'da ray
  kuşaktan ayrılmıyor → ray rengini koyu çelik + 8 px'e çekeceğim (ART §5, tokens).
- STORY §7.5 `tut.ctx.resume` "Kaldığın yerden devam, evlat." başlık `resume.title` ile aynı (17) → yeni satır.
- UX §5.1 panorama hücresi 12 px sabit; tek dilim / az satırda kutu boş → hücre = min(24, 110 / satır).
- 09: `color.ghost.support` sarı tarama Y plan hücresinde zayıf → Y üstünde koyu mürekkep varyantı değerlendirilecek.

## Tur 2 (2026-10-06)

Ekranlar yeniden çekildi: `npm run screens` (390×844 ve 360×800, 27 + 27 çekim, bu turun harness derlemesi). Çalıştırma
aracın arka plan süre sınırına takılıp 360×800 `level5` senaryosunun ortasında durdu (başka ajanların Playwright oturumlarıyla
aynı anda; senaryo hatası yok); o senaryo `node tools/screens.ts --profile 360x800 --only 11-truck` ile, CVD'ler
`--cvd all --only 19-palette` ile ayrıca çekildi (hepsi `ok`, konsol hatası yok). Her PNG açıldı; şüpheli bölgeler büyütülüp kırpıldı
(kırpıntılar karalama klasöründe). Ölçüt tur 1 ile aynı. Bu turda kendi dosyalarımda yaptıklarım en altta.

### Tur 1 kapanış denetimi (ekrandan)

- #0 ray konturu / rozeti (Engel) → **KAPANDI**: 09'da kesik kırmızı kontur + ↓ rozeti, 10'da düz yeşil kontur + ✓
  rozeti sürüklenen bloğun üstünde, iki profilde. (Zorunlu adımda karartma altında kalıyor: yeni bulgu T2-2.)
- #1 45° tarama → **KAPANDI** (08: uyuşmayan üç hücrede kırmızı 45° tarama, rozet "!").
- #2 düşüş yolu → **KAPANDI** (07, 08: iki sütunda bloktan gölgeye kesik beyaz çizgi).
- #3 Dede balonu HUD'u örtüyor → **KAPANDI** (02–11, 18, 24, 25: balon HUD altı bantta; hedefler, hamle, duraklat açık;
  iki satırlık balon 10 / 25'te bantta, vinç alanına taşmıyor).
- #4 delik bloğu izlemiyor → **KISMEN**: hamle sonrası delik yeni yere kuruluyor (18), ama sürükleme sırasında delikten
  çıkan blok karartmada kalıyor (T2-2).
- #5 "KAZANDIN!" → **KAPANDI** (12, iki profil). Konumu için Öneri T2-12.
- #6 kazanma paneli → **KAPANDI** (12: panel durum şeridinin altında; "Usta Serisi" etiketi iki profilde tam).
- #7 devam şeridi → **KAPANDI** (17: krem hap, mürekkep yazı, karartmanın üstünde).
- #8 kalp → **KAPANDI** (14: iki lob + tepe çentiği; kalp okunuyor).
- #9 kamyon çipi → **KAPANDI** (11: turuncu üstünde `ui.ink`).
- #10 inceleme kapsamı → **KAPANDI** (01a–c, 19 + 3 CVD, 20–25 var). 24 çekimi #84'ü yalnız bir profilde yakalıyor: T2-7.
- Tur 1 Öneri'leri açık (ROADMAP birikimi): giriş balonunda kuyruk + ART §11.7 yer tutucu SVG'ler (01a–c iki profilde
  aynı); Altın Mala ikonu (25'te aktifken sarı disk içinde mala seçilmiyor); panorama zemini (03, 06, 07).

### Engel

Yok. Bölüm 1–5 iki profilde baştan sona oynanıyor; okunmayan renk / sembol ya da yanlış kural gösteren ekran yok.
19-palette ve üç CVD görünümünde 8 renk + 8 sembol 360 px'te ayrışıyor (en yakın çiftler deutan/protan W–R plan dolgusu
ve tritan G–B; sembol farkı belirgin: ağaç damarı ↔ tuğla derzi, yaprak ↔ parıltı).

### Önemli

- **T2-1** [design-lead → code-lead] 02-l1-start (iki profil): **FTUE'nin ilk zorunlu adımında birleşen delik vurgusuz
  blokları aydınlatıyor** → Bölüm 1 adım 1 (`crane` + `piece:0`): 12 px pay iki deliği çakıştırıyor, kutuları sınır
  kutusuna birleşiyor; satır 7'nin tamamı (Y (0,7), W (2,7), W (3,7)) aydınlık, ama Z adımında bu bloklar tepkisiz
  (`allowsPick`). Oyuncunun oyundaki ilk dokunuşu aydınlık bir bloğa gidip "bozuk" hissi verir.
  Kanıt: `highlights.ts:97-118` `spotlightHoles` → `union` sınır kutusu; `TutorialController.ts:18` yorumu bunu kabul
  ediyor ("merged spotlight holes may cover…"). UX §13.1 "Spot ışığı" bu turda netleşti (birleşen delik kuralı).
  Öneri: birleşmiş her delik için `darkRects(delikKutusu, üyeDikdörtgenler)` (aynı dosyadaki saf fonksiyon) ile
  vurguya ait olmayan parçaları aynı karartma alfasıyla kapat (köşesiz dikdörtgen; doku yüklemez, yeniden kurulumda
  ek çizim yok). Test: "UX 13.1 merged hole: level 1 step 1 lights only the crane band and piece 0".

- **T2-2** [design-lead → code-lead] 10-drag-rail-gap (iki profil), 07 / 08 / 09 / 23: **sürüklenen blok ve sonucu
  öğretici karartmasının altında** → 10'da (Bölüm 3 adım 2, Z, %60) raydaki Y bloğu, düz yeşil konturu ve ✓ rozeti
  koyu zeytin / gri görünüyor; dersin konusu olan "raya oturdu, doğru" bilgisi karanlıkta. Yumuşak adımlarda (07, 08,
  23; %30) sürüklenen blok da soluk. Kanıt: `depth.ts:30` `draggedBlock` 90, ray konturu `draggedBlock + 2…4`
  (tur 1 #0), karartma `depth.ts:36` `tutorial` 260 (`TutorialOverlay.ts:99`); `gap:` vurgusu yalnız duvar
  açıklığı (`highlights.ts` `g.gapRect`), şantiyedeki ray satırı delikte yok.
  Öneri: sürükleme boyunca sürüklenen `PieceView` ve `ShadowView` (gövde, kontur, rozet, taramalar, düşüş yolu, iptal
  rozeti) `DEPTH.tutorial + 4…9`'a alınsın, bırakınca geri (delik yeniden kurulmaz, perf etkisi yok; UX §13.1 bu turda
  yazıldı). Test: "UX 13.1 the dragged block and its shadow look draw above the spotlight during a drag".

- **T2-3** [design-lead → code-lead] 04-l3-start, 05-l4-start, 10-drag-rail-gap (iki profil): **W1 rayları görünmüyor**
  → geçit açıklığı boş gökyüzü + ikaz bantları; "2 çelik ray" ne açıklıkta ne şantiyede okunuyor. Bölüm 3'ün 2–3.
  adımları ("Duvarda geçit var! Bloğu içinden kaydır." / `tut.l3.rail` "kelepçeler parlar") rayı anlatıyor.
  Kanıt: `BoardView.ts:191-203` raylar `DEPTH.boardGround + 4` (14) → şantiyede plan hücreleri (20) ve bloklar (50)
  rayı örtüyor; rayın rengi `tokens.json:116` `board.rail` #8A96A3 = `board.scaffold` (:112); Bölüm 3'te geçit
  sınırları (satır 2 ve 4) iskele kuşağıyla, Bölüm 4'te üst sınır (satır 5) tavan kirişiyle **aynı çizgi**. JUICE #22
  ray ışığı da `EventPlayer.ts:894` `boardGround + 5`'te, şantiyede plan hücresinin altında kalıyor.
  Öneri: ART §5 W1 satırı bu turda güncellendi — ray 8 px koyu çelik #3F454D + 2 px üst ışık + 40 px'te bir travers
  çentiği; derinlik `DEPTH.planOverlay + 2` (ızgaranın üstü, `buildFront` ve blokların altı); #22 ışığı da aynı katmanın
  hemen üstünde. Ortak değişiklik: ben `tokens.json` `color.board.rail` = #3F454D'yi, code-lead aynı turda
  `tests/review/services-theme.review.test.ts:2624` sabitini (`board.scaffold` → `board.rail`) değiştirir; tek başına
  tokens değişikliği `npm run check`'i kırar, bu yüzden bu turda yapmadım.

- **T2-4** [design-lead → code-lead] 20-home-l2 (iki profil): **azaltılmış harekette "BÖLÜM 2" hiçbir vurgu almıyor**
  → UX §2.2 adım 11 nabız, JUICE §0 kural 8 karşılığı sabit altın kenar; çekimde düğme düz yeşil, kenar yok.
  Kanıt: `HomeScene.ts:76` `this.build()` kenarı `.setVisible(this.reduced)` (:139) ile kuruyor, ama `this.reduced`
  ancak `:83`'te atanıyor (ilk kurulumda `false`); `update()` `this.reduced` doğru olunca erken dönüyor → ne nabız ne
  kenar. Öneri: `this.reduced = reducedMotion()` satırını `build()` çağrısının önüne al. Test: "UX 2.2 step 11 reduced
  motion: BÖLÜM 2 shows the steady gold edge on the first entry".

- **T2-5** [design-lead → code-lead] 09-drag-support-k34 (iki profil): **eksik destek taraması açık plan renklerinde
  okunmuyor** → satır 2'nin Y plan hücrelerinde sarı yatay çizgiler zeminle neredeyse aynı; K-34'ün nedenini taşıyan tek
  hücre işareti bu. Ölçüm (WCAG, `color.ghost.support` %85 karışımı): Y 1,15:1, G 1,14:1, C 1,03:1, O 1,39:1.
  Kanıt: `src/theme/draw/plan.ts:199-218` tek renk çizgi. Öneri: ART §4 bu turda güncellendi — her sarı çizginin altında
  10 px `ui.ink` %80 alt çizgi (çift kendi içinde ≥ 5:1, her plan renginde en az bir kenar ≥ 2,7:1); `plan_support_hatch`
  çerçevesi bu tarifle pişirilsin (aynı çerçeve #84 için de kullanılıyor).

- **T2-6** [design-lead → code-lead] 25-trowel-pick (iki profil): **Altın Mala seçiminde seçilemeyen hücreler soluklaşmıyor**
  → UX §5.2 tablo "diğer hücreler %50 soluk"; 25'te seçilemeyen G (7,2) seçilebilir (6,2) ile aynı parlaklıkta, ayrım
  yalnız altın kontur rengiyle. Kanıt: `TrowelPicker.ts:139-145` yalnız `marks` alfasını değiştiriyor; aktif dilimin
  diğer plan hücrelerine dokunan kod yok. Öneri: seçim açıkken aktif dilimin cephe dışı plan hücrelerini (ve `.`)
  `alpha 0.5` yap, kapanınca 1; azaltılmış harekette de (bilgi). Test: "UX 5.2 trowel pick dims non-front plan cells to 50 %".

- **T2-7** [design-lead → code-lead] 24-bounce-support: **çekim JUICE #84'ü kararsız yakalıyor** → 360×800'de eksik destek
  taraması satır 0–2'de görünüyor, 390×844'te blok yerine dönmüş ama tarama yok (aynı derleme, aynı senaryo). #84 (P0)
  inceleme setinde güvenilir doğrulanamıyor. Kanıt: `tools/screens.ts:235` `settle(gp, 200)` duvar saatine bağlı
  `waitLog`'dan sonra sabit 200 ms oyun süresi; `juice/plan.ts:202` #84 geri sekmenin bitişinde (`done`, azaltılmış
  harekette düz yol 220 ms) başlıyor → çekim anı taramanın başlangıcıyla yarışıyor. Öneri: çekimi #84'ün içine sabitle
  (harness'e `waitCue(84)` + 100 ms, ya da `bounceMs + 300` oyun süresi); azaltılmış harekette tarama 600 ms sabit
  olduğundan tek kare yeter.

- **T2-8** [design-lead → code-lead] 06-l5-start, 03-l2-start (iki profil): **S1 dersinde panorama okunmuyor, ok yok** →
  Bölüm 5 adım 1 "Bu kat bitince şantiye kayar." deliği 592×110'luk boş gökyüzü kutusu; iki dilim 12 px hücreli
  (≈ 24×48 px, 390'da ≈ 9 pt genişlik) ve UX §13.2'deki "panoramada sağa ok" çizilmiyor. Kanıt: `LevelScene.ts:224`
  `refRows: TOKENS.layout.grid.rows` (8) → `Panorama.ts:43-52` hücre 12 px; bölüm 5 adım 1'de `hand` yok
  (`levels/level_005.json`), overlay'de ok çizen yol yok. Öneri: UX §5.1 (hücre = `min(24, ⌊(110 − 2·pay)/satır⌋)`,
  en az 12, en yüksek dilime göre, dikeyde ortalı) ve UX §13.2 Bölüm 5 satırı (ok ölçüsü, kayma, koşul) bu turda
  yazıldı; `refRows` = bölümün en yüksek dilimi, ok `panorama` vurgulu ve ≥ 2 dilimli adımda overlay'de çizilsin
  (sunum verisi, bölüm JSON'u değişmez).

- **T2-9** [design-lead → code-lead] 17-resume-strip (iki profil): **aynı mesaj üç kez** → başlık "KALDIĞIN YERDEN DEVAM",
  alt satır `tut.ctx.resume` "Kaldığın yerden devam, evlat.", şerit "Bölüm 2 · hamlelerin kayıtlı". Tur 1'de kendi işim
  olarak yazmıştım; STORY satırı `tests/services/i18n.test.ts` ile tr/en'e birebir bağlı olduğu için tek başıma
  değiştirirsem `npm run check` kırılır. Ortak değişiklik (aynı tur): STORY `tut.ctx.resume` satırı → TR "Tahta bıraktığın
  gibi duruyor, evlat." / EN "The board is just as you left it, kiddo." (TR 5 kelime, renk adı yok); code-lead
  `src/i18n/tr.json`, `en.json`'u eşitler.

### Öneri

- **T2-10** [design-lead → product-lead] 10-drag-rail-gap: Bölüm 3 adım 2 vurgusu `gap:0` + `piece:1`, hedef hücreler yok;
  Bölüm 4 adım 3'te `cell:6,3`, `cell:7,3` var. → `levels/level_003.json` adım 2'ye `cell:6,2`, `cell:7,2` eklensin
  (rayın varış satırı delikte aydınlık; T2-2 ile birlikte dersin sonucu görünür).
- **T2-11** [design-lead → code-lead] 02–11, 18, 24 (iki profil): oyun ekranının alt %18–20'si (durum şeridi altı) boş;
  Tuna köşesi yok, JUICE #13 / #52 / #57'deki Tuna ifadeleri oynayamıyor. → Faz 2'de kapsam dışıysa Faz 4 alt grup
  kalemine; erken istenirse ART §11.7 Tuna yer tutucusu 280×296, `layout.bottom` çapası, yalnız ifade değişimi.
- **T2-12** [design-lead → code-lead] 12-win (iki profil): "KAZANDIN!" tahtanın ortasında blokların üstünde; hemen
  üstündeki vinç bandı boş. → #55 başlığının son pozu vinç bandının ortasına (tahta grubu, EXPAND'le kayar).
- **T2-13** [design-lead → code-lead] 13-lose-1-offer: "Kalan: 10 hücre" kutusu yalnız metin; UX §7 kalan hedefin küçük
  resmi (panoramadan, kalan hücreler parlak) + Tuna "kararlı". → Faz 4 pencere cilası.
- **T2-14** [design-lead → code-lead] 05-l4-start: dokunma eldiveni hedef `.` hücresinin alt yarısını örtüyor (tarama
  yarım görünüyor). → `tap` elinde parmak ucu hücrenin alt kenarına, eldiven gövdesi hücrenin dışına (aşağı-sağ).

### design-lead kendi işleri (bu tur)

- UX §13.1 "Spot ışığı": birleşen delikte vurgusuz parçaların karartılması ve sürüklenen blok + gölgenin karartma
  üstünde çizilmesi yazıldı (T2-1, T2-2).
- UX §5.1 panorama hücre boyu kuralı ve UX §13.2 Bölüm 5 ok tarifi yazıldı (T2-8; tur 1 kendi işi kapandı).
- ART §4 eksik destek taramasına koyu alt çizgi + ölçümler (T2-5; tur 1 kendi işi kapandı).
- ART §5 W1 ray tarifi (renk, kalınlık, travers, katman) yazıldı (T2-3); `tokens.json` `board.rail` değişikliği
  code-lead'in test sabitiyle aynı turda — açık.
- STORY `tut.ctx.resume` yeni satırı code-lead'in i18n eşitlemesiyle aynı turda — açık (T2-9).

## Tur 3 (2026-10-07)

Ekranlar yeniden çekildi: `npm run screens` (harness yeniden derlendi; 390×844 ve 360×800 tam set, 390×763 ve 360×740
`start1`…`start5`; 64 çekim, 0 senaryo hatası, çıkış 0) + `node tools/screens.ts --cvd all --only 19-palette --profile
360x800` (3 çekim). Koşu başka ajanların Playwright oturumlarıyla aynı anda yürüdüğü için yavaştı (360×800 `lose`
658 s) ama kesilmedi. 67 PNG'nin her biri açıldı; şüpheli bölgeler kırpılıp büyütüldü (karalama `r3/`). Ölçüt tur 1–2 ile
aynı; kendi dosyalarımda yaptıklarım en altta.

### Tur 2 kapanış denetimi (ekrandan; `code-lead-closure.md` "Faz 2 tur 2")

- #0 / T2-1 birleşen delik → **KAPANDI**: 02 (dört profil) satır 7'nin vurgusuz blokları karanlık, yalnız vinç bandı ve
  `piece:0` aydınlık; 10'da `gap:0` + `piece:1` birleşik kutusundaki G (4..5, 3) de karanlık.
- #1 / T2-2 → **KAPANDI**: 10 (iki profil) Z adımının %60 karartmasında raydaki Y bloğu, düz yeşil kontur ve ✓ rozeti
  tam parlaklıkta; 07 / 08 / 23'te sürüklenen blok soluk değil.
- #2 / T2-3 → **KISMEN**: alt ray şantiyede koyu çelik + travers çentikleriyle görünüyor (04, 05, 09; kırpıntı
  `r3/04-rails-390.png`, `r3/05-rails-390.png`); üst ray geçidin üst kenarı plan tepesiyle aynı olduğunda (Bölüm 3 ve 4)
  tavan kirişinin altında kalıyor → T3-2.
- #3 / T2-4 → **KAPANDI** (20, iki profil: sabit altın kenar).
- #4 / T2-5 → **KAPANDI** (09, 24: sarı + koyu çift çizgi Y / W plan hücrelerinde okunuyor).
- #5 / T2-6 → **KAPANDI** (25, iki profil: (7,2) ve R satırı %50, cephe hücreleri altın konturlu).
- #6 / T2-7 → **KAPANDI** (24: #84 taraması iki profilde de çekimde).
- #7 / T2-8 → **KAPANDI** (03 / 06: hücre ≈ 19 px, ok çiziliyor); okun yeri için T3-3.
- #9 Duraklat zorunlu adımda → ekranda tutarlı (02: Duraklat karartmanın altında, ek delik yok); işlev e2e'de.
- #15 kısa ekranda balon → **KAPANDI** (çekilen beş başlangıç adımında): 390×763 ve 360×740'ta B1·1 aday 2 (satır 6–5'in
  sol yarısı, aydınlık satır 7'nin altında, `H/2`'nin üstünde), B2·1 / B4·1 / B5·1 aday 3 (vinç bandı, dar kutu), B3·1
  aday 4 (HUD'a taşan bant). Hiçbirinde balon delik, el yolu, şantiye sütunu ya da Duraklat'a değmiyor; UX §13.1
  "Beklenen sonuç" ile birebir. 390×763 B3·1'de örtülen alan "alt kenar"dan fazla → T3-4.
- T2-9 → **KAPANDI** (17: "Tahta bıraktığın gibi duruyor, evlat.").
- Açık Öneri'ler (değişmedi): T2-10 (product-lead; `level_003.json` adım 2 vurgusu hâlâ `gap:0`, `piece:1`), T2-11,
  T2-12 (12: "KAZANDIN!" blokların üstünde), T2-13, T2-14 (05: eldiven `.` hücresinin alt yarısını dört profilde örtüyor);
  tur 1'den giriş balonu kuyruğu / §11.7 yer tutucuları (01a–c), mala ikonu (25), panorama zemini (03, 06).

### Engel

Yok. Bölüm 1–5 dört profilde okunuyor; renk + sembol 360 px'te ve üç CVD görünümünde ayrışıyor (19), pencerelerde
eşit düğmeler, × ve "Teklif 1/3" var, baskı metni yok (13, 15, 16); Türkçe karakterler doğru ("HAMLELER BİTTİ!",
"KALDIĞIN YERDEN DEVAM", "BÖLÜMDEN ÇIK?", "Bonus İnşaat", "MİNİK USTA İNŞAAT"); kırpılan ya da taşan öğe yok.

### Önemli

- **T3-1** [design-lead → code-lead] 25-trowel-pick (360×800): **ilk Altın Mala'da aynı talimat iki kez** → Usta Dede
  balonu `tut.ctx.goldtrowel` "Altın Mala'yla parlayan bir hücreye dokun." ile seçim şeridi `booster.hint.trowel`
  "Parlayan bir hücreye dokun." + "Vazgeç" aynı anda ekranda; öğretici çerçeveleri (`streak`, `front`) ile seçimin altın
  konturları da üst üste. Bölüm 5'in el çözümünde mala 4. hamlede gelir, satır adım 2 (kamyon) bitene kadar kuyrukta
  bekler ve oyuncu malaya dokunduğunda hâlâ ekrandadır: her yeni oyuncunun ilk mala anı. 390×844'te aynı senaryonun
  çekiminde balon yok (zamanlamaya bağlı → inceleme seti de kararsız).
  Kanıt: `LevelScene.ts:764-765` satır mala elde oldukça geçerli; `LevelScene.ts:966-973` `toggleTrowel` seçimi açarken
  bağlamsal satıra dokunmuyor; `contextTips.ts:140` tetik `trowelEarned`.
  Öneri: UX §13.2 bağlamsal tablo "Altın Mala ilk kez kazanıldı" satırı bu turda yazıldı — seçim açılınca satır ekrandaysa
  kapanır, kuyruktaysa düşer, ikisinde de görülmüş sayılır; seçim açıkken gösterilmez. Test: "UX 13.2 opening the trowel
  pick closes and marks tut.ctx.goldtrowel".

### Öneri

- **T3-2** [design-lead → code-lead] 04-l3-start, 05-l4-start, 10-drag-rail-gap (dört profil): geçidin üst kenarı plan
  tepesine denk geldiğinde (Bölüm 3 satır 4, Bölüm 4 satır 5) üst ray 12 px açık gri tavan kirişinin altında kalıyor;
  şantiyede "2 çelik ray"ın yalnız biri görünüyor. Kanıt: ray `DEPTH.planOverlay + 2` (`BoardView.ts:46`), kiriş
  `DEPTH.ceilingBeam` 60 (`BoardView.ts:349-350`, aynı y). Taşıyan alt ray görünür olduğu için ders okunuyor. → Bu durumda
  rayı kirişin üstüne (`DEPTH.ceilingBeam + 2`) çiz: 8 px koyu ray 12 px açık kirişin ortasında ikisini de okutur; ART §5
  W1 satırına not Faz 3'te.
- **T3-3** [design-lead → code-lead] 06-l5-start (dört profil): panorama oku (64×40) dilimler arası 1 hücrelik
  (≈ 19 px, `viewConstants.ts:31` `panoramaGapCells: 1`) boşluğa sığmıyor; aktif dilimin sağ sütununun 2–3. satırını ve
  sonraki dilimin sol kenarını örtüyor (kırpıntı `r3/06-pano-390.png`). Bilgi kaybı yok (aktif plan şantiyede tam boy).
  → Ok gösterilirken dilim aralığı ≥ 64 + 2·8 px (592 px kutuda yer var) ya da ok dilimlerin altında, kutunun alt payında.
- **T3-4** [design-lead → code-lead] 04-l3-start (390×763): aday 4'te balon kutusu büste dikey ortalı olduğu için
  hedefler sayacı "0/1" ve "Hamle" etiketinin yarısı örtülüyor (UX "alt kenar örtülür" kabulünden fazla; 360×740'ta yalnız
  alt dudak). Yumuşak adım, oyun bilgisi tahtada; kısa ekranlarda Safari araç çubuğuyla sık görülen oran. → Aday 4'te
  kutuyu büstün alt kenarına hizala (dikey ortalama yerine); UX §13.1'e Faz 3'te işlenir.
- **T3-5** [design-lead → code-lead] 12-win (iki profil): Duraklat kazanma ekranında tam parlak ve dokunulabilir
  görünüyor ama dokununca hiçbir şey olmuyor (`LevelScene.ts:1143` `outcome !== 'playing'` → dönüş). → Kazanma ve kayıp
  penceresi açıkken Duraklat'ı gizle ya da `ui.disabled` tonuna çek.
- **T3-6** [design-lead → code-lead] ekran seti: kısa profiller yalnız Bölüm 1–5'in 1. adımını çekiyor; kısa ekranın en
  riskli anları (zorunlu B3·2, B4·3 ve sürükleme ortasında açılan B1·2) inceleme setinde yok (birim testleri geometriyi
  kapsıyor). → `SHORT_PROFILES`'a `10-drag-rail-gap` ve `18-tutorial-l1` eşdeğerleri. T3-1 düzelince 25 kendiliğinden
  kararlı olur.

### design-lead kendi işleri (bu tur)

- UX §13.2 bağlamsal tablo: `tut.ctx.goldtrowel` mala seçimi açılınca kapanır / düşer, görülmüş sayılır (T3-1).
- UX §13.2 öğretici tablosu LEVELS §2 verisiyle eşitlendi: B3·2 tamam koşulu `placementCorrect` ×1 (eski `gapPass`),
  B4·1 `placementCorrect` ×1 (eski `timeoutMs` 2500), B4·2 `placementCorrect` ×1 (eski ×2). Bölüm JSON'ları zaten böyleydi.
- UX §13.1 "Beklenen sonuç": B1·2'nin dile bağlı adayı (TR 4, EN 3) code-lead'in tur 2 bilgisiyle yazıldı.
- ASSET_LIST `gap_static_edge` satırı: `gap_rail` 300×12 (duvar 60 + şantiye 240; kod zaten böyle pişiriyor).
- `tokens.json` değişmedi. Çalıştırılan doğrulama: `vitest` UX / ASSET okuyan iki dosya (`schema.test.ts`,
  `audio.test.ts`) 26/26 yeşil.

## Tur 4 (2026-10-07)

Ekranlar yeniden çekildi: `npm run screens` (harness yeniden derlendi; 390×844 ve 360×800 tam set, 390×763 ve 360×740
`start1`…`start5`; 64 çekim / 28 senaryo, 0 senaryo hatası, konsol hatası yok, çıkış 0) + `node tools/screens.ts --cvd all
--only 19-palette --profile 360x800` (3 çekim). Araç kısa profilleri hâlâ yalnız başlangıç adımlarında çekiyor (T3-6);
bu yüzden aynı harness ve aynı dokunma yoluyla karalama betiği (`r4shots.ts`, `r4probe.ts`, `r4resume.ts`) 13 ek çekim
aldı: Bölüm 2 adım 2 (eldiven + `c` x=6'da tutulurken) ve adım 3 (390×844, 390×763, 360×740), Bölüm 1 adım 2 sürükleme
ortası (390×763, 360×740, 360×800; 360×800'de 1,5 s sonra ikinci kare), Bölüm 2 K-43 yeniden yükleme + devam (390×844).
67 + 13 PNG'nin her biri açıldı; şüpheli bölgeler kırpılıp piksel ölçüldü (karalama `r4/`). Ölçüt tur 1–3 ile aynı.

### Tur 3 kapanış denetimi (ekrandan; `code-lead-closure.md` "Faz 2 tur 3")

- #0 / T3-1 ilk Altın Mala'da çift talimat → **KAPANDI**: 25-trowel-pick iki profilde yalnız şerit
  `booster.hint.trowel` "Parlayan bir hücreye dokun." + "Vazgeç"; Usta Dede balonu, `streak` / `front` çerçeveleri yok;
  iki seçilebilir hücre altın konturlu, öbür plan hücreleri %50. Çekim artık profil zamanlamasından bağımsız.
- #1 K-43 devamında öğretici konumu → **KAPANDI** (ekrandan): Bölüm 2 golden hamle 1 → yeniden yükleme → "KALDIĞIN
  YERDEN DEVAM" → Devam: adım 2 (`tut.l2.shadow`, hold eldiveni) yüklemeden önceki gibi ekranda; `savedAttempt.tutorial`
  önce = sonra `{ index 1, shown true, count 0, actions 2 }` (karalama `l2-resume-390x844.png`). 17 iki profilde aynı.
- #2 JUICE #18 azaltılmış harekette konfeti → **KAPANDI**: 12-win iki profilde konfeti yok, "KAZANDIN!" sabit pankart.
- product-lead Bölüm 2 verisi (PL-F2T3) ekranda doğru: adım 2 (Y) `c` + `b` + şantiye aydınlık, hold eldiveni
  `c` (4,7) → (4,8) → (6,8); `c` x=6'da tutulunca kesik kırmızı kontur + "!" + uyuşmayan hücrelerde 45° tarama
  (`color`, `support`); `b`'nin doğru yerleşimiyle adım 3 (`tut.l1.match`, `c` eldiveni) açılıyor. Balon 390×844'te
  aday 1, 390×763 ve 360×740'ta aday 4 (UX §13.1 "Beklenen sonuç" ile aynı; T3-4 aşağıda).
- Açık Öneri'ler (kodda değişmedi, ekranda aynı): T3-2 (04 / 10: üst ray tavan kirişinin altında), T3-3 (06: panorama
  oku dilimlerin üstünde), T3-5 (12: Duraklat kazanmada tam parlak), T2-10 (product-lead; `level_003.json` adım 2 vurgusu
  `gap:0`, `piece:1`), T2-11, T2-12 (12: "KAZANDIN!" blokların üstünde), T2-13, T2-14 (05: eldiven `.` hücresinin alt
  yarısında, dört profil); tur 1'den giriş balonu kuyruğu / §11.7 yer tutucuları (01a–c), mala ikonu (25), panorama zemini.

### Engel

Yok. Bölüm 1–5 dört profilde okunuyor; renk + sembol 360 px'te ve üç CVD görünümünde ayrışıyor (19: G/O/Y protan ve
deutan'da sembolle — yaprak / dalga / nokta — ayrılıyor); pencerelerde eşit düğmeler (Kal / Çık, +5 hamle / Hayır), ×,
"Teklif 1/3" var, baskı metni yok (13, 15, 16); Türkçe karakterler doğru ("HAMLELER BİTTİ!", "BÖLÜMDEN ÇIK?", "KALDIĞIN
YERDEN DEVAM", "Bonus İnşaat", "Şantiyenin üstünde bırak, kendisi düşer."); kırpılan, taşan öğe ve yatay taşma yok.

### Önemli

Yok.

### Öneri

- **T4-1** [design-lead → code-lead] Bölüm 1 adım 2 sürükleme ortası (karalama `l1-s2-hold-*`, 390×763 / 360×740 /
  360×800): adım `overWall`'da (5,7) düğümünde açılınca `piece:0` deliği o düğümde donuyor; blok (6..7, 8)'e gidip 1,5 s
  beklese de delik kutusunun sol kenarı x 646'da (tasarım px, 360×800 ve 360×740 ölçüldü) sahanın 5. sütununu yarıdan
  kesiyor: duvar şeridi ve 5. sütun blok yarıları aydınlık, taşınan blok kutunun dışında (blok zaten karartmanın üstünde
  çiziliyor). Kanıt: `TutorialOverlay.ts:265-266` `heldDrag` yalnız parça değişince yenilenir, `:325` rebuild anındaki
  düğümü alır. Yumuşak adım (%30), bilgi kaybı yok. → Adım sürükleme ortasında açılırken sürüklenen bloğun `piece:`
  dikdörtgenini deliğe katma (blok UX §13.1 gereği zaten üstte); vurgu `build` deliği olarak kalır. B1·2 balonu yine
  aday 3 (yasak alan küçülür); `presentation.review.test.ts:1635` notu ve `:1655` "hole … at the drag node" testi buna göre.
- **T4-2** [design-lead → code-lead] Bölüm 2 adım 2–3 (karalama `l2-s2-*`, `l2-s3-*`; 03): `piece:` deliği bloğun sınır
  kutusu (`highlights.ts:41-44` `pieceRect(ax, ay, w, h)`); C3 `c`'nin kutusundaki dolgu bloğu `d` (B1 G, (4,6)) ve B2·2'de
  `b` kutusundaki boş (3,7) de aydınlık. B2·3'te "Plandaki renge uyan bloğu seç." metniyle sarı `c` ile yeşil `d` aynı
  delikte; `d` LEVELS §2'ye göre hiçbir zaman doğru değil. Zorunlu adımlarda (B1·1, B3·2, B4·3) bloklar D2 olduğu için
  etkisiz. → Dikdörtgen olmayan blokta kutunun bloğa ait olmayan hücrelerini birleşen-delik dolgusu gibi köşesiz karart
  (UX §13.1 "oyuncu yalnız vurgulananı aydınlık görür"); Faz 3'te L/T/C bloklu zorunlu adımlar gelmeden.
- **T3-4 (güncel)** [design-lead → code-lead] 390×763'te aday 4 balonu artık üç adımda hedefler sayacını ve "Hamle"
  etiketini örtüyor: 04-l3-start (B3·1) ve yeni Bölüm 2 verisiyle B2·2, B2·3 (karalama `l2-s2-390x763`, `l2-s3-390x763`:
  "0/1"in alt yarısı ve "Hamle"nin "H"si kutunun altında). 360×740'ta yalnız alt dudak. Öneri aynı: aday 4'te kutuyu
  büstün alt kenarına hizala.
- **T3-6 (güncel)** [design-lead → code-lead] kısa profil seti: tur 4'te gereken çekimler karalama betiğiyle alınabildi
  (aynı `harnessClient` çağrıları); `SHORT_PROFILES` senaryolarına Bölüm 2 adım 2 / 3 ve Bölüm 1 adım 2 sürükleme ortası
  eklenirse T3-4 ve T4-1 inceleme setinde kalır.

### design-lead kendi işleri (bu tur)

- UX §13.2 Bölüm 2 satırları `level_002.json` / LEVELS §2 (PL-F2T3) ile eşitlendi: adım 2 vurgu `piece:2 (c)` +
  `piece:1 (b)` + `build`, hold `c` (4,7) → vinç → x=6, tamam `placementCorrect` ×1 (eski `holdOverBuild` ≥ 500 ms);
  adım 3 vurgu `piece:2 (c)`, drag `c` (eski `b`).
- UX §13.1 "Beklenen sonuç": B2·2 ve B2·3 aynı el yolu (aday 4); B1·2 notu çekime göre düzeltildi — Baloo 2 ile TR metni
  dar kutuda 2 satır → TR'de de aday 3 (balon alt kenarı delikten 28 px yukarıda; kural tablodan önce gelir).
- `tokens.json` değişmedi. Doğrulama: `vitest tests/core/level/schema.test.ts` (UX §13.1 okuyan) 16/16 yeşil.
