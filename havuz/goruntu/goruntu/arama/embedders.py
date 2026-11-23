"""Gömme (embedding) modelleri: görüntü ve metni aynı vektör uzayına çevirir; satırlar L2-normludur.

Kim kullanır: `indeksle`, `ara`, `benzer`, `sifir-atis`, `arama-olc` komutları, sunucu.

Seçenekler (`make_embedder` adı):
- "siglip2"   → google/siglip2-base-patch32-256 (Apache-2.0). Çok dilli metin kodlayıcı (Gemma
                belirteçleyici): Türkçe sorgu denenebilir; ölçüm docs/DENEME_KAYDI.md'de.
- "clip"      → laion/CLIP-ViT-B-32-laion2B-s34B-b79K (MIT). Metin yalnız İngilizce eğitildi.
- "histogram" → (adı "histogram-v2") modelsiz, indirme gerektirmeyen renk (HSV) + kenar histogramı. Yalnız
                görüntü→görüntü ("benzer renk/doku"); metinle arama YAPAMAZ. Testlerde ve ağsız denemede.
- Başka bir Hugging Face kimliği (CLIP/SigLIP ailesi) de verilebilir; denenmemiş sayılır.
transformers 5 tuzağı: `get_image_features` artık tensör değil, `pooler_output` alanı olan bir nesne
döndürüyor; `_as_tensor` ikisini de kabul eder. SigLIP metni `padding="max_length"` (64) ile
kodlanmalıdır — model böyle eğitildi; kısa dolgu sonuçları bozar.

Genişletme: yeni model ailesi için `Embedder` yöntemlerini sağlayan sınıf yazıp `make_embedder`'a ekleyin;
`tests/test_search.py` içine sahte bir örnekle arayüz testi ekleyin.
"""

from __future__ import annotations

from typing import Any, Protocol

import numpy as np
from PIL import Image

from goruntu.errors import UserError
from goruntu.messages import t

ALIASES = {
    "siglip2": "google/siglip2-base-patch32-256",
    "clip": "laion/CLIP-ViT-B-32-laion2B-s34B-b79K",
    "histogram": "histogram-v2",
}
DEFAULT_EMBEDDER = "siglip2"
SIGLIP_TEXT_LENGTH = 64


def normalize(vectors: np.ndarray) -> np.ndarray:
    """Satırları birim uzunluğa getirir (sıfır satır sıfır kalır); float32 döner."""
    matrix = np.asarray(vectors, dtype=np.float32)
    if matrix.ndim == 1:
        matrix = matrix[None, :]
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    return np.asarray(matrix / np.maximum(norms, 1e-12), dtype=np.float32)


class Embedder(Protocol):
    name: str
    dim: int
    supports_text: bool

    def embed_images(self, images: list[Image.Image]) -> np.ndarray: ...

    def embed_texts(self, texts: list[str]) -> np.ndarray: ...

    def logit_scale(self) -> float: ...


class HistogramEmbedder:
    """Modelsiz gömme: doygunluk-farkında renk histogramı + 2×2 ızgarada kenar yönü histogramı.

    Renkli pikseller (doygunluk > %20, parlaklık > %15) ton(12) × doygunluk(2) × parlaklık(2) kutularına,
    gri/beyaz/siyah pikseller ayrı 4 parlaklık kutusuna düşer: beyaz ürün zemini rengi bastırmaz.
    Kutular karekök (Hellinger) ile yumuşatılır; kenar kısmı 0,5 ağırlıkla eklenir.
    Ölçüm (tests/test_search.py, renkli şekiller): renk sınıfında recall@1 ≥ 0,9; şekli AYIRT ETMEZ.
    """

    name = "histogram-v2"  # tasarım değişirse sürümü artırın: eski dizinler açık hatayla reddedilir
    dim = 12 * 2 * 2 + 4 + 4 * 8
    supports_text = False

    def _one(self, image: Image.Image) -> np.ndarray:
        small = image.convert("RGB").resize((64, 64), Image.Resampling.BILINEAR)
        hsv = np.asarray(small.convert("HSV"), dtype=np.int64)
        hue, saturation, value = hsv[..., 0], hsv[..., 1], hsv[..., 2]
        chromatic = (saturation > 51) & (value > 38)
        bins = (hue * 12 // 256) * 4 + (saturation * 2 // 256) * 2 + value * 2 // 256
        color = np.bincount(bins[chromatic].ravel(), minlength=48).astype(np.float64)
        gray = np.bincount((value[~chromatic] * 4 // 256).ravel(), minlength=4).astype(np.float64)
        histogram = np.concatenate([color, gray])
        gy, gx = np.gradient(np.asarray(small.convert("L"), dtype=np.float64))
        angle = ((np.arctan2(gy, gx) + np.pi) / (2 * np.pi) * 8).astype(np.int64) % 8
        magnitude = np.hypot(gx, gy)
        cells = []
        for rows in (slice(0, 32), slice(32, 64)):
            for cols in (slice(0, 32), slice(32, 64)):
                cells.append(
                    np.bincount(angle[rows, cols].ravel(), magnitude[rows, cols].ravel(), 8)
                )
        edges = np.concatenate(cells)
        return np.concatenate(
            [
                np.sqrt(histogram / max(histogram.sum(), 1e-12)),
                0.5 * np.sqrt(edges / max(edges.sum(), 1e-12)),
            ]
        )

    def embed_images(self, images: list[Image.Image]) -> np.ndarray:
        if not images:
            return np.zeros((0, self.dim), dtype=np.float32)
        return normalize(np.stack([self._one(image) for image in images]))

    def embed_texts(self, texts: list[str]) -> np.ndarray:
        raise UserError(t("arama.metin_desteklenmiyor", model=self.name))

    def logit_scale(self) -> float:
        return 10.0


def _as_tensor(output: Any) -> Any:
    """transformers 4 tensör, transformers 5 `BaseModelOutputWithPooling` döndürür."""
    return output if hasattr(output, "shape") else output.pooler_output


class HfEmbedder:
    """CLIP / SigLIP / SigLIP 2 ailesi (transformers `AutoModel` + `AutoProcessor`)."""

    supports_text = True

    def __init__(self, model_id: str, batch: int = 16, revision: str | None = None) -> None:
        import torch
        from transformers import AutoModel, AutoProcessor

        try:
            self.model = AutoModel.from_pretrained(model_id, revision=revision, dtype=torch.float32)
            self.processor = AutoProcessor.from_pretrained(model_id, revision=revision)
        except (OSError, ValueError) as exc:
            detail = (str(exc).splitlines() or [type(exc).__name__])[0][:300]
            raise UserError(t("arama.model_yuklenemedi", model=model_id, ayrinti=detail)) from exc
        self.model.eval()
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model.to(self.device)
        self.name, self.batch = model_id, batch
        self.kind = str(getattr(self.model.config, "model_type", ""))
        self.dim = int(self.embed_texts(["."]).shape[1])

    def _run(self, method: str, inputs: Any) -> np.ndarray:
        import torch

        with torch.inference_mode():
            moved = {key: value.to(self.device) for key, value in inputs.items()}
            features = _as_tensor(getattr(self.model, method)(**moved))
        return normalize(features.float().cpu().numpy())

    def embed_images(self, images: list[Image.Image]) -> np.ndarray:
        chunks = []
        for start in range(0, len(images), self.batch):
            part = [image.convert("RGB") for image in images[start : start + self.batch]]
            inputs = self.processor(images=part, return_tensors="pt")
            chunks.append(self._run("get_image_features", inputs))
        return np.concatenate(chunks) if chunks else np.zeros((0, self.dim), np.float32)

    def embed_texts(self, texts: list[str]) -> np.ndarray:
        padding: dict[str, Any] = {"padding": True}
        if self.kind.startswith("siglip"):
            padding = {"padding": "max_length", "max_length": SIGLIP_TEXT_LENGTH}
        chunks = []
        for start in range(0, len(texts), self.batch):
            part = texts[start : start + self.batch]
            inputs = self.processor(text=part, return_tensors="pt", truncation=True, **padding)
            chunks.append(self._run("get_text_features", inputs))
        return np.concatenate(chunks) if chunks else np.zeros((0, 0), np.float32)

    def logit_scale(self) -> float:
        return float(self.model.logit_scale.exp().item())


def make_embedder(name: str = DEFAULT_EMBEDDER, batch: int = 16) -> Embedder:
    """Ad ya da Hugging Face kimliğinden gömme modeli kurar (ilk kullanımda indirilir)."""
    model_id = ALIASES.get(name, name)
    if model_id == HistogramEmbedder.name:
        return HistogramEmbedder()
    if model_id.startswith("histogram"):
        raise UserError(t("arama.model_surumu", dizin=model_id, model=HistogramEmbedder.name))
    return HfEmbedder(model_id, batch)


def embedder_for_index(model_name: str, batch: int = 16) -> Embedder:
    """Dizini kuran modelin AYNISINI yükler; ad/sürüm tutmazsa sessizce yanlış sonuç vermez, durur."""
    embedder = make_embedder(model_name, batch)
    if embedder.name != model_name:
        raise UserError(t("arama.model_surumu", dizin=model_name, model=embedder.name))
    return embedder
