"""ONNX'e aktarım: kodlayıcı modelleri (sınıflandırıcı, gömme, varlık tanıma) tek girişli bir
sarmalayıcıyla dışa aktarır, isteğe bağlı int8 nicemler ve PyTorch çıktısıyla karşılaştırır.

Kim kullanır: `siniflandirma disa-aktar`, `gomme disa-aktar`, `varlik disa-aktar`.

Kararlar (ayrıntı: `docs/KARARLAR.md`):
- PyTorch 2.9+ ile gelen `torch.export` tabanlı aktarıcı (`dynamo=True`) kullanılır. Eski TorchScript
  aktarıcısı transformers 5'in maske kodunu sabit sayıp dolgulu girdide sapma üretiyordu (ölçüldü).
- Girdiler: `input_ids`, `attention_mask` (int64), yığın ve uzunluk eksenleri dinamik.
- 2 GB'tan küçük modeller tek dosyaya yazılır (`external_data=False`).
- int8: onnxruntime dinamik nicemleme (`quantize_dynamic`, QInt8 ağırlık); önce şekil çıkarımı
  (`quant_pre_process`) denenir.

Genişletme: yeni bir çıktı türü için `Wrapper` sınıfına benzer bir sarmalayıcı yazıp
`export_encoder` çağrısına verin.
"""

from __future__ import annotations

import contextlib
import io
import logging
import tempfile
import warnings
from collections.abc import Callable
from pathlib import Path
from typing import Any

from ince_ayar import console
from ince_ayar.messages import t

TWO_GB = 2 * 1024**3
INPUT_NAMES = ["input_ids", "attention_mask"]
ONNX_DIR, INFO_FILE = "onnx", "onnx_bilgi.json"
FP32_FILE, INT8_FILE = "model.onnx", "model.int8.onnx"


def make_wrapper(model: Any, forward: Callable[[Any, Any, Any], Any]) -> Any:
    """`forward(model, input_ids, attention_mask) -> tensör` işlevini bir `nn.Module` içine sarar.

    Model alt modül olarak kaydedilir ki ağırlıklar ONNX dosyasına başlangıç değeri olarak yazılsın.
    """
    import torch

    class Wrapper(torch.nn.Module):
        def __init__(self) -> None:
            super().__init__()
            self.model = model

        def forward(self, input_ids: Any, attention_mask: Any) -> Any:
            return forward(self.model, input_ids, attention_mask)

    return Wrapper().eval()


def export_encoder(
    module: Any, tokenizer: Any, out_path: Path, output_name: str, samples: list[str]
) -> Path:
    """`make_wrapper` ile kurulmuş sarmalayıcıyı ONNX'e yazar."""
    import torch

    encoded = tokenizer(samples[:2] or ["örnek"], padding=True, return_tensors="pt")
    batch, length = torch.export.Dim("yigin"), torch.export.Dim("uzunluk")
    size = sum(p.numel() * p.element_size() for p in module.parameters())
    out_path.parent.mkdir(parents=True, exist_ok=True)
    exporter_log = logging.getLogger("torch.onnx")
    previous_level = exporter_log.level
    exporter_log.setLevel(logging.ERROR)  # torchvision kayıt uyarıları gibi gürültüyü kıs
    with torch.no_grad(), warnings.catch_warnings(), contextlib.redirect_stdout(io.StringIO()):
        warnings.simplefilter("ignore")
        torch.onnx.export(
            module,
            (encoded["input_ids"], encoded["attention_mask"]),
            str(out_path),
            input_names=INPUT_NAMES,
            output_names=[output_name],
            dynamic_shapes={
                "input_ids": {0: batch, 1: length},
                "attention_mask": {0: batch, 1: length},
            },
            dynamo=True,
            external_data=size >= TWO_GB,
            verbose=False,
        )
    exporter_log.setLevel(previous_level)
    return out_path


def quantize_int8(source: Path, target: Path) -> Path:
    """Dinamik int8 nicemleme. Ön işlem başarısız olursa doğrudan nicemlenir."""
    from onnxruntime.quantization import QuantType, quantize_dynamic

    with tempfile.TemporaryDirectory() as scratch:
        prepared = Path(scratch) / "hazir.onnx"
        try:
            from onnxruntime.quantization.shape_inference import quant_pre_process

            quant_pre_process(str(source), str(prepared), skip_symbolic_shape=True)
            start = prepared
        except Exception as exc:  # ön işlem isteğe bağlıdır
            console.warn(t("onnx.on_islem_atlandi", ayrinti=str(exc).splitlines()[0][:200]))
            start = source
        quantize_dynamic(str(start), str(target), weight_type=QuantType.QInt8)
    return target


def bundle_info(tokenizer: Any, task: str, max_length: int, **extra: Any) -> dict[str, Any]:
    """`onnx_bilgi.json` içeriği: çalışma zamanının tokenizer'ı doğru kurması için gerekenler."""
    return {
        "gorev": task,
        "azami_uzunluk": max_length,
        "dolgu_belirteci": tokenizer.pad_token,
        "dolgu_kimligi": tokenizer.pad_token_id,
        "girdiler": INPUT_NAMES,
        **extra,
    }


def max_difference(left: Any, right: Any) -> float:
    import numpy as np

    return float(
        np.abs(np.asarray(left, dtype=np.float64) - np.asarray(right, dtype=np.float64)).max()
    )
