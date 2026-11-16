"""mini_sql motoru: hatalar, kısıtlar, atomiklik, EXPLAIN, parametreler, volcano tembelliği, komut
satırı."""

from __future__ import annotations

from pathlib import Path

import pytest

from mini_sql import ConstraintError, Database, SqlError
from mini_sql.__main__ import main as cli_main
from mini_sql.storage import Table


@pytest.fixture
def db() -> Database:
    database = Database()
    database.execute_script(
        """
        CREATE TABLE kisi (id INTEGER PRIMARY KEY, ad TEXT NOT NULL, eposta TEXT UNIQUE, yas
        INTEGER); CREATE TABLE siparis (id INTEGER PRIMARY KEY, kisi_id INTEGER, tutar REAL DEFAULT
        0); INSERT INTO kisi (ad, eposta, yas) VALUES ('Ayşe', 'a@x', 34), ('Mehmet', 'm@x', 41),
            ('Işıl', NULL, NULL), ('Can', NULL, 25);
        INSERT INTO siparis (kisi_id, tutar) VALUES (1, 10.5), (1, 20), (2, 7.25), (9, 1);
        """
    )
    return database


def test_select_features(db: Database) -> None:
    assert db.query("SELECT ad FROM kisi WHERE yas > ? ORDER BY yas DESC", [30]) == [
        ("Mehmet",),
        ("Ayşe",),
    ]
    assert db.query("SELECT ad AS isim FROM kisi ORDER BY isim LIMIT 1, 2") == [("Can",), ("Işıl",)]
    assert db.query("SELECT ad FROM kisi ORDER BY length(ad), ad LIMIT 2") == [("Can",), ("Ayşe",)]
    rows = db.query(
        "SELECT k.ad, count(s.id), sum(s.tutar) FROM kisi k "
        "LEFT JOIN siparis s ON s.kisi_id = k.id "
        "GROUP BY k.ad HAVING count(s.id) > 0 ORDER BY 3 DESC"
    )
    assert rows == [("Ayşe", 2, 30.5), ("Mehmet", 1, 7.25)]
    assert db.query("SELECT count(DISTINCT kisi_id) FROM siparis") == [(3,)]
    assert db.query("SELECT tutar FROM siparis WHERE id = 4") == [(1.0,)]  # REAL yakınlığı
    assert db.execute("SELECT * FROM kisi").columns == ["id", "ad", "eposta", "yas"]


def test_errors_are_turkish_and_helpful(db: Database) -> None:
    with pytest.raises(SqlError, match="Bilinmeyen sütun: soyad"):
        db.query("SELECT soyad FROM kisi")
    with pytest.raises(SqlError, match="Belirsiz sütun: id"):
        db.query("SELECT id FROM kisi JOIN siparis ON 1")
    with pytest.raises(SqlError, match="GROUP BY'da yok"):
        db.query("SELECT ad, count(*) FROM kisi")
    with pytest.raises(SqlError, match="'yok' tablosu yok"):
        db.query("SELECT * FROM yok")
    with pytest.raises(SqlError, match="Sözdizimi hatası"):
        db.query("SELECT FROM kisi")
    with pytest.raises(SqlError, match="Kümeleme işlevi"):
        db.query("SELECT ad FROM kisi WHERE count(*) > 1")
    with pytest.raises(SqlError, match="2 parametre bekliyor"):
        db.query("SELECT ? + ?", [1])
    with pytest.raises(SqlError, match="Bilinmeyen işlev"):
        db.query("SELECT kare(2)")


def test_constraints_and_statement_atomicity(db: Database) -> None:
    with pytest.raises(ConstraintError, match="NOT NULL"):
        db.execute("INSERT INTO kisi (ad) VALUES (NULL)")
    with pytest.raises(ConstraintError, match="UNIQUE"):
        db.execute("INSERT INTO kisi (ad, eposta) VALUES ('Ali', 'yeni@x'), ('Veli', 'a@x')")
    assert db.query("SELECT count(*) FROM kisi") == [(4,)]  # ilk satır da geri alındı
    with pytest.raises(ConstraintError, match="UNIQUE"):
        db.execute("UPDATE kisi SET eposta = 'ayni@x'")
    assert db.query("SELECT eposta FROM kisi WHERE id = 1") == [("a@x",)]
    with pytest.raises(ConstraintError, match=r"kisi\.id"):
        db.execute("UPDATE kisi SET id = 2 WHERE id = 1")
    assert db.execute("UPDATE kisi SET id = 10 WHERE id = 1").rowcount == 1
    assert db.query("SELECT ad FROM kisi WHERE id = 10") == [("Ayşe",)]
    assert db.execute("INSERT INTO kisi (ad) VALUES ('Yeni')").rowcount == 1
    assert db.query("SELECT id FROM kisi WHERE ad = 'Yeni'") == [(11,)]  # en büyük rowid + 1
    with pytest.raises(ConstraintError):
        db.execute("CREATE UNIQUE INDEX u ON siparis (kisi_id)")  # 1 iki kez var


def test_explain_shows_access_paths(db: Database) -> None:
    db.execute("CREATE INDEX kisi_yas ON kisi (yas)")
    plan = db.explain("SELECT ad FROM kisi WHERE yas BETWEEN 20 AND 35")
    assert any("IndexScan kisi USING kisi_yas" in line for line in plan)
    plan = db.explain("SELECT * FROM kisi WHERE eposta = 'a@x'")
    assert any("USING oto_kisi_eposta" in line for line in plan)  # UNIQUE'in kendi dizini
    plan = db.explain("SELECT * FROM kisi k JOIN siparis s ON k.id = s.kisi_id")
    assert any(line.strip().startswith("HashJoin INNER") for line in plan)
    plan = db.explain("SELECT * FROM kisi k JOIN siparis s ON k.id < s.kisi_id")
    assert any(line.strip().startswith("NestedLoopJoin INNER") for line in plan)
    plan = db.explain("DELETE FROM kisi WHERE yas = 3")
    assert plan[0] == "Delete kisi" and "IndexScan" in plan[-1]
    plan = db.explain("SELECT ad FROM kisi WHERE yas + 0 = 34")
    assert not any("IndexScan" in line for line in plan)  # ifade dizini kullanamaz


def test_volcano_model_pulls_only_what_limit_needs(monkeypatch: pytest.MonkeyPatch) -> None:
    db = Database()
    db.execute("CREATE TABLE sayi (n INTEGER)")
    for n in range(1000):
        db.execute("INSERT INTO sayi (n) VALUES (?)", [n])
    pulled = 0
    original_scan = Table.scan

    def counting_scan(self: Table):  # type: ignore[no-untyped-def]
        nonlocal pulled
        for item in original_scan(self):
            pulled += 1
            yield item

    monkeypatch.setattr(Table, "scan", counting_scan)
    assert db.query("SELECT n * 2 FROM sayi WHERE n % 2 = 1 LIMIT 3") == [(2,), (6,), (10,)]
    assert pulled <= 7  # 1000 satırın hepsi değil: üstteki Limit doyunca çekme durur


def test_schema_statements(db: Database) -> None:
    db.execute("CREATE TABLE IF NOT EXISTS kisi (x INTEGER)")  # var: sessizce geçer
    with pytest.raises(SqlError, match="zaten var"):
        db.execute("CREATE TABLE kisi (x INTEGER)")
    db.execute("DROP TABLE siparis")
    db.execute("DROP TABLE IF EXISTS siparis")
    with pytest.raises(SqlError, match="tablosu yok"):
        db.execute("DROP TABLE siparis")
    db.execute(
        "CREATE TABLE t (a INTEGER DEFAULT -1, b TEXT DEFAULT 'yok', c REAL DEFAULT (1 + 1))"
    )
    db.execute("INSERT INTO t (a) VALUES (5)")
    assert db.query("SELECT * FROM t") == [(5, "yok", 2.0)]


def test_cli_runs_a_script(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    script = tmp_path / "ornek.sql"
    script.write_text(
        "CREATE TABLE t (ad TEXT); INSERT INTO t VALUES ('Çiçek'), (NULL);\n"
        "SELECT ad, typeof(ad) FROM t;\n",
        encoding="utf-8",
    )
    assert cli_main([str(script)]) == 0
    output = capsys.readouterr().out
    assert "Çiçek | text" in output and "NULL" in output and "(2 satır)" in output
    script.write_text("SELECT * FROM yok;", encoding="utf-8")
    assert cli_main([str(script)]) == 1
