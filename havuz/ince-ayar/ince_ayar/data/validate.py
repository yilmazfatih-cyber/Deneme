"""Biçim doğrulayıcı: veri dosyasını okur, her satırı şemayla denetler, Türkçe hata listesi üretir.

Kim kullanır: her görevin `dogrula` ve `egit` eylemi; sentetik veri hattı (ürettiğini aynı
doğrulayıcıdan geçirir). Hatalar satır numarasıyla gelir: "37. satır: `messages` son öğesi
asistan olmalı (şu an: user)".

Genişletme: yeni bir biçim için `load_classification` işlevini kopyalayın; şemayı
`data/records.py` içine, satırlar arası uyarıları `data/checks.py` içine yazın.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ValidationError

from ince_ayar.data import checks
from ince_ayar.data.records import (
    ChatExample,
    ChatRow,
    ClassificationRow,
    LabeledText,
    Pair,
    PairRow,
    TaggedRow,
    TaggedSentence,
)
from ince_ayar.errors import UserError, explain_validation_error
from ince_ayar.io_utils import RawRow, read_rows
from ince_ayar.messages import t

T = TypeVar("T")
M = TypeVar("M", bound=BaseModel)


@dataclass(frozen=True)
class Issue:
    """Tek bir bulgu. `line == 0` dosyanın geneli demektir."""

    line: int
    message: str

    def render(self) -> str:
        return f"{self.line}. satır: {self.message}" if self.line else self.message


@dataclass
class Loaded(Generic[T]):
    """Doğrulama sonucu: geçerli örnekler + hatalar + uyarılar."""

    path: Path
    rows: list[T] = field(default_factory=list)
    errors: list[Issue] = field(default_factory=list)
    warnings: list[Issue] = field(default_factory=list)
    total: int = 0

    def raise_if_errors(self, limit: int = 20) -> None:
        """Hata varsa ilk `limit` tanesini listeleyen bir `UserError` yükseltir."""
        if not self.errors:
            if not self.rows:
                raise UserError(t("veri.bos_dosya", yol=self.path))
            return
        shown = [issue.render() for issue in self.errors[:limit]]
        if len(self.errors) > limit:
            shown.append(t("veri.daha_fazla_hata", sayi=len(self.errors) - limit))
        raise UserError(
            t("veri.hatali", yol=self.path, sayi=len(self.errors), liste="\n  ".join(shown))
        )


def _group_of(data: dict[str, Any], group_field: str) -> str | None:
    if not group_field or data.get(group_field) in (None, ""):
        return None
    return str(data[group_field])


def _missing_columns_hint(raw: list[RawRow], required: tuple[str, ...]) -> str | None:
    """İlk satırda zorunlu alan yoksa, tek tek hata saymak yerine dosya düzeyinde yol gösterir."""
    first = next((row.data for row in raw if row.data is not None), None)
    if first is None or all(name in first for name in required):
        return None
    present = ", ".join(sorted(first)) or "-"
    if "conversations" in first or "instruction" in first or "prompt" in first:
        return t("veri.baska_bicim", alanlar=present)
    return t("veri.alan_adlari", gereken=", ".join(required), bulunan=present)


def _load(
    path: Path,
    encoding: str,
    schema: type[M],
    required: tuple[str, ...],
    convert: Callable[[int, M, dict[str, Any]], T],
) -> Loaded[T]:
    raw = read_rows(path, encoding)
    loaded: Loaded[T] = Loaded(path=path, total=len(raw))
    hint = _missing_columns_hint(raw, required)
    if hint is not None:
        loaded.errors.append(Issue(0, hint))
        return loaded
    for row in raw:
        if row.data is None:
            loaded.errors.append(Issue(row.line, row.error or t("veri.okunamadi")))
            continue
        try:
            model = schema.model_validate(row.data)
        except ValidationError as exc:
            loaded.errors.extend(Issue(row.line, text) for text in explain_validation_error(exc))
            continue
        loaded.rows.append(convert(row.line, model, row.data))
    return loaded


def load_chat(path: Path, encoding: str = "utf-8", group_field: str = "") -> Loaded[ChatExample]:
    """`{"messages": [...]}` satırlarını okur ve doğrular."""

    def convert(line: int, model: ChatRow, data: dict[str, Any]) -> ChatExample:
        messages = [{"role": m.role, "content": m.content} for m in model.messages]
        extra = {key: value for key, value in data.items() if key != "messages"}
        return ChatExample(line, messages, _group_of(data, group_field), extra)

    loaded = _load(path, encoding, ChatRow, ("messages",), convert)
    loaded.warnings.extend(Issue(line, text) for line, text in checks.check_chat(loaded.rows))
    return loaded


def load_classification(
    path: Path, encoding: str = "utf-8", group_field: str = ""
) -> Loaded[LabeledText]:
    """`metin` / `etiket` alanlı CSV ya da JSONL dosyasını okur ve doğrular."""

    def convert(line: int, model: ClassificationRow, data: dict[str, Any]) -> LabeledText:
        return LabeledText(line, model.metin.strip(), model.etiket.strip(), _group_of(data, group_field))

    loaded = _load(path, encoding, ClassificationRow, ("metin", "etiket"), convert)
    found = checks.check_classification(loaded.rows)
    loaded.warnings.extend(Issue(line, text) for line, text in found)
    return loaded


def load_pairs(path: Path, encoding: str = "utf-8", group_field: str = "") -> Loaded[Pair]:
    """`sorgu` / `olumlu` (/ `olumsuz`) alanlı CSV ya da JSONL dosyasını okur ve doğrular."""

    def convert(line: int, model: PairRow, data: dict[str, Any]) -> Pair:
        negatives = [negative.strip() for negative in model.olumsuz]
        group = _group_of(data, group_field)
        return Pair(line, model.sorgu.strip(), model.olumlu.strip(), negatives, group)

    loaded = _load(path, encoding, PairRow, ("sorgu", "olumlu"), convert)
    loaded.warnings.extend(Issue(line, text) for line, text in checks.check_pairs(loaded.rows))
    return loaded


def load_tagged(
    path: Path, encoding: str = "utf-8", group_field: str = ""
) -> Loaded[TaggedSentence]:
    """`sozcukler` / `etiketler` alanlı JSONL dosyasını okur ve doğrular (varlık tanıma)."""

    def convert(line: int, model: TaggedRow, data: dict[str, Any]) -> TaggedSentence:
        return TaggedSentence(line, model.sozcukler, model.etiketler, _group_of(data, group_field))

    loaded = _load(path, encoding, TaggedRow, ("sozcukler", "etiketler"), convert)
    loaded.warnings.extend(Issue(line, text) for line, text in checks.check_tagged(loaded.rows))
    return loaded
