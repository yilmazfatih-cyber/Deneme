"""Veri biçimleri tablosu: her biçimin okuyucusu, karşılaştırma metni, etiketi ve yazım biçimi.

Kim kullanır: `data/cli.py` (`veri ayir`, `veri kart`, `veri sizinti`). Görev kodu bu tabloyu
kullanmaz; doğrudan `data/validate.py` içindeki `load_*` işlevlerini çağırır.

Genişletme: yeni biçim için `FORMATS` sözlüğüne bir `Format` kaydı ekleyin.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ince_ayar.data import card
from ince_ayar.data.records import ChatExample, LabeledText, Pair, TaggedSentence
from ince_ayar.data.validate import (
    Loaded,
    load_chat,
    load_classification,
    load_pairs,
    load_tagged,
)


@dataclass(frozen=True)
class Format:
    load: Callable[[Path, str, str], Loaded[Any]]
    text: Callable[[Any], str]  # sızıntı denetiminde karşılaştırılan metin
    label: Callable[[Any], str] | None  # katmanlı ayrım için etiket (yoksa None)
    to_dict: Callable[[Any], dict[str, Any]]
    describe: Callable[[list[Any]], str]  # veri kartı için dağılım


def _chat_dict(row: ChatExample) -> dict[str, Any]:
    return {"messages": row.messages, **row.extra}


def _labeled_dict(row: LabeledText) -> dict[str, Any]:
    base: dict[str, Any] = {"metin": row.text, "etiket": row.label}
    return base if row.group is None else {**base, "grup": row.group}


def _pair_dict(row: Pair) -> dict[str, Any]:
    base: dict[str, Any] = {"sorgu": row.query, "olumlu": row.positive}
    if row.negatives:
        base["olumsuz"] = row.negatives
    return base if row.group is None else {**base, "grup": row.group}


def _tagged_dict(row: TaggedSentence) -> dict[str, Any]:
    base: dict[str, Any] = {"sozcukler": row.words, "etiketler": row.tags}
    return base if row.group is None else {**base, "grup": row.group}


FORMATS: dict[str, Format] = {
    "sohbet": Format(load_chat, lambda r: r.prompt_text, None, _chat_dict, card.describe_chat),
    "siniflandirma": Format(
        load_classification,
        lambda r: r.text,
        lambda r: r.label,
        _labeled_dict,
        card.describe_classification,
    ),
    "gomme": Format(load_pairs, lambda r: r.query, None, _pair_dict, card.describe_pairs),
    "varlik": Format(
        load_tagged, lambda r: " ".join(r.words), None, _tagged_dict, card.describe_tagged
    ),
    # YENİ BİÇİM BURAYA
}
