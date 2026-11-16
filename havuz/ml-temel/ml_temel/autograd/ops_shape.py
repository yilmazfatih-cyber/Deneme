"""Biçim işlemleri: yeniden biçimleme, devrik, dilimleme/indeksleme, birleştirme, maskeleme.

Fikir: bu işlemler değerleri değiştirmez, yalnız yerlerini değiştirir. Geri yayılım da gradyanı
aynı yoldan geri taşır: `reshape` eski biçime döndürür, `transpose` eksenleri ters sırayla dizer,
`getitem` gradyanı alındığı konuma yazar (aynı konum iki kez seçildiyse toplar),
`concat` gradyanı parçalara böler, `masked_fill`/`where` maskeye göre yönlendirir.

Genişletme: yeni biçim işlemi için `reshape`'i kopyalayın; `registry.py` + gradyan denetimi şart.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from numpy.typing import ArrayLike

from ml_temel.autograd.tensor import Index, Tensor, TensorLike, as_tensor, make
from ml_temel.ortak.types import Array


def reshape(a: TensorLike, shape: Sequence[int]) -> Tensor:
    """Aynı elemanları yeni biçime dizer; bir boyut -1 verilirse o boyut hesaplanır."""
    a = as_tensor(a)
    target = tuple(int(size) for size in shape)

    def backward(g: Array) -> None:
        a.accumulate(g.reshape(a.shape))

    return make(a.data.reshape(target), (a,), backward, "reshape")


def transpose(a: TensorLike, axes: Sequence[int] | None = None) -> Tensor:
    """Eksen sırasını değiştirir; `axes` verilmezse eksenler ters çevrilir (matris devriği)."""
    a = as_tensor(a)
    order = tuple(axes) if axes is not None else tuple(reversed(range(a.ndim)))

    def backward(g: Array) -> None:
        a.accumulate(g.transpose(tuple(np.argsort(order))))

    return make(a.data.transpose(order), (a,), backward, "transpose")


def _is_basic_index(index: Index) -> bool:
    """Yalnız tam sayı, dilim, None, ... içeren (aynı elemanı iki kez seçemeyen) indeks mi?"""
    parts = index if isinstance(index, tuple) else (index,)
    return all(
        part is None or part is Ellipsis or isinstance(part, (int, np.integer, slice))
        for part in parts
    )


def getitem(a: TensorLike, index: Index) -> Tensor:
    """a[index]: dilimleme, tam sayı dizisiyle seçme (gömme tablosu araması) ve mantıksal maske."""
    a = as_tensor(a)
    if isinstance(index, Tensor):
        raise TypeError("İndeks Tensor olamaz; tam sayı numpy dizisi kullanın (ör. idx.data).")

    def backward(g: Array) -> None:
        grad = np.zeros_like(a.data)
        if _is_basic_index(index):
            grad[index] = g
        else:  # aynı satır birden çok kez seçilmiş olabilir: toplayarak yaz
            np.add.at(grad, index, g)
        a.accumulate(grad)

    return make(a.data[index], (a,), backward, "getitem")


def concat(tensors: Sequence[TensorLike], axis: int = 0) -> Tensor:
    """Tensörleri var olan bir eksen boyunca uç uca ekler."""
    items = tuple(as_tensor(t) for t in tensors)
    if not items:
        raise ValueError("concat en az bir tensör ister.")
    boundaries = np.cumsum([t.shape[axis] for t in items])[:-1]

    def backward(g: Array) -> None:
        for item, piece in zip(items, np.split(g, boundaries, axis=axis), strict=True):
            item.accumulate(piece)

    return make(np.concatenate([t.data for t in items], axis=axis), items, backward, "concat")


def stack(tensors: Sequence[TensorLike], axis: int = 0) -> Tensor:
    """Aynı biçimli tensörleri YENİ bir eksen boyunca üst üste dizer."""
    items = tuple(as_tensor(t) for t in tensors)
    if not items:
        raise ValueError("stack en az bir tensör ister.")

    def backward(g: Array) -> None:
        for position, item in enumerate(items):
            item.accumulate(np.take(g, position, axis=axis))

    return make(np.stack([t.data for t in items], axis=axis), items, backward, "stack")


def masked_fill(a: TensorLike, mask: ArrayLike, value: float) -> Tensor:
    """`mask`in True olduğu yerlere sabit `value` yazar (dikkatte geleceği gizlemek için -inf)."""
    a = as_tensor(a)
    keep = ~np.broadcast_to(np.asarray(mask, dtype=bool), a.shape)

    def backward(g: Array) -> None:
        a.accumulate(g * keep)

    return make(np.where(keep, a.data, value), (a,), backward, "masked_fill")


def where(condition: ArrayLike, a: TensorLike, b: TensorLike) -> Tensor:
    """`condition` True ise a'dan, değilse b'den eleman seçer (koşulun türevi alınmaz)."""
    a, b = as_tensor(a), as_tensor(b)
    cond = np.asarray(condition, dtype=bool)

    def backward(g: Array) -> None:
        a.accumulate(g * cond)
        b.accumulate(g * ~cond)

    return make(np.where(cond, a.data, b.data), (a, b), backward, "where")
