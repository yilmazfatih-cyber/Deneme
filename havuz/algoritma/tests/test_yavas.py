"""Yavaş stres testleri: büyük girdilerde başvuru gerçeklemeleriyle karşılaştırma.

Hızlı denetimde atlanır; `python scripts/check.py --uzun` ile koşar (`@pytest.mark.yavas`).
Her test bir modülü, küçük testlerin yakalayamayacağı ölçekte (derin özyineleme, büyük n,
çok sayıda işlem) sınar.
Genişletme: yeni bir stres testi eklerken `@pytest.mark.yavas` işaretini unutmayın.
"""

from __future__ import annotations

import heapq
import random
from collections import Counter

import pytest

from algoritma.dizgi.kmp import kmp_search
from algoritma.dizgi.suffix_array_search import SuffixArrayIndex
from algoritma.eniyileme.n_queens import count_n_queens
from algoritma.graf.dijkstra import dijkstra
from algoritma.graf.dinic import Dinic
from algoritma.graf.tsp_held_karp import held_karp
from algoritma.graf.tsp_two_opt import nearest_neighbor_tour, tour_length, two_opt
from algoritma.sayilar.miller_rabin import is_prime
from algoritma.sayilar.ntt import MOD, multiply_polynomials_ntt
from algoritma.sayilar.sieve import primes_up_to, segmented_primes
from algoritma.siralama.merge_sort import merge_sort
from algoritma.siralama.quick_sort import quick_sort
from algoritma.veri_yapilari.avl_tree import AVLTree
from algoritma.veri_yapilari.b_tree import BTree
from algoritma.veri_yapilari.segment_tree import LazySegmentTree
from algoritma.veri_yapilari.treap import Treap

pytestmark = pytest.mark.yavas


def test_balanced_trees_with_many_operations() -> None:
    rng = random.Random(1)
    avl = AVLTree[int, int]()
    treap: Treap[int] = Treap(rng=random.Random(2))
    btree: BTree[int] = BTree(min_degree=4)
    model: dict[int, int] = {}
    for step in range(30_000):
        key = rng.randrange(5_000)
        if rng.random() < 0.6:
            avl[key] = step
            treap.insert(key)
            btree.insert(key)
            model[key] = step
        elif key in model:
            del avl[key]
            treap.remove(key)
            btree.remove(key)
            del model[key]
    assert list(avl.items()) == sorted(model.items()) and avl.is_valid()
    assert list(treap) == sorted(model) == list(btree) and btree.is_valid()


def test_sorting_large_inputs() -> None:
    rng = random.Random(3)
    data = [rng.randrange(-(10**9), 10**9) for _ in range(200_000)]
    assert quick_sort(data, rng=random.Random(4)) == sorted(data) == merge_sort(data)


def test_segment_tree_many_updates() -> None:
    rng = random.Random(5)
    n = 2_000
    values = [rng.randrange(-100, 100) for _ in range(n)]
    tree = LazySegmentTree(values)
    for _ in range(3_000):
        lo, hi = sorted((rng.randrange(n + 1), rng.randrange(n + 1)))
        if rng.random() < 0.5:
            delta = rng.randrange(-50, 50)
            tree.add(lo, hi, delta)
            for i in range(lo, hi):
                values[i] += delta
        elif lo < hi:
            assert tree.range_sum(lo, hi) == sum(values[lo:hi])
            assert tree.range_min(lo, hi) == min(values[lo:hi])


def test_dijkstra_on_large_random_graph() -> None:
    rng = random.Random(6)
    n = 3_000
    adj: list[list[tuple[int, float]]] = [[] for _ in range(n)]
    for _ in range(15_000):
        adj[rng.randrange(n)].append((rng.randrange(n), rng.randrange(1, 100)))
    dist, _ = dijkstra(adj, 0)
    # başvuru: tembelsiz, "kesinleşmemiş en küçük" seçen basit Dijkstra (heapq ile ama ayrı kod)
    best = [float("inf")] * n
    best[0] = 0
    done = [False] * n
    heap: list[tuple[float, int]] = [(0, 0)]
    while heap:
        d, u = heapq.heappop(heap)
        if done[u]:
            continue
        done[u] = True
        for v, w in adj[u]:
            if d + w < best[v]:
                best[v] = d + w
                heapq.heappush(heap, (best[v], v))
    assert dist == best


def test_max_flow_matches_min_cut_on_layered_network() -> None:
    rng = random.Random(7)
    layers, width = 6, 8
    edges: list[tuple[int, int, int]] = []
    for i in range(width):
        edges.append((0, 2 + i, rng.randrange(1, 20)))
        edges.append((2 + (layers - 1) * width + i, 1, rng.randrange(1, 20)))
    for layer in range(layers - 1):
        for a in range(width):
            for b in range(width):
                if rng.random() < 0.4:
                    u, v = 2 + layer * width + a, 2 + (layer + 1) * width + b
                    edges.append((u, v, rng.randrange(1, 9)))
    net = Dinic(2 + layers * width)
    for u, v, c in edges:
        net.add_edge(u, v, c)
    flow = net.max_flow(0, 1)
    side = set(net.min_cut_side(0))
    cut = sum(c for u, v, c in edges if u in side and v not in side)
    assert 1 not in side and flow == cut  # en büyük akış = en küçük kesim (kanıt sertifikası)


def test_tsp_heuristic_vs_exact() -> None:
    rng = random.Random(8)
    points = [(rng.uniform(0, 100), rng.uniform(0, 100)) for _ in range(11)]
    dist = [[((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5 for b in points] for a in points]
    exact, tour = held_karp(dist)
    heuristic = tour_length(dist, two_opt(dist, nearest_neighbor_tour(dist)))
    assert abs(tour_length(dist, tour) - exact) < 1e-9 and exact <= heuristic + 1e-9
    assert heuristic <= 1.3 * exact  # 2-opt pratikte %5–10 içinde; gevşek bir üst sınır


def test_number_theory_at_scale() -> None:
    primes = primes_up_to(2_000_000)
    assert len(primes) == 148_933  # π(2·10⁶)
    window = segmented_primes(10**12, 10**12 + 10_000)
    assert window == [p for p in range(10**12, 10**12 + 10_000) if is_prime(p)]
    assert count_n_queens(10) == 724


def test_ntt_large_product() -> None:
    rng = random.Random(9)
    a = [rng.randrange(MOD) for _ in range(3_000)]
    b = [rng.randrange(MOD) for _ in range(2_000)]
    product = multiply_polynomials_ntt(a, b)
    for k in rng.sample(range(len(product)), 25):  # rastgele katsayıları doğrudan hesapla
        direct = sum(a[i] * b[k - i] for i in range(max(0, k - len(b) + 1), min(k, len(a) - 1) + 1))
        assert product[k] == direct % MOD


def test_text_search_on_long_text() -> None:
    rng = random.Random(10)
    text = "".join(rng.choice("açık") for _ in range(50_000))
    index = SuffixArrayIndex(text)
    for _ in range(30):
        length = rng.randrange(1, 6)
        start = rng.randrange(len(text) - length)
        pattern = text[start : start + length]
        assert index.find_all(pattern) == kmp_search(text, pattern)
    counts = Counter(text[i : i + 2] for i in range(len(text) - 1))
    for pair, count in counts.most_common(3):
        assert index.count(pair) == count
