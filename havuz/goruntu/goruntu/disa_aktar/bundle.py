"""Çıkarım paketi üst verisi: şema, ONNX dosyasına gömme ve okuma.

Kim kullanır: `onnx_export.py` (yazar), `runtime.py` (okur), sunucu.

"Tek dosyalık paket": etiketler, ön işleme ayarı (`InputSpec`), sıcaklık ve "emin değilim" eşiği
ONNX modelinin `metadata_props` alanına `goruntu.paket` anahtarıyla JSON olarak yazılır. Uygulamaya
yalnız `model.onnx` kopyalamak yeter. onnxruntime bunu `get_modelmeta().custom_metadata_map` ile verir.
Ağ girişi: `goruntu` = uint8 (N, yükseklik, genişlik, 3) RGB; çıkışlar: `logit` (ham) ve `olasilik`
(= softmax(logit / sıcaklık), kalibre). Normalleştirme grafiğin içindedir.

Genişletme: pakete yeni alan eklerken `FORMAT_VERSION`'ı artırın, alanı isteğe bağlı (varsayılanlı)
yazın ki eski paketler okunabilsin; `tests/test_onnx.py` içine okuma testi ekleyin.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from goruntu.errors import UserError, explain_validation_error
from goruntu.hazirlik.model_input import INPUT_LAYOUT, InputSpec
from goruntu.messages import t

BUNDLE_KEY = "goruntu.paket"
FORMAT_VERSION = 1
INPUT_NAME, LOGITS_NAME, PROBS_NAME = "goruntu", "logit", "olasilik"
FP32_FILE, INT8_FILE, JSON_FILE, BUNDLE_DIR = "model.onnx", "model.int8.onnx", "paket.json", "paket"


class BundleMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    bicim: int = FORMAT_VERSION
    gorev: Literal["siniflandirma"] = "siniflandirma"
    etiketler: list[str] = Field(min_length=2)
    on_isleme: InputSpec
    sicaklik: float = Field(1.0, gt=0.0)
    esik: float = Field(0.0, ge=0.0, le=1.0)
    taban: str = ""
    mimari: str = ""
    girdi: str = INPUT_LAYOUT
    girdi_adi: str = INPUT_NAME
    cikti_adlari: list[str] = Field(default_factory=lambda: [LOGITS_NAME, PROBS_NAME])
    nicemleme: Literal["yok", "int8-dinamik"] = "yok"
    olusturma_tarihi: str = ""
    dogrulama: dict[str, Any] = Field(default_factory=dict)


def embed(onnx_path: Path, meta: BundleMeta) -> None:
    """Üst veriyi ONNX dosyasına yazar (var olan aynı anahtar değiştirilir)."""
    import onnx

    model = onnx.load(str(onnx_path))
    kept = [prop for prop in model.metadata_props if prop.key != BUNDLE_KEY]
    del model.metadata_props[:]
    model.metadata_props.extend(kept)
    entry = model.metadata_props.add()
    entry.key = BUNDLE_KEY
    entry.value = meta.model_dump_json()
    onnx.save(model, str(onnx_path))


def parse(text: str, source: Path | str) -> BundleMeta:
    try:
        return BundleMeta.model_validate(json.loads(text))
    except (json.JSONDecodeError, ValidationError) as exc:
        detail = (
            "; ".join(explain_validation_error(exc))
            if isinstance(exc, ValidationError)
            else str(exc)
        )
        raise UserError(t("paket.bozuk", yol=source, ayrinti=detail)) from exc


def from_session(session: Any, path: Path) -> BundleMeta:
    """onnxruntime oturumundan üst veri; yoksa yanındaki `paket.json`."""
    custom = session.get_modelmeta().custom_metadata_map
    if BUNDLE_KEY in custom:
        return parse(custom[BUNDLE_KEY], path)
    sidecar = path.parent / JSON_FILE
    if sidecar.is_file():
        return parse(sidecar.read_text(encoding="utf-8"), sidecar)
    raise UserError(t("paket.ust_veri_yok", yol=path))


def find_onnx(path: Path, int8: bool = False) -> Path:
    """`.onnx` dosyası, paket klasörü ya da eğitim çıktı klasörü (`…/paket/`) verilebilir."""
    name = INT8_FILE if int8 else FP32_FILE
    if path.is_file() and path.suffix == ".onnx":
        return path
    for candidate in (path / name, path / BUNDLE_DIR / name):
        if candidate.is_file():
            return candidate
    raise UserError(t("paket.bulunamadi", yol=path, dosya=name))
