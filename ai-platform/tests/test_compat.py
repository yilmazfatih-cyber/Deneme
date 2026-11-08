"""Uygunluk denetimi: sahte profillerle (T0, T1, T2, Apple) katalogdaki gerçek modüller."""

from __future__ import annotations

import pytest

from aiplatform.catalog import get_catalog
from aiplatform.hardware.compat import capacity, check_module, plan_all, select_artifact
from aiplatform.hardware.probe import GPUInfo
from tests.profiles import apple_m4_max, make_profile, t0, t1, t2

QWEN = "qwen3.5-35b-a3b"


@pytest.fixture(scope="module")
def cat():
    return get_catalog()


def _check(report, cid):
    return next(c for c in report.checks if c.id == cid)


def _sel(report, role):
    return next(s for s in report.selected if s.role == role)


def test_report_shape_matches_contract(cat):
    r = check_module(cat, "fatura-cikarim", t2(), set()).model_dump()
    assert {
        "module_id",
        "target",
        "status",
        "selected",
        "totals",
        "checks",
        "missing_dependencies",
        "recommendation",
    } <= set(r)
    assert {
        "role",
        "model",
        "artifact",
        "runtime",
        "disk_gb",
        "ram_gb",
        "vram_gb",
        "shared_already_installed",
    } <= set(r["selected"][0])
    assert {"vram_used_gb", "vram_total_gb", "vram_pct", "ram_pct", "disk_pct"} <= set(
        r["totals"]["after_install"]
    )
    assert {"id", "status", "message", "required", "available"} <= set(r["checks"][0])


# ───────────── ana-model


def test_ana_model_t0_cpu_warning(cat):
    """GPU yok, gpu_required değil → vram denetimi warn + cpu_note. 16 GB RAM'de 35B MoE (26+2 GB) sığmaz."""
    r = check_module(cat, "ana-model", t0(), set(), installed_modules={"kvkk-kalkani"})
    vram = _check(r, "vram")
    assert vram.status == "warn"
    assert vram.message.startswith("GPU yok:")
    assert _sel(r, "llm").cpu_note
    assert _sel(r, "llm").artifact == "q4_k_m"
    assert _check(r, "ram").status == "fail"  # 28 GB > 16 GB
    assert r.status == "fail"


def test_ana_model_t0_big_ram_is_warn(cat):
    r = check_module(cat, "ana-model", t0(ram=64), set(), installed_modules={"kvkk-kalkani"})
    assert _check(r, "vram").status == "warn"
    assert r.status == "warn"
    assert r.recommendation.startswith("GPU yok:")


def test_ana_model_t1_fails_with_kv_cache(cat):
    """RTX 4090: 24 GB ağırlık + 8 kullanıcı × 0,25 GB KV = 26 GB > 24 GB."""
    r = check_module(cat, "ana-model", t1(), set(), installed_modules={"kvkk-kalkani"})
    llm = _sel(r, "llm")
    assert llm.artifact == "q4_k_m" and llm.on_gpu
    assert llm.vram_gb == pytest.approx(26)
    assert llm.kv_cache_gb == pytest.approx(2)
    vram = _check(r, "vram")
    assert vram.status == "fail" and vram.required == pytest.approx(26)
    assert r.status == "fail"
    assert "VRAM'li GPU gerekir" in r.recommendation


def test_ana_model_t2_ok(cat):
    r = check_module(cat, "ana-model", t2(), set(), installed_modules={"kvkk-kalkani"})
    assert r.status == "ok", r.checks
    # fp8 (vLLM, 44+2 GB) 48 GB'ın %90'ını aşar → sığan GGUF seçilir
    assert _sel(r, "llm").artifact == "q4_k_m"
    assert r.totals.vram_gb == pytest.approx(26)
    assert r.recommendation == "Kurulabilir: 26 GB VRAM gerekir, 48 GB mevcut."
    assert "guard" in r.skipped_optional


def test_ana_model_big_gpu_prefers_vllm(cat):
    p = make_profile(
        ram=256, gpus=[GPUInfo(vendor="nvidia", name="RTX PRO 6000", vram_gb=96)], docker_gpu=True
    )
    r = check_module(cat, "ana-model", p, set(), installed_modules={"kvkk-kalkani"})
    assert _sel(r, "llm").artifact == "fp8" and _sel(r, "llm").runtime == "vllm"
    assert r.status == "ok"


def test_ana_model_apple_unified(cat):
    r = check_module(cat, "ana-model", apple_m4_max(), set(), installed_modules={"kvkk-kalkani"})
    llm = _sel(r, "llm")
    assert llm.artifact == "q4_k_m" and llm.on_gpu
    assert r.status in ("ok", "warn")  # katman uyarısı olabilir (T1 < T2)
    assert _check(r, "vram").status == "ok"
    assert _check(r, "ram").message.find("birleşik bellek") > 0


def test_ana_model_client_role_delegates(cat):
    r = check_module(cat, "ana-model", t0(role="client"), set(), installed_modules={"kvkk-kalkani"})
    assert r.target == "client"
    assert all(s.delegated for s in r.selected)
    assert r.totals.vram_gb == 0 and r.totals.ram_gb == 0
    assert r.status == "ok"
    assert "sunucuda" in _sel(r, "llm").note


def test_explicit_target_overrides_role(cat):
    r = check_module(
        cat, "ana-model", t2(role="client"), set(), target="server", installed_modules={"kvkk-kalkani"}
    )
    assert r.target == "server" and not _sel(r, "llm").delegated


# ───────────── kvkk-kalkani her yerde uygun


@pytest.mark.parametrize(
    "profile", [t0(), t1(), t2(), apple_m4_max(), t0(role="client")], ids=["T0", "T1", "T2", "M4", "istemci"]
)
def test_kvkk_kalkani_ok_everywhere(cat, profile):
    r = check_module(cat, "kvkk-kalkani", profile, set())
    assert r.status == "ok", [(c.id, c.status, c.message) for c in r.checks]
    assert r.missing_dependencies == []


# ───────────── bağımlılıklar, paylaşım, seçenekler


def test_fatura_missing_dependencies(cat):
    r = check_module(cat, "fatura-cikarim", t2(), set())
    assert r.missing_dependencies == ["kvkk-kalkani", "ana-model", "ocr-belge-okuma"]
    assert _check(r, "dependencies").status == "warn"


def test_installed_modules_inferred_from_pairs(cat):
    installed = {
        ("presidio", "default"),
        ("gliner-multi-pii-v1", "default"),
        (QWEN, "q4_k_m"),
        ("paddleocr-vl-1.6", "default"),
    }
    r = check_module(cat, "fatura-cikarim", t2(), installed)
    assert r.missing_dependencies == []


def test_shared_installed_model_counts_zero(cat):
    installed = {(QWEN, "q4_k_m")}
    r = check_module(cat, "fatura-cikarim", t2(), installed)
    llm = _sel(r, "llm")
    assert llm.shared_already_installed
    assert (llm.disk_gb, llm.ram_gb, llm.vram_gb) == (0, 0, 0)
    assert r.totals.vram_gb == pytest.approx(3)  # yalnız OCR
    # kurulu kullanım kapasiteye dahil: 26 (qwen + KV) + 3
    assert r.totals.after_install.vram_used_gb == pytest.approx(29)


def test_example_from_contract_27gb(cat):
    """MIMARI.md örneği: OCR 3 + LLM 24 (+2 KV) VRAM, 48 GB mevcut → kurulabilir."""
    r = check_module(
        cat, "fatura-cikarim", t2(), set(), installed_modules={"kvkk-kalkani", "ana-model", "ocr-belge-okuma"}
    )
    assert r.status == "ok"
    assert r.totals.vram_gb == pytest.approx(29)
    assert r.recommendation.startswith("Kurulabilir: 29 GB VRAM gerekir, 48 GB mevcut")


def test_optional_gpu_required_fails_without_gpu(cat):
    r = check_module(cat, "fatura-cikarim", t0(ram=256), set(), with_optional=True)
    assert _sel(r, "extractor").gpu_required
    assert _check(r, "vram").status == "fail"
    assert r.status == "fail"
    assert "GPU gerekir" in r.recommendation


def test_artifact_override(cat):
    r = check_module(
        cat, "ana-model", t2(), set(), artifacts={"llm": "fp8"}, installed_modules={"kvkk-kalkani"}
    )
    assert _sel(r, "llm").artifact == "fp8"
    assert r.status == "fail"  # 46/48 GB > %90


def test_vllm_without_docker_fails(cat):
    r = check_module(
        cat, "ana-model", t1(), set(), artifacts={"llm": "fp8"}, installed_modules={"kvkk-kalkani"}
    )
    assert _check(r, "runtime").status == "fail"


def test_disk_insufficient(cat):
    r = check_module(cat, "ana-model", t2(disk_free=10), set(), installed_modules={"kvkk-kalkani"})
    d = _check(r, "disk")
    assert d.status == "fail" and d.required == pytest.approx(23)
    assert r.status == "fail"


def test_warn_threshold(cat):
    """%75-%90 arası doluluk → warn."""
    p = make_profile(ram=64, gpus=[GPUInfo(vendor="nvidia", name="32GB", vram_gb=32)])
    r = check_module(cat, "ana-model", p, set(), installed_modules={"kvkk-kalkani"})
    assert _check(r, "vram").status == "warn"  # 26/32 = %81


def test_concurrent_users_changes_kv(cat):
    r = check_module(cat, "ana-model", t2(), set(), concurrent_users=40, installed_modules={"kvkk-kalkani"})
    assert _sel(r, "llm").kv_cache_gb == pytest.approx(10)


# ───────────── select_artifact, capacity, plan_all


def test_select_artifact(cat):
    model = cat.models[QWEN]
    comp = cat.modules["ana-model"].primary_llm
    assert select_artifact(model, comp, t2(), "server").id == "fp8"
    assert select_artifact(model, comp, t1(), "server").id == "q4_k_m"
    assert select_artifact(model, comp, t0(), "auto").id == "q4_k_m"
    assert select_artifact(model, comp, t2(), "client").id == "q4_k_m"
    fixed = cat.modules["fatura-cikarim"].components[0]  # ocr: artifact sabit
    assert select_artifact(cat.models[fixed.model], fixed, t2()).id == "default"


def test_capacity(cat):
    cap = capacity(cat, t2(), {(QWEN, "q4_k_m"), ("presidio", "default")})
    assert cap["used"]["vram_gb"] == pytest.approx(26)
    assert cap["used"]["disk_gb"] == pytest.approx(23.1)
    assert cap["pct"]["vram"] == pytest.approx(54.2)
    assert cap["remaining"]["vram_gb"] == pytest.approx(22)


def test_plan_all_counts_shared_once(cat):
    plan = plan_all(cat, t2(), ["fatura-cikarim", "sozlesme-analizi", "gorsel-anlama"])
    assert plan["modules"][0] == "kvkk-kalkani"  # bağımlılıklar önce
    assert {"ana-model", "ocr-belge-okuma", "pdf-ayristirma"} <= set(plan["modules"])
    qwen = [u for u in plan["unique_models"] if u["model"] == QWEN]
    assert len(qwen) == 1
    # qwen 26 (KV dahil) + paddle 3 = 29 GB VRAM; diğerleri GPU kullanmaz
    assert plan["totals"]["vram_gb"] == pytest.approx(29)
    assert plan["status"] == "ok"
    assert plan["required_tier"] == "T2"
