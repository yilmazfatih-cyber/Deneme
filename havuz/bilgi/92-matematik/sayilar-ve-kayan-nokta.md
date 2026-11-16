---
baslik: Sayılar ve kayan nokta
ozet: Tamsayı taşması, 0.1 + 0.2, karşılaştırma toleransı, toplama hatası (Kahan/Neumaier), para için kuruş ve Decimal, yuvarlama kipleri, NaN ve sonsuzluk; çalışan örneklerle.
etiketler: [kayan-nokta, sayisal-dogruluk, para, yuvarlama, decimal, tamsayi]
duzey: temel
guncellik: 2026-11
---

# Sayılar ve kayan nokta

> Bu notu ne zaman okumalı: para, oran, ölçüm ya da büyük sayı hesaplayan kod yazarken; ekranda
> `0.30000000000000004`, `-0,00` ya da `NaN` gördüğünüzde; "aynı olması gereken" iki toplam kuruş farkıyla
> tutmadığında.

## Temel fikir

- `float` (IEEE 754 çift duyarlık, 64 bit) sayıyı **ikili kesir** olarak tutar: 53 bitlik anlamlı kısım ≈ 15–17
  anlamlı ondalık hane. `0.1` gibi ondalık kesirlerin çoğu ikilide sonsuz tekrarlıdır; en yakın ikili sayıya
  yuvarlanır. Her işlemin sonucu da yeniden yuvarlanır.
- Hata **görelidir**: büyük sayının yanında küçük sayı kaybolur (`1e16 + 1 == 1e16`). Bu yüzden `==` yanılır,
  toplama sırası sonucu değiştirir.
- Tamsayı: Python `int` sınırsızdır. Ama veri Python'dan çıkınca sabit genişliğe girer: veritabanı sütunu
  (32/64 bit), JavaScript `number` (güvenli sınır 2^53 − 1), C/Java/Go tamsayıları. Taşma çoğu zaman **sessizdir**:
  sayı sarar, eksiye döner.
- Para kayan noktayla tutulmaz: **tam sayı kuruş** ya da metinden kurulmuş `Decimal`. Yuvarlama tek yerde, adı
  konmuş bir kiple yapılır.

## Karar tablosu

| Ne hesaplıyorsunuz                            | Ne kullanılır                                         | Neden                                                |
| --------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| Para, fiyat, vergi, bakiye                    | Tam sayı kuruş ya da `Decimal("12.50")`               | `float` 0,10 TL'yi tam tutamaz; kuruş farkı birikir  |
| Ölçüm, istatistik, makine öğrenmesi           | `float` (64 bit)                                      | Hızlı; ~1e-16 göreli hata yeter                      |
| Kesin oran, kesir (1/3), olasılık sayımı      | `fractions.Fraction`                                  | Tam sonuç; yavaştır, pay/payda büyüyebilir           |
| İki `float` eşit mi                           | `math.isclose(a, b, rel_tol=…, abs_tol=…)`            | `==` yuvarlama yüzünden yanılır                      |
| Çok sayıda `float` toplamı                    | `math.fsum`; başka dilde Neumaier toplamı             | `+=` döngüsü hata biriktirir                         |
| Kimlik, sayaç (JSON ile JavaScript'e gidecek) | Tamsayı; 2^53'ü aşabilecekse **metin** olarak taşıyın | JavaScript `number` 2^53 üstünü bozar                |
| Kullanıcıya gösterim                          | Yalnız biçimlendirme (`f"{x:.2f}"`)                    | Saklanan değer yuvarlanmaz; ekranda yuvarlanır       |

## 0.1 + 0.2 neden 0.3 değil

```python calistir
from decimal import Decimal

print(0.1 + 0.2)
print(Decimal(0.1))  # 0.1 yazınca bellekte duran gerçek değer
assert 0.1 + 0.2 != 0.3
assert (0.1).as_integer_ratio() == (3602879701896397, 2**55)  # ikili kesir
assert 2.0**53 + 1 == 2.0**53  # 2^53'ten sonra her tamsayı temsil edilemez
assert 1e16 + 1.0 == 1e16  # büyüğün yanında küçük kaybolur
```

```cikti
0.30000000000000004
0.1000000000000000055511151231257827021181583404541015625
```

## Karşılaştırma toleransı

`math.isclose` varsayılanı `rel_tol=1e-09, abs_tol=0.0`'dır. Göreli tolerans sıfırın yanında işe yaramaz;
mutlak tolerans büyük sayılarda anlamsızdır. İkisini birlikte, verinin ölçeğine göre seçin.

```python calistir
import math

assert 0.1 + 0.2 != 0.3 and math.isclose(0.1 + 0.2, 0.3)

# Sıfıra karşı göreli tolerans hiç sağlanmaz: |x - 0| <= rel_tol * |x| olamaz
assert not math.isclose(1e-12, 0.0)
assert math.isclose(1e-12, 0.0, abs_tol=1e-9)

# 1e9 ölçeğinde 1e-9'luk fark temsil bile edilemez; mutlak 1e-9 tolerans burada anlamsız
assert 1e9 + 1e-9 == 1e9
assert math.isclose(1e9, 1e9 + 0.5)  # 0,5 fark bu ölçekte göreli olarak "aynı"
print("tamam")
```

| Durum                                          | Başlangıç toleransı (göreli)                   |
| ---------------------------------------------- | ---------------------------------------------- |
| Birkaç işlemlik `float64` hesap                | `1e-12`                                        |
| Uzun hesap zinciri, yinelemeli yöntem          | `1e-9` – `1e-6`                                |
| `float32` (GPU, sinir ağı)                     | `1e-5` – `1e-3`                                |
| Sonlu farkla türev denetimi                    | `1e-6` – `1e-4` ([kalkülüs](kalkulus-sezgisi.md)) |
| Para                                           | Tolerans yok: tam sayı kuruş ve `==`           |

Sıfır ya da sıfıra yakın beklenen değerde ayrıca `abs_tol` verin. Tolerans bir tahmindir; testte geçmiyorsa önce
hesabın kendisinden şüphelenin, toleransı büyütmek son çaredir.

## Tamsayı taşması

Python'da görünmez, çünkü `int` büyür. Taşma veri dışarı çıkınca olur. Sabit genişlikli dillerin davranışını
taklit eden küçük bir işlevle görelim:

```python calistir
from datetime import datetime, timedelta, timezone


def to_int32(n: int) -> int:
    """C/Java/Go int32 aritmetiğinin yaptığı: 2^32'ye göre sarma."""
    return (n + 2**31) % 2**32 - 2**31


assert to_int32(2**31 - 1 + 1) == -(2**31)  # en büyük + 1 = en küçük negatif

# İkili aramada klasik hata: (lo + hi) / 2 taşar; lo + (hi - lo) / 2 taşmaz
lo, hi = 2_000_000_000, 2_100_000_000
assert to_int32(lo + hi) < 0
assert lo + (hi - lo) // 2 == 2_050_000_000

# 32 bitlik milisaniye sayacı ~24,9 günde dolar; 32 bitlik Unix saniyesi 2038'de
assert round((2**31 - 1) / 1000 / 86400, 1) == 24.9
epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
assert epoch + timedelta(seconds=2**31 - 1) == datetime(2038, 1, 19, 3, 14, 7, tzinfo=timezone.utc)

# JavaScript sayıları float'tır: 2^53 + 1 okunurken 2^53 olur (Python json tamsayıyı korur)
assert float(2**53 + 1) == 2**53
print("tamam")
```

Pratik kural: sayaç, kuruş toplamı ve milisaniye için 64 bit sütun; JSON'da 2^53'ü aşabilecek kimlik metin
olarak taşınır (JavaScript ayrıntısı: [JavaScript çalışma zamanı](../10-diller/javascript-calisma-zamani.md)).

## Toplama hatası: Kahan ve Neumaier

Çok sayıda küçük değer büyük bir toplama eklenince her biri yuvarlamada kaybolabilir. Telafili toplama
(compensated summation) kaybolan parçayı ayrı bir değişkende biriktirir.

```python calistir
import math


def naive_sum(xs):
    total = 0.0
    for x in xs:
        total += x
    return total


def kahan_sum(xs):
    total, lost = 0.0, 0.0  # lost: önceki adımda kaybolan küçük parça
    for x in xs:
        y = x - lost
        t = total + y
        lost = (t - total) - y  # cebirde 0; kayan noktada kaybolan kısım
        total = t
    return total


def neumaier_sum(xs):
    total, lost = 0.0, 0.0
    for x in xs:
        t = total + x
        if abs(total) >= abs(x):
            lost += (total - t) + x
        else:
            lost += (x - t) + total
        total = t
    return total + lost


small = [1.0] + [1e-16] * 100_000  # gerçek toplam ≈ 1.00000000001
assert naive_sum(small) == 1.0  # her 1e-16, 1.0'ın yanında kayboldu
assert math.isclose(kahan_sum(small), 1.00000000001, rel_tol=1e-14)
assert math.isclose(math.fsum(small), 1.00000000001, rel_tol=1e-15)

tricky = [1.0, 1e100, 1.0, -1e100]  # gerçek toplam 2
assert kahan_sum(tricky) == 0.0  # Kahan, terim toplamdan büyükken yanılır
assert neumaier_sum(tricky) == 2.0 and math.fsum(tricky) == 2.0
print("tamam")
```

- Python'da `math.fsum` tam doğru (doğru yuvarlanmış) sonuç verir; ilk tercih odur.
- Python 3.12'den beri yerleşik `sum()` da `float`'larda telafili toplama yapar; elle yazılmış `+=` döngüsü,
  `functools.reduce` ve JavaScript'te `reduce` yapmaz. Aynı veriyi iki dilde toplayan sistemlerde son hanede
  fark bundan çıkar.
- Neumaier, Kahan'ın düzeltilmiş hâlidir; başka dilde elle yazacaksanız onu yazın.

## Para: kuruş, Decimal ve yuvarlama kipleri

```python calistir
from decimal import ROUND_HALF_UP, Decimal

# YANLIŞ: float ile para
assert round(2.675, 2) == 2.67  # 2.675 bellekte 2.67499999… olduğu için aşağı gitti

# DOĞRU 1: Decimal METİNDEN kurulur; float'tan kurulursa hata da taşınır
assert Decimal("0.1") + Decimal("0.2") == Decimal("0.3")
assert Decimal(2.675).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) == Decimal("2.67")
assert Decimal("2.675").quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) == Decimal("2.68")

# DOĞRU 2: tam sayı kuruş; bölmede kalan açıkça dağıtılır, toplam korunur
total_kurus = 10_000  # 100,00 TL üç kişiye
share, remainder = divmod(total_kurus, 3)
shares = [share + (1 if i < remainder else 0) for i in range(3)]
assert shares == [3334, 3333, 3333] and sum(shares) == total_kurus
print("tamam")
```

Yuvarlama kipleri (`decimal` modülündeki adlarıyla):

| Kip                          | Ad              | 2,5 | 3,5 | −2,5 | Nerede                                                   |
| ---------------------------- | --------------- | --- | --- | ---- | -------------------------------------------------------- |
| Yarımı sıfırdan uzağa        | `ROUND_HALF_UP` | 3   | 4   | −3   | Okulda öğrenilen; fatura ve fişte yaygın beklenti        |
| Bankacı (yarımı çifte)       | `ROUND_HALF_EVEN` | 2 | 4   | −2   | Python `round()`, `Decimal` varsayılanı, IEEE varsayılanı |
| Sıfıra doğru (kesme)         | `ROUND_DOWN`    | 2   | 3   | −2   | `int(x)`                                                 |
| Eksi sonsuza doğru           | `ROUND_FLOOR`   | 2   | 3   | −3   | `math.floor`, `//`                                       |
| Artı sonsuza doğru           | `ROUND_CEILING` | 3   | 4   | −2   | `math.ceil`: "kaç kutu gerekir"                          |
| Sıfırdan uzağa (hep)         | `ROUND_UP`      | 3   | 4   | −3   | Nadiren                                                  |

Bankacı yuvarlaması neden var: çok sayıda yarım değer yuvarlanınca "hep yukarı" kuralı toplamı şişirir.

```python calistir
from decimal import ROUND_HALF_EVEN, ROUND_HALF_UP, Decimal

values = [Decimal(n) + Decimal("0.5") for n in range(100)]  # 0,5 1,5 … 99,5
one = Decimal("1")
assert sum(values) == 5000
assert sum(v.quantize(one, rounding=ROUND_HALF_UP) for v in values) == 5050  # sistematik sapma
assert sum(v.quantize(one, rounding=ROUND_HALF_EVEN) for v in values) == 5000  # sapma yok
print("tamam")
```

Hangi kipin kullanılacağı **iş kuralıdır**, programcı seçmez: fatura, vergi ve faiz hesabında muhasebenin ya da
karşı tarafın (banka, kamu sistemi) kuralını sorun ve kodda adıyla yazın. Bir ikinci iş kuralı: KDV ve indirim
**satır satır mı, toplamda mı** yuvarlanıyor. İkisi kuruş farkı verir ([finans matematiği](finans-matematigi.md)).

## NaN, sonsuzluk ve eksi sıfır

```python calistir
import json
import math

nan, inf = float("nan"), float("inf")
assert nan != nan and math.isnan(nan)  # NaN kendine bile eşit değil
assert math.isnan(inf - inf) and math.isnan(0 * inf)

# NaN sıralamayı ve en büyüğü bozar; sonuç verinin SIRASINA bağlı olur
assert max([1, nan, 2]) == 2 and math.isnan(max([nan, 1, 2]))
assert sorted([3, nan, 1, 2])[0] == 3  # sıralanmadı, sessizce

# Python json NaN yazar ama bu geçerli JSON değildir; JavaScript JSON.parse bunu reddeder
assert json.dumps(nan) == "NaN"
try:
    json.dumps(nan, allow_nan=False)
    raise AssertionError("hata bekleniyordu")
except ValueError:
    pass

# Eksi sıfır: küçük bir eksi değer yuvarlanınca ekranda "-0.00" görünür
assert f"{-0.001:.2f}" == "-0.00"
assert f"{-0.001:z.2f}" == "0.00"  # 'z' seçeneği (Python 3.11+) eksi sıfırı düzeltir
print("tamam")
```

Kural: veri **girişte** `math.isfinite` ile denetlenir; NaN içeri girerse ortalamayı, sıralamayı ve en büyüğü
sessizce bozar. Kütüphaneler farklı davranır: numpy `mean` NaN döndürür, pandas varsayılan olarak NaN'ı
atlar (`skipna=True`); ikisi aynı veride farklı sayı verir.

## Tuzaklar

| Belirti                                                   | Neden                                                     | Çözüm                                                              |
| --------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| Ekranda `0.30000000000000004`, `59.970000000000006`       | `float` ham basılmış                                      | Para kuruşta; gösterim yalnız biçimlendirmeyle                     |
| İki toplam kuruş farkıyla tutmuyor                        | Satır satır ve toplamda ayrı yuvarlama; ya da `float`     | Yuvarlama kuralını yazın, tek yardımcıda uygulayın; tamsayı kuruş  |
| `round(2.675, 2)` 2.67 veriyor                            | Değer bellekte 2.67499…; ayrıca `round` bankacı kipte     | `Decimal("2.675")` + açık kip (`ROUND_HALF_UP`)                     |
| `Decimal(0.1)` uzun kuyruklu çıkıyor                      | `Decimal` float'tan kurulmuş                              | Metinden kurun: `Decimal("0.1")`                                   |
| Test bazen geçiyor bazen kalıyor (`x == 0.3`)             | `float` eşitliği                                          | `math.isclose`; gerekçeli tolerans                                 |
| Sıfıra karşı `isclose` hep yanlış                         | Göreli tolerans sıfırda çalışmaz                          | `abs_tol` verin                                                    |
| Milyonlarca küçük değerin toplamı eksik                   | Büyük toplamın yanında küçük terimler kayboldu            | `math.fsum`; başka dilde Neumaier                                  |
| Kimlik numarasının son haneleri değişiyor                 | 2^53 üstü tamsayı JavaScript `number`'ına sığmaz          | Kimliği metin taşıyın                                              |
| Sayaç birden eksiye döndü                                 | 32 bit taşma                                              | 64 bit sütun; sınır değeriyle test                                 |
| Eksi sayının kalanı beklenmedik                           | Diller farklı: Python `-7 % 3 == 2`, JavaScript/C `-1`    | Dilden bağımsız: `((a % m) + m) % m`                               |
| Ekranda `-0,00`                                           | Küçük eksi değer sıfıra yuvarlandı, işaret kaldı          | `z` biçim seçeneği ya da `round(x, 2) + 0.0`; parada kuruş tamsayı |
| Ortalama `NaN`, ya da en büyük değer sıraya göre değişiyor | Veride NaN var                                            | Girişte `math.isfinite`; NaN'ı reddedin ya da açıkça ayıklayın     |
| Başka sistem JSON'u okuyamıyor                            | `json.dumps` NaN/Infinity yazdı                           | `allow_nan=False`; eksik değer `null`                              |
| Python'daki toplam ile JavaScript'teki son hanede farklı  | Python 3.12+ `sum()` telafili, JavaScript `reduce` değil  | Her iki tarafta telafili toplama; ortak test vektörü               |

## Denetim listesi

- [ ] Para alanlarında `float` yok: tam sayı kuruş ya da metinden kurulmuş `Decimal`.
- [ ] Yuvarlama kipi kodda adıyla yazılı ve tek bir yardımcıda; "satır mı toplam mı" kararı belgelenmiş.
- [ ] Bölüştürmede parçaların toplamı tutara eşit; bunu sınayan test var.
- [ ] `float` karşılaştırmaları `isclose` ile; sıfıra karşı `abs_tol` verilmiş; toleransın gerekçesi yorumda.
- [ ] Çok terimli toplamlar `math.fsum` (ya da başka dilde Neumaier) ile.
- [ ] 2^53'ü aşabilecek tamsayılar JSON'da metin; veritabanı sütunları en büyük değere yetiyor.
- [ ] Girdide NaN/sonsuz reddediliyor; JSON yazımında `allow_nan=False`.
- [ ] Ekranda `-0,00` çıkmıyor; Türkçe biçim (ondalık virgül) yalnız gösterimde, iç hesapta değil.
- [ ] Testlerde şu değerler var: `0.1 + 0.2`, `2.675`, `-2.5`, `100 / 3`, `2**53 + 1`, `NaN`, `-0.0`.

## Küçük modele yaptırırken

- **İsteme yazın:** "Parayı tam sayı kuruş olarak tut, `float` kullanma. Yuvarlama `ROUND_HALF_UP`, yalnız
  `para` yardımcısında. Bölüştürmede toplam korunmalı; bunu sınayan test yaz."
- **Modelin tipik hatası:** `float(fiyat) * 1.2` yazar; `round()`'un bankacı kipte olduğunu bilmez; `Decimal(0.1)`
  yazar; `float`'ları `==` ile karşılaştırır; `isclose`'u sıfıra karşı `abs_tol`'suz kullanır.
- **Çıktıda arayın:** para alanlarında `float(`; `round(`; tırnaksız `Decimal(` (`Decimal(0.`); `== 0.`;
  `json.dumps(` (NaN yazabilir mi?); JavaScript'te `parseFloat(` ve `reduce(`.
- **Test isteyin:** "100 TL'yi üçe böl → 33,34 + 33,33 + 33,33", "2,675 → 2,68", "-0,001 → 0,00",
  "`2**53 + 1` kimlik JSON'dan bozulmadan döner". Model bu testlerle kendi hatasını görür.

## İlgili

- [Kalkülüs sezgisi](kalkulus-sezgisi.md): sonlu farkta adım boyu ve yuvarlama hatası
- [Sayısal yöntemler](sayisal-yontemler.md): yıkıcı sadeleşme, koşul sayısı, durma ölçütü
- [Finans matematiği](finans-matematigi.md): taksit planında ve KDV'de kuruş yuvarlama
- [JavaScript çalışma zamanı](../10-diller/javascript-calisma-zamani.md): `number`, BigInt, `parseFloat` tuzakları
- Kuruş temelli para tipi, KDV, en büyük kalan yöntemiyle paylaştırma:
  [`kutuphane/py/kutuphane/para.py`](../../kutuphane/py/kutuphane/para.py) (TypeScript eşi
  [`para.ts`](../../kutuphane/ts/src/para.ts))
- Hassas toplam ve Welford varyansı: [`kutuphane/py/kutuphane/istatistik.py`](../../kutuphane/py/kutuphane/istatistik.py)
