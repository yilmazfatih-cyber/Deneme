"""N19 Zaman Serisi Tahmini — Chronos-Bolt (kuruluysa) + mevsimsel naif taban çizgisi + geri test (son %20, MAPE).

Chronos kurulu değilse yalnız taban çizgisi döner ve meta'da belirtilir. Aralıklar: Chronos'ta %10-%90 nicelikleri,
taban çizgisinde mevsimsel naif hataların standart sapmasından (±1,28σ).
"""

from __future__ import annotations

import asyncio
import math

import numpy as np

from ...runtimes import model_dir
from ...runtimes.lazy import LazyRegistry
from ..base import register
from ._common import BaseRuntime, ModuleError, RunContext, get_settings, has_package, note, r2, require

FREQ_SEASON = {"H": 24, "D": 7, "W": 52, "M": 12, "MS": 12, "Q": 4, "QS": 4, "Y": 1, "A": 1}
_PIPES = LazyRegistry()


def season_length(freq: str | None, n: int, override: int | None = None) -> int:
    m = int(override) if override else FREQ_SEASON.get((freq or "M").upper(), 1)
    return m if m > 1 and n >= 2 * m else 1


def seasonal_naive(series: list[float], horizon: int, m: int) -> list[float]:
    if m <= 1:
        return [series[-1]] * horizon
    last = series[-m:]
    return [last[h % m] for h in range(horizon)]


def naive_sigma(series: list[float], m: int) -> float:
    lag = max(1, m)
    errs = [series[i] - series[i - lag] for i in range(lag, len(series))]
    return float(np.std(errs)) if len(errs) > 1 else 0.0


def mape(actual: list[float], pred: list[float]) -> float | None:
    pairs = [(a, p) for a, p in zip(actual, pred) if a != 0]
    if not pairs:
        return None
    return round(100 * float(np.mean([abs(a - p) / abs(a) for a, p in pairs])), 2)


def _chronos_model_id() -> str | None:
    order = (
        ["chronos-bolt-base", "chronos-bolt-small"]
        if get_settings().role == "server"
        else ["chronos-bolt-small", "chronos-bolt-base"]
    )
    return next((m for m in order if model_dir(m) is not None), None)


def chronos_forecast(
    series: list[float], horizon: int, model_id: str
) -> tuple[list, list, list]:  # pragma: no cover
    import torch
    from chronos import BaseChronosPipeline

    path = model_dir(model_id)
    pipe = _PIPES.get(
        str(path),
        lambda: BaseChronosPipeline.from_pretrained(str(path), device_map="cpu", torch_dtype=torch.float32),
    )
    quantiles, _mean = pipe.predict_quantiles(
        torch.tensor(series, dtype=torch.float32), prediction_length=horizon, quantile_levels=[0.1, 0.5, 0.9]
    )
    q = quantiles[0].numpy()
    return q[:, 1].tolist(), q[:, 0].tolist(), q[:, 2].tolist()


@register("zaman-serisi")
class ZamanSerisi(BaseRuntime):
    requires = ()

    async def do_forecast(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "series", "horizon")
        try:
            series = [float(x) for x in payload["series"]]
        except (TypeError, ValueError) as e:
            raise ModuleError("'series' sayı listesi olmalı") from e
        if any(math.isnan(x) for x in series):
            raise ModuleError("'series' boş değer (NaN) içeremez; önce doldurun")
        horizon = int(payload["horizon"])
        if len(series) < 3:
            raise ModuleError("En az 3 gözlem gerekli")
        if not 1 <= horizon <= 365:
            raise ModuleError("'horizon' 1 ile 365 arasında olmalı")
        m = season_length(payload.get("freq"), len(series), payload.get("season_length"))

        baseline = seasonal_naive(series, horizon, m)
        sigma = naive_sigma(series, m)
        model_id = _chronos_model_id() if (has_package("chronos") and has_package("torch")) else None
        engine = "seasonal-naive"
        median, low, high = (
            baseline,
            [b - 1.28 * sigma for b in baseline],
            [b + 1.28 * sigma for b in baseline],
        )
        if model_id:
            try:  # pragma: no cover
                median, low, high = await asyncio.to_thread(chronos_forecast, series, horizon, model_id)
                engine = model_id
            except Exception as e:  # pragma: no cover
                note(ctx, chronos_error=str(e)[:200])
        else:
            note(ctx, chronos="kurulu değil; yalnız mevsimsel naif taban çizgisi")

        # geri test: son %20 (en az 1, en fazla horizon kadar)
        test_n = max(1, min(horizon, int(round(len(series) * 0.2))))
        train, test = series[:-test_n], series[-test_n:]
        bt_m = season_length(payload.get("freq"), len(train), payload.get("season_length"))
        bt_base = seasonal_naive(train, test_n, bt_m)
        bt_pred = bt_base
        if engine != "seasonal-naive" and len(train) >= 3:  # pragma: no cover
            try:
                bt_pred, _, _ = await asyncio.to_thread(chronos_forecast, train, test_n, engine)
            except Exception:
                bt_pred = bt_base
        note(ctx, engine=engine, season_length=m, model=engine if engine != "seasonal-naive" else None)
        return {
            "median": [r2(x) for x in median],
            "low": [r2(x) for x in low],
            "high": [r2(x) for x in high],
            "baseline": [r2(x) for x in baseline],
            "backtest_mape": mape(test, bt_pred),
            "baseline_backtest_mape": mape(test, bt_base),
            "backtest_points": test_n,
            "engine": engine,
        }
