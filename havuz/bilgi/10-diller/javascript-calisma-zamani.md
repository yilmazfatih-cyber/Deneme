---
baslik: JavaScript çalışma zamanı tuzakları
ozet: Olay döngüsü sırası, kapanımlar, this, eşitlik ve zorlama, kayan nokta ve büyük tamsayı, Date tuzakları, sığ/derin kopya ve yineleme sırasında değiştirme; çalışan örneklerle.
etiketler: [javascript, node, olay-dongusu, sayilar, tarih]
duzey: orta
guncellik: 2026-11
---

# JavaScript çalışma zamanı tuzakları

> Bu notu ne zaman okumalı: kod "bazen" yanlış sırayla çalışıyorsa; para, tarih ya da büyük kimlik numarasıyla
> uğraşıyorsanız; bir nesneyi kopyalayıp değiştirince asıl nesne de değişiyorsa; `this` `undefined` çıkıyorsa.
> Tip sistemi bunların hiçbirini yakalamaz: hepsi çalışma zamanı davranışıdır.

## Temel fikir

- JavaScript **tek iş parçacıklıdır**: aynı anda bir kod parçası çalışır. Uzun süren eşzamanlı (senkron) iş her şeyi,
  zamanlayıcıları ve gelen istekleri de durdurur.
- Bekleyen işler sıralı kuyruklardadır: önce eşzamanlı kod biter, sonra **mikro görevler** (Promise devamları), sonra
  **makro görevler** (zamanlayıcı, G/Ç). Sıra bellidir ama sezgisel değildir.
- Sayılar 64 bit kayan noktadır (IEEE 754): `0.1 + 0.2 !== 0.3` ve `2^53`'ten büyük tamsayılar bozulur.
- `Date` hem yerel saati hem UTC'yi taşır; hangisini kullandığınız çağrıya göre değişir. Ay **sıfırdan** başlar.
- Kopyalama varsayılan olarak **sığdır** (shallow): iç nesneler paylaşılır.

## Olay döngüsü

```js calistir
const sira = []
setTimeout(() => sira.push('setTimeout'), 0)
Promise.resolve().then(() => sira.push('promise'))
queueMicrotask(() => sira.push('mikrogörev'))
process.nextTick(() => sira.push('nextTick'))
sira.push('eşzamanlı')
setTimeout(() => console.log(sira.join(' → ')), 10)
```

```cikti
eşzamanlı → promise → mikrogörev → nextTick → setTimeout
```

Bilinmesi gerekenler (Node 22.23.4 ile denendi):

- Bu sıra **ES modülünde** (`.mjs`, `"type": "module"`) böyledir. Aynı kod CommonJS'te (`.cjs`) `nextTick`'i
  Promise'ten **önce** çalıştırır. `nextTick` sırasına güvenen kod modül türü değişince bozulur; kullanmayın.
- Ana modülde `setTimeout(…, 0)` ile `setImmediate` arasındaki sıra **belirsizdir** (iki sıra da gözlendi).
  G/Ç geri çağrısının içinde ise `setImmediate` hep önce gelir.
- `setTimeout(f, 0)` "hemen" demek değildir; "eşzamanlı iş ve mikro görevler bittikten sonra" demektir:

```js calistir
import assert from 'node:assert/strict'

const t0 = performance.now()
const gecikme = new Promise((coz) => setTimeout(() => coz(performance.now() - t0), 0))

// Eşzamanlı 50 ms'lik iş: bu sürede hiçbir zamanlayıcı, istek, tıklama işlenmez
const bitis = Date.now() + 50
while (Date.now() < bitis) {}

assert.ok((await gecikme) >= 45, '0 ms zamanlayıcı en az 50 ms beklemeli')
console.log('tamam')
```

Sonuç: sunucuda büyük JSON ayrıştırma, şifre özeti, büyük dizi sıralama gibi işler tüm istekleri bekletir. Bu işleri
parçalayın, akışla (stream) yapın ya da iş parçacığına (`worker_threads`) taşıyın.

## Kapanımlar

Kapanım (closure), işlevin tanımlandığı yerdeki değişkene **bağlı kalmasıdır**; değerin kopyasını değil, değişkenin
kendisini tutar.

```js calistir
import assert from 'node:assert/strict'

// YANLIŞ: var tek bir değişkendir; üç işlev de aynı i'yi görür
const yanlis = []
for (var i = 0; i < 3; i++) yanlis.push(() => i)
assert.deepEqual(yanlis.map((f) => f()), [3, 3, 3])

// DOĞRU: let her turda yeni bir değişken açar
const dogru = []
for (let j = 0; j < 3; j++) dogru.push(() => j)
assert.deepEqual(dogru.map((f) => f()), [0, 1, 2])

// Eski değer tuzağı: işlev, değişken sonradan değişse de değişkeni okur
let tema = 'acik'
const temaOku = () => tema
tema = 'koyu'
assert.equal(temaOku(), 'koyu')
console.log('tamam')
```

React'teki "eski durum (stale closure)" hatası aynı kökten gelir: bir geri çağrı, oluşturulduğu andaki değişkeni
yakalar. Ayrıntısı: [React etkileri ve kancalar](../20-web-onyuz/react-etkiler-ve-kancalar.md).

## this

`this` işlevin **nasıl çağrıldığına** bağlıdır, nerede yazıldığına değil. Yöntem bir değişkene ya da geri çağrıya
verildiğinde nesneden kopar. Modüllerde katı kip (strict mode) geçerli olduğu için `this` `undefined` olur.

```js calistir
import assert from 'node:assert/strict'

class Sayac {
  deger = 0
  arttir() {
    this.deger += 1
  }
  arttirOk = () => {
    this.deger += 1 // ok işlevi this'i tanımlandığı yerden alır
  }
}
const s = new Sayac()

const kopuk = s.arttir
assert.throws(() => kopuk(), TypeError) // this undefined: "Cannot set properties of undefined"

const baglanmis = s.arttir.bind(s)
baglanmis()
const ok = s.arttirOk
ok()
assert.equal(s.deger, 2)

// Nesne değişmezinde ok işlevi YÖNTEM olarak kullanılmaz: this nesneyi göstermez
const nesne = { ad: 'Ali', selam: () => typeof this }
assert.equal(nesne.selam(), 'undefined')
console.log('tamam')
```

Kural: geri çağrı olarak verilecek yöntemi ok işleviyle yazın ya da `bind` edin; nesne değişmezinde yöntemi
`selam() {}` biçiminde yazın.

## Eşitlik ve zorlama

```js calistir
import assert from 'node:assert/strict'

// == tür zorlar; sonuçlar ezberlenmez. Her zaman === kullanın.
assert.equal(0 == '', true)
assert.equal('0' == false, true)
assert.equal([] == false, true)
assert.equal(null == undefined, true) // tek makul kullanım: x == null (null ya da undefined)
assert.equal(NaN === NaN, false) // NaN'ı Number.isNaN ile sınayın
assert.equal(Object.is(-0, 0), false)

// Form ve URL'den gelen her şey METİNDİR
assert.equal('10' < '9', true) // metin karşılaştırması: önce '1' ile '9'
assert.equal('5' + 2, '52')
assert.deepEqual([10, 9, 1].sort(), [1, 10, 9]) // sort varsayılanı metin sırası
assert.deepEqual([10, 9, 1].sort((a, b) => a - b), [1, 9, 10])

// Sayıya çevirme: her yol başka davranır
assert.equal(Number(''), 0) // boş alan 0 olur: "girilmedi" ile "0" karışır
assert.equal(parseInt('12px', 10), 12)
assert.ok(Number.isNaN(Number('12px')))
assert.equal(parseFloat('3,14'), 3) // Türkçe ondalık virgül sessizce kesilir
assert.ok(Number.isNaN(Number('1.234,56')))

// || sıfırı ve boş metni de "yok" sayar; varsayılan değer için ?? kullanın
const adet = 0
assert.equal(adet || 1, 1) // YANLIŞ: 0 adet 1'e döndü
assert.equal(adet ?? 1, 0) // DOĞRU
console.log('tamam')
```

Türkçe biçimli sayıyı ("1.234,56") okumak için binlik noktalarını atıp virgülü noktaya çevirin ve sonucu
`Number.isFinite` ile denetleyin; kullanıcı girdisini asla doğrudan `parseFloat`'a vermeyin.

## Sayılar

```js calistir
import assert from 'node:assert/strict'

assert.notEqual(0.1 + 0.2, 0.3)
assert.equal((1.005).toFixed(2), '1.00') // 1.005 aslında 1.00499999…; yuvarlama "yanlış" görünür
assert.equal(Math.round(-2.5), -2) // .5 her zaman +∞ yönüne

// PARA: kuruş cinsinden TAMSAYI tutun; yalnız gösterirken biçimlendirin
const fiyatKurus = 1999
const toplamKurus = fiyatKurus * 3
assert.equal(toplamKurus, 5997)
const tl = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' })
assert.equal(tl.format(toplamKurus / 100), '₺59,97')
assert.equal(new Intl.NumberFormat('tr-TR').format(1234567.5), '1.234.567,5')

// Güvenli tamsayı sınırı: 2^53 - 1. Ötesi sessizce bozulur
assert.equal(Number.MAX_SAFE_INTEGER, 9007199254740991)
assert.equal(9007199254740993, 9007199254740992)
assert.equal(JSON.parse('{"id": 9007199254740993}').id, 9007199254740992) // büyük kimlikler metin taşınmalı

// BigInt: kesin büyük tamsayı; Number ile karışmaz, JSON'a doğrudan yazılmaz
assert.equal(2n ** 64n, 18446744073709551616n)
assert.throws(() => 1n + 1, TypeError)
assert.throws(() => JSON.stringify({ n: 1n }), TypeError)
console.log('tamam')
```

| Durum                               | Ne kullanılır                                                     |
| ----------------------------------- | ----------------------------------------------------------------- |
| Para                                | Kuruş cinsinden tamsayı; gösterimde `Intl.NumberFormat('tr-TR')`  |
| Oran, ölçüm, istatistik             | `number`; karşılaştırmada küçük bir tolerans (`Math.abs(a-b) < 1e-9`) |
| Veritabanı kimliği (64 bit), sipariş numarası | Metin (`string`); hesap yapılmaz                         |
| Çok büyük tamsayı hesabı            | `BigInt`; JSON'a metin olarak yazın                               |

## Date tuzakları

```js calistir
import assert from 'node:assert/strict'

process.env.TZ = 'Europe/Istanbul' // Node bu değişikliği anında uygular (denendi)

// 1) Ay sıfırdan başlar: 10 = KASIM
const d = new Date(2026, 10, 16)
assert.equal(d.toLocaleDateString('tr-TR'), '16.11.2026')

// 2) toISOString UTC'ye çevirir: İstanbul'da gece yarısı, UTC'de bir önceki gündür
assert.equal(d.toISOString(), '2026-11-15T21:00:00.000Z')
assert.equal(d.toISOString().slice(0, 10), '2026-11-15') // "bugünün tarihi" bir gün kaydı!
assert.equal(new Intl.DateTimeFormat('en-CA').format(d), '2026-11-16') // yerel YYYY-AA-GG

// 3) Ayrıştırma: yalnız tarih → UTC; tarih+saat (Z'siz) → YEREL
assert.equal(new Date('2026-11-16').toISOString(), '2026-11-16T00:00:00.000Z')
assert.equal(new Date('2026-11-16T00:00').toISOString(), '2026-11-15T21:00:00.000Z')
assert.ok(Number.isNaN(new Date('16.11.2026').getTime())) // Türkçe biçim ayrıştırılmaz

// 4) Taşma: 31 Ocak'a "Şubat" denince 3 Mart olur
const ay = new Date(2026, 0, 31)
ay.setMonth(1)
assert.equal(ay.toLocaleDateString('tr-TR'), '03.03.2026')

// 5) Yaz saati olan bölgede 1 gün ≠ 24 saat
process.env.TZ = 'Europe/Berlin' // 29 Mart 2026'da saat ileri alınır
const once = new Date(2026, 2, 28, 12)
assert.equal(new Date(once.getTime() + 24 * 3600 * 1000).getHours(), 13)
const ertesi = new Date(once)
ertesi.setDate(ertesi.getDate() + 1)
assert.equal(ertesi.getHours(), 12)
console.log('tamam')
```

Kurallar: zamanı **UTC anı** olarak saklayın ve taşıyın (ISO 8601, `Z` ile); yalnız gösterirken kullanıcının saat
dilimine çevirin. "Doğum günü", "fatura günü" gibi saatsiz tarihleri `YYYY-AA-GG` metni olarak tutun; `Date`'e
çevirmeyin. `Temporal` Node 22'de yok (denendi). Ayrıntı: [Veri biçimleri](veri-bicimleri.md).

## Kopyalama: sığ ve derin

```js calistir
import assert from 'node:assert/strict'

const asil = { ad: 'Ayşe', adres: { il: 'İzmir' }, etiketler: ['a'] }

// Yayma (spread) SIĞDIR: iç nesneler paylaşılır
const sig = { ...asil }
sig.adres.il = 'Bursa'
assert.equal(asil.adres.il, 'Bursa') // asıl nesne de değişti

// structuredClone derindir; Date ve Map korunur
const derin = structuredClone({ ...asil, tarih: new Date(0), m: new Map([[1, 2]]) })
derin.adres.il = 'Van'
assert.equal(asil.adres.il, 'Bursa')
assert.ok(derin.tarih instanceof Date && derin.m instanceof Map)
// ama işlev kopyalanmaz, sınıf örneği düz nesneye döner
assert.throws(() => structuredClone({ f() {} }), { name: 'DataCloneError' })

// JSON gidiş-dönüşü "derin kopya" DEĞİLDİR: Date metne döner, undefined ve Map kaybolur, NaN null olur
const json = JSON.parse(JSON.stringify({ t: new Date(0), u: undefined, m: new Map([[1, 2]]), n: NaN }))
assert.deepEqual(json, { t: '1970-01-01T00:00:00.000Z', m: {}, n: null })

// Aynı iç diziyi paylaşan "boş" diziler
const yanlis = Array(3).fill([])
yanlis[0].push('x')
assert.deepEqual(yanlis, [['x'], ['x'], ['x']])
const dogru = Array.from({ length: 3 }, () => [])
dogru[0].push('x')
assert.deepEqual(dogru, [['x'], [], []])

// sort, reverse, splice ASIL diziyi değiştirir; toSorted, toReversed, toSpliced kopya döndürür
const liste = [3, 1, 2]
const sirali = liste.toSorted((a, b) => a - b)
assert.deepEqual(liste, [3, 1, 2])
assert.deepEqual(sirali, [1, 2, 3])
console.log('tamam')
```

## Yineleme sırasında değiştirme ve anahtar sırası

```js calistir
import assert from 'node:assert/strict'

// YANLIŞ: ileri giderken silmek bir sonraki öğeyi atlatır
const sayilar = [2, 4, 6, 7]
sayilar.forEach((n, i) => {
  if (n % 2 === 0) sayilar.splice(i, 1)
})
assert.deepEqual(sayilar, [4, 7]) // 4 silinmedi

// DOĞRU: yeni dizi üret
assert.deepEqual([2, 4, 6, 7].filter((n) => n % 2 !== 0), [7])

// Nesnede tamsayıya benzeyen anahtarlar ÖNE ve SIRALI gelir; geri kalanı ekleme sırasındadır
const plakalar = { 35: 'İzmir', '06': 'Ankara', 34: 'İstanbul', 1: 'Adana' }
assert.deepEqual(Object.keys(plakalar), ['1', '34', '35', '06'])
// Sıra önemliyse Map kullanın: ekleme sırasını korur
const m = new Map([[35, 'İzmir'], [6, 'Ankara'], [34, 'İstanbul']])
assert.deepEqual([...m.keys()], [35, 6, 34])
console.log('tamam')
```

## Tuzaklar

| Belirti                                                       | Neden                                                    | Çözüm                                                            |
| ------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------- |
| Sunucu ara ara tüm isteklere geç yanıt veriyor                 | Eşzamanlı ağır iş olay döngüsünü tıkıyor                 | İşi parçalayın, akış kullanın ya da `worker_threads`'e taşıyın    |
| Modül türü değişince sıralama bozuldu                          | ESM ve CommonJS'te `nextTick` sırası farklı              | `nextTick`'e ve zamanlayıcı sırasına dayanmayın; `await` ile sıralayın |
| Döngüde kurulan geri çağrılar hep son değeri görüyor           | `var` ile döngü değişkeni                                | `let`/`const`; ESLint `no-var`                                    |
| `Cannot read/set properties of undefined` bir yöntemin içinde   | Yöntem geri çağrı olarak verilince `this` koptu          | Ok işlevi alan ya da `bind`                                       |
| Adet 0 girilince 1 oluyor; boş metin varsayılana dönüyor        | `x \|\| varsayilan`                                       | `x ?? varsayilan`                                                 |
| `"10" < "9"` doğru; sıralama 1, 10, 9                          | Metin karşılaştırması                                    | `Number()` ile çevirin; `sort((a, b) => a - b)`                   |
| `3,14` girilince 3 kaydediliyor                                | `parseFloat` virgülde durur                              | Türkçe sayı ayrıştırıcı + `Number.isFinite` denetimi              |
| Toplam 59.970000000000006 görünüyor                            | Kayan nokta                                              | Kuruş tamsayı; gösterimde `Intl.NumberFormat`                     |
| Kimlik numarasının son haneleri değişiyor                      | `2^53` üstü tamsayı `number`'a sığmaz                    | Kimliği metin taşıyın                                             |
| Rapordaki tarih bir gün eksik                                  | `toISOString().slice(0, 10)` UTC'ye çevirir              | Yerel biçimleyici (`Intl.DateTimeFormat`) ya da saatsiz tarih metni |
| 31 Ocak'tan bir ay sonrası 3 Mart                              | `setMonth` taşması                                       | Ay sonuna kırpan yardımcı; tarih kütüphanesi                      |
| Kopyayı değiştirince asıl veri de değişti                       | Yayma/`Object.assign` sığ kopyadır                        | `structuredClone` ya da değişmez güncelleme                       |
| Listeden silerken bazı öğeler kalıyor                           | Yineleme sırasında `splice`                               | `filter` ile yeni dizi                                            |
| Plaka/kimlik anahtarlı nesnede sıra bozuk                      | Tamsayı anahtarlar öne ve sıralı alınır                  | `Map` ya da dizi                                                  |

## Denetim listesi

- [ ] Kodda `==` yok (`x == null` dışında); ESLint `eqeqeq` açık.
- [ ] Varsayılan değerler `??` ile; `||` yalnız gerçekten "boşsa" anlamında.
- [ ] Kullanıcı girdisi sayıya çevrilince `Number.isFinite` ile denetleniyor; Türkçe ondalık virgül ele alınmış.
- [ ] Para kuruş cinsinden tamsayı; gösterim `Intl.NumberFormat('tr-TR')`.
- [ ] 64 bit kimlikler metin olarak taşınıyor.
- [ ] Zaman UTC anı olarak saklanıyor; saatsiz tarihler `YYYY-AA-GG` metni; `toISOString().slice(0, 10)` yok.
- [ ] Testler en az bir yaz saati geçişi ve `Europe/Istanbul` saat dilimiyle koşuyor (`TZ` ortam değişkeni).
- [ ] Durum (state) güncellemelerinde `sort`/`splice`/`reverse` yerine kopya döndüren sürümler kullanılmış.
- [ ] Uzun eşzamanlı iş yok; varsa parçalanmış ya da işçiye taşınmış.

## Küçük modele yaptırırken

- **İsteme yazın:** "Para kuruş tamsayı; tarihler UTC ISO metni, saatsiz tarih `YYYY-AA-GG`; varsayılan için `??`;
  `==` yok; dizileri yerinde değiştirme (`toSorted`, `filter` kullan)."
- **Modelin tipik hatası:** `toISOString().split('T')[0]` ile "bugünü" bulur; `parseFloat(girdi)` yazar; `x || 0`
  ile varsayılan verir; `new Date(yil, ay, gun)`'de ayı 1'den başlatır; durum nesnesini `sort()` ile değiştirir.
- **Çıktıda arayın:** `toISOString().`, `parseFloat(`, `|| 0`, `|| 1`, `.sort()`, `new Date(` ve `var `.
- **Test isteyin:** `TZ=Europe/Istanbul` ile koşan, 0 adet, `3,14`, 31 Ocak ve `9007199254740993` örneklerini içeren
  testler. Model bu testlerle kendi hatasını görür.

## İlgili

- [JavaScript async](javascript-async.md): Promise, `await`, iptal, yarış durumu
- [TypeScript tip sistemi](typescript-tip-sistemi.md): tiplerin yakalamadığı yerler
- [Veri biçimleri](veri-bicimleri.md): JSON sayı duyarlığı, ISO 8601, saat dilimi
- [Unicode ve kodlama](unicode-ve-kodlama.md): metin uzunluğu ve dilimleme
- [Zaman ve saat dilimi](../30-arkauc/zaman-ve-saat-dilimi.md): an, duvar saati, takvim günü
- Para ve tarih yardımcıları: [`kutuphane/ts/src/para.ts`](../../kutuphane/ts/src/para.ts),
  [`kutuphane/ts/src/tarih.ts`](../../kutuphane/ts/src/tarih.ts)
