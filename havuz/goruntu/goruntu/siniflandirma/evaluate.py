"""Değerlendirme raporu (yalnız numpy): logitlerden ölçütler, kalibrasyon ve "emin değilim" kapsaması.

Kim kullanır: `train.py` (eğitim sonunda test kümesinde), `degerlendir` komutu (PyTorch ya da ONNX
çıktısıyla — ikisi aynı raporu üretir; böylece ONNX'in eşdeğerliği ölçüt düzeyinde de görülür).

Karar ayarı DOĞRULAMA kümesinde yapılır (sıcaklık + eşik), rapor TEST kümesinde verilir. Test yoksa
doğrulamada raporlanır ve sonucun iyimser olduğu not edilir.

Genişletme: rapora yeni bir bölüm eklemek için `evaluate_logits` sözlüğüne anahtar, `render_text`
içine birkaç satır ekleyin (başlıklar `messages.py`).
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

import numpy as np

from goruntu.console import format_table
from goruntu.messages import t
from goruntu.siniflandirma.calibration import (
    Decision,
    expected_calibration_error,
    fit_temperature,
    nll,
    softmax,
    threshold_for_accuracy,
)
from goruntu.siniflandirma.config import ThresholdSection
from goruntu.siniflandirma.metrics import (
    classification_report,
    confident_mistakes,
    confused_pairs,
)


def tune_decision(
    logits: np.ndarray, y_true: Sequence[int], labels: list[str], settings: ThresholdSection
) -> tuple[Decision, list[str]]:
    """Doğrulama logitlerinden sıcaklık ve güven eşiğini seçer; (karar kuralı, notlar)."""
    notes: list[str] = []
    has_data = len(y_true) > 0
    temperature = fit_temperature(logits, y_true) if settings.kalibrasyon and has_data else 1.0
    if not 0.06 <= temperature <= 45.0:
        notes.append(t("degerlendirme.sicaklik_sinirda", sicaklik=f"{temperature:.2f}"))
    threshold = settings.sabit_esik
    if threshold == 0.0 and settings.hedef_dogruluk > 0 and has_data:
        probabilities = softmax(logits, temperature)
        confidence = probabilities.max(axis=1).tolist()
        correct = (probabilities.argmax(axis=1) == np.asarray(y_true)).tolist()
        chosen, coverage = threshold_for_accuracy(confidence, correct, settings.hedef_dogruluk)
        if chosen is None:
            notes.append(t("degerlendirme.hedef_tutmadi", hedef=settings.hedef_dogruluk))
        else:
            threshold = chosen
            notes.append(
                t("degerlendirme.esik_secildi", esik=f"{chosen:.3f}", kapsama=f"{coverage:.1%}")
            )
    return Decision(labels, temperature, threshold), notes


def evaluate_logits(
    logits: np.ndarray,
    y_true: Sequence[int],
    names: Sequence[str],
    decision: Decision,
) -> dict[str, Any]:
    """Bütün rapor alanları (JSON'a yazılabilir sözlük)."""
    labels = decision.labels
    if len(y_true) == 0:
        return {"ornek_sayisi": 0}
    probabilities = decision.probabilities(logits)
    raw = softmax(logits)
    report = classification_report(list(y_true), probabilities.argmax(axis=1).tolist(), labels)
    decided = decision.decide(probabilities)
    covered = [i for i, value in enumerate(decided) if value is not None]
    covered_correct = sum(1 for i in covered if decided[i] == labels[int(y_true[i])])
    return {
        "ornek_sayisi": len(y_true),
        **report.to_dict(),
        "karistirilan_ciftler": confused_pairs(report),
        "en_emin_yanlislar": confident_mistakes(probabilities, list(y_true), list(names), labels),
        "kalibrasyon": {
            "sicaklik": decision.temperature,
            "ece_once": expected_calibration_error(raw, y_true),
            "ece_sonra": expected_calibration_error(probabilities, y_true),
            "nll_once": nll(logits, y_true),
            "nll_sonra": nll(logits, y_true, decision.temperature),
        },
        "emin_degilim": {
            "esik": decision.threshold,
            "kapsama": len(covered) / len(y_true),
            "kapsanan_dogruluk": covered_correct / len(covered) if covered else 0.0,
        },
    }


def render_text(result: dict[str, Any]) -> str:
    """Raporu insan okur düz metne çevirir (tablo + karışıklık matrisi + çiftler)."""
    if not result.get("ornek_sayisi"):
        return t("degerlendirme.bos")
    labels: list[str] = result["etiketler"]
    lines = [
        t(
            "degerlendirme.ozet",
            sayi=result["ornek_sayisi"],
            dogruluk=f"{result['dogruluk']:.4f}",
            f1=f"{result['makro_f1']:.4f}",
        )
    ]
    rows = [
        [label, s["kesinlik"], s["duyarlilik"], s["f1"], s["ornek"]]
        for label, s in result["sinif"].items()
    ]
    lines += ["", format_table(t("degerlendirme.tablo_basliklari").split("|"), rows)]
    matrix = [[label, *result["karisiklik_matrisi"][i]] for i, label in enumerate(labels)]
    lines += [
        "",
        t("degerlendirme.matris"),
        format_table([t("degerlendirme.gercek"), *labels], matrix),
    ]
    pairs = result["karistirilan_ciftler"]
    if pairs:
        lines += ["", t("degerlendirme.ciftler")]
        lines += [
            f"  {p['gercek']} → {p['tahmin']}: {p['sayi']} ({p['oran']:.0%})" for p in pairs[:5]
        ]
    calibration = result["kalibrasyon"]
    lines += [
        "",
        t(
            "degerlendirme.kalibrasyon",
            sicaklik=f"{calibration['sicaklik']:.3f}",
            once=f"{calibration['ece_once']:.4f}",
            sonra=f"{calibration['ece_sonra']:.4f}",
        ),
    ]
    unsure = result["emin_degilim"]
    if unsure["esik"] > 0:
        lines.append(
            t(
                "degerlendirme.kapsama",
                esik=f"{unsure['esik']:.3f}",
                kapsama=f"{unsure['kapsama']:.1%}",
                dogruluk=f"{unsure['kapsanan_dogruluk']:.4f}",
            )
        )
    return "\n".join(lines)
