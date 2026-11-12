"""Aşama 2 — Araç kaydı: araçlar içe aktarılınca kendini kaydeder; ajan yalnızca kayda bakar.

Gerçek karşılıkları: tools/registry.py (ToolRegistry.register, get_definitions, dispatch,
check_fn), toolsets.py (araç grupları), model_tools.py (handle_function_call).

Kurallar (gerçek depodan):
  * Her araç bir "toolset"e aittir; ajan hangi toolset'lerin açık olduğunu seçer.
  * check_fn araç "kullanılabilir mi?" sorusunu cevaplar (anahtar var mı, servis ayakta mı).
    Hayırsa araç modele hiç gösterilmez.
  * Araç sonucu her zaman metindir (JSON); hata da bir sonuçtur, istisna modele sızmaz.
"""

from __future__ import annotations

import ast
import json
import operator
from dataclasses import dataclass
from typing import Any, Callable


@dataclass
class ToolEntry:
    name: str
    toolset: str
    schema: dict[str, Any]
    handler: Callable[..., Any]
    check_fn: Callable[[], bool] | None = None


def tool_error(mesaj: str, **ek: Any) -> str:
    return json.dumps({"error": mesaj, **ek}, ensure_ascii=False)


class ToolRegistry:
    def __init__(self) -> None:
        self._araclar: dict[str, ToolEntry] = {}

    def register(self, name: str, toolset: str, schema: dict[str, Any], handler: Callable[..., Any], check_fn=None):
        if not isinstance(schema.get("parameters", {}), dict):
            raise ValueError(f"{name}: parameters bir JSON Şeması nesnesi olmalı")  # hatayı kayıtta yakala
        mevcut = self._araclar.get(name)
        if mevcut and mevcut.toolset != toolset:
            raise ValueError(f"{name} zaten {mevcut.toolset} araç grubunda kayıtlı")
        self._araclar[name] = ToolEntry(name, toolset, schema, handler, check_fn)

    def names(self) -> list[str]:
        return sorted(self._araclar)

    def toolsets(self) -> dict[str, list[str]]:
        gruplar: dict[str, list[str]] = {}
        for arac in self._araclar.values():
            gruplar.setdefault(arac.toolset, []).append(arac.name)
        return gruplar

    def available(self, enabled_toolsets: set[str] | None = None) -> list[ToolEntry]:
        return [
            a
            for a in sorted(self._araclar.values(), key=lambda a: a.name)
            if (enabled_toolsets is None or a.toolset in enabled_toolsets) and (a.check_fn is None or a.check_fn())
        ]

    def get_definitions(self, enabled_toolsets: set[str] | None = None) -> list[dict[str, Any]]:
        """Modele gönderilen OpenAI biçimli araç listesi. Oturum boyunca sabit tutulmalı."""
        return [
            {"type": "function", "function": {"name": a.name, **a.schema}} for a in self.available(enabled_toolsets)
        ]

    def dispatch(self, name: str, args: dict[str, Any], **baglam: Any) -> str:
        arac = self._araclar.get(name)
        if arac is None:
            return tool_error(f"bilinmeyen araç: {name}", gecerli_araclar=self.names())
        try:
            sonuc = arac.handler(args, **baglam)
        except Exception as hata:  # araç hatası modele düz metin olarak döner, döngü çökmez
            return tool_error(f"{name} başarısız: {type(hata).__name__}: {hata}")
        return sonuc if isinstance(sonuc, str) else json.dumps(sonuc, ensure_ascii=False)


registry = ToolRegistry()  # süreç genelinde tek kayıt (gerçekte de modül düzeyinde)


# --------------------------------------------------------------------------- çekirdek araçlar
_ISLEMLER = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


def guvenli_hesapla(ifade: str) -> float:
    """Yalnızca sayılar ve + - * / ** ( ) — eval() KULLANMADAN."""

    def degerlendir(dugum: ast.AST) -> float:
        if isinstance(dugum, ast.Expression):
            return degerlendir(dugum.body)
        if isinstance(dugum, ast.Constant) and isinstance(dugum.value, (int, float)):
            return dugum.value
        if isinstance(dugum, ast.BinOp) and type(dugum.op) in _ISLEMLER:
            sag = degerlendir(dugum.right)
            if isinstance(dugum.op, ast.Pow) and abs(sag) > 100:
                raise ValueError("üs çok büyük")
            return _ISLEMLER[type(dugum.op)](degerlendir(dugum.left), sag)
        if isinstance(dugum, ast.UnaryOp) and type(dugum.op) in _ISLEMLER:
            return _ISLEMLER[type(dugum.op)](degerlendir(dugum.operand))
        raise ValueError(f"izin verilmeyen ifade parçası: {type(dugum).__name__}")

    return degerlendir(ast.parse(ifade.replace(",", "."), mode="eval"))


registry.register(
    "hesapla",
    "hesap",
    {
        "description": "Aritmetik ifadeyi güvenle hesaplar. Örn. '1000*0.20'.",
        "parameters": {"type": "object", "properties": {"ifade": {"type": "string"}}, "required": ["ifade"]},
    },
    lambda args, **_: {"sonuc": round(guvenli_hesapla(args["ifade"]), 6)},
)

registry.register(
    "memory",
    "memory",
    {
        "description": "Kalıcı hafıza. target='user' kullanıcı hakkında, 'memory' kendi notların. "
        "action: add | replace | remove. Yazılanlar BİR SONRAKİ oturumda istemde görünür.",
        "parameters": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["add", "replace", "remove"]},
                "target": {"type": "string", "enum": ["memory", "user"]},
                "content": {"type": "string"},
                "old_text": {"type": "string"},
            },
            "required": ["action"],
        },
    },
    lambda args, memory_store=None, **_: (
        memory_store.apply(
            args["action"], args.get("target", "memory"), args.get("content", ""), args.get("old_text", "")
        )
        if memory_store
        else tool_error("hafıza kapalı")
    ),
)

registry.register(
    "session_search",
    "session_search",
    {
        "description": "Geçmiş oturumlarda tam metin arama (FTS5). 'Geçen sefer ne konuşmuştuk?' soruları için.",
        "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]},
    },
    lambda args, session_db=None, session_id=None, **_: {
        "sonuclar": session_db.search(args["query"], exclude_session_ids=(session_id,) if session_id else ())
    },
    check_fn=lambda: True,
)
