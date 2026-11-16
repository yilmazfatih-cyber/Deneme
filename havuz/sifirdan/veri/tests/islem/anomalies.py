"""Yalıtım anomalileri: her biri belirli bir iç içe geçme (schedule) ile kurulur ve "oldu mu?" diye
ölçülür.

Her işlev bir yalıtım kipinde senaryoyu koşar ve anomalinin GÖRÜLÜP görülmediğini döndürür. Kipler:
"rc" (MVCC + READ COMMITTED), "si" (MVCC + SNAPSHOT), "ser" (MVCC + SERIALIZABLE), "2pl" (katı 2PL).

Genişletme: yeni anomali (ör. salt okunur işlem anomalisi) → burada bir işlev +
test_anomalies.py'deki beklenti tablosuna bir satır.
"""

from __future__ import annotations

from collections.abc import Generator

from islem import READ_COMMITTED, SERIALIZABLE, SNAPSHOT, LockingStore, MVCCStore, Scheduler
from islem.mvcc import Value
from islem.scheduler import Outcome, Program, Request, Store

MODES = {"rc": READ_COMMITTED, "si": SNAPSHOT, "ser": SERIALIZABLE, "2pl": "serializable"}


def make_store(mode: str, initial: dict[str, Value]) -> MVCCStore | LockingStore:
    store: MVCCStore | LockingStore = LockingStore() if mode == "2pl" else MVCCStore()
    tx = store.begin(MODES[mode])
    for key, value in initial.items():
        tx.put(key, value)
    tx.commit()
    return store


def run(
    mode: str, initial: dict[str, Value], programs: dict[str, Program], order: list[str]
) -> tuple[dict[str, Outcome], dict[str, Value]]:
    store = make_store(mode, initial)
    scheduler = Scheduler(_as_store(store), programs, MODES[mode])
    outcomes = scheduler.run(order)
    return outcomes, store.snapshot()


def _as_store(store: MVCCStore | LockingStore) -> Store:
    return store  # iki depo da Store protokolüne uyar (mypy bunu denetler)


def dirty_read(mode: str) -> bool:
    def writer() -> Generator[Request, object, None]:
        yield ("put", "x", 100)
        yield ("rollback",)

    def reader() -> Generator[Request, object, None]:
        yield ("get", "x")

    outcomes, _ = run(mode, {"x": 1}, {"W": writer, "R": reader}, ["W", "R", "W", "R"])
    return outcomes["R"].observed != [1]


def non_repeatable_read(mode: str) -> bool:
    def reader() -> Generator[Request, object, None]:
        yield ("get", "x")
        yield ("get", "x")

    def writer() -> Generator[Request, object, None]:
        yield ("put", "x", 2)

    outcomes, _ = run(mode, {"x": 1}, {"R": reader, "W": writer}, ["R", "W", "W", "R", "R"])
    first, second = outcomes["R"].observed
    return first != second


def lost_update(mode: str) -> bool:
    def increment() -> Generator[Request, object, None]:
        value = yield ("get", "x")
        assert isinstance(value, int)
        yield ("put", "x", value + 1)

    programs: dict[str, Program] = {"T1": increment, "T2": increment}
    outcomes, final = run(mode, {"x": 1}, programs, ["T1", "T2", "T1", "T2", "T1", "T2"])
    committed = sum(outcome.committed for outcome in outcomes.values())
    return final["x"] != 1 + committed  # onaylanan bir artış kaybolduysa anomali


def go_home(me: str) -> Program:
    """Nöbetçi doktor programı: ikisi de nöbetteyse ben (`me`) nöbetten çıkarım."""

    def program() -> Generator[Request, object, None]:
        alice = yield ("get", "alice")
        bob = yield ("get", "bob")
        assert isinstance(alice, int) and isinstance(bob, int)
        if alice + bob >= 2:  # öteki nöbette, ben çıkabilirim
            yield ("put", me, 0)

    return program


SKEW_ORDER = ["T1", "T1", "T2", "T2", "T1", "T2", "T1", "T2"]


def write_skew(mode: str) -> bool:
    """İki nöbetçi doktor: "en az biri nöbette" kuralını iki işlem birlikte bozabilir mi?"""
    programs = {"T1": go_home("alice"), "T2": go_home("bob")}
    _, final = run(mode, {"alice": 1, "bob": 1}, programs, SKEW_ORDER)
    return final["alice"] == 0 and final["bob"] == 0  # kimse nöbette değil: kural bozuldu


def phantom(mode: str) -> bool:
    def counter() -> Generator[Request, object, None]:
        yield ("scan", "a", "b")
        yield ("scan", "a", "b")

    def inserter() -> Generator[Request, object, None]:
        yield ("put", "a3", 1)

    outcomes, _ = run(
        mode, {"a1": 1, "a2": 1}, {"C": counter, "I": inserter}, ["C", "I", "I", "C", "C"]
    )
    first, second = outcomes["C"].observed
    assert isinstance(first, list) and isinstance(second, list)
    return len(first) != len(second)
