"""İşlem kaydı: türevi alınabilen bütün işlemlerin TEK listesi.

Bu sözlük iki işe yarar: (1) "hangi işlemler var?" sorusunun yanıtıdır; (2) kural testi
(`tests/test_autograd_ops.py`) buradaki her ad için bir gradyan denetimi durumu olmasını zorlar.
Yani kayda eklenip sınanmamış işlem denetimden geçemez.

Genişletme: yeni işlemi `ops_*.py` içine yazın, aşağıya bir satır ekleyin, sonra testi ekleyin.
"""

from __future__ import annotations

from collections.abc import Callable

from ml_temel.autograd import ops_basic, ops_conv, ops_nn, ops_reduce, ops_shape
from ml_temel.autograd.tensor import Tensor

OPS: dict[str, Callable[..., Tensor]] = {
    # dört işlem ve temel fonksiyonlar
    "add": ops_basic.add,
    "sub": ops_basic.sub,
    "mul": ops_basic.mul,
    "div": ops_basic.div,
    "neg": ops_basic.neg,
    "pow": ops_basic.pow,
    "exp": ops_basic.exp,
    "log": ops_basic.log,
    "sqrt": ops_basic.sqrt,
    "abs": ops_basic.abs,
    "matmul": ops_basic.matmul,
    # etkinleştirmeler
    "tanh": ops_basic.tanh,
    "sigmoid": ops_basic.sigmoid,
    "relu": ops_basic.relu,
    "gelu": ops_basic.gelu,
    # indirgemeler
    "sum": ops_reduce.sum,
    "mean": ops_reduce.mean,
    "var": ops_reduce.var,
    "max": ops_reduce.max,
    "logsumexp": ops_reduce.logsumexp,
    # biçim
    "reshape": ops_shape.reshape,
    "transpose": ops_shape.transpose,
    "getitem": ops_shape.getitem,
    "concat": ops_shape.concat,
    "stack": ops_shape.stack,
    "masked_fill": ops_shape.masked_fill,
    "where": ops_shape.where,
    # sinir ağı
    "softmax": ops_nn.softmax,
    "log_softmax": ops_nn.log_softmax,
    "cross_entropy": ops_nn.cross_entropy,
    "binary_cross_entropy_with_logits": ops_nn.binary_cross_entropy_with_logits,
    "mse_loss": ops_nn.mse_loss,
    "layer_norm": ops_nn.layer_norm,
    "dropout": ops_nn.dropout,
    # evrişim
    "conv2d": ops_conv.conv2d,
    "max_pool2d": ops_conv.max_pool2d,
    # YENİ İŞLEM BURAYA
}
