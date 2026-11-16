from __future__ import annotations

from collections import deque
from functools import cache

from hypothesis import given
from hypothesis import strategies as st

from algoritma.dizgi.levenshtein import damerau_levenshtein, damerau_levenshtein_osa, levenshtein


def _recursive(a: str, b: str, transpose: bool) -> int:
    """Başvuru: tanımın önbellekli özyinelemesi (transpose=True → OSA)."""

    @cache
    def go(i: int, j: int) -> int:
        if i == 0 or j == 0:
            return i + j
        best = min(go(i - 1, j) + 1, go(i, j - 1) + 1, go(i - 1, j - 1) + (a[i - 1] != b[j - 1]))
        if transpose and i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
            best = min(best, go(i - 2, j - 2) + 1)
        return best

    return go(len(a), len(b))


def _bfs_true_damerau(a: str, b: str) -> int:
    """Başvuru: gerçek Damerau = ekle/sil/değiştir/bitişik yer değiştirme işlemleriyle en kısa
    dönüşüm. Dizgiler grafının üstünde BFS (yalnız çok kısa dizgilerde)."""
    alphabet = sorted(set(a + b))
    limit = len(a) + len(b)
    seen = {a: 0}
    queue = deque([a])
    while queue:
        s = queue.popleft()
        if s == b:
            return seen[s]
        nxt = set()
        for i in range(len(s) + 1):
            for c in alphabet:
                nxt.add(s[:i] + c + s[i:])
        for i in range(len(s)):
            nxt.add(s[:i] + s[i + 1 :])
            for c in alphabet:
                nxt.add(s[:i] + c + s[i + 1 :])
            if i + 1 < len(s):
                nxt.add(s[:i] + s[i + 1] + s[i] + s[i + 2 :])
        for t in nxt:
            if t not in seen and len(t) <= limit:
                seen[t] = seen[s] + 1
                queue.append(t)
    raise AssertionError("ulaşılamadı")


def test_hand_checked_example() -> None:
    assert levenshtein("Ankara", "ankara") == 1  # büyük/küçük harf farkı da bir işlem
    assert levenshtein("pazartesi", "perşembe") == 7
    assert damerau_levenshtein("teşekkürler", "teşekkrüler") == 1  # bitişik takla
    assert damerau_levenshtein_osa("abcdef", "badcfe") == 3


def test_edge_cases() -> None:
    for distance in (levenshtein, damerau_levenshtein_osa, damerau_levenshtein):
        assert distance("", "") == 0 and distance("abc", "") == 3 and distance("", "ab") == 2
        assert distance("aynı", "aynı") == 0


@given(st.text(alphabet="abı", max_size=8), st.text(alphabet="abı", max_size=8))
def test_matches_recursive_definitions(a: str, b: str) -> None:
    assert levenshtein(a, b) == _recursive(a, b, transpose=False) == levenshtein(b, a)
    assert damerau_levenshtein_osa(a, b) == _recursive(a, b, transpose=True)
    assert damerau_levenshtein(a, b) <= damerau_levenshtein_osa(a, b) <= levenshtein(a, b)


@given(st.text(alphabet="abc", max_size=4), st.text(alphabet="abc", max_size=4))
def test_true_damerau_matches_bfs(a: str, b: str) -> None:
    assert damerau_levenshtein(a, b) == _bfs_true_damerau(a, b)
