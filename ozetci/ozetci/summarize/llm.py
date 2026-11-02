"""Dil modeliyle özetleme: tek geçiş ya da böl-özetle-birleştir (map-reduce)."""

from __future__ import annotations

from ..chunking import chunk_text
from ..textutil import detect_language
from .base import Summary, TextGenerator
from .output_parse import parse_summary, strip_thinking, unverified_numbers
from .prompts import build_messages


class LLMSummarizer:
    name = "llm"

    def __init__(self, generator: TextGenerator, max_chars: int = 6000, max_new_tokens: int = 350, max_depth: int = 2) -> None:
        self.generator = generator
        self.max_chars = min(max_chars, getattr(generator, "max_input_chars", max_chars) or max_chars)
        self.max_new_tokens = max_new_tokens
        self.max_depth = max(1, max_depth)
        self.name = f"llm:{getattr(generator, 'name', 'generator')}"

    def summarize(self, text: str, kind: str = "document", language: str = "auto", title: str | None = None) -> Summary:
        lang = detect_language(text) if language == "auto" else language
        if lang == "unknown":
            lang = "tr"
        text = text.strip()
        if not text:
            return Summary(text="", language=lang, backend=self.name, notes=["boş metin"])

        chunks = chunk_text(text, max_chars=self.max_chars, overlap_chars=min(300, self.max_chars // 10))
        if len(chunks) <= 1:
            raw = self.generator.generate(build_messages(text, kind, lang, title, stage="final"), self.max_new_tokens)
            summary = parse_summary(raw, lang, self.name)
            summary.chunks = 1
            return self._check_numbers(summary, text)

        partials = chunks
        depth = 0
        n_chunks = len(chunks)
        while depth < self.max_depth:
            depth += 1
            partial_summaries = []
            for i, chunk in enumerate(partials, 1):
                raw = self.generator.generate(build_messages(chunk, kind, lang, None, stage="chunk"), max(160, self.max_new_tokens // 2))
                label = "Section" if lang == "en" else "Bölüm"
                partial_summaries.append(f"[{label} {i}] " + strip_thinking(raw).strip())
            merged = "\n\n".join(partial_summaries)
            if len(merged) <= self.max_chars:
                raw = self.generator.generate(build_messages(merged, kind, lang, title, stage="merge"), self.max_new_tokens)
                summary = parse_summary(raw, lang, self.name)
                summary.chunks = n_chunks
                summary.notes.append(f"{n_chunks} parça, {depth} seviye birleştirme")
                return self._check_numbers(summary, text)
            partials = chunk_text(merged, max_chars=self.max_chars, overlap_chars=0)

        # Derinlik sınırı aşıldı: bölüm özetlerini kesip birleştir
        merged = "\n\n".join(partial_summaries)[: self.max_chars]
        raw = self.generator.generate(build_messages(merged, kind, lang, title, stage="merge"), self.max_new_tokens)
        summary = parse_summary(raw, lang, self.name)
        summary.chunks = n_chunks
        summary.notes.append("belge çok uzun; bölüm özetlerinin bir kısmı kırpıldı")
        return self._check_numbers(summary, text)

    @staticmethod
    def _check_numbers(summary, source: str):
        joined = " ".join([summary.text, *summary.bullets, *summary.actions])
        bad = unverified_numbers(joined, source)
        if bad:
            summary.notes.append("metinde geçmeyen rakamlar (doğrulayın): " + ", ".join(bad[:6]))
        return summary
