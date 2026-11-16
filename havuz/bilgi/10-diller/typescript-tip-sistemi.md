---
baslik: TypeScript tip sistemi
ozet: Daraltma, ayrık birleşim ve never denetimi, unknown/any, jenerik, satisfies ve as const; tiplerin çalışma zamanında yok olduğu yerdeki tuzaklar.
etiketler: [typescript, tip-sistemi, dogrulama, javascript]
duzey: orta
guncellik: 2026-11
---

# TypeScript tip sistemi

> Bu notu ne zaman okumalı: TypeScript'te tip tanımlarken; `as`, `any`, `!` yazmak üzereyken; bir `switch`'e yeni
> durum eklerken; dışarıdan gelen veriyi (API yanıtı, JSON, form, `localStorage`) bir tiple karşılarken.

## Temel fikir

- Tipler **yalnız derleme zamanında** vardır. Çalışma zamanında silinir; `node dosya.ts` tipleri denetlemez, atar.
- Tip sistemi **yapısaldır** (structural typing): adı değil şekli karşılaştırır. Fazladan alanı olan nesne de uyar.
- Derleyiciyi susturan her şey (`as`, `any`, `!`, `@ts-ignore`) bir delik açar. Hata kaybolmaz; çalışma zamanına,
  çoğu zaman alakasız bir yere taşınır.
- Doğru düzen: dış veri `unknown` olarak girer → **sınırda** şemayla doğrulanır → içeride tiplere güvenilir.
- Durumları **ayrık birleşim** (discriminated union) ile modelleyin ve `switch`'lerin sonuna `never` denetimi koyun:
  yeni durum eklendiğinde unutulan her yeri derleyici gösterir.

## Karar tablosu

| Durum                                                    | Seçim                                               | Neden                                             |
| -------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------- |
| Dış veri (`JSON.parse`, `fetch`, form, `localStorage`)    | `unknown` + şema doğrulama (Zod)                     | `any` yanlış veriyi sessizce içeri taşır          |
| Değer birkaç biçimden biri (yükleniyor / hata / veri)     | Ayrık birleşim: ortak bir `durum` alanı             | "Hem hata hem veri" gibi geçersiz hâl yazılamaz   |
| Nesne bir tipe uymalı ama anahtarları kaybolmamalı        | `satisfies`                                         | `: Tip` genişletir, `as` hiç denetlemez           |
| Sabit liste ya da sözlük (roller, renkler)                | `as const` + ondan türetilmiş tip                   | Tek kaynak; `enum` Node'un tip silmesinde çalışmaz |
| "Bu değer şu tip mi?"                                    | `typeof`, `in`, `instanceof`, ayrım alanı           | Derleyicinin anladığı daraltma                     |
| Aynı mantık farklı tiplerle                               | Jenerik `<T>` + kısıt (`extends`)                    | `any`'siz yeniden kullanım                         |
| Bir tipin türevi (kısmi, seçilmiş, salt-okunur)           | Yardımcı tipler (`Pick`, `Omit`, `Partial`…)         | Elle kopyalanan tip zamanla kayar                  |
| Aynı şekilli iki kimlik (kullanıcı/sipariş kimliği)        | Markalı tip (branded type)                          | Yapısal tipleme ikisini ayırmaz                    |

## Daraltma ve tip koruyucuları

Daraltma (narrowing): `if`, `switch`, `typeof`, `in` sonrasında derleyici tipi küçültür. Kendi tip koruyucunuzu
(`x is T`) yazabilirsiniz; ama derleyici koruyucunun **doğru olup olmadığını denetlemez**, sözünüze inanır.

```ts calistir
import assert from 'node:assert/strict'

type Kullanici = { ad: string; eposta: string }

// YANLIŞ: yarım denetim; derleyici "true" dönünce her alanın var olduğuna inanır
function kullaniciMiYarim(x: unknown): x is Kullanici {
  return typeof x === 'object' && x !== null && 'ad' in x
}

// DOĞRU: her alanı ve türünü denetle
function kullaniciMi(x: unknown): x is Kullanici {
  return (
    typeof x === 'object' && x !== null &&
    'ad' in x && typeof x.ad === 'string' &&
    'eposta' in x && typeof x.eposta === 'string'
  )
}

const gelen: unknown = JSON.parse('{"ad": "Ayşe"}')
if (kullaniciMiYarim(gelen)) {
  assert.throws(() => gelen.eposta.trim(), TypeError) // derlendi, çalışırken patladı
}
assert.equal(kullaniciMi(gelen), false)
console.log('tamam')
```

```cikti
tamam
```

Dizi süzerken: `.filter(Boolean)` tipi daraltmaz (`(string | undefined)[]` kalır). `.filter((x) => x !== undefined)`
daraltır (TypeScript 5.5'ten beri çıkarılır; TS 6.0.3 ile denendi).

## Ayrık birleşim ve tüketicilik denetimi

```ts calistir
import assert from 'node:assert/strict'

type Yukleme =
  | { durum: 'bekliyor' }
  | { durum: 'hata'; ileti: string }
  | { durum: 'tamam'; veri: string[] }

function tuketildi(x: never): never {
  throw new Error(`Beklenmeyen durum: ${JSON.stringify(x)}`)
}

function ozet(y: Yukleme): string {
  switch (y.durum) {
    case 'bekliyor':
      return 'Yükleniyor'
    case 'hata':
      return y.ileti // burada y.veri yazılamaz: tip daraldı
    case 'tamam':
      return `${y.veri.length} kayıt`
    default:
      return tuketildi(y) // yeni durum eklenip burada unutulursa DERLEME hatası
  }
}

assert.equal(ozet({ durum: 'tamam', veri: ['a', 'b'] }), '2 kayıt')
// Sunucu bilinmeyen bir durum gönderirse sessizce undefined dönmez, açık hata verir:
const sunucudan = JSON.parse('{"durum": "iptal"}') as Yukleme
assert.throws(() => ozet(sunucudan), /Beklenmeyen durum/)
console.log('tamam')
```

Birleşime `| { durum: 'iptal' }` eklenip `case` unutulursa `tsc` şunu söyler (TS 6.0.3 ile denendi):

```text
error TS2345: Argument of type '{ durum: "iptal"; }' is not assignable to parameter of type 'never'.
```

Kural: `default` dalında boş metin, `null` ya da `return` **yazmayın**; `tuketildi(x)` yazın.

## unknown ve any

`any` denetimi kapatır ve bulaşıcıdır: `any`'den okunan her alan da `any` olur. `unknown` "ne olduğunu bilmiyorum,
kullanmadan önce bakacağım" demektir. `JSON.parse` `any` döndürür; sonucu doğrudan bir tipe atamak bir yalandır.

```ts calistir
import assert from 'node:assert/strict'

type Siparis = { id: string; tutarKurus: number; tarih: Date }
const ham = '{"id": "s1", "tutarKurus": "1250", "tarih": "2026-11-16T10:00:00Z"}'

// YANLIŞ: any → tip notu hiçbir şeyi denetlemez
const s: Siparis = JSON.parse(ham)
assert.equal(s.tutarKurus + 50, '125050') // sayı sanılan dizgi: toplama yerine birleştirme
assert.throws(() => s.tarih.getTime(), TypeError) // Date sanılan dizgi

// DOĞRU: unknown al, sınırda denetle ve dönüştür
function siparisOku(x: unknown): Siparis {
  if (typeof x !== 'object' || x === null) throw new Error('Sipariş bir nesne olmalı')
  if (!('id' in x) || typeof x.id !== 'string') throw new Error('id metin olmalı')
  if (!('tutarKurus' in x) || typeof x.tutarKurus !== 'number' || !Number.isInteger(x.tutarKurus))
    throw new Error('tutarKurus tamsayı olmalı')
  if (!('tarih' in x) || typeof x.tarih !== 'string') throw new Error('tarih metin olmalı')
  const tarih = new Date(x.tarih)
  if (Number.isNaN(tarih.getTime())) throw new Error('tarih geçersiz')
  return { id: x.id, tutarKurus: x.tutarKurus, tarih }
}
assert.throws(() => siparisOku(JSON.parse(ham)), /tutarKurus tamsayı olmalı/)
const iyi = siparisOku({ id: 's1', tutarKurus: 1250, tarih: '2026-11-16T10:00:00Z' })
assert.equal(iyi.tarih.getUTCHours(), 10)
console.log('tamam')
```

Projede bunu elle yazmayın; şema kütüphanesi hem denetler hem tipi şemadan türetir (tek kaynak). Zod 4.6.7 ile
denendi (dış paket olduğu için `calistir` almaz):

```ts
import { z } from 'zod'

const Siparis = z.object({ id: z.string().min(1), tutarKurus: z.number().int(), tarih: z.coerce.date() })
type Siparis = z.infer<typeof Siparis> // tip elle yazılmaz

const ham = '{"id": "s1", "tutarKurus": "1250", "tarih": "2026-11-16T10:00:00Z"}'
const sonuc = Siparis.safeParse(JSON.parse(ham))
if (!sonuc.success) {
  // sonuc.error.issues → [{ path: ['tutarKurus'], message: 'Invalid input: expected number, received string' }]
}
// Not: z.object bilinmeyen alanları varsayılan olarak atar (çıktıda görünmez).
```

## Jenerikler ve kısıtlar

```ts calistir
import assert from 'node:assert/strict'

// Kısıt: T'nin bir `id` alanı olmalı
function idIleSozluk<T extends { id: string }>(liste: readonly T[]): Map<string, T> {
  return new Map(liste.map((x) => [x.id, x]))
}

// keyof kısıtı: yalnız var olan alan adı yazılabilir; dönüş tipi o alanın tipi
function alanlar<T, K extends keyof T>(liste: readonly T[], alan: K): T[K][] {
  return liste.map((x) => x[alan])
}

const urunler = [
  { id: 'u1', ad: 'Çay', fiyatKurus: 4000 },
  { id: 'u2', ad: 'Simit', fiyatKurus: 1500 },
]
assert.equal(idIleSozluk(urunler).get('u2')?.ad, 'Simit')
const fiyatlar: number[] = alanlar(urunler, 'fiyatKurus')
assert.deepEqual(fiyatlar, [4000, 1500])
// @ts-expect-error — 'fiyat' diye bir alan yok; derleyici yakalar
alanlar(urunler, 'fiyat')
console.log('tamam')
```

Jenerik kuralları:

- Tip parametresi en az **iki yerde** geçmeli (girdi ile çıktıyı bağlamalı). `function f<T>(x: T): string` gereksizdir.
- `<T = any>` varsayılanı ve `useState<any>` tip bilgisini öldürür; `T`'yi argümandan çıkarsatın.
- Kısıt yoksa içeride `T` hakkında hiçbir şey bilinmez; ihtiyaç kadar `extends` yazın.

## satisfies ve as const

```ts calistir
import assert from 'node:assert/strict'

// YANLIŞ: tip notu anahtarları genişletir; yazım hatası derlenir
const renklerGenis: Record<string, string> = { birincil: '#0a5c36', uyari: '#b35c00' }
assert.equal(renklerGenis.birinci, undefined) // "birincil" yazacaktık: sessiz undefined

// DOĞRU: satisfies hem denetler hem literal anahtarları korur (RENKLER.birinci → derleme hatası)
const RENKLER = { birincil: '#0a5c36', uyari: '#b35c00' } as const satisfies Record<string, `#${string}`>
type RenkAdi = keyof typeof RENKLER // 'birincil' | 'uyari'
const secim: RenkAdi = 'uyari'
assert.equal(RENKLER[secim], '#b35c00')

// as const dizi → birleşik tip; çalışma zamanı denetimi aynı kaynaktan
const DURUMLAR = ['taslak', 'yayinda', 'arsiv'] as const
type Durum = (typeof DURUMLAR)[number]
function durumMu(x: string): x is Durum {
  return (DURUMLAR as readonly string[]).includes(x) // DURUMLAR.includes(x) derlenmez (TS2345)
}
assert.equal(durumMu('yayinda'), true)
assert.equal(durumMu('silindi'), false)
console.log('tamam')
```

`enum` yerine bu kalıbı kullanın: `enum` derleyicinin kod ürettiği bir sözdizimidir ve Node'un tip silmesi onu
reddeder (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`). Ayrıntı: [TypeScript proje ayarları](typescript-proje-ayarlari.md).

## Yardımcı tipler

| Tip                         | Ne yapar                              | Dikkat                                                  |
| --------------------------- | ------------------------------------- | ------------------------------------------------------- |
| `Partial<T>` / `Required<T>` | Tüm alanları isteğe bağlı / zorunlu   | Güncelleme gövdesi için `Partial` zorunlu alanı da gizler |
| `Readonly<T>`               | Alanlar salt-okunur                   | **Sığdır**: iç nesneler değiştirilebilir kalır          |
| `Pick<T, K>` / `Omit<T, K>`  | Alan seç / çıkar                      | `Omit` anahtarı denetlemez: `Omit<T, 'yazimHatasi'>` sessizce geçer |
| `Record<K, V>`              | Anahtar → değer sözlüğü               | `Record<string, V>` her anahtarı "var" sayar            |
| `Exclude` / `Extract`       | Birleşimden çıkar / süz               |                                                         |
| `NonNullable<T>`            | `null` ve `undefined`'ı atar          |                                                         |
| `ReturnType` / `Parameters` / `Awaited` | İşlevden tip türet         | Tip çoğaltmak yerine kullanın                           |

`Omit` için denetimli sürüm: `type KesinOmit<T, K extends keyof T> = Omit<T, K>`.

## Yapısal tipleme sürprizleri

```ts calistir
import assert from 'node:assert/strict'

type GenelProfil = { ad: string }
const kayit = { ad: 'Ayşe', sifreOzeti: 'x9f2' }

// Fazlalık denetimi yalnız TAZE nesne değişmezinde çalışır.
// const p: GenelProfil = { ad: 'Ayşe', sifreOzeti: '…' }  → derleme hatası verir, ama:
const p: GenelProfil = kayit // değişkenden gelince hata YOK
assert.match(JSON.stringify(p), /sifreOzeti/) // istemciye giden yanıtta sızıntı

// DOĞRU: dışarı çıkan nesneyi alan alan kur (ya da şemadan geçir)
const guvenli: GenelProfil = { ad: kayit.ad }
assert.equal(JSON.stringify(guvenli), '{"ad":"Ayşe"}')

// Markalı tip: aynı şekilli iki kimliği karıştırmamak için
type KullaniciId = string & { readonly __marka: 'KullaniciId' }
type SiparisId = string & { readonly __marka: 'SiparisId' }
const kullaniciId = (s: string) => s as KullaniciId // tek izinli `as`: üretici işlevde
const siparisGetir = (id: SiparisId): string => `sipariş ${id}`
// @ts-expect-error — KullaniciId, SiparisId yerine geçemez
siparisGetir(kullaniciId('k1'))
console.log('tamam')
```

`Object.keys(o)` bu yüzden `string[]` döner, `(keyof T)[]` değil: nesnede tipte yazmayan fazladan anahtar olabilir.

## Tip ile çalışma zamanı arasındaki uçurum

```ts calistir
import assert from 'node:assert/strict'

const girdi: unknown = '42'
const n = girdi as number // dönüştürmez, yalnız derleyiciyi susturur
assert.equal(typeof n, 'string')
assert.equal(n + 1, '421')
const sayi = Number(girdi) // dönüştürme budur; ardından denetim
assert.ok(Number.isFinite(sayi) && sayi + 1 === 43)

const ayarlar = new Map<string, string>()
// YANLIŞ: ! "kesin var" demektir; yoksa hata ilerde, alakasız bir yerde çıkar
assert.throws(() => ayarlar.get('tema')!.trim(), TypeError)
// DOĞRU: yokluğu yerinde ele al
const tema = ayarlar.get('tema') ?? 'acik'
assert.equal(tema, 'acik')
console.log('tamam')
```

## Tuzaklar

| Belirti                                                      | Neden                                                         | Çözüm                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| Derlendi ama çalışırken `Cannot read properties of undefined` | `as`, `any` ya da `!` derleyiciyi susturmuş                    | `unknown` + daraltma; kodda `as `, `any`, `!.` arayın               |
| Tutarlar toplanacağına yan yana yazılıyor (`'1250' + 50`)     | JSON'dan gelen dizgi `number` tipli değişkene atanmış          | Sınırda şema; `Number()` ile dönüştürüp denetleyin                  |
| `tarih.getTime is not a function`                            | JSON'da tarih yoktur, dizgi gelir; tip `Date` diyor            | Şemada `z.coerce.date()` ya da `new Date()` + `isNaN` denetimi       |
| Yeni durum eklendi, bir ekranda boşluk ya da `undefined`      | `switch`'te `default: return ''` ya da hiç `default` yok       | `default: return tuketildi(x)` (`never`)                             |
| Tip koruyucu `true` dedi ama alan yok                         | Koruyucu her alanı denetlemiyor; derleyici koruyucuya inanır   | Koruyucuyu şemadan türetin ya da tam denetim + test                  |
| API yanıtında gizli alan (parola özeti) görünüyor             | Yapısal tipleme fazla alanı taşır; fazlalık denetimi yalnız taze değişmezde | Dışarı giden nesneyi alan alan kurun ya da şemadan geçirin |
| `.filter(Boolean)` sonrası tip hâlâ `T \| undefined`           | `Boolean` tip koruyucu değil                                  | `.filter((x) => x !== undefined)`                                    |
| `Omit<T, 'yanlisAd'>` hata vermiyor                           | `Omit` anahtarın var olduğunu denetlemez                       | `KesinOmit<T, K extends keyof T>`                                    |
| `DURUMLAR.includes(x)` derlenmiyor                            | `as const` dizinin öğe tipi literal birleşim                  | `(DURUMLAR as readonly string[]).includes(x)` ya da `Set<string>`    |
| `enum` Node'da `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` veriyor    | Node yalnız silinebilir sözdizimini çalıştırır                 | `as const` nesne/dizi + türetilmiş birleşik tip                      |
| `catch (e) { e.message }` derlenmiyor (TS18046)               | `strict` altında `e` `unknown`'dır; atılan şey Error olmayabilir | `e instanceof Error ? e.message : String(e)`                       |
| Tip ile şema ayrı yazılmış, biri değişince öteki unutulmuş     | İki kaynak                                                    | Tipi şemadan türetin (`z.infer`)                                     |

## Denetim listesi

- [ ] Kodda `any` yok; zorunlu kalan her birinin yanında gerekçe yorumu var.
- [ ] `as` yalnız sınır ve üretici işlevlerde; `as unknown as` hiç yok.
- [ ] `!` (non-null assertion) yok ya da her biri gerekçeli.
- [ ] Dışarıdan gelen her veri (istek gövdesi, `fetch` yanıtı, `JSON.parse`, `localStorage`, URL parametresi,
      ortam değişkeni, model çıktısı) şemadan geçiyor; tip şemadan türetiliyor.
- [ ] Durum tipleri ayrık birleşim; her `switch`'in `default` dalı `never` denetimi yapıyor.
- [ ] Sabit kümeler `as const` + türetilmiş tip; `enum` ve `namespace` yok.
- [ ] Dışarı giden yanıtlar alan alan kurulmuş ya da şemayla süzülmüş.
- [ ] Proje tip denetimi (`tsc --noEmit` ya da `npm run check`) temiz; `@ts-ignore` yok, `@ts-expect-error`
      gerekçeli.

## Küçük modele yaptırırken

- **İsteme yazın:** "`any`, `as`, `!` ve `@ts-ignore` kullanma. Dış veri `unknown` olarak girer ve `<şema>` ile
  doğrulanır; tipi şemadan türet. Durumları ayrık birleşimle modelle, `switch`'lerin `default` dalına `never`
  denetimi koy. `enum` yerine `as const`."
- **Modelin tipik hatası:** Derleme hatasını düzeltmek yerine `as any` ya da `@ts-ignore` ile susturur; `JSON.parse(x)
  as T` yazar; tip koruyucuyu yarım yazar; şemanın yanına aynı tipi elle yeniden yazar.
- **Çıktıda arayın:** `as `, `any`, `!.`, `!)`, `@ts-ignore`, `JSON.parse(`. Her eşleşmeyi sorgulayın.
- **Tip denetimini kendiniz çalıştırın:** model "derleniyor" diyebilir; `node` tipleri denetlemediği için kod
  çalışsa bile tip hatası olabilir.
- **Hata yapıştırırken:** tam `tsc` çıktısını verin ve "tipi gevşetmeden, `as`/`any` kullanmadan düzelt" deyin.

## İlgili

- [TypeScript proje ayarları](typescript-proje-ayarlari.md): `strict`, `noUncheckedIndexedAccess`, tip silme
- [JavaScript çalışma zamanı](javascript-calisma-zamani.md): tiplerin altındaki gerçek davranış
- [Hata yönetimi kalıpları](hata-yonetimi-kaliplari.md): sonuç tipi, `unknown` hata
- [Veri biçimleri](veri-bicimleri.md): JSON'da tarih ve büyük sayı
- Zod şemaları ve `as const` rol listeleri: [`uygulama/shared/src/api.ts`](../../uygulama/shared/src/api.ts)
- Hata kodları birleşimi ve sözlüğü: [`uygulama/shared/src/errors.ts`](../../uygulama/shared/src/errors.ts)
- Sonuç tipi gerçeklemesi: [`kutuphane/ts/src/sonuc.ts`](../../kutuphane/ts/src/sonuc.ts)
