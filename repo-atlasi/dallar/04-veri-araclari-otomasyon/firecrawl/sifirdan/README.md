# firecrawl — sıfırdan mini sürüm: tarayıcı (crawler) + HTML→Markdown + iş API'si

Bu mini, Firecrawl'un "bir siteyi LLM'e hazır Markdown'a çevir" hattını Node'un yerleşik modülleriyle
yeniden kurar: URL normalleştirme ve tekrar engelleme, robots.txt, sınır kuyruğu (BFS), nezaket gecikmesi,
ana içerik ayıklama, Markdown üretimi ve `POST /v2/crawl` → `GET /v2/crawl/:id` iş API'si. Firecrawl
AGPL-3.0 lisanslıdır; buradaki kod ondan kopyalanmadı, aynı davranışlar sıfırdan yazıldı.

## Gereksinimler

- Node.js 22+ (global `fetch`, `AbortSignal.any`, `node:test`). npm bağımlılığı yok.
- Testler yalnızca `127.0.0.1` üzerinde kurulan yerel siteye istek atar.

## Çalıştırma

```bash
cd sifirdan
node cli.js tara http://127.0.0.1:4000/ --yerel --limit 10 --gecikme 1   # yerel siteni tara
node cli.js kazi http://127.0.0.1:4000/hakkinda                          # tek sayfa -> Markdown
node cli.js sunucu --port 3002 --yerel                                   # iş API'si
curl -s -X POST localhost:3002/v2/crawl -H 'content-type: application/json' \
  -d '{"url":"http://127.0.0.1:4000/","limit":5}'
curl -s localhost:3002/v2/crawl/<id>                                      # durum + belgeler
curl -s localhost:3002/v2/crawl/<id>/errors                               # hatalar + robots engelleri
```

`--yerel` bayrağı özel ağ adreslerine (127.0.0.1, 10.x, 192.168.x, 169.254.x ...) izin verir. Bayrak
yoksa bu adresler SSRF koruması nedeniyle reddedilir; API'yi internete açacaksan bayrağı kullanma.

## Test

```bash
cd sifirdan && node --test                       # 22 test (otomatik keşif: test/*.test.js)
node --test 'firecrawl/sifirdan/test/*.test.js'  # ya da dal klasöründen glob ile
```

Not: Node 22'de `node --test <klasör>` klasörü dosya sanar; klasörün içinden argümansız çalıştır ya da glob ver.

## Aşamalar

| Aşama | Dosya                | Ne öğretir                                                                                                                                                    |
| ----- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `asama1_url.js`      | Normalleştirme (çapa, sorgu), "benzer URL" anahtarı (www, http/https, `index.html`), yol derinliği, aynı site, geriye tarama, SSRF denetimi                   |
| 2     | `asama2_robots.js`   | RFC 9309: gruplar, `*` ve `$`, en uzun desen kazanır, eşitlikte Allow, `Crawl-delay`, `Sitemap`                                                               |
| 3     | `asama3_html.js`     | Hata affeden HTML ayrıştırma (örtük kapanışlar, ham metin etiketleri, varlıklar), ana içerik, bağlantılar, meta veri                                          |
| 4     | `asama4_markdown.js` | Ağaçtan Markdown: başlık, liste (iç içe), tablo, kod bloğu, alıntı, mutlak bağlantılar                                                                        |
| 5     | `asama5_tarayici.js` | Sınır kuyruğu + işçi havuzu, red nedenleri, tekrar kilidi, `limit`, `maxDepth`/`maxDiscoveryDepth`, host başına gecikme ("yer ayırtma"), site haritası, iptal |
| 6     | `asama6_api.js`      | Bellek içi iş kuyruğu (eş zamanlılık), `POST /v2/crawl`, `GET /v2/crawl/:id`, `DELETE`, `/errors`, `POST /v2/scrape`, girdi doğrulama                         |

Firecrawl'daki iki derinlik kavramını ayırt et: `maxDepth` **yol** derinliğidir (`/a/b/c` = 3,
başlangıç yoluna göre), `maxDiscoveryDepth` ise başlangıçtan kaç **bağlantı adımı** uzakta olduğudur.

## Gerçek depoyla eşleme

| Mini'deki parça               | Gerçek depodaki karşılığı (`apps/api/src/...`)                                                     | Fark                                                                                                                                                                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `normalizeEt()`               | `lib/crawl-redis.ts` → `normalizeURL`                                                              | Aynı kural: `#/` ve `#!/` rotaları korunur                                                                                                                                                                                         |
| `benzerlikAnahtari()`         | `lib/crawl-redis.ts` → `generateURLPermutations` + `lockURL`                                       | Asıl sürüm tüm permütasyonları üretip ilkini Redis'te kilitler; biz tek bir kanonik anahtar hesaplarız                                                                                                                             |
| `urlDerinligi()`              | `scraper/WebScraper/utils/maxDepthUtils.ts` → `getURLDepth`                                        | Aynı tanım                                                                                                                                                                                                                         |
| `Tarayici.redNedeni()`, `RED` | `scraper/WebScraper/crawler.ts` → `filterLinks`, `DenialReason`                                    | Asıl süzme Rust'tadır (`@mendable/firecrawl-rs`), JS yedeği vardır                                                                                                                                                                 |
| `robotsAyristir()`            | `lib/robots-txt.ts` (`robots-parser`), Rust tarafında `texting_robots`                             | Bizimki küçük bir alt küme                                                                                                                                                                                                         |
| `anaIcerik()`                 | `scraper/scrapeURL/lib/removeUnwantedElements.ts`                                                  | Asıl sürüm sabit seçici listesiyle atar; biz önce `<main>`/`<article>` arar, sonra atarız                                                                                                                                          |
| `markdownaCevir()`            | `lib/html-to-markdown.ts` (Go servisi → Go paylaşımlı kütüphane → turndown)                        | Tek katman, bağımlılıksız                                                                                                                                                                                                          |
| `sayfayiIsle()`               | `scraper/scrapeURL/index.ts` + `engines/*`                                                         | Asıl sürüm motorlar arasında "şelale" ile seçer: fire-engine, playwright, fetch, pdf ...                                                                                                                                           |
| `siraBekle()` (nezaket)       | `delay` seçeneği: `lib/concurrency-limit.ts`, `services/worker/nuq-fdb/ops.ts`                     | Biz tek süreçte zaman rezervasyonu yaparız ve robots `Crawl-delay`'i de uygularız; asıl sürüm onu `scraper/WebScraper/crawler.ts`'te okur ama bu commit'te uygulamaz (`controllers/v2/crawl.ts`'teki ilgili satırlar yorum satırı) |
| `IsKuyrugu`                   | `services/worker/nuq.ts` (Postgres `FOR UPDATE SKIP LOCKED` + RabbitMQ), BullMQ yan kuyrukları     | Kalıcılık, yeniden deneme, dağıtık işçi yok                                                                                                                                                                                        |
| `apiSunucusu()`               | `routes/v2.ts`, `controllers/v2/crawl.ts`, `crawl-status.ts`, `crawl-cancel.ts`, `crawl-errors.ts` | Kimlik doğrulama, kredi, hız sınırı, WebSocket durum akışı yok                                                                                                                                                                     |
| `ozelAdresMi()`               | Asıl üründe engelleme listeleri ve "threat protection" katmanı                                     | Yalnızca IP/localhost denetimi (DNS rebinding'e karşı korumaz)                                                                                                                                                                     |

## Etik not

Tarayıcı varsayılan olarak robots.txt'ye uyar, dürüst bir `User-Agent` gönderir ve aynı sunucuya
istekleri `delay`/`Crawl-delay` kadar aralıklı yollar. Bu varsayılanları gevşetmeden önce sitenin
kullanım koşullarını oku; kişisel veri içeren sayfaları toplamak KVKK kapsamına girer.
