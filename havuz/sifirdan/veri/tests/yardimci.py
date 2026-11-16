"""Testlerin ortak yardımcıları (tohum sayısı seçimi).

Genişletme: birden çok mini sistemin testinde işe yarayan küçük yardımcılar buraya eklenir; bir sisteme
özgü olanlar o sistemin `tests/<sistem>/` klasöründe kalır.
"""

from __future__ import annotations

import os


def is_long_run() -> bool:
    """`python scripts/check.py --uzun` ile mi koşuyoruz?"""
    return os.environ.get("SIFIRDAN_UZUN") == "1"


def seed_count(fast: int, long: int) -> int:
    """Tohumlu rastgele senaryo döngülerinde kaç tohum deneneceğini seçer."""
    return long if is_long_run() else fast
