"""Varlık tanıma eğitimi: kodlayıcının tamamı belirteç sınıflandırmaya ince ayarlanır.

Kim kullanır: `python -m ince_ayar varlik egit`.

En iyi denetim doğrulamadaki **varlık F1**'e göre seçilir (belirteç doğruluğu, "O" etiketinin
çokluğu yüzünden yanıltıcı yüksek çıkar). Çıktı: `model/`, `rapor.html`, `ozet.json`,
`degerlendirme.json`.

Genişletme: dengesiz türler için sınıflandırmadaki `WeightedTrainer` yaklaşımını buraya taşıyın.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

from ince_ayar import console
from ince_ayar.data.stats import length_stats, render_stats
from ince_ayar.hardware import detect_hardware, limit_threads, resolve_precision
from ince_ayar.io_utils import write_json
from ince_ayar.messages import t
from ince_ayar.metrics.ner import entity_scores, token_accuracy
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
from ince_ayar.tasks.encoder_base import (
    MODEL_DIR,
    hub_kwargs,
    load_encoder_tokenizer,
    resolve_encoder_base,
)
from ince_ayar.tasks.ner.config import NerConfig
from ince_ayar.tasks.ner.data import IGNORE, prepare_tagged, to_dataset


def tag_sequences(
    logits: np.ndarray, label_ids: np.ndarray, labels: list[str]
) -> tuple[list[list[str]], list[list[str]]]:
    """Kayba giren konumlardaki (sözcük başları) gerçek ve tahmin etiket dizileri."""
    predicted = logits.argmax(axis=-1)
    gold, guess = [], []
    for truth_row, guess_row in zip(label_ids, predicted, strict=True):
        keep = truth_row != IGNORE
        gold.append([labels[i] for i in truth_row[keep]])
        guess.append([labels[i] for i in guess_row[keep]])
    return gold, guess


def _metrics_for(labels: list[str]) -> Any:
    def compute(eval_prediction: Any) -> dict[str, float]:
        predictions = eval_prediction.predictions
        logits = predictions[0] if isinstance(predictions, tuple) else predictions
        gold, guess = tag_sequences(logits, eval_prediction.label_ids, labels)
        scores = entity_scores(gold, guess)
        return {"varlik_f1": float(scores["f1"]), "belirtec_dogrulugu": token_accuracy(gold, guess)}  # type: ignore[arg-type]

    return compute


def run_training(config: NerConfig, dry_run: bool = False, resume: bool = False) -> dict[str, Any]:
    from transformers import (
        AutoModelForTokenClassification,
        DataCollatorForTokenClassification,
        Trainer,
        TrainingArguments,
    )

    limit_threads(config.egitim.is_parcacigi)
    hardware = detect_hardware()
    precision = resolve_precision(config.model.duyarlik, hardware, trainable_base=True)
    splits = prepare_tagged(config.veri)
    out_dir = Path(config.egitim.cikti)
    words = [" ".join(row.words) for row in splits.train + splits.validation]
    base = resolve_encoder_base(config.model.taban, words, out_dir, config.egitim.tohum)
    train = config.egitim
    steps = training_steps(
        len(splits.train), train.yigin, train.biriktirme, train.donem, train.azami_adim
    )
    notes = list(splits.notes) + ([precision.note] if precision.note else [])
    rows = [
        (t("plan.satir.gorev"), "varlik"),
        (t("plan.satir.taban"), base),
        (t("plan.satir.aygit"), f"{hardware.name} · {precision.label}"),
        (t("plan.satir.etiketler"), ", ".join(splits.labels)),
        (
            t("plan.satir.ornek"),
            t(
                "plan.ornek_sayilari",
                egitim=len(splits.train),
                dogrulama=len(splits.validation),
                atilan=0,
            ),
        ),
        (
            t("plan.satir.adim"),
            t(
                "plan.adim_ayrinti",
                adim=steps,
                yigin=train.yigin * train.biriktirme,
                oran=train.ogrenme_orani,
            ),
        ),
    ]
    tokenizer = load_encoder_tokenizer(base, config.model)
    encoded = tokenizer([row.words for row in splits.train], is_split_into_words=True)
    stats = length_stats([len(ids) for ids in encoded["input_ids"]], config.veri.azami_uzunluk)
    length = min(stats.maximum, config.veri.azami_uzunluk)
    rows += encoder_memory_rows(
        base,
        hardware,
        precision,
        config.model.duyarlik,
        train.hedef_bellek_gb,
        train.yigin,
        length,
        notes,
    )
    console.result(render_plan(t("plan.baslik", gorev="varlik"), rows, notes))
    console.result("\n" + render_stats(stats, t("istatistik.baslik", ad="eğitim")))
    if dry_run:
        console.result("\n" + t("plan.kuru_bitti"))
        return {"kuru": True}
    labels = splits.labels
    model = AutoModelForTokenClassification.from_pretrained(
        base,
        num_labels=len(labels),
        id2label=dict(enumerate(labels)),
        label2id={label: i for i, label in enumerate(labels)},
        **hub_kwargs(config.model),
    )
    out_dir.mkdir(parents=True, exist_ok=True)
    collector = LogCollector(out_dir)
    has_eval = bool(splits.validation)
    arguments = common_arguments(
        train,
        hardware,
        precision,
        out_dir,
        has_eval,
        best_metric="eval_varlik_f1",
        greater_is_better=True,
    )
    max_length = config.veri.azami_uzunluk
    trainer = Trainer(
        model=model,
        args=TrainingArguments(**arguments),
        train_dataset=to_dataset(tokenizer, splits.train, labels, max_length),
        eval_dataset=to_dataset(tokenizer, splits.validation, labels, max_length)
        if has_eval
        else None,
        processing_class=tokenizer,
        data_collator=DataCollatorForTokenClassification(tokenizer),
        compute_metrics=_metrics_for(labels),
        callbacks=[collector],
    )
    quiet_trainer(trainer)
    watch = Stopwatch()
    result = trainer.train(resume_from_checkpoint=last_checkpoint(out_dir) if resume else None)
    final = trainer.evaluate() if has_eval else {}
    target = out_dir / MODEL_DIR
    trainer.save_model(str(target))
    tokenizer.save_pretrained(str(target))
    evaluation = {
        "varlik_f1": final.get("eval_varlik_f1"),
        "belirtec_dogrulugu": final.get("eval_belirtec_dogrulugu"),
    }
    write_json(target / EVALUATION_FILE, {"veri": "dogrulama", **evaluation})
    summary = {
        "gorev": "varlik",
        "taban": base,
        "model_klasoru": str(target),
        "etiketler": labels,
        "adim": int(trainer.state.global_step),
        "egitim_kaybi": float(result.training_loss),
        **evaluation,
        "sure_sn": watch.seconds(),
        "tohum": train.tohum,
        "uyarilar": notes,
        **environment_info(hardware, precision),
    }
    write_run_files(out_dir, config, summary)
    keys = ("taban", "adim", "egitim_kaybi", "varlik_f1", "sure_sn")
    write_report(
        out_dir / REPORT_FILE,
        t("rapor.baslik", gorev="varlik"),
        summary_rows(summary, keys),
        collector.rows,
        [],
        notes,
    )
    console.result(t("egitim.bitti", yol=target, rapor=out_dir / REPORT_FILE))
    return summary
