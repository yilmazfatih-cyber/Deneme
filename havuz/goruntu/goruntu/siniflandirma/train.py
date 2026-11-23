"""Sınıflandırma eğitimi: veri → (plan) → eğitim → en iyi dönem → kalibrasyon/eşik → test raporu → kayıt.

Kim kullanır: `python -m goruntu egit`.

Akış:
1. `prepare.prepare_data`: klasör keşfi, güvenli açma, kopya-farkında katmanlı ayrım.
2. `--kuru` ise `plan.py` planı ve kestirimleri yazar, durur (model indirilmez).
3. Model (timm) kurulur; "bas" kipinde gövde donuk (BatchNorm dahil), "tam" kipte önce isteğe bağlı baş
   ısınması, sonra her şey ayrımlı öğrenme oranıyla eğitilir.
4. Her dönem doğrulamada makro F1 (ya da kayıp) izlenir; en iyi dönemin ağırlıkları saklanır, sabır
   dolunca erken durulur.
5. Doğrulamada sıcaklık ve "emin değilim" eşiği seçilir; rapor TEST kümesinde verilir (`report.py`).

Genişletme: dönem sonuna yeni bir ölçüt eklemek için `_validate` dönüşüne alan ekleyin; günlük satırı
(`gunluk.jsonl`) onu kendiliğinden yazar.
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import numpy as np

from goruntu import console
from goruntu.hardware import Amp, Device, detect_device, limit_threads, resolve_amp
from goruntu.hazirlik.loader import LoadLimits
from goruntu.io_utils import append_jsonl
from goruntu.messages import t
from goruntu.siniflandirma.calibration import nll
from goruntu.siniflandirma.config import ClassifierConfig
from goruntu.siniflandirma.metrics import classification_report
from goruntu.siniflandirma.prepare import PreparedData, prepare_data
from goruntu.siniflandirma.report import finish_training, split_table


def _loaders(config: ClassifierConfig, data: PreparedData, spec: Any) -> dict[str, Any]:
    import torch

    from goruntu.siniflandirma.data import build_augmentation, make_dataset, sample_weights
    from goruntu.siniflandirma.loop import make_loader

    limits = LoadLimits(config.veri.azami_piksel, config.veri.azami_bayt)
    train = config.egitim
    augmentation = build_augmentation(spec, config.artirma) if config.artirma.etkin else None
    sampler = None
    if train.dengesizlik == "dengeli-ornekleme":
        weights = sample_weights(data.train, data.labels)
        generator = torch.Generator().manual_seed(train.tohum)
        sampler = torch.utils.data.WeightedRandomSampler(
            weights, len(weights), replacement=True, generator=generator
        )
    dataset = make_dataset(data.train, data.labels, spec, limits, augmentation)
    loaders = {"egitim": make_loader(dataset, train.yigin, train.isci, True, train.tohum, sampler)}
    for name, rows in (("dogrulama", data.validation), ("test", data.test)):
        if rows:
            dataset = make_dataset(rows, data.labels, spec, limits)
            loaders[name] = make_loader(dataset, train.yigin, train.isci, False, 0)
    return loaders


def _validate(model: Any, loader: Any, device: str, labels: list[str]) -> dict[str, float]:
    from goruntu.siniflandirma.loop import collect_logits

    logits, truth = collect_logits(model, loader, device)
    report = classification_report(truth.tolist(), logits.argmax(axis=1).tolist(), labels)
    return {
        "dogrulama_kaybi": nll(logits, truth.tolist()),
        "dogruluk": report.accuracy,
        "makro_f1": report.macro_f1,
    }


def _score(row: dict[str, Any], watched: str) -> float:
    """Büyük olan iyidir: makro F1 ya da eksi doğrulama kaybı (doğrulama yoksa eksi eğitim kaybı)."""
    if watched == "makro_f1" and "makro_f1" in row:
        return float(row["makro_f1"])
    return -float(row.get("dogrulama_kaybi", row["egitim_kaybi"]))


def _fit(
    config: ClassifierConfig,
    model: Any,
    loaders: dict[str, Any],
    data: PreparedData,
    device: Device,
    amp: Amp,
    out_dir: Path,
) -> dict[str, Any]:
    import torch

    from goruntu.siniflandirma.data import class_weights
    from goruntu.siniflandirma.loop import build_optimizer, build_scheduler, train_epoch
    from goruntu.siniflandirma.model import set_backbone_frozen, set_train_mode

    train, model_cfg = config.egitim, config.model
    weights = None
    if train.dengesizlik == "agirlikli-kayip":
        weights = torch.tensor(class_weights(data.train, data.labels), device=device.kind)
    criterion = torch.nn.CrossEntropyLoss(weight=weights, label_smoothing=train.etiket_yumusatma)
    factor = model_cfg.govde_oran_carpani if model_cfg.kip == "tam" else 1.0
    optimizer = build_optimizer(model, train.ogrenme_orani, factor, train.agirlik_curumesi)
    steps = train.donem * max(1, len(loaders["egitim"]))
    scheduler = build_scheduler(optimizer, steps, train.isinma_orani)
    scaler = torch.amp.GradScaler("cuda") if amp.dtype == "float16" else None
    best: dict[str, Any] = {}
    patience, epoch = 0, 0
    for epoch in range(1, train.donem + 1):
        frozen = model_cfg.kip == "bas" or epoch <= model_cfg.bas_isinma_donemi
        set_backbone_frozen(model, frozen)
        set_train_mode(model, frozen)
        started = time.perf_counter()
        loss = train_epoch(
            model,
            loaders["egitim"],
            optimizer,
            scheduler,
            criterion,
            device.kind,
            amp.dtype,
            scaler,
        )
        row: dict[str, Any] = {"donem": epoch, "egitim_kaybi": loss}
        row["govde"] = "donuk" if frozen else "acik"
        if "dogrulama" in loaders:
            row.update(_validate(model, loaders["dogrulama"], device.kind, data.labels))
        row["sure_sn"] = round(time.perf_counter() - started, 2)
        append_jsonl(out_dir / "gunluk.jsonl", row)
        console.info(t("egitim.donem", **_epoch_values(row, train.donem)))
        score = _score(row, train.izlenen)
        if not best or score > best["skor"] + 1e-6:
            state = {key: value.detach().clone() for key, value in model.state_dict().items()}
            best = {"skor": score, "donem": epoch, "durum": state}
            patience = 0
            continue
        patience += 1
        if train.erken_durdurma and patience >= train.erken_durdurma:
            console.info(t("egitim.erken_durdu", donem=epoch, en_iyi=best["donem"]))
            break
    model.load_state_dict(best["durum"])
    return {"en_iyi_donem": best["donem"], "son_donem": epoch}


def _epoch_values(row: dict[str, Any], total: int) -> dict[str, str]:
    return {
        "donem": f"{row['donem']}/{total}",
        "kayip": f"{row['egitim_kaybi']:.4f}",
        "f1": f"{row['makro_f1']:.4f}" if "makro_f1" in row else "-",
        "dogruluk": f"{row['dogruluk']:.4f}" if "dogruluk" in row else "-",
        "govde": row["govde"],
        "sure": f"{row['sure_sn']:.1f}",
    }


def _seed(seed: int) -> None:
    import random

    import torch

    random.seed(seed)
    np.random.seed(seed % 2**32)
    torch.manual_seed(seed)


def run_training(config: ClassifierConfig, dry_run: bool = False) -> dict[str, Any]:
    """Eğitimi baştan sona yürütür; özet sözlüğünü döndürür (`--kuru`: yalnız plan)."""
    from goruntu.siniflandirma.model import build_backbone, make_classifier
    from goruntu.siniflandirma.plan import render_plan

    threads = limit_threads(config.egitim.is_parcacigi)
    _seed(config.egitim.tohum)
    device = detect_device()
    amp = resolve_amp(config.egitim.duyarlik, device)
    data = prepare_data(config)
    console.result(split_table(data))
    notes = list(data.notes) + ([amp.note] if amp.note else [])
    if dry_run:
        console.result(render_plan(config, data, device, amp, threads, notes))
        return {"kuru": True}
    out_dir = Path(config.egitim.cikti)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "gunluk.jsonl").unlink(missing_ok=True)
    started = time.perf_counter()
    m = config.model
    backbone, spec, extra = build_backbone(
        m.taban, len(data.labels), m.onceden_egitilmis, m.birakma, m.girdi_boyutu
    )
    model = make_classifier(backbone, spec).to(device.kind)
    loaders = _loaders(config, data, spec)
    fit = _fit(config, model, loaders, data, device, amp, out_dir)
    info = {"fit": fit, "spec": spec, "extra": extra, "threads": threads, "started": started}
    return finish_training(config, model, loaders, data, device, amp, notes, info)
