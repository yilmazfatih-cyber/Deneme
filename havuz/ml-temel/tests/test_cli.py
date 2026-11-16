"""Komut satırı uçtan uca: egit → tahmin → degerlendir → rapor (geçici klasörde, çevrimdışı)."""

from __future__ import annotations

from pathlib import Path

import pytest

from ml_temel.ortak.table import Table
from ml_temel.tablo.cli import main
from ml_temel.tablo.csv_reader import CsvFormat, read_csv, write_csv
from ml_temel.veri import make_churn_table


@pytest.fixture
def churn_csv(tmp_path: Path) -> Path:
    table = make_churn_table(600, random_state=5)
    return write_csv(table, tmp_path / "musteri.csv", CsvFormat("utf-8-sig", ";", ","))


def test_full_cycle(churn_csv: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    out = tmp_path / "cikti"
    code = main(
        [
            "egit",
            "--veri",
            str(churn_csv),
            "--hedef",
            "kayip",
            "--hizli",
            "--html",
            "--modeller",
            "dogrusal,artirma",
            "--zaman",
            "kayit_tarihi",
            "--cikti",
            str(out),
        ]
    )
    assert code == 0
    for name in ("model.npz", "rapor.md", "model_karti.md", "metrikler.json", "rapor.html"):
        assert (out / name).exists(), name
    report = (out / "rapor.md").read_text(encoding="utf-8")
    assert "Zamana göre" in report
    assert "## Sınama sonuçları" in report
    assert "<svg" in (out / "rapor.html").read_text(encoding="utf-8")

    table, _ = read_csv(churn_csv)
    new_rows = Table({name: table[name][:20] for name in table.names if name != "kayip"})
    new_csv = write_csv(new_rows, tmp_path / "yeni.csv", CsvFormat("utf-8-sig", ";", ","))
    assert (
        main(["tahmin", "--model", str(out / "model.npz"), "--veri", str(new_csv), "--esik", "0.3"])
        == 0
    )
    predicted, fmt = read_csv(tmp_path / "yeni_tahmin.csv")
    assert fmt.delimiter == ";"
    assert len(predicted) == 20
    assert set(predicted["tahmin"].tolist()) <= {"evet", "hayır"}
    assert ((predicted["olasilik_evet"] >= 0.3) == (predicted["tahmin"] == "evet")).all()

    capsys.readouterr()
    assert main(["degerlendir", "--model", str(out / "model.npz"), "--veri", str(churn_csv)]) == 0
    assert "ROC-AUC" in capsys.readouterr().out
    assert (
        main(["rapor", "--model", str(out / "model.npz"), "--cikti", str(tmp_path / "r.md")]) == 0
    )
    assert (tmp_path / "r.md").read_text(encoding="utf-8").splitlines()[4:] == report.splitlines()[
        4:
    ]


def test_errors_are_turkish_and_return_code_two(
    churn_csv: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert main(["egit", "--veri", str(churn_csv), "--hedef", "yok"]) == 2
    error = capsys.readouterr().err
    assert "adlı sütun yok" in error
    assert "İpucu" in error
    assert main(["tahmin", "--model", str(tmp_path / "yok.npz"), "--veri", str(churn_csv)]) == 2
    assert "bulunamadı" in capsys.readouterr().err
    fake = tmp_path / "sahte.npz"
    fake.write_bytes(b"bu bir model degil")
    assert main(["rapor", "--model", str(fake)]) == 2
