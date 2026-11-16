"""Mini test çerçevesi: keşif, fixture, parametreli test, beklenen istisna, zaman aşımı, rapor.

Bir test dosyası (`test_*.py`):
    from test_cercevesi import fixture, parametrize, raises

    @fixture
    def sepet():
        yield ["elma"]          # yield sonrası: temizlik

    @parametrize("a, b, toplam", [(1, 2, 3), (2, 2, 4)])
    def test_topla(a, b, toplam):
        assert a + b == toplam  # kalırsa iki tarafın değeri gösterilir

Çalıştırma: `python -m test_cercevesi klasor_ya_da_dosya` ya da `run([Path(...)])`.
Boru hattı: discovery.py (bul + yükle; rewrite.py assert'leri yeniden yazar) → runner.py
(fixtures.py ile kur/çalıştır/temizle) → report.py. Genişletme: README.md "Buradan nereye".
"""

from __future__ import annotations

from pathlib import Path

from .discovery import TestCase, collect, matches_keyword
from .markers import SkipTest, TestTimeout, fixture, parametrize, raises, skip, skip_now, timeout
from .runner import ERROR, FAILED, PASSED, SKIPPED, Result, run_all

__all__ = [
    "ERROR",
    "FAILED",
    "PASSED",
    "SKIPPED",
    "Result",
    "SkipTest",
    "TestCase",
    "TestTimeout",
    "fixture",
    "parametrize",
    "raises",
    "run",
    "skip",
    "skip_now",
    "timeout",
]


def run(paths: list[Path], keyword: str | None = None, stop_first: bool = False) -> list[Result]:
    """Testleri bulur ve çalıştırır; sonuç listesini döndürür (rapor yazmaz)."""
    cases, errors = collect(paths)
    if keyword:
        cases = [c for c in cases if matches_keyword(c.id, keyword)]
    return run_all(cases, errors, stop_first=stop_first)
