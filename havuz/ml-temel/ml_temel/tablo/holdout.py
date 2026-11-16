"""Sınama kümesi değerlendirmesi: ölçütler (güven aralığıyla), kalibrasyon tablosu, karışıklık.

Sınama kümesi model seçimi ve kalibrasyon kararı BİTTİKTEN sonra, yalnız bir kez kullanılır.
Burada üretilen sayılar raporun "Sınama sonuçları", "Olasılık kalibrasyonu" ve "Karar eşiği"
bölümlerine girer. Taban çizgisi aynı satırlarda aynı yöntemle ölçülür.
Genişletme: yeni bir sınama çıktısı için `evaluate_test`'in döndürdüğü sözlüğe anahtar ekleyin ve
`report.py`'de gösterin.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from ml_temel import olcut
from ml_temel.ortak.table import Table
from ml_temel.ortak.types import Array
from ml_temel.tablo.evaluation import TargetInfo, bootstrap_metrics, model_output
from ml_temel.tablo.model import TabularModel


def _ci_dict(results: dict[str, olcut.BootstrapResult]) -> dict[str, dict[str, float]]:
    return {m: {"deger": r.estimate, "alt": r.low, "ust": r.high} for m, r in results.items()}


def _confusion(y01: Array, positive: Array, threshold: float) -> list[list[int]]:
    matrix = olcut.confusion_matrix(y01, (positive >= threshold).astype(int), labels=[0, 1])
    return [[int(v) for v in row] for row in matrix]


def _binary_details(
    final: TabularModel, table: Table, y: Array, output: Array, info: TargetInfo, hint: float | None
) -> dict[str, Any]:
    assert info.classes is not None
    column = int(np.flatnonzero(info.classes == info.positive)[0])
    y01 = (y == info.positive).astype(int)
    raw, calibrated = final.raw_proba(table)[:, column], output[:, column]
    tables = {}
    for key, values in (("once", raw), ("sonra", calibrated)):
        predicted, observed, counts = olcut.calibration_table(y01, values, n_bins=10)
        tables[key] = [
            {"tahmin": float(p), "gercek": float(o), "sayi": int(c)}
            for p, o, c in zip(predicted, observed, counts, strict=True)
        ]
    thresholds = sorted({0.5, round(hint, 3)} if hint is not None else {0.5})
    return {
        "kalibrasyon_tablosu": tables,
        "ece_once": olcut.expected_calibration_error(y01, raw),
        "ece_sonra": olcut.expected_calibration_error(y01, calibrated),
        "karisiklik": [
            {"esik": th, "matris": _confusion(y01, calibrated, th)} for th in thresholds
        ],
    }


def evaluate_test(
    final: TabularModel,
    base: TabularModel,
    table: Table,
    y: Array,
    info: TargetInfo,
    fast: bool,
    seed: int,
    groups: Array | None,
    hint: float | None,
) -> dict[str, Any]:
    resamples = 200 if fast else 1000
    output = model_output(final, table, info)
    base_output = model_output(base, table, info)
    section: dict[str, Any] = {
        "satir": len(table),
        "olcutler": _ci_dict(bootstrap_metrics(y, output, info, resamples, seed, groups)),
        "taban": _ci_dict(bootstrap_metrics(y, base_output, info, resamples, seed, groups)),
    }
    if info.binary:
        section.update(_binary_details(final, table, y, output, info, hint))
    elif info.task == "siniflandirma":
        assert info.classes is not None
        predicted = info.classes[output.argmax(axis=1)]
        matrix = olcut.confusion_matrix(y, predicted, labels=info.classes)
        section["karisiklik"] = [{"esik": None, "matris": [[int(v) for v in r] for r in matrix]}]
    else:
        errors = np.abs(output - y.astype(np.float64))
        section["hata_dagilimi"] = {
            "ortanca": float(np.median(errors)),
            "yuzde90": float(np.quantile(errors, 0.9)),
            "en_buyuk": float(np.max(errors)),
        }
    return section
