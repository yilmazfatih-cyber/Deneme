"""Önbellek deposu: komut anlamı, süre dolumu (tembel + etkin), LRU tahliyesi, anlık görüntü (sahte
saat)."""

from __future__ import annotations

import random
from pathlib import Path

import pytest

from onbellek_sunucu import Error, SimpleString, SnapshotError, Store
from onbellek_sunucu import snapshot as snap
from onbellek_sunucu.resp import Reply


class Clock:
    def __init__(self) -> None:
        self.ms = 1_000_000

    def __call__(self) -> int:
        return self.ms


def run(store: Store, line: str) -> Reply:
    return store.execute([part.encode() for part in line.split(" ")])


def keys(store: Store, pattern: str) -> list[bytes]:
    reply = store.execute([b"KEYS", pattern.encode()])
    assert isinstance(reply, list)
    return sorted(item for item in reply if isinstance(item, bytes))


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def store(clock: Clock) -> Store:
    return Store(clock=clock, rng=random.Random(3))


def test_strings_and_options(store: Store) -> None:
    assert run(store, "SET şehir İzmir") == SimpleString("OK")
    assert run(store, "GET şehir") == "İzmir".encode()
    assert run(store, "SET şehir Ankara NX") is None  # var: NX yazmaz
    assert run(store, "SET yok x XX") is None  # yok: XX yazmaz
    assert run(store, "GET yok") is None
    assert run(store, "EXISTS şehir yok şehir") == 2
    assert run(store, "DEL şehir yok") == 1
    assert run(store, "SET a b NX XX") == Error("ERR", "sözdizimi hatası")
    assert isinstance(run(store, "SET a b EX 0"), Error)
    assert isinstance(run(store, "GET"), Error) and isinstance(run(store, "UCUR a"), Error)
    assert run(store, "PING") == SimpleString("PONG") and run(store, "ECHO merhaba") == b"merhaba"


def test_counters_follow_redis_rules(store: Store) -> None:
    assert (
        run(store, "INCR n") == 1 and run(store, "INCRBY n 41") == 42 and run(store, "DECR n") == 41
    )
    for bad in ("01", "-0", "+5", "x", ""):
        store.execute([b"SET", b"m", bad.encode()])
        assert isinstance(run(store, "INCR m"), Error), bad
    run(store, "SET big 9223372036854775807")
    assert run(store, "INCR big") == Error("ERR", "artırma ya da azaltma taşma yapar")


def test_lazy_and_active_expiry(store: Store, clock: Clock) -> None:
    run(store, "SET a 1 EX 10")
    run(store, "SET b 1 PX 1500")
    run(store, "SET c 1")
    assert (
        run(store, "TTL a"),
        run(store, "PTTL b"),
        run(store, "TTL c"),
        run(store, "TTL x"),
    ) == (
        10,
        1500,
        -1,
        -2,
    )
    clock.ms += 1499
    assert run(store, "TTL b") == 0  # (1 ms + 500) // 1000: Redis'in yuvarlaması
    clock.ms += 1
    assert run(store, "GET b") is None  # tembel: erişimde silindi
    assert run(store, "INCR a") == 2 and run(store, "TTL a") == 9  # INCR süreyi korur
    run(store, "SET a 5")
    assert run(store, "TTL a") == -1  # SET süreyi kaldırır
    for number in range(100):
        run(store, f"SET gecici{number} x EX 1")
    clock.ms += 1001
    removed = sum(store.active_expire_cycle() for _ in range(20))  # hiç erişmeden temizlik
    assert removed == 100 and store.stats["expired"] >= 101
    assert run(store, "EXPIRE c 0") == 1 and run(store, "EXISTS c") == 0  # geçmiş süre: siler
    assert run(store, "EXPIRE yok 5") == 0


def test_keys_glob_patterns(store: Store) -> None:
    for key in ("kullanici:1", "kullanici:22", "kullanim", "a*b", "h[a]llo"):
        store.execute([b"SET", key.encode(), b"1"])
    assert keys(store, "kullanici:*") == [b"kullanici:1", b"kullanici:22"]
    assert run(store, "KEYS kullanici:?") == [b"kullanici:1"]
    assert keys(store, "kullan[a-i]*") == [
        b"kullanici:1",
        b"kullanici:22",
        b"kullanim",  # "i" de [a-i] aralığında
    ]
    assert run(store, "KEYS kullan[^a]m") == [b"kullanim"]  # "i", [^a]'ya uyar
    assert run(store, "KEYS kullan[^i]m") == []  # gerçek Redis de boş döner
    assert run(store, "KEYS a\\*b") == [b"a*b"]
    assert run(store, "DBSIZE") == 5


def test_lru_eviction_respects_recent_use(clock: Clock) -> None:
    store = Store(maxmemory=10 * (2 + 10 + 64), clock=clock)  # tam 10 anahtar sığar
    for number in range(10):
        run(store, f"SET k{number} {'v' * 10}")
    run(store, "GET k0")  # k0 artık en yeni kullanılan
    run(store, "SET yeni vvvvvvvvvvvvvvvvvv")
    assert run(store, "EXISTS k0") == 1  # kullanıldığı için kaldı
    assert run(store, "EXISTS k1") == 0  # en eski: atıldı
    assert store.stats["evicted"] >= 1 and store.used <= store.maxmemory
    too_big = store.execute([b"SET", b"dev", b"x" * 2000])
    assert isinstance(too_big, Error) and too_big.kind == "OOM"


def test_snapshot_roundtrip_and_corruption(store: Store, clock: Clock, tmp_path: Path) -> None:
    run(store, "SET kalici değer")
    run(store, "SET sureli x EX 100")
    run(store, "SET bitecek y EX 1")
    store.execute([b"SET", b"ikili", bytes(range(256))])
    path = tmp_path / "onbellek.snap"
    snap.save(store, path)
    clock.ms += 2000
    restored = Store(clock=clock)
    assert snap.load(restored, path) == 3  # süresi geçen yüklenmedi
    assert run(restored, "GET kalici") == "değer".encode() and run(restored, "TTL sureli") == 98
    assert run(restored, "GET ikili") == bytes(range(256))
    data = bytearray(path.read_bytes())
    data[20] ^= 0xFF
    path.write_bytes(bytes(data))
    with pytest.raises(SnapshotError, match="sağlama"):
        snap.load(Store(clock=clock), path)
