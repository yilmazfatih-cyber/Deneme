# entrepreneur — çapraz inceleme, tur 1 (bölüm 2)

Tarih: 2026-10-04 · İnceleyen: entrepreneur · Kapsam: `docs/META.md`, `config/economy.json`, `config/events.json`,
`docs/LEVELS.md`, `docs/GDD.md` (güçlendiriciler, K-29, K-40, K-43, öneri P-7, P-8). Bakış: gelir ve elde tutma, etik
(BUSINESS P-2…P-5, E1–E10), kapsam (MVP / Sonra). "Tahmin" ve "hesap" etiketleri BUSINESS §0'daki anlamdadır.

Özet: Engel 0 · Önemli 9 · Öneri 5

Genel not: META ve iki JSON, fiyatlarda (900 / 1.350 / 1.800, deneme başına 3), E6 (Termos 150 < +5 180 altın/hamle),
E8 (bot modeli ödeme geçmişini okumuyor), E10 (günlük ödül sıfırlanmıyor) ve E1'de (lig sandığı sabit içerik)
BUSINESS ile hizalı. Bot kazanma hedeflerinin seri kademe 0 ile ölçülmesi, seriyi zorluk ayarının parçası olmaktan
çıkarıyor. Bu, kayıp kaçınma baskısını azaltan doğru bir karar.

---

## product-lead — META.md, economy.json, events.json

- [entrepreneur → product-lead] META §8.5 / GDD öneri P-8, Usta Modu: **katılıyorum ve MVP'ye alınmasını öneriyorum.** BUSINESS §9.2'de "Sonra-1" demiştim. Ancak META §6.1 ve §7.1'e göre Köprü ve Lig ilerlemesi bölüm kazanmaya bağlı. Usta Modu olmazsa 50. bölümden sonra oynanacak bölüm kalmıyor ve iki etkinlik de durur. LEVELS'taki kısa bölümlerle bu noktaya birkaç günde gelinir (aşağıdaki LEVELS maddesi). Usta Modu sanat gerektirmiyor ve bölüm verisinden türetiliyor; MVP maliyeti düşük.
  Önem: Önemli
  Düzeltme: Usta Modu = MVP. Product-lead'in parametreleri kalsın: bölüm 11–50, hamle = solver min + 2 (benim +1 önerimi geri çekiyorum; +2 daha az kayıp ve daha az +5 baskısı demek), yıldız yok, "Yeni bölümler yolda" bandı kalır. Üç ek koşul:
  - (a) Altın ödülü ve lig puanı bölümün **özgün** zorluk etiketinden hesaplansın. Usta Modu'nda Zor ve Çok Zor'a kayan etiketler altın enflasyonu ve lig puanı enflasyonu yaratmasın.
  - (b) Bölüm sandığı yerine her 10 Usta Modu galibiyetinde sabit içerikli küçük bir "Usta Sandığı" verilsin (öneri: 250 altın + 1 güçlendirici). Bu, aşağıdaki "ödemeyen oyuncu" maddesindeki gelir tabanını korur.
  - (c) Giriş kartında tek satır: "Usta Modu: bildiğin bölümler, daha az hamle."

  Ben BUSINESS §9 ve §12'yi bu yönde güncelleyeceğim.

- [entrepreneur → product-lead] META §8.3 / economy.json `piggyBank`, kumbara MVP içeriğinde açılamıyor ve değeri zayıf: Kumbara 20. bölümde açılıyor, galibiyet başına 20 altın topluyor, kırma eşiği 1.500. Bu eşik ≈ 75 galibiyet eder (META §9 hesabı); oysa 20–50 arası en fazla 30 galibiyet var. Sonuç olarak kumbara MVP ve soft launch Aşama 1'de satın alınabilir hale gelmiyor ve ölçülemiyor. Değer açısından: eşikte 1.500 altın / $2,99 = 502 altın/$; bu, Avuç paketiyle (503 altın/$) aynı. Kumbara mağazadan daha iyi bir teklif olmazsa anlamsız; dolu haliyle (3.000) ancak 2 kat değer veriyor.
  Önem: Önemli
  Düzeltme: Benim tarafım (fiyat): kırma fiyatı **$1,99 / 89,99 TL**. Product-lead'e öneri (denge):
  - kırma eşiği 1.000 altın (Avuç paketine eşit değer);
  - kapasite 2.000 (≈ 2 kat değer, tavan);
  - galibiyet başına 50 (Kolay/Normal) · 75 (Zor) · 100 (Çok Zor).

  Böylece eşiğe 20. bölümden ≈ 20 galibiyette, yani ≈ 40. bölümde ulaşılır; dolu hale Usta Modu'nda gelir. Kural: kırma eşiğindeki altın/$ hiçbir zaman Avuç paketinin altına düşmesin; bu kural `economy.json` doğrulamasına yazılsın. Kumbara altını kırılmadan harcanamadığı için ekonomiye kaynak eklemez.

- [entrepreneur → product-lead] economy.json, "entrepreneur_tbd" alanlarının değerleri: Uygulamayı bekletmemek için benim kararlarım (BUSINESS §4.3, §5):
  - `lives.rewardedAdLifePerDay`: 2
  - `outOfMoves.rewardedAdOffer`: `{ "extraMoves": 5, "perAttempt": 1, "perDay": 3 }`
  - `dailyReward.rewardedAdDoublesCoins`: `{ "perDay": 1 }`
  - `piggyBank.breakPrice`: `{ "sku": "piggy_break", "usd": 1.99, "try": 89.99 }`
  - `shop.coinPacks`:
    - `coins_1000` 1.000 / 1,99 / 89,99
    - `coins_2750` 2.750 / 4,99 / 219,99
    - `coins_6000` 6.000 / 9,99 / 449,99
    - `coins_13000` 13.000 / 19,99 / 899,99
    - `coins_35000` 35.000 / 49,99 / 2.249,99
    - `coins_75000` 75.000 / 99,99 / 4.499,99
  - `shop.starterPack`: `{ "sku": "starter", "coins": 2500, "boosters": { "hammer": 2, "crane": 1, "thermos": 2 }, "usd": 1.99, "try": 89.99, "oneTime": true, "timeLimited": false }`

  Yeni alanlar:
  - `priceDisplay`: `{ "referenceSku": "coins_1000" }` (E2 gerçek para karşılığı bu paketin birim fiyatından hesaplanır)
  - `ads.dailyCapTotal`: 6

  Mağaza sürümünde fiyat metni mağazadan gelir; JSON'daki USD/TRY değerleri yalnız MVP sahte mağaza ve gösterim içindir.
  Önem: Önemli
  Düzeltme: Değerler `economy.json`'a girsin. Altın miktarları senin dengen; paket altın miktarlarında itirazın varsa DECISIONS'a birlikte yazalım.

- [entrepreneur → product-lead] META §6.1 / events.json `wobblyBridge`, tur başına +5 harcama tavanı eksik: P-4 madde 6'da Köprü turu başına +5'e harcanabilecek altın tavanı 5.400 (iki tam eskalasyon). META ve JSON'da bu tavan yok; yalnız "deneme başına 3 teklif" var. Teorik olarak bir oyuncu bir turda 7 bölümde 7 × 4.050 = 28.350 altın harcayabilir.
  Önem: Önemli
  Düzeltme: `events.json` → `wobblyBridge.maxContinueCoinsPerRun: 5400` eklensin. META §6.1'e satır: "Tavana ulaşılınca +5 teklifi yerine 'Bir sonraki köprüde görüşürüz' gösterilir; ödüllü reklam alternatifi (deneme başına 1, günde 3) tavandan bağımsızdır." Test adı önerisi: "Köprü +5 tavanı 5.400".

- [entrepreneur → product-lead] META §7 Usta Ligi, bot etiketi yok: Köprü'de "Renkli Tepe çırakları, açıkça bot etiketli" yazıyor (§6.1), Lig'de böyle bir ifade yok (P-5). Design-lead'in UX'inde lig örneği "Selin_U" gibi gerçek bir kullanıcı adı (bölüm 1 incelemem).
  Önem: Önemli
  Düzeltme: META §7.1'e satır: "Katılımcılar: oyuncu + 99 bot (Renkli Tepe çırakları; açıkça bot etiketli, adlar STORY `npc.apprentice.*`)". Aynısı `events.json` → `masterLeague.botsLabeled: true` olarak eklensin.

- [entrepreneur → product-lead] META §9, "ödemeyen oyuncu 10 bölümde 1 kez +5 alabilir, 2 kez alamaz" doğru kaldıraç mı? Alt sınır (≥ 1) doğru bir adalet tabanı, kalsın. Üst sınır ("2 kez alamaz") yanlış kontrol düğmesi. Üç nedeni var:
  - (1) Gelirin %29'u (320 / 1.120) 50. bölümden sonra biten bölüm sandığından geliyor. Sandık olmadan 10 bölümlük gelir ≈ 800 altın (hesap: 480 + 50 + 90 + 160 + 20); yani alt sınır da 50. bölümden sonra bozuluyor.
  - (2) Ödüllü reklam günde 3 kez +5 verdiği için ödemeyen oyuncuda dönüşümü altın kıtlığı değil reklam tavanı belirliyor.
  - (3) Kazanma oranı %50 olan oyuncu 10 bölümde ≈ 10 kayıp yaşar; %70 oyuncuda bu sayı ≈ 4 kayıp. Aynı altın tavanı iki oyuncu için çok farklı baskı üretir.
  Önem: Önemli
  Düzeltme: §9 denge kontrolü iki ölçüye çevrilsin; ikisi de Faz 3 ekonomi simülasyonu ve soft launch'ta ölçülür (tahmin bantları):
  - (a) Ödemeyen oyuncunun medyan altın bakiyesi 11–50. bölümlerde 400–1.500 bandında kalsın. 30. bölümde medyan > 2.500 olursa paketler değer kaybeder; 10 bölüm boyunca < 200 kalırsa hayal kırıklığı riski var.
  - (b) Ödemeyen oyuncuda kayıpların kurtarılma karışımı: altınla %15–25, reklamla %30–40, kurtarılmayan %40–50.

  Alt sınır Usta Modu'nda Usta Sandığı ile korunsun (ilk madde). Ölçüm için gereken `coin_source`, `coin_sink`, `event_continue` olayları bölüm 1 incelemesinde code-lead'e istendi.

- [entrepreneur → product-lead] META §5 galibiyet serisi, kayıp kaçınma: Kademe 3 bonusu güçlü (+2 Altın Mala, +3 hamle). K-29'a göre reddedilen +5 seriyi sıfırlıyor. Bu, satın alma anında "serimi kaybetmeyeyim" baskısı doğurur (Royal Match kalıbı). Bot hedeflerinin kademe 0 ile ölçülmesi bu baskıyı sınırlıyor; ama pencere metni ayrıca bir kural istiyor.
  Önem: Öneri
  Düzeltme: META §5'e kural eklensin: "+5 teklif penceresinde seri kaybı yazılmaz ve gösterilmez; seri sıfırlanması yalnız sonuç penceresinde (UX Pencere 2) bildirilir." Soft launch'ta A/B adayı (Sonra): kayıpta seri 0'a değil 1 kademe aşağı insin. Köprü içi +5 gelir payı > %25 çıkarsa (BUSINESS §6.2) bu test öne alınsın.

- [entrepreneur → product-lead] META §3.1 başlangıç cüzdanı ve ilk +5 deneyimi: Başlangıç 500 altın, +5 ise 900. Oyuncu ≈ 8–10. bölüme kadar +5'i altınla alamıyor; ilk kayıpta ya reklam görüyor ya da "Altın al → Mağaza" yönlendirmesi. Mağaza 5. bölümde açılıyor; yeni oyuncunun ilk ekonomi teması satın alma hunisi olmamalı.
  Önem: Öneri
  Düzeltme: Ömürde bir kez, ilk +5 teklifi ücretsiz olsun ("İlk seferde Usta Dede'den hediye!"); mekaniği öğretir ve satın alma hunisini erken açmaz. Başlangıç cüzdanı 500 kalabilir. Etiket: MVP (maliyeti düşük; tek bayrak).

- [entrepreneur → product-lead] META §8.2 bölüm sandığı (E1) ve §6.2 Köprü ödül payı:
  - §8.2'de lig sandığından farklı olarak "içerik açmadan önce görünür" ibaresi yok.
  - §6.2'nin beklenen pay hesabı (≈ 650 altın) ilk +5 fiyatının (900) altında. Bu iyi bir etik özellik: +5'e para vermek ödül havuzu için "rasyonel yatırım" olmuyor.
  Önem: Öneri
  Düzeltme: §8.2'ye "İçerik sabit, ilerleme çubuğunun yanında açılmadan önce görünür (E1)" eklensin. §6.2'ye koruma kuralı eklensin: "Beklenen bitiren payı < ilk +5 fiyatı; havuz ya da bot becerisi değişirse bu eşitsizlik Faz 3 simülasyonunda doğrulanır." §9'daki "P(bitirme) 0,25" varsayımı da aynı simülasyonda ölçülsün; 7 ardışık galibiyet için %70 kazanma oranında 0,7⁷ ≈ 0,08 çıkıyor (hesap). 0,25'e ancak seri bonusu ve reklam kurtarmasıyla ulaşılır.

- [entrepreneur → product-lead] META ve economy.json, kapsam etiketleri:
  - MVP: Usta Modu (ilk madde); süreli sınırsız can (sandık/ödül; 15/30/60 dk); Usta Modu galibiyetlerinin seri ve etkinliklere sayılması; ilk +5 ücretsiz (öneri); Usta Sandığı (öneri).
  - Sonra (soft launch A/B): seri yumuşak sıfırlama.

  Brif dışı başka yeni özellik görmedim.
  Önem: Öneri
  Düzeltme: META ilgili satırlarına MVP/Sonra etiketi eklensin.

## product-lead — GDD.md

- [entrepreneur → product-lead, code-lead] GDD K-43, uygulama kapanınca kayıp sayılması: "Uygulama bölüm ortasında kapanırsa bir sonraki açılışta aynı kurallarla çıkış sayılır" → can gider, seri sıfırlanır, Köprü'deyse elenme olur. Telefon araması, işletim sisteminin WebView'i öldürmesi (düşük seviye Android, BUSINESS R-09) ve tarayıcı sekme atma oyuncunun hatası değil. Köprü'de bunun sonucu bir turluk ilerlemenin kaybı olur; "haksız" yorum riski taşır. Kuralı tersine çevirip kapanmayı affetmek de istismar açar (hamleler bitince uygulamayı kapatıp kayıptan kaçmak).
  Önem: Önemli
  Düzeltme: Bölüm içi devam MVP'de olsun:
  - Her hamlede ve `pagehide`'da `{levelId, seed, moves[], offersUsed}` kaydedilsin.
  - Açılışta "Bölüme devam" seçeneği gelsin; deterministik tekrar oynatma (TECH_DESIGN §12.3 hamle tekrarı ve golden altyapısı) ile durum yeniden kurulsun.
  - Kayıp penceresindeyken kapatılırsa, açılışta aynı pencere gelsin. Böylece kaçış yolu kalmaz.

  K-43 şöyle güncellensin: "Uygulama kapanması çıkış sayılmaz; bölüm kaldığı yerden sürer." Maliyet code-lead'in tahmini (benim tahminim ≈ 1 gün). Etiket: MVP.

- [entrepreneur → product-lead] GDD K-43 ve K-40, öneri P-7 (`m = 0` cezasız çıkış, oyun öncesi güçlendirici iadesi): **katılıyorum.** Bölümler seed'le deterministik olduğu için `m = 0` çıkışı "yeniden zar atma" istismarı açmıyor. Köprü'de de `quitAfterFirstMove` kuralıyla tutarlı. Kazara can kaybını ve hayal kırıklığını azaltıyor; P-2 etik çizgimizle uyumlu.
  Önem: Öneri
  Düzeltme: P-7 KABUL'e alınabilir. Tek ek: `m = 0` çıkışında seri bonusu (kademe 1–3) tüketilmesin. Bonus bölüm başında uygulandığı için bir sonraki girişte aynen verilsin; GDD'de açıkça yazılsın.

## product-lead — LEVELS.md

- [entrepreneur → product-lead] LEVELS §1 ve §4.1, kısa bölümlerin içerik pistine ve KPI'lara etkisi: 50 bölümün toplam hamle bütçesi ≈ 979 (tablodan hesap). Kazanılan denemede bütçenin ≈ %85'i kullanılır, kayıplar tüm bütçeyi yer, ortalama deneme 1,43 (kazanma ≈ %70) varsayılırsa ≈ 1.250 hamle yapılır. 5 sn/hamle ile ≈ 105 dk saf oyun eder; ekran ve meta geçişleriyle 50 bölüm ≈ 2,5–3,5 saatlik içerik (hesap, tahmin). Medyan günlük oyun süresi 22 dk (BUSINESS [K22]) olan oyuncu 50. bölüme ≈ 7–9 günde, ilk %25'lik oyuncu 3–4 günde ulaşır.
  - Oturum süresi KPI'sı (medyan ≥ 7 dk) zarar görmez, çünkü oturumu oyuncunun zamanı belirler.
  - Asıl etkiler: dakikada tüketilen bölüm ≈ %30–40 artar, içerik daha çabuk biter; dakika başına kayıp ve teklif sıklığı da artar.
  - BUSINESS §6.2'deki "oynanan bölüm/DAU" hedefini yeniden ayarlayacağım (6/8 → 8/12).
  Önem: Önemli
  Düzeltme:
  - 1–10. bölümlerin kısa olması FTUE ve D1 için doğru; kalsın.
  - LEVELS §0'a bölüm süresi hedef bandı eklensin, bot raporu ve Aşama 0 testinde `level_end.durationMs` ile ölçülsün: 1–10 = 45–75 sn; 11–30 = 75–120 sn; 31–50 = 100–180 sn (tahmin).
  - Band altında kalan hikaye bölümlerinde LEVELS §4.1'deki büyütme sırası (dilim yüksekliği → şaşırtma) Faz 3'te uygulansın.
  - Usta Modu MVP'ye alındığı için (META maddesi) içerik sonu D7 kaybı sınırlanır.

- [entrepreneur → product-lead, code-lead] LEVELS §3, BUSINESS P-7 B planı yeniden yazılmalı: Benim B planım "Hikaye 4'ün 5 yeni engelini (S5, W8, Y8, S6, S8) Sonra'ya al" diyordu. LEVELS'ta bu engeller 31–50 arasında ≈ 17 bölüme yayılmış:
  - S5: 31, 34, 40, 48
  - W8: 32, 33, 36, 40, 46, 47
  - Y8: 35, 40, 48, 50
  - S6: 37, 39, 40, 49
  - S8: 38, 39, 44, 47, 50

  Hepsini kesmek Hikaye 5'i de yeniden tasarlatır; B planı kendi başına bir gecikme olur. Maliyet de eşit değil: TECH_DESIGN R-4 asansör ve döner platformu solver durumuna faz eklediği için pahalı sayıyor, R-2 hafif yerçekimi yönlendirmesini riskli sayıyor. W8, Y8 ve S8 ise tek eklenti kancası.
  Önem: Önemli
  Düzeltme: B planı yalnız en pahalı iki şantiye modunu kessin: **S6 Asansör** ve **S5 Döner Platform**. Etkilenen bölümler 31, 34, 37, 39, 40, 48, 49 (7 bölüm). Gerekirse G-L yönlendirmesi (23, 49) Bölüm 23'te sade "hafif düşüş"e indirilsin.
  - Product-lead LEVELS §3 tablolarına "bağımlı engeller" sütunu eklesin; böylece kesme etkisi tek bakışta görünür.
  - Code-lead Faz 3 tahmininde engel başına gün versin.

  BUSINESS P-7'yi bu yönde güncelleyeceğim.
