from __future__ import annotations

from hypothesis import given

from algoritma.graf.kosaraju_scc import component_of, kosaraju_scc
from tests.graf.helpers import adjacency, edge_lists, reachability


def test_hand_checked_example() -> None:
    adj = [[1], [2], [0], [2, 4], [3], []]
    assert kosaraju_scc(adj) == [[5], [3, 4], [0, 1, 2]]  # önce kaynak bileşenler
    comp = component_of(adj)
    assert comp[0] == comp[1] == comp[2] and comp[3] == comp[4] and comp[3] < comp[0]


def test_edge_cases() -> None:
    assert kosaraju_scc([]) == [] and component_of([[0]]) == [0]
    n = 30_000
    ring = [[(i + 1) % n] for i in range(n)]
    assert kosaraju_scc(ring) == [list(range(n))]


@given(edge_lists(max_n=8, max_m=16))
def test_matches_mutual_reachability(graph: tuple[int, list[tuple[int, int]]]) -> None:
    n, edges = graph
    reach = reachability(n, edges, directed=True)
    comp = component_of(adjacency(n, edges, directed=True))
    for u in range(n):
        for v in range(n):
            assert (comp[u] == comp[v]) == (reach[u][v] and reach[v][u])
    for u, v in edges:  # topolojik sıra: kenarlar küçük numaralı bileşenden büyüğe gider
        assert comp[u] <= comp[v]
    groups = kosaraju_scc(adjacency(n, edges, directed=True))
    assert sorted(v for g in groups for v in g) == list(range(n))
