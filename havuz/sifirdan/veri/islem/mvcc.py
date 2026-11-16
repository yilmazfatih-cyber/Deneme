"""MVCC deposu: her anahtarın sürüm zinciri; okuyucu yazıcıyı, yazıcı okuyucuyu beklemez.

Her onay (commit) artan bir zaman damgası alır; sürüm = (onay_zamanı, değer | SİLİNDİ). İşlem
başladığında bir anlık görüntü zamanı (`start_ts`) alır ve yalnız o ana dek onaylanmış sürümleri
görür. Yazmalar onaya dek işlemin özel yazma kümesinde durur (kirli okuma olanaksız).

Yalıtım düzeyleri:
- READ_COMMITTED: her okuma o anki son onaylı sürümü görür; onayda denetim yok.
- SNAPSHOT: anlık görüntü + "ilk onaylayan kazanır": yazdığı anahtarı başkası start_ts'den sonra
  onayladıysa ConflictError. Yazma çarpıklığı (write skew) OLUR (README'de örnek).
- SERIALIZABLE: SNAPSHOT + okuma kümesi ve taranan aralıkların doğrulanması (iyimser eşzamanlılık,
  geriye doğrulama). Onay sırası geçerli bir seri sıradır.

Genişletme: SSI (Cahill) için okuma-yazma bağımlılık kenarlarını izleyip yalnız "tehlikeli yapı"da
iptal edin; şimdiki doğrulama daha kötümserdir (gereğinden fazla iptal edebilir ama asla yanlış
onaylamaz).
"""

from __future__ import annotations

import bisect
import threading

from .errors import ConflictError, TransactionClosedError

Value = int | float | str | bytes | bool
READ_COMMITTED = "read_committed"
SNAPSHOT = "snapshot"
SERIALIZABLE = "serializable"
_LEVELS = (READ_COMMITTED, SNAPSHOT, SERIALIZABLE)


class _Deleted:
    def __repr__(self) -> str:
        return "SİLİNDİ"


DELETED = _Deleted()
Stored = Value | _Deleted


class MVCCStore:
    """Çok sürümlü, iş parçacığı güvenli anahtar-değer deposu (anahtarlar `str`)."""

    def __init__(self) -> None:
        self._versions: dict[str, tuple[list[int], list[Stored]]] = {}  # onay zamanları, değerler
        self._clock = 0  # son onaylanan işlemin zamanı
        self._commit_log: list[tuple[int, frozenset[str]]] = []  # (onay_zamanı, yazılan anahtarlar)
        self._active: dict[int, int] = {}  # işlem no → start_ts
        self._next_id = 1
        self._lock = threading.Lock()

    def begin(self, isolation: str = SNAPSHOT) -> MVCCTransaction:
        if isolation not in _LEVELS:
            raise ValueError(f"Yalıtım düzeyi {_LEVELS} değerlerinden biri olmalı.")
        with self._lock:
            tx_id = self._next_id
            self._next_id += 1
            self._active[tx_id] = self._clock
            return MVCCTransaction(self, tx_id, self._clock, isolation)

    # ── İşlemlerin kullandığı iç yardımcılar ───────────────────────────────────────────────────

    def _read(self, key: str, as_of: int) -> Stored:
        with self._lock:
            chain = self._versions.get(key)
            if chain is None:
                return DELETED
            position = bisect.bisect_right(chain[0], as_of) - 1
            return chain[1][position] if position >= 0 else DELETED

    def _keys_between(self, start: str, end: str | None) -> list[str]:
        with self._lock:
            return sorted(k for k in self._versions if k >= start and (end is None or k < end))

    def _committed_after(self, ts: int) -> set[str]:
        """`ts`'den sonra onaylanan işlemlerin yazdığı anahtarlar."""
        keys: set[str] = set()
        position = bisect.bisect_right([entry[0] for entry in self._commit_log], ts)
        for _, written in self._commit_log[position:]:
            keys |= written
        return keys

    def _commit(self, tx: MVCCTransaction) -> int:
        with self._lock:
            if tx.isolation != READ_COMMITTED:
                changed = self._committed_after(tx.start_ts)
                clash = sorted(changed & tx.writes.keys())
                if clash:
                    raise ConflictError(f"'{clash[0]}' anahtarını başka bir işlem önce onayladı.")
                if tx.isolation == SERIALIZABLE:
                    stale = sorted(changed & tx.read_keys)
                    stale += [k for k in changed if any(_in(k, lo, hi) for lo, hi in tx.ranges)]
                    if stale:
                        raise ConflictError(f"Okunan '{stale[0]}' anahtarı işlem sürerken değişti.")
            self._clock += 1
            for key, value in tx.writes.items():
                times, values = self._versions.setdefault(key, ([], []))
                times.append(self._clock)
                values.append(value)
            if tx.writes:
                self._commit_log.append((self._clock, frozenset(tx.writes)))
            return self._clock

    def _finish(self, tx_id: int) -> None:
        with self._lock:
            self._active.pop(tx_id, None)

    # ── Bakım ve gözlem ─────────────────────────────────────────────────────────────────────────

    def vacuum(self) -> int:
        """Hiçbir etkin işlemin göremeyeceği eski sürümleri siler; silinen sürüm sayısını
        döndürür."""
        with self._lock:
            horizon = min(self._active.values(), default=self._clock)
            removed = 0
            for key in list(self._versions):
                times, values = self._versions[key]
                keep_from = max(0, bisect.bisect_right(times, horizon) - 1)
                removed += keep_from
                del times[:keep_from], values[:keep_from]
                if len(values) == 1 and values[0] is DELETED and times[0] <= horizon:
                    del self._versions[key]
                    removed += 1
            position = bisect.bisect_right([entry[0] for entry in self._commit_log], horizon)
            del self._commit_log[:position]
            return removed

    def version_count(self) -> int:
        with self._lock:
            return sum(len(times) for times, _ in self._versions.values())

    def snapshot(self) -> dict[str, Value]:
        """Son onaylı durumun kopyası (testler ve gözlem için)."""
        with self._lock:
            result: dict[str, Value] = {}
            for key, (_, values) in self._versions.items():
                if not isinstance(values[-1], _Deleted):
                    result[key] = values[-1]
            return result


def _in(key: str, start: str, end: str | None) -> bool:
    return key >= start and (end is None or key < end)


class MVCCTransaction:
    def __init__(self, store: MVCCStore, tx_id: int, start_ts: int, isolation: str) -> None:
        self.store = store
        self.id = tx_id
        self.start_ts = start_ts
        self.isolation = isolation
        self.writes: dict[str, Stored] = {}
        self.read_keys: set[str] = set()
        self.ranges: list[tuple[str, str | None]] = []
        self.status = "active"  # active, committed, aborted
        self.commit_ts: int | None = None

    def _view_time(self) -> int:
        if self.isolation == READ_COMMITTED:
            return self.store._clock  # her okuma en yeni onaylıyı görür
        return self.start_ts

    def _check(self) -> None:
        if self.status != "active":
            raise TransactionClosedError(
                f"İşlem {self.id} zaten {self.status}; yeni işlem başlatın."
            )

    def get(self, key: str) -> Value | None:
        self._check()
        if key in self.writes:  # kendi yazdığını görür
            own = self.writes[key]
            return None if isinstance(own, _Deleted) else own
        self.read_keys.add(key)
        value = self.store._read(key, self._view_time())
        return None if isinstance(value, _Deleted) else value

    def put(self, key: str, value: Value) -> None:
        self._check()
        self.writes[key] = value

    def delete(self, key: str) -> None:
        self._check()
        self.writes[key] = DELETED

    def scan(self, start: str = "", end: str | None = None) -> list[tuple[str, Value]]:
        """[start, end) aralığı, anahtar sırasıyla (anlık görüntü + kendi yazmaları)."""
        self._check()
        self.ranges.append((start, end))
        keys = set(self.store._keys_between(start, end))
        keys |= {key for key in self.writes if _in(key, start, end)}
        result: list[tuple[str, Value]] = []
        for key in sorted(keys):
            if key in self.writes:
                value: Stored = self.writes[key]
            else:
                value = self.store._read(key, self._view_time())
            if not isinstance(value, _Deleted):
                result.append((key, value))
        return result

    def commit(self) -> None:
        """Onaylar; çakışma varsa işlemi geri alır ve ConflictError fırlatır."""
        self._check()
        try:
            self.commit_ts = self.store._commit(self)
        except ConflictError:
            self._close("aborted")
            raise
        self._close("committed")

    def rollback(self) -> None:
        self._check()
        self._close("aborted")

    def _close(self, status: str) -> None:
        self.status = status
        if status == "aborted":
            self.writes.clear()
        self.store._finish(self.id)
