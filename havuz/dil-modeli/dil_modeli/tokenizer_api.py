"""Tokenizer ortak arayüzü ve dosyadan yükleme.

Paketin geri kalanı (veri, eğitim, üretim, sohbet) tokenizer'ı yalnız bu arayüzle kullanır;
böylece BPE ile karakter tokenizer'ı birbirinin yerine geçebilir.

Genişletme: Yeni tokenizer türü eklerken `load_tokenizer` içindeki
"YENİ TOKENIZER TÜRÜ BURAYA" satırının üstüne bir dal ekleyin.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from pathlib import Path
from typing import Protocol

from .tokenizer import BPETokenizer
from .tokenizer_char import FORMAT_NAME, CharTokenizer


class Tokenizer(Protocol):
    """Bir tokenizer'ın sağlaması gereken en küçük arayüz."""

    @property
    def vocab_size(self) -> int: ...
    @property
    def bos_id(self) -> int: ...
    @property
    def eos_id(self) -> int: ...
    @property
    def pad_id(self) -> int: ...
    def special_id(self, name: str) -> int: ...
    def is_special(self, token_id: int) -> bool: ...
    def encode(self, text: str, *, allow_special: bool = False) -> list[int]: ...
    def decode(self, ids: Iterable[int], *, skip_special: bool = True) -> str: ...
    def decode_bytes(self, ids: Iterable[int], *, skip_special: bool = True) -> bytes: ...
    def save(self, path: str | Path) -> None: ...
    def fingerprint(self) -> str: ...


def load_tokenizer(path: str | Path) -> Tokenizer:
    """`tokenizer.json` dosyasını türüne göre yükler (BPE ya da karakter)."""
    file = Path(path)
    if file.is_dir():
        file = file / "tokenizer.json"
    if not file.is_file():
        raise FileNotFoundError(
            f"Tokenizer dosyası bulunamadı: {file}. Önce eğitin: "
            "python -m dil_modeli tokenizer-egit --girdi metin.txt --cikti tokenizer.json"
        )
    try:
        data = json.loads(file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError(f"{file} geçerli bir JSON dosyası değil: {error}") from None
    if isinstance(data, dict) and data.get("tur") == FORMAT_NAME:
        return CharTokenizer.from_json(data)
    # YENİ TOKENIZER TÜRÜ BURAYA
    return BPETokenizer.from_json(data)
