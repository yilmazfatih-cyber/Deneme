"""PyTorch → ONNX: tek dosyalık paket, isteğe bağlı int8 dinamik nicemleme, eşdeğerlik ölçümü.

Kim kullanır: `python -m goruntu disa-aktar`.

Kararlar (ayrıntı: docs/KARARLAR.md K07, K08):
- `torch.onnx.export(..., dynamo=True)` (torch.export tabanlı; ince-ayar temelinde de seçilen yol).
  `external_data=False`: aksi hâlde ağırlıklar yanında ayrı `.onnx.data` dosyasına yazılır (ölçüldü)
  ve "tek dosya" bozulur.
- Giriş uint8 NHWC, yığın ekseni dinamik (1 görüntü de çalışır, testli). Çıkışlar `logit`, `olasilik`.
- Eşdeğerlik: aynı ön işlemeden geçmiş örneklerde PyTorch ve onnxruntime logitleri karşılaştırılır;
  en büyük fark ve karar uyumu `paket.json` → `dogrulama` alanına yazılır. 1e-4'ü aşarsa UYARI.
- int8: onnxruntime `quantize_dynamic`, YALNIZ MatMul/Gemm (evrişimler bozuluyordu, ölçüldü). %20'den
  az küçültüyorsa (evrişimli ağlar) int8 dosyası yazılmaz; karar uyumu %98'in altındaysa "önerilmez".

Genişletme: başka bir nicemleme (statik, ölçüm verili) eklenecekse `quantize_int8` yanına yeni işlev
yazın; sonucu `paket.json`'a aynı biçimde (`*_karar_uyumu`) kaydedin.
"""

from __future__ import annotations

import contextlib
import io
import logging
import tempfile
import warnings
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from goruntu import console
from goruntu.disa_aktar.bundle import (
    BUNDLE_DIR,
    FP32_FILE,
    INPUT_NAME,
    INT8_FILE,
    JSON_FILE,
    LOGITS_NAME,
    PROBS_NAME,
    BundleMeta,
    embed,
)
from goruntu.hazirlik.model_input import InputSpec, prepare_batch
from goruntu.io_utils import write_json
from goruntu.messages import t

PARITY_TOLERANCE = 1e-4
INT8_OPS = ["MatMul", "Gemm"]
INT8_MIN_SAVING = (
    0.2  # int8 dosyası en az %20 küçük değilse yazılmaz (evrişimli ağlarda kazanç yok)
)
INT8_MIN_AGREEMENT = 0.98  # karar uyumu bunun altındaysa paket "önerilmez" diye işaretlenir


def _wrapper(model: Any, temperature: float) -> Any:
    import torch

    class ExportWrapper(torch.nn.Module):
        def __init__(self) -> None:
            super().__init__()
            self.model = model

        def forward(self, images: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
            logits = self.model(images)
            return logits, torch.softmax(logits / temperature, dim=-1)

    return ExportWrapper().eval()


def export_onnx(module: Any, example: np.ndarray, target: Path) -> Path:
    """Sarmalayıcıyı tek dosyalık ONNX olarak yazar (yığın ekseni dinamik)."""
    import torch

    target.parent.mkdir(parents=True, exist_ok=True)
    exporter_log = logging.getLogger("torch.onnx")
    previous = exporter_log.level
    exporter_log.setLevel(logging.ERROR)
    try:
        with torch.no_grad(), warnings.catch_warnings(), contextlib.redirect_stdout(io.StringIO()):
            warnings.simplefilter("ignore")
            torch.onnx.export(
                module,
                (torch.from_numpy(example),),
                str(target),
                input_names=[INPUT_NAME],
                output_names=[LOGITS_NAME, PROBS_NAME],
                dynamic_shapes={"images": {0: torch.export.Dim("yigin")}},
                dynamo=True,
                external_data=False,
                verbose=False,
            )
    finally:
        exporter_log.setLevel(previous)
    return target


def quantize_int8(source: Path, target: Path) -> Path:
    """Dinamik int8 nicemleme (yalnız MatMul/Gemm); şekil ön işlemi olmazsa doğrudan nicemlenir.

    Evrişimler (Conv) BİLEREK nicemlenmez: MobileNetV3'te evrişimleri dinamik nicemlemek karar uyumunu
    %40'a düşürdü (kanal başına da; ölçüm docs/DENEME_KAYDI.md). Dönüştürücülerde (ViT) ağırlığın
    çoğu MatMul'dadır, kazanç orada.
    """
    from onnxruntime.quantization import QuantType, quantize_dynamic

    logging.disable(
        logging.WARNING
    )  # nicemleyici uint8 girdiyi "nicemlenemez" diye uzun uzun yazar
    try:
        with tempfile.TemporaryDirectory() as scratch:
            prepared = Path(scratch) / "hazir.onnx"
            start = source
            try:
                from onnxruntime.quantization.shape_inference import quant_pre_process

                quant_pre_process(str(source), str(prepared), skip_symbolic_shape=True)
                start = prepared
            except Exception as exc:  # ön işlem isteğe bağlıdır
                console.warn(t("onnx.on_islem_atlandi", ayrinti=str(exc).splitlines()[0][:200]))
            quantize_dynamic(
                str(start), str(target), weight_type=QuantType.QInt8, op_types_to_quantize=INT8_OPS
            )
    finally:
        logging.disable(logging.NOTSET)
    return target


def _onnx_logits(path: Path, batch: np.ndarray) -> np.ndarray:
    import onnxruntime

    session = onnxruntime.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    return np.asarray(session.run([LOGITS_NAME], {INPUT_NAME: batch})[0])


def export_classifier(
    model_dir: Path, out_dir: Path | None, int8: bool, samples: list[Image.Image]
) -> dict[str, Any]:
    """Eğitilmiş modeli paketler; `paket.json` içeriğini (doğrulama sonuçlarıyla) döndürür."""
    import torch

    from goruntu.siniflandirma.model import find_model_dir, load_checkpoint

    model, meta = load_checkpoint(model_dir)
    spec = InputSpec.model_validate(meta["on_isleme"])
    target_dir = out_dir or find_model_dir(model_dir).parent / BUNDLE_DIR
    batch = prepare_batch(samples, spec) if samples else _noise_batch(spec)
    wrapper = _wrapper(model, float(meta.get("sicaklik", 1.0)))
    fp32 = export_onnx(wrapper, batch[:2], target_dir / FP32_FILE)
    with torch.inference_mode():
        reference = wrapper(torch.from_numpy(batch))[0].numpy()
    exported = _onnx_logits(fp32, batch)
    difference = float(np.abs(exported - reference).max())
    checks: dict[str, Any] = {
        "ornek": int(batch.shape[0]),
        "fp32_en_buyuk_fark": difference,
        "fp32_karar_uyumu": _agreement(exported, reference),
    }
    if difference > PARITY_TOLERANCE:
        console.warn(t("onnx.fark_buyuk", fark=f"{difference:.2e}"))
    bundle = BundleMeta(
        etiketler=meta["etiketler"],
        on_isleme=spec,
        sicaklik=float(meta.get("sicaklik", 1.0)),
        esik=float(meta.get("esik", 0.0)),
        taban=str(meta.get("taban", "")),
        mimari=str(meta.get("mimari", "")),
        olusturma_tarihi=datetime.now(UTC).isoformat(timespec="seconds"),
    )
    (target_dir / INT8_FILE).unlink(missing_ok=True)  # eski bir int8 dosyası yanlışlıkla kalmasın
    if int8:
        checks.update(_add_int8(fp32, target_dir / INT8_FILE, batch, reference, bundle, checks))
    bundle = bundle.model_copy(update={"dogrulama": checks})
    embed(fp32, bundle)
    payload = bundle.model_dump(mode="json")
    write_json(target_dir / JSON_FILE, payload)
    return {"klasor": str(target_dir), **payload}


def _add_int8(
    fp32: Path,
    target: Path,
    batch: np.ndarray,
    reference: np.ndarray,
    bundle: BundleMeta,
    checks: dict[str, Any],
) -> dict[str, Any]:
    """int8 sürümünü üretir ve ölçer; kazanç yoksa siler, uyum düşükse "önerilmez" işaretler."""
    quantized = quantize_int8(fp32, target)
    saving = 1.0 - quantized.stat().st_size / fp32.stat().st_size
    if saving < INT8_MIN_SAVING:
        quantized.unlink()
        console.warn(t("onnx.int8_kazanc_yok", oran=f"{saving:.0%}"))
        return {"int8": "atlandi", "int8_kuculme": round(saving, 4)}
    logits = _onnx_logits(quantized, batch)
    agreement = _agreement(logits, reference)
    result: dict[str, Any] = {
        "int8": "yazildi",
        "int8_kuculme": round(saving, 4),
        "int8_en_buyuk_fark": float(np.abs(logits - reference).max()),
        "int8_karar_uyumu": agreement,
        "int8_onerilmez": agreement < INT8_MIN_AGREEMENT,
    }
    if result["int8_onerilmez"]:
        console.warn(t("onnx.int8_uyum_dusuk", uyum=f"{agreement:.1%}"))
    embed(
        quantized,
        bundle.model_copy(update={"nicemleme": "int8-dinamik", "dogrulama": {**checks, **result}}),
    )
    return result


def _agreement(left: np.ndarray, right: np.ndarray) -> float:
    return float(np.mean(left.argmax(axis=1) == right.argmax(axis=1))) if len(left) else 1.0


def _noise_batch(spec: InputSpec) -> np.ndarray:
    """Örnek görüntü yoksa tohumlu gürültüden 4 girdi (yalnız grafiği kurmak ve sınamak için)."""
    rng = np.random.default_rng(0)
    return rng.integers(0, 256, size=(4, spec.yukseklik, spec.genislik, 3), dtype=np.uint8)
