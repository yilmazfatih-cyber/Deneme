---
baslik: Olasılık dağılımları
ozet: Binom, Poisson, üniform, normal, üstel ve güç yasası ne zaman ortaya çıkar, parametreleri ve ortalama/varyansı; benzetimle doğrulama, merkezi limit teoremi, kalın kuyrukta ortalamanın yanıltması.
etiketler: [olasilik, dagilim, normal-dagilim, poisson, kalin-kuyruk, benzetim]
duzey: orta
guncellik: 2026-11
---

# Olasılık dağılımları

> Bu notu ne zaman okumalı: veriye ya da benzetime bir dağılım seçerken; "normal dağıldığını varsayalım"
> denildiğinde; kapasite, zaman aşımı ya da gecikme hedefi belirlerken; bir raporda ortalama ve standart sapma
> gördüğünüzde.

## Temel fikir

- Dağılım, bir niceliğin hangi değeri hangi sıklıkla aldığını söyler. Asıl soru hep aynıdır: **aşırı değer ne
  sıklıkla gelir?** Yanlış dağılım bu soruya yanlış, çoğu zaman iyimser yanıt verir.
- Dağılımı veriye bakarak değil, **veriyi üreten süreçten** seçin: sayım mı, bekleme süresi mi, toplam mı,
  çarpım mı, "zengin daha zengin" mi? Sonra veriyle doğrulayın.
- Bağımsız küçük etkilerin **toplamı** normale gider (merkezi limit teoremi); **çarpımı** log-normale; birikerek
  büyüyen süreçler güç yasasına.
- Kalın kuyruklu (heavy-tailed) veride ortalama ve standart sapma kararsızdır; ortanca ve yüzdelikler (p95,
  p99) raporlanır.

## Karar tablosu: süreçten dağılıma

| Süreç                                   | Dağılım             | Parametre                | Ortalama                | Varyans         | Örnek                                         |
| --------------------------------------- | ------------------- | ------------------------ | ----------------------- | --------------- | --------------------------------------------- |
| Tek evet/hayır                          | Bernoulli           | `p`                      | `p`                     | `p(1−p)`        | Bir ziyaretçi satın alır mı                   |
| `n` bağımsız evet/hayırda başarı sayısı | Binom               | `n, p`                   | `np`                    | `np(1−p)`       | 1 000 ziyaretçiden kaçı satın alır            |
| Sabit aralıkta bağımsız olay sayısı     | Poisson             | `λ` (aralık başına ort.) | `λ`                     | `λ`             | Dakikadaki istek, günlük hata kaydı           |
| Olaylar arası bekleme süresi            | Üstel               | `λ` (oran)               | `1/λ`                   | `1/λ²`          | Sıradaki isteğe kadar geçen süre              |
| Sınırlı aralıkta eşit olası             | Üniform             | `a, b`                   | `(a+b)/2`               | `(b−a)²/12`     | Yeniden denemede rastgele bekleme (jitter)    |
| Çok sayıda küçük etkinin toplamı        | Normal              | `μ, σ`                   | `μ`                     | `σ²`            | Ölçüm hatası, ortalamaların dağılımı          |
| Çok sayıda küçük etkinin çarpımı        | Log-normal          | Alttaki normalin `μ, σ`  | `e^(μ+σ²/2)`            | Kuyruğa duyarlı | Yanıt süresi, dosya boyutu                    |
| Birikerek büyüme, ölçeksiz              | Güç yasası (Pareto) | `α`, en küçük `x_m`      | `α>1` ise `α·x_m/(α−1)` | `α>2` ise sonlu | Sayfa trafiği, kelime sıklığı, müşteri cirosu |

## Binom: evet/hayır sayısı

```python calistir
import math
import random
from fractions import Fraction
from statistics import NormalDist

n, p = 20, Fraction(3, 10)
pmf = [math.comb(n, k) * p**k * (1 - p) ** (n - k) for k in range(n + 1)]
assert sum(pmf) == 1
mean = sum(k * q for k, q in enumerate(pmf))
var = sum(k * k * q for k, q in enumerate(pmf)) - mean**2
assert mean == n * p and var == n * p * (1 - p)  # np ve np(1-p)

rng = random.Random(1)
draws = [sum(rng.random() < 0.3 for _ in range(n)) for _ in range(20_000)]
assert abs(sum(draws) / len(draws) - 6) < 0.06  # benzetim teoriyle tutuyor

# Normal yaklaşım np küçükken bozulur: n=50, p=0,01 → "hiç başarı yok" olasılığı
n2, p2 = 50, 0.01
exact = (1 - p2) ** n2
normal = NormalDist(n2 * p2, math.sqrt(n2 * p2 * (1 - p2))).cdf(0.5)  # süreklilik düzeltmeli
poisson = math.exp(-n2 * p2)
assert round(exact, 3) == 0.605 and round(normal, 3) == 0.5 and round(poisson, 3) == 0.607
print("tamam")
```

Kural: `np` ve `n(1−p)` en az ~10 değilse normal yaklaşıma güvenmeyin; tam binom ya da (p küçükse) Poisson
kullanın. Dönüşüm oranı gibi küçük oranlarda bu sık olur.

## Poisson: sayım ve kapasite

```python calistir
import math
import random
import statistics

rng = random.Random(3)


def poisson_draw(lam):
    """Bir birim zamanda kaç olay: üstel aralıkları sayar."""
    t, k = rng.expovariate(lam), 0
    while t < 1.0:
        k, t = k + 1, t + rng.expovariate(lam)
    return k


counts = [poisson_draw(3.0) for _ in range(50_000)]
assert abs(statistics.fmean(counts) - 3) < 0.05
assert abs(statistics.pvariance(counts) - 3) < 0.1  # Poisson'da varyans = ortalama


def pmf(k, lam):
    return math.exp(-lam) * lam**k / math.factorial(k)


# Dakikada ortalama 3 istek. Dakikaların %99'unda yetecek kapasite kaç?
capacity = next(c for c in range(50) if 1 - sum(pmf(k, 3.0) for k in range(c + 1)) < 0.01)
assert capacity == 8  # ortalamanın ~2,7 katı

# Patlamalı trafik: dakikaların yarısı sakin (λ=1), yarısı yoğun (λ=5); ortalama yine 3
bursty = [poisson_draw(rng.choice([1.0, 5.0])) for _ in range(50_000)]
ratio = statistics.pvariance(bursty) / statistics.fmean(bursty)
assert ratio > 2  # aşırı yayılım (overdispersion): Poisson varsayımı yanlış
print("kapasite:", capacity, "| varyans/ortalama:", round(ratio, 2))
```

Veride **varyans/ortalama** oranına bakın: ~1 ise Poisson makul; belirgin biçimde 1'den büyükse olaylar
kümeleniyor (kampanya, saatlik dalga, yeniden deneme fırtınası) ve Poisson kuyruğu küçümser. O zaman negatif
binom kullanın ya da kapasiteyi gözlenen yüzdelikten hesaplayın.

## Normal: toplamların dağılımı

```python calistir
from statistics import NormalDist

z = NormalDist(0, 1)
within = [round(z.cdf(k) - z.cdf(-k), 4) for k in (1, 2, 3)]
assert within == [0.6827, 0.9545, 0.9973]  # 68-95-99,7 kuralı

# Paket ağırlığı ortalama 500 g, σ = 4 g: 490 g altı oranı ve %95'lik üst sınır
weight = NormalDist(500, 4)
assert round(weight.cdf(490), 4) == 0.0062
assert round(weight.inv_cdf(0.95), 1) == 506.6

# "6 sigma" olay normal dağılımda milyarda ~2'dir; sık görüyorsanız dağılım normal değildir
assert 2 * (1 - z.cdf(6)) < 2e-9
print("tamam")
```

`statistics.NormalDist` standart kütüphanededir: `cdf`, `inv_cdf`, `pdf`, `zscore`, `samples`. Normal varsayımı
**ölçüm hatası ve ortalamalar** için iyidir; tekil yanıt süresi, gelir, dosya boyutu için kötüdür (aşağıda).

## Üstel: bekleme süresi ve belleksizlik

```python calistir
import math
import random
import statistics

rng = random.Random(5)
rate = 0.5  # dakikada 0,5 olay → ortalama bekleme 2 dk
waits = [rng.expovariate(rate) for _ in range(200_000)]  # DİKKAT: parametre oran, ortalama değil
assert abs(statistics.fmean(waits) - 1 / rate) < 0.03
assert abs(statistics.median(waits) - math.log(2) / rate) < 0.03  # ortanca (1,39) < ortalama (2)

# Belleksizlik: 2 dk beklemiş olmak kalan bekleme süresini değiştirmez
already = [w for w in waits if w > 2.0]
p_more = sum(w > 3.0 for w in already) / len(already)  # P(X > 3 | X > 2)
assert abs(p_more - math.exp(-rate * 1.0)) < 0.01  # = P(X > 1)
print("tamam")
```

Belleksizlik bir varsayımdır. Rastgele dış olaylar (istek gelişi) için iyidir; yıpranan donanım, oturum süresi,
"kullanıcı vazgeçer mi" gibi yaşa bağlı süreçler için değildir (onlarda Weibull gibi dağılımlar kullanılır).
Üniform dağılımın ortalaması `(a+b)/2`, varyansı `(b−a)²/12`'dir; iki üniformun toplamı artık üniform değildir
(üçgen olur), zar toplamındaki gibi.

## Güç yasası: ortalama kaçar, ortanca durur

```python calistir
import random
import statistics

rng = random.Random(8)
alpha = 1.16  # şekil; en küçük değer 1. Gerçek ortalama α/(α−1) = 7,25
means, medians = [], []
for _ in range(10):
    xs = [rng.paretovariate(alpha) for _ in range(10_000)]
    means.append(statistics.fmean(xs))
    medians.append(statistics.median(xs))
print("10 örneklemin ortalamaları:", [round(m, 1) for m in means])
print("10 örneklemin ortancaları:", [round(m, 2) for m in medians])
assert max(means) / min(means) > 1.3  # aynı süreç, ortalama örneklemden örnekleme sıçrıyor
assert max(medians) / min(medians) < 1.05  # ortanca kararlı

xs.sort(reverse=True)
top_share = sum(xs[: len(xs) // 100]) / sum(xs)  # en büyük %1'in toplamdaki payı
assert top_share > 0.2
print("en büyük %1'in payı:", round(top_share, 2))
```

`α ≤ 2` ise varyans sonsuzdur, `α ≤ 1` ise ortalama bile yoktur. Bu veride "ortalama müşteri cirosu" birkaç büyük
müşteriye göre değişir; örneklem ne kadar büyürse büyüsün kararlı bir değere oturmayabilir. Ortanca, yüzdelikler
ve "en büyük %1'in payı" gibi özetler kullanın; büyük değerleri ayrıca listeleyin.

## Merkezi limit teoremi ve sınırı

Bağımsız, **sonlu varyanslı** değerlerin ortalaması `n` büyüdükçe normale yaklaşır; standart sapması `σ/√n`'dir.
"Ortalama ± 1,96·SE" güven aralığı buna dayanır. Varyans sonsuzsa teorem çalışmaz ve aralık yalan söyler.

```python calistir
import math
import random
import statistics

rng = random.Random(11)
n = 30

# 30 üstel değerin ortalaması: tek tek çarpık, ortalaması normale yakın
means = [statistics.fmean(rng.expovariate(1.0) for _ in range(n)) for _ in range(10_000)]
se = 1 / math.sqrt(n)  # σ/√n; üstel(1) için σ = 1
within1 = sum(abs(m - 1) <= se for m in means) / len(means)
within2 = sum(abs(m - 1) <= 2 * se for m in means) / len(means)
assert abs(within1 - 0.683) < 0.025 and abs(within2 - 0.954) < 0.015


def coverage(draw, true_mean, reps=2000):
    """'ortalama ± 1,96·SE' aralığı gerçek ortalamayı ne sıklıkla kapsıyor?"""
    hits = 0
    for _ in range(reps):
        xs = [draw() for _ in range(n)]
        half = 1.96 * statistics.stdev(xs) / math.sqrt(n)
        hits += abs(statistics.fmean(xs) - true_mean) <= half
    return hits / reps


light = coverage(lambda: rng.expovariate(1.0), 1.0)
heavy = coverage(lambda: rng.paretovariate(1.5), 3.0)  # varyansı sonsuz
print("aralığın kapsama oranı | üstel:", light, "| Pareto(1,5):", heavy)
assert light > 0.88 and heavy < 0.8  # %95 olması gerekirdi
```

Üstel veride bile `n = 30` ile kapsama %95'in biraz altındadır (çarpıklık); kalın kuyrukta çok altına düşer.
Güven aralığı ayrıntısı ve önyükleme: [istatistiksel kestirim](istatistiksel-kestirim.md).

## Kalın kuyruk: gecikmede ortalama yanıltır

```python calistir
import math
import random
import statistics

rng = random.Random(4)
# Yanıt süresi: ortanca 80 ms, log-normal (çarpımsal gecikmelerin birikimi)
lat = sorted(rng.lognormvariate(math.log(80), 0.9) for _ in range(100_000))


def pct(q):
    return lat[int(q * len(lat))]


mean = statistics.fmean(lat)
print(f"ortalama {mean:.0f} ms | ortanca {pct(0.5):.0f} | p95 {pct(0.95):.0f} | p99 {pct(0.99):.0f}")
assert pct(0.5) < mean < pct(0.95)  # ortalama ne "tipik" ne "en kötü"
assert pct(0.99) > 5 * pct(0.5)  # her yüz istekten biri ortancanın 5+ katı
assert abs(mean - 80 * math.exp(0.9**2 / 2)) < 3  # teori: e^(μ + σ²/2) ≈ 120 ms

# Sayfa 20 ayrı isteği bekliyorsa, en az birinin p99'u aşma olasılığı
assert round(1 - 0.99**20, 2) == 0.18  # sayfaların ~%18'i "en kötü %1"i yaşar
```

Gecikme hedefini ortalamayla değil yüzdelikle koyun ("p99 < 500 ms"). Çok parçalı isteklerde kuyruk büyür: tek
bir yavaş parça bütün sayfayı yavaşlatır.

## Parametre adları: kütüphaneler aynı sayıyı farklı okur

| Dağılım    | Python `random`                                             | numpy                                | Tuzak                                           |
| ---------- | ----------------------------------------------------------- | ------------------------------------ | ----------------------------------------------- |
| Üstel      | `expovariate(lambd)`: **oran** (1/ortalama)                 | `exponential(scale)`: **ortalama**   | Aynı `2.0` biri için ortalama 0,5, öteki için 2 |
| Normal     | `gauss(mu, sigma)`: standart sapma                          | `normal(loc, scale)`: standart sapma | Varyans vermeyin                                |
| Log-normal | `lognormvariate(mu, sigma)`: alttaki normalin parametreleri | `lognormal(mean, sigma)`: aynı       | `mean` dağılımın ortalaması değildir            |
| Pareto     | `paretovariate(alpha)`: en küçük değer 1                    | `pareto(a)`: Lomax, en küçük değer 0 | numpy sonucu = klasik Pareto − 1                |

## Tuzaklar

| Belirti                                                       | Neden                                                    | Çözüm                                                     |
| ------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------- |
| Kapasite ortalamaya göre kuruldu, yoğun dakikalarda taşıyor   | Ortalama değil kuyruk önemli; trafik patlamalı           | Kapasiteyi p99'a göre; varyans/ortalama oranını ölçün     |
| "3 sigma" dışı olaylar haftada bir yaşanıyor                  | Veri normal değil, kuyruğu kalın                         | Yüzdeliklerle çalışın; normal varsayımını bırakın         |
| Ortalama gecikme iyi, kullanıcılar yine şikâyetçi             | Log-normal/kalın kuyruk; ortalama tipik değeri göstermez | p50, p95, p99 raporlayın                                  |
| Aynı veriden her ay farklı "ortalama müşteri değeri"          | Güç yasası; birkaç büyük müşteri ortalamayı sürüklüyor   | Ortanca, kırpılmış ortalama, en büyükleri ayrı raporlayın |
| Benzetim ortalaması beklenenin iki katı/yarısı                | Parametre adı karışmış (oran ↔ ölçek)                    | Üretilen örneğin ortalamasını teoriyle `assert` edin      |
| Log-normal benzetimin ortalaması `mean` parametresinden büyük | `mean/mu` alttaki normalin ortalaması                    | Ortalama `exp(μ + σ²/2)`; ortanca `exp(μ)`                |
| Küçük oranlarda güven aralığı eksi değere taşıyor             | `np` küçük, normal yaklaşım geçersiz                     | Tam binom ya da Wilson aralığı                            |
| Güven aralığı "%95" ama tutmuyor                              | Kalın kuyruk; merkezi limit teoremi için örnek az        | Önyükleme, dönüşüm (log), ya da ortanca için aralık       |

## Denetim listesi

- [ ] Dağılım, veriyi üreten süreçten gerekçelendirilmiş (sayım, bekleme, toplam, çarpım, birikim).
- [ ] Seçilen dağılım veriyle karşılaştırılmış: ortalama, varyans, birkaç yüzdelik.
- [ ] Sayım verisinde varyans/ortalama oranı ölçülmüş.
- [ ] Gecikme, gelir, boyut gibi çarpık verilerde ortanca ve p95/p99 raporlanmış; yalnız ortalama yok.
- [ ] Benzetimde üretilen örneklerin ortalaması/varyansı teoriyle `assert` edilmiş (parametre adı denetimi).
- [ ] Normal yaklaşım kullanılan yerde `np ≥ 10` ve `n(1−p) ≥ 10` denetlenmiş.
- [ ] Kapasite ve zaman aşımı yüzdeliğe göre seçilmiş; çok parçalı isteklerde kuyruk büyümesi hesaba katılmış.

## Küçük modele yaptırırken

- **İsteme yazın:** "Dağılımı süreçten gerekçelendir. Benzetimde ürettiğin örneğin ortalama ve varyansını
  teorik değerle `assert` et. Çarpık veride ortanca, p95 ve p99 raporla."
- **Modelin tipik hatası:** her şeye normal dağılım uydurur; `expovariate(2)`'yi "ortalama 2" sanır; numpy ile
  `random` parametrelerini karıştırır; kalın kuyruklu veride ortalama ± standart sapma verir.
- **Çıktıda denetleyin:** parametrenin oran mı ölçek mi olduğu; raporda yüzdelik var mı; kapasite hesabı
  ortalamaya mı dayanıyor.
- **Soru sorun:** "Bu veride en büyük %1 toplamın ne kadarı?" Yanıt büyükse ortalama tabanlı her sonuca
  şüpheyle bakın.

## İlgili

- [Olasılık temelleri](olasilik-temelleri.md): beklenen değer, varyans, büyük sayılar yasası
- [İstatistiksel kestirim](istatistiksel-kestirim.md): parametreyi veriden kestirme, standart hata, önyükleme
- [Rastgelelik ve benzetim](rastgelelik-ve-benzetim.md): bu dağılımlardan örnek üretme (ters dönüşüm)
- [Tahmin ve büyüklük sezgisi](tahmin-ve-buyukluk-sezgisi.md): kapasite ve gecikme mertebeleri
- [Betimsel istatistik](../70-veri/betimsel-istatistik.md): ortalama, ortanca, yüzdelik; aykırı değerin etkisi
- [Kapasite tahmini](../40-sistem-tasarimi/kapasite-tahmini.md): tepe yük, gecikme yüzdelikleri, Little yasası
- Betimleyici istatistik (yüzdelik, çeyreklik, aykırı değer): [`kutuphane/py/kutuphane/istatistik.py`](../../kutuphane/py/kutuphane/istatistik.py)
