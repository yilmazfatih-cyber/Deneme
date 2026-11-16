---
baslik: JavaScript async kalıpları
ozet: Unutulan await, sıralı ve paralel bekleme, Promise.all/allSettled/race/any, hata yutma, zaman aşımı ve AbortController, eski yanıtın yenisini ezmesi, eşzamanlılık sınırı.
etiketler: [javascript, async, promise, eszamanlilik, node]
duzey: orta
guncellik: 2026-11
---

# JavaScript async kalıpları

> Bu notu ne zaman okumalı: `async`/`await`, `fetch`, `Promise.all` yazarken; arama kutusu yanlış sonuç gösteriyorsa;
> sayfa "bazen" donuyor ya da istek hiç bitmiyorsa; bir hata kayboluyor ya da süreç `unhandled rejection` ile
> çöküyorsa.

## Temel fikir

- `async` işlev her zaman bir **Promise** döndürür. `await` yazılmazsa elinizde sonuç değil, Promise nesnesi vardır;
  Promise nesnesi her zaman "doğru" (truthy) sayılır.
- `await` sırayla bekletir. Birbirinden bağımsız işleri sırayla beklemek süreyi toplar; birlikte başlatmak en uzun
  olanın süresine indirir.
- Hata Promise zinciri boyunca akar. Bir yerde yakalanıp **yutulursa** program yanlış veriyle devam eder; hiç
  yakalanmazsa Node süreci çöker.
- Zaman aşımı "beklemeyi bırakmak" değil, **işi durdurmaktır**: `AbortController` sinyali işin kendisine verilir.
- Bir istek yolda iken yenisi başlarsa yanıtlar **herhangi bir sırayla** gelebilir. Eski yanıtın yenisini ezmesini
  kod açıkça engellemelidir.

## Karar tablosu

| Durum                                                   | Seçim                                             | Neden                                          |
| ------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| Bağımsız işler, hepsi gerekli                            | `Promise.all`                                     | Paralel; ilk hatada reddeder                   |
| Bağımsız işler, bazıları başarısız olabilir (toplu iş)   | `Promise.allSettled`                              | Her birinin sonucunu ayrı raporlar             |
| İş bir öncekinin sonucuna bağlı                          | Sırayla `await`                                   | Veri bağımlılığı                               |
| Çok sayıda iş, karşı taraf sınırlı (API kotası)          | Eşzamanlılık sınırı (havuz)                        | Hepsini birden açmak 429/çökme getirir         |
| Aynı veri birkaç kaynaktan; ilk başarılı yeter           | `Promise.any`                                     | `race` ilk **hatada** da biter                 |
| İsteğin bir üst süresi olmalı                            | `AbortSignal.timeout(ms)` işe verilir             | İş gerçekten durur                             |
| Kullanıcı vazgeçebilir ya da yeni istek eskisini geçersiz kılar | `AbortController` + son isteği izleme      | Eski yanıt ekranı ezmez                        |

## Unutulan await

```js calistir
import assert from 'node:assert/strict'

async function yetkiliMi(kullanici) {
  return kullanici === 'yonetici'
}

// YANLIŞ: await yok → Promise nesnesi her zaman doğru sayılır
let iceriGirdi = false
if (yetkiliMi('misafir')) iceriGirdi = true
assert.equal(iceriGirdi, true) // misafir içeri girdi!
assert.equal(await yetkiliMi('misafir'), false) // DOĞRU

// try/catch içinde `return` ile `return await` farklıdır
const riskli = async () => {
  throw new Error('ağ hatası')
}
async function yanlis() {
  try {
    return riskli() // Promise olduğu gibi döner; ret try bloğundan SONRA olur
  } catch {
    return 'yedek'
  }
}
async function dogru() {
  try {
    return await riskli() // ret burada, try içinde olur ve yakalanır
  } catch {
    return 'yedek'
  }
}
await assert.rejects(yanlis(), /ağ hatası/)
assert.equal(await dogru(), 'yedek')
console.log('tamam')
```

Bu iki hatayı derleyici değil **lint** yakalar: `@typescript-eslint/no-floating-promises`, `no-misused-promises`
(Promise'i `if` içinde kullanmak) ve `return-await`. Havuzdaki örnek ayar:
[`uygulama/eslint.config.js`](../../uygulama/eslint.config.js).

## Sıralı ve paralel

```js calistir
import assert from 'node:assert/strict'
import { setTimeout as bekle } from 'node:timers/promises'

const getir = (ad) => bekle(100, ad) // 100 ms süren bağımsız bir istek gibi

let t0 = performance.now()
const a = await getir('kullanıcı')
const b = await getir('siparişler')
const c = await getir('bildirimler')
const sirali = performance.now() - t0

t0 = performance.now()
const [x, y, z] = await Promise.all([getir('kullanıcı'), getir('siparişler'), getir('bildirimler')])
const paralel = performance.now() - t0

assert.deepEqual([a, b, c], [x, y, z])
assert.ok(sirali >= 290, `sıralı ~300 ms sürmeli: ${sirali}`)
assert.ok(paralel < sirali * 0.6, `paralel ~100 ms sürmeli: ${paralel}`)
console.log('tamam')
```

## all, allSettled, race, any

```js calistir
import assert from 'node:assert/strict'
import { setTimeout as bekle } from 'node:timers/promises'

const basarili = (ms, deger) => bekle(ms, deger)
const basarisiz = async (ms, ileti) => {
  await bekle(ms)
  throw new Error(ileti)
}

// all: ilk hatada reddeder; ÖTEKİ işler durmaz, sonuçları kaybolur
await assert.rejects(Promise.all([basarili(30, 'a'), basarisiz(10, 'b bozuk')]), /b bozuk/)

// allSettled: hepsini bekler, her birinin durumunu verir
const sonuclar = await Promise.allSettled([basarili(10, 'a'), basarisiz(10, 'b bozuk')])
assert.deepEqual(sonuclar.map((s) => s.status), ['fulfilled', 'rejected'])
const hatalar = sonuclar.filter((s) => s.status === 'rejected').map((s) => s.reason.message)
assert.deepEqual(hatalar, ['b bozuk'])

// race: ilk SONUÇLANAN kazanır, hata da olsa. any: ilk BAŞARILI kazanır
await assert.rejects(Promise.race([basarisiz(5, 'hızlı hata'), basarili(50, 'yavaş')]), /hızlı hata/)
assert.equal(await Promise.any([basarisiz(5, 'hızlı hata'), basarili(20, 'yedek sunucu')]), 'yedek sunucu')
console.log('tamam')
```

`Promise.all` reddedince öteki işler **arka planda sürer**. Yan etkili işlerde (ödeme, e-posta) bu önemlidir:
iptal gerekiyorsa hepsine aynı `AbortSignal`'ı verin ve hata anında `abort()` edin.

## Hata yutma

```js calistir
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

const kaydet = async () => {
  throw new Error('disk dolu')
}

// YANLIŞ: boş catch hatayı yutar; çağıran başarı sanır
async function kaydetYutan() {
  try {
    await kaydet()
  } catch {
    // sonra bakarız
  }
  return 'Kaydedildi'
}
assert.equal(await kaydetYutan(), 'Kaydedildi') // kullanıcıya yanlış bilgi

// DOĞRU: bağlam ekleyip yeniden at; ne gösterileceğine üst katman karar verir
async function kaydetDogru() {
  try {
    await kaydet()
  } catch (e) {
    throw new Error('Taslak kaydedilemedi', { cause: e })
  }
  return 'Kaydedildi'
}
await assert.rejects(kaydetDogru(), (e) => e.message === 'Taslak kaydedilemedi' && e.cause.message === 'disk dolu')

// Hiç yakalanmayan ret Node sürecini çökertir (çıkış kodu 1)
const cocuk = spawnSync(process.execPath, ['-e', 'Promise.reject(new Error("yakalanmadı"))'])
assert.equal(cocuk.status, 1)
console.log('tamam')
```

Yutma biçimleri: boş `catch {}`, `.catch(() => {})`, `catch (e) { console.log(e) }` ardından devam etmek, `await`'i
unutup Promise'i bırakmak. Ayrıntı: [Hata yönetimi kalıpları](hata-yonetimi-kaliplari.md).

## Zaman aşımı ve iptal

```js calistir
import assert from 'node:assert/strict'
import { setTimeout as bekle } from 'node:timers/promises'

// İptal edilebilir uzun bir iş (gerçek kodda: fetch(url, { signal }))
async function rapor(signal) {
  await bekle(500, null, { signal })
  return 'rapor'
}

// Zaman aşımı: sinyal işin kendisine verilir; iş gerçekten durur
await assert.rejects(rapor(AbortSignal.timeout(30)), (e) => e.name === 'AbortError' && e.cause.name === 'TimeoutError')

// Kullanıcı iptali ile zaman aşımını birleştirmek: AbortSignal.any
const kullanici = new AbortController()
const sinyal = AbortSignal.any([kullanici.signal, AbortSignal.timeout(5000)])
setTimeout(() => kullanici.abort(), 20)
await assert.rejects(rapor(sinyal), { name: 'AbortError' })
console.log('tamam')
```

`fetch` iki şeyi şaşırtır: HTTP hatasında (404, 500) **reddetmez**, ve makul bir zaman aşımı yoktur (Node 22.23.4'te yanıt başlığı ve gövde için
5'er dakika: paketli undici kaynağından okundu; tarayıcıda `fetch`'in kendi süresi yoktur). Güvenli sarmalayıcı:

```js calistir
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'

async function getirJson(url, { signal, zamanAsimiMs = 10_000 } = {}) {
  const sinyaller = [AbortSignal.timeout(zamanAsimiMs), ...(signal ? [signal] : [])]
  const yanit = await fetch(url, { signal: AbortSignal.any(sinyaller) })
  if (!yanit.ok) throw new Error(`HTTP ${yanit.status}: ${url}`)
  return yanit.json()
}

const sunucu = createServer((istek, yanit) => {
  if (istek.url === '/yavas') setTimeout(() => yanit.end('{}'), 300)
  else if (istek.url === '/bozuk') yanit.writeHead(500).end('{"hata": "sunucu"}')
  else yanit.end('{"ad": "Ayşe"}')
})
sunucu.listen(0, '127.0.0.1')
await once(sunucu, 'listening')
const adres = `http://127.0.0.1:${sunucu.address().port}`

assert.equal((await fetch(`${adres}/bozuk`)).ok, false) // düz fetch: 500 "başarılı" döner
await assert.rejects(getirJson(`${adres}/bozuk`), /HTTP 500/)
await assert.rejects(getirJson(`${adres}/yavas`, { zamanAsimiMs: 50 }), { name: 'TimeoutError' })
assert.deepEqual(await getirJson(`${adres}/ok`), { ad: 'Ayşe' })
sunucu.closeAllConnections()
sunucu.close()
console.log('tamam')
```

`fetch` zaman aşımında `TimeoutError`, elle iptalde `AbortError` ile reddeder (Node 22.23.4, denendi). İptali
kullanıcıya hata olarak göstermeyin: `e.name === 'AbortError'` ise sessizce çıkın.

## Yarış durumu: eski yanıt yenisini ezer

```js calistir
import assert from 'node:assert/strict'
import { setTimeout as bekle } from 'node:timers/promises'

// Arama kutusu: önce "a" (yavaş yanıt), hemen ardından "ab" (hızlı yanıt)
const ara = (q, signal) => bekle(q === 'a' ? 80 : 10, `${q} sonuçları`, { signal })

// YANLIŞ: hangi yanıt SON gelirse ekrana o yazılır
let ekran = ''
await Promise.all(['a', 'ab'].map(async (q) => {
  ekran = await ara(q)
}))
assert.equal(ekran, 'a sonuçları') // kullanıcı "ab" yazdı, "a" sonuçlarını görüyor

// DOĞRU 1: sıra numarası; yalnız en son isteğin yanıtı yazılır
let sonIstek = 0
await Promise.all(['a', 'ab'].map(async (q) => {
  const no = ++sonIstek
  const sonuc = await ara(q)
  if (no === sonIstek) ekran = sonuc
}))
assert.equal(ekran, 'ab sonuçları')

// DOĞRU 2: yeni istek eskisini iptal eder (sunucu da boşuna çalışmaz)
let denetci = null
ekran = ''
await Promise.allSettled(['a', 'ab'].map(async (q) => {
  denetci?.abort()
  denetci = new AbortController()
  ekran = await ara(q, denetci.signal)
}))
assert.equal(ekran, 'ab sonuçları')
console.log('tamam')
```

Aynı hata sunucuda da olur: iki istek aynı kaydı okuyup değiştirirse biri ötekinin yazdığını ezer (kayıp
güncelleme). Çözümü veritabanı tarafındadır: [SQL performans ve işlem](sql-performans-ve-islem.md).

## Eşzamanlılık sınırı ve döngüde await

```js calistir
import assert from 'node:assert/strict'
import { setTimeout as bekle } from 'node:timers/promises'

// Aynı anda en fazla `sinir` iş; sonuçlar girdi sırasıyla döner
async function sinirliEsZamanli(ogeler, sinir, is) {
  const sonuclar = new Array(ogeler.length)
  let sirada = 0
  async function isci() {
    while (sirada < ogeler.length) {
      const i = sirada++
      sonuclar[i] = await is(ogeler[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(sinir, ogeler.length) }, isci))
  return sonuclar
}

let calisan = 0
let enCok = 0
const sonuc = await sinirliEsZamanli([50, 10, 30, 20, 40, 10], 2, async (ms) => {
  calisan++
  enCok = Math.max(enCok, calisan)
  await bekle(ms)
  calisan--
  return ms * 2
})
assert.equal(enCok, 2)
assert.deepEqual(sonuc, [100, 20, 60, 40, 80, 20])

// YANLIŞ: forEach async geri çağrıyı BEKLEMEZ
const fiyatGetir = async (urun) => {
  await bekle(10)
  return urun.length * 100
}
const urunler = ['çay', 'simit', 'su']
let toplamYanlis = 0
urunler.forEach(async (u) => {
  toplamYanlis += await fiyatGetir(u)
})
assert.equal(toplamYanlis, 0) // bu satırda hiçbir fiyat gelmemişti

// Sıra gerekiyorsa for...of + await; bağımsızsa map + Promise.all
let toplam = 0
for (const u of urunler) toplam += await fiyatGetir(u)
const fiyatlar = await Promise.all(urunler.map(fiyatGetir))
assert.equal(toplam, 1000)
assert.equal(fiyatlar.reduce((a, b) => a + b, 0), 1000)
console.log('tamam')
```

Bu havuz kalıbında bir iş hata verirse `Promise.all` reddeder ama öteki işçiler kuyruktaki işleri bitirmeye devam
eder. Hata anında durmak gerekiyorsa işçiler ortak bir `AbortSignal`'ı denetlemelidir.

## Tuzaklar

| Belirti                                                        | Neden                                                     | Çözüm                                                       |
| -------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| Yetki/varlık denetimi her zaman "evet" diyor                    | `if (asyncIslev())`: Promise her zaman doğru sayılır      | `await`; lint `no-misused-promises`                          |
| `try/catch` hatayı yakalamıyor                                  | `return promise` (await'siz)                              | `return await promise`                                       |
| Sayfa açılışı istek sayısıyla orantılı yavaş                     | Bağımsız istekler sırayla bekleniyor                      | `Promise.all`                                                |
| 429 "çok fazla istek" ya da bellek taşması                       | Yüzlerce istek birden başlatıldı                          | Eşzamanlılık sınırı (2–8)                                    |
| Bir öğe bozukken tüm toplu iş boşa gitti                         | `Promise.all` ilk hatada reddeder                         | `allSettled` + hata raporu                                   |
| Hata yok ama veri kaydedilmemiş                                 | Boş `catch` ya da `.catch(() => {})`                       | Bağlamla yeniden atın; yalnız sınırda yakalayın              |
| Süreç `unhandledRejection` ile çöktü                             | Kimsenin beklemediği ve yakalamadığı Promise              | Her Promise'i `await` edin ya da `.catch` ile ele alın        |
| İstek dakikalarca asılı kalıyor                                 | `fetch`'in makul bir varsayılan zaman aşımı yok           | `AbortSignal.timeout(ms)`                                    |
| 404/500 yanıtı başarılı gibi işlendi                             | `fetch` HTTP hatasında reddetmez                          | `if (!yanit.ok) throw …`                                      |
| Arama kutusu eski sonuçları gösteriyor                          | Yavaş eski yanıt yenisinden sonra geldi                   | Sıra numarası ya da önceki isteği `abort()`                  |
| `forEach` sonrası toplam 0 / işlem bitmeden yanıt döndü          | `forEach` async geri çağrıyı beklemez                     | `for...of` + `await` ya da `Promise.all(map)`                 |
| `Promise.race` ile zaman aşımı kuruldu ama iş arka planda sürüyor | `race` yalnız beklemeyi bırakır                           | Sinyali işe verin (`AbortSignal`)                            |

## Denetim listesi

- [ ] Her `async` çağrı ya `await` ediliyor ya da bilinçli olarak `void` + `.catch` ile bırakılmış.
- [ ] Lint'te `no-floating-promises` ve `no-misused-promises` açık ve temiz.
- [ ] Bağımsız istekler paralel; bağımlı olanlar sıralı; çok sayıda iş eşzamanlılık sınırıyla.
- [ ] Her ağ isteğinin zaman aşımı var ve sinyal işin kendisine veriliyor.
- [ ] Her `fetch` sonrası `yanit.ok` denetleniyor.
- [ ] Boş `catch` yok; yakalanan hata ya ele alınıyor ya da `cause` ile yeniden atılıyor.
- [ ] Kullanıcı girdisine bağlı istekler (arama, süzgeç, sayfa değişimi) eski yanıtı yok sayıyor ya da iptal ediyor.
- [ ] İptal (`AbortError`) kullanıcıya hata olarak gösterilmiyor.
- [ ] Testte yavaş/sıra dışı yanıt senaryosu var (eski yanıt sonra gelir).

## Küçük modele yaptırırken

- **İsteme yazın:** "Bağımsız istekleri `Promise.all` ile paralel yap; her `fetch`'e `AbortSignal.timeout` ver ve
  `yanit.ok` denetle; boş `catch` yazma; arama gibi art arda isteklerde eski yanıtı yok say ya da iptal et."
- **Modelin tipik hatası:** `forEach(async …)` yazar; `try { return fetch(…) }` yazar; `catch (e) { console.error(e) }`
  ile hatayı yutar; zaman aşımını `Promise.race` + `setTimeout` ile kurup zamanlayıcıyı temizlemez ve işi durdurmaz;
  `fetch` sonrası `yanit.ok`'a bakmaz.
- **Çıktıda arayın:** `forEach(async`, `catch {}`, `.catch(() =>`, `return fetch(`, `Promise.race(`, `fetch(` (her
  birinin yanında `ok` ve `signal` var mı).
- **Test isteyin:** sahte sunucunun 500 döndüğü, 300 ms geciktiği ve yanıtların ters sırayla geldiği üç test.

## İlgili

- [JavaScript çalışma zamanı](javascript-calisma-zamani.md): olay döngüsü, mikro/makro görev sırası
- [Hata yönetimi kalıpları](hata-yonetimi-kaliplari.md): yeniden deneme, hata sarmalama
- [Python eşzamanlılık](python-eszamanlilik.md): aynı kavramlar `asyncio`'da
- [Veri getirme](../20-web-onyuz/veri-getirme.md): ön yüzde yükleniyor/hata durumları, yarış ve iptal
- Yeniden deneme ve hız sınırı gerçeklemeleri: [`kutuphane/ts/src/yeniden_dene.ts`](../../kutuphane/ts/src/yeniden_dene.ts),
  [`kutuphane/ts/src/hiz_siniri.ts`](../../kutuphane/ts/src/hiz_siniri.ts)
