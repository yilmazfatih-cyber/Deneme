"""MVCC deposu ve kilit yöneticisi: birim testleri, sürüm temizliği, gerçek iş parçacıklarıyla
sayaç."""

from __future__ import annotations

import threading

import pytest

from islem import (
    READ_COMMITTED,
    SERIALIZABLE,
    SNAPSHOT,
    ConflictError,
    DeadlockError,
    LockingStore,
    LockManager,
    MVCCStore,
    TransactionClosedError,
    WouldBlock,
)
from islem.locks import ROOT, compatible, supremum


def test_mvcc_read_your_writes_rollback_and_snapshot() -> None:
    store = MVCCStore()
    setup = store.begin()
    setup.put("a", 1)
    setup.put("b", 2)
    setup.commit()
    reader = store.begin(SNAPSHOT)
    writer = store.begin()
    writer.put("a", 10)
    writer.delete("b")
    assert writer.get("a") == 10 and writer.get("b") is None  # kendi yazdığını görür
    assert writer.scan() == [("a", 10)]
    writer.commit()
    assert reader.get("a") == 1 and reader.scan() == [("a", 1), ("b", 2)]  # anlık görüntü
    reader.commit()
    later = store.begin(READ_COMMITTED)
    assert later.scan() == [("a", 10)]
    later.put("c", 3)
    later.rollback()
    assert store.snapshot() == {"a": 10}
    with pytest.raises(TransactionClosedError):
        later.get("a")


def test_first_committer_wins_and_serializable_read_validation() -> None:
    store = MVCCStore()
    first, second = store.begin(), store.begin()
    first.put("x", 1)
    second.put("x", 2)
    first.commit()
    with pytest.raises(ConflictError, match="'x'"):
        second.commit()
    assert second.status == "aborted" and store.snapshot() == {"x": 1}
    reader = store.begin(SERIALIZABLE)
    assert reader.get("x") == 1
    reader.put("y", 1)
    changer = store.begin()
    changer.put("x", 5)
    changer.commit()
    with pytest.raises(ConflictError, match="Okunan 'x'"):
        reader.commit()


def test_vacuum_keeps_versions_visible_to_active_snapshots() -> None:
    store = MVCCStore()
    for value in range(5):
        tx = store.begin()
        tx.put("k", value)
        tx.commit()
    old_reader = store.begin()
    for value in range(5, 10):
        tx = store.begin()
        tx.put("k", value)
        tx.commit()
    assert store.version_count() == 10
    store.vacuum()
    assert old_reader.get("k") == 4  # eski anlık görüntünün sürümü korundu
    assert store.version_count() == 6
    old_reader.commit()
    store.vacuum()
    assert store.version_count() == 1
    tx = store.begin()
    tx.delete("k")
    tx.commit()
    store.vacuum()
    assert store.version_count() == 0 and store.snapshot() == {}


def test_concurrent_increments_with_real_threads_lose_nothing() -> None:
    store = MVCCStore()
    tx = store.begin()
    tx.put("sayac", 0)
    tx.commit()
    conflicts = [0]

    def worker() -> None:
        for _ in range(200):
            while True:  # çakışınca yeni işlemle yeniden dene
                attempt = store.begin(SNAPSHOT)
                value = attempt.get("sayac")
                assert isinstance(value, int)
                attempt.put("sayac", value + 1)
                try:
                    attempt.commit()
                    break
                except ConflictError:
                    conflicts[0] += 1

    threads = [threading.Thread(target=worker) for _ in range(4)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert store.snapshot() == {"sayac": 800}


def test_lock_mode_lattice() -> None:
    assert compatible("IS", "IX") and compatible("S", "S") and not compatible("S", "IX")
    assert not compatible("SIX", "S") and compatible("SIX", "IS") and not compatible("X", "IS")
    assert supremum("IS", "IX") == "IX" and supremum("S", "IX") == "SIX"
    assert supremum("S", "X") == "X" and supremum("IX", "IX") == "IX"


def test_deadlock_detection_three_way_cycle() -> None:
    locks = LockManager()
    for tx, key in ((1, "a"), (2, "b"), (3, "c")):
        locks.acquire(tx, key, "X")
    with pytest.raises(WouldBlock):
        locks.acquire(1, "b", "X")  # 1 → 2
    with pytest.raises(WouldBlock):
        locks.acquire(2, "c", "X")  # 2 → 3
    with pytest.raises(DeadlockError, match="T3 → T1 → T2 → T3"):
        locks.acquire(3, "a", "X")  # 3 → 1 kapatırdı: döngü
    locks.release_all(3)  # kurban bırakınca 2 ilerler
    locks.acquire(2, "c", "X")
    assert locks.held_by(2) == {"b": "X", "c": "X"}


def test_two_phase_store_rollback_and_scan_lock() -> None:
    store = LockingStore()
    tx = store.begin()
    tx.put("a", 1)
    tx.commit()
    writer = store.begin()
    writer.put("a", 2)
    writer.put("b", 3)
    writer.delete("a")
    writer.rollback()  # geri alma günlüğü eski durumu kurar
    assert store.snapshot() == {"a": 1}
    scanner, inserter = store.begin(), store.begin()
    assert scanner.scan() == [("a", 1)]
    assert store.locks.held_by(scanner.id) == {ROOT: "S"}
    with pytest.raises(WouldBlock):
        inserter.put("b", 9)  # ROOT'ta IX, tarayıcının S'siyle çatışır (hayalet satır önlenir)
    scanner.commit()
    inserter.put("b", 9)
    inserter.commit()
    assert store.snapshot() == {"a": 1, "b": 9}
