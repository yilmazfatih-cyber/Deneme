from __future__ import annotations

from hypothesis import given

from algoritma.graf.tarjan_scc import tarjan_scc
from tests.graf.helpers import adjacency, edge_lists, reachability


def test_hand_checked_example() -> None:
    adj = [[1], [2], [0], [2, 4], [3], []]  # {0,1,2} ← {3,4}; 5 tek başına
    assert tarjan_scc(adj) == [[0, 1, 2], [3, 4], [5]]  # önce "batan" bileşen


def test_edge_cases() -> None:
    assert tarjan_scc([]) == [] and tarjan_scc([[0]]) == [[0]]
    n = 30_000  # büyük döngü: özyinelemeli sürüm burada çökerdi
    ring = [[(i + 1) % n] for i in range(n)]
    assert tarjan_scc(ring) == [list(range(n))]


@given(edge_lists(max_n=8, max_m=16))
def test_matches_mutual_reachability(graph: tuple[int, list[tuple[int, int]]]) -> None:
    n, edges = graph
    reach = reachability(n, edges, directed=True)
    components = tarjan_scc(adjacency(n, edges, directed=True))
    comp = {v: i for i, group in enumerate(components) for v in group}
    assert sorted(comp) == list(range(n))
    for u in range(n):
        for v in range(n):
            assert (comp[u] == comp[v]) == (reach[u][v] and reach[v][u])
    for u, v in edges:  # ters topolojik sıra: kenar ancak sonraki bileşenden öncekine gider
        assert comp[u] >= comp[v]
