from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable


@dataclass
class Summary:
    """Özet çıktısı. ``text`` kısa özet; ``bullets`` ana noktalar; ``actions`` yapılacaklar."""

    text: str
    bullets: list[str] = field(default_factory=list)
    actions: list[str] = field(default_factory=list)
    language: str = "tr"
    backend: str = ""
    chunks: int = 1
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "ozet": self.text,
            "maddeler": self.bullets,
            "eylemler": self.actions,
            "dil": self.language,
            "arka_uc": self.backend,
            "parca_sayisi": self.chunks,
            "notlar": self.notes,
        }

    def render(self) -> str:
        lines = ["ÖZET", self.text.strip()]
        if self.bullets:
            lines += ["", "MADDELER"] + [f"- {b}" for b in self.bullets]
        if self.actions:
            lines += ["", "EYLEMLER"] + [f"- {a}" for a in self.actions]
        return "\n".join(lines)


@runtime_checkable
class TextGenerator(Protocol):
    """Sohbet mesajlarından metin üreten arka uç (HF transformers, llama.cpp ...)."""

    name: str
    max_input_chars: int

    def generate(self, messages: list[dict], max_new_tokens: int = 350) -> str:
        ...


@runtime_checkable
class Summarizer(Protocol):
    name: str

    def summarize(self, text: str, kind: str = "document", language: str = "auto", title: str | None = None) -> Summary:
        ...
