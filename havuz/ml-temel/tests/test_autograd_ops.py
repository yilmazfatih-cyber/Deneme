"""Her türev işlemi için sonlu farkla gradyan denetimi + "kayıttaki her işlem sınanmış mı" kuralı.

Yeni işlem eklediğinizde `CASES` sözlüğüne aynı adla bir durum ekleyin: girdileri üreten ve
`assert_gradcheck` çağıran küçük bir fonksiyon. Girdileri türevin sürekli olduğu bölgede seçin
(relu için 0'dan, log için 0 ve negatiften uzak).
"""

from __future__ import annotations

from collections.abc import Callable

import numpy as np
import pytest

from ml_temel import autograd as ag
from ml_temel.autograd import OPS, Tensor, assert_gradcheck


def rand(*shape: int, seed: int = 0, low: float | None = None) -> Tensor:
    """Tohumlu rastgele girdi; `low` verilirse değerler `low`'dan büyük (pozitif bölge) seçilir."""
    rng = np.random.default_rng(seed)
    data = rng.standard_normal(shape) if low is None else low + rng.random(shape)
    return Tensor(data, requires_grad=True)


def away_from_zero(*shape: int, seed: int = 0) -> Tensor:
    """|x| ≥ 0.2: relu/abs/max gibi köşeli işlemlerde sonlu fark köşeye denk gelmesin."""
    rng = np.random.default_rng(seed)
    data = rng.uniform(0.2, 1.5, size=shape) * rng.choice([-1.0, 1.0], size=shape)
    return Tensor(data, requires_grad=True)


def distinct(*shape: int, seed: int = 0) -> Tensor:
    """Birbirinden en az 0.1 farklı değerler: max / max_pool2d'de eşitlik olmasın."""
    rng = np.random.default_rng(seed)
    values = rng.permutation(int(np.prod(shape))) * 0.1
    return Tensor(values.reshape(shape), requires_grad=True)


MASK = np.array([[True, False, False], [False, True, False]])
TARGETS = np.array([[0, 2, 1], [3, 3, 0]])

CASES: dict[str, Callable[[], None]] = {
    "add": lambda: assert_gradcheck(ag.add, [rand(2, 3), rand(3, seed=1)]),
    "sub": lambda: assert_gradcheck(ag.sub, [rand(2, 1, 3), rand(4, 1, seed=1)]),
    "mul": lambda: assert_gradcheck(ag.mul, [rand(2, 3), rand(1, 3, seed=1)]),
    "div": lambda: assert_gradcheck(ag.div, [rand(2, 3), rand(2, 1, seed=1, low=0.5)]),
    "neg": lambda: assert_gradcheck(ag.neg, [rand(2, 3)]),
    "pow": lambda: assert_gradcheck(lambda x: ag.pow(x, 2.5), [rand(2, 3, low=0.5)]),
    "exp": lambda: assert_gradcheck(ag.exp, [rand(2, 3)]),
    "log": lambda: assert_gradcheck(ag.log, [rand(2, 3, low=0.5)]),
    "sqrt": lambda: assert_gradcheck(ag.sqrt, [rand(2, 3, low=0.5)]),
    "abs": lambda: assert_gradcheck(ag.abs, [away_from_zero(2, 3)]),
    "matmul": lambda: assert_gradcheck(ag.matmul, [rand(2, 4, 3), rand(3, 5, seed=1)]),
    "tanh": lambda: assert_gradcheck(ag.tanh, [rand(2, 3)]),
    "sigmoid": lambda: assert_gradcheck(ag.sigmoid, [rand(2, 3)]),
    "relu": lambda: assert_gradcheck(ag.relu, [away_from_zero(3, 4)]),
    "gelu": lambda: assert_gradcheck(ag.gelu, [rand(3, 4)]),
    "sum": lambda: assert_gradcheck(lambda x: ag.sum(x, axis=(0, 2)), [rand(2, 3, 4)]),
    "mean": lambda: assert_gradcheck(lambda x: ag.mean(x, axis=1, keepdims=True), [rand(2, 3)]),
    "var": lambda: assert_gradcheck(lambda x: ag.var(x, axis=-1), [rand(2, 5)]),
    "max": lambda: assert_gradcheck(lambda x: ag.max(x, axis=1), [distinct(3, 4)]),
    "logsumexp": lambda: assert_gradcheck(lambda x: ag.logsumexp(x, axis=-1), [rand(2, 5)]),
    "reshape": lambda: assert_gradcheck(lambda x: ag.reshape(x, (3, -1)), [rand(2, 3, 2)]),
    "transpose": lambda: assert_gradcheck(lambda x: ag.transpose(x, (2, 0, 1)), [rand(2, 3, 4)]),
    "getitem": lambda: assert_gradcheck(
        lambda x: ag.getitem(x, (np.array([0, 2, 2, 1]), slice(1, None))), [rand(3, 4)]
    ),
    "concat": lambda: assert_gradcheck(
        lambda a, b: ag.concat([a, b], axis=1), [rand(2, 3), rand(2, 2, seed=1)]
    ),
    "stack": lambda: assert_gradcheck(
        lambda a, b: ag.stack([a, b], axis=1), [rand(2, 3), rand(2, 3, seed=1)]
    ),
    "masked_fill": lambda: assert_gradcheck(lambda x: ag.masked_fill(x, MASK, -5.0), [rand(2, 3)]),
    "where": lambda: assert_gradcheck(
        lambda a, b: ag.where(MASK, a, b), [rand(2, 3), rand(3, seed=1)]
    ),
    "softmax": lambda: assert_gradcheck(lambda x: ag.softmax(x, axis=-1), [rand(2, 5)]),
    "log_softmax": lambda: assert_gradcheck(lambda x: ag.log_softmax(x, axis=1), [rand(2, 5, 3)]),
    "cross_entropy": lambda: assert_gradcheck(
        lambda x: ag.cross_entropy(x, TARGETS, ignore_index=3), [rand(2, 3, 4)]
    ),
    "binary_cross_entropy_with_logits": lambda: assert_gradcheck(
        lambda x: ag.binary_cross_entropy_with_logits(x, np.array([1.0, 0.0, 1.0])), [rand(2, 3)]
    ),
    "mse_loss": lambda: assert_gradcheck(ag.mse_loss, [rand(2, 3), rand(2, 3, seed=1)]),
    "layer_norm": lambda: assert_gradcheck(
        ag.layer_norm, [rand(2, 3, 5), rand(5, seed=1), rand(5, seed=2)]
    ),
    "dropout": lambda: assert_gradcheck(
        lambda x: ag.dropout(x, 0.4, np.random.default_rng(7)), [rand(4, 5)]
    ),
    "conv2d": lambda: assert_gradcheck(
        lambda x, w, b: ag.conv2d(x, w, b, stride=2, padding=1),
        [rand(2, 2, 5, 6), rand(3, 2, 3, 3, seed=1), rand(3, seed=2)],
    ),
    "max_pool2d": lambda: assert_gradcheck(
        lambda x: ag.max_pool2d(x, kernel_size=2, stride=1), [distinct(2, 2, 4, 5)]
    ),
}


def test_every_registered_op_has_a_gradcheck_case() -> None:
    missing = sorted(set(OPS) - set(CASES))
    extra = sorted(set(CASES) - set(OPS))
    assert not missing, (
        f"Gradyan denetimi olmayan işlem(ler): {missing}. tests/test_autograd_ops.py içindeki "
        "CASES sözlüğüne aynı adla bir `assert_gradcheck` durumu ekleyin."
    )
    assert not extra, (
        f"Kayıtta olmayan işlem(ler) sınanıyor: {extra}. ml_temel/autograd/registry.py içindeki "
        "OPS sözlüğüne ekleyin (YENİ İŞLEM BURAYA)."
    )


@pytest.mark.parametrize("name", sorted(CASES))
def test_gradcheck(name: str) -> None:
    CASES[name]()


def test_gradcheck_catches_a_wrong_derivative() -> None:
    def wrong_square(x: Tensor) -> Tensor:
        from ml_temel.autograd.tensor import make

        return make(x.data**2, (x,), lambda g: x.accumulate(g * 3.0 * x.data), "wrong")

    with pytest.raises(AssertionError, match="Gradyan uyuşmuyor"):
        assert_gradcheck(wrong_square, [rand(3)])


def test_matmul_with_vectors() -> None:
    assert_gradcheck(ag.matmul, [rand(3), rand(3, seed=1)])  # iç çarpım
    assert_gradcheck(ag.matmul, [rand(2, 3), rand(3, seed=1)])  # matris × vektör
    assert_gradcheck(ag.matmul, [rand(3), rand(3, 4, seed=1)])  # vektör × matris


def test_composite_expression_and_reuse() -> None:
    def expression(a: Tensor, b: Tensor) -> Tensor:
        hidden = ag.tanh(a @ b + 1.0)
        return (hidden * hidden).sum() / (1.0 + (a * a).mean()) - hidden[0].max()

    assert_gradcheck(expression, [rand(3, 4), rand(4, 2, seed=1)])


def test_attention_like_graph() -> None:
    causal = np.triu(np.ones((4, 4), dtype=bool), k=1)

    def attention(q: Tensor, k: Tensor, v: Tensor) -> Tensor:
        scores = ag.masked_fill(q @ k.transpose(0, 2, 1) * 0.5, causal, -np.inf)
        return ag.softmax(scores, axis=-1) @ v

    assert_gradcheck(attention, [rand(2, 4, 3), rand(2, 4, 3, seed=1), rand(2, 4, 3, seed=2)])
