"""N21 Yazım Denetimi — Türkçe yazım, noktalama ve üslup düzeltme (küçük yerel LLM)."""

from __future__ import annotations

from ..base import register
from ._common import BaseRuntime, ModuleError, RunContext, require

SCHEMA = {
    "type": "object",
    "required": ["text", "changes"],
    "properties": {
        "text": {"type": "string"},
        "changes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "original": {"type": "string"},
                    "corrected": {"type": "string"},
                    "reason": {"type": "string"},
                },
            },
        },
    },
}
STYLES = ("resmi", "samimi", "koru")


@register("yazim-denetimi")
class YazimDenetimi(BaseRuntime):
    uses_llm = True

    async def do_correct(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "text")
        style = payload.get("style") or "koru"
        if style not in STYLES:
            raise ModuleError(f"Geçersiz üslup '{style}'. Seçenekler: {', '.join(STYLES)}")
        res = await self.llm_prompt(
            ctx,
            "yazim_denetimi",
            str(payload["text"]),
            schema=SCHEMA,
            system_extra=f"Üslup: {style}.",
            temperature=0.0,
        )
        changes = [c for c in res.parsed.get("changes") or [] if isinstance(c, dict)]
        return {"text": res.parsed.get("text", payload["text"]), "changes": changes}
