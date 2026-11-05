import json
import sqlite3
from pathlib import Path

from text2sql.cli import format_table, main

ROOT = Path(__file__).resolve().parents[1]


def test_sor_on_example_db_prints_table(dukkan_db, capsys):
    rc = main(["sor", "--backend", "sahte", "--db", dukkan_db, "En pahalı 3 ürün hangisi?"])
    out = capsys.readouterr().out
    assert rc == 0
    assert "SELECT ad, fiyat FROM urunler ORDER BY fiyat DESC LIMIT 3;" in out
    assert "Yün battaniye" in out and "(3 satır)" in out


def test_sor_json(dukkan_db, capsys):
    rc = main(["sor", "--backend", "fake", "--db", dukkan_db, "--json", "Kaç müşteri var?"])
    data = json.loads(capsys.readouterr().out)
    assert rc == 0
    assert data["sutunlar"] == ["musteri_sayisi"] and data["satirlar"] == [[20]] and data["kesildi"] is False


def test_sor_sadece_sql_does_not_execute(dukkan_db, capsys, monkeypatch):
    monkeypatch.setenv("TEXT2SQL_BACKEND", "fake")
    rc = main(["sor", "--db", dukkan_db, "--sadece-sql", "Hiç sipariş vermemiş müşteriler kimler?"])
    out = capsys.readouterr().out
    assert rc == 0 and out.startswith("SELECT m.ad, m.soyad") and "Mehmet" not in out


def test_sor_refuses_write_exit_3(dukkan_db, capsys, monkeypatch):
    from text2sql import backends

    monkeypatch.setattr(backends.FakeBackend, "_default", staticmethod(lambda m: "```sql\nDROP TABLE urunler;\n```"))
    rc = main(["sor", "--backend", "sahte", "--db", dukkan_db, "ürünleri sil"])
    err = capsys.readouterr().err
    assert rc == 3 and "--yaz" in err and "(DROP)" in err and "Reddedilen SQL:\n  DROP TABLE urunler" in err
    rc = main(["sor", "--backend", "sahte", "--db", dukkan_db, "--sadece-sql", "ürünleri sil"])
    cap = capsys.readouterr()
    assert rc == 0 and cap.out.strip() == "DROP TABLE urunler;" and "--yaz" in cap.err
    assert sqlite3.connect(dukkan_db).execute("SELECT COUNT(*) FROM urunler").fetchone() == (15,)


def test_missing_db_exit_2(tmp_path, capsys):
    rc = main(["sor", "--backend", "sahte", "--db", str(tmp_path / "yok.sqlite"), "soru"])
    assert rc == 2 and "bulunamadı" in capsys.readouterr().err


def test_sema_and_bilgi(dukkan_db, capsys):
    assert main(["sema", "--db", dukkan_db, "--ornek-satir", "0"]) == 0
    out = capsys.readouterr().out
    assert "CREATE TABLE siparis_kalemleri" in out and "REFERENCES siparisler(id)" in out
    assert main(["bilgi", "--backend", "sahte"]) == 0
    out = capsys.readouterr().out
    assert "qwen2.5-coder:1.5b" in out and "Öneri:" in out and "GPU:" in out


def test_bilgi_reports_ollama_down(capsys, monkeypatch):
    monkeypatch.setenv("OLLAMA_HOST", "http://127.0.0.1:9")  # kapalı port
    assert main(["bilgi"]) == 0
    assert "yanıt yok" in capsys.readouterr().out


def test_sohbet_keeps_history(dukkan_db, capsys, monkeypatch):
    from text2sql import backends

    seen = []
    orig = backends.FakeBackend.chat

    def spy(self, messages):
        seen.append(messages)
        return orig(self, messages)

    monkeypatch.setattr(backends.FakeBackend, "chat", spy)
    answers = iter(["Kaç müşteri var?", "", "Stokta kalmayan ürünler hangileri?", "çık"])
    monkeypatch.setattr("builtins.input", lambda prompt="": next(answers))
    assert main(["sohbet", "--backend", "sahte", "--db", dukkan_db]) == 0
    out = capsys.readouterr().out
    assert "20" in out and "Fındık ezmesi" in out
    assert len(seen) == 2 and any(m["content"] == "Question: Kaç müşteri var?" for m in seen[1])


def test_ornek_db_command(tmp_path, capsys):
    out = tmp_path / "x" / "dukkan.sqlite"
    assert main(["ornek-db", "--cikti", str(out)]) == 0
    assert out.is_file() and "siparis_kalemleri" in capsys.readouterr().out
    assert main(["ornek-db", "--cikti", str(out)]) == 0
    assert "Zaten var" in capsys.readouterr().out


def test_degerlendir_with_scripted_answers(dukkan_db, capsys, monkeypatch, tmp_path):
    from text2sql import backends
    from text2sql.examples import bundled_examples

    pairs = dict(bundled_examples())
    wrong = "Kaç müşteri var?"

    def respond(messages):
        q = messages[-1]["content"].removeprefix("Question: ")
        if q == wrong:
            return "```sql\nSELECT COUNT(*) FROM urunler;\n```"
        # sütun sırası farklı, sonuç aynı: doğru sayılmalı
        if q.startswith("En pahalı"):
            return "```sql\nSELECT fiyat, ad FROM urunler ORDER BY fiyat DESC LIMIT 3\n```"
        return f"```sql\n{pairs[q]}\n```"

    monkeypatch.setattr(backends.FakeBackend, "_default", staticmethod(respond))
    report = tmp_path / "rapor.json"
    rc = main(["degerlendir", "--backend", "sahte", "--db", dukkan_db, "--json", str(report)])
    out = capsys.readouterr().out
    assert rc == 0 and "Puan: 9/10" in out and "yanlış" in out
    data = json.loads(report.read_text(encoding="utf-8"))
    assert [r["ok"] for r in data].count(False) == 1


def test_format_table_alignment():
    t = format_table(["ad", "fiyat"], [("Çay", 185.0), ("Bal", None)])
    lines = t.splitlines()
    assert lines[0] == "ad  | fiyat" and lines[2] == "Çay |   185" and lines[3] == "Bal |  NULL"


def test_model_flag_accepts_profile_name(capsys):
    assert main(["bilgi", "--backend", "sahte", "--model", "slm-sql"]) == 0
    out = capsys.readouterr().out
    assert "text2sql-slm" in out and "hf.co/frizynn/SLM-SQL-1.5B-GGUF:Q4_K_M" in out
    assert main(["bilgi", "--backend", "sahte", "--profil", "prem"]) == 0
    assert "Modelfile.prem" in capsys.readouterr().out


def test_postgres_without_db_extra_gives_clear_message(capsys, monkeypatch):
    import sys

    monkeypatch.setitem(sys.modules, "sqlalchemy", None)  # kurulu değilmiş gibi
    rc = main(["sor", "--backend", "sahte", "--db", "postgresql://u@localhost/vt", "soru"])
    assert rc == 2 and 'pip install -e ".[db]"' in capsys.readouterr().err


def test_mismatched_lehce_on_sqlite_still_runs(dukkan_db, capsys):
    rc = main(["sor", "--backend", "sahte", "--db", dukkan_db, "--lehce", "postgresql", "Kaç müşteri var?"])
    out = capsys.readouterr().out
    assert rc == 0 and "20" in out
