"""Aşama 3 — Keras benzeri katmanlar, kayıp, optimize ediciler ve eğitim döngüsü.

Not: Güncel Keras ayrı bir depodadır (keras-team/keras). TF deposundaki
tensorflow/python/keras/ klasörü "eski, silinmek üzere" olarak işaretlidir (oradaki README).
Kaynaşık optimize edici çekirdekleri TF'dedir (tensorflow/core/ops/training_ops.cc:
ResourceApplyGradientDescent, ResourceApplyAdam); onları tf.compat.v1.train optimize edicileri
kullanır (tensorflow/python/training/adam.py, gradient_descent.py). Güncel Keras 3 optimize edicileri
güncellemeyi assign_add/assign_sub gibi ayrı op'larla yazar (keras 3.10.0 paketinde
keras/src/optimizers/adam.py). Mini, kaynaşık çekirdek fikrini göstermek için v1 yolunu taklit eder.
"""

from __future__ import annotations

import numpy as np

from . import core
from .graph import function
from .tape import GradientTape

_ACTIVATIONS = {None: lambda x: x, "tanh": core.tanh, "relu": core.relu}


class Layer:
    """Tembel inşa: ağırlıklar ilk çağrıda, girdi şekli belli olunca yaratılır (Keras build())."""

    def __init__(self, name=None):
        self.name = name or type(self).__name__.lower()
        self.built = False
        self._variables: list[core.Variable] = []

    def add_weight(self, name, value):
        v = core.Variable(value, name=f"{self.name}/{name}")
        self._variables.append(v)
        return v

    @property
    def trainable_variables(self):
        return [v for v in self._variables if v.trainable]

    def __call__(self, x):
        x = core.convert_to_tensor(x)
        if not self.built:
            self.build(x.shape)
            self.built = True
        return self.call(x)

    def build(self, input_shape):
        pass

    def call(self, x):
        raise NotImplementedError


class Dense(Layer):
    def __init__(self, units, activation=None, seed=0, name=None):
        super().__init__(name)
        self.units, self.activation, self.seed = units, activation, seed

    def build(self, input_shape):
        fan_in = input_shape[-1]
        limit = np.sqrt(6.0 / (fan_in + self.units))  # Glorot uniform
        rng = np.random.default_rng(self.seed)
        self.kernel = self.add_weight("kernel", rng.uniform(-limit, limit, (fan_in, self.units)))
        self.bias = self.add_weight("bias", np.zeros(self.units))

    def call(self, x):
        return _ACTIVATIONS[self.activation](core.matmul(x, self.kernel) + self.bias)


class Sequential(Layer):
    def __init__(self, layers, name="sequential"):
        super().__init__(name)
        self.layers = list(layers)

    def call(self, x):
        for layer in self.layers:
            x = layer(x)
        return x

    @property
    def trainable_variables(self):
        return [v for layer in self.layers for v in layer.trainable_variables]


def mean_squared_error(y_true, y_pred):
    return core.reduce_mean(core.square(core.sub(y_pred, y_true)))


class SGD:
    def __init__(self, learning_rate=0.01):
        self.learning_rate = learning_rate

    def apply_gradients(self, grads_and_vars):
        for g, v in grads_and_vars:
            if g is not None:
                core.execute("ApplyGradientDescent", [g], {"var": v, "lr": self.learning_rate})


class Adam:
    def __init__(self, learning_rate=0.001, beta_1=0.9, beta_2=0.999, epsilon=1e-7):
        self.hyper = {"lr": learning_rate, "beta_1": beta_1, "beta_2": beta_2, "epsilon": epsilon}
        self._slots: dict[int, dict] = {}

    def apply_gradients(self, grads_and_vars):
        for g, v in grads_and_vars:
            if g is None:
                continue
            slot = self._slots.setdefault(id(v), {"m": np.zeros(v.shape), "v": np.zeros(v.shape), "t": 0})
            core.execute("ApplyAdam", [g], {"var": v, "slot": slot, **self.hyper})


def make_train_step(model, loss_fn, optimizer, compiled=False):
    """Tek bir eğitim adımı: ileri geçiş -> kayıp -> gradyan -> güncelleme.

    compiled=True ise adım minitf.function ile izlenir; teyp, gradyan ve optimize edici
    güncellemeleri tek bir grafiğe girer (TF'de Keras'ın model.fit()'i varsayılan olarak böyle yapar).
    """

    def train_step(x, y):
        with GradientTape() as tape:
            loss = loss_fn(y, model(x))
        variables = model.trainable_variables
        grads = tape.gradient(loss, variables)
        optimizer.apply_gradients(zip(grads, variables))
        return loss

    return function(train_step) if compiled else train_step


def fit(model, x, y, loss_fn, optimizer, epochs=100, batch_size=None, compiled=False, seed=0):
    """Basit eğitim döngüsü; her epoch'un ortalama kaybını (grup boyuyla ağırlıklı) döndürür.

    Keras gibi son eksik grubu atmaz: 10 örnek ve batch_size=4 -> 4 + 4 + 2. Derlenmiş modda bu
    kısa grup yeni bir girdi şekli olduğu için bir kez daha izleme yapar (imza önbelleğinin sonucu).
    batch_size verilmezse ya da örnek sayısından büyükse tüm veri tek grup olur.
    """
    x, y = np.asarray(x, dtype=core.DTYPE), np.asarray(y, dtype=core.DTYPE)
    model(x[:1])  # ağırlıkları izlemeden önce yarat (TF'de değişkenler yalnızca ilk izlemede yaratılabilir)
    step = make_train_step(model, loss_fn, optimizer, compiled)
    batch_size = min(batch_size or len(x), len(x))
    rng = np.random.default_rng(seed)
    history = []
    for _ in range(epochs):
        order = rng.permutation(len(x))
        losses, sizes = [], []
        for i in range(0, len(x), batch_size):
            idx = order[i : i + batch_size]
            losses.append(float(step(x[idx], y[idx]).numpy()))
            sizes.append(len(idx))
        history.append(float(np.average(losses, weights=sizes)))
    return history
