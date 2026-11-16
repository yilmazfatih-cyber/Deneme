"""Eğitim akışı: ham tablodan sızıntısız değerlendirilmiş model ve rapor verisi üretir.

Adımlar (her biri ayrı fonksiyon):
  1. `_target`   hedefi ayıkla, görevi ve sınıfları belirle, boş hedefli satırları at
  2. `_columns`  sütun türlerini sez; kimlik/sabit sütunları ve grup sütununu dışarıda bırak
  3. splitting   doğru ayrım stratejisi (zaman / grup / katmanlı / rastgele)
  4. `_compare`  taban çizgisi + adayları AYNI katlarla çapraz doğrula, ana ölçüte göre seç
  5. kalibrasyon (ikili) kat dışı olasılıklarla iç çapraz doğrulamayla seçilir
  6. en iyi aday bütün eğitim verisiyle yeniden eğitilir; sınama kümesi ilk ve tek kez burada
     kullanılır (`holdout.py`): ölçütler + %95 güven aralığı + kalibrasyon + permütasyon önemi
  7. `checks.collect_warnings` sızıntı ve veri sorunlarına karşı uyarılar
Çıktı: (TabularModel, sonuç sözlüğü). Sözlük JSON'a uygundur; rapor ondan üretilir.
Genişletme: yeni bir adım ekleyecekseniz sonucu `results` sözlüğüne yeni bir anahtarla yazın ve
`report.py`'de gösterin.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import numpy as np

from ml_temel import __version__
from ml_temel.ortak.base import clone
from ml_temel.ortak.table import Table
from ml_temel.ortak.types import Array
from ml_temel.tablo import checks
from ml_temel.tablo.candidates import CANDIDATES, BuildOptions, FeatureColumns, baseline
from ml_temel.tablo.evaluation import (
    CandidateResult,
    TargetInfo,
    best_f1_threshold,
    choose_calibration,
    cross_validate,
    higher_is_better,
    task_metrics,
)
from ml_temel.tablo.holdout import evaluate_test
from ml_temel.tablo.importance import permutation_importance
from ml_temel.tablo.messages import t
from ml_temel.tablo.model import TabularModel, derive_columns, logit
from ml_temel.tablo.schema import ColumnInfo, choose_positive, infer_column, infer_task, label_text
from ml_temel.tablo.splitting import SplitPlan, make_split, time_values

MIN_ROWS = 30


@dataclass(frozen=True)
class TrainingConfig:
    """`egit` komutunun ayarları."""

    target: str
    time_column: str | None = None
    group_column: str | None = None
    task: str | None = None
    positive: str | None = None
    models: tuple[str, ...] = ("dogrusal", "orman", "artirma")
    test_size: float = 0.2
    folds: int = 5
    fast: bool = False
    random_state: int = 0
    source_name: str = "veri.csv"
    csv_format: str = ""


def _target(table: Table, config: TrainingConfig) -> tuple[Table, Array, TargetInfo, int]:
    if config.target not in table:
        raise ValueError(t("hedef_yok", hedef=config.target, sutunlar=", ".join(table.names)))
    raw = table[config.target]
    present = ~np.isnan(raw) if raw.dtype.kind == "f" else np.array([v is not None for v in raw])
    if not present.any():
        raise ValueError(t("hedef_bos", hedef=config.target))
    dropped = int((~present).sum())
    table, y = table.take_rows(np.flatnonzero(present)), raw[present]
    task = config.task or infer_task(y)
    if task not in ("siniflandirma", "regresyon"):
        raise ValueError(t("gorev_gecersiz", gorev=task))
    if len(table) < MIN_ROWS:
        raise ValueError(t("az_veri", satir=len(table), gerekli=MIN_ROWS))
    if task == "regresyon":
        return table, y.astype(np.float64), TargetInfo("regresyon"), dropped
    if y.dtype.kind != "f":
        y = np.array([str(v) for v in y.tolist()], dtype=object)
    classes, counts = np.unique(y, return_counts=True)
    if classes.size < 2:
        raise ValueError(t("hedef_tek_sinif", sinif=label_text(classes[0])))
    needed = 2 * max(2, min(config.folds, 3))
    if int(np.min(counts)) < needed:
        rare = [label_text(c) for c, n in zip(classes, counts, strict=True) if n < needed]
        raise ValueError(t("hedef_az_sinif", siniflar=", ".join(rare), gerekli=needed))
    positive = choose_positive(classes, counts)
    if config.positive is not None and classes.size == 2:
        matches = [c for c in classes.tolist() if label_text(c) == config.positive]
        if not matches:
            names = ", ".join(label_text(c) for c in classes.tolist())
            raise ValueError(t("pozitif_yok", deger=config.positive, siniflar=names))
        positive = matches[0]
    return (
        table,
        y,
        TargetInfo("siniflandirma", classes, positive if classes.size == 2 else None),
        dropped,
    )


def _columns(
    table: Table, config: TrainingConfig
) -> tuple[list[ColumnInfo], FeatureColumns, list[str]]:
    infos: list[ColumnInfo] = []
    for name in table.names:
        if name == config.target:
            continue
        if name == config.group_column:
            infos.append(ColumnInfo(name, "grup", 0.0, 0, "grup sütunu: ayrımda kullanılır"))
            continue
        infos.append(infer_column(name, table[name]))
    usable = [info for info in infos if info.kind in ("sayisal", "kategori", "metin", "tarih")]
    dates = [info.name for info in usable if info.kind == "tarih"]
    derived = [f"{name}__{part}" for name in dates for part in ("ay", "haftagunu")]
    features = FeatureColumns(
        numeric=[i.name for i in usable if i.kind == "sayisal"] + derived,
        categorical=[i.name for i in usable if i.kind == "kategori"],
        text=[i.name for i in usable if i.kind == "metin"],
    )
    return infos, features, [info.name for info in usable]


def _compare(
    data: Table,
    y: Array,
    plan: SplitPlan,
    info: TargetInfo,
    models: dict[str, Any],
    progress: Callable[[str], None],
) -> tuple[dict[str, CandidateResult], list[str]]:
    rows = plan.order[plan.train]
    train_data, train_y = data.take_rows(rows), y[rows]
    results: dict[str, CandidateResult] = {}
    failures: list[str] = []
    for name, estimator in models.items():
        progress(t("ilerleme_model", model=t(f"model_{name}")))
        try:
            results[name] = cross_validate(name, estimator, train_data, train_y, plan.folds, info)
        except (ValueError, np.linalg.LinAlgError, MemoryError) as error:
            failures.append(t("uyari_aday_hata", model=t(f"model_{name}"), hata=str(error)))
    return results, failures


def _pick_best(results: dict[str, CandidateResult], metric: str) -> str:
    sign = 1.0 if higher_is_better(metric) else -1.0
    scored = {name: sign * r.mean(metric) for name, r in results.items() if name != "taban"}
    scored = {name: value for name, value in scored.items() if np.isfinite(value)}
    if not scored:
        raise ValueError(t("hata_aday_yok"))
    return max(scored, key=lambda name: scored[name])


def _summary(result: CandidateResult) -> dict[str, Any]:
    return {
        "model": result.name,
        "olcutler": {m: {"ort": result.mean(m), "std": result.std(m)} for m in result.fold_scores},
        "sure": result.seconds,
    }


def _group_ids(column: Array) -> Array:
    """Grup sütununu karşılaştırılabilir metne çevirir (eksik grup ayrı bir grup sayılır)."""
    values = [
        "(eksik)" if v is None or (isinstance(v, float) and np.isnan(v)) else label_text(v)
        for v in column.tolist()
    ]
    return np.array(values, dtype=object)


def _fold_count(config: TrainingConfig, y: Array, info: TargetInfo) -> int:
    if info.task == "regresyon":
        return config.folds
    _, counts = np.unique(y, return_counts=True)
    available = int(int(np.min(counts)) * (1.0 - config.test_size))  # eğitimde kalacak en az örnek
    return max(2, min(config.folds, available))


def _calibration(
    result: CandidateResult, y_train: Array, info: TargetInfo, seed: int
) -> tuple[dict[str, Any], Any, float | None]:
    if not info.binary or info.classes is None:
        return {"yontem": "yok", "aday_log_kayip": {}}, None, None
    column = int(np.flatnonzero(info.classes == info.positive)[0])
    mask = result.oof_mask
    positive = result.oof[mask, column]
    y01 = (y_train[mask] == info.positive).astype(int)
    method, losses, calibrator = choose_calibration(positive, y01, seed)
    calibrated = positive if calibrator is None else calibrator.predict(logit(positive))
    return (
        {"yontem": method, "aday_log_kayip": losses},
        calibrator,
        best_f1_threshold(y01, calibrated),
    )


def train(
    table: Table,
    config: TrainingConfig,
    now: datetime,
    progress: Callable[[str], None] = lambda message: None,
) -> tuple[TabularModel, dict[str, Any]]:
    """Bütün akış; (eğitilmiş model, rapor için sonuç sözlüğü) döndürür."""
    for name in config.models:
        if name not in CANDIDATES:
            raise ValueError(t("model_adi_gecersiz", ad=name, secenekler=", ".join(CANDIDATES)))
    table, y, info, dropped_target = _target(table, config)
    infos, features, input_columns = _columns(table, config)
    dates = [i.name for i in infos if i.kind == "tarih"]
    data = derive_columns(table.select(input_columns), dates)
    time = None if config.time_column is None else time_values(table[config.time_column])
    groups = None if config.group_column is None else _group_ids(table[config.group_column])
    plan = make_split(
        len(table),
        y,
        info.task,
        time=time,
        groups=groups if time is None else None,
        test_size=config.test_size,
        folds=_fold_count(config, y, info),
        seed=config.random_state,
    )
    options = BuildOptions(info.task, config.fast, config.random_state, int(plan.train.size))
    models: dict[str, Any] = {"taban": baseline(info.task)}
    models.update({name: CANDIDATES[name](features, options) for name in config.models})
    results, failures = _compare(data, y, plan, info, models, progress)
    metric = task_metrics(info)[0]
    best = _pick_best(results, metric)
    train_rows, test_rows = plan.order[plan.train], plan.order[plan.test]
    calibration, calibrator, hint = _calibration(
        results[best], y[train_rows], info, config.random_state
    )
    fitted = {
        key: clone(models[key]).fit(data.take_rows(train_rows), y[train_rows])
        for key in (best, "taban")
    }
    common = (info.task, config.target, input_columns, dates)
    final = TabularModel(*common, fitted[best], info.classes, info.positive, calibrator)
    base = TabularModel(*common, fitted["taban"], info.classes, info.positive, None)
    test_table, y_test = table.take_rows(test_rows), y[test_rows]
    test_groups = None if groups is None or time is not None else groups[test_rows]
    test = evaluate_test(
        final, base, test_table, y_test, info, config.fast, config.random_state, test_groups, hint
    )
    repeats = 2 if config.fast else 5
    importance = permutation_importance(
        final, test_table, y_test, metric, info, repeats, config.random_state
    )
    duplicates = checks.duplicate_share(table, y, train_rows, test_rows, input_columns)
    results_dict: dict[str, Any] = {
        "olusturma": now.isoformat(timespec="seconds"),
        "surum": __version__,
        "veri": checks.data_summary(table, y, info, config, dropped_target),
        "sutunlar": [
            {
                "ad": i.name,
                "tur": i.kind,
                "eksik": i.missing_rate,
                "farkli": i.n_unique,
                "not": i.note,
            }
            for i in infos
        ],
        "ayrim": {
            "strateji": plan.strategy,
            "egitim": int(plan.train.size),
            "sinama": int(plan.test.size),
            "kat": len(plan.folds),
            "atilan_zamansiz": plan.dropped,
        },
        "ana_olcut": metric,
        "cv": [_summary(results[name]) for name in results],
        "en_iyi": best,
        "kalibrasyon": calibration,
        "esik": {"kullanilan": 0.5, "f1_en_iyi": hint},
        "sinama": test,
        "onem": importance,
        "ayarlar": {
            "tohum": config.random_state,
            "hizli": config.fast,
            "modeller": list(config.models),
        },
    }
    results_dict["uyarilar"] = failures + checks.collect_warnings(
        results_dict, infos, info, duplicates, config
    )
    return final, results_dict
