"""N04 Sözleşme Analizi — taraflar, tarihler, yükümlülükler, riskler; standart metinle karşılaştırma.

Uzun sözleşmeler parçalara bölünür, her parçanın bulguları birleştirilir; rapor (markdown) kodda üretilir.
Kontrol listeleri: `data_dir/sozlesme_kontrol/<checklist_id>.json` (madde listesi);
standart metinler: `data_dir/sozlesme_standartlari/<standard_id>.md|.txt` veya gövdede `standard_text`.
"""

from __future__ import annotations

import json
import re

from ...runtimes.embeddings import chunk_text
from ..base import RunContext, get_runtime, register
from ._common import BaseRuntime, ModuleError, get_settings, note, require

_ITEMS = lambda props: {
    "type": "array",
    "items": {"type": "object", "properties": {k: {"type": "string"} for k in props}},
}
SCHEMA = {
    "type": "object",
    "required": ["parties", "dates", "obligations", "risks"],
    "properties": {
        "parties": _ITEMS(["name", "role"]),
        "dates": _ITEMS(["label", "value", "clause"]),
        "obligations": _ITEMS(["party", "obligation", "clause", "deadline"]),
        "risks": _ITEMS(["title", "severity", "clause", "explanation", "recommendation"]),
    },
}
COMPARE_SCHEMA = {
    "type": "object",
    "required": ["deviations", "missing_clauses", "summary"],
    "properties": {
        "deviations": _ITEMS(["clause", "standard", "contract", "severity", "recommendation"]),
        "missing_clauses": {"type": "array", "items": {"type": "string"}},
        "summary": {"type": "string"},
    },
}
CHUNK_WORDS = 2500
_SEV_ORDER = {"yüksek": 0, "orta": 1, "düşük": 2}


def _safe_id(v: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_\-]{1,64}", v or ""):
        raise ModuleError("Kimlik yalnız harf, rakam, '-' ve '_' içerebilir")
    return v


def _dedupe(items: list[dict]) -> list[dict]:
    seen, out = set(), []
    for it in items:
        if not isinstance(it, dict):
            continue
        key = json.dumps(it, sort_keys=True, ensure_ascii=False).casefold()
        if key not in seen:
            seen.add(key)
            out.append(it)
    return out


def build_report(res: dict) -> str:
    lines = [
        "# Sözleşme ön inceleme raporu",
        "",
        "> Bu rapor karar desteğidir; hukuki görüş yerine geçmez.",
        "",
    ]
    lines.append("## Taraflar")
    lines += [f"- **{p.get('name', '?')}** — {p.get('role', '')}" for p in res["parties"]] or [
        "- Belirlenemedi"
    ]
    lines += ["", "## Önemli tarihler ve süreler"]
    lines += [
        f"- {d.get('label', '')}: {d.get('value', '')} ({d.get('clause', '')})" for d in res["dates"]
    ] or ["- Yok"]
    lines += ["", "## Yükümlülükler"]
    lines += [
        f"- {o.get('party', '')}: {o.get('obligation', '')} — {o.get('clause', '')}"
        + (f" (süre: {o['deadline']})" if o.get("deadline") else "")
        for o in res["obligations"]
    ] or ["- Yok"]
    lines += ["", "## Riskler"]
    for r in res["risks"]:
        lines.append(
            f"- **[{r.get('severity', '?')}] {r.get('title', '')}** ({r.get('clause', '')}): "
            f"{r.get('explanation', '')} Öneri: {r.get('recommendation', '')}"
        )
    if not res["risks"]:
        lines.append("- Belirgin risk bulunmadı")
    return "\n".join(lines)


async def contract_text(payload: dict, ctx: RunContext) -> str:
    if payload.get("text"):
        return str(payload["text"])
    if "file" in ctx.files or payload.get("file"):
        parsed = await get_runtime("pdf-ayristirma").run(
            "parse", {k: v for k, v in payload.items() if k == "file"}, ctx
        )
        if parsed.get("is_scanned"):
            raise ModuleError("Belge taranmış görünüyor; önce 'ocr-belge-okuma' ile metne çevirin")
        return parsed.get("markdown", "")
    raise ModuleError("Zorunlu alan eksik: text (veya file)")


@register("sozlesme-analizi")
class SozlesmeAnalizi(BaseRuntime):
    uses_llm = True

    def _checklist(self, checklist_id: str | None) -> str:
        if not checklist_id:
            return ""
        p = get_settings().data_dir / "sozlesme_kontrol" / f"{_safe_id(checklist_id)}.json"
        if not p.exists():
            raise ModuleError(f"Kontrol listesi bulunamadı: {checklist_id}")
        items = json.loads(p.read_text(encoding="utf-8"))
        return "Ayrıca şu kontrol listesindeki her maddeyi değerlendir:\n" + "\n".join(
            f"- {i}" for i in items
        )

    async def do_analyze(self, payload: dict, ctx: RunContext) -> dict:
        text = await contract_text(payload, ctx)
        extra = self._checklist(payload.get("checklist_id"))
        parts = chunk_text(text, CHUNK_WORDS, 150) if len(text.split()) > CHUNK_WORDS * 1.2 else [text]
        merged = {"parties": [], "dates": [], "obligations": [], "risks": []}
        for i, part in enumerate(parts, 1):
            hdr = f"[Bölüm {i}/{len(parts)}]\n" if len(parts) > 1 else ""
            res = await self.llm_prompt(
                ctx, "sozlesme_analizi", hdr + part, schema=SCHEMA, system_extra=extra, temperature=0.0
            )
            for k in merged:
                merged[k].extend(res.parsed.get(k) or [])
        result = {k: _dedupe(v) for k, v in merged.items()}
        result["risks"].sort(key=lambda r: _SEV_ORDER.get(str(r.get("severity", "")).lower(), 3))
        result["report_md"] = build_report(result)
        note(ctx, chunks=len(parts))
        return result

    async def do_compare(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "standard_id")
        text = await contract_text(payload, ctx)
        standard = payload.get("standard_text")
        if not standard:
            sid = _safe_id(str(payload["standard_id"]))
            base = get_settings().data_dir / "sozlesme_standartlari"
            for ext in (".md", ".txt"):
                if (base / f"{sid}{ext}").exists():
                    standard = (base / f"{sid}{ext}").read_text(encoding="utf-8")
                    break
        if not standard:
            raise ModuleError(
                f"Standart sözleşme bulunamadı: {payload['standard_id']} "
                f"(data_dir/sozlesme_standartlari/<id>.md veya 'standard_text')"
            )
        user = f"STANDART METİN:\n{standard}\n\n---\n\nİNCELENEN SÖZLEŞME:\n{text}"
        res = await self.llm_prompt(
            ctx, "sozlesme_karsilastirma", user, schema=COMPARE_SCHEMA, temperature=0.0
        )
        p = res.parsed
        return {
            "deviations": _dedupe(p.get("deviations") or []),
            "missing_clauses": p.get("missing_clauses") or [],
            "summary": p.get("summary", ""),
        }
