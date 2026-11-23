"""Ortak test araçları: iş parçacığı sınırı, ağ anahtarı, programla üretilen görüntüler, minik model.

Testler çevrimdışıdır: model indirilmez (rastgele ağırlıklı timm `test_resnet`), görüntüler
`goruntu.synthetic` ile tohumlu üretilir. Ağ isteyen testler `@pytest.mark.ag` ile işaretlenir ve
yalnız `GORUNTU_AG=1` iken koşar.
Pahalı hazırlıklar (eğitilmiş minik model, ONNX paketi) oturum boyunca BİR KEZ yapılır.

Genişletme: birden çok test dosyasının kullandığı yardımcıyı buraya ekleyin.
"""

from __future__ import annotations

import io
import os
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from PIL import Image

os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")

ROOT = Path(__file__).resolve().parents[1]
PRESET_DIR = ROOT / "yapilandirma" / "siniflandirma"
NETWORK_ENV = "GORUNTU_AG"


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "ag: ağ ister; yalnız GORUNTU_AG=1 iken koşar")


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if os.environ.get(NETWORK_ENV) == "1":
        return
    skip = pytest.mark.skip(reason=f"ağ testi: {NETWORK_ENV}=1 ile açılır")
    for item in items:
        if "ag" in item.keywords:
            item.add_marker(skip)


@pytest.fixture(autouse=True)
def _offline(monkeypatch: pytest.MonkeyPatch, request: pytest.FixtureRequest) -> None:
    """Ağ testleri dışında Hugging Face erişimini kapatır: yanlışlıkla indirme olursa test düşer."""
    if "ag" not in request.keywords:
        monkeypatch.setenv("HF_HUB_OFFLINE", "1")
        monkeypatch.setenv("TRANSFORMERS_OFFLINE", "1")


@pytest.fixture(autouse=True, scope="session")
def _limit_threads() -> None:
    """Paylaşımlı makinede komşuları boğmamak için torch iş parçacığını kısar."""
    import torch

    torch.set_num_threads(2)


def encode(image: Image.Image, fmt: str = "PNG", **params: Any) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, fmt, **params)
    return buffer.getvalue()


def corner_image(width: int = 60, height: int = 40) -> Image.Image:
    """Dört köşesi ayrı renkli, simetrisiz görüntü (yön testleri için)."""
    array = np.full((height, width, 3), 128, dtype=np.uint8)
    half_h, half_w = height // 2, width // 2
    array[:half_h, :half_w] = (255, 0, 0)  # sol üst kırmızı
    array[:half_h, half_w:] = (0, 255, 0)  # sağ üst yeşil
    array[half_h:, :half_w] = (0, 0, 255)  # sol alt mavi
    array[half_h:, half_w:] = (255, 255, 0)  # sağ alt sarı
    array[2:6, 2:10] = (255, 255, 255)  # küçük işaret: tam simetri olmasın
    return Image.fromarray(array, mode="RGB")


@pytest.fixture(scope="session")
def shape_dataset(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """3 sınıf × 16 görüntü (48 px) + birkaç yakın kopya."""
    from goruntu.synthetic import write_shape_dataset

    root = tmp_path_factory.mktemp("veri") / "sekiller"
    write_shape_dataset(root, per_class=16, seed=3, size=48, copies=0.2)
    return root


def tiny_config(data_dir: Path, out_dir: Path, *overrides: str) -> Any:
    """`cpu-deneme` hazır ayarı, test için küçültülmüş (32 px, 2 dönem)."""
    from goruntu.config import load_config
    from goruntu.siniflandirma.config import ClassifierConfig

    changes = [
        f'veri.klasor="{data_dir.as_posix()}"',
        f'egitim.cikti="{out_dir.as_posix()}"',
        "model.girdi_boyutu=32",
        "egitim.donem=2",
        "egitim.yigin=8",
        *overrides,
    ]
    return load_config(PRESET_DIR / "cpu-deneme.toml", ClassifierConfig, changes)


@pytest.fixture(scope="session")
def trained_model(shape_dataset: Path, tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Minik rastgele modelle 2 dönem eğitilmiş çıktı klasörü (oturumda bir kez)."""
    from goruntu.siniflandirma.train import run_training

    out_dir = tmp_path_factory.mktemp("cikti") / "minik"
    run_training(tiny_config(shape_dataset, out_dir))
    return out_dir


@pytest.fixture(scope="session")
def onnx_bundle(trained_model: Path, shape_dataset: Path) -> Path:
    """Eğitilmiş minik modelin ONNX paketi (fp32 + int8)."""
    from goruntu.disa_aktar.onnx_export import export_classifier
    from goruntu.hazirlik.loader import load_rgb

    samples = [load_rgb(path) for path in sorted(shape_dataset.rglob("*.jpg"))[:4]]
    export_classifier(trained_model, None, True, samples)
    return trained_model / "paket"
