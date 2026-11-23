"""Sıfır atışlı sınıflandırma: eğitim yapmadan, etiket adlarından kurulan istemlerle sınıf seçme.

Kim kullanır: `sifir-atis`, `arama-olc` komutları.

Yöntem: her etiket için istem şablonlarından ("{} fotoğrafı", "a photo of a {}.") metin gömmeleri
alınır, ortalaması normlanır (istem topluluğu). Görüntü gömmesiyle kosinüs benzerliği modelin kendi
ölçeğiyle (`logit_scale`) çarpılıp softmax uygulanır. SigLIP aslında sigmoid'le eğitildi; burada
karşılaştırılabilirlik için hepsinde softmax kullanılır — olasılıklar kalibre DEĞİLDİR, sıralama
anlamlıdır.
Türkçe şablon yalnız çok dilli metin kodlayıcılı modelde (SigLIP 2) anlamlıdır; CLIP'te İngilizce
şablon ve İngilizce etiket kullanın. Sonuçlar: docs/DENEME_KAYDI.md.

Genişletme: yeni dil için `TEMPLATES` sözlüğüne şablon listesi ekleyin (`{}` etiketin yeri).
"""

from __future__ import annotations

import numpy as np
from PIL import Image

from goruntu.arama.embedders import Embedder, normalize
from goruntu.siniflandirma.calibration import softmax

TEMPLATES: dict[str, list[str]] = {
    "tr": ["{} fotoğrafı", "bir {} görüntüsü"],
    "en": ["a photo of a {}.", "an image of a {}."],
}


def label_vectors(embedder: Embedder, labels: list[str], templates: list[str]) -> np.ndarray:
    """Her etiket için şablonlu metin gömmelerinin normlu ortalaması: (etiket, boyut)."""
    prompts = [template.format(label) for label in labels for template in templates]
    vectors = embedder.embed_texts(prompts).reshape(len(labels), len(templates), -1)
    return normalize(vectors.mean(axis=1))


def zero_shot(
    embedder: Embedder, images: list[Image.Image], labels: list[str], templates: list[str]
) -> np.ndarray:
    """(görüntü, etiket) olasılık matrisi: softmax(ölçek × kosinüs)."""
    image_vectors = embedder.embed_images(images)
    scores = image_vectors @ label_vectors(embedder, labels, templates).T
    return softmax(scores * embedder.logit_scale())
