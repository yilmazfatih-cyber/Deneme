"""`tokenizer.json` okuma/yazma: Hugging Face biçiminin desteklediğimiz alt kümesi.

`tokenizer.py` kullanır. Yazılan dosyayı `tokenizers.Tokenizer.from_file` ve
`transformers.AutoTokenizer` doğrudan yükler. Okurken alt kümenin dışındaki her ayar açık bir
hatayla reddedilir; böylece farklı kodlayan bir dosya sessizce kabul edilmez.

Genişletme: Yeni bir alan desteklenecekse önce `tokenizer.py` içindeki kodlamayı ve
`tarayici/tokenizer.js`'i güncelleyin, sonra buradaki denetimi gevşetin.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any


def tokenizer_json(
    vocab: Mapping[str, int],
    merges: Sequence[tuple[str, str]],
    special_tokens: Mapping[str, int],
    bos: tuple[str, int] | None,
) -> dict[str, Any]:
    """HF `tokenizer.json` sözlüğünü kurar. `bos` verilirse HF başa o belirteci ekler."""
    added = [
        {
            "id": token_id,
            "content": token,
            "single_word": False,
            "lstrip": False,
            "rstrip": False,
            "normalized": False,
            "special": True,
        }
        for token, token_id in sorted(special_tokens.items(), key=lambda item: item[1])
    ]
    byte_level = {"type": "ByteLevel", "trim_offsets": True, "use_regex": True}
    return {
        "version": "1.0",
        "truncation": None,
        "padding": None,
        "added_tokens": added,
        "normalizer": None,
        "pre_tokenizer": {**byte_level, "add_prefix_space": False},
        "post_processor": _bos_template(*bos) if bos else None,
        "decoder": {**byte_level, "add_prefix_space": True},
        "model": {
            "type": "BPE",
            "dropout": None,
            "unk_token": None,
            "continuing_subword_prefix": None,
            "end_of_word_suffix": None,
            "fuse_unk": False,
            "byte_fallback": False,
            "ignore_merges": False,
            "vocab": dict(sorted(vocab.items(), key=lambda item: item[1])),
            "merges": [[first, second] for first, second in merges],
        },
    }


def _bos_template(token: str, token_id: int) -> dict[str, Any]:
    """Tek metnin başına `token` ekleyen TemplateProcessing ayarı (HF'nin yazdığı biçim)."""
    special = {"SpecialToken": {"id": token, "type_id": 0}}
    return {
        "type": "TemplateProcessing",
        "single": [special, {"Sequence": {"id": "A", "type_id": 0}}],
        "pair": [
            special,
            {"Sequence": {"id": "A", "type_id": 0}},
            {"Sequence": {"id": "B", "type_id": 1}},
        ],
        "special_tokens": {token: {"id": token, "ids": [token_id], "tokens": [token]}},
    }


def _fail(reason: str) -> ValueError:
    return ValueError(
        f"Bu tokenizer.json desteklenen alt kümenin dışında: {reason}. Bu paket yalnız kendi "
        "yazdığı (ya da aynı ayarlarla `tokenizers` ile eğitilmiş) bayt düzeyi BPE dosyalarını okur."
    )


def parse_tokenizer_json(data: Any) -> tuple[dict[str, int], list[tuple[str, str]], list[str]]:
    """Sözlüğü, birleştirmeleri ve özel belirteçleri çıkarır; her ayarı tek tek denetler."""
    if not isinstance(data, dict) or not isinstance(data.get("model"), dict):
        raise _fail("'model' bölümü yok")
    model = data["model"]
    if model.get("type") != "BPE":
        raise _fail(f"model türü {model.get('type')!r}, 'BPE' olmalı")
    for key in ("dropout", "unk_token", "continuing_subword_prefix", "end_of_word_suffix"):
        if model.get(key):
            raise _fail(f"model.{key} kullanılmış")
    for key in ("fuse_unk", "byte_fallback", "ignore_merges"):
        if model.get(key):
            raise _fail(f"model.{key} açık")
    if data.get("normalizer") is not None:
        raise _fail("normalizer tanımlı")
    pre = data.get("pre_tokenizer")
    if not isinstance(pre, dict) or pre.get("type") != "ByteLevel":
        raise _fail("pre_tokenizer 'ByteLevel' değil")
    if pre.get("add_prefix_space", True) or not pre.get("use_regex", True):
        raise _fail("ByteLevel ayarı add_prefix_space=false, use_regex=true olmalı")
    decoder = data.get("decoder")
    if not isinstance(decoder, dict) or decoder.get("type") != "ByteLevel":
        raise _fail("decoder 'ByteLevel' değil")
    post = data.get("post_processor")
    if post is not None and (not isinstance(post, dict) or post.get("type") != "TemplateProcessing"):
        raise _fail("post_processor yalnız boş ya da TemplateProcessing olabilir")

    vocab = model.get("vocab")
    if not isinstance(vocab, dict) or not all(
        isinstance(k, str) and isinstance(v, int) for k, v in vocab.items()
    ):
        raise _fail("model.vocab belirteç -> kimlik sözlüğü değil")
    merges = [_parse_merge(item) for item in model.get("merges", [])]
    special: list[str] = []
    for item in data.get("added_tokens", []):
        content = item.get("content") if isinstance(item, dict) else None
        if not isinstance(content, str) or vocab.get(content) != item.get("id"):
            raise _fail(f"added_tokens kaydı sözlükle uyuşmuyor: {item!r}")
        if not item.get("special") or item.get("normalized"):
            raise _fail(f"{content} için special=true, normalized=false olmalı")
        if item.get("lstrip") or item.get("rstrip") or item.get("single_word"):
            raise _fail(f"{content} için lstrip/rstrip/single_word kapalı olmalı")
        special.append(content)
    return vocab, merges, special


def _parse_merge(item: Any) -> tuple[str, str]:
    """Birleştirme kaydı: yeni biçimde ["a", "b"], eski biçimde "a b"."""
    if isinstance(item, str):
        parts = item.split(" ")
        if len(parts) == 2:
            return parts[0], parts[1]
    elif isinstance(item, list) and len(item) == 2 and all(isinstance(p, str) for p in item):
        return item[0], item[1]
    raise _fail(f"birleştirme kaydı okunamadı: {item!r}")
