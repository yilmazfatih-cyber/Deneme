"""Tensor: bir numpy dizisini saran ve üzerinde yapılan işlemleri kaydedip geri yayılım yapan sınıf.

Fikir (ters kipli otomatik türev): her işlem çıktıyı üretirken "çıktının gradyanı gelirse girdilere
nasıl dağıtılır" bilgisini bir kapanış (closure) olarak saklar. `backward()` grafı topolojik sıraya
dizer ve sondan başa doğru bu kapanışları çağırır (zincir kuralı). Yayınlama (broadcasting) ile
büyüyen boyutlar `unbroadcast` ile toplanarak geri küçültülür.

Kim kullanır: `ops_*.py` dosyalarındaki bütün işlemler ve `ml_temel.nn`.
Genişletme: yeni işlem BU dosyaya yazılmaz; `ops_*.py` içine fonksiyon olarak yazılır ve
`registry.py`'ye kaydedilir (tarif: AGENTS.md → "Yeni türev işlemi ekle").
"""

from __future__ import annotations

import contextlib
from collections.abc import Callable, Iterator, Sequence
from typing import Any, TypeAlias

import numpy as np

from ml_temel.ortak.types import Array, ArrayLike

TensorLike: TypeAlias = "Tensor | ArrayLike"
Index: TypeAlias = Any  # int, slice, Ellipsis, None, tamsayı/mantıksal dizi ya da bunların demeti

_STATE = {"grad_enabled": True}


def is_grad_enabled() -> bool:
    """İşlemler şu an graf kaydediyor mu?"""
    return _STATE["grad_enabled"]


@contextlib.contextmanager
def no_grad() -> Iterator[None]:
    """Blok içinde graf kaydedilmez (tahmin ve değerlendirme için; bellek ve zaman kazandırır)."""
    previous = _STATE["grad_enabled"]
    _STATE["grad_enabled"] = False
    try:
        yield
    finally:
        _STATE["grad_enabled"] = previous


def unbroadcast(grad: Array, shape: tuple[int, ...]) -> Array:
    """Yayınlamayla büyümüş bir gradyanı özgün `shape` biçimine toplayarak indirir."""
    if grad.shape == shape:
        return grad
    extra = grad.ndim - len(shape)
    if extra > 0:  # başa eklenen eksenler
        grad = grad.sum(axis=tuple(range(extra)))
    stretched = tuple(i for i, size in enumerate(shape) if size == 1 and grad.shape[i] != 1)
    if stretched:  # 1'den n'ye uzatılan eksenler
        grad = grad.sum(axis=stretched, keepdims=True)
    return grad


class Tensor:
    """float64 numpy dizisi + (isteğe bağlı) gradyan + onu üreten işlemin kaydı."""

    __slots__ = ("_backward", "_parents", "data", "grad", "op", "requires_grad")
    __array_ufunc__ = None  # numpy_dizisi + Tensor → Tensor.__radd__ çağrılsın

    def __init__(self, data: TensorLike, requires_grad: bool = False) -> None:
        if isinstance(data, Tensor):
            data = data.data
        self.data: Array = np.asarray(data, dtype=np.float64)
        self.grad: Array | None = None
        self.requires_grad = requires_grad
        self._parents: tuple[Tensor, ...] = ()
        self._backward: Callable[[Array], None] | None = None
        self.op = ""

    # --- temel bilgiler -------------------------------------------------------------------
    @property
    def shape(self) -> tuple[int, ...]:
        return self.data.shape

    @property
    def ndim(self) -> int:
        return self.data.ndim

    @property
    def size(self) -> int:
        return int(self.data.size)

    def __len__(self) -> int:
        return len(self.data)

    def __repr__(self) -> str:
        grad = ", requires_grad=True" if self.requires_grad else ""
        return f"Tensor({np.array2string(self.data, precision=4, threshold=20)}{grad})"

    def item(self) -> float:
        """Tek elemanlı tensörün Python sayısı karşılığı."""
        if self.data.size != 1:
            raise ValueError(f"item() tek elemanlı tensör ister; biçim {self.shape}.")
        return float(self.data.reshape(-1)[0])

    def numpy(self) -> Array:
        """Alttaki numpy dizisi (kopya değil; değiştirmeyin)."""
        return self.data

    def detach(self) -> Tensor:
        """Aynı veriyi taşıyan ama graftan kopuk yeni tensör."""
        return Tensor(self.data)

    def zero_grad(self) -> None:
        self.grad = None

    # --- geri yayılım ---------------------------------------------------------------------
    def accumulate(self, grad: Array) -> None:
        """Bu tensöre ulaşan gradyanı biriktirir (tensör birden çok yerde kullanılmış olabilir)."""
        if not self.requires_grad:
            return
        grad = unbroadcast(grad, self.data.shape)
        if grad.shape != self.data.shape:
            raise RuntimeError(
                f"Gradyan biçimi {grad.shape}, tensör biçimi {self.data.shape} ile uyuşmuyor. Bu "
                f"tensörü kullanan işlemin ('{self.op or 'yaprak'}' sonrası) backward fonksiyonu "
                "yanlış biçim döndürüyor; `assert_gradcheck` ile denetleyin."
            )
        if self.grad is None:
            # Yapraklarda kopya: iki parametre aynı diziyi paylaşıp yerinde değişiklikle bozulmasın.
            self.grad = np.array(grad, dtype=np.float64) if self._backward is None else grad
        else:
            self.grad = self.grad + grad

    def topological_order(self) -> list[Tensor]:
        """Bu tensöre giden grafın düğümleri; her düğüm kendi girdilerinden SONRA gelir."""
        order: list[Tensor] = []
        visited: set[int] = set()
        stack: list[tuple[Tensor, bool]] = [(self, False)]
        while stack:  # özyinelemesiz derinlik öncelikli gezinti (derin graflarda yığın taşmaz)
            node, expanded = stack.pop()
            if expanded:
                order.append(node)
                continue
            if id(node) in visited:
                continue
            visited.add(id(node))
            stack.append((node, True))
            stack.extend((parent, False) for parent in node._parents if id(parent) not in visited)
        return order

    def backward(self, grad: ArrayLike | None = None) -> None:
        """Bu tensörden yapraklara doğru gradyanları hesaplar ve `.grad` alanlarına yazar.

        Skaler (tek elemanlı) çıktıda `grad` verilmez (1 kabul edilir). Yaprakların gradyanı
        çağrılar arasında BİRİKİR; her eğitim adımında `zero_grad()` çağırın.
        """
        if not self.requires_grad:
            raise RuntimeError(
                "Bu tensör gradyan gerektirmiyor: girdilerden en az biri requires_grad=True "
                "olmalı ve hesap `no_grad()` bloğunun dışında yapılmalı."
            )
        if grad is None:
            if self.data.size != 1:
                raise RuntimeError(
                    f"backward() skaler çıktı ister (biçim {self.shape}). Önce .sum() ya da "
                    ".mean() alın ya da backward(grad=...) ile çıktı biçiminde bir gradyan verin."
                )
            seed = np.ones_like(self.data)
        else:
            seed = np.broadcast_to(np.asarray(grad, dtype=np.float64), self.data.shape).copy()
        order = self.topological_order()
        for node in order:  # ara düğümlerin eski gradyanı yeni çağrıya karışmasın
            if node._backward is not None:
                node.grad = None
        self.accumulate(seed)
        for node in reversed(order):
            if node._backward is not None and node.grad is not None:
                node._backward(node.grad)

    # --- işleçler (asıl işi ops_*.py yapar) -----------------------------------------------
    def __add__(self, other: TensorLike) -> Tensor:
        return ops_basic.add(self, other)

    def __radd__(self, other: TensorLike) -> Tensor:
        return ops_basic.add(other, self)

    def __sub__(self, other: TensorLike) -> Tensor:
        return ops_basic.sub(self, other)

    def __rsub__(self, other: TensorLike) -> Tensor:
        return ops_basic.sub(other, self)

    def __mul__(self, other: TensorLike) -> Tensor:
        return ops_basic.mul(self, other)

    def __rmul__(self, other: TensorLike) -> Tensor:
        return ops_basic.mul(other, self)

    def __truediv__(self, other: TensorLike) -> Tensor:
        return ops_basic.div(self, other)

    def __rtruediv__(self, other: TensorLike) -> Tensor:
        return ops_basic.div(other, self)

    def __neg__(self) -> Tensor:
        return ops_basic.neg(self)

    def __pow__(self, exponent: float) -> Tensor:
        return ops_basic.pow(self, exponent)

    def __matmul__(self, other: TensorLike) -> Tensor:
        return ops_basic.matmul(self, other)

    def __rmatmul__(self, other: TensorLike) -> Tensor:
        return ops_basic.matmul(other, self)

    def __getitem__(self, index: Index) -> Tensor:
        return ops_shape.getitem(self, index)

    # --- yöntem biçiminde kısayollar ------------------------------------------------------
    def sum(self, axis: int | tuple[int, ...] | None = None, keepdims: bool = False) -> Tensor:
        return ops_reduce.sum(self, axis=axis, keepdims=keepdims)

    def mean(self, axis: int | tuple[int, ...] | None = None, keepdims: bool = False) -> Tensor:
        return ops_reduce.mean(self, axis=axis, keepdims=keepdims)

    def var(self, axis: int | tuple[int, ...] | None = None, keepdims: bool = False) -> Tensor:
        return ops_reduce.var(self, axis=axis, keepdims=keepdims)

    def max(self, axis: int | None = None, keepdims: bool = False) -> Tensor:
        return ops_reduce.max(self, axis=axis, keepdims=keepdims)

    def reshape(self, *shape: int | Sequence[int]) -> Tensor:
        """`t.reshape(2, -1)` ve `t.reshape((2, -1))` yazımlarının ikisi de geçerlidir."""
        if len(shape) == 1 and not isinstance(shape[0], (int, np.integer)):
            return ops_shape.reshape(self, tuple(shape[0]))
        return ops_shape.reshape(self, [int(size) for size in shape])  # type: ignore[arg-type]

    def transpose(self, *axes: int) -> Tensor:
        return ops_shape.transpose(self, axes or None)

    @property
    def T(self) -> Tensor:  # noqa: N802 - numpy ile aynı ad
        return ops_shape.transpose(self, None)

    def exp(self) -> Tensor:
        return ops_basic.exp(self)

    def log(self) -> Tensor:
        return ops_basic.log(self)

    def sqrt(self) -> Tensor:
        return ops_basic.sqrt(self)

    def tanh(self) -> Tensor:
        return ops_basic.tanh(self)

    def sigmoid(self) -> Tensor:
        return ops_basic.sigmoid(self)

    def relu(self) -> Tensor:
        return ops_basic.relu(self)


def as_tensor(value: TensorLike) -> Tensor:
    """Sayı, liste ya da numpy dizisini Tensor'a çevirir; Tensor ise aynen döndürür."""
    return value if isinstance(value, Tensor) else Tensor(value)


def make(
    data: ArrayLike, parents: tuple[Tensor, ...], backward: Callable[[Array], None], op: str
) -> Tensor:
    """Bir işlemin çıktı tensörünü kurar; gradyan gerekmiyorsa grafı hiç kaydetmez."""
    out = Tensor(data)
    if _STATE["grad_enabled"] and any(parent.requires_grad for parent in parents):
        out.requires_grad = True
        out._parents = tuple(parent for parent in parents if parent.requires_grad)
        out._backward = backward
        out.op = op
    return out


# Döngüsel içe aktarmayı önlemek için işlem modülleri dosyanın SONUNDA içe aktarılır:
# ops_* dosyaları yukarıdaki Tensor sınıfına ihtiyaç duyar.
from ml_temel.autograd import ops_basic, ops_reduce, ops_shape  # noqa: E402
