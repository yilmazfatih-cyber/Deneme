"""autograd — numpy üstünde ters kipli otomatik türev.

Kullanım:
    from ml_temel.autograd import Tensor, no_grad, assert_gradcheck
    x = Tensor([[1.0, 2.0]], requires_grad=True)
    y = (x * x).sum()
    y.backward()          # x.grad == [[2., 4.]]

Dosyalar: `tensor.py` (çekirdek), `ops_*.py` (işlemler), `registry.py` (işlem kaydı),
`gradcheck.py` (sonlu farkla denetim).
Genişletme: AGENTS.md → "Yeni türev işlemi ekle".
"""

from ml_temel.autograd.gradcheck import (
    GradcheckResult,
    assert_gradcheck,
    gradcheck,
    numerical_gradients,
)
from ml_temel.autograd.ops_basic import (
    abs,
    add,
    div,
    exp,
    gelu,
    log,
    matmul,
    mul,
    neg,
    pow,
    relu,
    sigmoid,
    sqrt,
    sub,
    tanh,
)
from ml_temel.autograd.ops_conv import conv2d, max_pool2d
from ml_temel.autograd.ops_nn import (
    binary_cross_entropy_with_logits,
    cross_entropy,
    dropout,
    layer_norm,
    log_softmax,
    mse_loss,
    softmax,
)
from ml_temel.autograd.ops_reduce import (
    logsumexp,
    max,
    mean,
    sum,
    var,
)
from ml_temel.autograd.ops_shape import (
    concat,
    getitem,
    masked_fill,
    reshape,
    stack,
    transpose,
    where,
)
from ml_temel.autograd.registry import OPS
from ml_temel.autograd.tensor import (
    Tensor,
    TensorLike,
    as_tensor,
    is_grad_enabled,
    no_grad,
    unbroadcast,
)
from ml_temel.ortak.types import Array, IntArray

__all__ = [
    "OPS",
    "Array",
    "GradcheckResult",
    "IntArray",
    "Tensor",
    "TensorLike",
    "abs",
    "add",
    "as_tensor",
    "assert_gradcheck",
    "binary_cross_entropy_with_logits",
    "concat",
    "conv2d",
    "cross_entropy",
    "div",
    "dropout",
    "exp",
    "gelu",
    "getitem",
    "gradcheck",
    "is_grad_enabled",
    "layer_norm",
    "log",
    "log_softmax",
    "logsumexp",
    "masked_fill",
    "matmul",
    "max",
    "max_pool2d",
    "mean",
    "mse_loss",
    "mul",
    "neg",
    "no_grad",
    "numerical_gradients",
    "pow",
    "relu",
    "reshape",
    "sigmoid",
    "softmax",
    "sqrt",
    "stack",
    "sub",
    "sum",
    "tanh",
    "transpose",
    "unbroadcast",
    "var",
    "where",
]
