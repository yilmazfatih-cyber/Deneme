"""Komut satırı (exam/cli.py) testleri: Türkçe yardım ve hatalar, liste, rapor, güvenlik ve hazırla→puanla hattı.

Hazırla→puanla hattı bağımlılık kurmadan (`--kurma`) gerçek bir görevle sınanır: bütünlük temiz, gizli test
kalır (ortam yok) → KALDI; korunan test silinince → GEÇERSİZ.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from exam import results
from exam.cli import build_parser, main
from exam.grade import grade
from exam.paths import repo_root
from exam.prepare import PrepareError, prepare
from exam.tasks import all_tasks, find_task


def test_yardim_turkce(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit):
        build_parser().parse_args(["--yardim"])
    out = capsys.readouterr().out
    assert "Kullanım:" in out
    assert "hazirla" in out
    assert "show this help" not in out


def test_eksik_arguman_turkce_hata(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit) as raised:
        build_parser().parse_args(["puanla"])
    assert raised.value.code == 2
    assert "şu argümanlar gerekli" in capsys.readouterr().err


def test_liste_butun_gorevleri_gosterir(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["liste"]) == 0
    out = capsys.readouterr().out
    for task in all_tasks():
        assert task.id in out
    assert "kolay" in out


def test_bilinmeyen_gorev_yol_gosterir(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["hazirla", "boyle-bir-gorev-yok", "/tmp/x"]) == 2
    assert "Bilinenler" in capsys.readouterr().err


def test_depo_icinde_gorev_klasoru_reddedilir() -> None:
    with pytest.raises(PrepareError, match="deponun içinde"):
        prepare(find_task("veri-bas-harfler"), repo_root() / "sinav-deneme-klasoru", install=False)


def test_bos_olmayan_hedef_reddedilir(tmp_path: Path) -> None:
    (tmp_path / "dolu").mkdir()
    (tmp_path / "dolu" / "x.txt").write_text("x", encoding="utf-8")
    with pytest.raises(PrepareError, match="boş değil"):
        prepare(find_task("veri-bas-harfler"), tmp_path / "dolu", install=False)


def test_rapor_bos(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["rapor"]) == 0
    assert "Henüz sonuç yok" in capsys.readouterr().out


def test_hazirla_puanla_hatti_kurulumsuz(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    folder = tmp_path / "gorev"
    record = prepare(
        find_task("veri-bas-harfler"), folder, install=False, git=False, echo=lambda _: None
    )
    assert (folder / "GOREV.md").is_file()
    assert (folder / "veri" / "verihavuzu" / "text.py").is_file()
    text = (folder / "GOREV.md").read_text(encoding="utf-8")
    assert "Bu depoda veri içinde çalışacaksın" in text
    assert "<temel" not in text
    assert "<ör." not in text

    clean = grade(folder, stop_early=True, echo=lambda _: None)
    assert clean.integrity.ok
    assert clean.verdict == "kaldi"
    assert clean.diff.toplam_dosya == 0

    (record.copy_root / "tests" / "test_text.py").unlink()
    (record.copy_root / "yeni.py").write_text('"""yeni"""\n', encoding="utf-8")
    cheated = grade(folder, stop_early=True, echo=lambda _: None)
    assert cheated.verdict == "gecersiz"
    assert cheated.diff.toplam_dosya == 2

    assert main(["puanla", str(folder), "--etiket", "deneme-model", "--dur", "--sure", "12"]) == 1
    out = capsys.readouterr().out
    assert "GEÇERSİZ" in out
    entries = results.all_entries()
    assert len(entries) == 1
    assert entries[0]["sonuc"] == "gecersiz"
    assert entries[0]["sure_dk"] == 12.0
    assert entries[0]["sure_kaynagi"] == "girilen"
