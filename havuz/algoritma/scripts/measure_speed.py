"""Bu makinede saf Python'un hızını ölçer: "1 saniyede kaç işlem" ve büyük-O tahmin tablosu.

Kullanım (temel klasöründen):
    python scripts/measure_speed.py            ölçer ve Markdown tablosu yazdırır (~10–20 sn)

Ölçüm yöntemi: her deneme `time.perf_counter` ile süresi ölçülen, n kez dönen bir döngüdür;
5 tekrarın EN KISASI alınır (arka plan gürültüsünü azaltmak için). Sonuçlar makineye, Python
sürümüne ve o anki yüke bağlıdır; docs/KARMASIKLIK.md'deki sayılar bir kez alınmış örnektir.
Genişletme: yeni bir ölçüm için `BENCHMARKS` listesine (ad, işlev) ekleyin; işlev n alır.
"""

from __future__ import annotations

import heapq
import platform
import random
import sys
import time
from collections.abc import Callable

N = 1_000_000


def _loop_add(n: int) -> None:
    total = 0
    for i in range(n):
        total += i


def _list_index(n: int) -> None:
    data = list(range(1000))
    total = 0
    for i in range(n):
        total += data[i % 1000]


def _dict_get(n: int) -> None:
    table = {i: i for i in range(1000)}
    total = 0
    for i in range(n):
        total += table[i % 1000]


def _heap_push_pop(n: int) -> None:
    heap: list[int] = []
    for i in range(n // 2):
        heapq.heappush(heap, (i * 7919) % 1000)
    for _ in range(n // 2):
        heapq.heappop(heap)


def _sorted_builtin(n: int) -> None:
    rng = random.Random(0)
    sorted(rng.random() for _ in range(n))


BENCHMARKS: list[tuple[str, Callable[[int], None]]] = [
    ("for döngüsü + toplama", _loop_add),
    ("liste dizinleme", _list_index),
    ("sözlük okuma", _dict_get),
    ("heapq push/pop (yarı yarıya)", _heap_push_pop),
    ("sorted() (n rastgele sayı)", _sorted_builtin),
]


def measure(function: Callable[[int], None], n: int, repeats: int = 5) -> float:
    """Saniyede işlem sayısı (en iyi tekrar)."""
    best = float("inf")
    for _ in range(repeats):
        started = time.perf_counter()
        function(n)
        best = min(best, time.perf_counter() - started)
    return n / best


def main() -> int:
    print(f"Python {sys.version.split()[0]}, {platform.machine()}, {platform.system()}")
    print()
    print("| İşlem | 1 saniyede (yaklaşık) |")
    print("| --- | --- |")
    rates = {}
    for name, function in BENCHMARKS:
        rate = measure(function, N)
        rates[name] = rate
        print(f"| {name} | {rate / 1e6:.1f} milyon |")
    base = rates["liste dizinleme"]
    print()
    print(f"Temel hız (liste dizinleme): ~{base / 1e6:.0f} milyon basit adım/sn.")
    print("Her algoritma adımı ~1 basit adım sayılırsa 1 saniyede yetişen n (iyimser sınır):")
    print()
    print("| Karmaşıklık | n (1 sn) |")
    print("| --- | --- |")
    classes: list[tuple[str, Callable[[int], int]]] = [
        ("O(n)", lambda n: n),
        ("O(n log n)", lambda n: n * max(1, n.bit_length())),
        ("O(n²)", lambda n: n * n),
        ("O(n³)", lambda n: n**3),
        ("O(2ⁿ)", lambda n: 2**n),
        ("O(n!)", _factorial),
    ]
    for label, steps in classes:
        n = 1
        while steps(n * 2) <= base:
            n *= 2
        low, high = n, n * 2  # ikili arama ile sınırı inceltin
        while low + 1 < high:
            mid = (low + high) // 2
            if steps(mid) <= base:
                low = mid
            else:
                high = mid
        print(f"| {label} | ~{low:,} |".replace(",", "."))
    print()
    print("Kütüphaneden gerçek algoritmalar (tek çalıştırma, saniye):")
    print()
    print("| Algoritma | Girdi | Süre |")
    print("| --- | --- | --- |")
    for label, size, seconds in _library_timings():
        print(f"| {label} | {size} | {seconds:.2f} sn |")
    return 0


def _library_timings() -> list[tuple[str, str, float]]:
    """Bu kütüphanenin birkaç algoritmasını gerçekçi boyutlarda bir kez çalıştırıp süre ölçer."""
    sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))
    from algoritma.dizgi.kmp import kmp_search
    from algoritma.dp.lis import lis_indices
    from algoritma.graf.dijkstra import dijkstra
    from algoritma.siralama.merge_sort import merge_sort

    rng = random.Random(1)
    data = [rng.random() for _ in range(100_000)]
    n_nodes, n_edges = 20_000, 100_000
    adj: list[list[tuple[int, float]]] = [[] for _ in range(n_nodes)]
    for _ in range(n_edges):
        adj[rng.randrange(n_nodes)].append((rng.randrange(n_nodes), rng.random()))
    text = "".join(rng.choice("ab") for _ in range(1_000_000))
    runs: list[tuple[str, str, Callable[[], object]]] = [
        ("merge_sort (O(n log n))", "n = 100 000", lambda: merge_sort(data)),
        ("lis_indices (O(n log n))", "n = 100 000", lambda: lis_indices(data)),
        ("dijkstra (O((n+m) log n))", "n = 20 000, m = 100 000", lambda: dijkstra(adj, 0)),
        ("kmp_search (O(n + m))", "n = 1 000 000", lambda: kmp_search(text, "abba")),
    ]
    timings = []
    for label, size, run in runs:
        started = time.perf_counter()
        run()
        timings.append((label, size, time.perf_counter() - started))
    return timings


def _factorial(n: int) -> int:
    result = 1
    for k in range(2, n + 1):
        result *= k
    return result


if __name__ == "__main__":
    raise SystemExit(main())
