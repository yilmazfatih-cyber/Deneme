import pytest

from text2sql.backends import FakeBackend
from text2sql.errors import ReadOnlyError
from text2sql.pipeline import Text2SQL
from text2sql.run import execute


def test_retry_feeds_error_back(dukkan_db):
    fake = FakeBackend(["```sql\nSELECT isim FROM urunler;\n```", "```sql\nSELECT ad FROM urunler WHERE stok = 0;\n```"])
    t2s = Text2SQL(fake, dukkan_db, sample_rows=0)
    ans = t2s.ask("Stokta kalmayan ürünler?", retries=1)
    assert ans.error == "" and ans.attempts == 2
    assert sorted(r[0] for r in ans.result.rows) == ["Fındık ezmesi", "Masa lambası"]
    second_call = fake.calls[1]
    assert second_call[-2]["role"] == "assistant" and "isim" in second_call[-2]["content"]
    assert "no such column: isim" in second_call[-1]["content"]


def test_retry_exhausted_reports_error(dukkan_db):
    fake = FakeBackend(["```sql\nSELECT yok FROM urunler;\n```"])
    ans = Text2SQL(fake, dukkan_db).ask("?", retries=0)
    assert ans.attempts == 1 and "no such column" in ans.error and ans.result is None
    assert len(fake.calls) == 1


def test_no_sql_then_sql(dukkan_db):
    fake = FakeBackend(["Bilmiyorum.", "SELECT COUNT(*) FROM musteriler;"])
    ans = Text2SQL(fake, dukkan_db).ask("Kaç müşteri var?", retries=1)
    assert ans.result.rows == [(20,)]


def test_write_refused_without_yaz(dukkan_db):
    fake = FakeBackend(["```sql\nDELETE FROM musteriler;\n```"])
    with pytest.raises(ReadOnlyError):
        Text2SQL(fake, dukkan_db).ask("Tüm müşterileri sil")
    assert execute(dukkan_db, "SELECT COUNT(*) FROM musteriler").rows == [(20,)]


def test_write_allowed_with_yaz(dukkan_db):
    fake = FakeBackend(["```sql\nUPDATE urunler SET stok = 5 WHERE stok = 0;\n```"])
    ans = Text2SQL(fake, dukkan_db).ask("Stoğu biten ürünlere 5 ekle", write=True)
    assert ans.result.rowcount == 2
    assert execute(dukkan_db, "SELECT COUNT(*) FROM urunler WHERE stok = 0").rows == [(0,)]


def test_readonly_connection_blocks_writes_even_if_guard_bypassed(dukkan_db):
    from text2sql.errors import ExecutionError
    from text2sql.run import _execute_sqlite

    with pytest.raises(ExecutionError, match="salt okunur"):
        _execute_sqlite(dukkan_db, "DELETE FROM musteriler", write=False, limit=10, timeout=5)


def test_row_limit_and_truncation(dukkan_db):
    res = execute(dukkan_db, "SELECT * FROM siparis_kalemleri", limit=10)
    assert len(res.rows) == 10 and res.truncated
    res = execute(dukkan_db, "SELECT * FROM sehirler", limit=10)
    assert len(res.rows) == 8 and not res.truncated


def test_history_goes_into_prompt(dukkan_db):
    fake = FakeBackend()
    t2s = Text2SQL(fake, dukkan_db)
    t2s.ask("Peki Ankara'dakiler?", history=[("İstanbul'daki müşteriler?", "SELECT ad FROM musteriler WHERE sehir_id = 1")])
    contents = [m["content"] for m in fake.calls[0]]
    assert "Question: İstanbul'daki müşteriler?" in contents
    assert any("sehir_id = 1" in c for c in contents)


def test_multiple_statements_note(dukkan_db):
    fake = FakeBackend(["```sql\nSELECT 1 FROM sehirler LIMIT 1; SELECT 2;\n```"])
    ans = Text2SQL(fake, dukkan_db).ask("?")
    assert ans.result.rows == [(1,)] and any("birden çok" in n for n in ans.notes)


ATTACK = "SELECT '\\'; COMMIT; DROP TABLE musteriler; --'"


@pytest.mark.parametrize("db", ["postgresql://u@127.0.0.1:1/vt", "mysql://u@127.0.0.1:1/vt"])
def test_execute_refuses_multi_statement_before_connecting(db):
    # bağlantı kurulmaya çalışılmadan reddedilir (sunucu yok, sqlalchemy kurulu olmasa da)
    for write in (False, True):
        with pytest.raises(ReadOnlyError, match="birden çok"):
            execute(db, ATTACK, write=write)


def test_execute_refuses_multi_statement_sqlite(dukkan_db):
    with pytest.raises(ReadOnlyError):
        execute(dukkan_db, ATTACK, write=True)
    assert execute(dukkan_db, "SELECT COUNT(*) FROM musteriler").rows == [(20,)]


def test_postgres_engine_is_session_read_only(monkeypatch):
    sqlalchemy = pytest.importorskip("sqlalchemy")
    from text2sql import schema

    seen = {}
    monkeypatch.setattr(sqlalchemy, "create_engine", lambda url, **kw: seen.setdefault(url, kw))
    schema.create_engine("postgresql://u@h/vt")
    schema.create_engine("postgres://u@h/yaz", read_only=False)
    schema.create_engine("mysql://u@h/vt")
    assert seen["postgresql+psycopg://u@h/vt"] == {"connect_args": {"options": "-c default_transaction_read_only=on"}}
    assert seen["postgresql+psycopg://u@h/yaz"] == {}
    assert seen["mysql+pymysql://u@h/vt"] == {}


def test_sadece_sql_shows_write_sql_with_note(dukkan_db):
    fake = FakeBackend(["```sql\nDELETE FROM musteriler;\n```"])
    ans = Text2SQL(fake, dukkan_db).ask("sil", execute_sql=False)
    assert ans.sql == "DELETE FROM musteriler" and any("--yaz" in n for n in ans.notes)


def test_sql_cleared_when_last_attempt_has_no_sql(dukkan_db):
    fake = FakeBackend(["```sql\nSELECT yok FROM urunler;\n```", "Bilmiyorum."])
    ans = Text2SQL(fake, dukkan_db).ask("?", retries=1)
    assert ans.sql == "" and "bulunamadı" in ans.error


def test_guard_mode_follows_db_address_not_lehce(monkeypatch):
    # --lehce sqlite istemi ve ayıklamayı etkiler; okuma denetimi ve çalıştırma yolu adresten gelir
    from text2sql import pipeline as pl
    from text2sql.schema import Schema
    from text2sql.sqlutil import guard_modes

    monkeypatch.setattr(pl, "extract_schema", lambda db, **kw: Schema("postgresql"))
    t2s = Text2SQL(FakeBackend(), "postgresql://u@127.0.0.1:1/vt", dialect="sqlite")
    assert t2s.dialect == "sqlite" and t2s.db_dialect == "postgresql"
    assert guard_modes(t2s.db_dialect) == ("postgresql", "mysql") != guard_modes("sqlite")
    with pytest.raises(ReadOnlyError, match="birden çok"):
        execute("postgresql://u@127.0.0.1:1/vt", ATTACK)
