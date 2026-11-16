from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.veri_yapilari.trie import Trie


def test_hand_checked_example() -> None:
    t = Trie()
    for word in ["ılık", "ilik", "ilaç", "ila", "ılgın"]:
        t.insert(word)
    t.insert("ilaç", 4)  # var olan kelimenin ağırlığı artar, sayısı artmaz
    assert len(t) == 5
    assert t.count_prefix("il") == 3 and t.count_prefix("ıl") == 2  # ı ile i ayrı harf
    assert t.words_with_prefix("ila") == ["ila", "ilaç"]
    assert t.complete("i", limit=2) == ["ilaç", "ila"]


def test_edge_cases() -> None:
    t = Trie()
    assert t.words_with_prefix("") == [] and t.complete("x") == [] and not t.remove("x")
    t.insert("")  # boş kelime de saklanabilir
    assert "" in t and len(t) == 1
    t.insert("ab")
    assert not t.remove("a")  # önek, kelime değil
    assert t.remove("ab") and t.count_prefix("a") == 0 and len(t) == 1
    with pytest.raises(ValueError):
        t.insert("x", 0)


WORDS = st.lists(st.text(alphabet="abıiç", max_size=4), max_size=40)


@given(WORDS, WORDS, st.text(alphabet="abıiç", max_size=2))
def test_matches_brute_force(added: list[str], removed: list[str], prefix: str) -> None:
    t = Trie()
    model: dict[str, int] = {}
    for word in added:
        t.insert(word)
        model[word] = model.get(word, 0) + 1
    for word in removed:
        assert t.remove(word) == (word in model)
        model.pop(word, None)
    matching = sorted(w for w in model if w.startswith(prefix))
    assert t.words_with_prefix(prefix) == matching
    assert t.count_prefix(prefix) == len(matching) and len(t) == len(model)
    best = sorted(matching, key=lambda w: (-model[w], w))[:3]
    assert t.complete(prefix, limit=3) == best
