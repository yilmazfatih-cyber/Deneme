---
baslik: JavaScript yerleşik API'leri: URL, Intl, structuredClone, crypto, AbortSignal ve yeni dizi yöntemleri
ozet: URL ve URLSearchParams tuzakları, Intl'in Türkçede biçimleme ve ayrıştırma sınırları, structuredClone'un kopyalamadıkları, randomUUID ile Math.random, zaman aşımı hata adları ve yeni dizi yöntemlerinin desteği.
etiketler: [javascript, url, intl, structuredclone, crypto, dizi]
duzey: orta
guncellik: 2026-11
---

# JavaScript yerleşik API'leri: URL, Intl, structuredClone, crypto, AbortSignal ve yeni dizi yöntemleri

> Bu notu ne zaman okumalı: kodda adres kurma ya da ayrıştırma, sayı/para/tarih biçimleme, kullanıcının yazdığı
> sayıyı okuma, derin kopya, kimlik üretme, zaman aşımı ya da sıralama gördüğünüzde; "bilgisayarda çalışıyor,
> telefonda `… is not a function`" hatasında.

## Temel fikir

Yerleşik API neredeyse her zaman elle yazılmış koddan iyidir: `new URL` dize birleştirmeden, `Intl` elle nokta-virgül
koymaktan, `structuredClone` JSON gidiş-dönüşünden. Ama her birinin "makul görünen ama yanlış" bir kullanımı vardır;
bu not onları toplar. İki genel kural:

- **Derleyici yerleşik yöntem eklemez.** Vite/esbuild sözdizimini (`?.`, `??`) eski tarayıcıya çevirir;
  `toSorted`, `Object.groupBy`, `Set.prototype.union` gibi yöntemleri **eklemez**. Hedef tarayıcıda yoksa çalışma
  anında "is not a function" olur ([Vite ve derleme](../20-web-onyuz/vite-ve-derleme.md)).
- **Bazı API'ler yalnız güvenli bağlamda vardır.** Bu makinedeki Chromium'da sayfa `http://192.0.2.2` gibi bir yerel
  ağ adresinden açılınca `crypto.randomUUID`, `crypto.subtle`, `navigator.mediaDevices` ve `navigator.clipboard`
  tanımsızdı; `crypto.getRandomValues` vardı ([Tarayıcı API'leri](../20-web-onyuz/tarayici-apileri.md)).

Intl'in temel kullanımı (para, yüzde, liste, göreli zaman, tarih): [Yerelleştirme denetimi](../97-turkce/yerellestirme-denetimi.md).
Sığ/derin kopya ve `toSorted`'ın temeli: [JavaScript çalışma zamanı](javascript-calisma-zamani.md). Bu not ötesini anlatır.

## Karar tablosu

| İş                                          | Kullanın                                              | Kullanmayın                         | Neden                                       |
| ------------------------------------------- | ----------------------------------------------------- | ----------------------------------- | ------------------------------------------- |
| Adres kurmak                                | `new URL(yol, taban)` + `searchParams.set`            | Dize birleştirme                    | Kodlama, `?`/`&`, Türkçe harf               |
| "Bu adres bizim sitemizde mi?"              | Ayrıştırıp `origin` karşılaştırmak                    | `startsWith('/')`                   | `//kotu.example`, `/\kotu.example`          |
| Sayı ve para göstermek                      | Bir kez kurulmuş `Intl.NumberFormat`                  | `toFixed` + `replace('.', ',')`     | Yuvarlama ve ayırıcı farkı                  |
| Kullanıcının yazdığı "1.234,5"i okumak      | Biçimi denetleyen kendi ayrıştırıcınız                | `parseFloat`, `Number`              | `parseFloat('1.234,5') === 1.234`           |
| Veri nesnesini derin kopyalamak             | `structuredClone`                                     | `JSON.parse(JSON.stringify(x))`     | Date, Map, `undefined`, döngü               |
| Sınıf örneğini kopyalamak                   | Sınıfın kendi kopyalama yöntemi                       | `structuredClone`                   | Prototip ve yöntemler kaybolur              |
| Kimlik (id) üretmek                         | `crypto.randomUUID()` (yoksa `getRandomValues`)        | `Math.random().toString(36)`        | Çakışma ve tahmin edilebilirlik             |
| İsteğe süre sınırı                          | `AbortSignal.timeout(ms)`, gerekirse `AbortSignal.any` | `Promise.race` + `setTimeout`       | İstek arka planda sürer                     |
| Durumu sıralamak/değiştirmek (React)        | `toSorted`, `toReversed`, `toSpliced`, `with`         | `sort`, `reverse`, `splice`         | Yerinde değiştirir                          |
| Gruplamak                                   | `Object.groupBy` / `Map.groupBy`                      | Elle `reduce`                       | Okunur; ama sonuç prototipsiz               |

## URL ve URLSearchParams

```js calistir
import assert from 'node:assert/strict'

const url = new URL('https://ornek.com/ara')
url.searchParams.set('q', 'çay & şeker+süt')
assert.equal(url.search, '?q=%C3%A7ay+%26+%C5%9Feker%2Bs%C3%BCt') // & ve + kaçışlandı, boşluk "+" oldu
assert.equal(url.searchParams.get('q'), 'çay & şeker+süt')

// "+" iki çözücüde farklı anlam taşır: aynı adreste ikisini karıştırmayın
assert.equal(new URLSearchParams('q=a+b').get('q'), 'a b')
assert.equal(decodeURIComponent('a+b'), 'a+b')

// Türkçe alan adı punycode'a çevrilir: izin listesini ayrıştırılmış hostname ile karşılaştırın
assert.equal(new URL('https://çay.com.tr/').hostname, 'xn--ay-3ia.com.tr')

// "Göreli mi?" denetimi: startsWith('/') yetmez; ayrıştırıcı bunları başka siteye çözer
const base = 'https://uygulama.ornek.com/giris'
for (const next of ['//kotu.example/x', '/\\kotu.example/x', '\t//kotu.example/']) {
  assert.equal(new URL(next, base).origin, 'https://kotu.example')
}
function safeNext(value) {
  try {
    const target = new URL(value, base) // yeni ortamlarda URL.parse (null döner) ve URL.canParse da var
    return target.origin === new URL(base).origin ? target.pathname + target.search : '/'
  } catch {
    return '/'
  }
}
assert.equal(safeNext('/gorevler?durum=acik'), '/gorevler?durum=acik')
assert.equal(safeNext('/\\kotu.example'), '/')
assert.equal(safeNext('javascript:alert(1)'), '/') // origin "null"

// Eşi olmayan vekil karakter (kesilmiş emoji) encodeURIComponent'i patlatır; önce toWellFormed
const broken = 'a' + String.fromCharCode(0xd800)
assert.throws(() => encodeURIComponent(broken), URIError)
assert.equal(encodeURIComponent(broken.toWellFormed()), 'a%EF%BF%BD')
console.log('tamam')
```

- `URLSearchParams` boşluğu `+` yazar; `encodeURIComponent` `%20` yazar. Sunucu tarafında form gövdesi ve sorgu
  dizesi `URLSearchParams` ile, yol parçası `encodeURIComponent` ile çözülür.
- Ayrıştırıcı `../` parçalarını çözer: `new URL('https://a.com/x/../../etc/passwd').pathname` → `/etc/passwd`. Dosya
  yoluna çevirecekseniz çözülmüş yolu bir kök klasörle sınayın
  ([Dosya yükleme güvenliği](../50-guvenlik/dosya-yukleme-guvenligi.md)).
- Girişten sonra geri dönüş adresi ve açık yönlendirme: [Yönlendirme ve URL](../20-web-onyuz/yonlendirme-ve-url.md).

## Intl: biçimlemenin ince yerleri

```js calistir
import assert from 'node:assert/strict'

const tl = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }) // bir kez kurun, yeniden kullanın
assert.deepEqual(
  tl.formatToParts(-1234.5).map((p) => p.type),
  ['minusSign', 'currency', 'integer', 'group', 'integer', 'decimal', 'fraction'],
)

// İki yuvarlama yolu farklı sonuç verir: ekranın her yerinde tek yol (para için kuruş tamsayı)
assert.equal((2.675).toFixed(2), '2.67')
assert.equal(new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(2.675), '2,68')
// Büyük sayıda Number duyarlığı biter; BigInt ya da ondalık metin verin
assert.equal(new Intl.NumberFormat('tr-TR').format(12345678901234567890), '12.345.678.901.234.567.000')
assert.equal(new Intl.NumberFormat('tr-TR').format('12345678901234567890'), '12.345.678.901.234.567.890')

// Çıktıda görünmez boşluklar olabilir (U+00A0 bölünmez, U+2009 ince): düz metinle karşılaştırma tutmaz
const compact = new Intl.NumberFormat('tr-TR', { notation: 'compact' }).format(1_250_000)
assert.notEqual(compact, '1,3 Mn') // ekranda aynı görünür!
const plain = (s) => s.replace(/\s/g, ' ') // \s bu boşlukların hepsini yakalar
assert.equal(plain(compact), '1,3 Mn') // kısaltma sesli okumada anlaşılmaz: okunacak yerde uzun biçim
assert.equal(new Intl.NumberFormat('tr-TR', { notation: 'compact', compactDisplay: 'long' }).format(1_250_000), '1,3 milyon')
const change = { style: 'percent', signDisplay: 'exceptZero', maximumFractionDigits: 1 }
assert.equal(new Intl.NumberFormat('tr-TR', change).format(0.123), '+%12,3')

// Türkçede sıra sayısı kategorisi tek: "1'inci/2'nci" eki Intl'den çıkmaz
assert.deepEqual(new Intl.PluralRules('tr', { type: 'ordinal' }).resolvedOptions().pluralCategories, ['other'])
// Türkçe harmanlamada ç ile c ayrı harftir: "base" duyarlılık arama katlaması DEĞİLDİR
const loose = new Intl.Collator('tr', { sensitivity: 'base' })
assert.notEqual(loose.compare('çay', 'cay'), 0)
assert.notEqual(loose.compare('ISTANBUL', 'istanbul'), 0) // I'nın küçüğü ı'dır
assert.equal(loose.compare('İSTANBUL', 'istanbul'), 0)
const natural = new Intl.Collator('tr', { numeric: true })
assert.deepEqual(['Dosya 10', 'Dosya 2'].toSorted(natural.compare), ['Dosya 2', 'Dosya 10'])
console.log('tamam')
```

Bu bloğun dersleri:

- `formatToParts` ile para simgesini ayrı biçimlendirebilir, ayırıcıları öğrenebilirsiniz.
- `toFixed` ikili değeri, `Intl` ise sayının kısa ondalık yazımını yuvarlar; aynı ekranda ikisi birden kullanılırsa
  aynı sayı iki farklı görünür. Para hesabı kuruş tamsayıyla yapılır
  ([Türkçe sayı ve para](../97-turkce/turkce-sayi-ve-para.md)).
- Intl çıktısını testte düz metinle karşılaştırmak kırılgandır: bölünmez ve ince boşluklar var ve ICU sürümü
  değişince değişebilir (geçmişte İngilizce saat biçiminde AM/PM öncesindeki boşluk bu yüzden değişmiş ve pek çok
  testi kırmıştı). Boşlukları normalleştirerek karşılaştırın ya da `formatToParts` parçalarını sınayın.
- Sıra sayısı eki ("3'üncü") ünlü uyumu ister: [Ekler ve ünlü uyumu](../97-turkce/ekler-ve-unlu-uyumu.md).
- "çığ" ile "cig"i eşlemek için harmanlayıcı değil katlama gerekir: [Büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md).
- `Intl.DurationFormat` bu makinedeki Node 22.23'te yok; kullanacaksanız varlığını denetleyin.

### Göreli zaman ve ayrıştırma

```js calistir
import assert from 'node:assert/strict'

// RelativeTimeFormat birimi SEÇMEZ: -90 dakika "90 dakika önce" olur. Birimi siz seçin.
const rtf = new Intl.RelativeTimeFormat('tr', { numeric: 'auto' })
assert.equal(rtf.format(-90, 'minute'), '90 dakika önce')
const UNITS = [['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3600], ['minute', 60]]
function ago(diffMs) {
  const sec = Math.round(diffMs / 1000)
  for (const [unit, size] of UNITS) if (Math.abs(sec) >= size) return rtf.format(Math.round(sec / size), unit)
  return rtf.format(sec, 'second')
}
assert.equal(ago(-100 * 60_000), '2 saat önce')
assert.equal(ago(-86_400_000), 'dün')
assert.equal(ago(-3 * 86_400_000), '3 gün önce')
assert.equal(ago(2 * 86_400_000), 'öbür gün')
assert.equal(ago(0), 'şimdi')

// Intl AYRIŞTIRMAZ ve parseFloat "1.234,5"i bozar. Ayırıcıları formatToParts'tan öğrenip biçimi denetleyin.
assert.equal(parseFloat('1.234,5'), 1.234)
function parseLocaleNumber(text, locale = 'tr-TR') {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6)
  const group = parts.find((p) => p.type === 'group').value
  const decimal = parts.find((p) => p.type === 'decimal').value
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const valid = new RegExp(`^-?(\\d{1,3}(${esc(group)}\\d{3})*|\\d+)(${esc(decimal)}\\d+)?$`)
  const clean = text.trim()
  if (!valid.test(clean)) return null // belirsiz ya da bozuk: sessizce yanlış okumak yerine kullanıcıya sorun
  return Number(clean.replaceAll(group, '').replace(decimal, '.'))
}
assert.equal(parseLocaleNumber('1.234,5'), 1234.5)
assert.equal(parseLocaleNumber('12,50'), 12.5)
assert.equal(parseLocaleNumber('1,234.5'), null) // İngilizce biçim reddedildi
assert.equal(parseLocaleNumber('1.23'), null) // "bir virgül yirmi üç" mü, yazım hatası mı? sorun
console.log('tamam')
```

Takvim ayı ve yılı sabit saniye değildir; "3 ay önce" gibi kaba gösterim için yukarıdaki yaklaşım yeter, ama
"kalan gün" gibi kesin hesapta tarih kitaplığı ya da takvim hesabı gerekir
([Zaman ve saat dilimi](../30-arkauc/zaman-ve-saat-dilimi.md)). Ayrıştırıcının sağlam sürümü (iki dilde, sınama
vektörleriyle): [`sayi_yazi.ts`](../../kutuphane/ts/src/sayi_yazi.ts).

## structuredClone: neyi kopyalamaz

```js calistir
import assert from 'node:assert/strict'

class Money {
  constructor(kurus) {
    this.kurus = kurus
  }
  get lira() {
    return this.kurus / 100
  }
}
const copy = structuredClone(new Money(150))
assert.equal(copy instanceof Money, false) // prototip kayboldu: düz nesne
assert.equal(copy.lira, undefined) // alıcı (getter) ve yöntemler yok
assert.equal(copy.kurus, 150)

const error = Object.assign(new TypeError('bozuk', { cause: 'ağ' }), { code: 'E42' })
const errorCopy = structuredClone(error)
assert.equal(errorCopy instanceof TypeError, true) // ad, ileti, cause korunur...
assert.equal(errorCopy.cause, 'ağ')
assert.equal(errorCopy.code, undefined) // ...eklenen alan kaybolur

assert.throws(() => structuredClone(new Proxy({}, {})), { name: 'DataCloneError' }) // durum kitaplıklarının vekilleri
const key = { id: 1 }
const cloned = structuredClone({ map: new Map([[key, 'v']]), key })
assert.equal(cloned.map.get(cloned.key), 'v') // kopyanın içinde kimlik korunur
assert.equal(cloned.map.has(key), false) // özgün anahtarla bulunmaz

const buffer = new ArrayBuffer(8)
structuredClone(buffer, { transfer: [buffer] }) // aktarım: kopyalamaz, taşır
assert.equal(buffer.byteLength, 0) // özgün kullanılamaz hâle geldi
console.log('tamam')
```

Aynı kurallar `postMessage` (Worker), IndexedDB'ye yazma ve `history.pushState` için de geçerlidir: hepsi aynı
yapılandırılmış klon algoritmasını kullanır. IndexedDB'den okunan kayıt sınıf örneği değil, düz nesnedir.

## Kimlik üretmek: randomUUID ve Math.random

```js calistir
import assert from 'node:assert/strict'

// crypto.randomUUID tarayıcıda yalnız GÜVENLİ BAĞLAMDA vardır (https, localhost). Telefondan http://192.168…
// ile açınca yoktur (Chromium'da denendi); getRandomValues ise her yerde vardır.
function uuidV4(getRandomValues = (a) => crypto.getRandomValues(a)) {
  const b = getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40 // sürüm 4
  b[8] = (b[8] & 0x3f) | 0x80 // RFC 4122 türü
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
const newId = () => (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : uuidV4())
const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
assert.match(uuidV4(), V4)
assert.match(newId(), V4)
assert.throws(() => crypto.getRandomValues(new Uint8Array(65_537)), { name: 'QuotaExceededError' }) // tek çağrıda en çok 64 KB

// Math.random().toString(36).slice(2, 10) ≈ 36^8 olasılık; doğum günü yaklaşımıyla çakışma olasılığı:
const collision = (n, space) => 1 - Math.exp(-(n * n) / (2 * space))
assert.ok(collision(100_000, 36 ** 8) > 0.001) // 100 bin kayıtta binde birden fazla
assert.ok(collision(100_000, 2 ** 122) < 1e-20) // UUID v4 (122 rastgele bit): pratikte sıfır
console.log('tamam')
```

- `Math.random` güvenlik için tasarlanmamıştır; belirteç, parola sıfırlama kodu, davet bağlantısı için **asla**
  ([Kriptografi kullanımı](../50-guvenlik/kriptografi-kullanimi.md)).
- Veritabanı birincil anahtarı için zaman sıralı kimlik (UUID v7 gibi) dizin dostudur; yerleşik değildir, kitaplık ya
  da küçük bir yardımcı gerekir ([Veritabanı tasarımı](../30-arkauc/veritabani-tasarimi.md)).

## AbortSignal: zaman aşımı ile iptali ayırmak

```js calistir
import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'

const server = http.createServer(() => {}) // hiç yanıt vermeyen sunucu
server.listen(0)
await once(server, 'listening')
const url = `http://127.0.0.1:${server.address().port}/`

// Zaman aşımı ile kullanıcı iptali AYRI adlarla gelir: biri ileti ister, öteki sessizce geçilir.
function message(error) {
  if (error.name === 'TimeoutError') return 'Sunucu yanıt vermedi. Biraz sonra yeniden deneyin.'
  if (error.name === 'AbortError') return null // kullanıcı vazgeçti: hata göstermeyin
  return 'Bağlantı kurulamadı.'
}

const timedOut = await fetch(url, { signal: AbortSignal.timeout(50) }).catch((e) => e)
assert.equal(timedOut.name, 'TimeoutError') // "AbortError" değil

const user = new AbortController()
setTimeout(() => user.abort(), 20)
const signal = AbortSignal.any([user.signal, AbortSignal.timeout(5000)])
const cancelled = await fetch(url, { signal }).catch((e) => e)
assert.equal(cancelled.name, 'AbortError')
assert.equal(message(cancelled), null)

server.closeAllConnections()
server.close()
console.log('tamam')
```

- `abort(neden)` ile verilen neden olduğu gibi fırlatılır (denendi); kendi hata sınıfınızı neden olarak verip ayırt
  edebilirsiniz. Uzun işlerde aralarda `signal.throwIfAborted()` çağırın.
- `AbortSignal.timeout` Node sürecini açık tutmaz (denendi); ayrıca temizlemeniz gerekmez.
- Eşzamanlılık, yarış ve "eski yanıt yenisini ezer" kalıpları: [JavaScript async kalıpları](javascript-async.md).

## Yeni dizi ve koleksiyon yöntemleri

```js calistir
import assert from 'node:assert/strict'

assert.deepEqual([10, 9, 1, 100].toSorted(), [1, 10, 100, 9]) // karşılaştırıcısız: METİN olarak sıralar
assert.deepEqual([10, 9, 1, 100].toSorted((a, b) => a - b), [1, 9, 10, 100])

const byStatus = Object.groupBy([{ s: 'açık' }, { s: 'bitti' }, { s: 'açık' }], (t) => t.s)
assert.equal(Object.getPrototypeOf(byStatus), null) // prototipsiz nesne
assert.equal(byStatus.hasOwnProperty, undefined) // byStatus.hasOwnProperty('açık') → TypeError
assert.equal(Object.hasOwn(byStatus, 'açık'), true)
assert.equal(byStatus['açık'].length, 2)

assert.deepEqual([1, 2, 3].with(-1, 9), [1, 2, 9]) // kopya döner; özgün değişmez
assert.throws(() => [1, 2].with(5, 0), RangeError) // aralık dışı: atama gibi diziyi uzatmaz

const done = new Set(['a', 'b'])
assert.deepEqual([...done.union(new Set(['c']))], ['a', 'b', 'c'])
assert.deepEqual(
  [1, 2, 3, 4]
    .values()
    .filter((x) => x % 2)
    .map((x) => x * 10)
    .toArray(),
  [10, 30],
) // yineleyici yardımcıları: ara dizi kurmadan
console.log('tamam')
```

Node 22.23.4'te var olduğu denenenler: `toSorted`, `toReversed`, `toSpliced`, `with`, `findLast`,
`Object.groupBy`, `Map.groupBy`, `Array.fromAsync`, `Promise.withResolvers`, `Set` küme yöntemleri, yineleyici
yardımcıları. Aynı sürümde **olmayanlar**: `RegExp.escape`, `Promise.try`, `Math.sumPrecise`, `Error.isError`,
`Uint8Array.fromBase64`. Tarayıcı desteği yöntem yöntem farklıdır; hedef tarayıcı listenizle karşılaştırın, eski
cihaz destekleniyorsa ya yedek kod yazın (`[...a].sort(…)`) ya da bilinçli olarak bir yama (polyfill) ekleyin.

## Tuzaklar

| Belirti                                                        | Neden                                                       | Çözüm                                                       |
| -------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| Eski iPhone'da beyaz ekran: `toSorted is not a function`       | Derleyici yerleşik yöntem eklemez                           | Hedef tarayıcı desteği; yedek kod ya da yama                |
| Telefondan yerel IP ile açınca `randomUUID is not a function`  | Güvenli bağlam değil                                        | HTTPS ile deneyin; `getRandomValues` yedeği                 |
| Aramada "çay+şeker" "çay şeker" olarak geri geliyor            | `+` farklı çözücülerde farklı anlam                         | Tek tarafta `URLSearchParams` kullanın                      |
| Girişten sonra kullanıcı başka siteye yönlendirildi            | `startsWith('/')` ile denetim; `//` ve `/\` kaçtı            | Ayrıştırıp `origin` karşılaştırın                           |
| Kullanıcının "1.250" yazdığı tutar 1,25 olarak kaydedildi      | `parseFloat` / `Number` Türkçe biçimi bilmez                | Biçimi denetleyen ayrıştırıcı; belirsizse sorun             |
| Aynı tutar iki ekranda farklı kuruşla görünüyor                | Bir yer `toFixed`, öteki `Intl` kullanıyor                  | Tek biçimleyici; kuruş tamsayı                              |
| Test "1,3 Mn" beklerken kalıyor, metinler aynı görünüyor        | Çıktıda U+00A0                                              | Boşluk normalleştirme ya da `formatToParts`                 |
| "Türkçe duyarsız arama" `Collator` ile yapıldı, "cig" "çığ"ı bulmuyor | Türkçede ç ayrı harftir                              | Katlama işlevi                                              |
| Kopyalanan nesnede yöntem yok, `instanceof` yanlış             | `structuredClone` prototipi taşımaz                         | Sınıfın kopyalama yöntemi ya da düz veri                    |
| Kullanıcı "İptal"e basınca "Sunucu yanıt vermedi" çıkıyor       | `AbortError` ile `TimeoutError` ayrılmadı                   | Hata adına göre ileti                                       |
| `Object.groupBy` sonucunda `hasOwnProperty` TypeError          | Prototipsiz nesne                                           | `Object.hasOwn`                                             |
| Sayılar 1, 10, 100, 9 diye sıralandı                           | Karşılaştırıcısız `sort`/`toSorted`                         | `(a, b) => a - b`                                           |

## Denetim listesi

- [ ] Adresler `new URL` ile kuruluyor; dönüş adresi `origin` karşılaştırmasıyla denetleniyor.
- [ ] Sayı, para, tarih biçimleyicileri bir kez kurulup paylaşılıyor; `toFixed` ekranda kullanılmıyor.
- [ ] Kullanıcı girdisi sayılar Türkçe biçimi denetleyen ayrıştırıcıdan geçiyor; belirsiz giriş reddediliyor.
- [ ] Intl çıktısını sınayan testler boşlukları normalleştiriyor.
- [ ] Kimlikler `randomUUID` (ya da `getRandomValues` yedeği) ile; `Math.random` ile belirteç yok.
- [ ] Her ağ isteğinin süre sınırı var; `TimeoutError` ve `AbortError` ayrı ele alınıyor.
- [ ] Hedef tarayıcı listesi yazılı; yeni yerleşik yöntemlerin desteği bu listeyle karşılaştırıldı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Adresi `new URL` ile kur; sayı ve parayı projedeki biçimleyiciyle göster, `toFixed` kullanma;
  kullanıcının yazdığı sayıyı `parseFloat` ile değil ayrıştırıcıyla oku. Kimlik için `crypto.randomUUID`, süre
  sınırı için `AbortSignal.timeout`. Hedef tarayıcılarda olmayan yerleşik yöntem kullanma."
- **Modelin tipik hatası:** Sorgu dizesini dize birleştirmeyle kurar; `amount.toFixed(2).replace('.', ',')` yazar;
  `parseFloat(input)` ile Türkçe sayıyı okur; `Math.random().toString(36)` ile kimlik üretir; zaman aşımını
  `Promise.race` ile kurar; bilgisi yeni olduğu için desteklenmeyen yöntemi kullanır.
- **Çıktıda arayın:** `` `?q=${ `` gibi elle kurulan adresler, `toFixed(`, `parseFloat(`, `Math.random()`,
  `Promise.race(`, `.sort(` (durum üzerinde), `JSON.parse(JSON.stringify(`, `startsWith('/')` ile adres denetimi.
- **Test isteyin:** `//kotu.example` ve `/\kotu.example` dönüş adreslerinin reddi; "1.234,5", "1,234.5", "1.23"
  ayrıştırma örnekleri; zaman aşımı ile kullanıcı iptalinin farklı ileti vermesi.

## İlgili

- [JavaScript çalışma zamanı](javascript-calisma-zamani.md) — sığ/derin kopya, sayılar, Date tuzakları
- [JavaScript async kalıpları](javascript-async.md) — zaman aşımı, iptal, yarış
- [Unicode ve kodlama](unicode-ve-kodlama.md) — vekil çiftler, grafem, normalleştirme
- [Yerelleştirme denetimi](../97-turkce/yerellestirme-denetimi.md) — Intl ile Türkiye biçimleri
- [Uluslararasılaştırma](../20-web-onyuz/uluslararasilastirma.md) — çoğul, sözlük, dil seçimi
- [Kriptografi kullanımı](../50-guvenlik/kriptografi-kullanimi.md) — rastgelelik ve belirteç
- Sayı ayrıştırma ve yazıya çevirme kütüphanesi: [`sayi_yazi.ts`](../../kutuphane/ts/src/sayi_yazi.ts)
