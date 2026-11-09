"""Örnek ERP: veri tutarlılığı, sentetik VKN, CLI, MockERPConnector ve bağlantı kayıt defteri."""

from __future__ import annotations

import sqlite3

import pytest

from aiplatform.erp.connector import ApprovalRequiredError, ErpError
from aiplatform.erp.mock_erp import (
    MOCK_TABLES,
    MockERPConnector,
    create_mock_erp,
    is_valid_vkn,
    main,
    vkn_check_digit,
)


@pytest.fixture()
def erp_env(tmp_path, monkeypatch):
    """Geçici AIP_DATA_DIR + temiz platform veritabanı."""
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


@pytest.fixture(scope="module")
def mock_db(tmp_path_factory):
    p = tmp_path_factory.mktemp("mock") / "ornek.db"
    create_mock_erp(p)
    return p


def test_tablolar_ve_donem(mock_db):
    con = sqlite3.connect(mock_db)
    tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert set(MOCK_TABLES) <= tables
    aylar = [r[0] for r in con.execute("SELECT ay FROM satis_aylik ORDER BY ay")]
    assert aylar[0] == "2024-01" and aylar[-1] == "2026-10" and len(aylar) == 34
    mn, mx = con.execute("SELECT MIN(tarih), MAX(tarih) FROM fatura").fetchone()
    assert mn >= "2024-01-01" and mx <= "2026-10-31"
    con.close()


def test_tutarlar_tutarli(mock_db):
    con = sqlite3.connect(mock_db)
    # fatura tutarı = kalem toplamı, toplam = tutar + kdv
    bozuk = con.execute(
        "SELECT COUNT(*) FROM fatura f WHERE ABS(f.tutar - (SELECT SUM(tutar) FROM fatura_kalem k WHERE k.fatura_id = f.id)) > 0.05"
    ).fetchone()[0]
    assert bozuk == 0
    assert (
        con.execute("SELECT COUNT(*) FROM fatura WHERE ABS(toplam - tutar - kdv) > 0.011").fetchone()[0] == 0
    )
    con.close()


def test_sentetik_isimler_ve_vkn(mock_db):
    con = sqlite3.connect(mock_db)
    for unvan, vkn in con.execute("SELECT unvan, vkn FROM cari"):
        assert unvan.startswith(("Müşteri ", "Tedarikçi ")), unvan
        assert is_valid_vkn(vkn), vkn
    con.close()


def test_vkn_algoritmasi():
    assert not is_valid_vkn("123")
    v = "123456789" + vkn_check_digit("123456789")
    assert is_valid_vkn(v)
    bozuk = v[:9] + str((int(v[9]) + 1) % 10)
    assert not is_valid_vkn(bozuk)


def test_tohum_sabit(tmp_path):
    a, b = tmp_path / "a.db", tmp_path / "b.db"
    create_mock_erp(a)
    create_mock_erp(b)
    q = "SELECT SUM(toplam), COUNT(*) FROM fatura"
    assert sqlite3.connect(a).execute(q).fetchone() == sqlite3.connect(b).execute(q).fetchone()


def test_cli(tmp_path, capsys):
    assert main([str(tmp_path / "cli.db")]) == 0
    out = capsys.readouterr().out
    assert "Örnek ERP oluşturuldu" in out and "satis_aylik" in out


def test_mock_connector_yazma_araci_onaysiz_calismaz(mock_db):
    c = MockERPConnector(f"sqlite:///{mock_db}")
    tools = {t["function"]["name"]: t for t in c.list_tools()}
    assert tools["fatura_oneri_olustur"]["human_approval"] is True
    assert tools["sorgu_calistir"]["human_approval"] is False
    assert c.read_only is False
    with pytest.raises(ApprovalRequiredError):
        c.call_tool(
            "fatura_oneri_olustur", {"cari_id": 1, "kalemler": [{"urun_kodu": "URN-0001", "miktar": 1}]}
        )
    c.close()


def test_execute_write_onay_kaydi_ister(erp_env, mock_db):
    c = MockERPConnector(f"sqlite:///{mock_db}")
    with pytest.raises(ErpError) as ei:
        c.execute_write(
            "fatura_oneri_olustur",
            {"cari_id": 1, "kalemler": [{"urun_kodu": "URN-0001", "miktar": 1}]},
            "sahte-onay",
        )
    assert ei.value.code == "approval_invalid"
    c.close()


def test_kayit_defteri_ve_maskeli_url(erp_env, mock_db, monkeypatch):
    from aiplatform import config
    from aiplatform.erp import connector

    monkeypatch.setenv("AIP_ERP_DB_URL", f"sqlite:///{mock_db}")
    monkeypatch.setenv("AIP_ERP_ALLOWED_TABLES", '["cari", "satis_aylik"]')
    config.reset_settings()
    conns = connector.list_connections()
    assert [c["id"] for c in conns] == ["varsayilan"]
    assert conns[0]["warning"] and conns[0]["read_only"] is True
    r = connector.run_readonly("varsayilan", "SELECT COUNT(*) FROM satis_aylik")
    assert r["rows"] == [[34]]
    assert "CREATE TABLE cari" in connector.get_schema_summary("varsayilan")
    assert "fatura_kalem" not in connector.get_schema_summary("varsayilan")
    assert (
        connector.mask_url("postgresql+psycopg://okuyucu:gizli@db.local/erp")
        == "postgresql+psycopg://okuyucu:***@db.local/erp"
    )
    assert "gizli" not in connector.mask_url("https://erp.local/api?token=gizli")


def test_sir_sifreleme(erp_env):
    from aiplatform.erp.connector import decrypt_secret, encrypt_secret

    enc = encrypt_secret("postgresql://u:parola@h/db")
    assert "parola" not in enc
    assert decrypt_secret(enc) == "postgresql://u:parola@h/db"


def test_rest_connector_openapi():
    import httpx

    from aiplatform.erp.rest import RESTConnector

    doc = {
        "openapi": "3.0.0",
        "paths": {
            "/cari/{id}": {
                "get": {
                    "operationId": "cariGetir",
                    "summary": "Cari kartı",
                    "parameters": [{"name": "id", "in": "path", "schema": {"type": "integer"}}],
                }
            },
            "/fatura": {
                "post": {
                    "operationId": "faturaOlustur",
                    "summary": "Fatura oluştur",
                    "requestBody": {
                        "required": True,
                        "content": {"application/json": {"schema": {"$ref": "#/components/schemas/F"}}},
                    },
                }
            },
        },
        "components": {"schemas": {"F": {"type": "object", "properties": {"cari_id": {"type": "integer"}}}}},
    }
    seen = []

    def handler(req: httpx.Request):
        seen.append((req.method, req.url.path, req.headers.get("authorization")))
        return httpx.Response(200, json={"id": 7, "unvan": "Müşteri 07 A.Ş."})

    c = RESTConnector(
        "https://erp.ornek.test/api", "belirtec", openapi_doc=doc, transport=httpx.MockTransport(handler)
    )
    tools = {t["function"]["name"]: t for t in c.list_tools()}
    assert tools["carigetir"]["human_approval"] is False
    assert tools["faturaolustur"]["human_approval"] is True
    assert (
        tools["faturaolustur"]["function"]["parameters"]["properties"]["body"]["properties"]["cari_id"][
            "type"
        ]
        == "integer"
    )
    assert c.read_only is False
    r = c.call_tool("carigetir", {"id": 7})
    assert r["data"]["id"] == 7
    assert seen[-1] == ("GET", "/api/cari/7", "Bearer belirtec")
    with pytest.raises(ApprovalRequiredError):
        c.call_tool("faturaolustur", {"body": {"cari_id": 1}})
    c.close()
