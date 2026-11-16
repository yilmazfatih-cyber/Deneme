---
baslik: En küçük kareler ve eğri uydurma
ozet: Doğru ve eğri uydurmanın matematiği; artıkların anlamı ve R², normal denklemlerin sayısal tehlikesi ve merkezleme, aykırı değere dayanıklı uydurma, çoklu doğrusallık ve ridge, log dönüşümüyle büyüme kestirimi.
etiketler: [en-kucuk-kareler, regresyon, egri-uydurma, ridge, sayisal-kararlilik]
duzey: orta
guncellik: 2026-11
---

# En küçük kareler ve eğri uydurma

> Bu notu ne zaman okumalı: veriye doğru, eğri ya da büyüme oranı uydururken (satış eğilimi, maliyet–adet
> ilişkisi, kalibrasyon eğrisi); bir regresyonun katsayılarını yorumlamadan önce; uydurma "çalıştığı" hâlde
> katsayılar saçma ya da her veri güncellemesinde çok farklı çıktığında.

## Temel fikir

- Model `y ≈ X·β`; en küçük kareler, **artıkların** (gözlenen − tahmin) karelerinin toplamını en küçük yapan `β`'yı
  seçer. Geometrik olarak `y`'yi, `X`'in sütunlarının oluşturduğu uzaya **dik izdüşürmektir**; bu yüzden artıklar
  her sütuna diktir ve (sabit terim varsa) toplamları sıfırdır.
- Kare almak büyük hatayı çok cezalandırır: tek bir aykırı değer doğruyu kendine çeker. Kare kaybın "ortalama"
  gibi, mutlak kaybın "ortanca" gibi davrandığını düşünün.
- Kapalı çözüm `(XᵀX)·β = Xᵀy` (normal denklemler) kâğıtta doğrudur ama `XᵀX` koşul sayısının **karesini** alır;
  sütunlar büyük ve birbirine benzerse sonuç bozulur. Kütüphaneler QR/SVD ile çözer; elle yazacaksanız önce
  sütunları merkezleyin ve ölçekleyin.
- Sütunlar birbirine çok benzerse (çoklu doğrusallık) tahminler iyi kalır ama **katsayılar anlamsızlaşır**.
  Ridge (`XᵀX + λI`) katsayıları kararlı kılar.
- **R²**, verideki değişkenliğin modelce açıklanan payıdır; modelin doğru olduğunu ya da geleceği tahmin
  edebileceğini söylemez.

## Karar tablosu

| Durum                                          | Seçim                                          | Neden                                                        |
| ---------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| Az sütun, düzgün veri, eğilim ya da ilişki     | Sıradan en küçük kareler (kütüphanede `lstsq`) | Kapalı çözüm, hızlı                                          |
| Büyük değerli ya da polinom sütunlar (yıl, x³) | Önce merkezle/ölçekle, sonra uydur             | Normal denklemlerde bilgi kaybını önler                      |
| Birkaç aykırı değer                            | Mutlak kayıp (L1) ya da Huber                  | Tek değer doğruyu sürükleyemez                               |
| Birbirine çok benzeyen sütunlar                | Ridge (L2 cezası) ya da sütun eleme            | Katsayılar kararlı; yorumlanabilir                           |
| Üstel büyüme, güç yasası                       | Log dönüşümü + doğru uydurma                   | Çarpımsal model doğrusal olur; geri dönüşte düzeltme gerekir |
| Ölçümlerin güvenilirliği farklı                | Ağırlıklı en küçük kareler                     | Gürültülü noktanın etkisi azalır                             |
| Veri aralığının dışını tahmin (ekstrapolasyon) | Yapmayın; yapılacaksa basit model + aralık     | Uydurma yalnız gördüğü aralıkta sınanmıştır                  |
| Sınıflandırma, olasılık                        | En küçük kareler değil: lojistik regresyon     | Kare kayıp olasılık için yanlış ölçüdür                      |

## Doğru uydurma: artıklar ne söyler

```python calistir
xs = [1, 2, 3, 4, 5, 6, 7, 8]
ys = [2.1, 3.9, 6.2, 8.1, 9.8, 12.2, 13.8, 16.1]


def fit_line(xs, ys):
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    return my - slope * mx, slope  # (kesişim, eğim)


a, b = fit_line(xs, ys)
residuals = [y - (a + b * x) for x, y in zip(xs, ys)]
assert round(b, 3) == 1.990 and round(a, 3) == 0.068
assert abs(sum(residuals)) < 1e-9  # sabit terim varsa artıkların toplamı 0
assert abs(sum(r * x for r, x in zip(residuals, xs))) < 1e-9  # artıklar x'e dik (izdüşüm)

my = sum(ys) / len(ys)
r2 = 1 - sum(r * r for r in residuals) / sum((y - my) ** 2 for y in ys)
assert r2 > 0.99
print(f"y ≈ {a:.3f} + {b:.3f}·x, R² = {r2:.4f}")
```

Artıkları her zaman çizin ya da sıralı yazdırın: rastgele dağılmıyorlarsa (eğri çiziyor, zamanla büyüyor, bir
grupta hep pozitif) model yapıyı kaçırıyordur. Yüksek R² bunu gizleyebilir.

## Normal denklemler ve merkezleme

```python calistir
import math
import random


def solve(A, b):
    """Kısmi pivotlu Gauss eleme (float)."""
    n = len(A)
    M = [row[:] + [rhs] for row, rhs in zip(A, b)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(M[r][c]))
        M[c], M[p] = M[p], M[c]
        for r in range(c + 1, n):
            f = M[r][c] / M[c][c]
            M[r] = [x - f * y for x, y in zip(M[r], M[c])]
    x = [0.0] * n
    for r in reversed(range(n)):
        x[r] = (M[r][n] - sum(M[r][k] * x[k] for k in range(r + 1, n))) / M[r][r]
    return x


def poly_fit_normal_equations(xs, ys, degree):
    X = [[x**k for k in range(degree + 1)] for x in xs]
    XtX = [[sum(row[i] * row[j] for row in X) for j in range(degree + 1)] for i in range(degree + 1)]
    Xty = [sum(row[i] * y for row, y in zip(X, ys)) for i in range(degree + 1)]
    return solve(XtX, Xty)


def rmse(coef, xs, ys):
    return math.sqrt(sum((sum(c * x**k for k, c in enumerate(coef)) - y) ** 2 for x, y in zip(xs, ys)) / len(ys))


rng = random.Random(0)
years = [2000 + i * 0.5 for i in range(21)]  # x büyük: 2000–2010
ys = [3 + 0.2 * (t - 2005) - 0.1 * (t - 2005) ** 2 + 0.01 * (t - 2005) ** 3 + rng.gauss(0, 0.05) for t in years]

raw = rmse(poly_fit_normal_equations(years, ys, 3), years, ys)
center = sum(years) / len(years)
shifted = [t - center for t in years]
centered = rmse(poly_fit_normal_equations(shifted, ys, 3), shifted, ys)
print(f"3. derece, ham yıl: RMSE {raw:.3f} | merkezlenmiş: {centered:.3f} (gürültü 0,05)")
assert centered < 0.06 < 0.15 < raw  # ham sütunlarla kübik terim yuvarlamada kayboldu
```

Aynı veri, aynı model: yalnız sütunları merkezlemek sonucu düzeltti. Ham yılın küpü ~8·10⁹, `XᵀX`'te ~10²¹
mertebesinde sayılar oluşur; küçük ama önemli bilgi bunların yanında yuvarlanır
([sayısal yöntemler](sayisal-yontemler.md), [özdeğer ve ayrışımlar](ozdeger-ve-ayrisimlar.md) → AᵀA uyarısı).

## Aykırı değer: kare kayıp ile mutlak kayıp

```python calistir
from itertools import combinations


def fit_line(xs, ys):
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    return my - slope * mx, slope


def fit_line_l1(xs, ys):
    """Mutlak hata toplamını en küçükleyen doğru; küçük veride iki noktadan geçen doğrular denenir."""
    best = None
    for i, j in combinations(range(len(xs)), 2):
        if xs[i] == xs[j]:
            continue
        slope = (ys[j] - ys[i]) / (xs[j] - xs[i])
        intercept = ys[i] - slope * xs[i]
        cost = sum(abs(y - (intercept + slope * x)) for x, y in zip(xs, ys))
        if best is None or cost < best[0]:
            best = (cost, intercept, slope)
    return best[1], best[2]


xs = [1, 2, 3, 4, 5, 6, 7, 8]
ys = [2.1, 3.9, 6.2, 8.1, 9.8, 12.2, 13.8, 40.0]  # son ölçüm hatalı girilmiş (16,1 olmalıydı)
_, slope_l2 = fit_line(xs, ys)
_, slope_l1 = fit_line_l1(xs, ys)
assert round(slope_l2, 2) == 3.98  # tek nokta eğimi iki katına çıkardı
assert round(slope_l1, 2) == 2.0  # mutlak kayıp etkilenmedi
print("tamam")
```

Önce aykırı değerin **neden** orada olduğunu sorun (yazım hatası mı, gerçek ama nadir olay mı). Hata ise
düzeltin; gerçekse dayanıklı kayıp (L1, Huber) kullanın ve aykırı değerleri ayrıca raporlayın. Sessizce silmek,
modeli en önemli olaylara kör eder.

## Çoklu doğrusallık ve ridge

```python calistir
import random

rng = random.Random(1)


def fit_two(x1, x2, y, lam):
    """Sabit terimsiz iki sütun: (XᵀX + λI)·β = Xᵀy, kapalı çözüm."""
    s11 = sum(a * a for a in x1) + lam
    s22 = sum(b * b for b in x2) + lam
    s12 = sum(a * b for a, b in zip(x1, x2))
    t1, t2 = sum(a * c for a, c in zip(x1, y)), sum(b * c for b, c in zip(x2, y))
    det = s11 * s22 - s12 * s12
    return (t1 * s22 - s12 * t2) / det, (s11 * t2 - s12 * t1) / det


for sample in range(2):  # aynı süreçten iki ayrı örneklem
    x1 = [rng.gauss(0, 1) for _ in range(50)]
    x2 = [v + rng.gauss(0, 0.01) for v in x1]  # x2 neredeyse x1'in kopyası
    y = [a + b + rng.gauss(0, 0.5) for a, b in zip(x1, x2)]  # gerçek katsayılar (1, 1)
    ols = fit_two(x1, x2, y, lam=0.0)
    ridge = fit_two(x1, x2, y, lam=1.0)
    print(f"örneklem {sample}: sıradan ({ols[0]:.1f}, {ols[1]:.1f}) | ridge ({ridge[0]:.2f}, {ridge[1]:.2f})")
    assert max(abs(c) for c in ols) > 3  # katsayılar uçtu, işaretleri bile anlamsız
    assert abs(sum(ols) - 2) < 0.2  # ama toplamları (tahminler) yine doğru
    assert all(abs(c - 1) < 0.1 for c in ridge)  # ridge: kararlı ve yorumlanabilir
```

"Bu özelliğin katsayısı eksi, demek ki satışı düşürüyor" yorumu çoklu doğrusallıkta yanlıştır. Katsayı
yorumlanacaksa önce sütunlar arası korelasyona bakın; birbirinin kopyası olanları birleştirin ya da ridge
kullanın. Ridge'de `λ` çapraz doğrulamayla seçilir ve sütunlar önceden ölçeklenir.

## Büyüme oranı: log dönüşümü

`y = A·(1 + r)^t` doğrusal değildir; logaritması `log y = log A + t·log(1 + r)` doğrudur.

```python calistir
import math
import random

rng = random.Random(2)
months = list(range(24))
sales = [100 * 1.08**t * math.exp(rng.gauss(0, 0.1)) for t in months]  # ayda %8 büyüme, çarpımsal gürültü

logs = [math.log(s) for s in sales]
mt, ml = sum(months) / len(months), sum(logs) / len(logs)
slope = sum((t - mt) * (v - ml) for t, v in zip(months, logs)) / sum((t - mt) ** 2 for t in months)
intercept = ml - slope * mt
growth = math.exp(slope) - 1
assert abs(growth - 0.08) < 0.01

# Geri dönüş yanlılığı: exp(log tahmini) ortancayı verir, ortalamayı değil
spread = sum((v - (intercept + slope * t)) ** 2 for t, v in zip(months, logs)) / (len(months) - 2)
median_forecast = math.exp(intercept + slope * 30)
mean_forecast = median_forecast * math.exp(spread / 2)  # log-normal düzeltmesi
assert mean_forecast > median_forecast
print(f"aylık büyüme ≈ %{growth * 100:.1f}; 30. ay tahmini ≈ {mean_forecast:.0f} (ortanca {median_forecast:.0f})")
```

Ekstrapolasyon uyarısı: 24 aylık veriden 30. ayı tahmin etmek, büyümenin süreceğini **varsayar**. Tahmini
mutlaka bir aralıkla ve "eğilim sürerse" koşuluyla verin; üstel büyüme sonsuza dek sürmez.

## Tuzaklar

| Belirti                                                      | Neden                                                     | Çözüm                                                       |
| ------------------------------------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------- |
| Polinom uydurma kütüphanede iyi, elle yazılan kodda kötü     | Normal denklemler + ham büyük sütunlar (yıl, x³)          | Merkezle/ölçekle; QR ya da `lstsq`                          |
| Tek bir nokta doğrunun eğimini ikiye katladı                 | Kare kayıp aykırı değere duyarlı                          | Nedenini bulun; L1/Huber; aykırıları ayrıca raporlayın      |
| Katsayılar her yeni veride işaret değiştiriyor               | Çoklu doğrusallık                                         | Korelasyona bakın; sütun birleştirme ya da ridge            |
| R² çok yüksek ama tahminler kötü                             | Ekstrapolasyon, ya da artıklarda yapı var                 | Artıkları çizin; zaman ayrımlı doğrulama                    |
| R² negatif çıktı                                             | Model ortalamadan bile kötü (çoğu zaman sınama verisinde) | Modeli, özellikleri ve sızıntıyı gözden geçirin             |
| Log uydurmalı tahminler sistematik olarak düşük              | `exp(log tahmin)` ortancadır                              | `exp(σ²/2)` düzeltmesi                                      |
| Sıfır ya da eksi değerde log hatası                          | `log(0)` tanımsız                                         | Sıfırları ayrı modelleyin; `log1p` yalnız bilinçli kullanın |
| Olasılık/evet-hayır için doğru uydurulmuş, tahmin 1'i aşıyor | Sınıflandırmada kare kayıp                                | Lojistik regresyon                                          |

## Denetim listesi

- [ ] Artıklar incelendi (sıraya ya da `x`'e göre); belirgin yapı yok.
- [ ] Büyük değerli ve polinom sütunlar merkezlenmiş/ölçeklenmiş; çözüm QR/`lstsq` ile.
- [ ] Aykırı değerlerin nedeni araştırılmış; gerekiyorsa dayanıklı kayıp kullanılmış.
- [ ] Katsayı yorumlanacaksa sütunlar arası korelasyon denetlenmiş; ridge `λ`'sı çapraz doğrulamayla seçilmiş.
- [ ] Log dönüşümlü modelde geri dönüş düzeltmesi yapılmış ya da tahminin "ortanca" olduğu yazılmış.
- [ ] Tahminler veri aralığının dışına taşıyorsa bu açıkça yazılmış ve aralıkla verilmiş.
- [ ] R² yanında hata ölçüsü (RMSE/MAE) hedefin biriminde raporlanmış.

## Küçük modele yaptırırken

- **İsteme yazın:** "Uydurmayı `numpy.linalg.lstsq` (ya da scikit-learn) ile yap; normal denklemleri elle kurma.
  Sütunları önce merkezle. Artıkları x'e karşı yazdır ve yapı varsa söyle. Katsayıları yorumlamadan önce sütun
  korelasyonlarını göster."
- **Modelin tipik hatası:** `inv(X.T @ X) @ X.T @ y` yazar; ham yıl sütunuyla polinom uydurur; aykırı değeri
  sessizce siler; log modelinde geri dönüş yanlılığını unutur; R²'yi tek başarı ölçüsü sayar.
- **Çıktıda denetleyin:** `inv(` ve `X.T @ X`; merkezleme satırı; artık incelemesi; tahmin aralığının veri
  aralığıyla karşılaştırması.
- **Sınama verisi isteyin:** bilinen katsayılarla üretilmiş yapay veride modelin katsayıları geri bulduğunu
  gösteren bir test.

## İlgili

- [Lineer cebir sezgisi](lineer-cebir-sezgisi.md): izdüşüm, denklem sistemi, pivot
- [Sayısal yöntemler](sayisal-yontemler.md): koşul sayısı, küçük artık–büyük hata
- [İstatistiksel kestirim](istatistiksel-kestirim.md): yanlılık–varyans ödünleşimi (ridge'in mantığı)
- [Aşırı öğrenme](../80-ml/asiri-ogrenme.md): polinom derecesi ve düzenlileştirme
- [Korelasyon ve nedensellik](../70-veri/korelasyon-ve-nedensellik.md): katsayı neden-sonuç değildir
- Doğrusal regresyon ve Ridge gerçeklemesi: [`ml-temel/ml_temel/klasik/linear.py`](../../ml-temel/ml_temel/klasik/linear.py);
  basit doğrusal regresyon ve R²: [`kutuphane/py/kutuphane/istatistik.py`](../../kutuphane/py/kutuphane/istatistik.py)
