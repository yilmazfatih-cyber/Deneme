"""Aşama 1 testleri: her op'un teyp gradyanı sonlu farklarla karşılaştırılır."""

import unittest

import numpy as np

import minitf as tf
from minitf.core import sum_to_shape
from tests.yardimci import numeric_grad

RNG = np.random.default_rng(42)


def tape_grads(fn, *arrays):
    """fn(Tensor...) -> Tensor. Toplam çıktının her girdiye göre gradyanı (teyp ile)."""
    xs = [tf.constant(a) for a in arrays]
    with tf.GradientTape() as tape:
        for x in xs:
            tape.watch(x)
        y = fn(*xs)
    return [g.numpy() for g in tape.gradient(y, xs)]


def numeric_grads(fn, *arrays):
    out = []
    for i in range(len(arrays)):

        def f(v, i=i):
            args = [tf.constant(a) for a in arrays]
            args[i] = tf.constant(v)
            return float(np.sum(fn(*args).numpy()))

        out.append(numeric_grad(f, arrays[i]))
    return out


class GradyanKontrolu(unittest.TestCase):
    def kontrol(self, fn, *arrays):
        for got, want in zip(tape_grads(fn, *arrays), numeric_grads(fn, *arrays)):
            np.testing.assert_allclose(got, want, rtol=1e-5, atol=1e-7)

    def test_yayinlamali_toplama_ve_carpma(self):
        a, b = RNG.normal(size=(3, 4)), RNG.normal(size=(4,))
        self.kontrol(lambda x, y: x * y + y, a, b)

    def test_cikarma_bolme(self):
        a, b = RNG.normal(size=(2, 3)), RNG.uniform(1.0, 2.0, size=(2, 1))
        self.kontrol(lambda x, y: (x - y) / y, a, b)

    def test_matmul(self):
        self.kontrol(tf.matmul, RNG.normal(size=(3, 4)), RNG.normal(size=(4, 2)))

    def test_aktivasyonlar(self):
        a = RNG.normal(size=(5,)) + 0.05  # relu'nun kırılma noktasından uzak dur
        self.kontrol(tf.tanh, a)
        self.kontrol(tf.relu, a)
        self.kontrol(tf.exp, a)
        self.kontrol(tf.log, np.abs(a) + 0.5)

    def test_indirgemeler(self):
        a = RNG.normal(size=(3, 4))
        self.kontrol(lambda x: tf.reduce_sum(x, axis=0), a)
        self.kontrol(lambda x: tf.reduce_sum(x, axis=1, keepdims=True), a)
        self.kontrol(lambda x: tf.reduce_mean(tf.square(x)), a)

    def test_bilesik_ifade(self):
        a, w = RNG.normal(size=(4, 3)), RNG.normal(size=(3, 2))
        self.kontrol(lambda x, v: tf.reduce_mean(tf.tanh(x @ v) * tf.exp(-tf.square(x @ v))), a, w)

    def test_sekil_oplari(self):
        # Sabit rastgele ağırlıklarla çarpıyoruz: toplamın gradyanı her konumda farklı olsun,
        # yanlış yere giden (ör. devrik alınmamış) bir gradyan yakalansın.
        a = RNG.normal(size=(2, 3))
        w32, w13, w3, w423 = (RNG.normal(size=s) for s in [(3, 2), (1, 3), (3,), (4, 2, 3)])
        self.kontrol(lambda x: tf.transpose(x) * w32, a)
        self.kontrol(lambda x: tf.reshape(x, (3, 2)) * w32, a)
        self.kontrol(lambda x: tf.broadcast_to(x, (4, 2, 3)) * w423, a)
        self.kontrol(lambda x: sum_to_shape(x, (1, 3)) * w13, a)
        self.kontrol(lambda x: sum_to_shape(x, (3,)) * w3, a)


class TeypDavranisi(unittest.TestCase):
    def test_kalici_olmayan_teyp_bir_kez_kullanilir(self):
        x = tf.constant(2.0)
        with tf.GradientTape() as tape:
            tape.watch(x)
            y = x * x
        self.assertAlmostEqual(float(tape.gradient(y, x).numpy()), 4.0)
        with self.assertRaises(RuntimeError):
            tape.gradient(y, x)

    def test_kalici_teyp(self):
        x = tf.constant(3.0)
        with tf.GradientTape(persistent=True) as tape:
            tape.watch(x)
            y = x * x
            z = y * x
        self.assertAlmostEqual(float(tape.gradient(y, x).numpy()), 6.0)
        self.assertAlmostEqual(float(tape.gradient(z, x).numpy()), 27.0)

    def test_baglantisiz_kaynak_none(self):
        x, u = tf.constant(1.0), tf.constant(5.0)
        with tf.GradientTape() as tape:
            tape.watch(x)
            tape.watch(u)
            y = x * 2.0
        self.assertIsNone(tape.gradient(y, [x, u])[1])

    def test_izlenmeyen_tensor_kaydedilmez(self):
        x = tf.constant(1.0)
        with tf.GradientTape() as tape:
            y = x * 3.0
        self.assertIsNone(tape.gradient(y, x))

    def test_ikinci_turev_ic_ice_teyp(self):
        x = tf.constant(1.5)
        with tf.GradientTape() as dis:
            dis.watch(x)
            with tf.GradientTape() as ic:
                ic.watch(x)
                y = x * x * x
            dy = ic.gradient(y, x)
        d2y = dis.gradient(dy, x)
        self.assertAlmostEqual(float(dy.numpy()), 3 * 1.5**2)
        self.assertAlmostEqual(float(d2y.numpy()), 6 * 1.5)

    def test_relu_uzerinden_ikinci_turev(self):
        # y = relu(x) * x: x > 0 için x², değilse 0. İkinci türev ReluGrad'ın gradyanından geçer.
        x = tf.constant([-1.0, 0.5, 2.0])
        with tf.GradientTape() as dis:
            dis.watch(x)
            with tf.GradientTape() as ic:
                ic.watch(x)
                y = tf.relu(x) * x
            dy = ic.gradient(y, x)
        np.testing.assert_allclose(dy.numpy(), [0.0, 1.0, 4.0])
        np.testing.assert_allclose(dis.gradient(dy, x).numpy(), [0.0, 2.0, 2.0])

    def test_kalici_teyp_baglam_icinde_ikinci_turev(self):
        # TF'deki gibi: kalıcı teyp bağlamın içinde gradient() çağrılınca kayda devam eder.
        x = tf.constant(1.5)
        with tf.GradientTape(persistent=True) as tape:
            tape.watch(x)
            y = x * x * x
            dy = tape.gradient(y, x)
        self.assertAlmostEqual(float(dy.numpy()), 3 * 1.5**2)
        self.assertAlmostEqual(float(tape.gradient(dy, x).numpy()), 6 * 1.5)

    def test_kalici_olmayan_teyp_baglam_icinde_kaydi_birakir(self):
        x = tf.constant(2.0)
        with tf.GradientTape() as tape:
            tape.watch(x)
            y = x * x
            self.assertAlmostEqual(float(tape.gradient(y, x).numpy()), 4.0)
            _ = y * x  # TF: _pop_tape; teyp artık kaydetmez
        self.assertEqual([e.opdef.name for e in tape._entries], ["Mul"])

    def test_degisken_iki_kez_okunursa_gradyanlar_toplanir(self):
        w = tf.Variable(2.0)
        with tf.GradientTape() as tape:
            y = w * 3.0 + w * w  # w iki ayrı ReadVariable ile okunur (aslında üç)
        self.assertAlmostEqual(float(tape.gradient(y, w).numpy()), 3.0 + 2 * 2.0)

    def test_egitilemez_degisken_izlenmez(self):
        w = tf.Variable(2.0, trainable=False)
        with tf.GradientTape() as tape:
            y = w * 3.0
        self.assertIsNone(tape.gradient(y, w))


class Operatorler(unittest.TestCase):
    def test_numpy_solda_olsa_da_tensor_doner(self):
        r = np.ones(2) * tf.constant([1.0, 2.0])  # __array_priority__ olmasa nesne dizisi dönerdi
        self.assertIsInstance(r, tf.Tensor)
        np.testing.assert_allclose(r.numpy(), [1.0, 2.0])
        m = np.eye(2) @ tf.constant([[1.0], [2.0]])  # __rmatmul__
        self.assertIsInstance(m, tf.Tensor)
        np.testing.assert_allclose(m.numpy(), [[1.0], [2.0]])

    def test_bool_eager_degere_bakar(self):
        self.assertFalse(tf.constant(0.0))
        self.assertTrue(tf.constant(2.0))


if __name__ == "__main__":
    unittest.main()
