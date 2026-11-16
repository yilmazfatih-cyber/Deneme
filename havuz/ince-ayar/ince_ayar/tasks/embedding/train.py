"""Gömme ince ayarı: karşıtsal öğrenme (MultipleNegativesRankingLoss) ile sorgu ↔ belge eşleşmesi.

Kim kullanır: `python -m ince_ayar gomme egit`.

Yöntem: yığındaki diğer belgeler "olumsuz" sayılır (yığın büyüdükçe öğrenme güçlenir); veride ya da
kazıyla elde edilen zor olumsuzlar ayrıca eklenir. `NO_DUPLICATES` örnekleyicisi aynı metnin bir
yığında iki kez bulunmasını engeller (yoksa model kendi eşini "yanlış" saymaya zorlanır).
Eğitimden önce ve sonra aynı doğrulama derleminde ölçüm yapılır; fark rapora yazılır.

Çıktı: `model/` (sentence-transformers klasörü; `havuz/yz` gibi uygulamalar doğrudan yükler),
`rapor.html`, `ozet.json`, `degerlendirme.json`.

Genişletme: başka bir kayıp (ör. MatryoshkaLoss) için `_loss` işlevini değiştirin.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ince_ayar import console
from ince_ayar.hardware import detect_hardware, limit_threads, resolve_precision
from ince_ayar.io_utils import write_json
from ince_ayar.messages import t
from ince_ayar.plan import render_plan
from ince_ayar.report.callbacks import LogCollector
from ince_ayar.report.html import summary_rows, write_report
from ince_ayar.runs import (
    EVALUATION_FILE,
    REPORT_FILE,
    Stopwatch,
    common_arguments,
    environment_info,
    quiet_trainer,
    write_run_files,
)
from ince_ayar.tasks.embedding.config import EmbeddingConfig
from ince_ayar.tasks.embedding.data import (
    extra_documents,
    prepare_pairs,
    retrieval_set,
    training_datasets,
)
from ince_ayar.tasks.embedding.evaluate import comparison_table, score, st_encoders
from ince_ayar.tasks.embedding.plan import embedding_plan
from ince_ayar.tasks.encoder_base import MODEL_DIR, resolve_encoder_base


def _loss(config: EmbeddingConfig, model: Any) -> Any:
    from sentence_transformers.sentence_transformer import losses

    if config.egitim.kayip == "onbellekli-mnrl":
        return losses.CachedMultipleNegativesRankingLoss(
            model, mini_batch_size=config.egitim.mini_yigin
        )
    return losses.MultipleNegativesRankingLoss(model)


def _mine(config: EmbeddingConfig, model: Any, dataset: Any) -> Any:
    """Taban modelle zor olumsuz kazar; sütunlar `olumsuz_1…N` olur."""
    from sentence_transformers import mine_hard_negatives

    mined = mine_hard_negatives(
        dataset,
        model,
        anchor_column_name="sorgu",
        positive_column_name="olumlu",
        num_negatives=config.egitim.zor_olumsuz_kaz,
        relative_margin=config.egitim.kaz_marj,
        sampling_strategy="top",
        output_format="n-tuple",
        verbose=False,
        query_prompt=config.model.sorgu_oneki or None,
        corpus_prompt=config.model.belge_oneki or None,
    )
    renames = {
        c: c.replace("negative_", "olumsuz_")
        for c in mined.column_names
        if c.startswith("negative_")
    }
    return mined.rename_columns(renames)


def _prompts(config: EmbeddingConfig, columns: list[str]) -> dict[str, str] | None:
    query, document = config.model.sorgu_oneki, config.model.belge_oneki
    if not query and not document:
        return None
    return {column: query if column == "sorgu" else document for column in columns}


def run_training(config: EmbeddingConfig, dry_run: bool = False) -> dict[str, Any]:
    from sentence_transformers import SentenceTransformer, SentenceTransformerTrainer
    from sentence_transformers.sentence_transformer.training_args import (
        BatchSamplers,
        SentenceTransformerTrainingArguments,
    )

    limit_threads(config.egitim.is_parcacigi)
    hardware = detect_hardware()
    precision = resolve_precision(config.model.duyarlik, hardware, trainable_base=True)
    splits = prepare_pairs(config.veri)
    out_dir = Path(config.egitim.cikti)
    texts = [
        x for p in splits.train + splits.validation for x in (p.query, p.positive, *p.negatives)
    ]
    base = resolve_encoder_base(config.model.taban, texts, out_dir, config.egitim.tohum)
    train = config.egitim
    notes = list(splits.notes) + ([precision.note] if precision.note else [])
    rows, length_table = embedding_plan(config, base, splits, hardware, precision, notes)
    console.result(render_plan(t("plan.baslik", gorev="gomme"), rows, notes))
    console.result("\n" + length_table)
    if dry_run:
        console.result("\n" + t("plan.kuru_bitti"))
        return {"kuru": True}
    model = SentenceTransformer(base, device="cuda" if hardware.device == "cuda" else "cpu")
    model.max_seq_length = config.veri.azami_uzunluk
    evaluation = retrieval_set(splits.validation, extra_documents(config.veri.ek_belgeler))
    ks = config.degerlendirme.k_degerleri
    before = score(
        *st_encoders(model, config.model.sorgu_oneki, config.model.belge_oneki), evaluation, ks
    )
    dataset = training_datasets(splits.train)
    if train.zor_olumsuz_kaz and not isinstance(dataset, dict):
        dataset = _mine(config, model, dataset.select_columns(["sorgu", "olumlu"]))
    columns = sorted(
        {
            c
            for d in (dataset.values() if isinstance(dataset, dict) else [dataset])
            for c in d.column_names
        }
    )
    out_dir.mkdir(parents=True, exist_ok=True)
    collector = LogCollector(out_dir)
    arguments = common_arguments(train, hardware, precision, out_dir, has_eval=False)
    args = SentenceTransformerTrainingArguments(
        **arguments, batch_sampler=BatchSamplers.NO_DUPLICATES, prompts=_prompts(config, columns)
    )
    trainer = SentenceTransformerTrainer(
        model=model,
        args=args,
        train_dataset=dataset,
        loss=_loss(config, model),
        callbacks=[collector],
    )
    quiet_trainer(trainer)
    watch = Stopwatch()
    result = trainer.train()
    after = score(
        *st_encoders(model, config.model.sorgu_oneki, config.model.belge_oneki), evaluation, ks
    )
    target_dir = out_dir / MODEL_DIR
    if config.model.sorgu_oneki or config.model.belge_oneki:
        model.prompts = {"query": config.model.sorgu_oneki, "document": config.model.belge_oneki}
    model.save_pretrained(str(target_dir))
    write_json(
        target_dir / EVALUATION_FILE,
        {
            "once": before,
            "sonra": after,
            "sorgu": len(evaluation.queries),
            "belge": len(evaluation.documents),
        },
    )
    table = comparison_table({"taban (önce)": before, "ince ayarlı": after}, ks)
    summary = {
        "gorev": "gomme",
        "taban": base,
        "model_klasoru": str(target_dir),
        "ornek": {"egitim": len(splits.train), "dogrulama": len(splits.validation)},
        "adim": int(trainer.state.global_step),
        "egitim_kaybi": float(result.training_loss),
        "once": before,
        "sonra": after,
        "sure_sn": watch.seconds(),
        "tohum": train.tohum,
        "uyarilar": notes,
        **environment_info(hardware, precision),
    }
    write_run_files(out_dir, config, summary)
    k = max(ks)
    report_rows = [
        *summary_rows(summary, ("taban", "adim")),
        (f"recall@{k} önce → sonra", f"{before[f'recall@{k}']:.4f} → {after[f'recall@{k}']:.4f}"),
        (f"mrr@{k} önce → sonra", f"{before[f'mrr@{k}']:.4f} → {after[f'mrr@{k}']:.4f}"),
    ]
    write_report(
        out_dir / REPORT_FILE,
        t("rapor.baslik", gorev="gomme"),
        report_rows,
        collector.rows,
        [],
        notes,
    )
    console.result(table)
    console.result(t("egitim.bitti", yol=target_dir, rapor=out_dir / REPORT_FILE))
    return summary
