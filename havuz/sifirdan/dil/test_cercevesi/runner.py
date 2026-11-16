"""Koşucu: her test durumunu fixture'larıyla çalıştırır, sonucu (geçti/kaldı/atlandı/hata) kaydeder.

Sonuçlar: GEÇTİ; KALDI (assert ya da beklenmeyen istisna ya da zaman aşımı); ATLANDI (`@skip`,
`skip_now`); HATA (fixture kurulamadı/temizlenemedi, dosya yüklenemedi). Zaman aşımı ana iş
parçacığında SIGALRM ile testi gerçekten keser; başka iş parçacığında (Windows dahil) testi
ayrı bir iş parçacığında bekler (süre dolunca rapor eder ama arka plandaki iş durdurulamaz).
Genişletme: yeni bir sonuç türü için `Outcome` sabitlerine ve report.py'ye ekleyin.
"""

from __future__ import annotations

import signal
import threading
import time
import traceback
import types
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .discovery import CollectionError, TestCase
from .fixtures import FixtureError, FixtureScope, Resolver
from .markers import SkipTest, TestTimeout

PASSED, FAILED, SKIPPED, ERROR = "geçti", "kaldı", "atlandı", "hata"


@dataclass
class Result:
    id: str
    outcome: str
    message: str = ""
    location: str = ""  # "dosya.py:12" — başarısızlığın test dosyasındaki satırı
    duration: float = 0.0


def call_with_timeout(fn: Callable[[], Any], seconds: float | None) -> None:
    if seconds is None:
        fn()
        return
    shown = f"{seconds:g}".replace(".", ",")
    if threading.current_thread() is threading.main_thread() and hasattr(signal, "setitimer"):

        def alarm(signum: int, frame: object) -> None:
            raise TestTimeout(f"zaman aşımı: test {shown} sn içinde bitmedi")

        previous = signal.signal(signal.SIGALRM, alarm)
        signal.setitimer(signal.ITIMER_REAL, seconds)
        try:
            fn()
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
            signal.signal(signal.SIGALRM, previous)
        return
    errors: list[BaseException] = []

    def target() -> None:
        try:
            fn()
        except BaseException as exc:
            errors.append(exc)

    worker = threading.Thread(target=target, daemon=True)
    worker.start()
    worker.join(seconds)
    if worker.is_alive():
        raise TestTimeout(f"zaman aşımı: test {shown} sn içinde bitmedi (arka planda sürüyor)")
    if errors:
        raise errors[0]


def failure_location(exc: BaseException, module: types.ModuleType) -> str:
    """İstisnanın test dosyasındaki EN SON satırı (yardımcı işlevlerin içi değil)."""
    test_file = getattr(module, "__file__", "")
    found = ""
    for frame in traceback.extract_tb(exc.__traceback__):
        if frame.filename == test_file:
            found = f"{Path(frame.filename).name}:{frame.lineno}"
    return found


def describe(exc: BaseException) -> str:
    if isinstance(exc, (AssertionError, TestTimeout)) and str(exc):
        return str(exc)
    if isinstance(exc, AssertionError):
        return "Beklenti tutmadı (assert)"
    return f"{type(exc).__name__}: {exc}"


def run_case(case: TestCase, module_scope: FixtureScope, default_timeout: float | None) -> Result:
    started = time.perf_counter()
    skip_reason = getattr(case.function, "__tc_skip__", None)
    if skip_reason is not None:
        return Result(case.id, SKIPPED, skip_reason)
    test_scope = FixtureScope()
    resolver = Resolver(case.module, module_scope, test_scope)
    result: Result
    try:
        args = resolver.arguments(case.function, case.params)
    except (FixtureError, Exception) as exc:
        result = Result(case.id, ERROR, f"fixture kurulamadı: {describe(exc)}")
    else:
        seconds = getattr(case.function, "__tc_timeout__", default_timeout)
        try:
            call_with_timeout(lambda: case.function(**args), seconds)
            result = Result(case.id, PASSED)
        except SkipTest as exc:
            result = Result(case.id, SKIPPED, str(exc))
        except Exception as exc:
            result = Result(case.id, FAILED, describe(exc), failure_location(exc, case.module))
    problems = test_scope.teardown()
    if problems and result.outcome != FAILED:
        result = Result(case.id, ERROR, "\n".join(problems))
    result.duration = time.perf_counter() - started
    return result


def run_all(
    cases: list[TestCase],
    errors: list[CollectionError],
    *,
    stop_first: bool = False,
    default_timeout: float | None = None,
    on_result: Callable[[Result], None] | None = None,
) -> list[Result]:
    results = [Result(str(e.path.name), ERROR, f"dosya yüklenemedi:\n{e.message}") for e in errors]
    module_scopes: dict[str, FixtureScope] = {}
    for case in cases:
        scope = module_scopes.setdefault(case.module.__name__, FixtureScope())
        result = run_case(case, scope, default_timeout)
        results.append(result)
        if on_result is not None:
            on_result(result)
        if stop_first and result.outcome in (FAILED, ERROR):
            break
    for name, scope in module_scopes.items():
        for problem in scope.teardown():
            results.append(Result(name, ERROR, problem))
    return results
