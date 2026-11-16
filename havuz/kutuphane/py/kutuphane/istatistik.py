"""istatistik — betimleyici istatistik: hassas toplam, ortalama, ortanca, çeyreklikler (R7 / Excel YÜZDEBİRLİK),
varyans ve standart sapma (Welford), tepe değer, histogram, doğrusal regresyon, Pearson korelasyonu, hareketli
ortalama, üstel hareketli ortalama, z-puanı, IQR ile aykırı değer. TypeScript eşiyle aynı tanımlar.

Kullanım:
    mean([2, 4, 9])                       # 5.0
    quantile([1, 2, 3, 4], 0.25)          # 1.75  (Excel YÜZDEBİRLİK.DAHİL, NumPy varsayılanı)
    standard_deviation(veri)              # örneklem (n−1); sample=False → anakütle (n)
    linear_regression(aylar, satislar)    # Regression(slope, intercept, r2)
    histogram(yaslar, bins=5)             # Histogram(edges=[...6 sınır], counts=[...5 sayı])
    moving_average(gunluk, 7)             # 7 günlük hareketli ortalama

Sınırlar: Boş girdi ve NaN/sonsuz değer StatsError verir. Toplam math.fsum ile tam doğrudur (TypeScript eşi Neumaier
kullanır; son basamakta fark olabilir). Ağırlıklı istatistik, güven aralığı, hipotez testi yoktur (statistics/scipy).
Histogramda son kutu üst sınırı da içerir; min = max ise tek kutu döner.

Genişletme: Yeni ölçü saf bir işlev olarak eklenir, girdiyi `_checked` ile denetler; TypeScript eşine eklenir ve
`vektorler/istatistik.json`'a örnek yazılır.
"""

from __future__ import annotations

import math
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass

__all__ = [
    "Histogram",
    "Regression",
    "StatsError",
    "exponential_moving_average",
    "histogram",
    "iqr",
    "linear_regression",
    "mean",
    "median",
    "mode",
    "moving_average",
    "outliers_iqr",
    "pearson",
    "precise_sum",
    "quantile",
    "quartiles",
    "standard_deviation",
    "variance",
    "z_scores",
]

Number = int | float


class StatsError(ValueError):
    """Boş/yetersiz girdi ya da sonlu olmayan değer."""


@dataclass(frozen=True)
class Histogram:
    edges: list[float]
    counts: list[int]


@dataclass(frozen=True)
class Regression:
    slope: float
    intercept: float
    r2: float


def _checked(values: Sequence[Number], minimum: int = 1, label: str = "değer") -> Sequence[Number]:
    if len(values) < minimum:
        raise StatsError(f"En az {minimum} {label} gerekir; {len(values)} verildi.")
    for value in values:
        if (
            isinstance(value, bool)
            or not isinstance(value, int | float)
            or not math.isfinite(value)
        ):
            raise StatsError(f"Sonlu sayı olmayan değer var: {value!r}.")
    return values


def precise_sum(values: Sequence[Number]) -> float:
    """Kayan nokta hatası olmadan toplam (math.fsum): [0.1, 0.2, 0.3] → 0.6."""
    return math.fsum(_checked(values, 0))


def mean(values: Sequence[Number]) -> float:
    return precise_sum(_checked(values)) / len(values)


def quantile(values: Sequence[Number], q: float) -> float:
    """Doğrusal aradeğerlemeli yüzdebirlik (R7; Excel YÜZDEBİRLİK.DAHİL, NumPy varsayılanı). 0 ≤ q ≤ 1."""
    if not 0 <= q <= 1:
        raise StatsError(f"q 0 ile 1 arasında olmalı: {q}.")
    xs = sorted(_checked(values))
    h = (len(xs) - 1) * q
    lo = math.floor(h)
    low = xs[lo]
    high = xs[min(lo + 1, len(xs) - 1)]
    return low + (h - lo) * (high - low)


def median(values: Sequence[Number]) -> float:
    return quantile(values, 0.5)


def quartiles(values: Sequence[Number]) -> tuple[float, float, float]:
    """(Q1, Q2 (ortanca), Q3)."""
    return quantile(values, 0.25), quantile(values, 0.5), quantile(values, 0.75)


def iqr(values: Sequence[Number]) -> float:
    """Çeyrekler açıklığı: Q3 − Q1."""
    q1, _, q3 = quartiles(values)
    return q3 - q1


def variance(values: Sequence[Number], *, sample: bool = True) -> float:
    """Varyans (Welford). Varsayılan örneklem (n − 1); sample=False → anakütle (n)."""
    _checked(values, 2 if sample else 1)
    average = 0.0
    m2 = 0.0
    for i, value in enumerate(values):
        delta = value - average
        average += delta / (i + 1)
        m2 += delta * (value - average)
    return m2 / (len(values) - 1 if sample else len(values))


def standard_deviation(values: Sequence[Number], *, sample: bool = True) -> float:
    return math.sqrt(variance(values, sample=sample))


def mode(values: Sequence[Number]) -> list[Number]:
    """En sık görülen değer(ler), küçükten büyüğe."""
    counts = Counter(_checked(values))
    best = max(counts.values())
    return sorted(value for value, count in counts.items() if count == best)


def histogram(
    values: Sequence[Number], *, bins: int = 10, min: float | None = None, max: float | None = None
) -> Histogram:
    """Eşit genişlikli histogram. `min`/`max` verilirse aralık dışındakiler sayılmaz."""
    _checked(values)
    low = min if min is not None else _min(values)
    high = max if max is not None else _max(values)
    if bins < 1:
        raise StatsError("bins 1 veya daha büyük tam sayı olmalı.")
    if not high >= low:
        raise StatsError("max, min değerinden küçük olamaz.")
    if high == low:
        bins = 1
    edges = [high if i == bins else low + ((high - low) * i) / bins for i in range(bins + 1)]
    counts = [0] * bins
    for value in values:
        if value < low or value > high:
            continue
        index = (
            0
            if high == low
            else _min([bins - 1, math.floor(((value - low) / (high - low)) * bins)])
        )
        counts[int(index)] += 1
    return Histogram(edges=[float(e) for e in edges], counts=counts)


def _min(values: Sequence[Number]) -> Number:
    result = values[0]
    for value in values[1:]:
        result = value if value < result else result
    return result


def _max(values: Sequence[Number]) -> Number:
    result = values[0]
    for value in values[1:]:
        result = value if value > result else result
    return result


def _pairs(xs: Sequence[Number], ys: Sequence[Number]) -> None:
    if len(xs) != len(ys):
        raise StatsError(f"x ({len(xs)}) ve y ({len(ys)}) aynı uzunlukta olmalı.")
    _checked(xs, 2, "nokta")
    _checked(ys, 2, "nokta")


def _sums(xs: Sequence[Number], ys: Sequence[Number]) -> tuple[float, float, float, float, float]:
    mx, my = mean(xs), mean(ys)
    sxy = sxx = syy = 0.0
    for x, y in zip(xs, ys, strict=True):
        dx, dy = x - mx, y - my
        sxy += dx * dy
        sxx += dx * dx
        syy += dy * dy
    return mx, my, sxy, sxx, syy


def linear_regression(xs: Sequence[Number], ys: Sequence[Number]) -> Regression:
    """En küçük kareler doğrusu: y ≈ slope · x + intercept; r2 belirleme katsayısı."""
    _pairs(xs, ys)
    mx, my, sxy, sxx, syy = _sums(xs, ys)
    if sxx == 0:
        raise StatsError("Bütün x değerleri aynı; doğru çizilemez.")
    slope = sxy / sxx
    intercept = my - slope * mx
    ss_res = 0.0
    for x, y in zip(xs, ys, strict=True):
        residual = y - (slope * x + intercept)
        ss_res += residual * residual
    return Regression(slope=slope, intercept=intercept, r2=1.0 if syy == 0 else 1 - ss_res / syy)


def pearson(xs: Sequence[Number], ys: Sequence[Number]) -> float:
    """Pearson korelasyon katsayısı (−1…1)."""
    _pairs(xs, ys)
    _, _, sxy, sxx, syy = _sums(xs, ys)
    if sxx == 0 or syy == 0:
        raise StatsError("Değerlerden biri sabit; korelasyon tanımsız.")
    return sxy / math.sqrt(sxx * syy)


def moving_average(values: Sequence[Number], window: int) -> list[float]:
    """Basit hareketli ortalama: sonuç uzunluğu n − window + 1."""
    if window < 1:
        raise StatsError("window 1 veya daha büyük tam sayı olmalı.")
    _checked(values, window)
    return [mean(values[i : i + window]) for i in range(len(values) - window + 1)]


def exponential_moving_average(values: Sequence[Number], alpha: float) -> list[float]:
    """Üstel hareketli ortalama: e₀ = x₀, eᵢ = α·xᵢ + (1 − α)·eᵢ₋₁; 0 < α ≤ 1."""
    if not 0 < alpha <= 1:
        raise StatsError(f"alpha 0'dan büyük ve en çok 1 olmalı: {alpha}.")
    out: list[float] = []
    for value in _checked(values):
        out.append(float(value) if not out else alpha * value + (1 - alpha) * out[-1])
    return out


def z_scores(values: Sequence[Number], *, sample: bool = True) -> list[float]:
    """Her değerin z-puanı: (x − ortalama) / standart sapma."""
    average = mean(values)
    sd = standard_deviation(values, sample=sample)
    if sd == 0:
        raise StatsError("Standart sapma sıfır; z-puanı tanımsız.")
    return [(value - average) / sd for value in values]


def outliers_iqr(values: Sequence[Number], k: float = 1.5) -> list[Number]:
    """Tukey çitleri dışındaki değerler: [Q1 − k·IQR, Q3 + k·IQR] aralığı dışı."""
    q1, _, q3 = quartiles(values)
    spread = q3 - q1
    return [value for value in values if value < q1 - k * spread or value > q3 + k * spread]
