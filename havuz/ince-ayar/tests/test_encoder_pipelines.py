"""Kodlayıcı hatları uçtan uca (minik rastgele BERT, CPU): sınıflandırma (+ONNX, int8, eşik),
gömme (+ONNX), varlık tanıma. Adım sayısı Trainer'ın hesabıyla da karşılaştırılır."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pytest

from ince_ayar.config import load_config
from ince_ayar.plan import training_steps
from ince_ayar.tasks.classification.config import ClassificationConfig
from ince_ayar.tasks.embedding.config import EmbeddingConfig
from ince_ayar.tasks.ner.config import NerConfig
from tests.conftest import ROOT

SAMPLES = [
    "Kargom hâlâ gelmedi",
    "İADE İSTİYORUM",
    "Faturamı e-postayla alabilir miyim?",
    "ışık ılık ŞİŞ",
]


def _overrides(task: str, out: Path, data: str) -> list[str]:
    return [f"egitim.cikti={str(out)!r}", f"veri.egitim={str(ROOT / 'ornekler' / data)!r}"]


@pytest.fixture(scope="module")
def classifier(
    tmp_path_factory: pytest.TempPathFactory,
) -> tuple[ClassificationConfig, dict[str, Any]]:
    from ince_ayar.tasks.classification.train import run_training

    out = tmp_path_factory.mktemp("siniflandirma")
    extra = ["egitim.azami_adim=-1", "egitim.donem=2", "egitim.yigin=3", "egitim.biriktirme=2"]
    config = load_config(
        ROOT / "yapilandirma/siniflandirma/cpu-deneme.toml",
        ClassificationConfig,
        _overrides("siniflandirma", out, "siniflandirma.csv") + extra,
    )
    return config, run_training(config)


def test_siniflandirma_adim_sayisi_trainer_ile_ayni(
    classifier: tuple[ClassificationConfig, dict[str, Any]],
) -> None:
    config, summary = classifier
    expected = training_steps(summary["ornek"]["egitim"], 3, 2, 2.0, -1)
    assert summary["adim"] == expected == 4
    assert set(summary["etiketler"]) == {"fatura", "iade", "kargo"}
    assert (Path(config.egitim.cikti) / "model" / "esik.json").is_file()


def test_onnx_ciktisi_pytorch_ile_ayni_ve_tokenizer_esdeger(
    classifier: tuple[ClassificationConfig, dict[str, Any]],
) -> None:
    from transformers import AutoTokenizer

    from ince_ayar.export.onnx_runtime import OnnxClassifier
    from ince_ayar.tasks.classification.export import export_classifier
    from ince_ayar.tasks.classification.modeling import load_trained, predict_proba

    config, _ = classifier
    out = Path(config.egitim.cikti)
    info = export_classifier(out, out / "onnx", int8=True, max_length=64, samples=SAMPLES)
    assert info["fp32_en_buyuk_fark"] < 1e-5
    assert info["int8_karar_uyumu"] >= 0.75
    model, tokenizer, _ = load_trained(out)
    runtime = OnnxClassifier(out)
    reference = predict_proba(model, tokenizer, SAMPLES, 64)
    assert np.abs(runtime.probabilities(SAMPLES) - reference).max() < 1e-5
    hf = AutoTokenizer.from_pretrained(out / "onnx")
    for text in SAMPLES:
        assert runtime.tokenizer.encode(text).ids == hf(text)["input_ids"]
    assert runtime.predict(SAMPLES) == runtime.thresholds.decide(reference)


def test_agirlikli_kayip_ve_asiri_ornekleme() -> None:
    import torch

    from ince_ayar.data.records import LabeledText
    from ince_ayar.tasks.classification.data import class_weights, oversample
    from ince_ayar.tasks.classification.modeling import WeightedTrainer

    rows = [LabeledText(i, f"m{i}", "a" if i < 6 else "b") for i in range(8)]
    weights = class_weights(rows, ["a", "b"])
    assert weights == pytest.approx([8 / (2 * 6), 8 / (2 * 2)])
    balanced = oversample(rows, seed=1)
    assert sum(r.label == "b" for r in balanced) == sum(r.label == "a" for r in balanced) == 6

    class Out:
        logits = torch.tensor([[2.0, 0.0], [0.0, 1.0], [1.0, 1.0]])

    trainer = WeightedTrainer.__new__(WeightedTrainer)
    trainer.class_weights = weights
    labels = torch.tensor([0, 1, 1])
    loss = trainer.compute_loss(lambda **_: Out(), {"labels": labels})
    expected = torch.nn.functional.cross_entropy(Out.logits, labels, weight=torch.tensor(weights))
    assert loss.item() == pytest.approx(expected.item())


def test_esik_ayari_ikili_gorevde_azinlik_sinifini_olumlu_sayar() -> None:
    from ince_ayar.data.records import LabeledText
    from ince_ayar.tasks.classification.config import ThresholdSection
    from ince_ayar.tasks.classification.evaluate import tune_thresholds

    labels = ["normal", "sahte"]
    train = [LabeledText(i, "x", "sahte" if i < 2 else "normal") for i in range(10)]
    rows = [
        LabeledText(i, "x", lab) for i, lab in enumerate(["sahte", "normal", "sahte", "normal"])
    ]
    probs = np.array([[0.4, 0.6], [0.7, 0.3], [0.65, 0.35], [0.9, 0.1]])
    result = tune_thresholds(probs, rows, labels, train, ThresholdSection(hedef_dogruluk=0.0))
    assert result.positive_label == "sahte"
    assert result.decide(probs) == ["sahte", "normal", "sahte", "normal"]


def test_gomme_egitimi_ve_onnx(tmp_path_factory: pytest.TempPathFactory) -> None:
    from sentence_transformers import SentenceTransformer

    from ince_ayar.export.onnx_runtime import OnnxEmbedder
    from ince_ayar.tasks.embedding.export import export_embedder
    from ince_ayar.tasks.embedding.train import run_training

    out = tmp_path_factory.mktemp("gomme")
    config = load_config(
        ROOT / "yapilandirma/gomme/cpu-deneme.toml",
        EmbeddingConfig,
        [*_overrides("gomme", out, "gomme.jsonl"), "model.sorgu_oneki='query: '"],
    )
    summary = run_training(config)
    assert summary["adim"] == 3 and set(summary["once"]) == set(summary["sonra"])
    model = SentenceTransformer(str(out / "model"), device="cpu")
    assert model.prompts.get("query") == "query: "
    info = export_embedder(
        out, out / "onnx", int8=False, query_prefix="query: ", document_prefix=""
    )
    assert info["fp32_en_buyuk_fark"] < 1e-5
    vectors = OnnxEmbedder(out).encode_queries(SAMPLES)
    assert np.abs(vectors - model.encode(["query: " + s for s in SAMPLES])).max() < 1e-5


def test_zor_olumsuz_kazma_sutunlari(tmp_path: Path) -> None:
    from datasets import Dataset
    from sentence_transformers import SentenceTransformer

    from ince_ayar.data.validate import load_pairs
    from ince_ayar.tasks.embedding.train import _mine
    from ince_ayar.tiny import create_tiny_encoder

    pairs = load_pairs(ROOT / "ornekler/gomme.jsonl").rows
    create_tiny_encoder([p.query for p in pairs] + [p.positive for p in pairs], tmp_path / "m")
    config = load_config(
        ROOT / "yapilandirma/gomme/cpu-deneme.toml", EmbeddingConfig, ["egitim.zor_olumsuz_kaz=2"]
    )
    dataset = Dataset.from_dict(
        {"sorgu": [p.query for p in pairs], "olumlu": [p.positive for p in pairs]}
    )
    mined = _mine(config, SentenceTransformer(str(tmp_path / "m"), device="cpu"), dataset)
    assert mined.column_names[:2] == ["sorgu", "olumlu"]
    assert all(c.startswith("olumsuz_") for c in mined.column_names[2:])


def test_varlik_hizalama_egitim_ve_tahmin(tmp_path_factory: pytest.TempPathFactory) -> None:
    from ince_ayar.tasks.ner.data import align_labels
    from ince_ayar.tasks.ner.predict import evaluate_ner, predict_entities
    from ince_ayar.tasks.ner.train import run_training

    index = {"O": 0, "B-YER": 1, "I-YER": 2}
    assert align_labels([None, 0, 0, 0, 1, None], ["B-YER", "O"], index) == [
        -100,
        1,
        -100,
        -100,
        0,
        -100,
    ]
    out = tmp_path_factory.mktemp("varlik")
    config = load_config(
        ROOT / "yapilandirma/varlik/cpu-deneme.toml",
        NerConfig,
        _overrides("varlik", out, "varlik.jsonl"),
    )
    summary = run_training(config)
    assert summary["etiketler"] == ["O", "B-KISI", "I-KISI", "B-YER", "I-YER"]
    rows = predict_entities(str(out), ["Ayşe Yılmaz Ankara'ya gitti ."], 64)
    assert rows[0]["metin"] == "Ayşe Yılmaz Ankara'ya gitti ."
    assert 0.0 <= evaluate_ner(config, None, None)["f1"] <= 1.0


def test_siniflandirma_dosyadan_tahmin_ve_onnx_degerlendirme(
    classifier: tuple[ClassificationConfig, dict[str, Any]], tmp_path: Path
) -> None:
    from ince_ayar.tasks.classification.evaluate import evaluate_classifier
    from ince_ayar.tasks.classification.export import export_classifier
    from ince_ayar.tasks.classification.predict import predict_texts

    config, _ = classifier
    out = Path(config.egitim.cikti)
    if not (out / "onnx" / "model.onnx").is_file():
        export_classifier(out, out / "onnx", int8=False, max_length=64)
    rows = predict_texts(
        str(out),
        ["Kargom nerede"],
        str(ROOT / "ornekler/siniflandirma.csv"),
        str(tmp_path / "tahmin.jsonl"),
        True,
        64,
    )
    assert len(rows) == 25 and (tmp_path / "tahmin.jsonl").is_file()
    assert set(rows[0]["olasiliklar"]) == {"fatura", "iade", "kargo"}
    result = evaluate_classifier(
        config, None, str(ROOT / "ornekler/siniflandirma.csv"), use_onnx=True
    )
    assert result["ornek"] == 24 and 0.0 <= result["makro_f1"] <= 1.0


def test_gomme_degerlendirme_ve_arama(tmp_path_factory: pytest.TempPathFactory) -> None:
    from ince_ayar.tasks.embedding.evaluate import evaluate_embedder
    from ince_ayar.tasks.embedding.export import export_embedder
    from ince_ayar.tasks.embedding.predict import search
    from ince_ayar.tasks.embedding.train import run_training

    out = tmp_path_factory.mktemp("gomme2")
    config = load_config(
        ROOT / "yapilandirma/gomme/cpu-deneme.toml",
        EmbeddingConfig,
        _overrides("gomme", out, "gomme.jsonl"),
    )
    run_training(config)
    export_embedder(out, out / "onnx", int8=False, query_prefix="", document_prefix="")
    torch_scores = evaluate_embedder(config, None, None, use_onnx=False)
    onnx_scores = evaluate_embedder(config, None, None, use_onnx=True)
    assert torch_scores == pytest.approx(onnx_scores)
    documents = out / "belgeler.txt"
    documents.write_text(
        "Kargo üç günde gelir.\nİade on dört gündür.\nMağaza pazar kapalı.\n", encoding="utf-8"
    )
    results = search(str(out), ["kargo ne zaman"], str(documents), 2, True, "", "")
    assert len(results[0]["belgeler"]) == 2
