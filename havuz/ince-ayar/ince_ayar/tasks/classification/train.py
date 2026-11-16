"""Sınıflandırma eğitimi: kodlayıcı modelin tamamı ince ayarlanır (küçük modellerde LoRA'ya gerek yok).

Kim kullanır: `python -m ince_ayar siniflandirma egit`.

Akış: veri ayrımı → plan (+ kuru çalıştırmada dur) → eğitim (en iyi makro F1'li denetim seçilir,
istenirse erken durdurma) → doğrulamada eşik ayarı → test raporu → kayıt.
Çıktı: `model/` (model + tokenizer + `esik.json`), `rapor.html`, `ozet.json`, `degerlendirme.json`.

Genişletme: yeni dengesizlik yöntemi için `config.py` içindeki seçeneğe ad ekleyip
`_training_rows` / `_weights` içinde uygulayın.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ince_ayar import console
from ince_ayar.data.stats import length_stats, render_stats
from ince_ayar.hardware import detect_hardware, limit_threads, resolve_precision
from ince_ayar.io_utils import write_json
from ince_ayar.messages import t
from ince_ayar.metrics.classification import classification_report
from ince_ayar.plan import encoder_memory_rows, render_plan, training_steps
from ince_ayar.report.callbacks import LogCollector
from ince_ayar.report.html import summary_rows, write_report
from ince_ayar.runs import (
    EVALUATION_FILE,
    REPORT_FILE,
    Stopwatch,
    common_arguments,
    environment_info,
    last_checkpoint,
    quiet_trainer,
    write_run_files,
)
from ince_ayar.tasks.classification.config import ClassificationConfig
from ince_ayar.tasks.classification.data import (
    Splits,
    class_weights,
    oversample,
    prepare_splits,
    to_dataset,
    token_lengths,
)
from ince_ayar.tasks.encoder_base import (
    MODEL_DIR,
    hub_kwargs,
    load_encoder_tokenizer,
    resolve_encoder_base,
)


def _metrics(eval_prediction: Any) -> dict[str, float]:
    predictions = eval_prediction.predictions
    logits = predictions[0] if isinstance(predictions, tuple) else predictions
    predicted = logits.argmax(axis=-1).tolist()
    truth = eval_prediction.label_ids.tolist()
    labels = [str(i) for i in range(logits.shape[-1])]
    report = classification_report(truth, predicted, labels)
    return {"dogruluk": report.accuracy, "makro_f1": report.macro_f1}


def _plan(
    config: ClassificationConfig,
    base: str,
    splits: Splits,
    lengths: list[int],
    hardware: Any,
    precision: Any,
    notes: list[str],
) -> list[tuple[str, str]]:
    train = config.egitim
    steps = training_steps(
        len(splits.train), train.yigin, train.biriktirme, train.donem, train.azami_adim
    )
    rows = [
        (t("plan.satir.gorev"), "siniflandirma"),
        (t("plan.satir.taban"), base),
        (t("plan.satir.aygit"), f"{hardware.name} · {precision.label}"),
        (
            t("plan.satir.ornek"),
            t(
                "plan.ornek_uclu",
                egitim=len(splits.train),
                dogrulama=len(splits.validation),
                test=len(splits.test),
            ),
        ),
        (t("plan.satir.etiketler"), ", ".join(splits.labels)),
        (t("plan.satir.dengesizlik"), train.dengesizlik),
        (
            t("plan.satir.adim"),
            t(
                "plan.adim_ayrinti",
                adim=steps,
                yigin=train.yigin * train.biriktirme,
                oran=train.ogrenme_orani,
            ),
        ),
        (t("plan.satir.cikti"), train.cikti),
    ]
    length = min(max(lengths, default=8), config.veri.azami_uzunluk)
    return rows + encoder_memory_rows(
        base,
        hardware,
        precision,
        config.model.duyarlik,
        train.hedef_bellek_gb,
        train.yigin,
        length,
        notes,
    )


def _training_rows(config: ClassificationConfig, splits: Splits) -> list[Any]:
    if config.egitim.dengesizlik == "asiri-ornekleme":
        return oversample(splits.train, config.egitim.tohum)
    return splits.train


def run_training(
    config: ClassificationConfig, dry_run: bool = False, resume: bool = False
) -> dict[str, Any]:
    from transformers import DataCollatorWithPadding, EarlyStoppingCallback, TrainingArguments

    from ince_ayar.tasks.classification.evaluate import report_on, tune_thresholds
    from ince_ayar.tasks.classification.modeling import (
        WeightedTrainer,
        load_classifier,
        predict_proba,
    )

    limit_threads(config.egitim.is_parcacigi)
    hardware = detect_hardware()
    precision = resolve_precision(config.model.duyarlik, hardware, trainable_base=True)
    splits = prepare_splits(config.veri)
    out_dir = Path(config.egitim.cikti)
    texts = [row.text for row in splits.train + splits.validation + splits.test]
    base = resolve_encoder_base(config.model.taban, texts, out_dir, config.egitim.tohum)
    tokenizer = load_encoder_tokenizer(base, config.model)
    lengths = token_lengths(tokenizer, splits.train)
    notes = list(splits.notes) + ([precision.note] if precision.note else [])
    console.result(
        render_plan(
            t("plan.baslik", gorev="siniflandirma"),
            _plan(config, base, splits, lengths, hardware, precision, notes),
            notes,
        )
    )
    console.result(
        "\n"
        + render_stats(
            length_stats(lengths, config.veri.azami_uzunluk), t("istatistik.baslik", ad="eğitim")
        )
    )
    if dry_run:
        console.result("\n" + t("plan.kuru_bitti"))
        return {"kuru": True}
    labels, max_length = splits.labels, config.veri.azami_uzunluk
    model = load_classifier(base, labels, hub_kwargs(config.model))
    out_dir.mkdir(parents=True, exist_ok=True)
    collector = LogCollector(out_dir)
    callbacks: list[Any] = [collector]
    has_eval = bool(splits.validation)
    if config.egitim.erken_durdurma and has_eval:
        callbacks.append(
            EarlyStoppingCallback(early_stopping_patience=config.egitim.erken_durdurma)
        )
    arguments = common_arguments(
        config.egitim,
        hardware,
        precision,
        out_dir,
        has_eval,
        best_metric="eval_makro_f1",
        greater_is_better=True,
    )
    weights = (
        class_weights(splits.train, labels)
        if config.egitim.dengesizlik == "agirlikli-kayip"
        else None
    )
    trainer = WeightedTrainer(
        model=model,
        args=TrainingArguments(**arguments),
        train_dataset=to_dataset(tokenizer, _training_rows(config, splits), labels, max_length),
        eval_dataset=to_dataset(tokenizer, splits.validation, labels, max_length)
        if has_eval
        else None,
        processing_class=tokenizer,
        data_collator=DataCollatorWithPadding(tokenizer),
        compute_metrics=_metrics,
        callbacks=callbacks,
        class_weights=weights,
    )
    quiet_trainer(trainer)
    watch = Stopwatch()
    result = trainer.train(resume_from_checkpoint=last_checkpoint(out_dir) if resume else None)
    fitted: Any = trainer.model
    model = fitted.eval()
    val_probs = predict_proba(model, tokenizer, [r.text for r in splits.validation], max_length)
    thresholds = tune_thresholds(val_probs, splits.validation, labels, splits.train, config.esik)
    held_out, held_name = (splits.test, "test") if splits.test else (splits.validation, "dogrulama")
    if not splits.test:
        notes.append(t("siniflandirma.test_yok"))
    evaluation = (
        report_on(
            held_out,
            predict_proba(model, tokenizer, [r.text for r in held_out], max_length),
            thresholds,
        )
        if held_out
        else {}
    )
    target = out_dir / MODEL_DIR
    trainer.save_model(str(target))
    tokenizer.save_pretrained(str(target))
    thresholds.save(target)
    table = evaluation.pop("tablo", "")
    write_json(target / EVALUATION_FILE, {"veri": held_name, **evaluation})
    summary = {
        "gorev": "siniflandirma",
        "taban": base,
        "model_klasoru": str(target),
        "etiketler": labels,
        "ornek": {
            "egitim": len(splits.train),
            "dogrulama": len(splits.validation),
            "test": len(splits.test),
        },
        "adim": int(trainer.state.global_step),
        "egitim_kaybi": float(result.training_loss),
        "degerlendirme_kumesi": held_name,
        "dogruluk": evaluation.get("dogruluk"),
        "makro_f1": evaluation.get("makro_f1"),
        "ikili_esik": thresholds.binary_threshold,
        "sure_sn": watch.seconds(),
        "tohum": config.egitim.tohum,
        "uyarilar": notes,
        **environment_info(hardware, precision),
    }
    write_run_files(out_dir, config, summary)
    keys = (
        "taban",
        "adim",
        "egitim_kaybi",
        "degerlendirme_kumesi",
        "dogruluk",
        "makro_f1",
        "sure_sn",
    )
    write_report(
        out_dir / REPORT_FILE,
        t("rapor.baslik", gorev="siniflandirma"),
        summary_rows(summary, keys),
        collector.rows,
        [],
        notes,
    )
    console.result(table)
    console.result(t("egitim.bitti", yol=target, rapor=out_dir / REPORT_FILE))
    return summary
