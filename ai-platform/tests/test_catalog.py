"""Katalog tutarlılık testleri (ağ yok, model yok)."""

from __future__ import annotations

import importlib

import pytest

from aiplatform.catalog import LicenseClass, Target, load_catalog


@pytest.fixture(scope="module")
def catalog():
    return load_catalog()


def test_counts(catalog):
    assert len(catalog.modules) == 30
    codes = sorted(m.niche_code for m in catalog.modules.values())
    assert codes == [f"N{i:02d}" for i in range(30)]


def test_every_component_model_exists_and_is_commercial(catalog):
    for m in catalog.modules.values():
        for c in m.components:
            if c.model is None:
                assert c.pip_extras, f"{m.id}/{c.role}: ne model ne pip_extras"
                continue
            model = catalog.models[c.model]
            assert model.license_class != LicenseClass.noncommercial
            if c.artifact:
                model.artifact(c.artifact)


def test_every_model_is_used(catalog):
    used = {c.model for m in catalog.modules.values() for c in m.components if c.model}
    unused = set(catalog.models) - used
    assert not unused, f"kullanılmayan model kaydı: {sorted(unused)}"


def test_models_have_verification_and_resources(catalog):
    for model in catalog.models.values():
        assert model.verified_on, model.id
        for a in model.artifacts:
            assert a.ram_gb >= 0 and a.disk_gb >= 0
            if a.gpu_required:
                assert a.vram_gb > 0, f"{model.id}/{a.id}: gpu_required ama vram_gb yok"
            if a.runtime.value in {"llamacpp", "vllm"}:
                assert a.hf_repo, f"{model.id}/{a.id}: LLM biçimi için hf_repo şart"


def test_kvkk_declared(catalog):
    for m in catalog.modules.values():
        assert m.kvkk.purpose.strip(), m.id
        if m.kvkk.masking_required and m.id != "kvkk-kalkani":
            assert "kvkk-kalkani" in m.depends_on, m.id


def test_server_only_modules_have_tier_at_least_t1(catalog):
    for m in catalog.modules.values():
        server_llm = any(c.role == "llm" and c.target == Target.server and not c.optional for c in m.components)
        if server_llm:
            assert m.tier in {"T1", "T2", "T3"}, f"{m.id}: sunucu LLM'i var ama tier {m.tier}"


def test_write_actions_require_approval(catalog):
    for m in catalog.modules.values():
        for a in m.actions:
            if a.id in {"propose_entry", "approve"} or "ERP'ye" in a.name:
                assert a.human_approval, f"{m.id}/{a.id}: ERP'ye yazan eylem onaysız"


def test_every_module_has_registered_runtime(catalog):
    """modules/runtimes paketi her katalog modülü için @register çağırmalı."""
    pytest.importorskip("aiplatform.modules.runtimes")
    importlib.import_module("aiplatform.modules.runtimes")
    from aiplatform.modules.base import registered_modules

    missing = set(catalog.modules) - set(registered_modules())
    assert not missing, f"çalışma zamanı eksik: {sorted(missing)}"
