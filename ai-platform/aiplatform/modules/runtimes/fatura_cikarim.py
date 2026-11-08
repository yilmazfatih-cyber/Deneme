"""N05 Fatura/Belge Çıkarım — OCR (veya PDF metin katmanı) → LLM JSON çıkarımı → kodda aritmetik doğrulama.

`propose_entry` ERP'ye kayıt ÖNERİR: onay kuyruğuna düşer (202). Onaylanınca (`ctx.extra["approved"]`) gövdede
`connection_id` + `tool` varsa bağlayıcının onaylı yazma aracı çalışır; yoksa onaylı kayıt önerisi döner.
"""

from __future__ import annotations

import asyncio
import io
import re
from typing import Any

from ...kvkk.tckn import is_valid_tckn, is_valid_vkn
from ..base import get_runtime, register
from ._common import (
    ApprovalRequired,
    BaseRuntime,
    ModuleError,
    RunContext,
    create_approval,
    get_file,
    has_package,
    is_pdf,
    note,
    r2,
    require,
)

_S = {"type": ["string", "null"]}
_N = {"type": ["number", "null"]}
LINE = {
    "type": "object",
    "properties": {
        "aciklama": _S,
        "miktar": _N,
        "birim": _S,
        "birim_fiyat": _N,
        "kdv_orani": _N,
        "iskonto": _N,
        "tutar": _N,
    },
}
SCHEMAS: dict[str, dict] = {
    "fatura": {
        "fields": {
            k: _S
            for k in (
                "belge_no",
                "tarih",
                "vade",
                "satici_unvan",
                "satici_vkn",
                "satici_vergi_dairesi",
                "alici_unvan",
                "alici_vkn",
                "para_birimi",
                "ettn",
            )
        }
        | {k: _N for k in ("ara_toplam", "iskonto_toplam", "kdv_toplam", "genel_toplam")},
        "lines": True,
    },
    "irsaliye": {
        "fields": {
            k: _S
            for k in (
                "belge_no",
                "tarih",
                "sevk_tarihi",
                "gonderen_unvan",
                "gonderen_vkn",
                "alici_unvan",
                "alici_vkn",
                "teslim_adresi",
                "plaka",
            )
        },
        "lines": True,
    },
    "dekont": {
        "fields": {
            k: _S
            for k in (
                "banka",
                "islem_tarihi",
                "gonderen",
                "gonderen_iban",
                "alici",
                "alici_iban",
                "aciklama",
                "referans_no",
                "para_birimi",
            )
        }
        | {"tutar": _N},
        "lines": False,
    },
    "form": {"fields": None, "lines": False},
}


def build_schema(schema_id: str) -> dict:
    spec = SCHEMAS[schema_id]
    fields = {"type": "object", "properties": spec["fields"]} if spec["fields"] else {"type": "object"}
    props: dict[str, Any] = {"fields": fields}
    if spec["lines"]:
        props["lines"] = {"type": "array", "items": LINE}
    return {"type": "object", "required": list(props), "properties": props}


def to_number(v: Any) -> float | None:
    """'1.234,50' / '1,234.50' / '1234.5' / 1234.5 → 1234.5"""
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = re.sub(r"[^\d,.\-]", "", str(v))
    if not s or s in "-.,":
        return None
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".") if s.rfind(",") > s.rfind(".") else s.replace(",", "")
    elif "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif s.count(".") > 1:
        s = s.replace(".", "")
    try:
        return float(s)
    except ValueError:
        return None


def _close(a: float, b: float) -> bool:
    return abs(a - b) <= max(0.05, 0.005 * abs(b))


def validate(fields: dict, lines: list[dict]) -> dict:
    checks: list[dict] = []

    def add(cid: str, ok: bool, message: str, expected=None, found=None):
        checks.append({"id": cid, "ok": ok, "message": message, "expected": r2(expected), "found": r2(found)})

    line_totals, kdv_sum, kdv_known = [], 0.0, True
    for i, ln in enumerate(lines, 1):
        q, p, t = to_number(ln.get("miktar")), to_number(ln.get("birim_fiyat")), to_number(ln.get("tutar"))
        disc = to_number(ln.get("iskonto")) or 0.0
        if t is not None:
            line_totals.append(t)
        if q is not None and p is not None and t is not None:
            exp = q * p - disc
            ok = _close(exp, t)
            add(
                f"satir_{i}",
                ok,
                "Satır tutarı miktar × birim fiyat ile uyumlu"
                if ok
                else f"{i}. satır tutarı miktar × birim fiyattan farklı (iskonto olabilir)",
                exp,
                t,
            )
        rate = to_number(ln.get("kdv_orani"))
        if rate is not None and t is not None:
            kdv_sum += t * rate / 100
        else:
            kdv_known = False

    ara, kdv, genel = (to_number(fields.get(k)) for k in ("ara_toplam", "kdv_toplam", "genel_toplam"))
    iskonto = to_number(fields.get("iskonto_toplam")) or 0.0
    if ara is not None and line_totals:
        s = sum(line_totals)
        ok = _close(s, ara) or _close(s - iskonto, ara)
        add(
            "ara_toplam",
            ok,
            "Satır toplamı ara toplamla uyumlu" if ok else "Satır toplamı ara toplamla uyuşmuyor",
            s,
            ara,
        )
    if kdv is not None and lines and kdv_known:
        ok = _close(kdv_sum, kdv)
        add(
            "kdv_toplam",
            ok,
            "KDV toplamı satır oranlarıyla uyumlu" if ok else "KDV toplamı satır oranlarıyla uyuşmuyor",
            kdv_sum,
            kdv,
        )
    if ara is not None and kdv is not None and genel is not None:
        ok = _close(ara + kdv, genel) or _close(ara - iskonto + kdv, genel)
        add(
            "genel_toplam",
            ok,
            "Ara toplam + KDV genel toplamla uyumlu" if ok else "Ara toplam + KDV genel toplamı vermiyor",
            ara + kdv,
            genel,
        )
    for key in ("satici_vkn", "alici_vkn", "gonderen_vkn"):
        raw = fields.get(key)
        if raw:
            digits = re.sub(r"\D", "", str(raw))
            if len(digits) == 10:
                ok = is_valid_vkn(digits)
            elif len(digits) == 11:
                ok = is_valid_tckn(digits)
            else:
                ok = False
            add(
                key,
                ok,
                "Vergi/TC kimlik numarası sağlama algoritmasına uygun"
                if ok
                else "Vergi/TC kimlik numarası sağlama algoritmasına uymuyor (OCR hatası olabilir)",
            )
    passed = sum(1 for c in checks if c["ok"])
    return {"ok": passed == len(checks), "passed": passed, "total": len(checks), "checks": checks}


def _pdf_text(data: bytes) -> str:
    if not has_package("pdfplumber"):
        return ""
    import pdfplumber

    with pdfplumber.open(io.BytesIO(data)) as pdf:
        return "\n".join((p.extract_text() or "") for p in pdf.pages)


@register("fatura-cikarim")
class FaturaCikarim(BaseRuntime):
    uses_llm = True

    async def _document_text(self, payload: dict, ctx: RunContext) -> str:
        if payload.get("text"):
            note(ctx, source="metin")
            return str(payload["text"])
        data = get_file(payload, ctx, "file")
        if is_pdf(data):
            text = await asyncio.to_thread(_pdf_text, data)
            if len(text.strip()) > 50:
                note(ctx, source="pdf-metin-katmani")
                return text
        ocr = await get_runtime("ocr-belge-okuma").run(
            "read",
            {},
            RunContext(user=ctx.user, role=ctx.role, files={"file": data}, request_id=ctx.request_id),
        )
        note(ctx, source="ocr", ocr_engine=ocr.get("engine"))
        return ocr.get("markdown", "")

    async def do_extract(self, payload: dict, ctx: RunContext) -> dict:
        schema_id = payload.get("schema_id") or "fatura"
        if schema_id not in SCHEMAS:
            raise ModuleError(f"Geçersiz belge türü '{schema_id}'. Seçenekler: {', '.join(SCHEMAS)}")
        text = await self._document_text(payload, ctx)
        if not text.strip():
            raise ModuleError("Belgeden metin okunamadı")
        res = await self.llm_prompt(
            ctx,
            "fatura_cikarim",
            f"Belge türü: {schema_id}\n\nBELGE METNİ:\n{text}",
            schema=build_schema(schema_id),
            temperature=0.0,
        )
        fields = res.parsed.get("fields") or {}
        lines = [ln for ln in res.parsed.get("lines") or [] if isinstance(ln, dict)]
        validation = validate(fields, lines)
        filled = [v for v in fields.values() if v not in (None, "")]
        fill_ratio = len(filled) / len(fields) if fields else 0.0
        check_ratio = validation["passed"] / validation["total"] if validation["total"] else 0.5
        confidence = round(0.5 * fill_ratio + 0.5 * check_ratio, 2)
        return {
            "fields": fields,
            "lines": lines,
            "validation": validation,
            "confidence": confidence,
            "schema_id": schema_id,
        }

    async def do_propose_entry(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "fields")
        if ctx.extra.get("approved"):
            if payload.get("connection_id") and payload.get("tool"):
                from ...erp.connector import get_connector

                result = await asyncio.to_thread(
                    get_connector(payload["connection_id"]).execute_write,
                    payload["tool"],
                    payload.get("args") or {"fields": payload["fields"], "lines": payload.get("lines", [])},
                    ctx.extra.get("approval_id"),
                )
                return {"status": "aktarıldı", "result": result}
            return {
                "status": "onaylandı",
                "entry": {"fields": payload["fields"], "lines": payload.get("lines", [])},
                "message": "Kayıt önerisi onaylandı; ERP aktarımı için bağlantı ve araç tanımlanmamış.",
            }
        aid, persisted = await create_approval(self.module_id, "propose_entry", payload, ctx.user)
        note(ctx, approval_persisted=persisted)
        raise ApprovalRequired(aid, "Kayıt önerisi insan onayına gönderildi")
