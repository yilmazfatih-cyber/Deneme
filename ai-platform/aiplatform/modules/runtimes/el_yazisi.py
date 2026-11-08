"""N27 El Yazısı Okuma — görsel dil modeliyle el yazısı form/not okuma."""

from __future__ import annotations

from ..base import register
from ._common import BaseRuntime, RunContext, get_file


def _schema(fields: list[str] | None) -> dict:
    field_props = {f: {"type": ["string", "null"]} for f in fields or []}
    return {
        "type": "object",
        "required": ["text", "fields", "unreadable"],
        "properties": {
            "text": {"type": "string"},
            "fields": {"type": "object", "properties": field_props} if field_props else {"type": "object"},
            "unreadable": {"type": "array", "items": {"type": "string"}},
        },
    }


@register("el-yazisi")
class ElYazisi(BaseRuntime):
    uses_llm = True

    async def do_read(self, payload: dict, ctx: RunContext) -> dict:
        image = get_file(payload, ctx, "image")
        fields = payload.get("fields") or []
        ask = "Görseldeki el yazısını metne dök."
        if fields:
            ask += " Doldurulacak alanlar: " + ", ".join(map(str, fields))
        res = await self.llm_prompt(
            ctx, "el_yazisi", ask, images=[image], schema=_schema(fields), temperature=0.0
        )
        p = res.parsed
        return {
            "text": p.get("text", ""),
            "fields": p.get("fields") or {},
            "unreadable": p.get("unreadable") or [],
        }
