---
baslik: Veri getirme
ozet: Ön yüzde sunucudan veri okurken yükleniyor/hata/boş/veri durumlarını, yarış ve iptali, önbellek tazeliğini, iyimser güncellemeyi, sayfalamayı ve yeniden denemeyi doğru kurmak.
etiketler: [veri-getirme, fetch, onbellek, cevrimdisi, onyuz, react]
duzey: orta
guncellik: 2026-11
---

# Veri getirme

> Bu notu ne zaman okumalı: bir ekran sunucudan veri okuyacak ya da sunucuya yazacaksa; "bazen eski veri
> görünüyor", "döndürücü hiç kaybolmuyor", "liste boş ama aslında hata vardı", "aynı kayıt iki kez eklendi"
> şikâyetlerinde.

## Temel fikir

Sunucu verisi istemcinin **durumu değil, uzak gerçeğin önbelleğidir**. Her an bayatlayabilir, başka biri
değiştirebilir, ağ kesilebilir. Bu yüzden her okuma için dört durum **tasarlanır**: yükleniyor, hata, boş, veri
(+ "eldeki veri gösterilirken arkada tazeleniyor"). Biri unutulursa kullanıcı ya sonsuz döndürücü ya da hatayı
"kayıt yok" sanan boş ekran görür.

Her istek bir yarış adayıdır: yanıtlar istek sırasıyla gelmez. Her yazma bir çift kayıt adayıdır: ağ kesildiğinde
istek sunucuya ulaşmış olabilir. İptal, tekilleştirme ve idempotency anahtarı bunun içindir.

Yerel-önce uygulamada (havuzdaki uygulama temeli) kullanıcı verisi yerel veritabanından okunur; bu notun çoğu
**eşitlenmeyen** sunucu verisi (üye listesi, arama, yönetim ekranı) ve yerel-önce olmayan uygulamalar içindir.

## Dört durum

| Durum                  | Ne gösterilir                                                       | Sık yapılan yanlış                                   |
| ---------------------- | ------------------------------------------------------------------- | ---------------------------------------------------- |
| Yükleniyor (ilk kez)   | Düzen biliniyorsa iskelet; değilse ~300 ms sonra döndürücü          | Hemen tam ekran döndürücü; düzen zıplaması           |
| Hata                   | Ne oldu + ne yapılabilir + "Yeniden dene"; eldeki veri korunur       | Hatayı yutup boş liste göstermek                     |
| Boş                    | Neden boş + tek bir eylem ("İlk görevi ekle")                       | "Veri yok" yazısı; ya da boş ekranı hata sanmak      |
| Veri                   | Liste/detay                                                         | —                                                    |
| Yenileniyor            | Eldeki veri + küçük gösterge                                        | Tazelerken listeyi silip iskelete dönmek             |

Metin ve görünüm ayrıntısı: [hata ve boş durumlar](hata-ve-bos-durumlar.md). Durumları ayrık birleşimle
(discriminated union) yazın; "hem yükleniyor hem hata" gibi olanaksız birleşim tipte kurulamasın:

```ts calistir
import assert from 'node:assert/strict'

type Remote<T> =
  | { status: 'loading' }
  | { status: 'error'; error: string; data?: T }
  | { status: 'success'; data: T; refreshing: boolean }
type Event<T> = { type: 'fetch' } | { type: 'resolve'; data: T } | { type: 'reject'; error: string }

function reduce<T>(state: Remote<T>, event: Event<T>): Remote<T> {
  switch (event.type) {
    case 'fetch': // eldeki veri varsa SİLİNMEZ; yalnız "tazeleniyor" olur
      return state.status === 'success' ? { ...state, refreshing: true } : { status: 'loading' }
    case 'resolve':
      return { status: 'success', data: event.data, refreshing: false }
    case 'reject': // tazeleme başarısızsa veri korunur, hata yanında gösterilir
      return state.status === 'success'
        ? { status: 'error', error: event.error, data: state.data }
        : { status: 'error', error: event.error }
  }
}

function screen(state: Remote<string[]>): string {
  if (state.status === 'loading') return 'iskelet'
  if (state.status === 'error') return state.data ? 'liste + uyarı' : 'hata + yeniden dene'
  return state.data.length === 0 ? 'boş durum' : 'liste'
}

let state: Remote<string[]> = { status: 'loading' }
assert.equal(screen(state), 'iskelet')
state = reduce(state, { type: 'resolve', data: [] })
assert.equal(screen(state), 'boş durum') // boş, hatadan AYRI bir durumdur
state = reduce(reduce(state, { type: 'resolve', data: ['Süt al'] }), { type: 'fetch' })
assert.deepEqual(state, { status: 'success', data: ['Süt al'], refreshing: true })
state = reduce(state, { type: 'reject', error: 'Bağlantı yok' })
assert.equal(screen(state), 'liste + uyarı')
assert.equal(screen(reduce({ status: 'loading' }, { type: 'reject', error: 'x' })), 'hata + yeniden dene')
console.log('tamam')
```

```cikti
tamam
```

## `fetch`'in tuzakları

`fetch` HTTP 4xx/5xx yanıtında **hata fırlatmaz**; yalnız ağa hiç ulaşılamazsa fırlatır. Her çağrı `response.ok`
denetlemeli; bunu her yerde yazmamak için tek bir sarmalayıcı kullanın:

```js calistir
import assert from 'node:assert/strict'
import { createServer } from 'node:http'

class HttpError extends Error {
  constructor(status, body) { super(`HTTP ${status}`); this.name = 'HttpError'; this.status = status; this.body = body }
}
class NetworkError extends Error {
  constructor(cause) { super('Sunucuya ulaşılamadı', { cause }); this.name = 'NetworkError' }
}

async function fetchJson(url, init) {
  let response
  try {
    response = await fetch(url, init)
  } catch (error) {
    if (error.name === 'AbortError') throw error // iptal bir hata değildir; çağıran yok sayar
    throw new NetworkError(error)
  }
  const text = await response.text()
  const body = text ? JSON.parse(text) : null // 204 ve boş gövdede response.json() patlar
  if (!response.ok) throw new HttpError(response.status, body)
  return body
}

const server = createServer((req, res) => {
  if (req.url === '/bos') return res.writeHead(204).end()
  res.writeHead(req.url === '/ok' ? 200 : 500, { 'content-type': 'application/json' })
  res.end(JSON.stringify(req.url === '/ok' ? { ad: 'Ayşe' } : { code: 'internal' }))
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`

const raw = await fetch(`${base}/hata`) // HTTP 500: fetch FIRLATMADI
assert.equal(raw.ok, false)
assert.equal(raw.status, 500)
await raw.text()

assert.deepEqual(await fetchJson(`${base}/ok`), { ad: 'Ayşe' })
assert.equal(await fetchJson(`${base}/bos`), null)
await assert.rejects(fetchJson(`${base}/hata`), (e) => e instanceof HttpError && e.status === 500)

await new Promise((resolve) => server.close(resolve))
await assert.rejects(fetchJson(`${base}/ok`), (e) => e instanceof NetworkError) // ağ hatası ayrı tür
console.log('tamam')
```

Öteki `fetch` tuzakları: varsayılan zaman aşımı yoktur (`AbortSignal.timeout(ms)` ekleyin); başka kökene çerez
göndermek `credentials: 'include'` ister; CORS hatası JavaScript'e ayrıntısız `TypeError` olarak gelir (nedeni
yalnız tarayıcı konsolunda görünür); `response.json()` gövdeyi bir kez okur.

## Yarış ve iptal

Kural: **son istenen kazanır.** Önceki isteği iptal edin (`AbortController`) ve geç gelen yanıtı yok sayın. Effect
içinde nasıl yazıldığı ve çalışan örnek: [React etkileri ve kancalar](react-etkiler-ve-kancalar.md#veri-getirmede-yarış).

- Kullanıcının iptali ile zaman aşımını birleştirmek: `AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)])`.
  Eski tarayıcılarda `AbortSignal.any` olmayabilir; özellik algılayın.
- İptal edilen istek `AbortError` (zaman aşımı `TimeoutError`) ile reddedilir. `AbortError` kullanıcıya hata olarak
  gösterilmez; `TimeoutError` gösterilir ("Yanıt gecikti, yeniden deneyin").
- Arama kutusunda her tuşta istek atmayın: 250–400 ms bekleme (debounce) + iptal birlikte kullanılır.

## Önbellek ve tazelik

| Kavram                      | Anlamı                                                         | Tipik değer (ürüne göre)                |
| --------------------------- | -------------------------------------------------------------- | --------------------------------------- |
| Tazelik süresi (stale time) | Bu süre içinde aynı veri için ağa gidilmez                     | Liste: 30 sn–5 dk; profil: dakikalar    |
| Bayatken tazele (SWR)       | Bayat veri anında gösterilir, arkada yenisi getirilir          | Çoğu okuma için varsayılan              |
| Tekilleştirme (dedupe)      | Aynı anda aynı anahtara giden istekler tek istekte birleşir    | Her zaman                               |
| Atma süresi (gc time)       | Kullanılmayan önbellek girdisi bu süre sonra silinir           | Dakikalar                               |
| Geçersiz kılma (invalidate) | Yazmadan sonra ilgili anahtarlar bayat sayılır                 | Her yazmada                             |

Kütüphaneler (TanStack Query, SWR) bu kavramlara farklı adlar verir ve sürümler arasında değiştirir; kurulu sürümün
belgesine bakın. Fikri gösteren küçük bir önbellek:

```js calistir
import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'

function createCache({ staleMs, now }) {
  const store = new Map() // anahtar → { data, at }
  const inflight = new Map() // anahtar → süren istek
  const load = (key, fetcher) => {
    if (!inflight.has(key)) {
      const promise = fetcher()
        .then((data) => { store.set(key, { data, at: now() }); return data })
        .finally(() => inflight.delete(key))
      inflight.set(key, promise)
    }
    return inflight.get(key)
  }
  return {
    load,
    async get(key, fetcher) {
      const hit = store.get(key)
      if (!hit) return { data: await load(key, fetcher), revalidating: false }
      if (now() - hit.at < staleMs) return { data: hit.data, revalidating: false }
      void load(key, fetcher) // bayat: eldekini HEMEN ver, arkada tazele
      return { data: hit.data, revalidating: true }
    },
  }
}

let clock = 0
let calls = 0
const fetcher = async () => { calls++; await sleep(5); return `sürüm ${calls}` }
const cache = createCache({ staleMs: 30_000, now: () => clock })

const three = await Promise.all([1, 2, 3].map(() => cache.get('uyeler', fetcher))) // üç bileşen aynı anda
assert.equal(calls, 1) // tek istek
assert.deepEqual(three.map((r) => r.data), ['sürüm 1', 'sürüm 1', 'sürüm 1'])

clock = 10_000 // taze: ağa gidilmez
assert.deepEqual(await cache.get('uyeler', fetcher), { data: 'sürüm 1', revalidating: false })
clock = 45_000 // bayat: eski veri anında döner, arkada tazelenir
assert.deepEqual(await cache.get('uyeler', fetcher), { data: 'sürüm 1', revalidating: true })
await cache.load('uyeler', fetcher) // arkadaki isteği bekle (aynı söz, yeni istek değil)
assert.equal(calls, 2)
assert.equal((await cache.get('uyeler', fetcher)).data, 'sürüm 2')
console.log('tamam')
```

Önbellek anahtarı isteği **tam** tanımlamalıdır: `['gorevler', { listeId, sayfa, suzgec }]`. Anahtara girmeyen bir
parametre başka bir ekranın verisini gösterir. Kullanıcıya özel veri anahtarı oturum değişince temizlenir.

## İyimser güncelleme ve geri alma

İyimser güncelleme (optimistic update): değişikliği ekranda hemen gösterip sunucuyu arkadan beklemek. Sunucu
reddederse **yalnız o değişiklik** geri alınır.

```js calistir
import assert from 'node:assert/strict'

function createOptimisticList(initial) {
  let confirmed = initial // sunucunun onayladığı hâl
  const pending = new Map() // işlem kimliği → değişiklik işlevi
  return {
    view: () => [...pending.values()].reduce((list, apply) => apply(list), confirmed),
    async run(id, apply, send) {
      pending.set(id, apply) // ekranda hemen görünür
      try {
        await send()
        confirmed = apply(confirmed) // onaylandı
      } finally {
        pending.delete(id) // başarıda da hatada da bekleyenlerden çıkar
      }
    },
  }
}

const list = createOptimisticList([{ id: 1, done: false }, { id: 2, done: false }])
const toggle = (taskId) => (tasks) => tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t))

const first = list.run('a', toggle(1), () => new Promise((resolve) => setTimeout(resolve, 20)))
const second = list.run('b', toggle(2), () => new Promise((_, reject) => setTimeout(() => reject(new Error('409')), 10)))
assert.deepEqual(list.view().map((t) => t.done), [true, true]) // ikisi de anında görünür

await assert.rejects(second)
assert.deepEqual(list.view().map((t) => t.done), [true, false]) // yalnız reddedilen geri alındı
await first
assert.deepEqual(list.view().map((t) => t.done), [true, false])
console.log('tamam')
```

YANLIŞ yol: işlem başlarken bütün listenin anlık görüntüsünü alıp hatada ona dönmek; aradaki **başka** iyimser
değişikliği de siler. React 19'da `useOptimistic` bu "onaylı hâl + bekleyenler" ayrımını hazır verir.

| İyimser güncelleme uygun                         | Uygun değil (bekle, sonra göster)                      |
| ------------------------------------------------ | ------------------------------------------------------ |
| Onay kutusu, beğeni, sıralama, yeniden adlandırma | Ödeme, para transferi, geri alınamaz silme             |
| Başarı olasılığı çok yüksek                      | Sunucu sık reddediyor (kota, yetki, çakışma)           |
| Geri alma kullanıcıyı şaşırtmaz                  | Sonraki adım sunucunun ürettiği kimliğe muhtaç         |

Geri alındığında kullanıcıya söyleyin ("Kaydedilemedi, eski hâline döndü · Yeniden dene"); sessizce geri dönen
onay kutusu kullanıcıyı şaşırtır.

## Sayfalama ve sonsuz kaydırma

| Yöntem                         | Ne zaman                                          | Sorun                                               |
| ------------------------------ | ------------------------------------------------- | --------------------------------------------------- |
| Sayfa numarası (offset/limit)  | Sabit, küçük veri; "5. sayfaya git" gerekiyorsa   | Araya kayıt girince öğe tekrarlanır ya da atlanır   |
| İmleç (cursor / keyset)        | Akış, sonsuz kaydırma, sık değişen liste          | Sayfaya atlanamaz; sıralama alanı tekil olmalı      |

```js calistir
import assert from 'node:assert/strict'

// Sayfaları birleştirirken kimliğe göre tekilleştir, sırayı koru.
function mergePages(pages) {
  const seen = new Set()
  return pages.flatMap((page) => page.filter((id) => !seen.has(id) && seen.add(id)))
}

const before = ['e5', 'e4', 'e3', 'e2', 'e1'] // en yeni başta
const page1 = before.slice(0, 2) // e5, e4
const after = ['e6', ...before] // kullanıcı kaydırırken yeni kayıt geldi

const page2ByOffset = after.slice(2, 4) // "2. sayfa": e4 TEKRAR geldi
assert.deepEqual(page2ByOffset, ['e4', 'e3'])
assert.deepEqual(mergePages([page1, page2ByOffset]), ['e5', 'e4', 'e3'])

const afterCursor = (list, cursor, limit) => list.slice(list.indexOf(cursor) + 1, list.indexOf(cursor) + 1 + limit)
assert.deepEqual(afterCursor(after, 'e4', 2), ['e3', 'e2']) // imleç: kayma yok
console.log('tamam')
```

Sonsuz kaydırma kuralları: listenin sonuna bir gözcü (sentinel) koyup `IntersectionObserver` ile sonraki sayfayı
isteyin; yanına **"Daha fazla yükle" düğmesi** de koyun (klavye, ekran okuyucu ve gözlemcinin tetiklenmediği
durumlar için). Altbilgiye ulaşılması gereken sayfada sonsuz kaydırma kullanmayın. Detaya gidip geri dönünce
yüklenmiş sayfalar ve kaydırma yeri korunmalıdır (önbellekte tutun; bkz. [yönlendirme](yonlendirme-ve-url.md)).

## Çevrimdışı davranış

- `navigator.onLine === false` güvenilirdir (bağlantı kesin yok); `true` ise yalnız bir ağa bağlı olunduğunu söyler,
  internete ulaşıldığını değil. Asıl ölçüt isteğin sonucudur.
- `online` / `offline` olaylarını gösterge için dinleyin; "çevrimiçi oldu" olayında bekleyen yazmaları gönderin ve
  bayat sorguları tazeleyin.
- Okumada: önbellekteki ya da yerel veritabanındaki veriyi gösterin, "son güncelleme 10:42" ekleyin. Hiç veri yoksa
  "İnternet yok" boş durumu; sonsuz döndürücü değil.
- Yazmada: ya engelleyin ve söyleyin ("İnternet gelince kaydedebilirsiniz") ya da bir giden kutusuna (outbox) yazıp
  bağlantı gelince gönderin. İkinci yol yerel-önce mimaridir; havuzdaki uygulama temeli böyle çalışır
  ([`ESITLEME.md`](../../uygulama/docs/ESITLEME.md)).
- Servis çalışanı API yanıtlarını önbelleğe almaz; veri çevrimdışı ancak veritabanında ya da sizin önbelleğinizde
  varsa görünür ([PWA ve çevrimdışı](pwa-ve-cevrimdisi.md)).

## Yeniden deneme

```js calistir
import assert from 'node:assert/strict'

// Ağ hatası, 408, 429, 5xx yeniden denenir. Diğer 4xx: hayır (aynı istek yine reddedilir).
function shouldRetry(error, { method, attempt, maxAttempts = 4 }) {
  if (attempt >= maxAttempts) return false
  const safeToRepeat = ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS'].includes(method) || Boolean(error.idempotencyKey)
  if (!safeToRepeat) return false // POST'u körlemesine tekrarlamak çift kayıt üretir
  if (error.name === 'NetworkError') return true
  return error.status === 408 || error.status === 429 || error.status >= 500
}

// Üstel geri çekilme + tam titreme (full jitter): 0 … min(tavan, taban·2^deneme)
const backoffMs = (attempt, random, base = 500, cap = 30_000) => Math.floor(random() * Math.min(cap, base * 2 ** attempt))

assert.equal(shouldRetry({ name: 'NetworkError' }, { method: 'GET', attempt: 1 }), true)
assert.equal(shouldRetry({ status: 503 }, { method: 'GET', attempt: 1 }), true)
assert.equal(shouldRetry({ status: 422 }, { method: 'GET', attempt: 1 }), false) // doğrulama hatası
assert.equal(shouldRetry({ status: 401 }, { method: 'GET', attempt: 1 }), false) // yeniden giriş gerekir
assert.equal(shouldRetry({ status: 503 }, { method: 'POST', attempt: 1 }), false)
assert.equal(shouldRetry({ status: 503, idempotencyKey: 'k1' }, { method: 'POST', attempt: 1 }), true)
assert.equal(shouldRetry({ status: 503 }, { method: 'GET', attempt: 4 }), false) // sınır
assert.equal(backoffMs(3, () => 0.5), 2000) // 500·2³ = 4000'in yarısı
assert.equal(backoffMs(10, () => 0.999), 29_970) // tavana takıldı
console.log('tamam')
```

- 429 ve 503 yanıtındaki `Retry-After` başlığına uyun (saniye ya da HTTP tarihi olabilir).
- Titreme (jitter), binlerce istemcinin aynı anda yeniden denemesini dağıtır; titremesiz geri çekilme sunucuyu
  dalgalar hâlinde döver.
- Kullanıcı beklerken 2-3 denemeden sonra durun ve "Yeniden dene" düğmesi gösterin; arka plan eşitlemesi daha sabırlı
  olabilir.
- POST'u güvenle tekrarlamak için istemci her işlem için bir `Idempotency-Key` üretir; sunucu aynı anahtarı ikinci kez
  görünce ilk sonucu döndürür.

Hazır, sınanmış gerçekleme: [`yeniden_dene.ts`](../../kutuphane/ts/src/yeniden_dene.ts) (geri çekilme, titreme,
`Retry-After`, iptal).

## Tuzaklar

| Belirti                                                  | Neden                                                     | Çözüm                                                       |
| -------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| Sunucu 500 döndü ama ekran "boş liste" gösteriyor        | `response.ok` denetlenmemiş ya da hata boş diziye çevrilmiş | Tek sarmalayıcı; hata ayrı durum                          |
| Döndürücü sonsuza dek dönüyor                            | Zaman aşımı yok; hata dalında `loading` kapanmıyor        | `AbortSignal.timeout`; her dalda durumu bitirin             |
| Arama sonuçları eski sorguya ait                         | Yarış                                                     | İptal + yok sayma; son istenen kazanır                      |
| Tazelerken liste kayboluyor, sayfa zıplıyor              | Tazeleme "yükleniyor"a dönüyor                            | Eldeki veriyi koruyun, küçük gösterge                       |
| Aynı veri için ağda 3 özdeş istek                        | Tekilleştirme yok                                         | Süren isteği paylaşın (önbellek katmanı)                    |
| Yavaş ağda çift sipariş/kayıt                            | Çift tıklama ya da POST'un otomatik tekrarı               | Gönderirken düğmeyi kilitleyin; idempotency anahtarı        |
| Sonsuz kaydırmada öğe iki kez görünüyor                  | Offset sayfalama + araya giren kayıt                      | İmleç; birleştirirken kimliğe göre tekilleştirin            |
| Çıkış yapınca önceki kullanıcının verisi bir an görünüyor | Önbellek oturum değişince temizlenmemiş                  | Çıkışta önbelleği temizleyin; anahtara kullanıcı kimliği    |
| İyimser değişiklik geri alınınca başka değişiklik de kayboldu | Hatada bütün listenin eski anlık görüntüsüne dönülmüş | Yalnız o işlemi geri alın                                   |
| Çevrimdışıyken her ekranda farklı hata metni             | Ağ hatası her yerde ayrı ele alınmış                      | `NetworkError` türü + tek ileti eşlemesi                    |

## Denetim listesi

- [ ] Her okuma ekranında dört durum (yükleniyor, hata, boş, veri) ayrı ayrı görülüp denendi.
- [ ] Tek bir `fetch` sarmalayıcısı `response.ok`, boş gövde, ağ hatası ve zaman aşımını ele alıyor.
- [ ] Parametresi değişen her okuma önceki isteği iptal ediyor ya da yanıtını yok sayıyor.
- [ ] Tazeleme sırasında eldeki veri ekranda kalıyor.
- [ ] Önbellek anahtarı isteğin bütün parametrelerini ve kullanıcıyı içeriyor; çıkışta temizleniyor.
- [ ] Yazma düğmeleri gönderirken kilitli; POST tekrarlanıyorsa idempotency anahtarı var.
- [ ] Yeniden deneme yalnız ağ hatası, 408, 429, 5xx için; sınırlı sayıda; titremeli.
- [ ] Uçak modunda her ekran denendi: sonsuz döndürücü yok, anlaşılır ileti var.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu ekran için yükleniyor, hata (yeniden dene düğmesiyle), boş ve veri durumlarının dördünü de
  yaz. Projedeki `fetchJson`/`useRemote` sarmalayıcısını kullan; yeni `fetch` çağrısı yazma. Parametre değişince
  önceki isteği iptal et."
- **Modelin tipik hatası:** Yalnız mutlu yolu yazar; `catch` içinde `setItems([])` ile hatayı boş listeye çevirir;
  `response.ok` denetlemez; `loading`'i yalnız başarı dalında kapatır.
- **Çıktıda arayın:** çıplak `fetch(` çağrıları; `.json()` öncesi `ok` denetimi; `catch` bloğunda boş dizi/null
  ataması; `useEffect` içinde iptalsiz istek; POST için otomatik yeniden deneme.
- **Test isteyin:** sahte API ile 500, ağ hatası, boş liste ve gecikmeli yanıt senaryoları; "hızlı iki sorguda son
  sorgunun sonucu görünür".

## İlgili

- [React etkileri ve kancalar](react-etkiler-ve-kancalar.md) — effect içinde yarış ve temizlik
- [Durum yönetimi seçimi](durum-yonetimi-secimi.md) — sunucu verisi neden global depoya konmaz
- [Hata ve boş durumlar](hata-ve-bos-durumlar.md) — metin kalıpları ve görünüm
- [PWA ve çevrimdışı](pwa-ve-cevrimdisi.md) — servis çalışanı ve API önbelleği
- Çalışan örnekler: [`api.ts`](../../uygulama/web/src/lib/api.ts) (istemci sarmalayıcısı),
  [`errors.ts`](../../uygulama/web/src/lib/errors.ts) (`NetworkError` ve ileti eşlemesi),
  [`sayfalama.ts`](../../kutuphane/ts/src/sayfalama.ts) (imleç kodlama)
- Başka kümelerde: [HTTP temelleri](../30-arkauc/http-temelleri.md), [API tasarımı](../30-arkauc/api-tasarimi.md) (hata gövdesi, sayfalama, idempotentlik anahtarı), [Dayanıklılık kalıpları](../40-sistem-tasarimi/dayaniklilik-kaliplari.md) (zaman aşımı, yeniden deneme bütçesi), [JavaScript eşzamansızlık](../10-diller/javascript-async.md)
