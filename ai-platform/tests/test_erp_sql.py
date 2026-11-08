"""SQLReadOnlyConnector: salt-okunur sorgu, kara liste, beyaz liste, LIMIT, şema özeti maskelemesi."""

from __future__ import annotations

import sqlite3

import pytest

from aiplatform.erp import sql_readonly
from aiplatform.erp.connector import ErpError, SQLRejectedError
from aiplatform.erp.mock_erp import MOCK_TABLES, create_mock_erp
from aiplatform.erp.sql_readonly import SQLReadOnlyConnector, is_personal_column

VALIDATORS = [False] + ([True] if sql_readonly.sqlglot is not None else [])


@pytest.fixture(scope="module")
def mock_url(tmp_path_factory):
    return create_mock_erp(tmp_path_factory.mktemp("erp") / "ornek.db")


@pytest.fixture(params=VALIDATORS, ids=lambda v: "sqlglot" if v else "anahtar-kelime")
def conn(request, mock_url):
    c = SQLReadOnlyConnector(mock_url, ["cari", "fatura", "satis_aylik", "stok"], use_sqlglot=request.param)
    yield c
    c.close()


def test_select_calisir(conn):
    r = conn.run_query("SELECT ay, tutar FROM satis_aylik ORDER BY ay", max_rows=500)
    assert r["columns"] == ["ay", "tutar"]
    assert r["row_count"] == 34  # 2024-01 … 2026-10
    assert r["rows"][0][0] == "2024-01" and r["rows"][-1][0] == "2026-10"
    assert r["truncated"] is False


def test_join_ve_cte_calisir(conn):
    sql = (
        "WITH t AS (SELECT cari_id, SUM(toplam) AS ciro FROM fatura GROUP BY cari_id) "
        "SELECT c.unvan, t.ciro FROM t JOIN cari c ON c.id = t.cari_id ORDER BY t.ciro DESC"
    )
    r = conn.run_query(sql, max_rows=5)
    assert r["row_count"] == 5 and r["truncated"] is True
    assert all(isinstance(row[1], float) for row in r["rows"])


def test_limit_eklenir(conn):
    sql = conn.prepare_sql("SELECT * FROM cari", max_rows=10)
    assert "LIMIT 11" in sql.upper()
    r = conn.run_query("SELECT * FROM fatura", max_rows=10)
    assert r["row_count"] == 10 and r["truncated"] is True


def test_mevcut_limit_korunur(conn):
    r = conn.run_query("SELECT id FROM cari ORDER BY id LIMIT 3", max_rows=100)
    assert r["rows"] == [[1], [2], [3]]


@pytest.mark.parametrize(
    "sql",
    [
        "INSERT INTO cari (unvan, vkn, il, risk_sinifi) VALUES ('x', '1', 'Ankara', 'A')",
        "DROP TABLE cari",
        "PRAGMA table_info(cari)",
        "SELECT 1; DROP TABLE cari",
        "SELECT * FROM cari; DELETE FROM cari",
        "update cari set il = 'x'",
        "ATTACH DATABASE '/tmp/x.db' AS x",
        "SELECT * INTO yedek FROM cari",
        "WITH x AS (SELECT 1) DELETE FROM cari",
        "SELECT load_extension('kotu')",
        "",
    ],
)
def test_yazma_ve_tehlikeli_ifadeler_reddedilir(conn, sql):
    with pytest.raises(SQLRejectedError):
        conn.run_query(sql)


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT * FROM fatura_kalem",  # var ama izinli değil
        "SELECT * FROM sqlite_master",
        "SELECT c.unvan FROM cari c JOIN fatura_kalem k ON k.id = c.id",
        "SELECT * FROM cari, fatura_kalem",
        "SELECT * FROM (SELECT * FROM fatura_kalem) AS x",
    ],
)
def test_beyaz_liste_disi_tablo_reddedilir(conn, sql):
    with pytest.raises(SQLRejectedError) as ei:
        conn.run_query(sql)
    assert "izinli" in ei.value.message


def test_veri_degismez(conn, mock_url):
    for sql in ("DELETE FROM cari", "DROP TABLE fatura"):
        with pytest.raises(SQLRejectedError):
            conn.run_query(sql)
    con = sqlite3.connect(mock_url.removeprefix("sqlite:///"))
    assert con.execute("SELECT COUNT(*) FROM cari").fetchone()[0] == 32
    con.close()


def test_surucu_duzeyi_query_only(mock_url):
    """Denetim atlansa bile SQLite bağlantısı yazmayı reddeder (ikinci savunma)."""
    from sqlalchemy import text
    from sqlalchemy.exc import OperationalError

    c = SQLReadOnlyConnector(mock_url, MOCK_TABLES)
    with c.engine.connect() as raw, pytest.raises(OperationalError):
        raw.execute(text("DELETE FROM cari"))
    c.close()


def test_izinli_tablo_yoksa_hicbir_sey_calismaz(mock_url):
    c = SQLReadOnlyConnector(mock_url, [])
    with pytest.raises(SQLRejectedError):
        c.run_query("SELECT * FROM cari")
    c.close()


def test_kisisel_sutun_tespiti():
    for name in (
        "ad",
        "musteri_adi",
        "soyad",
        "tc",
        "tckn",
        "telefon",
        "cep_tel",
        "email",
        "eposta",
        "iban",
        "adres",
    ):
        assert is_personal_column(name), name
    for name in ("adet", "tutar", "unvan", "il", "risk_sinifi", "durum", "kdv", "tarih", "urun_kodu"):
        assert not is_personal_column(name), name


def test_schema_summary_kisisel_sutunlari_maskeler(tmp_path):
    db = tmp_path / "kisi.db"
    con = sqlite3.connect(db)
    con.execute(
        "CREATE TABLE personel (id INTEGER PRIMARY KEY, ad TEXT, telefon TEXT, email TEXT, iban TEXT, tc_no TEXT, departman TEXT)"
    )
    con.execute(
        "INSERT INTO personel VALUES (1, 'Örnek Kişi', '05001112233', 'ornek@ornek.test', 'TR000000000000000000000001', '10000000146', 'Muhasebe')"
    )
    con.commit()
    con.close()
    c = SQLReadOnlyConnector(f"sqlite:///{db}", ["personel"])
    s = c.schema_summary()
    c.close()
    assert "CREATE TABLE personel" in s and "departman" in s
    assert "Muhasebe" in s  # kişisel olmayan sütun görünür
    for secret in (
        "Örnek Kişi",
        "05001112233",
        "ornek@ornek.test",
        "TR000000000000000000000001",
        "10000000146",
    ):
        assert secret not in s
    assert s.count("***") >= 5


def test_get_schema_summary_mock_erp(mock_url):
    c = SQLReadOnlyConnector(mock_url, MOCK_TABLES)
    s = c.schema_summary()
    c.close()
    for t in MOCK_TABLES:
        assert f"CREATE TABLE {t}" in s
    assert "Tedarikçi" in s or "Müşteri" in s
    # stok.ad sütunu ('ad' kişisel kök) maskelenir
    stok_part = s.split("CREATE TABLE stok")[1].split("CREATE TABLE")[0]
    assert "***" in stok_part


def test_araclar_ve_cagri(conn):
    names = [t["function"]["name"] for t in conn.list_tools()]
    assert names == ["sorgu_calistir", "tablo_sema"]
    assert all(t["human_approval"] is False for t in conn.list_tools())
    r = conn.call_tool("sorgu_calistir", {"sql": "SELECT COUNT(*) AS n FROM cari"})
    assert r["rows"] == [[32]]
    with pytest.raises(ErpError):
        conn.call_tool("yok_boyle_arac", {})


def test_capabilities_notu(mock_url):
    c = SQLReadOnlyConnector(mock_url, MOCK_TABLES)
    caps = c.capabilities()
    c.close()
    assert caps["read_only_enforcement"] == "surucu" and "query_only" in caps["note"]
