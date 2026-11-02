"""PaddleOCR-VL (≈ 959 M, Apache-2.0, Türkçe dil listesinde) — DENEYSEL.

transformers 5.x ``paddleocr_vl`` mimarisini yerel olarak tanır (``trust_remote_code`` gerekmez).
Model sayfa görüntüsünü ``OCR:`` istemiyle okuma sırasına göre düz metne/Markdown'a çevirir;
tablolar için ``Table Recognition:`` istemi vardır. Bu motor tek başına 1B altıdır ama Qwen3-0.6B
ile birlikte toplam 1B'yi aşar. Gerçek ağırlıklarla sınanmamıştır; sorun olursa ``rapid`` kullanın.
"""

from __future__ import annotations

import os
from typing import Optional

from ..textutil import clean_text

_PROMPT = "OCR:"


class PaddleOCRVLEngine:
    name = "paddleocr-vl"

    def __init__(
        self,
        model_id: str = "PaddlePaddle/PaddleOCR-VL-1.5",
        device: str = "cpu",
        max_new_tokens: int = 3072,
        threads: Optional[int] = None,
        local_files_only: bool = False,
        prompt: str = _PROMPT,
    ) -> None:
        import torch
        from transformers import AutoModelForImageTextToText, AutoProcessor

        if threads:
            torch.set_num_threads(threads)
        self.model_id = model_id
        self.name = f"paddleocr-vl:{os.path.basename(model_id.rstrip('/'))}"
        self.device = device
        self.max_new_tokens = max_new_tokens
        self.prompt = prompt
        self.processor = AutoProcessor.from_pretrained(model_id, local_files_only=local_files_only)
        dtype = torch.float32 if device == "cpu" else torch.bfloat16
        self.model = AutoModelForImageTextToText.from_pretrained(model_id, dtype=dtype, local_files_only=local_files_only)
        self.model.to(device)
        self.model.eval()

    def image_to_text(self, image) -> str:
        import torch

        messages = [{"role": "user", "content": [{"type": "image"}, {"type": "text", "text": self.prompt}]}]
        text = self.processor.apply_chat_template(messages, add_generation_prompt=True)
        inputs = self.processor(text=text, images=[image], return_tensors="pt").to(self.device)
        with torch.inference_mode():
            generated = self.model.generate(**inputs, max_new_tokens=self.max_new_tokens, do_sample=False, repetition_penalty=1.05)
        new_tokens = generated[:, inputs["input_ids"].shape[1]:]
        out = self.processor.batch_decode(new_tokens, skip_special_tokens=True)[0]
        return clean_text(out)
