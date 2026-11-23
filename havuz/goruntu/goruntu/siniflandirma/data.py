"""torch veri kümeleri: değerlendirmede birebir ön işleme, eğitimde veri artırma.

Kim kullanır: `train.py`, `evaluate.py`, `predict.py`.

- Değerlendirme/çıkarım: `hazirlik.model_input.prepare` (ONNX ile AYNI işlev); artırma YOK.
- Eğitim: torchvision v2 ile rastgele boyutlu kırpma (alanın `olcek_alt`…%100'ü), isteğe bağlı yatay/
  dikey çevirme, döndürme ve renk oynaması. Büyük JPEG'ler DCT düzeyinde (hedefin iki katına) küçültülerek
  çözülür (`draft`): eğitim belirgin hızlanır; değerlendirmede bu yapılmaz.
- Örnekler uint8 (yükseklik, genişlik, 3) döner; normalleştirme modelin içindedir.

Genişletme: yeni bir artırma için `build_augmentation` listesine bir v2 dönüşümü ekleyin ve
`[artirma]` bölümüne (config.py + hazır ayarlar) açma/kapama alanı yazın.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from goruntu.errors import ImageRejectedError, UserError
from goruntu.hazirlik.loader import LoadLimits, load_rgb
from goruntu.hazirlik.model_input import InputSpec, prepare
from goruntu.messages import t
from goruntu.siniflandirma.config import AugmentSection
from goruntu.siniflandirma.dataset import Sample

_INTERPOLATION = {
    "bicubic": "BICUBIC",
    "bilinear": "BILINEAR",
    "nearest": "NEAREST",
    "lanczos": "LANCZOS",
    "box": "BOX",
    "hamming": "HAMMING",
}


def build_augmentation(spec: InputSpec, settings: AugmentSection) -> Any:
    """PIL → PIL rastgele dönüşüm zinciri (yalnız eğitimde)."""
    from torchvision.transforms import InterpolationMode, v2

    mode = getattr(InterpolationMode, _INTERPOLATION.get(spec.enterpolasyon, "BICUBIC"))
    steps: list[Any] = [
        v2.RandomResizedCrop(
            (spec.yukseklik, spec.genislik), scale=(settings.olcek_alt, 1.0), interpolation=mode
        )
    ]
    if settings.yatay_cevir:
        steps.append(v2.RandomHorizontalFlip())
    if settings.dikey_cevir:
        steps.append(v2.RandomVerticalFlip())
    if settings.dondurme_derece > 0:
        steps.append(
            v2.RandomRotation(
                settings.dondurme_derece,
                interpolation=InterpolationMode.BILINEAR,
                fill=list(spec.arka_plan),
            )
        )
    if settings.renk > 0:
        strength = settings.renk
        steps.append(v2.ColorJitter(brightness=strength, contrast=strength, saturation=strength))
    return v2.Compose(steps)


def make_dataset(
    samples: list[Sample],
    labels: list[str],
    spec: InputSpec,
    limits: LoadLimits,
    augmentation: Any | None = None,
) -> Any:
    """`(uint8 tensör HWC, etiket numarası)` döndüren torch veri kümesi."""
    import torch

    index = {label: number for number, label in enumerate(labels)}
    draft = (spec.genislik * 2, spec.yukseklik * 2)

    class ImageDataset(torch.utils.data.Dataset):  # type: ignore[type-arg]
        def __len__(self) -> int:
            return len(samples)

        def __getitem__(self, position: int) -> tuple[torch.Tensor, int]:
            sample = samples[position]
            try:
                if augmentation is None:
                    array = prepare(load_rgb(sample.path, limits), spec)
                else:
                    image = load_rgb(sample.path, limits, draft_to=draft)
                    array = np.asarray(augmentation(image), dtype=np.uint8).copy()
            except ImageRejectedError as exc:
                raise UserError(t("veri.egitimde_bozuldu", ayrinti=str(exc))) from exc
            return torch.from_numpy(array), index[sample.label]

    return ImageDataset()


def class_weights(samples: list[Sample], labels: list[str]) -> list[float]:
    """Sınıf ağırlıkları N / (K · nₖ): az olan sınıfın hatası daha pahalı (örneği olmayana 0)."""
    counts = [sum(1 for s in samples if s.label == label) for label in labels]
    total, classes = sum(counts), len(labels)
    return [total / (classes * count) if count else 0.0 for count in counts]


def sample_weights(samples: list[Sample], labels: list[str]) -> list[float]:
    """Dengeli örnekleme: her örneğin çekilme ağırlığı 1 / (sınıfının örnek sayısı)."""
    counts = {label: sum(1 for s in samples if s.label == label) for label in labels}
    return [1.0 / counts[s.label] for s in samples]
