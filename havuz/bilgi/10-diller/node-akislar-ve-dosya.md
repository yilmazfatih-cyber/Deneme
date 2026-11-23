---
baslik: Node akışları ve dosya: geri basınç, satır satır okuma, pipeline ve izleme
ozet: Büyük dosyayı belleğe almadan işlemek; geri basınç, pipeline ile hata ve temizlik, satır satır okumada kaybolan satır ve açık kalan dosya, parça sınırında bozulan Türkçe harf, atomik yazma ve dosya izleme tuzakları.
etiketler: [node, akis, dosya, backpressure, readline, fs]
duzey: ileri
guncellik: 2026-11
---

# Node akışları ve dosya: geri basınç, satır satır okuma, pipeline ve izleme

> Bu notu ne zaman okumalı: Node'da büyük bir dosyayı (CSV, günlük, yedek) okuyup yazarken, bir dosyayı HTTP
> yanıtına akıtırken; süreç belleği şişiyor, "EMFILE: too many open files" görüyor ya da içe aktarılan satır sayısı
> tutmuyorsa; bir dosyayı izleyip değişince yeniden yükleyen kod yazarken.

## Temel fikir

`fs.readFile` bütün dosyayı belleğe alır; dosya büyüdükçe süreç yavaşlar ve sonunda ölür. **Akış** (stream) veriyi
parça parça işler ve bellek sabit kalır. Akışların üç sözleşmesi vardır; hataların neredeyse hepsi birini çiğner:

1. **Geri basınç** (backpressure): hedef yetişemiyorsa kaynak durmalıdır. `write()` `false` döndürürse `'drain'`
   beklenir. Bunu yok sayan kod belleği doldurur.
2. **Hata ve temizlik:** bir halkada hata olursa bütün halkalar kapanmalıdır. `pipeline` bunu yapar, `.pipe()` yapmaz.
3. **Kodlama:** parça sınırı karakter sınırı değildir. UTF-8'de "ğ", "ş", "ç" ikişer bayttır; bir harf iki parçaya
   bölünebilir.

Pratik kural: elle `.on('data')` + `.write()` yazmayın; `pipeline` ile ve dönüşümleri async üreteçlerle (generator)
kurun.

## Karar tablosu

| İş                                                  | Seçim                                                   | Neden                                             |
| --------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------- |
| Küçük ayar ya da JSON dosyası                       | `fs.promises.readFile`                                  | Basit; akış gereksiz                              |
| Büyük metin dosyasını satır satır işlemek           | `finally`'li satır üreteci (aşağıda) ya da doğru kurulmuş `readline` | Bellek sabit; satır kaybı yok          |
| Dosyayı HTTP yanıtına göndermek                     | `pipeline(fs.createReadStream(yol), yanıt)`             | Geri basınç ve kopan istemcide kapanış            |
| Oku → dönüştür → yaz (sıkıştır, CSV'den JSON'a)     | `pipeline(kaynak, async function* (…) {…}, hedef)`      | Hata bütün halkaları kapatır                      |
| Dosyayı yarım bırakmadan yazmak                     | Geçici dosya → `sync` → `rename`                        | Okuyan ya eskiyi ya yeniyi görür                  |
| Binlerce dosyayı işlemek                            | Eşzamanlılık sınırı (ör. 8 dosya aynı anda)             | `EMFILE`, bellek                                  |
| Ayar dosyası değişince yeniden yüklemek             | **Klasörü** izle + bekletme (debounce) + oku + doğrula  | Olaylar yinelenir; editör atomik kaydeder         |
| Ağ diskindeki ya da kapsayıcı birimindeki dosyayı izlemek | Yoklama (`fs.watchFile` ya da zamanlayıcıyla `stat`) | Olay hiç gelmeyebilir                          |

## Kodlama: parça sınırında bölünen harf

```js calistir
import assert from 'node:assert/strict'
import { StringDecoder } from 'node:string_decoder'
import { Readable } from 'node:stream'

const bytes = Buffer.from('ağaç', 'utf8') // ğ ve ç ikişer bayt: toplam 6 bayt
const chunks = [bytes.subarray(0, 2), bytes.subarray(2)] // parça sınırı "ğ"nin ortasına düştü
const REPLACEMENT = String.fromCharCode(0xfffd) // çözülemeyen bayt yerine konan "�"

// YANLIŞ: her parçayı ayrı çözmek yarım harfi bozar
assert.equal(chunks.map((c) => c.toString('utf8')).join(''), `a${REPLACEMENT}${REPLACEMENT}aç`)
// DOĞRU: yarım baytı bir sonraki parçaya saklayan çözücü
const decoder = new StringDecoder('utf8')
assert.equal(chunks.map((c) => decoder.write(c)).join('') + decoder.end(), 'ağaç')
// DOĞRU: akışa kodlamayı söylemek (içeride aynı çözücüyü kullanır)
const stream = Readable.from(chunks, { objectMode: false })
stream.setEncoding('utf8')
let text = ''
for await (const piece of stream) text += piece
assert.equal(text, 'ağaç')
console.log('tamam')
```

Belirtisi: küçük deneme dosyasında her şey doğru, büyük dosyada **arada bir** "�" görünür (yalnız 64 KB sınırına
denk gelen harfler bozulur). `chunk.toString()` gördüğünüz her yerde bu soruyu sorun. Bozuk kodlamanın teşhisi:
[Unicode ve kodlama](unicode-ve-kodlama.md).

## Geri basınç

```js calistir
import assert from 'node:assert/strict'
import { Writable } from 'node:stream'
import { once } from 'node:events'

// Yavaş hedef: her yazma 1 ms sürer; arabellek eşiği (highWaterMark) 16 bayt.
const slowSink = () => new Writable({ highWaterMark: 16, write: (_chunk, _enc, done) => setTimeout(done, 1) })
const line = 'x'.repeat(8)

// YANLIŞ: write()'ın dönüş değerini yok saymak — yazılmayı bekleyen her şey bellekte birikir
const careless = slowSink()
let peakCareless = 0
for (let i = 0; i < 200; i++) {
  careless.write(line)
  peakCareless = Math.max(peakCareless, careless.writableLength)
}
// DOĞRU: false dönünce 'drain' olayını bekle (pipeline bunu kendisi yapar)
const careful = slowSink()
let peakCareful = 0
for (let i = 0; i < 200; i++) {
  if (!careful.write(line)) await once(careful, 'drain')
  peakCareful = Math.max(peakCareful, careful.writableLength)
}
assert.equal(peakCareless, 1600) // 200 satırın hepsi bellekte (gerçek işte: gigabaytlar)
assert.ok(peakCareful <= 16) // eşik hiç aşılmadı
careless.end()
careful.end()
console.log('tamam')
```

`highWaterMark` bir sınır değil **eşiktir**: aşılınca `write()` yine yazar, yalnız `false` döndürerek "dur" der.
Durmak çağıranın işidir. Veritabanından satır okuyup yanıta yazan dışa aktarma kodunda da aynı kural geçerlidir
([İçe ve dışa aktarım](../30-arkauc/ice-ve-disa-aktarim.md)).

## pipeline: hata ve temizlik

```js calistir
import assert from 'node:assert/strict'
import { Readable, PassThrough } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const broken = () => new Readable({ read() { this.destroy(new Error('disk okunamadı')) } })

// YANLIŞ: .pipe() hatayı iletmez; hedef açık kalır (dosya tanıtıcısı, yarım yanıt, asılı istemci)
const target1 = new PassThrough()
const source1 = broken()
source1.on('error', () => {}) // dinleyici olmasaydı süreç çökerdi
source1.pipe(target1)
await new Promise((resolve) => setTimeout(resolve, 20))
assert.equal(target1.destroyed, false)

// DOĞRU: pipeline hatayı fırlatır ve bütün halkaları kapatır
const target2 = new PassThrough()
await assert.rejects(pipeline(broken(), target2), /disk okunamadı/)
assert.equal(target2.destroyed, true)
console.log('tamam')
```

- `pipeline` son halkanın `close` olayını bekler: `await pipeline(…, fs.createWriteStream(yol))` döndüğünde dosya
  kapanmıştır (denendi). Elle yazarken `'finish'` verinin işletim sistemine verildiğini, `'close'` tanıtıcının
  kapandığını söyler; dosyayı yeniden adlandırmadan ya da okumadan önce `'close'`u bekleyin.
- Dönüşümü async üreteçle yazın: `pipeline(kaynak, async function* (parçalar) { for await (const p of parçalar)
  yield dönüştür(p) }, hedef)`. Geri basınç kendiliğinden işler.
- İptal: `pipeline(…, { signal })` sinyal kesilince `AbortError` ile reddeder ve kaynağı kapatır (denendi). Kapanışta
  (`SIGTERM`) süren aktarımları bu sinyalle durdurun; HTTP sunucusunun kapanışı:
  [Sunucu mimarisi](../30-arkauc/sunucu-mimarisi.md).

## Satır satır okuma

`readline` iki sessiz tuzak taşır; ikisi de bu makinede Node 22.23.4 ile denendi:

```js calistir
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { PassThrough } from 'node:stream'

// YANLIŞ 1: arayüzü kurup döngüden önce başka bir şey beklemek — o arada gelen satırlar KAYBOLUR
const input = new PassThrough()
const late = readline.createInterface({ input, crlfDelay: Infinity })
input.write('1\n2\n3\n')
await new Promise((resolve) => setImmediate(resolve)) // ör. bu arada veritabanı bağlantısı açılıyor
const seen = []
const loop = (async () => {
  for await (const line of late) seen.push(line)
})()
input.end('4\n5\n')
await loop
assert.deepEqual(seen, ['4', '5']) // ilk üç satır sessizce gitti; akış önceden bitseydi döngü hiç bitmezdi

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'satir-'))
const file = path.join(dir, 'kayit.txt')
fs.writeFileSync(file, Array.from({ length: 50_000 }, (_, i) => `${i};Iğdır;çay`).join('\r\n') + '\r\n')

// YANLIŞ 2: döngüden break ile çıkmak alttaki dosyayı kapatmaz
const fileStream = fs.createReadStream(file)
for await (const _line of readline.createInterface({ input: fileStream, crlfDelay: Infinity })) break
assert.equal(fileStream.destroyed, false) // tanıtıcı açık kaldı: binlerce dosyada EMFILE
fileStream.destroy()

// DOĞRU: satır üreten küçük bir üreteç; finally her çıkışta (bitiş, break, hata) dosyayı kapatır
async function* lines(filePath) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' }) // kodlama: harf parçada bölünmez
  let rest = ''
  try {
    for await (const chunk of stream) {
      const parts = (rest + chunk).split(/\r?\n/)
      rest = parts.pop()
      yield* parts
    }
    if (rest) yield rest
  } finally {
    stream.destroy()
  }
}
let count = 0
for await (const line of lines(file)) {
  if (count++ === 0) assert.equal(line, '0;Iğdır;çay') // \r de temizlendi
}
assert.equal(count, 50_000)
fs.rmSync(dir, { recursive: true })
console.log('tamam')
```

Gerçek bir dosyayla denendiğinde ilk tuzak daha sinsi çıktı: 200.000 satırlık dosyada döngüden önce 5 ms beklemek
yaklaşık 16.000 satırı sessizce yuttu; üç satırlık dosyada ise döngü **hiç bitmedi**. `readline` kullanacaksanız
arayüzü kurduğunuz satırla döngü arasına `await` koymayın, `crlfDelay: Infinity` verin ve `break` ihtimali varsa
`finally` içinde `input.destroy()` çağırın. CSV gibi tırnak içinde satır sonu taşıyabilen biçimlerde satır satır
bölmek yanlıştır; CSV ayrıştırıcısı gerekir ([Veri biçimleri](veri-bicimleri.md)).

## Atomik yazma

`fs.writeFile(hedef, veri)` yazarken çökme ya da elektrik kesintisi olursa hedef **yarım** kalır; aynı anda okuyan
başka süreç yarım dosyayı görür.

```js calistir
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

// Atomik yazma: aynı klasörde geçici dosya → diske zorla → yeniden adlandır. Okuyan ya eski ya yeni dosyayı görür.
async function writeAtomic(target, data) {
  const temp = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`)
  const handle = await fs.open(temp, 'w')
  try {
    await handle.writeFile(data)
    await handle.sync() // elektrik kesintisinde yarım dosya kalmasın (yavaştır; her yazmada gerekmeyebilir)
  } finally {
    await handle.close()
  }
  try {
    await fs.rename(temp, target) // aynı dosya sisteminde tek adım
  } catch (error) {
    await fs.rm(temp, { force: true })
    throw error
  }
}

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atomik-'))
const target = path.join(dir, 'veri.json')
await writeAtomic(target, JSON.stringify({ surum: 1 }))
await writeAtomic(target, JSON.stringify({ surum: 2 }))
assert.deepEqual(JSON.parse(await fs.readFile(target, 'utf8')), { surum: 2 })
assert.deepEqual(await fs.readdir(dir), ['veri.json']) // geçici dosya kalmadı
await assert.rejects(writeAtomic(path.join(dir, 'yok', 'x.json'), '{}'), { code: 'ENOENT' })
await fs.rm(dir, { recursive: true })
console.log('tamam')
```

- Geçici dosya **aynı klasörde** olmalı: başka disk bölümündeki geçici klasörden yeniden adlandırma `EXDEV` verir.
- Windows'ta hedef başka bir süreçte açıksa yeniden adlandırma reddedilebilir; kısa bir yeniden deneme ekleyin.
- `fs.promises.open` ile alınan tanıtıcıyı `finally`'de kapatın; çöp toplayıcıya bırakılan tanıtıcı için Node uyarı
  verir ve tanıtıcı o zamana dek açık kalır.
- Veritabanı dosyasını (SQLite) bu yolla kopyalamayın; tutarlı yedek yöntemi: [SQLite pratik](sqlite-pratik.md).

## Dosya izleme

`fs.watch` işletim sisteminin bildirimini kullanır ve platforma göre davranışı değişir. Linux'ta (bu makine)
denenenler:

- Tek bir `writeFileSync` iki `change` olayı üretti; beş ayrı yazma iki olay üretti. **Olay saymayın**; olayı
  "bir şey değişti, bak" diye yorumlayın.
- Editörlerin "atomik kaydet"i (geçici dosya + yeniden adlandırma) sonrasında **dosyayı** izleyen izleyici sonraki
  değişiklikleri duymadı: eski dosya düğümünü (inode) izliyordu. **Klasörü** izleyen izleyici hepsini gördü.

```js calistir
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'izle-'))
const file = path.join(dir, 'ayar.json')
fs.writeFileSync(file, '{"v":1}')

const fileEvents = []
const fileWatcher = fs.watch(file, (type) => fileEvents.push(type)) // YANLIŞ: dosyanın kendisini izlemek
let reloads = 0
let timer
const dirWatcher = fs.watch(dir, (_type, name) => {
  if (name !== 'ayar.json') return // geçici dosyaları yok say
  clearTimeout(timer)
  timer = setTimeout(() => reloads++, 50) // bekletme: olay fırtınası tek yeniden yüklemeye iner
})

fs.writeFileSync(file, '{"v":2}') // tek yazma bile birden çok olay üretebilir (Linux'ta 2 "change")
await wait(150)
fs.writeFileSync(file + '.tmp', '{"v":3}')
fs.renameSync(file + '.tmp', file) // editörlerin "atomik kaydet"i: yeni dosya eskisinin yerine geçer
await wait(150)
const before = fileEvents.length
fs.writeFileSync(file, '{"v":4}')
await wait(150)
assert.equal(fileEvents.length, before) // dosya izleyicisi eski düğümü izliyor: son değişikliği DUYMADI
assert.equal(reloads, 3) // klasör izleyicisi üç değişikliği de gördü, her birinde bir kez yükledi
fileWatcher.close()
dirWatcher.close()
fs.rmSync(dir, { recursive: true })
console.log('tamam')
```

Ek kurallar: olay geldiğinde dosya **hâlâ yazılıyor** olabilir; okuduğunuz içeriği doğrulayın (JSON ayrışıyor mu,
şemaya uyuyor mu), bozuksa eski ayarla devam edin. Olayın dosya adı bazı platformlarda boş gelebilir. Ağ diskleri ve
bazı kapsayıcı birimleri olay iletmez; orada yoklama kullanın. Geliştirme araçlarındaki izleme (Vite, test izleyici)
de aynı nedenle bazı ortamlarda "değişikliği görmüyor" olabilir.

## Çok dosya: EMFILE ve eşzamanlılık

`Promise.all(dosyalar.map((f) => fs.promises.readFile(f)))` on binlerce dosyada açık dosya sınırına takılır
(`EMFILE`; sınır sistemden sisteme değişir, `ulimit -n`). Sınırı yükseltmek çare değildir; aynı anda en çok birkaç
dosya açan bir eşzamanlılık sınırı kurun ([JavaScript async kalıpları](javascript-async.md)).

## Tuzaklar

| Belirti                                                        | Neden                                                     | Çözüm                                                   |
| -------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------- |
| Büyük dosyada arada bir "�" görünüyor                          | Parçalar ayrı ayrı `toString()` edildi                    | `setEncoding('utf8')` ya da `StringDecoder`             |
| Dışa aktarma sırasında süreç belleği gigabaytlara çıktı        | `write()`'ın `false` dönüşü yok sayıldı                   | `'drain'` bekleyin ya da `pipeline`                     |
| Kaynak hata verdi, istemci sonsuza dek bekliyor                | `.pipe()` hatayı hedefe iletmedi                          | `pipeline`                                              |
| İçe aktarılan satır sayısı dosyadakinden az, hata yok          | `readline` kurulduktan sonra döngüden önce `await` yapıldı | Döngüyü hemen başlatın ya da satır üreteci              |
| Küçük dosyada okuma hiç bitmiyor                               | Aynı neden: `close` döngüden önce geçti                   | Aynı çözüm                                              |
| Birkaç bin dosyadan sonra `EMFILE`                             | `break` sonrası açık kalan akışlar ya da sınırsız `Promise.all` | `finally`'de `destroy`; eşzamanlılık sınırı      |
| Çökme sonrası ayar dosyası yarım ya da boş                     | Doğrudan hedefe yazıldı                                   | Atomik yazma                                            |
| Ayar dosyası değişince bazen yeniden yükleniyor, bazen değil   | Dosya izlendi, editör atomik kaydetti                     | Klasörü izleyin, adla süzün                             |
| Tek kayıtta üç kez yeniden yükleme                             | Olay fırtınası                                            | Bekletme (debounce)                                     |
| Kapsayıcıda dosya değişikliği hiç görülmüyor                   | Birim olay iletmiyor                                      | Yoklama                                                 |

## Denetim listesi

- [ ] Büyük ya da boyutu bilinmeyen dosya akışla işleniyor; `readFile` yalnız küçük dosyada.
- [ ] Akış halkaları `pipeline` ile bağlı; `.pipe()` ve elle `on('data')` + `write()` yok.
- [ ] Metin okuyan her akışta kodlama veriliyor (`encoding: 'utf8'` ya da `setEncoding`).
- [ ] Satır okuma `finally`'de akışı kapatıyor; `readline` kurulumu ile döngü arasında `await` yok.
- [ ] Önemli dosyalar atomik yazılıyor; geçici dosya aynı klasörde.
- [ ] Dosya izleme klasör üzerinde, adla süzülmüş, bekletmeli; okunan içerik doğrulanıyor.
- [ ] Çok dosyalı işlerde eşzamanlılık sınırı var.
- [ ] Testte Türkçe harfli ve 64 KB'tan büyük bir dosya var (parça sınırı tuzağı ancak böyle görünür).

## Küçük modele yaptırırken

- **İsteme yazın:** "Dosyayı `readFile` ile değil akışla işle; halkaları `stream/promises`'taki `pipeline` ile bağla,
  dönüşümü async üreteçle yaz. Metin akışlarında `encoding: 'utf8'` ver. Satır okumada `finally` içinde akışı kapat.
  Hedef dosyayı geçici dosya + `rename` ile yaz."
- **Modelin tipik hatası:** `readFileSync` ile gigabaytlık dosyayı okur; `.pipe()` zinciri kurup hata dinleyicisi
  koymaz; `chunk.toString()` yazar; `readline`'ı kurduktan sonra veritabanı bağlantısını `await` eder;
  `Promise.all` ile binlerce dosya açar; `fs.watch(dosya)` ile ayar dosyasını izler.
- **Çıktıda arayın:** `.pipe(`, `on('data'`, `toString()` (akış parçasında), `readFileSync`/`readFile` (büyük dosya
  yolunda), `createInterface` ile `for await` arasında `await`, `fs.watch(` hedefi, `writeFile(hedef` (atomik
  değil).
- **Test isteyin:** 64 KB'tan büyük, Türkçe harfli ve `\r\n` satır sonlu bir dosyayla satır sayısı ve içerik
  testi; kaynağı hata veren `pipeline`'da hedefin kapandığını sınayan test.

## İlgili

- [JavaScript async kalıpları](javascript-async.md) — eşzamanlılık sınırı, iptal
- [Unicode ve kodlama](unicode-ve-kodlama.md) — bozuk kodlama teşhisi
- [Veri biçimleri](veri-bicimleri.md) — CSV'nin satır satır bölünemeyeceği durumlar
- [İçe ve dışa aktarım](../30-arkauc/ice-ve-disa-aktarim.md) — akışla dışa aktarım, satır satır doğrulama
- [Sunucu mimarisi](../30-arkauc/sunucu-mimarisi.md) — düzgün kapanış
- [Kuyruk ve olaylar](../40-sistem-tasarimi/kuyruk-ve-olaylar.md) — sistem düzeyinde geri basınç
- [SQLite pratik](sqlite-pratik.md) — veritabanı dosyasını kopyalamamak, tutarlı yedek
