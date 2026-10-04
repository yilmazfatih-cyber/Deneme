# entrepreneur — çapraz inceleme, tur 1 (bölüm 1)

Tarih: 2026-10-04 · İnceleyen: entrepreneur · Kapsam: UX_FLOWS, STORY, ART_DIRECTION, ASSET_LIST, JUICE (design-lead);
TECH_DESIGN (code-lead). Bakış: teklif ve satın alma noktaları, çocuğa yönelik görünmeme şartları (BUSINESS §3 S1–S14),
P-2…P-6 ve P-10 (BUSINESS §13), maliyet ve süre, kapsam (MVP / Sonra).
Not: P-n kararları henüz ÖNERİ durumunda olduğu için hiçbir yorum "Engel" olarak işaretlenmedi; Önemli olanlar bu
sprintte kapanmalı.

Özet: Engel 0 · Önemli 19 · Öneri 20

---

## design-lead — UX_FLOWS.md

- [entrepreneur → design-lead] UX_FLOWS §7 +5 hamle penceresi, seçenek asimetrisi: "+5 HAMLE ● 900" 760×176 birincil, reklam 560×128 ikincil, "Vazgeç" 400×128 metin düğme. Ücretli seçenek görsel olarak baskın, vazgeçme zor bulunuyor; BUSINESS E5 ve §4.3 ("Hayır, teşekkürler" aynı boyutta) ile çelişir.
  Önem: Önemli
  Düzeltme: "Vazgeç" dolgulu ikincil düğme olsun, en az 560×144 ve reklam düğmesiyle aynı boyut; metin düğme kullanılmasın. Üç seçenek rahat bölgede (y ≥ 1180) kalsın; × kapat da korunur.

- [entrepreneur → design-lead] UX_FLOWS §7 +5 hamle penceresi, fiyat bilgisi ve eskalasyon: Pencerede gerçek para karşılığı yok. 2. ve 3. teklif fiyatları (1.350 / 1.800) ve "deneme başına en fazla 3 teklif" durumu tanımlı değil (BUSINESS §5.4, P-3, P-4).
  Önem: Önemli
  Düzeltme: Düğme metni "+5 hamle · 900 altın (≈ $1,79)" olsun; para karşılığı `economy.json`'dan, Avuç paketinin birim fiyatıyla hesaplanır. Yeni durumlar: "2. teklif 1.350", "3. teklif 1.800 · son teklif". 3. tekliften sonra pencere doğrudan Pencere 2'ye (can kaybı) geçsin.

- [entrepreneur → design-lead] UX_FLOWS §7 + Sallanan Köprü kayıp hali, baskı dili: Kayıp penceresinde Tuna "Az kaldı!" diyor; Köprü'de ayrıca "+5 hamle elenmeyi önler" satırı var. Satın alma anında yakın-kayıp ve kayıp kaçınma vurgusu oluşuyor (P-4 madde 4).
  Önem: Önemli
  Düzeltme: Kalan hedef bilgisi tarafsız kalsın: "Kalan: 2 hücre". Tuna yalnızca "kararlı" ifadede, balonsuz. Köprü'de tek satır tarafsız bilgi: "Devam etmezsen bu turdan çıkarsın." "Kalan oyuncu" sayısı ve ödül havuzu kayıp penceresinde gösterilmesin.

- [entrepreneur → design-lead] UX_FLOWS §9 Sallanan Köprü, kural kartı ve bot etiketi: "Katıl" öncesinde kural kartı yok; rakiplerin bot olduğu hiçbir yerde yazmıyor (P-4 madde 3, P-5).
  Önem: Önemli
  Düzeltme: İlk "Katıl"a basınca bir kerelik kural kartı çıksın. İçerik: "7 bölümü art arda kazan · Kaybedersen elenirsin · +5 hamleyle devam edebilirsin · Rakiplerin bilgisayarın yönettiği Renkli Tepe çıraklarıdır". Başlığın yanında (i) düğmesi aynı kartı her zaman açabilsin.

- [entrepreneur → design-lead] UX_FLOWS §10 Usta Ligi, botların görünümü: Örnek satır "1 🎁 Selin_U 42 puan" gerçek bir kullanıcı adı gibi duruyor; botlar gerçek oyuncu sanılır (P-5, risk R-07). Ayrıca Selin bir hikaye karakteri; adın lig satırında görünmesi karışıklık yaratır.
  Önem: Önemli
  Düzeltme: Bot satırları STORY'deki çırak ad listesinden (yeni madde aşağıda) gelsin. Avatar = kask rengi (ASSET_LIST `chr_bridge_helmet_bot_*`). Satırda küçük "çırak" rozeti olsun; bayrak, çevrimiçi ışığı, alt çizgili kullanıcı adı biçimi kullanılmasın. Lig başlığına da (i) bilgi düğmesi eklensin.

- [entrepreneur → design-lead] UX_FLOWS §11 Mağaza, paket miktarları ve içerik: Wireframe'de ●500 / ●1200 / ●2600 var; BUSINESS §5.2'de 1.000 / 2.750 / 6.000 / 13.000 / 35.000 / 75.000. Başlangıç paketi "2.000 + 🔨2" ama BUSINESS §5.3'te "2.500 + 2 Çekiç + 1 Vinç + 2 Termos". Kartlarda gerçek para fiyatı da gösterilmemiş.
  Önem: Önemli
  Düzeltme: Değerler `economy.json`'dan okunsun, wireframe BUSINESS §5 ile hizalansın. Altın miktarları product-lead ile netleşecek; netleşince tek kaynak `economy.json`. Her kartta: altın miktarı, fiyat ("$1,99 / 89,99 TL"; Capacitor'da mağaza fiyatı gelene kadar "…") ve taban pakete göre "+%10" gibi değer etiketi. "En popüler" veya "en iyi değer" etiketi kullanılmasın.

- [entrepreneur → design-lead] UX_FLOWS §3, §4, §5 mini satın almalar, gerçek para karşılığı: Can penceresi ("Altınla doldur"), güçlendirici "+" ve bölüm öncesi yuva "+" pencerelerinde yalnız altın fiyatı var (E2, CPC ilkeleri).
  Önem: Önemli
  Düzeltme: Altınla fiyatlanan her düğmede ikinci satır "≈ $X / ≈ Y TL" olsun. Bunun için ortak bir `PriceLabel` bileşeni tanımlansın, tüm pencerelerde aynı bileşen kullanılsın.

- [entrepreneur → design-lead] UX_FLOWS §3 ve §7, ödüllü reklam yerleşimleri eksik: BUSINESS §4.3'te üç yerleşim var (kayıp ekranında +5, can 0 iken +1 can, günlük ödül ×2); UX'te yalnız ilki var. Günlük tavanın görünümü de tanımsız.
  Önem: Öneri (MVP yer tutucu)
  Düzeltme: Can penceresine "Reklam izle · +1 can (bugün 2/2)" eklensin. Günlük ödül penceresine "Reklam izle · ×2" eklensin. Tavan dolunca düğme gri ve "Yarın tekrar" yazsın; gizlenmesin.

- [entrepreneur → design-lead] UX_FLOWS, günlük ödül ekranı tanımsız: Yalnız kenar ikonu ve bağlamsal öğretici var. E10 ("kaçırılan gün döngüyü sıfırlamaz, durdurur") oyuncuya gösterilmezse PEGI 7 hedefinin dayanağı kaybolur (BUSINESS §3 S14).
  Önem: Önemli
  Düzeltme: 7 günlük takvim penceresi eklensin: bugünkü kutu vurgulu, gelecek ödüller görünür, alt satırda "Bir gün gelmezsen ilerlemen kaybolmaz." "Seriyi kaybetme!" türü uyarı ve geri sayım kullanılmasın.

- [entrepreneur → design-lead] UX_FLOWS §6 ve §10, sandık açılışı: Bölüm sandığı ve lig sandığının açılış akışı tanımsız. E1 gereği içerik sabit olmalı ve açılmadan önce görünmeli; çark, slot ya da rastgele dönen kart animasyonu kumar algısı yaratır (PEGI ücretli rastgele öğe tanımı, Belçika ve Brezilya riskleri).
  Önem: Önemli
  Düzeltme: Sandık penceresinde içerik ikonları kapalı sandığın üstünde baştan gösterilsin ("İçinde: 1 Çekiç, 200 altın"). Açılış = kapak kalkar, ikonlar sırayla üst çubuğa uçar. Dönen, yavaşlayan ya da "neredeyse kazanıyordun" animasyonu olmasın.

- [entrepreneur → design-lead] UX_FLOWS §11 Kumbara kartı: İçerik, kapasite, fiyat ve "dolu" hali tanımsız.
  Önem: Öneri
  Düzeltme: Kartta "Kumbarada 2.350 / 4.000 altın · 2,99 $ / 134,99 TL" bilgisi olsun. Dolu halinde yalnız "Dolu" rozeti; "dolmak üzere, hemen kır!" bildirimi ya da geri sayım olmasın.

- [entrepreneur → design-lead] UX_FLOWS §2 FTUE, mağaza sürümünde yaş ekranı ve onay: P-10'a göre nötr yaş ekranı ve onay (CMP), Bölüm 3 kazanıldıktan sonra ve hiçbir reklam/analitik SDK başlamadan gösterilecek. Akışta bu ekranın yeri yok.
  Önem: Öneri (Sonra: mağaza sürümü; ekran yeri MVP akışında ayrılsın)
  Düzeltme: §2.2'ye "2.3 Mağaza sürümü: Bölüm 3 kazanma → Yaş (doğum yılı kaydırıcısı, varsayılan yok) → Onay → Ana ekran" eklensin. Web MVP'de bu adım atlanır.

- [entrepreneur → design-lead] UX_FLOWS §11 Ayarlar, mağaza sürümü satırları: Gizlilik politikası, veri/onay tercihleri ve harcama limiti (E7) için satır yok.
  Önem: Öneri (Sonra)
  Düzeltme: Mağaza sürümünde "Gizlilik" (politika bağlantısı + onay tercihlerini yeniden aç) ve "Harcama limiti" satırları eklensin. Wireframe'de yerleri şimdiden "Sonra" etiketiyle ayrılsın.

- [entrepreneur → design-lead] UX_FLOWS §7, "Altın al" → Mağaza yönlendirmesi: Kayıptan mağazaya geçişte hangi paketin öne çıkacağı tanımsız.
  Önem: Öneri
  Düzeltme: Mağaza kayıp bağlamıyla açılırsa eksik altını karşılayan en küçük paket (Avuç 1.000) vurgulansın. Pahalı paket önseçilmesin ve otomatik kaydırılmasın.

- [entrepreneur → design-lead] UX_FLOWS, kapsam etiketleri: Brifte olmayan ya da kapsamı genişleten öğelerin etiketleri:
  - Sol el modu → Sonra.
  - Albüm sekmesi ve "Albüme eklendi" kartı → Sonra; sekme kilitli "Yakında" gösterilir (BUSINESS §12.1).
  - EXPAND ölçek → MVP.
  - Kaydı sıfırla → MVP.
  - Lisanslar sayfası → MVP (OFL şartı).
  - Panorama büyük önizleme → MVP-lite.
  - Bağlamsal öğreticiler → MVP.
  - Oyuncu kimliğinin ayarlarda gösterimi → MVP.
  Önem: Öneri
  Düzeltme: Bu etiketler UX_FLOWS ilgili satırlarına eklensin. Albüm çıkarılınca §8 ve §12 akışındaki Albüm bağlantıları "Sonra" olarak işaretlensin.

- [entrepreneur → design-lead] UX_FLOWS §1 açılış logosu: Logo "MİNİK USTA" olarak sabitlenmiş. Oyun adı NAMING kararına bağlı (ilk 3 öneride "Minik" yok). "Minik" öneki mağaza başlığında çocuk ürünü sinyali verir (NAMING §2 ek ilke).
  Önem: Öneri
  Düzeltme: Logo metni marka sabitinden gelsin; logo tasarımı isim kararına kadar yer tutucu kalsın. Splash animasyonu adın uzunluğuna göre ölçeklenebilir tasarlansın (8–12 harf).

## design-lead — STORY.md

- [entrepreneur → design-lead] STORY §7.2, çırak adları ve bot bilgi metinleri yok: Köprü ve Lig'deki 99 bot için oyun dünyasına ait ad listesi ve "bilgisayarın yönettiği çıraklar" bilgi metni gerekiyor (P-5).
  Önem: Önemli
  Düzeltme: `npc.apprentice.<1..120>` ad listesi eklensin (TR/EN, kasaba temalı takma adlar: "Çırak Fındık / Apprentice Hazel" gibi). Gerçek ad + soyad ve kullanıcı adı biçimi ("Selin_U") kullanılmasın. Ek metinler: `bridge.bots_info`, `league.bots_info`, `bridge.rule_card.*`.

- [entrepreneur → design-lead] STORY §7.3, vazgeç metni: `lose.giveup` "Vazgeç / Give up". EN'de "Give up" teslim olma ve suçlama tonu taşıyor (E5, confirmshaming sınırında).
  Önem: Öneri
  Düzeltme: TR "Hayır, teşekkürler", EN "No thanks". `lose.tuna` ("Az kaldı!" / "So close!") satın alma penceresinden kaldırılsın; oyun içi `react.tuna.last` olarak kalabilir.

- [entrepreneur → design-lead] STORY genel ton ve çocuk sinyali: §0 kuralları (çocuk karakter ≠ çocuk dili, kısa ve esprili) BUSINESS §3 S1–S3 ile uyumlu. "Kepche" ve "{company} = Tuna & Co." P-6'yı karşılıyor, teşekkürler. Tek risk: Hikaye 3 (okul, çocuklar kitap asıyor, çocuklar koşuyor) ve Hikaye 1 bitişindeki "kasabanın çocukları", "çocuk odaklı etkinlik" faktörünü güçlendiriyor (COPPA, BUSINESS §3).
  Önem: Öneri
  Düzeltme: Bu panellerde yetişkin kasaba halkı en az çocuklar kadar yer alsın (ör. Ch1 end p1 "Çitin üstünden komşular bakıyor"). Kütüphanenin "kasaba kütüphanesi" olarak da sunulması değerlendirilsin ("okul" adı korunabilir). "Tuna & Co." yalnız oyun içi firma adıdır, mağaza adı değildir.

- [entrepreneur → design-lead] STORY, kapsam etiketleri: §7.1 tepki balonları (`react.*`, "isteğe bağlı") → Sonra. Karakter konuşma "bla" sesleri (JUICE #81, 8 ses) → Sonra. "Devamı yolda…" sahnesi → MVP (içerik sonu ekranıyla uyumlu, ucuz).
  Önem: Öneri
  Düzeltme: STORY §7.1 ve JUICE #81 satırlarına "Sonra" etiketi eklensin.

## design-lead — ART_DIRECTION.md ve ASSET_LIST.md

- [entrepreneur → design-lead] ASSET_LIST §11 `app_icon`: Brif "Tuna's mint hard hat ... peeking over a stack of three colorful toy blocks". Üst üste üç renkli oyuncak blok, okul öncesi ABC küplerini ve Block Blast'ın renkli blok ikonlarını çağrıştırıyor (S5, R-01, R-04). İkon imza hareketi göstermiyor.
  Önem: Önemli
  Düzeltme: İkon = vinç kancasının bir bloğu duvar başlığının (sarı-siyah ikaz şeridi) üstünden aşırdığı an; nane kask marka öğesi olarak köşede kalabilir. Yüz, harf ve küp yığını olmasın. Faz 5'te 2 varyant hazırlansın, A/B testi yalnız 18+ hedeflemeyle yapılsın.

- [entrepreneur → design-lead] ASSET_LIST §11 `store_feature_graphic`: Tuna büyük + ağaç ev odakta. Ağaç ev çocuk temasıdır; S8 ilk görselde tahta + tamamlanan yapı + karakterin ikincil olmasını istiyor.
  Önem: Öneri
  Düzeltme: Sol yarıda kaldır–aşır–indir anı (tahta ölçeğinde), sağ yarıda fener veya fırın gibi yetişkin dünyası yapısı olsun. Tuna küçük ve köşede kalsın.

- [entrepreneur → design-lead] ART_DIRECTION §11.8 özgünlük tablosu, Color Block Jam eksik: Rollic'in Color Block Jam'i renkli blokları eşleşen renkli kapılardan çıkarıyor (BUSINESS §1.2). Bizim W6 Boya Kapısı ve renkli geçit çerçeveleri en yakın görsel temas noktası.
  Önem: Öneri
  Düzeltme: Tabloya satır eklensin: "Color Block Jam — renkli çerçeveli kapılar, kapıdan kayarak çıkış → bizde geçit duvar içinde kestirme, kapı rengi yalnız W6'da ve damla dilinde; mağaza görsellerinde geçit değil duvar üstü hareket öne çıkar."

- [entrepreneur → design-lead] ASSET_LIST §0.1 ve §8, final sanat üretim yöntemi ve fikri mülkiyet: Brifler görüntü üreticisi istemi gibi yazılmış ve negatif istemde marka adları geçiyor (Bob the Builder, PAW Patrol, Royal Match). ABD'de yalnız yapay zekâyla üretilmiş görsel telif korumasına girmiyor (Thaler v. Perlmutter, D.C. Cir., 18 Mart 2025: insan yazarlığı şart). Karakter ve logo AI çıktısı olursa taklitlere karşı korumamız zayıflar. Marka adlarıyla yönlendirilen üretim de benzerlik riskini artırabilir.
  Önem: Önemli
  Düzeltme:
  - Ana karakterler (Tuna, Dede, Kepçe, Gribeton), logo ve uygulama ikonu insan sanatçı tarafından çizilsin. AI yalnızca keşif/eskiz için kullanılsın.
  - Her final varlık için kaynak dosya + üretim kaydı tutulsun (`docs/` altında küçük bir provenance tablosu).
  - Negatif istemlerden marka adları çıkarılsın; yerine öğe tarifi yazılsın ("no yellow hard hat, no overalls, no talking vehicles").
  - Logo ve ana karakter, isim kararıyla birlikte marka başvurusuna eklensin (BUSINESS R-05).

- [entrepreneur → design-lead] ASSET_LIST, final sanat maliyeti ve süresi (tahmin): Kabaca sayım:
  - 47 ara sahne paneli × 1 gün
  - 35 kasaba parçası × 0,5 gün + 5 taban × 1 gün
  - 15 arka plan katmanı × 0,75 gün
  - 4 ana karakter × 4 gün, 4 yan karakter × 2 gün, 5 figüran × 0,5 gün
  - ~45 ikon × 0,25 gün
  - ~20 engel/geçit PNG × 0,25 gün
  - logo, ikon ve öne çıkan görsel 4 gün

  Toplam ≈ 127 sanatçı-günü (tahmin). BUSINESS §10'daki 1,5 FTE sanatla ≈ 17 hafta eder; Faz 2–5'in toplamı 22 hafta. Takvime sığıyor ama tampon yok; kritik yol ara sahne panelleri. Maliyet BUSINESS §10 personel kalemine dahil; ek bütçe gerekmiyor (parça başı dış kaynakta ≈ $12–20 bin, tahmin).
  Önem: Önemli
  Düzeltme: ASSET_LIST'e "öncelik" sütunu eklensin:
  - P0 (Aşama 1 öncesi final): uygulama ikonu, logo, 4 ana karakter, Hikaye 1–2'nin kasabası + panelleri + arka planı, arayüz ikonları.
  - P1 (Aşama 2 öncesi): Hikaye 3–5.
  - P2: albüm kartları, figüranlar.

  Hikaye 4–5 sahneleri 5–6 panelden 4 panele indirilirse 3 panel kazanılır (isteğe bağlı).

- [entrepreneur → design-lead] ART_DIRECTION §11.6 ve ASSET_LIST §8, ifade seti kapsamı: 8 karakterin her biri için 6 ifade = 48 yüz seti. Yan karakterler hikayede 2–4 panelde görünüyor.
  Önem: Öneri
  Düzeltme: MVP'de ana 4 karakter 6 ifade alsın; yan 4 karakter (Ayşe, Selin, Rıza, Kurdele) 3 ifade (mutlu, şaşkın, üzgün) alsın. Kalan ifadeler Sonra.

## design-lead — JUICE.md

- [entrepreneur → design-lead] JUICE #52 +5 hamle teklifi: "+5" çipi 2 saniyede bir zıplıyor. Yalnız ücretli seçeneği vurgulayan döngüsel dikkat animasyonu, kayıp anında baskı yaratır (P-4).
  Önem: Öneri
  Düzeltme: Çip pencere açılırken bir kez zıplasın, sonra dursun. Reklam ve vazgeç düğmeleri aynı giriş animasyonunu alsın.

- [entrepreneur → design-lead] JUICE, kapsam etiketleri: 82 olay var; Faz 2 dikey dilim yalnız çekirdek altkümeyi gerektiriyor.
  - Faz 2 P0: #1–13, 18, 19, 50–53, 55–58, 69–71.
  - Engel olayları (#22–49): ilgili engelle birlikte Faz 3.
  - MVP-lite: #16 dans (yalnız ikon parlaması), #79 logo inşası (blok düşüşü yeterli, karakter animasyonu Sonra).
  - Sonra: #81 karakter "bla" sesleri, #82 boşta göz kırpma, #75 görev sahnesi konfetisi (MVP'de sade yükselme), §7 müzik.
  Önem: Öneri
  Düzeltme: JUICE tablolarına "Faz / Etiket" sütunu eklensin. Code-lead'in Faz 2 #11 EventPlayer kapsamı bu P0 listesiyle eşleşsin.

## code-lead — TECH_DESIGN.md

- [entrepreneur → code-lead] TECH §14 Faz 2 süresi ↔ BUSINESS §10 takvimi: Faz 2 = 16 iş ≈ 21 ajan iş günü. BUSINESS §10'da Faz 2 için 4 hafta (20 iş günü) var, yani tampon yok. Faz 3 (8 hf), Faz 4 (6 hf) ve Faz 5 (4 hf) varsayımlarımın teknik karşılığı belgede yok. Bütçe ve global lansman tarihi buna bağlı.
  Önem: Önemli
  Düzeltme:
  - Faz 2 tahminine %20 tampon eklensin (≈ 25 gün).
  - §14 biçiminde Faz 3–5 için kaba iş listesi ve gün tahmini eklensin (solver/bot, 26 engel, meta ekranları, Capacitor, gerçek cihaz perf turları).
  - Toplam 22 haftayı aşıyorsa BUSINESS §10'u ben güncellerim; aşmıyorsa onaylanmış sayarım.

- [entrepreneur → code-lead] TECH §14 iş #9, basit solver çift iş riski: Faz 2'de katmansız A* yazılıp Faz 3'te katmanlı A* ile yeniden yazılacak (§9, R-1).
  Önem: Öneri
  Düzeltme: Faz 2'de bölüm 1–5 için product-lead'in elle verdiği çözüm dizileri golden test olarak kullanılsın (~1 gün kazanç). Solver yalnız Faz 3'te tek seferde yazılsın. Code-lead solver'ın Faz 2'de product-lead'e hız kazandırdığını gösterirse bu öneri geri çekilir.

- [entrepreneur → code-lead] TECH §11.4 Analytics tip birliği: BUSINESS §6.2'deki etik koruma ve monetizasyon metrikleri ek olaylar olmadan ölçülemez. Ek olaylar (BUSINESS §6.4): `offer_result`, `ad_rewarded`, `coin_source`, `coin_sink`, `event_continue`, `store_open`, `chest_open`, `session_end`, `settings_changed`. Ayrıca `offer_shown` yerleşim ve fiyat taşımıyor.
  Önem: Önemli
  Düzeltme: Bu olaylar MVP tip birliğine eklensin (tip tanımı, maliyeti düşük). `offer_shown`/`offer_result` alanları: `placement`, `priceCoins`, `offerIndex` (1–3), `context` ('level' | 'bridge').
  - `event_continue`: `method` ('coins' | 'ad'), `plank`.
  - `coin_source` / `coin_sink`: `amount`, `reason`, `balanceAfter`.
  - Mağaza sürümünde: `age_gate_result` (yalnız kova) ve `consent_result`.

- [entrepreneur → code-lead] TECH §11.2 EventService, ödeme geçmişinden bağımsızlığın denetlenebilirliği: Formülde `eventSeed = hash32(instanceId, saveInstallId)` var ve `reportLevelResult` harcama bilgisi taşımıyor, bu doğru. Ama bağımsızlık bir kurala ya da teste bağlı değil (P-4, BUSINESS E8).
  Önem: Önemli
  Düzeltme:
  - (a) ESLint `no-restricted-imports`: `src/services/events/**` → `meta/economy`, `services/iap`, `services/ads` yasak.
  - (b) Test "E8 bot standings are independent of purchases": aynı seed ve zamanda ödeyen ve ödemeyen kayıt fikstürü birebir aynı `standings` üretmeli.
  - (c) Bot hayatta kalma dağılımı (`events.json` parametreleri) için ortalama/medyan kazanan sayısı raporlayan küçük bir araç ya da test çıktısı. Böylece Köprü ödül payı (10.000 / kazanan) ile +5 fiyatı karşılaştırılabilir.

- [entrepreneur → code-lead] TECH §1.2 ve §11, reklam ve satın alma servisleri eksik: Ödüllü reklam yer tutucusu (3 yerleşim, günlük tavanlar) ve sahte satın alma (P-2, P-3, E9) için servis arayüzü tanımlı değil. Faz 5'te gerçek SDK'lar dağınık çağrılara eklenirse maliyet ve hata riski artar.
  Önem: Önemli
  Düzeltme: `services/ads`: `RewardedAds { isAvailable(placement), show(placement) → Promise<'rewarded'|'skipped'|'unavailable'> }`; günlük tavanlar `economy.json`'dan. `services/iap`: `Purchases { products() → {sku, coins, priceLabel}[], buy(sku) }`. MVP'de ikisi de sahte uygulamayla (onay metni "Bu bir deneme satın alımıdır, ücret alınmaz."); tavan mantığı ve analytics çağrıları bu servislerde. Faz 5'te aynı arayüze gerçek eklenti takılır (eklenti seçimi o gün `npm view` ile).

- [entrepreneur → code-lead] TECH §12.3 debug paneli üretimde: Panel "`import.meta.env.DEV` ya da `?debug=1`" ile açılıyor. Üretim web derlemesinde `?debug=1` çalışırsa sınırsız hamle ve bölüm seçimi açılır. Bu, mağaza sürümünde monetizasyonu ve Köprü/Lig bütünlüğünü bozar.
  Önem: Önemli
  Düzeltme: Debug parçası yalnız derleme bayrağıyla (`VITE_DEBUG=1`, staging) pakete girsin. Üretim derlemesinde `?debug=1` hiçbir şey yapmasın. `npm run build` için bir test, `dist/` içinde debug parçası olmadığını doğrulasın.

- [entrepreneur → code-lead] TECH §10.7 ve §13, düşük seviye referans cihaz: Perf planı "orta seviye Android"da gerçek cihaz turu öngörüyor. BUSINESS R-09 (en kritik 5 riskten biri) düşük seviye Android'i hedefliyor; imza hareketin hissi bu cihazlarda bozulursa D1 düşer.
  Önem: Önemli
  Düzeltme: Faz 2 sonunda 1 düşük seviye (≤ 3 GB RAM, Android 10–12, giriş seviyesi SoC) + 1 orta seviye cihazla gerçek ölçüm yapılsın. Düşük seviye için hedef (tahmin): ≥ 30 FPS kararlı, sürüklemede girdi gecikmesi ≤ 2 kare. Eşik altında "azaltılmış efekt" profili otomatik açılsın (JUICE "azaltılmış hareket" sütunu temel alınabilir). Cihaz alımı BUSINESS §10'da bütçelendi; model listesini birlikte seçelim.

- [entrepreneur → code-lead] TECH §13 Capacitor, uygulama adı ve paket kimliği: `npx cap init "Minik Usta" <bundle-id>`. Google Play paket adı ve iOS bundle ID yayından sonra değiştirilemez; oyun adı ise NAMING kararına bağlı.
  Önem: Öneri
  Düzeltme: Bundle/paket kimliği ad adayından bağımsız ve nötr seçilsin (ör. `com.<stüdyo>.buildpuzzle`). Görünen ad isim kararından sonra girilsin. `localStorage` anahtarı (`minikusta.save`) iç kullanımda kalabilir.

- [entrepreneur → code-lead] TECH §13, iOS derleme ortamı maliyeti: Capacitor 8 Xcode ≥ 26 istiyor; iOS derleme ve imzalama için macOS gerekli. BUSINESS §10 bütçesinde bu kalem açık değil.
  Önem: Öneri
  Düzeltme: §13'e "macOS derleme ortamı: fiziksel Mac ya da bulut macOS CI, tercih ve aylık maliyet" satırı eklensin. Ben BUSINESS §10'a yansıtırım.

- [entrepreneur → code-lead] TECH §11, onay ve yaş kapısı için kanca: P-10'a göre mağaza sürümünde hiçbir reklam/analitik SDK onay ve yaş ekranından önce başlamamalı.
  Önem: Öneri (Sonra: mağaza sürümü; kanca MVP'de)
  Düzeltme: `services/consent { status(): 'unknown'|'granted'|'denied'; ageBucket(): '<13'|'13-15'|'16-17'|'18+'|null }` eklensin; ads ve analytics sağlayıcıları başlatılmadan önce bu kapıya sorsun. MVP'de no-op (`granted`, `null`) olsun.

- [entrepreneur → code-lead] TECH, kapsam etiketleri:
  - MVP: debug paneli (geliştirme aracı), `tools/perf.ts` + Playwright perf harness (R-09 için zorunlu), `test:rules` (brif şartı), EXPAND ölçek, ASCII içe/dışa aktarma, hamle tekrarı dışa aktarma.
  - Sonra (Faz 3): debug panelinde tarayıcıda Web Worker ile solver oynatma.
  - Sonra (mağaza sürümü): `@capacitor/preferences`, gerçek IAP/reklam eklentileri.

  Belgede MVP için aşırı mühendislik görmedim: Zobrist, `Int32Array` ve worker_threads solver/bot (Faz 3 çıktısı) için gerekçeli.
  Önem: Öneri
  Düzeltme: §12.3'teki "Solver çözümünü oynat (Web Worker 5 s)" maddesine "Faz 3" etiketi eklensin.
