"""Ölçüm: `python -m sutun_deposu olc [--satir 200000] [--tohum 1]`.

Aynı tohumlu satış verisini (yılın günü sıralı, 8 şehir, 50 ürün, %3 iade, rastgele tutar) iki
biçimde kurar ve karşılaştırır: kalıcı bellek (kurulumdan sonra `tracemalloc` ile canlı kalan bayt),
kurulum tepe belleği ve dört sorgunun süresi (3 denemenin en iyisi). Her sorgunun iki tabloda aynı
sonucu verdiği de denetlenir. Rakamlar makineye göre değişir; README'dekiler bu komutla ölçülmüştür.

Genişletme: yeni sorgu → `QUERIES` listesine (başlık, where, group_by, aggregates) satırı.
"""

from __future__ import annotations

import argparse
import functools
import random
import time
import tracemalloc
from collections.abc import Callable
from typing import TypeVar

from .encoding import Value, encoded_size
from .table import Aggregate, ColumnTable, Filter, RowTable

T = TypeVar("T")
NAMES = ["gun", "sehir", "urun", "durum", "tutar"]
CITIES = ["İstanbul", "Ankara", "İzmir", "Bursa", "Antalya", "Konya", "Adana", "Trabzon"]
IZMIR_OVER_500: list[Filter] = [("sehir", "==", "İzmir"), ("tutar", ">", 500)]
QUERIES: list[tuple[str, list[Filter], str | None, list[Aggregate]]] = [
    ("toplam (süzgeçsiz)", [], None, [("tutar", "sum")]),
    ("İzmir ve tutar > 500", IZMIR_OVER_500, None, [("*", "count")]),
    ("şehre göre toplam", [], "sehir", [("tutar", "sum"), ("*", "count")]),
    ("iade, ürüne göre ort.", [("durum", "==", "iade")], "urun", [("tutar", "avg")]),
]


def make_rows(count: int, seed: int) -> list[dict[str, Value]]:
    rng = random.Random(seed)
    return [
        {
            "gun": number * 365 // count,  # yılın günü (0-364), sıralı: RLE'ye uygun
            "sehir": rng.choice(CITIES),
            "urun": f"ürün-{rng.randint(1, 50)}",
            "durum": "iade" if number % 1000 < 30 else "tamam",  # uzun çalışmalar
            "tutar": rng.randint(1, 1000),
        }
        for number in range(count)
    ]


def _measure(build: Callable[[], T]) -> tuple[T, int, int]:
    """(kurulan, kalıcı bayt, tepe bayt): veri kurulum içinde üretilir, böylece iki biçim de kendi
    değer nesnelerinin bedelini öder."""
    tracemalloc.start()
    built = build()
    current, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    return built, current, peak


def _best(run: Callable[[], object]) -> float:
    timings = []
    for _ in range(3):
        started = time.perf_counter()
        run()
        timings.append(time.perf_counter() - started)
    return min(timings)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m sutun_deposu", description=__doc__)
    parser.add_argument("komut", choices=["olc"])
    parser.add_argument("--satir", type=int, default=200_000)
    parser.add_argument("--tohum", type=int, default=1)
    args = parser.parse_args(argv)
    count, seed = args.satir, args.tohum
    columns, column_now, column_peak = _measure(
        lambda: ColumnTable.from_rows(make_rows(count, seed), NAMES)
    )
    rows, row_now, row_peak = _measure(lambda: RowTable(make_rows(count, seed), NAMES))
    print(f"{count} satır")
    print(f"  kalıcı bellek:  sütun {column_now / 1e6:5.1f} MB · satır {row_now / 1e6:5.1f} MB")
    print(f"  kurulum tepesi: sütun {column_peak / 1e6:5.1f} MB · satır {row_peak / 1e6:5.1f} MB")
    for name, column in columns.columns.items():
        size = encoded_size(column) / 1e3
        print(f"  {name:6} {type(column).__name__:10} kodlanmış ~{size:.0f} kB")
    for title, where, group_by, aggregates in QUERIES:
        expected = rows.select(where, group_by, aggregates)
        if columns.select(where, group_by, aggregates) != expected:
            raise RuntimeError(f"'{title}': sütun ve satır tablosu farklı sonuç verdi")
        fast = _best(functools.partial(columns.select, where, group_by, aggregates))
        slow = _best(functools.partial(rows.select, where, group_by, aggregates))
        timing = f"sütun {fast * 1e3:6.1f} ms · satır {slow * 1e3:6.1f} ms"
        print(f"  {title:22} {timing} · {slow / fast:4.1f}× hızlı")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
