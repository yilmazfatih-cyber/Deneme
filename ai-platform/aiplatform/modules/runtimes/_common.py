"""Modül çalışma zamanlarının ortak yardımcıları.

- `BaseRuntime`: eylemi `do_<eylem>(payload, ctx)` metoduna yönlendirir; `requires` ile sağlık denetimi.
- LLM: `self.llm_prompt(ctx, "ozetleme", metin, schema=...)` — sistem istemi `modules/prompts/<ad>.md`.
- Meta: `note(ctx, model=..., engine=...)` → API yanıtındaki `meta` alanına eklenir.
- Hazır değil mesajı standardı: `not_ready("gliner", "varlik-cikarma")`
  → "'gliner' kurulu değil — modül mağazasından 'varlik-cikarma' kurun".
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import importlib.util
import inspect
import logging
import re
import uuid
from functools import lru_cache
from pathlib import Path
from typing import Any

from ...config import get_settings
from ...runtimes import model_dir
from ...runtimes.llm import LLMClient, LLMResult
from ..base import ApprovalRequired, ModuleError, ModuleNotReady, ModuleRuntime, RunContext

log = logging.getLogger("aiplatform.modules")

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


# ----------------------------------------------------------------------------- hata/mesaj standartları


def not_ready(package: str, module_id: str) -> ModuleNotReady:
    return ModuleNotReady(f"'{package}' kurulu değil — modül mağazasından '{module_id}' kurun")


def model_not_installed(model_id: str, module_id: str) -> ModuleNotReady:
    return ModuleNotReady(f"'{model_id}' modeli kurulu değil — modül mağazasından '{module_id}' kurun")


def has_package(name: str) -> bool:
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ValueError):
        return False


def require(payload: dict, *keys: str) -> None:
    missing = [k for k in keys if payload.get(k) in (None, "", [])]
    if missing:
        raise ModuleError(f"Zorunlu alan eksik: {', '.join(missing)}")


def require_model(model_id: str, module_id: str, artifact_id: str | None = None) -> Path:
    p = model_dir(model_id, artifact_id)
    if p is None:
        raise model_not_installed(model_id, module_id)
    return p


def r2(x: float | None) -> float | None:
    return None if x is None else round(float(x) + 0.0, 2)


# ----------------------------------------------------------------------------- dosyalar


def get_file(payload: dict, ctx: RunContext, key: str = "file", required: bool = True) -> bytes | None:
    """Dosya içeriği: önce multipart (`ctx.files[key]`), sonra JSON'daki base64 / data URI."""
    if key in ctx.files:
        return ctx.files[key]
    val = payload.get(key)
    if isinstance(val, (bytes, bytearray)):
        return bytes(val)
    if isinstance(val, str) and val:
        b64 = val.split(",", 1)[1] if val.startswith("data:") else val
        try:
            return base64.b64decode(b64, validate=False)
        except (binascii.Error, ValueError) as e:
            raise ModuleError(f"'{key}' alanı geçerli base64 değil") from e
    if len(ctx.files) == 1 and key in ("file", "image"):
        return next(iter(ctx.files.values()))
    if required:
        raise ModuleError(f"'{key}' dosyası gerekli (multipart alanı veya base64)")
    return None


def is_pdf(data: bytes) -> bool:
    return data[:5] == b"%PDF-"


# ----------------------------------------------------------------------------- meta


def note(ctx: RunContext, *, model: str | None = None, masked: int = 0, **meta: Any) -> None:
    if model:
        ctx.extra["model"] = model
    if masked:
        ctx.extra["masked_entities"] = int(ctx.extra.get("masked_entities", 0)) + int(masked)
    if meta:
        ctx.extra.setdefault("meta", {}).update(meta)


# ----------------------------------------------------------------------------- istemler ve LLM


@lru_cache(maxsize=64)
def load_prompt(name: str) -> str:
    p = PROMPTS_DIR / f"{name}.md"
    if not p.exists():
        raise ModuleError(f"Sistem istemi bulunamadı: {name}.md")
    return p.read_text(encoding="utf-8").strip()


def get_llm() -> LLMClient:
    return LLMClient()


# ----------------------------------------------------------------------------- kurulum durumu


def installed_module_ids() -> set[str] | None:
    """Kurulu modüller; kurulum bilgisi hiç yoksa None (çağıran 'bilinmiyor' kabul eder)."""
    try:
        from ...installer.installer import list_installed  # type: ignore[import-not-found]
    except Exception:
        list_installed = None
    if list_installed is not None:
        try:
            items = list_installed()
            ids = set()
            for it in items or []:
                if isinstance(it, str):
                    ids.add(it)
                elif isinstance(it, dict):
                    ids.add(it.get("module_id") or it.get("id"))
                else:
                    ids.add(getattr(it, "module_id", None) or getattr(it, "id", None))
            ids.discard(None)
            return ids  # type: ignore[return-value]
        except Exception as e:  # pragma: no cover
            log.warning("list_installed() başarısız: %s", e)
    try:
        from sqlalchemy import select

        from ...db import session_scope
        from ...installer.models import InstalledModule  # type: ignore[import-not-found]

        with session_scope() as s:
            return {m.module_id for m in s.scalars(select(InstalledModule))}
    except Exception:
        return None


def module_available(module_id: str, model_id: str | None = None) -> bool:
    """İsteğe bağlı bir modülün (ör. yeniden-siralama) kullanılabilir olup olmadığı."""
    ids = installed_module_ids()
    if ids:
        return module_id in ids
    return model_id is not None and model_dir(model_id) is not None


# ----------------------------------------------------------------------------- onay kuyruğu


def call_flex(fn, **kwargs):
    """Fonksiyonu yalnız kabul ettiği anahtar argümanlarla çağırır (başka ajanın API'sine dayanıklılık)."""
    try:
        params = inspect.signature(fn).parameters
    except (TypeError, ValueError):  # pragma: no cover
        return fn(**kwargs)
    if any(p.kind == p.VAR_KEYWORD for p in params.values()):
        return fn(**kwargs)
    return fn(**{k: v for k, v in kwargs.items() if k in params})


async def create_approval(module: str, action: str, payload: dict, user: str) -> tuple[str, bool]:
    """Onay kaydı açar. Dönüş: (approval_id, kalıcı_mı). Onay kuyruğu yoksa yerel kimlik üretir."""
    try:
        from ...erp.approvals import create_approval as _create
    except ImportError:
        return f"yerel-{uuid.uuid4().hex[:12]}", False
    aid = await asyncio.to_thread(
        call_flex, _create, module=module, action=action, payload=payload, requested_by=user
    )
    return str(getattr(aid, "id", aid)), True


# ----------------------------------------------------------------------------- temel sınıf


class BaseRuntime(ModuleRuntime):
    """`do_<eylem>` yönlendirmesi + LLM yardımcıları."""

    requires: tuple[str, ...] = ()  # sağlık denetiminde aranan Python paketleri
    uses_llm: bool = False

    async def run(self, action: str, payload: dict[str, Any], ctx: RunContext) -> dict[str, Any]:
        self.action(action)  # bilinmeyen eylem → ModuleError
        handler = getattr(self, f"do_{action}", None)
        if handler is None:  # pragma: no cover - her eylem uygulanmış olmalı
            raise ModuleError(f"{self.module_id}: '{action}' eylemi henüz uygulanmadı")
        return await handler(payload or {}, ctx)

    async def health(self) -> dict[str, Any]:
        missing = [p for p in self.requires if not has_package(p)]
        out: dict[str, Any] = {"module": self.module_id, "ready": not missing}
        if missing:
            out["missing"] = missing
            out["message"] = f"Eksik paketler: {', '.join(missing)}"
        if self.uses_llm:
            out["llm"] = "gerekli"
        return out

    # -- LLM
    def preferred_llms(self) -> list[str]:
        return [c.model for c in self.spec.components if c.role.startswith("llm") and c.model]

    async def llm(self, ctx: RunContext, messages: list[dict], **kw) -> LLMResult:
        res = await get_llm().chat(messages, preferred=self.preferred_llms(), **kw)
        note(ctx, model=res.model, masked=res.masked_entities)
        if res.endpoint != "yerel":
            note(ctx, llm_endpoint=res.endpoint)
        return res

    async def llm_prompt(
        self,
        ctx: RunContext,
        prompt: str,
        user_content: str,
        *,
        schema: dict | None = None,
        images: list[bytes] | None = None,
        system_extra: str = "",
        temperature: float = 0.2,
        max_tokens: int | None = None,
    ) -> LLMResult:
        system = load_prompt(prompt) + (("\n\n" + system_extra) if system_extra else "")
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user_content}]
        return await self.llm(
            ctx, messages, json_schema=schema, images=images, temperature=temperature, max_tokens=max_tokens
        )


NUMBER_RE = re.compile(r"(?<![\w.,])\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?(?![\w])|\d+(?:[.,]\d+)?")


def numbers_in(text: str) -> set[str]:
    """Metindeki sayıları normalize edilmiş biçimde (yalnız rakamlar ve ondalık) toplar."""
    out = set()
    for m in NUMBER_RE.finditer(text or ""):
        raw = m.group(0)
        digits = re.sub(r"[^\d]", "", raw)
        if digits:
            out.add(digits.lstrip("0") or "0")
    return out


__all__ = [
    "ApprovalRequired",
    "BaseRuntime",
    "ModuleError",
    "ModuleNotReady",
    "RunContext",
    "call_flex",
    "create_approval",
    "get_file",
    "get_llm",
    "get_settings",
    "has_package",
    "installed_module_ids",
    "is_pdf",
    "load_prompt",
    "model_not_installed",
    "module_available",
    "not_ready",
    "note",
    "numbers_in",
    "r2",
    "require",
    "require_model",
]
