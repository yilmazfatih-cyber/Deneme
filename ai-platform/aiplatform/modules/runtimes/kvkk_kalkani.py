"""N12 KVKK Kalkanı — maskeleme / geri açma / tarama (kvkk paketini çağırır)."""

from __future__ import annotations

import asyncio

from ...kvkk.mask import mask as kvkk_mask_fn
from ...kvkk.mask import scan as kvkk_scan_fn
from ...kvkk.mask import unmask as kvkk_unmask_fn
from ..base import register
from ._common import BaseRuntime, ModuleError, RunContext, note, require


@register("kvkk-kalkani")
class KvkkKalkani(BaseRuntime):
    async def do_mask(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "text")
        r = await asyncio.to_thread(
            kvkk_mask_fn, str(payload["text"]), payload.get("entities"), mapping_id=payload.get("mapping_id")
        )
        note(ctx, masked=r.count, **r.meta)
        return {"masked_text": r.masked_text, "mapping_id": r.mapping_id, "findings": r.findings}

    async def do_unmask(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "text", "mapping_id")
        try:
            text = await asyncio.to_thread(kvkk_unmask_fn, str(payload["text"]), str(payload["mapping_id"]))
        except KeyError as e:
            raise ModuleError(str(e).strip("'\"")) from e
        return {"text": text}

    async def do_scan(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "text")
        r = await asyncio.to_thread(kvkk_scan_fn, str(payload["text"]), payload.get("entities"))
        note(ctx, **r["meta"])
        return {"findings": r["findings"]}

    async def health(self) -> dict:
        from ...kvkk.recognizers import PRESIDIO_AVAILABLE, ner_available

        return {
            "module": self.module_id,
            "ready": True,
            "rules": "presidio" if PRESIDIO_AVAILABLE else "yerleşik",
            "ner": "etkin" if ner_available() else "devre dışı",
        }
