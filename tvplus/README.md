# TV+ — Netflix deneyimi ve mekanikleriyle sıfırdan

Netflix'in web uygulamasının ağ trafiğinden çıkarılmış mimarisini
([`docs/referans/netflix-system-design-reverse-engineered.md`](docs/referans/netflix-system-design-reverse-engineered.md))
**aynı mekaniklerle** ve **Netflix'in kullanım deneyimiyle** TV+ için sıfırdan kuran, çalışan bir akış uygulaması:

- **Üç ekran:** web, mobil ve TV (kumandayla kullanılan 10-foot arayüz) — aynı sunucu, aynı hesap.
- **Cihazlar arası:** TV'de QR ile giriş, telefonu kumanda olarak kullanma, içeriği ve canlı yayını TV'ye yansıtma.
- **Tahmin modeli:** izleme verisinden eğitilen öneri modeli (sıralama, "eşleşme" yüzdesi, kişisel satır) ve
  tıklamalardan öğrenen arama modeli.
- **İçerik zekâsı arka ucu:** etiketleme → mikro türler → izleme verisi (Mixpanel bağlantı noktası) → zevk toplulukları
  → içgörüler ve planlayıcı; çekim düzeyi gömme ve bunun üstünde eğitilmiş küçük bir çok kipli model.
- **Kaputun altı:** her mekaniğin nasıl işlediğini canlı gösteren panel; arka ofis için **Stüdyo**.

Görünüm kuralları: [`docs/UX_SPEC.md`](docs/UX_SPEC.md) · mimari: [`docs/MIMARI.md`](docs/MIMARI.md) ·
içerik zekâsı ve modeller: [`docs/ICERIK_ZEKASI.md`](docs/ICERIK_ZEKASI.md).

> **Gerçek TV+ değildir.** Gerçek hesap, ödeme ya da kişisel veri toplamaz; TV+'ın yayınlarını taşımaz; DRM uygulamaz.
> İçerik: YouTube resmî gömmeleri, açık lisanslı filmler (kendi CDN hattımızdan) ve kamu malı klasikler.
> Gerçek kanalların yayın akışları, izleme verisi ve etiket fişleri **örnek veridir** ve arayüzde öyle etiketlenir.

## Çalıştırma

Gereken: Node.js ≥ 22.12 ve npm.

```bash
cd tvplus
npm install
npm run dev
```

`http://localhost:5173` adresini açın → **Demo hesabıyla devam et** → bir profil seçin.

| Ne görmek istiyorsunuz                 | Adres                                 |
| -------------------------------------- | ------------------------------------- |
| Üç ekran yan yana (önerilen ilk durak) | `http://localhost:5173/#/vitrin`      |
| Web                                    | `http://localhost:5173/`              |
| Mobil görünüm (masaüstü tarayıcıda)    | `http://localhost:5173/?cihaz=mobil`  |
| TV görünümü (ok tuşları, Enter, Esc)   | `http://localhost:5173/?cihaz=tv#/tv` |
| Stüdyo (arka ofis)                     | `http://localhost:5173/#/studyo`      |

İlk açılışta sunucu arka planda **sentetik** bir izleme örneği üretir (≈1.500 izleyici), zevk topluluklarını kümeler
ve tahmin modelini eğitir; birkaç saniye sürer, uygulama bu sırada kullanılabilir.

Tek kapıdan (derlenmiş) çalıştırmak ve **gerçek telefonla / TV tarayıcısıyla** denemek için:

```bash
npm run build
```

```bash
HOST=0.0.0.0 npm start
```

Bu kipte her şey `http://<bilgisayarın-ip-adresi>:8787` üzerindedir. TV'deki QR kodu aynı Wi-Fi'daki telefonun
açabileceği adresi taşır. (Düz `http://<ip>` adresinde oynatma hattı şifresiz geliştirme şemasına düşer; şifreli zarf
güvenli bağlam ister.)

### Telefonda açılacak bağlantı

GitHub Pages yalnız durağan dosya sunar; TV+'ın sunucusu olduğu için orada çalışmaz. Depo kökündeki `render.yaml`,
uygulamayı Render'ın ücretsiz katmanına tek tıkla kurar ve `https://…onrender.com` biçiminde kalıcı bir adres verir:

1. [Render'da kur](https://render.com/deploy?repo=https://github.com/yilmazfatih-cyber/Deneme/tree/claude/cool-ride-ns0h7v)
   bağlantısını açın, GitHub hesabınızla girin ve depoya erişim verin. (Bağlantı dalı bulamazsa: **New → Blueprint**,
   depo `Deneme`, dal `claude/cool-ride-ns0h7v`.)
2. **Deploy**'a basın; ilk kurulum birkaç dakika sürer.
3. Verilen adresi telefonda açın. Telefon mobil görünümü kendiliğinden alır; TV görünümü için adresin sonuna
   `?cihaz=tv#/tv` ekleyin. TV'deki QR kodu bu adresi taşıdığı için gerçek telefonla okutulabilir.

Bilinmesi gerekenler: adres herkese açıktır (yalnız demo hesabı vardır; Stüdyo da bu hesapla açılır). Ücretsiz katman
15 dakika kullanılmayınca uyur; sonraki ilk açılış yaklaşık bir dakika sürer ve profiller, yer imleri ile eğitilmiş
tahmin modeli sıfırdan kurulur. Bellek ayarları (`MALLOC_ARENA_MAX`, `NODE_OPTIONS`) dar belleğe göre seçilmiştir.

### Açılmazsa

Uygulama başlayamazsa boş ekran yerine **"TV+ açılamadı"** sayfası çıkar ve nedeni yazar; o metin çoğu zaman sorunu
tek başına anlatır. Sayfa hiç gelmiyorsa (tarayıcının kendi "bağlanılamadı" ekranı) sunucu çalışmıyordur.

| Belirti                                     | Olası neden                                     | Ne yapmalı                                                                        |
| ------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------- |
| Tarayıcı "bağlanılamadı" diyor              | Sunucu çalışmıyor ya da adres yanlış            | `npm run dev` çalışan terminal açık mı; adres `5173` (geliştirme) / `8787` mi     |
| "TV+ açılamadı — Betik yüklenemedi"         | Eski derleme ya da yarım kalmış kurulum         | `npm install`, ardından `npm run build`; sayfayı yenileyin                        |
| Kurulum ya da başlatma hata veriyor         | Node sürümü eski                                | `node -v` 22.12 ya da üstünü göstermeli                                           |
| "adres kullanımda" (`EADDRINUSE`)           | Kapıyı önceki bir çalıştırma tutuyor            | Öteki terminali kapatın ya da başka kapı verin: `PORT=8788 npm start`             |
| Sayfalar geliyor, video oynamıyor           | Açık kaynak videolar internetten gelir          | Bağlantıyı denetleyin; oynatıcıda **Kaynak** düğmesinden öteki kaynağı seçin      |
| Girişten sonra tutarsız durum, eski görünüm | Önceki sürümden kalan çerez ya da sunucu verisi | Tarayıcıda site verisini silin; sunucu durumu `.data/` klasöründedir, silinebilir |

## Üç ekran ve cihazlar arası

| Özellik                | Nerede                                      | Ne olur                                                                                             |
| ---------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Cihaz vitrini          | `/#/vitrin`                                 | TV, web ve telefon çerçeveleri ayrı cihazlar olarak yan yana; dört senaryo düğmesi akışları yürütür |
| TV'de QR ile giriş     | TV: `/tv/giris` · telefon: `/#/bagla?kod=…` | TV kod ve QR gösterir; telefonda onaylanınca TV kendiliğinden açılır (cihaz yetkilendirme akışı)    |
| Telefon kumandası      | `/#/kumanda`                                | Dokunmatik yüzey ve yön tuşları, yazı gönderme (TV aramasına), oynatma, ses, kanal, sayı tuşları    |
| TV'ye yansıtma         | oynatıcı, detay, canlı TV: **TV'de İzle**   | Film, bölüm ya da canlı kanal TV'de kaldığı yerden açılır; "Şu an TV'de" kartından yönetilir        |
| Bu cihazda devam et    | "Şu an TV'de" kartı / kumanda               | Oynatma TV'den alınır, bu cihazda aynı saniyeden sürer                                              |
| Cihazlar               | `/#/cihazlar`                               | Hesaptaki cihazlar, ad değiştirme, uzaktan oturum kapatma                                           |
| Telefonla kontrol (TV) | TV: Ayarlar → **Telefonla Kontrol Et**      | Telefonda kumandayı açan QR ve bağlı cihazlar                                                       |
| Profiller              | `/#/profiller`, **Profilleri Yönet**        | Profil ekleme/düzenleme, avatar, çocuk profili, 4 haneli kilit                                      |

## Ne denenir: kısa tur

Sağ alttaki **Kaputun altı** düğmesi (ya da `Ctrl+.`) her adımı canlı gösterir.

| Ne yapın                                                                   | Ne görürsünüz                                                                                                 |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Ana sayfayı açın, satırları kaydırın                                       | Satırlar eski sistemden (Falcor yolları, toplu istek) gelir; ilk ekran için hiç istek atılmaz (açılış tohumu) |
| Bir kartın üzerinde bekleyin                                               | Önizleme kartı: satırın **tamamı** için tek `MiniModalQuery`; eşleşme yüzdesi, etiketler, sessiz önizleme     |
| Bir başlığın detayını açın                                                 | Kalıcı sorgu (yalnız kimlik + sürüm); "Benzerleri" gerekçeleriyle; mikro tür bağlantıları                     |
| Arama kutusuna `si` yazın, sonra `sintel`                                  | Tahmin modelinin tamamlamaları; sonuçlar ve "Sintel ile ilgili" tahmini bölümü                                |
| `dünya` arayın, dördüncü sonuca tıklayıp aramayı yineleyin (`?aciklama=1`) | Model tıklamadan öğrenir: sonuç yukarı çıkar, sürüm ilerler, puanın bileşenleri görünür                       |
| İki belgesel izleyin, ana sayfaya dönün                                    | "‹Ad› için En İyi Seçimler" ve eşleşme yüzdeleri kişiselleşir; "… adlı içeriği izlediğin için" satırı gelir   |
| **Sintel** ya da **Tears of Steel** oynatın                                | Oynatma hattı: ağ yoklaması → anahtar sağlama → lisanslı manifest → ayrı ses/video bayt aralıkları → TTML     |
| Oynarken **CDN** sekmesinde bant genişliğini kısın / düğümü kapatın        | Bit hızı kademe kademe düşer; oynatıcı diğer düğüme geçer, yayın kesilmez                                     |
| Canlı TV → **TV+ Sinema** → Baştan Başlat; Rehber'de bir programa Hatırlat | Katalogdan kurulan doğrusal kanal; yayın rehberi ve hatırlatma bildirimi                                      |
| Stüdyo → **Tahmin Modeli**                                                 | Model kartı, tabanlarla karşılaştırmalı ölçümler, **Eğit**, izleyici simülatörü ve tahminin açıklaması        |
| Stüdyo → **Etiketleme**: bir başlığa fiş gönderip onaylayın                | Dayanak "Uzlaşı"ya döner; o başlığın mikro türleri ve gömme vektörü değişir                                   |

## İçerik zekâsı ve modeller

Tam şartname: [`docs/ICERIK_ZEKASI.md`](docs/ICERIK_ZEKASI.md). Hepsi **Stüdyo**'dan (`/#/studyo`) izlenir.

| Parça                    | Ne yapar                                                                                                             | Belge / yer                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Etiketleme               | 16 ölçek (0–5; cinsellik, şiddet, kan, romantizm, **sonun netliği**…) ve 8 yüz; fişler, uzlaşı                       | [`docs/ETIKETLEME_KILAVUZU.md`](docs/ETIKETLEME_KILAVUZU.md) |
| Mikro türler             | Çekirdek tür + sıfat, köken, dönem, mekân, konu, yaş, kişi → dar kategoriler; görünen / görünmeyen katman            | `server/src/services/microgenres`                            |
| İzleme verisi + Mixpanel | Kaynaktan bağımsız olay deposu; Mixpanel dışa aktarımını eşleme dosyasıyla okur; takma kimlik, yinelenme koruması    | [`docs/MIXPANEL.md`](docs/MIXPANEL.md)                       |
| Zevk toplulukları        | İzleyicileri ne izlediklerine göre kümeler                                                                           | `server/src/services/audience`                               |
| İçgörüler, planlayıcı    | Katalog payı ↔ izlenme payı, verim, zaman çizelgesi; veri + editör yargısı + maliyetle karma önerisi                 | `server/src/services/insights`                               |
| **Tahmin modeli**        | Örtük geri bildirimli ALS + içerik kulesi + lojistik sıralayıcı; sunucu içinde eğitilir                              | `server/src/services/predictions`                            |
| **Çekim gömme modeli**   | Dondurulmuş görüntü / ses / metin kodlayıcıları üstünde eğitilen kaynaştırma dönüştürücüsü (maskeli çekim modelleme) | [`ml/README.md`](ml/README.md), `content/models/`            |
| Arama tahmin modeli      | Çevrimiçi öğrenen lojistik model: sıralama, tamamlama, tahmini sonuçlar                                              | `server/src/services/search/model`                           |

**Modeller hakkında açık notlar**

- Tahmin modeli gerçek bir eğitim ve değerlendirme hattıdır (zamana göre ayrılmış sınama, karşılaştırma tabanları,
  soğuk başlangıç). Bugünkü ölçümler **sentetik örnek** üzerindedir ve öyle etiketlenir; gerçek sonuçlar Mixpanel
  verisi bağlandığında aynı hattan çıkar. Örnek veride model popülerlik tabanını yaklaşık iki kat, tür yakınlığı
  tabanını küçük bir farkla geçer (sentetik üreteç izleyicileri doğrudan türlerden kurduğu için o taban avantajlıdır).
- Çekim gömme modeli **küçük ama gerçekten eğitilmiş** bir modeldir: 13 açık lisanslı yapımın yaklaşık 1.200 gerçek
  çekimiyle, tek bir CPU'da eğitilir. Başlığa göre ayrılmış değerlendirmede "en yakın komşuyu kopyala" tabanını geçer,
  "iki komşunun ortalaması" tabanıyla berabere kalır; özet ve etiket bağlamı bu ölçekte ölçülebilir fark yaratmaz.
  Mimarinin ve eğitim hattının çalışan bir örneğidir; bir temel model değildir. Vektörleri depoda durur
  (`content/models/mediafm-mini/`) ve sunucu bunları kendiliğinden kullanır; Python yalnız yeniden eğitmek ya da canlı
  model sunucusu çalıştırmak için gerekir.
- Depodaki etiket fişleri **örnek**tir (yapım izlenmeden, özetten doldurulmuştur). Etiketleyicilerin Stüdyo'dan
  gönderip onaylattığı fişler bunların önüne geçer.

**Gerçek veriyi bağlamak** (özet; ayrıntı `docs/ICERIK_ZEKASI.md` §12 ve `docs/MIXPANEL.md`):

1. Katalog `content/titles/*.json` biçimine alınır; analitik sistemdeki içerik kimliği `externalIds.mixpanel` alanına yazılır.
2. `content/analytics/mixpanel-mapping.json` içinde kendi olay ve özellik adlarınız eşlenir.
3. Bir günlük dışa aktarımla denenir, rapordaki eşlenmeyen olaylar ve bulunamayan içerikler kapatılır:

```bash
npm run mixpanel:import -- --file disa-aktarim.jsonl.gz --dry-run
```

4. Servis hesabı ortam değişkenleriyle verilir (`MIXPANEL_SERVICE_ACCOUNT_USERNAME`, `MIXPANEL_SERVICE_ACCOUNT_SECRET`,
   `MIXPANEL_PROJECT_ID`, `MIXPANEL_REGION`) ve tarih aralığı çekilir. Gerçek veri 50 izleyiciyi geçince sentetik örnek
   analiz dışı kalır; topluluklar ve tahmin modeli kendiliğinden yeniden hesaplanır.

## Netflix → TV+ eşlemesi (özet)

| Netflix                                     | Burada                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| GraphQL, kalıcı sorgular                    | `POST /graphql` — ham sorgu reddedilir                                             |
| Shakti / Falcor `pathEvaluator`             | `POST /api/member/pathEvaluator` — ana sayfa satırları (JSON Graph)                |
| Arama, yetenek pazarlığı, `expires`         | `searchPage` — bölüm bazında yaşam süresi; tahmini bölüm yetenekle gelir           |
| `MiniModalQuery` satır ön yüklemesi         | Önizleme kartı                                                                     |
| FTL yoklaması (4 uç, 3 darbe)               | `GET /api/ftl/probe` + 4 sanal CDN düğümü                                          |
| MSL / ALE                                   | ECDH P-256 + AES-GCM zarf, mastertoken, tekrar koruması                            |
| `licensedManifest` + vitrin ön hazırlığı    | `POST /msl/v1/playapi/licensedManifest`                                            |
| Open Connect, imzalı bayt-aralığı adresleri | `/oca/:düğüm/range/:a-:b?o=&v=&e=&t=`                                              |
| Cadmium oynatıcı (MSE, ABR, TTML)           | `web/src/player` — kendi MSE motoru + YouTube adaptörü; web, mobil, TV denetimleri |
| Ichnaea olay günlüğü                        | `POST /log/web/cl/1` → izleme verisi deposuna da akar                              |
| Uzun yoklamalı bildirim                     | `GET /push`                                                                        |
| Çerez zinciri, Passport, ESN                | `TvpId` / `SecureTvpId` / `tvpvdid`, `req.passport`, `TVPW…` cihaz no.             |
| Görsel API, imzalı adres                    | `/img/v1/<tip>/<en>x<boy>/<varlık>.webp?r=`                                        |
| Lolomo + `tctx`                             | Aynı; mikro tür ve zevk topluluğu satırlarıyla                                     |
| Etiketler → mikro türler → kişisel satırlar | Etiketleme, mikro tür üreteci, tahmin modeli, keşif bütünleşmesi                   |
| Envoy + B3 izleme                           | Her yanıtta `x-b3-traceid`                                                         |

## İçerik nereden geliyor, nasıl ekleniyor

İçerik koddan ayrıdır: `content/` altındaki JSON dosyaları. Şema: [`shared/content-schema.ts`](shared/content-schema.ts).
Bir başlığın bir ya da birden çok **kaynağı** olur; oynatma servisi istemcinin yeteneklerine göre birini seçer.

| Kaynak türü    | Nasıl taşınır                                                                                       | Örnek                           |
| -------------- | --------------------------------------------------------------------------------------------------- | ------------------------------- |
| `DASH`         | Kendi CDN hattımız: uzak açık kökenden bayt aralığıyla, çok bit hızlı, ayrı ses/video, TTML altyazı | Sintel, Tears of Steel (CC BY)  |
| `PACKAGED`     | Kendi CDN hattımız: yerelde `ffmpeg` ile paketlenmiş dosyalar                                       | kendi videonuz                  |
| `PROGRESSIVE`  | Tek dosya; tarayıcının kendi aralık istekleri, yine imzalı adres üzerinden                          | archive.org kamu malı klasikler |
| `YOUTUBE`      | YouTube resmî gömme oynatıcısı (IFrame Player API)                                                  | Blender filmleri, belgeseller   |
| `YOUTUBE_LIVE` | Bir YouTube kanalının canlı yayını                                                                  | haber kanalları                 |
| `LINEAR`       | Katalog videolarından döngüyle kurulan doğrusal kanal                                               | TV+ Sinema                      |

`content/` altında ayrıca: `tagging/` (sözlük ve örnek etiket fişleri), `shots/` (çekim çözümlemeleri),
`models/` (eğitilmiş modelin vektörleri), `analytics/` (Mixpanel eşlemesi ve küçük bir örnek dışa aktarım).

Yeni içerik eklemenin üç yolu:

```bash
npm run ingest:youtube -- --channel UCxxxxxxxxxxxxxxxxxxxxxx
```

```bash
npx tsx scripts/ingest-archive.ts --id <archive.org kimliği>
```

```bash
npm run package:title -- --input film.mp4 --id film-adi --lang tr
```

Her değişiklikten sonra (içerik ve etiket fişleri birlikte doğrulanır):

```bash
npm run validate:content
```

**TV+'ın kendi içeriği yok.** TV+ yayınları DRM korumalı ve yalnız TV+ uygulamalarında izlenmek üzere lisanslıdır;
abonelikle başka bir uygulamaya çekilmez. Resmî TV+ oynatma API'sine erişim olursa aynı kaynak adaptörü noktasına
(`server/src/services/playback/sources`, `web/src/player/adapters`) yeni bir kaynak türü olarak bağlanır.

## Komutlar

| Komut                      | Ne yapar                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `npm run dev`              | Vite (5173) + API/CDN sunucusu (8787)                                                  |
| `npm run build`            | Kalıcı sorgu kayıt defteri + web derlemesi                                             |
| `npm start`                | Tek kapı sunucusu (8787); `web/dist` varsa onu sunar                                   |
| `npm run check`            | Kalıcı sorgular + tip denetimi + içerik ve etiket doğrulama + birim/bütünleşik testler |
| `npm run e2e`              | Derler; Playwright ile gerçek tarayıcıda web, mobil ve TV turları (ağ gerekir)         |
| `npm run test:perf`        | Ölçek testleri (kümeleme, tahmin modeli, mikro tür üretimi) — yük altında yanıltıcıdır |
| `npm run persisted`        | `shared/graphql/operations` → kimlikli kayıt defteri; şemaya karşı doğrular            |
| `npm run validate:content` | `content/` şema ve çapraz başvuru denetimi + etiket fişleri                            |
| `npm run tagging:guide`    | Sözlükten etiketleme kılavuzunu üretir                                                 |
| `npm run mixpanel:import`  | Mixpanel dışa aktarımını içe alır (`--file` ya da `--from/--to`, `--dry-run`)          |
| `npm run sample:viewing`   | Sentetik izleme örneği üretir (Mixpanel biçiminde)                                     |
| `npm run analyze:shots`    | Çekim çözümlemesi (ffmpeg gerekir; çıktılar depodadır, sunucu ffmpeg istemez)          |
| `npm run embed:catalog`    | Gömme vektörlerini kurar / dışa aktarır                                                |
| `npm run ingest:youtube`   | YouTube doğrulama / iskelet üretimi                                                    |
| `npm run package:title`    | Yerel videoyu CDN hattı için paketler (ffmpeg gerekir)                                 |
| `npm run format`           | Prettier                                                                               |

Ortam değişkenleri: `PORT`, `HOST` (varsayılan `127.0.0.1`), `TVP_DATA_DIR` (durum, önbellekler, eğitilmiş tahmin modeli;
varsayılan `.data/`), `TVP_MEDIA_DIR`, `TVP_SECRET`, `TVP_OFFLINE=1` (dış ağa çıkma), `TVP_LOG_LEVEL`,
`TVP_DEBUG=member|open|off` (hata ayıklama uçları), `TVP_STUDIO=member|open|off` ve `TVP_STUDIO_KEY` (stüdyo uçları;
anahtar betikler içindir), `TVP_SAMPLE_VIEWING=0` (sentetik örneği üretme), `TVP_REAL_DATA_MIN_VIEWERS` (varsayılan 50),
`TVP_MAX_COMMUNITIES`, `TVP_EMBEDDING_PROVIDER=taban|http|dosya` ve `TVP_EMBEDDING_URL`, `TVP_PUBLIC_ORIGIN` (QR adresi),
`MIXPANEL_*` (yukarıda).

## Klasörler

```
shared/    istemci–sunucu sözleşmesi: GraphQL şeması + kalıcı sorgular, oynatma hattı, cihazlar, içerik zekâsı türleri
server/    tek kapı (Fastify) + servisler: kimlik, katalog, yetki, yayın akışı, keşif, arama (+ tahmin modeli),
           oynatma, CDN düğümleri, altyazı, görsel, olaylar, bildirimler, cihazlar; etiketleme, mikro türler,
           izleme verisi, Mixpanel, zevk toplulukları, içgörüler, gömme, tahmin modeli; GraphQL ve Falcor motorları
web/       SPA: tasarım sistemi (ui), web ve mobil kabuk (app), sayfalar (features), TV uygulaması (tv),
           oynatıcı (player), cihaz istemcisi (devices), kaputun altı paneli (devtools)
ml/        çekim gömme modelinin eğitimi (Python / PyTorch): veri hattı, kodlayıcılar, eğitim, değerlendirme, dışa aktarma
content/   başlıklar, kanallar, örnek yayın akışı, koleksiyonlar, etiketleme, çekimler, eğitilmiş vektörler
scripts/   kalıcı sorgu derleyici, içerik doğrulama, içe alma, paketleme, çekim çözümleme, Mixpanel araçları
e2e/       gerçek tarayıcı testleri (web, mobil, TV, cihazlar arası, stüdyo)
docs/      UX şartnamesi, mimari, içerik zekâsı, etiketleme kılavuzu, Mixpanel rehberi, başvuru belgeleri
```

## Bilinen sınırlar

- **DRM yok.** Lisanslı manifest gerçek bir erişim izni ve imzalı adresler üretir; Widevine/FairPlay/PlayReady takılmamıştır.
- **CDN düğümleri benzetimdir**: dört düğüm aynı sunucuda yol önekidir; gecikme, bant genişliği ve arıza yapay olarak verilir.
- **YouTube içerikleri** YouTube'un kendi oynatıcısıyla oynar: süre ve kalite YouTube'undur, bizim denetimlerimiz çerçevenin
  üstüne binmez. Bir video kaldırılır ya da gömmeye kapatılırsa oynatıcı bunu bildirir;
  `npm run ingest:youtube -- --check` hepsini yeniden doğrular.
- **Örnek veriler:** yayın akışları (TV+ Sinema hariç), izleme verisi (sentetik) ve etiket fişleri örnektir. Ölçümler
  ve topluluklar bu yüzden bir gösterimdir; gerçek veriyle yeniden hesaplanır.
- **Mixpanel'e bu depodan bağlanılmadı.** Bağdaştırıcı belgelenen dışa aktarım biçimine göre yazıldı, aynı biçimde
  üretilen veriyle ve sahte bir dışa aktarım sunucusuyla sınandı; gerçek proje ve kimlik bilgileriyle denenmedi.
- **TV uygulaması** masaüstü tarayıcıda 1920×1080 ve 1280×720'de klavyeyle sınandı; gerçek TV tarayıcılarının tuş
  kodları eşlendi ama gerçek cihazda denenmedi.
- **Cihazlar arası akış** tek sunucuya bağlı tarayıcılar arasındadır (SSE + komut ucu); Chromecast/AirPlay gibi
  protokoller kullanılmaz.
- Kalıcı durum `.data/` altında dosyalardır; izleme deposu ve vektör dizini bellek içidir. Çok kullanıcılı gerçek bir
  kurulum için veritabanı / veri ambarı / yaklaşık en yakın komşu dizini gerekir (ilgili belgelerde yazılıdır).
- Stüdyo erişimi üye oturumu ya da tek bir anahtarladır; gerçek kurulumda rol tabanlı yetki gerekir.
- Mağaza akışı yoktur; "Sinema Paketi" yalnız yetki modelini göstermek içindir.
