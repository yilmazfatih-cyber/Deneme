---
baslik: Lineer cebir sezgisi
ozet: Vektör, uzunluk, nokta çarpım ve kosinüs benzerliği; saf Python matris çarpımı, doğrusal dönüşüm, devrik, ters ve tekillik; Gauss eleme ile denklem sistemi (kesirlerle) ve neden pivot gerektiği.
etiketler: [lineer-cebir, vektor, matris, kosinus-benzerligi, denklem-sistemi]
duzey: temel
guncellik: 2026-11
---

# Lineer cebir sezgisi

> Bu notu ne zaman okumalı: gömme (embedding) vektörleriyle benzerlik ararken; matris çarpımı, boyut (shape)
> hatası ya da "tekil matris" hatası gördüğünüzde; birkaç bilinmeyenli bir denklem sistemini çözerken; bir
> modelin içindeki `x @ W + b` satırını anlamak istediğinizde.

## Temel fikir

- **Vektör** bir sayı listesidir; iki yorumu vardır: uzayda bir **nokta/yön** ya da bir nesnenin **özellikleri**
  (kelime sayıları, gömme). Uzunluğu (norm) `√(Σ xᵢ²)`.
- **Nokta çarpım** `a·b = Σ aᵢbᵢ = |a|·|b|·cos θ`. Uzunluklara bölünce **kosinüs benzerliği** kalır: yalnız yön
  karşılaştırılır, uzunluk (metnin boyu) değil.
- **Matris**, vektörü vektöre götüren doğrusal bir dönüşümdür. Sütunları, birim vektörlerin gittiği yerlerdir.
  Matris çarpımı dönüşümleri **art arda** uygulamaktır; sıra önemlidir: `A @ B` önce `B`'yi uygular.
- **Determinant** alanın/hacmin kaç katına çıktığıdır. Sıfırsa dönüşüm uzayı ezer (düzlemi doğruya), bilgi
  kaybolur ve **ters** yoktur: matris **tekildir** (singular).
- `Ax = b` çözmek, "hangi `x` dönüşümden sonra `b` olur" sorusudur. Ters alıp çarpılmaz; **eleme** ile çözülür.

## Karar tablosu

| Ne istiyorsunuz                                          | İşlem                                           | Neden                                                    |
| -------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------- |
| Metin/gömme benzerliği                                   | Kosinüs benzerliği (ya da birim vektörde nokta çarpım) | Uzunluktan bağımsız; boyu farklı metinler kıyaslanır |
| Fiziksel/özellik uzaklığı                                | Öklid (L2); aykırı değere dayanıklı: Manhattan (L1) | Ölçekler aynı olmalı: önce standartlaştırın            |
| `n` denklem, `n` bilinmeyen                              | Gauss eleme (kütüphanede `solve`)               | Ters matris yavaş ve daha az doğru                       |
| Denklem çok, bilinmeyen az (gürültülü ölçüm)             | En küçük kareler (`lstsq`, QR)                  | Tam çözüm yoktur; en yakını aranır                       |
| Dönüşümleri birleştirme (döndür, ölçekle, kaydır)        | Matris çarpımı; sıra = sağdan sola              | `A @ B ≠ B @ A`                                          |
| Tam sonuç gereken küçük sistem (para, oran)              | `Fraction` ile eleme                            | Yuvarlama hatası yok                                     |
| Büyük, seyrek sistem                                     | Yinelemeli yöntem (kütüphane)                   | Bkz. [sayısal yöntemler](sayisal-yontemler.md)           |

## Vektörler, kosinüs ve bir yuvarlama tuzağı

```python calistir
import math


def dot(a, b):
    if len(a) != len(b):
        raise ValueError("vektör boyları farklı")
    return sum(x * y for x, y in zip(a, b))


def norm(a):
    return math.sqrt(dot(a, a))


def cosine(a, b):
    return dot(a, b) / (norm(a) * norm(b))


def unit(v):
    length = norm(v)
    return [x / length for x in v]


# Kelime sayım vektörleri: [kedi, süt, banka, faiz]
doc, doc_twice, other = [2, 1, 0, 0], [4, 2, 0, 0], [0, 0, 3, 1]
assert math.isclose(cosine(doc, doc_twice), 1.0)  # aynı yön: uzunluk önemsiz
assert norm([a - b for a, b in zip(doc, doc_twice)]) > 2  # Öklid uzaklığı uzunluğa duyarlı
assert cosine(doc, other) == 0  # ortak kelime yok: dik vektörler

# Birim vektörlerde |a − b|² = 2 − 2·cos: Öklid ve kosinüs aynı sıralamayı verir
a, b = unit([1.0, 2.0, 3.0]), unit([2.0, 1.0, 0.5])
assert math.isclose(norm([x - y for x, y in zip(a, b)]) ** 2, 2 - 2 * dot(a, b))

# Yuvarlama kosinüsü 1'in üstüne itebilir; acos o zaman çöker
v = [1.0, 1.0, 1.0]
c = cosine(v, v)
assert c > 1.0  # 1.0000000000000002
try:
    math.acos(c)
    raise AssertionError("hata bekleniyordu")
except ValueError:
    pass
assert math.acos(max(-1.0, min(1.0, c))) == 0.0  # önce [-1, 1] aralığına sıkıştırın
print("tamam")
```

Vektör veritabanlarında gömmeler çoğu zaman birim uzunluğa getirilir; o zaman nokta çarpım = kosinüs ve
Öklid ile aynı sıralama çıkar. Ama **farklı modellerin** gömmeleri farklı uzaylardadır: biriyle kodlanmış
sorgu, ötekiyle kodlanmış belgelerle karşılaştırılamaz.

## Matris çarpımı ve doğrusal dönüşüm

```python calistir
def matmul(A, B):
    if len(A[0]) != len(B):
        raise ValueError(f"boyut uyuşmuyor: {len(A)}x{len(A[0])} @ {len(B)}x{len(B[0])}")
    return [[sum(a * b for a, b in zip(row, col)) for col in zip(*B)] for row in A]


def apply(M, v):
    return [row[0] for row in matmul(M, [[x] for x in v])]


def transpose(M):
    return [list(col) for col in zip(*M)]


R = [[0, -1], [1, 0]]  # 90° saat yönünün tersine döndür
S = [[2, 0], [0, 1]]  # x eksenini 2 kat ger

# Sütunlar, birim vektörlerin gittiği yerdir
assert apply(R, [1, 0]) == [0, 1] and apply(R, [0, 1]) == [-1, 0]

# Sıra önemli: R @ S önce S'yi, sonra R'yi uygular
assert apply(matmul(R, S), [1, 0]) == [0, 2]  # önce ger, sonra döndür
assert apply(matmul(S, R), [1, 0]) == [0, 1]  # önce döndür, sonra ger
assert matmul(R, S) != matmul(S, R)

# Devrik kuralı: (AB)ᵀ = BᵀAᵀ (sıra ters döner)
A, B = [[1, 2, 3], [4, 5, 6]], [[1, 0], [0, 1], [2, -1]]
assert transpose(matmul(A, B)) == matmul(transpose(B), transpose(A))


def det2(M):
    return M[0][0] * M[1][1] - M[0][1] * M[1][0]


assert det2(S) == 2 and det2(R) == 1  # alan 2 katına çıkar / döndürme alanı korur
P = [[1, 0], [0, 0]]  # izdüşüm: düzlemi x eksenine ezer
assert det2(P) == 0 and apply(P, [3, 5]) == apply(P, [3, -7])  # iki farklı nokta aynı yere: geri dönüş yok

try:
    matmul([[1, 2, 3]], [[1, 2, 3]])  # (1x3) @ (1x3): iç boyutlar uymuyor
    raise AssertionError("hata bekleniyordu")
except ValueError as error:
    assert "1x3 @ 1x3" in str(error)
print("tamam")
```

Boyut kuralı: `(m×n) @ (n×p) = (m×p)`; içteki iki sayı eşit olmalıdır. Sinir ağındaki `x @ W + b` satırı, her
örneği (`x`'in satırı) `W` ile yeni bir özellik uzayına taşır; `W`'nin şekli (giriş, çıkış)'tır.

## Denklem sistemi: Gauss eleme, kesirlerle

Üç fişten üç ürünün birim fiyatını bulalım: 2 çay + 1 simit + 1 su = 40 TL; 1 çay + 2 simit = 40 TL;
3 çay + 1 su = 35 TL.

```python calistir
from fractions import Fraction


def solve_exact(A, b):
    """Gauss-Jordan eleme; tam kesirle. Tek çözüm yoksa açık hata verir."""
    n = len(A)
    M = [[Fraction(v) for v in row] + [Fraction(rhs)] for row, rhs in zip(A, b)]
    for col in range(n):
        pivot = next((r for r in range(col, n) if M[r][col] != 0), None)
        if pivot is None:
            raise ValueError("tekil sistem: denklemlerden biri ötekilerden türetilmiş; tek çözüm yok")
        M[col], M[pivot] = M[pivot], M[col]
        for r in range(n):
            if r != col and M[r][col] != 0:
                factor = M[r][col] / M[col][col]
                M[r] = [x - factor * y for x, y in zip(M[r], M[col])]
    return [M[i][n] / M[i][i] for i in range(n)]


receipts = [[2, 1, 1], [1, 2, 0], [3, 0, 1]]  # [çay, simit, su] adetleri
totals = [40, 40, 35]
assert solve_exact(receipts, totals) == [10, 15, 5]

# Üçüncü fiş, ilk ikisinin toplamıysa yeni bilgi taşımaz: sistem tekildir
dependent = [[2, 1, 1], [1, 2, 0], [3, 3, 1]]
try:
    solve_exact(dependent, [40, 40, 80])
    raise AssertionError("hata bekleniyordu")
except ValueError as error:
    assert "tekil" in str(error)
print("tamam")
```

Tekillik, "elimdeki ölçümler bilinmeyenleri belirlemeye yetmiyor" demektir: denklem sayısı yetse bile biri
ötekilerin birleşimiyse bilgi eksiktir. Çözüm daha fazla denklem değil, **bağımsız** bir denklemdir.

## Kayan noktada pivotun önemi

Kesirde sıfır olmayan her pivot iş görür; kayan noktada **küçük** pivot felakettir. Kısmi pivotlama
(partial pivoting) her sütunda mutlak değerce en büyük öğeyi pivot seçer.

```python calistir
def solve_float(A, b, pivoting):
    n = len(A)
    M = [list(map(float, row)) + [float(rhs)] for row, rhs in zip(A, b)]
    for col in range(n):
        if pivoting:
            best = max(range(col, n), key=lambda r: abs(M[r][col]))
            M[col], M[best] = M[best], M[col]
        for r in range(col + 1, n):
            factor = M[r][col] / M[col][col]
            M[r] = [x - factor * y for x, y in zip(M[r], M[col])]
    x = [0.0] * n
    for r in reversed(range(n)):
        x[r] = (M[r][n] - sum(M[r][c] * x[c] for c in range(r + 1, n))) / M[r][r]
    return x


A = [[1e-20, 1.0], [1.0, 1.0]]  # gerçek çözüm ≈ (1, 1)
b = [1.0, 2.0]
assert solve_float(A, b, pivoting=False) == [0.0, 1.0]  # YANLIŞ: x₁ tamamen kayboldu
assert solve_float(A, b, pivoting=True) == [1.0, 1.0]  # DOĞRU
print("tamam")
```

Pivotsuz elemede `1e20` katsayısı ikinci satırdaki bilgiyi yuttu. Kütüphaneler (LAPACK tabanlı `solve`) pivot
kullanır; elle eleme yazarsanız siz de kullanın. Pivot da yetmiyorsa sistem **kötü koşulludur** (ill-conditioned):
girdideki küçük hata çözümde büyür ([sayısal yöntemler](sayisal-yontemler.md)).

## Tuzaklar

| Belirti                                                      | Neden                                                           | Çözüm                                                           |
| ------------------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------- |
| `ValueError: math domain error` (`acos`)                     | Kosinüs yuvarlamayla 1'i aştı                                   | `max(-1, min(1, c))` ile sıkıştırın                             |
| Uzun belgeler hep "daha benzer" çıkıyor                      | Ham nokta çarpım ya da Öklid; uzunluk baskın                    | Kosinüs ya da birim vektörler                                   |
| Benzerlik araması saçma sonuç veriyor                        | Sorgu ve belgeler farklı gömme modeliyle kodlanmış              | Hepsini aynı modelle, aynı ön işlemle kodlayın                  |
| Uzaklık tabanlı model bir özelliğe takılıyor                 | Özelliklerin ölçeği farklı (TL ile yaş)                         | Standartlaştırma; ya da kosinüs                                 |
| numpy'de sonuç boyutu beklenmedik `(3, 3)` oldu              | `(3,)` ile `(3, 1)` yayınlandı (broadcasting)                   | Şekilleri `assert x.shape == (…)` ile denetleyin                |
| numpy'de matris çarpımı yerine öğe öğe çarpım                | `A * B` öğe öğe, `A @ B` matris çarpımı                         | Matris çarpımında yalnız `@`                                    |
| Dönüşüm zinciri ters sırada uygulanmış                       | `A @ B` önce `B`'yi uygular                                     | Sırayı bir birim vektörle sınayın                               |
| Çözüm saçma büyük sayılar, ya da "singular matrix" hatası    | Tekil/neredeyse tekil sistem; bağımlı denklem                   | Bağımsız denklem ekleyin; koşul sayısına bakın                  |
| Ters matrisle çözülen sistem kütüphane `solve`'dan farklı    | Ters alma ek yuvarlama hatası getirir                           | `solve` (eleme) kullanın; tersi açıkça istenmedikçe hesaplamayın |
| Elle yazılmış eleme bazı girdilerde çöp sonuç veriyor        | Pivot yok ya da küçük pivot                                     | Kısmi pivotlama                                                 |

## Denetim listesi

- [ ] Her matris işleminden önce şekiller yazılı (yorumda ya da `assert`); iç boyutlar uyuyor.
- [ ] Benzerlik için kosinüs ya da birim vektör kullanılıyor; `acos` öncesi sıkıştırma var.
- [ ] Uzaklık kullanan yöntemde özellikler aynı ölçeğe getirilmiş.
- [ ] Bütün gömmeler aynı modelle ve aynı ön işlemle üretilmiş.
- [ ] Doğrusal sistem ters matrisle değil, eleme/`solve` ile çözülüyor; tekillik açık bir hatayla raporlanıyor.
- [ ] Elle yazılmış elemede kısmi pivotlama var; küçük bir örnek `Fraction` ile tam çözümle karşılaştırılmış.
- [ ] Dönüşüm sırası birim vektörle sınanmış.

## Küçük modele yaptırırken

- **İsteme yazın:** "Her matris işleminin yanına şekli yorum olarak yaz (`# (n, d) @ (d, k) -> (n, k)`). Ters
  matris hesaplama; denklem sistemini `solve` ile çöz. Kosinüs benzerliğinde sonucu `[-1, 1]`'e sıkıştır."
- **Modelin tipik hatası:** numpy'de `*` ile `@`'yi karıştırır; satır ve sütun vektörünü karıştırıp yanlış
  yayınlama üretir; `inv(A) @ b` yazar; farklı modellerin gömmelerini karşılaştırır.
- **Çıktıda denetleyin:** `inv(`, `* ` (matris değişkenleri arasında), şekil yorumu ya da `assert ...shape` var mı;
  benzerlik fonksiyonu birim vektörle sınanmış mı.
- **Test isteyin:** "bir vektörün kendisiyle kosinüsü 1", "dönüşüm birim vektörü beklenen yere götürüyor",
  "çözüm `A @ x ≈ b` sağlıyor" gibi değişmez (invariant) testler.

## İlgili

- [Özdeğer ve ayrışımlar](ozdeger-ve-ayrisimlar.md): özvektör, SVD, PCA
- [Sayısal yöntemler](sayisal-yontemler.md): koşul sayısı, yinelemeli çözüm, tolerans
- [Geri yayılım matematiği](geri-yayilim-matematigi.md): matris çarpımının türevi
- Otomatik türevli tensör ve `matmul` işlemi: [`ml-temel/ml_temel/autograd/ops_basic.py`](../../ml-temel/ml_temel/autograd/ops_basic.py)
- Doğrusal katman (`y = x @ W + b`): [`ml-temel/ml_temel/nn/layers.py`](../../ml-temel/ml_temel/nn/layers.py)
