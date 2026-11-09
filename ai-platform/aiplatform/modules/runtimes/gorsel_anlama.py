"""N17 Görsel Anlama — görsel + soru → yanıt (isteğe bağlı JSON şemasıyla)."""

from __future__ import annotations

from ..base import register
from ._common import BaseRuntime, RunContext, get_file, require


@register("gorsel-anlama")
class GorselAnlama(BaseRuntime):
    uses_llm = True

    async def do_ask(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "question")
        image = get_file(payload, ctx, "image")
        schema = payload.get("json_schema")
        res = await self.llm_prompt(
            ctx, "gorsel_anlama", str(payload["question"]), images=[image], schema=schema
        )
        out = {"answer": res.content}
        if res.parsed is not None:
            out["json"] = res.parsed
        return out
