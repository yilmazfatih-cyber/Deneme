"""Sözcük farkı, üç yollu birleştirme ve komut satırı testleri."""

from __future__ import annotations

from pathlib import Path

import pytest
from hypothesis import given
from hypothesis import strategies as st

from fark import merge, word_diff, word_diff_html
from fark.__main__ import main

TEXT = st.lists(st.sampled_from(["a\n", "b\n", "c\n", "ç\n"]), max_size=10).map("".join)


def test_word_diff_markers_and_turkish_words() -> None:
    assert word_diff("Bugün hava çok güzel.", "Bugün gökyüzü çok güzel!") == (
        "Bugün [-hava-]{+gökyüzü+} çok güzel[-.-]{+!+}"
    )
    assert word_diff("ağaç", "ağaçlar") == "[-ağaç-]{+ağaçlar+}"
    assert word_diff("aynı", "aynı") == "aynı"


def test_word_diff_html_escapes_content() -> None:
    assert word_diff_html("<b>eski</b>", "<b>yeni</b>") == (
        "&lt;b&gt;<del>eski</del><ins>yeni</ins>&lt;/b&gt;"
    )


def test_merge_non_overlapping_changes_merge_cleanly() -> None:
    base = "bir\niki\nüç\ndört\nbeş\n"
    ours = "BİR\niki\nüç\ndört\nbeş\n"
    theirs = "bir\niki\nüç\ndört\nBEŞ\n"
    result = merge(base, ours, theirs)
    assert (result.text, result.conflicts) == ("BİR\niki\nüç\ndört\nBEŞ\n", 0)


def test_merge_conflict_markers() -> None:
    result = merge("a\nb\nc\n", "a\nB1\nc\n", "a\nB2\nc\n")
    assert result.conflicts == 1
    assert result.text == "a\n<<<<<<< bizim\nB1\n=======\nB2\n>>>>>>> onların\nc\n"
    with_base = merge("a\nb\nc\n", "a\nB1\nc\n", "a\nB2\nc\n", show_base=True)
    assert "||||||| ortak\nb\n=======" in with_base.text


def test_merge_same_change_and_deletion() -> None:
    assert merge("a\nb\n", "a\nX\n", "a\nX\n").text == "a\nX\n"
    assert merge("a\nb\nc\n", "a\nc\n", "a\nb\nc\n").text == "a\nc\n"  # yalnız biz sildik
    deleted_vs_changed = merge("a\nb\nc\n", "a\nc\n", "a\nB\nc\n")
    assert deleted_vs_changed.conflicts == 1


@given(TEXT, TEXT)
def test_merge_identities(base: str, other: str) -> None:
    assert merge(base, base, other).text == other
    assert merge(base, other, base).text == other
    same = merge(base, other, other)
    assert (same.text, same.conflicts) == (other, 0)


def test_cli(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    old, new = tmp_path / "eski.txt", tmp_path / "yeni.txt"
    old.write_text("bir\niki\n", encoding="utf-8")
    new.write_text("bir\nüç\n", encoding="utf-8")
    patch = tmp_path / "yama.diff"
    assert main(["karsilastir", str(old), str(old)]) == 0
    assert main(["karsilastir", str(old), str(new)]) == 1
    patch.write_text(capsys.readouterr().out, encoding="utf-8")
    out = tmp_path / "sonuc.txt"
    assert main(["uygula", str(old), str(patch), "-o", str(out)]) == 0
    assert out.read_text(encoding="utf-8") == "bir\nüç\n"
    assert main(["uygula", str(new), str(patch), "--ters"]) == 0
    assert main(["uygula", str(new), str(patch)]) == 1
    assert main(["kelime", str(old), str(new)]) == 0
    base, ours, theirs = (tmp_path / n for n in ("o.txt", "b.txt", "t.txt"))
    base.write_text("a\nb\n", encoding="utf-8")
    ours.write_text("a\nB\n", encoding="utf-8")
    theirs.write_text("a\nC\n", encoding="utf-8")
    assert main(["birlestir", str(base), str(ours), str(theirs)]) == 1
    assert main(["karsilastir", str(tmp_path / "yok"), str(new)]) == 2
    captured = capsys.readouterr()
    assert "bir\n[-iki-]{+üç+}\n" in captured.out
    assert "<<<<<<< bizim" in captured.out
    assert "Yama hatası" in captured.err and "1 çakışma" in captured.err
