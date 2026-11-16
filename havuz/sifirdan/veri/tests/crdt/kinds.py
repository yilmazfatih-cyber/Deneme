"""CRDT türleri tablosu: her tür için üreteç, rastgele yerel işlem ve (varsa) işlem günlüğünden
beklenen değer.

Genişletme: yeni CRDT türü → `KINDS`'a bir `Kind` satırı; yasalar ve yakınsama testleri
kendiliğinden o türü de sınar.
"""

from __future__ import annotations

import random
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from crdt import RGA, GCounter, LWWMap, LWWRegister, ORSet, PNCounter

Op = tuple[object, ...]
CRDT = Any  # her türün kendi sınıfı; ortak yöntemler: apply, merge, value, state


def _gcounter(crdt: GCounter, rng: random.Random) -> Op:
    return crdt.increment(rng.randint(0, 3))


def _pncounter(crdt: PNCounter, rng: random.Random) -> Op:
    return crdt.increment(rng.randint(-3, 3))


def _register(crdt: LWWRegister, rng: random.Random) -> Op:
    return crdt.set(rng.choice(["kırmızı", "yeşil", "mavi", 1, None]))


def _lwwmap(crdt: LWWMap, rng: random.Random) -> Op:
    key = rng.choice(["ad", "şehir", "yaş"])
    return crdt.delete(key) if rng.random() < 0.3 else crdt.set(key, rng.randint(0, 9))


def _orset(crdt: ORSet, rng: random.Random) -> Op:
    element = rng.choice(["elma", "armut", "çilek"])
    return crdt.remove(element) if rng.random() < 0.4 else crdt.add(element)


def _rga(crdt: RGA, rng: random.Random) -> Op:
    length = len(crdt.text())
    if length and rng.random() < 0.3:
        return crdt.delete(rng.randrange(length))
    return crdt.insert(rng.randint(0, length), rng.choice("abcçğış"))


def _expected_counter(ops: list[Op]) -> object:
    return sum(int(str(op[2])) * (-1 if op[0] == "dec" else 1) for op in ops)


def _expected_register(ops: list[Op]) -> object:
    return max(ops, key=lambda op: op[2])[1] if ops else None  # type: ignore[arg-type,return-value]


def _expected_map(ops: list[Op]) -> object:
    latest: dict[object, Op] = {}
    for op in ops:
        if op[1] not in latest or op[3] > latest[op[1]][3]:  # type: ignore[operator]
            latest[op[1]] = op
    return {key: op[2] for key, op in latest.items() if op[0] == "set"}


def _expected_set(ops: list[Op]) -> object:
    removed = {tuple(tag) for op in ops if op[0] == "remove" for tag in op[2]}  # type: ignore[attr-defined]
    return {op[1] for op in ops if op[0] == "add" and tuple(op[2]) not in removed}  # type: ignore[arg-type]


@dataclass(frozen=True)
class Kind:
    name: str
    make: Callable[[str], CRDT]
    random_op: Callable[[CRDT, random.Random], Op]
    expected: Callable[[list[Op]], object] | None  # işlem günlüğünden beklenen değer


KINDS = [
    Kind("gcounter", GCounter, _gcounter, _expected_counter),
    Kind("pncounter", PNCounter, _pncounter, _expected_counter),
    Kind("lww_register", LWWRegister, _register, _expected_register),
    Kind("lww_map", LWWMap, _lwwmap, _expected_map),
    Kind("orset", ORSet, _orset, _expected_set),
    Kind("rga", RGA, _rga, None),
]
