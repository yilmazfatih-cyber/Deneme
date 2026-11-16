---
baslik: İstatistiksel kestirim
ozet: Kestirici, yanlılık ve varyans (MSE = yanlılık² + varyans), n−1 bölücüsü, en çok olabilirlik (madeni para), sıfır gözlemde 3'ler kuralı, örneklem dağılımı ve standart hata, önyükleme ile güven aralığı.
etiketler: [istatistik, kestirim, en-cok-olabilirlik, standart-hata, onyukleme, yanlilik-varyans]
duzey: orta
guncellik: 2026-11
---

# İstatistiksel kestirim

> Bu notu ne zaman okumalı: veriden bir oran, ortalama, ortanca ya da model parametresi hesaplayıp "bu sayı ne
> kadar güvenilir" diye sorduğunuzda; az veriyle (5 kullanıcı, 0 hata) karar vermeniz gerektiğinde; bir raporda
> standart sapma ile standart hatanın karıştırıldığından şüphelendiğinizde.

## Temel fikir

- Gerçek değeri (tüm kullanıcıların dönüşüm oranı) bilmeyiz; elimizde bir **örneklem** vardır. **Kestirici**
  (estimator), örneklemden bir tahmin üreten kuraldır: "satın alanlar / ziyaretçiler" gibi.
- Bir kestiricinin iki kusuru olabilir: **yanlılık** (bias, ortalamada hedefi ıskalamak) ve **varyans**
  (örneklemden örnekleme oynamak). Toplam hata: `MSE = yanlılık² + varyans`. Biraz yanlılık, varyansı çok
  azaltıyorsa iyi bir alışveriştir.
- Aynı kestirici başka bir örneklemde başka bir sayı verirdi. Bu sayıların dağılımı **örneklem dağılımıdır**;
  standart sapması **standart hatadır** (SE). Ortalama için `SE = σ/√n`: dört kat veri, yarı hata.
- **En çok olabilirlik** (maximum likelihood): gözlenen veriyi en olası kılan parametre. Çoğu sezgisel
  kestiricinin (oran = k/n, ortalama) arkasındaki ilke budur; az veride aşırı emin olur.
- **Önyükleme** (bootstrap): formülü olmayan ölçüler (ortanca, yüzdelik, oranların oranı) için örneklemi yerine
  koyarak yeniden çekip ölçüyü tekrar hesaplamak; dağılımın genişliği belirsizliği verir.

## Karar tablosu

| Ne kestiriyorsunuz                                 | Kestirici                          | Belirsizlik                                          |
| -------------------------------------------------- | ---------------------------------- | ---------------------------------------------------- |
| Ortalama                                           | Örneklem ortalaması                | `SE = s/√n`; çarpık veride önyükleme                 |
| Oran (dönüşüm, hata oranı)                         | `k/n`                              | `SE = √(p(1−p)/n)`; küçük `n` ya da uç `p`'de Wilson |
| Hiç gözlenmemiş olay (0 hata / n deneme)           | `0` değil: üst sınır verin         | 3'ler kuralı: %95 üst sınır ≈ `3/n`                  |
| Az veriyle oran (5 yorumda 5 yıldız)               | Yumuşatılmış `(k+1)/(n+2)`         | Önsel bilgiyle; sıralamada küçük `n`'i cezalandırır  |
| Varyans, standart sapma                            | `n−1` bölücülü                     | Küçük `n`'de standart sapma yine biraz düşük çıkar   |
| Ortanca, yüzdelik, oranların oranı, karmaşık ölçüt | Doğrudan hesap                     | Önyükleme yüzdelik aralığı                           |
| Model parametresi                                  | En çok olabilirlik (ya da önselli) | Kütüphanenin standart hatası ya da önyükleme         |
| İki grubun farkı (A/B)                             | Farkın kestirimi                   | [A/B testi](../70-veri/ab-testi.md)                  |

## n mi, n−1 mi

Örneklem varyansı ortalamadan sapmalarla hesaplanır; ama gerçek ortalama yerine örneklemin kendi ortalaması
kullanıldığı için sapmalar biraz küçük çıkar. `n−1`'e bölmek (Bessel düzeltmesi) bunu giderir.

```python calistir
import random
import statistics


def var_n(xs):
    m = sum(xs) / len(xs)
    return sum((x - m) ** 2 for x in xs) / len(xs)


def var_n1(xs):
    m = sum(xs) / len(xs)
    return sum((x - m) ** 2 for x in xs) / (len(xs) - 1)


rng = random.Random(0)
samples = [[rng.gauss(0, 1) for _ in range(5)] for _ in range(20_000)]  # gerçek varyans 1
assert abs(sum(map(var_n, samples)) / len(samples) - 0.8) < 0.03  # n'e bölmek: (n−1)/n = 0,8 kat düşük
assert abs(sum(map(var_n1, samples)) / len(samples) - 1.0) < 0.03  # n−1: yansız

# Kütüphanelerin varsayılanları farklıdır
xs = [2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0]
assert statistics.pvariance(xs) == 4.0  # "p" = anakütle, n'e böler
assert round(statistics.variance(xs), 4) == 4.5714  # örneklem, n−1'e böler
print("tamam")
```

Aynı veride numpy `std` varsayılan olarak `n`'e (`ddof=0`), pandas `std` ise `n−1`'e (`ddof=1`) böler. İki
araçtan gelen sayılar tutmuyorsa ilk bakılacak yer burasıdır.

## En çok olabilirlik: madeni para

10 atışta 7 yazı. Hangi `p` bu sonucu en olası kılar? Olabilirlik `L(p) = p^7·(1−p)^3`; en büyüğü `p = 7/10`.

```python calistir
import math


def log_likelihood(p, heads, tails):
    return heads * math.log(p) + tails * math.log(1 - p)  # çarpım yerine log toplamı


grid = [i / 1000 for i in range(1, 1000)]
assert max(grid, key=lambda p: log_likelihood(p, 7, 3)) == 0.7  # = k/n

# Neden log: 2 000 gözlemin olasılıklarının çarpımı float'ta sıfıra yuvarlanır
assert 0.5**2000 == 0.0 and 2000 * math.log(0.5) < -1386

# Az veride en çok olabilirlik aşırı emindir: 3 atışta 0 yazı → p = 0 ("asla yazı gelmez")
assert max(grid, key=lambda p: log_likelihood(p, 0, 3)) == 0.001  # ızgaranın en küçüğü: sıfıra dayandı
laplace = (0 + 1) / (3 + 2)  # her sonuçtan birer "sanal" gözlem: (k+1)/(n+2)
assert laplace == 0.2
print("tamam")
```

Yumuşatma (Laplace, "artı bir") bir **önsel** varsayımdır: "veri gelmeden önce her iki sonuç da mümkün". Az
yorumlu ürünleri sıralarken, nadir kelimelerin olasılığını kestirirken (Naive Bayes) ve sıfır olasılığın
`log`'unu almamak için kullanılır.

## Yanlılık–varyans ödünleşimi, tam hesapla

`n = 5` denemeden bir oran kestirelim. `k/n` yansızdır; `(k+1)/(n+2)` yanlıdır. Hangisi daha az hata yapar?

```python calistir
import math
from fractions import Fraction


def mse_parts(estimator, p, n=5):
    """Bütün olası k değerleri üzerinden tam yanlılık, varyans, MSE."""
    pmf = [math.comb(n, k) * p**k * (1 - p) ** (n - k) for k in range(n + 1)]
    mean = sum(q * estimator(k, n) for k, q in enumerate(pmf))
    var = sum(q * (estimator(k, n) - mean) ** 2 for k, q in enumerate(pmf))
    mse = sum(q * (estimator(k, n) - p) ** 2 for k, q in enumerate(pmf))
    assert mse == (mean - p) ** 2 + var  # MSE = yanlılık² + varyans (tam eşitlik)
    return mean - p, var, mse


def raw(k, n):
    return Fraction(k, n)


def smoothed(k, n):
    return Fraction(k + 1, n + 2)


bias_raw, var_raw, mse_raw = mse_parts(raw, Fraction(3, 10))
bias_s, var_s, mse_s = mse_parts(smoothed, Fraction(3, 10))
assert bias_raw == 0 and bias_s > 0  # yumuşatma yanlı...
assert var_s < var_raw and mse_s < mse_raw  # ...ama varyansı ve toplam hatası daha küçük
assert mse_parts(smoothed, Fraction(1, 10))[2] > mse_parts(raw, Fraction(1, 10))[2]  # uçta tersine döner
print(f"p=0,3: MSE ham {float(mse_raw):.4f} | yumuşatılmış {float(mse_s):.4f}")
```

Ders: "yansız" her zaman "daha iyi" değildir. Düzenlileştirme (regularization), erken durdurma, büzme
(shrinkage) hep aynı alışverişi yapar: biraz yanlılık karşılığında çok varyans azaltımı. Ama hangi yöne
büzdüğünüz önemlidir; gerçek değer uçtaysa yanlılık pahalıya patlar.

## Hiç gözlem yoksa: 3'ler kuralı

100 ödemede hiç hata görmediniz. Hata oranı 0 mı? Hayır: %95 güvenle hata oranı en çok ~%3'tür.

```python calistir
for n in (30, 100, 1000):
    exact = 1 - 0.05 ** (1 / n)  # (1 − p)^n = 0,05 eşitliğinden
    assert abs(exact - 3 / n) < 0.006 * (100 / n)  # yaklaşık 3/n
    print(f"{n} denemede 0 hata → %95 üst sınır: tam {exact:.4f}, 3/n = {3 / n:.4f}")
assert round(1 - 0.05 ** (1 / 100), 4) == 0.0295
```

```cikti
30 denemede 0 hata → %95 üst sınır: tam 0.0950, 3/n = 0.1000
100 denemede 0 hata → %95 üst sınır: tam 0.0295, 3/n = 0.0300
1000 denemede 0 hata → %95 üst sınır: tam 0.0030, 3/n = 0.0030
```

Ters yönde de çalışır: "hata oranının %0,1'in altında olduğunu %95 güvenle göstermek için hatasız ~3 000
deneme gerekir."

## Örneklem dağılımı ve standart hata

```python calistir
import math
import random
import statistics

rng = random.Random(1)
sigma, n = 2.0, 25
means = [statistics.fmean(rng.gauss(10, sigma) for _ in range(n)) for _ in range(5000)]
se_observed = statistics.stdev(means)
assert abs(se_observed - sigma / math.sqrt(n)) < 0.02  # SE = σ/√n = 0,4

# Oran: 400 ziyaretçide %10 dönüşüm → ±1,96·SE ≈ ±2,9 puan
p, visitors = 0.10, 400
se = math.sqrt(p * (1 - p) / visitors)
assert round(1.96 * se, 3) == 0.029
# Aynı belirsizliğin yarısı için dört kat ziyaretçi
assert math.isclose(math.sqrt(p * (1 - p) / (4 * visitors)), se / 2)


def wilson(k, n, z=1.96):
    """Oran için Wilson aralığı: küçük n'de ve uç oranlarda da anlamlı kalır."""
    p_hat = k / n
    denom = 1 + z * z / n
    center = (p_hat + z * z / (2 * n)) / denom
    half = z * math.sqrt(p_hat * (1 - p_hat) / n + z * z / (4 * n * n)) / denom
    return center - half, center + half


# 20 denemede 0 başarı: normal (Wald) aralık "kesin %0" der, Wilson %0–16 der
assert 1.96 * math.sqrt(0.0 * 1.0 / 20) == 0
low, high = wilson(0, 20)
assert abs(low) < 1e-12 and round(high, 3) == 0.161
print("tamam")
```

Standart sapma verinin yayılımıdır (kullanıcıların harcamaları ne kadar farklı); standart hata kestirimin
belirsizliğidir (ortalama harcamayı ne kadar iyi biliyoruz). Veri arttıkça birincisi değişmez, ikincisi küçülür.
Raporda hangisinin verildiği yazılmalıdır. Güven aralığının doğru yorumu, p değeri ve etki büyüklüğü:
[anlamlılık ve güven aralığı](../70-veri/anlamlilik-ve-guven-araligi.md).

## Önyükleme: formülü olmayan ölçünün aralığı

Ortancanın standart hatası için kolay formül yoktur. Örneklemi yerine koyarak yeniden çekip ortancayı binlerce
kez hesaplarız; bu ortancaların ortadaki %95'ini kapsayan aralık güven aralığıdır.

```python calistir
import math
import random
import statistics

rng = random.Random(2)


def bootstrap_ci(data, stat, reps=2000, level=0.95):
    values = sorted(stat(rng.choices(data, k=len(data))) for _ in range(reps))
    tail = (1 - level) / 2
    return values[int(tail * reps)], values[int((1 - tail) * reps) - 1]


small = [rng.lognormvariate(3, 1) for _ in range(200)]  # çarpık veri; gerçek ortanca e³ ≈ 20,1
low, high = bootstrap_ci(small, statistics.median)
assert low < statistics.median(small) < high
print(f"ortanca {statistics.median(small):.1f}, %95 aralık [{low:.1f}, {high:.1f}]")

large = [rng.lognormvariate(3, 1) for _ in range(800)]  # dört kat veri
low4, high4 = bootstrap_ci(large, statistics.median)
ratio = (high - low) / (high4 - low4)
assert 1.4 < ratio < 2.8  # aralık kabaca yarıya iner (√4 = 2)
assert low4 < math.exp(3) < high4
```

Önyükleme, satırlar **bağımsız** ise çalışır. Aynı müşterinin birçok satırı, zaman serisi, aynı oturumun
olayları varsa satırları değil **grupları** (müşteriyi, günü, bloğu) yeniden çekin; yoksa aralık olduğundan dar
çıkar. En büyük değer, çok uç yüzdelikler gibi ölçülerde önyükleme güvenilmezdir.

## Tuzaklar

| Belirti                                                             | Neden                                                       | Çözüm                                                                   |
| ------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| İki araç aynı veride farklı standart sapma veriyor                  | Biri `n`'e (numpy `ddof=0`), öteki `n−1`'e (pandas) bölüyor | Bölücüyü açıkça verin ve yazın                                          |
| Hata çubukları "çok dar"                                            | Standart sapma yerine standart hata çizilmiş (ya da tersi)  | Grafikte hangisi olduğu yazsın                                          |
| "5 yorumda 5 yıldız" ürün, 4,8 yıldızlı 2 000 yorumlu ürünün önünde | Az veride ham ortalama; varyans büyük                       | Yumuşatılmış ortalama ya da güven aralığının alt sınırıyla sıralama     |
| "Hiç hata görmedik, oran %0"                                        | Sıfır gözlem, sıfır olasılık değildir                       | 3'ler kuralıyla üst sınır                                               |
| Olabilirlik hesabı 0 ya da `-inf` veriyor                           | Olasılıklar çarpıldı (alt taşma) ya da `log(0)`             | Log-olabilirlik toplamı; olasılıkları kırpın                            |
| Önyükleme aralığı gerçek değişkenlikten çok dar                     | Satırlar bağımsız değil (aynı müşteri, aynı gün)            | Gruplu/bloklu önyükleme                                                 |
| Kalın kuyruklu veride ortalamanın aralığı tutmuyor                  | Varyans sonsuz ya da çok büyük                              | Ortanca, kırpılmış ortalama; log dönüşümü ([dağılımlar](dagilimlar.md)) |
| Yansız kestirici seçildi ama tahminler çok oynak                    | Varyans baskın                                              | Düzenlileştirme, yumuşatma, daha çok veri                               |

## Denetim listesi

- [ ] Her kestirimin yanında belirsizliği (SE ya da güven aralığı) ve `n` raporlanmış.
- [ ] Standart sapma ve standart hata ayrı adlarla yazılmış.
- [ ] Varyans bölücüsü (`n` ya da `n−1`) açık.
- [ ] Az veride ham oran yerine yumuşatılmış oran ya da aralık kullanılmış; sıfır gözlem için üst sınır verilmiş.
- [ ] Olabilirlik log cinsinden hesaplanmış.
- [ ] Önyüklemede örnekleme birimi (satır mı, müşteri mi, gün mü) verinin bağımlılığına uygun.
- [ ] Kalın kuyruklu ölçülerde ortanca ya da dönüşüm kullanılmış.

## Küçük modele yaptırırken

- **İsteme yazın:** "Her sayının yanına n ve %95 güven aralığını yaz. Ortalama için `s/√n`, oran için Wilson,
  ortanca ve karmaşık ölçüt için önyükleme (2 000 tekrar, tohumlu) kullan. Aynı müşterinin birden çok satırı
  varsa müşteri düzeyinde önyükle."
- **Modelin tipik hatası:** standart sapmayı standart hata diye verir; numpy ile pandas'ın bölücü farkını
  bilmez; sıfır gözleme "%0" der; çarpımla olabilirlik hesaplar; bağımlı satırlarda düz önyükleme yapar.
- **Çıktıda denetleyin:** `ddof` ya da `variance/pvariance` seçimi; aralık genişliğinin `n` ile makul küçüldüğü
  (4 kat veri ≈ yarı genişlik); önyüklemede tohum ve örnekleme birimi.
- **Benzetimle sınatın:** "gerçek değeri bildiğin yapay veride 200 kez aralık kur; kaçı gerçek değeri
  kapsıyor?" Yanıt %95'ten belirgin düşükse yöntem yanlıştır.

## İlgili

- [Olasılık temelleri](olasilik-temelleri.md): büyük sayılar yasası, beklenen değer
- [Dağılımlar](dagilimlar.md): merkezi limit teoremi ve kalın kuyrukta sınırı
- [En küçük kareler ve eğri uydurma](en-kucuk-kareler.md): regresyon katsayılarının kestirimi, ridge
- [Anlamlılık ve güven aralığı](../70-veri/anlamlilik-ve-guven-araligi.md): p değeri, Wilson ve önyükleme aralıkları, etki büyüklüğü
- [A/B testi](../70-veri/ab-testi.md): örneklem büyüklüğü, erken bakma, farkın aralığı
- [Betimsel istatistik](../70-veri/betimsel-istatistik.md): ortalama, ortanca, yüzdelik
- Gruplu ve katmanlı önyükleme güven aralığı: [`ml-temel/ml_temel/olcut/bootstrap.py`](../../ml-temel/ml_temel/olcut/bootstrap.py)
- Doğru değerlendirme ve güven aralığı: [`ml-temel/docs/DEGERLENDIRME.md`](../../ml-temel/docs/DEGERLENDIRME.md)
