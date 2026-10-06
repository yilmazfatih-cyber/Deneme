# Karar günlüğü

Biçim:

```
### D-012 — Başlık
Durum: KABUL | ÖNERİ | RET     Sahip: ajan     Tarih: YYYY-AA-GG
Karar: ...
Gerekçe: ...
Etkilenen: ...
```

---

### D-001 — Proje, Deneme reposunda `minik-usta/` alt klasöründe yaşar
Durum: KABUL     Sahip: orkestratör     Tarih: 2026-10-04
Karar: Minik Usta ayrı bir GitHub reposu yerine `yilmazfatih-cyber/Deneme` reposunun `minik-usta/` klasöründe, `claude/determined-bardeen-3j767o` dalında geliştirilir. Klasör kendi `package.json`, `CLAUDE.md` ve `.claude/agents/` dosyalarıyla bağımsızdır; ileride olduğu gibi ayrı repoya taşınabilir. Brifteki "git init" adımı, mevcut repo kullanıldığı için uygulanmadı.
Gerekçe: Proje sahibi yeni repo istedi; oturumun repo oluşturma izni yok (GitHub 403). Kökte Köprü projesi yaşadığı için kökü değiştirmek Köprü'yü bozardı.
Etkilenen: tüm yollar `minik-usta/` köküne göredir; kök `.prettierignore` ve `eslint.config.js`'e `minik-usta` yok sayma satırı eklendi.

### D-002 — Teknik yığın sürümleri (npm'den doğrulandı, 2026-10-04)
Durum: KABUL     Sahip: code-lead     Tarih: 2026-10-04
Karar: phaser 4.2.1 (latest), vite 8.3.2, vitest 5.0.3, eslint 10.12.0, typescript-eslint 8.71.0, prettier 3.9.9, @playwright/test 1.63.0; typescript **6.0.3** (latest 7.0.2 değil).
Gerekçe: `npm view <paket> version`. typescript-eslint 8.71.0 peer bağımlılığı `typescript >=4.8.4 <6.1.0`; TS 7 ile lint kırılır. Phaser 4 güncel kararlı ana sürümdür (dist-tag `latest`).
Etkilenen: package.json, docs/TECH_DESIGN.md

### D-003 — `src/theme/tokens.json` design-lead'indir
Durum: KABUL     Sahip: orkestratör     Tarih: 2026-10-04
Karar: `src/**` code-lead'in olsa da `src/theme/tokens.json` design-lead'e aittir (ajan tanımları böyle). Kod bu dosyayı yalnızca okur.
Gerekçe: İki ajan tanımı arasındaki sahiplik çakışmasını açıkça çözmek.
Etkilenen: CLAUDE.md sahiplik matrisi

---

## Faz 1 kapanışı (2026-10-05)

Kaynak: orkestratör kararları R-01…R-24 (`docs/review_inbox/_orchestrator_rulings.md`), ajanların güncel öneri listeleri
(product-lead P-1…P-18, X-1, X-2; design-lead P-1…P-30; code-lead P-1…P-22; entrepreneur BUSINESS §13 P-1…P-13 ve
NAMING §5) ve kapanış dosyaları. Aynı konudaki öneriler tek kayıtta birleştirildi; kaynakları Gerekçe'nin başında yazar.
"ÖNERİ" kayıtları proje sahibinin onayını bekler; belgeler bu kayıtlarda varsayılan olarak öneriye göre yazılmıştır.

### D-004 — K-34 "Alttan Üste" (destek) kuralı ve görünürlük katmanları
Durum: ÖNERİ     Sahip: product-lead (kural), design-lead (görünürlük), code-lead (uygulama)     Tarih: 2026-10-05
Karar: Proje sahibi onayı bekliyor. Bir blok şantiyede ancak kapladığı her sütunda altındaki bütün `.` olmayan plan hücreleri doğru doluysa doğru yerleşir (`.` yalnız boşken dolu sayılır). Görünürlük: inşa cephesi vurgusu (`buildFront`), gölgede ↓ rozeti + eksik destek taraması, geri sekme/harç yapışması sonrası vurgu, ilk karşılaşmada `tut.ctx.support` ve Bölüm 4 yumuşak öğretici adımı. Tek `isCorrectPlacement` doğrulama, gölge, Vinç, Altın Mala, Boya Fırçası ve solver'da kullanılır.
Gerekçe: R-01; product-lead P-1, design-lead P-10 (+ P-7 ↓ rozeti), code-lead P-13 (O-2). Kural olmadan gömülü delik bölümü sessizce çözümsüz bırakır (Bölüm 3); 1–10 betikle doğrulandı, K-34 ihlali yok.
Etkilenen: GDD K-34, K-18, K-33, E-43; LEVELS §0, B3/B4/B6; UX §5.4–5.5; ART §4; JUICE #83, #84; TECH §5.2, §6.4, §9.3, §14.1

### D-005 — GDD kural ve verinin tek kaynağıdır (TECH ↔ GDD farkları)
Durum: KABUL     Sahip: orkestratör     Tarih: 2026-10-05
Karar: TECH_DESIGN GDD'ye uyar. Teslimat kuyruğu: adım 8 yalnız kuyruğa ekler, adım 9 tek deneme noktası (FIFO; `dropColumns` öncelik listesi, E-34). Bot modeli parametreleri yalnız `config/events.json`'dan okunur. Doğrulayıcı hata kodları GDD K-45'e bağlıdır (`Issue.code` + `rule: 'K-45/n'`).
Gerekçe: R-02. Kural ve veri product-lead'in alanı; iki kaynak testlerde sapma üretir.
Etkilenen: GDD K-25, K-26, K-35, K-45; TECH §6.2, §8.3, §11.2

### D-006 — Yarım adım yerçekimi (önce düşme, sonra yükselme)
Durum: KABUL     Sahip: product-lead     Tarih: 2026-10-05
Karar: K-35 adım 6'nın her turu iki yarıdır: (a) balonlar katı sayılarak bütün desteksiz blok/torbalar 1 satır iner; (b) diğer her şey katı sayılarak tutulmayan balonlar 1 satır çıkar; hareket kalmayınca biter.
Gerekçe: R-02; product-lead P-10 (code-lead önerisi). Aynı hücreyi hedefleyen balon + düşen blok için belirlenimci sonuç (E-33).
Etkilenen: GDD K-20, K-35, E-33; OBSTACLES N33, N34; TECH §5.3

### D-007 — Balon tavanı = aktif dilimin plan tepesi; tavan kirişi her bölümde
Durum: KABUL     Sahip: product-lead (kural), design-lead (görsel)     Tarih: 2026-10-05
Karar: Şantiyede balonlu blok aktif dilimin plan tepesine (satır h + e) asılır, sahada y = 7; tavanın üstünden bırakılan balon tavana iner (E-35); kamyonla gelen balon düşüp oturur, yükselmez (E-36). Plan tepesinde her bölümde iskele tavan kirişi çizilir (plan yüksekliğini de gösterir).
Gerekçe: product-lead P-3 (R-02), design-lead P-15 (product-lead ve code-lead kabul). Varış bırakma yüksekliğinden bağımsız; hesap O(1).
Etkilenen: GDD K-20, S8, E-35, E-36; ART §4; JUICE #43; ASSET `board_ceiling_beam`; TECH §4.5, §5.1

### D-008 — Boya Kapısı: girilen kapı boyar, son girilen geçerli (`via`)
Durum: KABUL     Sahip: product-lead     Tarih: 2026-10-05
Karar: Sürüklemede blok bir boya kapısının ray kipine girdiyse (yarım girip geri çıkmak dahil) boyanır; birden çok kapıya girildiyse son girilenin rengi geçerli; sahaya geri dönen blok boyalı kalır. Hamle kaydında `drag.via`.
Gerekçe: product-lead P-6 (R-02), code-lead `via` tanım önerisi. Boyanan blok duvar üstünden yerleştirilebilir, YAO korunur (Bölüm 22 niyeti).
Etkilenen: GDD K-35 adım 1, W6, E-39; OBSTACLES `obs.w6.desc`; UX §13.2 Bölüm 22; TECH §4.2, §6.2, §9.3

### D-009 — Kamyon Yardımı üç ayrı yol (D1 / D2 / D3)
Durum: KABUL     Sahip: product-lead (kural), code-lead (uygulama)     Tarih: 2026-10-05
Karar: D1 hamle yok → zincir ve ıslaklık kalkar, gerekirse yeniden dizme; D2 malzeme açığı → eksik hücre sayısı kadar o renkte `B1` adım 12'de `x = 5`'ten teslim; D3 döşeme → yeniden şekillendirme. Sıra D1 → D2 → D3, sonda tek güvence denetimi (1 hamle → belirlenimci iş bütçeli 2 hamle → D3). code-lead'in "D2'de `B1` yerine döşeyen şekil" alt önerisi RET (product-lead: boya istismarı net negatif).
Gerekçe: code-lead P-12; R-02; tutarlılık denetimi tur 1–2 (E-23, E-42, E-44).
Etkilenen: GDD K-25, K-30, K-39, E-37; JUICE #21a–c; TECH §9.7

### D-010 — Duvar sıfır genişlikli sınırdır (çekirdek 8×10 ızgara)
Durum: KABUL     Sahip: code-lead     Tarih: 2026-10-05
Karar: Çekirdek duvarı x = 5 ile x = 6 arasındaki sıfır genişlikli sınır olarak modeller (sınır satır maskeleri, K-12 tam sığma koşulu); mantıksal 9×10 duvar sütunlu ızgara kaldırıldı. Ekran ölçüleri `layout.*`'tan (D-011). x = 5 ile x = 6 komşu değildir (E-46).
Gerekçe: R-03; code-lead P-1. Kurallar eşdeğer; 60 px görsel duvarla bloklar komşu hücrelere taşmaz.
Etkilenen: GDD §0, K-04/05/07/11/12, E-05/06/07/28/46; OBSTACLES; LEVELS lejant; TECH §2.2, §4

### D-011 — Ölçüler: hücre 120 px, duvar 60 px; tek kaynak `layout.grid.*`
Durum: KABUL     Sahip: design-lead (tokens), code-lead (okuma)     Tarih: 2026-10-05
Karar: `layout.grid.cellPx` 120, `wallW` 60, `yardX` 30, `wallX` 750, `buildX` 810; kod değerleri yalnız tokens'tan okur ve değişmezleri testle denetler.
Gerekçe: R-04. Tek kaynak kuralı (design-lead P-24 bu yüzden geri çekildi, D-050).
Etkilenen: `src/theme/tokens.json`; UX §0.1, §5.1; TECH §2.2, §10.2

### D-012 — Blok paleti yeni hex değerleri ve B = "Gök Mavisi"
Durum: KABUL     Sahip: design-lead     Tarih: 2026-10-05
Karar: Blok paleti renk körlüğü ayrışması için brif hex'lerinden değişti; renk kodları (W…P) aynı. B'nin adı "Gök Mavisi" / Sky Blue. Renk adları yalnız belgelerde, oyuncuya görünen metinde yok. Proje sahibine bilgi olarak sunulur.
Gerekçe: R-05; design-lead P-1, P-9; product-lead kabul (kurallar yalnız kodları kullanır; "Cam Mavisi" S3 cam bayrağıyla karışıyordu).
Etkilenen: ART §2.1; tokens `color.block`; LEVELS, OBSTACLES ad atıfları

### D-013 — Plan hücresi tarifi ve sembol mürekkebi
Durum: KABUL     Sahip: design-lead     Tarih: 2026-10-05
Karar: Plan hücresi = açık altlık #BCCADD + blok rengi %80 (renk körü modunda %90) + kesik kontur + mürekkep; katman sırası ozalit → plan → ızgara kaplaması → inşa cephesi → bloklar. Bileşik renkler `check.*` yalnız kontrol değeridir. Sembol mürekkebi: L* ≥ 60 ise koyu ×0,40, değilse beyaz %85 (B için koyu #14233D).
Gerekçe: R-05; design-lead P-2, P-3. Brifteki %30 opaklık renk körlüğünde ayırt edilmiyordu (ΔE00 ≈ 3,8).
Etkilenen: ART §4; tokens `board.planUnderlay`, `alpha.planFill`, `check.*`; TECH §10.2–10.3

### D-014 — K-18 düşüş gölgesi çift kodlu
Durum: KABUL     Sahip: design-lead     Tarih: 2026-10-05
Karar: Doğru/hatalı gölge yalnız renkle değil çizgi deseni + rozet + nabızla ayrılır; K-34 için ↓ rozeti ve yatay destek taraması; açılmamış `?` hücresine değen gölge nötr ve sessiz; çatlak cam uyarısı bütün zorluklarda; iptal edilecek bırakmada ↩ önizlemesi.
Gerekçe: R-05; design-lead P-7 (genişletilmiş). Renk körü erişimi ve adalet.
Etkilenen: UX §5.4; ART §2.3; JUICE #7; GDD K-18; TECH §5.1

### D-015 — Ekran ölçekleme: FIT mi EXPAND mı
Durum: ÖNERİ     Sahip: design-lead + code-lead     Tarih: 2026-10-05
Karar: Proje sahibi onayı bekliyor. Öneri EXPAND (1920–2400 yükseklik, tahta grubu `expandShare` 0,5 ile büyür). Kod ve belgeler `layout.top/bottom/board/popup` çapa sözleşmesiyle iki kipte de çalışır; seçim tek ayar.
Gerekçe: R-06; code-lead P-7 (O-1) = design-lead P-4. Brif FIT diyor; EXPAND uzun ekranlarda boş bant bırakmaz.
Etkilenen: tokens `meta.scale`, `layout.*`; UX §0.1; TECH §10.1

### D-016 — Kasaba görevleri: STORY'deki 35 görev esastır
Durum: KABUL     Sahip: product-lead     Tarih: 2026-10-05
Karar: 5 hikaye bölümü × 7 görev = 35 görev (her bölüm 10★); ad, sıra ve yıldız maliyetleri META §1 ve `economy.json`'da kesin, STORY aynı değerleri gösterir. Anahtarlar `town.ch{n}.t{m}.name/.scene`.
Gerekçe: R-07 (brif "6–8 görev" aralığında). META'nın 36 görevlik listesi (X-2) ve design-lead'in STORY'yi META'ya göre yeniden yazma önerisi (P-22, D-048) geri çekildi.
Etkilenen: META §1; `config/economy.json`; STORY §5; UX §2.2; ASSET §7

### D-017 — Öğretici metinler: tek anahtar kümesi ve ton
Durum: KABUL     Sahip: design-lead (metin), product-lead (kurala uygunluk)     Tarih: 2026-10-05
Karar: Anahtarlar `tut.l{n}.{konu}`; bağlamsal satır adımda yeniden kullanılabilir (`tut.ctx.{konu}`, GDD §14.1); terim "blok"; oyuncu metninde renk adı yok; değişken sayılar `{n}`. Ekranda görünen metin STORY §6'dadır; OBSTACLES'taki metinler engel bilgi kartıdır (`obs.{id}.desc`).
Gerekçe: R-08. Üç belgede üç anahtar biçimi vardı; renk körü oyuncu "gölge yeşilse" cümlesini kullanamaz.
Etkilenen: STORY §6; LEVELS `tutorial[]`; OBSTACLES; GDD §14.1; TECH §8.2

### D-018 — Ara sahne tetikleyicileri
Durum: KABUL     Sahip: product-lead (kural), design-lead (sunum)     Tarih: 2026-10-05
Karar: Prolog ilk açılışta; `story.ch1.start` 1. görevden (ilk yıldız harcanınca) sonra (brif FTUE sırası); `story.chN.start` (N ≥ 2) önceki bitiş sahnesinden sonra ana ekranın bir sonraki açılışında, N'nin görevleri o sahneye kadar gizli; bitiş sahnesi son görevde; bir eylemde en çok bir sahne.
Gerekçe: R-09; product-lead P-14 (design-lead'in kuralına geçti). Not: design-lead P-21 raporunda "geri çekildi" yazıyor, ancak META §1, `economy.json → town.cutscenes`, STORY §3 ve UX §8'in son metni P-21'in özgün kuralıdır; belgeler tutarlı, ayrı RET kaydı açılmadı.
Etkilenen: META §1; `economy.json → town.cutscenes`; STORY §3; UX §8, §12; TECH §11.3

### D-019 — Hafif yerçekiminde (G-L) yönlendirme
Durum: KABUL     Sahip: design-lead (girdi), product-lead (kural), code-lead (maliyet)     Tarih: 2026-10-05
Karar: Düşüş/yükseliş sürerken tahtaya dokunmak (dokunulan taraf = yön) ya da boş noktadan yatay kaydırmak 1 genişlikli bloğu 1 sütun kaydırır; düşüş başına 1 kez, aynı hamle; geçersiz girdi hakkı harcamaz; blokta başlayıp eşiği aşan dokunuş tutmadır ve pencereyi kapatır (E-40); çıkıntı altına yönlendirme serbest; `atRow` iniş satırını içerebilir; iki aşamalı commit, `steerZone` = `board`.
Gerekçe: R-10; design-lead P-11, code-lead P-16, product-lead P-11. Düşen 120 px'lik bloğa dokunmak motor becerisi istiyordu.
Etkilenen: GDD K-19, E-40, E-47; UX §5.6; JUICE #46; TECH §4.7

### D-020 — Ağır yerçekimi 700 ms + 1400 ms erişilebilirlik seçeneği
Durum: KABUL     Sahip: product-lead     Tarih: 2026-10-05
Karar: K-19 ağır yerçekimi tutma süresi 700 ms kalır; Ayarlar › Erişilebilirlik "Zaman baskısını azalt" açıkken 1400 ms. Bot zorluğu 700 ms ile ölçülür. "Şantiye üstünde indirilemez" alternatifi ve "sayaç hiç olmasın" seçilmedi.
Gerekçe: R-11. "İndirilemez" davranışı G-H'nin dersini siler ve G-H + cam + yüksek duvar bölümlerini YAO ≥ %60 altına iter (product-lead).
Etkilenen: GDD K-19; OBSTACLES G-H; UX §5.7, §11, §14; JUICE #45; STORY `tut.l15.setting`; TECH §4.7

### D-021 — Animasyon sırasında girdi
Durum: KABUL     Sahip: design-lead (kural), code-lead (uygulama)     Tarih: 2026-10-05
Karar: Animasyon sürerken yeni blok tutulabilir; tutma anında tahtayı değiştiren bekleyen animasyonlar son karesine atlar. Girdi yalnız dilim kayması, kamyon teslimatı ve Kamyon Yardımı / karıştırma sırasında kilitlidir (600–900 ms; dokunuş 3× hızlandırır). "Animasyonları azalt" = JUICE solma varyantları (hız değil, daha az hareket); haptik ayrı anahtarda.
Gerekçe: R-12; design-lead P-12, code-lead P-15. Her yerleşim sonrası kilit "yapışkan" his veriyordu.
Etkilenen: JUICE §0 kural 3 ve 8; UX §0.3, §14; TECH §6.3

### D-022 — Bölüm içi kaldığı yerden devam ve `m = 0` cezasız çıkış
Durum: KABUL     Sahip: product-lead (kural), code-lead (uygulama)     Tarih: 2026-10-05
Karar: MVP. Her eylemde ve `pagehide`'da `inLevel` (hamle günlüğü, tohum, teklif durumu, `levelHash`, `rulesVersion`) kaydedilir; uygulamanın kapanması kayıp sayılmaz, bölüm belirlenimci tekrarla kaldığı yerden sürer; kayıp penceresi açıkken kapanırsa aynı teklifle yeniden açılır. Kayıp yalnız onaylı çıkış ya da hamle bitince. İlk hamleden önce (`m = 0`) çıkış cezasızdır: can ve oyun öncesi güçlendiriciler iade, seri bonusu tüketilmez (E-41). Sürüm uyuşmazlığında deneme oynanmamış sayılır ve tam iade edilir (E-45).
Gerekçe: R-13; product-lead P-7, code-lead P-17; entrepreneur ve code-lead yorumları (işletim sistemi uygulamayı öldürür; Köprü'de haksız elenme).
Etkilenen: GDD K-43, E-38, E-41, E-45; META §2, §5, §6.1; UX §1, §5.1, §12; TECH §11.1

### D-023 — Botlar: etiketli "Renkli Tepe çırakları", saf ve belirlenimci simülasyon
Durum: KABUL     Sahip: entrepreneur (sunum ilkesi), product-lead (model), design-lead (görsel), code-lead (uygulama)     Tarih: 2026-10-05
Karar: Köprü ve Lig'deki 99 rakip açıkça etiketli çıraklardır: "Çırak Fındık" / "Apprentice Hazelnut" kalıbı (100 ad çifti), kask + alet avatarı, "çırak" rozeti, kural kartı ve (i) paneli; gerçek kullanıcı adına benzeyen ad, bayrak, "çevrimiçi" işareti yok. `botSim` yalnız config + tohum + zamanı okur; ESLint import yasağı, iki-kayıt eşitlik testi, `seedHash`. Köprü tohumu `eventId`; Lig `(weekId, groupId)`, `groupId = hash32(weekId, installId)`; hash `fmix32-chain-v1`; Lig eğrisi 5 profilli tamsayı `curveTable` (motorlar arası bit-aynı).
Gerekçe: R-14; BUSINESS P-5, design-lead P-14, code-lead P-18, product-lead P-16. Aldatıcı uygulama riski (R-07); ödemeden bağımsızlık kodda kanıtlanır. code-lead'in "hiçbir tohumda kurulum kimliği yok" ve `powFixed` önerileri geri çekildi.
Etkilenen: META §6–§7; `config/events.json`; STORY §7.4; UX §9–§10; BUSINESS §4.6, E8; TECH §2.7, §11.2

### D-024 — Teklif etiği (+5 hamle penceresi ve Sallanan Köprü)
Durum: KABUL     Sahip: entrepreneur (ilke), design-lead (sunum), product-lead (kural)     Tarih: 2026-10-05
Karar: +5 penceresinde üç eşit boy seçenek (altın / reklam / "Hayır, teşekkürler"), hiyerarşi yalnız renkle; ortak `PriceLabel` ile gerçek para karşılığı; "Teklif n/3" ve eskalasyon görünür; baskı metni, kalan oyuncu sayacı, kural satırı yok; teklif penceresinde seri kaybı yazılmaz. Deneme başına en çok 3 uzatma; reklam yalnız 1. teklifin alternatifi ve sınıra sayılır. Köprü +5 fiyatı etkinlik dışıyla aynı; beklenen bitiren payı < ilk +5 fiyatı; Köprü +5 geliri toplam IAP'nin ≤ %25'i izlenir. Oyuncunun başlattığı "+" alımı serbest; kendiliğinden açılan bölüm içi satış yok (E4).
Gerekçe: R-15; BUSINESS P-4, design-lead P-13. Kayıp kaçınma baskısı ve düzenleyici risk (CPC, PEGI, DFA).
Etkilenen: UX §0.3, §7, §9; JUICE #52; STORY §7.3; GDD K-29; META §3, §5, §6; BUSINESS §4.3–4.5

### D-025 — Ekonomi tek değerleri (fiyatlar ve oyun içi altın)
Durum: KABUL     Sahip: entrepreneur (fiyat) + product-lead (altın)     Tarih: 2026-10-05
Karar: +5 hamle 900 / 1.350 / 1.800 altın; Köprü tur başına +5 altın tavanı 4.050 (`bridgeSpendCapCoins`; reklam tavandan bağımsız). Kumbara $1,99 / 89,99 TL, kırma 1.000, tavan 2.000, galibiyet başı 50 / 75 / 100. Altın paketleri 1.000 / 2.750 / 6.000 / 13.000 / 35.000 / 75.000 ($1,99–$99,99); Başlangıç paketi 2.500 + 2 Çekiç + 1 Vinç + 2 Termos, $1,99, tek seferlik, süresiz. Ödüllü reklam: +5 1/deneme ve 3/gün, can 2/gün, günlük ×2 1/gün, toplam 6/gün. Gerçek para karşılığı referans paket `coins_1000`'den. Ödemeyen oyuncu ölçütü: 10 bölümde ≥ 1 kez +5 tabanı; medyan bakiye 11–50'de 400–1.500; kayıp kurtarma karışımı altın %15–25 / reklam %30–40 / kurtarılmayan %40–50; +5 sonrası kazanma oranı %70–85.
Gerekçe: R-16; BUSINESS P-3, P-11; product-lead META §3, §8, §9. Eşikteki kumbara değeri ≥ Avuç paketi; 4.050 tek tam eskalasyondur.
Etkilenen: `config/economy.json`, `config/events.json`; META §3–§9; BUSINESS §4–§5; UX §7, §11; TECH §11.3

### D-026 — Usta Modu (içerik sonu) MVP'de
Durum: ÖNERİ     Sahip: product-lead + entrepreneur     Tarih: 2026-10-05
Karar: Proje sahibi onayı bekliyor. 50. bölümden sonra 11…50 sırayla, sonra yeniden 11; hamle = solver minimumu + 2; yıldız yok; Köprü ve Lig'e sayılır; altın ve lig puanı özgün zorluk etiketinden; her 10 Usta Modu galibiyetinde Usta Sandığı 250 altın + 1 Çekiç. Faz 3 ayar kuralı: 10 galibiyetteki medyan gelir G < 900 ise sandık altını `250 + 50 · ceil((900 − G) / 50)`. "Sonra" kararında yedek: 11–50 özgün bütçeyle tekrar, yalnız kazanma tabanı.
Gerekçe: R-17; product-lead P-8, P-18; BUSINESS P-8. Köprü ve Lig bölüm kazanmaya bağlı; 50 bölüm medyan oyuncuda 7–9 günde biter (tahmin). Maliyet ≈ 1 g, sanat gerektirmez.
Etkilenen: META §8.5, §9; `economy.json → masterMode`; BUSINESS §9.2, §12.1; UX §3, §6; TECH §14.3

### D-027 — Hamle bütçeleri brif tahmininin altında
Durum: ÖNERİ     Sahip: product-lead     Tarih: 2026-10-05
Karar: Proje sahibi onayı bekliyor. Hamle bütçeleri brif tahminlerinin %25–40 altındadır; formül (solver minimumu + tampon, bot ayarı) geçerli kalır ve bölüm süresi bandıyla (1–10: 45–75 s; 11–30: 75–120 s; 31–50: 100–180 s) ölçülür.
Gerekçe: R-18. Bütçe çözüm uzunluğundan türetilir; içerik pisti ve kayıp sıklığı süre bandıyla izlenir.
Etkilenen: LEVELS §0, §1, §4; META; BUSINESS §6.2

### D-028 — Albüm "Sonra"; kasaba görevi sahnesi MVP-lite
Durum: KABUL     Sahip: entrepreneur (kapsam), design-lead (sunum)     Tarih: 2026-10-05
Karar: Albüm alt navigasyonda Takım gibi kilitli "Yakında" sekmesidir; "Albüme eklendi" kartı ve albüm kartı varlıkları Sonra. Görev tamamlanınca sahne = yapı belirme animasyonu + tek satırlık balon; diyaloglu görev sahnesi Sonra.
Gerekçe: R-19; design-lead P-29. Ayrı ekran, veri ve kayıt alanı maliyeti.
Etkilenen: UX §3, §8, §12; STORY §4.1, §5; JUICE #75; ASSET §7, §10; BUSINESS §12.1; TECH §11.1

### D-029 — Debug paneli yalnız geliştirme derlemesinde
Durum: KABUL     Sahip: code-lead     Tarih: 2026-10-05
Karar: Panel yalnız `import.meta.env.DEV`'de; üretimde `?debug=1` etkisiz; staging için panelsiz `harness` modu; `build:verify` `dist/`'te debug/harness parçası olmadığını denetler.
Gerekçe: R-20; code-lead P-20. Üretimde sınırsız hamle ve bölüm seçimi monetizasyonu ve etkinlik bütünlüğünü bozar.
Etkilenen: TECH §1.2, §12.2–12.3

### D-030 — Bölüm 4 geçidi boy 2; mekanikler veri imzasından türetilir
Durum: KABUL     Sahip: product-lead (+ code-lead doğrulayıcı)     Tarih: 2026-10-05
Karar: Bölüm 4 geçidi boy 2'dir (brif boy 1); W3 Dar Geçit (`size = 1`) ilk kez Bölüm 9'da öğretilir. OBSTACLES her mekanik için veri imzası verir (27 satır); doğrulayıcı mekanik kümesini yalnız imzalardan türetir, K-45/9 istisnasızdır. Proje sahibine bilgi olarak sunulur.
Gerekçe: R-21 (seçim product-lead'e bırakıldı); product-lead P-9, code-lead P-19 (A seçeneği geri çekildi). Bölüm 4 öğretimi korunur, istisna gerekmez.
Etkilenen: LEVELS B4, B9; OBSTACLES veri imzası; GDD K-45; TECH §8.3

### D-031 — Yapı panoraması dokunuşu oyun durumunu değiştirmez
Durum: KABUL     Sahip: product-lead (kural), design-lead (sunum)     Tarih: 2026-10-05
Karar: K-06: "Panorama oyun durumunu değiştirmez; dokunuş yalnız büyük önizleme açar." Testte durum bit bit aynı kalır.
Gerekçe: R-22. `mirrorOf` / `repeat` bölümlerinde önceki dilim okunmalı.
Etkilenen: GDD K-06; UX §5.1; TECH §12.4

### D-032 — Yaş ekranı, servis arayüzleri ve referans düşük cihaz kapısı
Durum: KABUL     Sahip: entrepreneur + code-lead + design-lead     Tarih: 2026-10-05
Karar: Yaş ekranı yalnız mağaza sürümünde: Bölüm 3 kazanma → nötr tam sayfa (boş 4 hane doğum yılı + sayısal tuş takımı, varsayılan yok) → CMP → ana ekran. Ülkeden bağımsız tek kural: < 13 çocuk muamelesi, 13–17 kişiselleştirilmemiş reklam, 18+ onaya göre; yalnız yaş kovası ve onay sürümü saklanır. `ConsentService`, `AdsService`, `IapService` MVP'de sahte; sağlayıcılar onaydan sonra dinamik import. Referans düşük seviye Android (≤ 3 GB, Android 10–12) Faz 2 çıkış kapısıdır: ≥ 30 FPS, girdi ≤ 2 kare; eşik altında otomatik "azaltılmış efekt" profili.
Gerekçe: R-23; BUSINESS P-10, code-lead P-21, P-22, design-lead P-20. Karma kitle riski (R-01) ve düşük cihaz performans riski (R-09). Cihaz alımı ayrı kayıtta (D-062).
Etkilenen: UX §2.3, §12; BUSINESS S12; ANALYTICS; TECH §10.7, §11.8, §14.1

### D-033 — EN adlandırma ve oyun içi firma adı
Durum: KABUL     Sahip: entrepreneur + design-lead     Tarih: 2026-10-05
Karar: Kepçe EN'de "Kepche"; "Little Builder" mağaza adında ve EN metinde kullanılmaz; oyun içi firma adı `{company}` (EN "Tuna & Co.", TR hikayede "Minik Usta İnşaat"). BUSINESS §2 benzerlik kuralları (Festival Şatosu, ozalit, Bob the Builder) sanat yönüne girer.
Gerekçe: R-24; BUSINESS P-6, design-lead önerisi. Tescilli ad ve karakter çakışması (R-02, R-03).
Etkilenen: STORY §0; NAMING §5.2; ART §11.8; ASSET `logo_wordmark`; i18n

### D-034 — Rüzgârda d = 0 ise kayma yok; harç yalnız plan alanında yapışır
Durum: KABUL     Sahip: product-lead     Tarih: 2026-10-05
Karar: W8: bırakma anında düşüş mesafesi d = 0 ise rüzgâr kayması olmaz; balonda d = |bırakma satırı − tavan satırı|. Y8: harçlı blok yalnız bütün hücreleri plan alanındayken yapışır, değilse normal geri seker.
Gerekçe: product-lead P-2a, P-2b. Oturmuş bloğun kayması ve asansörde tahtadan taşma önlenir (E-08).
Etkilenen: GDD W8, Y8, E-08; TECH §5.1–5.2, §7.2

### D-035 — Yapı tamamken şantiyeye bırakma iptaldir (E-27)
Durum: KABUL     Sahip: product-lead     Tarih: 2026-10-05
Karar: Bütün dilimler tamamken (eksik hedef `clear` ise) şantiyeye bırakma iptal sayılır, 0 hamle; ekranda "Yapı tamam!" kurdelesi ve eksik hedef nabzı.
Gerekçe: product-lead P-12, design-lead P-27. Oyuncu farkında olmadan hamle yakmasın.
Etkilenen: GDD K-07 satır 5, E-27; UX; TECH §4.3 (`siteClosed`)

### D-036 — Saklı nesnelerin konumu her zaman görünür
Durum: KABUL     Sahip: product-lead (kural), design-lead (görsel)     Tarih: 2026-10-05
Karar: Vida ve anahtar "örtülü ama konumu belli"dir: her zorlukta örten hücrede ışıltı + soluk simge.
Gerekçe: product-lead P-13, design-lead P-16. Adalet ilkesi: kazı planı tahmine dönmesin.
Etkilenen: GDD K-42; OBSTACLES W7, Y7; ART §6; ASSET `obs_glint`

### D-037 — Bölüm 1'in ilk hedefi duvarın yanında
Durum: KABUL     Sahip: product-lead     Tarih: 2026-10-05
Karar: Bölüm 1'in ilk öğretici hedefi `a` (4,7)'ye taşındı (başparmağa yakın, kısa ilk hamle); betikle 3 hamle / YAO %100 doğrulandı.
Gerekçe: product-lead P-15, design-lead P-25 (a).
Etkilenen: LEVELS B1; UX §13.2

### D-038 — Ömürde ilk +5 teklifi ücretsiz
Durum: KABUL     Sahip: product-lead (kural) + entrepreneur (öneri)     Tarih: 2026-10-05
Karar: MVP. Oyuncunun ilk "Hamleler bitti" penceresinde +5 bir kez ücretsizdir ("Usta Dede'den hediye"); deneme başına 3 uzatma sınırında 1. teklif sayılır; o teklifte reklam seçeneği yok (`firstEverOfferFree`).
Gerekçe: product-lead P-17, BUSINESS P-12. Başlangıç cüzdanı (500) < 900; ilk ekonomi teması satın alma hunisi olmasın.
Etkilenen: GDD K-29; META §3; `economy.json → outOfMoves`; UX §7 (`lose.offer.gift`); TECH §11.3

### D-039 — Bölüm 1–2 duvarını yükseltme önerisi
Durum: RET     Sahip: product-lead     Tarih: 2026-10-05
Karar: Brifteki Bölüm 1 "Duvar 2" korunur; duvar en üst dolu satırın üstüne çıkarılmaz. Proje sahibi sorusu geri çekildi; bilgi olarak sunulur.
Gerekçe: design-lead P-25 (b) ve product-lead X-1, product-lead'in LEVELS §4/7 ölçümüyle reddedildi: Bölüm 1'in 2. hamlesi 2 satır, 3. hamlesi 1 satır kaldırma gerektirir; Bölüm 2'nin ilk hamlesi 2 satır. "Yukarı" hareket ilk oturumun 2. hamlesinde hissedilir.
Etkilenen: LEVELS B1, B2, §4/7

### D-040 — Eski değerlerin geri çekilmesi
Durum: RET     Sahip: product-lead     Tarih: 2026-10-05
Karar: Şu ilk değerler geçersizdir: META'nın 36 görevlik listesi; kumbara 20/30/40 · 1.500 · 3.000; "10 bölümde 2 kez +5 alamaz" üst sınırı; K-43 "uygulama kapanması = çıkış"; K-07 0,3 hücre eşiği; K-19 ms/satır değerleri.
Gerekçe: product-lead X-2. Yerine D-016 (R-07), D-025 (R-16), D-022 (R-13), D-041 (token eşiği) ve `tokens.physics` geldi.
Etkilenen: META, GDD K-07, K-19, K-43; `economy.json`

### D-041 — Dokunma/sürükleme eşiği tokens'tan
Durum: KABUL     Sahip: design-lead (değer), product-lead (kural metni)     Tarih: 2026-10-05
Karar: K-07 sayı içermez; dokunma ile sürükleme ayrımı `tokens.drag.startThresholdPx` (8 px) ve `holdMs` (100 ms) ile yapılır; eşik altında bırakma = dokunma. Test token değerini okur.
Gerekçe: design-lead P-26; code-lead yorumu. 0,3 hücre (36 px) "yapışkan" his verir ve tek kare şartıyla çelişir.
Etkilenen: GDD K-07; UX §5.3; tokens `drag.*`; TECH §4.3

### D-042 — Sol el modu "Sonra"
Durum: KABUL     Sahip: entrepreneur (kapsam), design-lead (tasarım)     Tarih: 2026-10-05
Karar: Sol el modu (Tuna köşesi ve güçlendirici çubuğu yer değiştirir, tahta aynalanmaz) MVP'de yoktur; tarif UX'te [Sonra] etiketiyle kalır.
Gerekçe: design-lead P-6; entrepreneur kapsam etiketi (brif dışı özellik).
Etkilenen: UX kapsam etiketleri; BUSINESS §12.1

### D-043 — Uygulama simgesi, mağaza görseli ve insan sanatçı kuralı
Durum: KABUL     Sahip: design-lead + entrepreneur     Tarih: 2026-10-05
Karar: Simge imza hareketi gösterir (ikaz şeritli duvar başlığı + kancadaki blok + kesik yay); karakter, yüz, kask, harf, küp yığını yok; A/B yalnız 18+ hedeflemeyle. Öne çıkan görsel: sol yarı kaldır–aşır–indir anı, sağ yarı yetişkin dünyası yapısı (fener/fırın), Tuna küçük. Ana karakterler, logo ve simge insan sanatçı işidir; araçlar yalnız keşif/eskiz; her final varlık için üretim kaydı; istemlerde marka/karakter adı yok.
Gerekçe: design-lead P-17; BUSINESS S5, S8; çocuk sinyali (R-01), telif koruması (insan yazarlığı şartı).
Etkilenen: ASSET §0, §11, §15; BUSINESS §3; STORE_LISTING §6

### D-044 — Tuna'nın yaşı oyun içinde ve mağazada geçmez
Durum: KABUL     Sahip: entrepreneur + design-lead     Tarih: 2026-10-05
Karar: Tuna'nın yaşı oyun içi metinde, mağaza materyallerinde ve kreatiflerde yazılmaz (S15); brifteki "8" yalnız iç belge bilgisidir. Yaşı vurgulayan STORY satırları değişti.
Gerekçe: design-lead P-19 (S15 kısmı), BUSINESS S15. Çocuğa yönelik sayılma riski (R-01).
Etkilenen: BUSINESS §3; STORY; STORE_LISTING

### D-045 — Tuna'nın görsel yaşı
Durum: ÖNERİ     Sahip: design-lead     Tarih: 2026-10-05
Karar: Proje sahibi onayı bekliyor. Seçenekler: brifteki 8 yaş görünümü ya da 10–12 yaş görünümü. design-lead 10–12'yi önerir; entrepreneur için isteğe bağlı (S1–S15 her durumda uygulanır).
Gerekçe: design-lead P-19. Brifteki karakter tanımını değiştirdiği için proje sahibinin kararı.
Etkilenen: ART §11; ASSET §8; STORY

### D-046 — Font Baloo 2, sabit genişlikli hane yuvaları
Durum: KABUL     Sahip: design-lead (seçim), code-lead (yükleme)     Tarih: 2026-10-05
Karar: Baloo 2 (OFL 1.1, değişken 400–800, `baloo2-latin-tr.woff2` ≈ 38 KB alt küme); preload + `font-display: block`; Boot fontu bekler. Canvas'ta `tnum` olmadığından değişen sayılar en geniş haneye göre sabit yuvalarda ortalanır. Lisans Ayarlar › Lisanslar'da.
Gerekçe: design-lead P-28; code-lead TECH §10.2. Fredoka'da ğ, ş, İ yok.
Etkilenen: ART §8; ASSET `font_baloo2_latin_tr`; TECH §10.2

### D-047 — Sanat kapsamı ve öncelikleri
Durum: KABUL     Sahip: design-lead + entrepreneur     Tarih: 2026-10-05
Karar: İfade seti: ana 4 karakter × 6, yan 4 karakter × 3 (mutlu, şaşkın, üzgün), kalanı Sonra. Varlıklar P0 (Aşama 1 öncesi: simge, logo, 4 ana karakter, Hikaye 1–2), P1 (Hikaye 3–5), P2 (albüm, figüranlar) önceliğinde; iş yükü ≈ 126 sanatçı-günü (P0 ≈ 67), 1,5 FTE ile ≈ 17 hafta.
Gerekçe: design-lead P-30; entrepreneur maliyet yorumu. Kritik yol ara sahne panelleri; takvime tamponsuz sığıyordu.
Etkilenen: ART §11.6; ASSET §8, §14

### D-048 — STORY görevlerini META'nın 36 görevine göre yeniden yazma
Durum: RET     Sahip: design-lead     Tarih: 2026-10-05
Karar: Uygulanmaz; STORY §5'in 35 görevi esastır.
Gerekçe: design-lead P-22, R-07 ile geri çekildi (D-016).
Etkilenen: STORY §5

### D-049 — Ağır yerçekimi alternatifi: "şantiye üstünde indirilemez"
Durum: RET     Sahip: product-lead     Tarih: 2026-10-05
Karar: Uygulanmaz; D-020 geçerlidir.
Gerekçe: design-lead P-23 ve design-lead.md yorumu; R-11 ile geri çekildi; product-lead gerekçesi: G-H dersini siler, cam + yüksek duvar bölümlerini bozar.
Etkilenen: GDD K-19; UX §5.7

### D-050 — Token `layout.wallWidthCells`
Durum: RET     Sahip: design-lead     Tarih: 2026-10-05
Karar: Eklenmez; duvar ölçüsünün tek kaynağı `layout.grid.wallW` (60).
Gerekçe: design-lead P-24, code-lead'in tek kaynak kuralıyla geri çekildi (D-011).
Etkilenen: tokens `layout.*`

### D-051 — Şekil döndürme ve ağırlık kuralı
Durum: KABUL     Sahip: code-lead (+ product-lead GDD K-44)     Tarih: 2026-10-05
Karar: Yönelimler 0° tanımından saat yönünde 90° adımlarla üretilir ve sol alt köşeye normalize edilir; ağır = genişlik ≥ 3 ya da I5/Q9; dikey I5 bölüm verisinde yasak.
Gerekçe: code-lead P-2; GDD K-44'te kabul edildi.
Etkilenen: GDD K-44; TECH §3

### D-052 — Tek durum tamponu ve Zobrist karması
Durum: KABUL     Sahip: code-lead     Tarih: 2026-10-05
Karar: Bölüm durumu tek `Int32Array` tampon + kopyalama; 64 bit Zobrist karması isteğe bağlı hesaplanır. Alanlar: `filled`, `arrivedTurn`, `openShutterUntil` (`wrongOcc` türetilmiş, karmaya girmez).
Gerekçe: code-lead P-3. Solver/bot performansı, Geri Al ve belirlenimci devam.
Etkilenen: TECH §2

### D-053 — Şema kütüphanesi zod 4.6.5 (`zod/mini`)
Durum: KABUL     Sahip: code-lead     Tarih: 2026-10-05
Karar: Oyun ve araçlar tek şemayı paylaşır; `zod@4.6.5`, `zod/mini` (≈ 9,95 KB gzip).
Gerekçe: code-lead P-4; D-002'deki yığına ek.
Etkilenen: package.json (Faz 2 #1); TECH §8.2

### D-054 — Araçlar Node'un yerleşik TypeScript desteğiyle çalışır
Durum: KABUL     Sahip: code-lead     Tarih: 2026-10-05
Karar: `node tools/x.ts`, `.ts` uzantılı importlar, `erasableSyntaxOnly`; `tsx` bağımlılığı yok.
Gerekçe: code-lead P-5. Bağımlılık azaltma.
Etkilenen: `tsconfig.tools.json`; TECH §1

### D-055 — Bölüm şeması iyileştirmeleri
Durum: KABUL     Sahip: code-lead (şema) + product-lead (veri)     Tarih: 2026-10-05
Karar: `schemaVersion`; geçit tipleri ayrık birleşim; `build.elevator { range, start, dir }` ayrı alan; `debris[].segment`; kayar kapı `dir`; `drag.via`; GDD değer aralıkları (dilim 1–5, `carouselEvery` 2–6, `wetMoves` 1–5 …); genişletilmiş `tutorial[]` (`mode`, `highlight`, `hand`, `done`); `seed` isteğe bağlı, varsayılan `id × 1000 + id`.
Gerekçe: code-lead P-6; product-lead P-4, P-5.
Etkilenen: GDD §14, K-45; LEVELS; TECH §8.2

### D-056 — Sürükleme sırasında saha donuktur
Durum: KABUL     Sahip: code-lead (+ product-lead GDD K-08)     Tarih: 2026-10-05
Karar: Sürükleme sürerken yerçekimi ve komşu etkileri işlemez; hamle sonunda (K-35) çözülür.
Gerekçe: code-lead P-8; GDD K-08'de kabul edildi. Belirlenimcilik ve geri sekmenin başlangıç hücresine dönebilmesi.
Etkilenen: GDD K-08, K-17; TECH §4

### D-057 — Ses: gömülü ZzFX, parametreler tokens'ta
Durum: KABUL     Sahip: code-lead (motor), design-lead (parametreler)     Tarih: 2026-10-05
Karar: npm bağımlılığı yok; yalnız ZzFX `buildSamples` gömülür. Efekt parametreleri `tokens.json → audio.sfx.<ad>`; çok notalı sesler `audio.seq.<ad>: [startMs, params][]` tek arabellekte toplanır. 22,05 kHz mono, sahne bazında dilimli ön-çizim; kilitli bağlamda istek atılır.
Gerekçe: code-lead P-9, design-lead P-18 (`audio.seq` biçimi code-lead tarafından TECH §11.6'da onaylandı). Parametre sahipliği D-003 ile tutarlı.
Etkilenen: tokens `audio.*`; JUICE kural 6; TECH §11.6

### D-058 — Playwright önceden kurulu Chromium ile
Durum: KABUL     Sahip: code-lead     Tarih: 2026-10-05
Karar: `executablePath: /opt/pw-browsers/chromium`; `playwright install` çalıştırılmaz.
Gerekçe: code-lead P-10; ortam kısıtı.
Etkilenen: Playwright yapılandırması; CLAUDE.md

### D-059 — Solver yalnız Faz 3'te
Durum: KABUL     Sahip: code-lead     Tarih: 2026-10-05
Karar: Faz 2'de solver yazılmaz; LEVELS 1–5 el çözümleri golden test olur. Faz 3'te katmanlı A* + transpozisyon tablosu + budama (K-34, `via`, G-L) + beam yedeği tek seferde yazılır.
Gerekçe: code-lead P-11; entrepreneur önerisi (çift iş riski); −0,5 g. Faz 2 basit solver planı geri çekildi.
Etkilenen: TECH §9, §14.1–14.2; LEVELS §0

### D-060 — Bölüm başında prosedürel blok pişirme
Durum: KABUL     Sahip: code-lead (+ design-lead tarif)     Tarih: 2026-10-05
Karar: Bölümde geçen her (şekil × renk × bayrak) için Canvas2D `Path2D` ile bir doku + siluet dokusu bölüm başında pişirilir; hücre karosu yalnız plan hücreleri için; renk körü modunda yeniden pişirme. Oyun sırasında Filter/maske yok.
Gerekçe: code-lead P-14; R-05. Phaser 4'te RenderTexture/GenerateTexture yolu uygun değil; iç köşe ve parça düzeyi parlama 4-komşu maskeyle çizilemez.
Etkilenen: ART §3; ASSET §2; TECH §10.2

### D-061 — Faz 2 takvimi ≈ 6 hafta
Durum: ÖNERİ     Sahip: code-lead (+ entrepreneur takvim)     Tarih: 2026-10-05
Karar: Proje sahibi onayı bekliyor. Faz 2 = 26,25 g net / 29,5 g tamponlu (≈ 6 hf; brif planı 4 hf; tampon ≈ %12, TECH §14'ün %20 hedefinin altında); Faz 2–5 toplamı 93,5 g net / 110 g tamponlu ≈ 22,0 hf (29,5 + 39 + 23,5 + 18), BUSINESS §10'un 22 haftasına payı kalmadan sığar. Alternatif: TECH §14.1 kesme seçeneği (giriş sahnesi, ek ekran profilleri/CVD, analytics genişlemesi Faz 4'e; 28,5 g tamponlu ≈ 5,7 hf). K-34, K-35, K-43 kesilemez. (2026-10-06: son tutarlılık ve senkron turlarından sonra güncellendi.)
Gerekçe: code-lead O-3; entrepreneur'ün %20 tampon isteği; K-34/K-35/devam/çapa işleri.
Etkilenen: TECH §14; BUSINESS §10

### D-062 — Test cihazları ve macOS derleme ortamı
Durum: ÖNERİ     Sahip: code-lead + entrepreneur (bütçe)     Tarih: 2026-10-05
Karar: Proje sahibi onayı bekliyor. Faz 2 başında 1 düşük seviye (≤ 3 GB RAM, Android 10–12) ve 1 orta seviye Android test telefonu alınır (BUSINESS §10 bütçesinde ayrıca 1 düşük Android ve 1 eski iPhone); Faz 5 iOS için fiziksel Mac ya da bulut macOS CI (≈ $1.000, fiyat doğrulanmadı).
Gerekçe: code-lead P-22 (O-4); D-032 çıkış kapısı gerçek cihaz ister; Capacitor iOS derlemesi macOS gerektirir.
Etkilenen: TECH §10.7, §13, §14.1; BUSINESS §10

### D-063 — Hedef kitle: yetişkin casual oyuncu
Durum: ÖNERİ     Sahip: entrepreneur     Tarih: 2026-10-05
Karar: Proje sahibi onayı bekliyor. Birincil kitle 25–54 yaş yetişkin casual bulmaca oyuncusu (çekirdek 35–54); oyun çocuğa yönelik değildir; BUSINESS §3'teki 15 koruma şartı (S1–S15) zorunlu; Play hedef yaşı 18+, Kids/Aile kategorisi yok.
Gerekçe: BUSINESS P-1; brif §15 varsayım 8'in teyidi. Çocuk kahraman COPPA/Play faktörlerini tetikler (R-01).
Etkilenen: ART, STORY, UX (yaş ekranı), STORE_LISTING, TECH (SDK başlatma sırası)

### D-064 — Monetizasyon modeli
Durum: KABUL     Sahip: entrepreneur     Tarih: 2026-10-05
Karar: IAP çekirdek + isteğe bağlı ödüllü reklam (3 yerleşim, ≤ 6/gün); geçiş ve banner reklam yok; ücretli rastgele öğe yok, sandık içeriği sabit ve önceden görünür, sandık satılmaz; tek para birimi altın; zamanlı satın alma teklifi MVP ve Aşama 1'de yok; günlük ödül kaçırılınca sıfırlanmaz.
Gerekçe: BUSINESS P-2 (R-15). Loot box ve karanlık örüntü düzenlemeleri; bulmaca türünde IAP ağırlığı.
Etkilenen: META; `economy.json`; UX; TECH §11

### D-065 — MVP kesme çizgisi ve B planı
Durum: ÖNERİ     Sahip: entrepreneur     Tarih: 2026-10-05
Karar: Proje sahibi onayı bekliyor. BUSINESS §12.1 tablosu MVP sınırıdır (eklenenler: bölüm içi devam, `m = 0` cezasız çıkış, sahte servis arayüzleri, 1400 ms seçeneği, ilk +5 hediyesi; Usta Modu D-026'ya bağlı). Faz 3 iki haftadan fazla kayarsa B planı: önce S6 Asansör, gerekirse S5 Döner Platform kesilir (en çok 7 bölüm: 31, 34, 37, 39, 40, 48, 49; bölüm sayısı 50 kalır); G-L ayrı yedeği "yalnız yavaş düşüş" (23, 49). Soru: B planı tetiklenince proje sahibine yeniden sorulmadan uygulansın mı?
Gerekçe: BUSINESS P-7; code-lead §14.2 maliyetleri (S5 + S6 ≈ 2,5 g, G-L ≈ 1 g).
Etkilenen: BUSINESS §12; LEVELS §3; TECH §14.2

### D-066 — Soft launch planı ve karar kapıları
Durum: ÖNERİ     Sahip: entrepreneur     Tarih: 2026-10-05
Karar: Proje sahibi onayı bekliyor. Aşama 0 web kapalı test (TR) → mağaza sürümü paketi (+1 hf) → Aşama 1 Android TR + Filipinler → Aşama 2 iOS + Android Kanada/Avustralya/Yeni Zelanda → Kapı 3 global (≥ 150 bölüm). Eşikler BUSINESS §8'de, test başlamadan sabitlenir. Takvim ≈ 43 hf; bütçe ≈ $277 bin (yalın senaryo ≈ $180 bin, tahmin).
Gerekçe: BUSINESS P-9; takvim ve bütçe proje sahibini bağlar.
Etkilenen: BUSINESS §8, §10; ANALYTICS; TECH §13

### D-067 — Paket kimliği ve kısa ad kuralı
Durum: KABUL     Sahip: entrepreneur + code-lead     Tarih: 2026-10-05
Karar: iOS bundle ID ve Android `applicationId` isim kararından sonra, ilk mağaza yüklemesinden önce kesinleşir; yalnız `[a-z0-9.]`, "kids/little/minik" içermez (`com.<şirket>.<ad>`); her dil için ≤ 12 karakter kısa ad; kod içi kimlikler (`minikusta.save`) kod adı olarak kalır.
Gerekçe: BUSINESS P-13; code-lead TECH §13'te kabul. Kimlik yayından sonra değişmez.
Etkilenen: NAMING §6.1; TECH §13; i18n `app.title`

### D-068 — Oyun adı (mağaza markası)
Durum: ÖNERİ     Sahip: entrepreneur     Tarih: 2026-10-05
Karar: Proje sahibi onayı bekliyor. Aday sırası: 1 Lift & Land / Kaldır Kondur, 2 Hue Hill / Renktepe, 3 Hoppa Usta / Hoppa Builders (TR kullanıcı testi şartıyla). Öneri: tek global EN marka + TR mağazada Türkçe alt başlık. "Minik Usta" çalışma/kod adı olarak kalır. Paket kimliği için tüzel kişilik adı Faz 5'ten önce gerekir.
Gerekçe: NAMING §5–§6; entrepreneur kapanış soruları 3. "Little Builder" çakışması (R-03); "Minik" öneki çocuk sinyali.
Etkilenen: NAMING; ASSET `logo_wordmark`; STORE_LISTING; TECH §13
