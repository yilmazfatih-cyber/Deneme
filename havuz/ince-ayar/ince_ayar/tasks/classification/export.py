"""Eğitilmiş sınıflandırıcıyı ONNX'e (ve int8'e) aktarır, PyTorch çıktısıyla karşılaştırır.

Kim kullanır: `python -m ince_ayar siniflandirma disa-aktar`.

Çıktı (`<cikti>/onnx/`): `model.onnx`, `model.int8.onnx`, `tokenizer.json`, `esik.json`,
`onnx_bilgi.json` (azami uzunluk, dolgu belirteci ve doğrulama sonuçları: en büyük olasılık farkı,
int8'in PyTorch kararlarıyla uyuşma oranı). Klasör tek başına taşınabilir; çıkarım için
`ince_ayar/export/onnx_runtime.py` + onnxruntime + tokenizers yeter.

Genişletme: GPU için `onnxruntime-gpu` ile çalıştırmak isterseniz `export/onnx_runtime.py` içindeki
`providers` listesini değiştirin (bu makinede denenmedi).
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
from ince_ayar.export.onnx_runtime import OnnxClassifier
from ince_ayar.io_utils import write_json
from ince_ayar.messages import t
from ince_ayar.tasks.classification.modeling import load_trained, predict_proba

DEFAULT_SAMPLES = [
    "Kargom hâlâ gelmedi, ne zaman ulaşır?",
    "İade işlemim tamamlandı mı?",
    "Faturamı e-posta ile alabilir miyim?",
    "ŞİFREMİ UNUTTUM, İSTANBUL ŞUBESİNİ ARADIM.",
]


def _logits(model: Any, input_ids: Any, attention_mask: Any) -> Any:
    return model(input_ids=input_ids, attention_mask=attention_mask).logits


def export_classifier(
    model_path: Path, out_dir: Path, int8: bool, max_length: int, samples: list[str] | None = None
) -> dict[str, Any]:
    """Dışa aktarır, doğrular ve `onnx_bilgi.json` içeriğini döndürür."""
    model, tokenizer, thresholds = load_trained(model_path)
    texts = (samples or []) + DEFAULT_SAMPLES
    out_dir.mkdir(parents=True, exist_ok=True)
    console.info(t("onnx.aktariliyor", yol=out_dir / FP32_FILE))
    export_encoder(make_wrapper(model, _logits), tokenizer, out_dir / FP32_FILE, "logits", texts)
    tokenizer.save_pretrained(str(out_dir))
    thresholds.save(out_dir)
    info = bundle_info(tokenizer, "siniflandirma", max_length, etiketler=thresholds.labels)
    write_json(out_dir / INFO_FILE, info)
    reference = predict_proba(model, tokenizer, texts, max_length)
    exported = OnnxClassifier(out_dir).probabilities(texts)
    info["fp32_en_buyuk_fark"] = max_difference(reference, exported)
    if int8:
        quantize_int8(out_dir / FP32_FILE, out_dir / INT8_FILE)
        quantized = OnnxClassifier(out_dir, int8=True).probabilities(texts)
        info["int8_en_buyuk_fark"] = max_difference(reference, quantized)
        info["int8_karar_uyumu"] = float((quantized.argmax(1) == reference.argmax(1)).mean())
    write_json(out_dir / INFO_FILE, info)
    console.result(t("onnx.bitti", yol=out_dir, fark=f"{info['fp32_en_buyuk_fark']:.2e}"))
    if int8:
        console.result(
            t(
                "onnx.int8_sonuc",
                fark=f"{info['int8_en_buyuk_fark']:.2e}",
                uyum=f"{info['int8_karar_uyumu']:.0%}",
            )
        )
    return info
