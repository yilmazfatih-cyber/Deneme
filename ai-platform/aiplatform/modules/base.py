"""Modül çalışma zamanı sözleşmesi.

Her katalog modülü için bir `ModuleRuntime` alt sınıfı vardır ve `@register("modul-id")` ile kaydedilir.
API katmanı `POST /api/modules/{module_id}/run/{action}` isteğini şu şekilde işler:

    runtime = get_runtime(module_id)          # kurulu değilse 409
    result  = await runtime.run(action, payload, ctx)

`payload` JSON gövdesidir; dosya yüklemeleri `ctx.files` içinde (alan adı → bytes) gelir.
Çalışma zamanı, eksik bağımlılıkta `ModuleNotReady` fırlatır; API bunu 503 + kurulum yönlendirmesine çevirir.
"""

from __future__ import annotations

import abc
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from ..catalog import ModuleSpec, get_catalog


class ModuleError(Exception):
    """Kullanıcıya gösterilebilir modül hatası (400)."""


class ModuleNotReady(ModuleError):
    """Model ağırlığı / bağımlılık / LLM sunucusu hazır değil (503)."""


class ApprovalRequired(ModuleError):
    """İşlem insan onayı kuyruğuna alındı (202). `approval_id` taşır."""

    def __init__(self, approval_id: str, message: str = "İnsan onayı bekleniyor"):
        super().__init__(message)
        self.approval_id = approval_id


@dataclass
class RunContext:
    user: str = "anonim"
    role: str = "server"
    files: dict[str, bytes] = field(default_factory=dict)
    request_id: str | None = None
    # KVKK: istek maskelendiyse eşleme anahtarı; yanıt geri açılırken kullanılır
    mapping_id: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


class ModuleRuntime(abc.ABC):
    module_id: str

    def __init__(self) -> None:
        self.spec: ModuleSpec = get_catalog().modules[self.module_id]

    @abc.abstractmethod
    async def run(self, action: str, payload: dict[str, Any], ctx: RunContext) -> dict[str, Any]:
        """Eylemi çalıştırır; JSON'a çevrilebilir sözlük döner."""

    async def health(self) -> dict[str, Any]:
        """Varsayılan: bileşenlerin yüklü olup olmadığı. Alt sınıflar genişletir."""
        return {"module": self.module_id, "ready": True}

    def action(self, action_id: str):
        for a in self.spec.actions:
            if a.id == action_id:
                return a
        raise ModuleError(f"{self.module_id}: bilinmeyen eylem '{action_id}'")


_REGISTRY: dict[str, type[ModuleRuntime]] = {}
_INSTANCES: dict[str, ModuleRuntime] = {}


def register(module_id: str) -> Callable[[type[ModuleRuntime]], type[ModuleRuntime]]:
    def deco(cls: type[ModuleRuntime]) -> type[ModuleRuntime]:
        cls.module_id = module_id
        _REGISTRY[module_id] = cls
        return cls

    return deco


def registered_modules() -> list[str]:
    return sorted(_REGISTRY)


def get_runtime(module_id: str) -> ModuleRuntime:
    if module_id not in _REGISTRY:
        raise ModuleError(f"'{module_id}' için çalışma zamanı kayıtlı değil")
    if module_id not in _INSTANCES:
        _INSTANCES[module_id] = _REGISTRY[module_id]()
    return _INSTANCES[module_id]


def reset_runtimes() -> None:
    _INSTANCES.clear()
