"""Örnek (g): zaman serisi tabanları ve geriye dönük sınama (backtest).

Tohumlu sentetik günlük satış serisi: yavaş artan eğilim + haftalık mevsimsellik + gürültü.
Dört taban model kayan başlangıç noktalı geriye dönük sınamayla (her seferinde yalnız geçmişle
eğitilip sonraki 7 gün tahmin edilir) karşılaştırılır. Karmaşık bir model kurmadan önce bu
tabanları geçtiğinizden emin olun.
Çalıştırma: python ornekler/07_zaman_serisi.py   (birkaç saniye)
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import _setup_path  # noqa: F401
import numpy as np

from ml_temel.zaman import ExponentialSmoothing, SeasonalNaive, backtest


def main() -> None:
    rng = np.random.default_rng(42)
    days = np.arange(364)
    weekly = np.array([0.0, -2.0, -1.0, 0.5, 2.5, 6.0, 4.0])
    sales = 50 + 0.04 * days + weekly[days % 7] + rng.normal(0, 1.5, days.size)
    print(f"{days.size} günlük seri; son hafta: {np.round(sales[-7:], 1).tolist()}")

    candidates: dict[str, Callable[[], Any]] = {
        "naif (dünü tekrarla)": lambda: SeasonalNaive(1),
        "mevsimsel naif (geçen hafta)": lambda: SeasonalNaive(7),
        "basit üstel düzleştirme": ExponentialSmoothing,
        "Holt-Winters (eğilim + hafta)": lambda: ExponentialSmoothing(
            trend=True, seasonal_periods=7
        ),
    }
    print("\nModel                           MAE    RMSE   (7 günlük ufuk, 30 başlangıç)")
    for name, make in candidates.items():
        result = backtest(make, sales, initial=154, horizon=7, step=7)
        print(f"{name:<30s} {result.mae:6.3f} {result.rmse:6.3f}")

    best = ExponentialSmoothing(trend=True, seasonal_periods=7).fit(sales)
    params = f"α={best.alpha_:.2f}, β={best.beta_:.2f}, γ={best.gamma_:.2f}"
    print(f"\nHolt-Winters parametreleri: {params}")
    print("Gelecek 7 gün:", np.round(best.predict(7), 1).tolist())


if __name__ == "__main__":
    main()
