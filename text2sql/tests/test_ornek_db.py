import sqlite3
from pathlib import Path

from conftest import load_builder

from text2sql.examples import bundled_examples, load_examples, parse_examples
from text2sql.run import execute

ROOT = Path(__file__).resolve().parents[1]
TABLES = {"sehirler", "musteriler", "urunler", "siparisler", "siparis_kalemleri"}


def test_builder_creates_expected_tables(tmp_path):
    counts = load_builder().build(tmp_path / "d.sqlite")
    assert set(counts) == TABLES
    assert counts["sehirler"] == 8 and counts["musteriler"] == 20 and counts["urunler"] == 15
    assert counts["siparisler"] == 30 and 30 <= counts["siparis_kalemleri"] <= 90
    con = sqlite3.connect(tmp_path / "d.sqlite")
    assert con.execute("PRAGMA foreign_key_check").fetchall() == []
    assert con.execute("SELECT ad FROM sehirler WHERE id = 1").fetchone() == ("İstanbul",)


def test_builder_is_deterministic(tmp_path):
    b = load_builder()
    b.build(tmp_path / "a.sqlite")
    b.build(tmp_path / "b.sqlite")
    dump = lambda p: list(sqlite3.connect(p).iterdump())  # noqa: E731
    assert dump(tmp_path / "a.sqlite") == dump(tmp_path / "b.sqlite")


def test_committed_example_db_matches_builder(tmp_path):
    committed = ROOT / "ornek" / "dukkan.sqlite"
    if not committed.exists():  # depoda yoksa kurulum betiği oluşturur
        return
    load_builder().build(tmp_path / "yeni.sqlite")
    assert list(sqlite3.connect(committed).iterdump()) == list(sqlite3.connect(tmp_path / "yeni.sqlite").iterdump())


def test_ten_example_questions_all_execute(dukkan_db):
    pairs = load_examples(ROOT / "ornek" / "sorular.md")
    assert len(pairs) == 10
    assert pairs == list(bundled_examples())
    for question, sql in pairs:
        assert question and sql.upper().startswith(("SELECT", "WITH"))
        res = execute(dukkan_db, sql)
        assert res.rows, f"boş sonuç: {question}"
    # birkaç bilinen yanıt
    answers = {q: execute(dukkan_db, s).rows for q, s in pairs}
    assert answers["Kaç müşteri var?"] == [(20,)]
    assert sorted(answers["Stokta kalmayan ürünler hangileri?"]) == [("Fındık ezmesi",), ("Masa lambası",)]
    assert len(answers["Hiç sipariş vermemiş müşteriler kimler?"]) >= 2


def test_parse_examples_format():
    md = "# Başlık\n\nmetin\n\n## 1. Bir?\n\n```sql\nSELECT 1;\n```\n\n### İki?\n```SQL\nSELECT 2\n```\n## Boş\nsql yok\n"
    assert parse_examples(md) == [("Bir?", "SELECT 1;"), ("İki?", "SELECT 2")]
