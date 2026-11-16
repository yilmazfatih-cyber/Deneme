"""Evrişim işlemleri: `conv2d` ve `max_pool2d` (görüntü biçimi: örnek, kanal, yükseklik, genişlik).

Fikir: evrişim, küçük bir çekirdeği görüntü üzerinde kaydırıp her konumda iç çarpım almaktır.
Döngü yazmak yerine `sliding_window_view` ile bütün pencereleri (kopyasız) tek dizide toplar,
`tensordot` ile çekirdekle çarparız. Geri yayılımda çekirdeğin gradyanı pencere × çıktı gradyanı
çarpımıdır; girdinin gradyanı ise her çekirdek konumu için çıktı gradyanının geri "saçılmasıdır".

Kim kullanır: `ml_temel.nn.conv` (Conv2d, MaxPool2d).
Genişletme: ortalama havuzlama gerekirse `max_pool2d`'yi kopyalayıp `max` yerine `mean` kullanın.
"""

from __future__ import annotations

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

from ml_temel.autograd.tensor import Tensor, TensorLike, as_tensor, make
from ml_temel.ortak.types import Array


def _windows(x: Array, kernel: tuple[int, int], stride: int) -> Array:
    """(N, C, H, W) → (N, C, H_çıkış, W_çıkış, kh, kw) pencere görünümü."""
    view = sliding_window_view(x, kernel, axis=(2, 3))
    return np.asarray(view[:, :, ::stride, ::stride])


def conv2d(
    x: TensorLike,
    weight: TensorLike,
    bias: TensorLike | None = None,
    stride: int = 1,
    padding: int = 0,
) -> Tensor:
    """2B evrişim. x: (N, C, H, W), weight: (F, C, kh, kw), bias: (F,) → çıktı (N, F, H', W')."""
    x, weight = as_tensor(x), as_tensor(weight)
    bias_t = as_tensor(bias) if bias is not None else None
    if x.ndim != 4 or weight.ndim != 4 or x.shape[1] != weight.shape[1]:
        raise ValueError(
            f"conv2d: x (N, C, H, W) ve weight (F, C, kh, kw) olmalı; verilen {x.shape} ve "
            f"{weight.shape}."
        )
    kh, kw = weight.shape[2], weight.shape[3]
    pad = ((0, 0), (0, 0), (padding, padding), (padding, padding))
    padded = np.pad(x.data, pad)
    windows = _windows(padded, (kh, kw), stride)
    out_h, out_w = windows.shape[2], windows.shape[3]
    # (N, C, H', W', kh, kw) · (F, C, kh, kw) → (N, H', W', F) → (N, F, H', W')
    out = np.tensordot(windows, weight.data, axes=([1, 4, 5], [1, 2, 3])).transpose(0, 3, 1, 2)
    if bias_t is not None:
        out = out + bias_t.data[None, :, None, None]

    def backward(g: Array) -> None:
        weight.accumulate(np.tensordot(g, windows, axes=([0, 2, 3], [0, 2, 3])))
        if bias_t is not None:
            bias_t.accumulate(g.sum(axis=(0, 2, 3)))
        if x.requires_grad:
            grad_padded = np.zeros_like(padded)
            for i in range(kh):  # yalnız çekirdek boyutu kadar döner (3×3 için 9 adım)
                for j in range(kw):
                    # (N, F, H', W') · (F, C) → (N, H', W', C) → (N, C, H', W')
                    part = np.tensordot(g, weight.data[:, :, i, j], axes=([1], [0]))
                    rows = slice(i, i + stride * out_h, stride)
                    cols = slice(j, j + stride * out_w, stride)
                    grad_padded[:, :, rows, cols] += part.transpose(0, 3, 1, 2)
            h, w = x.shape[2], x.shape[3]
            x.accumulate(grad_padded[:, :, padding : padding + h, padding : padding + w])

    parents = (x, weight) if bias_t is None else (x, weight, bias_t)
    return make(out, parents, backward, "conv2d")


def max_pool2d(x: TensorLike, kernel_size: int = 2, stride: int | None = None) -> Tensor:
    """Her pencerenin en büyüğünü alır. x: (N, C, H, W); `stride` verilmezse `kernel_size`'dır."""
    x = as_tensor(x)
    if x.ndim != 4:
        raise ValueError(f"max_pool2d: x (N, C, H, W) olmalı; verilen {x.shape}.")
    step = stride if stride is not None else kernel_size
    windows = _windows(x.data, (kernel_size, kernel_size), step)
    n, c, out_h, out_w = windows.shape[:4]
    flat = windows.reshape(n, c, out_h, out_w, kernel_size * kernel_size)
    winner = flat.argmax(axis=-1)  # eşitlikte ilk en büyük kazanır

    def backward(g: Array) -> None:
        grad = np.zeros_like(x.data)
        for i in range(kernel_size):
            for j in range(kernel_size):
                rows = slice(i, i + step * out_h, step)
                cols = slice(j, j + step * out_w, step)
                grad[:, :, rows, cols] += g * (winner == i * kernel_size + j)
        x.accumulate(grad)

    return make(flat.max(axis=-1), (x,), backward, "max_pool2d")
