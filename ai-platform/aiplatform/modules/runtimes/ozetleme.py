"""N03 Özetleme — parçala, özetle, birleştir. Özette kaynakta olmayan sayılar `unverified_numbers` ile işaretlenir."""

from __future__ import annotations

import asyncio
import json

from ...runtimes.embeddings import chunk_text
from ..base import register
from ._common import BaseRuntime, ModuleError, RunContext, note, numbers_in, require

SCHEMA = {
    "type": "object",
    "required": ["summary", "bullets", "actions"],
    "properties": {
        "summary": {"type": "string"},
        "bullets": {"type": "array", "items": {"type": "string"}},
        "actions": {"type": "array", "items": {"type": "string"}},
    },
}
STYLES = {
    "kisa": "Kısa özet: en fazla {n} kelime, 2-4 cümle.",
    "yonetici": "Yönetici özeti: durum, önemli bulgular, karar gerektiren noktalar; en fazla {n} kelime.",
    "madde": "Madde işaretli özet: summary alanı tek cümlelik giriş, ayrıntılar bullets alanında; en fazla {n} kelime.",
    "eylem": "Eylem odaklı özet: yapılacak işleri (kim / ne / ne zaman) actions alanında eksiksiz ver; en fazla {n} kelime.",
}
CHUNK_WORDS = 1800
MAX_PARALLEL = 3


def unverified_numbers(source: str, result: dict) -> list[str]:
    src = numbers_in(source)
    text = " ".join(
        [str(result.get("summary", ""))]
        + [str(x) for x in result.get("bullets", []) + result.get("actions", [])]
    )
    import re

    out = []
    for m in re.finditer(r"\d[\d.,]*", text):
        raw = m.group(0).rstrip(".,")
        norm = re.sub(r"\D", "", raw).lstrip("0") or "0"
        if norm not in src and raw not in out:
            out.append(raw)
    return out


@register("ozetleme")
class Ozetleme(BaseRuntime):
    uses_llm = True

    async def do_summarize(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "text")
        text = str(payload["text"])
        style = payload.get("style") or "kisa"
        if style not in STYLES:
            raise ModuleError(f"Geçersiz üslup '{style}'. Seçenekler: {', '.join(STYLES)}")
        max_words = int(payload.get("max_words") or 150)
        instr = STYLES[style].format(n=max_words)

        words = len(text.split())
        if words <= CHUNK_WORDS * 1.2:
            res = await self.llm_prompt(ctx, "ozetleme", text, schema=SCHEMA, system_extra=instr)
            result = res.parsed
            chunks = 1
        else:
            parts = chunk_text(text, CHUNK_WORDS, 100)
            sem = asyncio.Semaphore(MAX_PARALLEL)

            async def one(i: int, part: str) -> dict:
                async with sem:
                    r = await self.llm_prompt(
                        ctx,
                        "ozetleme",
                        f"[Bölüm {i}/{len(parts)}]\n{part}",
                        schema=SCHEMA,
                        system_extra="Bu, uzun bir belgenin bir bölümüdür. Ayrıntılı bir ara özet çıkar (en fazla 200 kelime).",
                    )
                    return r.parsed

            partials = await asyncio.gather(*(one(i + 1, p) for i, p in enumerate(parts)))
            res = await self.llm_prompt(
                ctx,
                "ozetleme_birlestir",
                json.dumps(partials, ensure_ascii=False),
                schema=SCHEMA,
                system_extra=instr,
            )
            result = res.parsed
            chunks = len(parts)
        result = {
            "summary": str(result.get("summary", "")),
            "bullets": [str(b) for b in result.get("bullets") or []],
            "actions": [str(a) for a in result.get("actions") or []],
        }
        result["unverified_numbers"] = unverified_numbers(text, result)
        note(ctx, chunks=chunks, style=style)
        return result
