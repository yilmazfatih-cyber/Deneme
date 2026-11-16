"""Karakter düzeyi tokenizer: her farklı karakter bir belirteçtir.

Öğrenmek ve çok küçük deneyler için en basit seçenek. BPE ile aynı arayüzü taşır
(`tokenizer_api.Tokenizer`), bu yüzden veri hazırlama, eğitim ve üretim onunla da çalışır.
Hugging Face ve tarayıcı dışa aktarımı yalnız BPE'yi destekler.

Genişletme: Yeni bir tokenizer türü yazarken bu dosyayı kopyalayın, `tokenizer_api.py`
içindeki `load_tokenizer`a bir dal ekleyin.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Iterable, Sequence
from pathlib import Path

from .bytelevel import sanitize
from .tokenizer import BOS, DEFAULT_SPECIAL_TOKENS, EOS, PAD

UNKNOWN = "<|bilinmeyen|>"  # eğitimde görülmemiş karakterin yerine geçer
FORMAT_NAME = "karakter"


class CharTokenizer:
    """Sözlük: önce özel belirteçler, sonra sıralı karakterler."""

    def __init__(
        self, chars: Sequence[str], special_tokens: Sequence[str] = DEFAULT_SPECIAL_TOKENS
    ) -> None:
        specials = [*special_tokens] if UNKNOWN in special_tokens else [*special_tokens, UNKNOWN]
        if len(set(chars)) != len(chars) or any(len(ch) != 1 for ch in chars):
            raise ValueError("Karakter listesi tek karakterli ve yinelemesiz olmalı.")
        self._tokens = [*specials, *chars]
        self._vocab = {token: i for i, token in enumerate(self._tokens)}
        self.special_tokens = {token: self._vocab[token] for token in specials}
        self._special_ids = frozenset(self.special_tokens.values())
        self._unknown_id = self._vocab[UNKNOWN]
        longest_first = sorted(specials, key=len, reverse=True)
        self._special_re = re.compile("|".join(re.escape(token) for token in longest_first))

    @classmethod
    def train(
        cls, texts: Iterable[str], special_tokens: Sequence[str] = DEFAULT_SPECIAL_TOKENS
    ) -> CharTokenizer:
        """Metinlerde geçen bütün karakterleri toplar."""
        seen: set[str] = set()
        for text in texts:
            seen.update(sanitize(text))
        return cls(sorted(seen), special_tokens)

    @property
    def vocab_size(self) -> int:
        return len(self._tokens)

    def special_id(self, name: str) -> int:
        try:
            return self.special_tokens[name]
        except KeyError:
            raise ValueError(f"Bu tokenizer'da {name} özel belirteci yok.") from None

    @property
    def bos_id(self) -> int:
        return self.special_id(BOS)

    @property
    def eos_id(self) -> int:
        return self.special_id(EOS)

    @property
    def pad_id(self) -> int:
        return self.special_id(PAD)

    def is_special(self, token_id: int) -> bool:
        return token_id in self._special_ids

    def encode(self, text: str, *, allow_special: bool = False) -> list[int]:
        """Karakterleri kimliklere çevirir; bilinmeyen karakter `<|bilinmeyen|>` olur."""
        text = sanitize(text)
        if not allow_special:
            return self._encode_plain(text)
        ids: list[int] = []
        pos = 0
        for match in self._special_re.finditer(text):
            ids.extend(self._encode_plain(text[pos : match.start()]))
            ids.append(self.special_tokens[match.group()])
            pos = match.end()
        ids.extend(self._encode_plain(text[pos:]))
        return ids

    def _encode_plain(self, text: str) -> list[int]:
        vocab = self._vocab
        unknown = self._unknown_id
        return [vocab.get(ch, unknown) for ch in text]

    def decode_bytes(self, ids: Iterable[int], *, skip_special: bool = True) -> bytes:
        id_list = list(ids)
        if id_list and (min(id_list) < 0 or max(id_list) >= len(self._tokens)):
            raise ValueError(
                f"Belirteç kimliği sözlük dışında (sözlük boyutu {len(self._tokens)})."
            )
        tokens = self._tokens
        special = self._special_ids
        text = "".join(tokens[i] for i in id_list if not (skip_special and i in special))
        return text.encode("utf-8")

    def decode(self, ids: Iterable[int], *, skip_special: bool = True) -> str:
        return self.decode_bytes(ids, skip_special=skip_special).decode("utf-8")

    def save(self, path: str | Path) -> None:
        chars = self._tokens[len(self.special_tokens) :]
        data = {"tur": FORMAT_NAME, "ozel": list(self.special_tokens), "karakterler": chars}
        Path(path).write_text(json.dumps(data, ensure_ascii=False) + "\n", encoding="utf-8")

    @classmethod
    def from_json(cls, data: dict[str, object]) -> CharTokenizer:
        chars = data.get("karakterler")
        special = data.get("ozel")
        if not isinstance(chars, list) or not isinstance(special, list):
            raise ValueError(
                "Karakter tokenizer dosyası bozuk: 'karakterler' ve 'ozel' listeleri yok."
            )
        return cls([str(ch) for ch in chars], [str(token) for token in special])

    def fingerprint(self) -> str:
        return hashlib.sha256(json.dumps(self._tokens, ensure_ascii=False).encode()).hexdigest()
