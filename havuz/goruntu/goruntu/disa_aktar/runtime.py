"""ONNX çıkarımı — torch GEREKMEZ (onnxruntime + numpy + pillow). Bu modülü içe aktarmak torch'u
yüklemez (`tests/test_onnx.py` ayrı süreçte denetler). Başka bir uygulamaya gömmek için:

    from goruntu.disa_aktar.runtime import OnnxClassifier
    model = OnnxClassifier(Path("ciktilar/cpu-kucuk/paket/model.onnx"))
    sonuc = model.predict_files([Path("foto.jpg")])[0]   # sonuc.etiket None ise "emin değilim"

Kim kullanır: `tahmin --onnx`, `degerlendir --onnx`, sunucu (`POST /siniflandir`).
Ön işleme `hazirlik.model_input.prepare` — eğitimdekiyle AYNI işlev; görüntüler aynı güvenli
yükleyiciyle açılır (EXIF yönü, saydamlık, 16 bit…).

Genişletme: yeni bir çıktı (ör. gömme vektörü) gerekiyorsa grafiğe çıkış ekleyip burada `run`
sonucundan okuyun; paket üst verisinde (`bundle.py`) çıkış adını yazın.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from goruntu import console
from goruntu.disa_aktar.bundle import BundleMeta, find_onnx, from_session
from goruntu.errors import UserError
from goruntu.hazirlik.loader import DEFAULT_LIMITS, LoadLimits, Source, load_rgb
from goruntu.hazirlik.model_input import prepare_batch
from goruntu.messages import t
from goruntu.siniflandirma.calibration import Decision


@dataclass(frozen=True)
class Prediction:
    etiket: str | None  # None: "emin değilim"
    guven: float
    ilk: list[tuple[str, float]]  # en olası sınıflar (etiket, olasılık)

    def to_dict(self) -> dict[str, Any]:
        return {
            "etiket": self.etiket,
            "emin_degil": self.etiket is None,
            "guven": round(self.guven, 6),
            "ilk": [{"etiket": label, "olasilik": round(p, 6)} for label, p in self.ilk],
        }


def predictions_from(probabilities: np.ndarray, decision: Decision, top: int) -> list[Prediction]:
    decided = decision.decide(probabilities)
    results = []
    for row, label in zip(probabilities, decided, strict=True):
        order = np.argsort(-row)[:top]
        ranked = [(decision.labels[int(i)], float(row[int(i)])) for i in order]
        results.append(Prediction(label, float(row.max()), ranked))
    return results


class OnnxClassifier:
    """Tek dosyalık paketten sınıflandırıcı (üst veri ONNX'in içinde)."""

    def __init__(self, path: Path, int8: bool = False, threads: int = 2) -> None:
        import onnxruntime

        self.path = find_onnx(path, int8)
        options = onnxruntime.SessionOptions()
        options.intra_op_num_threads = threads
        options.inter_op_num_threads = 1
        try:
            self.session = onnxruntime.InferenceSession(
                str(self.path), options, providers=["CPUExecutionProvider"]
            )
        except Exception as exc:  # bozuk ya da uyumsuz dosya
            raise UserError(t("paket.acilamadi", yol=self.path, ayrinti=str(exc)[:300])) from exc
        self.meta: BundleMeta = from_session(self.session, self.path)
        if self.meta.dogrulama.get("int8_onerilmez"):
            console.warn(t("paket.int8_onerilmez", yol=self.path))
        self.decision = Decision(self.meta.etiketler, self.meta.sicaklik, self.meta.esik)

    @property
    def labels(self) -> list[str]:
        return self.meta.etiketler

    def logits(self, images: list[Image.Image]) -> np.ndarray:
        """Ham logitler (N, sınıf). Görüntüler RGB olmalı (bkz. `load_rgb`)."""
        if not images:
            return np.zeros((0, len(self.labels)), dtype=np.float32)
        batch = prepare_batch(images, self.meta.on_isleme)
        outputs = self.session.run([self.meta.cikti_adlari[0]], {self.meta.girdi_adi: batch})
        return np.asarray(outputs[0])

    def predict(self, images: list[Image.Image], top: int = 3) -> list[Prediction]:
        probabilities = self.decision.probabilities(self.logits(images))
        return predictions_from(probabilities, self.decision, top)

    def predict_files(
        self, sources: Sequence[Source], limits: LoadLimits = DEFAULT_LIMITS, top: int = 3
    ) -> list[Prediction]:
        return self.predict([load_rgb(source, limits) for source in sources], top)
