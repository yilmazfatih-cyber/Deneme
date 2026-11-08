# product-lead çapraz inceleme — tur 1 (2026-10-04)

İncelenen belgeler:
- code-lead: `TECH_DESIGN.md` (kuralların kapsanması; S-1…S-28 sorularına GDD §15'te verdiğim yanıtlar; `review_inbox/code-lead.md`'deki kenar modeli revizyonu).
- design-lead: `UX_FLOWS.md`, `JUICE.md`, `STORY.md`, `ART_DIRECTION.md` (kural tutarlılığı).
- entrepreneur: `BUSINESS.md` (oyun dengesi).

Bakış açım kural tutarlılığı, kuralların koda tam yansıması ve oyun dengesi. Diğer ajanların 1. bölüm yorumlarını
tekrarlamadım: eşit boyutlu teklif düğmeleri, bot etiketi, Albüm kapsamı, yaş ekranı, debug paneli bunlara dahil.

Özet: **Engel 1 · Önemli 23 · Öneri 23** (toplam 47).

---

## code-lead — TECH_DESIGN.md

- [product-lead → code-lead] K-34 Alttan Üste doğrulamada yok (§5.2, §6.1 `crane`/`trowel`, §9.7, §14): Kural yoksa bir blok, altındaki boş renkli hücrenin üstüne raydan ya da düşerek kilitlenebilir. Açık gökyüzü kuralı yüzünden o gömülü delik bir daha doldurulamaz. Somut durum: Bölüm 3'te ray basamağı (`f`) `a`'dan (O4 W) önce konursa (UX §13.2 Bölüm 3 adım 1 tam olarak bunu istiyor) (6,2)–(7,2) kilitlenir. (6–7, 0–1) bir daha dolmaz, bölüm çözümsüz kalır. K-30 karıştırması şantiyedeki deliği kapatamaz.
  Önem: Engel
  Düzeltme: §5.2 doğrulamasına 3. koşul eklensin: bloğun kapladığı her sütunda, en alt hücresinin altında kalan `.` olmayan bütün plan hücreleri doğru dolu olmalı. Moloz ve yapışmış harç "doğru dolu" sayılmaz. Aynı denetim `crane` ve `trowel` hamlelerinde de yapılsın. K-34 Faz 2 kapsamına (§14) girsin. Test: "K-34 rail over empty colored cell is wrong". Gölge `verdict` alanı bu sonucu kullansın.

- [product-lead → code-lead] kural kapsamı (§12.4 "her K-01…K-33"): GDD artık K-01…K-46 ve E-01…E-32 kenar durumlarını içeriyor. Faz 2 kapsamında (§14) K-34 (Alttan Üste), K-35 (hamle sonu hattı), K-41 (build hedefi), K-43 (çıkış) ve K-44 (şekiller) yok; oysa 1–5. bölümler bunları kullanıyor.
  Önem: Önemli
  Düzeltme: `test:rules` kapsamı K-01…K-46, bütün W/Y/S/G engelleri ve `E-xx` test adlarını içersin. §14 kapsam satırına K-34, K-35, K-41, K-43 ve K-44 eklensin.

- [product-lead → code-lead] teslimat sırası (§6.2 adım 8–9): Şu anki tasarımda yeni parti adım 8'de hemen teslim ediliyor, eski kuyruk 9'da yeniden deneniyor. Böylece önceden bekleyen bloklar yeni gelenlerin arkasında kalıyor. GDD'deki kural (K-25, K-26, K-35) farklı: adım 8 partiyi yalnızca kuyruğun sonuna ekler, adım 9 bütün kuyruğu FIFO sırasıyla bir kez dener ve yerleşemeyen blok sonrakileri bekletmez.
  Önem: Önemli
  Düzeltme: Adım 8 = `enqueue(batch)`, adım 9 = FIFO deneme. Aday sütun sırası K-25'teki gibi olsun: önce bloğun `x`'i, sonra `dropColumns`, sonra `x`'e uzaklık; eşitlikte duvara yakın olan önce. Test: "K-26 older queued pieces deliver first".

- [product-lead → code-lead] S-21 boya kapısı (§7.2 W6 "yalnızca RAIL ile o geçitten şantiyeye bırakılınca"): GDD'de farklı karar verdim (öneri P-6). İptal edilmeyen ve sürükleme yolu boya geçidinin RAIL düğümünden geçen her hamlede blok boyanır; sahaya geri dönen blok da boyanır. Gerekçe: boyanan blok sonra duvar üstünden yerleştirilebilir, YAO korunur (Bölüm 22'nin niyeti budur).
  Önem: Önemli
  Düzeltme: `Move.drag`'e `via?: number` alanı eklensin (yolda ziyaret edilen boya geçidi). `onPassGap` bırakma konumundan bağımsız olarak, `via` varsa adım 1'de çalışsın. `pathTo` boya düğümünü içeren yolu kaydetsin. Solver, boya geçidi olan bölümlerde "geçitten geçip sahaya dön" aday hamlesini de üretsin.

- [product-lead → code-lead] S-9 balon tavanı (§5.1 "`iy + h = 8` tavanı"): GDD'de tavan, şantiyede aktif dilimin plan tepesi (satır h + e), sahada y=7 (öneri P-3). Bunun bir yararı da var: serbest kipteki balonun varış yeri bırakma yüksekliğine bağlı olmaz. Böylece §4.5'teki "balonda O(h) tarama" ve §9.3'teki "her farklı varış ayrı aday" gereksizleşir.
  Önem: Önemli
  Düzeltme: `computeFall` balon için en üst hücreyi `h + e − 1` satırına koysun. O sütunlarda siluet tavana ulaştıysa blok siluetin üstünde kalır ve bu plan dışı sayılır. Test: "S8 balloon hangs from plan top".

- [product-lead → code-lead] iki küçük kural netleştirmesi (öneri P-2): (a) W8 rüzgâr: S-8 yanıtıma ek olarak, bırakma anında d = 0 ise (blok siluete oturmuşsa) kayma olmaz. (b) Y8 harç: blok yalnızca bütün hücreleri plan alanındaysa yapışır, değilse normal geri seker. Bu, asansörde bloğun tahtadan taşmasını önler (E-08).
  Önem: Öneri
  Düzeltme: W8 `modifyFall`'a `distance ≥ 1` koşulu; Y8 `onPlacement` yalnızca `allCellsInPlanArea` iken `stick` döndürsün. Testler: "W8 no drift when resting", "Y8 sticks only inside plan area".

- [product-lead → code-lead] adım 6 saha yerçekimi (§5.3, §6.2): S-7 yanıtıma göre yerçekimiyle düşen blokların düşüş öncesi hücreleri de komşu etkisi üretir. Yırtılan torba ya da yok olan kasa yerçekimini yeniden çalıştırır (döngü); düşen torba etki üretmez; balonlar Y6 açıkken yükselir. §5.3'te bunların hiçbiri yazılı değil.
  Önem: Önemli
  Düzeltme: Adım 6 = `do { settle(); applyNeighborEffectsOfFalls(); } while (changed)`. Her engel bir hamlede en çok 1 kez etkilenir. `settleYard` balonları yukarı yönde de işlesin. OBSTACLES N24–N27, N33 ve N34 için birer test yazılsın.

- [product-lead → code-lead] ıslak beton ve teslimat (§6.2 adım 10): GDD K-35'e göre o hamlede kamyonla gelen ıslak blok sayacından kaybetmez (E-31). Tasarımda bu istisna yok.
  Önem: Öneri
  Düzeltme: Parça tamponuna `arrivedTurn` alanı eklensin; Y4 `onMoveEnd` `arrivedTurn == turn` olan blokları atlasın.

- [product-lead → code-lead] K-30 Kamyon Yardımı (§9.7): D2 (malzeme açığı) durumunda konum ya da şekil karıştırmak eksik hücreyi üretemez. GDD'deki yardımlar:
  - D1 (hamle yok): önce zincir ve ıslaklık kalkar.
  - D2 (malzeme açığı): eksik hücre sayısı kadar o renkte `B1` kamyonla gelir.
  - D3 (döşeme): ancak burada malzeme yeniden kesilir (S-19).

  Ayrıca §9.7'deki "kilit çoğunlukla şantiyeden gelir" notu, K-34 gömülü delikleri önlediği için büyük ölçüde geçersizleşir.
  Önem: Önemli
  Düzeltme: `deadlockDetected{reason}`'a göre üç ayrı yardım yolu yazılsın: `material` → `deliverExtra('B1', color, n)` (K-25 yolu); `noMoves` → zincir ve ıslaklığı temizle, gerekirse karıştır; `tiling` → yapıcı karıştırma. Test: "K-30 D2 delivers missing B1 bricks".

- [product-lead → code-lead] bot modeli (§11.2), META §6.2/§7.3 ve `config/events.json` ile çelişiyor:
  - Beceri: TECH 0,30 + 0,65u, META 0,50 + 0,45u.
  - Kazanma olasılığı: TECH `skill − diffPenalty(plank)`, META `s · f(d_k)` (d_k = oyuncunun sıradaki bölümlerinin zorluğu).
  - Lig: TECH "günün saatine göre eğri", META `floor(W'·x^k)` + geç katılım ölçeği.
  - Tohum `saveInstallId` içeriyor.
  Önem: Önemli
  Düzeltme: botSim formül ve parametreleri yalnızca `config/events.json`'dan okunsun (tek kaynak product-lead). Tohum `hash(eventInstanceId, …)` olsun (code-lead'in E8 düzeltmesiyle aynı). Testler META'daki beklenen değerlerle doğrulasın: hepsi Normal iken ≈ 18 bot biter (Monte Carlo ±3); Bronz'da 20. sıra ≈ 38 puan.

- [product-lead → code-lead] bölüm şeması (§8.2) eksikleri:
  - `build.debris[].segment` alanı yok (öneri P-5; 17, 45 ve 50. bölümlerde moloz birden çok dilimde).
  - Kayar kapının ilk yönü tanımlanamıyor.
  - `carouselEvery` aralığı 1–10, GDD'de 2–6.
  - `wetMoves` aralığı 1–20, OBSTACLES'ta 1–5.

  `elevator.dir: 'up' | 'down'` biçimini kabul ediyorum, GDD'yi ben uyarlarım.
  Önem: Önemli
  Düzeltme: `debris` = `PiecePlacement` + `segment?: Int(0,5)`; slider'a `dir?: 'up' | 'down'`; `carouselEvery Int(2,6)`; `wetMoves Int(1,5)`.

- [product-lead → code-lead] doğrulayıcı (§8.3) ile GDD K-45 arasındaki farklar:
  - (a) L-06 ve L-07 yalnızca plan renklerini sayıyor. Kural (LEVELS §0): bölümdeki **bütün blokların** ve planın renkleri sayılır.
  - (b) Bayrak birleşimi yasakları (OBSTACLES tablosu: glass+balloon; debris + herhangi bir bayrak; ağır blokta glass/balloon/mortar) denetlenmiyor.
  - (c) "En çok 1 yeni mekanik" kuralı yok; L-16 yalnızca `teaches` alanının geçerli olduğuna bakıyor.
  - (d) Bir hücrede en çok 1 saklı nesne kuralı yok.
  - (e) L-03 / S-3: öğretici bölümlerde de `error` olmalı.
  - (f) L-13'teki "moloz renk uyuşmazlığı" şartı gereksiz: moloz hiçbir yerde doğru olamaz (K-16), ART'ta da renksiz görünüyor.
  Önem: Önemli
  Düzeltme: L-06/L-07 kapsamı genişletilsin. Yeni kurallar: L-21 bayrak birleşimi; L-22 önceki bölümlerde görülmemiş mekanik sayısı ≤ 1; L-23 saklı nesne çakışması. L-13 yalnızca "şantiyede, kendi dilim alanında" denetlesin. GDD K-45'teki hata adlarını L-xx kodlarına eşleyen tabloyu ben GDD'ye eklerim.

- [product-lead → code-lead] güçlendirici kuralları (§6.1): GDD'deki ön koşul ve etkiler TECH'te tanımsız:
  - K-36 Çekiç: zincirli bloğa vurulunca önce zinciri kırar.
  - K-37 Vinç: zincirli ya da ıslak blok seçilemez; şantiyeye yalnızca doğru (K-34 dahil) yerleşim yapılır; geçersiz hedefte güçlendirici harcanmaz.
  - K-38 Boya Fırçası: yalnızca bölümün plan renkleri seçilebilir; yapışmış harç yeni rengiyle doğruysa kilitlenir.
  - K-39 Geri Al: derinlik 1; son eylem sürükleme değilse kullanılamaz.
  - K-40 Açık Kepenk: `m < 5` iken W4 ve W7 geçişe izin verir; bölümde W4/W7 yoksa seçilemez.
  Önem: Önemli
  Düzeltme: §6–§7'ye güçlendirici başına bir "ön koşul + etki" tablosu ve "mini hat" (K-35 adım 5, 6, 7, 8, 9, 11, 12) eklensin. W4 ve W7'nin `canPassGap` kancası `ctx.s.openShutterUntil` değerine baksın.

- [product-lead → code-lead] can ayırma ve çıkış (§11.1; K-43, META §2): Can bölüm başında ayrılır, kazanınca iade edilir. Uygulama bölüm ortasında kapanırsa bu kayıp sayılır; `m = 0` iken çıkışta ceza yoktur ve oyun öncesi güçlendiriciler iade edilir. "Bölüm içi durum kaydedilmez" ilkesi korunurken bunu uygulamak için küçük bir kayıt gerekiyor.
  Önem: Öneri
  Düzeltme: Kayda `activeAttempt { level, movedOnce, preBoostersSpent }` alanı eklensin; açılışta bu alan varsa deneme K-43'e göre sonuçlandırılsın. Test: "K-43 app killed after first move costs a life".

- [product-lead → code-lead] kenar modeli (review_inbox/code-lead.md'deki P-1 revizyonu): Kabul ediyorum. Kuralların sonucu değişmiyor: K-05 açıklık sınırı, K-12 geçide tam sığma ve sınırda bırakmanın iptali aynı kalıyor. GDD K-04/K-05/K-07'deki "duvar sütunu" ifadelerini revizyonda "duvar sınırı" olarak ben güncellerim.
  Önem: Öneri
  Düzeltme: Testler kural kimliğiyle sabitlensin: "K-05 3-tall piece cannot clear an 8-high wall", "K-12 piece must fit the gap rows entirely", "K-07 release straddling the boundary cancels".

- [product-lead → code-lead] G-L yönlendirme riski (§4.7, R-2): K-34 kabul edilirse şantiyede çıkıntı yalnızca `.` hücrelerinin üstünde kalır. Çıkıntının altına yönlendirilen blok her zaman hatalı olur, yani ray ve pencere tasarımını delmez; ek kısıt gerekmez. K-19'a göre yönlendirme balonun yükselişinde de 1 kez kullanılabilir.
  Önem: Öneri
  Düzeltme: R-2 notu güncellensin; `steer` balon yükselişini de kapsasın. Girdi biçimi design-lead maddesinde (aşağıda).

- [product-lead → code-lead] denge araçları (§9.5–9.6): (a) LEVELS §2'deki 1–10 el çözümleri karalama betiğiyle hücre hücre doğrulandı; Faz 2 golden testi olarak doğrudan kullanılabilir. (b) BUSINESS'taki +5 fiyat dengesini ölçmek için bot raporunda "1 kez +5 alındığında kazanma oranı" sütunu gerekiyor.
  Önem: Öneri
  Düzeltme: `tests/golden/level_001…005.json` LEVELS adımlarından üretilsin; `levels:bot --continue 1` seçeneği eklensin (hedef: +5 sonrası kazanma oranı %70–85).

- [product-lead → code-lead, design-lead] ağır yerçekimi erişilebilirliği (R-3; design-lead'in TECH yorumu): "Şantiye üstünde indirilemez" davranışı varsayılan olursa G-H + cam (eşik 2) + yüksek duvar birleşiminde (Bölüm 42; 15. bölüm ailesi) cam blok duvar üstünden hep kırılır (d ≥ 3). Bölüm ya yalnızca geçitle çözülür ya da hiç çözülmez; YAO ≥ %60 tutmaz.
  Önem: Önemli
  Düzeltme: Varsayılan K-19 olarak kalsın (700 ms). Ayarlar'daki "Zaman baskısı yok" açıkken kayma sayacı **hiç olmasın**: blok indirilebilir, hız ve cam eşiği 2 aynı kalır. Bu, GDD'deki 1400 ms seçeneğinin yerini alır (GDD'yi ben güncellerim). Solver sayacı zaten yok saydığı için çözülebilirlik değişmez.

---

## design-lead — UX_FLOWS.md, JUICE.md, STORY.md, ART_DIRECTION.md

- [product-lead → design-lead] öğretici sırası ile LEVELS çözümü uyuşmuyor (UX §13.2):
  - Bölüm 3, adım 1 Z "geçitten geçir": LEVELS'te ray 2. hamle, önce `a` (O4 W) duvar üstünden konur. Ray önce yapılırsa K-34 hatası çıkar; K-34 yoksa bölüm çözümsüz kalır (code-lead Engel maddesi).
  - Bölüm 4: ray 4. hamle.
  - Bölüm 9: ray bloğu önce boşluğa iner, sonra sağa geçide girer.
  Önem: Önemli
  Düzeltme: Adımlar LEVELS §2 çözümünden alınsın:
  - Bölüm 3: 1 Y `a` duvar üstü → 2 Z `gap:0` + `f` ray → 3 Y kalan blok.
  - Bölüm 4: pencere `tap` ilk adım; 1–3 Y duvar üstü yerleşimler; 4 Z ray.
  - Bölüm 9: el yolu `Y` bloğunu boşluktan aşağı indirir, sonra sağa geçide götürür.

  `highlight` kimlikleri JSON'daki parça indeksine bağlansın.

- [product-lead → design-lead] K-34'ün öğretimi yok (UX §5.4 gölge, §13 bağlamsal öğreticiler, JUICE #13, STORY §6): "Altında boş hücre kaldı" yeni bir hatalı yerleşim nedeni. Gölge hangi hücrenin eksik olduğunu göstermezse oyuncu "renk doğru, neden kırmızı?" diye takılır.
  Önem: Önemli
  Düzeltme: Hatalı gölgede neden K-34 ise altta boş kalan plan hücreleri nabızla vurgulansın; 45° tarama yalnızca renk uyuşmazlığında kalsın. Bağlamsal öğretici `tut.ctx.bottomup` eklensin (ilk K-34 hatasında; büyük olasılıkla Bölüm 2–3): TR "Önce alttaki boşluğu doldur." / EN "Fill the gap below first." `tut.ctx.bounce` nedene göre ayrılsın: renk / pencere / plan dışı / alt boş.

- [product-lead → design-lead] gizli hücrede gölge (UX §5.4, K-18): Gölge açılmamış bir `?` hücresine değiyorsa bütün zorluklarda nötr olmalı. Tabloda bu satır yok; doğru/hatalı rengi gizli rengi açık eder.
  Önem: Önemli
  Düzeltme: Tabloya satır: "gölge açılmamış `?` hücresine değiyor → bütün zorluklarda nötr kesik beyaz kontur, rozet yok". Cam çatlağının bütün zorluklarda gösterilmesine katılıyorum; GDD K-18'i buna göre güncellerim.

- [product-lead → design-lead] hafif yerçekiminde yönlendirme girdisi (UX §13.2 Bölüm 23, JUICE #46; TECH yorumundaki "tahtada herhangi bir yere dokun" önerin): Tahtanın her yeri girdi olursa, JUICE kural 3'e göre düşüş sürerken sıradaki bloğu tutma dokunuşu yönlendirme sanılır.
  Önem: Önemli
  Düzeltme: Girdi = düşüş sürerken şantiyeye ya da üstündeki Vinç Alanı'na dokunmak (x 810–1050, y 288–1488; 240×1200 px büyük hedef). Dokunuş bloğu öbür şantiye sütununa geçirir. Saha tarafına dokunmak blok tutmaya devam eder. Düşüş başına 1 yönlendirme; balon yükselişinde de aynı; 2 genişlikli blokta yok. Metin: `tut.l23.steer` "Düşerken şantiyeye dokun, yan sütuna geçsin."

- [product-lead → design-lead] bölümden çıkış onayı (UX §5.1, §12): "Çıkarsan 1 can gider." her zaman doğru değil. K-43'e göre ilk hamleden önce çıkış cezasız ve oyun öncesi güçlendiriciler iade edilir (öneri P-7).
  Önem: Öneri
  Düzeltme: `m = 0` iken "Henüz hamle yapmadın; can gitmez."; `m ≥ 1` iken mevcut metin; Köprü'deyse ek satır "Köprüden düşersin."

- [product-lead → design-lead] güçlendirici akışı (UX §5.2) K-36…K-40 ile uyumlanmalı:
  - Vinç şantiyede yalnızca doğru (K-34 dahil) hedefe bırakılabilir.
  - Boya Fırçası renk seçicisinde 8 renk değil, yalnızca bölümün plan renkleri olmalı.
  - Geri Al yalnızca son eylem sürüklemeyse etkindir (derinlik 1; gri durum gerekli).
  - Altın Mala'da yalnızca K-34'ü sağlayan hücreler parlamalı.
  Önem: Önemli
  Düzeltme: §5.2'ye bu durumlar ve gri/etkin halleri eklensin. `tut.ctx.goldtrowel` metni: "Altın Mala'yla altı dolu boş bir hücreye dokun."

- [product-lead → design-lead] Açık Kepenk (UX §4, JUICE #67, STORY `tut.l20.openshutter`): Güçlendirici yalnızca Kepenk (W4) ve Kilitli (W7) geçitleri açar; kayar kapı ve boya kapısı etkilenmez. W4/W7 olmayan bölümde yuva gri olmalı (K-40). "Beş hamle geçitler açık" metni fazla geniş.
  Önem: Öneri
  Düzeltme: Yuvaya "Bu bölümde kepenk yok" durumu eklensin. JUICE #67 bayrağı yalnızca W4/W7 üstünde görünsün. Metin: "Açık Kepenk: beş hamle kepenkler ve kilitler açık."

- [product-lead → design-lead] Bölüm 8 öğreticisi (UX §13.2, STORY `tut.l8.hammer`): Çekiç adımı Z (zorunlu). Böylece bölümün asıl dersi (ağır paleti boş alana çekmek, K-10 + Y5) ve LEVELS'teki çözüm atlanıyor; metin de Çekiç'i tek yol gibi anlatıyor.
  Önem: Önemli
  Düzeltme: Adım 1 Z = paleti boş alana sürükle (`piece:Q` → `cell:0,5`). Adım 2 Y = Çekiç tanıtımı (ücretsiz deneme; "İstersen Çekiçle kır."). `tut.l8.heavy` metni: "Bu çok geniş. Kenara çek ya da kır."

- [product-lead → design-lead] Bölüm 27 `repeat` öğreticisi (UX §13.2): "panoramadan şantiyeye kopya oku" yanlış. K-32'de `repeat`, aynı dilimde `period` satır aşağıdaki hücreyi kopyalar; önceki dilimi değil (S-17).
  Önem: Önemli
  Düzeltme: El ve ok, `?` hücresinden `period` satır aşağıdaki açık hücreye dikey çizilsin. Panorama yalnızca `mirrorOf` öğreticisinde (Bölüm 29) kullanılsın.

- [product-lead → design-lead] Bölüm 22 boya kapısı öğreticisi (UX §13.2, STORY `tut.l22.paint`): Öneri P-6 kabul edilirse dersin içeriği "geçitte boya, sahaya geri çek, duvar üstünden yerleştir" olur (LEVELS 22'nin niyeti).
  Önem: Öneri
  Düzeltme: Adım 1 Z: blok geçide girer, boyanır, sahaya geri çekilir. Adım 2 Y: blok duvar üstünden yerleştirilir. Metin: "Geçitte boya, sonra duvarın üstünden taşı."

- [product-lead → design-lead] Köprü'yü bitirme durumu (UX §9, STORY `bridge.won` "Ödülün hazır."): META §6.1'e göre pay, etkinlik süresi dolunca ya da köprüde oynayan kalmayınca kesinleşir; bitiren sayısı bu arada değişebilir. "Kazandı → Topla" akışı yanlış beklenti yaratır.
  Önem: Önemli
  Düzeltme: Yeni durum "bitirdi, bekliyor": "Karşı kıyıdasın! Payın köprü kapanınca kesinleşir (şu an ●{share})." + geri sayım. "Topla" yalnızca köprü kapanınca çıksın. `bridge.won` iki anahtara ayrılsın.

- [product-lead → design-lead] Usta Ligi çizgileri ve ödül bantları (UX §10): Bronz Mala'da düşme çizgisi, Elmas Mala'da terfi çizgisi olmamalı. 4–20 ve 21–50 sıraların küçük ödülleri (META §7.2) listede görünmeli.
  Önem: Öneri
  Düzeltme: Lig ekranına iki durum: `tier = bronze` iken düşme çizgisi yok, `tier = diamond` iken terfi çizgisi yok. Satırların sağında ödül bandı ikonu.

- [product-lead → design-lead] Bonus İnşaat örnek sayıları (UX §6, JUICE #56): "+7 hamle → ● 70" ve "● +120" örnekleri META §3.1 ile uyuşmuyor. META: hamle başına 3 altın (en çok 10 hamle), kazanma 20/30/50/75, kalan Altın Mala başına 10.
  Önem: Öneri
  Düzeltme: Wireframe örneği "+7 hamle → ● 21" olsun; bütün sayılar `config/economy.json`'dan okunsun. Kalan Altın Mala da Bonus İnşaat'ta altına dönüşsün (mala başına +10).

- [product-lead → design-lead] kasaba görevleri (STORY §5 ↔ META §1): STORY'deki 5 × 7 = 35 görevi ve maliyetlerini kabul ediyorum (her hikaye bölümü 10★, benim kuralımla aynı). META ve `economy.json`'u STORY'ye göre güncelleyeceğim: anahtarlar `town.ch<n>.t<m>.name`, giriş sahnesi 1. görev tamamlanınca, mini sahne ≤ 2 s. İki küçük tutarsızlık:
  - UX §2.2'deki FTUE görev metni "Ağaç evin merdivenini kur" ↔ STORY 1. görev "Ağaç basamakları".
  - UX §3 "Boş" durumu ("Sonraki yapı Bölüm 21'de") 10★ = 10 bölüm olduğu için yalnızca Hikaye 5 bitince oluşur.
  Önem: Öneri
  Düzeltme: UX §2.2 metni `town.ch1.t1.name` anahtarına bağlansın. "Boş" durumunun metni "Yeni yapılar yolda" olsun.

- [product-lead → design-lead] ipucu satırlarının kurala uygunluğu (STORY §6):
  - `tut.l10.crane` "her şeyi taşır": Vinç zincirli/ıslak bloğu seçemez, şantiyeye hatalı yerleşim yapamaz.
  - `tut.l35.mortar` "nereye düşerse yapışır": yalnızca hatalı yerleşimde ve plan alanının içinde yapışır.
  - `tut.l18.bag`: torba, yanındaki blok oynatılınca yırtılır.

  Ayrıca OBSTACLES'taki `tut.<kimlik>` metinlerim ile STORY'deki `tut.l*` satırları iki ayrı kaynak oluşturuyor.
  Önem: Öneri
  Düzeltme: TR önerileri:
  - "Vinç bloğu istediğin yere taşır, döndürür."
  - "Harçlı blok yanlış yere düşerse yapışır."
  - "Torbanın yanındaki bloğu oynat, yırtılsın."

  Metinlerin tek kaynağı STORY olsun; OBSTACLES'taki satırlarımı kaldırıp STORY anahtarlarına bağlayacağım.

- [product-lead → design-lead] olay oynatma sırası (JUICE ↔ GDD K-35): Tablolarda hamle sonu olaylarının sırası ve eşzamanlılığı yazılı değil. Oyuncunun neden-sonucu okuyabilmesi gerekiyor: cam kırılması → sayaç −2; torba yırtılır → zincirleme düşüş → kamyon.
  Önem: Öneri
  Düzeltme: JUICE §0'a kural: "Oynatma sırası = K-35 adımı."
  - Adım 1–4 sıralı: bırakma, düşüş, doğrulama, sayaç.
  - Adım 5 (komşu etkileri) aynı anda.
  - Adım 6 (zincirleme düşüş) 30 ms kademeli.
  - Adım 8 (kayma 600 ms) → adım 9 (kamyon 700 ms): sıralı ve girdi kilitli.
  - Adım 10 zamanlayıcıları (kepenk 350, kayar kapı 300, döner platform 500, asansör 300, ıslak beton 150 ms) aynı anda; en uzunu 500 ms.
  - Kazanma ya da kaybetme en son.

- [product-lead → design-lead] Kamyon Yardımı ve cam animasyonları (JUICE #21, #42): GDD K-30'da üç ayrı yardım var (D1 zincir/ıslaklık kalkar, D2 eksik `B1` teslimi, D3 yeniden diziliş); #21 tek bir "karıştırır" animasyonu gösteriyor. #42'de kırılan cam blok "sahanın üstünden yeniden belirir" deniyor; K-17'ye göre başlangıç hücresine döner.
  Önem: Öneri
  Düzeltme: #21 üç varyanta ayrılsın: "Kamyon eksik malzemeyi getirdi" (#19 teslimatı + Usta Dede balonu), "Zincirler çözüldü", "Saha yeniden dizildi". #42 metni: cam blok başlangıç hücresine döner.

- [product-lead → design-lead] balon tavanı görünürlüğü (ART §4–§5, öneri P-3): Balon şantiyede aktif dilimin plan tepesine asılır; bu tavanın ekranda görünmesi gerekiyor.
  Önem: Öneri
  Düzeltme: İskeleye plan tepesinde (h satırında) yatay bir "tavan kirişi" eklensin (kuşak borusu, 12 px); asansörde çerçeveyle birlikte hareket etsin. JUICE #43 metni: "tavana takılır".

- [product-lead → design-lead] saklı nesne ışıltısı (ART §6'daki açık soru): Adalet ilkesi gereği (bilgi gizlenmez) yanıtım evet: saklı vida ve anahtarın yeri her zorlukta ışıltıyla görünsün, oyuncu kazıyı planlayabilsin.
  Önem: Öneri
  Düzeltme: Işıltı her zorlukta gösterilsin; GDD K-42'ye "konumu ışıltıyla bellidir" maddesini eklerim.

- [product-lead → design-lead] palet ve renk adı (ART §2.1, P-1 palet, P-9 "Gök Mavisi"): Kurallar yalnızca renk kodlarını (W…P) kullanıyor; hex değişikliği bölüm verisini etkilemiyor, P-1'i kabul ediyorum. P-9'u destekliyorum: LEVELS 21'deki "cam bloklar B renkli" ifadesi tam da bu karışıklığın örneği.
  Önem: Öneri
  Düzeltme: P-9 kabul edilirse LEVELS ve OBSTACLES'ta B'yi "Gök Mavisi" diye yazarım. Ayrıca bölüm tasarım kontrol listeme bir madde eklerim: renk körlüğünde en yakın kalan çiftler (Y–O, W–R, G–B) aynı dilimde yan yana hedef olarak kullanılmayacak.

- [product-lead → design-lead] FTUE'de bölüm öncesi pencerenin atlanması (UX §2, Bölüm 1–2): Kurallarla uyumlu; ilk güçlendirici 8/12'de, galibiyet serisi 15'te açılıyor.
  Önem: Öneri
  Düzeltme: Kabul. UX §2'ye not: pencere atlansa da can bölüm başında ayrılır (META §2).

---

## entrepreneur — BUSINESS.md

- [product-lead → entrepreneur] +5 hamle ve ödüllü reklam (§4.3, §4.5-2): 900/1.350/1.800 eskalasyonunu ve 3 teklif sınırını kabul ediyorum; META ve `economy.json` aynı. Ancak reklamla alınan +5'in bu 3 teklif sınırına dahil olup olmadığı yazılı değil. Dahil değilse bir denemede 4 uzatma (+20 hamle) mümkün olur; 11–14 hamlelik bölümlerde bu, hamle tamponunun 3–4 katı.
  Önem: Önemli
  Düzeltme: Reklam yalnızca 1. teklifin ödeme alternatifi olsun; deneme başına toplam uzatma ≤ 3. §4.3 ve P-4 metni buna göre düzeltilsin. `economy.json`'daki `maxOffersPerAttempt: 3` iki yolu birlikte saysın.

- [product-lead → entrepreneur] Köprü harcama tavanı (§4.5-6): 5.400 altın, eskalasyon basamaklarıyla tutmuyor: bir tam eskalasyon 900 + 1.350 + 1.800 = 4.050, iki tam eskalasyon 8.100. Denge açısından beklenen Köprü payı ≈ 650 altın (META §6.2); 4.050 bile beklenen kazancın 6 katı.
  Önem: Önemli
  Düzeltme: Önerim tavanın 4.050 olması (etkinlik turu başına bir tam eskalasyon). Başka bir sayı seçilecekse eskalasyon basamaklarıyla tutarlı olsun. `events.json`'a `bridgeSpendCapCoins` alanını ben eklerim.

- [product-lead → entrepreneur] kumbara dolum hızı (§5.3; kapasite 3.000–6.000, açılış Bölüm 20): META'daki ilk değerlerimle (galibiyet başına 20/30/40 altın, kırma eşiği 1.500) 20 → 50 arasındaki 30 galibiyette ≈ 700 altın birikiyor. Kumbara MVP içeriği bitene kadar hiç kırılamıyor; satış noktası boşa gidiyor.
  Önem: Önemli
  Düzeltme: META'da dolumu 40/60/80'e, kırma eşiğini 1.000'e çekiyorum; ≈ Bölüm 45'te kırılabilir olur. Kapasite 3.000 kalsın. Soru: $2,99 fiyat bu eşik ve kapasiteyle uyumlu mu?

- [product-lead → entrepreneur] içerik sonu (P-8, §9.2):
  - "Usta Modu = solver minimumu + 1, Zor etiketi": +1, Çok Zor tamponundan (+2) bile dar. Orta botun kazanma oranı %25'in altına düşer; içerik sonundaki etkinlik oyuncusu sürekli can kaybeder.
  - MVP için "etkinlik bölümleri tamamlanmış bölümlerden seçilir" kuralı tanımlı değil.
  Önem: Önemli
  Düzeltme: Usta Modu hamlesi = minimum + 2 olsun (META P-8). Usta Modu "Sonra" kalırsa MVP kuralı:
  - 50'den sonra "Oyna" 11–50. bölümleri sırayla, özgün hamle bütçesiyle tekrar oynatır.
  - Ödül yalnızca kazanma tabanıdır (Bonus İnşaat yok); yıldız yok.
  - Köprü ve Lig'e sayılır.

  Hangisinin MVP'ye gireceğine proje sahibi karar vermeli.

- [product-lead → entrepreneur] LiveOps parametreleri (§7, `events.json`): İstenen alanları ekleyeceğim: havuz, pencere, ödül ekleri, lig çarpanı, hafta sonu çarpanı, UTC başlangıç–bitiş. İki denge şartım var:
  - Lig çarpanı uygulanan haftalarda botlara da aynı çarpan uygulanmalı (adalet ve E8).
  - "Günde 2 pencere" benim modelime uymuyor: katılım her an açık (6 saat + 120 dk bekleme).
  Önem: Öneri
  Düzeltme: §7 tablosunda "pencere" yerine `maxBridgesPerDay` kullanılsın; lig çarpanı satırına "botlar dahil" yazılsın.

- [product-lead → entrepreneur] B planı (§12.3): S5, W8, Y8, S6 ve S8 birlikte kesilirse 31–50'nin 14 bölümü yeniden kurgulanmak zorunda kalır. Maliyet açısından Y8 (`onPlacement` + `moveCost`) ve S8 (`modifyFall` yönü) ucuz; pahalı olanlar S5/S6 (strateji + solver fazı) ve G-L yönlendirmesi (code-lead'in yorumu).
  Önem: Öneri
  Düzeltme: Kesme sırası: önce G-L yönlendirmesi (yalnızca yavaş düşüş kalır), sonra S6, sonra S5. Y8, S8 ve W8 kalsın. Bu durumda LEVELS'te yalnızca 7 bölüm değişir: 31, 34, 37, 39, 40, 48, 49.

- [product-lead → entrepreneur] MVP tablosu (§12.1 "Çekirdek oynanış K-01…K-33"): GDD artık K-01…K-46 (K-34 Alttan Üste, K-35 hamle sonu hattı, güçlendirici, akış ve doğrulayıcı kuralları).
  Önem: Öneri
  Düzeltme: Satır "K-01…K-46 (GDD)" olarak güncellensin.

- [product-lead → entrepreneur] ödemeyen oyuncu şartı (§5.4): META §9'a göre ödemeyen oyuncu 10 bölümde ≈ 1.120 altın kazanır. Bu, 10 bölümde 1 kez +5 almaya yeter, 2 kez almaya yetmez; şart karşılanıyor. Başlangıç Paketi'ndeki 2.500 altın ≈ 22 bölümlük kazanç; tek seferlik olduğu için dengeyi bozmaz.
  Önem: Öneri
  Düzeltme: Faz 3 ekonomi simülasyonuna (bot raporu) iki sütun eklensin: "altın / 10 bölüm" ve "+5 sonrası kazanma oranı (hedef %70–85)". code-lead ile birlikte.
