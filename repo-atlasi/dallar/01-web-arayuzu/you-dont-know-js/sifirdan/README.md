# You Don't Know JS koanları

"Koan", cevabı senin tamamlaman beklenen kısa bir deneydir. Bu klasörde altı konu, **53 koan testi** var; her biri
kitap serisinin bir bölümüne bağlı. Testler cevaplar dolu hâlde geçer (`npm test` bunu denetler); öğrenirken **boş sürümü**
üretip kendin doldurursun. Kod ve açıklamalar özgündür; kitaptan metin alınmadı (kitap CC BY-NC-ND 4.0 lisanslı).

## Gereksinimler

- Node.js 22+ (tam ICU ile; resmî Node derlemeleri öyle gelir: Türkçe `toLocaleUpperCase('tr-TR')` testleri bunu ister).
- Bağımlılık yok.

## Kullanım

```bash
cd repo-atlasi/dallar/01-web-arayuzu/you-dont-know-js/sifirdan
npm test            # dolu koanlar + araç testleri → 56 test geçer
npm run bosalt      # calisma/ klasörüne boş kopya: her __(cevap) → __()
npm run calis       # boş kopyayı çalıştır → önce hepsi kırmızı; doldurdukça yeşile döner
```

Çalışma düzeni: `calisma/02_this.test.js` dosyasını aç, bir testteki `__()` yerine tahminini yaz (`__('Tekir')`),
`node --test calisma/02_this.test.js` ile dene. Takılırsan aynı testin dolu hâli `koanlar/` altında. `calisma/`
`.gitignore`'dadır; `npm run bosalt` onu her seferinde sıfırdan üretir (yaptıklarını silmeden önce yedekle).

## Koanlar ve bölüm eşlemesi

Kısaltmalar: **GS** Get Started, **SC** Scope & Closures, **OC** Objects & Classes, **TG** Types & Grammar
(hepsi 2. baskı, `2nd-ed` dalı); **AP1** Async & Performance, **ES6** ES6 & Beyond, **TOP** this & Object Prototypes
(1. baskı, `1st-ed` dalı). Test adlarındaki `[SC 5]` gibi etiketler kitap + bölüm numarasıdır.

| Dosya                               | Konu                                                                                                                                             | Koan | Kitap bölümleri (dosya yolu)                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------- |
| `koanlar/01_kapsam_closure.test.js` | Sözcüksel kapsam, gölgeleme, hoisting, TDZ, döngü kapanışları, modül deseni, ESM'de `var`                                                        | 9    | `scope-closures/ch2.md`, `ch3.md`, `ch4.md`, `ch5.md`, `ch6.md`, `ch7.md`, `ch8.md`                           |
| `koanlar/02_this.test.js`           | Örtük, kaybolan, açık (`call/apply/bind`), `new`, ok fonksiyonu, `thisArg`, sınıf yöntemi, sloppy kip                                            | 8    | `objects-classes/ch4.md`; 1. baskı `this & object prototypes/ch1.md`–`ch2.md`                                 |
| `koanlar/03_prototip_sinif.test.js` | `[[Prototype]]`, gölgeleme ve yazılamaz özellik, `class`/`extends`/`super`, özel alanlar, OLOO, `freeze`                                         | 9    | `objects-classes/ch2.md`, `ch3.md`, `ch5.md`; 1. baskı `this & object prototypes/ch5.md`                      |
| `koanlar/04_tipler_zorlama.test.js` | `typeof`, NaN ve -0, kayan nokta, BigInt, ToBoolean, `==`, ToPrimitive, parseInt, Türkçe harf ve sıralama                                        | 10   | `types-grammar/ch1.md`, `ch2.md`, `ch4.md`; `get-started/ch2.md` (Comparisons)                                |
| `koanlar/05_olay_dongusu.test.js`   | Tamamlanana dek çalış, mikro/makro görev, `await`, thenable, hata yayılımı, birleştiriciler, eşzamanlılık, üreteç yürütücüsü, `process.nextTick` | 10   | 1. baskı `async & performance/ch1.md`, `ch3.md`, `ch4.md` (2. baskıda "Sync & Async" iptal edildi)            |
| `koanlar/06_moduller.test.js`       | Canlı bağlama, salt okunur içe aktarma, tekil modül, ad alanı nesnesi, katı kip, değerlendirme sırası, döngüsel içe aktarma ve TDZ               | 7    | `scope-closures/ch8.md` ("Modern ES Modules"), `get-started/ch2.md` (Modules); 1. baskı `es6 & beyond/ch3.md` |
| `koanlar/ornek_moduller/`           | Koan 6'nın içe aktardığı küçük modüller (`sayac.js`, `sira_a/b.js`, `dongu_a/b.js`)                                                              | —    | —                                                                                                             |
| `araclar/bosalt.js` (+ test)        | `__(...)` içini dengeli parantez/dize farkındalığıyla boşaltan araç                                                                              | 3    | —                                                                                                             |

## Nasıl yazıldı

- Her beklenen değer `__(...)` ile işaretlidir (`koanlar/_yardimci.js`). Dolu hâlde `__(x)` yalnızca `x` döndürür;
  boş hâlde `__()` bir işaretçi `Symbol` döndürür, karşılaştırma düşer.
- Zamanlama içeren koanlar gerçek süre ölçmez (CI'da kırılgan olur); sıralama günlüğü ve eşzamanlı iş sayacı kullanır.
- Node'a özgü davranış (`process.nextTick` sırası) test adında "[Node’a özgü]" diye işaretlidir; tarayıcıda yoktur.
- Koanlar ES modülüdür, dolayısıyla **katı kipte** çalışır: kaybolan `this` `undefined` olur, ilkel değere özellik
  atamak `TypeError` verir. Bu, kitaptaki "sloppy" örneklerden bazılarının sonucunu değiştirir; ilgili koanlar bunu
  ayrıca gösterir (`new Function` gövdesi katı kipte değildir).
