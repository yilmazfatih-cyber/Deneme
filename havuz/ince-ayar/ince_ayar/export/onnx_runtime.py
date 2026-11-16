"""ONNX modelleriyle CPU çıkarımı — torch ve transformers **gerekmez** (onnxruntime + tokenizers +
numpy + paketin çekirdek bağımlılıkları). Bu modülü içe aktarmak torch'u yüklemez (test denetler).

Kim kullanır: `siniflandirma tahmin --onnx`, `siniflandirma degerlendir --onnx`, `gomme tahmin --onnx`.

Klasör içeriği (dışa aktarımın ürettiği): `model.onnx`, isteğe bağlı `model.int8.onnx`,
`tokenizer.json`, `onnx_bilgi.json` (azami uzunluk, dolgu belirteci, önekler) ve sınıflandırıcıda
`esik.json`.

Genişletme: yeni bir model türü için `OnnxEncoder` sınıfından türetin; `run` ham çıktıyı verir.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

from ince_ayar.errors import UserError
from ince_ayar.io_utils import read_json
from ince_ayar.messages import t
from ince_ayar.tasks.classification.thresholds import THRESHOLD_FILE, Thresholds

ONNX_DIR, INFO_FILE = (
    "onnx",
    "onnx_bilgi.json",
)  # export/onnx.py ile aynı (torch'suz kalsın diye kopya)
FP32_FILE, INT8_FILE = "model.onnx", "model.int8.onnx"


def find_onnx_dir(path: Path) -> Path:
    """Eğitim çıktı klasörü (`…/onnx` alt klasörü) ya da doğrudan ONNX klasörü verilebilir."""
    for candidate in (path / ONNX_DIR, path):
        if (candidate / FP32_FILE).is_file():
            return candidate
    raise UserError(t("onnx.klasor_yok", yol=path))


class OnnxEncoder:
    def __init__(self, path: Path, int8: bool = False, threads: int = 2) -> None:
        import onnxruntime
        from tokenizers import Tokenizer

        self.directory = find_onnx_dir(path)
        self.info: dict[str, Any] = read_json(self.directory / INFO_FILE)
        file_name = INT8_FILE if int8 else FP32_FILE
        if not (self.directory / file_name).is_file():
            raise UserError(t("onnx.dosya_yok", yol=self.directory / file_name))
        self.tokenizer = Tokenizer.from_file(str(self.directory / "tokenizer.json"))
        self.tokenizer.enable_truncation(max_length=int(self.info["azami_uzunluk"]))
        self.tokenizer.enable_padding(
            pad_id=int(self.info["dolgu_kimligi"]), pad_token=str(self.info["dolgu_belirteci"])
        )
        options = onnxruntime.SessionOptions()
        options.intra_op_num_threads = threads
        self.session = onnxruntime.InferenceSession(
            str(self.directory / file_name), options, providers=["CPUExecutionProvider"]
        )

    def run(self, texts: list[str]) -> np.ndarray:
        """Ham model çıktısı (logit ya da vektör), satır başına bir metin."""
        if not texts:
            return np.zeros((0, 0), dtype=np.float32)
        encodings = self.tokenizer.encode_batch(texts)
        ids = np.array([item.ids for item in encodings], dtype=np.int64)
        mask = np.array([item.attention_mask for item in encodings], dtype=np.int64)
        return np.asarray(self.session.run(None, {"input_ids": ids, "attention_mask": mask})[0])


def softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - logits.max(axis=-1, keepdims=True)
    exp = np.exp(shifted)
    return np.asarray(exp / exp.sum(axis=-1, keepdims=True))


class OnnxClassifier(OnnxEncoder):
    def __init__(self, path: Path, int8: bool = False, threads: int = 2) -> None:
        super().__init__(path, int8, threads)
        self.thresholds = Thresholds.load(self.directory)

    def probabilities(self, texts: list[str]) -> np.ndarray:
        return softmax(self.run(texts)) if texts else np.zeros((0, len(self.thresholds.labels)))

    def predict(self, texts: list[str]) -> list[str | None]:
        """Etiket kararları (`esik.json` kuralıyla; None: belirsiz)."""
        return self.thresholds.decide(self.probabilities(texts))


class OnnxEmbedder(OnnxEncoder):
    def encode_queries(self, texts: list[str]) -> np.ndarray:
        prefix = str(self.info.get("sorgu_oneki", ""))
        return self.run([prefix + text for text in texts])

    def encode_documents(self, texts: list[str]) -> np.ndarray:
        prefix = str(self.info.get("belge_oneki", ""))
        return self.run([prefix + text for text in texts])


__all__ = ["THRESHOLD_FILE", "OnnxClassifier", "OnnxEmbedder", "OnnxEncoder", "find_onnx_dir"]
