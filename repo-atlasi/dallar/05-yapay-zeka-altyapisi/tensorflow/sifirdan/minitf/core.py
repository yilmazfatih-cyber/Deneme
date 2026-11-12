"""Aşama 1 — Tensor, op kaydı (registry) ve eager yürütme.

Gerçek TensorFlow'da bir işlem üç parçadan oluşur:
  1. REGISTER_OP("AddV2")            -> op'un imzası ve şekil fonksiyonu (tensorflow/core/ops/math_ops.cc)
  2. REGISTER_KERNEL_BUILDER / REGISTER6(BinaryOp, CPU, "AddV2", ...) -> cihaz başına çekirdek (tensorflow/core/kernels/)
  3. @ops.RegisterGradient("AddV2")  -> Python'daki gradyan fonksiyonu (tensorflow/python/ops/math_grad.py)
Burada üçünü tek bir OpDef nesnesinde topluyoruz: ileri hesap numpy ile yapılır.
"""

from __future__ import annotations

import itertools

import numpy as np

DTYPE = np.float64  # sayısal gradyan kontrolü için çift duyarlık

# Etkin grafik (izleme/tracing sırasında) ve etkin teypler (GradientTape) yığınları.
# TF'de grafik yığını tensorflow/python/framework/ops.py içindeki _DefaultGraphStack'tir
# (context.py yalnızca eager/grafik geçişlerini izler: context_switches). Teyp kümesi C++'tadır;
# Python yüzü tensorflow/python/eager/tape.py (push_new_tape / pop_tape).
_graph_stack: list = []
_tape_stack: list = []


class OpDef:
    """Bir op'un tanımı: ileri hesap, şekil fonksiyonu, gradyan ve durum bilgisi."""

    def __init__(self, name, forward, shape_fn, stateful, side_effect):
        self.name = name
        self.forward = forward  # numpy dizileri -> numpy dizisi (veya None)
        self.shape_fn = shape_fn  # girdi şekilleri -> çıktı şekli (grafik modunda kullanılır)
        self.stateful = stateful  # değişken okur/yazar -> sabit katlamaya (constant folding) girmez
        self.side_effect = side_effect  # yan etkisi var -> budamada (pruning) silinmez
        self.grad_fn = None


_OPS: dict[str, OpDef] = {}


def _same_shape(*shapes, **_attrs):
    return shapes[0]


def _broadcast_shape(a, b, **_attrs):
    return tuple(np.broadcast_shapes(a, b))


def register_op(name, shape_fn=_same_shape, stateful=False, side_effect=False):
    """REGISTER_OP + çekirdek kaydının tek dekoratörlük karşılığı."""

    def deco(forward):
        _OPS[name] = OpDef(name, forward, shape_fn, stateful, side_effect)
        return forward

    return deco


def register_gradient(name):
    """@ops.RegisterGradient(name) karşılığı. İmza: fn(inputs, output, grad, **attrs) -> girdi başına gradyan."""

    def deco(fn):
        _OPS[name].grad_fn = fn
        return fn

    return deco


def get_op(name) -> OpDef:
    return _OPS[name]


class Tensor:
    """Ya somut bir değer taşır (eager) ya da bir grafik düğümünün sembolik çıktısıdır."""

    _ids = itertools.count()
    # Sol işlenen numpy dizisi olsa da (np.ones(2) * t) işlemi Tensor yapsın: numpy, önceliği
    # daha yüksek nesneye bırakır (TF: tensorflow/python/framework/tensor.py, __array_priority__ = 100).
    __array_priority__ = 100

    def __init__(self, value=None, *, shape=None, node=None):
        self.id = next(Tensor._ids)
        self.node = node
        if node is None:
            self._value = np.asarray(value, dtype=DTYPE)
            self.shape = self._value.shape
        else:
            self._value = None
            self.shape = tuple(shape)

    @property
    def is_symbolic(self):
        return self.node is not None

    def numpy(self):
        if self.node is not None:
            raise RuntimeError("Sembolik tensörün değeri yok: önce grafiğin yürütülmesi gerekir.")
        return self._value

    def __repr__(self):
        if self.node is not None:
            return f"<Tensor sembolik %{self.node.id} şekil={self.shape}>"
        return f"<Tensor şekil={self.shape} değer={np.array2string(self._value, precision=4)}>"

    def __bool__(self):
        """`if t:` ancak somut değerde anlamlıdır.

        Sembolik tensörün değeri izleme sırasında bilinmez; TF (AutoGraph'sız) burada
        OperatorNotAllowedInGraphError verir (tensorflow/python/framework/tensor.py, __bool__).
        Eager tensörde TF gibi değerin doğruluğuna bakılır (çok öğeli dizide numpy hata verir).
        """
        if self.node is not None:
            raise RuntimeError(
                "Sembolik tensör Python bool'u olarak kullanılamaz (TF: OperatorNotAllowedInGraphError). "
                "Grafikte koşul için ayrı bir cond op'u gerekir (AutoGraph bunu otomatik yapar)."
            )
        return bool(self._value.size > 0 and self._value)

    # Operatörler op çağrılarına dönüşür (TF'de tensor_math_operator_overrides.py)
    def __add__(self, o):
        return add(self, o)

    def __radd__(self, o):
        return add(o, self)

    def __sub__(self, o):
        return sub(self, o)

    def __rsub__(self, o):
        return sub(o, self)

    def __mul__(self, o):
        return mul(self, o)

    def __rmul__(self, o):
        return mul(o, self)

    def __truediv__(self, o):
        return div(self, o)

    def __rtruediv__(self, o):
        return div(o, self)

    def __matmul__(self, o):
        return matmul(self, o)

    def __rmatmul__(self, o):
        return matmul(o, self)

    def __neg__(self):
        return neg(self)


class Variable:
    """Değiştirilebilir durum. Okuma bir op'tur (ReadVariable), böylece grafikte de çalışır."""

    __array_priority__ = 100  # Tensor'daki gibi: numpy dizisi solda olsa da işlem op'a dönüşsün

    def __init__(self, initial_value, trainable=True, name=None):
        self._value = np.array(initial_value, dtype=DTYPE)  # kopya
        self.trainable = trainable
        self.name = name or "Variable"
        self.shape = self._value.shape

    def read(self):
        return execute("ReadVariable", [], {"var": self})

    def numpy(self):
        return self._value.copy()

    def assign(self, value):
        execute("AssignVariable", [value], {"var": self})

    def assign_sub(self, delta):
        execute("AssignSubVariable", [delta], {"var": self})

    def __repr__(self):
        return f"<Variable {self.name} şekil={self.shape}>"

    # Değişkenle aritmetik = önce oku, sonra op uygula
    def __add__(self, o):
        return add(self, o)

    def __radd__(self, o):
        return add(o, self)

    def __sub__(self, o):
        return sub(self, o)

    def __rsub__(self, o):
        return sub(o, self)

    def __mul__(self, o):
        return mul(self, o)

    def __rmul__(self, o):
        return mul(o, self)

    def __matmul__(self, o):
        return matmul(self, o)

    def __rmatmul__(self, o):
        return matmul(o, self)


def constant(value):
    return Tensor(value)


def convert_to_tensor(x):
    if isinstance(x, Tensor):
        return x
    if isinstance(x, Variable):
        return x.read()
    return Tensor(x)


def current_graph():
    return _graph_stack[-1] if _graph_stack else None


def execute(op_name, inputs=(), attrs=None):
    """Tek giriş noktası: eager modda hemen hesaplar, izleme modunda grafiğe düğüm ekler.

    TF'de bu karar derlemede üretilen gen_*_ops.py sarmalayıcılarında verilir ("if tld.is_eager:";
    üreteç: tensorflow/python/framework/python_op_gen.cc). Eager dal hızlı yoldan
    pywrap_tfe.TFE_Py_FastPathExecute -> TFE_Execute'a iner (tensorflow/python/eager/pywrap_tfe_src.cc);
    tensorflow/python/eager/execute.py yalnızca *_eager_fallback yolunda ve fonksiyon çağrılarında
    kullanılır. Grafik dalı op_def_library._apply_op_helper -> Graph._create_op_internal
    (tensorflow/python/framework/ops.py) ile düğüm ekler.
    """
    opdef = _OPS[op_name]
    attrs = attrs or {}
    inputs = [convert_to_tensor(x) for x in inputs]
    graph = current_graph()
    if graph is not None:
        inputs = [graph.capture(t) for t in inputs]
        shape = None if opdef.side_effect else opdef.shape_fn(*[t.shape for t in inputs], **attrs)
        out = graph.add_node(opdef, inputs, attrs, shape)
    else:
        if any(t.is_symbolic for t in inputs):
            raise RuntimeError("Sembolik tensör grafiğin dışında kullanıldı.")
        value = opdef.forward(*[t.numpy() for t in inputs], **attrs)
        out = None if value is None else Tensor(value)
    if out is not None:
        for tape in list(_tape_stack):
            tape._record(opdef, inputs, attrs, out)
    return out


# ---------------------------------------------------------------- op'lar


def _sum_shape(x, axis=None, keepdims=False):
    return np.zeros(x).sum(axis=axis, keepdims=keepdims).shape


register_op("Const", shape_fn=lambda value: np.shape(value))(lambda value: value)
register_op("Placeholder", shape_fn=lambda **a: a["shape"])(lambda **a: None)
# Yalnızca teybe yazılan kimlik işlemi: dıştaki eager tensörü grafiğe gömülen kopyasına bağlar
# (TF: tensorflow/python/framework/tensor.py, _record_tape -> record_operation("captured_value", ...)).
register_op("CapturedValue")(lambda x: x)
register_op("Add", _broadcast_shape)(lambda x, y: x + y)
register_op("Sub", _broadcast_shape)(lambda x, y: x - y)
register_op("Mul", _broadcast_shape)(lambda x, y: x * y)
register_op("Div", _broadcast_shape)(lambda x, y: x / y)
register_op("Neg")(lambda x: -x)
register_op("Exp")(np.exp)
register_op("Log")(np.log)
register_op("Tanh")(np.tanh)
register_op("Relu")(lambda x: np.maximum(x, 0.0))
register_op("ReluGrad", _broadcast_shape)(lambda g, x: g * (x > 0))
register_op("MatMul", lambda a, b: (a[0], b[1]))(lambda a, b: a @ b)
register_op("Transpose", lambda a: tuple(reversed(a)))(lambda a: a.T)
register_op("Sum", _sum_shape)(lambda x, axis=None, keepdims=False: np.sum(x, axis=axis, keepdims=keepdims))
register_op("Reshape", lambda a, shape: tuple(shape))(lambda x, shape: np.reshape(x, shape))
register_op("BroadcastTo", lambda a, shape: tuple(shape))(lambda x, shape: np.broadcast_to(x, shape).copy())
register_op("OnesLike")(np.ones_like)


@register_op("SumToShape", lambda a, shape: tuple(shape))
def _sum_to_shape(x, shape):
    """Yayınlamayı (broadcasting) geri alır: TF'de BroadcastGradientArgs + Sum + Reshape üçlüsü."""
    shape = tuple(shape)
    lead = x.ndim - len(shape)
    axes = tuple(range(lead)) + tuple(i + lead for i, d in enumerate(shape) if d == 1 and x.shape[i + lead] != 1)
    return np.sum(x, axis=axes, keepdims=True).reshape(shape)


# Durumlu op'lar: değişken okuma/yazma ve "kaynaşık" (fused) optimizasyon çekirdekleri
register_op("ReadVariable", shape_fn=lambda var: var.shape, stateful=True)(lambda var: var._value.copy())


@register_op("AssignVariable", stateful=True, side_effect=True)
def _assign(value, var):
    var._value[...] = value


@register_op("AssignSubVariable", stateful=True, side_effect=True)
def _assign_sub(delta, var):
    var._value -= delta


@register_op("ApplyGradientDescent", stateful=True, side_effect=True)
def _apply_sgd(grad, var, lr):
    """TF: ResourceApplyGradientDescent (tensorflow/core/kernels/training_ops.cc)."""
    var._value -= lr * grad


@register_op("ApplyAdam", stateful=True, side_effect=True)
def _apply_adam(grad, var, slot, lr, beta_1, beta_2, epsilon):
    """TF: ResourceApplyAdam. slot = optimize edicinin m, v, t durumu (TF'de 'slot değişkenleri')."""
    slot["t"] += 1
    t = slot["t"]
    slot["m"] = beta_1 * slot["m"] + (1 - beta_1) * grad
    slot["v"] = beta_2 * slot["v"] + (1 - beta_2) * grad * grad
    lr_t = lr * np.sqrt(1 - beta_2**t) / (1 - beta_1**t)
    var._value -= lr_t * slot["m"] / (np.sqrt(slot["v"]) + epsilon)


# ---------------------------------------------------------------- Python API


def add(x, y):
    return execute("Add", [x, y])


def sub(x, y):
    return execute("Sub", [x, y])


def mul(x, y):
    return execute("Mul", [x, y])


def div(x, y):
    return execute("Div", [x, y])


def neg(x):
    return execute("Neg", [x])


def exp(x):
    return execute("Exp", [x])


def log(x):
    return execute("Log", [x])


def tanh(x):
    return execute("Tanh", [x])


def relu(x):
    return execute("Relu", [x])


def matmul(a, b):
    return execute("MatMul", [a, b])


def transpose(x):
    return execute("Transpose", [x])


def reduce_sum(x, axis=None, keepdims=False):
    return execute("Sum", [x], {"axis": axis, "keepdims": keepdims})


def reduce_mean(x, axis=None):
    """Bileşik op: kendi gradyanı yok, Sum ve Mul'un gradyanlarından türer."""
    x = convert_to_tensor(x)
    n = np.prod(x.shape) if axis is None else x.shape[axis]
    return mul(reduce_sum(x, axis=axis), 1.0 / n)


def square(x):
    x = convert_to_tensor(x)
    return mul(x, x)


def reshape(x, shape):
    return execute("Reshape", [x], {"shape": tuple(shape)})


def broadcast_to(x, shape):
    return execute("BroadcastTo", [x], {"shape": tuple(shape)})


def ones_like(x):
    return execute("OnesLike", [x])


def sum_to_shape(x, shape):
    return x if tuple(x.shape) == tuple(shape) else execute("SumToShape", [x], {"shape": tuple(shape)})


# ---------------------------------------------------------------- gradyanlar
# Gradyan fonksiyonları da op çağırır; bu yüzden (a) dıştaki teyp onları kaydedip
# ikinci türev alabilir, (b) izleme sırasında gradyan da grafiğe düğüm olarak girer.


@register_gradient("Add")
def _add_grad(inputs, out, g):
    x, y = inputs
    return sum_to_shape(g, x.shape), sum_to_shape(g, y.shape)


@register_gradient("Sub")
def _sub_grad(inputs, out, g):
    x, y = inputs
    return sum_to_shape(g, x.shape), sum_to_shape(neg(g), y.shape)


@register_gradient("Mul")
def _mul_grad(inputs, out, g):
    x, y = inputs
    return sum_to_shape(mul(g, y), x.shape), sum_to_shape(mul(g, x), y.shape)


@register_gradient("Div")
def _div_grad(inputs, out, g):
    x, y = inputs
    gx = div(g, y)
    gy = neg(div(mul(g, x), mul(y, y)))
    return sum_to_shape(gx, x.shape), sum_to_shape(gy, y.shape)


register_gradient("CapturedValue")(lambda inputs, out, g: (g,))
register_gradient("Neg")(lambda inputs, out, g: (neg(g),))
register_gradient("Exp")(lambda inputs, out, g: (mul(g, out),))
register_gradient("Log")(lambda inputs, out, g: (div(g, inputs[0]),))
register_gradient("Tanh")(lambda inputs, out, g: (mul(g, sub(1.0, mul(out, out))),))
register_gradient("Relu")(lambda inputs, out, g: (execute("ReluGrad", [g, inputs[0]]),))
register_gradient("ReluGrad")(lambda inputs, out, g: (execute("ReluGrad", [g, inputs[1]]), None))
register_gradient("Transpose")(lambda inputs, out, g: (transpose(g),))
register_gradient("Reshape")(lambda inputs, out, g, shape: (reshape(g, inputs[0].shape),))
register_gradient("BroadcastTo")(lambda inputs, out, g, shape: (sum_to_shape(g, inputs[0].shape),))
register_gradient("SumToShape")(lambda inputs, out, g, shape: (broadcast_to(g, inputs[0].shape),))
register_gradient("OnesLike")(lambda inputs, out, g: (None,))


@register_gradient("MatMul")
def _matmul_grad(inputs, out, g):
    a, b = inputs
    return matmul(g, transpose(b)), matmul(transpose(a), g)


@register_gradient("Sum")
def _sum_grad(inputs, out, g, axis=None, keepdims=False):
    x = inputs[0]
    kept = np.zeros(x.shape).sum(axis=axis, keepdims=True).shape  # indirgenen eksenler 1 olur
    return (broadcast_to(reshape(g, kept), x.shape),)
