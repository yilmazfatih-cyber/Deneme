"""Tepe tırmanma (+ rastgele yeniden başlatma): en iyi komşuya geç, takılınca yeniden başla.

Fikir:
    En dik çıkış: bulunduğun durumun TÜM komşuları değerlendirilir, en iyisi şimdikinden iyiyse
    ona geçilir; hiçbir komşu daha iyi değilse yerel en iyidesindir ve durulur. Basit ve hızlıdır
    ama engebeli bir arazide en yakın tepede takılır. Rastgele yeniden başlatma: farklı rastgele
    başlangıçlardan k kez tırman, en iyisini al; k arttıkça küresel en iyiyi bulma olasılığı artar.
    Örnek: N vezirde "çakışan çift sayısını en aza indir" (puan = −çakışma); her komşu bir
    vezirin kendi satırında başka sütuna taşınmasıdır.

Karmaşıklık: adım başına O(komşu sayısı · puan hesabı); adım sayısı probleme bağlı; yer O(durum)
Ne zaman: hızlı "yeterince iyi" çözüm; iyi bir başlangıç noktasını cilalamak (2-opt de bir tepe
    tırmanmadır); büyük N vezir (min-çakışma).
Ne zaman değil: yerel en iyiler çok ve derinse `simulated_annealing.py` ya da
    `genetic_algorithm.py`; kanıtlı en iyi gerekiyorsa kesin yöntemler.
Bağımlılık: yok
Genişletme: komşular çok fazlaysa "ilk iyileştireni al" (first-choice) sürümüne geçin; yan
    hamlelere (eşit puan) sınırlı izin vermek düzlüklerden çıkmaya yardım eder.

Örnek:
    >>> import random
    >>> state, score = random_restart_hill_climb(
    ...     lambda rng: [rng.randrange(8) for _ in range(8)], queen_neighbors, queen_score,
    ...     random.Random(3), restarts=50)
    >>> score  # 0 çakışma: geçerli bir 8 vezir yerleşimi bulundu
    0
"""

from __future__ import annotations

import random
from collections.abc import Callable, Iterable
from typing import TypeVar

S = TypeVar("S")


def hill_climb(
    initial: S, neighbors: Callable[[S], Iterable[S]], score: Callable[[S], float]
) -> tuple[S, float]:
    """En dik çıkış: yerel en iyiye ulaşınca (durum, puan) döndürür (puan büyük = iyi)."""
    current, current_score = initial, score(initial)
    while True:
        best, best_score = current, current_score
        for candidate in neighbors(current):
            candidate_score = score(candidate)
            if candidate_score > best_score:
                best, best_score = candidate, candidate_score
        if best_score <= current_score:
            return current, current_score
        current, current_score = best, best_score


def random_restart_hill_climb(
    random_state: Callable[[random.Random], S],
    neighbors: Callable[[S], Iterable[S]],
    score: Callable[[S], float],
    rng: random.Random,
    restarts: int = 20,
    good_enough: float | None = None,
) -> tuple[S, float]:
    """`restarts` rastgele başlangıçtan tırman; en iyisini döndür (hedefe ulaşınca erken dur)."""
    if restarts < 1:
        raise ValueError("en az bir başlangıç gerekir")
    best: tuple[S, float] | None = None
    for _ in range(restarts):
        state, value = hill_climb(random_state(rng), neighbors, score)
        if best is None or value > best[1]:
            best = (state, value)
        if good_enough is not None and best[1] >= good_enough:
            break
    assert best is not None
    return best


def queen_score(rows: list[int]) -> float:
    """N vezir puanı: −(tehdit eden çift sayısı); rows[i] = i. sütundaki vezirin satırı."""
    n = len(rows)
    attacks = sum(
        1
        for i in range(n)
        for j in range(i + 1, n)
        if rows[i] == rows[j] or abs(rows[i] - rows[j]) == j - i
    )
    return -attacks


def queen_neighbors(rows: list[int]) -> Iterable[list[int]]:
    """Bir vezirin kendi sütununda başka satıra taşındığı tüm durumlar."""
    for column in range(len(rows)):
        for row in range(len(rows)):
            if row != rows[column]:
                yield [*rows[:column], row, *rows[column + 1 :]]
