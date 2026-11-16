"""Gömme modelini ONNX'e (ve int8'e) aktarır; sentence-transformers çıktısıyla karşılaştırır.

Kim kullanır: `python -m ince_ayar gomme disa-aktar`.

Aktarılan çizge: belirteçler → kodlayıcı → havuzlama (→ normalleştirme, modelde varsa). Yani ONNX
çıktısı `model.encode` ile aynı vektördür; önekler `onnx_bilgi.json` içinde saklanır ve
`OnnxEmbedder` onları kendisi ekler.

Genişletme: Matryoshka gibi kırpılmış boyut gerekiyorsa çıktıyı `OnnxEmbedder` içinde kesin.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ince_ayar import console
from ince_ayar.export.onnx import (
    FP32_FILE,
    INFO_FILE,
    INT8_FILE,
    bundle_info,
    export_encoder,
    make_wrapper,
    max_difference,
    quantize_int8,
)
from ince_ayar.export.onnx_runtime import OnnxEmbedder
from ince_ayar.io_utils import write_json
from ince_ayar.messages import t
from ince_ayar.tasks.encoder_base import find_trained_dir

DEFAULT_SAMPLES = ["kargo kaç günde gelir", "İADE SÜRESİ NE KADAR?", "Fatura adresi nasıl değişir?"]


def _embedding(model: Any, input_ids: Any, attention_mask: Any) -> Any:
    return model({"input_ids": input_ids, "attention_mask": attention_mask})["sentence_embedding"]


def export_embedder(
    model_path: Path,
    out_dir: Path,
    int8: bool,
    query_prefix: str,
    document_prefix: str,
    samples: list[str] | None = None,
) -> dict[str, Any]:
    """Dışa aktarır, doğrular ve `onnx_bilgi.json` içeriğini döndürür."""
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(str(find_trained_dir(model_path)), device="cpu").eval()
    tokenizer = model.tokenizer
    texts = (samples or []) + DEFAULT_SAMPLES
    out_dir.mkdir(parents=True, exist_ok=True)
    console.info(t("onnx.aktariliyor", yol=out_dir / FP32_FILE))
    export_encoder(make_wrapper(model, _embedding), tokenizer, out_dir / FP32_FILE, "vektor", texts)
    tokenizer.save_pretrained(str(out_dir))
    info = bundle_info(
        tokenizer,
        "gomme",
        int(model.max_seq_length or tokenizer.model_max_length),
        sorgu_oneki=query_prefix,
        belge_oneki=document_prefix,
    )
    write_json(out_dir / INFO_FILE, info)
    reference = model.encode([query_prefix + text for text in texts], convert_to_numpy=True)
    info["fp32_en_buyuk_fark"] = max_difference(
        reference, OnnxEmbedder(out_dir).encode_queries(texts)
    )
    if int8:
        quantize_int8(out_dir / FP32_FILE, out_dir / INT8_FILE)
        quantized = OnnxEmbedder(out_dir, int8=True).encode_queries(texts)
        info["int8_en_buyuk_fark"] = max_difference(reference, quantized)
    write_json(out_dir / INFO_FILE, info)
    console.result(t("onnx.bitti", yol=out_dir, fark=f"{info['fp32_en_buyuk_fark']:.2e}"))
    return info
