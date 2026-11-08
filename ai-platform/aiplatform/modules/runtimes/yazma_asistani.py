"""N22 Yazma Asistanı — e-posta / resmî yazı taslağı ve gelen yazıya yanıt."""

from __future__ import annotations

from ..base import register
from ._common import BaseRuntime, RunContext, require

SCHEMA = {
    "type": "object",
    "required": ["subject", "body"],
    "properties": {"subject": {"type": "string"}, "body": {"type": "string"}},
}


@register("yazma-asistani")
class YazmaAsistani(BaseRuntime):
    uses_llm = True

    @staticmethod
    def _style(payload: dict) -> str:
        return f"Ton: {payload.get('tone') or 'resmî'}. Uzunluk: {payload.get('length') or 'kısa'}."

    async def do_draft(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "purpose")
        lines = [f"Amaç: {payload['purpose']}"]
        if payload.get("recipient"):
            lines.append(f"Alıcı: {payload['recipient']}")
        if payload.get("notes"):
            lines.append(f"Notlar:\n{payload['notes']}")
        res = await self.llm_prompt(
            ctx,
            "yazma_asistani",
            "\n".join(lines),
            schema=SCHEMA,
            system_extra=self._style(payload),
            temperature=0.4,
        )
        return {"subject": res.parsed.get("subject", ""), "text": res.parsed.get("body", "")}

    async def do_reply(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "incoming")
        user = f"Gelen yazı:\n{payload['incoming']}\n\nYanıtın amacı: {payload.get('intent') or 'uygun ve nazik bir yanıt'}"
        if payload.get("notes"):
            user += f"\nEk notlar:\n{payload['notes']}"
        res = await self.llm_prompt(
            ctx, "yazma_asistani", user, schema=SCHEMA, system_extra=self._style(payload), temperature=0.4
        )
        return {"subject": res.parsed.get("subject", ""), "text": res.parsed.get("body", "")}
