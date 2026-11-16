"""Sıralı kaynakları "en yeni kazanır" kuralıyla birleştiren yineleyici (tarama ve birleştirme
kullanır).

Kaynaklar yeniden eskiye verilir (0 = bellek tablosu, sonra en yeni SSTable…). Aynı anahtar birden
çok kaynakta varsa yalnız en yeni kaynaktaki girdi geçer; eskiler gölgelenir. Silme işaretleri
(değer None) olduğu gibi geçer; atıp atmamak çağıranın kararıdır.

Genişletme: anlık görüntü okumaları için girdilere sıra numarası ekleyip "seq <= anlık" süzgeci
koyun.
"""

from __future__ import annotations

import heapq
from collections.abc import Iterable, Iterator

Entry = tuple[bytes, bytes | None]


def _tag(rank: int, source: Iterable[Entry]) -> Iterator[tuple[bytes, int, bytes | None]]:
    # Ayrı bir işlev: döngü değişkeni `rank`ın geç bağlanma tuzağına düşmemek için.
    for key, value in source:
        yield key, rank, value


def merge_newest_first(sources: list[Iterable[Entry]]) -> Iterator[Entry]:
    """Her kaynak kendi içinde sıralı ve tekil olmalı; çıktı sıralı ve tekildir."""
    tagged = [_tag(rank, source) for rank, source in enumerate(sources)]
    previous: bytes | None = None
    # (anahtar, sıra) çiftleri tekildir; değerler hiç karşılaştırılmaz.
    for key, _rank, value in heapq.merge(*tagged):
        if key == previous:
            continue
        previous = key
        yield key, value
