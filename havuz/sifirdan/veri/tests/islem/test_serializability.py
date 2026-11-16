"""Özellik testi: rastgele programlar + rastgele iç içe geçme. SERIALIZABLE ve 2PL'de onaylanan
işlemler, onay sırasıyla TEK TEK (seri) yeniden oynatılınca aynı okumaları ve aynı son durumu
vermelidir.

SNAPSHOT'ta onay sırasıyla oynatma çoğu tohumda tutmaz. Bu tek başına "serileştirilemez" kanıtı
değildir (başka bir seri sıra var olabilir); kesin kanıt test_anomalies.py'deki yazma
çarpıklığıdır.
"""

from __future__ import annotations

import random
from collections.abc import Generator

import pytest

from islem import LockingStore, MVCCStore, Scheduler
from islem.mvcc import Value
from islem.scheduler import Outcome, Program, Request
from tests.islem.anomalies import MODES, _as_store
from tests.yardimci import seed_count

KEYS = ["a", "b", "c", "d", "e", "f"]


def random_program(rng: random.Random, number: int) -> Program:
    reads = rng.sample(KEYS, rng.randint(1, 3))
    writes = rng.sample(KEYS, rng.randint(1, 2))
    scans = rng.random() < 0.3

    def program() -> Generator[Request, object, None]:
        total = number
        for key in reads:
            value = yield ("get", key)
            total += value if isinstance(value, int) else 0
        if scans:
            rows = yield ("scan", "b", "e")
            assert isinstance(rows, list)
            total += len(rows)
        for key in writes:
            if total % 5 == 0:
                yield ("delete", key)
            else:
                yield ("put", key, total % 97)

    return program


def serial_replay(
    programs: dict[str, Program], outcomes: dict[str, Outcome], initial: dict[str, Value]
) -> tuple[bool, dict[str, Value]]:
    """Onaylananları onay sırasıyla seri koşar; (okumalar aynı mı, son durum)."""
    state = dict(initial)
    committed = sorted(
        (name for name, outcome in outcomes.items() if outcome.committed),
        key=lambda name: outcomes[name].commit_index or 0,
    )
    same_reads = True
    for name in committed:
        generator = programs[name]()
        observed: list[object] = []
        result: object = None
        while True:
            try:
                request = generator.send(result)
            except StopIteration:
                break
            result = _apply_serially(state, request)
            if request[0] in ("get", "scan"):
                observed.append(result)
        same_reads = same_reads and observed == outcomes[name].observed
    return same_reads, state


def _apply_serially(state: dict[str, Value], request: Request) -> object:
    kind, key = request[0], str(request[1])
    if kind == "get":
        return state.get(key)
    if kind == "scan":
        end = str(request[2])
        return sorted((k, v) for k, v in state.items() if key <= k < end)
    if kind == "put":
        value = request[2]
        assert isinstance(value, int)
        state[key] = value
    else:
        state.pop(key, None)
    return None


def run_random(mode: str, seed: int) -> tuple[bool, bool, int, int]:
    """(okumalar aynı mı, son durum aynı mı, onaylanan sayısı, program sayısı)."""
    rng = random.Random(seed)
    initial: dict[str, Value] = {key: rng.randint(0, 9) for key in KEYS}
    programs = {f"T{i}": random_program(rng, i) for i in range(rng.randint(2, 6))}
    store: MVCCStore | LockingStore = LockingStore() if mode == "2pl" else MVCCStore()
    setup = store.begin(MODES[mode])
    for key, value in initial.items():
        setup.put(key, value)
    setup.commit()
    outcomes = Scheduler(_as_store(store), programs, MODES[mode]).run(seed=seed)
    same_reads, replayed = serial_replay(programs, outcomes, initial)
    committed = sum(outcome.committed for outcome in outcomes.values())
    return same_reads, replayed == store.snapshot(), committed, len(programs)


@pytest.mark.parametrize("mode", ["ser", "2pl"])
def test_serializable_modes_match_serial_replay(mode: str) -> None:
    committed = total = 0
    for seed in range(seed_count(150, 3000)):
        same_reads, same_state, count, programs = run_random(mode, seed)
        assert same_reads and same_state, f"{mode} tohum={seed}: seri yeniden oynatma tutmadı"
        committed, total = committed + count, total + programs
    # Boş geçmesin: ölçümde SERIALIZABLE ~%46, 2PL ~%67 onay (yoğun çekişme: 6 anahtar).
    assert committed > 0.35 * total


def test_snapshot_isolation_is_not_serializable() -> None:
    failures = sum(not all(run_random("si", seed)[:2]) for seed in range(seed_count(150, 3000)))
    assert failures > 0  # yazma çarpıklığı gerçekten oluşuyor
