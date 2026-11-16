---
baslik: Rastgelelik ve benzetim
ozet: Tohum ve yeniden üretilebilirlik tuzakları, ters dönüşümle örnekleme, sapmalı karıştırma ve mod sapması, rezervuar örneklemesi, Monte Carlo ile π ve integral, hata payı ve örnek sayısı, kriptografik rastgelelik.
etiketler: [rastgelelik, benzetim, monte-carlo, ornekleme, tohum, kriptografik-rastgelelik]
duzey: orta
guncellik: 2026-11
---

# Rastgelelik ve benzetim

> Bu notu ne zaman okumalı: rastgele sayı, karıştırma, örnekleme ya da benzetim (Monte Carlo) içeren kod
> yazarken; "aynı tohumla neden farklı sonuç çıktı" diye sorarken; parola, belirteç, doğrulama kodu üretirken;
> bir benzetim sonucunun ne kadar güvenilir olduğunu söylemeniz gerektiğinde.

## Temel fikir

- Bilgisayarın `random`'ı **sözde rastgeledir** (pseudo-random): bir **tohumdan** (seed) belirlenimci olarak
  üretilir. Aynı tohum → aynı dizi. Bu, benzetimi ve testi yeniden üretilebilir kılar; ama diziyi tahmin
  edilebilir de kılar.
- Python `random` (Mersenne Twister) istatistik için iyidir, **güvenlik için değildir**: yeterince çıktısını gören
  biri iç durumunu çıkarıp sonrakileri tahmin edebilir. Parola, belirteç, sıfırlama kodu için `secrets` kullanılır.
- Her dağılımdan örnek, düzgün `U ~ [0, 1)` sayıdan üretilebilir: **ters dönüşüm**, `x = F⁻¹(U)`.
- **Monte Carlo**: bir büyüklüğü rastgele örneklerin ortalamasıyla kestirmek. Hata `σ/√N` hızında küçülür:
  bir hane daha doğruluk 100 kat örnek ister. Sonuç her zaman **hata payıyla** verilir.
- Rastgeleliği "elle" düzeltmeye çalışan kod (mod alma, kendi karıştırma döngüsü) çoğu zaman sessizce sapmalıdır.

## Karar tablosu

| İş                                                   | Kullanın                                              | Kullanmayın                                       |
| ---------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------- |
| Benzetim, test verisi, örnekleme (yeniden üretilebilir) | `random.Random(tohum)` örneği                      | Küresel `random.seed` + modül işlevleri           |
| Parola, belirteç, oturum kimliği, doğrulama kodu      | `secrets.token_urlsafe`, `secrets.randbelow`          | `random`, `time` ile tohumlanmış her şey          |
| Listeyi karıştırmak                                  | `rng.shuffle` (Fisher–Yates)                          | Kendi "her öğeyi rastgele yerle değiştir" döngünüz |
| `0..n−1` arası tam sayı                              | `rng.randrange(n)`, `secrets.randbelow(n)`            | `rastgele_bayt % n` (mod sapması)                 |
| Ağırlıklı seçim                                      | `rng.choices(..., weights=...)`                       | Elle yazılmış eşik zinciri                        |
| Boyu bilinmeyen akıştan k örnek                      | Rezervuar örneklemesi                                 | Hepsini belleğe alıp sonra seçmek                 |
| Düşük boyutlu düzgün integral                        | Sayısal integral ([kalkülüs](kalkulus-sezgisi.md))    | Monte Carlo (çok yavaş yakınsar)                  |
| Yüksek boyut, karmaşık sistem, kuyruk/olasılık sorusu | Monte Carlo + hata payı                              | Hata payısız tek sayı                             |

## Tohum ve yeniden üretilebilirlik

```python calistir
import random
import subprocess
import sys

a, b = random.Random(42), random.Random(42)
assert [a.random() for _ in range(3)] == [b.random() for _ in range(3)]  # aynı tohum, aynı dizi

# Paylaşılan durum tuzağı: araya giren tek bir çağrı bütün sonraki sayıları kaydırır
a, b = random.Random(42), random.Random(42)
b.random()  # ör. bir kütüphane küresel üreteçten bir sayı çekti
assert [a.random() for _ in range(3)] != [b.random() for _ in range(3)]

# Kümelerin sırası süreçten sürece değişir (metin karmaları rastgele tohumlanır)
code = "print(list({'elma', 'armut', 'kiraz', 'muz', 'incir'}))"
orders = {
    subprocess.run([sys.executable, "-c", code], env={"PYTHONHASHSEED": seed}, capture_output=True, text=True).stdout
    for seed in ("1", "2", "3")
}
assert len(orders) > 1  # aynı kod, farklı sıra → rng.choice(list(küme)) tohumla bile değişir
assert sorted({"elma", "armut", "kiraz"}) == ["armut", "elma", "kiraz"]  # çözüm: önce sırala
print("tamam")
```

Yeniden üretilebilirlik için: her bileşene kendi `Random(tohum)` örneğini verin (saat ve rastgelelik işlevlere
parametre olarak girsin), kümeden seçmeden önce sıralayın, paralel işçilere farklı tohum verin (`tohum + işçi_no`;
numpy'de `SeedSequence.spawn`). Python yalnız `random()` dizisinin sürümler arasında aynı kalmasını garanti eder;
`shuffle`, `choice`, `randrange` gibi yöntemlerin sonucu Python sürümü değişince değişebilir. Testte beklenen
değeri bu yöntemlerin ham çıktısına bağlamayın; özelliğini (`sorted(karışık) == asıl`) sınayın.

## Ters dönüşüm: düzgün sayıdan her dağılıma

```python calistir
import bisect
import math
import random

rng = random.Random(7)

# Sürekli: üstel dağılım. F(x) = 1 − e^(−λx)  →  x = −ln(1 − U) / λ
rate = 2.0
xs = sorted(-math.log(1 - rng.random()) / rate for _ in range(50_000))  # 1−U: log(0) olmasın
assert abs(sum(xs) / len(xs) - 1 / rate) < 0.01
# Örneklerin ampirik dağılımı teorik F'ye yakın mı (Kolmogorov–Smirnov uzaklığı)
ks = max(abs((i + 1) / len(xs) - (1 - math.exp(-rate * x))) for i, x in enumerate(xs))
assert ks < 0.01

# Kesikli: birikimli olasılıklar + ikili arama
labels, weights = ["az", "orta", "çok"], [0.6, 0.3, 0.1]
cumulative = [sum(weights[: i + 1]) for i in range(len(weights))]
draws = [labels[bisect.bisect_right(cumulative, rng.random())] for _ in range(50_000)]
for label, w in zip(labels, weights):
    assert abs(draws.count(label) / len(draws) - w) < 0.01
# Hazırı: rng.choices(labels, weights=weights, k=…) aynı işi yapar
print("tamam")
```

## Elle yazılan rastgelelik sapar: karıştırma ve mod

```python calistir
from collections import Counter
from itertools import product


def outcomes(choice_ranges, n):
    """Her olası rastgele seçim yolunu dener; hangi dizilişin kaç yolla çıktığını sayar."""
    counts = Counter()
    for choices in product(*choice_ranges):
        items = list(range(n))
        for i, j in enumerate(choices):
            items[i], items[j] = items[j], items[i]
        counts[tuple(items)] += 1
    return counts


n = 3
naive = outcomes([range(n)] * n, n)  # YANLIŞ: her i'yi 0..n−1'den biriyle değiştir (27 yol, 6 diziliş)
fisher_yates = outcomes([range(i, n) for i in range(n)], n)  # DOĞRU: i'yi i..n−1'den biriyle (6 yol)
assert sorted(naive.values()) == [4, 4, 4, 5, 5, 5]  # bazı dizilişler daha olası
assert sorted(fisher_yates.values()) == [1] * 6  # hepsi eşit

# Mod sapması: 0–255 arası bayttan "% 10" ile hane üretmek
digit_counts = Counter(b % 10 for b in range(256))
assert digit_counts[0] == 26 and digit_counts[9] == 25  # 0–5 haneleri daha sık
# Çözüm: reddetme (250 ve üstünü at, yeniden çek); hazırı secrets.randbelow / randrange
fair = Counter(b % 10 for b in range(256) if b < 250)
assert set(fair.values()) == {25}
print("tamam")
```

Sapma küçük görünür (%4), ama çekiliş, kupon, A/B ataması gibi işlerde sistematik haksızlıktır ve testle
yakalanmaz; yalnız tam sayımla görülür. Hazır, doğru işlevleri kullanın.

## Akıştan örnekleme: rezervuar

Boyu bilinmeyen (ya da belleğe sığmayan) bir akıştan `k` öğeyi eşit olasılıkla seçmek:

```python calistir
import random


def reservoir(stream, k, rng):
    sample = []
    for i, item in enumerate(stream):
        if i < k:
            sample.append(item)
        else:
            j = rng.randrange(i + 1)  # 0..i
            if j < k:
                sample[j] = item  # i. öğe k/(i+1) olasılıkla girer
    return sample


rng = random.Random(3)
counts = [0] * 10
trials = 30_000
for _ in range(trials):
    for item in reservoir(range(10), 3, rng):
        counts[item] += 1
assert all(abs(c / trials - 0.3) < 0.015 for c in counts)  # her öğe 3/10 olasılıkla seçildi
print("tamam")
```

## Monte Carlo: π, integral ve hata payı

```python calistir
import math
import random

rng = random.Random(1)
N = 200_000

# π: birim karede rastgele noktaların çeyrek daire içine düşme oranı π/4
inside = sum(rng.random() ** 2 + rng.random() ** 2 <= 1 for _ in range(N))
p = inside / N
pi_hat, pi_se = 4 * p, 4 * math.sqrt(p * (1 - p) / N)
assert abs(pi_hat - math.pi) < 4 * pi_se
print(f"π ≈ {pi_hat:.4f} ± {1.96 * pi_se:.4f} (%95)")

# İntegral: e^(−x²)'nin 0–1 arası integrali = örneklerin ortalaması
values = [math.exp(-(rng.random() ** 2)) for _ in range(N)]
mean = sum(values) / N
sd = math.sqrt(sum((v - mean) ** 2 for v in values) / (N - 1))
exact = math.sqrt(math.pi) / 2 * math.erf(1)
assert abs(mean - exact) < 4 * sd / math.sqrt(N)

# Gerekli örnek sayısı: hata payı E (%95) için N ≈ (1,96·σ/E)²
need_integral = (1.96 * sd / 0.0005) ** 2
need_pi = (1.96 * 4 * math.sqrt(p * (1 - p)) / 0.0005) ** 2
assert 5e5 < need_integral < 8e5  # 3 hane için ~600 bin örnek
assert need_pi > 3e7  # π'yi 3 haneye ~40 milyon nokta
```

Monte Carlo'nun hatası boyuttan bağımsızdır; bu yüzden çok boyutlu sorularda (risk, kuyruk, karmaşık sistem)
vazgeçilmezdir ama tek boyutlu integralde Simpson'ın yanında çok yavaştır. İki politikayı karşılaştırırken
**aynı rastgele sayıları** (aynı tohum ve sıra) kullanmak farkın gürültüsünü azaltır.

## Kriptografik rastgelelik

```python calistir
import random
import secrets

token = secrets.token_urlsafe(32)  # 32 bayt = 256 bit rastgelelik
assert len(token) == 43 and all(c.isalnum() or c in "-_" for c in token)
code = f"{secrets.randbelow(10**6):06d}"  # 6 haneli doğrulama kodu, sapmasız
assert len(code) == 6 and code.isdigit()

# YANLIŞ: zaman tohumlu random ile kod. Tohumun aralığını bilen, kodu deneme ile bulur
issued_at = 1_763_300_000 + 51_234  # kodun üretildiği saniye (saldırgan yalnız günü biliyor)
leaked = random.Random(issued_at).randrange(10**6)  # kullanıcıya giden kod
day_start = 1_763_300_000
guess = next(s for s in range(day_start, day_start + 86_400) if random.Random(s).randrange(10**6) == leaked)
assert random.Random(guess).randrange(10**6) == leaked  # bir günlük saniyeler bir saniyede taranır
print("tamam")
```

Kural: güvenlikle ilgili her rastgele değer `secrets` (ya da işletim sisteminin kaynağı) ile üretilir; tohum
verilmez, yeniden üretilebilir olması istenmez. Doğrulama kodunun kaba kuvvete dayanması ayrıca deneme sınırı
ister (6 hane = 1 milyon olasılık).

## Tuzaklar

| Belirti                                                       | Neden                                                         | Çözüm                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| Aynı tohumla farklı sonuç                                     | Küresel üreteci başka kod da kullanıyor; küme sırası; sürüm   | Kendi `Random(tohum)` örneği; kümeyi sıralayın                 |
| Python sürümü yükselince testler kırıldı                      | `shuffle`/`choice` algoritması değişebilir                    | Ham çıktıyı değil özelliği sınayın                             |
| Paralel işçilerin hepsi aynı "rastgele" sonucu üretiyor       | Süreçler aynı durumu kopyaladı (fork) ya da aynı tohum        | İşçi başına farklı tohum; `SeedSequence.spawn`                 |
| Çekilişte bazı kişiler daha sık çıkıyor                       | Elle karıştırma ya da `% n` sapması                           | `shuffle`, `randrange`, `secrets.randbelow`                    |
| Sıfırlama kodu/belirteç tahmin edildi                         | `random` ya da zaman tohumu                                   | `secrets`; deneme sınırı                                       |
| `math.log(0)` hatası seyrek olarak çıkıyor                    | `random()` 0 döndürebilir                                     | `1 − random()` kullanın                                        |
| Benzetim sonucu her çalıştırmada farklı, hangisi doğru belli değil | Hata payı hesaplanmamış                                  | `± 1,96·σ/√N` raporlayın; N'i hedef hataya göre seçin          |
| Monte Carlo ile 1 boyutlu integral çok yavaş                  | `1/√N` yakınsama                                              | Yamuk/Simpson                                                  |

## Denetim listesi

- [ ] Rastgelelik kullanan her işlev bir `rng` (ya da tohum) parametresi alıyor; küresel üreteç yok.
- [ ] Güvenlik değerleri `secrets` ile; kodda `random` + parola/belirteç/kod birlikte geçmiyor.
- [ ] Karıştırma, aralıkta sayı, ağırlıklı seçim hazır işlevlerle; `% n` ile aralık üretimi yok.
- [ ] Kümelerden seçim öncesi sıralama var; paralel işlerde işçi başına tohum.
- [ ] Benzetim sonuçları hata payıyla raporlanmış; örnek sayısı `(1,96·σ/E)²` ile seçilmiş.
- [ ] Benzetim, bilinen bir tam sonuçla (küçük durumda) karşılaştırılmış.
- [ ] Testler rastgele çıktının ham değerine değil özelliğine (dağılım, değişmez) bakıyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Rastgelelik gereken her işleve `rng: random.Random` parametresi ekle; testte `Random(0)` ver.
  Güvenlikle ilgili değerleri yalnız `secrets` ile üret. Benzetim sonucunu `ortalama ± 1,96·σ/√N` olarak yaz."
- **Modelin tipik hatası:** `random.seed(time.time())` yazar; doğrulama kodunu `random.randint` ile üretir; kendi
  karıştırmasını yazar; `int.from_bytes(os.urandom(1)) % 10` gibi sapmalı aralık kurar; benzetim sonucunu tek
  sayı olarak verir.
- **Çıktıda denetleyin:** `random.seed(`, `random.randint(` (güvenlik bağlamında), `% ` ile aralık, `set(` sonrası
  `choice`; benzetimde hata payı satırı.
- **Kanıt isteyin:** küçük durumda bütün olasılıkları sayan bir test (karıştırma için 3 öğe, mod için 256 bayt)
  sapmayı kesin gösterir.

## İlgili

- [Olasılık temelleri](olasilik-temelleri.md): büyük sayılar yasası, hata ≈ σ/√n
- [Dağılımlar](dagilimlar.md): üretilecek dağılımlar ve parametre adı tuzakları
- [İstatistiksel kestirim](istatistiksel-kestirim.md): önyükleme (yeniden örnekleme)
- [Kombinatorik](kombinatorik.md): rastgele kimliklerde çakışma
- [Kriptografi kullanımı](../50-guvenlik/kriptografi-kullanimi.md): `random` ile `secrets` farkı, doğru ilkel seçimi
- Kriptografik rastgele belirteç ve kimlik: [`kutuphane/py/kutuphane/kripto.py`](../../kutuphane/py/kutuphane/kripto.py),
  [`kutuphane/py/kutuphane/kimlik.py`](../../kutuphane/py/kutuphane/kimlik.py)
- Çalışan örnekleme algoritmaları: [`fisher_yates.py`](../../algoritma/algoritma/rastgele/fisher_yates.py),
  [`reservoir_sampling.py`](../../algoritma/algoritma/rastgele/reservoir_sampling.py) (ağırlıklı sürüm dahil),
  O(1) ağırlıklı seçim [`alias_method.py`](../../algoritma/algoritma/rastgele/alias_method.py)
