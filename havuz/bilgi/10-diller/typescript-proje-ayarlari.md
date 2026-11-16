---
baslik: TypeScript proje ayarları
ozet: tsconfig sıkı bayrakları ve yakaladıkları hata sınıfları, modül çözümleme, import type, Node'un .ts dosyasını doğrudan çalıştırması ve sınırları, yol takma adları.
etiketler: [typescript, tsconfig, node, modul, yapilandirma]
duzey: orta
guncellik: 2026-11
---

# TypeScript proje ayarları

> Bu notu ne zaman okumalı: yeni bir TypeScript projesi kurarken ya da `tsconfig.json` değiştirirken; `Cannot find
> name 'process'`, `ERR_MODULE_NOT_FOUND`, `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`, `does not provide an export named`
> gibi bir hata gördüğünüzde; `node dosya.ts` ile çalıştırırken.

## Temel fikir

- İki ayrı iş vardır: **tip denetimi** (`tsc` yapar) ve **çalıştırma** (Node, Vite, test aracı yapar). Node bir
  `.ts` dosyasını çalıştırırken tipleri yalnızca **siler**: denetlemez, `tsconfig.json`'u okumaz.
- Bu yüzden "çalışıyor" ile "doğru" ayrıdır. Tip denetimi ayrı bir komut olarak (`tsc --noEmit -p .` ya da projenin
  `npm run check` komutu) her değişiklikte koşmalıdır.
- `tsconfig.json` üç şeyi belirler: ne kadar sıkı denetlenecek (`strict` ailesi ve ek bayraklar), içe aktarmalar nasıl
  çözülecek (`module`, `moduleResolution`), hangi ortam tipleri var (`lib`, `types`).
- **Sürüm durumu (Kasım 2026, `npm view` ile bakıldı):** `typescript` `latest` etiketi 7.0.2 (Go ile yeniden yazım);
  6.x çizgisinin sonu 6.0.3. typescript-eslint 8.72 yalnız `>=4.8.4 <6.1.0` destekler; ESLint kullanan projede
  TypeScript `~6.0` sabitleyin. Bu nottaki derleyici çıktıları TypeScript 6.0.3 ve Node 22.23.4 ile denendi.

## TypeScript 6'da değişen varsayılanlar (denendi)

| Konu                                   | TS 6.0.3 davranışı                                                        | Ne yapmalı                                     |
| -------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------- |
| `strict`                               | Boş `tsconfig` ile de **açık**                                             | Yine de açıkça `"strict": true` yazın          |
| `types`                                | Varsayılan boş: `@types/node` kurulu olsa bile `process` bulunamaz (TS2591) | `"types": ["node"]`                            |
| `noUncheckedSideEffectImports`         | Açık: çözülemeyen `import './x.css'` hata (TS2882)                         | Vite'ta `vite/client` tipleri; yoksa bildirim   |
| `baseUrl`                              | Kullanımdan kalktı: hata TS5101                                            | `paths` göreli yazılır ya da `#` içe aktarımları |
| `moduleResolution: "node"` (node10)     | Kullanımdan kalktı: hata TS5107                                            | `nodenext` ya da `bundler`                      |
| `esModuleInterop: false`               | Kullanımdan kalktı: hata TS5107                                            | Satırı silin                                    |
| `outDir` varken kaynaklar alt klasörde  | `rootDir` açıkça istenir: hata TS5011                                      | `"rootDir": "src"`                              |
| `tsc dosya.ts` + yanında `tsconfig.json` | Hata TS5112: komut satırında dosya verilince ayar okunmaz                | `tsc -p .` kullanın                             |

Bu hataları `"ignoreDeprecations": "6.0"` ile susturmak mümkündür ama TypeScript 7'de o ayarlar tümden çalışmaz;
susturmak yerine düzeltin.

## Önerilen ayar

Node'un doğrudan çalıştırdığı proje (`node src/main.ts`), `package.json` içinde `"type": "module"` ile:

```jsonc
// tsconfig.json — TS 6.0.3 ile derlendi (2026-11)
{
  "compilerOptions": {
    "target": "es2023",
    "module": "nodenext", // moduleResolution kendiliğinden nodenext olur
    "noEmit": true, // çıktıyı tsc üretmez; Node .ts dosyasını doğrudan çalıştırır
    "allowImportingTsExtensions": true, // import './x.ts' yazılabilsin
    "verbatimModuleSyntax": true, // tip içe aktarımı `import type` olmak zorunda
    "erasableSyntaxOnly": true, // enum, namespace, parametre özelliği yasak
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["node"],
    "skipLibCheck": true
  },
  "include": ["src", "test"]
}
```

Vite gibi bir paketleyicinin derlediği projede `"module": "esnext"` + `"moduleResolution": "bundler"` kullanılır;
geri kalanı aynıdır. Havuzdaki örnek: [`uygulama/tsconfig.base.json`](../../uygulama/tsconfig.base.json).

## Sıkı bayraklar ve yakaladıkları

| Bayrak                                | Yakaladığı hata sınıfı                                          | Örnek ileti (kod)                                        |
| ------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------- |
| `strict` → `noImplicitAny`            | Tipi bilinmeyen parametre sessizce `any` olur                   | `Parameter 'x' implicitly has an 'any' type` (TS7006)    |
| `strict` → `strictNullChecks`         | `null`/`undefined` her tipe sızar                               | `Type 'null' is not assignable to type 'string'` (TS2322) |
| `strict` → `useUnknownInCatchVariables` | `catch (e)` içinde `e.message` varsayımı                       | `'e' is of type 'unknown'` (TS18046)                     |
| `strict` → `strictPropertyInitialization` | Kurucuda atanmamış sınıf alanı                              | `Property 'bakiye' has no initializer…` (TS2564)         |
| `noUncheckedIndexedAccess` (strict'te **yok**) | `dizi[i]`, `sozluk[anahtar]` hep "var" sanılır          | `'ilk' is possibly 'undefined'` (TS18048)                |
| `exactOptionalPropertyTypes`          | `tema?:` alanına açıkça `undefined` yazmak                      | TS2375                                                   |
| `noImplicitOverride`                  | Taban sınıftaki yöntemi farkında olmadan ezmek                  | TS4114                                                   |
| `noImplicitReturns`                   | Bazı dallarda `return` unutulması                               | `Not all code paths return a value` (TS7030)             |
| `noFallthroughCasesInSwitch`          | `case` sonunda `break` unutulması                               | `Fallthrough case in switch` (TS7029)                    |
| `noPropertyAccessFromIndexSignature`  | Sözlük anahtarını alan gibi okumak (`ayar.tema`)                | TS4111                                                   |
| `noUnusedLocals` / `noUnusedParameters` | Kullanılmayan değişken (çoğu zaman yarım kalmış iş)           | TS6133                                                   |
| `verbatimModuleSyntax`                | Tipin değer gibi içe aktarılması (Node'da çalışma zamanı hatası) | TS1484                                                  |
| `erasableSyntaxOnly`                  | Node'un silemeyeceği sözdizimi                                  | TS1294                                                   |

`noUncheckedIndexedAccess` en çok gerçek hata yakalayan bayraktır ve `strict`'in içinde değildir:

```ts calistir
import assert from 'node:assert/strict'

const kuyruk: string[] = []
// Bayrak KAPALIYKEN `ilk` tipi string sanılır; `kuyruk[0].trim()` derlenir ve çalışırken patlar.
assert.throws(() => (kuyruk[0] as string).trim(), TypeError)
// Bayrak AÇIKKEN tip `string | undefined` olur; derleyici yokluğu ele almanızı ister:
const ilk = kuyruk[0]
assert.equal(ilk?.trim() ?? '(boş)', '(boş)')

const fiyatKurus: Record<string, number> = { cay: 4000 }
const kahve = fiyatKurus['kahve'] // açıkken number | undefined
assert.equal(kahve ?? 0, 0)
console.log('tamam')
```

## Node'un TypeScript çalıştırması

Node 22.23.4 `.ts` dosyasını bayraksız ve uyarısız çalıştırır (en az sürüm numarasını burada doğrulamadık; kendi
makinenizde küçük bir `.ts` dosyasıyla deneyin). Yaptığı tek şey tip yazılarını boşlukla değiştirmektir; satır
numaraları korunur. Sonuçları:

**1. Tip hatası çalışmayı durdurmaz.**

```bash calistir
cat > topla.ts <<'EOF'
function topla(a: number, b: number): number {
  return a + b
}
console.log(topla('2', 3)) // tsc: TS2345 hatası; node: sessizce çalışır
EOF
node topla.ts
```

```cikti
23
```

**2. Yalnız silinebilir sözdizimi çalışır.** `enum`, değer taşıyan `namespace`, kurucu parametre özelliği
(`constructor(private ad: string)`), `import x = require()` reddedilir. `.tsx` dosyası hiç tanınmaz
(`ERR_UNKNOWN_FILE_EXTENSION`); `node_modules` altındaki `.ts` dosyaları da silinmez
(`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`).

```bash calistir
printf 'enum Renk { Kirmizi, Mavi }\nconsole.log(Renk.Mavi)\n' > renk.ts
if node renk.ts 2> hata.txt; then echo "beklenmedik: çalıştı"; exit 1; fi
grep -o 'TypeScript enum is not supported in strip-only mode' hata.txt
```

```cikti
TypeScript enum is not supported in strip-only mode
```

**3. İçe aktarma yazımı katıdır:** uzantı yazılır (`./x.ts`) ve yalnız tip olan şey `import type` ile alınır.

```bash calistir
bekle_hata() { # komut başarısız olmalı ve hata metninde $1 geçmeli
  local metin=$1
  shift
  if "$@" 2> hata.txt; then echo "beklenmedik başarı: $*"; exit 1; fi
  grep -q -- "$metin" hata.txt || { echo "beklenen hata yok: $metin"; exit 1; }
  echo "beklenen hata: $metin"
}
echo '{"type": "module"}' > package.json
printf 'export type Kullanici = { ad: string }\nexport const SURUM = 2\n' > tipler.ts

# YANLIŞ 1: tip, değer gibi içe aktarılmış; çalışma zamanında böyle bir dışa aktarım yok
printf "import { Kullanici, SURUM } from './tipler.ts'\nconst k: Kullanici = { ad: 'Ali' }\nconsole.log(k.ad, SURUM)\n" > a.ts
bekle_hata "does not provide an export named 'Kullanici'" node a.ts

# YANLIŞ 2: uzantısız yol; Node uzantı tahmin etmez
printf "import { SURUM } from './tipler'\nconsole.log(SURUM)\n" > b.ts
bekle_hata 'ERR_MODULE_NOT_FOUND' node b.ts

# DOĞRU: import type + .ts uzantısı
printf "import type { Kullanici } from './tipler.ts'\nimport { SURUM } from './tipler.ts'\nconst k: Kullanici = { ad: 'Ali' }\nconsole.log(k.ad, SURUM)\n" > c.ts
node c.ts
```

```cikti
beklenen hata: does not provide an export named 'Kullanici'
beklenen hata: ERR_MODULE_NOT_FOUND
Ali 2
```

`verbatimModuleSyntax` birinci hatayı derleme anında yakalar (TS1484); `allowImportingTsExtensions` ikinci yazımı
(`.ts` uzantısı) derleyiciye kabul ettirir. İkisi birlikte Node ile `tsc`'yi aynı kurala bağlar.

**4. `package.json`'da `"type"` yoksa** Node dosyayı önce CommonJS sanar, sonra yeniden ayrıştırır ve her
çalıştırmada uyarı basar:

```bash calistir
echo '{"name": "deneme"}' > package.json
echo "import { sep } from 'node:path'; console.log(sep)" > a.ts
node a.ts 2> uyari.txt
grep -o 'MODULE_TYPELESS_PACKAGE_JSON' uyari.txt
echo '{"name": "deneme", "type": "module"}' > package.json
node a.ts 2> uyari.txt
test ! -s uyari.txt && echo 'uyarı yok'
```

```cikti
/
MODULE_TYPELESS_PACKAGE_JSON
/
uyarı yok
```

## Modül çözümleme

| Kod nasıl çalışıyor                    | `module` / `moduleResolution` | İçe aktarma yazımı                                         |
| -------------------------------------- | ----------------------------- | ---------------------------------------------------------- |
| Node doğrudan (`node x.ts`)            | `nodenext`                    | `./x.ts` + `allowImportingTsExtensions` + `noEmit`         |
| `tsc` JS üretir, Node `dist/`'i çalıştırır | `nodenext`                | `./x.ts` + `rewriteRelativeImportExtensions` (çıktıda `./x.js` olur) |
| Vite / esbuild / paketleyici            | `esnext` / `bundler`          | Uzantılı ya da uzantısız; projede tek biçim                |
| npm'e kütüphane yayımlama              | `nodenext` + `declaration`    | `package.json` `exports` alanı                             |

`allowImportingTsExtensions` yalnız `noEmit`, `emitDeclarationOnly` ya da `rewriteRelativeImportExtensions` ile
birlikte kullanılabilir (yoksa TS5096). `outDir` kullanıyorsanız `rootDir`'i de yazın (TS5011).

## Yol takma adları

`tsconfig` içindeki `paths` (`"@/*": ["./src/*"]`) **yalnız tip denetleyicisini** ikna eder. Node onu bilmez; Vite'ın
da kendi takma ad ayarı gerekir. Hem Node'un hem TypeScript'in (`nodenext` ve `bundler`) anladığı yol
`package.json`'daki `imports` alanıdır; adlar `#` ile başlar:

```bash calistir
mkdir -p src/lib
echo '{ "type": "module", "imports": { "#lib/*": "./src/lib/*" } }' > package.json
echo 'export const selam = (ad: string): string => `Merhaba ${ad}`' > src/lib/selam.ts

# YANLIŞ: tsconfig paths takma adı; tsc geçer, Node bulamaz
echo "import { selam } from '@lib/selam.ts'; console.log(selam('Ali'))" > src/yanlis.ts
if node src/yanlis.ts 2> /dev/null; then echo "beklenmedik: çalıştı"; exit 1; fi

# DOĞRU: package.json imports
echo "import { selam } from '#lib/selam.ts'; console.log(selam('Ayşe'))" > src/dogru.ts
node src/dogru.ts
```

```cikti
Merhaba Ayşe
```

## Tip tanımı sorunları

| Hata                                                          | Neden                                                    | Çözüm                                                         |
| ------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| `Cannot find name 'process'` / `'Buffer'` (TS2591)            | TS 6'da `types` varsayılanı boş                          | `npm i -D @types/node@<node ana sürümü>` + `"types": ["node"]` |
| `Cannot find name 'document'` (sunucu kodunda istenmeyen)      | Yanlış `lib`                                             | Sunucu tsconfig'inde `lib`'e `DOM` koymayın                   |
| `Could not find a declaration file for module 'x'` (TS7016)   | Paket tip taşımıyor                                      | `@types/x` var mı bakın; yoksa `x.d.ts` içinde dar bir `declare module 'x'` |
| `.d.ts` dosyalarında birbirini tutmayan tipler                 | İki bağımlılık aynı tipin farklı sürümünü getiriyor      | `skipLibCheck: true` (uygulamada kabul görmüş ödünleşim)      |
| Tarayıcı kodunda `process.env` derleniyor, çalışırken yok      | Web paketine `types: ["node"]` verilmiş                  | Web ve sunucu için ayrı tsconfig; web'de `import.meta.env`    |

Havuzdaki örnek düzen: kökte ortak taban ([`uygulama/tsconfig.base.json`](../../uygulama/tsconfig.base.json)), her
pakette `extends` ile kendi `lib` ve `types` seçimi
([`uygulama/shared/tsconfig.json`](../../uygulama/shared/tsconfig.json)).

## Tuzaklar

| Belirti                                                          | Neden                                                     | Çözüm                                                       |
| ---------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| `node x.ts` çalışıyor ama `npm run check` kırmızı                 | Node tip denetlemez                                       | Tip denetimini her değişiklikte ayrıca koşun                |
| `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`                               | `enum`, `namespace` ya da parametre özelliği              | `as const` nesne; düz modül; alanı açıkça yazın; `erasableSyntaxOnly` açın |
| `does not provide an export named 'X'`                            | `X` bir tip ama `import type` ile alınmamış               | `import type { X }`; `verbatimModuleSyntax` açın            |
| `ERR_MODULE_NOT_FOUND` göreli yolda                               | Uzantı yazılmamış                                         | `./x.ts` yazın; `allowImportingTsExtensions`                |
| `ERR_MODULE_NOT_FOUND` `@/…` ya da `@lib/…` yolunda               | `tsconfig` `paths` Node'da yok                            | `package.json` `imports` (`#lib/*`)                         |
| Her çalıştırmada `MODULE_TYPELESS_PACKAGE_JSON` uyarısı           | `package.json`'da `"type"` yok                            | `"type": "module"`                                          |
| TS5101 / TS5107 hataları güncellemeden sonra çıktı                | TS 6 eski ayarları kaldırdı                               | `baseUrl`'i silin, `moduleResolution`'ı `bundler`/`nodenext` yapın |
| Tip denetimi geçiyor, çalışırken `undefined` hatası              | `noUncheckedIndexedAccess` kapalı                         | Açın; çıkan hataları `??` ya da denetimle kapatın           |
| Model `strict: false` ya da `skipLibCheck` ekleyerek hatayı "çözdü" | Ayar gevşetilerek hata gizlendi                         | Ayar değişikliklerini incelemede ayrıca sorun               |
| `tsc dosya.ts` beklenmedik hatalar veriyor (TS5112)               | Dosya verilince `tsconfig` okunmaz                         | `tsc -p .` ya da `tsc --noEmit -p tsconfig.json`            |

## Denetim listesi

- [ ] `package.json` içinde `"type": "module"` var.
- [ ] `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` açık; Node doğrudan
      çalıştırıyorsa `erasableSyntaxOnly` ve `allowImportingTsExtensions` da açık.
- [ ] `types` ortamı açıkça sayıyor (`["node"]` ya da web'de `["vite/client"]`); sunucu `lib`'inde `DOM` yok.
- [ ] `baseUrl`, `moduleResolution: "node"`, `ignoreDeprecations` yok.
- [ ] Takma ad gerekiyorsa `package.json` `imports` (`#…`) kullanılmış; `paths` yalnız onu yansıtıyor.
- [ ] Tip denetimi (`tsc --noEmit -p .`) `check` komutunun parçası ve temiz.
- [ ] `enum`, `namespace`, parametre özelliği, `@ts-nocheck` yok.
- [ ] TypeScript sürümü `~6.0` ile sabitli (ESLint'le uyum); kilit dosyası depoda.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu proje `.ts` dosyalarını `node` ile doğrudan çalıştırır. İçe aktarmada `.ts` uzantısı yaz;
  yalnız tipleri `import type` ile al; `enum`, `namespace`, `constructor(private x)` kullanma; takma ad gerekiyorsa
  `#` ile başlayan `package.json` `imports` kullan. `tsconfig.json`'u gevşetme."
- **Modelin tipik hatası:** Eski alışkanlıkla uzantısız içe aktarma, `@/` takma adı ve `enum` yazar; hata çıkınca
  `strict`'i kapatır, `skipLibCheck` ya da `ignoreDeprecations` ekler ya da `baseUrl` geri getirir.
- **Çıktıda denetleyin:** `tsconfig.json` değiştiyse her satırın gerekçesini sorun; kodda `enum `, `namespace `,
  `from '@/`, uzantısız göreli `from './…'` arayın; tip denetimini kendiniz çalıştırın.
- **Hata yapıştırırken:** Hata kodunu (TS2591, TS5107…) ve TypeScript sürümünü (`npx tsc --version`) birlikte verin;
  model eski sürüm bilgisiyle yanıt verebilir.

## İlgili

- [TypeScript tip sistemi](typescript-tip-sistemi.md): daraltma, birleşimler, sınırda doğrulama
- [Modül ve bağımlılık](modul-ve-bagimlilik.md): ESM/CommonJS, kilit dosyası, sürüm aralıkları
- [JavaScript çalışma zamanı](javascript-calisma-zamani.md)
- Ortak taban ayar: [`uygulama/tsconfig.base.json`](../../uygulama/tsconfig.base.json)
- Lint kuralları (yasaklı çağrılar dahil): [`uygulama/eslint.config.js`](../../uygulama/eslint.config.js)
