---
baslik: PWA ve çevrimdışı
ozet: Manifest ve kurulabilirlik, servis çalışanı yaşam döngüsü ve "neden eski sürüm görünüyor", önbellek stratejileri, güncelleme bildirimi, IndexedDB şema yükseltme, depolama kalıcılığı ve iOS farkları.
etiketler: [pwa, servis-calisani, cevrimdisi, indexeddb, onbellek, mobil]
duzey: ileri
guncellik: 2026-11
---

# PWA ve çevrimdışı

> Bu notu ne zaman okumalı: uygulamayı ana ekrana kurulabilir ve internetsiz açılır yaparken; "yayınladım ama telefonda
> eski sürüm görünüyor", "çevrimdışı açılmıyor", "veriler kayboldu", "yeni sürümden sonra sayfa çöktü"
> şikâyetlerinde; IndexedDB şemasını değiştirmeden önce.

## Temel fikir

PWA dört parçadır: **manifest** (kurulum: ad, simge, başlangıç adresi), **servis çalışanı** (service worker: sayfa
ile ağ arasında duran ayrı bir betik; uygulama kabuğunu önbellekten verir), **yerel veritabanı** (IndexedDB:
kullanıcının verisi) ve **HTTPS**. Kural: kabuk (HTML/JS/CSS/simge) servis çalışanının önbelleğinde, veri
IndexedDB'de durur; API yanıtları servis çalışanı önbelleğine **girmez**.

Servis çalışanının kendi yaşam döngüsü vardır ve sayfadan bağımsızdır. Yeni sürüm yayınlandığında yeni çalışan
kurulur ama **eski çalışan denetlediği sekmeler kapanana dek bekler**. "Neden eski sürüm görünüyor" sorusunun yanıtı
neredeyse her zaman budur. Bu bekleme bir hata değil; aynı sayfanın yarısının eski, yarısının yeni kodla çalışmasını
önleyen bir korumadır.

Havuzdaki iki gerçek örnek: uygulama temeli `registerType: 'prompt'` ile "Yeni sürüm hazır · Yenile" bildirimi
gösterir ([`pwa.ts`](../../uygulama/web/src/lib/pwa.ts), [`vite.config.ts`](../../uygulama/web/vite.config.ts)); Köprü
`autoUpdate` kullanır; Bölüş elle yazılmış, önce-ağ stratejili küçük bir `sw.js` kullanır.

## Manifest

| Alan                        | Ne işe yarar                                         | Tuzak                                                         |
| --------------------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| `name`, `short_name`        | Kurulum penceresi; ana ekran simgesinin altı         | `short_name` ~12 karakteri geçerse kesilir                    |
| `id`                        | Uygulamanın kimliği                                  | Yoksa `start_url` kimlik olur; `start_url`'i sonra değiştirmek "başka uygulama" yaratabilir. Baştan sabit `id` yazın |
| `start_url`, `scope`        | Açılış adresi; uygulamanın kapsadığı yol             | Alt klasörde yayında göreli (`./`) olmalı; kapsam dışı bağlantı tarayıcıda açılır |
| `display`                   | `standalone`: adres çubuksuz pencere                 | `fullscreen` durum çubuğunu da gizler; çoğu uygulamada gereksiz |
| `icons`                     | 192 ve 512 px PNG + `purpose: "maskable"` olan 512   | Maskeli simgede logo ortadaki güvenli dairede (~%80) kalmalı  |
| `theme_color`, `background_color` | Durum çubuğu ve açılış ekranı rengi           | `<meta name="theme-color">` ile aynı olsun; koyu temayı da düşünün |
| `lang`, `dir`               | Ad ve açıklamanın dili                               | `lang: "tr"` yazılmazsa bazı sistemler yanlış seslendirir     |
| `orientation`               | Kurulu uygulamada yön kilidi                         | Erişilebilirlik ödünleşimi (bkz. [duyarlı tasarım](duyarli-tasarim-ve-mobil.md)) |

## Kurulabilirlik

- Ön koşullar: HTTPS (ya da `localhost`), geçerli manifest (ad, simgeler, `start_url`, `display`), kayıtlı servis
  çalışanı. Chromium'un kurulabilirlik ölçütleri yıllar içinde değişti; güncel durumu DevTools → Application →
  Manifest'teki uyarılardan okuyun.
- Chromium tarayıcıları `beforeinstallprompt` olayı verir: olayı saklayıp kendi "Uygulamayı yükle" düğmenizden
  `prompt()` çağırın. iOS Safari'de bu olay yoktur; kurulum yalnız Paylaş → "Ana Ekrana Ekle" ile olur, siz yalnız
  yol gösteren bir kart gösterebilirsiniz.
- Kurulu çalışıp çalışmadığını `matchMedia('(display-mode: standalone)').matches` ile anlayın (kurulum kartını
  gizlemek için).

## Servis çalışanı yaşam döngüsü

1. **Kayıt:** sayfa `navigator.serviceWorker.register('sw.js')` çağırır (vite-plugin-pwa bunu üretir).
2. **Kurulum (install):** yeni çalışan kabuk dosyalarını önbelleğe indirir (precache). Bir dosya inmezse kurulum
   başarısız olur, eski sürüm sürer.
3. **Bekleme (waiting):** eski çalışan hâlâ bir sekmeyi denetliyorsa yeni çalışan bekler. **Sayfayı yenilemek
   yetmez**: yenilemede eski sayfa kapanmadan yeni istek başlar, denetim hiç boşa çıkmaz.
4. **Etkinleşme (activate):** bütün sekmeler kapanınca ya da `skipWaiting()` çağrılınca; eski önbellekler burada
   temizlenir.
5. **Denetim:** yeni çalışan istekleri yanıtlar; sayfada `controllerchange` olayı olur.

| "Neden eski sürüm görünüyor?"                          | Neden                                                    | Çözüm                                                     |
| ------------------------------------------------------ | -------------------------------------------------------- | --------------------------------------------------------- |
| Yeni sürüm yayınlandı, yenileyince yine eskisi         | Yeni çalışan bekliyor                                    | Güncelleme bildirimi + `skipWaiting` + yeniden yükleme    |
| Telefonda kurulu uygulama günlerce eski kalıyor        | Uygulama hiç kapanmıyor; güncelleme denetimi seyrek      | Uygulama öne gelince (`visibilitychange`) `registration.update()` |
| Hiç güncellenmiyor                                     | `sw.js` ya da `index.html` uzun süre önbellekte (CDN)    | Bu iki dosyaya uzun önbellek başlığı vermeyin             |
| Geliştirmede değişiklik görünmüyor                     | Eski derlemenin çalışanı `localhost`'u hâlâ denetliyor   | DevTools → Application → "Update on reload" ya da kaydı silin |
| Bazı kullanıcılar eski, bazıları yeni                  | Her cihaz kendi zamanında günceller                      | Normaldir; API eski istemciyi bir süre desteklemeli       |

Yeni sürümü **hemen** devreye almanın bedeli: açık duran eski sayfa, yeni yayında silinmiş bir parçayı istediğinde
hiçbir yerde bulamaz.

```js calistir
import assert from 'node:assert/strict'

// Eski sayfa (v1) açıkken v2 yayınlandı; sayfa tembel yüklenen ayarlar parçasını ŞİMDİ istiyor.
function requestChunk(file, { caches, server, controller }) {
  if (caches.get(controller)?.has(file)) return 'önbellekten'
  return server.has(file) ? 'ağdan' : '404: sayfa çöker'
}
const server = new Set(['index-v2.js', 'ayarlar-v2.js']) // yayın eski parçaları sildi
const v1 = new Set(['index-v1.js', 'ayarlar-v1.js'])
const v2 = new Set(['index-v2.js', 'ayarlar-v2.js'])

// "prompt": v2 BEKLİYOR, v1 önbelleği duruyor → eski sayfa tutarlı çalışır
assert.equal(requestChunk('ayarlar-v1.js', { caches: new Map([['v1', v1], ['v2', v2]]), server, controller: 'v1' }), 'önbellekten')
// skipWaiting + eski önbelleği hemen silmek: eski sayfa artık v2'ye bağlı, v1 parçası hiçbir yerde yok
assert.equal(requestChunk('ayarlar-v1.js', { caches: new Map([['v2', v2]]), server, controller: 'v2' }), '404: sayfa çöker')
// Servis çalışanı yoksa (ilk ziyaret, tarayıcı sekmesi) aynı sorun: vite:preloadError ile yeniden yükleyin
assert.equal(requestChunk('ayarlar-v1.js', { caches: new Map(), server, controller: null }), '404: sayfa çöker')
console.log('tamam')
```

```cikti
tamam
```

## Güncelleme stratejisi

| Seçim                                   | Ne olur                                                       | Ne zaman                                              |
| --------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------- |
| `prompt` (uygulama temeli)              | "Yeni sürüm hazır · Yenile" bildirimi; kullanıcı seçer        | Form, taslak, uzun işlem olan uygulamalar             |
| `autoUpdate` (Köprü)                    | Yeni çalışan hemen devreye girer, sayfa kendiliğinden yenilenir | Kısa oturumlu, kaybedilecek taslak olmayan uygulama   |
| El yazımı, önce-ağ (Bölüş)              | Çevrimiçiyse her açılış en yeni dosyayı alır                  | Tek sayfalık küçük araç                               |

`prompt` akışında kullanıcı "Yenile"ye basınca: bekleyen çalışana `skipWaiting` iletisi → `controllerchange` →
`location.reload()`. Telefonda kurulu uygulama arka planda zamanlayıcı çalıştırmaz; saatlik `setInterval`
denetimine ek olarak uygulama öne geldiğinde de `registration.update()` çağırın. Sürüm numarasını Ayarlar →
Hakkında'da gösterin; destek isterken ilk soru odur.

## Önbellek stratejileri

| Kaynak                                            | Strateji                         | Neden                                                    |
| ------------------------------------------------- | -------------------------------- | -------------------------------------------------------- |
| Uygulama kabuğu (HTML, adı özetli JS/CSS, simge)  | Önceden önbellek (precache)      | Sürümle birlikte atomik; çevrimdışı açılış               |
| Adı özetli (hash) değişmez dosyalar, yazı tipi    | Önce önbellek (cache first)      | İçerik değişirse adı da değişir                          |
| Gezinme (HTML), tazeliği önemli küçük uygulama    | Önce ağ (network first) + yedek  | Çevrimiçiyse en yeni; değilse önbellek (Bölüş)           |
| Avatar, içerik JSON'u, sık değişmeyen genel veri  | Bayatken tazele (SWR)            | Hemen göster, arkada yenile                              |
| API: kişisel veri, yazma, oturum                  | **Yalnız ağ** (network only)     | Bayat/yanlış kullanıcıya ait veri riski; veri IndexedDB'de |
| Kullanıcının indirdiği büyük dosya (ses, PDF)     | Ayrı, adlandırılmış önbellek + sınır | Precache'i şişirmesin; kullanıcı silebilsin          |

```js calistir
import assert from 'node:assert/strict'

const online = { value: true }
const cache = new Map([['/icerik.json', 'eski içerik']])
const network = async (url) => { if (!online.value) throw new Error('ağ yok'); return `yeni ${url}` }

async function networkFirst(url) {
  try { const fresh = await network(url); cache.set(url, fresh); return fresh } catch (error) {
    if (cache.has(url)) return cache.get(url)
    throw error
  }
}
async function cacheFirst(url) {
  if (cache.has(url)) return cache.get(url)
  const fresh = await network(url); cache.set(url, fresh); return fresh
}
async function staleWhileRevalidate(url) {
  const refresh = network(url).then((fresh) => { cache.set(url, fresh); return fresh })
  if (cache.has(url)) { refresh.catch(() => {}); return { shown: cache.get(url), refresh } }
  return { shown: await refresh, refresh }
}

assert.equal(await cacheFirst('/icerik.json'), 'eski içerik') // çevrimiçi olsa bile ESKİ: adı sabit dosyada tehlikeli
const swr = await staleWhileRevalidate('/icerik.json')
assert.equal(swr.shown, 'eski içerik') // hemen eskisi gösterilir…
await swr.refresh
assert.equal(cache.get('/icerik.json'), 'yeni /icerik.json') // …bir sonraki açılışta yenisi

online.value = false
assert.equal(await networkFirst('/icerik.json'), 'yeni /icerik.json') // çevrimdışı: önbellekteki son kopya
await assert.rejects(networkFirst('/hic-gelmemis.json')) // hiç önbelleğe girmemişse hata: boş durum gösterin
console.log('tamam')
```

## API isteklerini önbelleğe almayın

Kişisel API yanıtını servis çalışanı önbelleğine koymak üç hata üretir: çıkış yapıp başka hesapla girince eski
kullanıcının verisi görünür; yazmadan sonra bayat yanıt döner; hata yanıtı (401, 500) önbelleğe girip kalıcılaşır.
Veriyi çevrimdışı istiyorsanız **IndexedDB'ye uygulama koduyla** yazın. Uygulama temeli bunu açıkça yasaklar:
`runtimeCaching: []` ve `navigateFallbackDenylist: [/^\/api(\/|$)/]` (gezinme yedeği `index.html` API adreslerine
karışmasın). Elle yazılan çalışanda yalnız aynı kökenli, `GET`, `response.ok` ve `type === 'basic'` yanıtları önbelleğe
alın; Bölüş'ün `sw.js`'i böyle yapar.

## IndexedDB ve şema yükseltme

- Dexie gibi ince bir katman kullanın; çıplak IndexedDB API'si olay tabanlı ve hataya açıktır.
- Şema sürümleri **yalnız eklenir**: yayınlanmış bir sürümü değiştirmeyin; yeni dizin/tablo için listenin sonuna yeni
  sürüm yazın, eski veriyi çevirmek gerekiyorsa `upgrade` adımı ekleyin
  ([`schema.ts`](../../uygulama/web/src/lib/store/schema.ts)).
- Kayıtların alanları JSON olarak saklanıyorsa yeni alan eklemek şema sürümü gerektirmez; okurken varsayılanı şema
  doğrulayıcısı (Zod `.default()`) verir.

```js calistir
import assert from 'node:assert/strict'

// Tarayıcı yalnız (eski sürüm, yeni sürüm] aralığındaki yükseltme adımlarını çalıştırır.
function open(db, target, steps) {
  for (const step of steps) if (step.version > db.version && step.version <= target) step.up(db)
  db.version = target
  return db
}
const v1 = { version: 1, up: (db) => { db.tasks = [] } }
const v2 = { version: 2, up: (db) => { for (const t of db.tasks) t.priority ??= 'normal' } }

const existing = open({ version: 0 }, 1, [v1])
existing.tasks.push({ title: 'Süt al' }) // kullanıcı v1'de veri girdi
open(existing, 2, [v1, v2])
assert.equal(existing.tasks[0].priority, 'normal')

// YANLIŞ: yayınlanmış v2 adımını sonradan değiştirmek (yeni 'due' alanı). v2'deki kullanıcıda HİÇ çalışmaz.
const v2edited = { version: 2, up: (db) => { for (const t of db.tasks) { t.priority ??= 'normal'; t.due ??= null } } }
open(existing, 2, [v1, v2edited])
assert.equal('due' in existing.tasks[0], false) // yeni kod "due var" sanar
// DOĞRU: yeni sürüm ekleyin
open(existing, 3, [v1, v2edited, { version: 3, up: (db) => { for (const t of db.tasks) t.due ??= null } }])
assert.equal(existing.tasks[0].due, null)
console.log('tamam')
```

Başka bir sekme eski sürümle açıksa yükseltme bekler. Dexie (4.4.7 kaynağında görüldü) eski bağlantıyı kendiliğinden
kapatıp yükseltmeyi sürdürür; eski sekme bundan sonraki veritabanı işleminde hata alır. O sekmede `versionchange`
olayını dinleyip "Uygulama güncellendi, sayfayı yenileyin" deyin.

Yükseltme adımında ağ isteği yapmayın, uzun iş yapmayın; adım yarıda kalırsa bütün yükseltme geri alınır ve
uygulama açılmaz. Her yükseltmeyi eski sürümle doldurulmuş bir veritabanı üzerinde test edin.

## Depolama kotası ve kalıcılık

- Tarayıcı site verisini varsayılan olarak "en iyi çaba" (best-effort) ile saklar: disk daralınca silebilir.
  `navigator.storage.persist()` kalıcılık ister (Chromium kurulu uygulamada ya da etkileşimli sitede çoğu zaman sessizce
  verir; tarayıcıya göre değişir). Durum ve kullanım: `navigator.storage.estimate()`
  ([`storage.ts`](../../uygulama/web/src/lib/storage.ts) ikisini de gösterir).
- WebKit (Safari), kullanıcı bir süre siteyle etkileşmezse betikle yazılmış verileri silebilir; ana ekrana kurulmuş
  uygulamada bu kuralın uygulanmadığı belirtiliyor (Kasım 2026'da yeniden doğrulanmadı). Sonuç: iOS'ta önemli veri
  saklayan uygulama **kurulmayı** önermeli.
- Gerçek güvence **dışa aktarmadır**: "Verilerimi indir" (JSON dosyası) ve "Dosyadan geri yükle". Kullanıcıya
  "verileriniz yalnız bu telefonda" diye açıkça söyleyin ([`backup.ts`](../../uygulama/web/src/lib/backup.ts)).
- Kota dolunca yazma `QuotaExceededError` verir; bunu yakalayıp anlaşılır ileti gösterin.

## iOS farkları (genel)

| Konu                        | iOS / Safari                                                     |
| --------------------------- | ---------------------------------------------------------------- |
| Kurulum                     | Yalnız Paylaş → Ana Ekrana Ekle; `beforeinstallprompt` yok       |
| Depolama                    | Kurulu uygulamanın verisi Safari sekmesindekinden ayrı tutulur; kurulunca veri taşınmaz (genel davranış; iOS sürümünde doğrulayın) |
| Bildirim (push)             | Yalnız ana ekrana kurulmuş uygulamada (iOS 16.4'ten beri)        |
| Arka plan eşitleme          | Background Sync yok; eşitlemeyi uygulama açılınca yapın          |
| Servis çalışanı             | Arka planda erken sonlandırılabilir; uzun iş vermeyin            |

## Hata ayıklama

1. DevTools → Application → Service Workers: etkin/bekleyen sürüm, "Update on reload", "skipWaiting", "Unregister".
2. Application → Cache Storage: hangi dosyalar önbellekte; Application → IndexedDB: tablolar ve satırlar.
3. Application → Storage → "Clear site data": temiz başlangıç (kullanıcı verisini de siler!).
4. Network sekmesinde "Offline" ile çevrimdışı açılışı deneyin; "(ServiceWorker)" sütunu yanıtın nereden geldiğini gösterir.
5. Geliştirme sunucusunda servis çalışanı yoktur (vite-plugin-pwa varsayılanı); PWA davranışını derleyip `preview`
   ile deneyin. Uçtan uca testte Playwright'a `serviceWorkers: 'allow'` verin
   ([`cevrimdisi-acilis.spec.ts`](../../uygulama/e2e/cevrimdisi-acilis.spec.ts)).
6. Telefonda: Android'de USB + `chrome://inspect`; iOS'ta Mac'teki Safari → Geliştir menüsü.

## Tuzaklar

| Belirti                                                     | Neden                                                     | Çözüm                                                       |
| ----------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| Yayından sonra herkes eski sürümde                          | Yeni çalışan bekliyor; bildirim yok                       | `prompt` bildirimi ya da `autoUpdate`; öne gelince `update()` |
| Yayından sonra açık sekmede "Failed to fetch dynamically imported module" | Eski sayfa silinmiş parçayı istiyor           | `vite:preloadError` dinleyip yenileyin; eski önbelleği bekleyen sürüm devreye girince silin |
| Çevrimdışı açılış beyaz sayfa                               | Gezinme yedeği (`navigateFallback`) yok ya da dosya precache dışında | `navigateFallback: 'index.html'`; `globPatterns`'ı denetleyin |
| Alt klasörde (GitHub Pages) çevrimdışı açılmıyor            | Mutlak `/` yollar, kapsam yanlış                          | `base: './'`, `start_url`/`scope`: `./`                     |
| Çıkış yapınca önceki kullanıcının verisi görünüyor          | API yanıtı servis çalışanı önbelleğinde                   | API'yi önbelleğe almayın; kullanıcı başına ayrı veritabanı  |
| Kullanıcının verileri bir gün yok olmuş                     | En iyi çaba depolaması silindi; Safari temizledi          | `persist()`, kurulum önerisi, düzenli dışa aktarma          |
| Şema değişikliği bazı kullanıcılarda etkisiz                | Yayınlanmış sürüm adımı değiştirildi                      | Yeni sürüm ekleyin                                          |
| Yükseltmeden sonra eski sekmede hatalar                     | Eski bağlantı kapatıldı                                   | `versionchange` olayında "yenileyin" iletisi                |
| Bir dosya inmeyince güncelleme hiç kurulmuyor               | Precache listesinde 404 dönen dosya                       | Derleme çıktısıyla precache listesini karşılaştırın; büyük dosya sınırı (`maximumFileSizeToCacheInBytes`) |

## Denetim listesi

- [ ] Manifest'te sabit `id`, göreli `start_url`/`scope`, `lang: "tr"`, 192/512/maskeli simge var.
- [ ] Derlenmiş sürüm uçak modunda yenilenince açılıyor ve yerel veriler görünüyor (uçtan uca test var).
- [ ] API adresleri servis çalışanı önbelleğine ve gezinme yedeğine girmiyor.
- [ ] Yeni sürüm yayınlanınca bildirim çıkıyor (ya da bilinçli `autoUpdate`); uygulama öne gelince güncelleme denetleniyor.
- [ ] `vite:preloadError` ya da eşdeğeri ele alınıyor.
- [ ] IndexedDB şema değişikliği yeni sürüm olarak eklendi; eski veriyle yükseltme testi var.
- [ ] Ayarlarda depolama durumu, kalıcılık isteği ve "verileri dışa aktar / geri yükle" var.
- [ ] iOS'ta kurulum yol gösterici kartı var; push gibi yalnız kurulu uygulamada çalışan özellikler buna göre gizleniyor.
- [ ] Sürüm numarası arayüzde görünüyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Servis çalışanı ayarı `vite.config.ts`'te; API'yi önbelleğe alma (`runtimeCaching: []` kalsın).
  IndexedDB şemasında yayınlanmış sürümü değiştirme, sona yeni sürüm ekle ve eski veriyle test yaz. PWA davranışını
  `build` + `preview` ile dene, geliştirme sunucusunda değil."
- **Modelin tipik hatası:** "Çevrimdışı çalışsın" isteğine API'yi `NetworkFirst` ile önbelleğe alarak yanıt verir;
  `skipWaiting` + `clientsClaim`'i gerekçesiz açar; Dexie'de `version(1)` tanımını yerinde değiştirir; geliştirme
  sunucusunda servis çalışanı arar.
- **Çıktıda arayın:** `runtimeCaching` içinde `/api`; `self.skipWaiting()` / `clientsClaim`; `schema.ts`'te mevcut
  sürüm satırlarında değişiklik; manifest'te mutlak `/` yollar.
- **Doğrulama isteyin:** "Derle, `preview` ile aç, uçak moduna al, yenile; ekran ve veriler geliyor mu?" sorusunun
  yanıtını ve uçtan uca testin çıktısını.

## İlgili

- [Tarayıcı API'leri](tarayici-apileri.md) — depolama seçenekleri karşılaştırması
- [Veri getirme](veri-getirme.md) — çevrimdışı okuma/yazma davranışı
- [Vite ve derleme](vite-ve-derleme.md) — `base`, parça hataları
- [Durum yönetimi seçimi](durum-yonetimi-secimi.md) — yerel-önce tek kaynak
- Eşitleme tasarımı: [`ESITLEME.md`](../../uygulama/docs/ESITLEME.md); güncelleme bildirimi:
  [`PwaNotices.tsx`](../../uygulama/web/src/app/PwaNotices.tsx)
- Başka kümelerde: [Tutarlılık modelleri](../40-sistem-tasarimi/tutarlilik-modelleri.md) (çevrimdışı yazma ve uzlaşma), [Yayın yolu seçimi](../60-devops/yayin-yolu-secimi.md)
