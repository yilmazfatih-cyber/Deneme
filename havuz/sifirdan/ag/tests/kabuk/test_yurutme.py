"""Kabuk yürütme testleri (geçici dizinde; Unix araçlarıyla): yönlendirme, boru, && ||, işler,
yerleşikler.
"""

from __future__ import annotations

import os
import sys
from collections.abc import Iterator
from pathlib import Path

import pytest

from kabuk import Shell, run_lines

pytestmark = pytest.mark.skipif(sys.platform == "win32", reason="Unix kabuk araçları gerekir")
PY = sys.executable


@pytest.fixture
def shell(tmp_path: Path) -> Iterator[Shell]:
    sh = Shell(
        cwd=tmp_path, env={"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": str(tmp_path)}
    )
    yield sh
    sh.close()


def read(shell: Shell, name: str) -> str:
    return (shell.cwd / name).read_text(encoding="utf-8")


def test_yonlendirmeler(shell: Shell) -> None:
    assert shell.run("echo ilk satır > dosya.txt") == 0
    shell.run("echo ikinci >> dosya.txt")
    assert read(shell, "dosya.txt") == "ilk satır\nikinci\n"
    shell.run("cat < dosya.txt > kopya.txt")
    assert read(shell, "kopya.txt") == read(shell, "dosya.txt")
    shell.run("ls yok-dosya 2> hata.txt")
    assert "yok-dosya" in read(shell, "hata.txt")
    shell.run(
        f"{PY} -c \"import sys; print('çıktı'); print('hata', file=sys.stderr)\" > ikisi.txt 2>&1"
    )
    assert sorted(read(shell, "ikisi.txt").split()) == ["hata", "çıktı"]
    shell.run(f"{PY} -c \"import sys; print('e', file=sys.stderr)\" &> hepsi.txt")
    assert read(shell, "hepsi.txt") == "e\n"
    assert shell.run("cat < yok.txt") == 1


def test_boru_hatti(shell: Shell) -> None:
    (shell.cwd / "isimler.txt").write_text("zeynep\nali\nçağla\nali\n", encoding="utf-8")
    shell.run("cat isimler.txt | sort | uniq | wc -l > sayi.txt")
    assert read(shell, "sayi.txt").strip() == "3"
    shell.run(f"{PY} -c \"import sys; print('boruya', file=sys.stderr)\" 2>&1 | cat > boru.txt")
    assert read(shell, "boru.txt") == "boruya\n"  # 2>&1 borunun yazma ucuna bağlanır
    shell.run("pwd | cat > pwd.txt")  # yerleşik de boruya yazabilir
    assert read(shell, "pwd.txt").strip() == str(shell.cwd)


def test_kosullu_zincir_ve_cikis_kodlari(shell: Shell) -> None:
    assert shell.run("true && echo evet > a.txt || echo hayır > b.txt") == 0
    assert (shell.cwd / "a.txt").exists() and not (shell.cwd / "b.txt").exists()
    assert shell.run("false && echo x > c.txt") == 1
    assert not (shell.cwd / "c.txt").exists()
    assert shell.run("false || echo kurtardı > d.txt") == 0
    shell.run(f"{PY} -c 'raise SystemExit(7)'; echo $? > kod.txt")
    assert read(shell, "kod.txt") == "7\n"
    assert shell.run("olmayan-komut-xyz") == 127
    (shell.cwd / "betik").write_text("#!/bin/sh\necho x\n")
    assert shell.run("./betik") == 126  # çalıştırma izni yok
    assert shell.run("false | true") == 0  # boru hattının kodu son komutun kodudur
    assert shell.run("echo 'kapanmamış") == 2


def test_degiskenler_ve_disa_aktarma(shell: Shell) -> None:
    show = f"{PY} -c \"import os; print(os.environ.get('RENK', '-'))\""
    shell.run("RENK=mavi")
    shell.run(f"{show} > 1.txt")
    assert read(shell, "1.txt") == "-\n"  # dışa aktarılmadı: çocuk görmez
    shell.run(f"export RENK; {show} > 2.txt")
    assert read(shell, "2.txt") == "mavi\n"
    shell.run(f"RENK=kırmızı {show} > 3.txt; echo $RENK > 4.txt")
    assert (read(shell, "3.txt"), read(shell, "4.txt")) == (
        "kırmızı\n",
        "mavi\n",
    )  # yalnız o komut için
    shell.run("unset RENK")
    shell.run(f"{show} > 5.txt")
    assert read(shell, "5.txt") == "-\n"


def test_enjeksiyon_yapilamaz(shell: Shell) -> None:
    shell.run("KOTU='; touch ele-gecirildi'")
    shell.run("echo $KOTU > cikti.txt")
    assert not (shell.cwd / "ele-gecirildi").exists()
    assert read(shell, "cikti.txt") == "; touch ele-gecirildi\n"


def test_cd_pwd_ve_glob(shell: Shell) -> None:
    (shell.cwd / "alt").mkdir()
    (shell.cwd / "alt" / "b.txt").write_text("")
    (shell.cwd / "alt" / "a.txt").write_text("")
    assert shell.run("cd alt") == 0
    shell.run("echo *.txt > liste")
    assert read(shell, "liste") == "a.txt b.txt\n"  # glob, yönlendirme dosyayı açmadan önce açılır
    shell.run("cd -")
    assert shell.cwd.name != "alt"
    assert shell.run("cd yok-dizin") == 1
    shell.run("cd ~")
    assert shell.cwd == Path(shell.env["HOME"]).resolve()


def test_arka_plan_isleri(shell: Shell) -> None:
    shell.run(f"{PY} -c \"import time; time.sleep(0.2); open('bitti.txt', 'w').write('tamam')\" &")
    assert len(shell.jobs) == 1
    assert not (shell.cwd / "bitti.txt").exists()  # beklemeden döndü
    shell.run("jobs > isler.txt")
    assert "[1] Çalışıyor" in read(shell, "isler.txt")
    assert shell.run("wait") == 0
    assert read(shell, "bitti.txt") == "tamam" and not shell.jobs


def test_exit_ve_betik(shell: Shell) -> None:
    lines = ["echo bir > s.txt", "exit 3", "echo iki >> s.txt"]
    assert run_lines(lines, shell) == 3
    assert read(shell, "s.txt") == "bir\n"
