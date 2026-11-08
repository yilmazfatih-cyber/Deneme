"""N06 Finans Hesap Motoru — deterministik hesaplar (numpy-financial). Sonuçları model değil kod üretir.

Oranlar ondalık (0.10) ya da yüzde (10) verilebilir: 1'den büyük oran yüzde kabul edilir ve meta'da belirtilir.
`ask` eylemi LLM'e yalnız parametre çıkarma ve yorum yaptırır; sayılar yine bu motordan gelir.
"""

from __future__ import annotations

import json
import math
from typing import Any

from ..base import register
from ._common import BaseRuntime, ModuleError, RunContext, note, r2, require

try:
    import numpy_financial as npf
except ImportError:  # pragma: no cover - temel bağımlılık
    npf = None


def _num(v: Any, name: str) -> float:
    try:
        x = float(v)
    except (TypeError, ValueError) as e:
        raise ModuleError(f"'{name}' sayı olmalı") from e
    if math.isnan(x) or math.isinf(x):
        raise ModuleError(f"'{name}' geçerli bir sayı değil")
    return x


def _rate(v: Any, name: str, notes: list[str]) -> float:
    x = _num(v, name)
    if abs(x) > 1:
        notes.append(f"'{name}' = {x} yüzde olarak yorumlandı (%{x} → {x / 100})")
        x = x / 100
    return x


def _flows(v: Any, name: str) -> list[float]:
    if not isinstance(v, (list, tuple)) or not v:
        raise ModuleError(f"'{name}' boş olmayan bir sayı listesi olmalı")
    return [_num(x, f"{name}[{i}]") for i, x in enumerate(v)]


def _series(v: Any, months: int, name: str) -> list[float]:
    if isinstance(v, (int, float)):
        return [float(v)] * months
    vals = _flows(v, name)
    if len(vals) == 1:
        return vals * months
    if len(vals) != months:
        raise ModuleError(f"'{name}' ya tek sayı ya da {months} elemanlı liste olmalı (gelen: {len(vals)})")
    return vals


# ----------------------------------------------------------------------------- saf hesaplar


def payback(investment: float, cash_flows: list[float], rate: float | None = None) -> dict:
    inv = abs(investment)
    cum = -inv
    dcum = -inv
    simple = None
    disc = None
    table = []
    for year, cf in enumerate(cash_flows, start=1):
        prev, prev_d = cum, dcum
        cum += cf
        dcf = cf / (1 + rate) ** year if rate is not None else None
        if dcf is not None:
            dcum += dcf
        if simple is None and cum >= 0 and cf > 0:
            simple = (year - 1) + (-prev) / cf
        if rate is not None and disc is None and dcum >= 0 and dcf and dcf > 0:
            disc = (year - 1) + (-prev_d) / dcf
        table.append(
            {
                "year": year,
                "cash_flow": r2(cf),
                "cumulative": r2(cum),
                "discounted_cash_flow": r2(dcf),
                "discounted_cumulative": r2(dcum) if rate is not None else None,
            }
        )
    return {"simple_years": r2(simple), "discounted_years": r2(disc), "table": table}


def npv_irr(rate: float, flows: list[float]) -> dict:
    npv = float(npf.npv(rate, flows))
    irr_raw = npf.irr(flows)
    irr = None if irr_raw is None or (isinstance(irr_raw, float) and math.isnan(irr_raw)) else float(irr_raw)
    initial = flows[0]
    pv_future = npv - initial
    pi = (pv_future / abs(initial)) if initial else None
    return {
        "npv": r2(npv),
        "irr": None if irr is None else round(irr, 6),
        "irr_pct": r2(irr * 100) if irr is not None else None,
        "profitability_index": None if pi is None else round(pi, 4),
        "pv_of_future_flows": r2(pv_future),
    }


def amortization(principal: float, annual_rate: float, months: int) -> dict:
    r = annual_rate / 12
    if r == 0:
        payment = principal / months
    else:
        payment = principal * r / (1 - (1 + r) ** -months)
    balance = principal
    rows = []
    total_interest = 0.0
    for m in range(1, months + 1):
        interest = balance * r
        principal_part = payment - interest
        if m == months:  # son taksitte yuvarlama farkı kapanır
            principal_part = balance
        balance -= principal_part
        total_interest += interest
        rows.append(
            {
                "month": m,
                "payment": r2(interest + principal_part),
                "interest": r2(interest),
                "principal": r2(principal_part),
                "balance": r2(max(balance, 0.0)),
            }
        )
    return {
        "payment": r2(payment),
        "monthly_rate": round(r, 6),
        "total_payment": r2(principal + total_interest),
        "total_interest": r2(total_interest),
        "table": rows,
    }


def cashflow_projection(months: int, opening: float, inflows: list[float], outflows: list[float]) -> dict:
    bal = opening
    cum_net = 0.0
    rows = []
    lowest = (None, math.inf)
    negative = []
    for m in range(months):
        op = bal
        net = inflows[m] - outflows[m]
        bal = op + net
        cum_net += net
        rows.append(
            {
                "month": m + 1,
                "opening": r2(op),
                "inflow": r2(inflows[m]),
                "outflow": r2(outflows[m]),
                "net": r2(net),
                "closing": r2(bal),
                "cumulative_net": r2(cum_net),
            }
        )
        if bal < lowest[1]:
            lowest = (m + 1, bal)
        if bal < 0:
            negative.append(m + 1)
    return {
        "table": rows,
        "closing_balance": r2(bal),
        "lowest_balance": r2(lowest[1]),
        "lowest_balance_month": lowest[0],
        "negative_months": negative,
        "total_inflow": r2(sum(inflows)),
        "total_outflow": r2(sum(outflows)),
    }


# ----------------------------------------------------------------------------- LLM araç tanımları

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "payback",
            "description": "Geri ödeme süresi (basit ve iskontolu)",
            "parameters": {
                "type": "object",
                "required": ["investment", "cash_flows"],
                "properties": {
                    "investment": {"type": "number", "description": "İlk yatırım tutarı (pozitif)"},
                    "cash_flows": {
                        "type": "array",
                        "items": {"type": "number"},
                        "description": "Yıllık net nakit girişleri",
                    },
                    "rate": {"type": "number", "description": "İskonto oranı, ondalık (0.10)"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "npv_irr",
            "description": "Net bugünkü değer, iç verim oranı ve kârlılık endeksi",
            "parameters": {
                "type": "object",
                "required": ["rate", "cash_flows"],
                "properties": {
                    "rate": {"type": "number", "description": "İskonto oranı, ondalık"},
                    "cash_flows": {
                        "type": "array",
                        "items": {"type": "number"},
                        "description": "0. dönem dahil nakit akışları (yatırım negatif)",
                    },
                    "investment": {
                        "type": "number",
                        "description": "Verilirse 0. döneme negatif olarak eklenir",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "amortization",
            "description": "Eşit taksitli kredi ödeme planı",
            "parameters": {
                "type": "object",
                "required": ["principal", "annual_rate", "months"],
                "properties": {
                    "principal": {"type": "number"},
                    "annual_rate": {"type": "number", "description": "Yıllık faiz, ondalık"},
                    "months": {"type": "integer"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "cashflow_projection",
            "description": "Aylık nakit akışı projeksiyonu",
            "parameters": {
                "type": "object",
                "required": ["months", "opening_balance", "inflows", "outflows"],
                "properties": {
                    "months": {"type": "integer"},
                    "opening_balance": {"type": "number"},
                    "inflows": {"type": "array", "items": {"type": "number"}},
                    "outflows": {"type": "array", "items": {"type": "number"}},
                },
            },
        },
    },
]


@register("finans-hesap")
class FinansHesap(BaseRuntime):
    requires = ("numpy_financial",)

    def _check(self):
        if npf is None:  # pragma: no cover
            raise ModuleError("numpy-financial kurulu değil")

    @staticmethod
    def _wrap(result: dict, payload: dict, notes: list[str]) -> dict:
        result["currency"] = payload.get("currency") or payload.get("para_birimi") or "TRY"
        if notes:
            result["notes"] = notes
        return result

    async def do_payback(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "investment", "cash_flows")
        notes: list[str] = []
        rate = _rate(payload["rate"], "rate", notes) if payload.get("rate") is not None else None
        res = payback(
            _num(payload["investment"], "investment"), _flows(payload["cash_flows"], "cash_flows"), rate
        )
        if res["simple_years"] is None:
            notes.append("Yatırım verilen dönemler içinde geri dönmüyor")
        if rate is None:
            notes.append("İskontolu geri ödeme için 'rate' verilmedi")
        note(ctx, engine="numpy-financial")
        return self._wrap(res, payload, notes)

    async def do_npv_irr(self, payload: dict, ctx: RunContext) -> dict:
        self._check()
        require(payload, "rate", "cash_flows")
        notes: list[str] = []
        rate = _rate(payload["rate"], "rate", notes)
        flows = _flows(payload["cash_flows"], "cash_flows")
        if payload.get("investment") is not None:
            flows = [-abs(_num(payload["investment"], "investment"))] + flows
        res = npv_irr(rate, flows)
        if res["irr"] is None:
            notes.append(
                "İç verim oranı hesaplanamadı: nakit akışlarında işaret değişimi yok veya çözüm yakınsamadı"
            )
        res["decision"] = "kabul edilebilir (NBD > 0)" if res["npv"] > 0 else "kabul edilemez (NBD ≤ 0)"
        note(ctx, engine="numpy-financial")
        return self._wrap(res, payload, notes)

    async def do_amortization(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "principal", "annual_rate", "months")
        notes: list[str] = []
        months = int(_num(payload["months"], "months"))
        if months <= 0 or months > 600:
            raise ModuleError("'months' 1 ile 600 arasında olmalı")
        principal = _num(payload["principal"], "principal")
        if principal <= 0:
            raise ModuleError("'principal' pozitif olmalı")
        res = amortization(principal, _rate(payload["annual_rate"], "annual_rate", notes), months)
        note(ctx, engine="numpy-financial")
        return self._wrap(res, payload, notes)

    async def do_cashflow_projection(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "months")
        months = int(_num(payload["months"], "months"))
        if months <= 0 or months > 600:
            raise ModuleError("'months' 1 ile 600 arasında olmalı")
        if (
            payload.get("opening_balance") is None
            or payload.get("inflows") is None
            or payload.get("outflows") is None
        ):
            raise ModuleError("Zorunlu alan eksik: opening_balance, inflows, outflows")
        res = cashflow_projection(
            months,
            _num(payload["opening_balance"], "opening_balance"),
            _series(payload["inflows"], months, "inflows"),
            _series(payload["outflows"], months, "outflows"),
        )
        note(ctx, engine="python")
        return self._wrap(res, payload, [])

    async def do_ask(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "question")
        from ._common import load_prompt

        messages = [
            {"role": "system", "content": load_prompt("finans_hesap")},
            {"role": "user", "content": str(payload["question"])},
        ]
        first = await self.llm(ctx, messages, tools=TOOLS, temperature=0.0)
        if not first.tool_calls:
            return {
                "answer": first.content,
                "calculations": [],
                "note": "Model hesap aracı çağırmadı; yanıt hesap içermez.",
            }
        calcs = []
        messages.append(
            {
                "role": "assistant",
                "content": first.content or "",
                "tool_calls": [
                    {
                        "id": tc["id"] or f"call_{i}",
                        "type": "function",
                        "function": {
                            "name": tc["name"],
                            "arguments": json.dumps(tc["arguments"], ensure_ascii=False),
                        },
                    }
                    for i, tc in enumerate(first.tool_calls)
                ],
            }
        )
        for i, tc in enumerate(first.tool_calls):
            name = tc["name"]
            handler = (
                getattr(self, f"do_{name}", None) if name in {t["function"]["name"] for t in TOOLS} else None
            )
            if handler is None:
                out: dict = {"error": f"Bilinmeyen araç: {name}"}
            else:
                try:
                    out = await handler(dict(tc["arguments"], currency=payload.get("currency")), ctx)
                except ModuleError as e:
                    out = {"error": str(e)}
            calcs.append({"tool": name, "arguments": tc["arguments"], "result": out})
            short = {k: v for k, v in out.items() if k != "table"}
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tc["id"] or f"call_{i}",
                    "content": json.dumps(short, ensure_ascii=False),
                }
            )
        final = await self.llm(ctx, messages, temperature=0.2)
        return {"answer": final.content, "calculations": calcs}
