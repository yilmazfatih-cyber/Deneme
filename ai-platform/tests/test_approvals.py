"""Onay kuyruğu: create → approve → örnek ERP'de 'onay_bekliyor' satırı; reject → değişiklik yok; API uçları."""

from __future__ import annotations

import sqlite3

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from aiplatform.erp import approvals
from aiplatform.erp.connector import ErpError

KALEM = {
    "cari_id": 21,
    "tarih": "2026-11-01",
    "kalemler": [{"urun_kodu": "URN-0003", "miktar": 4, "birim_fiyat": 100.0}],
}


@pytest.fixture()
def erp_env(tmp_path, monkeypatch):
    from aiplatform import config, db
    from aiplatform.erp import connector

    monkeypatch.setenv("AIP_DATA_DIR", str(tmp_path / "data"))
    for k in ("AIP_ERP_DB_URL", "AIP_ERP_API_BASE_URL", "AIP_ERP_WEBHOOK_SECRET"):
        monkeypatch.delenv(k, raising=False)
    config.reset_settings()
    db.reset_db()
    connector.reset_connectors()
    import aiplatform.erp.models  # noqa: F401

    db.Base.metadata.create_all(db.get_engine())
    yield tmp_path
    connector.reset_connectors()
    db.reset_db()
    config.reset_settings()


@pytest.fixture()
def client(erp_env):
    from aiplatform.api.routers import approvals as r_ap
    from aiplatform.api.routers import erp as r_erp

    app = FastAPI()
    app.include_router(r_erp.router)
    app.include_router(r_ap.router)
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def demo(client, erp_env):
    r = client.post("/api/erp/connections/demo")
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["kind"] == "mock" and "ornek_erp.db" in body["url"]
    return body["id"], erp_env / "data" / "ornek_erp.db"


def _count_pending(db_path) -> int:
    con = sqlite3.connect(db_path)
    try:
        return con.execute("SELECT COUNT(*) FROM fatura WHERE durum = 'onay_bekliyor'").fetchone()[0]
    finally:
        con.close()


def test_onay_ile_mock_erpde_satir_olusur(demo):
    cid, db_path = demo
    assert _count_pending(db_path) == 0
    aid = approvals.create_approval(
        "erp", "fatura_oneri_olustur", {"connection_id": cid, "args": KALEM}, "muhasebe1"
    )
    assert [a["id"] for a in approvals.list_pending()] == [aid]
    assert _count_pending(db_path) == 0  # onaysız yazma yok

    res = approvals.decide(aid, "approve", "yonetici", "uygun")
    assert res["status"] == "executed", res
    assert res["result"]["ok"] is True
    fid = res["result"]["result"]["fatura_id"]
    assert res["result"]["result"]["toplam"] == pytest.approx(480.0)
    con = sqlite3.connect(db_path)
    row = con.execute("SELECT cari_id, tutar, kdv, toplam, durum FROM fatura WHERE id = ?", (fid,)).fetchone()
    kalem = con.execute("SELECT urun_kodu, miktar FROM fatura_kalem WHERE fatura_id = ?", (fid,)).fetchall()
    con.close()
    assert row == (21, 400.0, 80.0, 480.0, "onay_bekliyor")
    assert kalem == [("URN-0003", 4)]
    assert approvals.list_pending() == []
    a = approvals.get_approval(aid)
    assert a["decided_by"] == "yonetici" and a["note"] == "uygun" and a["decided_at"]


def test_red_degisiklik_yapmaz(demo):
    cid, db_path = demo
    aid = approvals.create_approval(
        "erp", "fatura_oneri_olustur", {"connection_id": cid, "args": KALEM}, "muhasebe1"
    )
    res = approvals.decide(aid, "reject", "yonetici", "tutar hatalı")
    assert res["status"] == "rejected" and res["result"] is None
    assert _count_pending(db_path) == 0
    with pytest.raises(ErpError) as ei:
        approvals.decide(aid, "approve", "baskasi")
    assert ei.value.code == "already_decided"


def test_hatali_yazma_failed_olur(demo):
    cid, db_path = demo
    aid = approvals.create_approval(
        "erp",
        "fatura_oneri_olustur",
        {
            "connection_id": cid,
            "args": {"cari_id": 9999, "kalemler": [{"urun_kodu": "URN-0001", "miktar": 1}]},
        },
    )
    res = approvals.decide(aid, "approve", "yonetici")
    assert res["status"] == "failed"
    assert res["result"]["ok"] is False and "Cari bulunamadı" in res["result"]["error"]["message"]
    assert _count_pending(db_path) == 0


def test_okuma_araci_onaya_alinmaz(demo):
    cid, _ = demo
    with pytest.raises(ErpError):
        approvals.create_approval(
            "erp", "sorgu_calistir", {"connection_id": cid, "args": {"sql": "SELECT 1"}}
        )
    with pytest.raises(ErpError):
        approvals.create_approval("erp", "fatura_oneri_olustur", {"args": KALEM})
    with pytest.raises(ErpError):
        approvals.create_approval("olmayan-modul", "x", {})


def test_modul_eylemi_onaydan_sonra_approved_bayragiyla_calisir(erp_env):
    from aiplatform.modules import base

    seen = {}

    class Sahte(base.ModuleRuntime):
        async def run(self, action, payload, ctx):
            seen.update(
                action=action,
                payload=payload,
                approved=ctx.extra.get("approved"),
                aid=ctx.extra.get("approval_id"),
            )
            return {"erp_kayit": "taslak-1"}

    old = base._REGISTRY.get("fatura-cikarim")
    base.register("fatura-cikarim")(Sahte)
    base._INSTANCES.pop("fatura-cikarim", None)
    try:
        aid = approvals.create_approval(
            "fatura-cikarim", "propose_entry", {"fields": {"toplam": 120}}, "muhasebe1"
        )
        res = approvals.decide(aid, "approve", "yonetici")
    finally:
        base._INSTANCES.pop("fatura-cikarim", None)
        if old is None:
            base._REGISTRY.pop("fatura-cikarim", None)
        else:
            base._REGISTRY["fatura-cikarim"] = old
    assert res["status"] == "executed" and res["result"]["result"] == {"erp_kayit": "taslak-1"}
    assert seen == {
        "action": "propose_entry",
        "payload": {"fields": {"toplam": 120}},
        "approved": True,
        "aid": aid,
    }


def test_api_akisi(client, demo):
    cid, db_path = demo
    tools = client.get("/api/erp/tools", params={"include_modules": "false"}).json()["items"]
    names = {t["function"]["name"]: t for t in tools}
    write_name = f"erp_{cid}__fatura_oneri_olustur"
    assert names[write_name]["human_approval"] is True
    assert names[f"erp_{cid}__sorgu_calistir"]["human_approval"] is False

    # okuma aracı doğrudan çalışır
    r = client.post(
        "/api/erp/tools/call",
        json={"name": f"erp_{cid}__sorgu_calistir", "args": {"sql": "SELECT COUNT(*) FROM stok"}},
    )
    assert r.status_code == 200 and r.json()["result"]["rows"] == [[36]]

    # yazma aracı onaya düşer
    r = client.post(
        "/api/erp/tools/call", json={"name": write_name, "args": KALEM}, headers={"X-AIP-User": "ajan"}
    )
    assert r.json()["status"] == "onay_bekliyor"
    aid = r.json()["approval_id"]
    assert _count_pending(db_path) == 0

    lst = client.get("/api/approvals", params={"status": "pending"}).json()
    assert lst["total"] == 1 and lst["items"][0]["requested_by"] == "ajan"
    assert client.get(f"/api/approvals/{aid}").json()["payload"]["args"] == KALEM

    r = client.post(
        f"/api/approvals/{aid}/decide",
        json={"decision": "approve", "note": "tamam"},
        headers={"X-AIP-User": "mudur"},
    )
    assert r.status_code == 200 and r.json()["status"] == "executed" and r.json()["decided_by"] == "mudur"
    assert _count_pending(db_path) == 1

    r = client.post(f"/api/approvals/{aid}/decide", json={"decision": "reject"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "already_decided"
    r = client.get("/api/approvals/yok")
    assert r.status_code == 404 and set(r.json()["error"]) == {"code", "message", "hint"}


def test_baglanti_crud_ve_sema(client, demo, erp_env):
    cid, db_path = demo
    r = client.post(
        "/api/erp/connections",
        json={
            "name": "Muhasebe SQL",
            "kind": "sql",
            "url": f"sqlite:///{db_path}",
            "allowed_tables": ["cari"],
        },
    )
    assert r.status_code == 201, r.text
    new = r.json()
    assert new["id"] == "muhasebe-sql" and new["warning"]
    t = client.post(f"/api/erp/connections/{new['id']}/test").json()
    assert t["ok"] is True and "fatura" in t["available_tables"]
    sch = client.get(f"/api/erp/connections/{new['id']}/schema").json()["summary"]
    assert "CREATE TABLE cari" in sch and "CREATE TABLE fatura" not in sch
    q = client.post(f"/api/erp/connections/{new['id']}/query", json={"sql": "SELECT * FROM fatura"})
    assert q.status_code == 400 and q.json()["error"]["code"] == "sql_rejected"
    r = client.patch(f"/api/erp/connections/{new['id']}", json={"allowed_tables": ["cari", "fatura"]})
    assert r.json()["allowed_tables"] == ["cari", "fatura"]
    q = client.post(f"/api/erp/connections/{new['id']}/query", json={"sql": "SELECT COUNT(*) FROM fatura"})
    assert q.status_code == 200
    lst = client.get("/api/erp/connections").json()["items"]
    assert {c["id"] for c in lst} == {cid, "muhasebe-sql"}
    assert all("sqlite:///" in c["url"] for c in lst)
    assert client.delete(f"/api/erp/connections/{new['id']}").status_code == 200
    assert client.get(f"/api/erp/connections/{new['id']}").status_code == 404
