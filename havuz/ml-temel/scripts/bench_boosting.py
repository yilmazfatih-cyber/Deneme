"""Hız ölçümü: gradyan artırma (100 000 × 50, 100 adım) ve rastgele orman (README'deki rakamlar).

Ölçülen: kutulama dahil `fit` süresi ve 100 000 satırda `predict` süresi; regresyon ve ikili
sınıflama için ayrı ayrı. scikit-learn kuruluysa aynı ayarlarla onun süresi de yazdırılır
(karşılaştırma için; iş parçacığı sayısı OMP_NUM_THREADS ile sınırlanır).
Kullanım:  OMP_NUM_THREADS=2 python scripts/bench_boosting.py [--satir 100000] [--sutun 50]
           OMP_NUM_THREADS=2 python scripts/bench_boosting.py --orman   (10 000 × 20, 100 ağaç)
Genişletme: başka bir model ölçmek için `MODELS` sözlüğüne bir satır ekleyin.
"""

from __future__ import annotations

import argparse
import platform
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ml_temel.klasik import (
    HistGradientBoostingClassifier,
    HistGradientBoostingRegressor,
    RandomForestClassifier,
)

MODELS: dict[str, tuple[Any, str]] = {
    "regresyon": (HistGradientBoostingRegressor, "HistGradientBoostingRegressor"),
    "ikili sınıflama": (HistGradientBoostingClassifier, "HistGradientBoostingClassifier"),
}


def data(rows: int, columns: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    rng = np.random.default_rng(0)
    X = rng.standard_normal((rows, columns))
    signal = X[:, :5].sum(axis=1) + np.sin(2 * X[:, 5]) + X[:, 6] * X[:, 7]
    noisy = signal + 0.5 * rng.standard_normal(rows)
    return X, noisy, (noisy > 0).astype(int)


def timed(model: Any, X: np.ndarray, y: np.ndarray) -> tuple[float, float]:
    started = time.perf_counter()
    model.fit(X, y)
    fitted = time.perf_counter()
    model.predict(X)
    return fitted - started, time.perf_counter() - fitted


def forest() -> None:
    """Rastgele orman: 10 000 × 20, 100 tam derin ağaç (sınıflama)."""
    X, _, y = data(10_000, 20)
    fit_s, predict_s = timed(RandomForestClassifier(100, random_state=0), X, y)
    print(f"ml-temel     orman (100 ağaç)  fit {fit_s:6.1f} sn   predict {predict_s:5.2f} sn")
    try:
        import sklearn.ensemble as sk
    except ImportError:
        return
    fit_s, predict_s = timed(sk.RandomForestClassifier(100, random_state=0, n_jobs=1), X, y)
    print(f"scikit-learn orman (100 ağaç)  fit {fit_s:6.1f} sn   predict {predict_s:5.2f} sn")


def main() -> None:
    parser = argparse.ArgumentParser(description="Gradyan artırma hız ölçümü")
    parser.add_argument("--satir", type=int, default=100_000)
    parser.add_argument("--sutun", type=int, default=50)
    parser.add_argument("--adim", type=int, default=100)
    parser.add_argument("--orman", action="store_true", help="rastgele ormanı ölç (10 000 × 20)")
    args = parser.parse_args()
    if args.orman:
        forest()
        return
    X, y_reg, y_clf = data(args.satir, args.sutun)
    print(f"Python {platform.python_version()}, numpy {np.__version__}, {platform.machine()}")
    print(f"Veri: {args.satir} satır × {args.sutun} sütun, {args.adim} adım, erken durdurma kapalı")
    for task, (ours, sklearn_name) in MODELS.items():
        target = y_reg if task == "regresyon" else y_clf
        options = {"max_iter": args.adim, "early_stopping": False, "random_state": 0}
        fit_s, predict_s = timed(ours(**options), X, target)
        print(f"ml-temel     {task:<16s} fit {fit_s:6.1f} sn   predict {predict_s:5.2f} sn")
        try:
            import sklearn.ensemble as sk  # karşılaştırma için; paket bağımlılığı değildir
        except ImportError:
            continue
        fit_s, predict_s = timed(getattr(sk, sklearn_name)(**options), X, target)
        print(f"scikit-learn {task:<16s} fit {fit_s:6.1f} sn   predict {predict_s:5.2f} sn")


if __name__ == "__main__":
    main()
