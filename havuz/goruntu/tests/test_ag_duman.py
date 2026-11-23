"""Ağlı duman testi (GORUNTU_AG=1): gerçek modeller indirilir, CPU'da kısa eğitim ve ölçüm yapılır.

1. MobileNetV3 ve ViT-Tiny (timm): sentetik şekil kümesinde yalnız baş eğitimi (cpu-kucuk hazır
   ayarı), ONNX + int8 dışa aktarım, PyTorch ↔ ONNX eşdeğerliği, ONNX ile test değerlendirmesi.
2. colab-t4 hazır ayarının kuru çalıştırması (indirme yok; plan ve bellek kestirimi).
3. CLIP ve SigLIP 2: renkli şekillerde görüntü→görüntü recall@k, Türkçe ve İngilizce metinle arama,
   sıfır atışlı sınıflandırma; komut satırından indeksle + ara.
Ölçümler `GORUNTU_DUMAN_RAPOR` dosyasına yazılır (scripts/duman_testi.py); docs/DENEME_KAYDI.md'ye işlenir.

Genişletme: yeni bir gerçek model denemesi için buraya `@pytest.mark.ag` işaretli test ekleyin ve
sonucunu `_record` ile rapora yazın.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from goruntu.synthetic import COLORS, COLORS_EN, COLORS_TR, SHAPES, SHAPES_EN, shape_image
from tests.conftest import PRESET_DIR

pytestmark = pytest.mark.ag
REPORT: dict[str, Any] = {}


def _record(key: str, value: Any) -> None:
    REPORT[key] = value
    target = os.environ.get("GORUNTU_DUMAN_RAPOR")
    if target:
        Path(target).write_text(
            json.dumps(REPORT, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    print(f"\n[{key}] {json.dumps(value, ensure_ascii=False)}")


BASES = {
    "mobilenetv3": "timm/mobilenetv3_large_100.ra_in1k",
    "vit_tiny": "timm/vit_tiny_patch16_224.augreg_in21k_ft_in1k",
}


@pytest.mark.parametrize("name", sorted(BASES))
def test_bas_egitimi_onnx(tmp_path: Path, name: str) -> None:
    from goruntu.config import load_config
    from goruntu.disa_aktar.onnx_export import export_classifier
    from goruntu.disa_aktar.runtime import OnnxClassifier
    from goruntu.hazirlik.loader import DEFAULT_LIMITS, load_rgb
    from goruntu.io_utils import read_json
    from goruntu.siniflandirma.config import ClassifierConfig
    from goruntu.siniflandirma.evaluate import evaluate_logits
    from goruntu.siniflandirma.predict import iterate_logits
    from goruntu.siniflandirma.train import run_training
    from goruntu.synthetic import write_shape_dataset

    data, out = tmp_path / "sekiller", tmp_path / "cikti"
    write_shape_dataset(data, per_class=40, seed=7, size=160, copies=0.1)
    overrides = [f'veri.klasor="{data}"', f'egitim.cikti="{out}"', "egitim.is_parcacigi=2",
                 f'model.taban="{BASES[name]}"']  # fmt: skip
    config = load_config(PRESET_DIR / "cpu-kucuk.toml", ClassifierConfig, overrides)
    started = time.perf_counter()
    summary = run_training(config)
    training_seconds = time.perf_counter() - started
    result = read_json(out / "degerlendirme.json")
    rows = read_json(out / "ayrim.json")["parcalar"]["test"]
    samples = [load_rgb(Path(row["dosya"])) for row in rows[:16]]
    started = time.perf_counter()
    bundle = export_classifier(out, None, True, samples)
    export_seconds = time.perf_counter() - started
    onnx_model = OnnxClassifier(out)
    paths = [Path(row["dosya"]) for row in rows]
    truth = [onnx_model.labels.index(row["etiket"]) for row in rows]
    logits = np.concatenate(
        [chunk for _, chunk, _ in iterate_logits(onnx_model, paths, DEFAULT_LIMITS)]
    )
    onnx_result = evaluate_logits(logits, truth, [str(p) for p in paths], onnx_model.decision)
    record = {
        "ornek": summary["ornek"], "en_iyi_donem": summary["en_iyi_donem"],
        "son_donem": summary["son_donem"], "egitim_sn": round(training_seconds, 1),
        "test_dogruluk": result["dogruluk"], "test_makro_f1": result["makro_f1"],
        "kalibrasyon": result["kalibrasyon"], "emin_degilim": result["emin_degilim"],
        "onnx_test_dogruluk": onnx_result["dogruluk"], "onnx_dogrulama": bundle["dogrulama"],
        "disa_aktarim_sn": round(export_seconds, 1),
        "paket_mb": {p.name: round(p.stat().st_size / 1e6, 2) for p in (out / "paket").glob("*.onnx")},
        "uyarilar": summary["uyarilar"],
    }  # fmt: skip
    _record(f"siniflandirma_{name}", record)
    assert bundle["dogrulama"]["fp32_en_buyuk_fark"] < 1e-4
    assert onnx_result["dogruluk"] == pytest.approx(result["dogruluk"])
    assert result["dogruluk"] >= 0.6


def test_colab_t4_kuru_calistirma(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    from goruntu.config import load_config
    from goruntu.siniflandirma.config import ClassifierConfig
    from goruntu.siniflandirma.train import run_training
    from goruntu.synthetic import write_shape_dataset

    write_shape_dataset(tmp_path / "v", per_class=10, seed=1, size=64)
    overrides = [
        f'veri.klasor="{tmp_path / "v"}"',
        f'egitim.cikti="{tmp_path / "c"}"',
        "egitim.is_parcacigi=2",
    ]
    run_training(
        load_config(PRESET_DIR / "colab-t4.toml", ClassifierConfig, overrides), dry_run=True
    )
    plan = [line for line in capsys.readouterr().out.splitlines() if " : " in line]
    _record("colab_t4_kuru_plan", plan)
    assert any("SIĞAR" in line or "SINIRDA" in line for line in plan)


def _labeled_images(per_cell: int = 5, size: int = 224) -> tuple[list[Any], list[str], list[str]]:
    rng = np.random.default_rng(21)
    images, shapes, colors = [], [], []
    for shape in SHAPES:
        for color in COLORS:
            for _ in range(per_cell):
                images.append(shape_image(shape, color, rng, size))
                shapes.append(shape)
                colors.append(color)
    return images, shapes, colors


@pytest.mark.parametrize("alias", ["clip", "siglip2"])
def test_gomme_ve_turkce_arama(alias: str) -> None:
    from goruntu.arama.embedders import make_embedder
    from goruntu.arama.evaluate import image_recall_at_k, text_hits_at_k
    from goruntu.arama.zero_shot import TEMPLATES, zero_shot

    images, shapes, colors = _labeled_images()
    started = time.perf_counter()
    embedder = make_embedder(alias)
    load_seconds = time.perf_counter() - started
    started = time.perf_counter()
    vectors = embedder.embed_images(images)
    per_image = (time.perf_counter() - started) / len(images)
    cells = [f"{c}/{s}" for s, c in zip(shapes, colors, strict=True)]
    names = sorted(set(cells))
    truth = [names.index(cell) for cell in cells]
    record: dict[str, Any] = {
        "model": embedder.name, "boyut": embedder.dim, "yukleme_sn": round(load_seconds, 1),
        "goruntu_basina_sn": round(per_image, 3), "ornek": len(images),
        "goruntu_goruntu_sekil": image_recall_at_k(vectors, [SHAPES.index(s) for s in shapes]),
        "goruntu_goruntu_renk": image_recall_at_k(vectors, [list(COLORS).index(c) for c in colors]),
    }  # fmt: skip
    queries = {
        "tr": [f"{COLORS_TR[n.split('/')[0]]} {n.split('/')[1]}" for n in names],
        "en": [f"a {COLORS_EN[n.split('/')[0]]} {SHAPES_EN[n.split('/')[1]]}" for n in names],
    }
    for language, texts in queries.items():
        query_vectors = embedder.embed_texts(texts)
        record[f"metin_{language}"] = text_hits_at_k(
            vectors, truth, query_vectors, list(range(len(names))), ks=(1, 5)
        )
        labels = list(SHAPES) if language == "tr" else [SHAPES_EN[s] for s in SHAPES]
        probabilities = zero_shot(embedder, images, labels, TEMPLATES[language])
        correct = probabilities.argmax(axis=1) == np.asarray([SHAPES.index(s) for s in shapes])
        record[f"sifir_atis_sekil_{language}"] = float(correct.mean())
    record["ornek_sorgular"] = {lang: texts[:2] for lang, texts in queries.items()}
    _record(f"gomme_{alias}", record)
    assert record["goruntu_goruntu_renk"]["recall@1"] > 0.5


def test_komut_satirindan_indeksle_ara(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    from goruntu.cli import main

    data = tmp_path / "urunler"
    assert (
        main(["ornek-veri", str(data), "--sinif-basi", "8", "--boyut", "160", "--kopya-orani", "0"])
        == 0
    )
    index = tmp_path / "dizin"
    assert main(["indeksle", str(data), "--dizin", str(index), "--model", "siglip2"]) == 0
    capsys.readouterr()
    assert main(["ara", "kırmızı üçgen", "--dizin", str(index), "-k", "3"]) == 0
    lines = capsys.readouterr().out.strip().splitlines()
    _record("cli_ara_kirmizi_ucgen", lines)
    assert len(lines) == 3
