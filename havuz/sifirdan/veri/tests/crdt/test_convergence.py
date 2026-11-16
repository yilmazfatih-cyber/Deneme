"""Yasalar ve yakınsama: her CRDT türü için
- durum birleşimi değişmeli, birleşmeli ve yinelemesizdir;
- rastgele yerel işlemler + rastgele tek yönlü birleşimler (dedikodu) → herkes aynı duruma varır;
- işlem tabanlı: mesajlar rastgele sırayla, yinelenerek, gecikerek teslim edilir → herkes aynı
  duruma varır ve değer, işlem günlüğünden hesaplanan beklenen değerdir (sayaçta hiçbir artış
  kaybolmaz).
"""

from __future__ import annotations

import copy
import random

import pytest
from hypothesis import given
from hypothesis import strategies as st

from crdt import Message, Replica
from tests.crdt.kinds import CRDT, KINDS, Kind

NAMES = ["a", "b", "c"]
SEEDS = st.integers(0, 2**32 - 1)


def _merged(left: CRDT, right: CRDT) -> CRDT:
    result = copy.deepcopy(left)
    result.merge(copy.deepcopy(right))
    return result


def _random_history(kind: Kind, rng: random.Random) -> list[CRDT]:
    replicas = [kind.make(name) for name in NAMES]
    for _ in range(rng.randint(0, 25)):
        if rng.random() < 0.65:
            kind.random_op(rng.choice(replicas), rng)
        else:
            target, source = rng.sample(replicas, 2)
            target.merge(copy.deepcopy(source))
    return replicas


@pytest.mark.parametrize("kind", KINDS, ids=lambda k: k.name)
@given(seed=SEEDS)
def test_merge_laws(kind: Kind, seed: int) -> None:
    a, b, c = _random_history(kind, random.Random(seed))
    assert _merged(a, b).state() == _merged(b, a).state()  # değişmeli
    assert _merged(_merged(a, b), c).state() == _merged(a, _merged(b, c)).state()  # birleşmeli
    assert _merged(a, a).state() == a.state()  # yinelemesiz
    assert _merged(_merged(a, b), b).state() == _merged(a, b).state()


@pytest.mark.parametrize("kind", KINDS, ids=lambda k: k.name)
@given(seed=SEEDS)
def test_state_based_gossip_converges(kind: Kind, seed: int) -> None:
    rng = random.Random(seed)
    replicas = [kind.make(name) for name in NAMES]
    log = []
    for _ in range(rng.randint(5, 60)):
        if rng.random() < 0.55:
            log.append(kind.random_op(rng.choice(replicas), rng))
        else:
            target, source = rng.sample(replicas, 2)
            target.merge(copy.deepcopy(source))
    for target in replicas:  # son dedikodu turu: herkes herkesten
        for source in replicas:
            target.merge(copy.deepcopy(source))
    assert len({repr(r.state()) for r in replicas}) == 1
    if kind.expected is not None:
        assert replicas[0].value() == kind.expected(log)


@pytest.mark.parametrize("kind", KINDS, ids=lambda k: k.name)
@given(seed=SEEDS)
def test_op_based_converges_under_reordering_and_duplication(kind: Kind, seed: int) -> None:
    rng = random.Random(seed)
    replicas = [Replica(name, kind.make(name)) for name in NAMES]
    in_flight: list[tuple[Replica[CRDT], Message]] = []
    log = []
    for _ in range(rng.randint(5, 60)):
        if rng.random() < 0.5 or not in_flight:
            sender = rng.choice(replicas)
            op = kind.random_op(sender.crdt, rng)
            log.append(op)
            message = sender.record(op)
            for receiver in replicas:
                if receiver is not sender:
                    in_flight += [(receiver, message)] * rng.choice([1, 1, 2, 3])  # yineleme
        else:
            receiver, message = in_flight.pop(rng.randrange(len(in_flight)))  # sırasız teslim
            receiver.receive(message)
    rng.shuffle(in_flight)
    for receiver, message in in_flight:
        receiver.receive(message)
    assert all(not replica.buffer for replica in replicas)  # bekleyen kalmadı
    assert len({repr(replica.crdt.state()) for replica in replicas}) == 1
    if kind.expected is not None:
        assert replicas[0].crdt.value() == kind.expected(log)
