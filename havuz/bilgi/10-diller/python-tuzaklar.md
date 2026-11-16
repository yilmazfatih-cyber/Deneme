---
baslik: Python tuzakları
ozet: Değişebilir varsayılan argüman, geç bağlama, is ve ==, sığ kopya, tükenen yineleyici, bankacı yuvarlaması, istisna yutma, with, pathlib ve kodlamasız dosya açma; çalışan örneklerle.
etiketler: [python, hata-ayiklama, dosya, sayilar, kodlama]
duzey: temel
guncellik: 2026-11
---

# Python tuzakları

> Bu notu ne zaman okumalı: Python kodu yazarken ya da incelerken; "ikinci çağrıda eski veri çıkıyor", "döngü hiç
> çalışmadı", "Windows'ta Türkçe harfler bozuk", "hata yok ama sonuç 0" gibi sessiz bir hatayla karşılaştığınızda.

## Temel fikir

Python'un tuzakları çoğunlukla **sessizdir**: istisna atılmaz, yanlış değer akmaya devam eder. Hepsinin kökü birkaç
kurala dayanır:

- Değişkenler nesnelere **ad**dır; atama kopyalamaz. Aynı listeye iki ad bakabilir.
- Varsayılan argüman işlev **tanımlanırken bir kez** hesaplanır.
- Kapanım değişkenin **kendisini** tutar, o anki değerini değil.
- Üreteç (generator), `map`, `filter`, `zip` **bir kez** gezilir.
- `round` ve `//` okulda öğrenilen kuralla yuvarlamaz.
- `open()` kodlama verilmezse işletim sisteminin varsayılanını kullanır; Windows'ta bu UTF-8 değildir.

Çoğunu `ruff` yakalar; kural kodları tuzaklar tablosunda.

## Değişebilir varsayılan argüman

```python calistir
# YANLIŞ: varsayılan liste işlev tanımlanırken BİR KEZ oluşur ve çağrılar arasında paylaşılır
def sepete_ekle_yanlis(urun, sepet=[]):
    sepet.append(urun)
    return sepet


assert sepete_ekle_yanlis("çay") == ["çay"]
assert sepete_ekle_yanlis("simit") == ["çay", "simit"]  # önceki müşterinin çayı!


# DOĞRU: None ile işaretle, içeride oluştur
def sepete_ekle(urun, sepet=None):
    if sepet is None:
        sepet = []
    sepet.append(urun)
    return sepet


assert sepete_ekle("çay") == ["çay"]
assert sepete_ekle("simit") == ["simit"]
print("tamam")
```

Aynı kural `def f(zaman=datetime.now())` için de geçerlidir: saat, modül yüklendiği anda donar (ruff B008).

## Kapanımda geç bağlama

```python calistir
from functools import partial
from operator import mul

# YANLIŞ: lambda i'nin değerini değil, i değişkeninin kendisini tutar
carpanlar = [lambda x: x * i for i in range(1, 4)]
assert [f(10) for f in carpanlar] == [30, 30, 30]

# DOĞRU 1: varsayılan argümanla o anki değeri sabitle
carpanlar = [lambda x, i=i: x * i for i in range(1, 4)]
assert [f(10) for f in carpanlar] == [10, 20, 30]

# DOĞRU 2: functools.partial
carpanlar = [partial(mul, i) for i in range(1, 4)]
assert [f(10) for f in carpanlar] == [10, 20, 30]
print("tamam")
```

Aynı hata düğme geri çağrılarında, zamanlanmış işlerde ve `asyncio` görevlerinde döngü değişkeni kullanıldığında çıkar.

## is ile ==, ve öteki karşılaştırma tuzakları

```python calistir
a = 1000
b = int("1000")
assert a == b  # değerler eşit
assert a is not b  # ama aynı nesne değil: `is` kimliği sınar

# Küçük tamsayılar (-5..256) önbellekte olduğu için `is` "bazen çalışır" ve hatayı gizler
c, d = int("7"), int("7")
assert c is d

# `is` yalnız None, True/False ve kendi tekil nesneleriniz için
deger = None
assert deger is None

# YANLIŞ: `renk == "kırmızı" or "mavi"` → ("mavi") her zaman doğru
renk = "yeşil"
assert (renk == "kırmızı" or "mavi") == "mavi"
assert renk not in ("kırmızı", "mavi")  # DOĞRU

# bool, int'in alt sınıfıdır: JSON'daki true bir "sayı" denetiminden geçer
assert isinstance(True, int) and True + True == 2
miktar = True
assert type(miktar) is not int  # sayı alanında bool'u reddetmek için
print("tamam")
```

## Sığ kopya ve yerinde değiştirme

```python calistir
import copy

# YANLIŞ: * aynı iç listeyi üç kez koyar
izgara = [[0] * 3] * 3
izgara[0][0] = 1
assert izgara == [[1, 0, 0], [1, 0, 0], [1, 0, 0]]

# DOĞRU: her satır ayrı liste
izgara = [[0] * 3 for _ in range(3)]
izgara[0][0] = 1
assert izgara == [[1, 0, 0], [0, 0, 0], [0, 0, 0]]

# .copy(), dict(), list(), [:] SIĞDIR: iç nesneler paylaşılır
ayar = {"tema": "koyu", "diller": ["tr"]}
kopya = ayar.copy()
kopya["diller"].append("en")
assert ayar["diller"] == ["tr", "en"]  # asıl da değişti
derin = copy.deepcopy(ayar)
derin["diller"].append("de")
assert ayar["diller"] == ["tr", "en"]

# sort() yerinde sıralar ve None döndürür
liste = [3, 1, 2]
sonuc = liste.sort()
assert sonuc is None and liste == [1, 2, 3]
assert sorted([3, 1, 2]) == [1, 2, 3]  # yeni liste döndürür
print("tamam")
```

## Yineleyici tüketimi ve yineleme sırasında değiştirme

```python calistir
satirlar = (s.strip() for s in ["a ", " b", "c"])  # üreteç: bir kez gezilir
assert list(satirlar) == ["a", "b", "c"]
assert list(satirlar) == []  # İKİNCİ gezinti boş: hata yok, veri yok

kareler = map(lambda x: x * x, [1, 2, 3])
assert 4 in kareler  # `in` de tüketir...
assert list(kareler) == [9]  # ...1 ve 4 gitti

# zip kısa olanda sessizce durur; strict=True farkı yakalar
adlar, yaslar = ["Ali", "Ayşe", "Can"], [30, 25]
assert list(zip(adlar, yaslar)) == [("Ali", 30), ("Ayşe", 25)]  # Can kayboldu
try:
    list(zip(adlar, yaslar, strict=True))
    raise AssertionError("hata bekleniyordu")
except ValueError:
    pass

# Sözlükte gezinirken silmek hata verir; listede ise öğe atlatır
stok = {"çay": 0, "simit": 5}
try:
    for urun in stok:
        if stok[urun] == 0:
            del stok[urun]
except RuntimeError as hata:
    assert "changed size during iteration" in str(hata)
stok = {u: n for u, n in {"çay": 0, "simit": 5}.items() if n > 0}  # DOĞRU: yeni sözlük
assert stok == {"simit": 5}
print("tamam")
```

## Bölme ve yuvarlama

```python calistir
import math
from decimal import ROUND_HALF_UP, Decimal

assert 7 / 2 == 3.5  # / her zaman float döndürür (dizin olarak kullanılamaz)
assert -7 // 2 == -4  # // eksi sonsuza yuvarlar, sıfıra değil
assert int(-3.5) == -3  # int() sıfıra doğru keser
assert -7 % 2 == 1  # kalanın işareti bölenle aynı

# round() "bankacı yuvarlaması": .5 en yakın ÇİFT sayıya gider
assert [round(0.5), round(1.5), round(2.5), round(3.5)] == [0, 2, 2, 4]
assert round(2.675, 2) == 2.67  # 2.675 ikilikte 2.67499999… olduğu için

# Para: Decimal + açık yuvarlama kuralı; float'tan değil METİNDEN kurun
assert Decimal("2.675").quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) == Decimal("2.68")
assert Decimal(2.675) != Decimal("2.675")  # float'tan kurmak hatayı da taşır
assert 0.1 + 0.2 != 0.3 and math.isclose(0.1 + 0.2, 0.3)
print("tamam")
```

Fatura, vergi, taksit gibi hesaplarda hangi yuvarlama kuralının geçerli olduğu bir **iş kararıdır** (mevzuat ya da
sözleşme belirler); kodda açıkça yazılmalıdır. Bu not mali danışmanlık değildir.

## Dizgi birleştirme

```python calistir
yas = 30
try:
    "Yaş: " + yas  # YANLIŞ: str + int kendiliğinden çevrilmez
    raise AssertionError("hata bekleniyordu")
except TypeError:
    pass
assert f"Yaş: {yas}" == "Yaş: 30"

# Döngüde += yerine parçaları listede topla, sonda bir kez birleştir
parcalar = [f"satır {i}" for i in range(3)]
assert "\n".join(parcalar) == "satır 0\nsatır 1\nsatır 2"
assert ", ".join(map(str, [1, 2])) == "1, 2"  # join yalnız str kabul eder

# strip bir KARAKTER KÜMESİ siler, son eki değil
assert "test.txt".strip(".txt") == "es"
assert "test.txt".removesuffix(".txt") == "test"
print("tamam")
```

Döngüde `metin += parca` CPython'da bazen hızlı çalışır ama bu garantili değildir; büyük metinde `join` kullanın.
Dosya yolunu `+` ile değil `pathlib` ile kurun; SQL'i asla dizgi birleştirerek kurmayın (parametre kullanın).

## İstisna yutma

```python calistir
import sys


def oran(a, b):
    try:
        return a / bb  # yazım hatası → NameError
    except Exception:  # YANLIŞ: programlama hatasını da yakalar
        return 0


assert oran(1, 2) == 0  # hata gizlendi; yanlış sonuç sessizce döndü


def oran_dogru(a, b):
    try:
        return a / b
    except ZeroDivisionError:  # DOĞRU: yalnız beklenen hata
        return 0


assert oran_dogru(1, 0) == 0 and oran_dogru(1, 2) == 0.5


def cik():
    try:
        sys.exit(2)
    except:  # YANLIŞ: çıplak except, SystemExit ve Ctrl+C'yi de yutar
        return "devam"


assert cik() == "devam"
print("tamam")
```

Kural: yakalayacağınız istisnayı adıyla yazın; geniş yakalama yalnız en dış sınırda (komut satırı `main`, istek
işleyici) ve **günlüğe yazıp** yapılır. Ayrıntı: [Hata yönetimi kalıpları](hata-yonetimi-kaliplari.md).

## with ve kaynak sızıntısı

```python calistir
import subprocess
import sys
from pathlib import Path

Path("sizinti.py").write_text(
    "def yaz():\n    f = open('veri.txt', 'w', encoding='utf-8')\n    f.write('x')\nyaz()\n",
    encoding="utf-8",
)
# -X dev: geliştirme kipi; kapatılmamış dosyayı uyarı olarak gösterir
sonuc = subprocess.run([sys.executable, "-X", "dev", "sizinti.py"], capture_output=True, text=True)
assert "ResourceWarning: unclosed file" in sonuc.stderr

# DOĞRU: with, hata olsa bile dosyayı kapatır
try:
    with open("veri.txt", "w", encoding="utf-8") as f:
        f.write("yarım")
        raise ValueError("işlem yarıda kesildi")
except ValueError:
    pass
assert f.closed
print("tamam")
```

Aynısı veritabanı bağlantısı, kilit, geçici klasör (`tempfile.TemporaryDirectory()`) ve ağ oturumu için geçerlidir.
Kapatılmayan kaynak uzun süren süreçte "Too many open files" hatasına, Windows'ta silinemeyen dosyaya yol açar.

## Yol işlemleri: pathlib

```python calistir
import os
from pathlib import Path

# Mutlak parça soldakini SİLER: kullanıcıdan gelen dosya adı tehlikelidir
assert os.path.join("yuklemeler", "/etc/passwd") == "/etc/passwd"
assert Path("yuklemeler") / "/etc/passwd" == Path("/etc/passwd")


def guvenli_yol(kok: Path, ad: str) -> Path:
    yol = (kok / ad).resolve()
    if not yol.is_relative_to(kok.resolve()):
        raise ValueError(f"İzin verilmeyen yol: {ad}")
    return yol


kok = Path("yuklemeler")
assert guvenli_yol(kok, "rapor.pdf").name == "rapor.pdf"
for kotu in ["../gizli.txt", "/etc/passwd", "a/../../b"]:
    try:
        guvenli_yol(kok, kotu)
        raise AssertionError(kotu)
    except ValueError:
        pass

# Uzantı ve ad işlemleri: metin kesmek yerine Path yöntemleri
p = Path("arsiv/yedek.tar.gz")
assert p.suffix == ".gz" and p.suffixes == [".tar", ".gz"]
assert p.with_suffix(".zip") == Path("arsiv/yedek.tar.zip")
assert p.parent == Path("arsiv") and p.stem == "yedek.tar"
print("tamam")
```

Göreli yol, betiğin bulunduğu klasöre göre değil **çalıştırıldığı** klasöre göre çözülür:

```python calistir
import subprocess
import sys
from pathlib import Path

Path("betik").mkdir()
Path("betik/ayar.txt").write_text("tema=koyu", encoding="utf-8")
Path("betik/yanlis.py").write_text("print(open('ayar.txt', encoding='utf-8').read())", encoding="utf-8")
Path("betik/dogru.py").write_text(
    "from pathlib import Path\n"
    "AYAR = Path(__file__).resolve().parent / 'ayar.txt'\n"
    "print(AYAR.read_text(encoding='utf-8'))\n",
    encoding="utf-8",
)
kotu = subprocess.run([sys.executable, "betik/yanlis.py"], capture_output=True, text=True)
assert "FileNotFoundError" in kotu.stderr  # üst klasörden çalıştırınca bulunamadı
iyi = subprocess.run([sys.executable, "betik/dogru.py"], capture_output=True, text=True)
assert iyi.stdout.strip() == "tema=koyu"
print("tamam")
```

## Kodlama belirtmeden dosya açma

Python 3.13'te `encoding` verilmeyen `open()`, `read_text()`, `write_text()` işletim sisteminin yerel kodlamasını
kullanır: Linux ve macOS'ta çoğunlukla UTF-8, **Türkçe Windows'ta cp1254**. UTF-8'in varsayılan olacağı sürüm
planlanmıştır (PEP 686) ama buna güvenmeyin; her çağrıya `encoding="utf-8"` yazın.

```python calistir
import subprocess
import sys
from pathlib import Path

Path("not.txt").write_text("Iğdır, İzmir, çöp", encoding="utf-8")
# Türkçe Windows'ta encoding'siz okumanın yaptığı şey (cp1254 ile okumak):
assert Path("not.txt").read_text(encoding="cp1254") == "IÄŸdÄ±r, Ä°zmir, Ã§Ã¶p"
Path("not.txt").write_text("Şırnak", encoding="utf-8")
try:
    Path("not.txt").read_text(encoding="cp1254")  # 'Ş'nin ikinci baytı cp1254'te tanımsız
    raise AssertionError("hata bekleniyordu")
except UnicodeDecodeError:
    pass

# encoding'siz çağrıları bulmak: -X warn_default_encoding (ya da ruff PLW1514)
sonuc = subprocess.run(
    [sys.executable, "-X", "warn_default_encoding", "-c", "open('not.txt').read()"],
    capture_output=True,
    text=True,
)
assert "EncodingWarning" in sonuc.stderr
print("tamam")
```

Bozuk görünen metni onarmak ve teşhis tablosu: [Unicode ve kodlama](unicode-ve-kodlama.md).

## Tuzaklar

| Belirti                                                      | Neden                                              | Çözüm (ruff kuralı)                                   |
| ------------------------------------------------------------ | -------------------------------------------------- | ----------------------------------------------------- |
| İkinci çağrıda önceki çağrının verisi görünüyor               | Değişebilir varsayılan argüman                     | `None` + içeride oluştur (B006, B008)                  |
| Döngüde kurulan işlevler hep son değeri kullanıyor             | Kapanımda geç bağlama                              | Varsayılan argüman ya da `partial` (B023)              |
| `x is 1000` bazen yanlış                                     | `is` kimlik sınar                                  | `==`; `is` yalnız `None` için                          |
| `if renk == "a" or "b"` hep doğru                             | `or` ikinci terimi tek başına değerlendirir         | `renk in ("a", "b")`                                   |
| JSON'daki `true` sayı alanından geçti                          | `bool`, `int`'in alt sınıfı                         | `type(x) is int` ya da şema doğrulayıcı                |
| Bir hücreyi değiştirince bütün sütun değişti                   | `[[0] * 3] * 3` aynı listeyi paylaşır               | Liste üreteci (comprehension)                          |
| Kopyayı değiştirince asıl veri de değişti                       | Sığ kopya                                          | `copy.deepcopy` ya da yeni nesne kurmak               |
| `x = liste.sort()` sonrası `x` boş (`None`)                   | Yerinde sıralama `None` döndürür                   | `sorted(liste)`                                        |
| İkinci döngü hiç dönmüyor                                     | Üreteç/`map`/`filter` tükendi                      | `list(...)` ile bir kez somutlaştırın                  |
| Eşleştirmede kayıt kayboluyor                                 | `zip` kısa olanda durur                            | `zip(..., strict=True)` (B905)                         |
| `dictionary changed size during iteration`                   | Gezinirken silme                                    | Yeni sözlük kurun ya da `list(d)` üzerinde gezinin     |
| 2,5 → 2 yuvarlandı; kuruş farkı                               | Bankacı yuvarlaması; float temsil hatası            | `Decimal("…")` + `ROUND_HALF_UP`                       |
| Negatif bölmede sonuç bir eksik                               | `//` eksi sonsuza yuvarlar                          | Niyete göre `math.trunc` ya da `math.floor`             |
| `"test.txt".strip(".txt")` → `"es"`                          | `strip` karakter kümesi siler                       | `removesuffix` / `removeprefix`                        |
| Hata yok ama sonuç 0 ya da boş                                | `except Exception: return 0`                        | Dar istisna; genişini yalnız sınırda (BLE001)          |
| Ctrl+C programı durdurmuyor                                   | Çıplak `except:`                                    | En geniş `except Exception` (E722)                     |
| "Too many open files"; Windows'ta dosya silinemiyor            | `with` kullanılmamış                                | `with` (SIM115)                                        |
| Kullanıcının verdiği adla sistem dosyası okundu                | Mutlak ya da `..` içeren yol                        | `resolve()` + `is_relative_to` denetimi                |
| Betik başka klasörden çalışınca dosyayı bulamıyor              | Göreli yol çalışma klasörüne göre çözülür           | `Path(__file__).resolve().parent / "ad"`               |
| Windows'ta `UnicodeDecodeError` ya da `Ä±`, `ÅŸ`               | `encoding` verilmemiş                               | `encoding="utf-8"` (PLW1514)                           |
| `datetime.utcnow()` uyarı veriyor, saat dilimi karışıyor        | Saat dilimsiz (naive) zaman; 3.12'de kullanımdan kalktı | `datetime.now(timezone.utc)` (DTZ003, DTZ005)       |

## Denetim listesi

- [ ] `ruff check` temiz; en az şu kurallar açık: `B` (bugbear), `E722`, `BLE001`, `SIM115`, `PLW1514`, `DTZ`, `PTH`.
- [ ] Varsayılan argümanların hiçbiri liste, sözlük, küme ya da işlev çağrısı değil.
- [ ] `is` yalnız `None`/`True`/`False` ile kullanılmış.
- [ ] Birden çok kez gezilen veriler liste; `zip`'lerde `strict=True`.
- [ ] Para hesabı `Decimal` ile, yuvarlama kuralı açıkça yazılmış; `float` yok.
- [ ] Çıplak `except:` ve `except Exception: pass` yok; geniş yakalama yalnız sınırda ve günlüğe yazılıyor.
- [ ] Dosya, bağlantı, kilit `with` ile açılıyor.
- [ ] Her `open`/`read_text`/`write_text` çağrısında `encoding="utf-8"` var.
- [ ] Kullanıcıdan gelen dosya adları kök klasörün dışına çıkamıyor (test var).
- [ ] Betikler veri dosyalarını `Path(__file__)`'e göre buluyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Varsayılan argümanda liste/sözlük kullanma; her dosya işleminde `encoding=\"utf-8\"` yaz; yolları
  `pathlib` ile kur; yalnız beklediğin istisnayı yakala; parayı `Decimal` ile hesapla. Bitince `ruff check` çalıştır."
- **Modelin tipik hatası:** `open(yol)` yazıp kodlamayı unutur; `except Exception as e: print(e)` ile devam eder;
  `round(x, 2)` ile para yuvarlar; `os.path.join(kok, kullanici_girdisi)` ile yol kurar; üreteci iki kez gezer.
- **Çıktıda arayın:** `open(` (yanında `encoding` var mı), `except:` ve `except Exception`, `=[]` ve `={}`
  varsayılanları, `round(`, `float(` ile para, `os.path.join(`.
- **Doğrulama:** "Türkçe karakterli dosyayla (`Şırnak`, `İzmir`) ve `../` içeren dosya adıyla test yaz" deyin.

## İlgili

- [Python tipleme ve proje düzeni](python-tipleme-ve-proje.md): `ruff`, `mypy`, `pyproject.toml`
- [Python standart kütüphanesi tuzakları](python-standart-kutuphane.md): `groupby`, `lru_cache`, `logging`, `subprocess`
- [Python eşzamanlılık](python-eszamanlilik.md): `asyncio`, iş parçacığı, süreç
- [Hata yönetimi kalıpları](hata-yonetimi-kaliplari.md)
- [Unicode ve kodlama](unicode-ve-kodlama.md)
- Türkçe metin ve para yardımcıları: [`kutuphane/py/kutuphane/turkce.py`](../../kutuphane/py/kutuphane/turkce.py),
  [`kutuphane/py/kutuphane/para.py`](../../kutuphane/py/kutuphane/para.py)
