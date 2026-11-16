"""Sınıflandırıcıyla tahmin: tek tek metin ya da CSV/JSONL dosyası; PyTorch ya da ONNX ile.

Kim kullanır: `python -m ince_ayar siniflandirma tahmin`.
Çıktı satırı: metin, karar (eşik kuralıyla; "belirsiz" olabilir), her sınıfın olasılığı.

Genişletme: toplu tahmini hızlandırmak için `batch` değerini büyütün (bellek izin verdikçe).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ince_ayar import console
from ince_ayar.errors import UserError
from ince_ayar.io_utils import read_rows, write_jsonl
from ince_ayar.messages import t
from ince_ayar.tasks.classification.evaluate import probabilities_for

UNSURE = "belirsiz"


def predict_texts(
    model_path: str,
    texts: list[str],
    input_path: str | None,
    output_path: str | None,
    use_onnx: bool,
    max_length: int,
) -> list[dict[str, Any]]:
    """Metinleri sınıflandırır; sonuçları yazar ve döndürür."""
    collected = list(texts)
    if input_path:
        for raw in read_rows(Path(input_path)):
            if raw.data is None or not str(raw.data.get("metin", "")).strip():
                console.warn(t("tahmin.satir_atlandi", satir=raw.line))
                continue
            collected.append(str(raw.data["metin"]))
    if not collected:
        raise UserError(t("tahmin.girdi_yok"))
    probabilities, thresholds = probabilities_for(Path(model_path), collected, max_length, use_onnx)
    decisions = thresholds.decide(probabilities)
    rows: list[dict[str, Any]] = [
        {
            "metin": text,
            "karar": decision or UNSURE,
            "olasiliklar": {
                label: round(float(p), 4) for label, p in zip(thresholds.labels, row, strict=True)
            },
        }
        for text, decision, row in zip(collected, decisions, probabilities, strict=True)
    ]
    if output_path:
        write_jsonl(Path(output_path), rows)
        console.info(t("tahmin.yazildi", yol=output_path, sayi=len(rows)))
    else:
        for row in rows:
            best = max(row["olasiliklar"].values())
            console.result(f"{row['karar']}\t{best:.3f}\t{row['metin']}")
    return rows
