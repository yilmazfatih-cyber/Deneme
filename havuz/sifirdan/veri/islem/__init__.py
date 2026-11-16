"""islem: işlemsel bellek içi depolar — MVCC (anlık görüntü yalıtımı) ve katı iki aşamalı kilitleme.

Kullanım:
    from islem import MVCCStore, SNAPSHOT, ConflictError
    store = MVCCStore()
    tx = store.begin(SNAPSHOT)
    tx.put("bakiye", 100)
    tx.commit()                    # çakışma varsa ConflictError: yeni işlemle yeniden deneyin

Genişletme: yeni genel API'yi buraya ve README'deki "Dosya haritası"na ekleyin.
"""

from .errors import (
    ConflictError,
    DeadlockError,
    TransactionAbortedError,
    TransactionClosedError,
    TransactionError,
    WouldBlock,
)
from .locks import LockManager
from .mvcc import READ_COMMITTED, SERIALIZABLE, SNAPSHOT, MVCCStore, MVCCTransaction
from .scheduler import Outcome, Scheduler
from .two_phase import LockingStore, LockingTransaction

__all__ = [
    "READ_COMMITTED",
    "SERIALIZABLE",
    "SNAPSHOT",
    "ConflictError",
    "DeadlockError",
    "LockManager",
    "LockingStore",
    "LockingTransaction",
    "MVCCStore",
    "MVCCTransaction",
    "Outcome",
    "Scheduler",
    "TransactionAbortedError",
    "TransactionClosedError",
    "TransactionError",
    "WouldBlock",
]
