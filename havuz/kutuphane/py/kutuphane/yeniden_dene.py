"""yeniden_dene — başarısız işlemi üstel geri çekilme + titreme (jitter) ile yeniden dener; iptal, toplam süre
sınırı, "Retry-After" desteği ve hangi hatada yeniden deneneceği seçimi vardır. Eşzamanlı (`retry`) ve
eşzamansız (`retry_async`) iki biçimi vardır. Süreler SANİYEDİR (TypeScript eşinde milisaniye).

Kullanım:
    veri = retry(lambda deneme: istemci.get(url).raise_for_status().json(), retries=4,
                 should_retry=lambda e, n: not isinstance(e, HttpHatasi) or is_retryable_http_status(e.status))
    veri = await retry_async(lambda deneme: istemci.get(url), retries=4)
    iptal = threading.Event(); retry(fn, cancel=iptal)     # başka iş parçacığından iptal.set()

Bekleme: n. yeniden denemeden önce taban = min(max_delay, min_delay · factor^(n−1)); "full" titreme (varsayılan)
→ 0…taban arası rastgele; "equal" → taban/2 + rastgele(taban/2); "none" → taban.

Sınırlar: Yeniden denenen işlem YAN ETKİSİZ (idempotent) olmalıdır. Varsayılan `should_retry` her Exception'ı yeniden
dener; 4xx gibi kalıcı hataları siz ayırın. Tükenince son hata `RetryError.__cause__` içindedir; `should_retry`
False derse asıl hata olduğu gibi fırlatılır. asyncio'da görev iptali (CancelledError) her zaman yayılır.

Genişletme: Yeni seçenek iki işleve de anahtar sözcük argümanı olarak eklenir ve ortak `_plan_delay` içinde
kullanılır; saat (`clock`), uyku (`sleep`) ve rastgelelik (`rng`) dışarıdan verilebildiği için testte bekleme olmaz.
"""

from __future__ import annotations

import asyncio
import random as _random
import threading
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Literal, TypeVar

__all__ = [
    "RetryCancelledError",
    "RetryError",
    "backoff_delay",
    "is_retryable_http_status",
    "parse_retry_after",
    "retry",
    "retry_async",
]

T = TypeVar("T")
Jitter = Literal["full", "equal", "none"]


class RetryError(Exception):
    """Denemeler ya da süre tükendiğinde fırlatılır; `attempts`, `errors`; son hata `__cause__`."""

    def __init__(self, message: str, attempts: int, errors: list[BaseException]) -> None:
        super().__init__(message)
        self.attempts = attempts
        self.errors = errors


class RetryCancelledError(Exception):
    """`cancel` olayı işaretlendiği için yeniden deneme durduruldu."""


def backoff_delay(
    attempt: int,
    *,
    min_delay: float = 0.2,
    max_delay: float = 30.0,
    factor: float = 2.0,
    jitter: Jitter = "full",
    random_value: float | None = None,
) -> float:
    """n. yeniden denemeden önce beklenecek süre (saniye). `random_value` 0 ≤ r < 1."""
    r = _random.random() if random_value is None else random_value
    base = min(max_delay, min_delay * factor ** max(0, attempt - 1))
    if jitter == "none":
        return base
    if jitter == "equal":
        return base / 2 + r * (base / 2)
    return r * base


def is_retryable_http_status(status: int) -> bool:
    """Geçici olabilecek HTTP durumları: 408, 425, 429, 500, 502, 503, 504."""
    return status in (408, 425, 429, 500, 502, 503, 504)


def parse_retry_after(value: str | None, now: datetime | None = None) -> float | None:
    """ "Retry-After" başlığını saniyeye çevirir: "120" → 120.0; HTTP tarihi → kalan süre; okunamazsa None."""
    text = (value or "").strip()
    if text.isdigit() and text.isascii():
        return float(text)
    try:
        at = parsedate_to_datetime(text)
    except (TypeError, ValueError):
        return None
    if at.tzinfo is None:
        return None
    current = now or datetime.now(UTC)
    return max(0.0, (at - current).total_seconds())


class _Policy:
    """İki biçimin (eşzamanlı/eşzamansız) ortak karar mantığı."""

    def __init__(
        self,
        retries: int,
        min_delay: float,
        max_delay: float,
        factor: float,
        jitter: Jitter,
        max_elapsed: float | None,
        should_retry: Callable[[Exception, int], bool] | None,
        retry_after: Callable[[Exception], float | None] | None,
        on_retry: Callable[[Exception, int, float], None] | None,
        rng: Callable[[], float],
        clock: Callable[[], float],
    ) -> None:
        self.retries, self.min_delay, self.max_delay = retries, min_delay, max_delay
        self.factor, self.jitter, self.max_elapsed = factor, jitter, max_elapsed
        self.should_retry = should_retry or (lambda _error, _attempt: True)
        self.retry_after, self.on_retry, self.rng, self.clock = retry_after, on_retry, rng, clock
        self.started = clock()
        self.errors: list[BaseException] = []

    def plan_delay(self, error: Exception, attempt: int) -> float:
        """Bekleme süresini döndürür ya da asıl hatayı / RetryError'ı fırlatır."""
        self.errors.append(error)
        if not self.should_retry(error, attempt):
            raise error
        if attempt > self.retries:
            raise RetryError(
                f"{attempt} denemenin hepsi başarısız oldu.", attempt, self.errors
            ) from error
        requested = self.retry_after(error) if self.retry_after else None
        delay = min(
            self.max_delay,
            requested
            if requested is not None
            else backoff_delay(
                attempt,
                min_delay=self.min_delay,
                max_delay=self.max_delay,
                factor=self.factor,
                jitter=self.jitter,
                random_value=self.rng(),
            ),
        )
        if self.max_elapsed is not None and self.clock() - self.started + delay > self.max_elapsed:
            raise RetryError(
                f"Süre sınırı ({self.max_elapsed} sn) doldu; {attempt} deneme yapıldı.",
                attempt,
                self.errors,
            ) from error
        if self.on_retry:
            self.on_retry(error, attempt, delay)
        return delay


def retry(
    fn: Callable[[int], T],
    *,
    retries: int = 3,
    min_delay: float = 0.2,
    max_delay: float = 30.0,
    factor: float = 2.0,
    jitter: Jitter = "full",
    max_elapsed: float | None = None,
    should_retry: Callable[[Exception, int], bool] | None = None,
    retry_after: Callable[[Exception], float | None] | None = None,
    on_retry: Callable[[Exception, int, float], None] | None = None,
    cancel: threading.Event | None = None,
    sleep: Callable[[float], None] = time.sleep,
    rng: Callable[[], float] = _random.random,
    clock: Callable[[], float] = time.monotonic,
) -> T:
    """`fn(deneme_no)`'yu başarılı olana, denemeler tükenene, süre dolana ya da iptal edilene kadar çalıştırır."""
    policy = _Policy(
        retries, min_delay, max_delay, factor, jitter, max_elapsed, should_retry, retry_after,
        on_retry, rng, clock,
    )  # fmt: skip
    attempt = 1
    while True:
        if cancel is not None and cancel.is_set():
            raise RetryCancelledError("Yeniden deneme iptal edildi.")
        try:
            return fn(attempt)
        except Exception as error:
            delay = policy.plan_delay(error, attempt)
        if cancel is not None:
            if cancel.wait(delay):
                raise RetryCancelledError("Yeniden deneme iptal edildi.")
        else:
            sleep(delay)
        attempt += 1


async def retry_async(
    fn: Callable[[int], Awaitable[T]],
    *,
    retries: int = 3,
    min_delay: float = 0.2,
    max_delay: float = 30.0,
    factor: float = 2.0,
    jitter: Jitter = "full",
    max_elapsed: float | None = None,
    should_retry: Callable[[Exception, int], bool] | None = None,
    retry_after: Callable[[Exception], float | None] | None = None,
    on_retry: Callable[[Exception, int, float], None] | None = None,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    rng: Callable[[], float] = _random.random,
    clock: Callable[[], float] = time.monotonic,
) -> T:
    """`retry`'ın eşzamansız biçimi; iptal için görevi iptal edin (task.cancel())."""
    policy = _Policy(
        retries, min_delay, max_delay, factor, jitter, max_elapsed, should_retry, retry_after,
        on_retry, rng, clock,
    )  # fmt: skip
    attempt = 1
    while True:
        try:
            return await fn(attempt)
        except Exception as error:
            delay = policy.plan_delay(error, attempt)
        await sleep(delay)
        attempt += 1
