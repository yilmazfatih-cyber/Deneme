"""Genetik algoritma: bit dizisi nüfusunu seçilim, çaprazlama ve mutasyonla evriltir (küçük örnek).

Fikir:
    Her birey bir bit dizisidir (ör. "hangi eşyalar çantada"). Her kuşakta:
      * Seçilim (turnuva): rastgele k birey seçilir, en uygunu ebeveyn olur — iyiler daha sık
        çoğalır ama zayıflar da şans bulur (çeşitlilik korunur).
      * Çaprazlama (tek noktalı): iki ebeveyn rastgele bir noktadan kesilip parçaları değiştirilir.
      * Mutasyon: her bit küçük bir olasılıkla ters çevrilir (yeni bilgi girişi).
      * Seçkincilik: en iyi birkaç birey değişmeden sonraki kuşağa geçer (en iyi asla kaybolmaz).
    Uygunluk fonksiyonu problemi tanımlar; kısıtlar ceza ile işlenir (ör. kapasiteyi aşan çanta 0).
    Rastgele kaynak parametredir; aynı tohum aynı evrimi üretir.

Karmaşıklık: zaman O(kuşak · nüfus · (uygunluk + bit sayısı)); yer O(nüfus · bit sayısı)
Ne zaman: arama uzayı büyük, türevsiz ve "yeterince iyi" çözümün kabul edildiği problemler
    (tasarım parametreleri, zaman çizelgesi); çok amaçlı en iyileme.
Ne zaman değil: problemin yapısı biliniyorsa (DP, akış, LP) özel algoritmalar çok daha iyidir;
    GA kanıt vermez ve ayar (nüfus, oranlar) ister.
Bağımlılık: yok
Genişletme: permütasyon problemleri (TSP) için sıralı çaprazlama (OX) ve takas mutasyonu yazın;
    tek noktalı çaprazlama permütasyonu bozar.

Örnek:
    >>> import random
    >>> best, fitness = genetic_algorithm(20, sum, random.Random(4), generations=60)  # OneMax
    >>> fitness, best == [1] * 20
    (20, True)
"""

from __future__ import annotations

import random
from collections.abc import Callable, Sequence

Genome = list[int]


def _tournament(
    population: list[Genome], scores: list[float], size: int, rng: random.Random
) -> Genome:
    contenders = [rng.randrange(len(population)) for _ in range(size)]
    return population[max(contenders, key=lambda i: scores[i])]


def genetic_algorithm(
    length: int,
    fitness: Callable[[Genome], float],
    rng: random.Random,
    population_size: int = 60,
    generations: int = 100,
    crossover_rate: float = 0.9,
    mutation_rate: float | None = None,
    tournament_size: int = 3,
    elite: int = 2,
) -> tuple[Genome, float]:
    """(en iyi birey, uygunluğu). Uygunluk büyük = iyi. Mutasyon oranı varsayılanı 1/length."""
    if length < 1 or population_size < 2 or not 0 <= elite < population_size:
        raise ValueError("length ≥ 1, population_size ≥ 2 ve 0 ≤ elite < population_size olmalı")
    mutation = mutation_rate if mutation_rate is not None else 1 / length
    population = [[rng.randrange(2) for _ in range(length)] for _ in range(population_size)]
    scores = [fitness(g) for g in population]
    for _ in range(generations):
        ranked = sorted(range(population_size), key=lambda i: scores[i], reverse=True)
        next_population = [list(population[i]) for i in ranked[:elite]]  # seçkinler
        while len(next_population) < population_size:
            mother = _tournament(population, scores, tournament_size, rng)
            father = _tournament(population, scores, tournament_size, rng)
            if rng.random() < crossover_rate and length > 1:
                cut = rng.randrange(1, length)
                child = mother[:cut] + father[cut:]
            else:
                child = list(mother)
            child = [bit ^ 1 if rng.random() < mutation else bit for bit in child]
            next_population.append(child)
        population = next_population
        scores = [fitness(g) for g in population]
    best = max(range(population_size), key=lambda i: scores[i])
    return population[best], scores[best]


def knapsack_fitness(
    weights: Sequence[float], values: Sequence[float], capacity: float
) -> Callable[[Genome], float]:
    """Sırt çantası uygunluğu: kapasiteyi aşan çözüm 0 puan (ceza), değilse toplam değer."""

    def score(genome: Genome) -> float:
        weight = sum(w for w, bit in zip(weights, genome) if bit)
        return 0.0 if weight > capacity else float(sum(v for v, bit in zip(values, genome) if bit))

    return score
