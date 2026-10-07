# design-lead çapraz inceleme — 1. bölüm (2026-10-04)

İncelenen: `docs/TECH_DESIGN.md` (code-lead), `docs/BUSINESS.md` + `docs/NAMING.md` (entrepreneur). Bakış açısı: görsel,
UX, his ve hikaye etkisi. Kural tutarlılığı product-lead'in alanıdır, burada incelenmedi. Kendi belgelerimde gereken
değişiklikler revizyon turunda yapılacak; ilgili maddede "design-lead revizyonu" diye belirtildi.

---

## A. TECH_DESIGN.md → code-lead

- [design-lead → code-lead] hücre ve duvar ölçüsü (§10.2, §2.2, R-10): `C = round(boardWidthPx / 9) ≈ 110 px` duvarı
  tam hücre sayıyor. ART_DIRECTION/UX_FLOWS'ta hücre 120 px, duvar 60 px (0,5c), tahta 1020 px (8,5c); `tokens.json` →
  `layout.cellPx = 120`, `layout.wallW = 60`, `layout.yardX/wallX/buildX`. Mantıksal 9×10 iç ızgara (P-1) ve
  `BoardLayout.cellToScreen` parça parça eşlemesi zaten bunu destekliyor; yalnızca ölçü kaynağı değişmeli.
  Önem: Önemli
  Düzeltme: `BoardLayout` ölçüleri `/9` formülünden değil `tokens.layout.*` değerlerinden okusun. design-lead revizyonunda
  `layout.wallWidthCells = 0.5` anahtarı eklenecek; `tokens.board.wallWidthCells` yerine bu ad kullanılsın. R-10'daki
  360 px hesabı bununla ≈ 40 CSS px/hücre olur.

- [design-lead → code-lead] plan hücresi tarifi (§10.2 doku tablosu): "%30 opak + kesik kontur" brifteki ilk değer.
  Ölçüm: ozalit üstünde %30'da renk körlüğünde ΔE00 ≈ 3,8, yani plan renkleri birbirinden ayırt edilemiyor (ART §2.2).
  Önem: Önemli
  Düzeltme: ART §4 / P-2 tarifini kullan: önce `board.planUnderlay` #BCCADD altlık, üstüne renk `alpha.planFill` (0,8);
  kesik kontur `color.planStroke.X`; mürekkep `color.planInk.X`. Katman sırasına (§10.3) "plan hücreleri" ile "bloklar"
  arasına **ozalit ızgara kaplaması** ekle (ızgara plan hücresinin üstünden geçer, bloğun üstünden geçmez).

- [design-lead → code-lead] girdi kilidi (§6.3 `EventPlayer`): "Girdi oynatma bitene kadar kilitlidir" diyor; JUICE §0.3
  ise oyuncunun animasyon sürerken yeni blok tutabilmesini istiyor. Her doğru yerleşimden sonra ~320 ms (iniş 120 +
  parıltı 200), her hatalıdan sonra 350 ms kilit, hızlı oyuncuda "yapışkan, ağır" his yaratır.
  Önem: Önemli
  Düzeltme: Çekirdek durum zaten kesin olduğu için, oynatma sürerken gelen `pointerdown` bekleyen **engelleyici olmayan**
  tween'leri anında bitirir (son kareye atlar) ve sürüklemeyi başlatır. Giriş yalnız şu olaylarda kilitli kalır: dilim
  kayması (600), kamyon teslimatı (700), Kamyon Yardımı (900), saha yerçekimi zincirlemesi (bloklar yer değiştirdiği
  için). Bu engelleyici dizilerde "dokunma 3× hızlandırır" kuralı kalsın.

- [design-lead → code-lead] "animasyonları azalt" (§6.3, §11.7): ayar "süreleri 0,3× yapar" ve haptiği de kapatabilir
  diyor. Hareketi 3 kat hızlandırmak hareket hassasiyeti olan oyuncu için daha rahatsız edicidir. "Azaltılmış hareket"
  daha hızlı hareket değil, daha az harekettir.
  Önem: Önemli
  Düzeltme: JUICE.md'deki "Azaltılmış hareket" sütununu uygula: kayma ve sıçrama yerine 150 ms solma
  (`duration.reducedFade`), ölçek ≤ 1,03 (`a11y.reducedScaleMax`), ekran sallama yok, parçacık × `particles.reducedFactor`
  (0,2), döngüsel boşta animasyonlar dursun. Oyun bilgisi (gölge, sayaç, geri sekme yönü) korunsun. Haptik yalnız
  "titreşim" anahtarına bağlı olsun, azaltılmış hareket ayarı haptiği kapatmasın.

- [design-lead → code-lead] hafif yerçekiminde yönlendirme girdisi (S-26, R-2): Düşen bloğa dokunmak (120 px hareketli
  hedef) zor. "Şantiyenin sol/sağ yarısına dokun" önerisi de 120 px'lik hedef verir, bu yüzden yeterli değil.
  Önem: Önemli
  Düzeltme (UX önerisi): Hafif yerçekiminde 1 genişlikli blok düşerken **tahtanın herhangi bir yerine** dokunmak bloğu
  öbür şantiye sütununa geçirir (şantiye 2 sütun olduğu için yönlendirme bir ikili geçiştir). Düşen bloğun üstünde
  "↔" ipucu çipi görünür; gölge anında güncellenir. 2 genişlikli bloklarda ipucu ve yönlendirme yok. Çekirdek modeli
  (`steer.atRow`) değişmez. Çıkıntı (overhang) altına girmeye izin verilip verilmeyeceği product-lead'in kararı.
  design-lead revizyonunda UX §13 (Bölüm 23) ve JUICE #46 buna göre güncellenecek.

- [design-lead → code-lead / proje sahibi] ağır yerçekimi 700 ms (S-27, R-3): UX açısından ucuz alternatifi
  ("ağır blok şantiye üstünde indirilemez, bulunduğu yükseklikten düşer") destekliyorum. Gerekçe: zaman baskısı yok;
  BUSINESS'taki 35–54 yaş çekirdek kitleye ve erişilebilirliğe uygun; deterministik ve solver ölçebilir. "Ağır" fikri
  de "nazikçe indiremezsin" olarak daha sezgisel okunuyor.
  Önem: Önemli
  Düzeltme: Karar product-lead'in ve proje sahibinin. Alternatif seçilirse görselde ağırlık rozeti + şantiye üstünde
  aşağı sürüklemeye karşı 6 px "dirençli sekme" (JUICE #4 benzeri), gölge bulunulan yükseklikten gösterilir; JUICE #45
  yeniden yazılır. 700 ms kalırsa Ayarlar'a "Zaman baskısını kapat" eklensin ve bu ayar alternatif davranışa geçsin.

- [design-lead → code-lead] font (§10.2 son madde): "açık lisanslı yuvarlak font (design-lead seçer)" için seçim
  **Baloo 2** (OFL 1.1, değişken 400–800; Fredoka elendi: ğ, ş, İ yok).
  Önem: Önemli
  Düzeltme: design-lead `baloo2-latin-tr.woff2` (38 KB alt küme, ASSET_LIST `font_baloo2_latin_tr`) teslim eder;
  `public/fonts/` altına konur. `index.html`'e `@font-face { font-family: "Baloo 2"; font-weight: 400 800;
  font-display: block }` eklenir. Boot şunları bekler: `document.fonts.load('800 120px "Baloo 2"')` ve
  `document.fonts.load('600 44px "Baloo 2"')`. Yedek: `tokens.font.fallback`. Lisans metni Ayarlar > Lisanslar'a.

- [design-lead → code-lead] sabit genişlikli rakam (hamle sayacı, altın, geri sayım): Canvas 2D `font` dizesi
  `font-feature-settings`/`tnum` açamaz; Baloo 2'de rakam genişlikleri farklı (0: 583, 1: 357 birim). Sayı azaldıkça
  rakam kayar.
  Önem: Öneri
  Düzeltme: Varsayılan olarak değişen sayıları **ortaya hizala** (UX §5.1). İstenirse design-lead,
  opentype-feature-freezer ile `tnum` özelliği varsayılana gömülmüş, yalnız rakamlardan oluşan "Baloo 2 Tnum" alt
  kümesi (~3 KB) üretir; sayaç, altın ve süre etiketleri bu aileyi kullanır.

- [design-lead → code-lead] token anahtar adları (§10.1, §10.5, §2.2): `tokens.color.sky`, `tokens.drag.liftCells`,
  `tokens.board.wallWidthCells` adları tokens.json'da yok. Var olanlar: `color.chapter.chN.skyTop/skyBottom`,
  `drag.fingerOffsetCells`, `layout.*`.
  Önem: Öneri
  Düzeltme: Kod mevcut anahtarları okusun; `tokens.ts` zod kontrolü eksik anahtarda açılışta hata versin (zaten
  planlı). Çentik bandı için `body` arka planı sahne değişiminde o bölümün `skyTop` rengiyle güncellensin (Bölüm 5 gece
  moru, varsayılan gökyüzü mavisi değil).

- [design-lead → code-lead] Filter'sız efektler (§10.6 "oyun sırasında Filter yok"): JUICE'daki doldurma ve silme
  efektleri (#12 hücre "dolar", #17 mala sıvama, #28 boya kapısı, #63 fırça), kırmızı parlama (#13) ve bulanık gölgeler
  (blok gölgesi, kaldırılmış gölge) maske ya da blur gerektirir.
  Önem: Öneri
  Düzeltme: Silme ve dolma efektleri yeni renkli ikinci bir `Image` üzerinde `setCrop` tween'iyle yapılsın (maske ve
  Filter gerekmez). Parlamalar `setTint().setTintMode(FILL)` + alfa tween'iyle. Gölgeler açılışta atlasa önceden
  bulanıklaştırılmış çizilsin (Canvas `shadowBlur` ile; 16 maske × 2 gölge). Düşüş gölgesi kareleri: 16 maske × 3 stil
  (doğru: düz, hatalı: kesik, nötr: kesik beyaz) + rozetler (✓, !, çatlak cam).

- [design-lead → code-lead] iptal öngörüsü (§4.3, S-5): Saha üstü havada (K-05) ya da duvar sütununda bırakma iptaldir,
  ama oyuncu bunu bırakmadan önce göremiyor (K-18 gölgesi yalnız şantiye için).
  Önem: Öneri
  Düzeltme: `ShadowView`'a bir `cancel` durumu eklensin: bırakma iptal olacaksa sürüklenen blok %60 opak olur ve
  üstünde 44 px "↩" rozeti görünür. design-lead revizyonunda UX §5.3–5.4'e eklenecek.

- [design-lead → code-lead] dokunma payı (R-10 "0,25 hücre" ↔ tokens `touch.hitSlopPx = 12`): 0,25c (30 px) daha iyi
  ama bitişik bloklarda çakışır.
  Önem: Öneri
  Düzeltme: Pay 30 px olsun; aynı noktayı birden çok blok kapsıyorsa dokunuş en yakın hücre merkezine gitsin.
  design-lead revizyonunda `touch.hitSlopPx` 30 yapılacak.

- [design-lead → code-lead] haptik değerleri (§11.7): web desenleri tokens'tan farklı (çift hafif `[10, 40, 10]` ↔
  `[10, 70, 10]`; `strong` ↔ `heavy`; `success` deseni yok).
  Önem: Öneri
  Düzeltme: `Haptics` arayüzü `tokens.haptic` anahtarlarını okusun (light, medium, heavy, doubleLight, success, win);
  Capacitor eşlemesi JUICE §0.7 tablosundan.

- [design-lead → code-lead] ses parametrelerinin sahipliği (§11.6): "efekt parametreleri `src/services/audio/sfx.ts`'de
  (design-lead seçer)" deniyor, ama `src/**` code-lead'in; parametreyi design-lead değiştiremez.
  Önem: Öneri
  Düzeltme: ZzFX parametre dizileri `tokens.json` → `audio.sfx.<ad>: number[]` altında dursun (design-lead'in dosyası,
  D-003); `sfx.ts` yalnız adları bu dizilerle eşlesin. Ad listesi ASSET_LIST §13'te.

- [design-lead → code-lead] düşüş süresi (§6.3 "düşüş = rows × msPerRow"): Sabit hızlı düşüş "tok" iniş hissini
  zayıflatır.
  Önem: Öneri
  Düzeltme: Normal ve ağır düşüş `tokens.physics` ivme ve tavan hızıyla hesaplansın (normal 60 hücre/s², tavan 18;
  ağır 120 / 26). Hafif yerçekiminde sabit 4 hücre/s (yönlendirme penceresi için öngörülebilir).

- [design-lead → code-lead] renk körü modu ve atlas: Mod sembolü ×1,2 büyütür ve plan dolgusunu 0,9 yapar
  (`tokens.a11y`). Bu, açılış atlasındaki kareleri değiştirir.
  Önem: Öneri
  Düzeltme: Ayar değişince atlas yeniden üretilsin (açılış maliyeti 20–40 ms; ayarlar ekranında kabul edilebilir).

- [design-lead → code-lead] ekran incelemesi araçları (§12.2 `screens`): Renk körlüğü incelemesi ekran başına
  yapılabilmeli.
  Önem: Öneri
  Düzeltme: `?debug=1&cvd=deutan|protan|tritan` parametresi `#game` öğesine SVG `feColorMatrix` CSS filtresi uygulasın
  (Machado matrisleri; yalnız debug, oyun yolunda değil). `screens` her ekranı normal + 3 CVD ile çekebilsin.

- [design-lead → code-lead] Faz 2 planı madde 12 (FTUE): "Boot → Bölüm 1 (≤ 3 dokunuş)" var, ama UX §2.1'deki 10 s
  kanıtı 3 panelli otomatik giriş sahnesini içeriyor.
  Önem: Öneri
  Düzeltme: Faz 2'de giriş sahnesi yer tutucu panellerle (ART §11.7 SVG'leri, 1,8 s otomatik ilerleme) eklensin; böylece
  ≤ 10 s ölçümü ilk dikey dilimde gerçek akışla yapılır.

- [design-lead → code-lead] blok otomatik döşemesi (§10.2 "iç köşe dolguları ayrı küçük kareler (4)"): Yaklaşım ART §3
  ile uyumlu, onaylıyorum. İki eksik tarif bende.
  Önem: Öneri
  Düzeltme: design-lead revizyonunda eklenecek: (1) içbükey köşe kaplaması: konturun 6 px çeyrek yayı, yarıçap 0,06c;
  (2) parlama hapı yalnız maskesinde **üst ve sol açık** olan hücrelere çizilir (otomatik döşemeye ek doku gerektirmez).

- [design-lead → code-lead] EXPAND (P-7): Benim P-4 önerimle aynı; destekliyorum. Çapa düzenim de aynı (üst çubuk üste,
  güçlendirici çubuğu alta, tahta ortada).
  Önem: Öneri
  Düzeltme: Tek karar olarak birleştirilsin (code-lead P-7 = design-lead P-4).

---

## B. BUSINESS.md + NAMING.md → entrepreneur

- [design-lead → entrepreneur] S5 / S8 simge ve mağaza görselleri: Kabul. ASSET_LIST'teki `app_icon` brifinde Tuna'nın
  kaskı blokların arkasından "bakıyor" (peeking); bu ifade bir yüzü çağrıştırıyor. `store_feature_graphic`'te ise Tuna
  merkezde.
  Önem: Önemli
  Düzeltme (design-lead revizyonu): Simge = imza hareket: sarı-siyah ikaz şeritli bir duvar ve kesik çizgili bir yayla
  duvarın üstünden aşan tek blok, sıcak gökyüzü zemini; karakter ve kask yok. Öne çıkan görsel = tahta ortası hamle
  (yaylı iz) + tamamlanmış ağaç ev; Tuna köşede küçük. Görsel üretim istemlerinden "toy box / toy-like" ifadeleri
  çıkarılacak; bu ifadeler üretim araçlarında okul öncesi stili tetikliyor. Yerine "polished, tactile casual-game art
  for adults" kullanılacak.

- [design-lead → entrepreneur] S2 / S3 sanat ve hikaye tonu: Kabul. Kendi belgelerimde bulduğum uyumsuzluklar:
  `plan_hidden_tag` brifinde "hand-drawn question mark" (el yazısı); iç terim "tebeşir altlık"; STORY'de Tuna'nın
  yaşını vurgulayan "Sekiz buçuk! Buçuk önemli." ve çocuk şakası tadındaki "Hapşu!".
  Önem: Önemli
  Düzeltme (design-lead revizyonu): `?` Baloo 2 glifiyle; terim "açık altlık"; bu iki satır yetişkin bağlamlı esprilerle
  değişir. **Ek öneri (S15):** Tuna'nın yaşı oyun içi metinde ve mağaza materyallerinde hiç geçmesin (brif §9'daki "8"
  yalnız iç belge bilgisi olarak kalsın). Tuna'nın görsel yaşının 8'den 10–12 görünüme çekilmesi proje sahibine açık
  soru olarak gidecek.

- [design-lead → entrepreneur] E5 ve §4.3 eşit düğme boyu ↔ UX §7: UX_FLOWS'taki "Hamleler bitti" penceresi bu ilkeyi
  ihlal ediyor (+5 düğmesi 760×176, reklam 560×128, "Vazgeç" 400×128 metin düğme). Ayrıca Köprü kaybında "+5 hamle
  elenmeyi önler" satırı ve Tuna'nın "Az kaldı!" balonu §4.5-4'teki "ek baskı metni yok" kuralıyla çelişiyor.
  Önem: Önemli
  Düzeltme (design-lead revizyonu): Üç eşit seçenek (her biri 920×152, alt alta): "+5 hamle ● 900", "Reklam izle +5",
  "Vazgeç". Hiyerarşi boyutla değil yalnız renkle (turuncu / krem / krem). "Az kaldı!" yerine yalnız bilgi satırı
  ("2 hücre kaldı"); Köprü kaybında kural satırı yok (kural yalnız girişteki kural kartında). Onaylıyor musun?

- [design-lead → entrepreneur] E4 "bölüm içinde satış penceresi yok" ↔ UX §5.1 / §5.2 ve §4: Bölüm içi güçlendirici
  yuvasında adet 0 iken "+" mini satın alma açıyor; bölüm öncesi penceredeki yuvalarda da "+" var.
  Önem: Önemli
  Düzeltme (açıklama isteği): E4 kendiliğinden açılan teklifleri mi kapsıyor, oyuncunun kendi başlattığı "+" alımını da
  mı? Önerim: Oyuncunun başlattığı "+" alımı serbest olsun. Hiçbir zaman otomatik açılmasın; fiyat + gerçek para karşılığı
  + eşit boyutlu "Vazgeç" içersin; bölümü duraklatsın. Yasaksa "+" yerine gri "0" gösterilir ve ilgili yer yalnız
  Mağaza'ya işaret eder.

- [design-lead → entrepreneur] E2 gerçek para karşılığı görünümü: Biçim ve konum önerisi.
  Önem: Öneri
  Düzeltme: Altın fiyatının altına ikinci satır: "≈ 81 TL" / "≈ $1.79", `font.size.caption` (34 px), `ui.inkSoft`;
  altın fiyatından asla büyük değil. Para birimi mağaza yerel ayarından gelir. Web MVP'de dil TR → TL, EN → USD (onay?).
  Kur oranı `config/economy.json`'da tutulsun (`realMoneyPerGold.TRY/USD`). design-lead revizyonunda +5, can,
  güçlendirici satın alma ve bölüm öncesi "+" pencerelerine eklenecek.

- [design-lead → entrepreneur] P-5 etiketli botlar ↔ UX §10: Usta Ligi wireframe'imdeki örnek ad "Selin_U" gerçek bir
  kullanıcı adı gibi görünüyor (ihlal).
  Önem: Önemli
  Düzeltme (design-lead revizyonu + soru): Bot görsel sistemi: avatar = blok renklerinden birinde kask + küçük alet
  simgesi (bayrak ve "çevrimiçi" ışığı yok); ad kalıbı "Çırak Fındık" / EN "Apprentice Hazel". design-lead STORY'ye 100
  ad çifti (TR+EN) yazar. Köprü ve Lig başlığında (i) düğmesi; ilk girişte kural kartında "Rakiplerin bilgisayarın
  yönettiği çıraklardır." Soru: D seçeneğinde (gerçek oyuncu + bot karışımı) karışıklık olmasın diye bot satırlarında
  küçük "çırak" rozeti ilk günden olsun mu? Önerim evet.

- [design-lead → entrepreneur / code-lead] S12 yaş ekranı UX'i: Bölüm 3 kazanıldıktan sonra gösterilmesi FTUE'yu bozmuyor
  (≤ 10 s / ≤ 3 dokunuş Bölüm 1'e kadar ölçülür). Ekranın görsel tarifi henüz yok.
  Önem: Öneri
  Düzeltme (design-lead revizyonu, UX "12. Yaş ekranı — mağaza sürümü"): Konum: Bölüm 3 Kazanma "Devam" → yaş ekranı →
  CMP → Ana ekran. Ekran tam sayfa ve nötr (karakter yok, ödül yok). Başlık "Doğum yılın" ve 4 haneli giriş alanı
  (boş, varsayılan yok, kaydırma çarkı yok). Sayısal tuş takımı (her tuş 160×128 px, alt yarıda). "Devam" 4 hane
  girilince etkin. "18" ipucu yok.

- [design-lead → entrepreneur] ad adayları ve sanat yönü (NAMING §5): Görsel açıdan değerlendirmem:
  - A1 **Lift & Land**: mağaza kreatifi ve simge için en güçlüsü (yaylı aşırma hareketi logoda doğrudan çizilebilir).
  - A2 **Hue Hill / Renktepe**: uzun vadeli dünya markasında en güçlüsü (palet, bölüm arka planları, kasaba ekranı
    zaten "renkli tepe").
  - A3: çocuk sinyali notuna katılıyorum.

  Tek global EN marka seçilirse logo bir kez EN çizilir; TR oyuncu da EN logoyu görür.
  Önem: Öneri
  Düzeltme: Seçimden sonra design-lead logo brifini yeniden yazar (ASSET_LIST `logo_wordmark`; şu an "MİNİK USTA"
  ve İ noktası yıldız). Ayrıca oyun içi EN firma adı için onay: STORY'de `{company}` yer tutucusu, varsayılan
  "Tuna & Co.". NAMING'e bu ad da eklensin ya da alternatif verilsin. Kepçe'nin EN adı "Kepche" (P-6 ile uyumlu).

- [design-lead → entrepreneur] §2 benzerlik kuralları ↔ sanat yönü: (1) Bölüm 5 "Festival Şatosu" paleti gece moru +
  altın ışıklar ve şato teması, Royal Match/Kingdom'ın kale + kraliyet paletine yaklaşabilir. (2) Şantiyenin derin
  ozalit mavisi (#1F4F8F) üstünde parlak bloklar, Block Blast'ın lacivert tahta + neon görünümünü çağrıştırabilir.
  Önem: Öneri
  Düzeltme (design-lead revizyonu): Şato'da taç, arma, kraliyet altını kenar süsü olmayacak; şato renkli bloklardan bir
  "festival kalesi", ışıklar sıcak sarı ip lambalar. Ozalit yalnız 2 sütunda kalır (tahtanın %24'ü), bloklar mat ve
  parıltısız (neon/glow yok); mağaza görsellerinde sıcak saha baskın. R-04 yan yana karşılaştırmasına Bölüm 5 ve oyun
  ekranı da eklensin.

- [design-lead → entrepreneur] §12.1 Albüm "Sonra" ↔ UX / STORY / ASSET: Benim belgelerim Albüm'ü MVP gibi kullanıyor
  (alt nav sekmesi, bölüm sonu "Albüme eklendi" kartı, `album_card_*`). Ayrıca "kasaba görevi sahnesi MVP-lite"
  (diyaloglu sahne Sonra).
  Önem: Öneri
  Düzeltme (design-lead revizyonu): Albüm sekmesi Takım gibi kilitli "Yakında" gösterilir; "Albüme eklendi" kartı ve
  albüm kartı varlıkları "Sonra"ya alınır. Görev mini sahnesi MVP'de yapı belirme animasyonu + **tek satırlık balon**
  olarak kalsın (STORY §5; maliyeti yalnız i18n metni). Onay?

- [design-lead → entrepreneur] E10 günlük ödül ve LiveOps adları: Kaçırılan gün "durur" kuralı UX'te görünmeli. Hafta
  6 "Kepçe'nin Kazı Haftası" EN'de "Kepche's Dig Week" olur. Yol haritası §9.3 "Gribeton'u Renklendir" adı, hikayede
  dost olan Gribeton'u "yenilen taraf" gibi gösterebilir.
  Önem: Öneri
  Düzeltme: Günlük ödül takviminde kaçırılan gün "bekliyor" (saat simgesi) gösterilir, sıfırlama animasyonu yok.
  Bölüm 10 adı "Gribeton'la Renkli Atölye" gibi ortaklık vurgulu olsun (design-lead + product-lead).
