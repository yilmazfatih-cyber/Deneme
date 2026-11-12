"""Aşama 3 testleri: katmanlar, optimize ediciler ve eğitim döngüsü (sentetik veri, internet yok)."""

import unittest

import numpy as np

import minitf as tf
from minitf import keras


def dogrusal_veri(n=64, seed=0):
    rng = np.random.default_rng(seed)
    x = rng.uniform(-1, 1, size=(n, 2))
    y = x @ np.array([[2.0], [-3.0]]) + 0.5
    return x, y


def egrisel_veri(n=64, seed=1):
    rng = np.random.default_rng(seed)
    x = rng.uniform(-2, 2, size=(n, 1))
    return x, np.sin(1.5 * x)


class Katmanlar(unittest.TestCase):
    def test_dense_sekilleri_ve_tembel_insa(self):
        layer = keras.Dense(3, activation="tanh")
        self.assertFalse(layer.built)
        y = layer(np.ones((5, 4)))
        self.assertTrue(layer.built)
        self.assertEqual(y.shape, (5, 3))
        self.assertEqual([v.shape for v in layer.trainable_variables], [(4, 3), (3,)])


class Egitim(unittest.TestCase):
    def test_sgd_dogrusal_regresyon(self):
        x, y = dogrusal_veri()
        model = keras.Sequential([keras.Dense(1)])
        history = keras.fit(model, x, y, keras.mean_squared_error, keras.SGD(0.2), epochs=150)
        self.assertLess(history[-1], 1e-4)
        np.testing.assert_allclose(model.layers[0].kernel.numpy().ravel(), [2.0, -3.0], atol=1e-2)

    def test_adam_egrisel_veri(self):
        x, y = egrisel_veri()
        model = keras.Sequential([keras.Dense(16, "tanh", seed=3), keras.Dense(1, seed=4)])
        history = keras.fit(model, x, y, keras.mean_squared_error, keras.Adam(0.02), epochs=300, compiled=True)
        self.assertLess(history[-1], 0.1 * history[0])

    def test_derlenmis_adim_eager_ile_ayni(self):
        x, y = dogrusal_veri(32)
        sonuclar = []
        for compiled in (False, True):
            model = keras.Sequential([keras.Dense(4, "relu", seed=7), keras.Dense(1, seed=8)])
            h = keras.fit(model, x, y, keras.mean_squared_error, keras.Adam(0.01), epochs=20, batch_size=8, compiled=compiled)
            sonuclar.append((h, model.layers[0].kernel.numpy()))
        np.testing.assert_array_equal(sonuclar[0][0], sonuclar[1][0])  # bit düzeyinde aynı
        np.testing.assert_array_equal(sonuclar[0][1], sonuclar[1][1])

    def test_son_eksik_grup_atilmaz(self):
        x, y = dogrusal_veri(10)

        class SayanSGD(keras.SGD):
            adim = 0

            def apply_gradients(self, grads_and_vars):
                self.adim += 1  # Python yan etkisi: derlenmiş modda yalnızca izlemede çalışır
                super().apply_gradients(grads_and_vars)

        eager_opt, derli_opt = SayanSGD(0.1), SayanSGD(0.1)
        mse = keras.mean_squared_error
        h1 = keras.fit(keras.Sequential([keras.Dense(1, seed=5)]), x, y, mse, eager_opt, epochs=3, batch_size=4)
        h2 = keras.fit(keras.Sequential([keras.Dense(1, seed=5)]), x, y, mse, derli_opt, epochs=3, batch_size=4, compiled=True)
        self.assertEqual(eager_opt.adim, 3 * 3)  # her epoch 4 + 4 + 2: son kısa grup da kullanılır
        self.assertEqual(derli_opt.adim, 2)  # iki girdi şekli (4 ve 2) = iki izleme
        np.testing.assert_array_equal(h1, h2)
        h3 = keras.fit(keras.Sequential([keras.Dense(1)]), x, y, mse, keras.SGD(0.1), epochs=2, batch_size=64)
        self.assertTrue(np.all(np.isfinite(h3)))  # batch_size > örnek sayısı: tek grup, nan yok

    def test_derlenmis_adim_tek_kez_izlenir(self):
        x, y = dogrusal_veri(16)
        model = keras.Sequential([keras.Dense(1)])
        model(x[:1])
        step = keras.make_train_step(model, keras.mean_squared_error, keras.SGD(0.1), compiled=True)
        for _ in range(5):
            step(x, y)
        self.assertEqual(step.trace_count, 1)
        text = step.get_concrete_function(x, y).graph.as_text()
        self.assertIn("ApplyGradientDescent", text)
        self.assertIn("MatMul", text)

    def test_gradyan_yoksa_guncelleme_atlanir(self):
        v = tf.Variable([1.0])
        keras.SGD(0.5).apply_gradients([(None, v)])
        np.testing.assert_allclose(v.numpy(), [1.0])


if __name__ == "__main__":
    unittest.main()
