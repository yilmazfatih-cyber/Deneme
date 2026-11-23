"""Komut satırı: liste ve bicim çalışır; yanlış kullanımda yol gösteren ileti ve çıkış kodu 2.

Gerçek kurulum yapan `kur`/`dogrula` burada koşmaz (uzun ve ağ ister): `python tarif.py dogrula …`.
Genişletme: yeni alt komut → burada bir çağrı testi.
"""

from __future__ import annotations

from pathlib import Path

import pytest

import tarif
from tarifcik.kurulum import komut_ayir, python_kur_komutlari


def test_liste_butun_tarifleri_yazar(capsys: pytest.CaptureFixture[str]) -> None:
    assert tarif.main(["liste"]) == 0
    cikti = capsys.readouterr().out
    assert "belgeye-soru-uygulamasi" in cikti
    assert "tarif." in cikti


def test_bicim_yesil(capsys: pytest.CaptureFixture[str]) -> None:
    assert tarif.main(["bicim"]) == 0
    assert "tutuyor" in capsys.readouterr().out


def test_bilinmeyen_tarif_yol_gosterir(capsys: pytest.CaptureFixture[str], tmp_path: Path) -> None:
    assert tarif.main(["kur", "olmayan-tarif", str(tmp_path / "x")]) == 2
    assert "Bilinenler" in capsys.readouterr().err


def test_dogrula_tarifsiz_kullanim_hatasi(capsys: pytest.CaptureFixture[str]) -> None:
    assert tarif.main(["dogrula"]) == 2
    assert "--hepsi" in capsys.readouterr().err


def test_kur_dolu_hedefi_reddeder(capsys: pytest.CaptureFixture[str], tmp_path: Path) -> None:
    (tmp_path / "dosya.txt").write_text("x", encoding="utf-8")
    assert tarif.main(["kur", "csvden-tahmin-servisi", str(tmp_path)]) == 2
    assert "boş değil" in capsys.readouterr().err


def test_komut_ayir_ortam_atamalarini_ayirir() -> None:
    assert komut_ayir('YZ_E2E=1 A="b c" python -m pytest tests/e2e') == (
        ["python", "-m", "pytest", "tests/e2e"],
        {"YZ_E2E": "1", "A": "b c"},
    )
    assert komut_ayir("npm run check") == (["npm", "run", "check"], {})


def test_python_kur_komutlari_kilit_onceligi(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("shutil.which", lambda _ad: "/usr/bin/uv")
    (tmp_path / "uv.lock").write_text("", encoding="utf-8")
    assert python_kur_komutlari(tmp_path, ["dev", "analiz"]) == [
        ["/usr/bin/uv", "sync", "--frozen", "--extra", "dev", "--extra", "analiz"]
    ]
    (tmp_path / "uv.lock").unlink()
    (tmp_path / "requirements.lock").write_text("", encoding="utf-8")
    komutlar = python_kur_komutlari(tmp_path, ["dev"])
    assert komutlar[0][:3] == ["/usr/bin/uv", "venv", ".venv"]
    assert komutlar[1][-2:] == ["-r", "requirements.lock"]
    assert komutlar[2][-3:] == ["--no-deps", "-e", "."]
    monkeypatch.setattr("shutil.which", lambda _ad: None)
    (tmp_path / "requirements.lock").unlink()
    komutlar = python_kur_komutlari(tmp_path, ["dev"])
    assert komutlar[-1][-2:] == ["-e", ".[dev]"]
