"""Hazırlanmış veriden eğitim ve doğrulama yığınları (`np.memmap` üzerinden).

`data.py`nin yazdığı klasörü okur. Dosyalar belleğe yüklenmez; işletim sistemi gereken
sayfaları getirir, bu yüzden bellekten büyük derlemlerle de çalışır.
`train.py` ve `evaluate.py` kullanır.

Genişletme: Örnekleme düzenini (ör. belge başından başlayan pencereler) değiştirecekseniz
`sample_batch`i değiştirin; "aynı tohum -> aynı yığın" testi (tests/test_data.py) geçmeli.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch import Tensor

from .data import META_NAME


class TokenData:
    """Bir bölümün (egitim / dogrulama) belirteç dizileri."""

    def __init__(self, data_dir: str | Path, split: str) -> None:
        root = Path(data_dir)
        self.meta = load_meta(root)
        if split not in self.meta["splits"]:
            raise ValueError(f"Bilinmeyen veri bölümü: {split!r}.")
        dtype = np.dtype(self.meta["dtype"])
        self.shards: list[np.memmap[Any, Any]] = []
        for entry in self.meta["splits"][split]["files"]:
            path = root / entry["name"]
            if not path.is_file() or path.stat().st_size != entry["tokens"] * dtype.itemsize:
                raise ValueError(
                    f"{path} eksik ya da boyutu meta.json ile uyuşmuyor. "
                    "Veriyi yeniden hazırlayın: "
                    "python -m dil_modeli veri-hazirla ..."
                )
            if entry["tokens"] > 0:
                self.shards.append(np.memmap(path, dtype=dtype, mode="r"))
        self.split = split
        self.tokens = sum(len(shard) for shard in self.shards)

    def _require(self, seq_len: int) -> None:
        if not any(len(shard) > seq_len for shard in self.shards):
            raise ValueError(
                f"'{self.split}' bölümünde {self.tokens} belirteç var; {seq_len} uzunluklu pencere "
                "için yetmiyor. Daha çok metin ekleyin ya da bağlamı (seq_len) küçültün."
            )

    def sample_batch(
        self, batch_size: int, seq_len: int, rng: np.random.Generator
    ) -> tuple[Tensor, Tensor]:
        """Rastgele pencereler: girdi x ve bir belirteç kaydırılmış hedef y, biçim (B, T)."""
        self._require(seq_len)
        starts = np.array([max(0, len(shard) - seq_len) for shard in self.shards], dtype=np.float64)
        which = rng.choice(len(self.shards), size=batch_size, p=starts / starts.sum())
        rows = []
        for shard_index in which:
            shard = self.shards[shard_index]
            offset = int(rng.integers(0, len(shard) - seq_len))
            rows.append(np.asarray(shard[offset : offset + seq_len + 1], dtype=np.int64))
        block = torch.from_numpy(np.stack(rows))
        return block[:, :-1], block[:, 1:]

    def eval_batches(
        self, batch_size: int, seq_len: int, max_batches: int | None = None
    ) -> Iterator[tuple[Tensor, Tensor]]:
        """Belirlenimci, üst üste binmeyen pencereler; sınır varsa bölüme eşit aralıkla yayılır."""
        self._require(seq_len)
        windows = [
            (index, offset)
            for index, shard in enumerate(self.shards)
            for offset in range(0, len(shard) - seq_len, seq_len)
        ]
        if max_batches is not None and len(windows) > max_batches * batch_size:
            picks = np.linspace(0, len(windows) - 1, max_batches * batch_size).astype(int)
            windows = [windows[i] for i in picks]
        for start in range(0, len(windows), batch_size):
            rows = [
                np.asarray(self.shards[index][offset : offset + seq_len + 1], dtype=np.int64)
                for index, offset in windows[start : start + batch_size]
            ]
            block = torch.from_numpy(np.stack(rows))
            yield block[:, :-1], block[:, 1:]


def load_meta(data_dir: str | Path) -> dict[str, Any]:
    """`meta.json` dosyasını okur; yoksa ne yapılacağını söyler."""
    path = Path(data_dir) / META_NAME
    if not path.is_file():
        raise FileNotFoundError(
            f"{path} bulunamadı. Önce veriyi hazırlayın: python -m dil_modeli veri-hazirla "
            "--girdi metin.txt --tokenizer tokenizer.json --cikti veri/hazir"
        )
    meta: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    for key in ("vocab_size", "dtype", "splits", "tokenizer_fingerprint"):
        if key not in meta:
            raise ValueError(f"{path} bozuk: '{key}' alanı yok. Veriyi yeniden hazırlayın.")
    return meta
