"""Veri satırı şemaları (Pydantic) ve doğrulanmış örnek tipleri.

Kim kullanır: `data/validate.py` her satırı buradaki şemayla doğrular, sonra görevlerin kullandığı
sade örnek tiplerine (`ChatExample`, `LabeledText`, `Pair`, `TaggedSentence`) çevirir.

Biçimler:
- sohbet        : {"messages": [{"role": "user", "content": "…"}, {"role": "assistant", …}]}
- siniflandirma : {"metin": "…", "etiket": "…"}            (CSV'de sütun adları aynı)
- gomme         : {"sorgu": "…", "olumlu": "…", "olumsuz": "…" ya da ["…", "…"]}
- varlik        : {"sozcukler": ["Ali", "Ankara'ya", …], "etiketler": ["B-KISI", "B-YER", …]}

Genişletme: yeni bir biçim için buraya bir `...Row` şeması ve bir örnek tipi ekleyin; okuyucusunu
`data/validate.py` içindeki `load_*` işlevlerini örnek alarak yazın.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic_core import PydanticCustomError

from ince_ayar.messages import t

Role = Literal["system", "user", "assistant"]


def _require_text(value: str) -> str:
    if not value.strip():
        raise PydanticCustomError("bos_metin", t("veri.bos_metin"))
    return value


class MessageRow(BaseModel):
    """Sohbetin tek iletisi. Fazladan anahtarlar (ör. `name`) yok sayılır."""

    model_config = ConfigDict(extra="ignore")

    role: Role
    content: str

    _check_content = field_validator("content")(_require_text)


class ChatRow(BaseModel):
    """Bir sohbet örneği: isteğe bağlı sistem iletisi, sonra user/assistant sırasıyla."""

    model_config = ConfigDict(extra="allow")

    messages: list[MessageRow] = Field(min_length=2)

    @model_validator(mode="after")
    def _check_turn_order(self) -> ChatRow:
        roles = [message.role for message in self.messages]
        start = 1 if roles[0] == "system" else 0
        for index, role in enumerate(roles[start:], start=start):
            if role == "system":
                raise PydanticCustomError("sohbet_sistem", t("veri.sohbet.sistem_yeri", sira=index))
            expected = "user" if (index - start) % 2 == 0 else "assistant"
            if role != expected:
                raise PydanticCustomError(
                    "sohbet_sira",
                    t("veri.sohbet.sira", sira=index, beklenen=expected, bulunan=role),
                )
        if roles[-1] != "assistant":
            raise PydanticCustomError("sohbet_son", t("veri.sohbet.son_asistan", bulunan=roles[-1]))
        return self


class ClassificationRow(BaseModel):
    """Bir sınıflandırma örneği. Sayısal etiketler (0, 1…) metne çevrilir."""

    model_config = ConfigDict(extra="allow", coerce_numbers_to_str=True)

    metin: str
    etiket: str

    _check_text = field_validator("metin", "etiket")(_require_text)


class PairRow(BaseModel):
    """Bir gömme eğitimi örneği: sorgu, ilgili (olumlu) metin, isteğe bağlı zor olumsuz(lar)."""

    model_config = ConfigDict(extra="allow")

    sorgu: str
    olumlu: str
    olumsuz: list[str] = Field(default_factory=list)

    _check_text = field_validator("sorgu", "olumlu")(_require_text)

    @field_validator("olumsuz", mode="before")
    @classmethod
    def _negatives_to_list(cls, value: Any) -> Any:
        if value is None:
            return []
        if isinstance(value, str):
            return [value] if value.strip() else []
        return value

    @model_validator(mode="after")
    def _check_negatives(self) -> PairRow:
        for negative in self.olumsuz:
            if not negative.strip():
                raise PydanticCustomError("bos_olumsuz", t("veri.gomme.bos_olumsuz"))
            if negative.strip() == self.olumlu.strip():
                raise PydanticCustomError("olumsuz_esit", t("veri.gomme.olumsuz_esit"))
        return self


class TaggedRow(BaseModel):
    """Bir varlık tanıma örneği: sözcükler ve her sözcüğün BIO etiketi."""

    model_config = ConfigDict(extra="allow")

    sozcukler: list[str] = Field(min_length=1)
    etiketler: list[str] = Field(min_length=1)

    @model_validator(mode="after")
    def _check_tags(self) -> TaggedRow:
        if len(self.sozcukler) != len(self.etiketler):
            raise PydanticCustomError(
                "varlik_uzunluk",
                t("veri.varlik.uzunluk", sozcuk=len(self.sozcukler), etiket=len(self.etiketler)),
            )
        previous = "O"
        for index, tag in enumerate(self.etiketler):
            if tag != "O" and not (tag[:2] in ("B-", "I-") and len(tag) > 2):
                raise PydanticCustomError(
                    "varlik_bicim", t("veri.varlik.bicim", sira=index, etiket=tag)
                )
            if tag.startswith("I-") and previous[2:] != tag[2:]:
                raise PydanticCustomError(
                    "varlik_sira", t("veri.varlik.sira", sira=index, etiket=tag)
                )
            previous = tag
        return self


# ───────────────────────── Doğrulanmış örnek tipleri (görevlerin gördüğü) ─────────────────────────


@dataclass(frozen=True)
class ChatExample:
    line: int
    messages: list[dict[str, str]]
    group: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def prompt_text(self) -> str:
        """Sızıntı denetiminde kullanılan metin: asistan dışındaki iletiler."""
        return "\n".join(m["content"] for m in self.messages if m["role"] != "assistant")

    @property
    def reference(self) -> str:
        """Son asistan yanıtı (değerlendirmede beklenen metin)."""
        return self.messages[-1]["content"]


@dataclass(frozen=True)
class LabeledText:
    line: int
    text: str
    label: str
    group: str | None = None


@dataclass(frozen=True)
class Pair:
    line: int
    query: str
    positive: str
    negatives: list[str] = field(default_factory=list)
    group: str | None = None


@dataclass(frozen=True)
class TaggedSentence:
    line: int
    words: list[str]
    tags: list[str]
    group: str | None = None
