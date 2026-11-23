"""Model: timm gövdesi + girdi normalleştirici sarmalayıcı; dondurma; güvenli kayıt ve yükleme.

Kim kullanır: `train.py`, `predict.py`, `evaluate.py`, `disa_aktar/onnx_export.py`, `plan.py`.

`ImageClassifier` girdi olarak uint8 (N, yükseklik, genişlik, 3) RGB alır; ÷255, −ortalama, ÷sapma
ve eksen çevirme (NHWC → NCHW) MODELİN İÇİNDEDİR. Eğitim, değerlendirme, ONNX ve sunucu aynı modülü
kullanır; ön işleme farkı imkânsızlaşır (bkz. `hazirlik/model_input.py`).

Taban adları: "timm/<mimari>.<etiket>" (Hugging Face kimliği; katalogdaki biçim), timm mimari adı
ya da "minik-rastgele" (timm `test_resnet`, rastgele ağırlık; ağsız testler için).
Kayıt: `agirliklar.safetensors` (pickle YOK: güvenli yüklenir) + `model.json` (mimari, etiketler,
ön işleme, sıcaklık, eşik). `load_checkpoint` mimariyi `model.json`'dan yeniden kurar.

Genişletme: timm dışı bir model ailesi gerekirse `build_backbone` içine dal ekleyin; dönen nesnenin
`get_classifier()` yöntemi olmalı (baş parametreleri ve dondurma onunla bulunur).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from goruntu.config import TINY_MODEL
from goruntu.errors import UserError
from goruntu.hazirlik.model_input import InputSpec, spec_from_timm
from goruntu.io_utils import read_json, write_json
from goruntu.messages import t

TINY_ARCH = "test_resnet"
WEIGHTS_FILE, META_FILE, MODEL_DIR = "agirliklar.safetensors", "model.json", "model"
FORMAT_VERSION = 1


def timm_name(base: str) -> str:
    """Katalog kimliğini timm adına çevirir: "timm/efficientnet_b0.ra_in1k" → "efficientnet_b0.ra_in1k"."""
    if base == TINY_MODEL:
        return TINY_ARCH
    return base.removeprefix("timm/")


def creation_kwargs(name: str, size: int) -> dict[str, Any]:
    """Konum gömmeli (ViT gibi) sabit boyutlu modeller başka boyutta `img_size` ile kurulmalı."""
    from timm.models import get_pretrained_cfg

    config = get_pretrained_cfg(name)
    if not size or config is None or not config.fixed_input_size:
        return {}
    return {} if tuple(config.input_size[1:]) == (size, size) else {"img_size": size}


def build_backbone(
    base: str, num_classes: int, pretrained: bool, drop_rate: float = 0.0, size: int = 0
) -> tuple[Any, InputSpec, dict[str, Any]]:
    """timm modelini kurar: (model, ön işleme ayarı, yeniden kurma için ek argümanlar)."""
    import timm
    from timm.data import resolve_model_data_config

    name = timm_name(base)
    if not timm.is_model(name):
        raise UserError(t("model.bilinmeyen", taban=base))
    extra = creation_kwargs(name, size)
    try:
        model = timm.create_model(
            name,
            pretrained=pretrained and base != TINY_MODEL,
            num_classes=num_classes,
            drop_rate=drop_rate,
            **extra,
        )
    except (OSError, RuntimeError, ValueError) as exc:
        detail = (str(exc).splitlines() or [type(exc).__name__])[0][:300]
        raise UserError(t("model.yuklenemedi", taban=base, ayrinti=detail)) from exc
    return model, spec_from_timm(resolve_model_data_config(model), size), extra


def make_classifier(backbone: Any, spec: InputSpec) -> Any:
    """uint8 NHWC alan, normalleştirmeyi içeren `nn.Module` sarmalayıcı."""
    import torch

    class ImageClassifier(torch.nn.Module):
        def __init__(self) -> None:
            super().__init__()
            self.backbone = backbone
            mean = torch.tensor(spec.ortalama, dtype=torch.float32).view(1, 3, 1, 1)
            std = torch.tensor(spec.sapma, dtype=torch.float32).view(1, 3, 1, 1)
            self.register_buffer("mean", mean)
            self.register_buffer("std", std)

        def forward(self, images: torch.Tensor) -> torch.Tensor:
            pixels = images.permute(0, 3, 1, 2).float().div(255.0)
            return self.backbone((pixels - self.mean) / self.std)  # type: ignore[no-any-return]

    return ImageClassifier()


def head_parameters(model: Any) -> list[Any]:
    return list(model.backbone.get_classifier().parameters())


def set_backbone_frozen(model: Any, frozen: bool) -> None:
    """Gövdeyi dondurur/çözer; baş (sınıflandırıcı katmanı) her zaman eğitilir."""
    head = {id(p) for p in head_parameters(model)}
    for parameter in model.backbone.parameters():
        parameter.requires_grad = (not frozen) or id(parameter) in head


def set_train_mode(model: Any, backbone_frozen: bool) -> None:
    """Eğitim kipi. Gövde donuksa BatchNorm istatistikleri de donar (yoksa sessizce kayarlar)."""
    import torch

    model.train()
    if backbone_frozen:
        for module in model.backbone.modules():
            if isinstance(module, torch.nn.modules.batchnorm._BatchNorm):
                module.eval()


def save_checkpoint(model: Any, directory: Path, meta: dict[str, Any]) -> Path:
    from safetensors.torch import save_model

    directory.mkdir(parents=True, exist_ok=True)
    save_model(model, str(directory / WEIGHTS_FILE))
    write_json(directory / META_FILE, {"bicim": FORMAT_VERSION, **meta})
    return directory


def find_model_dir(path: Path) -> Path:
    """Eğitim çıktı klasörü (`…/model` alt klasörü) ya da doğrudan model klasörü verilebilir."""
    for candidate in (path / MODEL_DIR, path):
        if (candidate / META_FILE).is_file() and (candidate / WEIGHTS_FILE).is_file():
            return candidate
    raise UserError(t("model.klasor_yok", yol=path))


def load_checkpoint(path: Path) -> tuple[Any, dict[str, Any]]:
    """Kaydı yükler: (değerlendirme kipinde model, model.json içeriği)."""
    import timm
    from safetensors.torch import load_model

    directory = find_model_dir(path)
    meta: dict[str, Any] = read_json(directory / META_FILE)
    spec = InputSpec.model_validate(meta["on_isleme"])
    backbone = timm.create_model(
        meta["mimari"],
        pretrained=False,
        num_classes=len(meta["etiketler"]),
        drop_rate=float(meta.get("birakma", 0.0)),
        **meta.get("olusturma", {}),
    )
    model = make_classifier(backbone, spec)
    load_model(model, str(directory / WEIGHTS_FILE), strict=True)
    return model.eval(), meta
