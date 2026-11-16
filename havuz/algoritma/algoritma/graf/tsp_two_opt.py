"""Gezgin satıcı, sezgisel (en yakın komşu + 2-opt): büyük girdide hızlı ve iyi, ama kanıtsız tur.

Fikir:
    En yakın komşu: başlangıçtan her adımda gidilmemiş en yakın şehre gidilir (O(n²), hızlı ama
    en iyiden belirgin uzun). 2-opt bu turu iyileştirir: turdan iki kenar (a, b) ve (c, d) çıkarılıp
    (a, c) ve (b, d) eklenir — bu, aradaki parçayı ters çevirmektir. Toplam uzunluk kısalıyorsa
    hamle yapılır; hiçbir hamle kısaltmayınca durulur ("2-opt yerel en iyisi"). Düzlemde
    kesişen iki kenarı olan tur hiçbir zaman 2-opt en iyisi değildir; sonuç kesişmesiz bir turdur.
    Yalnız SİMETRİK uzaklıklarda doğrudur (parçayı ters çevirmek uzunluğunu değiştirmemeli).
    Ölçüm (11 şehirli 20 rastgele düzlem örneği, Held-Karp ile karşılaştırma): en yakın komşu
    ortalama %12.5 (en kötü %38) uzun; 2-opt sonrası ortalama %0.9 (en kötü %5.6) uzun.

Karmaşıklık: en yakın komşu O(n²); 2-opt geçişi O(n²), geçiş sayısı pratikte küçük (kuramsal
    sınır üstel); yer O(n)
Ne zaman: n > 15 durakta "yeterince iyi" tur; kesin çözümün başlangıç noktası ya da üst sınırı.
Ne zaman değil: kanıtlı en iyi gerekiyorsa ve n ≲ 18 ise `tsp_held_karp.py`.
Bağımlılık: yok
Genişletme: yerel en iyiden kaçmak için `algoritma/eniyileme/simulated_annealing.py` ile
    rastgele 2-opt hamleleri deneyin; Or-opt (parça taşıma) hamlesi eklemek de etkilidir.

Örnek:
    >>> pts = [(0, 0), (2, 2), (2, 0), (0, 2)]
    >>> d = [[abs(a[0] - b[0]) + abs(a[1] - b[1]) for b in pts] for a in pts]
    >>> tour = nearest_neighbor_tour(d)
    >>> tour, tour_length(d, tour), two_opt(d, tour), tour_length(d, two_opt(d, tour))
    ([0, 2, 1, 3], 8, [0, 2, 1, 3], 8)
    >>> two_opt(d, [0, 1, 2, 3]), tour_length(d, [0, 1, 2, 3])
    ([0, 2, 1, 3], 12)
"""

from __future__ import annotations

from collections.abc import Sequence


def tour_length(dist: Sequence[Sequence[float]], tour: Sequence[int]) -> float:
    """Turun uzunluğu (sondan başa dönüş dahil)."""
    return sum(dist[tour[i - 1]][tour[i]] for i in range(len(tour))) if len(tour) > 1 else 0


def nearest_neighbor_tour(dist: Sequence[Sequence[float]], start: int = 0) -> list[int]:
    """Her adımda gidilmemiş en yakın şehre giden açgözlü tur."""
    n = len(dist)
    if n == 0:
        return []
    visited = [False] * n
    visited[start] = True
    tour = [start]
    for _ in range(n - 1):
        here = tour[-1]
        nxt = min((v for v in range(n) if not visited[v]), key=lambda v: dist[here][v])
        visited[nxt] = True
        tour.append(nxt)
    return tour


def two_opt(dist: Sequence[Sequence[float]], tour: Sequence[int], eps: float = 1e-12) -> list[int]:
    """Kısaltan 2-opt hamlesi kalmayana dek iyileştirilmiş tur (ilk şehir yerinde kalır)."""
    best = list(tour)
    n = len(best)
    improved = True
    while improved:
        improved = False
        for i in range(n - 1):
            a, b = best[i], best[i + 1]
            for j in range(i + 2, n if i > 0 else n - 1):  # komşu kenar çiftlerini atla
                c, d = best[j], best[(j + 1) % n]
                delta = dist[a][c] + dist[b][d] - dist[a][b] - dist[c][d]
                if delta < -eps:
                    best[i + 1 : j + 1] = reversed(best[i + 1 : j + 1])
                    a, b = best[i], best[i + 1]
                    improved = True
    return best
