"""Örnek (f): evrişimli sinir ağıyla minik görüntü sınıflandırma (kare / daire / artı).

Tohumlu sentetik 12×12 gürültülü şekiller. Ağ: Conv2d(1→8, 3×3) → ReLU → MaxPool(2) → düzleştir →
Linear(→3). Evrişim aynı küçük süzgeci görüntünün her yerinde kullandığı için şekil nerede olursa
olsun tanınır ve parametre sayısı küçüktür. Küçük yığınlarla (mini-batch) Adam ile eğitilir.
Çalıştırma: python ornekler/06_sekil_evrisim.py   (yaklaşık 10-20 saniye)
"""

from __future__ import annotations

import _setup_path  # noqa: F401
import numpy as np

from ml_temel import nn, optim
from ml_temel.autograd import Tensor, cross_entropy, no_grad
from ml_temel.veri import make_shapes

NAMES = ["kare", "daire", "artı"]


def main() -> None:
    images, labels = make_shapes(900, size=12, noise=0.15, random_state=0)
    train_x, test_x = images[:700], images[700:]
    train_y, test_y = labels[:700], labels[700:]
    nn.manual_seed(0)
    model = nn.Sequential(
        nn.Conv2d(1, 8, kernel_size=3, padding=1),
        nn.ReLU(),
        nn.MaxPool2d(2),
        nn.Flatten(),
        nn.Linear(8 * 6 * 6, 3),
    )
    print(f"Parametre sayısı: {model.num_parameters()}")
    optimizer = optim.Adam(model.parameters(), lr=0.01)
    rng = np.random.default_rng(0)
    for epoch in range(6):
        order = rng.permutation(len(train_x))
        losses = []
        for start in range(0, len(order), 50):
            batch = order[start : start + 50]
            loss = cross_entropy(model(Tensor(train_x[batch])), train_y[batch])
            model.zero_grad()
            loss.backward()
            optimizer.step()
            losses.append(loss.item())
        print(f"tur {epoch + 1}  ortalama kayıp {np.mean(losses):.4f}")
    with no_grad():
        predicted = model(Tensor(test_x)).data.argmax(axis=1)
    print(f"Sınama doğruluğu: {np.mean(predicted == test_y):.3f}")
    for k, name in enumerate(NAMES):
        mask = test_y == k
        print(f"  {name:<6s} {np.mean(predicted[mask] == k):.3f} ({mask.sum()} görüntü)")


if __name__ == "__main__":
    main()
