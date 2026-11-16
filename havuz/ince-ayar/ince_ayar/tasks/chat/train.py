"""Sohbet görevi eğitimi: veriyi hazırlar, planı yazar, LoRA (ya da tam) ince ayarı TRL ile koşturur.

Kim kullanır: `python -m ince_ayar sohbet egit` (`tasks/chat/cli.py`).

Neden TRL `SFTTrainer`: büyük sözlüklü modellerde (Qwen, Gemma) çıkış katmanının logitlerini parça
parça hesaplar ("fused LM head"), T4'te belleği belirgin azaltır. Veri ona **önceden belirteçlenmiş**
(`input_ids` + `labels`) verilir; kayıp maskesini biz kurarız (`masking.py`), TRL olduğu gibi kullanır.

Çıktı klasörü: `bagdastirici/` (LoRA) ya da `model/` (tam ince ayar), `rapor.html`, `ozet.json`,
`ayar.toml`, `egitim_gunlugu.jsonl`, `ornek_uretimler.jsonl`, `denetim/` (ara kayıtlar).

Genişletme: eğitime yeni bir geri çağrı eklemek için `_callbacks` listesine ekleyin.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ince_ayar import console
from ince_ayar.hardware import detect_hardware, limit_threads, resolve_precision
from ince_ayar.messages import t
from ince_ayar.plan import render_plan
from ince_ayar.report.callbacks import LogCollector, SampleCallback
from ince_ayar.report.html import summary_rows, write_report
from ince_ayar.runs import (
    REPORT_FILE,
    Stopwatch,
    common_arguments,
    environment_info,
    last_checkpoint,
    quiet_trainer,
    write_run_files,
)
from ince_ayar.tasks.chat.config import ChatConfig
from ince_ayar.tasks.chat.data import EncodedSet, encode_examples, load_examples, to_rows
from ince_ayar.tasks.chat.modeling import (
    ADAPTER_DIR,
    FULL_MODEL_DIR,
    generate_reply,
    load_base_model,
    load_tokenizer,
    lora_config,
    resolve_base,
)
from ince_ayar.tasks.chat.plan import length_report, plan_rows


def _sample_producer(tokenizer: Any, examples: EncodedSet | None, count: int, max_new: int) -> Any:
    """Değerlendirme anlarında birkaç doğrulama örneğine yanıt ürettiren işlev."""
    chosen = examples.examples[:count] if examples else []
    stop_ids = examples.stop_ids if examples else []

    def produce(model: Any) -> list[dict[str, Any]]:
        rows = []
        for example in chosen:
            reply = generate_reply(model, tokenizer, example.messages, max_new, stop_ids)
            user = next(
                m["content"] for m in reversed(example.messages[:-1]) if m["role"] == "user"
            )
            rows.append({"girdi": user, "beklenen": example.reference, "uretilen": reply})
        return rows

    return produce


def _build_trainer(
    config: ChatConfig,
    model: Any,
    tokenizer: Any,
    train_set: EncodedSet,
    eval_set: EncodedSet | None,
    arguments: dict[str, Any],
    callbacks: list[Any],
) -> Any:
    from datasets import Dataset
    from trl import SFTConfig, SFTTrainer

    sft_args = SFTConfig(
        **arguments,
        max_length=config.veri.azami_uzunluk,
        packing=False,
        activation_checkpointing=config.egitim.gradyan_denetimi,
    )
    eval_dataset = Dataset.from_list(to_rows(eval_set.encoded)) if eval_set else None
    trainer = SFTTrainer(
        model=model,
        args=sft_args,
        train_dataset=Dataset.from_list(to_rows(train_set.encoded)),
        eval_dataset=eval_dataset,
        processing_class=tokenizer,
        peft_config=lora_config(config.lora) if config.lora.etkin else None,
        callbacks=callbacks,
    )
    quiet_trainer(trainer)
    return trainer


def _prepare_quantized(model: Any, checkpointing: bool) -> Any:
    """4-bit modeli eğitime hazırlar (yalnız GPU yolu; bu makinede denenmedi)."""
    from peft import prepare_model_for_kbit_training

    return prepare_model_for_kbit_training(model, use_gradient_checkpointing=checkpointing)


def run_training(config: ChatConfig, dry_run: bool = False, resume: bool = False) -> dict[str, Any]:
    """Eğitimi uçtan uca yürütür; kuru çalıştırmada planı yazıp durur. Özet sözlüğü döndürür."""
    threads = limit_threads(config.egitim.is_parcacigi)
    hardware = detect_hardware()
    precision = resolve_precision(config.model.duyarlik, hardware, not config.lora.etkin)
    data = load_examples(config.veri)
    out_dir = Path(config.egitim.cikti)
    texts = [m["content"] for ex in data.train + data.validation for m in ex.messages]
    base = resolve_base(config.model.taban, texts, out_dir, config.egitim.tohum)
    tokenizer = load_tokenizer(base, config.model)
    train_set = encode_examples(tokenizer, data.train, config.veri, "eğitim")
    eval_set = (
        encode_examples(tokenizer, data.validation, config.veri, "doğrulama")
        if data.validation
        else None
    )
    notes = [*data.notes, *train_set.notes, *(eval_set.notes if eval_set else [])]
    if precision.note:
        notes.append(precision.note)
    rows = plan_rows(config, base, hardware, precision, train_set, eval_set, notes)
    console.result(render_plan(t("plan.baslik", gorev="sohbet"), rows, notes))
    console.result("\n" + length_report(train_set, eval_set))
    if dry_run:
        console.result("\n" + t("plan.kuru_bitti"))
        return {"kuru": True, "plan": dict(rows)}

    model = load_base_model(base, config.model, hardware, precision)
    if config.model.dort_bit:
        model = _prepare_quantized(model, config.egitim.gradyan_denetimi)
    out_dir.mkdir(parents=True, exist_ok=True)
    collector = LogCollector(out_dir)
    sampler = SampleCallback(
        out_dir,
        _sample_producer(
            tokenizer,
            eval_set,
            config.egitim.ornek_uretim,
            config.degerlendirme.azami_yeni_belirtec,
        ),
    )
    arguments = common_arguments(
        config.egitim,
        hardware,
        precision,
        out_dir,
        eval_set is not None,
        config.egitim.degerlendirme_adimi,
    )
    trainer = _build_trainer(
        config, model, tokenizer, train_set, eval_set, arguments, [collector, sampler]
    )
    watch = Stopwatch()
    console.info(t("egitim.basliyor", aygit=hardware.name, is_parcacigi=threads))
    result = trainer.train(resume_from_checkpoint=last_checkpoint(out_dir) if resume else None)
    final = trainer.evaluate() if eval_set else {}
    target = out_dir / (ADAPTER_DIR if config.lora.etkin else FULL_MODEL_DIR)
    trainer.model.save_pretrained(str(target))
    tokenizer.save_pretrained(str(target))
    summary = {
        "gorev": "sohbet",
        "taban": base,
        "model_klasoru": str(target),
        "yontem": "lora" if config.lora.etkin else "tam",
        "ornek": {
            "egitim": len(train_set.encoded),
            "dogrulama": len(eval_set.encoded) if eval_set else 0,
        },
        "adim": int(trainer.state.global_step),
        "egitim_kaybi": float(result.training_loss),
        "dogrulama_kaybi": final.get("eval_loss"),
        "en_iyi_denetim": trainer.state.best_model_checkpoint,
        "sure_sn": watch.seconds(),
        "tohum": config.egitim.tohum,
        "uyarilar": notes,
        **environment_info(hardware, precision),
    }
    write_run_files(out_dir, config, summary)
    keys = ("taban", "yontem", "adim", "egitim_kaybi", "dogrulama_kaybi", "sure_sn")
    report_rows = summary_rows(summary, keys)
    write_report(
        out_dir / REPORT_FILE,
        t("rapor.baslik", gorev="sohbet"),
        report_rows,
        collector.rows,
        sampler.rows,
        notes,
    )
    console.result(t("egitim.bitti", yol=target, rapor=out_dir / REPORT_FILE))
    return summary
