"""Belirlenimci zamanlayıcı: işlem programlarını iş parçacığı ve `sleep` olmadan, istenen sırayla
iç içe yürütür.

Program, istek veren bir üreteçtir:

    def havale():
        a = yield ("get", "a")
        yield ("put", "a", a - 10)

Her adım TEK bir istek yürütür (get, put, delete, scan ya da program bitince "commit").
`run(order=[...])` adımların sırasını tam olarak belirler (anomali testleri), `run(seed=...)`
tohumlu rastgele sıra verir (özellik testleri). `WouldBlock` alan program bekler ve sırası gelince
aynı isteği yeniden dener.

Genişletme: iptal edilen programı otomatik yeniden denemek için `_finish`'te yeni bir durum açıp
programı baştan kurun (sonsuz döngüye karşı deneme sınırı koyun).
"""

from __future__ import annotations

import random
from collections.abc import Callable, Generator, Sequence
from dataclasses import dataclass, field
from typing import Protocol

from .errors import TransactionAbortedError, WouldBlock
from .mvcc import Value

Request = tuple[object, ...]
Program = Callable[[], Generator[Request, object, None]]


class Transaction(Protocol):
    def get(self, key: str) -> Value | None: ...
    def put(self, key: str, value: Value) -> None: ...
    def delete(self, key: str) -> None: ...
    def scan(self, start: str = "", end: str | None = None) -> list[tuple[str, Value]]: ...
    def commit(self) -> None: ...
    def rollback(self) -> None: ...


class Store(Protocol):
    def begin(self, isolation: str = ...) -> Transaction: ...


@dataclass
class Outcome:
    committed: bool = False
    error: str | None = None  # "ConflictError: ..." ya da "DeadlockError: ..."
    observed: list[object] = field(default_factory=list)  # get/scan sonuçları, sırayla
    commit_index: int | None = None  # kaçıncı onaylanan
    blocked_steps: int = 0


@dataclass
class _State:
    program: Program
    tx: Transaction | None = None
    generator: Generator[Request, object, None] | None = None
    pending: Request | None = None
    done: bool = False


class Scheduler:
    def __init__(self, store: Store, programs: dict[str, Program], isolation: str) -> None:
        self.store = store
        self.isolation = isolation
        self.states = {name: _State(program) for name, program in programs.items()}
        self.outcomes = {name: Outcome() for name in programs}
        self._commits = 0

    def run(
        self, order: Sequence[str] = (), seed: int | None = None, max_steps: int = 100_000
    ) -> dict[str, Outcome]:
        for name in order:
            self.step(name)
        rng = random.Random(seed)
        idle_rounds = 0
        for _ in range(max_steps):
            alive = [name for name, state in self.states.items() if not state.done]
            if not alive:
                return self.outcomes
            name = rng.choice(alive) if seed is not None else alive[0]
            progressed = self.step(name)
            idle_rounds = 0 if progressed else idle_rounds + 1
            if idle_rounds > 10 * len(alive) + 100:
                raise RuntimeError(
                    "İlerleme yok: bütün işlemler bekliyor (algılanmamış kilitlenme)."
                )
        raise RuntimeError("Adım sınırı aşıldı.")

    def step(self, name: str) -> bool:
        """`name` programının sıradaki isteğini yürütür; bir şey ilerlediyse True."""
        state = self.states[name]
        if state.done:
            return False
        if state.tx is None:  # ilk adım: işlemi başlat ve ilk isteği al (sonra hemen yürüt)
            state.tx = self.store.begin(self.isolation)
            state.generator = state.program()
            self._advance(name, None)
        request = state.pending
        assert request is not None
        try:
            result = self._apply(state.tx, request)
        except WouldBlock:
            self.outcomes[name].blocked_steps += 1
            return False
        except TransactionAbortedError as error:
            self._finish(name, error=f"{type(error).__name__}: {error}")
            return True
        if request[0] == "commit":
            self._commits += 1
            self.outcomes[name].commit_index = self._commits
            self._finish(name, committed=True)
            return True
        if request[0] == "rollback":
            self._finish(name, error="rollback")
            return True
        if request[0] in ("get", "scan"):
            self.outcomes[name].observed.append(result)
        self._advance(name, result)
        return True

    def _advance(self, name: str, result: object) -> None:
        state = self.states[name]
        assert state.generator is not None
        try:
            state.pending = state.generator.send(result)
        except StopIteration:
            state.pending = ("commit",)

    @staticmethod
    def _apply(tx: Transaction, request: Request) -> object:
        kind = request[0]
        if kind == "get":
            return tx.get(str(request[1]))
        if kind == "put":
            tx.put(str(request[1]), request[2])  # type: ignore[arg-type]
            return None
        if kind == "delete":
            tx.delete(str(request[1]))
            return None
        if kind == "scan":
            end = request[2] if len(request) > 2 else None
            return tx.scan(str(request[1]), None if end is None else str(end))
        if kind == "commit":
            tx.commit()
            return None
        if kind == "rollback":
            tx.rollback()
            return None
        raise ValueError(f"Bilinmeyen istek: {request!r}")

    def _finish(self, name: str, *, committed: bool = False, error: str | None = None) -> None:
        self.states[name].done = True
        self.outcomes[name].committed = committed
        self.outcomes[name].error = error
