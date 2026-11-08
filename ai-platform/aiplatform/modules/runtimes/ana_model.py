"""N00 Ana Model — paylaşılan LLM (sohbet) ve sağlık bilgisi."""

from __future__ import annotations

from ...config import get_settings
from ...runtimes.llm import installed_llm_ids
from ..base import register
from ._common import BaseRuntime, ModuleError, ModuleNotReady, RunContext, get_llm, require


@register("ana-model")
class AnaModel(BaseRuntime):
    uses_llm = True

    async def do_chat(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "messages")
        messages = payload["messages"]
        if not isinstance(messages, list) or not all(isinstance(m, dict) and "role" in m for m in messages):
            raise ModuleError("'messages' {role, content} nesnelerinden oluşan bir liste olmalı")
        res = await self.llm(
            ctx,
            messages,
            json_schema=payload.get("json_schema"),
            tools=payload.get("tools"),
            temperature=float(payload.get("temperature", 0.2)),
            max_tokens=payload.get("max_tokens"),
            model=payload.get("model"),
        )
        out = {"content": res.content, "usage": res.usage, "model": res.model}
        if res.tool_calls:
            out["tool_calls"] = res.tool_calls
        if res.parsed is not None:
            out["json"] = res.parsed
        return out

    async def do_health(self, payload: dict, ctx: RunContext) -> dict:
        return await self.health()

    async def health(self) -> dict:
        s = get_settings()
        client = get_llm()
        out = {
            "module": self.module_id,
            "role": s.role,
            "llm_base_url": s.llm_base_url,
            "server_url": s.server_url,
            "priority": s.llm_model_priority,
            "installed_llms": installed_llm_ids(),
        }
        try:
            out["served_models"] = await client.available_models()
            out["ready"] = bool(out["served_models"])
        except ModuleNotReady as e:
            out["ready"] = False
            out["message"] = str(e)
        note_model = out.get("served_models") or []
        out["model"] = note_model[0] if note_model else None
        return out
