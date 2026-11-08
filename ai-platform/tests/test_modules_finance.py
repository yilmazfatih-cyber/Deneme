"""Finans hesap motoru — bilinen sonuçlarla deterministik testler."""

from __future__ import annotations

import numpy_financial as npf
import pytest

import aiplatform.modules.runtimes  # noqa: F401  (@register)
from aiplatform.config import reset_settings
from aiplatform.db import init_db
from aiplatform.modules.base import ModuleError, ModuleNotReady, RunContext, get_runtime
from aiplatform.runtimes.llm import LLMClient, LLMResult


@pytest.fixture
def rt(aip_data_dir, monkeypatch):
    monkeypatch.setenv("AIP_LLM_BASE_URL", "http://127.0.0.1:9/v1")  # LLM yok
    reset_settings()
    init_db()
    return get_runtime("finans-hesap")


async def run(rt, action, payload):
    ctx = RunContext()
    return await rt.run(action, payload, ctx), ctx


async def test_payback_simple_and_discounted(rt):
    res, ctx = await run(
        rt, "payback", {"investment": 100, "cash_flows": [30] * 5, "rate": 0.10, "currency": "TRY"}
    )
    assert res["simple_years"] == 3.33
    # iskontolu: kümülatif 4. yılda -4.90, 5. yıl iskontolu akış 18.63 → 4 + 4.90/18.63
    disc = [30 / 1.1**t for t in range(1, 6)]
    cum = -100 + sum(disc[:4])
    assert res["discounted_years"] == pytest.approx(round(4 + (-cum) / disc[4], 2))
    assert len(res["table"]) == 5 and res["table"][2]["cumulative"] == -10.0
    assert res["currency"] == "TRY" and ctx.extra["meta"]["engine"] == "numpy-financial"


async def test_payback_never(rt):
    res, _ = await run(rt, "payback", {"investment": 1000, "cash_flows": [10, 10]})
    assert res["simple_years"] is None and any("geri dönmüyor" in n for n in res["notes"])


async def test_npv_irr(rt):
    res, _ = await run(rt, "npv_irr", {"rate": 0.10, "cash_flows": [-100, 60, 60]})
    assert res["npv"] == 4.13
    assert res["irr"] == pytest.approx(float(npf.irr([-100, 60, 60])), abs=1e-6)
    assert res["profitability_index"] == pytest.approx(104.13 / 100, abs=1e-3)
    assert "kabul edilebilir" in res["decision"]


async def test_npv_with_investment_and_percent_rate(rt):
    res, _ = await run(rt, "npv_irr", {"rate": 10, "investment": 100, "cash_flows": [60, 60]})
    assert res["npv"] == 4.13 and any("yüzde" in n for n in res["notes"])


async def test_irr_none_when_no_sign_change(rt):
    res, _ = await run(rt, "npv_irr", {"rate": 0.1, "cash_flows": [100, 50]})
    assert res["irr"] is None and any("İç verim" in n for n in res["notes"])


async def test_amortization_matches_numpy_financial(rt):
    res, _ = await run(rt, "amortization", {"principal": 120000, "annual_rate": 0.24, "months": 12})
    expected = round(float(-npf.pmt(0.02, 12, 120000)), 2)
    assert res["payment"] == expected
    assert 11340 < res["payment"] < 11350
    assert len(res["table"]) == 12 and res["table"][-1]["balance"] == 0.0
    assert res["table"][0]["interest"] == 2400.0
    assert res["total_interest"] == pytest.approx(res["total_payment"] - 120000, abs=0.01)


async def test_amortization_zero_rate(rt):
    res, _ = await run(rt, "amortization", {"principal": 1200, "annual_rate": 0, "months": 12})
    assert res["payment"] == 100.0 and res["total_interest"] == 0.0


async def test_cashflow_projection(rt):
    res, _ = await run(
        rt,
        "cashflow_projection",
        {"months": 3, "opening_balance": 100, "inflows": 50, "outflows": [100, 20, 200]},
    )
    assert [r["closing"] for r in res["table"]] == [50.0, 80.0, -70.0]
    assert res["lowest_balance"] == -70.0 and res["lowest_balance_month"] == 3
    assert res["negative_months"] == [3] and res["table"][2]["cumulative_net"] == -170.0


@pytest.mark.parametrize(
    "action,payload",
    [
        ("payback", {"investment": "abc", "cash_flows": [1]}),
        ("npv_irr", {"rate": 0.1, "cash_flows": []}),
        ("amortization", {"principal": 100, "annual_rate": 0.1, "months": 0}),
        ("cashflow_projection", {"months": 2, "opening_balance": 0, "inflows": [1, 2, 3], "outflows": 0}),
        ("payback", {"cash_flows": [1]}),
    ],
)
async def test_invalid_input(rt, action, payload):
    with pytest.raises(ModuleError):
        await run(rt, action, payload)


async def test_unknown_action(rt):
    with pytest.raises(ModuleError, match="bilinmeyen eylem"):
        await run(rt, "yok", {})


async def test_ask_without_llm_is_not_ready(rt):
    with pytest.raises(ModuleNotReady):
        await run(rt, "ask", {"question": "100 TL yatırım, 2 yıl 60 TL, %10 ile NBD?"})


async def test_ask_with_tool_calling(rt, monkeypatch):
    calls = []

    async def fake_chat(self, messages, **kw):
        calls.append(kw)
        if len(calls) == 1:
            assert kw["tools"] and {t["function"]["name"] for t in kw["tools"]} == {
                "payback",
                "npv_irr",
                "amortization",
                "cashflow_projection",
            }
            return LLMResult(
                content="",
                model="qwen3.5-4b",
                tool_calls=[
                    {"id": "c1", "name": "npv_irr", "arguments": {"rate": 0.1, "cash_flows": [-100, 60, 60]}}
                ],
            )
        tool_msg = messages[-1]
        assert tool_msg["role"] == "tool" and '"npv": 4.13' in tool_msg["content"]
        return LLMResult(content="Net bugünkü değer 4,13 TL; proje kabul edilebilir.", model="qwen3.5-4b")

    monkeypatch.setattr(LLMClient, "chat", fake_chat)
    res, ctx = await run(rt, "ask", {"question": "NBD nedir?"})
    assert res["calculations"][0]["result"]["npv"] == 4.13
    assert "4,13" in res["answer"] and ctx.extra["model"] == "qwen3.5-4b"
