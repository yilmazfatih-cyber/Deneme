"""Üreteçlerin ortak yardımcıları: tohumlu rastgelelik akışları, Zipf ağırlığı, para, tarih.

``Rng(tohum, "akış-adı")``: aynı tohumdan türetilen bağımsız akışlar. Bir üretece yeni bir alan
eklemek başka alanların değerlerini kaydırmasın diye her konu kendi akışını kullanır
(``rng.child("telefon")``). Yalnız sürümler arasında kararlı ``random`` işlevleri kullanılır.
Para her zaman ``Decimal`` ve "yarım yukarı" yuvarlamayla hesaplanır (float kuruş hatası olmaz).
Genişletme: yeni bir dağılım gerekiyorsa ``Rng``e yöntem olarak ekleyin ve testini yazın.
"""

from __future__ import annotations

import bisect
import hashlib
import math
import random
from collections.abc import Sequence
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, TypeVar

T = TypeVar("T")
Row = dict[str, Any]
Tables = dict[str, list[Row]]

CENT = Decimal("0.01")


def derive_seed(seed: int, stream: str) -> int:
    """(tohum, akış adı) çiftinden 64 bitlik kararlı bir tohum türetir."""
    digest = hashlib.sha256(f"{seed}:{stream}".encode()).digest()
    return int.from_bytes(digest[:8], "big")


class Rng:
    """``random.Random`` üzerine ince katman: adlandırılmış akışlar + sık kullanılan dağılımlar."""

    def __init__(self, seed: int, stream: str = "kok") -> None:
        self.seed = seed
        self.stream = stream
        self._random = random.Random(derive_seed(seed, stream))

    def child(self, stream: str) -> Rng:
        """Bu akıştan bağımsız, adı verilen alt akış."""
        return Rng(self.seed, f"{self.stream}/{stream}")

    def random(self) -> float:
        return self._random.random()

    def randint(self, low: int, high: int) -> int:
        """[low, high] aralığında tam sayı (iki uç dahil)."""
        return self._random.randint(low, high)

    def uniform(self, low: float, high: float) -> float:
        return low + (high - low) * self._random.random()

    def bernoulli(self, probability: float) -> bool:
        return self._random.random() < probability

    def choice(self, items: Sequence[T]) -> T:
        return items[self._random.randrange(len(items))]

    def weighted(self, items: Sequence[T], weights: Sequence[float]) -> T:
        return self._random.choices(items, weights=weights, k=1)[0]

    def sample(self, items: Sequence[T], k: int) -> list[T]:
        return self._random.sample(list(items), k)

    def shuffle(self, items: list[T]) -> None:
        self._random.shuffle(items)

    def gauss(self, mean: float, sigma: float) -> float:
        return self._random.gauss(mean, sigma)

    def lognormal(self, median: float, sigma: float) -> float:
        """Ortancası ``median`` olan log-normal değer (tutar ve süre için)."""
        return median * math.exp(self._random.gauss(0.0, sigma))

    def triangular(self, low: float, high: float, mode: float) -> float:
        return self._random.triangular(low, high, mode)

    def poisson(self, lam: float) -> int:
        """Poisson sayısı. λ ≤ 30 için tam yöntem (Knuth), üstünde normal yaklaşım."""
        if lam <= 0:
            return 0
        if lam > 30:
            return max(0, round(self._random.gauss(lam, math.sqrt(lam))))
        limit = math.exp(-lam)
        count, product = 0, self._random.random()
        while product > limit:
            count += 1
            product *= self._random.random()
        return count

    def exponential(self, mean: float) -> float:
        return self._random.expovariate(1.0 / mean)

    def digits(self, count: int) -> str:
        return "".join(str(self._random.randrange(10)) for _ in range(count))

    def date_between(self, start: date, end: date) -> date:
        """[start, end] aralığında tarih (iki uç dahil)."""
        return start + timedelta(days=self._random.randint(0, (end - start).days))

    def time_on(self, day: date, hour_weights: Sequence[float] | None = None) -> datetime:
        """Günün içinde saniye çözünürlüklü zaman; saat ağırlıkları verilebilir (24 değer)."""
        hours = list(range(24))
        hour = self.weighted(hours, hour_weights) if hour_weights else self.choice(hours)
        second = self._random.randrange(3600)
        return datetime(day.year, day.month, day.day, hour, second // 60, second % 60)


class WeightedPicker:
    """Çok sayıda seçimi hızlı yapar: ağırlıkların birikimli toplamı + ikili arama."""

    def __init__(self, items: Sequence[T], weights: Sequence[float]) -> None:
        if len(items) != len(weights) or not items:
            raise ValueError("Öğe ve ağırlık listeleri boş olmamalı ve aynı uzunlukta olmalı.")
        self.items: list[Any] = list(items)
        self.cumulative: list[float] = []
        total = 0.0
        for weight in weights:
            total += weight
            self.cumulative.append(total)

    def pick(self, rng: Rng, limit: int | None = None) -> Any:
        """Rastgele öğe; ``limit`` verilirse yalnız ilk ``limit`` öğe arasından seçer."""
        count = len(self.items) if limit is None else limit
        if count <= 0:
            raise ValueError("Seçilecek öğe yok.")
        target = rng.random() * self.cumulative[count - 1]
        index = bisect.bisect_right(self.cumulative, target, 0, count - 1)
        return self.items[index]


def zipf_weights(count: int, exponent: float = 1.1) -> list[float]:
    """Zipf popülerlik ağırlıkları: k. sıradaki öğenin ağırlığı 1 / k^s."""
    return [1.0 / (rank**exponent) for rank in range(1, count + 1)]


def money(value: float | Decimal | str) -> Decimal:
    """İki ondalık basamağa yarım yukarı yuvarlanmış tutar."""
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


def price_between(rng: Rng, low: float, high: float) -> Decimal:
    """Log-tekdüze dağılımlı, "…,90" ya da "…,99" ile biten gerçekçi etiket fiyatı."""
    raw = math.exp(rng.uniform(math.log(low), math.log(high)))
    step = 10 if raw >= 100 else 1
    rounded = max(step, round(raw / step) * step)
    ending = rng.choice(["0.10", "0.01", "0.00"])  # 249,90 / 249,99 / 250,00
    return money(Decimal(rounded) - Decimal(ending))


def make_id(prefix: str, number: int, width: int) -> str:
    """Okunaklı kimlik: ``make_id("K", 7, 6)`` → "K000007"."""
    return f"{prefix}{number:0{width}d}"


def daterange(start: date, end: date) -> list[date]:
    """[start, end] aralığındaki tüm günler."""
    return [start + timedelta(days=offset) for offset in range((end - start).days + 1)]
