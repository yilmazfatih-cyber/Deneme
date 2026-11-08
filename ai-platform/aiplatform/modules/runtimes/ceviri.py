"""N14 Çeviri — `mode=hizli`: Opus-MT (tr↔en, transformers, yerel); `mode=belge` veya diğer diller: LLM.

Terim sözlüğü: `data_dir/glossaries/<glossary_id>.json` ({"terim": "karşılık"}); LLM yolunda zorunlu tutulur,
Opus-MT yolunda yalnız sonradan denetlenir ve uymayan terimler meta'da raporlanır.
"""

from __future__ import annotations

import asyncio
import json
import re

from ...runtimes import model_dir
from ...runtimes.lazy import LazyRegistry
from ..base import register
from ._common import BaseRuntime, ModuleError, RunContext, get_settings, has_package, note, require

OPUS = {("tr", "en"): "opus-mt-tr-en", ("en", "tr"): "opus-mt-en-tr"}
LANG_NAMES = {
    "tr": "Türkçe",
    "en": "İngilizce",
    "de": "Almanca",
    "fr": "Fransızca",
    "ar": "Arapça",
    "ru": "Rusça",
    "es": "İspanyolca",
    "it": "İtalyanca",
    "zh": "Çince",
    "az": "Azerbaycan Türkçesi",
}
_PIPES = LazyRegistry()


def _glossary(gid: str | None) -> dict:
    if not gid:
        return {}
    if not re.fullmatch(r"[A-Za-z0-9_\-]{1,64}", gid):
        raise ModuleError("Geçersiz sözlük kimliği")
    p = get_settings().data_dir / "glossaries" / f"{gid}.json"
    if not p.exists():
        raise ModuleError(f"Terim sözlüğü bulunamadı: {gid}")
    return json.loads(p.read_text(encoding="utf-8"))


def _segments(text: str, max_words: int = 200) -> list[str]:
    """Opus-MT girdi sınırı (512 belirteç) için paragraf ve cümle bazında böler."""
    out = []
    for para in text.split("\n"):
        if len(para.split()) <= max_words:
            out.append(para)
            continue
        cur: list[str] = []
        for sent in re.split(r"(?<=[.!?])\s+", para):
            if cur and len(" ".join(cur + [sent]).split()) > max_words:
                out.append(" ".join(cur))
                cur = []
            cur.append(sent)
        if cur:
            out.append(" ".join(cur))
    return out


def opus_translate(model_id: str, text: str) -> str:  # pragma: no cover - transformers yok
    from transformers import pipeline

    path = model_dir(model_id)
    pipe = _PIPES.get(str(path), lambda: pipeline("translation", model=str(path), tokenizer=str(path)))
    segs = _segments(text)
    idx = [i for i, s in enumerate(segs) if s.strip()]
    outs = pipe([segs[i] for i in idx], max_length=512) if idx else []
    result = list(segs)
    for i, o in zip(idx, outs):
        result[i] = o["translation_text"]
    return "\n".join(result)


@register("ceviri")
class Ceviri(BaseRuntime):
    uses_llm = True

    async def do_translate(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "text", "target_lang")
        text = str(payload["text"])
        tgt = str(payload["target_lang"]).lower()[:2]
        src = (payload.get("source_lang") or ("tr" if tgt != "tr" else "en")).lower()[:2]
        mode = payload.get("mode") or "belge"
        glossary = _glossary(payload.get("glossary_id"))

        opus_id = OPUS.get((src, tgt))
        if mode == "hizli" and opus_id and has_package("transformers") and model_dir(opus_id):
            out = await asyncio.to_thread(opus_translate, opus_id, text)
            missed = [
                t for t, tr in glossary.items() if t.lower() in text.lower() and tr.lower() not in out.lower()
            ]
            note(ctx, model=opus_id, engine="opus-mt")
            if missed:
                note(ctx, glossary_missed=missed)
            return {"text": out, "engine": "opus-mt"}
        if mode == "hizli":
            note(ctx, fallback="Opus-MT kurulu değil veya dil çifti desteklenmiyor; LLM kullanıldı")

        extra = f"Kaynak dil: {LANG_NAMES.get(src, src)}. Hedef dil: {LANG_NAMES.get(tgt, tgt)}."
        if glossary:
            extra += "\nTerim sözlüğü (zorunlu):\n" + "\n".join(f"- {k} → {v}" for k, v in glossary.items())
        res = await self.llm_prompt(ctx, "ceviri", text, system_extra=extra, temperature=0.1)
        note(ctx, engine="llm")
        return {"text": res.content, "engine": "llm"}
