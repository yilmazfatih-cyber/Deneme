"""Arama testleri (ağsız): histogram gömmesi, dizin ekle/ara/kaydet/yükle, artımlı dizinleme, recall@k
(elle hesaplanmış örnekle), sıfır atışlı sınıflandırma (sahte metin kodlayıcıyla)."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from goruntu.arama.build import index_files
from goruntu.arama.embedders import HistogramEmbedder, _as_tensor, normalize
from goruntu.arama.evaluate import image_recall_at_k, text_hits_at_k
from goruntu.arama.index import ImageIndex, IndexItem
from goruntu.arama.zero_shot import label_vectors, zero_shot
from goruntu.errors import UserError
from goruntu.kopya.scan import list_images
from goruntu.synthetic import COLORS, shape_image


class KeywordEmbedder:
    """Sahte çok kipli model: görüntüyü baskın renginden, metni içindeki renk sözcüğünden kodlar."""

    name, dim, supports_text = "sahte", 4, True
    words = ("kırmızı", "yeşil", "mavi", "sarı")

    def embed_images(self, images: list[Image.Image]) -> np.ndarray:
        rows = []
        for image in images:
            pixels = np.asarray(image.convert("RGB"), dtype=float).reshape(-1, 3)
            saturated = pixels[(pixels.max(axis=1) - pixels.min(axis=1)) > 60].mean(axis=0)
            rows.append([-np.linalg.norm(saturated - np.asarray(c)) for c in COLORS.values()])
        scores = np.asarray(rows)
        return normalize(np.exp((scores - scores.max(axis=1, keepdims=True)) / 20))

    def embed_texts(self, texts: list[str]) -> np.ndarray:
        return normalize(
            np.asarray([[float(w in text) + 0.01 for w in self.words] for text in texts])
        )

    def logit_scale(self) -> float:
        return 50.0


def _color_set(per_color: int = 4) -> tuple[list[Image.Image], list[int]]:
    rng = np.random.default_rng(2)
    images, labels = [], []
    for index, color in enumerate(COLORS):
        for number in range(per_color):
            images.append(shape_image(("daire", "kare", "üçgen")[number % 3], color, rng, 64))
            labels.append(index)
    return images, labels


def test_histogram_gommesi_normlu_ve_renge_duyarli() -> None:
    images, labels = _color_set()
    vectors = HistogramEmbedder().embed_images(images)
    assert vectors.shape == (16, HistogramEmbedder.dim)
    assert np.allclose(np.linalg.norm(vectors, axis=1), 1.0, atol=1e-5)
    assert np.allclose(HistogramEmbedder().embed_images(images[:2]), vectors[:2])  # belirlenimci
    recall = image_recall_at_k(vectors, labels, ks=(1,))
    assert recall["recall@1"] >= 0.9
    with pytest.raises(UserError, match="metinle arama"):
        HistogramEmbedder().embed_texts(["kırmızı"])


def test_recall_elle_hesap() -> None:
    vectors = normalize(np.asarray([[1, 0], [0.9, 0.1], [0, 1], [0.2, 0.8]], dtype=float))
    # 0'ın en yakını 1 (aynı sınıf) → isabet; 2'nin en yakını 3 (farklı sınıf) → ıska
    result = image_recall_at_k(vectors, [0, 0, 1, 0], ks=(1, 3))
    assert result == {"recall@1": pytest.approx(0.5), "recall@3": pytest.approx(0.75)}
    hits = text_hits_at_k(vectors, [0, 0, 1, 0], normalize(np.asarray([[1.0, 0.0]])), [0], ks=(2,))
    assert hits == {"isabet@2": 1.0, "kesinlik@2": 1.0}


def test_dizin_ara_kaydet_yukle(tmp_path: Path) -> None:
    index = ImageIndex("sahte", 2)
    items = [IndexItem(kimlik=f"{i:016x}", yol=f"{i}.jpg") for i in range(3)]
    added = index.add(items, np.asarray([[1, 0], [0, 1], [1, 1]], dtype=float))
    assert (
        added == 3 and index.add(items[:1], np.asarray([[1.0, 0.0]])) == 0
    )  # aynı kimlik eklenmez
    results = index.search(np.asarray([1.0, 0.1]), k=2)
    assert [item.yol for item, _ in results] == ["0.jpg", "2.jpg"]
    assert [
        i.yol for i, _ in index.search(np.asarray([1.0, 0.1]), 5, exclude={items[0].kimlik})
    ] == [
        "2.jpg",
        "1.jpg",
    ]
    index.save(tmp_path / "dizin")
    loaded = ImageIndex.load(tmp_path / "dizin")
    assert len(loaded) == 3 and np.allclose(loaded.vectors, index.vectors)
    assert sorted(p.name for p in (tmp_path / "dizin").iterdir()) == ["dizin.json", "vektorler.npy"]
    with pytest.raises(UserError, match="boyutu tutmuyor"):
        loaded.search(np.asarray([1.0, 0.0, 0.0]))


def test_bozuk_dizin_yol_gosterir(tmp_path: Path) -> None:
    index = ImageIndex("sahte", 2)
    index.add([IndexItem(kimlik="a" * 16, yol="a.jpg")], np.asarray([[1.0, 0.0]]))
    index.save(tmp_path)
    np.save(tmp_path / "vektorler.npy", np.zeros((5, 2), dtype=np.float32))
    with pytest.raises(UserError, match="yeniden kurun"):
        ImageIndex.load(tmp_path)
    with pytest.raises(UserError, match="indeksle"):
        ImageIndex.load(tmp_path / "yok")


def test_klasorden_artimli_dizinleme(tmp_path: Path) -> None:
    images, _ = _color_set(2)
    for number, image in enumerate(images):
        image.save(tmp_path / f"{number}.png")
    (tmp_path / "bozuk.jpg").write_bytes(b"bozuk")
    (tmp_path / "ayni.png").write_bytes((tmp_path / "0.png").read_bytes())  # birebir kopya
    index = ImageIndex("histogram", HistogramEmbedder.dim)
    added, rejected = index_files(index, list_images(tmp_path), HistogramEmbedder(), batch=3)
    assert added == 8 and [path.name for path, _ in rejected] == ["bozuk.jpg"]
    again, _ = index_files(index, list_images(tmp_path), HistogramEmbedder())
    assert again == 0 and len(index) == 8


def test_sifir_atis_ve_istem_toplulugu() -> None:
    images, labels = _color_set(2)
    embedder = KeywordEmbedder()
    names = ["kırmızı", "yeşil", "mavi", "sarı"]
    probabilities = zero_shot(embedder, images, names, ["{} fotoğrafı", "bir {} görüntüsü"])
    assert probabilities.shape == (8, 4) and np.allclose(probabilities.sum(axis=1), 1.0)
    assert (probabilities.argmax(axis=1) == np.asarray(labels)).mean() == 1.0
    vectors = label_vectors(embedder, names, ["{}"])
    assert np.allclose(np.linalg.norm(vectors, axis=1), 1.0)


def test_eski_surum_dizin_acik_hatayla_reddedilir() -> None:
    from goruntu.arama.embedders import embedder_for_index

    assert embedder_for_index("histogram-v2").name == "histogram-v2"
    with pytest.raises(UserError, match="yeniden kurun"):
        embedder_for_index("histogram")  # eski (v1) tasarımla kurulmuş dizin


def test_transformers_5_cikti_nesnesi_kabul_edilir() -> None:
    class Output:
        pooler_output = np.ones((1, 3))

    assert _as_tensor(np.zeros((1, 3))).shape == (1, 3)
    assert _as_tensor(Output()).shape == (1, 3)
