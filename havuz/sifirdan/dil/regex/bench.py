"""Karşılaştırmalı küçük ölçüm: felaket desen `(a+)+b` üzerinde Python `re` ↔ bu motor.

`re` geri izlediği için "a"*n metninde (b yok) süre n ile ÜSTEL büyür; bu motor doğrusal kalır.
Ölçüm `time.perf_counter` ile, her ölçü bir kez (ısınmasız) alınır; makine paylaşımlıysa oynar.
`re` için n küçük tutulur (n=24 bile saniyeler sürebilir).
Kullanan: `python -m regex olc`. Genişletme: `CASES` listesine başka felaket desenler ekleyin.
"""

from __future__ import annotations

import re
import time
from collections.abc import Callable
from functools import partial

from .api import Pattern

CASES = [
    (r"(a+)+b", "a"),
    (r"(a|aa)+c", "a"),
    (r"(a*)*b", "a"),
]
RE_SIZES = [12, 16, 18, 20, 22]
OUR_SIZES = [12, 16, 18, 20, 22, 1_000, 10_000]


def timed(fn: Callable[[], object]) -> float:
    start = time.perf_counter()
    fn()
    return time.perf_counter() - start


def measure(pattern: str, unit: str) -> list[tuple[int, float | None, float]]:
    """(n, re süresi ya da None, bu motorun süresi) satırları."""
    ours = Pattern(pattern)
    ref = re.compile(pattern)
    rows: list[tuple[int, float | None, float]] = []
    for n in OUR_SIZES:
        text = unit * n
        ref_time = timed(partial(ref.search, text)) if n in RE_SIZES else None
        rows.append((n, ref_time, timed(partial(ours.search, text))))
    return rows


def report() -> str:
    lines = ["Felaket desen ölçümü (saniye; tek ölçüm, time.perf_counter)", ""]
    for pattern, unit in CASES:
        lines.append(f"desen {pattern!r}, metin {unit!r} * n (eşleşme yok)")
        lines.append(f"{'n':>8} {'re':>10} {'bu motor':>10}")
        for n, ref_time, our_time in measure(pattern, unit):
            shown = f"{ref_time:10.4f}" if ref_time is not None else f"{'(atlandı)':>10}"
            lines.append(f"{n:>8} {shown} {our_time:10.4f}")
        lines.append("")
    return "\n".join(lines)
