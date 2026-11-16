"""Ortak tip adları: paketin her yerinde aynı kısa adlar kullanılsın diye.

`Array` ve `IntArray` bilerek gevşektir (`NDArray[Any]`): numpy'ın tip tanımları çok ayrıntılıdır
ve sıkı dtype tipleri, doğru çalışan sıradan kodda bile anlaşılması zor mypy hataları üretir.
Adlar niyeti belgeler: `Array` kayan noktalı veri, `IntArray` indeks/etiket dizisi demektir.

Kim kullanır: bütün alt paketler.
Genişletme: yeni bir ortak tip gerekiyorsa buraya ekleyin; alt paketlerde yeniden tanımlamayın.
"""

from __future__ import annotations

from typing import Any, TypeAlias

import numpy as np
from numpy.typing import ArrayLike, NDArray

Array: TypeAlias = NDArray[Any]
IntArray: TypeAlias = NDArray[Any]
Seed: TypeAlias = int | np.random.Generator | None

__all__ = ["Array", "ArrayLike", "IntArray", "Seed"]
