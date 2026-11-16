from __future__ import annotations

from functools import cache

from hypothesis import given
from hypothesis import strategies as st

from algoritma.graf.hopcroft_karp import hopcroft_karp


def brute_force_matching(n_left: int, adj: list[list[int]]) -> int:
    """Her sol köşe için "eşleme" ya da "boş bırak" dene; sağ köşeler bit maskesinde."""

    @cache
    def best(u: int, used: int) -> int:
        if u == n_left:
            return 0
        result = best(u + 1, used)
        for v in adj[u]:
            if not used >> v & 1:
                result = max(result, 1 + best(u + 1, used | 1 << v))
        return result

    return best(0, 0)


def test_hand_checked_example() -> None:
    # 4 gönüllü, 4 görev; gönüllü 3 yalnız görev 0'ı yapabiliyor
    adj = [[0, 1], [1, 2], [0], [0]]
    size, match_left, match_right = hopcroft_karp(4, 4, adj)
    assert size == 3
    assert all(match_right[v] == u for u, v in enumerate(match_left) if v != -1)


def test_edge_cases() -> None:
    assert hopcroft_karp(0, 0, []) == (0, [], [])
    assert hopcroft_karp(2, 1, [[], []]) == (0, [-1, -1], [-1])
    n = 3000  # uzun artırıcı yollar: özyinelemesiz DFS
    chain = [[i, i + 1] if i + 1 < n else [i] for i in range(n)]
    assert hopcroft_karp(n, n, chain)[0] == n


@given(st.integers(0, 6), st.integers(1, 6), st.data())
def test_matches_brute_force(n_left: int, n_right: int, data: st.DataObject) -> None:
    adj = [
        data.draw(st.lists(st.integers(0, n_right - 1), max_size=4, unique=True))
        for _ in range(n_left)
    ]
    size, match_left, match_right = hopcroft_karp(n_left, n_right, adj)
    assert size == brute_force_matching(n_left, adj)
    pairs = [(u, v) for u, v in enumerate(match_left) if v != -1]
    assert len(pairs) == size and all(v in adj[u] for u, v in pairs)
    assert all(match_right[v] == u for u, v in pairs)
    assert sum(1 for u in match_right if u != -1) == size
