"""Varsayılan model seçimleri ve ortam değişkenleriyle ayar.

Parametre bütçesi (toplam < 1 milyar):
  * OCR  : PP-OCRv5 latin (RapidOCR, sezim + tanıma)          ≈  15 M   (Türkçe listede)
  * LLM  : Qwen3-0.6B (toplam 0,60 milyar; gömme dahil)       ≈ 600 M   (Türkçe listede)
  ---------------------------------------------------------------
  toplam                                                      ≈ 615 M  < 1 000 M

  Seçenek: OCR = Granite-Docling-258M (düzen/tablo korur, dil: İngilizce) -> toplam ≈ 858 M
  Seçenek: OCR = PaddleOCR-VL-1.5 (≈ 959 M, Türkçe listede) -> tek başına 1B altı, toplam 1B üstü

Ortam değişkenleri:
  OZETCI_LLM       HF model kimliği ("Qwen/Qwen3-0.6B") veya yerel GGUF yolu (".gguf")
  OZETCI_OCR       "rapid" (varsayılan, PP-OCRv5 latin) | "rapid:en" | HF model kimliği (Docling VLM) | "tesseract" | "none"
  OZETCI_BACKEND   "auto" | "gguf" | "hf" | "extractive"
  OZETCI_THREADS   CPU iş parçacığı sayısı (llama.cpp / torch)
  OZETCI_MAX_CHARS Tek seferde modele verilecek en çok karakter (parçalama eşiği)
  OZETCI_DEVICE    "auto" | "cpu" | "cuda" | "mps"  (transformers arka uçları için)
  OZETCI_OCR_MAX_NEW_TOKENS  Docling VLM için sayfa başına üst sınır (varsayılan 3072)
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

DEFAULT_LLM = "Qwen/Qwen3-0.6B"
DEFAULT_LLM_GGUF_HINT = "Qwen/Qwen3-0.6B-GGUF (Qwen3-0.6B-Q8_0.gguf)"
DEFAULT_OCR = "rapid"
DOCLING_OCR = "ibm-granite/granite-docling-258M"
ALT_OCR = "ds4sd/SmolDocling-256M-preview"

PARAM_BUDGET_M = {
    "rapid": 15,
    "rapid:en": 15,
    "rapid:ch": 15,
    "tesseract": 0,
    "none": 0,
    "Qwen/Qwen3-0.6B": 600,
    "ibm-granite/granite-docling-258M": 258,
    "ds4sd/SmolDocling-256M-preview": 256,
    "HuggingFaceTB/SmolLM2-360M-Instruct": 362,
    "google/gemma-3-270m-it": 268,
    "Qwen/Qwen2.5-0.5B-Instruct": 494,
    "Qwen/Qwen3.5-0.8B": 900,
    "PaddlePaddle/PaddleOCR-VL-1.5": 959,
}


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass
class Settings:
    llm: str = field(default_factory=lambda: os.environ.get("OZETCI_LLM", DEFAULT_LLM))
    ocr: str = field(default_factory=lambda: os.environ.get("OZETCI_OCR", DEFAULT_OCR))
    backend: str = field(default_factory=lambda: os.environ.get("OZETCI_BACKEND", "auto"))
    threads: int = field(default_factory=lambda: _env_int("OZETCI_THREADS", max(1, (os.cpu_count() or 4) - 1)))
    max_chars: int = field(default_factory=lambda: _env_int("OZETCI_MAX_CHARS", 6000))
    max_new_tokens: int = field(default_factory=lambda: _env_int("OZETCI_MAX_NEW_TOKENS", 350))
    n_ctx: int = field(default_factory=lambda: _env_int("OZETCI_N_CTX", 8192))
    dpi: int = field(default_factory=lambda: _env_int("OZETCI_DPI", 170))
    device: str = field(default_factory=lambda: os.environ.get("OZETCI_DEVICE", "auto"))
    ocr_max_new_tokens: int = field(default_factory=lambda: _env_int("OZETCI_OCR_MAX_NEW_TOKENS", 3072))

    def resolve_device(self) -> str:
        if self.device != "auto":
            return self.device
        try:
            import torch

            if torch.cuda.is_available():
                return "cuda"
            if getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
                return "mps"
        except Exception:
            pass
        return "cpu"

    def param_budget(self) -> dict:
        def lookup(spec: str):
            spec_l = spec.lower()
            if spec_l.split(":")[0] in ("none", "off", "kapali", "kapalı", "tesseract"):
                return 0
            if spec_l.startswith("rapid"):
                return PARAM_BUDGET_M["rapid"]
            for key, val in PARAM_BUDGET_M.items():
                if key.split("/")[-1].lower() in spec_l:
                    return val
            return None

        return {"llm_M": lookup(self.llm), "ocr_M": lookup(self.ocr)}
