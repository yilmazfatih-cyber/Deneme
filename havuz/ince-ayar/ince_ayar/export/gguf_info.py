"""GGUF dosyasının başlığını okur (bağımlılıksız): sürüm, tensör sayısı ve anahtar-değer bilgileri.

Kim kullanır: `tasks/chat/export.py` (dönüştürmeden sonra özet yazmak için), testler.

Biçim (küçük sonlu / little-endian): "GGUF" + sürüm(u32) + tensör sayısı(u64) + anahtar sayısı(u64),
ardından her anahtar için: ad (u64 uzunluk + UTF-8) + değer türü (u32) + değer. Dizi değerleri:
öğe türü (u32) + öğe sayısı (u64) + öğeler. Büyük diziler (ör. 150 bin belirteçlik sözlük) okunmaz,
yalnız uzunlukları kaydedilir.

Kaynak: llama.cpp `gguf-py/gguf/constants.py` (GGUFValueType) ve `docs`'taki biçim tanımı.
Duman testinde llama.cpp'nin kendi `GGUFReader` sonucuyla karşılaştırılmıştır (`docs/DENEME_KAYDI.md`).

Genişletme: yeni bir değer türü eklenirse `_SCALARS` sözlüğüne `tür kodu: struct biçimi` ekleyin.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, BinaryIO

MAGIC = b"GGUF"
STRING, ARRAY = 8, 9
_SCALARS: dict[int, str] = {
    0: "<B",
    1: "<b",
    2: "<H",
    3: "<h",
    4: "<I",
    5: "<i",
    6: "<f",
    7: "<?",
    10: "<Q",
    11: "<q",
    12: "<d",
}
MAX_ARRAY_ITEMS = 64  # bundan uzun diziler yalnız uzunlukla özetlenir


@dataclass
class GgufInfo:
    version: int
    tensor_count: int
    metadata: dict[str, Any] = field(default_factory=dict)
    array_lengths: dict[str, int] = field(default_factory=dict)


def _read(handle: BinaryIO, fmt: str) -> Any:
    size = struct.calcsize(fmt)
    data = handle.read(size)
    if len(data) != size:
        raise ValueError("GGUF dosyası beklenenden kısa (bozuk ya da yarım)")
    return struct.unpack(fmt, data)[0]


def _string(handle: BinaryIO) -> str:
    length = _read(handle, "<Q")
    return handle.read(length).decode("utf-8", errors="replace")


def _value(handle: BinaryIO, kind: int) -> Any:
    if kind == STRING:
        return _string(handle)
    if kind in _SCALARS:
        return _read(handle, _SCALARS[kind])
    raise ValueError(f"tanınmayan GGUF değer türü: {kind}")


def _skip_or_read_array(handle: BinaryIO) -> tuple[list[Any] | None, int]:
    kind = _read(handle, "<I")
    count = _read(handle, "<Q")
    keep = count <= MAX_ARRAY_ITEMS and kind != ARRAY
    items: list[Any] = []
    for _ in range(count):
        if kind == ARRAY:
            _skip_or_read_array(handle)
            continue
        if kind == STRING and not keep:
            handle.seek(_read(handle, "<Q"), 1)
            continue
        if kind in _SCALARS and not keep:
            handle.seek(struct.calcsize(_SCALARS[kind]) * (count), 1)
            break
        items.append(_value(handle, kind))
    return (items if keep else None), count


def read_gguf_info(path: Path) -> GgufInfo:
    """GGUF başlığını okur; tensör verisine dokunmaz."""
    with path.open("rb") as handle:
        if handle.read(4) != MAGIC:
            raise ValueError(f"{path} bir GGUF dosyası değil")
        info = GgufInfo(version=_read(handle, "<I"), tensor_count=_read(handle, "<Q"))
        for _ in range(_read(handle, "<Q")):
            key = _string(handle)
            kind = _read(handle, "<I")
            if kind == ARRAY:
                items, count = _skip_or_read_array(handle)
                info.array_lengths[key] = count
                if items is not None:
                    info.metadata[key] = items
            else:
                info.metadata[key] = _value(handle, kind)
    return info


def summarize(path: Path) -> dict[str, Any]:
    """Kullanıcıya gösterilecek kısa özet."""
    info = read_gguf_info(path)
    return {
        "mimari": info.metadata.get("general.architecture"),
        "tensor_sayisi": info.tensor_count,
        "sohbet_sablonu_var": "tokenizer.chat_template" in info.metadata,
        "sozluk": info.array_lengths.get("tokenizer.ggml.tokens", 0),
        "boyut_mb": round(path.stat().st_size / 1e6, 1),
    }
