---
baslik: Ayrık matematik
ozet: Doğruluk tablosu ve De Morgan, boş doğruluk, kümeler ve bağıntılar, döngü değişmezi olarak tümevarım, modüler aritmetik (Luhn ve IBAN mod 97 sağlaması), çizge temelleri ve bağımlılık sıralaması.
etiketler: [ayrik-matematik, mantik, moduler-aritmetik, saglama, cizge, kumeler]
duzey: temel
guncellik: 2026-11
---

# Ayrık matematik

> Bu notu ne zaman okumalı: karmaşık bir `if` koşulunu yeniden yazarken; "yaklaşık eşit" değerleri gruplarken;
> kart numarası, IBAN gibi sağlama haneli bir alanı doğrularken; gün, saat, karma kovası gibi "dönen" sayılarla
> hesap yaparken; görev/paket bağımlılıklarını sıralarken.

## Temel fikir

- **Önermeler mantığı**: `ve`, `veya`, `değil`, `ise`. Her koşul bir doğruluk tablosudur; iki koşulun eşdeğer
  olup olmadığı, bütün girdi birleşimleri denenerek **kesin** olarak bilinir (20 değişkene kadar ucuzdur).
- **Kümeler ve bağıntılar**: "aynı kullanıcı mı", "aynı grup mu" soruları bir bağıntıdır. Gruplama yapacaksanız
  bağıntı **geçişli** olmalıdır (a~b ve b~c ise a~c); "yaklaşık eşit" geçişli değildir.
- **Tümevarım**: başlangıçta doğru olan ve her adımda korunan şey sonda da doğrudur. Kodda karşılığı **döngü
  değişmezidir** (invariant); sınır (off-by-one) hatalarını bununla yakalarsınız.
- **Modüler aritmetik**: "bölümden kalan" ile dönen sayılar (saat, gün, kova numarası). Sağlama haneleri (Luhn,
  IBAN) yazım hatalarını bununla yakalar. Eksi sayıda diller farklı davranır.
- **Çizge** (graph): düğümler ve kenarlar. Bağımlılıklar yönlü çizgedir; kurulum sırası **topolojik sıradır**;
  döngü varsa sıra yoktur.

## Karar tablosu

| İş                                                     | Araç                                       | Dikkat                                                 |
| ------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------ |
| Koşulu sadeleştirmek/yeniden yazmak                    | Doğruluk tablosuyla eşdeğerlik testi       | `not (a and b)` = `not a or not b` (De Morgan)         |
| "Hepsi geçti mi?" denetimi                             | `all(...)` + **boş değil** denetimi        | `all([])` doğrudur                                     |
| Yinelenenleri bulmak, iki listeyi karşılaştırmak       | Küme işlemleri                             | Kümeye girecek anahtar önce normalleştirilir           |
| Normalleştirilmiş anahtarı benzersiz kimlik yapmak     | Birebirlik (injectivity) denetimi          | Farklı kayıtlar aynı anahtara düşebilir                |
| Yaklaşık eşit değerleri gruplamak                      | Sabit kovalara yuvarlama ya da kümeleme    | `isclose` geçişli değil; sıraya bağlı gruplar çıkar     |
| Gün/saat/hafta hesabı, dairesel indeks                 | `%` (Python) ya da `((a % m) + m) % m`     | JavaScript/C'de eksi kalan eksi çıkar                  |
| Yazım hatası yakalayan kimlik/numara                   | Luhn (kart), mod 97 (IBAN), ülke algoritması | Sağlama "geçerli biçim" der, "var olan hesap" demez  |
| Görev/paket/geçiş sırası                               | Topolojik sıralama (Kahn)                  | Döngüyü açık bir hatayla bildirin                      |
| Ağırlıksız en kısa yol (en az adım)                    | Genişlik öncelikli arama (BFS)             | Ağırlıklı ise Dijkstra                                 |

## Mantık: doğruluk tablosu ve eşdeğerlik

```python calistir
from itertools import product


def table(expr, names):
    return [(values, expr(**dict(zip(names, values)))) for values in product([False, True], repeat=len(names))]


def counterexample(f, g, names):
    """İki koşulun ayrıldığı ilk girdi; eşdeğerlerse None."""
    for values, result in table(f, names):
        if result != g(**dict(zip(names, values))):
            return dict(zip(names, values))
    return None


def implies(p, q):
    return (not p) or q  # "p ise q": yalnız p doğru, q yanlışken yanlış


for (p, q), result in table(implies, ["p", "q"]):
    print(f"p={p!s:5}  q={q!s:5}  p→q={result}")

# De Morgan: doğru ve yanlış yeniden yazım
assert counterexample(lambda a, b: not (a and b), lambda a, b: (not a) or (not b), ["a", "b"]) is None
wrong = counterexample(lambda a, b: not (a and b), lambda a, b: (not a) and (not b), ["a", "b"])
assert wrong == {"a": False, "b": True}  # yanlış yeniden yazımı ayıran girdi

# Boş doğruluk: hiç öğe yoksa "hepsi" doğrudur
assert all([]) is True and any([]) is False
test_results = []  # hiç test koşmadı
assert all(test_results)  # "bütün testler geçti" — YANILTICI
assert not (test_results and all(test_results))  # doğrusu: boş değil VE hepsi geçti
```

```cikti
p=False  q=False  p→q=True
p=False  q=True   p→q=True
p=True   q=False  p→q=False
p=True   q=True   p→q=True
```

Bir koşulu yeniden yazdırdıysanız `counterexample` ile eski ve yeni hâli karşılaştırın; 20 değişkene kadar
bütün birleşimler (~1 milyon) saniyeler içinde denenir. Bu, "bence aynı" yerine kanıttır.

## Kümeler ve bağıntılar: birebirlik ve geçişlilik

```python calistir
import math
from collections import Counter

FOLD = str.maketrans({"ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u"})


def username_key(name):
    return name.replace("İ", "i").replace("I", "ı").lower().translate(FOLD)


users = ["Ayşe", "ayse", "Mehmet", "AYŞE", "Işık", "isik"]
keys = Counter(username_key(u) for u in users)
collisions = {k: n for k, n in keys.items() if n > 1}
assert collisions == {"ayse": 3, "isik": 2}  # anahtar işlevi birebir değil: kayıtlar çakışıyor

# Küme işlemleri
newsletter, buyers = {"ali", "ayse", "can"}, {"ayse", "deniz"}
assert newsletter & buyers == {"ayse"}  # ikisinde de
assert newsletter ^ buyers == {"ali", "can", "deniz"}  # yalnız birinde
assert len({frozenset(s) for s in [(), ("a",), ("b",), ("a", "b")]}) == 2**2  # n öğenin 2^n alt kümesi

# "Yaklaşık eşit" geçişli değildir: gruplama sıraya bağlı olur
a, b, c = 1.0, 1.0 + 0.9e-9, 1.0 + 1.8e-9
assert math.isclose(a, b) and math.isclose(b, c) and not math.isclose(a, c)
print("tamam")
```

Normalleştirilmiş anahtarı (küçük harf, aksansız e-posta ya da kullanıcı adı) benzersiz kısıt yapacaksanız
önce çakışmaları sayın; çakışma varsa kural yazın (ilk gelen alır, kullanıcıya sorulur…). Yaklaşık değerleri
gruplamak için sabit kovalara yuvarlayın (`round(x, 6)`) ve kova sınırında ayrılmayı kabul edin; ya da gerçek
bir kümeleme yöntemi kullanın.

## Tümevarım sezgisi: döngü değişmezi

"Başlangıçta doğru ve her adım koruyor ise sonda da doğru." İkili aramadaki değişmez: `lo`'dan öncekiler
hedeften küçük, `hi` ve sonrası hedeften küçük değil. Döngü bitince `lo == hi` ve yanıt odur.

```python calistir
from itertools import product


def lower_bound(items, target):
    """target'tan küçük olmayan ilk konum (sıralı listede)."""
    lo, hi = 0, len(items)
    while lo < hi:
        # Değişmez: items[:lo] < target <= items[hi:]
        assert all(x < target for x in items[:lo]) and all(x >= target for x in items[hi:])
        mid = (lo + hi) // 2
        if items[mid] < target:
            lo = mid + 1
        else:
            hi = mid
    return lo


# Küçük durumların TAMAMI: uzunluk 0–6, değerler 0–3, her hedef
for n in range(7):
    for items in product(range(4), repeat=n):
        items = sorted(items)
        for target in range(-1, 5):
            assert lower_bound(items, target) == sum(x < target for x in items)

assert sum(range(1, 2 * 1000, 2)) == 1000**2  # ilk n tek sayının toplamı n² (tümevarımla kanıtlanır)
print("tamam")
```

İki teknik birlikte güçlüdür: değişmezi `assert` olarak yazmak ve **küçük girdilerin hepsini** denemek. Sınır
hatası çoğu zaman boş liste, tek öğe ya da "hepsi eşit" durumunda çıkar; bunlar tam taramada kendiliğinden gelir.

## Modüler aritmetik: dönen sayılar

```python calistir
from datetime import date, timedelta

# Python'da kalan, bölenin işaretini alır; JavaScript/C'de bölünenin
assert -7 % 3 == 2 and -7 // 3 == -3  # Python: taban bölme
js_style = -7 - 3 * int(-7 / 3)  # JavaScript/C davranışı (sıfıra doğru bölme)
assert js_style == -1
assert ((-7 % 3) + 3) % 3 == 2  # her dilde aynı sonucu veren kalıp

# Gün hesabı: 16 Kasım 2026 pazartesi (0). 100 gün sonra? 3 gün önce?
today = date(2026, 11, 16)
assert today.weekday() == 0
assert (today + timedelta(days=100)).weekday() == (0 + 100) % 7 == 2  # çarşamba
assert (today - timedelta(days=3)).weekday() == (0 - 3) % 7 == 4  # cuma (JavaScript'te -3 çıkardı)

# Hızlı üs alma ve modüler ters (kriptografinin, karmanın temeli)
assert pow(3, 200, 1000) == 1  # 3^200'ün son üç hanesi, sayıyı hiç kurmadan
inverse = pow(7, -1, 26)  # 7·x ≡ 1 (mod 26)
assert (7 * inverse) % 26 == 1 and inverse == 15

# Kovaya dağıtma: anahtar → karma % kova sayısı. Kova sayısı değişirse çoğu anahtar yer değiştirir
keys = range(10_000)
moved = sum(k % 10 != k % 11 for k in keys)
assert moved / len(keys) > 0.85  # 10 → 11 sunucu: anahtarların ~%91'i taşınır
print("tamam")
```

Son satırın pratik sonucu: önbellek/parçalama (sharding) düzeninde `karma % N` kullanırsanız sunucu eklemek
neredeyse bütün veriyi yerinden oynatır; bu yüzden tutarlı karma (consistent hashing) kullanılır
([veritabanı ölçekleme](../40-sistem-tasarimi/veritabani-olcekleme.md); çalışan kod:
[`consistent_hashing.py`](../../algoritma/algoritma/rastgele/consistent_hashing.py)).

## Sağlama haneleri: Luhn ve mod 97

```python calistir
def luhn_ok(digits: str) -> bool:
    """Kart numarası sağlaması: sağdan her ikinci hane ikiyle çarpılır, 9'dan büyükse 9 çıkarılır."""
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2 == 1:
            d = d * 2 - 9 if d * 2 > 9 else d * 2
        total += d
    return total % 10 == 0


def luhn_check_digit(payload: str) -> str:
    return next(c for c in "0123456789" if luhn_ok(payload + c))


number = "79927398713"  # algoritmanın klasik örneği
assert luhn_ok(number) and luhn_check_digit(number[:-1]) == "3"

# Tek hane hatalarının hepsini yakalar
for i in range(len(number)):
    for c in "0123456789":
        if c != number[i]:
            assert not luhn_ok(number[:i] + c + number[i + 1 :])

# Yan yana iki hanenin yer değiştirmesini yakalar; tek istisna 09 ↔ 90
missed = set()
for a in "0123456789":
    for b in "0123456789":
        if a != b:
            payload = "4" * 6 + a + b + "4" * 6
            full = payload + luhn_check_digit(payload)
            swapped = full[:6] + b + a + full[8:]
            if luhn_ok(swapped):
                missed.add(a + b)
assert missed == {"09", "90"}
print("tamam")
```

```python calistir
def mod97(text: str) -> int:
    """Harfler sayıya (A=10 … Z=35) çevrilir; büyük sayıyı kurmadan hane hane kalan alınır."""
    remainder = 0
    for ch in text:
        for digit in str(ord(ch) - 55) if ch.isalpha() else ch:
            remainder = (remainder * 10 + int(digit)) % 97
    return remainder


def iban_ok(iban: str) -> bool:
    iban = iban.replace(" ", "").upper()
    return mod97(iban[4:] + iban[:4]) == 1


def make_iban(country: str, bban: str) -> str:
    return f"{country}{98 - mod97(bban + country + '00'):02d}{bban}"


assert iban_ok("GB82 WEST 1234 5698 7654 32")  # belgelerde kullanılan örnek IBAN
iban = make_iban("TR", "0001200000000000123456")  # uydurma banka hesabı; sağlama haneleri hesaplandı
assert iban_ok(iban) and len(iban) == 26

body = iban[4:]
for i, ch in enumerate(body):  # tek hane hatası: hepsi yakalanır
    for c in "0123456789":
        if c != ch:
            assert not iban_ok(iban[:4] + body[:i] + c + body[i + 1 :])
for i in range(len(body) - 1):  # yan yana yer değiştirme: hepsi yakalanır
    if body[i] != body[i + 1]:
        swapped = body[:i] + body[i + 1] + body[i] + body[i + 2 :]
        assert not iban_ok(iban[:4] + swapped)
print("tamam")
```

Sağlama yalnız **yazım hatasını** yakalar: geçerli sağlamalı bir numara uydurmak kolaydır, numaranın gerçek bir
hesaba ya da karta ait olduğunu göstermez. Güvenlik denetimi yerine kullanılmaz. Ülkeye özgü kimlik numaraları
(T.C. kimlik no, vergi no) kendi algoritmalarını kullanır; havuzdaki doğrulayıcıya bakın (aşağıda).

## Çizge temelleri: bağımlılık sırası ve en kısa yol

```python calistir
from collections import deque


def install_order(deps):
    """Kahn yöntemi: bağımlılığı kalmayanı al, onu bekleyenlerin sayacını azalt."""
    waiting = {pkg: len(needs) for pkg, needs in deps.items()}
    users = {pkg: [] for pkg in deps}
    for pkg, needs in deps.items():
        for need in needs:
            users[need].append(pkg)
    ready = deque(sorted(p for p, n in waiting.items() if n == 0))
    order = []
    while ready:
        pkg = ready.popleft()
        order.append(pkg)
        for user in users[pkg]:
            waiting[user] -= 1
            if waiting[user] == 0:
                ready.append(user)
    if len(order) != len(deps):
        stuck = sorted(p for p, n in waiting.items() if n > 0)
        raise ValueError(f"döngüsel bağımlılık: {stuck}")
    return order


deps = {"uygulama": ["web", "api"], "web": ["ortak"], "api": ["ortak", "veritabani"], "ortak": [], "veritabani": []}
order = install_order(deps)
assert all(order.index(need) < order.index(pkg) for pkg, needs in deps.items() for need in needs)
deps["ortak"] = ["uygulama"]  # döngü: ortak → uygulama → web → ortak
try:
    install_order(deps)
    raise AssertionError("hata bekleniyordu")
except ValueError as error:
    assert "döngüsel" in str(error)

# Yönsüz çizge: el sıkışma kuralı ve BFS ile en az adımlı yol
edges = [("A", "B"), ("B", "C"), ("C", "D"), ("A", "E"), ("E", "D")]
graph = {}
for u, v in edges:
    graph.setdefault(u, []).append(v)
    graph.setdefault(v, []).append(u)
assert sum(len(n) for n in graph.values()) == 2 * len(edges)  # derecelerin toplamı = 2 × kenar


def shortest_hops(start, goal):
    previous, queue = {start: None}, deque([start])
    while queue:
        node = queue.popleft()
        if node == goal:
            path = []
            while node is not None:
                path.append(node)
                node = previous[node]
            return path[::-1]
        for nxt in graph[node]:
            if nxt not in previous:
                previous[nxt] = node
                queue.append(nxt)
    return None


assert shortest_hops("A", "D") == ["A", "E", "D"]
print("tamam")
```

Ağaç, döngüsüz bağlı çizgedir: `n` düğümde tam `n − 1` kenar vardır. Bir veri yapısının (kategori ağacı, yorum
zinciri) gerçekten ağaç olduğunu bu sayıyla ve döngü denetimiyle sınayabilirsiniz.

## Tuzaklar

| Belirti                                                         | Neden                                                       | Çözüm                                                        |
| --------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------ |
| Yeniden yazılan koşul bazı durumlarda ters çalışıyor            | De Morgan yanlış uygulanmış (`and` → `and`)                 | Eski ve yeni koşulu doğruluk tablosuyla karşılaştırın        |
| CI "bütün testler geçti" diyor, hiç test koşmamış                | `all([])` doğru (boş doğruluk)                              | "En az bir sonuç var" denetimini ekleyin                     |
| Benzersiz kısıt farklı kişileri reddediyor                      | Normalleştirme birebir değil (Ayşe = ayse = AYŞE)           | Çakışmaları önceden sayın; kural yazın                        |
| Aynı veriyle gruplama her seferinde farklı                      | "Yaklaşık eşit" geçişli değil; sıraya bağlı                 | Sabit kovalar ya da açık kümeleme                            |
| Gün/hafta hesabı eksi sayıda yanlış                             | JavaScript/C'de `%` eksi kalan döndürür                     | `((a % m) + m) % m`                                          |
| Sunucu eklenince önbellek bütünüyle boşaldı                     | `karma % N` düzeni; N değişince anahtarların çoğu taşındı   | Tutarlı karma                                                |
| Geçerli görünen kart/IBAN numarası işlemde reddedildi           | Sağlama yalnız biçimi doğrular                              | Sağlamayı ön denetim sayın; asıl doğrulama karşı sistemde    |
| Bağımlılık sıralaması sonsuz döngüde ya da eksik çıktı          | Döngüsel bağımlılık sessizce yutulmuş                       | Sıralanamayanları listeleyen açık hata                       |
| Derin çizgede özyinelemeli gezinti `RecursionError` verdi        | Python özyineleme sınırı                                    | Kuyruk/yığınla döngüsel gezinti                              |

## Denetim listesi

- [ ] Yeniden yazılan her mantık koşulu eski hâliyle doğruluk tablosu üzerinden karşılaştırılmış.
- [ ] "Hepsi" denetimlerinde boş girdi ayrıca ele alınmış.
- [ ] Normalleştirilmiş anahtarlar benzersizlik için kullanılmadan önce çakışmalar sayılmış.
- [ ] Eksi sayılarla kalan hesabı dilden bağımsız kalıpla yapılmış; JavaScript tarafı da sınanmış.
- [ ] Sağlama haneli alanlarda algoritma, bilinen geçerli ve geçersiz örneklerle test edilmiş.
- [ ] Bağımlılık sıralaması döngüyü açık bir hatayla bildiriyor; her öğe bağımlılıklarından sonra geliyor (test).
- [ ] Döngülerde değişmez `assert` ile yazılmış ve küçük girdilerin tamamı denenmiş.

## Küçük modele yaptırırken

- **İsteme yazın:** "Koşulu sadeleştirdikten sonra eski ve yeni hâli bütün girdi birleşimlerinde karşılaştıran
  bir test yaz. Kalan hesabında `((a % m) + m) % m` kullan. Bağımlılık sıralamasında döngüyü hata olarak bildir."
- **Modelin tipik hatası:** De Morgan'ı yarım uygular; `all()`'ın boş listede doğru döndüğünü unutur; JavaScript'te
  eksi kalanı düşünmez; Luhn'da çarpılacak haneleri soldan sayar; topolojik sıralamada döngüyü sessizce atlar.
- **Çıktıda denetleyin:** `all(` çağrılarının önünde boşluk denetimi; `%` işleminin işaretli girdilerle testi;
  sağlama testlerinde en az bir bilinen geçerli ve bir geçersiz örnek.
- **Kapsamlı test isteyin:** küçük girdi uzayının tamamını (`itertools.product`) deneyen testler, modelin sınır
  hatalarını kendiliğinden ortaya çıkarır.

## İlgili

- [Kombinatorik](kombinatorik.md): sayma, güvercin yuvası, çakışma
- [Sayılar ve kayan nokta](sayilar-ve-kayan-nokta.md): eksi kalan, taşma
- [Türkçe büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md): anahtar normalleştirme ve katlama
- Luhn, IBAN (mod 97), T.C. kimlik ve vergi numarası doğrulayıcıları:
  [`kutuphane/py/kutuphane/dogrulama.py`](../../kutuphane/py/kutuphane/dogrulama.py)
- Okunaklı kodlarda sağlama karakteri: [`kutuphane/py/kutuphane/kimlik.py`](../../kutuphane/py/kutuphane/kimlik.py)
- Hızlı üs alma ve modüler ters: [`algoritma/algoritma/sayilar/modular_arithmetic.py`](../../algoritma/algoritma/sayilar/modular_arithmetic.py);
  EBOB ve genişletilmiş Öklid: [`gcd.py`](../../algoritma/algoritma/sayilar/gcd.py)
