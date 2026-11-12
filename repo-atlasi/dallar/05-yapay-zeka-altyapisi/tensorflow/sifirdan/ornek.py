"""Üç aşamayı uçtan uca gösteren küçük örnek: python3 ornek.py"""

import numpy as np

import minitf as tf
from minitf import keras

print("== Aşama 1: GradientTape ==")
w = tf.Variable([[0.5], [-1.0]], name="w")
x = tf.constant([[1.0, 2.0], [3.0, 4.0]])
with tf.GradientTape() as tape:
    kayip = tf.reduce_mean(tf.square(tf.tanh(x @ w) - 1.0))
print("kayıp:", kayip.numpy(), "\nd(kayıp)/dw:\n", tape.gradient(kayip, w).numpy())

print("\n== Aşama 2: izleme (tracing) + optimizasyon ==")


@tf.function
def f(x):
    olcek = tf.constant(2.0) * tf.constant(3.0)  # sabit katlama ile 6'ya iner
    _kullanilmayan = tf.exp(x)  # budama ile silinir
    return tf.reduce_sum(x * olcek)


cf = f.get_concrete_function(np.ones(3))
print(cf.graph.as_text())
print("istatistik:", cf.stats, "| sonuç:", f(np.arange(3.0)).numpy())

print("\n== Aşama 3: Keras benzeri eğitim ==")
rng = np.random.default_rng(0)
X = rng.uniform(-2, 2, size=(128, 1))
Y = np.sin(1.5 * X)
model = keras.Sequential([keras.Dense(16, "tanh", seed=1), keras.Dense(1, seed=2)])
gecmis = keras.fit(model, X, Y, keras.mean_squared_error, keras.Adam(0.02), epochs=200, batch_size=32, compiled=True)
for epoch in (0, 49, 99, 199):
    print(f"epoch {epoch + 1:3d}  mse={gecmis[epoch]:.5f}")
