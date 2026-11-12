"""Aşama 1 — Bayt düzeyinde BPE (byte-pair encoding) belirteçleyici.

Neden bayt düzeyi? Temel sözlük 256 bayttan oluştuğu için hiçbir metin "bilinmeyen" olmaz:
İ, ı, ğ, ş ya da bir emoji de olsa UTF-8 baytlarına ayrılır. Birleştirmeler (merges) sık geçen
bayt çiftlerini tek belirteçte toplar.

Gerçek karşılıkları:
  - src/transformers/models/gpt2/tokenization_gpt2.py (GPT2Tokenizer; Rust'taki `tokenizers` kütüphanesinin
    BPE modelini ve ByteLevel ön-belirteçleyicisini sarar)
  - src/transformers/tokenization_utils_tokenizers.py (TokenizersBackend)
  - src/transformers/tokenization_python.py (saf Python arka uç; eklenmiş belirteçler için Trie)
"""

from __future__ import annotations

import json
import os
import re
from collections import Counter

# Ön-belirteçleme: kelimeler (baştaki boşlukla), sayılar, noktalama, boşluk.
# GPT-2'nin desenine benzer; Python 're' \p{L} desteklemediği için [^\W\d_] (harf) kullanıyoruz.
PRETOKENIZE = re.compile(r" ?[^\W\d_]+| ?\d+| ?[^\s\w]+|\s+(?!\S)|\s+")
TOKENIZER_FILE = "tokenizer.json"
TOKENIZER_CONFIG_FILE = "tokenizer_config.json"


def _merge(ids, pair, new_id):
    out, i = [], 0
    while i < len(ids):
        if i < len(ids) - 1 and (ids[i], ids[i + 1]) == pair:
            out.append(new_id)
            i += 2
        else:
            out.append(ids[i])
            i += 1
    return out


class ByteLevelBPETokenizer:
    def __init__(self, merges=(), special_tokens=("<|endoftext|>",), model_max_length=64):
        self.merges = [tuple(m) for m in merges]
        self.ranks = {pair: i for i, pair in enumerate(self.merges)}
        self.vocab = {i: bytes([i]) for i in range(256)}
        for i, (a, b) in enumerate(self.merges):
            self.vocab[256 + i] = self.vocab[a] + self.vocab[b]
        base = 256 + len(self.merges)
        self.special_tokens = {tok: base + i for i, tok in enumerate(special_tokens)}
        self._special_ids = {i: tok for tok, i in self.special_tokens.items()}
        self._special_re = (
            re.compile("(" + "|".join(map(re.escape, special_tokens)) + ")") if special_tokens else None
        )
        self.model_max_length = model_max_length
        self._cache: dict[str, list[int]] = {}

    # ------------------------------------------------------------ eğitim
    @classmethod
    def train(cls, texts, vocab_size, special_tokens=("<|endoftext|>",), **kwargs):
        """En sık bayt çiftini tekrar tekrar birleştirerek merges listesini öğrenir."""
        words = Counter(tuple(w.encode("utf-8")) for t in texts for w in PRETOKENIZE.findall(t))
        segs = {w: list(w) for w in words}
        merges = []
        for _ in range(vocab_size - 256 - len(special_tokens)):
            pairs = Counter()
            for w, count in words.items():
                s = segs[w]
                for p in zip(s, s[1:]):
                    pairs[p] += count
            if not pairs:
                break
            # En sık çift; eşitlikte en küçük kimlikli çift (deterministik sonuç için)
            best = max(pairs, key=lambda p: (pairs[p], -p[0], -p[1]))
            new_id = 256 + len(merges)
            merges.append(best)
            for w in segs:
                segs[w] = _merge(segs[w], best, new_id)
        return cls(merges, special_tokens, **kwargs)

    @property
    def vocab_size(self):
        return 256 + len(self.merges) + len(self.special_tokens)

    @property
    def eos_token_id(self):
        return self.special_tokens.get("<|endoftext|>")

    # ------------------------------------------------------------ kodlama / çözme
    def _encode_chunk(self, chunk):
        if chunk in self._cache:
            return self._cache[chunk]
        ids = list(chunk.encode("utf-8"))
        while len(ids) >= 2:
            rank, i = min((self.ranks.get(p, float("inf")), i) for i, p in enumerate(zip(ids, ids[1:])))
            if rank == float("inf"):
                break
            ids = _merge(ids, (ids[i], ids[i + 1]), 256 + rank)
        self._cache[chunk] = ids
        return ids

    def encode(self, text):
        parts = self._special_re.split(text) if self._special_re else [text]
        ids = []
        for part in parts:
            if part in self.special_tokens:
                ids.append(self.special_tokens[part])
            elif part:
                for chunk in PRETOKENIZE.findall(part):
                    ids.extend(self._encode_chunk(chunk))
        return ids

    def decode(self, ids, skip_special_tokens=False):
        out, buf = [], b""
        for i in ids:
            i = int(i)
            if i in self._special_ids:
                out.append(buf.decode("utf-8", errors="replace"))
                buf = b""
                if not skip_special_tokens:
                    out.append(self._special_ids[i])
            else:
                buf += self.vocab[i]
        out.append(buf.decode("utf-8", errors="replace"))
        return "".join(out)

    def __call__(self, text):
        ids = self.encode(text)
        return {"input_ids": ids, "attention_mask": [1] * len(ids)}

    def convert_ids_to_tokens(self, ids):
        return [self._special_ids.get(i) or self.vocab[i].decode("utf-8", errors="replace") for i in ids]

    # ------------------------------------------------------------ kaydet / yükle
    def save_pretrained(self, save_directory):
        os.makedirs(save_directory, exist_ok=True)
        data = {
            "model": {"type": "BPE", "merges": [list(m) for m in self.merges]},
            "pre_tokenizer": PRETOKENIZE.pattern,
            "added_tokens": [{"id": i, "content": t} for t, i in self.special_tokens.items()],
        }
        with open(os.path.join(save_directory, TOKENIZER_FILE), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        cfg = {"tokenizer_class": type(self).__name__, "model_max_length": self.model_max_length}
        with open(os.path.join(save_directory, TOKENIZER_CONFIG_FILE), "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)

    @classmethod
    def from_pretrained(cls, path):
        with open(os.path.join(path, TOKENIZER_FILE), encoding="utf-8") as f:
            data = json.load(f)
        with open(os.path.join(path, TOKENIZER_CONFIG_FILE), encoding="utf-8") as f:
            cfg = json.load(f)
        specials = [t["content"] for t in sorted(data["added_tokens"], key=lambda t: t["id"])]
        return cls(data["model"]["merges"], specials, model_max_length=cfg.get("model_max_length", 64))
