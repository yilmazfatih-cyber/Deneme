# paketleyici — mini modül paketleyici

## Ne yapar

Birbirini `import`/`export` ile kullanan ES modüllerini tek bir JavaScript dosyasına paketler (webpack,
Rollup, esbuild'in yaptığı işin özü): içe/dışa aktarımları kendi sözcük çözümleyicisi ve ayrıştırıcısıyla
okur, bağımlılık çizgesini kurar, döngüleri raporlar, modülleri küçük bir `require` çalışma zamanıyla sarar,
**kullanılmayan dışa aktarımları atar** (ağaç silkeleme) ve satır eşlemeli **kaynak haritası** üretir.

```bash
node src/paketleyici/cli.ts proje/src/main.js -o paket.cjs --format cjs --map
# Paket yazıldı: paket.cjs (7 modül, 17/23 deyim tutuldu)
# Kullanılmadığı için atılan modüller: …/square.js
```

```ts
import { bundle } from './index.ts'
const { code, map, removed, cycles } = bundle({
  entry: '/src/main.js',
  fs: { readFile: (p) => dosyalar[p] },
  format: 'esm',
  sourceMap: true,
})
```

## Nasıl çalışır

```
giriş.js ─► tokenizer.ts  (dizgi/şablon/yorum/düzenli ifade farkındalığı)
          ─► module_parser.ts + statements.ts (üst düzey deyimler: import / export / bildirim / diğer + adlar)
          ─► graph.ts      (yol çözme, bağımlılık önce sıra, Tarjan ile döngüler)
          ─► shake.ts      (iş listesi: kullanılan ad → tanımlayan deyim → başvurduğu adlar → …)
          ─► emit.ts       (modül işlevleri + __require çalışma zamanı + biçim sarması)
          ─► sourcemap.ts  (satır eşlemesi, Base64-VLQ)
```

**Sözcük çözümleme.** "import" sözcüğü bir dizgide, yorumda ya da şablon dizgisinde geçiyorsa içe aktarma
değildir. Şablondaki `${ … }` içi normal kod gibi belirteçlenir (iç içe şablon dahil). `/` için: önceki anlamlı
belirteç bir değer bitiriyorsa (ad, sayı, `)`, `]`) bölme, değilse düzenli ifade (`return /x/` da düzenli ifade).

**Deyim sınırları.** Derinlik 0'da `;` ya da otomatik noktalı virgül sezgisi: satır sonu + önceki belirteç
ifadeyi bitiriyor + sonraki belirteç ifadeyi sürdürmüyor (`.`, `(`, `+`, `?` … değil). Prettier'ın noktalı
virgülsüz biçimi (`;[1, 2].forEach`) bu kurala uyar; test bunu sınar.

**Dönüşüm (`emit.ts`).**

```js
__modules['/src/main.js'] = function (exports, __require) {
  __export(exports, { result: () => result, default: () => main }) // önce alıcılar (döngü güvenliği)
  const { area } = __require('/src/geometry/index.js') // import { area } from …
  const text = __require('/src/text.js') // import * as text from …
  const result = [area(2), text.upper('istanbul')] // export anahtar sözcüğü atıldı
  function main() {
    return 'ana'
  }
}
```

`__require` modülü ilk istendiğinde bir kez çalıştırır ve önbelleğe alır. Dışa aktarımlar alıcıdır (getter):
`export let sayac` sonradan değişirse dışarıdan okunan değer de değişir (test: `increment()` sonrası
`counter` 1). Biçimler: `iife` (isteğe bağlı genel değişken adı), `cjs` (`module.exports`), `esm`
(girişin dışa aktarımları `export const …` olarak).

**Döngüler.** Alıcılar modül gövdesinden önce tanımlanır; yukarı taşınan `function` bildirimleri döngüde
de erişilebilir. Test: `a.js ↔ b.js` döngüsü raporlanır ve sonuç Node'un kendi ESM'siyle aynıdır (`"abA"`).

**Ağaç silkeleme (`shake.ts`).** Varsayım: modüller **yan etkisizdir**. Girişin tüm dışa aktarımları
kullanılır sayılır; kullanılan her ad onu tanımlayan deyimi "canlı" yapar, canlı deyimin başvurduğu adlar
yerel bildirime ya da içe aktarmaya, oradan kaynak modüldeki dışa aktarıma gider (`export { a } from` ve
`export *` zinciri izlenir). Hiçbir adı kullanılmayan modül tümden düşer; yalnız `import './x.js'` (çıplak içe
aktarma) modülü yan etkisi için dahil eder. Dahil edilen modülün "diğer" deyimleri (başlatma kodu) tutulur.
Başvuru çıkarımı bilerek fazladır (gölgeleme izlenmez): yanlış pozitif yalnız fazladan kod tutar.

**Kaynak haritası.** Paketin her satırı, geldiği dosyanın satırına (sütun 0) eşlenir; paketleyicinin ürettiği
satırlar eşlenmez. `sourceMap: 'inline'` haritayı Base64 olarak dosya sonuna gömer.

**Test kanıtı.** Örnek proje (7 modül: yeniden dışa aktarım, `export *`, ad alanı içe aktarma, adsız
varsayılan işlev, yan etkili modül, değişen `let`) hem Node'un kendi ESM yükleyicisiyle hem paketle
çalıştırılır; sonuçlar aynıdır. `cjs`, `esm` (dosyadan `import`) ve `iife` biçimleri ayrı ayrı denenir.

## Dosya haritası

| Dosya              | Sorumluluk                                                       |
| ------------------ | ---------------------------------------------------------------- |
| `tokenizer.ts`     | JS belirteçleri, düzenli ifade/bölme ayrımı, şablon iç içeliği   |
| `module_parser.ts` | Üst düzey deyimler, içe/dışa aktarma biçimleri, ad ve başvurular |
| `graph.ts`         | Yol çözme, modül çizgesi, sıra, döngü tespiti                    |
| `shake.ts`         | Kullanılan dışa aktarımlar ve canlı deyimler                     |
| `emit.ts`          | Çalışma zamanı, modül sarmaları, biçimler                        |
| `sourcemap.ts`     | VLQ, harita kurma/çözme, satır içi yorum                         |
| `bundle.ts`        | Dış yüz: hepsini birleştirir, rapor üretir                       |
| `cli.ts`           | Komut satırı                                                     |
| `index.ts`         | Dışa açılan tek giriş noktası                                    |

## Sınırlar

- **Adlandırılmış içe aktarmalar anlık görüntüdür:** `import { sayac } from` ile alınan `let` sonradan
  değişirse yerel ad güncellenmez (ESM'de günceller). Ad alanı içe aktarması (`import * as m`) ve yeniden dışa
  aktarım canlıdır. Döngüde, henüz başlatılmamış bir `let/const`'u modül yüklenirken okumak ReferenceError
  verir (ESM'de ancak kullanıldığı anda verirdi).
- Dinamik `import()`, `import.meta`, paket adları (`node_modules`), JSON/CSS içe aktarma, JSX ve TypeScript
  sözdizimi desteklenmez. Paket adıyla içe aktarma açıklayıcı hatayla durur.
- Deyim sınırı sezgiseldir: noktalı virgülsüz kodda satırı `(`, `[` ya da `` ` `` ile başlatan, öncesine `;`
  koymayan kod yanlış bölünebilir (Prettier bu `;`'ü kendisi koyar).
- Küçültme (minify) ve kapsam yükseltme (scope hoisting) yoktur; her modül bir işlev içinde kalır.
- Kaynak haritası yalnız satır düzeyindedir.

## Buradan nereye

- Kapsam yükseltme: modül sarmalarını kaldırıp çakışan adları yeniden adlandırmak (gerçek bir kapsam
  çözümleyicisi ister — `module_parser.ts`'in genişletilmesi).
- Dinamik `import()` ile kod bölme: her dinamik içe aktarma için ayrı bir parça dosyası.
- `node_modules` çözümü: `package.json` içindeki `exports`/`module` alanlarını okuyan `resolveSpecifier`.
- İzleme kipi: değişen dosyada yalnız etkilenen modülü yeniden çözümleyip paketi yeniden üretmek.
