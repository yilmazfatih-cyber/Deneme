import re
from pathlib import Path

import pytest

from text2sql.errors import SchemaError
from text2sql.prompt import SYSTEM_PROMPT, build_messages, fix_messages
from text2sql.schema import detect_dialect, extract_schema, sqlalchemy_url, sqlite_path

ROOT = Path(__file__).resolve().parents[1]


def test_sqlite_schema_tables_columns_keys(small_db):
    schema = extract_schema(small_db)
    assert schema.dialect == "sqlite"
    assert schema.table_names() == ["etiketler", "kitaplar", "yazarlar", "yeni_kitaplar"]
    kitaplar = next(t for t in schema.tables if t.name == "kitaplar")
    cols = {c.name: c for c in kitaplar.columns}
    assert cols["id"].primary_key and cols["baslik"].not_null and cols["yil"].type == "INTEGER"
    assert cols["yazar_id"].references == ("yazarlar", "id")
    assert cols["baslik"].comment == "kitabın adı"
    ddl = schema.to_ddl()
    assert "yazar_id INTEGER REFERENCES yazarlar(id)" in ddl
    assert "PRIMARY KEY (kitap_id, etiket)" in ddl
    assert "CREATE VIEW yeni_kitaplar (baslik, yil);" in ddl
    assert "-- kitabın adı" in ddl
    assert "example rows" not in ddl


def test_sample_rows_and_table_filter(small_db):
    schema = extract_schema(small_db, sample_rows=2, tables=["Kitaplar"])
    assert schema.table_names() == ["kitaplar"]
    ddl = schema.to_ddl()
    assert "2 example rows from kitaplar" in ddl and "Kuyucaklı Yusuf" in ddl and "Masumiyet" not in ddl
    with pytest.raises(SchemaError):
        extract_schema(small_db, tables=["yok"])


def test_missing_file_and_not_sqlite(tmp_path):
    with pytest.raises(SchemaError, match="bulunamadı"):
        extract_schema(str(tmp_path / "yok.sqlite"))
    bad = tmp_path / "bozuk.db"
    bad.write_text("bu bir veritabanı değil")
    with pytest.raises(SchemaError):
        extract_schema(str(bad))
    assert not (tmp_path / "yok.sqlite").exists()  # salt okunur açılış dosya yaratmaz


def test_dialect_detection_and_urls():
    assert detect_dialect("dukkan.sqlite") == "sqlite"
    assert detect_dialect(r"C:\veri\dukkan.db") == "sqlite"
    assert detect_dialect("sqlite:///x.db") == "sqlite"
    assert detect_dialect("postgresql://u@localhost/vt") == "postgresql"
    assert detect_dialect("postgres://u@h/vt") == "postgresql"
    assert detect_dialect("mysql+pymysql://u@h/vt") == "mysql"
    with pytest.raises(SchemaError):
        detect_dialect("oracle://u@h/vt")
    assert sqlalchemy_url("postgres://u@h/vt") == "postgresql+psycopg://u@h/vt"
    assert sqlalchemy_url("mysql://u@h/vt") == "mysql+pymysql://u@h/vt"
    assert sqlite_path("sqlite:///a/b.db") == Path("a/b.db")


def test_sqlalchemy_path_with_sqlite_url(small_db):
    pytest.importorskip("sqlalchemy")
    schema = extract_schema("sqlite+pysqlite:///" + small_db, sample_rows=1)
    kitaplar = next(t for t in schema.tables if t.name == "kitaplar")
    assert {c.name for c in kitaplar.columns} == {"id", "baslik", "yazar_id", "yil"}
    assert next(c for c in kitaplar.columns if c.name == "yazar_id").references == ("yazarlar", "id")
    assert kitaplar.sample_rows and "PRIMARY KEY (kitap_id, etiket)" in schema.to_ddl()


def test_prompt_contains_schema_dialect_question(small_db):
    ddl = extract_schema(small_db).to_ddl()
    msgs = build_messages("Orhan Pamuk'un kitapları hangileri?", ddl, "postgresql")
    assert msgs[0]["role"] == "system" and msgs[-1]["role"] == "user"
    assert msgs[0]["content"].startswith(SYSTEM_PROMPT)
    assert "Dialect: PostgreSQL" in msgs[0]["content"] and "ILIKE" in msgs[0]["content"]
    assert "CREATE TABLE kitaplar" in msgs[0]["content"]
    assert msgs[-1]["content"] == "Question: Orhan Pamuk'un kitapları hangileri?"


def test_prompt_examples_and_history_order():
    msgs = build_messages("üçüncü", "CREATE TABLE t (a INTEGER);", "sqlite",
                          examples=[("birinci", "SELECT 1 FROM t")], history=[("ikinci", "SELECT 2 FROM t;")])
    roles = [m["role"] for m in msgs]
    assert roles == ["system", "user", "assistant", "user", "assistant", "user"]
    assert msgs[2]["content"] == "```sql\nSELECT 1 FROM t;\n```"
    assert msgs[4]["content"] == "```sql\nSELECT 2 FROM t;\n```"
    fixed = fix_messages(msgs, "```sql\nSELECT b FROM t;\n```", "no such column: b")
    assert fixed[-2]["role"] == "assistant" and "no such column: b" in fixed[-1]["content"]


def _modelfile_system(path: Path) -> str:
    m = re.search(r'^SYSTEM """(.*?)"""', path.read_text(encoding="utf-8"), re.S | re.M)
    assert m, f"{path.name} içinde SYSTEM yok"
    return m.group(1)


@pytest.mark.parametrize("name", ["Modelfile", "Modelfile.prem"])
def test_modelfiles_match_system_prompt(name):
    path = ROOT / name
    text = path.read_text(encoding="utf-8")
    assert _modelfile_system(path) == SYSTEM_PROMPT
    assert "PARAMETER temperature 0" in text and re.search(r"PARAMETER num_ctx (4096|8192)", text)
    assert re.search(r"^FROM \S+", text, re.M)
