"""Veri hazırlama: metin -> belirteç kimlikleri -> diskte `np.memmap` parçaları.

Çıktı klasörü: `egitim-000.bin`, `dogrulama-000.bin` (ham uint16/uint32 dizileri),
`meta.json` (sayımlar, kaynak dosya özetleri, tokenizer özeti) ve `tokenizer.json` kopyası.
Her belge `<|bas|> ... <|son|>` ile sarılır. Eğitim/doğrulama ayrımı belge (uzun belgelerde
parça) bazındadır; aynı belgenin cümleleri iki tarafa birden düşmez. Okuma: `batches.py`.

Genişletme: Yeni bir ön işleme adımı (ör. metin süzme) için `prepare_data` içindeki döngüde
`piece.text` üzerinde çalışan bir işlev ekleyin; kuralını tests/test_data.py'de sınayın.
"""

from __future__ import annotations

import hashlib
import json
import zlib
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from .bytelevel import sanitize
from .corpus import CorpusOptions, expand_inputs, iter_pieces
from .tokenizer import BPETokenizer
from .tokenizer_api import Tokenizer

TRAIN, VAL = "egitim", "dogrulama"
META_NAME = "meta.json"
Encoder = Callable[[str], list[int]]


@dataclass(frozen=True)
class PrepareOptions:
    val_fraction: float = 0.01  # doğrulamaya ayrılacak parça oranı
    seed: int = 0
    shard_tokens: int = 50_000_000  # bir .bin dosyasındaki en çok belirteç
    fast: bool = False  # kodlamayı `tokenizers` kütüphanesine yaptır (aynı kimlikler, daha hızlı)


class _ShardWriter:
    """Belirteçleri sırayla `<ad>-000.bin`, `<ad>-001.bin`... dosyalarına yazar."""

    def __init__(self, out_dir: Path, split: str, dtype: np.dtype[Any], shard_tokens: int) -> None:
        self._out_dir, self._split, self._dtype = out_dir, split, dtype
        self._shard_tokens = shard_tokens
        self.files: list[dict[str, Any]] = []
        self.tokens = 0

    def write(self, ids: np.ndarray[Any, Any]) -> None:
        start = 0
        while start < len(ids):
            if not self.files or self.files[-1]["tokens"] >= self._shard_tokens:
                self.files.append({"name": f"{self._split}-{len(self.files):03d}.bin", "tokens": 0})
            current = self.files[-1]
            part = ids[start : start + self._shard_tokens - current["tokens"]]
            with (self._out_dir / current["name"]).open("ab") as handle:
                handle.write(part.astype(self._dtype, copy=False).tobytes())
            current["tokens"] += len(part)
            self.tokens += len(part)
            start += len(part)


def prepare_data(
    inputs: Sequence[str | Path],
    tokenizer: Tokenizer,
    out_dir: str | Path,
    corpus_options: CorpusOptions | None = None,
    options: PrepareOptions | None = None,
    progress: Callable[[int, int], None] | None = None,
) -> dict[str, Any]:
    """Girdi dosyalarını belirteçlere çevirip `out_dir` içine yazar; `meta.json` içeriğini döndürür."""
    opts = options or PrepareOptions()
    if not 0.0 < opts.val_fraction < 0.5:
        raise ValueError("Doğrulama oranı 0 ile 0,5 arasında olmalı (örnek: 0.01).")
    files = expand_inputs(inputs)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for stale in out.glob("*.bin"):
        stale.unlink()  # eski koşudan kalan parçalar yenileriyle karışmasın
    dtype = np.dtype(np.uint16 if tokenizer.vocab_size <= 1 << 16 else np.uint32)
    writers = {name: _ShardWriter(out, name, dtype, opts.shard_tokens) for name in (TRAIN, VAL)}
    encode = _fast_encoder(tokenizer) if opts.fast else tokenizer.encode
    bos, eos = tokenizer.bos_id, tokenizer.eos_id

    pending: np.ndarray[Any, Any] | None = None  # son eğitim parçası: gerekirse doğrulamaya gider
    pieces = documents = chars = 0
    for index, piece in enumerate(iter_pieces(files, corpus_options)):
        ids = encode(piece.text)
        if piece.first:
            ids = [bos, *ids]
        if piece.last:
            ids = [*ids, eos]
        array = np.asarray(ids, dtype=dtype)
        pieces, documents, chars = pieces + 1, documents + piece.first, chars + len(piece.text)
        if _is_val(opts.seed, index, opts.val_fraction):
            writers[VAL].write(array)
        else:
            if pending is not None:
                writers[TRAIN].write(pending)
            pending = array
        if progress is not None and pieces % 200 == 0:
            progress(pieces, chars)
    if pending is None and writers[VAL].tokens == 0:
        raise ValueError("Girdi dosyalarında hiç metin bulunamadı.")
    _finish_split(writers, pending)

    meta = {
        "vocab_size": tokenizer.vocab_size,
        "dtype": dtype.name,
        "tokenizer_fingerprint": tokenizer.fingerprint(),
        "bos_id": bos,
        "eos_id": eos,
        "pieces": pieces,
        "documents": documents,
        "chars": chars,
        "splits": {name: {"tokens": w.tokens, "files": w.files} for name, w in writers.items()},
        "sources": [_describe_source(path) for path in files],
        "settings": {"val_fraction": opts.val_fraction, "seed": opts.seed, "fast": opts.fast},
    }
    (out / META_NAME).write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", "utf-8")
    tokenizer.save(out / "tokenizer.json")
    return meta


def _finish_split(writers: dict[str, _ShardWriter], pending: np.ndarray[Any, Any] | None) -> None:
    """Bekleyen son parçayı yerine koyar; doğrulama boş kalmışsa onu doğrulamaya ayırır."""
    if pending is None:
        return
    if writers[VAL].tokens > 0:
        writers[TRAIN].write(pending)
    elif writers[TRAIN].tokens > 0:
        writers[VAL].write(pending)
    else:  # tek parçalık küçük derlem: belirteçlerin son %10'u doğrulama olur
        cut = max(1, len(pending) - max(1, len(pending) // 10))
        writers[TRAIN].write(pending[:cut])
        writers[VAL].write(pending[cut:])


def _is_val(seed: int, index: int, fraction: float) -> bool:
    """Parçanın doğrulamaya gidip gitmeyeceği: tohum ve sıra numarasından belirlenimci."""
    return bool(zlib.crc32(f"{seed}:{index}".encode()) / 2**32 < fraction)


def _fast_encoder(tokenizer: Tokenizer) -> Encoder:
    """Aynı kimlikleri üreten `tokenizers` kodlayıcısı (eşlik: tests/test_data.py)."""
    if not isinstance(tokenizer, BPETokenizer):
        raise ValueError("Hızlı kodlama yalnız BPE tokenizer ile kullanılabilir; --hizli olmadan deneyin.")
    try:
        import tokenizers
    except ImportError:
        raise RuntimeError(
            'Hızlı kodlama için `tokenizers` paketi gerekli: pip install -e ".[hf]" çalıştırın '
            "ya da --hizli seçeneğini kaldırın."
        ) from None
    data = tokenizer.to_json()
    data["added_tokens"] = []  # derlemdeki "<|son|>" gibi yazılar özel belirtece dönüşmesin
    reference = tokenizers.Tokenizer.from_str(json.dumps(data))

    def encode(text: str) -> list[int]:
        ids: list[int] = reference.encode(sanitize(text), add_special_tokens=False).ids
        return ids

    return encode


def _describe_source(path: Path) -> dict[str, Any]:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return {"path": str(path), "bytes": path.stat().st_size, "sha256": digest.hexdigest()}
