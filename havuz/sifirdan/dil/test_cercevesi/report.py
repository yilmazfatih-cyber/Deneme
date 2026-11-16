"""Sade raporlayıcı: ilerleme (nokta ya da satır satır), başarısızlık ayrıntıları ve özet.

Nokta kipinde: `.` geçti, `K` kaldı, `A` atlandı, `H` hata. Özet Türkçe ve ondalık virgüllüdür:
"5 geçti, 1 kaldı, 1 atlandı, 0 hata (0,12 sn)".
Genişletme: JUnit XML gibi makine okur bir çıktı için `Result` listesini dolaşan yeni bir işlev yazın.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Callable

from .runner import ERROR, FAILED, PASSED, SKIPPED, Result

SYMBOLS = {PASSED: ".", FAILED: "K", SKIPPED: "A", ERROR: "H"}
WORDS = {PASSED: "GEÇTİ", FAILED: "KALDI", SKIPPED: "ATLANDI", ERROR: "HATA"}


def progress(verbose: bool, write: Callable[[str], None]) -> Callable[[Result], None]:
    def show(result: Result) -> None:
        if verbose:
            extra = f" ({result.message})" if result.outcome == SKIPPED and result.message else ""
            write(f"{result.id} {WORDS[result.outcome]}{extra}\n")
        else:
            write(SYMBOLS[result.outcome])

    return show


def summary(results: list[Result], seconds: float) -> str:
    counts = Counter(r.outcome for r in results)
    parts = ", ".join(f"{counts.get(kind, 0)} {kind}" for kind in (PASSED, FAILED, SKIPPED, ERROR))
    return f"{parts} ({seconds:.2f} sn)".replace(".", ",")


def failures(results: list[Result]) -> str:
    bad = [r for r in results if r.outcome in (FAILED, ERROR)]
    if not bad:
        return ""
    lines = ["", "=== KALAN VE HATALI TESTLER ==="]
    for result in bad:
        where = f" [{result.location}]" if result.location else ""
        lines.append(f"--- {result.id} ({result.outcome}){where}")
        lines.append(result.message)
    return "\n".join(lines) + "\n"
