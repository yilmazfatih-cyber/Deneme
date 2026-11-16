"""Komut satırı ve REPL testleri (girdi/çıktı işlevleri dışarıdan verilir)."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest

from yorumlayici.__main__ import main, repl
from yorumlayici.interp import Limits


def feed(lines: list[str]) -> tuple[str, int]:
    """REPL'e satırları sırayla verir; çıktıyı ve çıkış kodunu döndürür."""
    source: Iterator[str] = iter(lines)
    out: list[str] = []

    def read(prompt: str) -> str:
        out.append(prompt)
        try:
            return next(source)
        except StopIteration:
            raise EOFError from None

    code = repl(read, out.append, Limits())
    return "".join(out), code


def test_repl_echoes_expression_values_and_keeps_state() -> None:
    text, code = feed(["değişken x = 20", "x + 22", '"metin"', "yazdır(x)"])
    assert code == 0
    assert ">>> 42\n" in text
    assert '>>> "metin"\n' in text
    assert ">>> 20\n" in text


def test_repl_asks_for_continuation_lines() -> None:
    text, _ = feed(["işlev kare(n) {", "döndür n * n", "}", "kare(7)"])
    assert "... " in text
    assert "49\n" in text


def test_repl_reports_errors_and_continues() -> None:
    text, _ = feed(["yazdır(yok_böyle)", "1 + 1"])
    assert "Kapsam hatası (satır 1, sütun 8)" in text
    assert "^" in text
    assert ">>> 2\n" in text


def test_repl_quit_command() -> None:
    _text, code = feed([":çık", "yazdır(1)"])
    assert code == 0


def test_cli_runs_code_and_file(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["kod", "yazdır(1 + 2)"]) == 0
    program = tmp_path / "p.tohum"
    program.write_text('yazdır("dosyadan")', encoding="utf-8")
    assert main(["calistir", str(program)]) == 0
    assert capsys.readouterr().out == "3\ndosyadan\n"


def test_cli_tree_and_errors(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["kod", "yazdır(1 / 0)"]) == 1
    assert "Çalışma hatası" in capsys.readouterr().err
    assert main(["--adim", "100", "kod", "iken doğru { }"]) == 1
    assert "adım sınırı" in capsys.readouterr().err


def test_cli_tree_prints_ast(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    program = tmp_path / "a.tohum"
    program.write_text("değişken x = 1 + 2", encoding="utf-8")
    assert main(["agac", str(program)]) == 0
    assert capsys.readouterr().out == "(değişken x (+ 1 2))\n"


def test_cli_missing_file(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["calistir", "yok_boyle_dosya.tohum"]) == 2
    assert "Dosya bulunamadı" in capsys.readouterr().err
