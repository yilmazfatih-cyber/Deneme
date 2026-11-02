"""Uçtan uca: dosya -> metin (gerekirse OCR) -> özet."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional, Union

from .config import Settings
from .extract import Document, load
from .ocr import build_ocr
from .summarize import ExtractiveSummarizer, LLMSummarizer, Summary

log = logging.getLogger("ozetci")


def build_generator(settings: Settings):
    """Ayarlara göre metin üretici kurar; ``None`` dönerse çıkarımsal yedek kullanılır.

    ``backend`` açıkça ``hf`` ya da ``gguf`` ise model türü uyuşmazlığı ve kurulum hatası
    sessizce yutulmaz: ``ValueError`` / kütüphane hatası yükselir. ``auto`` modda yedeğe
    düşüş uyarı günlüğüyle bildirilir.
    """
    backend = settings.backend.lower()
    llm = settings.llm
    is_gguf = llm.lower().endswith(".gguf")
    if backend == "extractive":
        return None
    if backend == "gguf" and not is_gguf:
        raise ValueError(f"GGUF arka ucu için --model/OZETCI_LLM bir .gguf dosyası olmalı (ör. models/Qwen3-0.6B-Q8_0.gguf); verilen: {llm!r}")
    if backend == "hf" and is_gguf:
        raise ValueError(f"transformers (hf) arka ucu için --model/OZETCI_LLM bir HF model kimliği olmalı (ör. Qwen/Qwen3-0.6B); verilen: {llm!r}")
    if is_gguf:
        try:
            from .summarize.gguf_backend import LlamaCppGenerator

            return LlamaCppGenerator(llm, n_ctx=settings.n_ctx, threads=settings.threads)
        except Exception as exc:
            if backend == "gguf":
                raise
            log.warning("GGUF arka ucu kurulamadı (%s); çıkarımsal yedek kullanılacak", exc)
            return None
    try:
        from .summarize.hf_backend import HFGenerator

        return HFGenerator(llm, device=settings.resolve_device(), threads=settings.threads, n_ctx=settings.n_ctx)
    except Exception as exc:
        if backend == "hf":
            raise
        log.warning("transformers arka ucu kurulamadı (%s); çıkarımsal yedek kullanılacak", exc)
        return None


class Ozetci:
    """Ana sınıf.

    >>> oz = Ozetci()                       # ayarlar ortam değişkenlerinden
    >>> ozet = oz.summarize("fatura.pdf")   # Summary nesnesi
    >>> print(ozet.render())
    """

    def __init__(self, settings: Optional[Settings] = None, generator=None, ocr=None, summarizer=None) -> None:
        self.settings = settings or Settings()
        self._generator = generator
        self._ocr = ocr
        self._ocr_resolved = ocr is not None
        self._summarizer = summarizer

    # --- tembel kurulum -------------------------------------------------
    @property
    def ocr(self):
        if self._ocr is None and not self._ocr_resolved:
            self._ocr_resolved = True
            try:
                engine = build_ocr(self.settings.ocr, device=self.settings.resolve_device(), **self._ocr_kwargs())
            except Exception as exc:
                log.warning("OCR motoru kurulamadı (%s); taranmış sayfalar okunmayacak", exc)
                engine = None
            if engine is not None and getattr(engine, "name", "") == "none":
                engine = None  # NullOCR: taranmış sayfalar "okunamadı" diye raporlansın
            self._ocr = engine
        return self._ocr

    def _ocr_kwargs(self) -> dict:
        spec = self.settings.ocr.lower()
        if spec.startswith(("rapid", "tesseract", "none")):
            return {}
        return {"max_new_tokens": self.settings.ocr_max_new_tokens, "threads": self.settings.threads}

    @property
    def summarizer(self):
        if self._summarizer is None:
            gen = self._generator if self._generator is not None else build_generator(self.settings)
            if gen is None:
                self._summarizer = ExtractiveSummarizer()
            else:
                self._summarizer = LLMSummarizer(gen, max_chars=self.settings.max_chars, max_new_tokens=self.settings.max_new_tokens)
        return self._summarizer

    # --- API --------------------------------------------------------------
    def read(self, path: Union[str, Path], use_ocr: bool = True) -> Document:
        s = self.settings
        return load(
            path,
            ocr=self.ocr if use_ocr else None,
            dpi=s.dpi,
            max_pages=s.max_pages,
            password=s.pdf_password,
            limit=s.mbox_limit,
        )

    def summarize(self, source: Union[str, Path, Document], language: str = "auto") -> Summary:
        doc = source if isinstance(source, Document) else self.read(source)
        text = doc.full_text()
        pending = _pending_ocr(doc)
        if not text.strip():
            summary = Summary(text="", language="tr" if language == "auto" else language, backend=getattr(self.summarizer, "name", ""), notes=["belgeden metin çıkarılamadı"])
        else:
            summary = self.summarizer.summarize(text, kind=doc.kind, language=language, title=doc.title)
        if pending:
            summary.notes.append(f"{pending} sayfa taranmış görüntü; OCR motoru olmadığı için okunamadı")
        return summary


def _pending_ocr(doc: Document) -> int:
    return doc.metadata.get("pending_ocr_pages", 0) + sum(_pending_ocr(c) for c in doc.children)
