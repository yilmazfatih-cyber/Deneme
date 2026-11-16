"""Bayt düzeyi BPE tokenizer: metin <-> belirteç kimlikleri (saf Python).

Kayıt biçimi Hugging Face `tokenizer.json` dosyasının bir alt kümesidir; aynı dosyayı
`tokenizers.Tokenizer.from_file` da yükler ve aynı kimlikleri üretir
(tests/test_tokenizer_parity.py). Eğitim `tokenizer_train.py` içindedir.

Genişletme: Yeni bir özel belirteç gerekiyorsa `<|yedek1|>` ... `<|yedek9|>` adlarından birini
kullanın (sözlük boyutu değişmez). Kodlama algoritmasını değiştirirseniz `tarayici/tokenizer.js`
dosyasını da aynı biçimde değiştirin; iki eşlik testi bunu denetler.
"""

from __future__ import annotations

import codecs
import hashlib
import heapq
import json
import re
from collections.abc import Iterable, Sequence
from pathlib import Path
from typing import Any

from .bytelevel import BYTE_TO_CHAR, CHAR_TO_BYTE, pretokenize, sanitize, to_bytelevel
from .tokenizer_format import parse_tokenizer_json, tokenizer_json

# Özel belirteç adları bu pakette sabittir; rolleri adlarından bilinir.
BOS = "<|bas|>"  # belge başı
EOS = "<|son|>"  # belge sonu
PAD = "<|dolgu|>"  # yığınlarda boşluk doldurma
SYSTEM = "<|sistem|>"  # sohbet: sistem iletisi başlar
USER = "<|kullanici|>"  # sohbet: kullanıcı iletisi başlar
ASSISTANT = "<|asistan|>"  # sohbet: asistan iletisi başlar
END_OF_TURN = "<|bitti|>"  # sohbet: ileti biter
RESERVED = tuple(f"<|yedek{i}|>" for i in range(1, 10))  # ileride kullanmak için ayrılmış
DEFAULT_SPECIAL_TOKENS: tuple[str, ...] = (
    BOS,
    EOS,
    PAD,
    SYSTEM,
    USER,
    ASSISTANT,
    END_OF_TURN,
    *RESERVED,
)

_CACHE_LIMIT = 200_000


class BPETokenizer:
    """Bayt düzeyi BPE. Bilinmeyen belirteç yoktur: her bayt sözlüktedir."""

    def __init__(
        self,
        vocab: dict[str, int],
        merges: Sequence[tuple[str, str]],
        special_tokens: Sequence[str],
    ) -> None:
        _validate(vocab, merges, special_tokens)
        self._vocab = dict(vocab)
        self._tokens = sorted(self._vocab, key=self._vocab.__getitem__)
        self.merges = [(a, b) for a, b in merges]
        self._ranks = {pair: rank for rank, pair in enumerate(self.merges)}
        self.special_tokens = {tok: self._vocab[tok] for tok in special_tokens}
        self._special_ids = frozenset(self.special_tokens.values())
        self._bytes = [self._token_bytes(tok) for tok in self._tokens]
        longest_first = sorted(self.special_tokens, key=len, reverse=True)
        self._special_re = (
            re.compile("|".join(re.escape(tok) for tok in longest_first)) if longest_first else None
        )
        self._cache: dict[str, list[int]] = {}

    def _token_bytes(self, token: str) -> bytes:
        if token in self.special_tokens:
            return token.encode("utf-8")
        try:
            return bytes(CHAR_TO_BYTE[ch] for ch in token)
        except KeyError:  # bayt düzeyi olmayan yabancı belirteç: olduğu gibi (HF ile aynı)
            return token.encode("utf-8")

    # ---- temel bilgiler -------------------------------------------------------------

    @property
    def vocab_size(self) -> int:
        return len(self._tokens)

    @property
    def vocab(self) -> dict[str, int]:
        return dict(self._vocab)

    def special_id(self, name: str) -> int:
        """Özel belirtecin kimliği; yoksa ne yapılacağını söyleyen bir hata."""
        try:
            return self.special_tokens[name]
        except KeyError:
            raise ValueError(
                f"Bu tokenizer'da {name} özel belirteci yok. Tokenizer'ı varsayılan özel "
                "belirteçlerle yeniden eğitin: python -m dil_modeli tokenizer-egit ..."
            ) from None

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

    def id_to_token(self, token_id: int) -> str:
        return self._tokens[token_id]

    def token_to_id(self, token: str) -> int | None:
        return self._vocab.get(token)

    # ---- kodlama --------------------------------------------------------------------

    def encode(self, text: str, *, allow_special: bool = False) -> list[int]:
        """Metni kimliklere çevirir.

        `allow_special=False` (varsayılan, güvenli): metindeki "<|son|>" gibi yazılar sıradan
        metin olarak kodlanır; kullanıcı girdisi özel belirteç enjekte edemez.
        `allow_special=True`: özel belirteç yazıları tek kimliğe çevrilir (HF davranışı).
        """
        text = sanitize(text)  # eşsiz vekil kod noktaları UTF-8'e çevrilemez
        if not allow_special or self._special_re is None:
            return self._encode_plain(text)
        ids: list[int] = []
        pos = 0
        for match in self._special_re.finditer(text):
            if match.start() > pos:
                ids.extend(self._encode_plain(text[pos : match.start()]))
            ids.append(self.special_tokens[match.group()])
            pos = match.end()
        if pos < len(text):
            ids.extend(self._encode_plain(text[pos:]))
        return ids

    def _encode_plain(self, text: str) -> list[int]:
        ids: list[int] = []
        cache = self._cache
        for word in pretokenize(text):
            cached = cache.get(word)
            if cached is None:
                cached = self._bpe(word)
                if len(cache) >= _CACHE_LIMIT:
                    cache.clear()
                cache[word] = cached
            ids.extend(cached)
        return ids

    def _bpe(self, word: str) -> list[int]:
        """Tek bir parçaya birleştirmeleri sırasıyla uygular (öncelik kuyruğu, O(n log n)).

        HF `tokenizers`taki `Word::merge_all` ile aynı sıra: en küçük sıra numaralı çift,
        eşitlikte en soldaki. Bağlı liste `nxt`/`prev` ile tutulur; silinen simge "" olur.
        """
        symbols = list(to_bytelevel(word))
        n = len(symbols)
        ranks = self._ranks
        vocab = self._vocab
        if n > 1 and ranks:
            nxt = list(range(1, n + 1))
            nxt[-1] = -1
            prev = list(range(-1, n - 1))
            heap: list[tuple[int, int, str]] = []
            for i in range(n - 1):
                rank = ranks.get((symbols[i], symbols[i + 1]))
                if rank is not None:
                    heap.append((rank, i, symbols[i] + symbols[i + 1]))
            heapq.heapify(heap)
            while heap:
                _, i, merged = heapq.heappop(heap)
                j = nxt[i]
                if not symbols[i] or j < 0:
                    continue
                if (symbols[i], symbols[j]) not in ranks or symbols[i] + symbols[j] != merged:
                    continue  # eskimiş kuyruk kaydı
                symbols[i] = merged
                symbols[j] = ""
                k = nxt[j]
                nxt[i] = k
                if k >= 0:
                    prev[k] = i
                    rank = ranks.get((merged, symbols[k]))
                    if rank is not None:
                        heapq.heappush(heap, (rank, i, merged + symbols[k]))
                p = prev[i]
                if p >= 0:
                    rank = ranks.get((symbols[p], merged))
                    if rank is not None:
                        heapq.heappush(heap, (rank, p, symbols[p] + merged))
        return [vocab[s] for s in symbols if s]

    # ---- çözme ----------------------------------------------------------------------

    def decode_bytes(self, ids: Iterable[int], *, skip_special: bool = True) -> bytes:
        id_list = list(ids)
        if id_list and (min(id_list) < 0 or max(id_list) >= len(self._bytes)):
            raise ValueError(
                f"Belirteç kimliği sözlük dışında (sözlük boyutu {len(self._bytes)}). "
                "Model ile tokenizer aynı eğitimden mi geliyor, denetleyin."
            )
        table = self._bytes
        if skip_special:
            special = self._special_ids
            return b"".join(table[i] for i in id_list if i not in special)
        return b"".join(table[i] for i in id_list)

    def decode(self, ids: Iterable[int], *, skip_special: bool = True) -> str:
        """Kimlikleri metne çevirir; yarım kalmış UTF-8 dizileri U+FFFD olur."""
        return self.decode_bytes(ids, skip_special=skip_special).decode("utf-8", errors="replace")

    # ---- kayıt ----------------------------------------------------------------------

    def to_json(self, *, add_bos: bool = False) -> dict[str, Any]:
        """HF `tokenizer.json` yapısı. `add_bos=True`: HF tarafı başa `<|bas|>` eklesin."""
        bos = (BOS, self.bos_id) if add_bos else None
        return tokenizer_json(self._vocab, self.merges, self.special_tokens, bos)

    def save(self, path: str | Path, *, add_bos: bool = False) -> None:
        text = json.dumps(self.to_json(add_bos=add_bos), ensure_ascii=False, separators=(",", ":"))
        Path(path).write_text(text + "\n", encoding="utf-8")

    @classmethod
    def from_json(cls, data: Any) -> BPETokenizer:
        vocab, merges, special = parse_tokenizer_json(data)
        return cls(vocab, merges, special)

    @classmethod
    def load(cls, path: str | Path) -> BPETokenizer:
        file = Path(path)
        if not file.is_file():
            raise FileNotFoundError(
                f"Tokenizer dosyası bulunamadı: {file}. Önce eğitin: "
                "python -m dil_modeli tokenizer-egit --girdi metin.txt --cikti tokenizer.json"
            )
        return cls.from_json(json.loads(file.read_text(encoding="utf-8")))

    def fingerprint(self) -> str:
        """Sözlüğün ve birleştirmelerin özeti; veri ile tokenizer uyuşmazlığını yakalar."""
        payload = json.dumps([self._tokens, self.merges], ensure_ascii=False)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class StreamDecoder:
    """Belirteçleri tek tek alır, tamamlanan metni verir (akışla üretim için).

    Emoji gibi çok baytlı karakterler birkaç belirtece bölünebilir; yarım karakter
    tamamlanana kadar bekletilir. `flush()` üretim bitince kalan parçayı döndürür.
    """

    def __init__(self, tokenizer: BPETokenizer, *, skip_special: bool = True) -> None:
        self._tokenizer = tokenizer
        self._skip_special = skip_special
        self._decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")

    def push(self, token_id: int) -> str:
        data = self._tokenizer.decode_bytes([token_id], skip_special=self._skip_special)
        return self._decoder.decode(data, final=False)

    def flush(self) -> str:
        return self._decoder.decode(b"", final=True)


def _validate(vocab: dict[str, int], merges: Sequence[tuple[str, str]], special: Sequence[str]) -> None:
    """Sözlüğün tutarlı olduğunu denetler; bozuk dosya sessizce yanlış kodlamasın."""
    if sorted(vocab.values()) != list(range(len(vocab))):
        raise ValueError("Tokenizer sözlüğü bozuk: kimlikler 0'dan başlayıp boşluksuz artmalı.")
    missing = [ch for ch in BYTE_TO_CHAR if ch not in vocab]
    if missing:
        raise ValueError(
            f"Tokenizer sözlüğünde {len(missing)} bayt belirteci eksik; bayt düzeyi BPE için "
            "256 baytın hepsi sözlükte olmalı (ByteLevel.alphabet())."
        )
    for token in special:
        if token not in vocab:
            raise ValueError(f"Özel belirteç sözlükte yok: {token}")
        if not token or any(not 0x21 <= ord(ch) <= 0x7E for ch in token):
            raise ValueError(
                f"Özel belirteç adı yalnız boşluksuz ASCII olmalı: {token!r} "
                "(Türkçe harf HF çözücüsünde yanlış bayta dönüşür; 'kullanici' gibi yazın)."
            )
    for first, second in merges:
        if first not in vocab or second not in vocab or first + second not in vocab:
            raise ValueError(f"Birleştirme sözlükle uyuşmuyor: {first!r} + {second!r}")
