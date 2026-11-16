"""WAL kayıt biçimi, Bloom süzgeci ve SSTable dosyası için birim ve özellik testleri."""

from __future__ import annotations

import random

import pytest
from hypothesis import given
from hypothesis import strategies as st

from anahtar_deger.bloom import BloomFilter
from anahtar_deger.sim_fs import SimFS
from anahtar_deger.sstable import CorruptionError, SSTableReader, write_sstable
from anahtar_deger.wal import Op, encode_record, read_records, replay

ops_strategy = st.lists(
    st.tuples(st.binary(max_size=8), st.one_of(st.none(), st.binary(max_size=16))),
    min_size=1,
    max_size=4,
)


@given(st.lists(ops_strategy, max_size=6))
def test_wal_roundtrip(batches: list[list[Op]]) -> None:
    data = b"".join(encode_record(batch) for batch in batches)
    records, end = read_records(data)
    assert records == batches
    assert end == len(data)


def test_wal_every_truncation_keeps_only_complete_records() -> None:
    batches: list[list[Op]] = [[(b"a", b"1")], [(b"b", None), (b"c", b"33")], [(b"d", b"4" * 40)]]
    encoded = [encode_record(batch) for batch in batches]
    data = b"".join(encoded)
    boundaries = [sum(len(chunk) for chunk in encoded[:i]) for i in range(len(encoded) + 1)]
    for cut in range(len(data) + 1):
        records, end = read_records(data[:cut])
        complete = max(i for i, boundary in enumerate(boundaries) if boundary <= cut)
        assert records == batches[:complete]
        assert end == boundaries[complete]


def test_wal_flipped_byte_drops_that_record_and_everything_after() -> None:
    batches: list[list[Op]] = [[(b"k1", b"v1")], [(b"k2", b"v2")], [(b"k3", b"v3")]]
    encoded = [encode_record(batch) for batch in batches]
    data = b"".join(encoded)
    first_len = len(encoded[0])
    for pos in range(first_len, first_len + len(encoded[1])):
        corrupted = bytearray(data)
        corrupted[pos] ^= 0x5A
        records, end = read_records(bytes(corrupted))
        assert records == batches[:1]
        assert end == first_len


def test_wal_replay_truncates_torn_tail() -> None:
    fs = SimFS()
    handle = fs.create("000001.log")
    handle.write(encode_record([(b"x", b"1")]) + encode_record([(b"y", b"2")])[:-3])
    assert replay(fs, "000001.log") == [[(b"x", b"1")]]
    assert fs.size("000001.log") == len(encode_record([(b"x", b"1")]))


@given(st.sets(st.binary(min_size=1, max_size=12), max_size=200))
def test_bloom_has_no_false_negatives(keys: set[bytes]) -> None:
    bloom = BloomFilter.for_keys(keys)
    restored = BloomFilter.from_bytes(bloom.to_bytes())
    assert all(bloom.might_contain(key) and restored.might_contain(key) for key in keys)


def test_bloom_false_positive_rate_is_near_one_percent() -> None:
    rng = random.Random(7)
    members = {rng.randbytes(8) for _ in range(5000)}
    bloom = BloomFilter.for_keys(members, bits_per_key=10)
    probes = [rng.randbytes(9) for _ in range(20000)]  # 9 bayt: üyelerle çakışamaz
    rate = sum(bloom.might_contain(key) for key in probes) / len(probes)
    assert rate < 0.02  # kuram: (1 - e^(-k/10))^k ≈ %0.8 (k = 7)


def _sample_entries(count: int) -> list[tuple[bytes, bytes | None]]:
    return [
        (f"k{i:05d}".encode(), None if i % 7 == 0 else f"v{i}".encode() * (i % 5 + 1))
        for i in range(count)
    ]


def test_sstable_get_and_scan_match_input() -> None:
    fs = SimFS()
    entries = _sample_entries(500)
    assert write_sstable(fs, "000001.sst", entries, block_size=128) == 500
    assert fs.list_dir() == ["000001.sst"]  # geçici dosya yeniden adlandırıldı
    reader = SSTableReader(fs, "000001.sst")
    for key, value in entries:
        assert reader.get(key) == (True, value)
    assert reader.get(b"k99999") == (False, None)
    assert reader.get(b"") == (False, None)
    assert list(reader.scan()) == entries
    assert list(reader.scan(b"k00100", b"k00110")) == entries[100:110]
    assert list(reader.scan(b"k00100x", b"k00102")) == entries[101:102]


def test_sstable_bloom_skips_block_reads_for_missing_keys() -> None:
    fs = SimFS()
    write_sstable(fs, "000001.sst", _sample_entries(1000), block_size=256)
    reader = SSTableReader(fs, "000001.sst")
    for i in range(1000):
        assert reader.get(f"yok{i}".encode()) == (False, None)
    assert reader.block_reads < 40  # süzgeç olmasa 1000'e yakın blok okunurdu


def test_sstable_rejects_unsorted_input() -> None:
    with pytest.raises(ValueError, match="artan sırada"):
        write_sstable(SimFS(), "000001.sst", [(b"b", b"1"), (b"a", b"2")])


def test_sstable_detects_corruption() -> None:
    fs = SimFS()
    write_sstable(fs, "000001.sst", _sample_entries(50), block_size=64)
    data = bytearray(fs.read("000001.sst"))
    data[-20] ^= 0xFF  # alt bilgi
    fs.create("bozuk1.sst").write(bytes(data))
    with pytest.raises(CorruptionError):
        SSTableReader(fs, "bozuk1.sst")
    data = bytearray(fs.read("000001.sst"))
    data[3] ^= 0xFF  # ilk veri bloğu
    fs.create("bozuk2.sst").write(bytes(data))
    reader = SSTableReader(fs, "bozuk2.sst")
    with pytest.raises(CorruptionError):
        list(reader.scan())
