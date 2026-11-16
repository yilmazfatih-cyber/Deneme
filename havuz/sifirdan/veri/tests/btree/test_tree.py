"""B+ ağacı: temel işlemler, bölünme/birleşme, sayfa yeniden kullanımı, önbellek, kalıcılık,
doğrulayıcı."""

from __future__ import annotations

import random
from pathlib import Path

import pytest
from hypothesis import given
from hypothesis import strategies as st

from btree import BPlusTree, InvariantError, PagerError, check, height, render
from btree.__main__ import main as cli_main
from btree.node import Node, encode


def _key(number: int) -> bytes:
    return f"k{number:05d}".encode()


def test_basic_operations_and_range() -> None:
    tree = BPlusTree.in_memory(page_size=128)
    for number in range(50):
        tree.put(_key(number), str(number).encode())
    tree.put(_key(7), b"yedi")  # değiştirme sayaç artırmaz
    assert len(tree) == 50
    assert tree.get(_key(7)) == b"yedi"
    assert tree.get(b"yok") is None
    assert tree.delete(_key(8)) is True
    assert tree.delete(_key(8)) is False
    assert [k for k, _ in tree.range(_key(5), _key(10))] == [_key(n) for n in (5, 6, 7, 9)]
    assert list(tree.range(b"z")) == []
    check(tree)


def test_many_inserts_split_and_deletes_merge_back_to_single_leaf() -> None:
    rng = random.Random(3)
    tree = BPlusTree.in_memory(page_size=128, cache_pages=8)
    numbers = list(range(1500))
    rng.shuffle(numbers)
    for number in numbers:
        tree.put(_key(number), b"v" * (number % 9))
    check(tree)
    assert height(tree) >= 4
    assert [k for k, _ in tree.range()] == [_key(n) for n in range(1500)]
    pages_at_peak = tree.pager.page_count
    insert_order = list(numbers)
    rng.shuffle(numbers)
    for index, number in enumerate(numbers):
        assert tree.delete(_key(number))
        if index % 100 == 0:
            check(tree)
    check(tree)
    assert len(tree) == 0 and height(tree) == 1
    assert len(tree.pager.free_pages()) == pages_at_peak - 2  # başlık ve kök dışında hepsi boş
    # Aynı sırayla yeniden ekleyince aynı biçimde ağaç kurulur; boşalan sayfalar yeniden
    # kullanıldığı için dosya büyümez.
    for number in insert_order:
        tree.put(_key(number), b"v" * (number % 9))
    assert tree.pager.page_count == pages_at_peak
    assert tree.pager.free_pages() == []
    check(tree)


def _delete_heavy_workload(seed: int, page_size: int) -> tuple[BPlusTree, dict[bytes, bytes]]:
    """Uzun ve kısa anahtarlar karışık bir ağaç kurar, sonra çoğunu siler (arada az ekleme)."""
    rng = random.Random(seed)
    tree = BPlusTree.in_memory(page_size=page_size)
    model: dict[bytes, bytes] = {}

    def random_key() -> bytes:
        letter = bytes([rng.randrange(97, 123)])
        return letter * rng.choice([1, 2, 24, 28]) + str(rng.randrange(1000)).encode()

    for _ in range(2500):
        key, value = random_key(), b"x" * rng.randrange(0, 3)
        tree.put(key, value)
        model[key] = value
    doomed = list(model)
    rng.shuffle(doomed)
    for index, key in enumerate(doomed):
        assert tree.delete(key)
        del model[key]
        if index % 3 == 0:
            extra = random_key()
            tree.put(extra, b"y")
            model[extra] = b"y"
    return tree, model


def test_delete_paths_merge_redistribute_and_split(monkeypatch: pytest.MonkeyPatch) -> None:
    # Değişken uzunluklu anahtarlarda ödünç alma ayırıcıyı büyütüp üst düğümü TAŞIRABİLİR; o zaman
    # silme sırasında bölünme gerekir. Test bu yolların gerçekten koşulduğunu da sayarak kanıtlar.
    counts = {"merge": 0, "redistribute": 0, "split_during_delete": 0}
    deleting = [False]
    original_split, original_delete = BPlusTree._split, BPlusTree.delete
    original_merge, original_redistribute = BPlusTree._merge, BPlusTree._redistribute

    def counting_split(self: BPlusTree, node: Node) -> tuple[bytes, int]:
        counts["split_during_delete"] += deleting[0]
        return original_split(self, node)

    def flagged_delete(self: BPlusTree, key: bytes) -> bool:
        deleting[0] = True
        try:
            return original_delete(self, key)
        finally:
            deleting[0] = False

    def counting_merge(self: BPlusTree, left: Node, right: Node, separator: bytes) -> None:
        counts["merge"] += 1
        original_merge(self, left, right, separator)

    def counting_redistribute(self: BPlusTree, left: Node, right: Node, sep: bytes) -> bytes:
        counts["redistribute"] += 1
        return original_redistribute(self, left, right, sep)

    monkeypatch.setattr(BPlusTree, "_split", counting_split)
    monkeypatch.setattr(BPlusTree, "delete", flagged_delete)
    monkeypatch.setattr(BPlusTree, "_merge", counting_merge)
    monkeypatch.setattr(BPlusTree, "_redistribute", counting_redistribute)
    for seed in range(3):
        tree, model = _delete_heavy_workload(seed, page_size=160)
        check(tree)
        assert list(tree.range()) == sorted(model.items())
    assert counts["merge"] > 100 and counts["redistribute"] > 50
    assert counts["split_during_delete"] > 0


def test_entry_size_limit_has_clear_message() -> None:
    tree = BPlusTree.in_memory(page_size=128)
    with pytest.raises(ValueError, match="en çok"):
        tree.put(b"k", b"x" * 100)


def test_tiny_cache_evicts_but_stays_correct() -> None:
    tree = BPlusTree.in_memory(page_size=128, cache_pages=2)
    for number in range(400):
        tree.put(_key(number), b"deger")
    assert all(tree.get(_key(n)) == b"deger" for n in range(400))
    assert tree.pager.stats["evictions"] > 100
    assert tree.pager.stats["misses"] > 0 and tree.pager.stats["hits"] > 0
    check(tree)


def test_persistence_on_real_file(tmp_path: Path) -> None:
    path = tmp_path / "agac.db"
    tree = BPlusTree.open(path, page_size=256)
    for number in range(300):
        tree.put(_key(number), f"değer-{number}".encode())
    tree.delete(_key(10))
    tree.close()
    assert path.stat().st_size % 256 == 0
    reopened = BPlusTree.open(path, page_size=256)
    assert len(reopened) == 299
    assert reopened.get(_key(11)) == "değer-11".encode()
    assert reopened.get(_key(10)) is None
    check(reopened)
    reopened.close()
    with pytest.raises(PagerError, match="sayfa boyu 256"):
        BPlusTree.open(path, page_size=512)
    path.write_bytes(b"bu bir agac dosyasi degil" * 20)
    with pytest.raises(PagerError):
        BPlusTree.open(path, page_size=256)


def test_validator_catches_broken_trees() -> None:
    tree = BPlusTree.in_memory(page_size=128)
    for number in range(60):
        tree.put(_key(number), b"v")
    leaf = tree.load(tree.load(tree.pager.root).children[0])
    leaf.keys[0], leaf.keys[1] = leaf.keys[1], leaf.keys[0]
    tree.pager.write(leaf.page_id, encode(leaf, 128))
    with pytest.raises(InvariantError, match="kesin artan"):
        check(tree)
    leaf.keys[0], leaf.keys[1] = leaf.keys[1], leaf.keys[0]
    leaf.next_leaf = 0
    tree.pager.write(leaf.page_id, encode(leaf, 128))
    with pytest.raises(InvariantError, match="zincir"):
        check(tree)


def test_render_and_cli(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    tree = BPlusTree.in_memory(page_size=96)
    for number in range(20):
        tree.put(_key(number), b"v")
    drawing = render(tree)
    assert drawing.count("\n") == height(tree) - 1
    path = str(tmp_path / "cli.db")
    assert cli_main([path, "--sayfa", "128", "doldur", "200"]) == 0
    assert cli_main([path, "--sayfa", "128", "ekle", "çilek", "kırmızı"]) == 0
    assert cli_main([path, "--sayfa", "128", "oku", "çilek"]) == 0
    assert capsys.readouterr().out.strip() == "kırmızı"
    assert cli_main([path, "--sayfa", "128", "denetle"]) == 0
    assert "201 anahtar" in capsys.readouterr().out
    assert cli_main([path, "--sayfa", "128", "oku", "yok"]) == 1


KEYS = st.binary(min_size=0, max_size=12)
OPS = st.lists(
    st.one_of(
        st.tuples(st.just("put"), KEYS, st.binary(max_size=10)),
        st.tuples(st.just("delete"), KEYS, st.just(b"")),
        st.tuples(st.just("range"), KEYS, KEYS),
    ),
    max_size=250,
)


@given(st.sampled_from([64, 96, 128, 200]), st.integers(1, 6), OPS)
def test_matches_sorted_model(
    page_size: int, cache_pages: int, ops: list[tuple[str, bytes, bytes]]
) -> None:
    # Kısa dizilerde uç durumlar (boş anahtar, 0xFF baytları) ve küçültülebilir karşı örnekler.
    tree = BPlusTree.in_memory(page_size=page_size, cache_pages=cache_pages)
    model: dict[bytes, bytes] = {}
    for kind, first, second in ops:
        if kind == "put":
            if 4 + len(first) + len(second) > tree.max_entry or 6 + len(first) > tree.max_entry:
                continue
            tree.put(first, second)
            model[first] = second
        elif kind == "delete":
            assert tree.delete(first) == (first in model)
            model.pop(first, None)
        else:
            expected = sorted((k, v) for k, v in model.items() if first <= k < second)
            assert list(tree.range(first, second)) == expected
    check(tree)
    assert list(tree.range()) == sorted(model.items())
    assert all(tree.get(key) == value for key, value in model.items())


@given(
    st.integers(0, 2**32 - 1),
    st.sampled_from([64, 96, 128, 200]),
    st.integers(1, 6),
    st.integers(200, 1200),
)
def test_matches_model_on_deep_trees(seed: int, page_size: int, cache: int, count: int) -> None:
    # Hypothesis tohum ve boyut seçer; işlemler tohumdan üretilir. Böylece ağaç gerçekten derinleşir
    # (yalnız liste stratejisiyle Hypothesis çoğu zaman 20'den kısa diziler üretir).
    rng = random.Random(seed)
    tree = BPlusTree.in_memory(page_size=page_size, cache_pages=cache)
    model: dict[bytes, bytes] = {}
    alphabet = rng.choice(
        [4, 40, 4000]
    )  # az anahtar = çok değiştirme/silme; çok anahtar = derin ağaç
    limit = tree.max_entry - 6
    for step in range(count):
        key = str(rng.randrange(alphabet)).encode() * rng.choice([1, 1, 2])
        key = key[:limit]
        if rng.random() < 0.55:
            value = b"v" * rng.randrange(0, max(1, limit - len(key)))
            tree.put(key, value)
            model[key] = value
        else:
            assert tree.delete(key) == (key in model)
            model.pop(key, None)
        if step % 200 == 0:
            check(tree)
    check(tree)
    assert list(tree.range()) == sorted(model.items())
