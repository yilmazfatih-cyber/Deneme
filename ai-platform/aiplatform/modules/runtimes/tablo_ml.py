"""N20 Tablo ML — LightGBM ile sınıflandırma/regresyon eğitimi ve skorlama; açıklama `pred_contrib=True` ile.

Modeller `data_dir/tablo_ml/<model_id>.pkl` (yalnız platformun ürettiği dosyalar).
"""

from __future__ import annotations

import asyncio
import pickle
import re
import uuid

from ..base import register
from ._common import BaseRuntime, ModuleError, RunContext, get_settings, has_package, not_ready, note, require


def _path(model_id: str):
    if not re.fullmatch(r"[A-Za-z0-9_\-]{1,64}", model_id or ""):
        raise ModuleError("Geçersiz model kimliği")
    return get_settings().data_dir / "tablo_ml" / f"{model_id}.pkl"


def _frame(rows: list[dict], features: list[str], categories: dict[str, list] | None = None):
    import pandas as pd

    df = pd.DataFrame(rows)
    for f in features:
        if f not in df.columns:
            df[f] = None
    df = df[features]
    cats = {}
    for col in features:
        if categories is not None:
            if col in categories:
                df[col] = pd.Categorical(df[col].astype("string"), categories=categories[col])
            else:
                df[col] = pd.to_numeric(df[col], errors="coerce")
        elif df[col].dtype == object or str(df[col].dtype).startswith("string"):
            num = pd.to_numeric(df[col], errors="coerce")
            if num.notna().sum() >= 0.9 * df[col].notna().sum():
                df[col] = num
            else:
                df[col] = df[col].astype("string").astype("category")
                cats[col] = list(df[col].cat.categories)
    return df, cats


def train(rows: list[dict], target: str, task: str, model_id: str) -> dict:  # pragma: no cover - lightgbm yok
    import lightgbm as lgb
    import numpy as np
    import pandas as pd
    from sklearn import metrics
    from sklearn.model_selection import train_test_split

    y_raw = pd.Series([r.get(target) for r in rows])
    if y_raw.isna().any():
        raise ModuleError(f"Hedef sütun '{target}' boş değer içeriyor")
    features = sorted({k for r in rows for k in r if k != target})
    X, cats = _frame(rows, features)
    if task == "auto":
        task = (
            "regression"
            if pd.api.types.is_numeric_dtype(y_raw) and y_raw.nunique() > 10
            else "classification"
        )
    strat = y_raw if task == "classification" and y_raw.value_counts().min() >= 2 else None
    Xtr, Xte, ytr, yte = train_test_split(X, y_raw, test_size=0.2, random_state=42, stratify=strat)
    if task == "classification":
        model = lgb.LGBMClassifier(n_estimators=300, learning_rate=0.05, verbose=-1)
        model.fit(Xtr, ytr.astype(str))
        pred = model.predict(Xte)
        scores = {
            "accuracy": round(float(metrics.accuracy_score(yte.astype(str), pred)), 4),
            "f1_macro": round(float(metrics.f1_score(yte.astype(str), pred, average="macro")), 4),
        }
    else:
        model = lgb.LGBMRegressor(n_estimators=300, learning_rate=0.05, verbose=-1)
        model.fit(Xtr, ytr.astype(float))
        pred = model.predict(Xte)
        scores = {
            "rmse": round(float(np.sqrt(metrics.mean_squared_error(yte, pred))), 4),
            "mae": round(float(metrics.mean_absolute_error(yte, pred)), 4),
            "r2": round(float(metrics.r2_score(yte, pred)), 4),
        }
    imp = sorted(zip(features, model.feature_importances_.tolist()), key=lambda x: -x[1])
    p = _path(model_id)
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("wb") as f:
        pickle.dump(
            {"model": model, "features": features, "categories": cats, "task": task, "target": target}, f
        )
    return {
        "model_id": model_id,
        "task": task,
        "metrics": scores,
        "rows": len(rows),
        "test_rows": len(yte),
        "feature_importance": [{"feature": k, "importance": int(v)} for k, v in imp],
    }


def score(model_id: str, rows: list[dict], explain: bool) -> dict:  # pragma: no cover - lightgbm yok
    p = _path(model_id)
    if not p.exists():
        raise ModuleError(f"Model bulunamadı: {model_id} (önce 'train' çalıştırın)")
    with p.open("rb") as f:
        b = pickle.load(f)
    X, _ = _frame(rows, b["features"], b["categories"])
    model = b["model"]
    out: dict = {"model_id": model_id, "task": b["task"]}
    if b["task"] == "classification":
        proba = model.predict_proba(X)
        classes = [str(c) for c in model.classes_]
        out["predictions"] = [classes[int(i)] for i in proba.argmax(axis=1)]
        out["probabilities"] = [{c: round(float(v), 4) for c, v in zip(classes, row)} for row in proba]
    else:
        out["predictions"] = [round(float(v), 4) for v in model.predict(X)]
    if explain:
        if b["task"] == "classification" and len(model.classes_) > 2:
            out["explanations_note"] = "Çok sınıflı modelde katkı açıklaması bu sürümde verilmiyor"
        else:
            contrib = model.predict(X, pred_contrib=True)
            feats = b["features"]
            out["explanations"] = [
                {
                    "base": round(float(row[-1]), 4),
                    "top": sorted(
                        ({"feature": f, "contribution": round(float(v), 4)} for f, v in zip(feats, row[:-1])),
                        key=lambda d: -abs(d["contribution"]),
                    )[:5],
                }
                for row in contrib
            ]
    return out


@register("tablo-ml")
class TabloMl(BaseRuntime):
    requires = ("lightgbm", "sklearn", "pandas")

    def _check(self):
        for pkg, name in (("lightgbm", "lightgbm"), ("sklearn", "scikit-learn"), ("pandas", "pandas")):
            if not has_package(pkg):
                raise not_ready(name, "tablo-ml")

    async def do_train(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "rows", "target")
        self._check()
        rows = payload["rows"]
        if not isinstance(rows, list) or len(rows) < 20 or not all(isinstance(r, dict) for r in rows):
            raise ModuleError("'rows' en az 20 satırlık nesne listesi olmalı")
        task = payload.get("task") or "auto"
        if task not in ("auto", "classification", "regression"):
            raise ModuleError("'task' auto, classification veya regression olmalı")
        model_id = payload.get("model_id") or f"tablo-{uuid.uuid4().hex[:8]}"
        res = await asyncio.to_thread(train, rows, str(payload["target"]), task, model_id)
        note(ctx, engine="lightgbm")
        return res

    async def do_score(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "model_id", "rows")
        self._check()
        res = await asyncio.to_thread(
            score, str(payload["model_id"]), payload["rows"], bool(payload.get("explain", True))
        )
        note(ctx, engine="lightgbm")
        return res
