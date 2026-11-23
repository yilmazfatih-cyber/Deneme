"""Eğitimin son adımı ve çıktı dosyaları: kalibrasyon, test raporu, model kaydı, özet.

Kim kullanır: `train.py` (eğitim bitince `finish_training`), `train.py` ve `plan.py` (`split_table`).

Çıktı klasörü (`[egitim] cikti`):
- `model/agirliklar.safetensors` + `model/model.json` — `tahmin`, `disa-aktar`, `degerlendir` bunu okur.
- `degerlendirme.json` (makine için) ve `rapor.txt` (insan için) — test kümesi sonuçları.
- `gunluk.jsonl` — dönem başına kayıp/ölçüt; `ayrim.json` — hangi dosya hangi parçada;
  `yapilandirma.toml` — çözülmüş ayar; `ozet.json` — sürümler, tohum, süre, uyarılar.

Genişletme: yeni bir çıktı dosyası için `finish_training` içinde yazın ve yukarıdaki listeye ekleyin.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np

from goruntu import console
from goruntu.config import dump_config
from goruntu.console import format_table
from goruntu.hardware import Amp, Device
from goruntu.io_utils import write_json
from goruntu.messages import t
from goruntu.siniflandirma.config import ClassifierConfig
from goruntu.siniflandirma.evaluate import evaluate_logits, render_text, tune_decision
from goruntu.siniflandirma.prepare import PreparedData


def split_table(data: PreparedData) -> str:
    """Sınıf × parça örnek sayıları tablosu ve ayrım notu."""
    counts = data.counts()
    names = [name for name in ("egitim", "dogrulama", "test") if name in counts]
    rows = [[label, *(counts[name].get(label, 0) for name in names)] for label in data.labels]
    rows.append([t("ayrim.toplam"), *(sum(counts[name].values()) for name in names)])
    table = format_table([t("ayrim.sinif"), *names], rows)
    duplicates = data.report.get("kopya_cifti", 0)
    return f"{t('ayrim.baslik')}\n{table}\n{t('ayrim.kopya_ozeti', sayi=duplicates)}"


def _versions() -> dict[str, str]:
    import timm
    import torch
    import torchvision

    return {
        "torch": torch.__version__,
        "torchvision": torchvision.__version__,
        "timm": timm.__version__,
    }


def finish_training(
    config: ClassifierConfig,
    model: Any,
    loaders: dict[str, Any],
    data: PreparedData,
    device: Device,
    amp: Amp,
    notes: list[str],
    info: dict[str, Any],
) -> dict[str, Any]:
    """Kalibrasyon + eşik (doğrulama), rapor (test), kayıt; özet sözlüğünü döndürür."""
    from goruntu.siniflandirma.loop import collect_logits
    from goruntu.siniflandirma.model import MODEL_DIR, save_checkpoint, timm_name

    labels = data.labels
    if "dogrulama" in loaders:
        val_logits, val_y = collect_logits(model, loaders["dogrulama"], device.kind)
    else:
        val_logits, val_y = np.zeros((0, len(labels))), np.zeros(0, dtype=np.int64)
    decision, decision_notes = tune_decision(val_logits, val_y.tolist(), labels, config.esik)
    notes = notes + decision_notes
    held = "test" if "test" in loaders else "dogrulama"
    if held == "dogrulama":
        notes.append(t("degerlendirme.test_yok"))
    rows = data.test if held == "test" else data.validation
    logits, truth = (
        collect_logits(model, loaders[held], device.kind)
        if held in loaders
        else (val_logits, val_y)
    )
    result = evaluate_logits(logits, truth.tolist(), [str(s.path) for s in rows], decision)
    out_dir = Path(config.egitim.cikti)
    meta = {
        "taban": config.model.taban,
        "mimari": timm_name(config.model.taban),
        "olusturma": info["extra"],
        "etiketler": labels,
        "on_isleme": info["spec"].model_dump(mode="json"),
        "sicaklik": decision.temperature,
        "esik": decision.threshold,
        "birakma": config.model.birakma,
        "kip": config.model.kip,
        "egitim_tarihi": datetime.now(UTC).isoformat(timespec="seconds"),
    }
    save_checkpoint(model.cpu(), out_dir / MODEL_DIR, meta)
    write_json(out_dir / "degerlendirme.json", {"kume": held, **result})
    write_json(out_dir / "ayrim.json", data.report)
    (out_dir / "yapilandirma.toml").write_text(dump_config(config), encoding="utf-8")
    text = render_text(result)
    (out_dir / "rapor.txt").write_text(text + "\n", encoding="utf-8")
    summary = {
        "taban": config.model.taban,
        "etiketler": labels,
        "ornek": {name: len(rows) for name, rows in data.splits.items()},
        "degerlendirme_kumesi": held,
        "dogruluk": result.get("dogruluk"),
        "makro_f1": result.get("makro_f1"),
        **info["fit"],
        "sure_sn": round(time.perf_counter() - info["started"], 1),
        "aygit": f"{device.name} · {amp.label}",
        "is_parcacigi": info["threads"],
        "tohum": config.egitim.tohum,
        "surumler": _versions(),
        "uyarilar": notes,
    }
    write_json(out_dir / "ozet.json", summary)
    console.result("\n" + text)
    for note in notes:
        console.warn(note)
    console.result("\n" + t("egitim.bitti", yol=out_dir))
    return summary
