"""1B altı belge görsel-dil modeliyle OCR: Granite-Docling-258M / SmolDocling-256M.

İki model de Idefics3 mimarisindedir ve "DocTags" adlı yapısal bir işaretleme üretir
(okuma sırası, tablolar, başlıklar korunur). ``docling-core`` kuruluysa DocTags
Markdown'a çevrilir; değilse etiketler ayıklanıp düz metin verilir.

Kullanım::

    from ozetci.ocr.docling_vlm import DoclingVLMOCR
    ocr = DoclingVLMOCR("ibm-granite/granite-docling-258M")
    text = ocr.image_to_text(pil_image)
"""

from __future__ import annotations

import os
import re
from typing import Optional

from ..textutil import clean_text

_PROMPT = "Convert this page to docling."
_TAG_RE = re.compile(r"<[^<>]{1,40}>")
_LOC_RE = re.compile(r"<loc_\d+>")


class DoclingVLMOCR:
    name = "docling-vlm"

    def __init__(
        self,
        model_id: str = "ibm-granite/granite-docling-258M",
        device: str = "cpu",
        max_new_tokens: int = 3072,
        threads: Optional[int] = None,
        local_files_only: bool = False,
    ) -> None:
        import torch
        from transformers import AutoModelForImageTextToText, AutoProcessor

        if threads:
            torch.set_num_threads(threads)
        self.model_id = model_id
        self.name = f"docling-vlm:{os.path.basename(model_id.rstrip('/'))}"
        self.device = device
        self.max_new_tokens = max_new_tokens
        self.processor = AutoProcessor.from_pretrained(model_id, local_files_only=local_files_only)
        dtype = torch.float32 if device == "cpu" else torch.bfloat16
        self.model = AutoModelForImageTextToText.from_pretrained(model_id, dtype=dtype, local_files_only=local_files_only)
        self.model.to(device)
        self.model.eval()

    def image_to_doctags(self, image) -> str:
        import torch

        messages = [{"role": "user", "content": [{"type": "image"}, {"type": "text", "text": _PROMPT}]}]
        prompt = self.processor.apply_chat_template(messages, add_generation_prompt=True)
        inputs = self.processor(text=prompt, images=[image], return_tensors="pt").to(self.device)
        with torch.inference_mode():
            generated = self.model.generate(
                **inputs, max_new_tokens=self.max_new_tokens, do_sample=False,
                repetition_penalty=1.05, no_repeat_ngram_size=0, stopping_criteria=_loop_guard(),
            )
        new_tokens = generated[:, inputs["input_ids"].shape[1]:]
        doctags = self.processor.batch_decode(new_tokens, skip_special_tokens=False)[0]
        return doctags.replace("<end_of_utterance>", "").strip()

    def image_to_text(self, image) -> str:
        doctags = self.image_to_doctags(image)
        return doctags_to_text(doctags, image)


def _loop_guard(window: int = 48):
    """Son ``window`` belirteç bir önceki pencereyle aynıysa üretimi durdurur (döngüye giren VLM)."""
    try:
        from transformers import StoppingCriteria, StoppingCriteriaList
    except Exception:  # pragma: no cover
        return None

    class _Repeat(StoppingCriteria):
        def __call__(self, input_ids, scores, **kwargs):
            if input_ids.shape[1] < window * 2:
                return False
            tail = input_ids[0, -window:]
            prev = input_ids[0, -2 * window : -window]
            return bool((tail == prev).all())

    return StoppingCriteriaList([_Repeat()])


def doctags_to_text(doctags: str, image=None) -> str:
    """DocTags -> Markdown (docling-core varsa) ya da düz metin."""
    try:
        from docling_core.types.doc import DoclingDocument
        from docling_core.types.doc.document import DocTagsDocument

        dt = DocTagsDocument.from_doctags_and_image_pairs([doctags], [image] if image is not None else [None])
        doc = DoclingDocument.load_from_doctags(dt, document_name="sayfa")
        try:
            from docling_core.types.doc.common.content_layer import ContentLayer

            md = doc.export_to_markdown(image_placeholder="", included_content_layers={ContentLayer.BODY, ContentLayer.FURNITURE})
        except Exception:
            md = doc.export_to_markdown(image_placeholder="")
        md = md.replace("<!-- image -->", "")
        if md.strip():
            return clean_text(md)
    except Exception:
        pass
    return clean_text(_strip_doctags(doctags))


def _strip_doctags(doctags: str) -> str:
    text = _LOC_RE.sub("", doctags)
    # blok etiketleri satır sonuna çevir
    text = re.sub(r"</(?:text|paragraph|section_header_level_\d|caption|list_item|title|page_header|page_footer|footnote|code|formula)>", "\n", text)
    text = re.sub(r"<(?:ched|fcel|ecel|nl|rhed|srow|lcel|ucel|xcel)>", " | ", text)
    text = _TAG_RE.sub("", text)
    return text
