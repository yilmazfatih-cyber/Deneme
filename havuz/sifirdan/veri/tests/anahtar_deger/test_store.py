"""KVStore davranışı: temel işlemler, kalıcılık, boşaltma/birleştirme ve `dict` modeline karşı
özellik testi."""

from __future__ import annotations

import random
from pathlib import Path

import pytest
from hypothesis import given
from hypothesis import strategies as st

from anahtar_deger import KVStore, Options, RealFS, SimFS, StoreClosedError
from anahtar_deger.__main__ import main as cli_main

TINY = Options(memtable_limit=64, block_size=32, compaction_trigger=3)


def test_put_get_delete_scan_on_real_disk(tmp_path: Path) -> None:
    with KVStore.open(tmp_path / "db") as db:
        db.put(b"elma", b"kirmizi")
        db.put(b"armut", b"sari")
        db.put(b"kiraz", b"bordo")
        db.delete(b"armut")
        assert db.get(b"elma") == b"kirmizi"
        assert db.get(b"armut") is None
        assert list(db.scan()) == [(b"elma", b"kirmizi"), (b"kiraz", b"bordo")]
    with KVStore.open(tmp_path / "db") as db:  # WAL yeniden oynatılır
        assert list(db.scan(b"f")) == [(b"kiraz", b"bordo")]


def test_flush_and_compaction_keep_data_and_drop_tombstones(tmp_path: Path) -> None:
    options = Options(memtable_limit=200, block_size=64, compaction_trigger=3)
    with KVStore.open(tmp_path, options) as db:
        for i in range(300):
            db.put(f"k{i:03d}".encode(), f"v{i}".encode() * 3)
        for i in range(0, 300, 2):
            db.delete(f"k{i:03d}".encode())
        db.flush()
        db.compact()
        assert db.stats()["tables"] == 1
        assert db.stats()["table_entries"] == 150  # silinenler ve eski sürümler atıldı
    names = RealFS(tmp_path).list_dir()
    assert sum(name.endswith(".sst") for name in names) == 1
    assert sum(name.endswith(".log") for name in names) == 1
    with KVStore.open(tmp_path, options) as db:
        assert db.get(b"k001") == b"v1v1v1"
        assert db.get(b"k002") is None
        assert len(list(db.scan())) == 150


def test_write_batch_validates_types_and_closed_store_raises() -> None:
    db = KVStore.open(SimFS(), TINY)
    with pytest.raises(TypeError, match="bytes"):
        db.write_batch([("metin", b"1")])  # type: ignore[list-item]
    db.write_batch([(b"a", b"1"), (b"b", None)])
    db.close()
    with pytest.raises(StoreClosedError):
        db.get(b"a")


def test_scan_stops_clearly_if_compaction_deletes_tables() -> None:
    db = KVStore.open(SimFS(), Options(memtable_limit=10**9, block_size=16, compaction_trigger=100))
    for round_number in range(2):
        for i in range(50):
            db.put(f"k{i:02d}".encode(), str(round_number).encode())
        db.flush()
    iterator = db.scan()
    assert next(iterator) == (b"k00", b"1")
    db.compact()
    with pytest.raises(RuntimeError, match="yeniden başlatın"):
        list(iterator)


def test_torn_wal_tail_on_real_disk_is_discarded(tmp_path: Path) -> None:
    with KVStore.open(tmp_path) as db:
        db.put(b"a", b"1")
        db.put(b"b", b"2")
    wal = next(p for p in tmp_path.iterdir() if p.suffix == ".log")
    with wal.open("ab") as handle:
        handle.write(b"\x13\x37yarim-kayit")  # yazarken ölen sürecin bıraktığı çöp
    with KVStore.open(tmp_path) as db:
        assert list(db.scan()) == [(b"a", b"1"), (b"b", b"2")]
        db.put(b"c", b"3")  # kesilen kuyruğun ardına doğru eklenir
    with KVStore.open(tmp_path) as db:
        assert db.get(b"c") == b"3"


def test_cli_roundtrip(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    folder = str(tmp_path / "cli")
    assert cli_main([folder, "yaz", "şehir", "İstanbul"]) == 0
    assert cli_main([folder, "oku", "şehir"]) == 0
    assert capsys.readouterr().out.strip() == "İstanbul"
    assert cli_main([folder, "sil", "şehir"]) == 0
    assert cli_main([folder, "oku", "şehir"]) == 1
    assert cli_main([folder, "birlestir"]) == 0


KEYS = st.sampled_from([b"", b"a", b"ab", b"b", b"ba", b"c", b"d", b"\xff"])
OPS = st.lists(
    st.one_of(
        st.tuples(st.just("put"), KEYS, st.binary(max_size=24)),
        st.tuples(st.just("delete"), KEYS),
        st.tuples(st.just("get"), KEYS),
        st.tuples(st.just("scan"), KEYS, KEYS),
        st.tuples(st.just("flush")),
        st.tuples(st.just("compact")),
        st.tuples(st.just("reopen")),
    ),
    max_size=80,
)


@given(OPS)
def test_matches_dict_model(ops: list[tuple[object, ...]]) -> None:
    fs = SimFS()
    db = KVStore.open(fs, TINY)
    model: dict[bytes, bytes] = {}
    for op in ops:
        kind = op[0]
        if kind == "put":
            key, value = op[1], op[2]
            assert isinstance(key, bytes) and isinstance(value, bytes)
            db.put(key, value)
            model[key] = value
        elif kind == "delete":
            assert isinstance(op[1], bytes)
            db.delete(op[1])
            model.pop(op[1], None)
        elif kind == "get":
            assert isinstance(op[1], bytes)
            assert db.get(op[1]) == model.get(op[1])
        elif kind == "scan":
            lo, hi = op[1], op[2]
            assert isinstance(lo, bytes) and isinstance(hi, bytes)
            expected = sorted((k, v) for k, v in model.items() if lo <= k < hi)
            assert list(db.scan(lo, hi)) == expected
        elif kind == "flush":
            db.flush()
        elif kind == "compact":
            db.compact()
        else:
            db.close()
            db = KVStore.open(fs, TINY)
    assert list(db.scan()) == sorted(model.items())
    db.close()


@given(st.integers(0, 2**32 - 1), st.integers(100, 600))
def test_matches_dict_model_on_long_sequences(seed: int, count: int) -> None:
    # Hypothesis listeleri çoğu zaman kısa olur; burada tohumdan uzun bir işlem dizisi üretilir.
    rng = random.Random(seed)
    fs = SimFS()
    db = KVStore.open(fs, TINY)
    model: dict[bytes, bytes] = {}
    keys = [bytes([rng.randrange(256)]) * rng.randint(0, 3) for _ in range(rng.choice([3, 30]))]
    for _ in range(count):
        roll = rng.random()
        key = rng.choice(keys)
        if roll < 0.5:
            value = rng.randbytes(rng.randint(0, 30))
            db.put(key, value)
            model[key] = value
        elif roll < 0.75:
            db.delete(key)
            model.pop(key, None)
        elif roll < 0.9:
            assert db.get(key) == model.get(key)
        elif roll < 0.97:
            lo, hi = sorted((rng.choice(keys), rng.choice(keys)))
            assert list(db.scan(lo, hi)) == sorted((k, v) for k, v in model.items() if lo <= k < hi)
        else:
            db.close()
            db = KVStore.open(fs, TINY)
    assert list(db.scan()) == sorted(model.items())
    db.close()
