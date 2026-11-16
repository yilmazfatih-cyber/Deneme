"""Zaman serisi taban modelleri: mevsimsel naif ve (Holt-Winters) üstel düzleştirme.

Fikir: karmaşık bir tahmin modeli kurmadan önce basit tabanları geçmesi gerekir:

  SeasonalNaive          "geçen sezonun aynı anı tekrar eder": ŷ(t+h) = y(t+h-m); m = 1: son değer.
  ExponentialSmoothing   düzey (ℓ), isteğe bağlı eğim (b) ve toplamsal mevsim (s) bileşenleri:
                           ℓₜ = α(yₜ - sₜ₋ₘ) + (1-α)(ℓₜ₋₁ + bₜ₋₁)
                           bₜ = β(ℓₜ - ℓₜ₋₁) + (1-β)bₜ₋₁
                           sₜ = γ(yₜ - ℓₜ) + (1-γ)sₜ₋ₘ
                         h adım sonrası: ℓ_T + h·b_T + s_(T-m+1+(h-1) mod m)

Verilmeyen α, β, γ değerleri, bir adım sonrası hataların kareleri toplamını en küçükleyen ızgara
noktasından seçilir; bütün ızgara noktaları zaman boyunca BİRLİKTE (vektörel) güncellenir.
Arayüz: `fit(y)` → `predict(ufuk)`. Geriye dönük değerlendirme için `backtest.py`.
Genişletme: çarpımsal mevsim gibi bir tür için `_run`'daki güncelleme denklemlerini kopyalayın.
"""

from __future__ import annotations

import itertools
from typing import Self

import numpy as np

from ml_temel.ortak.base import BaseEstimator
from ml_temel.ortak.types import Array, ArrayLike
from ml_temel.ortak.validation import check_is_fitted

_GRID = np.round(np.linspace(0.05, 0.95, 10), 2)


def _series(y: ArrayLike, minimum: int) -> Array:
    values = np.asarray(y, dtype=np.float64).reshape(-1)
    if values.size < minimum:
        raise ValueError(f"Seri en az {minimum} gözlem içermeli; verilen: {values.size}.")
    if not np.isfinite(values).all():
        raise ValueError("Seride eksik ya da sonsuz değer var; önce doldurun (ör. ileri taşıma).")
    return values


class SeasonalNaive(BaseEstimator):
    """Son sezonu tekrarlar (`season_length=1`: son değeri tekrarlar)."""

    def __init__(self, season_length: int = 1) -> None:
        self.season_length = season_length

    def fit(self, y: ArrayLike) -> Self:
        values = _series(y, self.season_length)
        self.last_season_ = values[-self.season_length :].copy()
        return self

    def predict(self, horizon: int) -> Array:
        check_is_fitted(self, "last_season_")
        repeats = int(np.ceil(horizon / self.season_length))
        return np.tile(self.last_season_, repeats)[:horizon]


class ExponentialSmoothing(BaseEstimator):
    """Toplamsal Holt-Winters; `trend=False`, `seasonal_periods=None` → basit üstel düzleştirme."""

    def __init__(
        self,
        trend: bool = False,
        seasonal_periods: int | None = None,
        alpha: float | None = None,
        beta: float | None = None,
        gamma: float | None = None,
    ) -> None:
        self.trend = trend
        self.seasonal_periods = seasonal_periods
        self.alpha = alpha
        self.beta = beta
        self.gamma = gamma

    def _initial(self, y: Array) -> tuple[float, float, Array]:
        m = self.seasonal_periods or 1
        if self.seasonal_periods:
            level = float(y[:m].mean())
            slope = float((y[m : 2 * m].mean() - y[:m].mean()) / m) if self.trend else 0.0
            season = y[:m] - level
        else:
            level, slope, season = (
                float(y[0]),
                float(y[1] - y[0]) if self.trend else 0.0,
                np.zeros(1),
            )
        return level, slope, season

    def _run(self, y: Array, params: Array) -> tuple[Array, Array, Array, Array]:
        """Bütün parametre üçlüleri (k × 3) için seriyi gezer: (SSE, düzey, eğim, mevsim)."""
        m = self.seasonal_periods or 1
        alpha, beta, gamma = params[:, 0], params[:, 1], params[:, 2]
        level0, slope0, season0 = self._initial(y)
        k = params.shape[0]
        level, slope = np.full(k, level0), np.full(k, slope0)
        season = np.tile(season0 if self.seasonal_periods else np.zeros(m), (k, 1))
        sse = np.zeros(k)
        start = m if self.seasonal_periods else 1
        for t in range(start, y.size):
            slot = t % m
            seasonal = season[:, slot] if self.seasonal_periods else 0.0
            forecast = level + slope + seasonal
            sse += (y[t] - forecast) ** 2
            new_level = alpha * (y[t] - seasonal) + (1 - alpha) * (level + slope)
            if self.trend:
                slope = beta * (new_level - level) + (1 - beta) * slope
            if self.seasonal_periods:
                season[:, slot] = gamma * (y[t] - new_level) + (1 - gamma) * season[:, slot]
            level = new_level
        return sse, level, slope, season

    def fit(self, y: ArrayLike) -> Self:
        m = self.seasonal_periods
        values = _series(y, 2 * m if m else 2)
        choices = [
            [self.alpha] if self.alpha is not None else _GRID,
            ([self.beta] if self.beta is not None else _GRID) if self.trend else [0.0],
            ([self.gamma] if self.gamma is not None else _GRID) if m else [0.0],
        ]
        params = np.array(list(itertools.product(*choices)), dtype=np.float64)
        sse, level, slope, season = self._run(values, params)
        best = int(np.argmin(sse))
        self.alpha_, self.beta_, self.gamma_ = (float(v) for v in params[best])
        self.level_, self.slope_ = float(level[best]), float(slope[best])
        self.season_ = season[best].copy()
        self.n_obs_ = values.size
        self.sse_ = float(sse[best])
        return self

    def predict(self, horizon: int) -> Array:
        check_is_fitted(self, "level_")
        steps = np.arange(1, horizon + 1)
        forecast = self.level_ + steps * (self.slope_ if self.trend else 0.0)
        if self.seasonal_periods:
            m = self.seasonal_periods
            forecast = forecast + self.season_[(self.n_obs_ + steps - 1) % m]
        return forecast
