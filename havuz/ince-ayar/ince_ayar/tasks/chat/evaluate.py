"""Sohbet modelini değerlendirir: asistan belirteçleri üzerinde kayıp/şaşkınlık + üretimle tam
eşleşme ve ROUGE-L. İstenirse aynı veride taban modeli de ölçer (bağdaştırıcı kapatılarak).

Kim kullanır: `python -m ince_ayar sohbet degerlendir`.

Veri seçimi: `--veri` verilirse o dosyanın tamamı; değilse yapılandırmadaki doğrulama dosyası;
o da yoksa eğitim verisi eğitimdeki **aynı tohumla** yeniden bölünür ve doğrulama parçası alınır
(ayrım belirlenimci olduğundan eğitimde görülmemiş örneklerdir).

Genişletme: yeni bir ölçüt için `score_model` sonucuna alan ekleyin; ölçüt işlevi
`ince_ayar/metrics/text.py` içinde durmalıdır.
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any

from ince_ayar import console
from ince_ayar.console import format_table
from ince_ayar.data.records import ChatExample
from ince_ayar.data.validate import load_chat
from ince_ayar.hardware import detect_hardware, limit_threads
from ince_ayar.io_utils import write_json, write_jsonl
from ince_ayar.messages import t
from ince_ayar.metrics.text import score_generations
from ince_ayar.runs import EVALUATION_FILE
from ince_ayar.tasks.chat.config import ChatConfig
from ince_ayar.tasks.chat.data import load_examples
from ince_ayar.tasks.chat.masking import encode_chat
from ince_ayar.tasks.chat.modeling import generate_reply, load_for_inference, stop_token_ids

SAMPLES_FILE = "degerlendirme_ornekleri.jsonl"


def held_out_examples(config: ChatConfig, data_path: str | None) -> list[ChatExample]:
    """Değerlendirme örneklerini seçer (bkz. dosya başlığı)."""
    if data_path:
        loaded = load_chat(Path(data_path), config.veri.kodlama)
        loaded.raise_if_errors()
        return loaded.rows
    examples = load_examples(config.veri).validation
    if not examples:
        from ince_ayar.errors import UserError

        raise UserError(t("degerlendirme.veri_yok"))
    return examples


def token_loss(
    model: Any, tokenizer: Any, examples: list[ChatExample], limit: int
) -> dict[str, float]:
    """Asistan belirteçleri üzerinde belirteç ağırlıklı ortalama kayıp ve şaşkınlık (perplexity)."""
    import torch

    total, count = 0.0, 0
    for example in examples:
        encoded = encode_chat(tokenizer, example.messages)
        if len(encoded.input_ids) > limit:
            continue
        ids = torch.tensor([encoded.input_ids], device=model.device)
        labels = torch.tensor([encoded.labels], device=model.device)
        with torch.no_grad():
            loss = model(input_ids=ids, labels=labels).loss
        total += float(loss) * encoded.label_count
        count += encoded.label_count
    mean = total / count if count else float("nan")
    return {"kayip": mean, "saskinlik": math.exp(mean) if count and mean < 50 else float("inf")}


def score_model(
    model: Any, tokenizer: Any, examples: list[ChatExample], config: ChatConfig, label: str
) -> tuple[dict[str, float], list[dict[str, Any]]]:
    """Bir modeli (ya da bağdaştırıcısı kapalı tabanı) ölçer: kayıp + üretim ölçütleri."""
    scores = token_loss(model, tokenizer, examples, config.veri.azami_uzunluk)
    chosen = examples[: config.degerlendirme.ornek_sayisi]
    stops = stop_token_ids(tokenizer, model)
    predictions = [
        generate_reply(
            model, tokenizer, ex.messages, config.degerlendirme.azami_yeni_belirtec, stops
        )
        for ex in chosen
    ]
    scores.update(score_generations(predictions, [ex.reference for ex in chosen]))
    samples = [
        {"model": label, "satir": ex.line, "beklenen": ex.reference, "uretilen": prediction}
        for ex, prediction in zip(chosen, predictions, strict=True)
    ]
    return scores, samples


def evaluate_chat(
    config: ChatConfig, model_path: str | None, data_path: str | None, compare_base: bool
) -> dict[str, Any]:
    """Değerlendirmeyi yürütür, tabloyu yazar, sonucu model klasörüne kaydeder."""
    limit_threads(config.egitim.is_parcacigi)
    device = "cuda" if detect_hardware().device == "cuda" else "cpu"
    examples = held_out_examples(config, data_path)
    target = model_path or config.egitim.cikti
    model, tokenizer = load_for_inference(target, device)
    results: dict[str, Any] = {}
    samples: list[dict[str, Any]] = []
    results["ince_ayarli"], found = score_model(model, tokenizer, examples, config, "ince_ayarli")
    samples.extend(found)
    if compare_base and hasattr(model, "disable_adapter"):
        with model.disable_adapter():
            results["taban"], found = score_model(model, tokenizer, examples, config, "taban")
        samples.extend(found)
    keys = ["kayip", "saskinlik", "tam_eslesme", "rouge_l", "rouge_l_karakter", "ornek"]
    rows = [[name, *[results[name][key] for key in keys]] for name in results]
    console.result(format_table(["model", *keys], rows))
    payload = {"model": target, "veri": data_path or "dogrulama", "ornek": len(examples), **results}
    if Path(target).is_dir():
        write_json(Path(target) / EVALUATION_FILE, payload)
        write_jsonl(Path(target) / SAMPLES_FILE, samples)
        console.info(t("degerlendirme.kaydedildi", yol=Path(target) / EVALUATION_FILE))
    return payload
