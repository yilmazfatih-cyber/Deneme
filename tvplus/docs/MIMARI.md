# TV+ — Mimari ve ekip sözleşmesi

Bu uygulama, Netflix web uygulamasının ağ trafiğinden çıkarılmış mimarisini
([`referans/netflix-system-design-reverse-engineered.md`](referans/netflix-system-design-reverse-engineered.md))
**aynı mekaniklerle** TV+ için sıfırdan kurar. Görünüm ve ürün kuralları
[`referans/DESIGN_SPEC.md`](referans/DESIGN_SPEC.md) ile [`referans/netflix_patterns.md`](referans/netflix_patterns.md)
belgelerinden gelir. Amaç iki yönlüdür: çalışan bir akış uygulaması **ve** her mekaniğin nasıl işlediğini
ekranda gösteren bir öğretici ("Kaputun altı" paneli).

Gerçek TV+ değildir: gerçek hesap/ödeme/kimlik bilgisi toplamaz, TV+'ın yayınlarını taşımaz, DRM uygulamaz.
İçerik: YouTube resmî gömmeleri + açık lisanslı filmler (kendi CDN hattımızdan) + kamu malı klasikler.

## 1. Netflix → TV+ mekanik eşlemesi

| Netflix (gözlenen)                                           | TV+ (bu depo)                                                                   | Kod                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Akira SPA · Hawkins tasarım sistemi                          | `anka` SPA · `cini` tasarım sistemi (DESIGN_SPEC tokenları)                     | `web/src/app`, `web/src/design`                        |
| Envoy kapısı, B3 izleme (`x-b3-traceid`)                     | Tek kapı (Fastify), her yanıtta B3 başlıkları                                   | `server/src/gateway`                                   |
| GraphQL, **kalıcı sorgular** (kimlik + sürüm)                | `POST /graphql`, ham sorgu reddedilir                                           | `server/src/graphql`, `shared/graphql`                 |
| Shakti / **Falcor** `pathEvaluator` (JSON Graph)             | `POST /api/member/pathEvaluator` — Film & Dizi ana sayfa satırları (lolomo)     | `server/src/falcor`, `web/src/api/falcor.ts`           |
| İki API yan yana (geçiş hâli)                                | Eski: lolomo satırları (Falcor) · Yeni: detay, önizleme, arama, canlı (GraphQL) | —                                                      |
| Pinot arama, **yetenek pazarlığı**, `expires`                | `searchPage` — istemci çizebildiği varlık türlerini bildirir; bölüm bazında TTL | `server/src/services/search`                           |
| `MiniModalQuery` — satırın tamamını ön yükler                | Aynı ad; karta gelince tüm satır tek istekte                                    | `web/src/features/preview`                             |
| `DetailModal` veri modeli                                    | Aynı alanlar + `access` (yetki) + RTÜK akıllı işaretleri                        | `shared/graphql/schema.graphql`                        |
| FTL yoklaması: 4 uç yarışır, darbeler `[0,2000,70000]`       | `GET /api/ftl/probe` → 4 CDN düğümü yarışır, sonuç manifest sıralamasına gider  | `server/src/services/ftl`, `web/src/player/net/ftl.ts` |
| MSL / ALE anahtar sağlama, şifreli zarf                      | ECDH P-256 + AES-GCM zarf, mastertoken, tekrar koruması                         | `server/src/services/playback/msl.ts`                  |
| `licensedManifest` + **vitrin ön hazırlığı** (prefetch)      | `POST /msl/v1/playapi/licensedManifest?reqName=prefetch/licensedManifest`       | `server/src/services/playback`                         |
| Open Connect: imzalı adres, **bayt-aralığı**, ayrı ses/video | `/oca/:node/range/:a-:b?o=&v=&e=&t=` — 4 sanal düğüm, yük devri                 | `server/src/services/oca`                              |
| Cadmium oynatıcı: MSE, ABR, ses parçası, TTML                | `kehribar` oynatıcı: kendi MSE motoru + YouTube adaptörü                        | `web/src/player`                                       |
| TTML altyazı, `tickRate=10000000`                            | Altyazı servisi VTT/TTML kaynağını tik tabanlı TTML'e çevirir                   | `server/src/services/subtitles`                        |
| Ichnaea olay günlüğü, hız sınırı başlığı                     | `POST /log/web/cl/1`, `x-tvplus-izci: ~0=true~RL=<kalan>`                       | `server/src/services/events`, `web/src/telemetry`      |
| `notifications.netflix.com/push` uzun yoklama                | `GET /push?cursor=&wait=`                                                       | `server/src/services/notifications`                    |
| Çerez zinciri (`NetflixId`, `SecureNetflixId`, `nfvdid`)     | `TvpId`, `SecureTvpId`, `tvpvdid`, `tvpProfilesNewSession`                      | `server/src/services/identity`                         |
| Passport (profil GUID her istekte çözülür)                   | `req.passport`; yanıtta `x-tvplus-passport-profileguid`                         | `server/src/services/identity`                         |
| ESN `NFCDCH-MC-…`                                            | `TVPWCH-MC-…` (TV+ Web · tarayıcı · platform · cihaz özeti)                     | `server/src/services/identity/esn.ts`                  |
| Görsel API `/dnm/api/v6/`, imzalı `r=`                       | `/img/v1/<tip>/<en>x<boy>/<varlık>.webp?r=`                                     | `server/src/services/image`, `kernel/imageUrls.ts`     |
| Lolomo + `tctx` konum izleme                                 | Aynı; `shared/tctx.ts`                                                          | `server/src/services/discovery`                        |
| `reactContext` (sunucunun HTML'e gömdüğü bağlam)             | `<script id="tvp-boot">` + `GET /api/boot`                                      | `server/src/gateway/shell.ts`                          |

TV+'a özgü ekler (netflix_patterns.md §2): **Geçiş** (Canlı TV / Film & Dizi), `Channel` + `ProgramAiring`
(şimdi/sonraki, baştan başlat, geri al), `access` (yetki; "pakette yok" tam ekran hata değildir), çocuk profili.

## 2. Çalışma biçimleri

- Geliştirme: `npm run dev` → Vite 5173 (SPA) + Node 8787 (API/CDN); Vite API yollarını 8787'ye aktarır.
- Tek kapı: `npm run build && npm start` → 8787 her şeyi verir; HTML'e açılış bağlamı gömülür.
- OCA düğümleri **aynı kökte yol önekidir** (`/oca/c101-ist001-ix/…`); ayrı kapı/alan adı yoktur. Manifestteki tüm
  adresler **köke görelidir** — uygulama hangi ana makineden açılırsa açılsın çalışır.
- Dış ağ: uzak kaynak okuyan her sunucu kodu `undici` `EnvHttpProxyAgent` kullanır (HTTPS_PROXY'ye uyar),
  3–8 sn zaman aşımı koyar, hata/çevrimdışı durumunda yedeğe düşer; `config.offline` iken ağa hiç çıkmaz.

## 3. Klasörler ve sahiplik (her yolun tek yazarı var; başkasının dosyasına dokunulmaz)

| Yol                                                                                                                                       | Sahibi                |
| ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `shared/**` (sözleşme), `server/src/kernel/**`, `server/src/app.ts`, kök yapılandırma, `docs/**`                                          | mimar (ana oturum)    |
| `server/src/gateway/**`, `services/{identity,events,notifications,debug}/**`, `graphql/{plugin,engine}*.ts`, `falcor/{plugin,engine}*.ts` | **çekirdek API**      |
| `services/{catalog,entitlement,epg,progress,discovery,search}/**`, `graphql/resolvers/**`, `falcor/routes/**`                             | **alan servisleri**   |
| `services/{playback,oca,ftl,subtitles}/**`, `scripts/package-title.ts`                                                                    | **oynatma düzlemi**   |
| `services/image/**`, `scripts/{validate-content,ingest-youtube,ingest-archive}.ts`                                                        | **içerik hattı**      |
| `web/src/{app,design,features/{welcome,profiles,home,detail,preview,library,browse}}/**`, `web/src/api/falcor.ts`                         | **web temel + keşif** |
| `web/src/player/**`                                                                                                                       | **oynatıcı**          |
| `web/src/features/{live,guide,search}/**`                                                                                                 | **canlı + arama**     |
| `web/src/devtools/**`, `web/src/features/notifications/**`                                                                                | **kaputun altı**      |
| `content/**`                                                                                                                              | içerik ekibi (Haiku)  |
| `server/test/<alan>*.test.ts`, `web/src/**/*.test.ts`                                                                                     | ilgili alanın sahibi  |

Sözleşmede (`shared/`, `kernel/`) eksik/yanlış bulan ajan dosyayı değiştirmez; raporunda **"SÖZLEŞME:"** başlığıyla
somut öneri yazar ve kendi tarafında en makul varsayımla ilerler. Tek istisna: `kernel/services.ts` içinde her ajan
**kendi** servis arayüzüne yöntem ekleyebilir; `shared/graphql/operations/*.graphql` dosyalarını o sorguyu kullanan
web ajanı düzenleyebilir (şema değişmez; `npm run persisted` doğrular).

## 4. Sunucu kuralları

- Eklenti = `export default async function plugin(app: FastifyInstance)`; `app.ts` hepsini aynı örneğe sırayla uygular.
  Eklenti kendi servisini `app.services.<ad> = …` ile kaydeder ve uçlarını ekler. Başka servise yalnızca **istek anında**
  ve `kernel/services.ts` arayüzünden erişilir.
- `req.trace` (B3) ve `req.passport` (kimlik) her istekte hazırdır (çekirdek API kancaları).
- Gizli anahtarlar `deriveKey(config, '<etiket>')` ile türetilir; koda sabit anahtar yazılmaz.
- Kalıcı durum `createStore(config, '<ad>', başlangıç)` ile `.data/<ad>.json` altında tutulur.
- Hata gövdesi: REST `{ error: { code, message, traceId } }` · GraphQL `{ errors: [{ message, extensions: { code } }] }`.
- Testler `server/test/*.test.ts`, `createTestApp()` + `app.inject()`; dış ağ yok (`config.offline`), sabit anahtar.
- TypeScript katı kipte; `any`, `enum`, parametre özelliği (`constructor(private x)`) yok (`erasableSyntaxOnly`).
  İçe aktarmalar uzantısız ve görelidir. Yorumlar ve kullanıcıya görünen metinler Türkçedir.

## 5. GraphQL (yeni sistem)

- İstek: `{ operationName, variables, extensions: { persistedQuery: { id, version } } }`. `query` alanı gelirse ya da
  kimlik bilinmiyorsa `400` + `extensions.code`: `RAW_QUERY_NOT_ALLOWED` | `PERSISTED_QUERY_NOT_FOUND` |
  `PERSISTED_QUERY_VERSION_MISMATCH`. Mutasyonlar geçerli `x-tvplus-authurl` ister (`CSRF_FAILED`).
  Üyelik gerektiren alanlar anonimde `UNAUTHENTICATED`, profil seçilmemişse `PROFILE_REQUIRED` döner
  (`membershipStatus` ve `interstitial` anonimde de çalışır).
- Kayıt defteri: `npm run persisted` → `shared/graphql/persisted.{server,client}.json` (üretilmiş dosyalar; elle düzenlenmez).
- Çözümleyiciler `server/src/graphql/resolvers/index.ts` içinden `resolvers: ResolverMap` olarak dışa aktarılır;
  motor bunları `buildSchema` ile kurulan şemaya uygular (`Video`, `SearchSection`, `RowEntity` için `__resolveType`).
  `index.ts`, `./search.ts` içindeki `searchResolvers` haritasını (arama ajanının) birleştirir.
- **Üst nesne (parent) kuralı** — bir alan bir varlık döndürüyorsa yalnızca kimlik taşıyan bir başvuru nesnesi döndürür;
  geri kalan her alanı o tipin çözümleyicileri katalogdan çözer. Böylece her servis başka servisin tipini kimlikle döndürebilir:
  `Video` → `{ videoId }` · `Channel` → `{ channelId }` · `ProgramAiring` → `AiringRecord` (kernel/services) ·
  `Person` → `{ personId, name }` · `Collection` → `{ collectionId }` · `Genre` → `{ genreId }` · `Profile` → `ProfileRecord`.

## 6. Falcor (eski sistem) — JSON Graph yolları

İstek gövdesi form kodlu: yinelenen `path=<JSON dizi>` + `authURL=<belirteç>`. Sorgu dizgesi yetenek bayrakları taşır:
`?webp=true&isTop10Supported=true&hasVideoMerchInBob=true&falcor_server=0.1.0&withSize=true&materialize=true`.
Yanıt `{ paths, jsonGraph }`. `materialize=true` iken olmayan değer boş atom (`{ $type: 'atom' }`) olur.

```
lolomo                                  → ref ["lolomos", <profil GUID>]
lolomos[guid].summary                   → atom { length, trackId, expires }
lolomos[guid][{0..n}]                   → ref ["lists", listId]
lists[listId].summary                   → atom { id, context, displayName, length, trackId, genreId?, collectionId? }
                                           context: billboard | continueWatching | queue | top10 | becauseYouWatched |
                                                    gems | newReleases | genre | collection | curated | exclusive | leaving | bridge
lists[listId][{0..m}]                   → ref ["videos", videoId]
lists[listId].itemTctx[{0..m}]          → atom "<tctx>"
videos[id].summary                      → atom { id, type: 'movie'|'show'|'episode'|'supplemental', isPlayable, isKids, unifiedEntityId }
videos[id].title | shortSynopsis | synopsis | releaseYear | displayRuntime | runtime | seasonCount
videos[id].boxart | storyArt | billboardArt | titleLogo   → atom { url, width, height, key }
videos[id].badge                        → atom { kind, text } | boş atom
videos[id].maturity                     → atom { certificationValue, maturityLevel, reasons[] }
videos[id].access                       → atom { state, reasonText, requiredProduct, requiredProductName, cta }
videos[id].bookmark                     → atom { positionSec, runtimeSec, progress } ($expires kısa)
videos[id].watchStatus | queue | userRating | top10Rank | sourceKinds
videos[id].promoVideo                   → atom { viewableId, computeId, offset, sourceKind }
videos[id].current                      → ref ["videos", <devam edilecek bölüm>]   (diziler)
usp.features[<bayrak>]                  → atom boolean      (ör. liveTv, kidsMode, top10)
```

Diziler kendi kimlikleriyle oynatılmaz: istemci `videos[dizi].current` ref'ini (GraphQL'de `currentEpisode` /
`promoVideo.viewableId`) izleyip bölüm kimliğiyle oynatır; manifest isteği her zaman bir film, bölüm ya da ek video içindir.

`$expires`: negatif değer alındığı andan itibaren göreli milisaniye, pozitif değer mutlak epoch ms; `0` hemen bayat, `1` hiç
bayatlamaz. `lolomos[guid].summary.expires` ISO tarihidir. Liste kimlikleri profile özeldir; başka profilin listesi `FORBIDDEN`
hata atomu döner.

Motor ref'leri izler: `lolomo[0][3].title` → `lolomos[g][0]` → `lists[L][3]` → `videos[V].title`; yanıt grafiğinde
ara ref'ler de yer alır. `isTop10Supported=false` gelirse Top 10 satırı hiç üretilmez (eski usul yetenek pazarlığı).

## 7. "Kaputun altı" veri yolu

Her istemci katmanı `devbus.emit(cat, label, detail, { ms, ok })` çağırır (`web/src/lib/devbus.ts`). `detail` alanları:

| cat         | label örneği                   | detail                                                                                                                                                                     |
| ----------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `graphql`   | `DetailModal`                  | `id, version, variables, status, traceId, bytes`                                                                                                                           |
| `falcor`    | `3 yol`                        | `paths, flags, status, traceId, fromCache, missing`                                                                                                                        |
| `cache`     | `arama: isabet`                | `key, expires, ageMs`                                                                                                                                                      |
| `prefetch`  | `MiniModal satır` / `manifest` | `rowId, videoIds` / `viewableId`                                                                                                                                           |
| `ftl`       | `darbe 1`                      | `iter, pulse (0 tabanlı), results[{name,cdnId,ok,ttfbMs,totalMs,kbps}], winner (cdnId)`                                                                                    |
| `msl`       | `aleProvision` / `zarf`        | `scheme, serialnumber, renewalwindow, expiration (epoch sn), messageid, bytes`                                                                                             |
| `manifest`  | `Video:80010001`               | `kind, prefetch, video[{streamId,bitrateKbps,width,height,profile}], audio[{trackId,language,channels}], text[{trackId,language}], cdns[{id,rank}], expiration (epoch ms)` |
| `range`     | `video 1543-675647`            | `type:'video'\|'audio'\|'header', cdnId, start, end, bytes, ttfbMs, kbps, streamId, segment`                                                                               |
| `abr`       | `↑ 1127 kbps`                  | `from, to (kbps), fromStreamId, toStreamId, reason, estimateKbps, bufferSec`                                                                                               |
| `buffer`    | `tampon`                       | `videoSec, audioSec, state`                                                                                                                                                |
| `cdn`       | `yük devri c101→c102`          | `from, to, reason`                                                                                                                                                         |
| `ttml`      | `tr yüklendi`                  | `language, cues, tickRate`                                                                                                                                                 |
| `embed`     | `YouTube: PLAYING`             | `videoId, state (UNSTARTED\|BUFFERING\|PLAYING\|PAUSED\|ENDED\|CUED), error`                                                                                               |
| `event-log` | `12 olay`                      | `count, names[], status, rate`                                                                                                                                             |
| `push`      | `yoklama` / `3 bildirim`       | `cursor, wait` · `count, cursor, waitMs, initial` · `error, retryInMs`                                                                                                     |
| `player`    | `durum: oynuyor`               | `viewableId, state, positionSec`                                                                                                                                           |

`device` ve `predict` olaylarının alanları §9.2 ve §9.3'te tanımlıdır.

## 8. Bitti tanımı (her ajan teslim etmeden önce)

1. `npm run typecheck` hatasız (kendi alanında; başka alanın hatasını raporla, düzeltme).
2. Kendi testleri `npx vitest run <yol>` ile geçiyor; sunucu `npm start` ile açılıyor.
3. Rapor: ne yapıldı (dosya listesi), nasıl doğrulandı (çalıştırılan komutlar ve sonuçları), bilinen eksikler,
   varsa "SÖZLEŞME:" önerileri. Çalışmayan şeyi çalışıyor diye yazma.

## 9. İkinci tur: üç ekran, cihazlar arası deneyim, arama tahmin modeli

Görünüm ve etkileşimin tek kaynağı artık [`UX_SPEC.md`](UX_SPEC.md)'dir (Netflix deneyimi, TV+ markası).

### 9.1 Ekran biçimleri

`web/src/lib/formFactor.ts` karar verir: `tv` (TV tarayıcısı ya da `?cihaz=tv`) · `mobile` (< 900 px) · `desktop`.
Masaüstü ve mobil aynı yol ağacını ayrı kabuklarla çizer; TV'nin kendi yol ağacı (`/tv/*`), odak motoru ve bileşenleri
vardır (`web/src/tv`). Yeni yollar: `/goz-at`, `/goz-at/diziler`, `/goz-at/filmler`, `/yeni-ve-populer`, `/canli`,
`/rehber`, `/listem`, `/ara?q=`, `?jbv=<videoId>` (masaüstü detay penceresi), `/baslik/:id` (mobil detay),
`/izle/:viewableId`, `/profiller`, `/profiller/yonet`, `/tvplusim`, `/kumanda`, `/bagla?kod=`, `/cihazlar`, `/vitrin`.

### 9.2 Cihazlar arası (sözleşme: `shared/devices.ts`)

- **TV'de kodla giriş:** OAuth "device authorization grant" kalıbı — TV `start` → QR + kısa kod → telefon `approve` →
  TV `poll` ile çerez zincirini alır.
- **Kumanda ve yansıtma:** her cihaz `GET /api/devices/stream` (SSE) ile komut dinler; denetleyen cihaz
  `POST /api/devices/:id/command` yollar; cihazlar durumlarını (`screen`, `nowPlaying`) bildirir. Komutlar yalnız aynı
  hesabın cihazları arasında gider.
- **Sanal cihaz:** `x-tvplus-vd` başlığı / `?vd=` sorgusu çerez adlarına `__<ad>` ekler; cihaz vitrini üç çerçeveyi
  üç ayrı cihaz olarak çalıştırır. İstemci: `web/src/api/session.ts` (`virtualDevice`, `apiUrl`).
- **İstemci:** `web/src/devices/client.ts` (`deviceClient`), yansıtma köprüsü `web/src/devices/bridge.ts`.
- devbus `device` olayları: `kayıt`, `akış açık/koptu`, `komut → <cihaz>` (`{to, command}`), `komut ← <cihaz>`
  (`{from, command}`), `durum` (`{screen, nowPlaying}`), `tv girişi: <durum>` (`{userCode, status}`).

### 9.3 Arama tahmin modeli

Sıralama ve öneriler çevrimiçi öğrenen küçük bir modelden gelir (`server/src/services/search/model`): lojistik
regresyon; öznitelikler `metin` (eşleşme puanı), `begeni` (profilin beğeni vektörüyle benzerlik), `populerlik`
(katalog + son 24 saat oynatma), `tiklanma` (sorgu/önek → başlık tıklanma oranı, yumuşatılmış), `yenilik`, `devam`
(yarım kalmış başlık). `recordSearchFeedback` mutasyonu her tıklamada ağırlıkları günceller; ağırlıklar ve sayaçlar
`.data/search-model.json` içinde kalır. Model şunları üretir: yazarken **tamamlama tahminleri** (`predictions`,
`searchPredictions`), puana göre sıralı sonuçlar (`score`, `reason`, `explain`), doğrudan eşleşmeyen **tahmini
sonuçlar** (`SearchPredictedSection`, `predicted: true`) ve kutu boşken **sana özel öneriler** (`popularSearches`).
devbus `predict` olayları: `tamamlama` (`{prefix, predictions}`), `sıralama` (`{term, modelVersion, top[{id, score,
explain}]}`), `geri bildirim` (`{term, entityId, action}`).

### 9.4 Falcor ekleri

```
lolomoByCategory[home|shows|movies|newPopular]  → ref ["lolomos", "<guid>:<kategori>"]
                                                   home → ref ["lolomos", "<guid>"] (lolomo ile aynı nesne; "<guid>:home" da kabul edilir)
lists[..].summary.context ekleri: top10Shows | top10Movies | popular
videos[id].tags                                  → atom string[]   (önizleme kartındaki üç etiket)
```

### 9.5 Sahiplik (ikinci tur)

| Yol                                                                                                                                             | Sahibi                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `docs/UX_SPEC.md`, `shared/**`, `server/src/kernel/**`, `web/src/lib/**`, `web/src/api/session.ts`, `web/src/devices/bridge.ts`                 | mimar                                                    |
| `server/src/services/devices/**`, `web/src/devices/client.ts`                                                                                   | **cihazlar (sunucu)**                                    |
| `server/src/services/{identity,image,catalog,entitlement,epg,progress,discovery}/**`, `graphql/resolvers/**` (search hariç), `falcor/routes/**` | **sunucu ekleri**                                        |
| `server/src/services/search/**`, `graphql/resolvers/search.ts`                                                                                  | **arama tahmin modeli**                                  |
| `web/src/ui/**`, `web/src/app/**`, `web/src/features/{welcome,profiles}/**`                                                                     | **web temel v2**                                         |
| `web/src/features/{home,browse,detail,preview,library,newpopular,account}/**`                                                                   | **göz atma**                                             |
| `web/src/features/{search,live,guide}/**`                                                                                                       | **arama + canlı**                                        |
| `web/src/devices/**` (client.ts ve bridge.ts hariç), `web/src/features/{remote,pair,showcase}/**`, `web/src/devtools/tabs/DevicesTab.tsx`       | **cihaz deneyimi**                                       |
| `web/src/tv/{focus,ui,shell,login,profiles}/**`, `web/src/tv/index.ts*`                                                                         | **TV temel**                                             |
| `web/src/tv/{home,detail,search,list}/**`                                                                                                       | **TV göz atma**                                          |
| `web/src/tv/{live,player,remote}/**`                                                                                                            | **TV canlı + kumanda**                                   |
| `web/src/player/**`                                                                                                                             | **oynatıcı**                                             |
| `web/src/features/studio/**`                                                                                                                    | **stüdyo arayüzü** (içerik zekâsı arka ofisi, `/studyo`) |
| `content/**`                                                                                                                                    | içerik ekibi                                             |

Eski `web/src/design/**` (v1) geçiş boyunca derlenir halde kalır; hiçbir yeni kod onu içe aktarmaz, ikinci turun
sonunda silinir.

## 10. İçerik zekâsı arka ucu

Etiketleme → mikro türler → izleme verisi (uygulama + Mixpanel) → zevk toplulukları → içgörüler ve planlayıcı; ayrıca
çekim düzeyi gömme. Tam şartname: **`docs/ICERIK_ZEKASI.md`** · tel sözleşmesi `shared/intelligence.ts` · içerik
şemaları `shared/tagging-schema.ts` · servis arayüzleri `server/src/kernel/intelligence.ts` · uçlar `/api/studio/*`
(erişim: `TVP_STUDIO`, `TVP_STUDIO_KEY`; yazma uçlarında `assertStudioWrite`).

| Servis (`app.services.*`) | Klasör                                                                | Ne yapar                                                                              |
| ------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `tagging`                 | `services/tagging`                                                    | Kılavuz sözlüğü, etiket fişleri, uzlaşı → geçerli etiketler                           |
| `microgenres`             | `services/microgenres`                                                | Etiketleri birleştirip dar kategoriler üretir; görünen / görünmeyen katman            |
| `viewing`                 | `services/viewing` (+ `services/mixpanel`, `services/events` köprüsü) | Kanonik izleme olayları ve izleyici × başlık özetleri                                 |
| `audience`                | `services/audience`                                                   | İzleyicileri davranışa göre zevk topluluklarına ayırır                                |
| `insights`                | `services/insights`                                                   | Katalog payı ↔ izlenme payı, verim, zaman çizelgesi, içerik karması önerisi           |
| `embeddings`              | `services/embeddings`                                                 | Çekim düzeyi vektörler; etiket ve özet genel bağlam girdisidir; sağlayıcı takılabilir |

Sahiplik tablosu `docs/ICERIK_ZEKASI.md` §11'dedir. Başlık şemasına üç isteğe bağlı alan eklendi: `origin`,
`acquisition`, `externalIds` (`shared/content-schema.ts`).

### 10.1 İzleyiciye görünen yüz (keşif bütünleşmesi)

Görünmeyen katman keşfi besler; izleyici yalnız sonucunu görür:

- **Benzerler** — `similars` artık künye benzerliği + ortak mikro türler + gömme benzerliğinin harmanıdır;
  `similarsWithReason` aynı listeyi gerekçe ("Ortak: …") ve işaret dökümüyle verir.
- **GraphQL ekleri** — `Movie/Show.microgenres`, `Movie/Show.similarsWithReason`, `Query.microgenre(id)`,
  türler `Microgenre`, `SimilarVideo`, `SimilaritySignal`.
- **Falcor ekleri** — ana sayfa lolomosuna iki satır bağlamı eklenir:
  `microgenre` (görünen mikro tür satırı; `summary.microgenreId`, "Tümünü Gör" → `/tur/<mg_…>`) ve
  `tasteCommunity` (profilin zevk topluluğunda öne çıkanlar; `summary.communityId`).
  `becauseYouWatched` satırları kaynağın görünmeyen mikro türlerinden kurulur; `summary.reason` ortak mikro tür adını taşır.
- **Satır adları** UX_SPEC §6 sözlüğündeki yazımla verilir ("İzlemeye Devam Et", "Yeni Gelenler", "Son Şans").
- **Stüdyo** — `/studyo` (yalnız masaüstü, üst menüde değil; profil menüsünden): arka ofisin penceresi.
