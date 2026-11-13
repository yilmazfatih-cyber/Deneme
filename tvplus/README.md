# TV+ — Netflix mekanikleriyle sıfırdan

Netflix web uygulamasının ağ trafiğinden çıkarılmış mimarisini
([`docs/referans/netflix-system-design-reverse-engineered.md`](docs/referans/netflix-system-design-reverse-engineered.md))
**aynı mekaniklerle** TV+ için sıfırdan kuran, çalışan bir akış uygulaması. Görünüm ve ürün kuralları TV+ yeniden
tasarım prototipinin şartnamesinden gelir ([`docs/referans/DESIGN_SPEC.md`](docs/referans/DESIGN_SPEC.md)).

İki amacı var: gerçekten içerik oynatan bir uygulama olmak ve **her mekaniğin nasıl işlediğini ekranda göstermek**
("Kaputun altı" paneli).

> **Gerçek TV+ değildir.** Gerçek hesap, ödeme ya da kişisel veri toplamaz; TV+'ın yayınlarını taşımaz; DRM uygulamaz.
> İçerik: YouTube resmî gömmeleri, açık lisanslı filmler (kendi CDN hattımızdan) ve kamu malı klasikler.
> Gerçek kanalların yayın akışları **örnek veridir**.

## Çalıştırma

Gereken: Node.js ≥ 22.12 ve npm.

```bash
cd tvplus
npm install
npm run dev
```

`http://localhost:5173` adresini açın → **Demo hesabıyla devam et** → bir profil seçin.

Tek kapıdan (derlenmiş) çalıştırmak için:

```bash
npm run build
npm start
```

Bu kipte her şey `http://localhost:8787` üzerindedir ve sunucu ilk HTML'e açılış bağlamını gömer.
Telefondan denemek için `HOST=0.0.0.0 npm start` (oynatma hattının şifreli zarfı güvenli bağlam ister; düz `http://<ip>`
adresinde otomatik olarak şifresiz geliştirme şemasına düşer).

## Ne denenir: mekanikleri görmek için kısa tur

Sağ alttaki **Kaputun altı** düğmesi (ya da `Ctrl+.`) her adımı canlı gösterir.

| Ne yapın                                                                          | Ne görürsünüz                                                                                                 |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Film & Dizi ana sayfasını açın, satırları kaydırın                                | **API** sekmesi: satırlar eski sistemden (Falcor yolları, toplu istek, önbellek) gelir                        |
| Bir afişin üzerinde bekleyin                                                      | Satırın **tamamı** için tek `MiniModalQuery`; yandaki karta geçince yeni istek yok                            |
| Bir başlığın detayını açın                                                        | Yeni sistem: kalıcı sorgu — sorgu metni hiç gitmez, yalnız kimlik + sürüm                                     |
| **Sintel** ya da **Tears of Steel** oynatın                                       | **Oynatma hattı**: ağ yoklaması → anahtar sağlama → lisanslı manifest → ayrı ses/video bayt aralıkları → TTML |
| Oynarken **CDN** sekmesinde bant genişliğini kısın                                | Bit hızı kademe kademe düşer (uyarlamalı akış)                                                                |
| Oynarken etkin düğümü kapatın                                                     | Oynatıcı diğer düğüme geçer, yayın kesilmez                                                                   |
| Oynatıcıda **Kaynak** menüsünden YouTube'u seçin                                  | Aynı başlık bu kez YouTube'un kendi oynatıcısıyla; bizim bayt-aralığı trafiğimiz yok                          |
| Canlı TV → **TV+ Sinema** → Baştan başlat                                         | Katalog videolarından kurulan doğrusal kanal: yayına katılma konumu, baştan başlatma, geri alma               |
| Arama: `sintel`, `sitnel`, `trt`; sonra **Yetenek bildirimi**nden Kanal'ı kapatın | Yazım düzeltmesi; istemci çizemediğini söylediği türü sunucu hiç yollamaz; aynı aramaya dönüş istek atmaz     |
| Avatar menüsünden **Çocuk** profiline geçin                                       | Kimlik her istekte çerezden çözülür; satırlar, kanallar ve arama yaşa göre süzülür                            |

## Netflix → TV+ eşlemesi (özet)

| Netflix                                     | Burada                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| GraphQL, kalıcı sorgular                    | `POST /graphql` — ham sorgu reddedilir                                 |
| Shakti / Falcor `pathEvaluator`             | `POST /api/member/pathEvaluator` — ana sayfa satırları (JSON Graph)    |
| Arama, yetenek pazarlığı, `expires`         | `searchPage` — bölüm bazında yaşam süresi                              |
| `MiniModalQuery` satır ön yüklemesi         | Önizleme kartı                                                         |
| FTL yoklaması (4 uç, 3 darbe)               | `GET /api/ftl/probe` + 4 sanal CDN düğümü                              |
| MSL / ALE                                   | ECDH P-256 + AES-GCM zarf, mastertoken, tekrar koruması                |
| `licensedManifest` + vitrin ön hazırlığı    | `POST /msl/v1/playapi/licensedManifest`                                |
| Open Connect, imzalı bayt-aralığı adresleri | `/oca/:düğüm/range/:a-:b?o=&v=&e=&t=`                                  |
| Cadmium oynatıcı (MSE, ABR, TTML)           | `web/src/player` — kendi MSE motoru + YouTube adaptörü                 |
| Ichnaea olay günlüğü                        | `POST /log/web/cl/1`                                                   |
| Uzun yoklamalı bildirim                     | `GET /push`                                                            |
| Çerez zinciri, Passport, ESN                | `TvpId` / `SecureTvpId` / `tvpvdid`, `req.passport`, `TVPW…` cihaz no. |
| Görsel API, imzalı adres                    | `/img/v1/<tip>/<en>x<boy>/<varlık>.webp?r=`                            |
| Lolomo + `tctx`                             | Aynı                                                                   |
| Envoy + B3 izleme                           | Her yanıtta `x-b3-traceid`                                             |

Ayrıntı, sözleşmeler ve klasör sahipliği: [`docs/MIMARI.md`](docs/MIMARI.md).

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

Yeni içerik eklemenin üç yolu:

```bash
npm run ingest:youtube -- --channel UCxxxxxxxxxxxxxxxxxxxxxx
```

Kanalın son videolarını `content/titles/` içine yapıştırılabilir iskeletler olarak yazdırır.

```bash
npx tsx scripts/ingest-archive.ts --id <archive.org kimliği>
```

Kamu malı bir filmi tek dosyalı kaynak olarak iskeletler.

```bash
npm run package:title -- --input film.mp4 --id film-adi --lang tr
```

Kendi videonuzu bit hızı merdiveni + bayt aralığı diziniyle paketler (`media/packaged/<id>/`); başlığa
`{ "type": "PACKAGED", "id": "film-adi" }` kaynağı ekleyin.

Her değişiklikten sonra:

```bash
npm run validate:content
```

```bash
npm run ingest:youtube -- --check
```

İkincisi tüm YouTube videolarını ve canlı kanalları YouTube'un oEmbed ucuyla doğrular (var mı, gömülebilir mi).

**TV+'ın kendi içeriği yok.** TV+ yayınları DRM korumalı ve yalnız TV+ uygulamalarında izlenmek üzere lisanslıdır;
abonelikle başka bir uygulamaya çekilmez. Resmî TV+ oynatma API'sine erişim olursa aynı kaynak adaptörü noktasına
(`server/src/services/playback/sources`, `web/src/player/adapters`) yeni bir kaynak türü olarak bağlanır.

## Komutlar

| Komut                      | Ne yapar                                                                     |
| -------------------------- | ---------------------------------------------------------------------------- |
| `npm run dev`              | Vite (5173) + API/CDN sunucusu (8787)                                        |
| `npm run build`            | Kalıcı sorgu kayıt defteri + web derlemesi                                   |
| `npm start`                | Tek kapı sunucusu (8787); `web/dist` varsa onu sunar                         |
| `npm run check`            | Kalıcı sorgular + tip denetimi + içerik doğrulama + birim/bütünleşik testler |
| `npm run e2e`              | Derler; Playwright ile gerçek tarayıcıda uçtan uca tur (ağ gerekir)          |
| `npm run persisted`        | `shared/graphql/operations` → kimlikli kayıt defteri; şemaya karşı doğrular  |
| `npm run validate:content` | `content/` şema ve çapraz başvuru denetimi                                   |
| `npm run ingest:youtube`   | YouTube doğrulama / iskelet üretimi                                          |
| `npm run package:title`    | Yerel videoyu CDN hattı için paketler (ffmpeg gerekir)                       |
| `npm run format`           | Prettier                                                                     |

Ortam değişkenleri: `PORT`, `HOST` (varsayılan `127.0.0.1`), `TVP_DATA_DIR` (durum ve önbellekler; varsayılan `.data/`),
`TVP_MEDIA_DIR`, `TVP_SECRET`, `TVP_OFFLINE=1` (dış ağa çıkma), `TVP_DEBUG=member|open|off` (hata ayıklama uçları;
varsayılan yalnız giriş yapmış üye), `TVP_LOG_LEVEL`.

## Klasörler

```
shared/    istemci–sunucu sözleşmesi: GraphQL şeması + kalıcı sorgular, oynatma hattı biçimleri, içerik şeması
server/    tek kapı (Fastify) + servisler: kimlik, katalog, yetki, yayın akışı, keşif, arama, oynatma, CDN düğümleri,
           altyazı, görsel, olaylar, bildirimler; GraphQL ve Falcor motorları
web/       SPA: tasarım sistemi, kabuk, keşif ekranları, canlı TV, rehber, arama, oynatıcı, kaputun altı paneli
content/   başlıklar, kanallar, örnek yayın akışı, koleksiyonlar, ana sayfa düzeni, altyazılar
scripts/   kalıcı sorgu derleyici, içerik doğrulama, içe alma ve paketleme araçları
e2e/       gerçek tarayıcı testleri
docs/      mimari belgesi ve başvuru belgeleri
```

## Bilinen sınırlar

- **DRM yok.** Lisanslı manifest gerçek bir erişim izni ve imzalı adresler üretir; Widevine/FairPlay/PlayReady takılmamıştır.
- **CDN düğümleri benzetimdir**: dört düğüm aynı sunucuda yol önekidir; gecikme, bant genişliği ve arıza yapay olarak verilir.
- **YouTube içerikleri** YouTube'un kendi oynatıcısıyla oynar: süre ve kalite YouTube'undur, bizim kontrollerimiz çerçevenin
  üstüne binmez, süre bilgisi ilk oynatmada öğrenilir. Bir video kaldırılır ya da gömmeye kapatılırsa oynatıcı bunu bildirir;
  `npm run ingest:youtube -- --check` hepsini yeniden doğrular.
- **Yayın akışları örnektir** (TV+ Sinema'nınki hariç; o, çalma listesinden üretilir).
- Kalıcı durum `.data/` altında JSON dosyalarıdır; çok kullanıcılı gerçek bir kurulum için veritabanı gerekir.
- Mağaza akışı yoktur; "Sinema Paketi" yalnız yetki modelini göstermek içindir.
