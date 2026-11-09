"""ERP webhook: HMAC imza doğru/yanlış, sır yokken 503, eşleme dosyası, onaylı eylemin kuyruğa düşmesi."""

from __future__ import annotations

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from aiplatform.erp import webhooks

SECRET = "test-sirri-123"

# Örnek eşleme belgesi (<data_dir>/webhook_routes.json)
ROUTES = {
    "routes": {
        "yeni-belge": {
            "module": "ozetleme",
            "action": "summarize",
            "payload_map": {"text": "$.belge.metin", "kaynak": "erp", "ilk_kalem": "$.kalemler.0.kod"},
        },
        "fatura-oneri": {
            "module": "fatura-cikarim",
            "action": "propose_entry",
            "payload_map": {"fields": "$.alanlar"},
        },
    }
}


@pytest.fixture()
def erp_env(tmp_path, monkeypatch):
    from aiplatform import config, db
    from aiplatform.erp import connector

    monkeypatch.setenv("AIP_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("AIP_ERP_WEBHOOK_SECRET", SECRET)
    config.reset_settings()
    db.reset_db()
    connector.reset_connectors()
    import aiplatform.erp.models  # noqa: F401

    db.Base.metadata.create_all(db.get_engine())
    (tmp_path / "data" / "webhook_routes.json").write_text(json.dumps(ROUTES), encoding="utf-8")
    yield tmp_path
    db.reset_db()
    config.reset_settings()


@pytest.fixture()
def client(erp_env):
    from aiplatform.api.routers import erp as r_erp

    app = FastAPI()
    app.include_router(r_erp.router)
    with TestClient(app) as c:
        yield c


def _post(client, source, payload, secret=SECRET, header=None):
    body = json.dumps(payload).encode()
    sig = header if header is not None else webhooks.sign(secret, body)
    return client.post(
        f"/api/erp/webhooks/{source}",
        content=body,
        headers={"X-Signature": sig, "Content-Type": "application/json"},
    )


def test_imza_dogrulama_birim():
    body = b'{"a": 1}'
    good = webhooks.sign(SECRET, body)
    assert good.startswith("sha256=") and len(good) == 7 + 64
    assert webhooks.verify_signature(SECRET, body, good)
    assert webhooks.verify_signature(SECRET, body, good.upper().replace("SHA256=", "sha256="))
    assert not webhooks.verify_signature(SECRET, body + b" ", good)
    assert not webhooks.verify_signature("baska", body, good)
    assert not webhooks.verify_signature(SECRET, body, None)
    assert not webhooks.verify_signature(SECRET, body, good[7:])  # önek yok


def test_yanlis_imza_401_ve_govde_saklanmaz(client):
    r = _post(client, "yeni-belge", {"belge": {"metin": "gizli"}}, secret="yanlis")
    assert r.status_code == 401 and r.json()["error"]["code"] == "bad_signature"
    ev = webhooks.list_events()
    assert len(ev) == 1 and ev[0]["signature_ok"] is False and ev[0]["status"] == "imza_gecersiz"
    from aiplatform.db import session_scope
    from aiplatform.erp.models import WebhookEvent

    with session_scope() as s:
        assert s.get(WebhookEvent, ev[0]["id"]).payload_json is None


def test_imzasiz_istek_401(client):
    r = client.post("/api/erp/webhooks/yeni-belge", content=b"{}")
    assert r.status_code == 401


def test_sir_yoksa_503(client, monkeypatch):
    from aiplatform import config

    monkeypatch.delenv("AIP_ERP_WEBHOOK_SECRET")
    config.reset_settings()
    r = _post(client, "yeni-belge", {})
    assert r.status_code == 503
    assert r.json()["error"]["message"] == "webhook sırrı tanımlı değil"


def test_dogru_imza_eslesme_ve_kuyruk(client, monkeypatch):
    calls = []
    monkeypatch.setattr(webhooks, "_enqueue", lambda m, a, p, s, e: calls.append((m, a, p, s)) or "is-123")
    payload = {"belge": {"metin": "Sözleşme metni"}, "kalemler": [{"kod": "URN-0001"}]}
    r = _post(client, "yeni-belge", payload)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "kuyrukta" and r.json()["job_id"] == "is-123"
    assert calls == [
        (
            "ozetleme",
            "summarize",
            {"text": "Sözleşme metni", "kaynak": "erp", "ilk_kalem": "URN-0001"},
            "yeni-belge",
        )
    ]
    ev = webhooks.list_events()[0]
    assert ev["signature_ok"] is True and ev["mapped_module"] == "ozetleme" and ev["job_id"] == "is-123"


def test_gercek_kuyruk_veya_kuyruk_yok(client):
    r = _post(client, "yeni-belge", {"belge": {"metin": "x"}})
    assert r.status_code == 200
    assert r.json()["status"] in {"kuyrukta", "kuyruk yok", "hata"}


def test_eslesmeyen_kaynak(client):
    r = _post(client, "bilinmeyen", {"x": 1})
    assert r.status_code == 200 and r.json()["status"] == "eslesme_yok"


def test_onayli_eylem_onay_kuyruguna_duser(client):
    from aiplatform.erp import approvals

    r = _post(client, "fatura-oneri", {"alanlar": {"toplam": 1200}})
    assert r.status_code == 200 and r.json()["status"] == "onay_bekliyor"
    pend = approvals.list_pending()
    assert (
        len(pend) == 1
        and pend[0]["module"] == "fatura-cikarim"
        and pend[0]["payload"] == {"fields": {"toplam": 1200}}
    )
    assert pend[0]["requested_by"] == "webhook:fatura-oneri"


def test_gecersiz_json_400(client):
    body = b"{bozuk"
    r = client.post(
        "/api/erp/webhooks/yeni-belge", content=body, headers={"X-Signature": webhooks.sign(SECRET, body)}
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "bad_json"


def test_bilgi_ucu(client):
    info = client.get("/api/erp/webhooks").json()
    assert info["secret_configured"] is True and "yeni-belge" in info["routes"]
    assert info["url_template"].endswith("/api/erp/webhooks/{source}")


def test_payload_map_birim():
    assert webhooks.map_payload({"a": {"b": [1, 2]}}, {"x": "$.a.b.1", "y": 5, "z": "$.yok"}) == {
        "x": 2,
        "y": 5,
        "z": None,
    }
    assert webhooks.map_payload({"a": 1}, None) == {"a": 1}
