"""Geriye dönük sınama (backtest): "geçmişte bu modeli kullansaydık ne kadar yanılırdık?"

Fikir (kayan başlangıç noktası, rolling origin): seriyi `initial` gözleme kadar alıp modeli
eğitir, sonraki `horizon` adımı tahmin ederiz; başlangıç noktasını `step` kadar ileri kaydırıp
tekrarlarız. Model hiçbir zaman tahmin ettiği dönemi görmez — zaman sızıntısı olmaz.
Sonuç her başlangıç ve her ufuk adımı için hatadır; ortalamaları modeller arasında karşılaştırılır.

Kullanım:
    sonuc = backtest(lambda: SeasonalNaive(7), satislar, initial=365, horizon=14, step=7)
    sonuc.mae, sonuc.rmse, sonuc.mae_by_horizon
Genişletme: yeni bir hata ölçütü için `BacktestResult`'a alan ekleyin.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import numpy as np

from ml_temel.ortak.types import Array, ArrayLike


@dataclass(frozen=True)
class BacktestResult:
    """`errors`: (başlangıç × ufuk) tahmin - gerçek farkları; `origins`: başlangıç indeksleri."""

    origins: Array
    errors: Array
    mae: float
    rmse: float
    mae_by_horizon: Array


def backtest(
    make_model: Callable[[], Any],
    y: ArrayLike,
    *,
    initial: int,
    horizon: int,
    step: int = 1,
) -> BacktestResult:
    """`make_model()` her başlangıçta yeni (eğitilmemiş) bir model döndürmelidir."""
    series = np.asarray(y, dtype=np.float64).reshape(-1)
    if initial < 1 or horizon < 1 or step < 1:
        raise ValueError("initial, horizon ve step pozitif olmalı.")
    if initial + horizon > series.size:
        raise ValueError(
            f"Seri ({series.size} gözlem) initial ({initial}) + horizon ({horizon}) için kısa."
        )
    origins = np.arange(initial, series.size - horizon + 1, step)
    errors = np.empty((origins.size, horizon))
    for row, origin in enumerate(origins.tolist()):
        model = make_model().fit(series[:origin])
        errors[row] = np.asarray(model.predict(horizon)) - series[origin : origin + horizon]
    return BacktestResult(
        origins=origins,
        errors=errors,
        mae=float(np.abs(errors).mean()),
        rmse=float(np.sqrt((errors**2).mean())),
        mae_by_horizon=np.abs(errors).mean(axis=0),
    )
