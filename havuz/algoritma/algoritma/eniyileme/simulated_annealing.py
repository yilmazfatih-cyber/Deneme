"""Tavlama benzetimi: kötüleşen hamleleri de azalan olasılıkla kabul edip yerel en iyiden kaçar.

Fikir:
    Metal tavlamasından esinlenir: yüksek sıcaklıkta atomlar serbestçe dolaşır, yavaş soğuyunca
    düşük enerjili düzene oturur. Arama her adımda rastgele bir komşu durum üretir. Maliyet
    düşüyorsa hamle kabul edilir; artıyorsa (Δ > 0) yine de e^(−Δ/T) olasılıkla kabul edilir.
    T (sıcaklık) başta yüksektir (çok keşif), adım adım geometrik olarak düşürülür
    (T ← T · alfa); sonda arama, yalnız iyileştiren hamleleri kabul eden tepe tırmanmaya dönüşür.
    Görülen en iyi durum ayrıca saklanır. Rastgele kaynak parametredir (tohumlu, yeniden
    üretilebilir).
    Örnek kullanım: gezgin satıcı turunda rastgele bir parçayı ters çevirme (2-opt hamlesi).

Karmaşıklık: zaman O(adım · (komşu üretimi + maliyet)); yer O(durum boyutu)
Ne zaman: büyük, engebeli arama uzayları (zaman çizelgesi, yerleşim, TSP) ve "yeterince iyi"
    çözümün kabul edildiği durumlar.
Ne zaman değil: kanıtlı en iyi gerekiyorsa (dal-sınır, DP, ILP); maliyet hesabı çok pahalıysa
    (binlerce adım gerekir).
Bağımlılık: yok
Genişletme: maliyeti artımlı hesaplayın (yalnız değişen parça): adım başına maliyet O(n)'den
    O(1)'e iner; başlangıç sıcaklığını "ilk hamlelerin ~%80'i kabul edilsin" diye ayarlayın.

Örnek:
    >>> import random
    >>> f = lambda x: (x - 7) ** 2 + 3  # en küçük değeri x = 7'de
    >>> step = lambda x, rng: x + rng.choice([-1, 1])
    >>> simulated_annealing(50, step, f, random.Random(0), steps=2000)
    (7, 3)
"""

from __future__ import annotations

import math
import random
from collections.abc import Callable
from typing import TypeVar

S = TypeVar("S")


def simulated_annealing(
    initial: S,
    neighbor: Callable[[S, random.Random], S],
    cost: Callable[[S], float],
    rng: random.Random,
    steps: int = 10_000,
    start_temperature: float = 10.0,
    end_temperature: float = 1e-3,
) -> tuple[S, float]:
    """(görülen en iyi durum, maliyeti). Sıcaklık start → end geometrik azalır."""
    if steps < 1 or not 0 < end_temperature <= start_temperature:
        raise ValueError("steps ≥ 1 ve 0 < end_temperature ≤ start_temperature olmalı")
    alpha = (end_temperature / start_temperature) ** (1 / max(1, steps - 1))
    current, current_cost = initial, cost(initial)
    best, best_cost = current, current_cost
    temperature = start_temperature
    for _ in range(steps):
        candidate = neighbor(current, rng)
        candidate_cost = cost(candidate)
        delta = candidate_cost - current_cost
        if delta <= 0 or rng.random() < math.exp(-delta / temperature):
            current, current_cost = candidate, candidate_cost
            if current_cost < best_cost:
                best, best_cost = current, current_cost
        temperature *= alpha
    return best, best_cost
