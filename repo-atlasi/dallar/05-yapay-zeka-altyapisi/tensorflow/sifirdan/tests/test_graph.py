"""Aşama 2 testleri: izleme, önbellek, optimizasyon geçişleri ve grafik içinde gradyan."""

import unittest

import numpy as np

import minitf as tf


class Izleme(unittest.TestCase):
    def test_grafik_sonucu_eager_ile_ayni(self):
        def model(x, w):
            return tf.reduce_sum(tf.tanh(x @ w) + 1.0)

        x, w = np.arange(6.0).reshape(2, 3) / 6, np.ones((3, 2)) * 0.3
        eager = model(tf.constant(x), tf.constant(w)).numpy()
        traced = tf.function(model)(x, w).numpy()
        self.assertAlmostEqual(float(eager), float(traced))

    def test_imza_basina_bir_izleme(self):
        f = tf.function(lambda x: x * 2.0)
        f(np.ones(3))
        f(np.zeros(3))  # aynı şekil -> önbellekten
        self.assertEqual(f.trace_count, 1)
        f(np.ones(4))  # yeni şekil -> yeniden izleme
        self.assertEqual(f.trace_count, 2)

    def test_python_sayisi_her_degerde_yeniden_izletir(self):
        f = tf.function(lambda x, k: x * k)
        for k in (1.0, 2.0, 2.0, 3.0):
            f(np.ones(2), k)
        self.assertEqual(f.trace_count, 3)

    def test_yanlis_sekil_reddedilir(self):
        f = tf.function(lambda x: x + 1.0)
        cf = f.get_concrete_function(np.ones(2))
        with self.assertRaises(ValueError):
            cf(np.ones(3))

    def test_sembolik_tensor_bool_olamaz(self):
        def f(x):
            if x:  # tensör koşulu: AutoGraph'sız TF de burada hata verir
                return x * 2.0
            return x

        with self.assertRaises(RuntimeError):
            tf.function(f)(np.ones(2))


class Optimizasyon(unittest.TestCase):
    def test_sabit_katlama_ve_budama(self):
        def fn(x):
            c = tf.constant(2.0) * tf.constant(3.0) + tf.constant(1.0)  # derleme anında 7
            _olu = tf.exp(x)  # sonucu kullanılmıyor
            return x * c

        ham = tf.function(fn, optimize=False).get_concrete_function(np.ones(2))
        opt = tf.function(fn).get_concrete_function(np.ones(2))
        self.assertEqual(opt.stats["katlanan"], 2)
        self.assertGreaterEqual(opt.stats["budanan"], 4)
        self.assertLess(len(opt.graph.nodes), len(ham.graph.nodes))
        np.testing.assert_allclose(opt(np.array([1.0, 2.0])).numpy(), [7.0, 14.0])
        np.testing.assert_allclose(ham(np.array([1.0, 2.0])).numpy(), [7.0, 14.0])

    def test_yan_etkili_dugum_budanmaz(self):
        v = tf.Variable(np.zeros(2))

        @tf.function
        def artir(x):
            v.assign_sub(-x)  # çıktıya bağlı değil ama silinmemeli

        artir(np.ones(2))
        artir(np.ones(2))
        np.testing.assert_allclose(v.numpy(), [2.0, 2.0])

    def test_degisken_okumasi_katlanmaz(self):
        v = tf.Variable(1.0)
        f = tf.function(lambda: v * 2.0)
        self.assertEqual(float(f().numpy()), 2.0)
        v.assign(5.0)
        self.assertEqual(float(f().numpy()), 10.0)  # okuma çalışma anında yapılır


class GrafikteGradyan(unittest.TestCase):
    def test_teyp_izlenen_fonksiyonun_icinde(self):
        w = tf.Variable(np.array([[0.5], [-0.25]]))

        def grad_fn(x):
            with tf.GradientTape() as tape:
                y = tf.reduce_sum(tf.tanh(x @ w))
            return tape.gradient(y, w)

        x = np.array([[1.0, 2.0], [3.0, -1.0]])
        eager = grad_fn(tf.constant(x)).numpy()
        traced = tf.function(grad_fn)(x).numpy()
        np.testing.assert_allclose(traced, eager)

    def test_fonksiyon_icindeki_teyp_dis_tensoru_izler(self):
        # Dış tensör grafiğe Const olarak gömülür; yakalama teybe "CapturedValue" olarak yazılır
        # (TF: "captured_value"), yoksa izlenen sürüm sessizce None döndürürdü.
        dis = tf.constant(3.0)

        def g():
            with tf.GradientTape() as tape:
                tape.watch(dis)
                y = dis * dis
            return tape.gradient(y, dis)

        self.assertAlmostEqual(float(g().numpy()), 6.0)
        self.assertAlmostEqual(float(tf.function(g)().numpy()), 6.0)


if __name__ == "__main__":
    unittest.main()
