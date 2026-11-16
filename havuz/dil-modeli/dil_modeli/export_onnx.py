"""ONNX dışa aktarımı (isteğe bağlı): kimliklerden logit hesaplayan çizge.

Çizge önbelleksizdir: girdi `ids` (yığın x uzunluk, int64), çıktı `logits` (yığın x uzunluk x
sözlük). Yığın 1-64, uzunluk 2-bağlam arasında serbesttir. Üretim için her adımda bütün dizi
yeniden verilir (KV önbelleği yok); hızlı üretim için tarayıcı ya da GGUF yolunu kullanın.
Gerekenler: `pip install -e ".[onnx]"` (onnx, onnxruntime, onnxscript).
Eşlik testi: tests/test_export_onnx.py (`onnxruntime` logitleri PyTorch ile aynı).

Genişletme: KV önbellekli ONNX gerekiyorsa önbelleği girdi/çıktı yapan ayrı bir sarmalayıcı yazın.
"""

from __future__ import annotations

from pathlib import Path

import torch
from torch import Tensor, nn

from .model import LanguageModel
from .tokenizer_api import Tokenizer

SINGLE_FILE_LIMIT = 1_800_000_000  # protobuf 2 GB sınırının altı; üstünde ağırlıklar ayrı dosyada


class _Logits(nn.Module):
    """Önbelleksiz ileri geçiş: ids -> logits (dışa aktarılan çizge)."""

    def __init__(self, model: LanguageModel) -> None:
        super().__init__()
        self.model = model

    def forward(self, ids: Tensor) -> Tensor:
        logits: Tensor = self.model(ids)
        return logits


def export_onnx(model: LanguageModel, tokenizer: Tokenizer, out_dir: str | Path) -> Path:
    """`model.onnx` (+ büyük modelde `model.onnx.data`) ve `tokenizer.json` yazar."""
    try:
        import onnxscript  # noqa: F401  (torch.onnx'un dynamo yolu bunu ister)
    except ImportError:
        raise RuntimeError('ONNX için ek paketler gerekli: pip install -e ".[onnx]"') from None
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    path = out / "model.onnx"
    example = torch.tensor([[tokenizer.bos_id, *tokenizer.encode("Merhaba dünya")]])
    batch = torch.export.Dim("yigin", min=1, max=64)
    length = torch.export.Dim("uzunluk", min=2, max=model.config.max_seq_len)
    torch.onnx.export(
        _Logits(model).eval(),
        (example,),
        str(path),
        dynamo=True,
        input_names=["ids"],
        output_names=["logits"],
        dynamic_shapes={"ids": {0: batch, 1: length}},
        opset_version=18,
        external_data=model.num_parameters() * 4 > SINGLE_FILE_LIMIT,
        verbose=False,
    )
    tokenizer.save(out / "tokenizer.json")
    return path
