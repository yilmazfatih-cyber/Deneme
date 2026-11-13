# TV+ — içerik zekâsı arka ucu (temel)

Bu belge; yapımların nasıl etiketlendiğini, etiketlerden dar kategorilerin (mikro tür) nasıl kurulduğunu, izleme
verisinin (uygulama + Mixpanel) nereden girdiğini, izleyicilerin zevk topluluklarına nasıl ayrıldığını, hangi türde ne
kadar içerik olduğunun ve olması gerektiğinin nasıl hesaplandığını ve çekim düzeyi gömme vektörlerinin nereye
takıldığını tanımlar. **Bu bir temeldir:** gerçek içerik, gerçek etiketleyiciler, gerçek Mixpanel verisi ve gerçek bir
çok kipli model sonradan aynı kapılardan girer; depodaki örnek veri yalnızca hattın uçtan uca çalıştığını gösterir.

Tel sözleşmesi: `shared/intelligence.ts` · içerik şemaları: `shared/tagging-schema.ts` · servis arayüzleri:
`server/src/kernel/intelligence.ts` · tüm uçlar `/api/studio/*`.

## 1. Kapsam: ürün notu → bileşen

| Ürün notundaki başlık                                                                           | Bileşen                                        | Bölüm  |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------ |
| İnsan etiketleyiciler, kılavuz, ölçütler (cinsellik, kan, romantizm düzeyi, sonun netliği…)     | Etiketleme sözlüğü + etiket fişleri + uzlaşı   | §3     |
| Mikro türler: çekirdek tür + oyuncu, yönetmen, dönem, mekân, yaş grubu, sıfatlar                | Mikro tür üreteci                              | §4     |
| Görünen / görünmeyen katman ("Çünkü şunu izledin", "Buna benzer")                               | Mikro tür katmanları + keşif bütünleşmesi      | §4, §9 |
| Hangi türde ne kadar içerik var; katalog payı ↔ izlenme payı; zaman içinde pay; dil ve ülke     | İçgörüler                                      | §7     |
| Zevk toplulukları (davranışa göre kümeleme)                                                     | Zevk toplulukları                              | §6     |
| Veri + sezgi; talebe ve maliyete göre kaydırma; yerel içerik; lisanslı içerikle boşluk doldurma | Planlayıcı                                     | §7     |
| Mixpanel'den veri bağlama                                                                       | İzleme verisi deposu + Mixpanel bağdaştırıcısı | §5     |
| Çekim düzeyi çok kipli gömme; etiket ve özet modelin girdisi                                    | Gömme servisi + sağlayıcı arayüzü              | §8     |

Nottaki sayılar (kategori sayısı, paylar, oranlar) tasarım girdisidir; kodda sabit olarak yer almaz.

## 2. Veri akışı

```
content/titles/*.json ──────────────┐
content/tagging/vocabulary.json ──┐ │
content/tagging/sheets/*.json ────┤ │        (insan fişleri: /api/studio/tagging → sunucu deposu)
                                  ▼ ▼
                            [ etiketleme ] ── geçerli etiketler ──┬──────────────► [ gömme ] ◄── content/shots/*.json
                                  │                               │                   │            (çekim çözümlemesi)
                                  ▼                               │                   ▼
                           [ mikro türler ] ◄─────────────────────┘        başlık / çekim vektörleri
                                  │                                                   │
uygulama olayları ─┐              │                                                   │
Mixpanel dışa akt. ─┼─► [ izleme verisi ] ─► izleyici × başlık özetleri               │
sentetik örnek ────┘              │                                                   │
                                  ▼                                                   │
                         [ zevk toplulukları ]                                        │
                                  │                                                   │
                                  ▼                                                   ▼
                     [ içgörüler + planlayıcı ]                    keşif: "Buna benzer", "Çünkü … izledin",
                                                                   mikro tür satırları, topluluk satırı (§9)
```

Her servis verisi değiştikçe `revision()` sayacını artırır; ona dayananlar önbelleklerini bu sayaca göre tazeler.
Hiçbir servis başka bir servise kayıt sırasında dokunmaz; erişim istek anındadır (çekirdek kuralı).

## 3. Etiketleme

**Sözlük** (`content/tagging/vocabulary.json`, şema `zVocabulary`) kılavuzun veri hâlidir:

- **Ölçekler** — her biri 0–5 ve her seviyenin somut ölçütü yazılıdır (etiketleyici yoruma değil ölçüte bakar).
  Gruplar: `ADVISORY` içerik uyarıları (cinsellik, şiddet, kan, korku, argo, madde kullanımı) · `TONE` ton (romantizm,
  mizah, gerilim, duygusallık, karanlık) · `STORY` anlatı (tempo, karmaşıklık, **sonun netliği**) · `FORM` biçim
  (görsellik, öğreticilik). Uyarı ölçekleri RTÜK gerekçesine ve önerilen en düşük işarete bağlanır.
- **Niteleyiciler** — ölçek değerinden türeyen sıfatlar (ör. romantizm ≥ 4 → "Romantik"); mikro tür adına girer.
- **Yüzler** — kategorik etiketler: kaynak (uyarlama), mekân, hikâyenin dönemi, konu, ana karakter, yaş grubu, biçim,
  ek sıfatlar. Her değer mikro tür adında kullanılacak **hazır ifadeyi** taşır ("Uzayda Geçen"). Ek üretilmez.
- **Adlandırma** — tür adlarının çoğul biçimleri (film / dizi / karışık), köken bölgeleri, yapım dönemleri, yuva sırası.

**Etiket fişi** (`zTagSheet`): bir başlık için bir kişinin (ya da kaynağın) doldurduğu form. Kaynaklar:
`SAMPLE` depodaki örnek fiş (izlenmeden, özet ve künyeden) · `TAGGER` yapımı izleyen etiketleyici · `MODEL` otomatik
öneri · `IMPORT` dış sistem. Depodaki fişler **örnek**tir ve arayüzde öyle gösterilir.

**Geçerli etiketler** (`EffectiveTags`): onaylı insan fişleri varsa uzlaşıları (ölçekte ortanca, yüzde çoğunluk;
uyum puanı 0–1) → yoksa örnek fiş → yoksa künyeden (tür, ruh hâli, anahtar kelime, RTÜK işareti) model önerisi → boş.
İnsan fişi akışı: taslak → gönderildi → onaylandı. Etiketleyici kimliği takma addır.

Kılavuz metni `npm run tagging:guide` ile sözlükten `docs/ETIKETLEME_KILAVUZU.md` olarak üretilir (elle yazılmaz).

## 4. Mikro türler

Tanım = **çekirdek tür** (+ isteğe bağlı film/dizi) + **yuvalar**:
`ADJECTIVE` sıfat · `REGION` köken · `SOURCE` uyarlama · `SETTING` mekân · `PERIOD` hikâyenin dönemi · `SUBJECT` konu ·
`AGE` yaş grubu · `LEAD` ana karakter · `FORMAT` biçim · `ERA` yapım dönemi · `PERSON` oyuncu/yönetmen/sunucu.

- Ad, sözlükteki hazır ifadelerin `naming.order` sırasıyla dizilmesidir; çekirdek tür adı sonda gelir:
  "Gerçek Olaylardan Uyarlanan Karanlık İskandinav Suç Dizileri", "Uzay Keşfi Hakkında Düşündürücü Belgeseller",
  "1920'lerden Sessiz Komedi Filmleri", "Charlie Chaplin Komedileri".
- Kimlik, tanımın kararlı özetidir (`mg_…`): aynı tanım her üretimde aynı kimliği alır; ad değişse de kimlik değişmez.
- Üretim: her başlığın nitelikleri çıkarılır; 0–4 yuvalı birleşimler sayılır; en az `minTitles` (varsayılan 2) başlığı
  olan tanımlar mikro tür olur. Aynı başlık kümesini veren tanımlardan en okunur olanı kalır.
- **Katmanlar:** `VISIBLE` — ana sayfada satır olabilecek genişlikte (≥ 4 başlık, ≤ 2 yuva) · `HIDDEN` — dar olanlar;
  yalnız benzerlik ve gerekçe için. İzleyicinin gördüğü geniş türler yüzeydir; benzerlik görünmeyen katmandan beslenir.
- Benzerlik: ortak mikro türlerin ters sıklık ağırlıklı örtüşmesi (nadir mikro tür daha çok şey söyler).

## 5. İzleme verisi ve Mixpanel

**Kanonik olay** (`ViewingEvent`): her kaynak aynı biçime çevrilir. Türler: gösterim, tıklama, oynatma başlangıcı /
ilerlemesi / sonu, listeye ekleme-çıkarma, beğeni, arama. Depo eklemeli olay günlüğüdür (gün gün dosya) ve bundan
**izleyici × başlık özetleri** (`ViewingFact`: oynatma, izlenen süre, tamamlama, liste, beğeni, 0–1 ilgi puanı) ile
başlık ve ay toplamları türetilir. Depo bir arayüzün arkasındadır; gerçek ölçekte yerini veri ambarı alır.

**Kaynaklar**

| Kaynak      | Nereden                                                           | Not                                                                                                       |
| ----------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `TVPLUS`    | Uygulamanın kendi olay günlüğü (`/log/web/cl/1`)                  | Olay servisine abone olan köprü çevirir                                                                   |
| `MIXPANEL`  | Ham dışa aktarım dosyası (JSONL / gzip) ya da dışa aktarım API'si | Eşleme dosyasıyla çevrilir                                                                                |
| `SYNTHETIC` | Tohumlu üreteç                                                    | Mixpanel biçiminde üretilir ve **aynı içe aktarma yolundan** geçer; gerçek veri gelince analiz dışı kalır |

**Mixpanel bağdaştırıcısı**

- Girdi: Mixpanel ham olay dışa aktarımı — satır başına `{ "event": …, "properties": { "time", "distinct_id", "$insert_id", … } }`.
- **Eşleme dosyası** (`content/analytics/mixpanel-mapping.json`): hangi Mixpanel olayı hangi kanonik türe, hangi özellik
  hangi alana (içerik kimliği, süre, konum, cihaz, ülke) karşılık gelir; süre birimi; içerik kimliğinin katalogla nasıl
  eşleşeceği (`externalIds.<ad alanı>` → `videoId` → `slug` → başlık adı). Kod değişmeden yeni olay adı bağlanır.
- Yinelenme: `$insert_id` (yoksa satır özeti) ile aynı olay iki kez sayılmaz; içe aktarma yeniden çalıştırılabilir.
- Rapor (`ImportReport`): kabul / yinelenen / reddedilen, **eşlenmeyen olay adları** ve **katalogda bulunamayan içerik
  kimlikleri** — gerçek veri bağlanırken eksik eşlemeyi gösterir.
- Yollar: `npm run mixpanel:import -- --file <yol>` · `--from YYYY-MM-DD --to YYYY-MM-DD` (API) ·
  `POST /api/studio/sources/mixpanel/import` · `/pull`.
- Kimlik bilgileri yalnız ortam değişkenlerinden okunur: `MIXPANEL_SERVICE_ACCOUNT_USERNAME`,
  `MIXPANEL_SERVICE_ACCOUNT_SECRET`, `MIXPANEL_PROJECT_ID`, `MIXPANEL_REGION` (us | eu | in). Depoya, yanıta, günlüğe girmez.

**Gizlilik:** `distinct_id` sunucuya girerken `v_` + HMAC ile takma kimliğe çevrilir (geri çevrilemez). Eşlemede adı
geçmeyen hiçbir özellik saklanmaz; ham satır tutulmaz ve günlüğe yazılmaz. E-posta, ad, IP, cihaz kimliği depoya girmez.

## 6. Zevk toplulukları

İzleyiciler yaşa ya da cinsiyete göre değil, **ne izlediklerine göre** kümelenir.

- Özellik vektörü: izleyicinin ilgi puanıyla ağırlıklanmış tür, mikro tür, niteleyici ve yüz değerleri; yaygın
  özellikler ters sıklıkla bastırılır; birim uzunluğa getirilir.
- Kümeleme: tohumlu k-means++ ile küresel k-ortalama (kosinüs). Küme sayısı veriden seçilir (aday k'lar arasında siluet),
  üst sınır `TVP_MAX_COMMUNITIES` (≤ 2000). Aynı veri + aynı tohum → aynı sonuç.
- Her topluluk: boyut, izleyici ve saat payı, onu ayıran özellikler (genele göre kaldıraç), öne çıkan başlıklar, cihaz
  ve ülke dağılımı (aynı toplulukta farklı ülkeler olabilir), sıkılık.
- Uygulama profili, kendi izleme geçmişinden en yakın topluluğa atanır (`ofProfile`).

## 7. İçgörüler ve planlayıcı

**Ölçüt tanımları** (bir yapım birden çok tür taşıdığından tür payları üst üste biner):

- `catalogShare(x)` = x'i taşıyan başlık / tüm başlık · `viewShare(x)` = x'i taşıyan başlıkların izlenen saati / tüm saat
- `efficiency(x)` = viewShare / catalogShare — 1'in üstü: talep arzın önünde; altı: katalogda izlendiğinden fazla yer tutuyor
- Kırılımlar: tür, film/dizi, ülke, dil, **edinim** (kendi yapımı / lisanslı kütüphane / açık lisans / gömme), RTÜK
  işareti; yerli içeriğin katalog ve izlenme payı
- Zaman çizelgesi: ay ay birikimli katalog payı (eklenme tarihinden) ve o ayın izlenme payı — tür, edinim ya da köken için

**Planlayıcı** (`POST /api/studio/plan`) eklenecek N başlığın türlere dağılımını **önerir**; karar vermez:

```
talep     = izlenme payı, verim ve son dönem eğiliminin 0–1 bileşimi
yargı     = editörün tür başına −1…+1 görüşü (0.5 = yansız)
puan      = veriAğırlığı × talep + (1 − veriAğırlığı) × yargı        (veriAğırlığı varsayılan 0.7; istekle değişir)
maliyet   = verilirse puan, saat/maliyet verimiyle ölçeklenir; bütçe verilirse dağılım bütçeye sığdırılır
```

Çıktı: tür başına hedef pay, başlık sayısı ve okunur gerekçeler; **boşluklar** (talebi yüksek, başlığı az mikro
türler) ve **yeterince beslenmeyen topluluklar** (izlenme payı kendilerine uygun katalog payından belirgin büyük).

## 8. Gömme (çekim düzeyi)

Yapı, çok kipli bir ortam modelinin veri akışını izler: içerik **çekimlere** bölünür; her çekim görüntü, ses ve metin
(o sırada söylenenler) özellikleriyle temsil edilir; **başlığın özeti ve etiketleri her çekime genel bağlam olarak
eklenir**. Yani etiketler burada nihai sınıflandırma değil, modelin girdilerinden biridir.

- **Çekim çözümlemesi** (`content/shots/<videoId>.json`, `npm run analyze:shots`): medyası erişilebilir yapımlarda
  (kendi CDN hattımızdaki açık filmler) ffmpeg ile sahne algılama → çekim sınırları, anahtar kare özellikleri, ses
  özellikleri, altyazıdan çekim metni. Gömme (YouTube) başlıklarında medya çözülmez; birkaç hazır kare + özetle
  temsil edilirler (`method: 'KEYFRAMES'`).
- **Sağlayıcı arayüzü** (`EmbeddingProvider`): girdi = çekim özellikleri + genel bağlam (özet, geçerli etiketler, tür,
  ruh hâli); çıktı = çekim başına vektör + başlık vektörü.
  - `taban` — yerleşik temel: eğitilmemiş, deterministik, elle kurulmuş kodlayıcı (kip özellikleri → ortak uzay;
    bağlam karışımı; komşu çekimlerle bağlamlama). Hattı ve arayüzü çalışır tutar; **eğitilmiş bir modelin yerini tutmaz.**
  - `http` — dış model sunucusu (`TVP_EMBEDDING_URL`): aynı girdi/çıktı JSON'u.
  - `dosya` — çevrimdışı üretilmiş vektörleri içe alır (`dataDir/embeddings/import/*.jsonl`).
- Kullanım: başlık komşuları ("Buna benzer"e katkı), çekim komşuları, 2B izdüşüm (stüdyo haritası), etiket önerisi
  (komşuların etiketlerinden).

## 9. Görünen yüz: keşif bütünleşmesi (ikinci aşama)

- "Buna benzer" = mevcut künye benzerliği + mikro tür örtüşmesi + gömme benzerliği (ağırlıklar tek yerde).
- "Çünkü ‹X›'i izledin" satırları, X'in görünmeyen mikro türlerinden; gerekçe olarak ortak mikro tür adı.
- Görünen mikro türler ana sayfada satır olur; profilin zevk topluluğunda öne çıkanlar ayrı satır.
- Stüdyo arayüzü (`/studyo`): etiketleme masası, mikro tür gezgini, veri kaynakları, topluluklar, içgörü grafikleri,
  planlayıcı, gömme haritası.

## 10. Erişim

`/api/studio/*` izleyiciye açık değildir. `TVP_STUDIO`: `member` (varsayılan; üye oturumu) · `open` (testler) · `off`.
`TVP_STUDIO_KEY` ayarlıysa `x-tvplus-studio-key` başlığıyla oturumsuz erişilir (betikler, zamanlanmış içe aktarma).
Yazma uçları `assertStudioWrite` çağırır: oturumla gelen istek authURL taşımalıdır. Gerçek kurulumda bunun yerini rol
tabanlı yetki alır.

## 11. Sahiplik

| Yol                                                                                                                                                             | Sahibi                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `shared/intelligence.ts`, `shared/tagging-schema.ts`, `server/src/kernel/intelligence.ts`, bu belge                                                             | mimar                             |
| `server/src/services/{tagging,microgenres}/**`, `content/tagging/vocabulary.json`, `scripts/{validate-tagging,tagging-guide}.ts`, `docs/ETIKETLEME_KILAVUZU.md` | **etiketleme + mikro türler**     |
| `server/src/services/{viewing,mixpanel,events}/**`, `shared/mixpanel-mapping.ts`, `content/analytics/**`, `scripts/{mixpanel-import,sample-viewing}.ts`         | **izleme verisi + Mixpanel**      |
| `server/src/services/{audience,insights}/**`                                                                                                                    | **zevk toplulukları + içgörüler** |
| `server/src/services/embeddings/**`, `shared/shots-schema.ts`, `content/shots/**`, `scripts/{analyze-shots,embed-catalog}.ts`                                   | **gömme**                         |
| `server/src/services/discovery/**`, `server/src/graphql/resolvers/**`, `server/src/falcor/routes/**` (ikinci aşama)                                             | **keşif bütünleşmesi**            |
| `web/src/features/studio/**` (ikinci aşama)                                                                                                                     | **stüdyo arayüzü**                |
| `server/src/services/predictions/**`                                                                                                                            | **tahmin modeli**                 |
| `ml/**`, `content/models/**`                                                                                                                                    | **çekim gömme modeli (eğitim)**   |
| `content/tagging/sheets/**`, başlıklardaki `origin` alanları                                                                                                    | içerik ekibi                      |

## 12. Gerçek veriyi bağlama (özet)

1. **Katalog:** yapımlar `content/titles/*.json` biçimine alınır; analitik sistemdeki içerik kimliği
   `externalIds.mixpanel` alanına, köken `origin` alanına, edinim türü `acquisition` alanına yazılır.
2. **Etiketler:** etiketleyiciler `/api/studio/tagging` üzerinden fiş doldurur; onaylanan fişler örnek fişlerin önüne geçer.
3. **Mixpanel:** eşleme dosyasına olay adları ve özellik adları yazılır; önce bir günlük dosyayla denenir, rapordaki
   eşlenmeyen olaylar ve bulunamayan içerikler kapatılır; sonra tarih aralığıyla çekilir.
4. **Topluluklar ve içgörüler** gerçek veri gelince kendiliğinden yeniden hesaplanır; sentetik örnek analiz dışı kalır.
5. **Model:** eğitilmiş bir çok kipli model `http` ya da `dosya` sağlayıcısıyla takılır; taban sağlayıcı devreden çıkar.

## 13. Eğitilmiş modeller

Taban sağlayıcı ve elle kurulmuş kurallar hattı ayakta tutar; **asıl ürün eğitilmiş modellerdir.** İki model vardır ve
ikisi de aynı kapılardan beslenir: etiketler, çekim çözümlemesi, izleme verisi.

### 13.1 Çekim gömme modeli — `ml/` ("mediafm-mini")

Çok kipli bir ortam modelinin küçük ama gerçek bir örneği; PyTorch ile eğitilir, sunucuya `dosya` (çevrimdışı
vektörler) ya da `http` (canlı model sunucusu) sağlayıcısıyla takılır.

```
çekim ──► görüntü kodlayıcısı ─┐
      ──► ses kodlayıcısı ─────┼─► kaynaştırma ──► [CLS] [GENEL] ç1 ç2 … çN ──► dönüştürücü ──► çekim vektörleri
      ──► metin kodlayıcısı ───┘                      ▲                                         başlık vektörü
başlığın özeti + etiketleri ─────────────────────────┘ (genel bağlam belirteci)
```

- **Kip kodlayıcıları** önceden eğitilmiş ve dondurulmuştur (açık ağırlıklar); her çekimin anahtar kareleri, ses
  parçası ve o sırada söylenenler ayrı ayrı vektöre çevrilir.
- **Kaynaştırma dönüştürücüsü** bizim eğittiğimiz kısımdır. Hedef: **maskeli çekim modelleme** — dizideki çekimlerin
  bir bölümü gizlenir, model komşu çekimlerden ve genel bağlamdan gizlenen çekimi tahmin eder. Böylece bir çekimin
  vektörü yalnız kendi karesini değil, sahnedeki yerini ve yapımın etiketlerini de taşır.
- **Genel bağlam:** başlığın özeti ve geçerli etiketleri tek bir belirteç olarak her dizinin başına eklenir; etiket
  burada sınıflandırmanın sonucu değil, modelin girdisidir.
- **Çıktılar** depoda durur (`content/models/mediafm-mini/`): çekim ve başlık vektörleri, model kartı, eğitim ve
  değerlendirme ölçümleri. Sunucu bu vektörler varsa onları kullanır; yoksa taban sağlayıcıya düşer.
- **Ölçek hakkında:** eğitim verisi açık lisanslı birkaç filmin gerçek çekimleridir. Bu, mimarinin ve eğitim hattının
  çalışan küçük bir örneğidir; gerçek katalogla ve daha büyük donanımla aynı hat büyütülür.

### 13.2 Tahmin modeli — `server/src/services/predictions`

İzleme verisinden eğitilir ve ürünün her kişisel kararını verir: ana sayfadaki sıralama, "eşleşme" yüzdesi,
"‹Ad› için En İyi Seçimler".

1. **İş birlikçi katman** — örtük geri bildirimle matris ayrıştırma (ağırlıklı ALS): izleyici × başlık ilgi
   puanlarından izleyici ve başlık vektörleri öğrenilir. Güven ağırlığı `c = 1 + α · ilgi`.
2. **İçerik kulesi** — başlığın içerik işaretlerinden (eğitilmiş gömme vektörü, etiket ölçekleri, mikro türler, tür)
   başlık vektörüne giden doğrusal eşleme. Hiç izlenmemiş (yeni eklenmiş) başlıklar bununla puanlanır; izlenme
   arttıkça ağırlık iş birlikçi vektöre kayar.
3. **Sıralayıcı** — iki katmanın puanlarını popülerlik, yenilik, zevk topluluğu kaldıracı ve yarım kalmışlıkla
   birleştiren lojistik model; çıktısı ayarlanmış olasılık → eşleşme yüzdesi.
4. **Yeni profil** — eğitimde olmayan bir profilin vektörü, kendi izleme özetlerinden anında çözülür (yeniden eğitim
   gerekmez); birkaç oynatmadan sonra tahminler kişiselleşir.

**Değerlendirme** her eğitimde yapılır ve saklanır: zamana göre ayrılmış sınama kümesinde Recall@10, NDCG@10, isabet
oranı ve katalog kapsamı; karşılaştırma tabanları (popülerlik, tür yakınlığı); soğuk başlangıç (eğitimde hiç
görülmemiş başlıklar). Sentetik örnekle elde edilen ölçümler öyle etiketlenir — gerçek sonuçlar Mixpanel verisi
bağlandığında aynı hattan çıkar.

**Eğitim** sunucunun içinde çalışır (ek kurulum yok): veri değişince arka planda, ya da
`POST /api/studio/model/train` ile. Model `dataDir/models/` altında saklanır; aynı veri + tohum → aynı model.
