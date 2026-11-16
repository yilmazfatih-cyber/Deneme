"""Örnek (a): MLP ile doğrusal olmayan sınıflandırma (iç içe iki "yarım ay").

Doğrusal bir model iki ayı tek bir düz çizgiyle ayıramaz; iki gizli katmanlı küçük bir sinir ağı
(MLP) eğri bir sınır öğrenir. Adımlar: tohumlu veri → eğitim/sınama ayrımı → ölçekleme (yalnız
eğitimden öğrenilir) → Adam ile tam yığın eğitim → doğruluk ve kaba bir ASCII karar haritası.
Çalıştırma: python ornekler/01_mlp_siniflandirma.py   (birkaç saniye)
"""

from __future__ import annotations

import _setup_path  # noqa: F401
import numpy as np

from ml_temel import nn, optim
from ml_temel.autograd import Tensor, cross_entropy, no_grad
from ml_temel.klasik import LogisticRegression
from ml_temel.onisleme import StandardScaler
from ml_temel.secim import train_test_split
from ml_temel.veri import make_moons


def main() -> None:
    X, y = make_moons(400, noise=0.15, random_state=0)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=0, stratify=y
    )
    scaler = StandardScaler().fit(X_train)
    train, test = scaler.transform(X_train), scaler.transform(X_test)

    linear = LogisticRegression().fit(train, y_train)
    print(f"Lojistik regresyon (düz çizgi) sınama doğruluğu: {linear.score(test, y_test):.3f}")

    model = nn.MLP([2, 32, 32, 2], activation="tanh", rng=0)
    optimizer = optim.Adam(model.parameters(), lr=0.02)
    for step in range(301):
        loss = cross_entropy(model(Tensor(train)), y_train)
        model.zero_grad()
        loss.backward()
        optimizer.step()
        if step % 100 == 0:
            print(f"adım {step:3d}  kayıp {loss.item():.4f}")
    with no_grad():
        accuracy = float(np.mean(model(Tensor(test)).data.argmax(axis=1) == y_test))
    print(f"MLP sınama doğruluğu: {accuracy:.3f}")

    print("\nKarar haritası (A = sınıf 0, b = sınıf 1):")
    xs, ys = np.linspace(-1.5, 2.5, 40), np.linspace(1.3, -0.8, 12)
    grid = np.array([[x, y_] for y_ in ys for x in xs])
    with no_grad():
        labels = model(Tensor(scaler.transform(grid))).data.argmax(axis=1).reshape(len(ys), len(xs))
    for row in labels:
        print("".join("Ab"[value] for value in row))


if __name__ == "__main__":
    main()
