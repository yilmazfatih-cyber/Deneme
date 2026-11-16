---
baslik: Düzenli ifadeler
ozet: Açgözlü ve tembel eşleşme, adlandırılmış grup, ileri/geri bakış, Unicode ve Türkçe (\w, \b, İ/ı), çok satır bayrakları, felaket geri izleme ölçümü, sık desenler ve regex'in yanlış araç olduğu yerler.
etiketler: [regex, metin, unicode, turkce, guvenlik]
duzey: orta
guncellik: 2026-11
---

# Düzenli ifadeler

> Bu notu ne zaman okumalı: metinden bilgi çıkarırken ya da girdi doğrularken düzenli ifade (regex) yazmak
> üzereyken; Türkçe harfli metinde eşleşme kaçıyorsa; bir istek ya da sayfa "bazen" donuyorsa (felaket geri
> izleme); `grep`, `sed`, `re`, `RegExp` kullanırken.

## Temel fikir

- Regex **düz bir dilin** desenidir: tek boyutlu, iç içe yapısı olmayan metinler için iyidir (tarih biçimi, kod,
  ayırıcıyla bölme). İç içe yapıyı (HTML, JSON, ayraçlı ifade) ve **anlamı** (tarihin geçerliliği, kimlik
  numarasının denetim hanesi) regex'le doğrulamayın.
- Varsayılan niceleyiciler (`*`, `+`) **açgözlüdür** (greedy): olabildiğince çok yer. Tembel (`*?`, `+?`) en az yer.
- Dil farkları büyüktür: Python'da `\w` Türkçe harfleri kapsar, JavaScript'te kapsamaz; Python'da `$` sondaki satır
  sonundan **önce** de eşleşir; büyük/küçük harf duyarsızlık iki dilde `İ/ı` için zıt yönde bozuktur.
- İç içe niceleyici (`(a+)+`) bazı girdilerde **üstel** süre alır. Sunucuda kullanıcı girdisine uygulanan böyle bir
  desen hizmet dışı bırakma (ReDoS) açığıdır.

## Yapı taşları ve açgözlülük

```python calistir
import re

# Açgözlü .+ en sona kadar gider; tembel .+? ilk fırsatta durur
assert re.findall(r"<.+>", "<b>kalın</b>") == ["<b>kalın</b>"]
assert re.findall(r"<.+?>", "<b>kalın</b>") == ["<b>", "</b>"]
# Daha iyisi: neyin geçemeyeceğini söyleyin (tembellikten hızlı ve net)
assert re.findall(r"<[^>]+>", "<b>kalın</b>") == ["<b>", "</b>"]

# Adlandırılmış grup ve geri başvuru
tarih = re.fullmatch(r"(?P<gun>\d{2})\.(?P<ay>\d{2})\.(?P<yil>\d{4})", "16.11.2026")
assert tarih is not None and tarih["yil"] == "2026"
assert re.sub(r"(?P<gun>\d{2})\.(?P<ay>\d{2})\.(?P<yil>\d{4})", r"\g<yil>-\g<ay>-\g<gun>", "16.11.2026") == "2026-11-16"

# match başta arar, search her yerde, fullmatch bütün metni ister
assert re.match(r"\d+", "a12") is None and re.search(r"\d+", "a12") is not None
assert re.fullmatch(r"\d+", "12a") is None

# Yakalayan grup split'te ayırıcıyı da döndürür
assert re.split(r"(,)", "a,b") == ["a", ",", "b"]
assert re.split(r",", "a,b") == ["a", "b"]
print("tamam")
```

## JavaScript'e özgü tuzaklar

```js calistir
import assert from 'node:assert/strict'

// Adlandırılmış grup ve değiştirmede $<ad>
assert.equal('16.11.2026'.replace(/(?<g>\d{2})\.(?<a>\d{2})\.(?<y>\d{4})/, '$<y>-$<a>-$<g>'), '2026-11-16')

// g bayraklı düzenli ifade lastIndex taşır: aynı nesneyle test() sırayla true/false döner
const g = /a/g
assert.deepEqual([g.test('a'), g.test('a'), g.test('a')], [true, false, true])

// Değiştirme metnindeki $& gibi diziler ÖZEL anlam taşır; kullanıcı metnini işlevle verin
assert.equal('fiyat'.replace('fiyat', '$&$&'), 'fiyatfiyat')
assert.equal('fiyat'.replace('fiyat', () => '$&$&'), '$&$&')

// Kullanıcı metnini desene koymadan önce kaçışlayın (Node 22'de RegExp.escape yok; denendi)
const kacisla = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
assert.equal(typeof RegExp.escape, 'undefined')
assert.ok(new RegExp(kacisla('1+1=2?')).test('Soru: 1+1=2?'))
assert.throws(() => new RegExp('(ayraç'), SyntaxError)
console.log('tamam')
```

## Unicode ve Türkçe

```js calistir
import assert from 'node:assert/strict'

// JavaScript'te \w ve \b YALNIZ ASCII'dir; u bayrağı da bunu değiştirmez
assert.deepEqual('Çağrı ışık'.match(/\w+/gu), ['a', 'r', 'k'])
assert.equal(/\bçay\b/u.test('sıcak çay'), false) // ç harfi "kelime karakteri" sayılmadı
// DOĞRU: Unicode harf sınıfı \p{L} (u bayrağıyla) ve sınır için ileri/geri bakış
assert.deepEqual('Çağrı ışık'.match(/\p{L}+/gu), ['Çağrı', 'ışık'])
const kelime = (k) => new RegExp(`(?<![\\p{L}\\p{N}])${k}(?![\\p{L}\\p{N}])`, 'u')
assert.equal(kelime('çay').test('sıcak çay'), true)
assert.equal(kelime('çay').test('çaydanlık'), false)
// [a-z] Türkçe harfleri kapsamaz
assert.deepEqual('çağrı'.match(/[a-z]+/g), ['a', 'r'])

// Büyük/küçük harf duyarsız eşleşme İ ve ı'yı tanımaz (u bayrağıyla da)
assert.equal(/istanbul/i.test('İSTANBUL'), false)
assert.equal(/ılık/iu.test('ILIK'), false)
console.log('tamam')
```

```python calistir
import re

# Python'da \w Unicode'dur; re.ASCII ile JavaScript gibi davranır
assert re.findall(r"\w+", "Çağrı ışık 3x") == ["Çağrı", "ışık", "3x"]
assert re.findall(r"\w+", "Çağrı ışık", re.ASCII) == ["a", "r", "k"]
# Python'un re modülü \p{L} bilmez (üçüncü taraf `regex` paketi bilir)
try:
    re.compile(r"\p{L}")
    raise AssertionError("hata bekleniyordu")
except re.error:
    pass

# re.IGNORECASE dört i'yi (i, ı, I, İ) birbirine eşit sayar: "ılık" araması "ilik"i de bulur
assert re.findall("ılık", "Ilık, ilik, ILIK, İLİK", re.IGNORECASE) == ["Ilık", "ilik", "ILIK", "İLİK"]
print("tamam")
```

Sonuç: Türkçe metinde büyük/küçük harf duyarsız aramayı regex bayrağına bırakmayın. İki tarafı da aynı Türkçe
katlama işlevinden geçirip ondan sonra karşılaştırın: [Türkçe büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md).

## Çok satır bayrakları ve çapalar

```python calistir
import re

# Python'da $ sondaki satır sonundan ÖNCE de eşleşir: doğrulamada delik
assert re.match(r"^\d+$", "123\n") is not None  # "123\n" geçerli sayıldı!
assert re.fullmatch(r"\d+", "123\n") is None  # DOĞRU: fullmatch
assert re.match(r"^\d+\Z", "123\n") is None  # ya da \Z

metin = "ad: Ayşe\nad: Can"
assert re.findall(r"^ad: (\w+)$", metin) == []  # ^ ve $ yalnız metnin başı/sonu
assert re.findall(r"^ad: (\w+)$", metin, re.MULTILINE) == ["Ayşe", "Can"]  # her satır
assert re.search(r"Ayşe.ad", metin) is None  # . satır sonunu geçmez
assert re.search(r"Ayşe.ad", metin, re.DOTALL) is not None
print("tamam")
```

| Bayrak        | Python                      | JavaScript | Etkisi                                      |
| ------------- | --------------------------- | ---------- | ------------------------------------------- |
| Çok satır     | `re.MULTILINE` / `(?m)`     | `m`        | `^` ve `$` her satırın başı ve sonu         |
| Nokta her şey | `re.DOTALL` / `(?s)`        | `s`        | `.` satır sonunu da kapsar                  |
| Harf duyarsız | `re.IGNORECASE`             | `i`        | Türkçe için güvenilmez (yukarıda)           |
| Unicode       | varsayılan (str desenlerde) | `u` / `v`  | JS'te `\p{…}` ve doğru kod noktası için şart |
| Hepsi         | —                           | `g`        | JS: tüm eşleşmeler; `lastIndex` durumu taşır |

## İleri ve geri bakış

İleri bakış (lookahead) `(?=…)` ve geri bakış (lookbehind) `(?<=…)` bir koşulu sınar ama eşleşmeye katmaz.

```python calistir
import re

assert re.findall(r"\d+(?=\s?TL)", "Çay 40 TL, simit 15TL, 3 adet") == ["40", "15"]
assert re.findall(r"(?<=₺)\d+", "Toplam ₺120 ve ₺35") == ["120", "35"]
# Python'da geri bakış SABİT uzunlukta olmalı (JavaScript'te değişken uzunluk serbest)
try:
    re.compile(r"(?<=₺\s*)\d+")
    raise AssertionError("hata bekleniyordu")
except re.error as hata:
    assert "fixed-width" in str(hata)
print("tamam")
```

Parola kuralı gibi birden çok koşulu tek desende ileri bakışlarla birleştirmek (`^(?=.*\d)(?=.*[a-z]).{10,}$`) çalışır
ama okunmaz ve hata iletisi veremez. Her koşulu ayrı denetleyin; kullanıcıya hangisinin eksik olduğunu söyleyin.

## Felaket geri izleme

İç içe ya da örtüşen niceleyiciler (`(a+)+`, `(a|a)*`, `(\w+\s?)*`) eşleşme **başarısız olduğunda** bütün bölme
yollarını dener. Her iki karakterde süre yaklaşık 4 katına çıkar:

```python calistir
import re
import time


def sure(desen: str, n: int) -> float:
    girdi = "a" * n + "b"  # sondaki b eşleşmeyi başarısız kılar
    en_iyi = float("inf")
    for _ in range(3):
        t0 = time.perf_counter()
        re.match(desen, girdi)
        en_iyi = min(en_iyi, time.perf_counter() - t0)
    return en_iyi


kotu_16, kotu_20 = sure(r"(a+)+$", 16), sure(r"(a+)+$", 20)
assert kotu_20 > 4 * kotu_16  # 4 karakter fazlası ~16 kat süre (denemede 2.6 ms → 41 ms)
# DOĞRU 1: deseni sadeleştirin (aynı dili tanır)
assert sure(r"a+$", 20) < kotu_20 / 100
# DOĞRU 2: atomik grup / sahiplenici niceleyici (Python 3.11+): geri izlemeyi yasaklar
assert sure(r"(?>a+)+$", 20) < kotu_20 / 100
assert sure(r"a++$", 20) < kotu_20 / 100
print("tamam")
```

```js calistir
import assert from 'node:assert/strict'

function sure(desen, n) {
  const girdi = 'a'.repeat(n) + 'b'
  let enIyi = Infinity
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now()
    desen.test(girdi)
    enIyi = Math.min(enIyi, performance.now() - t0)
  }
  return enIyi
}
// Node'da da üstel: olay döngüsü bu sürede başka hiçbir isteği işlemez
const kotu18 = sure(/^(a+)+$/, 18)
const kotu24 = sure(/^(a+)+$/, 24)
assert.ok(kotu24 > 8 * kotu18, `${kotu18} → ${kotu24}`) // denemede ~2 ms → ~100 ms
assert.ok(sure(/^a+$/, 24) < kotu24 / 100)
console.log('tamam')
```

Korunma: kullanıcı girdisine uygulanan desenlerde iç içe niceleyici kullanmayın; girdinin uzunluğunu desenden
**önce** sınırlayın (ör. 200 karakter); kullanıcının kendisinin regex yazmasına izin vermeyin; JavaScript'te
atomik grup olmadığı için deseni sadeleştirin.

## Sık desenler ve neden kusursuz olmadıkları

```python calistir
import re
from datetime import date

EPOSTA = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]+")  # kaba biçim; asıl doğrulama onay e-postasıdır
TELEFON = re.compile(r"(?:\+90|0)?5\d{9}")  # TR cep; önce boşluk, tire, ayraç silinir
SAYI_TR = re.compile(r"-?\d{1,3}(?:\.\d{3})*(?:,\d+)?")  # 1.234,56 biçimi
ISO_TARIH = re.compile(r"\d{4}-\d{2}-\d{2}")

assert EPOSTA.fullmatch("ayse@ornek.com.tr") and not EPOSTA.fullmatch("ayse@ornek")
temiz = re.sub(r"[\s()-]", "", "0532 123 45 67")
assert TELEFON.fullmatch(temiz) and not TELEFON.fullmatch("02121234567")
assert SAYI_TR.fullmatch("1.234,56") and not SAYI_TR.fullmatch("1.23,4")
assert not SAYI_TR.fullmatch("1234,5")  # binlik ayırıcısız yazan kullanıcı reddedilir: iş kararı

# Biçim doğru ≠ değer geçerli: regex 31 Şubat'ı kabul eder, tarih ayrıştırıcı etmez
assert ISO_TARIH.fullmatch("2026-02-31")
try:
    date.fromisoformat("2026-02-31")
    raise AssertionError("hata bekleniyordu")
except ValueError:
    pass
print("tamam")
```

| Amaç                     | Regex'in yaptığı             | Ayrıca gereken                                         |
| ------------------------ | ---------------------------- | ------------------------------------------------------ |
| E-posta                  | Kaba biçim                   | Onay e-postası; kusursuz regex yoktur, aramayın         |
| Telefon                  | Biçim (önce temizleyin)      | SMS ile doğrulama; görüntüde biçimleme                 |
| TC kimlik no             | `[1-9]\d{10}` biçimi          | Denetim haneleri algoritması (kod)                     |
| IBAN                     | `TR\d{24}` biçimi             | Mod-97 denetimi (kod)                                  |
| Tarih                    | Biçim                        | Tarih ayrıştırıcı (`date.fromisoformat`, `Date`)        |
| Sayı aralığı (0–255, yaş) | Yapmayın                     | Sayıya çevirip karşılaştırın                            |

## Ne zaman regex kullanılmaz

| İş                                       | Regex yerine                                        |
| ---------------------------------------- | --------------------------------------------------- |
| HTML/XML'den veri çıkarmak               | HTML ayrıştırıcı (`html.parser`, DOM)               |
| JSON, YAML, TOML, CSV okumak             | O biçimin ayrıştırıcısı                             |
| URL'nin parçaları                         | `URL` (JS), `urllib.parse` (Python)                 |
| Dosya yolu, uzantı                        | `pathlib`, `path`                                   |
| Basit önek/sonek/içerme                   | `startswith`, `endswith`, `in`, `includes`          |
| Türkçe harf duyarsız arama                | Katlama işlevi + düz karşılaştırma                  |
| Anlam denetimi (tarih, kimlik, sayı aralığı) | Ayrıştırıp kodla denetlemek                       |

## Tuzaklar

| Belirti                                                    | Neden                                              | Çözüm                                                  |
| ---------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------ |
| Eşleşme beklenenden çok uzun                                | Açgözlü `.*` / `.+`                                | `[^…]+` ya da tembel `+?`                              |
| JS'te Türkçe kelimeler parçalanıyor ya da bulunmuyor          | `\w`, `\b`, `[a-z]` ASCII'dir                      | `\p{L}` + `u` bayrağı; sınır için bakışlar             |
| "istanbul" araması "İSTANBUL"u bulmuyor (JS)                | `i` bayrağı İ/ı'yı tanımaz                          | Türkçe katlama, sonra karşılaştırma                    |
| "ılık" araması "ilik"i de buluyor (Python)                  | `re.IGNORECASE` dört i'yi eşit sayar               | Türkçe katlama, sonra karşılaştırma                    |
| Doğrulama `"123\n"` girdisini kabul ediyor                   | Python `$` son satır sonundan önce eşleşir         | `re.fullmatch` ya da `\Z`                              |
| Aynı desen sırayla true/false döndürüyor (JS)                | `g` bayrağı + `lastIndex`                          | `test` için `g` kullanmayın ya da her seferinde yeni nesne |
| Değiştirme sonucunda `$&` gibi garip parçalar ya da yinelenmiş metin | Değiştirme metnindeki `$` özel anlamlı      | Kullanıcı metnini işlevle verin                         |
| Kullanıcı girdisiyle kurulan desen hata veriyor ya da her şeyi eşliyor | Özel karakterler kaçışlanmamış            | `re.escape` / kaçışlama işlevi                          |
| Sunucu belirli bir girdide donuyor                           | Felaket geri izleme                                | Deseni sadeleştirin, girdi uzunluğunu sınırlayın, atomik grup |
| 31 Şubat, 999.999.999.999 IP gibi değerler geçiyor           | Regex anlam bilmez                                 | Ayrıştırıp kodla denetleyin                            |
| `re.split` sonucunda fazladan öğeler                         | Desende yakalayan grup                             | `(?:…)` yakalamayan grup                                |
| Python'da `\p{L}` "bad escape" hatası                        | `re` Unicode özelliklerini bilmez                  | `[^\W\d_]` (harf) ya da `regex` paketi                  |

## Denetim listesi

- [ ] Her desenin yanında eşleşen ve eşleşmeyen en az ikişer örnekle test var (Türkçe harfli örnek dahil).
- [ ] Doğrulamada `fullmatch` / `\Z` (Python) ya da `^…$` (JS, `m` bayrağı olmadan) kullanılıyor.
- [ ] JS'te Türkçe metin için `\w`, `\b`, `[a-z]` yok; `\p{L}` ve `u` bayrağı var.
- [ ] Büyük/küçük harf duyarsız Türkçe arama regex bayrağıyla değil, katlamayla yapılıyor.
- [ ] Kullanıcı girdisinden kurulan desenler kaçışlanıyor; kullanıcı metniyle değiştirme işlevle yapılıyor.
- [ ] Kullanıcı girdisine uygulanan desenlerde iç içe niceleyici yok; girdi uzunluğu önceden sınırlanıyor.
- [ ] Anlam denetimi (tarih, kimlik, sayı aralığı) regex'ten sonra kodla yapılıyor.
- [ ] Desen karmaşıksa adlandırılmış gruplar ve yorum (`re.VERBOSE`) kullanılmış.

## Küçük modele yaptırırken

- **İsteme yazın:** "Deseni yaz, yanında eşleşmesi ve eşleşmemesi gereken en az 5'er örnekle (Türkçe harfli
  örnekler dahil) test yaz ve çalıştır. Doğrulamada `fullmatch` kullan. JavaScript ise `\p{L}` ve `u` bayrağı kullan.
  Tarih, kimlik numarası gibi anlam denetimlerini ayrı kodla yap."
- **Modelin tipik hatası:** "Kusursuz e-posta regex'i" yazmaya çalışır; JS'te `\w` ile Türkçe kelime arar; Python'da
  `re.match(r"^…$")` ile doğrular; kullanıcı metnini kaçışlamadan desene koyar; `(\w+\s?)*` gibi iç içe niceleyici
  yazar; HTML'i regex'le ayrıştırır.
- **Çıktıda arayın:** `(…+)+` ve `(…*)*` biçimleri, `new RegExp(` ve `re.compile(` içinde değişken, `\w` ve `\b`
  (JS dosyasında), `re.match(` ile başlayan doğrulama, `/g` ile `.test(`.
- **Doğrulama:** "Bu desene 50 000 karakterlik `aaaa…!` girdisi verince kaç milisaniye sürüyor?" diye ölçtürün.

## İlgili

- [Unicode ve kodlama](unicode-ve-kodlama.md): kod noktası, normalleştirme
- [Türkçe büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md): katlama
- [Türkçe metin işleme](../97-turkce/turkce-metin-isleme.md): arama için kırpma ve n-gram
- [Kabuk ve bash](kabuk-ve-bash.md): `grep` ve `sed`
- [JavaScript async kalıpları](javascript-async.md): olay döngüsünü tıkayan iş
- TCKN, VKN, IBAN (mod-97), telefon, e-posta doğrulama algoritmaları:
  [`kutuphane/py/kutuphane/dogrulama.py`](../../kutuphane/py/kutuphane/dogrulama.py),
  [`kutuphane/ts/src/dogrulama.ts`](../../kutuphane/ts/src/dogrulama.ts)
