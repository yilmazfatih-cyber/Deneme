"""ONNX testleri: aynı dosyalarla PyTorch çıktısı = ONNX çıktısı (ön işleme birebir), yığın 1, paket üst
verisi ONNX dosyasının içinde, çalışma zamanı torch yüklemez, int8 karar uyumu kaydedilir."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import onnx
import pytest

from goruntu.disa_aktar.bundle import BUNDLE_KEY, BundleMeta, find_onnx
from goruntu.disa_aktar.runtime import OnnxClassifier
from goruntu.errors import UserError
from goruntu.hazirlik.loader import load_rgb
from goruntu.io_utils import read_json
from goruntu.siniflandirma.predict import TorchClassifier, iterate_logits
from tests.conftest import ROOT


def _files(shape_dataset: Path) -> list[Path]:
    return sorted(shape_dataset.rglob("*.jpg"))[:20]


def test_onnx_cikti_pytorch_ile_ayni(
    onnx_bundle: Path, trained_model: Path, shape_dataset: Path
) -> None:
    from goruntu.hazirlik.loader import DEFAULT_LIMITS

    torch_model = TorchClassifier(trained_model)
    onnx_model = OnnxClassifier(onnx_bundle)
    files = _files(shape_dataset)
    _, torch_logits, _ = next(iterate_logits(torch_model, files, DEFAULT_LIMITS))
    _, onnx_logits, _ = next(iterate_logits(onnx_model, files, DEFAULT_LIMITS))
    assert np.abs(torch_logits - onnx_logits).max() < 1e-4
    single = onnx_model.logits([load_rgb(files[0])])  # yığın = 1
    assert single.shape == (1, 3) and np.abs(single[0] - onnx_logits[0]).max() < 1e-4
    torch_pred = torch_model.predict([load_rgb(f) for f in files])
    onnx_pred = onnx_model.predict([load_rgb(f) for f in files])
    assert [p.etiket for p in torch_pred] == [p.etiket for p in onnx_pred]


def test_paket_ust_verisi_onnx_icinde(onnx_bundle: Path, trained_model: Path) -> None:
    model = onnx.load(str(onnx_bundle / "model.onnx"))
    props = {prop.key: prop.value for prop in model.metadata_props}
    meta = BundleMeta.model_validate_json(props[BUNDLE_KEY])
    saved = read_json(trained_model / "model" / "model.json")
    assert meta.etiketler == saved["etiketler"] and meta.sicaklik == pytest.approx(
        saved["sicaklik"]
    )
    assert meta.on_isleme.model_dump(mode="json") == saved["on_isleme"]
    assert meta.dogrulama["fp32_en_buyuk_fark"] < 1e-4
    sidecar = read_json(onnx_bundle / "paket.json")
    assert sidecar["etiketler"] == meta.etiketler and "int8" in sidecar["dogrulama"]
    assert not list(onnx_bundle.glob("*.data"))  # tek dosya: dış veri yok


def test_evrisimli_agda_int8_yazilmaz(onnx_bundle: Path) -> None:
    """Evrişimler nicemlenmez; yalnız MatMul/Gemm nicemlenince CNN'de kazanç yok → dosya yazılmaz."""
    checks = read_json(onnx_bundle / "paket.json")["dogrulama"]
    assert checks["int8"] == "atlandi" and checks["int8_kuculme"] < 0.2
    assert not (onnx_bundle / "model.int8.onnx").exists()
    with pytest.raises(UserError, match="model.int8.onnx"):
        OnnxClassifier(onnx_bundle, int8=True)


def test_donusturucude_int8_kuculur_ve_olculur(tmp_path: Path, shape_dataset: Path) -> None:
    from goruntu.disa_aktar.onnx_export import export_classifier
    from goruntu.siniflandirma.model import build_backbone, make_classifier, save_checkpoint

    backbone, spec, extra = build_backbone("test_vit", 3, False, size=32)
    meta = {"taban": "test_vit", "mimari": "test_vit", "olusturma": extra,
            "etiketler": ["daire", "kare", "üçgen"], "on_isleme": spec.model_dump(mode="json"),
            "sicaklik": 1.0, "esik": 0.0}  # fmt: skip
    save_checkpoint(make_classifier(backbone, spec), tmp_path / "model", meta)
    samples = [load_rgb(path) for path in _files(shape_dataset)[:8]]
    info = export_classifier(tmp_path, None, True, samples)
    checks = info["dogrulama"]
    assert checks["int8"] == "yazildi" and checks["int8_kuculme"] >= 0.2
    assert "int8_karar_uyumu" in checks and isinstance(checks["int8_onerilmez"], bool)
    model = OnnxClassifier(tmp_path, int8=True)
    assert model.meta.nicemleme == "int8-dinamik"
    assert len(model.predict(samples[:2])) == 2


def test_calisma_zamani_torch_yuklemez(onnx_bundle: Path, shape_dataset: Path) -> None:
    code = (
        "import sys, json\nfrom pathlib import Path\n"
        "from goruntu.disa_aktar.runtime import OnnxClassifier\n"
        f"m = OnnxClassifier(Path({str(onnx_bundle)!r}))\n"
        f"p = m.predict_files([Path({str(_files(shape_dataset)[0])!r})])[0]\n"
        "print(json.dumps({'torch': 'torch' in sys.modules, 'timm': 'timm' in sys.modules,"
        " 'etiket': p.to_dict()['etiket']}))\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True,
        text=True,
        cwd=ROOT,
        check=True,
        timeout=120,
    )
    payload = json.loads(result.stdout.strip().splitlines()[-1])
    assert payload["torch"] is False and payload["timm"] is False


def test_ust_verisiz_onnx_yol_gosteren_hata(onnx_bundle: Path, tmp_path: Path) -> None:
    model = onnx.load(str(onnx_bundle / "model.onnx"))
    del model.metadata_props[:]
    target = tmp_path / "yabanci.onnx"
    onnx.save(model, str(target))
    with pytest.raises(UserError, match="disa-aktar"):
        OnnxClassifier(target)


def test_paket_bulunamazsa(tmp_path: Path) -> None:
    with pytest.raises(UserError, match="disa-aktar"):
        find_onnx(tmp_path)
