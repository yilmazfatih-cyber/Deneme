"""Komut satırı çıktısı: bilgi, uyarı, sonuç ve düz tablo yazdırma.

Kim kullanır: komutlar ve uzun işlemler. Çıktı düz metindir (renk yok) ki günlük dosyasına ya da bir
modele yapıştırıldığında bozulmasın. Sonuçlar stdout'a, ilerleme ve uyarılar stderr'e yazılır; böylece
`... > sonuc.txt` yalnız sonucu yakalar. Kaynak: `havuz/ince-ayar/ince_ayar/console.py`.

Genişletme: yeni bir çıktı biçimi gerekiyorsa buraya küçük bir işlev ekleyin.
"""

from __future__ import annotations

import json
import sys
import time
from collections.abc import Sequence
from typing import Any


def info(message: str) -> None:
    """İlerleme bilgisi (stderr)."""
    print(message, file=sys.stderr, flush=True)


def warn(message: str) -> None:
    """Uyarı (stderr)."""
    print(f"UYARI: {message}", file=sys.stderr, flush=True)


def result(message: str = "") -> None:
    """Komutun asıl sonucu (stdout)."""
    print(message, flush=True)


def result_json(payload: Any) -> None:
    """Sonucu okunaklı JSON olarak yazar (Türkçe karakterler kaçışsız)."""
    print(json.dumps(payload, ensure_ascii=False, indent=2), flush=True)


class Progress:
    """Uzun döngülerde en çok birkaç saniyede bir "12/340" satırı basar (stderr)."""

    def __init__(self, label: str, total: int, every_seconds: float = 5.0) -> None:
        self.label, self.total, self.every = label, total, every_seconds
        self._last = time.monotonic()

    def step(self, done: int) -> None:
        now = time.monotonic()
        if done == self.total or now - self._last >= self.every:
            info(f"{self.label}: {done}/{self.total}")
            self._last = now


def format_table(headers: Sequence[str], rows: Sequence[Sequence[Any]]) -> str:
    """Hizalı düz metin tablosu üretir. Sayılar sağa, metin sola yaslanır."""
    cells = [[_cell(value) for value in row] for row in rows]
    widths = [len(h) for h in headers]
    for row in cells:
        for index, value in enumerate(row):
            widths[index] = max(widths[index], len(value))
    numeric = [
        bool(rows) and all(_is_number(row[index]) for row in rows) for index in range(len(headers))
    ]
    lines = ["  ".join(h.ljust(w) for h, w in zip(headers, widths, strict=True)).rstrip()]
    lines.append("  ".join("-" * w for w in widths))
    for row in cells:
        parts = [
            value.rjust(width) if numeric[index] else value.ljust(width)
            for index, (value, width) in enumerate(zip(row, widths, strict=True))
        ]
        lines.append("  ".join(parts).rstrip())
    return "\n".join(lines)


def _cell(value: Any) -> str:
    if isinstance(value, float):
        return f"{value:.4f}"
    return str(value)


def _is_number(value: Any) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool)
