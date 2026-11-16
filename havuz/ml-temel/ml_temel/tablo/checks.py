"""Denetimler: veri özeti ve sızıntı/veri sorunu uyarıları (rapora "Uyarılar" olarak girer).

Uyarı kuralları:
  - modele alınmayan sütunlar (kimlik, sabit) ve hedefi boş satırlar
  - dengesiz sınıflar (en küçük sınıf < %10)
  - küçük sınama kümesi (< 200 satır): geniş güven aralıkları
  - şüpheli yüksek başarı (ROC-AUC ya da R² ≥ 0.995): olası hedef sızıntısı
  - tek bir sütunun önemin büyük kısmını taşıması: olası sızıntı
  - sınama satırlarının eğitimde birebir kopyası (> %1)
  - modelin taban çizgisini geçememesi
Genişletme: yeni bir kural = `collect_warnings` içine bir `if` + messages.py'de metin.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from ml_temel.ortak.table import Table
from ml_temel.ortak.types import Array, IntArray
from ml_temel.tablo.evaluation import TargetInfo, higher_is_better
from ml_temel.tablo.messages import t
from ml_temel.tablo.report import num
from ml_temel.tablo.schema import ColumnInfo, label_text


def data_summary(
    table: Table, y: Array, info: TargetInfo, config: Any, dropped_target: int
) -> dict[str, Any]:
    """Raporun "Veri" bölümü için özet."""
    summary: dict[str, Any] = {
        "dosya": config.source_name,
        "bicim": config.csv_format,
        "satir": len(table),
        "sutun": len(table.names),
        "hedef": config.target,
        "gorev": info.task,
        "zaman": config.time_column,
        "grup": config.group_column,
        "atilan_hedefsiz": dropped_target,
    }
    if info.classes is not None:
        values, counts = np.unique(y, return_counts=True)
        summary["siniflar"] = {label_text(v): int(c) for v, c in zip(values, counts, strict=True)}
        summary["pozitif"] = None if info.positive is None else label_text(info.positive)
    else:
        target = y.astype(np.float64)
        summary["hedef_ozet"] = {
            "ortalama": float(target.mean()),
            "std": float(target.std()),
            "en_kucuk": float(np.min(target)),
            "en_buyuk": float(np.max(target)),
        }
    return summary


def duplicate_share(
    table: Table, y: Array, train_rows: IntArray, test_rows: IntArray, columns: list[str]
) -> float:
    """Sınama satırlarının eğitimde birebir (bütün girdi sütunları + hedef) bulunan oranı."""
    if not columns or test_rows.size == 0:
        return 0.0
    cells = [table[name] for name in columns] + [y]

    def key(row: int) -> tuple[str, ...]:
        return tuple(repr(column[row]) for column in cells)

    seen = {key(int(row)) for row in train_rows}
    return float(np.mean([key(int(row)) in seen for row in test_rows]))


def collect_warnings(
    results: dict[str, Any],
    infos: list[ColumnInfo],
    info: TargetInfo,
    duplicates: float,
    config: Any,
) -> list[str]:
    """Rapordaki uyarılar (Türkçe, ne yapılacağını söyleyen)."""
    warnings: list[str] = []
    dropped = [f"{i.name} ({i.kind})" for i in infos if i.kind in ("kimlik", "sabit")]
    if dropped:
        warnings.append(t("uyari_atilan", sutunlar=", ".join(dropped)))
    if results["veri"]["atilan_hedefsiz"]:
        warnings.append(t("uyari_eksik_hedef", satir=results["veri"]["atilan_hedefsiz"]))
    if config.time_column and config.group_column:
        warnings.append(t("uyari_zaman_grup"))
    classes = results["veri"].get("siniflar")
    if classes:
        smallest = min(classes, key=classes.__getitem__)
        share = 100.0 * classes[smallest] / sum(classes.values())
        if share < 10.0:
            warnings.append(t("uyari_dengesiz", sinif=smallest, oran=num(share, 1)))
    test = results["sinama"]
    if test["satir"] < 200:
        warnings.append(t("uyari_kucuk", satir=test["satir"]))
    for metric in ("roc_auc", "r2"):
        value = test["olcutler"].get(metric, {}).get("deger")
        if value is not None and value >= 0.995:
            warnings.append(t("uyari_sizinti_skor", olcut=t(f"olcut_{metric}"), deger=num(value)))
    importance = [item for item in results["onem"] if float(item["ort"]) > 0]
    total = sum(float(item["ort"]) for item in importance)
    if importance and total > 0:
        top = importance[0]
        if float(top["ort"]) >= 0.6 * total and float(top["ort"]) >= 0.05:
            warnings.append(t("uyari_sizinti_onem", sutun=top["sutun"]))
    if duplicates > 0.01:
        warnings.append(t("uyari_kopya", oran=num(100.0 * duplicates, 1)))
    warnings.extend(_baseline_warning(results))
    return warnings


def _baseline_warning(results: dict[str, Any]) -> list[str]:
    metric = results["ana_olcut"]
    by_model = {row["model"]: row["olcutler"][metric] for row in results["cv"]}
    best, base = by_model.get(results["en_iyi"]), by_model.get("taban")
    if best is None or base is None:
        return []
    sign = 1.0 if higher_is_better(metric) else -1.0
    margin = sign * (best["ort"] - base["ort"])
    return [t("uyari_taban")] if margin <= max(best["std"], 1e-9) else []
