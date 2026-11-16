"""Tarayıcı için dışa aktarım (dışa aktarım (c)): tek ikili dosya + bildirim + tokenizer.

Klasör: `manifest.json` (model biçimi, her tensörün yeri/türü, SHA-256), `model.bin`,
`tokenizer.json`. Türler:
    float32  kayıpsız
    float16  yarı boyut, kayıp ihmal edilebilir
    int8     dörtte bir boyut; her matris satırı kendi ölçeğiyle simetrik nicemlenir:
             ölçek = max|satır| / 127, q = yuvarla(w / ölçek), w ~= q * ölçek
Bir boyutlu tensörler (RMSNorm) her zaman float32 kalır. Her tensör 4 bayta hizalıdır, böylece
JavaScript doğrudan `Float32Array` / `Int8Array` görünümü açabilir (`tarayici/model.js`).
`load_web` aynı dosyayı PyTorch modeline geri yükler: nicemlemenin kalite kaybını ölçmek ve
JS eşlik vektörlerini üretmek için.

Genişletme: Yeni bir tür (ör. int4) için `_encode`/`_decode` çiftine dal ekleyin, JS tarafında
`tarayici/model.js` içindeki `decodeTensor`e karşılığını yazın; eşlik testleri bunu denetler.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
import torch

from .config import ModelConfig
from .model import LanguageModel
from .model_io import load_tensors, model_tensors
from .tokenizer import ASSISTANT, END_OF_TURN, SYSTEM, USER, BPETokenizer
from .tokenizer_api import Tokenizer, load_tokenizer

FORMAT = "dil-modeli-tarayici/1"
DTYPES = ("float32", "float16", "int8")
MANIFEST, BINARY, TOKENIZER = "manifest.json", "model.bin", "tokenizer.json"


def quantize_rows(weight: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Satır başına simetrik int8 nicemleme -> (int8 değerler, float32 ölçekler)."""
    scales = np.abs(weight).max(axis=1) / 127.0
    scales = np.where(scales == 0, 1.0, scales).astype(np.float32)
    values = np.clip(np.rint(weight / scales[:, None]), -127, 127).astype(np.int8)
    return values, scales


def _encode(tensor: np.ndarray, dtype: str) -> list[tuple[str, bytes]]:
    """Tensörü baytlara çevirir: [(parça adı, bayt)]. int8'de ikinci parça ölçeklerdir."""
    if tensor.ndim < 2 or dtype == "float32":
        return [("data", tensor.astype("<f4").tobytes())]
    if dtype == "float16":
        return [("data", tensor.astype("<f2").tobytes())]
    values, scales = quantize_rows(tensor)
    return [("data", values.tobytes()), ("scales", scales.astype("<f4").tobytes())]


def export_web(
    model: LanguageModel, tokenizer: Tokenizer, out_dir: str | Path, dtype: str = "int8"
) -> dict[str, Any]:
    """Tarayıcı klasörünü yazar; bildirimi döndürür."""
    if dtype not in DTYPES:
        raise ValueError(f"Bilinmeyen tür: {dtype}. Seçenekler: {', '.join(DTYPES)}.")
    if not isinstance(tokenizer, BPETokenizer):
        raise ValueError("Tarayıcı çalışma zamanı yalnız BPE tokenizer'ı okur.")
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    blob = bytearray()
    tensors: dict[str, Any] = {}
    for name, tensor in model_tensors(model).items():
        array = tensor.float().numpy()
        kind = dtype if array.ndim >= 2 else "float32"
        entry: dict[str, Any] = {"shape": list(array.shape), "dtype": kind}
        for part, data in _encode(array, kind):
            blob.extend(b"\0" * (-len(blob) % 4))  # 4 bayt hizası
            entry[part] = [len(blob), len(data)]
            blob.extend(data)
        tensors[name] = entry
    (out / BINARY).write_bytes(bytes(blob))
    manifest = {
        "format": FORMAT,
        "dtype": dtype,
        "model": model.config.to_dict(),
        "tensors": tensors,
        "bytes": len(blob),
        "sha256": hashlib.sha256(blob).hexdigest(),
        "files": {"model": BINARY, "tokenizer": TOKENIZER},
        "special": {
            "bos": tokenizer.bos_id,
            "eos": tokenizer.eos_id,
            "pad": tokenizer.pad_id,
            "system": tokenizer.special_id(SYSTEM),
            "user": tokenizer.special_id(USER),
            "assistant": tokenizer.special_id(ASSISTANT),
            "end_of_turn": tokenizer.special_id(END_OF_TURN),
        },
    }
    (out / MANIFEST).write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", "utf-8")
    tokenizer.save(out / TOKENIZER)
    return manifest


def _decode(blob: bytes, entry: dict[str, Any]) -> np.ndarray:
    shape = tuple(entry["shape"])
    offset, size = entry["data"]
    raw = blob[offset : offset + size]
    if entry["dtype"] == "float32":
        return np.frombuffer(raw, dtype="<f4").reshape(shape).copy()
    if entry["dtype"] == "float16":
        return np.frombuffer(raw, dtype="<f2").astype(np.float32).reshape(shape)
    scale_offset, scale_size = entry["scales"]
    scales = np.frombuffer(blob[scale_offset : scale_offset + scale_size], dtype="<f4")
    values = np.frombuffer(raw, dtype=np.int8).reshape(shape).astype(np.float32)
    restored: np.ndarray = (values * scales[:, None]).astype(np.float32)
    return restored


def load_web(model_dir: str | Path) -> tuple[LanguageModel, Tokenizer]:
    """Tarayıcı klasörünü PyTorch modeline yükler (nicemlenmiş ağırlıklar açılarak)."""
    root = Path(model_dir)
    manifest = json.loads((root / MANIFEST).read_text(encoding="utf-8"))
    if manifest.get("format") != FORMAT:
        raise ValueError(f"{root / MANIFEST} bu paketin tarayıcı biçiminde değil ({FORMAT}).")
    blob = (root / BINARY).read_bytes()
    if hashlib.sha256(blob).hexdigest() != manifest["sha256"]:
        raise ValueError(f"{root / BINARY} bozuk ya da bildirime ait değil (SHA-256 uyuşmuyor).")
    model = LanguageModel(ModelConfig.from_dict(manifest["model"]))
    tensors = {
        name: torch.from_numpy(_decode(blob, entry)) for name, entry in manifest["tensors"].items()
    }
    load_tensors(model, tensors)
    return model.eval(), load_tokenizer(root / TOKENIZER)
