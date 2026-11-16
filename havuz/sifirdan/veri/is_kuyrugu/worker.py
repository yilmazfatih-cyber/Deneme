"""İşçi: kuyruktan iş alır, türüne göre işleyiciyi çağırır, sonuca göre onaylar ya da hata kaydeder.

İşleyici (handler) `def isle(job: Job) -> None` biçimindedir; istisna fırlatırsa iş geri çekilmeyle yeniden
denenir. Teslim EN AZ BİR KEZDİR: aynı iş iki kez işlenebilir (işçi onaydan hemen önce çökerse). Yan etkisi
olan işleyiciler `job.idempotency_key` ya da iş kimliğiyle "bunu zaten yaptım mı?" diye bakmalıdır
(örnek: tests/is_kuyrugu/test_queue.py → test_worker_crash_is_at_least_once_but_effect_once).

Genişletme: uzun işler için ayrı bir iş parçacığında `queue.extend(job)` ile kirayı yenileyen kalp atışı.
"""

from __future__ import annotations

from collections.abc import Callable

from .queue import Job, JobQueue, LeaseLostError

Handler = Callable[[Job], None]


class Worker:
    def __init__(self, queue: JobQueue, name: str, queue_name: str, handler: Handler) -> None:
        self.queue = queue
        self.name = name
        self.queue_name = queue_name
        self.handler = handler
        self.processed = 0
        self.failed = 0

    def run_once(self) -> bool:
        """Bir iş işler; iş yoksa False."""
        self.queue.tick()  # zamanı gelen yinelenen işleri de sıraya koy
        job = self.queue.reserve(self.queue_name, self.name)
        if job is None:
            return False
        try:
            self.handler(job)
        except Exception as error:  # işleyicinin her hatası "yeniden dene" demektir
            self.failed += 1
            try:
                self.queue.fail(job, f"{type(error).__name__}: {error}")
            except LeaseLostError:
                pass  # kira zaten düşmüş: iş başka işçide
            return True
        try:
            self.queue.ack(job)
            self.processed += 1
        except LeaseLostError:
            pass  # geç kaldık; başka işçi aynı işi yeniden alacak/aldı (en az bir kez)
        return True

    def drain(self, limit: int = 10_000) -> int:
        """Kuyruk boşalana (ya da `limit` işe) dek işler; işlenen iş sayısını döndürür."""
        count = 0
        while count < limit and self.run_once():
            count += 1
        return count
