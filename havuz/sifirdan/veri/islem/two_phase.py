"""Katı iki aşamalı kilitleme (strict 2PL) deposu: tek sürüm, yerinde yazma, geri alma günlüğü.

Kural: işlem yalnız kilit ALIR (büyüme evresi); bütün kilitler onay ya da geri almada BİRLİKTE
bırakılır (katı 2PL). Böylece başkasının onaylanmamış yazmasını okumak olanaksızdır ve onay sırası
geçerli bir seri sıradır. Yazma yerinde yapılır; eski değer geri alma günlüğüne (undo log) yazılır.

İşlemler `WouldBlock` alırsa aynı çağrıyı sonra yeniden yapmalıdır (bkz. scheduler.py);
`DeadlockError` alan işlem zaten geri alınmıştır.

Genişletme: gerçek iş parçacıklarıyla kullanmak için `acquire`'ı bir `threading.Condition`
döngüsüyle sarın: WouldBlock gelince `wait()`, her `release_all`'da `notify_all()`.
"""

from __future__ import annotations

from .errors import DeadlockError, TransactionClosedError
from .locks import ROOT, LockManager
from .mvcc import Value


class LockingStore:
    """Tek sürümlü anahtar-değer deposu + kilit yöneticisi."""

    def __init__(self) -> None:
        self.data: dict[str, Value] = {}
        self.locks = LockManager()
        self._next_id = 1

    def begin(self, isolation: str = "serializable") -> LockingTransaction:
        del isolation  # katı 2PL her zaman serileştirilebilirdir
        tx = LockingTransaction(self, self._next_id)
        self._next_id += 1
        return tx

    def snapshot(self) -> dict[str, Value]:
        return dict(self.data)


class LockingTransaction:
    def __init__(self, store: LockingStore, tx_id: int) -> None:
        self.store = store
        self.id = tx_id
        self.undo: list[tuple[str, bool, Value | None]] = []  # (anahtar, vardı_mı, eski değer)
        self.status = "active"

    def _check(self) -> None:
        if self.status != "active":
            raise TransactionClosedError(
                f"İşlem {self.id} zaten {self.status}; yeni işlem başlatın."
            )

    def _lock(self, resource: str, mode: str) -> None:
        try:
            self.store.locks.acquire(self.id, resource, mode)
        except DeadlockError:
            self._abort()
            raise

    def get(self, key: str) -> Value | None:
        self._check()
        self._lock(ROOT, "IS")
        self._lock(key, "S")
        return self.store.data.get(key)

    def _write(self, key: str) -> None:
        self._check()
        self._lock(ROOT, "IX")
        self._lock(key, "X")
        if all(written != key for written, _, _ in self.undo):
            self.undo.append((key, key in self.store.data, self.store.data.get(key)))

    def put(self, key: str, value: Value) -> None:
        self._write(key)
        self.store.data[key] = value

    def delete(self, key: str) -> None:
        self._write(key)
        self.store.data.pop(key, None)

    def scan(self, start: str = "", end: str | None = None) -> list[tuple[str, Value]]:
        """Aralık okuması: bütün depoya S kilidi (yazıcılar bekler → hayalet satır olmaz)."""
        self._check()
        self._lock(ROOT, "S")
        return sorted(
            (key, value)
            for key, value in self.store.data.items()
            if key >= start and (end is None or key < end)
        )

    def commit(self) -> None:
        self._check()
        self.status = "committed"
        self.store.locks.release_all(self.id)

    def rollback(self) -> None:
        self._check()
        self._abort()

    def _abort(self) -> None:
        for key, existed, old in reversed(self.undo):
            if existed and old is not None:
                self.store.data[key] = old
            else:
                self.store.data.pop(key, None)
        self.undo.clear()
        self.status = "aborted"
        self.store.locks.release_all(self.id)
