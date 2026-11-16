# TV+ Lab — churn analizi, simülasyon ve A/B

Lab, Mixpanel'deki uygulama verinizle üç iş yapar ve hepsini **sizin makinenizde** yapar:

1. **Churn neden?** Giden kullanıcıların neden gittiğini veriden ayrıştırır: churn tanımı, tutunma, risk modeli,
   tetikleyici deneyimler, neden aileleri, hangi kesimlerin gittiği, ilk hafta işaretleri.
2. **Simülasyon tabanı.** Gerçek kullanıcılarınızın "ikizlerini" bu depodaki uygulamanın **kendi kodu** üzerinde
   yaşatır (ana sayfa, tahmin modeli, Top 10, deney bayrakları) ve simülasyonun gerçeği ne kadar yeniden ürettiğini
   bir **gerçeklik karnesi** ile ölçer.
3. **A/B.** Bir değişikliği gerçek kullanıcılara açmadan önce simülasyonda (ikiz evren) dener; gerçek deney için güç ve
   süre hesaplar; verinizde maruziyeti olan gerçek deneyleri çözümler.

Bir yapay zekâ ajanıyla (Claude Code) çalışmak için tasarlandı: ajan ham veriyi **görmez**, yalnız kompakt toplam
tabloları okur; böylece hem veri dışarı çıkmaz hem de az token harcanır.

```
Mixpanel dışa aktarımı ──► keşif ──► içe alma ──► tablolar ──► churn motoru ──► bulgular
   (JSONL / gz / CSV)      (şema +    (takma kimlik,  (kolon      │
                            eşleme)    örnekleme)      deposu)    ├─► simülatör (ikizler × uygulama kodu) ──► karne
                                                                  └─► A/B: ikiz evren · gerçek deney · güç
                                                   hepsi ► kompakt CLI / MCP aracı · HTML rapor · Stüdyo
```

Kod: `lab/` · sonuç sözleşmesi: `shared/lab.ts` · deney sözleşmesi: `shared/flags.ts`, `shared/experiments.ts`.

---

## 1. Gizlilik: ne nerede durur, ajan ne görür

| Şey                                | Nerede                                         | Ajan görür mü                                    |
| ---------------------------------- | ---------------------------------------------- | ------------------------------------------------ |
| Mixpanel dışa aktarım dosyaları    | Sizin diskinizde, verdiğiniz yolda             | Hayır                                            |
| Mixpanel servis hesabı             | Yalnız kabuğunuzdaki ortam değişkenlerinde     | Hayır (dosyaya, sohbete yazılmaz)                |
| İçe alınmış olaylar, tablolar      | `tvplus/.data/lab/` (git'e girmez)             | Hayır                                            |
| Kullanıcı kimlikleri               | Girişte HMAC-SHA256 ile takma kimliğe çevrilir | Hayır (takma kimlik bile çıktıya yazılmaz)       |
| Analiz çıktıları (tablolar, bulgu) | `tvplus/.data/lab/sonuc/` + komut çıktısı      | **Evet — yalnız toplamlar**                      |
| Ajana giden her metin              | `tvplus/.data/lab/gunluk/ciktilar.ndjson`      | Siz de görürsünüz: `npm run lab -- gunluk --tam` |

Kurallar kodda zorlanır:

- **Yalnız eşlenen alanlar saklanır.** E-posta, telefon, IP, ad, arama metni gibi özellikler depoya hiç yazılmaz.
  Şema keşfi kişisel veri benzeri özellikleri adından ve değerinden tanır, örnek değerlerini göstermez.
- **Takma kimlik:** `distinct_id`, lab klasöründeki gizli anahtarla (`anahtar`, 0600) 64 bitlik özete çevrilir.
  Anahtar başka makinede yoksa özetler eşleştirilemez.
- **k-anonimlik:** `sorgu` ve tüm kırılımlar en az **20** kullanıcılı grupları gösterir (`ayar --k`, alt sınır 5).
- **Ajan kipi (MCP aracı):** gizlilik ayarı değiştirilemez, depo boşaltılamaz, lab klasörü değiştirilemez; çıktı
  bütçelidir (8.000 karakter).
- **Dışarıya istek yok.** Lab hiçbir yere veri göndermez. Tek ağ işi, siz isterseniz `cek` komutunun Mixpanel Export
  API'sinden **indirmesidir**.

Ajanın yanıt üretmek için okuduğu toplamlar (ör. "keşif başarısızlığı %27") model sağlayıcısına gider; bu, bir
arkadaşınıza sonucu söylemenizle aynı düzeydir. Ham olay, kimlik ya da kişi düzeyi satır gitmez.

---

## 2. Beş dakikada denemek (sentetik veri)

```bash
cd tvplus && npm install
npm run lab -- demo            # ~½ dk: 4.000 kullanıcı × 120 gün sentetik Mixpanel dışa aktarımı + tüm hat
npm run lab -- churn           # bulgular
npm run lab -- sim karne       # simülatörü kalibre et, gerçeklik karnesi (1–2 dk)
npm run lab -- deney calistir sayfa-siralama
npm run lab -- rapor           # tek dosyalık HTML rapor
```

`demo` yalnız veri üretmez, **yöntemi sınar**: sentetik dünyaya bilinen churn nedenleri gömülüdür (keşif başarısızlığı,
hatalı bir sürüm, içerik tükenmesi, promosyon bitişi, sezon sonu…), etkisiz boyutlar (şehir, dil) ve bir karıştırıcı
(operatör paketi) vardır. Analiz bu gerçeği bilmeden çalışır; sonra 16 denetimle karşılaştırılır (nedenler doğru
sıralandı mı, hatalı sürüm bulundu mu, etkisiz boyutlar yanlışlıkla işaretlendi mi, katsayılar geri kazanıldı mı).
Kasıtlı olarak zayıf bırakılmış bir etki (takılma) ayrıca `~` ile raporlanır: küçük veride görülemeyebilir, daha büyük
veriyle (`demo --kullanici 12000`) görülür — yöntemin neyi ayırt edemeyeceğini de gösterir.
Sentetik veri her çıktıda `SENTETİK DEMO VERİSİ` diye etiketlenir.

---

## 3. Kendi verinle kurulum

Lab klasörü varsayılan olarak `tvplus/.data/lab` (başka yer: `TVP_LAB_DIR=/yol` ya da her komutta `--lab /yol`).

```bash
# 1) Dışa aktarım: Mixpanel → Export (ham olaylar), JSONL / .gz / CSV. Ya da API ile (aşağıda).
npm run lab -- kesif ~/veri/mixpanel-2026-10.jsonl.gz     # şema + eşleme önerisi (örnek değer göstermez)
npm run lab -- esleme                                     # öneriyi oku; gerekirse esleme.oneri.json'u düzelt
npm run lab -- esleme --kabul
npm run lab -- al ~/veri/*.jsonl.gz --deneme              # yazmadan rapor: kabul / ret / eşlenmeyen olaylar
npm run lab -- al ~/veri/*.jsonl.gz                       # içe al (aynı dosya iki kez alınsa da yinelenmez)
npm run lab -- kur                                        # analiz tabloları
npm run lab -- churn
```

**API ile çekmek** (kimlik bilgisi yalnız kabuğunuzda; ayrıntı `docs/MIXPANEL.md` §2):

```bash
export MIXPANEL_SERVICE_ACCOUNT_USERNAME=… MIXPANEL_SERVICE_ACCOUNT_SECRET=… MIXPANEL_PROJECT_ID=… MIXPANEL_REGION=eu
npm run lab -- cek --from 2026-08-01 --to 2026-10-31      # indirir, içe alır, ham dosyayı siler (--sakla: saklar)
```

**Büyük veri:** `--ornek 0.1` kullanıcıların %10'unu alır (kullanıcı düzeyi örnekleme: bir kullanıcı ya tümüyle içeride
ya dışarıda). Hız yaklaşık 230 bin satır/sn; depo olay başına 32 bayttır.

**Eşleme** (`esleme.json`) sizin olay ve özellik adlarınızı lab'ın kanonik türlerine bağlar:
`APP_OPEN, SCREEN, IMPRESSION, CLICK, PLAY_START, PLAY_PROGRESS, PLAY_END, PLAY_ERROR, BUFFER, SEARCH, LIST_ADD,
LIST_REMOVE, RATING, SIGNUP, LOGIN, SUBSCRIBE, RENEW, CANCEL, EXPIRE, PAYMENT_FAIL, NOTIF_OPEN, APP_ERROR, EXPOSURE`.
Analizin kalitesi bu eşlemeye bağlıdır; en önemlileri oynatma olayları (süre birimi ve izlenen süre kipiyle), hata /
takılma, arama (sonuçsuz arama işareti), abonelik olayları ve kırılım boyutlarıdır (platform, sürüm, plan, kaynak…).
`EXPOSURE` (ör. `$experiment_started`) eşlenirse gerçek deneyler de çözümlenir. Şema: `lab/src/data/mapping.ts`.

Ne kadar veri gerekir? En az churn süresinin (çoğu zaman 30 gün) üç katı; 90–180 gün iyidir.

---

## 4. Churn analizi

| Komut         | Ne verir                                                                               |
| ------------- | -------------------------------------------------------------------------------------- |
| `churn`       | Tanım, oranlar ve **önem sırasıyla bulgular** (her bulgu ayrıntı komutunu gösterir)    |
| `churn tanim` | Churn süresi neden o kadar: sessizlik süresine göre geri dönme olasılığı               |
| `churn genel` | Dönem dönem churn oranı, yeni kullanıcı tutunma eğrisi                                 |
| `churn neden` | Neden aileleri: pay · birincil · giderilirse · en sık işaretler                        |
| `churn tetik` | Tetikleyici deneyimler: risk oranı (RO), güven aralığı, yaygınlık, atfedilebilir pay   |
| `churn kim`   | Hangi kesimler (boyut = değer), beklenenden kötü cepler, davranış kümeleri             |
| `churn yeni`  | İlk hafta: tutunmayı ayıran erken davranışlar                                          |
| `churn etken` | Risk işaretleri (kimin gideceğini gösteren özellikler); `churn etken <ad>` tek özellik |
| `sorgu …`     | Hazır analizlerin yanıtlamadığı soru için toplu sorgu (`npm run lab -- sorgu` yardım)  |

### Yöntem (kısaca)

- **Tanım veriden seçilir.** Sessizlik sürelerine Kaplan–Meier uygulanır; "N gün sessiz kalanın geri dönme olasılığı
  ≤ %20" olan en küçük N churn süresidir (`--n 45` ile elle verilebilir).
- **Risk modeli (kim gidecek):** geçmiş anlık görüntülerde 28 günlük davranıştan sonraki N günde gidip gitmediği
  öğrenilir; eski görüntülerle eğitilir, en yenisiyle sınanır (lojistik regresyon + karar ağacı topluluğu).
  Bu model **kimi** söyler, **neden**i değil: "son 7 günde izlemedi" gidişin sonucudur.
- **Tetikleyiciler (neden):** her uygulama günü bir gözlemdir; soru "bu deneyimin yaşandığı gün kullanıcının son günü
  olma riski, benzer kullanıcıların (kıdem × önceki etkinlik × cihaz) yaşamadığı günlere göre kaç kat?"
  (Mantel–Haenszel risk oranı, çoklu karşılaştırma düzeltmeli). Ardından tüm deneyimler ve durumlar ortak bir günlük
  risk modeline girer.
- **Neden ayrıştırma:** her churn olayında riski tabanın üstüne çıkaran pay, o gün var olan ve istatistiksel olarak
  anlamlı zararlı etkenlere dağıtılır; etkenler ailelere toplanır (keşif, alışkanlık, abonelik/fiyat, oynatma kalitesi,
  içerik, yaşam döngüsü). Cihaz, sürüm, şehir gibi bağlam boyutları neden sayılmaz (denetim değişkenidir; `churn kim`).
- **Kesimler:** beklenenden kötü cepler tasarım etkisi ve çoklu karşılaştırma düzeltmesiyle aranır; etkisiz
  boyutların yanlışlıkla işaretlenmemesi sentetik dünyada sınanır.

### Okuma kılavuzu

- **pay:** churn riskinin o nedene atfedilen kısmı. **birincil:** baskın nedeni o olan churn olaylarının payı.
- **giderilirse:** o nedenin zararlı etkileri hiç olmasaydı beklenen azalma. Üst sınırdır, hedef değildir.
- **taban risk:** özel bir işaret yokken de var olan gitme riski. Hiçbir ürün değişikliğiyle sıfırlanmaz.
- **RO 4.15x [3.55x, 4.85x]:** o deneyimin yaşandığı gün, benzer kullanıcıların yaşamadığı güne göre 4.15 kat daha
  sık "son gün" oluyor; aralık %95 güven aralığıdır.

Bulgular **gözlemseldir**. Eşleştirme ve ortak model bilinen karıştırıcıları denetler, ölçülmeyenleri denetleyemez.
Bir nedeni gidermenin gerçekten işe yarayıp yaramadığını simülasyon sıralar, gerçek deney kanıtlar.

---

## 5. Simülasyon

```bash
npm run lab -- sim kur        # katalog köprüsü: verinizdeki başlıklar → uygulamanın yükleyebildiği katalog
npm run lab -- sim karne      # kalibrasyon + gerçeklik karnesi
npm run lab -- sim varsayim   # hangi parametre veriden, hangisi kalibrasyondan, hangisi varsayım
```

Nasıl çalışır:

1. **Katalog köprüsü.** Verinizde izlenen başlıklar (ad, tür, bölüm sayısı, süre) uygulamanın içerik biçimine çevrilir;
   uygulama bu katalogla açılır. Geçmiş izlemeler uygulamanın izleme deposuna yüklenir, tahmin modeli bunlarla eğitilir.
2. **İkizler.** Bugün etkin olan her gerçek kullanıcı için bir ikiz: geliş sıklığı, oturum sayısı, tamamlama eğilimi,
   hata ve takılma maruziyeti, canlı yayın payı kullanıcının kendi geçmişinden (ortalamaya büzülerek) gelir.
3. **Tercih kâhini.** İkizin bir başlığı isteyip istemeyeceğini uygulamanın tahmin modelinden **bağımsız** bir model
   söyler (birlikte izlenme + tür yakınlığı + popülerlik; ağırlıklar gerçek "sıradaki başlık" seçimlerinden öğrenilir).
   Bağımsız olması şarttır: öneri sistemi kendi kendini sınayamaz.
4. **Motor.** Her gün, her gelen ikiz için uygulamanın gerçek ana sayfası kurulur (`buildLolomo`, deney bayraklarıyla);
   ikiz satırları ve kartları yukarıdan aşağı tarar, kâhine göre seçer, izler, bitirir ya da bırakır; hata ve takılma
   yaşar; günün sonunda churn risk modeli (bölüm 4'teki) bırakma kararını verir.
5. **Kalibrasyon ve karne.** Veri penceresinin son bölümü saklanır: simülatör oradan başlatılır ve gerçekte olanla
   karşılaştırılır. Beş ayar gerçek veriye uydurulur; kalan ölçüler **uydurulmaz**, karne puanı yalnız onlardan
   hesaplanır (✓: oran 0.75–1.33 arasında ya da pay farkı ≤ 1.5 puan).

Karne nasıl okunur: puan 1'e ne kadar yakınsa simülatör gerçeği o kadar iyi yeniden üretiyor. Bir ölçüde ✗ varsa o
ölçüye dayanan deney sonuçlarına temkinli bakın; ✗ çoğu zaman dönem içinde değişen bir şeyi (yeni sürüm, sezon,
katalog) ya da modelde olmayan bir davranışı gösterir. `sim varsayim` çıktısındaki **varsayım** satırları sonuçların
en zayıf yeridir.

---

## 6. A/B deneyleri

### Uygulamadaki deney altyapısı

- **Bayraklar** (`shared/flags.ts`): `home.rowRanker`, `home.pageRanker`, `home.top10`, `home.becauseRows`,
  `home.picksPosition`, `player.autoplayNext`, `preview.autoplay`. İlk değer bugünkü davranıştır.
- **Deney tanımları** (`content/experiments.json`): anahtar, kollar (her kol bir bayrak kümesi), trafik payı, birincil
  ölçü, koruma ölçüleri. `npm run validate:content` çakışan deneyleri yakalar.
- **Atama** durumsuz ve belirlenimcidir (birim kimliği + deney tuzu → kol); **maruziyet** olayı (`experiment.exposure`,
  Mixpanel karşılığı `$experiment_started`) kullanıcı bayraktan etkilenen yüzeyi gördüğünde bir kez yazılır.
- Stüdyo uçları: `GET /api/studio/experiments`, durum değiştirme ve sabitleme (`server/src/services/experiments/`).

### Simülasyonda deney: ikiz evren

```bash
npm run lab -- deney liste
npm run lab -- deney calistir top10-yeri                 # content/experiments.json'daki tanım
npm run lab -- deney dene --bayrak home.becauseRows=3    # tanım yazmadan tek değişiklik
npm run lab -- deney dene --hata 0.5 --takilma 0.5       # ortam: oynatma hatası ve takılma yarıya inerse
npm run lab -- deney dene --arama-hata 0.7 --ad arama    # davranış varsayımı: sonuçsuz arama %30 azalırsa
```

Her kol ayrı bir evrendir: **aynı ikizler, aynı rastgelelik, farklı varyant.** Fark kullanıcı başına alındığı için
(eşli çözümleme) gerçek bir A/B'nin haftalarca bekleyeceği küçük etkiler bir dakikada görülür. Kontrolle aynı varyant
tam sıfır fark verir (testlerle doğrulanır).

Üç tür değişiklik denenebilir ve çıktı hangisinin kullanıldığını yazar:

| Tür                    | Örnek                     | Güvenilirlik                                                    |
| ---------------------- | ------------------------- | --------------------------------------------------------------- |
| Uygulama kodu (bayrak) | `--bayrak home.top10=low` | En güçlü: uygulamanın gerçek kodu çalışır                       |
| Ortam                  | `--hata 0.5`              | Orta: etki, veriden öğrenilen risk modeline dayanır             |
| Davranış varsayımı     | `--devam 1.2`             | En zayıf: "öyle olsaydı ne olurdu" sorusudur, siz varsayarsınız |

Karar satırı: **aday** (birincil ölçü iyileşti, korumalar bozulmadı → gerçek deneye değer) · **riskli** (bir koruma
ölçüsü bozuldu) · **zararlı** (birincil ölçü bozuldu) · **etkisiz** (fark gösterilemedi).

Ölçüler: `izleme_dk, oynatma, uygulama_gunu, tamamlama, yeni_baslik, bos_oturum, bos_gun, hata_orani, churn, son_hafta`.

### Gerçek deney: güç, süre ve çözümleme

```bash
npm run lab -- deney guc --olcu izleme_dk --trafik 0.5   # hangi sürede hangi etki görülür, CUPED ne kazandırır
npm run lab -- deney gercek                              # veride maruziyeti olan deneyler
npm run lab -- deney gercek "anasayfa-kisisel-siralama"  # kollar, CUPED, örneklem oranı denetimi (SRM)
```

`deney guc` gerçek verinizin varyansını kullanır: deney 7 / 14 / 21 / 28 gün sürerse o sürede uygulamaya gelen
kullanıcı sayısı ve **görülebilen en küçük etki**. Simülasyonun "aday" dediği değişikliğin beklenen etkisi bu sınırın
altındaysa gerçek deney onu göremez; ya daha duyarlı bir ölçü ya da daha uzun süre gerekir.

`deney gercek` iki p değeri verir: tablodaki p **planlanan sürenin sonunda** geçerlidir; "erken bakış" satırındaki
**her an geçerli p** ise deney sürerken istediğiniz kadar bakmanıza izin verir (yanlış alarm oranı bakış sayısından
etkilenmez). Deneyi erken bitirmek istiyorsanız kararı ona göre verin.

Önerilen çalışma biçimi: **çok fikir → simülasyonda ele (dakikalar) → kalan birkaçını gerçek A/B'ye al (haftalar) →
gerçek sonucu `deney gercek` ile çözümle ve simülasyonun öngörüsüyle karşılaştır.** Her gerçek deney simülatöre olan
güveni ölçer.

### Yeni bir deney eklemek

1. Bayrağı `shared/flags.ts` içindeki `FLAGS` sözlüğüne ekleyin (ilk değer = bugünkü davranış).
2. Davranışı uygulayın: ana sayfa için `server/src/services/discovery/lolomo.ts`, istemci için `web/src/lib/flags.ts`.
3. Tanımı `content/experiments.json` dosyasına yazın (`status: "DRAFT"`).
4. `npm run lab -- deney calistir <anahtar>`.

---

## 7. Ajanla çalışmak (az token)

- **MCP aracı:** depo kökündeki `.mcp.json` `tvplus-lab` sunucusunu tanımlar (`lab/mcp.ts`). Claude Code'u depo
  kökünde ya da `tvplus/` içinde açtığınızda sunucu için bir kez onay ister. Tek araç vardır: `lab { komut }`.
- **Beceri:** `/tvplus-lab <soru>` (`.claude/skills/tvplus-lab/SKILL.md`) ajana akışı ve kuralları verir.
- MCP yoksa aynı komutlar kabuktan çalışır: `npm --prefix tvplus run --silent lab -- churn neden`.

Neden az token:

| Tasarım                                           | Etkisi                                                       |
| ------------------------------------------------- | ------------------------------------------------------------ |
| Tek araç, tek metin parametresi                   | Araç tanımı her oturumda ~750 karakter (onlarca araç yerine) |
| Analiz makinede yapılır, ajana yalnız sonuç gider | 1.7 milyon olaylık veri → `churn` çıktısı ~2.800 karakter    |
| Kompakt hizalı tablolar, satır bütçesi, "+N daha" | `churn neden` ~1.500 · `deney sonuc` ~2.200 karakter         |
| Bir çağrıda birden çok komut (`a; b; c`)          | Tur sayısı azalır (her tur bağlamı yeniden okutur)           |
| Sonuç önbelleği (veri sürümüne bağlı)             | Aynı analiz yeniden hesaplanmaz, yeniden anlatılmaz          |
| Her çıktı "sıradaki" komutu söyler                | Ajan keşif için tur harcamaz                                 |
| Çıktı bütçesi (8.000 karakter)                    | Tek bir çağrı bağlamı dolduramaz                             |

Demo verisinde uçtan uca bir churn incelemesi (`durum; churn` + `churn neden; churn tetik`) yaklaşık 7.000 karakterdir.

---

## 8. İnsan arayüzü

- **Stüdyo** (`/#/studyo`): **Kayıp Analizi** ve **Deney Laboratuvarı** sayfaları `sonuc/` altındaki dosyaları okur
  (salt okunur; `GET /api/studio/lab`, `/api/studio/lab/sonuc/:ad`, `/api/studio/lab/deneyler`). Sunucu lab klasörünü
  `TVP_LAB_DIR` ya da `TVP_DATA_DIR/lab` altında arar.
- **Rapor:** `npm run lab -- rapor` → `lab klasörü/rapor/lab-raporu.html`. Tek dosyadır, dışarıdan hiçbir şey yüklemez,
  yalnız toplam içerir; kurum içinde paylaşılabilir.

---

## 9. Doğrulama

| Ne                   | Nasıl                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| İstatistik çekirdeği | scipy / statsmodels / lifelines / scikit-learn ile üretilmiş başvuru değerleri (`lab/test/fixtures`) |
| Churn yöntemi        | Nedenleri bilinen sentetik dünya; `demo` her çalıştığında 16 denetim                                 |
| A/B testleri         | Sıfır etki altında yanlış alarm oranı, güven aralığı kapsaması, CUPED ve eşli çözümleme kazancı      |
| Simülatör            | A/A tam sıfır fark, aynı tohum aynı sonuç, bilinen değişiklik doğru yönde; gerçeklik karnesi         |
| Gizlilik             | Ham kimlik, e-posta, telefon, IP hiçbir depo dosyasında, tabloda, sonuçta ve çıktıda yok             |
| Ajan arayüzü         | MCP protokol oturumu, ajan kipi kısıtları, denetim günlüğü                                           |

Çalıştırmak: `npx vitest run lab/test` · tip denetimi: `npx tsc -p tsconfig.lab.json --noEmit`.

---

## 10. Sınırlar (dürüstçe)

- **Simülasyon gerçek A/B'nin yerini tutmaz.** Fikirleri eler ve sıralar. Sonuç iki modele bağlıdır: ikizin neyi
  isteyeceği (tercih kâhini) ve ne zaman bırakacağı (risk modeli). İkisi de geçmiş davranıştan öğrenilir; kullanıcıların
  hiç görmediği türden bir deneyime tepkisini bilemezler.
- **Simüle edilen uygulama bu depodaki örnek uygulamadır.** Ana sayfa mantığı, tahmin modeli ve bayraklar bu kodundur;
  üretimdeki TV+ uygulamanızın sıralama kodu farklıysa bayrak deneylerinin sonucu ona doğrudan taşınmaz. Ortam ve
  davranış denemeleri (`--hata`, `--arama-hata`) uygulama kodundan bağımsızdır ve verinize dayanır.
- **Geliş sıklığı deneyimden etkilenmez.** Churn etkisi yalnız "son gün" riski üzerinden ölçülür; iyi bir değişikliğin
  uzun dönem etkisi muhtemelen olduğundan küçük görünür.
- **Churn nedenleri gözlemseldir.** Ölçülmeyen bir karıştırıcı (ör. rakip kampanyası, fiyat algısı) "taban risk"
  içinde kalır.
- **Veri kalitesi eşlemeye bağlıdır.** Oynatma süresi, hata ve arama olayları eksik ya da yanlış eşlenirse ilgili
  bulgular da eksik olur; `al --deneme` raporundaki "eşlenmeyen" ve "reddedilen" sayılarına bakın.
- Bu depodan gerçek bir Mixpanel projesine bağlanılmadı; bağdaştırıcı belgelenen dışa aktarım biçimine göre yazıldı ve
  aynı biçimdeki sentetik veriyle sınandı. İlk gerçek içe almada `kesif` ve `al --deneme` çıktısını gözden geçirin.

---

## 11. Dosya haritası

```
lab/cli.ts            komut satırı (npm run lab -- …)
lab/mcp.ts            MCP sunucusu (tek araç: lab)
lab/src/core/         rastgelelik, istatistik, kompakt biçimleme, kolon deposu, karar ağaçları, kümeleme
lab/src/data/         şema keşfi, eşleme, içe alma (takma kimlik, örnekleme), depo, tablo kurma
lab/src/world/        sentetik dünya (nedenleri bilinen Mixpanel dışa aktarımı) ve doğrulama
lab/src/churn/        tanım, genel görünüm, özellikler, risk modeli, tetikleyiciler, kesimler, ilk hafta, bulgular
lab/src/query/        toplu sorgu (k-anonim)
lab/src/sim/          katalog köprüsü, simülasyon dünyası, ikizler, tercih kâhini, motor, kalibrasyon ve karne
lab/src/ab/           istatistik (Welch, oran, eşli, CUPED, SRM, güç, ardışık), ölçüler, deney yürütücüsü
lab/src/cli/          komutlar, argümanlar, HTML rapor
shared/lab.ts         sonuç sözleşmesi (Stüdyo ve rapor bunu okur)
shared/flags.ts       bayrak sözlüğü ve atama · shared/experiments.ts deney şeması
content/experiments.json   deney tanımları
```
