"""Varlık tanıma tahmini ve değerlendirmesi.

Kim kullanır: `varlik tahmin` (metindeki kişi/yer… varlıklarını listeler) ve `varlik degerlendir`
(doğrulama kümesinde ya da verilen dosyada varlık F1).

Metin boşluklardan sözcüklere bölünür (noktalama sözcüğe yapışık kalır: "Ankara'ya."). Eğitim
verisi de aynı biçimde bölünmüşse en iyi sonucu verir.

Genişletme: daha iyi sözcük bölme gerekiyorsa `split_words` işlevini değiştirin; eğitim verisini
de aynı işlevle hazırlayın.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ince_ayar import console
from ince_ayar.console import format_table
from ince_ayar.data.validate import load_tagged
from ince_ayar.errors import UserError
from ince_ayar.io_utils import write_json
from ince_ayar.messages import t
from ince_ayar.metrics.ner import entity_scores, extract_entities, token_accuracy
from ince_ayar.runs import EVALUATION_FILE
from ince_ayar.tasks.encoder_base import find_trained_dir
from ince_ayar.tasks.ner.config import NerConfig
from ince_ayar.tasks.ner.data import prepare_tagged


def split_words(text: str) -> list[str]:
    return text.split()


def tag_words(
    model: Any, tokenizer: Any, sentences: list[list[str]], max_length: int
) -> list[list[str]]:
    """Her sözcüğün etiketini ilk alt sözcüğün kararından okur."""
    import torch

    labels = model.config.id2label
    result: list[list[str]] = []
    for words in sentences:
        encoded = tokenizer(
            words,
            is_split_into_words=True,
            truncation=True,
            max_length=max_length,
            return_tensors="pt",
        )
        with torch.no_grad():
            predicted = model(**encoded).logits.argmax(-1)[0].tolist()
        tags = ["O"] * len(words)
        seen: set[int] = set()
        for position, word in enumerate(encoded.word_ids(0)):
            if word is not None and word not in seen:
                seen.add(word)
                tags[word] = labels[predicted[position]]
        result.append(tags)
    return result


def _load(model_path: str) -> tuple[Any, Any]:
    from transformers import AutoModelForTokenClassification, AutoTokenizer

    directory = find_trained_dir(Path(model_path))
    model = AutoModelForTokenClassification.from_pretrained(str(directory)).eval()
    return model, AutoTokenizer.from_pretrained(str(directory))


def predict_entities(model_path: str, texts: list[str], max_length: int) -> list[dict[str, Any]]:
    if not texts:
        raise UserError(t("tahmin.girdi_yok"))
    model, tokenizer = _load(model_path)
    sentences = [split_words(text) for text in texts]
    rows = []
    for words, tags in zip(
        sentences, tag_words(model, tokenizer, sentences, max_length), strict=True
    ):
        entities = [
            {"tur": kind, "metin": " ".join(words[start:end])}
            for kind, start, end in sorted(extract_entities(tags), key=lambda e: e[1])
        ]
        rows.append({"metin": " ".join(words), "varliklar": entities})
        found = ", ".join(f"{e['metin']} ({e['tur']})" for e in entities) or "-"
        console.result(f"{' '.join(words)}\n  → {found}")
    return rows


def evaluate_ner(
    config: NerConfig, model_path: str | None, data_path: str | None
) -> dict[str, Any]:
    if data_path:
        loaded = load_tagged(Path(data_path), config.veri.kodlama)
        loaded.raise_if_errors()
        rows = loaded.rows
    else:
        rows = prepare_tagged(config.veri).validation
    target = model_path or config.egitim.cikti
    model, tokenizer = _load(target)
    predicted = tag_words(model, tokenizer, [row.words for row in rows], config.veri.azami_uzunluk)
    gold = [row.tags for row in rows]
    scores = entity_scores(gold, predicted)
    result = {"ornek": len(rows), **scores, "belirtec_dogrulugu": token_accuracy(gold, predicted)}
    per_type = scores["tur"] if isinstance(scores["tur"], dict) else {}
    table = [[kind, v["kesinlik"], v["duyarlilik"], v["f1"]] for kind, v in per_type.items()]
    table.append(["(hepsi)", scores["kesinlik"], scores["duyarlilik"], scores["f1"]])
    console.result(format_table(["tür", "kesinlik", "duyarlılık", "F1"], table))
    if Path(target).is_dir():
        write_json(find_trained_dir(Path(target)) / EVALUATION_FILE, result)
    return result
