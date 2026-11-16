"""İşlem hataları. `ConflictError` ve `DeadlockError` alan işlem ZATEN geri alınmıştır: yeniden
deneyin.

Genişletme: yeni bir iptal nedeni (ör. zaman aşımı) → `TransactionAbortedError`'dan türetin.
"""

from __future__ import annotations


class TransactionError(Exception):
    """İşlemle ilgili bütün hataların atası."""


class TransactionAbortedError(TransactionError):
    """İşlem iptal edildi (etkileri geri alındı). Aynı işi yeni bir işlemle yeniden deneyin."""


class ConflictError(TransactionAbortedError):
    """Serileştirme hatası: başka bir işlem aynı veriyi önce değiştirdi (ilk onaylayan kazanır)."""


class DeadlockError(TransactionAbortedError):
    """Kilitlenme: bekleme çizgesinde döngü vardı; bu işlem kurban seçildi."""


class WouldBlock(TransactionError):  # noqa: N818  (bir "hata" değil, "şimdi olmaz" sinyali)
    """Kilit şu an alınamıyor; işlem bekliyor. Aynı işlemi sonra yeniden deneyin."""


class TransactionClosedError(TransactionError):
    """Onaylanmış ya da geri alınmış işlem yeniden kullanılmaya çalışıldı."""
