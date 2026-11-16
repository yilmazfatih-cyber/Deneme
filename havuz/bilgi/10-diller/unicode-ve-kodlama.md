---
baslik: Unicode ve kodlama
ozet: Bayt, kod noktası ve grafem farkı (uzunluk ve kesme tuzakları, emoji), UTF-8 ve UTF-16, NFC/NFD normalleştirme, BOM, bozuk kodlama (mojibake) teşhis tablosu ve onarımı, dosya/veritabanı/HTTP katmanları.
etiketler: [unicode, kodlama, utf-8, turkce, metin]
duzey: orta
guncellik: 2026-11
---

# Unicode ve kodlama

> Bu notu ne zaman okumalı: ekranda `Ä°stanbul`, `ÅŸ`, `Ã§`, `þ`, `ý`, `�` gibi bozuk harfler görünce; metin
> uzunluğu sınırı, kesme ya da "ilk N karakter" yazarken; aynı görünen iki metin eşit çıkmayınca; dosya, veritabanı
> ya da HTTP üzerinden metin taşırken.

## Temel fikir

- Üç ayrı "uzunluk" vardır: **bayt** (diske ve ağa giden), **kod noktası** (Unicode'un numaralandırdığı karakter)
  ve **grafem** (insanın tek harf gördüğü birim). `ş` UTF-8'de 2 bayttır; `👨‍👩‍👧` 5 kod noktası, 18 bayt ama 1 grafemdir.
- Python `len()` kod noktası sayar; JavaScript `.length` **UTF-16 birimi** sayar (emoji 2 sayılır). İkisi de grafem
  saymaz. Kullanıcıya "en çok 20 karakter" derken grafem kastedilir.
- Aynı görünen metin farklı kod noktalarıyla yazılabilir: `ş` tek kod noktası (NFC) ya da `s` + birleşen çengel
  (NFD). Karşılaştırmadan ve saklamadan önce **NFC'ye normalleştirin**.
- Bozuk görünen metnin çoğu **onarılabilir**: baytlar yanlış kodlamayla okunmuştur. `�` (U+FFFD) görünüyorsa veri
  kaybolmuştur; özgün baytlara dönmek gerekir.
- Kural: her katmanda UTF-8 ve **açıkça** belirtilmiş kodlama (dosya, veritabanı, HTTP başlığı, HTML `meta`).

## Bayt, kod noktası, grafem

| Metin       | Python `len` (kod noktası) | JS `.length` (UTF-16) | UTF-8 bayt | Grafem |
| ----------- | -------------------------- | --------------------- | ---------- | ------ |
| `ş`         | 1                          | 1                     | 2          | 1      |
| `é` (NFD: e + ◌́) | 2                     | 2                     | 3          | 1      |
| `😀`        | 1                          | 2                     | 4          | 1      |
| `👍🏽`        | 2                          | 4                     | 8          | 1      |
| `👨‍👩‍👧`        | 5                          | 8                     | 18         | 1      |
| `🇹🇷`        | 2                          | 4                     | 8          | 1      |

```js calistir
import assert from 'node:assert/strict'

const grafem = new Intl.Segmenter('tr', { granularity: 'grapheme' })
const grafemSay = (s) => [...grafem.segment(s)].length

const aile = '👨\u200d👩\u200d👧'
assert.equal(aile.length, 8) // UTF-16 birimi
assert.equal([...aile].length, 5) // kod noktası
assert.equal(grafemSay(aile), 1) // insanın gördüğü
assert.equal(new TextEncoder().encode(aile).length, 18) // bayt

// YANLIŞ: .slice UTF-16 birimiyle keser; emojinin yarısı (yalnız vekil) kalır
assert.equal('😀'.slice(0, 1).isWellFormed(), false)
assert.equal([...'🇹🇷'].slice(0, 1).join(''), '🇹') // bayrak yarıya bölündü

// DOĞRU: grafemle kes
const kes = (s, n) => [...grafem.segment(s)].slice(0, n).map((p) => p.segment).join('')
assert.equal(kes('Merhaba 👨\u200d👩\u200d👧 aile', 9), 'Merhaba 👨\u200d👩\u200d👧')
console.log('tamam')
```

```python calistir
metin = "Şükrü 👍🏽"
assert len(metin) == 8  # kod noktası (başparmak + ten rengi = 2)
assert len(metin.encode("utf-8")) == 17  # Ş, ü, ü 2'şer; emoji parçaları 4'er bayt
assert len(metin.encode("utf-16-le")) // 2 == 10  # JS'in .length'i ve bazı API'lerin saydığı birim

# Kod noktasıyla kesmek grafemi böler: ten rengi değiştiricisi kopar
assert metin[:7] == "Şükrü 👍" and metin[7] == "\U0001f3fd"
# Python standart kütüphanesinde grafem bölme yok; üçüncü taraf `regex` paketinin \X deseni ya da
# benzeri gerekir. Sınırı bayt ya da kod noktasıyla koyuyorsanız kesmeden önce bunu bilin.
print("tamam")
```

| Sınır nerede                                    | Ne sayılır                    |
| ----------------------------------------------- | ----------------------------- |
| Kullanıcıya gösterilen "en çok N karakter"        | Grafem                        |
| Veritabanı sütunu (PostgreSQL `varchar(n)`)       | Kod noktası                   |
| Bayt sınırlı alan (dosya adı, bazı protokoller)   | UTF-8 bayt                    |
| JavaScript `.length`, `maxlength` benzeri istemci denetimi | UTF-16 birimi          |

## Normalleştirme: NFC ve NFD

```python calistir
import unicodedata

birlesik = "ş"  # tek kod noktası U+015F (NFC)
ayrik = "s\u0327"  # s + BİRLEŞEN ÇENGEL (NFD): macOS dosya adlarında ve kopyala-yapıştırda görülür
assert birlesik != ayrik and len(ayrik) == 2  # göze aynı, eşit değil
assert unicodedata.normalize("NFC", ayrik) == birlesik
assert unicodedata.normalize("NFD", birlesik) == ayrik

# Arama ve karşılaştırma öncesi iki tarafı da NFC'ye çevirin
assert unicodedata.normalize("NFC", "Kayseri\u0307") != "Kayseri"  # fazladan birleşen nokta (İ küçültme artığı)

# NFKC uyumluluk dönüşümü: tam genişlikli rakam, bağlı harf → düz biçim (kimlik, arama anahtarı için)
assert unicodedata.normalize("NFKC", "１２３ ﬁ") == "123 fi"
print("tamam")
```

| Biçim  | Ne yapar                                   | Ne zaman                                          |
| ------ | ------------------------------------------ | ------------------------------------------------- |
| NFC    | Birleşebilen harfleri tek kod noktası yapar | Varsayılan: girdiyi alır almaz, saklamadan önce   |
| NFD    | Harfi taban + birleşen işarete ayırır       | Aksan/çengel ayıklama (katlama) ara adımı         |
| NFKC   | NFC + uyumluluk eşlemesi (１→1, ﬁ→fi)       | Kullanıcı adı, arama anahtarı; **gösterilen metne değil** |

JavaScript karşılığı: `metin.normalize('NFC')`. Türkçe `İ` yerel kuralsız küçültülünce `i` + birleşen nokta (U+0307)
olur; ayrıntı: [Türkçe büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md).

## BOM

UTF-8 BOM (`EF BB BF`) dosyanın başındaki görünmez işarettir. Excel'in açacağı CSV dışında **yazmayın**; okurken
hoş görün.

```python calistir
import json
from pathlib import Path

Path("ayar.json").write_bytes(b"\xef\xbb\xbf" + '{"il": "İzmir"}'.encode("utf-8"))
try:
    json.loads(Path("ayar.json").read_text(encoding="utf-8"))  # BOM metnin ilk karakteri olarak kalır
    raise AssertionError("hata bekleniyordu")
except json.JSONDecodeError as hata:
    assert "BOM" in str(hata)
assert json.loads(Path("ayar.json").read_text(encoding="utf-8-sig")) == {"il": "İzmir"}  # DOĞRU
print("tamam")
```

Node'da `readFileSync(yol, 'utf8')` BOM'u (`U+FEFF`) metinde bırakır ve `JSON.parse` `SyntaxError` verir;
`new TextDecoder().decode(baytlar)` ise BOM'u atar (ikisi de Node 22.23.4 ile denendi).

## Bozuk kodlama: teşhis ve onarım

| Görünen                                    | Ne oldu                                              | Onarım (Python)                                   |
| ------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------- |
| `Ä°stanbul`, `ÅŸ`, `Ä±`, `ÄŸ`, `Ã§`, `Ã¶`, `Ã¼` | UTF-8 baytları Windows-1252 (cp1252) sanılmış      | `s.encode("cp1252").decode("utf-8")`              |
| `Å`, `Ä`, `Ã` ardından görünmeyen ya da kutu biçimli karakter | UTF-8 baytları Latin-1 sanılmış | `s.encode("latin-1").decode("utf-8")`             |
| `Ãœ`, `Ã„Â°` gibi üçlü/dörtlü diziler        | İki kez yanlış çevrilmiş (çift kodlama)              | Aynı onarımı iki kez uygulayın                    |
| `Ýstanbul`, `þ`, `ý`, `ð`, `Þ`, `Ð` (ç ö ü sağlam) | Windows-1254 (Türkçe) baytları Latin-1 sanılmış | `s.encode("latin-1").decode("cp1254")`           |
| `�` (U+FFFD) ya da `?`                      | Türkçe baytlar UTF-8 diye okunmuş; çevrilemeyen bayt **atıldı** | Onarılamaz: özgün dosyayı doğru kodlamayla yeniden okuyun |
| Python'da `UnicodeDecodeError: 'utf-8' codec can't decode byte 0xfe` | Dosya cp1254 (eski Türkçe Windows) | `open(…, encoding="cp1254")`                      |

```python calistir
# Görev: "Ä°stanbul" → "İstanbul"
bozuk = "İstanbul".encode("utf-8").decode("cp1252")  # nasıl bozulduğunu yeniden üretelim
assert bozuk == "Ä°stanbul"
assert bozuk.encode("cp1252").decode("utf-8") == "İstanbul"  # ters işlem onarır

# Çift kodlama: aynı onarımı iki kez
cift = bozuk.encode("utf-8").decode("cp1252")
assert cift == "Ã„Â°stanbul"
assert cift.encode("cp1252").decode("utf-8").encode("cp1252").decode("utf-8") == "İstanbul"

# Türkçe Windows (cp1254) baytları Latin-1 sanılmış
assert "Şişli".encode("cp1254").decode("latin-1") == "Þiþli"
assert "Þiþli".encode("latin-1").decode("cp1254") == "Şişli"

# Kayıp: cp1254 baytları UTF-8 diye "hata görmezden gelinerek" okunmuş → onarılamaz
kayip = "şık".encode("cp1254").decode("utf-8", errors="replace")
assert kayip == "��k"


def onar(metin: str) -> str:
    """Bilinen iki kalıbı dener; onarım yalnız sonuç daha 'Türkçe' görünüyorsa kabul edilir."""
    for yanlis, dogru in (("cp1252", "utf-8"), ("latin-1", "cp1254")):
        try:
            aday = metin.encode(yanlis).decode(dogru)
        except UnicodeError:
            continue
        if sum(c in "çğıöşüÇĞİÖŞÜ" for c in aday) > sum(c in "çğıöşüÇĞİÖŞÜ" for c in metin):
            return aday
    return metin


assert onar("Ä°stanbul ÅŸehri") == "İstanbul şehri"
assert onar("Ýzmir'de þenlik") == "İzmir'de şenlik"
assert onar("Zaten doğru: çay") == "Zaten doğru: çay"
print("tamam")
```

Onarımı yalnız bir kez, kaynağında yapın ve onarılmış metni saklayın; her okumada "düzeltmeye" çalışmak doğru
metni de bozar. Çok kalıplı onarım için üçüncü taraf `ftfy` paketi vardır (bu ortamda denenmedi).

## Katmanlarda kodlama

| Katman                    | Doğru ayar                                                   | Belirti yanlışsa                               |
| ------------------------- | ------------------------------------------------------------ | ---------------------------------------------- |
| Kaynak dosya, metin dosyası | UTF-8, BOM'suz; okurken/yazarken `encoding="utf-8"`        | Windows'ta `UnicodeDecodeError` ya da `Ã§`     |
| CSV (Excel'e gidecek)      | `utf-8-sig` (BOM'lu); ayrıntı [Veri biçimleri](veri-bicimleri.md) | Excel'de `ÅŸ`                             |
| HTML                      | `<meta charset="utf-8">` `<head>`'in başında                 | Sayfada `Ã§`                                   |
| HTTP yanıtı               | `Content-Type: text/html; charset=utf-8` (JSON zaten UTF-8)  | Tarayıcı yanlış tahmin eder                    |
| URL                       | Yüzde kodlama UTF-8 baytlarından: `ş` → `%C5%9F`              | `encodeURIComponent` / `urllib.parse.quote` kullanın |
| SQLite                    | Her zaman UTF-8/16; sorun çıkmaz                              | —                                              |
| PostgreSQL                | Veritabanı `UTF8` kodlamalı oluşturulur                       | Emoji ya da Türkçe harf eklenemez              |
| MySQL                     | `utf8mb4` (eski `utf8` 3 baytlıktır, emoji sığmaz)            | Emojili kayıt hata verir ya da `?` olur        |
| Uçbirim / komut satırı     | `LANG=tr_TR.UTF-8` ya da `C.UTF-8`                            | Çıktıda `?` ya da kaçış dizileri               |
| E-posta başlığı            | Kütüphanenin kodlamasına bırakın (RFC 2047)                   | Konu satırında `=?utf-8?…`                     |

## Tuzaklar

| Belirti                                                  | Neden                                              | Çözüm                                                  |
| -------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------ |
| Kısaltılmış metnin sonunda `�` ya da yarım emoji            | UTF-16 birimi ya da bayt ile kesme                  | Grafemle kesin (`Intl.Segmenter`)                      |
| "En çok 20 karakter" emojili adlarda erken doluyor          | `.length` UTF-16 sayıyor                            | Grafem sayın; veritabanı sınırını ayrıca bayt/kod noktasıyla denetleyin |
| Aynı görünen iki ad eşit değil, arama bulamıyor             | NFC/NFD farkı                                       | Girdiyi NFC'ye normalleştirin                          |
| macOS'tan yüklenen dosyanın adı aramada bulunmuyor          | Dosya adı NFD                                       | Dosya adını NFC'ye çevirip saklayın                    |
| `JSON.parse` / `json.loads` ilk karakterde hata veriyor      | Dosyada BOM                                         | `utf-8-sig` ya da `TextDecoder`                        |
| `Ä°`, `ÅŸ` gibi diziler                                     | UTF-8 baytları cp1252 sanılmış                      | `encode("cp1252").decode("utf-8")`; kaynağı düzeltin     |
| `Ý`, `þ`, `ý` gibi harfler                                  | cp1254 baytları Latin-1 sanılmış                    | `encode("latin-1").decode("cp1254")`                    |
| `�` görünüyor                                              | Baytlar yanlış kodlamayla okunurken atıldı           | Özgün kaynağı doğru kodlamayla yeniden okuyun           |
| Kullanıcı adında görünmez karakter ya da benzer görünen harf | Sıfır genişlikli boşluk, Kiril `а`                  | NFKC + izinli karakter listesi (güvenlik kümesi)        |
| `errors="ignore"` sonrası harfler sessizce kayboldu          | Hata gizlendi                                       | `errors="strict"` (varsayılan); kodlamayı doğru seçin   |

## Denetim listesi

- [ ] Her dosya işleminde kodlama açıkça yazılmış (`utf-8`; Excel CSV'de `utf-8-sig`).
- [ ] Kullanıcıdan gelen metin alındığı anda NFC'ye normalleştiriliyor.
- [ ] Uzunluk sınırları neyin sayıldığına göre (grafem / kod noktası / bayt) yazılmış ve emojili testle denenmiş.
- [ ] Kesme ve "…" ekleme grafem sınırında yapılıyor.
- [ ] BOM'lu dosya okunabiliyor; kendi ürettiğimiz dosyalarda (CSV hariç) BOM yok.
- [ ] HTML'de `meta charset`, HTTP'de `charset=utf-8`, veritabanında UTF-8 (`utf8mb4`) var.
- [ ] Testlerde `Şırnak`, `İzmir`, `ğ`, NFD `ş` ve `👨‍👩‍👧` örnekleri var.
- [ ] `errors="ignore"` ve `errors="replace"` yalnız bilinçli olarak (günlük yazdırma gibi) kullanılıyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bütün metin girdilerini NFC'ye normalleştir; dosyaları `encoding=\"utf-8\"` ile aç; kullanıcıya
  gösterilen karakter sınırını grafemle say (`Intl.Segmenter`); bozuk metni onarırken önce nasıl bozulduğunu
  yeniden üreten bir test yaz."
- **Modelin tipik hatası:** `.length` ya da `len()` ile karakter sınırı koyar; `s[:20] + "…"` ile emojiyi böler;
  `errors="ignore"` ile hatayı gizler; bozuk metni elle bul-değiştir tablosuyla "düzeltir" (`Ã§` → `ç`) ve öteki
  harfleri kaçırır; NFD dosya adlarını hesaba katmaz.
- **Çıktıda arayın:** `errors="ignore"`, `errors="replace"`, `.slice(0,`, `[:N]` ile kesme, `.length >`, `encoding`
  yazılmamış `open(`, elle yazılmış `replace("Ã§", "ç")` zincirleri.
- **Doğrulama:** "Ä°stanbul ÅŸehri" ve "Ýzmir'de þenlik" girdileriyle onarım testini, `👨‍👩‍👧` ile kesme testini isteyin.

## İlgili

- [Türkçe büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md)
- [Veri biçimleri](veri-bicimleri.md): JSON, CSV, Excel
- [Python tuzakları](python-tuzaklar.md): kodlamasız `open()`
- [Düzenli ifadeler](duzenli-ifadeler.md): `\w`, `\p{L}` ve Türkçe
- [Türkçe metin işleme](../97-turkce/turkce-metin-isleme.md): belirteçleme, arama, n-gram
- Unicode sınıf tabloları ve Türkçe metin işleme: [`dil-modeli/dil_modeli/unicode_classes.py`](../../dil-modeli/dil_modeli/unicode_classes.py),
  [`kutuphane/py/kutuphane/metin.py`](../../kutuphane/py/kutuphane/metin.py)
