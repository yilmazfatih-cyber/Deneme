"""İndirgeme işlemleri: toplam, ortalama, varyans, en büyük, log-sum-exp.

Fikir: indirgeme bir ekseni yok eder; geri yayılımda gradyan o eksen boyunca geri "yayılır".
`sum` için herkese aynı pay, `mean` için 1/n pay, `max` için yalnız en büyük eleman(lar)a pay,
`logsumexp` için softmax ağırlıklı pay düşer.

Genişletme: yeni indirgeme için `sum`'ı kopyalayın; `_expand` yardımcı fonksiyonu yok edilen
ekseni geri getirir. `registry.py`'ye kaydetmeyi ve gradyan denetimi eklemeyi unutmayın.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from ml_temel.autograd.tensor import Tensor, TensorLike, as_tensor, make
from ml_temel.ortak.types import Array

Axis = int | tuple[int, ...] | None
# Not: numpy'ın tip tanımları `keepdims` değişken olduğunda aşırı yük seçemiyor; bu dosyada
# indirgeme çağrıları `Any` tipli bir yerel değişken üzerinden yapılır (çalışma zamanı aynıdır).


def _expand(g: Array, axis: Axis, keepdims: bool) -> Array:
    """keepdims=False ile yok edilmiş eksenleri 1 boyutlu olarak geri ekler."""
    if axis is None or keepdims:
        return g
    return np.expand_dims(g, axis)


def _count(shape: tuple[int, ...], axis: Axis) -> int:
    """İndirgenen eleman sayısı."""
    if axis is None:
        return int(np.prod(shape))
    axes = (axis,) if isinstance(axis, int) else axis
    return int(np.prod([shape[ax] for ax in axes]))


def sum(a: TensorLike, axis: Axis = None, keepdims: bool = False) -> Tensor:
    """Elemanların toplamı."""
    a = as_tensor(a)
    data: Any = a.data

    def backward(g: Array) -> None:
        a.accumulate(np.broadcast_to(_expand(g, axis, keepdims), a.shape))

    return make(data.sum(axis=axis, keepdims=keepdims), (a,), backward, "sum")


def mean(a: TensorLike, axis: Axis = None, keepdims: bool = False) -> Tensor:
    """Elemanların ortalaması."""
    a = as_tensor(a)
    n = _count(a.shape, axis)

    def backward(g: Array) -> None:
        a.accumulate(np.broadcast_to(_expand(g, axis, keepdims), a.shape) / n)

    data: Any = a.data
    return make(data.mean(axis=axis, keepdims=keepdims), (a,), backward, "mean")


def var(a: TensorLike, axis: Axis = None, keepdims: bool = False) -> Tensor:
    """Varyans (n'ye bölünür; numpy'ın varsayılanı gibi). Türev: 2·(a - ortalama)/n."""
    a = as_tensor(a)
    n = _count(a.shape, axis)
    centered: Any = a.data - a.data.mean(axis=axis, keepdims=True)

    def backward(g: Array) -> None:
        a.accumulate(_expand(g, axis, keepdims) * 2.0 * centered / n)

    out = (centered * centered).mean(axis=axis, keepdims=keepdims)
    return make(out, (a,), backward, "var")


def max(a: TensorLike, axis: int | None = None, keepdims: bool = False) -> Tensor:
    """En büyük eleman. Eşitlik varsa gradyan eşit elemanlar arasında paylaştırılır."""
    a = as_tensor(a)
    data: Any = a.data
    out = data.max(axis=axis, keepdims=True)
    winners = data == out
    share = winners / winners.sum(axis=axis, keepdims=True)

    def backward(g: Array) -> None:
        a.accumulate(_expand(g, axis, keepdims) * share)

    return make(out if keepdims else data.max(axis=axis), (a,), backward, "max")


def logsumexp(a: TensorLike, axis: int = -1, keepdims: bool = False) -> Tensor:
    """log(Σ exp(a)) — en büyük değer çıkarılarak taşmasız hesaplanır. Türev: softmax(a)."""
    a = as_tensor(a)
    peak = a.data.max(axis=axis, keepdims=True)
    shifted = np.exp(a.data - peak)
    total = shifted.sum(axis=axis, keepdims=True)
    out = peak + np.log(total)

    def backward(g: Array) -> None:
        a.accumulate(_expand(g, axis, keepdims) * shifted / total)

    return make(out if keepdims else np.squeeze(out, axis=axis), (a,), backward, "logsumexp")
