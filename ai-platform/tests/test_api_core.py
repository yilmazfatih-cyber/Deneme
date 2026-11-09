"""Çekirdek API: sistem, katalog, kurulum ve iş uç noktaları (FastAPI TestClient, ağsız)."""

from __future__ import annotations

import json
import time

import pytest
from fastapi.testclient import TestClient

from aiplatform.hardware import probe as hw
from aiplatform.hardware.probe import reset_probe_cache
from aiplatform.installer import installer
from aiplatform.installer.jobs import reset_job_manager
from tests.fakes import install_fakes
from tests.profiles import t1, t2


@pytest.fixture
def client(monkeypatch):
    reset_job_manager()
    installer.reset_bootstrap()
    reset_probe_cache()
    monkeypatch.setattr(hw, "probe", lambda: t2())
    from aiplatform.api.app import create_app

    with TestClient(create_app()) as c:
        yield c
    reset_probe_cache()
    reset_job_manager()


def _wait_job(client: TestClient, job_id: str, timeout: float = 20) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        j = client.get(f"/api/jobs/{job_id}").json()
        if j["status"] in ("done", "failed", "cancelled"):
            return j
        time.sleep(0.05)
    raise AssertionError(f"iş bitmedi: {j}")


def test_probe(client):
    r = client.get("/api/system/probe")
    assert r.status_code == 200
    d = r.json()
    assert d["tier"] == "T2"
    assert {"os", "cpu", "ram_gb", "gpus", "disk_gb", "docker", "ollama", "npu", "role", "hostname"} <= set(d)
    assert d["gpus"][0]["vram_gb"] == 48


def test_capacity_empty(client):
    d = client.get("/api/system/capacity").json()
    assert d["used"] == {"disk_gb": 0, "ram_gb": 0, "vram_gb": 0}
    assert d["total"]["vram_gb"] == 48


def test_health_reports_llm_down(client, monkeypatch):
    from aiplatform.config import get_settings

    get_settings().llm_base_url = "http://127.0.0.1:9/v1"
    d = client.get("/api/system/health").json()
    assert d["database"]["ok"] is True
    assert d["llm"]["ok"] is False
    assert d["status"] == "degraded"


def test_catalog_modules(client):
    r = client.get("/api/catalog/modules")
    assert r.status_code == 200
    cards = r.json()
    assert len(cards) == 30
    card = next(c for c in cards if c["id"] == "kvkk-kalkani")
    assert {"id", "niche_code", "name", "tagline", "package", "tier", "status", "installed", "compat"} <= set(
        card
    )
    assert card["compat"]["status"] == "ok" and card["installed"] is False
    assert all(c["compat"]["status"] in ("ok", "warn", "fail") for c in cards)


def test_module_detail_and_requirements(client):
    d = client.get("/api/catalog/modules/fatura-cikarim").json()
    assert d["id"] == "fatura-cikarim" and d["resolved_components"]
    r = client.get("/api/catalog/modules/fatura-cikarim/requirements", params={"target": "server"})
    assert r.status_code == 200
    rep = r.json()
    assert rep["module_id"] == "fatura-cikarim" and rep["target"] == "server"
    assert rep["missing_dependencies"] == ["kvkk-kalkani", "ana-model", "ocr-belge-okuma"]
    assert rep["recommendation"]
    assert {c["id"] for c in rep["checks"]} >= {"vram", "ram", "disk"}


def test_models_and_plan(client):
    models = client.get("/api/catalog/models").json()
    assert any(m["id"] == "qwen3.5-35b-a3b" for m in models)
    assert client.get("/api/catalog/models/qwen3.5-35b-a3b").json()["installed_artifacts"] == []
    plan = client.get("/api/catalog/plan", params={"modules": "fatura-cikarim,sozlesme-analizi"}).json()
    assert plan["modules"][0] == "kvkk-kalkani"


def test_error_body_format(client):
    r = client.get("/api/catalog/modules/olmayan-modul/requirements")
    assert r.status_code == 404
    err = r.json()["error"]
    assert err["code"] == "not_found" and "olmayan-modul" in err["message"]
    assert client.post("/api/modules/olmayan/install", json={}).status_code == 404
    r = client.post("/api/modules/ana-model/install", json={"artifacts": {"llm": "q2"}})
    assert r.status_code == 400 and r.json()["error"]["code"] == "bad_request"
    assert client.get("/api/jobs/yok").status_code == 404
    r = client.post("/api/modules/kvkk-kalkani/uninstall")
    assert r.status_code == 409 and r.json()["error"]["code"] == "not_installed"


def test_install_flow(client, monkeypatch):
    calls = install_fakes(monkeypatch, t2())
    r = client.post("/api/modules/ana-model/install", json={"target": "auto"})
    assert r.status_code == 202
    job_id = r.json()["job_id"]
    job = _wait_job(client, job_id)
    assert job["status"] == "done", job
    assert job["progress"] == 100 and job["kind"] == "install" and job["module_id"] == "ana-model"
    assert isinstance(job["log"], list) and len(job["log"]) <= 50
    assert calls.start == [("qwen3.5-35b-a3b", "q4_k_m")]

    mods = {m["module_id"]: m for m in client.get("/api/modules").json()}
    assert set(mods) == {"kvkk-kalkani", "ana-model"}
    assert mods["ana-model"]["enabled"] is True and "health" in mods["ana-model"]

    cards = {c["id"]: c for c in client.get("/api/catalog/modules").json()}
    assert cards["ana-model"]["installed"] is True
    cap = client.get("/api/system/capacity").json()
    assert cap["used"]["vram_gb"] == pytest.approx(26)

    jobs = client.get("/api/jobs").json()
    assert jobs[0]["id"] == job_id

    # SSE: bitmiş iş için anlık durum + end
    with client.stream("GET", f"/api/jobs/{job_id}/events") as resp:
        assert resp.headers["content-type"].startswith("text/event-stream")
        events = [json.loads(line[6:]) for line in resp.iter_lines() if line.startswith("data: ")]
    assert events[0]["type"] == "snapshot" and events[-1]["type"] == "end" and events[-1]["status"] == "done"

    assert client.post("/api/modules/ana-model/disable").json() == {
        "module_id": "ana-model",
        "enabled": False,
    }
    assert client.post("/api/modules/ana-model/enable").json()["enabled"] is True

    r = client.post("/api/modules/kvkk-kalkani/uninstall")
    assert r.status_code == 409 and r.json()["error"]["code"] == "has_dependents"
    r = client.post("/api/modules/ana-model/uninstall")
    assert r.status_code == 200
    assert {"model": "qwen3.5-35b-a3b", "artifact": "q4_k_m"} in r.json()["removed_models"]
    assert r.json()["module_id"] == "ana-model"


def test_install_incompatible_job_fails(client, monkeypatch):
    install_fakes(monkeypatch, t1())
    job_id = client.post("/api/modules/ana-model/install", json={}).json()["job_id"]
    job = _wait_job(client, job_id)
    assert job["status"] == "failed"
    assert job["result"]["report"]["status"] == "fail"
    assert "ana-model" not in {m["module_id"] for m in client.get("/api/modules").json()}


def test_cancel_finished_job_conflict(client, monkeypatch):
    install_fakes(monkeypatch, t2())
    job_id = client.post("/api/modules/kvkk-kalkani/install").json()["job_id"]
    _wait_job(client, job_id)
    r = client.post(f"/api/jobs/{job_id}/cancel")
    assert r.status_code == 409 and r.json()["error"]["code"] == "not_cancellable"
