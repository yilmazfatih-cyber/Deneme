# tablo — e-tablo çekirdeği

## Ne yapar

Bir e-tablonun (Excel / Google E-Tablolar) motorunu sıfırdan kurar: hücreye yazılan `=TOPLA(A1:B3)*2` gibi
formülleri çözümler, hücreler arası bağımlılığı izler, bir hücre değişince **yalnız etkilenen hücreleri**
doğru sırayla yeniden hesaplar, döngüsel başvuruyu yakalar. Türkçe **ve** İngilizce işlev adları, ondalık
virgül kipi, 53 işlev (matematik, istatistik, mantık, metin, tarih, arama), göreli/mutlak başvuru kaydırma ve
TSV pano desteği vardır.

```ts
import { Sheet } from './index.ts'

const sayfa = new Sheet({ rows: 100, cols: 26, decimalComma: true })
sayfa.setCells([
  ['A1', '1,5'],
  ['A2', '2'],
  ['A3', '=TOPLA(A1:A2)*2'],
])
sayfa.getDisplay('A3') // "7"
sayfa.setCell('A1', '10') // yalnız A1 ve A3 yeniden hesaplanır
```

## Nasıl çalışır

```
"=TOPLA(A1:B3)*2"
   │ lexer.ts      belirteçler: TOPLA ( A1 : B3 ) * 2      (konumlarıyla)
   ▼
   │ parser.ts     AST: binary(*, call(TOPLA, [range(A1,B3)]), 2)
   ▼
   │ sheet.ts      öncüller = {A1, A2, A3, B1, B2, B3}  → graph.ts'e yazılır
   ▼
   │ graph.ts      değişen hücre → ardılları → Tarjan ile topolojik sıra + döngü tespiti
   ▼
   │ evaluate.ts   sırayla hesapla; işlevler functions/*.ts'ten
```

**Sözcük çözümleme.** Ondalık virgül kipinde `1,5` sayıdır ve argüman ayracı `;`'dir (Türkçe Excel
alışkanlığı); nokta kipinde `1.5` ve `,`. Arkasından `(` gelen sözcük işlev adıdır (`LOG10(` işlev, `LOG10`
hücre). İşlev adı harfleri Unicode'dur (`BAĞ_DEĞ_SAY`, `YAZIM.DÜZENİ`).

**Ayrıştırma (Pratt).** Öncelik (düşükten yükseğe): karşılaştırma < `&` < `+ -` < `* /` < `^` < `%` <
tekli eksi < `:`. E-tablo kuralları korunur: `=-2^2` → **4**, `=2^3^2` → **64** (soldan birleşme).

**Türkçe ad katlama.** İşlev adı `toLocaleUpperCase('tr-TR')` ile büyütülüp `İ`→`I` yapılır; böylece `MIN`,
`MİN`, `min`, `mın` aynı işlevdir ve `TOPLA`/`SUM` ikisi de çalışır. **Tuzak:** hücre adresindeki sütun
harfleri ASCII'dir; `i5` tr-TR ile büyütülse `İ5` olurdu — adresler bu yüzden harf koduyla büyütülür
(test: `=i5*2`).

**Bağımlılık çizgesi ve yeniden hesap.** Her formül hücresinin okuduğu hücreler (aralıklar hücre hücre
açılır) iki yönlü tutulur. Bir hücre değişince:

1. Etkilenenler = değişen hücre + ardıllarının tümü (yalnız bunlar hesaplanır; `stats.evaluations` sayar).
2. Bu alt çizgede **Tarjan** algoritmasıyla güçlü bağlı bileşenler bulunur. Tarjan bileşenleri ters
   topolojik sırada verir; ters çevrilince her hücre öncüllerinden sonra gelir. Elmas bağımlılıkta
   `D1 = B1 + C1`, hem B1 hem C1'den sonra ve **bir kez** hesaplanır.
3. Birden çok hücreli ya da kendine başvuran bileşen döngüdür: hücreleri `#DÖNGÜ!` olur. Döngünün aşağısındaki
   hücreler normal hesaplanır (hata yayılır, `EĞERHATA` yakalayabilir). Döngü kırılınca hepsi düzelir.

Tarjan özyinelemesiz yazıldı: 10.000 hücrelik zincirde çağrı yığını taşmaz (testli).

**Değerler ve hatalar.** Değer sayı, metin, mantıksal, boş ya da hatadır. Hata kodları Türkçe gösterilir,
İngilizce yazımları da tanınır:

| Kod       | Eşi       | Ne zaman                                    |
| --------- | --------- | ------------------------------------------- |
| `#BÖL/0!` | `#DIV/0!` | Sıfıra bölme                                |
| `#DEĞER!` | `#VALUE!` | Yanlış tür ("abc"+1), argüman sayısı yanlış |
| `#BAŞV!`  | `#REF!`   | Sayfa dışı başvuru                          |
| `#AD?`    | `#NAME?`  | Bilinmeyen işlev ya da ad                   |
| `#YOK`    | `#N/A`    | Aranan değer bulunamadı                     |
| `#SAYI!`  | `#NUM!`   | Geçersiz sayısal sonuç (√-1, taşma)         |
| `#DÖNGÜ!` | —         | Döngüsel başvuru                            |
| `#HATA!`  | `#ERROR!` | Formül sözdizimi bozuk                      |

Karşılaştırma ve arama Türkçe harmanlamayla, harf büyüklüğüne duyarsızdır (`"istanbul" = "İSTANBUL"`).

**İşlevler (53).** Tam liste `listFunctions()` ile alınır. Gruplar: `functions/math.ts` (TOPLA, ORTALAMA,
MİN, MAK, BAĞ_DEĞ_SAY, BAĞ_DEĞ_DOLU_SAY, ÇARPIM, YUVARLA, YUKARIYUVARLA, AŞAĞIYUVARLA, MUTLAK, KAREKÖK,
KUVVET, MOD, TAMSAYI, Pİ, ORTANCA, ETOPLA, EĞERSAY, EĞERORTALAMA), `logic.ts` (EĞER, VE, YADA, DEĞİL,
EĞERHATA, EHATALIYSA, EBOŞSA, ESAYIYSA, EMETİNSE), `text.ts` (BİRLEŞTİR, UZUNLUK, BÜYÜKHARF, KÜÇÜKHARF,
YAZIM.DÜZENİ, SOLDAN, SAĞDAN, PARÇAAL, KIRP, YİNELE, BUL, YERİNEKOY), `date.ts` (TARİH, YIL, AY, GÜN,
BUGÜN, HAFTANINGÜNÜ, GÜNSAY), `lookup.ts` (DÜŞEYARA, YATAYARA, İNDİS, KAÇINCI, ELEMAN). Her birinin
İngilizce adı da vardır (SUM, VLOOKUP…). Ayrıntılar:

- `YUVARLA` yarımı sıfırdan uzağa yuvarlar ve kayan nokta hatasını düzeltir: `YUVARLA(1,005; 2)` = 1,01.
- `MOD` bölenin işaretini alır: `MOD(-3; 2)` = 1.
- `EĞER`/`EĞERHATA` tembeldir: seçilmeyen dal hesaplanmaz (`EĞER(YANLIŞ; 1/0; "x")` hata vermez).
- Metin işlevleri **grafem** sayar: `UZUNLUK("👍🏽iş")` = 3 (Excel UTF-16 birimi sayar; bilinçli fark).
- Tarih = 1899-12-30'dan beri gün sayısı; UTC ile hesaplanır. `BUGÜN()` saati dışarıdan alır (`now`).

**Başvuru kaydırma (`refs.ts`).** `=A1+$B$1+C$2` bir satır aşağı, bir sütun sağa kopyalanınca
`=B2+$B$1+D$2` olur; sayfa dışına taşan başvuru `#BAŞV!` olur. Belirteç düzeyinde yapıldığı için kullanıcının
yazımı (boşluklar, `topla`/`SUM`) korunur.

## Dosya haritası

| Dosya                   | Sorumluluk                                                    |
| ----------------------- | ------------------------------------------------------------- |
| `address.ts`            | A1 ↔ satır/sütun, `$` mutlaklık, ASCII büyütme                |
| `values.ts`             | Değer türleri, hata kodları, dönüşümler, Türkçe karşılaştırma |
| `lexer.ts`              | Belirteçler (konumlu), ondalık virgül kipi                    |
| `parser.ts`             | Pratt ayrıştırıcı, AST, ad katlama, başvuru toplama           |
| `evaluate.ts`           | AST değerlendirme, işleçler, hata yayılımı                    |
| `graph.ts`              | Bağımlılık çizgesi, etkilenenler, özyinelemesiz Tarjan        |
| `sheet.ts`              | Hücre girişi, çizge güncelleme, yeniden hesap, abonelik       |
| `refs.ts`               | Kopyalamada başvuru kaydırma                                  |
| `clipboard.ts`          | TSV okuma/yazma                                               |
| `format.ts`             | Türkçe sayı biçimi, hizalama                                  |
| `functions/registry.ts` | İşlev türü, argüman yardımcıları, hata taşıma                 |
| `functions/index.ts`    | Kayıt tablosu (YENİ GRUP BURAYA)                              |
| `functions/*.ts`        | İşlev grupları; `criteria.ts` ölçüt eşleme (`">5"`, `"el*"`)  |

## Sınırlar

- Tek sayfa; sayfalar arası başvuru (`Sayfa2!A1`), adlandırılmış aralık, tüm sütun (`A:A`) yoktur.
- Dizi formülleri ve taşma (spill) yoktur: hücreye aralık yazmak `#DEĞER!` verir.
- Hücre biçimi (para, yüzde, tarih gösterimi) yoktur; tarih seri sayı olarak görünür.
- Aralık bağımlılıkları hücre hücre açılır: çok büyük aralıklar (yüz binlerce hücre) bellek harcar.
- Türkçe işlev adları Excel'in Türkçe yerelleştirmesine göre seçildi; bu ortamda Excel ile karşılaştırılarak
  **doğrulanmadı**.
- Excel'in 1900 artık yıl hatası taklit edilmez: 1 Mart 1900 öncesi seri sayılar Excel'den 1 farklıdır.

## Buradan nereye

- Çoklu sayfa (`Workbook`) ve `Sayfa2!A1` başvurusu (address.ts + lexer.ts).
- Satır/sütun ekle-sil: `refs.ts`'teki belirteç yöntemiyle tüm formüllerin başvurularını güncellemek.
- Hücre biçimleri: `format.ts`'e `format` parametresi; `=BUGÜN()` tarih olarak görünsün.
- Aralık dizini (interval tree) ile büyük aralık bağımlılıklarını hücre hücre açmadan tutmak.
